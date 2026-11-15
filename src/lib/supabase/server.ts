import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente do Supabase para o servidor. Com `workspaceId`, toda consulta vai com o
 * cabeçalho `x-workspace-id`, que o banco usa (current_workspace) para escolher o espaço.
 * O banco só aceita espaços de que o usuário é membro; um id alheio resulta em zero dados.
 */
export async function createClient(workspaceId?: string) {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component (cookies são somente leitura).
          // O proxy.ts renova a sessão, então é seguro ignorar.
        }
      },
    },
    global: workspaceId ? { headers: { "x-workspace-id": workspaceId } } : undefined,
  });
}
