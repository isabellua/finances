import Link from "next/link";
import { str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { Card, Empty, PageHeader, btnPrimary } from "@/components/ui";
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

  const [{ data: txs }, { data: cats }, { data: accounts }, { data: balances }] = await Promise.all([
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
      <PageHeader
        title="Resumo"
        action={<MonthNav base="/" month={month} />}
      />

      <Card className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500">Saldo total nas contas</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatBRL(totalBalance)}</p>
        {(accounts ?? []).length === 0 && (
          <Link href="/contas" className={`${btnPrimary} mt-2 w-fit`}>Cadastrar primeira conta</Link>
        )}
      </Card>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Card className="!p-3">
          <p className="text-xs text-zinc-500">Entradas</p>
          <p className="font-semibold text-emerald-700 tabular-nums">{formatBRL(s.incomeCents)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-zinc-500">Saídas</p>
          <p className="font-semibold tabular-nums">{formatBRL(s.expenseCents)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-zinc-500">Sobrou</p>
          <p className={`font-semibold tabular-nums ${s.netCents < 0 ? "text-red-700" : ""}`}>{formatBRL(s.netCents)}</p>
        </Card>
      </section>
      <p className="-mt-3 text-xs text-zinc-500">
        Saídas incluem compras no cartão. Transferências e pagamento de fatura não contam como gasto.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Para onde foi o dinheiro</h2>
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
                  <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-emerald-600"
                      style={{ width: `${Math.max(2, (c.totalCents / max) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {(accounts ?? []).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Contas</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
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
