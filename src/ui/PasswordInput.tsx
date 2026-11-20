import { useState, type InputHTMLAttributes } from 'react';

/** A password field with a Show / Hide button. */
export function PasswordInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-16`} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        data-testid="toggle-password"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-1 my-auto flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 hover:bg-black/10"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
