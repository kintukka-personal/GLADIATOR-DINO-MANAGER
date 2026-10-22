// Gear selection for a battle (GM 01 §4 step 3, BattleEquipmentAvailability + WeaponSelectionFactory, 02 §2 auto-equip).

import type {
  BattleFighter, BattleSide, Creature, GameState, Gear, GearSlot, GearTypeId, ID, Instruction, Ludus, SideModifier,
} from '../types';
import { GEAR, gearHas, gearWorth } from '../data/gear';
import { CLASSES } from '../data/classes';
import { isKid, makeNamed } from '../creature';
import { profBonus } from './combatant';

export interface PrepOptions {
  riders: boolean;
  natural?: boolean;
  /** gear ids already used by other fighters in this battle (GM BattleEquipmentAvailability) */
  used?: Set<ID>;
  /** explicit gear choice for this battle; null = leave the slot empty; undefined = auto/assigned */
  override?: Partial<Record<GearSlot, ID | null>>;
}

const SLOTS: GearSlot[] = ['weapon', 'offhand', 'armor', 'helmet', 'rider', 'item'];

/** Items worth carrying into a fight when nothing is assigned (consumables and on-assign items are never auto-picked). */
const AUTO_ITEMS = new Set<GearTypeId>(['eagleEyeCharm', 'luckyTooth', 'gripWraps', 'legPlates', 'caltrops', 'cyclopsEye',
  'neptuneCharm', 'spectralSaddle', 'mandrakeRoot']);

const broken = (g: Gear): boolean => g.augment === 'Broken' || g.augment === 'BrokenTimeWarp';

/** Can this piece go in this slot for this creature? */
export function slotFits(slot: GearSlot, g: Gear, c: Creature): boolean {
  const d = GEAR[g.type];
  if (!d) return false;
  if (slot === 'offhand') {
    if (d.slot === 'offhand') return true;
    if (d.slot !== 'weapon') return false;
    if (d.effects.includes('DualWieldable')) return true;
    return c.traits.includes('TitanicStrength') && (d.effects.includes('TwoHandedOnly') || d.effects.includes('TwoHanded'));
  }
  return d.slot === slot;
}

/** The Quality Ankylo Hammer (Precision) the Minotaur brings (GM: Quality Bipennis). Transient, not in any armory. */
export function minotaurHammer(): Gear {
  return { id: 'minotaur-hammer', type: 'ankyloHammer', quality: 3, augment: 'Precision' };
}

function autoWeapon(c: Creature, cands: Gear[]): Gear | undefined {
  const cls = c.cls ? CLASSES[c.cls] : null;
  let best: Gear | undefined;
  let bestScore = -1;
  for (const g of cands) {
    const d = GEAR[g.type];
    if (d.slot !== 'weapon') continue;
    const prof = profBonus(c, g).pts;
    let m: number;
    if (cls) {
      m = g.type === cls.mainWeapon ? 8 : d.family === cls.mainFamily ? 3 : 1;
      if (prof > 0) m *= 2;
    } else {
      m = 1 + prof;
    }
    const score = gearWorth(g) * m;
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}

function autoOffhand(c: Creature, cands: Gear[]): Gear | undefined {
  const cls = c.cls ? CLASSES[c.cls] : null;
  const dualOk = c.cls === 'slasher' || c.traits.includes('DualWield') || c.traits.includes('Ambidextrous');
  let best: Gear | undefined;
  let bestScore = -1;
  for (const g of cands) {
    if (!slotFits('offhand', g, c)) continue;
    const d = GEAR[g.type];
    let m = 0;
    if (cls?.offhand && g.type === cls.offhand) m = 8;
    else if (d.isShield) m = 1;
    else if (d.isNet) m = c.cls === 'snarer' ? 1 : 0;
    else if (d.slot === 'weapon') m = dualOk ? 1 : 0;
    if (m <= 0) continue;
    const score = gearWorth(g) * m;
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}

function autoBest(slot: GearSlot, c: Creature, cands: Gear[]): Gear | undefined {
  let best: Gear | undefined;
  let bestScore = -1;
  for (const g of cands) {
    if (!slotFits(slot, g, c)) continue;
    if (slot === 'item' && !AUTO_ITEMS.has(g.type)) continue;
    const score = gearWorth(g);
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}

/**
 * Resolve the gear a creature takes into battle: explicit override, else its assigned gear (creature.gear),
 * else auto-pick from the owner's armory (class preferred weapon, else by proficiency, highest worth) —
 * GM 01 §4 step 3. Dinos with no weapon fight bare-jawed (no weapon object). Beasts take no gear.
 * Riders only when opts.riders and the creature is not a kid. Natural (Primal Bout): no gear at all.
 */
export function prepareFighter(state: GameState, house: Ludus | undefined, c: Creature, instruction: Instruction | null, opts: PrepOptions): BattleFighter {
  const bf: BattleFighter = { creature: c, gear: {}, instruction };
  if (c.kind === 'beast') {
    if (c.species === 'minotaur') bf.gear.weapon = minotaurHammer();
    return bf;
  }
  if (opts.natural) return bf;
  const used = opts.used ?? new Set<ID>();
  const armory = house?.armory ?? [];
  const byId = (id: ID | null | undefined): Gear | undefined => (id ? armory.find((g) => g.id === id) : undefined);
  const bonded = !!house && house.bondedId === c.id;
  const kid = isKid(c);
  const assignedToOthers = new Set<ID>();
  for (const o of house?.creatures ?? []) {
    if (o === c || o.id === c.id) continue;
    for (const id of Object.values(o.gear)) if (id) assignedToOthers.add(id);
  }
  const usable = (slot: GearSlot, g: Gear): boolean =>
    !used.has(g.id) && slotFits(slot, g, c) && (!gearHas(g, 'FamilyItem') || bonded);

  for (const slot of SLOTS) {
    const w = bf.gear.weapon;
    if (slot === 'offhand' && w && gearHas(w, 'TwoHandedOnly') && !c.traits.includes('TitanicStrength')) { bf.gear.offhand = null; continue; }
    if (slot === 'rider' && (!opts.riders || kid)) { bf.gear.rider = null; continue; }
    const assigned = byId(c.gear[slot]);
    let pick: Gear | null | undefined;
    if (assigned && gearHas(assigned, 'CannotUnequip') && usable(slot, assigned)) {
      pick = assigned; // cursed and bound items stay
    } else {
      const ov = opts.override ? opts.override[slot] : undefined;
      if (ov === null) pick = null;
      else if (ov !== undefined) {
        const g = byId(ov);
        if (g && usable(slot, g)) pick = g;
      }
      if (pick === undefined && assigned && usable(slot, assigned)) pick = assigned;
      if (pick === undefined) {
        const cands = armory.filter((g) => usable(slot, g) && !assignedToOthers.has(g.id) && !broken(g) && g.id !== c.gear[slot]);
        if (slot === 'weapon') pick = autoWeapon(c, cands);
        else if (slot === 'offhand') pick = autoOffhand(c, cands);
        else pick = autoBest(slot, c, cands);
      }
    }
    bf.gear[slot] = pick ?? null;
    if (pick) used.add(pick.id);
  }
  return bf;
}

const MANDRAKE_LINES = {
  weak: { str: 9, cun: 8, agi: 14, hp: 20 },
  regular: { str: 14, cun: 8, agi: 18, hp: 30 },
  strong: { str: 18, cun: 12, agi: 26, hp: 45 },
};

/** A mandrake released from a Mandrake root (temporary fighter, GM 01 §4 step 5). */
export function makeMandrake(quality: number): Creature {
  const tier = quality <= 0 ? 'weak' : quality === 1 ? 'regular' : 'strong';
  const s = MANDRAKE_LINES[tier];
  const c = makeNamed('mandrake', 'Mandrake', { str: s.str, agi: s.agi, cun: s.cun, hp: s.hp }, {
    sex: 'M',
    traits: tier === 'strong' ? ['PoisonMaster', 'Alert'] : [],
    techniques: tier === 'weak' ? [] : tier === 'regular' ? [['Smash', 1]] : [['Smash', 1], ['Rally', 1]],
  });
  c.loyalty = 100;
  return c;
}

export interface SideOptions extends PrepOptions {
  name?: string;
  modifiers?: SideModifier[];
  injuryMod?: number;
  player?: boolean;
  /** per-creature gear choices (tournament MatchPrep.gear); wins over `override`, which applies to everyone */
  overrides?: Record<ID, Partial<Record<GearSlot, ID | null>>>;
}

/**
 * Build a side from creatures of one house (or none for scripted foes). `instructions` may be a map by creature id
 * or one instruction for all; null means the AI default (player houses fall back to each creature's own instruction).
 * Mandrake roots add a temporary Mandrake while the side has fewer than 3 fighters.
 */
export function buildSide(
  state: GameState, house: Ludus | undefined, creatures: Creature[],
  instructions: Record<ID, Instruction | null> | Instruction | null,
  opts: SideOptions,
): BattleSide {
  const used = opts.used ?? new Set<ID>();
  const instrFor = (c: Creature): Instruction | null => {
    if (instructions && typeof instructions === 'object') {
      if (c.id in instructions) return instructions[c.id];
      return house?.isPlayer ? c.instruction : null;
    }
    if (instructions === null) return house?.isPlayer ? c.instruction : null;
    return instructions;
  };
  const fighters: BattleFighter[] = creatures.map((c) => prepareFighter(state, house, c, instrFor(c), {
    riders: opts.riders, natural: opts.natural, used, override: opts.overrides?.[c.id] ?? opts.override,
  }));
  // Mandrake roots summon an extra (temporary) fighter while the side has fewer than 3
  if (!opts.natural) {
    for (const bf of [...fighters]) {
      if (fighters.length >= 3) break;
      const it = bf.gear.item;
      if (it && gearHas(it, 'Mandrake')) fighters.push({ creature: makeMandrake(it.quality), gear: {}, instruction: null, temporary: true });
    }
  }
  return {
    houseId: house?.id,
    name: opts.name ?? house?.name ?? 'The Wilds',
    fighters,
    modifiers: opts.modifiers ?? [],
    injuryMod: opts.injuryMod ?? 0,
    influence: house?.influence ?? 0,
    player: opts.player ?? house?.isPlayer ?? false,
  };
}
