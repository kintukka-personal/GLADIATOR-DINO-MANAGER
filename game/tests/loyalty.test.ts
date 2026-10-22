import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
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
import {
  entertainmentTameness, gearHappinessWeek, loyaltyChange, loyaltyWeek, resolveBreakouts, rewardCreature, wardenTameness,
} from '../src/engine/loyalty';
import { makeGear } from '../src/engine/data/gear';
import { testState, dino, addTo } from './economy.fixture';

beforeEach(() => {
  vi.mocked(influence.influenceLoyaltyEffect).mockReturnValue(0);
  vi.mocked(horde.joinHorde).mockClear();
});

const part = (b: { parts: { label: string; amount: number }[] }, label: string) => b.parts.find((p) => p.label === label)?.amount ?? 0;

describe('weekly change (GM 05 §4.1)', () => {
  it('entertainment and warden terms', () => {
    expect(entertainmentTameness(0, false)).toBe(-2);
    expect(entertainmentTameness(1, false)).toBe(0);
    expect(entertainmentTameness(4, false)).toBe(3);
    expect(entertainmentTameness(5, false)).toBe(4);
    expect(entertainmentTameness(19, false)).toBe(11);
    expect(entertainmentTameness(20, true)).toBe(6 + 6 + 3);
    expect(wardenTameness(1)).toBe(0);
    expect(wardenTameness(10)).toBe(2);
    expect(wardenTameness(11)).toBe(2);
    expect(wardenTameness(50)).toBe(6);
    expect(wardenTameness(51)).toBe(5);
  });
  it('sums the parts: Roman dynasty + Iguanodon, level, influence mock', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino('iguanodon'));
    vi.mocked(influence.influenceLoyaltyEffect).mockReturnValue(3);
    const b = loyaltyChange(s, h, c);
    expect(part(b, 'Showmen')).toBe(-2);
    expect(part(b, 'Influence')).toBe(3);
    expect(part(b, 'Experience')).toBe(1);
    expect(part(b, 'Species')).toBe(1);
    expect(part(b, 'Heritage')).toBe(1);
    expect(b.total).toBe(-2 + 3 + 1 + 1 + 1);
    c.level = 4;
    expect(part(loyaltyChange(s, h, c), 'Experience')).toBe(-3);
  });
  it('heritage × species table', () => {
    const s = testState();
    const h = s.player.ludus;
    const t = dino('troodon');
    addTo(h, t);
    expect(part(loyaltyChange(s, h, t), 'Heritage')).toBe(-1);
    s.player.heritage = 'punic';
    expect(part(loyaltyChange(s, h, t), 'Heritage')).toBe(2);
    s.player.heritage = 'celtic';
    const ig = dino('iguanodon');
    addTo(h, ig);
    expect(part(loyaltyChange(s, h, ig), 'Heritage')).toBe(-2);
    const tri = dino('triceratops');
    addTo(h, tri);
    expect(part(loyaltyChange(s, h, tri), 'Species')).toBe(-1);
    expect(part(loyaltyChange(s, h, tri), 'Heritage')).toBe(1);
    s.player.heritage = 'egyptian';
    const sp = dino('spinosaurus');
    addTo(h, sp);
    expect(part(loyaltyChange(s, h, sp), 'Heritage')).toBe(1);
  });
  it('imprint bonus, away halving, unpaid wages, Inspiring pull', () => {
    const s = testState();
    const h = s.player.ludus;
    h.keepers.showmen = 5; // +4
    const [c, insp] = addTo(h, dino('velociraptor'), dino('velociraptor'));
    s.player.heritage = 'greek'; // velociraptor −1
    c.genes.imprint = 1;
    expect(part(loyaltyChange(s, h, c), 'Imprint')).toBe(2);
    c.genes.imprint = 0.5;
    expect(part(loyaltyChange(s, h, c), 'Imprint')).toBe(1);
    c.genes.imprint = 0;
    c.away = { kind: 'adventure', weeksLeft: 2 };
    // 4 showmen-term + 1 level − 1 heritage = 4 → halved to 2
    expect(loyaltyChange(s, h, c).total).toBe(2);
    c.away = undefined;
    h.unpaidThisWeek = true;
    expect(part(loyaltyChange(s, h, c), 'Unpaid wages')).toBe(-10);
    h.unpaidThisWeek = false;
    insp.traits.push('Inspiring');
    insp.loyalty = 100;
    c.loyalty = 40;
    expect(part(loyaltyChange(s, h, c), 'Inspiring pack')).toBe(15);
  });
  it('legend pairings: Spartacus with Crixus, Crixus with Spartacus', () => {
    const s = testState();
    const h = s.player.ludus;
    const sp = dino('allosaurus', { legend: 'spartacus' });
    addTo(h, sp);
    expect(part(loyaltyChange(s, h, sp), 'Legend')).toBe(-1);
    const cr = dino('allosaurus', { legend: 'crixus' });
    addTo(h, cr);
    expect(part(loyaltyChange(s, h, sp), 'Legend')).toBe(-5);
    expect(part(loyaltyChange(s, h, cr), 'Legend')).toBe(-6);
  });
  it('AI houses skip harness happiness; beasts have no tameness drift', () => {
    const s = testState();
    const r = s.rivals[0];
    const [c] = addTo(r, dino());
    c.happiness = -5;
    expect(part(loyaltyChange(s, r, c), 'Harness')).toBe(0);
    const h = s.player.ludus;
    const [p] = addTo(h, dino());
    p.happiness = -5;
    expect(part(loyaltyChange(s, h, p), 'Harness')).toBe(-5);
    const w = dino('direwolf' as any);
    expect(loyaltyChange(s, h, w).total).toBe(0);
  });
});

describe('stay check', () => {
  it('tame dinos stay, wild ones rebel; grace consumes; juveniles never rebel', () => {
    const s = testState(5);
    const h = s.player.ludus;
    h.keepers.showmen = 20; // keep drift positive
    const tame = dino(); tame.loyalty = 60;
    const wild = dino(); wild.loyalty = 0;
    const graced = dino(); graced.loyalty = 0; graced.rebellionGrace = true;
    const kid = dino('iguanodon', { maturity: 0.3 }); kid.loyalty = 0;
    const hurt = dino(); hurt.loyalty = 5; hurt.injury = { type: 'broken', weeks: 3 };
    addTo(h, tame, wild, graced, kid, hurt);
    h.keepers.showmen = 0;
    vi.mocked(influence.influenceLoyaltyEffect).mockReturnValue(-2);
    const rebels = loyaltyWeek(s, h);
    expect(rebels).toContain(wild);
    expect(rebels).not.toContain(tame);
    expect(rebels).not.toContain(graced);
    expect(graced.rebellionGrace).toBe(false);
    expect(rebels).not.toContain(kid);
  });
  it('hidden AI houses never rebel but still drift', () => {
    const s = testState();
    const r = s.rivals[0];
    r.ai!.visible = false;
    const [c] = addTo(r, dino());
    c.loyalty = 0;
    expect(loyaltyWeek(s, r)).toEqual([]);
  });
});

describe('breakouts', () => {
  it('a solo escape against heavy security fails: +10 tameness, −5 fame', () => {
    const s = testState(8);
    const h = s.player.ludus;
    h.keepers.wardens = 200;
    const [c] = addTo(h, dino());
    c.loyalty = 5;
    c.fame = 20;
    const card = resolveBreakouts(s, h, [c]);
    expect(card?.kind).toBe('escape');
    expect(card && card.kind === 'escape' ? card.outcome : '').toBe('Caught');
    expect(c.loyalty).toBe(15);
    expect(c.fame).toBe(15);
    expect(h.creatures).toContain(c);
    expect(s.player.counters.soloEscapes).toBe(1);
  });
  it('a coordinated escape with no security succeeds and the escapees join the Horde', () => {
    const s = testState(9);
    const h = s.player.ludus;
    h.keepers.wardens = 0;
    h.influence = 50;
    const cs = addTo(h, dino(), dino());
    for (const c of cs) c.loyalty = 0;
    const card = resolveBreakouts(s, h, cs);
    expect(card && card.kind === 'escape' ? card.outcome : '').toBe('Escaped');
    expect(h.creatures.length).toBe(0);
    expect(horde.joinHorde).toHaveBeenCalledTimes(2);
    expect(cs.every((c) => c.traits.includes('Escaped'))).toBe(true);
    expect(h.influence).toBe(40);
  });
  it('an uprising of four with no security burns the ludus down', () => {
    const s = testState(10);
    const h = s.player.ludus;
    h.keepers.wardens = 0;
    const cs = addTo(h, dino(), dino(), dino(), dino(), dino());
    const card = resolveBreakouts(s, h, cs.slice(0, 4));
    expect(h.defeated).toBe('uprising');
    expect(h.creatures.length).toBe(0);
    expect(card && card.kind === 'escape' ? card.outcome : '').toBe('Ludus destroyed');
  });
  it('AI breakouts resolve without a result card', () => {
    const s = testState(9);
    const r = s.rivals[0];
    r.keepers.wardens = 0;
    const [c] = addTo(r, dino());
    expect(resolveBreakouts(s, r, [c])).toBeNull();
  });
});

describe('gifts and harness', () => {
  it('reward: 50×(level/2+1), +40 tameness, grace, 10-week cooldown', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    c.level = 5;
    c.loyalty = 30;
    h.denarii = 1000;
    expect(rewardCreature(s, h, c)).toBeNull();
    expect(h.denarii).toBe(1000 - 150);
    expect(c.loyalty).toBe(70);
    expect(c.rebellionGrace).toBe(true);
    expect(rewardCreature(s, h, c)).toMatch(/recently/);
  });
  it('better harness cheers a dino up; famous dinos sulk in cheap gear', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c] = addTo(h, dino());
    h.armory.push(makeGear('bronzeBarding', 3, 'a1')); // worth 1500
    c.gear.armor = 'a1';
    gearHappinessWeek(s, h, c);
    expect(c.happiness).toBe(8); // +9 (capped step), then drifts 1 toward the target 0
    expect(c.lastGearWorth).toBe(1500);
    const f = dino();
    addTo(h, f);
    f.fame = 40;
    for (let i = 0; i < 5; i++) gearHappinessWeek(s, h, f);
    expect(f.happiness).toBe(-2);
  });
});
