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
  /** Account that played it (signed-in user id). Results are only kept for signed-in accounts. */
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
  // On app start, remove anything older versions saved while signed out.
  if (!cleaned) loadAll();
}

/** Signed-out play (and results from before they were kept per account) is never kept. */
const keep = (p: ProgressEntry) => !!p.owner && p.owner !== 'guest';

let cleaned = false;
function loadAll(): ProgressEntry[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ProgressEntry[];
    // Remove anything saved by older versions while signed out, once.
    if (!cleaned) {
      cleaned = true;
      if (!all.every(keep)) localStorage.setItem(KEY, JSON.stringify(all.filter(keep)));
    }
    return all.filter(keep);
  } catch {
    return [];
  }
}

/**
 * The signed-in account's results kept in this browser (a copy of what is saved to the account,
 * so they show at once). Signed out: nothing is kept, so this is empty.
 */
export function loadProgress(owner: string | null = currentOwner): ProgressEntry[] {
  if (!owner) return [];
  return loadAll().filter((p) => p.owner === owner);
}

/** Saves a finished scenario for the signed-in account. Signed out: the score is shown but not kept anywhere. */
export function saveResult(sc: Scenario, ev: Evaluation) {
  if (!currentOwner) return;
  const entry: ProgressEntry = {
    scenarioId: sc.id,
    title: sc.title,
    level: sc.level,
    generated: !!sc.generated,
    score: ev.score,
    durationSec: ev.durationSec,
    mistakes: ev.incorrect.length + ev.missing.length + ev.wrongQty.length + ev.ayceViolations.length + ev.paymentMistakes.length,
    at: Date.now(),
    owner: currentOwner,
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
  if (!currentOwner) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(loadAll().filter((p) => p.owner !== currentOwner)));
  } catch {
    // ignore
  }
}
