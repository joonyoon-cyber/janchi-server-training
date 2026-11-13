import { evenSplit, getState } from '../lib/store';
import { expectedPartyItems, expectedTotals } from './evaluate';
import type { ItemReq, Level, OrderStage, PayStage, Scenario, Stage } from './types';

// Spoken names (singular, plural) customers use. Only items whose customer-menu
// mapping is unambiguous are used by the generator.
const MEATS: Record<string, [string, string]> = {
  '15-brisket-ayce': ['brisket', 'briskets'],
  '16-ribeye-ayce': ['ribeye', 'ribeyes'],
  '17-beef-blg-ayce': ['beef bulgogi', 'beef bulgogis'],
  '18-pork-belly-ayce': ['pork belly', 'pork bellies'],
  '19-miso-pork-ayce': ['miso pork belly', 'miso pork bellies'],
  '20-ckn-blg-ayce': ['chicken bulgogi', 'chicken bulgogis'],
  '21-grlc-ckn-ayce': ['garlic chicken', 'garlic chickens'],
  '22-short-plt-belly-ayce': ['beef belly', 'beef bellies'],
  '23-red-pork-ayce': ['red pepper pork belly', 'red pepper pork bellies'],
  '24-wine-pork-ayce': ['wine pork belly', 'wine pork bellies'],
  '26-pork-jowl-ayce': ['pork jowl', 'pork jowls'],
  '27-pork-blg-ayce': ['pork bulgogi', 'pork bulgogis'],
  '29-spicy-ckn-thigh-ayce': ['spicy chicken', 'spicy chickens'],
  '31-shrimp-ayce': ['shrimp', 'orders of shrimp'],
  '33-seasoned-short-rib-ayce': ['seasoned short rib', 'seasoned short ribs'],
  '34-spicy-pork-blg-ayce': ['spicy pork bulgogi', 'spicy pork bulgogis'],
  '35-top-sirlon-ayce': ['top sirloin', 'top sirloins'],
};
const AYCE_APPS: Record<string, [string, string]> = {
  '01-fried-mandu-ayce': ['order of fried dumplings', 'orders of fried dumplings'],
  '02-egg-roll-ayce': ['order of egg rolls', 'orders of egg rolls'],
  '03-soybeans-ayce': ['edamame', 'orders of edamame'],
  '04-stmd-egg-ayce': ['steamed egg', 'steamed eggs'],
  '05-popcrn-ckn-ayce': ['popcorn chicken', 'orders of popcorn chicken'],
  '06-crispy-calamari-ayce': ['fried calamari', 'orders of fried calamari'],
  '10-soon-tofu-ayce': ['soon tofu', 'soon tofus'],
  '12-assorted-veggie-ayce': ['plate of grilled vegetables', 'plates of grilled vegetables'],
  '13-tofu-steak-ayce': ['tofu steak', 'tofu steaks'],
  '40-corn-cheese': ['corn cheese', 'corn cheeses'],
  '41-tteok-bokki-ayce': ['tteokbokki', 'orders of tteokbokki'],
  '42-kfc-ayce': ['Korean fried chicken', 'orders of Korean fried chicken'],
  '43-french-fries-ayce': ['order of fries', 'orders of fries'],
  '45-lettuce-wrap': ['plate of lettuce', 'plates of lettuce'],
};

const DRINKS: Record<string, [string, string]> = {
  coke: ['Coke', 'Cokes'],
  'diet-coke': ['Diet Coke', 'Diet Cokes'],
  'coke-zero': ['Coke Zero', 'Coke Zeros'],
  sprite: ['Sprite', 'Sprites'],
  'root-beer': ['root beer', 'root beers'],
  'dr-pepper': ['Dr Pepper', 'Dr Peppers'],
  fanta: ['orange Fanta', 'orange Fantas'],
  'iced-tea': ['iced tea', 'iced teas'],
  'hot-tea': ['hot green tea', 'hot green teas'],
  lemonade: ['lemonade', 'lemonades'],
  'arnold-palmer': ['Arnold Palmer', 'Arnold Palmers'],
  'apple-juice': ['apple juice', 'apple juices'],
  perrier: ['Perrier', 'Perriers'],
  pellegrino: ['bottle of Pellegrino', 'bottles of Pellegrino'],
  'draft-coors-light': ['draft Coors Light', 'draft Coors Lights'],
  'draft-asahi': ['draft Asahi', 'draft Asahis'],
  'draft-sapporo': ['draft Sapporo', 'draft Sapporos'],
  'draft-blue-moon': ['draft Blue Moon', 'draft Blue Moons'],
  'draft-samuel-adams': ['draft Sam Adams', 'draft Sam Adams'],
  'draft-lagunitas-ipa': ['draft Lagunitas IPA', 'draft Lagunitas IPAs'],
  'draft-fat-tire': ['draft Fat Tire', 'draft Fat Tires'],
  'draft-sierra-nevada': ['draft Sierra Nevada', 'draft Sierra Nevadas'],
  'pitchers-sapporo': ['pitcher of Sapporo', 'pitchers of Sapporo'],
  'pitchers-coors-light': ['pitcher of Coors Light', 'pitchers of Coors Light'],
  'pitchers-lagunitas-ipa': ['pitcher of Lagunitas IPA', 'pitchers of Lagunitas IPA'],
  terra: ['Terra', 'Terras'],
  kloud: ['Kloud beer', 'Kloud beers'],
  corona: ['Corona', 'Coronas'],
  pacifico: ['Pacifico', 'Pacificos'],
  heineken: ['Heineken', 'Heinekens'],
  'bud-light': ['Bud Light', 'Bud Lights'],
  'non-alcoholic-beer': ['non-alcoholic beer', 'non-alcoholic beers'],
  'soju-green': ['bottle of original soju', 'bottles of original soju'],
  'soju-zero-sugar': ['bottle of zero sugar soju', 'bottles of zero sugar soju'],
  'soju-peach': ['bottle of peach soju', 'bottles of peach soju'],
  'soju-apple': ['bottle of apple soju', 'bottles of apple soju'],
  'soju-yogurt': ['bottle of yogurt soju', 'bottles of yogurt soju'],
  'soju-strawberry': ['bottle of strawberry soju', 'bottles of strawberry soju'],
  'soju-green-grape': ['bottle of grape soju', 'bottles of grape soju'],
  'soju-martini-peach': ['peach soju martini', 'peach soju martinis'],
  'soju-martini-yogurt': ['yogurt soju martini', 'yogurt soju martinis'],
  'mango-soju-slushie': ['mango soju slushie', 'mango soju slushies'],
  makgoli: ['bottle of makgeolli', 'bottles of makgeolli'],
  'plum-wine': ['glass of plum wine', 'glasses of plum wine'],
  'house-sake-l': ['large hot sake', 'large hot sakes'],
  'chung-ha-cold-sake': ['bottle of Chung Ha', 'bottles of Chung Ha'],
  'glass-melot-house-wine': ['glass of house merlot', 'glasses of house merlot'],
  'glass-pinot-noir': ['glass of pinot noir', 'glasses of pinot noir'],
  'glass-char-house': ['glass of house chardonnay', 'glasses of house chardonnay'],
  'glass-sau-bl-new-zealand': ['glass of New Zealand sauvignon blanc', 'glasses of New Zealand sauvignon blanc'],
  'glass-p-grigio-maddalena': ['glass of pinot grigio', 'glasses of pinot grigio'],
};

const DINNER_ENTREES: Record<string, [string, string]> = {
  'galbi-dnr': ['galbi entrée', 'galbi entrées'],
  'bulgogi-dnr': ['beef bulgogi entrée', 'beef bulgogi entrées'],
  'spicy-pork-bulgogi-dnr': ['spicy pork bulgogi entrée', 'spicy pork bulgogi entrées'],
  'chicken-teriyaki-dnr': ['chicken teriyaki', 'chicken teriyakis'],
  'galbi-soup-dnr': ['galbi tang', 'galbi tangs'],
  'yukgaejang-dnr': ['yukgaejang', 'yukgaejangs'],
  'kimchi-stew-dnr': ['kimchi stew', 'kimchi stews'],
  'soybean-stew-dnr': ['soybean stew', 'soybean stews'],
  'ramen-dumpling-dnr': ['dumpling ramen', 'dumpling ramens'],
  'ramen-mushroom-dnr': ['mushroom ramen', 'mushroom ramens'],
  'fried-noodle-beef-dnr': ['beef pan fried noodles', 'orders of beef pan fried noodles'],
  'fried-noodle-shrimp-dnr': ['shrimp pan fried noodles', 'orders of shrimp pan fried noodles'],
  'katsu-pork-dnr': ['pork katsu', 'pork katsus'],
  'katsu-chicken-dnr': ['chicken katsu', 'chicken katsus'],
  'salmon-dnr': ['salmon', 'salmon entrées'],
  'bbq-ell-dnr': ['BBQ eel', 'BBQ eel entrées'],
  'fried-rice-kimchi-dnr': ['kimchi fried rice', 'kimchi fried rices'],
  'fried-rice-shrimp-dnr': ['shrimp fried rice', 'shrimp fried rices'],
};
const LUNCH_ENTREES: Record<string, [string, string]> = {
  'galbi-lunch': ['galbi', 'galbis'],
  'bulgogi-lunch': ['beef bulgogi', 'beef bulgogis'],
  'spicy-pork-lunch': ['spicy pork bulgogi', 'spicy pork bulgogis'],
  'ch-teriyaki-lunch': ['chicken teriyaki', 'chicken teriyakis'],
  'kimchi-stew': ['kimchi stew', 'kimchi stews'],
  'katsu-pork': ['pork katsu', 'pork katsus'],
  'salmon-lunch': ['salmon', 'salmons'],
};
const APPETIZERS: Record<string, [string, string]> = {
  kfc: ['Korean fried chicken', 'orders of Korean fried chicken'],
  'garlic-soybean': ['garlic edamame', 'orders of garlic edamame'],
  mandu: ['mandu', 'orders of mandu'],
  japchae: ['japchae', 'orders of japchae'],
  'tteok-bokki': ['tteokbokki', 'orders of tteokbokki'],
  'crispy-caramari': ['fried calamari', 'orders of fried calamari'],
  'orange-chicken': ['orange chicken', 'orders of orange chicken'],
  'chili-shrimp': ['chili shrimp', 'orders of chili shrimp'],
  shishito: ['shishito peppers', 'orders of shishito peppers'],
  eggplant: ['eggplant', 'orders of eggplant'],
  tempura: ['tempura', 'orders of tempura'],
  'popcorn-chicken': ['popcorn chicken', 'orders of popcorn chicken'],
  'egg-rolls-3pcs': ['egg roll order', 'egg roll orders'],
  'mushroom-saute': ['mushroom saute', 'mushroom sautes'],
  'spicy-tuna-biscuit': ['spicy tuna biscuit', 'spicy tuna biscuits'],
  'tofu-steak-4pcs': ['tofu steak', 'tofu steaks'],
};

const SPOKEN = { ...MEATS, ...AYCE_APPS, ...DRINKS, ...DINNER_ENTREES, ...LUNCH_ENTREES, ...APPETIZERS };
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** Random source; Test mode swaps in a seeded one so a run can be rebuilt from its seed. */
let rand: () => number = Math.random;
const rnd = (n: number) => Math.floor(rand() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const chance = (p: number) => rand() < p;

/** Small deterministic PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forces specific choices (Test mode recipe); anything left out is random. */
export interface GenOptions {
  rng?: () => number;
  alaCarte?: boolean;
  guests?: number;
  ultimate?: boolean;
  drinks?: 'none' | 'with' | 'before' | 'after';
  over?: boolean;
  extraRounds?: number;
  interrupt?: boolean;
  voidDrink?: boolean;
  pay?: 'none' | 'cash' | 'credit' | 'split' | 'cash-card' | 'split-cash';
  lunch?: boolean;
}
/** Item use counts during a Test build, so a shift asks for many different items. */
let usage: Map<string, number> | null = null;
export function trackVariety(on: boolean) {
  usage = on ? new Map() : null;
}

function sample<T>(a: T[], k: number): T[] {
  const c = [...a];
  const out: T[] = [];
  while (out.length < k && c.length) {
    let i = rnd(c.length);
    if (usage) {
      // Weighted toward items used least so far in this shift.
      const w = c.map((x) => 1 / (1 + 4 * (usage!.get(String(x)) ?? 0)));
      let t = rand() * w.reduce((a2, b) => a2 + b, 0);
      i = w.findIndex((x) => (t -= x) < 0);
      if (i < 0) i = c.length - 1;
    }
    const x = c.splice(i, 1)[0];
    if (usage) usage.set(String(x), (usage.get(String(x)) ?? 0) + 1);
    out.push(x);
  }
  return out;
}

function spoken(r: ItemReq): string {
  const [one, many] = SPOKEN[r.posId];
  if (r.qty === 1) {
    if (/^(shrimp|japchae|mandu|tteokbokki|edamame|garlic edamame|corn cheese|popcorn chicken|orange chicken|chili shrimp|shishito peppers|eggplant|tempura|salmon|kimchi stew|soon tofu|yukgaejang|galbi tang|Korean fried chicken|fried calamari|BBQ eel|kimchi fried rice|shrimp fried rice|beef pan fried noodles|shrimp pan fried noodles)$/.test(one)) return `${pick(['some', 'one order of'])} ${one}`;
    return `${/^[aeiouAEIOU]/.test(one) ? 'an' : 'a'} ${one}`;
  }
  return `${NUM[r.qty] ?? r.qty} ${many}`;
}

function list(items: ItemReq[]): string {
  const parts = items.map(spoken);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')}${parts.length > 2 ? ',' : ''} and ${parts[parts.length - 1]}`;
}

/** Split `total` into `k` positive quantities. */
function splitQty(total: number, k: number): number[] {
  const q = Array(k).fill(1);
  for (let i = k; i < total; i++) q[rnd(k)] += 1;
  return q;
}

function meatRound(total: number, pool = Object.keys(MEATS), minKinds = 1): ItemReq[] {
  const k = Math.min(total, Math.max(minKinds, 1 + rnd(Math.min(3, total))));
  const ids = sample(pool, k);
  const qty = splitQty(total, ids.length);
  return ids.map((posId, i) => ({ posId, qty: qty[i] }));
}

function drinkOrder(guests: number): ItemReq[] {
  const n = Math.max(1, Math.min(guests, 1 + rnd(guests)));
  const ids = sample(Object.keys(DRINKS), Math.min(n, 1 + rnd(3)));
  const qty = splitQty(Math.max(n, ids.length), ids.length);
  return ids.map((posId, i) => ({ posId, qty: qty[i] }));
}

function cashFor(total: number): number {
  for (const b of [20, 40, 50, 60, 80, 100, 120, 140, 150, 200, 250, 300, 400, 500]) if (b > total + 0.5) return b;
  return Math.ceil((total + 1) / 100) * 100;
}

function capFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let genSeq = 0;

export function generateScenario(level: Level, opts: GenOptions = {}): Scenario {
  const prev = rand;
  rand = opts.rng ?? Math.random;
  try {
    return build(level, opts);
  } finally {
    rand = prev;
  }
}

function build(level: Level, opts: GenOptions): Scenario {
  const taxRate = getState().settings.taxRate;
  const section = pick(['ABC', 'MYW']);
  const sectionName = section === 'ABC' ? 'A B C BAR' : 'M Y W';
  const alaCarte = opts.alaCarte ?? (level !== 'beginner' && chance(0.3));
  const advanced = level === 'advanced';
  let guests = alaCarte ? 2 + rnd(2) : 2 + rnd(advanced ? 5 : 3);
  if (advanced && !alaCarte && chance(0.35)) guests = 5 + rnd(2);
  if (opts.guests) guests = opts.guests;

  const weekday = rnd(7);
  const lunch = opts.lunch ?? chance(0.3);
  const time = lunch ? { weekday, hour: 12, minute: 5 + rnd(50) } : { weekday, hour: 17 + rnd(4), minute: rnd(60) };
  const isWeekdayLunch = lunch && weekday >= 1 && weekday <= 5;

  const stages: Stage[] = [];
  const p = 'p1';
  let n = 0;
  const id = () => `s${n++}`;
  stages.push({ id: id(), kind: 'seat', party: p, speaker: 'host', guests, section, say: `Party of ${guests}. Please seat them in ${sectionName}.` });

  const allItems: ItemReq[] = [];
  const order = (st: Omit<OrderStage, 'id' | 'kind' | 'party'>) => {
    const o: OrderStage = { id: id(), kind: 'order', party: p, ...st };
    stages.push(o);
    allItems.push(...o.expect);
    return o;
  };
  let title: string;
  let summary: string;

  if (!alaCarte) {
    const ultimate = opts.ultimate ?? (level !== 'beginner' && chance(0.2));
    const pkgId = ultimate ? 'ultimate-ayce' : isWeekdayLunch ? 'premium-ayce-lunch' : 'premium-ayce-dinner';
    const pkgSay = ultimate ? pick(['the Ultimate all you can eat', 'Ultimate AYCE']) : pick(['Premium all you can eat', 'the Premium AYCE', 'all you can eat']);
    const pkg: ItemReq[] = [{ posId: pkgId, qty: guests }];
    if (guests === 1) pkg.push({ posId: 'single-person-extra', qty: 1 });
    const wantDrinks = opts.drinks ? opts.drinks !== 'none' : chance(0.75);
    const drinks = wantDrinks ? drinkOrder(guests) : [];
    const seq = drinks.length ? (opts.drinks && opts.drinks !== 'none' ? opts.drinks : pick(['with', 'before', 'after'])) : 'none';
    const over = opts.over ?? (advanced && chance(0.4));
    const first = over ? meatRound(5, undefined, 3) : meatRound(2 + rnd(3));
    const apps = level !== 'beginner' && chance(0.35) ? [{ posId: pick(Object.keys(AYCE_APPS)), qty: 1 }] : [];
    const intro = guests === 1 ? `Just me tonight. ${capFirst(pkgSay)}, please. I know there's an extra charge for one person.` : pick([`We'll all do ${pkgSay}.`, guests === 1 ? `Just me tonight. ${capFirst(pkgSay)}, please. I know there's an extra charge for one person.` : (guests === 2 ? `${capFirst(pkgSay)} for both of us, please.` : `${capFirst(pkgSay)} for all ${NUM[guests] ?? guests} of us, please.`), `We're doing ${pkgSay}.`]);
    const meatSay = (items: ItemReq[]) => pick([`Let's start with ${list(items)}.`, `To start: ${list(items)}.`, `First round: ${list(items)}.`]);
    const drinkSay = (items: ItemReq[]) => pick([`Can we get ${list(items)}?`, `And to drink, ${list(items)}.`, `${capFirst(list(items))} to drink, please.`]);

    if (seq === 'before') order({ expect: drinks, say: pick([`Can we start with drinks? ${capFirst(list(drinks))}.`, `Drinks first, please: ${list(drinks)}.`]) });
    if (over) {
      stages.push({
        id: id(),
        kind: 'decision',
        party: p,
        say: `${intro} ${seq === 'with' ? drinkSay(drinks) + ' ' : ''}${meatSay(first)}`,
        question: `That is ${meatCount(first)} meat orders. What do you do?`,
        options: [
          { text: 'Ring in everything they asked for', correct: false, feedback: 'AYCE is limited to 4 meat items per order per table at a time.' },
          { text: 'Explain the 4-meat limit and ask them which meat to drop', correct: true, feedback: 'Right. They order 4 now; anything else they can ask for in a later round.' },
          { text: 'Send 4 now and remember the extra one for their next round', correct: false, feedback: "Don't hold meat orders in your head. Ask them to drop the extra; they can order again next round." },
        ],
      });
      // The guests drop one meat; ring exactly the 4 they keep.
      const drop = first[rnd(first.length)];
      const kept = first.map((m) => (m === drop ? { ...m, qty: m.qty - 1 } : m)).filter((m) => m.qty > 0);
      order({
        expect: [...pkg, ...(seq === 'with' ? drinks : []), ...kept, ...apps],
        say: `Oh, okay. Let's drop ${drop.qty > 1 ? `one of the ${MEATS[drop.posId][1]}` : `the ${MEATS[drop.posId][0]}`} then.${apps.length ? ` And ${list(apps)}, please.` : ''}`,
      });
    } else {
      order({
        expect: [...pkg, ...(seq === 'with' ? drinks : []), ...first, ...apps],
        say: `${intro} ${seq === 'with' ? drinkSay(drinks) + ' ' : ''}${meatSay(first)}${apps.length ? ` And ${list(apps)}, please.` : ''}`,
      });
    }

    // modification before sending a follow-up round (intermediate+)
    const extraRounds = opts.extraRounds ?? (level === 'beginner' ? rnd(2) : 1 + rnd(2));
    for (let r = 0; r < extraRounds; r++) {
      const more = meatRound(1 + rnd(4));
      if (r === 0 && more.length && (opts.interrupt ?? (level !== 'beginner' && chance(0.35)))) {
        // guest changes one quantity mid-entry
        const target = more[0];
        const changed = target.qty > 1 ? { ...target, qty: target.qty - 1 } : null;
        const finalItems = changed ? [changed, ...more.slice(1)] : more.slice(1);
        if (finalItems.length) {
          order({
            expect: finalItems,
            say: pick([`Can we get ${list(more)}?`, `Another round: ${list(more)}, please.`]),
            interrupt: {
              afterAdds: Math.max(1, Math.min(3, more.reduce((s, i) => s + i.qty, 0))),
              say: changed ? `Actually, make that ${spoken(changed)} instead.` : `Actually, skip the ${MEATS[target.posId][0]}.`,
              cancelled: [{ posId: target.posId, qty: 1 }],
            },
          });
          continue;
        }
      }
      order({ expect: more, say: pick([`Can we get ${list(more)}?`, `Another round: ${list(more)}, please.`, `Could we get ${list(more)}?`]) });
    }
    if (seq === 'after') order({ expect: drinks, say: pick([`Oh, can we also get ${list(drinks)}?`, `Could we get some drinks? ${capFirst(list(drinks))}.`]) });

    title = `${ultimate ? 'Ultimate' : 'Premium'} AYCE, party of ${guests}`;
    summary = `Randomized ${level} AYCE table (${seq === 'none' ? 'no drinks' : `drinks ${seq} AYCE`}${over ? ', over the meat limit' : ''}).`;
  } else {
    const entrees = isWeekdayLunch ? LUNCH_ENTREES : DINNER_ENTREES;
    const mains = sample(Object.keys(entrees), 1 + rnd(2)).map((posId) => ({ posId, qty: 1 }));
    const app = [{ posId: pick(Object.keys(APPETIZERS)), qty: 1 }];
    const drinks = drinkOrder(guests);
    order({
      expect: [...mains, ...app, ...drinks],
      say: `We're not doing all you can eat. Can we get ${list(mains)}, ${list(app)}, and ${list(drinks)}?`,
    });
    if (chance(0.4)) {
      const more = drinkOrder(Math.min(2, guests));
      order({ expect: more, say: `Could we get another round of drinks? ${capFirst(list(more))}.` });
    }
    title = `À la carte, party of ${guests}`;
    summary = `Randomized ${level} à la carte table.`;
  }

  // void after sending (advanced)
  if (opts.voidDrink ?? (advanced && chance(0.35))) {
    const drink = allItems.find((i) => DRINKS[i.posId]);
    if (drink) stages.push({ id: id(), kind: 'void', party: p, item: { posId: drink.posId, qty: 1 }, say: `Sorry, could you cancel one ${DRINKS[drink.posId][0]}? We don't need it after all.` });
  }

  let payKind = opts.pay ?? (level === 'beginner' ? 'none' : pick(['cash', 'credit', 'cash', 'credit', 'cash-card', 'split', 'split-cash'] as const));
  if (guests < 2 && (payKind === 'split' || payKind === 'split-cash')) payKind = 'credit';
  if (payKind !== 'none') {
    // The POS adds 18% automatically for dine-in parties of 5+ (AYCE or a la carte).
    const gratuityPct = guests >= 5 ? 18 : undefined;
    const method = payKind === 'cash' ? 'cash' : 'credit';
    const draft: Scenario = { id: '', title, level, summary, time, parties: { p1: guests }, stages, targetSeconds: 0 };
    const total = expectedTotals(expectedPartyItems(draft, p), taxRate, gratuityPct ?? 0).totalDue;
    const pay: PayStage =
      method === 'cash'
        ? { id: id(), kind: 'pay', party: p, method: 'cash', cashGiven: cashFor(total), askChange: true, gratuityPct, say: '' }
        : { id: id(), kind: 'pay', party: p, method: 'credit', gratuityPct, say: '' };
    pay.say = method === 'cash' ? pick([`Check please. Here's $${pay.cashGiven} cash.`, `We'll pay cash. Here's $${pay.cashGiven}.`]) : pick(['Can we get the check? One card, please.', "We're ready for the check. Here's my card."]);
    if (payKind === 'split' || payKind === 'split-cash') {
      const ways = Math.max(2, Math.min(guests, 2 + rnd(2)));
      pay.split = ways;
      pay.say = pick([`Can we split the check ${NUM[ways]} ways? Everyone's paying by card.`, `We'll split it evenly, ${NUM[ways]} ways, all on cards.`]);
      if (payKind === 'split-cash') {
        const share = evenSplit(total, ways)[0];
        pay.cashShares = 1;
        pay.cashGiven = cashFor(share);
        pay.say = `Can we split it evenly, ${NUM[ways]} ways? I'll pay my share in cash. Here's $${pay.cashGiven}. ${ways === 2 ? 'The other share goes on a card.' : 'The rest go on cards.'}`;
      }
    }
    if (payKind === 'cash-card') {
      // Exact bills toward the check, the rest on one card.
      const part = [20, 40, 50, 60].filter((b) => b < total - 5).pop() ?? 20;
      pay.cashPart = part;
      pay.cashGiven = part;
      pay.say = pick([`I'll put $${part} in cash toward it, and the rest on my card.`, `Here's $${part} in cash. Put the rest on this card, please.`]);
    }
    stages.push(pay);
  }

  const orderStages = stages.filter((s) => s.kind === 'order').length;
  return {
    id: `gen-${Date.now().toString(36)}-${genSeq++}`,
    title,
    level,
    summary,
    time,
    parties: { p1: guests },
    stages,
    targetSeconds: 60 + orderStages * 75 + (payKind !== 'none' ? 90 : 0),
    generated: true,
  };
}

function meatCount(items: ItemReq[]) {
  return items.reduce((s, i) => s + i.qty, 0);
}

/**
 * Counter guest at the Quick Serve, who says up front what it is and hands over payment:
 * macaron ice cream to go, a gift certificate, or a food take-out order.
 */
export function generateCounter(kind: 'macaron' | 'gift' | 'takeout', opts: { rng?: () => number } = {}): Scenario {
  const prev = rand;
  rand = opts.rng ?? Math.random;
  try {
    const p = 'p1';
    const flavors: Record<string, string> = {
      'macaron-strawberry': 'strawberry',
      'macaron-mango': 'mango',
      'macaron-green-tea': 'green tea',
      'macaron-vanilla': 'vanilla',
      'macaron-coffee': 'coffee',
    };
    const taxRate = getState().settings.taxRate;
    let items: ItemReq[];
    let opener: string;
    let what: string;
    let kitchenPrint: boolean | undefined;
    if (kind === 'macaron') {
      items = sample(Object.keys(flavors), 1 + rnd(2)).map((posId) => ({ posId, qty: 1 + rnd(2) }));
      opener = "Hi! I'd like a macaron ice cream order to go.";
      what = items.map((i) => `${NUM[i.qty]} ${flavors[i.posId]}`).join(' and ');
      kitchenPrint = false;
    } else if (kind === 'gift') {
      const amount = pick([25, 50, 75, 100, 150]);
      items = [{ posId: 'certificate', qty: 1, price: amount }];
      opener = "Hi! I'd like to buy a gift card.";
      what = `A $${amount} gift card`;
    } else {
      items = [
        ...sample(Object.keys(DINNER_ENTREES), 1 + rnd(2)).map((posId) => ({ posId, qty: 1 })),
        ...sample(Object.keys(APPETIZERS), 1).map((posId) => ({ posId, qty: 1 })),
      ];
      opener = "Hi! I'd like to place a take-out order. I'll pay now.";
      what = capFirst(list(items));
      kitchenPrint = true;
    }
    const total = expectedTotals(items, taxRate).totalDue;
    const cash = chance(0.5);
    const payLine = cash ? `Here's $${cashFor(total)} in cash.` : "Here's my card.";
    const stages: Stage[] = [
      { id: 's0', kind: 'seat', party: p, takeout: true, guests: 1, speaker: 'guest', note: 'A guest walks up to the counter.', say: opener },
      { id: 's1', kind: 'order', party: p, expect: items, kitchenPrint, say: `${what}, please. ${payLine}` },
      cash
        ? { id: 's2', kind: 'pay', party: p, method: 'cash', cashGiven: cashFor(total), askChange: true, say: `(The guest is waiting to pay with the $${cashFor(total)} cash.)` }
        : { id: 's2', kind: 'pay', party: p, method: 'credit', say: '(The guest is waiting to pay by card.)' },
    ];
    const titles = { macaron: 'Macaron ice cream to go', gift: 'Gift card sale', takeout: 'Take-out order at the counter' };
    return {
      id: `gen-${Date.now().toString(36)}-${genSeq++}`,
      title: titles[kind],
      level: 'intermediate',
      summary: kind === 'takeout' ? 'A counter guest orders food to go and pays right away.' : `Counter guest: ${titles[kind].toLowerCase()}.`,
      time: { weekday: rnd(7), hour: 18 + rnd(3), minute: rnd(60) },
      parties: { p1: 1 },
      stages,
      targetSeconds: 120,
      generated: true,
    };
  } finally {
    rand = prev;
  }
}
