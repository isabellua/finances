export function Flash({ erro, ok }: { erro?: string; ok?: string }) {
  return (
    <>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {ok}
        </p>
      )}
    </>
  );
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
