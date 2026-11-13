import { useEffect, useState } from 'react';
import { clearLeaderboard, loadLeaderboard, loadMyRuns, openSignIn, type LeaderRow, type RunRow, type useAuth } from '../lib/supabase';
import { fmtTime } from './TestMode';

type Auth = ReturnType<typeof useAuth>;

export function Leaderboard({ auth }: { auth: Auth }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [mine, setMine] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.session) return;
    loadLeaderboard().then((r) => {
      setRows(r.rows);
      setError(r.error);
    });
    loadMyRuns(auth.session.user.id).then(setMine);
  }, [auth.session]);

  if (!auth.ready) return <div className="p-6 text-slate-400">Loading…</div>;
  if (!auth.session)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6 text-center text-slate-100">
        <h2 className="text-2xl font-semibold">Leaderboard</h2>
        <p className="text-slate-300">Sign in (Google, or your email and a password) to see the rankings and save your Test results.</p>
        <button className="rounded-md bg-white px-4 py-2 font-semibold text-slate-900" onClick={() => openSignIn()}>
          Sign in
        </button>
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
      </div>
    );

  const me = auth.session.user.id;
  const myRank = rows ? rows.findIndex((r) => r.user_id === me) + 1 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 text-slate-100 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Leaderboard</h2>
          <p className="text-sm text-slate-400">Best Test per person · highest score, then fastest clear time.</p>
        </div>
        <div className="text-right text-sm">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = name.trim().slice(0, 40);
                if (!n) return;
                const err = await auth.rename(n);
                setMsg(err);
                if (!err) {
                  setEditing(false);
                  setRows((rs) => rs?.map((r) => (r.user_id === me ? { ...r, display_name: n } : r)) ?? rs);
                }
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-44 rounded bg-white px-2 py-1 text-slate-900" />
              <button className="rounded bg-sky-600 px-3 py-1 font-semibold">Save</button>
            </form>
          ) : (
            <span>
              You appear as <b>{auth.profile?.display_name ?? '…'}</b>{' '}
              <button
                className="text-sky-300 underline"
                onClick={() => {
                  setName(auth.profile?.display_name ?? '');
                  setEditing(true);
                }}
              >
                change
              </button>
            </span>
          )}
          {msg && <div className="text-rose-300">{msg}</div>}
        </div>
      </div>

      {error && <div className="rounded bg-rose-950/50 p-3 text-sm text-rose-200">Could not load the leaderboard: {error}</div>}
      {rows === null ? (
        <div className="text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-400">No Test results yet. Be the first!</div>
      ) : (
        <table data-testid="leaderboard" className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-1">Rank</th>
              <th>Name</th>
              <th className="text-right">Score</th>
              <th className="text-right">Clear time</th>
              <th className="hidden text-right sm:table-cell">Tests</th>
              <th className="hidden text-right sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className={`border-t border-slate-800 ${r.user_id === me ? 'bg-sky-900/40 font-semibold' : ''}`}>
                <td className="py-1.5 tabular-nums">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                <td>{r.display_name}</td>
                <td className="text-right tabular-nums">{r.score}</td>
                <td className="text-right tabular-nums">{fmtTime(r.clear_time_sec)}</td>
                <td className="hidden text-right tabular-nums text-slate-400 sm:table-cell">{r.attempts}</td>
                <td className="hidden text-right text-slate-400 sm:table-cell">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {auth.profile?.is_owner && <OwnerTools onCleared={() => setRows([])} />}

      <div className="rounded-lg bg-slate-800/60 p-4">
        <div className="mb-2 font-semibold">Your recent Tests {myRank > 0 && <span className="font-normal text-slate-400">· rank #{myRank}</span>}</div>
        {mine.length === 0 ? (
          <div className="text-sm text-slate-400">None yet. Take a Test from the Test tab.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {mine.map((r) => (
                <tr key={r.id} className="border-t border-slate-700">
                  <td className="py-1 text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="text-right tabular-nums">{fmtTime(r.clear_time_sec)}</td>
                  <td className="text-right font-semibold tabular-nums">{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Owner only: clear every saved Test run. The database checks the owner flag too. */
function OwnerTools({ onCleared }: { onCleared: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div data-testid="owner-tools" className="space-y-2 rounded-lg border border-rose-800/60 bg-rose-950/30 p-4">
      <div className="font-semibold text-rose-200">Owner tools</div>
      <p className="text-sm text-slate-300">Clear the leaderboard: deletes every saved Test run for everyone. Names and accounts are kept. This cannot be undone.</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (confirmText !== 'CLEAR') return;
          setBusy(true);
          const err = await clearLeaderboard();
          setBusy(false);
          setConfirmText('');
          setMsg(err ? `Could not clear: ${err}` : 'Leaderboard cleared.');
          if (!err) onCleared();
        }}
      >
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type CLEAR"
          className="w-36 rounded bg-white px-2 py-1 text-sm text-slate-900"
        />
        <button disabled={confirmText !== 'CLEAR' || busy} className="rounded bg-rose-700 px-3 py-1 text-sm font-semibold hover:bg-rose-600 disabled:opacity-50">
          {busy ? 'Clearing…' : 'Clear leaderboard'}
        </button>
      </form>
      {msg && <div className="text-sm text-slate-200">{msg}</div>}
    </div>
  );
}
