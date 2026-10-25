import { getState } from '../lib/store';
import { expectedTotals } from './evaluate';
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
const COMMON_MEATS = ['15-brisket-ayce', '18-pork-belly-ayce', '17-beef-blg-ayce', '16-ribeye-ayce', '21-grlc-ckn-ayce', '34-spicy-pork-blg-ayce'];

const AYCE_APPS: Record<string, [string, string]> = {
  '01-fried-mandu-ayce': ['order of fried dumplings', 'orders of fried dumplings'],
  '04-stmd-egg-ayce': ['steamed egg', 'steamed eggs'],
  '40-corn-cheese': ['corn cheese', 'corn cheeses'],
  '11-rice-ayce': ['rice', 'rices'],
  '03-soybeans-ayce': ['edamame', 'edamames'],
  '42-kfc-ayce': ['Korean fried chicken', 'Korean fried chickens'],
};

const DRINKS: Record<string, [string, string]> = {
  coke: ['Coke', 'Cokes'],
  'diet-coke': ['Diet Coke', 'Diet Cokes'],
  'coke-zero': ['Coke Zero', 'Coke Zeros'],
  sprite: ['Sprite', 'Sprites'],
  'iced-tea': ['iced tea', 'iced teas'],
  lemonade: ['lemonade', 'lemonades'],
  'arnold-palmer': ['Arnold Palmer', 'Arnold Palmers'],
  'hot-tea': ['hot tea', 'hot teas'],
  'draft-sapporo': ['draft Sapporo', 'draft Sapporos'],
  'draft-asahi': ['draft Asahi', 'draft Asahis'],
  'draft-coors-light': ['draft Coors Light', 'draft Coors Lights'],
  'draft-blue-moon': ['draft Blue Moon', 'draft Blue Moons'],
  terra: ['Terra', 'Terras'],
  corona: ['Corona', 'Coronas'],
  'soju-peach': ['bottle of peach soju', 'bottles of peach soju'],
};

const DINNER_ENTREES: Record<string, [string, string]> = {
  'galbi-dnr': ['galbi entrée', 'galbi entrées'],
  'bulgogi-dnr': ['beef bulgogi entrée', 'beef bulgogi entrées'],
  'spicy-pork-bulgogi-dnr': ['spicy pork bulgogi entrée', 'spicy pork bulgogi entrées'],
  'chicken-teriyaki-dnr': ['chicken teriyaki', 'chicken teriyakis'],
  'kimchi-stew-dnr': ['kimchi stew', 'kimchi stews'],
  'katsu-pork-dnr': ['pork katsu', 'pork katsus'],
  'salmon-dnr': ['salmon', 'salmons'],
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
  kfc: ['Korean fried chicken', 'Korean fried chickens'],
  mandu: ['mandu', 'orders of mandu'],
  japchae: ['japchae', 'orders of japchae'],
  'tteok-bokki': ['tteokbokki', 'orders of tteokbokki'],
  'crispy-caramari': ['fried calamari', 'fried calamaris'],
  'popcorn-chicken': ['popcorn chicken', 'orders of popcorn chicken'],
  'egg-rolls-3pcs': ['egg roll order', 'egg roll orders'],
};

const SPOKEN = { ...MEATS, ...AYCE_APPS, ...DRINKS, ...DINNER_ENTREES, ...LUNCH_ENTREES, ...APPETIZERS };
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const chance = (p: number) => Math.random() < p;
function sample<T>(a: T[], k: number): T[] {
  const c = [...a];
  const out: T[] = [];
  while (out.length < k && c.length) out.push(c.splice(rnd(c.length), 1)[0]);
  return out;
}

function spoken(r: ItemReq): string {
  const [one, many] = SPOKEN[r.posId];
  if (r.qty === 1) {
    if (/^(rice|shrimp|japchae|mandu|tteokbokki|edamame|corn cheese|popcorn chicken|salmon|kimchi stew|Korean fried chicken|fried calamari)$/.test(one)) return `${pick(['some', 'one order of'])} ${one}`;
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

function meatRound(total: number, pool = Object.keys(MEATS)): ItemReq[] {
  const k = Math.min(total, 1 + rnd(Math.min(3, total)));
  const ids = sample(chance(0.7) ? COMMON_MEATS : pool, k);
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

export function generateScenario(level: Level): Scenario {
  const taxRate = getState().settings.taxRate;
  const section = pick(['ABC', 'MYW']);
  const sectionName = section === 'ABC' ? 'A B C BAR' : 'M Y W';
  const alaCarte = level !== 'beginner' && chance(0.3);
  const advanced = level === 'advanced';
  let guests = alaCarte ? 2 + rnd(2) : 2 + rnd(advanced ? 5 : 3);
  if (advanced && !alaCarte && chance(0.35)) guests = 5 + rnd(2);

  const weekday = rnd(7);
  const lunch = chance(0.3);
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
    const ultimate = level !== 'beginner' && chance(0.2);
    const pkgId = ultimate ? 'ultimate-ayce' : isWeekdayLunch ? 'premium-ayce-lunch' : 'premium-ayce-dinner';
    const pkgSay = ultimate ? pick(['the Ultimate all you can eat', 'Ultimate AYCE']) : pick(['Premium all you can eat', 'the Premium AYCE', 'all you can eat']);
    const pkg: ItemReq[] = [{ posId: pkgId, qty: guests }];
    if (guests === 1) pkg.push({ posId: 'single-person-extra', qty: 1 });
    const drinks = chance(0.75) ? drinkOrder(guests) : [];
    const seq = drinks.length ? pick(['with', 'before', 'after']) : 'none';
    const over = advanced && chance(0.4);
    const first = meatRound(over ? 5 : 2 + rnd(3));
    const apps = level !== 'beginner' && chance(0.35) ? [{ posId: pick(Object.keys(AYCE_APPS)), qty: 1 }] : [];
    const intro = pick([`We'll all do ${pkgSay}.`, `${capFirst(pkgSay)} for all ${NUM[guests] ?? guests} of us, please.`, `We're doing ${pkgSay}.`]);
    const meatSay = (items: ItemReq[]) => pick([`Let's start with ${list(items)}.`, `To start: ${list(items)}.`, `First round: ${list(items)}.`]);
    const drinkSay = (items: ItemReq[]) => pick([`Can we get ${list(items)}?`, `And to drink, ${list(items)}.`, `${capFirst(list(items))} to drink, please.`]);

    if (seq === 'before') order({ expect: drinks, say: pick([`Can we start with drinks? ${capFirst(list(drinks))}.`, `Drinks first, please: ${list(drinks)}.`]) });
    let overStageId: string | undefined;
    if (over) {
      stages.push({
        id: id(),
        kind: 'decision',
        party: p,
        say: `${intro} ${seq === 'with' ? drinkSay(drinks) + ' ' : ''}${meatSay(first)}`,
        question: `That is ${meatCount(first)} meat orders. What do you do?`,
        options: [
          { text: 'Ring in everything they asked for', correct: false, feedback: 'AYCE is limited to 4 meat items per order per table at a time.' },
          { text: 'Explain the 4-meat limit, send 4 now and the rest next round', correct: true, feedback: 'The limit is per table, per round.' },
          { text: 'Tell them to drop the extra meat', correct: false, feedback: 'They can still have it in the next round.' },
        ],
      });
      const st = order({ expect: [...pkg, ...(seq === 'with' ? drinks : []), ...apps], overLimit: { requested: first }, say: `Okay, send what you can.${apps.length ? ` And ${list(apps)}.` : ''}` });
      allItems.push(...first);
      overStageId = st.id;
    } else {
      order({
        expect: [...pkg, ...(seq === 'with' ? drinks : []), ...first, ...apps],
        say: `${intro} ${seq === 'with' ? drinkSay(drinks) + ' ' : ''}${meatSay(first)}${apps.length ? ` And ${list(apps)}, please.` : ''}`,
      });
    }

    // modification before sending a follow-up round (intermediate+)
    const extraRounds = over ? 1 : level === 'beginner' ? rnd(2) : 1 + rnd(2);
    for (let r = 0; r < extraRounds; r++) {
      const more = meatRound(1 + rnd(4));
      if (overStageId && r === 0) {
        order({ expect: more.slice(0, 0), remainderOf: overStageId, say: pick(['Can we get the rest of what we asked for?', 'We are ready for the rest of our meat order.']) });
        continue;
      }
      if (level !== 'beginner' && r === 0 && chance(0.35) && more.length) {
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
  if (advanced && chance(0.35)) {
    const drink = allItems.find((i) => DRINKS[i.posId]);
    if (drink) stages.push({ id: id(), kind: 'void', party: p, item: { posId: drink.posId, qty: 1 }, say: `Sorry, could you cancel one ${DRINKS[drink.posId][0]}? We don't need it after all.` });
  }

  if (level !== 'beginner') {
    const ayce = !alaCarte;
    const gratuityPct = ayce && guests >= 5 ? 18 : undefined;
    const method = chance(0.5) ? 'cash' : 'credit';
    const draft: Scenario = { id: '', title, level, summary, time, parties: { p1: guests }, stages, targetSeconds: 0 };
    const items = (draft.stages.filter((s) => s.kind === 'void') as { item: ItemReq }[]).reduce(
      (acc, v) => acc.map((i) => (i.posId === v.item.posId ? { ...i, qty: i.qty - v.item.qty } : i)),
      allItems,
    );
    const total = expectedTotals(items.filter((i) => i.qty > 0), taxRate, gratuityPct ?? 0).totalDue;
    const pay: PayStage =
      method === 'cash'
        ? { id: id(), kind: 'pay', party: p, method: 'cash', cashGiven: cashFor(total), askChange: true, gratuityPct, say: '' }
        : { id: id(), kind: 'pay', party: p, method: 'credit', gratuityPct, say: '' };
    pay.say = method === 'cash' ? pick([`Check please. Here's $${pay.cashGiven} cash.`, `We'll pay cash. Here's $${pay.cashGiven}.`]) : pick(['Can we get the check? One card, please.', "We're ready for the check. Here's my card."]);
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
    targetSeconds: 60 + orderStages * 75 + (level !== 'beginner' ? 90 : 0),
    generated: true,
  };
}

function meatCount(items: ItemReq[]) {
  return items.reduce((s, i) => s + i.qty, 0);
}
