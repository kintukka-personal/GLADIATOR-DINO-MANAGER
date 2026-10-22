// Intrigue: player actions vs rivals and rival schemes vs the player. OWNER: systems-politics agent. GM 05 §1.
//
// GM bugs fixed here:
// - Assassination resolves against the real target house, with the defender's real security, spies and
//   Informants (GM used the attacker's own house, so your security never mattered against assassins).
// - Target tameness < 10 gives the intended +15 to assassination (GM overwrote it with +10).
// - "Hire night guards" really costs 50 denarii; the senator-favour and town-watch prompts change influence
//   once (±10, as shown); the goat sacrifice always costs exactly 50.
// - The steal wealth tier "> 500: +7" is reachable.

import type {
  BattleResult, BattleSide, Creature, GameState, Gear, GearSlot, ID, IntrigueAction, IntrigueOrder, Ludus, PendingDefense,
} from './types';
import { rand, coin, clamp, pick } from './rng';
import { activeRivals, asc, ASC, achieve, houseById, message, newId, ownerOf, report } from './util';
import { addTrait, canFight, getStat, grantXp, hasTrait, generateBeast, maxHp } from './creature';
import { gearHas, gearName, GEAR } from './data/gear';
import { securityTotal, securityDR, committedSpies, addInfluence, loseKeepers } from './economy';
import { loseRandomBuilding, constructionLevel, BUILDINGS } from './buildings';
import { changeOpinion } from './rivals';
import { bury } from './care';
import { storyHook } from './stories';
import { objectiveEvent } from './objectives';
import { buildSide, resolveBattle, applyBattleResult } from './combat';
import { hasOpp, princepsActive } from './influence';
import {
  SCENARIO_DEFS, DEFENSE_PROMPT_DEFS, GOAT_COST, scenarioModifier, injureCreature, detachCreature,
  changeLoyalty, mostFamous, keeperTotal, INJURY_NAMES,
} from './data/politicsData';

export const SCENARIOS: { key: string; text: string }[] = SCENARIO_DEFS.map((s) => ({ key: s.key, text: s.text }));
export const DEFENSE_PROMPTS: { key: string; text: string; assertive: string; passive: string }[] = DEFENSE_PROMPT_DEFS;

export const ACTION_NAMES: Record<IntrigueAction, string> = {
  assassinate: 'Assassinate', poison: 'Poison', persuade: 'Persuade', steal: 'Steal', sabotage: 'Sabotage', raid: 'Raid',
};

/** Actions aimed at a creature (the rest target the house). */
export const CREATURE_ACTIONS: IntrigueAction[] = ['assassinate', 'poison', 'persuade'];
const isCreatureAction = (a: IntrigueAction) => CREATURE_ACTIONS.includes(a);

// ---------------------------------------------------------------------------
// Shared modifiers (05 §1.2)
// ---------------------------------------------------------------------------

function gearIn(h: Ludus | undefined, c: Creature, slot: GearSlot): Gear | undefined {
  const id = c.gear[slot];
  if (!h || !id) return undefined;
  return h.armory.find((g) => g.id === id);
}

function spies(state: GameState, h: Ludus): number {
  return committedSpies(state, h);
}

export function spyBonus(state: GameState, att: Ludus, def: Ludus): number {
  return clamp(2 * spies(state, att) - spies(state, def), -15, 15);
}

/** GM StandardPenalties (subtracted from the chance). */
export function standardPenalties(state: GameState, att: Ludus, def: Ludus, action: IntrigueAction, target?: Creature): number {
  let p = 0;
  if (att.isPlayer && hasOpp(state, 'informants')) p -= 5;
  else if (def.isPlayer && hasOpp(state, 'informants')) p += 5;
  if (target) {
    if (target.reincarnation >= 11) p += 5;
    if (hasTrait(target, 'Paranoid')) p += 5;
  }
  p -= 5 * def.creatures.filter((c) => c.spyFor === att.id).length;
  p += 5 * att.creatures.filter((c) => c.spyFor === def.id).length;
  if (att.isPlayer) {
    if (asc(state, ASC.minerva)) p += 10;
    if (asc(state, ASC.mars) && action !== 'persuade') p += 5;
  }
  return p;
}

/** GM GlobalBonuses: +5 for Stealthy barding (Camouflage Hide), +5 for a Stealthy helmet (Hunter's Hood). */
export function globalBonus(att: Ludus | undefined, agent: Creature): number {
  let b = 0;
  if (gearHas(gearIn(att, agent, 'armor'), 'Stealthy')) b += 5;
  if (gearHas(gearIn(att, agent, 'helmet'), 'Stealthy')) b += 5;
  return b;
}

/** −1 for each of 50/60/70/80/90 the chance passes. */
function diminish(chance: number): number {
  let c = chance;
  for (const t of [50, 60, 70, 80, 90]) if (chance > t) c -= 1;
  return c;
}

/** Java-style halving of a non-positive x. */
const halveIfNegative = (x: number) => (x <= 0 ? Math.trunc(x / 2) : x);

const S = (state: GameState, h: Ludus) => securityTotal(state, h);
const SDR = (state: GameState, h: Ludus) => securityDR(securityTotal(state, h));
const T = (c: Creature, t: Parameters<typeof hasTrait>[1]) => (hasTrait(c, t) ? 1 : 0);

// ---------------------------------------------------------------------------
// Chances (05 §1.4–1.9)
// ---------------------------------------------------------------------------

export function assassinationChance(state: GameState, att: Ludus, def: Ludus, agent: Creature, target: Creature): number {
  const dS = getStat(agent, 'str') - getStat(target, 'str');
  const dC = getStat(agent, 'cun') - getStat(target, 'cun');
  const dI = getStat(agent, 'agi') - getStat(target, 'agi');
  let best = Math.max(dS, dC, dI) + Math.trunc((dS + dC + dI) / 3);
  if (target.injury) best += 10;
  if (target.loyalty < 10) best += 15;
  else if (target.loyalty < 25) best += 10;
  else if (target.loyalty < 50) best += 5;
  const x = best + 15 * T(agent, 'Assassin') + 5 * T(agent, 'Sneaky') + 3 * T(agent, 'Hunter') - SDR(state, def) - 7 * T(target, 'Alert');
  if (x <= 0) return 15;
  return clamp(15 + 4 * x + Math.trunc(spyBonus(state, att, def) / 2) - standardPenalties(state, att, def, 'assassinate', target) + globalBonus(att, agent), 15, 99);
}

function poisonResistant(def: Ludus, target: Creature): boolean {
  return gearHas(gearIn(def, target, 'item'), 'PoisonResistance');
}

export function poisonChance(state: GameState, att: Ludus, def: Ludus, agent: Creature, target: Creature): number {
  const inner = 3 * getStat(agent, 'cun') - (Math.trunc(maxHp(target) / 10) + Math.trunc(getStat(target, 'cun') / 2)) - SDR(state, def);
  const x = T(agent, 'Sneaky') + 6 * T(agent, 'PoisonMaster') + T(agent, 'Psychopath') - 7 * T(target, 'Alert') + inner - 5;
  let c = (x > 0 ? 3 * x : 0) + 30 - 25 * T(target, 'Mithridatism') + spyBonus(state, att, def)
    - standardPenalties(state, att, def, 'poison', target) - Math.trunc(getStat(target, 'cun') / 4)
    - 3 * (def.buildings.palisade ?? 0) - (poisonResistant(def, target) ? 10 : 0) + globalBonus(att, agent);
  c = diminish(c);
  return clamp(c, 0, 99);
}

export function persuasionChance(state: GameState, att: Ludus, def: Ludus, agent: Creature, target: Creature): number {
  const x = 2 * T(agent, 'Underhanded') + Math.floor(3 * getStat(agent, 'cun') - 2 * getStat(target, 'cun') - 0.75 * (SDR(state, def) + def.keepers.showmen));
  let c = (x > 0 ? 2 * x : 0) + 25 + spyBonus(state, att, def) - standardPenalties(state, att, def, 'persuade', target);
  c += 5 * T(target, 'Untrustworthy') + 5 * T(target, 'Underhanded') - 5 * T(target, 'Fanatic') - 5 * T(target, 'Careful');
  c += 5 * T(agent, 'Tactician') + 5 * T(agent, 'Inspiring');
  c += globalBonus(att, agent);
  return clamp(c, 0, 99);
}

function stealWealth(d: number): number {
  let w = 0;
  if (d < 100) w = -20;
  else if (d > 5000) w = 25;
  else if (d > 1500) w = 18;
  else if (d > 500) w = 7;
  else if (d > 300) w = 3;
  if (d > 7000) w += 5;
  if (d > 10000) w += 5;
  if (d > 50000) w += 10;
  if (d > 100000) w += 10;
  return w;
}

export function stealChance(state: GameState, att: Ludus, def: Ludus, agent: Creature): number {
  const s = S(state, def);
  const band = s < 1 ? 0 : s < 10 ? 3 : s < 20 ? 5 : 8;
  let x = Math.trunc((getStat(agent, 'agi') + Math.trunc(getStat(agent, 'cun') / 2)) / 2) + stealWealth(def.denarii)
    - (Math.trunc(SDR(state, def) / 2) + band);
  x += 5 * T(agent, 'LightningSpeed') - 5 * (hasTrait(agent, 'Giant') || hasTrait(agent, 'Titan') ? 1 : 0)
    + 5 * T(agent, 'Untrustworthy') + 5 * T(agent, 'Sneaky') + 15 * T(agent, 'Thief') + 2 * T(agent, 'Ambidextrous')
    - 5 * (hasTrait(agent, 'Loyal') || hasTrait(agent, 'Lawbringer') ? 1 : 0)
    - 5 * (hasTrait(agent, 'MissingFingers') || hasTrait(agent, 'Blind') || hasTrait(agent, 'PartiallyBlind') ? 1 : 0);
  x = halveIfNegative(x);
  let c = x + 30 + spyBonus(state, att, def) - standardPenalties(state, att, def, 'steal') + globalBonus(att, agent);
  c = diminish(c);
  return clamp(c, 1, 90);
}

export function sabotageChance(state: GameState, att: Ludus, def: Ludus, agent: Creature): number {
  const s = S(state, def);
  const band = s < 1 ? 0 : s < 10 ? 5 : s < 20 ? 10 : s < 100 ? 15 : 20;
  let x = Math.trunc((getStat(agent, 'cun') + Math.trunc((getStat(agent, 'str') + getStat(agent, 'agi')) / 2)) / 2)
    + 3 * constructionLevel(def) - (Math.trunc(SDR(state, def) / 2) + band + 10);
  x += 5 * T(agent, 'Psychopath') + 2 * T(agent, 'Ruthless') - 5 * T(agent, 'Hero') + 5 * T(agent, 'Untrustworthy')
    + 5 * T(agent, 'Sneaky') + 10 * T(agent, 'Pyromaniac') + 2 * T(agent, 'Tactician') - 2 * T(agent, 'Careful');
  x = halveIfNegative(x);
  const c = x + 30 + spyBonus(state, att, def) - standardPenalties(state, att, def, 'sabotage') + globalBonus(att, agent);
  return clamp(c, 1, 90);
}

/** GM RaidAction.computeChance: displayed only, the raid itself is a battle. */
export function raidChance(state: GameState, att: Ludus, def: Ludus, agent: Creature): number {
  const s = S(state, def);
  const band = s < 1 ? 0 : s < 10 ? 5 : s < 20 ? 10 : s < 100 ? 15 : 20;
  let x = getStat(agent, 'cun') + agent.level - (20 * (def.buildings.palisade ?? 0) + SDR(state, def)) + Math.trunc(band / 2);
  x += 5 * T(agent, 'Sneaky') + 2 * T(agent, 'Ruthless') + 5 * T(agent, 'Psychopath');
  const c = x + 30 + spyBonus(state, att, def) - standardPenalties(state, att, def, 'raid') + globalBonus(att, agent);
  return clamp(c, 1, 90);
}

function chanceFor(state: GameState, action: IntrigueAction, att: Ludus, def: Ludus, agent: Creature, target?: Creature): number {
  switch (action) {
    case 'assassinate': return target ? assassinationChance(state, att, def, agent, target) : 0;
    case 'poison': return target ? poisonChance(state, att, def, agent, target) : 0;
    case 'persuade': return target ? persuasionChance(state, att, def, agent, target) : 0;
    case 'steal': return stealChance(state, att, def, agent);
    case 'sabotage': return sabotageChance(state, att, def, agent);
    case 'raid': return raidChance(state, att, def, agent);
  }
}

/** Success chance shown for an agent (attacker = the agent's own house). */
export function intrigueChance(state: GameState, action: IntrigueAction, agent: Creature, target: Ludus, targetCreature?: Creature): number {
  const att = ownerOf(state, agent) ?? state.player.ludus;
  return chanceFor(state, action, att, target, agent, targetCreature);
}

/** Min–max chance over all eligible agents (GM shows this range on the action button). */
export function chanceRange(state: GameState, action: IntrigueAction, target: Ludus, targetCreature?: Creature): { min: number; max: number } | null {
  const agents = availableAgents(state);
  if (!agents.length) return null;
  const cs = agents.map((a) => intrigueChance(state, action, a, target, targetCreature));
  return { min: Math.min(...cs), max: Math.max(...cs) };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function agentReady(c: Creature): boolean {
  return c.kind === 'dino' && !c.inactive && !c.away && canFight(c);
}

/** Agents available this week (active, fit, not away). */
export function availableAgents(state: GameState): Creature[] {
  return state.player.ludus.creatures.filter(agentReady);
}

/** Agents a rival could send (AI). */
function rivalAgents(r: Ludus): Creature[] {
  return r.creatures.filter(agentReady);
}

// ---------------------------------------------------------------------------
// Detection (05 §1.3)
// ---------------------------------------------------------------------------

function detectionD(state: GameState, att: Ludus, def: Ludus): number {
  let D = 2 * spies(state, def) - spies(state, att);
  const raw = D;
  for (const t of [30, 40, 50, 60]) if (raw > t) D -= 1;
  if (def.isPlayer) {
    if (princepsActive(state)) D += 10;
    if (state.player.consul) D += 5;
    if (hasOpp(state, 'informants')) D += 15;
  }
  return D;
}

function checkDiscovered(state: GameState, att: Ludus, def: Ludus, base: number, scenario: number): boolean {
  const b = scenario === 3 ? base - 50 : base;
  return rand(100) + b + detectionD(state, att, def) > 99;
}

// ---------------------------------------------------------------------------
// Resolution core (shared by player actions and rival schemes)
// ---------------------------------------------------------------------------

interface Ctx {
  state: GameState;
  action: IntrigueAction;
  agent: Creature;
  att: Ludus;
  def: Ludus;
  target?: Creature;
  /** attacker scenario index, −1 for none (AI attackers) */
  scenario: number;
  /** scenario + defender-prompt modifiers added to the roll */
  mod: number;
  /** report written for the defending player (agent unnamed, conversions hidden) */
  defenderView: boolean;
}

interface Outcome {
  /** what the player sees as success */
  success: boolean;
  /** GM resolve() result (drives the −4/−2 opinion cost) */
  resolved: boolean;
  discovered: boolean;
  killed: boolean;
  agentDied: boolean;
  lines: string[];
  roll: number;
  bystanders?: boolean;
}

/** Agent label in report lines. */
function A(ctx: Ctx): string {
  return ctx.defenderView ? 'The intruder' : ctx.agent.name;
}
/** Estate label in report lines. */
function E(ctx: Ctx): string {
  return ctx.def.isPlayer ? 'your ludus' : `the ${ctx.def.name} estate`;
}

function killCreature(state: GameState, h: Ludus | undefined, c: Creature, cause: string): void {
  bury(state, c, cause);
  detachCreature(h, c);
  if (c.legend === 'spartacus') {
    state.world.horde.spartacusDead = true;
    state.world.horde.spartacusFree = false;
  }
}

/** Failure injury for the agent: InjuryProne + (100 − r)/div, r adjusted by party/sprain/Careful. */
function agentFailureInjury(ctx: Ctx, roll: number, div: number, out: Outcome): void {
  const { agent } = ctx;
  let r = roll;
  if (ctx.scenario === 3) r += 20;
  if (ctx.scenario === 4) r -= 20;
  if (hasTrait(agent, 'Careful')) r += 10;
  const res = injureCreature(agent, Math.trunc((100 - r) / div));
  if (res === 'dead') {
    out.agentDied = true;
    out.lines.push(ctx.defenderView
      ? 'Your wardens caught the intruder and made sure it will not try again.'
      : `${agent.name} was caught and did not leave ${E(ctx)} alive.`);
    killCreature(ctx.state, ctx.att, agent, `Killed on a night errand against House ${ctx.def.name}`);
  } else if (res) {
    out.lines.push(`${A(ctx)} got away with ${INJURY_NAMES[res.type]}${ctx.defenderView ? '' : ` (${res.weeks} weeks)`}.`);
  } else {
    out.lines.push(`${A(ctx)} got away unhurt.`);
  }
}

function newOutcome(): Outcome {
  return { success: false, resolved: false, discovered: false, killed: false, agentDied: false, lines: [], roll: 0 };
}

function doAssassinate(ctx: Ctx): Outcome {
  const { state, att, def, agent } = ctx;
  const target = ctx.target!;
  const out = newOutcome();
  const chance = assassinationChance(state, att, def, agent, target);
  const roll = chance + ctx.mod + (chance > 80 ? 1 : 0) + (chance > 90 ? 1 : 0) + rand(101);
  out.roll = roll;
  let base = 35;
  const cause = def.isPlayer ? 'Assassinated in the night' : `Assassinated by an agent of House ${att.name}`;
  if (roll > 100) {
    out.resolved = true;
    grantXp(agent, 20);
    if (target.injury?.type === 'multiple') {
      out.killed = true;
      out.success = true;
      out.lines.push(`${A(ctx)} found ${target.name} too weak to fight back. ${target.name} is dead.`);
      killCreature(state, def, target, cause);
    } else {
      const extra = (roll - 100) + (target.injury ? 5 : 0) + (hasTrait(agent, 'Ruthless') ? 3 : 0);
      const res = injureCreature(target, extra);
      if (res === 'dead') {
        out.killed = true;
        out.success = true;
        out.lines.push(`${A(ctx)} struck in the dark. ${target.name} will not see the morning.`);
        killCreature(state, def, target, cause);
      } else if (res) {
        out.success = true;
        out.lines.push(`${A(ctx)} ambushed ${target.name}, leaving it with ${INJURY_NAMES[res.type]} (${res.weeks} weeks).`);
      } else {
        out.lines.push(`${A(ctx)} reached ${target.name}, but its hide turned the blow. It is unhurt.`);
      }
    }
    if (out.success && rand(5) === 0) addTrait(agent, 'Assassin');
    base = out.success ? 25 : 30;
  } else {
    grantXp(agent, 10);
    out.lines.push(`${A(ctx)} never got close to ${target.name}.`);
    agentFailureInjury(ctx, roll, 8, out);
  }
  out.discovered = !out.agentDied && checkDiscovered(state, att, def, base, ctx.scenario);
  return out;
}

function consumeAntidote(def: Ludus, target: Creature): boolean {
  const g = gearIn(def, target, 'item');
  if (!g || !gearHas(g, 'Antidote')) return false;
  if (g.charges !== undefined && g.charges > 1) g.charges -= 1;
  else {
    def.armory = def.armory.filter((x) => x.id !== g.id);
    target.gear.item = undefined;
    // auto-assign a spare antidote
    const used = new Set(def.creatures.map((c) => c.gear.item).filter(Boolean));
    const spare = def.armory.find((x) => gearHas(x, 'Antidote') && !used.has(x.id));
    if (spare) target.gear.item = spare.id;
  }
  return true;
}

function doPoison(ctx: Ctx): Outcome {
  const { state, att, def, agent } = ctx;
  const target = ctx.target!;
  const out = newOutcome();
  const chance = poisonChance(state, att, def, agent, target);
  let roll = chance + ctx.mod + rand(101);
  if (chance > 70 && coin()) roll += rand(5);
  if (chance < 35 && coin()) roll -= rand(5);
  out.roll = roll;
  if (roll >= 100) {
    out.resolved = true;
    out.success = true;
    grantXp(agent, 20);
    if (consumeAntidote(def, target)) {
      out.lines.push(`${A(ctx)} laced ${target.name}'s meat, but the antivenom it carried did its job.`);
    } else if (roll + (hasTrait(agent, 'Ruthless') ? 5 : 0) > 160) {
      out.killed = true;
      out.lines.push(`${A(ctx)} laced ${target.name}'s meat with enough venom to drop a sauropod. ${target.name} is dead.`);
      killCreature(state, def, target, 'Poisoned');
    } else {
      target.ill = Math.max(target.ill, 2);
      out.lines.push(`${A(ctx)} poisoned ${target.name}'s feed. It will be sick for two weeks.`);
      if (rand(5) === 0 && addTrait(target, 'Mithridatism')) out.lines.push(`${target.name} has grown immune to venom.`);
    }
    if (rand(5) === 0) addTrait(agent, 'PoisonMaster');
  } else {
    grantXp(agent, 10);
    out.lines.push(`${A(ctx)} could not get the venom anywhere near ${target.name}.`);
    if (rand(10) === 0) addTrait(target, 'Mithridatism');
    agentFailureInjury(ctx, roll, 10, out);
  }
  out.discovered = !out.agentDied && checkDiscovered(state, att, def, out.success ? 15 : 25, ctx.scenario);
  return out;
}

function doPersuade(ctx: Ctx): Outcome {
  const { state, att, def, agent } = ctx;
  const target = ctx.target!;
  const out = newOutcome();
  const chance = persuasionChance(state, att, def, agent, target);
  const roll = chance + ctx.mod + rand(101);
  out.roll = roll;
  if (roll >= 100) {
    out.resolved = true;
    out.success = true;
    grantXp(agent, 15);
    const drop = roll > 150 ? 35 : 20;
    changeLoyalty(target, -drop);
    const score = (roll > 150 ? 1 : 0) + (target.loyalty < 30 ? 1 : 0) - 2 * T(target, 'Loyal') + T(target, 'Untrustworthy')
      + T(target, 'Sneaky') + rand(10);
    const turned = score > 7;
    if (turned) target.spyFor = att.id;
    if (ctx.defenderView) {
      // a turned dino is only uncovered through the spy-suspicion events
      out.lines.push(`Somebody got to ${target.name} with honeyed words and better meat. Its tameness dropped by ${drop}.`);
    } else if (turned) {
      out.lines.push(`${agent.name} filled ${target.name}'s head with stories of better meat elsewhere. ${target.name} now spies for you, and will throw any fight against you.`);
    } else {
      out.lines.push(`${agent.name} turned ${target.name} against its keepers (−${drop} tameness), but it would not spy for you.`);
    }
  } else {
    grantXp(agent, 5);
    out.lines.push(`${target.name} was not listening. It may have tried to eat ${ctx.defenderView ? 'the intruder' : agent.name}.`);
  }
  out.discovered = checkDiscovered(state, att, def, out.success ? 5 : 15, ctx.scenario);
  return out;
}

function shiftKeepers(def: Ludus, from: 'miners' | 'showmen', to: 'wardens' | 'spies', n: number): void {
  const k = Math.min(n, def.keepers[from]);
  def.keepers[from] -= k;
  def.keepers[to] += k;
}

function unassignGear(h: Ludus, g: Gear): void {
  for (const c of h.creatures) for (const slot of Object.keys(c.gear) as GearSlot[]) if (c.gear[slot] === g.id) c.gear[slot] = undefined;
}

function stealGear(att: Ludus, def: Ludus, weapon: boolean): Gear | null {
  const pool = def.armory.filter((g) => (GEAR[g.type]?.slot === 'weapon') === weapon && !gearHas(g, 'CannotUnequip'));
  if (!pool.length) return null;
  const g = pick(pool);
  def.armory = def.armory.filter((x) => x.id !== g.id);
  unassignGear(def, g);
  att.armory.push(g);
  return g;
}

function takeDenarii(att: Ludus, def: Ludus, n: number): number {
  def.denarii -= n;
  att.denarii += n;
  return n;
}

function doSteal(ctx: Ctx): Outcome {
  const { state, att, def, agent } = ctx;
  const out = newOutcome();
  const chance = stealChance(state, att, def, agent);
  let r = rand(101);
  if (r > 95) r += 30;
  const roll = r + chance + ctx.mod;
  out.roll = roll;
  if (roll >= 100) {
    out.resolved = true;
    out.success = true;
    grantXp(agent, 20);
    if (!def.isPlayer) {
      shiftKeepers(def, 'miners', 'wardens', 2);
      if (rand(3) === 0) shiftKeepers(def, 'showmen', 'spies', 1);
    }
    if (roll > 150) {
      let g: Gear | null = null;
      if (!def.isPlayer) g = coin() ? stealGear(att, def, false) : stealGear(att, def, true);
      if (g) out.lines.push(`${A(ctx)} came back carrying ${gearName(g)} in its jaws.`);
      else {
        const d = def.denarii;
        let amount = 200 + (d >= 2000 && d < 20000 ? Math.trunc(d / 60) : 0) + (d >= 20000 ? Math.trunc(d / 200) : 0);
        if (amount > 2000) amount = Math.trunc(amount / 2);
        takeDenarii(att, def, amount);
        out.lines.push(`${A(ctx)} found the strongbox. ${amount} denarii changed owners.`);
      }
      if (coin()) addTrait(agent, 'Thief');
    } else {
      const amount = 100 + (def.denarii > 2000 ? Math.trunc(def.denarii / 40) : 0);
      takeDenarii(att, def, amount);
      out.lines.push(`${A(ctx)} slipped out with a purse of ${amount} denarii.`);
    }
  } else {
    grantXp(agent, 10);
    out.lines.push(`${A(ctx)} found nothing worth taking but a lot of angry wardens.`);
    agentFailureInjury(ctx, roll, 14, out);
  }
  out.discovered = !out.agentDied && checkDiscovered(state, att, def, out.success ? 5 : 25, ctx.scenario);
  return out;
}

function buildingName(id: string | null): string {
  if (!id) return 'nothing';
  return (BUILDINGS as Record<string, { name?: string } | undefined>)[id]?.name ?? id;
}

function doSabotage(ctx: Ctx): Outcome {
  const { state, att, def, agent } = ctx;
  const out = newOutcome();
  const chance = sabotageChance(state, att, def, agent);
  let r = rand(101);
  const natural100 = r === 100;
  if (natural100) r = 150;
  const roll = r + chance + ctx.mod;
  out.roll = roll;
  if (natural100 && ctx.scenario === 8) {
    out.bystanders = true;
    addTrait(agent, 'Ruthless');
    loseKeepers(state, def, 1);
    out.lines.push(`${A(ctx)} set the stables alight anyway. Not every keeper inside got out.`);
  }
  if (roll >= 100) {
    out.resolved = true;
    out.success = true;
    grantXp(agent, 20);
    if (!def.isPlayer) {
      if (roll % 4 === 0) shiftKeepers(def, 'miners', 'wardens', 1);
      if (roll % 3 === 0) shiftKeepers(def, 'showmen', 'spies', 1);
    }
    if (roll > 150) {
      const a = loseRandomBuilding(def);
      const b = loseRandomBuilding(def);
      def.denarii -= 50;
      loseKeepers(state, def, 2);
      if (coin()) addTrait(agent, 'Pyromaniac');
      out.lines.push(`${A(ctx)} knocked a brazier into the hay and half of ${E(ctx)} burned: the ${buildingName(a)} and the ${buildingName(b)} lost a level, two keepers died and the clean-up cost 50 denarii.`);
    } else {
      const a = loseRandomBuilding(def);
      def.denarii -= 50;
      out.lines.push(`${A(ctx)} started a fire at ${E(ctx)}. ${a ? `The ${buildingName(a)} lost a level` : 'Nothing important burned'}, and the clean-up cost 50 denarii.`);
    }
  } else {
    grantXp(agent, 10);
    out.lines.push(`${A(ctx)} was chased off before the fire caught.`);
    agentFailureInjury(ctx, roll, 10, out);
  }
  out.discovered = !out.agentDied && checkDiscovered(state, att, def, out.success ? 35 : 55, ctx.scenario);
  return out;
}

function runAction(ctx: Ctx): Outcome {
  switch (ctx.action) {
    case 'assassinate': return doAssassinate(ctx);
    case 'poison': return doPoison(ctx);
    case 'persuade': return doPersuade(ctx);
    case 'steal': return doSteal(ctx);
    case 'sabotage': return doSabotage(ctx);
    case 'raid': return newOutcome(); // raids are battles (playerRaid)
  }
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

/** Start an action: marks agent inactive, rolls the scenario the player must Proceed/Retreat on. */
export function planIntrigue(state: GameState, action: IntrigueAction, agentId: ID, targetHouseId: ID, targetCreatureId?: ID): IntrigueOrder | string {
  const me = state.player.ludus;
  const agent = me.creatures.find((c) => c.id === agentId);
  if (!agent) return 'Choose one of your own dinos as the agent.';
  if (agent.kind !== 'dino') return 'Beasts make poor spies. They keep eating the evidence.';
  if (!agentReady(agent)) return `${agent.name} is not available this week.`;
  const def = state.rivals.find((r) => r.id === targetHouseId);
  if (!def || def.defeated) return 'That house is no more.';
  if (isCreatureAction(action)) {
    const t = def.creatures.find((c) => c.id === targetCreatureId);
    if (!t) return 'Pick a dino of that house to target.';
    if (action === 'persuade' && t.kind !== 'dino') return 'Beasts cannot be talked into anything.';
  }
  if (action === 'raid') {
    if (!hasOpp(state, 'veilOfNight')) return 'Raids need the Veil of Night.';
  }
  agent.inactive = true;
  const scenario = rand(action === 'sabotage' ? 9 : 8);
  const order: IntrigueOrder = {
    id: newId('i'), action, agentId, targetHouseId, targetCreatureId: isCreatureAction(action) ? targetCreatureId : undefined, scenario,
  };
  state.player.intrigue.push(order);
  return order;
}

/** Scenario text for an order (the Proceed/Retreat prompt). */
export function scenarioText(order: IntrigueOrder): string {
  return SCENARIO_DEFS[order.scenario]?.text ?? '';
}

/** Resolve after Proceed/Retreat. Raid returns a battle. */
export function resolveIntrigue(state: GameState, orderId: ID, decision: 'proceed' | 'retreat'): { text: string; success: boolean; battle?: BattleResult } {
  const me = state.player.ludus;
  const order = state.player.intrigue.find((o) => o.id === orderId);
  if (!order) return { text: 'There is no such plan.', success: false };
  if (order.resolved) return { text: order.report ?? 'Already done.', success: false };
  order.decision = decision;
  order.resolved = true;
  const agent = me.creatures.find((c) => c.id === order.agentId);
  const def = houseById(state, order.targetHouseId);
  const finish = (text: string, success: boolean, battle?: BattleResult) => {
    order.report = text;
    return { text, success, battle };
  };
  if (!agent || !def || def.defeated || def.isPlayer) return finish('The plan fell apart before it began.', false);

  if (decision === 'retreat') {
    grantXp(agent, 15);
    let text = `${agent.name} turned back. Wisdom is a kind of courage, the philosophers say. The philosophers never fed a raptor.`;
    if (rand(20) > 17 && addTrait(agent, 'Careful')) text += ` ${agent.name} has become Careful.`;
    return finish(text, false);
  }

  const lines: string[] = [];
  const mod = scenarioModifier(order.scenario);
  if (order.scenario === 2) {
    me.denarii -= GOAT_COST;
    lines.push(`The goat cost ${GOAT_COST} denarii. Mercury had better be paying attention.`);
  }
  if (order.action === 'raid') {
    const r = playerRaid(state, order, agent, def);
    lines.push(r.text);
    if (order.scenario === 7 && r.success) {
      me.denarii += 100;
      lines.push(`${agent.name} also grabbed the open strongbox on the way out: +100 denarii.`);
    }
    return finish(lines.join(' '), r.success, r.battle);
  }
  const target = order.targetCreatureId ? def.creatures.find((c) => c.id === order.targetCreatureId) : undefined;
  if (isCreatureAction(order.action) && !target) return finish('The target was gone by the time your agent arrived.', false);

  const ctx: Ctx = { state, action: order.action, agent, att: me, def, target, scenario: order.scenario, mod, defenderView: false };
  const out = runAction(ctx);
  lines.push(...out.lines);

  // loot spotted on the way in
  if (order.scenario === 7 && out.success) {
    const loot = out.roll > 150 ? 200 : 100;
    me.denarii += loot;
    lines.push(`On the way out ${agent.name} grabbed the open strongbox: +${loot} denarii.`);
  }

  // opinion (summed so the rival reacts once)
  let op = coin() ? -1 : 0;
  op += out.resolved ? -4 : -2;
  if (out.discovered) {
    def.caught.push(agent.id);
    op -= 1;
    if (coin()) op -= 1;
    lines.push(`${agent.name} was recognised. House ${def.name} knows who sent it.`);
  } else if (!out.agentDied) {
    lines.push('Nobody saw a thing.');
  }
  if (order.action === 'sabotage') op -= 1;
  if (out.bystanders) {
    op -= 10;
    if (out.discovered) {
      addInfluence(state, me, -10);
      lines.push('The deaths are being talked about in the forum (−10 influence).');
    }
  }
  changeOpinion(state, def, op);

  // hooks
  if (out.killed && target && (order.action === 'assassinate' || order.action === 'poison')) achieve(state, 'assassin');
  if (out.success && order.action === 'poison' && target) objectiveEvent(state, `poison:${target.legend ?? target.name}`);
  if (out.success && order.action === 'steal') objectiveEvent(state, 'steal');
  if (out.success) objectiveEvent(state, `intrigue:${order.action}`);
  storyHook(state, 'intrigue', {
    action: order.action, targetHouseId: def.id, success: out.success, killed: out.killed, targetCreatureId: target?.id,
    targetLegend: target?.legend, agentId: agent.id,
  });
  return finish(lines.join(' '), out.success);
}

// ---------------------------------------------------------------------------
// Raid (05 §1.9): a real battle
// ---------------------------------------------------------------------------

function presentFighters(h: Ludus): Creature[] {
  return h.creatures.filter((c) => !c.away && canFight(c));
}

function kennelWolf(): Creature {
  const w = generateBeast('direwolf', { variant: 'random', name: 'Kennel Wolf' });
  w.loyalty = 100;
  return w;
}

function playerRaid(state: GameState, order: IntrigueOrder, leader: Creature, def: Ludus): { text: string; success: boolean; battle?: BattleResult } {
  const me = state.player.ludus;
  const lines: string[] = [];
  const second = mostFamous(availableAgents(state).filter((c) => c.id !== leader.id));
  const party = second ? [leader, second] : [leader];
  for (const c of party) c.inactive = true;
  const defenders = presentFighters(def).sort((a, b) => b.level - a.level || b.fame - a.fame).slice(0, 3);
  let battle: BattleResult | undefined;
  let won: boolean;
  let bonus = false;
  if (!defenders.length) {
    won = true;
    bonus = true;
    lines.push(`${party.map((c) => c.name).join(' and ')} went over the palisade and found the pens empty. House ${def.name} had nobody to defend it.`);
  } else {
    const keepers = keeperTotal(def);
    const wolves: Creature[] = [];
    let present = defenders.length;
    if (keepers > 3 && present < 2) { wolves.push(kennelWolf()); present++; }
    if (keepers > 15 && present < 3) { wolves.push(kennelWolf()); present++; }
    if (keepers > 30 && present < 4) { wolves.push(kennelWolf()); present++; }
    const attMods: BattleSide['modifiers'] = ['Surrounded'];
    if (asc(state, ASC.cronus)) attMods.push('CurseOfTime');
    const sideA = buildSide(state, me, party, 'kill', { riders: false, name: me.name, modifiers: attMods, player: true });
    const sideB = buildSide(state, def, [...defenders, ...wolves], 'allout', { riders: false, name: def.name, modifiers: ['Walled'] });
    const wolfIds = new Set(wolves.map((w) => w.id));
    for (const f of sideB.fighters) if (wolfIds.has(f.creature.id)) f.temporary = true;
    if (wolves.length) lines.push(`The ${def.name} keepers loosed ${wolves.length === 1 ? 'a kennel wolf' : `${wolves.length} kennel wolves`}.`);
    battle = resolveBattle([sideA, sideB], { week: state.world.week, riders: false, event: true, label: `Night raid on ${def.name}` });
    applyBattleResult({ state, event: true, deathCause: `Killed raiding ${def.name}` }, [sideA, sideB], battle);
    won = battle.winner === 0;
  }

  let op = coin() ? -1 : 0;
  op -= 10;
  if (won) {
    op -= 4;
    def.denarii -= 150;
    me.denarii += 50;
    addInfluence(state, me, 10);
    addInfluence(state, def, -10);
    for (const c of def.creatures) changeLoyalty(c, -25);
    let lose = 2 + (keeperTotal(def) > 20 ? 1 : 0) + (keeperTotal(def) > 50 ? 1 : 0) + (bonus ? 1 : 0);
    lose = loseKeepers(state, def, Math.min(lose, keeperTotal(def))) ?? lose;
    const stillPresent = presentFighters(def).length;
    if (keeperTotal(def) < 1 || stillPresent < 3) {
      const healthy = def.creatures.some((c) => canFight(c) && !c.injury);
      if ((def.denarii > 500 && constructionLevel(def) > 1) || healthy) {
        const quarter = Math.trunc(Math.max(0, def.denarii) / 4);
        def.denarii -= quarter;
        const b = loseRandomBuilding(def);
        lines.push(`House ${def.name} is reeling: it lost ${quarter} denarii${b ? ` and its ${buildingName(b)} was torched` : ''}.`);
      } else {
        def.defeated = 'raid';
        lines.push(`House ${def.name} is finished. Their entire household has been slaughtered, and the vultures are fighting over the pens.`);
      }
    } else {
      def.denarii -= Math.trunc(Math.max(0, def.denarii) / 20);
    }
    if (bonus) {
      const pool = def.armory.filter((g) => !gearHas(g, 'CannotUnequip'));
      if (pool.length) {
        const g = pick(pool);
        def.armory = def.armory.filter((x) => x.id !== g.id);
        unassignGear(def, g);
        me.armory.push(g);
        lines.push(`Your raiders carried off ${gearName(g)}.`);
      }
    }
    for (const c of party) {
      if (!me.creatures.includes(c)) continue;
      grantXp(c, 20);
      c.fame += 2;
    }
    lines.unshift(`The raid on House ${def.name} succeeded. +50 denarii, +10 influence; their dinos are terrified (−25 tameness) and ${lose} keepers are dead.`);
  } else {
    op -= 2;
    addInfluence(state, me, -15);
    loseKeepers(state, me, Math.min(1, me.keepers.spies), 'spies');
    for (const r of activeRivals(state)) if (r !== def) changeOpinion(state, r, -2);
    for (const c of me.creatures) changeLoyalty(c, -25);
    lines.unshift(`The raid on House ${def.name} failed. Word spreads fast (−15 influence, every rival thinks less of you), a spy was lost, and your own dinos sulk (−25 tameness).`);
  }
  changeOpinion(state, def, op);
  storyHook(state, 'intrigue', { action: 'raid', targetHouseId: def.id, success: won, destroyed: def.defeated === 'raid' });
  objectiveEvent(state, won ? 'intrigue:raid' : 'intrigue:raidFailed');
  return { text: lines.join(' '), success: won, battle };
}

// ---------------------------------------------------------------------------
// Rival schemes against the player (05 §1.10)
// ---------------------------------------------------------------------------

function bestAgent(state: GameState, r: Ludus, action: IntrigueAction, target?: Creature): { agent: Creature; chance: number } | null {
  let best: { agent: Creature; chance: number } | null = null;
  for (const a of rivalAgents(r)) {
    const c = chanceFor(state, action, r, state.player.ludus, a, target);
    if (!best || c > best.chance) best = { agent: a, chance: c };
  }
  return best;
}

function playerTargets(state: GameState, dinosOnly = false): Creature[] {
  return state.player.ludus.creatures.filter((c) => !c.away && canFight(c) && (!dinosOnly || c.kind === 'dino'));
}

function pickTarget(state: GameState, dinosOnly = false): Creature | undefined {
  const pool = playerTargets(state, dinosOnly);
  if (!pool.length) return undefined;
  return coin() ? pick(pool) : mostFamous(pool);
}

/** Each rival rolls rand(120) − opinion/2 to scheme against the player; queues PendingDefense entries. */
export function rivalSchemes(state: GameState, r: Ludus): void {
  if (!r.ai || r.defeated || r.isPlayer) return;
  const me = state.player.ludus;
  if (me.defeated) return;
  const d = state.world.difficulty;
  const week = state.world.week;
  let n = rand(120) - Math.trunc(r.ai.opinion / 2);
  if (d.nightmare) n += 10;
  if (r.ai.key === 'hannibal') n += 10;
  if (!d.hard && state.world.ascension === 0) {
    if (week < 5) n -= 10;
    else if (week < 15) n -= 5;
  }
  const venus = asc(state, ASC.venus) || d.nightmare;

  // assassination: separate check, several rivals may try in one week
  if (n > 120 && r.creatures.length > 2) {
    const target = pickTarget(state);
    const a = target ? bestAgent(state, r, 'assassinate', target) : null;
    if (a && target && a.chance > 35) queueDefense(state, r, 'assassinate', a.agent, a.chance, target);
  }

  const targeted = () => me.targetedThisWeek;
  if (n > 105 && !targeted() && venus && constructionLevel(me) > 4) {
    const a = bestAgent(state, r, 'sabotage');
    if (a && a.chance > 40) { queueDefense(state, r, 'sabotage', a.agent, a.chance); return; }
  }
  if (n > 95 && !targeted() && venus && me.denarii > 200) {
    const a = bestAgent(state, r, 'steal');
    if (a && a.chance > 40) { queueDefense(state, r, 'steal', a.agent, a.chance); return; }
  }
  const needed = d.hard ? 0 : 2;
  if (n >= 85 && !targeted() && me.influence > r.influence && playerTargets(state).length > needed) {
    const spartacus = me.creatures.find((c) => c.legend === 'spartacus' && !c.away && canFight(c));
    let target = spartacus && coin() ? spartacus : pickTarget(state, true);
    if (!target) target = pickTarget(state);
    if (!target) return;
    const isSpartacus = target.legend === 'spartacus';
    const p = target.kind === 'dino' ? bestAgent(state, r, 'persuade', target) : null;
    if (p && ((p.chance > 40 && target.loyalty > 50) || (isSpartacus && p.chance > 30))) {
      queueDefense(state, r, 'persuade', p.agent, p.chance, target);
      return;
    }
    const q = bestAgent(state, r, 'poison', target);
    if (q && q.chance > 30) queueDefense(state, r, 'poison', q.agent, q.chance, target);
  }
}

function promptCreature(state: GameState, prompt: number, d: { targetCreatureId?: ID }): Creature | undefined {
  const me = state.player.ludus;
  const fit = (c: Creature) => !c.away && canFight(c) && !c.inactive && c.id !== d.targetCreatureId;
  switch (prompt) {
    case 4: return me.creatures.find((c) => c.kind === 'beast' && (hasTrait(c, 'GoodBoy') || hasTrait(c, 'BestBoy')) && fit(c));
    case 5: return me.creatures.find((c) => c.kind === 'dino' && hasTrait(c, 'Loyal') && fit(c));
    case 6: return me.creatures.find((c) => hasTrait(c, 'Paranoid') && c.id !== d.targetCreatureId);
    case 7: return d.targetCreatureId ? me.creatures.find((c) => c.id === d.targetCreatureId) : undefined;
    default: return undefined;
  }
}

function promptValid(state: GameState, prompt: number, d: { targetCreatureId?: ID }): boolean {
  switch (prompt) {
    case 0: return committedSpies(state, state.player.ludus) > 0;
    case 4: case 5: case 6: case 7: return !!promptCreature(state, prompt, d);
    default: return true;
  }
}

function rollPrompt(state: GameState, d: { targetCreatureId?: ID }): number {
  for (let i = 0; i < 30; i++) {
    const p = rand(8);
    if (promptValid(state, p, d)) return p;
  }
  return 3;
}

function queueDefense(state: GameState, r: Ludus, action: IntrigueAction, agent: Creature, chance: number, target?: Creature): void {
  const me = state.player.ludus;
  agent.inactive = true;
  // targeted flag: at Apollo or on Nightmare it is only set half the time
  if (!((asc(state, ASC.apollo) || state.world.difficulty.nightmare) && coin())) me.targetedThisWeek = true;
  const pd: PendingDefense = { id: newId('d'), rivalId: r.id, action, agentId: agent.id, targetCreatureId: target?.id, prompt: 0, chance };
  // Apollo: warnings of rival intrigue come only half the time; unwarned plots resolve at once
  if (asc(state, ASC.apollo) && coin()) {
    const text = resolvePending(state, pd, 0);
    message(state, 'spy', 'Treachery in the night', text);
    return;
  }
  pd.prompt = rollPrompt(state, pd);
  state.player.defenses.push(pd);
}

/** Text of a pending defender prompt with the dino's name filled in. */
export function defensePromptText(state: GameState, d: PendingDefense): { title: string; text: string; assertive: string; passive: string } {
  const p = DEFENSE_PROMPTS[d.prompt] ?? DEFENSE_PROMPTS[3];
  const c = promptCreature(state, d.prompt, d);
  const fill = (s: string) => s.replace('%s', c?.name ?? 'One of your dinos');
  return { title: 'Something stirs in the night', text: fill(p.text), assertive: fill(p.assertive), passive: fill(p.passive) };
}

/** Apply the defender prompt and return the modifier to the attacker's roll. */
function applyPrompt(state: GameState, d: PendingDefense, choice: 'assertive' | 'passive', lines: string[]): number {
  const me = state.player.ludus;
  const creatureAction = isCreatureAction(d.action);
  const c = promptCreature(state, d.prompt, d);
  const assertive = choice === 'assertive';
  switch (d.prompt) {
    case 0:
      if (!assertive) return 0;
      if (me.denarii < 50) {
        lines.push('You could not scrape together 50 denarii for night guards.');
        return 0;
      }
      me.denarii -= 50;
      report(state, 'expense', 'Night guards', -50);
      return -25;
    case 1:
      if (assertive) return creatureAction ? -25 : 20;
      return creatureAction ? 20 : -25;
    case 2:
      addInfluence(state, me, assertive ? 10 : -10);
      return assertive ? 10 : -10;
    case 3:
      if (assertive) {
        addInfluence(state, me, -10);
        return -30;
      }
      return -5;
    case 4:
      if (!assertive || !c) return 5;
      c.inactive = true;
      if (coin() && addTrait(c, 'Loyal')) {
        lines.push(`${c.name} patrolled all night and has become Loyal.`);
        return -25;
      }
      return -20;
    case 5:
      if (!assertive || !c) return 5;
      c.inactive = true;
      if (coin() && addTrait(c, 'Alert')) {
        lines.push(`${c.name} stood guard all night and has become Alert.`);
        return -20;
      }
      return -15;
    case 6:
      return assertive ? 15 : -5;
    case 7:
      if (!assertive || !c) return 5;
      if (rand(10) === 0 && addTrait(c, 'Paranoid')) {
        lines.push(`${c.name} spent the night chained and staring at the door. It has become Paranoid.`);
        return -25;
      }
      return -20;
    default:
      return 0;
  }
}

const DEFENSE_HEAD: Record<IntrigueAction, (t?: string) => string> = {
  assassinate: (t) => `An assassin came for ${t ?? 'one of your dinos'} in the night.`,
  poison: (t) => `Someone tried to poison ${t ?? 'one of your dinos'}.`,
  persuade: () => 'Strangers were seen hanging around the pens at night.',
  steal: () => 'A thief got into the ludus.',
  sabotage: () => 'Somebody tried to burn your ludus down.',
  raid: () => 'Raiders came over the palisade.',
};

function resolvePending(state: GameState, d: PendingDefense, mod: number, lines: string[] = []): string {
  const me = state.player.ludus;
  const r = houseById(state, d.rivalId);
  if (!r || r.defeated) return [...lines, 'Whoever was plotting against you has bigger problems now. Nothing happened.'].join(' ');
  const agent = r.creatures.find((c) => c.id === d.agentId);
  if (!agent) return [...lines, 'The plot came to nothing.'].join(' ');
  const target = d.targetCreatureId ? me.creatures.find((c) => c.id === d.targetCreatureId) : undefined;
  if (isCreatureAction(d.action) && !target) return [...lines, 'The intended victim was not where the plotters expected. Nothing happened.'].join(' ');
  const ctx: Ctx = { state, action: d.action, agent, att: r, def: me, target, scenario: -1, mod, defenderView: true };
  const out = runAction(ctx);
  const res: string[] = [...lines, DEFENSE_HEAD[d.action](target?.name), ...out.lines];
  if (out.discovered) {
    me.caught.push(agent.id);
    res.push(`Your wardens recognised the intruder: ${agent.name} of House ${r.name}. You will not forget this.`);
  } else if (!out.agentDied) {
    res.push('Nobody saw who it was.');
  } else {
    res.push(`The body was one of House ${r.name}'s dinos, ${agent.name}.`);
  }
  if (out.killed && target) report(state, 'bad', `${target.name} was killed by an agent in the night.`);
  return res.join(' ');
}

/** Player answers a defender prompt; resolves the rival action. */
export function resolveDefense(state: GameState, defenseId: ID, choice: 'assertive' | 'passive'): string {
  const i = state.player.defenses.findIndex((d) => d.id === defenseId);
  if (i < 0) return 'Nothing to answer.';
  const d = state.player.defenses[i];
  state.player.defenses.splice(i, 1);
  const lines: string[] = [];
  const mod = applyPrompt(state, d, choice, lines);
  return resolvePending(state, d, mod, lines);
}

/** Resolve every pending defense with a passive answer (e.g. when the player skips the report). */
export function resolveAllDefenses(state: GameState): string[] {
  return [...state.player.defenses].map((d) => resolveDefense(state, d.id, 'passive'));
}

