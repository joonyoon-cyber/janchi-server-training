import { useMemo, useState } from 'react';
import type { TeamData, TeamMember } from '../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { HBarChart, HeatGrid } from '../ui/charts';
import { computeEffort, fmtDuration, historyOf, type Effort } from './effort';

type SortKey = 'timeSec' | 'activeDays' | 'perDaySec' | 'streak' | 'practiceRuns' | 'tests' | 'retries' | 'improvement' | 'xpGained' | 'name';

interface Row {
  m: TeamMember;
  e: Effort;
}

/** Last 8 weeks of training minutes as tiny bars. */
function WeekBars({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  return (
    <div className="flex h-6 items-end gap-[2px]" title={`Minutes per week, last 8 weeks (oldest first): ${weeks.join(', ')}`}>
      {weeks.map((w, i) => (
        <span key={i} className="w-2 rounded-t-[2px]" style={{ height: w ? `${Math.max(12, (w / max) * 100)}%` : '2px', background: w ? (i === weeks.length - 1 ? '#3987e5' : 'rgba(57,135,229,0.55)') : '#3a3632' }} />
      ))}
    </div>
  );
}

/**
 * Owner's Team page: how much each person trains and how hard they practice, for the chosen period.
 */
export function TeamEffort({ data, since, periodLabel, onlyIds }: { data: TeamData; since: number; periodLabel: string; onlyIds?: Set<string> }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'timeSec', desc: true });
  const all: Row[] = useMemo(() => data.members.filter((m) => !m.is_owner).map((m) => ({ m, e: computeEffort(data, m.id, since) })), [data, since]);
  const rows = useMemo(() => {
    const list = all.filter((r) => !onlyIds || onlyIds.has(r.m.id));
    const val = (r: Row): number | string => {
      if (sort.key === 'name') return r.m.display_name.toLowerCase();
      if (sort.key === 'tests') return r.e.testsFinished;
      return r.e[sort.key] ?? -999;
    };
    return [...list].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const c = a < b ? -1 : a > b ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [all, sort, onlyIds]);

  // When the team trains (weekday x hour), counting every run in the period.
  const heat = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    all.forEach((r) =>
      historyOf(data, r.m.id)
        .filter((a) => a.at >= since)
        .forEach((a) => {
          const d = new Date(a.at);
          g[(d.getDay() + 6) % 7][d.getHours()]++;
        }),
    );
    return g;
  }, [all, data, since]);

  if (!all.length) return null;
  const total = all.reduce((t, r) => t + r.e.timeSec, 0);
  const th = (key: SortKey, label: string, title?: string, cls = 'text-right') => (
    <th className={`whitespace-nowrap px-2 py-2 font-medium ${cls}`} title={title}>
      <button className={`hover:text-white ${sort.key === key ? 'text-amber-300' : ''}`} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}>
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <section className="space-y-3" data-testid="team-effort">
      <div>
        <h3 className="text-xl font-black">Effort</h3>
        <p className="text-sm text-slate-400">
          How much each person trains and how hard they practice ({periodLabel.toLowerCase()}). Team total: <b className="text-slate-200">{fmtDuration(total)}</b> of training.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
        <table className="w-full text-sm" data-testid="effort-table">
          <thead className="text-xs text-slate-400">
            <tr className="border-b border-slate-800">
              {th('name', 'Person', undefined, 'text-left')}
              {th('timeSec', 'Time training', 'Scenario play time plus Test clear time (Free Play is not tracked)')}
              {th('activeDays', 'Days active')}
              {th('perDaySec', 'Per active day', 'Average training time on the days they trained')}
              {th('streak', 'Streak', 'Days in a row up to today (best ever in grey)')}
              {th('practiceRuns', 'Scenario runs')}
              {th('tests', 'Tests', 'Finished / started')}
              {th('retries', 'Retries', 'Scenario runs that repeat one already played: practicing until it is right')}
              {th('improvement', 'Improvement', 'Average change from first to latest score on scenarios played at least twice (all time)')}
              {th('xpGained', 'XP gained')}
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium" title="Training minutes per week, last 8 weeks">
                Last 8 weeks
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, e }) => {
              const idle = e.timeSec === 0;
              return (
                <tr key={m.id} className="border-t border-slate-800" data-testid={`effort-row-${m.id}`}>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.display_name} url={data.avatars?.[m.id]} size="h-8 w-8 text-xs" />
                      <span className="truncate font-semibold">{m.display_name}</span>
                    </div>
                  </td>
                  <td className={`px-2 text-right font-bold tabular-nums ${idle ? 'text-slate-500' : ''}`}>{idle ? '-' : fmtDuration(e.timeSec)}</td>
                  <td className="px-2 text-right tabular-nums">{e.activeDays}</td>
                  <td className="px-2 text-right tabular-nums text-slate-300">{e.perDaySec !== null ? fmtDuration(e.perDaySec) : '-'}</td>
                  <td className="whitespace-nowrap px-2 text-right tabular-nums">
                    {e.streak > 0 ? <b className="text-amber-300">🔥 {e.streak}</b> : <span className="text-slate-500">0</span>}
                    <span className="ml-1 text-[11px] text-slate-500">best {e.bestStreak}</span>
                  </td>
                  <td className="px-2 text-right tabular-nums">{e.practiceRuns}</td>
                  <td className="whitespace-nowrap px-2 text-right tabular-nums">
                    {e.testsFinished}
                    <span className="text-[11px] text-slate-500">/{e.testsStarted}</span>
                  </td>
                  <td className="px-2 text-right tabular-nums">{e.retries}</td>
                  <td className={`px-2 text-right font-semibold tabular-nums ${e.improvement === null ? 'text-slate-500' : e.improvement > 0 ? 'text-emerald-300' : e.improvement < 0 ? 'text-rose-300' : ''}`}>
                    {e.improvement === null ? '-' : `${e.improvement > 0 ? '+' : ''}${e.improvement}`}
                  </td>
                  <td className="whitespace-nowrap px-2 text-right tabular-nums">
                    {e.xpGained.toLocaleString()}
                    <span className="ml-1 text-[11px] text-slate-500">of {e.xpTotal.toLocaleString()}</span>
                  </td>
                  <td className="px-2">
                    <WeekBars weeks={e.weeks} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
          <HBarChart
            caption={`Time training (${periodLabel.toLowerCase()})`}
            rows={all
              .map((r) => ({ key: r.m.id, label: r.m.display_name, value: Math.round(r.e.timeSec / 60), sub: `${r.e.activeDays} days active · ${r.e.practiceRuns} scenario runs · ${r.e.testsFinished} Tests` }))
              .sort((a, b) => b.value - a.value)}
            fmt={(v) => fmtDuration(v * 60)}
          />
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
          <HeatGrid caption="When the team trains (weekday × hour)" values={heat} unit="runs" fromHour={6} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Time counts Scenario play time and Test clear time saved while signed in; Free Play, signed-out practice and Tests quit partway are not timed, so real time is a
        little higher. Streaks, improvement and the 8-week bars use all history.
      </p>
    </section>
  );
}
