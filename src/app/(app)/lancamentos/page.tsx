import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { Card, Empty, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
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
import { createTransaction, deleteTransaction, markPaid } from "./actions";
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

  // Busca e filtros (GET). Valores são validados antes de virar filtro.
  const q = (str(sp.q) ?? "").trim().slice(0, 80);
  const fConta = str(sp.conta);
  const fCat = str(sp.cat);
  const fTipo = str(sp.tipo);
  const fSit = str(sp.sit);
  const allMonths = str(sp.todos) === "1";
  const filtering = Boolean(q || fConta || fCat || fTipo || fSit);
  const uuidRe = /^[0-9a-f-]{36}$/i;

  let txQuery = supabase
    .from("transactions")
    .select("id,kind,amount_cents,occurred_on,description,category_id,account_id,card_id,transfer_account_id,fx_currency,fx_amount_minor,fx_rate_micro,fx_estimated,status")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (filtering && allMonths) txQuery = txQuery.limit(300);
  else txQuery = txQuery.gte("occurred_on", start).lt("occurred_on", end);
  if (q) txQuery = txQuery.ilike("description", `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (fConta && /^[ac]:[0-9a-f-]{36}$/i.test(fConta)) {
    txQuery = fConta[0] === "a" ? txQuery.eq("account_id", fConta.slice(2)) : txQuery.eq("card_id", fConta.slice(2));
  }
  if (fCat === "none") txQuery = txQuery.is("category_id", null);
  else if (fCat && uuidRe.test(fCat)) txQuery = txQuery.eq("category_id", fCat);
  if (fTipo && ["income", "expense", "transfer", "invoice_payment"].includes(fTipo)) txQuery = txQuery.eq("kind", fTipo);
  if (fSit === "paid" || fSit === "pending") txQuery = txQuery.eq("status", fSit);

  const [{ data: txs }, { data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    txQuery.overrideTypes<Transaction[]>(),
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

      <form method="get" role="search" className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-3">
        <input type="hidden" name="mes" value={month} />
        <input name="q" defaultValue={q} placeholder="Buscar por descrição…" aria-label="Buscar lançamento" className={inputCls} />
        <div className="grid gap-2 sm:grid-cols-4">
          <select name="conta" defaultValue={fConta ?? ""} aria-label="Conta ou cartão" className={inputCls}>
            <option value="">Todas as contas e cartões</option>
            <optgroup label="Contas">
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
              ))}
            </optgroup>
            <optgroup label="Cartões">
              {(cards ?? []).map((c) => (
                <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
          </select>
          <select name="cat" defaultValue={fCat ?? ""} aria-label="Categoria" className={inputCls}>
            <option value="">Todas as categorias</option>
            <option value="none">Sem categoria</option>
            {(cats ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={fTipo ?? ""} aria-label="Tipo" className={inputCls}>
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select name="sit" defaultValue={fSit ?? ""} aria-label="Situação" className={inputCls}>
            <option value="">Pagos e previstos</option>
            <option value="paid">Só pagos</option>
            <option value="pending">Só previstos</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="todos" value="1" defaultChecked={allMonths} />
            Buscar em todos os meses
          </label>
          <button className={btnPrimary}>Filtrar</button>
          {filtering && <a href={`/lancamentos?mes=${month}`} className={btnGhost}>Limpar</a>}
          {filtering && <span className="text-sm text-ink-muted">{(txs ?? []).length} resultado(s)</span>}
        </div>
      </form>

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

      {byDay.size === 0 && <Empty>{filtering ? "Nenhum lançamento encontrado com esses filtros." : "Nenhum lançamento neste mês."}</Empty>}

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
                {t.status === "pending" && (
                  <form action={markPaid}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="mes" value={month} />
                    <button title="Marcar como pago" className="rounded-full bg-warn-tint px-2 py-0.5 text-xs font-medium text-warn">
                      Previsto · marcar pago
                    </button>
                  </form>
                )}
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
