"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { signInMessage, signUpMessage } from "@/lib/auth-errors";
import { back } from "@/lib/flash";

const credentials = z.object({
  email: z.email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

function parse(formData: FormData) {
  return credentials.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
}

export async function signIn(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) back("/login", "erro", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) back("/login", "erro", signInMessage(error.code));

  redirect("/");
}

export async function signUp(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) back("/login", "erro", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) back("/login", "erro", signUpMessage(error.code));

  // Com confirmação de e-mail ligada no Supabase, não há sessão ainda.
  if (!data.session) {
    back("/login", "ok", "Conta criada. Confirme o e-mail para entrar.");
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
