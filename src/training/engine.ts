import { useSyncExternalStore } from 'react';
import { actions, getState, now, onPosEvent } from '../lib/store';
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

/** Non-React subscription (Test mode controller). */
export function subscribeTraining(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
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

/** Move on to the next request. Nothing is given up: doing it later on the POS still counts. */
export function nextStage() {
  if (!run || run.finishedAt) return;
  if (run.awaitingChange) return;
  record().passed = true;
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

/** Record of an earlier order request (passed with Next) on this check that has no Order yet. */
function earlierUnanswered(checkId: string) {
  if (!run) return undefined;
  for (let i = 0; i < run.stageIndex; i++) {
    const st = run.scenario.stages[i];
    if (st.kind !== 'order' || run.partyChecks[st.party] !== checkId) continue;
    const rec = run.records.find((r) => r.stageId === st.id);
    if (rec && !rec.submitted && !rec.skipped) return rec;
  }
  return undefined;
}

onPosEvent((e) => {
  if (!run || run.finishedAt) return;
  run.events.push({ ...e, stage: run.stageIndex });
  const st = currentStage();
  if (!st) return;
  const partyCheck = run.partyChecks[st.party];
  const onParty = 'checkId' in e && !!partyCheck && e.checkId === partyCheck;

  // A party re-seated at the same table (e.g. after an empty check was released).
  // (Only when that party's check was dropped; a closed check means a new party took the table.)
  const reseated =
    (e.type === 'seat' || e.type === 'quick-serve') &&
    Object.keys(run.partyTables).find((p) => run!.partyTables[p] === e.tableId && !getState().checks[run!.partyChecks[p]]);
  if (reseated && (e.type === 'seat' || e.type === 'quick-serve')) run.partyChecks[reseated] = e.checkId;
  // Seated after pressing Next: the seat goes to the earliest party still waiting for a table.
  const isCurrentSeat = st.kind === 'seat' && ((st.takeout && e.type === 'quick-serve') || (!st.takeout && e.type === 'seat'));
  if (!reseated && !isCurrentSeat && (e.type === 'seat' || e.type === 'quick-serve')) {
    const waiting = run.scenario.stages.find(
      (s, i) => i < run!.stageIndex && s.kind === 'seat' && !!s.takeout === (e.type === 'quick-serve') && !run!.partyTables[s.party],
    );
    if (waiting) {
      run.partyTables[waiting.party] = e.tableId;
      run.partyChecks[waiting.party] = e.checkId;
      const r = run.records.find((x) => x.stageId === waiting.id);
      if (r) {
        r.seatedTable = e.tableId;
        if (e.type === 'seat') r.seatedGuests = e.guests;
      }
    }
  }

  // An Order answers the table's oldest request that was passed with Next and never sent.
  const earlier = e.type === 'submit' ? earlierUnanswered(e.checkId) : undefined;
  if (e.type === 'submit' && earlier) {
    earlier.submitted = e.items;
    earlier.kitchenPrint = e.kitchenPrint;
    earlier.submitRound = e.round;
    earlier.submitTable = e.tableId;
    notify();
    return;
  }

  switch (st.kind) {
    case 'seat':
      if (st.takeout && e.type === 'quick-serve') {
        run.partyTables[st.party] = e.tableId;
        run.partyChecks[st.party] = e.checkId;
        record().seatedTable = e.tableId;
        advance();
        return;
      }
      if (!st.takeout && e.type === 'seat') {
        run.partyTables[st.party] = e.tableId;
        run.partyChecks[st.party] = e.checkId;
        record().seatedTable = e.tableId;
        record().seatedGuests = e.guests;
        advance();
        return;
      }
      break;
    case 'order':
      if (e.type === 'add-item' && onParty) {
        run.addsThisStage += e.qty;
        if (st.interrupt && !record().interruptShown && run.addsThisStage >= st.interrupt.afterAdds) record().interruptShown = true;
      }
      if (e.type === 'submit' && onParty && !earlierUnanswered(e.checkId)) {
        // A change the guest would have made mid-order still counts as heard.
        if (st.interrupt) record().interruptShown = true;
        record().submitted = e.items;
        record().kitchenPrint = e.kitchenPrint;
        record().submitRound = e.round;
        record().submitTable = e.tableId;
        advance();
        return;
      }
      break;
    case 'void':
      if (e.type === 'void-sent' && onParty && e.posId === st.item.posId) {
        const voided = run.events
          .filter((x) => x.type === 'void-sent' && x.stage === run!.stageIndex && x.checkId === partyCheck && x.posId === st.item.posId)
          .reduce((s, x) => s + (x.type === 'void-sent' ? x.qty : 0), 0);
        if (voided >= st.item.qty) {
          advance();
          return;
        }
      }
      break;
    case 'pay':
      if (e.type === 'close-check' && onParty) {
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
