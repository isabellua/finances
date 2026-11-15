import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash, str } from "@/components/flash";
import { Card, Empty, Field, PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PALETTE, colorFor } from "@/lib/charts";
import type { Category } from "@/lib/types";
import { createCategory, deleteCategory, updateCategory } from "./actions";

const COLOR_NAMES = ["Verde", "Laranja", "Azul", "Rosa", "Roxo", "Turquesa", "Dourado", "Vermelho", "Oliva", "Marrom", "Índigo", "Cinza"];

/** Escolha de cor por bolinhas. "Automática" deixa o app escolher uma da paleta. */
function Swatches({ value }: { value: string | null | undefined }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Cor</legend>
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer">
          <input type="radio" name="color" value="" defaultChecked={!value} className="peer sr-only" />
          <span className="flex h-9 items-center rounded-full border border-line-strong px-3 text-xs peer-checked:border-ink peer-checked:bg-sunken peer-focus-visible:outline-2">Automática</span>
        </label>
        {PALETTE.map((hex, i) => (
          <label key={hex} className="cursor-pointer" title={COLOR_NAMES[i]}>
            <input type="radio" name="color" value={hex} defaultChecked={value === hex} className="peer sr-only" aria-label={COLOR_NAMES[i]} />
            <span className="block h-9 w-9 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-raised peer-checked:ring-ink peer-focus-visible:ring-focus" style={{ background: hex }} />
          </label>
        ))}
      </div>
    </fieldset>
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

  const editingId = str(sp.editar);
  const editing = cats.find((c) => c.id === editingId);
  const creating = str(sp.novo) === "1";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        title="Categorias"
        subtitle="Servem para entradas e saídas. Toque em uma para editar."
        action={!creating && !editing ? <Link href="/categorias?novo=1" className={btnPrimary}>+ Nova</Link> : undefined}
      />
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />

      {creating && (
        <Card>
          <form action={createCategory} className="flex flex-col gap-4">
            <h2 className="font-semibold">Nova categoria</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field label="Nome"><input name="name" required maxLength={60} autoFocus className={inputCls} /></Field>
              <Field label="Ícone" hint="Um emoji (opcional)"><input name="icon" maxLength={8} className={inputCls} /></Field>
            </div>
            <Swatches value="" />
            <div className="flex gap-2">
              <button className={btnPrimary}>Criar</button>
              <Link href="/categorias" className={btnGhost}>Cancelar</Link>
            </div>
          </form>
        </Card>
      )}

      {editing && (
        <Card className="flex flex-col gap-4">
          <form action={updateCategory} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={editing.id} />
            <h2 className="font-semibold">Editar categoria</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <Field label="Nome"><input name="name" required maxLength={60} defaultValue={editing.name} autoFocus className={inputCls} /></Field>
              <Field label="Ícone" hint="Um emoji (opcional)"><input name="icon" maxLength={8} defaultValue={editing.icon ?? ""} className={inputCls} /></Field>
            </div>
            <Swatches value={editing.color} />
            <div className="flex gap-2">
              <button className={btnPrimary}>Salvar</button>
              <Link href="/categorias" className={btnGhost}>Cancelar</Link>
            </div>
          </form>
          <form action={deleteCategory} className="border-t border-line pt-3">
            <input type="hidden" name="id" value={editing.id} />
            <ConfirmButton message={`Excluir a categoria ${editing.name}? Os lançamentos ficam sem categoria.`} className={`${btnGhost} text-neg`}>
              Excluir categoria
            </ConfirmButton>
          </form>
        </Card>
      )}

      {cats.length === 0 ? (
        <Empty>Nenhuma categoria. Toque em “+ Nova”.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-raised">
          {cats.map((c, i) => {
            const color = colorFor(i, c.color);
            return (
              <li key={c.id}>
                <Link
                  href={`/categorias?editar=${c.id}`}
                  aria-current={c.id === editing?.id ? "true" : undefined}
                  className="flex min-h-14 items-center gap-3 p-3 hover:bg-sunken aria-[current=true]:bg-accent-tint"
                >
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: `${color}26`, color }}>
                    {c.icon || c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span aria-hidden className="text-ink-subtle">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
