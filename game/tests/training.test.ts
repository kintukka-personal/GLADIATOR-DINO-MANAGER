import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
vi.mock('../src/engine/horde', () => ({ joinHorde: vi.fn() }));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({
  buildSide: vi.fn((_s: any, _h: any, cs: any[], _i: any, o: any) => ({ name: o.name, fighters: cs.map((c) => ({ creature: c, gear: {}, instruction: null })), modifiers: [], injuryMod: o.injuryMod, influence: 0 })),
  resolveBattle: vi.fn(() => ({ winner: 0, decidedBy: 'ko', rounds: 3, log: [], fighters: [], outcomes: [] })),
  applyBattleResult: vi.fn(() => []),
}));

import * as combat from '../src/engine/combat';
import * as influence from '../src/engine/influence';
import {
  baseEffectiveness, chooseDoctore, doctoreBonus, projectedTrainingXp, rollInjury, spar, sparringSlots, trainingFamily,
  trainingWeek, trainingXpBase, weekPassed, injureWithPoultice,
} from '../src/engine/training';
import { getStat, xpForLevel, xpMultiplier } from '../src/engine/creature';
import { setSeed } from '../src/engine/rng';
import { makeGear } from '../src/engine/data/gear';
import { testState, dino, addTo } from './economy.fixture';

function doctore(level = 4) {
  const d = dino('iguanodon');
  d.genes.wild = { str: 6, agi: 3, cun: 3, hp: 3 }; // CUN 6, best stat STR
  d.level = level;
  d.xp = xpForLevel(level);
  return d;
}

beforeEach(() => {
  vi.mocked(influence.hasOpp).mockReturnValue(false);
});

describe('training XP (GM 03 §3.4 worked examples)', () => {
  it('no doctore: Standard 15, Intense 22, Light 11, Technique 7', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    s.player.heritage = 'greek';
    const xp: Record<string, number> = {};
    for (const t of ['standard', 'intense', 'light', 'technique'] as const) {
      h.training.type = t;
      xp[t] = trainingXpBase(s, h, c);
    }
    expect(xp).toEqual({ standard: 15, intense: 22, light: 11, technique: 7 });
  });
  it('level-4, CUN-6 doctore without the trait gives 28 (Intense 42)', () => {
    const s = testState();
    const h = s.player.ludus;
    const d = doctore();
    const [c] = addTo(h, d, dino());
    h.doctoreId = d.id;
    expect(getStat(d, 'cun')).toBe(6);
    expect(doctoreBonus(s, h)).toBe(17);
    expect(trainingXpBase(s, h, h.creatures[1])).toBe(28);
    h.training.type = 'intense';
    expect(trainingXpBase(s, h, h.creatures[1])).toBe(42);
    // the doctore trains as if there were no doctore
    expect(trainingXpBase(s, h, c)).toBe(22);
  });
  it('Lasher doctore adds 2×level; Doctore trait ×1.5; injured doctore counts as none', () => {
    const s = testState();
    const h = s.player.ludus;
    const d = doctore();
    const [, pupil] = addTo(h, d, dino());
    h.doctoreId = d.id;
    d.cls = 'lasher';
    expect(trainingXpBase(s, h, pupil)).toBe(10 + Math.floor(17 * 1.1 + 8));
    d.cls = null;
    d.traits.push('Doctore');
    expect(trainingXpBase(s, h, pupil)).toBe(10 + Math.floor(17 * 1.5 * 1.1));
    d.injury = { type: 'flesh', weeks: 2 };
    expect(doctoreBonus(s, h)).toBe(0);
    expect(trainingXpBase(s, h, pupil)).toBe(15);
  });
  it('Celtic heritage 12 base; Jupiter −3; Public Sessions −2; AI houses +3', () => {
    const s = testState();
    const h = s.player.ludus;
    s.player.heritage = 'celtic';
    expect(baseEffectiveness(s, h)).toBe(12);
    s.world.ascension = 9;
    expect(baseEffectiveness(s, h)).toBe(9);
    s.player.toggles.publicSessions = true;
    expect(baseEffectiveness(s, h)).toBe(7);
    expect(baseEffectiveness(s, s.rivals[0])).toBe(13);
  });
  it('facility bonus only within capacity; Quick Study and Velociraptor +25%', () => {
    const s = testState();
    const h = s.player.ludus;
    s.player.heritage = 'greek';
    h.buildings.trainingField = 1; // 25%
    const cs = addTo(h, dino(), dino(), dino(), dino(), dino(), dino(), dino());
    expect(trainingXpBase(s, h, cs[0])).toBe(15 + Math.floor(15 * 25 * 0.015));
    expect(trainingXpBase(s, h, cs[6])).toBe(15); // 7th creature, only 6 facilities
    cs[6].traits.push('QuickStudy');
    expect(trainingXpBase(s, h, cs[6])).toBe(20);
    const raptor = dino('velociraptor');
    addTo(h, raptor);
    expect(trainingXpBase(s, h, raptor)).toBe(20);
    h.buildings.trainingField = 3; // 75% → +1 +2
    const E = 15 + 3;
    expect(trainingXpBase(s, h, cs[0])).toBe(E + Math.floor(E * 75 * 0.015));
  });
  it('paid trainers add after the multiplier; Arrogant and injured halve', () => {
    const s = testState();
    const h = s.player.ludus;
    s.player.heritage = 'greek';
    const [c] = addTo(h, dino());
    h.training.paid = { bestiarii: true, spartan: true, weapons: false };
    expect(trainingXpBase(s, h, c)).toBe(15 + 5 + 10);
    h.training.paid = { bestiarii: false, spartan: false, weapons: false };
    c.traits.push('Arrogant');
    expect(trainingXpBase(s, h, c)).toBe(7);
    c.injury = { type: 'broken', weeks: 3 };
    expect(trainingXpBase(s, h, c)).toBe(3);
    expect(trainingXpBase(s, h, c, true)).toBe(3); // careful −1/8
  });
  it('projected XP uses the class multiplier and skips juveniles', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c, kid] = addTo(h, dino(), dino('iguanodon', { maturity: 0.3 }));
    expect(projectedTrainingXp(s, h, c)).toBe(15);
    expect(projectedTrainingXp(s, h, kid)).toBe(0);
    c.cls = 'brute'; // off-class iguanodon: low proficiency
    expect(projectedTrainingXp(s, h, c)).toBeLessThan(15);
  });
});

describe('doctore', () => {
  it('sparring slots by doctore level and cunning', () => {
    const s = testState();
    const h = s.player.ludus;
    const d = doctore(16);
    addTo(h, d);
    expect(sparringSlots(s, h)).toBe(1);
    h.doctoreId = d.id;
    d.genes.wild.cun = 30; // CUN 33
    expect(sparringSlots(s, h)).toBe(5);
    d.level = 9;
    expect(sparringSlots(s, h)).toBe(3);
  });
  it('AI prefers Lashers, then the highest level (+5 for crippled teachers); player choice is kept', () => {
    const s = testState();
    const r = s.rivals[0];
    const a = dino(); a.level = 6;
    const b = dino(); b.level = 3; b.traits.push('BumLeg');
    addTo(r, a, b);
    chooseDoctore(s, r);
    expect(r.doctoreId).toBe(b.id);
    const l = dino(); l.level = 1; l.cls = 'lasher';
    addTo(r, l);
    chooseDoctore(s, r);
    expect(r.doctoreId).toBe(l.id);
    const h = s.player.ludus;
    const p = dino();
    addTo(h, p);
    h.doctoreId = 'gone';
    chooseDoctore(s, h);
    expect(h.doctoreId).toBeUndefined();
    h.doctoreId = p.id;
    p.injury = { type: 'flesh', weeks: 2 };
    chooseDoctore(s, h);
    expect(h.doctoreId).toBe(p.id);
  });
});

describe('sparring', () => {
  it('uses combat with injuryMod −2 and gives each 5×(L1+L2) XP', () => {
    const s = testState();
    const h = s.player.ludus;
    const a = dino(); a.level = 2; a.xp = xpForLevel(2);
    const b = dino(); b.level = 3; b.xp = xpForLevel(3);
    addTo(h, a, b);
    const r = spar(s, h, a.id, b.id);
    expect(typeof r).toBe('object');
    expect(vi.mocked(combat.buildSide).mock.calls[0][4]).toMatchObject({ injuryMod: -2, riders: false });
    expect(vi.mocked(combat.resolveBattle).mock.calls[0][1]).toMatchObject({ sparring: true });
    expect(vi.mocked(combat.applyBattleResult).mock.calls[0][0]).toMatchObject({ sparring: true });
    expect(a.xp).toBe(xpForLevel(2) + 25);
    expect(b.xp).toBe(xpForLevel(3) + 25);
    expect(a.inactive && b.inactive).toBe(true);
    expect(spar(s, h, a.id, b.id)).toMatch(/busy|sessions/);
  });
  it('validates partners', () => {
    const s = testState();
    const h = s.player.ludus;
    const [a] = addTo(h, dino());
    expect(spar(s, h, a.id, a.id)).toMatch(/itself/);
    expect(spar(s, h, a.id, 'nope')).toMatch(/Both/);
  });
});

describe('weekly training', () => {
  it('trains adults, not juveniles, gives class XP and clears sparring', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c, kid] = addTo(h, dino(), dino('iguanodon', { maturity: 0.3 }));
    c.cls = 'bulwark';
    h.training.sparring.push({ a: c.id, b: kid.id });
    s.world.week = 2; // early protection: no training injuries for injury-prone 0
    trainingWeek(s, h);
    expect(c.xp).toBeGreaterThan(0);
    expect(kid.xp).toBe(0);
    expect(c.classXp).toBe(1);
    expect(h.training.sparring).toEqual([]);
  });
  it('class level-ups pay out GM rewards', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    c.cls = 'bulwark';
    c.classXp = 3; // next week: class level 1 → +1 STR (main stat)
    s.world.week = 2;
    const str = c.bonus.str;
    const mult = xpMultiplier(c);
    trainingWeek(s, h);
    expect(c.classXp).toBe(4);
    expect(c.bonus.str).toBe(str + 1);
    // training XP plus the class reward (2×1 > level 1 → +50 XP), both through grantXp's class multiplier
    expect(c.xp).toBe(Math.floor(15 * mult) + Math.floor(50 * xpMultiplier(c)));
  });
  it('proficiency drills the class family', () => {
    const s = testState(99);
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    c.cls = 'brute';
    expect(trainingFamily(h, c)).toBe('mace');
    c.cls = null;
    expect(trainingFamily(h, c)).toBe('jaw');
    h.armory.push(makeGear('hornLance', 2, 'g1'));
    expect(trainingFamily(h, c)).toBe('horn');
    c.prof.claw = 4;
    expect(trainingFamily(h, c)).toBe('claw');
    h.armory.push(makeGear('tailWhip', 1, 'g2'));
    c.gear.weapon = 'g2';
    expect(trainingFamily(h, c)).toBe('whip');
    h.training.paid.weapons = true;
    s.unlocks.push('weaponsMaster');
    s.world.week = 2;
    const before = c.prof.whip;
    trainingWeek(s, h);
    expect(c.prof.whip).toBeGreaterThanOrEqual(before + 3); // 2 + Iguanodon +1
  });
});

describe('injuries', () => {
  it('rollInjury: nothing at m ≤ 0, never death when disallowed', () => {
    setSeed(1);
    for (let i = 0; i < 200; i++) expect(rollInjury(0, false)).toBeNull();
    for (let i = 0; i < 200; i++) expect(rollInjury(10, false)).not.toBe('dead');
    let dead = 0;
    for (let i = 0; i < 200; i++) if (rollInjury(14, true) === 'dead') dead++;
    expect(dead).toBeGreaterThan(100);
  });
  it('a poultice downgrades a fresh injury and the next one is assigned', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    h.armory.push(makeGear('poultice', 2, 'p1'), makeGear('poultice', 2, 'p2'));
    c.gear.item = 'p1';
    expect(injureWithPoultice(s, h, c, { type: 'broken', weeks: 3 })).toBe('poultice');
    expect(c.injury).toBeNull();
    expect(h.armory.map((g) => g.id)).toEqual(['p2']);
    expect(c.gear.item).toBe('p2');
    expect(injureWithPoultice(s, h, c, { type: 'multiple', weeks: 5 })).toBe('poultice');
    expect(c.injury).toEqual({ type: 'severe', weeks: 3 });
    expect(injureWithPoultice(s, h, c, { type: 'flesh', weeks: 2 })).toBe('injured');
    expect(c.injury).toEqual({ type: 'multiple', weeks: 5 });
  });
});

describe('weekPassed', () => {
  it('heals injuries and illness; severe recovery can leave a wound', () => {
    const s = testState(3);
    const h = s.player.ludus;
    let wounds = 0;
    for (let i = 0; i < 40; i++) {
      const c = dino();
      addTo(h, c);
      c.injury = { type: 'severe', weeks: 1 };
      c.ill = 2;
      weekPassed(s, h, c);
      expect(c.injury).toBeNull();
      expect(c.ill).toBe(1);
      if (c.traits.some((t) => ['HorribleDisfigurement', 'PartiallyBlind', 'BumLeg', 'Crippled', 'MissingFingers', 'Concussion'].includes(t))) wounds++;
    }
    expect(wounds).toBeGreaterThan(8);
    expect(wounds).toBeLessThan(32);
  });
  it('species level 0 → 1 at level > 4 and fame > 800', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    c.level = 5;
    c.fame = 801;
    weekPassed(s, h, c);
    expect(c.speciesLevel).toBe(1);
  });
  it('a clever dino eventually gains a weekly trait (Greek heritage doubles the factor)', () => {
    const s = testState(11);
    const h = s.player.ludus;
    s.player.heritage = 'greek';
    const [c] = addTo(h, dino());
    c.genes.wild.cun = 20;
    for (let i = 0; i < 20; i++) weekPassed(s, h, c);
    expect(c.traits.length).toBeGreaterThan(0);
  });
});
