import { CheckCircle, WarningCircle } from "@phosphor-icons/react/ssr";

export function Flash({ erro, ok }: { erro?: string; ok?: string }) {
  return (
    <>
      {erro && (
        <p role="alert" className="flex items-start gap-3 rounded-xl bg-neg-tint px-4 py-3 text-sm text-neg">
          <WarningCircle size={20} className="mt-px shrink-0" aria-hidden />
          <span>{erro}</span>
        </p>
      )}
      {ok && (
        <p role="status" className="flex items-start gap-3 rounded-xl bg-pos-tint px-4 py-3 text-sm text-pos">
          <CheckCircle size={20} className="mt-px shrink-0" aria-hidden />
          <span>{ok}</span>
        </p>
      )}
    </>
  );
}

export function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
