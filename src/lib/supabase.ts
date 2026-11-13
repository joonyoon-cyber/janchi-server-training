import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

// Public project URL and publishable key: safe to ship in the website.
// Access is controlled by the row-level security rules in supabase/schema.sql.
const SUPABASE_URL = 'https://kukdmtnflwzfwxypngzj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K3JzzqP7qctubvywOLDqeA_oHWRan66';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// ---- ID + password accounts -------------------------------------------------
// Supabase password logins need an email, so each ID gets a stand-in address on
// a reserved domain that can never receive mail (".invalid", RFC 2606). No email
// is ever sent: "Confirm email" must be turned off in Supabase.
const ID_DOMAIN = 'janchi-trainer.invalid';
export const ID_RULE = /^[a-z0-9][a-z0-9._-]{2,19}$/;
const idToEmail = (id: string) => `${id.trim().toLowerCase()}@${ID_DOMAIN}`;

export async function signUpWithId(id: string, password: string, name: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signUp({
    email: idToEmail(id),
    password,
    options: { data: { full_name: name.trim() || id.trim().toLowerCase(), username: id.trim().toLowerCase() } },
  });
  if (error) return /registered|exists/i.test(error.message) ? 'That ID is already taken.' : error.message;
  if (!data.session) return 'Account created, but sign-in needs "Confirm email" turned off in Supabase (see docs/SUPABASE_SETUP.md).';
  return null;
}

export async function signInWithId(id: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: idToEmail(id), password });
  if (!error) return null;
  return /invalid login/i.test(error.message) ? 'Wrong ID or password.' : error.message;
}

/** The sign-in window (Google or ID + password), opened from anywhere. */
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
