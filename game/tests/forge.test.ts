import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
vi.mock('../src/engine/horde', () => ({ joinHorde: vi.fn() }));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({ buildSide: vi.fn(), resolveBattle: vi.fn(), applyBattleResult: vi.fn() }));

import { forgeCatalog, forgeCost, forgeItem, reforge, reforgeCost, repair, repairCost } from '../src/engine/forge';
import { makeGear, gearWorth } from '../src/engine/data/gear';
import type { Gear } from '../src/engine/types';
import { testState } from './economy.fixture';

describe('forge costs (GM 02 §7.1 tables)', () => {
  it('weapons', () => {
    expect([1, 2, 3].map((L) => forgeCost('talonBlades', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([168, 292, 390]);
    expect([1, 2, 3].map((L) => forgeCost('fangCaps', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([56, 97, 150]);
    expect([1, 2, 3].map((L) => forgeCost('hookClaws', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([281, 487, 650]);
    expect([1, 2, 3].map((L) => forgeCost('greatTalons', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([337, 585, 780]);
  });
  it('equipment', () => {
    expect([1, 2, 3].map((L) => forgeCost('lightHarness', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([225, 390, 650]);
    expect([1, 2, 3].map((L) => forgeCost('bronzeBarding', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([562, 975, 1625]);
    expect([1, 2, 3].map((L) => forgeCost('cataphractBarding', L === 1 ? 2 : L === 2 ? 3 : 4, L))).toEqual([787, 1365, 2275]);
  });
  it('workshop items are doubled', () => {
    expect([forgeCost('poultice', 2, 1), forgeCost('poultice', 2, 2)]).toEqual([224, 194]);
    expect([forgeCost('neptuneCharm', 2, 1), forgeCost('neptuneCharm', 2, 2)]).toEqual([336, 292]);
    expect([forgeCost('eagleEyeCharm', 2, 1), forgeCost('eagleEyeCharm', 2, 2)]).toEqual([674, 584]);
    expect([forgeCost('legPlates', 4, 1), forgeCost('legPlates', 4, 3)]).toEqual([750, 650]);
    expect([forgeCost('bottledLightning', 4, 1), forgeCost('bottledLightning', 4, 2)]).toEqual([750, 650]);
  });
});

describe('catalogue', () => {
  it('locks without a forge, workshop or upgrades', () => {
    const s = testState();
    const h = s.player.ludus;
    let cat = forgeCatalog(s);
    expect(cat.find((o) => o.type === 'talonBlades')?.reason).toMatch(/Forge/);
    expect(cat.find((o) => o.type === 'poultice')?.reason).toMatch(/Workshop/);
    expect(cat.find((o) => o.type === 'legPlates')?.reason).toMatch(/Amber/);
    expect(cat.find((o) => o.type === 'mutagen')?.reason).toMatch(/Amber/);
    expect(cat.some((o) => o.type === 'spineDarts')).toBe(false); // not forgeable (GM)
    h.buildings.forge = 1;
    h.buildings.workshop = 1;
    cat = forgeCatalog(s);
    expect(cat.find((o) => o.type === 'talonBlades')).toMatchObject({ locked: false, quality: 2, cost: 168 });
    expect(cat.find((o) => o.type === 'sickleClaws')?.locked).toBe(true); // upgrade + forge 2
    expect(cat.find((o) => o.type === 'bolaRig')?.locked).toBe(false);
    expect(cat.find((o) => o.type === 'poultice')?.locked).toBe(false);
    s.unlocks.push('spartanDynasty');
    expect(forgeCatalog(s).find((o) => o.type === 'legPlates')?.reason).toMatch(/Forge level 3/);
  });
});

describe('forging', () => {
  it('rolls the GM outcome band, charges and grants Apprentice', () => {
    const s = testState(42);
    const h = s.player.ludus;
    h.buildings.forge = 1;
    h.denarii = 100000;
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const g = forgeItem(s, 'talonBlades') as Gear;
      expect(typeof g).toBe('object');
      seen.add(g.quality);
      expect(g.augment).toBeUndefined();
    }
    expect([...seen].every((q) => q === 0 || q === 2 || q === 3)).toBe(true);
    expect(seen.has(2)).toBe(true);
    expect(h.denarii).toBe(100000 - 60 * 168);
    expect(h.armory.length).toBe(60);
    expect(s.pendingAchievements).toContain('apprentice');
  });
  it('Forge 3 can add Precision to weapons and Reinforced/Fortified to barding', () => {
    const s = testState(43);
    const h = s.player.ludus;
    h.buildings.forge = 3;
    h.denarii = 1e6;
    s.unlocks.push('masterSmith', 'supremeArmory');
    const w = Array.from({ length: 60 }, () => forgeItem(s, 'talonBlades') as Gear);
    expect(w.some((g) => g.augment === 'Precision')).toBe(true);
    expect(w.every((g) => g.quality === 2 || g.quality === 4)).toBe(true);
    const a = Array.from({ length: 60 }, () => forgeItem(s, 'lightHarness') as Gear);
    expect(a.some((g) => g.augment === 'Reinforced' || g.augment === 'Fortified')).toBe(true);
  });
  it('items come out as listed', () => {
    const s = testState();
    const h = s.player.ludus;
    h.buildings.workshop = 1;
    h.denarii = 900;
    const g = forgeItem(s, 'poultice') as Gear;
    expect(g.quality).toBe(2);
    expect(h.denarii).toBe(900 - forgeCost('poultice', 2, 0)); // 240 at Forge 0 (×0.80)
    expect(forgeItem(s, 'eagleEyeCharm')).toMatch(/costs/);
  });
});

describe('reforge and repair', () => {
  it('reforging below the tier, at worth × 0.95 (L1)', () => {
    const s = testState(5);
    const h = s.player.ludus;
    h.buildings.forge = 1;
    h.denarii = 1e5;
    const g = makeGear('talonBlades', 0, 'w1');
    h.armory.push(g);
    expect(reforgeCost(s, g)).toBe(Math.floor(gearWorth(g) * 0.95));
    let tries = 0;
    while (g.quality < 2 && tries++ < 50) reforge(s, 'w1');
    expect(g.quality).toBe(2);
    expect(reforgeCost(s, g)).toBeNull(); // at the L1 tier
    expect(reforge(s, 'w1').ok).toBe(false);
  });
  it('a Master-crafted piece gains an augment instead of a tier', () => {
    const s = testState(6);
    const h = s.player.ludus;
    h.buildings.forge = 3;
    h.denarii = 1e5;
    const w = makeGear('talonBlades', 4, 'w2');
    const a = makeGear('bronzeBarding', 4, 'a2');
    h.armory.push(w, a);
    for (let i = 0; i < 30 && !w.augment; i++) reforge(s, 'w2');
    for (let i = 0; i < 30 && !a.augment; i++) reforge(s, 'a2');
    expect(w.augment).toBe('Precision');
    expect(['Reinforced', 'Fortified']).toContain(a.augment);
    expect(w.quality).toBe(4);
    expect(reforgeCost(s, w)).toBeNull();
  });
  it('items, legendaries and locked pieces cannot be reforged', () => {
    const s = testState();
    const h = s.player.ludus;
    h.buildings.forge = 3;
    expect(reforgeCost(s, makeGear('poultice', 2, 'p'))).toBeNull();
    expect(reforgeCost(s, makeGear('talonBlades', 5, 'l'))).toBeNull();
    expect(reforgeCost(s, makeGear('sickleClaws', 1, 's'))).toBeNull();
    expect(reforgeCost(s, makeGear('bolaRig', 4, 'n'))).toBeNull();
    expect(reforgeCost(s, makeGear('numidianLancer', 4, 'r'))).toBeNull(); // Barded needs Cataphracts
  });
  it('repairs broken pieces (time-warped come back time-warped)', () => {
    const s = testState(8);
    const h = s.player.ludus;
    h.denarii = 1e5;
    const g = makeGear('talonBlades', 1, 'b1', { augment: 'BrokenTimeWarp' });
    h.armory.push(g);
    expect(repairCost(s, g)).toBe(Math.floor((150 + 100) * 1 * 0.5));
    for (let i = 0; i < 20 && g.augment === 'BrokenTimeWarp'; i++) repair(s, 'b1');
    expect(g.augment).toBe('TimeWarped');
    expect(repairCost(s, g)).toBeNull();
  });
});
