import { daysBetween } from "./dates";

export type PendingEstimate = {
  id: string;
  description: string;
  /** Data da compra. */
  occurred_on: string;
  /** Valor estimado, em centavos de real. */
  amount_cents: number;
};

export type ImportRow = { hash: string; date: string; cents: number; expense: boolean };

export type FxMatch = { txId: string; description: string; estimatedCents: number };

/** A linha da fatura pode entrar de 3 dias antes a 14 dias depois da data da compra. */
export const MATCH_DAYS_BEFORE = 3;
export const MATCH_DAYS_AFTER = 14;
/** Diferença máxima entre o estimado e o cobrado. */
export const MATCH_MAX_DIFF = 0.1;

/**
 * Associa linhas de uma fatura a estimativas de compra internacional pendentes.
 * Regras: só saídas; um a um (cada estimativa casa uma única linha e vice-versa);
 * pareamento global pela MENOR diferença de valor (a linha mais próxima da estimativa
 * ganha, não a primeira da lista); empate de valor: a linha mais antiga.
 * Linhas já importadas antes (`skip`) não participam.
 */
export function matchFxEstimates(
  rows: ImportRow[],
  pending: PendingEstimate[],
  skip: Set<string> = new Set(),
): Record<string, FxMatch> {
  type Pair = { r: ImportRow; p: PendingEstimate; diff: number };
  const pairs: Pair[] = [];

  for (const r of rows) {
    if (!r.expense || skip.has(r.hash)) continue;
    for (const p of pending) {
      if (p.amount_cents <= 0) continue;
      const gap = daysBetween(p.occurred_on, r.date);
      if (gap < -MATCH_DAYS_BEFORE || gap > MATCH_DAYS_AFTER) continue;
      const diff = Math.abs(r.cents - p.amount_cents) / p.amount_cents;
      if (diff <= MATCH_MAX_DIFF) pairs.push({ r, p, diff });
    }
  }

  pairs.sort((a, b) => a.diff - b.diff || a.r.date.localeCompare(b.r.date));

  const out: Record<string, FxMatch> = {};
  const usedRows = new Set<string>();
  const usedPending = new Set<string>();
  for (const { r, p } of pairs) {
    if (usedRows.has(r.hash) || usedPending.has(p.id)) continue;
    usedRows.add(r.hash);
    usedPending.add(p.id);
    out[r.hash] = { txId: p.id, description: p.description, estimatedCents: p.amount_cents };
  }
  return out;
}
