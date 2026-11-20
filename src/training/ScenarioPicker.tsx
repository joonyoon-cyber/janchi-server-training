import { openSignIn } from '../lib/supabase';
import { useState } from 'react';
import { generateScenario } from './generator';
import { scenarios } from './scenarios';
import type { Level, Scenario } from './types';
import { BUILT_IN, goalText, type Achievements, type Activity } from './achievements';


const LEVELS: { id: Level; label: string; focus: string }[] = [
  { id: 'beginner', label: 'Beginner', focus: 'Seating, guest counts, AYCE packages, meat & drink entry, sending orders.' },
  { id: 'intermediate', label: 'Intermediate', focus: 'Multiple rounds, à la carte, corrections, cancellations, cash & card.' },
  { id: 'advanced', label: 'Advanced', focus: 'AYCE rules, voids after sending, gratuity, multiple tables, policy calls.' },
];

const LEVEL_KEY = 'janchi-pos-sim:scenario-level';
/** Remember the level tab, also when a scenario of that level is started from elsewhere (Profile passport). */
export function rememberLevel(l: Level) {
  try {
    localStorage.setItem(LEVEL_KEY, l);
  } catch {
    // ignore
  }
}

export function ScenarioPicker({ onStart, ach, history: all, signedIn, onProfile }: { onStart: (s: Scenario) => void; ach: Achievements; history: Activity[]; signedIn: boolean; onProfile: () => void }) {
  // Stay on the level last chosen (e.g. after finishing an Advanced scenario), not back to Beginner.
  const [level, setLevelState] = useState<Level>(() => {
    try {
      const v = localStorage.getItem(LEVEL_KEY);
      return v === 'intermediate' || v === 'advanced' ? v : 'beginner';
    } catch {
      return 'beginner';
    }
  });
  const setLevel = (l: Level) => {
    setLevelState(l);
    rememberLevel(l);
  };
  // Best scores of whoever is signed in (their account on any device, plus this browser).
  const best: Record<string, number> = {};
  ach.stats.best.forEach((v, k) => (best[k] = v));
  const done = BUILT_IN.filter((s) => best[s.id] !== undefined).length;
  const levelDone = (l: Level) => [BUILT_IN.filter((s) => s.level === l && best[s.id] !== undefined).length, BUILT_IN.filter((s) => s.level === l).length];
  const nextBadge = ach.badges.find((b) => b.def.group === 'Scenarios' && b.next !== null && b.value > 0) ?? ach.badges.find((b) => b.def.id === 'first-table');
  // Signed in: everything the account has finished (any device). Signed out: nothing is kept.
  const history = all.filter((h) => h.kind === 'practice').sort((a, b) => a.at - b.at);
  const recent = history.slice(-8).reverse();
  const titleOf = (h: Activity) => BUILT_IN.find((x) => x.id === h.scenarioId)?.title ?? `Random ${h.level ?? ''} table`.replace('  ', ' ');
  const avg = history.length ? Math.round(history.reduce((s, p) => s + p.score, 0) / history.length) : null;
  const lv = LEVELS.find((l) => l.id === level)!;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Training scenarios</h2>
        <p className="text-sm text-slate-400">
          Guests speak in menu language. Find the right buttons yourself; there is no help in Training Mode. Mistakes are allowed and scored afterwards.
        </p>
      </div>
      <button
        data-testid="passport-bar"
        onClick={onProfile}
        className="block w-full rounded-2xl bg-gradient-to-r from-slate-900 to-sky-950/50 p-4 text-left ring-1 ring-slate-800 transition hover:ring-sky-600"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛂</span>
            <div>
              <div className="font-bold">
                Scenario passport: {done}/{BUILT_IN.length} finished
              </div>
              <div className="text-xs text-slate-400">
                {done === BUILT_IN.length ? 'Every scenario stamped. Now go for 90+ on all of them!' : 'Finish every scenario at least once to earn the Full Passport badge.'}
                {nextBadge?.next ? ` Next badge: ${nextBadge.def.icon} ${nextBadge.def.name} (${goalText(nextBadge).toLowerCase()}).` : ''}
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-sky-300">
            {ach.rank.icon} {ach.rank.title} · 🏅 {ach.badges.reduce((t, b) => t + b.tier, 0)} badges · View all →
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-700 via-sky-500 to-amber-300" style={{ width: `${(done / BUILT_IN.length) * 100}%` }} />
        </div>
      </button>
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => {
          const [d, n] = levelDone(l.id);
          return (
            <button key={l.id} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${l.id === level ? 'bg-sky-600' : 'bg-slate-700 hover:bg-slate-600'}`} onClick={() => setLevel(l.id)}>
              {l.label}{' '}
              <span className={`ml-1 rounded-full px-1.5 text-[11px] tabular-nums ${d === n ? 'bg-amber-400 text-slate-950' : 'bg-black/25'}`}>
                {d === n ? '✓ ' : ''}
                {d}/{n}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-slate-300">{lv.focus}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {scenarios
          .filter((s) => s.level === level)
          .map((s) => (
            <button key={s.id} data-testid={`scenario-${s.id}`} className="rounded-lg bg-slate-800 p-4 text-left ring-1 ring-slate-700 hover:ring-sky-500" onClick={() => onStart(s)}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{s.title}</div>
                {best[s.id] !== undefined ? (
                  <span title="Your best score" className={`shrink-0 rounded-full px-2 text-xs font-bold ${best[s.id] >= 90 ? 'bg-amber-400 text-slate-950' : 'bg-sky-700'}`}>
                    ✓ {best[s.id]}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-dashed border-slate-600 px-2 text-[10px] font-semibold uppercase text-slate-400">New</span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-400">{s.summary}</div>
            </button>
          ))}
        <button className="rounded-lg border-2 border-dashed border-sky-700 p-4 text-left hover:bg-slate-800" onClick={() => onStart(generateScenario(level))}>
          <div className="font-semibold text-sky-300">🎲 Random {lv.label.toLowerCase()} scenario</div>
          <div className="mt-1 text-sm text-slate-400">A new table built from the real menu: party size, section, package, drinks, rounds{level !== 'beginner' ? ', changes and payment' : ''} all vary.</div>
        </button>
      </div>

      <div className="rounded-lg bg-slate-800/60 p-4">
        <div className="mb-2 font-semibold">Your progress</div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-400">
            {signedIn ? (
              'No scenarios completed yet.'
            ) : (
              <>
                You're not signed in: you can play every scenario and see your score, but nothing is saved.{' '}
                <button className="text-sky-300 underline" onClick={() => openSignIn()}>
                  Sign in
                </button>{' '}
                to save your results, fill your passport and earn badges.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 text-sm text-slate-300">
              {history.length} attempt{history.length > 1 ? 's' : ''} · average score {avg}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {recent.map((p, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="py-1 pr-2">{titleOf(p)}</td>
                    <td className="py-1 pr-2 text-slate-400">{p.level}</td>
                    <td className="py-1 pr-2 text-slate-400 tabular-nums">
                      {Math.floor(p.durationSec / 60)}:{String(Math.round(p.durationSec) % 60).padStart(2, '0')}
                    </td>
                    <td className="py-1 pr-2 text-slate-400">{p.mistakes} mistakes</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
