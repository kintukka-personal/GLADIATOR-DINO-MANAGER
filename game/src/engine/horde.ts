// The Wild Horde (rebels), Spartacus timeline, Senate armies, raids, expeditions. OWNER: systems-politics agent. GM 04 §8–9, 05 §6, 03 §1.3.
//
// Notes for other modules:
// - rebelRaid() is meant to be called once a week by the events module (GM DecisionFactory gives the rebel
//   raid priority); it returns a Decision for the player or resolves a raid on a rival itself.
// - joinHorde() applies the Escaped effects (+5 fame, −50 tameness, +100 XP), the Spartacus extras
//   (+week/10 ferals, the old house loses 2 keepers) and the escape-story loot. It does not touch the old
//   owner's influence (the breakout code does that).
// - Offers that must survive the weekly market regeneration (Bribe General prisoners, returning released
//   dinos) are queued and pushed into the market by timelineWeek(), which runs after regenerateMarkets().
// GM quirk fixed: the security gate deters raids when the target's security is high (> 10 × army).

import type {
  BattleResult, BattleSide, BuildingId, Creature, Decision, GameState, Gear, GearTypeId, ID, Instruction, Ludus, Quality,
} from './types';
import { rand, coin, pick, shuffle, clamp } from './rng';
import { activeRivals, achieve, asc, ASC, message, newId, ownerOf, report, allHouses } from './util';
import {
  addTrait, removeTrait, canFight, canFightAge, getStat, grantXp, hasTrait, generateDino, marketPrice,
  speciesName, learnRandomTechniques,
} from './creature';
import { GEAR, GEAR_TYPES, makeGear, gearWorth, gearName } from './data/gear';
import { securityTotal, committedSpies, addInfluence, loseKeepers, addKeepers } from './economy';
import { loseRandomBuilding, BUILDINGS } from './buildings';
import { changeOpinion, spawnRival } from './rivals';
import { bury } from './care';
import { objectiveEvent } from './objectives';
import { buildSide, resolveBattle, applyBattleResult } from './combat';
import { hasOpp, princepsActive, flushMarketOffers } from './influence';
import {
  legendCreature, detachCreature, keeperTotal, changeLoyalty, mostFamous, bestClassFor, injureCreature, TACTICS, TACTIC_KEYS,
  INJURY_NAMES, rawXp,
} from './data/politicsData';

// ---------------------------------------------------------------------------
// Size, leader, intel
// ---------------------------------------------------------------------------

/** Rogue dinos + ferals, unsoftened. */
export function hordeRaw(state: GameState): number {
  const H = state.world.horde;
  return H.rogues.length + H.ferals;
}

/** GM army size: rogues + ferals, softened to n/2 + 25 above 50 (not on Nightmare). */
export function hordeSize(state: GameState): number {
  const n = hordeRaw(state);
  if (n > 50 && !state.world.difficulty.nightmare) return Math.trunc(n / 2) + 25;
  return n;
}

/** Spartacus if he leads the Horde, otherwise its highest-level rogue. */
export function rebelLeader(state: GameState): Creature | undefined {
  const H = state.world.horde;
  const sp = H.rogues.find((c) => c.legend === 'spartacus');
  if (sp) return sp;
  return [...H.rogues].sort((a, b) => b.level - a.level || b.fame - a.fame)[0];
}

/** What your spies can tell you about the Horde (GM: army ≥ 2 spies, spoils ≥ 3, leader ≥ 5). */
export function hordeIntel(state: GameState): { army?: number; spoils?: number; leader?: { name: string; level: number; fame: number }; spies: number } {
  const s = committedSpies(state, state.player.ludus);
  const out: { army?: number; spoils?: number; leader?: { name: string; level: number; fame: number }; spies: number } = { spies: s };
  if (s >= 2) out.army = hordeSize(state);
  if (s >= 3) out.spoils = state.world.horde.spoils;
  const l = rebelLeader(state);
  if (s >= 5 && l) out.leader = { name: l.name, level: l.level, fame: l.fame };
  return out;
}

/** Locate Spartacus anywhere in the world. */
export function findSpartacus(state: GameState): { creature: Creature; house?: Ludus; where: 'house' | 'horde' | 'market' | 'released' } | undefined {
  for (const h of allHouses(state)) {
    const c = h.creatures.find((x) => x.legend === 'spartacus');
    if (c) return { creature: c, house: h, where: 'house' };
  }
  const r = state.world.horde.rogues.find((x) => x.legend === 'spartacus');
  if (r) return { creature: r, where: 'horde' };
  const m = [...state.world.market.creatures, ...state.world.market.oldCreatures].find((x) => x.legend === 'spartacus');
  if (m) return { creature: m, where: 'market' };
  const q = (state.player.storyData.pendingMarket as Creature[] | undefined)?.find((x) => x.legend === 'spartacus');
  if (q) return { creature: q, where: 'market' };
  const f = state.world.released.find((x) => x.legend === 'spartacus');
  if (f) return { creature: f, where: 'released' };
  return undefined;
}

function syncSpartacus(state: GameState): void {
  const H = state.world.horde;
  if (!state.world.flags.spartacusArrived || H.spartacusDead) return;
  const where = findSpartacus(state);
  if (!where) {
    H.spartacusDead = true;
    H.spartacusFree = false;
  } else {
    H.spartacusFree = where.where === 'horde';
  }
}

// ---------------------------------------------------------------------------
// Weekly world step (03 §1.3 steps 3, 9, 10, 12, 17, 18)
// ---------------------------------------------------------------------------

function addRogue(state: GameState, c: Creature): void {
  c.loyalty = 0;
  c.gear = {};
  if (c.kind === 'dino' && !c.cls) c.cls = bestClassFor(c);
  state.world.horde.rogues.push(c);
}

function newRogue(state: GameState, tier: 'epic' | 'normal', level: number): Creature {
  const c = generateDino({ tier, week: state.world.week, level: Math.max(1, level) });
  addRogue(state, c);
  return c;
}

function checkDefeat(state: GameState): void {
  const H = state.world.horde;
  const week = state.world.week;
  if (H.defeated) return;
  if (!(H.spartacusDead || !H.spartacusFree) || !H.expeditionsEnabled || week <= 32) return;
  const r = H.rogues.length;
  const a = hordeSize(state);
  const small = (r < 3 && a < 50) || (week > 60 && r < 4 && a < 70) || (state.world.ascension > 2 && week > 100 && a < 100 && r < 8);
  if (!small) return;
  H.defeated = true;
  state.world.flags.spartacusDefeated = true;
  message(state, 'herald', 'The Wild Horde is broken',
    H.spartacusDead
      ? 'The uprising is over. Spartacus\' carcass has been strung up on a cross along the Appian Way, as a lesson to every dino that ever looked at a gate.'
      : 'What is left of the Wild Horde has scattered into the hills. Capua sleeps a little easier, and the Senate takes the credit.');
}

function trainRogues(state: GameState): void {
  const H = state.world.horde;
  const xp = 50 + (asc(state, ASC.jupiter) ? 50 : 0) + (asc(state, ASC.sol) ? 50 : 0);
  for (const c of H.rogues) {
    if (c.kind === 'dino' && !c.cls) c.cls = bestClassFor(c);
    rawXp(c, xp);
    if (c.techPoints > 0) learnRandomTechniques(c, 2);
  }
}

function leaderGrowth(state: GameState): void {
  const leader = rebelLeader(state);
  const army = hordeSize(state);
  if (!leader || army <= 40) return;
  const week = state.world.week;
  let xp = army > 120 ? Math.trunc(week / 5) : Math.trunc(week / 10);
  if (asc(state, ASC.mars)) xp += 100;
  if (asc(state, ASC.jupiter)) xp += 100;
  rawXp(leader, xp);
  if (!hasTrait(leader, 'RebelLeader') && !hasTrait(leader, 'RebelGeneral')) {
    addTrait(leader, 'RebelLeader');
    rawXp(leader, 500);
    message(state, 'herald', 'A leader for the Horde',
      `The escaped dinos in the hills have found a leader: ${leader.name}. They now hunt as a pack.`);
  }
  if (army > 120 && !hasTrait(leader, 'RebelGeneral')) {
    removeTrait(leader, 'RebelLeader');
    addTrait(leader, 'RebelGeneral');
    rawXp(leader, 2000);
    message(state, 'herald', 'A warlord in the hills',
      `${leader.name} now commands a host the size of a legion. The Senate calls it a "minor disturbance".`);
  }
}

function weakestRogues(state: GameState, n: number): Creature[] {
  return [...state.world.horde.rogues]
    .filter((c) => c.legend !== 'spartacus')
    .sort((a, b) => a.level - b.level || a.fame - b.fame)
    .slice(0, n);
}

function removeRogue(state: GameState, c: Creature): void {
  const H = state.world.horde;
  H.rogues = H.rogues.filter((x) => x !== c && x.id !== c.id);
  if (c.legend === 'spartacus') {
    H.spartacusFree = false;
  }
}

function killRogue(state: GameState, c: Creature, cause: string): void {
  removeRogue(state, c);
  bury(state, c, cause);
  if (c.legend === 'spartacus') state.world.horde.spartacusDead = true;
}

function senateIntervention(state: GameState): void {
  const H = state.world.horde;
  const week = state.world.week;
  const hard = state.world.difficulty.hard;
  const f = asc(state, ASC.sol) ? 2 : 1;
  if (week - H.lastSenateWeek <= (hard ? 70 : 40) * f) return;
  if (H.rogues.length <= 3 || hordeSize(state) <= (hard ? 120 : 60) * f) return;
  if (rand(4) !== 0) return;
  H.lastSenateWeek = week;
  const spartacus = H.spartacusFree && !H.spartacusDead ? 200 : 0;
  if (rand(800) + 50 > H.ferals + Math.trunc(H.spoils / 100) + spartacus) {
    H.ferals = Math.trunc(H.ferals / 2);
    H.spoils = Math.trunc(H.spoils / 3);
    const dead = weakestRogues(state, 1 + rand(2));
    for (const c of dead) killRogue(state, c, 'Killed while fighting as a rebel against the legions of Rome');
    message(state, 'herald', 'The legions march',
      `The Senate sent the legions into the hills. Half the ferals were rounded up, the Horde's spoils were seized and ${dead.map((c) => c.name).join(' and ') || 'nobody of note'} died on Roman pikes.`);
  } else {
    H.ferals -= Math.trunc(H.ferals / 4);
    H.spoils -= Math.trunc(H.spoils / 6);
    const vets = weakestRogues(state, 1 + rand(2));
    for (const c of vets) {
      c.injury = c.injury ? { type: 'multiple', weeks: c.injury.weeks + 2 } : { type: 'flesh', weeks: 2 };
      addTrait(c, coin() ? 'Killer' : 'Veteran');
      rawXp(c, 1500);
      c.fame += 50;
    }
    message(state, 'herald', 'The legions retreat',
      'The Senate\'s army met the Wild Horde in the hills and retreated in shame! The survivors on both sides are a lot tougher now. Perhaps we should start an expedition ourselves..');
  }
}

function forgeLibertas(state: GameState): void {
  const H = state.world.horde;
  if (H.libertasForged || H.spoils <= 3500 || !H.spartacusFree || H.spartacusDead) return;
  const g = makeGear('talonBlades', 5, newId('g'), { unique: 'libertas' });
  H.armory.push(g);
  H.spoils -= 3000;
  H.libertasForged = true;
  const sp = H.rogues.find((c) => c.legend === 'spartacus');
  if (sp) sp.gear.weapon = g.id;
  message(state, 'spy', 'A blade called Libertas',
    'Rumour from the hills: the Horde melted down its spoils and had a smith forge a pair of talon blades worthy of a king. They call them Libertas, and Spartacus never takes them off.');
}

function growth(state: GameState): void {
  const H = state.world.horde;
  const week = state.world.week;
  const hard = state.world.difficulty.hard;
  const ascension = state.world.ascension;
  const spartacusLoose = H.spartacusFree && !H.spartacusDead;
  // step 12
  if (week % (hard ? 5 : 7) === 0) {
    if (H.rogues.length > 100) H.ferals += 5;
    else newRogue(state, 'epic', Math.trunc(week / 10) + 1);
  }
  if (week > 12 && week % 5 === 0) H.ferals += 1;
  if (spartacusLoose && (hard || week % 2 === 0)) H.ferals += 1;
  if (week > 25 && week % (hard ? 3 : 4) === 0) {
    if (H.rogues.length > 100) H.ferals += 3;
    else newRogue(state, 'normal', Math.trunc(week / 20) + 1);
  }
  // step 17
  if (week > 40 && week % (ascension <= 2 ? 4 : 2) === 0) {
    if (H.rogues.length > 100) H.ferals += 4;
    else newRogue(state, 'epic', Math.trunc(week / 15) + 1);
  }
  if (week > 50 && (ascension > 2 || week % 3 === 0)) H.ferals += 1;
  if (ascension > 2 && week > 15) H.ferals += 2 + (hard ? 1 : 0);
}

function rogueUpkeep(state: GameState): void {
  for (const c of state.world.horde.rogues) {
    c.ageWeeks += 1;
    if (c.maturity >= 1) c.adultWeeks += 1;
    if (c.injury) {
      c.injury.weeks -= 1;
      if (c.injury.weeks <= 0) c.injury = null;
    }
    if (c.ill > 0) c.ill -= 1;
    c.inactive = false;
  }
}

/** World-step rebel growth, spoils, Libertas, Senate intervention, rogue training, expeditions enabled, defeat check. */
export function hordeWeek(state: GameState): void {
  const H = state.world.horde;
  const week = state.world.week;
  syncSpartacus(state);
  checkDefeat(state);
  // step 9
  H.spoils += 3 * H.rogues.length + Math.trunc(H.ferals / 2);
  trainRogues(state);
  leaderGrowth(state);
  senateIntervention(state);
  forgeLibertas(state);
  if (H.spoils > 5000) {
    H.spoils -= 200;
    H.ferals += 1;
  }
  // step 10 (hard)
  if (state.world.difficulty.hard && week % 6 === 0 && H.spoils > 1000) {
    H.spoils -= 200;
    H.ferals += 1;
  }
  growth(state);
  // step 18
  if (!H.expeditionsEnabled && ((hordeSize(state) > 2 && H.rogues.length >= 1) || H.spoils > 500)) {
    H.expeditionsEnabled = true;
    message(state, 'herald', 'Trouble in the hills',
      'Escaped dinos are gathering in the hills around Capua and raiding farms. The Senate will now fund expeditions against them.');
  }
  rogueUpkeep(state);
  H.ferals = Math.max(0, H.ferals);
  H.spoils = Math.max(0, H.spoils);
}

// ---------------------------------------------------------------------------
// Scripted timeline (03 §1.3 steps 8 (Theokoles), 13, 14, 21)
// ---------------------------------------------------------------------------

export function spartacusWeeks(state: GameState): { arrive: number; clutch: number; humiliation: number; plot: number } {
  return state.world.difficulty.hard
    ? { arrive: 10, clutch: 18, humiliation: 24, plot: 30 }
    : { arrive: 15, clutch: 20, humiliation: 28, plot: 35 };
}

function weakestRival(state: GameState): Ludus | undefined {
  return [...activeRivals(state)].sort((a, b) => a.influence - b.influence)[0];
}

function strongestRival(state: GameState): Ludus | undefined {
  return [...activeRivals(state)].sort((a, b) => b.influence - a.influence)[0];
}

function rivalByKey(state: GameState, key: string): Ludus | undefined {
  return activeRivals(state).find((r) => r.ai?.key === key);
}

function spartacusArrives(state: GameState): void {
  const f = state.world.flags;
  if (f.spartacusArrived) return;
  const owner = rivalByKey(state, 'batiatus') ?? weakestRival(state);
  if (!owner) return;
  const sp = legendCreature(state, 'spartacus');
  sp.legend = 'spartacus';
  owner.creatures.push(sp);
  f.spartacusArrived = true;
  f.spartacusOwnerId = owner.id;
  message(state, 'informant', 'A slave called Spartacus',
    `Your rival ${owner.name} has used his unsavory connections to get his claws on a Thracian Allosaurus called Spartacus. They say it killed four legionaries before it was netted.`);
}

function spartacusBeat(state: GameState, beat: 'clutch' | 'humiliation' | 'plot'): void {
  const f = state.world.flags;
  if (f[`spartacus:${beat}`]) return;
  const found = findSpartacus(state);
  if (!found || found.where !== 'house' || !found.house) return;
  const sp = found.creature;
  const owner = found.house;
  const me = state.player.ludus;
  const spies = committedSpies(state, me);
  if (beat !== 'plot' && owner.isPlayer) return;
  f[`spartacus:${beat}`] = true;
  switch (beat) {
    case 'clutch':
      changeLoyalty(sp, -20);
      addTrait(sp, 'LostFamily');
      if (spies > 0) {
        addInfluence(state, me, 5);
        addInfluence(state, owner, -5);
        message(state, 'spy', 'A smashed clutch',
          `${owner.name}'s men smashed Spartacus' clutch of eggs and made it look like a raid by wild beasts. "Now we shall have his undivided attention." The story is worth something in the forum (+5 influence).`);
      }
      break;
    case 'humiliation':
      addInfluence(state, owner, -10);
      owner.denarii += 600;
      changeLoyalty(sp, -30);
      for (const c of owner.creatures) if (c !== sp) changeLoyalty(c, -35);
      if (spies > 0) {
        addInfluence(state, me, 5);
        addInfluence(state, owner, -15);
        message(state, 'spy', 'A shameful evening',
          `${owner.name} rented out his dinos to a drunken patrician's party for 600 denarii. Spartacus was made to pull a chariot of senators' wives. Capua is laughing at ${owner.name} (+5 influence for you).`);
      }
      if (!owner.isPlayer && !(state.player.stories.spartacusEscape ?? 0)) {
        state.player.stories.spartacusEscape = 1;
        state.player.storyData.spartacusEscapeHouse = owner.id;
      }
      break;
    case 'plot':
      addInfluence(state, owner, -10);
      changeLoyalty(sp, -20);
      addTrait(sp, 'PlottingUprising');
      for (const c of owner.creatures) if (c !== sp) changeLoyalty(c, -15);
      if (owner.isPlayer) {
        message(state, 'assistant', 'Unrest in the pens',
          'Spartacus has been growling to the other dinos at night. The keepers say the whole pen goes quiet when it speaks. You lose face in the forum (−10 influence).');
      } else if (spies > 1) {
        addInfluence(state, me, 5);
        message(state, 'spy', 'A revolt in the making',
          `Spartacus is plotting to mobilise every dino in ${owner.name}'s pens. Good to know before everyone else does (+5 influence).`);
      }
      break;
  }
}

function namedArrivals(state: GameState): void {
  const d = state.world.difficulty;
  const week = state.world.week;
  const f = state.world.flags;
  const caesarWeek = d.nightmare ? 12 : d.hard ? 20 : 25;
  if (week === caesarWeek && !f.caesarArrived && !state.rivals.some((r) => r.ai?.key === 'caesar')) {
    f.caesarArrived = true;
    const r = spawnRival(state, 'caesar');
    if (r && !state.rivals.includes(r)) state.rivals.push(r);
    message(state, 'magistrate', 'The Caesar family comes to Capua',
      `The infamous Caesar family has opened a ludus in Capua${r ? `: House ${r.name}` : ''}. Their dinos are fed better than most citizens.`);
  }
  if (d.nightmare && week === 20 && !f.crassusArrived && !state.rivals.some((r) => r.ai?.key === 'crassus')) {
    f.crassusArrived = true;
    const r = spawnRival(state, 'crassus');
    if (r && !state.rivals.includes(r)) state.rivals.push(r);
    message(state, 'magistrate', 'The richest man in Rome',
      `Marcus Licinius Crassus has bought land in Capua and opened a ludus${r ? `, House ${r.name}` : ''}. He has more denarii than you have keepers have teeth.`);
  }
}

function theokolesWeek(state: GameState): void {
  const f = state.world.flags;
  if (f.theokoles) return;
  const d = state.world.difficulty;
  const week = state.world.week;
  let t = d.nightmare ? -5 : d.hard ? 0 : asc(state, ASC.vulcan) ? 10 : 20;
  if (state.world.ascension > 4) t -= 10;
  const strongest = strongestRival(state);
  if (!strongest) return;
  const me = state.player.ludus;
  if (week > t + 30 && strongest.influence < me.influence && rand(5) === 0) {
    const th = legendCreature(state, 'theokoles');
    th.legend = 'theokoles';
    th.price = undefined;
    strongest.creatures.push(th);
    strongest.denarii -= Math.trunc(Math.max(0, strongest.denarii) / 2);
    f.theokoles = strongest.id;
    message(state, 'herald', 'Theokoles',
      `House ${strongest.name} spent half its fortune on Theokoles, the albino Tyrannosaurus they call the Shadow of Death. It has never lost. It has rarely left anything to bury.`);
  } else if (week + t > 50 && strongest.influence > me.influence && rand(5) === 0) {
    const th = legendCreature(state, 'theokoles');
    th.legend = 'theokoles';
    th.price = 800;
    state.world.market.creatures.push(th);
    f.theokoles = 'market';
    if (committedSpies(state, me) > 0) {
      message(state, 'spy', 'The Shadow of Death is for sale',
        'A slaver from the east has brought Theokoles, the albino Tyrannosaurus, to the Capua market. 800 denarii. Nobody has dared bid yet.');
    }
  }
}

function releasedReturn(state: GameState): void {
  const rel = state.world.released;
  if (!rel.length) return;
  const roll = rand(100);
  if (roll <= 95) return;
  const c = pick(rel);
  state.world.released = rel.filter((x) => x !== c);
  c.loyalty = 100;
  c.away = undefined;
  c.inactive = false;
  const rivals = activeRivals(state);
  if (roll >= 98 || !rivals.length || hasTrait(c, 'Loyal')) {
    c.price = undefined;
    c.price = marketPrice(c) + 200 + 50 * c.level;
    state.world.market.creatures.push(c);
    message(state, 'informant', `${c.name} wants to come back`,
      `${c.name}, whom you released, has wandered back to the gates of Capua. "Civilian life is not for me." It waits at the market for ${c.price} denarii.`);
  } else if (roll === 97) {
    joinHorde(state, c);
    message(state, 'herald', `${c.name} turns rebel`,
      `${c.name}, released to the wild by your own hand, has decided to betray Rome by taking up arms against us! It runs with the Wild Horde now.`);
  } else {
    const r = pick(rivals);
    c.price = undefined;
    r.creatures.push(c);
    message(state, 'informant', `${c.name} signs with House ${r.name}`,
      `${c.name}, whom you released, has gone back to the sand, for House ${r.name}. The fool.`);
  }
}

/** Scripted Spartacus beats (15/20/28/35 normal; 10/18/24/30 hard) and named rival arrivals (Caesar, Crassus). */
export function timelineWeek(state: GameState): void {
  const week = state.world.week;
  const W = spartacusWeeks(state);
  if (week === W.arrive) spartacusArrives(state);
  if (week === W.clutch) spartacusBeat(state, 'clutch');
  if (week === W.humiliation) spartacusBeat(state, 'humiliation');
  if (week === W.plot) spartacusBeat(state, 'plot');
  namedArrivals(state);
  theokolesWeek(state);
  releasedReturn(state);
  flushMarketOffers(state);
}

// ---------------------------------------------------------------------------
// Joining the Horde
// ---------------------------------------------------------------------------

function slotOf(g: Gear): string | undefined {
  return GEAR[g.type]?.slot;
}

function takeFromArmory(from: Ludus, to: Ludus, slot: string): Gear | undefined {
  const pool = from.armory.filter((g) => slotOf(g) === slot);
  if (!pool.length) return undefined;
  const g = pick(pool);
  from.armory = from.armory.filter((x) => x.id !== g.id);
  for (const c of from.creatures) for (const s of Object.keys(c.gear) as (keyof Creature['gear'])[]) if (c.gear[s] === g.id) c.gear[s] = undefined;
  to.armory.push(g);
  return g;
}

/** Add an escaped creature to the Horde. */
export function joinHorde(state: GameState, c: Creature, from?: Ludus): void {
  const H = state.world.horde;
  const house = from ?? ownerOf(state, c);
  detachCreature(house, c);
  state.world.market.creatures = state.world.market.creatures.filter((x) => x !== c);
  state.world.released = state.world.released.filter((x) => x !== c);
  if (!hasTrait(c, 'Escaped')) {
    addTrait(c, 'Escaped');
    c.fame += 5;
    changeLoyalty(c, -50);
    grantXp(c, 100);
  }
  c.spyFor = undefined;
  c.away = undefined;
  c.inactive = false;
  c.gear = {};
  c.instruction = 'default';
  c.price = undefined;
  c.offerToRivals = false;
  if (c.kind === 'dino' && !c.cls) c.cls = bestClassFor(c);
  if (!H.rogues.includes(c)) H.rogues.push(c);
  if (c.legend !== 'spartacus') return;

  H.spartacusFree = true;
  H.spartacusDead = false;
  state.world.flags.spartacusArrived = true;
  H.ferals += Math.trunc(state.world.week / 10);
  if (house) loseKeepers(state, house, Math.min(2, keeperTotal(house)));
  message(state, 'herald', 'Spartacus is loose',
    `Spartacus has broken out${house ? ` of House ${house.name}` : ''} and fled into the hills. Every escaped dino within fifty miles is heading to join it.`);
  const prog = state.player.stories.spartacusEscape ?? 0;
  if (prog >= 4 && prog < 6) {
    state.player.stories.spartacusEscape = 6;
    H.ferals += 5;
    H.spoils += 500;
    const batiatus = house && !house.isPlayer ? house : activeRivals(state).find((r) => r.ai?.key === 'batiatus');
    const me = state.player.ludus;
    const got: string[] = [];
    if (batiatus) {
      const w = takeFromArmory(batiatus, me, 'weapon');
      const a = takeFromArmory(batiatus, me, 'armor') ?? takeFromArmory(batiatus, me, 'helmet');
      if (w) got.push(gearName(w));
      if (a) got.push(gearName(a));
    }
    message(state, 'informant', 'A parcel from the hills',
      `A sack was left at your gate in the night. Inside: ${got.length ? got.join(' and ') : 'nothing but a handful of feathers'}, "borrowed" from the ${batiatus?.name ?? 'Batiatus'} armory. No note. None was needed.`);
  }
}

// ---------------------------------------------------------------------------
// Rebel raids (05 §6, 04 §9.3)
// ---------------------------------------------------------------------------

const ALL_BUILDINGS: BuildingId[] = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery',
  'templeOfPluto', 'library', 'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop',
  'guardTower', 'aqueduct', 'romeMansion', 'tavern', 'bathHouse'];

/** A throwaway house so combat can equip rebels from the Horde's armory. */
function pseudoHouse(name: string, creatures: Creature[], armory: Gear[]): Ludus {
  return {
    id: `horde-${name}`, name, isPlayer: false, denarii: 0, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0,
    entBonus: 0, securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 0, spies: 0 }, spiesLastWeek: 0,
    buildings: Object.fromEntries(ALL_BUILDINGS.map((b) => [b, 0])) as Record<BuildingId, number>, builtThisWeek: false,
    creatures: [...creatures], armory: [...armory], pantry: {}, eggs: [], pairs: [], bankruptLastWeek: false, unpaidThisWeek: false,
    training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
    trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
  };
}

function feral(state: GameState, level: number): Creature {
  const c = generateDino({ tier: 'cheap', week: state.world.week, level: Math.max(1, level) });
  c.name = `Feral ${speciesName(c)}`;
  c.loyalty = 0;
  return c;
}

const WEAPONS = GEAR_TYPES.filter((t) => GEAR[t].slot === 'weapon' && GEAR[t].market && !GEAR[t].upgrade);
const ARMORS = GEAR_TYPES.filter((t) => GEAR[t].slot === 'armor' && GEAR[t].market && !GEAR[t].upgrade);

/** Rebels are "equipped by danger level": temporary gear for this fight only. */
function dangerGear(n: number, danger: number): Gear[] {
  const q = clamp(Math.trunc(danger / 15), 0, 4) as Quality;
  const out: Gear[] = [];
  for (let i = 0; i < n; i++) {
    if (WEAPONS.length) out.push(makeGear(pick(WEAPONS) as GearTypeId, q, newId('g')));
    if (danger > 0 && ARMORS.length) out.push(makeGear(pick(ARMORS) as GearTypeId, q, newId('g')));
  }
  return out;
}

/** Fit rogues, strongest first. */
function fitRogues(state: GameState): Creature[] {
  return state.world.horde.rogues.filter((c) => !c.injury && canFightAge(c)).sort((a, b) => b.level - a.level || b.fame - a.fame);
}

/** Rebel side: the champion plus `extra` more, filled with ferals. */
function rebelSide(state: GameState, extra: number, danger: number, lead?: Creature): { side: BattleSide; temps: Set<ID>; rogues: Creature[] } {
  const pool = fitRogues(state);
  const champion = lead ?? pool[0];
  const fighters: Creature[] = [];
  const temps = new Set<ID>();
  if (champion) fighters.push(champion);
  for (const c of pool) {
    if (fighters.length >= 1 + extra) break;
    if (!fighters.includes(c)) fighters.push(c);
  }
  while (fighters.length < 1 + extra) {
    const f = feral(state, Math.trunc(Math.max(0, danger) / 10) + 1 + Math.trunc(state.world.week / 20));
    temps.add(f.id);
    fighters.push(f);
  }
  const house = pseudoHouse('The Wild Horde', fighters, [...state.world.horde.armory, ...dangerGear(fighters.length, danger)]);
  const side = buildSide(state, house, fighters, 'allout', { riders: false, name: 'The Wild Horde' });
  for (const f of side.fighters) if (temps.has(f.creature.id)) f.temporary = true;
  return { side, temps, rogues: fighters.filter((c) => !temps.has(c.id)) };
}

/** After a battle: drop rogues that died from the Horde (combat records the death itself). */
function settleRogueDeaths(state: GameState, result: BattleResult, rogues: Creature[]): Creature[] {
  const dead: Creature[] = [];
  for (const o of result.outcomes) {
    if (!o.died) continue;
    const c = rogues.find((x) => x.id === o.creatureId);
    if (!c) continue;
    removeRogue(state, c); // care.bury may already have dropped it
    dead.push(c);
    if (c.legend === 'spartacus') state.world.horde.spartacusDead = true;
  }
  return dead;
}

function healthyCount(h: Ludus): number {
  return h.creatures.filter((c) => canFight(c) && !c.injury && !c.away).length;
}
function rosterCount(h: Ludus): number {
  return h.creatures.filter((c) => canFightAge(c)).length;
}

/** GM danger: army − ((healthy + all)/2 + S). */
export function raidDanger(state: GameState, h: Ludus, army: number): number {
  const S = securityTotal(state, h);
  return Math.trunc(army - ((healthyCount(h) + rosterCount(h)) / 2 + S));
}

/** Army size that raids the player (size/2 + 15 above 30; −⅛ with Informants when > 7). */
export function raidArmyVsPlayer(state: GameState): number {
  let a = hordeSize(state);
  if (a > 30) a = Math.trunc(a / 2) + 15;
  if (hasOpp(state, 'informants') && a > 7) a -= Math.trunc(a / 8);
  return a;
}

/** Losing to the rebels (GM LoseRogueBattle). Returns report lines. */
function loseRogueBattle(state: GameState, h: Ludus, danger: number): string[] {
  const H = state.world.horde;
  const lines: string[] = [];
  const S = securityTotal(state, h);
  const hard = state.world.difficulty.hard;
  const i = Math.max(0, danger);
  let lost = 0;
  if (i > S) {
    if ((h.buildings.palisade ?? 0) > 0) {
      h.buildings.palisade -= 1;
      lines.push('The palisade was torn down.');
    } else if ((h.buildings.residence ?? 0) > 0) {
      h.buildings.residence -= 1;
      lines.push('The villa was looted and set alight (Residence −1).');
    }
    const victim = [...h.creatures].filter((c) => !c.away).sort((a, b) => a.loyalty - b.loyalty)[0];
    if (victim) {
      if (hard) {
        joinHorde(state, victim, h);
        lines.push(`${victim.name} ran off with the Horde.`);
      } else {
        const inj = injureCreature(victim, 5, false);
        const res = inj && inj !== 'dead' ? inj : (victim.injury = victim.injury ?? { type: 'flesh', weeks: 2 });
        lines.push(`${victim.name} was mauled (${INJURY_NAMES[res.type]}).`);
      }
    }
    const want = Math.max(0, i - Math.trunc(S / 2));
    const have = keeperTotal(h);
    lost = Math.min(want, have);
    if (lost > 0) loseKeepers(state, h, lost);
    if (want > lost) {
      h.denarii -= 50 * (want - lost);
      lines.push(`Short of keepers to drag off, they took ${50 * (want - lost)} denarii instead.`);
    }
    if (coin()) {
      const b = loseRandomBuilding(h);
      if (b) lines.push(`The ${(BUILDINGS as Record<string, { name?: string } | undefined>)[b]?.name ?? b} was burned.`);
    }
    if (h.creatures.length === 0 && keeperTotal(h) === 0) h.defeated = 'horde';
  } else {
    const want = Math.max(0, i - Math.trunc(S / (hard ? 4 : 2)));
    lost = Math.min(want, keeperTotal(h));
    if (lost > 0) loseKeepers(state, h, lost);
  }
  if (lost > 0) lines.push(`${lost} keepers were carried off to join the Horde.`);
  H.ferals += lost;
  const plunder = Math.min(50 * i, Math.max(0, h.denarii));
  if (plunder > 0) {
    h.denarii -= plunder;
    H.spoils += plunder;
    lines.push(`They plundered ${plunder} denarii.`);
  }
  return lines;
}

function raidTarget(state: GameState): { target: Ludus; bounty: boolean } | null {
  const H = state.world.horde;
  const me = state.player.ludus;
  const week = state.world.week;
  if (H.bountyTarget) {
    const b = activeRivals(state).find((r) => r.id === H.bountyTarget);
    H.bountyTarget = undefined;
    if (b) return { target: b, bounty: true };
  }
  const gap = state.world.ascension > 0 ? 4 : state.world.difficulty.hard ? 5 : 6;
  if (!me.defeated && week - H.lastRaidOnPlayer >= gap && rand(3) === 0) return { target: me, bounty: false };
  const pool = activeRivals(state).filter((r) => (r.ai?.visible ?? true) && !r.ai?.pact);
  if (!pool.length) return null;
  return { target: pick(pool), bounty: false };
}

/** Rebel raid roll; returns a Decision for the player (fight / pay / hide) or resolves a raid on a rival. */
export function rebelRaid(state: GameState): Decision | null {
  const H = state.world.horde;
  const d = state.world.difficulty;
  const week = state.world.week;
  if (d.raidsDisabled) return null;
  const army = hordeSize(state);
  if (army <= 1) return null;
  if (!(rand(5) > (d.hard ? 2 : 3) || week - H.lastRaidWeek > 3)) return null;
  const t = raidTarget(state);
  if (!t) return null;
  const { target, bounty } = t;
  const S = securityTotal(state, target);
  if (S > 10 * army) return null; // a well-guarded house is left alone
  H.lastRaidWeek = week;
  if (target.isPlayer) return playerRaidDecision(state);
  return raidRival(state, target, bounty ? army + Math.trunc(army / 3) : army);
}

function raidRival(state: GameState, r: Ludus, army: number): null {
  const H = state.world.horde;
  const danger = raidDanger(state, r, army);
  if (danger > 0) {
    const lines = loseRogueBattle(state, r, danger);
    message(state, 'herald', `${r.name} attacked by escaped dinos!`,
      `The Wild Horde fell on House ${r.name} in the night. ${lines.join(' ')}${r.defeated ? ` House ${r.name} has been ransacked by a roaming band of escaped dinos and is no more.` : ''}`);
  } else {
    const killed = Math.min(H.ferals, rand(3));
    H.ferals -= killed;
    message(state, 'herald', `${r.name} attacked by escaped dinos!`,
      `The Wild Horde tried House ${r.name}'s gates and was driven off${killed ? `, leaving ${killed} dead ferals in the ditch` : ''}.`);
  }
  return null;
}

function raidNumbers(state: GameState, a: number): { cost: number; hide: number; short: boolean; S: number; danger: number } {
  const me = state.player.ludus;
  const week = state.world.week;
  const S = securityTotal(state, me);
  let cost = (state.world.ascension > 1 ? 35 : 25) * a;
  if (week < 50) cost = Math.trunc((cost * (100 - (50 - week))) / 100);
  if (S > a) cost = Math.trunc(cost / 2);
  const walls = (me.buildings.palisade ?? 0) > 0;
  let hide = (walls ? 5 : 15) * a;
  const short = !(S > a - (state.world.difficulty.hard ? 1 : 2));
  if (!short) hide = Math.trunc(hide / 4);
  return { cost, hide, short, S, danger: raidDanger(state, me, a) };
}

function playerChampion(state: GameState): Creature | undefined {
  return mostFamous(state.player.ludus.creatures.filter((c) => !c.away && canFight(c)));
}

function playerRaidDecision(state: GameState): Decision {
  const H = state.world.horde;
  const me = state.player.ludus;
  const week = state.world.week;
  H.lastRaidOnPlayer = week;
  const a = raidArmyVsPlayer(state);
  const n = raidNumbers(state, a);
  const champ = playerChampion(state);
  const extra = n.danger > 0 ? (n.danger > 10 ? 2 : 1) : 0;
  const leader = rebelLeader(state);
  const title = a > 4 ? 'Dino uprising!' : 'Escaped dinos attack!';
  const text = `${a > 4 ? `A pack of ${a} escaped dinos` : 'A handful of escaped dinos'}${leader ? ` led by ${leader.name}` : ''} is at your gates, howling for meat and denarii. ` +
    `Your wardens count ${n.S} security against them.${n.danger > 0 ? ' This could get ugly.' : ''}`;
  return {
    id: newId('dc'), key: 'rebelRaid', title, text, week, art: leader?.legend === 'spartacus' ? 'spartacus' : 'horde',
    options: [
      {
        label: 'Fight them',
        desc: champ
          ? `${champ.name} faces the Horde's champion${extra ? ` and ${extra} more` : ''}${(me.buildings.palisade ?? 0) > 0 ? ' from behind the palisade' : ''}. Win: every rival respects you (+1 opinion). Lose: the Horde breaks in.`
          : 'You have no dino fit to fight.',
        disabled: !champ, reason: champ ? undefined : 'No dino fit to fight.',
      },
      {
        label: 'Pay them off',
        desc: `${n.cost} denarii. The spoils will only make the Horde bigger.`,
        disabled: me.denarii < n.cost, reason: me.denarii < n.cost ? `Needs ${n.cost} denarii.` : undefined,
      },
      {
        label: 'Hide behind the palisade',
        desc: `−5 influence. They plunder about ${n.hide} denarii${n.short ? ', and with so few wardens they will take keepers and maybe a dino too' : ''}.`,
      },
    ],
    data: { army: a, danger: n.danger, cost: n.cost, hide: n.hide, short: n.short, extra },
  };
}

/** Player choice on a raid decision (option index). Fight returns a battle. */
export function resolveRaid(state: GameState, decision: Decision, option: number): { text: string; battle?: BattleResult } {
  const me = state.player.ludus;
  const H = state.world.horde;
  const data = decision.data ?? {};
  const a: number = data.army ?? raidArmyVsPlayer(state);
  const n = raidNumbers(state, a);
  const danger: number = data.danger ?? n.danger;
  let text: string;
  let battle: BattleResult | undefined;

  if (option === 1 && me.denarii >= (data.cost ?? n.cost)) {
    const cost: number = data.cost ?? n.cost;
    me.denarii -= cost;
    H.spoils += cost;
    report(state, 'expense', 'Paid off the Wild Horde', -cost);
    text = `You paid the Horde ${cost} denarii. They took it, howled, and went to frighten someone else.`;
  } else if (option === 0 && playerChampion(state)) {
    const r = fightRaid(state, a, danger, data.extra ?? (danger > 0 ? (danger > 10 ? 2 : 1) : 0));
    text = r.text;
    battle = r.battle;
  } else {
    text = hideFromRaid(state, a, { hide: data.hide ?? n.hide, short: data.short ?? n.short, S: n.S });
  }
  if (me.defeated && !state.over) {
    state.over = { reason: me.defeated, week: state.world.week, influence: me.influence };
    message(state, 'herald', 'The ludus has fallen', 'The Wild Horde ransacked your ludus. Your head has been put on a pike at the gate.');
  }
  return { text, battle };
}

function hideFromRaid(state: GameState, a: number, n: { hide: number; short: boolean; S: number }): string {
  const me = state.player.ludus;
  const H = state.world.horde;
  const lines: string[] = ['You barred the gates and hid behind the palisade (−5 influence).'];
  addInfluence(state, me, -5);
  const plunder = Math.min(n.hide, Math.max(0, me.denarii));
  me.denarii -= plunder;
  H.spoils += plunder;
  if (plunder) lines.push(`The Horde plundered ${plunder} denarii from the outbuildings.`);
  if (n.short) {
    const want = Math.max(1, Math.trunc((a - n.S) / 3));
    const lost = Math.min(want, keeperTotal(me));
    if (lost > 0) {
      loseKeepers(state, me, lost);
      H.ferals += lost;
      lines.push(`${lost} keepers were dragged off to join the Horde.`);
    }
    if ((me.buildings.palisade ?? 0) > 0 && coin()) {
      me.buildings.palisade -= 1;
      lines.push('They pulled down part of the palisade.');
    }
    const present = me.creatures.filter((c) => !c.away && canFightAge(c));
    if (!present.length) {
      me.defeated = 'horde';
      lines.push('There was nobody left to stop them.');
    } else if (coin()) {
      const victim = pick(present);
      if (state.world.difficulty.hard) {
        joinHorde(state, victim, me);
        lines.push(`They broke into the pens and ${victim.name} ran off with them.`);
      } else {
        const inj = injureCreature(victim, 4, false);
        const res = inj && inj !== 'dead' ? inj : (victim.injury = victim.injury ?? { type: 'flesh', weeks: 2 });
        lines.push(`They broke into the pens and mauled ${victim.name} (${INJURY_NAMES[res.type]}).`);
      }
    }
  }
  return lines.join(' ');
}

function allyHelp(state: GameState, room: number): { fighters: { c: Creature; house?: Ludus; temp: boolean }[]; lines: string[] } {
  const me = state.player.ludus;
  const out: { c: Creature; house?: Ludus; temp: boolean }[] = [];
  const lines: string[] = [];
  if (room <= 0) return { fighters: out, lines };
  const ally = activeRivals(state).find((r) => r.ai?.pact && r.ai.opinion >= 60);
  const best = ally ? mostFamous(ally.creatures.filter((c) => canFight(c) && !c.away)) : undefined;
  if (ally && best && out.length < room) {
    out.push({ c: best, house: ally, temp: true });
    lines.push(`House ${ally.name} sent ${best.name} to help.`);
  }
  const lictor = state.player.consul ? (state.player.storyData.lictor as Creature | undefined) : undefined;
  if (lictor && out.length < room) {
    out.push({ c: lictor, temp: true });
    lines.push(`Your lictor ${lictor.name} joined the fight.`);
  }
  const boy = me.creatures.find((c) => c.kind === 'beast' && (hasTrait(c, 'GoodBoy') || hasTrait(c, 'BestBoy')) && canFight(c) && !c.away);
  if (boy && out.length < room) {
    out.push({ c: boy, house: me, temp: false });
    lines.push(`${boy.name} leapt to defend its keepers.`);
  }
  return { fighters: out, lines };
}

function fightRaid(state: GameState, a: number, danger: number, extra: number): { text: string; battle?: BattleResult } {
  const me = state.player.ludus;
  const H = state.world.horde;
  const S = securityTotal(state, me);
  const champ = playerChampion(state)!;
  const lines: string[] = [];
  const help = danger > 0 ? allyHelp(state, 2) : { fighters: [], lines: [] };
  const own = [champ, ...help.fighters.filter((f) => f.house === me && f.c !== champ).map((f) => f.c)];
  const mods: BattleSide['modifiers'] = [];
  if ((me.buildings.palisade ?? 0) > 0) mods.push('Walled');
  if (a > 2 * S) mods.push('Surrounded');
  const instr: Record<ID, Instruction | null> = {};
  for (const c of own) instr[c.id] = c.instruction;
  const sideA = buildSide(state, me, own, instr, { riders: true, name: me.name, modifiers: mods, player: true });
  for (const f of help.fighters) {
    if (f.house === me) continue;
    const src = f.house ?? pseudoHouse('Lictors', [f.c], (state.player.storyData.lictorGear as Gear[] | undefined) ?? []);
    if (f.c.legend === 'lictor' && !f.house) {
      const gear = (state.player.storyData.lictorGear as Gear[] | undefined) ?? [];
      for (const g of gear) {
        const slot = GEAR[g.type]?.slot;
        if (slot) f.c.gear[slot] = g.id;
      }
    }
    const extraSide = buildSide(state, src, [f.c], 'default', { riders: true, name: me.name });
    for (const bf of extraSide.fighters) {
      bf.temporary = true;
      sideA.fighters.push(bf);
    }
  }
  lines.push(...help.lines);
  const rebels = rebelSide(state, extra, danger);
  const battle = resolveBattle([sideA, rebels.side], { week: state.world.week, riders: true, event: true, label: 'The Wild Horde at the gates' });
  applyBattleResult({ state, event: true, deathCause: 'Killed defending the ludus from the Wild Horde' }, [sideA, rebels.side], battle);
  const dead = settleRogueDeaths(state, battle, rebels.rogues);
  if (battle.winner === 0) {
    for (const r of activeRivals(state)) changeOpinion(state, r, 1);
    addInfluence(state, me, 10);
    const fled = Math.min(H.ferals, 1 + rand(3));
    H.ferals -= fled;
    lines.unshift(`${champ.name} and the defenders threw the Horde back from the gates (+10 influence). Every lanista in Capua heard about it.`);
    if (dead.length) lines.push(`${dead.map((c) => c.name).join(' and ')} will not raid anyone again.`);
  } else {
    addInfluence(state, me, -10);
    lines.unshift('The Horde broke through (−10 influence).');
    lines.push(...loseRogueBattle(state, me, danger));
    if (me.defeated) lines.push('There was nothing left to defend.');
  }
  return { text: lines.join(' '), battle };
}

// ---------------------------------------------------------------------------
// Expeditions (04 §8)
// ---------------------------------------------------------------------------

const INFLUENCE_TIERS = [150, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 500000];

export function expeditionWeeks(state: GameState): number {
  return 3 + (asc(state, ASC.neptune) ? 1 : 0);
}

export function maxExpeditionKeepers(state: GameState): number {
  return Math.min(10, Math.trunc(keeperTotal(state.player.ludus) / 2));
}

function militiaFor(state: GameState, funds: number, keepers: number): number {
  const me = state.player.ludus;
  let m = 10 + (hasOpp(state, 'bribeGeneral') ? 5 : 0) + (hasOpp(state, 'imperator') ? 50 : 0) + Math.trunc(hordeSize(state) / 10)
    + Math.trunc(funds / 40) + keepers * 3;
  if (state.player.senator) m *= 2;
  if (princepsActive(state)) m *= 2;
  m += 5 * INFLUENCE_TIERS.filter((t) => me.influence >= t).length;
  if (asc(state, ASC.mars)) m = Math.trunc(m * 0.9);
  return m;
}

function militiaLabel(militia: number, army: number): string {
  if (militia > army) return 'Extermination';
  if (militia > 75) return 'Army';
  return 'Skirmish';
}

export function expeditionPreview(state: GameState, o: { commanderId: ID; funds: number; keepers: number }): { militia: number; ok: string | null; label: string } {
  const me = state.player.ludus;
  const H = state.world.horde;
  const army = hordeSize(state);
  const militia = militiaFor(state, Math.max(0, o.funds), Math.max(0, o.keepers));
  const label = militiaLabel(militia, army);
  let ok: string | null = null;
  const commander = me.creatures.find((c) => c.id === o.commanderId);
  if (state.player.expedition) ok = 'An expedition is already in the field.';
  else if (!H.expeditionsEnabled) ok = 'There is no rebellion to put down. Yet.';
  else if (army < 8 && H.rogues.length < 5 && state.world.week < 40) ok = 'The Senate refuses: "A few runaway lizards are not a war."';
  else if (me.influence < 100) ok = 'The Senate will not hand a militia to a lanista with less than 100 influence.';
  else if (o.funds < 200) ok = 'The militia wants at least 200 denarii up front.';
  else if (o.funds > me.denarii) ok = 'You do not have that much coin.';
  else if (!commander) ok = 'Choose a commander.';
  else if (commander.kind !== 'dino' || commander.away || !canFight(commander)) ok = `${commander.name} cannot lead an expedition right now.`;
  else if (o.keepers < 0 || o.keepers > maxExpeditionKeepers(state)) ok = `You can send at most ${maxExpeditionKeepers(state)} keepers.`;
  return { militia, ok, label };
}

export function startExpedition(state: GameState, o: { commanderId: ID; funds: number; keepers: number; capture: boolean }): string | null {
  const p = expeditionPreview(state, o);
  if (p.ok) return p.ok;
  const me = state.player.ludus;
  const commander = me.creatures.find((c) => c.id === o.commanderId)!;
  me.denarii -= o.funds;
  if (o.keepers > 0) loseKeepers(state, me, o.keepers);
  const weeks = expeditionWeeks(state);
  commander.away = { kind: 'expedition', weeksLeft: weeks, note: 'Hunting the Wild Horde' };
  state.player.expedition = {
    commanderId: commander.id, funds: o.funds, keepers: o.keepers, capture: o.capture, weeksLeft: weeks, tactics: [], militia: p.militia,
  };
  delete state.player.storyData.expeditionTactics;
  message(state, 'assistant', 'The militia marches',
    `${commander.name} leads ${p.militia} militia into the hills (${p.label.toLowerCase()}). They should find the Horde in ${weeks} weeks.`);
  objectiveEvent(state, 'expedition:start');
  return null;
}

/** Weekly countdown; when it arrives returns the tactics choice (3 random tactics). */
export function expeditionWeek(state: GameState): void {
  const exp = state.player.expedition;
  if (!exp) return;
  const me = state.player.ludus;
  const commander = me.creatures.find((c) => c.id === exp.commanderId);
  if (!commander) {
    state.player.expedition = undefined;
    delete state.player.storyData.expeditionTactics;
    state.world.horde.ferals += exp.keepers;
    message(state, 'assistant', 'The expedition dissolves', 'With no commander, the militia went home and your keepers went over to the Horde.');
    return;
  }
  if (exp.weeksLeft > 0) exp.weeksLeft -= 1;
  commander.away = { kind: 'expedition', weeksLeft: Math.max(1, exp.weeksLeft), note: 'Hunting the Wild Horde' };
  if (exp.weeksLeft === 0 && !exp.tactics.length) {
    exp.tactics = shuffle([...TACTIC_KEYS]).slice(0, 3);
    state.player.storyData.expeditionTactics = [...exp.tactics];
    message(state, 'assistant', 'The Horde is found',
      `${commander.name}'s scouts have found the Horde's camp. Choose how to attack: ${exp.tactics.map((t) => TACTICS[t].name).join(', ')}.`);
  }
}

/** Expedition tactic roll → battle-score shift of ±0.1–0.3. */
function tacticShift(state: GameState, key: string, commander: Creature, leader: Creature | undefined, militia: number, army: number): { shift: number; roll: number } {
  const ratio = militia / Math.max(1, army);
  const cCun = getStat(commander, 'cun');
  const cStr = getStat(commander, 'str');
  const lCun = leader ? getStat(leader, 'cun') : 4;
  const lStr = leader ? getStat(leader, 'str') : 4;
  const spartacus = leader?.legend === 'spartacus';
  let roll = rand(100);
  roll += 10 * (hasTrait(commander, 'Tactician') ? 1 : 0) + 5 * (hasTrait(commander, 'Inspiring') ? 1 : 0)
    + 10 * (hasTrait(commander, 'RebelSlayer') ? 1 : 0) + 5 * (hasTrait(commander, 'Hero') ? 1 : 0);
  switch (key) {
    case 'encircle': roll += Math.round(20 * Math.min(2, ratio)) - 20; break;
    case 'nightAttack': roll += 2 * (cCun - lCun) + (hasTrait(commander, 'Sneaky') ? 10 : 0); break;
    case 'sendScouts': roll += 10 + 3 * committedSpies(state, state.player.ludus); break;
    case 'splitForces': roll += Math.round(15 * (ratio - 1)) + 10 - (spartacus ? 30 : 0); break;
    case 'stormDefenses': roll += 2 * (cStr - lStr) + Math.round(10 * ratio) - 10; break;
    case 'useFog': roll += (cCun - lCun) + rand(21) - 10 - (asc(state, ASC.neptune) ? 10 : 0); break;
    case 'starveThemOut': roll += (state.world.horde.spoils < 1000 ? 20 : -10) + Math.round(10 * Math.min(2, ratio)) - 10; break;
    default: break;
  }
  const shift = roll >= 75 ? 0.3 : roll >= 55 ? 0.2 : roll >= 40 ? 0.1 : roll >= 25 ? -0.1 : roll >= 10 ? -0.2 : -0.3;
  return { shift, roll };
}

function lootRebelWeapon(state: GameState): Gear | undefined {
  const H = state.world.horde;
  if (!H.armory.length) return undefined;
  const g = H.armory.find((x) => x.unique === 'libertas') ?? [...H.armory].sort((a, b) => gearWorth(b) - gearWorth(a))[0];
  H.armory = H.armory.filter((x) => x !== g);
  for (const c of H.rogues) for (const s of Object.keys(c.gear) as (keyof Creature['gear'])[]) if (c.gear[s] === g.id) c.gear[s] = undefined;
  state.player.ludus.armory.push(g);
  return g;
}

function recapture(state: GameState, c: Creature): void {
  removeRogue(state, c);
  removeTrait(c, 'RebelLeader');
  removeTrait(c, 'RebelGeneral');
  addTrait(c, 'Recaptured');
  c.loyalty = Math.max(c.loyalty, 50);
  c.rebellionGrace = true;
  c.gear = {};
  c.spyFor = undefined;
  state.player.ludus.creatures.push(c);
}

export function resolveExpedition(state: GameState, tactic: string): { text: string; battle?: BattleResult; victory: boolean } {
  const exp = state.player.expedition;
  if (!exp) return { text: 'No expedition is in the field.', victory: false };
  if (exp.weeksLeft > 0) return { text: 'The militia has not found the Horde yet.', victory: false };
  const me = state.player.ludus;
  const H = state.world.horde;
  const commander = me.creatures.find((c) => c.id === exp.commanderId);
  const finish = () => {
    state.player.expedition = undefined;
    delete state.player.storyData.expeditionTactics;
  };
  if (!commander) {
    finish();
    H.ferals += exp.keepers;
    return { text: 'With no commander, the militia scattered at the first howl.', victory: false };
  }
  const key = exp.tactics.includes(tactic) || !exp.tactics.length ? tactic : exp.tactics[0];
  exp.chosenTactic = key;
  const army = Math.max(1, hordeSize(state));
  const leader = rebelLeader(state);
  const t = tacticShift(state, key, commander, leader, exp.militia, army);
  const lines: string[] = [];
  const tacticName = TACTICS[key]?.name ?? key;
  lines.push(`${tacticName}: ${t.shift > 0 ? 'the plan worked' : 'the plan went badly'}.`);

  // the commander-led battle against the rebel leader (+ champion when the rebels outnumber you)
  let battle: BattleResult | undefined;
  let duelWon = true;
  let leaderKO = false;
  let spartacusKilled = false;
  commander.away = undefined;
  if (leader || H.ferals > 0) {
    const extra = army > exp.militia ? 1 : 0;
    const rebels = rebelSide(state, extra, Math.trunc((army - exp.militia) / 2), leader);
    const rebelMods: BattleSide['modifiers'] = [];
    if (t.shift > 0 && key === 'encircle') rebelMods.push('Surrounded');
    if (t.shift > 0 && (key === 'nightAttack' || key === 'useFog')) rebelMods.push('Surprised');
    if (t.shift < 0 && key === 'stormDefenses') rebelMods.push('Walled');
    rebels.side.modifiers.push(...rebelMods);
    const sideA = buildSide(state, me, [commander], { [commander.id]: commander.instruction }, { riders: true, name: me.name, player: true });
    battle = resolveBattle([sideA, rebels.side], { week: state.world.week, riders: true, event: true, label: 'Expedition against the Wild Horde' });
    applyBattleResult({ state, event: true, deathCause: 'Fell leading an expedition against the Wild Horde' }, [sideA, rebels.side], battle);
    duelWon = battle.winner === 0;
    const lo = leader ? battle.outcomes.find((o) => o.creatureId === leader.id) : undefined;
    leaderKO = !!lo && (lo.knockedOut || lo.yielded || lo.died);
    const dead = settleRogueDeaths(state, battle, rebels.rogues);
    spartacusKilled = dead.some((c) => c.legend === 'spartacus');
    lines.push(duelWon ? `${commander.name} won the clash with ${leader?.name ?? 'the rebel champion'}.` : `${commander.name} was beaten by ${leader?.name ?? 'the rebel champion'}.`);
  }

  const base = exp.militia / (exp.militia + army);
  const score = clamp(base + (duelWon ? 0.2 : -0.2) + t.shift, 0, 1);
  const victory = score > 0.4;
  const stillHere = me.creatures.includes(commander);

  if (victory) {
    const isArmy = exp.militia > 75;
    addInfluence(state, me, isArmy ? 50 : 30);
    const feralsKilled = Math.trunc(H.ferals * Math.min(1, score));
    H.ferals -= feralsKilled;
    const nRogues = Math.trunc(H.rogues.filter((c) => c !== leader).length * Math.max(0, score - 0.4));
    const victims = [...H.rogues].filter((c) => c !== leader).sort((a, b) => a.level - b.level).slice(0, nRogues);
    let captured: Creature | undefined;
    if (exp.capture) {
      if (leader && leaderKO && !spartacusKilled && H.rogues.includes(leader) && score > 0.6) captured = leader;
      else captured = [...victims].sort((a, b) => b.level - a.level)[0];
    }
    for (const c of victims) if (c !== captured) killRogue(state, c, 'Killed while fighting as a rebel against the Roman army');
    if (captured) {
      recapture(state, captured);
      lines.push(`${captured.name} was taken alive and dragged back to your pens in chains.`);
    }
    const reclaimed = Math.trunc(H.spoils * Math.min(1, score));
    H.spoils -= reclaimed;
    me.denarii += Math.trunc(reclaimed / 2);
    if (exp.keepers) addKeepers(me, exp.keepers);
    for (const r of activeRivals(state)) changeOpinion(state, r, isArmy ? 5 : 1);
    lines.unshift(`Victory! The ${isArmy ? 'army' : 'militia'} broke the Wild Horde's camp (+${isArmy ? 50 : 30} influence). ` +
      `${feralsKilled} ferals and ${victims.length - (captured && victims.includes(captured) ? 1 : 0)} rogue dinos were killed, and ${Math.trunc(reclaimed / 2)} denarii of the spoils came back to you.`);
    if (hordeSize(state) < 20 || H.rogues.length <= 2) {
      const g = lootRebelWeapon(state);
      if (g) lines.push(`Among the spoils: ${gearName(g)}.`);
    }
    if (spartacusKilled) {
      achieve(state, 'dejavu');
      lines.push('Spartacus is dead. History repeats itself.');
    } else if (leader?.legend === 'spartacus' && H.rogues.includes(leader)) {
      lines.push('The enemy general Spartacus has managed to escape.');
    }
    if (stillHere) {
      addTrait(commander, 'RebelSlayer');
      commander.fame += 10;
    }
    achieve(state, 'imperator');
    objectiveEvent(state, 'expedition');
  } else {
    addInfluence(state, me, -25);
    H.ferals += exp.keepers;
    H.spoils += Math.trunc(exp.funds / 2);
    lines.unshift('Defeat. The militia broke and ran, and the Horde helped itself to the supply wagons (−25 influence).');
    if (stillHere) {
      commander.fame = Math.max(1, commander.fame - 50);
      if (exp.militia < army && coin()) {
        addInfluence(state, me, -10);
        joinHorde(state, commander, me);
        lines.push(`${commander.name} was captured and now runs with the Horde.`);
      } else {
        if (!commander.injury) {
          const inj = injureCreature(commander, 3, false);
          if (!inj || inj === 'dead') commander.injury = { type: 'flesh', weeks: 2 };
        }
        lines.push(`${commander.name} fled back to Capua, wounded and humiliated.`);
      }
    }
  }
  if (!stillHere) lines.push(`${commander.name} did not come back.`);
  if (me.creatures.includes(commander)) commander.rebellionGrace = true;
  finish();
  return { text: lines.join(' '), battle, victory };
}

