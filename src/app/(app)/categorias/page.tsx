import { Flash, str } from "@/components/flash";
import { requireUser } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { createCategory, deleteCategory } from "./actions";

function Section({ title, items }: { title: string; items: Category[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-1 rounded-full border border-zinc-300 py-1 pr-1 pl-3 text-sm dark:border-zinc-700">
            {c.name}
            <form action={deleteCategory}>
              <input type="hidden" name="id" value={c.id} />
              <button aria-label={`Excluir ${c.name}`} className="rounded-full px-2 text-zinc-500 hover:text-red-700">
                ×
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CategoriasPage({
  searchParams,
}: PageProps<"/categorias">) {
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("categories")
    .select("id,name,kind")
    .order("name")
    .overrideTypes<Category[]>();
  const cats = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Categorias</h1>
      <Flash erro={str(sp.erro)} ok={str(sp.ok)} />
      <Section title="Saídas" items={cats.filter((c) => c.kind === "expense")} />
      <Section title="Entradas" items={cats.filter((c) => c.kind === "income")} />

      <form action={createCategory} className="flex flex-wrap items-end gap-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          Nome
          <input name="name" required maxLength={60} className="rounded border border-zinc-300 bg-white p-2 text-black" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select name="kind" className="rounded border border-zinc-300 bg-white p-2 text-black">
            <option value="expense">Saída</option>
            <option value="income">Entrada</option>
          </select>
        </label>
        <button className="rounded bg-emerald-700 px-4 py-2 font-medium text-white">Adicionar</button>
      </form>
    </div>
  );
}
