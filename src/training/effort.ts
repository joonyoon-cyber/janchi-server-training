import type { TeamData } from '../lib/supabase';
import { computeAchievements, type Activity } from './achievements';
import type { Level } from './types';

/**
 * How hard someone has been training, from what is saved to their account:
 * Scenario practice (with its play time) and finished Tests (with their clear time).
 * Free Play and anything done signed out are not recorded, so time is a lower bound.
 */

const DAY = 86400000;

export interface Effort {
  /** Training time in the period: scenario play time + Test clear time. */
  timeSec: number;
  practiceRuns: number;
  testsFinished: number;
  /** Tests opened in the period, finished or not. */
  testsStarted: number;
  activeDays: number;
  /** Average training time on a day they trained. */
  perDaySec: number | null;
  /** Consecutive days up to today (or yesterday) with training. */
  streak: number;
  bestStreak: number;
  /** Scenario runs that repeat one they had already played (practicing until it's right). */
  retries: number;
  /** Average change from first to latest score, over scenarios played at least twice (all time). */
  improvement: number | null;
  /** XP earned in the period. */
  xpGained: number;
  xpTotal: number;
  /** Training minutes in each of the last 8 weeks, oldest first. */
  weeks: number[];
  lastActive: number | null;
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function historyOf(data: TeamData, id: string): Activity[] {
  return [
    ...data.practice
      .filter((p) => p.user_id === id)
      .map((p) => ({ kind: 'practice' as const, scenarioId: p.scenario_id, level: p.level as Level, generated: p.generated, score: p.score, durationSec: p.duration_sec, mistakes: p.mistakes, at: Date.parse(p.created_at) })),
    ...data.runs.filter((r) => r.user_id === id).map((r) => ({ kind: 'test' as const, score: r.score, durationSec: r.clear_time_sec, mistakes: 0, at: Date.parse(r.created_at) })),
  ].sort((a, b) => a.at - b.at);
}

export function computeEffort(data: TeamData, id: string, since: number, now = Date.now()): Effort {
  const all = historyOf(data, id);
  const inRange = all.filter((a) => a.at >= since);
  const timeSec = inRange.reduce((t, a) => t + Math.max(0, a.durationSec), 0);
  const days = new Set(inRange.map((a) => dayKey(a.at)));

  // Streaks over all time.
  const allDays = [...new Set(all.map((a) => dayKey(new Date(a.at).setHours(12, 0, 0, 0))))].map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  });
  allDays.sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  allDays.forEach((t, i) => {
    run = i > 0 && Math.round((t - allDays[i - 1]) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const today = new Date(now).setHours(12, 0, 0, 0);
  const last = allDays[allDays.length - 1];
  const streak = last !== undefined && Math.round((today - last) / DAY) <= 1 ? run : 0;

  // Retries and improvement on the same scenario.
  const seen = new Set<string>();
  let retries = 0;
  const firstLast = new Map<string, { first: number; last: number; n: number }>();
  all.forEach((a) => {
    if (a.kind !== 'practice' || !a.scenarioId || a.generated) return;
    if (seen.has(a.scenarioId) && a.at >= since) retries++;
    seen.add(a.scenarioId);
    const f = firstLast.get(a.scenarioId);
    firstLast.set(a.scenarioId, f ? { ...f, last: a.score, n: f.n + 1 } : { first: a.score, last: a.score, n: 1 });
  });
  const repeated = [...firstLast.values()].filter((x) => x.n >= 2);
  const improvement = repeated.length ? Math.round(repeated.reduce((t, x) => t + (x.last - x.first), 0) / repeated.length) : null;

  const xpTotal = computeAchievements(all).xp;
  const xpBefore = since > 0 ? computeAchievements(all.filter((a) => a.at < since)).xp : 0;

  const weekStart = (() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // this Monday
    return d.getTime();
  })();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = weekStart - (7 - i) * 7 * DAY;
    const to = from + 7 * DAY;
    return Math.round(all.filter((a) => a.at >= from && a.at < to).reduce((t, a) => t + a.durationSec, 0) / 60);
  });

  return {
    timeSec,
    practiceRuns: inRange.filter((a) => a.kind === 'practice').length,
    testsFinished: inRange.filter((a) => a.kind === 'test').length,
    testsStarted: Math.max(
      data.starts.filter((s) => s.user_id === id && Date.parse(s.created_at) >= since).length,
      inRange.filter((a) => a.kind === 'test').length,
    ),
    activeDays: days.size,
    perDaySec: days.size ? Math.round(timeSec / days.size) : null,
    streak,
    bestStreak: best,
    retries,
    improvement,
    xpGained: xpTotal - xpBefore,
    xpTotal,
    weeks,
    lastActive: all.length ? all[all.length - 1].at : null,
  };
}

/** e.g. 2h 05m, 14m, 45s */
export function fmtDuration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
