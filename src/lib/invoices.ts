import { addDays } from "./dates";
import { nextDayOfMonthOnOrAfter } from "./fx";

export type CardCycle = { closingDay: number; dueDay: number };
export type Invoice = {
  /** Data de fechamento (a compra feita nesse dia ainda entra nesta fatura: [suposição], confirme com o banco). */
  closing: string;
  /** Primeiro dia da fatura (dia seguinte ao fechamento anterior). */
  start: string;
  /** Vencimento: primeiro dia de vencimento depois do fechamento. */
  due: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

function parse(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** Dia `day` do mês (y, m), limitado ao último dia do mês. */
function clampDate(y: number, m: number, day: number): string {
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(Math.min(day, dim))}`;
}

function shiftYM(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

function buildInvoice(closing: string, c: CardCycle): Invoice {
  const { y, m } = parse(closing);
  const prev = shiftYM(y, m, -1);
  const prevClosing = clampDate(prev.y, prev.m, c.closingDay);
  return {
    closing,
    start: addDays(prevClosing, 1),
    due: nextDayOfMonthOnOrAfter(addDays(closing, 1), c.dueDay),
  };
}

/** Fatura que contém uma compra feita em `date`. */
export function invoiceFor(date: string, c: CardCycle): Invoice {
  return buildInvoice(nextDayOfMonthOnOrAfter(date, c.closingDay), c);
}

/** Fatura anterior (delta -1) ou seguinte (+1) a uma fatura dada. */
export function shiftInvoice(inv: Invoice, delta: number, c: CardCycle): Invoice {
  const { y, m } = parse(inv.closing);
  const t = shiftYM(y, m, delta);
  return buildInvoice(clampDate(t.y, t.m, c.closingDay), c);
}

export type CardTx = {
  kind: string;
  amount_cents: number;
  occurred_on: string;
};

export type InvoiceTotals = { totalCents: number; paidCents: number; purchaseCount: number };

/**
 * Total da fatura = compras no período [start, closing].
 * Pago = pagamentos de fatura entre o fechamento e o fechamento seguinte (a janela em que
 * normalmente se paga). Pagamento antes do fechamento não é associado.
 */
export function invoiceTotals(inv: Invoice, txs: CardTx[], c: CardCycle): InvoiceTotals {
  const next = shiftInvoice(inv, 1, c);
  let total = 0;
  let paid = 0;
  let count = 0;
  for (const t of txs) {
    if (t.kind === "expense" && t.occurred_on >= inv.start && t.occurred_on <= inv.closing) {
      total += t.amount_cents;
      count++;
    } else if (t.kind === "invoice_payment" && t.occurred_on > inv.closing && t.occurred_on <= next.closing) {
      paid += t.amount_cents;
    }
  }
  return { totalCents: total, paidCents: paid, purchaseCount: count };
}

export type InvoiceState = "open" | "closed" | "overdue" | "paid" | "empty";

export function invoiceState(inv: Invoice, t: InvoiceTotals, today: string): InvoiceState {
  if (t.totalCents === 0) return today <= inv.closing ? "open" : "empty";
  if (today <= inv.closing) return "open";
  if (t.paidCents >= t.totalCents) return "paid";
  return today > inv.due ? "overdue" : "closed";
}

/**
 * Limite usado = o que falta pagar de todas as faturas até a atual (inclui a aberta).
 * Só vale para o histórico que existe no app: compras e pagamentos não lançados não aparecem.
 */
export function limitUsed(txs: CardTx[], c: CardCycle, today: string): number {
  if (txs.length === 0) return 0;
  const current = invoiceFor(today, c);
  const earliest = txs.reduce((min, t) => (t.occurred_on < min ? t.occurred_on : min), txs[0].occurred_on);
  let inv = invoiceFor(earliest, c);
  let used = 0;
  // Segurança: no máximo 240 faturas (20 anos).
  for (let i = 0; i < 240 && inv.closing <= current.closing; i++) {
    const t = invoiceTotals(inv, txs, c);
    used += Math.max(0, t.totalCents - t.paidCents);
    inv = shiftInvoice(inv, 1, c);
  }
  return used;
}
