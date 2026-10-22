// New game creation (GM NewGame.CreateNewGame + Seed), DESIGN §2–3. OWNER: integration.

import type {
  BuildingId, Creature, Difficulty, GameState, Heritage, Ludus, Meta, PlayerData, World, Market, Horde,
} from './types';
import { setSeed, getSeed, rand } from './rng';
import { newId, setIdCounter, getIdCounter, zeroStats, message } from './util';
import { makeGear } from './data/gear';
import { FOODS, FOOD_IDS } from './data/food';
import { rollTemperature } from './breeding';
import { seedRivals } from './rivals';
import { seedCalendar, seedWeekTournaments } from './tournaments';
import { seedStarterMarket } from './market';
import { seedObjectives } from './objectives';
import { ascensionStartEffects, reincarnate } from './ascension';

export const SAVE_VERSION = 1;

export interface NewGameOptions {
  lanista: string;
  ludusName?: string;
  female: boolean;
  heritage: Heritage;
  hard: boolean;
  nightmare: boolean;
  sandbox: boolean;
  raidsDisabled: boolean;
  betrayalsDisabled: boolean;
  ascension: number;
  slot: number;
  /** reincarnate the account champion (Ascension runs) */
  reincarnation?: 'young' | 'old';
  seed?: number;
}

export const RESERVED_NAMES = ['batiatus', 'magnus', 'decimus', 'salonius', 'solonius', 'spartacus', 'unknown', 'caesar',
  'vettius', 'crassus', 'hannibal'];

const ALL_BUILDINGS: BuildingId[] = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery',
  'templeOfPluto', 'library', 'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop',
  'guardTower', 'aqueduct', 'romeMansion', 'tavern', 'bathHouse'];

export function emptyBuildings(): Record<BuildingId, number> {
  return Object.fromEntries(ALL_BUILDINGS.map((b) => [b, 0])) as Record<BuildingId, number>;
}

/** A blank house (player or AI). */
export function makeLudus(name: string, isPlayer: boolean, denarii: number): Ludus {
  return {
    id: newId('h'), name, isPlayer, denarii, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0,
    entBonus: 0, securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 1, spies: 0 }, spiesLastWeek: 0,
    buildings: emptyBuildings(), builtThisWeek: false, creatures: [], armory: [], pantry: {}, eggs: [], pairs: [],
    bankruptLastWeek: false, unpaidThisWeek: false,
    training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
    trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
  };
}

function emptyMarket(): Market {
  return {
    creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 5, price: 100 }, eggs: [],
    foodPrices: Object.fromEntries(FOOD_IDS.map((f) => [f, FOODS[f].price])) as Market['foodPrices'], pokes: 0,
  };
}

function emptyHorde(): Horde {
  return {
    rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false,
    lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [],
  };
}

const HERITAGE_ITEM: Record<Heritage, [import('./types').GearTypeId, 0 | 1]> = {
  roman: ['lightHarness', 0],
  punic: ['carthaginianCrest', 1],
  celtic: ['hornedHelm', 1],
  greek: ['bashPlate', 1],
  egyptian: ['quiltedBarding', 0],
};

export function createNewGame(o: NewGameOptions, meta: Meta): GameState {
  setSeed(o.seed ?? (Date.now() ^ (Math.random() * 0x7fffffff)) | 0);
  setIdCounter(1);
  const difficulty: Difficulty = {
    hard: o.hard || o.nightmare, nightmare: o.nightmare, sandbox: o.sandbox,
    raidsDisabled: o.raidsDisabled || o.sandbox, betrayalsDisabled: o.betrayalsDisabled || o.sandbox,
  };
  const startDenarii = (difficulty.hard ? 800 : 1000) + (o.sandbox ? 5000 : 0) + (o.heritage === 'punic' ? 100 : 0);
  const ludus = makeLudus(o.ludusName?.trim() || `House ${o.lanista}`, true, startDenarii);
  if (o.sandbox) ludus.influence = 200;
  if (o.heritage === 'punic') ludus.miningBonus = 1;
  if (!difficulty.hard) {
    ludus.keepers.showmen = 1;
    ludus.armory.push(makeGear('poultice', 2, newId('g')));
  }
  const [itemType, itemQ] = HERITAGE_ITEM[o.heritage];
  ludus.armory.push(makeGear(itemType, itemQ, newId('g')));
  ludus.pantry = { rawMeat: 2, mejoberries: 2 };

  const player: PlayerData = {
    lanista: o.lanista, female: o.female, heritage: o.heritage, ludus,
    opportunities: [], treeSeed: rand(1000), toggles: { publicSessions: false, bribeGeneral: false, loan: false },
    senator: false, consul: false, objectives: [], stories: {}, storyData: {}, messages: [], decisions: [],
    decisionHistory: [], delayed: [], adventures: [], conversations: [], registrations: {}, intrigue: [], defenses: [],
    offers: [], tomb: [], organized: 0, leagueWins: 0, invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
  };

  const world: World = {
    week: 1, rng: 0, difficulty, ascension: Math.max(0, Math.min(16, o.ascension)), marketSeed: rand(5),
    calendar: [], tournaments: [], leagues: [], market: emptyMarket(), horde: emptyHorde(), laws: { publicFunding: false },
    flags: {}, temperature: rollTemperature(1), released: [],
  };

  const state: GameState = {
    version: SAVE_VERSION, slot: o.slot, createdAt: Date.now(), savedAt: Date.now(), player, rivals: [],
    unknown: makeLudus('Unknown', false, 200), world, ancestry: {}, unlocks: [...meta.upgrades], pendingAchievements: [],
    results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };

  seedRivals(state);
  seedCalendar(state);
  seedStarterMarket(state);
  seedObjectives(state);

  if (world.ascension > 0) {
    const key = difficulty.nightmare ? 'nightmare' : difficulty.hard ? 'hard' : 'normal';
    const champ = meta.champions[key] ?? meta.champions.hard ?? meta.champions.normal;
    if (champ) {
      const c = reincarnate(champ.creature, o.reincarnation ?? 'young', world.ascension, state.unlocks.includes('ascendancy'));
      ludus.creatures.push(c);
      if (champ.beast && state.unlocks.includes('undyingLoyalty')) {
        const b = reincarnate(champ.beast, 'young', world.ascension, false);
        ludus.creatures.push(b);
      }
    }
    ascensionStartEffects(state, { prophecy: meta.prophecy[key] });
  }

  message(state, 'magistrate', 'Welcome to Capua!',
    `Welcome to Capua, ${o.female ? 'domina' : 'dominus'} ${o.lanista}. Your ludus is modest: an empty pen, a few keepers and ${startDenarii} denarii. ` +
    'Buy your first dino at the market, teach it a technique, find it some harness and register for a tournament. ' +
    'Capua\'s saurian arenas await.');
  if (difficulty.hard) message(state, 'magistrate', 'A harder road', 'Your rivals are richer and better equipped, and the Wild Horde will grow faster.');
  if (o.sandbox) message(state, 'magistrate', 'Sandbox', 'Extra funds, no breakouts and no raids. Achievements and highscores are disabled.');

  seedWeekTournaments(state);
  state.world.rng = getSeed();
  state.nextId = getIdCounter();
  return state;
}

export function emptyMeta(): Meta {
  return {
    version: 1, amber: 250, achievements: [], upgrades: [], ascension: { normal: 0, hard: 0, nightmare: 0 },
    prophecy: { normal: 0, hard: 0, nightmare: 0 }, champions: {}, hallOfFame: [],
    settings: { sound: true, music: false, battleSpeed: 1, tooltips: true, reduceMotion: false, theme: 'system' },
    stats: { runs: 0, weeksPlayed: 0, bestInfluence: 0, bestWeek: 0 }, highscores: [],
  };
}

export { zeroStats };
export type { Creature };
