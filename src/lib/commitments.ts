import { addDays, addMonthsClamped, daysBetween, monthRange, shiftMonth } from "./dates";
import { normalize } from "./import/merchant";

export type CommitmentKind = "subscription" | "installment" | "fixed_bill" | "one_off";

export type Commitment = {
  id: string;
  kind: CommitmentKind;
  description: string;
  amount_cents: number;
  frequency: "monthly" | "yearly";
  /** Primeira ocorrência. O dia dela é a âncora das seguintes. */
  start_on: string;
  /** Nº de ocorrências. null = sem fim (assinatura, conta fixa). */
  total_occurrences: number | null;
  end_on: string | null;
  account_id: string | null;
  card_id: string | null;
  category_id: string | null;
  active: boolean;
};

export type Settlement = {
  commitment_id: string;
  seq: number;
  status: "paid" | "skipped";
  settled_on: string;
  transaction_id: string | null;
};

export type Occurrence = { commitment: Commitment; seq: number; date: string };

export const KIND_LABELS: Record<CommitmentKind, string> = {
  subscription: "Assinatura",
  fixed_bill: "Conta fixa",
  installment: "Compra parcelada",
  one_off: "Conta avulsa",
};

const MAX_OCCURRENCES = 1200;

export function occurrenceDate(c: Pick<Commitment, "start_on" | "frequency">, seq: number): string {
  const months = c.frequency === "yearly" ? 12 * (seq - 1) : seq - 1;
  return addMonthsClamped(c.start_on, months);
}

/** Ocorrências com from <= data < to (datas ISO). Compromisso pausado não gera nada. */
export function occurrencesBetween(c: Commitment, from: string, to: string): Occurrence[] {
  if (!c.active) return [];
  const out: Occurrence[] = [];
  const last = Math.min(c.total_occurrences ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  for (let seq = 1; seq <= last; seq++) {
    const date = occurrenceDate(c, seq);
    if (date >= to) break;
    if (c.end_on && date > c.end_on) break;
    if (date >= from) out.push({ commitment: c, seq, date });
  }
  return out;
}

export type OccStatus = "paid" | "skipped" | "matched" | "overdue" | "due_soon" | "upcoming";

export function classify(
  date: string,
  today: string,
  settlement: Pick<Settlement, "status"> | undefined,
  matched: boolean,
  soonDays = 7,
): { status: OccStatus; daysUntil: number } {
  const daysUntil = daysBetween(today, date);
  if (settlement) return { status: settlement.status === "skipped" ? "skipped" : "paid", daysUntil };
  if (matched) return { status: "matched", daysUntil };
  if (daysUntil < 0) return { status: "overdue", daysUntil };
  if (daysUntil <= soonDays) return { status: "due_soon", daysUntil };
  return { status: "upcoming", daysUntil };
}

type TxLite = {
  id: string;
  kind: string;
  amount_cents: number;
  occurred_on: string;
  description: string;
  account_id: string | null;
  card_id: string | null;
};

/** Primeira palavra "de marca" da descrição (>= 3 letras): "Netflix Premium" → "NETFLIX". */
function brandToken(description: string): string | null {
  const tok = normalize(description)
    .replace(/[^A-Z\s]/g, " ")
    .split(" ")
    .find((t) => t.length >= 3);
  return tok ?? null;
}

/**
 * Reconhece pagamentos que já estão no extrato importado, sem vínculo explícito.
 * Conservador de propósito: mesmo destino, MESMO valor, data até `windowDays` de distância
 * e a descrição do lançamento contém o nome do compromisso. Um lançamento só casa uma vez.
 * Retorna "id do compromisso|seq" → id do lançamento.
 */
export function softMatch(
  occurrences: Occurrence[],
  txs: TxLite[],
  windowDays = 7,
): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  const ordered = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));

  for (const occ of ordered) {
    const c = occ.commitment;
    const token = brandToken(c.description);
    if (!token) continue;
    const hit = txs.find(
      (t) =>
        !used.has(t.id) &&
        t.kind === "expense" &&
        t.amount_cents === c.amount_cents &&
        (c.account_id ? t.account_id === c.account_id : t.card_id === c.card_id) &&
        Math.abs(daysBetween(occ.date, t.occurred_on)) <= windowDays &&
        normalize(t.description).includes(token),
    );
    if (hit) {
      used.add(hit.id);
      out.set(`${c.id}|${occ.seq}`, hit.id);
    }
  }
  return out;
}

export type MonthProjection = {
  month: string;
  totalCents: number;
  count: number;
  byKind: Record<CommitmentKind, number>;
};

/** Soma o que ainda falta pagar nos próximos `months` meses, a partir de `fromMonth` (YYYY-MM). */
export function projectMonths(
  commitments: Commitment[],
  isSettled: (commitmentId: string, seq: number) => boolean,
  fromMonth: string,
  months: number,
): MonthProjection[] {
  const out: MonthProjection[] = [];
  for (let i = 0; i < months; i++) {
    const month = shiftMonth(fromMonth, i);
    const { start, end } = monthRange(month);
    const byKind: Record<CommitmentKind, number> = {
      subscription: 0,
      installment: 0,
      fixed_bill: 0,
      one_off: 0,
    };
    let total = 0;
    let count = 0;
    for (const c of commitments) {
      for (const occ of occurrencesBetween(c, start, end)) {
        if (isSettled(c.id, occ.seq)) continue;
        byKind[c.kind] += c.amount_cents;
        total += c.amount_cents;
        count++;
      }
    }
    out.push({ month, totalCents: total, count, byKind });
  }
  return out;
}

/** Quantas parcelas ainda faltam (sem contar as quitadas ou puladas). */
export function remainingOccurrences(c: Commitment, settledSeqs: Set<number>): number | null {
  if (c.total_occurrences === null) return null;
  let n = 0;
  for (let seq = 1; seq <= c.total_occurrences; seq++) if (!settledSeqs.has(seq)) n++;
  return n;
}

export { addDays };
