import { describe, expect, it } from "vitest";
import { formatBRL, parseBRLToCents } from "./money";

describe("parseBRLToCents", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12,50", 1250],
    ["12.5", 1250],
    ["12.50", 1250],
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["R$ 99,90", 9990],
    ["0,01", 1],
    ["0", 0],
  ])("%s -> %i", (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12,345", "1,2,3", "12,"])(
    "rejeita %j",
    (input) => {
      expect(parseBRLToCents(input)).toBeNull();
    },
  );
});

describe("formatBRL", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});
