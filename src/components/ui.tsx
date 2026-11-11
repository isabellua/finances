import type { ReactNode } from "react";

export const inputCls =
  "min-h-11 w-full rounded-lg border border-line-strong bg-raised px-3 py-2.5 text-base text-ink placeholder:text-ink-subtle focus:border-focus focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-neg";

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition duration-150 ease-out active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55";

export const btnPrimary = `${btnBase} bg-accent px-4 py-2.5 text-[15px] text-on-accent shadow-[inset_0_-2px_0_rgb(20_23_28/0.16)] hover:brightness-95`;

export const btnGhost = `${btnBase} border border-line-strong px-3 py-2 text-sm text-ink hover:bg-sunken`;

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-raised p-4 ${className}`}>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium ${className}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-ink-subtle">{hint}</span>}
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] leading-8 font-semibold tracking-[-0.6px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}
