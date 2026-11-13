// ---- Reference data -------------------------------------------------------

export interface PosCategory {
  id: string;
  label: string;
  color: string;
  /** Page of the menu-group column (▲ / ▼ switch pages). */
  page: number;
}

export interface PosItem {
  id: string;
  label: string;
  category: string;
  page: number;
  /** 1-based grid row (8 rows per page). */
  row: number;
  /** 1-based grid column (4 columns). */
  col: number;
  price: number;
  number?: number;
  color?: string;
  /** Counts toward the AYCE "4 meat items per order per table" limit. */
  countsAsMeat?: boolean;
  /** The real button shows the small modifier icon in its corner. */
  modifierIcon?: boolean;
  /** Price is typed on the Open Price pad when rung in (gift certificates). */
  openPrice?: boolean;
  /** Not taxed (gift certificates). */
  taxExempt?: boolean;
  /** Paid add-on on the AYCE MEAT page (Beef Tongue 6oz, Scallop 8pcs); not part of the 4-meat limit. */
  addOn?: boolean;
  /** The server serves this AYCE item themselves (rice, salad, sauces, soups). */
  serverServed?: boolean;
  /** Needs no kitchen ticket, so Tender does not ask "Print Kitchen Order?". */
  noKitchen?: boolean;
}

export interface CustomerMenuItem {
  id: string;
  name: string;
  section: string;
  price: number | null;
  description?: string;
  priceNote?: string;
}

export type MappingStatus = 'mapped' | 'ambiguous' | 'missing-in-pos';

export interface MenuMapping {
  customerItemId: string;
  customerName: string;
  aliases: string[];
  status: MappingStatus;
  posId?: string;
  posName?: string;
  posCategory?: string;
  posItemNumber?: number | null;
  note?: string;
}

export interface TableDef {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Most guests this table seats on its own (missing: not specified, e.g. BAR). */
  capacity?: number;
  /** W tables: the neighbor it can be pushed together with, and the joined capacity. */
  joinWith?: string;
  joinedCapacity?: number;
}

export interface SectionDef {
  id: string;
  label: string;
  tables: TableDef[];
  missingReference?: boolean;
}

// ---- Simulator state ------------------------------------------------------

export type LineStatus = 'new' | 'sent';

export interface OrderLine {
  id: string;
  posId: string;
  qty: number;
  unitPrice: number;
  status: LineStatus;
  /** Submission round this line was sent in (0 while unsent). */
  round: number;
  modifier?: string;
}

export interface VoidRecord {
  posId: string;
  qty: number;
  round: number;
  at: number;
}

export type PayMethod = 'cash' | 'credit';

export interface Payment {
  id: string;
  method: PayMethod;
  /** Amount applied to the check. */
  amount: number;
  /** Cash handed over by the guest (cash only). */
  tendered?: number;
  change?: number;
  at: number;
  /** Credit only: simulated processor references shown on Tip Adjustments. */
  approvalNo?: string;
  troutD?: string;
  /** Simulated last 4 digits (no real card data is ever collected). */
  cardLast4?: string;
  /** Part of `amount` that is the automatic party tip ("Pre Gratuity" on Tip Adjustments). */
  preGratuity?: number;
  /** Tip written on the signed merchant copy, entered later via Tip Adjustments. */
  tip?: number;
}

export type OrderType = 'dine-in' | 'takeout';

export interface Check {
  id: string;
  /** A W table pushed together with its neighbor for a party of 5-8 (e.g. ['W1', 'W2']). */
  joinedTables?: string[];
  /** Missing on checks saved before takeout existed: treat as dine-in. */
  orderType?: OrderType;
  number: string;
  tableId: string;
  server: string;
  guests: number;
  openedAt: number;
  lines: OrderLine[];
  voids: VoidRecord[];
  rounds: number;
  payments: Payment[];
  /** Even Amount Split: remaining amount of each guest's share (0 once paid). */
  splits?: number[];
  gratuity: number;
  status: 'open' | 'closed';
  closedAt?: number;
}

export type Screen = 'main' | 'floor' | 'order' | 'tender' | 'tenderList' | 'tipAdjust';

export type PosEvent =
  | { type: 'seat'; tableId: string; guests: number; checkId: string }
  | { type: 'login'; name: string }
  | { type: 'quick-serve'; tableId: string; checkId: string }
  | { type: 'open-table'; tableId: string; checkId: string }
  | { type: 'add-item'; checkId: string; posId: string; qty: number }
  | { type: 'remove-line'; checkId: string; posId: string; qty: number }
  | { type: 'set-qty'; checkId: string; posId: string; from: number; to: number }
  | { type: 'cancel-all'; checkId: string }
  | { type: 'submit'; checkId: string; tableId: string; round: number; items: { posId: string; qty: number }[]; kitchenPrint: boolean }
  | { type: 'void-sent'; checkId: string; posId: string; qty: number }
  | { type: 'discard-unsent'; checkId: string; items: { posId: string; qty: number }[] }
  | { type: 'open-tender'; checkId: string; tableId: string }
  | { type: 'gratuity'; checkId: string; amount: number }
  | { type: 'payment'; checkId: string; tableId: string; method: PayMethod; amount: number; tendered?: number; change?: number }
  | { type: 'close-check'; checkId: string; tableId: string }
  | { type: 'leave-tender-unpaid'; checkId: string; tableId: string; balance: number }
  | { type: 'print'; checkId: string }
  | { type: 'split'; checkId: string; ways: number; amounts: number[] }
  | { type: 'tip-adjust'; checkId: string; tableId: string; paymentId: string; tip: number };

export type LoggedEvent = PosEvent & { t: number };
