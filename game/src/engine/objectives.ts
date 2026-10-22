// Objectives & the "Getting started" guidance chain. OWNER: systems-story agent. GM 03 §9.
import type { GameState, ObjectiveId, ObjectiveState } from './types';

export interface ObjectiveDef { id: ObjectiveId; title: string; desc: string; reward: string }
export const OBJECTIVES: Partial<Record<ObjectiveId, ObjectiveDef>> = {};
export function seedObjectives(state: GameState): void { throw new Error('not implemented'); }
/** Weekly + on-action progress checks; spawns objectives whose window opens. */
export function checkObjectives(state: GameState): void { throw new Error('not implemented'); }
export function claimObjective(state: GameState, id: ObjectiveId): string | null { throw new Error('not implemented'); }
/** Instant progress from UI actions (bought creature, learned technique, registered…). */
export function objectiveEvent(state: GameState, event: string): void { throw new Error('not implemented'); }
export function objectiveDef(id: ObjectiveId): ObjectiveDef | undefined { return OBJECTIVES[id]; }
export type { ObjectiveState };
