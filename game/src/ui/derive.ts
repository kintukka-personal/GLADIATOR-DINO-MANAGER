// Derived reads that touch engine logic modules (stub-safe). Kept apart from format.ts so the art
// layer depends on data/* only.

import type { GameState, Ludus } from '../engine/types';
import { safe } from './safe';
import { buildingTotals, type BuildingTotals } from '../engine/buildings';
import { committedSpies, keeperCount } from '../engine/economy';

/** Fallback building totals mirroring DESIGN §7 for the breeding buildings, used while buildings.ts is a stub. */
export function fallbackTotals(h: Ludus): BuildingTotals {
  const b = h.buildings;
  const pen = b.breedingPen ?? 0;
  const hat = b.hatchery ?? 0;
  const nur = b.nursery ?? 0;
  return {
    influence: 0, denarii: 0, beds: 15, facilities: 3, trainingPct: 0, security: 0, mineEfficiency: 10,
    spiesUnlocked: (b.residence ?? 0) >= 2, forgeTier: b.forge ?? 0, surgeries: b.veterinarium ?? 0, injuryReduction: 0,
    favoured: (b.templeOfPluto ?? 0) > 0,
    pairs: [0, 1, 2, 4][pen] ?? 4,
    eggSlots: [0, 2, 4, 8][hat] ?? 8,
    tempControl: [0, 6, 12, 999][hat] ?? 999,
    nurserySlots: [1, 3, 6, 10][nur] ?? 10,
    kitchen: (b.kitchen ?? 0) > 0,
  };
}

export function totals(h: Ludus): BuildingTotals {
  return safe(() => buildingTotals(h), fallbackTotals(h));
}

export function keepersOf(h: Ludus): number {
  const k = h.keepers;
  return safe(() => keeperCount(h), k.unassigned + k.miners + k.showmen + k.wardens + k.spies);
}

export function spiesOf(state: GameState): number {
  const h = state.player.ludus;
  return safe(() => committedSpies(state, h), h.spiesLastWeek + ((h.buildings.guardTower ?? 0) > 0 ? 1 : 0));
}

