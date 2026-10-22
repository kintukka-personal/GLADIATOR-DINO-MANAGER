// Combat engine public API. OWNER: combat agent. See docs 01-combat.md (GM formulas) and DESIGN.md §5.
// Implementation files live in this folder (combatant.ts, battle.ts, techniques.ts, apply.ts, gearSelect.ts).

import type {
  BattleFighter, BattleOptions, BattleResult, BattleSide, Creature, GameState, GearSlot, ID, Instruction, Ludus,
  SideModifier, Tournament,
} from '../types';

export interface PrepOptions {
  riders: boolean;
  natural?: boolean;
  /** gear ids already used by other fighters in this battle (GM BattleEquipmentAvailability) */
  used?: Set<ID>;
  /** explicit gear choice for this battle; null = leave the slot empty; undefined = auto/assigned */
  override?: Partial<Record<GearSlot, ID | null>>;
}

/**
 * Resolve the gear a creature takes into battle: explicit override, else its assigned gear (creature.gear),
 * else auto-pick from the owner's armory (class preferred weapon, else by proficiency, highest worth) —
 * GM 01 §4 step 3. Dinos with no weapon fight bare-jawed (no weapon object). Beasts take no gear.
 * Riders only when opts.riders and the creature is not a kid. Natural (Primal Bout): no gear at all.
 */
export function prepareFighter(state: GameState, house: Ludus | undefined, c: Creature, instruction: Instruction | null, opts: PrepOptions): BattleFighter {
  throw new Error('combat.prepareFighter not implemented');
}

/** Build a side from creatures of one house (or none for scripted foes). */
export function buildSide(state: GameState, house: Ludus | undefined, creatures: Creature[], instructions: Record<ID, Instruction | null> | Instruction | null, opts: PrepOptions & { name?: string; modifiers?: SideModifier[]; injuryMod?: number; player?: boolean }): BattleSide {
  throw new Error('combat.buildSide not implemented');
}

/**
 * Simulate a battle (GM Battle.ResolveBattle). Must not mutate the creatures (work on transient combatants),
 * except reading them. Returns a full structured log for the animated viewer plus per-fighter outcomes
 * (injury rolls, death, XP, fame, loyalty, trait unlocks) that applyBattleResult will write back.
 */
export function resolveBattle(sides: [BattleSide, BattleSide], opts: BattleOptions): BattleResult {
  throw new Error('combat.resolveBattle not implemented');
}

export interface ApplyContext {
  state: GameState;
  tournament?: Tournament;
  /** event/adventure/raid battle */
  event?: boolean;
  sparring?: boolean;
  /** skip injury/death (exhibition) */
  exhibition?: boolean;
  /** cause of death text for the tomb */
  deathCause?: string;
}

/**
 * Write a BattleResult back onto the real creatures and houses: XP (grantXp), fame, tameness, injuries,
 * deaths (remove from house → player's tomb, ancestry fate, +50 burial denarii for the owner), consumed
 * poultices/antivenom, weapon proficiency gains, trait unlocks, career stats, killers, Dark Fangs hunger,
 * Mysterious Egg progress. Returns names of the dead.
 */
export function applyBattleResult(ctx: ApplyContext, sides: [BattleSide, BattleSide], result: BattleResult): string[] {
  throw new Error('combat.applyBattleResult not implemented');
}

/** Convenience: prepare, resolve and apply in one call. */
export function fight(ctx: ApplyContext, sides: [BattleSide, BattleSide], opts: BattleOptions): BattleResult {
  const r = resolveBattle(sides, opts);
  applyBattleResult(ctx, sides, r);
  return r;
}

/** Team strength estimate used by AI and betting odds (GM: Σ(worth+10)). */
export function teamWorth(creatures: Creature[]): number {
  throw new Error('combat.teamWorth not implemented');
}
