import Link from "next/link";
import { str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { Card, Empty, PageHeader, btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ArrowDownLeft, ArrowUpRight } from "@phosphor-icons/react/ssr";
import { currentMonth, formatDateBR, isValidMonth, monthRange, todayISO } from "@/lib/dates";
import { loadPayables } from "@/lib/payables";
import { formatBRL } from "@/lib/money";
import { summarize } from "@/lib/summary";
import type { Account, AccountBalance, Category, Transaction } from "@/lib/types";

export default async function ResumoPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase } = await requireUser();

  const [{ data: txs }, { data: cats }, { data: accounts }, { data: balances }, payables] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id")
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .overrideTypes<Transaction[]>(),
    supabase.from("categories").select("id,name").overrideTypes<Category[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),
    loadPayables(supabase, todayISO(), 14),
  ]);

  // Atrasadas + o que vence nos próximos 7 dias (e ainda não foi pago).
  const attention = payables.rows
    .filter((r) => r.status === "overdue" || (r.status === "due_soon" && r.daysUntil <= 7))
    .sort((a, b) => a.date.localeCompare(b.date));
  const overdueCount = attention.filter((r) => r.status === "overdue").length;

  const s = summarize(txs ?? []);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
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
        action={<MonthNav base="/" month={month} />}
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
      </section>

      {attention.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg leading-6 font-semibold tracking-[-0.2px]">
              Vencimentos{overdueCount > 0 && <span className="ml-2 text-sm font-medium text-neg">{overdueCount} atrasada(s)</span>}
            </h2>
            <Link href="/pagar" className="text-sm underline">Ver tudo</Link>
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
                    className="h-1.5 rounded-full bg-accent-text"
                    style={{ width: `${Math.max(2, (c.totalCents / max) * 100)}%` }}
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
