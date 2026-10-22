import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/buildings', () => ({
  buildingTotals: () => ({
    influence: 0, denarii: 0, beds: 15, facilities: 3, trainingPct: 0, security: 0, mineEfficiency: 10, spiesUnlocked: false,
    forgeTier: 0, surgeries: 0, injuryReduction: 0, favoured: false, pairs: 2, eggSlots: 2, tempControl: 6, nurserySlots: 3, kitchen: true,
  }),
}));
vi.mock('../src/engine/economy', () => ({ committedSpies: () => 0 }));

import { setSeed } from '../src/engine/rng';
import {
  rollOffspringGenes, parentGenes, inheritTraits, assignPair, breedingWeek, incubationWeek, nurseryWeek, fulfillImprint,
  pairIssue, MUTATION_LIMIT, seasonalTemperature, craftKibble, generateMarketEgg, pedigree, eggValue,
} from '../src/engine/breeding';
import { makeCreature, addTrait, getStat, rawStat } from '../src/engine/creature';
import { makeLudus, emptyMeta } from '../src/engine/newgame';
import type { GameState, Creature, Stats } from '../src/engine/types';

function S(str: number, agi: number, cun: number, hp: number): Stats { return { str, agi, cun, hp }; }

function minimalState(): GameState {
  const ludus = makeLudus('House Test', true, 1000);
  return {
    version: 1, slot: 1, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Test', female: false, heritage: 'roman', ludus, opportunities: [], treeSeed: 1,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [],
      stories: {}, storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [],
      conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0,
      invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [], unknown: makeLudus('Unknown', false, 200),
    world: {
      week: 10, rng: 1, difficulty: { hard: false, nightmare: false, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
      ascension: 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [],
        foodPrices: { rawMeat: 8, primeMeat: 25, mejoberries: 5, kibble_simple: 40, kibble_regular: 70, kibble_superior: 120, kibble_exceptional: 200, kibble_extraordinary: 350 }, pokes: 0 },
      horde: { rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
      laws: { publicFunding: false }, flags: {}, temperature: 28, released: [],
    },
    ancestry: {}, unlocks: [...emptyMeta().upgrades], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
}

function raptor(sex: 'M' | 'F', wild: Stats): Creature {
  return makeCreature({ species: 'velociraptor', sex, wild, maturity: 1, adultWeeks: 60 });
}

beforeEach(() => setSeed(12345));

describe('ARK inheritance', () => {
  it('takes the higher parent value ~55% of the time', () => {
    const mom = parentGenes(raptor('F', S(20, 0, 0, 0)));
    const dad = parentGenes(raptor('M', S(10, 0, 0, 0)));
    let higher = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const g = rollOffspringGenes(mom, dad, 1);
      if (g.wild.str >= 20) higher++;
    }
    expect(higher / N).toBeGreaterThan(0.53);
    expect(higher / N).toBeLessThan(0.58);
  });

  it('mutates at ≈7.31% per offspring with +2 points and counts the side', () => {
    const mom = parentGenes(raptor('F', S(5, 5, 5, 5)));
    const dad = parentGenes(raptor('M', S(5, 5, 5, 5)));
    let mutated = 0;
    let pointsOk = true;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const g = rollOffspringGenes(mom, dad, 1);
      if (g.mutations.length) {
        mutated++;
        const total = g.wild.str + g.wild.agi + g.wild.cun + g.wild.hp;
        if (total !== 20 + 2 * g.mutations.length) pointsOk = false;
        expect(g.mutMatri + g.mutPatri).toBe(g.mutations.length);
      }
    }
    expect(mutated / N).toBeGreaterThan(0.065);
    expect(mutated / N).toBeLessThan(0.081);
    expect(pointsOk).toBe(true);
  });

  it('blocks mutations from a parent at the 20 limit', () => {
    const mom = parentGenes(raptor('F', S(5, 5, 5, 5)));
    const dadC = raptor('M', S(5, 5, 5, 5));
    dadC.genes.mutPatri = MUTATION_LIMIT;
    const dad = parentGenes(dadC);
    let fromDad = 0;
    for (let i = 0; i < 20000; i++) {
      const g = rollOffspringGenes(mom, dad, 1);
      fromDad += g.mutations.filter((m) => m.side === 'patri').length;
      expect(g.mutPatri).toBeGreaterThanOrEqual(MUTATION_LIMIT);
    }
    expect(fromDad).toBe(0);
  });

  it('inherits counters as each parent total', () => {
    const m = raptor('F', S(1, 1, 1, 1));
    m.genes.mutMatri = 3; m.genes.mutPatri = 2;
    const f = raptor('M', S(1, 1, 1, 1));
    f.genes.mutMatri = 1; f.genes.mutPatri = 4;
    setSeed(7);
    const g = rollOffspringGenes(parentGenes(m), parentGenes(f), 1);
    expect(g.mutMatri - g.mutations.filter((x) => x.side === 'matri').length).toBe(5);
    expect(g.mutPatri - g.mutations.filter((x) => x.side === 'patri').length).toBe(5);
    expect(g.generation).toBe(1);
  });

  it('passes heritable traits only', () => {
    const m = raptor('F', S(1, 1, 1, 1));
    const f = raptor('M', S(1, 1, 1, 1));
    m.traits = []; f.traits = [];
    addTrait(m, 'Strong'); addTrait(f, 'Strong'); addTrait(m, 'ArenaChampion');
    let strong = 0;
    for (let i = 0; i < 4000; i++) {
      const t = inheritTraits(parentGenes(m), parentGenes(f));
      expect(t).not.toContain('ArenaChampion');
      if (t.includes('Strong')) strong++;
    }
    expect(strong / 4000).toBeGreaterThan(0.5);
    expect(strong / 4000).toBeLessThan(0.6);
  });
});

describe('breeding loop', () => {
  it('pairs, lays, incubates, hatches and imprints', () => {
    const state = minimalState();
    const h = state.player.ludus;
    const m = raptor('M', S(8, 8, 8, 8));
    const f = raptor('F', S(6, 10, 6, 6));
    h.creatures.push(m, f);
    expect(pairIssue(h, m, f)).toBeNull();
    expect(assignPair(state, m.id, f.id)).toBeNull();
    const r = breedingWeek(state, h);
    expect(r.lines.join(' ')).toContain('laid');
    const eggs = h.eggs.filter((e) => e.fertilized);
    expect(eggs.length).toBe(1);
    state.world.temperature = 28; // in range 24–32
    const inc = incubationWeek(state, h);
    expect(inc.hatched.length).toBe(1);
    const baby = inc.hatched[0];
    expect(baby.maturity).toBe(0);
    expect(baby.genes.bred).toBe(true);
    nurseryWeek(state, h, new Set([baby.id]));
    expect(baby.imprintRequest).toBeTruthy();
    // fulfil every request until adult
    h.pantry = { rawMeat: 20, primeMeat: 20, kibble_simple: 20 };
    for (let w = 0; w < 10 && baby.maturity < 1; w++) {
      expect(fulfillImprint(state, baby.id)).toBeNull();
      nurseryWeek(state, h);
    }
    expect(baby.maturity).toBe(1);
    expect(baby.genes.imprint).toBeCloseTo(1, 5);
    // imprint raises the wild part by 20%
    const before = Math.round(2 + baby.genes.wild.str);
    expect(rawStat(baby, 'str')).toBeGreaterThanOrEqual(before);
    expect(getStat(baby, 'hp')).toBeGreaterThan(0);
  });

  it('kills eggs kept far out of range', () => {
    const state = minimalState();
    const h = state.player.ludus;
    h.creatures.push(raptor('M', S(1, 1, 1, 1)), raptor('F', S(1, 1, 1, 1)));
    assignPair(state, h.creatures[0].id, h.creatures[1].id);
    breedingWeek(state, h);
    state.world.temperature = -5; // winter, beyond the ±6 control
    let died = false;
    for (let i = 0; i < 6 && !died; i++) died = incubationWeek(state, h).died.length > 0;
    expect(died).toBe(true);
  });

  it('rejects mismatched pairs', () => {
    const state = minimalState();
    const h = state.player.ludus;
    const m = raptor('M', S(1, 1, 1, 1));
    const f2 = makeCreature({ species: 'triceratops', sex: 'F', maturity: 1 });
    h.creatures.push(m, f2);
    expect(pairIssue(h, m, f2)).toMatch(/same species/);
  });

  it('crafts kibble from unfertilized eggs and values eggs', () => {
    const state = minimalState();
    const h = state.player.ludus;
    h.eggs.push({ id: 'e1', species: 'triceratops', fertilized: false, health: 1, progress: 0, needed: 0, laidWeek: 10, source: 'bred', known: true });
    h.pantry = { mejoberries: 1 };
    expect(craftKibble(state, 'e1', 'mejoberries')).toBeNull();
    expect(h.pantry.kibble_superior).toBe(1);
    const egg = generateMarketEgg(state, 'tyrannosaurus');
    expect(eggValue(egg)).toBeGreaterThan(300);
  });

  it('season curve is warm in summer and cold in winter', () => {
    expect(seasonalTemperature(26)).toBeGreaterThan(seasonalTemperature(45));
  });

  it('builds a pedigree from the ancestry registry', () => {
    const state = minimalState();
    const h = state.player.ludus;
    const m = raptor('M', S(3, 3, 3, 3));
    const f = raptor('F', S(3, 3, 3, 3));
    h.creatures.push(m, f);
    assignPair(state, m.id, f.id);
    breedingWeek(state, h);
    state.world.temperature = 28;
    const baby = incubationWeek(state, h).hatched[0];
    const tree = pedigree(state, baby.id, 2);
    expect(tree?.mother?.id).toBe(f.id);
    expect(tree?.father?.id).toBe(m.id);
  });
});
