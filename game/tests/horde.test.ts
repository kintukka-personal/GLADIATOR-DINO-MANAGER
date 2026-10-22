import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./intrigueFixture')).economyMock);
vi.mock('../src/engine/buildings', async () => (await import('./intrigueFixture')).buildingsMock);
vi.mock('../src/engine/rivals', async () => (await import('./intrigueFixture')).rivalsMock);
vi.mock('../src/engine/care', async () => (await import('./intrigueFixture')).careMock);
vi.mock('../src/engine/stories', async () => (await import('./intrigueFixture')).storiesMock);
vi.mock('../src/engine/objectives', async () => (await import('./intrigueFixture')).objectivesMock);
vi.mock('../src/engine/combat', async () => (await import('./intrigueFixture')).combatMock);

import { makeState, dino, addTo, resetMocks, rivalsMock, objectivesMock, combat, makeRival } from './intrigueFixture';
import {
  hordeSize, hordeWeek, timelineWeek, rebelRaid, resolveRaid, joinHorde, expeditionPreview, startExpedition, expeditionWeek,
  resolveExpedition, rebelLeader, raidArmyVsPlayer, hordeIntel,
} from '../src/engine/horde';
import { setSeed } from '../src/engine/rng';
import { makeGear } from '../src/engine/data/gear';
import { hasTrait } from '../src/engine/creature';
import type { Creature, GameState } from '../src/engine/types';

let state: GameState;
beforeEach(() => {
  resetMocks();
  state = makeState({ week: 20 });
});

function rogues(n: number, level = 2): Creature[] {
  const out: Creature[] = [];
  for (let i = 0; i < n; i++) {
    const c = dino(`Rogue${i}`, { str: 6 + level, agi: 6, cun: 5 });
    c.level = level;
    state.world.horde.rogues.push(c);
    out.push(c);
  }
  return out;
}

describe('size and growth (03 §1.3 step 9, 12)', () => {
  it('softens above 50 except on Nightmare', () => {
    state.world.horde.ferals = 40;
    expect(hordeSize(state)).toBe(40);
    state.world.horde.ferals = 100;
    expect(hordeSize(state)).toBe(75);
    state.world.difficulty.nightmare = true;
    expect(hordeSize(state)).toBe(100);
  });

  it('spoils grow by 3 per rogue + ferals/2', () => {
    state.world.week = 22; // no cadence events this week
    rogues(2);
    state.world.horde.ferals = 9;
    hordeWeek(state);
    expect(state.world.horde.spoils).toBe(6 + 4);
  });

  it('a new epic rogue every 7 weeks (5 on hard)', () => {
    state.world.week = 14;
    hordeWeek(state);
    expect(state.world.horde.rogues).toHaveLength(1);
    expect(state.world.horde.rogues[0].epic).toBe(true);
    state = makeState({ week: 15, hard: true });
    hordeWeek(state);
    expect(state.world.horde.rogues).toHaveLength(1);
  });

  it('rogues train every week', () => {
    state.world.week = 22;
    const [r] = rogues(1, 1);
    r.xp = 0;
    hordeWeek(state);
    expect(r.xp).toBeGreaterThanOrEqual(50);
  });

  it('Libertas is forged above 3500 spoils with Spartacus free', () => {
    state.world.week = 22;
    const H = state.world.horde;
    const sp = dino('Spartacus', {}, [], { legend: 'spartacus' });
    H.rogues.push(sp);
    H.spartacusFree = true;
    state.world.flags.spartacusArrived = true;
    H.spoils = 3600;
    hordeWeek(state);
    expect(H.libertasForged).toBe(true);
    const g = H.armory.find((x) => x.unique === 'libertas');
    expect(g).toMatchObject({ type: 'talonBlades', quality: 5, unique: 'libertas' });
    expect(H.spoils).toBe(3600 + 3 - 3000);
    expect(sp.gear.weapon).toBe(g!.id);
    expect(state.player.messages.some((m) => m.sender === 'spy' && /Libertas/.test(m.text))).toBe(true);
  });

  it('spoils above 5000 turn into ferals', () => {
    state.world.week = 22;
    state.world.horde.spoils = 6000;
    hordeWeek(state);
    expect(state.world.horde.spoils).toBe(5800);
    expect(state.world.horde.ferals).toBe(1);
  });

  it('enables expeditions and flags the defeat when the Horde is small after week 32', () => {
    state.world.week = 22;
    rogues(1);
    state.world.horde.ferals = 2;
    hordeWeek(state);
    expect(state.world.horde.expeditionsEnabled).toBe(true);
    expect(state.world.horde.defeated).toBe(false);
    state.world.week = 34;
    hordeWeek(state);
    expect(state.world.horde.defeated).toBe(true);
    expect(state.world.flags.spartacusDefeated).toBe(true);
  });

  it('not defeated while Spartacus runs free', () => {
    state.world.week = 34;
    const H = state.world.horde;
    H.expeditionsEnabled = true;
    H.rogues.push(dino('Spartacus', {}, [], { legend: 'spartacus' }));
    H.spartacusFree = true;
    state.world.flags.spartacusArrived = true;
    hordeWeek(state);
    expect(H.defeated).toBe(false);
  });

  it('a big Horde gives its leader RebelLeader, then RebelGeneral', () => {
    state.world.week = 22;
    const [lead] = rogues(1, 5);
    state.world.horde.ferals = 50;
    hordeWeek(state);
    expect(rebelLeader(state)).toBe(lead);
    expect(hasTrait(lead, 'RebelLeader')).toBe(true);
    state.world.horde.ferals = 400;
    state.world.difficulty.nightmare = true;
    hordeWeek(state);
    expect(hasTrait(lead, 'RebelGeneral')).toBe(true);
    expect(hasTrait(lead, 'RebelLeader')).toBe(false);
  });

  it('spy intel needs 2/3/5 committed spies', () => {
    rogues(1);
    state.world.horde.spoils = 777;
    expect(hordeIntel(state).army).toBeUndefined();
    state.player.ludus.spiesLastWeek = 3;
    expect(hordeIntel(state)).toMatchObject({ army: 1, spoils: 777 });
    expect(hordeIntel(state).leader).toBeUndefined();
    state.player.ludus.spiesLastWeek = 5;
    expect(hordeIntel(state).leader?.name).toBe('Rogue0');
  });
});

describe('Spartacus timeline (03 §1.3 step 14)', () => {
  function batiatus() {
    return state.rivals.find((r) => r.ai?.key === 'batiatus')!;
  }

  it('arrives at Batiatus in week 15, suffers, and the escape story starts at 28', () => {
    const b = batiatus();
    const [other] = addTo(b, dino('Gannicus'));
    state.player.ludus.spiesLastWeek = 2;
    state.world.week = 15;
    timelineWeek(state);
    const sp = b.creatures.find((c) => c.legend === 'spartacus')!;
    expect(sp).toBeTruthy();
    expect(rivalsMock.makeLegend).toHaveBeenCalledWith(state, 'spartacus');
    sp.loyalty = 100;
    state.world.week = 20;
    timelineWeek(state);
    expect(sp.loyalty).toBe(80);
    expect(hasTrait(sp, 'LostFamily')).toBe(true);
    expect(state.player.ludus.influence).toBe(5);
    state.world.week = 28;
    b.influence = 50;
    const denarii = b.denarii;
    timelineWeek(state);
    expect(sp.loyalty).toBe(50);
    expect(other.loyalty).toBe(45);
    expect(b.denarii).toBe(denarii + 600);
    expect(b.influence).toBe(25);
    expect(state.player.stories.spartacusEscape).toBe(1);
    state.world.week = 35;
    timelineWeek(state);
    expect(hasTrait(sp, 'PlottingUprising')).toBe(true);
    expect(sp.loyalty).toBe(30);
    expect(other.loyalty).toBe(30);
  });

  it('hard mode uses weeks 10/18/24/30 and the weakest rival without Batiatus', () => {
    state = makeState({ week: 10, hard: true });
    state.rivals = [makeRival('Magnus', 'magnus'), makeRival('Decimus', 'decimus')];
    state.rivals[0].influence = 30;
    state.rivals[1].influence = 5;
    timelineWeek(state);
    expect(state.rivals[1].creatures.some((c) => c.legend === 'spartacus')).toBe(true);
  });

  it('Caesar arrives in week 25 (Nightmare 12) and Crassus at Nightmare 20', () => {
    state.world.week = 25;
    timelineWeek(state);
    expect(rivalsMock.spawnRival).toHaveBeenCalledWith(state, 'caesar');
    state = makeState({ week: 12, nightmare: true });
    timelineWeek(state);
    expect(rivalsMock.spawnRival).toHaveBeenLastCalledWith(state, 'caesar');
    state.world.week = 20;
    timelineWeek(state);
    expect(rivalsMock.spawnRival).toHaveBeenLastCalledWith(state, 'crassus');
  });

  it('Theokoles joins the strongest rival when it trails the player', () => {
    state.world.week = 60;
    state.player.ludus.influence = 500;
    state.rivals[0].influence = 100;
    state.rivals[0].denarii = 1000;
    for (let i = 0; i < 200 && !state.world.flags.theokoles; i++) timelineWeek(state);
    expect(state.world.flags.theokoles).toBe(state.rivals[0].id);
    expect(state.rivals[0].denarii).toBe(500);
    expect(rivalsMock.makeLegend).toHaveBeenCalledWith(state, 'theokoles');
  });

  it('released dinos come back about 4 % of weeks', () => {
    const freed = dino('Old Champion', {}, ['Loyal']);
    freed.loyalty = 10;
    state.world.released.push(freed);
    let weeks = 0;
    while (state.world.released.length && weeks < 2000) {
      timelineWeek(state);
      weeks++;
    }
    expect(state.world.released).toHaveLength(0);
    expect(freed.loyalty).toBe(100);
    expect(state.world.market.creatures).toContain(freed); // Loyal → offered back to the player
    expect(freed.price).toBeGreaterThan(200);
  });
});

describe('joining the Horde', () => {
  it('moves the creature, applies Escaped once', () => {
    const me = state.player.ludus;
    const [c] = addTo(me, dino('Runner'));
    c.fame = 10;
    joinHorde(state, c, me);
    expect(me.creatures).not.toContain(c);
    expect(state.world.horde.rogues).toContain(c);
    expect(hasTrait(c, 'Escaped')).toBe(true);
    expect(c.fame).toBe(15);
    expect(c.loyalty).toBe(30);
    joinHorde(state, c);
    expect(state.world.horde.rogues.filter((x) => x === c)).toHaveLength(1);
    expect(c.fame).toBe(15);
  });

  it('Spartacus escaping with the escape story at 4 hands the player Batiatus loot', () => {
    state.world.week = 40;
    const b = state.rivals[0];
    b.keepers.unassigned = 5;
    const sword = makeGear('talonBlades', 3, 'bsword');
    const hide = makeGear('studdedBarding', 2, 'bhide');
    b.armory.push(sword, hide);
    const [sp] = addTo(b, dino('Spartacus', {}, [], { legend: 'spartacus' }));
    sp.gear.weapon = sword.id;
    state.player.stories.spartacusEscape = 4;
    joinHorde(state, sp, b);
    const H = state.world.horde;
    expect(H.spartacusFree).toBe(true);
    expect(H.ferals).toBe(4 + 5);
    expect(H.spoils).toBe(500);
    expect(b.keepers.unassigned).toBe(3);
    expect(state.player.stories.spartacusEscape).toBe(6);
    expect(state.player.ludus.armory.map((g) => g.id).sort()).toEqual(['bhide', 'bsword']);
    expect(b.armory).toHaveLength(0);
  });
});

describe('rebel raids (05 §6, 04 §9.3)', () => {
  it('no raids when disabled or the Horde is tiny', () => {
    state.world.difficulty.raidsDisabled = true;
    rogues(3);
    expect(rebelRaid(state)).toBeNull();
    state.world.difficulty.raidsDisabled = false;
    state.world.horde.rogues = [];
    state.world.horde.ferals = 1;
    expect(rebelRaid(state)).toBeNull();
  });

  it('a raid on the player is a three-option decision with the GM numbers', () => {
    const me = state.player.ludus;
    addTo(me, dino('Champ'));
    rogues(2);
    state.world.horde.ferals = 8;
    state.world.week = 30;
    let d = null;
    for (let i = 0; i < 200 && !d; i++) {
      state.world.horde.lastRaidOnPlayer = 0;
      d = rebelRaid(state);
    }
    expect(d).toBeTruthy();
    expect(d!.key).toBe('rebelRaid');
    expect(d!.options).toHaveLength(3);
    // army 10, cost 25 × 10 scaled by (100 − 20)% = 200, S = 0 → not halved
    expect(d!.data.army).toBe(10);
    expect(d!.data.cost).toBe(200);
    expect(d!.data.hide).toBe(150); // 15 × army without a palisade
    expect(state.world.horde.lastRaidOnPlayer).toBe(30);
  });

  it('raids on rivals resolve at once and can ransack a house', () => {
    rogues(5);
    state.world.horde.ferals = 40;
    state.world.horde.lastRaidOnPlayer = 30;
    state.world.week = 30;
    const r = state.rivals[0];
    state.rivals = [r];
    r.denarii = 0;
    let hit = false;
    for (let i = 0; i < 50 && !hit; i++) {
      state.world.horde.lastRaidWeek = 0;
      const d = rebelRaid(state);
      expect(d).toBeNull();
      hit = state.player.messages.some((m) => m.title.includes('attacked by escaped dinos'));
    }
    expect(hit).toBe(true);
    expect(r.defeated).toBe('horde'); // no creatures, no keepers
  });

  it('a pact ally is spared and a bounty redirects the raid', () => {
    rogues(5);
    state.world.week = 30;
    state.world.horde.lastRaidOnPlayer = 30;
    const [a, b] = state.rivals;
    a.ai!.pact = true;
    addTo(b, dino('B1'), dino('B2'));
    b.keepers.wardens = 0;
    for (let i = 0; i < 30; i++) {
      state.world.horde.lastRaidWeek = 0;
      rebelRaid(state);
    }
    expect(state.player.messages.some((m) => m.title.startsWith(a.name))).toBe(false);
    state.world.horde.bountyTarget = a.id;
    state.world.horde.lastRaidWeek = 0;
    rebelRaid(state);
    expect(state.player.messages.some((m) => m.title.startsWith(a.name))).toBe(true);
    expect(state.world.horde.bountyTarget).toBeUndefined();
  });

  it('paying off and hiding', () => {
    const me = state.player.ludus;
    addTo(me, dino('Champ'));
    me.influence = 20;
    const dec = { id: 'd', key: 'rebelRaid', title: '', text: '', options: [], week: 30, data: { army: 10, danger: 5, cost: 200, hide: 150, short: true } };
    let res = resolveRaid(state, dec, 1);
    expect(me.denarii).toBe(800);
    expect(state.world.horde.spoils).toBe(200);
    res = resolveRaid(state, dec, 2);
    expect(me.influence).toBe(15);
    expect(me.denarii).toBe(650);
    expect(res.text).toMatch(/plundered 150/);
  });

  it('fighting: a win earns respect, a loss costs the palisade and keepers', () => {
    const me = state.player.ludus;
    const [champ] = addTo(me, dino('Champ'));
    champ.fame = 100;
    rogues(2);
    me.keepers.unassigned = 10;
    me.buildings.palisade = 1;
    const dec = { id: 'd', key: 'rebelRaid', title: '', text: '', options: [], week: 30, data: { army: 20, danger: 15, extra: 2 } };
    combat.winner = 0;
    const win = resolveRaid(state, dec, 0);
    expect(win.battle).toBeDefined();
    expect(rivalsMock.changeOpinion).toHaveBeenCalledTimes(state.rivals.length);
    combat.winner = 1;
    resolveRaid(state, dec, 0);
    expect(me.buildings.palisade).toBe(0);
    expect(me.keepers.unassigned).toBeLessThan(10);
  });

  it('the raid army vs the player is size/2 + 15 above 30, −1/8 with Informants', () => {
    state.world.horde.ferals = 40;
    expect(raidArmyVsPlayer(state)).toBe(35);
    state.player.opportunities.push('informants');
    expect(raidArmyVsPlayer(state)).toBe(31);
  });
});

describe('expeditions (04 §8)', () => {
  function ready(): Creature {
    const me = state.player.ludus;
    const [cmd] = addTo(me, dino('Legate', { str: 10, cun: 10 }));
    me.influence = 150;
    me.keepers.unassigned = 10;
    state.world.week = 45;
    state.world.horde.expeditionsEnabled = true;
    rogues(3);
    state.world.horde.ferals = 20;
    return cmd;
  }

  it('Senate approval rules and the militia formula', () => {
    const me = state.player.ludus;
    const [cmd] = addTo(me, dino('Legate'));
    expect(expeditionPreview(state, { commanderId: cmd.id, funds: 400, keepers: 0 }).ok).toMatch(/no rebellion/);
    state.world.horde.expeditionsEnabled = true;
    state.world.horde.ferals = 3;
    expect(expeditionPreview(state, { commanderId: cmd.id, funds: 400, keepers: 0 }).ok).toMatch(/Senate refuses/);
    state.world.week = 45;
    expect(expeditionPreview(state, { commanderId: cmd.id, funds: 400, keepers: 0 }).ok).toMatch(/100 influence/);
    me.influence = 100;
    expect(expeditionPreview(state, { commanderId: cmd.id, funds: 100, keepers: 0 }).ok).toMatch(/200/);
    me.keepers.unassigned = 10;
    const p = expeditionPreview(state, { commanderId: cmd.id, funds: 400, keepers: 5 });
    expect(p.ok).toBeNull();
    // 10 + 0 + 0 + 3/10 + 400/40 + 15 = 35
    expect(p.militia).toBe(35);
    expect(p.label).toBe('Extermination');
    state.player.opportunities.push('imperator', 'bribeGeneral');
    state.player.senator = true;
    expect(expeditionPreview(state, { commanderId: cmd.id, funds: 400, keepers: 5 }).militia).toBe(180);
  });

  it('marches, finds the Horde, and a victory pays off', () => {
    const me = state.player.ludus;
    const cmd = ready();
    me.denarii = 1000;
    state.world.horde.spoils = 1000;
    expect(startExpedition(state, { commanderId: cmd.id, funds: 500, keepers: 5, capture: false })).toBeNull();
    expect(me.denarii).toBe(500);
    expect(cmd.away?.kind).toBe('expedition');
    expect(me.keepers.unassigned).toBe(5);
    for (let i = 0; i < 2; i++) expeditionWeek(state);
    expect(state.player.storyData.expeditionTactics).toBeUndefined();
    expeditionWeek(state);
    const tactics = state.player.storyData.expeditionTactics as string[];
    expect(tactics).toHaveLength(3);
    combat.winner = 0;
    const res = resolveExpedition(state, tactics[0]);
    // militia 10 + 2 + 12 + 15 = 39 vs army 23: base .63 + .2 ≥ .53 → victory whatever the tactic
    expect(res.victory).toBe(true);
    expect(state.pendingAchievements).toContain('imperator');
    expect(objectivesMock.objectiveEvent).toHaveBeenCalledWith(state, 'expedition');
    expect(hasTrait(cmd, 'RebelSlayer')).toBe(true);
    expect(cmd.away).toBeUndefined();
    expect(me.keepers.unassigned).toBe(10);
    expect(me.denarii).toBeGreaterThan(500);
    expect(state.player.expedition).toBeUndefined();
  });

  it('killing Spartacus on an expedition is History Repeats', () => {
    const cmd = ready();
    const sp = dino('Spartacus', {}, [], { legend: 'spartacus' });
    sp.level = 9;
    state.world.horde.rogues.push(sp);
    state.world.horde.spartacusFree = true;
    startExpedition(state, { commanderId: cmd.id, funds: 400, keepers: 5, capture: false });
    for (let i = 0; i < 3; i++) expeditionWeek(state);
    combat.winner = 0;
    combat.kill = new Set([sp.id]);
    const res = resolveExpedition(state, (state.player.storyData.expeditionTactics as string[])[0]);
    expect(res.victory).toBe(true);
    expect(state.world.horde.spartacusDead).toBe(true);
    expect(state.world.horde.rogues).not.toContain(sp);
    expect(state.pendingAchievements).toContain('dejavu');
  });

  it('capture mode brings back a Recaptured rebel', () => {
    setSeed(3);
    const cmd = ready();
    rogues(6, 1);
    state.world.horde.ferals = 0;
    state.player.opportunities.push('imperator');
    startExpedition(state, { commanderId: cmd.id, funds: 1000 - 0, keepers: 5, capture: true });
    for (let i = 0; i < 3; i++) expeditionWeek(state);
    combat.winner = 0;
    const res = resolveExpedition(state, 'sendScouts');
    expect(res.victory).toBe(true);
    const back = state.player.ludus.creatures.filter((c) => hasTrait(c, 'Recaptured'));
    expect(back.length).toBe(1);
  });

  it('a defeat costs influence and fame', () => {
    const me = state.player.ludus;
    const cmd = ready();
    cmd.fame = 80;
    state.world.horde.ferals = 300;
    state.world.difficulty.nightmare = true; // no softening: army 303
    startExpedition(state, { commanderId: cmd.id, funds: 200, keepers: 0, capture: false });
    for (let i = 0; i < 3; i++) expeditionWeek(state);
    combat.winner = 1;
    const res = resolveExpedition(state, 'splitForces');
    expect(res.victory).toBe(false);
    expect(me.influence).toBeLessThanOrEqual(125);
    if (me.creatures.includes(cmd)) expect(cmd.fame).toBe(30);
    else expect(state.world.horde.rogues).toContain(cmd);
  });
});
