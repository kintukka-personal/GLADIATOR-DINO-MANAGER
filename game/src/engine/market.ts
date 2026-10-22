// Markets & trading. OWNER: world-economy agent. GM 02 §11, 03 §3.1.
import type { Creature, Egg, FoodId, GameState, Gear, ID, Ludus, TransferOffer } from './types';

/** Weekly regeneration of every market list (GM World.AppendWeek step 8) incl. keepers, eggs and food prices. */
export function regenerateMarkets(state: GameState): void { throw new Error('not implemented'); }
/** Week-1 market: starters + Aello. */
export function seedStarterMarket(state: GameState): void { throw new Error('not implemented'); }
export function buyCreature(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
/** Sell to the market for salePrice(); creature reappears in the market. */
export function sellCreature(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
export function buyGear(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
export function sellGear(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
export function buyFood(state: GameState, food: FoodId, n: number): string | null { throw new Error('not implemented'); }
export function buyEgg(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
export function sellEgg(state: GameState, id: ID): string | null { throw new Error('not implemented'); }
/** Player offer to a rival for one of its creatures or gear (one offer per rival per week). Returns outcome text and whether accepted. */
export function offerToRival(state: GameState, rivalId: ID, itemId: ID, amount: number): { ok: boolean; text: string; counter?: number } { throw new Error('not implemented'); }
/** What the rival wants for a creature/gear (GM valuation × opinion multiplier). */
export function rivalAskingPrice(state: GameState, rival: Ludus, itemId: ID): number { throw new Error('not implemented'); }
/** Accept a rival's bid for one of your creatures (message offer). */
export function acceptTransfer(state: GameState, offerId: ID): string | null { throw new Error('not implemented'); }
/** Is this gear/creature locked behind an upgrade the player lacks? */
export function isLocked(state: GameState, item: Gear | Creature): boolean { throw new Error('not implemented'); }
export function marketCreaturePrice(state: GameState, c: Creature): number { throw new Error('not implemented'); }
export function marketGearPrice(state: GameState, g: Gear): number { throw new Error('not implemented'); }
/** Traveling merchant (upgrade) offers. */
export function rollMerchant(state: GameState): void { throw new Error('not implemented'); }
export function buyFromMerchant(state: GameState, index: number): string | null { throw new Error('not implemented'); }
