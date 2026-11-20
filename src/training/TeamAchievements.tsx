import { Fragment, useMemo, useState } from 'react';
import type { TeamData, TeamMember } from '../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { HBarChart } from '../ui/charts';
import { BADGES, badgeHelp, BUILT_IN, computeAchievements, levelName, nextText, tierXp, type Achievements, type Group } from './achievements';
import { historyOf } from './effort';
import { BadgeMedal, Passport } from './Profile';

interface Row {
  m: TeamMember;
  a: Achievements;
  tiers: number;
  stamped: number;
  mastered: number;
  lastBadge: number | null;
}

const TOTAL_TIERS = BADGES.reduce((t, b) => t + b.tiers.length, 0);
const GROUPS: Group[] = ['Scenarios', 'Skills', 'Tests', 'Habits'];
type SortKey = 'xp' | 'tiers' | 'stamped' | 'mastered' | 'name';

function PersonBadges({ r }: { r: Row }) {
  return (
    <div className="grid gap-5 p-4 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-3">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">{g}</div>
            <div className="flex flex-wrap gap-2">
              {r.a.badges
                .filter((b) => b.def.group === g)
                .map((b) => (
                  <div
                    key={b.def.id}
                    className="flex w-[11.5rem] items-center gap-2 rounded-xl bg-slate-900 px-2 py-1.5 ring-1 ring-slate-800"
                    title={`${badgeHelp(b)}${b.tier ? `\n${levelName(b.def, b.tier - 1)} earned ${new Date(b.earnedAt[b.tier - 1]).toLocaleDateString()}` : ''}${nextText(b) ? `\nNext: ${nextText(b)}` : ''}`}
                  >
                    <BadgeMedal b={b} size="h-9 w-9 text-base" />
                    <div className="min-w-0 flex-1 text-[11px] leading-tight">
                      <div className={`truncate font-semibold ${b.tier ? 'text-white' : 'text-slate-400'}`}>{b.def.name}</div>
                      <div className="text-slate-500">
                        {b.tier ? levelName(b.def, b.tier - 1) : 'Not yet'}
                        {b.next !== null && (
                          <span className="tabular-nums">
                            {' · '}
                            {Math.min(b.value, b.next)}/{b.next}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <Passport ach={r.a} compact />
    </div>
  );
}

/** Owner's Team page: every person's badges, rank and scenario passport. */
export function TeamAchievements({ data, onlyIds }: { data: TeamData; onlyIds?: Set<string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'xp', desc: true });

  const all: Row[] = useMemo(
    () =>
      data.members
        .filter((m) => !m.is_owner)
        .map((m) => {
          const a = computeAchievements(historyOf(data, m.id));
          const earned = a.badges.flatMap((b) => b.earnedAt);
          return {
            m,
            a,
            tiers: a.badges.reduce((t, b) => t + b.tier, 0),
            stamped: BUILT_IN.filter((s) => a.stats.best.has(s.id)).length,
            mastered: BUILT_IN.filter((s) => (a.stats.best.get(s.id) ?? 0) >= 90).length,
            lastBadge: earned.length ? Math.max(...earned) : null,
          };
        }),
    [data],
  );
  const rows = useMemo(() => {
    const list = all.filter((r) => !onlyIds || onlyIds.has(r.m.id));
    const val = (r: Row) => (sort.key === 'name' ? r.m.display_name.toLowerCase() : sort.key === 'xp' ? r.a.xp : r[sort.key]);
    return [...list].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const c = a < b ? -1 : a > b ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [all, sort, onlyIds]);

  // How many people have each badge (at least its first tier): which skills the team has, and which nobody does yet.
  const coverage = useMemo(
    () =>
      BADGES.filter((b) => !b.secret).map((b) => {
        const n = all.filter((r) => (r.a.badges.find((x) => x.def.id === b.id)?.tier ?? 0) > 0).length;
        return { key: b.id, label: `${b.icon} ${b.name}`, value: n, sub: `${n} of ${all.length} people\n${badgeHelp(b)}` };
      }),
    [all],
  );

  if (!all.length) return null;
  const th = (key: SortKey, label: string, cls = 'text-right') => (
    <th className={`whitespace-nowrap px-2 py-2 font-medium ${cls}`}>
      <button className={`hover:text-white ${sort.key === key ? 'text-amber-300' : ''}`} onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}>
        {label}
        {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <section className="space-y-3" data-testid="team-achievements">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xl font-black">Achievements</h3>
          <p className="text-sm text-slate-400">Badges, rank and scenario passport for each person (all time, as on their own Profile). Click a person to see every badge.</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
        <table className="w-full text-sm" data-testid="achievements-table">
          <thead className="text-xs text-slate-400">
            <tr className="border-b border-slate-800">
              {th('name', 'Person', 'text-left')}
              {th('xp', 'Rank · XP', 'text-left')}
              {th('tiers', 'Badges', 'text-left')}
              {th('stamped', 'Passport', 'text-left')}
              {th('mastered', '90+ scenarios')}
              <th className="px-2 py-2 text-left font-medium">Closest next badge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rk = r.a.rank;
              const pct = rk.to === null ? 100 : ((r.a.xp - rk.from) / (rk.to - rk.from)) * 100;
              const recent = r.a.badges
                .filter((b) => b.tier > 0)
                .sort((x, y) => y.earnedAt[y.tier - 1] - x.earnedAt[x.tier - 1])
                .slice(0, 5);
              const next = r.a.badges
                .filter((b) => b.next !== null && !(b.def.secret && !b.tier))
                .sort((x, y) => y.value / (y.next as number) - x.value / (x.next as number))[0];
              return (
                <Fragment key={r.m.id}>
                  <tr className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/60 ${open === r.m.id ? 'bg-slate-800/60' : ''}`} onClick={() => setOpen(open === r.m.id ? null : r.m.id)} data-testid={`ach-row-${r.m.id}`}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.m.display_name} url={data.avatars[r.m.id]} size="h-8 w-8 text-xs" />
                        <span className="truncate font-semibold">{r.m.display_name}</span>
                      </div>
                    </td>
                    <td className="min-w-[11rem] px-2">
                      <div className="text-xs">
                        {rk.icon} <b>{rk.title}</b> <span className="text-slate-500">· Lv {rk.level} · {r.a.xp.toLocaleString()} XP</span>
                      </div>
                      <div
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"
                        title={rk.to === null ? 'Top rank' : `${Math.round(pct)}% of the way from ${rk.title} (${rk.from.toLocaleString()} XP) to the next rank (${rk.to.toLocaleString()} XP)`}
                      >
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-700 to-amber-300" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                      </div>
                    </td>
                    <td className="px-2">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-xs font-bold tabular-nums">
                          {r.tiers}
                          <span className="font-normal text-slate-500">/{TOTAL_TIERS}</span>
                        </span>
                        <span className="whitespace-nowrap text-base leading-none">
                          {recent.map((b) => (
                            <span key={b.def.id} className="cursor-help" title={`${badgeHelp(b)}\n${levelName(b.def, b.tier - 1)} earned ${new Date(b.earnedAt[b.tier - 1]).toLocaleDateString()}`}>
                              {b.def.icon}
                            </span>
                          ))}
                        </span>
                      </div>
                    </td>
                    <td className="min-w-[8rem] px-2">
                      <div className="text-xs tabular-nums">
                        {r.stamped}/{BUILT_IN.length}
                        {r.stamped === BUILT_IN.length && <span className="ml-1 text-amber-300">✓ complete</span>}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${(r.stamped / BUILT_IN.length) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-2 text-right tabular-nums">{r.mastered}</td>
                    <td className="px-2 text-xs text-slate-300">
                      {next ? (
                        <span className="cursor-help" title={`${badgeHelp(next)}\nNext: ${nextText(next)}`}>
                          {next.def.icon} {next.def.name}{' '}
                          <span className="tabular-nums text-slate-500">
                            {Math.min(next.value, next.next as number)}/{next.next}
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-300">Every badge earned</span>
                      )}
                    </td>
                  </tr>
                  {open === r.m.id && (
                    <tr className="bg-slate-950/60">
                      <td colSpan={6}>
                        <PersonBadges r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="rounded-2xl bg-slate-900/80 px-4 py-3 ring-1 ring-slate-800" data-testid="badge-guide">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">What each badge means (hover any badge for the same)</summary>
        <div className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {BADGES.map((b) => (
            <div key={b.id} className="flex gap-2 text-xs">
              <span className="text-lg leading-none">{b.icon}</span>
              <div>
                <div className="font-semibold text-slate-100">
                  {b.name}
                  {b.secret && <span className="ml-1 rounded bg-slate-700 px-1 text-[9px] uppercase text-slate-300">secret to trainees</span>}
                </div>
                <div className="text-slate-400">{b.desc}</div>
                <div className="text-slate-500">
                  {b.tiers.length === 1
                    ? `+${tierXp(b, 0)} XP`
                    : b.tiers.map((t, i) => `${levelName(b, i)} ${t} (+${tierXp(b, i)} XP)`).join(' · ') + ` ${b.unit}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
      <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
        <HBarChart rows={coverage} fmt={(v) => `${v}`} median={false} caption="People who have each badge" />
        <p className="mt-2 text-[11px] text-slate-500">Badges few people have point at skills to coach (e.g. split payments or the AYCE rules). Secret badges are left out.</p>
      </div>
    </section>
  );
}
