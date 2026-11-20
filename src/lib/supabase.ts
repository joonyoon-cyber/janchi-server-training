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
  /** "emoji:🔥:#be1e2d" for a picked avatar, or a small "data:image/jpeg;base64,…" photo. */
  avatar_url?: string | null;
  /** The badge shown next to the name on the leaderboard. */
  featured_badge?: string | null;
}

export interface LeaderRow {
  user_id: string;
  display_name: string;
  score: number;
  clear_time_sec: number;
  created_at: string;
  attempts: number;
  avatar_url?: string | null;
  featured_badge?: string | null;
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

/** Owner only (checked in the database): start a fresh leaderboard. History is kept for the Team page. */
export async function clearLeaderboard(): Promise<string | null> {
  const { error } = await supabase.rpc('clear_leaderboard');
  return error?.message ?? null;
}

/** Change (or, for Google accounts, add) the signed-in person's password. */
export async function setNewPassword(password: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return null;
  if (/different from the old/i.test(error.message)) return 'Choose a password different from your old one.';
  return error.message;
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
    void (async () => {
      const q = (cols: string) => supabase.from('profiles').select(cols).eq('id', session.user.id).maybeSingle();
      let r = await q('id, display_name, is_owner, avatar_url, featured_badge');
      // Before supabase/profile.sql has been run the new columns do not exist yet.
      if (r.error) r = await q('id, display_name, is_owner');
      setProfile(r.data as unknown as Profile | null);
    })();
  }, [session]);

  const updateProfile = async (patch: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'featured_badge'>>) => {
    if (!session) return 'Not signed in';
    const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
    if (!error) setProfile((p) => ({ ...(p ?? { id: session.user.id, display_name: '' }), ...patch }));
    if (error && /column|schema cache/i.test(error.message)) return 'Profile pictures and badges need one more setup step in Supabase (run supabase/profile.sql).';
    return error?.message ?? null;
  };
  const rename = (name: string) => updateProfile({ display_name: name });

  return { session, profile, ready, rename, updateProfile };
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

/** Everything this person has finished, for their badges. Empty when signed out or on error. */
export async function loadMyActivity(userId: string) {
  const [p, r] = await Promise.all([
    supabase.from('practice_results').select('scenario_id, level, generated, score, duration_sec, mistakes, created_at').eq('user_id', userId).order('created_at').limit(5000),
    supabase.from('test_runs').select('score, clear_time_sec, created_at').eq('user_id', userId).order('created_at').limit(2000),
  ]);
  return {
    practice: (p.data as { scenario_id: string; level: string; generated: boolean; score: number; duration_sec: number; mistakes: number; created_at: string }[]) ?? [],
    tests: (r.data as { score: number; clear_time_sec: number; created_at: string }[]) ?? [],
    error: p.error?.message ?? r.error?.message ?? null,
  };
}

export async function loadMyRuns(userId: string): Promise<RunRow[]> {
  const { data } = await supabase.from('test_runs').select('id, score, clear_time_sec, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
  return (data as RunRow[]) ?? [];
}

// ---- Activity tracking (for the owner's Team page) ----------------------------
// Best effort: nothing is shown to the trainee if these fail (e.g. not signed in).

async function signedInUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** A Test was started (finished or not). */
export async function logTestStart(version: number, seed: number) {
  if (!(await signedInUserId())) return;
  await supabase.from('test_starts').insert({ version, seed });
}

/** A Scenario practice run was finished. */
export async function savePractice(r: { scenario_id: string; title: string; level: string; generated: boolean; score: number; duration_sec: number; mistakes: number }) {
  if (!(await signedInUserId())) return;
  await supabase.from('practice_results').insert(r);
}

export interface TeamMember {
  id: string;
  display_name: string;
  email: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
  is_owner: boolean;
}
export interface TeamRun {
  user_id: string;
  version: number;
  score: number;
  clear_time_sec: number;
  created_at: string;
  tables: { categories?: { name: string; earned: number; possible: number }[]; mistakes?: number } | null;
}
export interface TeamStart {
  user_id: string;
  created_at: string;
}
export interface TeamPractice {
  user_id: string;
  scenario_id: string;
  title: string;
  level: string;
  generated: boolean;
  score: number;
  duration_sec: number;
  mistakes: number;
  created_at: string;
}
export interface TeamData {
  members: TeamMember[];
  /** Profile pictures by person (empty until supabase/profile.sql has been run). */
  avatars: Record<string, string | null>;
  runs: TeamRun[];
  starts: TeamStart[];
  practice: TeamPractice[];
  error: string | null;
}

/** Owner only: everything the Team page needs. The database refuses anyone else. */
export async function loadTeam(): Promise<TeamData> {
  const [m, r, s, p] = await Promise.all([
    supabase.rpc('team_members'),
    supabase.from('test_runs').select('user_id, version, score, clear_time_sec, created_at, tables').order('created_at').limit(5000),
    supabase.from('test_starts').select('user_id, created_at').order('created_at').limit(10000),
    supabase.from('practice_results').select('user_id, scenario_id, title, level, generated, score, duration_sec, mistakes, created_at').order('created_at').limit(10000),
  ]);
  const error = m.error?.message ?? r.error?.message ?? s.error?.message ?? p.error?.message ?? null;
  // Pictures are optional: missing before profile.sql has been run.
  const av = await supabase.from('profiles').select('id, avatar_url');
  const avatars: Record<string, string | null> = {};
  if (!av.error && Array.isArray(av.data)) (av.data as { id: string; avatar_url: string | null }[]).forEach((x) => (avatars[x.id] = x.avatar_url));
  return {
    avatars,
    members: (m.data as TeamMember[]) ?? [],
    runs: (r.data as TeamRun[]) ?? [],
    starts: (s.data as TeamStart[]) ?? [],
    practice: (p.data as TeamPractice[]) ?? [],
    error,
  };
}
