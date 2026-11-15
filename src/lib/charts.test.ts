import { describe, expect, it } from "vitest";
import { barScale, colorFor, donutSegments } from "./charts";

describe("donutSegments", () => {
  it("frações somam 1 e o deslocamento é acumulado", () => {
    const s = donutSegments([50, 30, 20]);
    expect(s.map((x) => x.fraction)).toEqual([0.5, 0.3, 0.2]);
    expect(s.map((x) => x.offset)).toEqual([0, 0.5, 0.8]);
  });
  it("ignora zeros e negativos, mantendo o índice original", () => {
    const s = donutSegments([0, 10, -5, 10]);
    expect(s.map((x) => x.index)).toEqual([1, 3]);
    expect(s.map((x) => x.fraction)).toEqual([0.5, 0.5]);
  });
  it("sem dados, nenhuma fatia", () => {
    expect(donutSegments([])).toEqual([]);
    expect(donutSegments([0, 0])).toEqual([]);
  });
});

describe("barScale", () => {
  it("normaliza pelo maior valor", () => {
    expect(barScale([10, 5, 0])).toEqual([1, 0.5, 0]);
  });
  it("tudo zero não vira NaN", () => {
    expect(barScale([0, 0])).toEqual([0, 0]);
    expect(barScale([])).toEqual([]);
  });
});

describe("colorFor", () => {
  it("usa a cor própria, senão cicla a paleta", () => {
    expect(colorFor(0, "#112233")).toBe("#112233");
    expect(colorFor(0)).toBe(colorFor(12));
  });
});
