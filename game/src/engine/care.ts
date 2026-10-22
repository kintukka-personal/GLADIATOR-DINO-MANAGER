// Creature management actions. OWNER: world-economy agent. GM 05 §4.2, 02 §10.4, 03 §10.3, 01 §14.
import type { ClassId, Creature, GameState, Gear, GearEffect, GearSlot, ID, Ludus, Stat, TechId, TombRecord, TraitId } from './types';
import { STATS } from './types';
import { CLASSES } from './data/classes';
import { SPECIES } from './data/species';
import { GEAR, gearHas, gearName, isTwoHanded, makeGear } from './data/gear';
import { TRAITS, TOME_STR, TOME_AGI, TOME_CUN } from './data/traits';
import { TECHNIQUES, techRequirement } from './data/techniques';
import { chance, pick, shuffle } from './rng';
import { allHouses, asc, ASC, hasUpgrade, newId, report } from './util';
import {
  addTrait, grantXp, hasTrait, isKid, isLearnable, knownTech, learnTechnique, meetsRequirement, removeTrait,
  spendStatPoint,
} from './creature';
import { buildingTotals } from './buildings';
import { registerAncestor } from './breeding';
import { objectiveEvent } from './objectives';
import { addInfluence, addKeepers, loseKeepers } from './economy';

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'offhand', 'armor', 'helmet', 'rider', 'item'];
const SLOT_NAME: Record<GearSlot, string> = { weapon: 'weapon', offhand: 'off-hand', armor: 'barding', helmet: 'helm', rider: 'rider', item: 'item' };
const STAT_NAME: Record<Stat, string> = { str: 'Strength', agi: 'Agility', cun: 'Cunning', hp: 'Health' };

/** Items that act when used instead of being worn. */
const ON_USE: GearEffect[] = ['Silphium', 'TomeOfTraits', 'BottledLightning', 'AmberShard', 'Mutagen'];

const LEAGUE_TRAITS: TraitId[] = ['LunarChampion', 'SolarChampion', 'BacchusChampion', 'JupiterChampion', 'VulcanChampion', 'AnnumChampion'];

/** Severity order used when surgery picks which wound to fix. */
const WOUND_PRIORITY: TraitId[] = ['Crippled', 'Blind', 'BumLeg', 'PartiallyBlind', 'Concussion', 'MissingFingers', 'HorribleDisfigurement'];

function playerCreature(state: GameState, id: ID): Creature | undefined {
  return state.player.ludus.creatures.find((c) => c.id === id);
}

function armoryPiece(h: Ludus, id: ID | undefined): Gear | undefined {
  return id ? h.armory.find((g) => g.id === id) : undefined;
}

/** Who wears this piece (and in which slot)? */
export function wearerOf(h: Ludus, gearId: ID): { creature: Creature; slot: GearSlot } | undefined {
  for (const c of h.creatures) for (const s of GEAR_SLOTS) if (c.gear[s] === gearId) return { creature: c, slot: s };
  return undefined;
}

/** Take a piece off whoever wears it (ignores CannotUnequip: used when the piece leaves the armory). */
export function unassignEverywhere(h: Ludus, gearId: ID): void {
  for (const c of h.creatures) for (const s of GEAR_SLOTS) if (c.gear[s] === gearId) delete c.gear[s];
}

/** Remove a creature from a house: roster, breeding pairs, doctore, bond, overrides, sparring. Gear stays in the armory. */
export function removeFromHouse(state: GameState, h: Ludus, c: Creature): void {
  h.creatures = h.creatures.filter((x) => x.id !== c.id);
  h.pairs = h.pairs.filter((p) => p.maleId !== c.id && p.femaleId !== c.id);
  if (h.doctoreId === c.id) h.doctoreId = undefined;
  if (h.bondedId === c.id) h.bondedId = undefined;
  if (h.training?.overrides) delete h.training.overrides[c.id];
  if (h.training?.sparring) h.training.sparring = h.training.sparring.filter((s) => s.a !== c.id && s.b !== c.id);
  c.gear = {};
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

export function assignGear(state: GameState, creatureId: ID, slot: GearSlot, gearId: ID | null): string | null {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.kind === 'beast') return 'Beasts fight with tooth and claw. They eat harness.';
  const current = armoryPiece(h, c.gear[slot]);
  if (current && current.id !== gearId && gearHas(current, 'CannotUnequip')) return `${gearName(current)} will not come off ${c.name}.`;
  if (gearId === null) {
    delete c.gear[slot];
    return null;
  }
  const g = armoryPiece(h, gearId);
  if (!g) return 'That piece is not in your armory.';
  const d = GEAR[g.type];
  if (ON_USE.some((e) => gearHas(g, e))) return `${d.name} is used, not worn.`;
  const fits = d.slot === slot || (slot === 'offhand' && d.slot === 'weapon' && gearHas(g, 'DualWieldable'));
  if (!fits) return `${d.name} does not go in the ${SLOT_NAME[slot]} slot.`;
  if (slot === 'rider' && isKid(c)) return `${c.name} is too young to carry a rider.`;
  if (gearHas(g, 'FamilyItem') && h.bondedId !== c.id && !hasTrait(c, 'Adopted')) return 'Only your bonded dino may wear the family crest.';
  const titanic = hasTrait(c, 'TitanicStrength');
  if (slot === 'offhand' && !titanic && isTwoHanded(armoryPiece(h, c.gear.weapon))) return `${c.name}'s main weapon needs both forelimbs.`;
  const worn = wearerOf(h, g.id);
  if (worn && !(worn.creature === c && worn.slot === slot) && gearHas(g, 'CannotUnequip')) return `${gearName(g)} will not come off ${worn.creature.name}.`;
  let clearOffhand = false;
  if (slot === 'weapon' && isTwoHanded(g) && !titanic && c.gear.offhand && c.gear.offhand !== g.id) {
    const off = armoryPiece(h, c.gear.offhand);
    if (off && gearHas(off, 'CannotUnequip')) return `${gearName(off)} will not come off, and ${d.name} needs both forelimbs.`;
    clearOffhand = true;
  }
  unassignEverywhere(h, g.id);
  c.gear[slot] = g.id;
  if (clearOffhand) delete c.gear.offhand;
  return null;
}

/** Use an item that acts on assign (Silphium, Bestiary Scroll, Bottled Lightning, Amber Shard, Mutagen). Returns choices for scroll/silphium. */
export function useItem(state: GameState, creatureId: ID, gearId: ID, choice?: TraitId | TechId): { ok: boolean; text: string; choices?: (TraitId | TechId)[] } {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return { ok: false, text: 'That creature is not in your ludus.' };
  const g = armoryPiece(h, gearId);
  if (!g) return { ok: false, text: 'That item is not in your armory.' };
  if (c.kind === 'beast' && !gearHas(g, 'Mutagen')) return { ok: false, text: `${c.name} tried to eat it. Beasts cannot use items.` };
  const key = `useItem:${g.id}:${c.id}`;
  const consume = () => {
    unassignEverywhere(h, g.id);
    h.armory = h.armory.filter((x) => x.id !== g.id);
    delete state.player.storyData[key];
  };
  if (gearHas(g, 'Silphium')) {
    if (!c.techniques.length) return { ok: false, text: `${c.name} knows no techniques to forget.` };
    let offered = state.player.storyData[key] as TechId[] | undefined;
    if (!Array.isArray(offered) || offered.some((t) => !knownTech(c, t))) {
      offered = shuffle(c.techniques.map((t) => t.id)).slice(0, 3);
      state.player.storyData[key] = offered;
    }
    if (!choice) return { ok: false, text: 'Choose a technique to forget.', choices: offered };
    if (!offered.includes(choice as TechId)) return { ok: false, text: 'Pick one of the offered techniques.', choices: offered };
    const k = knownTech(c, choice as TechId)!;
    c.techniques = c.techniques.filter((t) => t.id !== k.id);
    if (c.techOrder) c.techOrder = c.techOrder.filter((t) => t !== k.id);
    c.techPoints += k.rank;
    c.loyalty = Math.min(100, c.loyalty + 20);
    consume();
    return { ok: true, text: `${c.name} forgot ${TECHNIQUES[k.id].name} (${k.rank} point${k.rank === 1 ? '' : 's'} back) and is pleasantly sedated. +20 tameness.` };
  }
  if (gearHas(g, 'TomeOfTraits')) {
    let offered = state.player.storyData[key] as TraitId[] | undefined;
    if (!Array.isArray(offered) || offered.some((t) => c.traits.includes(t))) {
      offered = [TOME_STR, TOME_AGI, TOME_CUN]
        .map((list) => list.filter((t) => !c.traits.includes(t)))
        .filter((list) => list.length)
        .map((list) => pick(list));
      state.player.storyData[key] = offered;
    }
    if (!offered.length) return { ok: false, text: `${c.name} already knows everything the scroll could teach.` };
    if (!choice) return { ok: false, text: 'Choose a trait to learn from the scroll.', choices: offered };
    if (!offered.includes(choice as TraitId)) return { ok: false, text: 'Pick one of the offered traits.', choices: offered };
    addTrait(c, choice as TraitId);
    consume();
    return { ok: true, text: `${c.name} studied the bestiary and gained ${TRAITS[choice as TraitId].name}. Nobody knows how it read it.` };
  }
  if (gearHas(g, 'BottledLightning')) {
    if (c.kind !== 'dino') return { ok: false, text: 'Beasts do not hold lightning well.' };
    const k = knownTech(c, 'Thunderstrike');
    if (k && k.rank >= TECHNIQUES.Thunderstrike.maxRank) return { ok: false, text: `${c.name} already crackles with all the lightning it can hold.` };
    if (k) k.rank++;
    else c.techniques.push({ id: 'Thunderstrike', rank: 1, equipped: true });
    c.loyalty = Math.max(0, c.loyalty - 5);
    c.ill = Math.max(c.ill, 2);
    consume();
    objectiveEvent(state, 'learned');
    return { ok: true, text: `${c.name} drank the lightning. It knows Thunderstrike now, and it is sick for two weeks. −5 tameness.` };
  }
  if (gearHas(g, 'AmberShard')) {
    if (c.kind !== 'dino') return { ok: false, text: 'Only dinos remember what the amber holds.' };
    if (c.speciesLevel >= 2) return { ok: false, text: `${c.name} already remembers its ancestors.` };
    c.speciesLevel = 2;
    consume();
    return { ok: true, text: `${c.name} stared into the amber and remembered what its ancestors knew. Species level 2.` };
  }
  if (gearHas(g, 'Mutagen')) {
    c.counters = c.counters ?? {};
    if (c.counters.mutagen) return { ok: false, text: `${c.name} has already been dosed. A second dose would only grow a third eye.` };
    for (const s of ['str', 'agi', 'hp'] as Stat[]) {
      c.genes.wild[s] = Math.min(255, c.genes.wild[s] + 1);
      c.genes.mutatedPoints[s] = (c.genes.mutatedPoints[s] ?? 0) + 1;
    }
    c.genes.mutMatri++;
    c.genes.mutPatri++;
    c.counters.mutagen = 1;
    consume();
    return { ok: true, text: `${c.name} drank the mutagen and grew visibly. +1 wild Strength, Agility and Health.` };
  }
  if (gearHas(g, 'MonsterLoot')) {
    if (g.quality < 2) return { ok: false, text: 'The trophy is not complete. Win more underworld battles.' };
    if (hasTrait(c, 'HerculeanStrength')) return { ok: false, text: `${c.name} is already Herculean.` };
    addTrait(c, 'HerculeanStrength');
    consume();
    return { ok: true, text: `${c.name} wears the monsters' remains with pride and gains Herculean Strength.` };
  }
  return { ok: false, text: `${gearName(g)} cannot be used like that. Equip it instead.` };
}

// ---------------------------------------------------------------------------
// Class, points, techniques
// ---------------------------------------------------------------------------

export function setClass(state: GameState, creatureId: ID, cls: ClassId | null): string | null {
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.kind !== 'dino') return 'Beasts have no fighting style but their own.';
  if (cls) {
    const d = CLASSES[cls];
    if (!d) return 'Unknown fighting style.';
    if (d.upgrade && !hasUpgrade(state, d.upgrade)) return `The ${d.name} style is locked behind an Amber upgrade.`;
  }
  if (c.cls !== cls) {
    c.cls = cls;
    c.classXp = 0;
  }
  return null;
}

export function spendPoint(state: GameState, creatureId: ID, stat: Stat): string | null {
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (!STATS.includes(stat)) return 'Unknown attribute.';
  if (!spendStatPoint(c, stat)) return `${c.name} has no attribute points to spend.`;
  return null;
}

export function learnTech(state: GameState, creatureId: ID, tech: TechId): string | null {
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  const d = TECHNIQUES[tech];
  if (!d) return 'Unknown technique.';
  const k = knownTech(c, tech);
  // the upgrade gates learning it fresh; a species' natural technique (or one already known) can always rank up
  if (d.upgrade && !hasUpgrade(state, d.upgrade) && !k && !SPECIES[c.species].natural.includes(tech)) {
    return `${d.name} is locked behind an Amber upgrade.`;
  }
  if (!k && !isLearnable(c, tech)) return `${c.name} cannot learn ${d.name}.`;
  if (k && k.rank >= d.maxRank) return `${c.name} has mastered ${d.name}.`;
  if (c.techPoints <= 0) return `${c.name} has no technique points.`;
  const rank = (k?.rank ?? 0) + 1;
  if (!meetsRequirement(c, tech, rank)) return `${d.name} rank ${rank} needs ${STAT_NAME[d.stat]} ${techRequirement(tech, rank)}.`;
  if (!learnTechnique(c, tech)) return `${c.name} could not learn ${d.name}.`;
  objectiveEvent(state, 'learned');
  return null;
}

export function toggleTech(state: GameState, creatureId: ID, tech: TechId): string | null {
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  const k = knownTech(c, tech);
  if (!k) return `${c.name} does not know that technique.`;
  k.equipped = !k.equipped;
  return null;
}

export function setTechOrder(state: GameState, creatureId: ID, order: TechId[]): void {
  const c = playerCreature(state, creatureId);
  if (!c) return;
  const seen = new Set<TechId>();
  c.techOrder = order.filter((t) => knownTech(c, t) && !seen.has(t) && (seen.add(t), true));
}

// ---------------------------------------------------------------------------
// Bonding, surgery, treats, names
// ---------------------------------------------------------------------------

/** Bond (GM adoption): 25 denarii, fame > 20, one at a time. */
export function bond(state: GameState, creatureId: ID, newName?: string): string | null {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.kind !== 'dino') return 'Only dinos can be bonded.';
  if (hasTrait(c, 'Adopted')) return `${c.name} is already bonded to you.`;
  const other = h.creatures.find((x) => x.id === h.bondedId || hasTrait(x, 'Adopted'));
  if (other) return `${other.name} is already your bonded dino. One heir at a time.`;
  if (c.fame <= 20) return `${c.name} needs more than 20 fame before the family will accept it.`;
  if (h.denarii < 25) return 'The bonding ceremony costs 25 denarii.';
  h.denarii -= 25;
  const nm = newName?.trim();
  if (nm) c.name = nm.slice(0, 24);
  c.fame += 5;
  addTrait(c, 'Adopted');
  h.bondedId = c.id;
  if (hasUpgrade(state, 'championsCrest')) h.armory.push(makeGear('championsCrest', 1, newId('g')));
  return null;
}

/** Surgery at the Veterinarium: 100 denarii, removes a wound trait; can kill. */
export function surgery(state: GameState, creatureId: ID): { ok: boolean; text: string } {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return { ok: false, text: 'That creature is not in your ludus.' };
  const slots = buildingTotals(h).surgeries;
  if (slots < 1) return { ok: false, text: 'Build a Veterinarium first.' };
  if (h.surgeriesThisWeek >= slots) return { ok: false, text: 'The vets have operated enough this week. One of them fainted.' };
  if (c.away) return { ok: false, text: `${c.name} is away.` };
  const wounds = WOUND_PRIORITY.filter((t) => c.traits.includes(t));
  const other = c.traits.filter((t) => TRAITS[t]?.wound && !wounds.includes(t));
  const target = wounds[0] ?? other[0];
  if (!target) return { ok: false, text: `${c.name} has no lasting wound to operate on.` };
  if (h.denarii < 100) return { ok: false, text: 'Surgery costs 100 denarii.' };
  h.denarii -= 100;
  h.surgeriesThisWeek++;
  objectiveEvent(state, 'surgery');
  const risk = asc(state, ASC.pluto) ? 0.2 : 0.1;
  if (chance(risk)) {
    h.denarii += 50;
    const name = c.name;
    bury(state, c, 'Died on the operating table');
    return { ok: false, text: `${name} died under the knife. The vets refunded 50 denarii and avoided eye contact.` };
  }
  removeTrait(c, target);
  return { ok: true, text: `The vets fixed ${c.name}'s ${TRAITS[target].name.toLowerCase()}. It bit one of them, which is a good sign.` };
}

/** Beast treat: 10 denarii, once per week, +5 XP. */
export function treat(state: GameState, creatureId: ID): string | null {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.kind !== 'beast') return 'Only beasts take treats. Dinos take bribes.';
  if (c.treatedThisWeek) return `${c.name} already had a treat this week.`;
  if (h.denarii < 10) return 'A treat costs 10 denarii.';
  h.denarii -= 10;
  c.treats = (c.treats ?? 0) + 1;
  c.treatedThisWeek = true;
  grantXp(c, 5);
  return null;
}

export function rename(state: GameState, creatureId: ID, name: string): string | null {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  const nm = name.trim().slice(0, 24);
  if (!nm) return 'A name, please. Even "Lunch" will do.';
  if (nm === c.name) return null;
  if (h.denarii < 25) return 'The scribe charges 25 denarii.';
  h.denarii -= 25;
  c.name = nm;
  objectiveEvent(state, c.kind === 'beast' ? 'renamedBeast' : 'renamed');
  return null;
}

/** Turn a creature loose to the wild (GM convert-to-slave analogue: +1 keeper as a handler pays you 50). */
export function retire(state: GameState, creatureId: ID): string | null {
  const h = state.player.ludus;
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.away) return `${c.name} is away.`;
  if (c.pregnancy) return `${c.name} is carrying young. Not now.`;
  removeFromHouse(state, h, c);
  registerAncestor(state, c, h.name, 'Released to the wild');
  addKeepers(h, 1);
  h.denarii += 50;
  return null;
}

/** Resurrection through the Temple of Pluto (Reincarnated only, ascension ≥ 1 or sandbox). */
export function resurrect(state: GameState, tombId: ID): string | null {
  const p = state.player;
  const h = p.ludus;
  const rec = p.tomb.find((t) => t.id === tombId);
  if (!rec) return 'Nobody by that name rests in your tomb.';
  if (!buildingTotals(h).favoured) return 'Only a Temple of Pluto can bargain with the underworld.';
  if (!(asc(state, 1) || state.world.difficulty.sandbox)) return 'Pluto only deals with those who have ascended.';
  const dead = rec.creature;
  if (!dead.traits.includes('Reincarnated') && !dead.traits.includes('ReincarnatedBeast')) return 'Pluto only returns the Reincarnated.';
  const cost = resurrectionCost(rec);
  if (h.denarii < cost) return `Pluto wants ${cost} denarii.`;
  h.denarii -= cost;
  loseKeepers(state, h, 1);
  addInfluence(state, h, -Math.floor(h.influence / 10));
  for (const r of state.rivals) if (r.ai) r.ai.opinion -= 10;
  for (const o of h.creatures) o.loyalty = Math.max(0, o.loyalty - 20);
  const c: Creature = JSON.parse(JSON.stringify(dead));
  c.gear = {};
  c.away = undefined;
  c.pregnancy = undefined;
  c.inactive = false;
  addTrait(c, 'Undeath');
  c.injury = { type: 'severe', weeks: 4 };
  h.creatures.push(c);
  p.tomb = p.tomb.filter((t) => t.id !== tombId);
  registerAncestor(state, c, h.name);
  return null;
}

export function resurrectionCost(rec: TombRecord): number {
  const c = rec.creature;
  return 100 * c.level + 1000 + Math.floor(c.fame / 5) + 50 * c.traits.length;
}

export function setDoctore(state: GameState, creatureId: ID | null): string | null {
  const h = state.player.ludus;
  if (creatureId === null) {
    h.doctoreId = undefined;
    return null;
  }
  const c = playerCreature(state, creatureId);
  if (!c) return 'That creature is not in your ludus.';
  if (c.kind !== 'dino') return 'A beast cannot drill the pack.';
  if (c.maturity < 0.5) return `${c.name} is too young to teach anyone anything.`;
  h.doctoreId = c.id;
  return null;
}

export function toggleFavourite(state: GameState, creatureId: ID): void {
  const c = playerCreature(state, creatureId);
  if (c) c.favourite = !c.favourite;
}

export function toggleOfferToRivals(state: GameState, creatureId: ID): void {
  const c = playerCreature(state, creatureId);
  if (c) c.offerToRivals = !c.offerToRivals;
}

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

function tombScore(t: TombRecord): number {
  return t.fame + t.level + 10 * t.leagues;
}

/** Record a creature leaving the world (death, sale) into the ancestry registry and the tomb. */
export function bury(state: GameState, c: Creature, cause: string): void {
  const h = allHouses(state).find((x) => x.creatures.some((y) => y.id === c.id));
  if (h) {
    removeFromHouse(state, h, c);
    h.denarii += 50;
    if (h === state.player.ludus) {
      const rec: TombRecord = {
        id: newId('t'), name: c.name, species: c.species, level: c.level, fame: c.fame, week: state.world.week, cause,
        leagues: c.traits.filter((t) => LEAGUE_TRAITS.includes(t)).length, creature: JSON.parse(JSON.stringify(c)),
      };
      state.player.tomb.push(rec);
      while (state.player.tomb.length > 5) {
        let worst = 0;
        state.player.tomb.forEach((t, i) => { if (tombScore(t) < tombScore(state.player.tomb[worst])) worst = i; });
        state.player.tomb.splice(worst, 1);
      }
      state.runStats.deaths++;
      report(state, 'bad', `${c.name} was laid to rest (${cause}). Burial money`, 50);
    }
  } else {
    c.gear = {};
    state.world.horde.rogues = state.world.horde.rogues.filter((x) => x.id !== c.id);
  }
  // keep pedigree records for bloodlines only (bred creatures, parents, the player's own)
  if (c.genes.bred || c.offspring > 0 || state.ancestry[c.id] || h === state.player.ludus) registerAncestor(state, c, h?.name, cause);
}
