import { useEffect, useState, type ReactNode } from 'react';
import { loadLeaderboard, openSignIn, type LeaderRow, type useAuth } from '../lib/supabase';
import { BADGES, BUILT_IN, RANKS, type Rank } from '../training/achievements';
import { TEST_TABLES } from '../training/testRecipe';
import { Avatar } from '../ui/Avatar';

type Auth = ReturnType<typeof useAuth>;
type Go = 'practice' | 'scenarios' | 'test' | 'leaderboard' | 'profile';

/** The restaurant's grill video (as on janchibbq.com); a still image for reduced motion. */
function HeroVideo() {
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (still) return <img src="media/janchi-grill-poster.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />;
  return (
    <video
      className="absolute inset-0 -z-20 h-full w-full object-cover"
      src="media/janchi-grill-720.mp4"
      poster="media/janchi-grill-poster.jpg"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
    />
  );
}

// ---- Custom line icons (gold hairlines) ------------------------------------------------
const Ico = ({ children }: { children: ReactNode }) => (
  <svg width="34" height="34" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const IconTerminal = () => (
  <Ico>
    <rect x="7" y="8" width="34" height="24" rx="2" />
    <path d="M18 40h12M24 32v8M12 14h10M12 19h7M27 14h9v12h-9z" />
  </Ico>
);
const IconGuests = () => (
  <Ico>
    <path d="M8 12h22a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H17l-6 5v-5H8a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z" />
    <path d="M36 19h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-2v4l-5-4h-8" />
    <path d="M12 19.5h14" />
  </Ico>
);
const IconGrill = () => (
  <Ico>
    <circle cx="24" cy="24" r="15" />
    <path d="M13 19h22M11 24h26M13 29h22" />
    <path d="M20 8c-1.5 2 1.5 3 0 5M28 8c-1.5 2 1.5 3 0 5" />
  </Ico>
);
const IconShift = () => (
  <Ico>
    <rect x="11" y="8" width="26" height="33" rx="2" />
    <path d="M19 8v-2h10v2M16 17l2.5 2.5L23 15M16 26l2.5 2.5L23 24M16 35l2.5 2.5L23 33M27 18h6M27 27h6M27 36h6" />
  </Ico>
);
const IconMedal = () => (
  <Ico>
    <path d="M17 6l7 12 7-12M13 6h8M27 6h8" />
    <circle cx="24" cy="30" r="11" />
    <path d="M24 24.5l1.7 3.4 3.8.6-2.7 2.7.6 3.8-3.4-1.8-3.4 1.8.6-3.8-2.7-2.7 3.8-.6z" />
  </Ico>
);
const IconPodium = () => (
  <Ico>
    <path d="M6 40h36M17 40V22h14v18M6 40V30h11M31 40V27h11" />
    <path d="M24 8l1.6 3.3 3.6.5-2.6 2.6.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.6 3.6-.5z" />
  </Ico>
);

/**
 * The front door: what the Academy is, how training works, the ranks, and who leads the
 * leaderboard. Styled after janchibbq.com (ink, gold hairlines, Cormorant headings).
 */
export function Landing({ auth, rank, onGo }: { auth: Auth; rank: Rank | null; onGo: (m: Go) => void }) {
  const [leaders, setLeaders] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadLeaderboard().then((r) => live && setLeaders(r.rows.slice(0, 3)));
    return () => {
      live = false;
    };
  }, []);
  const name = auth.profile?.display_name;
  const btn = 'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-6 text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors';

  return (
    <div className="text-cream" data-testid="landing">
      {/* ---- Hero ---- */}
      <section className="relative isolate overflow-hidden" style={{ minHeight: 'min(82vh, 760px)' }}>
        <HeroVideo />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(10,9,8,0.35),rgba(10,9,8,0.88)_70%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-transparent to-ink" />
        <div className="pointer-events-none absolute inset-4 border border-gold-line sm:inset-6" />
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center px-6 py-20 text-center" style={{ minHeight: 'min(82vh, 760px)' }}>
          {/* Same pattern as the sections below: gold label, one display heading, plain lede. */}
          <p className="eyebrow rise-in" style={{ animationDelay: '0.1s' }}>
            <span className="tracking-[0.2em]">잔치 아카데미</span> · Server training
          </p>
          <h1 className="rise-in text-[clamp(40px,6vw,84px)] font-normal leading-[1.04]" style={{ animationDelay: '0.25s' }}>
            Janchi Service <em>Academy</em>
          </h1>
          <p className="rise-in mt-6 max-w-2xl text-[clamp(17px,1.5vw,20px)] text-cream/70" style={{ animationDelay: '0.45s' }}>
            Learn our POS with a simulator, serve guests who talk like real guests, and run a full Friday dinner shift before your first one on the floor.
          </p>
          <div className="rise-in mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '0.65s' }}>
            <button data-testid="cta-scenarios" className={`${btn} bg-janchi text-white hover:bg-[#d02535]`} onClick={() => onGo('scenarios')}>
              Start training <span aria-hidden>→</span>
            </button>
            <button className={`${btn} border border-cream/40 bg-ink/40 backdrop-blur hover:border-cream`} onClick={() => onGo('test')}>
              Take the Test
            </button>
            <button className={`${btn} border border-cream/40 bg-ink/40 backdrop-blur hover:border-cream`} onClick={() => onGo('practice')}>
              Free Play
            </button>
          </div>
          {name && rank ? (
            <button className="rise-in mt-6 rounded-full border border-gold-line bg-ink/50 px-4 py-1.5 text-sm text-cream/85 backdrop-blur hover:border-gold" style={{ animationDelay: '0.8s' }} onClick={() => onGo('profile')}>
              Welcome back, <b className="text-cream">{name}</b> · {rank.icon} {rank.title}
            </button>
          ) : (
            !auth.session &&
            auth.ready && (
              <p className="rise-in mt-6 text-sm text-cream/60" style={{ animationDelay: '0.8s' }}>
                <button className="text-ember underline-offset-4 hover:underline" onClick={() => openSignIn()}>
                  Sign in
                </button>{' '}
                to save your progress, earn badges and take the Test.
              </p>
            )
          )}
          <p className="mt-10 text-[11px] uppercase tracking-[0.22em] text-cream/45">POS simulation · not live</p>
        </div>
      </section>

      {/* ---- How it works (on the dining-room green, like the restaurant site) ---- */}
      <section className="bg-forest py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="eyebrow">On the floor</p>
          <h2 className="font-display text-[clamp(36px,5vw,60px)]">
            Learn it here, <em>serve it there.</em>
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              { n: '01', t: 'Get to know the POS', d: 'Free Play is a copy of our BLUU screens: seat tables, ring AYCE rounds, void, split, tip-adjust. Search any dish to find its button.', go: 'practice' as Go, cta: 'Free Play' },
              { n: '02', t: 'Serve real tables', d: `${BUILT_IN.length} scenarios from beginner to advanced, plus endless random tables. Guests order in menu language; you find the buttons.`, go: 'scenarios' as Go, cta: 'Scenarios' },
              { n: '03', t: 'Run a whole shift', d: `The Test: ${TEST_TABLES} parties arrive and overlap, like a real Friday night. One score at the end, and a place on the leaderboard.`, go: 'test' as Go, cta: 'The Test' },
            ].map((x) => (
              <div key={x.n}>
                <span className="font-display text-xl text-gold">{x.n}</span>
                <h3 className="mt-3 font-display text-[30px] leading-tight">{x.t}</h3>
                <p className="mt-3 text-cream/70">{x.d}</p>
                <button className="mt-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-ember hover:text-cream" onClick={() => onGo(x.go)}>
                  {x.cta} <span aria-hidden>→</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- What makes it work ---- */}
      <section className="bg-ink py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="eyebrow">Why it works</p>
          <h2 className="font-display text-[clamp(36px,5vw,60px)]">
            Practice that feels <em>like the floor.</em>
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-gold-line bg-gold-line sm:grid-cols-2 lg:grid-cols-3">
            {[
              { i: <IconTerminal />, t: 'Our own POS, screen for screen', d: 'Same layout, buttons and flows as the BLUU terminals at Janchi, so nothing is new on day one.' },
              { i: <IconGuests />, t: 'Guests who talk like guests', d: '“Two briskets and a spicy pork, please.” They change their minds, ask for the check, split it, and pay part in cash.' },
              { i: <IconGrill />, t: 'The AYCE house rules', d: 'The 4-meat limit, everyone-or-no-one AYCE, lunch vs dinner pricing, server items, the 18% for big parties.' },
              { i: <IconShift />, t: 'Scored like a shift lead would', d: 'Every item, quantity, package, payment and closed check, with clear feedback on what to fix.' },
              { i: <IconMedal />, t: `Badges, XP and ranks`, d: `${BADGES.length} badges with bronze, silver and gold levels, a scenario passport to fill, and ranks from Trainee to Floor Legend.` },
              { i: <IconPodium />, t: 'A leaderboard to climb', d: 'Your best Test counts. Highest score wins; the faster shift breaks ties.' },
            ].map((f) => (
              <div key={f.t} className="bg-ink-2 p-7">
                <div className="text-gold">{f.i}</div>
                <h3 className="mt-4 font-display text-[26px] leading-tight">{f.t}</h3>
                <p className="mt-2 text-[15px] text-cream/65">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Ranks ---- */}
      <section className="relative overflow-hidden border-y border-gold-line bg-ink-2 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Ranks</p>
              <h2 className="font-display text-[clamp(32px,4.5vw,52px)]">
                From Trainee <em>to Floor Legend.</em>
              </h2>
            </div>
            <p className="max-w-sm text-sm text-cream/60">Earn XP for every scenario and Test you finish, and more for every badge level you reach.</p>
          </div>
          <ol className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {RANKS.map((r, i) => {
              const here = rank?.title === r.title;
              return (
                <li key={r.title} className={`relative rounded-xl border px-3 py-4 text-center ${here ? 'border-gold bg-gold-soft' : 'border-cream/10'}`}>
                  <div className="text-3xl">{r.icon}</div>
                  <div className="mt-2 font-display text-xl leading-tight">{r.title}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cream/45">
                    Lv {i + 1} · {r.xp.toLocaleString()} XP
                  </div>
                  {here && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2 text-[9px] font-bold uppercase tracking-[0.2em] text-ink">You</div>}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---- Leaders ---- */}
      <section className="bg-ink py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h2 className="font-display text-[clamp(36px,5vw,60px)]">
              Who runs <em>the floor?</em>
            </h2>
            <p className="mt-4 max-w-md text-cream/70">The best Test score on the current Test leads. Think you can take the top spot?</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className={`${btn} bg-janchi text-white hover:bg-[#d02535]`} onClick={() => onGo('test')}>
                Take the Test
              </button>
              <button className={`${btn} border border-cream/30 hover:border-cream`} onClick={() => onGo('leaderboard')}>
                Full leaderboard
              </button>
            </div>
          </div>
          <div className="space-y-3" data-testid="landing-leaders">
            {leaders === null ? (
              <div className="text-cream/40">Loading…</div>
            ) : leaders.length === 0 ? (
              <div className="rounded-2xl border border-gold-line p-8 text-center">
                <div className="font-display text-3xl">The board is open.</div>
                <p className="mt-2 text-cream/60">Be the first name on it.</p>
              </div>
            ) : (
              leaders.map((r, i) => (
                <div key={r.user_id} className={`flex items-center gap-4 rounded-2xl border px-5 py-4 ${i === 0 ? 'border-gold bg-gold-soft' : 'border-cream/10 bg-ink-2'}`}>
                  <span className="w-8 text-center font-display text-3xl text-gold">{i + 1}</span>
                  <Avatar name={r.display_name} url={r.avatar_url} size="h-11 w-11 text-base" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-2xl">{r.display_name}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-cream/45">{r.attempts} Test{r.attempts === 1 ? '' : 's'}</div>
                  </div>
                  <div className="font-display text-4xl tabular-nums">{r.score}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ---- Closing call ---- */}
      <section className="relative isolate overflow-hidden border-t border-gold-line bg-ink py-24 text-center">
        <p className="font-display text-xl tracking-[0.5em] text-gold">준비 완료</p>
        <h2 className="mt-2 font-display text-[clamp(40px,6vw,76px)]">
          Ready for <em>the floor?</em>
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className={`${btn} bg-janchi text-white hover:bg-[#d02535]`} onClick={() => onGo('scenarios')}>
            Start training <span aria-hidden>→</span>
          </button>
          {!auth.session && (
            <button className={`${btn} border border-cream/40 hover:border-cream`} onClick={() => openSignIn()}>
              Sign in
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
