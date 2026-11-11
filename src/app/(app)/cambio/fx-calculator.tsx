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
  parsePercentToBps,
  parseRateToMicro,
} from "@/lib/fx";
import { formatBRL } from "@/lib/money";
import { getPtax } from "./actions";

export type FxCard = {
  id: string;
  label: string;
  closingDay: number;
  dueDay: number;
  rule: "purchase_date" | "closing_date" | "due_date";
  spreadBps: number | null;
  iofBps: number | null; // próprio do cartão
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

export function FxCalculator({
  action,
  cards,
  categories,
  generalIofBps,
}: {
  action: (formData: FormData) => void | Promise<void>;
  cards: FxCard[];
  categories: { id: string; label: string }[];
  /** Alíquota geral vigente (cadastrada), ou null. */
  generalIofBps: number | null;
}) {
  const first = cards[0];
  const [cardId, setCardId] = useState(first?.id ?? "");
  const card = cards.find((c) => c.id === cardId) ?? first;

  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rate, setRate] = useState("");
  const [rateManual, setRateManual] = useState(false);
  const [rateInfo, setRateInfo] = useState<string | null>(null);
  const [spread, setSpread] = useState(card?.spreadBps != null ? formatBps(card.spreadBps) : "");
  const [iof, setIof] = useState(
    card?.iofBps != null ? formatBps(card.iofBps) : generalIofBps != null ? formatBps(generalIofBps) : "3,5",
  );
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  const reqId = useRef(0);

  const iofIsDefault = card?.iofBps == null && generalIofBps == null;

  // Data usada para a cotação, conforme a regra do cartão.
  const rule = card?.rule ?? "purchase_date";
  let quoteTarget = date;
  if (card && rule !== "purchase_date") {
    const closing = nextDayOfMonthOnOrAfter(date, card.closingDay);
    quoteTarget = rule === "closing_date" ? closing : nextDayOfMonthOnOrAfter(addDays(closing, 1), card.dueDay);
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
        const when = formatDateBR(res.quote.quoteDate);
        setRateInfo(
          `PTAX venda de ${when} (${res.quote.partial ? "boletim intermediário, dia ainda sem fechamento" : "fechamento"})` +
            (res.quote.quoteDate !== quoteTarget && !futureTarget ? `, último dia útil antes de ${formatDateBR(quoteTarget)}` : ""),
        );
      } else {
        setRateInfo(res.error);
      }
    });
  }, [currency, quoteTarget, quoteKey, rateManual, futureTarget]);

  function onCard(id: string) {
    setCardId(id);
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    setSpread(c.spreadBps != null ? formatBps(c.spreadBps) : "");
    setIof(c.iofBps != null ? formatBps(c.iofBps) : generalIofBps != null ? formatBps(generalIofBps) : "3,5");
    setRateManual(false);
  }

  const exp = currencyExp(currency);
  const amountMinor = parseAmountToMinor(amount, exp);
  const rateMicro = parseRateToMicro(rate);
  const spreadBps = parsePercentToBps(spread);
  const iofBps = parsePercentToBps(iof);

  const result =
    amountMinor !== null && rateMicro !== null && spreadBps !== null && iofBps !== null
      ? convertFx({ amountMinor, exp, rateMicro, spreadBps, iofBps })
      : null;

  if (cards.length === 0) {
    return (
      <p className="text-sm">
        Cadastre um cartão de crédito em <a className="underline" href="/contas">Contas</a> para usar a calculadora.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Cartão">
        <select name="card_id" value={cardId} onChange={(e) => onCard(e.target.value)} className={inputCls}>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
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
          placeholder={exp === 0 ? "0" : "0,00"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputCls} text-xl font-semibold`}
        />
      </Field>

      <Field
        label="Cotação (R$ por 1 unidade)"
        hint={loading ? "Buscando no Banco Central…" : (rateInfo ?? undefined)}
        className="sm:col-span-2"
      >
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
        <button
          type="button"
          onClick={() => setRateManual(false)}
          className="-mt-1 w-fit text-xs text-accent-text underline sm:col-span-2"
        >
          Voltar para a cotação do Banco Central
        </button>
      )}
      {card && (
        <p className="text-xs text-ink-subtle sm:col-span-2">
          Regra configurada para este cartão: {RULE_TEXT[rule]}
          {quoteTarget !== date ? ` (${formatDateBR(quoteTarget)})` : ""}.{" "}
          {futureTarget && "Essa data ainda não chegou: a conta usa a cotação mais recente e o valor final vai variar. "}
          Confirme essa regra com o banco.
        </p>
      )}

      <Field label="Spread do emissor (%)" hint={card?.spreadBps == null ? "Não configurado neste cartão. Preencha (veja o contrato ou a fatura)." : undefined}>
        <input name="spread" inputMode="decimal" required value={spread} onChange={(e) => setSpread(e.target.value)} placeholder="0" className={inputCls} />
      </Field>
      <Field
        label="IOF (%)"
        hint={iofIsDefault ? "Alíquota geral não cadastrada; usando 3,5% como sugestão (confira na Receita Federal e salve abaixo)." : undefined}
      >
        <input name="iof" inputMode="decimal" required value={iof} onChange={(e) => setIof(e.target.value)} className={inputCls} />
      </Field>

      {result && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-accent-tint p-4 text-sm sm:col-span-2">
          <dt>Valor convertido (cotação)</dt>
          <dd className="text-right tabular-nums">{formatBRL(result.baseCents)}</dd>
          <dt>Spread ({spread || "0"}%)</dt>
          <dd className="text-right tabular-nums">+ {formatBRL(result.spreadCents)}</dd>
          <dt>IOF ({iof}%)</dt>
          <dd className="text-right tabular-nums">+ {formatBRL(result.iofCents)}</dd>
          <dt className="border-t border-line-strong pt-2 text-base font-semibold">Total estimado na fatura</dt>
          <dd className="border-t border-line-strong pt-2 text-right text-xl font-semibold tabular-nums">
            {formatBRL(result.totalCents)}
          </dd>
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
