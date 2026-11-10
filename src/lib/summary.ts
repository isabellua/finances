import type { Transaction } from "./types";

export type MonthSummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  byCategory: { categoryId: string | null; totalCents: number }[];
};

/**
 * Resume um mês. Só entradas e saídas contam:
 * transferência e pagamento de fatura NÃO são gasto (o gasto é cada compra no cartão).
 */
export function summarize(txs: Pick<Transaction, "kind" | "amount_cents" | "category_id">[]): MonthSummary {
  let income = 0;
  let expense = 0;
  const cat = new Map<string | null, number>();

  for (const t of txs) {
    if (t.kind === "income") {
      income += t.amount_cents;
    } else if (t.kind === "expense") {
      expense += t.amount_cents;
      cat.set(t.category_id, (cat.get(t.category_id) ?? 0) + t.amount_cents);
    }
  }

  return {
    incomeCents: income,
    expenseCents: expense,
    netCents: income - expense,
    byCategory: [...cat.entries()]
      .map(([categoryId, totalCents]) => ({ categoryId, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
  };
}
