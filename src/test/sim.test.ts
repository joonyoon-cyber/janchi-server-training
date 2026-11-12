import { describe, expect, it } from 'vitest';
import { categories, GRID_COLUMNS, GRID_ROWS, isMeat, mappings, posItem, posItems } from '../lib/menu';
import { checkTotals, taxCents } from '../lib/money';
import { actions, evenSplit, getState } from '../lib/store';
import { getRun, startScenario } from '../training/engine';
import { generateCounter, generateScenario, seededRng } from '../training/generator';
import { buildTest, testScore, TEST_TABLES } from '../training/testRecipe';
import { scenarios } from '../training/scenarios';
import type { Level, OrderStage } from '../training/types';
import { meatQty, playPerfect } from './bot';

describe('money', () => {
  it('matches the tax on the reference POS photos (7.25%)', () => {
    expect(taxCents(8490, 7.25)).toBe(616); // B2: 84.90 -> 6.16
    expect(taxCents(8980, 7.25)).toBe(651); // A4: 89.80 -> 6.51
  });
});

describe('POS menu data', () => {
  it('has the 14 categories on page 1 in the original order, CERTIFICATE on page 2', () => {
    expect(categories.filter((c) => c.page === 2).map((c) => c.label)).toEqual(['CERTIFICATE']);
    expect(categories.filter((c) => c.page === 1).map((c) => c.label)).toEqual([
      'AYCE MEAT', 'AYCE APPS', 'AYCE PRICE', 'AYCE ULTIMATE', 'COMBO', 'APPETIZER', 'LUNCH', 'DINNER',
      'SIDE ORDER', 'BEVERAGE', 'BEER', 'KOREAN WINE', 'WINE', 'DESSERT',
    ]);
  });
  it('places every button inside the 4x8 grid with no overlaps', () => {
    const seen = new Set<string>();
    for (const i of posItems) {
      expect(i.col).toBeGreaterThanOrEqual(1);
      expect(i.col).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(i.row).toBeLessThanOrEqual(GRID_ROWS);
      const k = `${i.category}:${i.page}:${i.row}:${i.col}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
  it('keeps original POS labels', () => {
    expect(posItem('15-brisket-ayce')).toMatchObject({ label: '15. BRISKET AYCE', row: 1, col: 1, number: 15 });
    expect(posItem('20-ckn-blg-ayce').label).toBe('20. CKN BLG AYCE');
    expect(posItem('premium-ayce-dinner').price).toBe(38.95);
  });
  it('maps every mapped customer item to a real POS button', () => {
    for (const m of mappings) if (m.status !== 'missing-in-pos') expect(() => posItem(m.posId!)).not.toThrow();
  });
});

describe('store', () => {
  it('keeps submitted items and appends later rounds', () => {
    actions.reset({ persist: false });
    actions.seatTable('B2', 2);
    actions.addItem('premium-ayce-dinner', 2);
    actions.addItem('draft-sapporo');
    actions.submitOrder();
    actions.openTable('B2');
    actions.addItem('15-brisket-ayce', 2);
    let c = getState().checks[getState().tableChecks.B2];
    expect(c.lines.map((l) => l.status)).toEqual(['sent', 'sent', 'new']);
    expect(checkTotals(c, 7.25).amountDue).toBe(91.06); // same as the B2 photo
    actions.leaveOrderScreen(); // unsent brisket discarded
    c = getState().checks[getState().tableChecks.B2];
    expect(c.lines).toHaveLength(2);
  });
  it('computes cash change like the A4 example', () => {
    actions.reset({ persist: false });
    actions.seatTable('A4', 2);
    actions.addItem('premium-ayce-dinner', 2);
    actions.addItem('coke', 2);
    actions.addItem('draft-sapporo', 1);
    actions.submitOrder();
    const id = getState().tableChecks.A4;
    actions.openTender(id);
    const due = checkTotals(getState().checks[id], 7.25).totalDue;
    const p = actions.pay('cash', 100, 100)!;
    expect(p.change).toBeCloseTo(100 - due, 2);
    expect(actions.leaveTender()).toBe('closed');
    expect(getState().tableChecks.A4).toBeUndefined();
  });
  it('does not close an unpaid check', () => {
    actions.reset({ persist: false });
    actions.seatTable('A1', 2);
    actions.addItem('coke');
    actions.submitOrder();
    actions.openTender(getState().tableChecks.A1);
    expect(actions.leaveTender()).toBe('unpaid');
    expect(getState().tableChecks.A1).toBeDefined();
  });
});

describe('login, quick serve and tender list', () => {
  it('logged-in employee owns new checks; numbers look like 10-001', () => {
    actions.reset({ persist: false });
    actions.login('Joon Young');
    actions.seatTable('C3', 2);
    const c = getState().checks[getState().tableChecks.C3];
    expect(c.server).toBe('Joon Young');
    expect(c.number).toBe('10-001');
  });
  it('quick serve makes a takeout check with no table, paid later from Tender', () => {
    actions.reset({ persist: false });
    actions.login('Joon Young');
    actions.quickServe();
    const id = getState().activeCheckId!;
    expect(getState().checks[id].orderType).toBe('takeout');
    actions.addItem('kfc');
    actions.submitOrder();
    expect(getState().screen).toBe('main'); // takeout goes back to the main screen
    expect(Object.keys(getState().tableChecks)).toHaveLength(0);
    actions.goto('tenderList');
    actions.openTender(id);
    actions.pay('credit', checkTotals(getState().checks[id], 7.25).balance);
    expect(actions.leaveTender()).toBe('closed');
    expect(getState().screen).toBe('main');
    expect(getState().checks[id].status).toBe('closed');
  });
  it('an empty takeout order is discarded on Close', () => {
    actions.reset({ persist: false });
    actions.quickServe();
    const id = getState().activeCheckId!;
    actions.leaveOrderScreen();
    expect(getState().checks[id]).toBeUndefined();
    expect(getState().screen).toBe('main');
  });
});

describe('tip adjustments', () => {
  it('credit payments get approval/TroutD refs and a tip can be added later', () => {
    actions.reset({ persist: false });
    actions.seatTable('C1', 2);
    actions.addItem('combo-s');
    actions.submitOrder();
    const id = getState().tableChecks.C1;
    actions.openTender(id);
    const p = actions.pay('credit', checkTotals(getState().checks[id], 7.25).balance)!;
    expect(p.approvalNo).toMatch(/^\d{5}[A-F]$/);
    expect(p.troutD).toMatch(/^\d{7}$/);
    actions.leaveTender();
    actions.adjustTip(id, p.id, 20);
    expect(getState().checks[id].payments[0].tip).toBe(20);
  });
});

describe('even amount split', () => {
  it('splits evenly, extra cents to the first shares', () => {
    expect(evenSplit(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(evenSplit(167.1, 2)).toEqual([83.55, 83.55]);
  });
  it('each payment takes the next share; mixed card and cash close the check', () => {
    actions.reset({ persist: false });
    actions.seatTable('M5', 2);
    actions.addItem('premium-ayce-dinner', 4); // 155.80 + tax 11.30 = 167.10, like the M5 photo
    actions.submitOrder();
    const id = getState().tableChecks.M5;
    actions.openTender(id);
    actions.splitEvenly(2);
    expect(getState().checks[id].splits).toEqual([83.55, 83.55]);
    expect(actions.pay('credit', 1000)!.amount).toBe(83.55); // never more than the share
    const cash = actions.pay('cash', 100, 100)!;
    expect(cash.amount).toBe(83.55);
    expect(cash.change).toBe(16.45);
    expect(getState().checks[id].splits).toEqual([0, 0]);
    expect(actions.leaveTender()).toBe('closed');
  });
});

describe('automatic 18% tip for parties of 5+', () => {
  it('matches the reference photo: 128.40 + 9.31 tax + 23.11 tip = 160.82', () => {
    actions.reset({ persist: false });
    actions.seatTable('B7', 6);
    actions.addItem('premium-ayce-dinner', 2);
    actions.addItem('beef-tongue-6oz', 2);
    actions.addItem('kfc');
    const id = getState().activeCheckId!;
    const t = checkTotals(getState().checks[id], 7.25, true);
    expect([t.subtotal, t.tax, t.gratuity, t.totalDue]).toEqual([128.4, 9.31, 23.11, 160.82]);
  });
  it('no automatic tip for 4 guests', () => {
    actions.reset({ persist: false });
    actions.seatTable('B7', 4);
    actions.addItem('premium-ayce-dinner', 4);
    expect(checkTotals(getState().checks[getState().activeCheckId!], 7.25, true).gratuity).toBe(0);
  });
  it('a split divides the tip equally (Pre Gratuity on each payment)', () => {
    actions.reset({ persist: false });
    actions.seatTable('B7', 6);
    actions.addItem('premium-ayce-dinner', 2);
    actions.addItem('beef-tongue-6oz', 2);
    actions.addItem('kfc');
    actions.submitOrder();
    const id = getState().tableChecks.B7;
    actions.openTender(id);
    actions.splitEvenly(2);
    const a = actions.pay('credit', 1000)!;
    const b = actions.pay('credit', 1000)!;
    expect([a.amount, b.amount]).toEqual([80.41, 80.41]);
    expect([a.preGratuity, b.preGratuity]).toEqual([11.56, 11.55]);
    expect(actions.leaveTender()).toBe('closed');
  });
});

describe('gift certificate', () => {
  it('open price, no tax, sent without a kitchen ticket', () => {
    actions.reset({ persist: false });
    actions.quickServe();
    actions.addItem('certificate', 1, undefined, 5);
    const id = getState().activeCheckId!;
    const t = checkTotals(getState().checks[id], 7.25, true);
    expect([t.subtotal, t.tax, t.totalDue]).toEqual([5, 0, 5]);
    actions.sendOrder(false);
    expect(getState().checks[id].lines[0].status).toBe('sent');
  });
});

describe('answers from the restaurant (11/2026)', () => {
  it('Beef Tongue 6oz and Scallop 8pcs do not count toward the 4-meat limit', () => {
    expect(isMeat('beef-tongue-6oz')).toBe(false);
    expect(isMeat('scallop-8pcs')).toBe(false);
    expect(isMeat('15-brisket-ayce')).toBe(true);
  });
  it('soju slushies and +7oz Coronita are on page 2 of KOREAN WINE (14 + 3 = 17)', () => {
    expect(posItem('mango-soju-slushie')).toMatchObject({ category: 'korean-wine', page: 2, row: 1, col: 1, price: 14 });
    expect(posItem('7oz-coronita')).toMatchObject({ page: 2, col: 3, price: 3 });
  });
});

describe('hand-written scenarios', () => {
  for (const sc of scenarios) {
    it(`perfect play scores 100: ${sc.id}`, () => {
      startScenario(sc);
      playPerfect(sc);
      const { result } = getRun();
      expect(result, 'scenario should finish').toBeTruthy();
      expect({ score: result!.score, wrong: [...result!.incorrect, ...result!.missing, ...result!.wrongQty, ...result!.paymentMistakes, ...result!.ayceViolations] }).toEqual({ score: 100, wrong: [] });
    });
  }

  it('MVP: sending 5 meats in one round is an AYCE violation', () => {
    const sc = scenarios.find((s) => s.id === 'mvp-premium-dinner')!;
    startScenario(sc);
    playPerfect(sc, { mutateOrder: (id, items) => (id === 'r1' ? [...items, { posId: '16-ribeye-ayce', qty: 1 }] : items) });
    const { result } = getRun();
    expect(result!.ayceViolations.length).toBe(1);
    expect(result!.incorrect.some((x) => x.includes('16. RIBEYE AYCE'))).toBe(true);
    expect(result!.score).toBeLessThan(100);
  });

  it('MVP: wrong quantity and wrong payment method are reported', () => {
    const sc = scenarios.find((s) => s.id === 'mvp-premium-dinner')!;
    startScenario(sc);
    playPerfect(sc, {
      payMethodOverride: 'cash',
      mutateOrder: (id, items) => (id === 'r2' ? items.map((i) => (i.posId === '15-brisket-ayce' ? { ...i, qty: 3 } : i)) : items),
    });
    const { result } = getRun();
    expect(result!.wrongQty[0]).toContain('15. BRISKET AYCE: entered 3, guest asked for 2');
    expect(result!.paymentMistakes.some((m) => m.includes('credit card'))).toBe(true);
  });

  it('cash entered wrong is flagged', () => {
    const sc = scenarios.find((s) => s.id === 'a-la-carte-dinner')!;
    startScenario(sc);
    playPerfect(sc, { cashOverride: 60 });
    expect(getRun().result!.paymentMistakes.some((m) => m.includes('guest handed you 100.00'))).toBe(true);
  });
});

describe('scenario generator', () => {
  const levels: Level[] = ['beginner', 'intermediate', 'advanced'];
  for (const level of levels) {
    it(`${level}: 150 random scenarios are valid and perfect play scores 100`, () => {
      for (let i = 0; i < 150; i++) {
        const sc = generateScenario(level);
        for (const st of sc.stages) {
          if (st.kind !== 'order') continue;
          st.expect.forEach((x) => expect(() => posItem(x.posId)).not.toThrow());
          if (!(st as OrderStage).overLimit) expect(meatQty(st.expect)).toBeLessThanOrEqual(4);
        }
        startScenario(sc);
        playPerfect(sc);
        const r = getRun().result!;
        if (r.score !== 100) throw new Error(`${JSON.stringify(sc, null, 1)}\n${JSON.stringify(r, null, 1)}`);
      }
    });
  }
});

describe('test mode recipe', () => {
  it('builds 20 tables, the same for the same seed, different order for another seed', () => {
    const a = buildTest(12345).map((s) => s.title + JSON.stringify(s.stages));
    const b = buildTest(12345).map((s) => s.title + JSON.stringify(s.stages));
    expect(a).toHaveLength(TEST_TABLES);
    expect(a).toEqual(b);
    expect(buildTest(999).map((s) => s.title)).not.toEqual(buildTest(12345).map((s) => s.title));
  });
  for (const seed of [1, 2, 3, 42, 777, 2026, 31337, 99999]) {
    it(`perfect play scores 100 on every table (seed ${seed})`, () => {
      for (const sc of buildTest(seed)) {
        startScenario(sc);
        playPerfect(sc);
        const r = getRun().result!;
        if (r.score !== 100) throw new Error(`${sc.title}\n${JSON.stringify(sc, null, 1)}\n${JSON.stringify(r, null, 1)}`);
        expect(r.categories.some((c) => c.name === 'Completion time')).toBe(false);
      }
    });
  }
  it('flags a kitchen ticket for macarons and an ignored split', () => {
    const mac = generateCounter('macaron', { rng: seededRng(5) });
    startScenario(mac);
    playPerfect(mac, { alwaysOrder: true });
    expect(getRun().result!.incorrect.some((x) => x.includes('kitchen ticket'))).toBe(true);
    const split = generateScenario('intermediate', { rng: seededRng(8), alaCarte: true, guests: 2, pay: 'split' });
    startScenario(split);
    playPerfect(split, { noSplit: true });
    expect(getRun().result!.paymentMistakes.some((x) => x.includes('Even Amount Split'))).toBe(true);
  });
  it('test score is the rounded average', () => {
    expect(testScore([100, 90, 95])).toBe(95);
    expect(testScore([100, 99])).toBe(100);
  });
});
