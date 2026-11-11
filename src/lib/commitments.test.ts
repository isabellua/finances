import { describe, expect, it } from "vitest";
import {
  classify,
  occurrenceDate,
  occurrencesBetween,
  projectMonths,
  remainingOccurrences,
  softMatch,
  type Commitment,
} from "./commitments";

const base: Commitment = {
  id: "c1",
  kind: "subscription",
  description: "Netflix",
  amount_cents: 5590,
  frequency: "monthly",
  start_on: "2026-01-31",
  total_occurrences: null,
  end_on: null,
  account_id: null,
  card_id: "card1",
  category_id: null,
  active: true,
};

describe("occurrenceDate", () => {
  it("mensal com âncora no dia 31", () => {
    expect(occurrenceDate(base, 1)).toBe("2026-01-31");
    expect(occurrenceDate(base, 2)).toBe("2026-02-28");
    expect(occurrenceDate(base, 3)).toBe("2026-03-31");
  });
  it("anual", () => {
    expect(occurrenceDate({ ...base, frequency: "yearly", start_on: "2026-03-10" }, 3)).toBe("2028-03-10");
  });
});

describe("occurrencesBetween", () => {
  it("assinatura sem fim gera uma por mês na janela", () => {
    const occ = occurrencesBetween(base, "2026-11-01", "2027-02-01");
    expect(occ.map((o) => o.date)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(occ.map((o) => o.seq)).toEqual([11, 12, 13]);
  });
  it("parcelado termina na última parcela", () => {
    const c: Commitment = { ...base, kind: "installment", start_on: "2026-10-05", total_occurrences: 3 };
    const occ = occurrencesBetween(c, "2026-01-01", "2030-01-01");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
  });
  it("avulsa: uma só", () => {
    const c: Commitment = { ...base, kind: "one_off", start_on: "2026-12-20", total_occurrences: 1 };
    expect(occurrencesBetween(c, "2026-01-01", "2030-01-01")).toHaveLength(1);
  });
  it("respeita end_on e pausa", () => {
    expect(occurrencesBetween({ ...base, start_on: "2026-01-10", end_on: "2026-03-15" }, "2026-01-01", "2027-01-01")).toHaveLength(3);
    expect(occurrencesBetween({ ...base, active: false }, "2026-01-01", "2027-01-01")).toEqual([]);
  });
  it("janela é [from, to): data igual a `to` fica de fora", () => {
    const c = { ...base, start_on: "2026-11-10" };
    expect(occurrencesBetween(c, "2026-11-10", "2026-11-10")).toEqual([]);
    expect(occurrencesBetween(c, "2026-11-10", "2026-11-11")).toHaveLength(1);
  });
});

describe("classify", () => {
  const today = "2026-11-10";
  it("quitada e pulada vencem qualquer data", () => {
    expect(classify("2026-10-01", today, { status: "paid" }, false).status).toBe("paid");
    expect(classify("2026-10-01", today, { status: "skipped" }, false).status).toBe("skipped");
  });
  it("reconhecida no extrato", () => {
    expect(classify("2026-11-09", today, undefined, true).status).toBe("matched");
  });
  it("atrasada, vence logo, futura", () => {
    expect(classify("2026-11-09", today, undefined, false)).toEqual({ status: "overdue", daysUntil: -1 });
    expect(classify("2026-11-10", today, undefined, false)).toEqual({ status: "due_soon", daysUntil: 0 });
    expect(classify("2026-11-17", today, undefined, false).status).toBe("due_soon");
    expect(classify("2026-11-18", today, undefined, false).status).toBe("upcoming");
  });
});

describe("softMatch", () => {
  const occ = occurrencesBetween({ ...base, start_on: "2026-11-05" }, "2026-11-01", "2026-12-01");
  const tx = (over: Partial<Parameters<typeof softMatch>[1][number]>) => ({
    id: "t1",
    kind: "expense",
    amount_cents: 5590,
    occurred_on: "2026-11-06",
    description: "NETFLIX.COM SAO PAULO",
    account_id: null,
    card_id: "card1",
    ...over,
  });

  it("casa quando destino, valor, data e nome batem", () => {
    expect([...softMatch(occ, [tx({})]).values()]).toEqual(["t1"]);
  });
  it.each([
    ["valor diferente", { amount_cents: 5000 }],
    ["outro cartão", { card_id: "outro" }],
    ["longe demais", { occurred_on: "2026-11-20" }],
    ["nome diferente", { description: "SPOTIFY" }],
    ["não é saída", { kind: "income" }],
  ])("não casa: %s", (_n, over) => {
    expect(softMatch(occ, [tx(over)]).size).toBe(0);
  });
  it("um lançamento casa uma única ocorrência", () => {
    const two = occurrencesBetween({ ...base, start_on: "2026-11-05" }, "2026-11-01", "2027-01-01");
    expect(softMatch(two, [tx({})]).size).toBe(1);
  });
});

describe("projectMonths", () => {
  const sub = base;
  const inst: Commitment = {
    ...base, id: "c2", kind: "installment", description: "Geladeira", amount_cents: 30000,
    start_on: "2026-11-15", total_occurrences: 3, card_id: "card1",
  };
  it("soma assinatura + parcelas e some quando a parcela acaba", () => {
    const p = projectMonths([sub, inst], () => false, "2026-11", 4);
    expect(p.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(p.map((m) => m.totalCents)).toEqual([35590, 35590, 35590, 5590]);
    expect(p[0].byKind.installment).toBe(30000);
    expect(p[3].byKind.installment).toBe(0);
  });
  it("ignora o que já foi quitado", () => {
    const p = projectMonths([inst], (id, seq) => id === "c2" && seq === 1, "2026-11", 2);
    expect(p.map((m) => m.totalCents)).toEqual([0, 30000]);
  });
});

describe("remainingOccurrences", () => {
  it("conta parcelas que faltam", () => {
    const c: Commitment = { ...base, kind: "installment", total_occurrences: 10 };
    expect(remainingOccurrences(c, new Set([1, 2, 3]))).toBe(7);
    expect(remainingOccurrences(base, new Set([1]))).toBeNull();
  });
});
