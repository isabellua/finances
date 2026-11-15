import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, PageHeader, btnGhost } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { KIND_LABELS, ROLE_LABELS } from "@/lib/workspace";
import { removeMember } from "../espacos/actions";

export default async function MaisPage({ searchParams }: PageProps<"/mais">) {
  const sp = await searchParams;
  const { user, workspace, workspaces } = await requireUser();
  const isOwner = workspace?.role === "owner";

  const links = [
    { href: "/importar", title: "Importar extrato ou fatura", text: "Arquivos OFX ou CSV do banco." },
    { href: "/categorias", title: "Categorias", text: "Crie, renomeie e escolha cor e ícone." },
    { href: "/saude", title: "Saúde financeira", text: "Nota de 0 a 100 e de onde ela vem." },
    ...(isOwner ? [{ href: "/configuracoes", title: "Configurações do espaço", text: "Nome, teto, meta, membros e convites." }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mais" />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>
              <Card className="flex flex-col gap-0.5 hover:bg-sunken">
                <p className="font-medium">{l.title}</p>
                <p className="text-sm text-ink-muted">{l.text}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Seus espaços</h2>
        <ul className="flex flex-col gap-2">
          {workspaces.map((w) => (
            <Card key={w.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {w.name}
                  {w.id === workspace?.id && <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-text">aberto</span>}
                </p>
                <p className="text-xs text-ink-muted">{KIND_LABELS[w.kind]} · {ROLE_LABELS[w.role]}</p>
              </div>
              {w.id !== workspace?.id && (
                <form method="post" action="/espaco/trocar">
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="next" value="/" />
                  <button className={btnGhost}>Abrir</button>
                </form>
              )}
              {w.role !== "owner" && (
                <form action={removeMember}>
                  <input type="hidden" name="ws" value={w.id} />
                  <input type="hidden" name="user" value={user.id} />
                  <input type="hidden" name="next" value="/mais" />
                  <ConfirmButton message={`Sair do espaço “${w.name}”? Você perde o acesso aos dados dele.`} className="text-xs text-ink-muted underline">
                    Sair
                  </ConfirmButton>
                </form>
              )}
            </Card>
          ))}
        </ul>
        <Link href="/espacos/novo" className={`${btnGhost} w-fit`}>+ Novo espaço</Link>
      </section>

      <p className="text-sm text-ink-muted">Conectado como {user.email}</p>
    </div>
  );
}
