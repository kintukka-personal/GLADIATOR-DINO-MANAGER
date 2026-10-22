import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

vi.mock('../src/engine/economy', async () => (await import('./storiesFixture')).economyMock);
vi.mock('../src/engine/adventures', async () => (await import('./storiesFixture')).adventuresMock);
vi.mock('../src/engine/rivals', async () => (await import('./storiesFixture')).rivalsMock);
vi.mock('../src/engine/horde', async () => (await import('./storiesFixture')).hordeMock);
vi.mock('../src/engine/care', async () => (await import('./storiesFixture')).careMock);
vi.mock('../src/engine/influence', async () => (await import('./storiesFixture')).influenceMock);
vi.mock('../src/engine/buildings', async () => (await import('./storiesFixture')).buildingsMock);

import {
  OBJECTIVES, seedObjectives, checkObjectives, claimObjective, objectiveEvent, findObjective, spawnObjective,
} from '../src/engine/objectives';
import { makeState, makeRival, dino, addTo, resetMocks } from './storiesFixture';
import type { ObjectiveId } from '../src/engine/types';

beforeEach(() => resetMocks());

function unionMembers(name: string): string[] {
  const src = readFileSync(new URL('../src/engine/types.ts', import.meta.url), 'utf8');
  const start = src.indexOf(`export type ${name} =`);
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('objective catalogue', () => {
  it('defines every ObjectiveId', () => {
    const ids = unionMembers('ObjectiveId');
    expect(ids.filter((i) => !OBJECTIVES[i as ObjectiveId])).toEqual([]);
  });
});

describe('guidance chain', () => {
  it('is seeded only in non-ascended games and walks through all six steps to Student', () => {
    const asc = makeState({ week: 1, ascension: 2 });
    seedObjectives(asc);
    expect(findObjective(asc, 'guidance1')).toBeUndefined();

    const s = makeState({ week: 1 });
    seedObjectives(s);
    expect(findObjective(s, 'guidance1')).toBeTruthy();
    // expandLudus opens at week 1 when the mine / training field are missing
    expect(findObjective(s, 'expandLudus')).toBeTruthy();
    for (const ev of ['bought', 'learned', 'boughtWeapon', 'registered', 'advanced', 'hired']) objectiveEvent(s, ev);
    for (let i = 1; i <= 6; i++) {
      const o = findObjective(s, `guidance${i}` as ObjectiveId)!;
      expect(o.done).toBe(true);
      expect(o.claimed).toBe(true);
    }
    expect(s.pendingAchievements).toContain('student');
  });

  it('does not skip ahead: an event before its step still counts when the step opens', () => {
    const s = makeState({ week: 1 });
    seedObjectives(s);
    objectiveEvent(s, 'hired');
    expect(findObjective(s, 'guidance6')).toBeUndefined();
    objectiveEvent(s, 'bought');
    expect(findObjective(s, 'guidance2')?.done).toBe(false);
    for (const ev of ['learned', 'boughtWeapon', 'registered', 'advanced']) objectiveEvent(s, ev);
    expect(findObjective(s, 'guidance6')?.done).toBe(true);
  });
});

describe('timed objectives', () => {
  it('Expand the ludus completes from state and pays when claimed', () => {
    const s = makeState({ week: 1 });
    seedObjectives(s);
    expect(claimObjective(s, 'expandLudus')).toMatch(/Not completed/);
    s.player.ludus.buildings.mine = 1;
    s.player.ludus.buildings.trainingField = 1;
    checkObjectives(s);
    const o = findObjective(s, 'expandLudus')!;
    expect(o.done).toBe(true);
    const before = s.player.ludus.denarii;
    expect(claimObjective(s, 'expandLudus')).toBeNull();
    expect(s.player.ludus.denarii).toBe(before + 50);
    expect(claimObjective(s, 'expandLudus')).toMatch(/already/);
  });

  it('Security concerns fails after its 10 weeks', () => {
    const s = makeState({ week: 15 });
    s.world.horde.ferals = 12;
    checkObjectives(s);
    const o = findObjective(s, 'security')!;
    expect(o).toBeTruthy();
    expect(o.deadline).toBe(25);
    s.world.week = 26;
    checkObjectives(s);
    expect(o.failed).toBe(true);
    expect(claimObjective(s, 'security')).toMatch(/failed/);
  });

  it('Underhanded methods completes on poisoning Gigantus and pays gear', () => {
    const s = makeState({ week: 7 });
    const v = makeRival('Vettius', 'vettius');
    s.rivals.push(v);
    addTo(v, dino('Gigantus', { species: 'giganotosaurus', stats: { str: 9, agi: 4, cun: 3, hp: 40 }, legend: 'gigantus' }));
    checkObjectives(s);
    expect(findObjective(s, 'poison')).toBeTruthy();
    objectiveEvent(s, 'poison:gigantus');
    expect(findObjective(s, 'poison')!.done).toBe(true);
    expect(claimObjective(s, 'poison')).toBeNull();
    expect(s.player.ludus.armory.some((g) => g.type === 'huntersHood' && g.augment === 'Reinforced')).toBe(true);
  });

  it('Exert influence listens to the influence module\'s event names', () => {
    const s = makeState({ week: 5 });
    s.player.ludus.influence = 20;
    checkObjectives(s);
    expect(findObjective(s, 'exertInfluence')?.done).toBe(false);
    objectiveEvent(s, 'opportunity:publicSessions');
    expect(findObjective(s, 'exertInfluence')?.done).toBe(true);
  });
});

describe('breeding objectives', () => {
  it('first clutch, hand-raised and bloodline', () => {
    const s = makeState({ week: 3 });
    const me = s.player.ludus;
    addTo(me, dino('Sire', { species: 'velociraptor', sex: 'M' }), dino('Dam', { species: 'velociraptor', sex: 'F' }));
    checkObjectives(s);
    expect(findObjective(s, 'firstClutch')?.done).toBe(false);
    me.eggs.push({ id: 'e1', species: 'velociraptor', fertilized: true, health: 1, progress: 0, needed: 1, laidWeek: 3, source: 'bred', known: true });
    checkObjectives(s);
    expect(findObjective(s, 'firstClutch')?.done).toBe(true);

    const baby = dino('Pip', { species: 'velociraptor' });
    baby.genes.bred = true;
    baby.genes.generation = 1;
    baby.maturity = 0.5;
    me.creatures.push(baby);
    checkObjectives(s);
    expect(findObjective(s, 'imprintBaby')?.done).toBe(false);
    expect(findObjective(s, 'bloodline')?.progress).toBe(1);
    baby.maturity = 1;
    baby.genes.imprint = 1;
    baby.genes.generation = 3;
    checkObjectives(s);
    expect(findObjective(s, 'imprintBaby')?.done).toBe(true);
    expect(findObjective(s, 'bloodline')?.done).toBe(true);
    expect(claimObjective(s, 'bloodline')).toBeNull();
    expect(me.armory.some((g) => g.type === 'bestiaryScroll')).toBe(true);
  });
});

describe('Pythia chain', () => {
  it('runs 1/4 → 4/4 and starts the gods\' sacrifice', () => {
    const s = makeState({ week: 100 });
    const me = s.player.ludus;
    spawnObjective(s, 'pythia1Alt');
    me.influence = 10000;
    checkObjectives(s);
    expect(findObjective(s, 'pythia1Alt')?.done).toBe(true);
    expect(findObjective(s, 'pythia2')).toBeTruthy();
    objectiveEvent(s, 'delphi');
    expect(findObjective(s, 'pythia3')).toBeTruthy();
    const n = dino('Neokoros', { species: 'troodon', legend: 'neokoros' });
    me.creatures.push(n);
    s.player.storyData.pythiaVisions = { neokorosId: n.id };
    n.traits.push('JupiterChampion', 'PitChampion');
    checkObjectives(s);
    expect(findObjective(s, 'pythia3')?.done).toBe(true);
    me.keepers.unassigned = 100;
    me.denarii = 10000;
    checkObjectives(s);
    expect(findObjective(s, 'pythia4')?.done).toBe(true);
    expect(s.pendingAchievements).toContain('conduitOfTheGods');
    expect(s.player.conversations.some((c) => c.story === 'godsChosen')).toBe(true);
    expect(claimObjective(s, 'pythia4')).toBeNull();
    expect(me.armory.some((g) => g.unique === 'danaidDagger')).toBe(true);
  });

  it('a dead Neokoros sends you back to Delphi', () => {
    const s = makeState({ week: 100 });
    spawnObjective(s, 'pythia2');
    objectiveEvent(s, 'delphi');
    s.player.storyData.pythiaVisions = { neokorosId: 'gone' };
    checkObjectives(s);
    expect(findObjective(s, 'pythia3')?.failed).toBe(true);
    expect(findObjective(s, 'pythia2')?.done).toBe(false);
  });
});
