import { useState } from 'react';
import { generateScenario } from './generator';
import { bestScores, clearProgress, loadProgress } from './progress';
import { scenarios } from './scenarios';
import type { Level, Scenario } from './types';


const LEVELS: { id: Level; label: string; focus: string }[] = [
  { id: 'beginner', label: 'Beginner', focus: 'Seating, guest counts, AYCE packages, meat & drink entry, sending orders.' },
  { id: 'intermediate', label: 'Intermediate', focus: 'Multiple rounds, à la carte, corrections, cancellations, cash & card.' },
  { id: 'advanced', label: 'Advanced', focus: 'AYCE rules, voids after sending, gratuity, multiple tables, policy calls.' },
];

export function ScenarioPicker({ onStart }: { onStart: (s: Scenario) => void }) {
  const [level, setLevel] = useState<Level>('beginner');
  const [, force] = useState(0);
  const best = bestScores();
  const history = loadProgress();
  const recent = history.slice(-8).reverse();
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
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button key={l.id} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${l.id === level ? 'bg-sky-600' : 'bg-slate-700 hover:bg-slate-600'}`} onClick={() => setLevel(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-300">{lv.focus}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {scenarios
          .filter((s) => s.level === level)
          .map((s) => (
            <button key={s.id} data-testid={`scenario-${s.id}`} className="rounded-lg bg-slate-800 p-4 text-left ring-1 ring-slate-700 hover:ring-sky-500" onClick={() => onStart(s)}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{s.title}</div>
                {best[s.id] !== undefined && <span className={`rounded px-1.5 text-xs font-bold ${best[s.id] >= 90 ? 'bg-emerald-700' : 'bg-slate-600'}`}>{best[s.id]}</span>}
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
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Your progress</div>
          {history.length > 0 && (
            <button
              className="text-xs text-slate-400 underline hover:text-slate-200"
              onClick={() => {
                if (confirm('Clear all saved training results on this device?')) {
                  clearProgress();
                  force((x) => x + 1);
                }
              }}
            >
              Clear history
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-slate-400">No scenarios completed yet. Results are saved in this browser.</div>
        ) : (
          <>
            <div className="mb-2 text-sm text-slate-300">
              {history.length} attempt{history.length > 1 ? 's' : ''} · average score {avg}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {recent.map((p, i) => (
                  <tr key={i} className="border-t border-slate-700">
                    <td className="py-1 pr-2">{p.title}</td>
                    <td className="py-1 pr-2 text-slate-400">{p.level}</td>
                    <td className="py-1 pr-2 text-slate-400 tabular-nums">
                      {Math.floor(p.durationSec / 60)}:{String(p.durationSec % 60).padStart(2, '0')}
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
