import { describe, expect, it } from "vitest";
import { BB_SPLIT, annualFromMonthlyPpm, impliedRatePpm, formatPpmPercent, parsePercentToPpm, resolveSplit, splitPlan } from "./split";

// Print do app do Banco do Brasil, compra à vista de R$ 194,90 (16/11/2026).
const PRINT: Record<number, [number, number]> = {
  2: [10431, 20862],
  3: [7096, 21288],
  4: [5430, 21720],
  5: [4431, 22155],
  6: [3767, 22602],
  7: [3293, 23051],
  8: [2938, 23504],
  9: [2663, 23967],
  10: [2443, 24430],
  11: [2264, 24904],
  12: [2115, 25380],
};

describe("splitPlan (BB)", () => {
  const rows = splitPlan(19490, BB_SPLIT);
  it("reproduz as 11 linhas do print ao centavo", () => {
    expect(rows).toHaveLength(11);
    for (const r of rows) {
      expect([r.installmentCents, r.totalCents]).toEqual(PRINT[r.parts]);
    }
  });
  it("extra = total − compra", () => {
    expect(rows[10].extraCents).toBe(25380 - 19490);
  });
  it("abaixo do mínimo não parcela", () => {
    expect(splitPlan(9999, BB_SPLIT)).toEqual([]);
    expect(splitPlan(10000, BB_SPLIT).length).toBe(11);
  });
  it("valor inválido", () => {
    expect(splitPlan(0, BB_SPLIT)).toEqual([]);
    expect(splitPlan(10.5, BB_SPLIT)).toEqual([]);
  });
  it("juros zero e sem custo inicial divide igual", () => {
    const r = splitPlan(12000, { ratePpm: 0, upfrontPpm: 0, minCents: 0, maxParts: 3 });
    expect(r.map((x) => [x.parts, x.installmentCents, x.extraCents])).toEqual([[2, 6000, 0], [3, 4000, 0]]);
  });
});

describe("resolveSplit", () => {
  it("cartão configurado vence", () => {
    expect(resolveSplit({ split_rate_ppm: 30000, split_max_parts: 6 }, "banco-do-brasil")).toEqual({
      ratePpm: 30000, upfrontPpm: 0, minCents: 0, maxParts: 6,
    });
  });
  it("BB sem configuração usa padrão; outros não têm", () => {
    expect(resolveSplit({}, "banco-do-brasil")).toBe(BB_SPLIT);
    expect(resolveSplit({}, "inter")).toBeNull();
    expect(resolveSplit({}, null)).toBeNull();
  });
});

describe("percentuais", () => {
  it("parse/format ida e volta", () => {
    expect(parsePercentToPpm("4,201")).toBe(42010);
    expect(parsePercentToPpm("0,65%")).toBe(6500);
    expect(parsePercentToPpm("4.2")).toBe(42000);
    expect(parsePercentToPpm("abc")).toBeNull();
    expect(parsePercentToPpm("31")).toBeNull();
    expect(formatPpmPercent(42010)).toBe("4,201");
    expect(formatPpmPercent(6500)).toBe("0,65");
    expect(formatPpmPercent(30000)).toBe("3");
  });
  it("taxa anual equivalente ~64%", () => {
    expect(annualFromMonthlyPpm(42010)).toBeGreaterThan(63);
    expect(annualFromMonthlyPpm(42010)).toBeLessThan(65);
  });
});

describe("exemplo real: compra internacional parcelada (BB, ago/2026)", () => {
  // US$ 62,95 a R$ 5,28 = R$ 332,40; IOF internacional (R$ 11,63) fica fora do parcelamento.
  // O app mostrou 3 x R$ 121,69. O padrão (calibrado em nov/2026) erra ~0,6%: a taxa do banco varia.
  it("estimativa fica a ~1% do valor real", () => {
    const r = splitPlan(33240, BB_SPLIT).find((x) => x.parts === 3)!;
    expect(Math.abs(r.installmentCents - 12169) / 12169).toBeLessThan(0.01);
  });
});

describe("print BB de ~18/11/2026: 3x de R$ 70,00, juros 3,94%, IOF 0,38% + 0,24%", () => {
  const p = { ratePpm: 39400, upfrontPpm: 6200, minCents: 10000, maxParts: 12 };
  it("com 1ª parcela em ~24 dias a estimativa fica a centavos do app", () => {
    const r = splitPlan(19490, p, 24).find((x) => x.parts === 3)!;
    expect(Math.abs(r.installmentCents - 7000)).toBeLessThanOrEqual(5);
  });
  it("1ª parcela mais longe encarece", () => {
    const a = splitPlan(19490, p, 24)[1].installmentCents;
    const b = splitPlan(19490, p, 36)[1].installmentCents;
    expect(b).toBeGreaterThan(a);
  });
});

describe("impliedRatePpm", () => {
  it("recupera a taxa do print de R$ 194,90 (3x de 70,96)", () => {
    const r = impliedRatePpm(19490, 3, 7096, 6500)!;
    expect(Math.abs(r - 42010)).toBeLessThan(2500);
  });
  it("ida e volta com splitPlan", () => {
    const row = splitPlan(50000, BB_SPLIT, 30).find((x) => x.parts === 6)!;
    const r = impliedRatePpm(50000, 6, row.installmentCents, BB_SPLIT.upfrontPpm)!;
    expect(Math.abs(r - BB_SPLIT.ratePpm)).toBeLessThan(300);
  });
  it("inviável devolve null", () => {
    expect(impliedRatePpm(10000, 3, 100, 0)).toBeNull();
    expect(impliedRatePpm(10000, 1, 12000, 0)).toBeNull();
  });
});
