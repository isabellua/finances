import type { Transaction } from "./types";

export type MonthSummary = {
  /** Realizado: só o que está pago. */
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  byCategory: { categoryId: string | null; totalCents: number }[];
  /** Previsto: ainda não pago. Não entra no saldo nem nos totais acima. */
  pendingIncomeCents: number;
  pendingExpenseCents: number;
};

type Row = Pick<Transaction, "kind" | "amount_cents" | "category_id"> & { status?: "paid" | "pending" };

/**
 * Resume um mês. Só entradas e saídas contam:
 * transferência e pagamento de fatura NÃO são gasto (o gasto é cada compra no cartão).
 * Lançamento sem status é tratado como pago (dados anteriores ao status).
 */
export function summarize(txs: Row[]): MonthSummary {
  let income = 0;
  let expense = 0;
  let pIncome = 0;
  let pExpense = 0;
  const cat = new Map<string | null, number>();

  for (const t of txs) {
    const pending = t.status === "pending";
    if (t.kind === "income") {
      if (pending) pIncome += t.amount_cents;
      else income += t.amount_cents;
    } else if (t.kind === "expense") {
      if (pending) {
        pExpense += t.amount_cents;
      } else {
        expense += t.amount_cents;
        cat.set(t.category_id, (cat.get(t.category_id) ?? 0) + t.amount_cents);
      }
    }
  }

  return {
    incomeCents: income,
    expenseCents: expense,
    netCents: income - expense,
    byCategory: [...cat.entries()]
      .map(([categoryId, totalCents]) => ({ categoryId, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    pendingIncomeCents: pIncome,
    pendingExpenseCents: pExpense,
  };
}
