import { describe, expect, it } from "vitest";
import { effectiveIofBps, iofBpsOn } from "./tax";

describe("IOF por vigência", () => {
  it("3,5% a partir de 01/07/2025 e 3,38% antes", () => {
    expect(iofBpsOn("2026-11-15")).toBe(350);
    expect(iofBpsOn("2025-07-01")).toBe(350);
    expect(iofBpsOn("2025-06-30")).toBe(338);
    expect(iofBpsOn("2020-01-01")).toBe(338);
  });
  it("IOF próprio do cartão vence o padrão, inclusive zero", () => {
    expect(effectiveIofBps(null, "2026-11-15")).toBe(350);
    expect(effectiveIofBps(undefined, "2026-11-15")).toBe(350);
    expect(effectiveIofBps(0, "2026-11-15")).toBe(0);
    expect(effectiveIofBps(200, "2026-11-15")).toBe(200);
  });
});
