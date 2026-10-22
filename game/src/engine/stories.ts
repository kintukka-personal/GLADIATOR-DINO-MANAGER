// Storylines (19 GM + stud request) as chat conversations. OWNER: systems-story agent. GM 04 §3–4.
import type { GameState, ID, StoryConversation, StoryLineId } from './types';

/** Weekly: rival-initiated storylines (determineStoryLine), Spartacus/Pythia/Hag/etc triggers. Queues conversations. */
export function storyWeek(state: GameState): void { throw new Error('not implemented'); }
/** First ready conversation (shown as a portrait bubble on the hub). */
export function activeConversation(state: GameState): StoryConversation | null { throw new Error('not implemented'); }
export function answerConversation(state: GameState, id: ID, option: number): { text: string; battle?: import('./types').BattleResult } { throw new Error('not implemented'); }
/** Hooks called by other systems (tournament result vs Solonius, sabotage on Batiatus, kills for murder plot…). */
export function storyHook(state: GameState, hook: string, data?: Record<string, unknown>): void { throw new Error('not implemented'); }
export function storyProgress(state: GameState, s: StoryLineId): number { return state.player.stories[s] ?? 0; }
