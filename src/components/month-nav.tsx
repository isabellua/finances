import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dates";

export function MonthNav({ base, month }: { base: string; month: string }) {
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href={`${base}?mes=${shiftMonth(month, -1)}`} className={btn} aria-label="Mês anterior">
        ‹
      </Link>
      <span className="min-w-36 text-center font-medium capitalize">{monthLabel(month)}</span>
      <Link href={`${base}?mes=${shiftMonth(month, 1)}`} className={btn} aria-label="Próximo mês">
        ›
      </Link>
    </div>
  );
}
