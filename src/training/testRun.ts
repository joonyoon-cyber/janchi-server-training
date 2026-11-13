import { useSyncExternalStore } from 'react';
import { actions } from '../lib/store';
import { logTestStart } from '../lib/supabase';
import type { Evaluation } from './evaluate';
import { getRun, quitScenario, startScenario, subscribeTraining } from './engine';
import { buildTest, newSeed, TEST_VERSION } from './testRecipe';
import type { Scenario, StagedEvent } from './types';

export interface TestState {
  phase: 'intro' | 'shift' | 'done';
  seed: number;
  shift: Scenario | null;
  /** Scored once, after the whole shift. */
  result: Evaluation | null;
  /** Raw POS events, kept so a run can be re-scored on a server later. */
  events: StagedEvent[];
}

const initial: TestState = { phase: 'intro', seed: 0, shift: null, result: null, events: [] };
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

export { TEST_VERSION };

export const testActions = {
  start(seed = newSeed()) {
    const shift = buildTest(seed);
    set({ phase: 'shift', seed, shift, result: null, events: [] });
    startScenario(shift);
    void logTestStart(TEST_VERSION, seed);
  },
  quit() {
    quitScenario();
    actions.loadPractice();
    set(initial);
  },
};

// When the shift is scored, keep the result and show the final screen.
subscribeTraining(() => {
  if (state.phase !== 'shift') return;
  const { run, result } = getRun();
  if (!run || !result || run.scenario.id !== state.shift?.id) return;
  set({ ...state, phase: 'done', result, events: run.events });
});
