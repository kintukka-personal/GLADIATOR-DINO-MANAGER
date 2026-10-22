// Creature management actions. OWNER: world-economy agent. GM 05 §4.2, 02 §10.4, 03 §10.3, 01 §14.
import type { ClassId, Creature, GameState, GearSlot, ID, Stat, TechId, TraitId } from './types';

export function assignGear(state: GameState, creatureId: ID, slot: GearSlot, gearId: ID | null): string | null { throw new Error('not implemented'); }
/** Use an item that acts on assign (Silphium, Bestiary Scroll, Bottled Lightning, Amber Shard, Mutagen). Returns choices for scroll/silphium. */
export function useItem(state: GameState, creatureId: ID, gearId: ID, choice?: TraitId | TechId): { ok: boolean; text: string; choices?: (TraitId | TechId)[] } { throw new Error('not implemented'); }
export function setClass(state: GameState, creatureId: ID, cls: ClassId | null): string | null { throw new Error('not implemented'); }
export function spendPoint(state: GameState, creatureId: ID, stat: Stat): string | null { throw new Error('not implemented'); }
export function learnTech(state: GameState, creatureId: ID, tech: TechId): string | null { throw new Error('not implemented'); }
export function toggleTech(state: GameState, creatureId: ID, tech: TechId): string | null { throw new Error('not implemented'); }
export function setTechOrder(state: GameState, creatureId: ID, order: TechId[]): void { throw new Error('not implemented'); }
/** Bond (GM adoption): 25 denarii, fame > 20, one at a time. */
export function bond(state: GameState, creatureId: ID, newName?: string): string | null { throw new Error('not implemented'); }
/** Surgery at the Veterinarium: 100 denarii, removes a wound trait; can kill. */
export function surgery(state: GameState, creatureId: ID): { ok: boolean; text: string } { throw new Error('not implemented'); }
/** Beast treat: 10 denarii, once per week, +5 XP. */
export function treat(state: GameState, creatureId: ID): string | null { throw new Error('not implemented'); }
export function rename(state: GameState, creatureId: ID, name: string): string | null { throw new Error('not implemented'); }
/** Turn a creature loose to the wild (GM convert-to-slave analogue: +1 keeper as a handler pays you 50). */
export function retire(state: GameState, creatureId: ID): string | null { throw new Error('not implemented'); }
/** Resurrection through the Temple of Pluto (Reincarnated only, ascension ≥ 1 or sandbox). */
export function resurrect(state: GameState, tombId: ID): string | null { throw new Error('not implemented'); }
export function setDoctore(state: GameState, creatureId: ID | null): string | null { throw new Error('not implemented'); }
export function toggleFavourite(state: GameState, creatureId: ID): void { throw new Error('not implemented'); }
export function toggleOfferToRivals(state: GameState, creatureId: ID): void { throw new Error('not implemented'); }
/** Record a creature leaving the world (death, sale) into the ancestry registry and the tomb. */
export function bury(state: GameState, c: Creature, cause: string): void { throw new Error('not implemented'); }
