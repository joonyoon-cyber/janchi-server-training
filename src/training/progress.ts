import type { Evaluation } from './evaluate';
import { savePractice } from '../lib/supabase';
import type { Level, Scenario } from './types';

export interface ProgressEntry {
  scenarioId: string;
  title: string;
  level: Level;
  generated: boolean;
  score: number;
  durationSec: number;
  mistakes: number;
  at: number;
  /**
   * Account that played it (signed-in user id), or 'guest' when played signed out.
   * Missing on results saved before results were kept per account: those are ignored,
   * because we can't tell whose they were (signed-in ones are on the account anyway).
   */
  owner?: string;
}

const KEY = 'janchi-pos-sim:progress:v1';

/**
 * Who is playing on this browser right now (set by the app when someone signs in or out).
 * Results are kept per account, so a second account on the same computer starts fresh.
 */
let currentOwner: string | null = null;
export function setProgressOwner(userId: string | null) {
  currentOwner = userId;
}

function loadAll(): ProgressEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ProgressEntry[];
  } catch {
    return [];
  }
}

const GUEST = 'guest';

/** Results saved in this browser for one account (default: whoever is signed in; null = signed out). */
export function loadProgress(owner: string | null = currentOwner): ProgressEntry[] {
  const who = owner ?? GUEST;
  return loadAll().filter((p) => p.owner === who);
}

export function saveResult(sc: Scenario, ev: Evaluation) {
  const entry: ProgressEntry = {
    scenarioId: sc.id,
    title: sc.title,
    level: sc.level,
    generated: !!sc.generated,
    score: ev.score,
    durationSec: ev.durationSec,
    mistakes: ev.incorrect.length + ev.missing.length + ev.wrongQty.length + ev.ayceViolations.length + ev.paymentMistakes.length,
    at: Date.now(),
    owner: currentOwner ?? GUEST,
  };
  // Scenario practice also goes to the owner's Team page when signed in (Tests are saved separately).
  if (!sc.id.startsWith('test-')) {
    void savePractice({
      scenario_id: sc.generated ? `generated-${sc.level}` : sc.id,
      title: sc.generated ? `Random ${sc.level} table` : sc.title,
      level: sc.level,
      generated: !!sc.generated,
      score: entry.score,
      duration_sec: Math.round(entry.durationSec),
      mistakes: entry.mistakes,
    }).then(announce);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadAll(), entry].slice(-2000)));
  } catch {
    // storage unavailable: results still show on screen
  }
  announce();
}

/** Badges and the profile refresh on this (see activity.ts). */
function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('janchi:activity'));
}

/** Clears this account's results in this browser (other accounts' stay). */
export function clearProgress() {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadAll().filter((p) => p.owner !== (currentOwner ?? GUEST))));
  } catch {
    // ignore
  }
}

export function bestScores(): Record<string, number> {
  const best: Record<string, number> = {};
  loadProgress().forEach((p) => {
    best[p.scenarioId] = Math.max(best[p.scenarioId] ?? 0, p.score);
  });
  return best;
}
