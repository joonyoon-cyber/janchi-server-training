import { useSyncExternalStore } from 'react';
import { mappingsForPos, posItem, sectionOfTable, sections, tableCapacity, tableDef, tableLabel } from '../lib/menu';
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

/** The party a check belongs to (including the second check of a party on two W tables). */
function partyOf(checkId: string): string | undefined {
  if (!run) return undefined;
  return Object.keys(run.partyChecks).find((p) => run!.partyChecks[p] === checkId) ?? Object.keys(run.partyExtra ?? {}).find((p) => run!.partyExtra![p].includes(checkId));
}

/** Remember every check a party has had, so scoring sees both W tables. */
function own(party: string, checkId: string) {
  if (!run) return;
  run.partyAll ??= {};
  const l = (run.partyAll[party] ??= []);
  if (!l.includes(checkId)) l.push(checkId);
}

/** A two-table party with only its first table seated so far. */
const halfSeated = (s: Stage) => s.kind === 'seat' && !!s.twoTables && !!run?.partyTables[s.party] && !(run.partyExtra?.[s.party]?.length);

/** The party waiting for a table: the current seating request, or one passed with Next. */
function waitingSeat() {
  if (!run) return undefined;
  const cur = run.scenario.stages[run.stageIndex];
  if (cur?.kind === 'seat' && !cur.takeout && (!run.partyTables[cur.party] || halfSeated(cur))) return cur;
  return run.scenario.stages.find((s, i) => i < run!.stageIndex && s.kind === 'seat' && !s.takeout && (!run!.partyTables[s.party] || halfSeated(s)));
}

const isBar = (tableId: string) => /^BAR/i.test(tableId);

/** The most recent move/join request for a party, up to the current one. */
function requestFor(party: string, kind: 'move' | 'join') {
  if (!run) return undefined;
  return run.scenario.stages
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => i <= run!.stageIndex && s.kind === kind && s.party === party)
    .pop();
}

const takeoutCheck = (c: { orderType?: string } | undefined) => c?.orderType === 'takeout';

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
    const cur = run.scenario.stages[run.stageIndex];
    if ((!st || st.kind !== 'seat') && cur?.kind === 'move') {
      return {
        who: 'Host',
        text: `Don't open a new check for your bar guests. Use Move/Join to move their check from ${tableLabel(run.partyTables[cur.party] ?? 'the bar')} to the table, so the drinks they already ordered come along.`,
      };
    }
    if (!st || st.kind !== 'seat') return { who: 'Host', text: 'Nobody is waiting for a table right now.' };
    if (st.bar && !isBar(a.tableId)) return { who: 'Host', text: 'They want a drink at the bar while they wait. Seat them at one of the bar seats (BAR 1 to BAR 4).' };
    if (st.twoTables) {
      const first = run.partyTables[st.party];
      const t0 = tableDef(a.tableId);
      if (!first) {
        if (!t0?.joinWith || s.tableChecks[t0.joinWith])
          return { who: 'Host', text: `A party of ${num(st.guests)} sits across two W tables side by side: W1 and W2, W3 and W4, or W5 and W6. Please use a free pair.` };
        if (a.guests >= st.guests || a.guests > (t0.capacity ?? 4))
          return { who: 'Host', text: `Seat them as two tables, up to ${num(t0.capacity ?? 4)} at each: part of the party at ${tableLabel(a.tableId)} and the rest at ${tableLabel(t0.joinWith)}. You'll join the two checks when they pay.` };
      } else if (tableDef(first)?.joinWith !== a.tableId) {
        const partner = tableDef(first)?.joinWith;
        return { who: 'Host', text: `Seat the rest of the party at ${partner ? tableLabel(partner) : 'the table'} right next to ${tableLabel(first)}, so they sit together.` };
      }
    }
    if (st.section && sectionOfTable(a.tableId) !== st.section) {
      const name = sections.find((x) => x.id === st.section)?.label ?? st.section;
      return { who: 'Host', text: `${tableLabel(a.tableId)} isn't in your section. Please seat them in ${name}.` };
    }
    const t = tableDef(a.tableId);
    const cap = t?.capacity;
    const canJoin = !st.twoTables && !!t?.joinWith && !s.tableChecks[t.joinWith] && st.guests <= (t.joinedCapacity ?? 0);
    const here = st.twoTables ? a.guests : st.guests;
    if (cap !== undefined && here > cap && !canJoin) {
      return {
        who: 'Guest',
        text: `"There are ${num(st.guests)} of us. We won't fit at a table for ${num(cap)}."` + (t?.joinWith ? ` (${t.joinWith} is taken, so ${tableLabel(a.tableId)} can't be joined with it.)` : ''),
      };
    }
    return null;
  }
  if (a.type === 'move') {
    const party = partyOf(a.checkId);
    if (!party) return null;
    const req = requestFor(party, 'move');
    if (!req) return { who: 'Guest', text: '"We\'re happy at this table, thanks!"' };
    if (isBar(a.to)) return { who: 'Host', text: 'Move them to a table, not another bar seat.' };
    const want = (req.s as { section?: string }).section;
    if (want && sectionOfTable(a.to) !== want) {
      const name = sections.find((x) => x.id === want)?.label ?? want;
      return { who: 'Host', text: `${tableLabel(a.to)} isn't in your section. Move them to a table in ${name}.` };
    }
    const guests = s.checks[a.checkId]?.guests ?? 0;
    const cap = tableCapacity(a.to);
    if (cap !== undefined && guests > cap) return { who: 'Guest', text: `"There are ${num(guests)} of us. We won't fit at a table for ${num(cap)}."` };
    return null;
  }
  if (a.type === 'join') {
    const pf = partyOf(a.fromCheckId);
    const pt = partyOf(a.toCheckId);
    if (!pf && !pt) return null;
    if (pf !== pt) return { who: 'Guest', text: '"Excuse me, we\'re not with that table! Please keep our checks separate."' };
    if (!requestFor(pf!, 'join')) return { who: 'Guest', text: '"We\'re still ordering at both tables. Keep them separate until we\'re ready to pay, please."' };
    return null;
  }
  // Print / Tender: only once these guests have asked for the check.
  const party = partyOf(a.checkId);
  if (!party) return null;
  // Two W tables are one group: they pay on one check, after the tables are joined.
  if (run.partyExtra?.[party]?.length && !takeoutCheck(s.checks[a.checkId])) {
    const asked = requestFor(party, 'join');
    return asked
      ? { who: 'Guest', text: `"We're one group. Can you join our two tables into one check first?"` }
      : { who: 'Guest', text: '"We\'re still eating! We\'ll let you know when we\'re ready for the check."' };
  }
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
  else {
    run.records.push({ stageId: run.scenario.stages[run.stageIndex].id, startedAt: now() });
    // A discount the server already rang while entering the order (as on the POS) answers it.
    const st = run.scenario.stages[run.stageIndex];
    if (st.kind === 'discount') {
      const c = getState().checks[run.partyChecks[st.party]];
      if (c?.discount && c.discount.value > 0) {
        record().discounted = true;
        advance();
        return;
      }
    }
  }
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
    if (st.kind !== 'order' || partyOf(checkId) !== st.party) continue;
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
  const onParty = 'checkId' in e && !!partyCheck && partyOf(e.checkId) === st.party;

  // Move/Join: the check moved to another table, or two checks became one.
  if (e.type === 'move-table') {
    const party = partyOf(e.checkId);
    if (party) {
      run.partyTables[party] = e.to;
      const req = requestFor(party, 'move');
      const rec = req ? run.records.find((r) => r.stageId === req.s.id) : undefined;
      if (rec) rec.movedTo = e.to;
      if (req && req.i === run.stageIndex) {
        advance();
        return;
      }
    }
  }
  if (e.type === 'join-tables') {
    const party = partyOf(e.toCheckId);
    if (party) {
      run.partyChecks[party] = e.toCheckId;
      own(party, e.toCheckId);
      run.partyTables[party] = e.to;
      if (run.partyExtra) run.partyExtra[party] = [];
      const req = requestFor(party, 'join');
      const rec = req ? run.records.find((r) => r.stageId === req.s.id) : undefined;
      if (rec) rec.joined = true;
      if (req && req.i === run.stageIndex) {
        advance();
        return;
      }
    }
  }

  // A party re-seated at the same table (e.g. after an empty check was released).
  // (Only when that party's check was dropped; a closed check means a new party took the table.)
  const reseated =
    (e.type === 'seat' || e.type === 'quick-serve') &&
    Object.keys(run.partyTables).find((p) => run!.partyTables[p] === e.tableId && !getState().checks[run!.partyChecks[p]]);
  if (reseated && (e.type === 'seat' || e.type === 'quick-serve')) {
    run.partyChecks[reseated] = e.checkId;
    own(reseated, e.checkId);
  }
  // Seated after pressing Next: the seat goes to the earliest party still waiting for a table.
  const isCurrentSeat = st.kind === 'seat' && ((st.takeout && e.type === 'quick-serve') || (!st.takeout && e.type === 'seat'));
  if (!reseated && !isCurrentSeat && (e.type === 'seat' || e.type === 'quick-serve')) {
    const waiting = run.scenario.stages.find(
      (s, i) => i < run!.stageIndex && s.kind === 'seat' && !!s.takeout === (e.type === 'quick-serve') && (!run!.partyTables[s.party] || halfSeated(s)),
    );
    if (waiting && halfSeated(waiting) && e.type === 'seat') {
      run.partyExtra = { ...(run.partyExtra ?? {}), [waiting.party]: [e.checkId] };
      own(waiting.party, e.checkId);
      const r = run.records.find((x) => x.stageId === waiting.id);
      if (r) {
        r.seatedTables = [...(r.seatedTables ?? []), e.tableId];
        r.seatedGuests = (r.seatedGuests ?? 0) + e.guests;
      }
    } else if (waiting) {
      run.partyTables[waiting.party] = e.tableId;
      run.partyChecks[waiting.party] = e.checkId;
      own(waiting.party, e.checkId);
      const r = run.records.find((x) => x.stageId === waiting.id);
      if (r) {
        r.seatedTable = e.tableId;
        r.seatedTables = [e.tableId];
        if (e.type === 'seat') r.seatedGuests = e.guests;
      }
    }
  }

  // Something they didn't order went to the kitchen: the guests say so (fix it with Void).
  if (e.type === 'submit') {
    const party = partyOf(e.checkId);
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
    const party = partyOf(e.checkId);
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
        own(st.party, e.checkId);
        record().seatedTable = e.tableId;
        advance();
        return;
      }
      if (!st.takeout && e.type === 'seat' && st.twoTables && run.partyTables[st.party]) {
        // Second W table of the pair: the party is now seated on two checks.
        run.partyExtra = { ...(run.partyExtra ?? {}), [st.party]: [e.checkId] };
        own(st.party, e.checkId);
        record().seatedTables = [...(record().seatedTables ?? []), e.tableId];
        record().seatedGuests = (record().seatedGuests ?? 0) + e.guests;
        advance();
        return;
      }
      if (!st.takeout && e.type === 'seat') {
        run.partyTables[st.party] = e.tableId;
        run.partyChecks[st.party] = e.checkId;
        own(st.party, e.checkId);
        record().seatedTable = e.tableId;
        record().seatedTables = [e.tableId];
        record().seatedGuests = e.guests;
        if (st.twoTables) break; // wait for the second table
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
    case 'discount':
      // Judged at the end from the discount on the check, so a wrong one can still be fixed.
      if (e.type === 'discount' && onParty && e.value > 0) {
        record().discounted = true;
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
