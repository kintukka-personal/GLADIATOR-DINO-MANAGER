// Training, doctore, sparring, weekly trait gain. OWNER: world-economy agent. GM 03 §3.2–3.4.
import type { Creature, GameState, ID, Ludus } from './types';

/** GM DoctoreBonus = (2×level + 3) + CUN (×1.5 Doctore trait, +2 if best stat CUN). */
export function doctoreBonus(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
/** Weekly training XP a creature would receive (for UI projection). */
export function projectedTrainingXp(state: GameState, h: Ludus, c: Creature): number { throw new Error('not implemented'); }
/** Number of sparring sessions available (1 + doctore thresholds). */
export function sparringSlots(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
/** Run a sparring match now (player action): both gain 5×(L1+L2) XP; injuries −2. Returns battle result for viewing. */
export function spar(state: GameState, h: Ludus, aId: ID, bId: ID): import('./types').BattleResult | string { throw new Error('not implemented'); }
/** Per-creature weekly training (XP, class XP, training injuries, side effects, proficiency, doctore teaching). */
export function trainingWeek(state: GameState, h: Ludus): void { throw new Error('not implemented'); }
/** GM Gladiator.WeekPassed: weekly trait roll, species level 0→1, injury and illness healing, wound traits. */
export function weekPassed(state: GameState, h: Ludus, c: Creature): void { throw new Error('not implemented'); }
/** Auto-pick doctore for AI (highest level) / validate player doctore. */
export function chooseDoctore(state: GameState, h: Ludus): void { throw new Error('not implemented'); }
