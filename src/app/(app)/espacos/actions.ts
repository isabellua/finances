"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { safeNext } from "@/lib/workspace";

const kind = z.enum(["personal", "professional", "family", "friends", "other"]);

function refresh() {
  revalidatePath("/", "layout");
}

/** Abre o espaço pela rota de troca (ela grava o cookie), depois vai para `next`. */
function openWorkspace(id: string, next: string): never {
  redirect(`/espaco/trocar?id=${id}&next=${encodeURIComponent(next)}`);
}

/** Qualquer usuário cria os próprios espaços. O criador é o dono. */
export async function createWorkspace(formData: FormData) {
  const { supabase } = await requireUser();
  const name = z.string().trim().min(1, "Dê um nome ao espaço.").max(60).safeParse(formData.get("name"));
  if (!name.success) back("/espacos/novo", "erro", name.error.issues[0].message);
  const k = kind.safeParse(formData.get("kind"));
  if (!k.success) back("/espacos/novo", "erro", "Tipo de espaço inválido.");

  const { data, error } = await supabase.rpc("create_workspace", { p_name: name.data, p_kind: k.data });
  if (error || !data) back("/espacos/novo", "erro", "Não foi possível criar o espaço.");

  refresh();
  openWorkspace(data as string, "/configuracoes");
}

export async function acceptInvite(formData: FormData) {
  const { supabase } = await requireUser();
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) back("/", "erro", "Convite inválido.");

  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token.data });
  if (error || !data) {
    back("/", "erro", "Convite inválido, expirado ou já usado. Peça um novo ao dono do espaço.");
  }

  refresh();
  openWorkspace(data as string, "/");
}

/** Dono remove um membro; qualquer membro pode sair (remover a si mesmo). */
export async function removeMember(formData: FormData) {
  const { supabase, user } = await requireUser();
  const ws = z.uuid().safeParse(formData.get("ws"));
  const uid = z.uuid().safeParse(formData.get("user"));
  const next = safeNext(String(formData.get("next") ?? "/configuracoes"));
  if (!ws.success || !uid.success) back(next, "erro", "Dados inválidos.");
  const leaving = uid.data === user.id;

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", ws.data)
    .eq("user_id", uid.data);
  if (error) {
    back(
      next,
      "erro",
      error.message.includes("last_owner")
        ? "O espaço não pode ficar sem dono. Exclua o espaço, ou convide outro dono antes."
        : "Não foi possível remover.",
    );
  }

  refresh();
  // Ao sair, o cookie aponta para um espaço que deixou de ser dele: a troca cai no primeiro espaço restante.
  back(leaving ? "/" : next, "ok", leaving ? "Você saiu do espaço." : "Membro removido.");
}
