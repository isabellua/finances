import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { projectMonths } from "@/lib/commitments";
import { currentMonth, monthLabel, shiftMonth, todayISO } from "@/lib/dates";
import { HEALTH_WEIGHTS, healthScore } from "@/lib/health";
import { limitUsed } from "@/lib/invoices";
import { formatBRL } from "@/lib/money";
import { loadPayables } from "@/lib/payables";
import type { Account, AccountBalance, CreditCard } from "@/lib/types";

type Flow = { occurred_on: string; kind: "income" | "expense"; amount_cents: number };
type CardTx = { card_id: string; kind: string; amount_cents: number; occurred_on: string };

export default async function SaudePage() {
  const { supabase } = await requireUser();
  const today = todayISO();
  const month = currentMonth();
  const since = shiftMonth(month, -6);

  const [{ data: flows }, { data: accounts }, { data: balances }, { data: cards }, { data: cardTxs }, payables] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_on,kind,amount_cents")
      .in("kind", ["income", "expense"])
      .eq("status", "paid")
      .gte("occurred_on", `${since}-01`)
      .lt("occurred_on", `${month}-01`)
      .overrideTypes<Flow[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .overrideTypes<Account[]>(),
    supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", false)
      .overrideTypes<CreditCard[]>(),
    supabase
      .from("transactions")
      .select("card_id,kind,amount_cents,occurred_on")
      .in("kind", ["expense", "invoice_payment"])
      .not("card_id", "is", null)
      .limit(5000)
      .overrideTypes<CardTx[]>(),
    loadPayables(supabase, today, 30),
  ]);

  // Últimos 6 meses fechados
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(since, i));
  const perMonth = months.map((m) => {
    const rows = (flows ?? []).filter((r) => r.occurred_on.startsWith(m));
    const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount_cents, 0);
    const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount_cents, 0);
    return { month: m, income, expense, has: rows.length > 0 };
  });
  const last3 = perMonth.slice(-3).filter((m) => m.has);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  const balanceById = new Map((balances ?? []).map((b) => [b.account_id, b.balance_cents]));
  const liquid = (accounts ?? []).reduce((s, a) => s + (balanceById.get(a.id) ?? a.opening_balance_cents), 0);

  const withLimit = (cards ?? []).filter((c) => c.credit_limit_cents);
  const totalLimit = withLimit.reduce((s, c) => s + (c.credit_limit_cents ?? 0), 0);
  const totalUsed = withLimit.reduce(
    (s, c) => s + limitUsed((cardTxs ?? []).filter((t) => t.card_id === c.id), { closingDay: c.closing_day, dueDay: c.due_day }, today),
    0,
  );

  const overdue = payables.rows.filter((r) => r.status === "overdue" && !r.commitment.card_id).length;
  const committed = projectMonths(payables.commitments, () => false, shiftMonth(month, 1), 3);

  const result = healthScore({
    monthsOfData: last3.length,
    incomeAvgCents: Math.round(avg(last3.map((m) => m.income))),
    expenseAvgCents: Math.round(avg(last3.map((m) => m.expense))),
    liquidCents: liquid,
    cardUsedPct: totalLimit > 0 ? totalUsed / totalLimit : null,
    overdueCount: overdue,
    committedMonthlyCents: Math.round(avg(committed.map((m) => m.totalCents))),
  });

  const tone = result.score === null ? "" : result.score >= 60 ? "text-pos" : result.score >= 40 ? "text-warn" : "text-neg";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Saúde financeira" subtitle="Indicador próprio, calculado com os seus lançamentos." />

      {result.score === null ? (
        <Empty>
          Ainda não há dados suficientes. Lance entradas e saídas por pelo menos um mês fechado para calcular.
        </Empty>
      ) : (
        <Card className="flex items-baseline gap-4">
          <p className={`text-6xl font-semibold tabular-nums ${tone}`}>{result.score}<span className="text-2xl text-ink-muted">/100</span></p>
          <p className={`text-lg font-medium ${tone}`}>{result.label}</p>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">De onde vem a nota</h2>
        <ul className="flex flex-col gap-3">
          {result.components.map((c) => (
            <Card key={c.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{c.label} <span className="text-xs font-normal text-ink-subtle">peso {HEALTH_WEIGHTS[c.key]}%</span></p>
                <p className="font-semibold tabular-nums">{c.score === null ? "—" : c.score}</p>
              </div>
              <div className="h-2 rounded-full bg-sunken" role="img" aria-label={c.score === null ? "sem dados" : `${c.score} de 100`}>
                <div className="h-2 rounded-full bg-accent" style={{ width: `${c.score ?? 0}%` }} />
              </div>
              <p className="text-sm text-ink-muted">{c.detail}</p>
            </Card>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Sobra por mês</h2>
        <Card className="!p-0">
          <ul className="divide-y divide-line text-sm">
            {perMonth.map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-3 p-3">
                <span className="capitalize">{monthLabel(m.month)}</span>
                {m.has ? (
                  <span className="tabular-nums">
                    {formatBRL(m.income - m.expense)}
                    {m.income > 0 && <span className="ml-2 text-xs text-ink-muted">({Math.round(((m.income - m.expense) / m.income) * 100)}% da receita)</span>}
                  </span>
                ) : (
                  <span className="text-ink-subtle">sem lançamentos</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <Card className="text-xs text-ink-muted">
        <p className="font-medium text-ink">Como ler</p>
        <p>
          Não é score de crédito nem um padrão oficial: é uma régua simples com 4 componentes e pesos fixos (poupança 35%, reserva 25%, crédito 20%, comprometimento 20%). Metas de referência: sobrar 20% da receita, ter 6 meses de gastos guardados, usar até 30% do limite do cartão e comprometer até 50% da receita com contas fixas. Os valores usam os últimos 3 meses fechados e só o que foi lançado no app.
        </p>
      </Card>
    </div>
  );
}
