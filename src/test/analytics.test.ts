import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CHECKS, overview, robustZ, type CheckResult } from '../analytics/checks';
import { People } from '../analytics/people';
import { loadReport, parseDate, personKey, type Parsed, type Punch, type Receipt } from '../analytics/reports';
import { readXlsx } from '../analytics/xlsx';

// All names and numbers below are made up.

/** A minimal .xlsx with inline strings, like the POS exports. */
function xlsx(rows: (string | number | null)[][]): Uint8Array {
  const col = (i: number) => String.fromCharCode(65 + i);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">${r
          .map((v, ci) => {
            if (v === null) return '';
            const ref = `${col(ci)}${ri + 1}`;
            return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return zipSync({ 'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`) });
}

const check = (id: string) => CHECKS.find((c) => c.id === id)!;
const run = (id: string, p: Parsed): CheckResult => check(id).run(p, new People(p));

describe('reading POS exports', () => {
  it('reads cells by reference, numbers and text', () => {
    const rows = readXlsx(xlsx([['Time Card'], ['A', null, 'C'], [1.5, 'x & y']]));
    expect(rows[0][0]).toBe('Time Card');
    expect(rows[1]).toEqual(['A', null, 'C']);
    expect(rows[2]).toEqual([1.5, 'x & y']);
  });

  it('parses the date formats the POS uses', () => {
    expect(parseDate('2026-11-01 12:13:53')?.getHours()).toBe(12);
    expect(parseDate('11/02/2026 04:03:42 PM')?.getHours()).toBe(16);
    expect(parseDate('11/02/2026 12:03:42 AM')?.getHours()).toBe(0);
    expect(parseDate('20261105')?.getDate()).toBe(5);
    const serial = parseDate(46341.5); // Excel serial date, noon
    expect(serial?.getFullYear()).toBe(2026);
    expect(serial?.getHours()).toBe(12);
  });

  it('matches names across reports', () => {
    expect(personKey('PAT Q DOE')).toBe(personKey('Pat Doe'));
    expect(personKey('SAM  R ROE')).toBe('SAM ROE');
  });

  it('recognizes a report by its title and parses the time card', () => {
    const p: Parsed = {};
    const f = loadReport(
      'Time_Card.xlsx',
      xlsx([
        ['Time Card'],
        ['Store Name', 'Employee', 'POS', 'Status', 'Date', 'Clock In', 'Edited Clock In', 'Clock Out', 'Edited Clock Out', 'Edited Note', 'T.Time', 'BrkTime', 'Paid Brk', 'RealTime', 'EditTime', 'Total Work Time'],
        ['STORE', 'PAT DOE', 'POS 10', 'Unpaid', '11/02/2026', '11/02/2026 10:00:00 AM', null, '11/02/2026 04:00:00 PM', null, null, '6 Hour 0 Minute', null, null, 6, null, 6],
      ]),
      p,
    );
    expect(f.kind).toBe('timecard');
    expect(f.rows).toBe(1);
    expect(p.timecard?.[0].emp).toBe('PAT DOE');
  });

  it('marks exports it does not need, and unknown files', () => {
    const p: Parsed = {};
    expect(loadReport('a.xlsx', xlsx([['Sales Record by Employee'], ['Employee']]), p).kind).toBe('salesByEmployee');
    const u = loadReport('b.xlsx', xlsx([['Something Else']]), p);
    expect(u.kind).toBeNull();
    expect(u.error).toBeTruthy();
  });
});

const d = (s: string) => parseDate(s)!;
const punch = (emp: string, a: string, b: string | null): Punch => ({ emp, in: d(a), out: b ? d(b) : null, rawIn: d(a), rawOut: b ? d(b) : null, edited: false, note: '', workHours: 0 });

describe('time cards', () => {
  it('finds missed clock-outs and suggests the usual time', () => {
    const p: Parsed = {
      timecard: [
        punch('PAT DOE', '2026-11-02 16:00', '2026-11-02 22:00'),
        punch('PAT DOE', '2026-11-03 16:05', '2026-11-03 22:10'),
        punch('PAT DOE', '2026-11-04 16:00', '2026-11-06 15:00'),
        punch('PAT DOE', '2026-11-07 16:00', null),
        punch('SAM ROE', '2026-11-02 10:00', '2026-11-02 10:01'),
      ],
    };
    const r = run('timecards', p);
    const high = r.findings.filter((f) => f.sev === 'high');
    expect(high.map((f) => f.what).sort()).toEqual(['Missed clock-out', 'No clock-out']);
    expect(high.find((f) => f.what === 'Missed clock-out')!.detail).toMatch(/Suggested clock-out: 10:0\d PM/);
    expect(r.findings.some((f) => f.what === 'Accidental punch')).toBe(true);
  });
});

/** A dine-in check with one line per item. */
function receipt(n: number, emp: string, o: Partial<Receipt> & { items?: [string, number, number, number?][] }): Receipt {
  const items = o.items ?? [['PREMIUM AYCE (DINNER)', 2, 38.95]];
  return {
    receipt: `2026110110${String(n).padStart(3, '0')}`,
    dt: o.dt ?? d('2026-11-01 19:00'),
    table: o.table ?? 'A1',
    persons: o.persons ?? 2,
    subtotal: o.subtotal ?? items.reduce((s, [, q, pr, u]) => s + q * (u ?? pr), 0),
    orderDiscount: 0,
    tax: 0,
    tip: o.tip ?? 14,
    total: 0,
    cash: o.cash ?? 0,
    card: o.card ?? 100,
    other: 0,
    emp,
    lines: items.map(([menu, qty, price, unit]) => ({ receipt: '', menu, qty, price, unitPrice: unit ?? price, amount: qty * (unit ?? price), emp })),
  };
}

describe('anomaly checks', () => {
  it('flags large parties entered as fewer guests (no automatic 18%)', () => {
    const p: Parsed = { sales: [receipt(1, 'PAT', { persons: 4, items: [['PREMIUM AYCE (DINNER)', 6, 38.95]], tip: 0 }), receipt(2, 'PAT', { persons: 6, items: [['PREMIUM AYCE (DINNER)', 6, 38.95]], tip: 42.07 })] };
    const r = run('gratuity', p);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].sev).toBe('high');
    expect(r.findings[0].detail).toMatch(/6 AYCE dinners but 4 guests/);
  });

  it('flags cash voids above card voids', () => {
    const p: Parsed = {
      voids: [
        { receipt: '2026092810001', dt: d('2026-09-28 14:36'), menu: 'PREMIUM AYCE (DINNER)', qty: -2, amount: -77.9, cash: -83.55, card: 0, emp: 'PAT DOE', reason: '' },
        { receipt: '2026092810002', dt: d('2026-09-28 18:00'), menu: 'COKE', qty: -1, amount: -2.75, cash: 0, card: -2.95, emp: 'PAT DOE', reason: '' },
      ],
    };
    const r = run('voids', p);
    expect(r.findings.map((f) => [f.what, f.sev])).toEqual([
      ['Cash check voided', 'high'],
      ['Card check voided', 'medium'],
    ]);
  });

  it('separates ring-in mistakes from items removed after they were served', () => {
    const c = (placed: string, cancelled: string, menu: string, amount: number) => ({ check: '2026110110001', placed: d(placed), cancelled: d(cancelled), table: 'A1', menu, qty: 1, unitPrice: amount, amount, placedBy: 'PAT DOE', canceledBy: 'PAT DOE' });
    const p: Parsed = { cancels: [c('2026-11-01 18:00', '2026-11-01 18:02', 'COKE', 2.75), c('2026-11-01 18:00', '2026-11-01 19:10', 'PREMIUM AYCE (DINNER)', 38.95)] };
    const r = run('late-cancels', p);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ sev: 'high', what: 'AYCE dinner taken off late' });
  });

  it('spots AYCE downgrades on the check', () => {
    const p: Parsed = { sales: [receipt(1, 'PAT', { items: [['ULTIMATE AYCE', 2, 68.95], ['ULTIMATE AYCE', -2, 68.95], ['PREMIUM AYCE (DINNER)', 2, 38.95]] })] };
    const r = run('late-cancels', p);
    expect(r.findings[0]).toMatchObject({ what: 'Ultimate switched to Premium', sev: 'high' });
    expect(r.findings[0].amount).toBeCloseTo(60);
  });

  it('classifies discount notes and catches oversized discounts', () => {
    const t = (ticket: string, amount: number, base: number, note: string) => ({ ticket, placed: d('2026-11-01 18:00'), table: 'Take Out', items: [{ menu: 'X', amount: base }], itemsAmount: base, name: '<<20%>>', amount, note, placedBy: 'PAT DOE', approval: '' });
    const p: Parsed = { discounts: [t('2026110110001', 4, 20, 'EMPLOYEE'), t('2026110110002', 8, 20, 'EMPLOYEE'), t('2026110110003', 12, 20, 'EMPLOYEE'), t('2026110110004', 4, 20, 'COUSIN'), t('2026110110005', 4, 20, '')] };
    const what = run('discounts', p).findings.map((f) => f.what);
    expect(what).toEqual(['Discount applied twice?', 'Discount bigger than its label', 'Discount for family/friends?', 'Discount with no reason']);
  });

  it('finds items given away by price changes and $0 lines', () => {
    const p: Parsed = {
      priceChanges: [{ dt: d('2026-10-30 16:42'), item: '(DRAFT) ASAHI', before: 7, after: 0, emp: 'PAT DOE', receipt: '2026103010081', reason: '' }],
      sales: [receipt(1, 'PAT', { items: [['BULGOGI DNR', 1, 25]] }), receipt(2, 'PAT', { items: [['BULGOGI DNR', 1, 25]] }), receipt(3, 'PAT', { items: [['BULGOGI DNR', 1, 25, 0]] })],
    };
    const r = run('free-items', p);
    expect(r.findings.map((f) => f.what).sort()).toEqual(['Item rung at $0', 'Price changed to $0']);
  });

  it('compares cash tips entered with the card tip rate', () => {
    const day = (emp: string, cash: number, card: number) => ({ day: d('2026-11-01'), emp, checks: 100, cash, card, tip: 0, total: cash + card });
    const tip = (emp: string, cash: number, card: number, i: number) => ({ emp, added: d('2026-11-01 20:00'), receipt: `20261101100${i}`, cash, card, total: cash + card });
    const p: Parsed = {
      salesByDate: [day('PAT DOE', 2000, 11500), day('SAM ROE', 2000, 11500)],
      tips: [tip('PAT DOE', 20, 1500, 1), tip('SAM ROE', 300, 1500, 2)],
      sales: [],
    };
    const r = run('tips-pool', p);
    const pat = r.rows.find((x) => x.emp === 'PAT DOE')!;
    expect(pat.values.capture).toBeCloseTo(6.67, 1);
    expect(r.findings.find((f) => f.what === 'Cash tips not entered')?.emp).toBe('PAT DOE');
  });

  it('robust z-scores point at the outlier', () => {
    const z = robustZ([1, 1.1, 0.9, 1, 5]);
    expect(z[4]!).toBeGreaterThan(3);
    expect(Math.abs(z[0]!)).toBeLessThan(1);
    expect(robustZ([1, 2, null])).toEqual([null, null, null]);
  });

  it('the overview ranks the person who is worse on several measures first', () => {
    const res: Record<string, CheckResult> = {
      voids: {
        summary: [],
        findings: [],
        metrics: [{ key: 'cashN', label: 'Cash voids', fmt: 'num', worse: 'high', help: '' }],
        rows: ['A A', 'B B', 'C C', 'D D', 'E E'].map((emp, i) => ({ emp, values: { cashN: i === 4 ? 6 : i % 2 } })),
      },
    };
    const o = overview(res);
    expect(o.people[0].emp).toBe('E E');
    expect(o.people[0].reasons[0]).toMatch(/Cash voids/i);
  });
});
