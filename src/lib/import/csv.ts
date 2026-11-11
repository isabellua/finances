import { parseDate, parseSignedAmountToCents } from "./amount";
import type { ParseResult, ParsedRow } from "./types";

export type CsvTable = { headers: string[]; rows: string[][]; delimiter: string };

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts = [";", ",", "\t"].map((d) => [d, sample.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Parser CSV com aspas e quebras de linha dentro de campo. */
export function parseCSV(text: string, delimiter = detectDelimiter(text)): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out;
}

/**
 * Acha a linha de cabeçalho: a primeira com 3+ colunas em que alguma coluna
 * parece "data". Extratos de banco costumam ter linhas de título antes.
 */
export function toTable(text: string): CsvTable {
  const delimiter = detectDelimiter(text);
  const all = parseCSV(text, delimiter);
  let headerIdx = all.findIndex(
    (r) => r.length >= 3 && r.some((c) => /\bdata\b|\bdt\b|date/i.test(c)),
  );
  if (headerIdx === -1) headerIdx = 0;
  const headers = (all[headerIdx] ?? []).map((h) => h.trim());
  const rows = all.slice(headerIdx + 1).filter((r) => r.length >= Math.min(headers.length, 2));
  return { headers, rows, delimiter };
}

export type CsvMapping = {
  date: number;
  description: number;
  /** Coluna única com valor com sinal. */
  amount: number | null;
  /** Alternativa: colunas separadas de débito e crédito (ambas positivas). */
  debit: number | null;
  credit: number | null;
  /** Marque quando, no arquivo, saídas aparecem como números positivos (comum em fatura). */
  invert: boolean;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function guessMapping(headers: string[]): CsvMapping {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(norm(h)));
  const date = find(/\bdata\b|^dt|date/);
  const description = find(/descri|historico|lancamento|estabelecimento|titulo|memo|detalhe/);
  const debit = find(/debito|saida/);
  const credit = find(/credito|entrada/);
  const amount = find(/valor|amount|quantia/);
  return {
    date: date === -1 ? 0 : date,
    description: description === -1 ? Math.min(1, headers.length - 1) : description,
    amount: amount === -1 ? null : amount,
    debit: debit === -1 ? null : debit,
    credit: credit === -1 ? null : credit,
    invert: false,
  };
}

export function applyMapping(table: CsvTable, m: CsvMapping): ParseResult {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const r of table.rows) {
    const date = parseDate(r[m.date] ?? "");
    let cents: number | null = null;

    if (m.amount !== null) {
      cents = parseSignedAmountToCents(r[m.amount] ?? "");
    } else if (m.debit !== null || m.credit !== null) {
      const d = m.debit !== null ? parseSignedAmountToCents(r[m.debit] ?? "") : null;
      const c = m.credit !== null ? parseSignedAmountToCents(r[m.credit] ?? "") : null;
      if (d === null && c === null) cents = null;
      else cents = Math.abs(c ?? 0) - Math.abs(d ?? 0);
    }

    if (!date || cents === null || cents === 0) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      description: (r[m.description] ?? "").replace(/\s+/g, " ").trim(),
      amountCents: m.invert ? -cents : cents,
    });
  }

  if (skipped > 0) warnings.push(`${skipped} linha(s) ignorada(s) por data ou valor ilegível (cabeçalhos, totais, saldos).`);
  return { rows, warnings };
}
