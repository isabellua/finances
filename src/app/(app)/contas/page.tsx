import Link from "next/link";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import { BankLogo } from "@/components/bank-logo";
import { BankPicker } from "@/components/bank-picker";
import { CARD_BRANDS, bankOf } from "@/lib/banks";
import { formatBps } from "@/lib/fx";
import { centsToInput, formatBRL } from "@/lib/money";
import {
  ACCOUNT_TYPE_LABEL,
  type Account,
  type AccountBalance,
  type CreditCard,
} from "@/lib/types";
import {
  archiveAccount,
  archiveCard,
  createAccount,
  createCard,
  deleteAccountForever,
  deleteCardForever,
  restoreAccount,
  restoreCard,
  updateAccount,
  updateCard,
} from "./actions";

const RULE_OPTIONS = [
  ["purchase_date", "Dia da compra"],
  ["closing_date", "Dia do fechamento da fatura"],
  ["due_date", "Dia do vencimento da fatura"],
] as const;

/** Taxas de compra internacional do cartão: preenchidas uma vez e usadas pela calculadora. */
function FxFields({ c }: { c?: CreditCard }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:col-span-2 sm:grid-cols-3">
      <legend className="px-1 text-sm font-medium">Compra internacional (opcional)</legend>
      <Field label="Spread do banco (%)" hint="Taxa de conversão cobrada pelo emissor. Veja no app do banco.">
        <input name="fx_spread" inputMode="decimal" defaultValue={c?.fx_spread_bps != null ? formatBps(c.fx_spread_bps) : ""} placeholder="Ex.: 4" className={inputCls} />
      </Field>
      <Field label="IOF próprio (%)" hint="Deixe em branco para usar o IOF padrão. 0 se o banco absorve.">
        <input name="fx_iof" inputMode="decimal" defaultValue={c?.fx_iof_bps != null ? formatBps(c.fx_iof_bps) : ""} className={inputCls} />
      </Field>
      <Field label="Cotação usada pelo banco" hint="Confirme com o banco.">
        <select name="fx_rule" defaultValue={c?.fx_rate_rule ?? "purchase_date"} className={inputCls}>
          {RULE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
    </fieldset>
  );
}

export default async function ContasPage({ searchParams }: PageProps<"/contas">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const novo = str(sp.novo);
  const editar = str(sp.editar);
  const editarCartao = str(sp.editarCartao);
  const contaSel = str(sp.conta);

  // Uma única rodada ao banco: as seis consultas são independentes.
  const [
    { data: accounts },
    { data: cards },
    { data: balances },
    { data: archivedAccounts },
    { data: archivedCards },
    { data: allCards },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,bank_slug,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),

    supabase
      .from("accounts")
      .select("id,name,institution,bank_slug,type,opening_balance_cents,archived")
      .eq("archived", true)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", true)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("credit_cards").select("id,account_id").overrideTypes<{ id: string; account_id: string }[]>(),
  ]);

  const balanceById = new Map((balances ?? []).map((b) => [b.account_id, b.balance_cents]));
  const list = accounts ?? [];

  // Arquivadas: ficam fora das telas de uso, mas aqui dá para restaurar ou excluir.

  async function countFor(filter: string): Promise<number> {
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .or(filter);
    return count ?? 0;
  }

  const archivedAcc = await Promise.all(
    (archivedAccounts ?? []).map(async (a) => {
      const cardIds = (allCards ?? []).filter((c) => c.account_id === a.id).map((c) => c.id);
      const parts = [`account_id.eq.${a.id}`, `transfer_account_id.eq.${a.id}`];
      if (cardIds.length > 0) parts.push(`card_id.in.(${cardIds.join(",")})`);
      return { account: a, txCount: await countFor(parts.join(",")) };
    }),
  );
  const archivedAccountIds = new Set((archivedAccounts ?? []).map((a) => a.id));
  // Cartões arquivados de contas ativas (os de conta arquivada saem junto com a conta).
  const archivedLooseCards = await Promise.all(
    (archivedCards ?? [])
      .filter((c) => !archivedAccountIds.has(c.account_id))
      .map(async (c) => ({ card: c, txCount: await countFor(`card_id.eq.${c.id}`) })),
  );
  const archivedTotal = archivedAcc.length + archivedLooseCards.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas e cartões"
        subtitle="Cada cartão fica dentro da conta que paga a fatura."
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {list.length === 0 && novo !== "conta" && <Empty>Comece adicionando sua primeira conta.</Empty>}

      {list.length > 0 && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Saldo total</span>
          <span className="text-xl font-semibold tabular-nums">
            {formatBRL(list.reduce((t, a) => t + (balanceById.get(a.id) ?? 0), 0))}
          </span>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Contas</h2>
          <Link href="/contas?novo=conta" className={btnPrimary}>+ Adicionar conta</Link>
        </div>

        {novo === "conta" && (
          <Card>
            <form action={createAccount} className="grid gap-4">
              <BankPicker />
              <div className="flex gap-2">
                <button className={btnPrimary}>Criar conta</button>
                <Link href="/contas" className={btnGhost}>Cancelar</Link>
              </div>
            </form>
          </Card>
        )}

        {list.map((a) => {
          const bank = bankOf(a);
          const editing = editar === a.id;
          return (
            <Card key={a.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <BankLogo bank={bank} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="text-xs text-ink-subtle">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                </div>
                <p className="text-lg font-semibold tabular-nums">{formatBRL(balanceById.get(a.id) ?? 0)}</p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs font-medium">
                <Link href={`/contas?novo=cartao&conta=${a.id}`} className="text-accent-text underline">+ Cartão de crédito</Link>
                <Link href={editing ? "/contas" : `/contas?editar=${a.id}`} className="text-accent-text underline">
                  {editing ? "Fechar" : "Editar"}
                </Link>
              </div>
              {editing && (
                <form action={updateAccount} className="grid gap-4 border-t border-line pt-3">
                  <input type="hidden" name="id" value={a.id} />
                  <BankPicker
                    defaultSlug={bank.slug}
                    defaultType={a.type}
                    defaultOther={bank.slug === "outro" ? (a.institution ?? "") : ""}
                  />
                  <button className={`${btnPrimary} w-fit`}>Salvar alterações</button>
                </form>
              )}
              <form action={archiveAccount} className="text-right">
                <input type="hidden" name="id" value={a.id} />
                <ConfirmButton
                  message={`Arquivar a conta ${a.name}? Ela sai das telas de uso e do saldo total, mas os lançamentos continuam existindo. Fica em “Arquivadas”, no fim da página.`}
                  className="text-xs text-ink-subtle underline"
                >
                  Arquivar conta
                </ConfirmButton>
              </form>
            </Card>
          );
        })}
      </section>

      {list.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Cartões de crédito</h2>
            <Link href="/contas?novo=cartao" className={btnGhost}>+ Adicionar cartão</Link>
          </div>

          {novo === "cartao" && (
            <Card>
              <form action={createCard} className="grid gap-3 sm:grid-cols-2">
                <Field label="Conta que paga a fatura (define o banco e o logo)" className="sm:col-span-2">
                  <select name="account_id" defaultValue={contaSel ?? list[0].id} required className={inputCls}>
                    {list.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name} · {ACCOUNT_TYPE_LABEL[acc.type]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Bandeira">
                  <select name="brand" required className={inputCls}>
                    {CARD_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Final do cartão" hint="Opcional, 4 dígitos">
                  <input name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className={inputCls} />
                </Field>
                <Field label="Dia que a fatura fecha">
                  <input name="closing_day" type="number" min={1} max={31} required className={inputCls} />
                </Field>
                <Field label="Dia que vence">
                  <input name="due_day" type="number" min={1} max={31} required className={inputCls} />
                </Field>
                <Field label="Limite (R$)" hint="Opcional" className="sm:col-span-2">
                  <input name="limit" inputMode="decimal" className={inputCls} />
                </Field>
                <FxFields />
                <div className="flex gap-2 sm:col-span-2">
                  <button className={btnPrimary}>Salvar cartão</button>
                  <Link href="/contas" className={btnGhost}>Cancelar</Link>
                </div>
              </form>
            </Card>
          )}

          {(cards ?? []).length === 0 && novo !== "cartao" && <Empty>Nenhum cartão ainda.</Empty>}

          {(cards ?? []).map((c) => {
            const acc = list.find((x) => x.id === c.account_id);
            const bank = acc ? bankOf(acc) : bankOf({ institution: null, name: c.name });
            const editingCard = editarCartao === c.id;
            return (
              <div key={c.id} className="flex flex-col gap-3">
                <div
                  className="flex flex-col gap-6 rounded-2xl p-4 shadow-sm"
                  style={{ backgroundColor: bank.color, color: bank.ink }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{bank.name}</p>
                      <p className="text-xs opacity-80">{c.brand ?? "Cartão"} · paga por {acc?.name ?? "—"}</p>
                    </div>
                    <BankLogo bank={bank} size={40} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="font-mono text-sm tracking-widest">•••• {c.last4 ?? "····"}</p>
                    <div className="text-right text-xs opacity-90">
                      <p>Fecha dia {c.closing_day} · vence dia {c.due_day}</p>
                      {c.credit_limit_cents != null && (
                        <p className="tabular-nums">Limite {formatBRL(c.credit_limit_cents)}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                  <Link href={`/previsao/faturas?cartao=${c.id}`} className="text-accent-text underline">Ver fatura</Link>
                  <Link href={`/cambio?cartao=${c.id}`} className="text-accent-text underline">Converter compra internacional</Link>
                  <Link href={editingCard ? "/contas" : `/contas?editarCartao=${c.id}`} className="text-accent-text underline">
                    {editingCard ? "Fechar" : "Editar"}
                  </Link>
                  <form action={archiveCard} className="ml-auto">
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={`Arquivar o cartão ${c.name}? Ele sai das telas de uso, mas os lançamentos continuam existindo. Fica em “Arquivadas”, no fim da página.`}
                      className="text-ink-subtle underline"
                    >
                      Arquivar
                    </ConfirmButton>
                  </form>
                </div>
                {editingCard && (
                  <Card>
                    <form action={updateCard} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Conta que paga a fatura" className="sm:col-span-2">
                        <select name="account_id" defaultValue={c.account_id} className={inputCls}>
                          {list.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Bandeira">
                        <select name="brand" defaultValue={c.brand ?? "Outra"} className={inputCls}>
                          {CARD_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </Field>
                      <Field label="Final do cartão" hint="Opcional, 4 dígitos">
                        <input name="last4" defaultValue={c.last4 ?? ""} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className={inputCls} />
                      </Field>
                      <Field label="Dia que a fatura fecha">
                        <input name="closing_day" type="number" min={1} max={31} defaultValue={c.closing_day} required className={inputCls} />
                      </Field>
                      <Field label="Dia que vence">
                        <input name="due_day" type="number" min={1} max={31} defaultValue={c.due_day} required className={inputCls} />
                      </Field>
                      <Field label="Limite (R$)" hint="Opcional" className="sm:col-span-2">
                        <input name="limit" defaultValue={c.credit_limit_cents != null ? centsToInput(c.credit_limit_cents) : ""} inputMode="decimal" className={inputCls} />
                      </Field>
                      <FxFields c={c} />
                      <button className={`${btnPrimary} sm:col-span-2`}>Salvar alterações</button>
                    </form>
                  </Card>
                )}
              </div>
            );
          })}
        </section>
      )}

      {archivedTotal > 0 && (
        <details id="arquivadas" open={str(sp.arq) === "1"} className="group">
          <summary className={`${btnGhost} w-fit cursor-pointer list-none`}>
            Arquivadas ({archivedTotal})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-ink-subtle">
              Itens arquivados não aparecem nos formulários nem no saldo. Restaure para voltar a usar, ou exclua de vez.
              Excluir apaga também os lançamentos ligados ao item e não tem volta.
            </p>

            {archivedAcc.map(({ account: a, txCount }) => {
              const cardsOf = (archivedCards ?? []).filter((c) => c.account_id === a.id);
              return (
                <Card key={a.id} className="flex flex-col gap-3">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-ink-subtle">
                      {ACCOUNT_TYPE_LABEL[a.type]} · {txCount} lançamento(s) ligado(s)
                      {cardsOf.length > 0 ? ` · ${cardsOf.length} cartão(ões): ${cardsOf.map((c) => c.name).join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={restoreAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className={btnGhost}>Restaurar</button>
                    </form>
                    <form action={deleteAccountForever}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton
                        message={`Excluir DEFINITIVAMENTE a conta ${a.name}?\n\nSerão apagados ${txCount} lançamento(s)${cardsOf.length > 0 ? ` e ${cardsOf.length} cartão(ões)` : ""}, incluindo transferências entre esta conta e as outras (isso altera o saldo das outras). Não tem como desfazer.`}
                        className={`${btnGhost} text-neg`}
                      >
                        Excluir definitivamente
                      </ConfirmButton>
                    </form>
                  </div>
                </Card>
              );
            })}

            {archivedLooseCards.map(({ card: c, txCount }) => (
              <Card key={c.id} className="flex flex-col gap-3">
                <div>
                  <p className="font-semibold">
                    {c.name}
                    {c.last4 ? <span className="text-ink-subtle"> •••• {c.last4}</span> : null}
                  </p>
                  <p className="text-xs text-ink-subtle">Cartão · {txCount} lançamento(s) ligado(s)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={restoreCard}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={btnGhost}>Restaurar</button>
                  </form>
                  <form action={deleteCardForever}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={`Excluir DEFINITIVAMENTE o cartão ${c.name}?\n\nSerão apagados ${txCount} lançamento(s) (compras e pagamentos de fatura dele). Não tem como desfazer.`}
                      className={`${btnGhost} text-neg`}
                    >
                      Excluir definitivamente
                    </ConfirmButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
