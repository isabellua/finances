"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/previsao", label: "Próximos meses" },
  { href: "/previsao/pagar", label: "A pagar" },
  { href: "/previsao/faturas", label: "Faturas" },
  { href: "/previsao/calendario", label: "Calendário" },
  { href: "/previsao/anual", label: "Anual" },
];

export function PrevisaoTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Previsão" className="-mx-4 overflow-x-auto px-4 print:hidden">
      <ul className="flex w-max gap-1 rounded-xl bg-sunken p-1">
        {tabs.map((t) => {
          const on = t.href === "/previsao" ? pathname === "/previsao" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className="block min-h-10 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap text-ink-muted aria-[current=page]:bg-raised aria-[current=page]:text-ink aria-[current=page]:shadow-sm"
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
