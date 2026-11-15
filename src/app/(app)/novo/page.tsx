import Link from "next/link";
import { Flash, str } from "@/components/flash";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import type { Account, Category, CreditCard } from "@/lib/types";
import { createTransaction } from "../lancamentos/actions";
import { TransactionForm } from "../lancamentos/transaction-form";

const KINDS = ["expense", "income", "transfer", "invoice_payment"] as const;

/** Destino do botão "+": um só lugar para lançar despesa, entrada, transferência ou pagar fatura. */
export default async function NovoPage({ searchParams }: PageProps<"/novo">) {
  const sp = await searchParams;
  const tipo = str(sp.tipo);
  const defaultKind = KINDS.find((k) => k === tipo) ?? "expense";
  const { supabase } = await requireUser();

  const [{ data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
  ]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageHeader title="Novo lançamento" />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {(accounts ?? []).length === 0 ? (
        <Empty>
          Para lançar, cadastre antes uma conta em <Link className="underline" href="/contas">Contas</Link>.
        </Empty>
      ) : (
        <TransactionForm
          action={createTransaction}
          defaultKind={defaultKind}
          accounts={(accounts ?? []).map((a) => ({ id: a.id, label: a.name }))}
          cards={(cards ?? []).map((c) => ({
            id: c.id,
            accountId: c.account_id,
            label: c.last4 ? `${c.name} •••• ${c.last4}` : c.name,
          }))}
          categories={(cats ?? []).map((c) => ({ id: c.id, label: c.name }))}
          today={todayISO()}
        />
      )}

      <Card className="flex flex-col gap-1 text-sm">
        <p className="font-medium">Outras coisas para lançar</p>
        <Link className="text-accent-text underline" href="/previsao/pagar?novo=1">Conta a pagar, assinatura ou parcelado</Link>
        <Link className="text-accent-text underline" href="/cambio">Compra internacional no cartão</Link>
        <Link className="text-accent-text underline" href="/importar">Importar um extrato ou fatura</Link>
      </Card>
    </div>
  );
}
