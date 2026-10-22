// Shared helpers for the weekly decision events (events.ts + data/eventsData*.ts) and adventures.
// OWNER: systems-story agent. GM 04 §6–8.
//
// Conventions
//  - Event options carry an `id` (stored in decision.data.ids) so resolve() switches on ids, not indices.
//  - Option costs are stored in decision.data.costs and re-checked when the player answers.
//  - Scripted foes (not in any house) carry their battle harness as `gear:` notes (see setLoadout) so any
//    module can rebuild their gear with foeSide().

import type {
  Augment, BattleFighter, BattleResult, BattleSide, BeastSpeciesId, Creature, Decision, DecisionOption,
  DelayedOutcome, DinoSpeciesId, GameState, Gear, GearSlot, GearTypeId, ID, InjuryType, Instruction, Ludus, Quality,
  SideModifier, TechId, TraitId,
} from '../types';
import { STATS } from '../types';
import { chance, clamp, pick, range } from '../rng';
import { activeRivals, asc, ASC, fmt, newId, visibleRivals } from '../util';
import {
  addTrait, canFight, creatureTitle, generateBeast, generateDino, worth,
} from '../creature';
import { SPECIES } from './species';
import { GEAR, UNIQUES, makeGear } from './gear';
import { RANDOM_TRAITS, TRAITS } from './traits';
import { buildSide, resolveBattle, applyBattleResult } from '../combat';
import { addInfluence } from '../economy';
import { hasOpp } from '../influence';
import { bury } from '../care';

export const EVENT_ROUNDS = 8;

// ---------------------------------------------------------------------------
// Houses and creatures
// ---------------------------------------------------------------------------

export const me = (s: GameState): Ludus => s.player.ludus;
export const wk = (s: GameState): number => s.world.week;
export const dn = (n: number): string => `${fmt(n)} denarii`;
export const cname = (c: Creature): string => creatureTitle(c);
export const sname = (c: { species: Creature['species'] }): string => SPECIES[c.species].name;
/** "Flamma the Velociraptor" */
export const full = (c: Creature): string => `${creatureTitle(c)} the ${SPECIES[c.species].name}`;

/** Can take part in an event fight or adventure right now. */
export function fit(c: Creature): boolean {
  return canFight(c) && c.ill <= 0;
}

export function fitOf(h: Ludus, f?: (c: Creature) => boolean): Creature[] {
  return h.creatures.filter((c) => fit(c) && (!f || f(c)));
}

/** Most famous first, then level, then worth. */
export function rank(cs: Creature[]): Creature[] {
  return [...cs].sort((a, b) => b.fame - a.fame || b.level - a.level || worth(b) - worth(a));
}

export function bestOf(cs: Creature[]): Creature | undefined {
  const dinos = cs.filter((c) => c.kind === 'dino');
  return rank(dinos.length ? dinos : cs)[0];
}

/** The player's champion: the most famous fit dino (a beast if no dino can fight). */
export function champion(s: GameState, exclude: ID[] = []): Creature | undefined {
  return bestOf(fitOf(me(s), (c) => !exclude.includes(c.id)));
}

export function mine(s: GameState, id: ID | undefined): Creature | undefined {
  if (!id) return undefined;
  return me(s).creatures.find((c) => c.id === id);
}

export function fitMine(s: GameState, id: ID | undefined): Creature | undefined {
  const c = mine(s, id);
  return c && fit(c) ? c : undefined;
}

/** The stored creature if it can still go, otherwise today's champion. */
export function stillOrChampion(s: GameState, id: ID | undefined, exclude: ID[] = []): Creature | undefined {
  return fitMine(s, id) ?? champion(s, exclude);
}

export function ownsSpecies(s: GameState, sp: Creature['species']): boolean {
  return me(s).creatures.some((c) => c.species === sp);
}

export function keepers(h: Ludus): number {
  const k = h.keepers;
  return k.unassigned + k.miners + k.showmen + k.wardens + k.spies;
}

/** Take a creature out of the player's ludus (pairs, bond, doctore, sparring, gear assignments). */
export function detach(s: GameState, c: Creature, h: Ludus = me(s)): void {
  h.creatures = h.creatures.filter((x) => x.id !== c.id);
  h.pairs = h.pairs.filter((p) => p.maleId !== c.id && p.femaleId !== c.id);
  if (h.bondedId === c.id) h.bondedId = undefined;
  if (h.doctoreId === c.id) h.doctoreId = undefined;
  h.training.sparring = h.training.sparring.filter((p) => p.a !== c.id && p.b !== c.id);
  delete h.training.overrides[c.id];
  c.gear = {};
}

/** A creature of the player dies outside the arena. */
export function killMine(s: GameState, c: Creature, cause: string): void {
  detach(s, c);
  bury(s, c, cause);
}

export function rivalById(s: GameState, id: ID | undefined): Ludus | undefined {
  if (!id) return undefined;
  return s.rivals.find((r) => r.id === id && !r.defeated);
}

/** A random visible rival (optionally filtered). */
export function someRival(s: GameState, f?: (r: Ludus) => boolean): Ludus | undefined {
  const pool = visibleRivals(s).filter((r) => !f || f(r));
  return pool.length ? pick(pool) : undefined;
}

export function weakestRival(s: GameState): Ludus | undefined {
  return [...activeRivals(s)].sort((a, b) => a.influence - b.influence)[0];
}

export function strongestRival(s: GameState): Ludus | undefined {
  return [...activeRivals(s)].sort((a, b) => b.influence - a.influence)[0];
}

// ---------------------------------------------------------------------------
// Money, influence, tameness, wounds
// ---------------------------------------------------------------------------

export function spend(s: GameState, n: number): void {
  me(s).denarii -= Math.round(n);
}

export function earn(s: GameState, n: number): void {
  me(s).denarii += Math.round(n);
}

/** Player influence change through the GM multipliers (negative skips them). */
export function infl(s: GameState, n: number): number {
  if (!n) return 0;
  return addInfluence(s, me(s), Math.round(n));
}

export function tame(c: Creature, d: number): void {
  c.loyalty = clamp(Math.round(c.loyalty + d), 0, 100);
}

export function tameAll(s: GameState, d: number, except?: ID): void {
  for (const c of me(s).creatures) if (c.id !== except) tame(c, d);
}

export function injure(c: Creature, weeks: number, type: InjuryType = 'flesh'): void {
  if (!c.injury || c.injury.weeks < weeks) c.injury = { type, weeks };
}

export function sicken(c: Creature, weeks: number): void {
  c.ill = Math.max(c.ill, weeks);
}

/** A random positive (or mixed) trait the creature lacks. */
export function randomGoodTrait(c: Creature, pool: TraitId[] = RANDOM_TRAITS): TraitId | undefined {
  const opts = pool.filter((t) => !c.traits.includes(t) && TRAITS[t] && TRAITS[t].polarity !== '-');
  return opts.length ? pick(opts) : undefined;
}

export function traitName(t: TraitId): string {
  return TRAITS[t]?.name ?? t;
}

// ---------------------------------------------------------------------------
// Gear rewards
// ---------------------------------------------------------------------------

export function giveGear(s: GameState, type: GearTypeId, quality: Quality, extra: Partial<Gear> = {}, h: Ludus = me(s)): Gear {
  const g = makeGear(type, quality, newId('g'), extra);
  h.armory.push(g);
  return g;
}

export function makeUnique(key: string): Gear {
  const u = UNIQUES[key];
  return makeGear(u.base, u.quality, newId('g'), { unique: key });
}

export function giveUnique(s: GameState, key: string, h: Ludus = me(s)): Gear {
  const g = makeUnique(key);
  h.armory.push(g);
  return g;
}

export function uniqueName(key: string): string {
  return UNIQUES[key]?.name ?? key;
}

export function hasUnique(h: Ludus, key: string): boolean {
  return h.armory.some((g) => g.unique === key);
}

export function armoryHas(h: Ludus, type: GearTypeId): boolean {
  return h.armory.some((g) => g.type === type);
}

/** Who wears this gear piece in the house. */
export function wearer(h: Ludus, gearId: ID): Creature | undefined {
  return h.creatures.find((c) => Object.values(c.gear).includes(gearId));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function opp(s: GameState, id: Parameters<typeof hasOpp>[1]): boolean {
  return s.player.opportunities.includes(id) || hasOpp(s, id);
}

/** GM hasSenatorInfluence: Lobby the Senate (or a seat in it). */
export const senateInfluence = (s: GameState): boolean => s.player.senator || opp(s, 'lobbySenate');
export const princeps = (s: GameState): boolean => s.player.senator && opp(s, 'princepsSenatus');
export const isConsul = (s: GameState): boolean => s.player.consul;
export const hasOppSafe = opp;
export const minerva = (s: GameState): boolean => asc(s, ASC.minerva);

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface Opt {
  id: string;
  label: string;
  desc?: string;
  /** denarii paid when chosen (negative = received) */
  cost?: number;
  /** non-cost requirement: a reason string when unmet */
  need?: string | null | false;
}

export const req = (ok: boolean, reason: string): string | null => (ok ? null : reason);

/** Build a Decision; options that are unaffordable or unmet are disabled with a reason. */
export function decide(
  s: GameState, key: string, title: string, text: string, opts: Opt[], data: Record<string, any> = {}, art?: string,
): Decision {
  const h = me(s);
  const options: DecisionOption[] = opts.map((o) => {
    const reason = o.need ? o.need : o.cost && o.cost > 0 && h.denarii < o.cost ? `Needs ${dn(o.cost)}.` : undefined;
    const opt: DecisionOption = { label: o.label };
    if (o.desc) opt.desc = o.desc;
    if (reason) {
      opt.disabled = true;
      opt.reason = reason;
    }
    return opt;
  });
  const d: Decision = {
    id: newId('d'), key, title, text, options, week: s.world.week,
    data: { ...data, ids: opts.map((o) => o.id), costs: opts.map((o) => o.cost ?? 0), needs: opts.map((o) => o.need || null) },
  };
  if (art) d.art = art;
  return d;
}

/** Option id chosen in a decision built with decide(). */
export function optId(d: Decision, option: number): string {
  const ids: string[] | undefined = d.data?.ids;
  return ids?.[option] ?? String(option);
}

/** Why an option cannot be taken right now (null = it can). Re-checks the cost against today's purse. */
export function optionProblem(s: GameState, d: Decision, option: number): string | null {
  if (option < 0 || option >= d.options.length) return 'That is not one of the choices.';
  const need: string | null | undefined = d.data?.needs?.[option];
  if (need) return need;
  const cost: number = d.data?.costs?.[option] ?? 0;
  if (cost > 0 && me(s).denarii < cost) return `You cannot afford that: it costs ${dn(cost)}.`;
  return null;
}

/** Pay the option's stored cost (call from resolve). */
export function payOption(s: GameState, d: Decision, option: number): number {
  const cost: number = d.data?.costs?.[option] ?? 0;
  if (cost) spend(s, cost);
  return cost;
}

// ---------------------------------------------------------------------------
// Delayed outcomes
// ---------------------------------------------------------------------------

export type DelayedHandler = (s: GameState, data: Record<string, any>, o: DelayedOutcome) => void;

export function schedule(s: GameState, key: string, weeks: number, data: Record<string, any> = {}): DelayedOutcome {
  const o: DelayedOutcome = { id: newId('o'), key, week: s.world.week + Math.max(0, Math.round(weeks)), data };
  s.player.delayed.push(o);
  return o;
}

export function hasDelayed(s: GameState, key: string): boolean {
  return s.player.delayed.some((o) => o.key === key);
}

// ---------------------------------------------------------------------------
// Scripted foes
// ---------------------------------------------------------------------------

export interface LoadoutItem { slot: GearSlot; type: GearTypeId; quality: Quality; augment?: Augment; unique?: string }

export const L = (type: GearTypeId, quality: Quality, augment?: Augment): LoadoutItem => ({ slot: GEAR[type].slot, type, quality, augment });
/** Off-hand piece (a second fang/claw in the off hand, or a shield). */
export const OFF = (type: GearTypeId, quality: Quality, augment?: Augment): LoadoutItem => ({ slot: 'offhand', type, quality, augment });
export const UQ = (key: string): LoadoutItem => {
  const u = UNIQUES[key];
  return { slot: GEAR[u.base].slot, type: u.base, quality: u.quality, unique: key };
};

/** Store a battle harness on a scripted foe (as `gear:` notes). */
export function setLoadout(c: Creature, items: LoadoutItem[]): void {
  c.notes = (c.notes ?? []).filter((n) => !n.startsWith('gear:'));
  for (const it of items) c.notes.push(`gear:${it.slot}:${it.type}:${it.quality}:${it.augment ?? ''}:${it.unique ?? ''}`);
}

/** Rebuild a scripted foe's harness from its notes. */
export function loadoutOf(c: Creature): Partial<Record<GearSlot, Gear>> {
  const out: Partial<Record<GearSlot, Gear>> = {};
  for (const n of c.notes ?? []) {
    if (!n.startsWith('gear:')) continue;
    const [, slot, type, q, aug, uq] = n.split(':');
    if (!GEAR[type as GearTypeId]) continue;
    const extra: Partial<Gear> = {};
    if (aug) extra.augment = aug as Augment;
    if (uq) extra.unique = uq;
    out[slot as GearSlot] = makeGear(type as GearTypeId, Number(q) as Quality, `${c.id}-${slot}`, extra);
  }
  return out;
}

/** GM foe scaling: +2 stats per tier (Sol ascension, Pluto ascension, Hard, Nightmare) and extra traits. */
export function foeTiers(s: GameState): number {
  return (asc(s, ASC.sol) ? 1 : 0) + (asc(s, ASC.pluto) ? 1 : 0) + (s.world.difficulty.hard ? 1 : 0) + (s.world.difficulty.nightmare ? 1 : 0);
}

export function scaleFoe(s: GameState, c: Creature, extraTiers = 0): Creature {
  const t = foeTiers(s) + extraTiers;
  if (t <= 0) return c;
  c.bonus.str += 2 * t;
  c.bonus.agi += 2 * t;
  c.bonus.cun += 2 * t;
  c.bonus.hp += 5 * t;
  const extra: TraitId[] = ['Tough', 'Veteran', 'Strong', 'Fury', 'Indomitable'];
  for (let i = 0; i < Math.min(t, extra.length); i++) addTrait(c, extra[i]);
  return c;
}

/** Level of a scripted foe for this week (GM foes grow with the calendar). */
export function foeLevel(s: GameState, mult = 1): number {
  return clamp(Math.round((2 + s.world.week / 7) * mult), 1, 45);
}

export interface FoeOpts {
  mult?: number;
  level?: number;
  traits?: TraitId[];
  techs?: [TechId, number][];
  gear?: LoadoutItem[];
  cls?: Creature['cls'];
  sex?: 'M' | 'F';
  /** flat stat bonus on top */
  plus?: Partial<Record<'str' | 'agi' | 'cun' | 'hp', number>>;
  extraTiers?: number;
  noScale?: boolean;
  legend?: string;
  instruction?: Instruction;
}

function finishFoe(s: GameState, c: Creature, name: string, o: FoeOpts): Creature {
  c.name = name;
  if (o.legend) c.legend = o.legend;
  for (const t of o.traits ?? []) addTrait(c, t);
  if (o.techs?.length) {
    // scripted techniques are always equipped; random ones fill up to three
    for (const t of c.techniques) t.equipped = false;
    for (const [t, r] of o.techs) {
      const k = c.techniques.find((x) => x.id === t);
      if (k) {
        k.rank = Math.max(k.rank, r);
        k.equipped = true;
      } else c.techniques.push({ id: t, rank: r, equipped: true });
    }
    let n = c.techniques.filter((t) => t.equipped).length;
    for (const t of c.techniques) if (!t.equipped && n < 3) {
      t.equipped = true;
      n++;
    }
  }
  if (o.cls !== undefined) {
    c.cls = o.cls;
    c.classXp = Math.max(c.classXp, 9);
  }
  for (const st of STATS) c.bonus[st] += o.plus?.[st] ?? 0;
  if (o.gear?.length) setLoadout(c, o.gear);
  if (o.instruction) c.instruction = o.instruction;
  if (!o.noScale) scaleFoe(s, c, o.extraTiers ?? 0);
  c.loyalty = 100;
  return c;
}

/** A scripted dino foe of a species, levelled for the week. */
export function dinoFoe(s: GameState, species: DinoSpeciesId, name: string, o: FoeOpts = {}): Creature {
  const level = o.level ?? foeLevel(s, o.mult ?? 1);
  const c = generateDino({ species, week: s.world.week, level, tier: 'normal', sex: o.sex ?? 'M' });
  c.maturity = 1;
  if (c.adultWeeks < 52) c.adultWeeks = 52 + range(0, 300);
  c.ageWeeks = SPECIES[species].matureWeeks + c.adultWeeks;
  c.traits = c.traits.filter((t) => t !== 'Sterile' && t !== 'Fertile');
  return finishFoe(s, c, name, o);
}

/** A scripted beast foe. */
export function beastFoe(s: GameState, species: BeastSpeciesId, name: string, o: FoeOpts & { variant?: 'standard' | 'random' | 'strong' } = {}): Creature {
  const level = o.level ?? foeLevel(s, o.mult ?? 1);
  const c = generateBeast(species, { variant: o.variant ?? 'random', level, sex: o.sex ?? 'M', name });
  // beasts level through stat points; give them their levels' worth
  const pts = Math.max(0, level - 1);
  c.bonus.str += Math.round(pts * 0.4);
  c.bonus.agi += Math.round(pts * 0.3);
  c.bonus.hp += 5 * Math.round(pts * 0.3);
  return finishFoe(s, c, name, o);
}

/** Underworld/mythic monster with the GM stat line, buffed every 20 weeks. */
export function monsterFoe(s: GameState, species: BeastSpeciesId, name: string, o: FoeOpts = {}): Creature {
  const c = generateBeast(species, { variant: 'standard', level: o.level ?? foeLevel(s), name });
  const buff = Math.floor(s.world.week / 20);
  c.bonus.str += 2 * buff;
  c.bonus.agi += 2 * buff;
  c.bonus.cun += buff;
  c.bonus.hp += 5 * buff;
  return finishFoe(s, c, name, o);
}

/** Copy of a real creature as a scripted foe (its assigned gear becomes its loadout). */
export function cloneAsFoe(c: Creature, owner?: Ludus): Creature {
  const copy: Creature = JSON.parse(JSON.stringify(c));
  copy.id = newId('c');
  const items: LoadoutItem[] = [];
  if (owner) {
    for (const [slot, gid] of Object.entries(c.gear) as [GearSlot, ID][]) {
      const g = owner.armory.find((x) => x.id === gid);
      if (g) items.push({ slot, type: g.type, quality: g.quality, augment: g.augment, unique: g.unique });
    }
  }
  copy.gear = {};
  setLoadout(copy, items);
  return copy;
}

// ---------------------------------------------------------------------------
// Battle sides
// ---------------------------------------------------------------------------

function instructionsOf(cs: Creature[], override?: Instruction): Record<ID, Instruction | null> {
  const out: Record<ID, Instruction | null> = {};
  for (const c of cs) out[c.id] = override ?? c.instruction ?? 'default';
  return out;
}

/** Side of scripted foes (no house) with their loadouts, or of a real house's creatures. */
export function foeSide(
  s: GameState, foes: Creature[], name: string,
  o: { instruction?: Instruction; modifiers?: SideModifier[]; house?: Ludus; used?: Set<ID> } = {},
): BattleSide {
  const instr: Record<ID, Instruction | null> = {};
  for (const c of foes) instr[c.id] = o.instruction ?? c.instruction ?? 'default';
  const side = buildSide(s, o.house, foes, instr, { riders: true, name, modifiers: o.modifiers ?? [], used: o.used });
  for (const f of side.fighters) {
    const lo = loadoutOf(f.creature);
    if (Object.keys(lo).length) f.gear = { ...f.gear, ...lo };
  }
  return side;
}

/** The player's side: own creatures (house armory gear) plus temporary allies. */
export function playerSide(
  s: GameState, fighters: Creature[], o: { instruction?: Instruction; modifiers?: SideModifier[]; allies?: BattleFighter[] } = {},
): BattleSide {
  const h = me(s);
  const side = buildSide(s, h, fighters, instructionsOf(fighters, o.instruction), {
    riders: true, name: h.name, modifiers: o.modifiers ?? [], player: true,
  });
  for (const a of o.allies ?? []) side.fighters.push(a);
  return side;
}

export function usedGear(side: BattleSide): Set<ID> {
  const out = new Set<ID>();
  for (const f of side.fighters) for (const g of Object.values(f.gear)) if (g) out.add(g.id);
  return out;
}

/** GM lictor: a level 6/10/15 Bulwark bodyguard (Iguanodon) in quality legion harness. */
export function makeLictor(s: GameState): Creature {
  const level = s.world.week > 220 ? 15 : s.world.week > 120 ? 10 : 6;
  return dinoFoe(s, 'iguanodon', 'Lictor', {
    level, noScale: true, cls: 'bulwark', traits: ['Enforcer', 'Tough', 'Veteran', 'Loyal'],
    gear: [L('talonBlades', 3), L('frillGuard', 3), L('legionBarding', 3), L('legionFaceplate', 3)],
  });
}

/** Allied help in dangerous street fights (GM 04 §7): pact ally's best, a Good Boy beast, the Consul's lictors. */
export function alliedHelp(s: GameState, taken: Creature[], room: number): { own: Creature[]; allies: BattleFighter[]; names: string[] } {
  const own: Creature[] = [];
  const allies: BattleFighter[] = [];
  const names: string[] = [];
  if (room <= 0) return { own, allies, names };
  // a Good Boy / Best Boy beast leaps to defend
  const boy = fitOf(me(s), (c) => c.kind === 'beast' && (c.traits.includes('GoodBoy') || c.traits.includes('BestBoy')) && !taken.includes(c));
  if (boy.length && own.length + allies.length < room) {
    own.push(boy[0]);
    names.push(`${cname(boy[0])} leaps to your defence`);
  }
  // pact ally sends its best
  for (const r of activeRivals(s)) {
    if (own.length + allies.length >= room) break;
    if (!r.ai?.pact || r.ai.opinion < 60) continue;
    const best = bestOf(fitOf(r));
    if (!best) continue;
    const side = buildSide(s, r, [best], 'default', { riders: true, name: r.name });
    for (const f of side.fighters) allies.push({ ...f, temporary: true });
    names.push(`${r.name} sends ${cname(best)}`);
  }
  // the Consul's lictors (influence.ts keeps one in storyData.lictor, its harness in storyData.lictorGear)
  if (s.player.consul && own.length + allies.length < room) {
    const stored = s.player.storyData?.lictor;
    const list: Creature[] = Array.isArray(stored) ? stored : stored && typeof stored === 'object' ? [stored as Creature] : [makeLictor(s)];
    const kit: Gear[] = Array.isArray(s.player.storyData?.lictorGear) ? s.player.storyData.lictorGear : [];
    for (const l of list) {
      if (own.length + allies.length >= room) break;
      if (!l || (l.injury && l.injury.weeks > 0)) continue;
      const side = foeSide(s, [l], 'Lictors');
      for (const f of side.fighters) {
        for (const g of kit) if (GEAR[g.type] && !f.gear[GEAR[g.type].slot]) f.gear[GEAR[g.type].slot] = g;
        allies.push({ ...f, temporary: true });
      }
      names.push(`your lictor ${l.name} steps in`);
    }
  }
  return { own, allies, names };
}

// ---------------------------------------------------------------------------
// Street fights (GM StreetfightChoice)
// ---------------------------------------------------------------------------

export interface StreetFight {
  title: string;
  fighters: Creature[];
  foes: Creature[];
  foeName: string;
  /** foes are real creatures of this house (their armory, their wounds) */
  foeHouse?: Ludus;
  toTheDeath?: boolean;
  /** influence stake (GM: 10, election ambush 15); doubled to the death; 0 = none */
  stake?: number;
  /** pact ally, Good Boy beast and lictors may join (dangerous fights) */
  allies?: boolean;
  /** temporary scripted allies (Hector) */
  extraAllies?: Creature[];
  /** this rival loses the stake on a player win */
  rival?: Ludus;
  /** replace the −stake on a loss */
  lossInfluence?: number;
  deathCause?: string;
  foeModifiers?: SideModifier[];
  playerModifiers?: SideModifier[];
  foeInstruction?: Instruction;
  playerInstruction?: Instruction;
  natural?: boolean;
}

export interface FightOutcome { battle: BattleResult; won: boolean; dead: string[]; influence: number; text: string; sides: [BattleSide, BattleSide] }

export function streetFight(s: GameState, o: StreetFight): FightOutcome {
  let fighters = o.fighters.slice(0, 3);
  let allyFighters: BattleFighter[] = [];
  const help: string[] = [];
  if (o.allies) {
    const a = alliedHelp(s, fighters, 3 - fighters.length - (o.extraAllies?.length ?? 0));
    fighters = [...fighters, ...a.own];
    allyFighters = a.allies;
    help.push(...a.names);
  }
  for (const x of o.extraAllies ?? []) {
    const side = foeSide(s, [x], 'Allies');
    for (const f of side.fighters) allyFighters.push({ ...f, temporary: true });
  }
  const pSide = playerSide(s, fighters, { instruction: o.playerInstruction, modifiers: o.playerModifiers, allies: allyFighters });
  const fSide = foeSide(s, o.foes.slice(0, 3), o.foeName, {
    instruction: o.foeInstruction, modifiers: o.foeModifiers, house: o.foeHouse,
    used: o.foeHouse && o.foeHouse === me(s) ? usedGear(pSide) : undefined,
  });
  const sides: [BattleSide, BattleSide] = [pSide, fSide];
  const battle = resolveBattle(sides, {
    week: s.world.week, rounds: EVENT_ROUNDS, event: true, toTheDeath: !!o.toTheDeath, riders: true, natural: o.natural, label: o.title,
  });
  const dead = applyBattleResult({ state: s, event: true, deathCause: o.deathCause ?? `Killed in a street fight (${o.title})` }, sides, battle);
  const won = battle.winner === 0;
  const stake = (o.stake ?? 10) * (o.toTheDeath ? 2 : 1);
  let influence = 0;
  if (won) {
    if (stake) influence = infl(s, stake);
    if (o.rival && stake) addInfluence(s, o.rival, -stake);
  } else if (o.lossInfluence !== undefined) {
    influence = infl(s, o.lossInfluence);
  } else if (stake) {
    influence = infl(s, -stake);
  }
  const parts: string[] = [];
  if (help.length) parts.push(`${help.join('; ')}.`);
  parts.push(won ? 'Victory!' : 'Defeat.');
  if (influence) parts.push(`${influence > 0 ? '+' : ''}${influence} influence.`);
  if (dead.length) parts.push(`Fallen: ${dead.join(', ')}.`);
  return { battle, won, dead, influence, text: parts.join(' '), sides };
}

/** Outcome of the foe (scripted foes are not in any house). */
export function foeOutcome(r: BattleResult, c: Creature) {
  return r.outcomes.find((x) => x.creatureId === c.id);
}

/** A list of names: "A, B and C". */
/** 'trainingField' → 'training field' */
export function words(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
