import { LOGOS, initials, type Bank } from "@/lib/banks";

/** Logo do banco (SVG em public/banks) ou, sem arquivo, selo com a cor e as iniciais. */
export function BankLogo({ bank, size = 40, label }: { bank: Bank; size?: number; label?: string }) {
  const logo = LOGOS[bank.slug];
  if (logo) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, padding: logo.bleed ? 0 : Math.round(size * 0.12) }}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${
          logo.bleed ? "" : "border border-line bg-white"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/banks/${bank.slug}.svg`} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: bank.color, color: bank.ink, fontSize: Math.round(size * 0.36) }}
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold"
    >
      {initials(label ?? bank.name)}
    </span>
  );
}
