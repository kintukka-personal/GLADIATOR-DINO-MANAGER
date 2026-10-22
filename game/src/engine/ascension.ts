// Ascension: 16 stacking god levels, the Ascension gauntlet, reincarnation. OWNER: systems-story agent. GM 03 §8.
//
// Both effect passes use GM's switch fall-through: level L applies its own effects and those of every lower
// level. Timed effects ("wN") fire when the run reaches week N (ascensionTurnEffects runs after week++).
import type { Creature, GameState, Gear, Ludus, Meta, TraitId, TechId, BeastSpeciesId, WeaponFamily, DifficultyKey, AchievementId } from './types';
import { STATS } from './types';
import { TRAITS, RANDOM_TRAITS } from './data/traits';
import { TECHNIQUES } from './data/techniques';
import { GEAR } from './data/gear';
import { BEAST_SPECIES, SPECIES } from './data/species';
import { chance, pick, idiv, clamp } from './rng';
import { newId, message, hasUpgrade, asc, ASC, difficultyKey, visibleRivals, activeRivals, zeroProf, zeroStats } from './util';
import {
  addTrait, removeTrait, makeNamed, generateDino, generateBeast, grantXp, rawStat, eqAge, emptyCareer, canFight, hasTrait,
} from './creature';
import { addInfluence, addKeepers } from './economy';
import { spawnRival } from './rivals';
import { unlockAchievement } from './achievements';
import {
  ASCENSION_LEVEL_DATA, ASCENSION_FOES, GOD_CHAMPIONS, FAMILY_WEAPON, type FoeSpec,
} from './data/ascensionData';
import { gearNote, parseGearNote } from './data/arenaData';
import {
  me, newGear, giveGear, equip, firstPlaces, strongestRival, weakestRival, fewestCreaturesRival, rivalByKey, findLegend,
  shiftOpinion, bossXp, once,
} from './data/storiesDataUtil';

export interface AscensionLevelDef { level: number; name: string; god: string; summary: string[] }
export const ASCENSION_LEVELS: AscensionLevelDef[] = ASCENSION_LEVEL_DATA.map((d) => ({ ...d, summary: [...d.summary] }));

export const MAX_ASCENSION = 16;

// ---------------------------------------------------------------------------
// Building named fighters
// ---------------------------------------------------------------------------

function setTech(c: Creature, id: TechId, rank: number): void {
  const k = c.techniques.find((t) => t.id === id);
  if (k) k.rank = Math.max(k.rank, rank);
  else c.techniques.push({ id, rank, equipped: true });
}

/**
 * Build a scripted fighter from a spec. With an `armory` its gear is created there and assigned through
 * creature.gear (house fighters); without one the kit is written as arena gear notes
 * ("gear:<slot>:<type>:<quality>:<augment>:<unique>", see data/arenaData.ts) for tournaments to rebuild.
 */
export function buildFoe(spec: FoeSpec, armory?: Gear[]): Creature {
  const c = makeNamed(spec.species, spec.name, spec.stats, {
    level: spec.level, traits: spec.traits, cls: spec.cls, sex: spec.female ? 'F' : 'M', eqAge: 24,
  });
  for (const [t, r] of spec.techniques ?? []) setTech(c, t, r);
  if (spec.instruction) c.instruction = spec.instruction;
  c.fame = spec.level * 5;
  c.loyalty = 100;
  for (const gs of spec.gear ?? []) {
    const slot = gs.slot ?? GEAR[gs.type].slot;
    if (armory) {
      const g = newGear(gs.type, gs.q, gs.extra ?? {});
      armory.push(g);
      c.gear[slot] = g.id;
    } else {
      c.notes = [...(c.notes ?? []), gearNote({ slot, type: gs.type, quality: gs.q, augment: gs.extra?.augment, unique: gs.extra?.unique })];
    }
  }
  return c;
}

/** A god's champion joins a rival house (or the Wild Horde with target 'horde'). */
function godChampion(state: GameState, key: string, target: Ludus | 'horde' | undefined, note: string): Creature | undefined {
  const spec = GOD_CHAMPIONS[key];
  if (!spec || !target) return undefined;
  const armory = target === 'horde' ? state.world.horde.armory : target.armory;
  const c = buildFoe(spec, armory);
  c.legend = key;
  if (asc(state, ASC.jupiter)) bossXp(c, 3000);
  if (asc(state, ASC.gaia)) bossXp(c, 2000);
  if (target === 'horde') {
    addTrait(c, 'Escaped');
    c.loyalty = 0;
    state.world.horde.rogues.push(c);
  } else {
    target.creatures.push(c);
    message(state, 'herald', spec.name, `${note} ${spec.name} has joined House ${target.name}.`);
  }
  return c;
}

/** A new rogue dino for the Wild Horde. */
function newRogue(state: GameState, level: number): Creature {
  const c = generateDino({ tier: 'epic', week: state.world.week, level: Math.max(1, level) });
  addTrait(c, 'Escaped');
  c.loyalty = 0;
  state.world.horde.rogues.push(c);
  return c;
}

function rogueLeader(state: GameState): Creature | undefined {
  const r = state.world.horde.rogues;
  return r.find((c) => c.legend === 'spartacus') ?? [...r].sort((a, b) => b.level - a.level)[0];
}

function rivalCreatures(state: GameState): Creature[] {
  return activeRivals(state).flatMap((r) => r.creatures);
}

function randomTrait(c: Creature): void {
  for (let i = 0; i < 6; i++) if (addTrait(c, pick(RANDOM_TRAITS))) return;
}

function regularWeapon(): Gear {
  const types = Object.values(GEAR).filter((d) => d.slot === 'weapon' && d.market && !d.upgrade).map((d) => d.type);
  return newGear(pick(types), 2);
}

function buildingUp(h: Ludus, b: keyof Ludus['buildings'], min: number, max = 3): void {
  h.buildings[b] = Math.min(max, Math.max(h.buildings[b] ?? 0, min));
}

// ---------------------------------------------------------------------------
// Start-of-run effects (fall-through)
// ---------------------------------------------------------------------------

type Effect = (state: GameState) => void;

const START: Record<number, Effect> = {
  [ASC.saturn]: (s) => {
    for (const r of activeRivals(s)) {
      r.denarii += 1000;
      giveGear(r, regularWeapon());
      addKeepers(r, 1);
    }
    const g = findLegend(s, 'gigantus');
    if (g) addTrait(g.creature, 'Tough');
    me(s).projected -= 5;
  },
  [ASC.vulcan]: (s) => {
    for (const r of activeRivals(s)) giveGear(r, newGear('legionBarding', 0));
  },
  [ASC.sol]: (s) => {
    for (const c of rivalCreatures(s)) grantXp(c, 50);
    s.world.horde.ferals += 1;
  },
  [ASC.neptune]: (s) => {
    message(s, 'oracle', 'Wrath of Neptune', 'Neptune does not favour us this day.. The rivers of Campania are restless, and the wells taste of salt.');
  },
  [ASC.minerva]: (s) => {
    for (const r of activeRivals(s)) {
      addKeepers(r, 1);
      r.denarii += 100;
      const fams: WeaponFamily[] = chance(0.5) ? ['horn', 'fang'] : ['claw', 'mace'];
      for (const c of r.creatures) for (const f of fams) c.prof[f] = (c.prof[f] ?? 0) + 5;
    }
  },
  [ASC.venus]: (s) => {
    for (const r of activeRivals(s)) {
      addKeepers(r, 1, 'spies');
      shiftOpinion(r, -5);
      if (chance(0.5)) giveGear(r, newGear('poultice', 2));
    }
  },
  [ASC.diana]: (s) => {
    const dec = rivalByKey(s, 'decimus');
    for (const r of activeRivals(s)) {
      if (r === dec) {
        const h = generateBeast('gigantopithecus', { variant: 'strong', name: 'Harambe', sex: 'M' });
        h.legend = 'harambe';
        r.creatures.push(h);
      } else {
        const sp = pick(BEAST_SPECIES.filter((b) => b !== 'mammoth' && b !== 'woollyrhino')) as BeastSpeciesId;
        r.creatures.push(generateBeast(sp, { variant: 'random' }));
      }
      if (chance(0.5)) giveGear(r, newGear('caltrops', 2));
    }
  },
  [ASC.pluto]: (s) => {
    for (const r of activeRivals(s)) r.denarii += 250;
    giveGear(s.unknown, newGear('venomFangs', 2));
    me(s).projected -= 1;
  },
  [ASC.jupiter]: (s) => {
    for (const r of activeRivals(s)) {
      r.training.paid.spartan = true;
      buildingUp(r, 'trainingField', 2);
      giveGear(r, newGear('hideShield', 2));
    }
    s.world.horde.ferals += 2;
    me(s).projected -= 1;
  },
  [ASC.juno]: (s) => {
    for (const r of activeRivals(s)) {
      r.denarii += 100;
      if (r.ai) r.ai.flags.trainingBonus = (r.ai.flags.trainingBonus ?? 0) + 10;
      buildingUp(r, 'veterinarium', Math.min(3, (r.buildings.veterinarium ?? 0) + 1));
    }
    const v = rivalByKey(s, 'vettius');
    if (v) giveGear(v, newGear('mandrakeRoot', 2));
  },
  [ASC.mars]: (s) => {
    for (const r of activeRivals(s)) {
      if (r.ai) r.ai.flags.trainingBonus = (r.ai.flags.trainingBonus ?? 0) + 10;
      buildingUp(r, 'trainingField', 3);
      for (const c of r.creatures) randomTrait(c);
    }
    const gig = findLegend(s, 'gigantus');
    if (gig) bossXp(gig.creature, 800);
    const gan = findLegend(s, 'gannicus');
    if (gan) bossXp(gan.creature, 400);
  },
  [ASC.apollo]: (s) => {
    for (const r of activeRivals(s)) {
      r.denarii += 100;
      shiftOpinion(r, -5);
      addKeepers(r, 1, 'spies');
    }
    const mag = rivalByKey(s, 'magnus');
    const c = godChampion(s, 'sagittarius', mag, 'Apollo guides an archer.');
    if (c) {
      if (s.world.difficulty.hard) setTech(c, 'HailOfArrows', 1);
      if (s.world.difficulty.nightmare) addTrait(c, 'AllIn');
    }
    for (const c of rivalCreatures(s)) c.bonus.cun += 1;
    for (const k of ['gigantus', 'gannicus']) {
      const f = findLegend(s, k);
      if (f) f.creature.bonus.cun += 1;
    }
  },
  [ASC.gaia]: (s) => {
    for (const r of activeRivals(s)) {
      r.denarii += 50;
      r.projected += 5;
      r.influence += 5;
    }
    const mag = rivalByKey(s, 'magnus');
    if (mag) godChampion(s, 'podarge', mag, 'Gaia stirs.');
    const sol = rivalByKey(s, 'solonius');
    if (sol) godChampion(s, 'aello', sol, 'Gaia stirs.');
  },
  [ASC.hyperion]: (s) => {
    s.world.flags.hyperionWeeks = '2,7,13';
    for (const r of activeRivals(s)) {
      r.projected += 5;
      r.influence += 5;
      giveGear(r, newGear('legPlates', 1));
      addKeepers(r, 1);
    }
    const dec = rivalByKey(s, 'decimus');
    if (dec) {
      giveGear(dec, newGear('mysteriousEgg', 2));
      godChampion(s, 'icarus', dec, 'Hyperion lifts a dino into the sky.');
    }
    const v = rivalByKey(s, 'vettius');
    if (v) v.denarii += 1000;
  },
  [ASC.tartarus]: (s) => {
    for (const k of ['pontius', 'faust']) {
      const f = findLegend(s, k);
      if (f) addTrait(f.creature, 'Lycanthropy');
    }
    const mag = rivalByKey(s, 'magnus');
    if (mag) giveGear(mag, newGear('mandrakeRoot', 2));
    for (const r of activeRivals(s)) addKeepers(r, 1);
    message(s, 'herald', 'Mysterious tunnels', 'Keepers report tunnels opening under Capua at night. Something scratches below the arena floor.');
  },
  [ASC.cronus]: (s) => {
    message(s, 'oracle', 'Reaping of Cronus', 'Time itself turns against you. Your dinos will begin every battle with their techniques spent, and the dead do not stay dead.');
  },
};

/** Start-of-run effects for every level ≤ current (fall-through). Optional `prophecy` = account prophecy level. */
export function ascensionStartEffects(state: GameState, opts: { prophecy?: number } = {}): void {
  const L = clamp(state.world.ascension, 0, MAX_ASCENSION);
  if (L <= 0) return;
  for (let lv = 1; lv <= L; lv++) START[lv]?.(state);
  const champ = me(state).creatures.find((c) => hasTrait(c, 'Reincarnated') || hasTrait(c, 'ReincarnatedBeast'));
  if (hasUpgrade(state, 'ascendedWeaponry')) {
    const fam = favouredFamily(champ);
    giveGear(me(state), newGear(FAMILY_WEAPON[fam] ?? 'talonBlades', 1, { augment: 'BrokenTimeWarp' }));
  }
  if ((opts.prophecy ?? 0) > 0) {
    giveGear(me(state), newGear('cyclopsEye', 2));
    if (champ) champ.reincarnation += 1;
  }
  const lvl = ASCENSION_LEVELS[L - 1];
  message(state, 'oracle', `Ascension ${L}: ${lvl.name}`,
    `This run is presided over by ${lvl.god}${L > 1 ? ', and every god before' : ''}. ${ASCENSION_LEVELS.slice(0, L).map((d) => d.summary[0]).join(' ')}`);
}

function favouredFamily(c: Creature | undefined): WeaponFamily {
  if (!c) return 'claw';
  const p = c.prof ?? zeroProf();
  const fams = Object.keys(p) as WeaponFamily[];
  const best = [...fams].sort((a, b) => (p[b] ?? 0) - (p[a] ?? 0))[0];
  return (p[best] ?? 0) > 0 ? best : 'claw';
}

// ---------------------------------------------------------------------------
// Weekly / timed effects (fall-through)
// ---------------------------------------------------------------------------

type Turn = (state: GameState, week: number) => void;

const TURN: Record<number, Turn> = {
  [ASC.saturn]: (s, w) => {
    if (w === 10 && once(s, 'saturn10')) {
      const r = strongestRival(s);
      if (r) { giveGear(r, newGear('legionBarding', 2)); r.miningBonus += 2; }
      me(s).miningBonus -= 1;
    }
    if (w === 20 && once(s, 'saturn20')) for (const r of visibleRivals(s)) { r.denarii += 500; buildingUp(r, 'mine', (r.buildings.mine ?? 0) + 1); }
    if (w === 30 && once(s, 'saturn30')) {
      godChampion(s, 'cronus', fewestCreaturesRival(s), 'Saturn has chosen.');
      me(s).projected -= 5;
    }
    if (w === 40 && once(s, 'saturn40')) {
      const r = strongestRival(s);
      if (r) r.denarii += 1000;
      me(s).miningBonus -= 1;
    }
  },
  [ASC.vulcan]: (s, w) => {
    if (w === 10 && once(s, 'vulcan10')) for (const r of activeRivals(s)) { const g = regularWeapon(); g.augment = 'Precision'; giveGear(r, g); }
    if (w === 15 && once(s, 'vulcan15')) { const r = weakestRival(s); if (r) giveGear(r, newGear('bronzeBarding', 1, { augment: 'Vulcan' })); }
    if (w === 20 && once(s, 'vulcan20')) for (const r of activeRivals(s)) { r.denarii += 500; buildingUp(r, 'forge', 1); }
    if (w === 30 && once(s, 'vulcan30')) for (const r of activeRivals(s)) buildingUp(r, 'forge', 2);
    if (w === 60 && once(s, 'vulcan60')) {
      if (godChampion(s, 'hephaestus', 'horde', '')) {
        s.world.horde.ferals += 10;
        s.world.horde.spoils += 1000;
        message(s, 'herald', 'Hephaestus, Chosen of Vulcan', 'An Ankylosaurus wreathed in forge-smoke has smashed its way out of Vulcan\'s smithy and joined the Wild Horde, followed by ten ferals and a cart of plunder.');
      }
    }
  },
  [ASC.sol]: (s, w) => {
    if (w > 3) {
      for (const c of rivalCreatures(s)) if (canFight(c) && !c.injury) grantXp(c, 30);
      for (const c of s.world.horde.rogues) if (!c.injury) grantXp(c, 30);
    }
    if (w % 20 === 0) s.world.horde.ferals += 1;
    if (w === 50) s.world.horde.ferals += 2;
  },
  [ASC.neptune]: (s, w) => {
    if (w === 35 && once(s, 'neptune35')) for (const r of visibleRivals(s)) buildingUp(r, 'trainingField', (r.buildings.trainingField ?? 0) + 1);
    if (w === 85 && once(s, 'neptune85')) {
      const r = strongestRival(s);
      if (r) { godChampion(s, 'poseidon', r, 'The sea god has chosen.'); r.denarii += 1000; }
    }
  },
  [ASC.minerva]: (s, w) => {
    if (w === 55 && once(s, 'minerva55')) {
      const r = weakestRival(s);
      if (r) { r.denarii += 1000; giveGear(r, newGear('hornLance', 4, { augment: 'Precision' })); }
    }
  },
  [ASC.venus]: (s, w) => {
    if (w % 3 === 0) addInfluence(s, me(s), -1);
  },
  [ASC.diana]: (s, w) => {
    if (w % 4 === 0) {
      for (const r of activeRivals(s)) {
        const b = r.creatures.filter((c) => c.kind === 'beast').sort((a, b2) => b2.level - a.level)[0];
        if (b) bossXp(b, 200);
      }
      const mine = me(s).creatures.filter((c) => c.kind === 'beast').sort((a, b2) => b2.level - a.level)[0];
      if (mine) bossXp(mine, 50);
    }
    if (w === 10 && once(s, 'diana10')) giveRider(s, weakestRival(s));
    if (w === 15 && once(s, 'diana15')) giveRider(s, strongestRival(s));
    if (w === 12 && once(s, 'diana12')) {
      const r = weakestRival(s);
      if (r) {
        const wolf = generateBeast('alphadirewolf', { variant: 'strong', name: 'Diana\'s Dire Wolf', sex: 'F' });
        addTrait(wolf, 'FeralIntelligence');
        addTrait(wolf, 'SharpenedClaws');
        r.creatures.push(wolf);
      }
    }
    if (w === 28 && once(s, 'diana28') && firstPlaces(me(s)) > 0) {
      const r = strongestRival(s);
      if (r) {
        const m = generateBeast('mammoth', { variant: 'strong', name: 'Pachyderm', sex: 'M' });
        r.creatures.push(m);
        message(s, 'herald', 'Pachyderm', `A war mammoth called Pachyderm has been led through the gates of House ${r.name}.`);
      }
    }
  },
  [ASC.pluto]: (s, w) => {
    if (w % 28 === 0) {
      for (const r of visibleRivals(s)) r.denarii += 100;
      me(s).projected -= 1;
    }
    if (w === s.world.ascension + 5 && once(s, 'plutoDisease')) {
      const c = [...me(s).creatures].filter((x) => canFight(x)).sort((a, b) => b.fame - a.fame)[0];
      if (c) {
        addTrait(c, 'HorribleDisfigurement');
        c.ill = Math.max(c.ill, 2);
        message(s, 'medicus', 'Punishment from the gods', `${c.name} has been struck by a disfiguring disease. The priests whisper of Pluto's hand.`);
      }
    }
    if (w === 20 && once(s, 'pluto20')) {
      for (const c of rivalCreatures(s)) if (chance(0.5)) bossXp(c, 500);
      me(s).projected -= 1;
    }
  },
  [ASC.jupiter]: (s, w) => {
    addInfluence(s, me(s), -1);
    if (w === 48 && once(s, 'jupiter48')) {
      godChampion(s, 'jove', weakestRival(s), 'Jupiter casts his judgement.');
      me(s).projected -= 2;
    }
    if (w > 8 && w % 6 === 0) newRogue(s, idiv(w, 10) + 1);
  },
  [ASC.juno]: (s, w) => {
    if (w === 8 && once(s, 'juno8')) {
      const r = weakestRival(s);
      if (r) { giveGear(r, newGear('venomFangs', 4, { unique: 'lifeDrinker' })); message(s, 'herald', 'Life Drinker', `House ${r.name} has unearthed a pair of ritual fangs that drink the life of their victims.`); }
    }
    if (w === 16 && once(s, 'juno16')) {
      const r = weakestRival(s);
      if (r) r.creatures.push(generateBeast('woollyrhino', { variant: 'strong', name: 'Rhino of Juno' }));
    }
    if ((w === 23 || w === 46) && once(s, `juno${w}`)) {
      const r = weakestRival(s);
      if (r) { addKeepers(r, 2); giveGear(r, newGear('neptuneCharm', 2)); }
    }
    if (w > 100 && w % 10 === 0) {
      const lead = rogueLeader(s);
      if (lead && chance(0.5)) { bossXp(lead, 500); randomTrait(lead); } else s.world.horde.ferals += 1;
    }
    if (w % 3 === 0 && s.world.horde.spoils > 1000) { s.world.horde.spoils -= 100; s.world.horde.ferals += 1; }
  },
  [ASC.mars]: (s, w) => {
    if (w > 12 && w % 7 === 0) {
      const lead = rogueLeader(s);
      if (lead && chance(0.5)) randomTrait(lead);
      for (const c of rivalCreatures(s)) if (chance(0.5)) { randomTrait(c); bossXp(c, 200); }
    }
    if (w === 18 && once(s, 'mars18')) {
      const r = weakestRival(s);
      if (r) { godChampion(s, 'ares', r, 'Mars has chosen a butcher.'); r.denarii += 1000; addKeepers(r, 2); }
    }
  },
  [ASC.apollo]: (s, w) => {
    if (w < 100 && w % 24 === 0) for (const c of [...rivalCreatures(s), ...s.unknown.creatures]) c.bonus.cun += 1;
    if (w % 11 === 0 && s.world.horde.spoils > 1500) { s.world.horde.spoils -= 500; newRogue(s, idiv(w, 15) + 1); }
  },
  [ASC.gaia]: (s, w) => {
    if (w % 20 === 0 && s.world.horde.spoils > 1500) newRogue(s, idiv(w, 15) + 1);
    if (w === 20 && once(s, 'gaia20')) for (const r of activeRivals(s)) addKeepers(r, 1, 'spies');
    if (w === 26 && once(s, 'gaia26')) {
      for (const r of activeRivals(s)) { addKeepers(r, 1, 'wardens'); buildingUp(r, 'veterinarium', 2); }
      godChampion(s, 'minotaur', weakestRival(s), 'From the labyrinth below Capua:');
    }
  },
  [ASC.hyperion]: (s, w) => {
    if (w === 20 && s.world.difficulty.hard && once(s, 'hyperion20')) {
      const r = strongestRival(s);
      if (r) giveGear(r, newGear('amberShard', 2));
    }
  },
  [ASC.tartarus]: (s, w) => {
    if (w === 33 && once(s, 'tartarus33')) {
      const r = weakestRival(s);
      const c = godChampion(s, 'draugluin', r, 'Something howls under the full moon.');
      if (c) c.sex = 'M';
    }
  },
  [ASC.cronus]: (s, w) => {
    if (w === 13 && once(s, 'cronus13') && !rivalByKey(s, 'hannibal')) {
      const h = spawnRival(s, 'hannibal');
      message(s, 'herald', 'Hannibal returns', `Cronus has swung Hannibal Barca forward in time. His ludus, House ${h.name}, has opened its gates in Capua, and his war-saurians are hungry.`);
    }
    if (w === 20 && once(s, 'cronus20')) godChampion(s, 'perseus', weakestRival(s), 'The fabled Perseus has been swung forward in time by Cronus.');
  },
};

function giveRider(s: GameState, r: Ludus | undefined): void {
  if (!r) return;
  giveGear(r, newGear('celticSpearman', 2));
  buildingUp(r, 'saddlery', 1);
}

/** GM permanent buffs on Spartacus at Jupiter, Mars and Tartarus (applied once he exists). */
function spartacusBuffs(state: GameState): void {
  const sp = findLegend(state, 'spartacus')?.creature;
  if (!sp) return;
  sp.counters ??= {};
  if (asc(state, ASC.jupiter) && !sp.counters.ascJupiter) {
    sp.counters.ascJupiter = 1;
    bossXp(sp, 100);
    addTrait(sp, 'Hero');
  }
  if (asc(state, ASC.mars) && !sp.counters.ascMars) {
    sp.counters.ascMars = 1;
    addTrait(sp, 'Veteran');
    addTrait(sp, 'Preparation');
    bossXp(sp, 1000);
  }
  if (asc(state, ASC.tartarus) && !sp.counters.ascTartarus) {
    sp.counters.ascTartarus = 1;
    addTrait(sp, 'AllIn');
    if (!sp.techniques.some((t) => t.id === 'Decimate')) sp.techniques.push({ id: 'Decimate', rank: 1, equipped: true });
  }
}

/** Weekly/timed effects for every level ≤ current. */
export function ascensionTurnEffects(state: GameState): void {
  const L = clamp(state.world.ascension, 0, MAX_ASCENSION);
  const week = state.world.week;
  for (let lv = 1; lv <= L; lv++) TURN[lv]?.(state, week);
  if (L > 0) spartacusBuffs(state);
  // Ascendancy: the reincarnated champion gains 15 − week tameness every week before week 15
  if (hasUpgrade(state, 'ascendancy') && week < 15) {
    for (const c of me(state).creatures) {
      if (hasTrait(c, 'Reincarnated') || hasTrait(c, 'ReincarnatedBeast')) c.loyalty = Math.min(100, c.loyalty + (15 - week));
    }
  }
}

// ---------------------------------------------------------------------------
// Requirements, gauntlet, victory
// ---------------------------------------------------------------------------

/** GM hasAscensionRequirements: trophies (+senator) ≥ 4 (5 at Mars), horde defeated, shrine. */
export function ascensionProgress(state: GameState): { trophies: number; needed: number; hordeDefeated: boolean; shrine: boolean; ready: boolean } {
  const trophies = firstPlaces(me(state)) + (state.player.senator ? 1 : 0);
  const needed = asc(state, ASC.mars) ? 5 : 4;
  const hordeDefeated = !!state.world.horde.defeated;
  const shrine = (me(state).buildings.shrine ?? 0) > 0;
  const week = state.world.week;
  const timing = state.ascended ? week % 50 === 0 : week % 2 === 0;
  return { trophies, needed, hordeDefeated, shrine, ready: trophies >= needed && hordeDefeated && shrine && timing };
}

/** Number of bonus rounds of the Ascension tournament at the current level (GM: rounds 1…L+2). */
export function ascensionBonusRounds(state: GameState): number {
  return clamp(state.world.ascension, 0, MAX_ASCENSION) + 2;
}

/**
 * Opponents for bonus round n of the Ascension tournament (GM table, rounds 1…L+2). Their harness is carried
 * as arena gear notes (no house armory); the second-to-last round's opponent fights All Out.
 */
export function ascensionFoes(state: GameState, round: number): Creature[] {
  if (round < 1) return [];
  const specs = ASCENSION_FOES[Math.min(round, ASCENSION_FOES.length) - 1];
  const foes = specs.map((spec) => buildFoe(spec));
  if (round === ascensionBonusRounds(state) - 1) for (const c of foes) c.instruction = 'allout';
  for (const c of foes) c.legend = `ascension${round}`;
  return foes;
}

/** Same foes plus their harness as Gear objects (for callers that build sides without the note convention). */
export function ascensionFoeSet(state: GameState, round: number): { creatures: Creature[]; gear: Gear[] } {
  const creatures = ascensionFoes(state, round);
  const gear: Gear[] = [];
  for (const c of creatures) {
    for (const n of c.notes ?? []) {
      const g = parseGearNote(n);
      if (!g) continue;
      const piece = newGear(g.type, g.quality, { augment: g.augment, unique: g.unique });
      gear.push(piece);
      c.gear[g.slot] = piece.id;
    }
  }
  return { creatures, gear };
}

function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Called when the player clears the Ascension tournament: account level, champion record, Ascended trait. */
export function onAscensionVictory(state: GameState, champion: Creature, meta: Meta): void {
  const key: DifficultyKey = difficultyKey(state);
  const L = clamp(state.world.ascension, 0, MAX_ASCENSION);
  addTrait(champion, 'Ascended');
  state.ascended = true;
  message(state, 'oracle', 'Ascension beckons', `${champion.name} has defeated the gods' champions and ascension beckons! A new run can begin under ${L < MAX_ASCENSION ? ASCENSION_LEVELS[L].name : 'the last of the gods'}.`);
  if (state.world.difficulty.sandbox) return;
  meta.ascension[key] = Math.min(MAX_ASCENSION, Math.max(meta.ascension[key] ?? 0, L + 1));
  let beast: Creature | undefined;
  if (hasUpgrade(state, 'undyingLoyalty')) {
    beast = [...me(state).creatures].filter((c) => c.kind === 'beast' && !SPECIES[c.species].mythic)
      .sort((a, b) => (b.id === me(state).bondedId ? 1 : 0) - (a.id === me(state).bondedId ? 1 : 0) || b.fame - a.fame)[0];
  }
  meta.champions[key] = { creature: deepCopy(champion), difficulty: key, level: L, week: state.world.week, beast: beast ? deepCopy(beast) : undefined };
  const prophecy = (meta.prophecy[key] ?? 0) > 0;
  const ids: AchievementId[] = ['ascension'];
  const divine = L >= 4 || (prophecy && L >= 3);
  const radiance = L >= 9 || (prophecy && L >= 8);
  const d = state.world.difficulty;
  if (divine) {
    ids.push('divine');
    if (d.hard) ids.push('divineHard');
    if (d.nightmare) ids.push('divineNightmare');
  }
  if (radiance) {
    ids.push('radiance');
    if (d.hard) ids.push('radianceHard');
    if (d.nightmare) ids.push('radianceNightmare');
  }
  for (const id of ids) unlockAchievement(state, id);
}

/** Apply run results that need the account (prophecy level). Call when saving the run's meta. */
export function syncAscensionMeta(state: GameState, meta: Meta): void {
  if (state.world.difficulty.sandbox) return;
  const key = difficultyKey(state);
  const won = Number(state.world.flags.prophecyWon ?? 0);
  if (won > 0) meta.prophecy[key] = Math.min(MAX_ASCENSION, Math.max(meta.prophecy[key] ?? 0, won));
}

/** Highest level a new game may start at (GM: max(ascension, prophecy + 1)). */
export function selectableAscension(meta: Meta, key: DifficultyKey): number {
  const a = meta.ascension[key] ?? 0;
  const p = meta.prophecy[key] ?? 0;
  return Math.min(MAX_ASCENSION, Math.max(a, p > 0 ? p + 1 : 0));
}

// ---------------------------------------------------------------------------
// Reincarnation
// ---------------------------------------------------------------------------

const YOUNG_TARGET = { str: 8, agi: 8, cun: 8, hp: 30 };
const KEEP_ALWAYS: TraitId[] = ['Albino', 'Blind', 'Fertile', 'Sterile'];

function validForReincarnation(t: TraitId): boolean {
  const d = TRAITS[t];
  if (!d) return false;
  if (t === 'Reincarnated' || t === 'ReincarnatedBeast' || t === 'Ascended') return false;
  return !!d.reincarnationValid || d.sources.includes('B') || t === 'Titan';
}

/**
 * Build the reincarnated champion for a new run (GM §8.2).
 *  - young: equivalent age 15 (maturity 15/18), stats reset to GM's 8/8/8/30 body through a stat offset (the
 *    wild points, colours and mutation counters are untouched, so the bloodline breeds true), first technique,
 *    1 valid trait (2 with Ascendancy; Titan → Giant; Albino and Blind stay), Reincarnated,
 *    reincarnation += min(old + 1, level). Beasts keep their natural line and techniques.
 *  - old: everything kept, aged to eqAge = eqAge/20 + 54, Ill 2 weeks (3 at Apollo), +30 tameness, Ascended removed.
 */
export function reincarnate(champion: Creature, mode: 'young' | 'old', level: number, ascendancy: boolean, bonus = 0): Creature {
  const src = deepCopy(champion);
  const c: Creature = {
    ...src,
    id: newId('c'),
    gear: {},
    away: undefined,
    inactive: false,
    injury: null,
    pregnancy: undefined,
    imprintRequest: null,
    mateCooldown: 0,
    rewardCooldown: 0,
    rebellionGrace: false,
    spyFor: undefined,
    price: undefined,
    epic: undefined,
    offerToRivals: false,
    hungerWeeks: 0,
    treatedThisWeek: false,
    legend: undefined,
    genes: { ...src.genes, wild: { ...src.genes.wild }, colors: [...src.genes.colors], mutations: [...src.genes.mutations], mutatedPoints: { ...src.genes.mutatedPoints } },
    notes: [...(src.notes ?? []), `Reincarnated at Ascension ${level} (${mode}).`],
  };
  const sp = SPECIES[c.species];
  if (mode === 'old') {
    removeTrait(c, 'Ascended');
    const e = eqAge(src) / 20 + 54;
    c.maturity = 1;
    c.adultWeeks = Math.floor((e - 18) * 52);
    c.ageWeeks = sp.matureWeeks + c.adultWeeks;
    c.ill = Math.max(c.ill, level >= ASC.apollo ? 3 : 2);
    c.loyalty = Math.min(100, c.loyalty + 30);
    return c;
  }

  // ---- young
  const oldTraits = [...src.traits];
  const keepN = ascendancy ? 2 : 1;
  // clear traits (and their stat bonuses) and per-life progress
  c.traits = [];
  c.bonus = zeroStats();
  c.dom = zeroStats();
  c.xp = 0;
  c.level = 1;
  c.statPoints = 0;
  c.techPoints = 1;
  c.cls = null;
  c.prof = zeroProf();
  c.fame = 0;
  c.career = emptyCareer();
  c.loyalty = 80;
  c.ill = 0;
  c.happiness = 0;
  c.lastGearWorth = 0;
  c.counters = {};
  c.reincarnation = src.reincarnation + Math.min(src.reincarnation + 1, Math.max(1, level)) + bonus;
  c.classXp = c.reincarnation >= 10 ? 2 : 0;
  if (c.reincarnation > 5) for (const f of Object.keys(c.prof) as WeaponFamily[]) c.prof[f] = 5;

  if (sp.kind === 'beast') {
    c.maturity = 1;
    c.adultWeeks = 0;
    c.ageWeeks = sp.matureWeeks;
    c.techniques = sp.natural.map((t) => ({ id: t, rank: 1, equipped: true }));
    for (const t of sp.innateTraits ?? []) addTrait(c, t);
  } else {
    const eq = 15 + 1e-6;
    c.maturity = eq / 18;
    c.adultWeeks = 0;
    c.ageWeeks = Math.floor(c.maturity * sp.matureWeeks);
    // GM 8/8/30/8 body: offset the genetic part so raw stats hit the target (reincarnation bonuses come on top)
    const reincBonus = (s: keyof typeof YOUNG_TARGET) => {
      const r = c.reincarnation;
      if ((s === 'str' || s === 'agi') && r > 3) return 1;
      if (s === 'cun' && r > 4) return 1;
      if (s === 'hp' && r > 7) return 5;
      return 0;
    };
    for (const s of STATS) c.bonus[s] = YOUNG_TARGET[s] - (rawStat(c, s) - reincBonus(s));
    for (const t of sp.innateTraits ?? []) addTrait(c, t);
    // first technique (rare techniques stay learnable above Pluto)
    const first = src.techniques[0];
    c.techniques = first ? [{ id: first.id, rank: 1, equipped: true }] : (sp.natural[0] ? [{ id: sp.natural[0], rank: 1, equipped: true }] : []);
    if (level > ASC.pluto) {
      for (const t of src.techniques) if (TECHNIQUES[t.id]?.rare && !c.learnable.includes(t.id) && t.id !== c.techniques[0]?.id) c.learnable.push(t.id);
    }
  }
  // traits: up to N valid ones (Titan → Giant), then fill with random ones; Albino/Blind/fertility always stay
  let kept = 0;
  for (const t of oldTraits) {
    if (kept >= keepN) break;
    if (!validForReincarnation(t) || KEEP_ALWAYS.includes(t)) continue;
    if (sp.innateTraits?.includes(t)) continue;
    const add: TraitId = t === 'Titan' ? 'Giant' : t;
    if (addTrait(c, add)) kept++;
  }
  let guard = 20;
  while (kept < keepN && guard-- > 0) if (addTrait(c, pick(RANDOM_TRAITS))) kept++;
  for (const t of KEEP_ALWAYS) if (oldTraits.includes(t)) addTrait(c, t);
  addTrait(c, sp.kind === 'beast' ? 'ReincarnatedBeast' : 'Reincarnated');
  return c;
}
