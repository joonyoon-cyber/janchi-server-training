import { useSyncExternalStore } from 'react';
import { posItem, tableLabel } from './menu';
import { checkTotals, fromCents, toCents } from './money';
import type { Check, LoggedEvent, OrderLine, PayMethod, Payment, PosEvent, Screen } from './types';

export interface Settings {
  /** Sales tax percent. 7.25 matches the receipts in the reference photos. */
  taxRate: number;
  /** Server name printed on checks (first word shows on floor-plan tiles). */
  serverName: string;
  /** Employee ID typed on the Log-in keypad. */
  loginId: string;
  /** Not verified on the real POS; off by default. */
  requireManagerForVoid: boolean;
  managerPin: string;
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
  requireManagerForVoid: false,
  managerPin: '1234',
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

/** What the next payment should be: the next unpaid split share, or the whole balance. */
export function dueNow(c: Check, taxRate: number): number {
  const { balance } = checkTotals(c, taxRate);
  const share = c.splits?.find((x) => x > 0);
  return share !== undefined ? Math.min(share, balance) : balance;
}

/** "Take out" for Quick Serve orders, otherwise the table name. */
export const checkPlace = (c: Check) => (isTakeout(c) ? 'Take out' : tableLabel(c.tableId));

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
    const check = newCheck(tableId, guests, 'dine-in');
    set({
      ...state,
      checks: { ...state.checks, [check.id]: check },
      tableChecks: { ...state.tableChecks, [tableId]: check.id },
      nextCheckSeq: state.nextCheckSeq + 1,
      activeCheckId: check.id,
      screen: 'order',
    });
    emit({ type: 'seat', tableId, guests, checkId: check.id });
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

  /** Open any open check on the order screen (Edit on the Tender list, Recall). */
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
    if (fresh.length > 0) {
      const round = c.rounds + 1;
      set(
        updateCheck(c.id, (ch) => ({
          ...ch,
          rounds: round,
          lines: ch.lines.map((l) => (l.status === 'new' ? { ...l, status: 'sent', round } : l)),
        })),
      );
      emit({
        type: 'submit',
        checkId: c.id,
        tableId: c.tableId,
        round,
        items: fresh.map((l) => ({ posId: l.posId, qty: l.qty })),
        kitchenPrint,
      });
    }
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
      const { [c.tableId]: _released, ...tableChecks } = state.tableChecks;
      const { [c.id]: _dropped, ...checks } = state.checks;
      set({ ...state, checks, tableChecks, screen: homeFor(c), activeCheckId: null });
      return;
    }
    set({ ...updateCheck(c.id, (ch) => ({ ...ch, lines: kept })), screen: homeFor(c), activeCheckId: null });
  },

  voidSent(lineId: string, qty: number) {
    const c = activeCheck();
    const line = c?.lines.find((l) => l.id === lineId);
    if (!c || !line || line.status !== 'sent') return;
    const n = Math.min(qty, line.qty);
    set(
      updateCheck(c.id, (ch) => ({
        ...ch,
        lines: ch.lines
          .map((l) => (l.id === lineId ? { ...l, qty: l.qty - n } : l))
          .filter((l) => l.qty > 0),
        voids: [...ch.voids, { posId: line.posId, qty: n, round: line.round, at: now() }],
      })),
    );
    emit({ type: 'void-sent', checkId: c.id, posId: line.posId, qty: n });
  },

  // ---- Tender ------------------------------------------------------------

  openTender(checkId: string) {
    const c = state.checks[checkId];
    if (!c) return;
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
    set(updateCheck(c.id, (ch) => ({ ...ch, splits: ways > 1 ? amounts : undefined })));
    emit({ type: 'split', checkId: c.id, ways, amounts });
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
    const share = c.splits ? c.splits.findIndex((x) => x > 0) : -1;
    const tipShare = share >= 0 ? toCents(evenSplit(gratuity, c.splits!.length)[share]) : tipLeft;
    const pre = Math.max(0, Math.min(tipShare, tipLeft, toCents(applied)));
    if (pre > 0) payment.preGratuity = fromCents(pre);
    if (method === 'credit') {
      payment.approvalNo = digits(5) + 'ABCDEF'[Math.floor(Math.random() * 6)];
      payment.troutD = digits(7);
      payment.cardLast4 = digits(4);
    }
    // With a split, the payment goes to the first share that is still owed.
    let splits = c.splits;
    if (splits) {
      const i = splits.findIndex((x) => x > 0);
      if (i >= 0) splits = splits.map((x, j) => (j === i ? fromCents(Math.max(0, toCents(x) - toCents(applied))) : x));
    }
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
  print(checkId?: string) {
    const c = checkId ? state.checks[checkId] : activeCheck();
    if (c) emit({ type: 'print', checkId: c.id });
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
      const { [c.tableId]: _released, ...tableChecks } = state.tableChecks;
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
