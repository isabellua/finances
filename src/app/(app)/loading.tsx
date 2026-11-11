/**
 * Aparece na hora ao trocar de página, enquanto o servidor monta a tela nova.
 * Sem isto, o clique parecia não fazer nada até a resposta chegar.
 */
export default function Loading() {
  const bar = "motion-safe:animate-pulse rounded-xl bg-sunken";
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className={`${bar} h-8 w-48`} />
      <div className={`${bar} h-28`} />
      <div className="grid grid-cols-3 gap-2">
        <div className={`${bar} h-20`} />
        <div className={`${bar} h-20`} />
        <div className={`${bar} h-20`} />
      </div>
      <div className={`${bar} h-48`} />
    </div>
  );
}
