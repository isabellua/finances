"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field, btnPrimary, inputCls } from "@/components/ui";
import { addDays, formatDateBR, todayISO } from "@/lib/dates";
import {
  CURRENCIES,
  convertFx,
  currencyExp,
  formatBps,
  formatRateMicro,
  nextDayOfMonthOnOrAfter,
  parseAmountToMinor,
  parseRateToMicro,
} from "@/lib/fx";
import { formatBRL } from "@/lib/money";
import { effectiveIofBps } from "@/lib/tax";
import { getPtax } from "./actions";

export type FxCard = {
  id: string;
  label: string;
  closingDay: number;
  dueDay: number;
  rule: "purchase_date" | "closing_date" | "due_date";
  /** Já garantido pela página: sem spread configurado a calculadora nem aparece. */
  spreadBps: number;
  iofBps: number | null;
};

const RULE_TEXT: Record<FxCard["rule"], string> = {
  purchase_date: "cotação do dia da compra",
  closing_date: "cotação do dia do fechamento da fatura",
  due_date: "cotação do dia do vencimento da fatura",
};

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending} className={`${btnPrimary} sm:col-span-2`}>
      {pending ? "Lançando…" : "Lançar no cartão como estimativa"}
    </button>
  );
}

/**
 * Só pede moeda, valor e data. Spread, IOF e regra de cotação são do cartão (somente leitura aqui;
 * o servidor lê do cartão ao lançar, então o navegador não define taxa nenhuma).
 */
export function FxCalculator({
  action,
  card,
  categories,
}: {
  action: (formData: FormData) => void | Promise<void>;
  card: FxCard;
  categories: { id: string; label: string }[];
}) {
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rate, setRate] = useState("");
  const [rateManual, setRateManual] = useState(false);
  const [rateInfo, setRateInfo] = useState<string | null>(null);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const reqId = useRef(0);

  // Data da cotação, conforme a regra do cartão.
  let quoteTarget = date;
  if (card.rule !== "purchase_date") {
    const closing = nextDayOfMonthOnOrAfter(date, card.closingDay);
    quoteTarget = card.rule === "closing_date" ? closing : nextDayOfMonthOnOrAfter(addDays(closing, 1), card.dueDay);
  }
  const futureTarget = quoteTarget > todayISO();
  const quoteKey = `${currency}|${quoteTarget}`;
  const loading = !rateManual && fetchedKey !== quoteKey;

  useEffect(() => {
    if (rateManual) return;
    const id = ++reqId.current;
    getPtax(currency, quoteTarget).then((res) => {
      if (id !== reqId.current) return; // resposta atrasada de uma consulta antiga
      setFetchedKey(quoteKey);
      if (res.ok) {
        setRate(formatRateMicro(res.quote.sellMicro));
        setRateInfo(
          `PTAX venda de ${formatDateBR(res.quote.quoteDate)} (${res.quote.partial ? "boletim intermediário, dia ainda sem fechamento" : "fechamento"})` +
            (res.quote.quoteDate !== quoteTarget && !futureTarget ? `, último dia útil antes de ${formatDateBR(quoteTarget)}` : ""),
        );
      } else {
        setRateInfo(res.error);
      }
    });
  }, [currency, quoteTarget, quoteKey, rateManual, futureTarget]);

  const exp = currencyExp(currency);
  const amountMinor = parseAmountToMinor(amount, exp);
  const rateMicro = parseRateToMicro(rate);
  const iofBps = effectiveIofBps(card.iofBps, date);

  const result =
    amountMinor !== null && rateMicro !== null
      ? convertFx({ amountMinor, exp, rateMicro, spreadBps: card.spreadBps, iofBps })
      : null;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="card_id" value={card.id} />

      <Field label="Moeda">
        <select
          name="currency"
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setRateManual(false);
          }}
          className={inputCls}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
          ))}
        </select>
      </Field>
      <Field label={`Valor em ${currency}`} hint={exp === 0 ? "Esta moeda não tem centavos." : undefined}>
        <input
          name="amount"
          inputMode="decimal"
          required
          autoFocus
          placeholder={exp === 0 ? "0" : "0,00"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputCls} text-xl font-semibold`}
        />
      </Field>

      <Field label="Data da compra">
        <input
          name="date"
          type="date"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setRateManual(false);
          }}
          className={inputCls}
        />
      </Field>
      <Field label="Cotação (R$ por 1 unidade)" hint={loading ? "Buscando no Banco Central…" : (rateInfo ?? undefined)}>
        <input
          name="rate"
          inputMode="decimal"
          required
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setRateManual(true);
          }}
          className={inputCls}
        />
      </Field>
      {rateManual && (
        <button type="button" onClick={() => setRateManual(false)} className="-mt-1 w-fit text-xs text-accent-text underline sm:col-span-2">
          Voltar para a cotação do Banco Central
        </button>
      )}

      <p className="rounded-lg bg-sunken p-3 text-sm text-ink-muted sm:col-span-2">
        <strong className="text-ink">{card.label}</strong> cobra spread de {formatBps(card.spreadBps)}% e IOF de {formatBps(iofBps)}%
        {card.iofBps === null ? " (padrão do app)" : ""}, com {RULE_TEXT[card.rule]}
        {quoteTarget !== date ? ` (${formatDateBR(quoteTarget)})` : ""}.{" "}
        {futureTarget && "Essa data ainda não chegou: a conta usa a cotação mais recente e o valor final vai variar. "}
        Para mudar essas taxas, edite o cartão em Contas.
      </p>

      {result && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-accent bg-accent-tint p-4 text-sm sm:col-span-2">
          <dt>Valor convertido (cotação)</dt>
          <dd className="text-right tabular-nums">{formatBRL(result.baseCents)}</dd>
          <dt>Spread ({formatBps(card.spreadBps)}%)</dt>
          <dd className="text-right tabular-nums">+ {formatBRL(result.spreadCents)}</dd>
          <dt>IOF ({formatBps(iofBps)}%)</dt>
          <dd className="text-right tabular-nums">+ {formatBRL(result.iofCents)}</dd>
          <dt className="border-t border-line-strong pt-2 text-base font-semibold">Total estimado na fatura</dt>
          <dd className="border-t border-line-strong pt-2 text-right text-xl font-semibold tabular-nums">{formatBRL(result.totalCents)}</dd>
          <dt className="text-xs text-ink-muted">Cotação efetiva</dt>
          <dd className="text-right text-xs text-ink-muted">
            R$ {formatRateMicro(result.effectiveRateMicro)} por {currency} (+{formatBps(Math.max(0, result.extraBps))}% sobre a cotação)
          </dd>
        </dl>
      )}

      <Field label="Descrição" hint="Opcional" className="sm:col-span-2">
        <input name="description" maxLength={200} placeholder="Ex.: hotel, passagem, assinatura" className={inputCls} />
      </Field>
      <Field label="Categoria" className="sm:col-span-2">
        <select name="category_id" defaultValue="" className={inputCls}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>

      <Submit disabled={!result} />
      <p className="text-xs text-ink-subtle sm:col-span-2">
        Isto é uma estimativa. O valor oficial é o da fatura: confirme-o depois aqui, ou importe a fatura e o app atualiza.
      </p>
    </form>
  );
}
