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

/** Valida o formulário e monta a linha. Em erro, volta para `errPath` com a mensagem. */
function buildRow(formData: FormData, errPath: string) {
  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    occurred_on: formData.get("occurred_on"),
    description: formData.get("description") ?? "",
    category_id: formData.get("category_id") ?? "",
    source: formData.get("source") ?? "",
    target: formData.get("target") ?? "",
  });
  if (!parsed.success) back(errPath, "erro", parsed.error.issues[0].message);
  const d = parsed.data;

  const amount = parseBRLToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(errPath, "erro", "Valor inválido.");

  const source = ref(d.source)!;
  const target = ref(d.target);

  // Todos os vínculos são definidos sempre: trocar o tipo na edição zera o que não se aplica.
  const row = {
    kind: d.kind,
    amount_cents: amount,
    occurred_on: d.occurred_on,
    description: d.description,
    category_id: null as string | null,
    account_id: null as string | null,
    card_id: null as string | null,
    transfer_account_id: null as string | null,
  };

  switch (d.kind) {
    case "income":
      if (source.type !== "a") back(errPath, "erro", "Entrada precisa de uma conta.");
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
        back(errPath, "erro", "Transferência precisa de conta de origem e de destino.");
      }
      row.account_id = source.id;
      row.transfer_account_id = target.id;
      break;
    case "invoice_payment":
      if (source.type !== "a" || target?.type !== "c") {
        back(errPath, "erro", "Pagamento de fatura: origem é uma conta e destino é um cartão.");
      }
      row.account_id = source.id;
      row.card_id = target.id;
      break;
  }
  return row;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const row = buildRow(formData, PATH);

  const { error } = await supabase.from("transactions").insert(row);
  if (error) back(PATH, "erro", "Lançamento inválido para o tipo escolhido.");

  refresh();
  back(`${PATH}?mes=${row.occurred_on.slice(0, 7)}`, "ok", "Lançamento salvo.");
}

export async function updateTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Lançamento inválido.");

  const editPath = `${PATH}/${id.data}/editar`;
  const row = buildRow(formData, editPath);

  // source e external_hash não mudam: um lançamento importado editado continua
  // sendo reconhecido como duplicata se o mesmo arquivo for importado de novo.
  const { data, error } = await supabase
    .from("transactions")
    .update(row)
    .eq("id", id.data)
    .select("id");
  if (error) back(editPath, "erro", "Lançamento inválido para o tipo escolhido.");
  if (!data?.length) back(PATH, "erro", "Lançamento não encontrado.");

  refresh();
  back(`${PATH}?mes=${row.occurred_on.slice(0, 7)}`, "ok", "Lançamento atualizado.");
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Lançamento inválido.");

  const { error } = await supabase.from("transactions").delete().eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível excluir.");

  refresh();
  const mes = String(formData.get("mes") ?? "");
  back(/^\d{4}-\d{2}$/.test(mes) ? `${PATH}?mes=${mes}` : PATH, "ok", "Lançamento excluído.");
}
