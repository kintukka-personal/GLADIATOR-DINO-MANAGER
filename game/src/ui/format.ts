// Formatting helpers shared by every screen.

import type { Creature, Stat, Stats, Egg } from '../engine/types';
import { SPECIES } from '../engine/data/species';

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const signed = (n: number): string => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0');
export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;
export const plural = (n: number, one: string, many = `${one}s`): string => `${fmt(n)} ${n === 1 ? one : many}`;
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const STAT_LABEL: Record<Stat, string> = { str: 'Strength', agi: 'Agility', cun: 'Cunning', hp: 'Health' };
export const STAT_SHORT: Record<Stat, string> = { str: 'STR', agi: 'AGI', cun: 'CUN', hp: 'HP' };
export const STAT_COLOR: Record<Stat, string> = { str: 'var(--bad)', agi: 'var(--good)', cun: 'var(--info)', hp: 'var(--warn)' };

export const REGION_NAMES = ['Body', 'Underbelly', 'Pattern', 'Crest & horns', 'Back & plates', 'Eyes & claws'];

export const SIZE_NAME: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', H: 'Huge' };

export function speciesName(id: Creature['species']): string {
  return SPECIES[id]?.name ?? id;
}

export function camelToWords(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export function sumStats(s: Stats): number {
  return s.str + s.agi + s.cun + s.hp;
}

export function eggRange(e: Egg): [number, number] {
  return SPECIES[e.species].tempRange;
}

export function eggAtRisk(e: Egg): boolean {
  if (!e.fertilized || e.lastTemp === undefined) return false;
  const [lo, hi] = eggRange(e);
  return e.lastTemp < lo || e.lastTemp > hi;
}

/** Deterministic 32-bit hash of a string (pattern seeds, idle animation offsets). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function weeksLabel(n: number): string {
  return n === 1 ? '1 week' : `${n} weeks`;
}
