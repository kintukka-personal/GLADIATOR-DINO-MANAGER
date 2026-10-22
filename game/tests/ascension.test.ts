import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./storiesFixture')).economyMock);
vi.mock('../src/engine/adventures', async () => (await import('./storiesFixture')).adventuresMock);
vi.mock('../src/engine/rivals', async () => (await import('./storiesFixture')).rivalsMock);
vi.mock('../src/engine/horde', async () => (await import('./storiesFixture')).hordeMock);
vi.mock('../src/engine/care', async () => (await import('./storiesFixture')).careMock);
vi.mock('../src/engine/influence', async () => (await import('./storiesFixture')).influenceMock);
vi.mock('../src/engine/buildings', async () => (await import('./storiesFixture')).buildingsMock);

import {
  ASCENSION_LEVELS, ascensionProgress, ascensionFoes, ascensionFoeSet, ascensionStartEffects, ascensionTurnEffects, onAscensionVictory,
  reincarnate, syncAscensionMeta, selectableAscension, ascensionBonusRounds,
} from '../src/engine/ascension';
import { rawStat, eqAge, addTrait, isKid } from '../src/engine/creature';
import { STATS } from '../src/engine/types';
import type { GameState } from '../src/engine/types';
import { makeState, makeRival, dino, addTo, resetMocks, emptyMetaForTest, rivalsMock, economyMock } from './storiesFixture';

beforeEach(() => resetMocks());

const raw = (c: Parameters<typeof rawStat>[0]) => Object.fromEntries(STATS.map((s) => [s, rawStat(c, s)]));

describe('levels', () => {
  it('has the 16 GM gods in order', () => {
    expect(ASCENSION_LEVELS.map((l) => l.name)).toEqual([
      'Wealth of Saturn', 'Vulcan\'s Forging Destiny', 'Prowess of Sol', 'Wrath of Neptune', 'Wisdom of Minerva', 'Desire of Venus',
      'Diana\'s Hunt', 'Pluto\'s Killing', 'Judgement of Jupiter', 'Vitality of Juno', 'Violence of Mars', 'Apollo\'s Prophecy',
      'Creation of Gaia', 'Hyperion\'s Heights', 'Depths of Tartarus', 'Reaping of Cronus',
    ]);
    for (const l of ASCENSION_LEVELS) expect(l.summary.length).toBeGreaterThan(0);
  });
});

describe('requirements', () => {
  function ready(s: GameState) {
    const me = s.player.ludus;
    for (const league of ['lunar', 'solar', 'bacchus'] as const) me.trophies.push({ league, place: 1, week: 30, creatureName: 'x' });
    me.trophies.push({ league: 'solar', place: 2, week: 50, creatureName: 'y' });
    s.player.senator = true;
    s.world.horde.defeated = true;
    me.buildings.shrine = 1;
  }

  it('counts league firsts plus the Senate seat, needs the horde crushed and a shrine, on even weeks', () => {
    const s = makeState({ week: 60 });
    expect(ascensionProgress(s).ready).toBe(false);
    ready(s);
    expect(ascensionProgress(s)).toMatchObject({ trophies: 4, needed: 4, hordeDefeated: true, shrine: true, ready: true });
    s.world.week = 61;
    expect(ascensionProgress(s).ready).toBe(false);
    s.ascended = true;
    s.world.week = 62;
    expect(ascensionProgress(s).ready).toBe(false);
    s.world.week = 100;
    expect(ascensionProgress(s).ready).toBe(true);
  });

  it('Mars needs a fifth trophy', () => {
    const s = makeState({ week: 60, ascension: 11 });
    ready(s);
    expect(ascensionProgress(s)).toMatchObject({ needed: 5, ready: false });
  });
});

describe('the gauntlet', () => {
  it('uses the GM bonus-round table with exact stat lines', () => {
    const s = makeState({ week: 60, ascension: 0 });
    expect(ascensionBonusRounds(s)).toBe(2);
    const r1 = ascensionFoes(s, 1);
    expect(r1.map((c) => c.species)).toEqual(['woollyrhino', 'direbear']);
    const [horseman] = ascensionFoes(s, 2);
    expect(horseman.species).toBe('parasaurolophus');
    expect(raw(horseman)).toEqual({ str: 20, agi: 16, cun: 14, hp: 80 });
    expect(horseman.level).toBe(10);
    expect(horseman.notes?.some((n) => n.startsWith('gear:rider:numidianLancer'))).toBe(true);
    // second-to-last round (L+1 = 1) fights All Out
    expect(r1.every((c) => c.instruction === 'allout')).toBe(true);
    const [giant] = ascensionFoes(s, 14);
    expect(giant.species).toBe('cyclops');
    expect(raw(giant)).toEqual({ str: 35, agi: 27, cun: 30, hp: 400 });
    expect(ascensionFoes(s, 15).length).toBe(2);
    expect(ascensionFoes(s, 18)[0].species).toBe('wraith');
    const set = ascensionFoeSet(s, 3);
    expect(set.gear.some((g) => g.type === 'ankyloHammer')).toBe(true);
    expect(set.creatures[0].traits).toContain('Titan');
  });
});

describe('start and turn effects (fall-through)', () => {
  it('level 2 applies Saturn and Vulcan start effects; level 0 none', () => {
    const z = makeState({ ascension: 0 });
    ascensionStartEffects(z);
    expect(z.rivals[0].denarii).toBe(1000);

    const s = makeState({ ascension: 2 });
    const bat = s.rivals[0];
    ascensionStartEffects(s);
    expect(bat.denarii).toBe(2000);
    expect(bat.keepers.unassigned).toBe(1);
    expect(bat.armory.some((g) => g.type === 'legionBarding' && g.quality === 0)).toBe(true);
    expect(bat.armory.some((g) => g.quality === 2)).toBe(true);
    expect(s.player.ludus.projected).toBe(-5);
  });

  it('Saturn week 30: Cronus the Giganotosaurus joins the smallest house', () => {
    const s = makeState({ week: 30, ascension: 1 });
    addTo(s.rivals[0], dino('X'), dino('Y'));
    ascensionTurnEffects(s);
    const sol = s.rivals[1];
    const cronus = sol.creatures.find((c) => c.legend === 'cronus')!;
    expect(cronus.species).toBe('giganotosaurus');
    expect(raw(cronus)).toEqual({ str: 15, agi: 10, cun: 10, hp: 45 });
    expect(sol.armory.some((g) => g.type === 'bashPlate' && g.quality === 4 && cronus.gear.offhand === g.id)).toBe(true);
    expect(s.player.ludus.projected).toBe(-5);
    ascensionTurnEffects(s);
    expect(sol.creatures.filter((c) => c.legend === 'cronus').length).toBe(1);
  });

  it('Vulcan week 60: Hephaestus joins the Wild Horde with his trident', () => {
    const s = makeState({ week: 60, ascension: 2 });
    ascensionTurnEffects(s);
    const h = s.world.horde;
    const heph = h.rogues.find((c) => c.legend === 'hephaestus')!;
    expect(heph.species).toBe('ankylosaurus');
    expect(heph.traits).toContain('Titan');
    expect(h.armory.some((g) => g.type === 'tridentHorns' && heph.gear.weapon === g.id)).toBe(true);
    expect(h.ferals).toBe(10);
    expect(h.spoils).toBe(1000);
  });

  it('Venus and Jupiter drain influence; Cronus brings Hannibal at week 13', () => {
    const s = makeState({ week: 13, ascension: 16 });
    s.player.ludus.influence = 50;
    ascensionTurnEffects(s);
    expect(rivalsMock.spawnRival).toHaveBeenCalledWith(s, 'hannibal');
    expect(economyMock.addInfluence).toHaveBeenCalled();
    const t = makeState({ week: 9, ascension: 6 });
    t.player.ludus.influence = 10;
    ascensionTurnEffects(t);
    expect(t.player.ludus.influence).toBe(9);
  });
});

describe('victory and meta', () => {
  it('raises the account level, stores a deep copy and grants the right achievements', () => {
    const s = makeState({ week: 80, ascension: 4, hard: true });
    const meta = emptyMetaForTest();
    meta.ascension.hard = 4;
    const [champ] = addTo(s.player.ludus, dino('Maximus', { fame: 500 }));
    onAscensionVictory(s, champ, meta);
    expect(meta.ascension.hard).toBe(5);
    expect(champ.traits).toContain('Ascended');
    expect(s.ascended).toBe(true);
    const rec = meta.champions.hard!;
    expect(rec.creature.name).toBe('Maximus');
    champ.name = 'Changed';
    expect(rec.creature.name).toBe('Maximus');
    expect(s.pendingAchievements).toEqual(expect.arrayContaining(['ascension', 'divine', 'divineHard']));
    expect(s.pendingAchievements).not.toContain('radiance');
  });

  it('caps at 16, never lowers, and skips the account in Sandbox', () => {
    const s = makeState({ ascension: 16 });
    const meta = emptyMetaForTest();
    meta.ascension.normal = 16;
    const [c] = addTo(s.player.ludus, dino('A'));
    onAscensionVictory(s, c, meta);
    expect(meta.ascension.normal).toBe(16);
    const sb = makeState({ ascension: 3, sandbox: true });
    const m2 = emptyMetaForTest();
    const [d] = addTo(sb.player.ludus, dino('B'));
    onAscensionVictory(sb, d, m2);
    expect(m2.ascension.normal).toBe(0);
    expect(m2.champions.normal).toBeUndefined();
  });

  it('syncAscensionMeta records a victory flagged by the tournament once', () => {
    const s = makeState({ ascension: 2 });
    const meta = emptyMetaForTest();
    const [c] = addTo(s.player.ludus, dino('Flamma', { fame: 300 }));
    s.ascended = true;
    s.world.flags.ascensionChampion = c.id;
    syncAscensionMeta(s, meta);
    expect(meta.ascension.normal).toBe(3);
    expect(meta.champions.normal?.creature.id).toBe(c.id);
    meta.ascension.normal = 0;
    syncAscensionMeta(s, meta);
    expect(meta.ascension.normal).toBe(0);
  });

  it('prophecy unlocks one extra selectable level', () => {
    const s = makeState({ ascension: 3 });
    const meta = emptyMetaForTest();
    meta.ascension.normal = 3;
    s.world.flags.prophecyWon = 4;
    syncAscensionMeta(s, meta);
    expect(meta.prophecy.normal).toBe(4);
    expect(selectableAscension(meta, 'normal')).toBe(5);
  });
});

describe('reincarnation', () => {
  function champion() {
    const c = dino('Victor', { species: 'tyrannosaurus', stats: { str: 30, agi: 14, cun: 12, hp: 120 }, fame: 900, level: 25 });
    c.genes.wild = { str: 20, agi: 9, cun: 8, hp: 15 };
    c.genes.colors = [1, 2, 3, 4, 5, 6];
    c.genes.mutMatri = 3;
    c.genes.mutPatri = 5;
    c.genes.generation = 4;
    c.techniques = [{ id: 'Smash', rank: 5, equipped: true }, { id: 'Cleave', rank: 2, equipped: true }];
    for (const t of ['Titan', 'Fury', 'Albino', 'ArenaChampion', 'Ascended'] as const) addTrait(c, t);
    c.cls = 'brute';
    c.prof.mace = 300;
    c.reincarnation = 1;
    c.adultWeeks = 520;
    c.loyalty = 90;
    return c;
  }

  it('young: age 15, the GM 8/8/8/30 body, first technique, one trait, bloodline kept', () => {
    const old = champion();
    const c = reincarnate(old, 'young', 3, false);
    expect(c.id).not.toBe(old.id);
    expect(eqAge(c)).toBeGreaterThanOrEqual(15);
    expect(eqAge(c)).toBeLessThan(18);
    expect(isKid(c)).toBe(false);
    // reincarnation 1 + min(2, 3) = 3
    expect(c.reincarnation).toBe(3);
    expect(c.traits).toContain('Reincarnated');
    expect(c.traits).toContain('Giant'); // Titan → Giant, the one kept trait
    expect(c.traits).toContain('Albino');
    expect(c.traits).not.toContain('Fury');
    expect(c.traits).not.toContain('Ascended');
    expect(c.traits).not.toContain('ArenaChampion');
    // 8/8/8/30 + Giant (+2 str, −2 agi, +5 hp) + Albino (+1 cun) + Reincarnated (+2 str, +2 agi, +5 hp)
    expect(raw(c)).toEqual({ str: 12, agi: 8, cun: 9, hp: 40 });
    expect(c.techniques).toEqual([{ id: 'Smash', rank: 1, equipped: true }]);
    expect(c.level).toBe(1);
    expect(c.cls).toBeNull();
    expect(c.fame).toBe(0);
    expect(c.genes.wild).toEqual({ str: 20, agi: 9, cun: 8, hp: 15 });
    expect(c.genes.colors).toEqual([1, 2, 3, 4, 5, 6]);
    expect([c.genes.mutMatri, c.genes.mutPatri, c.genes.generation]).toEqual([3, 5, 4]);
    expect(old.traits).toContain('Ascended');
  });

  it('young with Ascendancy keeps two traits; high reincarnation gets the stat and proficiency bonuses', () => {
    const old = champion();
    old.reincarnation = 6;
    const c = reincarnate(old, 'young', 10, true);
    expect(c.reincarnation).toBe(6 + 7);
    expect(c.traits).toEqual(expect.arrayContaining(['Giant', 'Fury', 'Albino', 'Reincarnated']));
    // 8/8/8/30 + Giant + Fury (+2 str, −2 cun, +5 hp) + Albino + Reincarnated, and reinc 13: +1 STR/AGI/CUN, +5 HP
    expect(raw(c)).toEqual({ str: 15, agi: 9, cun: 8, hp: 50 });
    expect(c.prof.claw).toBe(5);
    expect(c.classXp).toBe(2);
    expect(c.learnable).toContain('Cleave');
  });

  it('old: everything kept, aged to 54+, ill, tamer, Ascended removed', () => {
    const old = champion();
    const before = raw(old);
    const c = reincarnate(old, 'old', 12, false);
    expect(c.traits).not.toContain('Ascended');
    expect(c.traits).toContain('Fury');
    expect(c.level).toBe(25);
    expect(c.techniques.find((t) => t.id === 'Smash')?.rank).toBe(5);
    const r = raw(c);
    // Ascended gave +2 str, +2 agi, +5 hp; everything else is kept
    expect(r).toEqual({ str: before.str - 2, agi: before.agi - 2, cun: before.cun, hp: before.hp - 5 });
    expect(eqAge(c)).toBeGreaterThanOrEqual(54);
    expect(c.ill).toBe(3);
    expect(c.loyalty).toBe(100);
    expect(c.genes.wild).toEqual(old.genes.wild);
  });

  it('beasts reincarnate with their natural line', () => {
    const s = makeState();
    void s;
    const wolf = dino('Fang', { species: 'direwolf', stats: { str: 8, agi: 20, cun: 3, hp: 20 }, level: 12 });
    wolf.dom.str += 6;
    const c = reincarnate(wolf, 'young', 2, false);
    expect(c.traits).toContain('ReincarnatedBeast');
    expect(c.maturity).toBe(1);
    expect(c.dom).toEqual({ str: 0, agi: 0, cun: 0, hp: 0 });
    expect(c.techniques.map((t) => t.id)).toEqual(['Bite']);
  });
});

describe('rival makeRival helper sanity', () => {
  it('fixture rivals are visible dominus houses', () => {
    expect(makeRival('M', 'magnus').ai?.visible).toBe(true);
  });
});
