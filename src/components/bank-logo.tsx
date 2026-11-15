import { LOGOS, initials, type Bank } from "@/lib/banks";

/** Logo do banco (SVG transparente em public/banks) sobre a cor do banco ou, sem arquivo, selo com iniciais. */
export function BankLogo({ bank, size = 40, label }: { bank: Bank; size?: number; label?: string }) {
  const logo = LOGOS[bank.slug];
  if (logo) {
    const white = logo.tile === "white";
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          padding: Math.round(size * 0.16),
          backgroundColor: white ? "#FFFFFF" : bank.color,
        }}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${white ? "border border-line" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/banks/${bank.slug}.svg`}
          alt=""
          style={logo.mono ? { filter: "brightness(0) invert(1)" } : undefined}
          className="h-full w-full object-contain"
        />
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
