import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import { BANKS, CARD_BRANDS } from "@/lib/banks";
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

export default async function ContasPage({ searchParams }: PageProps<"/contas">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: accounts }, { data: cards }, { data: balances }] = await Promise.all([
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
    supabase.from("account_balances").select("account_id,balance_cents").overrideTypes<AccountBalance[]>(),
  ]);

  const balanceById = new Map((balances ?? []).map((b) => [b.account_id, b.balance_cents]));
  const list = accounts ?? [];

  // Arquivadas: ficam fora das telas de uso, mas aqui dá para restaurar ou excluir.
  const [{ data: archivedAccounts }, { data: archivedCards }, { data: allCards }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
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

      {list.length === 0 && <Empty>Comece adicionando sua primeira conta abaixo.</Empty>}

      {list.map((a) => {
        const accCards = (cards ?? []).filter((c) => c.account_id === a.id);
        return (
          <Card key={a.id} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-lg font-semibold">{a.name}</p>
                <p className="text-xs text-ink-subtle">{ACCOUNT_TYPE_LABEL[a.type]}</p>
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {formatBRL(balanceById.get(a.id) ?? a.opening_balance_cents)}
              </p>
            </div>

            {accCards.length > 0 && (
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {accCards.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium">
                          {c.name}
                          {c.last4 ? <span className="text-ink-subtle"> •••• {c.last4}</span> : null}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          Fecha dia {c.closing_day} · vence dia {c.due_day}
                          {c.credit_limit_cents != null ? ` · limite ${formatBRL(c.credit_limit_cents)}` : ""}
                        </p>
                      </div>
                      <form action={archiveCard}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton
                          message={`Arquivar o cartão ${c.name}? Ele sai das telas de uso, mas os lançamentos continuam existindo. Fica em “Arquivadas”, no fim da página.`}
                          className="text-xs text-ink-subtle underline"
                        >
                          Arquivar
                        </ConfirmButton>
                      </form>
                    </div>
                    <details>
                      <summary className="w-fit cursor-pointer list-none text-xs font-medium text-accent-text underline">
                        Editar cartão
                      </summary>
                      <form action={updateCard} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={c.id} />
                        <Field label="Conta que paga a fatura" className="sm:col-span-2">
                          <select name="account_id" defaultValue={c.account_id} className={inputCls}>
                            {list.map((acc) => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Bandeira">
                          <select name="brand" defaultValue={c.brand ?? "Outra"} className={inputCls}>
                            {CARD_BRANDS.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
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
                        <button className={`${btnPrimary} sm:col-span-2`}>Salvar alterações</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            <details className="group">
              <summary className={`${btnGhost} w-fit cursor-pointer list-none`}>
                + Adicionar cartão de crédito
              </summary>
              <form action={createCard} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="account_id" value={a.id} />
                <Field label="Bandeira">
                  <select name="brand" required className={inputCls}>
                    {CARD_BRANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
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
                <button className={`${btnPrimary} sm:col-span-2`}>Salvar cartão</button>
              </form>
            </details>

            <details>
              <summary className="w-fit cursor-pointer list-none text-xs font-medium text-accent-text underline">
                Editar conta
              </summary>
              <form action={updateAccount} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={a.id} />
                <Field label="Banco ou carteira">
                  <input name="institution" list="banks" defaultValue={a.institution ?? ""} className={inputCls} />
                </Field>
                <Field label="Tipo de conta">
                  <select name="type" defaultValue={a.type} className={inputCls}>
                    {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Saldo inicial (R$)"
                  hint="Ponto de partida do saldo. O saldo atual = este valor + lançamentos."
                  className="sm:col-span-2"
                >
                  <input name="opening" defaultValue={centsToInput(a.opening_balance_cents)} inputMode="decimal" className={inputCls} />
                </Field>
                <button className={`${btnPrimary} sm:col-span-2`}>Salvar alterações</button>
              </form>
            </details>

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

      <details open={list.length === 0} className="group">
        <summary className={`${btnPrimary} w-fit cursor-pointer list-none`}>+ Adicionar conta</summary>
        <Card className="mt-3">
          <form action={createAccount} className="grid gap-3 sm:grid-cols-2">
            <Field label="Banco ou carteira">
              <input name="institution" list="banks" placeholder="Itaú, Banco do Brasil…" className={inputCls} />
              <datalist id="banks">
                {BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Tipo de conta">
              <select name="type" className={inputCls}>
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Saldo hoje (R$)" hint="Ponto de partida. Os lançamentos ajustam a partir daqui." className="sm:col-span-2">
              <input name="opening" inputMode="decimal" placeholder="0,00" className={inputCls} />
            </Field>
            <button className={`${btnPrimary} sm:col-span-2`}>Criar conta</button>
          </form>
        </Card>
      </details>

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
