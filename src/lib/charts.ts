export type DonutSegment = { index: number; fraction: number; offset: number };

/**
 * Fatias de uma rosca: fração de cada valor e deslocamento acumulado (0 a 1).
 * Valores zero ou negativos são ignorados.
 */
export function donutSegments(values: number[]): DonutSegment[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (total === 0) return [];
  let acc = 0;
  const out: DonutSegment[] = [];
  values.forEach((v, index) => {
    if (v <= 0) return;
    const fraction = v / total;
    out.push({ index, fraction, offset: acc });
    acc += fraction;
  });
  return out;
}

/** Altura (0 a 1) de cada barra em relação ao maior valor da série. */
export function barScale(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max === 0 ? 0 : Math.max(0, v) / max));
}

/** Paleta para categorias sem cor própria (ciclo). */
export const PALETTE = [
  "#2f7d5b", "#d9822b", "#3b6fb6", "#b24a6a", "#7a5cc2", "#2c9aa6",
  "#a8873a", "#c2503f", "#5f8a2e", "#8a6d5b", "#4c5b9a", "#999b9e",
];

export function colorFor(index: number, own?: string | null): string {
  return own ?? PALETTE[index % PALETTE.length];
}
