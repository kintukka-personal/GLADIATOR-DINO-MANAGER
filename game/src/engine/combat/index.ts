// Combat engine public API. OWNER: combat agent. See docs 01-combat.md (GM formulas) and DESIGN.md §5.
// Implementation: combatant.ts (Combatant build), battle.ts (round loop, attacks, damage, outcomes),
// techniques.ts (31 techniques), statuses.ts (effects and resists), gearSelect.ts (battle gear), apply.ts (write-back).

import type { BattleOptions, BattleResult, BattleSide, Creature } from '../types';
import { worth } from '../creature';
import { resolveBattle as resolve } from './battle';
import { applyBattleResult as apply, type ApplyContext } from './apply';

export type { PrepOptions, SideOptions } from './gearSelect';
export { prepareFighter, buildSide, slotFits, makeMandrake, minotaurHammer } from './gearSelect';
export type { ApplyContext } from './apply';
export { applyBattleResult, EGG_STAGES } from './apply';
export { resolveBattle, rollInjury, bandage, Battle } from './battle';
export type { ResolveExtra } from './battle';
export { darkFangsStage, heirloomBonus, profTier, profBonus, profFamily } from './combatant';
export type { CombatOutcome } from './model';

/** Armor damage reduction (GM 01 §7): A / √(A² + 900). */
export function armorReduction(armor: number): number {
  const a = Math.max(0, armor);
  return a / Math.sqrt(a * a + 900);
}

/** Convenience: prepare, resolve and apply in one call. */
export function fight(ctx: ApplyContext, sides: [BattleSide, BattleSide], opts: BattleOptions): BattleResult {
  const r = resolve(sides, opts, { exhibition: ctx.exhibition });
  apply(ctx, sides, r);
  return r;
}

/** Team strength estimate used by AI and betting odds (GM: Σ(worth+10)). */
export function teamWorth(creatures: Creature[]): number {
  return creatures.reduce((s, c) => s + worth(c) + 10, 0);
}
