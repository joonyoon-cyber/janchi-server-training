import { useSyncExternalStore } from 'react';
import { posItem } from './menu';
import { checkTotals, fromCents, toCents } from './money';
import type { Check, LoggedEvent, OrderLine, PayMethod, PosEvent, Screen } from './types';

export interface Settings {
  /** Sales tax percent. 7.25 matches the receipts in the reference photos. */
  taxRate: number;
  serverName: string;
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
}

const STORAGE_KEY = 'janchi-pos-sim:v1';

export const defaultSettings: Settings = {
  taxRate: 7.25,
  serverName: 'TRAINEE',
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
    nextCheckSeq: 101,
    settings,
    clockOffset: 0,
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
    set({ ...state, screen, activeCheckId: screen === 'main' || screen === 'floor' ? null : state.activeCheckId });
  },

  setSection(section: string) {
    set({ ...state, section });
  },

  // ---- Tables ------------------------------------------------------------

  seatTable(tableId: string, guests: number) {
    const id = uid('c');
    const month = new Date(now()).getMonth() + 1;
    const check: Check = {
      id,
      number: `${month}-${String(state.nextCheckSeq).padStart(3, '0')}`,
      tableId,
      server: state.settings.serverName,
      guests,
      openedAt: now(),
      lines: [],
      voids: [],
      rounds: 0,
      payments: [],
      gratuity: 0,
      status: 'open',
    };
    set({
      ...state,
      checks: { ...state.checks, [id]: check },
      tableChecks: { ...state.tableChecks, [tableId]: id },
      nextCheckSeq: state.nextCheckSeq + 1,
      activeCheckId: id,
      screen: 'order',
    });
    emit({ type: 'seat', tableId, guests, checkId: id });
  },

  openTable(tableId: string) {
    const checkId = state.tableChecks[tableId];
    if (!checkId) return;
    set({ ...state, activeCheckId: checkId, screen: 'order' });
    emit({ type: 'open-table', tableId, checkId });
  },

  // ---- Order entry -------------------------------------------------------

  /** Returns the id of the line that received the item. */
  addItem(posId: string, qty = 1, modifier?: string): string | null {
    const c = activeCheck();
    if (!c) return null;
    const item = posItem(posId);
    const last = c.lines[c.lines.length - 1];
    let lineId: string;
    let lines: OrderLine[];
    if (last && last.status === 'new' && last.posId === posId && last.modifier === modifier) {
      lineId = last.id;
      lines = c.lines.map((l) => (l.id === last.id ? { ...l, qty: l.qty + qty } : l));
    } else {
      lineId = uid('l');
      lines = [...c.lines, { id: lineId, posId, qty, unitPrice: item.price, status: 'new', round: 0, modifier }];
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

  /** "Order": send unsent lines and return to the floor plan. */
  submitOrder() {
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
      });
    }
    set({ ...state, screen: 'floor', activeCheckId: null });
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
      set({ ...state, checks, tableChecks, screen: 'floor', activeCheckId: null });
      return;
    }
    set({ ...updateCheck(c.id, (ch) => ({ ...ch, lines: kept })), screen: 'floor', activeCheckId: null });
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
  pay(method: PayMethod, amount: number, tendered?: number) {
    const c = activeCheck();
    if (!c) return null;
    const { balance } = checkTotals(c, state.settings.taxRate);
    const applied = fromCents(Math.min(toCents(amount), toCents(balance)));
    if (applied <= 0) return null;
    const change = method === 'cash' && tendered !== undefined ? fromCents(toCents(tendered) - toCents(applied)) : undefined;
    const payment = { id: uid('p'), method, amount: applied, tendered, change, at: now() };
    set(updateCheck(c.id, (ch) => ({ ...ch, payments: [...ch.payments, payment] })));
    emit({ type: 'payment', checkId: c.id, tableId: c.tableId, method, amount: applied, tendered, change });
    return payment;
  },

  print() {
    const c = activeCheck();
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
        screen: 'floor',
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
