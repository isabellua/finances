"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, btnPrimary, inputCls } from "@/components/ui";

type Opt = { id: string; label: string };
type Kind = "subscription" | "fixed_bill" | "installment" | "one_off";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "subscription", label: "Assinatura", hint: "Cobrança que se repete (Netflix, academia, seguro)." },
  { value: "fixed_bill", label: "Conta fixa", hint: "Conta mensal com vencimento (aluguel, condomínio, internet)." },
  { value: "installment", label: "Compra parcelada", hint: "Parcelas com início e fim." },
  { value: "one_off", label: "Conta avulsa", hint: "Uma conta só (IPTU, boleto)." },
];

const START_LABEL: Record<Kind, string> = {
  subscription: "Próxima cobrança",
  fixed_bill: "Próximo vencimento",
  installment: "Vencimento da 1ª parcela",
  one_off: "Vencimento",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${btnPrimary} sm:col-span-2`}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

export function CommitmentForm({
  action,
  accounts,
  cards,
  categories,
  today,
}: {
  action: (formData: FormData) => void | Promise<void>;
  accounts: Opt[];
  cards: Opt[];
  categories: Opt[];
  today: string;
}) {
  const [kind, setKind] = useState<Kind>("subscription");
  const [amount, setAmount] = useState("");
  const [total, setTotal] = useState("");

  const hint = KINDS.find((k) => k.value === kind)?.hint;
  const parcelaTotal =
    kind === "installment" && Number(total) >= 2 && amount
      ? `${total}× de R$ ${amount} (confira o total na fatura)`
      : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      <div role="tablist" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 sm:grid-cols-4 dark:bg-zinc-900">
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
      <p className="-mt-2 text-xs text-zinc-500">{hint}</p>

      <div key={kind} className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" className="sm:col-span-2">
          <input
            name="description"
            required
            maxLength={120}
            placeholder={kind === "installment" ? "Ex.: Geladeira, celular" : "Ex.: Netflix, aluguel, IPTU"}
            className={inputCls}
          />
        </Field>

        <Field label={kind === "installment" ? "Valor da parcela (R$)" : "Valor (R$)"} hint={parcelaTotal ?? undefined}>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0,00"
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label={START_LABEL[kind]}>
          <input name="start_on" type="date" required defaultValue={today} className={inputCls} />
        </Field>

        {kind === "subscription" && (
          <Field label="Repete">
            <select name="frequency" defaultValue="monthly" className={inputCls}>
              <option value="monthly">Todo mês</option>
              <option value="yearly">Todo ano</option>
            </select>
          </Field>
        )}

        {kind === "installment" && (
          <>
            <Field label="Número de parcelas">
              <input
                name="total"
                type="number"
                min={2}
                max={600}
                required
                onChange={(e) => setTotal(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Parcelas já pagas" hint="Se a compra é antiga, informe quantas já foram. A data acima é a da 1ª parcela.">
              <input name="paid_count" type="number" min={0} defaultValue={0} className={inputCls} />
            </Field>
          </>
        )}

        <Field label="Paga com">
          <select name="payment" required className={inputCls}>
            <optgroup label="Contas">
              {accounts.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>{a.label}</option>
              ))}
            </optgroup>
            {cards.length > 0 && (
              <optgroup label="Cartões de crédito">
                {cards.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>{c.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>

        <Field label="Categoria">
          <select name="category_id" defaultValue="" className={inputCls}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Submit />
      </div>
    </form>
  );
}
