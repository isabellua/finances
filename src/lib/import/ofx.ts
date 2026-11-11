import { parseDate } from "./amount";
import { parseSignedAmountToCents } from "./amount";
import type { ParseResult, ParsedRow } from "./types";

export function looksLikeOFX(text: string): boolean {
  return /<OFX[\s>]/i.test(text) || /OFXHEADER/i.test(text);
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Lê OFX (SGML v1 ou XML v2). Convenção do formato: TRNAMT negativo = saída,
 * tanto para conta quanto para cartão de crédito.
 */
export function parseOFX(text: string): ParseResult & { isCreditCard: boolean } {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const isCreditCard = /<CREDITCARDMSGSRSV1|<CCSTMTRS/i.test(text);

  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];
  if (blocks.length === 0) warnings.push("Nenhuma transação encontrada no arquivo OFX.");

  for (const [i, block] of blocks.entries()) {
    const dt = tag(block, "DTPOSTED");
    const amt = tag(block, "TRNAMT");
    const date = dt ? parseDate(dt) : null;
    // OFX usa ponto decimal; alguns exportadores usam vírgula.
    const cents = amt ? parseSignedAmountToCents(amt.replace(/^(-?)(\d+)\.(\d{1,2})$/, "$1$2,$3")) : null;
    if (!date || cents === null) {
      warnings.push(`Transação ${i + 1} ignorada: data ou valor ilegível.`);
      continue;
    }
    const memo = tag(block, "MEMO");
    const name = tag(block, "NAME");
    const description = decodeEntities((memo || name || "").replace(/\s+/g, " ").trim());
    rows.push({ date, description, amountCents: cents });
  }

  return { rows, warnings, isCreditCard };
}
