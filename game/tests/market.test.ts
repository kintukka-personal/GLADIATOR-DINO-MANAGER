import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
vi.mock('../src/engine/horde', () => ({ joinHorde: vi.fn() }));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({ buildSide: vi.fn(), resolveBattle: vi.fn(), applyBattleResult: vi.fn() }));

import * as objectives from '../src/engine/objectives';
import * as influence from '../src/engine/influence';
import {
  acceptTransfer, buyCreature, buyEgg, buyFood, buyFromMerchant, buyGear, compressedWeek, generateMarketDinos, intel,
  isLocked, marketCreaturePrice, offerToRival, regenerateMarkets, rivalAskingPrice, rivalItemWant, rollMerchant,
  seedStarterMarket, sellCreature, sellEgg, sellGear,
} from '../src/engine/market';
import { GEAR, gearWorth, makeGear } from '../src/engine/data/gear';
import { FOODS, FOOD_IDS } from '../src/engine/data/food';
import { getStat, generateBeast, salePrice, rawStat } from '../src/engine/creature';
import { testState, dino, addTo } from './economy.fixture';

beforeEach(() => {
  vi.mocked(objectives.objectiveEvent).mockClear();
  vi.mocked(influence.hasOpp).mockReturnValue(false);
});

describe('week-1 market', () => {
  it('offers the three starters at fixed prices, Aello and two more dinos', () => {
    const s = testState();
    seedStarterMarket(s);
    const m = s.world.market;
    const by = (n: string) => m.creatures.find((c) => c.name === n)!;
    const t = by('Tetraites');
    expect([t.species, rawStat(t, 'str'), rawStat(t, 'cun'), rawStat(t, 'agi'), rawStat(t, 'hp')]).toEqual(['carnotaurus', 8, 5, 5, 30]);
    expect(t.traits).toEqual(['Agile']);
    expect(marketCreaturePrice(s, t)).toBe(350);
    const c = by('Carpophorus');
    expect([c.species, rawStat(c, 'cun'), c.traits[0]]).toEqual(['troodon', 8, 'BeastTamer']);
    expect(marketCreaturePrice(s, c)).toBe(400);
    const f = by('Flamma');
    expect([f.species, rawStat(f, 'cun'), f.traits[0], marketCreaturePrice(s, f)]).toEqual(['velociraptor', 6, 'GlorySeeker', 300]);
    const a = by('Aello');
    expect([a.species, getStat(a, 'agi'), a.traits.includes('SharpenedClaws'), marketCreaturePrice(s, a)]).toEqual(['direwolf', 20, true, 100]);
    expect(m.creatures.length).toBe(6);
    expect(m.keepers).toEqual({ count: 5, price: 100 });
    expect(m.gear.every((g) => GEAR[g.type].market)).toBe(true);
    expect(m.eggs.length).toBeGreaterThan(0);
    s.world.week = 5;
    expect(marketCreaturePrice(s, t)).not.toBe(350);
  });
});

describe('weekly regeneration', () => {
  it('moves stock to the old lists and rolls keepers, eggs and food', () => {
    const s = testState(3);
    seedStarterMarket(s);
    const before = s.world.market.creatures;
    s.world.week = 2;
    regenerateMarkets(s);
    const m = s.world.market;
    expect(m.oldCreatures).toBe(before);
    expect(m.keepers.count).toBeGreaterThanOrEqual(2);
    expect(m.keepers.count).toBeLessThanOrEqual(4);
    expect([80, 100, 120]).toContain(m.keepers.price);
    expect(m.eggs.length).toBeGreaterThanOrEqual(1);
    expect(m.eggs.length).toBeLessThanOrEqual(3);
    for (const f of FOOD_IDS) {
      expect(m.foodPrices[f]).toBeGreaterThanOrEqual(Math.floor(FOODS[f].price * 0.9));
      expect(m.foodPrices[f]).toBeLessThanOrEqual(Math.ceil(FOODS[f].price * 1.1));
    }
    expect(m.gear.every((g) => GEAR[g.type].market)).toBe(true);
    expect(m.gear.some((g) => GEAR[g.type].slot === 'rider')).toBe(false); // no Saddlery
  });
  it('riders appear with a Saddlery; goods improve with spies', () => {
    const s = testState(4);
    const h = s.player.ludus;
    h.buildings.saddlery = 1;
    let riders = 0;
    let quality = 0;
    for (let w = 2; w < 30; w++) {
      s.world.week = w;
      regenerateMarkets(s);
      riders += s.world.market.gear.filter((g) => GEAR[g.type].slot === 'rider').length;
      quality += s.world.market.gear.reduce((q, g) => q + g.quality, 0) / Math.max(1, s.world.market.gear.length);
    }
    expect(riders).toBeGreaterThan(10);
    h.keepers.spies = 40;
    let spied = 0;
    for (let w = 2; w < 30; w++) {
      s.world.week = w;
      regenerateMarkets(s);
      spied += s.world.market.gear.reduce((q, g) => q + g.quality, 0) / Math.max(1, s.world.market.gear.length);
    }
    expect(spied).toBeGreaterThan(quality);
  });
  it('compressed week and the marketSeed Epic rule (real week, quirk fixed)', () => {
    expect([1, 10, 11, 29, 30, 101, 102, 300].map(compressedWeek)).toEqual([1, 10, 10, 10, 15, 50, 40, 40]);
    const s = testState(5);
    s.world.marketSeed = 2;
    s.world.week = 12;
    expect(generateMarketDinos(s, 0).some((c) => c.epic)).toBe(true);
    s.world.week = 13;
    for (let i = 0; i < 10; i++) expect(generateMarketDinos(s, 0).some((c) => c.epic)).toBe(false);
    s.world.week = 2; // ≤ 5: never
    expect(generateMarketDinos(s, 0).some((c) => c.epic)).toBe(false);
  });
  it('market dinos are at least level 2 (cheap ones level 1+)', () => {
    const s = testState(6);
    s.world.week = 20;
    const cs = generateMarketDinos(s, 1);
    expect(cs.filter((c) => !c.epic).length).toBeGreaterThan(0);
    for (const c of cs) expect(c.level).toBeGreaterThanOrEqual(1);
  });
});

describe('buying and selling', () => {
  it('buying a dino: pay, +20 tameness below 75, grace, objective hook', () => {
    const s = testState();
    seedStarterMarket(s);
    const h = s.player.ludus;
    const f = s.world.market.creatures.find((c) => c.name === 'Flamma')!;
    f.loyalty = 50;
    expect(buyCreature(s, f.id)).toBeNull();
    expect(h.denarii).toBe(700);
    expect(h.creatures).toContain(f);
    expect(f.loyalty).toBe(70);
    expect(f.rebellionGrace).toBe(true);
    expect(f.price).toBeUndefined();
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'bought');
    expect(buyCreature(s, f.id)).toMatch(/no longer/);
  });
  it('locked species cannot be bought', () => {
    const s = testState();
    const rhino = generateBeast('woollyrhino');
    s.world.market.creatures.push(rhino);
    s.player.ludus.denarii = 5000;
    expect(isLocked(s, rhino)).toBe(true);
    expect(buyCreature(s, rhino.id)).toMatch(/locked/);
    s.unlocks.push('woollyRhinos');
    expect(buyCreature(s, rhino.id)).toBeNull();
  });
  it('selling a dino pays salePrice and puts it back on the market', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    c.level = 4;
    const price = salePrice(c);
    expect(sellCreature(s, c.id)).toBeNull();
    expect(h.denarii).toBe(1000 + price);
    expect(h.creatures.length).toBe(0);
    expect(s.world.market.creatures).toContain(c);
  });
  it('gear: buy at worth, sell at worth/2, sold pieces reappear, weapon hook', () => {
    const s = testState();
    const h = s.player.ludus;
    const g = makeGear('talonBlades', 2, 'g1');
    s.world.market.gear.push(g);
    expect(buyGear(s, 'g1')).toBeNull();
    expect(h.denarii).toBe(1000 - 225);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'boughtWeapon');
    const [c] = addTo(h, dino());
    c.gear.weapon = 'g1';
    expect(sellGear(s, 'g1')).toBeNull();
    expect(c.gear.weapon).toBeUndefined();
    expect(h.denarii).toBe(1000 - 225 + 112);
    expect(s.world.market.gear).toContain(g);
    const r = makeGear('numidianLancer', 2, 'r1');
    s.world.market.gear.push(r);
    expect(buyGear(s, 'r1')).toMatch(/Saddlery/);
  });
  it('food and eggs', () => {
    const s = testState();
    const h = s.player.ludus;
    expect(buyFood(s, 'rawMeat', 3)).toBeNull();
    expect(h.pantry.rawMeat).toBe(3);
    expect(h.denarii).toBe(1000 - 24);
    s.world.week = 3;
    regenerateMarkets(s);
    const e = s.world.market.eggs[0];
    h.denarii = 5000;
    expect(buyEgg(s, e.id)).toBeNull();
    expect(h.eggs).toContain(e);
    expect(sellEgg(s, e.id)).toBeNull();
    expect(h.eggs.length).toBe(0);
    expect(s.world.market.eggs).toContain(e);
  });
});

describe('intel', () => {
  it('reveals market stock by committed spies; the Geneticist shows wild points', () => {
    const s = testState();
    const c = dino();
    c.traits.push('Strong', 'Tough');
    s.world.market.creatures.push(c);
    const h = s.player.ludus;
    expect(intel(s, c)).toMatchObject({ age: false, str: false, traits: 0, wild: false });
    h.spiesLastWeek = 3;
    expect(intel(s, c)).toMatchObject({ age: true, str: true, agi: true, cun: false, hp: false });
    h.spiesLastWeek = 9;
    expect(intel(s, c)).toMatchObject({ cun: true, hp: true, traits: 2 });
    s.unlocks.push('geneticist');
    expect(intel(s, c).wild).toBe(true);
    const mine = dino();
    addTo(h, mine);
    expect(intel(s, mine).hp).toBe(true);
  });
});

describe('trading with rivals', () => {
  it('accepts at the asking price, once a week', () => {
    const s = testState();
    const r = s.rivals[0];
    const h = s.player.ludus;
    h.denarii = 50000;
    const cs = addTo(r, dino(), dino(), dino());
    const ask = rivalAskingPrice(s, r, cs[0].id);
    expect(ask).toBeGreaterThan(0);
    const low = offerToRival(s, r.id, cs[0].id, Math.max(1, ask - 50));
    expect(low.ok).toBe(false);
    expect(low.counter).toBeGreaterThanOrEqual(ask);
    expect(offerToRival(s, r.id, cs[0].id, ask).text).toMatch(/next week/);
    r.ai!.offeredThisWeek = false;
    const res = offerToRival(s, r.id, cs[0].id, ask);
    expect(res.ok).toBe(true);
    expect(h.creatures).toContain(cs[0]);
    expect(r.creatures).not.toContain(cs[0]);
    expect(cs[0].rebellionGrace).toBe(true);
  });
  it('a rival with two dinos or fewer wants more than twice its valuation', () => {
    const s = testState();
    const r = s.rivals[0];
    const cs = addTo(r, dino(), dino());
    const three = testState();
    const r3 = three.rivals[0];
    const copy = addTo(r3, { ...cs[0], id: 'same' } as any, dino(), dino());
    expect(rivalAskingPrice(s, r, cs[0].id)).toBeGreaterThan(rivalAskingPrice(three, r3, copy[0].id));
  });
  it('lower opinion raises item prices (the integer-division bug is fixed)', () => {
    const s = testState();
    const r = s.rivals[0];
    const g = makeGear('talonBlades', 2, 'rg');
    r.armory.push(g, makeGear('fangCaps', 2, 'x1'), makeGear('fangCaps', 3, 'x2'), makeGear('hornLance', 3, 'x3'), makeGear('greatTalons', 4, 'x4'));
    r.ai!.opinion = 80;
    const friendly = rivalItemWant(s, r, g);
    r.ai!.opinion = 10;
    const hostile = rivalItemWant(s, r, g);
    expect(hostile).toBeGreaterThan(friendly);
    expect(friendly).toBe(Math.ceil(gearWorth(g) * 0.8));
  });
  it('accepting a rival bid: paid, +3 opinion, +20 tameness below 50', () => {
    const s = testState();
    const h = s.player.ludus;
    const r = s.rivals[0];
    const [c] = addTo(h, dino());
    c.loyalty = 40;
    s.player.offers.push({ id: 'o1', rivalId: r.id, creatureId: c.id, amount: 300, expiresWeek: 2 });
    expect(acceptTransfer(s, 'o1')).toBeNull();
    expect(h.denarii).toBe(1300);
    expect(r.denarii).toBe(500);
    expect(r.creatures).toContain(c);
    expect(c.loyalty).toBe(60);
    expect(r.ai!.opinion).toBe(53);
    expect(s.player.offers.length).toBe(0);
    expect(acceptTransfer(s, 'o1')).toMatch(/gone/);
  });
  it('expired offers are refused', () => {
    const s = testState();
    const [c] = addTo(s.player.ludus, dino());
    s.player.offers.push({ id: 'o2', rivalId: s.rivals[0].id, creatureId: c.id, amount: 300, expiresWeek: 1 });
    expect(acceptTransfer(s, 'o2')).toMatch(/expired/);
  });
});

describe('traveling merchant', () => {
  it('needs the upgrade; offers three wares', () => {
    const s = testState(21);
    rollMerchant(s);
    expect(s.world.market.merchant).toBeUndefined();
    s.unlocks.push('travelingMerchant');
    for (let i = 0; i < 20 && !s.world.market.merchant; i++) rollMerchant(s);
    const mer = s.world.market.merchant!;
    expect(mer.items.length).toBe(3);
    const h = s.player.ludus;
    h.denarii = 5000;
    const idx = mer.items.findIndex((it) => !isLocked(s, it.gear));
    const price = mer.items[idx].price;
    expect(buyFromMerchant(s, idx)).toBeNull();
    expect(h.denarii).toBe(5000 - price);
    expect(mer.items.length).toBe(2);
  });
});
