// Rival houses: seeding, legends, opinion, AI week, catch-up, bids, cleanup (src/engine/rivals.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Creature, GameState, Ludus, PlayerData, World } from '../src/engine/types';

const ctl = vi.hoisted(() => ({ builds: [] as string[], canBuild: false, joined: [] as string[] }));

vi.mock('../src/engine/combat', async () => {
  const { worth } = await vi.importActual<typeof import('../src/engine/creature')>('../src/engine/creature');
  return {
    teamWorth: (cs: Creature[]) => cs.reduce((s, c) => s + worth(c) + 10, 0),
    prepareFighter: (_s: unknown, _h: unknown, c: Creature, instruction: unknown) => ({ creature: c, gear: {}, instruction }),
    buildSide: (_s: unknown, house: Ludus | undefined, creatures: Creature[], _i: unknown, opts: any) => ({
      houseId: house?.id, name: opts.name ?? 'x', fighters: creatures.map((c) => ({ creature: c, gear: {}, instruction: null })),
      modifiers: [], injuryMod: 0, influence: 0, player: !!opts.player,
    }),
    resolveBattle: (sides: any[]) => ({ winner: 0, decidedBy: 'ko', rounds: 1, log: [], fighters: [], outcomes: [] }),
    applyBattleResult: () => [],
  };
});
vi.mock('../src/engine/bribes', () => ({ cheatCost: () => 30, cheatAvailable: () => null, aiCheatChoice: () => null, betMultiplier: () => 1 }));
vi.mock('../src/engine/influence', () => ({ hasOpp: () => false, publicSessionsIncome: () => 7 }));
vi.mock('../src/engine/economy', () => ({
  addInfluence: (_s: unknown, h: Ludus, n: number) => { h.influence = Math.max(0, h.influence + n); return n; },
  addKeepers: (h: Ludus, n: number, job?: string) => { (h.keepers as any)[job ?? 'unassigned'] += n; },
}));
vi.mock('../src/engine/stories', () => ({ storyHook: () => undefined }));
vi.mock('../src/engine/ascension', () => ({
  ascensionProgress: () => ({ trophies: 0, needed: 4, hordeDefeated: false, shrine: false, ready: false }),
  ascensionFoes: () => [],
}));
vi.mock('../src/engine/buildings', () => ({
  canBuild: (_s: unknown, h: Ludus, id: string) => (ctl.canBuild && !h.builtThisWeek ? { ok: true, cost: 100 } : { ok: false, cost: 0 }),
  build: (_s: unknown, h: Ludus, id: string) => { ctl.builds.push(id); h.builtThisWeek = true; h.denarii -= 100; (h.buildings as any)[id]++; return null; },
  buildingTotals: () => ({}),
}));
vi.mock('../src/engine/loyalty', () => ({
  rewardCreature: (_s: unknown, h: Ludus, c: Creature) => { h.denarii -= 50; c.loyalty += 40; c.rewardCooldown = 10; return null; },
}));
vi.mock('../src/engine/horde', () => ({ joinHorde: (_s: unknown, c: Creature) => { ctl.joined.push(c.name); } }));
vi.mock('../src/engine/week', async () => {
  const { eqAge } = await vi.importActual<typeof import('../src/engine/creature')>('../src/engine/creature');
  return { ageEligible: (c: Creature, junior: boolean) => { const e = eqAge(c); if (e < 8) return false; return junior ? e < 17 : e >= 15; } };
});
vi.mock('../src/engine/newgame', async () => {
  const { newId } = await vi.importActual<typeof import('../src/engine/util')>('../src/engine/util');
  const B = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery', 'templeOfPluto', 'library',
    'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop', 'guardTower', 'aqueduct', 'romeMansion',
    'tavern', 'bathHouse'];
  return {
    makeLudus: (name: string, isPlayer: boolean, denarii: number): Ludus => ({
      id: newId('h'), name, isPlayer, denarii, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0, entBonus: 0,
      securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 1, spies: 0 }, spiesLastWeek: 0,
      buildings: Object.fromEntries(B.map((b) => [b, 0])) as Ludus['buildings'], builtThisWeek: false, creatures: [], armory: [],
      pantry: {}, eggs: [], pairs: [], bankruptLastWeek: false, unpaidThisWeek: false,
      training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
      trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
    }),
  };
});

import {
  seedRivals, spawnRival, helpRival, rivalWeek, unknownWeek, rivalBids, opinionLabel, changeOpinion, cleanupRivals,
  aiInstruction, makeLegend, preferenceScore, valuation, manageCreatures, theokolesCheck, buffUp,
} from '../src/engine/rivals';
import { seedCalendar, seedWeekTournaments } from '../src/engine/tournaments';
import { makeLudus } from '../src/engine/newgame';
import { rawStat, eqAge, makeNamed, hasTrait, generateDino } from '../src/engine/creature';
import { setSeed } from '../src/engine/rng';
import { setIdCounter } from '../src/engine/util';

function makeState(o: { hard?: boolean; nightmare?: boolean; seed?: number } = {}): GameState {
  setSeed(o.seed ?? 777);
  setIdCounter(1);
  const ludus = makeLudus('House Test', true, 1000);
  const player: PlayerData = {
    lanista: 'Testus', female: false, heritage: 'roman', ludus, opportunities: [], treeSeed: 1,
    toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [], stories: {},
    storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [], conversations: [], registrations: {},
    intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0, invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
  };
  const world: World = {
    week: 1, rng: 0, difficulty: { hard: !!(o.hard || o.nightmare), nightmare: !!o.nightmare, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
    ascension: 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
    market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [], foodPrices: {} as World['market']['foodPrices'], pokes: 0 },
    horde: { rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
    laws: { publicFunding: false }, flags: {}, temperature: 20, released: [],
  };
  const state: GameState = {
    version: 1, slot: 1, createdAt: 0, savedAt: 0, player, rivals: [], unknown: makeLudus('Unknown', false, 200), world, ancestry: {},
    unlocks: [], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
  seedRivals(state);
  seedCalendar(state);
  return state;
}

const rival = (s: GameState, key: string) => s.rivals.find((r) => r.ai?.key === key)!;
const stats = (c: Creature) => ({ str: rawStat(c, 'str'), agi: rawStat(c, 'agi'), cun: rawStat(c, 'cun'), hp: rawStat(c, 'hp') });

beforeEach(() => {
  ctl.builds = [];
  ctl.canBuild = false;
  ctl.joined = [];
});

describe('seeding (GM 5.1)', () => {
  it('seeds the five houses with their personalities and purses', () => {
    const s = makeState();
    expect(s.rivals.map((r) => r.ai!.key)).toEqual(['batiatus', 'solonius', 'decimus', 'magnus', 'vettius']);
    expect(s.rivals.map((r) => r.denarii)).toEqual([600, 1700, 400, 750, 1000]);
    const h = makeState({ hard: true });
    expect(h.rivals.map((r) => r.denarii)).toEqual([1200, 2800, 750, 1500, 2000]);
    const n = makeState({ nightmare: true });
    expect(n.rivals.map((r) => r.denarii)).toEqual([1600, 2800, 1000, 2000, 2500]);
    const bat = rival(s, 'batiatus');
    expect(bat.ai!.personality).toMatchObject({ financial: 'greedy', arena: 'risktaker', honesty: 'treacherous', training: 'technique', classMindset: 'always' });
    expect(bat.ai!.hatedRival).toBe('solonius');
    expect(rival(s, 'solonius').ai!.hatedRival).toBe('batiatus');
    expect(rival(s, 'magnus').ai!.hatedRival).toBe('vettius');
    expect(rival(s, 'vettius').ai!.visible).toBe(false);
    expect(s.rivals.every((r) => r.ai!.opinion === 50)).toBe(true);
  });

  it('Batiatus: Gannicus, Oenomaus (doctore), Faust and a recruit', () => {
    for (const [mode, weeks] of [[{}, 6], [{ hard: true }, 4], [{ nightmare: true }, 3]] as const) {
      const s = makeState(mode);
      const bat = rival(s, 'batiatus');
      expect(bat.creatures).toHaveLength(4);
      const g = bat.creatures.find((c) => c.legend === 'gannicus')!;
      expect(g.species).toBe('velociraptor');
      const nm = !!(mode as any).nightmare; // Nightmare: FirstBlood (+1 AGI) and species level 2
      expect(stats(g)).toEqual({ str: 8, agi: nm ? 12 : 11, cun: 8, hp: 35 });
      expect(hasTrait(g, 'FirstBlood')).toBe(nm);
      expect(g.speciesLevel).toBe(nm ? 2 : 0);
      expect(g).toMatchObject({ level: 4, cls: 'slasher', fame: 100, injury: { type: 'broken', weeks } });
      expect(hasTrait(g, 'ArenaChampion') && hasTrait(g, 'DualWield')).toBe(true);
      const o = bat.creatures.find((c) => c.legend === 'oenomaus')!;
      expect(stats(o)).toEqual({ str: 9, agi: 7, cun: 6, hp: 30 });
      expect(o.cls).toBe('lasher');
      expect(['Doctore', 'BumLeg', 'Loyal'].every((t) => hasTrait(o, t as any))).toBe(true);
      expect(bat.doctoreId).toBe(o.id);
      expect(stats(bat.creatures.find((c) => c.name === 'Faust')!)).toEqual({ str: 5, agi: 8, cun: 5, hp: 25 });
      expect(bat.armory.map((x) => x.type)).toEqual(expect.arrayContaining(['tailWhip', 'talonBlades']));
      expect(bat.armory.some((x) => x.type === 'tridentHorns')).toBe(!!(mode as any).hard || !!(mode as any).nightmare);
    }
  });

  it('Decimus, Solonius, Magnus and Vettius rosters', () => {
    const s = makeState({ hard: true });
    const dec = rival(s, 'decimus');
    expect(dec.creatures.map((c) => c.name)).toEqual(['Aeneas', 'Pontius', 'Atila', 'Cadeyrn', 'Leo V']);
    const aeneas = dec.creatures[0];
    expect(aeneas.species).toBe('ankylosaurus');
    expect(hasTrait(aeneas, 'QuickStudy') && hasTrait(aeneas, 'Strong')).toBe(true);
    expect(dec.creatures[1].techniques.map((t) => t.id)).toEqual(expect.arrayContaining(['Smash', 'Lunge']));
    expect(dec.creatures[4]).toMatchObject({ species: 'sabertooth', level: 2 });
    expect(dec.buildings.residence).toBe(1);
    const sol = rival(s, 'solonius');
    expect(sol.buildings.residence).toBe(1);
    expect(sol.buildings.mine).toBe(1);
    const ages = sol.creatures.filter((c) => c.kind === 'dino').map((c) => Math.round(eqAge(c)));
    expect(ages).toEqual(expect.arrayContaining([15, 13]));
    expect(sol.creatures.filter((c) => c.kind === 'dino').every((c) => c.level === 2)).toBe(true);
    expect(sol.creatures.find((c) => c.kind === 'beast')).toMatchObject({ name: 'Old Wolf', species: 'direwolf' });
    const mag = rival(s, 'magnus');
    expect(mag.buildings.trainingField).toBe(1);
    expect(mag.creatures.filter((c) => c.species === 'sabertooth').map((c) => c.name)).toEqual(['Leo I', 'Leo II']);
    const vet = rival(s, 'vettius');
    const gig = vet.creatures.find((c) => c.legend === 'gigantus')!;
    expect(stats(gig)).toEqual({ str: 9, agi: 4, cun: 3, hp: 40 });
    expect(gig).toMatchObject({ species: 'giganotosaurus', level: 5, cls: 'phalanx' });
    expect(['Giant', 'OneManArmy'].every((t) => hasTrait(gig, t as any))).toBe(true);
    expect(gig.techniques.map((t) => t.id)).toEqual(['Warcry', 'Cleave']);
    expect(hasTrait(gig, 'Impact')).toBe(false);
    expect(hasTrait(rival(makeState({ nightmare: true }), 'vettius').creatures.find((c) => c.legend === 'gigantus')!, 'Impact')).toBe(true);
  });

  it('the Unknown house: 200 denarii, Shoddy fang caps, two recruits and Emericus', () => {
    const s = makeState();
    const u = s.unknown;
    expect(u.denarii).toBe(200);
    expect(u.armory).toEqual([expect.objectContaining({ type: 'fangCaps', quality: 0 })]);
    expect(u.creatures).toHaveLength(3);
    const em = u.creatures.find((c) => c.legend === 'emericus')!;
    expect(stats(em)).toEqual({ str: 5, agi: 5, cun: 5, hp: 30 });
    expect(em.prof.fang).toBe(60);
    const h = makeState({ hard: true });
    expect(h.unknown.creatures.every((c) => ['Rally', 'Decimate', 'Parry'].every((t) => c.techniques.some((x) => x.id === t)))).toBe(true);
  });
});

describe('legends', () => {
  it('builds Theokoles, Spartacus and friends', () => {
    const s = makeState();
    s.world.week = 60;
    const t = makeLegend(s, 'theokoles');
    expect(stats(t)).toEqual({ str: 20, agi: 10, cun: 5, hp: 73 });
    expect(t).toMatchObject({ species: 'tyrannosaurus', level: 8, price: 800, cls: 'slasher', classXp: 10, legend: 'theokoles' });
    expect(t.prof.claw).toBe(60);
    for (const tr of ['Albino', 'Titan', 'HorribleDisfigurement', 'Strong', 'Killer', 'ShowMan', 'Indomitable', 'Ambidextrous', 'DualWield', 'Alert']) {
      expect(hasTrait(t, tr as any)).toBe(true);
    }
    expect(t.techniques).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'Headbutt', rank: 4 })]));
    const sp = makeLegend(s, 'spartacus');
    expect(stats(sp)).toEqual({ str: 10, agi: 9, cun: 7, hp: 40 });
    expect(sp).toMatchObject({ species: 'allosaurus', level: 3, price: 350 });
    expect(makeLegend(s, 'crixus')).toMatchObject({ species: 'carnotaurus', price: 250 });
    expect(makeLegend(s, 'gwyn')).toMatchObject({ species: 'spinosaurus', name: 'Gwyn', level: 8, cls: 'snarer' });
    for (const k of ['gannicus', 'oenomaus', 'gigantus', 'spiculus', 'melankomas', 'hector', 'neokoros', 'agiad', 'maximus', 'hannibalbarca', 'hermes', 'emericus', 'lictor']) {
      const c = makeLegend(s, k);
      expect(c.legend).toBe(k);
      expect(c.notes?.some((n) => n.startsWith('gear:')) ?? false).toBe(false);
    }
    const odd = makeLegend(s, 'brutusTheBold');
    expect(odd).toMatchObject({ name: 'Brutus The Bold', legend: 'brutusTheBold', kind: 'dino' });
    expect(odd.level).toBeGreaterThanOrEqual(4);
  });
});

describe('opinion and instructions', () => {
  it('changeOpinion adds the honesty reaction on negative changes only', () => {
    const s = makeState();
    const dec = rival(s, 'decimus');
    const bat = rival(s, 'batiatus');
    changeOpinion(s, dec, -2);
    changeOpinion(s, bat, -2);
    expect(dec.ai!.opinion).toBe(48);
    expect(bat.ai!.opinion).toBe(45);
    changeOpinion(s, bat, 5);
    expect(bat.ai!.opinion).toBe(50);
    changeOpinion(s, rival(s, 'magnus'), -1);
    expect(rival(s, 'magnus').ai!.opinion).toBe(48);
    changeOpinion(s, rival(s, 'solonius'), -1);
    expect(rival(s, 'solonius').ai!.opinion).toBe(47);
  });

  it('opinionLabel uses the GM bands', () => {
    expect([90, 61, 60, 40, 39, 16, 15, -20].map(opinionLabel)).toEqual(
      ['Favourable', 'Favourable', 'Neutral', 'Neutral', 'Unfavourable', 'Unfavourable', 'Sworn enemy', 'Sworn enemy']);
  });

  it('aiInstruction follows GM 01 §21', () => {
    const s = makeState();
    const r = rival(s, 'decimus');
    r.ai!.opinion = 50;
    expect(aiInstruction(s, r, 0, false)).toBe('care');
    r.ai!.opinion = 10;
    expect(aiInstruction(s, r, 0, false)).toBe('allout');
    r.ai!.opinion = 30;
    expect(aiInstruction(s, r, 0, false)).toBe('default');
    r.ai!.opinion = 50;
    expect(aiInstruction(s, r, 100, true)).toBe('care');
    r.ai!.opinion = 90;
    const seen = new Set(Array.from({ length: 40 }, () => aiInstruction(s, r, 130, true)));
    expect([...seen].sort()).toEqual(['care', 'throw']);
    r.ai!.opinion = 0;
    const low = new Set(Array.from({ length: 60 }, () => aiInstruction(s, r, 0, true)));
    expect(low.has('kill')).toBe(true);
    expect(low.has('care')).toBe(false);
  });

  it('preferences and valuation', () => {
    const s = makeState();
    const mag = rival(s, 'magnus'); // prefers cunning
    const clever = makeNamed('troodon', 'Brains', { str: 4, agi: 6, cun: 12, hp: 30 });
    const dim = makeNamed('troodon', 'Dim', { str: 4, agi: 6, cun: 4, hp: 30 });
    expect(preferenceScore(mag, clever)).toBe(1);
    expect(preferenceScore(mag, dim)).toBe(-1);
    expect(valuation(mag, clever)).toBeGreaterThan(valuation(mag, dim));
  });
});

describe('spawning and cleanup', () => {
  it('opens random houses and the named late rivals', () => {
    const s = makeState();
    s.world.week = 30;
    const r = spawnRival(s, 'random');
    expect(r.name).toMatch(/^House /);
    expect(r.denarii).toBe(1000 + 25 * 30);
    expect(r.creatures).toHaveLength(3);
    expect(r.creatures[0].level).toBe(5);
    expect(r.ai!.key).toBe('random');
    expect(s.player.messages[0].title).toBe('A new ludus');
    const c = spawnRival(s, 'caesar');
    expect(c.creatures.some((x) => x.name === 'Victor')).toBe(true);
    expect(c.creatures.filter((x) => x.species === 'sabertooth')).toHaveLength(2);
    expect(c.creatures.some((x) => x.species === 'woollyrhino')).toBe(true);
    const cr = spawnRival(s, 'crassus');
    expect(cr).toMatchObject({ denarii: 5000, miningBonus: 2, projected: 100 });
    expect(cr.ai!.opinion).toBe(40);
    expect(cr.creatures[0]).toMatchObject({ name: 'Ferox', level: 9 });
    const hn = spawnRival(s, 'hannibal');
    expect(hn.creatures.filter((x) => x.species === 'mammoth').map((x) => x.name)).toEqual(['Surus', "Barca's Wall"]);
    expect(s.rivals).toHaveLength(9);
  });

  it('removes defeated houses, refills every 6 weeks and sends in Crassus', () => {
    const s = makeState();
    s.world.week = 12;
    rival(s, 'magnus').defeated = 'debt';
    rival(s, 'decimus').defeated = 'uprising';
    cleanupRivals(s);
    expect(s.rivals).toHaveLength(4); // 3 left + a new house
    expect(s.pendingAchievements).toContain('eliminateOpponent');
    expect(ctl.joined.length).toBeGreaterThan(0); // Magnus' dinos went to the Horde
    expect(s.player.messages.some((m) => m.sender === 'herald' && m.title === 'Magnus has fallen')).toBe(true);
    const t = makeState();
    t.world.week = 31;
    spawnRival(t, 'caesar');
    rival(t, 'solonius').defeated = 'raid';
    cleanupRivals(t);
    expect(t.rivals.some((r) => r.ai!.key === 'crassus')).toBe(true);
  });

  it('theokolesCheck sends Theokoles to the strongest rival or the market', () => {
    const s = makeState();
    s.world.week = 60;
    s.player.ludus.influence = 1000;
    for (let i = 0; i < 100 && !s.world.flags.theokoles; i++) theokolesCheck(s);
    expect(s.world.flags.theokoles).toBe('rival');
    expect(s.rivals.some((r) => r.creatures.some((c) => c.legend === 'theokoles'))).toBe(true);
  });
});

describe('the AI week', () => {
  it('helpRival: Decimus +250 at week 10, mines every 20 weeks, keepers every 15', () => {
    const s = makeState();
    const dec = rival(s, 'decimus');
    s.world.week = 10;
    const d0 = dec.denarii;
    helpRival(s, dec);
    expect(dec.denarii - d0).toBeGreaterThanOrEqual(250);
    s.world.week = 20;
    const m0 = dec.miningBonus;
    helpRival(s, dec);
    expect(dec.miningBonus - m0).toBe(2);
    s.world.week = 30;
    const k0 = dec.keepers.unassigned + dec.keepers.spies;
    helpRival(s, dec);
    expect(dec.keepers.unassigned + dec.keepers.spies - k0).toBe(2); // 15 and 30
  });

  it('runs thirty weeks for every house without breaking anything', () => {
    const s = makeState({ hard: true });
    ctl.canBuild = true;
    for (let w = 1; w <= 30; w++) {
      s.world.week = w;
      unknownWeek(s);
      for (const r of [...s.rivals].reverse()) {
        r.builtThisWeek = false;
        r.surgeriesThisWeek = 0;
        helpRival(s, r);
        rivalWeek(s, r);
      }
      cleanupRivals(s);
      rivalBids(s);
      seedWeekTournaments(s);
      for (const r of s.rivals) {
        expect(Number.isFinite(r.denarii)).toBe(true);
        expect(r.creatures.length).toBeLessThanOrEqual(12);
        expect(r.keepers.unassigned).toBe(0);
      }
    }
    expect(ctl.builds.length).toBeGreaterThan(0);
    expect(s.world.calendar.some((d) => d.key === 'organized')).toBe(true);
    expect(s.unknown.denarii).toBe(200);
    expect(s.unknown.armory.some((g) => g.type === 'greatTalons')).toBe(true); // Hard: Old Spatha → Great Talons at week 10
  });

  it('manageCreatures gives classes by mindset and spends points', () => {
    const s = makeState();
    const bat = rival(s, 'batiatus'); // AlwaysClass
    const recruit = generateDino({ week: 1, level: 3 });
    recruit.statPoints = 2;
    bat.creatures.push(recruit);
    manageCreatures(s, bat);
    expect(recruit.cls).not.toBeNull();
    expect(recruit.statPoints).toBe(0);
  });

  it('buffUp grants a level and a trait', () => {
    const c = generateDino({ week: 1, level: 2 });
    const n = c.traits.length;
    buffUp(c);
    expect(c.level).toBe(3);
    expect(c.traits.length).toBe(n + 1);
  });

  it('rivalBids sends offers for favourite types and dinos offered to rivals', () => {
    const s = makeState();
    const c = makeNamed('velociraptor', 'Bait', { str: 12, agi: 12, cun: 12, hp: 40 }, { level: 3 });
    c.offerToRivals = true;
    s.player.ludus.creatures.push(c);
    for (const r of s.rivals) r.denarii = 3000;
    for (let w = 1; w < 200 && !s.player.offers.length; w++) { s.world.week = w; rivalBids(s); }
    expect(s.player.offers.length).toBeGreaterThan(0);
    const o = s.player.offers[0];
    expect(o.creatureId).toBe(c.id);
    expect(o.amount).toBeGreaterThan(0);
    expect(s.rivals.some((r) => r.id === o.rivalId)).toBe(true);
    expect(s.player.messages.some((m) => m.offer?.id === o.id)).toBe(true);
  });

  it('unknownWeek resets the purse, heals and refills', () => {
    const s = makeState();
    const u = s.unknown;
    u.denarii = 5;
    u.creatures = u.creatures.slice(0, 1);
    u.creatures[0].injury = { type: 'flesh', weeks: 1 };
    s.world.week = 10;
    unknownWeek(s);
    expect(u.denarii).toBe(200);
    expect(u.creatures.length).toBe(2);
    expect(u.creatures[0].injury).toBeNull();
    expect(u.armory.some((g) => g.type === 'talonBlades' && g.quality === 1)).toBe(true);
  });
});
