// Forge, reforge, repair, workshop. OWNER: world-economy agent. GM 02 §7.
import type { GameState, Gear, GearTypeId, ID, Quality } from './types';

export interface ForgeOption { type: GearTypeId; quality: Quality; cost: number; locked: boolean; reason?: string }
export function forgeCatalog(state: GameState): ForgeOption[] { throw new Error('not implemented'); }
/** Forge new gear (rand(10) outcome; Forge 3 augments). Returns the new gear or an error string. */
export function forgeItem(state: GameState, type: GearTypeId): Gear | string { throw new Error('not implemented'); }
export function reforgeCost(state: GameState, g: Gear): number | null { throw new Error('not implemented'); }
/** Reforge: rand(10)+forge level ≥ quality+1 → up one tier (or augment at MC). Money spent either way. */
export function reforge(state: GameState, id: ID): { ok: boolean; text: string } { throw new Error('not implemented'); }
export function repairCost(state: GameState, g: Gear): number | null { throw new Error('not implemented'); }
export function repair(state: GameState, id: ID): { ok: boolean; text: string } { throw new Error('not implemented'); }
