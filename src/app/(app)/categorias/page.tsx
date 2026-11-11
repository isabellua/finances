import { Flash, str } from "@/components/flash";
import { Card, Empty, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { requireUser } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { createCategory, deleteCategory } from "./actions";

export default async function CategoriasPage({ searchParams }: PageProps<"/categorias">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("categories")
    .select("id,name")
    .order("name")
    .overrideTypes<Category[]>();
  const cats = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias"
        subtitle="Servem para entradas e saídas. Excluir uma categoria não apaga os lançamentos."
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      <form action={createCategory} className="flex gap-2">
        <input name="name" required maxLength={60} placeholder="Nova categoria" aria-label="Nome da nova categoria" className={inputCls} />
        <button className={`${btnPrimary} shrink-0`}>Adicionar</button>
      </form>

      {cats.length === 0 ? (
        <Empty>Nenhuma categoria.</Empty>
      ) : (
        <Card>
          <ul className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-full border border-line-strong py-1 pr-1 pl-3 text-sm">
                {c.name}
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton
                    message={`Excluir a categoria ${c.name}? Os lançamentos ficam sem categoria.`}
                    aria-label={`Excluir ${c.name}`}
                    className="rounded-full px-2 text-ink-subtle hover:text-neg"
                  >
                    ×
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
