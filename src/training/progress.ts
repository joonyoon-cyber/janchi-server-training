import type { Evaluation } from './evaluate';
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
