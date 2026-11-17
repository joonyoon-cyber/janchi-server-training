import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CHECKS, overview, robustZ, type CheckResult } from '../analytics/checks';
import { People } from '../analytics/people';
import { loadReport, parseDate, parseShift, personKey, type Parsed, type Punch, type Receipt } from '../analytics/reports';
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
    const what = run('discounts', p).findings.filter((f) => f.sev !== 'low').map((f) => f.what);
    expect(what).toEqual(['Discount applied twice?', 'Discount bigger than its label', 'On-duty 20% for someone else']);
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

/** A workbook with several tabs, like the weekly schedule. */
function workbook(sheets: Record<string, (string | number | null)[][]>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const names = Object.keys(sheets);
  names.forEach((n, i) => {
    const one = readXlsxFiles(xlsx(sheets[n]));
    files[`xl/worksheets/sheet${i + 1}.xml`] = one;
  });
  files['xl/workbook.xml'] = strToU8(`<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  return zipSync(files);
}
function readXlsxFiles(z: Uint8Array): Uint8Array {
  return unzipSync(z)['xl/worksheets/sheet1.xml'];
}

// Excel serial for a local date (the schedule's date cells).
const serial = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);

function week(start: [number, number, number], rows: (string | null)[][]): (string | number | null)[][] {
  const header: (string | number | null)[] = [null, 'Name'];
  const meals: (string | null)[] = [null, null];
  for (let i = 0; i < 7; i++) {
    header.push(serial(start[0], start[1], start[2] + i), null);
    meals.push('Lunch', 'Dinner');
  }
  header.push('Shifts');
  return [['WEEK TITLE'], [], header, meals, ...rows];
}

describe('shift schedule', () => {
  it('reads AM/PM-less times, close and role prefixes', () => {
    const day = new Date(2026, 10, 2);
    const t = (x: Date | null) => (x ? `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}` : 'close');
    const p = (s: string, m: 'Lunch' | 'Dinner') => {
      const r = parseShift(s, day, m)!;
      return `${t(r.start)}-${t(r.end)}${r.role ? ` ${r.role}` : ''}`;
    };
    expect(p('11:00-4:00', 'Lunch')).toBe('11:00-16:00');
    expect(p('10:30-4:00', 'Lunch')).toBe('10:30-16:00');
    expect(p('1:00-4:30', 'Lunch')).toBe('13:00-16:30');
    expect(p('4:00-9:00', 'Dinner')).toBe('16:00-21:00');
    expect(p('5:30-C', 'Dinner')).toBe('17:30-close');
    expect(p('H)5:00-9:00', 'Dinner')).toBe('17:00-21:00 Host');
    expect(parseShift('  ', day, 'Lunch')).toBeNull();
  });

  it('reads every weekly tab with its dates and roles', () => {
    const wb = workbook({
      'NOV 2 - NOV 8': week([2026, 11, 2], [
        ['Server', 'Pat', null, '4:00-9:00'],
        [null, 'Sam', '11:00-4:00', null, null, '5:30-C'],
        ['F/R\nBusser', 'Lee', null, '4:00-C'],
      ]),
      'NOV 9 - NOV 15': week([2026, 11, 9], [['Server', 'Pat', null, null, null, 'H)5:00-9:00']]),
    });
    const parsed: Parsed = {};
    const f = loadReport('Schedule.xlsx', wb, parsed);
    expect(f.kind).toBe('schedule');
    const s = parsed.schedule!;
    expect(s).toHaveLength(5);
    const pat = s.filter((x) => x.name === 'Pat');
    expect(pat.map((x) => [x.day.getDate(), x.meal, x.role, x.shiftRole])).toEqual([
      [2, 'Dinner', 'Server', 'Server'],
      [10, 'Dinner', 'Server', 'Host'],
    ]);
    expect(s.find((x) => x.name === 'Lee')!.role).toBe('Food runner / Busser');
    expect(s.find((x) => x.name === 'Sam' && x.meal === 'Dinner')!.day.getDate()).toBe(3);
  });

  it('flags clocking out well after the scheduled end', () => {
    const shift = (name: string, raw: string, d: number, meal: 'Lunch' | 'Dinner') => {
      const day = new Date(2026, 10, d);
      const x = parseShift(raw, day, meal)!;
      return { name, role: 'Server', shiftRole: 'Server', day, meal, start: x.start, end: x.end, raw, week: 'w' };
    };
    const p: Parsed = {
      schedule: [shift('Pat', '4:00-9:00', 2, 'Dinner'), shift('Pat', '5:00-C', 3, 'Dinner'), shift('Pat', '4:00-9:00', 4, 'Dinner'), shift('Pat', '4:00-9:00', 6, 'Dinner')],
      timecard: [
        punch('PAT DOE', '2026-11-02 16:00', '2026-11-02 21:05'), // fine
        punch('PAT DOE', '2026-11-03 17:00', '2026-11-03 23:10'), // 70 min past close
        punch('PAT DOE', '2026-11-05 16:00', '2026-11-05 21:00'), // not scheduled that day
      ],
    };
    const r = run('overstay', p);
    expect(r.findings.map((f) => [f.what, f.sev])).toEqual(
      expect.arrayContaining([
        ['Clocked out after the shift', 'high'],
        ['Worked an unscheduled shift', 'medium'],
        ['Scheduled, no clock-in', 'low'],
      ]),
    );
    expect(r.findings.some((f) => f.when?.getDate() === 2)).toBe(false);
  });
});

describe('employee discount policy', () => {
  const ticket = (n: number, label: string, note: string, placedAt: string, table = 'Take Out', items = [{ menu: 'BULGOGI DNR', amount: 25 }]) => {
    const base = items.reduce((s, i) => s + i.amount, 0);
    return { ticket: `20261102100${n}`, placed: d(placedAt), table, items, itemsAmount: base, name: `<<${label}%>>`, amount: (base * +label) / 100, note, placedBy: 'PAT DOE', approval: '' };
  };
  const p = (discounts: Parsed['discounts']): Parsed => ({
    discounts,
    timecard: [punch('PAT DOE', '2026-11-02 16:00', '2026-11-02 22:00'), punch('SAM ROE', '2026-11-03 11:00', '2026-11-03 15:00')],
  });
  const whats = (x: Parsed) => run('discounts', x).findings.filter((f) => f.sev !== 'low').map((f) => f.what);

  it('accepts the policy as written', () => {
    expect(whats(p([ticket(1, '10', 'PAT SELF', '2026-11-03 19:00', 'A1'), ticket(2, '10', 'SAM MOTHER', '2026-11-02 19:00', 'A2'), ticket(3, '20', 'PAT', '2026-11-02 18:00')]))).toEqual([]);
  });

  it('catches the ways it gets bent', () => {
    expect(whats(p([ticket(1, '10', 'PAT COUSIN', '2026-11-03 19:00', 'A1')]))).toEqual(['Off-duty 10% for someone not eligible']);
    expect(whats(p([ticket(2, '10', 'EMPLOYEE', '2026-11-03 19:00', 'A1')]))).toEqual(['Off-duty 10% note incomplete']);
    expect(whats(p([ticket(3, '10', 'PAT SELF', '2026-11-02 19:00', 'A1')]))).toEqual(['Off-duty 10% while on duty']);
    expect(whats(p([ticket(4, '20', 'PAT', '2026-11-03 19:00')]))).toEqual(['On-duty 20% outside a shift']);
    expect(whats(p([ticket(5, '20', 'PAT', '2026-11-02 18:00', 'Take Out', [{ menu: '(DRAFT) SAPPORO', amount: 7 }])]))).toEqual(['On-duty 20% on alcohol']);
    expect(whats(p([ticket(6, '20', 'PAT', '2026-11-02 18:00', 'C1', [{ menu: 'PREMIUM AYCE (DINNER)', amount: 116.85 }])]))).toEqual(['On-duty 20% on a guest-sized check']);
  });
});
