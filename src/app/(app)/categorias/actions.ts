"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";

const style = z.object({
  name: z.string().trim().min(1, "Informe o nome da categoria.").max(60),
  // "" = cor automática
  color: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
  icon: z.string().trim().max(8),
});

function parse(formData: FormData) {
  return style.safeParse({
    name: formData.get("name") ?? "",
    color: formData.get("color") ?? "",
    icon: formData.get("icon") ?? "",
  });
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) back("/categorias", "erro", parsed.error.issues[0].message);

  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    color: parsed.data.color || null,
    icon: parsed.data.icon || null,
  });
  if (error) {
    back(
      "/categorias",
      "erro",
      error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria.",
    );
  }

  refresh();
  back("/categorias", "ok", "Categoria criada.");
}

export async function updateCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back("/categorias", "erro", "Categoria inválida.");
  const parsed = parse(formData);
  if (!parsed.success) back("/categorias", "erro", parsed.error.issues[0].message);

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      color: parsed.data.color || null,
      icon: parsed.data.icon || null,
    })
    .eq("id", id.data)
    .select("id");
  if (error) {
    back(
      "/categorias",
      "erro",
      error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível salvar.",
    );
  }
  if (!data?.length) back("/categorias", "erro", "Categoria não encontrada.");

  refresh();
  back("/categorias", "ok", "Categoria atualizada.");
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back("/categorias", "erro", "Categoria inválida.");

  // Lançamentos ficam sem categoria; regras que apontavam para ela são apagadas.
  const { error } = await supabase.from("categories").delete().eq("id", id.data);
  if (error) back("/categorias", "erro", "Não foi possível excluir a categoria.");

  refresh();
  back("/categorias", "ok", "Categoria excluída.");
}

