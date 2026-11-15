"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { parseBRLToCents } from "@/lib/money";
import { WS_COOKIE, safeNext } from "@/lib/workspace";

const PATH = "/espacos";
const kind = z.enum(["personal", "professional", "family", "friends", "other"]);

async function setActive(id: string) {
  (await cookies()).set(WS_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function switchWorkspace(formData: FormData) {
  const { workspaces } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success || !workspaces.some((w) => w.id === id.data)) {
    back(PATH, "erro", "Espaço inválido.");
  }
  await setActive(id.data);
  refresh();
  redirect(safeNext(String(formData.get("next") ?? "/")));
}

export async function createWorkspace(formData: FormData) {
  const { supabase } = await requireUser();
  const name = z.string().trim().min(1, "Dê um nome ao espaço.").max(60).safeParse(formData.get("name"));
  if (!name.success) back(PATH, "erro", name.error.issues[0].message);
  const k = kind.safeParse(formData.get("kind"));
  if (!k.success) back(PATH, "erro", "Tipo de espaço inválido.");

  const { data, error } = await supabase.rpc("create_workspace", { p_name: name.data, p_kind: k.data });
  if (error || !data) back(PATH, "erro", "Não foi possível criar o espaço.");

  await setActive(data as string);
  refresh();
  back(PATH, "ok", `Espaço “${name.data}” criado e aberto.`);
}

const optionalMoney = (raw: FormDataEntryValue | null): number | null | undefined => {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const c = parseBRLToCents(s);
  return c === null || c <= 0 ? undefined : c;
};

export async function updateWorkspace(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Espaço inválido.");
  const name = z.string().trim().min(1, "Dê um nome ao espaço.").max(60).safeParse(formData.get("name"));
  if (!name.success) back(PATH, "erro", name.error.issues[0].message);
  const k = kind.safeParse(formData.get("kind"));
  if (!k.success) back(PATH, "erro", "Tipo de espaço inválido.");

  const cap = optionalMoney(formData.get("cap"));
  const goal = optionalMoney(formData.get("goal"));
  if (cap === undefined) back(PATH, "erro", "Teto mensal inválido.");
  if (goal === undefined) back(PATH, "erro", "Meta de receita inválida.");

  const { data, error } = await supabase
    .from("workspaces")
    .update({
      name: name.data,
      kind: k.data,
      monthly_cap_cents: cap,
      monthly_income_goal_cents: goal,
    })
    .eq("id", id.data)
    .select("id");
  if (error || !data?.length) back(PATH, "erro", "Só o dono pode alterar o espaço.");

  refresh();
  back(PATH, "ok", "Espaço atualizado.");
}

export async function deleteWorkspace(formData: FormData) {
  const { supabase, workspaces, workspace } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Espaço inválido.");
  if (workspaces.length < 2) back(PATH, "erro", "Você precisa manter pelo menos um espaço.");

  const { data, error } = await supabase.from("workspaces").delete().eq("id", id.data).select("id");
  if (error || !data?.length) back(PATH, "erro", "Só o dono pode excluir o espaço.");

  if (workspace?.id === id.data) (await cookies()).delete(WS_COOKIE);
  refresh();
  back(PATH, "ok", "Espaço excluído, com tudo o que havia nele.");
}

export async function createInvite(formData: FormData) {
  const { supabase } = await requireUser();
  const ws = z.uuid().safeParse(formData.get("ws"));
  const role = z.enum(["editor", "viewer"]).safeParse(formData.get("role"));
  if (!ws.success || !role.success) back(PATH, "erro", "Dados do convite inválidos.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 80);

  const { error } = await supabase.rpc("create_workspace_invite", {
    p_ws: ws.data,
    p_role: role.data,
    p_note: note || null,
  });
  if (error) back(PATH, "erro", "Só o dono pode convidar.");

  refresh();
  back(PATH, "ok", "Convite criado. Copie o link abaixo e envie para a pessoa (vale 7 dias, uma vez).");
}

export async function revokeInvite(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back(PATH, "erro", "Convite inválido.");
  const { error } = await supabase.from("workspace_invites").delete().eq("id", id.data);
  if (error) back(PATH, "erro", "Não foi possível cancelar o convite.");
  refresh();
  back(PATH, "ok", "Convite cancelado.");
}

export async function removeMember(formData: FormData) {
  const { supabase, user, workspace } = await requireUser();
  const ws = z.uuid().safeParse(formData.get("ws"));
  const uid = z.uuid().safeParse(formData.get("user"));
  if (!ws.success || !uid.success) back(PATH, "erro", "Dados inválidos.");
  const leaving = uid.data === user.id;

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", ws.data)
    .eq("user_id", uid.data);
  if (error) {
    back(
      PATH,
      "erro",
      error.message.includes("last_owner")
        ? "O espaço não pode ficar sem dono. Passe a posse ou exclua o espaço."
        : "Não foi possível remover.",
    );
  }

  if (leaving && workspace?.id === ws.data) (await cookies()).delete(WS_COOKIE);
  refresh();
  back(PATH, "ok", leaving ? "Você saiu do espaço." : "Membro removido.");
}

export async function acceptInvite(formData: FormData) {
  const { supabase } = await requireUser();
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) back("/", "erro", "Convite inválido.");

  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token.data });
  if (error || !data) {
    back("/", "erro", "Convite inválido, expirado ou já usado. Peça um novo ao dono do espaço.");
  }

  await setActive(data as string);
  refresh();
  back("/espacos", "ok", "Você entrou no espaço.");
}

