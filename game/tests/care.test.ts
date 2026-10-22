import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/influence', () => ({ hasOpp: vi.fn(() => false), publicSessionsIncome: vi.fn(() => 0), influenceLoyaltyEffect: vi.fn(() => 0) }));
vi.mock('../src/engine/horde', () => ({ joinHorde: vi.fn() }));
vi.mock('../src/engine/objectives', () => ({ objectiveEvent: vi.fn() }));
vi.mock('../src/engine/combat', () => ({ buildSide: vi.fn(), resolveBattle: vi.fn(), applyBattleResult: vi.fn() }));

import * as objectives from '../src/engine/objectives';
import {
  assignGear, bond, bury, learnTech, rename, resurrect, retire, setClass, setDoctore, spendPoint, surgery, toggleTech,
  treat, useItem,
} from '../src/engine/care';
import { makeGear } from '../src/engine/data/gear';
import { generateBeast } from '../src/engine/creature';
import { testState, dino, addTo } from './economy.fixture';

beforeEach(() => vi.mocked(objectives.objectiveEvent).mockClear());

function armed() {
  const s = testState();
  const h = s.player.ludus;
  const [a, b] = addTo(h, dino(), dino());
  h.armory.push(
    makeGear('talonBlades', 2, 'blade'), makeGear('hideShield', 2, 'shield'), makeGear('venomSpitter', 2, 'bow'),
    makeGear('fangCaps', 2, 'fang'), makeGear('championsCrest', 1, 'crest'), makeGear('numidianLancer', 2, 'rider'),
    makeGear('fangCaps', 5, 'dark', { unique: 'darkFangs' }), makeGear('silphium', 2, 'silph'),
  );
  return { s, h, a, b };
}

describe('assignGear', () => {
  it('slot rules: shields in the off-hand, dual-wield weapons may go there too', () => {
    const { s, a } = armed();
    expect(assignGear(s, a.id, 'weapon', 'blade')).toBeNull();
    expect(assignGear(s, a.id, 'offhand', 'shield')).toBeNull();
    expect(assignGear(s, a.id, 'armor', 'shield')).toMatch(/does not go/);
    expect(assignGear(s, a.id, 'offhand', 'fang')).toBeNull();
    expect(a.gear).toMatchObject({ weapon: 'blade', offhand: 'fang' });
    expect(assignGear(s, a.id, 'item', 'silph')).toMatch(/used, not worn/);
  });
  it('a two-handed-only main clears the off-hand unless Titanic Strength', () => {
    const { s, a } = armed();
    assignGear(s, a.id, 'offhand', 'shield');
    expect(assignGear(s, a.id, 'weapon', 'bow')).toBeNull();
    expect(a.gear.offhand).toBeUndefined();
    expect(assignGear(s, a.id, 'offhand', 'shield')).toMatch(/both forelimbs/);
    a.traits.push('TitanicStrength');
    expect(assignGear(s, a.id, 'offhand', 'shield')).toBeNull();
  });
  it('one creature at a time: assigning moves the piece', () => {
    const { s, a, b } = armed();
    assignGear(s, a.id, 'weapon', 'blade');
    expect(assignGear(s, b.id, 'weapon', 'blade')).toBeNull();
    expect(a.gear.weapon).toBeUndefined();
    expect(b.gear.weapon).toBe('blade');
  });
  it('family crest only on the bonded dino; cursed fangs never come off; beasts and kids', () => {
    const { s, h, a, b } = armed();
    expect(assignGear(s, a.id, 'helmet', 'crest')).toMatch(/bonded/);
    h.bondedId = a.id;
    expect(assignGear(s, a.id, 'helmet', 'crest')).toBeNull();
    expect(assignGear(s, b.id, 'weapon', 'dark')).toBeNull();
    expect(assignGear(s, b.id, 'weapon', null)).toMatch(/will not come off/);
    expect(assignGear(s, b.id, 'weapon', 'blade')).toMatch(/will not come off/);
    expect(assignGear(s, a.id, 'weapon', 'dark')).toMatch(/will not come off/);
    const w = generateBeast('direwolf');
    addTo(h, w);
    expect(assignGear(s, w.id, 'weapon', 'blade')).toMatch(/Beasts/);
    const kid = dino('iguanodon', { maturity: 0.6 });
    addTo(h, kid);
    expect(assignGear(s, kid.id, 'rider', 'rider')).toMatch(/too young/);
    expect(assignGear(s, a.id, 'rider', 'rider')).toBeNull();
  });
});

describe('useItem', () => {
  it('Silphium offers known techniques, refunds the ranks, +20 tameness', () => {
    const { s, h, a } = armed();
    a.techniques.push({ id: 'Smash', rank: 3, equipped: true }, { id: 'Lunge', rank: 1, equipped: true });
    a.loyalty = 50;
    const first = useItem(s, a.id, 'silph');
    expect(first.ok).toBe(false);
    expect(first.choices?.sort()).toEqual(['Lunge', 'Smash']);
    const pts = a.techPoints;
    const done = useItem(s, a.id, 'silph', 'Smash');
    expect(done.ok).toBe(true);
    expect(a.techniques.map((t) => t.id)).toEqual(['Lunge']);
    expect(a.techPoints).toBe(pts + 3);
    expect(a.loyalty).toBe(70);
    expect(h.armory.some((g) => g.id === 'silph')).toBe(false);
  });
  it('Bestiary Scroll offers one trait from each list', () => {
    const { s, h, a } = armed();
    h.armory.push(makeGear('bestiaryScroll', 2, 'tome'));
    const r = useItem(s, a.id, 'tome');
    expect(r.choices?.length).toBe(3);
    const pick = r.choices![1];
    expect(useItem(s, a.id, 'tome', pick).ok).toBe(true);
    expect(a.traits).toContain(pick);
  });
  it('Bottled Lightning, Amber Shard, Mutagen (once)', () => {
    const { s, h, a } = armed();
    h.armory.push(makeGear('bottledLightning', 2, 'bl'), makeGear('amberShard', 2, 'am'), makeGear('mutagen', 2, 'mu'), makeGear('mutagen', 2, 'mu2'));
    a.loyalty = 50;
    expect(useItem(s, a.id, 'bl').ok).toBe(true);
    expect(a.techniques.some((t) => t.id === 'Thunderstrike')).toBe(true);
    expect([a.loyalty, a.ill]).toEqual([45, 2]);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'learned');
    expect(useItem(s, a.id, 'am').ok).toBe(true);
    expect(a.speciesLevel).toBe(2);
    const w = { ...a.genes.wild };
    expect(useItem(s, a.id, 'mu').ok).toBe(true);
    expect(a.genes.wild).toEqual({ str: w.str + 1, agi: w.agi + 1, cun: w.cun, hp: w.hp + 1 });
    expect([a.genes.mutMatri, a.genes.mutPatri, a.counters?.mutagen]).toEqual([1, 1, 1]);
    expect(useItem(s, a.id, 'mu2').ok).toBe(false);
  });
});

describe('creature management', () => {
  it('class upgrades, stat points, techniques', () => {
    const { s, a } = armed();
    expect(setClass(s, a.id, 'lasher')).toMatch(/locked/);
    expect(setClass(s, a.id, 'brute')).toBeNull();
    expect(a.cls).toBe('brute');
    expect(spendPoint(s, a.id, 'str')).toMatch(/no attribute points/);
    a.statPoints = 1;
    expect(spendPoint(s, a.id, 'hp')).toBeNull();
    expect(a.dom.hp).toBe(1);
    expect(learnTech(s, a.id, 'Smash')).toBeNull();
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'learned');
    expect(learnTech(s, a.id, 'Smash')).toMatch(/no technique points/);
    expect(learnTech(s, a.id, 'Rally')).toMatch(/locked/);
    expect(toggleTech(s, a.id, 'Smash')).toBeNull();
    expect(a.techniques[0].equipped).toBe(false);
  });
  it("a species' natural technique ranks up without its Amber upgrade", () => {
    const { s, h } = armed();
    const p = dino('parasaurolophus');
    p.techniques.push({ id: 'Rally', rank: 1, equipped: true });
    addTo(h, p);
    expect(learnTech(s, p.id, 'Rally')).toBeNull();
    expect(p.techniques[0].rank).toBe(2);
  });
  it('bonding: fame > 20, 25 denarii, one at a time, crest with the upgrade', () => {
    const { s, h, a, b } = armed();
    expect(bond(s, a.id)).toMatch(/fame/);
    a.fame = 21;
    s.unlocks.push('championsCrest');
    expect(bond(s, a.id, 'Little Caesar')).toBeNull();
    expect(a.name).toBe('Little Caesar');
    expect(a.fame).toBe(26);
    expect(a.traits).toContain('Adopted');
    expect(h.bondedId).toBe(a.id);
    expect(h.denarii).toBe(975);
    expect(h.armory.filter((g) => g.type === 'championsCrest').length).toBe(2);
    b.fame = 50;
    expect(bond(s, b.id)).toMatch(/already your bonded/);
  });
  it('treats: beasts only, once a week, +5 XP', () => {
    const { s, h, a } = armed();
    const w = generateBeast('direwolf');
    addTo(h, w);
    expect(treat(s, a.id)).toMatch(/Only beasts/);
    expect(treat(s, w.id)).toBeNull();
    expect([w.treats, w.xp, h.denarii]).toEqual([1, 5, 990]);
    expect(treat(s, w.id)).toMatch(/already/);
  });
  it('rename costs 25; beasts fire the naming hook', () => {
    const { s, h } = armed();
    const w = generateBeast('direwolf');
    addTo(h, w);
    expect(rename(s, w.id, '  Fluffy ')).toBeNull();
    expect(w.name).toBe('Fluffy');
    expect(h.denarii).toBe(975);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'renamedBeast');
  });
  it('retire: the dino leaves, a keeper stays, 50 denarii', () => {
    const { s, h, a } = armed();
    h.doctoreId = a.id;
    expect(retire(s, a.id)).toBeNull();
    expect(h.creatures).not.toContain(a);
    expect(h.doctoreId).toBeUndefined();
    expect(h.keepers.unassigned).toBe(1);
    expect(h.denarii).toBe(1050);
  });
  it('doctore: dinos only', () => {
    const { s, h, a } = armed();
    const w = generateBeast('direwolf');
    addTo(h, w);
    expect(setDoctore(s, w.id)).toMatch(/beast/);
    expect(setDoctore(s, a.id)).toBeNull();
    expect(setDoctore(s, null)).toBeNull();
    expect(h.doctoreId).toBeUndefined();
  });
});

describe('surgery', () => {
  it('needs a Veterinarium and a wound; fixes it or kills the patient', () => {
    const s = testState(77);
    const h = s.player.ludus;
    h.denarii = 100000;
    const [c] = addTo(h, dino());
    c.traits.push('Crippled');
    expect(surgery(s, c.id).text).toMatch(/Veterinarium/);
    h.buildings.veterinarium = 2;
    let fixed = 0;
    let died = 0;
    for (let i = 0; i < 60; i++) {
      const p = dino();
      p.traits.push('BumLeg');
      addTo(h, p);
      h.surgeriesThisWeek = 0;
      const r = surgery(s, p.id);
      if (r.ok) { fixed++; expect(p.traits).not.toContain('BumLeg'); } else { died++; expect(h.creatures).not.toContain(p); }
    }
    expect(fixed).toBeGreaterThan(40);
    expect(died).toBeGreaterThan(0);
    expect(objectives.objectiveEvent).toHaveBeenCalledWith(s, 'surgery');
    h.surgeriesThisWeek = 2;
    expect(surgery(s, c.id).text).toMatch(/enough this week/);
  });
});

describe('bury and resurrect', () => {
  it('removes the dino everywhere, pays 50, keeps the best five in the tomb', () => {
    const s = testState();
    const h = s.player.ludus;
    const cs = addTo(h, ...Array.from({ length: 7 }, (_, i) => dino('iguanodon', { fame: i * 10, sex: i % 2 ? 'F' : 'M' })));
    h.pairs.push({ maleId: cs[0].id, femaleId: cs[1].id, since: 1 });
    h.doctoreId = cs[0].id;
    h.bondedId = cs[0].id;
    cs[0].gear.weapon = 'x';
    bury(s, cs[0], 'Eaten by a rival');
    expect(h.creatures).not.toContain(cs[0]);
    expect(h.pairs).toEqual([]);
    expect(h.doctoreId).toBeUndefined();
    expect(h.bondedId).toBeUndefined();
    expect(cs[0].gear).toEqual({});
    expect(h.denarii).toBe(1050);
    expect(s.runStats.deaths).toBe(1);
    expect(s.ancestry[cs[0].id]?.fate).toBe('Eaten by a rival');
    for (const c of cs.slice(1)) bury(s, c, 'Old wounds');
    expect(s.player.tomb.length).toBe(5);
    expect(s.player.tomb.some((t) => t.name === cs[0].name)).toBe(false); // lowest fame evicted
    expect(s.player.tomb.some((t) => t.name === cs[6].name)).toBe(true);
  });
  it('rival deaths pay the rival and skip the player tomb', () => {
    const s = testState();
    const r = s.rivals[0];
    const [c] = addTo(r, dino());
    bury(s, c, 'Arena');
    expect(r.denarii).toBe(850);
    expect(s.player.tomb.length).toBe(0);
  });
  it('resurrection: Temple of Pluto, ascension, Reincarnated only; GM costs and side effects', () => {
    const s = testState();
    const h = s.player.ludus;
    const [c, other] = addTo(h, dino(), dino());
    c.traits.push('Reincarnated');
    c.level = 3;
    c.fame = 50;
    h.denarii = 10000;
    h.influence = 100;
    h.keepers.wardens = 2;
    other.loyalty = 80;
    bury(s, c, 'Arena');
    const id = s.player.tomb[0].id;
    expect(resurrect(s, id)).toMatch(/Temple of Pluto/);
    h.buildings.templeOfPluto = 1;
    expect(resurrect(s, id)).toMatch(/ascended/);
    s.world.ascension = 1;
    const cost = 100 * 3 + 1000 + 10 + 50 * c.traits.length;
    const before = h.denarii;
    expect(resurrect(s, id)).toBeNull();
    expect(h.denarii).toBe(before - cost);
    expect(h.influence).toBe(90);
    expect(h.keepers.wardens).toBe(1);
    expect(other.loyalty).toBe(60);
    expect(s.rivals[0].ai!.opinion).toBe(40);
    const back = h.creatures.find((x) => x.id === c.id)!;
    expect(back.traits).toContain('Undeath');
    expect(back.injury?.type).toBe('severe');
    expect(s.player.tomb.length).toBe(0);
  });
});
