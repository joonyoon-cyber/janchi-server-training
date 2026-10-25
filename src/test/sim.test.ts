import { describe, expect, it } from 'vitest';
import { categories, GRID_COLUMNS, GRID_ROWS, mappings, posItem, posItems } from '../lib/menu';
import { checkTotals, taxCents } from '../lib/money';
import { actions, getState } from '../lib/store';
import { getRun, startScenario } from '../training/engine';
import { generateScenario } from '../training/generator';
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
  it('has the 14 categories in the original order', () => {
    expect(categories.map((c) => c.label)).toEqual([
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
