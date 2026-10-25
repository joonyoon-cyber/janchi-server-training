import { useSyncExternalStore } from 'react';
import { actions, getState, now, onPosEvent } from '../lib/store';
import type { LoggedEvent } from '../lib/types';
import { evaluate, type Evaluation } from './evaluate';
import { saveResult } from './progress';
import type { RunState, Scenario, Stage } from './types';

let run: RunState | null = null;
let result: Evaluation | null = null;
const listeners = new Set<() => void>();
let snapshot: { run: RunState | null; result: Evaluation | null } = { run, result };

function notify() {
  snapshot = { run: run ? { ...run } : null, result };
  listeners.forEach((l) => l());
}

export function useTraining() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

export function getRun() {
  return { run, result };
}

export function currentStage(r: RunState | null = run): Stage | null {
  if (!r || r.finishedAt) return null;
  return r.scenario.stages[r.stageIndex] ?? null;
}

/** Milliseconds to add to the wall clock so the POS shows the story time. */
export function storyOffset(time: Scenario['time']): number {
  const real = new Date();
  const d = new Date(real);
  d.setDate(d.getDate() + ((time.weekday - d.getDay() + 7) % 7));
  d.setHours(time.hour, time.minute, 0, 0);
  return d.getTime() - real.getTime();
}

export function startScenario(sc: Scenario) {
  actions.reset({ persist: false, clockOffset: storyOffset(sc.time) });
  const t = now();
  run = {
    scenario: sc,
    stageIndex: 0,
    startedAt: t,
    partyTables: {},
    partyChecks: {},
    records: [{ stageId: sc.stages[0].id, startedAt: t }],
    events: [],
    addsThisStage: 0,
  };
  result = null;
  notify();
}

export function quitScenario() {
  run = null;
  result = null;
  notify();
}

function record() {
  return run!.records[run!.records.length - 1];
}

function finish() {
  if (!run) return;
  run.finishedAt = now();
  result = evaluate(run, getState());
  saveResult(run.scenario, result);
}

function advance() {
  if (!run) return;
  record().endedAt = now();
  run.stageIndex += 1;
  run.addsThisStage = 0;
  run.awaitingChange = false;
  if (run.stageIndex >= run.scenario.stages.length) finish();
  else run.records.push({ stageId: run.scenario.stages[run.stageIndex].id, startedAt: now() });
  notify();
}

export function skipStage() {
  if (!run || run.finishedAt) return;
  record().skipped = true;
  advance();
}

export function answerDecision(index: number) {
  const st = currentStage();
  if (!st || st.kind !== 'decision') return;
  record().choice = index;
  advance();
}

export function answerChange(amount: number) {
  if (!run?.awaitingChange) return;
  record().changeAnswer = amount;
  advance();
}

/** Finish early (remaining stages are counted as skipped). */
export function endScenario() {
  if (!run || run.finishedAt) return;
  while (run.stageIndex < run.scenario.stages.length) {
    record().skipped = true;
    record().endedAt = now();
    run.stageIndex += 1;
    if (run.stageIndex < run.scenario.stages.length) run.records.push({ stageId: run.scenario.stages[run.stageIndex].id, startedAt: now() });
  }
  finish();
  notify();
}

function tableOf(e: LoggedEvent): string | undefined {
  if ('tableId' in e) return e.tableId;
  if ('checkId' in e) return getState().checks[e.checkId]?.tableId;
  return undefined;
}

onPosEvent((e) => {
  if (!run || run.finishedAt) return;
  run.events.push({ ...e, stage: run.stageIndex });
  const st = currentStage();
  if (!st) return;
  const partyTable = run.partyTables[st.party];
  const table = tableOf(e);

  // A party re-seated at the same table (e.g. after an empty check was released).
  if (e.type === 'seat' && st.kind !== 'seat') {
    const party = Object.keys(run.partyTables).find((p) => run!.partyTables[p] === e.tableId);
    if (party) run.partyChecks[party] = e.checkId;
  }

  switch (st.kind) {
    case 'seat':
      if (e.type === 'seat') {
        run.partyTables[st.party] = e.tableId;
        run.partyChecks[st.party] = e.checkId;
        record().seatedTable = e.tableId;
        record().seatedGuests = e.guests;
        advance();
        return;
      }
      break;
    case 'order':
      if (e.type === 'add-item' && table === partyTable) {
        run.addsThisStage += e.qty;
        if (st.interrupt && !record().interruptShown && run.addsThisStage >= st.interrupt.afterAdds) record().interruptShown = true;
      }
      if (e.type === 'submit' && e.tableId === partyTable) {
        // A change the guest would have made mid-order still counts as heard.
        if (st.interrupt) record().interruptShown = true;
        record().submitted = e.items;
        record().submitTable = e.tableId;
        advance();
        return;
      }
      break;
    case 'void':
      if (e.type === 'void-sent' && table === partyTable && e.posId === st.item.posId) {
        const voided = run.events
          .filter((x) => x.type === 'void-sent' && x.stage === run!.stageIndex && tableOf(x) === partyTable && x.posId === st.item.posId)
          .reduce((s, x) => s + (x.type === 'void-sent' ? x.qty : 0), 0);
        if (voided >= st.item.qty) {
          advance();
          return;
        }
      }
      break;
    case 'pay':
      if (e.type === 'close-check' && e.tableId === partyTable) {
        const paidCash = getState().checks[e.checkId]?.payments.some((p) => p.method === 'cash');
        if (st.askChange && paidCash) {
          run.awaitingChange = true;
        } else {
          advance();
          return;
        }
      }
      break;
    default:
      break;
  }
  notify();
});
