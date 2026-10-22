// Internal combat model: the transient Combatant ("Fighter") built from a BattleFighter for one battle
// (GM world/Combatant.java). Nothing here is persisted; creatures are never mutated by the battle.

import type {
  BattleFighter, FighterOutcome, Gear, GearDef, ID, Instruction, SpeciesDef, SpeciesId, TechId, TraitId,
} from '../types';
import type { gearLine } from '../data/gear';

export type Line = ReturnType<typeof gearLine>;

/** GM StatusEffect names (01 §8). */
export type StatusId =
  | 'BLINDED' | 'STUNNED' | 'DAZED' | 'DISARM' | 'FRIGHTENED' | 'ENRAGED' | 'ENSNARED' | 'BLEEDING' | 'CALTROPS'
  | 'ARMOR_SUNDERED' | 'HELMET_SUNDERED' | 'SHIELD_SUNDERED' | 'EVADING' | 'PARRY' | 'DEFLECT' | 'BLOCK' | 'WARCRY'
  | 'FEEL_NO_PAIN' | 'PUMPED' | 'DUEL' | 'INSPIRED' | 'DEMORALIZED' | 'TRANCE' | 'INDOMITABLE' | 'CHAINED'
  | 'TIME_CURSE' | 'TWO_HEADS' | 'THREE_HEADS' | 'WEREWOLF';

/** Numeric fighter fields a status may shift (reversed exactly on expiry; fixes GM's inexact reversal). */
export type StatField = 'S' | 'I' | 'C' | 'H' | 'armorExtra' | 'critBonus' | 'sr' | 'stunR' | 'loyalty' | 'dodge' | 'baseAcc';
export type Delta = Partial<Record<StatField, number>>;

export interface StatusInst {
  dur: number;
  delta: Delta;
  /** status-specific number: BLOCK amount, PARRY rank, WARCRY rank … */
  value: number;
  /** fighter index that caused it (bleed credit, net owner) */
  source: number;
  /** current HP granted on application (PUMPED/INSPIRED), not taken back on expiry */
  hpGain: number;
}

export interface TechState { id: TechId; rank: number; cd: number; manual: number }

/** A resolved equipment piece for this battle. */
export interface Piece { g: Gear; l: Line; def: GearDef }

export type OffKind = 'shield' | 'net' | 'weapon';

export interface Fighter {
  idx: number;
  side: 0 | 1;
  bf: BattleFighter;
  id: ID;
  name: string;
  beast: boolean;
  /** has the Mythical trait (GM combat checks: holy-weapon bonus, fear, surrender) */
  mythic: boolean;
  species: SpeciesId;
  sp: SpeciesDef;
  temporary: boolean;
  instruction: Instruction | null;
  traits: Set<TraitId>;
  /** species level 2 ("advanced") bonus active */
  adv: boolean;

  // ---- equipment
  w: Piece | null;
  off: Piece | null;
  offKind: OffKind | null;
  armor: Piece | null;
  helmet: Piece | null;
  rider: Piece | null;
  item: Piece | null;
  riderSummoned: boolean;
  bow: boolean;
  pilum: boolean;
  whip: boolean;
  fuscina: boolean;
  ironJaws: boolean;
  twoHandedOnly: boolean;
  freeHand: boolean;
  /** off-hand weapon that strikes on its own */
  offAttacks: boolean;
  /** dual wielding (accuracy penalty, DualWield unlock) */
  dual: boolean;
  /** net level (2 net, 4 hooked) */
  net: number;
  /** fighter index currently held by this fighter's net */
  netOn: number | null;
  /** rider block multiplier (Rider's Bond / Parasaurolophus) */
  riderBlkMult: number;
  riderDrMult: number;

  // ---- stats
  S: number; I: number; C: number; H: number; hp: number;
  baseS: number; baseI: number; baseC: number; startHp: number; hpMax0: number;
  loyalty: number; baseLoyalty: number;
  F: number;
  /** GM "bonus damage" B */
  B: number;
  armorExtra: number;
  dr: number;
  reach: number;
  /** main weapon reach only */
  wReach: number;
  baseAcc: number; weaponAcc: number; offAcc: number;
  dodge: number;
  critBonus: number;
  critDmgPct: number;
  wpnPts: number; offPts: number; barePts: number;
  sr: number; stunR: number; weakBlock: number; critBlock: number;
  poisonResistItem: boolean;
  antidote: boolean;
  antidoteUsed: boolean;
  poisonImmune: boolean;
  poisoner: boolean;
  caltrops: number;
  caltropsPow: number;
  sauroter: number;
  imprint: number;
  fameBonus: number;
  carthageSet: boolean;
  midas: boolean;
  darkFangs: boolean;
  /** dmg/blk modifier of the Dark Fangs at its hunger stage */
  fangsMod: number;
  fangsBloody: boolean;
  heirloomDmg: number;
  heirloomBlk: number;
  moonstone: boolean;
  werewolfActive: boolean;
  transformed: boolean;
  lifeSteal: number;
  intangible: boolean;
  flying: boolean;
  causesFear: boolean;

  techs: TechState[];
  st: Map<StatusId, StatusInst>;

  // ---- battle state
  out: boolean;
  ko: boolean;
  yielded: boolean;
  koBy?: number;
  koBonus: number;
  executed: boolean;
  impactHit: boolean;
  attacks: number;
  damagedSinceAttack: boolean;
  tookDamage: boolean;
  lastAttacker?: number;
  dealtThisTurn: number;
  dealtLast: boolean;
  koResistUsed: boolean;
  shieldSlamUsed: boolean;
  solarUsed: boolean;
  thracian: number;
  lunarPts: number;
  solarPts: number;
  firstHitLanded: boolean;
  achillesDone: boolean;
  pilumShred: number;
  biggestHit: number;
  suddenDeath: boolean;
  causedBlind: boolean;
  causedStun: boolean;
  causedDisarm: boolean;
  wasBlinded: boolean;
  woundedHuman: boolean;
}

/** FighterOutcome plus combat-module extras read back by applyBattleResult (structural subtype). */
export interface CombatOutcome extends FighterOutcome {
  antidoteUsed?: boolean;
  /** Hand of Midas coins to credit to the owner */
  midasCoins?: number;
  favour?: number;
  /** Dark Fangs wielder wounded a non-beast */
  woundedHuman?: boolean;
  /** tomb text when the death is not an ordinary injury roll (fight to the death) */
  deathCause?: string;
}
