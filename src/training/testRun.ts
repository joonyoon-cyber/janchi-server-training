import { useSyncExternalStore } from 'react';
import { actions } from '../lib/store';
import { getRun, quitScenario, startScenario, subscribeTraining } from './engine';
import { buildTest, newSeed, testScore, TEST_VERSION } from './testRecipe';
import type { Scenario, StagedEvent } from './types';

export interface TableResult {
  title: string;
  score: number;
  durationSec: number;
  mistakes: string[];
}

export interface TestState {
  phase: 'intro' | 'table' | 'between' | 'done';
  seed: number;
  tables: Scenario[];
  index: number;
  results: TableResult[];
  /** Raw POS events per table, kept so a run can be re-scored on a server later. */
  events: StagedEvent[][];
}

const initial: TestState = { phase: 'intro', seed: 0, tables: [], index: 0, results: [], events: [] };
let state: TestState = initial;
const listeners = new Set<() => void>();

function set(next: TestState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useTest() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Clear time: the sum of the 20 table times (breaks between tables don't count). */
export const clearTime = (s: TestState = state) => s.results.reduce((a, r) => a + r.durationSec, 0);
export const finalScore = (s: TestState = state) => testScore(s.results.map((r) => r.score));
export { TEST_VERSION };

export const testActions = {
  start(seed = newSeed()) {
    const tables = buildTest(seed);
    set({ phase: 'table', seed, tables, index: 0, results: [], events: [] });
    startScenario(tables[0]);
  },
  next() {
    if (state.phase !== 'between') return;
    const index = state.index + 1;
    set({ ...state, phase: 'table', index });
    startScenario(state.tables[index]);
  },
  quit() {
    quitScenario();
    actions.loadPractice();
    set(initial);
  },
};

// When a table is scored, record it and move to the break screen (or finish).
subscribeTraining(() => {
  if (state.phase !== 'table') return;
  const { run, result } = getRun();
  if (!run || !result || run.scenario.id !== state.tables[state.index]?.id) return;
  const mistakes = [...result.ayceViolations, ...result.missing, ...result.wrongQty, ...result.incorrect, ...result.paymentMistakes];
  const results = [...state.results, { title: run.scenario.title, score: result.score, durationSec: result.durationSec, mistakes }];
  const events = [...state.events, run.events];
  set({ ...state, results, events, phase: results.length >= state.tables.length ? 'done' : 'between' });
});
