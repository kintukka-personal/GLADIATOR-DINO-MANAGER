// Pre-battle bribes/cheats and betting. OWNER: systems-politics agent. GM 05 §2.
import type { CheatType, GameState, Ludus, Tournament } from './types';

export function cheatCost(state: GameState, t: Tournament | undefined, type: CheatType, ownCount: number, enemyCount: number): number { throw new Error('not implemented'); }
export function cheatAvailable(state: GameState, t: Tournament | undefined, type: CheatType, ownCount: number): string | null { throw new Error('not implemented'); }
/** GM howLikelyToCheatAgainst + rand(8) + L > 9. Returns the cheat the AI uses, if any. */
export function aiCheatChoice(state: GameState, r: Ludus, t: Tournament | undefined, ownCount: number, enemyCount: number): CheatType | null { throw new Error('not implemented'); }
/** GM betting multiplier table. */
export function betMultiplier(odds: number): number { throw new Error('not implemented'); }
