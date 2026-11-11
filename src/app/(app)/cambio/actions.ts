"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addDays, todayISO } from "@/lib/dates";
import {
  CURRENCIES,
  convertFx,
  currencyExp,
  parseAmountToMinor,
  parsePercentToBps,
  parseRateToMicro,
} from "@/lib/fx";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";
import { pickQuote, ptaxResponse, toBcbDate, type PtaxQuote } from "@/lib/ptax";

const PATH = "/cambio";
const BCB = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
const CODES = new Set(CURRENCIES.map((c) => c.code));

function refresh() {
  revalidatePath("/", "layout");
}

/** Busca a PTAX (venda) da data, ou do último dia com cotação antes dela. */
export async function getPtax(
  currency: string,
  date: string,
): Promise<{ ok: true; quote: PtaxQuote } | { ok: false; error: string }> {
  await requireUser();
  if (!CODES.has(currency)) return { ok: false, error: "Moeda sem PTAX no Banco Central." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Data inválida." };

  // Janela de 10 dias cobre fim de semana e feriados prolongados. Janela inteira no
  // futuro volta vazia (verificado na API), então a data é limitada a hoje.
  const target = date > todayISO() ? todayISO() : date;
  const start = toBcbDate(addDays(target, -10));
  const end = toBcbDate(target);
  const url =
    `${BCB}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${currency}'&@dataInicial='${start}'&@dataFinalCotacao='${end}'` +
    `&$top=40&$orderby=dataHoraCotacao%20desc&$format=json`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `Banco Central respondeu ${res.status}. Digite a cotação.` };
    const parsed = ptaxResponse.safeParse(await res.json());
    if (!parsed.success) return { ok: false, error: "Resposta inesperada do Banco Central. Digite a cotação." };
    const quote = pickQuote(parsed.data.value);
    if (!quote) return { ok: false, error: "Sem cotação nessa janela. Digite a cotação." };
    return { ok: true, quote };
  } catch {
    return { ok: false, error: "Não consegui consultar o Banco Central agora. Digite a cotação." };
  }
}

const createSchema = z.object({
  card_id: z.uuid("Escolha o cartão."),
  currency: z.string().regex(/^[A-Z]{3}$/, "Moeda inválida."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  description: z.string().trim().max(200),
  category_id: z.union([z.uuid(), z.literal("")]),
});

/** Lança a compra como estimativa. O total é recalculado aqui: o cliente não define o valor. */
export async function createFxTransaction(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = createSchema.safeParse({
    card_id: formData.get("card_id"),
    currency: String(formData.get("currency") ?? "").toUpperCase(),
    date: formData.get("date"),
    description: formData.get("description") ?? "",
    category_id: formData.get("category_id") ?? "",
  });
  if (!parsed.success) back(PATH, "erro", parsed.error.issues[0].message);
  const d = parsed.data;

  const exp = currencyExp(d.currency);
  const amountMinor = parseAmountToMinor(String(formData.get("amount") ?? ""), exp);
  if (amountMinor === null) back(PATH, "erro", "Valor na moeda estrangeira inválido.");
  const rateMicro = parseRateToMicro(String(formData.get("rate") ?? ""));
  if (rateMicro === null) back(PATH, "erro", "Cotação inválida.");
  const spreadBps = parsePercentToBps(String(formData.get("spread") ?? ""));
  if (spreadBps === null || spreadBps > 3000) back(PATH, "erro", "Spread inválido (0 a 30%).");
  const iofBps = parsePercentToBps(String(formData.get("iof") ?? ""));
  if (iofBps === null || iofBps > 1000) back(PATH, "erro", "IOF inválido (0 a 10%).");

  const r = convertFx({ amountMinor, exp, rateMicro, spreadBps, iofBps });
  if (r.totalCents <= 0) back(PATH, "erro", "O valor convertido deu zero. Confira valor e cotação.");

  const { error } = await supabase.from("transactions").insert({
    kind: "expense",
    amount_cents: r.totalCents,
    occurred_on: d.date,
    description: d.description || `Compra internacional (${d.currency})`,
    category_id: d.category_id || null,
    card_id: d.card_id,
    fx_currency: d.currency,
    fx_amount_minor: amountMinor,
    fx_rate_micro: rateMicro,
    fx_spread_bps: spreadBps,
    fx_iof_bps: iofBps,
    fx_estimated_cents: r.totalCents,
    fx_estimated: true,
  });
  if (error) back(PATH, "erro", "Não foi possível lançar a compra.");

  refresh();
  back(PATH, "ok", "Compra lançada como estimativa. Quando a fatura chegar, confirme o valor real (aqui ou importando a fatura).");
}

export async function saveCardFx(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Cartão inválido.");
  const rule = z.enum(["purchase_date", "closing_date", "due_date"]).safeParse(formData.get("rule"));
  if (!rule.success) back(PATH, "erro", "Regra de cotação inválida.");

  const rawSpread = String(formData.get("spread") ?? "").trim();
  const rawIof = String(formData.get("iof") ?? "").trim();
  const spread = rawSpread === "" ? null : parsePercentToBps(rawSpread);
  const iof = rawIof === "" ? null : parsePercentToBps(rawIof);
  if (spread !== null && spread > 3000) back(PATH, "erro", "Spread inválido (0 a 30%).");
  if (iof !== null && iof > 1000) back(PATH, "erro", "IOF inválido (0 a 10%).");
  if ((rawSpread !== "" && spread === null) || (rawIof !== "" && iof === null)) {
    back(PATH, "erro", "Percentual inválido.");
  }

  const { data, error } = await supabase
    .from("credit_cards")
    .update({ fx_spread_bps: spread, fx_iof_bps: iof, fx_rate_rule: rule.data })
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) back(PATH, "erro", "Não foi possível salvar o cartão.");

  refresh();
  back(PATH, "ok", "Parâmetros do cartão salvos.");
}

export async function saveIofParam(formData: FormData) {
  const { supabase } = await requireUser();
  const rate = parsePercentToBps(String(formData.get("rate") ?? ""));
  if (rate === null || rate > 2000) back(PATH, "erro", "Alíquota inválida.");
  const from = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("valid_from"));
  if (!from.success) back(PATH, "erro", "Data de vigência inválida.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  const { error } = await supabase.from("tax_params").upsert(
    { key: "iof_card_international", rate_bps: rate, valid_from: from.data, note: note || null },
    { onConflict: "user_id,key,valid_from" },
  );
  if (error) back(PATH, "erro", "Não foi possível salvar a alíquota.");

  refresh();
  back(PATH, "ok", "Alíquota salva.");
}

export async function deleteIofParam(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Alíquota inválida.");
  const { error } = await supabase.from("tax_params").delete().eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível excluir.");
  refresh();
  back(PATH, "ok", "Alíquota removida.");
}

/** Confirma o valor realmente cobrado. A estimativa fica guardada para a calibração. */
export async function confirmFxActual(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Lançamento inválido.");
  const actual = parseBRLToCents(String(formData.get("actual") ?? ""));
  if (actual === null || actual <= 0) back(PATH, "erro", "Valor da fatura inválido.");

  const { data, error } = await supabase
    .from("transactions")
    .update({ amount_cents: actual, fx_estimated: false })
    .eq("id", id.data)
    .eq("fx_estimated", true)
    .select("id");
  if (error) back(PATH, "erro", "Não foi possível confirmar.");
  if (!data?.length) back(PATH, "erro", "Esse lançamento já foi confirmado.");

  refresh();
  back(PATH, "ok", "Valor real confirmado.");
}

export async function applyImpliedSpread(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  const bps = z.coerce.number().int().min(0).max(3000).safeParse(formData.get("bps"));
  if (!id.success || !bps.success) back(PATH, "erro", "Dados inválidos.");

  const { data, error } = await supabase
    .from("credit_cards")
    .update({ fx_spread_bps: bps.data })
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) back(PATH, "erro", "Não foi possível atualizar o spread.");

  refresh();
  back(PATH, "ok", "Spread do cartão atualizado.");
}

