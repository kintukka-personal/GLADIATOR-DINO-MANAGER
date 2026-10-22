// Rival houses: seeding, personalities, AI weekly routine, catch-up help. OWNER: world-arena agent. GM 03 §5.
import type { GameState, Ludus, RivalKey } from './types';

/** Seed Batiatus, Solonius, Decimus, Magnus, Vettius (hidden) and the Unknown house (GM Seed.CreateOpponents), dino rosters. */
export function seedRivals(state: GameState): void { throw new Error('not implemented'); }
/** Create a named late rival (Caesar, Crassus, Hannibal) or a random house. */
export function spawnRival(state: GameState, key: RivalKey): Ludus { throw new Error('not implemented'); }
/** GM helpOpponents catch-up for one rival. */
export function helpRival(state: GameState, r: Ludus): void { throw new Error('not implemented'); }
/** GM Opponent.ResolveAIWeekCascading (surgery, rewards, loan, construction, slaves/keepers, recruitment, gear, selling, keeper jobs, manage creatures, organise, invest, breeding). The shared economy/training/loyalty steps are called by week.ts. */
export function rivalWeek(state: GameState, r: Ludus): void { throw new Error('not implemented'); }
/** Weekly default-house refill (Unknown: 200 denarii, refills fighters). */
export function unknownWeek(state: GameState): void { throw new Error('not implemented'); }
/** Rival bids for player creatures of their favourite type / flagged "offer to rivals" (messages). */
export function rivalBids(state: GameState): void { throw new Error('not implemented'); }
export function opinionLabel(opinion: number): string { throw new Error('not implemented'); }
/** Opinion change with honesty reaction when the player acts against a rival (fall-through bug fixed). */
export function changeOpinion(state: GameState, r: Ludus, delta: number): void { throw new Error('not implemented'); }
/** Remove defeated houses, herald messages, Crassus replacement, refill to 4 rivals every 6 weeks. */
export function cleanupRivals(state: GameState): void { throw new Error('not implemented'); }
/** Instruction an AI house gives in a battle vs the player (GM 01 §21). */
export function aiInstruction(state: GameState, r: Ludus, playerScoreDiff: number, live: boolean): import('./types').Instruction { throw new Error('not implemented'); }
