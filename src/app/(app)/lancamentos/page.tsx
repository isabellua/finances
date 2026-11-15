import Link from "next/link";
import { Flash, str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { Card, Empty, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { colorFor } from "@/lib/charts";
import { currentMonth, isValidMonth, monthRange } from "@/lib/dates";
import { formatForeign } from "@/lib/fx";
import { formatBRL } from "@/lib/money";
import { summarize } from "@/lib/summary";
import { KIND_LABEL, type Account, type Category, type CreditCard, type Transaction } from "@/lib/types";

const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

const uuidRe = /^[0-9a-f-]{36}$/i;

export default async function LancamentosPage({ searchParams }: PageProps<"/lancamentos">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase } = await requireUser();

  // Busca e filtros (GET). Cada valor é validado antes de virar filtro.
  const q = (str(sp.q) ?? "").trim().slice(0, 80);
  const fConta = str(sp.conta);
  const fCat = str(sp.cat);
  const fTipo = str(sp.tipo);
  const fSit = str(sp.sit);
  const allMonths = str(sp.todos) === "1";
  const filterCount = [fConta, fCat, fTipo, fSit].filter(Boolean).length;
  const filtering = Boolean(q) || filterCount > 0;

  let txQuery = supabase
    .from("transactions")
    .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,fx_currency,fx_amount_minor,fx_estimated,status")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filtering && allMonths) txQuery = txQuery.limit(300);
  else txQuery = txQuery.gte("occurred_on", start).lt("occurred_on", end);
  if (q) txQuery = txQuery.ilike("description", `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (fConta && /^[ac]:[0-9a-f-]{36}$/i.test(fConta)) {
    txQuery = fConta[0] === "a" ? txQuery.eq("account_id", fConta.slice(2)) : txQuery.eq("card_id", fConta.slice(2));
  }
  if (fCat === "none") txQuery = txQuery.is("category_id", null);
  else if (fCat && uuidRe.test(fCat)) txQuery = txQuery.eq("category_id", fCat);
  if (fTipo && ["income", "expense", "transfer", "invoice_payment"].includes(fTipo)) txQuery = txQuery.eq("kind", fTipo);
  if (fSit === "paid" || fSit === "pending") txQuery = txQuery.eq("status", fSit);

  const [{ data: txs }, { data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    txQuery.overrideTypes<Transaction[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name,color,icon").order("name").overrideTypes<Category[]>(),
  ]);

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const cardName = new Map((cards ?? []).map((c) => [c.id, c.name]));
  const catList = cats ?? [];
  const catIndex = new Map(catList.map((c, i) => [c.id, { ...c, i }]));
  const s = summarize(txs ?? []);

  function where(t: Transaction): string {
    switch (t.kind) {
      case "transfer":
        return `${accountName.get(t.account_id ?? "") ?? "?"} → ${accountName.get(t.transfer_account_id ?? "") ?? "?"}`;
      case "invoice_payment":
        return `Fatura ${cardName.get(t.card_id ?? "") ?? "?"}`;
      default:
        return t.card_id ? (cardName.get(t.card_id) ?? "Cartão") : (accountName.get(t.account_id ?? "") ?? "?");
    }
  }

  const byDay = new Map<string, Transaction[]>();
  for (const t of txs ?? []) byDay.set(t.occurred_on, [...(byDay.get(t.occurred_on) ?? []), t]);

  // Filtros ativos viram "chips" que se removem com um toque.
  const base = new URLSearchParams();
  base.set("mes", month);
  if (allMonths) base.set("todos", "1");
  const without = (key: string) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries({ q, conta: fConta, cat: fCat, tipo: fTipo, sit: fSit })) {
      if (k !== key && v) p.set(k, v);
    }
    return `/lancamentos?${p.toString()}`;
  };
  const chips = [
    q && { key: "q", label: `“${q}”` },
    fConta && { key: "conta", label: fConta[0] === "a" ? (accountName.get(fConta.slice(2)) ?? "Conta") : (cardName.get(fConta.slice(2)) ?? "Cartão") },
    fCat && { key: "cat", label: fCat === "none" ? "Sem categoria" : (catIndex.get(fCat)?.name ?? "Categoria") },
    fTipo && { key: "tipo", label: KIND_LABEL[fTipo as keyof typeof KIND_LABEL] ?? fTipo },
    fSit && { key: "sit", label: fSit === "paid" ? "Só pagos" : "Só previstos" },
  ].filter(Boolean) as { key: string; label: string }[];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Lançamentos"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MonthNav base="/lancamentos" month={month} />
            <Link href="/importar" className={btnGhost}>Importar</Link>
            <Link href="/novo" className={`${btnPrimary} hidden md:inline-flex`}>+ Novo</Link>
          </div>
        }
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <form method="get" role="search" className="flex flex-col gap-2">
        <input type="hidden" name="mes" value={month} />
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar lançamento" aria-label="Buscar lançamento" className={inputCls} />
          <button className={btnGhost}>Buscar</button>
        </div>
        <details open={filterCount > 0 || allMonths}>
          <summary className="w-fit cursor-pointer list-none text-sm font-medium text-accent-text underline">
            Filtros{filterCount > 0 ? ` (${filterCount})` : ""}
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <select name="conta" defaultValue={fConta ?? ""} aria-label="Conta ou cartão" className={inputCls}>
              <option value="">Todas as contas e cartões</option>
              <optgroup label="Contas">
                {(accounts ?? []).map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
              </optgroup>
              <optgroup label="Cartões">
                {(cards ?? []).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
              </optgroup>
            </select>
            <select name="cat" defaultValue={fCat ?? ""} aria-label="Categoria" className={inputCls}>
              <option value="">Todas as categorias</option>
              <option value="none">Sem categoria</option>
              {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="tipo" defaultValue={fTipo ?? ""} aria-label="Tipo" className={inputCls}>
              <option value="">Todos os tipos</option>
              {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="sit" defaultValue={fSit ?? ""} aria-label="Situação" className={inputCls}>
              <option value="">Pagos e previstos</option>
              <option value="paid">Só pagos</option>
              <option value="pending">Só previstos</option>
            </select>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="todos" value="1" defaultChecked={allMonths} />
            Procurar em todos os meses
          </label>
          <button className={`${btnPrimary} mt-2`}>Aplicar filtros</button>
        </details>
      </form>

      {chips.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => (
            <Link key={c.key} href={without(c.key)} aria-label={`Remover filtro ${c.label}`} className="rounded-full bg-accent-tint px-3 py-1 text-accent-text">
              {c.label} ×
            </Link>
          ))}
          <Link href={`/lancamentos?mes=${month}`} className="text-ink-muted underline">Limpar</Link>
          <span className="text-ink-muted">{(txs ?? []).length} resultado(s)</span>
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Card className="!p-3"><p className="text-xs text-ink-subtle">Entradas</p><p className="font-semibold text-pos tabular-nums">{formatBRL(s.incomeCents)}</p></Card>
        <Card className="!p-3"><p className="text-xs text-ink-subtle">Saídas</p><p className="font-semibold tabular-nums">{formatBRL(s.expenseCents)}</p></Card>
        <Card className="!p-3"><p className="text-xs text-ink-subtle">Resultado</p><p className={`font-semibold tabular-nums ${s.netCents < 0 ? "text-neg" : ""}`}>{formatBRL(s.netCents)}</p></Card>
      </div>
      {(s.pendingIncomeCents > 0 || s.pendingExpenseCents > 0) && (
        <p className="-mt-3 text-sm text-ink-muted">
          Previsto neste período: {s.pendingIncomeCents > 0 ? `+${formatBRL(s.pendingIncomeCents)} a receber` : ""}
          {s.pendingIncomeCents > 0 && s.pendingExpenseCents > 0 ? " · " : ""}
          {s.pendingExpenseCents > 0 ? `${formatBRL(s.pendingExpenseCents)} a pagar` : ""}
        </p>
      )}

      {byDay.size === 0 && (
        <Empty>
          {filtering ? "Nenhum lançamento encontrado com esses filtros." : "Nenhum lançamento neste mês."}{" "}
          <Link className="underline" href="/novo">Adicionar</Link>
        </Empty>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">{dayLabel(day)}</h2>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-raised">
            {items.map((t) => {
              const cat = t.category_id ? catIndex.get(t.category_id) : undefined;
              const color = cat ? colorFor(cat.i, cat.color) : "#999b9e";
              return (
                <li key={t.id}>
                  <Link
                    href={`/lancamentos/${t.id}/editar`}
                    aria-label={`Editar ${t.description || KIND_LABEL[t.kind]}`}
                    className="flex min-h-14 items-center gap-3 p-3 hover:bg-sunken"
                  >
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                      style={{ background: `${color}26`, color }}
                    >
                      {t.kind === "transfer" ? "⇄" : t.kind === "invoice_payment" ? "▤" : (cat?.icon || cat?.name.slice(0, 1).toUpperCase() || "•")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.description || KIND_LABEL[t.kind]}</span>
                      <span className="block truncate text-xs text-ink-subtle">
                        {[cat?.name, where(t)].filter(Boolean).join(" · ")}
                        {t.fx_currency && t.fx_amount_minor ? ` · ${formatForeign(t.fx_currency, t.fx_amount_minor)}${t.fx_estimated ? " (estimativa)" : ""}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className={`font-medium tabular-nums ${t.kind === "income" ? "text-pos" : ""}`}>
                        {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
                        {formatBRL(t.amount_cents)}
                      </span>
                      {t.status === "pending" && (
                        <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[11px] font-medium text-warn">previsto</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
