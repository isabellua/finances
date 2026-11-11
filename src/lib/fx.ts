/**
 * Compra internacional no cartão: cotação + spread do emissor + IOF.
 * Tudo em inteiros (centavos, "micro" = 1e-6, "bps" = 1/100 de %), com BigInt
 * nas multiplicações grandes. Nada de float no dinheiro.
 */

export type Currency = { code: string; name: string; exp: 0 | 2 };

/** Moedas com PTAX no Banco Central. Iene não tem centavos. */
export const CURRENCIES: Currency[] = [
  { code: "USD", name: "Dólar americano", exp: 2 },
  { code: "EUR", name: "Euro", exp: 2 },
  { code: "GBP", name: "Libra esterlina", exp: 2 },
  { code: "JPY", name: "Iene", exp: 0 },
  { code: "CAD", name: "Dólar canadense", exp: 2 },
  { code: "AUD", name: "Dólar australiano", exp: 2 },
  { code: "CHF", name: "Franco suíço", exp: 2 },
  { code: "DKK", name: "Coroa dinamarquesa", exp: 2 },
  { code: "NOK", name: "Coroa norueguesa", exp: 2 },
  { code: "SEK", name: "Coroa sueca", exp: 2 },
];

export function currencyExp(code: string): 0 | 2 {
  return CURRENCIES.find((c) => c.code === code)?.exp ?? 2;
}

const big = (n: number) => BigInt(n);

/** a*b/c arredondado (metade para cima), para inteiros não negativos. */
function mulDivRound(a: bigint, b: bigint, c: bigint): bigint {
  const num = a * b;
  return (num * big(2) + c) / (big(2) * c);
}

/** "5,5840" ou "5.584" → micro (5584000). Até 6 casas. null se inválido. */
export function parseRateToMicro(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const micro = Number(int) * 1_000_000 + Number(frac.padEnd(6, "0"));
  return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
}

/** micro → texto com vírgula, no mínimo 4 casas ("5,5840"), sem zeros à direita além disso. */
export function formatRateMicro(micro: number): string {
  const int = Math.floor(micro / 1_000_000);
  let frac = String(micro % 1_000_000).padStart(6, "0");
  while (frac.length > 4 && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${int},${frac}`;
}

/** Valor na moeda estrangeira, digitado ("50", "1.234,56"), → unidades menores (centavos; iene: inteiro). */
export function parseAmountToMinor(input: string, exp: 0 | 2): number | null {
  const s = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  let norm = s;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma !== -1) norm = s.replace(/\./g, "").replace(",", ".");
  else if (dot !== -1) {
    const decimals = s.length - dot - 1;
    if (decimals === 3 || s.split(".").length > 2) norm = s.replace(/\./g, "");
  }
  const re = exp === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(norm)) return null;
  const [int, frac = ""] = norm.split(".");
  const minor = exp === 0 ? Number(int) : Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** "3,5" → 350 bps. Aceita 0 a 100 com até 2 casas. */
export function parsePercentToBps(input: string): number | null {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const bps = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

export function formatBps(bps: number): string {
  const int = Math.floor(bps / 100);
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${int},${frac}` : String(int);
}

export type FxInput = {
  amountMinor: number;
  exp: 0 | 2;
  rateMicro: number;
  spreadBps: number;
  iofBps: number;
};

export type FxResult = {
  baseCents: number;
  spreadCents: number;
  iofCents: number;
  totalCents: number;
  /** R$ por 1 unidade da moeda, já com spread e IOF (micro). */
  effectiveRateMicro: number;
  /** Custo extra total sobre a cotação, em bps (spread + IOF). */
  extraBps: number;
};

/**
 * base   = valor × cotação
 * spread = base × spread%
 * IOF    = (base + spread) × IOF%   ← [suposição] IOF sobre o valor já convertido com spread;
 *                                      confirme com o emissor (muda centavos, não a ordem de grandeza)
 */
export function convertFx(i: FxInput): FxResult {
  const minor = big(i.amountMinor);
  const baseCents = Number(
    mulDivRound(minor * big(i.rateMicro), big(100), big(10) ** big(i.exp) * big(1_000_000)),
  );
  const spreadCents = Number(mulDivRound(big(baseCents), big(i.spreadBps), big(10_000)));
  const withSpread = baseCents + spreadCents;
  const iofCents = Number(mulDivRound(big(withSpread), big(i.iofBps), big(10_000)));
  const totalCents = withSpread + iofCents;

  const effectiveRateMicro = Number(
    mulDivRound(big(totalCents) * big(1_000_000), big(10) ** big(i.exp), minor * big(100)),
  );
  const extraBps = baseCents > 0 ? Math.round((totalCents / baseCents - 1) * 10_000) : 0;

  return { baseCents, spreadCents, iofCents, totalCents, effectiveRateMicro, extraBps };
}

/**
 * Spread implícito: dado o valor que a fatura realmente cobrou, qual spread explica a
 * diferença para a cotação usada, supondo o IOF informado? Pode ser negativo se a
 * cotação do emissor foi menor que a usada na estimativa.
 */
export function impliedSpreadBps(actualCents: number, baseCents: number, iofBps: number): number | null {
  if (baseCents <= 0 || actualCents <= 0) return null;
  return Math.round((actualCents / (baseCents * (1 + iofBps / 10_000)) - 1) * 10_000);
}

/** Próxima ocorrência do dia `day` (1-31, limitado ao fim do mês) em ou depois de `fromISO`. */
export function nextDayOfMonthOnOrAfter(fromISO: string, day: number): string {
  const [y, m, d] = fromISO.split("-").map(Number);
  const make = (yy: number, mm: number) => {
    const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`;
  };
  const thisMonth = make(y, m);
  if (thisMonth >= `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`) {
    return thisMonth;
  }
  return m === 12 ? make(y + 1, 1) : make(y, m + 1);
}

/** Valor em moeda estrangeira para exibição ("US$ 100,00", "¥ 10.000"). Só exibição: não usar em conta. */
export function formatForeign(code: string, minor: number): string {
  const exp = currencyExp(code);
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(minor / 10 ** exp);
  } catch {
    return `${code} ${(minor / 10 ** exp).toFixed(exp)}`;
  }
}
