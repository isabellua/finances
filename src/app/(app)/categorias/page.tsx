import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PALETTE, colorFor } from "@/lib/charts";
import type { Category } from "@/lib/types";
import { createCategory, deleteCategory, updateCategory } from "./actions";

const COLOR_NAMES = ["Verde", "Laranja", "Azul", "Rosa", "Roxo", "Turquesa", "Dourado", "Vermelho", "Oliva", "Marrom", "Índigo", "Cinza"];

function ColorSelect({ value }: { value: string | null | undefined }) {
  return (
    <select name="color" defaultValue={value ?? ""} aria-label="Cor" className={inputCls}>
      <option value="">Cor automática</option>
      {PALETTE.map((hex, i) => (
        <option key={hex} value={hex}>{COLOR_NAMES[i]}</option>
      ))}
    </select>
  );
}

export default async function CategoriasPage({ searchParams }: PageProps<"/categorias">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("categories")
    .select("id,name,color,icon")
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

      <form action={createCategory} className="grid gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]">
        <input name="name" required maxLength={60} placeholder="Nova categoria" aria-label="Nome da nova categoria" className={inputCls} />
        <ColorSelect value="" />
        <input name="icon" maxLength={8} placeholder="Ícone" aria-label="Ícone (emoji)" className={inputCls} />
        <button className={`${btnPrimary} shrink-0`}>Adicionar</button>
      </form>

      {cats.length === 0 ? (
        <Empty>Nenhuma categoria.</Empty>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-line">
            {cats.map((c, i) => (
              <li key={c.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                    style={{ background: `${colorFor(i, c.color)}26`, color: colorFor(i, c.color) }}
                  >
                    {c.icon || c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton
                      message={`Excluir a categoria ${c.name}? Os lançamentos ficam sem categoria.`}
                      aria-label={`Excluir ${c.name}`}
                      className="rounded-md px-2 py-1 text-ink-subtle hover:text-neg"
                    >
                      ×
                    </ConfirmButton>
                  </form>
                </div>
                <details>
                  <summary className="w-fit cursor-pointer list-none text-xs font-medium text-accent-text underline">Editar</summary>
                  <form action={updateCategory} className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]">
                    <input type="hidden" name="id" value={c.id} />
                    <Field label="Nome"><input name="name" required maxLength={60} defaultValue={c.name} className={inputCls} /></Field>
                    <Field label="Cor"><ColorSelect value={c.color} /></Field>
                    <Field label="Ícone"><input name="icon" maxLength={8} defaultValue={c.icon ?? ""} className={inputCls} /></Field>
                    <button className={`${btnPrimary} self-end`}>Salvar</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
