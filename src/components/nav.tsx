import Link from "next/link";
import { signOut } from "@/app/login/actions";

const links = [
  { href: "/", label: "Resumo" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/contas", label: "Contas" },
  { href: "/cartoes", label: "Cartões" },
  { href: "/categorias", label: "Categorias" },
];

export function Nav({ email }: { email: string | undefined }) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="ml-auto flex items-center gap-2 text-xs">
          <span className="hidden text-zinc-500 sm:inline">{email}</span>
          <button className="rounded border border-zinc-400 px-2 py-1">Sair</button>
        </form>
      </div>
    </header>
  );
}
