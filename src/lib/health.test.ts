import { describe, expect, it } from "vitest";
import { healthLabel, healthScore, type HealthInput } from "./health";

const ok: HealthInput = {
  monthsOfData: 3, incomeAvgCents: 1000000, expenseAvgCents: 800000, liquidCents: 4800000,
  cardUsedPct: 0.3, overdueCount: 0, committedMonthlyCents: 500000,
};
const by = (r: ReturnType<typeof healthScore>, k: string) => r.components.find((c) => c.key === k)!;

describe("healthScore", () => {
  it("componentes no limite da meta valem 100", () => {
    const r = healthScore({ ...ok, expenseAvgCents: 800000, liquidCents: 4800000 });
    expect(by(r, "savings").score).toBe(100); // sobra 20%
    expect(by(r, "reserve").score).toBe(100); // 6 meses
    expect(by(r, "credit").score).toBe(100); // 30% do limite
    expect(by(r, "commitment").score).toBe(100); // 50% da receita
    expect(r.score).toBe(100);
    expect(r.label).toBe("Ótima");
  });

  it("gastar mais do que recebe zera poupança e derruba o total", () => {
    const r = healthScore({ ...ok, expenseAvgCents: 1200000, liquidCents: 0 });
    expect(by(r, "savings").score).toBe(0);
    expect(by(r, "reserve").score).toBe(0);
    expect(r.score).toBeLessThan(50);
    expect(by(r, "savings").detail).toMatch(/a mais do que recebe/);
  });

  it("escalas lineares: poupança 10% = 50, reserva 3 meses = 50, crédito 65% = 50, fixos 75% = 50", () => {
    expect(by(healthScore({ ...ok, expenseAvgCents: 900000 }), "savings").score).toBe(50);
    expect(by(healthScore({ ...ok, liquidCents: 2400000 }), "reserve").score).toBe(50);
    expect(by(healthScore({ ...ok, cardUsedPct: 0.65 }), "credit").score).toBe(50);
    expect(by(healthScore({ ...ok, committedMonthlyCents: 750000 }), "commitment").score).toBe(50);
  });

  it("conta atrasada tira 15 pontos do crédito, sem passar de 0", () => {
    expect(by(healthScore({ ...ok, overdueCount: 2 }), "credit").score).toBe(70);
    expect(by(healthScore({ ...ok, cardUsedPct: 1, overdueCount: 3 }), "credit").score).toBe(0);
  });

  it("sem cartão: crédito 100", () => {
    expect(by(healthScore({ ...ok, cardUsedPct: null }), "credit").score).toBe(100);
  });

  it("sem receita: poupança e comprometimento ficam de fora e o peso é redistribuído", () => {
    const r = healthScore({ ...ok, incomeAvgCents: 0 });
    expect(by(r, "savings").score).toBeNull();
    expect(by(r, "commitment").score).toBeNull();
    expect(r.score).not.toBeNull();
  });

  it("sem dados suficientes devolve null (não inventa nota)", () => {
    expect(healthScore({ ...ok, monthsOfData: 0, incomeAvgCents: 0, expenseAvgCents: 0 }).score).toBeNull();
    expect(healthScore({ ...ok, monthsOfData: 0, incomeAvgCents: 0, expenseAvgCents: 0 }).label).toBeNull();
  });

  it("o rótulo do resultado acompanha a nota", () => {
    const r = healthScore(ok);
    expect(r.label).toBe(healthLabel(r.score!));
  });
});

describe("healthLabel (limites das faixas)", () => {
  it.each([
    [100, "Ótima"], [80, "Ótima"], [79, "Boa"], [60, "Boa"], [59, "Regular"], [40, "Regular"], [39, "Atenção"], [0, "Atenção"],
  ])("nota %i = %s", (score, label) => {
    expect(healthLabel(score)).toBe(label);
  });
});
