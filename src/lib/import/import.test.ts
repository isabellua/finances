import { describe, expect, it } from "vitest";
import { parseDate, parseSignedAmountToCents } from "./amount";
import { applyMapping, guessMapping, parseCSV, toTable } from "./csv";
import { buildHashes } from "./hash";
import { matchRule, merchantKey } from "./merchant";
import { looksLikeOFX, parseOFX } from "./ofx";

describe("parseSignedAmountToCents", () => {
  it.each([
    ["-1.234,56", -123456],
    ["1.234,56", 123456],
    ["1.234,56-", -123456],
    ["(12,34)", -1234],
    ["R$ -12,50", -1250],
    ["12,34 D", -1234],
    ["12,34 C", 1234],
    ["1234.56", 123456],
    ["+5,00", 500],
  ])("%s -> %i", (input, expected) => {
    expect(parseSignedAmountToCents(input)).toBe(expected);
  });
  it.each(["", "abc", "--5"])("rejeita %j", (i) => {
    expect(parseSignedAmountToCents(i)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["05/11/2026", "2026-11-05"],
    ["5/1/2026", "2026-01-05"],
    ["05-11-2026", "2026-11-05"],
    ["05/11/26", "2026-11-05"],
    ["2026-11-05", "2026-11-05"],
    ["20261105120000[-3:BRT]", "2026-11-05"],
  ])("%s -> %s", (i, e) => expect(parseDate(i)).toBe(e));
  it.each(["31/02/2026", "13/13/2026", "", "xx"])("rejeita %j", (i) => {
    expect(parseDate(i)).toBeNull();
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261105120000[-3:BRT]
<TRNAMT>-45.90
<FITID>abc1
<MEMO>COMPRA MERCADO &amp; CIA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261106
<TRNAMT>5000.00
<FITID>abc2
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX_XML_CARD = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>1</FITID><MEMO>UBER *TRIP</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>800.00</TRNAMT><FITID>2</FITID><MEMO>PAGAMENTO RECEBIDO</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe("OFX", () => {
  it("lê SGML de conta corrente", () => {
    expect(looksLikeOFX(OFX_SGML)).toBe(true);
    const r = parseOFX(OFX_SGML);
    expect(r.isCreditCard).toBe(false);
    expect(r.rows).toEqual([
      { date: "2026-11-05", description: "COMPRA MERCADO & CIA", amountCents: -4590 },
      { date: "2026-11-06", description: "SALARIO", amountCents: 500000 },
    ]);
  });
  it("lê XML de cartão e detecta cartão", () => {
    const r = parseOFX(OFX_XML_CARD);
    expect(r.isCreditCard).toBe(true);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-12000, 80000]);
  });
  it("avisa quando não há transações", () => {
    expect(parseOFX("<OFX></OFX>").warnings.length).toBe(1);
  });
});

const CSV_BR = `Extrato Conta Corrente;;;
Agência: 0000;;;
Data;Histórico;Documento;Valor
05/11/2026;COMPRA MERCADO;123;-45,90
06/11/2026;"SALARIO; EMPRESA X";456;5.000,00
Saldo;;;1.000,00`;

describe("CSV", () => {
  it("parse com aspas e delimitador no campo", () => {
    expect(parseCSV('a;"b;c";d\n1;2;3')).toEqual([["a", "b;c", "d"], ["1", "2", "3"]]);
  });
  it("acha o cabeçalho depois de linhas de título e mapeia colunas", () => {
    const t = toTable(CSV_BR);
    expect(t.headers).toEqual(["Data", "Histórico", "Documento", "Valor"]);
    const m = guessMapping(t.headers);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 3 });
    const r = applyMapping(t, m);
    expect(r.rows).toEqual([
      { date: "2026-11-05", description: "COMPRA MERCADO", amountCents: -4590 },
      { date: "2026-11-06", description: "SALARIO; EMPRESA X", amountCents: 500000 },
    ]);
    expect(r.warnings[0]).toMatch(/1 linha/);
  });
  it("inverte o sinal (fatura com compras positivas)", () => {
    const t = toTable("Data;Estabelecimento;Valor\n01/11/2026;LOJA;100,00");
    const m = { ...guessMapping(t.headers), invert: true };
    expect(applyMapping(t, m).rows[0].amountCents).toBe(-10000);
  });
  it("débito e crédito em colunas separadas", () => {
    const t = toTable("Data;Descrição;Débito;Crédito\n01/11/2026;A;10,00;\n02/11/2026;B;;20,00");
    const r = applyMapping(t, guessMapping(t.headers));
    expect(r.rows.map((x) => x.amountCents)).toEqual([-1000, 2000]);
  });
});

describe("merchantKey / matchRule", () => {
  it("normaliza e corta números e parcelas", () => {
    expect(merchantKey("UBER *TRIP 1234 SAO PAULO")).toBe("UBER TRIP SAO");
    expect(merchantKey("Padaria Pão Quente PARC 02/10")).toBe("PADARIA PAO QUENTE");
    expect(merchantKey("12345")).toBe("");
  });
  it("usa a regra mais específica", () => {
    const rules = [
      { pattern: "UBER", category_id: "transporte" },
      { pattern: "UBER EATS", category_id: "alimentacao" },
    ];
    expect(matchRule("Uber Eats Pedido 99", rules)?.category_id).toBe("alimentacao");
    expect(matchRule("UBER TRIP", rules)?.category_id).toBe("transporte");
    expect(matchRule("PADARIA", rules)).toBeNull();
  });
});

describe("buildHashes", () => {
  const row = { date: "2026-11-05", description: "Metro", amountCents: -500 };
  it("é determinístico e separa ocorrências idênticas", async () => {
    const a = await buildHashes("a:1", [row, row, { ...row, amountCents: -600 }]);
    const b = await buildHashes("a:1", [row, row, { ...row, amountCents: -600 }]);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });
  it("muda com o destino (conta diferente não colide)", async () => {
    const [x] = await buildHashes("a:1", [row]);
    const [y] = await buildHashes("c:9", [row]);
    expect(x).not.toBe(y);
  });
  it("não depende de maiúsculas/acentos na descrição", async () => {
    const [x] = await buildHashes("a:1", [{ ...row, description: "Metrô" }]);
    const [y] = await buildHashes("a:1", [{ ...row, description: "METRO" }]);
    expect(x).toBe(y);
  });
});
