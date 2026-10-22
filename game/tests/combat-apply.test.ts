import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  BattleResult, BattleSide, Creature, FoodId, GameState, Gear, GearTypeId, Ludus, Quality, Stats, TraitId,
} from '../src/engine/types';
import { setSeed } from '../src/engine/rng';
import { makeNamed, xpForLevel } from '../src/engine/creature';
import { makeGear } from '../src/engine/data/gear';
import { applyBattleResult, buildSide, resolveBattle, type CombatOutcome } from '../src/engine/combat';

vi.mock('../src/engine/care', () => ({
  bury: vi.fn((state: GameState, c: Creature) => {
    for (const h of [state.player.ludus, ...state.rivals, state.unknown]) h.creatures = h.creatures.filter((x) => x !== c);
  }),
}));
import { bury } from '../src/engine/care';

let gid = 0;
const G = (type: GearTypeId, q: Quality = 2, extra: Partial<Gear> = {}): Gear => makeGear(type, q, `ag${++gid}`, extra);
const st = (str: number, agi: number, cun: number, hp: number): Stats => ({ str, agi, cun, hp });

function ludus(name: string, isPlayer: boolean): Ludus {
  const b = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery', 'templeOfPluto', 'library',
    'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop', 'guardTower', 'aqueduct',
    'romeMansion', 'tavern', 'bathHouse'];
  return {
    id: `h-${name}`, name, isPlayer, denarii: 1000, influence: 0, allocatedInfluence: 0, projected: 0, miningBonus: 0,
    entBonus: 0, securityPenalties: 0, keepers: { unassigned: 0, miners: 0, showmen: 0, wardens: 1, spies: 0 }, spiesLastWeek: 0,
    buildings: Object.fromEntries(b.map((x) => [x, 0])) as Ludus['buildings'], builtThisWeek: false, creatures: [], armory: [],
    pantry: {}, eggs: [], pairs: [], bankruptLastWeek: false, unpaidThisWeek: false,
    training: { type: 'standard', overrides: {}, paid: { bestiarii: false, spartan: false, weapons: false }, sparring: [] },
    trophies: [], targetedThisWeek: false, caught: [], surgeriesThisWeek: 0, championTier: 0,
  };
}

function makeState(): GameState {
  const me = ludus('House Test', true);
  return {
    version: 1, slot: 0, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Test', female: false, heritage: 'roman', ludus: me, opportunities: [], treeSeed: 0,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [],
      stories: {}, storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [],
      conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0,
      invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [ludus('House Rival', false)], unknown: ludus('Unknown', false),
    world: {
      week: 5, rng: 0, difficulty: { hard: false, nightmare: false, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
      ascension: 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 0, price: 100 }, eggs: [], foodPrices: {} as Record<FoodId, number>, pokes: 0 },
      horde: { rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
      laws: { publicFunding: false }, flags: {}, temperature: 20, released: [],
    },
    ancestry: {}, unlocks: [], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
}

interface Setup { state: GameState; hero: Creature; foe: Creature; sides: [BattleSide, BattleSide] }

/** Player hero (strong Iguanodon with talon blades) against a rival weakling. */
function setup(o: { heroItem?: GearTypeId; foeItem?: GearTypeId; heroTraits?: TraitId[]; heroWeapon?: Gear; injuryMod?: number; extraFoeItem?: GearTypeId } = {}): Setup {
  const state = makeState();
  const me = state.player.ludus;
  const rv = state.rivals[0];
  const hero = makeNamed('iguanodon', 'Hero', st(14, 12, 8, 80), { traits: o.heroTraits ?? [], techniques: [['Smash', 2]] });
  const foe = makeNamed('velociraptor', 'Foe', st(5, 6, 4, 40));
  me.creatures = [hero];
  rv.creatures = [foe];
  const w = o.heroWeapon ?? G('talonBlades', 3);
  me.armory.push(w);
  hero.gear.weapon = w.id;
  if (o.heroItem) { const g = G(o.heroItem, 2); me.armory.push(g); hero.gear.item = g.id; }
  if (o.foeItem) { const g = G(o.foeItem, 2); rv.armory.push(g); foe.gear.item = g.id; }
  if (o.extraFoeItem) rv.armory.push(G(o.extraFoeItem, 2));
  const s0 = buildSide(state, me, [hero], 'allout', { riders: false, player: true });
  const s1 = buildSide(state, rv, [foe], null, { riders: false, injuryMod: o.injuryMod ?? 0 });
  return { state, hero, foe, sides: [s0, s1] };
}

beforeEach(() => {
  vi.mocked(bury).mockClear();
});

describe('applyBattleResult', () => {
  it('writes XP, fame, tameness, career, proficiency and run stats', () => {
    setSeed(10);
    const { state, hero, foe, sides } = setup();
    const r = resolveBattle(sides, { week: 5, riders: false });
    expect(r.winner).toBe(0);
    const before = { xp: hero.xp, fame: hero.fame, loy: hero.loyalty, claw: hero.prof.claw };
    hero.loyalty = 99;
    const dead = applyBattleResult({ state }, sides, r);
    const o = r.outcomes[0];
    expect(o.xp).toBeGreaterThan(0);
    expect(hero.xp).toBeGreaterThan(before.xp);
    expect(hero.fame).toBeGreaterThanOrEqual(1);
    expect(hero.loyalty).toBe(100); // clamped
    expect(foe.loyalty).toBe(78);
    expect(foe.fame).toBe(1); // a loss to a stronger house costs fame, minimum 1
    expect(hero.career.wins).toBe(1);
    expect(hero.career.battles).toBe(1);
    expect(foe.career.losses).toBe(1);
    expect(hero.career.biggestHit).toBe(o.biggestHit);
    expect(hero.prof.claw).toBe(before.claw + 3); // winner +2, Iguanodon +1
    expect(foe.prof.jaw).toBe(1); // bare-jawed loser +1
    expect(state.runStats.battles).toBe(1);
    expect(state.runStats.wins).toBe(1);
    if (!r.outcomes[1].died) expect(dead).toEqual([]);
  });

  it('quick study and level-ups go through grantXp', () => {
    setSeed(11);
    const { state, hero, sides } = setup({ heroTraits: ['QuickStudy'] });
    const r = resolveBattle(sides, { week: 5, riders: false });
    (r.outcomes[0] as CombatOutcome).xp = 250;
    hero.xp = xpForLevel(2) - 10;
    hero.level = 1;
    applyBattleResult({ state }, sides, r);
    expect(hero.level).toBeGreaterThanOrEqual(2);
    expect(hero.xp).toBe(xpForLevel(2) - 10 + Math.floor(250 * 1.25));
  });

  it('fresh injuries stack into multiple injuries', () => {
    setSeed(12);
    const { state, foe, sides } = setup();
    const r = resolveBattle(sides, { week: 5, riders: false });
    const o = r.outcomes[1];
    o.died = false;
    o.injury = { type: 'broken', weeks: 3 };
    foe.injury = { type: 'flesh', weeks: 1 };
    applyBattleResult({ state }, sides, r);
    expect(foe.injury).toEqual({ type: 'multiple', weeks: 4 });
  });

  it('a fight to the death kills the loser, buries it and makes the winner a Killer', () => {
    setSeed(13);
    const { state, hero, foe, sides } = setup();
    const r = resolveBattle(sides, { week: 5, riders: false, toTheDeath: true });
    expect(r.winner).toBe(0);
    expect(r.outcomes[1].died).toBe(true);
    expect(r.outcomes[0].newTraits).toContain('Killer');
    const dead = applyBattleResult({ state }, sides, r);
    expect(dead).toEqual(['Foe']);
    expect(bury).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bury).mock.calls[0][1]).toBe(foe);
    expect(vi.mocked(bury).mock.calls[0][2]).toMatch(/death/);
    expect(state.rivals[0].creatures).not.toContain(foe);
    expect(hero.traits).toContain('Killer');
    expect(hero.career.kills).toBe(1);
    expect(state.runStats.deaths).toBe(0); // the dead one was not the player's
  });

  it('a poultice downgrades a fatal injury, is consumed, and the next one is assigned', () => {
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      setSeed(400 + i);
      const { state, foe, sides } = setup({ foeItem: 'poultice', extraFoeItem: 'poultice', injuryMod: 12 });
      const firstId = foe.gear.item;
      const r = resolveBattle(sides, { week: 5, riders: false });
      const o = r.outcomes[1];
      expect(o.died).toBe(false);
      if (!o.bandageUsed) continue;
      found = true;
      applyBattleResult({ state }, sides, r);
      const rv = state.rivals[0];
      expect(rv.armory.some((g) => g.id === firstId)).toBe(false);
      expect(foe.gear.item).toBeDefined();
      expect(foe.gear.item).not.toBe(firstId);
      expect(rv.armory.find((g) => g.id === foe.gear.item)?.type).toBe('poultice');
      expect(bury).not.toHaveBeenCalled();
    }
    expect(found).toBe(true);
  });

  it('without a poultice a heavy beating can kill; exhibitions never do', () => {
    let deaths = 0;
    for (let i = 0; i < 30; i++) {
      setSeed(500 + i);
      const { state, foe, sides } = setup({ injuryMod: 12 });
      const r = resolveBattle(sides, { week: 5, riders: false });
      if (r.outcomes[1].died) deaths++;
      const s2 = setup({ injuryMod: 12 });
      const r2 = resolveBattle(s2.sides, { week: 5, riders: false });
      applyBattleResult({ state: s2.state, exhibition: true }, s2.sides, r2);
      expect(s2.foe.injury).toBeNull();
      expect(s2.state.rivals[0].creatures).toContain(s2.foe);
      void foe; void state;
    }
    expect(deaths).toBeGreaterThan(10);
  });

  it('sparring skips XP, fame and tameness', () => {
    setSeed(14);
    const { state, hero, sides } = setup();
    const r = resolveBattle(sides, { week: 5, riders: false, sparring: true });
    const xp = hero.xp; const fame = hero.fame; const loy = hero.loyalty;
    applyBattleResult({ state, sparring: true }, sides, r);
    expect(hero.xp).toBe(xp);
    expect(hero.fame).toBe(fame);
    expect(hero.loyalty).toBe(loy);
    expect(state.runStats.battles).toBe(0);
  });

  it('Hand of Midas coins are credited to the owner', () => {
    let paid = false;
    for (let i = 0; i < 10 && !paid; i++) {
      setSeed(600 + i);
      const { state, sides } = setup({ heroItem: 'handOfMidas' });
      const r = resolveBattle(sides, { week: 5, riders: false });
      const coins = (r.outcomes[0] as CombatOutcome).midasCoins ?? 0;
      const before = state.player.ludus.denarii;
      applyBattleResult({ state }, sides, r);
      expect(state.player.ludus.denarii).toBe(before + coins);
      if (coins > 0) paid = true;
    }
    expect(paid).toBe(true);
  });

  it('the Mysterious Egg grows in battle and hatches a wyvern', () => {
    setSeed(15);
    const { state, hero, sides } = setup({ heroItem: 'mysteriousEgg' });
    const egg = state.player.ludus.armory.find((g) => g.type === 'mysteriousEgg')!;
    const r = resolveBattle(sides, { week: 5, riders: false, sparring: true });
    let n = 0;
    while (state.player.ludus.armory.includes(egg) && n < 2000) {
      applyBattleResult({ state, sparring: true }, sides, r);
      n++;
    }
    expect(state.player.ludus.armory.includes(egg)).toBe(false);
    const wyv = state.player.ludus.creatures.find((c) => c.species === 'wyvern');
    expect(wyv).toBeDefined();
    expect(wyv!.techniques.map((t) => t.id)).toEqual(expect.arrayContaining(['Hurricane', 'Fireball', 'Bite']));
    expect(wyv!.traits).toContain('Mythical');
    expect(hero.traits).toContain('LifeBringer');
    expect(hero.gear.item).toBeUndefined();
    expect(state.player.messages.some((m) => m.text.includes('wyvern'))).toBe(true);
  });

  it('Dark Fangs feed on wounds and kills', () => {
    setSeed(16);
    const fangs = G('fangCaps', 5, { unique: 'darkFangs', state: 3 });
    const s = setup({ heroWeapon: fangs });
    const r = resolveBattle(s.sides, { week: 5, riders: false });
    expect((r.outcomes[0] as CombatOutcome).woundedHuman).toBe(true);
    r.outcomes[1].died = false;
    applyBattleResult({ state: s.state }, s.sides, r);
    expect(fangs.state).toBe(2);
    setSeed(17);
    const fangs2 = G('fangCaps', 5, { unique: 'darkFangs', state: 4 });
    const s2 = setup({ heroWeapon: fangs2 });
    const r2 = resolveBattle(s2.sides, { week: 5, riders: false, toTheDeath: true });
    applyBattleResult({ state: s2.state }, s2.sides, r2);
    expect(fangs2.state).toBe(0);
  });

  it('antivenom is consumed when it stops poison', () => {
    let done = false;
    for (let i = 0; i < 20 && !done; i++) {
      setSeed(800 + i);
      const state = makeState();
      const me = state.player.ludus;
      const rv = state.rivals[0];
      const hero = makeNamed('iguanodon', 'Hero', st(10, 10, 8, 80));
      const snake = makeNamed('velociraptor', 'Snake', st(8, 10, 4, 60), { traits: ['PoisonedClaws'] });
      me.creatures = [hero]; rv.creatures = [snake];
      const av = G('antivenom', 2); me.armory.push(av); hero.gear.item = av.id;
      const w = G('fangCaps', 2); rv.armory.push(w); snake.gear.weapon = w.id;
      const sides: [BattleSide, BattleSide] = [buildSide(state, me, [hero], 'default', { riders: false }), buildSide(state, rv, [snake], null, { riders: false })];
      const r = resolveBattle(sides, { week: 5, riders: false });
      if (!(r.outcomes[0] as CombatOutcome).antidoteUsed) continue;
      done = true;
      expect(r.log.some((l) => l.text.includes('antivenom'))).toBe(true);
      expect(r.log.some((l) => l.target === 0 && l.text.includes('Venom burns'))).toBe(false);
      applyBattleResult({ state }, sides, r);
      expect(me.armory.includes(av)).toBe(false);
      expect(hero.gear.item).toBeUndefined();
    }
    expect(done).toBe(true);
  });

  it('resolveBattle leaves creatures untouched until apply', () => {
    setSeed(18);
    const { hero, foe, sides } = setup();
    const snap = JSON.stringify([hero, foe]);
    resolveBattle(sides, { week: 5, riders: false });
    expect(JSON.stringify([hero, foe])).toBe(snap);
  });
});

void (null as unknown as BattleResult);
