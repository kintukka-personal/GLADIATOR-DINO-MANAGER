// Ascension: 16 stacking god levels, the Ascension gauntlet, reincarnation. OWNER: systems-story agent. GM 03 §8.
import type { Creature, GameState, Meta } from './types';

export interface AscensionLevelDef { level: number; name: string; god: string; summary: string[] }
export const ASCENSION_LEVELS: AscensionLevelDef[] = [];
/** Start-of-run effects for every level ≤ current (fall-through). */
export function ascensionStartEffects(state: GameState): void { throw new Error('not implemented'); }
/** Weekly/timed effects for every level ≤ current. */
export function ascensionTurnEffects(state: GameState): void { throw new Error('not implemented'); }
/** GM hasAscensionRequirements: trophies (+senator) ≥ 4 (5 at Mars), horde defeated, shrine. */
export function ascensionProgress(state: GameState): { trophies: number; needed: number; hordeDefeated: boolean; shrine: boolean; ready: boolean } { throw new Error('not implemented'); }
/** Opponents for bonus round n of the Ascension tournament (GM table). */
export function ascensionFoes(state: GameState, round: number): Creature[] { throw new Error('not implemented'); }
/** Called when the player clears the Ascension tournament: account level, champion record, Ascended trait. */
export function onAscensionVictory(state: GameState, champion: Creature, meta: Meta): void { throw new Error('not implemented'); }
/** Build the reincarnated champion for a new run (young or old). */
export function reincarnate(champion: Creature, mode: 'young' | 'old', level: number, ascendancy: boolean): Creature { throw new Error('not implemented'); }
