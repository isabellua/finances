import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  KIND_LABELS,
  projectMonths,
  remainingOccurrences,
  type Commitment,
} from "@/lib/commitments";
import { addDays, currentMonth, formatDateBR, monthLabel, todayISO } from "@/lib/dates";
import { centsToInput, formatBRL } from "@/lib/money";
import { loadPayables, type PayableRow } from "@/lib/payables";
import type { Account, Category, CreditCard } from "@/lib/types";
import { createCommitment, deleteCommitment, settleOccurrence, undoSettlement, updateCommitment } from "./actions";
import { CommitmentForm } from "./commitment-form";

function badge(r: PayableRow, isCard: boolean): { text: string; cls: string } {
  const n = Math.abs(r.daysUntil);
  const plural = n === 1 ? "dia" : "dias";
  switch (r.status) {
    case "overdue":
      return {
        text: isCard ? `Cobrança não vista há ${n} ${plural}` : `Atrasada há ${n} ${plural}`,
        cls: "bg-neg-tint text-neg",
      };
    case "due_soon":
      return {
        text: r.daysUntil === 0 ? (isCard ? "Cobra hoje" : "Vence hoje") : `${isCard ? "Cobra" : "Vence"} em ${n} ${plural}`,
        cls: "bg-warn-tint text-warn",
      };
    case "matched":
      return { text: "Parece já pago (extrato)", cls: "bg-pos-tint text-pos" };
    default:
      return { text: `Em ${n} dias`, cls: "bg-sunken text-ink-muted" };
  }
}

export default async function PagarPage({ searchParams }: PageProps<"/pagar">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const today = todayISO();

  const [payables, { data: accounts }, { data: cards }, { data: cats }] = await Promise.all([
    loadPayables(supabase, today, 90),
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
  ]);

  const { commitments, settlements, rows } = payables;
  const activeAccounts = (accounts ?? []).filter((a) => !a.archived);
  const activeCards = (cards ?? []).filter((c) => !c.archived);
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const cardLabel = (c: CreditCard) => (c.last4 ? `${c.name} •••• ${c.last4}` : c.name);
  const cardName = new Map((cards ?? []).map((c) => [c.id, cardLabel(c)]));
  const catList = (cats ?? []).map((c) => ({ id: c.id, label: c.name }));

  const payLabel = (c: Commitment) =>
    c.card_id ? `Cartão ${cardName.get(c.card_id) ?? "?"}` : (accountName.get(c.account_id ?? "") ?? "?");

  const pending = rows
    .filter((r) => ["overdue", "due_soon", "upcoming", "matched"].includes(r.status))
    .filter((r) => r.status === "overdue" || r.date <= addDays(today, 30))
    .sort((a, b) => a.date.localeCompare(b.date));
  const overdue = pending.filter((r) => r.status === "overdue");
  const upcoming = pending.filter((r) => r.status !== "overdue");

  const settledKeys = new Set(settlements.map((s) => `${s.commitment_id}|${s.seq}`));
  for (const r of rows) if (r.status === "matched") settledKeys.add(`${r.commitment.id}|${r.seq}`);
  const projection = projectMonths(commitments, (id, seq) => settledKeys.has(`${id}|${seq}`), currentMonth(), 6);

  const byId = new Map(commitments.map((c) => [c.id, c]));
  const recent = [...settlements].sort((a, b) => b.settled_on.localeCompare(a.settled_on)).slice(0, 8);

  const noPayment = activeAccounts.length === 0;

  function Occurrence({ r }: { r: PayableRow }) {
    const c = r.commitment;
    const isCard = c.card_id !== null;
    const b = badge(r, isCard);
    const part = c.total_occurrences && c.total_occurrences > 1 ? ` · parcela ${r.seq}/${c.total_occurrences}` : "";
    return (
      <li className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs text-ink-subtle">{formatDateBR(r.date).slice(0, 5)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{c.description}</p>
            <p className="truncate text-xs text-ink-subtle">
              {KIND_LABELS[c.kind]}{part} · {payLabel(c)}
            </p>
          </div>
          <span className="font-medium tabular-nums">{formatBRL(c.amount_cents)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-[3.75rem]">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.text}</span>
          <details className="flex-1">
            <summary className="w-fit cursor-pointer list-none text-xs font-medium text-accent-text underline">
              {r.status === "matched" ? "Confirmar" : isCard ? "Registrar cobrança" : "Registrar pagamento"}
            </summary>
            <form action={settleOccurrence} className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="commitment_id" value={c.id} />
              <input type="hidden" name="seq" value={r.seq} />
              <Field label="Valor pago (R$)" hint="Mude se veio diferente do previsto">
                <input name="amount" inputMode="decimal" defaultValue={centsToInput(c.amount_cents)} className={inputCls} />
              </Field>
              <Field label="Data do pagamento">
                <input name="date" type="date" required defaultValue={r.status === "overdue" ? today : r.date <= today ? r.date : today} className={inputCls} />
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button name="mode" value="create" className={btnPrimary}>Criar lançamento</button>
                <button name="mode" value="mark" className={btnGhost}>Já está no extrato</button>
                <button name="mode" value="skip" className={btnGhost}>Pular</button>
              </div>
              <p className="text-xs text-ink-subtle sm:col-span-2">
                “Criar lançamento” registra a saída. Use “Já está no extrato” se você já importou ou lançou esse pagamento. “Pular” tira da lista sem lançar.
              </p>
            </form>
          </details>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas a pagar"
        subtitle="Assinaturas, contas fixas, parcelas e vencimentos."
        action={
          <a href="/pagar/calendario.ics" className={btnGhost} download>
            Baixar para o calendário (.ics)
          </a>
        }
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {overdue.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-neg">Atrasadas ({overdue.length})</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-line">
              {overdue.map((r) => <Occurrence key={`${r.commitment.id}|${r.seq}`} r={r} />)}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Próximos 30 dias</h2>
        {upcoming.length === 0 ? (
          <Empty>Nada vencendo nos próximos 30 dias.</Empty>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-line">
              {upcoming.map((r) => <Occurrence key={`${r.commitment.id}|${r.seq}`} r={r} />)}
            </ul>
          </Card>
        )}
      </section>

      <details open={commitments.length === 0} className="group">
        <summary className={`${btnPrimary} w-fit cursor-pointer list-none`}>+ Cadastrar</summary>
        <Card className="mt-3">
          {noPayment ? (
            <p className="text-sm">
              Cadastre uma conta em <a className="underline" href="/contas">Contas</a> antes.
            </p>
          ) : (
            <CommitmentForm
              action={createCommitment}
              accounts={activeAccounts.map((a) => ({ id: a.id, label: a.name }))}
              cards={activeCards.map((c) => ({ id: c.id, label: cardLabel(c) }))}
              categories={catList}
              today={today}
            />
          )}
        </Card>
      </details>

      {commitments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Cadastrados</h2>
          <ul className="flex flex-col gap-3">
            {commitments.map((c) => {
              const settledSeqs = new Set(settlements.filter((s) => s.commitment_id === c.id).map((s) => s.seq));
              const remaining = remainingOccurrences(c, settledSeqs);
              const next = rows.find(
                (r) => r.commitment.id === c.id && ["overdue", "due_soon", "upcoming", "matched"].includes(r.status),
              );
              return (
                <Card key={c.id} className={`flex flex-col gap-3 ${c.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {c.description}
                        {!c.active && <span className="ml-2 text-xs font-normal text-ink-subtle">(pausado)</span>}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {KIND_LABELS[c.kind]}
                        {c.kind === "subscription" ? (c.frequency === "yearly" ? " · anual" : " · mensal") : ""}
                        {c.kind === "installment" ? ` · ${c.total_occurrences}× · faltam ${remaining}` : ""}
                        {" · "}
                        {payLabel(c)}
                        {next ? ` · próxima ${formatDateBR(next.date)}` : c.active ? " · sem próximas" : ""}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">{formatBRL(c.amount_cents)}</p>
                  </div>

                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-medium text-accent-text underline">
                      Editar
                    </summary>
                    <form action={updateCommitment} className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={c.id} />
                      <Field label="Descrição" className="sm:col-span-2">
                        <input name="description" defaultValue={c.description} required maxLength={120} className={inputCls} />
                      </Field>
                      <Field label="Valor (R$)">
                        <input name="amount" defaultValue={centsToInput(c.amount_cents)} inputMode="decimal" required className={inputCls} />
                      </Field>
                      <Field label="Paga com">
                        <select name="payment" defaultValue={c.card_id ? `c:${c.card_id}` : `a:${c.account_id}`} className={inputCls}>
                          <optgroup label="Contas">
                            {(accounts ?? []).filter((a) => !a.archived || a.id === c.account_id).map((a) => (
                              <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Cartões de crédito">
                            {(cards ?? []).filter((k) => !k.archived || k.id === c.card_id).map((k) => (
                              <option key={k.id} value={`c:${k.id}`}>{cardLabel(k)}</option>
                            ))}
                          </optgroup>
                        </select>
                      </Field>
                      <Field label="Categoria">
                        <select name="category_id" defaultValue={c.category_id ?? ""} className={inputCls}>
                          <option value="">Sem categoria</option>
                          {catList.map((k) => (
                            <option key={k.id} value={k.id}>{k.label}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <input type="checkbox" name="active" defaultChecked={c.active} />
                        Ativo (desmarque para pausar)
                      </label>
                      <p className="text-xs text-ink-subtle sm:col-span-2">
                        Datas, tipo e número de parcelas não mudam aqui. Para isso, exclua e cadastre de novo.
                      </p>
                      <button className={`${btnPrimary} sm:col-span-2`}>Salvar alterações</button>
                    </form>
                  </details>

                  <form action={deleteCommitment} className="text-right">
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={`Excluir “${c.description}”? Os lançamentos que ele já gerou continuam existindo.`}
                      className="text-xs text-ink-subtle underline"
                    >
                      Excluir
                    </ConfirmButton>
                  </form>
                </Card>
              );
            })}
          </ul>
        </section>
      )}

      {commitments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Quanto falta pagar nos próximos meses</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {projection.map((m) => (
                <li key={m.month} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium capitalize">{monthLabel(m.month)}</p>
                    <p className="text-xs text-ink-subtle">
                      {[
                        m.byKind.subscription > 0 ? `assinaturas ${formatBRL(m.byKind.subscription)}` : null,
                        m.byKind.fixed_bill > 0 ? `contas fixas ${formatBRL(m.byKind.fixed_bill)}` : null,
                        m.byKind.installment > 0 ? `parcelas ${formatBRL(m.byKind.installment)}` : null,
                        m.byKind.one_off > 0 ? `avulsas ${formatBRL(m.byKind.one_off)}` : null,
                      ].filter(Boolean).join(" · ") || "nada previsto"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBRL(m.totalCents)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-xs text-ink-subtle">
            Só compromissos cadastrados, o que ainda não foi pago. Não inclui gastos variáveis (mercado, lazer…); a previsão completa vem depois.
          </p>
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Registrados recentemente</h2>
          <Card className="!p-0">
            <ul className="divide-y divide-line text-sm">
              {recent.map((s) => {
                const c = byId.get(s.commitment_id);
                if (!c) return null;
                return (
                  <li key={`${s.commitment_id}|${s.seq}`} className="flex items-center gap-3 p-3">
                    <span className="w-12 shrink-0 text-xs text-ink-subtle">{formatDateBR(s.settled_on).slice(0, 5)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {c.description}
                        {c.total_occurrences && c.total_occurrences > 1 ? ` · ${s.seq}/${c.total_occurrences}` : ""}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {s.status === "skipped" ? "Pulado" : s.transaction_id ? "Pago, lançamento criado" : "Marcado como pago"}
                      </p>
                    </div>
                    <form action={undoSettlement}>
                      <input type="hidden" name="commitment_id" value={s.commitment_id} />
                      <input type="hidden" name="seq" value={s.seq} />
                      <ConfirmButton
                        message={s.transaction_id ? "Desfazer? O lançamento criado por esse pagamento também será removido." : "Desfazer este registro?"}
                        className="text-xs text-ink-subtle underline"
                      >
                        Desfazer
                      </ConfirmButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
