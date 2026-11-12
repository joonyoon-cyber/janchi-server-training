import { useEffect, useRef, useState } from 'react';
import { saveRun, signInWithGoogle, type useAuth } from '../lib/supabase';
import { clearTime, finalScore, testActions, TEST_VERSION, useTest } from './testRun';
import { TEST_TABLES } from './testRecipe';

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

type Auth = ReturnType<typeof useAuth>;

function Intro({ auth }: { auth: Auth }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">Test mode</div>
        <h2 className="text-2xl font-semibold">{TEST_TABLES}-table service test</h2>
        <p className="mt-1 text-slate-300">
          Serve {TEST_TABLES} tables in a row on the POS: AYCE rounds, the 4-meat limit, à la carte, guests changing their minds, cancellations, parties of 5+,
          split checks, cash and card, a macaron to go and a gift card sale. Every Test has the same mix; the dishes, parties and order change each time.
        </p>
      </div>
      <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-300">
        <div className="mb-2 font-semibold text-slate-100">How you are scored</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>Each table is scored 0–100 for accuracy only: right table and guests, package, every item and quantity, the 4-meat limit, sending orders, changes and voids, payment method and amount, change, and closing the check.</li>
          <li>Your <b>Test score</b> is the average of the {TEST_TABLES} tables, rounded to a whole number.</li>
          <li>Your <b>clear time</b> is the total time spent on the tables. The break screen between tables doesn't count.</li>
          <li>Leaderboard: highest score first; ties go to the faster clear time. Your best run counts.</li>
          <li>No help in Test mode. Skipping a step counts as missing it.</li>
        </ul>
      </div>
      {auth.session ? (
        <p className="text-sm text-emerald-300">Signed in as {auth.profile?.display_name ?? auth.session.user.email}. Your result will be saved to the leaderboard.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-600/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          Sign in to save your result to the leaderboard. You can still take the Test without signing in.
          <button className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-900" onClick={() => signInWithGoogle()}>
            Sign in with Google
          </button>
        </div>
      )}
      {!auth.session && (
        <p className="text-xs text-slate-400">
            By signing in you agree to the{' '}
            <a className="underline" href="terms.html" target="_blank" rel="noreferrer">
              Terms of Service
            </a>{' '}
            and{' '}
            <a className="underline" href="privacy.html" target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </p>
      )}
      <button data-testid="test-start" className="rounded-md bg-sky-600 px-6 py-3 text-lg font-semibold hover:bg-sky-500" onClick={() => testActions.start()}>
        Start the Test
      </button>
    </div>
  );
}

function Between() {
  const t = useTest();
  const last = t.results[t.results.length - 1];
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6 text-center text-slate-100">
      <div className="text-sm text-slate-400">
        Table {t.results.length} of {t.tables.length} done · clock paused
      </div>
      <div className="text-lg font-semibold">{last.title}</div>
      <div className={`text-6xl font-bold tabular-nums ${last.score >= 90 ? 'text-emerald-300' : last.score >= 70 ? 'text-amber-300' : 'text-rose-300'}`}>{last.score}</div>
      {last.mistakes.length > 0 && (
        <ul className="mx-auto max-w-md space-y-1 text-left text-sm text-rose-200">
          {last.mistakes.slice(0, 4).map((m, i) => (
            <li key={i}>✗ {m}</li>
          ))}
          {last.mistakes.length > 4 && <li className="text-slate-400">…and {last.mistakes.length - 4} more</li>}
        </ul>
      )}
      <div className="text-sm text-slate-400">
        Running score {finalScore(t)} · clear time {fmtTime(clearTime(t))}
      </div>
      <button data-testid="test-next" autoFocus className="rounded-md bg-sky-600 px-6 py-3 text-lg font-semibold hover:bg-sky-500" onClick={() => testActions.next()}>
        Next table ({t.results.length + 1} / {t.tables.length})
      </button>
    </div>
  );
}

function Done({ auth, onLeaderboard }: { auth: Auth; onLeaderboard: () => void }) {
  const t = useTest();
  const score = finalScore(t);
  const time = clearTime(t);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const tried = useRef(false);

  const submit = async () => {
    setSave('saving');
    const err = await saveRun({
      version: TEST_VERSION,
      seed: t.seed,
      score,
      clear_time_sec: Math.max(1, time),
      tables: t.results.map((r) => ({ title: r.title, score: r.score, sec: r.durationSec, mistakes: r.mistakes.length })),
      events: t.events,
    });
    setSave(err ? `Could not save: ${err}` : 'saved');
  };

  useEffect(() => {
    if (auth.session && !tried.current) {
      tried.current = true;
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-300">Test complete</div>
          <h2 className="text-2xl font-semibold">Your result</h2>
          <div className="text-slate-300">Clear time {fmtTime(time)}</div>
        </div>
        <div data-testid="test-score" className={`text-7xl font-bold tabular-nums ${score >= 90 ? 'text-emerald-300' : score >= 70 ? 'text-amber-300' : 'text-rose-300'}`}>
          {score}
          <span className="text-2xl text-slate-400">/100</span>
        </div>
      </div>
      <div className="text-sm">
        {!auth.session && (
          <span className="text-amber-200">
            Not signed in: this result isn't on the leaderboard.{' '}
            <button className="underline" onClick={() => signInWithGoogle()}>
              Sign in with Google
            </button>{' '}
            and take the Test again to get ranked.
          </span>
        )}
        {save === 'saving' && <span className="text-slate-300">Saving to the leaderboard…</span>}
        {save === 'saved' && (
          <span className="text-emerald-300">
            Saved.{' '}
            <button className="underline" onClick={onLeaderboard}>
              See the leaderboard
            </button>
          </span>
        )}
        {save.startsWith('Could not') && (
          <span className="text-rose-300">
            {save}{' '}
            <button className="underline" onClick={() => void submit()}>
              Try again
            </button>
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="py-1">#</th>
            <th>Table</th>
            <th className="text-right">Time</th>
            <th className="text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {t.results.map((r, i) => (
            <tr key={i} className="border-t border-slate-800" title={r.mistakes.join('\n')}>
              <td className="py-1 text-slate-500">{i + 1}</td>
              <td>
                {r.title}
                {r.mistakes.length > 0 && <div className="text-xs text-rose-300">{r.mistakes[0]}{r.mistakes.length > 1 ? ` (+${r.mistakes.length - 1} more)` : ''}</div>}
              </td>
              <td className="text-right tabular-nums text-slate-400">{fmtTime(r.durationSec)}</td>
              <td className={`text-right font-semibold tabular-nums ${r.score >= 90 ? 'text-emerald-300' : r.score >= 70 ? 'text-amber-300' : 'text-rose-300'}`}>{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3">
        <button className="rounded-md bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500" onClick={() => testActions.start()}>
          Take another Test
        </button>
        <button className="rounded-md border border-slate-500 px-4 py-2 hover:bg-slate-800" onClick={onLeaderboard}>
          Leaderboard
        </button>
      </div>
    </div>
  );
}

/** Test-mode screens shown when no table is being served. */
export function TestScreens({ auth, onLeaderboard }: { auth: Auth; onLeaderboard: () => void }) {
  const t = useTest();
  if (t.phase === 'between') return <Between />;
  if (t.phase === 'done') return <Done auth={auth} onLeaderboard={onLeaderboard} />;
  return <Intro auth={auth} />;
}
