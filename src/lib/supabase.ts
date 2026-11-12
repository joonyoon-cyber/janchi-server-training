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
      .select('id, display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]);

  const rename = async (name: string) => {
    if (!session) return 'Not signed in';
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', session.user.id);
    if (!error) setProfile({ id: session.user.id, display_name: name });
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
