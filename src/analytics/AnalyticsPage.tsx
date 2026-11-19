import { useEffect, useMemo, useRef, useState } from 'react';
import { CHECKS, overview, robustZ, type Check, type CheckResult, type Finding, type Metric, type Severity } from './checks';
import { People } from './people';
import { FlaggedView, PersonView } from './PersonView';
import { ZeroTipSheet } from './ZeroTipSheet';
import { CheckCharts } from './CheckCharts';
import { HBarChart } from '../ui/charts';
import { EXTRA_REPORTS, REPORTS, loadReport, type Kind, type LoadedFile, type Parsed } from './reports';

const SEV: Record<Severity, { label: string; chip: string; dot: string }> = {
  high: { label: 'Look into', chip: 'bg-rose-900/70 text-rose-100 ring-rose-700', dot: 'bg-rose-500' },
  medium: { label: 'Worth a look', chip: 'bg-amber-900/60 text-amber-100 ring-amber-700', dot: 'bg-amber-400' },
  low: { label: 'FYI', chip: 'bg-slate-800 text-slate-300 ring-slate-700', dot: 'bg-slate-500' },
};
const GROUPS: Check['group'][] = ['Time cards', 'Tips', 'Free food and discounts', 'Voids and logins'];
const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const fmtWhen = (d: Date | null) => (d ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function fmtValue(v: number | null | undefined, f: Metric['fmt']) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  if (f === 'money') return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (f === 'pct') return `${v.toFixed(v < 10 ? 1 : 0)}%`;
  if (f === 'pts') return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);
}

/** Red for clearly worse than the team, amber for somewhat worse. z is oriented so positive = worse. */
function zClass(z: number | null | undefined) {
  if (z === null || z === undefined) return '';
  if (z >= 2) return 'bg-rose-800/70 text-white font-semibold';
  if (z >= 1) return 'bg-amber-800/50 text-amber-50';
  return '';
}

function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
}
function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function FileList({ files, parsed }: { files: LoadedFile[]; parsed: Parsed }) {
  const byKind = new Map(files.filter((f) => f.kind && !f.error).map((f) => [f.kind!, f]));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {REPORTS.map((r) => {
        const f = byKind.get(r.kind);
        const ok = !!parsed[r.kind];
        return (
          <div key={r.kind} data-testid={`file-${r.kind}`} className={`flex items-start gap-3 rounded-xl px-3 py-2 ring-1 ${ok ? 'bg-emerald-950/30 ring-emerald-800/60' : 'bg-slate-900/70 ring-slate-800'}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${ok ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{ok ? '✓' : ''}</span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-100">{r.title}</div>
              <div className="text-xs text-slate-400">{ok && f ? `${f.rows.toLocaleString()} rows · ${fmtDay(f.from)} – ${fmtDay(f.to)}` : r.what}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricTable({ result, people }: { result: CheckResult; people: People }) {
  const z = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    result.metrics.forEach((m) => {
      if (!m.worse) return;
      const zs = robustZ(result.rows.map((r) => r.values[m.key] ?? null));
      out[m.key] = zs.map((v) => (v === null ? null : m.worse === 'high' ? v : -v));
    });
    return out;
  }, [result]);
  if (!result.rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr className="border-b border-slate-800">
            <th className="px-3 py-2 text-left font-medium">Person</th>
            {result.metrics.map((m) => (
              <th key={m.key} className="px-2 py-2 text-right font-medium" title={m.help}>
                <span className={m.worse ? 'underline decoration-dotted decoration-slate-500 underline-offset-2' : ''}>{m.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={r.emp} className="border-t border-slate-800/80">
              <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                {people.name(r.emp)}
                {people.role(r.emp) && <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-normal text-slate-400">{people.role(r.emp)}</span>}
              </td>
              {result.metrics.map((m) => (
                <td key={m.key} className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${zClass(z[m.key]?.[i])}`}>
                  {fmtValue(r.values[m.key], m.fmt)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-slate-500">Underlined columns are compared with the rest of the team: amber = above the team, red = far above (2+ spreads from the middle). Hover a heading for what it means.</div>
    </div>
  );
}

function Findings({ result, people, name, onPerson }: { result: CheckResult; people: People; name: string; onPerson?: (emp: string) => void }) {
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const [who, setWho] = useState('');
  const [limit, setLimit] = useState(60);
  const order: Severity[] = ['high', 'medium', 'low'];
  const list = result.findings
    .filter((f) => (sev === 'all' || f.sev === sev) && (!who || f.emp === who))
    .sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev) || (+(b.when ?? 0) - +(a.when ?? 0)));
  const emps = [...new Set(result.findings.map((f) => f.emp))].sort((a, b) => people.name(a).localeCompare(people.name(b)));
  const counts = order.map((s) => result.findings.filter((f) => f.sev === s).length);
  if (!result.findings.length) return <div className="rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-400 ring-1 ring-slate-800">Nothing flagged.</div>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-full bg-slate-900 p-1 ring-1 ring-slate-800">
          {(['all', ...order] as const).map((s, i) => (
            <button key={s} className={`rounded-full px-3 py-1 font-semibold ${sev === s ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'}`} onClick={() => setSev(s)}>
              {s === 'all' ? `All ${result.findings.length}` : `${SEV[s].label} ${counts[i - 1]}`}
            </button>
          ))}
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-full bg-slate-900 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700">
          <option value="">Everyone</option>
          {emps.map((e) => (
            <option key={e} value={e}>
              {people.name(e)}
            </option>
          ))}
        </select>
        <button
          className="ml-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
          onClick={() =>
            download(
              `${name}.csv`,
              csv([
                ['When', 'Person', 'Level', 'What', 'Details', 'Amount', 'Check / receipt'],
                ...list.map((f) => [f.when ? f.when.toLocaleString() : '', people.name(f.emp), SEV[f.sev].label, f.what, f.detail, f.amount !== undefined ? f.amount.toFixed(2) : '', f.ref ?? '']),
              ]),
            )
          }
        >
          Download CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
        <table data-testid="findings" className="w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-2 py-2 font-medium">Person</th>
              <th className="px-2 py-2 font-medium">When</th>
              <th className="px-2 py-2 font-medium">What</th>
              <th className="px-2 py-2 font-medium">Details</th>
              <th className="px-3 py-2 text-right font-medium">Check #</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((f: Finding, i) => (
              <tr key={i} className="border-t border-slate-800/80 align-top">
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEV[f.sev].chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${SEV[f.sev].dot}`} />
                    {SEV[f.sev].label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-medium">
                  {onPerson ? (
                    <button className="underline decoration-dotted underline-offset-2 hover:text-sky-200" onClick={() => onPerson(f.emp)}>
                      {people.name(f.emp)}
                    </button>
                  ) : (
                    people.name(f.emp)
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-400">{fmtWhen(f.when) || 'Whole period'}</td>
                <td className="whitespace-nowrap px-2 py-2">{f.what}</td>
                <td className="min-w-[18rem] px-2 py-2 text-slate-300">{f.detail}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[11px] text-slate-500">{f.ref ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > limit && (
          <button className="w-full border-t border-slate-800 py-2 text-xs text-sky-300 hover:bg-slate-800/60" onClick={() => setLimit((l) => l + 100)}>
            Show more ({list.length - limit} left)
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewView({ results, people, onPerson }: { results: Record<string, CheckResult>; people: People; onPerson: (emp: string) => void }) {
  const o = useMemo(() => overview(results), [results]);
  const ran = CHECKS.filter((c) => results[c.id] && c.id !== 'timecards').length;
  if (!o.people.length) return <div className="text-sm text-slate-400">Run the checks first (or load more files): this compares people across them.</div>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Each column is a measure where higher (or lower) than the team is a warning sign. The score adds up how far above the team each person is, across the {ran} checks that ran. A high score is a reason
        to look closer, not proof: some people simply work more busy or late shifts.
      </p>
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <HBarChart
          caption="Attention score (higher = further from the team on more measures)"
          median={false}
          fmt={(v) => v.toFixed(1)}
          rows={o.people.map((p) => ({
            key: p.emp,
            label: people.name(p.emp),
            value: p.score,
            tone: p.score >= 4 ? 'bad' : p.score >= 2 ? 'warn' : undefined,
            sub: p.reasons.join('\n'),
            onClick: () => onPerson(p.emp),
          }))}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
        <table data-testid="overview" className="w-full text-sm">
          <thead className="text-xs text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="px-3 py-2 text-left font-medium">Person</th>
              <th className="px-2 py-2 text-right font-medium">Score</th>
              {o.columns.map((c) => (
                <th key={c.id} className="max-w-[7rem] px-1.5 py-2 text-center text-[10px] font-medium leading-tight" title={`${c.check}: ${c.help}`}>
                  <div className="text-slate-500">{c.check}</div>
                  <div className="text-slate-300">{c.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {o.people.map((p, i) => (
              <tr key={p.emp} className="border-t border-slate-800/80">
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="font-semibold">
                    {i < 3 && p.score >= 2 && <span className="mr-1">{['🔴', '🟠', '🟡'][i]}</span>}
                    <button className="underline decoration-dotted underline-offset-2 hover:text-sky-200" onClick={() => onPerson(p.emp)}>
                      {people.name(p.emp)}
                    </button>
                  </div>
                  {p.reasons.length > 0 && <div className="max-w-[16rem] whitespace-normal text-[11px] text-slate-400">{p.reasons.join(' · ')}</div>}
                </td>
                <td className={`px-2 text-right text-lg font-black tabular-nums ${p.score >= 4 ? 'text-rose-300' : p.score >= 2 ? 'text-amber-300' : 'text-slate-300'}`}>{p.score}</td>
                {o.columns.map((c) => {
                  const v = p.z[c.id];
                  return (
                    <td key={c.id} className="px-1 py-1 text-center">
                      <span className={`inline-block min-w-[2.5rem] rounded px-1 py-0.5 text-[11px] tabular-nums ${v === null || v === undefined ? 'text-slate-600' : zClass(v) || 'text-slate-400'}`}>
                        {v === null || v === undefined ? '–' : v >= 1 ? `+${v.toFixed(1)}` : '·'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Numbers are how many "spreads" (robust standard deviations) worse than the middle of the team. · means normal or better.</p>
    </div>
  );
}

export default function AnalyticsPage({ isOwner }: { isOwner: boolean }) {
  const [parsed, setParsed] = useState<Parsed>({});
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [runs, setRuns] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  // Bring the results into view after each Run.
  useEffect(() => {
    if (runs) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [runs]);
  const people = useMemo(() => new People(parsed), [parsed]);

  if (!isOwner) return <div className="p-6 text-slate-300">This page is for the owner only.</div>;

  const has = (k: Kind) => !!parsed[k];
  const ready = (c: Check) => c.needs.every(has);

  const addFiles = async (list: FileList | File[]) => {
    setBusy(true);
    const next: Parsed = { ...parsed };
    const loaded: LoadedFile[] = [];
    for (const f of [...list]) {
      // Let the page repaint between big files.
      await new Promise((r) => setTimeout(r, 0));
      loaded.push(loadReport(f.name, await f.arrayBuffer(), next));
    }
    setParsed(next);
    setFiles((old) => [...old.filter((o) => !loaded.some((l) => l.kind && l.kind === o.kind)), ...loaded]);
    setResults({});
    setView(null);
    setBusy(false);
  };

  const runCheck = (c: Check) => {
    const r = c.run(parsed, people);
    setResults((old) => ({ ...old, [c.id]: r }));
    setView(c.id);
    setRuns((n) => n + 1);
  };
  const runAll = () => {
    const all: Record<string, CheckResult> = {};
    CHECKS.filter(ready).forEach((c) => (all[c.id] = c.run(parsed, people)));
    setResults(all);
    setView('overview');
    setRuns((n) => n + 1);
  };
  /** Run whatever hasn't run yet, so per-person and flagged views see every check. */
  const ensureAll = () => {
    const missing = CHECKS.filter((c) => ready(c) && !results[c.id]);
    if (!missing.length) return;
    const add: Record<string, CheckResult> = {};
    missing.forEach((c) => (add[c.id] = c.run(parsed, people)));
    setResults((old) => ({ ...old, ...add }));
  };
  const openPerson = (emp: string) => {
    ensureAll();
    setPerson(emp);
    setView('person');
    setRuns((n) => n + 1);
  };
  const openFlagged = () => {
    ensureAll();
    setView('flagged');
    setRuns((n) => n + 1);
  };

  const extras = files.filter((f) => f.kind && EXTRA_REPORTS.some((x) => x.kind === f.kind));
  const errors = files.filter((f) => f.error);
  const loadedRanges = files.filter((f) => f.from && f.to && f.kind !== 'schedule' && REPORTS.some((r) => r.kind === f.kind));
  const spans = loadedRanges.map((f) => Math.round((+f.to! - +f.from!) / 86400000));
  const anyReady = CHECKS.some(ready);
  const cur = view && !['overview', 'flagged', 'person'].includes(view) ? CHECKS.find((c) => c.id === view) : null;
  const curRes = cur ? results[cur.id] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-slate-100 sm:p-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-200/90">Owner only</div>
        <h2 className="text-3xl font-black tracking-tight">Employee analytics</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Load the POS back-office exports, then run the checks. 🔒 The files are read <b className="text-slate-200">only in this browser</b>: nothing is uploaded or saved, and closing the page clears
          everything.
        </p>
      </div>

      {/* Step 1: files */}
      <section className="space-y-3 rounded-3xl bg-slate-900/60 p-4 ring-1 ring-slate-800 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">1 · Load the exports</h3>
          {files.length > 0 && (
            <button
              className="text-xs text-slate-400 underline hover:text-white"
              onClick={() => {
                setParsed({});
                setFiles([]);
                setResults({});
                setView(null);
              }}
            >
              Clear all
            </button>
          )}
        </div>
        <div
          data-testid="dropzone"
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${drag ? 'border-sky-400 bg-sky-950/40' : 'border-slate-700 hover:border-slate-500'}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          <div className="text-3xl">📂</div>
          <div className="font-semibold">{busy ? 'Reading…' : 'Drop the .xlsx files here, or click to choose'}</div>
          <div className="text-xs text-slate-400">Select several at once, including the weekly schedule workbook. Each file is recognized by its contents, so file names don't matter.</div>
          <input
            ref={input}
            data-testid="file-input"
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <FileList files={files} parsed={parsed} />
        {extras.length > 0 && (
          <div className="text-xs text-slate-400">
            Not needed (skipped): {extras.map((f) => `${f.title} – ${EXTRA_REPORTS.find((x) => x.kind === f.kind)!.why}`).join(' ')}
          </div>
        )}
        {errors.map((f) => (
          <div key={f.fileName} className="rounded-lg bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {f.fileName}: {f.error}
          </div>
        ))}
        {spans.length > 1 && Math.max(...spans) - Math.min(...spans) > 20 && (
          <div className="rounded-lg bg-amber-950/30 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-800/50">
            The files cover different date ranges ({Math.min(...spans) + 1}–{Math.max(...spans) + 1} days). Each check uses its own files' dates, but comparisons are fairest when every export covers the
            same period.
          </div>
        )}
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer text-slate-300">Which date range should I export?</summary>
          <p className="mt-1">
            Use the same range for every file. The last 60–90 days works best: long enough that one bad night doesn't make someone look suspicious, short enough to reflect who works here now. For
            missed clock-outs, the Time Card for the pay period you're about to run is enough.
          </p>
        </details>
      </section>

      {/* Step 2: checks */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">2 · Run the checks</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="person-select"
              disabled={!anyReady}
              value=""
              onChange={(e) => e.target.value && openPerson(e.target.value)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm text-slate-200 ring-1 ring-slate-700 disabled:opacity-40"
            >
              <option value="">Look at one person…</option>
              {people.everyone().map((k) => (
                <option key={k} value={k}>
                  {people.name(k)}
                  {people.role(k) ? ` (${people.role(k)})` : ''}
                </option>
              ))}
            </select>
            <button
              data-testid="flagged-all"
              disabled={!anyReady}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-40"
              onClick={openFlagged}
            >
              All flagged entries
            </button>
            <button
              data-testid="run-all"
              disabled={!anyReady}
              className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-900/40 hover:bg-sky-500 disabled:opacity-40"
              onClick={runAll}
            >
              Run all & see who stands out
            </button>
          </div>
        </div>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{g}</div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {CHECKS.filter((c) => c.group === g).map((c) => {
                const r = results[c.id];
                const ok = ready(c);
                const hi = r?.findings.filter((f) => f.sev === 'high').length ?? 0;
                const md = r?.findings.filter((f) => f.sev === 'medium').length ?? 0;
                return (
                  <div key={c.id} className={`flex flex-col rounded-2xl p-4 ring-1 ${view === c.id ? 'bg-slate-800 ring-sky-500' : 'bg-slate-900/80 ring-slate-800'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{c.title}</div>
                      {r && (
                        <div className="flex shrink-0 gap-1 text-[11px] font-bold">
                          {hi > 0 && <span className="rounded-full bg-rose-700 px-2 py-0.5">{hi}</span>}
                          {md > 0 && <span className="rounded-full bg-amber-700 px-2 py-0.5">{md}</span>}
                          {!hi && !md && <span className="rounded-full bg-emerald-700 px-2 py-0.5">✓</span>}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 flex-1 text-xs text-slate-400">{c.question}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.needs.map((k) => (
                        <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] ${has(k) ? 'bg-emerald-900/60 text-emerald-200' : 'bg-slate-800 text-slate-500'}`}>
                          {REPORTS.find((x) => x.kind === k)!.title}
                        </span>
                      ))}
                    </div>
                    <button
                      data-testid={`run-${c.id}`}
                      disabled={!ok}
                      className="mt-3 rounded-full bg-slate-700 px-4 py-1.5 text-sm font-semibold hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => runCheck(c)}
                      title={ok ? '' : 'Load the grey files first'}
                    >
                      {r ? 'Run again' : 'Run'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Step 3: results */}
      {view && (
        <section ref={resultsRef} data-testid="results" className="space-y-4 rounded-3xl bg-slate-950/60 p-4 ring-1 ring-slate-800 sm:p-5">
          {Object.keys(results).length > 1 && (
            <div className="flex flex-wrap gap-1 text-xs">
              <button className={`rounded-full px-3 py-1 font-semibold ${view === 'overview' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`} onClick={() => setView('overview')}>
                Who stands out
              </button>
              <button className={`rounded-full px-3 py-1 font-semibold ${view === 'flagged' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`} onClick={() => setView('flagged')}>
                All flagged entries
              </button>
              {person && (
                <button className={`rounded-full px-3 py-1 font-semibold ${view === 'person' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`} onClick={() => setView('person')}>
                  👤 {people.name(person)}
                </button>
              )}
              {CHECKS.filter((c) => results[c.id]).map((c) => (
                <button key={c.id} className={`rounded-full px-3 py-1 font-semibold ${view === c.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`} onClick={() => setView(c.id)}>
                  {c.title}
                </button>
              ))}
            </div>
          )}
          {view === 'overview' ? (
            <>
              <h3 className="text-2xl font-black">Who stands out</h3>
              <OverviewView results={results} people={people} onPerson={openPerson} />
            </>
          ) : view === 'flagged' ? (
            <>
              <h3 className="text-2xl font-black">All flagged entries</h3>
              <p className="text-sm text-slate-400">Every single entry the checks flagged, worst first. Click a name to see everything for that person.</p>
              <FlaggedView results={results} people={people} onPerson={openPerson} />
            </>
          ) : view === 'person' && person ? (
            <PersonView emp={person} parsed={parsed} people={people} results={results} />
          ) : cur && curRes ? (
            <>
              <div>
                <h3 className="text-2xl font-black">{cur.title}</h3>
                {curRes.period && <div className="text-xs text-slate-400">{curRes.period}</div>}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
                {curRes.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer text-slate-300">How this is worked out</summary>
                <p className="mt-1">{cur.how}</p>
              </details>
              {/* For time cards the fixes are the point; elsewhere the team comparison comes first. */}
              {cur.id === 'zero-tips' ? (
                <>
                  <CheckCharts key={cur.id} result={curRes} people={people} onPerson={openPerson} />
                  <MetricTable result={curRes} people={people} />
                  <ZeroTipSheet parsed={parsed} people={people} onPerson={openPerson} />
                </>
              ) : cur.id === 'timecards' ? (
                <>
                  <Findings key={cur.id} result={curRes} people={people} name={cur.id} onPerson={openPerson} />
                  <CheckCharts key={cur.id} result={curRes} people={people} onPerson={openPerson} />
                  <MetricTable result={curRes} people={people} />
                </>
              ) : (
                <>
                  <CheckCharts key={cur.id} result={curRes} people={people} onPerson={openPerson} />
                  <MetricTable result={curRes} people={people} />
                  <Findings key={cur.id} result={curRes} people={people} name={cur.id} onPerson={openPerson} />
                </>
              )}
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
