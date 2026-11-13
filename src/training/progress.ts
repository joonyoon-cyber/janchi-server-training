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
}

const KEY = 'janchi-pos-sim:progress:v1';

export function loadProgress(): ProgressEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ProgressEntry[];
  } catch {
    return [];
  }
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
    });
  }
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadProgress(), entry].slice(-300)));
  } catch {
    // storage unavailable: results still show on screen
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(KEY);
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
