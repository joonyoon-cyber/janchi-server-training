import { useEffect, useRef, useState } from 'react';
import { tableLabel } from '../lib/menu';
import { usePos } from '../lib/store';
import { formatClock, useNow } from '../pos/common';
import { answerChange, answerDecision, currentStage, endScenario, skipStage, useTraining } from './engine';
import type { RunState, Stage } from './types';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function speaker(st: Stage) {
  if (st.speaker === 'host') return 'Host';
  if (st.speaker === 'manager') return 'Manager';
  return 'Guest';
}

/** Generic task line. Never names POS buttons, categories, or item numbers. */
function task(st: Stage) {
  switch (st.kind) {
    case 'seat':
      return 'Seat the party.';
    case 'order':
      return 'Ring in the request and send it.';
    case 'void':
      return "Handle the guest's request on the POS.";
    case 'decision':
      return 'Choose how you respond.';
    case 'pay':
      return 'Take payment and close the check.';
  }
}

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Line({ who, text, current, italic }: { who?: string; text: string; current?: boolean; italic?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-sm leading-snug ${current ? 'bg-amber-100 text-slate-900 ring-2 ring-amber-400' : 'bg-slate-700/60 text-slate-200'} ${italic ? 'italic' : ''}`}>
      {who && <div className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wide ${current ? 'text-amber-700' : 'text-slate-400'}`}>{who}</div>}
      {text}
    </div>
  );
}

export function ScenarioPanel({ run }: { run: RunState }) {
  useTraining();
  const t = useNow(1000);
  const tableChecks = usePos((s) => s.tableChecks);
  const st = currentStage(run);
  const sc = run.scenario;
  const scroller = useRef<HTMLDivElement>(null);
  const [change, setChange] = useState('');

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [run.stageIndex, run.records.length, run.awaitingChange, run.records[run.records.length - 1]?.interruptShown]);

  const elapsed = Math.max(0, Math.round((t - run.startedAt) / 1000));
  const parties = Object.entries(sc.parties);
  const story = new Date(t);

  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="border-b border-slate-700 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{sc.level} training</div>
            <div className="font-semibold leading-tight">{sc.title}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg tabular-nums" title="Elapsed time">{fmtSec(elapsed)}</div>
            <div className="text-[11px] text-slate-400">target {fmtSec(sc.targetSeconds)}</div>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {DAY[story.getDay()]} {formatClock(t)} ·{' '}
          {parties.map(([k, g]) => `${parties.length > 1 ? `Party ${k.slice(1)}: ` : ''}${g} guest${g > 1 ? 's' : ''}${run.partyTables[k] && tableChecks[run.partyTables[k]] ? ` at ${tableLabel(run.partyTables[k])}` : ''}`).join(' · ')}
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {sc.stages.slice(0, run.stageIndex + 1).map((s, i) => {
          const rec = run.records[i];
          const isCur = i === run.stageIndex && !!st;
          return (
            <div key={s.id} className="space-y-2">
              {s.note && <Line text={s.note} italic />}
              <Line who={speaker(s)} text={s.say} current={isCur && !rec?.interruptShown && !run.awaitingChange} />
              {s.kind === 'order' && s.interrupt && rec?.interruptShown && <Line who="Guest" text={s.interrupt.say} current={isCur} />}
              {rec?.skipped && <div className="text-xs text-rose-300">Step skipped</div>}
              {s.kind === 'decision' && rec?.choice !== undefined && <div className="text-xs text-slate-400">You: {s.options[rec.choice].text}</div>}
            </div>
          );
        })}
      </div>

      {st && (
        <div className="border-t border-slate-700 bg-slate-800/80 px-4 py-3">
          {st.kind === 'decision' ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold">{st.question}</div>
              {st.options.map((o, i) => (
                <button key={i} className="w-full rounded-md bg-slate-600 px-3 py-2 text-left text-sm hover:bg-sky-700" onClick={() => answerDecision(i)}>
                  {o.text}
                </button>
              ))}
            </div>
          ) : run.awaitingChange ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = parseFloat(change);
                if (!Number.isNaN(v)) {
                  answerChange(v);
                  setChange('');
                }
              }}
            >
              <div className="text-sm font-semibold">The guest is waiting for change. How much do you hand back?</div>
              <div className="flex gap-2">
                <span className="self-center">$</span>
                <input inputMode="decimal" autoFocus value={change} onChange={(e) => setChange(e.target.value)} className="w-28 rounded bg-white px-2 py-1 text-slate-900" placeholder="0.00" />
                <button className="rounded-md bg-sky-600 px-3 py-1 text-sm font-semibold hover:bg-sky-500">Give change</button>
              </div>
            </form>
          ) : (
            <div className="text-sm">
              <span className="font-semibold text-amber-300">Your task:</span> {task(st)}
            </div>
          )}
          <div className="mt-3 flex gap-2 text-xs">
            <button className="rounded border border-slate-500 px-2 py-1 text-slate-300 hover:bg-slate-700" onClick={() => skipStage()}>
              Skip step
            </button>
            <button className="rounded border border-slate-500 px-2 py-1 text-slate-300 hover:bg-slate-700" onClick={() => endScenario()}>
              End &amp; score now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
