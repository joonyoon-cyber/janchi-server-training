import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

// Public project URL and publishable key: safe to ship in the website.
// Access is controlled by the row-level security rules in supabase/schema.sql.
const SUPABASE_URL = 'https://kukdmtnflwzfwxypngzj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K3JzzqP7qctubvywOLDqeA_oHWRan66';

// Stay signed in across reloads and browser restarts: the session is kept in localStorage
// and the access token is refreshed automatically. Google sign-in uses the PKCE flow
// (a one-time code in the return URL instead of tokens).
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export interface Profile {
  id: string;
  display_name: string;
  /** The restaurant owner: can clear the leaderboard. Set only by SQL in Supabase. */
  is_owner?: boolean;
}

export interface LeaderRow {
  user_id: string;
  display_name: string;
  score: number;
  clear_time_sec: number;
  created_at: string;
  attempts: number;
}

export interface RunRow {
  id: number;
  score: number;
  clear_time_sec: number;
  created_at: string;
}

export function signInWithGoogle() {
  // Come back to the same page (works on GitHub Pages and on localhost).
  const redirectTo = window.location.origin + window.location.pathname;
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

// ---- Email + password accounts ---------------------------------------------
// "Confirm email" is off in Supabase, so an account works as soon as it is created
// and no email is ever sent.
export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function signUpWithEmail(email: string, password: string, name: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: clean,
    password,
    options: { data: { full_name: name.trim() || clean.split('@')[0] } },
  });
  if (error) return /registered|exists/i.test(error.message) ? 'An account with this email already exists. Use Sign in.' : error.message;
  if (!data.session) return 'Account created, but sign-in needs "Confirm email" turned off in Supabase (see docs/SUPABASE_SETUP.md).';
  return null;
}

export async function signInWithEmail(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (!error) return null;
  return /invalid login/i.test(error.message) ? 'Wrong email or password.' : error.message;
}

/** The sign-in window (Google or email + password), opened from anywhere. */
let signInOpen = false;
const signInListeners = new Set<() => void>();
export function openSignIn(open = true) {
  signInOpen = open;
  signInListeners.forEach((l) => l());
}
export function useSignInOpen() {
  const [open, setOpen] = useState(signInOpen);
  useEffect(() => {
    const l = () => setOpen(signInOpen);
    signInListeners.add(l);
    return () => {
      signInListeners.delete(l);
    };
  }, []);
  return open;
}

/** Owner only (checked in the database): delete every saved Test run. */
export async function clearLeaderboard(): Promise<string | null> {
  const { error } = await supabase.rpc('clear_leaderboard');
  return error?.message ?? null;
}

export function signOut() {
  return supabase.auth.signOut();
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // INITIAL_SESSION fires once the saved session (if any) has been restored.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setProfile(null);
    supabase
      .from('profiles')
      .select('id, display_name, is_owner')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]);

  const rename = async (name: string) => {
    if (!session) return 'Not signed in';
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', session.user.id);
    if (!error) setProfile((p) => ({ ...(p ?? { id: session.user.id }), display_name: name }));
    return error?.message ?? null;
  };

  return { session, profile, ready, rename };
}

export async function saveRun(run: { version: number; seed: number; score: number; clear_time_sec: number; tables: unknown; events: unknown }) {
  const { error } = await supabase.from('test_runs').insert(run);
  return error?.message ?? null;
}

export async function loadLeaderboard(): Promise<{ rows: LeaderRow[]; error: string | null }> {
  const { data, error } = await supabase.from('leaderboard').select('*');
  const rows = ((data as LeaderRow[]) ?? []).sort((a, b) => b.score - a.score || a.clear_time_sec - b.clear_time_sec || a.created_at.localeCompare(b.created_at));
  return { rows, error: error?.message ?? null };
}

export async function loadMyRuns(userId: string): Promise<RunRow[]> {
  const { data } = await supabase.from('test_runs').select('id, score, clear_time_sec, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
  return (data as RunRow[]) ?? [];
}
