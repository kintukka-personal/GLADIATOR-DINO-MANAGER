// Markets & trading. OWNER: world-economy agent. GM 02 §11, 03 §3.1.
//
// Every week the dino, beast, gear, rider and item lists are replaced (last week's stock moves to the `old*`
// lists that AI rivals may buy at 75%). Goods roll on an "effective week": weapons week + 2×spies, everything
// else week + spies, +25 with Market Connections (raw current spies, GM). Dino levels use GM's compressed week.
import type {
  BeastSpeciesId, Creature, Egg, FoodId, GameState, Gear, GearTypeId, ID, Ludus, Quality, SpeciesId,
} from './types';
import { SPECIES } from './data/species';
import { GEAR, gearHas, gearName, gearWorth, makeGear } from './data/gear';
import { FOODS, FOOD_IDS } from './data/food';
import { chance, clamp, coin, pick, rand, random, shuffle, weighted } from './rng';
import { asc, ASC, hasUpgrade, newId } from './util';
import {
  addTrait, generateBeast, generateDino, getStats, hasTrait, makeNamed, marketPrice, pickSpecies, salePrice, statWorth,
} from './creature';
import { committedSpies } from './economy';
import { hasOpp } from './influence';
import { eggValue, generateMarketEgg, markFate, sellEggValue } from './breeding';
import { objectiveEvent } from './objectives';
import { removeFromHouse, unassignEverywhere, wearerOf } from './care';

const Q = (n: number): Quality => clamp(Math.trunc(n), 0, 5) as Quality;
const STARTERS = new Set(['tetraites', 'carpophorus', 'flamma']);

// ---------------------------------------------------------------------------
// Effective weeks
// ---------------------------------------------------------------------------

export function marketWeeks(state: GameState): { week: number; weapons: number; goods: number; extra: number } {
  const spies = state.player.ludus.keepers.spies;
  const mc = hasOpp(state, 'marketConnections') ? 1 : 0;
  const week = state.world.week;
  return { week, weapons: week + 2 * spies + 25 * mc, goods: week + spies + 25 * mc, extra: mc };
}

/** GM compressed week for market dino levels: ≤10 as is, 11–29 → 10, 30–101 → week/2, later 40. */
export function compressedWeek(week: number): number {
  if (week <= 10) return Math.max(1, week);
  if (week < 30) return 10;
  if (week <= 101) return Math.trunc(week / 2);
  return 40;
}

// ---------------------------------------------------------------------------
// Goods generation (GM Seed.GenerateMarket*)
// ---------------------------------------------------------------------------

type Adder = (type: GearTypeId, q: number, extra?: Partial<Gear>) => void;

function collector(): { out: Gear[]; add: Adder } {
  const out: Gear[] = [];
  const add: Adder = (type, q, extra = {}) => {
    if (!GEAR[type]?.market) return;
    out.push(makeGear(type, Q(q), newId('g'), extra));
  };
  return { out, add };
}

const falcataQ = (w: number): number => {
  const v = rand(10) + Math.trunc(w / 25) + rand(15);
  return v <= 9 ? 0 : v <= 14 ? 1 : v <= 18 ? 2 : v > 24 && coin() ? 4 : 3;
};
const galerusQ = (n: number): number => (n > 180 ? 4 : n > 140 ? 3 : n > 100 ? 2 : n > 85 ? 1 : 0);
const hoodQ = (n: number): number => (n > 140 ? 4 : n > 100 ? 3 : n > 50 ? 2 : n > 35 ? 1 : 0);

export function generateWeapons(state: GameState, w: number, i2: number): Gear[] {
  const { out, add } = collector();
  const blade = (fangToVenom: number): GearTypeId => {
    const r = rand(3);
    if (r === 0) return 'greatTalons';
    if (r === 1) return 'talonBlades';
    return chance(fangToVenom) ? 'venomFangs' : 'fangCaps';
  };
  const r = rand(w + 10);
  add(blade(0.5), r < 6 ? 0 : r > 15 ? 2 : 1);
  const r3 = rand(20) + w;
  add(blade(0.25), r3 < 15 ? 0 : r3 > 25 ? 2 : 1);
  if (r > 30 && r < 50) add(blade(0.25), 3);
  else if (r > 50) add(pick(['greatTalons', 'talonBlades', 'fangCaps'] as GearTypeId[]), 4);
  // horn lance / bronze horn (GM Hasta / Dory)
  const sp = rand(100) + Math.trunc(w / 2);
  if (sp > 20) add(chance(0.1) ? 'bronzeHorn' : 'hornLance', sp < 50 ? 0 : sp <= 95 ? 1 : sp <= 120 ? 2 : sp <= 160 ? 3 : 4);
  // iron jaws (GM Cestus)
  const r2 = rand(Math.trunc(w / 10) + 100);
  if (r2 >= 95) add('ironJaws', r2 <= 96 ? 1 : r2 <= 99 ? 2 : r2 <= 102 ? 0 : 3);
  if (r2 > 40 && r2 < 95) add('ironJaws', r2 === 50 ? 3 : r2 % 3);
  // venom spitter (GM Wooden Bow)
  if (state.world.week > 1 && chance(0.28)) add('venomSpitter', w < 10 ? rand(2) : 1 + rand(2));
  // trident horns (GM Fuscina)
  const fu = rand(100) + Math.trunc(w / 25);
  if (fu > 86) add('tridentHorns', fu <= 92 ? 0 : fu <= 96 ? 1 : 2);
  // sickle claws (GM Sica)
  const short = out.length < 3 ? 30 : out.length < 5 ? 10 : 0;
  const si = rand(90) + Math.trunc(w / 3) + short;
  if (si > 60) add('sickleClaws', si <= 80 ? 0 : si <= 100 ? 1 : si <= 130 ? 2 : si > 170 && chance(0.4) ? 4 : 3);
  // tail club / ankylo hammer (GM Securis / Bipennis)
  if (chance(0.4) || out.length < 4) {
    const v = rand(10) + Math.trunc(w / 20);
    add(chance(0.33) ? 'ankyloHammer' : 'tailClub', v <= 7 ? 0 : v <= 9 ? 1 : v <= 12 ? 2 : v > 15 && coin() ? 4 : 3);
  }
  // hook claws (GM Khopesh)
  if (chance(Math.min(0.42, 0.22 + w / 500))) {
    const v = rand(10) + Math.trunc(w / 15) + rand(5);
    add('hookClaws', v <= 7 ? 0 : v <= 10 ? 1 : v <= 16 ? 2 : v > 21 && coin() ? 4 : 3);
  }
  // scythe claws, tail-whip, spine darts (GM Falcata, Whip, Pilum)
  const p = Math.min(0.5, 0.17 + w / 300);
  for (const t of ['scytheClaws', 'tailWhip', 'spineDarts'] as GearTypeId[]) if (chance(p)) add(t, falcataQ(w));
  // obsidian crusher (GM Palm Axe; +5 for Egyptian heritage)
  const pa = rand(20) + (state.player.heritage === 'egyptian' ? 5 : 0);
  if (pa > 15) {
    const v = pa + Math.trunc(w / 10);
    add('obsidianCrusher', v > 25 ? 3 : v > 20 ? 2 : v > 17 ? 1 : 0);
  }
  for (let i = 0; i < i2; i++) add(pick(['talonBlades', 'fangCaps', 'hornLance', 'tailClub'] as GearTypeId[]), rand(3));
  return out;
}

export function generateEquipment(state: GameState, w: number, i2: number): Gear[] {
  const { out, add } = collector();
  const hw = Math.trunc(w / 2);
  const ws = rand(hw + 15);
  if (ws > hw + 4) add('hideShield', ws < 10 ? 0 : ws < 20 ? 1 : ws < 25 ? 2 : ws < 50 ? 3 : 4);
  const re = rand(hw + 15);
  if (re > hw + 5) add('bolaRig', re < 10 ? 0 : re < 30 ? 1 : re < 40 ? 2 : re < 70 ? 3 : 4);
  const cs = rand(Math.trunc(w / 4) + 100);
  if (cs > 98) add('bronzeFrillGuard', cs > 120 ? 2 : 1);
  const ls = rand(hw + 15);
  if (ls > hw + Math.trunc(w / 4) + 7) {
    const x = rand(10);
    add('frillGuard', x === 0 ? 3 : x <= 3 ? 1 : 0);
  }
  if (chance(0.25)) add('bashPlate', rand(3));
  if (rand(5) > 3 || out.length < 5) add('bashPlate', rand(5));
  if (w > 5) {
    const cl = rand(100) + rand(2 * w) + 5 * i2;
    if (cl > 75) add('camoHide', cl > 180 ? 4 : cl > 150 ? 3 : cl > 120 ? 2 : cl > 90 ? 1 : 0);
    const la = rand(150) + rand(2 * w) + 5 * i2;
    if (la > 110) add('studdedBarding', la > 260 ? 4 : la > 210 ? 3 : la > 170 ? 2 : la > 140 ? 1 : 0);
    const cu = rand(200) + rand(2 * w) + 5 * i2;
    if (cu > 190) add('bronzeBarding', cu > 350 ? 4 : cu > 300 ? 3 : cu > 220 ? 2 : 1);
  }
  const ga = rand(90) + rand(2 * w) + 5 * i2;
  if (ga > 70) add('lightHarness', galerusQ(ga));
  if (chance(0.5) || out.length < 3) add('quiltedBarding', galerusQ(rand(90) + rand(3 * w) + 5 * i2));
  const se = rand(85) + rand(2 * w) + 5 * i2;
  if (se > 80) add(coin() ? 'legionBarding' : 'legionFaceplate', se > 220 ? 4 : se > 170 ? 3 : se > 110 ? 2 : se > 95 ? 1 : 0);
  const br = rand(90) + rand(2 * w);
  if (br > 50) add('bronzeMuzzle', br > 160 ? 4 : br > 120 ? 3 : br > 80 ? 2 : br > 75 ? 1 : 0);
  const ho = rand(50) + rand(2 * w);
  if (ho > 20) add('huntersHood', hoodQ(ho));
  if (ho > 50) add('hornedHelm', ho > 120 ? 4 : hoodQ(rand(50) + rand(2 * w)));
  if (chance(0.6)) add('strappedBuckler', falcataQ(w));
  if (chance(0.6)) {
    const v = rand(10) + Math.trunc(w / 6) + rand(12);
    add('carthaginianCrest', v <= 12 ? 0 : v <= 16 ? 1 : v <= 22 ? 2 : v > 26 && coin() ? 4 : 3);
  }
  const ca = rand(100) + w;
  if (ca > 100) add('cataphractBarding', ca <= 105 ? 0 : ca <= 112 ? 1 : ca <= 122 ? 2 : ca > 126 && coin() ? 4 : 3);
  // GM always adds an Old Cataphract piece, even for houses without the upgrade [quirk fixed: owners only]
  if (hasUpgrade(state, 'cataphracts')) add('cataphractBarding', 1);
  return out;
}

/** Riders only show up for a ludus with a Saddlery (GM mounts need Stables). */
export function generateRiders(state: GameState, w: number, i2: number): Gear[] {
  if ((state.player.ludus.buildings.saddlery ?? 0) < 1) return [];
  const { out, add } = collector();
  const q = (n: number) => (n < 100 ? 1 : n < 150 ? 2 : 3);
  const nu = rand(Math.trunc(w / 2) + 120) + 5 * i2;
  if (nu > 40) add('numidianLancer', q(nu));
  let ce = rand(Math.trunc(w / 2) + 120) + 5 * i2;
  if (ce % 2 === 0) ce -= 10;
  if (ce > 60) add('celticSpearman', q(ce));
  return out;
}

export function generateItems(state: GameState, w: number, i2: number): Gear[] {
  const { out, add } = collector();
  const week = state.world.week;
  if (chance(0.2)) add('poultice', 2);
  if (week > 15 && chance(0.4)) add('poultice', 2);
  const roll = rand(100);
  if (roll <= (i2 > 0 ? 85 : 90)) {
    const c = rand(100) + Math.trunc(w / 10) + 5 * i2;
    if (c > 75) add('caltrops', c > 120 ? 4 : c > 100 ? 3 : c > 90 ? 2 : 1);
  } else {
    add(roll > 95 ? 'eagleEyeCharm' : 'neptuneCharm', 2);
  }
  if (rand(100) < 1 + i2) add('bestiaryScroll', 2);
  if (rand(100) < 1 + i2) add('silphium', 2);
  const gr = rand(100) + Math.trunc(w / 10) + 2 * i2;
  if (gr > 50) add('legPlates', gr > 110 ? 4 : gr > 99 ? 3 : gr > 90 ? 2 : gr > 65 ? 1 : 0);
  if (chance(0.1)) add('antivenom', 2);
  if (chance(0.3)) add('bottledLightning', 2);
  if (rand(500) === 0) add('moonstone', 2);
  const md = rand(Math.trunc(w / 4) + 500);
  if (md > 498) add('mandrakeRoot', md > 520 ? 2 : md > 505 ? 1 : 0);
  return out;
}

/** Market beasts: a dire wolf most weeks (an alpha after week 40), sometimes a bigger beast; rhinos and mammoths locked behind upgrades. */
export function generateBeasts(state: GameState, w: number): Creature[] {
  const week = state.world.week;
  const out: Creature[] = [];
  if (chance(0.5)) out.push(generateBeast(week > 40 ? 'alphadirewolf' : 'direwolf', { variant: coin() ? 'random' : 'standard' }));
  if (rand(100) + Math.trunc(w / 4) > 55) {
    const pool: BeastSpeciesId[] = ['sabertooth', 'direbear', 'sarcosuchus', 'terrorbird', 'gigantopithecus'];
    const sp = weighted(pool, [5, 4, 3, 4, w > 10 ? 3 : 1]);
    out.push(generateBeast(sp, { variant: w > 50 && chance(0.3) ? 'strong' : 'random' }));
  }
  if (rand(100) + Math.trunc(w / 5) > 88) out.push(generateBeast('woollyrhino', { variant: 'random' }));
  if (week > 15 && week % 2 === 0 && coin()) out.push(generateBeast('mammoth', { variant: 'random' }));
  return out;
}

/** GM GenerateMarketGladiators: 0–1 normal at L, 1–2 cheap at L/2, an Epic on marketSeed weeks, Market Connections extras. */
export function generateMarketDinos(state: GameState, i3: number): Creature[] {
  const week = state.world.week;
  const wc = compressedWeek(week);
  const L = Math.max(Math.trunc(rand(wc) / 3) + 1, 2);
  const out: Creature[] = [];
  if (coin()) out.push(generateDino({ tier: 'normal', level: L, week }));
  const cheap = 1 + rand(2);
  for (let i = 0; i < cheap; i++) out.push(generateDino({ tier: 'cheap', level: Math.max(1, Math.trunc(L / 2)), week }));
  // GM checks the compressed week here, giving an Epic every week 11–29 with seed 0 [quirk fixed: real week]
  if (week > 5 && week % 5 === state.world.marketSeed) out.push(generateDino({ tier: 'epic', level: L, week }));
  if (i3 > 0) {
    if (rand(3) < i3) out.push(generateDino({ tier: 'epic', level: L, week }));
    if (rand(6) < i3) out.push(generateDino({ tier: 'normal', level: L, week }));
  }
  return out;
}

/** Keeper market: 2–4 at 80/100/120 (Jupiter −1/+10, Gaia 50% +10 / 50% −1, Egyptian 50% +1, Nightmare +20/+20). */
export function rollKeeperMarket(state: GameState): { count: number; price: number } {
  const week = state.world.week;
  let count = rand(3) + 2;
  let price = 80 + 20 * rand(3);
  if (asc(state, ASC.jupiter)) { count--; price += 10; }
  if (asc(state, ASC.gaia)) {
    if (coin()) price += 10;
    if (coin()) count--;
  }
  if (state.player.heritage === 'egyptian' && coin()) count++;
  if (state.world.difficulty.nightmare) {
    if (week > 20) price += 20;
    if (week > 40) price += 20;
  }
  return { count: Math.max(0, count), price };
}

export function generateMarketEggs(state: GameState): Egg[] {
  const week = state.world.week;
  const n = 1 + rand(3) + (week > 10 ? rand(2) : 0);
  const out: Egg[] = [];
  for (let i = 0; i < n; i++) {
    const sp: SpeciesId = chance(0.1) ? pick(['terrorbird', 'sarcosuchus'] as SpeciesId[]) : pickSpecies(week, 'normal');
    out.push(generateMarketEgg(state, sp));
  }
  return out;
}

export function rollFoodPrices(): Record<FoodId, number> {
  return Object.fromEntries(FOOD_IDS.map((f) => [f, Math.max(1, Math.round(FOODS[f].price * (0.9 + random() * 0.2)))])) as Record<FoodId, number>;
}

function generateGoods(state: GameState): Gear[] {
  const { weapons, goods, extra } = marketWeeks(state);
  return [
    ...generateWeapons(state, weapons, extra),
    ...generateEquipment(state, goods, extra),
    ...generateRiders(state, goods, extra),
    ...generateItems(state, goods, extra),
  ];
}

/** Weekly regeneration of every market list (GM World.AppendWeek step 8) incl. keepers, eggs and food prices. */
export function regenerateMarkets(state: GameState): void {
  const m = state.world.market;
  const { goods, extra } = marketWeeks(state);
  m.oldCreatures = m.creatures;
  m.oldGear = m.gear;
  m.creatures = [...generateMarketDinos(state, extra), ...generateBeasts(state, goods)];
  m.gear = generateGoods(state);
  m.keepers = rollKeeperMarket(state);
  m.eggs = generateMarketEggs(state);
  m.foodPrices = rollFoodPrices();
  m.pokes = 0;
  rollMerchant(state);
}

/** Week-1 market: starters + Aello. */
export function seedStarterMarket(state: GameState): void {
  const m = state.world.market;
  const week = state.world.week;
  const starters = [
    makeNamed('carnotaurus', 'Tetraites', { str: 8, agi: 5, cun: 5, hp: 30 }, { traits: ['Agile'], price: 350, legend: 'tetraites' }),
    makeNamed('troodon', 'Carpophorus', { str: 7, agi: 5, cun: 8, hp: 30 }, { traits: ['BeastTamer'], price: 400, legend: 'carpophorus' }),
    makeNamed('velociraptor', 'Flamma', { str: 7, agi: 5, cun: 6, hp: 30 }, { traits: ['GlorySeeker'], price: 300, legend: 'flamma' }),
  ];
  const aello = generateBeast('direwolf', { name: 'Aello', sex: 'F' });
  addTrait(aello, 'SharpenedClaws');
  aello.price = 100;
  aello.legend = 'aello';
  const L = Math.max(Math.trunc(rand(compressedWeek(week)) / 3) + 1, 2);
  m.creatures = [
    ...starters, aello,
    generateDino({ tier: 'normal', level: L, week }),
    generateDino({ tier: 'cheap', level: Math.max(1, Math.trunc(L / 2)), week }),
  ];
  m.oldCreatures = [];
  m.oldGear = [];
  m.gear = generateGoods(state);
  m.keepers = { count: 5, price: 100 };
  m.eggs = generateMarketEggs(state);
  m.foodPrices = rollFoodPrices();
  m.pokes = 0;
  rollMerchant(state);
}

// ---------------------------------------------------------------------------
// Prices, locks, intel
// ---------------------------------------------------------------------------

/** Is this gear/creature locked behind an upgrade the player lacks? */
export function isLocked(state: GameState, item: Gear | Creature): boolean {
  if ('species' in item) {
    const up = SPECIES[item.species]?.upgrade;
    return !!up && !hasUpgrade(state, up);
  }
  if (item.unique) return false;
  const up = GEAR[item.type]?.upgrade;
  return !!up && !hasUpgrade(state, up);
}

export function marketCreaturePrice(state: GameState, c: Creature): number {
  const fixed = c.price !== undefined && !(c.legend && STARTERS.has(c.legend) && state.world.week >= 5);
  let p = fixed ? c.price! : marketPrice({ ...c, price: undefined });
  if (state.world.market.pokes >= 15) p = Math.max(1, p - 10);
  return p;
}

export function marketGearPrice(state: GameState, g: Gear): number {
  return gearWorth(g);
}

/** AI price for last week's leftovers (75%). */
export function leftoverPrice(state: GameState, item: Gear | Creature): number {
  const full = 'species' in item ? marketCreaturePrice(state, item) : gearWorth(item);
  return full - Math.trunc(full / 4);
}

export interface MarketIntel { age: boolean; species: boolean; str: boolean; agi: boolean; cun: boolean; hp: boolean; traits: number; wild: boolean }

/** Which details of a creature the player can see (GM 9.3 spy table for market stock; the Geneticist reveals wild points). */
export function intel(state: GameState, c: Creature): MarketIntel {
  const m = state.world.market;
  const forSale = m.creatures.includes(c) || m.oldCreatures.includes(c);
  if (!forSale) return { age: true, species: true, str: true, agi: true, cun: true, hp: true, traits: c.traits.length, wild: true };
  const s = committedSpies(state, state.player.ludus);
  return {
    age: s >= 1, species: true, str: s >= 2, agi: s >= 3, cun: s >= 5, hp: s >= 7,
    traits: s >= 8 ? Math.min(c.traits.length, s - 7) : 0, wild: hasUpgrade(state, 'geneticist'),
  };
}

// ---------------------------------------------------------------------------
// Buying and selling
// ---------------------------------------------------------------------------

/** New arrivals: +20 tameness if below 75 and a rebellion grace. */
function welcome(c: Creature): void {
  if (c.loyalty < 75) c.loyalty = Math.min(100, c.loyalty + 20);
  c.rebellionGrace = true;
  c.price = undefined;
  c.inactive = false;
}

export function buyCreature(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const c = m.creatures.find((x) => x.id === id);
  if (!c) return 'That creature is no longer for sale.';
  if (isLocked(state, c)) return `${SPECIES[c.species].name}s are locked behind an Amber upgrade.`;
  const price = marketCreaturePrice(state, c);
  if (h.denarii < price) return `${c.name} costs ${price} denarii.`;
  h.denarii -= price;
  m.creatures = m.creatures.filter((x) => x.id !== id);
  welcome(c);
  h.creatures.push(c);
  objectiveEvent(state, 'bought');
  return null;
}

/** Sell to the market for salePrice(); creature reappears in the market. */
export function sellCreature(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const c = h.creatures.find((x) => x.id === id);
  if (!c) return 'That creature is not in your ludus.';
  if (c.away) return `${c.name} is away.`;
  const price = salePrice(c);
  h.denarii += price;
  removeFromHouse(state, h, c);
  markFate(state, c, 'Sold at the Capua market');
  c.favourite = false;
  c.offerToRivals = false;
  c.inactive = false;
  c.price = undefined;
  m.creatures.push(c);
  return null;
}

export function buyGear(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const g = m.gear.find((x) => x.id === id);
  if (!g) return 'That piece is no longer for sale.';
  if (isLocked(state, g)) return `${gearName(g)} is locked behind an Amber upgrade.`;
  const d = GEAR[g.type];
  if (d.slot === 'rider' && (h.buildings.saddlery ?? 0) < 1) return 'Riders need a Saddlery to sleep in.';
  const price = marketGearPrice(state, g);
  if (h.denarii < price) return `${gearName(g)} costs ${price} denarii.`;
  h.denarii -= price;
  m.gear = m.gear.filter((x) => x.id !== id);
  h.armory.push(g);
  objectiveEvent(state, d.slot === 'weapon' ? 'boughtWeapon' : d.slot === 'rider' ? 'boughtRider' : 'boughtGear');
  return null;
}

export function sellGear(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const g = h.armory.find((x) => x.id === id);
  if (!g) return 'That piece is not in your armory.';
  const worn = wearerOf(h, g.id);
  if (worn && gearHas(g, 'CannotUnequip')) return `${gearName(g)} will not come off ${worn.creature.name}.`;
  unassignEverywhere(h, g.id);
  h.armory = h.armory.filter((x) => x.id !== id);
  h.denarii += Math.trunc(gearWorth(g) / 2);
  m.gear.push(g);
  return null;
}

export function buyFood(state: GameState, food: FoodId, n: number): string | null {
  const h = state.player.ludus;
  n = Math.trunc(n);
  if (!FOODS[food]) return 'The stall does not sell that.';
  if (n <= 0) return 'Buy at least one.';
  const price = state.world.market.foodPrices[food] ?? FOODS[food].price;
  const total = price * n;
  if (h.denarii < total) return `${n} ${FOODS[food].name} cost ${total} denarii.`;
  h.denarii -= total;
  h.pantry[food] = (h.pantry[food] ?? 0) + n;
  return null;
}

export function buyEgg(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const e = m.eggs.find((x) => x.id === id);
  if (!e) return 'That egg is no longer for sale.';
  const up = SPECIES[e.species]?.upgrade;
  if (up && !hasUpgrade(state, up)) return 'Those eggs are locked behind an Amber upgrade.';
  const price = e.price ?? eggValue(e);
  if (h.denarii < price) return `The egg costs ${price} denarii.`;
  h.denarii -= price;
  m.eggs = m.eggs.filter((x) => x.id !== id);
  h.eggs.push(e);
  objectiveEvent(state, 'boughtEgg');
  return null;
}

export function sellEgg(state: GameState, id: ID): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const e = h.eggs.find((x) => x.id === id);
  if (!e) return 'That egg is not yours.';
  h.denarii += sellEggValue(e);
  h.eggs = h.eggs.filter((x) => x.id !== id);
  if (e.fertilized) {
    e.price = eggValue(e);
    m.eggs.push(e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trading with rivals (GM 11.4)
// ---------------------------------------------------------------------------

/** GM preference score (favourite − hated) of a rival for a creature. */
export function preferenceScore(r: Ludus, c: Creature): number {
  const prefs = r.ai?.personality.prefers ?? [];
  const s = getStats(c);
  let n = 0;
  for (const p of prefs) {
    switch (p) {
      case 'cheap': {
        const w = statWorth(c);
        if (w < 200 || w < r.denarii / 5) n++;
        else if (w > 500 || w > 2 * r.denarii) n--;
        break;
      }
      case 'talented': {
        const phys = s.str + s.agi + s.cun;
        if (hasTrait(c, 'Talented') || (c.level < 3 && phys - c.level > 18)) n++;
        else if (hasTrait(c, 'Blind') || hasTrait(c, 'Crippled') || (c.level > 3 && phys - c.level < 18)) n--;
        break;
      }
      case 'established':
        if ((c.level > 3 && c.fame > 20) || hasTrait(c, 'ArenaChampion')) n++;
        else if ((c.level < 2 && c.fame < 10) || hasTrait(c, 'Underdog')) n--;
        break;
      case 'quick': n += s.agi > 8 ? 1 : s.agi < 6 ? -1 : 0; break;
      case 'strong': n += s.str > 8 ? 1 : s.str < 6 ? -1 : 0; break;
      case 'cunning': n += s.cun > 8 ? 1 : s.cun < 6 ? -1 : 0; break;
      case 'mythic': if (hasTrait(c, 'Mythical')) n++; break;
      case 'tough':
        if (s.hp > 40 || hasTrait(c, 'Tough') || hasTrait(c, 'ThickHide')) n++;
        else if (s.hp < 25) n--;
        break;
    }
  }
  return n;
}

/** Rival's valuation ("wanted") of one of its creatures: stat worth × preferences × poverty + 10. */
export function rivalWanted(state: GameState, r: Ludus, c: Creature): number {
  let v = statWorth(c);
  let num = 10 + 3 * preferenceScore(r, c);
  if (c.legend === 'spartacus') num += 5;
  if (c.legend === 'theokoles') num += 3;
  if (c.cls === 'spitter') num += 4;
  if (num !== 10) v = Math.trunc((v * Math.max(num, 1)) / 10);
  if (r.denarii < 0) v = Math.trunc(v / 2);
  else if (r.denarii < 100) v = Math.trunc(v * 0.75);
  return v + 10;
}

function opinionOf(r: Ludus): number {
  return r.ai?.opinion ?? 50;
}

/** GM multiplier d for creatures: 1 (1.25 at Minerva) + (60 − opinion)/100, Juno +0.1, Hyperion +0.05. */
export function creatureTradeMult(state: GameState, r: Ludus): number {
  return (asc(state, ASC.minerva) ? 1.25 : 1) + (60 - opinionOf(r)) / 100 + (asc(state, ASC.juno) ? 0.1 : 0) + (asc(state, ASC.hyperion) ? 0.05 : 0);
}

function isBestFighter(r: Ludus, c: Creature): boolean {
  return r.creatures.filter((x) => x.kind === c.kind).every((x) => statWorth(x) <= statWorth(c));
}

/** A rival refuses to sell its last dinos / only beast below twice the wanted price. */
function protectedMinimum(r: Ludus, c: Creature, wanted: number): number {
  const broke = r.denarii < 0;
  if (c.kind === 'dino' && r.creatures.filter((x) => x.kind === 'dino').length <= 2) return 2 * wanted + 1;
  if (c.kind === 'beast' && !broke && r.creatures.filter((x) => x.kind === 'beast').length <= 1) return 2 * wanted + 1;
  return 0;
}

/** GM item want: worth × d' (opinion now counts: the integer-division bug is fixed) × scarcity/best bonuses, legendary +1000, poverty discounts. */
export function rivalItemWant(state: GameState, r: Ludus, g: Gear): number {
  const d = GEAR[g.type];
  const mult = (asc(state, ASC.vulcan) ? 1.35 : 1) + (asc(state, ASC.hyperion) ? 0.1 : 0) + (60 - opinionOf(r)) / 100;
  const same = r.armory.filter((x) => GEAR[x.type].slot === d.slot);
  const best = same.every((x) => gearWorth(x) <= gearWorth(g));
  let pct = 0;
  if (d.slot === 'weapon') {
    if (same.length < 4) pct += 25;
    if (same.length < 2) pct += 25;
    if (best) pct += 50;
  } else {
    if (same.length < 2) pct += 50;
    if (best) pct += 50;
  }
  let w = gearWorth(g) * Math.max(0.1, mult) * (1 + pct / 100);
  if (g.quality === 5) w += 1000;
  if (r.denarii < 200) w *= 0.75;
  if (r.denarii < 0) w *= 0.75;
  return Math.ceil(w);
}

/** What the rival wants for a creature/gear (GM valuation × opinion multiplier). */
export function rivalAskingPrice(state: GameState, rival: Ludus, itemId: ID): number {
  const c = rival.creatures.find((x) => x.id === itemId);
  if (c) {
    let wanted = rivalWanted(state, rival, c);
    if (c.kind === 'beast' && rival.denarii < 0) wanted = Math.trunc(wanted * 0.8);
    const d = creatureTradeMult(state, rival) + (isBestFighter(rival, c) ? 1 / 3 : 0);
    return Math.max(Math.ceil(wanted * Math.max(0.1, d)), protectedMinimum(rival, c, wanted));
  }
  const g = rival.armory.find((x) => x.id === itemId);
  if (g) return rivalItemWant(state, rival, g);
  return 0;
}

/** Player offer to a rival for one of its creatures or gear (one offer per rival per week). Returns outcome text and whether accepted. */
export function offerToRival(state: GameState, rivalId: ID, itemId: ID, amount: number): { ok: boolean; text: string; counter?: number } {
  const h = state.player.ludus;
  const r = state.rivals.find((x) => x.id === rivalId && !x.defeated);
  if (!r || !r.ai) return { ok: false, text: 'That house is not trading.' };
  if (r.ai.offeredThisWeek) return { ok: false, text: `${r.name} will not hear another offer until next week.` };
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, text: 'Offer something, at least.' };
  if (h.denarii < amount) return { ok: false, text: 'You cannot cover that offer.' };
  const c = r.creatures.find((x) => x.id === itemId);
  const g = c ? undefined : r.armory.find((x) => x.id === itemId);
  if (!c && !g) return { ok: false, text: `${r.name} does not own that.` };
  if (c?.away) return { ok: false, text: `${c.name} is away.` };
  if (g && gearHas(g, 'CannotUnequip') && wearerOf(r, g.id)) return { ok: false, text: `${gearName(g)} will not come off its wearer.` };
  r.ai.offeredThisWeek = true;
  if (c) {
    let wanted = rivalWanted(state, r, c);
    if (c.kind === 'beast' && r.denarii < 0) wanted = Math.trunc(wanted * 0.8);
    const ask = rivalAskingPrice(state, r, c.id);
    const minimum = protectedMinimum(r, c, wanted);
    if (minimum && amount < minimum) {
      return { ok: false, text: `${r.name} will not part with ${c.name} for that. It is one of the few fighters they have left.`, counter: ask };
    }
    if (amount >= ask) {
      removeFromHouse(state, r, c);
      welcome(c);
      h.creatures.push(c);
      h.denarii -= amount;
      r.denarii += amount;
      objectiveEvent(state, 'bought');
      return { ok: true, text: `${r.name} accepts ${amount} denarii. ${c.name} is yours.` };
    }
    const counter = Math.max(ask, Math.floor((wanted + rand(Math.trunc(wanted / 2) + 1)) * 1.1));
    return { ok: false, text: `${r.name} laughs at ${amount} denarii and names ${counter} instead. Come back next week.`, counter };
  }
  const want = rivalItemWant(state, r, g!);
  if (amount >= want) {
    unassignEverywhere(r, g!.id);
    r.armory = r.armory.filter((x) => x.id !== g!.id);
    h.armory.push(g!);
    h.denarii -= amount;
    r.denarii += amount;
    if (GEAR[g!.type].slot === 'weapon') objectiveEvent(state, 'boughtWeapon');
    return { ok: true, text: `${r.name} accepts. The ${gearName(g!)} is yours.` };
  }
  return { ok: false, text: `${r.name} wants at least ${want} denarii for the ${gearName(g!)}.`, counter: want };
}

function findOffer(state: GameState, offerId: ID) {
  const p = state.player;
  return p.offers.find((o) => o.id === offerId) ?? p.messages.find((m) => m.offer?.id === offerId)?.offer;
}

function dropOffer(state: GameState, offerId: ID): void {
  const p = state.player;
  p.offers = p.offers.filter((o) => o.id !== offerId);
  for (const m of p.messages) {
    if (m.offer?.id === offerId) {
      m.offer = undefined;
      m.read = true;
    }
  }
}

/** Accept a rival's bid for one of your creatures (message offer). */
export function acceptTransfer(state: GameState, offerId: ID): string | null {
  const p = state.player;
  const h = p.ludus;
  const offer = findOffer(state, offerId);
  if (!offer) return 'That offer is gone.';
  if (offer.expiresWeek <= state.world.week) {
    dropOffer(state, offerId);
    return 'That offer has expired.';
  }
  const r = state.rivals.find((x) => x.id === offer.rivalId && !x.defeated);
  if (!r) {
    dropOffer(state, offerId);
    return 'That house is no more.';
  }
  if (offer.sell) {
    const c = r.creatures.find((x) => x.id === offer.creatureId) ?? offer.creature;
    if (!c) return 'The creature is no longer on offer.';
    if (h.denarii < offer.amount) return `You need ${offer.amount} denarii.`;
    h.denarii -= offer.amount;
    r.denarii += offer.amount;
    if (r.creatures.includes(c)) removeFromHouse(state, r, c);
    welcome(c);
    h.creatures.push(c);
    objectiveEvent(state, 'bought');
  } else {
    const c = h.creatures.find((x) => x.id === offer.creatureId);
    if (!c) {
      dropOffer(state, offerId);
      return 'That creature is no longer yours to sell.';
    }
    if (c.away) return `${c.name} is away.`;
    if (r.denarii < offer.amount) return `${r.name} can no longer pay.`;
    r.denarii -= offer.amount;
    h.denarii += offer.amount;
    removeFromHouse(state, h, c);
    if (c.loyalty < 50) c.loyalty = Math.min(100, c.loyalty + 20);
    c.favourite = false;
    c.offerToRivals = false;
    r.creatures.push(c);
    if (r.ai) r.ai.opinion += 3;
  }
  dropOffer(state, offerId);
  return null;
}

export function declineTransfer(state: GameState, offerId: ID): void {
  dropOffer(state, offerId);
}

/** AI buys from last week's leftovers at 75% (helper for the rivals module). */
export function aiBuyLeftover(state: GameState, r: Ludus, itemId: ID): boolean {
  const m = state.world.market;
  const c = m.oldCreatures.find((x) => x.id === itemId);
  const g = c ? undefined : m.oldGear.find((x) => x.id === itemId);
  const item = c ?? g;
  if (!item) return false;
  const price = leftoverPrice(state, item);
  if (r.denarii < price) return false;
  r.denarii -= price;
  if (c) {
    m.oldCreatures = m.oldCreatures.filter((x) => x !== c);
    welcome(c);
    r.creatures.push(c);
  } else if (g) {
    m.oldGear = m.oldGear.filter((x) => x !== g);
    r.armory.push(g);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Traveling merchant (GM 11.6)
// ---------------------------------------------------------------------------

/** Traveling merchant (upgrade) offers. */
export function rollMerchant(state: GameState): void {
  const m = state.world.market;
  if (!hasUpgrade(state, 'travelingMerchant') || !chance(0.35)) {
    m.merchant = undefined;
    return;
  }
  const week = state.world.week;
  const k = week > 20 ? 2 : week > 10 || coin() ? 1 : 0;
  const q = (): Quality => Q(Math.min(4, rand(3 + k)));
  const g = (type: GearTypeId, quality: Quality, extra: Partial<Gear> = {}) => makeGear(type, quality, newId('g'), extra);
  const pool: (() => { gear: Gear; price: number })[] = [
    () => ({ gear: g('luckyTooth', 2), price: 150 }),
    () => ({ gear: g('gripWraps', 1), price: 100 }),
    () => ({ gear: g('bronzeFrillGuard', q()), price: 200 }),
    () => ({ gear: g('parryingSpurs', q()), price: 100 }),
    () => ({ gear: g('bronzeHorn', q()), price: 100 }),
    () => ({ gear: g('hookClaws', q()), price: 150 }),
    () => pick([
      () => ({ gear: g('moonstone', 2), price: 200 }),
      () => ({ gear: g('mandrakeRoot', q()), price: 200 }),
      () => ({ gear: g('hornedHelm', 1, { unique: 'helmOfWovenPath', state: 0 }), price: 150 }),
      () => ({ gear: g('tridentHorns', q()), price: 150 }),
      () => ({ gear: g('bashPlate', q()), price: 150 }),
      () => ({ gear: g('venomFangs', q()), price: 100 }),
    ])(),
  ];
  if (chance((state.player.ludus.buildings.library ?? 0) >= 1 ? 0.25 : 0.15)) pool.push(() => ({ gear: g('bestiaryScroll', 2), price: 300 }));
  m.merchant = { items: shuffle(pool).slice(0, 3).map((f) => f()), week };
}

export function buyFromMerchant(state: GameState, index: number): string | null {
  const m = state.world.market;
  const h = state.player.ludus;
  const mer = m.merchant;
  if (!mer || mer.week !== state.world.week) return 'The merchant has moved on.';
  const it = mer.items[index];
  if (!it) return 'The merchant has nothing there.';
  if (h.denarii < 100) return 'The merchant only talks to people carrying at least 100 denarii.';
  if (isLocked(state, it.gear)) return `${gearName(it.gear)} is locked behind an Amber upgrade.`;
  if (h.denarii < it.price) return `${gearName(it.gear)} costs ${it.price} denarii.`;
  h.denarii -= it.price;
  if (it.gear.unique === 'helmOfWovenPath') it.gear.state = (it.gear.state ?? 0) + 1;
  h.armory.push(it.gear);
  mer.items.splice(index, 1);
  return null;
}
