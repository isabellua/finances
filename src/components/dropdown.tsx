"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menu suspenso simples: abre no clique, fecha ao clicar fora, com Esc e ao trocar de página.
 * (Um <details> não fecha sozinho depois de uma navegação feita pelo roteador.)
 */
export function Dropdown({
  label,
  children,
  align = "left",
  buttonClassName = "",
  ariaLabel,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  buttonClassName?: string;
  ariaLabel?: string;
}) {
  // Guarda em que página o menu foi aberto: ao navegar, deixa de valer e ele fecha sozinho.
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    setOpenAt(next ? pathname : null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-40 mt-2 flex min-w-60 flex-col gap-0.5 rounded-xl border border-line bg-raised p-1.5 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const menuItemCls =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sunken";
