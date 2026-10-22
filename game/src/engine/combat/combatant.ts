// Building a Combatant (GM 01 §3) and small predicates shared by the engine.

import type {
  BattleFighter, BattleOptions, BattleSide, Creature, Gear, GearEffect, GearSlot, TechId, WeaponFamily,
} from '../types';
import { WEAPON_FAMILIES } from '../types';
import { GEAR, gearLine } from '../data/gear';
import { SPECIES, isGiantSize } from '../data/species';
import { CLASSES } from '../data/classes';
import { getStat, rawStat, isKid } from '../creature';
import type { Fighter, Line, OffKind, Piece, StatusId } from './model';

// ---------------------------------------------------------------------------------------------
// Weapon proficiency (GM 01 §17)
// ---------------------------------------------------------------------------------------------

/** Tier bonus for a proficiency score: weapon points and accuracy (Proficient 15, Specialist 60, Master 150, Grandmaster 800). */
export function profTier(p: number): { pts: number; acc: number } {
  if (p >= 800) return { pts: 5, acc: 10 };
  if (p >= 150) return { pts: 3, acc: 5 };
  if (p >= 60) return { pts: 2, acc: 0 };
  if (p >= 15) return { pts: 1, acc: 0 };
  return { pts: 0, acc: 0 };
}

/** Proficiency family a weapon trains/uses. Spine Darts use the better of horn and spit (spit on ties). */
export function profFamily(c: Creature, g: Gear | null | undefined): WeaponFamily {
  if (!g) return 'jaw';
  if (g.type === 'spineDarts') return (c.prof.spit ?? 0) >= (c.prof.horn ?? 0) ? 'spit' : 'horn';
  return GEAR[g.type].family ?? 'jaw';
}

/** Proficiency bonus of a creature with a weapon (Iguanodon level 2: every family's bonus applies; GM Roman lvl 2). */
export function profBonus(c: Creature, g: Gear | null | undefined): { pts: number; acc: number } {
  if (c.kind === 'beast') return { pts: 0, acc: 0 };
  if (c.species === 'iguanodon' && c.speciesLevel >= 2) {
    let pts = 0;
    let acc = 0;
    for (const fam of WEAPON_FAMILIES) {
      const t = profTier(c.prof[fam] ?? 0);
      pts += t.pts;
      acc += t.acc;
    }
    return { pts, acc };
  }
  return profTier(c.prof[profFamily(c, g)] ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------------------------

export const has = (f: Fighter, s: StatusId): boolean => f.st.has(s);
export const disarmed = (f: Fighter): boolean => f.st.has('DISARM');
/** Holding a usable main weapon. */
export const armed = (f: Fighter): boolean => !!f.w && !f.st.has('DISARM');
/** Bare jaws, Iron Jaws or disarmed (GM "fists"); beasts without a weapon count too. */
export const fists = (f: Fighter): boolean => !f.w || f.ironJaws || f.st.has('DISARM');
export const shieldUp = (f: Fighter): boolean => f.offKind === 'shield' && !f.st.has('SHIELD_SUNDERED');
export const helmetUp = (f: Fighter): boolean => !!f.helmet && !f.st.has('HELMET_SUNDERED');
export const armorUp = (f: Fighter): boolean => !!f.armor && !f.st.has('ARMOR_SUNDERED');
export const impaired = (f: Fighter): boolean =>
  f.st.has('BLINDED') || f.st.has('FRIGHTENED') || f.st.has('STUNNED') || f.st.has('DISARM');
export const NEGATIVE: StatusId[] = ['BLINDED', 'ENRAGED', 'FRIGHTENED', 'STUNNED', 'ENSNARED'];
export const negative = (f: Fighter): boolean => NEGATIVE.some((s) => f.st.has(s));
export const isGiant = (f: Fighter): boolean => isGiantSize(f.species) || f.traits.has('Giant') || f.traits.has('Titan');
export const alive = (f: Fighter): boolean => !f.out && f.hp >= 1;
export const lineHas = (p: Piece | null, e: GearEffect): boolean => !!p && p.l.effects.includes(e);
export const holy = (p: Piece | null): boolean => lineHas(p, 'AscendedBlade') || lineHas(p, 'TempleArtifact');
export const fam = (p: Piece | null): WeaponFamily | undefined => (p ? p.def.family : undefined);

/** Class-preferred technique (+1 priority, ×1.1 damage). */
export function classPref(f: Fighter, t: TechId): boolean {
  const cls = f.bf.creature.cls;
  return !!cls && CLASSES[cls].techniques.includes(t);
}

/** Effective armor of the fighter's base pieces (no weapon/offhand/attacker terms). */
export function baseArmor(f: Fighter): number {
  let a = f.armorExtra - f.pilumShred;
  if (f.armor && !f.st.has('ARMOR_SUNDERED')) a += f.armor.l.blk;
  if (f.helmet && !f.st.has('HELMET_SUNDERED')) a += f.helmet.l.blk + f.heirloomBlk;
  if (f.rider) a += f.rider.l.blk * f.riderBlkMult;
  if (f.item) a += f.item.l.blk;
  return a;
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

const INJURY_HP: Record<string, number> = { flesh: 0.1, broken: 0.15, severe: 0.3, multiple: 0.45 };

/** Hunger stage of the Dark Fangs (gear.state): 0 Bloody, 1 Sated, 2 Neutral (default), 3 Hungry, 4 Starving. */
export function darkFangsStage(g: Gear): number {
  const s = g.state;
  return s === undefined || !Number.isFinite(s) ? 2 : Math.max(0, Math.min(4, Math.round(s)));
}
const FANGS_DMG = [2, 1, 0, -2, -3];
const FANGS_BLK = [0, 0, 0, -2, -3];

/** Helm of the Woven Path heirloom bonuses (02 §4.4), applied in combat in our version. */
export function heirloomBonus(score: number): { blk: number; dmg: number } {
  const blk = score >= 100 ? 3 : score >= 10 ? 2 : score >= 3 ? 1 : 0;
  const dmg = score >= 20 ? 2 : score >= 10 ? 1 : 0;
  return { blk, dmg };
}

function piece(g: Gear | null | undefined): Piece | null {
  if (!g || !GEAR[g.type]) return null;
  const l: Line = gearLine(g);
  return { g, l: { ...l, effects: [...l.effects] }, def: GEAR[g.type] };
}

export const SPECTRAL_RIDER: Gear = { id: 'spectral-rider', type: 'spectralRider', quality: 2 };

export interface BuildCtx {
  opts: BattleOptions;
  side: BattleSide;
  sideIdx: 0 | 1;
}

/** Fold creature + gear + traits + species into combat numbers (GM Combatant constructor). */
export function buildFighter(bf: BattleFighter, idx: number, ctx: BuildCtx): Fighter {
  const c = bf.creature;
  const sp = SPECIES[c.species];
  const beast = c.kind === 'beast';
  const traits = new Set(c.traits);
  const natural = !!ctx.opts.natural;
  const kid = isKid(c);
  const adv = !beast && c.speciesLevel >= 2;
  const has_ = (t: string) => traits.has(t as never);

  // ---- gear (beasts: nothing but the Minotaur's weapon; Primal Bout: nothing; kids: no rider)
  const slot = (s: GearSlot): Gear | null => {
    if (natural) return null;
    if (beast) return s === 'weapon' && c.species === 'minotaur' ? bf.gear.weapon ?? null : null;
    if (s === 'rider' && kid) return null;
    return bf.gear[s] ?? null;
  };
  let w = piece(slot('weapon'));
  if (w && w.def.slot !== 'weapon') w = null;
  let off = piece(slot('offhand'));
  const armor = piece(slot('armor'));
  const helmet = piece(slot('helmet'));
  let rider = piece(slot('rider'));
  const item = piece(slot('item'));
  const titanic = has_('TitanicStrength');
  if (w && w.l.effects.includes('TwoHandedOnly') && off && !titanic) off = null;
  let offKind: OffKind | null = null;
  if (off) offKind = off.def.isNet ? 'net' : off.def.slot === 'weapon' ? 'weapon' : 'shield';

  // Spectral Saddle (GM Reins): no rider → summon a spectral rider; mounted → +10 dodge, +5 dmg, +10 HP.
  let riderSummoned = false;
  const reins = lineHas(item, 'Reins');
  if (reins && !rider && !beast && !kid && !natural) {
    rider = piece(SPECTRAL_RIDER);
    riderSummoned = true;
  }

  // Dark Fangs hunger stage
  let fangsMod = 0;
  let fangsBloody = false;
  let darkFangs = false;
  for (const p of [w, off]) {
    if (p && p.l.effects.includes('DarkBlade')) {
      darkFangs = true;
      const st = darkFangsStage(p.g);
      p.l.dmg += FANGS_DMG[st];
      p.l.blk += FANGS_BLK[st];
      fangsMod = FANGS_DMG[st];
      if (st === 0) fangsBloody = true;
    }
  }
  // Heirloom helm
  let heirloomDmg = 0;
  let heirloomBlk = 0;
  if (helmet && helmet.l.effects.includes('Heirloom')) {
    const hb = heirloomBonus(helmet.g.state ?? 1);
    heirloomDmg = hb.dmg;
    heirloomBlk = hb.blk;
  }

  const isPara2 = adv && c.species === 'parasaurolophus';
  const bond = has_('MasterHorseman');
  const riderBlkMult = rider && (bond || isPara2) ? 2 : 1;
  const riderStrMult = rider && (bond || isPara2) ? 2 : 1;
  const riderAllMult = isPara2 ? 2 : 1;

  // ---- core stats: age-modified attribute + gear
  let S = getStat(c, 'str');
  let I = getStat(c, 'agi');
  let C = getStat(c, 'cun');
  let H = getStat(c, 'hp');
  for (const p of [w, off, armor, helmet, item]) {
    if (!p) continue;
    S += p.l.str; I += p.l.agi; C += p.l.cun; H += p.l.hp;
  }
  if (rider) {
    S += rider.l.str * riderStrMult;
    I += rider.l.agi;
    C += rider.l.cun * riderAllMult;
    H += rider.l.hp * riderAllMult;
  }
  if (c.species === 'brachiosaurus') H += 10;
  if (reins && rider && !riderSummoned) H += 10;
  // instructions (GM 01 §21)
  const instr = bf.instruction;
  if (instr === 'allout' || instr === 'kill') { I += 1; C -= 1; }
  else if (instr === 'care') C += 1;
  S = Math.max(1, S); I = Math.max(1, I); C = Math.max(0, C); H = Math.max(5, H);

  const pieces: (Piece | null)[] = [w, off, armor, helmet, rider, item];
  const eff = (e: GearEffect) => pieces.some((p) => lineHas(p, e));
  const typeIs = (p: Piece | null, ...types: string[]) => !!p && types.includes(p.g.type);
  const uniqueIs = (p: Piece | null, key: string) => !!p && p.g.unique === key;

  // ---- sets (02 §4.5)
  const legionSet = typeIs(armor, 'legionBarding') && typeIs(helmet, 'legionFaceplate') && typeIs(w, 'talonBlades')
    && typeIs(off, 'frillGuard', 'bronzeFrillGuard');
  const hannibalSet = uniqueIs(helmet, 'hannibalsHelmet') && uniqueIs(armor, 'hannibalsRegalia') && uniqueIs(item, 'hannibalsSandals');
  const cataSet = typeIs(armor, 'cataphractBarding') && (!!rider || reins) && (fam(w) === 'horn');

  // ---- favour
  let F = 0;
  for (const t of ['Mythical', 'Devotion', 'ApolloBlessing', 'CelestialChampion'] as const) if (traits.has(t)) F++;
  for (const p of pieces) if (lineHas(p, 'TempleArtifact')) F++; // counted once per piece (GM double-counts items)
  if (c.species === 'spinosaurus') F *= 2;
  let hpBonus = 0;
  const favoured = ctx.opts.favoured?.[ctx.sideIdx];
  if (favoured) {
    const n = c.species === 'spinosaurus' ? 2 : 1;
    F += n;
    hpBonus += n;
  }
  if (ctx.opts.bathHouse?.[ctx.sideIdx] && ctx.opts.bathHouse[ctx.sideIdx] === c.id) { H += 10; }

  // ---- armor
  let armorExtra = 0;
  if (c.species === 'ankylosaurus') armorExtra += 1;
  if (has_('Mythical')) armorExtra += 2;
  if (has_('Tough')) armorExtra += 1;
  if (has_('ThickHide')) armorExtra += 1;
  if (has_('Intangible')) armorExtra += c.species === 'wraith' ? 10 : 1;
  if (has_('Reincarnated') || has_('ReincarnatedBeast')) armorExtra += 1;
  if (has_('Agile') && (!armor || (!armor.def.heavy && armor.g.type !== 'quiltedBarding'))) armorExtra += 1;
  let pieceCount = 0;
  if (w) pieceCount += w.l.effects.includes('TwoHandedOnly') ? 2 : 1;
  for (const p of [off, armor, helmet, rider, item]) if (p) pieceCount++;
  if (pieceCount >= 6) armorExtra += 1;
  if (legionSet) armorExtra += 2;
  if (hannibalSet) armorExtra += 2;
  if (cataSet) armorExtra += 4;

  let dr = (armor?.l.dr ?? 0) + (helmet?.l.dr ?? 0) + (rider ? rider.l.dr * riderAllMult : 0);
  if (has_('Tough')) dr += 1;
  if (has_('ThickHide')) dr += 1;
  if (has_('Intangible')) dr += c.species === 'wraith' ? 2 : 1;
  if (legionSet) dr += 2;

  // ---- weapon handling flags
  const wfx = (e: GearEffect) => lineHas(w, e);
  const bow = wfx('Bow');
  const pilum = wfx('Pilum');
  const whip = wfx('Whip');
  const fuscina = wfx('Fuscina');
  const ironJaws = wfx('HandToHand');
  const twoHandedOnly = wfx('TwoHandedOnly');
  const freeHand = !off || lineHas(off, 'Strapped') || titanic;
  const offWeaponOk = offKind === 'weapon' && (lineHas(off, 'DualWieldable') || (titanic && (lineHas(off, 'TwoHandedOnly') || lineHas(off, 'TwoHanded'))));
  const offAttacks = offKind === 'weapon' && (offWeaponOk || ironJaws);
  const dual = offKind === 'weapon' && (fam(off) === 'claw' || fam(off) === 'fang' || fam(off) === 'mace');
  const net = offKind === 'net' ? (lineHas(off, 'HookedNet') ? 4 : 2) : 0;

  // ---- reach
  const wReach = w ? w.l.reach : 0;
  let reach = wReach + (rider ? rider.l.reach * riderAllMult : 0);
  if (c.species === 'dilophosaurus') reach += 1;
  if (c.species === 'brachiosaurus') reach += 1;
  if (has_('Alert')) reach += Math.trunc(rawStat(c, 'agi') / 10) + 1;
  if (has_('ExplosiveRelease') && pilum) reach += 1;

  // ---- accuracy, dodge, crit
  const cls = c.cls ? CLASSES[c.cls] : null;
  let baseAcc = 0;
  if (has_('LightningSpeed')) baseAcc += 5;
  if (has_('AllIn') && freeHand && w) baseAcc += 10;
  if (has_('PiercingPrecision') && (fam(w) === 'horn' || pilum)) baseAcc += 10;
  if (lineHas(item, 'EagleVision')) baseAcc += 5;
  if (lineHas(item, 'EyeBall')) baseAcc += 2;
  if (eff('LightFooted')) baseAcc += 5;
  const mainProf = w ? profBonus(c, w.g) : { pts: 0, acc: 0 };
  const offProf = off && offKind === 'weapon' ? profBonus(c, off.g) : { pts: 0, acc: 0 };
  let weaponAcc = mainProf.acc;
  if (cls && w && w.g.type === cls.mainWeapon) weaponAcc += 3;
  if (cls && off && cls.offhand && off.g.type === cls.offhand) weaponAcc += 2;
  if (wfx('RomanConquest') && c.species === 'iguanodon') weaponAcc += 5;
  if (wfx('Egyptian') && c.species === 'spinosaurus') weaponAcc += 5;
  const offAcc = offProf.acc;
  let dodge = 0;
  if (has_('LightningSpeed')) dodge += 5;
  if (reins && rider && !riderSummoned) dodge += 10;
  let critBonus = 0;
  if (c.species === 'tyrannosaurus') critBonus += 10;
  if (wfx('CriticalHits')) critBonus += 10;
  if (lineHas(off, 'CriticalHits')) critBonus += 10;
  if (twoHandedOnly) critBonus += 10; // GM adds this twice (+20); fixed
  if (lineHas(item, 'EagleVision')) critBonus += 5;

  // ---- weapon damage points
  let wpnPts = mainProf.pts;
  if (w) {
    if (w.g.type === 'talonBlades' && lineHas(off, 'Scutum')) wpnPts += 2;
    if (wfx('Falcata') && freeHand) {
      const hi = w.g.quality >= 2;
      wpnPts += hi ? 3 : 2;
      if (c.species === 'dilophosaurus' || c.species === 'therizinosaurus') wpnPts += hi ? 2 : 1;
    }
    if (wfx('TwoHanded') && freeHand) wpnPts += 2;
    if (has_('AllIn') && freeHand) wpnPts += 1;
    if (pilum && has_('ExplosiveRelease')) wpnPts += 1;
    if (hannibalSet) wpnPts += 2;
    if (c.species === 'therizinosaurus' && fam(w) === 'claw') wpnPts += 1;
  }
  let offPts = offProf.pts;
  if (offKind === 'weapon' && c.species === 'therizinosaurus' && fam(off) === 'claw') offPts += 1;
  const barePts = !w && !beast ? profTier(c.prof.jaw ?? 0).pts : 0;

  // ---- resists
  let sr = 0;
  if (c.species === 'triceratops') sr += 7;
  let stunR = 0;
  if (lineHas(helmet, 'StunResist')) stunR += 8;
  if (lineHas(item, 'StunResist')) stunR += 5;
  if (c.species === 'pachycephalosaurus') stunR += 5;
  if (has_('Cataphractoi') && rider) stunR += 10;
  const weakBlock = lineHas(armor, 'VerySturdy') ? 3 : lineHas(armor, 'Sturdy') ? 2 : 0;
  const critBlock = eff('CriticalBlock') ? 2 : 0;

  // ---- misc
  let B = 0;
  if (adv && c.species === 'troodon') B += Math.trunc(c.traits.length / 2);
  if (reins && rider && !riderSummoned) B += 5;
  B += heirloomDmg;
  const caltrops = lineHas(item, 'Caltrops') ? Math.max(1, item!.l.charges || 1) : 0;
  const caltropsPow = item && item.g.quality >= 3 ? 2 : 1;
  const sauroter = wfx('Sauroter') ? 1 : 0;
  let fameBonus = 0;
  for (const p of pieces) {
    if (!p) continue;
    if (p.l.effects.includes('Magnificent')) fameBonus += 2;
    if (p.l.effects.includes('Sponsored')) fameBonus -= 2;
  }
  const poisoner = has_('PoisonedClaws') || ctx.side.modifiers.includes('PoisonedWeapons');
  const moonstone = lineHas(item, 'Moonstone');
  const fullMoon = ctx.opts.week % 4 === 0;
  const werewolfActive = fullMoon && (has_('Lycanthropy') || moonstone);
  let lifeSteal = 0;
  if (has_('Carnivorous')) lifeSteal = 0.3;

  // ---- HP
  H += hpBonus;
  const baseArmorStatic = armorExtra + (armor?.l.blk ?? 0) + (helmet ? helmet.l.blk + heirloomBlk : 0)
    + (rider ? rider.l.blk * riderBlkMult : 0) + (item?.l.blk ?? 0);
  if (has_('Cataphractoi') && rider && baseArmorStatic > 20) H += 5 * (baseArmorStatic - 20);
  let hpLossPct = 0;
  if (c.injury) hpLossPct = INJURY_HP[c.injury.type] ?? 0;
  if (c.ill > 0) hpLossPct = Math.max(hpLossPct, 0.15);
  const hpLoss = Math.floor(H * hpLossPct);
  const startHp = H - hpLoss;
  const hp = H + F - hpLoss;

  // ---- techniques (all cooldowns reset; manual priorities from the Tactics order)
  const order = c.techOrder ?? [];
  const techs = c.techniques.filter((t) => t.equipped).map((t) => {
    const i = order.indexOf(t.id);
    return { id: t.id, rank: Math.max(1, t.rank), cd: 0, manual: i >= 0 ? 100 * (order.length - i) : 0 };
  });
  // gear that lends Hurricane (GM gryphon mount)
  if (eff('Hurricane') && !techs.some((t) => t.id === 'Hurricane')) {
    const i = order.indexOf('Hurricane');
    techs.push({ id: 'Hurricane', rank: 1, cd: 0, manual: i >= 0 ? 100 * (order.length - i) : 0 });
  }

  const f: Fighter = {
    idx, side: ctx.sideIdx, bf, id: c.id, name: c.nickname ? `${c.nickname} ${c.name}` : c.name, beast,
    mythic: has_('Mythical'), species: c.species, sp, temporary: !!bf.temporary, instruction: instr, traits, adv,
    w, off, offKind, armor, helmet, rider, item, riderSummoned,
    bow, pilum, whip, fuscina, ironJaws, twoHandedOnly, freeHand, offAttacks, dual, net, netOn: null,
    riderBlkMult, riderDrMult: riderAllMult,
    S, I, C, H, hp, baseS: S, baseI: I, baseC: C, startHp, hpMax0: H, loyalty: c.loyalty, baseLoyalty: c.loyalty, F, B,
    armorExtra, dr, reach, wReach, baseAcc, weaponAcc, offAcc, dodge, critBonus, critDmgPct: 0,
    wpnPts, offPts, barePts, sr, stunR, weakBlock, critBlock,
    poisonResistItem: lineHas(item, 'PoisonResistance'), antidote: lineHas(item, 'Antidote'), antidoteUsed: false,
    poisonImmune: false, poisoner, caltrops, caltropsPow, sauroter,
    imprint: rider && !beast ? Math.max(0, Math.min(1, c.genes.imprint || 0)) : 0,
    fameBonus, carthageSet: hannibalSet, midas: lineHas(item, 'HandOfMidas'), darkFangs, fangsMod, fangsBloody,
    heirloomDmg, heirloomBlk, moonstone, werewolfActive, transformed: false, lifeSteal,
    intangible: has_('Intangible'), flying: has_('Flying'),
    causesFear: has_('HorribleDisfigurement') || has_('Mythical'),
    techs, st: new Map(),
    out: false, ko: false, yielded: false, koBonus: 0, executed: false, impactHit: false, attacks: 0,
    damagedSinceAttack: false, tookDamage: false, dealtThisTurn: 0, dealtLast: false, koResistUsed: false,
    shieldSlamUsed: false, solarUsed: false, thracian: 0, lunarPts: 0, solarPts: 0, firstHitLanded: false,
    achillesDone: false, pilumShred: 0, biggestHit: 0, suddenDeath: false, causedBlind: false, causedStun: false,
    causedDisarm: false, wasBlinded: false, woundedHuman: false,
  };
  return f;
}

/** Turn-order key (GM initiativeComparator). */
export const initiativeKey = (f: Fighter): number => f.I + 5 * f.reach + f.F;
