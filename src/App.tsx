import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
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
import { openSignIn, signOut, useAuth } from './lib/supabase';
import { SignInDialog } from './auth/SignInDialog';
import { Profile } from './training/Profile';
import { BadgeToaster } from './training/BadgeToaster';
import { useAchievements } from './training/activity';
import { setProgressOwner } from './training/progress';
import { scenarios } from './training/scenarios';
import { Avatar } from './ui/Avatar';

type Mode = 'practice' | 'scenarios' | 'test' | 'leaderboard' | 'team' | 'analytics' | 'profile';

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
    const m = readPref<string>('janchi-pos-sim:mode', 'practice');
    // A Test in progress is not kept across reloads; 'training' was the old name of Scenarios.
    return m === 'training' ? 'scenarios' : m === 'test' ? 'practice' : m === 'profile' || MODES.some((x) => x.id === m) ? (m as Mode) : 'practice';
  });
  const auth = useAuth();
  const userId = auth.ready ? auth.session?.user.id ?? null : null;
  // Scenario results saved in this browser belong to the account that played them.
  setProgressOwner(userId);
  const achievements = useAchievements(userId);
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
    if (m === 'practice' || m === 'leaderboard' || m === 'team' || m === 'analytics' || m === 'profile') {
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
    <div className="flex h-full flex-col bg-slate-950">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-950 px-3 py-1.5 text-slate-100 shadow-[0_1px_0_rgba(190,30,45,0.35)]">
        <div className="mr-auto flex items-center gap-3">
          <img src="brand/janchi-mark-white.png" alt="Janchi Korean BBQ & Bar" className="h-10 w-auto" />
          <div className="border-l border-slate-700 pl-3 leading-tight">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-100">Server Training</div>
            <div className="text-[10px] tracking-wide text-slate-400">POS simulator · not connected to the live POS</div>
          </div>
          {/* Owner-only tools sit on the left, apart from the training tabs, so everyone's menu stays the same. */}
          {auth.profile?.is_owner && (
            <nav data-testid="owner-nav" className="ml-2 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/15 to-amber-300/5 p-1 pl-2.5 text-xs font-semibold ring-1 ring-amber-400/40">
              <span className="mr-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">👑 Owner</span>
              {MODES.filter((m) => m.id === 'team' || m.id === 'analytics').map((m) => (
                <button
                  key={m.id}
                  data-testid={`mode-${m.id}`}
                  className={`rounded-full px-3.5 py-1.5 transition-colors ${mode === m.id ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow shadow-amber-900/50' : 'text-amber-100 hover:bg-amber-400/15 hover:text-white'}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.id === 'team' ? '👥 ' : '📊 '}
                  {m.label}
                </button>
              ))}
            </nav>
          )}
        </div>
        <nav className="flex rounded-full bg-slate-900 p-1 text-xs font-semibold ring-1 ring-slate-800">
          {MODES.filter((m) => m.id !== 'team' && m.id !== 'analytics').map((m) => (
            <button
              key={m.id}
              data-testid={`mode-${m.id}`}
              className={`rounded-full px-3.5 py-1.5 transition-colors ${mode === m.id ? 'bg-sky-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        {auth.session ? (
          <span className="flex items-center gap-2 text-xs text-slate-300">
            <button
              data-testid="open-profile"
              title="Your profile and badges"
              className={`flex items-center gap-2 rounded-full py-0.5 pl-3 pr-0.5 transition-colors ${mode === 'profile' ? 'bg-sky-600/25 ring-1 ring-sky-600' : 'hover:bg-slate-800'}`}
              onClick={() => setMode('profile')}
            >
              <span className="text-right leading-tight">
                <span className="block font-semibold text-slate-100">{auth.profile?.display_name ?? auth.session.user.email}</span>
                <span className="block text-[10px] text-slate-400">
                  {achievements.a.rank.icon} {achievements.a.rank.title} · 🏅 {achievements.a.badges.reduce((t, b) => t + b.tier, 0)}
                </span>
              </span>
              <Avatar name={auth.profile?.display_name ?? auth.session.user.email ?? '?'} url={auth.profile?.avatar_url} size="h-8 w-8 text-xs" />
            </button>
            <button className="rounded-full border border-slate-700 px-3 py-1 hover:bg-slate-800" onClick={() => signOut()}>
              Sign out
            </button>
          </span>
        ) : (
          <button data-testid="sign-in" className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-sky-500" onClick={() => openSignIn()}>
            Sign in
          </button>
        )}
      </header>

      {!showPos ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'profile' && auth.session ? (
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
            <div data-testid="pos-toolbar" className="flex shrink-0 items-center justify-end gap-2 bg-slate-950 px-2 pt-1 text-xs text-slate-200">
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
      <footer data-testid="site-footer" className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 border-t border-slate-800 bg-slate-950 px-3 py-1 text-[11px] tracking-wide text-slate-500">
        <span>© 2026 Janchi Korean BBQ &amp; Bar · 165 N. Moorpark Rd., Thousand Oaks</span>
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
