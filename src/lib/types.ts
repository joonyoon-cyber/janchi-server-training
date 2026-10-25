// ---- Reference data -------------------------------------------------------

export interface PosCategory {
  id: string;
  label: string;
  color: string;
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
}

export interface Check {
  id: string;
  number: string;
  tableId: string;
  server: string;
  guests: number;
  openedAt: number;
  lines: OrderLine[];
  voids: VoidRecord[];
  rounds: number;
  payments: Payment[];
  gratuity: number;
  status: 'open' | 'closed';
  closedAt?: number;
}

export type Screen = 'main' | 'floor' | 'order' | 'tender';

export type PosEvent =
  | { type: 'seat'; tableId: string; guests: number; checkId: string }
  | { type: 'open-table'; tableId: string; checkId: string }
  | { type: 'add-item'; checkId: string; posId: string; qty: number }
  | { type: 'remove-line'; checkId: string; posId: string; qty: number }
  | { type: 'set-qty'; checkId: string; posId: string; from: number; to: number }
  | { type: 'cancel-all'; checkId: string }
  | { type: 'submit'; checkId: string; tableId: string; round: number; items: { posId: string; qty: number }[] }
  | { type: 'void-sent'; checkId: string; posId: string; qty: number }
  | { type: 'discard-unsent'; checkId: string; items: { posId: string; qty: number }[] }
  | { type: 'open-tender'; checkId: string; tableId: string }
  | { type: 'gratuity'; checkId: string; amount: number }
  | { type: 'payment'; checkId: string; tableId: string; method: PayMethod; amount: number; tendered?: number; change?: number }
  | { type: 'close-check'; checkId: string; tableId: string }
  | { type: 'leave-tender-unpaid'; checkId: string; tableId: string; balance: number }
  | { type: 'print'; checkId: string };

export type LoggedEvent = PosEvent & { t: number };
