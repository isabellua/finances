import Link from "next/link";
import { str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { PrintButton } from "@/components/print-button";
import { Card, Empty, PageHeader, btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ArrowDownLeft, ArrowUpRight } from "@phosphor-icons/react/ssr";
import { currentMonth, formatDateBR, isValidMonth, monthLabel, monthRange, todayISO } from "@/lib/dates";
import { loadPayables } from "@/lib/payables";
import { formatBRL } from "@/lib/money";
import { summarize } from "@/lib/summary";
import type { Account, AccountBalance, Category, Transaction } from "@/lib/types";

export default async function ResumoPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase, workspace } = await requireUser();

  const [{ data: txs }, { data: cats }, { data: accounts }, { data: balances }, payables, { data: pendingTxs }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,status")
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .overrideTypes<Transaction[]>(),
    supabase.from("categories").select("id,name,color").overrideTypes<Category[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),
    loadPayables(supabase, todayISO(), 14),
    // Previstos até o fim do mês visto (inclui atrasados de meses anteriores).
    supabase
      .from("transactions")
      .select("kind,amount_cents")
      .eq("status", "pending")
      .in("kind", ["income", "expense"])
      .lt("occurred_on", end)
      .overrideTypes<{ kind: "income" | "expense"; amount_cents: number }[]>(),
  ]);

  // Atrasadas + o que vence nos próximos 7 dias (e ainda não foi pago).
  const attention = payables.rows
    .filter((r) => r.status === "overdue" || (r.status === "due_soon" && r.daysUntil <= 7))
    .sort((a, b) => a.date.localeCompare(b.date));
  const overdueCount = attention.filter((r) => r.status === "overdue").length;

  const s = summarize(txs ?? []);
  // Saldo previsto = saldo de hoje + previstos a receber - previstos a pagar, até o fim do mês.
  const pendingNet = (pendingTxs ?? []).reduce(
    (sum, t) => sum + (t.kind === "income" ? t.amount_cents : -t.amount_cents),
    0,
  );
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const catColor = new Map((cats ?? []).filter((c) => c.color).map((c) => [c.id, c.color as string]));
  const balanceById = new Map((balances ?? []).map((b) => [b.account_id, b.balance_cents]));
  const totalBalance = (accounts ?? []).reduce(
    (sum, a) => sum + (balanceById.get(a.id) ?? a.opening_balance_cents),
    0,
  );
  const max = s.byCategory[0]?.totalCents ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Resumo"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MonthNav base="/" month={month} />
            <PrintButton />
          </div>
        }
      />

      <section className="flex flex-col gap-2 rounded-xl bg-hero p-6 text-hero-ink">
        <p className="text-sm text-hero-muted">Saldo total nas contas</p>
        <p className="text-[44px] leading-11 font-semibold tracking-[-1.3px] tabular-nums">{formatBRL(totalBalance)}</p>
        {(accounts ?? []).length === 0 ? (
          <Link href="/contas" className={`${btnPrimary} mt-2 w-fit`}>Cadastrar primeira conta</Link>
        ) : (
          <p className="mt-2 text-sm text-hero-muted">
            Somando {(accounts ?? []).length} {(accounts ?? []).length === 1 ? "conta" : "contas"}
          </p>
        )}
        {(pendingTxs ?? []).length > 0 && (
          <p className="text-sm text-hero-muted">
            Previsto até o fim de {monthLabel(month)}: <span className="font-semibold text-hero-ink tabular-nums">{formatBRL(totalBalance + pendingNet)}</span>
            {" "}({(pendingNet >= 0 ? "+" : "−") + formatBRL(Math.abs(pendingNet))} em lançamentos previstos)
          </p>
        )}
      </section>

      {(workspace?.monthlyCapCents || workspace?.monthlyIncomeGoalCents) && (
        <section className="grid gap-2 sm:grid-cols-2" aria-label="Metas do mês">
          {workspace?.monthlyIncomeGoalCents ? (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-ink-muted">Meta de receita do mês</p>
              <p className="font-semibold tabular-nums">
                {formatBRL(s.incomeCents)} <span className="font-normal text-ink-muted">de {formatBRL(workspace.monthlyIncomeGoalCents)}</span>
              </p>
              <div className="h-2 rounded-full bg-sunken" role="img" aria-label={`${Math.round((s.incomeCents / workspace.monthlyIncomeGoalCents) * 100)}% da meta`}>
                <div className="h-2 rounded-full bg-pos" style={{ width: `${Math.min(100, (s.incomeCents / workspace.monthlyIncomeGoalCents) * 100)}%` }} />
              </div>
              <p className="text-xs text-ink-subtle">{Math.round((s.incomeCents / workspace.monthlyIncomeGoalCents) * 100)}% da meta</p>
            </Card>
          ) : null}
          {workspace?.monthlyCapCents ? (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-ink-muted">Teto de gastos do mês</p>
              <p className="font-semibold tabular-nums">
                {formatBRL(s.expenseCents)} <span className="font-normal text-ink-muted">de {formatBRL(workspace.monthlyCapCents)}</span>
              </p>
              <div className="h-2 rounded-full bg-sunken" role="img" aria-label={`${Math.round((s.expenseCents / workspace.monthlyCapCents) * 100)}% do teto`}>
                <div
                  className={`h-2 rounded-full ${s.expenseCents > workspace.monthlyCapCents ? "bg-neg" : "bg-accent"}`}
                  style={{ width: `${Math.min(100, (s.expenseCents / workspace.monthlyCapCents) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-subtle">
                {s.expenseCents > workspace.monthlyCapCents
                  ? `passou do teto em ${formatBRL(s.expenseCents - workspace.monthlyCapCents)}`
                  : `restam ${formatBRL(workspace.monthlyCapCents - s.expenseCents)}`}
              </p>
            </Card>
          ) : null}
        </section>
      )}

      {attention.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg leading-6 font-semibold tracking-[-0.2px]">
              Vencimentos{overdueCount > 0 && <span className="ml-2 text-sm font-medium text-neg">{overdueCount} atrasada(s)</span>}
            </h2>
            <Link href="/previsao/pagar" className="text-sm underline">Ver tudo</Link>
          </div>
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {attention.slice(0, 5).map((r) => (
                <li key={`${r.commitment.id}|${r.seq}`} className="flex items-center gap-3 p-3">
                  <span className={`w-12 shrink-0 font-mono text-[13px] ${r.status === "overdue" ? "font-semibold text-neg" : "text-ink-subtle"}`}>
                    {formatDateBR(r.date).slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.commitment.description}</span>
                  <span className="font-medium tabular-nums">{formatBRL(r.commitment.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <dl className="grid grid-cols-3 rounded-xl border border-line bg-raised">
        <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
          <dt className="flex items-center gap-1 text-xs text-ink-muted"><ArrowDownLeft size={14} aria-hidden />Entradas</dt>
          <dd className="font-semibold text-pos tabular-nums">+{formatBRL(s.incomeCents)}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1 border-l border-line px-4 py-3">
          <dt className="flex items-center gap-1 text-xs text-ink-muted"><ArrowUpRight size={14} aria-hidden />Saídas</dt>
          <dd className="font-semibold tabular-nums">{formatBRL(s.expenseCents)}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1 border-l border-line px-4 py-3">
          <dt className="text-xs text-ink-muted">Sobrou</dt>
          <dd className={`font-semibold tabular-nums ${s.netCents < 0 ? "text-neg" : ""}`}>{formatBRL(s.netCents)}</dd>
        </div>
      </dl>
      <p className="-mt-3 text-xs text-ink-subtle">
        Saídas incluem compras no cartão. Transferências e pagamento de fatura não contam como gasto.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg leading-6 font-semibold tracking-[-0.2px]">Para onde foi o dinheiro</h2>
        {s.byCategory.length === 0 ? (
          <Empty>
            Sem saídas neste mês. <Link className="underline" href="/lancamentos">Lançar um gasto</Link> ou{" "}
            <Link className="underline" href="/importar">importar um extrato</Link>.
          </Empty>
        ) : (
          <Card>
            <ul className="flex flex-col gap-3">
              {s.byCategory.map((c) => (
                <li key={c.categoryId ?? "none"} className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <span>{c.categoryId ? (catName.get(c.categoryId) ?? "?") : "Sem categoria"}</span>
                    <span className="font-medium tabular-nums">{formatBRL(c.totalCents)}</span>
                  </div>
                  <div
                    className={`h-1.5 rounded-full ${c.categoryId && catColor.get(c.categoryId) ? "" : "bg-accent-text"}`}
                    style={{
                      width: `${Math.max(2, (c.totalCents / max) * 100)}%`,
                      ...(c.categoryId && catColor.get(c.categoryId) ? { background: catColor.get(c.categoryId)! } : {}),
                    }}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {(accounts ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg leading-6 font-semibold tracking-[-0.2px]">Contas</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {(accounts ?? []).map((a) => (
                <li key={a.id} className="flex justify-between p-3">
                  <span>{a.name}</span>
                  <span className="font-medium tabular-nums">
                    {formatBRL(balanceById.get(a.id) ?? a.opening_balance_cents)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
