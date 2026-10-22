// Objectives & the "Getting started" guidance chain. OWNER: systems-story agent. GM 03 §9.
//
// Objectives spawn once per run when their window opens and their trigger holds (checkObjectives, weekly),
// progress from state checks and from instant events (objectiveEvent), may expire after a duration, and pay
// their reward when claimed (claimObjective). The Pythia chain and the loaned-dino objective are spawned by
// the story engine; the guidance chain is seeded at a new non-ascended game.
import type { GameState, ObjectiveId, ObjectiveState } from './types';
import { TRAITS } from './data/traits';
import { SPECIES } from './data/species';
import { message, asc, ASC } from './util';
import { canFight, isAdult } from './creature';
import { addInfluence, keeperCount } from './economy';
import { hordeSize } from './horde';
import { unlockAchievement } from './achievements';
import { startGodsChosen, storyCheck, storyResetDelphi } from './stories';
import {
  me, newGear, giveGear, firstPlaces, findLegend, rivalByKey, rawTotal,
} from './data/storiesDataUtil';
import { chance } from './rng';
import { GEAR } from './data/gear';

export interface ObjectiveDef { id: ObjectiveId; title: string; desc: string; reward: string }

interface Rule {
  goal: number | ((s: GameState) => number);
  /** weeks to complete (0/undefined = no limit) */
  dur?: number;
  /** weeks in which it may spawn */
  window?: [number, number];
  spawn?: (s: GameState) => boolean;
  /** spawn roll each eligible week */
  chance?: number;
  progress: (s: GameState, o: ObjectiveState) => number;
  pay: (s: GameState) => void;
}

const D = (id: ObjectiveId, title: string, desc: string, reward: string): ObjectiveDef => ({ id, title, desc, reward });

export const OBJECTIVES: Partial<Record<ObjectiveId, ObjectiveDef>> = Object.fromEntries([
  D('guidance1', 'Getting started (1/6)', 'Buy your first dino at the market.', '–'),
  D('guidance2', 'Getting started (2/6)', 'Teach one of your dinos a technique.', '–'),
  D('guidance3', 'Getting started (3/6)', 'Buy a weapon harness at the market.', '–'),
  D('guidance4', 'Getting started (4/6)', 'Register a dino for a tournament in the Arena.', '–'),
  D('guidance5', 'Getting started (5/6)', 'Press Advance to end the week.', '–'),
  D('guidance6', 'Getting started (6/6)', 'Open your finances and hire a keeper.', 'Completing all six earns the Student achievement'),
  D('expandLudus', 'Expand the ludus', 'Build a Mine and a Training Field.', '50 denarii'),
  D('recruitSpy', 'Cloak and dagger', 'Upgrade the Residence to level 3 and assign a keeper as a spy.', 'Old Reinforced Camouflage Hide'),
  D('whereDoesItHurt', 'Where does it hurt?', 'Build a Veterinarium and perform surgery on a wounded dino.', 'Old Precise Fang Caps, +5 influence'),
  D('imperator', 'Imperator', 'Send an expedition that crushes the Wild Horde.', '200 denarii, +10 influence'),
  D('security', 'Security concerns', 'Assign 5 keepers as wardens and build a Palisade.', '50 denarii, +5 influence'),
  D('poison', 'Underhanded methods', 'Give Gigantus a taste of Roman medicine: poison Vettius\' giant.', 'Old Reinforced Hunter\'s Hood, 50 denarii, +5 influence'),
  D('saddleUp', 'Mount up', 'Build a Saddlery and buy a rider.', '100 denarii, +10 influence'),
  D('ascension', 'Ascension', 'You feel as if there is a greater calling than just this mortal world. Win league trophies (a Senate seat counts as one), crush the Wild Horde, build the Pantheum Shrine in Ariminium, then win the Ascension tournament.', 'Master-crafted Blessed Parrying Spurs'),
  D('exertInfluence', 'Exert influence', 'Activate an influence opportunity.', '50 denarii'),
  D('organize', 'Organize', 'Organise a tournament, then win it yourself.', '100 denarii, +10 influence'),
  D('thievery', 'One man\'s loss', 'Steal from a rival ludus.', 'Old Blessed Horn Lance, 50 denarii'),
  D('beastNaming', 'Name your beast', 'Give one of your beasts a proper name.', '+5 influence'),
  D('pythia1', 'The Oracle\'s vision (1/4)', 'Own four dinos or beasts with at least 1000 fame each.', '+10 influence'),
  D('pythia1Alt', 'The Oracle\'s vision (1/4)', 'Hold 10,000 influence.', '+10 influence'),
  D('pythia2', 'A show of devotion (2/4)', 'Send your bonded dino to Delphi and pass the trial.', '+10 influence'),
  D('pythia3', 'Neokoros supremacy (3/4)', 'Neokoros must win a league (Bacchus, Jupiter, Vulcan or Annum) and become a Pit Champion.', '+25 influence'),
  D('pythia4', 'Sacrifice for the gods (4/4)', 'Hold 100 keepers and 10,000 denarii.', 'Danaid Fang, +100 influence'),
  D('godsChosen', 'The gods\' chosen', 'Win the Prophecy tournament.', '1000 denarii, Cyclops\' Eye'),
  D('trainLoaned', 'Train the loaned dino', 'Within 10 weeks, raise the loaned dino\'s total stats by 5 and its fame by 100.', '100 denarii, +25 influence'),
  D('firstClutch', 'First clutch', 'Lay your first fertilized egg (pair a male and a female in the Breeding Pen).', '150 denarii, +5 influence'),
  D('imprintBaby', 'Hand-raised', 'Raise a fully imprinted dino: answer every care request until it is grown.', 'Lucky Tooth, +10 influence'),
  D('bloodline', 'Bloodline', 'Breed a third-generation dino.', 'Bestiary Scroll, 300 denarii, +20 influence'),
].map((d) => [d.id, d]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUIDANCE: ObjectiveId[] = ['guidance1', 'guidance2', 'guidance3', 'guidance4', 'guidance5', 'guidance6'];
const GUIDANCE_EVENTS = ['bought', 'learned', 'boughtWeapon', 'registered', 'advanced', 'hired'];
const LEAGUE_TRAITS = ['BacchusChampion', 'JupiterChampion', 'VulcanChampion', 'AnnumChampion'] as const;
const PIT_TRAITS = ['PitChampion', 'PitLegend', 'BaneOfTigris'] as const;

const flag = (o: ObjectiveState, name: string): boolean => !!(o.data?.ev as Record<string, boolean> | undefined)?.[name];
const counter = (s: GameState, name: string): number => s.player.counters[`ev:${name}`] ?? 0;
const inf = (s: GameState, n: number) => { addInfluence(s, me(s), n); };
const cash = (s: GameState, n: number) => { me(s).denarii += n; };

export function ascensionTrophiesNeeded(s: GameState): number {
  return asc(s, ASC.mars) ? 5 : 4;
}

function guidanceProgress(s: GameState, o: ObjectiveState, i: number): number {
  const me_ = me(s);
  if (counter(s, GUIDANCE_EVENTS[i]) > 0 || flag(o, GUIDANCE_EVENTS[i])) return 1;
  switch (i) {
    case 0: return me_.creatures.length > 0 ? 1 : 0;
    case 1: return 0; // only the 'learned' event counts: market dinos may arrive with techniques
    case 2: return me_.armory.some((g) => gearSlot(g.type) === 'weapon') ? 1 : 0;
    case 3: return Object.keys(s.player.registrations).length > 0 ? 1 : 0;
    case 4: return s.world.week > o.startWeek ? 1 : 0;
    case 5: return keeperCount(me_) > ((o.data?.keepers as number | undefined) ?? Infinity) ? 1 : 0;
  }
  return 0;
}

function gearSlot(t: keyof typeof GEAR): string {
  return GEAR[t]?.slot ?? '';
}

const RULES: Record<ObjectiveId, Rule> = {
  guidance1: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 0), pay: () => {} },
  guidance2: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 1), pay: () => {} },
  guidance3: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 2), pay: () => {} },
  guidance4: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 3), pay: () => {} },
  guidance5: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 4), pay: () => {} },
  guidance6: { goal: 1, progress: (s, o) => guidanceProgress(s, o, 5), pay: () => {} },
  expandLudus: {
    goal: 2, dur: 10, window: [1, 10],
    spawn: (s) => me(s).buildings.mine === 0 || me(s).buildings.trainingField === 0,
    progress: (s) => (me(s).buildings.mine >= 1 ? 1 : 0) + (me(s).buildings.trainingField >= 1 ? 1 : 0),
    pay: (s) => cash(s, 50),
  },
  recruitSpy: {
    goal: 2, window: [12, 50],
    spawn: (s) => s.world.week > 10 && me(s).buildings.residence >= 1,
    progress: (s) => (me(s).buildings.residence >= 3 ? 1 : 0) + (me(s).keepers.spies >= 1 ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('camoHide', 1, { augment: 'Reinforced' })); },
  },
  whereDoesItHurt: {
    goal: 2, window: [4, 50],
    spawn: (s) => me(s).creatures.some((c) => c.traits.some((t) => TRAITS[t]?.wound)),
    progress: (s, o) => (me(s).buildings.veterinarium >= 1 ? 1 : 0) + (flag(o, 'surgery') ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('fangCaps', 1, { augment: 'Precision' })); inf(s, 5); },
  },
  imperator: {
    goal: 1, window: [15, 50],
    spawn: (s) => s.world.horde.expeditionsEnabled && hordeSize(s) > 20,
    progress: (s, o) => (flag(o, 'expedition') ? 1 : 0),
    pay: (s) => { cash(s, 200); inf(s, 10); },
  },
  security: {
    goal: 2, dur: 10, window: [15, 80],
    spawn: (s) => me(s).keepers.wardens < 5 && (hordeSize(s) > 8 || s.world.horde.rogues.length > 2),
    progress: (s) => (me(s).keepers.wardens >= 5 ? 1 : 0) + (me(s).buildings.palisade >= 1 ? 1 : 0),
    pay: (s) => { cash(s, 50); inf(s, 5); },
  },
  poison: {
    goal: 1, dur: 10, window: [6, 30],
    spawn: (s) => {
      if (s.world.week <= 6) return false;
      const v = rivalByKey(s, 'vettius');
      const g = findLegend(s, 'gigantus');
      return !!v && !!g && g.house === v && canFight(g.creature);
    },
    progress: (s, o) => (flag(o, 'poisonGigantus') ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('huntersHood', 1, { augment: 'Reinforced' })); cash(s, 50); inf(s, 5); },
  },
  saddleUp: {
    goal: 2, dur: 20, window: [20, 100],
    spawn: (s) => {
      const h = me(s);
      return h.buildings.saddlery === 0 && h.buildings.residence > 1 && h.denarii > 300 && h.influence >= 120 && keeperCount(h) >= 10;
    },
    progress: (s, o) => (me(s).buildings.saddlery >= 1 ? 1 : 0) + (flag(o, 'mounted') || me(s).armory.some((g) => gearSlot(g.type) === 'rider') ? 1 : 0),
    pay: (s) => { cash(s, 100); inf(s, 10); },
  },
  ascension: {
    goal: (s) => ascensionTrophiesNeeded(s) + 3, window: [25, 1000],
    spawn: (s) => s.world.week > 20 && firstPlaces(me(s)) >= 1 && !s.ascended,
    progress: (s) => {
      const need = ascensionTrophiesNeeded(s);
      const trophies = firstPlaces(me(s)) + (s.player.senator ? 1 : 0);
      return Math.min(trophies, need) + (s.world.horde.defeated ? 1 : 0) + (me(s).buildings.shrine >= 1 ? 1 : 0) + (s.ascended ? 1 : 0);
    },
    pay: (s) => { giveGear(me(s), newGear('parryingSpurs', 4, { augment: 'Blessed' })); },
  },
  exertInfluence: {
    goal: 1, dur: 10, window: [3, 200],
    spawn: (s) => me(s).influence >= 15,
    progress: (s, o) => (flag(o, 'influenceAction') || s.player.opportunities.length > ((o.data?.opps as number | undefined) ?? Infinity) ? 1 : 0),
    pay: (s) => cash(s, 50),
  },
  organize: {
    goal: 2, dur: 25, window: [50, 400],
    spawn: (s) => me(s).influence >= 150,
    // tournaments.ts counts player.organized and counters.organizedWon; events are honoured too
    progress: (s, o) => (flag(o, 'organized') || s.player.organized > ((o.data?.organized as number | undefined) ?? Infinity) ? 1 : 0)
      + (flag(o, 'wonOwn') || (s.player.counters.organizedWon ?? 0) > ((o.data?.organizedWon as number | undefined) ?? Infinity) ? 1 : 0),
    pay: (s) => { cash(s, 100); inf(s, 10); },
  },
  thievery: {
    goal: 1, dur: 15, window: [8, 200],
    spawn: (s) => s.world.week > 6 && me(s).denarii < 300 && s.rivals.some((r) => !r.defeated && r.denarii > 800),
    progress: (s, o) => (flag(o, 'steal') ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('hornLance', 1, { augment: 'Blessed' })); cash(s, 50); },
  },
  beastNaming: {
    goal: 1, window: [9, 200], chance: 0.5,
    spawn: (s) => s.world.week > 8 && me(s).creatures.some((c) => c.kind === 'beast'),
    progress: (s, o) => (flag(o, 'renamedBeast') ? 1 : 0),
    pay: (s) => inf(s, 5),
  },
  pythia1: {
    goal: 4,
    progress: (s) => Math.min(4, me(s).creatures.filter((c) => c.fame >= 1000).length),
    pay: (s) => inf(s, 10),
  },
  pythia1Alt: {
    goal: 10000,
    progress: (s) => Math.min(10000, Math.floor(me(s).influence)),
    pay: (s) => inf(s, 10),
  },
  pythia2: { goal: 1, progress: (s, o) => (flag(o, 'delphi') ? 1 : 0), pay: (s) => inf(s, 10) },
  pythia3: {
    goal: 2,
    progress: (s) => {
      const n = neokoros(s);
      if (!n) return 0;
      return (LEAGUE_TRAITS.some((t) => n.traits.includes(t)) ? 1 : 0) + (PIT_TRAITS.some((t) => n.traits.includes(t)) ? 1 : 0);
    },
    pay: (s) => inf(s, 25),
  },
  pythia4: {
    goal: 2,
    progress: (s) => (keeperCount(me(s)) >= 100 ? 1 : 0) + (me(s).denarii >= 10000 ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('fangCaps', 5, { unique: 'danaidDagger' })); inf(s, 100); },
  },
  godsChosen: {
    goal: 1,
    progress: (s, o) => (flag(o, 'prophecy') ? 1 : 0),
    pay: (s) => { cash(s, 1000); giveGear(me(s), newGear('cyclopsEye', 2)); },
  },
  trainLoaned: {
    goal: 2, dur: 10,
    progress: (s, o) => {
      const c = me(s).creatures.find((x) => x.id === o.data?.creatureId);
      if (!c) return 0;
      const stats = rawTotal(c) - ((o.data?.baseStats as number) ?? 0);
      const fame = c.fame - ((o.data?.baseFame as number) ?? 0);
      return (stats >= 5 ? 1 : 0) + (fame >= 100 ? 1 : 0);
    },
    pay: (s) => { cash(s, 100); inf(s, 25); },
  },
  firstClutch: {
    goal: 1, window: [2, 100000],
    spawn: (s) => me(s).buildings.breedingPen >= 1 || hasAdultPair(s),
    progress: (s, o) => (flag(o, 'egg') || counter(s, 'egg') > 0 || s.runStats.hatched > 0
      || me(s).eggs.some((e) => e.fertilized && e.source === 'bred')
      || me(s).creatures.some((c) => !!c.pregnancy) ? 1 : 0),
    pay: (s) => { cash(s, 150); inf(s, 5); },
  },
  imprintBaby: {
    goal: 1, window: [2, 100000],
    spawn: (s) => s.runStats.hatched > 0 || me(s).creatures.some((c) => c.genes.bred && c.maturity < 1),
    progress: (s, o) => (flag(o, 'imprinted') || me(s).creatures.some((c) => c.genes.bred && isAdult(c) && c.genes.imprint >= 0.999) ? 1 : 0),
    pay: (s) => { giveGear(me(s), newGear('luckyTooth', 2)); inf(s, 10); },
  },
  bloodline: {
    goal: 3, window: [2, 100000],
    spawn: (s) => me(s).creatures.some((c) => c.genes.bred && c.genes.generation >= 1),
    progress: (s) => Math.min(3, Math.max(s.runStats.maxGeneration, ...me(s).creatures.map((c) => (c.genes.bred ? c.genes.generation : 0)))),
    pay: (s) => { giveGear(me(s), newGear('bestiaryScroll', 2)); cash(s, 300); inf(s, 20); },
  },
};

function hasAdultPair(s: GameState): boolean {
  const adults = me(s).creatures.filter((c) => isAdult(c) && SPECIES[c.species].repro !== 'none');
  return adults.some((m) => m.sex === 'M' && adults.some((f) => f.sex === 'F' && f.species === m.species));
}

function neokoros(s: GameState) {
  const id = s.player.storyData.pythiaVisions?.neokorosId as string | undefined;
  return me(s).creatures.find((c) => (id && c.id === id) || c.legend === 'neokoros');
}

function goalOf(s: GameState, id: ObjectiveId): number {
  const g = RULES[id].goal;
  return typeof g === 'function' ? g(s) : g;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function objectiveDef(id: ObjectiveId): ObjectiveDef | undefined { return OBJECTIVES[id]; }

/** The current record of an objective (latest one if it was re-spawned). */
export function findObjective(state: GameState, id: ObjectiveId): ObjectiveState | undefined {
  const list = state.player.objectives;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) return list[i];
  return undefined;
}

export function activeObjectives(state: GameState): ObjectiveState[] {
  return state.player.objectives.filter((o) => !o.done && !o.failed);
}

/** Add an objective (stories, guidance chain, weekly spawns). Returns the existing record if already active. */
export function spawnObjective(state: GameState, id: ObjectiveId, data: Record<string, unknown> = {}, quiet = false): ObjectiveState {
  const cur = findObjective(state, id);
  if (cur && !cur.done && !cur.failed) return cur;
  const rule = RULES[id];
  const week = state.world.week;
  const o: ObjectiveState = {
    id, startWeek: week, progress: 0, goal: goalOf(state, id), done: false, claimed: false, data: { ev: {}, ...data },
  };
  if (rule.dur) o.deadline = week + rule.dur;
  state.player.objectives.push(o);
  const def = OBJECTIVES[id];
  if (!quiet && def && !id.startsWith('guidance')) {
    message(state, 'assistant', `New objective: ${def.title}`, `${def.desc}${rule.dur ? ` You have ${rule.dur} weeks.` : ''} Reward: ${def.reward}.`);
  }
  return o;
}

export function seedObjectives(state: GameState): void {
  if (state.world.ascension === 0) {
    spawnObjective(state, 'guidance1', { keepers: keeperCount(state.player.ludus) }, true);
  }
  spawnPass(state, false);
  evaluate(state);
}

/** Weekly + on-action progress checks; spawns objectives whose window opens. Runs once per resolved week. */
export function checkObjectives(state: GameState): void {
  // being called at all means the week was advanced (Getting started 5/6)
  const c = state.player.counters;
  c['ev:advanced'] = (c['ev:advanced'] ?? 0) + 1;
  spawnPass(state, true);
  evaluate(state);
}

function spawnPass(state: GameState, roll: boolean): void {
  const week = state.world.week;
  for (const id of Object.keys(RULES) as ObjectiveId[]) {
    const r = RULES[id];
    if (!r.window || !r.spawn) continue;
    if (week < r.window[0] || week > r.window[1]) continue;
    if (state.player.objectives.some((o) => o.id === id)) continue;
    if (!r.spawn(state)) continue;
    if (r.chance !== undefined && (!roll || !chance(r.chance))) continue;
    spawnObjective(state, id, {
      opps: state.player.opportunities.length, keepers: keeperCount(me(state)), organized: state.player.organized,
      organizedWon: state.player.counters.organizedWon ?? 0,
    });
  }
}

function evaluate(state: GameState): void {
  let guard = 12;
  let changed = true;
  while (changed && guard-- > 0) {
    changed = false;
    for (const o of [...state.player.objectives]) {
      if (o.done || o.failed) continue;
      const rule = RULES[o.id];
      if (!rule) continue;
      if (o.id === 'pythia3' && !neokoros(state) && state.player.storyData.pythiaVisions?.neokorosId) {
        // Neokoros died: back to Delphi with another bonded dino
        o.failed = true;
        resetPythia2(state);
        changed = true;
        continue;
      }
      if (o.id === 'trainLoaned' && !me(state).creatures.some((c) => c.id === o.data?.creatureId)) {
        o.failed = true;
        changed = true;
        continue;
      }
      o.goal = goalOf(state, o.id);
      o.progress = Math.min(o.goal, rule.progress(state, o));
      if (o.progress >= o.goal) {
        completeRecord(state, o);
        changed = true;
      } else if (o.deadline !== undefined && state.world.week > o.deadline) {
        o.failed = true;
        changed = true;
        const def = OBJECTIVES[o.id];
        if (def && !o.id.startsWith('guidance')) message(state, 'assistant', `Objective failed: ${def.title}`, 'We ran out of time.');
      }
    }
  }
}

function resetPythia2(state: GameState): void {
  const p2 = findObjective(state, 'pythia2');
  if (p2) {
    p2.done = false;
    p2.failed = false;
    p2.progress = 0;
    p2.data = { ...(p2.data ?? {}), ev: {} };
  } else {
    spawnObjective(state, 'pythia2');
  }
  storyResetDelphi(state);
  message(state, 'oracle', 'Neokoros has fallen', 'The blind servant of Apollo is dead. The Pythia demands that another bonded dino be sent to Delphi.');
}

function completeRecord(state: GameState, o: ObjectiveState): void {
  o.done = true;
  o.progress = o.goal;
  const def = OBJECTIVES[o.id];
  const gi = GUIDANCE.indexOf(o.id);
  if (gi >= 0) {
    o.claimed = true;
    if (gi < GUIDANCE.length - 1) {
      spawnObjective(state, GUIDANCE[gi + 1], { keepers: keeperCount(me(state)) }, true);
    } else {
      unlockAchievement(state, 'student');
      message(state, 'assistant', 'You know the ropes', 'You have completed every "Getting started" objective. Capua is yours to conquer.');
    }
    return;
  }
  if (def) message(state, 'assistant', `Objective complete: ${def.title}`, `Claim your reward on the Objectives screen: ${def.reward}.`);
  switch (o.id) {
    case 'pythia1': case 'pythia1Alt': spawnObjective(state, 'pythia2'); break;
    case 'pythia2': spawnObjective(state, 'pythia3'); break;
    case 'pythia3': spawnObjective(state, 'pythia4'); break;
    case 'pythia4':
      unlockAchievement(state, 'conduitOfTheGods');
      startGodsChosen(state);
      break;
    case 'godsChosen': unlockAchievement(state, 'prophecy'); break;
    default: break;
  }
}

/** Force-complete an active objective (story outcomes). */
export function completeObjective(state: GameState, id: ObjectiveId): boolean {
  const o = findObjective(state, id);
  if (!o || o.done || o.failed) return false;
  completeRecord(state, o);
  evaluate(state);
  return true;
}

export function failObjective(state: GameState, id: ObjectiveId): boolean {
  const o = findObjective(state, id);
  if (!o || o.done || o.failed) return false;
  o.failed = true;
  return true;
}

/** Pay the reward. Returns null on success, else why it cannot be claimed. */
export function claimObjective(state: GameState, id: ObjectiveId): string | null {
  const list = state.player.objectives.filter((x) => x.id === id);
  const o = list.find((x) => x.done && !x.claimed) ?? list[list.length - 1];
  if (!o) return 'No such objective.';
  if (o.claimed) return 'Reward already claimed.';
  if (!o.done) return o.failed ? 'This objective has failed.' : 'Not completed yet.';
  o.claimed = true;
  RULES[id].pay(state);
  const def = OBJECTIVES[id];
  if (def && def.reward !== '–') message(state, 'assistant', `Reward: ${def.title}`, `You received ${def.reward}.`);
  return null;
}

/** Instant progress from UI actions (bought creature, learned technique, registered…). */
export function objectiveEvent(state: GameState, event: string): void {
  const c = state.player.counters;
  c[`ev:${event}`] = (c[`ev:${event}`] ?? 0) + 1;
  const names = [event];
  if (event.startsWith('poison:') && event.slice(7).toLowerCase().includes('gigantus')) names.push('poisonGigantus');
  if (event === 'expedition:victory' || event === 'expeditionVictory') names.push('expedition');
  if (event === 'wonOrganized') names.push('wonOwn');
  if (event === 'boughtCreature') names.push('bought');
  if (event === 'influence' || event.startsWith('opportunity:')) names.push('influenceAction');
  if (event === 'boughtRider') names.push('mounted');
  for (const o of activeObjectives(state)) {
    o.data ??= {};
    const ev = (o.data.ev ??= {}) as Record<string, boolean>;
    for (const n of names) ev[n] = true;
  }
  for (const n of names) if (n !== event) c[`ev:${n}`] = (c[`ev:${n}`] ?? 0) + 1;
  if (event === 'registered') storyCheck(state);
  evaluate(state);
}

/** "3/4" style progress for the UI. */
export function objectiveProgressText(o: ObjectiveState): string {
  if (o.id === 'pythia1Alt') return `${o.progress.toLocaleString('en-US')} / ${o.goal.toLocaleString('en-US')} influence`;
  return `${o.progress}/${o.goal}`;
}

export type { ObjectiveState };
