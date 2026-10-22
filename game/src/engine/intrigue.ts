// Intrigue: player actions vs rivals and rival schemes vs the player. OWNER: systems-politics agent. GM 05 §1.
import type { BattleResult, Creature, GameState, ID, IntrigueAction, IntrigueOrder, Ludus, PendingDefense } from './types';

export const SCENARIOS: { key: string; text: string }[] = [];
export function intrigueChance(state: GameState, action: IntrigueAction, agent: Creature, target: Ludus, targetCreature?: Creature): number { throw new Error('not implemented'); }
/** Agents available this week (active, fit, not away). */
export function availableAgents(state: GameState): Creature[] { throw new Error('not implemented'); }
/** Start an action: marks agent inactive, rolls the scenario the player must Proceed/Retreat on. */
export function planIntrigue(state: GameState, action: IntrigueAction, agentId: ID, targetHouseId: ID, targetCreatureId?: ID): IntrigueOrder | string { throw new Error('not implemented'); }
/** Resolve after Proceed/Retreat. Raid returns a battle. */
export function resolveIntrigue(state: GameState, orderId: ID, decision: 'proceed' | 'retreat'): { text: string; success: boolean; battle?: BattleResult } { throw new Error('not implemented'); }
/** Each rival rolls rand(120) − opinion/2 to scheme against the player; queues PendingDefense entries. */
export function rivalSchemes(state: GameState, r: Ludus): void { throw new Error('not implemented'); }
export const DEFENSE_PROMPTS: { key: string; text: string; assertive: string; passive: string }[] = [];
/** Player answers a defender prompt; resolves the rival action. */
export function resolveDefense(state: GameState, defenseId: ID, choice: 'assertive' | 'passive'): string { throw new Error('not implemented'); }
