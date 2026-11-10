"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome da conta.").max(80),
  institution: z.string().trim().max(80),
  type: z.enum(["checking", "savings", "investment", "cash"]),
});

export async function createAccount(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    institution: formData.get("institution") ?? "",
    type: formData.get("type") ?? "checking",
  });
  if (!parsed.success) back("/contas", "erro", parsed.error.issues[0].message);

  const raw = String(formData.get("opening") ?? "").trim();
  const negative = raw.startsWith("-");
  const cents = raw === "" ? 0 : parseBRLToCents(negative ? raw.slice(1) : raw);
  if (cents === null) back("/contas", "erro", "Saldo inicial inválido.");

  const { error } = await supabase.from("accounts").insert({
    name: parsed.data.name,
    institution: parsed.data.institution || null,
    type: parsed.data.type,
    opening_balance_cents: negative ? -cents : cents,
  });
  if (error) back("/contas", "erro", "Não foi possível criar a conta.");

  revalidatePath("/contas");
  back("/contas", "ok", "Conta criada.");
}

export async function archiveAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back("/contas", "erro", "Conta inválida.");

  const { error } = await supabase
    .from("accounts")
    .update({ archived: true })
    .eq("id", id.data);
  if (error) back("/contas", "erro", "Não foi possível arquivar a conta.");

  revalidatePath("/contas");
  back("/contas", "ok", "Conta arquivada.");
}
