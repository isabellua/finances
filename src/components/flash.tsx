export function Flash({ erro, ok }: { erro?: string; ok?: string }) {
  return (
    <>
      {erro && (
        <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="rounded bg-green-100 p-3 text-sm text-green-800">
          {ok}
        </p>
      )}
    </>
  );
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
