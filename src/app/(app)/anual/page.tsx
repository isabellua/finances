import Link from "next/link";
import { str } from "@/components/flash";
import { BarGroups, Donut } from "@/components/charts";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { colorFor } from "@/lib/charts";
import { todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { Category } from "@/lib/types";

type Flow = { occurred_on: string; kind: "income" | "expense"; amount_cents: number; category_id: string | null };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function AnualPage({ searchParams }: PageProps<"/anual">) {
  const sp = await searchParams;
  const thisYear = Number(todayISO().slice(0, 4));
  const y = Number(str(sp.ano));
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear;
  const { supabase, workspace } = await requireUser();

  const [{ data: flows }, { data: cats }] = await Promise.all([
    supabase
      .from("transactions")
      .select("occurred_on,kind,amount_cents,category_id")
      .in("kind", ["income", "expense"])
      .eq("status", "paid")
      .gte("occurred_on", `${year}-01-01`)
      .lt("occurred_on", `${year + 1}-01-01`)
      .limit(10000)
      .overrideTypes<Flow[]>(),
    supabase.from("categories").select("id,name,color").overrideTypes<(Category & { color: string | null })[]>(),
  ]);

  const rows = flows ?? [];
  const perMonth = MONTHS.map((label, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    const r = rows.filter((x) => x.occurred_on.startsWith(m));
    const income = r.filter((x) => x.kind === "income").reduce((s, x) => s + x.amount_cents, 0);
    const expense = r.filter((x) => x.kind === "expense").reduce((s, x) => s + x.amount_cents, 0);
    return { label, month: m, income, expense };
  });
  const totalIncome = perMonth.reduce((s, m) => s + m.income, 0);
  const totalExpense = perMonth.reduce((s, m) => s + m.expense, 0);
  const activeMonths = perMonth.filter((m) => m.income > 0 || m.expense > 0).length;

  const byCat = new Map<string | null, number>();
  for (const r of rows) if (r.kind === "expense") byCat.set(r.category_id, (byCat.get(r.category_id) ?? 0) + r.amount_cents);
  const catInfo = new Map((cats ?? []).map((c) => [c.id, c]));
  const slices = [...byCat.entries()]
    .map(([id, value]) => ({ label: id ? (catInfo.get(id)?.name ?? "?") : "Sem categoria", value, color: id ? catInfo.get(id)?.color : null }))
    .sort((a, b) => b.value - a.value);

  const goal = workspace?.monthlyIncomeGoalCents ?? null;
  const cap = workspace?.monthlyCapCents ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Visão de ${year}`}
        action={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/anual?ano=${year - 1}`} className="rounded-lg border border-line-strong px-3 py-2" aria-label="Ano anterior">‹</Link>
            <Link href={`/anual?ano=${year + 1}`} className="rounded-lg border border-line-strong px-3 py-2" aria-label="Próximo ano">›</Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <Empty>Sem lançamentos pagos em {year}.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="!p-3"><p className="text-xs text-ink-subtle">Receitas</p><p className="font-semibold text-pos tabular-nums">{formatBRL(totalIncome)}</p></Card>
            <Card className="!p-3"><p className="text-xs text-ink-subtle">Despesas</p><p className="font-semibold tabular-nums">{formatBRL(totalExpense)}</p></Card>
            <Card className="!p-3"><p className="text-xs text-ink-subtle">Resultado</p><p className={`font-semibold tabular-nums ${totalIncome - totalExpense < 0 ? "text-neg" : ""}`}>{formatBRL(totalIncome - totalExpense)}</p></Card>
          </div>

          {activeMonths > 0 && (
            <p className="text-sm text-ink-muted">
              Média dos {activeMonths} mês(es) com lançamentos: receita {formatBRL(Math.round(totalIncome / activeMonths))}, despesa {formatBRL(Math.round(totalExpense / activeMonths))}
              {goal ? ` · meta de receita ${formatBRL(goal)}/mês (${Math.round((totalIncome / activeMonths / goal) * 100)}%)` : ""}
              {cap ? ` · teto ${formatBRL(cap)}/mês (${Math.round((totalExpense / activeMonths / cap) * 100)}% usado)` : ""}.
            </p>
          )}

          <Card>
            <h2 className="mb-2 font-semibold">Receitas × despesas</h2>
            <BarGroups
              caption={`Receitas e despesas por mês em ${year}`}
              aLabel="Receitas"
              bLabel="Despesas"
              groups={perMonth.map((m) => ({ label: m.label, a: m.income, b: m.expense }))}
            />
          </Card>

          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="mx-auto shrink-0 text-ink">
              <Donut caption={`Despesas por categoria em ${year}`} items={slices} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="mb-2 font-semibold">Despesas por categoria</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {slices.slice(0, 10).map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: colorFor(i, s.color) }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="tabular-nums">{formatBRL(s.value)}</span>
                    <span className="w-10 text-right text-xs text-ink-muted">{Math.round((s.value / totalExpense) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="!p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">Resumo mensal de {year}</caption>
              <thead className="text-left text-xs text-ink-subtle">
                <tr><th className="p-3 font-medium">Mês</th><th className="p-3 text-right font-medium">Receita</th><th className="p-3 text-right font-medium">Despesa</th><th className="p-3 text-right font-medium">Resultado</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {perMonth.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="p-3 text-left font-normal capitalize">{m.label}</th>
                    <td className="p-3 text-right tabular-nums">{formatBRL(m.income)}</td>
                    <td className="p-3 text-right tabular-nums">{formatBRL(m.expense)}</td>
                    <td className={`p-3 text-right tabular-nums ${m.income - m.expense < 0 ? "text-neg" : ""}`}>{formatBRL(m.income - m.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
