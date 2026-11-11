"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { occurrenceDate } from "@/lib/commitments";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";

const PATH = "/pagar";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const pay = z.string().regex(/^[ac]:[0-9a-f-]{36}$/i, "Escolha como é pago.");

function refresh() {
  revalidatePath("/", "layout");
}

const createSchema = z.object({
  kind: z.enum(["subscription", "installment", "fixed_bill", "one_off"]),
  description: z.string().trim().min(1, "Informe a descrição.").max(120, "Descrição muito longa."),
  start_on: isoDate,
  frequency: z.enum(["monthly", "yearly"]),
  payment: pay,
  category_id: z.union([z.uuid(), z.literal("")]),
  total: z.string(),
  paid_count: z.string(),
});

export async function createCommitment(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = createSchema.safeParse({
    kind: formData.get("kind"),
    description: formData.get("description") ?? "",
    start_on: formData.get("start_on"),
    frequency: formData.get("frequency") ?? "monthly",
    payment: formData.get("payment") ?? "",
    category_id: formData.get("category_id") ?? "",
    total: String(formData.get("total") ?? ""),
    paid_count: String(formData.get("paid_count") ?? "0"),
  });
  if (!parsed.success) back(PATH, "erro", parsed.error.issues[0].message);
  const d = parsed.data;

  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(PATH, "erro", "Valor inválido.");

  let total: number | null = null;
  if (d.kind === "installment") {
    total = Number(d.total);
    if (!Number.isInteger(total) || total < 2 || total > 600) {
      back(PATH, "erro", "Número de parcelas inválido (mínimo 2).");
    }
  } else if (d.kind === "one_off") {
    total = 1;
  }

  const paidCount = d.kind === "installment" ? Number(d.paid_count || "0") : 0;
  if (!Number.isInteger(paidCount) || paidCount < 0 || (total !== null && paidCount >= total)) {
    back(PATH, "erro", "Parcelas já pagas deve ser menor que o total de parcelas.");
  }

  const frequency = d.kind === "subscription" ? d.frequency : "monthly";
  const isCard = d.payment.startsWith("c:");
  const ref = d.payment.slice(2);

  const { data: created, error } = await supabase
    .from("commitments")
    .insert({
      kind: d.kind,
      description: d.description,
      amount_cents: amount,
      frequency,
      start_on: d.start_on,
      total_occurrences: total,
      account_id: isCard ? null : ref,
      card_id: isCard ? ref : null,
      category_id: d.category_id || null,
    })
    .select("id")
    .single();
  if (error || !created) back(PATH, "erro", "Não foi possível salvar.");

  // Parcelas que já foram pagas antes de cadastrar: marca como pagas, sem criar lançamento.
  if (paidCount > 0) {
    const rows = Array.from({ length: paidCount }, (_, i) => ({
      commitment_id: created.id,
      seq: i + 1,
      status: "paid" as const,
      settled_on: occurrenceDate({ start_on: d.start_on, frequency }, i + 1),
    }));
    const { error: sErr } = await supabase.from("commitment_settlements").insert(rows);
    if (sErr) {
      await supabase.from("commitments").delete().eq("id", created.id);
      back(PATH, "erro", "Não foi possível registrar as parcelas já pagas. Nada foi salvo.");
    }
  }

  refresh();
  back(PATH, "ok", `${d.description} cadastrado.`);
}

const updateSchema = z.object({
  id: z.uuid(),
  description: z.string().trim().min(1, "Informe a descrição.").max(120),
  payment: pay,
  category_id: z.union([z.uuid(), z.literal("")]),
  active: z.enum(["on", "off"]),
});

/** Edita o que não muda a contagem das ocorrências (datas, tipo e parcelas ficam fixos). */
export async function updateCommitment(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    description: formData.get("description") ?? "",
    payment: formData.get("payment") ?? "",
    category_id: formData.get("category_id") ?? "",
    active: formData.get("active") === "on" ? "on" : "off",
  });
  if (!parsed.success) back(PATH, "erro", parsed.error.issues[0].message);
  const d = parsed.data;

  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(PATH, "erro", "Valor inválido.");

  const isCard = d.payment.startsWith("c:");
  const ref = d.payment.slice(2);

  const { data, error } = await supabase
    .from("commitments")
    .update({
      description: d.description,
      amount_cents: amount,
      account_id: isCard ? null : ref,
      card_id: isCard ? ref : null,
      category_id: d.category_id || null,
      active: d.active === "on",
    })
    .eq("id", d.id)
    .select("id");
  if (error || !data?.length) back(PATH, "erro", "Não foi possível salvar.");

  refresh();
  back(PATH, "ok", "Atualizado.");
}

export async function deleteCommitment(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Cadastro inválido.");

  // Quitações saem em cascata. Lançamentos já criados continuam existindo.
  const { error } = await supabase.from("commitments").delete().eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível excluir.");

  refresh();
  back(PATH, "ok", "Excluído. Os lançamentos que ele já gerou foram mantidos.");
}

const settleSchema = z.object({
  commitment_id: z.uuid(),
  seq: z.coerce.number().int().min(1),
  date: isoDate,
  mode: z.enum(["create", "mark", "skip"]),
});

export async function settleOccurrence(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = settleSchema.safeParse({
    commitment_id: formData.get("commitment_id"),
    seq: formData.get("seq"),
    date: formData.get("date"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) back(PATH, "erro", "Dados inválidos.");
  const d = parsed.data;

  let amount: number | null = null;
  if (d.mode === "create") {
    const raw = String(formData.get("amount") ?? "").trim();
    if (raw !== "") {
      amount = parseBRLToCents(raw);
      if (amount === null || amount <= 0) back(PATH, "erro", "Valor inválido.");
    }
  }

  const { error } = await supabase.rpc("settle_commitment", {
    p_commitment: d.commitment_id,
    p_seq: d.seq,
    p_date: d.date,
    p_mode: d.mode,
    p_amount_cents: amount,
  });
  if (error) {
    back(
      PATH,
      "erro",
      error.code === "23505"
        ? "Essa ocorrência já foi registrada."
        : "Não foi possível registrar. Nada foi salvo.",
    );
  }

  refresh();
  back(
    PATH,
    "ok",
    d.mode === "create" ? "Pagamento registrado como lançamento." : d.mode === "mark" ? "Marcado como pago." : "Ocorrência pulada.",
  );
}

export async function undoSettlement(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = z
    .object({ commitment_id: z.uuid(), seq: z.coerce.number().int().min(1) })
    .safeParse({ commitment_id: formData.get("commitment_id"), seq: formData.get("seq") });
  if (!parsed.success) back(PATH, "erro", "Dados inválidos.");

  const { error } = await supabase.rpc("unsettle_commitment", {
    p_commitment: parsed.data.commitment_id,
    p_seq: parsed.data.seq,
  });
  if (error) back(PATH, "erro", "Não foi possível desfazer.");

  refresh();
  back(PATH, "ok", "Desfeito. Se o pagamento tinha criado um lançamento, ele foi removido.");
}
