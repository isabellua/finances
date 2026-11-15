import { addDays } from "./dates";

export type GridDay = { date: string; inMonth: boolean };

/** Semanas do mês (domingo a sábado), incluindo os dias vizinhos para fechar as linhas. */
export function monthGrid(month: string): GridDay[][] {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const weekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = domingo
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((weekday + dim) / 7) * 7;

  const days: GridDay[] = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(first, i - weekday);
    days.push({ date, inMonth: date.startsWith(month) });
  }
  const weeks: GridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
