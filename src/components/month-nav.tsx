import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dates";

export function MonthNav({ base, month }: { base: string; month: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href={`${base}?mes=${shiftMonth(month, -1)}`} className="rounded border border-zinc-300 px-2 py-1" aria-label="Mês anterior">
        ←
      </Link>
      <span className="min-w-36 text-center font-medium capitalize">{monthLabel(month)}</span>
      <Link href={`${base}?mes=${shiftMonth(month, 1)}`} className="rounded border border-zinc-300 px-2 py-1" aria-label="Próximo mês">
        →
      </Link>
    </div>
  );
}
