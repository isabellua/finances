import { describe, expect, it } from "vitest";
import { invoiceFor, invoiceState, invoiceTotals, limitUsed, shiftInvoice } from "./invoices";

const c = { closingDay: 5, dueDay: 12 };

describe("invoiceFor", () => {
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceFor("2026-11-03", c)).toEqual({ closing: "2026-11-05", start: "2026-10-06", due: "2026-11-12" });
  });
  it("compra no dia do fechamento ainda entra nela (inclusivo)", () => {
    expect(invoiceFor("2026-11-05", c).closing).toBe("2026-11-05");
  });
  it("compra depois do fechamento vai para a fatura seguinte", () => {
    expect(invoiceFor("2026-11-06", c)).toEqual({ closing: "2026-12-05", start: "2026-11-06", due: "2026-12-12" });
  });
  it("vencimento no mês seguinte quando o dia é menor que o do fechamento", () => {
    const x = invoiceFor("2026-12-10", { closingDay: 28, dueDay: 4 });
    expect(x).toEqual({ closing: "2026-12-28", start: "2026-11-29", due: "2027-01-04" });
  });
  it("fechamento dia 31 limita ao fim do mês e o início não desliza", () => {
    const x = invoiceFor("2027-02-10", { closingDay: 31, dueDay: 10 });
    expect(x.closing).toBe("2027-02-28");
    expect(x.start).toBe("2027-02-01"); // fechamento de jan foi 31/01
    expect(invoiceFor("2027-03-01", { closingDay: 31, dueDay: 10 }).start).toBe("2027-03-01");
  });
  it("virada de ano", () => {
    expect(invoiceFor("2026-12-20", c)).toEqual({ closing: "2027-01-05", start: "2026-12-06", due: "2027-01-12" });
  });
});

describe("shiftInvoice", () => {
  it("anda para trás e para frente sem buracos entre faturas", () => {
    const base = invoiceFor("2026-11-03", c);
    const prev = shiftInvoice(base, -1, c);
    const next = shiftInvoice(base, 1, c);
    expect(prev.closing).toBe("2026-10-05");
    expect(next.closing).toBe("2026-12-05");
    // a fatura seguinte começa no dia depois do fechamento da atual
    expect(next.start).toBe("2026-11-06");
    expect(base.start).toBe("2026-10-06");
  });
});

const inv = invoiceFor("2026-11-03", c); // 06/10 a 05/11, vence 12/11
const txs = [
  { kind: "expense", amount_cents: 10000, occurred_on: "2026-10-06" }, // 1º dia
  { kind: "expense", amount_cents: 5000, occurred_on: "2026-11-05" }, // dia do fechamento
  { kind: "expense", amount_cents: 7000, occurred_on: "2026-11-06" }, // próxima fatura
  { kind: "expense", amount_cents: 900, occurred_on: "2026-10-05" }, // fatura anterior
  { kind: "invoice_payment", amount_cents: 15000, occurred_on: "2026-11-12" },
];

describe("invoiceTotals", () => {
  it("soma compras do período (limites inclusivos) e pagamentos da janela", () => {
    expect(invoiceTotals(inv, txs, c)).toEqual({ totalCents: 15000, paidCents: 15000, purchaseCount: 2 });
  });
  it("pagamento antes do fechamento não é associado", () => {
    const t = invoiceTotals(inv, [...txs.slice(0, 4), { kind: "invoice_payment", amount_cents: 999, occurred_on: "2026-11-01" }], c);
    expect(t.paidCents).toBe(0);
  });
});

describe("invoiceState", () => {
  const t = (total: number, paid: number) => ({ totalCents: total, paidCents: paid, purchaseCount: 1 });
  it.each([
    ["2026-11-01", t(100, 0), "open"],
    ["2026-11-05", t(100, 0), "open"], // dia do fechamento ainda aberta
    ["2026-11-08", t(100, 0), "closed"],
    ["2026-11-12", t(100, 0), "closed"], // no dia do vencimento ainda não está vencida
    ["2026-11-13", t(100, 0), "overdue"],
    ["2026-11-13", t(100, 100), "paid"],
    ["2026-11-20", t(100, 40), "overdue"],
    ["2026-11-20", t(0, 0), "empty"],
  ])("%s %j → %s", (today, totals, expected) => {
    expect(invoiceState(inv, totals, today)).toBe(expected);
  });
});

describe("limitUsed", () => {
  it("soma o que falta pagar das faturas até a atual", () => {
    // fatura de nov (15000) paga; fatura de dez aberta com 7000 → usado 7000
    expect(limitUsed(txs, c, "2026-11-20")).toBe(7000 + 900); // 900 da fatura de out não paga
  });
  it("sem lançamentos, zero", () => {
    expect(limitUsed([], c, "2026-11-20")).toBe(0);
  });
});
