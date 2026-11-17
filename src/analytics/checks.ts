import { People, endOfDay, isGeneric, startOfDay } from './people';
import { dayKey, type Kind, type Parsed, type Punch, type Receipt } from './reports';

// ---- Result shapes --------------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  sev: Severity;
  /** Person key (People.key). */
  emp: string;
  when: Date | null;
  /** Short label, e.g. "Missed clock-out". */
  what: string;
  /** One line a manager can act on. */
  detail: string;
  amount?: number;
  ref?: string;
}

export interface Metric {
  key: string;
  label: string;
  fmt: 'pct' | 'num' | 'money' | 'pts';
  /** Direction that looks bad. Metrics with a direction count toward "Who stands out". */
  worse?: 'high' | 'low';
  help: string;
}

export interface EmpRow {
  emp: string;
  values: Record<string, number | null>;
}

export interface CheckResult {
  /** Plain sentences shown above the tables. */
  summary: string[];
  metrics: Metric[];
  rows: EmpRow[];
  findings: Finding[];
  /** Columns for the findings table beyond the defaults. */
  period?: string;
}

export interface Check {
  id: string;
  group: 'Time cards' | 'Tips' | 'Free food and discounts' | 'Voids and logins';
  title: string;
  /** What this looks for, in one or two sentences. */
  question: string;
  /** How the numbers are worked out. */
  how: string;
  needs: Kind[];
  run: (p: Parsed, people: People) => CheckResult;
}

// ---- Helpers --------------------------------------------------------------------------

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n)}%`;
const fmtDay = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtWhen = (d: Date) => `${fmtDay(d)} ${fmtTime(d)}`;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const per100 = (n: number, checks: number | null) => (checks && checks >= 20 ? (n / checks) * 100 : null);

function span(ds: Date[]): [Date | null, Date | null] {
  if (!ds.length) return [null, null];
  let a = ds[0];
  let b = ds[0];
  for (const d of ds) {
    if (d < a) a = d;
    if (d > b) b = d;
  }
  return [a, b];
}
const periodText = (a: Date | null, b: Date | null) => (a && b ? `${fmtDay(a)} – ${fmtDay(b)}, ${b.getFullYear()}` : '');

/** AYCE package lines (per-person prices), e.g. PREMIUM AYCE (DINNER), PREMIUM 5-8, ULTIMATE W/ SODA. */
export const isPackage = (menu: string) => /^(PREMIUM|ULTIMATE)( AYCE|\s+\d+\s*-\s*\d+| W\/)/i.test(menu.trim());
const isDineIn = (r: Receipt) => !/take\s*out|to\s*go|delivery/i.test(r.table) && r.table !== '';
const tipPct = (r: Receipt) => (r.subtotal > 0 ? (r.tip / r.subtotal) * 100 : null);

// ---- 1. Time cards -------------------------------------------------------------------

const hoursOf = (p: Punch) => (p.out ? (+p.out - +p.in) / 3600000 : null);
const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

const timecards: Check = {
  id: 'timecards',
  group: 'Time cards',
  title: 'Missed clock-outs',
  question: 'Shifts with no clock-out, or a clock-out the next day or days later, so you can correct them. Also very long shifts, accidental punches, overlaps and edits.',
  how: 'A shift over 14 hours, or one that ends on a later date than it starts, is treated as a missed clock-out. The suggested clock-out is that person\'s usual clock-out time for shifts starting around the same time.',
  needs: ['timecard'],
  run(p, people) {
    const punches = p.timecard ?? [];
    const findings: Finding[] = [];
    const byEmp = new Map<string, Punch[]>();
    punches.forEach((x) => {
      const k = people.key(x.emp);
      if (!byEmp.has(k)) byEmp.set(k, []);
      byEmp.get(k)!.push(x);
    });
    const rows: EmpRow[] = [];
    for (const [k, list] of byEmp) {
      list.sort((a, b) => +a.in - +b.in);
      const normal = list.filter((x) => {
        const h = hoursOf(x);
        return h !== null && h >= 0.25 && h <= 14 && x.out!.getDate() === x.in.getDate();
      });
      const suggest = (x: Punch) => {
        const near = normal.filter((n) => Math.abs(minutesOfDay(n.in) - minutesOfDay(x.in)) <= 120);
        const m = median((near.length ? near : normal).map((n) => minutesOfDay(n.out!)));
        if (m === null || m <= minutesOfDay(x.in)) return null;
        const d = new Date(x.in);
        d.setHours(Math.floor(m / 60), Math.round(m % 60), 0, 0);
        return d;
      };
      let missed = 0;
      let edits = 0;
      let hours = 0;
      list.forEach((x, i) => {
        const h = hoursOf(x);
        if (h !== null && h <= 14) hours += h;
        if (x.edited) edits++;
        if (!x.out) {
          missed++;
          const s = suggest(x);
          findings.push({ sev: 'high', emp: k, when: x.in, what: 'No clock-out', detail: `Clocked in ${fmtWhen(x.in)} and never clocked out.${s ? ` Usual clock-out for this shift: about ${fmtTime(s)}.` : ''}` });
        } else if (h !== null && (h > 14 || x.out.getDate() !== x.in.getDate() || x.out.getMonth() !== x.in.getMonth())) {
          missed++;
          const s = suggest(x);
          findings.push({
            sev: 'high',
            emp: k,
            when: x.in,
            what: 'Missed clock-out',
            detail: `In ${fmtWhen(x.in)}, out ${fmtWhen(x.out)} (${h.toFixed(1)} hours).${s ? ` Suggested clock-out: ${fmtTime(s)} on ${fmtDay(x.in)}.` : ' Check the schedule for the real end time.'}${
              x.in.getHours() >= 20 ? ' The clock-in is near closing time: they may be pressing Clock In when they leave.' : ''
            }`,
            amount: h,
          });
        } else if (h !== null && h > 12) {
          findings.push({ sev: 'medium', emp: k, when: x.in, what: 'Very long shift', detail: `In ${fmtWhen(x.in)}, out ${fmtTime(x.out)} (${h.toFixed(1)} hours). Correct if it wasn't a double.`, amount: h });
        } else if (h !== null && h < 5 / 60) {
          findings.push({ sev: 'low', emp: k, when: x.in, what: 'Accidental punch', detail: `In and out within ${Math.max(1, Math.round(h * 60))} minute(s) at ${fmtWhen(x.in)}. Probably safe to delete.` });
        }
        const prev = list[i - 1];
        if (prev?.out && prev.out > x.in && hoursOf(prev)! <= 14) {
          findings.push({ sev: 'medium', emp: k, when: x.in, what: 'Overlapping shifts', detail: `A shift starting ${fmtWhen(x.in)} begins before the previous one ends (${fmtWhen(prev.out)}).` });
        }
        if (x.edited) {
          const parts = [];
          if (x.rawIn && +x.rawIn !== +x.in) parts.push(`in ${fmtTime(x.rawIn)} → ${fmtTime(x.in)}`);
          if (x.rawOut && x.out && +x.rawOut !== +x.out) parts.push(`out ${fmtTime(x.rawOut)} → ${fmtTime(x.out)}`);
          findings.push({ sev: 'low', emp: k, when: x.in, what: 'Edited punch', detail: `${fmtDay(x.in)}: ${parts.join(', ') || 'times edited'}${x.note ? ` · note: "${x.note}"` : ''}` });
        }
      });
      rows.push({ emp: k, values: { shifts: list.length, hours: Math.round(hours * 10) / 10, missed, edits } });
    }
    rows.sort((a, b) => (b.values.missed ?? 0) - (a.values.missed ?? 0) || a.emp.localeCompare(b.emp));
    const [a, b] = span(punches.map((x) => x.in));
    const missed = findings.filter((f) => f.sev === 'high').length;
    return {
      period: periodText(a, b),
      summary: [
        missed ? `${missed} shift${missed > 1 ? 's' : ''} need a clock-out correction (red below).` : 'No missed clock-outs. 🎉',
        `${punches.length} punches from ${byEmp.size} people.`,
      ],
      metrics: [
        { key: 'shifts', label: 'Shifts', fmt: 'num', help: 'Clock-ins in the period.' },
        { key: 'hours', label: 'Hours', fmt: 'num', help: 'Hours worked, not counting shifts over 14 hours.' },
        { key: 'missed', label: 'Missed clock-outs', fmt: 'num', help: 'Shifts with no clock-out, over 14 hours, or ending on a later day.' },
        { key: 'edits', label: 'Edited punches', fmt: 'num', help: 'Punches a manager changed.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 2. Tips kept out of the pool -------------------------------------------------------

const tipsPool: Check = {
  id: 'tips-pool',
  group: 'Tips',
  title: 'Tips kept out of the pool',
  question: 'With pooled tips, every tip should be entered on the POS. Cash tips that are never entered, and card checks closed with no tip (the guest may have handed over cash), can go straight into a server\'s pocket.',
  how: 'Cash tips entered ÷ cash sales is compared with the same person\'s card tip rate: if guests tip about the same either way, a big gap means cash tips are not being entered. "$0-tip checks" counts dine-in checks of $30+ closed with no tip at all (parties under 5).',
  needs: ['tips', 'salesByDate', 'sales'],
  run(p, people) {
    const tips = p.tips ?? [];
    const daily = p.salesByDate ?? [];
    const [a1, b1] = span(tips.map((t) => t.added));
    const [a2, b2] = span(daily.map((d) => d.day));
    const from = a1 && a2 ? (a1 > a2 ? a1 : a2) : null;
    const to = b1 && b2 ? (b1 < b2 ? b1 : b2) : null;
    const inRange = (d: Date) => !!from && !!to && d >= startOfDay(from) && d <= endOfDay(to);
    const servers = people.servers(from, to);
    const agg = new Map<string, { cashSales: number; cardSales: number; cashTips: number; cardTips: number }>();
    servers.forEach((k) => agg.set(k, { cashSales: 0, cardSales: 0, cashTips: 0, cardTips: 0 }));
    daily.forEach((d) => {
      const g = agg.get(people.key(d.emp));
      if (g && inRange(d.day)) {
        g.cashSales += d.cash;
        g.cardSales += d.card;
      }
    });
    tips.forEach((t) => {
      const g = agg.get(people.key(t.emp));
      if (g && inRange(t.added)) {
        g.cashTips += t.cash;
        g.cardTips += t.card;
      }
    });
    // Check level (Detailed Sales List): $0 tips on dine-in checks.
    const zero = new Map<string, { cash: number; cashZero: number; card: number; cardZero: number }>();
    const findings: Finding[] = [];
    (p.sales ?? []).forEach((r) => {
      if (!isDineIn(r) || r.subtotal < 30 || r.persons >= 5) return;
      const k = people.ofReceipt(r);
      if (!agg.has(k)) return;
      if (!zero.has(k)) zero.set(k, { cash: 0, cashZero: 0, card: 0, cardZero: 0 });
      const z = zero.get(k)!;
      const cashPaid = r.cash > 0 && r.card === 0;
      if (cashPaid) {
        z.cash++;
        if (r.tip === 0) z.cashZero++;
      } else if (r.card > 0 && r.cash === 0) {
        z.card++;
        if (r.tip === 0) {
          z.cardZero++;
          if (r.subtotal >= 80) findings.push({ sev: 'low', emp: k, when: r.dt, what: '$0 tip on card', detail: `${r.table}, ${r.persons} guests, ${money(r.subtotal)} paid by card with no tip.`, amount: r.subtotal, ref: r.receipt });
        }
      }
    });
    const rows: EmpRow[] = [];
    let missingTotal = 0;
    for (const [k, g] of agg) {
      const cardRate = g.cardSales - g.cardTips > 0 ? g.cardTips / (g.cardSales - g.cardTips) : null;
      const cashRate = g.cashSales > 0 ? g.cashTips / g.cashSales : null;
      const capture = cardRate && cashRate !== null && g.cashSales >= 1000 ? Math.min(150, (cashRate / cardRate) * 100) : null;
      const missing = cardRate !== null ? Math.max(0, g.cashSales * cardRate - g.cashTips) : null;
      if (missing) missingTotal += missing;
      const z = zero.get(k);
      rows.push({
        emp: k,
        values: {
          cashSales: g.cashSales,
          cashTips: g.cashTips,
          cardRate: cardRate !== null ? cardRate * 100 : null,
          cashRate: cashRate !== null ? cashRate * 100 : null,
          capture,
          missing,
          cashZero: z && z.cash >= 5 ? (z.cashZero / z.cash) * 100 : null,
          cardZero: z && z.card >= 20 ? (z.cardZero / z.card) * 100 : null,
        },
      });
      if (capture !== null && capture < 35 && missing && missing > 100) {
        findings.push({
          sev: capture < 20 ? 'high' : 'medium',
          emp: k,
          when: null,
          what: 'Cash tips not entered',
          detail: `Entered ${money(g.cashTips)} in cash tips on ${money(g.cashSales)} of cash sales (${(cashRate! * 100).toFixed(1)}%), but earns ${(cardRate! * 100).toFixed(1)}% on cards. About ${money(missing)} in cash tips may not have reached the pool.`,
          amount: missing,
        });
      }
    }
    rows.sort((a, b) => (a.values.capture ?? 999) - (b.values.capture ?? 999));
    const caps = rows.map((r) => r.values.capture).filter((v): v is number => v !== null);
    const teamCap = median(caps);
    return {
      period: periodText(from, to),
      summary: [
        ...(teamCap !== null && teamCap < 50
          ? [`Across the team, cash tips entered are only about ${pct(teamCap)} of what the card tip rates suggest. That points to a team-wide habit of not entering cash tips (or cash tips handled outside the POS), so start with the people at the top of the table.`]
          : []),
        `If cash tables tipped like card tables, about ${money(missingTotal)} more in cash tips would have been entered for the pool in this period.`,
        'Some of that is normal (cash guests often tip less, or leave the tip on the table for the pool). Look at who is far below everyone else.',
      ],
      metrics: [
        { key: 'cashSales', label: 'Cash sales', fmt: 'money', help: 'Cash taken in the period.' },
        { key: 'cashTips', label: 'Cash tips entered', fmt: 'money', help: 'Cash tips entered on the POS.' },
        { key: 'cashRate', label: 'Cash tip rate', fmt: 'pct', help: 'Cash tips entered ÷ cash sales.' },
        { key: 'cardRate', label: 'Card tip rate', fmt: 'pct', help: 'Card tips ÷ card sales (before tips).' },
        { key: 'capture', label: 'Cash tips vs card', fmt: 'pct', worse: 'low', help: 'Cash tip rate as a % of the card tip rate. 100% = cash guests tip as much as card guests.' },
        { key: 'missing', label: 'Possibly missing', fmt: 'money', help: 'Cash sales × card tip rate − cash tips entered.' },
        { key: 'cashZero', label: 'Cash checks with $0 tip', fmt: 'pct', worse: 'high', help: 'Dine-in checks paid fully in cash with no tip entered (5+ such checks needed).' },
        { key: 'cardZero', label: 'Card checks with $0 tip', fmt: 'pct', worse: 'high', help: 'Dine-in card checks of $30+ with no tip (parties under 5; 20+ such checks needed). Guests may have handed the server cash instead.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 3. Automatic gratuity skipped -----------------------------------------------------

const gratuity: Check = {
  id: 'gratuity',
  group: 'Tips',
  title: 'Large parties without the 18%',
  question: 'Parties of 5+ get an automatic 18% tip that goes to the pool. Entering fewer guests than are really there skips it, and the guests may then tip the server in cash directly.',
  how: 'Flags dine-in checks with 5 or more AYCE dinners but fewer than 5 guests entered, and checks with 5+ guests whose tip is under 17.5%.',
  needs: ['sales'],
  run(p, people) {
    const sales = p.sales ?? [];
    const findings: Finding[] = [];
    const count = new Map<string, { big: number; flagged: number }>();
    for (const r of sales) {
      if (!isDineIn(r)) continue;
      const pk = r.lines.filter((l) => isPackage(l.menu)).reduce((s, l) => s + l.qty, 0);
      const k = people.ofReceipt(r);
      const tp = tipPct(r);
      const big = r.persons >= 5 || pk >= 5;
      if (!big) continue;
      if (!count.has(k)) count.set(k, { big: 0, flagged: 0 });
      const c = count.get(k)!;
      c.big++;
      if (pk >= 5 && r.persons < 5) {
        c.flagged++;
        findings.push({
          sev: tp !== null && tp >= 18 ? 'medium' : 'high',
          emp: k,
          when: r.dt,
          what: 'Guest count lower than AYCE dinners',
          detail: `${r.table}: ${pk} AYCE dinners but ${r.persons} guests entered, so no automatic 18%. Tip on the check: ${money(r.tip)}${tp !== null ? ` (${pct(tp)})` : ''}.`,
          amount: r.subtotal * 0.18 - r.tip,
          ref: r.receipt,
        });
      } else if (r.persons >= 5 && tp !== null && tp < 17.5) {
        c.flagged++;
        findings.push({ sev: 'high', emp: k, when: r.dt, what: 'Automatic 18% removed', detail: `${r.table}: ${r.persons} guests, tip ${money(r.tip)} (${pct(tp)}) on ${money(r.subtotal)}.`, amount: r.subtotal * 0.18 - r.tip, ref: r.receipt });
      }
    }
    const rows: EmpRow[] = [...count.entries()]
      .filter(([k]) => !isGeneric(k))
      .map(([k, c]) => ({ emp: k, values: { big: c.big, flagged: c.flagged, rate: c.big >= 5 ? (c.flagged / c.big) * 100 : null } }))
      .sort((a, b) => (b.values.flagged ?? 0) - (a.values.flagged ?? 0));
    const [a, b] = span(sales.map((r) => r.dt));
    return {
      period: periodText(a, b),
      summary: [findings.length ? `${findings.length} large table${findings.length > 1 ? 's' : ''} skipped the automatic 18%.` : 'Every large party had the automatic 18%.'],
      metrics: [
        { key: 'big', label: 'Large tables', fmt: 'num', help: 'Dine-in checks with 5+ guests or 5+ AYCE dinners.' },
        { key: 'flagged', label: 'Without the 18%', fmt: 'num', help: 'Guest count lower than AYCE dinners, or tip under 17.5%.' },
        { key: 'rate', label: '% of large tables', fmt: 'pct', worse: 'high', help: 'Share of their large tables without the 18% (5+ large tables needed).' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 4. Items taken off after they were served ------------------------------------------

const LATE_MIN = 20;

const lateCancels: Check = {
  id: 'late-cancels',
  group: 'Free food and discounts',
  title: 'Items taken off after they were served',
  question: 'An item removed within a few minutes is usually a ring-in mistake. One removed 20+ minutes later was most likely made and eaten, which makes it free food. AYCE dinners removed late, or Ultimate switched to Premium, are the costliest.',
  how: `Counts items cancelled ${LATE_MIN}+ minutes after they were ordered, per 100 checks the person closed. Also looks for checks where an AYCE package was taken off and a cheaper one rung in.`,
  needs: ['cancels', 'salesByDate'],
  run(p, people) {
    const cancels = p.cancels ?? [];
    const findings: Finding[] = [];
    const per = new Map<string, { n: number; amt: number; mins: number[] }>();
    // One finding per check and person.
    const groups = new Map<string, { k: string; check: string; placed: Date; cancelled: Date; table: string; items: string[]; amt: number; mins: number; pkg: boolean; placedBy: string }>();
    for (const c of cancels) {
      if (!c.cancelled || c.amount <= 0) continue;
      const mins = (+c.cancelled - +c.placed) / 60000;
      if (mins < LATE_MIN) continue;
      const k = people.key(c.canceledBy);
      if (!per.has(k)) per.set(k, { n: 0, amt: 0, mins: [] });
      const g = per.get(k)!;
      g.n++;
      g.amt += c.amount;
      g.mins.push(mins);
      const gk = `${k}|${c.check}`;
      const x = groups.get(gk) ?? { k, check: c.check, placed: c.placed, cancelled: c.cancelled, table: c.table, items: [], amt: 0, mins, pkg: false, placedBy: c.placedBy };
      x.items.push(`${c.qty > 1 ? `${c.qty}× ` : ''}${c.menu}`);
      x.amt += c.amount;
      x.mins = Math.max(x.mins, mins);
      x.pkg ||= isPackage(c.menu);
      groups.set(gk, x);
    }
    for (const x of groups.values()) {
      findings.push({
        sev: x.pkg || x.amt >= 30 ? (x.mins >= 45 ? 'high' : 'medium') : 'low',
        emp: x.k,
        when: x.placed,
        what: x.pkg ? 'AYCE dinner taken off late' : 'Item taken off late',
        detail: `${x.table}: ${x.items.join(', ')} (${money(x.amt)}) removed ${Math.round(x.mins)} min after ordering${people.key(x.placedBy) !== x.k ? `; ordered by ${people.name(people.key(x.placedBy))}` : ''}.`,
        amount: x.amt,
        ref: x.check,
      });
    }
    // Downgrades seen in the Detailed Sales List: a package taken off (negative quantity) on a check.
    (p.sales ?? []).forEach((r) => {
      const neg = r.lines.filter((l) => isPackage(l.menu) && l.qty < 0);
      if (!neg.length) return;
      const added = r.lines.filter((l) => isPackage(l.menu) && l.qty > 0 && !neg.some((n) => n.menu === l.menu));
      const k = people.ofReceipt(r);
      const lost = -neg.reduce((s, l) => s + l.amount, 0) - added.reduce((s, l) => s + Math.max(0, l.amount), 0);
      if (added.length && lost > 0) {
        // Ultimate -> Premium after eating is the real concern; adult -> child price can be an age correction.
        const ultimate = neg.some((l) => /ULTIMATE/i.test(l.menu)) && !added.some((l) => /ULTIMATE/i.test(l.menu));
        findings.push({
          sev: ultimate ? 'high' : 'medium',
          emp: k,
          when: r.dt,
          what: ultimate ? 'Ultimate switched to Premium' : 'AYCE changed to a cheaper price',
          detail: `${r.table}: ${neg.map((l) => `${-l.qty}× ${l.menu}`).join(', ')} taken off and ${added.map((l) => `${l.qty}× ${l.menu}`).join(', ')} charged instead (${money(lost)} less). Tip ${money(r.tip)}${tipPct(r) !== null ? ` (${pct(tipPct(r)!)})` : ''}.${
            ultimate ? '' : ' Could be a child\'s age correction.'
          }`,
          amount: lost,
          ref: r.receipt,
        });
      }
    });
    const [a, b] = span(cancels.map((c) => c.placed));
    const servers = people.servers(a, b);
    const rows: EmpRow[] = servers.map((k) => {
      const g = per.get(k) ?? { n: 0, amt: 0, mins: [] };
      const checks = people.checks(k, a, b);
      return { emp: k, values: { checks, n: g.n, amt: g.amt, per100: per100(g.n, checks), amt100: per100(g.amt, checks), med: median(g.mins) } };
    });
    rows.sort((x, y) => (y.values.amt100 ?? 0) - (x.values.amt100 ?? 0));
    const total = [...per.values()].reduce((s, g) => s + g.amt, 0);
    return {
      period: periodText(a, b),
      summary: [`${money(total)} of food and drinks was taken off checks ${LATE_MIN}+ minutes after it was ordered.`],
      metrics: [
        { key: 'checks', label: 'Checks closed', fmt: 'num', help: 'Checks this person closed in the period.' },
        { key: 'n', label: 'Late removals', fmt: 'num', help: `Items cancelled ${LATE_MIN}+ minutes after ordering.` },
        { key: 'amt', label: 'Value', fmt: 'money', help: 'Menu value of those items.' },
        { key: 'per100', label: 'Per 100 checks', fmt: 'num', worse: 'high', help: 'Late removals per 100 checks closed.' },
        { key: 'amt100', label: '$ per 100 checks', fmt: 'money', worse: 'high', help: 'Value removed late per 100 checks closed.' },
        { key: 'med', label: 'Typical delay (min)', fmt: 'num', help: 'Median minutes between ordering and removing.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 5. Voids after payment ------------------------------------------------------------

const voids: Check = {
  id: 'voids',
  group: 'Voids and logins',
  title: 'Paid checks voided',
  question: 'A check voided after it was paid in cash is the classic way to keep the cash: the sale disappears from the POS, the money does not. Card voids refund the card, so they are lower risk, but repeated ones still deserve a look.',
  how: 'Groups the Void Detail by check. Cash voids are red; card voids are amber. Also counts voids per 100 checks closed.',
  needs: ['voids', 'salesByDate'],
  run(p, people) {
    const rows0 = p.voids ?? [];
    const byCheck = new Map<string, { k: string; dt: Date; amt: number; cash: number; card: number; items: number; reason: string }>();
    rows0.forEach((v) => {
      const x = byCheck.get(v.receipt) ?? { k: people.key(v.emp), dt: v.dt, amt: 0, cash: 0, card: 0, items: 0, reason: v.reason };
      x.amt += v.amount;
      x.cash += v.cash;
      x.card += v.card;
      x.items++;
      x.reason ||= v.reason;
      byCheck.set(v.receipt, x);
    });
    const findings: Finding[] = [];
    const per = new Map<string, { n: number; cashN: number; amt: number }>();
    const list = [...byCheck.entries()].sort((a, b) => +a[1].dt - +b[1].dt);
    list.forEach(([receipt, x], i) => {
      const g = per.get(x.k) ?? { n: 0, cashN: 0, amt: 0 };
      g.n++;
      g.amt += Math.abs(x.amt);
      const isCash = x.cash < 0;
      if (isCash) g.cashN++;
      per.set(x.k, g);
      const twin = list.find(([r2, y], j) => j !== i && y.k === x.k && Math.abs(+y.dt - +x.dt) < 15 * 60000 && Math.abs(y.amt - x.amt) < 0.01 && r2 !== receipt);
      findings.push({
        sev: isCash ? 'high' : 'medium',
        emp: x.k,
        when: x.dt,
        what: isCash ? 'Cash check voided' : 'Card check voided',
        detail: `${x.items} item${x.items > 1 ? 's' : ''}, ${money(Math.abs(x.amt))}; paid ${isCash ? `${money(-x.cash)} cash` : ''}${isCash && x.card < 0 ? ' + ' : ''}${x.card < 0 ? `${money(-x.card)} card` : ''}.${x.reason ? ` Reason: ${x.reason}.` : ' No reason given.'}${twin ? ' Another check with the same amount was voided minutes apart.' : ''}`,
        amount: Math.abs(x.amt),
        ref: receipt,
      });
    });
    const [a, b] = span(rows0.map((v) => v.dt));
    const servers = people.servers(a, b);
    const rows: EmpRow[] = servers.map((k) => {
      const g = per.get(k) ?? { n: 0, cashN: 0, amt: 0 };
      const checks = people.checks(k, a, b);
      return { emp: k, values: { checks, n: g.n, cashN: g.cashN, amt: g.amt, per100: per100(g.n, checks) } };
    });
    rows.sort((x, y) => (y.values.cashN ?? 0) - (x.values.cashN ?? 0) || (y.values.per100 ?? 0) - (x.values.per100 ?? 0));
    const cash = findings.filter((f) => f.sev === 'high');
    return {
      period: periodText(a, b),
      summary: [
        `${byCheck.size} paid checks were voided (${money(findings.reduce((s, f) => s + (f.amount ?? 0), 0))}).`,
        cash.length ? `${cash.length} of them had been paid in cash: ask what happened to that cash.` : 'None had been paid in cash.',
      ],
      metrics: [
        { key: 'checks', label: 'Checks closed', fmt: 'num', help: 'Checks this person closed in the period.' },
        { key: 'n', label: 'Voided checks', fmt: 'num', help: 'Paid checks they voided.' },
        { key: 'cashN', label: 'Cash voids', fmt: 'num', worse: 'high', help: 'Voided checks that had been paid in cash.' },
        { key: 'amt', label: 'Value', fmt: 'money', help: 'Total value voided.' },
        { key: 'per100', label: 'Per 100 checks', fmt: 'num', worse: 'high', help: 'Voided checks per 100 checks closed.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 6. Discounts -------------------------------------------------------------------------

const NOTE_KIND: [RegExp, string][] = [
  [/FAMIL|COUSIN|FRIEND|MOM|DAD|SISTER|BROTHER|WIFE|HUSBAND|GIRLFRIEND|BOYFRIEND|TIA|TIO|PRIM[OA]|AMIG/i, 'family/friends'],
  [/EMP|MPLOY|PLOYE|EMOL|WORK|WOKER|WROKER|STAFF/i, 'employee'],
  [/ANTS?\b|HAIR|BUG|COLD|LATE|WRONG|COMPLAIN|BURN|RAW|SICK|WAIT|MISTAKE|SORRY/i, 'complaint'],
  [/COUPON|PROMO|YELP|GROUPON|BIRTHDAY|BDAY|REVIEW|GOOGLE|VIP|MILITARY|POLICE|FIRE|NURSE|TEACHER|STUDENT|SENIOR/i, 'promotion'],
];
export function noteKind(note: string): string {
  if (!note.trim()) return 'no note';
  for (const [re, k] of NOTE_KIND) if (re.test(note)) return k;
  return 'other (name?)';
}

const discounts: Check = {
  id: 'discounts',
  group: 'Free food and discounts',
  title: 'Discounts',
  question: 'Discounts given without a reason, for friends and family, or bigger than the button says (a "10%" that comes out at 50%) are the easiest way to give guests free food in return for a better tip.',
  how: 'Per discount: its note is sorted into employee / family-friends / complaint / promotion / other / none, and its size is compared with the % in its name. Per person: discounts and discount dollars per 100 checks closed.',
  needs: ['discounts', 'salesByDate'],
  run(p, people) {
    const ds = p.discounts ?? [];
    const findings: Finding[] = [];
    const per = new Map<string, { n: number; amt: number; noNote: number; family: number }>();
    for (const d of ds) {
      if (d.amount <= 0) continue;
      const k = people.key(d.placedBy);
      const kind = noteKind(d.note);
      const g = per.get(k) ?? { n: 0, amt: 0, noNote: 0, family: 0 };
      g.n++;
      g.amt += d.amount;
      if (kind === 'no note') g.noNote++;
      if (kind === 'family/friends' || kind === 'other (name?)') g.family++;
      per.set(k, g);
      const label = /(\d+)\s*%/.exec(d.name)?.[1];
      const base = d.itemsAmount;
      const realPct = base > 0 ? (d.amount / base) * 100 : null;
      const where = `${d.table || 'Check'}: ${money(d.amount)} off ${money(base)}${d.name ? ` (${d.name.replace(/[<>]/g, '')})` : ''}${d.note ? `, note "${d.note}"` : ', no note'}.`;
      if (label && realPct !== null && realPct > +label + 10 && d.amount >= 5) {
        const twice = realPct <= 2 * +label + 1.5;
        findings.push({
          sev: twice ? 'medium' : 'high',
          emp: k,
          when: d.placed,
          what: twice ? 'Discount applied twice?' : 'Discount bigger than its label',
          detail: `${where} That is ${pct(realPct)}, not ${label}%.`,
          amount: d.amount,
          ref: d.ticket,
        });
      } else if (kind === 'family/friends' || kind === 'other (name?)') {
        findings.push({ sev: 'medium', emp: k, when: d.placed, what: 'Discount for family/friends?', detail: where, amount: d.amount, ref: d.ticket });
      } else if (kind === 'no note') {
        findings.push({ sev: d.amount >= 10 ? 'medium' : 'low', emp: k, when: d.placed, what: 'Discount with no reason', detail: where, amount: d.amount, ref: d.ticket });
      } else if (d.amount >= 20) {
        findings.push({ sev: 'medium', emp: k, when: d.placed, what: 'Large discount', detail: where, amount: d.amount, ref: d.ticket });
      }
    }
    const [a, b] = span(ds.map((d) => d.placed));
    const servers = people.servers(a, b);
    const rows: EmpRow[] = servers.map((k) => {
      const g = per.get(k) ?? { n: 0, amt: 0, noNote: 0, family: 0 };
      const checks = people.checks(k, a, b);
      return { emp: k, values: { checks, n: g.n, amt: g.amt, per100: per100(g.n, checks), amt100: per100(g.amt, checks), noNote: g.noNote, family: g.family } };
    });
    rows.sort((x, y) => (y.values.amt100 ?? 0) - (x.values.amt100 ?? 0));
    const total = [...per.values()].reduce((s, g) => s + g.amt, 0);
    const byKind = new Map<string, number>();
    ds.forEach((d) => d.amount > 0 && byKind.set(noteKind(d.note), (byKind.get(noteKind(d.note)) ?? 0) + d.amount));
    return {
      period: periodText(a, b),
      summary: [
        `${money(total)} in discounts. By note: ${[...byKind.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${money(v)}`).join(' · ')}.`,
      ],
      metrics: [
        { key: 'checks', label: 'Checks closed', fmt: 'num', help: 'Checks this person closed in the period.' },
        { key: 'n', label: 'Discounts', fmt: 'num', help: 'Discounted checks they rang.' },
        { key: 'amt', label: 'Value', fmt: 'money', help: 'Total discounted.' },
        { key: 'per100', label: 'Per 100 checks', fmt: 'num', worse: 'high', help: 'Discounts per 100 checks closed.' },
        { key: 'amt100', label: '$ per 100 checks', fmt: 'money', worse: 'high', help: 'Discount dollars per 100 checks closed.' },
        { key: 'noNote', label: 'No note', fmt: 'num', help: 'Discounts without a reason.' },
        { key: 'family', label: 'Family / names', fmt: 'num', help: 'Notes that mention family, friends or a name.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 7. Free or cheaper items ---------------------------------------------------------------

const freeItems: Check = {
  id: 'free-items',
  group: 'Free food and discounts',
  title: 'Free or cheaper items',
  question: 'Prices changed down on the POS (a $7 beer rung at $0), items sold below their menu price, and "employee" items rung in bulk ($1 employee drinks ×35) are ways to give things away without a discount showing.',
  how: 'Lists price changes that lowered a price, Detailed Sales List lines sold below the item\'s usual price, and employee items rung 3+ at a time. Per person: per 100 checks closed.',
  needs: ['priceChanges', 'sales'],
  run(p, people) {
    const findings: Finding[] = [];
    const per = new Map<string, { n: number; amt: number; emp: number }>();
    const bump = (k: string, amt: number, empItem = 0) => {
      const g = per.get(k) ?? { n: 0, amt: 0, emp: 0 };
      g.n++;
      g.amt += amt;
      g.emp += empItem;
      per.set(k, g);
    };
    const seen = new Set<string>();
    (p.priceChanges ?? []).forEach((c) => {
      if (!(c.after < c.before)) return;
      const k = people.key(c.emp);
      const lost = c.before - c.after;
      bump(k, lost);
      seen.add(`${c.receipt}|${c.item}`);
      findings.push({
        sev: c.after === 0 ? 'high' : 'medium',
        emp: k,
        when: c.dt,
        what: c.after === 0 ? 'Price changed to $0' : 'Price lowered',
        detail: `${c.item}: ${money(c.before)} → ${money(c.after)}${c.reason ? ` (${c.reason})` : ', no reason'}.`,
        amount: lost,
        ref: c.receipt,
      });
    });
    // Usual price per item, from the Detailed Sales List.
    const sales = p.sales ?? [];
    const prices = new Map<string, Map<number, number>>();
    sales.forEach((r) =>
      r.lines.forEach((l) => {
        if (l.qty <= 0) return;
        const m = prices.get(l.menu) ?? new Map<number, number>();
        m.set(l.unitPrice, (m.get(l.unitPrice) ?? 0) + l.qty);
        prices.set(l.menu, m);
      }),
    );
    const usual = new Map<string, number>();
    prices.forEach((m, menu) => usual.set(menu, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
    sales.forEach((r) => {
      const k = people.ofReceipt(r);
      r.lines.forEach((l) => {
        if (l.qty <= 0) return;
        const u = Math.max(usual.get(l.menu) ?? 0, l.price);
        if (/EMPLOYEE|STAFF/i.test(l.menu)) {
          if (l.qty >= 3) {
            bump(k, 0, l.qty);
            findings.push({ sev: 'medium', emp: k, when: r.dt, what: 'Employee items in bulk', detail: `${r.table}: ${l.qty}× ${l.menu} at ${money(l.unitPrice)} on one check (${money(l.amount)}, paid ${r.cash > 0 ? 'cash' : 'card'}).`, amount: l.amount, ref: r.receipt });
          }
          return;
        }
        if (u > 0 && l.unitPrice < u - 0.01 && !seen.has(`${r.receipt}|${l.menu}`) && !/CERTIFICATE|GIFT/i.test(l.menu) && !isPackage(l.menu)) {
          // Ultimate includes soft drinks: a $0 soda on an Ultimate check is expected.
          if (l.unitPrice === 0 && r.lines.some((x) => /ULTIMATE/i.test(x.menu) && x.qty > 0) && /COKE|SPRITE|TEA|SODA|LEMONADE|FANTA|PEPSI|WATER/i.test(l.menu)) return;
          const lost = (u - l.unitPrice) * l.qty;
          bump(k, lost);
          findings.push({
            sev: l.unitPrice === 0 ? 'high' : 'medium',
            emp: k,
            when: r.dt,
            what: l.unitPrice === 0 ? 'Item rung at $0' : 'Item below menu price',
            detail: `${r.table}: ${l.qty}× ${l.menu} at ${money(l.unitPrice)} (usually ${money(u)}). Tip ${money(r.tip)}${tipPct(r) !== null ? ` (${pct(tipPct(r)!)})` : ''}.`,
            amount: lost,
            ref: r.receipt,
          });
        }
      });
    });
    const dates = [...(p.priceChanges ?? []).map((c) => c.dt), ...sales.map((r) => r.dt)];
    const [a, b] = span(dates);
    const servers = people.servers(a, b);
    const rows: EmpRow[] = servers.map((k) => {
      const g = per.get(k) ?? { n: 0, amt: 0, emp: 0 };
      const checks = people.checks(k, a, b);
      return { emp: k, values: { checks, n: g.n, amt: g.amt, per100: per100(g.n, checks), emp: g.emp } };
    });
    rows.sort((x, y) => (y.values.amt ?? 0) - (x.values.amt ?? 0));
    return {
      period: periodText(a, b),
      summary: [`${findings.filter((f) => f.sev === 'high').length} items went out at $0 and ${findings.filter((f) => f.what === 'Price lowered' || f.what === 'Item below menu price').length} below their usual price.`],
      metrics: [
        { key: 'checks', label: 'Checks closed', fmt: 'num', help: 'Checks this person closed in the period.' },
        { key: 'n', label: 'Free / cheaper items', fmt: 'num', help: 'Price cuts and items sold below their usual price.' },
        { key: 'amt', label: 'Value given away', fmt: 'money', worse: 'high', help: 'Usual price minus price charged.' },
        { key: 'per100', label: 'Per 100 checks', fmt: 'num', worse: 'high', help: 'Free or cheaper items per 100 checks closed.' },
        { key: 'emp', label: 'Employee items in bulk', fmt: 'num', help: 'Employee drinks/meals rung 3+ at a time.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 8. Bigger tips when something was free --------------------------------------------------

const tipsForFreebies: Check = {
  id: 'tips-freebies',
  group: 'Free food and discounts',
  title: 'Bigger tips when something was free',
  question: 'If a server gives food away in return for tips, their checks with something free should tip noticeably more than their other checks.',
  how: 'For each server: median tip % on their dine-in checks that had something free (late removal, discount, $0 or below-price item, downgrade) vs their other dine-in checks. Needs 3+ such checks.',
  needs: ['sales', 'cancels', 'discounts'],
  run(p, people) {
    const late = new Set<string>();
    (p.cancels ?? []).forEach((c) => c.cancelled && c.amount > 0 && (+c.cancelled - +c.placed) / 60000 >= LATE_MIN && late.add(c.check));
    const disc = new Set((p.discounts ?? []).filter((d) => d.amount > 0).map((d) => d.ticket));
    const cut = new Set((p.priceChanges ?? []).filter((c) => c.after < c.before).map((c) => c.receipt));
    const per = new Map<string, { free: number[]; other: number[] }>();
    const findings: Finding[] = [];
    for (const r of p.sales ?? []) {
      if (!isDineIn(r) || r.subtotal < 20 || r.persons >= 5) continue;
      const tp = tipPct(r);
      if (tp === null) continue;
      const zeroLine = r.lines.some((l) => l.qty > 0 && l.price > 0 && l.unitPrice < l.price - 0.01 && !/EMPLOYEE/i.test(l.menu) && !(/ULTIMATE/i.test(r.lines.map((x) => x.menu).join()) && l.unitPrice === 0));
      const neg = r.lines.some((l) => isPackage(l.menu) && l.qty < 0);
      const free = late.has(r.receipt) || disc.has(r.receipt) || cut.has(r.receipt) || zeroLine || neg;
      const k = people.ofReceipt(r);
      const g = per.get(k) ?? { free: [], other: [] };
      (free ? g.free : g.other).push(tp);
      per.set(k, g);
      if (free && tp >= 25) findings.push({ sev: 'medium', emp: k, when: r.dt, what: 'Big tip on a check with something free', detail: `${r.table}: tip ${money(r.tip)} (${pct(tp)}) on ${money(r.subtotal)}.`, amount: r.tip, ref: r.receipt });
    }
    const rows: EmpRow[] = [...per.entries()]
      .filter(([k, g]) => !isGeneric(k) && g.other.length >= 20)
      .map(([k, g]) => {
        const f = median(g.free);
        const o = median(g.other);
        return { emp: k, values: { nFree: g.free.length, free: g.free.length >= 3 ? f : null, other: o, diff: g.free.length >= 3 && f !== null && o !== null ? f - o : null } };
      })
      .sort((a, b) => (b.values.diff ?? -99) - (a.values.diff ?? -99));
    rows.forEach((r) => {
      if ((r.values.diff ?? 0) >= 5) findings.unshift({ sev: (r.values.nFree ?? 0) >= 8 ? 'high' : 'medium', emp: r.emp, when: null, what: 'Tips more when something is free', detail: `Median tip ${pct(r.values.free!)} on ${r.values.nFree} checks with something free vs ${pct(r.values.other!)} on their other checks.` });
    });
    const [a, b] = span((p.sales ?? []).map((r) => r.dt));
    return {
      period: periodText(a, b),
      summary: ['A positive gap means guests tipped this server more when they got something free.'],
      metrics: [
        { key: 'nFree', label: 'Checks with something free', fmt: 'num', help: 'Dine-in checks under 5 guests with a late removal, discount, price cut, $0 item or downgrade.' },
        { key: 'free', label: 'Tip % (free)', fmt: 'pct', help: 'Median tip % on those checks.' },
        { key: 'other', label: 'Tip % (others)', fmt: 'pct', help: 'Median tip % on their other dine-in checks.' },
        { key: 'diff', label: 'Gap', fmt: 'pts', worse: 'high', help: 'Tip % on checks with something free minus the others, in points.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 9. Sales outside shifts and shared logins ------------------------------------------------

const logins: Check = {
  id: 'logins',
  group: 'Voids and logins',
  title: 'Checks outside shifts and shared logins',
  question: 'Checks closed under a server\'s name while they were not clocked in, and checks closed under shared logins like "Manager", can mean someone is using another person\'s login, which hides who did what.',
  how: 'Each check in the Detailed Sales List is matched to its server\'s clock-in/out (15 minutes before to 30 minutes after a shift counts as inside). Also lists checks rung under shared logins.',
  needs: ['sales', 'timecard'],
  run(p, people) {
    const shifts = new Map<string, [number, number][]>();
    (p.timecard ?? []).forEach((t) => {
      if (!t.out) return;
      const k = people.key(t.emp);
      if (!shifts.has(k)) shifts.set(k, []);
      shifts.get(k)!.push([+t.in - 15 * 60000, +t.out + 30 * 60000]);
    });
    const per = new Map<string, { n: number; out: number }>();
    const shared = new Map<string, { n: number; amt: number; days: Set<string> }>();
    const findings: Finding[] = [];
    for (const r of p.sales ?? []) {
      const k = people.ofReceipt(r);
      if (isGeneric(k) || isGeneric(r.emp)) {
        const s = shared.get(k) ?? { n: 0, amt: 0, days: new Set<string>() };
        s.n++;
        s.amt += r.subtotal;
        s.days.add(dayKey(r.dt));
        shared.set(k, s);
        continue;
      }
      if (!shifts.has(k)) continue;
      const g = per.get(k) ?? { n: 0, out: 0 };
      g.n++;
      const inside = shifts.get(k)!.some(([a, b]) => +r.dt >= a && +r.dt <= b);
      if (!inside) {
        g.out++;
        findings.push({ sev: 'low', emp: k, when: r.dt, what: 'Check closed while not clocked in', detail: `${r.table}: ${money(r.subtotal)}, tip ${money(r.tip)}, paid ${r.cash > 0 ? 'cash' : 'card'}.`, amount: r.subtotal, ref: r.receipt });
      }
      per.set(k, g);
    }
    for (const [k, s] of shared) {
      findings.unshift({ sev: 'medium', emp: k, when: null, what: 'Shared login used', detail: `${s.n} checks (${money(s.amt)}) on ${s.days.size} days were closed under "${people.name(k)}". Anything done under a shared login can't be traced to a person.`, amount: s.amt });
    }
    const rows: EmpRow[] = [...per.entries()]
      .map(([k, g]) => ({ emp: k, values: { n: g.n, out: g.out, rate: g.n >= 20 ? (g.out / g.n) * 100 : null } }))
      .sort((a, b) => (b.values.out ?? 0) - (a.values.out ?? 0));
    const [a, b] = span((p.sales ?? []).map((r) => r.dt));
    return {
      period: periodText(a, b),
      summary: [
        `${findings.filter((f) => f.what === 'Check closed while not clocked in').length} checks were closed while their server was not clocked in.`,
        shared.size ? `Shared logins closed ${[...shared.values()].reduce((s, x) => s + x.n, 0)} checks. Consider giving every manager their own login.` : 'No checks under shared logins.',
      ],
      metrics: [
        { key: 'n', label: 'Checks', fmt: 'num', help: 'Checks in the Detailed Sales List.' },
        { key: 'out', label: 'Outside shift', fmt: 'num', help: 'Closed when not clocked in.' },
        { key: 'rate', label: '% outside', fmt: 'pct', worse: 'high', help: 'Share of their checks closed outside a shift (20+ checks needed).' },
      ],
      rows,
      findings,
    };
  },
};

export const CHECKS: Check[] = [timecards, tipsPool, gratuity, lateCancels, voids, discounts, freeItems, tipsForFreebies, logins];

// ---- Overview: who stands out --------------------------------------------------------------------

export interface Standout {
  emp: string;
  score: number;
  /** Robust z per metric (positive = worse than the team), keyed "checkId.metricKey". */
  z: Record<string, number | null>;
  reasons: string[];
}
export interface Overview {
  columns: { id: string; check: string; label: string; help: string }[];
  people: Standout[];
}

/** Robust z-scores (median and MAD), so one extreme person does not hide the others. */
export function robustZ(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length < 4) return values.map(() => null);
  const m = median(xs)!;
  let s = 1.4826 * median(xs.map((x) => Math.abs(x - m)))!;
  if (!s) s = 1.2533 * (xs.reduce((a, x) => a + Math.abs(x - m), 0) / xs.length);
  if (!s) return values.map((v) => (v === null ? null : 0));
  return values.map((v) => (v === null || !Number.isFinite(v) ? null : (v - m) / s));
}

export function overview(results: Record<string, CheckResult>): Overview {
  const columns: Overview['columns'] = [];
  const z = new Map<string, Record<string, number | null>>();
  const reasons = new Map<string, string[]>();
  for (const c of CHECKS) {
    const r = results[c.id];
    if (!r) continue;
    for (const m of r.metrics) {
      if (!m.worse) continue;
      const id = `${c.id}.${m.key}`;
      const zs = robustZ(r.rows.map((row) => row.values[m.key] ?? null));
      if (zs.every((x) => x === null)) continue;
      columns.push({ id, check: c.title, label: m.label, help: m.help });
      r.rows.forEach((row, i) => {
        const v = zs[i];
        const signed = v === null ? null : m.worse === 'high' ? v : -v;
        if (!z.has(row.emp)) z.set(row.emp, {});
        z.get(row.emp)![id] = signed;
        if (signed !== null && signed >= 2) {
          if (!reasons.has(row.emp)) reasons.set(row.emp, []);
          reasons.get(row.emp)!.push(`${c.title}: ${m.label.toLowerCase()}`);
        }
      });
    }
  }
  const people: Standout[] = [...z.entries()]
    .filter(([emp]) => !isGeneric(emp))
    .map(([emp, zz]) => ({
      emp,
      z: zz,
      // Only clearly-worse-than-usual results add up; capped so one metric can't dominate.
      score: Math.round(Object.values(zz).reduce<number>((s, v) => s + (v !== null && v > 1 ? Math.min(v, 4) - 1 : 0), 0) * 10) / 10,
      reasons: reasons.get(emp) ?? [],
    }))
    .sort((a, b) => b.score - a.score);
  return { columns, people };
}
