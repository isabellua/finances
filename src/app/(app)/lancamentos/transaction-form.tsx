"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, btnPrimary, inputCls } from "@/components/ui";

type Opt = { id: string; label: string };
type CardOpt = Opt & { accountId: string };
type Kind = "expense" | "income" | "transfer" | "invoice_payment";

const KINDS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Saída" },
  { value: "income", label: "Entrada" },
  { value: "transfer", label: "Transferência" },
  { value: "invoice_payment", label: "Pagar fatura" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${btnPrimary} sm:col-span-2`}>
      {pending ? "Salvando…" : "Salvar lançamento"}
    </button>
  );
}

export function TransactionForm({
  action,
  accounts,
  cards,
  categories,
  today,
}: {
  action: (formData: FormData) => void | Promise<void>;
  accounts: Opt[];
  cards: CardOpt[];
  categories: Opt[];
  today: string;
}) {
  const [kind, setKind] = useState<Kind>("expense");
  const [payAccount, setPayAccount] = useState(accounts[0]?.id ?? "");

  const accountOptions = (
    <>
      {accounts.map((a) => (
        <option key={a.id} value={`a:${a.id}`}>{a.label}</option>
      ))}
    </>
  );

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <input type="hidden" name="kind" value={kind} />

      <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 sm:grid-cols-4 dark:bg-zinc-900">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="tab"
            aria-selected={kind === k.value}
            onClick={() => setKind(k.value)}
            className={`rounded-md px-2 py-2 text-sm font-medium ${
              kind === k.value
                ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-800 dark:text-emerald-300"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div key={kind} className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)" className="sm:col-span-2">
          <input
            name="amount"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0,00"
            className={`${inputCls} text-2xl font-semibold`}
          />
        </Field>

        {kind === "expense" && (
          <Field label="Pago com" className="sm:col-span-2">
            <select name="source" required className={inputCls}>
              <optgroup label="Contas">{accountOptions}</optgroup>
              {cards.length > 0 && (
                <optgroup label="Cartões de crédito">
                  {cards.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        {kind === "income" && (
          <Field label="Entrou em" className="sm:col-span-2">
            <select name="source" required className={inputCls}>{accountOptions}</select>
          </Field>
        )}

        {kind === "transfer" && (
          <>
            <Field label="De">
              <select name="source" required className={inputCls}>{accountOptions}</select>
            </Field>
            <Field label="Para">
              <select name="target" required defaultValue={accounts[1] ? `a:${accounts[1].id}` : ""} className={inputCls}>
                {accountOptions}
              </select>
            </Field>
          </>
        )}

        {kind === "invoice_payment" && (
          <>
            <Field label="Fatura do cartão">
              <select
                name="target"
                required
                className={inputCls}
                onChange={(e) => {
                  const card = cards.find((c) => `c:${c.id}` === e.target.value);
                  if (card) setPayAccount(card.accountId);
                }}
              >
                {cards.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Paga com" hint="Já vem a conta do cartão">
              <select
                name="source"
                required
                value={`a:${payAccount}`}
                onChange={(e) => setPayAccount(e.target.value.slice(2))}
                className={inputCls}
              >
                {accountOptions}
              </select>
            </Field>
          </>
        )}

        {(kind === "expense" || kind === "income") && (
          <Field label="Categoria">
            <select name="category_id" defaultValue="" className={inputCls}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Data">
          <input name="occurred_on" type="date" required defaultValue={today} className={inputCls} />
        </Field>

        <Field label="Descrição" hint="Opcional" className="sm:col-span-2">
          <input name="description" maxLength={200} placeholder="Ex.: mercado, aluguel, Netflix…" className={inputCls} />
        </Field>

        <Submit />
      </div>
    </form>
  );
}
