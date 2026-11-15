import Link from "next/link";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateBR } from "@/lib/dates";
import { convertFx, currencyExp, formatBps, formatForeign, formatRateMicro, impliedSpreadBps } from "@/lib/fx";
import { centsToInput, formatBRL } from "@/lib/money";
import type { Category, CreditCard, Transaction } from "@/lib/types";
import { applyImpliedSpread, confirmFxActual, createFxTransaction, saveCardFx } from "./actions";
import { FxCalculator, type FxCard } from "./fx-calculator";

const FX_COLS =
  "id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,fx_currency,fx_amount_minor,fx_rate_micro,fx_spread_bps,fx_iof_bps,fx_estimated_cents,fx_estimated";

export default async function CambioPage({ searchParams }: PageProps<"/cambio">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: cards }, { data: fxTxs }, { data: cats }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived,fx_spread_bps,fx_iof_bps,fx_rate_rule")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase
      .from("transactions")
      .select(FX_COLS)
      .not("fx_currency", "is", null)
      .order("occurred_on", { ascending: false })
      .limit(200)
      .overrideTypes<Transaction[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
  ]);

  const list = cards ?? [];
  const label = (c: CreditCard) => (c.last4 ? `${c.name} •••• ${c.last4}` : c.name);

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Compra internacional" />
        <Empty>Cadastre um cartão em <Link className="underline" href="/contas">Contas</Link> para estimar compras em moeda estrangeira.</Empty>
      </div>
    );
  }

  const selected = list.find((c) => c.id === str(sp.cartao)) ?? list[0];
  const configured = selected.fx_spread_bps != null;
  const fxCard: FxCard | null = configured
    ? {
        id: selected.id,
        label: label(selected),
        closingDay: selected.closing_day,
        dueDay: selected.due_day,
        rule: selected.fx_rate_rule ?? "purchase_date",
        spreadBps: selected.fx_spread_bps!,
        iofBps: selected.fx_iof_bps ?? null,
      }
    : null;

  const mine = (fxTxs ?? []).filter((t) => t.card_id === selected.id);
  const pending = mine.filter((t) => t.fx_estimated);
  const confirmed = mine.filter((t) => !t.fx_estimated && t.fx_estimated_cents != null);

  const calib = confirmed.map((t) => {
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
  const valid = calib.filter((r) => r.implied !== null);
  const avg = valid.length ? Math.round(valid.reduce((s, r) => s + r.implied!, 0) / valid.length) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Compra internacional" subtitle="Escolha o cartão, a moeda e o valor. As taxas são as do cartão." />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {list.length > 1 && (
        <nav aria-label="Cartões" className="flex flex-wrap gap-2">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/cambio?cartao=${c.id}`}
              aria-current={c.id === selected.id ? "page" : undefined}
              className="rounded-full border border-line-strong px-3 py-1.5 text-sm aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-text"
            >
              {label(c)}
            </Link>
          ))}
        </nav>
      )}

      {fxCard ? (
        <Card>
          <FxCalculator
            key={fxCard.id}
            action={createFxTransaction}
            card={fxCard}
            categories={(cats ?? []).map((c) => ({ id: c.id, label: c.name }))}
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="font-medium">Falta o spread de {label(selected)}</p>
          <p className="text-sm text-ink-muted">
            É a taxa de conversão que o banco cobra sobre a cotação (veja no app ou no contrato do cartão). Você informa uma vez e a calculadora passa a usar sempre. O IOF já vem pronto.
          </p>
          <form action={saveCardFx} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={selected.id} />
            <input type="hidden" name="iof" value={selected.fx_iof_bps != null ? formatBps(selected.fx_iof_bps) : ""} />
            <Field label="Spread do banco (%)" hint="Ex.: 4">
              <input name="spread" inputMode="decimal" required autoFocus className={inputCls} />
            </Field>
            <Field label="Cotação usada pelo banco" hint="Confirme com o banco" className="sm:col-span-2">
              <select name="rule" defaultValue={selected.fx_rate_rule ?? "purchase_date"} className={inputCls}>
                <option value="purchase_date">Dia da compra</option>
                <option value="closing_date">Dia do fechamento da fatura</option>
                <option value="due_date">Dia do vencimento da fatura</option>
              </select>
            </Field>
            <button className={`${btnPrimary} sm:col-span-3`}>Salvar taxas do cartão</button>
          </form>
        </Card>
      )}

      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Estimativas aguardando a fatura ({pending.length})</h2>
          <ul className="flex flex-col gap-3">
            {pending.map((t) => (
              <Card key={t.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.description}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDateBR(t.occurred_on)} · {formatForeign(t.fx_currency!, t.fx_amount_minor!)} a {formatRateMicro(t.fx_rate_micro!)} · spread {formatBps(t.fx_spread_bps ?? 0)}% · IOF {formatBps(t.fx_iof_bps ?? 0)}%
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
                <p className="text-xs text-ink-subtle">Importar a fatura em “Importar” também atualiza esta estimativa, se o valor for parecido.</p>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {calib.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Estimado × cobrado</h2>
          <Card className="flex flex-col gap-3">
            <ul className="divide-y divide-line text-sm">
              {calib.map(({ t, diffPct }) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {t.description} <span className="text-xs text-ink-subtle">({formatDateBR(t.occurred_on)})</span>
                  </span>
                  <span className="tabular-nums text-ink-muted">{formatBRL(t.fx_estimated_cents!)} →</span>
                  <span className="font-medium tabular-nums">{formatBRL(t.amount_cents)}</span>
                  <span className={`w-16 text-right text-xs tabular-nums ${Math.abs(diffPct) < 0.5 ? "text-pos" : "text-warn"}`}>
                    {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(2).replace(".", ",")}%
                  </span>
                </li>
              ))}
            </ul>
            {avg !== null && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p>
                  Spread que explica a fatura: <strong>{formatBps(Math.max(avg, 0))}%</strong>
                  {avg < 0 && " (negativo: o banco cobrou menos que a cotação usada)"} · configurado: {selected.fx_spread_bps != null ? `${formatBps(selected.fx_spread_bps)}%` : "nenhum"} · {valid.length} compra(s)
                </p>
                {valid.length >= 2 && avg >= 0 && avg <= 3000 && (
                  <form action={applyImpliedSpread}>
                    <input type="hidden" name="id" value={selected.id} />
                    <input type="hidden" name="bps" value={avg} />
                    <button className={btnGhost}>Usar {formatBps(avg)}% neste cartão</button>
                  </form>
                )}
              </div>
            )}
            <p className="text-xs text-ink-subtle">
              O spread calculado inclui a diferença entre a cotação usada e a que o banco aplicou. Com várias compras ele se aproxima do spread real.
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
