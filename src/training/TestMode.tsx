import { useEffect, useRef, useState } from 'react';
import { openSignIn, saveRun, type useAuth } from '../lib/supabase';
import { Results } from './Results';
import { testActions, TEST_VERSION, useTest } from './testRun';
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
        <h2 className="text-2xl font-semibold">Service test: a {TEST_TABLES}-table shift</h2>
        <p className="mt-1 text-slate-300">
          A Friday dinner shift in one section (A B C BAR or M Y W). {TEST_TABLES} parties arrive one after another and several tables are open at
          once, so requests from different tables come in mixed together: seating, AYCE rounds, the 4-meat limit, à la carte, guests changing their minds,
          cancellations, parties of 5+, split checks (including one guest paying cash), part cash and part card, and counter guests (take-out, macarons
          or a gift card). Every Test has the same mix; the dishes, drinks, parties and order change each time.
        </p>
      </div>
      <div className="rounded-lg bg-slate-800 p-4 text-sm text-slate-300">
        <div className="mb-2 font-semibold text-slate-100">How it works</div>
        <ul className="list-disc space-y-1 pl-5">
          <li>Each guest request appears in the panel with its table. Most requests move on by themselves when you finish them on the POS.</li>
          <li>
            Stuck, or want to come back to something? Press <b>Next ▸</b>. Nothing is given up: if you do it later on the POS, it still counts.
          </li>
          <li>You are scored once, at the end of the shift. There is no score between tables and no help.</li>
          <li>
            <b>Score</b> (0–100): accuracy across the whole shift: seating and guest counts, packages, every item and quantity, the 4-meat limit, sending orders,
            changes and voids, payment method and amount, change, and closing checks.
          </li>
          <li>
            <b>Clear time</b>: from the start of the shift until the last request. Leaderboard: highest score first; ties go to the faster clear time. Your best
            run counts.
          </li>
        </ul>
      </div>
      {auth.session ? (
        <p className="text-sm text-emerald-300">Signed in as {auth.profile?.display_name ?? auth.session.user.email}. Your result will be saved to the leaderboard.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-600/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          Sign in to save your result to the leaderboard. You can still take the Test without signing in.
          <button className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-900" onClick={() => openSignIn()}>
            Sign in
          </button>
        </div>
      )}
      <button data-testid="test-start" className="rounded-md bg-sky-600 px-6 py-3 text-lg font-semibold hover:bg-sky-500" onClick={() => testActions.start()}>
        Start the shift
      </button>
    </div>
  );
}

function Done({ auth, onLeaderboard }: { auth: Auth; onLeaderboard: () => void }) {
  const t = useTest();
  const ev = t.result!;
  const score = ev.score;
  const time = Math.max(1, ev.durationSec);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const tried = useRef(false);

  const submit = async () => {
    setSave('saving');
    const err = await saveRun({
      version: TEST_VERSION,
      seed: t.seed,
      score,
      clear_time_sec: time,
      tables: {
        categories: ev.categories,
        mistakes: ev.ayceViolations.length + ev.missing.length + ev.wrongQty.length + ev.incorrect.length + ev.paymentMistakes.length,
      },
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
    <div>
      <div className="mx-auto max-w-3xl px-4 pt-4 text-sm sm:px-6">
        {!auth.session && (
          <span className="text-amber-200">
            Not signed in: this result isn't on the leaderboard.{' '}
            <button className="underline" onClick={() => openSignIn()}>
              Sign in
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
      <Results scenario={t.shift!} ev={ev} onRetry={() => testActions.start()} onExit={onLeaderboard} retryLabel="Take another Test" exitLabel="Leaderboard" />
    </div>
  );
}

/** Test-mode screens shown when the shift is not being played. */
export function TestScreens({ auth, onLeaderboard }: { auth: Auth; onLeaderboard: () => void }) {
  const t = useTest();
  if (t.phase === 'done' && t.result) return <Done auth={auth} onLeaderboard={onLeaderboard} />;
  return <Intro auth={auth} />;
}
