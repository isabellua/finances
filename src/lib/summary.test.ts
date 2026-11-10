import { describe, expect, it } from "vitest";
import { summarize } from "./summary";

describe("summarize", () => {
  it("ignora transferência e pagamento de fatura", () => {
    const s = summarize([
      { kind: "income", amount_cents: 500000, category_id: "sal" },
      { kind: "expense", amount_cents: 12000, category_id: "mkt" },
      { kind: "expense", amount_cents: 8000, category_id: "mkt" },
      { kind: "expense", amount_cents: 3000, category_id: null },
      { kind: "transfer", amount_cents: 100000, category_id: null },
      { kind: "invoice_payment", amount_cents: 20000, category_id: null },
    ]);
    expect(s.incomeCents).toBe(500000);
    expect(s.expenseCents).toBe(23000);
    expect(s.netCents).toBe(477000);
    expect(s.byCategory).toEqual([
      { categoryId: "mkt", totalCents: 20000 },
      { categoryId: null, totalCents: 3000 },
    ]);
  });

  it("mês vazio zera tudo", () => {
    expect(summarize([])).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      byCategory: [],
    });
  });
});
