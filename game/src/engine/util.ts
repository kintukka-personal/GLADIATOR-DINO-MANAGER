// Small shared helpers: ids, stat blocks, house lookup.

import type { Creature, GameState, ID, Ludus, Stats, UpgradeId, WeaponFamily, Message, MessageSender, WeekReportEntry } from './types';
import { rand } from './rng';

let counter = 1;

export function setIdCounter(n: number): void {
  counter = Math.max(counter, n);
}
export function getIdCounter(): number {
  return counter;
}

export function newId(prefix = 'x'): ID {
  counter++;
  return `${prefix}${counter.toString(36)}${rand(46656).toString(36)}`;
}

export const zeroStats = (): Stats => ({ str: 0, agi: 0, cun: 0, hp: 0 });
export const addStats = (a: Stats, b: Partial<Stats>): Stats => ({
  str: a.str + (b.str ?? 0), agi: a.agi + (b.agi ?? 0), cun: a.cun + (b.cun ?? 0), hp: a.hp + (b.hp ?? 0),
});
export const sumStats = (s: Stats): number => s.str + s.agi + s.cun + s.hp;

export const zeroProf = (): Record<WeaponFamily, number> => ({ claw: 0, fang: 0, horn: 0, mace: 0, spit: 0, jaw: 0, whip: 0 });

/** Every house in the world, player first. */
export function allHouses(state: GameState): Ludus[] {
  return [state.player.ludus, ...state.rivals, state.unknown];
}

export function activeRivals(state: GameState): Ludus[] {
  return state.rivals.filter((r) => !r.defeated);
}

export function visibleRivals(state: GameState): Ludus[] {
  return state.rivals.filter((r) => !r.defeated && (r.ai?.visible ?? true));
}

export function houseById(state: GameState, id: ID | undefined): Ludus | undefined {
  if (!id) return undefined;
  return allHouses(state).find((h) => h.id === id);
}

export function findCreature(state: GameState, id: ID): { creature: Creature; house?: Ludus } | undefined {
  for (const h of allHouses(state)) {
    const c = h.creatures.find((x) => x.id === id);
    if (c) return { creature: c, house: h };
  }
  const r = state.world.horde.rogues.find((x) => x.id === id);
  if (r) return { creature: r };
  return undefined;
}

export function ownerOf(state: GameState, c: Creature): Ludus | undefined {
  return allHouses(state).find((h) => h.creatures.includes(c));
}

export function hasUpgrade(state: GameState, id: UpgradeId): boolean {
  return state.unlocks.includes(id) || state.world.difficulty.sandbox;
}

export function isPlayerHouse(state: GameState, h: Ludus): boolean {
  return h === state.player.ludus;
}

export function message(state: GameState, sender: MessageSender, title: string, text: string): Message {
  const m: Message = { id: newId('m'), week: state.world.week, sender, title, text, read: false };
  state.player.messages.unshift(m);
  if (state.player.messages.length > 120) state.player.messages.length = 120;
  return m;
}

export function report(state: GameState, kind: WeekReportEntry['kind'], text: string, amount?: number): void {
  state.report.push({ kind, text, amount });
}

export function achieve(state: GameState, id: import('./types').AchievementId): void {
  if (state.world.difficulty.sandbox) return; // custom games never earn achievements (GM)
  if (!state.pendingAchievements.includes(id)) state.pendingAchievements.push(id);
}

export function difficultyKey(state: GameState): 'normal' | 'hard' | 'nightmare' {
  const d = state.world.difficulty;
  return d.nightmare ? 'nightmare' : d.hard ? 'hard' : 'normal';
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Ascension level check, GM isMinimum<God>Ascension (≥). */
export function asc(state: GameState, level: number): boolean {
  return state.world.ascension >= level;
}

export const ASC = {
  saturn: 1, vulcan: 2, sol: 3, neptune: 4, minerva: 5, venus: 6, diana: 7, pluto: 8, jupiter: 9, juno: 10,
  mars: 11, apollo: 12, gaia: 13, hyperion: 14, tartarus: 15, cronus: 16,
} as const;
