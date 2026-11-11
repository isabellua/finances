import { parseBRLToCents } from "@/lib/money";

/**
 * Valor com sinal, em formatos comuns de extrato brasileiro:
 * "-1.234,56", "1.234,56-", "(12,34)", "R$ -12,50", "12,34 D", "12,34 C", "1234.56".
 * Retorna null se não for um valor válido.
 */
export function parseSignedAmountToCents(input: string): number | null {
  let s = input.trim();
  if (s === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/[Dd]\s*$/.test(s)) {
    negative = true;
    s = s.replace(/[Dd]\s*$/, "");
  } else if (/[Cc]\s*$/.test(s)) {
    s = s.replace(/[Cc]\s*$/, "");
  }
  s = s.replace(/R\$/gi, "").trim();
  if (s.startsWith("-")) {
    negative = true; // sinal explícito indica saída
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }

  const cents = parseBRLToCents(s.trim());
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/** Data em dd/mm/yyyy, dd/mm/yy, dd-mm-yyyy, yyyy-mm-dd ou yyyymmdd → YYYY-MM-DD. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(m[1], m[2], m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valid(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return valid(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})\b/);
  if (m) return valid(String(2000 + Number(m[3])), m[2], m[1]);
  return null;
}

function valid(y: string, mo: string, d: string): string | null {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1) return null; // ex.: 31/02
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
