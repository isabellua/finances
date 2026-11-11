"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Card, Empty, Field, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { formatBRL } from "@/lib/money";
import { applyMapping, guessMapping, toTable, type CsvMapping, type CsvTable } from "@/lib/import/csv";
import { buildHashes } from "@/lib/import/hash";
import { matchRule, merchantKey, type Rule } from "@/lib/import/merchant";
import { looksLikeOFX, parseOFX } from "@/lib/import/ofx";
import type { ParsedRow } from "@/lib/import/types";
import { checkDuplicates, importTransactions } from "./actions";

type Target = { key: string; label: string; isCard: boolean };
type Cat = { id: string; name: string };

type Row = ParsedRow & {
  hash: string;
  selected: boolean;
  categoryId: string;
  catTouched: boolean;
  remember: boolean;
  /** Motivo de a linha estar desmarcada ou bloqueada. */
  note: string | null;
  blocked: boolean;
};

const MAX_BYTES = 5 * 1024 * 1024;

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Exportações antigas de banco costumam vir em Windows-1252/ISO-8859-1.
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportWizard({
  targets,
  categories,
  rules,
}: {
  targets: Target[];
  categories: Cat[];
  rules: Rule[];
}) {
  const [target, setTarget] = useState(targets[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const isCard = targets.find((t) => t.key === target)?.isCard ?? false;

  function reset() {
    setTable(null);
    setMapping(null);
    setRows(null);
    setResult(null);
    setError(null);
    setWarnings([]);
  }

  async function buildPreview(parsed: ParsedRow[]) {
    if (parsed.length === 0) {
      setError("Nenhuma linha válida encontrada.");
      return;
    }
    const hashes = await buildHashes(target, parsed);
    const check = await checkDuplicates({
      target,
      rows: parsed.map((r, i) => ({ hash: hashes[i], date: r.date, cents: Math.abs(r.amountCents) })),
    });
    if ("error" in check) {
      setError(check.error);
      return;
    }
    const hashDup = new Set(check.hashDup);
    const softDup = new Set(check.softDup);

    setRows(
      parsed.map((r, i) => {
        const hit = matchRule(r.description, rules);
        const cardCredit = isCard && r.amountCents > 0;
        const dup = hashDup.has(hashes[i]);
        const soft = softDup.has(hashes[i]);
        const note = cardCredit
          ? "Crédito no cartão (pagamento ou estorno): não é importado"
          : dup
            ? "Já importada antes"
            : soft
              ? "Parece um lançamento manual já feito"
              : null;
        return {
          ...r,
          hash: hashes[i],
          selected: !note,
          categoryId: hit?.category_id ?? "",
          catTouched: false,
          remember: false,
          note,
          blocked: cardCredit,
        };
      }),
    );
  }

  async function onFile(file: File) {
    reset();
    if (file.size > MAX_BYTES) {
      setError("Arquivo grande demais (máximo 5 MB).");
      return;
    }
    const text = await readText(file);

    if (looksLikeOFX(text)) {
      const r = parseOFX(text);
      const w = [...r.warnings];
      if (r.isCreditCard !== isCard) {
        w.push(
          r.isCreditCard
            ? "Este OFX parece ser de cartão de crédito, mas o destino escolhido é uma conta."
            : "Este OFX parece ser de conta, mas o destino escolhido é um cartão.",
        );
      }
      setWarnings(w);
      await buildPreview(r.rows);
      return;
    }

    const t = toTable(text);
    if (t.headers.length < 2 || t.rows.length === 0) {
      setError("Não consegui ler o arquivo como OFX nem como CSV.");
      return;
    }
    const m = guessMapping(t.headers);
    // Faturas de cartão em CSV costumam trazer compras como números positivos.
    if (isCard && m.amount !== null) {
      const vals = applyMapping(t, m).rows;
      const pos = vals.filter((v) => v.amountCents > 0).length;
      if (pos > vals.length / 2) m.invert = true;
    }
    setTable(t);
    setMapping(m);
  }

  const csvPreview = useMemo(
    () => (table && mapping ? applyMapping(table, mapping) : null),
    [table, mapping],
  );

  function setCategory(index: number, categoryId: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const key = merchantKey(prev[index].description);
      return prev.map((r, i) => {
        if (i === index) return { ...r, categoryId, catTouched: true, remember: !!categoryId && key !== "" };
        if (key !== "" && !r.catTouched && !r.categoryId && merchantKey(r.description) === key) {
          return { ...r, categoryId };
        }
        return r;
      });
    });
  }

  function confirm() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.selected && !r.blocked);
    if (chosen.length === 0) return;
    setError(null);
    startBusy(async () => {
      let inserted = 0;
      let skipped = 0;
      for (let i = 0; i < chosen.length; i += 500) {
        const part = chosen.slice(i, i + 500);
        const res = await importTransactions({
          target,
          rows: part.map((r) => ({
            date: r.date,
            description: r.description,
            cents: Math.abs(r.amountCents),
            kind: r.amountCents < 0 ? ("expense" as const) : ("income" as const),
            categoryId: r.categoryId || null,
            hash: r.hash,
            remember: r.remember,
            pattern: merchantKey(r.description),
          })),
        });
        if ("error" in res) {
          setError(
            `${res.error}${inserted > 0 ? ` Já importadas antes do erro: ${inserted}. Reimportar o mesmo arquivo não duplica.` : ""}`,
          );
          return;
        }
        inserted += res.inserted;
        skipped += res.skipped;
      }
      setResult({ inserted, skipped });
      setRows(null);
    });
  }

  if (targets.length === 0) {
    return (
      <Empty>
        Cadastre uma conta ou cartão em <Link className="underline" href="/contas">Contas</Link> antes de importar.
      </Empty>
    );
  }

  if (result) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-lg font-semibold">Importação concluída</p>
        <p className="text-sm">
          {result.inserted} lançamento(s) importado(s)
          {result.skipped > 0 ? `, ${result.skipped} já existia(m) e foi(ram) ignorado(s)` : ""}.
        </p>
        <div className="flex gap-2">
          <Link href="/lancamentos" className={btnPrimary}>Ver lançamentos</Link>
          <button onClick={reset} className={btnGhost}>Importar outro arquivo</button>
        </div>
      </Card>
    );
  }

  const selectedCount = rows?.filter((r) => r.selected && !r.blocked).length ?? 0;
  const selectedTotal = (rows ?? [])
    .filter((r) => r.selected && !r.blocked)
    .reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label="1. Importar para">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              reset();
            }}
            className={inputCls}
          >
            {targets.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="2. Arquivo (.ofx, .qfx ou .csv)">
          <input
            type="file"
            accept=".ofx,.qfx,.csv,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-white`}
          />
        </Field>
      </Card>

      {warnings.map((w) => (
        <p key={w} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {w}
        </p>
      ))}

      {table && mapping && !rows && (
        <Card className="flex flex-col gap-3">
          <p className="font-medium">3. Confira as colunas do CSV</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColSelect label="Data" value={mapping.date} headers={table.headers} onChange={(v) => setMapping({ ...mapping, date: v ?? 0 })} />
            <ColSelect label="Descrição" value={mapping.description} headers={table.headers} onChange={(v) => setMapping({ ...mapping, description: v ?? 0 })} />
            <ColSelect label="Valor (uma coluna, com sinal)" value={mapping.amount} headers={table.headers} optional onChange={(v) => setMapping({ ...mapping, amount: v })} />
            {mapping.amount === null && (
              <>
                <ColSelect label="Débito (saída)" value={mapping.debit} headers={table.headers} optional onChange={(v) => setMapping({ ...mapping, debit: v })} />
                <ColSelect label="Crédito (entrada)" value={mapping.credit} headers={table.headers} optional onChange={(v) => setMapping({ ...mapping, credit: v })} />
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mapping.invert} onChange={(e) => setMapping({ ...mapping, invert: e.target.checked })} />
            Compras aparecem como números positivos neste arquivo (inverter o sinal)
          </label>

          {csvPreview && (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 text-sm dark:border-zinc-800">
              <table className="w-full">
                <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
                  <tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2 text-right">Valor</th></tr>
                </thead>
                <tbody>
                  {csvPreview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.description}</td>
                      <td className="p-2 text-right tabular-nums">{formatBRL(r.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {csvPreview?.warnings.map((w) => <p key={w} className="text-xs text-zinc-500">{w}</p>)}
          <p className="text-xs text-zinc-500">Saídas devem aparecer negativas. Se estiver ao contrário, use a opção de inverter.</p>
          <button
            disabled={!csvPreview || csvPreview.rows.length === 0}
            onClick={() => csvPreview && void buildPreview(csvPreview.rows)}
            className={`${btnPrimary} w-fit`}
          >
            Continuar ({csvPreview?.rows.length ?? 0} linhas)
          </button>
        </Card>
      )}

      {rows && (
        <Card className="flex flex-col gap-3 !p-0">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-medium">Revise antes de importar</p>
              <p className="text-xs text-zinc-500">
                Linhas desmarcadas não serão importadas. Ao escolher uma categoria, o app lembra do estabelecimento nas próximas importações.
              </p>
            </div>
            <button
              disabled={busy || selectedCount === 0}
              onClick={confirm}
              className={btnPrimary}
            >
              {busy ? "Importando…" : `Importar ${selectedCount} (${formatBRL(selectedTotal)})`}
            </button>
          </div>

          <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {rows.map((r, i) => (
              <li key={i} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${r.blocked ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`Importar ${r.description}`}
                  checked={r.selected && !r.blocked}
                  disabled={r.blocked}
                  onChange={(e) =>
                    setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                  }
                />
                <span className="w-20 shrink-0 text-xs text-zinc-500">{r.date.split("-").reverse().join("/")}</span>
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-medium">{r.description || "(sem descrição)"}</p>
                  {r.note && <p className="text-xs text-amber-700 dark:text-amber-400">{r.note}</p>}
                </div>
                <select
                  aria-label={`Categoria de ${r.description}`}
                  value={r.categoryId}
                  disabled={r.blocked}
                  onChange={(e) => setCategory(i, e.target.value)}
                  className="w-44 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <span className={`w-28 text-right text-sm font-medium tabular-nums ${r.amountCents > 0 ? "text-emerald-700" : ""}`}>
                  {formatBRL(r.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ColSelect({
  label,
  value,
  headers,
  optional,
  onChange,
}: {
  label: string;
  value: number | null;
  headers: string[];
  optional?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={inputCls}
      >
        {optional && <option value="">—</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
        ))}
      </select>
    </Field>
  );
}
