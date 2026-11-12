import { generateCounter, generateScenario, seededRng, type GenOptions } from './generator';
import { scenarios } from './scenarios';
import type { Level, Scenario } from './types';

/**
 * Test mode: 20 tables built from a fixed recipe, so every run has the same
 * mix and difficulty; only the details (dishes, party sizes, sections,
 * amounts) and the order of the tables come from the seed.
 * Bump TEST_VERSION whenever the recipe or scoring changes, so leaderboard
 * runs stay comparable.
 */
export const TEST_VERSION = 1;
export const TEST_TABLES = 20;

type Slot = { level: Level; opts: GenOptions; label: string } | { counter: 'macaron' | 'gift'; label: string } | { handWritten: string[]; label: string };

const RECIPE: Slot[] = [
  { label: 'AYCE, drinks with the order', level: 'beginner', opts: { alaCarte: false, drinks: 'with', extraRounds: 0, pay: 'none', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, drinks first', level: 'beginner', opts: { alaCarte: false, drinks: 'before', extraRounds: 0, pay: 'none', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, drinks later + extra round', level: 'intermediate', opts: { alaCarte: false, drinks: 'after', extraRounds: 1, pay: 'credit', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, two extra meat rounds', level: 'intermediate', opts: { alaCarte: false, drinks: 'none', extraRounds: 2, pay: 'credit', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, over the 4-meat limit', level: 'advanced', opts: { alaCarte: false, over: true, pay: 'cash', interrupt: false, voidDrink: false, guests: 3 } },
  { label: 'AYCE, guest changes the order', level: 'intermediate', opts: { alaCarte: false, extraRounds: 1, interrupt: true, pay: 'credit', over: false, voidDrink: false } },
  { label: 'AYCE, cancel after sending', level: 'advanced', opts: { alaCarte: false, drinks: 'with', extraRounds: 0, voidDrink: true, pay: 'cash', over: false, interrupt: false } },
  { label: 'AYCE, party of 5+ (auto 18%)', level: 'advanced', opts: { alaCarte: false, guests: 5, extraRounds: 1, pay: 'credit', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, party of 6 splits the check', level: 'advanced', opts: { alaCarte: false, guests: 6, extraRounds: 0, pay: 'split', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, split check', level: 'intermediate', opts: { alaCarte: false, guests: 3, extraRounds: 1, pay: 'split', over: false, interrupt: false, voidDrink: false } },
  { label: 'Ultimate AYCE', level: 'intermediate', opts: { alaCarte: false, ultimate: true, extraRounds: 1, pay: 'credit', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE at lunch', level: 'intermediate', opts: { alaCarte: false, lunch: true, extraRounds: 0, pay: 'cash', over: false, interrupt: false, voidDrink: false } },
  { label: 'AYCE, single guest', level: 'intermediate', opts: { alaCarte: false, guests: 1, extraRounds: 1, pay: 'cash', over: false, interrupt: false, voidDrink: false } },
  { label: 'À la carte, card', level: 'intermediate', opts: { alaCarte: true, pay: 'credit', voidDrink: false } },
  { label: 'À la carte, cash', level: 'intermediate', opts: { alaCarte: true, pay: 'cash', voidDrink: false } },
  { label: 'À la carte, split check', level: 'intermediate', opts: { alaCarte: true, guests: 2, pay: 'split', voidDrink: false } },
  { label: 'Macaron ice cream to go', counter: 'macaron' },
  { label: 'Gift card sale', counter: 'gift' },
  { label: 'House policy question', handWritten: ['e-meat-limit', 'ayce-same-choice'] },
  { label: 'Family with kids or weekend lunch', handWritten: ['family-kids', 'weekend-lunch-price'] },
];

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function buildTest(seed: number): Scenario[] {
  const rng = seededRng(seed);
  const tables = RECIPE.map((slot, i): Scenario => {
    let sc: Scenario;
    if ('counter' in slot) sc = generateCounter(slot.counter, { rng });
    else if ('handWritten' in slot) {
      const id = slot.handWritten[Math.floor(rng() * slot.handWritten.length)];
      sc = structuredClone(scenarios.find((s) => s.id === id)!);
    } else sc = generateScenario(slot.level, { ...slot.opts, rng });
    return { ...sc, id: `test-${seed}-${i}`, noTimeScore: true };
  });
  // Seeded shuffle (Fisher-Yates) so the order differs between runs.
  for (let i = tables.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tables[i], tables[j]] = [tables[j], tables[i]];
  }
  return tables;
}

/** Test score: average of the 20 table scores, rounded to a whole number (0-100). */
export function testScore(tableScores: number[]): number {
  if (!tableScores.length) return 0;
  return Math.round(tableScores.reduce((a, b) => a + b, 0) / tableScores.length);
}
