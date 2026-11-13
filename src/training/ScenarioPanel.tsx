import { useEffect, useRef, useState } from 'react';
import { tableLabel } from '../lib/menu';
import { usePos } from '../lib/store';
import { formatClock, useNow } from '../pos/common';
import { answerChange, answerDecision, currentStage, DEFAULT_ASK, endScenario, nextStage, useTraining, waitingForCheck } from './engine';
import type { RunState, Stage } from './types';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function speaker(st: Stage) {
  if (st.speaker === 'host') return 'Host';
  if (st.speaker === 'manager') return 'Manager';
  return 'Guest';
}

/** Generic task line. Never names POS buttons, categories, or item numbers. */
function task(st: Stage, run: RunState) {
  if (waitingForCheck(run, st)) return 'Print the check and bring it to the table.';
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

type Kind = 'seat' | 'counter' | 'order' | 'change' | 'question' | 'serve' | 'check' | 'pay' | 'note';

/** Each kind of request has its own color and icon, so it is clear what the guest wants. */
const KIND: Record<Kind, { label: string; card: string; current: string; badge: string; icon: string }> = {
  seat: { label: 'Seating', card: 'bg-indigo-950/50 ring-1 ring-indigo-800/60', current: 'bg-indigo-900/70 ring-2 ring-indigo-400', badge: 'bg-indigo-500', icon: 'M4 12h16M6 12V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M6 12v7M18 12v7' },
  counter: { label: 'At the counter', card: 'bg-orange-950/40 ring-1 ring-orange-800/60', current: 'bg-orange-900/60 ring-2 ring-orange-400', badge: 'bg-orange-500', icon: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2' },
  order: { label: 'Order', card: 'bg-slate-800 ring-1 ring-slate-700', current: 'bg-slate-700 ring-2 ring-slate-300', badge: 'bg-slate-500', icon: 'M7 3v8a2 2 0 0 0 4 0V3M9 3v18M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9' },
  change: { label: 'Change!', card: 'bg-rose-950/50 ring-1 ring-rose-800/70', current: 'bg-rose-900/70 ring-2 ring-rose-400 animate-[pulse_1.6s_ease-in-out_3]', badge: 'bg-rose-500', icon: 'M12 6v8M12 18h.01' },
  question: { label: 'Question', card: 'bg-violet-950/50 ring-1 ring-violet-800/60', current: 'bg-violet-900/70 ring-2 ring-violet-400', badge: 'bg-violet-500', icon: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5M12 17h.01' },
  serve: { label: 'Who brings it?', card: 'bg-teal-950/50 ring-1 ring-teal-800/60', current: 'bg-teal-900/70 ring-2 ring-teal-400', badge: 'bg-teal-500', icon: 'M4 15h16M6 15a6 6 0 0 1 12 0M12 7V5M3 18h18' },
  check: { label: 'Check, please', card: 'bg-emerald-950/50 ring-1 ring-emerald-800/60', current: 'bg-emerald-900/70 ring-2 ring-emerald-400', badge: 'bg-emerald-500', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  pay: { label: 'Paying', card: 'bg-amber-950/40 ring-1 ring-amber-800/60', current: 'bg-amber-900/60 ring-2 ring-amber-400', badge: 'bg-amber-500', icon: 'M3 7h18v10H3zM3 11h18M7 15h3' },
  note: { label: '', card: '', current: '', badge: '', icon: '' },
};

function kindOf(st: Stage): Kind {
  if (st.kind === 'seat') return st.takeout ? 'counter' : 'seat';
  if (st.kind === 'pay') return 'pay';
  if (st.kind === 'decision') return st.followUp ? 'serve' : 'question';
  return 'order';
}

function Line({ who, text, current, kind = 'order' }: { who?: string; text: string; current?: boolean; kind?: Kind }) {
  if (kind === 'note') return <div className="px-1 text-xs italic text-slate-400">{text}</div>;
  const k = KIND[kind];
  return (
    <div data-kind={kind} className={`rounded-xl px-3 py-2.5 text-sm leading-snug text-slate-100 transition-colors ${current ? k.current : k.card}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${k.badge}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d={k.icon} />
          </svg>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">{k.label}</span>
        {who && <span className="truncate text-[11px] text-slate-400">· {who}</span>}
        {current && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Now</span>}
      </div>
      <div className={current ? 'text-white' : 'text-slate-300'}>{text}</div>
    </div>
  );
}

/** `testLabel` replaces the scenario title in Test mode so it gives nothing away. */
export function ScenarioPanel({ run, testLabel }: { run: RunState; testLabel?: string }) {
  useTraining();
  const t = useNow(1000);
  const tableChecks = usePos((s) => s.tableChecks);
  const st = currentStage(run);
  const sc = run.scenario;
  const scroller = useRef<HTMLDivElement>(null);
  // A printed check reveals the guests' payment line: scroll to it like any new request.
  const printedCount = run.records.filter((r) => r.checkPrinted).length;
  const [change, setChange] = useState('');

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [run.stageIndex, run.records.length, run.awaitingChange, run.records[run.records.length - 1]?.interruptShown, printedCount]);

  // Several tables at once: label each line with its table.
  const who = (s: Stage) => {
    if (Object.keys(sc.parties).length < 2) return speaker(s);
    const t = run.partyTables[s.party];
    const place = t ? (t.startsWith('TO-') ? 'Take out' : tableLabel(t)) : s.kind === 'seat' ? (s.takeout ? 'Counter' : 'New party') : 'Waiting for a table';
    return `${speaker(s)} · ${place}`;
  };
  // Counter guests pay up front; there is no check to print. (Not seated yet: assume dine-in unless it is a counter guest.)
  const isTakeout = (party: string) => {
    const t = run.partyTables[party];
    return t ? t.startsWith('TO-') : sc.stages.some((x) => x.kind === 'seat' && x.party === party && x.takeout);
  };
  const elapsed = Math.max(0, Math.round((t - run.startedAt) / 1000));
  const parties = Object.entries(sc.parties);
  const story = new Date(t);

  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="border-b border-slate-700 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{testLabel ? 'Test' : `${sc.level} training`}</div>
            <div className="font-semibold leading-tight">{testLabel ?? sc.title}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg tabular-nums" title="Elapsed time">{fmtSec(elapsed)}</div>
            {!testLabel && <div className="text-[11px] text-slate-400">target {fmtSec(sc.targetSeconds)}</div>}
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {DAY[story.getDay()]} {formatClock(t)} ·{' '}
          {testLabel
            ? `Request ${run.stageIndex + 1} of ${sc.stages.length} · ${Object.values(run.partyTables).filter((t) => tableChecks[t] || t.startsWith('TO-')).length} open`
            : parties.map(([k, g]) => `${parties.length > 1 ? `Party ${k.slice(1)}: ` : ''}${g} guest${g > 1 ? 's' : ''}${run.partyTables[k] && tableChecks[run.partyTables[k]] ? ` at ${tableLabel(run.partyTables[k])}` : ''}`).join(' · ')}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Log in on the POS with any number (e.g. 123).
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {sc.stages.slice(0, run.stageIndex + 1).map((s, i) => {
          const rec = run.records[i];
          const isCur = i === run.stageIndex && !!st;
          return (
            <div key={s.id} className="space-y-2">
              {s.note && <Line text={s.note} kind="note" />}
              {s.kind === 'pay' && !isTakeout(s.party) && <Line who={who(s)} kind="check" text={s.ask ?? DEFAULT_ASK} current={isCur && !rec?.checkPrinted} />}
              {s.kind === 'pay' && !isTakeout(s.party) && rec?.checkPrinted && <div className="px-1 text-xs text-slate-400">🧾 Check printed and brought to the table.</div>}
              {(s.kind !== 'pay' || isTakeout(s.party) || rec?.checkPrinted) && (
                <Line who={who(s)} kind={kindOf(s)} text={s.say} current={isCur && !rec?.interruptShown && !run.awaitingChange} />
              )}
              {s.kind === 'order' && s.interrupt && rec?.interruptShown && <Line who={who(s)} kind="change" text={s.interrupt.say} current={isCur} />}
              {rec?.skipped && <div className="text-xs text-rose-300">Step skipped</div>}
              {rec?.passed && !isCur && <div className="text-xs text-slate-400">↷ Moved on. It still counts if you do it now.</div>}
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
              <span className="font-semibold text-amber-300">Your task:</span> {task(st, run)}
            </div>
          )}
          <div className="mt-3 flex gap-2 text-xs">
            {!run.awaitingChange && (
              <button data-testid="next-request" className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-600" onClick={() => nextStage()} title="Move on. Nothing is given up: doing it later on the POS still counts.">
                Next ▸
              </button>
            )}
            <button
              className="rounded border border-slate-500 px-2 py-1 text-slate-300 hover:bg-slate-700"
              onClick={() => (!testLabel || confirm('Finish the shift now? Requests you have not seen yet count as missed.')) && endScenario()}
            >
              {testLabel ? 'Finish shift' : <>End &amp; score now</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
