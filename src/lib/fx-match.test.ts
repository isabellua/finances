import { describe, expect, it } from "vitest";
import { matchFxEstimates, type ImportRow, type PendingEstimate } from "./fx-match";

const est = (over: Partial<PendingEstimate> = {}): PendingEstimate => ({
  id: "t1",
  description: "Hotel",
  occurred_on: "2026-11-05",
  amount_cents: 60107,
  ...over,
});
const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  hash: "h1",
  date: "2026-11-07",
  cents: 60500,
  expense: true,
  ...over,
});

describe("matchFxEstimates", () => {
  it("casa linha parecida (+0,65%) dentro da janela", () => {
    expect(matchFxEstimates([row()], [est()])).toEqual({
      h1: { txId: "t1", description: "Hotel", estimatedCents: 60107 },
    });
  });

  it.each([
    ["diferença acima de 10%", { cents: 67000 }],
    ["diferença abaixo de -10%", { cents: 54000 }],
    ["data muito depois (15 dias)", { date: "2026-11-20" }],
    ["data muito antes (4 dias)", { date: "2026-11-01" }],
    ["não é saída", { expense: false }],
  ])("não casa: %s", (_n, over) => {
    expect(matchFxEstimates([row(over)], [est()])).toEqual({});
  });

  it("limites da janela são inclusivos: -3 e +14 dias casam", () => {
    expect(Object.keys(matchFxEstimates([row({ date: "2026-11-02" })], [est()]))).toHaveLength(1);
    expect(Object.keys(matchFxEstimates([row({ date: "2026-11-19" })], [est()]))).toHaveLength(1);
  });

  it("limite de 10% é inclusivo", () => {
    expect(Object.keys(matchFxEstimates([row({ cents: 66117 })], [est()]))).toHaveLength(1); // +10,0%
  });

  it("um a um: duas linhas parecidas, uma estimativa → só a mais próxima em valor casa", () => {
    const r = matchFxEstimates(
      [row({ hash: "far", cents: 63000 }), row({ hash: "near", cents: 60200 })],
      [est()],
    );
    expect(Object.keys(r)).toEqual(["near"]);
  });

  it("empate de valor: a linha mais antiga ganha", () => {
    const r = matchFxEstimates(
      [row({ hash: "later", date: "2026-11-09" }), row({ hash: "earlier", date: "2026-11-07" })],
      [est()],
    );
    expect(Object.keys(r)).toEqual(["earlier"]);
  });

  it("duas estimativas, duas linhas: cada uma casa a sua", () => {
    const r = matchFxEstimates(
      [row({ hash: "a", cents: 30100, date: "2026-11-06" }), row({ hash: "b", cents: 60500 })],
      [est({ id: "t1", amount_cents: 60107 }), est({ id: "t2", description: "Taxi", amount_cents: 30000, occurred_on: "2026-11-05" })],
    );
    expect(r.a.txId).toBe("t2");
    expect(r.b.txId).toBe("t1");
  });

  it("linhas já importadas (skip) ficam de fora", () => {
    expect(matchFxEstimates([row()], [est()], new Set(["h1"]))).toEqual({});
  });

  it("sem estimativas pendentes, nada casa", () => {
    expect(matchFxEstimates([row()], [])).toEqual({});
  });
});

describe("matchFxEstimates: pareamento global", () => {
  it("uma linha não pode ficar com duas estimativas", () => {
    const r = matchFxEstimates(
      [row({ hash: "a", cents: 60200 })],
      [est({ id: "t1", amount_cents: 60107 }), est({ id: "t2", amount_cents: 60300, description: "Outro" })],
    );
    expect(Object.keys(r)).toHaveLength(1);
    expect(r.a.txId).toBe("t1"); // a mais próxima: |602,00-601,07| < |602,00-603,00|
  });

  it("não troca de par para 'roubar' o melhor: cada linha fica com o seu vizinho mais próximo", () => {
    const r = matchFxEstimates(
      [row({ hash: "x", cents: 10000, date: "2026-11-06" }), row({ hash: "y", cents: 10600, date: "2026-11-06" })],
      [est({ id: "p1", amount_cents: 10050, description: "A" }), est({ id: "p2", amount_cents: 10550, description: "B" })],
    );
    expect(r.x.txId).toBe("p1");
    expect(r.y.txId).toBe("p2");
  });
});
