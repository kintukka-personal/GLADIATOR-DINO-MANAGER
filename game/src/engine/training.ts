// Training, doctore, sparring, weekly trait gain. OWNER: world-economy agent. GM 03 §3.2–3.4.
//
// trainingWeek runs GM AppendWeekForCombatants' training part for every creature of a house, followed by
// WeekPassed (trait roll, species level, healing), then the beast rules (Good Boy, alpha fights).
import type {
  BattleResult, BattleSide, Creature, GameState, ID, Injury, Ludus, TechId, TraitId, TrainingType, WeaponFamily,
} from './types';
import { CLASSES } from './data/classes';
import { GEAR, gearHas, gearWorth } from './data/gear';
import { TECHNIQUES } from './data/techniques';
import { TRAITS, WEEKLY_TRAITS } from './data/traits';
import { chance, coin, pick, rand } from './rng';
import { asc, ASC, hasUpgrade, isPlayerHouse, report } from './util';
import {
  addTrait, autoSpendStatPoints, bestStat, canFight, classLevel, getStat, grantRareLearnable, grantXp, hasTrait,
  injuryProne, isLearnable, knownTech, learnTechnique, meetsRequirement, replaceTrait, xpMultiplier,
} from './creature';
import { buildingTotals, BUILDINGS, loseRandomBuilding } from './buildings';
import { addInfluence, paidTrainers, withinFacilities } from './economy';
import { hasOpp } from './influence';
import { applyBattleResult, buildSide, resolveBattle } from './combat';
import { bury, unassignEverywhere } from './care';

export const TRAINING_MULT: Record<TrainingType, number> = { light: 0.75, standard: 1, intense: 1.5, technique: 0.5 };
export const TRAINING_RISK: Record<TrainingType, number> = { light: 1, standard: 2, intense: 4, technique: 2 };

const MASTERY: Record<WeaponFamily, TraitId> = {
  claw: 'BladeWhisperer', mace: 'AxialMomentum', fang: 'ShadowBlade', horn: 'PiercingPrecision', spit: 'PiercingPrecision',
  whip: 'DeafeningCrackle', jaw: 'FistsOfSteel',
};
const KILLER_TRAITS: TraitId[] = ['Killer', 'Assassin', 'Enforcer', 'SuddenDeath'];
const CRUEL_TRAITS: TraitId[] = ['Sneaky', 'Untrustworthy', 'Ruthless'];
const WOUNDED_TEACHERS: TraitId[] = ['Crippled', 'Blind', 'BumLeg'];
/** GM's six wound outcomes (partial blindness worsens to blindness). */
const WOUND_DRAW: TraitId[] = ['HorribleDisfigurement', 'PartiallyBlind', 'BumLeg', 'Crippled', 'MissingFingers', 'Concussion'];
export const MASTER_PROF = 150;
export const GRANDMASTER_PROF = 800;

const INJURY_BY_ROLL: Record<number, Injury> = {
  11: { type: 'flesh', weeks: 2 }, 12: { type: 'broken', weeks: 3 }, 13: { type: 'severe', weeks: 4 }, 14: { type: 'multiple', weeks: 5 },
};

/** GM GenerateInjury(m): rand(11)+m; ≤10 nothing, 11..14 injuries, 15 dead (coin flip to severe when m < 12, or never when death is off). */
export function rollInjury(m: number, allowDeath: boolean): Injury | 'dead' | null {
  const R = rand(11) + m;
  if (R <= 10) return null;
  let t = Math.min(R, 15);
  if (t === 15 && (!allowDeath || (m < 12 && coin()))) t = 13;
  if (t === 15) return 'dead';
  return { ...INJURY_BY_ROLL[t] };
}

/** A new injury on an injured creature becomes Multiple injuries and adds weeks. */
export function addInjury(c: Creature, inj: Injury): void {
  if (c.injury) c.injury = { type: 'multiple', weeks: c.injury.weeks + inj.weeks };
  else c.injury = { ...inj };
}

/** Injury with the assigned Healing Poultice (GM bandage downgrade). Returns 'poultice' if one was used. */
export function injureWithPoultice(state: GameState, h: Ludus, c: Creature, inj: Injury): 'poultice' | 'injured' {
  const prior = c.injury ? { ...c.injury } : null;
  addInjury(c, inj);
  const p = c.gear.item ? h.armory.find((g) => g.id === c.gear.item && gearHas(g, 'Bandage')) : undefined;
  if (!p || (prior && prior.type === c.injury!.type)) return 'injured';
  if (c.injury!.type === 'multiple') c.injury = { type: 'severe', weeks: Math.max(1, c.injury!.weeks - 2) };
  else c.injury = prior;
  unassignEverywhere(h, p.id);
  h.armory = h.armory.filter((g) => g.id !== p.id);
  const next = h.armory.find((g) => gearHas(g, 'Bandage') && !h.creatures.some((o) => o.gear.item === g.id));
  if (next) c.gear.item = next.id;
  return 'poultice';
}

// ---------------------------------------------------------------------------
// Doctore and effectiveness
// ---------------------------------------------------------------------------

/** The doctore if present, a dino, healthy and at home (an injured doctore counts as none). */
export function usableDoctore(h: Ludus): Creature | undefined {
  const d = h.doctoreId ? h.creatures.find((c) => c.id === h.doctoreId) : undefined;
  if (!d || d.kind !== 'dino' || d.injury || d.away) return undefined;
  return d;
}

/** Base training effectiveness (GM 10; Celtic 12; Jupiter −3; influence options; AI bonuses). */
export function baseEffectiveness(state: GameState, h: Ludus): number {
  let e = 10;
  if (isPlayerHouse(state, h)) {
    const p = state.player;
    if (p.heritage === 'celtic') e += 2;
    if (asc(state, ASC.jupiter)) e -= 3;
    if (p.toggles.publicSessions) e -= 2;
    if (hasOpp(state, 'weightedTraining')) e += 3;
    if (p.election && p.election.campaigners.length > 0) e -= 10;
  } else if (h.ai) {
    e += 3; // GM CommonerTourists
    if (asc(state, ASC.juno)) e += 10;
    if (asc(state, ASC.mars)) e += 10;
  }
  return e;
}

/** GM DoctoreBonus = (2×level + 3) + CUN (×1.5 Doctore trait, +2 if best stat CUN). */
export function doctoreBonus(state: GameState, h: Ludus): number {
  const d = usableDoctore(h);
  if (!d) return 0;
  let b = 2 * d.level + 3 + getStat(d, 'cun');
  if (bestStat(d) === 'cun') b += 2;
  if (hasTrait(d, 'Doctore')) b *= 1.5;
  return b;
}

export function trainingTypeOf(h: Ludus, c: Creature): TrainingType {
  return h.training.overrides?.[c.id] ?? h.training.type;
}

/** Dinos and beasts train once past the juvenile stage, when at home. */
export function canTrain(c: Creature): boolean {
  return c.maturity >= 0.5 && !c.away;
}

/** GM 03 §3.4 training XP before the age/class multipliers of grantXp. */
export function trainingXpBase(state: GameState, h: Ludus, c: Creature, careful = false): number {
  const base = baseEffectiveness(state, h);
  const doc = usableDoctore(h);
  let D = 5;
  if (doc && doc !== c) {
    D = doctoreBonus(state, h) * (0.1 * base + 0.1);
    if (doc.cls === 'lasher') D += 2 * doc.level;
  }
  const facility = withinFacilities(h, c) ? buildingTotals(h).trainingPct : 0;
  let E = base + Math.floor(D);
  if (facility > 30) E += 1;
  if (facility > 60) E += 2;
  const weighted = isPlayerHouse(state, h) && hasOpp(state, 'weightedTraining') ? 25 : 0;
  const bonusPct = facility + (hasTrait(c, 'QuickStudy') ? 25 : 0) + (c.species === 'velociraptor' ? 25 : 0) + weighted;
  E += Math.floor(E * bonusPct * 0.015);
  E *= TRAINING_MULT[trainingTypeOf(h, c)];
  const t = paidTrainers(state, h);
  E += (t.bestiarii ? 5 : 0) + (t.spartan ? 10 : 0) + (t.weapons ? 10 : 0);
  E = Math.max(0, E);
  if (hasTrait(c, 'Arrogant')) E /= 2;
  if (c.injury && c.injury.weeks > 1) E /= 2;
  if (careful) E -= E / 8;
  return Math.floor(E);
}

/** Weekly training XP a creature would receive (for UI projection). */
export function projectedTrainingXp(state: GameState, h: Ludus, c: Creature): number {
  if (!canTrain(c)) return 0;
  return Math.floor(trainingXpBase(state, h, c) * xpMultiplier(c));
}

/** Number of sparring sessions available (1 + doctore thresholds). */
export function sparringSlots(state: GameState, h: Ludus): number {
  const d = usableDoctore(h);
  let n = 1;
  if (!d) return n;
  const L = d.level;
  const C = getStat(d, 'cun');
  if (L > 5 && C > 10) n++;
  if (L > 8 && C > 15) n++;
  if (L > 12 && C > 20) n++;
  if (L > 15 && C > 30) n++;
  return n;
}

/** Run a sparring match now (player action): both gain 5×(L1+L2) XP; injuries −2. Returns battle result for viewing. */
export function spar(state: GameState, h: Ludus, aId: ID, bId: ID): BattleResult | string {
  if (aId === bId) return 'A dino cannot spar with itself, however hard it tries.';
  const a = h.creatures.find((c) => c.id === aId);
  const b = h.creatures.find((c) => c.id === bId);
  if (!a || !b) return 'Both sparring partners must be in the ludus.';
  for (const c of [a, b]) {
    if (c.kind !== 'dino') return `${c.name} would eat its sparring partner. Dinos only.`;
    if (!canFight(c)) return `${c.name} is in no state to spar.`;
    if (c.inactive) return `${c.name} is busy this week.`;
  }
  if (h.training.sparring.length >= sparringSlots(state, h)) return 'No sparring sessions left this week. A better doctore runs more.';
  const levels = a.level + b.level;
  const used = new Set<ID>();
  const sides: [BattleSide, BattleSide] = [
    buildSide(state, h, [a], 'default', { riders: false, used, injuryMod: -2, player: h.isPlayer, name: a.name }),
    buildSide(state, h, [b], 'default', { riders: false, used, injuryMod: -2, name: b.name }),
  ];
  const result = resolveBattle(sides, { week: state.world.week, sparring: true, riders: false, label: 'Sparring' });
  applyBattleResult({ state, sparring: true, deathCause: 'Killed in a sparring accident' }, sides, result);
  h.training.sparring.push({ a: aId, b: bId });
  for (const c of [a, b]) {
    if (!h.creatures.includes(c)) continue;
    grantXp(c, 5 * levels);
    c.inactive = true;
  }
  const under = a.level < b.level ? a : b.level < a.level ? b : undefined;
  if (under && h.creatures.includes(under) && !hasTrait(under, 'Duelist') && chance(0.1)) addTrait(under, 'Duelist');
  return result;
}

// ---------------------------------------------------------------------------
// Weekly training
// ---------------------------------------------------------------------------

function earlyProtection(week: number): number {
  return week < 5 ? 2 : week < 12 ? 1 : 0;
}

function techAllowed(state: GameState, h: Ludus, t: TechId): boolean {
  const up = TECHNIQUES[t].upgrade;
  return !up || !isPlayerHouse(state, h) || hasUpgrade(state, up);
}

/** Learn a technique for free when possible, otherwise make it learnable. */
function gainTechnique(state: GameState, h: Ludus, c: Creature, t: TechId): boolean {
  if (knownTech(c, t) || !techAllowed(state, h, t)) return false;
  if (meetsRequirement(c, t, 1)) return learnTechnique(c, t, true);
  if (c.learnable.includes(t)) return false;
  c.learnable.push(t);
  return true;
}

/** The family a creature drills this week: class weapon → assigned weapon → best proficiency → ludus' best weapon. */
export function trainingFamily(h: Ludus, c: Creature): WeaponFamily {
  if (c.cls) return CLASSES[c.cls].mainFamily;
  const w = c.gear.weapon ? h.armory.find((g) => g.id === c.gear.weapon) : undefined;
  const wf = w ? GEAR[w.type].family : undefined;
  if (wf) return wf;
  let best: WeaponFamily | undefined;
  for (const [f, v] of Object.entries(c.prof) as [WeaponFamily, number][]) if (v > 0 && (!best || v > c.prof[best])) best = f;
  if (best) return best;
  let top: { f: WeaponFamily; w: number } | undefined;
  for (const g of h.armory) {
    const f = GEAR[g.type].slot === 'weapon' ? GEAR[g.type].family : undefined;
    if (!f) continue;
    const wv = gearWorth(g);
    if (!top || wv > top.w) top = { f, w: wv };
  }
  return top?.f ?? 'jaw';
}

/** GM Training.classLvlup. */
function classLevelUp(state: GameState, h: Ludus, c: Creature, cl: number): void {
  if (!c.cls) return;
  const d = CLASSES[c.cls];
  if (2 * cl > c.level) grantXp(c, 50 * cl);
  if ((cl + 1) % 3 === 0) {
    const pool = d.traits.filter((t) => !hasTrait(c, t));
    if (pool.length) addTrait(c, pick(pool));
  } else if (cl % 4 === 0) {
    c.techPoints++;
    const rare = d.techniques.filter((t) => TECHNIQUES[t].rare && !knownTech(c, t) && !c.learnable.includes(t) && techAllowed(state, h, t));
    if (rare.length) c.learnable.push(pick(rare));
  } else if (d.mainStat === 'hp') {
    c.bonus.hp += 5;
  } else {
    c.bonus[d.mainStat] += 1;
  }
}

function proficiencyWeek(state: GameState, h: Ludus, c: Creature, weapons: boolean, spartan: boolean, notes: string[]): void {
  let amt = (weapons ? 2 : 0) + (chance(0.25) ? 1 : 0) + (chance(weapons ? 0.4 : 0.1) ? 1 : 0);
  if (amt > 0 && c.species === 'iguanodon') amt++;
  if (amt <= 0) return;
  const fam = trainingFamily(h, c);
  c.prof[fam] += amt;
  const p = c.prof[fam];
  if (p >= MASTER_PROF && !hasTrait(c, MASTERY[fam])) {
    const heritage = isPlayerHouse(state, h) && (state.player.heritage === 'greek' || state.player.heritage === 'roman') ? 1 : 0;
    const roll = rand(100) + heritage + (p >= GRANDMASTER_PROF ? 5 : 0);
    if (roll >= (weapons || spartan ? 95 : 99)) {
      addTrait(c, MASTERY[fam]);
      notes.push(`${c.name} mastered its ${fam} work: ${TRAITS[MASTERY[fam]].name}.`);
    }
  }
  if (fam === 'jaw' && p >= MASTER_PROF && c.cls === 'brawler' && gainTechnique(state, h, c, 'Uppercut')) {
    notes.push(`${c.name} worked out the Jaw Crunch.`);
  }
}

function trainOne(state: GameState, h: Ludus, c: Creature, doc: Creature | undefined, notes: string[]): void {
  const type = trainingTypeOf(h, c);
  const paid = paidTrainers(state, h);
  let protection = buildingTotals(h).injuryReduction + earlyProtection(state.world.week);
  let careful = false;
  if (hasTrait(c, 'Careful') && chance(0.7)) {
    careful = true;
    protection += 2;
  }
  grantXp(c, trainingXpBase(state, h, c, careful));
  if (doc === c && !hasTrait(c, 'Doctore') && chance(0.1)) {
    addTrait(c, 'Doctore');
    notes.push(`${c.name} has become a true Pack Mentor.`);
  }
  // training injury (an injured creature only does light rehabilitation and is not hurt again)
  const risk = chance(0.5) ? 0 : TRAINING_RISK[type];
  const inj = c.injury ? null : rollInjury(injuryProne(c) + risk - protection, false);
  if (inj && inj !== 'dead') {
    const r = injureWithPoultice(state, h, c, inj);
    notes.push(r === 'poultice' ? `${c.name} got hurt in training; a poultice patched it up.` : `${c.name} was injured in training (${c.injury!.type}, ${c.injury!.weeks} weeks).`);
  }
  if (c.kind !== 'dino' || c.injury) return;
  // Weighted Training: crowds come to watch the log-dragging
  if (isPlayerHouse(state, h) && hasOpp(state, 'weightedTraining') && chance(0.25)) c.fame += 1;
  // class mastery
  if (c.cls) {
    const before = classLevel(c);
    let gain = 1;
    if (c.species === 'parasaurolophus' && chance(0.5)) gain++;
    if (isPlayerHouse(state, h) && hasOpp(state, 'classTraining') && chance(0.5)) gain++;
    c.classXp += gain;
    for (let cl = before + 1; cl <= classLevel(c); cl++) classLevelUp(state, h, c, cl);
  }
  // side effects
  if (rand(30) === 0) {
    const t = grantRareLearnable(c);
    if (t) notes.push(`${c.name} picked up the basics of ${TECHNIQUES[t].name}.`);
  }
  if (type === 'intense' && chance(0.02) && !hasTrait(c, 'Giant')) {
    const pool = (['Strong', 'Ambidextrous', 'LightningSpeed'] as TraitId[]).filter((t) => !hasTrait(c, t));
    if (pool.length) {
      const t = pick(pool);
      addTrait(c, t);
      notes.push(`Intense drills made ${c.name} ${TRAITS[t].name}.`);
    }
  }
  if (type === 'technique') {
    if (chance(0.01)) {
      const r = rand(3);
      if (r === 0) c.techPoints++;
      else addTrait(c, r === 1 ? 'Talented' : 'ExoticFightingStyle');
    }
    if (c.cls === 'spitter' && chance(0.04) && gainTechnique(state, h, c, 'HailOfArrows')) notes.push(`${c.name} learned to spray a Venom Barrage.`);
    if (c.cls === 'brawler' && chance(0.04) && gainTechnique(state, h, c, 'Uppercut')) notes.push(`${c.name} learned the Jaw Crunch.`);
    if (hasTrait(c, 'Hoplite') && chance(c.prof.horn >= GRANDMASTER_PROF ? 0.2 : 0.04) && gainTechnique(state, h, c, 'Impale')) notes.push(`${c.name} learned to Impale.`);
    // doctore teaching (2/15 when the doctore has something teachable)
    const teachable = doc && doc !== c
      ? doc.techniques.map((t) => t.id).filter((t) => !knownTech(c, t) && isLearnable(c, t) && techAllowed(state, h, t) && meetsRequirement(c, t, 1))
      : [];
    const r = rand(15);
    if (teachable.length && r >= 13 && c.level > c.techniques.length) {
      const t = pick(teachable);
      if (learnTechnique(c, t, true)) notes.push(`${doc!.name} taught ${c.name} ${TECHNIQUES[t].name}.`);
    } else if (r === 14) {
      const t = grantRareLearnable(c);
      if (t) notes.push(`${c.name} watched closely and can now learn ${TECHNIQUES[t].name}.`);
    }
  }
  if (paid.bestiarii) {
    if (!hasTrait(c, 'Bestiarii') && chance(0.15)) addTrait(c, 'Bestiarii');
    else if (!hasTrait(c, 'BeastTamer') && chance(0.01)) addTrait(c, 'BeastTamer');
  }
  if (paid.spartan) {
    const r = rand(30);
    if (r < 2 && !hasTrait(c, 'Conditioning')) addTrait(c, 'Conditioning');
    else if (r === 2 && !hasTrait(c, 'Indomitable')) addTrait(c, 'Indomitable');
  }
  proficiencyWeek(state, h, c, paid.weapons, paid.spartan, notes);
}

/** Good Boy treats and Alpha fights (GM beast week). */
function beastWeek(state: GameState, h: Ludus, notes: string[]): void {
  const need = state.world.difficulty.nightmare ? 9 : 7;
  for (const b of h.creatures) {
    if (b.kind !== 'beast' || hasTrait(b, 'GoodBoy') || hasTrait(b, 'BestBoy')) continue;
    const t = b.treats ?? 0;
    if (b.fame > 60 && ((t > 2 && rand(100) + t > 100) || t >= need)) {
      addTrait(b, 'GoodBoy');
      grantXp(b, 100);
      addInfluence(state, h, 5);
      notes.push(`${b.name} is a Good Boy. The crowd agrees (+5 influence).`);
    }
  }
  const alphas = h.creatures.filter((b) => b.kind === 'beast' && hasTrait(b, 'Alpha') && !hasTrait(b, 'GoodBoy') && !hasTrait(b, 'BestBoy') && !b.away);
  if (alphas.length >= 2 && chance(0.5) && chance(0.2)) {
    const victim = alphas.reduce((lo, b) => (b.level < lo.level ? b : lo));
    const r = rollInjury(injuryProne(victim) + 5 + (victim.injury ? 2 : 0), true);
    if (r === 'dead') {
      notes.push(`${victim.name} lost a fight for dominance and did not get up.`);
      bury(state, victim, 'Mauled by a rival alpha');
    } else if (r) {
      addInjury(victim, r);
      notes.push(`Two alphas fought in the pens: ${victim.name} was mauled (${victim.injury!.weeks} weeks).`);
    } else {
      notes.push(`Two alphas squared off in the pens. ${victim.name} backed down.`);
    }
  }
}

/** Per-creature weekly training (XP, class XP, training injuries, side effects, proficiency, doctore teaching). */
export function trainingWeek(state: GameState, h: Ludus): void {
  const doc = usableDoctore(h);
  const player = isPlayerHouse(state, h);
  const notes: string[] = [];
  for (const c of [...h.creatures]) {
    if (!h.creatures.includes(c)) continue;
    if (canTrain(c)) trainOne(state, h, c, doc, notes);
    weekPassed(state, h, c);
    if (player && c.autoManage) autoSpendStatPoints(c);
  }
  beastWeek(state, h, notes);
  h.training.sparring = [];
  if (player) for (const n of notes) report(state, 'info', n);
}

// ---------------------------------------------------------------------------
// GM Gladiator.WeekPassed
// ---------------------------------------------------------------------------

function weeklyTrait(c: Creature): TraitId | null {
  const giant = hasTrait(c, 'Giant') || hasTrait(c, 'Titan');
  const suits = c.cls === 'bulwark' || c.cls === 'slasher' || c.cls === 'brute';
  if (giant && suits && (c.prof.claw >= 15 || c.prof.mace >= 15) && !hasTrait(c, 'TitanicStrength')) {
    addTrait(c, 'TitanicStrength');
    return 'TitanicStrength';
  }
  const t = pick(WEEKLY_TRAITS);
  if (!hasTrait(c, t)) {
    addTrait(c, t);
    return t;
  }
  if (c.cls === 'spitter' && !hasTrait(c, 'Marksman')) {
    addTrait(c, 'Marksman');
    return 'Marksman';
  }
  return null;
}

function woundTrait(h: Ludus, c: Creature): TraitId | null {
  const item = c.gear.item ? h.armory.find((g) => g.id === c.gear.item) : undefined;
  const midas = !!item && gearHas(item, 'HandOfMidas');
  const t = pick(WOUND_DRAW.filter((x) => !(midas && x === 'MissingFingers')));
  if (t === 'PartiallyBlind' && hasTrait(c, 'PartiallyBlind')) {
    if (hasTrait(c, 'Blind')) return null;
    replaceTrait(c, 'PartiallyBlind', 'Blind');
    return 'Blind';
  }
  if (hasTrait(c, t)) return null;
  addTrait(c, t);
  return t;
}

/** GM Gladiator.WeekPassed: weekly trait roll, species level 0→1, injury and illness healing, wound traits. */
export function weekPassed(state: GameState, h: Ludus, c: Creature): void {
  const player = isPlayerHouse(state, h);
  if (c.kind === 'dino') {
    const cun = getStat(c, 'cun');
    const origin = c.species === 'troodon' ? 10 : 0;
    const f = player && state.player.heritage === 'greek' ? 2 : 1;
    if (rand(80) + Math.trunc((c.level + 2 * cun + origin - c.traits.length - 5) * f) >= 80) {
      const t = weeklyTrait(c);
      if (t && player) report(state, 'good', `${c.name} gained the ${TRAITS[t].name} trait.`);
    }
    if (!hasTrait(c, 'Psychopath') && KILLER_TRAITS.every((t) => hasTrait(c, t)) && CRUEL_TRAITS.some((t) => hasTrait(c, t)) && rand(30) < 2) {
      addTrait(c, 'Psychopath');
      if (player) report(state, 'bad', `${c.name} has become Deranged. The rest of the pack keeps its distance.`);
    }
    if (c.speciesLevel === 0 && c.level > 4 && c.fame > 800) {
      c.speciesLevel = 1;
      if (player) report(state, 'good', `${c.name} has awakened its species' instincts (species level 1).`);
    }
    if (c.legend === 'spartacus' && c.career.tournamentWins > 2 && !hasTrait(c, 'DemandingFreedom')) addTrait(c, 'DemandingFreedom');
  }
  if (hasTrait(c, 'Pyromaniac') && rand(hasTrait(c, 'Psychopath') ? 20 : 60) === 0) {
    const lost = loseRandomBuilding(h);
    if (lost && player) report(state, 'bad', `${c.name} knocked over a brazier. The ${BUILDINGS[lost].name} burned down a level.`);
  }
  if (c.injury) {
    c.injury.weeks--;
    if (c.injury.weeks <= 0) {
      const serious = c.injury.type === 'severe' || c.injury.type === 'multiple';
      c.injury = null;
      if (serious && chance(0.5)) {
        const w = woundTrait(h, c);
        if (w && player) report(state, 'bad', `${c.name} recovered, but is left ${TRAITS[w].name}.`);
      }
    }
  }
  if (c.ill > 0) c.ill--;
}

/** Auto-pick doctore for AI (highest level) / validate player doctore. */
export function chooseDoctore(state: GameState, h: Ludus): void {
  if (h.doctoreId && !h.creatures.some((c) => c.id === h.doctoreId)) h.doctoreId = undefined;
  if (isPlayerHouse(state, h)) return;
  const cands = h.creatures.filter((c) => c.kind === 'dino' && c.maturity >= 1 && !c.away && !c.injury);
  if (!cands.length) return;
  const lashers = cands.filter((c) => c.cls === 'lasher');
  const pool = lashers.length ? lashers : cands;
  const score = (c: Creature) => c.level + (WOUNDED_TEACHERS.some((t) => hasTrait(c, t)) ? 5 : 0);
  let best = pool[0];
  for (const c of pool) if (score(c) > score(best)) best = c;
  h.doctoreId = best.id;
}
