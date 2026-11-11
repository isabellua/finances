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

import { addDays, addMonthsClamped, daysBetween } from "./dates";

describe("addMonthsClamped", () => {
  it("limita ao último dia do mês sem deslizar a âncora", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-01-30", 3)).toBe("2026-04-30");
  });
  it("cruza anos", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsClamped("2026-11-15", 12)).toBe("2027-11-15");
    expect(addMonthsClamped("2026-12-05", 0)).toBe("2026-12-05");
  });
});

describe("daysBetween / addDays", () => {
  it("conta dias com sinal", () => {
    expect(daysBetween("2026-11-10", "2026-11-17")).toBe(7);
    expect(daysBetween("2026-11-10", "2026-11-03")).toBe(-7);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
  it("soma dias cruzando mês", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
