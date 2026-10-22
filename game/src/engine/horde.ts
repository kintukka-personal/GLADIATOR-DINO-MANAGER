// The Wild Horde (rebels), Spartacus timeline, Senate armies, raids, expeditions. OWNER: systems-politics agent. GM 04 §8–9, 05 §6, 03 §1.3.
import type { BattleResult, Creature, Decision, GameState, ID, Ludus } from './types';

export function hordeSize(state: GameState): number { throw new Error('not implemented'); }
/** World-step rebel growth, spoils, Libertas, Senate intervention, rogue training, expeditions enabled, defeat check. */
export function hordeWeek(state: GameState): void { throw new Error('not implemented'); }
/** Scripted Spartacus beats (15/20/28/35 normal; 10/18/24/30 hard) and named rival arrivals (Caesar, Crassus). */
export function timelineWeek(state: GameState): void { throw new Error('not implemented'); }
/** Rebel raid roll; returns a Decision for the player (fight / pay / hide) or resolves a raid on a rival. */
export function rebelRaid(state: GameState): Decision | null { throw new Error('not implemented'); }
/** Player choice on a raid decision (option index). Fight returns a battle. */
export function resolveRaid(state: GameState, decision: Decision, option: number): { text: string; battle?: BattleResult } { throw new Error('not implemented'); }
/** Add an escaped creature to the Horde. */
export function joinHorde(state: GameState, c: Creature, from?: Ludus): void { throw new Error('not implemented'); }
export function expeditionPreview(state: GameState, o: { commanderId: ID; funds: number; keepers: number }): { militia: number; ok: string | null; label: string } { throw new Error('not implemented'); }
export function startExpedition(state: GameState, o: { commanderId: ID; funds: number; keepers: number; capture: boolean }): string | null { throw new Error('not implemented'); }
/** Weekly countdown; when it arrives returns the tactics choice (3 random tactics). */
export function expeditionWeek(state: GameState): void { throw new Error('not implemented'); }
export function resolveExpedition(state: GameState, tactic: string): { text: string; battle?: BattleResult; victory: boolean } { throw new Error('not implemented'); }
