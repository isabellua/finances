import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { projectMonths } from "@/lib/commitments";
import { currentMonth, formatDateBR, monthLabel, monthRange, shiftMonth, todayISO } from "@/lib/dates";
import { buildForecast, upcomingRelief, variableEstimate } from "@/lib/forecast";
import { formatBRL } from "@/lib/money";
import { loadPayables } from "@/lib/payables";

type Row = { occurred_on: string; amount_cents: number };

export default async function FuturoPage() {
  const { supabase, workspace } = await requireUser();
  const today = todayISO();
  const month = currentMonth();
  const past = shiftMonth(month, -3);
  const cap = workspace?.monthlyCapCents ?? null;

  const [payables, { data: pastRows }, { data: nowRows }] = await Promise.all([
    loadPayables(supabase, today, 200),
    supabase
      .from("transactions")
      .select("occurred_on,amount_cents")
      .eq("kind", "expense")
      .eq("status", "paid")
      .gte("occurred_on", `${past}-01`)
      .lt("occurred_on", `${month}-01`)
      .overrideTypes<Row[]>(),
    supabase
      .from("transactions")
      .select("occurred_on,amount_cents")
      .eq("kind", "expense")
      .eq("status", "paid")
      .gte("occurred_on", `${month}-01`)
      .lt("occurred_on", monthRange(month).end)
      .overrideTypes<Row[]>(),
  ]);

  const { commitments, settlements, rows } = payables;
  const settled = new Set(settlements.map((s) => `${s.commitment_id}|${s.seq}`));
  for (const r of rows) if (r.status === "matched") settled.add(`${r.commitment.id}|${r.seq}`);

  const pastMonths = [0, 1, 2].map((i) => shiftMonth(past, i));
  const pastExpenses = pastMonths.map((m) =>
    (pastRows ?? []).filter((r) => r.occurred_on.startsWith(m)).reduce((s, r) => s + r.amount_cents, 0),
  );
  const pastCommitted = projectMonths(commitments, () => false, past, 3).map((m) => m.totalCents);
  const hasHistory = pastExpenses.some((v) => v > 0);
  const variable = variableEstimate(pastExpenses, pastCommitted);

  const remaining = projectMonths(commitments, (id, seq) => settled.has(`${id}|${seq}`), month, 6);
  const fullNow = projectMonths(commitments, () => false, month, 1)[0].totalCents;
  const realizedNow = (nowRows ?? []).reduce((s, r) => s + r.amount_cents, 0);

  const forecast = buildForecast(
    remaining.map((m, i) => ({ month: m.month, totalCents: i === 0 ? fullNow : m.totalCents })),
    variable,
    cap,
  ).map((f, i) => {
    if (i !== 0) return f;
    // Mês atual: o maior entre "o que já gastei + o que falta do comprometido" e "um mês típico".
    const projected = Math.max(realizedNow + remaining[0].totalCents, f.committedCents + variable);
    return { ...f, projectedCents: projected, marginCents: cap === null ? null : cap - projected };
  });

  const relief = upcomingRelief(commitments, today, 4);
  const scaleMax = Math.max(1, cap ?? 0, ...forecast.map((f) => f.projectedCents));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Próximos meses" subtitle="Quanto já está comprometido e quanto sobra do teto." />

      {cap === null && (
        <Card className="text-sm">
          Defina um <strong>teto de gastos mensal</strong> em <Link className="underline" href="/configuracoes">Espaços</Link> para ver quanto do teto já está comprometido e a margem de cada mês.
        </Card>
      )}

      {forecast.every((f) => f.committedCents === 0) && !hasHistory ? (
        <Empty>
          Cadastre assinaturas, contas fixas e parcelas em <Link className="underline" href="/previsao/pagar">A pagar</Link> e lance gastos por alguns meses para ver a previsão.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {forecast.map((f, i) => (
            <Card key={f.month} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium capitalize">{monthLabel(f.month)}{i === 0 ? " (atual)" : ""}</p>
                <p className="text-sm tabular-nums">
                  projetado <strong>{formatBRL(f.projectedCents)}</strong>
                  {f.capCents !== null && f.committedPct !== null && (
                    <span className="ml-2 text-ink-muted">· {f.committedPct}% do teto comprometido</span>
                  )}
                </p>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded bg-sunken" role="img"
                aria-label={`Comprometido ${formatBRL(f.committedCents)}, variável estimado ${formatBRL(f.variableCents)}`}>
                <div className="bg-accent" style={{ width: `${(f.committedCents / scaleMax) * 100}%` }} />
                <div className="bg-warn opacity-60" style={{ width: `${(f.variableCents / scaleMax) * 100}%` }} />
              </div>
              <p className="flex flex-wrap gap-x-4 text-xs text-ink-muted">
                <span><span aria-hidden className="text-accent">■</span> comprometido {formatBRL(f.committedCents)}</span>
                <span><span aria-hidden className="text-warn">■</span> variável estimado {formatBRL(f.variableCents)}</span>
                {f.marginCents !== null && (
                  <span className={f.marginCents < 0 ? "font-medium text-neg" : ""}>
                    {f.marginCents >= 0 ? `sobra ${formatBRL(f.marginCents)}` : `passa do teto em ${formatBRL(-f.marginCents)}`}
                  </span>
                )}
              </p>
            </Card>
          ))}
        </ul>
      )}

      {relief.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Próximos alívios</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {relief.map((r) => (
                <li key={`${r.description}${r.lastDate}`} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-xs text-ink-muted">
                      última parcela ({r.totalOccurrences}/{r.totalOccurrences}) em {formatDateBR(r.lastDate)}; alivia a partir de <span className="capitalize">{monthLabel(r.freesFromMonth)}</span>
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBRL(r.amountCents)}/mês</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Card className="text-xs text-ink-muted">
        <p className="font-medium text-ink">Como estimamos</p>
        <p>
          <strong>Comprometido</strong> = assinaturas, contas fixas e parcelas cadastradas que ainda não foram pagas.{" "}
          <strong>Variável</strong> = média dos gastos pagos dos últimos 3 meses fechados menos a média do comprometido nesses meses (estimativa: não separa com precisão o que foi fixo do que foi variável).
          No mês atual, o projetado é o maior entre “o que já gastei + o que falta do comprometido” e “um mês típico”.
        </p>
      </Card>
    </div>
  );
}
