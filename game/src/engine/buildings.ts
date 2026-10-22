// Estate construction. OWNER: world-economy agent. GM 02 §8 + DESIGN.md §7 (breeding buildings).
import type { BuildingId, GameState, Ludus } from './types';

export interface BuildingLevelDef {
  denarii: number; keepers: number; creatures: number; influence: number; residence: number;
}
export interface BuildingDef {
  id: BuildingId;
  name: string;
  location: 'capua' | 'ariminium' | 'rome';
  levels: BuildingLevelDef[];      // index 0 = cost to build level 1
  upgrade?: import('./types').UpgradeId;
  /** per-level upgrade gates (e.g. forge L2 needs masterSmith) */
  levelUpgrades?: (import('./types').UpgradeId | undefined)[];
  /** only reachable via event/story at level 1 */
  eventOnlyFirst?: boolean;
  desc: string[];                  // benefit text per level
}
export const BUILDINGS: Record<BuildingId, BuildingDef> = {} as Record<BuildingId, BuildingDef>;

export interface BuildingTotals {
  influence: number; denarii: number; beds: number; facilities: number; trainingPct: number; security: number;
  mineEfficiency: number; spiesUnlocked: boolean; forgeTier: number; surgeries: number; injuryReduction: number;
  favoured: boolean; pairs: number; eggSlots: number; tempControl: number; nurserySlots: number; kitchen: boolean;
}
/** Sum of every building's benefits (GM 02 §8.3; Bath House benefits DO apply in Jurassic Ludus). */
export function buildingTotals(h: Ludus): BuildingTotals { throw new Error('buildingTotals not implemented'); }
/** Construction check: one build per week; thresholds; ascension surcharge; upgrade gates. */
export function canBuild(state: GameState, h: Ludus, id: BuildingId): { ok: boolean; reason?: string; cost: number } { throw new Error('canBuild not implemented'); }
export function build(state: GameState, h: Ludus, id: BuildingId): string | null { throw new Error('build not implemented'); }
/** GM loseRandomBuilding cascade; returns name of the building that lost a level, if any. */
export function loseRandomBuilding(h: Ludus): BuildingId | null { throw new Error('loseRandomBuilding not implemented'); }
/** Sum of all building levels (GM "construction level"). */
export function constructionLevel(h: Ludus): number { throw new Error('constructionLevel not implemented'); }
