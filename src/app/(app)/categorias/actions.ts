"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome da categoria.").max(60),
});

export async function createCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = schema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) back("/categorias", "erro", parsed.error.issues[0].message);

  const { error } = await supabase.from("categories").insert(parsed.data);
  if (error) {
    back(
      "/categorias",
      "erro",
      error.code === "23505"
        ? "Já existe uma categoria com esse nome."
        : "Não foi possível criar a categoria.",
    );
  }

  revalidatePath("/categorias");
  back("/categorias", "ok", "Categoria criada.");
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back("/categorias", "erro", "Categoria inválida.");

  // Lançamentos ficam sem categoria; regras que apontavam para ela são apagadas.
  const { error } = await supabase.from("categories").delete().eq("id", id.data);
  if (error) back("/categorias", "erro", "Não foi possível excluir a categoria.");

  revalidatePath("/categorias");
  back("/categorias", "ok", "Categoria excluída.");
}
