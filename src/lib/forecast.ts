import { occurrenceDate, projectMonths, type Commitment } from "./commitments";
import { addMonthsClamped } from "./dates";

const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

/**
 * Gasto variável estimado por mês = média dos gastos dos meses passados menos a média do
 * comprometido nos mesmos meses (assinaturas, parcelas, contas fixas). Nunca negativo.
 * É uma estimativa: não separa com precisão o que foi variável do que era fixo.
 */
export function variableEstimate(pastExpensesCents: number[], pastCommittedCents: number[]): number {
  return Math.max(0, Math.round(avg(pastExpensesCents) - avg(pastCommittedCents)));
}

export type MonthForecast = {
  month: string;
  committedCents: number;
  variableCents: number;
  projectedCents: number;
  capCents: number | null;
  /** Teto menos o projetado (negativo = estoura o teto). */
  marginCents: number | null;
  /** Parte do teto já comprometida, em % (pode passar de 100). */
  committedPct: number | null;
};

export function buildForecast(
  committedByMonth: { month: string; totalCents: number }[],
  variableCents: number,
  capCents: number | null,
): MonthForecast[] {
  return committedByMonth.map((m) => {
    const projected = m.totalCents + variableCents;
    return {
      month: m.month,
      committedCents: m.totalCents,
      variableCents,
      projectedCents: projected,
      capCents,
      marginCents: capCents === null ? null : capCents - projected,
      committedPct: capCents === null ? null : Math.round((m.totalCents / capCents) * 100),
    };
  });
}

export type Relief = {
  description: string;
  amountCents: number;
  /** Data da última parcela. */
  lastDate: string;
  /** Mês em que o valor deixa de pesar (mês seguinte à última parcela). */
  freesFromMonth: string;
  totalOccurrences: number;
};

/** Próximas parcelas a terminar: quanto alivia e quando. */
export function upcomingRelief(commitments: Commitment[], today: string, limit = 3): Relief[] {
  const out: Relief[] = [];
  for (const c of commitments) {
    if (!c.active || c.kind !== "installment" || !c.total_occurrences) continue;
    const last = occurrenceDate(c, c.total_occurrences);
    if (last < today) continue;
    out.push({
      description: c.description,
      amountCents: c.amount_cents,
      lastDate: last,
      freesFromMonth: addMonthsClamped(`${last.slice(0, 7)}-01`, 1).slice(0, 7),
      totalOccurrences: c.total_occurrences,
    });
  }
  return out.sort((a, b) => a.lastDate.localeCompare(b.lastDate)).slice(0, limit);
}

export { projectMonths };
