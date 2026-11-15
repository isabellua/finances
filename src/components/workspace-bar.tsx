"use client";

import { usePathname } from "next/navigation";
import { switchWorkspace } from "@/app/(app)/espacos/actions";
import { KIND_LABELS, ROLE_LABELS, type Workspace } from "@/lib/workspace";

/**
 * Seletor do espaço ativo. Estrutura simples de propósito (details + formulários);
 * o visual definitivo fica com o design. Cada botão troca o espaço e volta à mesma tela.
 */
export function WorkspaceBar({ workspaces, activeId }: { workspaces: Workspace[]; activeId: string | undefined }) {
  const pathname = usePathname();
  const active = workspaces.find((w) => w.id === activeId);
  if (!active) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" data-testid="workspace-bar">
      <details className="relative">
        <summary
          className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-line-strong bg-raised px-3 font-medium"
          aria-label={`Espaço atual: ${active.name}. Trocar de espaço`}
        >
          <span className="text-ink-muted">Espaço:</span> {active.name}
          <span aria-hidden className="text-ink-subtle">▾</span>
        </summary>
        <ul className="absolute z-30 mt-1 flex min-w-64 flex-col gap-1 rounded-xl border border-line bg-raised p-2 shadow-lg">
          {workspaces.map((w) => (
            <li key={w.id}>
              <form action={switchWorkspace}>
                <input type="hidden" name="id" value={w.id} />
                <input type="hidden" name="next" value={pathname} />
                <button
                  aria-current={w.id === activeId ? "true" : undefined}
                  className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-sunken aria-[current=true]:bg-accent-tint"
                >
                  <span className="font-medium">{w.name}</span>
                  <span className="text-xs text-ink-muted">{KIND_LABELS[w.kind]} · {ROLE_LABELS[w.role]}</span>
                </button>
              </form>
            </li>
          ))}
          <li className="border-t border-line pt-1">
            <a href="/espacos" className="block rounded-lg px-3 py-2 text-ink-muted hover:bg-sunken">Gerenciar espaços…</a>
          </li>
        </ul>
      </details>
      {active.role === "viewer" && (
        <span role="status" className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-muted">
          Somente leitura: você pode ver, mas não alterar este espaço.
        </span>
      )}
    </div>
  );
}
