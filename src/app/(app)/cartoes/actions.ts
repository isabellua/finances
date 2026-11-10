"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";

const day = (label: string) =>
  z.coerce
    .number(`${label} inválido (1 a 31).`)
    .int(`${label} inválido (1 a 31).`)
    .min(1, `${label} inválido (1 a 31).`)
    .max(31, `${label} inválido (1 a 31).`);

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cartão.").max(80),
  brand: z.string().trim().max(40),
  account_id: z.uuid("Escolha a conta que paga a fatura."),
  closing_day: day("Dia de fechamento"),
  due_day: day("Dia de vencimento"),
});

export async function createCard(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    brand: formData.get("brand") ?? "",
    account_id: formData.get("account_id"),
    closing_day: formData.get("closing_day"),
    due_day: formData.get("due_day"),
  });
  if (!parsed.success) back("/cartoes", "erro", parsed.error.issues[0].message);

  const rawLimit = String(formData.get("limit") ?? "").trim();
  const limit = rawLimit === "" ? null : parseBRLToCents(rawLimit);
  if (rawLimit !== "" && limit === null) back("/cartoes", "erro", "Limite inválido.");

  const { error } = await supabase.from("credit_cards").insert({
    name: parsed.data.name,
    brand: parsed.data.brand || null,
    account_id: parsed.data.account_id,
    credit_limit_cents: limit,
    closing_day: parsed.data.closing_day,
    due_day: parsed.data.due_day,
  });
  if (error) back("/cartoes", "erro", "Não foi possível criar o cartão.");

  revalidatePath("/cartoes");
  back("/cartoes", "ok", "Cartão criado.");
}

export async function archiveCard(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back("/cartoes", "erro", "Cartão inválido.");

  const { error } = await supabase
    .from("credit_cards")
    .update({ archived: true })
    .eq("id", id.data);
  if (error) back("/cartoes", "erro", "Não foi possível arquivar o cartão.");

  revalidatePath("/cartoes");
  back("/cartoes", "ok", "Cartão arquivado.");
}
