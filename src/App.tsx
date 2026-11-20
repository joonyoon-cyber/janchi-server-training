import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { actions, usePos } from './lib/store';
import { PosFrame, ZOOMS, type Zoom } from './pos/PosFrame';
import { quitScenario, startScenario, useTraining } from './training/engine';
import { HelpPanel } from './training/HelpPanel';
import { Results } from './training/Results';
import { ScenarioPanel } from './training/ScenarioPanel';
import { rememberLevel, ScenarioPicker } from './training/ScenarioPicker';
import { Leaderboard } from './training/Leaderboard';
import { Team } from './training/Team';

// Loaded only when the owner opens it (keeps the spreadsheet code out of everyone else's download).
// After the site is updated, a page opened earlier asks for the old file name, which no longer
// exists: reload once to get the new version (the Analytics tab is remembered and reopens).
const RELOADED = 'janchi-pos-sim:reloaded-for-update';
const AnalyticsPage = lazy(() =>
  import('./analytics/AnalyticsPage')
    .then((m) => {
      try {
        sessionStorage.removeItem(RELOADED);
      } catch {
        // ignore
      }
      return m;
    })
    .catch((err) => {
      let tried = true;
      try {
        tried = !!sessionStorage.getItem(RELOADED);
        if (!tried) sessionStorage.setItem(RELOADED, '1');
      } catch {
        // ignore
      }
      if (!tried) {
        window.location.reload();
        return new Promise<never>(() => {});
      }
      throw err;
    }),
);

/** Small line icons in the header (gold hairline style). */
function IconTeam() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2c2.4.2 4.2 1.7 5 4.8" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </svg>
  );
}
function IconGearLine() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}

/** Shows a message instead of a blank site if a page fails to load (e.g. offline). */
class LoadGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md space-y-3 p-8 text-center text-slate-200" data-testid="load-failed">
        <div className="text-lg font-semibold">This page couldn't load.</div>
        <p className="text-sm text-slate-400">The site may have just been updated, or the connection dropped. Reloading usually fixes it.</p>
        <button
          className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          onClick={() => {
            try {
              sessionStorage.removeItem(RELOADED);
            } catch {
              // ignore
            }
            window.location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
import { TestScreens } from './training/TestMode';
import { testActions, useTest } from './training/testRun';
import { openSignIn, saveBadgeSummary, signOut, useAuth } from './lib/supabase';
import { badgeSummary } from './training/achievements';
import { SignInDialog } from './auth/SignInDialog';
import { Profile } from './training/Profile';
import { BadgeToaster } from './training/BadgeToaster';
import { useAchievements } from './training/activity';
import { setProgressOwner } from './training/progress';
import { scenarios } from './training/scenarios';
import { Avatar } from './ui/Avatar';
import { Landing } from './home/Landing';

type Mode = 'home' | 'practice' | 'scenarios' | 'test' | 'leaderboard' | 'team' | 'analytics' | 'profile';

const MODES: { id: Mode; label: string }[] = [
  { id: 'practice', label: 'Free Play' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'test', label: 'Test' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'team', label: 'Team' },
  { id: 'analytics', label: 'Analytics' },
];

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // ignore
  }
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = usePos((s) => s.settings);
  const [tax, setTax] = useState(String(settings.taxRate));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-xl bg-slate-800 p-5 text-slate-100 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const rate = parseFloat(tax);
          actions.updateSettings({
            taxRate: Number.isFinite(rate) && rate >= 0 && rate < 20 ? rate : settings.taxRate,
          });
          onClose();
        }}
      >
        <h2 className="text-lg font-semibold">Simulator settings</h2>
        <p className="text-sm text-slate-300">Log in on the POS with any number: the server name becomes SERVER plus that number (e.g. 123 → SERVER123).</p>
        <label className="block text-sm">
          Sales tax rate (%)
          <input value={tax} inputMode="decimal" onChange={(e) => setTax(e.target.value)} className="mt-1 w-32 rounded bg-white px-2 py-1.5 text-slate-900" />
          <span className="mt-1 block text-xs text-slate-400">7.25% matches the tax on the reference receipts. Change it if the rate changes.</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md border border-slate-500 px-4 py-1.5" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-md bg-sky-600 px-4 py-1.5 font-semibold">Save</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [mode, setModeState] = useState<Mode>(() => {
    // First visit: the landing page. A Test in progress is not kept across reloads; 'training' was the old name of Scenarios.
    const m = readPref<string>('janchi-pos-sim:mode', 'home');
    return m === 'training' ? 'scenarios' : m === 'test' ? 'practice' : m === 'profile' || m === 'home' || MODES.some((x) => x.id === m) ? (m as Mode) : 'home';
  });
  const auth = useAuth();
  const userId = auth.ready ? auth.session?.user.id ?? null : null;
  // Scenario results saved in this browser belong to the account that played them.
  setProgressOwner(userId);
  const achievements = useAchievements(userId);
  // Each page opens at its top (the page area keeps its scroll position otherwise).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [mode]);

  // Keep the public leaderboard's level and badges up to date (saved only when they change).
  const savedSummary = useRef('');
  useEffect(() => {
    if (!userId || achievements.loading || auth.profile?.id !== userId) return;
    const badges = badgeSummary(achievements.a);
    const xp = achievements.a.xp;
    const key = `${userId}|${xp}|${badges}`;
    if (savedSummary.current === key || (auth.profile.xp === xp && (auth.profile.badges ?? '') === badges)) return;
    savedSummary.current = key;
    void saveBadgeSummary(userId, xp, badges);
  }, [userId, achievements.loading, achievements.a, auth.profile]);
  // The Profile (and badges) exist only for signed-in people: leave it on sign-out.
  useEffect(() => {
    if (auth.ready && !auth.session && mode === 'profile') setModeState('scenarios');
  }, [auth.ready, auth.session, mode]);
  const test = useTest();
  const [zoom, setZoomState] = useState<Zoom>(() => {
    const z = readPref<string>('janchi-pos-sim:zoom', 'fit');
    // 'actual' was the old name for 100%.
    return z === 'actual' ? '100' : ZOOMS.some((x) => x.value === z) ? (z as Zoom) : 'fit';
  });
  const [showSide, setShowSide] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { run, result } = useTraining();

  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (mode === 'scenarios' && run && !result && !confirm('Leave the scenario in progress? It will not be scored.')) return;
    if (mode === 'test' && test.phase === 'shift' && !confirm('Quit the Test? This run will not be saved.')) return;
    if (mode === 'test') testActions.quit();
    if (m !== 'practice' && mode === 'practice') quitScenario();
    if (m === 'home' || m === 'practice' || m === 'leaderboard' || m === 'team' || m === 'analytics' || m === 'profile') {
      quitScenario();
      actions.loadPractice();
    }
    setModeState(m);
    writePref('janchi-pos-sim:mode', m);
  };
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    writePref('janchi-pos-sim:zoom', z);
  };

  const inTestTable = mode === 'test' && test.phase === 'shift' && !!run && !result;
  const inScenario = (mode === 'scenarios' && !!run && !result) || inTestTable;
  const testLabel = inTestTable ? 'Service test' : undefined;
  const sideContent = mode === 'practice' ? <HelpPanel /> : inScenario && run ? <ScenarioPanel run={run} testLabel={testLabel} /> : null;
  const showPos = mode === 'practice' || inScenario;

  return (
    <div className="flex h-full flex-col bg-ink">
      <header data-testid="site-header" className="relative flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-gold-line bg-ink px-3 py-2 text-cream sm:px-5">
        <div className="mr-auto flex items-center gap-3">
          {/* Brand: the gold-ringed emblem from janchibbq.com; goes to the landing page. */}
          <button data-testid="brand-home" className="group flex items-center gap-3 text-left" onClick={() => setMode('home')} title="Janchi Service Academy: home">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold bg-ink transition-shadow group-hover:shadow-[inset_0_0_12px_rgba(184,149,95,0.45)]">
              <span className="absolute inset-[3px] rounded-full border border-gold-line" />
              <img src="brand/janchi-mark-cream.png" alt="" className="relative h-5 w-auto" />
            </span>
            <span className="leading-none">
              <span className="hidden whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.32em] text-ember sm:block">Janchi Korean BBQ</span>
              <span className="block whitespace-nowrap font-display text-[20px] font-medium tracking-wide text-cream sm:mt-1 sm:text-[22px]">
                Service <em className="text-ember">Academy</em>
              </span>
            </span>
          </button>
          {/* Owner-only tools sit on the left, apart from the training tabs, so everyone's menu stays the same. */}
          {auth.profile?.is_owner && (
            <nav data-testid="owner-nav" className="ml-1 flex items-center gap-0.5 rounded-full border border-gold-line bg-gold-soft p-1 pl-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
              <span className="mr-1.5 hidden text-[9px] font-bold tracking-[0.28em] text-ember sm:inline">Owner</span>
              {MODES.filter((m) => m.id === 'team' || m.id === 'analytics').map((m) => (
                <button
                  key={m.id}
                  data-testid={`mode-${m.id}`}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 uppercase tracking-[0.14em] transition-colors ${mode === m.id ? 'bg-gradient-to-b from-[#e2c48e] to-gold text-ink shadow shadow-black/50' : 'text-cream/80 hover:bg-gold/15 hover:text-cream'}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.id === 'team' ? <IconTeam /> : <IconChart />}
                  <span className="hidden md:inline">{m.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
        <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto text-[11.5px] font-semibold uppercase tracking-[0.16em]">
          {MODES.filter((m) => m.id !== 'team' && m.id !== 'analytics').map((m) => (
            <button
              key={m.id}
              data-testid={`mode-${m.id}`}
              className={`whitespace-nowrap border-b px-2.5 py-1.5 uppercase tracking-[0.16em] transition-colors sm:px-3 ${mode === m.id ? 'border-gold text-cream' : 'border-transparent text-cream/60 hover:border-gold-line hover:text-cream'}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button
          className="grid h-8 w-8 place-items-center rounded-full border border-gold-line text-cream/70 transition-colors hover:border-gold hover:text-cream"
          onClick={() => setSettingsOpen(true)}
          title="Simulator settings"
          aria-label="Simulator settings"
        >
          <IconGearLine />
        </button>
        {auth.session ? (
          <span className="flex items-center gap-2 text-xs text-slate-300">
            <button
              data-testid="open-profile"
              title="Your profile and badges"
              className={`flex items-center gap-2 rounded-full border py-0.5 pl-3 pr-0.5 transition-colors ${mode === 'profile' ? 'border-gold bg-gold-soft' : 'border-transparent hover:border-gold-line'}`}
              onClick={() => setMode('profile')}
            >
              <span className="hidden text-right leading-tight sm:block">
                <span className="block font-semibold text-cream">{auth.profile?.display_name ?? auth.session.user.email}</span>
                <span className="block text-[10px] text-cream/50">
                  {achievements.a.rank.icon} {achievements.a.rank.title} · 🏅 {achievements.a.badges.reduce((t, b) => t + b.tier, 0)}
                </span>
              </span>
              <Avatar name={auth.profile?.display_name ?? auth.session.user.email ?? '?'} url={auth.profile?.avatar_url} size="h-8 w-8 text-xs" />
            </button>
            <button className="rounded-full border border-gold-line px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-cream/80 hover:border-gold hover:text-cream" onClick={() => signOut()}>
              Sign out
            </button>
          </span>
        ) : (
          <button data-testid="sign-in" className="rounded-full bg-janchi px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow hover:bg-[#d02535]" onClick={() => openSignIn()}>
            Sign in
          </button>
        )}
      </header>

      {!showPos ? (
        <main ref={mainRef} className={`app-page min-h-0 flex-1 overflow-y-auto ${mode === 'home' ? 'bg-ink' : ''}`}>
          {mode === 'home' ? (
            <Landing auth={auth} rank={auth.session ? achievements.a.rank : null} onGo={(m) => setMode(m)} />
          ) : mode === 'profile' && auth.session ? (
            <Profile
              auth={auth}
              ach={achievements.a}
              history={achievements.history}
              loading={achievements.loading}
              onStart={(id) => {
                const sc = scenarios.find((x) => x.id === id);
                if (!sc) return;
                rememberLevel(sc.level);
                setMode('scenarios');
                startScenario(sc);
              }}
            />
          ) : mode === 'leaderboard' ? (
            <Leaderboard auth={auth} />
          ) : mode === 'team' ? (
            <Team auth={auth} />
          ) : mode === 'analytics' ? (
            <LoadGuard>
              <Suspense fallback={<div className="p-6 text-slate-400">Loading…</div>}>
                <AnalyticsPage isOwner={!!auth.profile?.is_owner} />
              </Suspense>
            </LoadGuard>
          ) : mode === 'test' ? (
            <TestScreens auth={auth} onLeaderboard={() => setMode('leaderboard')} />
          ) : result && run ? (
            <Results scenario={run.scenario} ev={result} notSaved={auth.ready && !auth.session} onRetry={() => startScenario(run.scenario)} onExit={() => quitScenario()} />
          ) : (
            <ScenarioPicker onStart={(s) => startScenario(s)} ach={achievements.a} history={achievements.history} signedIn={!!auth.session} onProfile={() => setMode('profile')} />
          )}
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col portrait:flex-none">
            {/* POS toolbar: controls for the POS screen only, so the header stays the same on every tab. */}
            <div data-testid="pos-toolbar" className="flex shrink-0 items-center justify-end gap-2 bg-ink px-2 pt-1 text-xs text-slate-200">
              <span className="mr-auto hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cream/40 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-ember/70" /> Training POS · not connected to the live POS
              </span>
              <label className="flex items-center gap-1" title="Fit the POS to the window, or pick a size and scroll">
                Zoom
                <select
                  data-testid="zoom-select"
                  value={zoom}
                  onChange={(e) => setZoom(e.target.value as Zoom)}
                  className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-100"
                >
                  {ZOOMS.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              {sideContent && (
                <button className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800" onClick={() => setShowSide((v) => !v)}>
                  {showSide ? 'Hide' : 'Show'} {mode === 'practice' ? 'help' : 'guests'}
                </button>
              )}
              {mode === 'practice' && (
                <button
                  className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
                  onClick={() => {
                    if (confirm('Clear all tables and checks in Free Play?')) actions.reset({ persist: true });
                  }}
                >
                  Reset tables
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 portrait:aspect-[4/3] portrait:flex-none">
              <PosFrame zoom={zoom} />
            </div>
          </div>
          <div className="hidden px-3 py-1 text-center text-xs text-slate-400 portrait:max-md:block">Tip: turn your phone sideways for a larger POS screen, or pick a larger Zoom and scroll.</div>
          {showSide && sideContent && (
            <aside className="min-h-[220px] flex-1 border-t border-slate-700 bg-slate-900 landscape:h-auto landscape:w-[min(340px,32vw)] landscape:flex-none landscape:border-l landscape:border-t-0">
              {sideContent}
            </aside>
          )}
        </main>
      )}
      <footer data-testid="site-footer" className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 border-t border-gold-line bg-ink px-3 py-1 text-[11px] tracking-wide text-cream/45">
        <span>© 2026 Janchi Korean BBQ &amp; Bar · Service Academy · 165 N. Moorpark Rd., Thousand Oaks</span>
        <a className="hover:text-slate-300 hover:underline" href="privacy.html" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        <a className="hover:text-slate-300 hover:underline" href="terms.html" target="_blank" rel="noreferrer">
          Terms of Service
        </a>
      </footer>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <SignInDialog />
      {auth.ready && auth.session && <BadgeToaster ach={achievements.a} loading={achievements.loading} who={userId ?? 'guest'} onOpen={() => setMode('profile')} />}
    </div>
  );
}
