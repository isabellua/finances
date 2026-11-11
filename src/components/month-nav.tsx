import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { monthLabel, shiftMonth } from "@/lib/dates";

export function MonthNav({ base, month }: { base: string; month: string }) {
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong text-ink hover:bg-sunken";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href={`${base}?mes=${shiftMonth(month, -1)}`} className={btn} aria-label="Mês anterior">
        <CaretLeft size={18} aria-hidden />
      </Link>
      <span className="min-w-32 text-center font-medium first-letter:uppercase">{monthLabel(month)}</span>
      <Link href={`${base}?mes=${shiftMonth(month, 1)}`} className={btn} aria-label="Próximo mês">
        <CaretRight size={18} aria-hidden />
      </Link>
    </div>
  );
}
