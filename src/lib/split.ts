/**
 * Parcelar compra à vista já lançada no cartão (função de alguns bancos, ex.: BB).
 * Modelo (tabela Price): financiado = valor × (1 + custo inicial); parcela =
 * financiado × i / (1 − (1+i)^−n), primeira parcela em 1 mês; total = parcela × n.
 * Taxas em ppm (1e-6 da fração): 4,201% a.m. = 42010. A parcela usa potência
 * (precisa de float), arredondada para centavo; todo o resto é inteiro.
 */

export type SplitParams = {
  ratePpm: number; // juros ao mês
  upfrontPpm: number; // custo cobrado no ato (provável IOF), financiado junto
  minCents: number; // valor mínimo da compra para poder parcelar
  maxParts: number;
};

/**
 * Banco do Brasil, ajustado ao print do app (compra de R$ 194,90, 2 a 12x).
 * Uma única compra não separa "%" de "valor fixo" no custo inicial, e o banco
 * pode mudar a taxa por perfil/data: tratar como estimativa.
 * Com estes valores as 11 parcelas do print saem exatas, ao centavo.
 */
export const BB_SPLIT: SplitParams = { ratePpm: 42010, upfrontPpm: 6500, minCents: 10000, maxParts: 12 };

export type SplitConfig = {
  split_rate_ppm?: number | null;
  split_upfront_ppm?: number | null;
  split_min_cents?: number | null;
  split_max_parts?: number | null;
};

/** Parâmetros do cartão; sem configuração própria, o padrão do banco (só BB tem). */
export function resolveSplit(card: SplitConfig, bankSlug: string | null | undefined): SplitParams | null {
  if (card.split_rate_ppm != null) {
    return {
      ratePpm: card.split_rate_ppm,
      upfrontPpm: card.split_upfront_ppm ?? 0,
      minCents: card.split_min_cents ?? 0,
      maxParts: card.split_max_parts ?? 12,
    };
  }
  return bankSlug === "banco-do-brasil" ? BB_SPLIT : null;
}

export type SplitRow = { parts: number; installmentCents: number; totalCents: number; extraCents: number };

export function splitPlan(amountCents: number, p: SplitParams): SplitRow[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents < p.minCents) return [];
  const financed = (amountCents * (1_000_000 + p.upfrontPpm)) / 1_000_000;
  const i = p.ratePpm / 1_000_000;
  const rows: SplitRow[] = [];
  for (let n = 2; n <= p.maxParts; n++) {
    const raw = i === 0 ? financed / n : (financed * i) / (1 - Math.pow(1 + i, -n));
    const installmentCents = Math.round(raw);
    const totalCents = installmentCents * n;
    rows.push({ parts: n, installmentCents, totalCents, extraCents: totalCents - amountCents });
  }
  return rows;
}

/** "4,201" / "4.2" / "4,201%" → ppm (até 4 casas decimais de %). null se inválido ou > 30%. */
export function parsePercentToPpm(input: string): number | null {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const ppm = Number(int) * 10_000 + Number(frac.padEnd(4, "0"));
  return ppm <= 300_000 ? ppm : null;
}

export function formatPpmPercent(ppm: number): string {
  const int = Math.floor(ppm / 10_000);
  const frac = String(ppm % 10_000).padStart(4, "0").replace(/0+$/, "");
  return frac ? `${int},${frac}` : String(int);
}

/** Taxa efetiva anual equivalente (só para exibir). */
export function annualFromMonthlyPpm(ratePpm: number): number {
  return (Math.pow(1 + ratePpm / 1_000_000, 12) - 1) * 100;
}
