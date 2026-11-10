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
