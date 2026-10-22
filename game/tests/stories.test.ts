import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/engine/economy', async () => (await import('./storiesFixture')).economyMock);
vi.mock('../src/engine/adventures', async () => (await import('./storiesFixture')).adventuresMock);
vi.mock('../src/engine/rivals', async () => (await import('./storiesFixture')).rivalsMock);
vi.mock('../src/engine/horde', async () => (await import('./storiesFixture')).hordeMock);
vi.mock('../src/engine/care', async () => (await import('./storiesFixture')).careMock);
vi.mock('../src/engine/influence', async () => (await import('./storiesFixture')).influenceMock);
vi.mock('../src/engine/buildings', async () => (await import('./storiesFixture')).buildingsMock);

import { storyWeek, activeConversation, answerConversation, storyHook, storyProgress, storyTaunt, DONE, pendingConversations } from '../src/engine/stories';
import { checkObjectives, findObjective } from '../src/engine/objectives';
import type { GameState, StoryConversation, StoryLineId } from '../src/engine/types';
import { makeState, makeRival, dino, addTo, resetMocks, sentAdventures } from './storiesFixture';

beforeEach(() => resetMocks());

const rival = (s: GameState, key: string) => s.rivals.find((r) => r.ai?.key === key)!;

/** Advance weeks (storyWeek only) until a conversation for `story` shows up. */
function waitFor(s: GameState, story: StoryLineId, max = 300): StoryConversation {
  for (let i = 0; i < max; i++) {
    const c = s.player.conversations.find((x) => x.story === story);
    if (c) return c;
    s.world.week++;
    storyWeek(s);
  }
  throw new Error(`no ${story} conversation`);
}

describe('Solonius throw', () => {
  function setup(): GameState {
    const s = makeState({ week: 1 });
    s.world.tournaments.push({
      id: 't1', key: 'romesFinest', name: "Rome's Finest", week: 1, perTeam: 1, teams: 4, fee: 100, underground: false, mounts: 'none',
      beasts: false, type: 'normal', entries: [], matches: [], currentRound: 0, bonusRound: 0, status: 'open', weather: 'sunny', log: [],
    });
    s.player.registrations.t1 = [['c1']];
    return s;
  }

  it('offers the deal after registering and pays 300 when you lose to Solonius', () => {
    const s = setup();
    const c = activeConversation(s)!;
    expect(c.story).toBe('soloniusThrow');
    expect(c.actor).toBe('solonius');
    const sol = rival(s, 'solonius');
    const r = answerConversation(s, c.id, 0);
    expect(r.text).toMatch(/300/);
    expect(sol.ai!.opinion).toBe(55);
    expect(storyTaunt(s, sol.id)).toMatch(/lose/);
    const before = s.player.ludus.denarii;
    storyHook(s, 'matchResult', { opponentHouseId: sol.id, won: false });
    expect(s.player.ludus.denarii).toBe(before + 300);
    expect(sol.ai!.opinion).toBe(65);
    expect(storyProgress(s, 'soloniusThrow')).toBe(DONE);
  });

  it('beating Solonius anyway costs 15 opinion; refusing costs 10', () => {
    const s = setup();
    const c = activeConversation(s)!;
    answerConversation(s, c.id, 0);
    storyHook(s, 'matchResult', { opponentHouseId: rival(s, 'solonius').id, won: true });
    expect(rival(s, 'solonius').ai!.opinion).toBe(40);

    const t = setup();
    const c2 = activeConversation(t)!;
    answerConversation(t, c2.id, 1);
    expect(rival(t, 'solonius').ai!.opinion).toBe(40);
    expect(storyProgress(t, 'soloniusThrow')).toBe(DONE);
  });
});

describe('Loan request', () => {
  it('lend, then the rival repays the promised 400', () => {
    const s = makeState({ week: 12 });
    const bat = rival(s, 'batiatus');
    bat.denarii = 50;
    bat.ai!.opinion = 60;
    s.player.ludus.denarii = 500;
    storyWeek(s);
    const c = s.player.conversations.find((x) => x.story === 'loanRequest')!;
    expect(c.actor).toBe('batiatus');
    answerConversation(s, c.id, 0);
    expect(s.player.ludus.denarii).toBe(200);
    expect(bat.ai!.opinion).toBe(75);
    bat.denarii = 900;
    s.world.week++;
    storyWeek(s);
    const r = s.player.conversations.find((x) => x.story === 'loanRequest' && x.data.kind === 'repay')!;
    answerConversation(s, r.id, 1);
    expect(s.player.ludus.denarii).toBe(600);
    expect(bat.ai!.opinion).toBe(70);
    expect(storyProgress(s, 'loanRequest')).toBe(DONE);
  });

  it('cannot lend money you do not have', () => {
    const s = makeState({ week: 12 });
    const bat = rival(s, 'batiatus');
    bat.denarii = 50;
    bat.ai!.opinion = 60;
    s.player.ludus.denarii = 250;
    storyWeek(s);
    const c = pendingConversations(s).find((x) => x.story === 'loanRequest')!;
    expect(c.options[0].disabled).toBe(true);
    expect(answerConversation(s, c.id, 0).text).toMatch(/300/);
    expect(s.player.ludus.denarii).toBe(250);
  });
});

describe('Spartacus escape', () => {
  it('alley, sabotage, breakout farewell', () => {
    const s = makeState({ week: 28 });
    const bat = rival(s, 'batiatus');
    bat.keepers.wardens = 5;
    bat.keepers.unassigned = 5;
    const [sp] = addTo(bat, dino('Spartacus', { legend: 'spartacus' }));
    sp.loyalty = 10;
    s.player.stories.spartacusEscape = 1;
    s.player.storyData.spartacusEscapeHouse = bat.id;
    storyWeek(s);
    const c = activeConversation(s)!;
    expect(c.story).toBe('spartacusEscape');
    expect(c.actor).toBe('spartacus');
    const before = s.player.ludus.denarii;
    answerConversation(s, c.id, 2);
    expect(s.player.ludus.denarii).toBe(before + 100);
    expect(sp.loyalty).toBe(35);
    expect(storyProgress(s, 'spartacusEscape')).toBe(4);
    expect(bat.ai!.opinion).toBe(40);

    storyHook(s, 'intrigue', { action: 'sabotage', targetHouseId: bat.id, success: true });
    expect(storyProgress(s, 'spartacusEscape')).toBe(5);
    expect(sp.traits).toContain('Sneaky');
    expect(sp.loyalty).toBe(15);
    expect(bat.keepers.wardens).toBe(1);

    // horde.ts moves the story to 6 when Spartacus joins the Horde
    s.player.stories.spartacusEscape = 6;
    storyWeek(s);
    const f = s.player.conversations.find((x) => x.story === 'spartacusEscape')!;
    expect(f.data.kind).toBe('farewell');
    answerConversation(s, f.id, 0);
    expect(storyProgress(s, 'spartacusEscape')).toBe(DONE);
  });
});

describe('Murder plot', () => {
  it('pays 500 when you kill one of the target house\'s dinos', () => {
    const s = makeState({ week: 20 });
    const sol = rival(s, 'solonius');
    const bat = rival(s, 'batiatus');
    sol.ai!.opinion = 50;
    sol.keepers.spies = 1;
    sol.influence = 40;
    bat.influence = 200;
    addTo(sol, dino('Meek', { fame: 10 }));
    addTo(bat, dino('Gannicus', { fame: 120 }));
    s.player.ludus.keepers.spies = 1;
    bat.ai!.opinion = 10; // keep Batiatus out of other stories
    storyWeek(s);
    const c = s.player.conversations.find((x) => x.story === 'murderPlot')!;
    expect(c.actor).toBe('solonius');
    answerConversation(s, c.id, 0);
    expect(s.player.ludus.keepers.spies).toBe(2);
    const before = s.player.ludus.denarii;
    storyHook(s, 'kill', { victimHouseId: bat.id });
    expect(s.player.ludus.denarii).toBe(before + 500);
    expect(storyProgress(s, 'murderPlot')).toBe(DONE);
  });
});

describe('Pythia and the gods\' chosen', () => {
  it('visions → Delphi → Neokoros → sacrifice → Prophecy', () => {
    const s = makeState({ week: 161 });
    const me = s.player.ludus;
    storyWeek(s);
    const v = activeConversation(s)!;
    expect(v.story).toBe('pythiaVisions');
    answerConversation(s, v.id, 0);
    const first = findObjective(s, 'pythia1') ?? findObjective(s, 'pythia1Alt');
    expect(first).toBeTruthy();
    me.influence = 10000;
    for (let i = 0; i < 4; i++) addTo(me, dino(`Star${i}`, { fame: 1200 }));
    checkObjectives(s);
    expect(findObjective(s, 'pythia2')).toBeTruthy();
    const bonded = me.creatures[0];
    me.bondedId = bonded.id;
    s.world.week++;
    storyWeek(s);
    const d = s.player.conversations.find((x) => x.data.kind === 'delphi')!;
    answerConversation(s, d.id, 0);
    expect(sentAdventures.at(-1)).toMatchObject({ key: 'delphi', ids: [bonded.id] });
    storyHook(s, 'adventure', { key: 'delphi', success: true, data: { story: 'pythiaVisions' } });
    const neo = me.creatures.find((c) => c.legend === 'neokoros')!;
    expect(neo).toBeTruthy();
    expect(findObjective(s, 'pythia2')?.done).toBe(true);
    expect(findObjective(s, 'pythia3')).toBeTruthy();
    neo.traits.push('VulcanChampion', 'PitLegend');
    me.keepers.unassigned = 120;
    me.denarii = 12000;
    checkObjectives(s);
    expect(findObjective(s, 'pythia4')?.done).toBe(true);
    const g = activeConversation(s)!;
    expect(g.story).toBe('godsChosen');
    answerConversation(s, g.id, 0);
    expect(me.keepers.unassigned).toBe(20);
    expect(me.denarii).toBe(2000);
    expect(s.world.flags.prophecyWeek).toBe(s.world.week + 5);
    // missed tournament: rescheduled
    s.world.week += 6;
    storyWeek(s);
    expect(s.world.flags.prophecyWeek).toBe(s.world.week + 5);
    storyHook(s, 'tournamentWon', { type: 'prophecy' });
    expect(findObjective(s, 'godsChosen')?.done).toBe(true);
    expect(s.pendingAchievements).toContain('prophecy');
    expect(s.world.flags.prophecyWon).toBe(1);
    expect(storyProgress(s, 'godsChosen')).toBe(DONE);
  });
});

describe('Stud request (new)', () => {
  it('lends your best male for a week and the rival raises his offspring', () => {
    const s = makeState({ week: 9, seed: 7 });
    const sol = rival(s, 'solonius');
    rival(s, 'batiatus').ai!.opinion = 0;
    sol.ai!.opinion = 45;
    sol.denarii = 800;
    const [f] = addTo(sol, dino('Lupa', { species: 'velociraptor', sex: 'F' }));
    const [weak, strong] = addTo(s.player.ludus, dino('Runty', { species: 'velociraptor', sex: 'M' }), dino('Bigjaw', { species: 'velociraptor', sex: 'M' }));
    strong.genes.wild.str += 10;
    weak.genes.wild.str = 0;
    const c = waitFor(s, 'studRequest');
    expect(c.data.maleId).toBe(strong.id);
    const before = s.player.ludus.denarii;
    answerConversation(s, c.id, 0);
    expect(s.player.ludus.denarii).toBe(before + 300);
    expect(strong.away?.kind).toBe('loan');
    const baby = sol.creatures.find((x) => x.genes.fatherId === strong.id)!;
    expect(baby).toBeTruthy();
    expect(baby.genes.motherId).toBe(f.id);
    expect(baby.maturity).toBe(0.5);
    expect(f.mateCooldown).toBeGreaterThan(0);
    s.world.week++;
    storyWeek(s);
    expect(strong.away).toBeUndefined();
  });
});

describe('Restoration of Troy', () => {
  it('Hector visits, schedules the games, and the relics are paid once', () => {
    const s = makeState({ week: 20, seed: 3 });
    s.unlocks.push('restorationOfTroy');
    s.world.flags.troyStage = 1;
    addTo(s.player.ludus, dino('A', { fame: 400 }), dino('B', { fame: 400 }));
    const c = waitFor(s, 'restorationOfTroy');
    expect(c.actor).toBe('hector');
    answerConversation(s, c.id, 0);
    expect(Number(s.world.flags.troyWeek)).toBeGreaterThanOrEqual(s.world.week + 6);
    storyHook(s, 'tournamentRound', { type: 'troy', round: 3 });
    storyHook(s, 'tournamentWon', { type: 'troy' });
    storyHook(s, 'tournamentWon', { type: 'troy' });
    const arm = s.player.ludus.armory;
    expect(arm.filter((g) => g.type === 'handOfMidas').length).toBe(1);
    expect(arm.filter((g) => g.unique === 'achillesSpear').length).toBe(1);
    expect(storyProgress(s, 'restorationOfTroy')).toBe(DONE);
  });
});

describe('Train a rival\'s dino', () => {
  it('loan, objective, Fulgur', () => {
    const s = makeState({ week: 10 });
    s.unlocks.push('lashers');
    const bat = rival(s, 'batiatus');
    rival(s, 'solonius').ai!.opinion = 0;
    bat.ai!.opinion = 40;
    const [pupil] = addTo(bat, dino('Pupil', { fame: 30 }), dino('Spare'));
    const [doc] = addTo(s.player.ludus, dino('Doc', { level: 8 }));
    s.player.ludus.doctoreId = doc.id;
    storyWeek(s);
    const c = s.player.conversations.find((x) => x.story === 'trainGladiator')!;
    expect(c.data.creatureId).toBe(pupil.id);
    answerConversation(s, c.id, 0);
    expect(s.player.ludus.creatures).toContain(pupil);
    expect(findObjective(s, 'trainLoaned')).toBeTruthy();
    pupil.bonus.str += 5;
    pupil.fame += 100;
    checkObjectives(s);
    expect(findObjective(s, 'trainLoaned')?.done).toBe(true);
    s.world.week++;
    storyWeek(s);
    const ok = s.player.conversations.find((x) => x.story === 'trainGladiator' && x.data.kind === 'success')!;
    answerConversation(s, ok.id, 0);
    expect(bat.creatures).toContain(pupil);
    expect(s.player.ludus.armory.some((g) => g.unique === 'fulgur')).toBe(true);
  });
});

describe('Mansion for sale', () => {
  it('installments unlock the Rome mansion and loan the champion for five weeks', () => {
    const s = makeState({ week: 10, seed: 11 });
    s.unlocks.push('romeMansion');
    rival(s, 'solonius').ai!.opinion = 0;
    s.player.ludus.denarii = 900;
    const [champ] = addTo(s.player.ludus, dino('Champ', { fame: 250 }));
    const c = waitFor(s, 'mansionForSale');
    answerConversation(s, c.id, 0);
    expect(s.player.ludus.buildings.romeMansion).toBe(1);
    expect(s.player.ludus.projected).toBe(-25);
    expect(champ.away?.ref).toBe('story:mansionForSale');
    for (let i = 0; i < 6 && champ.away; i++) { s.world.week++; storyWeek(s); }
    if (s.player.ludus.creatures.includes(champ)) {
      expect(champ.away).toBeUndefined();
    }
    expect(storyProgress(s, 'mansionForSale')).toBe(DONE);
  });
});

describe('Adventure-driven stories', () => {
  it('tomb of the Pharaoh resets on failure and closes on success', () => {
    const s = makeState({ week: 30, seed: 5 });
    s.unlocks.push('egyptianAncestry');
    s.player.heritage = 'egyptian';
    const me = s.player.ludus;
    me.influence = 400;
    me.spiesLastWeek = 10;
    addTo(me, dino('A', { fame: 10 }), dino('B', { fame: 5 }), dino('C'));
    const c = waitFor(s, 'tombOfThePharaoh');
    expect(c.actor).toBe('spy');
    answerConversation(s, c.id, 1);
    expect(sentAdventures.at(-1)?.key).toBe('tomb');
    storyHook(s, 'adventure', { key: 'tomb', success: false });
    expect(storyProgress(s, 'tombOfThePharaoh')).toBe(0);
    for (const x of me.creatures) x.away = undefined;
    const c2 = waitFor(s, 'tombOfThePharaoh');
    answerConversation(s, c2.id, 0);
    storyHook(s, 'adventure', { key: 'tomb', success: true });
    expect(storyProgress(s, 'tombOfThePharaoh')).toBe(DONE);
  });

  it('the hag offers her reward after the bandits are dead', () => {
    const s = makeState({ week: 40, ascension: 1, seed: 9 });
    const me = s.player.ludus;
    s.player.invaderWins = 30;
    me.influence = 200;
    addTo(me, dino('A', { fame: 150, stats: { cun: 14 } }), dino('B', { fame: 100 }));
    const c = waitFor(s, 'mysteriousHag');
    answerConversation(s, c.id, 0);
    storyHook(s, 'adventure', { key: 'hagBandits', success: true });
    const r = s.player.conversations.find((x) => x.story === 'mysteriousHag' && x.data.kind === 'reward')!;
    answerConversation(s, r.id, 2);
    expect(me.creatures.some((x) => x.techniques.some((t) => t.id === 'Fireball'))).toBe(true);
  });
});

describe('conversation housekeeping', () => {
  it('drops a rival conversation when the house falls', () => {
    const s = makeState({ week: 12 });
    const bat = rival(s, 'batiatus');
    bat.denarii = 50;
    bat.ai!.opinion = 60;
    s.player.ludus.denarii = 500;
    storyWeek(s);
    expect(s.player.conversations.length).toBe(1);
    bat.defeated = 'debt';
    expect(activeConversation(s)).toBeNull();
    expect(s.player.conversations.length).toBe(0);
  });

  it('only the six GM lanistae start dominus storylines', () => {
    const s = makeState({ week: 12 });
    s.rivals = [makeRival('House Randomus', 'random', { opinion: 90, denarii: 10 })];
    s.player.ludus.denarii = 500;
    storyWeek(s);
    expect(s.player.conversations.find((x) => x.story === 'loanRequest')).toBeUndefined();
  });
});
