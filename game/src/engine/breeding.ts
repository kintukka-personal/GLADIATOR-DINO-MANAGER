// ARK: Survival Evolved breeding (DESIGN.md §4): mating, inheritance (55/45), mutations (3 × 2.5%,
// +2 wild points, colour change, matrilineal/patrilineal counters with the 20 limit), incubation with
// temperature, gestation with twins/triplets, maturation, hand-feeding, imprinting, kibble and the
// ancestry registry.

import type {
  AncestorRecord, Creature, Egg, FoodId, GameState, Genetics, ID, ImprintRequest, Ludus, MutationRecord, Sex,
  SpeciesId, Stat, Stats, TraitId,
} from './types';
import { STATS } from './types';
import { SPECIES } from './data/species';
import { TRAITS, RANDOM_TRAITS } from './data/traits';
import { COLORS } from './data/colors';
import { FOODS, KIBBLE_FOR_TIER, TIER_FOR_EGG, EGG_SALE, EGG_BASE_PRICE } from './data/food';
import { chance, coin, pick, rand, random, clamp } from './rng';
import { newId, zeroStats, message, report, achieve, hasUpgrade, findCreature } from './util';
import {
  addTrait, distributeWild, emptyGenes, hasTrait, isAdult, isBreedable, makeCreature, randomColors, randomName,
  wildLevel,
} from './creature';
import { buildingTotals } from './buildings';
import { committedSpies } from './economy';

export const MUTATION_CHANCE = 0.025;
export const MUTATION_ROLLS = 3;
export const MUTATION_LIMIT = 20;
export const MUTATION_POINTS = 2;
export const WILD_CAP = 255;
export const HIGHER_STAT_CHANCE = 0.55;
export const TWIN_CHANCE = 0.05;
export const TRIPLET_CHANCE = 0.01;
export const UNFERTILIZED_EGG_CHANCE = 0.25;
export const NURSERY_DEATH = 0.15;
export const STARVE_DEATH = 0.25;
export const EGG_FUEL = 3;

// ---------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------

/** Capua's ambient temperature for a week (°C) before daily noise: spring at week 1. */
export function seasonalTemperature(week: number): number {
  return 21 + 9 * Math.sin((2 * Math.PI * (week - 13)) / 52);
}

/** Roll this week's ambient temperature (stored in world.temperature). */
export function rollTemperature(week: number): number {
  return Math.round(seasonalTemperature(week) + (random() * 8 - 4));
}

export function seasonName(week: number): string {
  const w = ((week - 1) % 52 + 52) % 52;
  if (w < 13) return 'Spring';
  if (w < 26) return 'Summer';
  if (w < 39) return 'Autumn';
  return 'Winter';
}

// ---------------------------------------------------------------------------
// Eligibility and pairs
// ---------------------------------------------------------------------------

export function pairCapacity(h: Ludus): number {
  return buildingTotals(h).pairs;
}

export function eggCapacity(h: Ludus): number {
  return Math.max(1, buildingTotals(h).eggSlots);
}

export function nurseryCapacity(h: Ludus): number {
  return Math.max(1, buildingTotals(h).nurserySlots);
}

/** Why this creature cannot breed right now (null = it can). */
export function breedingIssue(c: Creature): string | null {
  if (!isBreedable(c)) return hasTrait(c, 'Sterile') ? `${c.name} is sterile.` : `${SPECIES[c.species].name}s cannot be bred.`;
  if (!isAdult(c)) return `${c.name} is not fully grown.`;
  if (c.away) return `${c.name} is away.`;
  if (c.injury && c.injury.weeks > 1) return `${c.name} is injured.`;
  if (c.ill > 0) return `${c.name} is ill.`;
  if (c.pregnancy) return `${c.name} is already pregnant.`;
  return null;
}

export function pairIssue(h: Ludus, male: Creature, female: Creature): string | null {
  if (male.sex !== 'M' || female.sex !== 'F') return 'A pair needs one male and one female.';
  if (male.species !== female.species) return 'Only creatures of the same species can mate.';
  return breedingIssue(male) ?? breedingIssue(female);
}

export function isPaired(h: Ludus, c: Creature): boolean {
  return h.pairs.some((p) => p.femaleId === c.id || p.maleId === c.id);
}

/** A paired female with no cooldown mates this week and cannot fight. */
export function matingThisWeek(h: Ludus, c: Creature): boolean {
  if (c.sex !== 'F') return false;
  return h.pairs.some((p) => p.femaleId === c.id) && c.mateCooldown <= 0 && !c.pregnancy;
}

export function assignPair(state: GameState, maleId: ID, femaleId: ID): string | null {
  const h = state.player.ludus;
  const male = h.creatures.find((c) => c.id === maleId);
  const female = h.creatures.find((c) => c.id === femaleId);
  if (!male || !female) return 'Both creatures must be in your ludus.';
  const issue = pairIssue(h, male, female);
  if (issue) return issue;
  if (h.pairs.some((p) => p.femaleId === femaleId)) return `${female.name} is already paired.`;
  if (h.pairs.length >= pairCapacity(h)) {
    return pairCapacity(h) === 0 ? 'Build a Breeding Pen first.' : 'The Breeding Pen is full. Upgrade it for more pairs.';
  }
  h.pairs.push({ maleId, femaleId, since: state.world.week });
  return null;
}

export function removePair(state: GameState, femaleId: ID): void {
  const h = state.player.ludus;
  h.pairs = h.pairs.filter((p) => p.femaleId !== femaleId);
}

/** Drop pairs whose members left, died or can no longer breed. */
export function cleanPairs(h: Ludus): void {
  h.pairs = h.pairs.filter((p) => {
    const m = h.creatures.find((c) => c.id === p.maleId);
    const f = h.creatures.find((c) => c.id === p.femaleId);
    return !!m && !!f && isBreedable(m) && isBreedable(f);
  });
}

// ---------------------------------------------------------------------------
// Genetics
// ---------------------------------------------------------------------------

interface ParentGenes { id?: ID; name?: string; wild: Stats; colors: number[]; mutMatri: number; mutPatri: number; mutatedPoints: Stats; generation: number; traits: TraitId[] }

export function parentGenes(c: Creature): ParentGenes {
  return {
    id: c.id, name: c.name, wild: { ...c.genes.wild }, colors: [...c.genes.colors], mutMatri: c.genes.mutMatri,
    mutPatri: c.genes.mutPatri, mutatedPoints: { ...c.genes.mutatedPoints }, generation: c.genes.generation,
    traits: [...c.traits],
  };
}

export function totalMutations(g: { mutMatri: number; mutPatri: number }): number {
  return g.mutMatri + g.mutPatri;
}

/**
 * Roll one offspring's genetics (ARK rules).
 *  - each stat: higher parent's value with 55%, lower with 45%
 *  - each colour region: random parent
 *  - counters: matri = mother total, patri = father total
 *  - 3 mutation rolls, each: random parent; blocked if that parent has ≥ 20 total; 2.5% chance;
 *    random stat takes that parent's value + 2; one random colour region mutates; that side's counter +1
 */
export function rollOffspringGenes(mother: ParentGenes, father: ParentGenes, week: number, mutationBonus = 0): Genetics {
  const wild = zeroStats();
  const mutatedPoints = zeroStats();
  for (const s of STATS) {
    const m = mother.wild[s];
    const f = father.wild[s];
    const higherIsMother = m >= f;
    const takeHigher = chance(HIGHER_STAT_CHANCE);
    const fromMother = takeHigher ? higherIsMother : !higherIsMother;
    wild[s] = fromMother ? m : f;
    mutatedPoints[s] = fromMother ? mother.mutatedPoints[s] : father.mutatedPoints[s];
  }
  const colors = mother.colors.map((c, i) => (coin() ? c : father.colors[i] ?? c));
  let mutMatri = totalMutations(mother);
  let mutPatri = totalMutations(father);
  const mutations: MutationRecord[] = [];
  for (let i = 0; i < MUTATION_ROLLS; i++) {
    const fromFather = coin();
    const parent = fromFather ? father : mother;
    if (totalMutations(parent) >= MUTATION_LIMIT) continue;
    if (!chance(MUTATION_CHANCE + mutationBonus)) continue;
    const stat: Stat = pick(STATS);
    // the mutated stat comes from the mutating parent; a second mutation on the same stat stacks
    const already = mutations.some((m) => m.stat === stat);
    let v = (already ? wild[stat] : parent.wild[stat]) + MUTATION_POINTS;
    if (v > WILD_CAP) v -= WILD_CAP + 1; // ARK overflow
    wild[stat] = v;
    mutatedPoints[stat] = (already ? mutatedPoints[stat] : parent.mutatedPoints[stat]) + MUTATION_POINTS;
    const region = rand(6);
    const color = rand(COLORS.length);
    colors[region] = color;
    if (fromFather) mutPatri++;
    else mutMatri++;
    mutations.push({ stat, side: fromFather ? 'patri' : 'matri', week, color });
  }
  return {
    wild, colors, mutMatri, mutPatri, mutations, mutatedPoints,
    generation: Math.max(mother.generation, father.generation) + 1,
    motherId: mother.id, fatherId: father.id, motherName: mother.name, fatherName: father.name,
    imprint: 0, bred: true,
  };
}

/** Heritable traits: each one a parent has passes with 30% (55% if both have it), max 3. */
export function inheritTraits(mother: ParentGenes, father: ParentGenes): TraitId[] {
  const out: TraitId[] = [];
  const pool = new Set<TraitId>([...mother.traits, ...father.traits].filter((t) => TRAITS[t]?.heritable));
  for (const t of pool) {
    if (out.length >= 3) break;
    const both = mother.traits.includes(t) && father.traits.includes(t);
    if (chance(both ? 0.55 : 0.3)) out.push(t);
  }
  // Titan passes on as Giant (GM reincarnation rule, reused for bloodlines)
  if (out.length < 3 && (mother.traits.includes('Titan') || father.traits.includes('Titan')) && !out.includes('Giant') && chance(0.3)) out.push('Giant');
  if (out.includes('Fertile') && out.includes('Sterile')) out.splice(out.indexOf('Sterile'), 1);
  return out;
}

function mutationBonusFor(state: GameState): number {
  return hasUpgrade(state, 'geneticist') ? 0.005 : 0;
}

// ---------------------------------------------------------------------------
// Ancestry registry
// ---------------------------------------------------------------------------

export function ancestorRecord(c: Creature, house?: string, fate?: string): AncestorRecord {
  return {
    id: c.id, name: c.name, species: c.species, sex: c.sex, wild: { ...c.genes.wild }, colors: [...c.genes.colors],
    mutMatri: c.genes.mutMatri, mutPatri: c.genes.mutPatri, mutations: [...c.genes.mutations], generation: c.genes.generation,
    motherId: c.genes.motherId, fatherId: c.genes.fatherId, imprint: c.genes.imprint, level: c.level, fame: c.fame, fate, house,
  };
}

export function registerAncestor(state: GameState, c: Creature, house?: string, fate?: string): void {
  const prev = state.ancestry[c.id];
  state.ancestry[c.id] = { ...ancestorRecord(c, house ?? prev?.house, fate ?? prev?.fate) };
  const keys = Object.keys(state.ancestry);
  if (keys.length > 900) {
    // prune the oldest records that are nobody's parent
    const parents = new Set<string>();
    for (const r of Object.values(state.ancestry)) {
      if (r.motherId) parents.add(r.motherId);
      if (r.fatherId) parents.add(r.fatherId);
    }
    for (const k of keys) {
      if (Object.keys(state.ancestry).length <= 800) break;
      if (!parents.has(k) && state.ancestry[k].fate) delete state.ancestry[k];
    }
  }
}

export function markFate(state: GameState, c: Creature, fate: string): void {
  if (c.genes.bred || c.offspring > 0 || state.ancestry[c.id]) registerAncestor(state, c, undefined, fate);
}

export interface PedigreeNode {
  id: ID; name: string; species: SpeciesId; sex: Sex; wild: Stats; mutMatri: number; mutPatri: number;
  generation: number; alive: boolean; imprint: number; fate?: string; mother?: PedigreeNode; father?: PedigreeNode;
}

export function pedigree(state: GameState, id: ID | undefined, depth = 3): PedigreeNode | undefined {
  if (!id || depth < 0) return undefined;
  const live = findCreature(state, id)?.creature;
  const rec = live ? ancestorRecord(live) : state.ancestry[id];
  if (!rec) return undefined;
  return {
    id: rec.id, name: rec.name, species: rec.species, sex: rec.sex, wild: rec.wild, mutMatri: rec.mutMatri, mutPatri: rec.mutPatri,
    generation: rec.generation, alive: !!live, imprint: rec.imprint, fate: live ? undefined : rec.fate,
    mother: depth > 0 ? pedigree(state, rec.motherId, depth - 1) : undefined,
    father: depth > 0 ? pedigree(state, rec.fatherId, depth - 1) : undefined,
  };
}

/** Living offspring of a creature anywhere in the world. */
export function offspringOf(state: GameState, id: ID): Creature[] {
  const out: Creature[] = [];
  for (const h of [state.player.ludus, ...state.rivals]) {
    for (const c of h.creatures) if (c.genes.motherId === id || c.genes.fatherId === id) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Births
// ---------------------------------------------------------------------------

/** Build a newborn from rolled genetics. */
export function makeNewborn(state: GameState, h: Ludus, species: SpeciesId, genes: Genetics, sex: Sex, inherited: TraitId[]): Creature {
  const c = makeCreature({ species, sex, genes, maturity: 0, adultWeeks: 0 });
  c.genes = { ...genes };
  c.name = randomName(species, sex, new Set(h.creatures.map((x) => x.name)));
  c.ageWeeks = 0;
  c.loyalty = 70;
  c.bornWeek = state.world.week;
  c.hatchedAt = h.name;
  for (const t of inherited) addTrait(c, t);
  if (chance(0.5)) {
    const t = pick(RANDOM_TRAITS);
    if (!c.traits.includes(t)) addTrait(c, t);
  }
  if (chance(0.04) && !c.traits.includes('Runt')) addTrait(c, 'Runt');
  if (h.isPlayer) addTrait(c, 'Hatchling');
  const sp = SPECIES[species];
  if (sp.kind === 'dino' && sp.natural[0] && !c.techniques.length) c.techniques.push({ id: sp.natural[0], rank: 1, equipped: true });
  c.techPoints = Math.max(c.techPoints, 1);
  if (hasTrait(c, 'Albino')) c.genes.colors = c.genes.colors.map((x, i) => (i === 5 ? 15 : 39));
  return c;
}

function noteBirthStats(state: GameState, h: Ludus, baby: Creature): void {
  if (!h.isPlayer) return;
  state.runStats.hatched++;
  state.runStats.mutations += baby.genes.mutations.length;
  state.runStats.maxGeneration = Math.max(state.runStats.maxGeneration, baby.genes.generation);
  state.player.counters.hatched = (state.player.counters.hatched ?? 0) + 1;
  achieve(state, 'firstClutch');
  if (baby.genes.mutations.length > 0) achieve(state, 'mutant');
  if (baby.genes.mutations.length >= 3) achieve(state, 'tripleMutation');
  if (baby.genes.generation >= 5) achieve(state, 'dynasty');
  if ((state.player.counters.hatched ?? 0) >= 10) achieve(state, 'breeder');
  if (STATS.some((s) => baby.genes.wild[s] >= 40)) achieve(state, 'apexBloodline');
}

/** Hatch an incubated egg into the ludus. */
export function hatchEgg(state: GameState, h: Ludus, egg: Egg): Creature {
  const genes = egg.genes ?? {
    ...emptyGenes(), wild: distributeWild(egg.species, 8 + rand(6)), colors: randomColors(egg.species), bred: true, generation: 1,
  };
  const inherited: TraitId[] = [];
  const mother = egg.motherId ? findCreature(state, egg.motherId)?.creature : undefined;
  const father = egg.fatherId ? findCreature(state, egg.fatherId)?.creature : undefined;
  if (mother && father) inherited.push(...inheritTraits(parentGenes(mother), parentGenes(father)));
  else if (egg.genes && (egg as Egg & { traits?: TraitId[] }).traits) inherited.push(...((egg as Egg & { traits?: TraitId[] }).traits ?? []));
  const baby = makeNewborn(state, h, egg.species, genes, egg.sex ?? (coin() ? 'M' : 'F'), inherited);
  h.creatures.push(baby);
  h.eggs = h.eggs.filter((e) => e.id !== egg.id);
  registerAncestor(state, baby, h.name);
  if (mother) mother.offspring++;
  if (father) father.offspring++;
  noteBirthStats(state, h, baby);
  return baby;
}

/** Conceive: lay a fertilized egg or start a pregnancy. */
export function conceive(state: GameState, h: Ludus, male: Creature, female: Creature): string {
  const sp = SPECIES[female.species];
  const mg = parentGenes(female);
  const fg = parentGenes(male);
  registerAncestor(state, female, h.name);
  registerAncestor(state, male, h.name);
  const bonus = h.isPlayer ? mutationBonusFor(state) : 0;
  female.mateCooldown = Math.max(1, hasTrait(female, 'Fertile') ? Math.ceil(sp.mateCooldown / 2) : sp.mateCooldown);
  if (sp.repro === 'gestation') {
    const fertile = hasTrait(female, 'Fertile') ? 2 : 1;
    const n = chance(TRIPLET_CHANCE * fertile) ? 3 : chance(TWIN_CHANCE * fertile) ? 2 : 1;
    const litter: Genetics[] = [];
    const sexes: Sex[] = [];
    for (let i = 0; i < n; i++) {
      litter.push(rollOffspringGenes(mg, fg, state.world.week, bonus));
      sexes.push(coin() ? 'M' : 'F');
    }
    female.pregnancy = { weeksLeft: Math.max(1, sp.gestationWeeks), fatherId: male.id, litter, sexes };
    return `${female.name} is pregnant by ${male.name}.`;
  }
  const genes = rollOffspringGenes(mg, fg, state.world.week, bonus);
  const egg: Egg & { traits?: TraitId[] } = {
    id: newId('e'), species: female.species, fertilized: true, motherId: female.id, fatherId: male.id,
    motherName: female.name, fatherName: male.name, genes, sex: coin() ? 'M' : 'F', health: 1, progress: 0,
    needed: Math.max(1, sp.incubWeeks), laidWeek: state.world.week, source: 'bred', known: true,
  };
  egg.traits = inheritTraits(mg, fg);
  h.eggs.push(egg);
  return `${female.name} laid a fertilized ${sp.name} egg (sire ${male.name}).`;
}

function giveBirth(state: GameState, h: Ludus, mother: Creature): Creature[] {
  const p = mother.pregnancy;
  if (!p) return [];
  const father = findCreature(state, p.fatherId)?.creature;
  const fg = father ? parentGenes(father) : undefined;
  const babies: Creature[] = [];
  p.litter.forEach((genes, i) => {
    const inherited = fg ? inheritTraits(parentGenes(mother), fg) : [];
    const baby = makeNewborn(state, h, mother.species, genes, p.sexes[i] ?? 'F', inherited);
    h.creatures.push(baby);
    registerAncestor(state, baby, h.name);
    noteBirthStats(state, h, baby);
    babies.push(baby);
  });
  mother.offspring += babies.length;
  if (father) father.offspring += babies.length;
  if (babies.length >= 2 && h.isPlayer) achieve(state, 'twins');
  mother.pregnancy = undefined;
  return babies;
}

// ---------------------------------------------------------------------------
// Weekly steps
// ---------------------------------------------------------------------------

export interface BreedingWeekResult { lines: string[]; born: Creature[]; hatched: Creature[]; died: string[] }

/** Mating, births, unfertilized eggs and cooldowns for one house. */
export function breedingWeek(state: GameState, h: Ludus): BreedingWeekResult {
  const res: BreedingWeekResult = { lines: [], born: [], hatched: [], died: [] };
  cleanPairs(h);
  // pregnancies
  for (const c of h.creatures) {
    if (c.pregnancy) {
      c.pregnancy.weeksLeft--;
      if (c.pregnancy.weeksLeft <= 0) {
        const babies = giveBirth(state, h, c);
        res.born.push(...babies);
        res.lines.push(`${c.name} gave birth to ${babies.length === 1 ? 'a baby' : babies.length === 2 ? 'twins' : 'triplets'}: ${babies.map((b) => b.name).join(', ')}.`);
      }
    }
  }
  // mating
  for (const p of h.pairs) {
    const male = h.creatures.find((c) => c.id === p.maleId);
    const female = h.creatures.find((c) => c.id === p.femaleId);
    if (!male || !female) continue;
    if (female.mateCooldown > 0 || female.pregnancy) continue;
    if (pairIssue(h, male, female)) continue;
    const fertile = SPECIES[female.species].repro === 'egg';
    if (fertile && h.eggs.filter((e) => e.fertilized).length >= eggCapacity(h) + 2) {
      res.lines.push(`${female.name} did not lay: the hatchery is overflowing.`);
      continue;
    }
    res.lines.push(conceive(state, h, male, female));
  }
  // unfertilized eggs
  const paired = new Set(h.pairs.map((p) => p.femaleId));
  for (const c of h.creatures) {
    if (c.sex !== 'F' || !isAdult(c) || c.pregnancy || paired.has(c.id)) continue;
    const sp = SPECIES[c.species];
    if (sp.repro !== 'egg' || sp.mythic) continue;
    if (c.away || c.injury) continue;
    if (chance(UNFERTILIZED_EGG_CHANCE)) {
      h.eggs.push({
        id: newId('e'), species: c.species, fertilized: false, motherId: c.id, motherName: c.name, health: 1, progress: 0,
        needed: 0, laidWeek: state.world.week, source: 'bred', known: true,
      });
    }
  }
  // spoil old unfertilized eggs (8 weeks)
  const before = h.eggs.length;
  h.eggs = h.eggs.filter((e) => e.fertilized || state.world.week - e.laidWeek < 8);
  if (h.isPlayer && h.eggs.length < before) res.lines.push(`${before - h.eggs.length} unfertilized egg(s) spoiled.`);
  // cooldowns
  for (const c of h.creatures) if (c.mateCooldown > 0) c.mateCooldown--;
  return res;
}

/** Effective incubation temperature of an egg given the hatchery's control. */
export function eggTemperature(state: GameState, h: Ludus, egg: Egg, controlled: boolean): number {
  const T = state.world.temperature;
  if (!controlled) return T;
  const control = buildingTotals(h).tempControl;
  const [lo, hi] = SPECIES[egg.species].tempRange;
  const ideal = (lo + hi) / 2;
  const diff = ideal - T;
  if (Math.abs(diff) <= control) return Math.round(ideal);
  return Math.round(T + Math.sign(diff) * control);
}

/** Which fertilized eggs get a hatchery slot (oldest first). */
export function controlledEggs(h: Ludus): Set<ID> {
  const slots = buildingTotals(h).eggSlots;
  const fert = h.eggs.filter((e) => e.fertilized).sort((a, b) => a.laidWeek - b.laidWeek);
  return new Set(fert.slice(0, slots).map((e) => e.id));
}

/** Temperature, health and progress for every fertilized egg; hatch the ready ones. */
export function incubationWeek(state: GameState, h: Ludus): BreedingWeekResult {
  const res: BreedingWeekResult = { lines: [], born: [], hatched: [], died: [] };
  const slots = buildingTotals(h).eggSlots;
  const fertile = h.eggs.filter((e) => e.fertilized).sort((a, b) => a.laidWeek - b.laidWeek);
  // Hatchery slots get temperature control. Without a hatchery the oldest egg sits in a straw nest at
  // ambient temperature; any other egg lies in the open and only loses health.
  let fuel = 0;
  fertile.forEach((egg, i) => {
    const inHatchery = i < slots;
    const inNest = slots === 0 && i === 0;
    const open = !inHatchery && !inNest;
    if (inHatchery) fuel += EGG_FUEL;
    const t = eggTemperature(state, h, egg, inHatchery);
    egg.lastTemp = t;
    const [lo, hi] = SPECIES[egg.species].tempRange;
    const d = t < lo ? lo - t : t > hi ? t - hi : 0;
    if (!open && d === 0) {
      egg.progress++;
      egg.health = Math.min(1, egg.health + 0.1);
    } else {
      egg.health = Math.max(0, egg.health - (d > 0 ? 0.08 * d : 0) - (open ? 0.1 : 0));
    }
    if (egg.health <= 0) {
      h.eggs = h.eggs.filter((e) => e.id !== egg.id);
      res.died.push(`${SPECIES[egg.species].name} egg`);
      res.lines.push(`A ${SPECIES[egg.species].name} egg died: it was kept at ${t}°C (needs ${lo}–${hi}°C).`);
    } else if (egg.progress >= egg.needed) {
      const baby = hatchEgg(state, h, egg);
      res.hatched.push(baby);
      res.lines.push(`${baby.name} the ${SPECIES[baby.species].name} hatched!${baby.genes.mutations.length ? ` ${baby.genes.mutations.length} mutation${baby.genes.mutations.length > 1 ? 's' : ''}!` : ''}`);
    }
  });
  if (fuel > 0) {
    h.denarii -= fuel;
    if (h.isPlayer) report(state, 'expense', 'Hatchery braziers and shade', -fuel);
  }
  return res;
}

export function dietFood(c: Creature): FoodId {
  return SPECIES[c.species].diet === 'herb' ? 'mejoberries' : 'rawMeat';
}

export function preferredKibble(c: { species: SpeciesId }): FoodId {
  return KIBBLE_FOR_TIER[SPECIES[c.species].kibble];
}

/** Take one unit of food from the pantry, buying it if needed. Returns false if unaffordable. */
export function consumeFood(state: GameState, h: Ludus, food: FoodId): boolean {
  const have = h.pantry[food] ?? 0;
  if (have > 0) {
    h.pantry[food] = have - 1;
    return true;
  }
  const price = state.world.market.foodPrices?.[food] ?? FOODS[food].price;
  if (h.denarii >= price) {
    h.denarii -= price;
    return true;
  }
  return false;
}

/** New imprint request for a maturing bred creature (ARK care requests). */
export function rollImprintRequest(c: Creature): ImprintRequest {
  const r = random();
  if (r < 0.4) return { kind: 'cuddle', done: false };
  if (r < 0.65) return { kind: 'walk', done: false };
  const herb = SPECIES[c.species].diet === 'herb';
  const k = random();
  let food: FoodId;
  if (k < 0.55) food = preferredKibble(c);
  else if (herb) food = 'mejoberries';
  else food = k < 0.8 ? 'rawMeat' : 'primeMeat';
  return { kind: 'feed', food, done: false };
}

export function imprintStep(c: Creature): number {
  return 1 / Math.max(1, SPECIES[c.species].matureWeeks);
}

/** Player fulfils the current care request (Nursery screen). */
export function fulfillImprint(state: GameState, creatureId: ID): string | null {
  const h = state.player.ludus;
  const c = h.creatures.find((x) => x.id === creatureId);
  if (!c) return 'Creature not found.';
  const req = c.imprintRequest;
  if (!req || req.done) return 'No care request right now.';
  if (req.kind === 'walk' && (c.injury || c.ill > 0)) return `${c.name} is too unwell to walk.`;
  if (req.kind === 'feed' && req.food) {
    if ((h.pantry[req.food] ?? 0) <= 0) return `You need ${FOODS[req.food].name} in the pantry.`;
    h.pantry[req.food] = (h.pantry[req.food] ?? 0) - 1;
  }
  req.done = true;
  return null;
}

/** Maturation, hand-feeding, nursery capacity, imprint resolution and new requests. */
export function nurseryWeek(state: GameState, h: Ludus, newlyBorn: Set<ID> = new Set()): BreedingWeekResult {
  const res: BreedingWeekResult = { lines: [], born: [], hatched: [], died: [] };
  const babies = h.creatures.filter((c) => c.maturity < 0.1);
  const cap = nurseryCapacity(h);
  const unhoused = new Set(babies.slice(cap).map((c) => c.id));
  const dead: Creature[] = [];
  for (const c of [...h.creatures]) {
    if (c.maturity >= 1) {
      c.imprintRequest = null;
      continue;
    }
    if (newlyBorn.has(c.id)) {
      if (c.genes.bred) c.imprintRequest = rollImprintRequest(c);
      continue;
    }
    // imprint resolution
    if (c.genes.bred && c.imprintRequest) {
      if (c.imprintRequest.done) {
        const step = imprintStep(c);
        c.genes.imprint = Math.min(1, c.genes.imprint + step);
        if (c.genes.imprint > 0.999) c.genes.imprint = 1;
        c.loyalty = Math.min(100, c.loyalty + 30 * step);
      } else if (h.isPlayer) {
        res.lines.push(`${c.name}'s care request went unanswered.`);
      }
      c.imprintRequest = null;
    }
    // feeding (babies and juveniles)
    let fed = true;
    if (c.maturity < 0.5) fed = consumeFood(state, h, dietFood(c));
    if (!fed) {
      c.hungerWeeks = (c.hungerWeeks ?? 0) + 1;
      if (chance(STARVE_DEATH)) dead.push(c);
      else res.lines.push(`${c.name} went hungry and did not grow.`);
    } else {
      c.hungerWeeks = 0;
      if (unhoused.has(c.id) && chance(NURSERY_DEATH)) {
        dead.push(c);
      } else {
        const wasAdult = c.maturity >= 1;
        c.maturity = Math.min(1, c.maturity + 1 / Math.max(1, SPECIES[c.species].matureWeeks));
        if (c.maturity > 0.999) c.maturity = 1;
        if (!wasAdult && c.maturity >= 1) {
          c.adultWeeks = 0;
          if (h.isPlayer) {
            res.lines.push(`${c.name} is fully grown${c.genes.bred ? ` (imprint ${Math.round(c.genes.imprint * 100)}%)` : ''}.`);
            if (c.genes.bred && c.genes.imprint >= 0.999) achieve(state, 'fullImprint');
          }
        }
      }
    }
    if (c.maturity < 1 && c.genes.bred && !dead.includes(c)) c.imprintRequest = rollImprintRequest(c);
  }
  for (const c of dead) {
    h.creatures = h.creatures.filter((x) => x.id !== c.id);
    markFate(state, c, (c.hungerWeeks ?? 0) > 0 ? 'Starved as a hatchling' : 'Died in an overcrowded nursery');
    res.died.push(c.name);
    res.lines.push(`${c.name} died ${(c.hungerWeeks ?? 0) > 0 ? 'of hunger' : 'in the overcrowded nursery'}.`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Kitchen and eggs
// ---------------------------------------------------------------------------

export function kibbleFromEgg(egg: Egg): FoodId {
  return KIBBLE_FOR_TIER[TIER_FOR_EGG[SPECIES[egg.species].eggSize]];
}

export function craftKibble(state: GameState, eggId: ID, base: 'rawMeat' | 'mejoberries' = 'rawMeat'): string | null {
  const h = state.player.ludus;
  if (!buildingTotals(h).kitchen) return 'Build a Kitchen first.';
  const egg = h.eggs.find((e) => e.id === eggId);
  if (!egg) return 'Egg not found.';
  if (egg.fertilized) return 'Fertilized eggs should hatch, not go in the pot.';
  if ((h.pantry[base] ?? 0) <= 0 && h.denarii < FOODS[base].price + 10) return `You need ${FOODS[base].name}.`;
  if (h.denarii < 10) return 'You need 10 denarii.';
  if ((h.pantry[base] ?? 0) > 0) h.pantry[base] = (h.pantry[base] ?? 0) - 1;
  else h.denarii -= FOODS[base].price;
  h.denarii -= 10;
  const k = kibbleFromEgg(egg);
  h.pantry[k] = (h.pantry[k] ?? 0) + 1;
  h.eggs = h.eggs.filter((e) => e.id !== eggId);
  return null;
}

export function eggValue(egg: Egg): number {
  const sp = SPECIES[egg.species];
  if (!egg.fertilized) return EGG_SALE[sp.eggSize];
  const base = EGG_BASE_PRICE[sp.eggSize];
  const wl = egg.genes ? wildLevel({ genes: egg.genes }) : 10;
  return Math.floor(base * (1 + wl / 30) * Math.max(0.3, egg.health));
}

export function sellEggValue(egg: Egg): number {
  return egg.fertilized ? Math.floor(eggValue(egg) * 0.5) : eggValue(egg);
}

export function eggVisible(state: GameState, egg: Egg): boolean {
  if (egg.known) return true;
  return hasUpgrade(state, 'geneticist') || committedSpies(state, state.player.ludus) >= 3;
}

/** A fertilized egg for the market: simulated wild parents, real inheritance. */
export function generateMarketEgg(state: GameState, species: SpeciesId): Egg {
  const sp = SPECIES[species];
  const drift = Math.min(10, Math.floor(state.world.week / 25));
  const wildParent = (sex: Sex): ParentGenes => ({
    wild: distributeWild(species, 8 + rand(6) + drift), colors: randomColors(species), mutMatri: 0, mutPatri: 0,
    mutatedPoints: zeroStats(), generation: 0, traits: [], name: sex === 'F' ? 'a wild dam' : 'a wild sire',
  });
  const genes = rollOffspringGenes(wildParent('F'), wildParent('M'), state.world.week);
  const egg: Egg = {
    id: newId('e'), species, fertilized: true, genes, sex: coin() ? 'M' : 'F', health: 0.8 + random() * 0.2, progress: 0,
    needed: Math.max(1, sp.incubWeeks), laidWeek: state.world.week, source: 'market', known: false,
    motherName: 'wild', fatherName: 'wild',
  };
  egg.price = eggValue(egg);
  return egg;
}

// ---------------------------------------------------------------------------
// AI breeding (DESIGN §4.9)
// ---------------------------------------------------------------------------

export function aiBreedingWeek(state: GameState, r: Ludus): Creature | null {
  const every = state.world.difficulty.hard ? 6 : 8;
  if (state.world.week % every !== 0 || !chance(0.5)) return null;
  if (r.creatures.length >= 9) return null;
  const adults = r.creatures.filter((c) => !breedingIssue(c));
  for (const f of adults.filter((c) => c.sex === 'F')) {
    const m = adults.find((c) => c.sex === 'M' && c.species === f.species);
    if (!m) continue;
    const genes = rollOffspringGenes(parentGenes(f), parentGenes(m), state.world.week);
    genes.imprint = 0.3 + random() * 0.5;
    const baby = makeNewborn(state, r, f.species, genes, coin() ? 'M' : 'F', inheritTraits(parentGenes(f), parentGenes(m)));
    baby.maturity = 0.5;
    baby.ageWeeks = Math.floor(SPECIES[f.species].matureWeeks / 2);
    baby.loyalty = clamp(70 + Math.round(30 * genes.imprint), 0, 100);
    r.creatures.push(baby);
    registerAncestor(state, f, r.name);
    registerAncestor(state, m, r.name);
    registerAncestor(state, baby, r.name);
    f.offspring++;
    m.offspring++;
    f.mateCooldown = SPECIES[f.species].mateCooldown;
    return baby;
  }
  return null;
}

/** Messages for the player's breeding week (called by week.ts). */
export function breedingReport(state: GameState, lines: string[]): void {
  for (const l of lines) report(state, 'info', l);
  if (lines.length) message(state, 'hatchery', 'Hatchery report', lines.join('\n'));
}
