import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { currentMonth, isValidMonth, monthRange, todayISO } from "@/lib/dates";
import { formatForeign, formatRateMicro } from "@/lib/fx";
import { formatBRL } from "@/lib/money";
import { summarize } from "@/lib/summary";
import {
  KIND_LABEL,
  type Account,
  type Category,
  type CreditCard,
  type Transaction,
} from "@/lib/types";
import { createTransaction, deleteTransaction } from "./actions";
import { TransactionForm } from "./transaction-form";

const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function LancamentosPage({ searchParams }: PageProps<"/lancamentos">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase } = await requireUser();

  const [{ data: txs }, { data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,fx_currency,fx_amount_minor,fx_rate_micro,fx_estimated")
      .gte("occurred_on", start)
      .lt("occurred_on", end)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .overrideTypes<Transaction[]>(),
    // Todas (inclusive arquivadas): lançamentos antigos ainda precisam mostrar o nome.
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

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.archived ? `${a.name} (arquivada)` : a.name]));
  const cardName = new Map((cards ?? []).map((c) => [c.id, c.archived ? `${c.name} (arquivado)` : c.name]));
  // Formulário de novo lançamento: só itens ativos.
  const activeAccounts = (accounts ?? []).filter((a) => !a.archived);
  const activeCards = (cards ?? []).filter((c) => !c.archived);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const s = summarize(txs ?? []);

  function where(t: Transaction): string {
    switch (t.kind) {
      case "transfer":
        return `${accountName.get(t.account_id ?? "") ?? "?"} → ${accountName.get(t.transfer_account_id ?? "") ?? "?"}`;
      case "invoice_payment":
        return `${accountName.get(t.account_id ?? "") ?? "?"} → fatura ${cardName.get(t.card_id ?? "") ?? "?"}`;
      default:
        return t.card_id
          ? (cardName.get(t.card_id) ?? "Cartão")
          : (accountName.get(t.account_id ?? "") ?? "?");
    }
  }

  const byDay = new Map<string, Transaction[]>();
  for (const t of txs ?? []) {
    byDay.set(t.occurred_on, [...(byDay.get(t.occurred_on) ?? []), t]);
  }

  const noAccounts = activeAccounts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lançamentos" action={<MonthNav base="/lancamentos" month={month} />} />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {noAccounts ? (
        <Empty>
          Para lançar, primeiro cadastre uma conta em <a className="underline" href="/contas">Contas</a>.
        </Empty>
      ) : (
        <TransactionForm
          action={createTransaction}
          accounts={activeAccounts.map((a) => ({ id: a.id, label: a.name }))}
          cards={activeCards.map((c) => ({
            id: c.id,
            accountId: c.account_id,
            label: c.last4 ? `${c.name} •••• ${c.last4}` : c.name,
          }))}
          categories={(cats ?? []).map((c) => ({ id: c.id, label: c.name }))}
          today={todayISO()}
        />
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Card className="!p-3">
          <p className="text-xs text-ink-subtle">Entradas</p>
          <p className="font-semibold text-pos tabular-nums">{formatBRL(s.incomeCents)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-ink-subtle">Saídas</p>
          <p className="font-semibold tabular-nums">{formatBRL(s.expenseCents)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-xs text-ink-subtle">Resultado</p>
          <p className={`font-semibold tabular-nums ${s.netCents < 0 ? "text-neg" : ""}`}>{formatBRL(s.netCents)}</p>
        </Card>
      </div>

      {byDay.size === 0 && <Empty>Nenhum lançamento neste mês.</Empty>}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">{dayLabel(day)}</h2>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-raised">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.description || KIND_LABEL[t.kind]}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {[t.category_id ? catName.get(t.category_id) : null, where(t)].filter(Boolean).join(" · ")}
                  </p>
                  {t.fx_currency && t.fx_amount_minor && t.fx_rate_micro && (
                    <p className="truncate text-xs text-ink-subtle">
                      {formatForeign(t.fx_currency, t.fx_amount_minor)} a {formatRateMicro(t.fx_rate_micro)}
                      {t.fx_estimated && (
                        <a href="/cambio" className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 font-medium text-warn">
                          estimativa
                        </a>
                      )}
                    </p>
                  )}
                </div>
                <span className={`font-medium tabular-nums ${t.kind === "income" ? "text-pos" : ""}`}>
                  {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
                  {formatBRL(t.amount_cents)}
                </span>
                <Link
                  href={`/lancamentos/${t.id}/editar`}
                  aria-label={`Editar ${t.description || KIND_LABEL[t.kind]}`}
                  className="rounded-md px-2 py-1 text-sm text-ink-subtle hover:text-accent-text"
                >
                  Editar
                </Link>
                <form action={deleteTransaction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="mes" value={month} />
                  <ConfirmButton
                    message="Excluir este lançamento?"
                    aria-label="Excluir lançamento"
                    className="rounded-md px-2 py-1 text-ink-subtle hover:text-neg"
                  >
                    ×
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
