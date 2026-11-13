import { useSyncExternalStore } from 'react';
import { mappingsForPos, posItem, sectionOfTable, sections, tableDef, tableLabel } from '../lib/menu';
import { actions, getState, now, onPosEvent, pushback, setPosGuard } from '../lib/store';
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

/** The party waiting for a table: the current seating request, or one passed with Next. */
function waitingSeat() {
  if (!run) return undefined;
  const cur = run.scenario.stages[run.stageIndex];
  if (cur?.kind === 'seat' && !cur.takeout && !run.partyTables[cur.party]) return cur;
  return run.scenario.stages.find((s, i) => i < run!.stageIndex && s.kind === 'seat' && !s.takeout && !run!.partyTables[s.party]);
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => NUM_WORDS[n] ?? String(n);
/** What a guest would call a POS item: its menu name, without the item number. */
function guestName(posId: string) {
  const m = mappingsForPos(posId)[0];
  return (m ? m.customerName : posItem(posId).label).replace(/^\d+\.\s*/, '').replace(/\s*\(.*\)$/, '').toLowerCase();
}

// Mistakes the guests or host would push back on are refused (Scenarios and Test only).
setPosGuard((a) => {
  if (!run || run.finishedAt) return null;
  const s = getState();
  if (a.type === 'seat') {
    const st = waitingSeat();
    if (!st || st.kind !== 'seat') return { who: 'Host', text: 'Nobody is waiting for a table right now.' };
    if (st.section && sectionOfTable(a.tableId) !== st.section) {
      const name = sections.find((x) => x.id === st.section)?.label ?? st.section;
      return { who: 'Host', text: `${tableLabel(a.tableId)} isn't in your section. Please seat them in ${name}.` };
    }
    const t = tableDef(a.tableId);
    const cap = t?.capacity;
    const canJoin = !!t?.joinWith && !s.tableChecks[t.joinWith] && st.guests <= (t.joinedCapacity ?? 0);
    if (cap !== undefined && st.guests > cap && !canJoin) {
      return {
        who: 'Guest',
        text: `"There are ${num(st.guests)} of us. We won't fit at a table for ${num(cap)}."` + (t?.joinWith ? ` (${t.joinWith} is taken, so ${tableLabel(a.tableId)} can't be joined with it.)` : ''),
      };
    }
    return null;
  }
  // Print / Tender: only once these guests have asked for the check.
  const party = Object.keys(run.partyChecks).find((p) => run!.partyChecks[p] === a.checkId);
  if (!party) return null;
  const c = s.checks[a.checkId];
  const takeout = c?.orderType === 'takeout';
  if (takeout && a.type === 'print') return null;
  const payIdx = run.scenario.stages.findIndex((x) => x.kind === 'pay' && x.party === party);
  if (payIdx === -1 || payIdx > run.stageIndex) {
    return {
      who: 'Guest',
      text: takeout ? '"Hold on, I\'m not done ordering yet!"' : '"We\'re still eating! We\'ll let you know when we\'re ready for the check."',
    };
  }
  // Dine-in guests look over the printed check before they pay.
  if (a.type === 'tender' && !takeout && !run.records.find((r) => r.stageId === run!.scenario.stages[payIdx].id)?.checkPrinted) {
    return { who: 'Guest', text: '"Could we see the check first, please?"' };
  }
  return null;
});

/** Non-React subscription (Test mode controller). */
export function subscribeTraining(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getRun() {
  return { run, result };
}

/** Default line for guests asking for the check. */
export const DEFAULT_ASK = 'Excuse me, could we get the check, please?';

/** A dine-in pay request whose check has not been printed yet: the guests are still waiting for it. */
export function waitingForCheck(r: RunState, st: Stage | null | undefined): boolean {
  if (!st || st.kind !== 'pay') return false;
  const t = r.partyTables[st.party];
  if (!t || t.startsWith('TO-')) return false;
  return !r.records.find((x) => x.stageId === st.id)?.checkPrinted;
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

  // Something they didn't order went to the kitchen: the guests say so (fix it with Void).
  if (e.type === 'submit') {
    const party = Object.keys(run.partyChecks).find((p) => run!.partyChecks[p] === e.checkId);
    const check = getState().checks[e.checkId];
    if (party && check) {
      const asked = new Map<string, number>();
      run.scenario.stages.forEach((s, i) => {
        if (i <= run!.stageIndex && s.party === party && s.kind === 'order') s.expect.forEach((x) => asked.set(x.posId, (asked.get(x.posId) ?? 0) + x.qty));
      });
      const onCheck = new Map<string, number>();
      check.lines.filter((l) => l.status === 'sent').forEach((l) => onCheck.set(l.posId, (onCheck.get(l.posId) ?? 0) + l.qty));
      const wrong = e.items.map((x) => x.posId).find((id) => (onCheck.get(id) ?? 0) > (asked.get(id) ?? 0));
      if (wrong) {
        const name = guestName(wrong);
        const want = asked.get(wrong) ?? 0;
        pushback({
          who: 'Guest',
          text: want ? `"Excuse me, we only asked for ${num(want)} ${name}, not ${num(onCheck.get(wrong)!)}."` : `"Excuse me, we didn't order the ${name}."`,
        });
      }
    }
  }

  // The check printed for a party that asked for it: they look it over, then pay.
  if (e.type === 'print') {
    const party = Object.keys(run.partyChecks).find((p) => run!.partyChecks[p] === e.checkId);
    const i = run.scenario.stages.findIndex((x, j) => j <= run!.stageIndex && x.kind === 'pay' && x.party === party);
    const rec = i >= 0 ? run.records.find((r) => r.stageId === run!.scenario.stages[i].id) : undefined;
    if (rec) rec.checkPrinted = true;
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
