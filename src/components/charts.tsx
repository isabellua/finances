import { barScale, colorFor, donutSegments } from "@/lib/charts";

/**
 * Gráficos em SVG puro, sem dependência. Estrutura e acessibilidade ficam aqui;
 * o acabamento visual (cores, tipografia) é do design.
 */

export type DonutItem = { label: string; value: number; color?: string | null };

export function Donut({ items, size = 160, caption }: { items: DonutItem[]; size?: number; caption: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const segs = donutSegments(items.map((i) => i.value));

  return (
    <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={caption}>
      <title>{caption}</title>
      <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="22" />
      {segs.map((s) => (
        <circle
          key={s.index}
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={colorFor(s.index, items[s.index].color)}
          strokeWidth="22"
          strokeDasharray={`${s.fraction * c} ${c}`}
          strokeDashoffset={-s.offset * c}
          transform="rotate(-90 80 80)"
        >
          <title>{`${items[s.index].label}: ${Math.round(s.fraction * 100)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

export type BarGroup = { label: string; a: number; b?: number };

/** Barras agrupadas (ex.: receita × despesa por mês). */
export function BarGroups({
  groups,
  aLabel,
  bLabel,
  aColor = "#2f7d5b",
  bColor = "#c2503f",
  caption,
}: {
  groups: BarGroup[];
  aLabel: string;
  bLabel?: string;
  aColor?: string;
  bColor?: string;
  caption: string;
}) {
  const w = 24 * Math.max(groups.length, 1) * 2 + 16;
  const h = 120;
  const all = groups.flatMap((g) => [g.a, g.b ?? 0]);
  const scale = barScale(all);
  const bw = 8;

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full" role="img" aria-label={caption}>
        <title>{caption}</title>
        {groups.map((g, i) => {
          const x = 8 + i * 48;
          const ha = scale[i * 2] * h;
          const hb = scale[i * 2 + 1] * h;
          return (
            <g key={g.label}>
              <rect x={x} y={h - ha} width={bw} height={ha} rx="2" fill={aColor}><title>{`${g.label} · ${aLabel}`}</title></rect>
              {g.b !== undefined && (
                <rect x={x + bw + 3} y={h - hb} width={bw} height={hb} rx="2" fill={bColor}><title>{`${g.label} · ${bLabel}`}</title></rect>
              )}
              <text x={x + bw} y={h + 13} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.6">{g.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex gap-4 text-xs text-ink-muted">
        <span><span aria-hidden style={{ color: aColor }}>■</span> {aLabel}</span>
        {bLabel && <span><span aria-hidden style={{ color: bColor }}>■</span> {bLabel}</span>}
      </figcaption>
    </figure>
  );
}
