import { useSyncExternalStore } from 'react';
import { posItem, tableDef, tableLabel } from './menu';
import { checkTotals, fromCents, toCents } from './money';
import type { Check, CheckDiscount, LoggedEvent, OrderLine, PayMethod, Payment, PosEvent, Screen } from './types';

export interface Settings {
  /** Sales tax percent. 7.25 matches the receipts in the reference photos. */
  taxRate: number;
  /** Server name printed on checks (first word shows on floor-plan tiles). */
  serverName: string;
  /** Employee ID typed on the Log-in keypad. */
  loginId: string;
  /** Not verified on the real POS; off by default. */
}

export interface PosState {
  screen: Screen;
  section: string;
  activeCheckId: string | null;
  checks: Record<string, Check>;
  /** tableId -> open check id */
  tableChecks: Record<string, string>;
  nextCheckSeq: number;
  settings: Settings;
  /** Milliseconds added to the wall clock (scenarios set a story time). */
  clockOffset: number;
  /** Employee who last logged in on the Log-in keypad; owns new checks. */
  currentUser: string | null;
}

const STORAGE_KEY = 'janchi-pos-sim:v1';

export const defaultSettings: Settings = {
  taxRate: 7.25,
  serverName: 'Trainee',
  loginId: '1234',
};

export function initialState(settings: Settings = defaultSettings): PosState {
  return {
    screen: 'main',
    section: 'ABC',
    activeCheckId: null,
    checks: {},
    tableChecks: {},
    nextCheckSeq: 1,
    settings,
    clockOffset: 0,
    currentUser: null,
  };
}

function load(): PosState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PosState;
      return { ...initialState(), ...parsed, settings: { ...defaultSettings, ...parsed.settings } };
    }
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  return initialState();
}

let state: PosState = typeof window === 'undefined' ? initialState() : load();
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: LoggedEvent, s: PosState) => void>();
let persist = true;

function set(next: PosState) {
  state = next;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / private mode errors
    }
  }
  listeners.forEach((l) => l());
}

function emit(e: PosEvent) {
  const logged = { ...e, t: now() } as LoggedEvent;
  eventListeners.forEach((l) => l(logged, state));
}

export function getState() {
  return state;
}

export function now() {
  return Date.now() + state.clockOffset;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function onPosEvent(l: (e: LoggedEvent, s: PosState) => void) {
  eventListeners.add(l);
  return () => eventListeners.delete(l);
}

export function usePos<T>(selector: (s: PosState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

let idSeq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

function updateCheck(checkId: string, fn: (c: Check) => Check): PosState {
  const c = state.checks[checkId];
  return { ...state, checks: { ...state.checks, [checkId]: fn(c) } };
}

export function activeCheck(s: PosState = state): Check | null {
  return s.activeCheckId ? s.checks[s.activeCheckId] ?? null : null;
}

export const isTakeout = (c: Check) => c.orderType === 'takeout';

export function evenSplit(total: number, ways: number): number[] {
  const cents = toCents(total);
  const base = Math.floor(cents / ways);
  return Array.from({ length: ways }, (_, i) => fromCents(base + (i < cents - base * ways ? 1 : 0)));
}

/**
 * Even Amount Split: the share the next payment goes to. On the POS you tap a share tile to pick
 * it (they are the same amount); otherwise it is the first share still owed. -1 when not split.
 */
export function currentShare(c: Check): number {
  if (!c.splits) return -1;
  const sel = c.splitSelected;
  if (sel !== undefined && (c.splits[sel] ?? 0) > 0) return sel;
  return c.splits.findIndex((x) => x > 0);
}

/** What the next payment should be: the chosen (or next) unpaid split share, or the whole balance. */
export function dueNow(c: Check, taxRate: number): number {
  const { balance } = checkTotals(c, taxRate);
  const i = currentShare(c);
  const share = i >= 0 ? c.splits![i] : undefined;
  return share !== undefined ? Math.min(share, balance) : balance;
}

/** "Take out" for Quick Serve orders, otherwise the table name. */
export const checkPlace = (c: Check) => (isTakeout(c) ? 'Take out' : c.joinedTables ? c.joinedTables.join('&') : tableLabel(c.tableId));

/** Table map without every table this check was using (both halves of a joined W pair). */
function releaseTables(c: Check) {
  return Object.fromEntries(Object.entries(state.tableChecks).filter(([, id]) => id !== c.id));
}

/** Where the order screen goes after Order / Close / a closed check. */
const homeFor = (c: Check): Screen => (isTakeout(c) ? 'main' : 'floor');

function newCheck(tableId: string, guests: number, orderType: Check['orderType']): Check {
  return {
    id: uid('c'),
    orderType,
    // Matches the reference photos: 10-021 ... 10-034 on the same day.
    number: `10-${String(state.nextCheckSeq).padStart(3, '0')}`,
    tableId,
    server: state.currentUser ?? state.settings.serverName,
    guests,
    openedAt: now(),
    lines: [],
    voids: [],
    rounds: 0,
    payments: [],
    gratuity: 0,
    status: 'open',
  };
}

// ---- Pushback (Scenarios and Test) ------------------------------------------
// Training installs a guard: a mistake the guests or host would never allow
// (a table too small, the check before they ask for it) is refused with their
// reaction instead of going through.
export type GuardAction =
  | { type: 'seat'; tableId: string; guests: number }
  | { type: 'tender'; checkId: string }
  | { type: 'print'; checkId: string }
  | { type: 'move'; checkId: string; from: string; to: string }
  | { type: 'join'; fromCheckId: string; toCheckId: string; from: string; to: string };
export type Pushback = { who: 'Guest' | 'Host'; text: string };
let guard: ((a: GuardAction) => Pushback | null) | null = null;
let showPushback: (p: Pushback) => void = () => undefined;
export function setPosGuard(g: typeof guard) {
  guard = g;
}
export function setPushbackHandler(h: (p: Pushback) => void) {
  showPushback = h;
}
/** A guest remark that blocks nothing (e.g. "We didn't order that"). */
export function pushback(p: Pushback) {
  showPushback(p);
}
function blocked(a: GuardAction): boolean {
  const p = guard?.(a);
  if (!p) return false;
  emit({ type: 'blocked', action: a.type, who: p.who, reason: p.text });
  showPushback(p);
  return true;
}

// ---- Session-level actions -----------------------------------------------

export const actions = {
  /** Replace the whole state, e.g. when a training scenario starts. */
  reset(opts: { persist?: boolean; clockOffset?: number } = {}) {
    persist = opts.persist ?? true;
    set({ ...initialState(state.settings), clockOffset: opts.clockOffset ?? 0 });
  },

  /** Return to the saved Practice-mode session. */
  loadPractice() {
    persist = true;
    const saved = load();
    set({ ...saved, settings: state.settings, clockOffset: 0 });
  },

  updateSettings(patch: Partial<Settings>) {
    set({ ...state, settings: { ...state.settings, ...patch } });
  },

  goto(screen: Screen) {
    set({ ...state, screen, activeCheckId: screen === 'main' || screen === 'floor' || screen === 'tenderList' || screen === 'tipAdjust' ? null : state.activeCheckId });
  },

  setSection(section: string) {
    set({ ...state, section });
  },

  // ---- Tables ------------------------------------------------------------

  /** Log-in keypad accepted: this employee owns any check opened next. */
  login(name: string) {
    set({ ...state, currentUser: name });
    emit({ type: 'login', name });
  },

  seatTable(tableId: string, guests: number) {
    if (blocked({ type: 'seat', tableId, guests })) return;
    const check = newCheck(tableId, guests, 'dine-in');
    // A party of 5-8 at a W table uses it together with its neighbor (W1&2, W3&4, W5&6).
    const t = tableDef(tableId);
    const joined = t?.joinWith && guests > (t.capacity ?? 99) && !state.tableChecks[t.joinWith] ? t.joinWith : undefined;
    if (joined) check.joinedTables = [tableId, joined];
    set({
      ...state,
      checks: { ...state.checks, [check.id]: check },
      tableChecks: { ...state.tableChecks, [tableId]: check.id, ...(joined ? { [joined]: check.id } : {}) },
      nextCheckSeq: state.nextCheckSeq + 1,
      activeCheckId: check.id,
      screen: 'order',
    });
    emit({ type: 'seat', tableId, guests, checkId: check.id });
  },

  /**
   * Move/Join > Move: the check on `from` moves to the empty table `to`
   * (e.g. bar guests moving to a table for AYCE). Returns an error message, or null when done.
   */
  moveTable(from: string, to: string): string | null {
    const id = state.tableChecks[from];
    const c = id ? state.checks[id] : undefined;
    if (!c) return `Table ${tableLabel(from)} has no open check.`;
    if (state.tableChecks[to]) return `Table ${tableLabel(to)} already has a check. Choose Join to combine them, or move to an empty table.`;
    if (blocked({ type: 'move', checkId: c.id, from, to })) return '';
    const tableChecks = releaseTables(c);
    tableChecks[to] = c.id;
    set({ ...state, tableChecks, checks: { ...state.checks, [c.id]: { ...c, tableId: to, joinedTables: undefined } } });
    emit({ type: 'move-table', checkId: c.id, from, to });
    return null;
  },

  /**
   * Move/Join > Join: the check on `from` is combined into the check on `to`: items, guests
   * and voids are added to it, and `from` becomes free. The server of `to` keeps the check.
   * With 5+ guests after the join, the automatic 18% applies to the combined check.
   */
  joinTables(from: string, to: string): string | null {
    const fromId = state.tableChecks[from];
    const toId = state.tableChecks[to];
    const src = fromId ? state.checks[fromId] : undefined;
    const dst = toId ? state.checks[toId] : undefined;
    if (!src || !dst) return 'Both tables need an open check to join them.';
    if (src.id === dst.id) return 'These tables are already on one check.';
    if (src.payments.length || dst.payments.length) return 'A check with payments on it cannot be joined.';
    if (blocked({ type: 'join', fromCheckId: src.id, toCheckId: dst.id, from, to })) return '';
    const merged: Check = {
      ...dst,
      guests: dst.guests + src.guests,
      lines: [...dst.lines, ...src.lines],
      voids: [...dst.voids, ...src.voids],
      rounds: Math.max(dst.rounds, src.rounds),
      splits: undefined,
      splitShares: undefined,
    };
    const tableChecks = releaseTables(src);
    set({
      ...state,
      tableChecks,
      checks: { ...state.checks, [dst.id]: merged, [src.id]: { ...src, status: 'joined', joinedInto: dst.id, closedAt: now() } },
      activeCheckId: state.activeCheckId === src.id ? dst.id : state.activeCheckId,
    });
    emit({ type: 'join-tables', fromCheckId: src.id, toCheckId: dst.id, from, to });
    return null;
  },

  /** "This is not your order": Change Server makes the logged-in employee the check's server. */
  changeServer(checkId: string) {
    const c = state.checks[checkId];
    const name = state.currentUser;
    if (!c || !name || c.server === name) return;
    set({ ...state, checks: { ...state.checks, [checkId]: { ...c, server: name } } });
    emit({ type: 'change-server', checkId, server: name });
  },

  /** Quick Serve: a takeout order with no table. Paid later through Tender on the main screen. */
  quickServe() {
    const check = newCheck(`TO-${state.nextCheckSeq}`, 1, 'takeout');
    set({
      ...state,
      checks: { ...state.checks, [check.id]: check },
      nextCheckSeq: state.nextCheckSeq + 1,
      activeCheckId: check.id,
      screen: 'order',
    });
    emit({ type: 'quick-serve', tableId: check.tableId, checkId: check.id });
  },

  /** Open any open check on the order screen (Edit on the Tender list). */
  openCheck(checkId: string) {
    const c = state.checks[checkId];
    if (!c) return;
    if (!isTakeout(c)) return actions.openTable(c.tableId);
    set({ ...state, activeCheckId: checkId, screen: 'order' });
  },

  openTable(tableId: string) {
    const checkId = state.tableChecks[tableId];
    if (!checkId) return;
    set({ ...state, activeCheckId: checkId, screen: 'order' });
    emit({ type: 'open-table', tableId, checkId });
  },

  // ---- Order entry -------------------------------------------------------

  /** Returns the id of the line that received the item. */
  addItem(posId: string, qty = 1, modifier?: string, price?: number): string | null {
    const c = activeCheck();
    if (!c) return null;
    const item = posItem(posId);
    const unitPrice = price ?? item.price;
    const last = c.lines[c.lines.length - 1];
    let lineId: string;
    let lines: OrderLine[];
    if (last && last.status === 'new' && last.posId === posId && last.modifier === modifier && last.unitPrice === unitPrice) {
      lineId = last.id;
      lines = c.lines.map((l) => (l.id === last.id ? { ...l, qty: l.qty + qty } : l));
    } else {
      lineId = uid('l');
      lines = [...c.lines, { id: lineId, posId, qty, unitPrice, status: 'new', round: 0, modifier }];
    }
    set(updateCheck(c.id, (ch) => ({ ...ch, lines })));
    emit({ type: 'add-item', checkId: c.id, posId, qty });
    return lineId;
  },

  setLineModifier(lineId: string, modifier: string) {
    const c = activeCheck();
    if (!c) return;
    set(updateCheck(c.id, (ch) => ({ ...ch, lines: ch.lines.map((l) => (l.id === lineId ? { ...l, modifier } : l)) })));
  },

  setLineQty(lineId: string, qty: number) {
    const c = activeCheck();
    const line = c?.lines.find((l) => l.id === lineId);
    if (!c || !line || line.status !== 'new') return;
    if (qty <= 0) return actions.removeLine(lineId);
    set(updateCheck(c.id, (ch) => ({ ...ch, lines: ch.lines.map((l) => (l.id === lineId ? { ...l, qty } : l)) })));
    emit({ type: 'set-qty', checkId: c.id, posId: line.posId, from: line.qty, to: qty });
  },

  removeLine(lineId: string) {
    const c = activeCheck();
    const line = c?.lines.find((l) => l.id === lineId);
    if (!c || !line || line.status !== 'new') return;
    set(updateCheck(c.id, (ch) => ({ ...ch, lines: ch.lines.filter((l) => l.id !== lineId) })));
    emit({ type: 'remove-line', checkId: c.id, posId: line.posId, qty: line.qty });
  },

  cancelAll() {
    const c = activeCheck();
    if (!c) return;
    set(updateCheck(c.id, (ch) => ({ ...ch, lines: ch.lines.filter((l) => l.status !== 'new') })));
    emit({ type: 'cancel-all', checkId: c.id });
  },

  /** "Order": send unsent lines and return to the floor plan (or main screen for takeout). */
  submitOrder() {
    const c = activeCheck();
    if (!c) return;
    actions.sendOrder(true);
    set({ ...state, screen: homeFor(c), activeCheckId: null });
  },

  /**
   * Send unsent lines without leaving the screen. Used when Tender / Cash /
   * Credit Card is pressed before Order: the POS asks "Print Kitchen Order?"
   * and sends the items either way (No = no kitchen ticket, e.g. macarons).
   */
  sendOrder(kitchenPrint: boolean) {
    const c = activeCheck();
    if (!c) return;
    const fresh = c.lines.filter((l) => l.status === 'new');
    if (!fresh.length) return;
    const adds = fresh.filter((l) => l.qty > 0);
    // Voids (negative lines from Void / Edit) go to the kitchen with Order too.
    const voids = fresh.filter((l) => l.qty < 0);
    const round = adds.length ? c.rounds + 1 : c.rounds;
    const origRound = (v: OrderLine) => c.lines.find((l) => l.id === v.voidOf)?.round ?? 0;
    set(
      updateCheck(c.id, (ch) => ({
        ...ch,
        rounds: round,
        lines: ch.lines.map((l) => (l.status === 'new' ? { ...l, status: 'sent', round: l.qty < 0 ? origRound(l) : round } : l)),
        voids: [...ch.voids, ...voids.map((v) => ({ posId: v.posId, qty: -v.qty, round: origRound(v), at: now(), reason: v.reason }))],
      })),
    );
    if (adds.length)
      emit({
        type: 'submit',
        checkId: c.id,
        tableId: c.tableId,
        round,
        items: adds.map((l) => ({ posId: l.posId, qty: l.qty })),
        kitchenPrint,
      });
    voids.forEach((v) => emit({ type: 'void-sent', checkId: c.id, posId: v.posId, qty: -v.qty, reason: v.reason }));
  },

  /**
   * Void / Edit > − on an item already ordered: adds an unsent void line ("-1 COKE ZERO") with
   * the reason typed in. It comes off the total right away and goes to the kitchen with Order.
   * Returns an error message, or null.
   */
  addVoid(lineId: string, qty: number, reason: string): string | null {
    const c = activeCheck();
    const line = c?.lines.find((l) => l.id === lineId);
    if (!c || !line) return 'Select an item first.';
    if (line.status !== 'sent' || line.qty <= 0) return 'Only items that have been ordered are voided. Change unsent items directly.';
    const voided = c.lines.filter((l) => l.voidOf === lineId).reduce((s, l) => s - l.qty, 0);
    const n = Math.min(qty, line.qty - voided);
    if (n <= 0) return 'This item has already been voided.';
    const pending = c.lines.find((l) => l.voidOf === lineId && l.status === 'new');
    set(
      updateCheck(c.id, (ch) => ({
        ...ch,
        lines: pending
          ? ch.lines.map((l) => (l.id === pending.id ? { ...l, qty: l.qty - n } : l))
          : [...ch.lines, { id: uid('l'), posId: line.posId, qty: -n, unitPrice: line.unitPrice, status: 'new', round: 0, modifier: line.modifier, voidOf: lineId, reason }],
      })),
    );
    return null;
  },

  /** "Close" on the order screen: unsent items are discarded. */
  leaveOrderScreen() {
    const c = activeCheck();
    if (!c) return set({ ...state, screen: 'floor' });
    const fresh = c.lines.filter((l) => l.status === 'new');
    if (fresh.length) {
      emit({ type: 'discard-unsent', checkId: c.id, items: fresh.map((l) => ({ posId: l.posId, qty: l.qty })) });
    }
    const kept = c.lines.filter((l) => l.status === 'sent');
    if (kept.length === 0 && c.payments.length === 0) {
      // Nothing was ever ordered: release the table.
      const tableChecks = releaseTables(c);
      const { [c.id]: _dropped, ...checks } = state.checks;
      set({ ...state, checks, tableChecks, screen: homeFor(c), activeCheckId: null });
      return;
    }
    set({ ...updateCheck(c.id, (ch) => ({ ...ch, lines: kept })), screen: homeFor(c), activeCheckId: null });
  },

  /** Void an ordered item and send the void right away (Void / Edit, then Order). */
  voidSent(lineId: string, qty: number, reason = 'Void') {
    if (actions.addVoid(lineId, qty, reason) === null) actions.sendOrder(true);
  },

  // ---- Tender ------------------------------------------------------------

  openTender(checkId: string) {
    const c = state.checks[checkId];
    if (!c) return;
    if (blocked({ type: 'tender', checkId })) return;
    set({ ...state, activeCheckId: checkId, screen: 'tender' });
    emit({ type: 'open-tender', checkId, tableId: c.tableId });
  },

  setGratuity(amount: number) {
    const c = activeCheck();
    if (!c) return;
    set(updateCheck(c.id, (ch) => ({ ...ch, gratuity: Math.max(0, fromCents(toCents(amount))) })));
    emit({ type: 'gratuity', checkId: c.id, amount });
  },

  /** Returns the payment record (with change for cash). */
  /** Even Amount Split: divide the balance into `ways` shares (extra cents go to the first shares). */
  splitEvenly(ways: number) {
    const c = activeCheck();
    if (!c || ways < 1) return;
    const amounts = evenSplit(checkTotals(c, state.settings.taxRate).balance, ways);
    set(updateCheck(c.id, (ch) => ({ ...ch, splits: ways > 1 ? amounts : undefined, splitShares: ways > 1 ? amounts : undefined, splitSelected: undefined })));
    emit({ type: 'split', checkId: c.id, ways, amounts });
  },

  /**
   * Discount > Discount Order: one discount on the whole check (a percent or dollars off),
   * with the note typed first. A zero value removes the discount.
   */
  applyDiscount(d: CheckDiscount) {
    const c = activeCheck();
    if (!c) return;
    const keep = d.value > 0 ? d : undefined;
    set(updateCheck(c.id, (ch) => ({ ...ch, discount: keep })));
    emit({ type: 'discount', checkId: c.id, tableId: c.tableId, name: d.name, kind: d.kind, value: keep ? d.value : 0, note: d.note });
  },

  /** Tap a share tile (Even Amount Split) to pay that share next. */
  selectShare(i: number) {
    const c = activeCheck();
    if (!c?.splits || !(c.splits[i] > 0)) return;
    set(updateCheck(c.id, (ch) => ({ ...ch, splitSelected: i })));
  },

  pay(method: PayMethod, amount: number, tendered?: number) {
    const c = activeCheck();
    if (!c) return null;
    const { balance, gratuity } = checkTotals(c, state.settings.taxRate);
    const due = dueNow(c, state.settings.taxRate);
    const applied = fromCents(Math.min(toCents(amount), toCents(balance), toCents(due)));
    if (applied <= 0) return null;
    const change = method === 'cash' && tendered !== undefined ? fromCents(toCents(tendered) - toCents(applied)) : undefined;
    const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
    const payment: Payment = { id: uid('p'), method, amount: applied, tendered, change, at: now() };
    // The party tip rides along with the payments; on a split it is divided equally.
    const tipLeft = toCents(gratuity) - c.payments.reduce((s, p) => s + toCents(p.preGratuity ?? 0), 0);
    const share = currentShare(c);
    // A share paid in two parts (cash, then card) carries its part of the tip only once.
    const tipShare =
      share >= 0
        ? toCents(evenSplit(gratuity, c.splits!.length)[share]) - c.payments.filter((p) => p.share === share).reduce((s, p) => s + toCents(p.preGratuity ?? 0), 0)
        : tipLeft;
    const pre = Math.max(0, Math.min(tipShare, tipLeft, toCents(applied)));
    if (pre > 0) payment.preGratuity = fromCents(pre);
    if (share >= 0) payment.share = share;
    if (method === 'credit') {
      payment.approvalNo = digits(5) + 'ABCDEF'[Math.floor(Math.random() * 6)];
      payment.troutD = digits(7);
      payment.cardLast4 = digits(4);
    }
    // With a split, the payment goes to the chosen share (or the first one still owed).
    let splits = c.splits;
    if (splits && share >= 0) splits = splits.map((x, j) => (j === share ? fromCents(Math.max(0, toCents(x) - toCents(applied))) : x));
    set(updateCheck(c.id, (ch) => ({ ...ch, payments: [...ch.payments, payment], splits })));
    emit({ type: 'payment', checkId: c.id, tableId: c.tableId, method, amount: applied, tendered, change });
    return payment;
  },

  /** Tip Adjustments > Credit Gratuity: record the tip the guest wrote on the signed slip. */
  adjustTip(checkId: string, paymentId: string, tip: number) {
    const c = state.checks[checkId];
    if (!c) return;
    const t = fromCents(Math.max(0, toCents(tip)));
    set(updateCheck(checkId, (ch) => ({ ...ch, payments: ch.payments.map((p) => (p.id === paymentId ? { ...p, tip: t } : p)) })));
    emit({ type: 'tip-adjust', checkId, tableId: c.tableId, paymentId, tip: t });
  },

  /** Print a check: the active one (tender screen) or a given one (Dine-in printer mode). */
  print(checkId?: string): boolean {
    const c = checkId ? state.checks[checkId] : activeCheck();
    if (!c) return false;
    if (blocked({ type: 'print', checkId: c.id })) return false;
    emit({ type: 'print', checkId: c.id });
    return true;
  },

  /** "Close" on the tender screen. Closes the check only when fully paid. */
  leaveTender(): 'closed' | 'unpaid' {
    const c = activeCheck();
    if (!c) {
      set({ ...state, screen: 'floor' });
      return 'unpaid';
    }
    const { balance } = checkTotals(c, state.settings.taxRate);
    if (toCents(balance) <= 0 && c.lines.some((l) => l.status === 'sent')) {
      const tableChecks = releaseTables(c);
      set({
        ...updateCheck(c.id, (ch) => ({ ...ch, status: 'closed', closedAt: now() })),
        tableChecks,
        screen: homeFor(c),
        activeCheckId: null,
      });
      emit({ type: 'close-check', checkId: c.id, tableId: c.tableId });
      return 'closed';
    }
    emit({ type: 'leave-tender-unpaid', checkId: c.id, tableId: c.tableId, balance });
    set({ ...state, screen: 'order' });
    return 'unpaid';
  },
};
