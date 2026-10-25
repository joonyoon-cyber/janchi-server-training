import { useState } from 'react';
import { actions, usePos } from './lib/store';
import { PosFrame, type Zoom } from './pos/PosFrame';
import { quitScenario, startScenario, useTraining } from './training/engine';
import { HelpPanel } from './training/HelpPanel';
import { Results } from './training/Results';
import { ScenarioPanel } from './training/ScenarioPanel';
import { ScenarioPicker } from './training/ScenarioPicker';

type Mode = 'practice' | 'training';

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
  const [name, setName] = useState(settings.serverName);
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
            serverName: name.trim().toUpperCase().slice(0, 12) || 'TRAINEE',
            taxRate: Number.isFinite(rate) && rate >= 0 && rate < 20 ? rate : settings.taxRate,
            requireManagerForVoid: mgr,
            managerPin: pin || '1234',
          });
          onClose();
        }}
      >
        <h2 className="text-lg font-semibold">Simulator settings</h2>
        <label className="block text-sm">
          Your name (shown as the server on the POS)
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded bg-white px-2 py-1.5 text-slate-900" />
        </label>
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
  const [mode, setModeState] = useState<Mode>(() => readPref<Mode>('janchi-pos-sim:mode', 'practice'));
  const [zoom, setZoomState] = useState<Zoom>(() => readPref<Zoom>('janchi-pos-sim:zoom', 'fit'));
  const [showSide, setShowSide] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { run, result } = useTraining();

  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (mode === 'training' && run && !result && !confirm('Leave the scenario in progress? It will not be scored.')) return;
    if (m === 'practice') {
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

  const inScenario = mode === 'training' && run && !result;
  const sideContent = mode === 'practice' ? <HelpPanel /> : inScenario && run ? <ScenarioPanel run={run} /> : null;

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-slate-100">
        <div className="mr-auto leading-tight">
          <div className="text-sm font-semibold">Janchi POS Trainer</div>
          <div className="text-[10px] text-amber-300">Training simulator · not connected to the live POS</div>
        </div>
        <div className="flex rounded-md bg-slate-800 p-0.5 text-xs font-semibold">
          {(['practice', 'training'] as Mode[]).map((m) => (
            <button key={m} data-testid={`mode-${m}`} className={`rounded px-3 py-1 capitalize ${mode === m ? 'bg-sky-600' : 'text-slate-300'}`} onClick={() => setMode(m)}>
              {m}
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
      </header>

      {mode === 'training' && !inScenario ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          {result && run ? (
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
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
