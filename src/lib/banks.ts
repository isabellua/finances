/**
 * Bancos brasileiros disponíveis para escolher ao criar uma conta.
 *
 * As cores são APROXIMADAS (de memória, sem fonte oficial verificada): ajuste
 * aqui se alguma estiver errada. `ink` é a cor do texto sobre `color`.
 *
 * Logos: o app não traz logos oficiais (marca registrada, e este ambiente não
 * baixa arquivos de terceiros). Solte o SVG em `public/banks/<slug>.svg` e
 * acrescente o slug em LOGOS abaixo. Sem arquivo, aparece um selo com a cor do
 * banco e as iniciais.
 */
export type Bank = { slug: string; name: string; color: string; ink: string };

const W = "#FFFFFF";
const K = "#111111";

export const BANKS: readonly Bank[] = [
  { slug: "nubank", name: "Nubank", color: "#820AD1", ink: W },
  { slug: "itau", name: "Itaú", color: "#EC7000", ink: W },
  { slug: "bradesco", name: "Bradesco", color: "#CC092F", ink: W },
  { slug: "banco-do-brasil", name: "Banco do Brasil", color: "#FAE128", ink: "#0B3B8C" },
  { slug: "caixa", name: "Caixa", color: "#005CA9", ink: W },
  { slug: "santander", name: "Santander", color: "#EC0000", ink: W },
  { slug: "inter", name: "Inter", color: "#FF7A00", ink: W },
  { slug: "btg", name: "BTG Pactual", color: "#0B2A4A", ink: W },
  { slug: "c6", name: "C6 Bank", color: "#1A1A1A", ink: W },
  { slug: "xp", name: "XP", color: K, ink: "#F5C400" },
  { slug: "sicoob", name: "Sicoob", color: "#003641", ink: "#9BD400" },
  { slug: "sicredi", name: "Sicredi", color: "#3FA535", ink: W },
  { slug: "banrisul", name: "Banrisul", color: "#0057A8", ink: W },
  { slug: "mercado-pago", name: "Mercado Pago", color: "#00B1EA", ink: W },
  { slug: "picpay", name: "PicPay", color: "#11C76F", ink: W },
  { slug: "neon", name: "Neon", color: "#00E5E5", ink: K },
  { slug: "original", name: "Original", color: "#00A859", ink: W },
  { slug: "safra", name: "Safra", color: "#0B2C5F", ink: W },
  { slug: "pagbank", name: "PagBank", color: "#41B34A", ink: W },
  { slug: "will", name: "Will Bank", color: "#FFD60A", ink: K },
];

export const CASH: Bank = { slug: "dinheiro", name: "Dinheiro", color: "#4B7F52", ink: W };
export const OTHER: Bank = { slug: "outro", name: "Outro banco", color: "#6B7280", ink: W };

/** Slugs que já têm arquivo em public/banks/<slug>.svg. */
export const LOGOS: ReadonlySet<string> = new Set<string>([]);

const ALL = [...BANKS, CASH, OTHER];

export function bankBySlug(slug: string | null | undefined): Bank | null {
  if (!slug) return null;
  return ALL.find((b) => b.slug === slug) ?? null;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Contas antigas guardam só o nome digitado: tenta descobrir o banco por ele. */
export function bankFromName(name: string | null | undefined): Bank | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  return ALL.find((b) => norm(b.name) === n || n.startsWith(norm(b.name))) ?? null;
}

/** Banco da conta: o escolhido; senão, o deduzido do nome; senão, "Outro". */
export function bankOf(account: { bank_slug?: string | null; institution: string | null; name: string }): Bank {
  return bankBySlug(account.bank_slug) ?? bankFromName(account.institution ?? account.name) ?? OTHER;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const CARD_BRANDS = [
  "Visa",
  "Mastercard",
  "Elo",
  "Amex",
  "Hipercard",
  "Outra",
] as const;
