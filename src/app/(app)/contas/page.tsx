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
                <p className="text-xs text-zinc-500">{ACCOUNT_TYPE_LABEL[a.type]}</p>
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {formatBRL(balanceById.get(a.id) ?? a.opening_balance_cents)}
              </p>
            </div>

            {accCards.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {accCards.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium">
                          {c.name}
                          {c.last4 ? <span className="text-zinc-500"> •••• {c.last4}</span> : null}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Fecha dia {c.closing_day} · vence dia {c.due_day}
                          {c.credit_limit_cents != null ? ` · limite ${formatBRL(c.credit_limit_cents)}` : ""}
                        </p>
                      </div>
                      <form action={archiveCard}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton
                          message={`Arquivar o cartão ${c.name}? Os lançamentos dele continuam existindo.`}
                          className="text-xs text-zinc-500 underline"
                        >
                          Arquivar
                        </ConfirmButton>
                      </form>
                    </div>
                    <details>
                      <summary className="w-fit cursor-pointer list-none text-xs font-medium text-emerald-700 underline">
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
              <summary className="w-fit cursor-pointer list-none text-xs font-medium text-emerald-700 underline">
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
                message={`Arquivar a conta ${a.name}? Os lançamentos dela continuam existindo.`}
                className="text-xs text-zinc-500 underline"
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
    </div>
  );
}
