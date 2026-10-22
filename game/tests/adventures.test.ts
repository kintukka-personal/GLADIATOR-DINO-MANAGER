// Adventures: lifecycle, scripted foes, rewards, choice adventures and ARK-style Wild Capture.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BattleSide, Creature, GameState, Ludus } from '../src/engine/types';

const ctl = vi.hoisted(() => ({
  winner: 0 as 0 | 1,
  foeDies: false,
  sides: [] as any[],
  hooks: [] as any[],
}));

vi.mock('../src/engine/combat', () => ({
  buildSide: (_s: any, house: any, creatures: any[], _i: any, opts: any) => ({
    houseId: house?.id, name: opts?.name ?? 'side', modifiers: opts?.modifiers ?? [], injuryMod: 0, influence: 0, player: opts?.player,
    fighters: creatures.map((c: any) => ({ creature: c, gear: {}, instruction: 'default' })),
  }),
  resolveBattle: (sides: BattleSide[]) => {
    ctl.sides.push(sides);
    return {
      winner: ctl.winner, decidedBy: 'ko', rounds: 3, log: [], fighters: [],
      outcomes: sides.flatMap((s, i) => s.fighters.map((f) => ({
        creatureId: f.creature.id, side: i, knockedOut: false, yielded: false, died: i === 1 && ctl.foeDies, injury: null,
        xp: 0, fame: 0, loyalty: 0, newTraits: [], hpEnd: 10, hpMax: 10, biggestHit: 0,
      }))),
    };
  },
  applyBattleResult: () => [],
}));
vi.mock('../src/engine/economy', () => ({
  addInfluence: (_s: any, h: any, n: number) => {
    const v = Math.max(0, h.influence + n);
    const d = v - h.influence;
    h.influence = v;
    return d;
  },
  loseKeepers: (_s: any, h: any, n: number) => { const k = Math.min(n, h.keepers.unassigned); h.keepers.unassigned -= k; return k; },
  addKeepers: (h: any, n: number, job?: string) => { h.keepers[job ?? 'unassigned'] += n; },
  committedSpies: () => 0,
}));
vi.mock('../src/engine/buildings', () => ({ buildingTotals: () => ({ pairs: 2, eggSlots: 2, tempControl: 6, nurserySlots: 3, kitchen: true }) }));
vi.mock('../src/engine/rivals', () => ({ changeOpinion: () => {} }));
vi.mock('../src/engine/horde', () => ({ rebelRaid: () => null, resolveRaid: () => ({ text: '' }) }));
vi.mock('../src/engine/influence', () => ({ hasOpp: () => false }));
vi.mock('../src/engine/care', () => ({ bury: () => {} }));
vi.mock('../src/engine/market', () => ({ rollMerchant: () => {} }));
vi.mock('../src/engine/stories', () => ({ storyHook: (_s: any, hook: string, data: any) => { ctl.hooks.push({ hook, data }); } }));

import { setSeed } from '../src/engine/rng';
import { makeLudus, emptyMeta } from '../src/engine/newgame';
import { generateDino, addTrait, makeCreature } from '../src/engine/creature';
import {
  ADVENTURE_KEYS, adventureFoes, adventureWeek, pendingAdventures, resolveAdventure, sendOnAdventure, tamingEffectiveness,
  CROCEA_APPROACHES, wildCreature,
} from '../src/engine/adventures';
import { loadoutOf } from '../src/engine/data/eventsDataKit';

function state(week = 30): GameState {
  const ludus = makeLudus('House Test', true, 1000);
  ludus.influence = 100;
  const r = makeLudus('House Batiatus', false, 1000);
  r.ai = {
    key: 'batiatus', personality: { financial: 'balanced', arena: 'balanced', honesty: 'neutral', training: 'standard', classMindset: 'normal', prefers: [] },
    opinion: 50, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {},
  };
  r.creatures.push(generateDino({ week, level: 6 }));
  const s: GameState = {
    version: 1, slot: 1, createdAt: 0, savedAt: 0,
    player: {
      lanista: 'Test', female: false, heritage: 'roman', ludus, opportunities: [], treeSeed: 1,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false, objectives: [],
      stories: {}, storyData: {}, messages: [], decisions: [], decisionHistory: [], delayed: [], adventures: [],
      conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [], organized: 0, leagueWins: 0,
      invaderWins: 0, tutorial: 0, bets: {}, week: {}, counters: {},
    },
    rivals: [r], unknown: makeLudus('Unknown', false, 200),
    world: {
      week, rng: 1, difficulty: { hard: false, nightmare: false, sandbox: false, raidsDisabled: false, betrayalsDisabled: false },
      ascension: 0, marketSeed: 0, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [],
        foodPrices: { rawMeat: 8, primeMeat: 25, mejoberries: 5, kibble_simple: 40, kibble_regular: 70, kibble_superior: 120, kibble_exceptional: 200, kibble_extraordinary: 350 }, pokes: 0 },
      horde: { rogues: [], ferals: 0, spoils: 0, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
      laws: { publicFunding: false }, flags: {}, temperature: 24, released: [],
    },
    ancestry: {}, unlocks: [...emptyMeta().upgrades], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 },
  };
  const c = generateDino({ species: 'carnotaurus', week, level: 8 });
  c.maturity = 1;
  ludus.creatures.push(c);
  return s;
}

const hero = (s: GameState): Creature => s.player.ludus.creatures[0];

beforeEach(() => {
  setSeed(4242);
  ctl.winner = 0;
  ctl.foeDies = false;
  ctl.sides = [];
  ctl.hooks = [];
});

describe('adventure lifecycle', () => {
  it('sends, counts down, waits, then resolves with rewards', () => {
    const s = state();
    const c = hero(s);
    const adv = sendOnAdventure(s, 'criminal', [c.id], 3);
    expect(c.away).toEqual({ kind: 'adventure', weeksLeft: 3, ref: adv.id, note: adv.title });
    expect(s.player.adventures).toHaveLength(1);
    expect(pendingAdventures(s)).toHaveLength(0);
    adventureWeek(s);
    adventureWeek(s);
    expect(c.away!.weeksLeft).toBe(1);
    adventureWeek(s);
    expect(pendingAdventures(s)).toHaveLength(1);
    expect(c.away).toBeDefined();
    expect(resolveAdventure(s, 'nope').success).toBe(false);
    const den = s.player.ludus.denarii;
    const r = resolveAdventure(s, adv.id);
    expect(r.success).toBe(true);
    expect(r.battle).toBeDefined();
    expect(s.player.ludus.denarii).toBe(den + 200);
    expect(s.player.ludus.influence).toBe(110);
    expect(c.traits).toContain('Enforcer');
    expect(c.away).toBeUndefined();
    expect(c.rebellionGrace).toBe(true);
    expect(s.player.adventures).toHaveLength(0);
    expect(s.pendingAchievements).toContain('adventurer');
    expect(ctl.hooks[0]).toMatchObject({ hook: 'adventure', data: { key: 'criminal', success: true } });
  });

  it('refuses to resolve an adventure still under way', () => {
    const s = state();
    const adv = sendOnAdventure(s, 'trap', [hero(s).id], 2);
    expect(resolveAdventure(s, adv.id).text).toMatch(/still under way/);
    expect(s.player.adventures).toHaveLength(1);
  });

  it('Hard and Nightmare variants of the achievement', () => {
    const s = state();
    s.world.difficulty.hard = true;
    s.world.difficulty.nightmare = true;
    const adv = sendOnAdventure(s, 'patrician', [hero(s).id], 0);
    resolveAdventure(s, adv.id);
    expect(s.pendingAchievements).toEqual(expect.arrayContaining(['adventurer', 'adventurerHard', 'adventurerNightmare']));
  });

  it('a lost adventure applies the failure penalty and no achievement', () => {
    const s = state();
    ctl.winner = 1;
    const adv = sendOnAdventure(s, 'macedon', [hero(s).id], 0);
    const r = resolveAdventure(s, adv.id);
    expect(r.success).toBe(false);
    expect(s.player.ludus.influence).toBe(90);
    expect(s.pendingAchievements).toHaveLength(0);
  });

  it('resolves on its own after 6 weeks without orders', () => {
    const s = state();
    sendOnAdventure(s, 'criminal', [hero(s).id], 1);
    adventureWeek(s);
    for (let i = 0; i < 6; i++) {
      s.world.week++;
      adventureWeek(s);
    }
    expect(s.player.adventures).toHaveLength(0);
    expect(hero(s).away).toBeUndefined();
  });

  it('unknown keys pay data.reward', () => {
    const s = state();
    const adv = sendOnAdventure(s, 'storyErrand', [hero(s).id], 0, { reward: { denarii: 77, trait: 'Hero' } }, 'An errand');
    const r = resolveAdventure(s, adv.id);
    expect(r.success).toBe(true);
    expect(s.player.ludus.denarii).toBe(1077);
    expect(hero(s).traits).toContain('Hero');
  });

  it('nobody to resolve when the crew is gone', () => {
    const s = state();
    const adv = sendOnAdventure(s, 'criminal', [hero(s).id], 0);
    s.player.ludus.creatures = [];
    expect(resolveAdventure(s, adv.id).success).toBe(false);
    expect(s.player.adventures).toHaveLength(0);
  });
});

describe('scripted foes (GM adversary table)', () => {
  it('every battle adventure has foes, scaled by difficulty', () => {
    const s = state(60);
    for (const key of ADVENTURE_KEYS.filter((k) => !['specialTraining', 'marksmanTraining', 'hopliteWar'].includes(k))) {
      const foes = adventureFoes(s, key);
      expect(foes.length, key).toBeGreaterThan(0);
      expect(foes.length, key).toBeLessThanOrEqual(3);
    }
    const easy = adventureFoes(s, 'criminal')[0];
    s.world.difficulty.hard = true;
    s.world.ascension = 8;
    const hard = adventureFoes(s, 'criminal')[0];
    expect(hard.traits).toEqual(expect.arrayContaining(['Tough', 'Veteran']));
    expect(hard.bonus.str - easy.bonus.str).toBeGreaterThanOrEqual(0);
  });

  it('the Risen One is a mummified Spinosaurus with a time-warped crusher', () => {
    const s = state();
    const [r] = adventureFoes(s, 'tomb');
    expect(r.species).toBe('spinosaurus');
    expect(r.traits).toEqual(expect.arrayContaining(['Undeath', 'Indomitable']));
    expect(r.level).toBeGreaterThanOrEqual(10);
    const w = loadoutOf(r).weapon!;
    expect(w.type).toBe('obsidianCrusher');
    expect(w.augment).toBe('TimeWarped');
  });

  it('Vorenus and Pullo wear legion barding', () => {
    const s = state();
    const foes = adventureFoes(s, 'macedon');
    expect(foes.map((f) => f.name)).toEqual(['Vorenus', 'Pullo']);
    for (const f of foes) {
      expect(f.species).toBe('iguanodon');
      expect(loadoutOf(f).armor!.type).toBe('legionBarding');
    }
  });

  it('Hector fights beside you on the Troy escort', () => {
    const s = state();
    const adv = sendOnAdventure(s, 'troyEscort', [hero(s).id], 0);
    resolveAdventure(s, adv.id);
    const [player, foes] = ctl.sides.at(-1);
    expect(player.fighters.some((f: any) => f.temporary && f.creature.name.includes('Hector'))).toBe(true);
    expect(foes.fighters).toHaveLength(3);
    expect(s.world.flags.troyStage).toBe(1);
  });
});

describe('choice adventures', () => {
  it('Crocea Mors offers 3 of 8 approaches and a strong dino gets the blade', () => {
    const s = state();
    const c = hero(s);
    c.bonus.str += 200;
    c.bonus.agi += 200;
    c.bonus.cun += 200;
    c.bonus.hp += 1000;
    const adv = sendOnAdventure(s, 'croceaMors', [c.id], 1);
    adventureWeek(s);
    const [p] = pendingAdventures(s);
    expect(p.choices).toHaveLength(3);
    const idx: number[] = p.adventure.data.approaches;
    expect(new Set(idx).size).toBe(3);
    const pickIdx = idx.findIndex((i) => i !== 7); // "whatever means necessary" is a gamble
    const r = resolveAdventure(s, adv.id, pickIdx);
    expect(r.success).toBe(true);
    expect(s.player.ludus.armory.some((g) => g.unique === 'croceaMors')).toBe(true);
    expect(s.world.flags.lostBladeDone).toBe(true);
  });

  it('"whatever means necessary" is helped, not hurt, by its traits (GM bug fixed)', () => {
    const c = makeCreature({ species: 'troodon' });
    let plain = 0;
    let ruthless = 0;
    setSeed(1);
    for (let i = 0; i < 2000; i++) if (CROCEA_APPROACHES[7].check(c)) plain++;
    for (const t of ['Ruthless', 'Killer', 'Underhanded', 'Psychopath'] as const) addTrait(c, t);
    setSeed(1);
    for (let i = 0; i < 2000; i++) if (CROCEA_APPROACHES[7].check(c)) ruthless++;
    expect(ruthless).toBeGreaterThan(plain);
    expect(plain / 2000).toBeGreaterThan(0.18);
    expect(plain / 2000).toBeLessThan(0.3);
  });

  it('the Sphinx: a wrong answer fails, Man leads to the Risen One and Black Death', () => {
    const s = state();
    const a1 = sendOnAdventure(s, 'tomb', [hero(s).id], 0);
    expect(pendingAdventures(s)[0].choices).toEqual(['Man', 'A tree', 'A caterpillar']);
    const r1 = resolveAdventure(s, a1.id, 2);
    expect(r1.success).toBe(false);
    expect(r1.text).toMatch(/Caterpillar/);
    expect(s.player.ludus.influence).toBe(90);
    const a2 = sendOnAdventure(s, 'tomb', [hero(s).id], 0);
    const r2 = resolveAdventure(s, a2.id, 0);
    expect(r2.success).toBe(true);
    expect(r2.battle).toBeDefined();
    expect(s.player.ludus.armory.some((g) => g.unique === 'blackDeath')).toBe(true);
  });

  it("Hannibal's merchant: paying needs the money, then gives the regalia", () => {
    const s = state();
    const a = sendOnAdventure(s, 'hannibalMerchant', [hero(s).id], 0);
    expect(pendingAdventures(s)[0].choices![2]).toMatch(/2,000/);
    const r = resolveAdventure(s, a.id, 2);
    expect(r.text).toMatch(/cannot afford/);
    expect(s.player.adventures).toHaveLength(1);
    expect(hero(s).away).toBeDefined();
    s.player.ludus.denarii = 2500;
    const r2 = resolveAdventure(s, a.id, 2);
    expect(r2.success).toBe(true);
    expect(s.player.ludus.denarii).toBe(500);
    expect(s.world.flags.hannibalStage).toBe(3);
    expect(s.player.ludus.armory.some((g) => g.unique === 'hannibalsRegalia')).toBe(true);
  });

  it('a Troodon pays the Punic price', () => {
    const s = state();
    const t = generateDino({ species: 'troodon', week: 30, level: 4 });
    s.player.ludus.creatures.push(t);
    sendOnAdventure(s, 'hannibalMerchant', [t.id], 0);
    expect(pendingAdventures(s)[0].choices![2]).toMatch(/1,500/);
  });
});

describe('Wild Capture (ARK taming)', () => {
  it('taming effectiveness grows with the kibble tier', () => {
    expect(tamingEffectiveness('triceratops', 'kibble_simple')).toBe(0.1);
    expect(tamingEffectiveness('triceratops', 'kibble_regular')).toBe(0.2);
    expect(tamingEffectiveness('triceratops', 'kibble_superior')).toBe(0.35); // its favourite
    expect(tamingEffectiveness('triceratops', 'kibble_exceptional')).toBe(0.4);
    expect(tamingEffectiveness('triceratops', 'kibble_extraordinary')).toBe(0.5);
    expect(tamingEffectiveness('velociraptor', 'kibble_simple')).toBe(0.15);
    expect(tamingEffectiveness('triceratops', undefined)).toBe(0);
  });

  it('consumes the kibble, fights a wild one and tames it with bonus wild points', () => {
    const s = state();
    s.player.ludus.pantry = { kibble_extraordinary: 1 };
    const adv = sendOnAdventure(s, 'wildCapture', [hero(s).id], 2, { species: 'triceratops', kibble: 'kibble_extraordinary' });
    expect(s.player.ludus.pantry.kibble_extraordinary).toBe(0);
    const wild = adv.data.wild as Creature;
    expect(wild.species).toBe('triceratops');
    const total = wild.genes.wild.str + wild.genes.wild.agi + wild.genes.wild.cun + wild.genes.wild.hp;
    adventureWeek(s);
    adventureWeek(s);
    expect(pendingAdventures(s)[0].text).toMatch(/Triceratops/);
    const r = resolveAdventure(s, adv.id);
    expect(r.success).toBe(true);
    const tamed = s.player.ludus.creatures.find((c) => c.id === wild.id)!;
    expect(tamed).toBeDefined();
    expect(tamed.genes.tamingEffectiveness).toBe(0.5);
    const after = tamed.genes.wild.str + tamed.genes.wild.agi + tamed.genes.wild.cun + tamed.genes.wild.hp;
    expect(after - total).toBe(Math.round(0.5 * total));
    expect(tamed.loyalty).toBe(75);
  });

  it('buys the kibble at market price when the pantry is empty', () => {
    const s = state();
    sendOnAdventure(s, 'wildCapture', [hero(s).id], 2, { species: 'velociraptor', kibble: 'kibble_simple' });
    expect(s.player.ludus.denarii).toBe(960);
  });

  it('a dead or victorious wild creature is not tamed', () => {
    const s = state();
    ctl.foeDies = true;
    const a = sendOnAdventure(s, 'wildCapture', [hero(s).id], 0, { species: 'velociraptor', kibble: 'kibble_simple' });
    const n = s.player.ludus.creatures.length;
    expect(resolveAdventure(s, a.id).success).toBe(false);
    expect(s.player.ludus.creatures.length).toBe(n);
    ctl.foeDies = false;
    ctl.winner = 1;
    const b = sendOnAdventure(s, 'wildCapture', [hero(s).id], 0, { species: 'direwolf', kibble: 'kibble_simple' });
    expect(resolveAdventure(s, b.id).success).toBe(false);
    expect(s.player.ludus.creatures.length).toBe(n);
  });

  it('wild creatures are adult and untrained', () => {
    const s = state();
    const w = wildCreature(s, 'allosaurus');
    expect(w.maturity).toBe(1);
    expect(w.level).toBe(1);
    expect(w.fame).toBe(0);
  });
});

describe('rewards', () => {
  it('Romulus III failure hands the club to the rival', () => {
    const s = state();
    ctl.winner = 1;
    const r: Ludus = s.rivals[0];
    const a = sendOnAdventure(s, 'romulus3', [hero(s).id], 0, { rivalId: r.id });
    resolveAdventure(s, a.id);
    expect(r.armory.some((g) => g.unique === 'foundersAxe')).toBe(true);
    expect(s.world.flags.romulusStage).toBe(-1);
  });

  it('Romulus III victory gives the club, the Celtic shield and 500 denarii', () => {
    const s = state();
    const a = sendOnAdventure(s, 'romulus3', [hero(s).id], 0, { rivalId: s.rivals[0].id });
    resolveAdventure(s, a.id);
    const u = s.player.ludus.armory.map((g) => g.unique);
    expect(u).toEqual(expect.arrayContaining(['foundersAxe', 'ancientCelticShield']));
    expect(s.player.ludus.denarii).toBe(1500);
  });

  it('the White Rhino joins wounded', () => {
    const s = state();
    const a = sendOnAdventure(s, 'whiteRhino', [hero(s).id], 0);
    resolveAdventure(s, a.id);
    const rhino = s.player.ludus.creatures.find((c) => c.name === 'The White Rhino')!;
    expect(rhino.species).toBe('woollyrhino');
    expect(rhino.traits).toContain('Albino');
    expect(rhino.injury).not.toBeNull();
    expect(hero(s).traits).toContain('Hunter');
  });

  it('the Apollo contest teaches Venom Barrage and gives the relic', () => {
    const s = state();
    const a = sendOnAdventure(s, 'apolloContest', [hero(s).id], 0, { rivalId: s.rivals[0].id });
    resolveAdventure(s, a.id);
    expect(s.player.ludus.armory.some((g) => g.unique === 'bowOfApollo')).toBe(true);
    expect(hero(s).learnable).toContain('HailOfArrows');
  });

  it('training trips succeed without a battle', () => {
    const s = state();
    const a = sendOnAdventure(s, 'marksmanTraining', [hero(s).id], 0);
    const r = resolveAdventure(s, a.id);
    expect(r.battle).toBeUndefined();
    expect(hero(s).traits).toContain('Marksman');
    expect(s.player.ludus.armory.some((g) => g.type === 'venomSpitter' && g.quality === 1)).toBe(true);
  });
});
