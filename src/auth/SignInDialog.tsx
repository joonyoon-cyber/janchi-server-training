import { useState } from 'react';
import { ID_RULE, openSignIn, signInWithGoogle, signInWithId, signUpWithId, useSignInOpen } from '../lib/supabase';

/** Sign in with Google, or with an ID and password (sign in / create an account). */
export function SignInDialog() {
  const open = useSignInOpen();
  const [tab, setTab] = useState<'signin' | 'create'>('signin');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const close = () => {
    openSignIn(false);
    setPassword('');
    setPassword2('');
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = id.trim().toLowerCase();
    if (!ID_RULE.test(cleanId)) return setError('ID: 3–20 characters, letters, numbers, . _ or -, starting with a letter or number.');
    if (password.length < 8) return setError('Password: at least 8 characters.');
    if (tab === 'create' && password !== password2) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const err = tab === 'create' ? await signUpWithId(cleanId, password, name) : await signInWithId(cleanId, password);
    setBusy(false);
    if (err) return setError(err);
    close();
  };

  const input = 'mt-1 w-full rounded bg-white px-3 py-2 text-slate-900';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div data-testid="sign-in-dialog" className="w-full max-w-sm space-y-4 rounded-xl bg-slate-800 p-5 text-slate-100 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <button className="text-slate-400 hover:text-slate-200" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <button className="w-full rounded-md bg-white py-2 font-semibold text-slate-900" onClick={() => signInWithGoogle()}>
          Sign in with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-600" />
          or use an ID and password
          <div className="h-px flex-1 bg-slate-600" />
        </div>

        <div className="flex rounded-md bg-slate-900 p-0.5 text-sm font-semibold">
          {(['signin', 'create'] as const).map((t) => (
            <button
              key={t}
              data-testid={`tab-${t}`}
              className={`flex-1 rounded px-3 py-1.5 ${tab === t ? 'bg-sky-600' : 'text-slate-300'}`}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
            >
              {t === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm">
            ID
            <input data-testid="id-input" autoFocus autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} className={input} />
          </label>
          <label className="block text-sm">
            Password
            <input
              data-testid="password-input"
              type="password"
              autoComplete={tab === 'create' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
          {tab === 'create' && (
            <>
              <label className="block text-sm">
                Password again
                <input type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} className={input} />
              </label>
              <label className="block text-sm">
                Name on the leaderboard <span className="text-slate-400">(optional; you can change it later)</span>
                <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={input} />
              </label>
              <p className="text-xs text-slate-400">
                ID: 3–20 characters (letters, numbers, . _ -). Password: at least 8 characters. There is no password reset by email, so keep it somewhere safe;
                the manager can help if you forget it.
              </p>
            </>
          )}
          {error && <div className="rounded bg-rose-950/60 p-2 text-sm text-rose-200">{error}</div>}
          <button data-testid="id-submit" disabled={busy} className="w-full rounded-md bg-sky-600 py-2 font-semibold hover:bg-sky-500 disabled:opacity-60">
            {busy ? 'Please wait…' : tab === 'create' ? 'Create account' : 'Sign in'}
          </button>
        </form>
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
    </div>
  );
}
