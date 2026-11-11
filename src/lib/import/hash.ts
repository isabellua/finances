import { normalize } from "./merchant";
import type { ParsedRow } from "./types";

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash estável por linha: destino + data + valor + descrição + nº da ocorrência.
 * O contador de ocorrência separa compras idênticas no mesmo dia (duas passagens
 * de metrô de R$ 5,00), sem marcar a segunda como duplicata.
 */
export async function buildHashes(target: string, rows: ParsedRow[]): Promise<string[]> {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const r of rows) {
    const base = `${target}|${r.date}|${r.amountCents}|${normalize(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push(await sha256Hex(`${base}|${n}`));
  }
  return out;
}
