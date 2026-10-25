import type { LoggedEvent, PayMethod } from '../lib/types';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface ItemReq {
  posId: string;
  qty: number;
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
}

export interface OrderStage extends StageBase {
  kind: 'order';
  expect: ItemReq[];
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
}

export interface VoidStage extends StageBase {
  kind: 'void';
  item: ItemReq;
}

export interface DecisionStage extends StageBase {
  kind: 'decision';
  question: string;
  options: DecisionOption[];
}

export interface PayStage extends StageBase {
  kind: 'pay';
  method: PayMethod;
  /** Cash the guest hands over. */
  cashGiven?: number;
  /** Percent gratuity that must be added (e.g. 18 for parties of 5+). */
  gratuityPct?: number;
  /** Ask the trainee how much change to hand back. */
  askChange?: boolean;
}

export type Stage = SeatStage | OrderStage | VoidStage | DecisionStage | PayStage;

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
}

// ---- Run-time record --------------------------------------------------------

export interface StageRecord {
  stageId: string;
  startedAt: number;
  endedAt?: number;
  skipped?: boolean;
  /** Items sent with Order while this stage was active (order stages). */
  submitted?: ItemReq[];
  submitTable?: string;
  interruptShown?: boolean;
  /** seat */
  seatedTable?: string;
  seatedGuests?: number;
  /** decision */
  choice?: number;
  /** pay */
  changeAnswer?: number;
}

export type StagedEvent = LoggedEvent & { stage: number };

export interface RunState {
  scenario: Scenario;
  stageIndex: number;
  startedAt: number;
  finishedAt?: number;
  partyTables: Record<string, string>;
  partyChecks: Record<string, string>;
  records: StageRecord[];
  /** POS events, tagged with the stage index that was active when they happened. */
  events: StagedEvent[];
  addsThisStage: number;
  /** Waiting for the trainee's change answer after a cash close. */
  awaitingChange?: boolean;
}
