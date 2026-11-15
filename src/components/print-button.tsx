"use client";

/** Abre a impressão do navegador, de onde dá para "Salvar como PDF". O menu some na impressão. */
export function PrintButton({ label = "Imprimir / salvar PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-10 rounded-lg border border-line-strong bg-raised px-3 text-sm text-ink-muted hover:bg-sunken print:hidden"
    >
      {label}
    </button>
  );
}
