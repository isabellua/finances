import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Uma verificação de login por requisição. `cache` do React compartilha o resultado
 * entre o layout e a página, que antes consultavam o Supabase cada um por conta própria.
 *
 * `getClaims` valida a assinatura do token localmente quando o projeto usa chaves
 * assimétricas (e consulta o servidor de autenticação nos demais casos), em vez de
 * sempre fazer uma ida e volta de rede como `getUser`.
 *
 * Contrapartida: uma sessão revogada continua valendo até o token expirar (até 1 h
 * por padrão). Os dados seguem protegidos pela RLS do banco, que valida o mesmo token.
 */
const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, claims: data?.claims ?? null };
});

/** Retorna o cliente Supabase e o usuário autenticado, ou redireciona para /login. */
export async function requireUser() {
  const { supabase, claims } = await getSession();
  if (!claims) redirect("/login");
  return { supabase, user: { id: claims.sub, email: claims.email } };
}
