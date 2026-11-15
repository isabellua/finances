/**
 * Bancos brasileiros disponíveis para escolher ao criar uma conta.
 *
 * As cores são APROXIMADAS (de memória, sem fonte oficial verificada): ajuste
 * aqui se alguma estiver errada. `ink` é a cor do texto sobre `color`.
 *
 * Logos: arquivos em public/banks/<slug>.svg, vindos do repositório público
 * Tgentil/Bancos-em-SVG (que não declara licença; logos são marcas dos bancos).
 */
export type Bank = { slug: string; name: string; color: string; ink: string };

const W = "#FFFFFF";
const K = "#111111";

export const BANKS: readonly Bank[] = [
  { slug: "nubank", name: "Nubank", color: "#820AD1", ink: W },
  { slug: "itau", name: "Itaú", color: "#FE6100", ink: W },
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
  { slug: "mercado-pago", name: "Mercado Pago", color: "#FFE600", ink: "#2D3277" },
  { slug: "picpay", name: "PicPay", color: "#11C76F", ink: W },
  { slug: "neon", name: "Neon", color: "#00E5E5", ink: K },
];

/** Só para contas antigas em dinheiro: não aparece na lista de escolha. */
export const CASH: Bank = { slug: "dinheiro", name: "Dinheiro", color: "#4B7F52", ink: W };
export const OTHER: Bank = { slug: "outro", name: "Outro banco", color: "#6B7280", ink: W };

/**
 * Slugs com arquivo em public/banks/<slug>.svg (sempre fundo transparente).
 * `tile`: "brand" = logo sobre a cor do banco; "white" = sobre branco (logo da
 * mesma cor do banco ou multicolorido, que sumiria sobre a cor).
 * `mono`: desenha o logo todo em branco (logo de uma cor só, na cor do banco).
 */
export const LOGOS: Readonly<Record<string, { tile: "brand" | "white"; mono?: boolean }>> = {
  nubank: { tile: "brand" },
  itau: { tile: "brand" },
  bradesco: { tile: "white" },
  "banco-do-brasil": { tile: "brand" },
  santander: { tile: "brand", mono: true },
  inter: { tile: "brand", mono: true },
  btg: { tile: "brand", mono: true },
  c6: { tile: "brand" },
  sicoob: { tile: "brand" },
  picpay: { tile: "brand", mono: true },
  "mercado-pago": { tile: "brand" },
  neon: { tile: "brand" },
  caixa: { tile: "white" },
  sicredi: { tile: "white" },
  xp: { tile: "white" },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: string | null | undefined): v is string => !!v && HEX.test(v);

/** Cor do texto (preto/branco) com melhor contraste sobre `hex`. */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? K : W;
}

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
export function bankOf(account: {
  bank_slug?: string | null;
  bank_color?: string | null;
  institution: string | null;
  name: string;
}): Bank {
  const bySlug = account.bank_slug === OTHER.slug ? null : bankBySlug(account.bank_slug);
  const known = bySlug ?? (account.bank_slug === OTHER.slug ? null : bankFromName(account.institution ?? account.name));
  if (known) return known;
  const name = account.institution ?? account.name;
  if (isHexColor(account.bank_color)) return { ...OTHER, name, color: account.bank_color, ink: inkFor(account.bank_color) };
  return { ...OTHER, name };
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
