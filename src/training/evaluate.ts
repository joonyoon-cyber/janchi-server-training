import { isAycePackage, isMeat, posItem, sectionOfTable, sections, tableLabel } from '../lib/menu';
import { checkTotals, fmt, fromCents, taxCents, toCents } from '../lib/money';
import type { PosState } from '../lib/store';
import type { Check } from '../lib/types';
import type { ItemReq, OrderStage, PayStage, RunState, Scenario, StagedEvent, Stage, StageRecord } from './types';

export interface CategoryScore {
  name: string;
  earned: number;
  possible: number;
}

export interface Evaluation {
  score: number;
  categories: CategoryScore[];
  correct: string[];
  incorrect: string[];
  missing: string[];
  wrongQty: string[];
  ayceViolations: string[];
  paymentMistakes: string[];
  decisionFeedback: string[];
  durationSec: number;
  targetSeconds: number;
  suggestions: string[];
}

const WEIGHTS = {
  table: 5,
  guests: 5,
  package: 15,
  items: 25,
  ayce: 10,
  submit: 10,
  mods: 10,
  payment: 10,
  closure: 5,
  decisions: 10,
  time: 5,
};

export const itemName = (posId: string) => posItem(posId).label;
const fmtReq = (r: ItemReq) => `${itemName(r.posId)} ×${r.qty}`;

function toMap(items: ItemReq[] = []) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(i.posId, (m.get(i.posId) ?? 0) + i.qty));
  return m;
}

export interface Comparison {
  correct: ItemReq[];
  wrongQty: { posId: string; expected: number; got: number }[];
  missing: ItemReq[];
  extra: ItemReq[];
}

export function compareItems(expected: ItemReq[], submitted: ItemReq[]): Comparison {
  const e = toMap(expected);
  const s = toMap(submitted);
  const out: Comparison = { correct: [], wrongQty: [], missing: [], extra: [] };
  e.forEach((qty, posId) => {
    if (qty <= 0) return;
    const got = s.get(posId) ?? 0;
    if (got === qty) out.correct.push({ posId, qty });
    else if (got === 0) out.missing.push({ posId, qty });
    else out.wrongQty.push({ posId, expected: qty, got });
  });
  s.forEach((qty, posId) => {
    if (!e.get(posId)) out.extra.push({ posId, qty });
  });
  return out;
}

const meatCount = (items: ItemReq[] = []) => items.filter((i) => isMeat(i.posId)).reduce((s, i) => s + i.qty, 0);

/** Expected items for an order stage, resolving deferred meat from an over-limit round. */
export function expectedForStage(sc: Scenario, st: OrderStage, records: StageRecord[]): ItemReq[] {
  const items = [...st.expect];
  if (st.remainderOf) {
    const prev = sc.stages.find((x) => x.id === st.remainderOf) as OrderStage | undefined;
    const prevRec = records.find((r) => r.stageId === st.remainderOf);
    if (prev?.overLimit) {
      const sent = toMap(prevRec?.submitted);
      prev.overLimit.requested.forEach((r) => {
        const rest = r.qty - Math.min(r.qty, sent.get(r.posId) ?? 0);
        if (rest > 0) items.push({ posId: r.posId, qty: rest });
      });
    }
  }
  return items;
}

/** Everything a party should end up paying for, after voids. */
export function expectedPartyItems(sc: Scenario, party: string): ItemReq[] {
  const m = new Map<string, number>();
  sc.stages.forEach((st) => {
    if (st.party !== party) return;
    if (st.kind === 'order') {
      st.expect.forEach((i) => m.set(i.posId, (m.get(i.posId) ?? 0) + i.qty));
      st.overLimit?.requested.forEach((i) => m.set(i.posId, (m.get(i.posId) ?? 0) + i.qty));
    }
    if (st.kind === 'void') m.set(st.item.posId, (m.get(st.item.posId) ?? 0) - st.item.qty);
  });
  return [...m].filter(([, q]) => q > 0).map(([posId, qty]) => ({ posId, qty }));
}

export function expectedTotals(items: ItemReq[], taxRate: number, gratuityPct = 0) {
  const sub = items.reduce((s, i) => s + toCents(posItem(i.posId).price) * i.qty, 0);
  const tax = taxCents(sub, taxRate);
  const grat = Math.round((sub * gratuityPct) / 100);
  return { subtotal: fromCents(sub), amountDue: fromCents(sub + tax), totalDue: fromCents(sub + tax + grat), gratuity: fromCents(grat) };
}

function inStage(events: StagedEvent[], stageIndex: number) {
  return events.filter((e) => e.stage === stageIndex);
}

function partyIsAyce(sc: Scenario, party: string) {
  return sc.stages.some((s) => s.party === party && s.kind === 'order' && [...s.expect, ...(s.overLimit?.requested ?? [])].some((i) => isAycePackage(i.posId)));
}

export function evaluate(run: RunState, pos: PosState): Evaluation {
  const sc = run.scenario;
  const ev: Evaluation = {
    score: 0,
    categories: [],
    correct: [],
    incorrect: [],
    missing: [],
    wrongQty: [],
    ayceViolations: [],
    paymentMistakes: [],
    decisionFeedback: [],
    durationSec: Math.round(((run.finishedAt ?? run.startedAt) - run.startedAt) / 1000),
    targetSeconds: sc.targetSeconds,
    suggestions: [],
  };
  const acc: Record<keyof typeof WEIGHTS, { e: number; p: number }> = Object.fromEntries(
    Object.keys(WEIGHTS).map((k) => [k, { e: 0, p: 0 }]),
  ) as never;
  const score = (k: keyof typeof WEIGHTS, earned: number, possible = 1) => {
    acc[k].e += earned;
    acc[k].p += possible;
  };
  const recOf = (st: Stage) => run.records.find((r) => r.stageId === st.id);
  const tableName = (party: string) => (run.partyTables[party] ? tableLabel(run.partyTables[party]) : '(not seated)');
  const checkOf = (party: string): Check | undefined => pos.checks[run.partyChecks[party]];

  for (const st of sc.stages) {
    const rec = recOf(st);
    const where = Object.keys(sc.parties).length > 1 ? ` (${tableName(st.party)})` : '';
    if (!rec || rec.skipped) {
      ev.incorrect.push(`Step skipped: "${st.say}"`);
      if (st.kind === 'seat') {
        score('table', 0);
        score('guests', 0);
      } else if (st.kind === 'order') {
        score('submit', 0);
        const exp = expectedForStage(sc, st, run.records);
        exp.forEach((i) => ev.missing.push(`${fmtReq(i)}${where}`));
        if (exp.some((i) => isAycePackage(i.posId))) score('package', 0);
        score('items', 0, exp.filter((i) => !isAycePackage(i.posId)).length || 1);
      } else if (st.kind === 'void') score('mods', 0);
      else if (st.kind === 'decision') score('decisions', 0);
      else if (st.kind === 'pay') {
        score('payment', 0);
        score('closure', 0);
      }
      continue;
    }

    switch (st.kind) {
      case 'seat': {
        const t = rec.seatedTable!;
        const okTable = st.tableId ? t === st.tableId : st.section ? sectionOfTable(t) === st.section : true;
        score('table', okTable ? 1 : 0);
        if (okTable) ev.correct.push(`Seated the party at ${tableLabel(t)}`);
        else {
          const want = st.tableId ? tableLabel(st.tableId) : sections.find((s) => s.id === st.section)?.label;
          ev.incorrect.push(`Seated at ${tableLabel(t)}, but the host asked for ${want}`);
        }
        score('guests', rec.seatedGuests === st.guests ? 1 : 0);
        if (rec.seatedGuests === st.guests) ev.correct.push(`Entered guest count ${st.guests}`);
        else ev.incorrect.push(`Entered ${rec.seatedGuests} guests; the party has ${st.guests}`);
        break;
      }
      case 'order': {
        score('submit', 1);
        ev.correct.push(`Sent the order with Order${where}`);
        const submitted = rec.submitted ?? [];
        let expected = expectedForStage(sc, st, run.records);
        let submittedForCompare = submitted;
        if (st.overLimit) {
          // Meat may be any subset of what was requested (max 4); compare non-meat exactly.
          const req = toMap(st.overLimit.requested);
          const sentMeat = submitted.filter((i) => isMeat(i.posId));
          const allowed = sentMeat.filter((i) => (req.get(i.posId) ?? 0) >= i.qty);
          const notRequested = sentMeat.filter((i) => (req.get(i.posId) ?? 0) < i.qty);
          submittedForCompare = submitted.filter((i) => !isMeat(i.posId)).concat(notRequested);
          const n = meatCount(allowed);
          if (n > 0 && meatCount(sentMeat) <= 4) {
            ev.correct.push(`Sent ${n} of the ${meatCount(st.overLimit.requested)} requested meats and held the rest for the next round`);
            score('items', 1);
          } else if (n === 0) {
            ev.missing.push(`No meat was sent for: ${st.overLimit.requested.map(fmtReq).join(', ')}`);
            score('items', 0);
          }
        }
        const cmp = compareItems(expected, submittedForCompare);
        const pk = (i: { posId: string }) => isAycePackage(i.posId);
        const pkgExpected = expected.filter(pk);
        if (pkgExpected.length) {
          const pkgOk = cmp.correct.filter(pk).length === pkgExpected.length && !cmp.extra.some(pk);
          score('package', pkgOk ? 1 : 0);
        } else if (cmp.extra.some(pk)) {
          score('package', 0);
        }
        cmp.correct.forEach((i) => {
          ev.correct.push(`${fmtReq(i)}${where}`);
          if (!pk(i)) score('items', 1);
        });
        cmp.missing.forEach((i) => {
          ev.missing.push(`${fmtReq(i)}${where}`);
          if (!pk(i)) score('items', 0);
        });
        cmp.wrongQty.forEach((w) => {
          ev.wrongQty.push(`${itemName(w.posId)}: entered ${w.got}, guest asked for ${w.expected}${where}`);
          if (!pk(w)) score('items', 0);
        });
        cmp.extra.forEach((i) => {
          ev.incorrect.push(`Not requested: ${fmtReq(i)}${where}`);
          if (!pk(i)) score('items', 0);
        });
        expected = expected.filter((i) => i.qty > 0);
        if (st.interrupt) {
          const cancelled = st.interrupt.cancelled ?? [];
          const sent = toMap(submitted);
          const exp = toMap(expected);
          const ok = cancelled.every((c) => (sent.get(c.posId) ?? 0) === (exp.get(c.posId) ?? 0));
          score('mods', ok ? 1 : 0);
          if (ok) ev.correct.push(`Applied the guest's change: "${st.interrupt.say}"`);
          else ev.incorrect.push(`Did not apply the guest's change before sending: "${st.interrupt.say}"`);
        }
        if (rec.submitTable && run.partyTables[st.party] !== rec.submitTable) ev.incorrect.push('Order sent on the wrong table');
        break;
      }
      case 'void': {
        const evs = inStage(run.events, sc.stages.indexOf(st)).filter((e) => e.type === 'void-sent');
        const table = run.partyTables[st.party];
        const qty = evs.reduce((s, e) => s + (e.type === 'void-sent' && e.posId === st.item.posId && pos.checks[e.checkId]?.tableId === table ? e.qty : 0), 0);
        const ok = qty === st.item.qty;
        score('mods', ok ? 1 : 0);
        if (ok) ev.correct.push(`Voided ${fmtReq(st.item)} after it was sent`);
        else ev.incorrect.push(`Void of ${fmtReq(st.item)}: voided ${qty}`);
        break;
      }
      case 'decision': {
        const opt = st.options[rec.choice ?? -1];
        score('decisions', opt?.correct ? 1 : 0);
        if (opt?.correct) ev.correct.push(`Handled correctly: ${st.question}`);
        else ev.incorrect.push(`${st.question} — answered "${opt?.text ?? 'nothing'}"`);
        const right = st.options.find((o) => o.correct);
        ev.decisionFeedback.push(opt?.correct ? opt.feedback : `${opt?.feedback ?? ''} ${right ? `Correct: ${right.text}. ${right.feedback}` : ''}`.trim());
        break;
      }
      case 'pay':
        evalPay(st, rec);
        break;
    }
  }

  function evalPay(st: PayStage, rec: StageRecord) {
    const check = checkOf(st.party);
    const table = run.partyTables[st.party];
    const window = inStage(run.events, sc.stages.indexOf(st));
    const pays = window.filter((e) => e.type === 'payment');
    const mine = pays.filter((e) => e.type === 'payment' && e.tableId === table);
    const elsewhere = pays.filter((e) => e.type === 'payment' && e.tableId !== table);
    let ok = 1;
    let possible = 1;
    elsewhere.forEach((e) => {
      if (e.type === 'payment') ev.paymentMistakes.push(`Took a ${e.method} payment of ${fmt(e.amount)} on ${tableLabel(e.tableId)} instead of ${tableLabel(table)}`);
    });
    if (elsewhere.length) ok = 0;
    if (!mine.length) {
      ev.paymentMistakes.push(`No payment was taken on ${tableLabel(table)}`);
      ok = 0;
    }
    const wrongMethod = mine.filter((e) => e.type === 'payment' && e.method !== st.method);
    if (wrongMethod.length) {
      ev.paymentMistakes.push(`Used ${wrongMethod.map((e) => (e.type === 'payment' ? e.method : '')).join(', ')} but the guest paid by ${st.method === 'cash' ? 'cash' : 'credit card'}`);
      ok = 0;
    } else if (mine.length) ev.correct.push(`Took payment by ${st.method === 'cash' ? 'cash' : 'credit card'}`);

    if (st.method === 'cash' && st.cashGiven) {
      possible += 1;
      const first = mine.find((e) => e.type === 'payment' && e.method === 'cash');
      if (first && first.type === 'payment' && Math.abs((first.tendered ?? 0) - st.cashGiven) < 0.005) {
        ev.correct.push(`Entered cash received ${fmt(st.cashGiven)}`);
        ok += 1;
      } else if (first && first.type === 'payment') {
        ev.paymentMistakes.push(`Entered ${fmt(first.tendered ?? 0)} as cash received; the guest handed you ${fmt(st.cashGiven)}`);
      }
    }
    const exp = expectedTotals(expectedPartyItems(sc, st.party), pos.settings.taxRate, st.gratuityPct ?? 0);
    if (check) {
      const t = checkTotals(check, pos.settings.taxRate);
      possible += 1;
      if (Math.abs(t.amountDue - exp.amountDue) < 0.005) {
        ev.correct.push(`Check total ${fmt(t.amountDue)} is correct`);
        ok += 1;
      } else ev.paymentMistakes.push(`Check total was ${fmt(t.amountDue)}; it should have been ${fmt(exp.amountDue)}`);
      if (st.gratuityPct) {
        possible += 1;
        if (Math.abs(t.gratuity - exp.gratuity) < 0.015) {
          ev.correct.push(`Added ${st.gratuityPct}% gratuity (${fmt(t.gratuity)})`);
          ok += 1;
        } else ev.paymentMistakes.push(`Gratuity was ${fmt(t.gratuity)}; ${st.gratuityPct}% of the subtotal is ${fmt(exp.gratuity)}`);
      } else if (t.gratuity > 0) {
        ev.paymentMistakes.push(`Added a ${fmt(t.gratuity)} gratuity that was not required`);
      }
      if (st.askChange && st.cashGiven) {
        possible += 1;
        const expChange = fromCents(toCents(st.cashGiven) - toCents(t.totalDue));
        if (rec.changeAnswer !== undefined && Math.abs(rec.changeAnswer - expChange) < 0.005) {
          ev.correct.push(`Handed back the correct change: ${fmt(expChange)}`);
          ok += 1;
        } else ev.paymentMistakes.push(`Change handed back: ${rec.changeAnswer === undefined ? 'none' : fmt(rec.changeAnswer)}; correct change is ${fmt(expChange)}`);
      }
    }
    score('payment', ok, possible);

    const closed = window.some((e) => e.type === 'close-check' && e.tableId === table);
    score('closure', closed ? 1 : 0);
    if (closed) ev.correct.push(`Closed the check on ${tableLabel(table)}`);
    else ev.incorrect.push(`The check on ${tableLabel(table)} was not closed`);
    const unpaidCloses = window.filter((e) => e.type === 'leave-tender-unpaid').length;
    if (unpaidCloses) ev.paymentMistakes.push(`Pressed Close on the tender screen ${unpaidCloses} time(s) while a balance was still due`);
  }

  // ---- AYCE rules across the whole run ----
  for (const party of Object.keys(sc.parties)) {
    if (!partyIsAyce(sc, party)) continue;
    const table = run.partyTables[party];
    if (!table) continue;
    let galbi = 0;
    let rounds = 0;
    let violations = 0;
    for (const e of run.events) {
      if (e.type !== 'submit' || e.tableId !== table) continue;
      const n = meatCount(e.items);
      if (n > 0) rounds += 1;
      if (n > 4) {
        violations += 1;
        ev.ayceViolations.push(`Round ${e.round} on ${tableLabel(table)} sent ${n} AYCE meat items (max 4 per table per round)`);
      }
      galbi += e.items.filter((i) => i.posId === '25-galbi-only-1pc').reduce((s, i) => s + i.qty, 0);
    }
    const guests = sc.parties[party];
    if (galbi > guests) {
      violations += 1;
      ev.ayceViolations.push(`${galbi} × 25. GALBI ONLY 1PC for ${guests} guests (limit 1 per person)`);
    }
    if (rounds) score('ayce', Math.max(0, rounds - violations), rounds);
    if (rounds && !violations) ev.correct.push(`Kept every meat round at 4 items or fewer${Object.keys(sc.parties).length > 1 ? ` (${tableLabel(table)})` : ''}`);
  }

  // ---- Other actions worth flagging ----
  run.events.forEach((e) => {
    if (e.type === 'discard-unsent') ev.incorrect.push(`Pressed Close with unsent items (${e.items.map(fmtReq).join(', ')}); they were cancelled, not sent`);
  });
  const voidStages = new Set(sc.stages.filter((s) => s.kind === 'void').map((s) => (s.kind === 'void' ? s.item.posId : '')));
  run.events.forEach((e) => {
    if (e.type === 'void-sent' && !voidStages.has(e.posId)) ev.incorrect.push(`Voided an ordered item the guest did not cancel: ${itemName(e.posId)} ×${e.qty}`);
  });

  // ---- Time ----
  const ratio = ev.durationSec / Math.max(1, sc.targetSeconds);
  score('time', ratio <= 1 ? 1 : Math.max(0, (3 - ratio) / 2));

  // ---- Score ----
  const labels: Record<keyof typeof WEIGHTS, string> = {
    table: 'Table selection',
    guests: 'Guest count',
    package: 'AYCE package',
    items: 'Menu items & quantities',
    ayce: 'AYCE compliance',
    submit: 'Order submission',
    mods: 'Modifications',
    payment: 'Payment',
    closure: 'Check closure',
    decisions: 'Guest interaction',
    time: 'Completion time',
  };
  let earned = 0;
  let possible = 0;
  (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach((k) => {
    const a = acc[k];
    if (a.p === 0) return;
    const e = (WEIGHTS[k] * Math.max(0, a.e)) / a.p;
    ev.categories.push({ name: labels[k], earned: Math.round(e * 10) / 10, possible: WEIGHTS[k] });
    earned += e;
    possible += WEIGHTS[k];
  });
  // Mistakes outside the scored categories (unsent items discarded, stray voids) cost 2 points each.
  const stray = run.events.filter((e) => e.type === 'discard-unsent' || (e.type === 'void-sent' && !voidStages.has(e.posId))).length;
  ev.score = possible ? Math.max(0, Math.round((earned / possible) * 100) - stray * 2) : 0;

  // ---- Suggestions ----
  const s = ev.suggestions;
  if (ev.ayceViolations.length) s.push('AYCE allows a maximum of 4 meat items per table per round. Ring in 4, tell the guests the rest will come with the next round, and send the remainder later.');
  if (ev.missing.length) s.push('Repeat the order back to the guests and check Order Details against it before pressing Order.');
  if (ev.wrongQty.length) s.push('Watch quantities: tap the line in Order Details and use − / + or Qty to fix them before sending.');
  if (acc.package.p && acc.package.e < acc.package.p) s.push('Check the AYCE PRICE button: the package (Premium lunch vs dinner, Ultimate, children) and the quantity should match the number of guests.');
  if (ev.incorrect.some((x) => x.startsWith('Seated'))) s.push("Seat guests in the section the host assigns; switch sections with the tabs at the top of the Dine-in screen.");
  if (ev.paymentMistakes.length) s.push('On the tender screen, confirm the table name in the header, choose the guest’s payment method, and type the exact cash amount handed to you so the change is right.');
  if (ev.incorrect.some((x) => x.includes('unsent items'))) s.push('Close on the order screen cancels anything not yet ordered. Always press Order to send.');
  if (ratio > 1) s.push('Speed comes from knowing where buttons are. Use Practice Mode to memorize the AYCE MEAT and BEVERAGE grids.');
  if (!s.length) s.push('Great work. Try a harder level or a randomized scenario.');
  return ev;
}
