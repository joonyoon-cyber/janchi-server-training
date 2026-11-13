import { Fragment, useEffect, useMemo, useState } from 'react';
import { loadTeam, type TeamData, type TeamMember, type TeamPractice, type TeamRun, type useAuth } from '../lib/supabase';
import { fmtTime } from './TestMode';

type Auth = ReturnType<typeof useAuth>;
type Range = '7' | '30' | 'all';
const RANGES: { id: Range; label: string }[] = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

const DAY = 86400000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null) => (x === null ? null : Math.round(x));
const dayKey = (iso: string) => iso.slice(0, 10);

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

interface Stats {
  m: TeamMember;
  runs: TeamRun[];
  practice: TeamPractice[];
  started: number;
  finished: number;
  completion: number | null;
  best: number | null;
  average: number | null;
  latest: number | null;
  trend: number | null;
  avgTime: number | null;
  bestTime: number | null;
  practiceCount: number;
  practiceAvg: number | null;
  daysActive: number;
  lastActive: string | null;
  categories: { name: string; pct: number }[];
}

function buildStats(data: TeamData, range: Range): Stats[] {
  const since = range === 'all' ? 0 : Date.now() - Number(range) * DAY;
  const inRange = (iso: string) => new Date(iso).getTime() >= since;
  return data.members.map((m) => {
    const runs = data.runs.filter((r) => r.user_id === m.id && inRange(r.created_at));
    const practice = data.practice.filter((p) => p.user_id === m.id && inRange(p.created_at));
    const starts = data.starts.filter((s) => s.user_id === m.id && inRange(s.created_at));
    const scores = runs.map((r) => r.score);
    // Runs saved before start tracking existed have no start row: never count fewer starts than finishes.
    const started = Math.max(starts.length, runs.length);
    const cat = new Map<string, { e: number; p: number }>();
    runs.forEach((r) =>
      r.tables?.categories?.forEach((c) => {
        const x = cat.get(c.name) ?? { e: 0, p: 0 };
        cat.set(c.name, { e: x.e + c.earned, p: x.p + c.possible });
      }),
    );
    const allDates = [...runs, ...practice, ...starts].map((x) => x.created_at).sort();
    const last = scores.length ? scores[scores.length - 1] : null;
    const prev = scores.length > 1 ? avg(scores.slice(Math.max(0, scores.length - 4), -1)) : null;
    return {
      m,
      runs,
      practice,
      started,
      finished: runs.length,
      completion: started ? Math.round((runs.length / started) * 100) : null,
      best: scores.length ? Math.max(...scores) : null,
      average: round(avg(scores)),
      latest: last,
      trend: last !== null && prev !== null ? Math.round(last - prev) : null,
      avgTime: round(avg(runs.map((r) => r.clear_time_sec))),
      bestTime: runs.length ? Math.min(...runs.filter((r) => r.score === Math.max(...scores)).map((r) => r.clear_time_sec)) : null,
      practiceCount: practice.length,
      practiceAvg: round(avg(practice.map((p) => p.score))),
      daysActive: new Set(allDates.map(dayKey)).size,
      lastActive: allDates.length ? allDates[allDates.length - 1] : m.last_sign_in_at,
      categories: [...cat.entries()].map(([name, x]) => ({ name, pct: x.p ? Math.round((x.e / x.p) * 100) : 0 })).sort((a, b) => a.pct - b.pct),
    };
  });
}

type SortKey = 'name' | 'started' | 'finished' | 'best' | 'average' | 'latest' | 'practiceCount' | 'daysActive' | 'lastActive';

function Spark({ scores }: { scores: number[] }) {
  const xs = scores.slice(-10);
  if (xs.length < 2) return <span className="text-xs text-slate-600">-</span>;
  const w = 64;
  const h = 20;
  const pts = xs.map((s, i) => `${(i / (xs.length - 1)) * w},${h - (s / 100) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function scoreColor(s: number | null) {
  if (s === null) return 'text-slate-500';
  return s >= 90 ? 'text-emerald-300' : s >= 70 ? 'text-amber-300' : 'text-rose-300';
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-white">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

/** Score history as a line chart, oldest to newest. */
function History({ runs }: { runs: TeamRun[] }) {
  if (!runs.length) return <div className="text-sm text-slate-500">No finished Tests in this period.</div>;
  const w = 520;
  const h = 140;
  const pad = 24;
  const x = (i: number) => pad + (runs.length === 1 ? (w - 2 * pad) / 2 : (i / (runs.length - 1)) * (w - 2 * pad));
  const y = (s: number) => h - pad - (s / 100) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Test score history">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="#3a3533" strokeDasharray="3 4" />
          <text x={4} y={y(g) + 4} fontSize="10" fill="#8c847c">
            {g}
          </text>
        </g>
      ))}
      <polyline points={runs.map((r, i) => `${x(i)},${y(r.score)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" />
      {runs.map((r, i) => (
        <circle key={i} cx={x(i)} cy={y(r.score)} r="4" fill="#be1e2d" stroke="#fde68a" strokeWidth="1.5">
          <title>{`${new Date(r.created_at).toLocaleString()} · ${r.score} · ${fmtTime(r.clear_time_sec)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Detail({ s }: { s: Stats }) {
  const byScenario = useMemo(() => {
    const g = new Map<string, TeamPractice[]>();
    s.practice.forEach((p) => g.set(p.title, [...(g.get(p.title) ?? []), p]));
    return [...g.entries()].map(([title, ps]) => ({ title, n: ps.length, best: Math.max(...ps.map((p) => p.score)), avg: Math.round(avg(ps.map((p) => p.score))!) })).sort((a, b) => b.n - a.n);
  }, [s.practice]);
  const recent = [
    ...s.runs.map((r) => ({ at: r.created_at, what: 'Test', score: r.score, time: r.clear_time_sec })),
    ...s.practice.map((p) => ({ at: p.created_at, what: p.title, score: p.score, time: p.duration_sec })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-200">Test scores over time</div>
        <History runs={s.runs} />
        <div className="text-xs text-slate-400">
          {s.finished} finished of {s.started} started
          {s.bestTime !== null && ` · fastest best-score time ${fmtTime(s.bestTime)}`}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-200">Strengths and weak spots (Tests)</div>
        {s.categories.length === 0 ? (
          <div className="text-sm text-slate-500">No Test details yet.</div>
        ) : (
          s.categories.map((c, i) => (
            <div key={c.name} className="flex items-center gap-2 text-xs">
              <span className="w-40 shrink-0 truncate text-slate-300">
                {c.name}
                {i === 0 && c.pct < 90 && <span className="ml-1 rounded bg-rose-900/70 px-1 text-[10px] text-rose-200">weakest</span>}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full ${c.pct >= 90 ? 'bg-emerald-500' : c.pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${c.pct}%` }} />
              </div>
              <span className="w-9 text-right tabular-nums text-slate-300">{c.pct}%</span>
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-200">Scenario practice</div>
        {byScenario.length === 0 ? (
          <div className="text-sm text-slate-500">No practice in this period.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1 font-medium">Scenario</th>
                <th className="text-right font-medium">Runs</th>
                <th className="text-right font-medium">Best</th>
                <th className="text-right font-medium">Avg</th>
              </tr>
            </thead>
            <tbody>
              {byScenario.map((p) => (
                <tr key={p.title} className="border-t border-slate-800">
                  <td className="truncate py-1 text-slate-300">{p.title}</td>
                  <td className="text-right tabular-nums">{p.n}</td>
                  <td className={`text-right tabular-nums ${scoreColor(p.best)}`}>{p.best}</td>
                  <td className="text-right tabular-nums text-slate-300">{p.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-slate-200">Recent activity</div>
        {recent.length === 0 ? (
          <div className="text-sm text-slate-500">Nothing in this period.</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-slate-500">{new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.what === 'Test' ? 'bg-sky-800 text-white' : 'bg-slate-800 text-slate-300'}`}>{r.what === 'Test' ? 'TEST' : 'PRACTICE'}</span>
                <span className="flex-1 truncate text-slate-300">{r.what === 'Test' ? '10-table shift' : r.what}</span>
                <span className="tabular-nums text-slate-500">{fmtTime(r.time)}</span>
                <span className={`w-7 text-right font-bold tabular-nums ${scoreColor(r.score)}`}>{r.score}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Team({ auth }: { auth: Auth }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [range, setRange] = useState<Range>('30');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastActive', desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const isOwner = !!auth.profile?.is_owner;

  useEffect(() => {
    if (isOwner) loadTeam().then(setData);
  }, [isOwner]);

  const stats = useMemo(() => (data ? buildStats(data, range) : []), [data, range]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = stats.filter((s) => !needle || s.m.display_name.toLowerCase().includes(needle) || (s.m.email ?? '').toLowerCase().includes(needle));
    const val = (s: Stats): string | number => {
      switch (sort.key) {
        case 'name':
          return s.m.display_name.toLowerCase();
        case 'lastActive':
          return s.lastActive ?? '';
        default:
          return s[sort.key] ?? -1;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [stats, sort, q]);

  if (!auth.ready) return <div className="p-6 text-slate-400">Loading…</div>;
  if (!isOwner) return <div className="p-6 text-slate-300">This page is for the owner only.</div>;

  const active = stats.filter((s) => s.daysActive > 0);
  const allRuns = stats.flatMap((s) => s.runs);
  const started = stats.reduce((a, s) => a + s.started, 0);
  const practiceRuns = stats.reduce((a, s) => a + s.practiceCount, 0);
  const notStarted = stats.filter((s) => !s.m.is_owner && s.finished === 0 && s.practiceCount === 0);

  const th = (key: SortKey, label: string, cls = 'text-right') => (
    <th className={`whitespace-nowrap px-2 py-2 font-medium ${cls}`}>
      <button className={`hover:text-white ${sort.key === key ? 'text-amber-300' : ''}`} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}>
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-200/90">Owner only</div>
          <h2 className="text-3xl font-black tracking-tight">Team progress</h2>
          <p className="text-sm text-slate-400">Every Test and Scenario practice finished while signed in. Click a person for their details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="w-48 rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white ring-1 ring-slate-700 placeholder:text-slate-500" />
          <div className="flex rounded-full bg-slate-900 p-1 text-xs font-semibold ring-1 ring-slate-800">
            {RANGES.map((r) => (
              <button key={r.id} data-testid={`range-${r.id}`} className={`rounded-full px-3 py-1 ${range === r.id ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'}`} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="rounded-full border border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-800" onClick={() => loadTeam().then(setData)}>
            Refresh
          </button>
        </div>
      </div>

      {data?.error && (
        <div className="rounded-xl bg-rose-950/50 p-3 text-sm text-rose-200">
          Could not load the team: {data.error}. If this mentions a missing table or function, run <code>supabase/team.sql</code> in Supabase.
        </div>
      )}
      {!data ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Active people" value={`${active.length}`} sub={`of ${stats.length} accounts`} />
            <Card label="Tests finished" value={`${allRuns.length}`} sub={`${started} started${started ? ` · ${Math.round((allRuns.length / started) * 100)}% finished` : ''}`} />
            <Card label="Average Test score" value={allRuns.length ? `${round(avg(allRuns.map((r) => r.score)))}` : '-'} sub={allRuns.length ? `best ${Math.max(...allRuns.map((r) => r.score))}` : undefined} />
            <Card label="Practice runs" value={`${practiceRuns}`} sub="Scenarios finished" />
          </div>

          {notStarted.length > 0 && (
            <div className="rounded-xl bg-amber-950/30 p-3 text-sm text-amber-200 ring-1 ring-amber-800/50">
              No Tests or practice {range === 'all' ? 'yet' : 'in this period'}: {notStarted.map((s) => s.m.display_name).join(', ')}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
            <table data-testid="team-table" className="w-full text-sm">
              <thead className="text-xs text-slate-400">
                <tr className="border-b border-slate-800">
                  {th('name', 'Person', 'text-left')}
                  {th('started', 'Tests started')}
                  {th('finished', 'Finished')}
                  {th('best', 'Best')}
                  {th('average', 'Average')}
                  {th('latest', 'Latest')}
                  <th className="px-2 py-2 text-right font-medium">Avg time</th>
                  <th className="px-2 py-2 font-medium">Trend</th>
                  {th('practiceCount', 'Practice')}
                  {th('daysActive', 'Days active')}
                  {th('lastActive', 'Last active')}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <Fragment key={s.m.id}>
                    <tr className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/60 ${open === s.m.id ? 'bg-slate-800/60' : ''}`} onClick={() => setOpen(open === s.m.id ? null : s.m.id)}>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-800 text-xs font-bold">{(s.m.display_name[0] ?? '?').toUpperCase()}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {s.m.display_name}
                              {s.m.is_owner && <span className="ml-1 rounded bg-amber-800/70 px-1 text-[9px] uppercase text-amber-100">Owner</span>}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">{s.m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-right tabular-nums">{s.started}</td>
                      <td className="px-2 text-right tabular-nums">
                        {s.finished}
                        {s.completion !== null && <span className="ml-1 text-[11px] text-slate-500">({s.completion}%)</span>}
                      </td>
                      <td className={`px-2 text-right font-bold tabular-nums ${scoreColor(s.best)}`}>{s.best ?? '-'}</td>
                      <td className="px-2 text-right tabular-nums">{s.average ?? '-'}</td>
                      <td className="whitespace-nowrap px-2 text-right tabular-nums">
                        {s.latest ?? '-'}
                        {s.trend !== null && s.trend !== 0 && <span className={`ml-1 text-[11px] ${s.trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{s.trend > 0 ? `▲${s.trend}` : `▼${-s.trend}`}</span>}
                      </td>
                      <td className="px-2 text-right tabular-nums text-slate-300">{s.avgTime !== null ? fmtTime(s.avgTime) : '-'}</td>
                      <td className="px-2">
                        <Spark scores={s.runs.map((r) => r.score)} />
                      </td>
                      <td className="whitespace-nowrap px-2 text-right tabular-nums">
                        {s.practiceCount}
                        {s.practiceAvg !== null && <span className="ml-1 text-[11px] text-slate-500">avg {s.practiceAvg}</span>}
                      </td>
                      <td className="px-2 text-right tabular-nums">{s.daysActive}</td>
                      <td className="whitespace-nowrap px-2 text-right text-xs text-slate-400">{ago(s.lastActive)}</td>
                    </tr>
                    {open === s.m.id && (
                      <tr className="bg-slate-950/60">
                        <td colSpan={11}>
                          <Detail s={s} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Tests started counts every Test opened, including ones quit partway. Practice counts Scenarios finished while signed in (tracking began with this
            page; earlier practice was kept only on each person's own device). Trend compares the latest Test with the average of the three before it.
          </p>
        </>
      )}
    </div>
  );
}
