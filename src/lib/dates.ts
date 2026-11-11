const TZ = "America/Sao_Paulo";

/** Data de hoje no fuso de Brasília, formato YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Mês corrente no formato YYYY-MM. */
export function currentMonth(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}

export function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Primeiro dia do mês e primeiro dia do mês seguinte (intervalo [start, end)). */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${y}-${pad(m)}-01`, end: `${next.y}-${pad(next.m)}-01` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Soma meses mantendo o dia âncora, limitado ao último dia do mês:
 * 31/01 + 1 mês = 28/02 (ou 29), e 31/01 + 2 meses = 31/03 (a âncora não "desliza").
 */
export function addMonthsClamped(iso: string, months: number): string {
  const { y, m, d } = parseISO(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toISO(ny, nm, Math.min(d, dim));
}

/** Dias de `a` até `b` (b - a), em datas ISO. Negativo se b é anterior. */
export function daysBetween(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
