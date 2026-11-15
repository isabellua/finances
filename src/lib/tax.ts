/**
 * IOF de compra internacional no cartão, por data de vigência.
 * [Suposição] Valores vêm de fontes secundárias (3,5% desde julho de 2025; 3,38% antes) e
 * NÃO foram conferidos na Receita Federal. O usuário não digita isto: é padrão do app, e o
 * cartão pode ter IOF próprio (por exemplo 0, se o emissor absorve).
 */
export const IOF_CARD_INTERNATIONAL: { from: string; bps: number }[] = [
  { from: "2025-07-01", bps: 350 },
  { from: "0000-01-01", bps: 338 },
];

export function iofBpsOn(date: string): number {
  return (IOF_CARD_INTERNATIONAL.find((r) => date >= r.from) ?? IOF_CARD_INTERNATIONAL[IOF_CARD_INTERNATIONAL.length - 1]).bps;
}

/** IOF efetivo de um cartão numa data: o próprio do cartão, ou o padrão vigente. */
export function effectiveIofBps(cardIofBps: number | null | undefined, date: string): number {
  return cardIofBps ?? iofBpsOn(date);
}
