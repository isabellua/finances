import { describe, expect, it } from "vitest";
import { monthGrid } from "./calendar";

describe("monthGrid", () => {
  it("nov/2026 começa num domingo: 5 semanas, sem dias de fora no início", () => {
    const g = monthGrid("2026-11");
    expect(g).toHaveLength(5);
    expect(g[0][0]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(g[4][1]).toEqual({ date: "2026-11-30", inMonth: true });
    expect(g[4][2]).toEqual({ date: "2026-12-01", inMonth: false });
  });
  it("fev/2027 (28 dias, começa na segunda) completa com dias vizinhos", () => {
    const g = monthGrid("2027-02");
    expect(g[0][0]).toEqual({ date: "2027-01-31", inMonth: false });
    expect(g[0][1]).toEqual({ date: "2027-02-01", inMonth: true });
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(28);
  });
  it("sempre semanas de 7 dias, sem repetir datas", () => {
    for (const m of ["2026-01", "2026-02", "2026-03", "2028-02", "2026-12"]) {
      const g = monthGrid(m);
      expect(g.every((w) => w.length === 7)).toBe(true);
      const dates = g.flat().map((d) => d.date);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
  it("mês com 6 semanas (ago/2026 começa no sábado)", () => {
    expect(monthGrid("2026-08")).toHaveLength(6);
  });
});
