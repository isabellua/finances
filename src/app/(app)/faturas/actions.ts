"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";

/** Registra o pagamento da fatura: sai da conta do cartão e não conta como gasto. */
export async function payInvoice(formData: FormData) {
  const { supabase } = await requireUser();
  const card = z.uuid().safeParse(formData.get("card"));
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("date"));
  const back_ = `/faturas?cartao=${card.success ? card.data : ""}`;
  if (!card.success || !date.success) back("/faturas", "erro", "Dados inválidos.");
  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(back_, "erro", "Valor inválido.");

  const { data: c } = await supabase
    .from("credit_cards")
    .select("name,account_id")
    .eq("id", card.data)
    .maybeSingle();
  if (!c) back("/faturas", "erro", "Cartão não encontrado.");

  const { error } = await supabase.from("transactions").insert({
    kind: "invoice_payment",
    amount_cents: amount,
    occurred_on: date.data,
    description: `Fatura ${c.name}`,
    account_id: c.account_id,
    card_id: card.data,
    status: "paid",
  });
  if (error) back(back_, "erro", "Não foi possível registrar o pagamento.");

  revalidatePath("/", "layout");
  back(back_, "ok", "Pagamento da fatura registrado.");
}
