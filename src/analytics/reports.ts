import { readWorkbook, type Cell, type Sheet } from './xlsx';

// ---- Values -------------------------------------------------------------------

export function num(v: Cell | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function str(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** POS times are local wall-clock times. Every Date here is built from local components. */
export function parseDate(v: Cell | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Excel serial date (days since 1899-12-30), read as wall-clock time.
    if (v < 20000 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400000);
    const u = new Date(ms);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
  }
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i.exec(s);
  if (m) {
    let h = +(m[4] ?? 0);
    const ap = m[7]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return new Date(+m[3], +m[1] - 1, +m[2], h, +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Same person across reports: upper case, middle initials and extra spaces dropped. */
export function personKey(name: string): string {
  return name
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(' ');
}

const RECEIPT = /^\d{10,}$/;

// ---- Records ------------------------------------------------------------------

export interface SaleLine {
  receipt: string;
  menu: string;
  price: number;
  qty: number;
  unitPrice: number;
  amount: number;
  emp: string;
}
export interface Receipt {
  receipt: string;
  dt: Date;
  table: string;
  persons: number;
  /** "Total order amount": food and drink before tax and tip. */
  subtotal: number;
  orderDiscount: number;
  tax: number;
  tip: number;
  total: number;
  cash: number;
  card: number;
  other: number;
  /** Employee (first name in this report) who rang most of the lines. */
  emp: string;
  lines: SaleLine[];
}
export interface TipRow {
  emp: string;
  added: Date;
  receipt: string;
  cash: number;
  card: number;
  total: number;
}
export interface DailySales {
  day: Date;
  emp: string;
  checks: number;
  cash: number;
  card: number;
  tip: number;
  total: number;
}
export interface CancelRow {
  check: string;
  placed: Date;
  cancelled: Date | null;
  table: string;
  menu: string;
  qty: number;
  unitPrice: number;
  amount: number;
  placedBy: string;
  canceledBy: string;
}
export interface VoidRow {
  receipt: string;
  dt: Date;
  menu: string;
  qty: number;
  amount: number;
  cash: number;
  card: number;
  emp: string;
  reason: string;
}
export interface DiscountTicket {
  ticket: string;
  placed: Date;
  table: string;
  items: { menu: string; amount: number }[];
  itemsAmount: number;
  name: string;
  amount: number;
  note: string;
  placedBy: string;
  approval: string;
}
export interface PriceChange {
  dt: Date;
  item: string;
  before: number;
  after: number;
  emp: string;
  receipt: string;
  reason: string;
}
export interface Punch {
  emp: string;
  in: Date;
  out: Date | null;
  rawIn: Date | null;
  rawOut: Date | null;
  edited: boolean;
  note: string;
  workHours: number;
}

/** One scheduled shift from the weekly schedule workbook. */
export interface ScheduledShift {
  /** Name as written on the schedule (often a first name). */
  name: string;
  /** Row group: Server, Food runner / Busser, Host, Bartender… */
  role: string;
  /** Role for this shift ("H)5:00-9:00" = working as Host). */
  shiftRole: string;
  day: Date;
  meal: 'Lunch' | 'Dinner';
  start: Date;
  /** Null for shifts "until close" (C). */
  end: Date | null;
  raw: string;
  week: string;
}

// ---- Report kinds ---------------------------------------------------------------

export type Kind = 'sales' | 'tips' | 'salesByDate' | 'cancels' | 'voids' | 'discounts' | 'priceChanges' | 'timecard' | 'schedule';
export type ExtraKind = 'salesSummary' | 'salesByEmployee' | 'personOrdering';

export const REPORTS: { kind: Kind; title: string; what: string }[] = [
  { kind: 'timecard', title: 'Time Card', what: 'Clock-ins and clock-outs' },
  { kind: 'schedule', title: 'Shift schedule', what: 'Weekly schedule workbook (one tab per week): roles and shifts' },
  { kind: 'sales', title: 'Detailed Sales List', what: 'Every item on every check, with tips and payments' },
  { kind: 'tips', title: 'Employee Tips', what: 'Tips per check and who they went to' },
  { kind: 'salesByDate', title: 'Sales Record by Employee Date', what: 'Checks, cash and card sales per person per day' },
  { kind: 'cancels', title: 'Cancelled Order Details', what: 'Items taken off orders' },
  { kind: 'voids', title: 'Void Detail', what: 'Paid checks that were voided' },
  { kind: 'discounts', title: 'Sales Discount Report', what: 'Discounts and their notes' },
  { kind: 'priceChanges', title: 'Item Price Change History', what: 'Prices changed on the POS' },
];

/** Exports that are recognized but not needed (their data is in the reports above). */
export const EXTRA_REPORTS: { kind: ExtraKind; title: string; why: string }[] = [
  { kind: 'salesSummary', title: 'Detailed Sales List 2', why: 'Same check totals as Detailed Sales List.' },
  { kind: 'salesByEmployee', title: 'Sales Record by Employee', why: 'Same totals as Sales Record by Employee Date, without the days.' },
  { kind: 'personOrdering', title: 'Sales Record by Person Ordering', why: 'Same items as Detailed Sales List, without checks or times.' },
];

export interface Parsed {
  sales?: Receipt[];
  tips?: TipRow[];
  salesByDate?: DailySales[];
  cancels?: CancelRow[];
  voids?: VoidRow[];
  discounts?: DiscountTicket[];
  priceChanges?: PriceChange[];
  timecard?: Punch[];
  schedule?: ScheduledShift[];
}

export interface LoadedFile {
  fileName: string;
  kind: Kind | ExtraKind | null;
  title: string;
  rows: number;
  from: Date | null;
  to: Date | null;
  error?: string;
}

// ---- Table helpers ----------------------------------------------------------------

type Row = Cell[];
interface Table {
  rows: Row[];
  col: (name: string) => number;
}

/** Find the header row (the first one containing all `need` names) and index its columns. */
function table(rows: Row[], need: string[]): Table {
  const norm = (c: Cell) => str(c).toLowerCase();
  const h = rows.findIndex((r) => need.every((n) => r.some((c) => norm(c) === n.toLowerCase())));
  if (h < 0) throw new Error(`Could not find the columns ${need.join(', ')}.`);
  const header = rows[h].map(norm);
  return {
    rows: rows.slice(h + 1),
    col: (name: string) => header.indexOf(name.toLowerCase()),
  };
}

function range(ds: (Date | null)[]): [Date | null, Date | null] {
  let a: Date | null = null;
  let b: Date | null = null;
  for (const d of ds) {
    if (!d) continue;
    if (!a || d < a) a = d;
    if (!b || d > b) b = d;
  }
  return [a, b];
}

// ---- Parsers ---------------------------------------------------------------------

function parseSales(rows: Row[]): Receipt[] {
  const t = table(rows, ['Date / Time', 'Receipt Number', 'Menu Name']);
  const c = (n: string) => t.col(n);
  const iDt = c('Date / Time'), iRc = c('Receipt Number'), iTb = c('Table'), iPs = c('Persons'), iMenu = c('Menu Name'), iPrice = c('Price'), iQty = c('Qty');
  const iUnit = c('Unit Price'), iAmt = c('Amount'), iSub = c('Total order amount'), iDo = c('Discount Order'), iTax = c('Tax'), iTip = c('Tip');
  const iTot = c('Total Amount'), iCash = c('Cash'), iCredit = c('Credit'), iDebit = c('Debit'), iEmp = c('Employee');
  const others = ['Gift Certificate', 'House Account', 'Point', 'Wechat', 'Alipay', 'User payment', 'Others', 'Check'].map(c).filter((i) => i >= 0);
  const out = new Map<string, Receipt>();
  for (const r of t.rows) {
    const receipt = str(r[iRc]);
    if (!RECEIPT.test(receipt)) continue;
    const dt = parseDate(r[iDt]);
    if (!dt) continue;
    let rc = out.get(receipt);
    if (!rc) {
      rc = { receipt, dt, table: str(r[iTb]), persons: num(r[iPs]), subtotal: 0, orderDiscount: 0, tax: 0, tip: 0, total: 0, cash: 0, card: 0, other: 0, emp: '', lines: [] };
      out.set(receipt, rc);
    }
    if (r[iTot] !== null && r[iTot] !== undefined && rc.total === 0 && rc.lines.length === 0) {
      rc.subtotal = num(r[iSub]);
      rc.orderDiscount = num(r[iDo]);
      rc.tax = num(r[iTax]);
      rc.tip = num(r[iTip]);
      rc.total = num(r[iTot]);
      rc.cash = num(r[iCash]);
      rc.card = num(r[iCredit]) + (iDebit >= 0 ? num(r[iDebit]) : 0);
      rc.other = others.reduce((s, i) => s + num(r[i]), 0);
    }
    rc.lines.push({ receipt, menu: str(r[iMenu]), price: num(r[iPrice]), qty: num(r[iQty]), unitPrice: num(r[iUnit]), amount: num(r[iAmt]), emp: str(r[iEmp]) });
  }
  for (const rc of out.values()) {
    const count = new Map<string, number>();
    rc.lines.forEach((l) => l.emp && count.set(l.emp, (count.get(l.emp) ?? 0) + 1));
    rc.emp = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }
  return [...out.values()];
}

function parseTips(rows: Row[]): TipRow[] {
  const t = table(rows, ['Employee', 'Date Added', 'Receipt No.']);
  const [iE, iD, iR, iC, iCard, iT] = ['Employee', 'Date Added', 'Receipt No.', 'Cash', 'Card', 'Total'].map(t.col);
  const out: TipRow[] = [];
  for (const r of t.rows) {
    const receipt = str(r[iR]);
    const added = parseDate(r[iD]);
    if (!RECEIPT.test(receipt) || !added || !str(r[iE])) continue;
    out.push({ emp: str(r[iE]), added, receipt, cash: num(r[iC]), card: num(r[iCard]), total: num(r[iT]) });
  }
  return out;
}

function parseSalesByDate(rows: Row[]): DailySales[] {
  const t = table(rows, ['Date', 'Employee', '# of Sales']);
  const [iD, iE, iN, iCash, iCredit, iDebit, iTip, iTot] = ['Date', 'Employee', '# of Sales', 'Cash', 'Credit', 'Debit', 'Tip', 'Total'].map(t.col);
  const out: DailySales[] = [];
  for (const r of t.rows) {
    const day = /^\d{8}$/.test(str(r[iD])) ? parseDate(str(r[iD])) : null;
    if (!day || !str(r[iE])) continue;
    out.push({ day, emp: str(r[iE]), checks: num(r[iN]), cash: num(r[iCash]), card: num(r[iCredit]) + num(r[iDebit]), tip: num(r[iTip]), total: num(r[iTot]) });
  }
  return out;
}

function parseCancels(rows: Row[]): CancelRow[] {
  const t = table(rows, ['Check No', 'Placed Order Time', 'Menu']);
  const [iC, iP, iX, iT, iM, iQ, iU, iA, iPb, iCb] = ['Check No', 'Placed Order Time', 'Order Cancelled time', 'Table Name', 'Menu', 'Qty', 'Unit Price', 'Amount', 'Placed by', 'Canceled by'].map(t.col);
  const out: CancelRow[] = [];
  let check = '';
  let cancelled: Date | null = null;
  for (const r of t.rows) {
    const placed = parseDate(r[iP]);
    if (!placed || !str(r[iM])) continue;
    // Continuation lines leave the check number and cancel time blank.
    if (RECEIPT.test(str(r[iC]))) {
      check = str(r[iC]);
      cancelled = parseDate(r[iX]);
    } else if (parseDate(r[iX])) cancelled = parseDate(r[iX]);
    out.push({ check, placed, cancelled, table: str(r[iT]), menu: str(r[iM]), qty: num(r[iQ]), unitPrice: num(r[iU]), amount: num(r[iA]), placedBy: str(r[iPb]), canceledBy: str(r[iCb]) });
  }
  return out;
}

function parseVoids(rows: Row[]): VoidRow[] {
  const t = table(rows, ['Date', 'Receipt Number', 'Menu Name']);
  const [iD, iR, iM, iQ, iA, iCash, iCard, iE, iRe] = ['Date', 'Receipt Number', 'Menu Name', 'Qty', 'Amount', 'Cash', 'Card', 'Employee', 'Reason'].map(t.col);
  const out: VoidRow[] = [];
  let receipt = '';
  for (const r of t.rows) {
    const dt = parseDate(r[iD]);
    if (!dt || !str(r[iM])) continue;
    if (RECEIPT.test(str(r[iR]))) receipt = str(r[iR]);
    out.push({ receipt, dt, menu: str(r[iM]), qty: num(r[iQ]), amount: num(r[iA]), cash: num(r[iCash]), card: num(r[iCard]), emp: str(r[iE]), reason: str(r[iRe]) });
  }
  return out;
}

function parseDiscounts(rows: Row[]): DiscountTicket[] {
  const t = table(rows, ['Ticket No.', 'Placed Order Time', 'Menu']);
  const [iT, iP, iTb, iM, iOa, iIda, iDn, iDa, iNote, iPb, iAp, iDin] = [
    'Ticket No.', 'Placed Order Time', 'Table', 'Menu', 'Order Amount', 'Item Discount Amount', 'Discount Order Name', 'Order Discount Amount', 'Note', 'Placed by', 'Manager Approval', 'Discount Item Name',
  ].map(t.col);
  const out = new Map<string, DiscountTicket>();
  let ticket = '';
  for (const r of t.rows) {
    const placed = parseDate(r[iP]);
    if (!placed || !str(r[iM])) continue;
    if (RECEIPT.test(str(r[iT]))) ticket = str(r[iT]);
    let d = out.get(ticket);
    if (!d) {
      d = { ticket, placed, table: str(r[iTb]), items: [], itemsAmount: 0, name: '', amount: 0, note: '', placedBy: str(r[iPb]), approval: '' };
      out.set(ticket, d);
    }
    const amt = num(r[iOa]);
    d.items.push({ menu: str(r[iM]), amount: amt });
    d.itemsAmount += amt;
    d.amount = Math.max(d.amount, num(r[iDa]));
    if (num(r[iIda]) > 0 && !(num(r[iDa]) > 0)) d.amount += num(r[iIda]);
    d.name ||= str(r[iDn]) || (iDin >= 0 ? str(r[iDin]) : '');
    d.note ||= str(r[iNote]);
    d.approval ||= str(r[iAp]);
  }
  return [...out.values()];
}

function parsePriceChanges(rows: Row[]): PriceChange[] {
  const t = table(rows, ['Item Name', 'Value before change', 'Value after change']);
  const [iI, iB, iA, iE, iR, iD, iRe] = ['Item Name', 'Value before change', 'Value after change', 'Employee', 'Receipt Number', 'Date', 'Reason'].map(t.col);
  const out: PriceChange[] = [];
  for (const r of t.rows) {
    const dt = parseDate(r[iD]);
    if (!dt || !str(r[iI])) continue;
    out.push({ dt, item: str(r[iI]), before: num(r[iB]), after: num(r[iA]), emp: str(r[iE]), receipt: str(r[iR]), reason: str(r[iRe]) });
  }
  return out;
}

function parseTimecard(rows: Row[]): Punch[] {
  const t = table(rows, ['Employee', 'Clock In', 'Clock Out']);
  const [iE, iIn, iEin, iOut, iEout, iNote, iTot] = ['Employee', 'Clock In', 'Edited Clock In', 'Clock Out', 'Edited Clock Out', 'Edited Note', 'Total Work Time'].map(t.col);
  const out: Punch[] = [];
  for (const r of t.rows) {
    const emp = str(r[iE]);
    const rawIn = parseDate(r[iIn]);
    const eIn = iEin >= 0 ? parseDate(r[iEin]) : null;
    if (!emp || !(rawIn || eIn)) continue;
    const rawOut = parseDate(r[iOut]);
    const eOut = iEout >= 0 ? parseDate(r[iEout]) : null;
    const inT = eIn ?? rawIn!;
    out.push({
      emp,
      in: inT,
      out: eOut ?? rawOut,
      rawIn,
      rawOut,
      edited: (!!eIn && +eIn !== +(rawIn ?? 0)) || (!!eOut && +eOut !== +(rawOut ?? 0)),
      note: iNote >= 0 ? str(r[iNote]) : '',
      workHours: num(r[iTot]),
    });
  }
  return out;
}

// ---- Shift schedule workbook ----------------------------------------------------------

const ROLE_CODES: Record<string, string> = { H: 'Host', S: 'Server', B: 'Bartender', F: 'Food runner / Busser', R: 'Food runner / Busser' };

function roleName(raw: string): string {
  const r = raw.replace(/\s+/g, ' ').trim();
  if (/F\/R|BUSS|RUNNER/i.test(r)) return 'Food runner / Busser';
  if (/SERV/i.test(r)) return 'Server';
  if (/HOST/i.test(r)) return 'Host';
  if (/BAR/i.test(r)) return 'Bartender';
  return r;
}

/**
 * Times on the schedule have no AM/PM ("11:00-4:00", "4:00-C"). Starts at 10-11 are morning,
 * 12 is noon, 1-6 afternoon/evening; 7-9 are morning on the lunch side and evening on the dinner side.
 * The end is the first matching time after the start. "C" means until close.
 */
export function parseShift(text: string, day: Date, meal: 'Lunch' | 'Dinner'): { start: Date; end: Date | null; role: string | null } | null {
  let t = text.trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  let role: string | null = null;
  const pre = /^([A-Z]{1,2})\)/.exec(t);
  if (pre) {
    role = ROLE_CODES[pre[1][0]] ?? null;
    t = t.slice(pre[0].length);
  }
  const m = /^(\d{1,2})(?::(\d{2}))?(AM|PM|A|P)?[-–~TO]+(?:(\d{1,2})(?::(\d{2}))?(AM|PM|A|P)?|(C|CL|CLOSE|CLOSING))$/.exec(t);
  if (!m) return null;
  const at = (h: number, min: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min);
  let sh = +m[1];
  const smin = +(m[2] ?? 0);
  if (m[3]) {
    if (m[3][0] === 'P' && sh < 12) sh += 12;
    if (m[3][0] === 'A' && sh === 12) sh = 0;
  } else if (sh >= 1 && sh <= 6) sh += 12;
  else if (sh >= 7 && sh <= 9 && meal === 'Dinner') sh += 12;
  const start = at(sh, smin);
  if (m[7]) return { start, end: null, role };
  let eh = +m[4];
  const emin = +(m[5] ?? 0);
  if (m[6]) {
    if (m[6][0] === 'P' && eh < 12) eh += 12;
    if (m[6][0] === 'A' && eh === 12) eh = 0;
    return { start, end: at(eh, emin), role };
  }
  let end = at(eh % 12, emin);
  while (end <= start) end = new Date(+end + 12 * 3600000);
  return { start, end, role };
}

/** A workbook is a schedule when a tab has a "Name" header followed by Lunch/Dinner columns. */
function looksLikeSchedule(sheets: Sheet[]): boolean {
  return sheets.some((sh) => {
    const i = sh.rows.findIndex((r) => r.some((c) => str(c).toLowerCase() === 'name'));
    return i >= 0 && sh.rows.slice(i, i + 3).some((r) => r.some((c) => /^lunch$/i.test(str(c))) && r.some((c) => /^dinner$/i.test(str(c))));
  });
}

function parseSchedule(sheets: Sheet[]): ScheduledShift[] {
  const out: ScheduledShift[] = [];
  for (const sh of sheets) {
    const rows = sh.rows;
    const hi = rows.findIndex((r) => r.some((c) => str(c).toLowerCase() === 'name'));
    if (hi < 0) continue;
    const iName = rows[hi].findIndex((c) => str(c).toLowerCase() === 'name');
    const mi = rows.findIndex((r, i) => i >= hi && i <= hi + 2 && r.some((c) => /^(lunch|dinner)$/i.test(str(c))));
    if (mi < 0) continue;
    // Dates sit in the header row, one per day, above its Lunch column (cells are merged across Lunch/Dinner).
    const cols: { c: number; day: Date; meal: 'Lunch' | 'Dinner' }[] = [];
    let day: Date | null = null;
    for (let c = iName + 1; c < Math.max(rows[hi].length, rows[mi].length); c++) {
      const d = parseDate(rows[hi][c] ?? null);
      if (d) day = d;
      const label = str(rows[mi][c] ?? null);
      if (/^lunch$/i.test(label) || /^dinner$/i.test(label)) {
        if (day) cols.push({ c, day, meal: /^lunch$/i.test(label) ? 'Lunch' : 'Dinner' });
      } else if (label || str(rows[hi][c] ?? null)) {
        if (!d) break; // "Shifts", "SIGN" and other summary columns
      }
    }
    let role = '';
    for (let r = mi + 1; r < rows.length; r++) {
      const row = rows[r];
      const roleCell = iName > 0 ? str(row[iName - 1] ?? null) : '';
      if (roleCell) role = roleName(roleCell);
      const name = str(row[iName] ?? null);
      if (!name || /^(name|total|notes?)$/i.test(name)) continue;
      for (const { c, day: d, meal } of cols) {
        const raw = str(row[c] ?? null);
        if (!raw) continue;
        const p = parseShift(raw, d, meal);
        if (!p) continue;
        out.push({ name: name.replace(/\s+/g, ' '), role, shiftRole: p.role ?? role, day: d, meal, start: p.start, end: p.end, raw, week: sh.name });
      }
    }
  }
  return out;
}

// ---- Detection and loading -----------------------------------------------------------

function kindOf(title: string): Kind | ExtraKind | null {
  const t = title.trim().toLowerCase();
  for (const x of EXTRA_REPORTS) if (t === x.title.toLowerCase()) return x.kind;
  for (const x of REPORTS) if (t === x.title.toLowerCase()) return x.kind;
  return null;
}

/** Read one export, recognize it by the title in its first cell, and parse it. */
export function loadReport(fileName: string, data: ArrayBuffer | Uint8Array, into: Parsed): LoadedFile {
  let sheets: Sheet[];
  try {
    sheets = readWorkbook(data);
  } catch (e) {
    return { fileName, kind: null, title: '', rows: 0, from: null, to: null, error: e instanceof Error ? e.message : String(e) };
  }
  const rows: Cell[][] = sheets[0].rows;
  const title = str(rows[0]?.find((c) => str(c)) ?? null);
  if (!kindOf(title) && looksLikeSchedule(sheets)) {
    const v = parseSchedule(sheets);
    if (!v.length) return { fileName, kind: 'schedule', title: 'Shift schedule', rows: 0, from: null, to: null, error: 'No shifts found in this schedule.' };
    into.schedule = v;
    const [from, to] = range(v.map((x) => x.day));
    return { fileName, kind: 'schedule', title: 'Shift schedule', rows: v.length, from, to };
  }
  const kind = kindOf(title);
  const base = { fileName, kind, title, rows: 0, from: null, to: null };
  if (!kind) return { ...base, error: `Not a report this page uses ("${title || 'no title'}").` };
  try {
    let dates: (Date | null)[] = [];
    let n = 0;
    switch (kind) {
      case 'sales': {
        const v = parseSales(rows);
        into.sales = v;
        dates = v.map((x) => x.dt);
        n = v.length;
        break;
      }
      case 'tips': {
        const v = parseTips(rows);
        into.tips = v;
        dates = v.map((x) => x.added);
        n = v.length;
        break;
      }
      case 'salesByDate': {
        const v = parseSalesByDate(rows);
        into.salesByDate = v;
        dates = v.map((x) => x.day);
        n = v.length;
        break;
      }
      case 'cancels': {
        const v = parseCancels(rows);
        into.cancels = v;
        dates = v.map((x) => x.placed);
        n = v.length;
        break;
      }
      case 'voids': {
        const v = parseVoids(rows);
        into.voids = v;
        dates = v.map((x) => x.dt);
        n = v.length;
        break;
      }
      case 'discounts': {
        const v = parseDiscounts(rows);
        into.discounts = v;
        dates = v.map((x) => x.placed);
        n = v.length;
        break;
      }
      case 'priceChanges': {
        const v = parsePriceChanges(rows);
        into.priceChanges = v;
        dates = v.map((x) => x.dt);
        n = v.length;
        break;
      }
      case 'timecard': {
        const v = parseTimecard(rows);
        into.timecard = v;
        dates = v.map((x) => x.in);
        n = v.length;
        break;
      }
      default:
        return { ...base, rows: rows.length };
    }
    const [from, to] = range(dates);
    return { ...base, rows: n, from, to };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}
