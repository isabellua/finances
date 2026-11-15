import { LOGOS, initials, type Bank } from "@/lib/banks";

/** Logo do banco (SVG em public/banks) ou, sem arquivo, selo com a cor e as iniciais. */
export function BankLogo({
  bank,
  size = 40,
  label,
}: {
  bank: Bank;
  size?: number;
  label?: string;
}) {
  const style = { width: size, height: size, backgroundColor: bank.color, color: bank.ink };
  if (LOGOS.has(bank.slug)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/banks/${bank.slug}.svg`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-lg object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-bold"
    >
      {initials(label ?? bank.name)}
    </span>
  );
}
