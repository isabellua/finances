import Link from "next/link";
import { str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatDateBR, todayISO } from "@/lib/dates";
import { bankOf } from "@/lib/banks";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import {
  annualFromMonthlyPpm,
  formatPpmPercent,
  impliedRatePpm,
  parsePercentToPpm,
  resolveSplit,
  splitPlan,
} from "@/lib/split";
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
  const base = selected.params!;
  const rawValor = str(sp.valor)?.trim() ?? "";
  const cents = rawValor === "" ? null : parseBRLToCents(rawValor);

  // Primeira parcela (data) -> dias a partir de hoje; padrão 30.
  // Os dias contam da data do PARCELAMENTO (não da compra): padrão hoje.
  const rawHoje = str(sp.hoje)?.trim() ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(rawHoje) ? rawHoje : todayISO();
  const rawPrimeira = str(sp.primeira)?.trim() ?? "";
  const days = /^\d{4}-\d{2}-\d{2}$/.test(rawPrimeira) ? daysBetween(today, rawPrimeira) : 30;
  const daysOk = days >= 1 && days <= 120 ? days : 30;

  // Calibração: o app do banco mostrou N parcelas de R$ X -> descobre a taxa mensal.
  const rawParts = str(sp.n)?.trim() ?? "";
  const rawParcela = str(sp.parcela)?.trim() ?? "";
  const calibParts = rawParts === "" ? null : Number(rawParts);
  const calibCents = rawParcela === "" ? null : parseBRLToCents(rawParcela);
  const implied =
    cents && calibParts && Number.isInteger(calibParts) && calibCents
      ? impliedRatePpm(cents, calibParts, calibCents, base.upfrontPpm, daysOk)
      : null;
  const calibTried = rawParts !== "" || rawParcela !== "";

  // Juros usados: o informado, senão o calibrado, senão o do cartão.
  const rawJuros = str(sp.juros)?.trim() ?? "";
  const jurosPpm = rawJuros === "" ? null : parsePercentToPpm(rawJuros);
  const p = { ...base, ratePpm: jurosPpm ?? implied ?? base.ratePpm };
  const rows = cents ? splitPlan(cents, p, daysOk) : [];

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
          <Field label="Juros ao mês (%)" hint={`Opcional. Padrão: ${formatPpmPercent(base.ratePpm)}`}>
            <input name="juros" inputMode="decimal" defaultValue={rawJuros} placeholder="3,94" className={inputCls} />
          </Field>
          <Field label="Data do parcelamento" hint="Opcional. Padrão: hoje (não é a data da compra)">
            <input name="hoje" type="date" defaultValue={rawHoje} className={inputCls} />
          </Field>
          <Field label="Data da 1ª parcela" hint="Opcional. Padrão: 30 dias depois">
            <input name="primeira" type="date" defaultValue={rawPrimeira} className={inputCls} />
          </Field>
          <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:col-span-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Calibrar com o app do banco (opcional)</legend>
            <Field label="Nº de parcelas mostrado">
              <input name="n" type="number" min={2} max={48} defaultValue={rawParts} className={inputCls} />
            </Field>
            <Field label="Valor da parcela mostrado (R$)">
              <input name="parcela" inputMode="decimal" defaultValue={rawParcela} className={inputCls} />
            </Field>
          </fieldset>
          <div className="sm:col-span-3">
            <button className={btnPrimary}>Simular</button>
          </div>
        </form>
      </Card>

      {rawValor !== "" && cents === null && <p className="text-sm text-neg">Valor inválido.</p>}
      {rawJuros !== "" && jurosPpm === null && <p className="text-sm text-neg">Juros inválidos (0 a 30%).</p>}
      {calibTried && implied === null && (
        <p className="text-sm text-warn">
          Não deu para calibrar: informe o valor da compra, o nº de parcelas e o valor da parcela, e confira os números.
        </p>
      )}
      {implied !== null && jurosPpm === null && (
        <p className="text-sm text-ink-muted">
          Pelo que o app mostrou, os juros equivalem a <strong>{formatPpmPercent(implied)}% ao mês</strong> (≈{" "}
          {annualFromMonthlyPpm(implied).toFixed(0)}% ao ano), já com {formatPpmPercent(base.upfrontPpm)}% de IOF
          e 1ª parcela em {daysOk} dias. A tabela abaixo usa essa taxa.
        </p>
      )}
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
        {formatPpmPercent(p.upfrontPpm)}% de IOF (0,38% fixo + diário), financiados juntos; 1ª parcela em {daysOk} dias
        {rawPrimeira ? ` (${formatDateBR(rawPrimeira)})` : ""}. O padrão do Banco do Brasil foi ajustado a um print do
        app; outro print, dias depois, mostrou juros menores (3,94% ao mês): o banco muda a taxa por data ou perfil.
        Confira no app antes de contratar.
      </p>
    </div>
  );
}
