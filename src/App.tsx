import { useState } from 'react';
import { actions, usePos } from './lib/store';
import { PosFrame, type Zoom } from './pos/PosFrame';
import { quitScenario, startScenario, useTraining } from './training/engine';
import { HelpPanel } from './training/HelpPanel';
import { Results } from './training/Results';
import { ScenarioPanel } from './training/ScenarioPanel';
import { ScenarioPicker } from './training/ScenarioPicker';
import { Leaderboard } from './training/Leaderboard';
import { TestScreens } from './training/TestMode';
import { testActions, useTest } from './training/testRun';
import { openSignIn, signOut, useAuth } from './lib/supabase';
import { SignInDialog } from './auth/SignInDialog';

type Mode = 'practice' | 'scenarios' | 'test' | 'leaderboard';

const MODES: { id: Mode; label: string }[] = [
  { id: 'practice', label: 'Free Play' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'test', label: 'Test' },
  { id: 'leaderboard', label: 'Leaderboard' },
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
  const [mgr, setMgr] = useState(settings.requireManagerForVoid);
  const [pin, setPin] = useState(settings.managerPin);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-xl bg-slate-800 p-5 text-slate-100 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const rate = parseFloat(tax);
          actions.updateSettings({
            taxRate: Number.isFinite(rate) && rate >= 0 && rate < 20 ? rate : settings.taxRate,
            requireManagerForVoid: mgr,
            managerPin: pin || '1234',
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mgr} onChange={(e) => setMgr(e.target.checked)} />
          Require a manager PIN to void items that were already ordered
        </label>
        {mgr && (
          <label className="block text-sm">
            Manager PIN for the simulator
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 w-32 rounded bg-white px-2 py-1.5 text-slate-900" />
          </label>
        )}
        <p className="text-xs text-slate-400">Whether the real BLUU POS asks for manager approval on voids has not been confirmed, so this is off by default.</p>
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
    return m === 'training' ? 'scenarios' : m === 'test' ? 'practice' : MODES.some((x) => x.id === m) ? (m as Mode) : 'practice';
  });
  const auth = useAuth();
  const test = useTest();
  const [zoom, setZoomState] = useState<Zoom>(() => readPref<Zoom>('janchi-pos-sim:zoom', 'fit'));
  const [showSide, setShowSide] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { run, result } = useTraining();

  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (mode === 'scenarios' && run && !result && !confirm('Leave the scenario in progress? It will not be scored.')) return;
    if (mode === 'test' && test.phase === 'shift' && !confirm('Quit the Test? This run will not be saved.')) return;
    if (mode === 'test') testActions.quit();
    if (m !== 'practice' && mode === 'practice') quitScenario();
    if (m === 'practice' || m === 'leaderboard') {
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
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-slate-100">
        <div className="mr-auto leading-tight">
          <div className="text-sm font-semibold">Janchi POS Trainer</div>
          <div className="text-[10px] text-amber-300">Training simulator · not connected to the live POS</div>
        </div>
        <div className="flex rounded-md bg-slate-800 p-0.5 text-xs font-semibold">
          {MODES.map((m) => (
            <button key={m.id} data-testid={`mode-${m.id}`} className={`rounded px-3 py-1 ${mode === m.id ? 'bg-sky-600' : 'text-slate-300'}`} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {(mode === 'practice' || inScenario) && (
          <>
            <button className="rounded border border-slate-600 px-2 py-1 text-xs" onClick={() => setZoom(zoom === 'fit' ? 'actual' : 'fit')} title="Fit the POS to the window, or show it at full size with scrolling">
              {zoom === 'fit' ? 'Zoom 100%' : 'Fit screen'}
            </button>
            <button className="rounded border border-slate-600 px-2 py-1 text-xs" onClick={() => setShowSide((v) => !v)}>
              {showSide ? 'Hide' : 'Show'} {mode === 'practice' ? 'help' : 'guests'}
            </button>
          </>
        )}
        {mode === 'practice' && (
          <button
            className="rounded border border-slate-600 px-2 py-1 text-xs"
            onClick={() => {
              if (confirm('Clear all tables and checks in Practice Mode?')) actions.reset({ persist: true });
            }}
          >
            Reset
          </button>
        )}
        <button className="rounded border border-slate-600 px-2 py-1 text-xs" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        {auth.session ? (
          <span className="flex items-center gap-2 text-xs text-slate-300">
            {auth.profile?.display_name ?? auth.session.user.email}
            <button className="rounded border border-slate-600 px-2 py-1" onClick={() => signOut()}>
              Sign out
            </button>
          </span>
        ) : (
          <button data-testid="sign-in" className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-900" onClick={() => openSignIn()}>
            Sign in
          </button>
        )}
      </header>

      {!showPos ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'leaderboard' ? (
            <Leaderboard auth={auth} />
          ) : mode === 'test' ? (
            <TestScreens auth={auth} onLeaderboard={() => setMode('leaderboard')} />
          ) : result && run ? (
            <Results scenario={run.scenario} ev={result} onRetry={() => startScenario(run.scenario)} onExit={() => quitScenario()} />
          ) : (
            <ScenarioPicker onStart={(s) => startScenario(s)} />
          )}
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div className="min-h-0 min-w-0 flex-1 portrait:aspect-[4/3] portrait:flex-none">
            <PosFrame zoom={zoom} />
          </div>
          <div className="hidden px-3 py-1 text-center text-xs text-slate-400 portrait:max-md:block">Tip: turn your phone sideways for a larger POS screen, or use Zoom 100% and scroll.</div>
          {showSide && sideContent && (
            <aside className="min-h-[220px] flex-1 border-t border-slate-700 bg-slate-900 landscape:h-auto landscape:w-[min(340px,32vw)] landscape:flex-none landscape:border-l landscape:border-t-0">
              {sideContent}
            </aside>
          )}
        </main>
      )}
      <footer data-testid="site-footer" className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 border-t border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
        <span>© 2026 Janchi Korean BBQ &amp; Bar · Server training simulator</span>
        <a className="text-sky-300 underline" href="privacy.html" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        <a className="text-sky-300 underline" href="terms.html" target="_blank" rel="noreferrer">
          Terms of Service
        </a>
      </footer>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <SignInDialog />
    </div>
  );
}
