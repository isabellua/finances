import { describe, expect, it } from "vitest";
import { detectRecurring, type DetectTx } from "./recurring-detect";

const tx = (date: string, desc: string, cents: number, over: Partial<DetectTx> = {}): DetectTx => ({
  description: desc, amount_cents: cents, occurred_on: date, kind: "expense",
  account_id: null, card_id: "k1", category_id: null, ...over,
});
const today = "2026-11-20";

describe("detectRecurring", () => {
  it("4 meses seguidos, mesmo valor: sugere com próximo vencimento futuro", () => {
    const r = detectRecurring(
      [tx("2026-08-18", "NETFLIX.COM", 5590), tx("2026-09-18", "NETFLIX.COM", 5590), tx("2026-10-18", "NETFLIX.COM", 5590), tx("2026-11-18", "NETFLIX.COM", 5590)],
      [], today,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ amountCents: 5590, day: 18, occurrences: 4, lastDate: "2026-11-18", nextDate: "2026-12-18", target: "c:k1" });
  });

  it("só 2 meses não basta", () => {
    expect(detectRecurring([tx("2026-10-18", "Spotify", 2190), tx("2026-11-18", "Spotify", 2190)], [], today)).toEqual([]);
  });

  it("falta um mês no meio: só conta a sequência final", () => {
    const rows = [tx("2026-06-10", "Gym", 9990), tx("2026-07-10", "Gym", 9990), tx("2026-09-10", "Gym", 9990), tx("2026-10-10", "Gym", 9990)];
    expect(detectRecurring(rows, [], today)).toEqual([]); // sequência final tem 2 meses
    expect(detectRecurring([...rows, tx("2026-11-10", "Gym", 9990)], [], today)).toHaveLength(1); // 9, 10, 11
  });

  it("valores muito diferentes (acima de 5%) não são assinatura", () => {
    const rows = [tx("2026-09-05", "Mercado X", 12000), tx("2026-10-05", "Mercado X", 25000), tx("2026-11-05", "Mercado X", 8000)];
    expect(detectRecurring(rows, [], today)).toEqual([]);
  });

  it("variação pequena (até 5%) ainda conta", () => {
    const rows = [tx("2026-09-05", "Plano Saude", 100000), tx("2026-10-05", "Plano Saude", 102000), tx("2026-11-05", "Plano Saude", 101000)];
    expect(detectRecurring(rows, [], today)[0].amountCents).toBe(101000);
  });

  it("parcela (03/10) não é assinatura", () => {
    const rows = [tx("2026-09-05", "GELADEIRA PARC 03/10", 30000), tx("2026-10-05", "GELADEIRA PARC 04/10", 30000), tx("2026-11-05", "GELADEIRA PARC 05/10", 30000)];
    expect(detectRecurring(rows, [], today)).toEqual([]);
  });

  it("já cadastrada como compromisso fica de fora", () => {
    const rows = [tx("2026-09-18", "NETFLIX.COM", 5590), tx("2026-10-18", "NETFLIX.COM", 5590), tx("2026-11-18", "NETFLIX.COM", 5590)];
    expect(detectRecurring(rows, ["Netflix"], today)).toEqual([]);
  });

  it("sequência antiga demais (parou de cobrar) não é sugerida", () => {
    const rows = [tx("2026-04-18", "Revista", 3000), tx("2026-05-18", "Revista", 3000), tx("2026-06-18", "Revista", 3000)];
    expect(detectRecurring(rows, [], today)).toEqual([]);
  });

  it("forma de pagamento diferente não mistura grupos", () => {
    const rows = [
      tx("2026-09-18", "Uber One", 1990, { card_id: "k1" }), tx("2026-10-18", "Uber One", 1990, { card_id: "k2" }), tx("2026-11-18", "Uber One", 1990, { card_id: "k1" }),
    ];
    expect(detectRecurring(rows, [], today)).toEqual([]);
  });

  it("ignora entradas e lançamentos sem estabelecimento reconhecível", () => {
    const rows = [tx("2026-09-05", "1234", 500), tx("2026-10-05", "1234", 500), tx("2026-11-05", "1234", 500),
      tx("2026-09-06", "Salário", 100000, { kind: "income" }), tx("2026-10-06", "Salário", 100000, { kind: "income" }), tx("2026-11-06", "Salário", 100000, { kind: "income" })];
    expect(detectRecurring(rows, [], today)).toEqual([]);
  });

  it("categoria mais usada vai na sugestão e a de maior valor vem primeiro", () => {
    const rows = [
      tx("2026-09-18", "Streaming A", 5000, { category_id: "lazer" }), tx("2026-10-18", "Streaming A", 5000, { category_id: "lazer" }), tx("2026-11-18", "Streaming A", 5000, { category_id: "outros" }),
      tx("2026-09-10", "Academia B", 9000), tx("2026-10-10", "Academia B", 9000), tx("2026-11-10", "Academia B", 9000),
    ];
    const r = detectRecurring(rows, [], today);
    expect(r.map((x) => x.amountCents)).toEqual([9000, 5000]);
    expect(r[1].categoryId).toBe("lazer");
  });
});
