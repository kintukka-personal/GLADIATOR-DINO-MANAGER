// Writing a BattleResult back onto creatures and houses (GM Battle.handleAllInjuriesAndRewards, 01 §13, §22).

import type {
  BattleFighter, BattleResult, BattleSide, Creature, GameState, Gear, GearTypeId, Ludus, Tournament, WeaponFamily,
} from '../types';
import { addTrait, grantXp, hasTrait, makeCreature, removeTrait } from '../creature';
import { GEAR, gearHas } from '../data/gear';
import { SPECIES } from '../data/species';
import { clamp, rand, chance } from '../rng';
import { houseById, message, ownerOf, report } from '../util';
import { bury } from '../care';
import { darkFangsStage, profFamily } from './combatant';
import type { CombatOutcome } from './model';

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

/** Mysterious Egg stages kept in gear.state: −1 petrified, 0 dormant, 1 glowing, 2 cracked, 3 hatching; next progress hatches. */
export const EGG_STAGES = ['dormant', 'glowing', 'cracked', 'hatching'] as const;

/** Remove a consumed single-use item and auto-assign the next one of the same type (GM bandage behaviour). */
function consume(house: Ludus | undefined, c: Creature, used: Gear | null | undefined, type: GearTypeId): void {
  if (!house) return;
  const g = used && used.type === type ? used : house.armory.find((x) => x.id === c.gear.item && x.type === type);
  if (!g) return;
  house.armory = house.armory.filter((x) => x.id !== g.id);
  if (c.gear.item === g.id) delete c.gear.item;
  const taken = new Set<string>();
  for (const o of house.creatures) for (const id of Object.values(o.gear)) if (id) taken.add(id);
  const next = house.armory.find((x) => x.type === type && !taken.has(x.id));
  if (next) c.gear.item = next.id;
}

function gainProf(c: Creature, f: WeaponFamily, n: number): void {
  if (n > 0) c.prof[f] = (c.prof[f] ?? 0) + n;
}

/** Weapon proficiency (GM 01 §17): winner +2 main (+1 main +1 off-hand when dual), loser +1; Iguanodon +1 per gain. */
function proficiency(c: Creature, bf: BattleFighter, won: boolean): void {
  if (c.kind === 'beast') return;
  const w = bf.gear.weapon ?? null;
  const off = bf.gear.offhand ?? null;
  const offWeapon = !!off && GEAR[off.type]?.slot === 'weapon';
  const main = profFamily(c, w);
  const iguana = c.species === 'iguanodon' ? 1 : 0;
  if (won) {
    if (offWeapon) {
      gainProf(c, main, 1 + iguana);
      gainProf(c, profFamily(c, off), 1 + (iguana && rand(2) === 0 ? 1 : 0));
    } else {
      gainProf(c, main, 2 + iguana);
    }
  } else {
    gainProf(c, main, 1 + iguana);
  }
}

function armoryPiece(house: Ludus | undefined, g: Gear | null | undefined): Gear | null {
  if (!g) return null;
  return house?.armory.find((x) => x.id === g.id) ?? g;
}

function hatchWyvern(state: GameState, house: Ludus | undefined, carrier: Creature, egg: Gear): void {
  if (!house) return;
  const w = makeCreature({ species: 'wyvern' });
  for (const t of SPECIES.wyvern.natural) if (!w.techniques.some((x) => x.id === t)) w.techniques.push({ id: t, rank: 1, equipped: true });
  w.hatchedAt = house.name;
  w.bornWeek = state.world.week;
  w.loyalty = 90;
  house.creatures.push(w);
  house.armory = house.armory.filter((x) => x.id !== egg.id);
  if (carrier.gear.item === egg.id) delete carrier.gear.item;
  addTrait(carrier, 'LifeBringer');
  if (house.isPlayer) {
    message(state, 'hatchery', 'The egg hatched!', `In the heat of battle the Mysterious Egg cracked open on ${carrier.name}'s back. `
      + `A wyvern, ${w.name}, crawled out, screeching for meat. ${carrier.name} has become a Life Bringer.`);
    report(state, 'good', `A wyvern, ${w.name}, hatched from the Mysterious Egg.`);
  }
}

function eggProgress(state: GameState, house: Ludus | undefined, c: Creature, bf: BattleFighter, won: boolean): void {
  const item = armoryPiece(house, bf.gear.item);
  if (!item || !gearHas(item, 'MysteriousEgg')) return;
  if (!(chance(0.1) && (won || chance(0.5)))) return;
  const st = item.state ?? 0;
  if (st < 0) {
    item.state = 0;
    if (house?.isPlayer) report(state, 'info', `The petrified egg ${c.name} carries has warmed. Something stirs inside.`);
  } else if (st >= 3) {
    hatchWyvern(state, house, c, item);
  } else {
    item.state = st + 1;
    if (house?.isPlayer) report(state, 'info', `The Mysterious Egg is ${EGG_STAGES[st + 1]}.`);
  }
}

/**
 * Write a BattleResult back onto the real creatures and houses: XP (grantXp), fame, tameness, injuries,
 * deaths (via care.bury), consumed poultices/antivenom, weapon proficiency gains, trait unlocks, career stats,
 * killers, Dark Fangs hunger, Mysterious Egg progress, Hand of Midas coins. Returns names of the dead.
 */
export function applyBattleResult(ctx: ApplyContext, sides: [BattleSide, BattleSide], result: BattleResult): string[] {
  const { state } = ctx;
  const entries = [
    ...sides[0].fighters.map((bf) => ({ bf, s: 0 as const })),
    ...sides[1].fighters.map((bf) => ({ bf, s: 1 as const })),
  ];
  const findEntry = (id: string, side: 0 | 1) =>
    entries.find((e) => e.bf.creature.id === id && e.s === side) ?? entries.find((e) => e.bf.creature.id === id);
  const outcomes = result.outcomes as CombatOutcome[];
  const dead: { c: Creature; cause: string; side: 0 | 1 }[] = [];
  const kills = new Map<string, number>();
  for (const o of outcomes) {
    if (o.died && o.killedBy) kills.set(o.killedBy, (kills.get(o.killedBy) ?? 0) + 1);
  }
  const defaultCause = ctx.deathCause ?? (ctx.tournament ? `Fell in the arena at ${ctx.tournament.name}` : 'Fell in the arena');

  for (const o of outcomes) {
    if (o.temporary) continue;
    const e = findEntry(o.creatureId, o.side);
    if (!e || e.bf.temporary) continue;
    const { bf } = e;
    const c = bf.creature;
    const side = sides[e.s];
    const house = houseById(state, side.houseId) ?? ownerOf(state, c);
    const won = o.side === result.winner;
    if (ctx.exhibition) {
      o.injury = null;
      o.died = false;
      o.bandageUsed = false;
    }

    // XP, fame, tameness
    if (!ctx.sparring) {
      if (o.xp > 0) grantXp(c, o.xp, hasTrait(c, 'QuickStudy') ? 1.25 : 1);
      c.fame = Math.max(1, c.fame + o.fame);
      c.loyalty = clamp(c.loyalty + o.loyalty, 0, 100);
    }

    // injuries
    if (o.injury && !o.died) {
      c.injury = c.injury ? { type: 'multiple', weeks: c.injury.weeks + o.injury.weeks } : { ...o.injury };
    }

    // consumables
    if (o.bandageUsed) consume(house, c, bf.gear.item, 'poultice');
    if (o.antidoteUsed) consume(house, c, bf.gear.item, 'antivenom');

    // weapon proficiency
    if (result.decidedBy !== 'forfeit') proficiency(c, bf, won);

    // traits
    for (const t of o.newTraits) {
      if (t === 'Titan' && hasTrait(c, 'Giant')) removeTrait(c, 'Giant');
      addTrait(c, t);
    }
    if (o.knockedOut && hasTrait(c, 'Arrogant')) removeTrait(c, 'Arrogant');

    // career
    if (!ctx.sparring && result.decidedBy !== 'forfeit') {
      c.career.battles += 1;
      if (won) c.career.wins += 1;
      else c.career.losses += 1;
    }
    c.career.kills += kills.get(c.id) ?? 0;
    c.career.biggestHit = Math.max(c.career.biggestHit, o.biggestHit);

    // Dark Fangs: a kill makes it Bloody, wounding a non-beast feeds it one stage
    for (const g0 of [bf.gear.weapon, bf.gear.offhand]) {
      const g = armoryPiece(house, g0);
      if (!g || !gearHas(g, 'DarkBlade')) continue;
      const killedHuman = outcomes.some((x) => x.died && x.killedBy === c.id
        && findEntry(x.creatureId, x.side)?.bf.creature.kind !== 'beast');
      if (killedHuman) g.state = 0;
      else if (o.woundedHuman) g.state = Math.max(0, darkFangsStage(g) - 1);
    }
    // Helm of the Woven Path heirloom score (GM checked the wrong helmet on a loss; fixed)
    const helm = armoryPiece(house, bf.gear.helmet);
    if (helm && gearHas(helm, 'Heirloom') && result.decidedBy !== 'forfeit') {
      const sc = helm.state ?? 1;
      helm.state = won ? Math.min(100, sc + 1) : Math.floor((sc * 3) / 4);
    }
    // Mysterious Egg
    eggProgress(state, house, c, bf, won);
    // Hand of Midas: the coins are actually credited (GM only logged them)
    if (o.midasCoins && house) {
      house.denarii += o.midasCoins;
      if (house.isPlayer) report(state, 'income', `${c.name}'s Hand of Midas scattered coins in the arena.`, o.midasCoins);
    }

    if (o.died) dead.push({ c, cause: o.deathCause ?? defaultCause, side: e.s });
  }

  // run statistics for the player's side
  if (!ctx.sparring) {
    const playerSides = ([0, 1] as const).filter((s) => sides[s].player);
    if (playerSides.length) {
      state.runStats.battles += 1;
      if (playerSides.length === 1 && playerSides[0] === result.winner) state.runStats.wins += 1;
      state.runStats.deaths += dead.filter((d) => sides[d.side].player).length;
    }
  }

  for (const d of dead) bury(state, d.c, d.cause);
  return dead.map((d) => d.c.name);
}
