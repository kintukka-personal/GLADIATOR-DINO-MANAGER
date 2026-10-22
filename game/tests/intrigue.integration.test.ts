// Integration smoke test: the politics systems against the real engine modules (no mocks).
import { describe, it, expect } from 'vitest';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { generateDino } from '../src/engine/creature';
import { planIntrigue, resolveIntrigue, rivalSchemes, resolveDefense } from '../src/engine/intrigue';
import { unlock, startElection, setElectionAction, electionWeek, influenceWeek, treeFor } from '../src/engine/influence';
import {
  hordeWeek, timelineWeek, rebelRaid, resolveRaid, startExpedition, expeditionWeek, resolveExpedition, joinHorde,
} from '../src/engine/horde';
import { aiCheatChoice } from '../src/engine/bribes';
import type { GameState, IntrigueAction } from '../src/engine/types';

function newGame(seed: number): GameState {
  return createNewGame({
    lanista: 'Testus', female: false, heritage: 'roman', hard: false, nightmare: false, sandbox: false,
    raidsDisabled: false, betrayalsDisabled: false, ascension: 0, slot: 0, seed,
  }, emptyMeta());
}

function stock(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    const c = generateDino({ week: 20, level: 4 });
    c.loyalty = 90;
    state.player.ludus.creatures.push(c);
  }
}

function sane(state: GameState): void {
  const me = state.player.ludus;
  for (const h of [me, ...state.rivals]) {
    expect(Number.isFinite(h.denarii)).toBe(true);
    expect(Number.isFinite(h.influence)).toBe(true);
    expect(h.influence).toBeGreaterThanOrEqual(0);
    for (const c of h.creatures) {
      expect(c.loyalty).toBeGreaterThanOrEqual(0);
      expect(c.loyalty).toBeLessThanOrEqual(100);
    }
  }
  expect(Number.isFinite(state.world.horde.spoils)).toBe(true);
  expect(state.world.horde.ferals).toBeGreaterThanOrEqual(0);
}

describe('politics with the real engine', () => {
  it('every intrigue action, including a real raid battle', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = newGame(seed);
      state.world.week = 20;
      state.player.opportunities.push('veilOfNight');
      stock(state, 8);
      const actions: IntrigueAction[] = ['assassinate', 'poison', 'persuade', 'steal', 'sabotage', 'raid'];
      for (const action of actions) {
        const target = state.rivals.find((r) => !r.defeated && r.creatures.length);
        if (!target) break;
        const agent = state.player.ludus.creatures.find((c) => c.kind === 'dino' && !c.inactive && !c.injury && !c.away);
        if (!agent) break;
        const victim = target.creatures.find((c) => c.kind === 'dino') ?? target.creatures[0];
        const o = planIntrigue(state, action, agent.id, target.id, victim.id);
        expect(typeof o).not.toBe('string');
        if (typeof o === 'string') continue;
        const res = resolveIntrigue(state, o.id, 'proceed');
        expect(res.text.length).toBeGreaterThan(0);
        if (action === 'raid' && target.creatures.length) expect(res.battle ?? res.success).toBeTruthy();
        sane(state);
      }
    }
  });

  it('rival schemes resolve against the player', () => {
    const state = newGame(9);
    state.world.week = 30;
    stock(state, 5);
    state.player.ludus.influence = 400;
    for (const r of state.rivals) if (r.ai) r.ai.opinion = -80;
    for (let i = 0; i < 20; i++) {
      state.player.ludus.targetedThisWeek = false;
      for (const r of state.rivals) {
        for (const c of r.creatures) c.inactive = false;
        rivalSchemes(state, r);
      }
      for (const d of [...state.player.defenses]) {
        expect(resolveDefense(state, d.id, i % 2 ? 'assertive' : 'passive').length).toBeGreaterThan(0);
      }
      sane(state);
    }
    expect(state.player.defenses).toHaveLength(0);
  });

  it('a senate campaign and a consulship', () => {
    const state = newGame(4);
    state.unlocks.push('senatorTree');
    const me = state.player.ludus;
    me.influence = 100000;
    me.denarii = 5000;
    for (const def of treeFor(state)[1]) expect(unlock(state, def.id)).toBeNull();
    stock(state, 3);
    expect(startElection(state, 'senate')).toBeNull();
    setElectionAction(state, { smear: true, campaigners: me.creatures.map((c) => c.id) });
    let card = null;
    for (let w = 0; w < 5; w++) {
      influenceWeek(state);
      me.influence += 200;
      card = electionWeek(state);
    }
    expect(card).toMatchObject({ kind: 'election', office: 'senate', won: true });
    expect(me.creatures.every((c) => c.away?.kind !== 'campaign')).toBe(true);
    expect(startElection(state, 'consul')).toBeNull();
    state.player.election!.votes = 95;
    for (let w = 0; w < 5; w++) card = electionWeek(state);
    expect(card).toMatchObject({ office: 'consul', won: true });
    expect(state.player.storyData.lictor).toBeTruthy();
  });

  it('the Horde grows, Spartacus breaks out, raids and an expedition with real battles', () => {
    const state = newGame(11);
    const me = state.player.ludus;
    stock(state, 4);
    me.keepers.unassigned = 12;
    me.denarii = 3000;
    me.influence = 300;
    for (let w = 2; w <= 60; w++) {
      state.world.week = w;
      hordeWeek(state);
      timelineWeek(state);
      sane(state);
    }
    const H = state.world.horde;
    expect(H.rogues.length).toBeGreaterThan(3);
    // Spartacus arrived with a rival; break him out
    const owner = state.rivals.find((r) => r.creatures.some((c) => c.legend === 'spartacus'));
    expect(owner).toBeTruthy();
    const sp = owner!.creatures.find((c) => c.legend === 'spartacus')!;
    joinHorde(state, sp, owner);
    expect(H.spartacusFree).toBe(true);
    expect(H.rogues).toContain(sp);

    // raids until one hits the player, then fight it
    let fought = false;
    for (let i = 0; i < 80 && !fought; i++) {
      H.lastRaidWeek = 0;
      H.lastRaidOnPlayer = 0;
      const d = rebelRaid(state);
      if (d) {
        const res = resolveRaid(state, d, d.options[0].disabled ? 2 : 0);
        expect(res.text.length).toBeGreaterThan(0);
        fought = true;
      }
      sane(state);
    }
    expect(fought).toBe(true);

    // expedition
    H.expeditionsEnabled = true;
    const commander = me.creatures.find((c) => !c.away && !c.injury && c.kind === 'dino');
    if (commander && !me.defeated) {
      state.player.opportunities.push('imperator');
      me.denarii = Math.max(me.denarii, 2000);
      me.influence = Math.max(me.influence, 300);
      me.keepers.unassigned += 6;
      const err = startExpedition(state, { commanderId: commander.id, funds: 500, keepers: 2, capture: true });
      expect(err).toBeNull();
      for (let i = 0; i < 4; i++) expeditionWeek(state);
      const tactics = state.player.storyData.expeditionTactics as string[];
      expect(tactics).toHaveLength(3);
      const res = resolveExpedition(state, tactics[1]);
      expect(res.text.length).toBeGreaterThan(0);
      expect(state.player.expedition).toBeUndefined();
      sane(state);
    }
  });

  it('AI cheat choice runs on real rivals', () => {
    const state = newGame(2);
    state.world.week = 10;
    for (const r of state.rivals) {
      const c = aiCheatChoice(state, r, undefined, 2, 2, r.creatures.slice(0, 2), []);
      expect(c === null || ['poison', 'chains', 'beast', 'guards'].includes(c)).toBe(true);
    }
  });
});
