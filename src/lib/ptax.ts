import { z } from "zod";

/** Resposta real da API Olinda do Banco Central (conferida em 2026-11-11). */
export const ptaxResponse = z.object({
  value: z.array(
    z.object({
      cotacaoCompra: z.number(),
      cotacaoVenda: z.number(),
      dataHoraCotacao: z.string(),
      tipoBoletim: z.string(),
    }),
  ),
});

export type PtaxQuote = {
  /** Data da cotação usada (YYYY-MM-DD). Pode ser anterior à pedida (fim de semana, feriado). */
  quoteDate: string;
  sellMicro: number;
  buyMicro: number;
  /** "Fechamento" é a PTAX oficial do dia. Se só há intermediário, o dia ainda não fechou. */
  bulletin: "Fechamento" | "Intermediário";
  partial: boolean;
};

const toMicro = (n: number) => Math.round(n * 1_000_000);

/**
 * A API devolve vários boletins por dia, do mais recente para o mais antigo (pedimos assim).
 * Pega o dia mais recente e, dentro dele, o fechamento; senão, o último intermediário.
 */
export function pickQuote(rows: z.infer<typeof ptaxResponse>["value"]): PtaxQuote | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.dataHoraCotacao.localeCompare(a.dataHoraCotacao));
  const day = sorted[0].dataHoraCotacao.slice(0, 10);
  const ofDay = sorted.filter((r) => r.dataHoraCotacao.startsWith(day));
  const closing = ofDay.find((r) => r.tipoBoletim === "Fechamento");
  const chosen = closing ?? ofDay[0];
  return {
    quoteDate: day,
    sellMicro: toMicro(chosen.cotacaoVenda),
    buyMicro: toMicro(chosen.cotacaoCompra),
    bulletin: closing ? "Fechamento" : "Intermediário",
    partial: !closing,
  };
}

/** YYYY-MM-DD → MM-DD-YYYY, como a API exige. */
export function toBcbDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}
