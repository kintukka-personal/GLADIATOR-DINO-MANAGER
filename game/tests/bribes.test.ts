import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./intrigueFixture')).economyMock);
vi.mock('../src/engine/buildings', async () => (await import('./intrigueFixture')).buildingsMock);
vi.mock('../src/engine/rivals', async () => (await import('./intrigueFixture')).rivalsMock);
vi.mock('../src/engine/care', async () => (await import('./intrigueFixture')).careMock);
vi.mock('../src/engine/stories', async () => (await import('./intrigueFixture')).storiesMock);
vi.mock('../src/engine/objectives', async () => (await import('./intrigueFixture')).objectivesMock);
vi.mock('../src/engine/combat', async () => (await import('./intrigueFixture')).combatMock);

import { makeState, makeRival, dino, resetMocks } from './intrigueFixture';
import { cheatCost, cheatAvailable, aiCheatChoice, betMultiplier, betPayout, cheatLikelihood, availableStakes } from '../src/engine/bribes';
import { setSeed } from '../src/engine/rng';
import type { GameState, Tournament } from '../src/engine/types';

let state: GameState;
beforeEach(() => {
  resetMocks();
  state = makeState({ week: 20 });
});

function tour(type: Tournament['type'], underground = false): Tournament {
  return {
    key: 't', name: 'T', week: 20, perTeam: 2, teams: 4, fee: 50, underground, mounts: 'none', beasts: true, type, id: 't1',
    entries: [], matches: [], currentRound: 0, bonusRound: 0, status: 'open', weather: 'sunny', log: [],
  };
}

describe('cheat costs (05 §2)', () => {
  it('normal and cheap rates', () => {
    expect(cheatCost(state, tour('normal'), 'poison', 2, 3)).toBe(60);
    expect(cheatCost(state, tour('normal'), 'chains', 2, 3)).toBe(60);
    expect(cheatCost(state, tour('underground', true), 'poison', 2, 3)).toBe(40);
    expect(cheatCost(state, tour('rookie'), 'chains', 2, 3)).toBe(45);
    expect(cheatCost(state, tour('junior'), 'poison', 1, 1)).toBe(20);
    expect(cheatCost(state, undefined, 'guards', 1, 1)).toBe(25);
    expect(cheatCost(state, undefined, 'beast', 1, 1)).toBe(80);
  });

  it('beast bribe halves with Lobby the Senate or a senate seat; Minerva doubles everything for the player', () => {
    state.player.opportunities.push('lobbySenate');
    expect(cheatCost(state, undefined, 'beast', 1, 1)).toBe(40);
    state.player.opportunities = [];
    state.player.senator = true;
    expect(cheatCost(state, undefined, 'beast', 1, 1)).toBe(40);
    state.world.ascension = 5;
    expect(cheatCost(state, undefined, 'beast', 1, 1)).toBe(80);
    expect(cheatCost(state, tour('normal'), 'poison', 3, 3)).toBe(180);
    // the AI pays the plain rate
    const r = state.rivals[0];
    expect(cheatCost(state, tour('normal'), 'poison', 3, 3, r)).toBe(90);
    expect(cheatCost(state, undefined, 'beast', 1, 1, r)).toBe(80);
  });
});

describe('cheat availability', () => {
  it('release beast needs the upgrade, no pits, a side of two or fewer', () => {
    expect(cheatAvailable(state, tour('normal'), 'beast', 2)).toMatch(/upgrade/i);
    state.unlocks.push('releaseBeast');
    expect(cheatAvailable(state, tour('normal'), 'beast', 2)).toBeNull();
    expect(cheatAvailable(state, tour('normal'), 'beast', 3)).toBeTruthy();
    expect(cheatAvailable(state, tour('underground', true), 'beast', 1)).toBeTruthy();
  });

  it('replacing the guards needs a senate seat', () => {
    expect(cheatAvailable(state, tour('normal'), 'guards', 1)).toBeTruthy();
    state.player.senator = true;
    expect(cheatAvailable(state, tour('normal'), 'guards', 1)).toBeNull();
    expect(cheatAvailable(state, tour('underground', true), 'guards', 1)).toBeTruthy();
  });

  it('checks the purse', () => {
    state.player.ludus.denarii = 10;
    expect(cheatAvailable(state, tour('normal'), 'poison', 2)).toMatch(/60/);
    expect(cheatAvailable(state, tour('normal'), 'chains', 2, 3)).toMatch(/60/);
  });
});

describe('AI cheating', () => {
  it('never in week 1, and an honest friendly poor rival never cheats', () => {
    const r = makeRival('Decimus', 'decimus', { honesty: 'honest', opinion: 80, denarii: 50 });
    state.world.week = 1;
    expect(aiCheatChoice(state, r, tour('normal'), 2, 2)).toBeNull();
    state.world.week = 20;
    for (let i = 0; i < 300; i++) expect(aiCheatChoice(state, r, tour('normal'), 2, 2)).toBeNull();
  });

  it('likelihood terms', () => {
    const r = makeRival('Batiatus', 'batiatus', { honesty: 'treacherous', opinion: 20, denarii: 800 });
    state.player.ludus.influence = 100;
    // +1 influence, +2 money, +2 opinion, +5 treacherous
    expect(cheatLikelihood(state, r)).toBe(10);
    state.world.ascension = 12;
    expect(cheatLikelihood(state, r)).toBe(11);
  });

  it('champion comparison checks every fighter (GM quirk fixed)', () => {
    const r = makeRival('Solonius', 'solonius', { honesty: 'honest', opinion: 50, denarii: 150 });
    const champ = dino('Champ', {}, ['ArenaChampion']);
    const plain = dino('Plain');
    const base = cheatLikelihood(state, r, [plain], [plain]);
    // the champion is first in the player's list: still counts
    expect(cheatLikelihood(state, r, [plain], [champ, plain])).toBe(base + 1);
    expect(cheatLikelihood(state, r, [champ, plain], [plain])).toBe(base - 1);
  });

  it('a treacherous rich enemy cheats about 7/8 of the time and picks affordable cheats', () => {
    setSeed(7);
    const r = makeRival('Batiatus', 'batiatus', { honesty: 'treacherous', opinion: 10, denarii: 800 });
    state.player.ludus.influence = 100;
    let cheats = 0;
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const c = aiCheatChoice(state, r, tour('normal'), 2, 2);
      if (c) {
        cheats++;
        kinds.add(c);
      }
    }
    // L = 10 → rand(8) + 10 > 9 always
    expect(cheats).toBe(400);
    expect(kinds.has('beast')).toBe(false); // no Release Beast upgrade
    expect([...kinds].every((k) => k === 'poison' || k === 'chains')).toBe(true);
    state.unlocks.push('releaseBeast');
    const kinds2 = new Set<string>();
    for (let i = 0; i < 400; i++) kinds2.add(aiCheatChoice(state, r, tour('normal'), 2, 2) ?? 'none');
    expect(kinds2.has('beast')).toBe(true);
  });

  it('a broke rival cannot afford to cheat', () => {
    const r = makeRival('Batiatus', 'batiatus', { honesty: 'treacherous', opinion: 0, denarii: 10 });
    state.player.ludus.influence = 100;
    for (let i = 0; i < 100; i++) expect(aiCheatChoice(state, r, tour('normal'), 2, 2)).toBeNull();
  });
});

describe('betting', () => {
  it('multiplier table', () => {
    expect(betMultiplier(51)).toBe(0.2);
    expect(betMultiplier(50)).toBe(0.3);
    expect(betMultiplier(25)).toBe(0.4);
    expect(betMultiplier(11)).toBe(0.55);
    expect(betMultiplier(1)).toBe(0.8);
    expect(betMultiplier(0)).toBe(1);
    expect(betMultiplier(-10)).toBe(1.3);
    expect(betMultiplier(-25)).toBe(1.5);
    expect(betMultiplier(-35)).toBe(2);
    expect(betMultiplier(-45)).toBe(4);
    expect(betMultiplier(-55)).toBe(6);
    expect(betMultiplier(-79)).toBe(8);
    expect(betMultiplier(-80)).toBe(10);
    expect(betPayout(100, -45)).toBe(500);
  });

  it('stakes need the Gambler opportunity', () => {
    expect(availableStakes(state)).toEqual([]);
    state.player.opportunities.push('gambler');
    state.player.ludus.denarii = 60;
    expect(availableStakes(state)).toEqual([0, 20, 50]);
  });
});
