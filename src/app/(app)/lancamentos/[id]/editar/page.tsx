import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Flash, str } from "@/components/flash";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import type { Account, Category, CreditCard, Transaction } from "@/lib/types";
import { updateTransaction } from "../../actions";
import { TransactionForm, type TransactionInitial } from "../../transaction-form";

export default async function EditarLancamentoPage({
  params,
  searchParams,
}: PageProps<"/lancamentos/[id]/editar">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: tx }, { data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id")
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<Transaction>(),
    // Contas e cartões arquivados aparecem na edição se o lançamento ainda aponta para eles.
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
  ]);
  if (!tx) notFound();

  const usedAccounts = new Set([tx.account_id, tx.transfer_account_id].filter(Boolean));
  const accountList = (accounts ?? []).filter((a) => !a.archived || usedAccounts.has(a.id));
  const cardList = (cards ?? []).filter((c) => !c.archived || c.id === tx.card_id);

  const initial: TransactionInitial = {
    id: tx.id,
    kind: tx.kind,
    amount: centsToInput(tx.amount_cents),
    source: tx.card_id && tx.kind === "expense" ? `c:${tx.card_id}` : `a:${tx.account_id}`,
    target:
      tx.kind === "transfer"
        ? `a:${tx.transfer_account_id}`
        : tx.kind === "invoice_payment"
          ? `c:${tx.card_id}`
          : "",
    categoryId: tx.category_id ?? "",
    date: tx.occurred_on,
    description: tx.description,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Editar lançamento"
        action={
          <Link href={`/lancamentos?mes=${tx.occurred_on.slice(0, 7)}`} className="text-sm underline">
            Voltar
          </Link>
        }
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />
      <TransactionForm
        action={updateTransaction}
        accounts={accountList.map((a) => ({ id: a.id, label: a.name }))}
        cards={cardList.map((c) => ({
          id: c.id,
          accountId: c.account_id,
          label: c.last4 ? `${c.name} •••• ${c.last4}` : c.name,
        }))}
        categories={(cats ?? []).map((c) => ({ id: c.id, label: c.name }))}
        today={todayISO()}
        initial={initial}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
