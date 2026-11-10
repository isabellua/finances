import { describe, expect, it } from "vitest";
import { monthRange, shiftMonth, todayISO } from "./dates";

describe("dates", () => {
  it("monthRange vira o ano em dezembro", () => {
    expect(monthRange("2026-12")).toEqual({
      start: "2026-12-01",
      end: "2027-01-01",
    });
    expect(monthRange("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-03-01",
    });
  });

  it("shiftMonth cruza anos", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-05", 0)).toBe("2026-05");
  });

  it("todayISO usa o fuso de Brasília (UTC-3)", () => {
    // 01:00 UTC do dia 11 ainda é dia 10 em Brasília
    expect(todayISO(new Date("2026-11-11T01:00:00Z"))).toBe("2026-11-10");
  });
});
