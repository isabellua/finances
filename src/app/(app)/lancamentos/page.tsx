import { Flash, str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { requireUser } from "@/lib/auth";
import { currentMonth, formatDateBR, isValidMonth, monthRange, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import {
  KIND_LABEL,
  type Account,
  type Category,
  type CreditCard,
  type Transaction,
} from "@/lib/types";
import { createTransaction, deleteTransaction } from "./actions";

export default async function LancamentosPage({
  searchParams,
}: PageProps<"/lancamentos">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase } = await requireUser();

  const [{ data: txs }, { data: accounts }, { data: cards }, { data: cats }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id")
        .gte("occurred_on", start)
        .lt("occurred_on", end)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .overrideTypes<Transaction[]>(),
      supabase
        .from("accounts")
        .select("id,name,institution,type,opening_balance_cents,archived")
        .eq("archived", false)
        .order("created_at")
        .overrideTypes<Account[]>(),
      supabase
        .from("credit_cards")
        .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,archived")
        .eq("archived", false)
        .order("created_at")
        .overrideTypes<CreditCard[]>(),
      supabase
        .from("categories")
        .select("id,name,kind")
        .order("name")
        .overrideTypes<Category[]>(),
    ]);

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const cardName = new Map((cards ?? []).map((c) => [c.id, c.name]));
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));

  function where(t: Transaction): string {
    switch (t.kind) {
      case "transfer":
        return `${accountName.get(t.account_id ?? "") ?? "?"} → ${accountName.get(t.transfer_account_id ?? "") ?? "?"}`;
      case "invoice_payment":
        return `${accountName.get(t.account_id ?? "") ?? "?"} → fatura ${cardName.get(t.card_id ?? "") ?? "?"}`;
      default:
        return t.card_id
          ? `Cartão ${cardName.get(t.card_id) ?? "?"}`
          : (accountName.get(t.account_id ?? "") ?? "?");
    }
  }

  const noAccounts = (accounts ?? []).length === 0;
  const input = "rounded border border-zinc-300 bg-white p-2 text-black";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
        <MonthNav base="/lancamentos" month={month} />
      </div>
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {noAccounts ? (
        <p className="rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          Cadastre uma conta em <a className="underline" href="/contas">Contas</a> para começar a lançar.
        </p>
      ) : (
        <form action={createTransaction} className="grid gap-3 rounded border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
          <label className="flex flex-col gap-1 text-sm">
            Tipo
            <select name="kind" defaultValue="expense" className={input}>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Valor (R$)
            <input name="amount" inputMode="decimal" required placeholder="0,00" autoFocus className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Origem (conta ou cartão)
            <select name="source" required className={input}>
              <optgroup label="Contas">
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
              {(cards ?? []).length > 0 && (
                <optgroup label="Cartões (só para Saída)">
                  {(cards ?? []).map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Destino (só transferência ou pagamento de fatura)
            <select name="target" defaultValue="" className={input}>
              <option value="">—</option>
              <optgroup label="Contas">
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
              {(cards ?? []).length > 0 && (
                <optgroup label="Cartões">
                  {(cards ?? []).map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Categoria (entrada/saída)
            <select name="category_id" defaultValue="" className={input}>
              <option value="">Sem categoria</option>
              <optgroup label="Saídas">
                {(cats ?? []).filter((c) => c.kind === "expense").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Entradas">
                {(cats ?? []).filter((c) => c.kind === "income").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Data
            <input name="occurred_on" type="date" required defaultValue={todayISO()} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Descrição
            <input name="description" maxLength={200} className={input} />
          </label>
          <button className="rounded bg-emerald-700 p-2 font-medium text-white sm:col-span-2">
            Salvar lançamento
          </button>
        </form>
      )}

      <ul className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {(txs ?? []).length === 0 && (
          <li className="p-3 text-sm text-zinc-500">Nenhum lançamento neste mês.</li>
        )}
        {(txs ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 p-3">
            <span className="w-20 shrink-0 text-xs text-zinc-500">{formatDateBR(t.occurred_on).slice(0, 5)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.description || KIND_LABEL[t.kind]}</p>
              <p className="truncate text-xs text-zinc-500">
                {[KIND_LABEL[t.kind], t.category_id ? catName.get(t.category_id) : null, where(t)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className={`tabular-nums ${t.kind === "income" ? "text-emerald-700" : ""}`}>
              {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
              {formatBRL(t.amount_cents)}
            </span>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="mes" value={month} />
              <button aria-label="Excluir lançamento" className="px-2 text-zinc-500 hover:text-red-700">×</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
