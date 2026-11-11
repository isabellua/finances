"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bank,
  CalendarCheck,
  ChartDonut,
  CurrencyCircleDollar,
  DotsThree,
  ListBullets,
  Tag,
  UploadSimple,
  type Icon,
} from "@phosphor-icons/react";
import { signOut } from "@/app/login/actions";

const links: { href: string; label: string; Icon: Icon; primary: boolean }[] = [
  { href: "/", label: "Resumo", Icon: ChartDonut, primary: true },
  { href: "/lancamentos", label: "Lançamentos", Icon: ListBullets, primary: true },
  { href: "/pagar", label: "A pagar", Icon: CalendarCheck, primary: true },
  { href: "/importar", label: "Importar", Icon: UploadSimple, primary: true },
  { href: "/contas", label: "Contas", Icon: Bank, primary: true },
  { href: "/cambio", label: "Câmbio", Icon: CurrencyCircleDollar, primary: false },
  { href: "/categorias", label: "Categorias", Icon: Tag, primary: false },
];

// No celular, o que não cabe na barra fica atrás de "Mais".
const MORE = { href: "/mais", label: "Mais", Icon: DotsThree };

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ email }: { email: string | undefined }) {
  const pathname = usePathname();
  const moreActive = links.some((x) => !x.primary && active(pathname, x.href));

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-raised">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-6 px-4">
          <Link href="/" className="text-[19px] font-[650] tracking-[-0.4px] text-ink">
            Finanças
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Principal">
            {links.map(({ href, label, Icon: I }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(pathname, href) ? "page" : undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-sunken aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-text"
              >
                <I size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-2 text-xs">
            <span className="hidden max-w-48 truncate text-ink-subtle sm:inline">{email}</span>
            <button className="min-h-9 rounded-lg border border-line-strong px-3 text-ink hover:bg-sunken">
              Sair
            </button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {[...links.filter((l) => l.primary), MORE].map(({ href, label, Icon: I }) => {
          const on = active(pathname, href) || (href === MORE.href && moreActive);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className="group flex min-h-11 flex-col items-center gap-0.5 pt-1.5 pb-2 text-[11px] leading-[14px] font-medium text-ink-subtle aria-[current=page]:text-accent-text"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full group-aria-[current=page]:bg-accent-tint">
                <I size={22} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
