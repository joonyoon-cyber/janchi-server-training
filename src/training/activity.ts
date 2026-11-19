import { useEffect, useState } from 'react';
import { loadMyActivity } from '../lib/supabase';
import { computeAchievements, type Achievements, type Activity } from './achievements';
import { loadProgress } from './progress';
import type { Level } from './types';

/**
 * A trainee's history for badges: what was saved to their account (any device) plus
 * scenarios finished in this browser, including before they signed in.
 */

const EVENT = 'janchi:activity';

/** Call after a scenario or Test is saved so badges and the profile update. */
export function activityChanged() {
  window.dispatchEvent(new Event(EVENT));
}

function localActivity(): Activity[] {
  return loadProgress()
    .filter((p) => !p.scenarioId.startsWith('test-'))
    .map((p) => ({
      kind: 'practice' as const,
      scenarioId: p.generated ? `generated-${p.level}` : p.scenarioId,
      level: p.level,
      generated: p.generated,
      score: p.score,
      durationSec: p.durationSec,
      mistakes: p.mistakes,
      at: p.at,
    }));
}

/** Server rows and local entries for the same run are close in time: keep one. */
export function mergeActivity(server: Activity[], local: Activity[]): Activity[] {
  const out = [...server];
  for (const l of local) {
    const dup = server.some((s) => s.kind === 'practice' && s.scenarioId === l.scenarioId && s.score === l.score && Math.abs(s.at - l.at) < 120000);
    if (!dup) out.push(l);
  }
  return out;
}

export async function loadActivity(userId: string | null): Promise<Activity[]> {
  const local = localActivity();
  if (!userId) return local;
  const r = await loadMyActivity(userId);
  const server: Activity[] = [
    ...r.practice.map((p) => ({
      kind: 'practice' as const,
      scenarioId: p.scenario_id,
      level: p.level as Level,
      generated: p.generated,
      score: p.score,
      durationSec: p.duration_sec,
      mistakes: p.mistakes,
      at: Date.parse(p.created_at),
    })),
    ...r.tests.map((t) => ({ kind: 'test' as const, score: t.score, durationSec: t.clear_time_sec, mistakes: 0, at: Date.parse(t.created_at) })),
  ];
  return mergeActivity(server, local);
}

/** Badges for the signed-in person (or this browser when signed out); refreshes after each run. */
export function useAchievements(userId: string | null) {
  const [state, setState] = useState<{ a: Achievements; history: Activity[]; loading: boolean; forUser: string | null }>(() => {
    const h = localActivity();
    return { a: computeAchievements(h), history: h, loading: !!userId, forUser: userId };
  });
  useEffect(() => {
    let live = true;
    const load = () =>
      void loadActivity(userId).then((h) => {
        if (live) setState({ a: computeAchievements(h), history: h, loading: false, forUser: userId });
      });
    load();
    window.addEventListener(EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(EVENT, load);
    };
  }, [userId]);
  // Right after signing in or out, the badges shown still belong to the previous person.
  return { ...state, loading: state.loading || state.forUser !== userId };
}
