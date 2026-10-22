// Shared helpers for stories, objectives and ascension (OWNER: systems-story agent).
// Small, pure-ish lookups over GameState; no RNG except where stated.

import type { Creature, GameState, Gear, GearTypeId, LeagueId, Ludus, Quality, RivalKey, TraitId } from '../types';
import { STATS } from '../types';
import { makeGear, gearWorth, GEAR } from './gear';
import { newId, visibleRivals, activeRivals } from '../util';
import { canFight, rawStat, autoSpendStatPoints, xpForLevel } from '../creature';

/** Story progress value for a finished storyline. */
export const DONE = 99;

export const LEAGUE_IDS: LeagueId[] = ['lunar', 'solar', 'bacchus', 'jupiter', 'vulcan', 'annum'];

export function me(state: GameState): Ludus {
  return state.player.ludus;
}

/** A fresh piece of harness with a new id. */
export function newGear(type: GearTypeId, quality: Quality, extra: Partial<Gear> = {}): Gear {
  return makeGear(type, quality, newId('g'), extra);
}

export function giveGear(h: Ludus, g: Gear): Gear {
  h.armory.push(g);
  return g;
}

/** Put gear in a house's armory and assign it to a creature's slot. */
export function equip(h: Ludus, c: Creature, g: Gear): void {
  h.armory.push(g);
  c.gear[GEAR[g.type].slot] = g.id;
}

/** Remove a piece of gear from an armory and from whoever wears it. */
export function takeGear(h: Ludus, id: string): Gear | undefined {
  const i = h.armory.findIndex((g) => g.id === id);
  if (i < 0) return undefined;
  const [g] = h.armory.splice(i, 1);
  for (const c of h.creatures) for (const k of Object.keys(c.gear) as (keyof Creature['gear'])[]) if (c.gear[k] === id) delete c.gear[k];
  return g;
}

export function ownsUnique(h: Ludus, key: string): boolean {
  return h.armory.some((g) => g.unique === key);
}

export function ownsType(h: Ludus, type: GearTypeId): boolean {
  return h.armory.some((g) => g.type === type);
}

/** League first places (GM ascension trophies). */
export function firstPlaces(h: Ludus): number {
  return h.trophies.filter((t) => t.place === 1 && (LEAGUE_IDS as string[]).includes(t.league)).length;
}

export function totalFame(h: Ludus): number {
  return h.creatures.reduce((s, c) => s + Math.max(0, c.fame), 0);
}

export function rawTotal(c: Creature): number {
  return STATS.reduce((s, k) => s + rawStat(c, k), 0);
}

/** Creatures that can be sent somewhere this week (healthy, of age, at home). */
export function available(h: Ludus, o: { dinoOnly?: boolean; exclude?: string[] } = {}): Creature[] {
  return h.creatures.filter((c) => canFight(c) && !c.away && !c.injury && c.ill <= 0
    && (!o.dinoOnly || c.kind === 'dino') && !(o.exclude ?? []).includes(c.id));
}

/** GM "champion": the most famous (then highest level) available creature. */
export function champion(h: Ludus, o: { dinoOnly?: boolean; exclude?: string[] } = {}): Creature | undefined {
  return [...available(h, o)].sort((a, b) => b.fame - a.fame || b.level - a.level)[0];
}

/** Champion and second best. */
export function bestTwo(h: Ludus, o: { dinoOnly?: boolean } = {}): [Creature | undefined, Creature | undefined] {
  const list = [...available(h, o)].sort((a, b) => b.fame - a.fame || b.level - a.level);
  return [list[0], list[1]];
}

/** GM "most cunning favourite": a favourite if any, else the most cunning available dino. */
export function mostCunning(h: Ludus): Creature | undefined {
  const list = available(h, { dinoOnly: true });
  const favs = list.filter((c) => c.favourite);
  const pool = favs.length ? favs : list;
  return [...pool].sort((a, b) => rawStat(b, 'cun') - rawStat(a, 'cun') || b.level - a.level)[0];
}

export function strongestWeapon(h: Ludus): Gear | undefined {
  return h.armory.filter((g) => GEAR[g.type].slot === 'weapon').sort((a, b) => gearWorth(b) - gearWorth(a))[0];
}

export function rivalByKey(state: GameState, key: RivalKey): Ludus | undefined {
  return activeRivals(state).find((r) => r.ai?.key === key);
}

export function rivalById(state: GameState, id: string | undefined): Ludus | undefined {
  if (!id) return undefined;
  return state.rivals.find((r) => r.id === id && !r.defeated);
}

/** Visible, active rivals sorted by influence (strongest first). */
export function rivalsByInfluence(state: GameState): Ludus[] {
  return [...visibleRivals(state)].sort((a, b) => b.influence - a.influence);
}

export function strongestRival(state: GameState): Ludus | undefined {
  return rivalsByInfluence(state)[0];
}

export function weakestRival(state: GameState): Ludus | undefined {
  const l = rivalsByInfluence(state);
  return l[l.length - 1];
}

export function fewestCreaturesRival(state: GameState): Ludus | undefined {
  return [...visibleRivals(state)].sort((a, b) => a.creatures.length - b.creatures.length || a.influence - b.influence)[0];
}

/**
 * Story opinion change: a plain delta, as GM story choices apply it (rivals.changeOpinion adds the honesty
 * reaction meant for hostile actions, which story answers are not). Clamped like rivals.ts.
 */
export function shiftOpinion(r: Ludus | undefined, delta: number): void {
  if (r?.ai) r.ai.opinion = Math.max(-100, Math.min(100, r.ai.opinion + delta));
}

export function hatedOf(state: GameState, r: Ludus): Ludus | undefined {
  const k = r.ai?.hatedRival;
  return k ? rivalByKey(state, k) : undefined;
}

/** GM hasSenatorInfluence: Lobby the Senate (or any higher Senate rank). */
export function hasSenateInfluence(state: GameState): boolean {
  const p = state.player;
  return p.senator || p.consul || p.opportunities.some((o) => o === 'lobbySenate' || o === 'electedSenator' || o === 'princepsSenatus' || o === 'consul');
}

/** Find a named legend anywhere (houses, Horde) by legend key or name. */
export function findLegend(state: GameState, key: string): { creature: Creature; house?: Ludus } | undefined {
  const k = key.toLowerCase();
  const match = (c: Creature) => c.legend === key || c.legend?.toLowerCase() === k || c.name.toLowerCase() === k;
  for (const h of [state.player.ludus, ...state.rivals, state.unknown]) {
    const c = h.creatures.find(match);
    if (c) return { creature: c, house: h };
  }
  const r = state.world.horde.rogues.find(match);
  return r ? { creature: r } : undefined;
}

export function hasAnyTrait(c: Creature, traits: TraitId[]): boolean {
  return traits.some((t) => c.traits.includes(t));
}

export function topFame(h: Ludus): number {
  return h.creatures.reduce((m, c) => Math.max(m, c.fame), 0);
}

/** Move a creature between houses, dropping its gear assignments. */
export function moveCreature(from: Ludus, to: Ludus, c: Creature): void {
  from.creatures = from.creatures.filter((x) => x.id !== c.id);
  from.pairs = from.pairs.filter((p) => p.maleId !== c.id && p.femaleId !== c.id);
  if (from.doctoreId === c.id) from.doctoreId = undefined;
  if (from.bondedId === c.id) from.bondedId = undefined;
  c.gear = {};
  c.away = undefined;
  to.creatures.push(c);
}

/** Level-up by raw XP (no age/class multipliers), spending points by weights. Used for bosses and AI buffs. */
export function bossXp(c: Creature, amount: number): void {
  if (amount <= 0) return;
  c.xp += amount;
  while (c.xp >= xpForLevel(c.level + 1)) {
    c.level++;
    c.statPoints++;
    if (c.level % 3 === 0) c.techPoints++;
  }
  autoSpendStatPoints(c);
}

/** One-shot guard keyed in world flags. */
export function once(state: GameState, key: string): boolean {
  const k = `once:${key}`;
  if (state.world.flags[k]) return false;
  state.world.flags[k] = true;
  return true;
}

export function dominusTitle(state: GameState): string {
  return state.player.female ? 'domina' : 'dominus';
}
