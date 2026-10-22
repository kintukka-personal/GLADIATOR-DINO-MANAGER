// Tameness (loyalty), breakouts and uprisings. OWNER: world-economy agent. GM 05 §4, 03 §3.5.
import type { Creature, GameState, Ludus, ResultCard } from './types';

export interface LoyaltyBreakdown { total: number; parts: { label: string; amount: number }[] }
/** GM weekly loyalty change (+ imprint bonus: ≥50% +1, 100% +2; Iguanodon +1). */
export function loyaltyChange(state: GameState, h: Ludus, c: Creature): LoyaltyBreakdown { throw new Error('not implemented'); }
/** Apply weekly change to every creature; returns rebels that failed the stay check (rand(40)+10 ≤ loyalty). */
export function loyaltyWeek(state: GameState, h: Ludus): Creature[] { throw new Error('not implemented'); }
/** Resolve solo/coordinated breakout or uprising (GM Betrayal). May destroy the house ('uprising'). Escaped creatures join the Horde. */
export function resolveBreakouts(state: GameState, h: Ludus, rebels: Creature[]): ResultCard | null { throw new Error('not implemented'); }
/** Reward ("gift"): 50×(level/2+1) denarii, +40 tameness, grace, 10-week cooldown. */
export function rewardCreature(state: GameState, h: Ludus, c: Creature): string | null { throw new Error('not implemented'); }
/** Gear happiness drift (GM 9.6). */
export function gearHappinessWeek(state: GameState, h: Ludus, c: Creature): void { throw new Error('not implemented'); }
