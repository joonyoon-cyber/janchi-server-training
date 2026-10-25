import type { Evaluation } from './evaluate';
import type { Scenario } from './types';

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Section({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' | 'warn' | 'info' }) {
  if (!items.length) return null;
  const color = { good: 'text-emerald-300', bad: 'text-rose-300', warn: 'text-amber-300', info: 'text-sky-300' }[tone];
  const mark = { good: '✓', bad: '✗', warn: '!', info: '›' }[tone];
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold uppercase tracking-wider ${color}`}>
        {title} ({items.length})
      </div>
      <ul className="space-y-1 text-sm text-slate-200">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className={color}>{mark}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Results({ scenario, ev, onRetry, onExit }: { scenario: Scenario; ev: Evaluation; onRetry: () => void; onExit: () => void }) {
  const grade = ev.score >= 90 ? 'text-emerald-300' : ev.score >= 70 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">Evaluation · {scenario.level}</div>
          <h2 className="text-xl font-semibold">{scenario.title}</h2>
          <div className="text-sm text-slate-400">
            Time {fmtSec(ev.durationSec)} (target {fmtSec(ev.targetSeconds)})
          </div>
        </div>
        <div className={`text-6xl font-bold tabular-nums ${grade}`} data-testid="final-score">
          {ev.score}
          <span className="text-2xl text-slate-400">/100</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ev.categories.map((c) => (
          <div key={c.name} className="rounded-md bg-slate-800 px-3 py-2">
            <div className="flex justify-between text-sm">
              <span>{c.name}</span>
              <span className="tabular-nums text-slate-300">
                {c.earned}/{c.possible}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-slate-700">
              <div className={`h-1.5 rounded ${c.earned >= c.possible ? 'bg-emerald-400' : c.earned > 0 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${(100 * c.earned) / c.possible}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-lg bg-slate-800/60 p-4">
        <Section title="AYCE violations" items={ev.ayceViolations} tone="bad" />
        <Section title="Missing items" items={ev.missing} tone="bad" />
        <Section title="Incorrect quantities" items={ev.wrongQty} tone="bad" />
        <Section title="Incorrect actions" items={ev.incorrect} tone="bad" />
        <Section title="Payment mistakes" items={ev.paymentMistakes} tone="bad" />
        <Section title="Guest interaction" items={ev.decisionFeedback} tone="info" />
        <Section title="Suggestions" items={ev.suggestions} tone="warn" />
        <Section title="Correct actions" items={ev.correct} tone="good" />
      </div>

      <div className="flex gap-3">
        <button className="rounded-md bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500" onClick={onRetry}>
          Retry this scenario
        </button>
        <button className="rounded-md border border-slate-500 px-4 py-2 hover:bg-slate-800" onClick={onExit}>
          Back to scenarios
        </button>
      </div>
    </div>
  );
}
