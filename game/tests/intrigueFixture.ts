// Shared test fixture for the politics systems (intrigue, bribes, influence, horde).
// Builds a minimal GameState by hand (shape copied from newgame.ts) and provides mock implementations of the
// modules owned by other engineers. Mock factories load this file with a dynamic import.

import { vi } from 'vitest';
import type {
  BattleFighter, BattleResult, BattleSide, BuildingId, Creature, GameState, KeeperJob, Ludus, RivalKey, Stats, TraitId,
} from '../src/engine/types';
import { makeNamed, generateDino } from '../src/engine/creature';
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

export function makeRival(name: string, key: RivalKey, o: Partial<{ opinion: number; honesty: 'honest' | 'neutral' | 'dishonest' | 'treacherous'; denarii: number }> = {}): Ludus {
  const h = makeHouse(name, false, o.denarii ?? 1000);
  h.ai = {
    key,
    personality: { financial: 'balanced', arena: 'balanced', honesty: o.honesty ?? 'neutral', training: 'standard', classMindset: 'normal', prefers: [] },
    opinion: o.opinion ?? 50, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  return h;
}

export function makeState(o: Partial<{ week: number; hard: boolean; nightmare: boolean; ascension: number; seed: number }> = {}): GameState {
  setSeed(o.seed ?? 12345);
  const ludus = makeHouse('House Testus', true, 1000);
  const state: GameState = {
    version: 1, slot: 0, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Testus', female: false, heritage: 'roman', ludus,
      opportunities: [], treeSeed: 0, toggles: { publicSessions: false, bribeGeneral: false, loan: false },
      senator: false, consul: false, objectives: [], stories: {}, storyData: {}, messages: [], decisions: [],
      decisionHistory: [], delayed: [], adventures: [], conversations: [], registrations: {}, intrigue: [], defenses: [],
      offers: [], tomb: [], organized: 0, leagueWins: 0, invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [makeRival('Batiatus', 'batiatus'), makeRival('Solonius', 'solonius')],
    unknown: makeHouse('Unknown', false, 200),
    world: {
      week: o.week ?? 10, rng: 0,
      difficulty: { hard: !!o.hard || !!o.nightmare, nightmare: !!o.nightmare, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
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
  return state;
}

/** Adult dino with an exact stat line (age multipliers are 1 at eqAge 20). */
export function dino(name: string, stats: Partial<Stats> = {}, traits: TraitId[] = [], extra: Partial<Creature> = {}): Creature {
  const s: Stats = { str: 6, agi: 6, cun: 6, hp: 30, ...stats };
  const c = makeNamed('allosaurus', name, s, { eqAge: 20, traits });
  Object.assign(c, extra);
  return c;
}

export function addTo(h: Ludus, ...cs: Creature[]): Creature[] {
  h.creatures.push(...cs);
  return cs;
}

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

/** GM Dominus SDR (05 §5). */
export function gmSDR(S: number): number {
  if (S < 4) return S;
  if (S < 12) return Math.trunc(S / 2) + 4 + Math.trunc(S / 4);
  if (S < 24) return Math.trunc(S / 2) + 8;
  if (S < 40) return Math.trunc(S / 3) + 12;
  if (S < 65) return Math.trunc(S / 4) + 16;
  if (S < 100) return Math.trunc(S / 6) + 24;
  return Math.trunc(S / 10) + 38;
}

export const buried: { name: string; cause: string }[] = [];

export const economyMock = {
  securityTotal: vi.fn((_s: GameState, h: Ludus) => Math.max(0, h.keepers.wardens - h.securityPenalties + 2 * (h.buildings.palisade ?? 0))),
  securityDR: vi.fn((S: number) => gmSDR(S)),
  committedSpies: vi.fn((_s: GameState, h: Ludus) => h.spiesLastWeek + ((h.buildings.guardTower ?? 0) > 0 ? 1 : 0)),
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
  entertainment: vi.fn((h: Ludus) => h.keepers.showmen + h.entBonus),
  keeperCount: vi.fn((h: Ludus) => Object.values(h.keepers).reduce((a, b) => a + b, 0)),
};

const LOSS: BuildingId[] = ['saddlery', 'templeOfPluto', 'veterinarium', 'forge', 'mine', 'palisade', 'trainingField', 'residence'];
export const buildingsMock = {
  BUILDINGS: {} as Record<string, { name: string }>,
  loseRandomBuilding: vi.fn((h: Ludus) => {
    for (const id of LOSS) if ((h.buildings[id] ?? 0) > 0) { h.buildings[id]--; return id; }
    return null;
  }),
  constructionLevel: vi.fn((h: Ludus) => Object.values(h.buildings).reduce((a, b) => a + b, 0)),
};

export const rivalsMock = {
  changeOpinion: vi.fn((_s: GameState, r: Ludus, d: number) => { if (r.ai) r.ai.opinion += d; }),
  spawnRival: vi.fn((state: GameState, key: RivalKey) => {
    const r = makeRival(key[0].toUpperCase() + key.slice(1), key);
    state.rivals.push(r);
    return r;
  }),
  makeLegend: vi.fn((_s: GameState, key: string) => {
    const c = makeNamed('allosaurus', key[0].toUpperCase() + key.slice(1), { str: 9, agi: 8, cun: 7, hp: 35 }, { eqAge: 22, legend: key, level: 3 });
    if (key === 'crixus') c.price = 250;
    return c;
  }),
};

export const careMock = {
  bury: vi.fn((_s: GameState, c: Creature, cause: string) => { buried.push({ name: c.name, cause }); }),
};

export const storiesMock = { storyHook: vi.fn() };
export const objectivesMock = { objectiveEvent: vi.fn() };

/** Combat control: who wins and who dies in the next mocked battles. */
export const combat = { winner: 0 as 0 | 1, kill: new Set<string>(), battles: 0 };

export const combatMock = {
  buildSide: vi.fn((_s: GameState, house: Ludus | undefined, creatures: Creature[], instr: unknown, opts: { name?: string; modifiers?: BattleSide['modifiers']; player?: boolean }): BattleSide => ({
    houseId: house?.id, name: opts.name ?? house?.name ?? '',
    fighters: creatures.map((c): BattleFighter => ({ creature: c, gear: {}, instruction: typeof instr === 'string' ? (instr as BattleFighter['instruction']) : null })),
    modifiers: [...(opts.modifiers ?? [])], injuryMod: 0, influence: 0, player: opts.player,
  })),
  resolveBattle: vi.fn((sides: [BattleSide, BattleSide]): BattleResult => {
    combat.battles++;
    const outcomes = sides.flatMap((s, i) => s.fighters.map((f) => ({
      creatureId: f.creature.id, side: i as 0 | 1, temporary: f.temporary, knockedOut: i !== combat.winner, yielded: false,
      died: combat.kill.has(f.creature.id), injury: null, xp: 0, fame: 0, loyalty: 0, newTraits: [], hpEnd: 0, hpMax: 30, biggestHit: 0,
    })));
    return { winner: combat.winner, decidedBy: 'ko', rounds: 3, log: [], fighters: [], outcomes };
  }),
  /** Like the real one: the dead are buried (removed from their house or from the Horde). */
  applyBattleResult: vi.fn((ctx: { state: GameState }, sides: [BattleSide, BattleSide], result: BattleResult) => {
    const names: string[] = [];
    for (const o of result.outcomes) {
      if (!o.died || o.temporary) continue;
      const f = sides[o.side].fighters.find((x) => x.creature.id === o.creatureId);
      if (!f || f.temporary) continue;
      const st = ctx.state;
      for (const h of [st.player.ludus, ...st.rivals]) h.creatures = h.creatures.filter((c) => c.id !== o.creatureId);
      st.world.horde.rogues = st.world.horde.rogues.filter((c) => c.id !== o.creatureId);
      buried.push({ name: f.creature.name, cause: 'battle' });
      names.push(f.creature.name);
    }
    return names;
  }),
};

export function resetMocks(): void {
  buried.length = 0;
  combat.winner = 0;
  combat.kill = new Set();
  combat.battles = 0;
  for (const m of [economyMock, buildingsMock, rivalsMock, careMock, storiesMock, objectivesMock, combatMock]) {
    for (const v of Object.values(m)) if (typeof v === 'function' && 'mockClear' in v) (v as { mockClear: () => void }).mockClear();
  }
}

export { generateDino };
