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
  /** What earns it, in plain words (no numbers for badges with levels: the ladder shows them). */
  desc: string;
  /** What is counted, for the ladder and progress ("Tests finished"). */
  unit: string;
  group: Group;
  /** Targets for each level, lowest first. One target = a single badge, three = bronze/silver/gold. */
  tiers: number[];
  /** XP for each level (default 50 / 100 / 200). */
  xp?: number[];
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
  /** Runs of a built-in scenario already finished before. */
  replays: number;
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
  { id: 'first-table', icon: '🍽️', name: 'First Table', desc: 'Finish your first scenario.', unit: 'scenarios finished', group: 'Scenarios', tiers: [1], value: (s) => s.best.size },
  { id: 'beginner', icon: '🌱', name: 'Beginner Graduate', desc: 'Finish every Beginner scenario at least once.', unit: 'Beginner scenarios finished', group: 'Scenarios', tiers: [LEVEL_IDS('beginner').length], xp: [100], value: (s) => finished(s, LEVEL_IDS('beginner')) },
  { id: 'intermediate', icon: '🔥', name: 'Intermediate Graduate', desc: 'Finish every Intermediate scenario at least once.', unit: 'Intermediate scenarios finished', group: 'Scenarios', tiers: [LEVEL_IDS('intermediate').length], xp: [150], value: (s) => finished(s, LEVEL_IDS('intermediate')) },
  { id: 'advanced', icon: '🎓', name: 'Advanced Graduate', desc: 'Finish every Advanced scenario at least once.', unit: 'Advanced scenarios finished', group: 'Scenarios', tiers: [LEVEL_IDS('advanced').length], xp: [200], value: (s) => finished(s, LEVEL_IDS('advanced')) },
  { id: 'passport', icon: '🛂', name: 'Full Passport', desc: `Finish all ${BUILT_IN.length} scenarios at least once.`, unit: 'scenarios finished', group: 'Scenarios', tiers: [BUILT_IN.length], xp: [300], value: (s) => finished(s, BUILT_IN.map((x) => x.id)) },
  { id: 'mastery', icon: '⭐', name: 'Scenario Master', desc: 'Score 90 or higher on different scenarios (each scenario counts once).', unit: 'scenarios at 90+', group: 'Scenarios', tiers: [5, 15, BUILT_IN.length], value: (s) => mastered(s, BUILT_IN.map((x) => x.id)) },
  { id: 'regular', icon: '🔁', name: 'Practice Makes Perfect', desc: 'Finish scenario runs. Every run counts, replays too.', unit: 'scenario runs', group: 'Scenarios', tiers: [10, 50, 150], value: (s) => s.runs },
  { id: 'wild-card', icon: '🎲', name: 'Wild Card', desc: 'Finish random tables (the 🎲 Random scenario).', unit: 'random tables', group: 'Scenarios', tiers: [5, 20, 50], value: (s) => s.random },

  // ---- Skills: groups of scenarios that teach one thing, done well (90+).
  { id: 'void', icon: '✂️', name: 'Clean Cut', desc: 'Score 90 or higher on both the cancel and the void scenarios.', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [2], xp: [100], value: (s) => mastered(s, ['cancel-before-send', 'void-missing-drink']) },
  { id: 'split', icon: '💳', name: 'Split Decision', desc: 'Score 90 or higher on both split-payment scenarios.', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [2], xp: [100], value: (s) => mastered(s, ['part-cash-part-card', 'split-one-cash']) },
  { id: 'party', icon: '🎉', name: 'Big Party Pro', desc: 'Score 90 or higher on the parties of six and eight (18% gratuity).', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [2], xp: [100], value: (s) => mastered(s, ['party-of-six', 'party-of-eight']) },
  { id: 'ayce', icon: '🥩', name: 'AYCE Rules Guru', desc: 'Score 90 or higher on all three AYCE rules scenarios.', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [3], xp: [100], value: (s) => mastered(s, ['e-meat-limit', 'ayce-same-choice', 'ayce-disability-exception']) },
  { id: 'floor', icon: '🧭', name: 'Floor Manager', desc: 'Score 90 or higher on moving a bar party and on two tables at once.', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [2], xp: [100], value: (s) => mastered(s, ['bar-to-table', 'two-tables']) },
  { id: 'counter', icon: '🛍️', name: 'Counter Crew', desc: 'Score 90 or higher on the take-out, macaron and gift card scenarios.', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [3], xp: [100], value: (s) => mastered(s, ['counter-takeout', 'counter-macaron', 'counter-gift-card']) },
  { id: 'discounts', icon: '🏷️', name: 'By the Book', desc: 'Score 90 or higher on all three employee discount scenarios (on duty, family, and who qualifies).', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [3], xp: [100], value: (s) => mastered(s, ['employee-meal', 'family-discount', 'discount-policy']) },
  { id: 'slips', icon: '🧾', name: 'Paper Trail', desc: 'Score 90 or higher on both signed-slip scenarios (enter every tip on the right payment).', unit: 'of these scenarios at 90+', group: 'Skills', tiers: [2], xp: [100], value: (s) => mastered(s, ['tip-slip', 'tip-split-slips']) },
  { id: 'clean', icon: '🧼', name: 'Spotless', desc: 'Finish a scenario with zero mistakes. Every such run counts.', unit: 'mistake-free runs', group: 'Skills', tiers: [1, 10, 30], value: (s) => s.clean },
  { id: 'fast', icon: '⚡', name: 'Quick Hands', desc: "Score 90 or higher in less than the scenario's target time.", unit: 'fast 90+ runs', group: 'Skills', tiers: [1, 10, 25], value: (s) => s.fast },
  { id: 'perfect', icon: '💯', name: 'Perfectionist', desc: 'Score 100 on a scenario. Every 100 counts, replays too.', unit: 'runs scored 100', group: 'Skills', tiers: [1, 5, 15], value: (s) => s.perfect },
  { id: 'replay', icon: '📈', name: 'Back for More', desc: 'Play a scenario again after you have finished it once.', unit: 'replays', group: 'Skills', tiers: [3, 10, 30], value: (s) => s.replays },

  // ---- Tests
  { id: 'clocked-in', icon: '⏱️', name: 'Clocked In', desc: 'Finish the Test (all 10 tables).', unit: 'Tests finished', group: 'Tests', tiers: [1, 5, 15], value: (s) => s.tests },
  { id: 'test80', icon: '🥉', name: 'Solid Service', desc: 'Finish the Test with 80 or higher (90s and 100s count too).', unit: 'Tests at 80+', group: 'Tests', tiers: [1, 3, 10], value: (s) => s.test80 },
  { id: 'test90', icon: '🥈', name: 'Excellent Service', desc: 'Finish the Test with 90 or higher (100s count too).', unit: 'Tests at 90+', group: 'Tests', tiers: [1, 3, 10], value: (s) => s.test90 },
  { id: 'test100', icon: '🏆', name: 'Flawless Shift', desc: 'Finish the Test with a perfect 100.', unit: 'Tests at 100', group: 'Tests', tiers: [1, 3], xp: [150, 300], value: (s) => s.test100 },
  { id: 'pb', icon: '🚀', name: 'Personal Best', desc: 'Match or beat your best Test score so far. Your first Test sets the bar; a 100 again counts.', unit: 'Tests at or above your best', group: 'Tests', tiers: [1, 3, 5], value: (s) => s.testImproved },
  { id: 'rush', icon: '🏃', name: 'Dinner Rush', desc: 'Finish the Test with 90 or higher in under 20 minutes.', unit: 'fast 90+ Tests', group: 'Tests', tiers: [1], xp: [100], value: (s) => s.quickTest },

  // ---- Habits
  { id: 'streak', icon: '📅', name: 'On a Roll', desc: 'Train on days in a row (any scenario or Test counts for the day).', unit: 'days in a row', group: 'Habits', tiers: [3, 7, 14], value: (s) => s.bestStreak },
  { id: 'days', icon: '🗓️', name: 'Dedicated', desc: 'Train on different days.', unit: 'days trained', group: 'Habits', tiers: [5, 15, 40], value: (s) => s.days.size },
  { id: 'double-shift', icon: '💪', name: 'Double Shift', desc: 'Finish 10 runs (scenarios or Tests) in one day.', unit: 'runs in one day', group: 'Habits', tiers: [10], value: (s) => s.maxDay },
  { id: 'early', icon: '🌅', name: 'Early Bird', desc: 'Train before 9 AM.', unit: 'early runs', group: 'Habits', tiers: [1], value: (s) => s.early, secret: true },
  { id: 'night', icon: '🌙', name: 'Night Owl', desc: 'Train after 11 PM.', unit: 'late runs', group: 'Habits', tiers: [1], value: (s) => s.late, secret: true },
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
    replays: 0,
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
    // Personal Best: match or beat the best so far (the first Test only sets the bar).
    if (s.testBest >= 0 && a.score >= s.testBest) s.testImproved++;
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
  else s.replays++;
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

export const RANKS = [
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
/** XP for reaching a badge's level i (0 = first level). */
export const tierXp = (def: BadgeDef, i: number) => def.xp?.[i] ?? TIER_XP[Math.min(i, 2)];
/** XP for one scenario run and for one finished Test. */
export const RUN_XP = { scenario: 10, test: 25 };

/** Replays the history in time order and works out every badge. */
export function computeAchievements(history: Activity[]): Achievements {
  const list = [...history].sort((a, b) => a.at - b.at);
  const s = emptyStats();
  const earnedAt = new Map<string, number[]>(BADGES.map((b) => [b.id, []]));
  let xp = 0;
  for (const a of list) {
    add(s, a);
    xp += a.kind === 'test' ? RUN_XP.test : RUN_XP.scenario;
    for (const b of BADGES) {
      const got = earnedAt.get(b.id)!;
      const v = b.value(s);
      while (got.length < b.tiers.length && v >= b.tiers[got.length]) got.push(a.at);
    }
  }
  const badges = BADGES.map((def) => {
    const got = earnedAt.get(def.id)!;
    xp += got.reduce((t, _, i) => t + tierXp(def, i), 0);
    return { def, value: def.value(s), tier: got.length, earnedAt: got, next: def.tiers[got.length] ?? null };
  });
  return { badges, stats: s, xp, rank: rankFor(xp) };
}

/** Level name: Bronze / Silver / Gold, or Earned for a single badge. */
export const levelName = (def: BadgeDef, i: number) => (def.tiers.length === 1 ? 'Earned' : TIER_NAMES[i] ?? `Level ${i + 1}`);

/** "Bronze 1 · Silver 5 · Gold 15 Tests finished" (or the single target). */
export function ladderText(def: BadgeDef) {
  if (def.tiers.length === 1) return `${def.tiers[0]} ${def.unit}`;
  return `${def.tiers.map((t, i) => `${TIER_NAMES[i]} ${t}`).join(' · ')} ${def.unit}`;
}

/** Progress toward the next level: "1/5 Tests finished for Silver", or null when all are earned. */
export function nextText(b: BadgeState) {
  if (b.next === null) return null;
  const lvl = b.def.tiers.length === 1 ? '' : ` for ${TIER_NAMES[b.tier]}`;
  return `${Math.min(b.value, b.next)}/${b.next} ${b.def.unit}${lvl}`;
}

/** Everything about a badge in one line (for hover text). */
export function badgeHelp(b: BadgeState | BadgeDef) {
  const def = 'def' in b ? b.def : b;
  const xp = def.tiers.map((_, i) => tierXp(def, i));
  const levels = def.tiers.length === 1 ? `+${xp[0]} XP` : def.tiers.map((t, i) => `${TIER_NAMES[i]}: ${t} (+${xp[i]} XP)`).join(', ');
  return `${def.icon} ${def.name}: ${def.desc} ${def.tiers.length === 1 ? `(${levels})` : `Levels, counting ${def.unit}: ${levels}.`}`;
}

/** Earned badges as "id:level,id:level" (saved to the profile for the public leaderboard). */
export function badgeSummary(a: Achievements): string {
  return a.badges
    .filter((b) => b.tier > 0)
    .map((b) => `${b.def.id}:${b.tier}`)
    .join(',');
}

/** Reads a saved summary back: earned badges with their level, best first (gold before bronze). */
export function parseBadgeSummary(s: string | null | undefined): { def: BadgeDef; tier: number }[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => {
      const [id, t] = x.split(':');
      const def = BADGE.get(id);
      return def ? { def, tier: Math.min(Number(t) || 0, def.tiers.length) } : null;
    })
    .filter((x): x is { def: BadgeDef; tier: number } => !!x && x.tier > 0)
    .sort((a, b) => tierXp(b.def, b.tier - 1) - tierXp(a.def, a.tier - 1));
}

/** Key for one earned tier, used to announce new badges once. */
export const tierKey = (id: string, tier: number) => `${id}:${tier}`;

export function earnedKeys(a: Achievements): string[] {
  return a.badges.flatMap((b) => b.earnedAt.map((_, i) => tierKey(b.def.id, i + 1)));
}
