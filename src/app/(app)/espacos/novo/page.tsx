import { Flash, str } from "@/components/flash";
import { Card, Field, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { KIND_LABELS } from "@/lib/workspace";
import { createWorkspace } from "../actions";

export default async function NovoEspacoPage({ searchParams }: PageProps<"/espacos/novo">) {
  const sp = await searchParams;
  await requireUser();
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <PageHeader
        title="Novo espaço"
        subtitle="Cada espaço tem suas próprias contas, cartões, categorias e lançamentos. Use um para o pessoal, outro para o trabalho, a família ou amigos."
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />
      <Card>
        <form action={createWorkspace} className="flex flex-col gap-3">
          <Field label="Nome">
            <input name="name" required maxLength={60} placeholder="Ex.: Empresa, Casa, Viagem" autoFocus className={inputCls} />
          </Field>
          <Field label="Tipo">
            <select name="kind" defaultValue="other" className={inputCls}>
              {Object.entries(KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <button className={btnPrimary}>Criar e abrir</button>
        </form>
      </Card>
    </div>
  );
}
