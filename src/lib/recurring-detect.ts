import { addMonthsClamped } from "./dates";
import { merchantKey } from "./import/merchant";

export type DetectTx = {
  description: string;
  amount_cents: number;
  occurred_on: string;
  kind: string;
  account_id: string | null;
  card_id: string | null;
  category_id: string | null;
};

export type Suggestion = {
  key: string;
  description: string;
  amountCents: number;
  /** Dia do mês mais comum. */
  day: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  /** "a:<id>" ou "c:<id>" */
  target: string;
  categoryId: string | null;
};

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const PARCEL = /\b\d{1,2}\s*\/\s*\d{1,2}\b/;

/**
 * Procura gastos que se repetem todo mês e ainda não estão cadastrados como assinatura.
 * Regras: mesmo estabelecimento e mesma forma de pagamento; pelo menos 3 meses seguidos,
 * o último no mês atual ou no anterior; valores dentro de 5% da mediana; descrições
 * com "03/10" (parcelas) são ignoradas, porque parcela não é assinatura.
 */
export function detectRecurring(
  txs: DetectTx[],
  existingDescriptions: string[],
  today: string,
  minMonths = 3,
): Suggestion[] {
  const existing = existingDescriptions.map(merchantKey).filter((k) => k.length >= 3);
  const groups = new Map<string, DetectTx[]>();

  for (const t of txs) {
    if (t.kind !== "expense") continue;
    const key = merchantKey(t.description);
    if (key === "") continue;
    const target = t.card_id ? `c:${t.card_id}` : t.account_id ? `a:${t.account_id}` : null;
    if (!target) continue;
    const gk = `${target}|${key}`;
    groups.set(gk, [...(groups.get(gk) ?? []), t]);
  }

  const out: Suggestion[] = [];
  const nowIdx = monthIndex(today);

  for (const [gk, rows] of groups) {
    const key = gk.split("|")[1];
    if (existing.some((e) => e === key || key.startsWith(e) || e.startsWith(key))) continue;
    if (rows.filter((r) => PARCEL.test(r.description)).length > rows.length / 2) continue;

    const med = median(rows.map((r) => r.amount_cents));
    const close = rows.filter((r) => Math.abs(r.amount_cents - med) <= med * 0.05);
    // um lançamento por mês (o mais recente do mês)
    const byMonth = new Map<number, DetectTx>();
    for (const r of [...close].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
      byMonth.set(monthIndex(r.occurred_on), r);
    }
    const months = [...byMonth.keys()].sort((a, b) => a - b);
    if (months.length === 0) continue;

    // sequência de meses consecutivos que termina no último mês com lançamento
    let run = 1;
    for (let i = months.length - 1; i > 0 && months[i] - months[i - 1] === 1; i--) run++;
    const lastMonth = months[months.length - 1];
    if (run < minMonths || lastMonth < nowIdx - 1) continue;

    const runMonths = months.slice(months.length - run);
    const runRows = runMonths.map((m) => byMonth.get(m)!);
    const last = runRows[runRows.length - 1];

    let next = addMonthsClamped(last.occurred_on, 1);
    for (let i = 0; i < 12 && next < today; i++) next = addMonthsClamped(next, 1);

    const cats = new Map<string, number>();
    for (const r of runRows) if (r.category_id) cats.set(r.category_id, (cats.get(r.category_id) ?? 0) + 1);
    const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    out.push({
      key,
      description: last.description.replace(/\s+/g, " ").trim(),
      amountCents: median(runRows.map((r) => r.amount_cents)),
      day: median(runRows.map((r) => Number(r.occurred_on.slice(8, 10)))),
      occurrences: run,
      lastDate: last.occurred_on,
      nextDate: next,
      target: gk.split("|")[0],
      categoryId: topCat,
    });
  }

  return out.sort((a, b) => b.amountCents - a.amountCents);
}
