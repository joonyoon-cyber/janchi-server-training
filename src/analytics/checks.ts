import { CLOSE_GRACE_MIN, People, closingTime, endOfDay, isGeneric, startOfDay } from './people';
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
  /** Direction that looks bad (colored against the team). */
  worse?: 'high' | 'low';
  /** False keeps a metric out of "Who stands out" (e.g. overtime is a payroll issue, not theft). */
  inOverview?: boolean;
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
        // The schedule knows the planned end of that day's shift.
        const planned = people
          .shiftsOf(k)
          .filter((s) => s.day.toDateString() === x.in.toDateString() && +People.endOf(s) > +x.in)
          .sort((a, b) => Math.abs(+a.start - +x.in) - Math.abs(+b.start - +x.in))[0];
        if (planned) return People.endOf(planned);
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

// ---- 1b. Stayed past their shift (schedule vs time card) ------------------------------------

const GRACE_MIN = 15;

const overstay: Check = {
  id: 'overstay',
  group: 'Time cards',
  title: 'Stayed past their shift',
  question: 'Compares each clock-in and clock-out with that person\'s scheduled shift: who keeps clocking out well after their shift ends, clocks in early, or works days they weren\'t scheduled.',
  how: `Each punch is matched to the scheduled shift(s) it overlaps that day. Up to ${GRACE_MIN} minutes either way is not counted. Shifts marked C run until closing (10:00 PM, Sundays 9:00 PM) and closing duties vary, so closers get ${CLOSE_GRACE_MIN} minutes after closing and are also compared with the other closers that night.`,
  needs: ['timecard', 'schedule'],
  run(p, people) {
    const punches = (p.timecard ?? []).filter((x) => x.out && hoursOf(x)! <= 14 && hoursOf(x)! >= 0.1);
    const [tcA, tcB] = span(punches.map((x) => x.in));
    const findings: Finding[] = [];
    const per = new Map<string, { sched: number; worked: number; extra: number; over: number; lates: number[]; early: number; unsched: number; noshow: number }>();
    const get = (k: string) => {
      if (!per.has(k)) per.set(k, { sched: 0, worked: 0, extra: 0, over: 0, lates: [], early: 0, unsched: 0, noshow: 0 });
      return per.get(k)!;
    };
    const used = new Set<object>();
    // Clock-outs of everyone on a closing (C) shift, per night, to compare closers with each other.
    const closers = new Map<string, { k: string; out: Date }[]>();
    for (const x of punches) {
      const k = people.key(x.emp);
      const c = people.shiftsOf(k).find((s) => !s.end && s.day.toDateString() === x.in.toDateString() && +x.out! > +s.start);
      if (!c) continue;
      const day = c.day.toDateString();
      if (!closers.has(day)) closers.set(day, []);
      closers.get(day)!.push({ k, out: x.out! });
    }
    for (const x of punches) {
      const k = people.key(x.emp);
      const all = people.shiftsOf(k);
      if (!all.length) continue; // kitchen staff etc. are not on this schedule
      const g = get(k);
      g.worked += hoursOf(x)!;
      const sameDay = all.filter((s) => s.day.toDateString() === x.in.toDateString());
      if (!sameDay.length) {
        if (people.inSchedule(x.in)) {
          g.unsched++;
          findings.push({ sev: 'medium', emp: k, when: x.in, what: 'Worked an unscheduled shift', detail: `Clocked ${fmtTime(x.in)}–${fmtTime(x.out!)} (${hoursOf(x)!.toFixed(1)} h) on ${fmtDay(x.in)} with no shift on the schedule. Covering for someone?`, amount: hoursOf(x)! });
        }
        continue;
      }
      const overlap = (s: (typeof all)[number]) => Math.min(+x.out!, +People.endOf(s)) - Math.max(+x.in, +s.start);
      const match = sameDay.filter((s) => overlap(s) > 0);
      // Clocked back in shortly after the shift ended: that is staying late, not another shift.
      const justAfter = match.length ? undefined : sameDay.find((s) => +x.in >= +People.endOf(s) && +x.in - +People.endOf(s) <= 90 * 60000);
      if (justAfter) {
        const late = (+x.out! - +People.endOf(justAfter)) / 60000;
        const extra = hoursOf(x)!;
        g.over++;
        g.extra += extra;
        g.lates.push(late);
        findings.push({
          sev: late >= 60 ? 'high' : 'medium',
          emp: k,
          when: x.in,
          what: 'Clocked back in after the shift',
          detail: `${fmtDay(x.in)}: shift ${justAfter.raw} ended ${fmtTime(People.endOf(justAfter))}; clocked in again ${fmtTime(x.in)}–${fmtTime(x.out!)} (${Math.round(extra * 60)} min).`,
          amount: extra,
        });
        continue;
      }
      if (!match.length) {
        g.unsched++;
        findings.push({
          sev: 'medium',
          emp: k,
          when: x.in,
          what: 'Worked outside the scheduled shift',
          detail: `${fmtDay(x.in)}: clocked ${fmtTime(x.in)}–${fmtTime(x.out!)} (${hoursOf(x)!.toFixed(1)} h), but the schedule only has ${sameDay.map((s) => `${s.meal.toLowerCase()} ${s.raw}`).join(' and ')}. Swapped or extra shift?`,
          amount: hoursOf(x)!,
        });
        continue;
      }
      match.forEach((s) => used.add(s));
      if (match.length > 1) {
        const ord = [...match].sort((a, b) => +a.start - +b.start);
        const gap = (+ord[1].start - +People.endOf(ord[0])) / 60000;
        if (gap >= 30)
          findings.push({
            sev: 'low',
            emp: k,
            when: x.in,
            what: 'No clock-out between shifts',
            detail: `${fmtDay(x.in)}: one punch ${fmtTime(x.in)}–${fmtTime(x.out!)} covers ${ord.map((s) => s.raw).join(' and ')}, so the ${Math.round(gap)}-minute break between them was paid.`,
            amount: gap / 60,
          });
      }
      const start = new Date(Math.min(...match.map((s) => +s.start)));
      const end = new Date(Math.max(...match.map((s) => +People.endOf(s))));
      const shiftText = match.map((s) => s.raw).join(' + ');
      const late = (+x.out! - +end) / 60000;
      const early = (+start - +x.in) / 60000;
      const closing = match.some((s) => !s.end) && +end === Math.max(...match.map((s) => +People.endOf(s)));
      if (closing) {
        const others = (closers.get(x.in.toDateString()) ?? []).filter((o) => o.k !== k);
        const lastOther = others.length ? new Date(Math.max(...others.map((o) => +o.out))) : null;
        const pastOthers = lastOther ? (+x.out! - +lastOther) / 60000 : null;
        if (late > CLOSE_GRACE_MIN || (pastOthers !== null && pastOthers > 30 && late > GRACE_MIN)) {
          const over = Math.max(0, late - CLOSE_GRACE_MIN);
          g.over++;
          g.extra += over / 60;
          g.lates.push(late);
          findings.push({
            sev: late >= 90 || (pastOthers ?? 0) >= 60 ? 'high' : late >= 60 || (pastOthers ?? 0) >= 30 ? 'medium' : 'low',
            emp: k,
            when: x.in,
            what: 'Stayed long after closing',
            detail: `${fmtDay(x.in)}: closing shift (${shiftText}); closed at ${fmtTime(closingTime(x.in))}, clocked out ${fmtTime(x.out!)}: ${Math.round(late)} min after closing.${
              lastOther ? ` The other closers that night left by ${fmtTime(lastOther)}${pastOthers! > 0 ? ` (${Math.round(pastOthers!)} min earlier)` : ''}.` : ' No one else closed that night.'
            }`,
            amount: over / 60,
          });
        }
      } else if (late > GRACE_MIN) {
        g.over++;
        g.extra += late / 60;
        g.lates.push(late);
        findings.push({
          sev: late >= 60 ? 'high' : late >= 30 ? 'medium' : 'low',
          emp: k,
          when: x.in,
          what: 'Clocked out after the shift',
          detail: `${fmtDay(x.in)}: scheduled ${shiftText} (until ${fmtTime(end)}), clocked out ${fmtTime(x.out!)}: ${Math.round(late)} min over.`,
          amount: late / 60,
        });
      }
      if (early > GRACE_MIN) {
        g.early++;
        g.extra += early / 60;
        findings.push({ sev: early >= 30 ? 'medium' : 'low', emp: k, when: x.in, what: 'Clocked in early', detail: `${fmtDay(x.in)}: scheduled ${shiftText} from ${fmtTime(start)}, clocked in ${fmtTime(x.in)}: ${Math.round(early)} min early.`, amount: early / 60 });
      }
    }
    // Scheduled shifts inside the time card period with no punch at all.
    if (tcA && tcB) {
      const punched = new Set(punches.map((x) => people.key(x.emp)));
      const missingPeople = new Set<string>();
      for (const s of p.schedule ?? []) {
        if (s.day < startOfDay(tcA) || s.day > endOfDay(tcB)) continue;
        const kk = people.ofScheduleName(s.name);
        get(kk).sched += (+People.endOf(s) - +s.start) / 3600000;
        if (!punched.has(kk)) {
          get(kk).noshow++;
          if (!missingPeople.has(kk)) {
            missingPeople.add(kk);
            findings.push({ sev: 'medium', emp: kk, when: null, what: 'On the schedule, not on the time card', detail: `"${s.name}" is scheduled in this period but never clocked in. A different name on the time card, or not clocking in at all?` });
          }
          continue;
        }
        if (!used.has(s)) {
          get(kk).noshow++;
          findings.push({ sev: 'low', emp: kk, when: s.start, what: 'Scheduled, no clock-in', detail: `${fmtDay(s.day)} ${s.meal.toLowerCase()} ${s.raw}: no punch that matches. Swapped shifts, or forgot to clock in?` });
        }
      }
    }
    const rows: EmpRow[] = [...per.entries()]
      .filter(([, g]) => g.worked > 0 || g.sched > 0)
      .map(([k, g]) => ({
        emp: k,
        values: {
          sched: Math.round(g.sched * 10) / 10,
          worked: Math.round(g.worked * 10) / 10,
          extra: Math.round(g.extra * 10) / 10,
          extraPct: g.sched >= 8 ? (g.extra / g.sched) * 100 : null,
          over: g.over,
          late: median(g.lates),
          unsched: g.unsched,
          noshow: g.noshow,
        },
      }))
      .sort((a, b) => (b.values.extra ?? 0) - (a.values.extra ?? 0));
    const totalExtra = rows.reduce((s, r) => s + (r.values.extra ?? 0), 0);
    return {
      period: periodText(tcA, tcB),
      summary: [
        `${totalExtra.toFixed(1)} hours were clocked outside scheduled shifts by people on the schedule (beyond ${GRACE_MIN} minutes' grace, or ${CLOSE_GRACE_MIN} minutes after closing for closers).`,
        'Kitchen staff are not on the schedule, so they are not included.',
      ],
      metrics: [
        { key: 'sched', label: 'Scheduled hours', fmt: 'num', help: 'Hours on the schedule in the time card period (C shifts end at close).' },
        { key: 'worked', label: 'Clocked hours', fmt: 'num', help: 'Hours on the time card.' },
        { key: 'extra', label: 'Extra hours', fmt: 'num', help: 'Time clocked before the scheduled start or after the scheduled end, beyond the grace period.' },
        { key: 'extraPct', label: 'Extra vs scheduled', fmt: 'pct', help: 'Extra hours as a % of scheduled hours (8+ scheduled hours needed).' },
        { key: 'over', label: 'Late clock-outs', fmt: 'num', help: `Clocked out more than ${GRACE_MIN} minutes after a set end time, or more than ${CLOSE_GRACE_MIN} minutes after closing (or well after the other closers) on a C shift.` },
        { key: 'late', label: 'Typical overstay (min)', fmt: 'num', help: 'Median minutes past the scheduled end, on late clock-outs.' },
        { key: 'unsched', label: 'Unscheduled shifts', fmt: 'num', help: 'Shifts worked on a day with nothing on the schedule.' },
        { key: 'noshow', label: 'Scheduled, no punch', fmt: 'num', help: 'Scheduled shifts with no clock-in.' },
      ],
      rows,
      findings,
    };
  },
};

// ---- 2. Tips kept out of the pool -----------------------------------------------------------
//
// Cash tips are counted on paper, so the POS has no cash-tip amounts. What it does show:
// card tips per check. A card check with no automatic 18% and a $0 tip most likely means the guest
// tipped in cash; a server whose card tips are low for their sales may be steering tips into cash.

/** Auto-gratuity (18%) is on the check: 5+ guests, or a tip of ~18% exactly. */
const hasAutoTip = (r: Receipt) => r.persons >= 5 || (r.subtotal > 0 && Math.abs(r.tip / r.subtotal - 0.18) < 0.002);

const tipsPool: Check = {
  id: 'tips-pool',
  group: 'Tips',
  title: 'Tips that may not reach the pool',
  question:
    'Cash tips are counted on paper, so only card tips show up here. A card check with no automatic 18% and a $0 tip usually means the guest left cash; a server with many of those, or with card tips that are low for their sales, deserves a look at whether that cash made it to the tip sheet.',
  how: 'Dine-in checks of $20+ paid fully by card, without the automatic 18% (fewer than 5 guests). Per server: share with a $0 tip, share with a tip under 10%, and the median tip %. Over the longer Tips report period: card tips ÷ card sales. Cash share of sales is shown for context only.',
  needs: ['sales'],
  run(p, people) {
    const sales = p.sales ?? [];
    const per = new Map<string, { n: number; zero: number; low: number; pcts: number[]; zeroAmt: number }>();
    const findings: Finding[] = [];
    for (const r of sales) {
      if (!isDineIn(r) || r.subtotal < 20 || !(r.card > 0) || r.cash > 0 || hasAutoTip(r)) continue;
      const k = people.ofReceipt(r);
      if (isGeneric(k)) continue;
      const g = per.get(k) ?? { n: 0, zero: 0, low: 0, pcts: [], zeroAmt: 0 };
      const tp = tipPct(r)!;
      g.n++;
      g.pcts.push(tp);
      if (r.tip === 0) {
        g.zero++;
        g.zeroAmt += r.subtotal;
        findings.push({
          sev: r.subtotal >= 100 ? 'medium' : 'low',
          emp: k,
          when: r.dt,
          what: '$0 card tip (cash tip?)',
          detail: `${r.table}, ${r.persons} guest${r.persons === 1 ? '' : 's'}: ${money(r.subtotal)} on card with no tip. If the guest left cash, it should be on the tip sheet for ${fmtDay(r.dt)}.`,
          amount: r.subtotal,
          ref: r.receipt,
        });
      } else if (tp < 10) {
        g.low++;
        findings.push({ sev: 'low', emp: k, when: r.dt, what: 'Very low card tip', detail: `${r.table}: ${money(r.tip)} (${pct(tp)}) on ${money(r.subtotal)}.`, amount: r.subtotal, ref: r.receipt });
      }
      per.set(k, g);
    }
    // Longer view: card tips vs card sales (Tips report + Sales by Employee Date).
    const long = new Map<string, { cardTips: number; cardSales: number; cash: number; total: number }>();
    const tips = p.tips ?? [];
    const daily = p.salesByDate ?? [];
    const [a1, b1] = span(tips.map((t) => t.added));
    const [a2, b2] = span(daily.map((d) => d.day));
    const from = a1 && a2 ? (a1 > a2 ? a1 : a2) : null;
    const to = b1 && b2 ? (b1 < b2 ? b1 : b2) : null;
    if (from && to) {
      const inRange = (d: Date) => d >= startOfDay(from) && d <= endOfDay(to);
      daily.forEach((d) => {
        if (!inRange(d.day)) return;
        const k = people.key(d.emp);
        const g = long.get(k) ?? { cardTips: 0, cardSales: 0, cash: 0, total: 0 };
        g.cardSales += d.card;
        g.cash += d.cash;
        g.total += d.cash + d.card;
        long.set(k, g);
      });
      tips.forEach((t) => {
        if (!inRange(t.added)) return;
        const g = long.get(people.key(t.emp));
        if (g) g.cardTips += t.card;
      });
    } else if (daily.length) {
      daily.forEach((d) => {
        const k = people.key(d.emp);
        const g = long.get(k) ?? { cardTips: 0, cardSales: 0, cash: 0, total: 0 };
        g.cash += d.cash;
        g.total += d.cash + d.card;
        long.set(k, g);
      });
    }
    const [a, b] = span(sales.map((r) => r.dt));
    const keys = new Set([...people.servers(from ?? a, to ?? b), ...[...per.keys()].filter((k) => (per.get(k)?.n ?? 0) >= 20 && (!people.hasSchedule() || people.role(k) === 'Server'))]);
    const rows: EmpRow[] = [...keys].map((k) => {
      const g = per.get(k);
      const l = long.get(k);
      return {
        emp: k,
        values: {
          n: g?.n ?? 0,
          zero: g && g.n >= 20 ? (g.zero / g.n) * 100 : null,
          low: g && g.n >= 20 ? ((g.zero + g.low) / g.n) * 100 : null,
          med: g && g.n >= 20 ? median(g.pcts) : null,
          longRate: l && from && l.cardSales - l.cardTips > 1000 ? (l.cardTips / (l.cardSales - l.cardTips)) * 100 : null,
          cashShare: l && l.total > 1000 ? (l.cash / l.total) * 100 : null,
        },
      };
    });
    rows.sort((x, y) => (y.values.zero ?? -1) - (x.values.zero ?? -1));
    const all = [...per.values()].reduce((s, g) => ({ n: s.n + g.n, zero: s.zero + g.zero }), { n: 0, zero: 0 });
    return {
      period: periodText(a, b),
      summary: [
        `${all.zero} of ${all.n} card checks without the automatic 18% had a $0 tip (${all.n ? pct((all.zero / all.n) * 100) : '–'}). Most of those guests probably tipped in cash: compare them with the tip sheet for those days.`,
        'Red in the table = far more $0-tip card checks, or far lower card tips, than the rest of the team.',
      ],
      metrics: [
        { key: 'n', label: 'Card checks', fmt: 'num', help: 'Dine-in card checks of $20+ without the automatic 18%.' },
        { key: 'zero', label: '$0 tip', fmt: 'pct', worse: 'high', help: 'Share of those checks with no tip at all (likely tipped in cash). 20+ checks needed.' },
        { key: 'low', label: 'Under 10% tip', fmt: 'pct', worse: 'high', help: 'Share with no tip or a tip under 10%.' },
        { key: 'med', label: 'Median card tip', fmt: 'pct', worse: 'low', help: 'Median tip % on those checks.' },
        { key: 'longRate', label: 'Card tips ÷ card sales', fmt: 'pct', worse: 'low', help: 'Over the Tips report period: card tips ÷ card sales before tips (includes tax and large parties).' },
        { key: 'cashShare', label: 'Cash share of sales', fmt: 'pct', help: 'Share of their sales paid in cash (context: more cash means more cash tips to hand in).' },
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

// ---- 6. Discounts (house policy) ----------------------------------------------------------------
//
// Off-duty 10%: employees and immediate family (parents, siblings, spouse, children) dining outside
//   working hours. The note must name the employee and the relationship ("MARIA SELF", "MARIA MOTHER").
// On-duty 20%: food the employee orders and eats themselves (take-out included) during their scheduled shift.

const IMMEDIATE = /\b(SELF|ME|MOM|MOTHER|MAMA|MADRE|DAD|FATHER|PAPA|PADRE|PARENTS?|SISTER|SIS|HERMANA|BROTHER|BRO|HERMANO|SIBLINGS?|SPOUSE|WIFE|ESPOSA|HUSBAND|ESPOSO|SON|HIJO|DAUGHTER|HIJA|CHILD|CHILDREN|KIDS?)\b/;
const NOT_IMMEDIATE = /\b(COUSIN|PRIM[OA]|FRIENDS?|AMIG[OA]S?|AUNT|TIA|UNCLE|TIO|NIECE|NEPHEW|SOBRIN[OA]|GRAND\w*|ABUEL[OA]|GIRLFRIEND|BOYFRIEND|GF|BF|NOVI[OA]|IN-?LAWS?|SUEGR[OA]|CUÑAD[OA]|CUNAD[OA]|BABYSITTER|NEIGHBOU?R|COWORKER)\b/;
const DRINK = /SODA|COKE|SPRITE|FANTA|PEPSI|\bTEA\b|COFFEE|LEMONADE|JUICE|WATER|ARNOLD|RAMUNE|MILKIS|SMOOTHIE|SLUSH|DRINK/i;
const ALCOHOL = /BEER|DRAFT|SOJU|WINE|GLASS\)|BOTTLE|PITCHER|SAKE|MAKGEOLLI|COCKTAIL|MARGARITA|SAPPORO|ASAHI|COORS|LAGUNITAS|HITE|CASS|TERRA|\bIPA\b|SHOT|HIGHBALL|CHAR\. HOUSE|CAB\b|CABERNET|CHARDONNAY|MOSCATO|SAU\. BL|PINOT|MERLOT/i;

export function noteKind(note: string): string {
  const n = note.toUpperCase();
  if (!n.trim()) return 'no note';
  if (NOT_IMMEDIATE.test(n) || /FAMIL/.test(n)) return 'family/friends';
  if (IMMEDIATE.test(n)) return 'employee + family';
  if (/EMP|MPLOY|PLOYE|EMOL|WORK|WOKER|WROKER|STAFF/.test(n)) return 'employee';
  if (/ANTS?\b|HAIR|BUG|COLD|LATE|WRONG|COMPLAIN|BURN|RAW|SICK|WAIT|MISTAKE|SORRY/.test(n)) return 'complaint';
  if (/COUPON|PROMO|YELP|GROUPON|BIRTHDAY|BDAY|REVIEW|GOOGLE|VIP|MILITARY|POLICE|FIRE|NURSE|TEACHER|STUDENT|SENIOR/.test(n)) return 'promotion';
  return 'other (name?)';
}

/** Employee named in a discount note: a known first name (and surname hint) among its words. */
function namedEmployee(note: string, people: People, placer = '', ignore: string[] = []): string | null {
  const words = note.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !ignore.includes(w));
  const firsts = people.firstNames();
  for (let i = 0; i < words.length; i++) {
    const ks = firsts.get(words[i]);
    if (!ks?.length) continue;
    if (ks.length === 1) return ks[0];
    const hint = words[i + 1];
    const hit = hint ? ks.filter((k) => k.split(' ').slice(1).some((w) => w.startsWith(hint.slice(0, 3)))) : [];
    if (hit.length === 1) return hit[0];
    // Two people share the first name: the one who rang it in is the likeliest.
    return ks.includes(placer) ? placer : ks[0];
  }
  return null;
}

const discounts: Check = {
  id: 'discounts',
  group: 'Free food and discounts',
  title: 'Discounts and the employee policy',
  question:
    'Checks each discount against the house policy. 10% off-duty: employee or immediate family, outside working hours, with "NAME RELATIONSHIP" in the note. 20% on-duty: food the employee eats themselves during their scheduled shift. Also discounts with no reason or bigger than their button.',
  how: 'The note is read for an employee\'s first name and a relationship word. Working hours come from the time card (clocked in) or the schedule (scheduled shift); a day neither covers is marked "can\'t verify". Drinks and alcohol on a 20% check, or a 20% on a dine-in table with a large check, suggest it wasn\'t just the employee\'s own food.',
  needs: ['discounts', 'salesByDate'],
  run(p, people) {
    const ds = p.discounts ?? [];
    // The Discount report lists only some of a check's items (e.g. the round the discount was rung on),
    // so percentages use the whole check from the Detailed Sales List: "Total order amount" (food and
    // drink before the discount). Matched by receipt number; without it, the report's items are used.
    const sales = new Map((p.sales ?? []).map((r) => [r.receipt, r]));
    const saleOf = (ticket: string) => sales.get(ticket) ?? [...sales.values()].find((r) => r.receipt.endsWith(ticket) || ticket.endsWith(r.receipt));
    const findings: Finding[] = [];
    const per = new Map<string, { n: number; amt: number; breaks: number; noNote: number }>();
    const flag = (f: Finding) => findings.push(f);
    const nameless = new Map<string, number>();
    const unverified = new Map<string, number>();
    for (const d of ds) {
      if (d.amount <= 0) continue;
      const k = people.key(d.placedBy);
      const g = per.get(k) ?? { n: 0, amt: 0, breaks: 0, noNote: 0 };
      g.n++;
      g.amt += d.amount;
      per.set(k, g);
      const before = findings.length;
      const label = /(\d+)\s*%/.exec(d.name)?.[1];
      const sale = saleOf(d.ticket);
      // Whole check before the discount; the report's own items only when the sales list doesn't have it.
      const base = sale && sale.subtotal > 0 ? Math.max(sale.subtotal, d.itemsAmount) : d.itemsAmount;
      const items = sale?.lines.length ? sale.lines.map((l) => ({ menu: l.menu, amount: l.amount })) : d.items;
      const realPct = base > 0 ? (d.amount / base) * 100 : null;
      const note = d.note.toUpperCase();
      const where = `${d.table || 'Check'}: ${money(d.amount)} off ${money(base)}${d.name ? ` (${d.name.replace(/[<>]/g, '')})` : ''}${d.note ? `, note "${d.note}"` : ', no note'}.`;
      const base0 = { emp: k, when: d.placed, amount: d.amount, ref: d.ticket };
      if (label && realPct !== null && realPct > +label + 10 && d.amount >= 5) {
        const twice = realPct <= 2 * +label + 1.5;
        // Without the check's full total (Detailed Sales List not loaded or no match), this may be a false alarm.
        const partial = !sale ? ' (Based only on the items in the Discount report: load the Detailed Sales List to check against the whole order.)' : '';
        flag({
          ...base0,
          sev: !sale ? 'low' : twice ? 'medium' : 'high',
          what: twice ? 'Discount applied twice?' : 'Discount bigger than its label',
          detail: `${where} That is ${pct(realPct)} of the whole order, not ${label}%.${partial}`,
        });
      }
      const named = namedEmployee(d.note, people, k);
      const duty = (who: string) => people.onDuty(who, d.placed);
      const dutyText = (s: string) => (s === 'clocked' ? 'was clocked in' : s === 'scheduled' ? 'was on a scheduled shift' : 'was not working');
      if (label === '10') {
        const rel = NOT_IMMEDIATE.exec(note)?.[1] ?? (/FAMIL/.test(note) ? 'FAMILY' : null);
        if (rel) {
          flag({ ...base0, sev: 'high', what: 'Off-duty 10% for someone not eligible', detail: `${where} "${rel}" is not immediate family: the 10% covers the employee, parents, siblings, spouse and children only.` });
        } else if (!named || !IMMEDIATE.test(note)) {
          flag({ ...base0, sev: 'medium', what: 'Off-duty 10% note incomplete', detail: `${where} The note should name the employee and the relationship, e.g. "MARIA SELF" or "MARIA MOTHER".` });
        }
        const who = named ?? null;
        if (who) {
          const s = duty(who);
          if (s === 'clocked' || s === 'scheduled')
            flag({
              ...base0,
              sev: s === 'clocked' ? 'high' : 'medium',
              what: 'Off-duty 10% while on duty',
              detail: `${where} ${people.name(who)} ${dutyText(s)} at ${fmtTime(d.placed)}; the 10% is only for dining outside working hours.`,
            });
        }
      } else if (label === '20') {
        const who = named ?? k;
        const s = duty(who);
        if (s === 'off')
          flag({ ...base0, sev: 'high', what: 'On-duty 20% outside a shift', detail: `${where} ${people.name(who)} was not clocked in at ${fmtTime(d.placed)}; the 20% is only during their scheduled shift.` });
        else if (s === 'unscheduled')
          flag({ ...base0, sev: 'medium', what: 'On-duty 20% outside a shift', detail: `${where} ${people.name(who)} was not on the schedule at ${fmtTime(d.placed)} (no time card for that day to confirm; shifts may have been swapped).` });
        else if (s === 'unknown') unverified.set(who, (unverified.get(who) ?? 0) + 1);
        const other = NOT_IMMEDIATE.exec(note)?.[1] ?? (/FAMIL/.test(note) ? 'FAMILY' : null) ?? IMMEDIATE.exec(note.replace(/\bSELF\b|\bME\b/g, ''))?.[1] ?? null;
        if (other)
          flag({ ...base0, sev: 'high', what: 'On-duty 20% for someone else', detail: `${where} The note says "${other}": the 20% is only for the employee's own food. Family can get the 10% when the employee is off duty.` });
        const booze = items.filter((i) => ALCOHOL.test(i.menu));
        const drinks = items.filter((i) => DRINK.test(i.menu) && !ALCOHOL.test(i.menu));
        if (booze.length) flag({ ...base0, sev: 'high', what: 'On-duty 20% on alcohol', detail: `${where} Includes ${booze.map((i) => i.menu).join(', ')}. The 20% is for food only.` });
        else if (drinks.length) flag({ ...base0, sev: 'low', what: 'On-duty 20% on drinks', detail: `${where} Includes ${drinks.map((i) => i.menu).join(', ')}. The policy covers food.` });
        if (!/take\s*out|to\s*go/i.test(d.table) && base >= 45)
          flag({ ...base0, sev: 'medium', what: 'On-duty 20% on a guest-sized check', detail: `${where} A ${money(base)} dine-in check looks like more than one employee's own meal.` });
        if (!named) nameless.set(k, (nameless.get(k) ?? 0) + 1);
      } else {
        const kind = noteKind(d.note);
        if (kind === 'no note') flag({ ...base0, sev: d.amount >= 10 ? 'medium' : 'low', what: 'Discount with no reason', detail: where });
        else if (kind === 'family/friends' || kind === 'other (name?)') flag({ ...base0, sev: 'medium', what: 'Discount for family/friends?', detail: where });
        else if (d.amount >= 20) flag({ ...base0, sev: 'medium', what: 'Large discount', detail: where });
      }
      if (!d.note.trim()) g.noNote++;
      if (findings.slice(before).some((f) => f.sev !== 'low')) g.breaks++;
    }
    nameless.forEach((n, k) =>
      findings.push({ sev: 'low', emp: k, when: null, what: "20% notes don't say who", detail: `${n} on-duty discount${n > 1 ? 's' : ''} rung by ${people.name(k)} don't name the employee; they were checked against ${people.name(k)}. Ask staff to write their name.` }),
    );
    unverified.forEach((n, k) =>
      findings.push({ sev: 'low', emp: k, when: null, what: "Can't verify the shift", detail: `${n} on-duty discount${n > 1 ? 's' : ''} for ${people.name(k)} on days with no time card or schedule (or not on either report).` }),
    );
    const [a, b] = span(ds.map((d) => d.placed));
    const servers = people.servers(a, b);
    const rows: EmpRow[] = servers.map((k) => {
      const g = per.get(k) ?? { n: 0, amt: 0, breaks: 0, noNote: 0 };
      const checks = people.checks(k, a, b);
      return { emp: k, values: { checks, n: g.n, amt: g.amt, per100: per100(g.n, checks), amt100: per100(g.amt, checks), breaks: g.breaks, breakPct: g.n >= 5 ? (g.breaks / g.n) * 100 : null } };
    });
    rows.sort((x, y) => (y.values.breaks ?? 0) - (x.values.breaks ?? 0));
    const total = [...per.values()].reduce((s, g) => s + g.amt, 0);
    const broken = [...per.values()].reduce((s, g) => s + g.breaks, 0);
    const byKind = new Map<string, number>();
    ds.forEach((d) => d.amount > 0 && byKind.set(noteKind(d.note), (byKind.get(noteKind(d.note)) ?? 0) + d.amount));
    return {
      period: periodText(a, b),
      summary: [
        `${money(total)} in discounts on ${ds.filter((d) => d.amount > 0).length} checks; ${broken} of them don't follow the policy or need a closer look.`,
        `By note: ${[...byKind.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${money(v)}`).join(' · ')}.`,
        people.hasSchedule() || p.timecard ? 'On/off duty is checked with the time card and the schedule.' : 'Load the Time Card and the shift schedule to check whether discounts were used on or off duty.',
      ],
      metrics: [
        { key: 'checks', label: 'Checks closed', fmt: 'num', help: 'Checks this person closed in the period.' },
        { key: 'n', label: 'Discounts', fmt: 'num', help: 'Discounted checks they rang.' },
        { key: 'amt', label: 'Value', fmt: 'money', help: 'Total discounted.' },
        { key: 'per100', label: 'Per 100 checks', fmt: 'num', worse: 'high', help: 'Discounts per 100 checks closed.' },
        { key: 'amt100', label: '$ per 100 checks', fmt: 'money', worse: 'high', help: 'Discount dollars per 100 checks closed.' },
        { key: 'breaks', label: 'Policy problems', fmt: 'num', help: 'Discounts they rang that break the policy or need a look (amber or red).' },
        { key: 'breakPct', label: '% with problems', fmt: 'pct', worse: 'high', help: 'Share of their discounts with a policy problem (5+ discounts needed).' },
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

// ---- 2b. Card payments with a $0 tip (for the paper tip sheet) -----------------------------

const zeroTips: Check = {
  id: 'zero-tips',
  group: 'Tips',
  title: 'Card payments with $0 tip',
  question: 'Every card payment closed with no tip, by date, with whose table it was, to check against the paper cash-tip sheet. The automatic 18% counts as a tip, so those checks are not listed.',
  how: 'All checks in the Detailed Sales List paid at least partly by card with a $0 tip, dine-in and take-out. The table below counts them per server.',
  needs: ['sales'],
  run(p, people) {
    const per = new Map<string, { card: number; zero: number; dine: number }>();
    for (const r of p.sales ?? []) {
      if (!(r.card > 0)) continue;
      const k = people.ofReceipt(r);
      const g = per.get(k) ?? { card: 0, zero: 0, dine: 0 };
      g.card++;
      if (r.tip === 0) {
        g.zero++;
        if (isDineIn(r)) g.dine++;
      }
      per.set(k, g);
    }
    const rows: EmpRow[] = [...per.entries()]
      .filter(([k]) => !isGeneric(k))
      .map(([k, g]) => ({ emp: k, values: { card: g.card, zero: g.zero, dine: g.dine, pct: g.card >= 20 ? (g.zero / g.card) * 100 : null } }))
      .sort((a, b) => (b.values.zero ?? 0) - (a.values.zero ?? 0));
    const n = [...per.values()].reduce((s, g) => s + g.zero, 0);
    const [a, b] = span((p.sales ?? []).map((r) => r.dt));
    return {
      period: periodText(a, b),
      summary: [`${n} card payments had a $0 tip. The table shows them per server; the list below has every one by date. Most of these guests probably tipped in cash.`],
      metrics: [
        { key: 'card', label: 'Card payments', fmt: 'num', help: 'Checks paid at least partly by card.' },
        { key: 'zero', label: 'With $0 tip', fmt: 'num', help: 'Card payments with no tip (the automatic 18% counts as a tip).' },
        { key: 'dine', label: 'Dine-in', fmt: 'num', help: 'Of those, dine-in tables (not take-out).' },
        { key: 'pct', label: '% with $0 tip', fmt: 'pct', worse: 'high', inOverview: false, help: 'Share of their card payments with no tip (20+ needed). Overlaps with "Tips that may not reach the pool".' },
      ],
      rows,
      findings: [],
    };
  },
};

export const CHECKS: Check[] = [timecards, overstay, tipsPool, zeroTips, gratuity, lateCancels, voids, discounts, freeItems, tipsForFreebies, logins];

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
      if (!m.worse || m.inOverview === false) continue;
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
