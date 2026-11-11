"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";
import { ACCOUNT_TYPE_LABEL } from "@/lib/types";

const PATH = "/contas";

const accountSchema = z.object({
  institution: z.string().trim().max(80),
  type: z.enum(["checking", "savings", "investment", "cash"]),
});

export async function createAccount(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = accountSchema.safeParse({
    institution: formData.get("institution") ?? "",
    type: formData.get("type") ?? "checking",
  });
  if (!parsed.success) back(PATH, "erro", "Dados da conta inválidos.");

  // Dinheiro não tem banco: usa "Dinheiro" como identidade.
  const institution =
    parsed.data.institution || (parsed.data.type === "cash" ? "Dinheiro" : "");
  if (!institution) back(PATH, "erro", "Informe o banco.");

  const raw = String(formData.get("opening") ?? "").trim();
  const negative = raw.startsWith("-");
  const cents = raw === "" ? 0 : parseBRLToCents(negative ? raw.slice(1) : raw);
  if (cents === null) back(PATH, "erro", "Saldo inicial inválido.");

  // O nome é derivado do banco. Se já houver outra conta igual (mesmo banco
  // e tipo), numera: "Itaú", "Itaú 2".
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("institution", institution)
    .eq("type", parsed.data.type)
    .eq("archived", false);
  const name = count && count > 0 ? `${institution} ${count + 1}` : institution;

  const { error } = await supabase.from("accounts").insert({
    name,
    institution,
    type: parsed.data.type,
    opening_balance_cents: negative ? -cents : cents,
  });
  if (error) back(PATH, "erro", "Não foi possível criar a conta.");

  revalidatePath(PATH);
  back(PATH, "ok", `${name} (${ACCOUNT_TYPE_LABEL[parsed.data.type]}) criada.`);
}

export async function archiveAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Conta inválida.");

  const { count } = await supabase
    .from("credit_cards")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id.data)
    .eq("archived", false);
  if (count && count > 0) {
    back(PATH, "erro", "Arquive primeiro os cartões desta conta.");
  }

  const { error } = await supabase
    .from("accounts")
    .update({ archived: true })
    .eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível arquivar a conta.");

  revalidatePath(PATH);
  back(PATH, "ok", "Conta arquivada.");
}

const day = (label: string) =>
  z.coerce
    .number(`${label} inválido (1 a 31).`)
    .int(`${label} inválido (1 a 31).`)
    .min(1, `${label} inválido (1 a 31).`)
    .max(31, `${label} inválido (1 a 31).`);

const cardSchema = z.object({
  account_id: z.uuid("Conta inválida."),
  brand: z.string().trim().min(1, "Escolha a bandeira.").max(40),
  last4: z.string().trim().regex(/^([0-9]{4})?$/, "Final do cartão: 4 dígitos."),
  closing_day: day("Dia de fechamento"),
  due_day: day("Dia de vencimento"),
});

export async function createCard(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = cardSchema.safeParse({
    account_id: formData.get("account_id"),
    brand: formData.get("brand") ?? "",
    last4: formData.get("last4") ?? "",
    closing_day: formData.get("closing_day"),
    due_day: formData.get("due_day"),
  });
  if (!parsed.success) back(PATH, "erro", parsed.error.issues[0].message);

  const rawLimit = String(formData.get("limit") ?? "").trim();
  const limit = rawLimit === "" ? null : parseBRLToCents(rawLimit);
  if (rawLimit !== "" && limit === null) back(PATH, "erro", "Limite inválido.");

  const { data: account } = await supabase
    .from("accounts")
    .select("institution,name")
    .eq("id", parsed.data.account_id)
    .single();
  if (!account) back(PATH, "erro", "Conta não encontrada.");

  const name = `${account.institution ?? account.name} ${parsed.data.brand}`;

  const { error } = await supabase.from("credit_cards").insert({
    account_id: parsed.data.account_id,
    name,
    brand: parsed.data.brand,
    last4: parsed.data.last4 || null,
    credit_limit_cents: limit,
    closing_day: parsed.data.closing_day,
    due_day: parsed.data.due_day,
  });
  if (error) back(PATH, "erro", "Não foi possível criar o cartão.");

  revalidatePath(PATH);
  back(PATH, "ok", `Cartão ${name} criado.`);
}

export async function archiveCard(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Cartão inválido.");

  const { error } = await supabase
    .from("credit_cards")
    .update({ archived: true })
    .eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível arquivar o cartão.");

  revalidatePath(PATH);
  back(PATH, "ok", "Cartão arquivado.");
}
