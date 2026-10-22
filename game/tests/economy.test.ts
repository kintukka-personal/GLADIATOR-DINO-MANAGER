import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({
  hasOpp: vi.fn(() => false),
  publicSessionsIncome: vi.fn(() => 0),
  influenceLoyaltyEffect: vi.fn(() => 0),
}));
vi.mock('../src/engine/horde', () => ({
  joinHorde: vi.fn((state: any, c: any, from: any) => {
    if (from) from.creatures = from.creatures.filter((x: any) => x.id !== c.id);
    state.world.horde.rogues.push(c);
  }),
}));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({ buildSide: vi.fn(), resolveBattle: vi.fn(), applyBattleResult: vi.fn() }));

import * as influence from '../src/engine/influence';
import * as horde from '../src/engine/horde';
import * as objectives from '../src/engine/objectives';
import {
  addInfluence, assignKeepers, betrayalDR, committedSpies, creatureUpkeep, economyWeek, entertainmentInfluence,
  hireKeepers, influenceGain, keeperUpkeep, levelSurcharge, loseKeepers, miningIncome, securityDR, securityTotal,
  weeklyExpenses, weeklyIncome, withinFacilities, projectedBalance,
} from '../src/engine/economy';
import { testState, dino, addTo } from './economy.fixture';

beforeEach(() => {
  vi.mocked(influence.hasOpp).mockReturnValue(false);
  vi.mocked(influence.publicSessionsIncome).mockReturnValue(0);
  vi.mocked(objectives.objectiveEvent).mockClear();
  vi.mocked(horde.joinHorde).mockClear();
});

describe('diminishing-returns tables', () => {
  it('intrigue SDR matches GM examples', () => {
    expect(securityDR(0)).toBe(0);
    expect(securityDR(3)).toBe(3);
    expect(securityDR(10)).toBe(11);
    expect(securityDR(20)).toBe(18);
    expect(securityDR(30)).toBe(22);
    expect(securityDR(50)).toBe(28);
    expect(securityDR(100)).toBe(48);
  });
  it('betrayal SDR bands', () => {
    expect(betrayalDR(4)).toBe(4);
    expect(betrayalDR(9)).toBe(7);
    expect(betrayalDR(29)).toBe(14);
    expect(betrayalDR(49)).toBe(20);
    expect(betrayalDR(99)).toBe(31);
    expect(betrayalDR(100)).toBe(35);
  });
  it('entertainment influence jumps at 100/101', () => {
    expect(entertainmentInfluence(0)).toBe(0);
    expect(entertainmentInfluence(10)).toBe(10);
    expect(entertainmentInfluence(11)).toBe(13);
    expect(entertainmentInfluence(100)).toBe(58);
    expect(entertainmentInfluence(101)).toBe(73);
  });
});

describe('security and spies', () => {
  it('security total = wardens − penalties + buildings, floored at 0', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.wardens = 4;
    h.buildings.residence = 2;
    h.buildings.palisade = 1;
    expect(securityTotal(s, h)).toBe(4 + 2 + 2);
    h.securityPenalties = 20;
    expect(securityTotal(s, h)).toBe(0);
  });
  it('committed spies = last week + guard tower', () => {
    const s = testState();
    const h = s.player.ludus;
    h.spiesLastWeek = 3;
    h.keepers.spies = 9;
    expect(committedSpies(s, h)).toBe(3);
    h.buildings.guardTower = 1;
    expect(committedSpies(s, h)).toBe(4);
  });
});

describe('income', () => {
  it('mining: miners × max(4, efficiency + bonus)', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.miners = 3;
    expect(miningIncome(h)).toBe(30);
    h.buildings.mine = 1;
    expect(miningIncome(h)).toBe(36);
    h.buildings.mine = 2;
    expect(miningIncome(h)).toBe(45);
    h.miningBonus = 1;
    expect(miningIncome(h)).toBe(48);
    h.miningBonus = -20;
    expect(miningIncome(h)).toBe(3 * 6); // clamped to −9 → 15−9
    h.buildings.mine = 0;
    expect(miningIncome(h)).toBe(3 * 4); // floor 4 per miner
  });
  it('senator stipend, estate, loaded dice and positive projected', () => {
    const s = testState();
    const h = s.player.ludus;
    s.player.senator = true;
    h.buildings.residence = 1; // +25
    h.projected = 7;
    h.keepers.showmen = 4;
    h.armory.push({ id: 'dice', type: 'loadedDice', quality: 2 });
    const inc = weeklyIncome(s, h);
    expect(inc.total).toBe(25 + 7 + 4 + 50);
  });
  it('public sessions pay the player only while toggled (AI tourists are paid by rivals.ts)', () => {
    const s = testState();
    vi.mocked(influence.publicSessionsIncome).mockReturnValue(40);
    expect(weeklyIncome(s, s.player.ludus).total).toBe(0);
    s.player.toggles.publicSessions = true;
    expect(weeklyIncome(s, s.player.ludus).total).toBe(40);
    expect(weeklyIncome(s, s.rivals[0]).total).toBe(0);
  });
});

describe('expenses', () => {
  it('keepers: 2 within beds, 4 beyond', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers = { unassigned: 0, miners: 10, showmen: 5, wardens: 5, spies: 0 }; // 20 keepers, 15 beds
    expect(keeperUpkeep(h)).toBe(15 * 2 + 5 * 4);
  });
  it('level surcharge: GM examples L5 9, L8 28, L10 44, L15 84', () => {
    const c = dino();
    for (const [L, v] of [[1, 0], [2, 0], [5, 9], [8, 28], [10, 44], [15, 84]]) {
      c.level = L;
      expect(levelSurcharge(c)).toBe(v);
    }
    const kid = dino('iguanodon', { maturity: 0.6 }); // eqAge 10.8 → kid
    kid.level = 5;
    expect(levelSurcharge(kid)).toBe(3);
  });
  it('creatures: 5 within the 3 base facilities, 10 beyond, babies 1', () => {
    const s = testState();
    const h = s.player.ludus;
    addTo(h, dino(), dino(), dino(), dino());
    expect(creatureUpkeep(h)).toBe(3 * 5 + 10);
    addTo(h, dino('iguanodon', { maturity: 0.05 }));
    expect(creatureUpkeep(h)).toBe(3 * 5 + 10 + 1);
    expect(withinFacilities(h, h.creatures[2])).toBe(true);
    expect(withinFacilities(h, h.creatures[3])).toBe(false);
    h.buildings.trainingField = 1; // +3 facilities
    expect(creatureUpkeep(h)).toBe(4 * 5 + 1);
  });
  it('paid trainers and negative projected are expenses; weapons master needs the upgrade', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.wardens = 0;
    h.training.paid = { bestiarii: true, spartan: true, weapons: true };
    h.projected = -6;
    expect(weeklyExpenses(s, h).total).toBe(-(25 + 35 + 6));
    s.unlocks.push('weaponsMaster');
    expect(weeklyExpenses(s, h).total).toBe(-(25 + 35 + 50 + 6));
  });
});

describe('influence', () => {
  it('Roman heritage +20% on positive gains (AI counts as Roman)', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.showmen = 11; // 13
    h.buildings.residence = 1; // +2
    expect(influenceGain(s, h).total).toBe(15 + 3);
    s.player.heritage = 'greek';
    expect(influenceGain(s, h).total).toBe(15);
    const r = s.rivals[0];
    r.keepers.showmen = 4;
    expect(influenceGain(s, r).total).toBe(4); // 20% of 4 truncates to 0; AI's flat +1 comes from rivals.ts
    r.keepers.showmen = 10;
    expect(influenceGain(s, r).total).toBe(12);
  });
  it('senator, Power Begets Power and Bacchus Patron stack additively', () => {
    const s = testState();
    const h = s.player.ludus;
    s.player.senator = true; // +5 base, +10%
    h.keepers.showmen = 5;
    vi.mocked(influence.hasOpp).mockImplementation((_s, id) => id === 'powerBegetsPower' || id === 'bacchusPatron');
    // base 10: +2 roman, +2 PbP (25% of 10 → 2), +1 bacchus, +1 senator
    expect(addInfluence(s, h, 10)).toBe(16);
    expect(h.influence).toBe(16);
  });
  it('negative changes skip multipliers and floor at 0', () => {
    const s = testState();
    const h = s.player.ludus;
    h.influence = 3;
    expect(addInfluence(s, h, -10)).toBe(-3);
    expect(h.influence).toBe(0);
  });
});

describe('economyWeek', () => {
  it('moves unassigned keepers to wardens and applies the week', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers = { unassigned: 2, miners: 3, showmen: 1, wardens: 1, spies: 0 };
    addTo(h, dino());
    h.denarii = 100;
    economyWeek(s, h);
    expect(h.keepers.unassigned).toBe(0);
    expect(h.keepers.wardens).toBe(3);
    // income 30 mining; expenses 7 keepers × 2 + 5 dino
    expect(h.denarii).toBe(100 + 30 - 14 - 5);
    expect(h.influence).toBe(1); // 1 showman, roman: 1 + 0
    expect(s.report.some((r) => r.kind === 'income' && r.text === 'Mining' && r.amount === 30)).toBe(true);
    expect(projectedBalance(s, h)).toBe(h.denarii + 30 - 19);
  });

  it('small debt: +5 emergency cash and −1 projected forever', () => {
    const s = testState();
    const h = s.player.ludus;
    h.influence = 10;
    h.denarii = -3;
    h.keepers.wardens = 0;
    economyWeek(s, h);
    expect(h.denarii).toBe(2);
    expect(h.projected).toBe(-1);
    expect(h.influence).toBe(9);
    expect(h.bankruptLastWeek).toBe(false);
  });

  it('medium debt: +10, −3 projected', () => {
    const s = testState();
    const h = s.player.ludus;
    h.denarii = -8;
    h.keepers.wardens = 0;
    economyWeek(s, h);
    expect(h.denarii).toBe(2);
    expect(h.projected).toBe(-3);
  });

  it('deep debt: unpaid wages, refund half the upkeep, mining share or loan, bankrupt flag', () => {
    const s = testState();
    const h = s.player.ludus;
    h.influence = 20;
    h.keepers = { unassigned: 0, miners: 0, showmen: 0, wardens: 5, spies: 0 }; // upkeep 10
    addTo(h, dino(), dino()); // upkeep 10
    h.denarii = -100 + 20; // after expenses: −100
    h.miningBonus = 1;
    economyWeek(s, h);
    // −100 → +10 refund → +20 mining share = −70 → still negative
    expect(h.unpaidThisWeek).toBe(true);
    expect(h.miningBonus).toBe(0);
    expect(h.denarii).toBe(-70);
    expect(h.projected).toBe(-2 - 5);
    expect(h.influence).toBe(20 - 1 - 5 - 2);
    expect(h.bankruptLastWeek).toBe(true);
    expect(h.defeated).toBeUndefined();
  });

  it('two bankrupt weeks with no keepers: defeated by debt, dinos go rogue', () => {
    const s = testState();
    const r = s.rivals[0];
    r.keepers = { unassigned: 0, miners: 0, showmen: 0, wardens: 0, spies: 0 };
    addTo(r, dino(), dino());
    r.denarii = -500;
    r.bankruptLastWeek = true;
    economyWeek(s, r);
    expect(r.defeated).toBe('debt');
    expect(r.creatures.length).toBe(0);
    expect(horde.joinHorde).toHaveBeenCalledTimes(2);
    expect(s.world.horde.rogues.length).toBe(2);
  });

  it('second bankrupt week with keepers: sells one, −15 projected, survives if positive', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers = { unassigned: 0, miners: 0, showmen: 0, wardens: 2, spies: 0 };
    h.denarii = -40 + 4; // −40 after keeper upkeep → deep: refund 2, loan +10 → −28 → still negative
    h.bankruptLastWeek = true;
    economyWeek(s, h);
    expect(h.keepers.wardens).toBe(1);
    expect(h.denarii).toBe(-28 + 50);
    expect(h.defeated).toBeUndefined();
    expect(h.projected).toBe(-2 - 3 - 5 - 15);
  });
});

describe('keepers', () => {
  it('lose in GM order and pay 100 when there are none', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers = { unassigned: 1, miners: 1, showmen: 1, wardens: 1, spies: 1 };
    expect(loseKeepers(s, h, 2)).toBe(2);
    expect(h.keepers).toEqual({ unassigned: 0, miners: 1, showmen: 0, wardens: 1, spies: 1 });
    expect(loseKeepers(s, h, 1, 'spies')).toBe(1);
    expect(h.keepers.spies).toBe(0);
    loseKeepers(s, h, 2);
    expect(h.keepers.miners + h.keepers.wardens).toBe(0);
    const before = h.denarii;
    expect(loseKeepers(s, h, 2)).toBe(0);
    expect(h.denarii).toBe(before - 200);
  });
  it('spies need Residence 2', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.unassigned = 3;
    expect(assignKeepers(s, h, 'spies', 1)).toBe(false);
    h.buildings.residence = 2;
    expect(assignKeepers(s, h, 'spies', 1)).toBe(true);
    expect(assignKeepers(s, h, 'miners', 2)).toBe(true);
    expect(assignKeepers(s, h, 'miners', 1, 'wardens')).toBe(true);
    expect(h.keepers).toEqual({ unassigned: 0, miners: 3, showmen: 0, wardens: 0, spies: 1 });
    expect(assignKeepers(s, h, 'miners', -1)).toBe(true);
    expect(h.keepers.unassigned).toBe(1);
  });
  it('hiring creeps the price and fires the objective hook', () => {
    const s = testState(7);
    const h = s.player.ludus;
    s.world.market.keepers = { count: 4, price: 100 };
    h.denarii = 10000;
    expect(hireKeepers(s, 3)).toBeNull();
    expect(h.keepers.unassigned).toBe(3);
    expect(s.world.market.keepers.count).toBe(1);
    expect(s.world.market.keepers.price).toBeGreaterThanOrEqual(100);
    expect((s.world.market.keepers.price - 100) % 20).toBe(0);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'hired');
    expect(hireKeepers(s, 2)).toMatch(/Only 1/);
  });
});
