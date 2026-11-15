import Link from "next/link";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { occurrencesBetween, type Commitment } from "@/lib/commitments";
import { addDays, formatDateBR, todayISO } from "@/lib/dates";
import { invoiceFor, invoiceState, invoiceTotals, limitUsed, shiftInvoice, type InvoiceState } from "@/lib/invoices";
import { centsToInput, formatBRL } from "@/lib/money";
import type { Category, CreditCard } from "@/lib/types";
import { payInvoice } from "./actions";

type CardTxRow = {
  id: string;
  kind: "expense" | "invoice_payment";
  amount_cents: number;
  occurred_on: string;
  description: string;
  category_id: string | null;
  status: "paid" | "pending";
};

const STATE_LABEL: Record<InvoiceState, { text: string; cls: string }> = {
  open: { text: "Aberta", cls: "bg-accent-tint text-accent-text" },
  closed: { text: "Fechada, aguardando pagamento", cls: "bg-warn-tint text-warn" },
  overdue: { text: "Vencida", cls: "bg-neg-tint text-neg" },
  paid: { text: "Paga", cls: "bg-pos-tint text-pos" },
  empty: { text: "Sem compras", cls: "bg-sunken text-ink-muted" },
};

export default async function FaturasPage({ searchParams }: PageProps<"/faturas">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const today = todayISO();

  const [{ data: cards }, { data: cats }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name").overrideTypes<Category[]>(),
  ]);

  const list = cards ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Faturas" />
        <Empty>Cadastre um cartão em <Link className="underline" href="/contas">Contas</Link> para ver as faturas.</Empty>
      </div>
    );
  }

  const cardId = str(sp.cartao);
  const card = list.find((c) => c.id === cardId) ?? list[0];
  const cycle = { closingDay: card.closing_day, dueDay: card.due_day };

  const [{ data: txs }, { data: coms }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,category_id,status")
      .eq("card_id", card.id)
      .in("kind", ["expense", "invoice_payment"])
      .order("occurred_on", { ascending: false })
      .limit(2000)
      .overrideTypes<CardTxRow[]>(),
    supabase
      .from("commitments")
      .select("id,kind,description,amount_cents,frequency,start_on,total_occurrences,end_on,account_id,card_id,category_id,active")
      .eq("card_id", card.id)
      .overrideTypes<Commitment[]>(),
  ]);

  const all = txs ?? [];
  const current = invoiceFor(today, cycle);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.f) ?? "") ? invoiceFor(str(sp.f)!, cycle) : current;
  const totals = invoiceTotals(selected, all, cycle);
  const state = invoiceState(selected, totals, today);
  const remaining = Math.max(0, totals.totalCents - totals.paidCents);
  const used = limitUsed(all, cycle, today);
  const limit = card.credit_limit_cents;
  const usedPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : null;

  const items = all.filter((t) => t.kind === "expense" && t.occurred_on >= selected.start && t.occurred_on <= selected.closing);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const prev = shiftInvoice(selected, -1, cycle);
  const next = shiftInvoice(selected, 1, cycle);
  const link = (closing: string, cartao = card.id) => `/faturas?cartao=${cartao}&f=${closing}`;

  // Tendência: 5 faturas anteriores, a escolhida e as 3 seguintes (real onde já houve compras; projetado com compromissos do cartão).
  const trend = [];
  let inv = shiftInvoice(selected, -5, cycle);
  for (let i = 0; i < 9; i++) {
    const t = invoiceTotals(inv, all, cycle);
    const projected = (coms ?? []).flatMap((c) => occurrencesBetween(c, inv.start, addDays(inv.closing, 1))).reduce((s, o) => s + o.commitment.amount_cents, 0);
    const isFuture = inv.closing > current.closing;
    trend.push({ inv, real: t.totalCents, projected, isFuture, isSelected: inv.closing === selected.closing });
    inv = shiftInvoice(inv, 1, cycle);
  }
  const trendMax = Math.max(1, ...trend.map((t) => (t.isFuture ? t.projected : Math.max(t.real, t.projected))));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Faturas" subtitle="Fatura por ciclo de fechamento de cada cartão." />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {list.length > 1 && (
        <nav aria-label="Cartões" className="flex flex-wrap gap-2">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/faturas?cartao=${c.id}`}
              aria-current={c.id === card.id ? "page" : undefined}
              className="rounded-full border border-line-strong px-3 py-1.5 text-sm aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-text"
            >
              {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
            </Link>
          ))}
        </nav>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link href={link(prev.closing)} aria-label="Fatura anterior" className="rounded-lg border border-line-strong px-3 py-2">‹</Link>
          <div className="text-center">
            <p className="text-xs tracking-wide text-ink-subtle uppercase">Fatura que fecha em</p>
            <p className="text-lg font-semibold">{formatDateBR(selected.closing)}</p>
            <p className="text-xs text-ink-muted">compras de {formatDateBR(selected.start)} a {formatDateBR(selected.closing)} · vence {formatDateBR(selected.due)}</p>
          </div>
          <Link href={link(next.closing)} aria-label="Próxima fatura" className="rounded-lg border border-line-strong px-3 py-2">›</Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">Total da fatura</p>
            <p className="text-3xl font-semibold tabular-nums">{formatBRL(totals.totalCents)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATE_LABEL[state].cls}`}>{STATE_LABEL[state].text}</span>
        </div>
        <p className="text-sm text-ink-muted">
          {totals.purchaseCount} compra(s) · pago {formatBRL(totals.paidCents)}
          {remaining > 0 && totals.totalCents > 0 ? ` · falta ${formatBRL(remaining)}` : ""}
        </p>

        {remaining > 0 && state !== "open" && (
          <form action={payInvoice} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="card" value={card.id} />
            <Field label="Valor pago (R$)">
              <input name="amount" inputMode="decimal" required defaultValue={centsToInput(remaining)} className={inputCls} />
            </Field>
            <Field label="Data do pagamento">
              <input name="date" type="date" required defaultValue={today} className={inputCls} />
            </Field>
            <button className={`${btnPrimary} self-end`}>Marcar como paga</button>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-medium">Limite</p>
        {limit ? (
          <>
            <div className="h-2 rounded-full bg-sunken" role="img" aria-label={`${usedPct}% do limite usado`}>
              <div className="h-2 rounded-full bg-accent" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="text-sm text-ink-muted">
              Usado {formatBRL(used)} de {formatBRL(limit)} ({usedPct}%) · disponível {formatBRL(Math.max(0, limit - used))}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Sem limite cadastrado. Edite o cartão em Contas para ver o uso.</p>
        )}
        <p className="text-xs text-ink-subtle">Considera só o que foi lançado aqui: compras e pagamentos que não estão no app não entram.</p>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Tendência</h2>
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {trend.map((t) => {
              const v = t.isFuture ? t.projected : Math.max(t.real, 0);
              return (
                <li key={t.inv.closing} className="flex items-center gap-3">
                  <Link href={link(t.inv.closing)} className={`w-24 shrink-0 text-xs ${t.isSelected ? "font-semibold text-accent-text" : "text-ink-muted"}`}>
                    {formatDateBR(t.inv.closing).slice(0, 5)}/{t.inv.closing.slice(2, 4)}
                  </Link>
                  <div className="h-3 flex-1 rounded bg-sunken">
                    <div
                      className={`h-3 rounded ${t.isFuture ? "bg-warn opacity-60" : "bg-accent"}`}
                      style={{ width: `${Math.max(v > 0 ? 2 : 0, (v / trendMax) * 100)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right tabular-nums">{formatBRL(v)}</span>
                  <span className="w-16 text-xs text-ink-subtle">{t.isFuture ? "projetado" : "real"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-subtle">Projetado = assinaturas e parcelas cadastradas para este cartão. Não inclui compras que você ainda vai fazer.</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Compras desta fatura</h2>
        {items.length === 0 ? (
          <Empty>Nenhuma compra neste período.</Empty>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3">
                  <span className="w-12 shrink-0 text-xs text-ink-subtle">{formatDateBR(t.occurred_on).slice(0, 5)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.description || "Compra"}</p>
                    <p className="truncate text-xs text-ink-subtle">{t.category_id ? catName.get(t.category_id) : "Sem categoria"}{t.status === "pending" ? " · previsto" : ""}</p>
                  </div>
                  <span className="font-medium tabular-nums">{formatBRL(t.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
