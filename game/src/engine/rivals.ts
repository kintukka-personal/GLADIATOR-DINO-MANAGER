// Rival houses: seeding, personalities, AI weekly routine, catch-up help. OWNER: world-arena agent. GM 03 §5.
//
// The shared house steps (economy, aging, training, tameness, breeding) run for every house in week.ts
// `houseWeek`; this module adds the AI's own decisions (GM Opponent.ResolveAIWeekCascading minus those).
// Rival scheming against the player lives in intrigue.ts.

import type {
  BeastSpeciesId, BuildingId, ClassId, Creature, GameState, Gear, Instruction, KeeperJob, Ludus, Preference, RivalKey,
  Stats, TraitId, TransferOffer,
} from './types';
import {
  RIVAL_SEEDS, STARTING_RIVALS, SPENDING_BUFFER, CLASS_THRESHOLD, HONESTY_EXTRA, BUILD_PRIORITY, AI_SURGERY_TRAITS,
  DEFEAT_HERALD, UNKNOWN_GEAR, type RivalSeed,
} from './data/rivalsData';
import { LEGENDS, buildNamed } from './data/arenaData';
import { HOUSE_NAMES } from './data/names';
import { GEAR, makeGear, gearWorth, gearName } from './data/gear';
import { CLASSES, CLASS_IDS } from './data/classes';
import { RANDOM_TRAITS, WEEKLY_TRAITS } from './data/traits';
import { BEAST_MARKET, SPECIES } from './data/species';
import { TECHNIQUES } from './data/techniques';
import { chance, clamp, coin, pick, rand, range, shuffle } from './rng';
import { achieve, asc, ASC, hasUpgrade, message, newId, visibleRivals } from './util';
import {
  addTrait, autoSpendStatPoints, canFight, classProficiency, eqAge, generateBeast, generateDino, getStats, grantXp,
  hasTrait, learnRandomTechniques, makeNamed, marketPrice, removeTrait, salePrice, setLevelAndStats, statWorth, worth,
  xpForLevel,
} from './creature';
import { makeLudus } from './newgame';
import { cleanPairs, registerAncestor } from './breeding';
import { publicSessionsIncome } from './influence';
import { addKeepers } from './economy';
import { buildingTotals } from './buildings';
import { build, canBuild } from './buildings';
import { rewardCreature } from './loyalty';
import { joinHorde } from './horde';
import { eventsForWeek, isMajorEvent, scheduleOrganized } from './tournaments';

const S = (str: number, agi: number, cun: number, hp: number): Stats => ({ str, agi, cun, hp });

/** 0 normal, 1 hard, 2 nightmare. */
export function diffIndex(state: GameState): 0 | 1 | 2 {
  const d = state.world.difficulty;
  return d.nightmare ? 2 : d.hard ? 1 : 0;
}

export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function titleCase(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ') || 'Nameless';
}

function keeperTotal(h: Ludus): number {
  const k = h.keepers;
  return k.unassigned + k.miners + k.showmen + k.wardens + k.spies;
}

/** Give raw XP (no age/class multipliers) and level up; AI spends the points. */
export function addRawXp(c: Creature, xp: number): void {
  if (xp <= 0) return;
  c.xp += Math.floor(xp);
  while (c.xp >= xpForLevel(c.level + 1)) {
    c.level++;
    c.statPoints++;
    if (c.level % 3 === 0) c.techPoints++;
  }
  autoSpendStatPoints(c);
}

function removeCreature(h: Ludus, c: Creature): void {
  h.creatures = h.creatures.filter((x) => x !== c);
  if (h.doctoreId === c.id) h.doctoreId = undefined;
  if (h.bondedId === c.id) h.bondedId = undefined;
  cleanPairs(h);
}

// ---------------------------------------------------------------------------
// Legends
// ---------------------------------------------------------------------------

/**
 * Build a named legendary dino (or beast) by key: 'spartacus', 'crixus', 'gannicus', 'oenomaus', 'gigantus',
 * 'theokoles', 'spiculus', 'melankomas', 'hector', 'achilles', 'neokoros', 'agiad', 'maximus', 'hannibalbarca',
 * 'hermes', 'gwyn', 'emericus', 'mars', 'colossus', 'tigris', 'jupiterWolf', 'surus', …
 * Unknown keys give a strong random dino named after the key. The creature belongs to no house yet.
 */
export function makeLegend(state: GameState, key: string): Creature {
  const week = state.world.week;
  const spec = LEGENDS[key];
  if (key === 'lictor') return makeLictor(state);
  if (!spec) {
    const level = Math.max(4, Math.floor(week / 10) + 4);
    const c = generateDino({ tier: 'epic', level, week: Math.max(week, 30) });
    c.name = titleCase(key);
    c.legend = key;
    c.fame = 50 + level * 10;
    return c;
  }
  const c = buildNamed(spec, week);
  // real creatures use their house armory; gear notes are only for scripted foes
  c.notes = (c.notes ?? []).filter((n) => !n.startsWith('gear:'));
  if (!c.notes.length) delete c.notes;
  const d = diffIndex(state);
  switch (key) {
    case 'gwyn':
      if (d >= 1) c.bonus.hp += 10;
      if (asc(state, ASC.sol)) addRawXp(c, 1500);
      if (asc(state, ASC.mars)) { c.bonus.str += 2; c.bonus.agi += 2; addTrait(c, 'Veteran'); }
      break;
    case 'jupiterWolf':
      if (d >= 1) c.bonus.hp += 50;
      break;
    case 'caesarChampion':
      if (asc(state, ASC.sol)) addTrait(c, 'Tough');
      break;
    case 'gigantus':
      if (d >= 2) addTrait(c, 'Impact');
      break;
  }
  return c;
}

/** GM Lictor: a level 6/10/15 (after week 120/220) Bulwark bodyguard with Enforcer, Tough, Veteran and Loyal. */
function makeLictor(state: GameState): Creature {
  const week = state.world.week;
  const c = generateDino({ week, level: 1, species: coin() ? 'triceratops' : 'allosaurus', eqAge: 24 });
  for (const t of ['Enforcer', 'Tough', 'Veteran', 'Loyal'] as TraitId[]) addTrait(c, t);
  c.cls = 'bulwark';
  c.classXp = 9;
  setLevelAndStats(c, week > 220 ? 15 : week > 120 ? 10 : 6);
  c.legend = 'lictor';
  c.name = `Lictor ${c.name}`;
  c.loyalty = 100;
  return c;
}

// ---------------------------------------------------------------------------
// Preferences and valuation (GM 03 §5.2)
// ---------------------------------------------------------------------------

function prefScore(p: Preference, r: Ludus, c: Creature): number {
  const s = getStats(c);
  const physical = s.str + s.agi + s.cun;
  switch (p) {
    case 'cheap': {
      const v = statWorth(c);
      if (v < 200 || v < r.denarii / 5) return 1;
      if (v > 500 || v > 2 * r.denarii) return -1;
      return 0;
    }
    case 'talented':
      if (hasTrait(c, 'Talented') || (c.level < 3 && physical - c.level > 18)) return 1;
      if (hasTrait(c, 'Blind') || hasTrait(c, 'Crippled') || (c.level > 3 && physical - c.level < 18)) return -1;
      return 0;
    case 'established':
      if ((c.level > 3 && c.fame > 20) || hasTrait(c, 'ArenaChampion')) return 1;
      if ((c.level < 2 && c.fame < 10) || hasTrait(c, 'Underdog')) return -1;
      return 0;
    case 'quick': return s.agi > 8 ? 1 : s.agi < 6 ? -1 : 0;
    case 'strong': return s.str > 8 ? 1 : s.str < 6 ? -1 : 0;
    case 'cunning': return s.cun > 8 ? 1 : s.cun < 6 ? -1 : 0;
    case 'mythic': return hasTrait(c, 'Mythical') ? 1 : 0;
    case 'tough': return s.hp > 40 || hasTrait(c, 'Tough') ? 1 : s.hp < 25 ? -1 : 0;
  }
}

/** Favourite − hated count for this rival's preferences. */
export function preferenceScore(r: Ludus, c: Creature): number {
  const prefs = r.ai?.personality.prefers ?? [];
  let n = 0;
  for (const p of prefs) n += prefScore(p, r, c);
  return n;
}

/** GM DetermineGladiatorWorth: stat worth × (10 + 3n)/10 (+ legend bonuses). */
export function valuation(r: Ludus, c: Creature): number {
  let m = 10 + 3 * preferenceScore(r, c);
  if (c.legend === 'spartacus') m += 5;
  if (c.legend === 'theokoles') m += 3;
  if (c.cls === 'spitter') m += 4;
  let v = Math.floor((statWorth(c) * Math.max(1, m)) / 10);
  if (r.denarii < 0) v = Math.floor(v / 2);
  else if (r.denarii < 100) v = Math.floor(v * 0.75);
  return Math.max(10, v);
}

function offerAdjust(r: Ludus, amount: number): number {
  switch (r.ai?.personality.financial) {
    case 'greedy': return Math.floor(amount * 0.8);
    case 'spender': return Math.floor(amount * 7 / 6);
    case 'crazy': return Math.floor(amount * (50 + rand(113)) / 100);
    default: return Math.floor(amount);
  }
}

function buffer(r: Ludus): number {
  return SPENDING_BUFFER[r.ai?.personality.financial ?? 'balanced'];
}

/** Most influential visible rival. */
export function strongestRival(state: GameState): Ludus | undefined {
  return [...visibleRivals(state)].sort((a, b) => b.influence - a.influence || b.creatures.length - a.creatures.length)[0];
}

/** Least influential visible rival (league champions and god's chosen go here). */
export function weakestRival(state: GameState): Ludus | undefined {
  return [...visibleRivals(state)].sort((a, b) => a.influence - b.influence || a.creatures.length - b.creatures.length)[0];
}

// ---------------------------------------------------------------------------
// Seeding (GM Seed.CreateOpponents)
// ---------------------------------------------------------------------------

function makeRivalHouse(state: GameState, seed: RivalSeed): Ludus {
  const d = diffIndex(state);
  const h = makeLudus(seed.name, false, seed.denarii[d]);
  h.portrait = seed.portrait;
  h.influence = seed.influence[d];
  h.keepers = { unassigned: 0, miners: 0, showmen: 0, wardens: 0, spies: 0, ...seed.keepers };
  if (d >= 1) { h.keepers.wardens += 1; h.keepers.showmen += 1; }
  if (d >= 2) { h.keepers.miners += 1; h.keepers.spies += 1; }
  for (const [b, lvl] of Object.entries(seed.buildings)) h.buildings[b as BuildingId] = lvl ?? 0;
  h.miningBonus = seed.miningBonus ?? 0;
  h.projected = seed.projected ?? 0;
  for (const [type, q] of seed.gear) h.armory.push(makeGear(type, Math.min(4, q + d) as Gear['quality'], newId('g')));
  if (d >= 1) for (const [type, q] of seed.hardGear ?? []) h.armory.push(makeGear(type, Math.min(4, q + d - 1) as Gear['quality'], newId('g')));
  h.training.type = seed.personality.training;
  h.ai = {
    key: seed.key, personality: { ...seed.personality, prefers: [...seed.personality.prefers] }, opinion: seed.opinion[d],
    hatedRival: seed.hated, visible: seed.visible, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  return h;
}

function named(species: Creature['species'], name: string, stats: Stats, level: number, traits: TraitId[] = [], legend?: string): Creature {
  return makeNamed(species, name, stats, { level, traits, legend, eqAge: 19 + rand(6) });
}

function leo(n: string, level: number, state: GameState): Creature {
  const c = generateBeast('sabertooth', { name: `Leo ${n}`, sex: 'M' });
  c.legend = `leo${n}`;
  if (level > 1) setLevelAndStats(c, level);
  if (diffIndex(state) >= 2) addRawXp(c, 300);
  return c;
}

function hardTechs(c: Creature, techs: Creature['techniques'][number]['id'][]): void {
  for (const t of techs) if (!c.techniques.some((x) => x.id === t)) c.techniques.push({ id: t, rank: 1, equipped: true });
}

function seedRoster(state: GameState, h: Ludus, key: Exclude<RivalKey, 'random'>): void {
  const d = diffIndex(state);
  const week = state.world.week;
  const add = (...cs: Creature[]) => h.creatures.push(...cs);
  switch (key) {
    case 'batiatus': {
      const g = makeLegend(state, 'gannicus');
      g.injury = { type: 'broken', weeks: [6, 4, 3][d] };
      if (d >= 2) { addTrait(g, 'FirstBlood'); g.speciesLevel = 2; }
      const o = makeLegend(state, 'oenomaus');
      const faust = makeNamed('allosaurus', 'Faust', S(5, 8, 5, 25), { legend: 'faust', eqAge: 21 });
      add(g, o, faust, generateDino({ week, level: 1 }));
      h.doctoreId = o.id;
      break;
    }
    case 'decimus': {
      const aeneas = named('ankylosaurus', 'Aeneas', S(7, 4, 6, 40), 2, ['QuickStudy', 'Strong'], 'aeneas');
      const pontius = named('iguanodon', 'Pontius', S(6, 6, 5, 30), 1, [pick(RANDOM_TRAITS)], 'pontius');
      const atila = named('carnotaurus', 'Atila', S(7, 7, 4, 30), 1, [pick(RANDOM_TRAITS)], 'atila');
      const cadeyrn = named('triceratops', 'Cadeyrn', S(7, 4, 5, 35), 1, [pick(RANDOM_TRAITS)], 'cadeyrn');
      if (d >= 1) { hardTechs(pontius, ['Smash', 'Lunge']); hardTechs(cadeyrn, ['ThrowSand']); }
      add(aeneas, pontius, atila, cadeyrn, leo('V', 2, state));
      break;
    }
    case 'solonius': {
      const L = d >= 1 ? 2 : 1;
      const wolf = generateBeast('direwolf', { name: 'Old Wolf', sex: 'M' });
      wolf.ageWeeks = 52 * 9;
      wolf.adultWeeks = wolf.ageWeeks - SPECIES.direwolf.matureWeeks;
      add(generateDino({ week, level: L, eqAge: 15 }), generateDino({ week, level: L, eqAge: 13 }), generateDino({ week, level: L }), wolf);
      break;
    }
    case 'magnus': {
      const b = d >= 1 ? 1 : 0;
      const cunning = (s: Creature['species']) => SPECIES[s].base.cun >= 3;
      for (let i = 0; i < 3; i++) add(generateDino({ week, level: range(1, 3) + b, allowed: cunning }));
      add(leo('I', 1, state), leo('II', 1, state));
      break;
    }
    case 'vettius': {
      add(makeLegend(state, 'gigantus'), leo('III', 1, state), leo('IV', 1, state));
      break;
    }
    case 'caesar': {
      const champ = makeLegend(state, 'caesarChampion');
      const a = generateDino({ week, level: 4 });
      const b2 = generateDino({ week, level: 4 });
      if (d >= 1) for (const c of [champ, a, b2]) addRawXp(c, 500);
      const s1 = generateBeast('sabertooth', { name: 'Caesar\'s Sabertooth' });
      const s2 = generateBeast('sabertooth', { name: 'Gallic Sabertooth', variant: asc(state, ASC.diana) ? 'strong' : 'standard' });
      const rhino = generateBeast('woollyrhino', { name: 'Rhino of the Rhine' });
      add(champ, a, b2, s1, s2, rhino);
      break;
    }
    case 'crassus': {
      const champ = makeLegend(state, 'crassusChampion');
      if (week > 50) { addTrait(champ, 'Killer'); champ.prof.claw = Math.min(100, champ.prof.claw + 100); }
      if (asc(state, ASC.sol)) addTrait(champ, 'Tough');
      if (asc(state, ASC.diana)) addTrait(champ, 'Hunter');
      if (asc(state, ASC.jupiter)) addRawXp(champ, 3000);
      const a = generateDino({ week, level: 8 });
      const b2 = generateDino({ week, level: 8 });
      if (d >= 1) for (const c of [champ, a, b2]) addRawXp(c, 500);
      const m = generateBeast('mammoth', { name: 'Pompeius' });
      setLevelAndStats(m, 6);
      add(champ, a, b2, m);
      break;
    }
    case 'hannibal': {
      add(makeLegend(state, 'hannibalChampion'), makeLegend(state, 'surus'), makeLegend(state, 'barcasWall'),
        generateDino({ week, level: Math.max(4, Math.floor(week / 10) + 2), tier: 'epic' }));
      break;
    }
  }
}

/** Seed Batiatus, Solonius, Decimus, Magnus, Vettius (hidden) and the Unknown house (GM Seed.CreateOpponents), dino rosters. */
export function seedRivals(state: GameState): void {
  state.rivals = [];
  for (const key of STARTING_RIVALS) {
    const h = makeRivalHouse(state, RIVAL_SEEDS[key]);
    seedRoster(state, h, key);
    state.rivals.push(h);
  }
  seedUnknown(state);
}

function seedUnknown(state: GameState): void {
  const d = diffIndex(state);
  const u = state.unknown;
  u.denarii = 200;
  u.isPlayer = false;
  u.armory.push(makeGear('fangCaps', d >= 1 ? 2 : 0, newId('g')));
  const em = makeLegend(state, 'emericus');
  if (d >= 2) addTrait(em, 'PitFighter');
  const L = d >= 1 ? 2 : 1;
  const a = generateDino({ week: state.world.week, level: L });
  const b = generateDino({ week: state.world.week, level: L });
  if (d >= 1) for (const c of [a, b, em]) hardTechs(c, ['Rally', 'Decimate', 'Parry']);
  u.creatures.push(a, b, em);
}

function makeRandomHouse(state: GameState): Ludus {
  const week = state.world.week;
  const used = new Set(state.rivals.map((r) => r.name));
  const pool = HOUSE_NAMES.map((n) => `House ${n}`).filter((n) => !used.has(n));
  const name = pool.length ? pick(pool) : `House ${pick(HOUSE_NAMES)} ${week}`;
  const h = makeLudus(name, false, 1000 + 25 * week);
  h.portrait = 'lanista';
  h.influence = Math.floor(week / 4) + 10;
  const total = Math.floor(week / 10) + 15;
  const wardens = Math.ceil(total * 0.4);
  const showmen = Math.ceil(total * 0.35);
  h.keepers = { unassigned: 0, wardens, showmen, miners: Math.max(0, total - wardens - showmen), spies: 0 };
  h.buildings.residence = 1;
  h.buildings.mine = 1;
  h.buildings.palisade = 1;
  if (state.world.difficulty.hard && week > 100) {
    h.buildings.residence = 2;
    h.buildings.trainingField = 1;
    h.buildings.veterinarium = 1;
  }
  h.ai = {
    key: 'random',
    personality: {
      financial: coin() ? 'balanced' : 'spender', arena: coin() ? 'balanced' : 'risktaker',
      honesty: coin() ? 'neutral' : 'dishonest', training: coin() ? 'standard' : 'light', classMindset: 'normal',
      prefers: [coin() ? 'quick' : 'cheap'],
    },
    opinion: 50, hatedRival: 'caesar', visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  h.training.type = h.ai.personality.training;
  const a = generateDino({ week, level: Math.floor(week / 10) + 2 });
  for (let i = 0; i < 3; i++) addTrait(a, pick(RANDOM_TRAITS));
  h.creatures.push(a, generateDino({ week, level: Math.floor(week / 10) + 1 }), generateDino({ week, level: Math.floor(week / 12) + 1 }));
  const q = Math.min(3, Math.floor(week / 30) + 1) as Gear['quality'];
  h.armory.push(makeGear('talonBlades', q, newId('g')), makeGear('hideShield', q, newId('g')), makeGear('hornLance', q, newId('g')));
  return h;
}

export const ARRIVAL_TEXT: Partial<Record<RivalKey, string>> = {
  caesar: 'Gaius Julius Caesar has opened a ludus in Capua. He is paying for it with other people\'s money, as is the custom.',
  crassus: 'Marcus Licinius Crassus has bought a ludus, the street it stands on, and the street next to that.',
  hannibal: 'The air over Capua tore open and Hannibal Barca stepped out of it, with mammoths. Cronus has a sense of humour.',
};

/**
 * Create a named late rival (Caesar, Crassus, Hannibal) or a random house and add it to state.rivals.
 * Random houses are announced by the magistrate; named arrivals are announced by their caller (horde.ts timeline,
 * ascension.ts) unless `announce` is set.
 */
export function spawnRival(state: GameState, key: RivalKey, opts: { announce?: boolean } = {}): Ludus {
  let h: Ludus;
  if (key === 'random') {
    h = makeRandomHouse(state);
    if (opts.announce !== false) {
      message(state, 'magistrate', 'A new ludus', `A new dino school called ${h.name} has opened its gates. Its keepers look nervous already.`);
    }
  } else {
    h = makeRivalHouse(state, RIVAL_SEEDS[key]);
    h.ai!.visible = true;
    seedRoster(state, h, key);
    if (opts.announce) message(state, 'herald', `${h.name} arrives`, ARRIVAL_TEXT[key] ?? `${h.name} has opened a ludus in Capua.`);
  }
  state.rivals.push(h);
  return h;
}

// ---------------------------------------------------------------------------
// Opinion and instructions
// ---------------------------------------------------------------------------

export function opinionLabel(opinion: number): string {
  if (opinion > 60) return 'Favourable';
  if (opinion >= 40) return 'Neutral';
  if (opinion >= 16) return 'Unfavourable';
  return 'Sworn enemy';
}

/** Opinion change with honesty reaction when the player acts against a rival (fall-through bug fixed). */
export function changeOpinion(state: GameState, r: Ludus, delta: number): void {
  if (!r.ai || !delta) return;
  let d = delta;
  if (d < 0) d -= HONESTY_EXTRA[r.ai.personality.honesty];
  r.ai.opinion = clamp(r.ai.opinion + d, -100, 100);
}

/** Instruction an AI house gives in a battle vs the player (GM 01 §21). */
export function aiInstruction(state: GameState, r: Ludus, playerScoreDiff: number, live: boolean): Instruction {
  const opinion = r.ai?.opinion ?? 50;
  if (!live) return opinion > 45 ? 'care' : opinion < 15 ? 'allout' : 'default';
  if (playerScoreDiff > 80) {
    if (playerScoreDiff > 120 && opinion > 70 && coin()) return 'throw';
    return 'care';
  }
  if (opinion > 60 && coin()) return 'care';
  if (opinion < 50 && coin()) {
    const roll = rand(Math.max(1, opinion));
    if (roll < 5) return 'kill';
    if (roll < 15) return 'allout';
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// Catch-up help (GM WeekResolver.helpOpponents)
// ---------------------------------------------------------------------------

/** GM helpOpponents catch-up for one rival. */
export function helpRival(state: GameState, r: Ludus): void {
  if (r.defeated) return;
  const week = state.world.week;
  if (state.world.difficulty.nightmare && week > 10) {
    const xp = (week % 5) * 10;
    if (xp > 0) for (const c of r.creatures) grantXp(c, xp);
  }
  if (week % (week > 100 ? 40 : 20) === 0) { r.miningBonus += 2; r.projected -= 5; }
  if (week % 15 === 0) { addKeepers(r, 1); r.projected -= 2; }
  if (week % 30 === 0) { addKeepers(r, 1, 'spies'); r.projected -= 5; }
  if (week === 10 && r.ai?.key === 'decimus') r.denarii += 250;
  if (week > 5 && chance(0.1)) {
    r.denarii += 100;
    r.projected -= 4;
    const kid = generateDino({ week, level: 1, eqAge: 14 });
    if (week > 20) { addTrait(kid, pick(RANDOM_TRAITS)); addRawXp(kid, 200); }
    if (week > 30) { addTrait(kid, pick(RANDOM_TRAITS)); addRawXp(kid, 300); }
    r.creatures.push(kid);
  }
}

// ---------------------------------------------------------------------------
// AI weekly routine (GM Opponent.ResolveAIWeekCascading)
// ---------------------------------------------------------------------------

function unhappyCount(r: Ludus): number {
  return r.creatures.filter((c) => c.loyalty < 50).length;
}

function rebelThreat(state: GameState, r: Ludus): boolean {
  return state.world.horde.rogues.length > r.keepers.wardens;
}

/** Hard mode: weekly buffUp of a random rival dino; after week 20, 25% an Epic dino for a random rival. Once per week. */
function hardModeRolls(state: GameState): void {
  const w = state.world;
  if (!w.difficulty.hard || w.flags.hardRollsWeek === w.week) return;
  w.flags.hardRollsWeek = w.week;
  const rivals = state.rivals.filter((r) => !r.defeated);
  if (!rivals.length) return;
  const withFit = rivals.filter((r) => r.creatures.some(canFight));
  if (withFit.length) buffUp(pick(pick(withFit).creatures.filter(canFight)));
  if (w.week > 20 && chance(0.25)) {
    const r = pick(rivals);
    r.creatures.push(generateDino({ tier: 'epic', level: Math.max(1, Math.floor(w.week / 10)), week: w.week }));
  }
}

/** GM buffUp: equipped techniques +1 rank, a random trait, enough XP for a level. */
export function buffUp(c: Creature): void {
  for (const t of c.techniques) if (t.equipped && t.rank < TECHNIQUES[t.id].maxRank) t.rank++;
  const pool = WEEKLY_TRAITS.filter((t) => !hasTrait(c, t));
  if (pool.length) addTrait(c, pick(pool));
  addRawXp(c, Math.max(1, xpForLevel(c.level + 1) - c.xp));
}

function aiSurgery(r: Ludus): void {
  if (r.buildings.veterinarium <= 0 || r.denarii <= 150) return;
  for (const c of r.creatures) {
    if (r.surgeriesThisWeek >= r.buildings.veterinarium || r.denarii <= 150) return;
    if (c.legend) continue;
    const t = AI_SURGERY_TRAITS.find((x) => hasTrait(c, x));
    if (!t) continue;
    removeTrait(c, t);
    r.denarii -= 50;
    r.surgeriesThisWeek++;
  }
}

function aiRewards(state: GameState, r: Ludus): void {
  const week = state.world.week;
  for (const c of r.creatures) {
    if (c.career.majorWins >= 10 && !hasTrait(c, 'DemandingFreedom') && chance(0.04)) addTrait(c, 'DemandingFreedom');
    if (c.loyalty >= 40 || c.rewardCooldown > 0) continue;
    if (c.legend === 'gannicus' && week < 18) {
      if (r.denarii < 25) continue;
      r.denarii -= 25;
      c.loyalty = Math.min(100, c.loyalty + 40);
      c.rewardCooldown = 10;
      c.rebellionGrace = true;
      continue;
    }
    const cost = 50 * (Math.floor(c.level / 2) + 1);
    // keep the spending buffer unless the dino is close to bolting
    if (r.denarii - cost < (c.loyalty < 20 ? 0 : buffer(r))) continue;
    rewardCreature(state, r, c);
  }
}

function aiLoan(state: GameState, r: Ludus): void {
  if (!r.ai || r.ai.tookLoan) return;
  if ((unhappyCount(r) > 1 || rebelThreat(state, r)) && r.denarii < 50) {
    r.denarii += 500;
    r.miningBonus -= 1;
    r.projected -= 5;
    r.ai.tookLoan = true;
  }
}

function hasBreedingPair(r: Ludus): boolean {
  const adults = r.creatures.filter((c) => c.maturity >= 1 && SPECIES[c.species].repro !== 'none');
  return adults.some((f) => f.sex === 'F' && adults.some((m) => m.sex === 'M' && m.species === f.species));
}

function aiConstruct(state: GameState, r: Ludus): void {
  if (r.builtThisWeek) return;
  const order: BuildingId[] = [...BUILD_PRIORITY];
  if (hasBreedingPair(r) && chance(0.25)) order.unshift('breedingPen', 'hatchery', 'nursery');
  for (const id of order) {
    const c = canBuild(state, r, id);
    if (!c.ok || r.denarii - c.cost < buffer(r)) continue;
    if (build(state, r, id) === null) return;
  }
}

function aiBuyKeepers(state: GameState, r: Ludus): void {
  const week = state.world.week;
  const total = keeperTotal(r);
  const buf = buffer(r);
  // GM: > 400 denarii and fewer than week/2 + 2 keepers, or unhappy dinos / a rebel threat, or > 1500 denarii.
  // The unhappy/threat branch only spends above the house's spending buffer (GM leaves it unguarded; houses
  // starved themselves buying guards).
  const need = (r.denarii > 400 && total < Math.floor(week / 2) + 2)
    || ((unhappyCount(r) > 1 || rebelThreat(state, r)) && r.denarii > buf + 100)
    || (r.denarii > 1500 && total < Math.max(20, buildingTotals(r).beds + 10));
  if (!need) return;
  let n = 0;
  while (n < 3 && r.denarii - 100 >= buf) {
    addKeepers(r, 1);
    r.denarii -= 100;
    n++;
  }
}

function joinHouse(r: Ludus, c: Creature): void {
  c.rebellionGrace = true;
  if (c.loyalty < 75) c.loyalty = Math.min(100, c.loyalty + 20);
  r.creatures.push(c);
}

function aiRecruit(state: GameState, r: Ludus): void {
  if (!r.ai) return;
  const week = state.world.week;
  const buf = buffer(r);
  // prisoners from the general
  if ((week > 10 || state.world.difficulty.hard) && week % 3 === 0 && r.influence > 40 && r.creatures.length < 9
    && r.denarii - 150 >= buf && chance(0.4)) {
    r.denarii -= 150;
    joinHouse(r, generateDino({ week, level: Math.floor(week / 10) + 1 }));
  }
  // last week's market leftovers at 75%
  const market = state.world.market;
  const target = Math.floor(week / 15) + 4;
  const leftovers = market.oldCreatures
    .filter((c) => c.kind === 'dino' || r.creatures.filter((x) => x.kind === 'beast').length < 2)
    .map((c) => ({ c, score: preferenceScore(r, c), price: Math.floor(marketPrice(c) * 0.75) }))
    .filter((x) => r.denarii - x.price >= buf)
    .sort((a, b) => b.score - a.score || valuation(r, b.c) - valuation(r, a.c));
  const pickOne = leftovers.find((x) => r.creatures.length < target || x.score > 0);
  if (pickOne && r.creatures.length < 10) {
    market.oldCreatures = market.oldCreatures.filter((c) => c !== pickOne.c);
    r.denarii -= pickOne.price;
    pickOne.c.price = undefined;
    joinHouse(r, pickOne.c);
  }
  // poach a favourite type from a rival with more than 2
  if (r.ai.visible && chance(0.1) && r.creatures.length < 9) {
    const others = shuffle(state.rivals.filter((o) => o !== r && !o.defeated && o.creatures.length > 2));
    for (const o of others) {
      const best = [...o.creatures].sort((a, b) => statWorth(b) - statWorth(a))[0];
      const cand = o.creatures.find((c) => c !== best && c.id !== o.doctoreId && c.legend !== 'spartacus' && canFight(c)
        && preferenceScore(r, c) > 0);
      if (!cand) continue;
      const price = Math.floor(valuation(o, cand) * 1.1) + 10;
      if (r.denarii - price < buf) break;
      r.denarii -= price;
      o.denarii += price;
      removeCreature(o, cand);
      joinHouse(r, cand);
      break;
    }
  }
  // a beast if fewer than 2 and > 500 denarii
  const beasts = r.creatures.filter((c) => c.kind === 'beast').length;
  if (beasts < 2 && r.denarii > 500 && r.creatures.length < 10 && chance(0.5)) {
    const species = pick<BeastSpeciesId>(['direwolf', 'sabertooth', 'direbear', 'terrorbird', 'sarcosuchus']);
    const price = BEAST_MARKET[species]?.price ?? 200;
    if (r.denarii - price >= buf) {
      r.denarii -= price;
      joinHouse(r, generateBeast(species, { variant: 'random' }));
    }
  }
}

function forgeTier(level: number): number {
  return level >= 3 ? 4 : level >= 2 ? 3 : 2;
}

function aiGear(state: GameState, r: Ludus): void {
  const buf = buffer(r);
  if (r.denarii < 50 && r.miningBonus > 0) { r.miningBonus -= 1; r.denarii += 200; }
  // simple reforging at its own forge
  const forge = r.buildings.forge;
  if (forge > 0) {
    const cands = r.armory.filter((g) => {
      const d = GEAR[g.type];
      return d.slot !== 'item' && !d.noReforge && !g.unique && g.quality < forgeTier(forge) && g.augment !== 'Broken';
    }).sort((a, b) => a.quality - b.quality || gearWorth(b) - gearWorth(a));
    const g = cands[0];
    if (g) {
      let cost = Math.max(10, Math.floor(gearWorth(g) * [1, 0.95, 0.9][Math.min(2, forge)]));
      if (state.world.ascension > 1) cost = Math.floor(cost / 2);
      if (r.denarii - cost >= 2 * buf) {
        r.denarii -= cost;
        if (rand(10) + forge >= g.quality + 1) g.quality = Math.min(5, g.quality + 1) as Gear['quality'];
      }
    }
  }
  // buy one leftover market piece it lacks, at 75%
  const market = state.world.market;
  const dinos = r.creatures.filter((c) => c.kind === 'dino').length;
  const count = (slot: string) => r.armory.filter((g) => GEAR[g.type].slot === slot).length;
  const wantSlot = count('weapon') < dinos ? 'weapon' : count('armor') < dinos ? 'armor' : count('helmet') < dinos ? 'helmet' : null;
  if (wantSlot) {
    // on Normal the AI keeps to gear the player could also buy; Hard and Nightmare houses get the premium kit too
    const allowed = (g: Gear) => state.world.difficulty.hard || !GEAR[g.type].upgrade || hasUpgrade(state, GEAR[g.type].upgrade!);
    const piece = market.oldGear.filter((g) => GEAR[g.type].slot === wantSlot && !g.unique && allowed(g))
      .sort((a, b) => gearWorth(b) - gearWorth(a))
      .find((g) => r.denarii - Math.floor(gearWorth(g) * 0.75) >= 2 * buf);
    if (piece) {
      market.oldGear = market.oldGear.filter((g) => g !== piece);
      r.denarii -= Math.floor(gearWorth(piece) * 0.75);
      r.armory.push(piece);
    }
  }
}

function sellToMarket(state: GameState, r: Ludus, c: Creature): void {
  removeCreature(r, c);
  r.denarii += salePrice(c);
  c.price = undefined;
  c.loyalty = Math.max(c.loyalty, 60);
  state.world.market.creatures.push(c);
}

function sellable(r: Ludus, c: Creature): boolean {
  return c.legend !== 'spartacus' && c.id !== r.doctoreId && !c.away;
}

function aiSell(state: GameState, r: Ludus): void {
  if (!r.ai) return;
  const broke = r.denarii < 0 || r.bankruptLastWeek || r.unpaidThisWeek;
  const pool = r.creatures.filter((c) => sellable(r, c));
  const byDislike = [...pool].sort((a, b) => preferenceScore(r, a) - preferenceScore(r, b) || statWorth(a) - statWorth(b));
  if (broke) {
    // offer a disliked dino to the player at its wanted price, then sell surplus harness
    const c = byDislike[0];
    if (c && r.ai.visible && !state.player.offers.some((o) => o.sell && o.rivalId === r.id)) {
      const amount = valuation(r, c) + 10;
      const offer: TransferOffer = { id: newId('o'), rivalId: r.id, creatureId: c.id, amount, sell: true, creature: c, expiresWeek: state.world.week };
      const m = message(state, 'rival', `${r.name} is selling ${c.name}`,
        `${r.name} needs coin, fast. ${c.name} (${SPECIES[c.species].name}, level ${c.level}) is yours for ${amount} denarii, and no questions about the creditors at the door.`);
      m.offer = offer;
      state.player.offers.push(offer);
    }
    dumpGear(r);
    if (r.denarii < 0) {
      const beast = pool.find((x) => x.kind === 'beast');
      if (beast) sellToMarket(state, r, beast);
    }
    return;
  }
  const limit = 3 + rand(3);
  if (r.creatures.length > limit) {
    const disliked = byDislike.find((c) => preferenceScore(r, c) < 0);
    if (disliked) sellToMarket(state, r, disliked);
  }
  if (r.creatures.length > 8) {
    const weakest = [...r.creatures.filter((c) => sellable(r, c))].sort((a, b) => statWorth(a) - statWorth(b))[0];
    if (weakest) sellToMarket(state, r, weakest);
  }
}

/** Sell harness beyond what the roster can wear, at 75% of worth. */
function dumpGear(r: Ludus): void {
  const dinos = Math.max(1, r.creatures.filter((c) => c.kind === 'dino').length);
  const assigned = new Set(r.creatures.flatMap((c) => Object.values(c.gear).filter(Boolean) as string[]));
  for (const slot of ['weapon', 'offhand', 'armor', 'helmet', 'rider'] as const) {
    const pieces = r.armory.filter((g) => GEAR[g.type].slot === slot && !assigned.has(g.id)).sort((a, b) => gearWorth(a) - gearWorth(b));
    const total = r.armory.filter((g) => GEAR[g.type].slot === slot).length;
    let excess = total - dinos;
    for (const g of pieces) {
      if (excess <= 0 || r.denarii >= 0) break;
      r.armory = r.armory.filter((x) => x !== g);
      r.denarii += Math.floor(gearWorth(g) * 0.75);
      excess--;
    }
  }
}

/**
 * GM: new keepers go to entertainment, the mines or security depending on morale, greed and risk. Each new keeper
 * joins the job furthest below its target share; miners (the only denarii earners) take the remainder.
 */
function aiKeeperJobs(state: GameState, r: Ludus): void {
  const k = r.keepers;
  if (k.unassigned <= 0 || !r.ai) return;
  const avgLoyalty = r.creatures.length ? r.creatures.reduce((s, c) => s + c.loyalty, 0) / r.creatures.length : 80;
  const p = r.ai.personality;
  const poor = r.denarii < 200;
  const lowMorale = avgLoyalty < 55;
  const share = poor || p.financial === 'greedy' ? { wardens: 0.15, showmen: 0.1 }
    : lowMorale ? { wardens: 0.3, showmen: 0.3 } : { wardens: 0.2, showmen: 0.3 };
  const minWardens = Math.max(2, rebelThreat(state, r) ? state.world.horde.rogues.length + 2 : 0);
  const spyCap = r.buildings.residence >= 2 && (p.arena === 'risktaker' || p.honesty === 'dishonest' || p.honesty === 'treacherous') ? 2 : 0;
  while (k.unassigned > 0) {
    const total = keeperTotal(r);
    let job: KeeperJob = 'miners';
    if (k.wardens < minWardens || k.wardens < Math.ceil(total * share.wardens)) job = 'wardens';
    else if (k.showmen < Math.ceil(total * share.showmen)) job = 'showmen';
    else if (k.spies < spyCap) job = 'spies';
    k.unassigned--;
    k[job]++;
  }
}

function classAllowed(state: GameState, cls: ClassId): boolean {
  const up = CLASSES[cls].upgrade;
  return !up || hasUpgrade(state, up);
}

/** GM manageGladiators: stat points by preferences, classes by mindset, random techniques. */
export function manageCreatures(state: GameState, r: Ludus): void {
  const threshold = CLASS_THRESHOLD[r.ai?.personality.classMindset ?? 'normal'];
  for (const c of r.creatures) {
    if (c.statPoints > 0) autoSpendStatPoints(c);
    if (c.kind === 'dino' && !c.cls && eqAge(c) >= 8) {
      let best: ClassId | null = null;
      let bestP = -1;
      for (const cls of CLASS_IDS) {
        if (!classAllowed(state, cls)) continue;
        const p = classProficiency(c, cls);
        if (p > bestP) { bestP = p; best = cls; }
      }
      if (best && bestP >= threshold) c.cls = best;
    }
    if (c.techPoints > 0) learnRandomTechniques(c, 2);
  }
}

function aiOrganize(state: GameState, r: Ludus): void {
  if (!r.ai || r.denarii <= 300) return;
  const target = state.world.week + 3;
  const majors = eventsForWeek(state, target, false).filter(isMajorEvent).length;
  const allowed = state.world.difficulty.nightmare || r.ai.key === 'hannibal' ? 1 : 0;
  if (majors > allowed || !chance(r.ai.key === 'hannibal' ? 0.6 : 0.35)) return;
  const perTeam = range(1, 3);
  const teams = r.influence < 20 ? 2 : r.influence < 50 ? 4 : 8;
  scheduleOrganized(state, r, { perTeam, teams, week: target, beasts: true, mounts: r.buildings.saddlery > 0 && coin() });
  r.denarii -= 300;
}

function aiPanic(state: GameState, r: Ludus): void {
  dumpGear(r);
  while (r.denarii < 0 && r.keepers.unassigned + r.keepers.showmen + r.keepers.miners > 0) {
    if (r.keepers.unassigned > 0) r.keepers.unassigned--;
    else if (r.keepers.showmen > 0) r.keepers.showmen--;
    else r.keepers.miners--;
    r.denarii += 50;
  }
}

/** GM Opponent.ResolveAIWeekCascading minus the shared steps (see the file header). */
export function rivalWeek(state: GameState, r: Ludus): void {
  if (r.defeated || !r.ai) return;
  hardModeRolls(state);
  // 2. influence and the free "commoner tourists" income
  r.influence += 1;
  r.denarii += Math.max(0, Math.floor(publicSessionsIncome(state, r)));
  // 3–5. surgery, rewards, emergency loan
  aiSurgery(r);
  aiRewards(state, r);
  aiLoan(state, r);
  // 6. construction (50% after week 3)
  if (state.world.week > 3 && chance(0.5)) aiConstruct(state, r);
  // 7. keepers
  aiBuyKeepers(state, r);
  // 8. recruitment
  aiRecruit(state, r);
  // 9. mines and gear
  aiGear(state, r);
  // 10. selling
  aiSell(state, r);
  // 11. keeper jobs
  aiKeeperJobs(state, r);
  // 12. creature management
  manageCreatures(state, r);
  // 13. organise a tournament
  if (r.ai.visible) aiOrganize(state, r);
  // 14. invest
  if (r.denarii > 1600 && chance(0.1)) { r.denarii -= 400; r.miningBonus += 1; }
  // 16. panic mode
  if (r.denarii < 0) aiPanic(state, r);
}

// ---------------------------------------------------------------------------
// The Unknown house
// ---------------------------------------------------------------------------

/** Weekly default-house refill (Unknown: 200 denarii, refills fighters, better kit over time). */
export function unknownWeek(state: GameState): void {
  const u = state.unknown;
  const w = state.world;
  const week = w.week;
  u.denarii = 200;
  for (const [atWeek, items] of UNKNOWN_GEAR) {
    const flag = `unknownGear${atWeek}`;
    if (week < atWeek || w.flags[flag]) continue;
    w.flags[flag] = 1;
    for (const [type, q, hardType] of items) u.armory.push(makeGear(w.difficulty.hard && hardType ? hardType : type, q, newId('g')));
  }
  for (const c of u.creatures) {
    if (c.injury) { c.injury.weeks--; if (c.injury.weeks <= 0) c.injury = null; }
    if (c.ill > 0) c.ill--;
    c.ageWeeks++;
    if (c.statPoints > 0) autoSpendStatPoints(c);
    if (c.techPoints > 0) learnRandomTechniques(c, 2);
  }
  const healthy = u.creatures.filter((c) => canFight(c)).length;
  if (u.creatures.length < 3 || healthy < 2) {
    const c = w.difficulty.hard
      ? generateDino({ tier: 'epic', level: rand(Math.floor(week / 10) + 1) + 5, week })
      : generateDino({ week, level: rand(Math.floor(week / 10) + 1) + 2 });
    u.creatures.push(c);
  }
  while (u.creatures.length > 7) {
    const weakest = [...u.creatures].filter((c) => !c.legend).sort((a, b) => statWorth(a) - statWorth(b))[0];
    if (!weakest) break;
    u.creatures = u.creatures.filter((c) => c !== weakest);
  }
}

// ---------------------------------------------------------------------------
// Bids for the player's dinos
// ---------------------------------------------------------------------------

/** Rival bids for player creatures of their favourite type / flagged "offer to rivals" (messages). */
export function rivalBids(state: GameState): void {
  const week = state.world.week;
  const me = state.player.ludus;
  for (const r of visibleRivals(state)) {
    if (!r.ai || !chance(0.1)) continue;
    const cands = me.creatures.filter((c) => !c.away && c.id !== me.bondedId
      && (c.offerToRivals || preferenceScore(r, c) > 0)
      && (r.ai!.lastOffers[c.id] === undefined || week - r.ai!.lastOffers[c.id] >= 4));
    if (!cands.length) continue;
    const c = cands.sort((a, b) => valuation(r, b) - valuation(r, a))[0];
    const fav = preferenceScore(r, c) > 0;
    const base = fav ? valuation(r, c) : valuation(r, c) - Math.floor(worth(c) / 3);
    let amount = offerAdjust(r, base);
    amount = Math.min(amount, r.denarii - buffer(r));
    if (amount < 50) continue;
    const offer: TransferOffer = { id: newId('o'), rivalId: r.id, creatureId: c.id, amount, expiresWeek: week };
    const m = message(state, 'rival', `${r.name} wants ${c.name}`,
      `${r.name} offers ${amount} denarii for ${c.name}. "A fine ${SPECIES[c.species].name}. Wasted on you, frankly." The offer stands this week only.`);
    m.offer = offer;
    state.player.offers.push(offer);
    r.ai.lastOffers[c.id] = week;
  }
}

// ---------------------------------------------------------------------------
// Defeat, refill, Theokoles
// ---------------------------------------------------------------------------

/** Remove defeated houses, herald messages, Crassus replacement, refill to 4 rivals every 6 weeks. */
export function cleanupRivals(state: GameState): void {
  const week = state.world.week;
  const destroyed = state.rivals.filter((r) => r.defeated);
  for (const r of destroyed) {
    const reason = r.defeated ?? 'debt';
    message(state, 'herald', `${r.name} has fallen`, (DEFEAT_HERALD[reason] ?? DEFEAT_HERALD.debt)(r.name));
    achieve(state, 'eliminateOpponent');
    for (const c of [...r.creatures]) {
      if (reason === 'debt') joinHorde(state, c, r);
      else registerAncestor(state, c, r.name, 'lost with its ludus');
    }
    r.creatures = [];
  }
  if (destroyed.length) state.rivals = state.rivals.filter((r) => !r.defeated);
  if (!state.world.difficulty.nightmare && destroyed.length && state.rivals.length === 5
    && !destroyed.some((r) => r.ai?.key === 'crassus') && !state.rivals.some((r) => r.ai?.key === 'crassus')) {
    spawnRival(state, 'crassus', { announce: true });
  }
  if (week % 6 === 0 && state.rivals.length < 4) spawnRival(state, 'random');
  // Theokoles (GM 03 §5.6) is rolled by horde.ts timelineWeek (world.flags.theokoles).
}

/** Gear for the AI that are part of a named rival's starting kit (exposed for the UI). */
export function rivalArmoryNames(r: Ludus): string[] {
  return r.armory.map(gearName);
}
