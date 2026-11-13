import { generateCounter, generateScenario, seededRng, trackVariety, type GenOptions } from './generator';
import { scenarios } from './scenarios';
import type { Level, Scenario, Stage } from './types';

/**
 * Test mode: 20 tables built from a fixed recipe, so every run has the same
 * mix and difficulty; only the details (dishes, party sizes, sections,
 * amounts) and the order of the tables come from the seed.
 * Bump TEST_VERSION whenever the recipe or scoring changes, so leaderboard
 * runs stay comparable.
 */
export const TEST_VERSION = 4;
/** Most tables a server has open at once during the shift. */
const MAX_OPEN = 10;
export const TEST_TABLES = 10;

type Slot = { level: Level; opts: GenOptions; label: string } | { counter: ('macaron' | 'gift' | 'takeout')[]; label: string } | { handWritten: string[]; label: string };

const RECIPE: Slot[] = [
  { label: 'AYCE, drinks with the order + another round', level: 'intermediate', opts: { alaCarte: false, drinks: 'with', extraRounds: 1, pay: 'credit', over: false, interrupt: false, voidDrink: false , serverItems: 'serve' } },
  { label: 'AYCE, over the 4-meat limit (drop the extra)', level: 'advanced', opts: { alaCarte: false, over: true, extraRounds: 1, pay: 'cash', interrupt: false, voidDrink: false, guests: 3 , serverItems: 'none' } },
  { label: 'AYCE, guest changes the order; part cash, rest card', level: 'intermediate', opts: { alaCarte: false, extraRounds: 1, interrupt: true, pay: 'cash-card', over: false, voidDrink: false , serverItems: 'none' } },
  { label: 'AYCE, party of 5+ splits with one cash share', level: 'advanced', opts: { alaCarte: false, guests: 5, extraRounds: 1, pay: 'split-cash', over: false, interrupt: false, voidDrink: false , serverItems: 'serve' } },
  { label: 'AYCE, drinks first, cancel after sending, split on cards', level: 'advanced', opts: { alaCarte: false, guests: 3, drinks: 'before', extraRounds: 1, voidDrink: true, pay: 'split', over: false, interrupt: false , serverItems: 'none' } },
  { label: 'Ultimate AYCE', level: 'intermediate', opts: { alaCarte: false, ultimate: true, drinks: 'after', extraRounds: 1, pay: 'credit', over: false, interrupt: false, voidDrink: false , serverItems: 'kitchen' } },
  { label: 'À la carte, cash', level: 'intermediate', opts: { alaCarte: true, pay: 'cash', voidDrink: false } },
  { label: 'Take-out order at the counter', counter: ['takeout'] },
  { label: 'Macaron to go or a gift card', counter: ['macaron', 'gift'] },
  { label: 'House policy, family or combo', handWritten: ['ayce-same-choice', 'family-kids', 'combo-dinner'] },
];

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The 20 tables of a Test, each a separate scenario (Friday dinner, no lunch pricing). */
export function buildTables(seed: number): Scenario[] {
  const rng = seededRng(seed);
  // Ask for as many different menu items as possible across the shift.
  trackVariety(true);
  const tables = RECIPE.map((slot, i): Scenario => {
    let sc: Scenario;
    if ('counter' in slot) sc = generateCounter(slot.counter[Math.floor(rng() * slot.counter.length)], { rng });
    else if ('handWritten' in slot) {
      const id = slot.handWritten[Math.floor(rng() * slot.handWritten.length)];
      sc = structuredClone(scenarios.find((s) => s.id === id)!);
    } else sc = generateScenario(slot.level, { ...slot.opts, lunch: false, rng });
    return { ...sc, id: `test-${seed}-${i}` };
  });
  trackVariety(false);
  // Seeded shuffle (Fisher-Yates) so the arrival order differs between runs.
  for (let i = tables.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tables[i], tables[j]] = [tables[j], tables[i]];
  }
  return tables;
}

/**
 * One continuous shift: the 20 tables arrive one after another and their
 * requests interleave (up to MAX_OPEN tables at once), like a real night.
 * A seat is always followed by that table's first request, a policy question
 * by the order it leads to, and counter guests are handled in one go.
 */
export function buildTest(seed: number): Scenario {
  const rng = seededRng(seed ^ 0x5eed);
  // Like a real shift, the server works one section all night.
  const section = rng() < 0.5 ? 'ABC' : 'MYW';
  const sectionName = section === 'ABC' ? 'A B C BAR' : 'M Y W';
  const tables = buildTables(seed);
  const parties: Record<string, number> = {};
  const queues: Stage[][][] = tables.map((t, i) => {
    const party = `p${i + 1}`;
    parties[party] = t.parties.p1;
    const stages = t.stages.map((st): Stage => {
      const s = { ...st, id: `t${i}-${st.id}`, party } as Stage;
      if (s.kind === 'seat' && !s.takeout) {
        s.section = section;
        delete s.tableId;
        s.say = `Party of ${s.guests} for you. Please seat them in your section (${sectionName}).`;
      }
      if (s.kind === 'order' && s.remainderOf) s.remainderOf = `t${i}-${s.remainderOf}`;
      return s;
    });
    const blocks: Stage[][] = [];
    const takeout = stages[0].kind === 'seat' && stages[0].takeout;
    for (const st of stages) {
      const last = blocks[blocks.length - 1];
      const prev = last?.[last.length - 1];
      const followUp = st.kind === 'decision' && st.followUp;
      if (last && (takeout || followUp || prev.kind === 'seat' || (prev.kind === 'decision' && !prev.followUp))) last.push(st);
      else blocks.push([st]);
    }
    return blocks;
  });

  const stages: Stage[] = [];
  const open: number[] = [];
  let next = 0;
  while (next < queues.length || open.length) {
    const arrive = next < queues.length && (open.length === 0 || (open.length < MAX_OPEN && rng() < 0.55));
    const t = arrive ? next++ : open[Math.floor(rng() * open.length)];
    stages.push(...queues[t].shift()!);
    if (arrive && queues[t].length) open.push(t);
    if (!queues[t].length && open.includes(t)) open.splice(open.indexOf(t), 1);
  }
  return {
    id: `test-${seed}`,
    title: 'Service test',
    level: 'advanced',
    summary: `${TEST_TABLES}-party shift in ${sectionName}`,
    time: { weekday: 5, hour: 18, minute: 0 },
    parties,
    stages,
    targetSeconds: tables.reduce((a, t) => a + t.targetSeconds, 0),
    generated: true,
    noTimeScore: true,
  };
}
