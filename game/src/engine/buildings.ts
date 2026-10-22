// Estate construction. OWNER: world-economy agent. GM 02 §8 + DESIGN.md §7 (breeding buildings).
//
// GM rules kept: one construction per week, instant build, only denarii are consumed (keepers, creatures,
// influence and residence level are thresholds), Ariminium/Rome locations gated by their level-1 building,
// gem-upgrade gates, ascension surcharges (Venus/Juno). Fixed GM bugs: Bath House benefits are counted and
// the Veterinarium (Medicus) L2 beds are counted.
import type { BuildingId, GameState, Ludus, UpgradeId } from './types';
import { rand } from './rng';
import { asc, ASC, hasUpgrade } from './util';
import { objectiveEvent } from './objectives';

export interface BuildingLevelDef {
  denarii: number; keepers: number; creatures: number; influence: number; residence: number;
}

/** Weekly benefits of a building at one level (index = level, 0 = not built). */
export interface BuildingBenefit {
  influence?: number; denarii?: number; beds?: number; facilities?: number; trainingPct?: number; security?: number;
}

/** Ascension construction surcharge (GM 02 §8.1): Venus amount + Juno amount, × mult[level index]. */
export interface BuildingSurcharge { venus: number; juno: number; mult: number[] }

export interface BuildingDef {
  id: BuildingId;
  name: string;
  location: 'capua' | 'ariminium' | 'rome';
  levels: BuildingLevelDef[];      // index 0 = cost to build level 1
  upgrade?: import('./types').UpgradeId;
  /** per-level upgrade gates (e.g. forge L2 needs masterSmith) */
  levelUpgrades?: (import('./types').UpgradeId | undefined)[];
  /** only reachable via event/story at level 1 */
  eventOnlyFirst?: boolean;
  desc: string[];                  // benefit text per level
  /** weekly benefits by level (index 0 = unbuilt) */
  benefits?: BuildingBenefit[];
  surcharge?: BuildingSurcharge;
}

const L = (denarii: number, keepers: number, creatures: number, influence: number, residence: number): BuildingLevelDef =>
  ({ denarii, keepers, creatures, influence, residence });

const SMALL: BuildingSurcharge = { venus: 50, juno: 50, mult: [1, 2, 4] };

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  // ---------------------------------------------------------------- Capua
  residence: {
    id: 'residence', name: 'Residence', location: 'capua',
    levels: [L(300, 4, 0, 25, 0), L(800, 12, 0, 50, 0), L(2000, 20, 0, 100, 0), L(5000, 30, 0, 250, 0)],
    benefits: [
      { beds: 15 },
      { influence: 2, denarii: 25, beds: 40, security: 1 },
      { influence: 3, denarii: 50, beds: 60, security: 2 },
      { influence: 5, denarii: 100, beds: 150, security: 4 },
      { influence: 8, denarii: 150, beds: 300, security: 10 },
    ],
    surcharge: { venus: 50, juno: 100, mult: [1, 2, 4, 10] },
    desc: [
      'A villa with room for 40 keepers. +2 influence, +25 denarii a week.',
      'Room for 60 keepers. +3 influence, +50 denarii a week. Spies can be assigned.',
      'Room for 150 keepers. +5 influence, +100 denarii a week.',
      'A palace: room for 300 keepers, +8 influence, +150 denarii a week. A library can be built.',
    ],
  },
  trainingField: {
    id: 'trainingField', name: 'Training Field', location: 'capua',
    levels: [L(100, 2, 1, 10, 0), L(500, 5, 4, 50, 1), L(750, 10, 5, 200, 2)],
    benefits: [{}, { facilities: 3, trainingPct: 25 }, { influence: 1, facilities: 10, trainingPct: 50 }, { influence: 2, facilities: 20, trainingPct: 75 }],
    surcharge: SMALL,
    desc: [
      'Pens for 3 more dinos. +25% training.',
      'Pens for 10 more dinos. +50% training, +1 influence.',
      'Pens for 20 more dinos. +75% training, +2 influence.',
    ],
  },
  mine: {
    id: 'mine', name: 'Mine', location: 'capua',
    levels: [L(250, 3, 0, 5, 0), L(500, 16, 0, 50, 2)],
    benefits: [{}, {}, { influence: 1, denarii: 5, security: 1 }],
    surcharge: SMALL,
    desc: ['Each miner digs 12 denarii a week.', 'Each miner digs 15 denarii a week. +5 denarii, +1 influence.'],
  },
  forge: {
    id: 'forge', name: 'Forge', location: 'capua',
    levels: [L(400, 12, 0, 10, 1), L(800, 20, 0, 80, 2), L(1000, 25, 0, 160, 3)],
    levelUpgrades: [undefined, 'masterSmith', 'supremeArmory'],
    benefits: [{}, { beds: 5, security: 1 }, { influence: 1, beds: 10, security: 1 }, { influence: 2, beds: 15, security: 1 }],
    surcharge: { venus: 50, juno: 100, mult: [1, 2, 4] },
    desc: ['Forge and reforge harness up to Regular.', 'Forge and reforge up to Quality.', 'Forge and reforge up to Master-crafted.'],
  },
  veterinarium: {
    id: 'veterinarium', name: 'Veterinarium', location: 'capua',
    levels: [L(300, 6, 1, 20, 1), L(500, 15, 1, 100, 3)],
    benefits: [{}, { influence: 1, trainingPct: 10 }, { influence: 2, beds: 5, trainingPct: 10, security: 1 }],
    surcharge: SMALL,
    desc: ['One surgery a week, fewer training injuries.', 'Two surgeries a week, even fewer training injuries.'],
  },
  palisade: {
    id: 'palisade', name: 'Palisade', location: 'capua',
    levels: [L(200, 5, 1, 0, 1), L(1000, 10, 1, 150, 2)],
    benefits: [{}, { influence: 1, security: 2 }, { influence: 2, security: 5 }],
    surcharge: SMALL,
    desc: ['A timber palisade. +2 security.', 'A stone wall. +5 security.'],
  },
  saddlery: {
    id: 'saddlery', name: 'Saddlery', location: 'capua',
    levels: [L(500, 5, 0, 120, 2)],
    benefits: [{}, { influence: 1, trainingPct: 10 }],
    desc: ['Riders and saddles appear in the market. +10% training.'],
  },
  templeOfPluto: {
    id: 'templeOfPluto', name: 'Temple of Pluto', location: 'capua', upgrade: 'templeOfPluto',
    levels: [L(600, 15, 0, 50, 2)],
    benefits: [{}, { influence: 2, denarii: 10, beds: 25 }],
    desc: ["Pluto's favour: every dino fights with +1 favour and +1 max health. Resurrection of the Reincarnated."],
  },
  library: {
    id: 'library', name: 'Library', location: 'capua', upgrade: 'athenianArtifacts',
    // GM lists residence 3 but only offers it once the Residence is at its maximum level (4).
    levels: [L(400, 5, 0, 50, 4)],
    benefits: [{}, { influence: 1, beds: 1, trainingPct: 5 }],
    desc: ['Scrolls and bestiaries. +5% training; more Bestiary Scrolls from merchants.'],
  },
  breedingPen: {
    id: 'breedingPen', name: 'Breeding Pen', location: 'capua',
    levels: [L(300, 4, 0, 0, 0), L(800, 10, 0, 0, 1), L(2000, 20, 0, 0, 2)],
    benefits: [{}, {}, {}, {}],
    surcharge: SMALL,
    desc: ['Room for 1 breeding pair.', 'Room for 2 breeding pairs.', 'Room for 4 breeding pairs.'],
  },
  hatchery: {
    id: 'hatchery', name: 'Hatchery', location: 'capua',
    levels: [L(250, 2, 0, 0, 0), L(700, 8, 0, 0, 1), L(1800, 15, 0, 0, 2)],
    benefits: [{}, {}, {}, {}],
    surcharge: SMALL,
    desc: [
      '2 egg slots; braziers and shade shift eggs up to 6°C toward their ideal.',
      '4 egg slots; up to 12°C of temperature control.',
      '8 egg slots; full temperature control.',
    ],
  },
  nursery: {
    id: 'nursery', name: 'Nursery', location: 'capua',
    levels: [L(200, 2, 0, 0, 0), L(600, 6, 0, 0, 1), L(1500, 12, 0, 0, 2)],
    benefits: [{}, {}, {}, {}],
    surcharge: SMALL,
    desc: ['Room for 3 babies.', 'Room for 6 babies.', 'Room for 10 babies.'],
  },
  kitchen: {
    id: 'kitchen', name: 'Kitchen', location: 'capua',
    levels: [L(150, 2, 0, 0, 0)],
    benefits: [{}, {}],
    surcharge: SMALL,
    desc: ['Cook unfertilized eggs into kibble.'],
  },
  // ---------------------------------------------------------------- Ariminium
  ariminiumCamp: {
    id: 'ariminiumCamp', name: 'Ariminium Camp', location: 'ariminium', eventOnlyFirst: true,
    levels: [L(1000, 10, 0, 50, 0), L(500, 30, 2, 300, 2), L(2000, 50, 5, 500, 3)],
    benefits: [{}, {}, { influence: 1, beds: 5 }, { influence: 1, denarii: 10, beds: 20, security: 1 }],
    desc: ['A camp near Ariminium. Unlocks building there.', 'A larger camp. +1 influence, room for 5 keepers.', 'A fortified camp. +10 denarii, room for 20 keepers.'],
  },
  shrine: {
    id: 'shrine', name: 'Shrine', location: 'ariminium',
    levels: [L(600, 10, 0, 50, 2)],
    benefits: [{}, { influence: 3, denarii: 5 }],
    surcharge: { venus: 500, juno: 1000, mult: [1] },
    desc: ['A shrine to the Pantheon. Needed for the Ascension tournament. +3 influence.'],
  },
  workshop: {
    id: 'workshop', name: 'Workshop', location: 'ariminium', upgrade: 'tinkerersWorkshop',
    levels: [L(2000, 10, 0, 300, 3)],
    benefits: [{}, { influence: 1, beds: 10 }],
    surcharge: { venus: 500, juno: 1000, mult: [1] },
    desc: ['Craft poultices, antivenom, charms, silphium and bola rigs.'],
  },
  guardTower: {
    id: 'guardTower', name: 'Guard Tower', location: 'ariminium',
    levels: [L(1000, 15, 3, 200, 2)],
    benefits: [{}, { influence: 1, beds: 5, security: 10 }],
    surcharge: { venus: 500, juno: 500, mult: [1] },
    desc: ['+10 security and one extra committed spy.'],
  },
  aqueduct: {
    id: 'aqueduct', name: 'Aqueduct', location: 'ariminium', upgrade: 'aqueduct',
    levels: [L(5000, 60, 0, 500, 3)],
    benefits: [{}, { influence: 30, denarii: 100, security: -2 }],
    desc: ['+30 influence and +100 denarii a week. Immune to droughts.'],
  },
  // ---------------------------------------------------------------- Rome
  romeMansion: {
    id: 'romeMansion', name: 'Rome Mansion', location: 'rome', eventOnlyFirst: true,
    levels: [L(300, 15, 0, 200, 0), L(500, 20, 1, 400, 2)],
    benefits: [{}, { influence: 5, denarii: -10, beds: 10, facilities: 1, security: 2 },
      { influence: 10, denarii: -20, beds: 20, facilities: 2, security: 3 }],
    desc: ['A town house in Rome. +5 influence, −10 denarii a week. Unlocks building in Rome.', 'A grand mansion. +10 influence, −20 denarii a week. Influence perks can be swapped.'],
  },
  tavern: {
    id: 'tavern', name: 'Tavern', location: 'rome',
    levels: [L(750, 20, 1, 1000, 1)],
    benefits: [{}, { influence: 10, denarii: 100, beds: 20, security: 2 }],
    surcharge: SMALL,
    desc: ['+10 influence, +100 denarii a week, +3 tameness for every dino.'],
  },
  bathHouse: {
    id: 'bathHouse', name: 'Bath House', location: 'rome', upgrade: 'aqueduct',
    levels: [L(500, 15, 1, 500, 1)],
    benefits: [{}, { influence: 5, denarii: 50, beds: 5 }],
    surcharge: SMALL,
    desc: ['+5 influence, +50 denarii a week. Your most famous dino fights with +10 max health.'],
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export const maxLevel = (id: BuildingId): number => BUILDINGS[id].levels.length;

const PAIRS = [0, 1, 2, 4];
const EGG_SLOTS = [0, 2, 4, 8];
const TEMP_CONTROL = [0, 6, 12, 999];
const NURSERY = [1, 3, 6, 10];
const MINE_EFFICIENCY = [10, 12, 15];

export interface BuildingTotals {
  influence: number; denarii: number; beds: number; facilities: number; trainingPct: number; security: number;
  mineEfficiency: number; spiesUnlocked: boolean; forgeTier: number; surgeries: number; injuryReduction: number;
  favoured: boolean; pairs: number; eggSlots: number; tempControl: number; nurserySlots: number; kitchen: boolean;
}

function lvl(h: Ludus, id: BuildingId): number {
  return Math.max(0, Math.min(maxLevel(id), h.buildings?.[id] ?? 0));
}

/** Sum of every building's benefits (GM 02 §8.3; Bath House benefits DO apply in Jurassic Ludus). */
export function buildingTotals(h: Ludus): BuildingTotals {
  const t: BuildingTotals = {
    influence: 0, denarii: 0, beds: 0, facilities: 3, trainingPct: 0, security: 0,
    mineEfficiency: MINE_EFFICIENCY[lvl(h, 'mine')] ?? 10, spiesUnlocked: lvl(h, 'residence') >= 2,
    forgeTier: lvl(h, 'forge'), surgeries: lvl(h, 'veterinarium'), injuryReduction: lvl(h, 'veterinarium'),
    favoured: lvl(h, 'templeOfPluto') >= 1, pairs: PAIRS[lvl(h, 'breedingPen')] ?? 0,
    eggSlots: EGG_SLOTS[lvl(h, 'hatchery')] ?? 0, tempControl: TEMP_CONTROL[lvl(h, 'hatchery')] ?? 0,
    nurserySlots: NURSERY[lvl(h, 'nursery')] ?? 1, kitchen: lvl(h, 'kitchen') >= 1,
  };
  for (const id of BUILDING_IDS) {
    const b = BUILDINGS[id].benefits?.[lvl(h, id)];
    if (!b) continue;
    t.influence += b.influence ?? 0;
    t.denarii += b.denarii ?? 0;
    t.beds += b.beds ?? 0;
    t.facilities += b.facilities ?? 0;
    t.trainingPct += b.trainingPct ?? 0;
    t.security += b.security ?? 0;
  }
  return t;
}

/** Ascension surcharge for building the next level (player only; GM Venus/Juno). */
export function surchargeFor(state: GameState, h: Ludus, id: BuildingId, currentLevel = lvl(h, id)): number {
  if (!h.isPlayer) return 0;
  const s = BUILDINGS[id].surcharge;
  if (!s) return 0;
  const i = (asc(state, ASC.venus) ? s.venus : 0) + (asc(state, ASC.juno) ? s.juno : 0);
  if (!i) return 0;
  return i * (s.mult[currentLevel] ?? s.mult[s.mult.length - 1] ?? 1);
}

function totalKeepers(h: Ludus): number {
  const k = h.keepers;
  return k.unassigned + k.miners + k.showmen + k.wardens + k.spies;
}

function dinoCount(h: Ludus): number {
  return h.creatures.filter((c) => c.kind === 'dino').length;
}

/** Construction check: one build per week; thresholds; ascension surcharge; upgrade gates. */
export function canBuild(state: GameState, h: Ludus, id: BuildingId): { ok: boolean; reason?: string; cost: number } {
  const def = BUILDINGS[id];
  if (!def) return { ok: false, reason: 'Unknown building.', cost: 0 };
  const cur = lvl(h, id);
  if (cur >= def.levels.length) return { ok: false, reason: `${def.name} is fully built.`, cost: 0 };
  const req = def.levels[cur];
  const cost = req.denarii + surchargeFor(state, h, id, cur);
  const fail = (reason: string) => ({ ok: false, reason, cost });
  if (cur === 0 && def.eventOnlyFirst) {
    return fail(id === 'romeMansion' ? 'A house in Rome only comes up for sale through the right connections.' : 'The Ariminium camp can only be founded through events.');
  }
  if (def.location === 'ariminium' && id !== 'ariminiumCamp' && lvl(h, 'ariminiumCamp') < 1) return fail('Needs an Ariminium Camp.');
  if (def.location === 'rome' && id !== 'romeMansion' && lvl(h, 'romeMansion') < 1) return fail('Needs a Rome Mansion.');
  if (h.isPlayer) {
    const gates: (UpgradeId | undefined)[] = [cur === 0 ? def.upgrade : undefined, def.levelUpgrades?.[cur]];
    for (const g of gates) if (g && !hasUpgrade(state, g)) return fail('Locked: needs an Amber upgrade.');
  }
  if (h.builtThisWeek) return fail('Only one construction a week. The builders are hungover.');
  if (req.residence > 0 && lvl(h, 'residence') < req.residence) return fail(`Needs Residence level ${req.residence}.`);
  if (totalKeepers(h) < req.keepers) return fail(`Needs ${req.keepers} keepers.`);
  if (dinoCount(h) < req.creatures) return fail(`Needs ${req.creatures} dino${req.creatures === 1 ? '' : 's'}.`);
  if (h.influence < req.influence) return fail(`Needs ${req.influence} influence.`);
  if (h.denarii < cost) return fail(`Needs ${cost} denarii.`);
  return { ok: true, cost };
}

export function build(state: GameState, h: Ludus, id: BuildingId): string | null {
  const c = canBuild(state, h, id);
  if (!c.ok) return c.reason ?? 'Cannot build.';
  h.denarii -= c.cost;
  h.buildings[id] = lvl(h, id) + 1;
  h.builtThisWeek = true;
  if (h.isPlayer) objectiveEvent(state, 'built:' + id);
  return null;
}

/** Raise a building one level without the usual checks (events/stories: Ariminium camp, Rome mansion). */
export function grantBuilding(h: Ludus, id: BuildingId): void {
  h.buildings[id] = Math.min(maxLevel(id), lvl(h, id) + 1);
}

const LOSS_ORDER: BuildingId[] = ['saddlery', 'templeOfPluto', 'veterinarium', 'forge', 'mine', 'palisade', 'trainingField', 'residence'];

/** GM loseRandomBuilding cascade; returns name of the building that lost a level, if any. */
export function loseRandomBuilding(h: Ludus): BuildingId | null {
  for (let i = rand(LOSS_ORDER.length); i < LOSS_ORDER.length; i++) {
    const id = LOSS_ORDER[i];
    if (lvl(h, id) > 0) {
      h.buildings[id] = lvl(h, id) - 1;
      return id;
    }
  }
  return null;
}

/** Sum of all building levels (GM "construction level"). */
export function constructionLevel(h: Ludus): number {
  return BUILDING_IDS.reduce((s, id) => s + lvl(h, id), 0);
}
