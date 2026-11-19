import { describe, expect, it } from 'vitest';
import { BADGES, BUILT_IN, computeAchievements, earnedKeys, rankFor, type Activity } from '../training/achievements';
import { mergeActivity } from '../training/activity';

const DAY = 86400000;
const t0 = new Date(2026, 9, 5, 14, 0).getTime(); // a Monday afternoon
const run = (id: string, score: number, at: number, extra: Partial<Activity> = {}): Activity => ({
  kind: 'practice',
  scenarioId: id,
  level: BUILT_IN.find((s) => s.id === id)?.level ?? 'beginner',
  score,
  durationSec: 600,
  mistakes: score === 100 ? 0 : 2,
  at,
  ...extra,
});
const test = (score: number, at: number, durationSec = 1800): Activity => ({ kind: 'test', score, durationSec, mistakes: 0, at });
const badge = (h: Activity[], id: string) => computeAchievements(h).badges.find((b) => b.def.id === id)!;

describe('achievements', () => {
  it('starts empty', () => {
    const a = computeAchievements([]);
    expect(a.xp).toBe(0);
    expect(a.rank.title).toBe('Trainee');
    expect(a.badges.every((b) => b.tier === 0)).toBe(true);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it('finishing every beginner scenario once earns Beginner Graduate, dated at the last one', () => {
    const ids = BUILT_IN.filter((s) => s.level === 'beginner').map((s) => s.id);
    const h = ids.map((id, i) => run(id, 70, t0 + i * 60000));
    const b = badge(h, 'beginner');
    expect(b.tier).toBe(1);
    expect(b.earnedAt[0]).toBe(t0 + (ids.length - 1) * 60000);
    expect(badge(h, 'first-table').tier).toBe(1);
    expect(badge(h, 'passport').value).toBe(ids.length);
    expect(badge(h, 'passport').tier).toBe(0);
  });

  it('random tables count for Wild Card, not the passport', () => {
    const h = Array.from({ length: 5 }, (_, i) => run('generated-beginner', 80, t0 + i, { generated: true }));
    expect(badge(h, 'wild-card').tier).toBe(1);
    expect(badge(h, 'passport').value).toBe(0);
  });

  it('Test score badges count 80+ and 90+ separately, with tiers', () => {
    const h = [test(82, t0), test(91, t0 + DAY), test(95, t0 + 2 * DAY), test(100, t0 + 3 * DAY, 900)];
    expect(badge(h, 'test80').value).toBe(4);
    expect(badge(h, 'test80').tier).toBe(2); // 1 and 3
    expect(badge(h, 'test90').tier).toBe(2);
    expect(badge(h, 'test100').tier).toBe(1);
    expect(badge(h, 'pb').value).toBe(3);
    expect(badge(h, 'rush').tier).toBe(1);
    expect(badge(h, 'clocked-in').tier).toBe(1);
  });

  it('a streak needs consecutive days', () => {
    const h = [run('weekday-lunch', 80, t0), run('weekday-lunch', 80, t0 + DAY), run('weekday-lunch', 80, t0 + 3 * DAY), run('weekday-lunch', 80, t0 + 4 * DAY), run('weekday-lunch', 80, t0 + 5 * DAY)];
    expect(badge(h, 'streak').value).toBe(3);
    expect(badge(h, 'streak').tier).toBe(1);
  });

  it('Comeback counts once per scenario', () => {
    const h = [run('party-of-six', 50, t0), run('party-of-six', 85, t0 + 1), run('party-of-six', 95, t0 + 2)];
    expect(badge(h, 'comeback').value).toBe(1);
  });

  it('skill badges need 90+ on every scenario in the group', () => {
    expect(badge([run('party-of-six', 95, t0), run('party-of-eight', 85, t0 + 1)], 'party').tier).toBe(0);
    expect(badge([run('party-of-six', 95, t0), run('party-of-eight', 90, t0 + 1)], 'party').tier).toBe(1);
  });

  it('XP grows with runs and badges, and ranks follow XP', () => {
    const a = computeAchievements([run('weekday-lunch', 100, t0)]);
    // 10 for the run; First Table, Spotless and Perfectionist bronze at 50 each.
    expect(a.xp).toBe(10 + 50 * 3);
    expect(earnedKeys(a)).toEqual(expect.arrayContaining(['first-table:1', 'clean:1', 'perfect:1']));
    expect(rankFor(0).title).toBe('Trainee');
    expect(rankFor(100).title).toBe('Busser');
    expect(rankFor(99999).to).toBeNull();
  });

  it('the same run saved to the account and in this browser counts once', () => {
    const server = [run('weekday-lunch', 80, t0)];
    const local = [run('weekday-lunch', 80, t0 + 1500), run('weekday-lunch', 90, t0 + 5 * 60000)];
    expect(mergeActivity(server, local)).toHaveLength(2);
  });
});
