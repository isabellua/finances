"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";

const links = [
  { href: "/", label: "Resumo", icon: "◔" },
  { href: "/lancamentos", label: "Lançamentos", icon: "≡" },
  { href: "/importar", label: "Importar", icon: "⇪" },
  { href: "/contas", label: "Contas", icon: "▣" },
  { href: "/categorias", label: "Categorias", icon: "◈" },
];

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ email }: { email: string | undefined }) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-emerald-700">
            Finanças
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Principal">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active(pathname, l.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active(pathname, l.href)
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-2 text-xs">
            <span className="hidden max-w-48 truncate text-zinc-500 sm:inline">{email}</span>
            <button className="rounded-lg border border-zinc-300 px-2.5 py-1.5 dark:border-zinc-700">
              Sair
            </button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-950"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(pathname, l.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              active(pathname, l.href) ? "text-emerald-700" : "text-zinc-500"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
