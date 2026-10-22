// Pre-battle bribes/cheats and betting. OWNER: systems-politics agent. GM 05 §2.
//
// The tournament engineer applies the effects (PoisonedWeapons / Chained / escaped beast / guards) and
// charges the cost: cheatCost(state, t, type, own, enemy, house) for the paying house.
// GM quirk fixed: the AI champion comparison looks at every fighter, not only the last one on each side.

import type { CheatType, Creature, GameState, Ludus, Tournament } from './types';
import { rand } from './rng';
import { asc, ASC, hasUpgrade } from './util';
import { hasTrait } from './creature';
import { hasOpp } from './influence';

export const CHEAT_NAMES: Record<CheatType, { name: string; desc: string }> = {
  poison: { name: 'Poisoned weapons', desc: 'Smear venom on claws and harness spikes. Every damaging hit also poisons.' },
  chains: { name: 'Enchain opponents', desc: 'Bribe the handlers to hobble the enemy with leg chains. Their agility drops by two thirds.' },
  beast: { name: 'Release a wild beast', desc: 'A starving beast "escapes" into the sand on your side. Its level is the enemy levels combined, plus one.' },
  guards: { name: 'Replace the guards', desc: 'Your own men watch the gates. Nobody cheats against you, and any trick already paid for is undone.' },
};

/** Underground, Rookie and Junior events use the cheap rate. */
export function cheapRate(t: Tournament | undefined): boolean {
  return !!t && (t.underground || t.type === 'underground' || t.type === 'rookie' || t.type === 'junior');
}

/**
 * Cost of a cheat for the paying house (default: the player). Poison 30/20 per own fighter, chains 20/15 per
 * enemy, beast 80 (halved with Lobby the Senate or a senate seat), guards 25; ×2 for the player at Minerva.
 */
export function cheatCost(state: GameState, t: Tournament | undefined, type: CheatType, ownCount: number, enemyCount: number, payer?: Ludus): number {
  const h = payer ?? state.player.ludus;
  const cheap = cheapRate(t);
  let cost: number;
  switch (type) {
    case 'poison': cost = (cheap ? 20 : 30) * Math.max(0, ownCount); break;
    case 'chains': cost = (cheap ? 15 : 20) * Math.max(0, enemyCount); break;
    case 'beast': {
      cost = 80;
      if (h.isPlayer && (hasOpp(state, 'lobbySenate') || state.player.senator)) cost = Math.trunc(cost / 2);
      break;
    }
    case 'guards': cost = 25; break;
  }
  if (h.isPlayer && asc(state, ASC.minerva)) cost *= 2;
  return cost;
}

/** null if the player may use this cheat now, else the reason. Pass enemyCount to also check the purse. */
export function cheatAvailable(state: GameState, t: Tournament | undefined, type: CheatType, ownCount: number, enemyCount?: number): string | null {
  const underground = !!t && (t.underground || t.type === 'underground');
  if (type === 'beast') {
    if (!hasUpgrade(state, 'releaseBeast')) return 'Needs the Release Beast upgrade.';
    if (underground) return 'The pit masters keep their own beasts.';
    if (ownCount > 2) return 'Only for a side of two or fewer.';
  }
  if (type === 'guards') {
    if (!state.player.senator) return 'Only a senator can have the guards replaced.';
    if (underground) return 'There are no guards in the pits to replace.';
  }
  const cost = cheatCost(state, t, type, ownCount, enemyCount ?? 0);
  if ((type === 'poison' || type === 'guards' || type === 'beast' || enemyCount !== undefined) && state.player.ludus.denarii < cost) {
    return `Costs ${cost} denarii.`;
  }
  return null;
}

const CHAMPION_TRAITS = ['ArenaChampion', 'PitFighter', 'PitChampion'] as const;
const hasChampion = (list: Creature[]) => list.some((c) => CHAMPION_TRAITS.some((t) => hasTrait(c, t)));

/** GM howLikelyToCheatAgainst(player). own = the rival's fighters, enemy = the player's fighters. */
export function cheatLikelihood(state: GameState, r: Ludus, own: Creature[] = [], enemy: Creature[] = []): number {
  const ai = r.ai;
  let L = 0;
  if (state.player.ludus.influence > r.influence) L += 1;
  if (ai?.key === 'hannibal') L += 1;
  if (r.denarii > 500) L += 2;
  else if (r.denarii > 200) L += 1;
  else if (r.denarii < 100) L -= 1;
  const op = ai?.opinion ?? 50;
  if (op < 45) L += 1;
  if (op < 25) L += 1;
  if (op > 55) L -= 1;
  if (op > 75) L -= 1;
  if (asc(state, ASC.apollo)) L += 1;
  // champion comparison (every fighter, quirk fixed) and fame totals
  const myChamp = hasChampion(own);
  const theirChamp = hasChampion(enemy);
  if (theirChamp && !myChamp) L += 1;
  if (myChamp && !theirChamp) L -= 1;
  const famOwn = own.reduce((s, c) => s + c.fame, 0);
  const famEnemy = enemy.reduce((s, c) => s + c.fame, 0);
  if (own.length && enemy.length) {
    if (famEnemy > famOwn) L += 1;
    else if (famEnemy < famOwn) L -= 1;
  }
  switch (ai?.personality.honesty) {
    case 'neutral': L += 1; break;
    case 'dishonest': L += 3; break;
    case 'treacherous': L += 5; break;
    default: break;
  }
  return L;
}

/**
 * GM howLikelyToCheatAgainst + rand(8) + L > 9. Returns the cheat the AI uses, if any (from week 2).
 * Pure choice: the caller charges cheatCost(state, t, type, own, enemy, r) and applies it.
 * Optional own/enemy creature lists feed the champion and fame comparisons.
 */
export function aiCheatChoice(state: GameState, r: Ludus, t: Tournament | undefined, ownCount: number, enemyCount: number, own?: Creature[], enemy?: Creature[]): CheatType | null {
  if (state.world.week < 2 || r.isPlayer) return null;
  const L = cheatLikelihood(state, r, own ?? [], enemy ?? []);
  if (rand(8) + L <= 9) return null;
  const underground = !!t && (t.underground || t.type === 'underground');
  const isHannibal = r.ai?.key === 'hannibal';
  const beastCost = cheatCost(state, t, 'beast', ownCount, enemyCount, r);
  const canBeast = hasUpgrade(state, 'releaseBeast') && !underground && ownCount <= 2 && r.denarii >= beastCost;
  if (canBeast && L > 5 && rand(3) > 1 && !isHannibal) return 'beast';
  const chainCost = cheatCost(state, t, 'chains', ownCount, enemyCount, r);
  const poisonCost = cheatCost(state, t, 'poison', ownCount, enemyCount, r);
  if (enemyCount > 0 && r.denarii >= chainCost) {
    if (rand(2) === 0 && r.denarii >= poisonCost && ownCount > 0) return 'poison';
    return 'chains';
  }
  if (ownCount > 0 && r.denarii >= poisonCost) return 'poison';
  return null;
}

/** GM betting multiplier table (odds = Σ(worth+10) of the side you back minus the other). */
export function betMultiplier(odds: number): number {
  if (odds > 50) return 0.2;
  if (odds > 30) return 0.3;
  if (odds > 20) return 0.4;
  if (odds > 10) return 0.55;
  if (odds > 0) return 0.8;
  if (odds > -10) return 1.0;
  if (odds > -20) return 1.3;
  if (odds > -30) return 1.5;
  if (odds > -40) return 2;
  if (odds > -50) return 4;
  if (odds > -60) return 6;
  if (odds > -80) return 8;
  return 10;
}

export const BET_STAKES = [0, 20, 50, 100, 200] as const;

/** Total returned on a winning bet: stake × (1 + multiplier). Odds are from the backed side's point of view. */
export function betPayout(stake: number, odds: number): number {
  return Math.floor(stake * (1 + betMultiplier(odds)));
}

/** Betting needs the Gambler opportunity. Returns the stakes the player can afford. */
export function availableStakes(state: GameState): number[] {
  if (!hasOpp(state, 'gambler')) return [];
  return BET_STAKES.filter((s) => s <= state.player.ludus.denarii);
}
