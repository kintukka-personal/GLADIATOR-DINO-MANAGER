// Adventures (creatures sent away for scripted fights) incl. Wild Capture. OWNER: systems-story agent. GM 04 §8.
import type { Adventure, BattleResult, Creature, GameState, ID } from './types';

export function sendOnAdventure(state: GameState, key: string, creatureIds: ID[], weeks: number, data?: Record<string, unknown>, title?: string): Adventure { throw new Error('not implemented'); }
/** Countdown; finished adventures become pending results. */
export function adventureWeek(state: GameState): void { throw new Error('not implemented'); }
export interface AdventureResolution { adventure: Adventure; choices?: string[]; text: string }
/** Pending finished adventures waiting for the player. */
export function pendingAdventures(state: GameState): AdventureResolution[] { throw new Error('not implemented'); }
/** Resolve (with optional choice: Sphinx answer, Crocea Mors approach, Hannibal merchant…). */
export function resolveAdventure(state: GameState, adventureId: ID, choice?: number): { text: string; battle?: BattleResult; success: boolean } { throw new Error('not implemented'); }
/** Scripted foe roster for an adventure difficulty code (GM table). */
export function adventureFoes(state: GameState, key: string): Creature[] { throw new Error('not implemented'); }
