"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";

const PATH = "/lancamentos";

const schema = z.object({
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  description: z.string().trim().max(200, "Descrição muito longa."),
  category_id: z.union([z.uuid(), z.literal("")]),
  // "a:<uuid>" = conta, "c:<uuid>" = cartão
  source: z.string().regex(/^[ac]:[0-9a-f-]{36}$/i, "Escolha a origem."),
  target: z.string().regex(/^([ac]:[0-9a-f-]{36})?$/i, "Destino inválido."),
});

function ref(v: string): { type: "a" | "c"; id: string } | null {
  if (!v) return null;
  return { type: v[0] as "a" | "c", id: v.slice(2) };
}

export async function createTransaction(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    occurred_on: formData.get("occurred_on"),
    description: formData.get("description") ?? "",
    category_id: formData.get("category_id") ?? "",
    source: formData.get("source") ?? "",
    target: formData.get("target") ?? "",
  });
  if (!parsed.success) back(PATH, "erro", parsed.error.issues[0].message);
  const d = parsed.data;

  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(PATH, "erro", "Valor inválido.");

  const source = ref(d.source)!;
  const target = ref(d.target);

  const row: Record<string, unknown> = {
    kind: d.kind,
    amount_cents: amount,
    occurred_on: d.occurred_on,
    description: d.description,
    category_id: null,
    account_id: null,
    card_id: null,
    transfer_account_id: null,
  };

  switch (d.kind) {
    case "income":
      if (source.type !== "a") back(PATH, "erro", "Entrada precisa de uma conta.");
      row.account_id = source.id;
      row.category_id = d.category_id || null;
      break;
    case "expense":
      if (source.type === "a") row.account_id = source.id;
      else row.card_id = source.id;
      row.category_id = d.category_id || null;
      break;
    case "transfer":
      if (source.type !== "a" || target?.type !== "a") {
        back(PATH, "erro", "Transferência precisa de conta de origem e de destino.");
      }
      row.account_id = source.id;
      row.transfer_account_id = target.id;
      break;
    case "invoice_payment":
      if (source.type !== "a" || target?.type !== "c") {
        back(PATH, "erro", "Pagamento de fatura: origem é uma conta e destino é um cartão.");
      }
      row.account_id = source.id;
      row.card_id = target.id;
      break;
  }

  const { error } = await supabase.from("transactions").insert(row);
  if (error) {
    // 23514 = check_violation, 23503 = foreign_key_violation
    back(PATH, "erro", "Lançamento inválido para o tipo escolhido.");
  }

  revalidatePath(PATH);
  revalidatePath("/");
  revalidatePath("/contas");
  back(`${PATH}?mes=${d.occurred_on.slice(0, 7)}`, "ok", "Lançamento salvo.");
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Lançamento inválido.");

  const { error } = await supabase.from("transactions").delete().eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível excluir.");

  revalidatePath(PATH);
  revalidatePath("/");
  revalidatePath("/contas");
  const mes = String(formData.get("mes") ?? "");
  back(/^\d{4}-\d{2}$/.test(mes) ? `${PATH}?mes=${mes}` : PATH, "ok", "Lançamento excluído.");
}
