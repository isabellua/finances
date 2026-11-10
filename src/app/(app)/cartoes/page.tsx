import { Flash, str } from "@/components/flash";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import type { Account, CreditCard } from "@/lib/types";
import { archiveCard, createCard } from "./actions";

export default async function CartoesPage({
  searchParams,
}: PageProps<"/cartoes">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: cards }, { data: accounts }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
  ]);

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Cartões de crédito</h1>
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <ul className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {(cards ?? []).length === 0 && (
          <li className="p-3 text-sm text-zinc-500">Nenhum cartão ainda.</li>
        )}
        {(cards ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium">
                {c.name}
                {c.brand ? ` · ${c.brand}` : ""}
              </p>
              <p className="text-xs text-zinc-500">
                Paga pela conta {accountName.get(c.account_id) ?? "?"} · fecha dia{" "}
                {c.closing_day} · vence dia {c.due_day}
                {c.credit_limit_cents != null
                  ? ` · limite ${formatBRL(c.credit_limit_cents)}`
                  : ""}
              </p>
            </div>
            <form action={archiveCard}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-xs text-zinc-500 underline">Arquivar</button>
            </form>
          </li>
        ))}
      </ul>

      {(accounts ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">
          Crie uma conta primeiro: todo cartão precisa de uma conta que paga a fatura.
        </p>
      ) : (
        <form action={createCard} className="grid gap-3 rounded border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
          <h2 className="font-medium sm:col-span-2">Novo cartão</h2>
          <label className="flex flex-col gap-1 text-sm">
            Nome
            <input name="name" required maxLength={80} placeholder="Itaú Visa Gold" className="rounded border border-zinc-300 bg-white p-2 text-black" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Bandeira
            <input name="brand" maxLength={40} placeholder="Visa, Mastercard…" className="rounded border border-zinc-300 bg-white p-2 text-black" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Conta que paga a fatura
            <select name="account_id" required className="rounded border border-zinc-300 bg-white p-2 text-black">
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Limite (R$)
            <input name="limit" inputMode="decimal" className="rounded border border-zinc-300 bg-white p-2 text-black" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Dia de fechamento
            <input name="closing_day" type="number" min={1} max={31} required className="rounded border border-zinc-300 bg-white p-2 text-black" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Dia de vencimento
            <input name="due_day" type="number" min={1} max={31} required className="rounded border border-zinc-300 bg-white p-2 text-black" />
          </label>
          <button className="rounded bg-emerald-700 p-2 font-medium text-white sm:col-span-2">
            Criar cartão
          </button>
        </form>
      )}
    </div>
  );
}
