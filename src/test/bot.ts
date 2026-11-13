// A scripted "perfect server" used by tests to play scenarios through the
// real store actions, exactly as the UI would.
import { allTables, isMeat } from '../lib/menu';
import { checkTotals, fromCents, toCents } from '../lib/money';
import { actions, getState } from '../lib/store';
import { answerChange, answerDecision, currentStage, getRun } from '../training/engine';
import { expectedForStage } from '../training/evaluate';
import type { ItemReq, Scenario } from '../training/types';

export interface BotOptions {
  /** Called for an order stage to alter what gets rung in. */
  mutateOrder?: (stageId: string, items: ItemReq[]) => ItemReq[];
  cashOverride?: number;
  payMethodOverride?: 'cash' | 'credit';
  /** Always press Order (prints a kitchen ticket) even for macarons. */
  alwaysOrder?: boolean;
  /** Pay everything by card even when the guest pays part (or a share) in cash. */
  ignoreCashPart?: boolean;
  /** Pick a wrong answer on every question. */
  wrongDecisions?: boolean;
  /** Ignore the guests' request to split the check. */
  noSplit?: boolean;
}

export function playPerfect(sc: Scenario, opts: BotOptions = {}) {
  let guard = 0;
  while (guard++ < 100) {
    const { run } = getRun();
    const st = currentStage();
    if (!run || !st) return;
    const s = getState();
    if (run.awaitingChange && st.kind === 'pay') {
      const check = s.checks[run.partyChecks[st.party]];
      const due = checkTotals(check, s.settings.taxRate).totalDue;
      answerChange(fromCents(toCents(st.cashGiven ?? 0) - toCents(due)));
      continue;
    }
    switch (st.kind) {
      case 'seat': {
        if (st.takeout) {
          actions.goto('main');
          actions.quickServe();
          break;
        }
        actions.goto('floor');
        // Smallest free table in the section that fits the party (a W pair for 5-8).
        const fitsAt = (t: ReturnType<typeof allTables>[number]) =>
          (t.capacity ?? 0) >= st.guests || (!!t.joinWith && (t.joinedCapacity ?? 0) >= st.guests && !s.tableChecks[t.joinWith]);
        const size = (t: ReturnType<typeof allTables>[number]) => ((t.capacity ?? 0) >= st.guests ? t.capacity! : t.joinedCapacity!);
        const free = allTables().filter((t) => (!st.section || t.section === st.section) && !s.tableChecks[t.id] && fitsAt(t));
        free.sort((a, b) => size(a) - size(b));
        const table = st.tableId ?? free[0].id;
        actions.seatTable(table, st.guests);
        break;
      }
      case 'order': {
        actions.openCheck(run.partyChecks[st.party]);
        let items = expectedForStage(sc, st, run.records);
        if (st.overLimit) {
          let room = 4;
          for (const r of st.overLimit.requested) {
            const n = Math.min(room, r.qty);
            if (n > 0) items.push({ posId: r.posId, qty: n });
            room -= n;
          }
        }
        if (opts.mutateOrder) items = opts.mutateOrder(st.id, items);
        items.forEach((i) => actions.addItem(i.posId, i.qty, undefined, i.price));
        if (st.kitchenPrint === false && !opts.alwaysOrder) actions.sendOrder(false);
        else actions.submitOrder();
        break;
      }
      case 'void': {
        actions.openTable(run.partyTables[st.party]);
        const check = getState().checks[run.partyChecks[st.party]];
        const line = check.lines.find((l) => l.posId === st.item.posId && l.status === 'sent')!;
        actions.voidSent(line.id, st.item.qty);
        actions.leaveOrderScreen();
        break;
      }
      case 'decision':
        answerDecision(st.options.findIndex((o) => (opts.wrongDecisions ? !o.correct : o.correct)));
        break;
      case 'pay': {
        const checkId = run.partyChecks[st.party];
        actions.openTender(checkId);
        // The 18% party-of-5+ tip is added by the POS itself; nothing to enter.
        const method = opts.payMethodOverride ?? st.method;
        if (st.split && !opts.noSplit) {
          actions.splitEvenly(st.split);
          for (let i = 0; i < st.split; i++) {
            if (i < (st.cashShares ?? 0) && !opts.ignoreCashPart) actions.pay('cash', st.cashGiven!, st.cashGiven!);
            else actions.pay('credit', 100000);
          }
          actions.leaveTender();
          break;
        }
        if (st.cashPart && !opts.ignoreCashPart) {
          actions.pay('cash', st.cashPart, st.cashPart);
          actions.pay('credit', 100000);
          actions.leaveTender();
          break;
        }
        const bal = checkTotals(getState().checks[checkId], s.settings.taxRate).balance;
        if (method === 'cash') {
          const given = opts.cashOverride ?? st.cashGiven ?? bal;
          actions.pay('cash', given, given);
        } else actions.pay('credit', bal);
        actions.leaveTender();
        break;
      }
    }
  }
  throw new Error('bot did not finish');
}

export const meatQty = (items: ItemReq[]) => items.filter((i) => isMeat(i.posId)).reduce((s, i) => s + i.qty, 0);
