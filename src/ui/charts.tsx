import { useEffect, useRef, useState } from 'react';

/** The element's width in CSS pixels, so SVG text stays at its real size instead of scaling with the chart. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Small chart kit for the owner pages (dark surface). Mark specs follow the data-viz method:
 * bars <= 24px with a 4px rounded data end, 2px surface gaps between stacked segments,
 * hairline recessive grid, values/labels in text colors (never the series color),
 * a legend for 2+ series, and a hover tooltip on every mark.
 * Series colors (validated on the dark surface #1e1c1b): blue #3987e5, orange #d95926.
 */
export const SERIES = ['#3987e5', '#d95926'];
const GRID = '#3a3532';
const MUTED = '#9b938b';
const SURFACE = '#1e1c1b';
/** Status colors are only used together with a text label (Look into / Worth a look). */
export const STATUS = { bad: '#e66767', warn: '#d9a53a' };

function Tip({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-pre rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg ring-1 ring-slate-700"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
    >
      {tip.text}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-300">
      {items.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  /** Worse than the team: drawn in a status color, and the label says so. */
  tone?: 'bad' | 'warn';
  sub?: string;
  onClick?: () => void;
}

/** Horizontal bars, one per person, with the team's middle (median) as a hairline. */
export function HBarChart({ rows, fmt, median = true, caption }: { rows: BarRow[]; fmt: (n: number) => string; median?: boolean; caption?: string }) {
  const vals = rows.map((r) => r.value).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!vals.length) return null;
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals) || 1;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return (
    <figure className="space-y-1.5" data-testid="hbar-chart">
      {caption && <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400">{caption}</figcaption>}
      <div className="relative">
        {median && vals.length >= 3 && (
          <div className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `calc(10.5rem + (100% - 20rem) * ${pct(mid) / 100})` }}>
            <div className="h-full w-px" style={{ background: MUTED }} />
            <div className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400">team middle {fmt(mid)}</div>
          </div>
        )}
        <div className="space-y-1 pt-4">
          {rows.map((r) => {
            const v = r.value;
            const color = r.tone ? STATUS[r.tone] : SERIES[0];
            const zero = pct(0);
            const left = v === null ? zero : Math.min(zero, pct(v));
            const width = v === null ? 0 : Math.max(0.6, Math.abs(pct(v) - zero));
            return (
              <div
                key={r.key}
                className={`group flex items-center gap-2 rounded-md py-0.5 ${r.onClick ? 'cursor-pointer hover:bg-slate-800/60' : ''}`}
                title={`${r.label}: ${v === null ? 'not enough data' : fmt(v)}${r.sub ? `\n${r.sub}` : ''}`}
                onClick={r.onClick}
              >
                <div className="w-40 shrink-0 truncate text-right text-xs text-slate-200">
                  {r.label}
                </div>
                <div className="relative h-4 flex-1">
                  {v !== null && (
                    <div
                      className="absolute top-1/2 h-3.5 -translate-y-1/2 transition-opacity group-hover:opacity-80"
                      style={{ left: `${left}%`, width: `${width}%`, background: color, borderRadius: v >= 0 ? '0 4px 4px 0' : '4px 0 0 4px' }}
                    />
                  )}
                </div>
                <div className="flex w-36 shrink-0 items-baseline justify-end gap-1.5 text-right">
                  {r.tone && <span className={`text-[10px] font-semibold ${r.tone === 'bad' ? 'text-rose-300' : 'text-amber-300'}`}>{r.tone === 'bad' ? '● look into' : '● above team'}</span>}
                  <span className="w-14 text-xs font-bold tabular-nums text-slate-100">{v === null ? '–' : fmt(v)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </figure>
  );
}

export interface ColumnPoint {
  label: string;
  values: number[];
  title?: string;
}

/** Columns over time (days or weeks), stacked when there are several series. */
export function ColumnChart({ points, series, height = 150, fmt = (n: number) => String(Math.round(n)), caption }: { points: ColumnPoint[]; series: { name: string; color: string }[]; height?: number; fmt?: (n: number) => string; caption?: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [box, boxW] = useWidth(560);
  if (!points.length) return null;
  const totals = points.map((p) => p.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const W = Math.max(boxW, points.length * 8 + 30);
  const H = height;
  const padL = 30;
  const padB = 20;
  const plotH = H - padB - 6;
  const band = (W - padL) / points.length;
  const bw = Math.min(24, band * 0.7);
  const y = (v: number) => 6 + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - padL) / 48))));
  return (
    <figure className="space-y-2" data-testid="column-chart">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {caption && <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400">{caption}</figcaption>}
        {series.length > 1 && <Legend items={series} />}
      </div>
      <div ref={box} className="relative overflow-x-auto" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={caption}>
          {[0, top / 2, top].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = padL + band * i + band / 2;
            let acc = 0;
            const segs = p.values.map((v, s) => {
              const y0 = y(acc);
              acc += v;
              const y1 = y(acc);
              return { s, v, y0, y1 };
            });
            const last = [...segs].reverse().find((g) => g.v > 0);
            return (
              <g
                key={i}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: ((cx / W) * box.width), y: (y(acc) / H) * box.height, text: p.title ?? `${p.label}\n${series.map((s, k) => `${s.name}: ${fmt(p.values[k] ?? 0)}`).join('\n')}` });
                }}
              >
                <rect x={cx - band / 2} y={0} width={band} height={H - padB} fill="transparent" />
                {segs.map((g) => {
                  if (g.v <= 0) return null;
                  const h = Math.max(1, g.y0 - g.y1 - (g === last ? 0 : 2));
                  const isTop = g === last;
                  const r = Math.min(4, h, bw / 2);
                  const x0 = cx - bw / 2;
                  const yt = g.y1;
                  const d = isTop
                    ? `M${x0},${yt + h} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${yt + h} Z`
                    : `M${x0},${yt + 2} h${bw} v${h} h${-bw} Z`;
                  return <path key={g.s} d={d} fill={series[g.s]?.color ?? SERIES[0]} />;
                })}
                {i % every === 0 && (
                  <text x={cx} y={H - 5} textAnchor="middle" fontSize={10} fill={MUTED}>
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="#57504a" strokeWidth={1} />
        </svg>
        <Tip tip={tip} />
      </div>
    </figure>
  );
}

/** Weekday x hour grid: one hue, light to strong. Shows when things happen. */
export function HeatGrid({ values, caption, unit = 'flags', fromHour = 10 }: { values: number[][]; caption?: string; unit?: string; fromHour?: number }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 - fromHour }, (_, i) => i + fromHour); // default 10 AM - 11 PM (opening hours)
  const max = Math.max(1, ...values.flat());
  const label = (h: number) => (h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`);
  return (
    <figure className="space-y-2" data-testid="heat-grid">
      {caption && <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400">{caption}</figcaption>}
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h} className="w-7 text-center text-[10px] font-normal text-slate-500">
                  {label(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, di) => (
              <tr key={d}>
                <td className="pr-1.5 text-right text-[11px] text-slate-400">{d}</td>
                {hours.map((h) => {
                  const v = values[di]?.[h] ?? 0;
                  const a = v ? 0.18 + 0.82 * (v / max) : 0;
                  return (
                    <td
                      key={h}
                      title={`${d} ${label(h)}: ${v} ${unit}`}
                      className="h-6 w-7 rounded-[3px] text-center text-[10px] font-bold text-white/90"
                      style={{ background: v ? `rgba(57,135,229,${a})` : '#26231f' }}
                    >
                      {v && v / max >= 0.5 ? v : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A single line over time (e.g. average Test score per week), 0-100 scale. */
export function LineChart({ points, caption, fmt = (n: number) => String(Math.round(n)), max = 100 }: { points: { label: string; value: number | null; sub?: string }[]; caption?: string; fmt?: (n: number) => string; max?: number }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [box, W] = useWidth(560);
  const pts = points.filter((p) => p.value !== null);
  if (pts.length < 2) return null;
  const H = 150;
  const padL = 30;
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - 12);
  const y = (v: number) => 16 + (1 - v / max) * (H - 38);
  const line = points.map((p, i) => (p.value === null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean).join(' ');
  return (
    <figure className="space-y-2" data-testid="line-chart">
      {caption && <figcaption className="text-xs font-semibold uppercase tracking-wider text-slate-400">{caption}</figcaption>}
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={caption}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 12} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>
                {fmt(t)}
              </text>
            </g>
          ))}
          <polyline points={line} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) =>
            p.value === null ? null : (
              <g
                key={i}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: (x(i) / W) * box.width, y: (y(p.value!) / H) * box.height, text: `${p.label}: ${fmt(p.value!)}${p.sub ? `\n${p.sub}` : ''}` });
                }}
              >
                <circle cx={x(i)} cy={y(p.value)} r={12} fill="transparent" />
                <circle cx={x(i)} cy={y(p.value)} r={4.5} fill={SERIES[0]} stroke={SURFACE} strokeWidth={2} />
              </g>
            ),
          )}
          {points.map((p, i) =>
            i % Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(W / 60)))) === 0 || i === points.length - 1 ? (
              <text key={`l${i}`} x={x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill={MUTED}>
                {p.label}
              </text>
            ) : null,
          )}
          {/* Label the latest value only. */}
          {(() => {
            const li = points.map((p) => p.value !== null).lastIndexOf(true);
            return li >= 0 ? (
              <text x={x(li)} y={y(points[li].value!) - 10} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#f0efec">
                {fmt(points[li].value!)}
              </text>
            ) : null;
          })()}
        </svg>
        <Tip tip={tip} />
      </div>
    </figure>
  );
}
