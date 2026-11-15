import { describe, expect, it } from "vitest";
import type { Commitment } from "./commitments";
import { buildForecast, upcomingRelief, variableEstimate } from "./forecast";

const base: Commitment = {
  id: "c1", kind: "installment", description: "Viagem", amount_cents: 60000, frequency: "monthly",
  start_on: "2026-08-10", total_occurrences: 4, end_on: null, account_id: null, card_id: "k",
  category_id: null, active: true,
};

describe("variableEstimate", () => {
  it("média dos gastos menos a média do comprometido", () => {
    expect(variableEstimate([500000, 600000, 700000], [300000, 300000, 300000])).toBe(300000);
  });
  it("nunca negativo e tolera listas vazias", () => {
    expect(variableEstimate([100], [500])).toBe(0);
    expect(variableEstimate([], [])).toBe(0);
  });
});

describe("buildForecast", () => {
  const committed = [{ month: "2026-11", totalCents: 726920 }, { month: "2026-12", totalCents: 443900 }];
  it("calcula projetado, margem e % comprometido do teto", () => {
    const f = buildForecast(committed, 100000, 850000);
    expect(f[0]).toMatchObject({ projectedCents: 826920, marginCents: 23080, committedPct: 86 });
    expect(f[1]).toMatchObject({ projectedCents: 543900, marginCents: 306100, committedPct: 52 });
  });
  it("margem negativa quando estoura o teto", () => {
    expect(buildForecast(committed, 300000, 850000)[0].marginCents).toBe(-176920);
  });
  it("sem teto, margem e % ficam nulos", () => {
    expect(buildForecast(committed, 0, null)[0]).toMatchObject({ capCents: null, marginCents: null, committedPct: null });
  });
});

describe("upcomingRelief", () => {
  it("parcela que termina: quanto alivia e a partir de quando", () => {
    const r = upcomingRelief([base], "2026-10-20");
    expect(r).toEqual([
      { description: "Viagem", amountCents: 60000, lastDate: "2026-11-10", freesFromMonth: "2026-12", totalOccurrences: 4 },
    ]);
  });
  it("ignora o que já terminou, pausado e assinaturas; ordena pela data", () => {
    const later: Commitment = { ...base, id: "c2", description: "Celular", start_on: "2026-09-01", total_occurrences: 10 };
    const done: Commitment = { ...base, id: "c3", start_on: "2026-01-01", total_occurrences: 2 };
    const paused: Commitment = { ...base, id: "c4", active: false };
    const sub: Commitment = { ...base, id: "c5", kind: "subscription", total_occurrences: null };
    const r = upcomingRelief([later, base, done, paused, sub], "2026-10-20");
    expect(r.map((x) => x.description)).toEqual(["Viagem", "Celular"]);
  });
  it("virada de ano no mês liberado", () => {
    const x: Commitment = { ...base, start_on: "2026-10-15", total_occurrences: 3 };
    expect(upcomingRelief([x], "2026-10-01")[0].freesFromMonth).toBe("2027-01");
  });
});
