// Creature core: stat model (base + wild + domestic, ARK on top of GM leveling), aging,
// XP and levels, traits, techniques, worth/prices and generation of market creatures.

import type {
  BeastSpeciesId, ClassId, Creature, CareerStats, DinoSpeciesId, Genetics, Sex, SpeciesId, Stat, Stats,
  TechId, TraitId,
} from './types';
import { STATS } from './types';
import { SPECIES, BEAST_MARKET, DINO_SPECIES } from './data/species';
import { TRAITS, RANDOM_TRAITS } from './data/traits';
import { TECHNIQUES, LEARNABLE, RARE_LEARNABLE, techRequirement } from './data/techniques';
import { CLASSES } from './data/classes';
import { COLORS } from './data/colors';
import { namePool } from './data/names';
import { rand, range, chance, pick, weighted, clamp, idiv, shuffle } from './rng';
import { newId, zeroStats, zeroProf } from './util';

export const INC: Stats = { str: 1, agi: 1, cun: 1, hp: 5 };

// ---------------------------------------------------------------------------
// Age (GM age table, keyed by equivalent human age)
// ---------------------------------------------------------------------------

export interface AgeMods { str: number; agi: number; cun: number; hp: number; xp: number; injury: number }

const AGE_TABLE: [number, AgeMods][] = [
  [4, { str: .1, agi: .1, cun: .1, hp: .2, xp: .1, injury: 3 }],
  [8, { str: .2, agi: .5, cun: .3, hp: .4, xp: .2, injury: 2 }],
  [12, { str: .5, agi: .7, cun: .4, hp: .7, xp: .5, injury: 1 }],
  [13, { str: .5, agi: .7, cun: .4, hp: .7, xp: .9, injury: 1 }],
  [15, { str: .5, agi: .7, cun: .5, hp: .7, xp: .9, injury: 1 }],
  [16, { str: .8, agi: 1, cun: .6, hp: .9, xp: .9, injury: 0 }],
  [17, { str: .8, agi: 1, cun: .7, hp: .9, xp: 1, injury: 0 }],
  [18, { str: .9, agi: 1, cun: .8, hp: .9, xp: 1, injury: 0 }],
  [28, { str: 1, agi: 1, cun: 1, hp: 1, xp: 1, injury: 0 }],
  [33, { str: 1, agi: .9, cun: 1, hp: 1, xp: .8, injury: 1 }],
  [40, { str: .9, agi: .8, cun: 1, hp: .9, xp: .6, injury: 2 }],
  [46, { str: .8, agi: .6, cun: 1, hp: .7, xp: .4, injury: 2 }],
  [49, { str: .8, agi: .4, cun: .9, hp: .7, xp: .3, injury: 4 }],
  [50, { str: .7, agi: .4, cun: .9, hp: .5, xp: .3, injury: 4 }],
  [55, { str: .7, agi: .4, cun: .9, hp: .5, xp: .2, injury: 4 }],
  [59, { str: .6, agi: .3, cun: .9, hp: .4, xp: .2, injury: 4 }],
  [60, { str: .6, agi: .3, cun: .9, hp: .4, xp: .2, injury: 5 }],
  [62, { str: .6, agi: .3, cun: .8, hp: .4, xp: .2, injury: 5 }],
  [70, { str: .5, agi: .2, cun: .8, hp: .3, xp: .2, injury: 5 }],
  [80, { str: .3, agi: .1, cun: .7, hp: .1, xp: .2, injury: 6 }],
  [100, { str: .3, agi: .1, cun: .6, hp: .1, xp: .2, injury: 7 }],
];
const AGE_LAST: AgeMods = { str: .1, agi: .1, cun: .6, hp: .1, xp: .2, injury: 8 };

export function ageModsFor(eq: number): AgeMods {
  for (const [upper, mods] of AGE_TABLE) if (eq < upper) return mods;
  return AGE_LAST;
}

/** Equivalent human age in years (drives the GM table). */
export function eqAge(c: Creature): number {
  if (c.maturity < 1) return 18 * c.maturity;
  return 18 + c.adultWeeks / 52;
}

export function ageMods(c: Creature): AgeMods {
  if (c.kind === 'beast' && c.maturity >= 1) return { str: 1, agi: 1, cun: 1, hp: 1, xp: 1, injury: 0 };
  return ageModsFor(eqAge(c));
}

export type Stage = 'baby' | 'juvenile' | 'adolescent' | 'adult';
export function stage(c: Creature): Stage {
  if (c.maturity < 0.1) return 'baby';
  if (c.maturity < 0.5) return 'juvenile';
  if (c.maturity < 1) return 'adolescent';
  return 'adult';
}

export function lifePhase(c: Creature): string {
  const st = stage(c);
  if (st !== 'adult') return st[0].toUpperCase() + st.slice(1);
  const e = eqAge(c);
  if (e < 28) return 'Prime';
  if (e < 40) return 'Veteran';
  if (e < 50) return 'Aging';
  return 'Old';
}

export function ageLabel(c: Creature): string {
  const y = Math.floor(c.ageWeeks / 52);
  const w = c.ageWeeks % 52;
  return y > 0 ? `${y}y ${w}w` : `${w}w`;
}

export const isKid = (c: Creature): boolean => eqAge(c) < 15;
export const canFightAge = (c: Creature): boolean => eqAge(c) >= 8;
export const isAdult = (c: Creature): boolean => c.maturity >= 1;
export const isOld = (c: Creature): boolean => eqAge(c) > 49;

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Raw attribute: genetics (imprinted) + domestic points + permanent bonuses + reincarnation. No age, no gear. */
export function rawStat(c: Creature, s: Stat): number {
  const sp = SPECIES[c.species];
  const wildPart = (sp.base[s] + c.genes.wild[s] * INC[s]) * (1 + 0.2 * c.genes.imprint);
  let v = Math.round(wildPart) + c.dom[s] * INC[s] + c.bonus[s];
  const r = c.reincarnation;
  if ((s === 'str' || s === 'agi') && r > 3) v += 1;
  if (s === 'cun' && r > 4) v += 1;
  if (s === 'hp' && r > 7) v += 5;
  return v;
}

/** Current attribute used in combat and checks: raw × age multiplier, minimums applied. */
export function getStat(c: Creature, s: Stat): number {
  const m = ageMods(c);
  const v = Math.floor(rawStat(c, s) * m[s]);
  return s === 'hp' ? Math.max(5, v) : Math.max(1, v);
}

export function getStats(c: Creature): Stats {
  return { str: getStat(c, 'str'), agi: getStat(c, 'agi'), cun: getStat(c, 'cun'), hp: getStat(c, 'hp') };
}

export const maxHp = (c: Creature): number => getStat(c, 'hp');

/** ARK wild level: 1 + total wild points. */
export function wildLevel(c: Creature | { genes: Genetics }): number {
  const w = c.genes.wild;
  return 1 + w.str + w.agi + w.cun + w.hp;
}

/** Wild points relative to what a typical member of the species would roll. */
export function geneticScore(c: Creature): number {
  const w = c.genes.wild;
  return w.str + w.agi + w.cun + w.hp;
}

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

export const hasTrait = (c: Creature, t: TraitId): boolean => c.traits.includes(t);

export function addTrait(c: Creature, t: TraitId): boolean {
  if (c.traits.includes(t)) return false;
  const d = TRAITS[t];
  if (!d) return false;
  c.traits.push(t);
  for (const s of STATS) c.bonus[s] += d.stats[s] ?? 0;
  if (d.techPoint) c.techPoints += d.techPoint;
  return true;
}

export function removeTrait(c: Creature, t: TraitId): boolean {
  const i = c.traits.indexOf(t);
  if (i < 0) return false;
  c.traits.splice(i, 1);
  const d = TRAITS[t];
  if (d) for (const s of STATS) c.bonus[s] -= d.stats[s] ?? 0;
  return true;
}

/** Replace one trait with another (pit ladder, Giant→Titan…). */
export function replaceTrait(c: Creature, from: TraitId, to: TraitId): void {
  removeTrait(c, from);
  addTrait(c, to);
}

export function injuryProne(c: Creature): number {
  let v = 0;
  for (const t of c.traits) v += TRAITS[t]?.injury ?? 0;
  if (c.kind === 'beast') return v - 1;
  v += ageMods(c).injury;
  if (c.reincarnation > 1) v -= 1;
  if (c.legend === 'spartacus' && c.level <= 4) v -= 1;
  return v;
}

export function traitLoyaltyDrift(c: Creature): number {
  let v = 0;
  for (const t of c.traits) v += TRAITS[t]?.loyalty ?? 0;
  if (hasTrait(c, 'Reincarnated')) {
    if (c.reincarnation > 4) v += 1;
    if (c.reincarnation > 6) v += 1;
  }
  return v;
}

// ---------------------------------------------------------------------------
// XP, levels, class proficiency
// ---------------------------------------------------------------------------

export const xpForLevel = (L: number): number => 50 * L * (L - 1);

export function classLevel(c: Creature): number {
  return Math.max(0, Math.floor(Math.sqrt(c.classXp)) - 1);
}

/** Best stat (HP compared per point). */
export function bestStat(c: Creature): Stat {
  const s = getStats(c);
  const scored: [Stat, number][] = [['str', s.str], ['agi', s.agi], ['cun', s.cun], ['hp', s.hp / 5]];
  scored.sort((a, b) => b[1] - a[1]);
  return scored[0][0];
}

export function classProficiency(c: Creature, cls: ClassId | null = c.cls): number {
  if (!cls) return 100;
  const d = CLASSES[cls];
  const techs = c.techniques.filter((t) => d.techniques.includes(t.id)).length;
  const traits = c.traits.filter((t) => d.traits.includes(t)).length;
  const sp = SPECIES[c.species];
  let p = 15 * (techs + traits) + 10 + c.level + classLevel(c);
  if (sp.favClass === cls) p += 5;
  if (sp.disClass === cls) p -= 5;
  if (bestStat(c) === d.mainStat) p += 5;
  return clamp(p, 0, 100);
}

export function xpMultiplier(c: Creature): number {
  const age = c.kind === 'beast' ? 1 : ageMods(c).xp;
  const prof = c.kind === 'beast' ? 100 : classProficiency(c);
  return age * prof / 100;
}

/** Give XP with age and class multipliers. Handles level-ups. Returns XP actually gained. */
export function grantXp(c: Creature, amount: number, extraMult = 1): number {
  if (amount <= 0) return 0;
  const gained = Math.max(0, Math.floor(amount * xpMultiplier(c) * extraMult));
  c.xp += gained;
  while (c.xp >= xpForLevel(c.level + 1)) {
    c.level++;
    c.statPoints++;
    if (c.level % 3 === 0) c.techPoints++;
    if (c.kind === 'beast') {
      if (c.level % 2 === 0 || c.level === 2) c.techPoints++;
      autoSpendStatPoints(c);
    }
  }
  return gained;
}

export function spendStatPoint(c: Creature, s: Stat): boolean {
  if (c.statPoints <= 0) return false;
  c.statPoints--;
  c.dom[s]++;
  return true;
}

/** AI / doctore auto-manage: spend points by species weights (class main stat favoured). */
export function autoSpendStatPoints(c: Creature): void {
  const sp = SPECIES[c.species];
  const w = { ...sp.weights };
  if (c.cls) w[CLASSES[c.cls].mainStat] += 3;
  while (c.statPoints > 0) {
    const s = weighted(STATS, STATS.map((k) => w[k]));
    spendStatPoint(c, s);
  }
}

// ---------------------------------------------------------------------------
// Techniques
// ---------------------------------------------------------------------------

export function knownTech(c: Creature, id: TechId) {
  return c.techniques.find((t) => t.id === id);
}

/** Raw stat check (GM: requirements use raw attributes + reincarnation bonus). */
export function meetsRequirement(c: Creature, id: TechId, rank: number): boolean {
  const d = TECHNIQUES[id];
  return rawStat(c, d.stat) >= techRequirement(id, rank);
}

export function isLearnable(c: Creature, id: TechId): boolean {
  const d = TECHNIQUES[id];
  if (c.kind === 'beast') return d.beastOnly === true || ['Charge', 'Headbutt', 'Sunder', 'SneakAttack', 'Disarm', 'Rampage', 'Warcry'].includes(id) || SPECIES[c.species].natural.includes(id);
  if (d.beastOnly) return SPECIES[c.species].natural.includes(id);
  if (LEARNABLE.includes(id)) return true;
  return c.learnable.includes(id) || SPECIES[c.species].natural.includes(id);
}

/** Learn or rank up (costs 1 technique point unless free). */
export function learnTechnique(c: Creature, id: TechId, free = false): boolean {
  const k = knownTech(c, id);
  const nextRank = k ? k.rank + 1 : 1;
  if (k && k.rank >= TECHNIQUES[id].maxRank) return false;
  if (!free && c.techPoints <= 0) return false;
  if (!meetsRequirement(c, id, nextRank)) return false;
  if (!free) c.techPoints--;
  if (k) k.rank = nextRank;
  else c.techniques.push({ id, rank: 1, equipped: true });
  return true;
}

export function learnRandomTechniques(c: Creature, maxEquipped = 2): void {
  let guard = 20;
  while (c.techPoints > 0 && guard-- > 0) {
    const pool = shuffle([...SPECIES[c.species].natural, ...(c.kind === 'beast' ? ['Bite', 'Pounce', 'Charge'] as TechId[] : LEARNABLE.filter((t) => t !== 'Rally' && t !== 'Disarm')), ...c.learnable]);
    const t = pool.find((id) => isLearnable(c, id) && meetsRequirement(c, id, (knownTech(c, id)?.rank ?? 0) + 1));
    if (!t || !learnTechnique(c, t)) break;
  }
  let eq = 0;
  for (const t of c.techniques) {
    t.equipped = eq < maxEquipped;
    if (t.equipped) eq++;
  }
}

export function grantRareLearnable(c: Creature): TechId | undefined {
  const pool = RARE_LEARNABLE.filter((t) => !c.learnable.includes(t) && !knownTech(c, t));
  if (!pool.length) return undefined;
  const t = pick(pool);
  c.learnable.push(t);
  return t;
}

// ---------------------------------------------------------------------------
// Worth and prices
// ---------------------------------------------------------------------------

const WOUNDED_VALUE: TraitId[] = ['Crippled', 'BumLeg', 'Blind'];

/** GM worth (drives battle XP and sale value). */
export function worth(c: Creature): number {
  if (c.kind === 'beast') {
    const s = getStats(c);
    const T = s.agi + s.str + s.cun + s.hp / 4;
    const mythic = hasTrait(c, 'Mythical') ? 5 : 0;
    return Math.floor(T / 2 + T / 5 + 4 * (c.traits.length + 2 * c.techniques.length + mythic) + c.fame / 5);
  }
  let w = c.level * 10 + Math.floor(c.fame / 4) + 5 * c.traits.length + 10;
  if (c.traits.some((t) => WOUNDED_VALUE.includes(t))) w -= 25;
  if (c.speciesLevel >= 2) w += 500 + 5 * (c.level * 10 + Math.floor(c.fame / 4));
  return Math.max(1, w);
}

/** GM market purchase price. */
export function marketPrice(c: Creature): number {
  if (c.price !== undefined) return c.price;
  if (c.kind === 'beast') {
    const m = BEAST_MARKET[c.species as BeastSpeciesId];
    const w = worth(c) * 3 + 10;
    return m ? Math.max(m.price, Math.floor(w * 0.9)) : w;
  }
  const s = getStats(c);
  const n = c.traits.length;
  const traitTerm = n <= 1 ? 50 : n === 2 ? 60 : n === 3 ? 160 : 260;
  let p = 10 * (s.str + s.cun + s.agi) + s.hp + traitTerm + 20 * (c.level - 1) + 10;
  if (c.speciesLevel >= 2) p += 500 + 10 * worth(c);
  if (c.genes.imprint > 0) p += Math.floor(100 * c.genes.imprint);
  if (c.maturity < 1) p = Math.floor(p * (0.5 + 0.5 * c.maturity));
  return Math.max(20, p);
}

/** What the market pays when you sell (GM: worth × 3, capped at 700; genetics give a floor). */
export function salePrice(c: Creature): number {
  const gm = Math.min(700, worth(c) * 3);
  return Math.max(gm, Math.floor(marketPrice(c) * 0.35));
}

/** AI valuation (GM Personality "stat worth"). */
export function statWorth(c: Creature): number {
  const s = getStats(c);
  let v = 15 * (s.cun + s.str + s.agi) + 3 * s.hp + 30 * c.level + 2 * c.fame;
  if (c.injury) v = Math.floor(v / 2 + v / 2 / (c.injury.weeks + 1));
  const e = eqAge(c);
  if (e < 17) v = Math.floor(v * 1.2);
  if (e > 30) v = Math.floor(v * 0.8);
  if (e > 36) v = Math.floor(v * 0.75);
  if (e > 45) v = Math.floor(v * 0.75);
  return v;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function emptyCareer(): CareerStats {
  return { wins: 0, losses: 0, kills: 0, majorWins: 0, tournamentWins: 0, pitBest: 0, biggestHit: 0, battles: 0, trophies: [], leaguePoints: 0 };
}

export function emptyGenes(): Genetics {
  return {
    wild: zeroStats(), colors: [0, 0, 0, 0, 0, 0], mutMatri: 0, mutPatri: 0, mutations: [], mutatedPoints: zeroStats(),
    generation: 0, imprint: 0, bred: false,
  };
}

export function randomColors(species: SpeciesId): number[] {
  const pal = SPECIES[species].palette;
  return pal.map((region) => (chance(0.02) ? rand(COLORS.length) : pick(region)));
}

const usedNames = new Set<string>();
export function randomName(species: SpeciesId, sex: Sex): string {
  const pool = namePool(species, sex === 'F');
  for (let i = 0; i < 6; i++) {
    const n = pick(pool);
    if (!usedNames.has(n)) {
      usedNames.add(n);
      if (usedNames.size > 400) usedNames.clear();
      return n;
    }
  }
  const n = pick(pool);
  const suffix = pick(['II', 'III', 'Minor', 'the Younger', 'IV']);
  return `${n} ${suffix}`;
}

export interface CreatureInit {
  species: SpeciesId;
  sex?: Sex;
  name?: string;
  wild?: Stats;
  genes?: Partial<Genetics>;
  maturity?: number;
  adultWeeks?: number;
  level?: number;
  traits?: TraitId[];
  legend?: string;
  price?: number;
}

/** Build a creature with defaults. Does not add random traits/techniques. */
export function makeCreature(init: CreatureInit): Creature {
  const sp = SPECIES[init.species];
  const sex: Sex = init.sex ?? (chance(0.5) ? 'M' : 'F');
  const genes: Genetics = { ...emptyGenes(), colors: randomColors(init.species), ...(init.genes ?? {}) };
  if (init.wild) genes.wild = { ...init.wild };
  const maturity = init.maturity ?? 1;
  const adultWeeks = init.adultWeeks ?? 0;
  const matureWks = sp.matureWeeks;
  const c: Creature = {
    id: newId('c'), name: init.name ?? randomName(init.species, sex), kind: sp.kind, species: init.species, sex,
    maturity, adultWeeks, ageWeeks: Math.floor(maturity * matureWks) + adultWeeks,
    genes, dom: zeroStats(), bonus: zeroStats(),
    xp: 0, level: 1, statPoints: 0, techPoints: 1, techniques: [], learnable: [], traits: [], cls: null, classXp: 0,
    prof: zeroProf(), loyalty: 80, fame: 0, injury: null, ill: 0, career: emptyCareer(), gear: {}, instruction: 'default',
    inactive: false, rewardCooldown: 0, rebellionGrace: false, speciesLevel: 0, reincarnation: 0, happiness: 0,
    lastGearWorth: 0, mateCooldown: 0, offspring: 0, legend: init.legend, price: init.price,
  };
  for (const t of sp.innateTraits ?? []) {
    addTrait(c, t);
    // beast and mythic stat lines already include their innate traits (GM numbers)
    if (sp.kind === 'beast') for (const s of STATS) c.bonus[s] -= TRAITS[t]?.stats[s] ?? 0;
  }
  for (const t of init.traits ?? []) addTrait(c, t);
  if (sp.kind === 'beast') {
    c.treats = 0;
    for (const t of sp.natural) c.techniques.push({ id: t, rank: 1, equipped: true });
  }
  if (init.level && init.level > 1) setLevelAndStats(c, init.level);
  return c;
}

/** Distribute n wild points by species weights with noise. */
export function distributeWild(species: SpeciesId, n: number): Stats {
  const w = SPECIES[species].weights;
  const out = zeroStats();
  for (let i = 0; i < n; i++) {
    const s = weighted(STATS, STATS.map((k) => w[k] + 1));
    out[s]++;
  }
  return out;
}

/** GM setLevelAndStats adapted: XP to level L, domestic points spent by weights, techniques learned. */
export function setLevelAndStats(c: Creature, L: number): void {
  c.level = Math.max(1, L);
  c.xp = xpForLevel(c.level);
  c.statPoints += c.level - 1;
  c.techPoints += Math.floor(c.level / 3);
  autoSpendStatPoints(c);
  learnRandomTechniques(c, 2);
}

/** GM levelBasedAgeBonus. */
function levelAgeBonus(L: number): number {
  let a = rand(10) + idiv(L, 2);
  if (L > 5) a += 1;
  if (L > 10) a += idiv(L, 4);
  a = Math.min(75, a);
  if (L > 10) a -= 4;
  if (L > 20) a -= rand(12);
  if (L > 40) a -= rand(20);
  return a;
}

function applyEqAge(c: Creature, eq: number, extraWeeks = 0): void {
  if (eq < 18) {
    c.maturity = Math.max(0.45, eq / 18);
    c.adultWeeks = 0;
  } else {
    c.maturity = 1;
    c.adultWeeks = Math.floor((eq - 18) * 52) + extraWeeks;
  }
  c.ageWeeks = Math.floor(c.maturity * SPECIES[c.species].matureWeeks) + c.adultWeeks;
}

export type GenTier = 'normal' | 'cheap' | 'epic';

export interface GenOpts {
  tier?: GenTier;
  level?: number;
  week?: number;
  species?: DinoSpeciesId;
  sex?: Sex;
  eqAge?: number;
  /** extra wild points (week drift, hard mode…) */
  bonusWild?: number;
  allowed?: (s: DinoSpeciesId) => boolean;
}

export function pickSpecies(week: number, tier: GenTier, allowed?: (s: DinoSpeciesId) => boolean): DinoSpeciesId {
  const pool = DINO_SPECIES.filter((s) => {
    const sp = SPECIES[s];
    if (allowed && !allowed(s)) return false;
    if (s === 'giganotosaurus') return week >= 40 && tier === 'epic' ? true : week >= sp.marketFromWeek;
    return tier === 'epic' ? true : week >= sp.marketFromWeek;
  });
  const weights = pool.map((s) => {
    const sp = SPECIES[s];
    let w = sp.marketWeight;
    if (tier === 'epic' && (sp.size === 'L' || sp.size === 'H')) w += 4;
    if (tier === 'cheap' && sp.size === 'S') w += 4;
    return w;
  });
  return weighted(pool, weights);
}

/** Market dino generation (GM RandomGladiator / RandomCheapGladiator / EpicGladiator). */
export function generateDino(o: GenOpts = {}): Creature {
  const tier = o.tier ?? 'normal';
  const week = o.week ?? 1;
  const species = o.species ?? pickSpecies(week, tier, o.allowed);
  const drift = Math.min(10, Math.floor(week / 25)) + (o.bonusWild ?? 0);
  const pts = tier === 'epic' ? 14 + rand(6) : tier === 'cheap' ? 4 + rand(4) : 8 + rand(5);
  const c = makeCreature({ species, sex: o.sex, wild: distributeWild(species, Math.max(0, pts + drift)) });
  const L = Math.max(1, o.level ?? 1);
  // age
  let eq: number;
  if (o.eqAge !== undefined) eq = o.eqAge;
  else {
    const bonus = levelAgeBonus(L);
    const s = c.genes.wild;
    eq = bonus + (tier === 'normal' ? 16 : tier === 'cheap' ? 17 : (s.str + s.agi + s.cun < 8 ? 12 : 13));
    if (tier === 'epic') eq = Math.max(eq, 15.5);
  }
  applyEqAge(c, eq, tier === 'normal' ? 30 : 0);
  if (L > 1) setLevelAndStats(c, L);
  // traits
  addTrait(c, pick(RANDOM_TRAITS));
  if (tier === 'epic' && chance(0.2)) addTrait(c, rand(500) === 444 ? 'Lycanthropy' : pick(RANDOM_TRAITS));
  if (chance(0.05)) addTrait(c, 'Fertile');
  else if (chance(0.03)) addTrait(c, 'Sterile');
  if (chance(0.004)) addTrait(c, 'Albino');
  // techniques
  if (tier === 'epic' || chance(0.1)) {
    const t = grantRareLearnable(c);
    if (tier === 'epic' && t && c.techPoints > 0) learnTechnique(c, t);
  }
  c.fame = Math.max(0, L * 2 - 2);
  if (tier === 'epic') c.epic = true;
  if (c.genes.colors && hasTrait(c, 'Albino')) c.genes.colors = c.genes.colors.map((x, i) => (i === 5 ? 15 : 39));
  return c;
}

/** Market / pit beast. 'standard' matches GM stat lines exactly. */
export function generateBeast(species: BeastSpeciesId, o: { variant?: 'standard' | 'random' | 'strong'; level?: number; sex?: Sex; name?: string } = {}): Creature {
  const sp = SPECIES[species];
  const target = BEAST_MARKET[species]?.stats ?? sp.base;
  const wild = zeroStats();
  for (const s of STATS) wild[s] = Math.max(0, Math.round((target[s] - sp.base[s]) / INC[s]));
  const variant = o.variant ?? 'standard';
  if (variant === 'random') {
    for (const s of STATS) wild[s] = Math.max(0, wild[s] + range(-2, 2));
  } else if (variant === 'strong') {
    wild.str += 5; wild.agi += 3; wild.cun += 1; wild.hp += 2;
  }
  const c = makeCreature({ species, wild, sex: o.sex, name: o.name });
  c.ageWeeks = sp.matureWeeks + rand(80);
  c.adultWeeks = c.ageWeeks - sp.matureWeeks;
  if (o.level && o.level > 1) {
    c.level = o.level;
    c.xp = xpForLevel(o.level);
  }
  if (variant === 'strong') {
    if (chance(0.5)) addTrait(c, 'ThickHide');
    if (chance(0.5)) addTrait(c, 'SurvivalOfTheFittest');
  }
  return c;
}

/** Back-solve wild points so raw stats match a GM stat line (starters, bosses). */
export function solveWild(species: SpeciesId, target: Stats): Stats {
  const sp = SPECIES[species];
  const w = zeroStats();
  for (const s of STATS) w[s] = Math.max(0, Math.round((target[s] - sp.base[s]) / INC[s]));
  return w;
}

/** Named fighter with an exact stat line (used for starters, rivals' legends, event foes). */
export function makeNamed(species: SpeciesId, name: string, stats: Stats, o: Partial<CreatureInit> & { level?: number; eqAge?: number; traits?: TraitId[]; techniques?: [TechId, number][]; cls?: ClassId } = {}): Creature {
  const c = makeCreature({ species, name, wild: solveWild(species, stats), sex: o.sex ?? 'M', legend: o.legend, price: o.price, traits: [] });
  applyEqAge(c, o.eqAge ?? 19);
  for (const t of o.traits ?? []) addTrait(c, t);
  // traits add stat bonuses; subtract them back out of domestic points so the line stays exact
  for (const s of STATS) {
    const diff = rawStat(c, s) - stats[s];
    if (diff !== 0) c.bonus[s] -= Math.trunc(diff / 1);
  }
  if (o.level && o.level > 1) {
    c.level = o.level;
    c.xp = xpForLevel(o.level);
  }
  for (const [t, r] of o.techniques ?? []) {
    const k = c.techniques.find((x) => x.id === t);
    if (k) k.rank = Math.max(k.rank, r);
    else c.techniques.push({ id: t, rank: r, equipped: true });
  }
  if (o.cls) {
    c.cls = o.cls;
    c.classXp = 4;
  }
  return c;
}

export function creatureTitle(c: Creature): string {
  return `${c.nickname ? `${c.nickname} ` : ''}${c.name}`;
}

export function speciesName(c: Creature): string {
  return SPECIES[c.species].name;
}

export function isBreedable(c: Creature): boolean {
  const sp = SPECIES[c.species];
  return sp.repro !== 'none' && !sp.mythic && !hasTrait(c, 'Sterile');
}

export function canFight(c: Creature): boolean {
  if (!canFightAge(c)) return false;
  if (c.away) return false;
  if (c.pregnancy) return false;
  if (c.injury && !(hasTrait(c, 'TrueGrit') && c.injury.weeks <= 1)) return false;
  return true;
}
