import { useState } from 'react';
import { setNewPassword } from '../lib/supabase';

/** Shown after opening the link in a "reset your password" email: the person is signed in and picks a new password. */
export function NewPasswordDialog({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Password: at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const err = await setNewPassword(pw);
    setBusy(false);
    if (err) return setError(err);
    setDone(true);
  };

  const input = 'mt-1 w-full rounded bg-white px-3 py-2 text-slate-900';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div data-testid="new-password-dialog" className="w-full max-w-sm space-y-4 rounded-xl bg-slate-800 p-5 text-slate-100 shadow-xl">
        <h2 className="text-lg font-semibold">Set a new password</h2>
        {done ? (
          <>
            <p className="text-sm text-emerald-200">Your password has been changed and you're signed in.</p>
            <button className="w-full rounded-md bg-sky-600 py-2 font-semibold hover:bg-sky-500" onClick={onDone}>
              Continue
            </button>
          </>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <label className="block text-sm">
              New password
              <input data-testid="new-password" type="password" autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
            </label>
            <label className="block text-sm">
              New password again
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
            </label>
            {error && <div className="rounded bg-rose-950/60 p-2 text-sm text-rose-200">{error}</div>}
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded-md border border-slate-500 py-2" onClick={onDone}>
                Later
              </button>
              <button disabled={busy} className="flex-1 rounded-md bg-sky-600 py-2 font-semibold hover:bg-sky-500 disabled:opacity-60">
                {busy ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
