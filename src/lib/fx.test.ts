import { describe, expect, it } from "vitest";
import {
  convertFx,
  formatBps,
  formatRateMicro,
  impliedSpreadBps,
  nextDayOfMonthOnOrAfter,
  parseAmountToMinor,
  parsePercentToBps,
  parseRateToMicro,
} from "./fx";
import { pickQuote, ptaxResponse, toBcbDate } from "./ptax";

describe("parse/format", () => {
  it.each([
    ["5,5840", 5584000],
    ["5.584", 5584000],
    ["0,03519", 35190],
    ["5,123456", 5123456],
  ])("taxa %s -> %i", (i, e) => expect(parseRateToMicro(i)).toBe(e));
  it.each(["", "abc", "5,1234567", "0", "-1"])("taxa rejeita %j", (i) => expect(parseRateToMicro(i)).toBeNull());

  it("formata taxa com no mínimo 4 casas", () => {
    expect(formatRateMicro(5584000)).toBe("5,5840");
    expect(formatRateMicro(35190)).toBe("0,03519");
    expect(formatRateMicro(5123456)).toBe("5,123456");
  });

  it("valor em moeda com e sem centavos", () => {
    expect(parseAmountToMinor("50", 2)).toBe(5000);
    expect(parseAmountToMinor("1.234,56", 2)).toBe(123456);
    expect(parseAmountToMinor("10000", 0)).toBe(10000);
    expect(parseAmountToMinor("10,5", 0)).toBeNull(); // iene não tem centavos
    expect(parseAmountToMinor("0", 2)).toBeNull();
  });

  it("percentuais", () => {
    expect(parsePercentToBps("3,5")).toBe(350);
    expect(parsePercentToBps("3,5%")).toBe(350);
    expect(parsePercentToBps("0")).toBe(0);
    expect(parsePercentToBps("101")).toBeNull();
    expect(formatBps(350)).toBe("3,5");
    expect(formatBps(338)).toBe("3,38");
    expect(formatBps(400)).toBe("4");
  });
});

describe("convertFx", () => {
  it("US$ 100 a 5,5840, sem spread e IOF de 3,5%", () => {
    const r = convertFx({ amountMinor: 10000, exp: 2, rateMicro: 5584000, spreadBps: 0, iofBps: 350 });
    expect(r.baseCents).toBe(55840);
    expect(r.spreadCents).toBe(0);
    expect(r.iofCents).toBe(1954); // 558,40 × 3,5% = 19,544
    expect(r.totalCents).toBe(57794);
    expect(r.effectiveRateMicro).toBe(5779400);
    expect(r.extraBps).toBe(350);
  });

  it("com spread: IOF incide sobre o valor já com spread", () => {
    const r = convertFx({ amountMinor: 10000, exp: 2, rateMicro: 5584000, spreadBps: 400, iofBps: 350 });
    expect(r.baseCents).toBe(55840);
    expect(r.spreadCents).toBe(2234); // 558,40 × 4% = 22,336
    expect(r.iofCents).toBe(2033); // (558,40+22,34) × 3,5% = 580,74 × 3,5% = 20,3259
    expect(r.totalCents).toBe(60107);
  });

  it("IOF zero (emissor absorve) e spread zero devolvem a base", () => {
    const r = convertFx({ amountMinor: 2500, exp: 2, rateMicro: 6231700, spreadBps: 0, iofBps: 0 });
    expect(r.totalCents).toBe(r.baseCents);
    expect(r.extraBps).toBe(0);
  });

  it("iene (0 casas): ¥ 10.000 a 0,03519", () => {
    const r = convertFx({ amountMinor: 10000, exp: 0, rateMicro: 35190, spreadBps: 0, iofBps: 350 });
    expect(r.baseCents).toBe(35190); // R$ 351,90
    expect(r.totalCents).toBe(36422); // 351,90 × 1,035 = 364,2165
    expect(r.effectiveRateMicro).toBe(36422); // R$ 0,036422 por iene
  });

  it("não perde precisão em valores grandes (BigInt)", () => {
    const r = convertFx({ amountMinor: 900_000_000_00, exp: 2, rateMicro: 9_999_999, spreadBps: 1, iofBps: 1 });
    expect(Number.isSafeInteger(r.totalCents)).toBe(true);
    expect(r.baseCents).toBe(Math.round((900_000_000 * 9.999999) * 100));
  });
});

describe("impliedSpreadBps", () => {
  it("é o inverso de convertFx (com IOF conhecido)", () => {
    const est = convertFx({ amountMinor: 10000, exp: 2, rateMicro: 5584000, spreadBps: 400, iofBps: 350 });
    expect(impliedSpreadBps(est.totalCents, est.baseCents, 350)).toBe(400);
  });
  it("negativo quando a fatura veio abaixo da cotação usada", () => {
    expect(impliedSpreadBps(55000, 55840, 0)).toBeLessThan(0);
  });
  it("entradas inválidas", () => {
    expect(impliedSpreadBps(100, 0, 0)).toBeNull();
    expect(impliedSpreadBps(0, 100, 0)).toBeNull();
  });
});

describe("nextDayOfMonthOnOrAfter", () => {
  it("fechamento no mesmo mês, no mês seguinte e no fim de ano", () => {
    expect(nextDayOfMonthOnOrAfter("2026-11-03", 5)).toBe("2026-11-05");
    expect(nextDayOfMonthOnOrAfter("2026-11-05", 5)).toBe("2026-11-05");
    expect(nextDayOfMonthOnOrAfter("2026-11-06", 5)).toBe("2026-12-05");
    expect(nextDayOfMonthOnOrAfter("2026-12-20", 5)).toBe("2027-01-05");
  });
  it("dia 31 limita ao último dia do mês", () => {
    expect(nextDayOfMonthOnOrAfter("2027-02-10", 31)).toBe("2027-02-28");
  });
});

// Resposta REAL da API Olinda (2026-11-10), cortada nos campos usados.
const REAL = {
  value: [
    { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.5834, cotacaoVenda: 5.584, dataHoraCotacao: "2026-11-10 13:06:01.353639", tipoBoletim: "Fechamento" },
    { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.6053, cotacaoVenda: 5.6059, dataHoraCotacao: "2026-11-10 13:06:01.339351", tipoBoletim: "Intermediário" },
    { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.5974, cotacaoVenda: 5.598, dataHoraCotacao: "2026-11-10 12:09:11.498797", tipoBoletim: "Intermediário" },
  ],
};

describe("ptax", () => {
  it("valida a resposta real e escolhe o fechamento do dia mais recente", () => {
    const parsed = ptaxResponse.parse(REAL);
    const q = pickQuote(parsed.value);
    expect(q).toEqual({ quoteDate: "2026-11-10", sellMicro: 5584000, buyMicro: 5583400, bulletin: "Fechamento", partial: false });
  });
  it("só intermediário: usa o mais recente e marca como parcial", () => {
    const q = pickQuote([REAL.value[2], REAL.value[1]]);
    expect(q).toMatchObject({ sellMicro: 5605900, bulletin: "Intermediário", partial: true });
  });
  it("dias diferentes: pega o dia mais recente (fim de semana volta a sexta)", () => {
    const fri = { ...REAL.value[0], dataHoraCotacao: "2026-11-06 13:06:13.966362", cotacaoVenda: 5.5013 };
    expect(pickQuote([fri, { ...REAL.value[0], dataHoraCotacao: "2026-11-05 13:06:00.000000" }])?.quoteDate).toBe("2026-11-06");
  });
  it("lista vazia (dia sem cotação) → null", () => {
    expect(pickQuote([])).toBeNull();
  });
  it("rejeita resposta com formato inesperado", () => {
    expect(ptaxResponse.safeParse({ value: [{ cotacaoVenda: "5,58" }] }).success).toBe(false);
    expect(ptaxResponse.safeParse({}).success).toBe(false);
  });
  it("data no formato exigido pela API", () => {
    expect(toBcbDate("2026-11-10")).toBe("11-10-2026");
  });
});
