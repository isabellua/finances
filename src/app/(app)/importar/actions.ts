"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MATCH_DAYS_AFTER, MATCH_DAYS_BEFORE, matchFxEstimates, type FxMatch } from "@/lib/fx-match";

const target = z.string().regex(/^[ac]:[0-9a-f-]{36}$/i);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const checkSchema = z.object({
  target,
  rows: z
    .array(
      z.object({
        hash,
        date: isoDate,
        cents: z.number().int().positive(),
        // só saídas podem corresponder a uma estimativa de compra internacional
        expense: z.boolean().default(true),
      }),
    )
    .max(5000),
});

export type { FxMatch };

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Para a prévia. `hashDup`: já importadas antes (mesmo hash).
 * `softDup`: existe lançamento manual no mesmo destino, data e valor.
 */
export async function checkDuplicates(
  input: z.input<typeof checkSchema>,
): Promise<
  { hashDup: string[]; softDup: string[]; fxMatches: Record<string, FxMatch> } | { error: string }
> {
  const { supabase } = await requireUser();
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { target: t, rows } = parsed.data;
  if (rows.length === 0) return { hashDup: [], softDup: [], fxMatches: {} };

  const hashDup = new Set<string>();
  for (const part of chunks(rows.map((r) => r.hash), 150)) {
    const { data, error } = await supabase
      .from("transactions")
      .select("external_hash")
      .in("external_hash", part);
    if (error) return { error: "Não foi possível verificar duplicatas." };
    for (const d of data ?? []) if (d.external_hash) hashDup.add(d.external_hash);
  }

  const dates = rows.map((r) => r.date).sort();
  const col = t.startsWith("c:") ? "card_id" : "account_id";
  const { data: manual, error } = await supabase
    .from("transactions")
    .select("occurred_on,amount_cents")
    .eq(col, t.slice(2))
    .is("external_hash", null)
    .gte("occurred_on", dates[0])
    .lte("occurred_on", dates[dates.length - 1]);
  if (error) return { error: "Não foi possível verificar duplicatas." };

  const manualKeys = new Set((manual ?? []).map((m) => `${m.occurred_on}|${m.amount_cents}`));
  const softDup = rows.filter((r) => manualKeys.has(`${r.date}|${r.cents}`)).map((r) => r.hash);

  // Fechamento do ciclo: linha da fatura que parece uma compra internacional estimada.
  // Data da linha entre 3 dias antes e 14 depois da compra; valor até 10% de diferença.
  let fxMatches: Record<string, FxMatch> = {};
  if (t.startsWith("c:")) {
    const lo = new Date(`${dates[0]}T00:00:00Z`);
    lo.setUTCDate(lo.getUTCDate() - MATCH_DAYS_AFTER);
    const hi = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    hi.setUTCDate(hi.getUTCDate() + MATCH_DAYS_BEFORE);
    const { data: pending, error: pErr } = await supabase
      .from("transactions")
      .select("id,description,occurred_on,amount_cents")
      .eq("card_id", t.slice(2))
      .eq("fx_estimated", true)
      .gte("occurred_on", lo.toISOString().slice(0, 10))
      .lte("occurred_on", hi.toISOString().slice(0, 10));
    if (pErr) return { error: "Não foi possível verificar duplicatas." };
    fxMatches = matchFxEstimates(rows, pending ?? [], hashDup);
  }

  return { hashDup: [...hashDup], softDup, fxMatches };
}

const importSchema = z.object({
  target,
  rows: z
    .array(
      z.object({
        date: isoDate,
        description: z.string().max(200),
        cents: z.number().int().positive(),
        kind: z.enum(["income", "expense"]),
        categoryId: z.union([z.uuid(), z.null()]),
        hash,
        remember: z.boolean(),
        pattern: z.string().max(80),
        // atualiza esta estimativa de compra internacional em vez de criar um lançamento novo
        mergeTxId: z.uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

export async function importTransactions(
  input: z.input<typeof importSchema>,
): Promise<{ inserted: number; skipped: number; merged: number } | { error: string }> {
  const { supabase } = await requireUser();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { target: t, rows } = parsed.data;

  const isCard = t.startsWith("c:");
  if (isCard && rows.some((r) => r.kind !== "expense")) {
    return { error: "Em cartão de crédito só entram compras (saídas)." };
  }

  const toMerge = rows.filter((r) => r.mergeTxId);
  const toInsert = rows.filter((r) => !r.mergeTxId);
  if (toMerge.length > 0 && (!isCard || toMerge.some((r) => r.kind !== "expense"))) {
    return { error: "Só compras no cartão podem atualizar uma estimativa." };
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const records = toInsert.map((r) => ({
      kind: r.kind,
      amount_cents: r.cents,
      occurred_on: r.date,
      description: r.description,
      category_id: r.categoryId,
      account_id: isCard ? null : t.slice(2),
      card_id: isCard ? t.slice(2) : null,
      source: "import" as const,
      external_hash: r.hash,
    }));

    const { data, error } = await supabase
      .from("transactions")
      .upsert(records, { onConflict: "user_id,external_hash", ignoreDuplicates: true })
      .select("id");
    if (error) return { error: "Não foi possível importar. Nada foi salvo nesta etapa." };
    inserted = data?.length ?? 0;
  }

  // Fechamento do ciclo: a estimativa passa a valer o que a fatura cobrou, e ganha o hash
  // da linha (reimportar o mesmo arquivo não duplica nem atualiza de novo).
  let merged = 0;
  for (const r of toMerge) {
    const { data, error } = await supabase
      .from("transactions")
      .update({ amount_cents: r.cents, fx_estimated: false, external_hash: r.hash })
      .eq("id", r.mergeTxId!)
      .eq("fx_estimated", true)
      .select("id");
    if (!error && data?.length) merged++;
  }

  const rules = new Map<string, string>();
  for (const r of rows) {
    if (r.remember && r.categoryId && r.pattern.length >= 3) rules.set(r.pattern, r.categoryId);
  }
  if (rules.size > 0) {
    await supabase.from("category_rules").upsert(
      [...rules].map(([pattern, category_id]) => ({ pattern, category_id })),
      { onConflict: "user_id,pattern" },
    );
  }

  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  revalidatePath("/cambio");
  return { inserted, merged, skipped: rows.length - inserted - merged };
}
