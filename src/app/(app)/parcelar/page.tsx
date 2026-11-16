import Link from "next/link";
import { str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { bankOf } from "@/lib/banks";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { annualFromMonthlyPpm, formatPpmPercent, resolveSplit, splitPlan } from "@/lib/split";
import type { Account, CreditCard } from "@/lib/types";

export default async function ParcelarPage({ searchParams }: PageProps<"/parcelar">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: cards }, { data: accounts }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id,account_id,name,nickname,brand,split_rate_ppm,split_upfront_ppm,split_min_cents,split_max_parts")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase
      .from("accounts")
      .select("id,name,institution,bank_slug")
      .overrideTypes<Pick<Account, "id" | "name" | "institution" | "bank_slug">[]>(),
  ]);

  const options = (cards ?? [])
    .map((c) => {
      const acc = (accounts ?? []).find((a) => a.id === c.account_id);
      const slug = acc ? bankOf({ ...acc, bank_slug: acc.bank_slug }).slug : null;
      return { card: c, params: resolveSplit(c, slug) };
    })
    .filter((o) => o.params);

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Parcelar compra à vista" />
        <Empty>
          Nenhum cartão com parcelamento de compra à vista. O Banco do Brasil já vem configurado; para outro cartão,
          preencha “Parcelar compra à vista” em <Link className="underline" href="/contas">Contas</Link>.
        </Empty>
      </div>
    );
  }

  const selected = options.find((o) => o.card.id === str(sp.cartao)) ?? options[0];
  const p = selected.params!;
  const rawValor = str(sp.valor)?.trim() ?? "";
  const cents = rawValor === "" ? null : parseBRLToCents(rawValor);
  const rows = cents ? splitPlan(cents, p) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parcelar compra à vista"
        subtitle="Quanto custa transformar uma compra à vista do cartão em parcelas."
      />

      <Card>
        <form className="grid gap-3 sm:grid-cols-3" method="get">
          <Field label="Cartão">
            <select name="cartao" defaultValue={selected.card.id} className={inputCls}>
              {options.map((o) => (
                <option key={o.card.id} value={o.card.id}>{o.card.nickname ?? o.card.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Valor da compra (R$)">
            <input name="valor" inputMode="decimal" defaultValue={rawValor} placeholder="194,90" required className={inputCls} />
          </Field>
          <div className="flex items-end">
            <button className={btnPrimary}>Simular</button>
          </div>
        </form>
      </Card>

      {rawValor !== "" && cents === null && <p className="text-sm text-neg">Valor inválido.</p>}
      {cents !== null && rows.length === 0 && (
        <p className="text-sm text-warn">
          Compras abaixo de {formatBRL(p.minCents)} não podem ser parceladas neste cartão.
        </p>
      )}

      {rows.length > 0 && cents !== null && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Compra à vista de <span className="tabular-nums font-medium text-ink">{formatBRL(cents)}</span>. Total
            parcelado = parcela × nº de parcelas.
          </p>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.parts} className="flex items-center justify-between gap-3 py-2.5">
                <span className="tabular-nums">
                  {r.parts} × {formatBRL(r.installmentCents)}
                </span>
                <span className="text-right">
                  <span className="block font-medium tabular-nums">{formatBRL(r.totalCents)}</span>
                  <span className="block text-xs text-neg tabular-nums">+ {formatBRL(r.extraCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-ink-subtle">
        Estimativa: {formatPpmPercent(p.ratePpm)}% ao mês (≈ {annualFromMonthlyPpm(p.ratePpm).toFixed(0)}% ao ano) mais{" "}
        {formatPpmPercent(p.upfrontPpm)}% de custo inicial, financiados juntos, primeira parcela em 1 mês. No Banco do
        Brasil esses números foram ajustados a um único print do app (compra de R$ 194,90, de 2 a 12 parcelas); o banco
        pode mudar taxa por data ou perfil. Confira no app antes de contratar.
      </p>
    </div>
  );
}
