import { Flash, str } from "@/components/flash";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import {
  ACCOUNT_TYPE_LABEL,
  type Account,
  type AccountBalance,
} from "@/lib/types";
import { archiveAccount, createAccount } from "./actions";

export default async function ContasPage({
  searchParams,
}: PageProps<"/contas">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("account_balances")
      .select("account_id,balance_cents")
      .overrideTypes<AccountBalance[]>(),
  ]);

  const balanceById = new Map(
    (balances ?? []).map((b) => [b.account_id, b.balance_cents]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Contas</h1>
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <ul className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {(accounts ?? []).length === 0 && (
          <li className="p-3 text-sm text-zinc-500">Nenhuma conta ainda.</li>
        )}
        {(accounts ?? []).map((a) => (
          <li key={a.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-zinc-500">
                {[a.institution, ACCOUNT_TYPE_LABEL[a.type]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span className="tabular-nums">
              {formatBRL(balanceById.get(a.id) ?? a.opening_balance_cents)}
            </span>
            <form action={archiveAccount}>
              <input type="hidden" name="id" value={a.id} />
              <button className="text-xs text-zinc-500 underline">Arquivar</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={createAccount} className="grid gap-3 rounded border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
        <h2 className="font-medium sm:col-span-2">Nova conta</h2>
        <label className="flex flex-col gap-1 text-sm">
          Nome
          <input name="name" required maxLength={80} className="rounded border border-zinc-300 bg-white p-2 text-black" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Banco
          <input name="institution" maxLength={80} placeholder="Itaú, Banco do Brasil…" className="rounded border border-zinc-300 bg-white p-2 text-black" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select name="type" className="rounded border border-zinc-300 bg-white p-2 text-black">
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Saldo inicial (R$)
          <input name="opening" inputMode="decimal" placeholder="0,00" className="rounded border border-zinc-300 bg-white p-2 text-black" />
        </label>
        <button className="rounded bg-emerald-700 p-2 font-medium text-white sm:col-span-2">
          Criar conta
        </button>
      </form>
    </div>
  );
}
