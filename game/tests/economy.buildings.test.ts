import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
vi.mock('../src/engine/horde', () => ({ joinHorde: vi.fn() }));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({ buildSide: vi.fn(), resolveBattle: vi.fn(), applyBattleResult: vi.fn() }));

import * as objectives from '../src/engine/objectives';
import type { BuildingId } from '../src/engine/types';
import { BUILDINGS, build, buildingTotals, canBuild, constructionLevel, loseRandomBuilding, surchargeFor } from '../src/engine/buildings';
import { testState, dino, addTo } from './economy.fixture';

const ALL: BuildingId[] = ['residence', 'trainingField', 'mine', 'forge', 'veterinarium', 'palisade', 'saddlery',
  'templeOfPluto', 'library', 'breedingPen', 'hatchery', 'nursery', 'kitchen', 'ariminiumCamp', 'shrine', 'workshop',
  'guardTower', 'aqueduct', 'romeMansion', 'tavern', 'bathHouse'];

function rich() {
  const s = testState();
  const h = s.player.ludus;
  h.denarii = 100000;
  h.influence = 5000;
  h.keepers.wardens = 100;
  addTo(h, dino(), dino(), dino(), dino(), dino());
  return { s, h };
}

beforeEach(() => vi.mocked(objectives.objectiveEvent).mockClear());

describe('catalogue', () => {
  it('defines all 21 buildings with matching benefit tables', () => {
    for (const id of ALL) {
      const b = BUILDINGS[id];
      expect(b, id).toBeTruthy();
      expect(b.id).toBe(id);
      expect(b.levels.length).toBeGreaterThan(0);
      expect(b.desc.length).toBe(b.levels.length);
      expect(b.benefits?.length).toBe(b.levels.length + 1);
    }
  });
  it('GM costs and DESIGN breeding costs', () => {
    expect(BUILDINGS.residence.levels.map((l) => l.denarii)).toEqual([300, 800, 2000, 5000]);
    expect(BUILDINGS.forge.levels.map((l) => l.influence)).toEqual([10, 80, 160]);
    expect(BUILDINGS.aqueduct.levels[0]).toEqual({ denarii: 5000, keepers: 60, creatures: 0, influence: 500, residence: 3 });
    expect(BUILDINGS.breedingPen.levels.map((l) => [l.denarii, l.keepers, l.residence])).toEqual([[300, 4, 0], [800, 10, 1], [2000, 20, 2]]);
    expect(BUILDINGS.hatchery.levels.map((l) => l.denarii)).toEqual([250, 700, 1800]);
    expect(BUILDINGS.nursery.levels.map((l) => l.denarii)).toEqual([200, 600, 1500]);
    expect(BUILDINGS.kitchen.levels[0].denarii).toBe(150);
  });
});

describe('totals', () => {
  it('starting estate: 15 beds, 3 facilities, 1 nursery slot, no pairs', () => {
    const { h } = rich();
    const t = buildingTotals(h);
    expect(t.beds).toBe(15);
    expect(t.facilities).toBe(3);
    expect(t.nurserySlots).toBe(1);
    expect(t.pairs).toBe(0);
    expect(t.eggSlots).toBe(0);
    expect(t.tempControl).toBe(0);
    expect(t.mineEfficiency).toBe(10);
    expect(t.spiesUnlocked).toBe(false);
    expect(t.kitchen).toBe(false);
  });
  it('breeding buildings by level', () => {
    const { h } = rich();
    const pairs = [], eggs = [], temp = [], nursery = [];
    for (let l = 1; l <= 3; l++) {
      h.buildings.breedingPen = l; h.buildings.hatchery = l; h.buildings.nursery = l;
      const t = buildingTotals(h);
      pairs.push(t.pairs); eggs.push(t.eggSlots); temp.push(t.tempControl); nursery.push(t.nurserySlots);
    }
    expect(pairs).toEqual([1, 2, 4]);
    expect(eggs).toEqual([2, 4, 8]);
    expect(temp).toEqual([6, 12, 999]);
    expect(nursery).toEqual([3, 6, 10]);
  });
  it('Bath House benefits apply and Veterinarium L2 beds count (GM bugs fixed)', () => {
    const { h } = rich();
    h.buildings.bathHouse = 1;
    h.buildings.veterinarium = 2;
    const t = buildingTotals(h);
    expect(t.influence).toBe(5 + 2);
    expect(t.denarii).toBe(50);
    expect(t.beds).toBe(15 + 5 + 5);
    expect(t.surgeries).toBe(2);
    expect(t.injuryReduction).toBe(2);
  });
  it('residence, training field, rome mansion, aqueduct', () => {
    const { h } = rich();
    h.buildings.residence = 4;
    h.buildings.trainingField = 3;
    h.buildings.romeMansion = 2;
    h.buildings.aqueduct = 1;
    h.buildings.templeOfPluto = 1;
    const t = buildingTotals(h);
    expect(t.beds).toBe(300 + 20 + 25);
    expect(t.facilities).toBe(3 + 20 + 2);
    expect(t.trainingPct).toBe(75);
    expect(t.influence).toBe(8 + 2 + 10 + 30 + 2);
    expect(t.denarii).toBe(150 - 20 + 100 + 10);
    expect(t.security).toBe(10 + 3 - 2);
    expect(t.favoured).toBe(true);
    expect(t.spiesUnlocked).toBe(true);
  });
});

describe('construction', () => {
  it('thresholds are checked but only denarii are spent; one build a week', () => {
    const s = testState();
    const h = s.player.ludus;
    h.denarii = 1000;
    expect(canBuild(s, h, 'residence').ok).toBe(false); // 1 keeper, 0 influence
    h.keepers.wardens = 4;
    h.influence = 25;
    expect(canBuild(s, h, 'residence')).toEqual({ ok: true, cost: 300 });
    expect(build(s, h, 'residence')).toBeNull();
    expect(h.buildings.residence).toBe(1);
    expect(h.denarii).toBe(700);
    expect(h.influence).toBe(25);
    expect(h.keepers.wardens).toBe(4);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'built:residence');
    expect(build(s, h, 'kitchen')).toMatch(/one construction a week/i);
  });
  it('upgrade gates, event-only first levels and location gates', () => {
    const { s, h } = rich();
    h.buildings.residence = 4;
    h.buildings.forge = 1;
    expect(canBuild(s, h, 'forge').reason).toMatch(/Amber/);
    s.unlocks.push('masterSmith');
    expect(canBuild(s, h, 'forge').ok).toBe(true);
    expect(canBuild(s, h, 'templeOfPluto').reason).toMatch(/Amber/);
    expect(canBuild(s, h, 'library').reason).toMatch(/Amber/);
    s.unlocks.push('athenianArtifacts');
    expect(canBuild(s, h, 'library').ok).toBe(true);
    expect(canBuild(s, h, 'ariminiumCamp').ok).toBe(false);
    expect(canBuild(s, h, 'shrine').reason).toMatch(/Ariminium Camp/);
    expect(canBuild(s, h, 'romeMansion').ok).toBe(false);
    expect(canBuild(s, h, 'tavern').reason).toMatch(/Rome Mansion/);
    h.buildings.ariminiumCamp = 1;
    expect(canBuild(s, h, 'shrine').ok).toBe(true);
    expect(canBuild(s, h, 'ariminiumCamp').ok).toBe(true); // L2 is buildable
    expect(canBuild(s, h, 'workshop').reason).toMatch(/Amber/);
    h.buildings.romeMansion = 1;
    expect(canBuild(s, h, 'tavern').ok).toBe(true);
    expect(canBuild(s, h, 'bathHouse').reason).toMatch(/Amber/);
  });
  it('library only once the Residence is fully built', () => {
    const { s, h } = rich();
    s.unlocks.push('athenianArtifacts');
    h.buildings.residence = 3;
    expect(canBuild(s, h, 'library').reason).toMatch(/Residence level 4/);
  });
  it('ascension surcharges: Venus and Juno, multiplied by level, player only', () => {
    const { s, h } = rich();
    s.world.ascension = 6;
    expect(surchargeFor(s, h, 'residence')).toBe(50);
    s.world.ascension = 10;
    expect(canBuild(s, h, 'residence').cost).toBe(300 + 150);
    h.buildings.residence = 3;
    expect(canBuild(s, h, 'residence').cost).toBe(5000 + 1500);
    h.buildings.ariminiumCamp = 1;
    expect(canBuild(s, h, 'shrine').cost).toBe(600 + 1500);
    expect(canBuild(s, h, 'guardTower').cost).toBe(1000 + 1000);
    expect(canBuild(s, h, 'aqueduct').cost).toBe(5000);
    expect(surchargeFor(s, s.rivals[0], 'residence')).toBe(0);
  });
  it('a full building cannot be raised', () => {
    const { s, h } = rich();
    h.buildings.kitchen = 1;
    expect(canBuild(s, h, 'kitchen').reason).toMatch(/fully built/);
  });
});

describe('destruction', () => {
  it('cascades down the GM list and returns null when nothing is built', () => {
    const { h } = rich();
    expect(loseRandomBuilding(h)).toBeNull();
    h.buildings.residence = 2;
    expect(loseRandomBuilding(h)).toBe('residence');
    expect(h.buildings.residence).toBe(1);
    expect(constructionLevel(h)).toBe(1);
  });
});
