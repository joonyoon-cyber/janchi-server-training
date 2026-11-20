import { describe, expect, it } from 'vitest';
import type { TeamData } from '../lib/supabase';
import { computeEffort, fmtDuration } from '../training/effort';

const DAY = 86400000;
const now = new Date(2026, 10, 20, 15, 0).getTime();
const at = (daysAgo: number, h = 14) => new Date(new Date(now - daysAgo * DAY).setHours(h, 0, 0, 0)).toISOString();
const p = (daysAgo: number, scenario_id: string, score: number, duration_sec = 300) => ({ user_id: 'u1', scenario_id, title: scenario_id, level: 'beginner', generated: false, score, duration_sec, mistakes: 1, created_at: at(daysAgo) });

const data: TeamData = {
  members: [{ id: 'u1', display_name: 'A', email: null, joined_at: at(60), last_sign_in_at: null, is_owner: false }],
  avatars: {},
  practice: [p(40, 'weekday-lunch', 60), p(2, 'weekday-lunch', 80), p(1, 'weekday-lunch', 90), p(0, 'family-kids', 70, 600)],
  runs: [{ user_id: 'u1', version: 9, score: 85, clear_time_sec: 1500, created_at: at(1, 18), tables: null }],
  starts: [{ user_id: 'u1', created_at: at(1, 17) }, { user_id: 'u1', created_at: at(1, 18) }],
  error: null,
};

describe('effort measures for the Team page', () => {
  it('adds up time, days, streak, retries, improvement and XP for the period', () => {
    const e = computeEffort(data, 'u1', now - 7 * DAY, now);
    expect(e.timeSec).toBe(300 + 300 + 600 + 1500);
    expect(e.practiceRuns).toBe(3);
    expect(e.testsFinished).toBe(1);
    expect(e.testsStarted).toBe(2);
    expect(e.activeDays).toBe(3);
    expect(e.streak).toBe(3);
    expect(e.bestStreak).toBe(3);
    expect(e.retries).toBe(2); // weekday lunch played again twice this week
    expect(e.improvement).toBe(30); // 60 -> 90
    expect(e.xpGained).toBeGreaterThan(0);
    expect(e.xpGained).toBeLessThan(e.xpTotal);
    expect(e.weeks).toHaveLength(8);
    expect(e.weeks[7] + e.weeks[6]).toBe(Math.round((300 + 300 + 600 + 1500) / 60));
  });
  it('a gap breaks the streak', () => {
    const e = computeEffort(data, 'u1', 0, now + 3 * DAY);
    expect(e.streak).toBe(0);
    expect(e.bestStreak).toBe(3);
  });
  it('formats durations', () => {
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(14 * 60)).toBe('14m');
    expect(fmtDuration(125 * 60)).toBe('2h 05m');
  });
});
