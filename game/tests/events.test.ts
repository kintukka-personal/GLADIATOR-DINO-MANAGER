// Weekly decision events: registry, selection rules, resolution, delayed outcomes, auctions and the
// breeding events. Other engine modules are mocked; the state is built by hand.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BattleSide, Creature, GameState, Ludus } from '../src/engine/types';

const ctl = vi.hoisted(() => ({
  winner: 0 as 0 | 1,
  foeDies: false,
  raid: null as any,
  sides: [] as any[],
  hooks: [] as any[],
  buried: [] as string[],
}));

vi.mock('../src/engine/combat', () => ({
  buildSide: (_s: any, house: any, creatures: any[], _i: any, opts: any) => ({
    houseId: house?.id, name: opts?.name ?? 'side', modifiers: opts?.modifiers ?? [], injuryMod: 0, influence: 0, player: opts?.player,
    fighters: creatures.map((c: any) => ({ creature: c, gear: {}, instruction: 'default' })),
  }),
  resolveBattle: (sides: BattleSide[]) => {
    ctl.sides.push(sides);
    return {
      winner: ctl.winner, decidedBy: 'ko', rounds: 3, log: [], fighters: [],
      outcomes: sides.flatMap((s, i) => s.fighters.map((f) => ({
        creatureId: f.creature.id, side: i, knockedOut: false, yielded: false, died: i === 1 && ctl.foeDies, injury: null,
        xp: 0, fame: 0, loyalty: 0, newTraits: [], hpEnd: 10, hpMax: 10, biggestHit: 0,
      }))),
    };
  },
  applyBattleResult: () => [],
  fight: () => { throw new Error('unused'); },
  teamWorth: () => 0,
}));
vi.mock('../src/engine/economy', () => ({
  addInfluence: (_s: any, h: any, n: number) => {
    const v = Math.max(0, h.influence + n);
    const d = v - h.influence;
    h.influence = v;
    return d;
  },
  loseKeepers: (_s: any, h: any, n: number, job?: string) => {
    let lost = 0;
    const order = job ? [job] : ['unassigned', 'showmen', 'miners', 'wardens', 'spies'];
    for (const j of order) while (lost < n && h.keepers[j] > 0) { h.keepers[j]--; lost++; }
    return lost;
  },
  addKeepers: (h: any, n: number, job?: string) => { h.keepers[job ?? 'unassigned'] += n; },
  committedSpies: (_s: any, h: any) => h.spiesLastWeek,
  securityTotal: () => 0,
  keeperCount: (h: any) => Object.values(h.keepers).reduce((a: number, b: any) => a + b, 0),
  entertainment: (h: any) => h.keepers.showmen,
}));
vi.mock('../src/engine/buildings', () => ({
  constructionLevel: (h: any) => Object.values(h.buildings).reduce((a: number, b: any) => a + b, 0),
  loseRandomBuilding: () => 'trainingField',
  buildingTotals: () => ({ pairs: 2, eggSlots: 2, tempControl: 6, nurserySlots: 3, kitchen: true }),
}));
vi.mock('../src/engine/market', () => ({
  rollMerchant: (s: any) => { s.world.market.merchant = { items: [{ gear: { id: 'g1', type: 'luckyTooth', quality: 2 }, price: 150 }], week: s.world.week }; },
}));
vi.mock('../src/engine/rivals', () => ({
  changeOpinion: (_s: any, r: any, d: number) => { if (r.ai) r.ai.opinion += d; },
}));
vi.mock('../src/engine/horde', () => ({
  rebelRaid: () => ctl.raid,
  resolveRaid: () => ({ text: 'raid resolved' }),
}));
vi.mock('../src/engine/influence', () => ({
  hasOpp: (s: any, id: string) => s.player.opportunities.includes(id),
}));
vi.mock('../src/engine/care', () => ({
  bury: (_s: any, c: any) => { ctl.buried.push(c.id); },
}));
vi.mock('../src/engine/stories', () => ({
  storyHook: (_s: any, hook: string, data: any) => { ctl.hooks.push({ hook, data }); },
}));

import { setSeed } from '../src/engine/rng';
import { makeLudus, emptyMeta } from '../src/engine/newgame';
import { makeCreature, generateDino, generateBeast, addTrait } from '../src/engine/creature';
import { makeGear } from '../src/engine/data/gear';
import {
  EVENTS, EVENT_KEYS, drawWeeklyDecision, resolveDecision, delayedWeek, expireDecisions, eventDef, decisionOptionProblem,
} from '../src/engine/events';
import { pendingAdventures, resolveAdventure, adventureWeek } from '../src/engine/adventures';
import { placeBid, uniqueLot } from '../src/engine/data/eventsDataPolitics';
import { generateMarketEgg } from '../src/engine/breeding';

function rival(name: string, opinion = 50): Ludus {
  const r = makeLudus(name, false, 2000);
  r.ai = {
    key: 'random', personality: { financial: 'balanced', arena: 'balanced', honesty: 'neutral', training: 'standard', classMindset: 'normal', prefers: [] },
    opinion, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  r.influence = 40;
  for (let i = 0; i < 3; i++) r.creatures.push(generateDino({ week: 30, level: 5 }));
  return r;
}

function baseState(week = 30): GameState {
  const ludus = makeLudus('House Test', true, 1000);
  ludus.influence = 100;
  const s: GameState = {
    version: 1, slot: 1, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Test', female: false, heritage: 'roman', ludus, opportunities: [], treeSeed: 1,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [],
      stories: {}, storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [],
      conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0,
      invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: { tutorialEvents: 2 },
    },
    rivals: [rival('House Batiatus'), rival('House Solonius')], unknown: makeLudus('Unknown', false, 200),
    world: {
      week, rng: 1, difficulty: { hard: false, nightmare: false, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
      ascension: 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [],
        foodPrices: { rawMeat: 8, primeMeat: 25, mejoberries: 5, kibble_simple: 40, kibble_regular: 70, kibble_superior: 120, kibble_exceptional: 200, kibble_extraordinary: 350 }, pokes: 0 },
      horde: { rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
      laws: { publicFunding: false }, flags: {}, temperature: 24, released: [],
    },
    ancestry: {}, unlocks: [...emptyMeta().upgrades], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
  for (const sp of ['velociraptor', 'carnotaurus', 'iguanodon'] as const) {
    const c = generateDino({ species: sp, week: 30, level: 6 });
    c.maturity = 1;
    c.fame = 40;
    ludus.creatures.push(c);
  }
  return s;
}

/** A state that satisfies as many event conditions as possible. */
function richState(): GameState {
  const s = baseState(61);
  s.world.difficulty.hard = true;
  s.world.difficulty.sandbox = true; // every upgrade
  s.world.ascension = 16;
  s.world.temperature = 33;
  const h = s.player.ludus;
  h.denarii = 5000;
  h.influence = 5000;
  h.keepers = { unassigned: 2, miners: 6, showmen: 5, wardens: 6, spies: 4 };
  h.spiesLastWeek = 4;
  for (const b of ['residence', 'library', 'forge', 'saddlery', 'veterinarium', 'tavern', 'romeMansion', 'aqueduct', 'palisade', 'trainingField', 'mine'] as const) h.buildings[b] = 2;
  s.player.senator = true;
  s.player.consul = true;
  s.player.opportunities = ['lobbySenate', 'princepsSenatus', 'theOrganizer', 'imperator', 'bacchusPatron', 'bribeGeneral', 'gambler', 'informants'];
  s.world.flags.melankomas = true;
  const champ = h.creatures[0];
  champ.career.majorWins = 12;
  champ.career.tournamentWins = 5;
  champ.career.wins = 9;
  champ.fame = 300;
  champ.prof.horn = 900;
  champ.cls = 'phalanx';
  champ.loyalty = 60;
  champ.bonus.str += 25; // Crocea Mors needs a stat above week/6 + 9 on Hard
  addTrait(champ, 'Bestiarii');
  h.creatures[1].career.wins = 4;
  h.creatures[1].spyFor = s.rivals[0].id;
  h.creatures[1].loyalty = 50;
  // beasts
  const croc = generateBeast('sarcosuchus');
  const wolf = generateBeast('direwolf');
  addTrait(wolf, 'GoodBoy');
  h.creatures.push(croc, wolf);
  // adult female + rival male of the same species for stud services
  const fem = makeCreature({ species: 'velociraptor', sex: 'F', maturity: 1, adultWeeks: 60 });
  h.creatures.push(fem);
  s.rivals[0].creatures.push(makeCreature({ species: 'velociraptor', sex: 'M', maturity: 1, adultWeeks: 60 }));
  s.rivals[0].ai!.pact = true;
  s.rivals[0].ai!.opinion = 70;
  // juveniles and eggs
  const juv = makeCreature({ species: 'troodon', maturity: 0.4 });
  juv.genes.motherId = fem.id;
  const baby = makeCreature({ species: 'troodon', maturity: 0.05 });
  baby.genes.motherId = fem.id;
  h.creatures.push(juv, baby);
  const egg = generateMarketEgg(s, 'velociraptor');
  egg.motherId = fem.id;
  h.eggs.push(egg, generateMarketEgg(s, 'triceratops'));
  // Dark Fangs worn, a moonstone, a weapon to sabotage
  const fangs = makeGear('fangCaps', 5, 'dark1', { unique: 'darkFangs' });
  const blade = makeGear('greatTalons', 4, 'blade1');
  h.armory.push(fangs, blade);
  h.creatures[2].gear.weapon = fangs.id;
  h.creatures[2].loyalty = 40;
  addTrait(h.creatures[2], 'Lycanthropy');
  h.pantry = { kibble_simple: 2, kibble_superior: 1, rawMeat: 3 };
  h.trophies = [{ league: 'lunar', place: 1, week: 20, creatureName: 'x' }, { league: 'solar', place: 1, week: 40, creatureName: 'y' }];
  h.caught = [s.rivals[1].creatures[0].id];
  s.world.tournaments = [{ underground: true, type: 'underground', entries: [{ houseId: h.id, creatureIds: [], eliminated: true, roundsWon: 0 }] } as any];
  return s;
}

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

function checkInvariants(s: GameState) {
  const h = s.player.ludus;
  expect(Number.isFinite(h.denarii)).toBe(true);
  expect(Number.isFinite(h.influence)).toBe(true);
  expect(h.influence).toBeGreaterThanOrEqual(0);
  for (const c of h.creatures) {
    expect(c.loyalty).toBeGreaterThanOrEqual(0);
    expect(c.loyalty).toBeLessThanOrEqual(100);
  }
  for (const k of Object.values(h.keepers)) expect(k).toBeGreaterThanOrEqual(0);
}

beforeEach(() => {
  setSeed(777);
  ctl.winner = 0;
  ctl.foeDies = false;
  ctl.raid = null;
  ctl.sides = [];
  ctl.hooks = [];
  ctl.buried = [];
});

describe('event registry', () => {
  it('has the GM events plus the breeding events, with unique keys', () => {
    const keys = EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(EVENT_KEYS.length).toBeGreaterThanOrEqual(55);
    const expected = [
      'releaseRequest', 'spySuspect', 'sponsoring', 'notStrictlyLegal', 'plagueRumours', 'holyShrine', 'beastMaster', 'cestusDuel',
      'wildBeastOffer', 'plebeInDebt', 'orphanage', 'accusation', 'specialisedTraining', 'marksmanTraining', 'mineCollapse',
      'publicChallenge', 'jousting', 'baselessAccusations', 'clutchMates', 'rivalWeaponsmith', 'armorySabotage', 'mineralVein',
      'cityFires', 'criminalActivity', 'scoutedDino', 'activeSpy', 'sensitiveInfo', 'patricianRequest', 'settingTrap', 'foolsGold',
      'capuaFlooded', 'drought', 'oldAcquaintance', 'taxCollector', 'bookSale', 'caughtRedHanded', 'secretsOfTrade', 'interestedBuyer',
      'tavernNight', 'slackingDino', 'badFeeling', 'deathInFamily', 'allyUnderAttack', 'hopliteRequest', 'strongestBonds',
      'keepersAbducted', 'travelingMerchant', 'partyOutOfHand', 'keeperPurchase', 'publicFunding', 'breadAndGames',
      'stateArtifactAuction', 'schoolEqualizing', 'popularCandidate', 'politicalSponsor', 'callInFavours', 'electionAmbush',
      'upholdTheLaw', 'underworld', 'lostBlade', 'hannibalsLegacy', 'romulus1', 'romulus2', 'romulus3', 'pericles', 'whiteRhino',
      'greekShieldAuction', 'hannibalCrestAuction', 'spartaDescendant', 'troyEscort',
      'eggPoachers', 'strangeEgg', 'studServices', 'breedersFair', 'heatwave', 'coldSnap', 'hatchlingEscapes', 'featheredFever',
      'geneMerchant', 'proudMother', 'wildHerd', 'rivalEggTheft',
    ];
    for (const k of expected) expect(keys, k).toContain(k);
  });

  it('every eligible event resolves every option without breaking the state', () => {
    let built = 0;
    const missing: string[] = [];
    for (const def of EVENTS.filter((e) => !e.followUp)) {
      let d = null;
      for (let seed = 1; seed < 40 && !d; seed++) {
        setSeed(seed);
        const s = richState();
        if (def.key === 'callInFavours' || def.key === 'politicalSponsor' || def.key === 'electionAmbush') s.player.election = { office: 'senate', startWeek: 55, votes: 40, smear: false, campaigners: [], history: [], lastInfluence: 0 };
        if (def.key === 'popularCandidate') s.player.election = { office: 'senate', startWeek: 60, votes: 10, smear: false, campaigners: [], history: [], lastInfluence: 0 };
        if (def.key === 'underworld') s.world.week = 70;
        if (def.key === 'moonFrenzy') s.world.week = 63;
        if (def.key === 'coldSnap') s.world.temperature = 5;
        if (def.key === 'romulus2') s.world.flags.romulusStage = 1;
        if (def.key === 'romulus3') s.world.flags.romulusStage = 2;
        if (def.key === 'hannibalCrestAuction') s.world.flags.hannibalStage = 3;
        if (def.key === 'interestedBuyer') { s.player.ludus.denarii = 150; s.world.week = 30; s.player.ludus.trophies = []; }
        if (def.key === 'notStrictlyLegal') { s.player.ludus.denarii = 900; s.world.week = 62; }
        if (def.key === 'deathInFamily') { s.world.ascension = 0; s.world.week = 10; }
        if (def.key === 'wildBeastOffer') s.world.week = 61;
        if (def.key === 'partyOutOfHand' || def.key === 'keeperPurchase') s.player.senator = false;
        if (def.key === 'schoolEqualizing') { s.player.consul = false; for (const r of s.rivals) r.creatures = r.creatures.slice(0, 1); }
        if (def.key === 'taxCollector') s.player.ludus.buildings.palisade = 2;
        const made = def.make(s);
        if (!made) continue;
        d = made;
        built++;
        expect(made.key).toBe(def.key);
        expect(made.options.length).toBeGreaterThan(0);
        expect(made.text.length).toBeGreaterThan(20);
        for (let o = 0; o < made.options.length; o++) {
          const st = clone(s);
          setSeed(seed * 31 + o);
          def.onDraw?.(st, made);
          st.player.decisions.push(made);
          const r = resolveDecision(st, made.id, o);
          expect(typeof r.text, `${def.key}#${o}`).toBe('string');
          expect(r.text.length).toBeGreaterThan(5);
          checkInvariants(st);
          // finish any adventure this option started, with every outcome
          for (const a of pendingAdventures(st)) resolveAdventure(st, a.adventure.id, 0);
          for (let w = 0; w < 6; w++) adventureWeek(st);
          for (const a of pendingAdventures(st)) {
            const rr = resolveAdventure(st, a.adventure.id, 0);
            expect(typeof rr.text).toBe('string');
          }
          for (let w = 0; w < 14; w++) { st.world.week++; delayedWeek(st); }
          checkInvariants(st);
        }
      }
      if (!d) missing.push(def.key);
    }
    expect(missing).toEqual([]);
    expect(built).toBeGreaterThanOrEqual(70);
  });
});

describe('weekly selection (GM 04 §6.1)', () => {
  it('follows the tutorial weeks first', () => {
    const s = baseState(2);
    s.player.counters = {};
    const d1 = drawWeeklyDecision(s)!;
    expect(d1.key).toBe('plebeInDebt');
    s.world.week = 3;
    const d2 = drawWeeklyDecision(s)!;
    expect(['sensitiveInfo', 'mineCollapse', 'notStrictlyLegal', 'mineralVein', 'orphanage']).toContain(d2.key);
    expect(s.player.decisionHistory).toEqual([d1.key, d2.key]);
    expect(s.player.week.__tutorial).toBeUndefined();
  });

  it('gives the Tartarus underworld attack priority', () => {
    const s = baseState(30);
    s.world.ascension = 15;
    expect(drawWeeklyDecision(s)!.key).toBe('underworld');
    s.world.week = 31;
    expect(drawWeeklyDecision(s)?.key).not.toBe('underworld');
  });

  it('uses the rebel raid when the horde returns one, and routes its answer to the horde', () => {
    const s = baseState(30);
    ctl.raid = { id: 'raid1', key: 'rebelRaid', title: 'Escaped dinos attack!', text: 'x', options: [{ label: 'Fight' }], week: 30, data: {} };
    const d = drawWeeklyDecision(s)!;
    expect(d.id).toBe('raid1');
    s.player.decisions.push(d);
    expect(resolveDecision(s, 'raid1', 0).text).toBe('raid resolved');
    expect(s.player.decisions).toHaveLength(0);
  });

  it('never repeats an event from the history and resets it when the pool runs dry', () => {
    const s = baseState(30);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const d = drawWeeklyDecision(s)!;
      expect(seen.has(d.key)).toBe(false);
      seen.add(d.key);
    }
    s.player.decisionHistory = [...EVENT_KEYS];
    const d = drawWeeklyDecision(s);
    expect(d).not.toBeNull();
    expect(s.player.decisionHistory).toEqual([d!.key]);
  });

  it('restricts the pool during an election campaign', () => {
    const s = baseState(30);
    s.player.election = { office: 'senate', startWeek: 28, votes: 20, smear: false, campaigners: [], history: [], lastInfluence: 0 };
    const allowed = new Set([...EVENTS.filter((e) => e.campaign).map((e) => e.key), 'releaseRequest']);
    for (let i = 0; i < 6; i++) {
      const d = drawWeeklyDecision(s);
      if (d) expect(allowed.has(d.key)).toBe(true);
    }
  });

  it('respects weights (holy shrine ×3, Hannibal ×2)', () => {
    expect(eventDef('holyShrine')!.weight).toBe(3);
    expect(eventDef('hannibalsLegacy')!.weight).toBe(2);
  });
});

describe('resolving decisions', () => {
  it('refuses unaffordable options and keeps the decision', () => {
    const s = baseState(31);
    const d = eventDef('wildBeastOffer')!.make(s)!;
    s.player.decisions.push(d);
    s.player.ludus.denarii = 50;
    expect(decisionOptionProblem(s, d.id, 0)).toMatch(/afford/);
    expect(resolveDecision(s, d.id, 0).text).toMatch(/afford/);
    expect(s.player.decisions).toHaveLength(1);
    s.player.ludus.denarii = 500;
    const before = s.player.ludus.creatures.length;
    resolveDecision(s, d.id, 0);
    expect(s.player.ludus.denarii).toBe(400);
    expect(s.player.ludus.creatures.length).toBe(before + 1);
    expect(s.player.ludus.creatures.at(-1)!.species).toBe('sabertooth');
    expect(s.player.decisions).toHaveLength(0);
  });

  it('refuses options whose requirements are unmet', () => {
    const s = baseState(31);
    const d = eventDef('wildBeastOffer')!.make(s)!;
    expect(d.options[1].disabled).toBe(true);
    expect(d.options[1].reason).toMatch(/Woolly Rhinos/);
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 1);
    expect(s.player.decisions).toHaveLength(1);
  });

  it('release request sends the champion to the wild with Freedom', () => {
    const s = baseState(40);
    const c = s.player.ludus.creatures[0];
    c.career.majorWins = 10;
    c.fame = 500;
    const d = eventDef('releaseRequest')!.make(s)!;
    expect(d).not.toBeNull();
    s.player.decisions.push(d);
    const inf = s.player.ludus.influence;
    resolveDecision(s, d.id, 0);
    expect(s.player.ludus.creatures.find((x) => x.id === c.id)).toBeUndefined();
    expect(s.world.released[0].id).toBe(c.id);
    expect(s.world.released[0].traits).toContain('Freedom');
    expect(s.player.ludus.influence).toBe(inf + 25);
  });

  it('a Glory Seeker needs 25 major wins', () => {
    const s = baseState(40);
    const c = s.player.ludus.creatures[0];
    c.fame = 500;
    c.career.majorWins = 12;
    addTrait(c, 'GlorySeeker');
    expect(eventDef('releaseRequest')!.make(s)).toBeNull();
    c.career.majorWins = 25;
    expect(eventDef('releaseRequest')!.make(s)).not.toBeNull();
  });

  it('feeds a suspected spy to the Sarcosuchus', () => {
    const s = richState();
    let d = null;
    for (let i = 0; i < 50 && !d; i++) d = eventDef('spySuspect')!.make(s);
    expect(d).not.toBeNull();
    s.player.decisions.push(d!);
    const id = d!.data.cid;
    resolveDecision(s, d!.id, 1);
    expect(s.player.ludus.creatures.find((c) => c.id === id)).toBeUndefined();
    expect(ctl.buried).toContain(id);
    expect(s.player.ludus.creatures.find((c) => c.species === 'sarcosuchus')!.traits).toContain('ManEater');
  });

  it('public challenge fights the rival\'s best and moves the stake', () => {
    const s = baseState(20);
    const d = eventDef('publicChallenge')!.make(s)!;
    s.player.decisions.push(d);
    const inf = s.player.ludus.influence;
    const r = resolveDecision(s, d.id, 1); // to the death
    expect(r.battle).toBeDefined();
    expect(s.player.ludus.influence).toBe(inf + 20);
    const sides = ctl.sides.at(-1);
    expect(sides[1].houseId).toBe(d.data.rival);
  });

  it('Public Funding passes about two times in three when voting for', () => {
    let passed = 0;
    for (let i = 0; i < 600; i++) {
      setSeed(1000 + i);
      const s = baseState(40);
      s.player.senator = true;
      const d = eventDef('publicFunding')!.make(s)!;
      s.player.decisions.push(d);
      resolveDecision(s, d.id, 0);
      if (s.world.laws.publicFunding) passed++;
    }
    expect(passed / 600).toBeGreaterThan(0.6);
    expect(passed / 600).toBeLessThan(0.74);
  });

  it("fool's gold: making the best of it no longer costs 200 denarii", () => {
    const s = baseState(40);
    s.world.ascension = 1;
    s.player.ludus.keepers.miners = 3;
    const d = eventDef('foolsGold')!.make(s)!;
    s.player.decisions.push(d);
    const den = s.player.ludus.denarii;
    resolveDecision(s, d.id, 2);
    expect(s.player.ludus.denarii).toBe(den);
    expect(s.player.ludus.miningBonus).toBe(-1);
  });

  it('hoplite refusal only angers the requester', () => {
    const s = baseState(40);
    s.world.difficulty.sandbox = true;
    const c = s.player.ludus.creatures[0];
    c.prof.horn = 30;
    const d = eventDef('hopliteRequest')!.make(s)!;
    s.player.decisions.push(d);
    const loyalty = () => Object.fromEntries(s.player.ludus.creatures.map((x) => [x.id, x.loyalty]));
    const before = loyalty();
    resolveDecision(s, d.id, 1);
    const after = loyalty();
    for (const [id, v] of Object.entries(before)) expect(after[id]).toBe(id === d.data.cid ? Math.max(0, v - 30) : v);
  });

  it('the Holy Shrine founds the Ariminium camp', () => {
    const s = richState();
    s.player.ludus.buildings.ariminiumCamp = 0;
    const d = eventDef('holyShrine')!.make(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 0);
    expect(s.player.ludus.buildings.ariminiumCamp).toBe(1);
  });

  it('the underworld bar-the-gates option costs influence (GM bug fixed)', () => {
    const s = baseState(30);
    s.world.ascension = 15;
    s.player.ludus.influence = 1000;
    const d = drawWeeklyDecision(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 2);
    expect(s.player.ludus.influence).toBe(1000 - (2 * 30 + 50));
  });

  it('a won underworld hunt grows the Monster Trophy', () => {
    const s = baseState(30);
    s.world.ascension = 15;
    const d = drawWeeklyDecision(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 1);
    expect(s.player.ludus.armory.some((g) => g.type === 'monsterTrophy')).toBe(true);
  });
});

describe('auctions', () => {
  it('a raise re-queues a follow-up bid decision, quitting gives the lot away', () => {
    const s = baseState(40);
    for (const r of s.rivals) r.denarii = 100000;
    const lot = uniqueLot('shieldOfLeonidas', 'leonidasDone');
    placeBid(s, lot, 200);
    const follow = s.player.decisions.find((d) => d.key === 'auctionBid')!;
    expect(follow).toBeDefined();
    expect(follow.data.bid).toBe(300);
    expect(follow.options[0].label).toMatch(/400/);
    resolveDecision(s, follow.id, 1);
    expect(s.world.flags.leonidasDone).toBe(true);
    expect(s.rivals.some((r) => r.armory.some((g) => g.unique === 'shieldOfLeonidas'))).toBe(true);
  });

  it('the player wins when nobody counters', () => {
    const s = baseState(40);
    for (const r of s.rivals) r.denarii = 0;
    s.player.ludus.denarii = 10000;
    const lot = uniqueLot('hannibalsHelmet', 'hannibalCrestDone');
    // bid above anything the collector can offer (max 2400)
    placeBid(s, lot, 2500);
    expect(s.player.ludus.armory.some((g) => g.unique === 'hannibalsHelmet')).toBe(true);
    expect(s.player.ludus.denarii).toBe(7500);
    expect(s.world.flags.hannibalCrestDone).toBe(true);
  });
});

describe('delayed outcomes and expiry', () => {
  it('the orphans join the mines after 8 weeks', () => {
    const s = baseState(10);
    const d = eventDef('orphanage')!.make(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 0);
    expect(s.player.delayed[0].key).toBe('orphanage');
    s.world.week = 17;
    delayedWeek(s);
    expect(s.player.ludus.keepers.miners).toBe(0);
    s.world.week = 18;
    delayedWeek(s);
    expect(s.player.ludus.keepers.miners).toBe(3);
    expect(s.player.delayed).toHaveLength(0);
  });

  it('the court case charges 50 a week for 12 weeks', () => {
    const s = baseState(20);
    s.player.senator = true;
    const d = eventDef('baselessAccusations')!.make(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 0);
    expect(s.player.ludus.projected).toBe(-50);
    s.world.week = 32;
    delayedWeek(s);
    expect(s.player.ludus.projected).toBe(0);
  });

  it('the plague arrives 2–4 weeks after the rumours', () => {
    const s = baseState(30);
    s.world.ascension = 8;
    s.player.ludus.keepers.unassigned = 10;
    const d = eventDef('plagueRumours')!.make(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 0);
    expect(s.player.ludus.projected).toBe(-150);
    s.world.week = 34;
    delayedWeek(s);
    expect(s.player.ludus.projected).toBe(0);
    expect(s.player.ludus.keepers.unassigned).toBeLessThan(10);
    expect(s.player.ludus.creatures.some((c) => c.ill > 0)).toBe(true);
  });

  it('drops decisions older than 7 weeks and applies their expiry effect', () => {
    const s = richState();
    const d = eventDef('rivalEggTheft')!.make(s)!;
    d.week = s.world.week - 8;
    const keep = eventDef('cityFires')!.make(s)!;
    s.player.decisions.push(d, keep);
    const eggs = s.player.ludus.eggs.length;
    expireDecisions(s);
    expect(s.player.decisions.map((x) => x.id)).toEqual([keep.id]);
    expect(s.player.ludus.eggs.length).toBe(eggs - 1);
  });
});

describe('breeding events', () => {
  it('stud services mate your female with the rival male', () => {
    const s = richState();
    const d = eventDef('studServices')!.make(s)!;
    expect(d).not.toBeNull();
    s.player.decisions.push(d);
    const eggs = s.player.ludus.eggs.length;
    const den = s.player.ludus.denarii;
    resolveDecision(s, d.id, 0);
    const egg = s.player.ludus.eggs.at(-1)!;
    expect(s.player.ludus.eggs.length).toBe(eggs + 1);
    expect(egg.fatherId).toBe(d.data.male);
    expect(egg.motherId).toBe(d.data.female);
    expect(den - s.player.ludus.denarii).toBeGreaterThanOrEqual(150);
    expect(den - s.player.ludus.denarii).toBeLessThanOrEqual(400);
  });

  it('a strange egg joins the hatchery with hidden genetics', () => {
    const s = baseState(30);
    const d = eventDef('strangeEgg')!.make(s)!;
    s.player.decisions.push(d);
    resolveDecision(s, d.id, 0);
    const h = s.player.ludus;
    const got = h.eggs.length === 1 ? h.eggs[0] : undefined;
    if (got) {
      expect(got.known).toBe(false);
      expect(got.fertilized).toBe(true);
      expect(got.species).toBe(d.data.species);
    } else {
      expect(h.armory.some((g) => g.type === 'mysteriousEgg')).toBe(true);
    }
  });

  it('heatwave: paying protects the eggs, risking them hurts', () => {
    const s = richState();
    for (const e of s.player.ludus.eggs) e.health = 0.5;
    const d = eventDef('heatwave')!.make(s)!;
    const a = clone(s);
    a.player.decisions.push(d);
    resolveDecision(a, d.id, 0);
    expect(a.player.ludus.eggs.every((e) => Math.abs(e.health - 0.7) < 1e-9)).toBe(true);
    const b = clone(s);
    b.player.decisions.push(d);
    resolveDecision(b, d.id, 1);
    expect(b.player.ludus.eggs.every((e) => Math.abs(e.health - 0.2) < 1e-9)).toBe(true);
  });

  it('a wild herd sends a capture party with kibble', () => {
    const s = baseState(30);
    s.player.ludus.pantry = { kibble_regular: 1 };
    const d = eventDef('wildHerd')!.make(s)!;
    s.player.decisions.push(d);
    const idx = d.data.ids.indexOf('kibble_regular');
    expect(d.options[idx].label).toMatch(/1 in the pantry/);
    resolveDecision(s, d.id, idx);
    expect(s.player.adventures[0].key).toBe('wildCapture');
    expect(s.player.ludus.pantry.kibble_regular).toBe(0);
  });
});
