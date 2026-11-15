import Link from "next/link";
import { MonthNav } from "@/components/month-nav";
import { str } from "@/components/flash";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { monthGrid } from "@/lib/calendar";
import { occurrencesBetween } from "@/lib/commitments";
import { addDays, currentMonth, formatDateBR, isValidMonth, todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { loadPayables } from "@/lib/payables";
import { KIND_LABEL } from "@/lib/types";

type Tx = {
  id: string;
  kind: "income" | "expense" | "transfer" | "invoice_payment";
  amount_cents: number;
  occurred_on: string;
  description: string;
  status: "paid" | "pending";
};

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function CalendarioPage({ searchParams }: PageProps<"/previsao/calendario">) {
  const sp = await searchParams;
  const mesParam = str(sp.mes);
  const month = isValidMonth(mesParam) ? mesParam : currentMonth();
  const today = todayISO();
  const grid = monthGrid(month);
  const first = grid[0][0].date;
  const last = grid[grid.length - 1][6].date;
  const { supabase } = await requireUser();

  const [{ data: txs }, payables] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,status")
      .gte("occurred_on", first)
      .lte("occurred_on", last)
      .order("created_at")
      .overrideTypes<Tx[]>(),
    loadPayables(supabase, today, 1),
  ]);

  const settled = new Set(payables.settlements.map((s) => `${s.commitment_id}|${s.seq}`));
  const planned = payables.commitments
    .flatMap((c) => occurrencesBetween(c, first, addDays(last, 1)))
    .filter((o) => !settled.has(`${o.commitment.id}|${o.seq}`));

  const dayParam = str(sp.dia);
  const selected =
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam >= first && dayParam <= last
      ? dayParam
      : today.startsWith(month)
        ? today
        : `${month}-01`;

  const byDay = (d: string) => ({
    done: (txs ?? []).filter((t) => t.occurred_on === d && t.status === "paid"),
    pendingTx: (txs ?? []).filter((t) => t.occurred_on === d && t.status === "pending"),
    plan: planned.filter((o) => o.date === d),
  });

  const sel = byDay(selected);
  const sign = (t: Tx) => (t.kind === "income" ? 1 : t.kind === "expense" ? -1 : 0);
  const realized = sel.done.reduce((s, t) => s + sign(t) * t.amount_cents, 0);
  const incomeDay = sel.done.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount_cents, 0);
  const expenseDay = sel.done.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount_cents, 0);
  const plannedOut =
    sel.plan.reduce((s, o) => s + o.commitment.amount_cents, 0) +
    sel.pendingTx.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount_cents, 0);
  const plannedIn = sel.pendingTx.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendário" action={<MonthNav base="/previsao/calendario" month={month} />} />

      <Card className="!p-2">
        <div role="grid" aria-label="Calendário do mês" className="grid grid-cols-7 gap-1 text-center text-sm">
          {WEEK.map((w) => (
            <div key={w} role="columnheader" className="py-1 text-xs text-ink-subtle uppercase">{w}</div>
          ))}
          {grid.flat().map((d) => {
            const x = byDay(d.date);
            const hasDone = x.done.length > 0;
            const hasPlan = x.plan.length + x.pendingTx.length > 0;
            const isSel = d.date === selected;
            return (
              <Link
                key={d.date}
                role="gridcell"
                href={`/previsao/calendario?mes=${month}&dia=${d.date}`}
                aria-label={`${formatDateBR(d.date)}${hasDone ? ", com lançamentos" : ""}${hasPlan ? ", com previstos" : ""}`}
                aria-current={d.date === today ? "date" : undefined}
                aria-selected={isSel}
                className={`flex min-h-12 flex-col items-center gap-0.5 rounded-lg py-1 ${d.inMonth ? "" : "opacity-40"} ${isSel ? "bg-accent-tint text-accent-text" : "hover:bg-sunken"} ${d.date === today ? "font-semibold" : ""}`}
              >
                <span>{Number(d.date.slice(8, 10))}</span>
                <span className="flex h-2 gap-0.5" aria-hidden>
                  {hasDone && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  {hasPlan && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="px-2 pt-2 text-xs text-ink-subtle">
          <span aria-hidden className="text-accent">●</span> lançamentos pagos · <span aria-hidden className="text-warn">●</span> previstos e vencimentos
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{formatDateBR(selected)}</h2>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <Card className="!p-3"><p className="text-xs text-ink-subtle">Entrada</p><p className="font-semibold text-pos tabular-nums">{formatBRL(incomeDay)}</p></Card>
          <Card className="!p-3"><p className="text-xs text-ink-subtle">Saída</p><p className="font-semibold tabular-nums">{formatBRL(expenseDay)}</p></Card>
          <Card className="!p-3"><p className="text-xs text-ink-subtle">Resultado</p><p className={`font-semibold tabular-nums ${realized < 0 ? "text-neg" : ""}`}>{formatBRL(realized)}</p></Card>
        </div>
        {(plannedOut > 0 || plannedIn > 0) && (
          <p className="text-sm text-ink-muted">
            Previsto neste dia: {plannedIn > 0 ? `+${formatBRL(plannedIn)} a receber` : ""}{plannedIn > 0 && plannedOut > 0 ? " · " : ""}{plannedOut > 0 ? `${formatBRL(plannedOut)} a pagar` : ""}
          </p>
        )}

        {sel.done.length + sel.pendingTx.length + sel.plan.length === 0 ? (
          <Empty>Nada neste dia.</Empty>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {sel.done.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0 flex-1 truncate">{t.description || KIND_LABEL[t.kind]}</span>
                  <span className={`font-medium tabular-nums ${t.kind === "income" ? "text-pos" : ""}`}>{t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{formatBRL(t.amount_cents)}</span>
                </li>
              ))}
              {sel.pendingTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-ink-muted">
                  <span className="min-w-0 flex-1 truncate">{t.description || KIND_LABEL[t.kind]} <em className="text-xs">previsto</em></span>
                  <span className="tabular-nums">{formatBRL(t.amount_cents)}</span>
                </li>
              ))}
              {sel.plan.map((o) => (
                <li key={`${o.commitment.id}|${o.seq}`} className="flex items-center justify-between gap-3 p-3 text-ink-muted">
                  <span className="min-w-0 flex-1 truncate">
                    {o.commitment.description}
                    {o.commitment.total_occurrences && o.commitment.total_occurrences > 1 ? ` (${o.seq}/${o.commitment.total_occurrences})` : ""}{" "}
                    <em className="text-xs">vence</em>
                  </span>
                  <span className="tabular-nums">{formatBRL(o.commitment.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-xs text-ink-subtle"><Link className="underline" href="/previsao/pagar">Registrar pagamentos em A pagar</Link></p>
      </section>
    </div>
  );
}
