export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave do estabelecimento: tira números, datas, parcelas ("PARC 02/10") e
 * símbolos, e guarda as 3 primeiras palavras. "UBER *TRIP 1234 SAO PAULO" → "UBER TRIP SAO".
 * Retorna "" se não sobrar nada útil.
 */
export function merchantKey(description: string): string {
  const tokens = normalize(description)
    .replace(/\bPARC(ELA)?\b\s*\d+\s*\/\s*\d+/g, " ")
    .replace(/[^A-Z\s]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
  const key = tokens.slice(0, 3).join(" ");
  return key.length >= 3 ? key : "";
}

export type Rule = { pattern: string; category_id: string };

/** Regra mais específica (padrão mais longo) que aparece na descrição. */
export function matchRule(description: string, rules: Rule[]): Rule | null {
  const d = normalize(description);
  let best: Rule | null = null;
  for (const r of rules) {
    if (d.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}
