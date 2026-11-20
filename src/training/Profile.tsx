import { useMemo, useRef, useState } from 'react';
import { openSignIn, setNewPassword, signOut, type useAuth } from '../lib/supabase';
import { Avatar, AVATAR_COLORS, AVATAR_EMOJI, emojiAvatar, parseAvatar, photoToAvatar } from '../ui/Avatar';
import { BUILT_IN, goalText, TIER_NAMES, type Achievements, type BadgeState, type Group } from './achievements';
import type { Activity } from './achievements';
import type { Level } from './types';

type Auth = ReturnType<typeof useAuth>;

const GROUPS: { id: Group; blurb: string }[] = [
  { id: 'Scenarios', blurb: 'Play every scenario at least once, then master them.' },
  { id: 'Skills', blurb: 'Nail the tricky situations.' },
  { id: 'Tests', blurb: 'Your full service shifts.' },
  { id: 'Habits', blurb: 'Keep coming back.' },
];

const LEVELS: { id: Level; label: string; tone: string }[] = [
  { id: 'beginner', label: 'Beginner', tone: 'text-emerald-300' },
  { id: 'intermediate', label: 'Intermediate', tone: 'text-amber-300' },
  { id: 'advanced', label: 'Advanced', tone: 'text-rose-300' },
];

/** Bronze, silver and gold styling for a badge's earned tier. */
const TIER_STYLE = [
  'from-slate-700 to-slate-800 ring-slate-700',
  'from-orange-300 via-orange-500 to-orange-800 ring-orange-400/70',
  'from-slate-100 via-slate-300 to-slate-500 ring-slate-200/70',
  'from-amber-100 via-amber-400 to-amber-700 ring-amber-300/80',
];
const tierStyle = (b: BadgeState) => (b.tier === 0 ? TIER_STYLE[0] : TIER_STYLE[b.def.tiers.length === 1 ? 3 : b.tier]);
const tierLabel = (b: BadgeState) => (b.def.tiers.length === 1 ? (b.tier ? 'Earned' : '') : b.tier ? TIER_NAMES[b.tier - 1] : '');
const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export function BadgeMedal({ b, size = 'h-14 w-14 text-2xl' }: { b: BadgeState; size?: string }) {
  return (
    <div className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br p-[3px] ring-2 ${tierStyle(b)} ${size} ${b.tier ? 'badge-earned' : ''}`}>
      <div className={`flex h-full w-full items-center justify-center rounded-full bg-slate-900 ${b.tier ? '' : 'opacity-40 grayscale'}`}>
        <span className="leading-none">{b.def.secret && !b.tier ? '❔' : b.def.icon}</span>
      </div>
    </div>
  );
}

function BadgeCard({ b }: { b: BadgeState }) {
  const hidden = b.def.secret && !b.tier;
  const top = b.def.tiers[b.def.tiers.length - 1];
  const target = b.next ?? top;
  const pct = Math.min(100, (b.value / target) * 100);
  return (
    <div data-testid={`badge-${b.def.id}`} className={`flex gap-3 rounded-2xl p-3 ring-1 ${b.tier ? 'bg-slate-900 ring-slate-700' : 'bg-slate-900/50 ring-slate-800'}`}>
      <BadgeMedal b={b} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className={`truncate font-bold ${b.tier ? 'text-white' : 'text-slate-300'}`}>{hidden ? 'Secret badge' : b.def.name}</div>
          {tierLabel(b) && <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-300">{tierLabel(b)}</div>}
        </div>
        <div className="text-xs text-slate-400">{hidden ? 'Keep training to find out.' : b.next === null ? b.def.goal.replace('{n}', String(top)) : goalText(b)}</div>
        {!hidden && (
          <div className="mt-1.5 flex items-center gap-2">
            {b.def.tiers.length > 1 && (
              <div className="flex gap-0.5" aria-label={`${b.tier} of ${b.def.tiers.length} tiers`}>
                {b.def.tiers.map((_, i) => (
                  <span key={i} className={`h-1.5 w-3 rounded-full ${i < b.tier ? ['bg-orange-400', 'bg-slate-200', 'bg-amber-300'][i] : 'bg-slate-700'}`} />
                ))}
              </div>
            )}
            {b.next !== null ? (
              <>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] font-bold tabular-nums text-slate-300">
                  {Math.min(b.value, target)}/{target}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500">Earned {fmtDate(b.earnedAt[b.earnedAt.length - 1])}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Passport({ ach, onStart }: { ach: Achievements; onStart: (id: string) => void }) {
  const best = ach.stats.best;
  const done = BUILT_IN.filter((s) => best.has(s.id)).length;
  return (
    <section className="space-y-3 rounded-3xl bg-slate-900/70 p-5 ring-1 ring-slate-800" data-testid="passport">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-black">Scenario passport</h3>
          <p className="text-sm text-slate-400">A stamp for every scenario you finish; gold for 90+. Tap an empty one to play it.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums">
            {done}
            <span className="text-base text-slate-500">/{BUILT_IN.length}</span>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">stamped</div>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-700 to-sky-500 transition-all" style={{ width: `${(done / BUILT_IN.length) * 100}%` }} />
      </div>
      {LEVELS.map((l) => (
        <div key={l.id}>
          <div className={`mb-1.5 text-xs font-bold uppercase tracking-wider ${l.tone}`}>
            {l.label} · {BUILT_IN.filter((s) => s.level === l.id && best.has(s.id)).length}/{BUILT_IN.filter((s) => s.level === l.id).length}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {BUILT_IN.filter((s) => s.level === l.id).map((s) => {
              const sc = best.get(s.id);
              const gold = sc !== undefined && sc >= 90;
              return (
                <button
                  key={s.id}
                  data-testid={`stamp-${s.id}`}
                  title={sc === undefined ? 'Not played yet: tap to play' : `Best score ${sc}. Tap to play again.`}
                  onClick={() => onStart(s.id)}
                  className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs ring-1 transition ${
                    sc === undefined ? 'border border-dashed border-slate-700 text-slate-400 ring-transparent hover:border-sky-600 hover:text-slate-200' : gold ? 'bg-amber-400/10 text-amber-100 ring-amber-400/40' : 'bg-sky-600/10 text-slate-100 ring-sky-600/40'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 -rotate-12 items-center justify-center rounded-full border-2 text-[11px] font-black ${
                      sc === undefined ? 'border-slate-700 text-slate-600' : gold ? 'border-amber-300 text-amber-300' : 'border-sky-400 text-sky-300'
                    }`}
                  >
                    {sc === undefined ? '·' : sc}
                  </span>
                  <span className="line-clamp-2 font-semibold leading-tight">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function AvatarEditor({ auth, onClose }: { auth: Auth; onClose: () => void }) {
  const cur = parseAvatar(auth.profile?.avatar_url);
  const [emoji, setEmoji] = useState(cur?.kind === 'emoji' ? cur.emoji : AVATAR_EMOJI[0]);
  const [color, setColor] = useState(cur?.kind === 'emoji' ? cur.color : AVATAR_COLORS[0]);
  const [photo, setPhoto] = useState<string | null>(cur?.kind === 'photo' ? cur.src : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const value = photo ?? emojiAvatar(emoji, color);
  const save = async (v: string | null) => {
    setBusy(true);
    const e = await auth.updateProfile({ avatar_url: v });
    setBusy(false);
    if (e) return setErr(e);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-700" data-testid="avatar-editor">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Profile picture</h3>
          <button className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex justify-center">
          <Avatar name={auth.profile?.display_name ?? '?'} url={value} size="h-24 w-24 text-4xl" className="ring-4 ring-slate-700" />
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Pick one</div>
          <div className="grid grid-cols-8 gap-1.5">
            {AVATAR_EMOJI.map((e) => (
              <button
                key={e}
                className={`flex h-9 items-center justify-center rounded-lg text-xl ${!photo && e === emoji ? 'bg-sky-600/30 ring-2 ring-sky-500' : 'bg-slate-800 hover:bg-slate-700'}`}
                onClick={() => {
                  setEmoji(e);
                  setPhoto(null);
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-slate-900 ${!photo && c === color ? 'ring-2 ring-white' : ''}`}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  setPhoto(null);
                }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-sm">
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="avatar-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await photoToAvatar(f));
                setErr(null);
              } catch (x) {
                setErr(x instanceof Error ? x.message : 'Could not read that picture.');
              }
            }}
          />
          <button className="rounded-full border border-slate-600 px-3 py-1.5 hover:bg-slate-800" onClick={() => file.current?.click()}>
            📷 Upload a photo
          </button>
          {auth.profile?.avatar_url && (
            <button className="rounded-full px-3 py-1.5 text-slate-400 hover:text-white" onClick={() => save(null)}>
              Use my initial
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500">Your picture is shown on the leaderboard, which anyone can see. Photos are shrunk to a small square.</p>
        {err && <div className="rounded-lg bg-rose-950/60 p-2 text-sm text-rose-200">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="rounded-full border border-slate-600 px-4 py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button data-testid="avatar-save" disabled={busy} className="rounded-full bg-sky-600 px-5 py-1.5 font-semibold hover:bg-sky-500 disabled:opacity-60" onClick={() => save(value)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Account({ auth, earned }: { auth: Auth; earned: BadgeState[] }) {
  const [name, setName] = useState(auth.profile?.display_name ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const email = auth.session?.user.email;
  const providers: string[] = (auth.session?.user.app_metadata?.providers as string[] | undefined) ?? [auth.session?.user.app_metadata?.provider as string];
  const input = 'mt-1 w-full rounded-lg bg-slate-950 px-3 py-2 text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500';

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 1 || n.length > 40) return setMsg({ ok: false, text: 'Use 1 to 40 characters.' });
    const err = await auth.rename(n);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Saved.' });
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg({ ok: false, text: 'At least 8 characters.' });
    if (pw !== pw2) return setPwMsg({ ok: false, text: 'The two passwords do not match.' });
    const err = await setNewPassword(pw);
    setPw('');
    setPw2('');
    setPwMsg(err ? { ok: false, text: err } : { ok: true, text: 'Password changed.' });
  };
  const note = (m: { ok: boolean; text: string } | null) => m && <span className={`text-xs ${m.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{m.text}</span>;

  return (
    <section className="grid gap-4 rounded-3xl bg-slate-900/70 p-5 ring-1 ring-slate-800 md:grid-cols-2" data-testid="account">
      <h3 className="text-lg font-black md:col-span-2">Profile settings</h3>
      <form onSubmit={saveName} className="space-y-2">
        <label className="block text-sm font-semibold">
          Nickname <span className="font-normal text-slate-400">(shown on the leaderboard)</span>
          <input data-testid="nickname-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <div className="flex items-center gap-3">
          <button data-testid="nickname-save" className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold hover:bg-sky-500">
            Save nickname
          </button>
          {note(msg)}
        </div>
      </form>
      <div className="space-y-2">
        <label className="block text-sm font-semibold">
          Featured badge <span className="font-normal text-slate-400">(next to your name)</span>
          <select
            data-testid="featured-select"
            value={auth.profile?.featured_badge ?? ''}
            onChange={async (e) => {
              const err = await auth.updateProfile({ featured_badge: e.target.value || null });
              setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Featured badge saved.' });
            }}
            className={input}
          >
            <option value="">None</option>
            {earned.map((b) => (
              <option key={b.def.id} value={b.def.id}>
                {b.def.icon} {b.def.name}
                {b.def.tiers.length > 1 ? ` (${TIER_NAMES[b.tier - 1]})` : ''}
              </option>
            ))}
          </select>
        </label>
        {!earned.length && <p className="text-xs text-slate-500">Earn a badge to feature it.</p>}
      </div>
      <div className="space-y-1 text-sm">
        <div className="font-semibold">Signed in as</div>
        <div className="text-slate-300">{email}</div>
        <div className="text-xs text-slate-500">via {providers.filter(Boolean).map((p) => (p === 'email' ? 'email and password' : p === 'google' ? 'Google' : p)).join(' and ')}</div>
        <button className="mt-2 rounded-full border border-slate-600 px-4 py-1.5 text-sm hover:bg-slate-800" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
      <form onSubmit={savePw} className="space-y-2">
        <div className="text-sm font-semibold">{providers.includes('email') ? 'Change password' : 'Add a password'}</div>
        {!providers.includes('email') && <p className="text-xs text-slate-400">Optional: lets you also sign in with your email and a password.</p>}
        <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        <input type="password" autoComplete="new-password" placeholder="New password again" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-slate-600 px-4 py-1.5 text-sm font-semibold hover:bg-slate-800">Save password</button>
          {note(pwMsg)}
        </div>
      </form>
    </section>
  );
}

export function Profile({ auth, ach, history, loading, onStart }: { auth: Auth; ach: Achievements; history: Activity[]; loading: boolean; onStart: (scenarioId: string) => void }) {
  const [editAvatar, setEditAvatar] = useState(false);
  const [group, setGroup] = useState<Group | 'all'>('all');
  const signedIn = !!auth.session;
  const name = auth.profile?.display_name ?? (signedIn ? auth.session?.user.email ?? '' : 'Guest');
  const earned = ach.badges.filter((b) => b.tier > 0);
  const tiersEarned = ach.badges.reduce((t, b) => t + b.tier, 0);
  const tiersTotal = ach.badges.reduce((t, b) => t + b.def.tiers.length, 0);
  const featured = auth.profile?.featured_badge ? ach.badges.find((b) => b.def.id === auth.profile?.featured_badge && b.tier > 0) : undefined;
  const r = ach.rank;
  const rankPct = r.to === null ? 100 : ((ach.xp - r.from) / (r.to - r.from)) * 100;
  const s = ach.stats;
  const tests = history.filter((h) => h.kind === 'test');
  const bestTest = tests.length ? Math.max(...tests.map((t) => t.score)) : null;
  // Closest badges still to earn: most progress first.
  const nextUp = useMemo(
    () =>
      ach.badges
        .filter((b) => b.next !== null && !(b.def.secret && !b.tier))
        .map((b) => ({ b, p: b.value / (b.next as number) }))
        .sort((a, b) => b.p - a.p)
        .slice(0, 3)
        .map((x) => x.b),
    [ach],
  );
  const recent = earned
    .flatMap((b) => b.earnedAt.map((t, i) => ({ b, t, i })))
    .sort((a, b) => b.t - a.t)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 text-slate-100 sm:p-6" data-testid="profile-page">
      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-amber-500/30">
          <span>You're not signed in, so nothing you play is saved and no badges are earned. Sign in to save your results, earn badges, and set a picture and nickname.</span>
          <button className="rounded-full bg-sky-600 px-4 py-1.5 font-semibold text-white hover:bg-sky-500" onClick={() => openSignIn()}>
            Sign in
          </button>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/60 p-5 ring-1 ring-slate-800 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-600/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
          <button
            className="group relative rounded-full disabled:cursor-default"
            disabled={!signedIn}
            onClick={() => setEditAvatar(true)}
            data-testid="avatar-edit"
            title={signedIn ? 'Change your picture' : undefined}
          >
            <Avatar name={name} url={auth.profile?.avatar_url} size="h-24 w-24 text-4xl" className="ring-4 ring-slate-800" />
            {signedIn && <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm ring-4 ring-slate-900 group-hover:bg-sky-500">✎</span>}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-300">
              Level {r.level} · {r.title}
            </div>
            <h2 className="flex flex-wrap items-center gap-2 break-words text-2xl font-black tracking-tight sm:text-3xl">
              {name}
              {featured && (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-sm font-bold text-amber-200 ring-1 ring-amber-400/40" title={featured.def.name}>
                  {featured.def.icon} {featured.def.name}
                </span>
              )}
            </h2>
            <div className="mt-2 max-w-md">
              <div className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-400">
                <span>
                  {r.icon} <b className="text-slate-100">{ach.xp.toLocaleString()} XP</b>
                </span>
                <span>{r.to === null ? 'Top rank!' : `${(r.to - ach.xp).toLocaleString()} XP to the next rank`}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-800">
                <div className="xp-fill h-full rounded-full bg-gradient-to-r from-sky-700 via-sky-500 to-amber-300" style={{ width: `${rankPct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { k: 'Scenarios stamped', v: `${BUILT_IN.filter((x) => s.best.has(x.id)).length}/${BUILT_IN.length}` },
            { k: 'Badges', v: `${tiersEarned}/${tiersTotal}` },
            { k: 'Scenario runs', v: s.runs },
            { k: 'Tests finished', v: signedIn ? s.tests : '–' },
            { k: 'Best Test', v: bestTest ?? '–' },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-slate-800">
              <div className="text-xl font-black tabular-nums">{x.v}</div>
              <div className="text-[11px] text-slate-400">{x.k}</div>
            </div>
          ))}
        </div>
        {loading && <div className="relative mt-2 text-xs text-slate-500">Loading your history…</div>}
      </section>

      {/* Next up and recently earned */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2 rounded-3xl bg-slate-900/70 p-5 ring-1 ring-slate-800">
          <h3 className="text-lg font-black">Almost there</h3>
          {nextUp.map((b) => (
            <BadgeCard key={b.def.id} b={b} />
          ))}
        </section>
        <section className="space-y-2 rounded-3xl bg-slate-900/70 p-5 ring-1 ring-slate-800">
          <h3 className="text-lg font-black">Recently earned</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing yet. Finish a scenario to earn your first badge.</p>
          ) : (
            recent.map(({ b, t, i }) => (
              <div key={`${b.def.id}${i}`} className="flex items-center gap-3 rounded-xl bg-slate-950/40 px-3 py-2">
                <span className="text-2xl">{b.def.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {b.def.name}
                    {b.def.tiers.length > 1 && <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-300">{TIER_NAMES[i]}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{fmtDate(t)}</div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <Passport ach={ach} onStart={onStart} />

      {/* All badges */}
      <section className="space-y-3 rounded-3xl bg-slate-900/70 p-5 ring-1 ring-slate-800" data-testid="badges">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-black">Badges</h3>
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            {(['all', ...GROUPS.map((g) => g.id)] as const).map((g) => (
              <button key={g} className={`rounded-full px-3 py-1 ${group === g ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'}`} onClick={() => setGroup(g)}>
                {g === 'all' ? 'All' : g}
              </button>
            ))}
          </div>
        </div>
        {GROUPS.filter((g) => group === 'all' || g.id === group).map((g) => (
          <div key={g.id}>
            <div className="mb-2 mt-1 flex items-baseline gap-2">
              <span className="font-bold">{g.id}</span>
              <span className="text-xs text-slate-500">{g.blurb}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ach.badges
                .filter((b) => b.def.group === g.id)
                .map((b) => (
                  <BadgeCard key={b.def.id} b={b} />
                ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-500">
          Rank goes up with XP: 10 per scenario run, 25 per Test, and 50 / 100 / 200 for each bronze / silver / gold badge.
        </p>
      </section>

      {signedIn && <Account key={auth.profile ? 'loaded' : 'loading'} auth={auth} earned={earned} />}
      {editAvatar && <AvatarEditor auth={auth} onClose={() => setEditAvatar(false)} />}
    </div>
  );
}

