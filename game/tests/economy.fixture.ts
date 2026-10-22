// Minimal hand-built GameState for the economy/market/training/loyalty/forge/care tests.
// Mirrors the shape of newgame.ts makeLudus/createNewGame without calling other modules.
import type { BuildingId, Creature, GameState, Ludus, SpeciesId, AIState, Personality } from '../src/engine/types';
import { FOODS, FOOD_IDS } from '../src/engine/data/food';
import { makeCreature } from '../src/engine/creature';
import { setSeed } from '../src/engine/rng';
import { setIdCounter } from '../src/engine/util';

const ALL: BuildingId[] = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery',
  'templeOfPluto', 'library', 'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop',
  'guardTower', 'aqueduct', 'romeMansion', 'tavern', 'bathHouse'];

let hid = 0;

export function testLudus(name: string, isPlayer: boolean, denarii = 1000): Ludus {
  hid++;
  return {
    id: `h${hid}`, name, isPlayer, denarii, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0,
    entBonus: 0, securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 1, spies: 0 }, spiesLastWeek: 0,
    buildings: Object.fromEntries(ALL.map((b) => [b, 0])) as Record<BuildingId, number>, builtThisWeek: false,
    creatures: [], armory: [], pantry: {}, eggs: [], pairs: [], bankruptLastWeek: false, unpaidThisWeek: false,
    training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
    trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
  };
}

export function testAI(prefers: Personality['prefers'] = [], opinion = 50): AIState {
  return {
    key: 'random',
    personality: { financial: 'balanced', arena: 'balanced', honesty: 'neutral', training: 'standard', classMindset: 'normal', prefers },
    opinion, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
}

export function testState(seed = 12345): GameState {
  setSeed(seed);
  setIdCounter(1);
  const ludus = testLudus('House Test', true, 1000);
  const rival = testLudus('House Batiatus', false, 800);
  rival.ai = testAI(['talented']);
  const rival2 = testLudus('House Solonius', false, 1500);
  rival2.ai = testAI(['established']);
  const state: GameState = {
    version: 1, slot: 0, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Testus', female: false, heritage: 'roman', ludus, opportunities: [], treeSeed: 0,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [],
      stories: {}, storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [],
      conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0,
      invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [rival, rival2],
    unknown: testLudus('Unknown', false, 200),
    world: {
      week: 1, rng: 0, difficulty: { hard: false, nightmare: false, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
      ascension: 0, marketSeed: 2, calendar: [], tournaments: [], leagues: [],
      market: {
        creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 5, price: 100 }, eggs: [],
        foodPrices: Object.fromEntries(FOOD_IDS.map((f) => [f, FOODS[f].price])) as GameState['world']['market']['foodPrices'], pokes: 0,
      },
      horde: {
        rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false,
        lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [],
      },
      laws: { publicFunding: false }, flags: {}, temperature: 22, released: [],
    },
    ancestry: {}, unlocks: [], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
  return state;
}

/** An adult dino with a fixed set of wild points (no random traits/techniques). */
export function dino(species: SpeciesId = 'iguanodon', o: Partial<Creature> = {}): Creature {
  const c = makeCreature({ species, sex: o.sex ?? 'M', maturity: 1, adultWeeks: 52 });
  c.genes.wild = { str: 3, agi: 3, cun: 3, hp: 3 };
  Object.assign(c, o);
  return c;
}

export function addTo(h: Ludus, ...cs: Creature[]): Creature[] {
  h.creatures.push(...cs);
  return cs;
}
