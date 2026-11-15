import { headers } from "next/headers";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/flash";
import { formatDateBR } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { KIND_LABELS, ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace";
import { removeMember } from "../espacos/actions";
import { createInvite, deleteWorkspace, revokeInvite, updateWorkspace } from "./actions";

type Member = { user_id: string; role: WorkspaceRole; email: string | null; created_at: string };
type Invite = { id: string; token: string; role: "editor" | "viewer"; note: string | null; expires_at: string };

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const sp = await searchParams;
  const { supabase, user, workspace, workspaces } = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const isOwner = workspace?.role === "owner";
  // Configurações são só do dono do espaço aberto. Quem é editor ou leitor volta ao início.
  if (!workspace || !isOwner) back("/", "erro", "Só o dono do espaço acessa as configurações.");

  const [{ data: members }, { data: invites }] = workspace
    ? await Promise.all([
        supabase
          .from("workspace_members")
          .select("user_id,role,email,created_at")
          .eq("workspace_id", workspace.id)
          .order("created_at")
          .overrideTypes<Member[]>(),
        isOwner
          ? supabase
              .from("workspace_invites")
              .select("id,token,role,note,expires_at")
              .eq("workspace_id", workspace.id)
              .gt("expires_at", new Date().toISOString())
              .order("created_at", { ascending: false })
              .overrideTypes<Invite[]>()
          : Promise.resolve({ data: [] as Invite[] }),
      ])
    : [{ data: [] as Member[] }, { data: [] as Invite[] }];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações do espaço"
        subtitle="Só você, como dono, vê esta página. Aqui você ajusta o espaço, quem participa e os convites."
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {workspace && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Configurar “{workspace.name}”</h2>
            {isOwner ? (
              <Card>
                <form action={updateWorkspace} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={workspace.id} />
                  <Field label="Nome">
                    <input name="name" required maxLength={60} defaultValue={workspace.name} className={inputCls} />
                  </Field>
                  <Field label="Tipo">
                    <select name="kind" defaultValue={workspace.kind} className={inputCls}>
                      {Object.entries(KIND_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Teto de gastos por mês (R$)" hint="Opcional. Usado para mostrar quanto já está comprometido.">
                    <input name="cap" inputMode="decimal" defaultValue={workspace.monthlyCapCents ? centsToInput(workspace.monthlyCapCents) : ""} className={inputCls} />
                  </Field>
                  <Field label="Meta de receita por mês (R$)" hint="Opcional.">
                    <input name="goal" inputMode="decimal" defaultValue={workspace.monthlyIncomeGoalCents ? centsToInput(workspace.monthlyIncomeGoalCents) : ""} className={inputCls} />
                  </Field>
                  <button className={`${btnPrimary} sm:col-span-2`}>Salvar</button>
                </form>
              </Card>
            ) : (
              <Empty>Só o dono pode alterar as configurações deste espaço.</Empty>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Quem participa</h2>
            <Card className="!p-0">
              <ul className="divide-y divide-line text-sm">
                {(members ?? []).map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {m.email ?? "Membro"}
                        {m.user_id === user.id && <span className="ml-2 text-xs font-normal text-ink-muted">(você)</span>}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {ROLE_LABELS[m.role]} · desde {formatDateBR(m.created_at.slice(0, 10))}
                      </p>
                    </div>
                    {(isOwner || m.user_id === user.id) && (
                      <form action={removeMember}>
                        <input type="hidden" name="ws" value={workspace.id} />
                        <input type="hidden" name="user" value={m.user_id} />
                        <input type="hidden" name="next" value="/configuracoes" />
                        <ConfirmButton
                          message={m.user_id === user.id ? "Sair deste espaço? Você perde o acesso aos dados dele." : `Remover ${m.email ?? "este membro"} do espaço?`}
                          className="text-xs text-ink-muted underline"
                        >
                          {m.user_id === user.id ? "Sair" : "Remover"}
                        </ConfirmButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {isOwner && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Convidar</h2>
              <p className="text-sm text-ink-muted">
                Gere um link e envie à pessoa (WhatsApp, e-mail…). Ela precisa ter uma conta no app. O link vale uma vez e expira em 7 dias; quem o tiver entra, então envie só a quem deve.
              </p>
              <Card>
                <form action={createInvite} className="grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="ws" value={workspace.id} />
                  <Field label="Acesso">
                    <select name="role" defaultValue="editor" className={inputCls}>
                      <option value="editor">Pode editar</option>
                      <option value="viewer">Somente leitura</option>
                    </select>
                  </Field>
                  <Field label="Para quem" hint="Opcional, só para você lembrar" className="sm:col-span-2">
                    <input name="note" maxLength={80} placeholder="Ex.: Ana, contador" className={inputCls} />
                  </Field>
                  <button className={`${btnPrimary} sm:col-span-3`}>Gerar link de convite</button>
                </form>
              </Card>

              {(invites ?? []).length > 0 && (
                <Card className="!p-0">
                  <ul className="divide-y divide-line text-sm">
                    {(invites ?? []).map((i) => (
                      <li key={i.id} className="flex flex-col gap-2 p-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{i.note || "Convite"} · {ROLE_LABELS[i.role]}</p>
                            <p className="text-xs text-ink-muted">expira em {formatDateBR(i.expires_at.slice(0, 10))}</p>
                          </div>
                          <form action={revokeInvite}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="text-xs text-ink-muted underline">Cancelar</button>
                          </form>
                        </div>
                        <input
                          readOnly
                          aria-label="Link do convite"
                          value={`${proto}://${host}/convite/${i.token}`}
                          className={`${inputCls} text-xs`}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          )}

          {isOwner && workspaces.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-neg">Zona de risco</h2>
              <Card>
                <form action={deleteWorkspace} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="id" value={workspace.id} />
                  <p className="min-w-48 flex-1 text-sm text-ink-muted">
                    Excluir “{workspace.name}” apaga todas as contas, cartões e lançamentos dele, para todos os membros. Não tem volta.
                  </p>
                  <ConfirmButton
                    message={`Excluir DEFINITIVAMENTE o espaço “${workspace.name}” e tudo o que há nele, para todos os membros?`}
                    className={`${btnGhost} text-neg`}
                  >
                    Excluir espaço
                  </ConfirmButton>
                </form>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
