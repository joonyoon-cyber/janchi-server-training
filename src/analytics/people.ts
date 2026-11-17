import { personKey, type Parsed, type Receipt, type ScheduledShift } from './reports';

/** Shifts marked C (until close) end at this time: the median clock-out on closing shifts. */
export const CLOSE_HOUR = 22;

/** Shared logins like "Mnager Manager" or "Owner Owner" are not one person. */
export function isGeneric(name: string): boolean {
  const k = personKey(name);
  const w = k.split(' ');
  return /\bMA?NA?GER\d*\b|\bMNAGER\b|\bOWNER\b|\bADMIN\b|\bTEST\b/.test(k) || (w.length === 2 && w[0] === w[1]);
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Who is who across the reports. Full names differ slightly between reports
 * ("PAT Q DOE" vs "PAT DOE") and the Detailed Sales List only has first names,
 * so everyone is keyed by personKey() and first names are resolved per check where possible.
 */
export class People {
  private display = new Map<string, string>();
  private byFirst = new Map<string, Set<string>>();
  /** Receipt number -> person key (from the tips report, which has full names). */
  private receiptOwner = new Map<string, string>();
  /** Checks per person per day (from Sales Record by Employee Date). */
  private daily = new Map<string, { day: Date; checks: number }[]>();
  /** Clocked shifts per person, to tell apart two people with the same first name. */
  private shifts = new Map<string, [number, number][]>();
  /** From the schedule workbook: role and scheduled shifts per person. */
  private roles = new Map<string, string>();
  private scheduled = new Map<string, ScheduledShift[]>();
  private schedName = new Map<string, string>();
  /** Days covered by the time card and the schedule. */
  private tcSpan: [number, number] | null = null;
  private schedSpan: [number, number] | null = null;

  constructor(private p: Parsed) {
    const add = (name: string) => {
      const k = personKey(name);
      if (!k) return k;
      const shown = titleCase(name.replace(/\s+/g, ' '));
      if (!this.display.has(k) || shown.length > this.display.get(k)!.length) this.display.set(k, shown);
      const f = k.split(' ')[0];
      if (!this.byFirst.has(f)) this.byFirst.set(f, new Set());
      this.byFirst.get(f)!.add(k);
      return k;
    };
    p.salesByDate?.forEach((d) => {
      const k = add(d.emp);
      if (!this.daily.has(k)) this.daily.set(k, []);
      this.daily.get(k)!.push({ day: d.day, checks: d.checks });
    });
    p.tips?.forEach((t) => this.receiptOwner.set(t.receipt, add(t.emp)));
    p.timecard?.forEach((t) => {
      const k = add(t.emp);
      if (!t.out || +t.out - +t.in > 14 * 3600000) return;
      if (!this.shifts.has(k)) this.shifts.set(k, []);
      this.shifts.get(k)!.push([+t.in - 15 * 60000, +t.out + 30 * 60000]);
    });
    p.cancels?.forEach((c) => {
      add(c.placedBy);
      add(c.canceledBy);
    });
    p.voids?.forEach((v) => add(v.emp));
    if (p.timecard?.length) {
      const t = p.timecard.map((x) => +startOfDay(x.in));
      this.tcSpan = [Math.min(...t), +endOfDay(new Date(Math.max(...t)))];
    }
    if (p.schedule?.length) {
      const t = p.schedule.map((x) => +x.day);
      this.schedSpan = [Math.min(...t), +endOfDay(new Date(Math.max(...t)))];
      // Resolve schedule names after every report's names are known; names with a surname hint first,
      // so "Sam R." claims Sam Roe and plain "Sam" gets the other Sam.
      const names = [...new Set(p.schedule.map((x) => x.name))].sort((a, b) => b.split(' ').length - a.split(' ').length);
      const claimed = new Set<string>();
      for (const n of names) {
        const k = this.resolveScheduleName(n, claimed);
        claimed.add(k);
        this.schedName.set(n, k);
        if (!this.display.has(k)) add(n);
      }
      const roleCount = new Map<string, Map<string, number>>();
      p.schedule.forEach((x) => {
        const k = this.schedName.get(x.name)!;
        if (!this.scheduled.has(k)) this.scheduled.set(k, []);
        this.scheduled.get(k)!.push(x);
        const m = roleCount.get(k) ?? new Map<string, number>();
        m.set(x.role, (m.get(x.role) ?? 0) + 1);
        roleCount.set(k, m);
      });
      roleCount.forEach((m, k) => this.roles.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
    }
    p.discounts?.forEach((d) => add(d.placedBy));
    p.priceChanges?.forEach((c) => add(c.emp));
  }

  private resolveScheduleName(name: string, claimed: Set<string>): string {
    const words = personKey(name.replace(/\./g, ' ')).split(' ');
    const cands = [...(this.byFirst.get(words[0]) ?? [])];
    if (cands.length === 1) return cands[0];
    if (words.length > 1) {
      const hit = cands.filter((c) => c.split(' ').slice(1).some((w) => w.startsWith(words[1])));
      if (hit.length === 1) return hit[0];
    }
    const free = cands.filter((c) => !claimed.has(c));
    if (free.length === 1) return free[0];
    return personKey(name);
  }

  /** Person key for a name as written on the schedule. */
  ofScheduleName(name: string): string {
    return this.schedName.get(name) ?? personKey(name);
  }

  /** Role on the schedule (Server, Host, Bartender, Food runner / Busser), if scheduled. */
  role(key: string): string | undefined {
    return this.roles.get(key);
  }

  hasSchedule(): boolean {
    return this.scheduled.size > 0;
  }

  shiftsOf(key: string): ScheduledShift[] {
    return this.scheduled.get(key) ?? [];
  }

  /** Scheduled end, with "until close" shifts ending at CLOSE_HOUR. */
  static endOf(s: ScheduledShift): Date {
    return s.end ?? new Date(s.day.getFullYear(), s.day.getMonth(), s.day.getDate(), CLOSE_HOUR, 0);
  }

  inTimecard(t: Date): boolean {
    return !!this.tcSpan && +t >= this.tcSpan[0] && +t <= this.tcSpan[1];
  }
  inSchedule(t: Date): boolean {
    return !!this.schedSpan && +t >= this.schedSpan[0] && +t <= this.schedSpan[1];
  }

  /**
   * Was this person working at time t? 'clocked' (time card), 'scheduled' (schedule only),
   * 'off' (the time card covers the day and they weren't clocked in), 'unscheduled' (only the
   * schedule covers the day and they weren't on it), or 'unknown'.
   */
  onDuty(key: string, t: Date): 'clocked' | 'scheduled' | 'off' | 'unscheduled' | 'unknown' {
    if ((this.shifts.get(key) ?? []).some(([a, b]) => +t >= a && +t <= b)) return 'clocked';
    if (this.shiftsOf(key).some((x) => +t >= +x.start - 30 * 60000 && +t <= +People.endOf(x) + 60 * 60000)) return 'scheduled';
    // Someone on neither report (a shared login, a new hire) can't be judged.
    if (!this.shifts.has(key) && !this.scheduled.has(key)) return 'unknown';
    if (this.inTimecard(t)) return 'off';
    if (this.inSchedule(t)) return 'unscheduled';
    return 'unknown';
  }

  /** Every first name we know, for spotting names in discount notes. */
  firstNames(): Map<string, string[]> {
    const m = new Map<string, string[]>();
    this.byFirst.forEach((ks, f) => m.set(f, [...ks]));
    return m;
  }

  key(name: string): string {
    return personKey(name);
  }

  name(key: string): string {
    return this.display.get(key) ?? titleCase(key);
  }

  /**
   * A first name from the Detailed Sales List. With two people of that first name, the one
   * clocked in at that time wins, then the one with more checks.
   */
  fromFirst(first: string, at?: Date): string {
    const f = personKey(first);
    const ks = [...(this.byFirst.get(f.split(' ')[0] ?? '') ?? [])];
    if (ks.length === 1) return ks[0];
    if (ks.length > 1) {
      if (at) {
        const on = ks.filter((k) => this.shifts.get(k)?.some(([a, b]) => +at >= a && +at <= b));
        if (on.length === 1) return on[0];
      }
      const total = (k: string) => (this.daily.get(k) ?? []).reduce((s, d) => s + d.checks, 0);
      const best = ks.sort((a, b) => total(b) - total(a));
      if (total(best[0]) > 0) return best[0];
    }
    // Generic logins appear as their first word ("Mnager"): keep them distinguishable.
    return f;
  }

  /** The server of a check: the tips report names them in full; otherwise resolve the first name. */
  ofReceipt(r: Receipt): string {
    return this.receiptOwner.get(r.receipt) ?? this.fromFirst(r.emp, r.dt);
  }

  /** Checks a person closed between two dates (inclusive days). Null when there is no daily sales report. */
  checks(key: string, from: Date | null, to: Date | null): number | null {
    if (!this.p.salesByDate) {
      if (!this.p.sales) return null;
      return this.p.sales.filter((r) => this.ofReceipt(r) === key && (!from || r.dt >= startOfDay(from)) && (!to || r.dt <= endOfDay(to))).length;
    }
    const days = this.daily.get(key) ?? [];
    return days.filter((d) => (!from || d.day >= startOfDay(from)) && (!to || d.day <= endOfDay(to))).reduce((s, d) => s + d.checks, 0);
  }

  /**
   * Servers: people who closed at least `min` checks in the period, not shared logins.
   * Falls back to the Detailed Sales List when there is no daily sales report.
   */
  servers(from: Date | null, to: Date | null, min = 25): string[] {
    const keys = new Set<string>([...this.daily.keys()]);
    if (!this.p.salesByDate) this.p.sales?.forEach((r) => keys.add(this.ofReceipt(r)));
    // With a schedule, only people scheduled as servers count as servers.
    return [...keys].filter((k) => !isGeneric(k) && (!this.hasSchedule() || this.roles.get(k) === 'Server') && (this.checks(k, from, to) ?? 0) >= min).sort();
  }
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
