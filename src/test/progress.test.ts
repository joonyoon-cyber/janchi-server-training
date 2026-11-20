import { beforeEach, describe, expect, it } from 'vitest';
import { loadProgress, setProgressOwner, clearProgress } from '../training/progress';

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

describe('scenario history saved in the browser is per account', () => {
  // 'old' was saved before results were kept per account: nobody sees it.
  beforeEach(() => mem.set(KEY, JSON.stringify([entry('a', 'user-1'), entry('b', 'user-2'), entry('c', 'guest'), entry('old')])));

  it('each account (and signed out) sees only its own results', () => {
    setProgressOwner('user-1');
    expect(loadProgress().map((p) => p.scenarioId)).toEqual(['a']);
    setProgressOwner('user-2');
    expect(loadProgress().map((p) => p.scenarioId)).toEqual(['b']);
    setProgressOwner(null);
    expect(loadProgress().map((p) => p.scenarioId)).toEqual(['c']);
    expect(loadProgress('user-1').map((p) => p.scenarioId)).toEqual(['a']);
  });

  it('clearing history only clears the current account', () => {
    setProgressOwner('user-2');
    clearProgress();
    expect(loadProgress()).toEqual([]);
    expect(loadProgress('user-1')).toHaveLength(1);
    expect(loadProgress(null)).toHaveLength(1);
  });
});
