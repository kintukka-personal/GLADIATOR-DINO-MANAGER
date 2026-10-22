// Influence opportunity tree, toggles, elections, laws. OWNER: systems-politics agent. GM 05 §3.
import type { GameState, Ludus, OpportunityId } from './types';

export interface OpportunityDef { id: OpportunityId; name: string; path: 'lanista' | 'senator' | 'trickster'; tier: number; desc: string; toggle?: boolean; alt?: OpportunityId[] }
export const OPPORTUNITIES: Record<OpportunityId, OpportunityDef> = {} as Record<OpportunityId, OpportunityDef>;
/** Tree as shown for this run (alternates chosen by treeSeed). */
export function treeFor(state: GameState): OpportunityDef[][] { throw new Error('not implemented'); }
export function nextOpportunityCost(state: GameState): number { throw new Error('not implemented'); }
export function availableInfluence(h: Ludus): number { throw new Error('not implemented'); }
export function canUnlock(state: GameState, id: OpportunityId): string | null { throw new Error('not implemented'); }
export function unlock(state: GameState, id: OpportunityId): string | null { throw new Error('not implemented'); }
export function setToggle(state: GameState, key: 'publicSessions' | 'bribeGeneral' | 'loan', on: boolean): string | null { throw new Error('not implemented'); }
export function hasOpp(state: GameState, id: OpportunityId): boolean { throw new Error('not implemented'); }
/** GM Public Sessions income (also paid free to AI rivals every week as "commoner tourists"). */
export function publicSessionsIncome(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
/** GM influenceLoyaltyEffect (−2 … +12/+15). */
export function influenceLoyaltyEffect(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
export function startElection(state: GameState, office: 'senate' | 'consul'): string | null { throw new Error('not implemented'); }
export function setElectionAction(state: GameState, o: { smear?: boolean; campaigners?: string[] }): void { throw new Error('not implemented'); }
/** Weekly vote progress; returns a result card when decided. */
export function electionWeek(state: GameState): import('./types').ResultCard | null { throw new Error('not implemented'); }
/** Bribe General weekly prisoner offers, senator influence ticks etc. */
export function influenceWeek(state: GameState): void { throw new Error('not implemented'); }
