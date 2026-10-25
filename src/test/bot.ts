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
        actions.goto('floor');
        const table =
          st.tableId ?? allTables().find((t) => (!st.section || t.section === st.section) && !s.tableChecks[t.id])!.id;
        actions.seatTable(table, st.guests);
        break;
      }
      case 'order': {
        actions.openTable(run.partyTables[st.party]);
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
        items.forEach((i) => actions.addItem(i.posId, i.qty));
        actions.submitOrder();
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
        answerDecision(st.options.findIndex((o) => o.correct));
        break;
      case 'pay': {
        const checkId = run.partyChecks[st.party];
        actions.openTender(checkId);
        if (st.gratuityPct) {
          const sub = checkTotals(getState().checks[checkId], s.settings.taxRate).subtotal;
          actions.setGratuity(fromCents(Math.round((toCents(sub) * st.gratuityPct) / 100)));
        }
        const method = opts.payMethodOverride ?? st.method;
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
