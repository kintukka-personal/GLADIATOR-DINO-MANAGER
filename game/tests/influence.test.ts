import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./intrigueFixture')).economyMock);
vi.mock('../src/engine/buildings', async () => (await import('./intrigueFixture')).buildingsMock);
vi.mock('../src/engine/rivals', async () => (await import('./intrigueFixture')).rivalsMock);
vi.mock('../src/engine/care', async () => (await import('./intrigueFixture')).careMock);
vi.mock('../src/engine/stories', async () => (await import('./intrigueFixture')).storiesMock);
vi.mock('../src/engine/objectives', async () => (await import('./intrigueFixture')).objectivesMock);
vi.mock('../src/engine/combat', async () => (await import('./intrigueFixture')).combatMock);

import { makeState, dino, addTo, resetMocks, rivalsMock, objectivesMock } from './intrigueFixture';
import {
  OPPORTUNITIES, ALL_OPPORTUNITIES, treeFor, nextOpportunityCost, availableInfluence, canUnlock, unlock, setToggle, hasOpp,
  publicSessionsIncome, influenceLoyaltyEffect, startElection, setElectionAction, electionWeek, influenceWeek, votesForGain,
  swapAlternate, princepsActive, flushMarketOffers,
} from '../src/engine/influence';
import { generateBeast } from '../src/engine/creature';
import type { GameState, OpportunityId } from '../src/engine/types';

let state: GameState;
beforeEach(() => {
  resetMocks();
  state = makeState({ week: 20 });
});

function own(...ids: OpportunityId[]): void {
  state.player.opportunities.push(...ids);
}

describe('opportunity tree (05 §3.3)', () => {
  it('defines all 19 opportunities in three paths of five tiers', () => {
    expect(ALL_OPPORTUNITIES).toHaveLength(19);
    const tree = treeFor(state);
    expect(tree).toHaveLength(3);
    for (const path of tree) {
      expect(path).toHaveLength(5);
      path.forEach((o, i) => expect(o.tier).toBe(i + 1));
    }
    expect(tree[0][0].id).toBe('publicSessions');
    expect(tree[2][4].id).toBe('veilOfNight');
    expect(OPPORTUNITIES.publicSessions.toggle).toBe(true);
  });

  it('the seed picks alternates', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 12; s++) {
      state.player.treeSeed = s;
      const t = treeFor(state);
      seen.add(`${t[0][3].id}/${t[1][1].id}/${t[2][1].id}`);
    }
    expect(seen.size).toBe(12);
  });

  it('cost ladder and difficulty factors', () => {
    expect(nextOpportunityCost(state)).toBe(20);
    own('publicSessions', 'takeLoan', 'bribeGeneral');
    expect(nextOpportunityCost(state)).toBe(160);
    state.world.difficulty.hard = true;
    expect(nextOpportunityCost(state)).toBe(240);
    state.world.difficulty.nightmare = true;
    expect(nextOpportunityCost(state)).toBe(320);
    state.world.ascension = 3;
    expect(nextOpportunityCost(state)).toBe(400);
  });

  it('unlocking reserves influence in path order', () => {
    const me = state.player.ludus;
    me.influence = 25;
    expect(canUnlock(state, 'bribeGeneral')).toMatch(/first/);
    expect(unlock(state, 'publicSessions')).toBeNull();
    expect(me.allocatedInfluence).toBe(20);
    expect(availableInfluence(me)).toBe(5);
    expect(canUnlock(state, 'bribeGeneral')).toMatch(/40/);
    expect(objectivesMock.objectiveEvent).toHaveBeenCalledWith(state, 'influence');
    expect(canUnlock(state, 'publicSessions')).toMatch(/Already/);
  });

  it('the senator path needs the Senator Tree upgrade', () => {
    state.player.ludus.influence = 500;
    expect(canUnlock(state, 'lobbySenate')).toMatch(/Senator Tree/);
    state.unlocks.push('senatorTree');
    expect(canUnlock(state, 'lobbySenate')).toBeNull();
  });

  it('Power Begets Power gives +10 % at once; Market Connections two poultices', () => {
    const me = state.player.ludus;
    state.unlocks.push('senatorTree');
    state.player.treeSeed = 2; // senator tier 2 = Power Begets Power
    me.influence = 1000;
    own('lobbySenate');
    expect(treeFor(state)[1][1].id).toBe('powerBegetsPower');
    expect(unlock(state, 'powerBegetsPower')).toBeNull();
    expect(me.influence).toBe(1100);
    state.player.treeSeed = 0;
    expect(unlock(state, 'marketConnections')).toBeNull();
    expect(me.armory.filter((g) => g.type === 'poultice')).toHaveLength(2);
  });

  it('Rome Mansion swaps alternates for 250 denarii', () => {
    const me = state.player.ludus;
    const before = treeFor(state)[2][1].id;
    expect(swapAlternate(state, 'trickster', 2)).toMatch(/Rome Mansion/);
    me.buildings.romeMansion = 2;
    expect(swapAlternate(state, 'trickster', 2)).toBeNull();
    expect(me.denarii).toBe(750);
    expect(treeFor(state)[2][1].id).not.toBe(before);
  });
});

describe('toggles', () => {
  it('loan: +500 now, −25/week, repaying needs 500', () => {
    const me = state.player.ludus;
    expect(setToggle(state, 'loan', true)).toMatch(/Unlock/);
    own('takeLoan');
    expect(setToggle(state, 'loan', true)).toBeNull();
    expect(me.denarii).toBe(1500);
    expect(me.projected).toBe(-25);
    me.denarii = 300;
    expect(setToggle(state, 'loan', false)).toMatch(/500/);
    me.denarii = 600;
    expect(setToggle(state, 'loan', false)).toBeNull();
    expect(me.denarii).toBe(100);
    expect(me.projected).toBe(0);
  });

  it('bribe general −5/week; public sessions +1 security penalty', () => {
    const me = state.player.ludus;
    own('publicSessions', 'bribeGeneral');
    setToggle(state, 'bribeGeneral', true);
    expect(me.projected).toBe(-5);
    setToggle(state, 'bribeGeneral', true);
    expect(me.projected).toBe(-5);
    setToggle(state, 'publicSessions', true);
    expect(me.securityPenalties).toBe(1);
    setToggle(state, 'publicSessions', false);
    expect(me.securityPenalties).toBe(0);
    expect(hasOpp(state, 'bribeGeneral')).toBe(true);
  });
});

describe('formulas', () => {
  it('public sessions income', () => {
    const me = state.player.ludus;
    const [a, b] = addTo(me, dino('A', {}, ['ArenaChampion']), dino('B'));
    a.fame = 300;
    b.fame = 200;
    const w = generateBeast('direwolf');
    w.fame = 0;
    me.creatures.push(w);
    me.influence = 300;
    // 5·1 + (30/5)·3 + 500/10 + 2·(2 + 2·1) = 5 + 18 + 50 + 8
    expect(publicSessionsIncome(state, me)).toBe(81);
    me.influence = 3000; // I' = 30 + 180 = 210
    expect(publicSessionsIncome(state, me)).toBe(5 + 42 * 3 + 50 + 8);
    a.fame = 9000; // total 9200 → F = 92 + 450
    expect(publicSessionsIncome(state, me)).toBe(5 + 42 * 3 + 542 + 8);
  });

  it('influence loyalty effect', () => {
    const me = state.player.ludus;
    me.influence = 5;
    expect(influenceLoyaltyEffect(state, me)).toBe(-2);
    me.influence = 15;
    expect(influenceLoyaltyEffect(state, me)).toBe(-1);
    me.influence = 50;
    expect(influenceLoyaltyEffect(state, me)).toBe(1);
    me.influence = 100000;
    expect(influenceLoyaltyEffect(state, me)).toBe(12);
    own('forbiddenContraband', 'bacchusPatron');
    expect(influenceLoyaltyEffect(state, me)).toBe(15);
    me.influence = 60;
    state.world.ascension = 3; // 60 × 0.8 = 48 < 50
    expect(influenceLoyaltyEffect(state, me)).toBe(3);
    // AI houses ignore the player's opportunities
    const r = state.rivals[0];
    r.influence = 60;
    expect(influenceLoyaltyEffect(state, r)).toBe(1);
  });

  it('vote table', () => {
    expect([-11, -1, 0, 2, 3, 5, 8, 11, 16, 21, 36, 56, 66, 86, 106].map(votesForGain))
      .toEqual([-4, -2, 0, 0, 1, 2, 3, 5, 6, 7, 9, 11, 13, 15, 17]);
  });
});

describe('elections (05 §3.4–3.5)', () => {
  function readySenate(): void {
    state.unlocks.push('senatorTree');
    own('lobbySenate', 'marketConnections', 'electedSenator');
    state.player.ludus.influence = 750;
  }

  it('start requirements, cost and starting votes', () => {
    expect(startElection(state, 'senate')).toBeTruthy();
    readySenate();
    state.player.ludus.denarii = 300;
    expect(startElection(state, 'senate')).toMatch(/400/);
    state.player.ludus.denarii = 1000;
    expect(startElection(state, 'senate')).toBeNull();
    expect(state.player.ludus.denarii).toBe(600);
    expect(state.player.election!.votes).toBe(12);
    expect(startElection(state, 'senate')).toMatch(/under way/);
  });

  it('five weekly updates then a result; winning makes you a senator', () => {
    readySenate();
    startElection(state, 'senate');
    const me = state.player.ludus;
    let card = null;
    for (let i = 0; i < 5; i++) {
      me.influence += 120; // > 105 → +17 a week
      card = electionWeek(state);
      if (i < 4) expect(card).toBeNull();
    }
    expect(card).toMatchObject({ kind: 'election', won: true, office: 'senate' });
    expect(state.player.senator).toBe(true);
    expect(state.player.election).toBeUndefined();
    expect(state.pendingAchievements).toContain('winSenateElections');
  });

  it('a quiet campaign loses', () => {
    readySenate();
    startElection(state, 'senate');
    let card = null;
    for (let i = 0; i < 5; i++) card = electionWeek(state);
    expect(card).toMatchObject({ kind: 'election', won: false });
    expect(state.player.senator).toBe(false);
  });

  it('smear and campaigners add votes; campaigners are away and cost security', () => {
    readySenate();
    startElection(state, 'senate');
    const me = state.player.ludus;
    const [a, b] = addTo(me, dino('A'), dino('B'));
    a.fame = 300; // 1 + 2 thresholds (100, 250)
    b.injury = { type: 'flesh', weeks: 2 };
    setElectionAction(state, { smear: true, campaigners: [a.id, b.id] });
    expect(state.player.election!.campaigners).toEqual([a.id]);
    expect(a.away?.kind).toBe('campaign');
    expect(me.securityPenalties).toBe(2);
    const before = state.player.election!.votes;
    const d0 = me.denarii;
    electionWeek(state);
    const gained = state.player.election!.votes - before;
    // f(0) = 0, random 1..3, smear 8, campaign 3
    expect(gained).toBeGreaterThanOrEqual(12);
    expect(gained).toBeLessThanOrEqual(14);
    expect(me.denarii).toBe(d0 - 200);
    expect(a.away?.kind).toBe('campaign');
    setElectionAction(state, { campaigners: [] });
    expect(a.away).toBeUndefined();
    expect(me.securityPenalties).toBe(0);
  });

  it('consul: lictors and −2 security penalties', () => {
    readySenate();
    state.player.senator = true;
    own('princepsSenatus', 'consul');
    expect(princepsActive(state)).toBe(true);
    state.player.ludus.influence = 2500;
    expect(startElection(state, 'consul')).toBeNull();
    expect(state.player.election!.votes).toBe(7);
    state.player.election!.votes = 99;
    let card = null;
    for (let i = 0; i < 5; i++) card = electionWeek(state);
    expect(card).toMatchObject({ won: true, office: 'consul' });
    expect(state.player.consul).toBe(true);
    expect(state.player.ludus.securityPenalties).toBe(-2);
    expect(state.player.storyData.lictor).toBeTruthy();
    expect(state.player.storyData.lictor.level).toBeGreaterThanOrEqual(6);
  });
});

describe('weekly influence step', () => {
  it('senator +1 influence every 5 weeks', () => {
    state.player.senator = true;
    state.world.week = 20;
    influenceWeek(state);
    expect(state.player.ludus.influence).toBe(1);
    state.world.week = 21;
    influenceWeek(state);
    expect(state.player.ludus.influence).toBe(1);
  });

  it('Bribe General offers prisoners; a named one only once', () => {
    own('bribeGeneral');
    state.player.toggles.bribeGeneral = true;
    const named = new Map<string, number>();
    for (let w = 1; w <= 120; w++) {
      state.world.week = w;
      state.world.market.creatures = [];
      influenceWeek(state);
      const offered = flushMarketOffers(state);
      expect(offered.length).toBeLessThanOrEqual(1);
      for (const c of offered) {
        expect(state.world.market.creatures).toContain(c);
        expect(c.price).toBeGreaterThan(0);
        if (c.legend) named.set(c.legend, (named.get(c.legend) ?? 0) + 1);
      }
    }
    expect(named.size).toBeGreaterThan(0);
    for (const n of named.values()) expect(n).toBe(1);
    expect(rivalsMock.makeLegend).toHaveBeenCalled();
  });

  it('Socializer ticks rival opinion; completionist with every opportunity', () => {
    own('socializer');
    state.world.week = 21; // 21 % 5 == 1
    influenceWeek(state);
    expect(rivalsMock.changeOpinion).toHaveBeenCalledTimes(state.rivals.length);
    state.player.opportunities = [...ALL_OPPORTUNITIES];
    influenceWeek(state);
    expect(state.pendingAchievements).toContain('completionist');
  });
});
