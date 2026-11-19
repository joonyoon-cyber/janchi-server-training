import { scenarios } from './scenarios';
import type { Level } from './types';

/**
 * Achievements and badges, worked out from a trainee's history (Scenario practice and Tests).
 * Nothing extra is stored: replaying the history in time order gives each badge, its tier and
 * the moment it was earned, so badges are the same on every device once signed in.
 */

export interface Activity {
  kind: 'practice' | 'test';
  /** Built-in scenario id, or `generated-<level>` for a random table. */
  scenarioId?: string;
  level?: Level;
  generated?: boolean;
  score: number;
  durationSec: number;
  mistakes: number;
  at: number;
}

export type Group = 'Scenarios' | 'Skills' | 'Tests' | 'Habits';

export interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  /** What to do, with {n} for the next target. */
  goal: string;
  group: Group;
  /** Targets for each tier, lowest first. One target = a single badge, three = bronze/silver/gold. */
  tiers: number[];
  value: (s: Stats) => number;
  /** Not shown until earned (a surprise). */
  secret?: boolean;
}

export interface BadgeState {
  def: BadgeDef;
  value: number;
  /** Tiers earned (0 = none yet). */
  tier: number;
  /** When each earned tier was reached. */
  earnedAt: number[];
  /** Next target, or null when every tier is earned. */
  next: number | null;
}

export const TIER_NAMES = ['Bronze', 'Silver', 'Gold'];

export const BUILT_IN = scenarios.map((s) => ({ id: s.id, title: s.title, level: s.level, target: s.targetSeconds }));
const LEVEL_IDS = (l: Level) => BUILT_IN.filter((s) => s.level === l).map((s) => s.id);
const TARGET = new Map(BUILT_IN.map((s) => [s.id, s.target]));

export interface Stats {
  runs: number;
  /** Best score per built-in scenario (finished at least once). */
  best: Map<string, number>;
  first: Map<string, number>;
  random: number;
  clean: number;
  perfect: number;
  fast: number;
  comeback: number;
  tests: number;
  test80: number;
  test90: number;
  test100: number;
  testBest: number;
  testImproved: number;
  quickTest: number;
  days: Set<string>;
  streak: number;
  bestStreak: number;
  lastDay: string | null;
  early: number;
  late: number;
  bigDay: Map<string, number>;
  maxDay: number;
}

const finished = (s: Stats, ids: string[]) => ids.filter((id) => s.best.has(id)).length;
const mastered = (s: Stats, ids: string[], min = 90) => ids.filter((id) => (s.best.get(id) ?? -1) >= min).length;

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const prevDayKey = (t: number) => dayKey(new Date(new Date(t).setHours(12) - 86400000).getTime());

export const BADGES: BadgeDef[] = [
  // ---- Finishing the scenarios: the main goal is to play every one at least once.
  { id: 'first-table', icon: '🍽️', name: 'First Table', goal: 'Finish your first scenario', group: 'Scenarios', tiers: [1], value: (s) => s.best.size },
  { id: 'beginner', icon: '🌱', name: 'Beginner Graduate', goal: 'Finish every Beginner scenario', group: 'Scenarios', tiers: [LEVEL_IDS('beginner').length], value: (s) => finished(s, LEVEL_IDS('beginner')) },
  { id: 'intermediate', icon: '🔥', name: 'Intermediate Graduate', goal: 'Finish every Intermediate scenario', group: 'Scenarios', tiers: [LEVEL_IDS('intermediate').length], value: (s) => finished(s, LEVEL_IDS('intermediate')) },
  { id: 'advanced', icon: '🎓', name: 'Advanced Graduate', goal: 'Finish every Advanced scenario', group: 'Scenarios', tiers: [LEVEL_IDS('advanced').length], value: (s) => finished(s, LEVEL_IDS('advanced')) },
  { id: 'passport', icon: '🛂', name: 'Full Passport', goal: 'Finish all {n} scenarios at least once', group: 'Scenarios', tiers: [BUILT_IN.length], value: (s) => finished(s, BUILT_IN.map((x) => x.id)) },
  { id: 'mastery', icon: '⭐', name: 'Scenario Master', goal: 'Score 90+ on {n} different scenarios', group: 'Scenarios', tiers: [5, 15, BUILT_IN.length], value: (s) => mastered(s, BUILT_IN.map((x) => x.id)) },
  { id: 'regular', icon: '🔁', name: 'Practice Makes Perfect', goal: 'Finish {n} scenario runs', group: 'Scenarios', tiers: [10, 50, 150], value: (s) => s.runs },
  { id: 'wild-card', icon: '🎲', name: 'Wild Card', goal: 'Finish {n} random tables', group: 'Scenarios', tiers: [5, 20, 50], value: (s) => s.random },

  // ---- Skills: groups of scenarios that teach one thing, done well (90+).
  { id: 'void', icon: '✂️', name: 'Clean Cut', goal: 'Score 90+ on both cancel and void scenarios', group: 'Skills', tiers: [2], value: (s) => mastered(s, ['cancel-before-send', 'void-missing-drink']) },
  { id: 'split', icon: '💳', name: 'Split Decision', goal: 'Score 90+ on both split-payment scenarios', group: 'Skills', tiers: [2], value: (s) => mastered(s, ['part-cash-part-card', 'split-one-cash']) },
  { id: 'party', icon: '🎉', name: 'Big Party Pro', goal: 'Score 90+ on the parties of 6 and 8 (18% gratuity)', group: 'Skills', tiers: [2], value: (s) => mastered(s, ['party-of-six', 'party-of-eight']) },
  { id: 'ayce', icon: '🥩', name: 'AYCE Rules Guru', goal: 'Score 90+ on all three AYCE rules scenarios', group: 'Skills', tiers: [3], value: (s) => mastered(s, ['e-meat-limit', 'ayce-same-choice', 'ayce-disability-exception']) },
  { id: 'floor', icon: '🧭', name: 'Floor Manager', goal: 'Score 90+ on moving and joining tables', group: 'Skills', tiers: [2], value: (s) => mastered(s, ['bar-to-table', 'two-tables']) },
  { id: 'counter', icon: '🛍️', name: 'Counter Crew', goal: 'Score 90+ on the take-out, macaron and gift card scenarios', group: 'Skills', tiers: [3], value: (s) => mastered(s, ['counter-takeout', 'counter-macaron', 'counter-gift-card']) },
  { id: 'clean', icon: '🧼', name: 'Spotless', goal: 'Finish {n} scenarios with zero mistakes', group: 'Skills', tiers: [1, 10, 30], value: (s) => s.clean },
  { id: 'fast', icon: '⚡', name: 'Quick Hands', goal: 'Score 90+ faster than the target time, {n} times', group: 'Skills', tiers: [1, 10, 25], value: (s) => s.fast },
  { id: 'perfect', icon: '💯', name: 'Perfectionist', goal: 'Score 100 on a scenario', group: 'Skills', tiers: [1, 5, 15], value: (s) => s.perfect },
  { id: 'comeback', icon: '📈', name: 'Comeback', goal: 'Beat your first score on a scenario by 30+ points', group: 'Skills', tiers: [1], value: (s) => s.comeback },

  // ---- Tests
  { id: 'clocked-in', icon: '⏱️', name: 'Clocked In', goal: 'Finish {n} Tests', group: 'Tests', tiers: [1, 5, 15], value: (s) => s.tests },
  { id: 'test80', icon: '🥉', name: 'Solid Service', goal: 'Score 80+ on the Test {n} times', group: 'Tests', tiers: [1, 3, 10], value: (s) => s.test80 },
  { id: 'test90', icon: '🥈', name: 'Excellent Service', goal: 'Score 90+ on the Test {n} times', group: 'Tests', tiers: [1, 3, 10], value: (s) => s.test90 },
  { id: 'test100', icon: '🏆', name: 'Flawless Shift', goal: 'Score 100 on the Test', group: 'Tests', tiers: [1, 3], value: (s) => s.test100 },
  { id: 'pb', icon: '🚀', name: 'Personal Best', goal: 'Beat your best Test score {n} times', group: 'Tests', tiers: [1, 3, 5], value: (s) => s.testImproved },
  { id: 'rush', icon: '🏃', name: 'Dinner Rush', goal: 'Score 90+ on the Test in under 20 minutes', group: 'Tests', tiers: [1], value: (s) => s.quickTest },

  // ---- Habits
  { id: 'streak', icon: '📅', name: 'On a Roll', goal: 'Train {n} days in a row', group: 'Habits', tiers: [3, 7, 14], value: (s) => s.bestStreak },
  { id: 'days', icon: '🗓️', name: 'Dedicated', goal: 'Train on {n} different days', group: 'Habits', tiers: [5, 15, 40], value: (s) => s.days.size },
  { id: 'double-shift', icon: '💪', name: 'Double Shift', goal: 'Finish {n} runs in one day', group: 'Habits', tiers: [10], value: (s) => s.maxDay },
  { id: 'early', icon: '🌅', name: 'Early Bird', goal: 'Train before 9 AM', group: 'Habits', tiers: [1], value: (s) => s.early, secret: true },
  { id: 'night', icon: '🌙', name: 'Night Owl', goal: 'Train after 11 PM', group: 'Habits', tiers: [1], value: (s) => s.late, secret: true },
];

export const BADGE = new Map(BADGES.map((b) => [b.id, b]));

function emptyStats(): Stats {
  return {
    runs: 0,
    best: new Map(),
    first: new Map(),
    random: 0,
    clean: 0,
    perfect: 0,
    fast: 0,
    comeback: 0,
    tests: 0,
    test80: 0,
    test90: 0,
    test100: 0,
    testBest: -1,
    testImproved: 0,
    quickTest: 0,
    days: new Set(),
    streak: 0,
    bestStreak: 0,
    lastDay: null,
    early: 0,
    late: 0,
    bigDay: new Map(),
    maxDay: 0,
  };
}

function add(s: Stats, a: Activity) {
  const day = dayKey(a.at);
  if (s.lastDay !== day) {
    s.streak = s.lastDay === prevDayKey(a.at) ? s.streak + 1 : 1;
    s.lastDay = day;
  }
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  s.days.add(day);
  const n = (s.bigDay.get(day) ?? 0) + 1;
  s.bigDay.set(day, n);
  s.maxDay = Math.max(s.maxDay, n);
  const h = new Date(a.at).getHours();
  if (h >= 4 && h < 9) s.early++;
  if (h >= 23 || h < 4) s.late++;

  if (a.kind === 'test') {
    s.tests++;
    if (a.score >= 80) s.test80++;
    if (a.score >= 90) s.test90++;
    if (a.score >= 100) s.test100++;
    if (a.score >= 90 && a.durationSec < 20 * 60) s.quickTest++;
    if (s.testBest >= 0 && a.score > s.testBest) s.testImproved++;
    s.testBest = Math.max(s.testBest, a.score);
    return;
  }
  s.runs++;
  if (a.mistakes === 0) s.clean++;
  if (a.generated || !a.scenarioId || !TARGET.has(a.scenarioId)) {
    s.random++;
    return;
  }
  const id = a.scenarioId;
  if (a.score >= 100) s.perfect++;
  if (a.score >= 90 && a.durationSec <= (TARGET.get(id) ?? 0)) s.fast++;
  if (!s.first.has(id)) s.first.set(id, a.score);
  else if (a.score - (s.first.get(id) ?? 100) >= 30 && (s.best.get(id) ?? 0) - (s.first.get(id) ?? 100) < 30) s.comeback++;
  s.best.set(id, Math.max(s.best.get(id) ?? 0, a.score));
}

export interface Achievements {
  badges: BadgeState[];
  stats: Stats;
  /** Experience points: every run counts, every badge tier counts more. */
  xp: number;
  rank: Rank;
}

export interface Rank {
  title: string;
  icon: string;
  level: number;
  /** XP where this rank starts and the next begins (null at the top). */
  from: number;
  to: number | null;
}

const RANKS = [
  { title: 'Trainee', icon: '🥚', xp: 0 },
  { title: 'Busser', icon: '🧽', xp: 100 },
  { title: 'Host', icon: '👋', xp: 300 },
  { title: 'Server', icon: '🍽️', xp: 650 },
  { title: 'Senior Server', icon: '🔥', xp: 1100 },
  { title: 'Captain', icon: '🎖️', xp: 1700 },
  { title: 'Floor Legend', icon: '👑', xp: 2500 },
];

export function rankFor(xp: number): Rank {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  return { title: RANKS[i].title, icon: RANKS[i].icon, level: i + 1, from: RANKS[i].xp, to: RANKS[i + 1]?.xp ?? null };
}

const TIER_XP = [50, 100, 200];

/** Replays the history in time order and works out every badge. */
export function computeAchievements(history: Activity[]): Achievements {
  const list = [...history].sort((a, b) => a.at - b.at);
  const s = emptyStats();
  const earnedAt = new Map<string, number[]>(BADGES.map((b) => [b.id, []]));
  let xp = 0;
  for (const a of list) {
    add(s, a);
    xp += a.kind === 'test' ? 25 : 10;
    for (const b of BADGES) {
      const got = earnedAt.get(b.id)!;
      const v = b.value(s);
      while (got.length < b.tiers.length && v >= b.tiers[got.length]) got.push(a.at);
    }
  }
  const badges = BADGES.map((def) => {
    const got = earnedAt.get(def.id)!;
    xp += got.reduce((t, _, i) => t + TIER_XP[Math.min(i, 2)], 0);
    return { def, value: def.value(s), tier: got.length, earnedAt: got, next: def.tiers[got.length] ?? null };
  });
  return { badges, stats: s, xp, rank: rankFor(xp) };
}

/** "Finish all 28 scenarios at least once" with the target filled in. */
export function goalText(b: BadgeState) {
  return b.def.goal.replace('{n}', String(b.next ?? b.def.tiers[b.def.tiers.length - 1]));
}

/** Key for one earned tier, used to announce new badges once. */
export const tierKey = (id: string, tier: number) => `${id}:${tier}`;

export function earnedKeys(a: Achievements): string[] {
  return a.badges.flatMap((b) => b.earnedAt.map((_, i) => tierKey(b.def.id, i + 1)));
}
