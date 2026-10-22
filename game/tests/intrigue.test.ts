import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./intrigueFixture')).economyMock);
vi.mock('../src/engine/buildings', async () => (await import('./intrigueFixture')).buildingsMock);
vi.mock('../src/engine/rivals', async () => (await import('./intrigueFixture')).rivalsMock);
vi.mock('../src/engine/care', async () => (await import('./intrigueFixture')).careMock);
vi.mock('../src/engine/stories', async () => (await import('./intrigueFixture')).storiesMock);
vi.mock('../src/engine/objectives', async () => (await import('./intrigueFixture')).objectivesMock);
vi.mock('../src/engine/combat', async () => (await import('./intrigueFixture')).combatMock);

import {
  makeState, dino, addTo, resetMocks, economyMock, rivalsMock, storiesMock, objectivesMock, combat, buried, makeRival,
} from './intrigueFixture';
import {
  SCENARIOS, DEFENSE_PROMPTS, availableAgents, planIntrigue, resolveIntrigue, intrigueChance, assassinationChance,
  poisonChance, stealChance, sabotageChance, persuasionChance, rivalSchemes, resolveDefense, spyBonus, standardPenalties,
  globalBonus, defensePromptText,
} from '../src/engine/intrigue';
import { setSeed } from '../src/engine/rng';
import { makeGear } from '../src/engine/data/gear';
import type { GameState, IntrigueOrder, PendingDefense } from '../src/engine/types';

let state: GameState;
beforeEach(() => {
  resetMocks();
  state = makeState({ week: 20 });
});

const order = (o: IntrigueOrder | string): IntrigueOrder => {
  if (typeof o === 'string') throw new Error(o);
  return o;
};

describe('tables', () => {
  it('has the nine GM scenarios and eight defender prompts', () => {
    expect(SCENARIOS.map((s) => s.key)).toEqual([
      'dark_night', 'raven_flying_left', 'goat_sacrificed', 'party_ongoing', 'sprained_ankle',
      'everything_going_as_planned', 'agent_paranoid', 'agent_spots_loot', 'agent_spots_bystanders',
    ]);
    expect(DEFENSE_PROMPTS).toHaveLength(8);
    for (const p of DEFENSE_PROMPTS) expect(p.assertive && p.passive && p.text).toBeTruthy();
  });
});

describe('agents and planning', () => {
  it('lists only fit, active, home dinos', () => {
    const me = state.player.ludus;
    const [a, b, c, d] = addTo(me, dino('A'), dino('B'), dino('C'), dino('D'));
    b.inactive = true;
    c.injury = { type: 'flesh', weeks: 2 };
    d.away = { kind: 'adventure', weeksLeft: 2 };
    expect(availableAgents(state)).toEqual([a]);
  });

  it('validates and marks the agent inactive with a rolled scenario', () => {
    const me = state.player.ludus;
    const [agent] = addTo(me, dino('Agent'));
    const r = state.rivals[0];
    const [t] = addTo(r, dino('Target'));
    expect(typeof planIntrigue(state, 'poison', 'nope', r.id, t.id)).toBe('string');
    expect(typeof planIntrigue(state, 'poison', agent.id, r.id)).toBe('string'); // no target creature
    expect(typeof planIntrigue(state, 'raid', agent.id, r.id)).toBe('string'); // needs Veil of Night
    const o = order(planIntrigue(state, 'poison', agent.id, r.id, t.id));
    expect(agent.inactive).toBe(true);
    expect(o.scenario).toBeGreaterThanOrEqual(0);
    expect(o.scenario).toBeLessThan(8);
    expect(state.player.intrigue).toContain(o);
    expect(typeof planIntrigue(state, 'steal', agent.id, r.id)).toBe('string'); // already used
  });

  it('only sabotage can roll the bystanders scenario', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const [a] = addTo(me, dino(`S${i}`));
      seen.add(order(planIntrigue(state, 'sabotage', a.id, r.id)).scenario);
      const [b] = addTo(me, dino(`T${i}`));
      expect(order(planIntrigue(state, 'steal', b.id, r.id)).scenario).toBeLessThan(8);
    }
    expect(seen.has(8)).toBe(true);
  });
});

describe('chance formulas (05 §1.2–1.8)', () => {
  it('assassination: best gap + average gap, ×4, clamps', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const agent = dino('Agent', { str: 10, agi: 8, cun: 8 });
    const target = dino('Target', { str: 6, agi: 5, cun: 4 });
    addTo(me, agent);
    addTo(r, target);
    // dS 4, dC 4, dI 3 → best 4 + 11/3 = 7; x = 7 → 15 + 28 = 43
    expect(assassinationChance(state, me, r, agent, target)).toBe(43);
    target.loyalty = 40; // +5
    expect(assassinationChance(state, me, r, agent, target)).toBe(63);
    target.loyalty = 5; // +15 (GM quirk fixed: was +10)
    expect(assassinationChance(state, me, r, agent, target)).toBe(99);
    target.loyalty = 80;
    r.keepers.wardens = 30; // SDR(30) = 22 → x ≤ 0 → 15
    expect(assassinationChance(state, me, r, agent, target)).toBe(15);
    expect(intrigueChance(state, 'assassinate', agent, r, target)).toBe(15);
  });

  it('Stealthy camouflage hide and hunter hood add +5 each', () => {
    const me = state.player.ludus;
    const agent = dino('Agent');
    addTo(me, agent);
    const hide = makeGear('camoHide', 2, 'g1');
    const hood = makeGear('huntersHood', 2, 'g2');
    me.armory.push(hide, hood);
    expect(globalBonus(me, agent)).toBe(0);
    agent.gear.armor = hide.id;
    expect(globalBonus(me, agent)).toBe(5);
    agent.gear.helmet = hood.id;
    expect(globalBonus(me, agent)).toBe(10);
  });

  it('spy bonus and standard penalties', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    me.spiesLastWeek = 3;
    r.spiesLastWeek = 1;
    expect(spyBonus(state, me, r)).toBe(5);
    me.spiesLastWeek = 20;
    expect(spyBonus(state, me, r)).toBe(15);
    const t = dino('T', {}, ['Paranoid']);
    addTo(r, t);
    expect(standardPenalties(state, me, r, 'poison', t)).toBe(5);
    state.player.opportunities.push('informants');
    expect(standardPenalties(state, me, r, 'poison', t)).toBe(0);
    t.spyFor = me.id; // a turned spy in their house helps us
    expect(standardPenalties(state, me, r, 'poison', t)).toBe(-5);
    state.world.ascension = 11; // Minerva +10, Mars +5 (not for persuasion)
    expect(standardPenalties(state, me, r, 'poison', t)).toBe(10);
    expect(standardPenalties(state, me, r, 'persuade', t)).toBe(5);
  });

  it('poison follows the GM formula with walls and antivenom-resistance', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const agent = dino('Agent', { cun: 12 });
    const target = dino('Target', { cun: 4, hp: 30 });
    addTo(me, agent);
    addTo(r, target);
    // inner = 36 − (3 + 2) − 0 = 31; x = 31 − 5 = 26 → 78 + 30 − 1 (cun/4) = 107 → diminish −5 = 102 → 99
    expect(poisonChance(state, me, r, agent, target)).toBe(99);
    const weak = dino('Weak', { cun: 3 });
    addTo(me, weak);
    // inner = 9 − 5 = 4; x = −1 → 0 + 30 − 1 = 29
    expect(poisonChance(state, me, r, weak, target)).toBe(29);
    r.buildings.palisade = 2;
    expect(poisonChance(state, me, r, weak, target)).toBe(23);
  });

  it('steal wealth tiers include the GM-unreachable >500 tier', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const agent = dino('Agent', { agi: 4, cun: 4 });
    addTo(me, agent);
    r.denarii = 400;
    const a = stealChance(state, me, r, agent);
    r.denarii = 600;
    const b = stealChance(state, me, r, agent);
    expect(b - a).toBe(4); // +7 vs +3
    r.denarii = 50;
    expect(stealChance(state, me, r, agent)).toBeLessThan(a);
  });

  it('sabotage gets easier against bigger estates', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const agent = dino('Agent', { str: 12, agi: 12, cun: 12 });
    addTo(me, agent);
    const small = sabotageChance(state, me, r, agent);
    expect(small).toBe(32); // x = (12 + 12)/2 − 10 = 2 → 2 + 30
    r.buildings.residence = 3;
    r.buildings.mine = 2;
    expect(sabotageChance(state, me, r, agent)).toBe(small + 15);
  });

  it('persuasion trait modifiers', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const agent = dino('Agent', { cun: 8 });
    const target = dino('Target', { cun: 6 });
    addTo(me, agent);
    addTo(r, target);
    // x = 24 − 12 − 0 = 12 → 24 + 25 = 49
    expect(persuasionChance(state, me, r, agent, target)).toBe(49);
    const fan = dino('Fan', { cun: 6 }, ['Fanatic']);
    addTo(r, fan);
    expect(persuasionChance(state, me, r, agent, fan)).toBe(44);
  });
});

describe('resolving player actions', () => {
  it('retreat gives 15 XP and costs no opinion', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const [agent] = addTo(me, dino('Agent'));
    const o = order(planIntrigue(state, 'steal', agent.id, r.id));
    const res = resolveIntrigue(state, o.id, 'retreat');
    expect(res.success).toBe(false);
    expect(agent.xp).toBeGreaterThan(0);
    expect(rivalsMock.changeOpinion).not.toHaveBeenCalled();
    expect(o.resolved).toBe(true);
    expect(resolveIntrigue(state, o.id, 'proceed').success).toBe(false);
  });

  it('proceeding costs opinion once and calls the story hook', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const [agent] = addTo(me, dino('Agent'));
    const o = order(planIntrigue(state, 'sabotage', agent.id, r.id));
    o.scenario = 5;
    const res = resolveIntrigue(state, o.id, 'proceed');
    expect(rivalsMock.changeOpinion).toHaveBeenCalledTimes(1);
    const delta = rivalsMock.changeOpinion.mock.calls[0][2] as number;
    expect(delta).toBeLessThanOrEqual(-3);
    expect(storiesMock.storyHook).toHaveBeenCalledWith(state, 'intrigue', expect.objectContaining({ action: 'sabotage', targetHouseId: r.id, success: res.success }));
    expect(res.text.length).toBeGreaterThan(10);
  });

  it('the goat costs exactly 50 denarii', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    r.denarii = 0;
    const [agent] = addTo(me, dino('Agent', { cun: 1, agi: 1 }));
    const o = order(planIntrigue(state, 'persuade', agent.id, r.id, addTo(r, dino('T'))[0].id));
    o.scenario = 2;
    const before = me.denarii;
    resolveIntrigue(state, o.id, 'proceed');
    expect(me.denarii).toBe(before - 50);
  });

  it('a strong poisoner succeeds; a kill grants the assassin achievement and the poison objective', () => {
    let kills = 0;
    for (let seed = 1; seed < 60; seed++) {
      resetMocks();
      state = makeState({ week: 20, seed });
      const me = state.player.ludus;
      const r = state.rivals[0];
      const [agent] = addTo(me, dino('Agent', { cun: 14 }));
      const [t] = addTo(r, dino('Gigantus', { cun: 2 }, [], { legend: 'gigantus' }));
      const o = order(planIntrigue(state, 'poison', agent.id, r.id, t.id));
      o.scenario = 0; // dark night: +5..+19 → always ≥ 100
      const res = resolveIntrigue(state, o.id, 'proceed');
      expect(res.success).toBe(true);
      expect(objectivesMock.objectiveEvent).toHaveBeenCalledWith(state, 'poison:gigantus');
      if (!r.creatures.includes(t)) {
        kills++;
        expect(state.pendingAchievements).toContain('assassin');
        expect(buried.some((b) => b.name === 'Gigantus')).toBe(true);
      } else {
        expect(t.ill).toBeGreaterThanOrEqual(2);
        expect(state.pendingAchievements).not.toContain('assassin');
      }
    }
    expect(kills).toBeGreaterThan(0);
  });

  it('antivenom foils a poisoning and is consumed', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const [agent] = addTo(me, dino('Agent', { cun: 14 }));
    const [t] = addTo(r, dino('Target', { cun: 2 }));
    const anti = makeGear('antivenom', 2, 'anti1');
    r.armory.push(anti);
    t.gear.item = anti.id;
    const o = order(planIntrigue(state, 'poison', agent.id, r.id, t.id));
    o.scenario = 0;
    resolveIntrigue(state, o.id, 'proceed');
    expect(r.creatures).toContain(t);
    expect(t.ill).toBe(0);
    expect(r.armory.find((g) => g.id === 'anti1')).toBeUndefined();
  });

  it('successful persuasion drops tameness and can turn a spy for the player', () => {
    let turned = 0;
    for (let seed = 1; seed < 80; seed++) {
      resetMocks();
      state = makeState({ week: 20, seed });
      const me = state.player.ludus;
      const r = state.rivals[0];
      const [agent] = addTo(me, dino('Agent', { cun: 16 }));
      const [t] = addTo(r, dino('Target', { cun: 2 }, ['Untrustworthy']));
      t.loyalty = 40;
      const o = order(planIntrigue(state, 'persuade', agent.id, r.id, t.id));
      o.scenario = 0;
      const res = resolveIntrigue(state, o.id, 'proceed');
      expect(res.success).toBe(true);
      expect([5, 20]).toContain(t.loyalty);
      if (t.spyFor === me.id) turned++;
    }
    expect(turned).toBeGreaterThan(0);
  });

  it('steal moves denarii and AI miners to security', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    r.denarii = 4000;
    r.keepers.miners = 3;
    const [agent] = addTo(me, dino('Agent', { agi: 15, cun: 15 }, ['Thief']));
    const o = order(planIntrigue(state, 'steal', agent.id, r.id));
    o.scenario = 0;
    const before = me.denarii;
    const res = resolveIntrigue(state, o.id, 'proceed');
    if (res.success) {
      expect(r.keepers.wardens).toBe(2);
      expect(objectivesMock.objectiveEvent).toHaveBeenCalledWith(state, 'steal');
      expect(me.denarii + me.armory.length).toBeGreaterThan(before);
    }
  });
});

describe('raids (Veil of Night)', () => {
  it('a won raid strips the rival and can destroy a weak house', () => {
    const me = state.player.ludus;
    state.player.opportunities.push('veilOfNight');
    const r = state.rivals[0];
    r.denarii = 400;
    r.keepers.unassigned = 2;
    const [def1] = addTo(r, dino('Defender'));
    const [a, b] = addTo(me, dino('Leader'), dino('Second'));
    b.fame = 50;
    combat.winner = 0;
    const o = order(planIntrigue(state, 'raid', a.id, r.id));
    const res = resolveIntrigue(state, o.id, 'proceed');
    expect(res.battle).toBeDefined();
    expect(res.success).toBe(true);
    expect(b.inactive).toBe(true);
    expect(def1.loyalty).toBe(55);
    expect(me.influence).toBe(10);
    // 1 defender left (< 3 present), but it is healthy: house survives, loses a quarter
    expect(r.defeated).toBeUndefined();
    const sideB = (rivalsMock.changeOpinion.mock.calls.at(-1)?.[2] as number);
    expect(sideB).toBeLessThanOrEqual(-14);
  });

  it('an empty house is a bonus win and a broke one is wiped out', () => {
    const me = state.player.ludus;
    state.player.opportunities.push('veilOfNight');
    const r = state.rivals[0];
    r.denarii = 100;
    r.armory.push(makeGear('talonBlades', 2, 'loot1'));
    const [a] = addTo(me, dino('Leader'));
    const o = order(planIntrigue(state, 'raid', a.id, r.id));
    const res = resolveIntrigue(state, o.id, 'proceed');
    expect(res.battle).toBeUndefined();
    expect(res.success).toBe(true);
    expect(r.defeated).toBe('raid');
    expect(me.armory.some((g) => g.id === 'loot1')).toBe(true);
  });

  it('a lost raid hurts tameness and influence', () => {
    const me = state.player.ludus;
    me.influence = 50;
    state.player.opportunities.push('veilOfNight');
    const r = state.rivals[0];
    addTo(r, dino('Defender'));
    const [a, b] = addTo(me, dino('Leader'), dino('Second'));
    combat.winner = 1;
    const o = order(planIntrigue(state, 'raid', a.id, r.id));
    const res = resolveIntrigue(state, o.id, 'proceed');
    expect(res.success).toBe(false);
    expect(me.influence).toBe(35);
    expect(a.loyalty).toBe(55);
    expect(b.loyalty).toBe(55);
  });
});

describe('rival schemes and the defender prompt', () => {
  it('a friendly rival never schemes early in the game', () => {
    state.world.week = 3;
    const r = state.rivals[0];
    r.ai!.opinion = 100;
    addTo(r, dino('R1'), dino('R2'), dino('R3'));
    addTo(state.player.ludus, dino('P1'), dino('P2'), dino('P3'));
    for (let i = 0; i < 200; i++) rivalSchemes(state, r);
    expect(state.player.defenses).toHaveLength(0);
  });

  it('a sworn enemy schemes and queues valid prompts', () => {
    const me = state.player.ludus;
    me.influence = 500;
    const r = state.rivals[0];
    r.ai!.opinion = -60;
    addTo(r, dino('Knife', { str: 12, agi: 12, cun: 12 }), dino('R2'), dino('R3'));
    addTo(me, dino('P1', { str: 3, agi: 3, cun: 3 }), dino('P2', { str: 3, agi: 3, cun: 3 }), dino('P3', { str: 3, agi: 3, cun: 3 }));
    for (let i = 0; i < 60; i++) {
      me.targetedThisWeek = false;
      for (const c of r.creatures) c.inactive = false;
      rivalSchemes(state, r);
    }
    expect(state.player.defenses.length).toBeGreaterThan(0);
    for (const d of state.player.defenses) {
      expect(d.rivalId).toBe(r.id);
      expect(d.prompt).toBeGreaterThanOrEqual(0);
      expect(d.prompt).toBeLessThan(8);
      if (d.prompt === 0) expect(state.player.ludus.spiesLastWeek).toBeGreaterThan(0);
      expect(defensePromptText(state, d).text).not.toContain('%s');
    }
  });

  it('defence resolution reads the defending player\'s real security (assassination bug fixed)', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const [agent] = addTo(r, dino('Knife'));
    const [t] = addTo(me, dino('Victim'));
    me.keepers.wardens = 40;
    const d: PendingDefense = { id: 'd1', rivalId: r.id, action: 'assassinate', agentId: agent.id, targetCreatureId: t.id, prompt: 3, chance: 50 };
    state.player.defenses.push(d);
    economyMock.securityTotal.mockClear();
    const text = resolveDefense(state, 'd1', 'passive');
    expect(text.length).toBeGreaterThan(10);
    expect(economyMock.securityTotal.mock.calls.some((c) => c[1] === me)).toBe(true);
    expect(economyMock.securityTotal.mock.calls.some((c) => c[1] === r)).toBe(false);
    expect(state.player.defenses).toHaveLength(0);
  });

  it('night guards really cost 50; the senator favour changes influence once', () => {
    const me = state.player.ludus;
    const r = state.rivals[0];
    const [agent] = addTo(r, dino('Thief'));
    me.denarii = 1000;
    me.influence = 100;
    state.player.defenses.push({ id: 'a', rivalId: r.id, action: 'steal', agentId: agent.id, prompt: 0, chance: 50 });
    resolveDefense(state, 'a', 'assertive');
    expect(me.denarii).toBeLessThanOrEqual(950);
    const before = me.influence;
    state.player.defenses.push({ id: 'b', rivalId: r.id, action: 'sabotage', agentId: agent.id, prompt: 2, chance: 50 });
    resolveDefense(state, 'b', 'assertive');
    expect(me.influence).toBe(before + 10);
  });

  it('a rival plot against a vanished target fizzles', () => {
    const r = makeRival('Ghost', 'magnus');
    state.rivals.push(r);
    const [agent] = addTo(r, dino('Knife'));
    state.player.defenses.push({ id: 'x', rivalId: r.id, action: 'poison', agentId: agent.id, targetCreatureId: 'gone', prompt: 3, chance: 50 });
    expect(resolveDefense(state, 'x', 'passive')).toMatch(/Nothing happened/);
  });

  it('a discovered rival agent is recorded as caught', () => {
    let caught = 0;
    for (let seed = 1; seed < 80; seed++) {
      setSeed(seed);
      state = makeState({ week: 20, seed });
      const me = state.player.ludus;
      me.spiesLastWeek = 20; // D = 40 − 0 → detection likely
      const r = state.rivals[0];
      const [agent] = addTo(r, dino('Arsonist'));
      state.player.defenses.push({ id: 's', rivalId: r.id, action: 'sabotage', agentId: agent.id, prompt: 3, chance: 50 });
      resolveDefense(state, 's', 'passive');
      if (me.caught.includes(agent.id)) caught++;
    }
    expect(caught).toBeGreaterThan(40);
  });
});
