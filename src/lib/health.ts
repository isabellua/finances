export type HealthInput = {
  /** Meses com lançamentos usados na média. */
  monthsOfData: number;
  incomeAvgCents: number;
  expenseAvgCents: number;
  /** Saldo disponível (conta corrente, poupança, investimento, dinheiro). */
  liquidCents: number;
  /** Limite de cartão usado, de 0 a 1+; null se não há cartão com limite. */
  cardUsedPct: number | null;
  overdueCount: number;
  /** Comprometido por mês (assinaturas, parcelas, contas fixas). */
  committedMonthlyCents: number;
};

export type HealthComponent = {
  key: "savings" | "reserve" | "credit" | "commitment";
  label: string;
  /** 0 a 100, ou null quando não dá para calcular. */
  score: number | null;
  weight: number;
  detail: string;
};

export type HealthResult = {
  score: number | null;
  label: "Ótima" | "Boa" | "Regular" | "Atenção" | null;
  components: HealthComponent[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function healthLabel(score: number): "Ótima" | "Boa" | "Regular" | "Atenção" {
  return score >= 80 ? "Ótima" : score >= 60 ? "Boa" : score >= 40 ? "Regular" : "Atenção";
}

export const HEALTH_WEIGHTS = { savings: 35, reserve: 25, credit: 20, commitment: 20 } as const;

/**
 * Indicador próprio (NÃO é score de crédito nem padrão oficial). Quatro componentes de 0 a 100,
 * com pesos fixos e visíveis; o total é a média ponderada dos que puderam ser calculados.
 *  - Poupança: sobra / receita. 20% ou mais = 100.
 *  - Reserva: saldo disponível / gasto médio mensal. 6 meses ou mais = 100.
 *  - Crédito: uso do limite (até 30% = 100; 100% = 0), com -15 por conta atrasada.
 *  - Comprometimento: fixos / receita (até 50% = 100; 100% ou mais = 0).
 */
export function healthScore(i: HealthInput): HealthResult {
  const components: HealthComponent[] = [];

  // Poupança
  if (i.monthsOfData >= 1 && i.incomeAvgCents > 0) {
    const rate = (i.incomeAvgCents - i.expenseAvgCents) / i.incomeAvgCents;
    components.push({
      key: "savings", label: "Poupança", score: Math.round(clamp((rate / 0.2) * 100)), weight: HEALTH_WEIGHTS.savings,
      detail: rate >= 0 ? `Sobra ${pct(rate)} da receita (meta: 20%).` : `Gasta ${pct(-rate)} a mais do que recebe.`,
    });
  } else {
    components.push({ key: "savings", label: "Poupança", score: null, weight: HEALTH_WEIGHTS.savings, detail: "Sem receita lançada nos últimos meses." });
  }

  // Reserva
  if (i.monthsOfData >= 1 && i.expenseAvgCents > 0) {
    const months = i.liquidCents / i.expenseAvgCents;
    components.push({
      key: "reserve", label: "Reserva", score: Math.round(clamp((months / 6) * 100)), weight: HEALTH_WEIGHTS.reserve,
      detail: `Saldo de ${brl(i.liquidCents)} cobre ${Math.max(0, months).toFixed(1).replace(".", ",")} mês(es) de gastos (meta: 6).`,
    });
  } else {
    components.push({ key: "reserve", label: "Reserva", score: null, weight: HEALTH_WEIGHTS.reserve, detail: "Sem gastos lançados para comparar." });
  }

  // Crédito
  {
    const used = i.cardUsedPct;
    const base = used === null ? 100 : clamp((1 - Math.max(0, used - 0.3) / 0.7) * 100);
    const penalty = 15 * i.overdueCount;
    const parts: string[] = [];
    parts.push(used === null ? "Sem cartão com limite cadastrado." : `Usa ${pct(used)} do limite (ideal: até 30%).`);
    if (i.overdueCount > 0) parts.push(`${i.overdueCount} conta(s) atrasada(s).`);
    components.push({ key: "credit", label: "Crédito", score: Math.round(clamp(base - penalty)), weight: HEALTH_WEIGHTS.credit, detail: parts.join(" ") });
  }

  // Comprometimento
  if (i.incomeAvgCents > 0) {
    const ratio = i.committedMonthlyCents / i.incomeAvgCents;
    components.push({
      key: "commitment", label: "Comprometimento", score: Math.round(clamp((1 - Math.max(0, ratio - 0.5) / 0.5) * 100)), weight: HEALTH_WEIGHTS.commitment,
      detail: `Contas fixas, assinaturas e parcelas somam ${pct(ratio)} da receita (ideal: até 50%).`,
    });
  } else {
    components.push({ key: "commitment", label: "Comprometimento", score: null, weight: HEALTH_WEIGHTS.commitment, detail: "Sem receita para comparar." });
  }

  const avail = components.filter((c) => c.score !== null);
  // Crédito sozinho (sem receita nem gastos) não diz nada sobre saúde: exige outro componente.
  if (avail.length < 2 || !avail.some((c) => c.key !== "credit")) return { score: null, label: null, components };

  const totalW = avail.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(avail.reduce((s, c) => s + c.score! * c.weight, 0) / totalW);
  return { score, label: healthLabel(score), components };
}
