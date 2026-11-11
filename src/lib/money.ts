/** Valores monetários sempre em centavos (inteiro). Nunca float. */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Converte texto digitado em reais para centavos.
 * Aceita "1234,56", "1.234,56", "1234.56", "R$ 12,5", "12".
 * Retorna null se não for um valor válido.
 */
export function parseBRLToCents(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1) {
    // vírgula é o separador decimal; pontos são milhar
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1;
    // "1.234" (3 dígitos após o ponto, único ponto) é milhar; "12.5" / "12.50" é decimal
    const dotCount = s.split(".").length - 1;
    if (decimals === 3 || dotCount > 1) s = s.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [int, frac = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos → texto para campo de formulário ("1234,56"), sem símbolo nem milhar. */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${int},${frac}`;
}
