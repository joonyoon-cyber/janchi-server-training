import { useMemo, useState } from 'react';
import { ColumnChart, HBarChart, HeatGrid, STATUS, type BarRow } from '../ui/charts';
import { robustZ, type CheckResult, type Metric } from './checks';
import { People } from './people';

export function fmtMetric(v: number, f: Metric['fmt']) {
  if (f === 'money') return `$${Math.round(v).toLocaleString()}`;
  if (f === 'pct') return `${v.toFixed(v < 10 ? 1 : 0)}%`;
  if (f === 'pts') return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

const dayLabel = (d: Date) => d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });

/**
 * Charts for one check: the chosen measure per person against the team's middle, and
 * when the flagged entries happened (by day, and by weekday x hour).
 */
export function CheckCharts({ result, people, onPerson }: { result: CheckResult; people: People; onPerson: (emp: string) => void }) {
  const choices = result.metrics.filter((m) => m.worse || ['amt', 'n', 'extra', 'zero'].includes(m.key));
  const [key, setKey] = useState(choices.find((m) => m.worse)?.key ?? choices[0]?.key);
  const metric = result.metrics.find((m) => m.key === key);

  const bars: BarRow[] = useMemo(() => {
    if (!metric) return [];
    const zs = metric.worse ? robustZ(result.rows.map((r) => r.values[metric.key] ?? null)) : [];
    return result.rows
      .map((r, i) => {
        const z = zs[i] ?? null;
        const worse = z === null ? null : metric.worse === 'high' ? z : -z;
        return {
          key: r.emp,
          label: people.name(r.emp),
          value: r.values[metric.key] ?? null,
          tone: worse !== null && worse >= 2 ? ('bad' as const) : worse !== null && worse >= 1 ? ('warn' as const) : undefined,
          onClick: () => onPerson(r.emp),
        };
      })
      .filter((r) => r.value !== null)
      .sort((a, b) => (metric.worse === 'low' ? (a.value ?? 0) - (b.value ?? 0) : (b.value ?? 0) - (a.value ?? 0)));
  }, [result, metric, people, onPerson]);

  // When it happens: flagged entries (red and amber) with a time.
  const dated = result.findings.filter((f) => f.when && f.sev !== 'low');
  const byDay = useMemo(() => {
    if (dated.length < 3) return { pts: [], weekly: false };
    const ts = dated.map((f) => +new Date(f.when!.getFullYear(), f.when!.getMonth(), f.when!.getDate()));
    const a = Math.min(...ts);
    const b = Math.max(...ts);
    const days = Math.round((b - a) / 86400000) + 1;
    const weekly = days > 45;
    const bucket = (t: number) => (weekly ? Math.floor((t - a) / (7 * 86400000)) : Math.round((t - a) / 86400000));
    const n = weekly ? Math.floor((b - a) / (7 * 86400000)) + 1 : days;
    const pts = Array.from({ length: n }, (_, i) => {
      const d = new Date(a + i * (weekly ? 7 : 1) * 86400000);
      return { label: dayLabel(d), values: [0, 0] };
    });
    dated.forEach((f, i) => {
      const p = pts[bucket(ts[i])];
      if (p) p.values[f.sev === 'high' ? 0 : 1]++;
    });
    return { pts, weekly };
  }, [dated]);
  const heat = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    dated.forEach((f) => {
      const d = (f.when!.getDay() + 6) % 7; // Monday first
      g[d][f.when!.getHours()]++;
    });
    return g;
  }, [dated]);

  if (!bars.length && !byDay.pts.length) return null;
  return (
    <div className="space-y-5 rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800" data-testid="check-charts">
      {bars.length > 0 && metric && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm font-semibold text-slate-200">By person</span>
            {choices.map((m) => (
              <button
                key={m.key}
                title={m.help}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.key === key ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`}
                onClick={() => setKey(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <HBarChart rows={bars} fmt={(v) => fmtMetric(v, metric.fmt)} median />
          <p className="text-[11px] text-slate-500">
            {metric.help} {metric.worse ? `Colored: ${metric.worse === 'high' ? 'higher' : 'lower'} than the rest of the team. Click a name for everything about that person.` : ''}
          </p>
        </div>
      )}
      {byDay.pts.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <ColumnChart
            caption={byDay.weekly ? 'Flagged entries by week (week starting)' : 'Flagged entries by day'}
            points={byDay.pts}
            series={[
              { name: 'Look into', color: STATUS.bad },
              { name: 'Worth a look', color: STATUS.warn },
            ]}
          />
          <HeatGrid caption="When they happen (weekday × hour)" values={heat} unit="flagged entries" />
        </div>
      )}
    </div>
  );
}
