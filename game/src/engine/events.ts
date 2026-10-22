// Random weekly decision events (~60) and delayed outcomes. OWNER: systems-story agent. GM 04 §6–7.
import type { BattleResult, Decision, GameState, ID } from './types';

export interface EventDef {
  key: string;
  /** eligibility + build (returns null when not eligible) */
  make: (state: GameState) => Decision | null;
  /** apply the chosen option; may fight a street battle and return it for viewing */
  resolve: (state: GameState, d: Decision, option: number) => { text: string; battle?: BattleResult };
  weight?: number;
  /** election-campaign-only event */
  campaign?: boolean;
}
export const EVENTS: EventDef[] = [];
/** GM DecisionFactory.getRandomDecision: underworld attack, rebel raid priority, then one eligible event not in history. */
export function drawWeeklyDecision(state: GameState): Decision | null { throw new Error('not implemented'); }
export function resolveDecision(state: GameState, decisionId: ID, option: number): { text: string; battle?: BattleResult } { throw new Error('not implemented'); }
/** Resolve delayed outcomes whose week has come. */
export function delayedWeek(state: GameState): void { throw new Error('not implemented'); }
/** Drop decisions older than 7 weeks. */
export function expireDecisions(state: GameState): void { throw new Error('not implemented'); }
