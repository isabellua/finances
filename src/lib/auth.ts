import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  WS_COOKIE,
  pickWorkspace,
  type Workspace,
  type WorkspaceKind,
  type WorkspaceRole,
} from "@/lib/workspace";

type MemberRow = {
  role: WorkspaceRole;
  workspaces: {
    id: string;
    name: string;
    kind: WorkspaceKind;
    monthly_cap_cents: number | null;
    monthly_income_goal_cents: number | null;
  } | null;
};

/**
 * Uma verificação de login e uma resolução de espaço por requisição (cache do React:
 * layout e página compartilham o resultado).
 *
 * `getClaims` valida a assinatura do token localmente quando o projeto usa chaves
 * assimétricas (e consulta o servidor de autenticação nos demais casos). Contrapartida:
 * sessão revogada vale até o token expirar (até 1 h); os dados seguem protegidos pela
 * RLS, que valida o mesmo token.
 */
const getSession = cache(async () => {
  // Cliente sem espaço: serve para descobrir quais espaços o usuário tem.
  const base = await createClient();
  const { data } = await base.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims) return { supabase: base, claims: null, workspace: null, workspaces: [] as Workspace[] };

  const { data: rows } = await base
    .from("workspace_members")
    .select("role, workspaces(id,name,kind,monthly_cap_cents,monthly_income_goal_cents)")
    .order("created_at")
    .order("workspace_id")
    .overrideTypes<MemberRow[]>();

  const workspaces: Workspace[] = (rows ?? [])
    .filter((r) => r.workspaces)
    .map((r) => ({
      id: r.workspaces!.id,
      name: r.workspaces!.name,
      kind: r.workspaces!.kind,
      role: r.role,
      monthlyCapCents: r.workspaces!.monthly_cap_cents,
      monthlyIncomeGoalCents: r.workspaces!.monthly_income_goal_cents,
    }));

  const cookieId = (await cookies()).get(WS_COOKIE)?.value;
  const workspace = pickWorkspace(workspaces, cookieId);
  // Cliente com o espaço ativo: todas as consultas e gravações passam a valer nele.
  const supabase = workspace ? await createClient(workspace.id) : base;
  return { supabase, claims, workspace, workspaces };
});

/** Cliente do Supabase (já no espaço ativo), usuário, espaço ativo e lista de espaços. */
export async function requireUser() {
  const { supabase, claims, workspace, workspaces } = await getSession();
  if (!claims) redirect("/login");
  return {
    supabase,
    user: { id: claims.sub, email: claims.email },
    workspace,
    workspaces,
  };
}
