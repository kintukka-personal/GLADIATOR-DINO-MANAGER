// Tournaments, pits, leagues and the Legends events (src/engine/tournaments.ts).
// Every module outside the arena is mocked: combat picks the winner by Σ(worth+10) unless a test forces it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Creature, GameState, Ludus, PlayerData, World } from '../src/engine/types';

const ctl = vi.hoisted(() => ({
  /** force the player's side (side 0 in player matches) to win/lose; null = by team worth */
  playerWins: null as null | boolean,
  aiCheat: null as null | 'poison' | 'chains' | 'beast' | 'guards',
  hasOpp: true,
  ascReady: false,
  hooks: [] as { hook: string; data: Record<string, unknown> }[],
  battles: 0,
  sides: [] as unknown[],
}));

vi.mock('../src/engine/combat', async () => {
  const { worth } = await vi.importActual<typeof import('../src/engine/creature')>('../src/engine/creature');
  const tw = (cs: Creature[]) => cs.reduce((s, c) => s + worth(c) + 10, 0);
  return {
    teamWorth: tw,
    prepareFighter: (_s: unknown, _h: unknown, c: Creature, instruction: unknown) => ({ creature: c, gear: {}, instruction }),
    buildSide: (_s: unknown, house: Ludus | undefined, creatures: Creature[], ins: Record<string, unknown> | null, opts: any) => ({
      houseId: house?.id, name: opts.name ?? house?.name ?? 'Wilds',
      fighters: creatures.map((c) => ({ creature: c, gear: {}, instruction: ins && typeof ins === 'object' ? ins[c.id] ?? null : ins })),
      modifiers: [...(opts.modifiers ?? [])], injuryMod: 0, influence: house?.influence ?? 0, player: !!opts.player,
    }),
    resolveBattle: (sides: any[]) => {
      ctl.battles++;
      ctl.sides.push(sides);
      const w0 = tw(sides[0].fighters.map((f: any) => f.creature));
      const w1 = tw(sides[1].fighters.map((f: any) => f.creature));
      let winner: 0 | 1 = w0 >= w1 ? 0 : 1;
      if (sides[0].player && !sides[1].player && ctl.playerWins !== null) winner = ctl.playerWins ? 0 : 1;
      const outcomes = sides.flatMap((s: any, si: number) => s.fighters.map((f: any) => ({
        creatureId: f.creature.id, side: si, temporary: f.temporary, knockedOut: si !== winner, yielded: false, died: false,
        injury: null, xp: 10, fame: 1, loyalty: 0, newTraits: [], hpEnd: 5, hpMax: 10, biggestHit: 3,
      })));
      return { winner, decidedBy: 'ko', rounds: 3, log: [], fighters: [], outcomes };
    },
    applyBattleResult: () => [],
  };
});
vi.mock('../src/engine/bribes', () => ({
  cheatCost: () => 30,
  cheatAvailable: () => null,
  aiCheatChoice: () => ctl.aiCheat,
  betMultiplier: () => 1,
}));
vi.mock('../src/engine/influence', () => ({ hasOpp: () => ctl.hasOpp, publicSessionsIncome: () => 5 }));
vi.mock('../src/engine/economy', () => ({
  addInfluence: (_s: unknown, h: Ludus, n: number) => { h.influence = Math.max(0, h.influence + n); return n; },
  addKeepers: (h: Ludus, n: number, job?: string) => { (h.keepers as any)[job ?? 'unassigned'] += n; },
}));
vi.mock('../src/engine/stories', () => ({ storyHook: (_s: unknown, hook: string, data: Record<string, unknown> = {}) => { ctl.hooks.push({ hook, data }); } }));
vi.mock('../src/engine/ascension', async () => {
  const { makeNamed } = await vi.importActual<typeof import('../src/engine/creature')>('../src/engine/creature');
  return {
    ascensionProgress: () => ({ trophies: 4, needed: 4, hordeDefeated: true, shrine: true, ready: ctl.ascReady }),
    ascensionFoes: (_s: unknown, round: number) => [makeNamed('allosaurus', `God's Champion ${round}`, { str: 1, agi: 1, cun: 1, hp: 20 })],
  };
});
vi.mock('../src/engine/buildings', () => ({ canBuild: () => ({ ok: false, cost: 0 }), build: () => 'no', buildingTotals: () => ({}) }));
vi.mock('../src/engine/loyalty', () => ({ rewardCreature: () => null }));
vi.mock('../src/engine/horde', () => ({ joinHorde: () => undefined }));
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
  seedCalendar, seedWeekTournaments, maxTournamentLevel, eligibility, register, startTournaments, attendedTournament,
  nextPlayerMatch, playMatch, continueBonus, autoResolve, finishTournaments, leagueWeek, activeLeague, organizeTournament,
  upcoming, prizeFor, eventsForWeek, entryName, entryCreatures, bonusPending, scheduleOrganized, leagueStandings,
} from '../src/engine/tournaments';
import { seedRivals } from '../src/engine/rivals';
import { makeLudus } from '../src/engine/newgame';
import { makeNamed, hasTrait, generateDino } from '../src/engine/creature';
import { EVENT_TEMPLATES } from '../src/engine/data/arenaData';
import { setSeed } from '../src/engine/rng';
import { setIdCounter } from '../src/engine/util';

function makeState(o: { hard?: boolean; nightmare?: boolean; seed?: number; ascension?: number } = {}): GameState {
  setSeed(o.seed ?? 4242);
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
    ascension: o.ascension ?? 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
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
  seedWeekTournaments(state);
  return state;
}

function dino(state: GameState, name: string, level = 1, stats = { str: 8, agi: 8, cun: 8, hp: 35 }): Creature {
  const c = makeNamed('velociraptor', name, stats, { level, eqAge: 20 });
  state.player.ludus.creatures.push(c);
  return c;
}

function goToWeek(state: GameState, week: number): void {
  state.world.week = week;
  state.player.registrations = {};
  state.player.week = {};
  for (const h of [state.player.ludus, ...state.rivals, state.unknown]) for (const c of h.creatures) c.inactive = false;
  seedWeekTournaments(state);
}

const byKey = (s: GameState, key: string) => s.world.tournaments.find((t) => t.key === key)!;

/** Play every player match of the attended tournament; returns the number of matches played. */
function playAll(state: GameState, t = attendedTournament(state)!): number {
  let n = 0;
  for (let p = nextPlayerMatch(state, t); p; p = nextPlayerMatch(state, t)) { playMatch(state, t, {}); n++; if (n > 40) break; }
  return n;
}

beforeEach(() => {
  ctl.playerWins = null;
  ctl.aiCheat = null;
  ctl.hasOpp = true;
  ctl.ascReady = false;
  ctl.hooks = [];
  ctl.battles = 0;
  ctl.sides = [];
});

describe('calendar', () => {
  it('maxTournamentLevel follows GM', () => {
    expect([1, 7, 19, 20, 49, 50, 100].map(maxTournamentLevel)).toEqual([1, 2, 3, 3, 6, 7, 10]);
  });

  it('seeds the opening calendar, the Lunar league (with Gannicus/Pontius points) and the first Solar league', () => {
    const s = makeState();
    const keys = s.world.calendar.map((d) => `${d.key}@${d.week}`);
    for (const k of ['hippodrome@3', 'challenge@4', 'teamwork@5', 'gigantus@6', 'primal@8', 'lunarChampions@10', 'triumph@12', 'forTheGods@52']) {
      expect(keys).toContain(k);
    }
    const [lunar, solar] = s.world.leagues;
    expect(lunar).toMatchObject({ id: 'lunar', start: 0, end: 13, active: true, pool: 700 });
    expect(solar).toMatchObject({ id: 'solar', start: 20, end: 40, active: false });
    expect(s.world.calendar.filter((d) => d.league === 'solar').map((d) => d.week)).toEqual([21, 30, 34, 39]);
    const pts = Object.entries(lunar.points).map(([id, p]) => [lunar.names[id], p]);
    expect(pts).toEqual(expect.arrayContaining([['Gannicus', 8], ['Pontius', 2]]));
  });

  it('week 1 has Rome\'s Finest (Solonius organises and enters), Initium and the pits', () => {
    const s = makeState();
    const keys = s.world.tournaments.map((t) => t.key).sort();
    expect(keys).toEqual(['initium', 'pits', 'romesFinest']);
    const rf = byKey(s, 'romesFinest');
    const sol = s.rivals.find((r) => r.ai?.key === 'solonius')!;
    expect(rf.organizerId).toBe(sol.id);
    expect(rf.entries.some((e) => e.houseId === sol.id)).toBe(true);
    expect(rf.entries.length).toBeLessThan(rf.teams);
    expect(rf.league).toBeUndefined();
  });

  it('reschedules recurring events the GM way and follows the Initium / Hatchling rules', () => {
    const s = makeState();
    const seen: Record<string, number[]> = {};
    for (let w = 2; w <= 40; w++) {
      goToWeek(s, w);
      for (const t of s.world.tournaments) (seen[t.key] ??= []).push(w);
      if (w === 8) {
        const h = byKey(s, 'hatchling');
        expect(h.teams).toBe(2);
        expect(h.beasts).toBe(true);
      }
      if (w === 4) expect(byKey(s, 'hatchling').beasts).toBe(false);
    }
    expect(seen.hippodrome).toEqual([3, 8, 18, 38]);
    expect(seen.triumph).toEqual([12, 26]);
    expect(seen.primal).toEqual([8, 16, 24, 32, 40]);
    expect(seen.challenge?.slice(0, 4)).toEqual([4, 8, 12, 16]);
    expect(seen.initium?.slice(0, 5)).toEqual([2, 3, 6, 9, 12]);
    expect(seen.hatchling?.slice(0, 4)).toEqual([2, 4, 8, 12]);
    expect(seen.pits?.length).toBe(39);
    expect(seen.solarDawn).toEqual([21]);
  });

  it('AI entrants ignore last week\'s inactive flags (seeding runs before resetWeekFlags)', () => {
    const s = makeState();
    for (const r of s.rivals) for (const c of r.creatures) c.inactive = true;
    s.world.week = 4;
    s.player.registrations = {};
    seedWeekTournaments(s);
    expect(byKey(s, 'challenge').entries.some((e) => s.rivals.some((r) => r.id === e.houseId))).toBe(true);
  });

  it('upcoming() lists this week and predicted future events', () => {
    const s = makeState();
    const u = upcoming(s, 5);
    expect(u.some((d) => d.key === 'hippodrome' && d.week === 3)).toBe(true);
    expect(u.filter((d) => d.key === 'pits').length).toBe(6);
    expect(eventsForWeek(s, 6).some((d) => d.key === 'gigantus')).toBe(true);
  });

  it('who can defeat Gigantus reveals Vettius and his giant', () => {
    const s = makeState();
    const v = s.rivals.find((r) => r.ai?.key === 'vettius')!;
    expect(v.ai!.visible).toBe(false);
    goToWeek(s, 6);
    expect(v.ai!.visible).toBe(true);
    const g = byKey(s, 'gigantus');
    const e = g.entries.find((x) => x.houseId === v.id)!;
    expect(entryCreatures(s, e).map((c) => c.name)).toContain('Gigantus');
  });
});

describe('eligibility and registration', () => {
  it('applies the GM rules', () => {
    const s = makeState();
    const rookie = byKey(s, 'initium');
    const rf = byKey(s, 'romesFinest');
    const vet = dino(s, 'Veteranus', 5);
    expect(eligibility(s, rookie, vet)).toMatch(/Too experienced/);
    const champ = dino(s, 'Champio');
    champ.traits.push('ArenaChampion');
    expect(eligibility(s, rookie, champ)).toMatch(/barred/);
    const kid = generateDino({ week: 1, eqAge: 12 });
    s.player.ludus.creatures.push(kid);
    expect(eligibility(s, rf, kid)).toMatch(/Too young/);
    const hurt = dino(s, 'Hurtus');
    hurt.injury = { type: 'broken', weeks: 3 };
    expect(eligibility(s, rf, hurt)).toBe('Injured.');
    const fine = dino(s, 'Finus');
    expect(eligibility(s, rf, fine)).toBeNull();
    expect(register(s, rf.id, [[fine.id]])).toBeNull();
    expect(eligibility(s, rookie, fine)).toMatch(/Already entered/);
    // beasts and mating
    goToWeek(s, 5);
    const team = byKey(s, 'teamwork');
    const wolf = makeNamed('direwolf', 'Lupa', { str: 8, agi: 20, cun: 3, hp: 20 }, { sex: 'F' });
    s.player.ludus.creatures.push(wolf);
    expect(eligibility(s, team, wolf)).toMatch(/No beasts/);
    const f = makeNamed('velociraptor', 'Mater', { str: 8, agi: 8, cun: 8, hp: 35 }, { sex: 'F', eqAge: 20 });
    const m = dino(s, 'Pater');
    s.player.ludus.creatures.push(f);
    s.player.ludus.pairs.push({ maleId: m.id, femaleId: f.id, since: 1 });
    expect(eligibility(s, team, f)).toMatch(/breeding pen/);
  });

  it('the Hatchling Games take juveniles only', () => {
    const s = makeState();
    goToWeek(s, 4);
    const junior = byKey(s, 'hatchling');
    const kid = generateDino({ week: 4, eqAge: 13 });
    s.player.ludus.creatures.push(kid);
    expect(eligibility(s, junior, kid)).toBeNull();
    expect(eligibility(s, junior, dino(s, 'Adultus'))).toMatch(/Too old/);
  });

  it('extra teams double the bracket; the pits take one team', () => {
    const s = makeState();
    const a = dino(s, 'Alpha');
    const b = dino(s, 'Beta');
    const rf = byKey(s, 'romesFinest');
    expect(register(s, rf.id, [[a.id], [b.id]])).toBeNull();
    const pits = byKey(s, 'pits');
    expect(register(s, pits.id, [[a.id], [b.id]])).toMatch(/one team/);
    startTournaments(s);
    expect(rf.teams).toBe(8);
    expect(rf.entries).toHaveLength(8);
    expect(rf.attended).toBe(true);
    const mine = rf.entries.map((e, i) => (e.houseId === s.player.ludus.id ? i : -1)).filter((i) => i >= 0);
    expect(mine).toHaveLength(2);
    expect(Math.floor(mine[0] / 2)).not.toBe(Math.floor(mine[1] / 2));
    expect(a.inactive && b.inactive).toBe(true);
  });
});

describe('playing a tournament', () => {
  it('plays the attended event, pays prizes and win effects, calls the story hooks', () => {
    const s = makeState();
    const hero = dino(s, 'Flamma', 6, { str: 15, agi: 15, cun: 15, hp: 60 });
    const rf = byKey(s, 'romesFinest');
    expect(register(s, rf.id, [[hero.id]])).toBeNull();
    expect(ctl.hooks.some((h) => h.hook === 'registered')).toBe(true);
    startTournaments(s);
    expect(attendedTournament(s)).toBe(rf);
    const before = { d: s.player.ludus.denarii, i: s.player.ludus.influence };
    ctl.playerWins = true;
    const preview = nextPlayerMatch(s, rf)!;
    expect(preview.roundLabel).toBe('Semi-final');
    expect(preview.playerCreatures).toEqual([hero]);
    expect(preview.riders).toBe(false);
    expect(playAll(s, rf)).toBe(2);
    expect(rf.status).toBe('done');
    expect(s.player.ludus.denarii - before.d).toBe(200); // 100 × 4 / 2
    expect(s.player.ludus.influence - before.i).toBe(8); // contestants + teams
    expect(hasTrait(hero, 'ArenaChampion')).toBe(true);
    expect(hero.career.majorWins).toBe(1);
    expect(s.pendingAchievements).toContain('wonTournament');
    const mr = ctl.hooks.filter((h) => h.hook === 'matchResult');
    expect(mr).toHaveLength(2);
    expect(mr[0].data).toMatchObject({ won: true, playerWon: true, tournamentKey: 'romesFinest' });
    expect(typeof mr[0].data.opponentHouseId).toBe('string');
    expect(ctl.hooks.some((h) => h.hook === 'tournamentWon')).toBe(true);
    const lines = finishTournaments(s);
    expect(lines.some((l) => l.includes("Rome's Finest") && l.includes('+200 denarii'))).toBe(true);
    expect(s.world.tournaments.every((t) => t.status === 'done')).toBe(true);
  });

  it('a knocked-out player gets nothing to play and the rest auto-resolves', () => {
    const s = makeState();
    const weak = dino(s, 'Weakus');
    const rf = byKey(s, 'romesFinest');
    register(s, rf.id, [[weak.id]]);
    startTournaments(s);
    ctl.playerWins = false;
    expect(playAll(s, rf)).toBe(1);
    expect(nextPlayerMatch(s, rf)).toBeNull();
    expect(rf.status).toBe('done');
    expect(rf.log.some((l) => l.startsWith('» '))).toBe(true);
  });

  it('bets pay stake × (1 + multiplier), cheats are announced and guards cancel them', () => {
    const s = makeState();
    const bat = s.rivals.find((r) => r.ai?.key === 'batiatus')!;
    scheduleOrganized(s, bat, { perTeam: 1, teams: 2, week: 7, beasts: false, mounts: false });
    goToWeek(s, 7);
    const t = s.world.tournaments.find((x) => x.organizerId === bat.id)!;
    expect(t.entries[0].houseId).toBe(bat.id);
    const hero = dino(s, 'Bettor', 8, { str: 20, agi: 20, cun: 20, hp: 80 });
    register(s, t.id, [[hero.id]]);
    startTournaments(s);
    ctl.aiCheat = 'chains';
    ctl.playerWins = true;
    const p = nextPlayerMatch(s, t)!;
    expect(p.aiCheats).toBe(true);
    expect(p.opponentHouse?.id).toBe(bat.id);
    const d0 = s.player.ludus.denarii;
    const op0 = bat.ai!.opinion;
    const r = playMatch(s, t, { bet: { stake: 50, onSelf: true }, bribe: 'guards' });
    expect(r.won).toBe(true);
    expect(r.betPayout).toBe(100);
    // guards (30) + stake (50) paid, payout 100 back; tournament prize 100 (50 × 2 / 2) + organiser nothing
    expect(s.player.ludus.denarii - d0).toBe(-30 - 50 + 100 + 100);
    const side = (ctl.sides[ctl.sides.length - 1] as any[]);
    expect(side[0].modifiers).not.toContain('Chained'); // guards cancelled the chains
    expect(bat.ai!.opinion).toBe(op0); // guards are not cheating
  });

  it('winning after cheating costs opinion; losing fairly on Care pleases the rival', () => {
    const s = makeState();
    const bat = s.rivals.find((r) => r.ai?.key === 'batiatus')!;
    scheduleOrganized(s, bat, { perTeam: 1, teams: 2, week: 7, beasts: false, mounts: false });
    scheduleOrganized(s, bat, { perTeam: 1, teams: 2, week: 9, beasts: false, mounts: false });
    goToWeek(s, 7);
    const a = dino(s, 'Cheater');
    let t = s.world.tournaments.find((x) => x.organizerId === bat.id)!;
    register(s, t.id, [[a.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    const op0 = bat.ai!.opinion;
    playMatch(s, t, { bribe: 'poison' });
    expect(op0 - bat.ai!.opinion).toBe(2 + 3); // −2, treacherous −3 more
    expect((ctl.sides[ctl.sides.length - 1] as any[])[0].modifiers).toContain('PoisonedWeapons');
    goToWeek(s, 9);
    t = s.world.tournaments.find((x) => x.organizerId === bat.id)!;
    register(s, t.id, [[a.id]]);
    startTournaments(s);
    ctl.playerWins = false;
    const before = { op: bat.ai!.opinion, d: bat.denarii, i: bat.influence };
    playMatch(s, t, { instructions: { [a.id]: 'care' } });
    expect(bat.ai!.opinion - before.op).toBe(1);
    expect(bat.influence - before.i).toBeGreaterThanOrEqual(1);
  });

  it('a lone dino beating a team of three earns One-Dino Army', () => {
    const s = makeState();
    const bat = s.rivals.find((r) => r.ai?.key === 'batiatus')!;
    bat.creatures.find((c) => c.legend === 'gannicus')!.injury = null;
    scheduleOrganized(s, bat, { perTeam: 3, teams: 2, week: 7, beasts: false, mounts: false });
    goToWeek(s, 7);
    const t = s.world.tournaments.find((x) => x.organizerId === bat.id)!;
    expect(entryCreatures(s, t.entries[0])).toHaveLength(3);
    const lone = dino(s, 'Solus', 10, { str: 30, agi: 30, cun: 30, hp: 150 });
    register(s, t.id, [[lone.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    playAll(s, t);
    expect(s.pendingAchievements).toContain('oneManArmy');
  });

  it('auto-resolution uses Care for the player', () => {
    const s = makeState();
    const a = dino(s, 'Autus');
    const b = dino(s, 'Secondus');
    register(s, byKey(s, 'romesFinest').id, [[a.id]]);
    register(s, byKey(s, 'initium').id, [[b.id]]);
    startTournaments(s);
    const init = byKey(s, 'initium');
    expect(init.attended).toBe(false);
    autoResolve(s, init);
    expect(init.status).toBe('done');
    const myFights = (ctl.sides as any[][]).filter((sd) => sd[0].player);
    expect(myFights.length).toBeGreaterThan(0);
    for (const sd of myFights) for (const f of sd[0].fighters) expect(f.instruction).toBe('care');
  });
});

describe('underground pits', () => {
  it('bonus rounds, retiring, prize and the one-tier-per-event trait ladder', () => {
    const s = makeState();
    const p = dino(s, 'Pitbull', 4);
    goToWeek(s, 7);
    let pits = byKey(s, 'pits');
    register(s, pits.id, [[p.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    expect(nextPlayerMatch(s, pits)!.bonusRound).toBe(0);
    playMatch(s, pits, {});
    expect(pits.status).toBe('bonus');
    expect(bonusPending(s, pits)).toBe(true);
    const b1 = nextPlayerMatch(s, pits)!;
    expect(b1.roundLabel).toBe('Bonus round 1: A Hungry Dire Wolf');
    expect(entryName(s, b1.opponent)).toBe('A Hungry Dire Wolf');
    playMatch(s, pits, {});
    expect(nextPlayerMatch(s, pits)!.roundLabel).toBe('Bonus round 2: The Challenger');
    playMatch(s, pits, {});
    const d0 = s.player.ludus.denarii;
    nextPlayerMatch(s, pits); // round 3 is offered...
    continueBonus(s, pits, false); // ...and refused
    expect(pits.status).toBe('done');
    expect(pits.retired).toBe(true);
    expect(s.player.ludus.denarii - d0).toBe(50 + 2 * 25);
    expect(hasTrait(p, 'PitFighter')).toBe(true);
    expect(p.career.pitBest).toBe(2);
    // next week: clear 8 bonus rounds (beats the Colossus) but only climb one tier
    goToWeek(s, 8);
    pits = byKey(s, 'pits');
    register(s, pits.id, [[p.id]]);
    startTournaments(s);
    let labels: string[] = [];
    for (let i = 0; i < 9; i++) { labels.push(nextPlayerMatch(s, pits)!.roundLabel); playMatch(s, pits, {}); }
    expect(labels[8]).toBe('Bonus round 8: The Colossus');
    expect(s.pendingAchievements).toContain('colossusSlayer');
    continueBonus(s, pits, false);
    expect(hasTrait(p, 'PitChampion')).toBe(true);
    expect(hasTrait(p, 'PitFighter')).toBe(false);
    expect(hasTrait(p, 'ColossusSlayer')).toBe(false);
    labels = [];
  });

  it('clearing every round fights N + 1 bonus rounds (11 without Legendary Pit Fights)', () => {
    const s = makeState();
    const p = dino(s, 'Ironhide', 10);
    goToWeek(s, 7);
    const pits = byKey(s, 'pits');
    register(s, pits.id, [[p.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    const n = playAll(s, pits);
    expect(n).toBe(1 + 11);
    expect(pits.status).toBe('done');
    expect(p.career.majorWins).toBe(1); // k ≥ 11
  });

  it('auto-resolved pit teams retire once the next pit trait is earned', () => {
    const s = makeState();
    const p = dino(s, 'Autopit', 4);
    goToWeek(s, 7);
    const pits = byKey(s, 'pits');
    register(s, pits.id, [[p.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    autoResolve(s, pits);
    expect(pits.bonusRound).toBe(2);
    expect(hasTrait(p, 'PitFighter')).toBe(true);
  });
});

describe('leagues', () => {
  it('scores the Lunar finale double and rewards the top three when the league ends', () => {
    const s = makeState();
    const star = dino(s, 'Luna', 8, { str: 25, agi: 25, cun: 25, hp: 100 });
    goToWeek(s, 10);
    const fin = byKey(s, 'lunarChampions');
    expect(fin.league).toBe('lunar');
    register(s, fin.id, [[star.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    playAll(s, fin);
    const lunar = activeLeague(s)!;
    expect(lunar.points[star.id]).toBe(8);
    lunar.points[star.id] += 20;
    const d0 = s.player.ludus.denarii;
    const i0 = s.player.ludus.influence;
    s.world.week = 13;
    const card = leagueWeek(s);
    expect(card?.kind).toBe('league');
    if (card?.kind !== 'league') return;
    expect(card.standings[0]).toEqual({ name: 'Luna', house: 'House Test', points: 28 });
    expect(s.player.ludus.trophies).toEqual([{ league: 'lunar', place: 1, week: 13, creatureName: 'Luna' }]);
    expect(hasTrait(star, 'LunarChampion')).toBe(true);
    expect(s.player.ludus.denarii - d0).toBe(350);
    expect(s.player.ludus.influence - i0).toBe(20);
    expect(s.player.ludus.armory.some((g) => g.type === 'talonBlades' && g.augment === 'Lunar' && g.quality === 3)).toBe(true);
    expect(s.player.leagueWins).toBe(1);
    expect(s.pendingAchievements).toContain('lunarChampion');
    expect(s.world.leagues.find((l) => l.id === 'lunar')!.done).toBe(true);
    expect(leagueStandings(s, lunar)[0].name).toBe('Luna');
  });

  it('opens the Solar league at week 20 with Gwyn for the weakest rival and schedules the later leagues', () => {
    const s = makeState();
    s.world.week = 13;
    leagueWeek(s);
    expect(s.world.leagues.map((l) => `${l.id}:${l.start}`)).toEqual(['lunar:0', 'solar:20', 'bacchus:50', 'jupiter:85', 'vulcan:120']);
    s.world.week = 20;
    leagueWeek(s);
    expect(activeLeague(s)?.id).toBe('solar');
    expect(s.rivals.some((r) => r.creatures.some((c) => c.legend === 'gwyn'))).toBe(true);
    expect(s.world.calendar.find((d) => d.key === 'bacchanalia')?.upgrade).toBe('bacchusLeague');
  });

  it('dead dinos lose their points', () => {
    const s = makeState();
    const lunar = activeLeague(s)!;
    const gan = s.rivals[0].creatures.find((c) => c.legend === 'gannicus')!;
    s.rivals[0].creatures = s.rivals[0].creatures.filter((c) => c !== gan);
    s.world.week = 2;
    leagueWeek(s);
    expect(lunar.points[gan.id]).toBeUndefined();
  });
});

describe('prizes, Legends and special events', () => {
  it('prizeFor follows GM 6.3', () => {
    const s = makeState();
    const T = EVENT_TEMPLATES;
    expect(prizeFor(s, T.initium)).toEqual({ denarii: 100, influence: 8 });
    expect(prizeFor(s, T.challenge)).toEqual({ denarii: 400, influence: 16 });
    expect(prizeFor(s, T.triumph)).toEqual({ denarii: 2300, influence: 64 });
    expect(prizeFor(s, T.legendsOfMars).denarii).toBe(700);
    expect(prizeFor(s, T.pits)).toEqual({ denarii: 50, influence: 4 });
    expect(prizeFor(s, T.invader).influence).toBe(4 + 4 + 10);
    const n = makeState({ nightmare: true });
    expect(prizeFor(n, T.challenge).denarii).toBe(350);
    expect(prizeFor(n, T.romesFinest).denarii).toBe(150);
    expect(prizeFor(n, T.initium).denarii).toBe(100);
  });

  it('Legends tournaments bring three foreign champion houses; winning climbs the champion tiers', () => {
    const s = makeState();
    let t;
    for (let w = 4; w < 80 && !t; w++) { goToWeek(s, w); t = s.world.tournaments.find((x) => x.type === 'invader'); }
    expect(t).toBeTruthy();
    const inv = t!.entries.filter((e) => e.temp?.length);
    expect(inv).toHaveLength(3);
    for (const e of inv) {
      expect(entryName(s, e)).toMatch(/^Champions of /);
      expect(e.temp![0].notes!.some((n) => n.startsWith('gear:weapon:'))).toBe(true);
    }
    const hero = dino(s, 'Worldbeater', 12, { str: 40, agi: 40, cun: 40, hp: 200 });
    register(s, t!.id, [[hero.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    playAll(s, t!);
    expect(s.player.ludus.championTier).toBe(1);
    expect(s.player.invaderWins).toBe(1);
    expect(hasTrait(hero, 'WorldChampion')).toBe(true);
    expect(s.pendingAchievements).toContain('legendsChampion');
    // a Gold legend winning a Gold event becomes Diamond and gets an Amber Shard
    let g;
    s.player.ludus.championTier = 3;
    for (let w = t!.week + 1; w < 200 && !g; w++) { goToWeek(s, w); g = s.world.tournaments.find((x) => x.type === 'invader'); }
    g!.special = 'tier:3';
    hero.injury = null;
    register(s, g!.id, [[hero.id]]);
    startTournaments(s);
    playAll(s, g!);
    expect(s.player.ludus.championTier).toBe(4);
    expect(s.player.ludus.armory.some((x) => x.type === 'amberShard')).toBe(true);
    expect(s.pendingAchievements).toContain('diamondLegend');
  });

  it('the player organises a tournament and earns the gate', () => {
    const s = makeState();
    ctl.hasOpp = false;
    expect(organizeTournament(s, { perTeam: 1, teams: 4, week: 5, beasts: true, mounts: false })).toMatch(/Organizer/);
    ctl.hasOpp = true;
    expect(organizeTournament(s, { perTeam: 1, teams: 4, week: 1, beasts: true, mounts: false })).toMatch(/after this one/);
    const d0 = s.player.ludus.denarii;
    expect(organizeTournament(s, { perTeam: 1, teams: 4, week: 5, beasts: true, mounts: false })).toBeNull();
    expect(s.player.ludus.denarii).toBe(d0 - 300);
    expect(s.player.organized).toBe(1);
    expect(organizeTournament(s, { perTeam: 1, teams: 4, week: 5, beasts: true, mounts: false })).toMatch(/already host/);
    goToWeek(s, 5);
    const t = s.world.tournaments.find((x) => x.organizerId === s.player.ludus.id)!;
    expect(t.name).toBe("Testus' Tournament");
    const hero = dino(s, 'Hostus', 8, { str: 25, agi: 25, cun: 25, hp: 100 });
    register(s, t.id, [[hero.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    const d1 = s.player.ludus.denarii;
    playAll(s, t);
    expect(t.spectators).toBeGreaterThan(0);
    expect(s.player.ludus.denarii - d1).toBeGreaterThanOrEqual(200 + 100);
    expect(s.pendingAchievements).toContain('organizer');
  });

  it('the Ascension replaces the pits when ready; a full clear sets state.ascended', () => {
    const s = makeState();
    ctl.ascReady = true;
    goToWeek(s, 8);
    expect(s.world.tournaments.some((t) => t.key === 'pits')).toBe(false);
    const asc = byKey(s, 'ascension');
    expect(asc.bonusRounds).toBe(1);
    expect(asc.entries).toHaveLength(0);
    const champ = dino(s, 'Chosen', 10);
    register(s, asc.id, [[champ.id]]);
    startTournaments(s);
    ctl.playerWins = true;
    expect(playAll(s, asc)).toBe(1 + 2);
    expect(s.ascended).toBe(true);
    expect(s.world.flags.ascensionChampion).toBe(champ.id);
    expect(hasTrait(champ, 'Ascended')).toBe(true);
  });

  it('player-only events are cancelled when the player does not come', () => {
    const s = makeState();
    ctl.ascReady = true;
    goToWeek(s, 8);
    startTournaments(s);
    expect(byKey(s, 'ascension').status).toBe('done');
    expect(() => finishTournaments(s)).not.toThrow();
  });

  it('a whole week resolves without errors', () => {
    const s = makeState();
    for (let w = 2; w <= 30; w++) {
      goToWeek(s, w);
      startTournaments(s);
      finishTournaments(s);
      leagueWeek(s);
      expect(s.world.tournaments.every((t) => t.status === 'done')).toBe(true);
    }
    expect(ctl.battles).toBeGreaterThan(50);
  });
});
