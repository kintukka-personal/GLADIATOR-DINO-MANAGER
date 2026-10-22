// Shared fixture for the story / objective / meta / ascension tests (systems-story agent).
// Builds a minimal GameState by hand (shape copied from newgame.ts) and provides mock implementations of the
// modules owned by other engineers. Mock factories load this file with a dynamic import.

import { vi } from 'vitest';
import type {
  Adventure, BuildingId, Creature, GameState, KeeperJob, Ludus, Meta, RivalKey, SpeciesId, Stats, TraitId,
} from '../src/engine/types';
import { makeNamed } from '../src/engine/creature';
import { setSeed } from '../src/engine/rng';

const ALL_BUILDINGS: BuildingId[] = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery',
  'templeOfPluto', 'library', 'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop',
  'guardTower', 'aqueduct', 'romeMansion', 'tavern', 'bathHouse'];

let idc = 0;
export function makeHouse(name: string, isPlayer: boolean, denarii = 1000): Ludus {
  idc++;
  return {
    id: `h${idc}`, name, isPlayer, denarii, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0,
    entBonus: 0, securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 0, spies: 0 }, spiesLastWeek: 0,
    buildings: Object.fromEntries(ALL_BUILDINGS.map((b) => [b, 0])) as Record<BuildingId, number>, builtThisWeek: false,
    creatures: [], armory: [], pantry: {}, eggs: [], pairs: [], bankruptLastWeek: false, unpaidThisWeek: false,
    training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
    trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
  };
}

export function makeRival(name: string, key: RivalKey, o: Partial<{ opinion: number; denarii: number; influence: number; hated: RivalKey }> = {}): Ludus {
  const h = makeHouse(name, false, o.denarii ?? 1000);
  h.influence = o.influence ?? 10;
  h.ai = {
    key,
    personality: { financial: 'balanced', arena: 'balanced', honesty: 'neutral', training: 'standard', classMindset: 'normal', prefers: [] },
    opinion: o.opinion ?? 50, hatedRival: o.hated, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  return h;
}

export function makeState(o: Partial<{ week: number; hard: boolean; nightmare: boolean; sandbox: boolean; ascension: number; seed: number }> = {}): GameState {
  setSeed(o.seed ?? 4242);
  const ludus = makeHouse('House Testus', true, 1000);
  return {
    version: 1, slot: 0, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Testus', female: false, heritage: 'roman', ludus,
      opportunities: [], treeSeed: 0, toggles: { publicSessions: false, bribeGeneral: false, loan: false },
      senator: false, consul: false, objectives: [], stories: {}, storyData: {}, messages: [], decisions: [],
      decisionHistory: [], delayed: [], adventures: [], conversations: [], registrations: {}, intrigue: [], defenses: [],
      offers: [], tomb: [], organized: 0, leagueWins: 0, invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [makeRival('Batiatus', 'batiatus', { hated: 'solonius' }), makeRival('Solonius', 'solonius', { hated: 'batiatus' })],
    unknown: makeHouse('Unknown', false, 200),
    world: {
      week: o.week ?? 10, rng: 0,
      difficulty: { hard: !!o.hard || !!o.nightmare, nightmare: !!o.nightmare, sandbox: !!o.sandbox, raidsDisabled: false, betrayalsDisabled: false },
      ascension: o.ascension ?? 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [], foodPrices: {} as GameState['world']['market']['foodPrices'], pokes: 0 },
      horde: {
        rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false,
        lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [],
      },
      laws: { publicFunding: false }, flags: {}, temperature: 20, released: [],
    },
    ancestry: {}, unlocks: [], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
}

export function emptyMetaForTest(): Meta {
  return {
    version: 1, amber: 250, achievements: [], upgrades: [], ascension: { normal: 0, hard: 0, nightmare: 0 },
    prophecy: { normal: 0, hard: 0, nightmare: 0 }, champions: {}, hallOfFame: [],
    settings: { sound: true, music: false, battleSpeed: 1, tooltips: true, reduceMotion: false, theme: 'system' },
    stats: { runs: 0, weeksPlayed: 0, bestInfluence: 0, bestWeek: 0 }, highscores: [],
  };
}

/** Adult creature with an exact raw stat line. */
export function dino(name: string, o: Partial<{ species: SpeciesId; stats: Partial<Stats>; traits: TraitId[]; sex: 'M' | 'F'; fame: number; level: number; legend: string }> = {}): Creature {
  const s: Stats = { str: 8, agi: 8, cun: 8, hp: 35, ...(o.stats ?? {}) };
  const c = makeNamed(o.species ?? 'allosaurus', name, s, { eqAge: 21, traits: o.traits ?? [], sex: o.sex ?? 'M', level: o.level, legend: o.legend });
  c.fame = o.fame ?? 0;
  return c;
}

export function addTo(h: Ludus, ...cs: Creature[]): Creature[] {
  h.creatures.push(...cs);
  return cs;
}

// ---------------------------------------------------------------------------
// Mock implementations of other engineers' modules
// ---------------------------------------------------------------------------

const keeperTotal = (h: Ludus) => Object.values(h.keepers).reduce((a, b) => a + b, 0);

export const economyMock = {
  committedSpies: vi.fn((_s: GameState, h: Ludus) => h.spiesLastWeek),
  addInfluence: vi.fn((_s: GameState, h: Ludus, n: number) => {
    const before = h.influence;
    h.influence = Math.max(0, h.influence + n);
    return h.influence - before;
  }),
  loseKeepers: vi.fn((_s: GameState, h: Ludus, n: number, job?: KeeperJob) => {
    const order: KeeperJob[] = job ? [job] : ['unassigned', 'showmen', 'miners', 'wardens', 'spies'];
    let left = n;
    for (const j of order) {
      const k = Math.min(left, h.keepers[j]);
      h.keepers[j] -= k;
      left -= k;
    }
    return n - left;
  }),
  addKeepers: vi.fn((h: Ludus, n: number, job: KeeperJob = 'unassigned') => { h.keepers[job] += n; }),
  keeperCount: vi.fn((h: Ludus) => keeperTotal(h)),
};

export const sentAdventures: { key: string; ids: string[]; weeks: number; data?: Record<string, unknown> }[] = [];
export const adventuresMock = {
  sendOnAdventure: vi.fn((state: GameState, key: string, ids: string[], weeks: number, data?: Record<string, unknown>, title?: string): Adventure => {
    sentAdventures.push({ key, ids, weeks, data });
    const adv: Adventure = { id: `adv${sentAdventures.length}`, key, title: title ?? key, creatureIds: ids, weeksLeft: weeks, data: { ...(data ?? {}) } };
    for (const c of state.player.ludus.creatures) if (ids.includes(c.id)) c.away = { kind: 'adventure', weeksLeft: weeks, ref: adv.id };
    state.player.adventures.push(adv);
    return adv;
  }),
};

export const rivalsMock = {
  changeOpinion: vi.fn((_s: GameState, r: Ludus, d: number) => { if (r.ai) r.ai.opinion += d; }),
  spawnRival: vi.fn((state: GameState, key: RivalKey) => {
    const r = makeRival(key[0].toUpperCase() + key.slice(1), key);
    state.rivals.push(r);
    return r;
  }),
  makeLegend: vi.fn((_s: GameState, key: string) => makeNamed('troodon', key[0].toUpperCase() + key.slice(1), { str: 6, agi: 8, cun: 12, hp: 30 }, {
    eqAge: 22, legend: key, level: 3, traits: ['Blind', 'Devotion'],
  })),
};

export const hordeMock = {
  hordeSize: vi.fn((s: GameState) => s.world.horde.rogues.length + s.world.horde.ferals),
  joinHorde: vi.fn(),
};

export const careMock = {
  bury: vi.fn((s: GameState, c: Creature) => {
    for (const h of [s.player.ludus, ...s.rivals]) h.creatures = h.creatures.filter((x) => x.id !== c.id);
  }),
};

export const influenceMock = {
  OPPORTUNITIES: {},
  treeFor: vi.fn(() => [] as { id: string }[][]),
  hasOpp: vi.fn(() => false),
};

export const buildingsMock = {
  BUILDINGS: {},
  buildingTotals: vi.fn(() => ({
    influence: 0, denarii: 0, beds: 4, facilities: 4, trainingPct: 0, security: 0, mineEfficiency: 0, spiesUnlocked: false, forgeTier: 0,
    surgeries: 0, injuryReduction: 0, favoured: false, pairs: 1, eggSlots: 2, tempControl: 6, nurserySlots: 3, kitchen: false,
  })),
};

export function resetMocks(): void {
  sentAdventures.length = 0;
  for (const m of [economyMock, adventuresMock, rivalsMock, hordeMock, careMock, influenceMock, buildingsMock]) {
    for (const v of Object.values(m)) if (typeof v === 'function' && 'mockClear' in v) (v as { mockClear: () => void }).mockClear();
  }
}
