// Status effects (GM 01 §8): application with exact stat reversal, ticking, and the resist formulas (§8.1).

import { rand } from '../rng';
import type { Battle } from './battle';
import type { Delta, Fighter, StatField, StatusId, StatusInst } from './model';
import { baseArmor, fists, armed, armorUp, helmetUp, shieldUp, lineHas, fam } from './combatant';

const tr = Math.trunc;

/** Statuses an enemy inflicts (DEFLECT cancels them; resist tracking for Lunar gear). */
const HOSTILE: StatusId[] = ['BLINDED', 'STUNNED', 'DAZED', 'DISARM', 'FRIGHTENED', 'ENRAGED', 'ENSNARED', 'BLEEDING',
  'CALTROPS', 'ARMOR_SUNDERED', 'HELMET_SUNDERED', 'SHIELD_SUNDERED'];

const STATUS_TEXT: Partial<Record<StatusId, string>> = {
  BLINDED: 'is blinded', STUNNED: 'is stunned', DAZED: 'is dazed', DISARM: 'has its harness torn off',
  FRIGHTENED: 'is frightened', ENRAGED: 'flies into a rage', ENSNARED: 'is tangled in bolas', BLEEDING: 'is bleeding',
  CALTROPS: 'is hobbling over caltrops', ARMOR_SUNDERED: 'loses its barding', HELMET_SUNDERED: 'loses its helm',
  SHIELD_SUNDERED: 'has its shield smashed', EVADING: 'darts out of reach', PARRY: 'braces to counter',
  DEFLECT: 'is ready to shrug off the next trick', WARCRY: 'swells with fury', FEEL_NO_PAIN: 'feels no pain',
  PUMPED: 'is pumped up by the odds', DUEL: 'settles into a duel', INSPIRED: 'is inspired',
  DEMORALIZED: 'is demoralized', TRANCE: 'falls into a killing trance', CHAINED: 'drags its chains',
};

function computeDelta(f: Fighter, s: StatusId, value: number): Delta {
  switch (s) {
    case 'DAZED': return { I: -tr(f.baseI / 5), S: -tr(f.baseS / 5), C: -tr(f.C / 5) };
    case 'FRIGHTENED': return { I: -tr(f.baseI / 3) };
    case 'ENSNARED': return { S: -3, I: -3 };
    case 'BLEEDING': return { S: -tr(f.baseS / 4) };
    case 'CALTROPS': return { I: -(tr(f.baseI / 5) + 1), C: -1 };
    case 'WARCRY': return { S: 2 * value + 3 };
    case 'FEEL_NO_PAIN': return { armorExtra: tr(f.S / 10) + 2, stunR: 10 };
    case 'PUMPED': return { S: 5, H: 15 };
    case 'DUEL': return { I: tr(f.baseI / 10), armorExtra: tr(Math.max(0, baseArmor(f)) / 10) };
    case 'INSPIRED': return { I: tr(f.baseI / 5), H: 10, loyalty: tr(f.baseLoyalty / 4) };
    case 'DEMORALIZED': return { C: -tr(f.C / 5), I: -tr(f.baseI / 5), S: -tr(f.baseS / 5), loyalty: -tr(f.baseLoyalty / 4) };
    case 'TRANCE': return { critBonus: 30 };
    case 'INDOMITABLE': return { sr: 40 };
    case 'CHAINED': return { I: -tr((2 * f.baseI) / 3) };
    default: return {};
  }
}

function applyDelta(f: Fighter, d: Delta, sign: 1 | -1): void {
  for (const k of Object.keys(d) as StatField[]) {
    const v = (d[k] ?? 0) * sign;
    (f as unknown as Record<StatField, number>)[k] += v;
  }
}

/**
 * Add a status (GM Effect(status, n)): an existing one keeps the longer duration and its original stat change.
 * Returns true if newly applied or extended.
 */
export function addStatus(b: Battle, f: Fighter, s: StatusId, dur: number, value = 0, source = -1, quiet = false): boolean {
  const cur = f.st.get(s);
  if (cur) {
    if (dur > cur.dur) cur.dur = dur;
    if (value > cur.value && (s === 'BLOCK' || s === 'PARRY')) cur.value = value;
    return true;
  }
  const delta = computeDelta(f, s, value);
  const inst: StatusInst = { dur, delta, value, source, hpGain: 0 };
  applyDelta(f, delta, 1);
  if (delta.H) {
    inst.hpGain = delta.H;
    f.hp += delta.H;
  }
  f.st.set(s, inst);
  if (s === 'BLINDED') f.wasBlinded = true;
  if (!quiet && STATUS_TEXT[s]) b.log('status', `${f.name} ${STATUS_TEXT[s]}.`, { actor: source >= 0 ? source : undefined, target: f.idx });
  return true;
}

export function removeStatus(b: Battle, f: Fighter, s: StatusId): void {
  const inst = f.st.get(s);
  if (!inst) return;
  applyDelta(f, inst.delta, -1);
  if (inst.delta.H) f.hp = Math.min(f.hp, f.H);
  f.st.delete(s);
  if (s === 'ENSNARED') b.releaseNetOn(f);
}

/** selfRoundStart: every status loses 1; those reaching 0 expire. */
export function tickStatuses(b: Battle, f: Fighter): void {
  for (const [s, inst] of [...f.st.entries()]) {
    inst.dur -= 1;
    if (inst.dur <= 0) removeStatus(b, f, s);
  }
}

/** A hostile effect that passed its resist roll: DEFLECT still cancels it. */
export function inflict(b: Battle, att: Fighter, tgt: Fighter, s: StatusId, dur: number, value = 0): boolean {
  if (tgt.out) return false;
  if (HOSTILE.includes(s) && tgt.st.has('DEFLECT') && att.side !== tgt.side) {
    removeStatus(b, tgt, 'DEFLECT');
    b.log('status', `${tgt.name} shrugs it off.`, { actor: att.idx, target: tgt.idx });
    return false;
  }
  addStatus(b, tgt, s, dur, value, att.idx);
  if (att.side !== tgt.side) {
    if (s === 'BLINDED') att.causedBlind = true;
    if (s === 'STUNNED') att.causedStun = true;
    if (s === 'DISARM') att.causedDisarm = true;
  }
  return true;
}

/** Lunar gear: +1 weapon point whenever its wielder resists a fresh effect. */
function resisted(tgt: Fighter, s: StatusId): void {
  if (tgt.st.has(s)) return;
  if (lineHas(tgt.w, 'Lunar') || lineHas(tgt.off, 'Lunar')) tgt.lunarPts += 1;
}

const resist = (f: Fighter): number => f.sr;

/** Axial Momentum (+P/4 per mace) and Deceptive (1 + P/4 per item) power boosts. */
export function boost(a: Fighter, P: number, momentum = true): number {
  let extra = 0;
  if (momentum && a.traits.has('AxialMomentum')) {
    const maces = (fam(a.w) === 'mace' ? 1 : 0) + (a.offKind === 'weapon' && fam(a.off) === 'mace' ? 1 : 0);
    extra += tr(P / 4) * maces;
  }
  const dec = (lineHas(a.w, 'Deceptive') ? 1 : 0) + (lineHas(a.off, 'Deceptive') ? 1 : 0);
  extra += dec * (1 + tr(P / 4));
  return P + extra;
}

export function deceptiveCount(a: Fighter): number {
  return (lineHas(a.w, 'Deceptive') ? 1 : 0) + (lineHas(a.off, 'Deceptive') ? 1 : 0);
}

/** Stun (or daze): P + rand(15) > S + H/5 + R + R×P/100 + rand(15) + F, R = SR + stun resist. */
export function tryStun(b: Battle, att: Fighter, tgt: Fighter, P: number, dur: number, daze = false): boolean {
  if (tgt.out) return false;
  const s: StatusId = daze ? 'DAZED' : 'STUNNED';
  if (!daze && tgt.adv && tgt.species === 'pachycephalosaurus') {
    b.log('status', `${tgt.name}'s skull is too thick to rattle.`, { actor: att.idx, target: tgt.idx });
    return false;
  }
  const R = resist(tgt) + tgt.stunR;
  const ok = P + rand(15) > tgt.S + tr(tgt.H / 5) + R + tr((R * P) / 100) + rand(15) + tgt.F;
  if (!ok) { resisted(tgt, s); return false; }
  return inflict(b, att, tgt, s, dur);
}

/** Tear Harness: P + rand(10) > SR + I + S/2 + F. Needs a non-jaw weapon; Bronze Horn negates the first. */
export function tryDisarm(b: Battle, att: Fighter, tgt: Fighter, P: number, dur: number): boolean {
  if (tgt.out || !armed(tgt) || fists(tgt)) return false;
  const ok = P + rand(10) > resist(tgt) + tgt.I + tr(tgt.S / 2) + tgt.F;
  if (!ok) { resisted(tgt, 'DISARM'); return false; }
  if (tgt.sauroter > 0) {
    tgt.sauroter--;
    b.log('status', `${tgt.name}'s bronze horn holds fast.`, { actor: att.idx, target: tgt.idx });
    return false;
  }
  return inflict(b, att, tgt, 'DISARM', dur);
}

/** Blind: P + rand(10) > SR + I + C + F (+C/4+8 Lunar, +C/6+4 Eagle-Eye, −5 Albino). */
export function tryBlind(b: Battle, att: Fighter, tgt: Fighter, P: number, dur: number): boolean {
  if (tgt.out) return false;
  let def = resist(tgt) + tgt.I + tgt.C + tgt.F;
  if (lineHas(tgt.w, 'Lunar') || lineHas(tgt.off, 'Lunar')) def += tr(tgt.C / 4) + 8;
  if (lineHas(tgt.item, 'EagleVision')) def += tr(tgt.C / 6) + 4;
  if (tgt.traits.has('Albino')) def -= 5;
  if (!(P + rand(10) > def)) { resisted(tgt, 'BLINDED'); return false; }
  return inflict(b, att, tgt, 'BLINDED', dur);
}

/** Bleed: P + rand(20) > SR + S/4 + I/4 + C/2 + F + rand(20). */
export function tryBleed(b: Battle, att: Fighter, tgt: Fighter, P: number, dur: number): boolean {
  if (tgt.out) return false;
  const ok = P + rand(20) > resist(tgt) + tr(tgt.S / 4) + tr(tgt.I / 4) + tr(tgt.C / 2) + tgt.F + rand(20);
  if (!ok) { resisted(tgt, 'BLEEDING'); return false; }
  return inflict(b, att, tgt, 'BLEEDING', dur);
}

/**
 * Rend: P + rand(15) > H/20 + SR + C/4 + S/4 + I/3 + F. Breaks the shield first; helm/barding only if nothing
 * else broke or the power beats a second threshold. Fixed: also eligible with armor only (GM checked the helmet twice)
 * and favour counted once.
 */
export function trySunder(b: Battle, att: Fighter, tgt: Fighter, P: number, dur: number): boolean {
  if (tgt.out || !(shieldUp(tgt) || helmetUp(tgt) || armorUp(tgt))) return false;
  const ok = P + rand(15) > tr(tgt.H / 20) + resist(tgt) + tr(tgt.C / 4) + tr(tgt.S / 4) + tr(tgt.I / 3) + tgt.F;
  if (!ok) { resisted(tgt, 'ARMOR_SUNDERED'); return false; }
  let broke = false;
  const second = tr(tgt.H / 10) + resist(tgt) + tr(tgt.C / 2) + tgt.I + tgt.F;
  if (shieldUp(tgt)) broke = inflict(b, att, tgt, 'SHIELD_SUNDERED', dur) || broke;
  if (helmetUp(tgt) && (!broke || P > second)) broke = inflict(b, att, tgt, 'HELMET_SUNDERED', dur) || broke;
  if (armorUp(tgt) && (!broke || P > second + rand(10))) broke = inflict(b, att, tgt, 'ARMOR_SUNDERED', dur) || broke;
  return broke;
}

/** Fear: P + rand(50) > L/15 + SR + H/10 + 1.5C + F (+C/2+5 Adventurous, +C/2+5 Cold-Blooded) → FRIGHTENED 3. */
export function tryFear(b: Battle, att: Fighter, tgt: Fighter, P: number): boolean {
  if (tgt.out) return false;
  let def = tr(tgt.loyalty / 15) + resist(tgt) + tr(tgt.H / 10) + tr(1.5 * tgt.C) + tgt.F;
  if (tgt.traits.has('Adventurous')) def += tr(tgt.C / 2) + 5;
  if (tgt.traits.has('ColdBlooded')) def += tr(tgt.C / 2) + 5;
  if (!(P + rand(50) > def)) { resisted(tgt, 'FRIGHTENED'); return false; }
  return inflict(b, att, tgt, 'FRIGHTENED', 3);
}
