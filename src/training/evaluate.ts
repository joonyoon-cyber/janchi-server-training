import { isAycePackage, isMeat, posItem, sectionOfTable, sections, tableCapacity, tableDef, tableLabel } from '../lib/menu';
import { AUTO_TIP_MIN_GUESTS, AUTO_TIP_PERCENT, checkTotals, fmt, fromCents, taxCents, toCents } from '../lib/money';
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
  const prices = new Map<string, number>();
  sc.stages.forEach((st) => {
    if (st.party === party && st.kind === 'order') st.expect.forEach((i) => i.price !== undefined && prices.set(i.posId, i.price));
  });
  sc.stages.forEach((st) => {
    if (st.party !== party) return;
    if (st.kind === 'order') {
      st.expect.forEach((i) => m.set(i.posId, (m.get(i.posId) ?? 0) + i.qty));
      st.overLimit?.requested.forEach((i) => m.set(i.posId, (m.get(i.posId) ?? 0) + i.qty));
    }
    if (st.kind === 'void') m.set(st.item.posId, (m.get(st.item.posId) ?? 0) - st.item.qty);
  });
  return [...m].filter(([, q]) => q > 0).map(([posId, qty]) => (prices.has(posId) ? { posId, qty, price: prices.get(posId) } : { posId, qty }));
}

export function expectedTotals(items: ItemReq[], taxRate: number, gratuityPct = 0) {
  const price = (i: ItemReq) => toCents(i.price ?? posItem(i.posId).price) * i.qty;
  const sub = items.reduce((s, i) => s + price(i), 0);
  const tax = taxCents(items.filter((i) => !posItem(i.posId).taxExempt).reduce((s, i) => s + price(i), 0), taxRate);
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
  const stageIdx = (st: Stage) => sc.stages.indexOf(st);
  // Orders sent after Next was pressed still count: each request takes the first
  // later Order on its table that no other request has claimed.
  const claimed = new Set(run.records.filter((x) => x.submitRound !== undefined && x.submitTable).map((x) => `${x.submitTable}#${x.submitRound}`));
  function lateSubmit(st: Stage) {
    const table = run.partyTables[st.party];
    const check = run.partyChecks[st.party];
    if (!table || !check) return undefined;
    const e = run.events.find((x) => x.type === 'submit' && x.checkId === check && x.stage >= stageIdx(st) && !claimed.has(`${table}#${x.round}`));
    if (!e || e.type !== 'submit') return undefined;
    claimed.add(`${table}#${e.round}`);
    return e;
  }
  // Events on this party's table from when the request was made until the end.
  const fromStage = (st: Stage) => run.events.filter((e) => e.stage >= stageIdx(st));

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
        const t = rec.seatedTable;
        if (!t) {
          score('table', 0);
          if (!st.takeout) score('guests', 0);
          ev.incorrect.push(st.takeout ? 'Never started the Quick Serve order' : `Never seated the party of ${st.guests}`);
          break;
        }
        if (st.takeout) {
          score('table', 1);
          ev.correct.push('Started a Quick Serve (takeout) order');
          break;
        }
        const okSection = st.tableId ? t === st.tableId : st.section ? sectionOfTable(t) === st.section : true;
        // Table size: A, B, Y3-5 seat 4; C, M, Y1-2 seat 6; W tables 4, or 8 when joined with their pair.
        const joined = (checkOf(st.party)?.joinedTables?.length ?? 0) > 1;
        const cap = tableCapacity(t, joined);
        const fits = cap === undefined || st.guests <= cap;
        const place = joined ? checkOf(st.party)!.joinedTables!.join('&') : tableLabel(t);
        score('table', okSection && fits ? 1 : 0);
        if (okSection && fits) ev.correct.push(`Seated the party of ${st.guests} at ${place}`);
        if (!okSection) {
          const want = st.tableId ? tableLabel(st.tableId) : sections.find((s) => s.id === st.section)?.label;
          ev.incorrect.push(`Seated at ${tableLabel(t)}, but the host asked for ${want}`);
        }
        if (!fits) {
          const w = tableDef(t)?.joinWith;
          ev.incorrect.push(
            `Seated ${st.guests} guests at ${place}, which seats ${cap}` +
              (w && st.guests <= 8 ? ` (a W table seats 8 only when joined with ${w}, and ${w} was taken)` : ''),
          );
        }
        score('guests', rec.seatedGuests === st.guests ? 1 : 0);
        if (rec.seatedGuests === st.guests) ev.correct.push(`Entered guest count ${st.guests}`);
        else ev.incorrect.push(`Entered ${rec.seatedGuests} guests; the party has ${st.guests}`);
        break;
      }
      case 'order': {
        const late = rec.submitted ? undefined : lateSubmit(st);
        if (!rec.submitted && !late) {
          score('submit', 0);
          const exp = expectedForStage(sc, st, run.records);
          ev.incorrect.push(`Not sent: "${st.say}"`);
          exp.forEach((i) => ev.missing.push(`${fmtReq(i)}${where}`));
          if (exp.some((i) => isAycePackage(i.posId))) score('package', 0);
          score('items', 0, exp.filter((i) => !isAycePackage(i.posId)).length || 1);
          break;
        }
        if (late) {
          rec.submitted = late.items;
          rec.submitTable = late.tableId;
          rec.kitchenPrint = late.kitchenPrint;
        }
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
        if (st.kitchenPrint !== undefined && rec.kitchenPrint !== undefined) {
          const ok = rec.kitchenPrint === st.kitchenPrint;
          score('submit', ok ? 1 : 0);
          if (ok) ev.correct.push(st.kitchenPrint ? 'Printed the kitchen order' : 'Rang it straight to Tender without a kitchen ticket');
          else ev.incorrect.push(st.kitchenPrint ? 'The kitchen order was not printed' : 'Printed a kitchen ticket the kitchen does not need (macarons go straight to Tender: answer No)');
        }
        break;
      }
      case 'void': {
        const evs = fromStage(st).filter((e) => e.type === 'void-sent');
        const check = run.partyChecks[st.party];
        const qty = evs.reduce((s, e) => s + (e.type === 'void-sent' && e.posId === st.item.posId && e.checkId === check ? e.qty : 0), 0);
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
    const partyCheck = run.partyChecks[st.party];
    const later = fromStage(st).filter((e) => 'checkId' in e && e.checkId === partyCheck);
    const mine = later.filter((e) => e.type === 'payment');
    // Paying the wrong table only counts while this guest is asking for the check.
    const elsewhere = window.filter((e) => e.type === 'payment' && !Object.values(run.partyChecks).includes(e.checkId));
    let ok = 1;
    let possible = 1;
    if (st.split) {
      possible += 1;
      const split = later.find((e) => e.type === 'split' && e.ways === st.split);
      if (split && mine.length === st.split) {
        ok += 1;
        ev.correct.push(`Split the check ${st.split} ways and took ${st.split} payments`);
      } else if (!split) ev.paymentMistakes.push(`The guests wanted to split the check ${st.split} ways: use Even Amount Split`);
      else ev.paymentMistakes.push(`Took ${mine.length} payments; the check was split ${st.split} ways`);
    }
    elsewhere.forEach((e) => {
      if (e.type === 'payment') ev.paymentMistakes.push(`Took a ${e.method} payment of ${fmt(e.amount)} on ${tableLabel(e.tableId)} instead of ${tableLabel(table)}`);
    });
    if (elsewhere.length) ok = 0;
    if (!mine.length) {
      ev.paymentMistakes.push(`No payment was taken on ${tableLabel(table)}`);
      ok = 0;
    }
    // Which payment methods the guests used: all one method, part cash + card, or a split with a cash share.
    const amounts = (m: 'cash' | 'credit') => mine.flatMap((e) => (e.type === 'payment' && e.method === m ? [e.amount] : []));
    const cashPays = amounts('cash');
    const cardPays = amounts('credit');
    let methodOk: boolean;
    let want: string;
    if (st.cashPart) {
      methodOk = cashPays.length === 1 && Math.abs(cashPays[0] - st.cashPart) < 0.005 && cardPays.length >= 1;
      want = `${fmt(st.cashPart)} in cash, then the rest by credit card`;
    } else if (st.split && st.cashShares) {
      methodOk = cashPays.length === st.cashShares && cardPays.length === st.split - st.cashShares;
      want = `${st.cashShares} share in cash and ${st.split - st.cashShares} by credit card`;
    } else {
      methodOk = (st.method === 'cash' ? cardPays : cashPays).length === 0;
      want = st.method === 'cash' ? 'cash' : 'credit card';
    }
    if (mine.length && !methodOk) {
      const took = [cashPays.length ? `cash ${cashPays.map(fmt).join(' + ')}` : '', cardPays.length ? `card ${cardPays.map(fmt).join(' + ')}` : ''].filter(Boolean).join(', ');
      ev.paymentMistakes.push(`Took ${took}; the guests paid ${want}`);
      ok = 0;
    } else if (mine.length) ev.correct.push(`Took payment: ${want}`);

    if (st.cashGiven && (st.method === 'cash' || st.cashShares || st.cashPart)) {
      possible += 1;
      const first = mine.find((e) => e.type === 'payment' && e.method === 'cash');
      if (first && first.type === 'payment' && Math.abs((first.tendered ?? 0) - st.cashGiven) < 0.005) {
        ev.correct.push(`Entered cash received ${fmt(st.cashGiven)}`);
        ok += 1;
      } else if (first && first.type === 'payment') {
        ev.paymentMistakes.push(`Entered ${fmt(first.tendered ?? 0)} as cash received; the guest handed you ${fmt(st.cashGiven)}`);
      }
    }
    // The POS adds the 18% tip by itself for parties of 5+; the server must not add another.
    const tipPct = st.gratuityPct ?? (sc.parties[st.party] >= AUTO_TIP_MIN_GUESTS ? AUTO_TIP_PERCENT : 0);
    const exp = expectedTotals(expectedPartyItems(sc, st.party), pos.settings.taxRate, tipPct);
    if (check) {
      const t = checkTotals(check, pos.settings.taxRate);
      possible += 1;
      if (Math.abs(t.amountDue - exp.amountDue) < 0.005) {
        ev.correct.push(`Check total ${fmt(t.amountDue)} is correct`);
        ok += 1;
      } else ev.paymentMistakes.push(`Check total was ${fmt(t.amountDue)}; it should have been ${fmt(exp.amountDue)}`);
      if (tipPct) {
        possible += 1;
        if (Math.abs(t.gratuity - exp.gratuity) < 0.015) {
          ev.correct.push(`Party of ${sc.parties[st.party]}: ${tipPct}% gratuity (${fmt(t.gratuity)}) was included`);
          ok += 1;
        } else ev.paymentMistakes.push(`Gratuity was ${fmt(t.gratuity)}; it should be the automatic ${tipPct}% (${fmt(exp.gratuity)}). Don't add a gratuity on top of it.`);
      } else if (t.gratuity > 0) {
        ev.paymentMistakes.push(`Added a ${fmt(t.gratuity)} gratuity that was not required`);
      }
      if (st.askChange && st.cashGiven && !st.split && !st.cashPart) {
        possible += 1;
        const expChange = fromCents(toCents(st.cashGiven) - toCents(t.totalDue));
        if (rec.changeAnswer !== undefined && Math.abs(rec.changeAnswer - expChange) < 0.005) {
          ev.correct.push(`Handed back the correct change: ${fmt(expChange)}`);
          ok += 1;
        } else ev.paymentMistakes.push(`Change handed back: ${rec.changeAnswer === undefined ? 'none' : fmt(rec.changeAnswer)}; correct change is ${fmt(expChange)}`);
      }
    }
    score('payment', ok, possible);

    const closed = later.some((e) => e.type === 'close-check');
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
      if (e.type !== 'submit' || e.checkId !== run.partyChecks[party]) continue;
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
  if (!sc.noTimeScore) score('time', ratio <= 1 ? 1 : Math.max(0, (3 - ratio) / 2));

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
  if (ev.ayceViolations.length) s.push('AYCE allows a maximum of 4 meat items per table per round. If guests ask for more, explain the limit and ask them which to drop; do not hold extra meat for later.');
  if (ev.missing.length) s.push('Repeat the order back to the guests and check Order Details against it before pressing Order.');
  if (ev.wrongQty.length) s.push('Watch quantities: tap the line in Order Details and use − / + or Qty to fix them before sending.');
  if (acc.package.p && acc.package.e < acc.package.p) s.push('Check the AYCE PRICE button: the package (Premium lunch vs dinner, Ultimate, children) and the quantity should match the number of guests.');
  if (ev.incorrect.some((x) => x.startsWith('Seated'))) s.push('Seat guests in the section the host assigns, at a table big enough: A, B and Y3-Y5 seat 4; C, M, Y1 and Y2 seat 6; W1&2, W3&4 or W5&6 together seat 8.');
  if (ev.paymentMistakes.length) s.push('On the tender screen, confirm the table name in the header, choose the guest’s payment method, and type the exact cash amount handed to you so the change is right.');
  if (ev.incorrect.some((x) => x.includes('unsent items'))) s.push('Close on the order screen cancels anything not yet ordered. Always press Order to send.');
  if (ratio > 1) s.push('Speed comes from knowing where buttons are. Use Practice Mode to memorize the AYCE MEAT and BEVERAGE grids.');
  if (!s.length) s.push('Great work. Try a harder level or a randomized scenario.');
  return ev;
}
