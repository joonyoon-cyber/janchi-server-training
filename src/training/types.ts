import type { LoggedEvent, PayMethod } from '../lib/types';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface ItemReq {
  posId: string;
  qty: number;
  /** Open-price items (gift certificates): the amount the guest asked for. */
  price?: number;
}

export interface DecisionOption {
  text: string;
  correct: boolean;
  feedback: string;
}

interface StageBase {
  id: string;
  /** Party key (multi-table scenarios use p1, p2, ...). */
  party: string;
  /** What the guest (or host) says. Natural language, never POS codes. */
  say: string;
  /** Narration / context shown in italics. */
  note?: string;
  /** Spoken by the host instead of a guest. */
  speaker?: 'guest' | 'host' | 'manager';
}

export interface SeatStage extends StageBase {
  kind: 'seat';
  guests: number;
  /** Section the host asked for (ABC / MYW). */
  section?: string;
  /** Specific table the host asked for. */
  tableId?: string;
  /** Counter guest: start a Quick Serve (takeout) order instead of seating a table. */
  takeout?: boolean;
  /** Seat them at the bar (BAR 1-4) for drinks while they wait for a table. */
  bar?: boolean;
  /** A party of 7-8 seated across a W pair (W1+W2, W3+W4, W5+W6) as two checks, joined when they pay. */
  twoTables?: boolean;
}

/** Bar guests get a table: Move/Join > Move their check from the bar to a table. */
export interface MoveStage extends StageBase {
  kind: 'move';
  /** Section the new table must be in. */
  section?: string;
}

/** A party on two W tables is ready to pay: Move/Join > Join the two checks into one. */
export interface JoinStage extends StageBase {
  kind: 'join';
}

export interface OrderStage extends StageBase {
  kind: 'order';
  expect: ItemReq[];
  /**
   * A party on two W tables orders table by table: 1 = the lower-numbered W of the pair
   * (W1, W3 or W5), 2 = the other one. The order must be sent on that table's check.
   */
  table?: 1 | 2;
  /** A mid-order change revealed after the trainee has rung in N items. */
  interrupt?: { afterAdds: number; say: string; cancelled?: ItemReq[] };
  /**
   * The guest asked for more meat than allowed in one round. `requested` is
   * what they asked for; the trainee may send at most 4 now and must send the
   * rest in the next round (whose stage sets `remainderOf`).
   */
  overLimit?: { requested: ItemReq[] };
  /** This round should also include whatever meat was deferred from that stage. */
  remainderOf?: string;
  /** Expected answer to "Print Kitchen Order?" (false for macarons rung straight to Tender). */
  kitchenPrint?: boolean;
}

export interface VoidStage extends StageBase {
  kind: 'void';
  item: ItemReq;
}

export interface DecisionStage extends StageBase {
  kind: 'decision';
  question: string;
  options: DecisionOption[];
  /** A follow-up question about the order just before it (asked right after that order). */
  followUp?: boolean;
}

export interface PayStage extends StageBase {
  kind: 'pay';
  /** Dine-in: the guests ask for the check with this line first. `say` (how they pay) comes once the check is printed. */
  ask?: string;
  method: PayMethod;
  /** Cash the guest hands over. */
  cashGiven?: number;
  /** Percent gratuity that must be added (e.g. 18 for parties of 5+). */
  gratuityPct?: number;
  /** Ask the trainee how much change to hand back. */
  askChange?: boolean;
  /** Guests split the check evenly this many ways (Even Amount Split), all paying by `method`. */
  split?: number;
  /** With `split`: how many shares (the first ones) are paid in cash with `cashGiven`; the rest by card. */
  cashShares?: number;
  /** One check paid partly in cash (this exact amount) and the rest by card. */
  cashPart?: number;
  /** With `split`: the first share is paid with this much cash and the rest of that share by card; the other shares by card. */
  shareCashPart?: number;
}

export type Stage = SeatStage | OrderStage | VoidStage | DecisionStage | PayStage | MoveStage | JoinStage;

export interface Scenario {
  id: string;
  title: string;
  level: Level;
  summary: string;
  /** Story clock: weekday 0=Sun..6=Sat, 24h time. */
  time: { weekday: number; hour: number; minute: number };
  /** Guest count per party key. */
  parties: Record<string, number>;
  stages: Stage[];
  targetSeconds: number;
  generated?: boolean;
  /** Test mode: time is the leaderboard tiebreaker, so it is not part of the table score. */
  noTimeScore?: boolean;
}

// ---- Run-time record --------------------------------------------------------

export interface StageRecord {
  stageId: string;
  startedAt: number;
  endedAt?: number;
  skipped?: boolean;
  /** Next was pressed before the POS action was seen; later actions still count. */
  passed?: boolean;
  /** Round number of the Order that answered this request. */
  submitRound?: number;
  /** Items sent with Order while this stage was active (order stages). */
  submitted?: ItemReq[];
  submitTable?: string;
  /** Answer given to "Print Kitchen Order?" (true when sent with Order). */
  kitchenPrint?: boolean;
  interruptShown?: boolean;
  /** seat */
  seatedTable?: string;
  seatedGuests?: number;
  /** seat (two W tables): both tables, in the order they were seated. */
  seatedTables?: string[];
  /** move: the table the check was moved to. */
  movedTo?: string;
  /** join: the two tables were joined into one check. */
  joined?: boolean;
  /** decision */
  choice?: number;
  /** pay */
  changeAnswer?: number;
  /** pay (dine-in): the check was printed and handed to the guests. */
  checkPrinted?: boolean;
}

export type StagedEvent = LoggedEvent & { stage: number };

export interface RunState {
  scenario: Scenario;
  stageIndex: number;
  startedAt: number;
  finishedAt?: number;
  partyTables: Record<string, string>;
  partyChecks: Record<string, string>;
  /** A party's second check (the other W table) until the two are joined. */
  partyExtra?: Record<string, string[]>;
  /** Every check a party has had (both W tables, before and after a join). */
  partyAll?: Record<string, string[]>;
  records: StageRecord[];
  /** POS events, tagged with the stage index that was active when they happened. */
  events: StagedEvent[];
  addsThisStage: number;
  /** Waiting for the trainee's change answer after a cash close. */
  awaitingChange?: boolean;
}
