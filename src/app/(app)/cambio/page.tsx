import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateBR, todayISO } from "@/lib/dates";
import { convertFx, currencyExp, formatBps, formatForeign, formatRateMicro, impliedSpreadBps } from "@/lib/fx";
import { centsToInput, formatBRL } from "@/lib/money";
import type { Category, CreditCard, Transaction } from "@/lib/types";
import {
  applyImpliedSpread,
  confirmFxActual,
  createFxTransaction,
  deleteIofParam,
  saveCardFx,
  saveIofParam,
} from "./actions";
import { FxCalculator, type FxCard } from "./fx-calculator";

type TaxParam = { id: string; rate_bps: number; valid_from: string; note: string | null };

const RULE_LABEL = {
  purchase_date: "Dia da compra",
  closing_date: "Dia do fechamento da fatura",
  due_date: "Dia do vencimento da fatura",
} as const;

const FX_COLS =
  "id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,fx_currency,fx_amount_minor,fx_rate_micro,fx_spread_bps,fx_iof_bps,fx_estimated_cents,fx_estimated";

export default async function CambioPage({ searchParams }: PageProps<"/cambio">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const today = todayISO();

  const [{ data: cards }, { data: params }, { data: fxTxs }, { data: cats }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived,fx_spread_bps,fx_iof_bps,fx_rate_rule")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase
      .from("tax_params")
      .select("id,rate_bps,valid_from,note")
      .eq("key", "iof_card_international")
      .order("valid_from", { ascending: false })
      .overrideTypes<TaxParam[]>(),
    supabase
      .from("transactions")
      .select(FX_COLS)
      .not("fx_currency", "is", null)
      .order("occurred_on", { ascending: false })
      .limit(200)
      .overrideTypes<Transaction[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
  ]);

  const cardList = cards ?? [];
  const label = (c: CreditCard) => (c.last4 ? `${c.name} •••• ${c.last4}` : c.name);
  const cardName = new Map(cardList.map((c) => [c.id, label(c)]));
  const generalIof = (params ?? []).find((p) => p.valid_from <= today)?.rate_bps ?? null;

  const fxCards: FxCard[] = cardList.map((c) => ({
    id: c.id,
    label: label(c),
    closingDay: c.closing_day,
    dueDay: c.due_day,
    rule: c.fx_rate_rule ?? "purchase_date",
    spreadBps: c.fx_spread_bps ?? null,
    iofBps: c.fx_iof_bps ?? null,
  }));

  const all = fxTxs ?? [];
  const pending = all.filter((t) => t.fx_estimated);
  const confirmed = all.filter((t) => !t.fx_estimated && t.fx_estimated_cents != null);

  // Calibração: spread que explica o que a fatura realmente cobrou, por cartão.
  const calib = cardList
    .map((c) => {
      const rows = confirmed
        .filter((t) => t.card_id === c.id)
        .map((t) => {
          const base = convertFx({
            amountMinor: t.fx_amount_minor!,
            exp: currencyExp(t.fx_currency!),
            rateMicro: t.fx_rate_micro!,
            spreadBps: 0,
            iofBps: 0,
          }).baseCents;
          const implied = impliedSpreadBps(t.amount_cents, base, t.fx_iof_bps ?? 0);
          const diffPct = t.fx_estimated_cents ? ((t.amount_cents - t.fx_estimated_cents) / t.fx_estimated_cents) * 100 : 0;
          return { t, implied, diffPct };
        });
      const valid = rows.filter((r) => r.implied !== null);
      const avg = valid.length ? Math.round(valid.reduce((s, r) => s + r.implied!, 0) / valid.length) : null;
      return { card: c, rows, avg, n: valid.length };
    })
    .filter((x) => x.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compra internacional"
        subtitle="Estime quanto vai custar na fatura: cotação + spread do cartão + IOF."
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <Card>
        <FxCalculator
          action={createFxTransaction}
          cards={fxCards}
          categories={(cats ?? []).map((c) => ({ id: c.id, label: c.name }))}
          generalIofBps={generalIof}
        />
      </Card>

      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Estimativas aguardando a fatura ({pending.length})</h2>
          <ul className="flex flex-col gap-3">
            {pending.map((t) => (
              <Card key={t.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.description}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDateBR(t.occurred_on)} · {cardName.get(t.card_id ?? "") ?? "Cartão"} ·{" "}
                      {formatForeign(t.fx_currency!, t.fx_amount_minor!)} a {formatRateMicro(t.fx_rate_micro!)} · spread{" "}
                      {formatBps(t.fx_spread_bps ?? 0)}% · IOF {formatBps(t.fx_iof_bps ?? 0)}%
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatBRL(t.amount_cents)}</p>
                </div>
                <form action={confirmFxActual} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <Field label="Valor cobrado na fatura (R$)" className="min-w-48 flex-1">
                    <input name="actual" inputMode="decimal" required defaultValue={centsToInput(t.amount_cents)} className={inputCls} />
                  </Field>
                  <button className={btnPrimary}>Confirmar valor real</button>
                </form>
                <p className="text-xs text-zinc-500">
                  Importar a fatura em “Importar” também atualiza esta estimativa, se o valor for parecido.
                </p>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {calib.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Estimado × cobrado</h2>
          {calib.map(({ card, rows, avg, n }) => (
            <Card key={card.id} className="flex flex-col gap-3">
              <p className="font-medium">{label(card)}</p>
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {rows.map(({ t, diffPct }) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      {t.description} <span className="text-xs text-zinc-500">({formatDateBR(t.occurred_on)})</span>
                    </span>
                    <span className="tabular-nums text-zinc-500">{formatBRL(t.fx_estimated_cents!)} →</span>
                    <span className="font-medium tabular-nums">{formatBRL(t.amount_cents)}</span>
                    <span className={`w-16 text-right text-xs tabular-nums ${Math.abs(diffPct) < 0.5 ? "text-emerald-700" : "text-amber-700"}`}>
                      {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(2).replace(".", ",")}%
                    </span>
                  </li>
                ))}
              </ul>
              {avg !== null && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <p>
                    Spread que explica a fatura: <strong>{formatBps(Math.max(avg, 0))}%</strong>
                    {avg < 0 && " (negativo: o banco cobrou menos que a cotação usada)"} · configurado hoje:{" "}
                    {card.fx_spread_bps != null ? `${formatBps(card.fx_spread_bps)}%` : "nenhum"} · {n} compra(s)
                  </p>
                  {n >= 2 && avg >= 0 && avg <= 3000 && (
                    <form action={applyImpliedSpread}>
                      <input type="hidden" name="id" value={card.id} />
                      <input type="hidden" name="bps" value={avg} />
                      <button className={btnGhost}>Usar {formatBps(avg)}% neste cartão</button>
                    </form>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-500">
                O spread calculado inclui a diferença entre a cotação que usamos e a que o banco aplicou. Com várias compras ele se aproxima do spread real; com uma só, é pouco confiável (por isso o botão só aparece a partir de 2).
              </p>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Parâmetros</h2>

        <Card className="flex flex-col gap-3">
          <div>
            <p className="font-medium">IOF em compra internacional no cartão</p>
            <p className="text-xs text-zinc-500">
              Alíquota geral, com data de início. Fontes secundárias indicam 3,5% desde julho de 2025, mas não consegui conferir
              na Receita Federal: confirme no site oficial antes de confiar. Alguns bancos absorvem o IOF; para isso use o IOF
              próprio do cartão, abaixo.
            </p>
          </div>
          {(params ?? []).length === 0 ? (
            <Empty>Nenhuma alíquota cadastrada. A calculadora usa 3,5% como sugestão.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {(params ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">
                    <strong>{formatBps(p.rate_bps)}%</strong> desde {formatDateBR(p.valid_from)}
                    {p.valid_from <= today && p.id === (params ?? []).find((x) => x.valid_from <= today)?.id && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">vigente</span>
                    )}
                    {p.note && <span className="block text-xs text-zinc-500">{p.note}</span>}
                  </span>
                  <form action={deleteIofParam}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmButton message="Remover esta alíquota?" className="text-xs text-zinc-500 underline">Remover</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={saveIofParam} className="grid gap-3 sm:grid-cols-3">
            <Field label="Alíquota (%)">
              <input name="rate" inputMode="decimal" required placeholder="3,5" className={inputCls} />
            </Field>
            <Field label="Vale desde">
              <input name="valid_from" type="date" required defaultValue={today} className={inputCls} />
            </Field>
            <Field label="Observação" hint="Opcional, ex.: fonte">
              <input name="note" maxLength={200} className={inputCls} />
            </Field>
            <button className={`${btnPrimary} sm:col-span-3`}>Salvar alíquota</button>
          </form>
        </Card>

        {cardList.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3">
            <p className="font-medium">{label(c)}</p>
            <form action={saveCardFx} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Spread do emissor (%)" hint="Vazio = não configurado">
                <input name="spread" inputMode="decimal" defaultValue={c.fx_spread_bps != null ? formatBps(c.fx_spread_bps) : ""} className={inputCls} />
              </Field>
              <Field label="IOF próprio (%)" hint="Vazio = usar a alíquota geral. 0 se o banco absorve.">
                <input name="iof" inputMode="decimal" defaultValue={c.fx_iof_bps != null ? formatBps(c.fx_iof_bps) : ""} className={inputCls} />
              </Field>
              <Field label="Cotação usada pelo banco" hint="Confirme com o banco">
                <select name="rule" defaultValue={c.fx_rate_rule ?? "purchase_date"} className={inputCls}>
                  {Object.entries(RULE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <button className={`${btnGhost} sm:col-span-3`}>Salvar parâmetros do cartão</button>
            </form>
          </Card>
        ))}
      </section>
    </div>
  );
}
