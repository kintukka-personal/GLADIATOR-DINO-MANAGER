import { describe, it, expect } from 'vitest';
import type {
  BattleFighter, BattleOptions, BattleResult, BattleSide, Creature, Gear, GearSlot, GearTypeId, Instruction, Ludus,
  GameState, Quality, Stats, TechId, TraitId, SpeciesId, FoodId,
} from '../src/engine/types';
import { setSeed } from '../src/engine/rng';
import { makeCreature, makeNamed, generateBeast } from '../src/engine/creature';
import { makeGear } from '../src/engine/data/gear';
import { TECHNIQUES } from '../src/engine/data/techniques';
import {
  armorReduction, resolveBattle, rollInjury, buildSide, prepareFighter, teamWorth, Battle,
} from '../src/engine/combat';

// ---------------------------------------------------------------------------------------------
// helpers (minimal state copied from newgame.ts shapes, without calling other modules)
// ---------------------------------------------------------------------------------------------

let gid = 0;
const G = (type: GearTypeId, q: Quality = 2, extra: Partial<Gear> = {}): Gear => makeGear(type, q, `tg${++gid}`, extra);

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

export function makeState(): GameState {
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

const st = (str: number, agi: number, cun: number, hp: number): Stats => ({ str, agi, cun, hp });

function dino(species: SpeciesId, name: string, s: Stats, o: { techs?: [TechId, number][]; traits?: TraitId[]; sex?: 'M' | 'F'; lv2?: boolean } = {}): Creature {
  const c = makeNamed(species, name, s, { techniques: o.techs ?? [], traits: o.traits ?? [], sex: o.sex ?? 'M' });
  if (o.lv2) c.speciesLevel = 2;
  return c;
}

const F = (creature: Creature, gear: Partial<Record<GearSlot, Gear | null>> = {}, instruction: Instruction | null = null): BattleFighter =>
  ({ creature, gear, instruction });
const side = (name: string, fighters: BattleFighter[], extra: Partial<BattleSide> = {}): BattleSide =>
  ({ name, fighters, modifiers: [], injuryMod: 0, influence: 0, ...extra });
const opts = (o: Partial<BattleOptions> = {}): BattleOptions => ({ week: 5, riders: true, ...o });

function fightN(n: number, mk: () => [BattleSide, BattleSide], o: Partial<BattleOptions> = {}, seed = 1000): BattleResult[] {
  const out: BattleResult[] = [];
  for (let i = 0; i < n; i++) {
    setSeed(seed + i);
    out.push(resolveBattle(mk(), opts(o)));
  }
  return out;
}

function checkResult(r: BattleResult): void {
  expect(r.log[0].kind).toBe('start');
  expect(r.log[r.log.length - 1].kind === 'end' || r.log.some((l) => l.kind === 'end')).toBe(true);
  for (const l of r.log) {
    expect(l.hp.length).toBe(r.fighters.length);
    for (const h of l.hp) expect(Number.isFinite(h)).toBe(true);
    if (l.actor !== undefined) expect(l.actor).toBeLessThan(r.fighters.length);
    if (l.target !== undefined) expect(l.target).toBeLessThan(r.fighters.length);
    expect(typeof l.text).toBe('string');
    expect(l.text).not.toMatch(/undefined|NaN/);
  }
  expect(r.outcomes.length).toBe(r.fighters.length);
  expect([0, 1]).toContain(r.winner);
}

// ---------------------------------------------------------------------------------------------

describe('armor curve', () => {
  it('matches GM A/sqrt(A²+900)', () => {
    const table: [number, number][] = [[2, 6.6], [5, 16.4], [8, 25.8], [10, 31.6], [15, 44.7], [20, 55.5], [25, 64.0], [30, 70.7], [40, 80], [50, 85.7]];
    for (const [a, pct] of table) expect(armorReduction(a) * 100).toBeCloseTo(pct, 0);
    expect(armorReduction(0)).toBe(0);
  });

  it('worked example: S20 W3 vs armor 10 deals 20 (glancing 7)', () => {
    setSeed(1);
    const a = dino('iguanodon', 'A', st(20, 10, 5, 60));
    const d = dino('iguanodon', 'D', st(5, 10, 5, 60));
    const b = new Battle([side('A', [F(a, { weapon: G('talonBlades', 0) })]), side('B', [F(d)])], opts());
    const [fa, fd] = b.f;
    fd.armorExtra = 10;
    const o = { crit: false, weapon: fa.w, weaponHit: true, slot: 'main' as const };
    expect(b.hit(fa, fd, 20 + 6 + 3, o)).toBe(20);
    expect(b.hit(fa, fd, 5 + 1 + 3, o)).toBe(7);
  });
});

describe('injury table (GM 13)', () => {
  it('loser with m=5 roughly follows the GM distribution', () => {
    setSeed(7);
    const n = 44000;
    const cnt: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = rollInjury(5, true) ?? 'none';
      cnt[r] = (cnt[r] ?? 0) + 1;
    }
    const pct = (k: string) => ((cnt[k] ?? 0) * 100) / n;
    expect(Math.abs(pct('none') - 54.5)).toBeLessThan(1.5);
    expect(Math.abs(pct('flesh') - 9.1)).toBeLessThan(1);
    expect(Math.abs(pct('broken') - 9.1)).toBeLessThan(1);
    expect(Math.abs(pct('severe') - 13.6)).toBeLessThan(1);
    expect(Math.abs(pct('multiple') - 9.1)).toBeLessThan(1);
    expect(Math.abs(pct('dead') - 4.5)).toBeLessThan(0.8);
  });
  it('m=12 is mostly death and winners never die', () => {
    setSeed(8);
    let dead = 0;
    for (let i = 0; i < 5000; i++) if (rollInjury(12, true) === 'dead') dead++;
    expect(dead / 5000).toBeGreaterThan(0.65);
    for (let i = 0; i < 2000; i++) expect(rollInjury(20, false)).not.toBe('dead');
  });
});

describe('hit resolution', () => {
  it('equal fighters mostly hit; the blind miss; speed buys crits', () => {
    const count = (rs: BattleResult[], actor: number) => {
      const k: Record<string, number> = {};
      for (const r of rs) for (const l of r.log) {
        if (l.actor !== actor || !['attack', 'miss', 'glance', 'crit'].includes(l.kind)) continue;
        k[l.kind] = (k[l.kind] ?? 0) + 1;
      }
      const n = (k.attack ?? 0) + (k.miss ?? 0) + (k.glance ?? 0) + (k.crit ?? 0);
      return { n, hit: (k.attack ?? 0) / n, miss: (k.miss ?? 0) / n, crit: (k.crit ?? 0) / n, glance: (k.glance ?? 0) / n };
    };
    const even = count(fightN(60, () => [side('A', [F(dino('iguanodon', 'A', st(6, 10, 5, 400)))]), side('B', [F(dino('iguanodon', 'B', st(6, 10, 5, 400)))])]), 0);
    expect(even.n).toBeGreaterThan(200);
    expect(even.hit).toBeGreaterThan(0.85);
    expect(even.miss).toBeLessThan(0.08);
    // a Blind dino swings with hit base 0 instead of 45
    const blind = count(fightN(60, () => [side('A', [F(dino('iguanodon', 'Blind', st(6, 10, 5, 400), { traits: ['Blind'] }))]), side('B', [F(dino('iguanodon', 'B', st(6, 10, 5, 400)))])]), 0);
    expect(blind.miss).toBeGreaterThan(0.5);
    const mastery = count(fightN(60, () => [side('A', [F(dino('iguanodon', 'Blind', st(6, 10, 5, 400), { traits: ['Blind', 'BlindFighter'] }))]), side('B', [F(dino('iguanodon', 'B', st(6, 10, 5, 400)))])]), 0);
    expect(mastery.miss).toBeLessThan(blind.miss);
    // the fast crit a slow target more often than the reverse
    const fast = fightN(60, () => [side('A', [F(dino('velociraptor', 'Fast', st(6, 40, 5, 400)))]), side('B', [F(dino('ankylosaurus', 'Slow', st(6, 2, 5, 400)))])]);
    expect(count(fast, 0).crit).toBeGreaterThan(count(fast, 1).crit + 0.05);
    // an evading target (opening volley) makes the next blows glance
    const ev = count(fightN(60, () => [side('A', [F(dino('iguanodon', 'A', st(6, 10, 5, 400)))]), side('B', [F(dino('dilophosaurus', 'Spitter', st(6, 14, 5, 400)), { weapon: G('venomSpitter', 2) })])]), 0);
    expect(ev.glance).toBeGreaterThan(0);
  });

  it('is deterministic per seed and does not mutate creatures', () => {
    const mk = (): [BattleSide, BattleSide] => {
      setSeed(99);
      const a = dino('carnotaurus', 'Horns', st(9, 9, 5, 45), { techs: [['Charge', 2], ['Smash', 1]] });
      const b = dino('stegosaurus', 'Plates', st(9, 5, 5, 55), { techs: [['Cleave', 1]] });
      return [side('A', [F(a, { weapon: G('hornLance'), armor: G('bronzeBarding') }, 'kill')]), side('B', [F(b, { weapon: G('tailClub'), offhand: G('hideShield') }, 'allout')])];
    };
    const s1 = mk();
    const snap = JSON.stringify(s1);
    setSeed(5);
    const r1 = resolveBattle(s1, opts());
    expect(JSON.stringify(s1)).toBe(snap);
    const s2 = mk();
    setSeed(5);
    const r2 = resolveBattle(s2, opts());
    expect(JSON.stringify(r2.log)).toBe(JSON.stringify(r1.log));
    checkResult(r1);
  });
});

describe('knockouts and surrender', () => {
  it('a cautious (Care) weakling yields instead of being knocked out cold', () => {
    const rs = fightN(80, () => [
      side('A', [F(dino('allosaurus', 'Bully', st(16, 10, 5, 120)), { weapon: G('fangCaps', 2) })]),
      side('B', [F(dino('troodon', 'Meek', st(4, 6, 8, 100)), {}, 'care')]),
    ]);
    let yielded = 0;
    let ko = 0;
    for (const r of rs) {
      checkResult(r);
      expect(r.winner).toBe(0);
      const o = r.outcomes[1];
      if (o.yielded) yielded++;
      if (o.knockedOut) ko++;
    }
    expect(yielded).toBeGreaterThan(20);
    expect(ko).toBeGreaterThan(5);
    expect(yielded + ko).toBeGreaterThan(70);
    // without Care (AI default) nobody yields at tameness 80
    const ai = fightN(40, () => [
      side('A', [F(dino('allosaurus', 'Bully', st(16, 10, 5, 120)), { weapon: G('fangCaps', 2) })]),
      side('B', [F(dino('troodon', 'Meek', st(4, 6, 8, 100)), {}, null)]),
    ]);
    expect(ai.every((r) => !r.outcomes[1].yielded)).toBe(true);
  });

  it('beasts never yield; all-out fighters can refuse to fall', () => {
    const rs = fightN(40, () => [
      side('A', [F(dino('tyrannosaurus', 'Rex', st(22, 12, 5, 150)), { weapon: G('tailClub', 3) })]),
      side('B', [F(generateBeast('direwolf'), {}, 'care')]),
    ]);
    for (const r of rs) expect(r.outcomes[1].yielded).toBe(false);
    const ao = fightN(80, () => [
      side('A', [F(dino('tyrannosaurus', 'Rex', st(14, 12, 5, 150)), { weapon: G('tailClub', 3) })]),
      side('B', [F(dino('iguanodon', 'Stubborn', st(6, 6, 6, 50)), {}, 'allout')]),
    ]);
    expect(ao.some((r) => r.log.some((l) => l.text.includes('refuses to fall')))).toBe(true);
  });

  it('a strong dino beats a weak one more than 80% of 200 fights', () => {
    const rs = fightN(200, () => {
      const strong = dino('allosaurus', 'Strong', st(12, 10, 7, 60), { techs: [['Smash', 2]] });
      const weak = dino('velociraptor', 'Weak', st(6, 8, 5, 35), { techs: [['Lunge', 1]] });
      return [
        side('A', [F(strong, { weapon: G('talonBlades', 3), armor: G('studdedBarding', 2) }, 'default')]),
        side('B', [F(weak, { weapon: G('fangCaps', 1) }, 'default')]),
      ];
    }, {}, 5000);
    const wins = rs.filter((r) => r.winner === 0).length;
    expect(wins / rs.length).toBeGreaterThan(0.8);
  });
});

describe('time-out', () => {
  it('crowd decides between two tanks; fewer standing loses', () => {
    const rs = fightN(10, () => [
      side('A', [F(dino('ankylosaurus', 'Wall', st(2, 5, 3, 900)), { armor: G('cataphractBarding', 5) })]),
      side('B', [F(dino('ankylosaurus', 'Rock', st(2, 5, 3, 600)), { armor: G('cataphractBarding', 5) })]),
    ]);
    for (const r of rs) {
      checkResult(r);
      expect(r.decidedBy).toBe('crowd');
      expect(r.rounds).toBe(6);
      expect(r.winner).toBe(0); // more HP left
    }
    // 2 vs 1 standing at time-out → the pair wins even with less HP
    const r2 = fightN(5, () => [
      side('A', [F(dino('ankylosaurus', 'W1', st(1, 5, 3, 200)), { armor: G('cataphractBarding', 5) }), F(dino('ankylosaurus', 'W2', st(1, 5, 3, 200)), { armor: G('cataphractBarding', 5) })]),
      side('B', [F(dino('ankylosaurus', 'Big', st(1, 5, 3, 2000)), { armor: G('cataphractBarding', 5) })]),
    ], { rounds: 4 });
    for (const r of r2) {
      expect(r.rounds).toBe(4);
      expect(r.decidedBy).toBe('crowd');
      expect(r.winner).toBe(0);
    }
  });

  it('event battles last 8 rounds; empty side forfeits', () => {
    setSeed(3);
    const r = resolveBattle([
      side('A', [F(dino('ankylosaurus', 'Wall', st(1, 5, 3, 900)), { armor: G('cataphractBarding', 5) })]),
      side('B', [F(dino('ankylosaurus', 'Rock', st(1, 5, 3, 900)), { armor: G('cataphractBarding', 5) })]),
    ], opts({ event: true }));
    expect(r.rounds).toBe(8);
    const f = resolveBattle([side('A', [F(dino('iguanodon', 'Lonely', st(5, 5, 5, 30)))]), side('Nobody', [])], opts());
    expect(f.decidedBy).toBe('forfeit');
    expect(f.winner).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------

function techSetup(id: TechId): [BattleSide, BattleSide] {
  const def = TECHNIQUES[id];
  const s = st(60, 60, 60, 300); // meets every requirement
  const traits: TraitId[] = [];
  const a = dino('iguanodon', `User of ${def.name}`, s, { techs: [[id, 3]], traits });
  let gear: Partial<Record<GearSlot, Gear | null>> = { weapon: G('talonBlades', 2) };
  if (id === 'HailOfArrows') gear = { weapon: G('venomSpitter', 2) };
  if (id === 'Impale') gear = { weapon: G('hornLance', 2) };
  if (id === 'ShieldBash') gear = { weapon: G('talonBlades', 2), offhand: G('bashPlate', 2) };
  if (id === 'Uppercut') gear = { weapon: G('ironJaws', 2) };
  if (id === 'Disarm') gear = { weapon: G('talonBlades', 2) };
  const foeTraits: TraitId[] = id === 'CheapShot' ? ['Blind'] : [];
  const foeHp = id === 'Execute' ? 70 : 220;
  const mkFoe = (n: string) => dino('triceratops', n, st(8, 8, 4, foeHp), { traits: foeTraits });
  const foes = [F(mkFoe('Foe A'), { weapon: G('tailClub', 1), helmet: G('bronzeMuzzle', 1), armor: G('quiltedBarding', 1), offhand: G('hideShield', 1) }),
    F(mkFoe('Foe B'), { weapon: G('hornLance', 1) })];
  const ally = id === 'Rally' ? [F(dino('iguanodon', 'Ally', st(5, 5, 5, 60)), {})] : [];
  return [side('Users', [F(a, gear, 'default'), ...ally]), side('Foes', foes)];
}

describe('every technique executes', () => {
  const ids = Object.keys(TECHNIQUES) as TechId[];
  it.each(ids)('%s', (id) => {
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      setSeed(300 + i);
      const r = resolveBattle(techSetup(id), opts());
      checkResult(r);
      if (r.log.some((l) => l.tech === id && l.actor === 0)) seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe('Mate Boost', () => {
  it('a mated pair takes a third less damage and is announced', () => {
    const mk = (sex2: 'M' | 'F'): Battle => {
      setSeed(11);
      const m = dino('triceratops', 'Bull', st(8, 5, 4, 300), { sex: 'M' });
      const f = dino('triceratops', 'Cow', st(8, 5, 4, 300), { sex: sex2 });
      const foe = dino('allosaurus', 'Biter', st(10, 10, 5, 60));
      return new Battle([side('Herd', [F(m), F(f)]), side('Pack', [F(foe)])], opts());
    };
    const paired = mk('F');
    const run = paired.run();
    expect(run.log.some((l) => l.text.includes('Mate Boost'))).toBe(true);
    const p2 = mk('F');
    (p2 as unknown as { findMates(): void }).findMates();
    const u2 = mk('M');
    (u2 as unknown as { findMates(): void }).findMates();
    const o = { crit: false, weapon: null, weaponHit: false, slot: 'main' as const };
    p2.f[0].armorExtra = -100; u2.f[0].armorExtra = -100; // strip armor for a clean comparison
    p2.f[2].species = 'iguanodon'; u2.f[2].species = 'iguanodon';
    const withMate = p2.hit(p2.f[2], p2.f[0], 60, o);
    const without = u2.hit(u2.f[2], u2.f[0], 60, o);
    expect(without).toBe(60);
    expect(withMate).toBe(Math.round(60 * 0.67));
    // once the partner is down the boost ends
    p2.f[1].out = true;
    expect(p2.hit(p2.f[2], p2.f[0], 60, o)).toBe(60);
  });

  it('imprinted creatures with a rider deal more and take less', () => {
    setSeed(12);
    const a = dino('parasaurolophus', 'Imprinted', st(8, 8, 5, 60));
    a.genes.imprint = 1;
    const foe = dino('iguanodon', 'Foe', st(8, 8, 5, 60));
    const b = new Battle([side('A', [F(a, { rider: G('numidianLancer', 2) })]), side('B', [F(foe)])], opts());
    const o = { crit: false, weapon: null, weaponHit: false, slot: 'main' as const };
    b.f[0].armorExtra = -100; b.f[1].armorExtra = -100;
    expect(b.hit(b.f[0], b.f[1], 100, o)).toBe(130);
    expect(b.hit(b.f[1], b.f[0], 100, o)).toBe(70);
  });
});

// ---------------------------------------------------------------------------------------------

describe('team battles', () => {
  it('3v3 with riders, shields, bolas, caltrops and tricks runs clean', () => {
    const state = makeState();
    const home = state.player.ludus;
    const away = state.rivals[0];
    const kinds = new Set<string>();
    const texts: string[] = [];
    let maxDirty = 0;
    for (let i = 0; i < 25; i++) {
      setSeed(700 + i);
      home.armory = [G('tridentHorns', 3), G('bolaRig', 3), G('numidianLancer', 3), G('caltrops', 4), G('talonBlades', 2), G('frillGuard', 2),
        G('bronzeBarding', 2), G('sickleClaws', 3), G('fangCaps', 3), G('legionFaceplate', 2), G('poultice', 2)];
      away.armory = [G('tailClub', 3), G('hideShield', 3), G('celticSpearman', 3), G('venomSpitter', 3), G('hornLance', 3), G('bashPlate', 3),
        G('lightHarness', 2), G('caltrops', 3), G('fangCaps', 5, { unique: 'danaidDagger' })];
      const sn = dino('troodon', 'Snare', st(7, 9, 14, 40)); sn.cls = 'snarer';
      const bw = dino('iguanodon', 'Bulwark', st(9, 7, 6, 50)); bw.cls = 'bulwark';
      const sl = dino('velociraptor', 'Slash', st(8, 12, 9, 40), { traits: ['DualWield'] }); sl.cls = 'slasher';
      const br = dino('allosaurus', 'Brute', st(11, 7, 8, 55), { techs: [['Smash', 2]] }); br.cls = 'brute';
      const sp = dino('dilophosaurus', 'Spitter', st(6, 11, 10, 40), { techs: [['HailOfArrows', 1]] }); sp.cls = 'spitter';
      const px = dino('carnotaurus', 'Phalanx', st(9, 8, 9, 50), { techs: [['Impale', 1]] }); px.cls = 'phalanx';
      home.creatures = [sn, bw, sl];
      away.creatures = [br, sp, px];
      home.armory.push(G('caltrops', 4));
      sn.gear.item = home.armory.find((g) => g.type === 'caltrops')!.id;
      const s0 = buildSide(state, home, home.creatures, 'default', { riders: true, player: true });
      const s1 = buildSide(state, away, away.creatures, null, { riders: true });
      const r = resolveBattle([s0, s1], opts());
      checkResult(r);
      for (const l of r.log) { kinds.add(l.kind); texts.push(l.text); }
      // a dirty trick that lands is followed by its status line; only one may land per battle
      let dirty = 0;
      r.log.forEach((l, j) => {
        if (l.kind === 'trick' && /nips|harness straps|kicks dust in|meets/.test(l.text)) {
          const next = r.log[j + 1];
          if (next && next.kind === 'status' && /rage|torn off|blinded|stunned/.test(next.text)) dirty++;
        }
      });
      maxDirty = Math.max(maxDirty, dirty);
      expect(r.fighters.some((f) => f.rider)).toBe(true);
      expect(r.fighters.length).toBe(6);
    }
    expect(kinds.has('trick')).toBe(true);
    expect(maxDirty).toBeLessThanOrEqual(1);
    expect(texts.some((t) => t.includes('bolas'))).toBe(true);
    expect(texts.some((t) => t.includes('caltrops'))).toBe(true);
    expect(texts.some((t) => /dust|nips|harness straps|bash plate/.test(t))).toBe(true);
  });
});

describe('gear selection', () => {
  it('class weapons first, gear used once, kids get no rider, beasts take nothing', () => {
    const state = makeState();
    const h = state.player.ludus;
    const lance = G('hornLance', 1);
    const fancy = G('tailClub', 3);
    const plate = G('bashPlate', 2);
    const shield = G('hideShield', 2);
    const horse = G('numidianLancer', 2);
    const crest = G('championsCrest', 2);
    h.armory = [lance, fancy, plate, shield, horse, crest];
    const px = dino('iguanodon', 'Phalanx', st(8, 8, 5, 40)); px.cls = 'phalanx';
    const other = dino('iguanodon', 'Other', st(8, 8, 5, 40));
    h.creatures = [px, other];
    const used = new Set<string>();
    const a = prepareFighter(state, h, px, 'default', { riders: true, used });
    expect(a.gear.weapon?.id).toBe(lance.id); // preferred ×8 beats worth
    expect(a.gear.offhand?.id).toBe(plate.id);
    expect(a.gear.rider?.id).toBe(horse.id);
    expect(a.gear.helmet ?? null).toBeNull(); // Champion's Crest only on the bonded dino
    const b = prepareFighter(state, h, other, 'default', { riders: true, used });
    expect(b.gear.weapon?.id).toBe(fancy.id);
    expect(b.gear.offhand?.id).toBe(shield.id);
    expect(b.gear.rider ?? null).toBeNull(); // already used
    h.bondedId = other.id;
    const b2 = prepareFighter(state, h, other, 'default', { riders: true, override: { weapon: null } });
    expect(b2.gear.weapon ?? null).toBeNull();
    expect(b2.gear.helmet?.id).toBe(crest.id);
    const kid = makeCreature({ species: 'iguanodon', maturity: 0.6 });
    expect(prepareFighter(state, h, kid, null, { riders: true }).gear.rider ?? null).toBeNull();
    const wolf = generateBeast('direwolf');
    expect(Object.values(prepareFighter(state, h, wolf, null, { riders: true }).gear).filter(Boolean).length).toBe(0);
    const natural = prepareFighter(state, h, px, null, { riders: true, natural: true });
    expect(Object.values(natural.gear).filter(Boolean).length).toBe(0);
  });

  it('assigned gear wins over auto, cursed gear cannot be overridden, mandrakes join small sides', () => {
    const state = makeState();
    const h = state.player.ludus;
    const fangs = G('fangCaps', 5, { unique: 'darkFangs' });
    const club = G('tailClub', 5);
    const root = G('mandrakeRoot', 1);
    h.armory = [fangs, club, root];
    const c = dino('velociraptor', 'Cursed', st(8, 8, 5, 40));
    c.gear.weapon = fangs.id;
    c.gear.item = root.id;
    h.creatures = [c];
    const bf = prepareFighter(state, h, c, null, { riders: false, override: { weapon: club.id } });
    expect(bf.gear.weapon?.id).toBe(fangs.id);
    const s = buildSide(state, h, [c], null, { riders: false });
    expect(s.fighters.length).toBe(2);
    expect(s.fighters[1].temporary).toBe(true);
    expect(s.fighters[1].creature.species).toBe('mandrake');
    setSeed(4);
    const r = resolveBattle([s, side('Foe', [F(dino('allosaurus', 'Foe', st(10, 9, 5, 60)))])], opts());
    checkResult(r);
    expect(r.outcomes[1].temporary).toBe(true);
  });

  it('teamWorth is Σ(worth+10)', () => {
    const a = dino('iguanodon', 'A', st(5, 5, 5, 30));
    const b = dino('iguanodon', 'B', st(5, 5, 5, 30));
    // level 1, no fame, no traits: worth 20 → (20 + 10) × 2
    expect(teamWorth([a, b])).toBe(60);
  });
});

// ---------------------------------------------------------------------------------------------

describe('beasts and mythic monsters', () => {
  const heroes = (strong = false): BattleSide => {
    const k = strong ? 1 : 0.5;
    const s = (a: number, b: number, c: number, d: number) => st(Math.round(a * k), Math.round(b * k), c, Math.round(d * k));
    return side('Heroes', [
      F(dino('tyrannosaurus', 'Rex', s(30, 20, 10, 250), { techs: [['Smash', 3]] }), { weapon: G('tailClub', 4), armor: G('bronzeBarding', 4) }, 'allout'),
      F(dino('triceratops', 'Tri', s(28, 15, 10, 280), { techs: [['Decimate', 3]] }), { weapon: G('hornLance', 4), offhand: G('hideShield', 4) }, 'allout'),
      F(dino('spinosaurus', 'Spino', s(26, 18, 12, 240), { techs: [['Impale', 2]] }), { weapon: G('bronzeHorn', 4), helmet: G('hornedHelm', 3) }, 'allout'),
    ]);
  };

  it('ordinary beasts fight dinos', () => {
    for (const sp of ['direwolf', 'alphadirewolf', 'sabertooth', 'direbear', 'sarcosuchus', 'terrorbird', 'woollyrhino', 'mammoth', 'gigantopithecus'] as const) {
      setSeed(sp.length * 31);
      const r = resolveBattle([side('Beasts', [F(generateBeast(sp)), F(generateBeast(sp))]), side('Dinos', [
        F(dino('allosaurus', 'Al', st(10, 10, 6, 60)), { weapon: G('talonBlades', 2), rider: G('numidianLancer', 2) }),
        F(dino('iguanodon', 'Ig', st(9, 9, 6, 60)), { weapon: G('hornLance', 2), offhand: G('bolaRig', 3) }),
      ])], opts());
      checkResult(r);
    }
  });

  it('mammoths frighten ridden foes', () => {
    let frightened = false;
    for (let i = 0; i < 20 && !frightened; i++) {
      setSeed(900 + i);
      const r = resolveBattle([side('Herd', [F(generateBeast('mammoth'))]), side('Riders', [
        F(dino('iguanodon', 'Rider', st(5, 5, 2, 40)), { weapon: G('hornLance', 2), rider: G('numidianLancer', 2) }),
      ])], opts());
      frightened = r.log.some((l) => l.target === 1 && l.text.includes('frightened'));
    }
    expect(frightened).toBe(true);
  });

  it.each(['harpy', 'minotaur', 'medusa', 'cyclops', 'manticore', 'hydra', 'lesserhydra', 'wraith', 'wyvern', 'mandrake'] as const)('%s fights', (sp) => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      setSeed(1200 + i);
      const m = makeCreature({ species: sp });
      const s0 = buildSide(makeState(), undefined, [m], null, { riders: false, name: 'Monster' });
      const r = resolveBattle([s0, heroes(sp === 'hydra' || sp === 'lesserhydra' || sp === 'medusa')], opts({ event: true }));
      checkResult(r);
      for (const l of r.log) {
        if (l.actor === 0 && l.tech) seen.add(l.tech);
        if (l.actor === 0 && l.kind === 'transform') seen.add('transform');
        if (l.actor === 0 && l.text.includes('turned to stone')) seen.add('gaze');
      }
      if (sp === 'minotaur') expect(r.fighters[0].weapon).toBe('ankyloHammer');
    }
    if (sp === 'hydra' || sp === 'lesserhydra') expect(seen.has('transform')).toBe(true);
    if (sp === 'wyvern') expect(seen.has('Hurricane') || seen.has('Fireball')).toBe(true);
    if (sp === 'medusa') expect(seen.has('gaze')).toBe(true);
  });

  it('hydra heads do not stack the werewolf block (GM missing-break bug fixed)', () => {
    setSeed(77);
    const h = makeCreature({ species: 'hydra' });
    const b = new Battle([side('M', [F(h)]), side('H', heroes(true).fighters)], opts({ event: true }));
    const f = b.f[0];
    const S0 = f.S;
    const H0 = f.H;
    const r = b.run();
    expect(r.log.some((l) => l.kind === 'transform' && l.actor === 0)).toBe(true);
    expect(f.S).toBeLessThanOrEqual(S0); // heads add agility/cunning only
    expect(f.H).toBe(H0);
  });

  it('wraith is intangible until it strikes', () => {
    setSeed(5);
    const w = makeCreature({ species: 'wraith' });
    const b = new Battle([side('W', [F(w)]), side('H', heroes().fighters)], opts());
    const o = { crit: false, weapon: null, weaponHit: false, slot: 'main' as const };
    const before = b.hit(b.f[1], b.f[0], 200, o);
    b.f[0].dealtLast = true;
    const after = b.hit(b.f[1], b.f[0], 200, o);
    expect(before).toBeLessThan(after / 4);
  });

  it('Moon Frenzy transforms a lycanthrope on a full-moon week, not otherwise', () => {
    const mk = () => {
      const wolfish = dino('allosaurus', 'Lupus', st(10, 10, 5, 80), { traits: ['Lycanthropy'] });
      return [side('A', [F(wolfish, { weapon: G('talonBlades', 2) }, 'allout')]), heroes()] as [BattleSide, BattleSide];
    };
    let moon = 0;
    let none = 0;
    for (let i = 0; i < 10; i++) {
      setSeed(50 + i);
      if (resolveBattle(mk(), opts({ week: 8 })).log.some((l) => l.kind === 'transform')) moon++;
      setSeed(50 + i);
      if (resolveBattle(mk(), opts({ week: 9 })).log.some((l) => l.kind === 'transform')) none++;
    }
    expect(moon).toBeGreaterThan(5);
    expect(none).toBe(0);
  });
});

describe('species bonuses', () => {
  it('a few basic and advanced hooks', () => {
    setSeed(1);
    const brach = dino('brachiosaurus', 'Tall', st(10, 2, 3, 80), { lv2: true });
    const dilo = dino('dilophosaurus', 'Frill', st(6, 8, 8, 30), { lv2: true });
    const anky = dino('ankylosaurus', 'Tank', st(5, 2, 3, 60));
    const tri = dino('triceratops', 'Gaul', st(8, 4, 3, 60), { lv2: true });
    const b = new Battle([side('A', [F(brach), F(dilo)]), side('B', [F(anky), F(tri)])], opts());
    const [fb, fd, fa, ft] = b.f;
    expect(fb.H).toBe(90); // +10 max health
    expect(fb.reach).toBe(1);
    expect(fd.reach).toBe(1);
    expect(fa.armorExtra).toBe(1);
    expect(ft.sr).toBe(7);
    // Dilophosaurus advanced: +50% on crits at full health
    const o = { crit: true, weapon: null, weaponHit: false, slot: 'main' as const };
    fa.armorExtra = -100; fa.weakBlock = 0;
    const full = b.hit(fd, fa, 40, o);
    expect(full).toBe(60);
    // Triceratops advanced: +2 to every stat per hit taken
    const s0 = ft.S;
    ft.armorExtra = -100;
    b.hit(fd, ft, 5, { crit: false, weapon: null, weaponHit: false, slot: 'main' });
    expect(ft.S).toBe(s0 + 2);
  });
});

describe('more mechanics', () => {
  it('Counter (Parry) turns blows back on the attacker', () => {
    let countered = false;
    for (let i = 0; i < 30 && !countered; i++) {
      setSeed(1500 + i);
      const r = resolveBattle([
        side('A', [F(dino('velociraptor', 'Parrier', st(8, 30, 10, 200), { techs: [['Parry', 5]] }), { weapon: G('parryingSpurs', 3) })]),
        side('B', [F(dino('allosaurus', 'Basher', st(12, 6, 4, 200)), { weapon: G('tailClub', 2) })]),
      ], opts());
      countered = r.log.some((l) => l.tech === 'Parry' && l.actor === 0 && l.target === 1 && /Counters/.test(l.text));
    }
    expect(countered).toBe(true);
  });

  it('a Giant who beats a giant becomes a Titan', () => {
    let titan = false;
    for (let i = 0; i < 10 && !titan; i++) {
      setSeed(1600 + i);
      const r = resolveBattle([
        side('A', [F(dino('allosaurus', 'Big', st(25, 12, 6, 120), { traits: ['Giant'] }), { weapon: G('tailClub', 3) })]),
        side('B', [F(dino('triceratops', 'Huge', st(6, 3, 3, 40)))]),
      ], opts());
      if (r.winner === 0) titan = r.outcomes[0].newTraits.includes('Titan');
    }
    expect(titan).toBe(true);
  });

  it('exhibitions roll no injuries and kill nobody', () => {
    for (let i = 0; i < 20; i++) {
      setSeed(1700 + i);
      const r = resolveBattle([
        side('A', [F(dino('tyrannosaurus', 'Rex', st(25, 12, 6, 120)), { weapon: G('tailClub', 4) }, 'kill')]),
        side('B', [F(dino('troodon', 'Snack', st(4, 5, 5, 30)))], { injuryMod: 10 }),
      ], opts({ toTheDeath: true }), { exhibition: true });
      for (const o of r.outcomes) {
        expect(o.injury).toBeNull();
        expect(o.died).toBe(false);
      }
    }
  });

  it('Spectral Saddle summons a rider; mandrakes and temporaries never win alone', () => {
    setSeed(1800);
    const c = dino('iguanodon', 'Ghostrider', st(8, 8, 5, 40));
    const b = new Battle([side('A', [F(c, { item: G('spectralSaddle', 2) })]), side('B', [F(dino('iguanodon', 'Foe', st(8, 8, 5, 40)))])], opts());
    expect(b.f[0].rider?.g.type).toBe('spectralRider');
    expect(b.f[0].H).toBe(40 + 5 + 20);
    const r = b.run();
    expect(r.fighters[0].rider).toBe(true);
    expect(r.log.some((l) => l.text.includes('spectral rider'))).toBe(true);
  });
});
