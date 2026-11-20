import { beforeEach, describe, expect, it } from 'vitest';
import { clearProgress, loadProgress, saveResult, setProgressOwner } from '../training/progress';
import type { Evaluation } from '../training/evaluate';
import type { Scenario } from '../training/types';

// A tiny in-memory localStorage for Node.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const KEY = 'janchi-pos-sim:progress:v1';
const entry = (scenarioId: string, owner?: string) => ({ scenarioId, title: scenarioId, level: 'beginner', generated: false, score: 90, durationSec: 60, mistakes: 0, at: 1, ...(owner ? { owner } : {}) });

describe('scenario results are kept only for signed-in accounts, per account', () => {
  // 'c' (signed out) and 'old' (before results were kept per account) are dropped.
  beforeEach(() => mem.set(KEY, JSON.stringify([entry('a', 'user-1'), entry('b', 'user-2'), entry('c', 'guest'), entry('old')])));

  it('each account sees only its own results; signed out sees nothing', () => {
    setProgressOwner('user-1');
    expect(loadProgress().map((p) => p.scenarioId)).toEqual(['a']);
    setProgressOwner('user-2');
    expect(loadProgress().map((p) => p.scenarioId)).toEqual(['b']);
    setProgressOwner(null);
    expect(loadProgress()).toEqual([]);
    // The signed-out leftovers are removed from the browser too.
    expect(JSON.parse(mem.get(KEY)!).map((p: { scenarioId: string }) => p.scenarioId)).toEqual(['a', 'b']);
    expect(loadProgress('user-1').map((p) => p.scenarioId)).toEqual(['a']);
  });

  it('clearing history only clears the current account', () => {
    setProgressOwner('user-2');
    clearProgress();
    expect(loadProgress()).toEqual([]);
    expect(loadProgress('user-1')).toHaveLength(1);
    expect(loadProgress(null)).toEqual([]);
  });

  it('playing signed out saves nothing', () => {
    setProgressOwner(null);
    const before = mem.get(KEY);
    const ev = { score: 80, durationSec: 30, incorrect: [], missing: [], wrongQty: [], ayceViolations: [], paymentMistakes: [] } as unknown as Evaluation;
    saveResult({ id: 'weekday-lunch', title: 'x', level: 'beginner' } as Scenario, ev);
    expect(mem.get(KEY)).toBe(before);
  });
});

import { nicknameProblem } from '../lib/supabase';
describe('nicknames', () => {
  it('allow letters and numbers only, 2 to 20 long', () => {
    expect(nicknameProblem('Joon')).toBeNull();
    expect(nicknameProblem('Server12')).toBeNull();
    expect(nicknameProblem('Joon Yoon')).toMatch(/letters and numbers/);
    expect(nicknameProblem('Minji K.')).toMatch(/letters and numbers/);
    expect(nicknameProblem('J')).toMatch(/2 to 20/);
    expect(nicknameProblem('a'.repeat(21))).toMatch(/2 to 20/);
  });
});
