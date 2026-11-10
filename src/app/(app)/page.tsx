import Link from "next/link";
import { MonthNav } from "@/components/month-nav";
import { str } from "@/components/flash";
import { requireUser } from "@/lib/auth";
import { currentMonth, isValidMonth, monthRange } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { summarize } from "@/lib/summary";
import type { Account, AccountBalance, Category, Transaction } from "@/lib/types";

export default async function ResumoPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase } = await requireUser();

  const [{ data: txs }, { data: cats }, { data: accounts }, { data: balances }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id")
        .gte("occurred_on", start)
        .lt("occurred_on", end)
        .overrideTypes<Transaction[]>(),
      supabase.from("categories").select("id,name,kind").overrideTypes<Category[]>(),
      supabase
        .from("accounts")
        .select("id,name,institution,type,opening_balance_cents,archived")
        .eq("archived", false)
        .order("created_at")
        .overrideTypes<Account[]>(),
      supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),
    ]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Resumo</h1>
        <MonthNav base="/" month={month} />
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Entradas</p>
          <p className="text-lg font-semibold text-emerald-700">{formatBRL(s.incomeCents)}</p>
        </div>
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Saídas (inclui cartão)</p>
          <p className="text-lg font-semibold">{formatBRL(s.expenseCents)}</p>
        </div>
        <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Resultado do mês</p>
          <p className={`text-lg font-semibold ${s.netCents < 0 ? "text-red-700" : ""}`}>{formatBRL(s.netCents)}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Saídas por categoria</h2>
        {s.byCategory.length === 0 && (
          <p className="text-sm text-zinc-500">
            Sem saídas neste mês. <Link className="underline" href="/lancamentos">Lançar</Link>
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {s.byCategory.map((c) => (
            <li key={c.categoryId ?? "none"} className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span>{c.categoryId ? (catName.get(c.categoryId) ?? "?") : "Sem categoria"}</span>
                <span className="tabular-nums">{formatBRL(c.totalCents)}</span>
              </div>
              <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                <div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.max(2, (c.totalCents / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Saldo das contas</h2>
          <span className="tabular-nums font-semibold">{formatBRL(totalBalance)}</span>
        </div>
        <ul className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {(accounts ?? []).length === 0 && <li className="p-3 text-zinc-500">Nenhuma conta ainda.</li>}
          {(accounts ?? []).map((a) => (
            <li key={a.id} className="flex justify-between p-3">
              <span>{a.name}</span>
              <span className="tabular-nums">{formatBRL(balanceById.get(a.id) ?? a.opening_balance_cents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
