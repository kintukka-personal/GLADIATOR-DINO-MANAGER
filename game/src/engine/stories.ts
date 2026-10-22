// Storylines (19 GM + stud request) as chat conversations. OWNER: systems-story agent. GM 04 §3–4.
//
// Progress lives in player.stories[id] as a readable step (0 = not started, DONE = 99 = finished); the
// initiating rival's id and other story state live in player.storyData[id]. Conversations wait in
// player.conversations; activeConversation offers the first ready one (GM: one story at a time).
//
// Contracts with other modules:
// - storyHook(state, 'matchResult', { opponentHouseId, won })      tournaments, after every player match
// - storyHook(state, 'intrigue', { action, targetHouseId, success, killed? })   intrigue.ts (done)
// - storyHook(state, 'kill', { victimHouseId, victimId?, byPlayer? })            combat/tournaments/events
// - storyHook(state, 'tournamentWon', { type, key?, tournamentId?, organizerId? })  tournaments (player wins)
// - storyHook(state, 'tournamentRound', { type, round })                         tournaments (Troy bonus rounds)
// - storyHook(state, 'adventure', { key, success, data })                        adventures.ts (done)
// - player.stories.spartacusEscape = 1 at the humiliation beat, and 6 when Spartacus joins the Horde after
//   the player helped (horde.ts, done). flags.troyStage ≥ 1 after the Troy escort (adventures.ts, done).
// - The tournaments module schedules the Prophecy tournament at flags.prophecyWeek and the Trojan Games at
//   flags.troyWeek. Story adventures pay their own rewards (adventures.ts); stories only keep the books.
import type { Creature, GameState, ID, Ludus, RivalKey, StoryActor, StoryConversation, StoryLineId, UpgradeId } from './types';
import * as T from './data/storiesData';
import type { ConvText } from './data/storiesData';
import { SPECIES } from './data/species';
import { gearName } from './data/gear';
import { chance, coin, rand, clamp } from './rng';
import { newId, message, hasUpgrade, visibleRivals, activeRivals } from './util';
import { addTrait, hasTrait, isAdult, isBreedable, geneticScore, generateDino, makeNamed } from './creature';
import { addInfluence, addKeepers, loseKeepers, committedSpies, keeperCount } from './economy';
import { sendOnAdventure } from './adventures';
import { makeLegend } from './rivals';
import { bury } from './care';
import { breedingIssue, parentGenes, rollOffspringGenes, makeNewborn, inheritTraits, registerAncestor } from './breeding';
import { spawnObjective, completeObjective, findObjective, objectiveEvent } from './objectives';
import { unlockAchievement } from './achievements';
import {
  DONE, me, newGear, giveGear, takeGear, ownsUnique, firstPlaces, totalFame, rawTotal, available, champion, bestTwo,
  mostCunning, strongestWeapon, rivalByKey, rivalById, strongestRival, shiftOpinion, hatedOf, hasSenateInfluence, topFame,
  moveCreature, dominusTitle,
} from './data/storiesDataUtil';

export { DONE };

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

/** The six lanistae who can start "dominus" storylines (GM getNumberForDominus). */
const DOMINUS: RivalKey[] = ['solonius', 'batiatus', 'vettius', 'decimus', 'caesar', 'magnus'];
const RIVAL_ACTORS: StoryActor[] = ['solonius', 'batiatus', 'vettius', 'decimus', 'caesar', 'magnus', 'crassus', 'hannibal'];

function actorOf(r: Ludus | undefined): StoryActor {
  const k = r?.ai?.key;
  return k && (RIVAL_ACTORS as string[]).includes(k) ? (k as StoryActor) : 'unknown';
}

/** Per-story state bag in player.storyData. */
function sd(state: GameState, story: StoryLineId): Record<string, any> {
  const bag = state.player.storyData;
  if (!bag[story] || typeof bag[story] !== 'object') bag[story] = {};
  return bag[story];
}

function prog(state: GameState, story: StoryLineId): number {
  return state.player.stories[story] ?? 0;
}

function setProg(state: GameState, story: StoryLineId, n: number): void {
  state.player.stories[story] = n;
}

export function storyProgress(state: GameState, s: StoryLineId): number { return state.player.stories[s] ?? 0; }

function pendingConv(state: GameState, story: StoryLineId, kind?: string): StoryConversation | undefined {
  return state.player.conversations.find((c) => c.story === story && (!kind || c.data.kind === kind));
}

/** Queue a conversation. Rival lines written for 'unknown' get the rival's portrait. */
function queue(state: GameState, story: StoryLineId, kind: string, actor: StoryActor, text: ConvText, data: Record<string, any> = {}, rival?: Ludus): StoryConversation {
  const who = rival ? actorOf(rival) : actor;
  const lines = text.lines.map((l) => (l.actor === 'unknown' && rival ? { ...l, actor: who } : l));
  if (rival && who === 'unknown') lines.unshift({ actor: 'narrator', text: `${rival.name} pays you a visit.` });
  const conv: StoryConversation = {
    id: newId('s'), story, step: prog(state, story), actor: who, title: text.title, lines,
    options: text.options.map((o) => ({ ...o })),
    data: { kind, week: state.world.week, rivalId: rival?.id, speaker: rival?.name, ...data },
  };
  state.player.conversations.push(conv);
  return conv;
}

function removeConv(state: GameState, id: ID): void {
  state.player.conversations = state.player.conversations.filter((c) => c.id !== id);
}

function relabel(conv: StoryConversation, i: number, label: string | undefined): void {
  if (label && conv.options[i]) conv.options[i].label = label;
}

function disable(conv: StoryConversation, i: number, reason: string | null): void {
  const o = conv.options[i];
  if (!o) return;
  if (reason) { o.disabled = true; o.reason = reason; } else { delete o.disabled; delete o.reason; }
}

const fmtD = (n: number) => `${n.toLocaleString('en-US')} denarii`;
const inf = (state: GameState, n: number) => addInfluence(state, me(state), n);
const cash = (state: GameState, n: number) => { me(state).denarii += n; };
const mine = (state: GameState, id: ID | undefined) => (id ? me(state).creatures.find((c) => c.id === id) : undefined);
const isAvailable = (state: GameState, c: Creature | undefined) => !!c && available(me(state)).includes(c);
const opinion = (r: Ludus) => r.ai?.opinion ?? 50;
const doctoreLevel = (h: Ludus) => h.creatures.find((c) => c.id === h.doctoreId)?.level ?? 0;

function changeTameness(c: Creature, delta: number): void {
  c.loyalty = clamp(c.loyalty + delta, 0, 100);
}

function newRogue(state: GameState): Creature {
  const c = generateDino({ tier: 'epic', week: state.world.week, level: Math.floor(state.world.week / 10) + 1 });
  addTrait(c, 'Escaped');
  c.loyalty = 0;
  state.world.horde.rogues.push(c);
  return c;
}

function neokoros(state: GameState): Creature {
  try {
    const c = makeLegend(state, 'neokoros');
    if (c) return c;
  } catch {
    /* fall back below */
  }
  return makeNamed('troodon', 'Neokoros', { str: 6, agi: 8, cun: 12, hp: 30 }, {
    legend: 'neokoros', level: 3, eqAge: 22, traits: ['Blind', 'BlindFighter', 'Devotion'],
  });
}

// ---------------------------------------------------------------------------
// Conversation handlers
// ---------------------------------------------------------------------------

interface Handler {
  /** still makes sense (rival alive, creature present…); false drops it */
  valid?: (s: GameState, c: StoryConversation) => boolean;
  /** offered now? (otherwise it waits, e.g. for money) */
  ready?: (s: GameState, c: StoryConversation) => boolean;
  /** recompute disabled options */
  refresh?: (s: GameState, c: StoryConversation) => void;
  answer: (s: GameState, c: StoryConversation, option: number) => string;
  /** called when the conversation is dropped (invalid or expired). Default: the story ends. */
  dropped?: (s: GameState, c: StoryConversation) => void;
  /** weeks before an unanswered conversation expires (default 8) */
  ttl?: number;
}

const H: Record<string, Handler> = {};
const key = (c: StoryConversation) => `${c.story}:${c.data.kind}`;
const rivalOf = (s: GameState, c: StoryConversation) => rivalById(s, c.data.rivalId);
const rivalAlive = (s: GameState, c: StoryConversation) => !!rivalOf(s, c);

// --- Solonius Throw ------------------------------------------------------------------------------

function soloniusTrigger(state: GameState): void {
  if (state.world.week !== 1 || prog(state, 'soloniusThrow') !== 0) return;
  if (Object.keys(state.player.stories).length) return;
  const sol = rivalByKey(state, 'solonius');
  const t = state.world.tournaments.find((x) => x.key === 'romesFinest');
  if (!sol || !t || !state.player.registrations[t.id]) return;
  setProg(state, 'soloniusThrow', 1);
  Object.assign(sd(state, 'soloniusThrow'), { rival: sol.id, tournamentId: t.id });
  queue(state, 'soloniusThrow', 'offer', 'solonius', T.soloniusOffer(state.player.lanista, dominusTitle(state)), {}, sol);
}

H['soloniusThrow:offer'] = {
  valid: (s, c) => rivalAlive(s, c) && s.world.week <= 1,
  answer: (s, c, o) => {
    const r = rivalOf(s, c);
    if (o === 0) {
      shiftOpinion(r, 5);
      setProg(s, 'soloniusThrow', 2);
      return 'The deal is struck: lose to Solonius in Rome\'s Finest and 300 denarii are yours (opinion +5).';
    }
    shiftOpinion(r, -10);
    setProg(s, 'soloniusThrow', DONE);
    return 'Solonius storms off (opinion −10).';
  },
};

/** Pre-match taunt from Solonius if the throw deal is on (UI flavour). */
export function storyTaunt(state: GameState, opponentHouseId: ID | undefined): string | null {
  if (prog(state, 'soloniusThrow') !== 2) return null;
  if (!opponentHouseId || opponentHouseId !== sd(state, 'soloniusThrow').rival) return null;
  return T.SOLONIUS_TAUNT(dominusTitle(state), state.player.lanista);
}

function soloniusWeek(state: GameState): void {
  const p = prog(state, 'soloniusThrow');
  if ((p === 1 || p === 2) && state.world.week > 1) {
    const c = pendingConv(state, 'soloniusThrow');
    if (c) removeConv(state, c.id);
    setProg(state, 'soloniusThrow', DONE);
  }
}

// --- Loan Request --------------------------------------------------------------------------------

H['loanRequest:ask'] = {
  valid: rivalAlive,
  refresh: (s, c) => disable(c, 0, me(s).denarii < 300 ? 'You need 300 denarii.' : null),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 0) {
      cash(s, -300);
      r.denarii += 300;
      shiftOpinion(r, 15);
      setProg(s, 'loanRequest', 2);
      sd(s, 'loanRequest').week = s.world.week;
      return `You lend ${r.name} 300 denarii (opinion +15). He swears to repay 400.`;
    }
    shiftOpinion(r, o === 1 ? -5 : -15);
    setProg(s, 'loanRequest', DONE);
    return `${r.name} leaves empty-handed (opinion ${o === 1 ? '−5' : '−15'}).`;
  },
};

H['loanRequest:repay'] = {
  valid: rivalAlive,
  ttl: 20,
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const amount = o === 0 ? 300 : 400;
    cash(s, amount);
    r.denarii -= amount;
    shiftOpinion(r, o === 0 ? 5 : -5);
    setProg(s, 'loanRequest', DONE);
    return `+${fmtD(amount)} (opinion ${o === 0 ? '+5' : '−5'}).`;
  },
  dropped: (s) => setProg(s, 'loanRequest', DONE),
};

function loanWeek(state: GameState): void {
  if (prog(state, 'loanRequest') !== 2) return;
  const r = rivalById(state, sd(state, 'loanRequest').rival);
  if (!r) {
    message(state, 'informant', 'A debt buried', 'The house that owed you 300 denarii is no more. The debt died with it.');
    setProg(state, 'loanRequest', DONE);
    return;
  }
  if (r.denarii > 300 && !pendingConv(state, 'loanRequest')) {
    setProg(state, 'loanRequest', 3);
    queue(state, 'loanRequest', 'repay', 'unknown', T.loanRepay(r.name), {}, r);
  }
}

// --- Murder Plot ---------------------------------------------------------------------------------

H['murderPlot:pitch'] = {
  valid: (s, c) => rivalAlive(s, c) && !!rivalById(s, c.data.targetId),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const target = rivalById(s, c.data.targetId);
    if (o === 0) {
      shiftOpinion(r, 10);
      shiftOpinion(target, -5);
      addKeepers(me(s), 1, 'spies');
      setProg(s, 'murderPlot', 2);
      Object.assign(sd(s, 'murderPlot'), { rival: r.id, target: target?.id, deadline: s.world.week + 10 });
      return `A new spy joins your ludus. Kill one of House ${target?.name ?? '?'}'s dinos within 10 weeks (opinion +10).`;
    }
    shiftOpinion(r, -15);
    shiftOpinion(target, 5);
    setProg(s, 'murderPlot', DONE);
    return 'You refuse (opinion −15).';
  },
};

H['murderPlot:failed'] = {
  ttl: 99,
  answer: (s, c) => {
    shiftOpinion(rivalOf(s, c), -10);
    setProg(s, 'murderPlot', DONE);
    return 'Opinion −10.';
  },
};

function murderWeek(state: GameState): void {
  if (prog(state, 'murderPlot') !== 2) return;
  const d = sd(state, 'murderPlot');
  const r = rivalById(state, d.rival);
  if (!r || !rivalById(state, d.target)) {
    setProg(state, 'murderPlot', DONE);
    return;
  }
  if (state.world.week > d.deadline) {
    shiftOpinion(r, -5);
    setProg(state, 'murderPlot', 3);
    queue(state, 'murderPlot', 'failed', 'unknown', T.murderFailed(rivalById(state, d.target)?.name ?? '?'), {}, r);
  }
}

// --- Carthaginian Artifact -----------------------------------------------------------------------

H['carthaginianArtifact:offer'] = {
  valid: rivalAlive,
  ready: (s) => me(s).denarii >= 400,
  refresh: (s, c) => disable(c, 0, me(s).denarii < c.data.price ? `You need ${c.data.price} denarii.` : null),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 0) {
      cash(s, -c.data.price);
      r.denarii += c.data.price;
      shiftOpinion(r, 5);
      setProg(s, 'carthaginianArtifact', 2);
      return `You pay ${fmtD(c.data.price)}. The breastplate goes to a Carthaginian smith in the Oscan quarter (opinion +5).`;
    }
    shiftOpinion(r, -5);
    setProg(s, 'carthaginianArtifact', DONE);
    return 'Opinion −5.';
  },
};

function carthageWeek(state: GameState): void {
  if (prog(state, 'carthaginianArtifact') !== 2) return;
  const w = state.world.week;
  if (w <= 50 || w % 6 !== 0) return;
  const relic = hasUpgrade(state, 'carthaginianArtifacts');
  const g = giveGear(me(state), relic ? newGear('bronzeBarding', 5, { unique: 'ksourEssef' }) : newGear('bronzeBarding', 4));
  message(state, 'assistant', 'The Carthaginian smith', relic
    ? 'The Carthaginian smith has finished: the old breastplate is reborn as Ksour Essef, barding fit for a war-saurian of Carthage.'
    : `The Carthaginian smith has finished. It is no relic, but it is fine work: ${gearName(g)}.`);
  setProg(state, 'carthaginianArtifact', DONE);
}

// --- Macedonian Rebels (Caesar) ---------------------------------------------------------------

H['macedonianRebels:pitch'] = {
  valid: rivalAlive,
  refresh: (s, c) => {
    const ch = champion(me(s), { dinoOnly: true });
    c.data.creatureId = ch?.id;
    relabel(c, 0, ch && `You have my vote and ${ch.name}`);
    disable(c, 0, ch ? null : 'You have no dino fit to march.');
  },
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 0) {
      const ch = mine(s, c.data.creatureId)!;
      shiftOpinion(r, 10);
      r.denarii += 200;
      r.influence += 20;
      sendOnAdventure(s, 'macedon', [ch.id], 3, { story: 'macedonianRebels', rivalId: r.id }, 'The Macedonian rebels');
      setProg(s, 'macedonianRebels', 2);
      sd(s, 'macedonianRebels').rival = r.id;
      return `${ch.name} marches with Caesar's column for 3 weeks (opinion +10).`;
    }
    shiftOpinion(r, -15);
    setProg(s, 'macedonianRebels', DONE);
    return 'Caesar\'s smile freezes (opinion −15).';
  },
};

// --- Spartacus Escape --------------------------------------------------------------------------

function spartacusOwner(state: GameState): Ludus | undefined {
  return rivalById(state, sd(state, 'spartacusEscape').owner ?? state.player.storyData.spartacusEscapeHouse) ?? rivalByKey(state, 'batiatus');
}

function spartacusAt(h: Ludus | undefined): Creature | undefined {
  return h?.creatures.find((c) => c.legend === 'spartacus');
}

H['spartacusEscape:alley'] = {
  valid: (s) => !!spartacusAt(spartacusOwner(s)),
  answer: (s, c, o) => {
    const owner = spartacusOwner(s)!;
    const sp = spartacusAt(owner)!;
    changeTameness(sp, 25);
    if (o === 0) {
      shiftOpinion(owner, 10);
      owner.influence += 5;
      setProg(s, 'spartacusEscape', DONE);
      return `${owner.name} thanks you for the warning (opinion +10). Spartacus will remember this.`;
    }
    if (o === 1) {
      shiftOpinion(owner, -5);
      owner.influence = Math.max(0, owner.influence - 5);
      setProg(s, 'spartacusEscape', DONE);
      return `You walk away. Word of the meeting reaches ${owner.name} anyway (opinion −5).`;
    }
    cash(s, 100);
    shiftOpinion(owner, -10);
    owner.influence = Math.max(0, owner.influence - 10);
    loseKeepers(s, owner, 1, 'wardens');
    loseKeepers(s, owner, 1);
    for (const x of owner.creatures) if (x !== sp) changeTameness(x, -10);
    setProg(s, 'spartacusEscape', 4);
    return `+100 denarii. ${owner.name}'s pens grow restless. Sabotage House ${owner.name} through Intrigue to set the fire.`;
  },
};

H['spartacusEscape:farewell'] = {
  ttl: 99,
  answer: (s) => {
    setProg(s, 'spartacusEscape', DONE);
    return 'Spartacus melts into the hills.';
  },
};

function spartacusWeek(state: GameState): void {
  const p = prog(state, 'spartacusEscape');
  const d = sd(state, 'spartacusEscape');
  if (p === 1 && !pendingConv(state, 'spartacusEscape')) {
    const owner = spartacusOwner(state);
    if (!owner || !spartacusAt(owner) || owner.isPlayer) {
      setProg(state, 'spartacusEscape', DONE);
      return;
    }
    d.owner = owner.id;
    setProg(state, 'spartacusEscape', 2);
    queue(state, 'spartacusEscape', 'alley', 'spartacus', T.spartacusAlley(owner.name), { ownerId: owner.id });
    return;
  }
  if (p === 6 && !pendingConv(state, 'spartacusEscape')) {
    queue(state, 'spartacusEscape', 'farewell', 'spartacus', T.spartacusFarewell());
    return;
  }
  if ((p === 4 || p === 5) && !state.world.horde.spartacusFree && !spartacusAt(spartacusOwner(state))) {
    setProg(state, 'spartacusEscape', DONE);
  }
}

function spartacusSabotage(state: GameState, data: Record<string, any>): void {
  if (prog(state, 'spartacusEscape') !== 4) return;
  const owner = spartacusOwner(state);
  if (!owner || data.targetHouseId !== owner.id || !data.success) return;
  const sp = spartacusAt(owner);
  if (!sp) {
    setProg(state, 'spartacusEscape', DONE);
    return;
  }
  loseKeepers(state, owner, 3, 'wardens');
  loseKeepers(state, owner, 3);
  addTrait(sp, 'Sneaky');
  sp.injury = null;
  for (const c of owner.creatures) changeTameness(c, -20);
  setProg(state, 'spartacusEscape', 5);
  message(state, 'spy', 'Smoke over the estate', `Flames rise over the ${owner.name} estate. In the chaos someone tends to Spartacus' wounds and loosens a few chains. The whole pen is restless.`);
}

// --- Hannibal's Sandals --------------------------------------------------------------------------

function holdsRegalia(state: GameState): boolean {
  return ownsUnique(me(state), 'hannibalsRegalia') || Number(state.world.flags.hannibalStage ?? 0) >= 3;
}

H['hannibalSandals:offer'] = {
  valid: rivalAlive,
  refresh: (s, c) => {
    const ch = champion(me(s));
    const w = strongestWeapon(me(s));
    c.data.creatureId = ch?.id;
    c.data.gearId = w?.id;
    relabel(c, 0, ch && `Give ${ch.name}`);
    relabel(c, 1, w && `Give the ${gearName(w)}`);
    disable(c, 0, ch ? null : 'No champion available.');
    disable(c, 1, w ? null : 'You have no weapon to give.');
  },
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const wraps = () => giveGear(me(s), newGear('gripWraps', 5, { unique: 'hannibalsSandals' }));
    if (o === 0) {
      const ch = mine(s, c.data.creatureId)!;
      moveCreature(me(s), r, ch);
      changeTameness(ch, 15);
      shiftOpinion(r, 10);
      wraps();
      setProg(s, 'hannibalSandals', DONE);
      return `${ch.name} leaves for House ${r.name}. Hannibal's Wraps are yours (opinion +10).`;
    }
    if (o === 1) {
      const g = takeGear(me(s), c.data.gearId);
      if (g) r.armory.push(g);
      shiftOpinion(r, 10);
      wraps();
      setProg(s, 'hannibalSandals', DONE);
      return `${g ? gearName(g) : 'Your weapon'} goes to House ${r.name}. Hannibal's Wraps are yours (opinion +10).`;
    }
    shiftOpinion(r, -15);
    giveGear(r, newGear('gripWraps', 5, { unique: 'hannibalsSandals' }));
    addKeepers(r, 1, 'spies');
    addKeepers(r, 1, 'wardens');
    if (r.denarii > 1000) {
      r.denarii -= 500;
      addKeepers(r, 3);
    }
    setProg(s, 'hannibalSandals', DONE);
    return `House ${r.name} keeps the wraps and hires guards for them (opinion −15).`;
  },
};

// --- Bow of Apollo -----------------------------------------------------------------------------

function marksman(state: GameState): Creature | undefined {
  return available(me(state), { dinoOnly: true }).find((c) => c.cls === 'spitter' && hasTrait(c, 'Marksman'));
}

H['bowOfApollo:offer'] = {
  valid: rivalAlive,
  refresh: (s, c) => {
    const m = marksman(s);
    c.data.creatureId = m?.id;
    relabel(c, 0, m && `Enter ${m.name} (100 denarii)`);
    disable(c, 0, !m ? 'Your marksman is not fit to travel.' : me(s).denarii < 100 ? 'You need 100 denarii.' : null);
  },
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 0) {
      const m = mine(s, c.data.creatureId)!;
      cash(s, -100);
      r.denarii += 100;
      shiftOpinion(r, 5);
      sendOnAdventure(s, 'apolloContest', [m.id], 2, { story: 'bowOfApollo', rivalId: r.id }, 'The contest of Apollo');
      setProg(s, 'bowOfApollo', 2);
      sd(s, 'bowOfApollo').rival = r.id;
      return `${m.name} sets off for the contest of Apollo (opinion +5).`;
    }
    shiftOpinion(r, -5);
    setProg(s, 'bowOfApollo', DONE);
    return 'Opinion −5.';
  },
};

// --- Pythia Visions & Gods' Chosen ---------------------------------------------------------------

H['pythiaVisions:visions'] = {
  ttl: 99,
  answer: (s) => {
    setProg(s, 'pythiaVisions', 2);
    spawnObjective(s, coin() ? 'pythia1' : 'pythia1Alt');
    return 'A new objective: The Oracle\'s vision (1/4).';
  },
};

function bondedFit(state: GameState): Creature | undefined {
  const b = mine(state, me(state).bondedId);
  return isAvailable(state, b) ? b : undefined;
}

H['pythiaVisions:delphi'] = {
  ttl: 6,
  refresh: (s, c) => {
    const b = bondedFit(s);
    c.data.creatureId = b?.id;
    relabel(c, 0, b && `Send ${b.name} to Delphi`);
    disable(c, 0, b ? null : 'You need a bonded dino that is fit to travel.');
  },
  answer: (s, c, o) => {
    const d = sd(s, 'pythiaVisions');
    if (o === 0) {
      const b = mine(s, c.data.creatureId)!;
      sendOnAdventure(s, 'delphi', [b.id], 2, { story: 'pythiaVisions' }, 'The trial at Delphi');
      d.delphiPending = true;
      return `${b.name} leaves for Delphi.`;
    }
    d.nextAsk = s.world.week + 4;
    return 'The Pythia will ask again.';
  },
  dropped: (s) => { sd(s, 'pythiaVisions').nextAsk = s.world.week + 2; },
};

function pythiaWeek(state: GameState): void {
  const p = prog(state, 'pythiaVisions');
  const w = state.world.week;
  if (p === 0) {
    const ready = (state.world.horde.defeated && firstPlaces(me(state)) > 1 && w > 80 - 4 * state.world.ascension) || w > 160;
    if (ready) {
      setProg(state, 'pythiaVisions', 1);
      queue(state, 'pythiaVisions', 'visions', 'pythia', T.pythiaVisions());
    }
    return;
  }
  if (p < 2) return;
  const d = sd(state, 'pythiaVisions');
  const p2 = findObjective(state, 'pythia2');
  if (p2 && !p2.done && !p2.failed && !d.delphiPending && !pendingConv(state, 'pythiaVisions', 'delphi') && w >= (d.nextAsk ?? 0)) {
    const b = mine(state, me(state).bondedId);
    queue(state, 'pythiaVisions', 'delphi', 'pythia', T.pythiaDelphi(b?.name ?? 'your bonded dino'));
  }
}

/** Neokoros died: the next bonded dino must go to Delphi (called by objectives). */
export function storyResetDelphi(state: GameState): void {
  const d = sd(state, 'pythiaVisions');
  d.delphiPending = false;
  d.nextAsk = state.world.week;
}

/** Pythia (4/4) completed: the gods demand their sacrifice (called by objectives). */
export function startGodsChosen(state: GameState): void {
  if (prog(state, 'godsChosen') !== 0 || pendingConv(state, 'godsChosen')) return;
  setProg(state, 'godsChosen', 1);
  queue(state, 'godsChosen', 'sacrifice', 'pythia', T.godsChosen());
}

H['godsChosen:sacrifice'] = {
  ttl: 9999,
  refresh: (s, c) => disable(c, 0, keeperCount(me(s)) < 100 || me(s).denarii < 10000 ? 'You need 100 keepers and 10,000 denarii.' : null),
  answer: (s, c, o) => {
    if (o === 0) {
      loseKeepers(s, me(s), 100);
      cash(s, -10000);
      s.world.flags.prophecyWeek = s.world.week + 5;
      spawnObjective(s, 'godsChosen');
      setProg(s, 'godsChosen', 2);
      return `The sacrifice is made. The Prophecy tournament will be held in week ${s.world.week + 5}.`;
    }
    setProg(s, 'godsChosen', DONE);
    return 'The Pythia leaves Capua.';
  },
};

function godsChosenWeek(state: GameState): void {
  if (prog(state, 'godsChosen') !== 2) return;
  const o = findObjective(state, 'godsChosen');
  if (!o || o.done || o.failed) return;
  const at = Number(state.world.flags.prophecyWeek ?? 0);
  if (at < state.world.week) {
    state.world.flags.prophecyWeek = state.world.week + 5;
    message(state, 'oracle', 'The Prophecy awaits', `The gods have not yet seen their chosen. The Prophecy tournament is called again for week ${state.world.week + 5}.`);
  }
}

function prophecyWon(state: GameState): void {
  if (prog(state, 'godsChosen') !== 2) return;
  objectiveEvent(state, 'prophecy');
  completeObjective(state, 'godsChosen');
  inf(state, 25);
  unlockAchievement(state, 'prophecy');
  if (state.world.ascension >= 3) unlockAchievement(state, 'divine');
  state.world.flags.prophecyWon = Math.min(16, state.world.ascension + 1);
  setProg(state, 'godsChosen', DONE);
  message(state, 'oracle', 'The Prophecy is fulfilled', 'The gods\' chosen lie broken on the sand. Capua will speak of this for a thousand years, and a new path to the heavens has opened (+25 influence; claim your reward on the Objectives screen).');
}

// --- Spartacus' Bounty -------------------------------------------------------------------------

H['spartacusBounty:offer'] = {
  valid: (s, c) => !!rivalById(s, c.data.aId) && !!rivalById(s, c.data.bId) && s.world.horde.spartacusFree && !s.world.horde.spartacusDead,
  ready: (s) => me(s).denarii >= 500,
  answer: (s, c, o) => {
    if (o === 0) {
      for (const r of activeRivals(s)) shiftOpinion(r, 5);
      setProg(s, 'spartacusBounty', DONE);
      return 'Every rival lanista hears you sent Spartacus packing (opinion +5 with all).';
    }
    const t = rivalById(s, o === 1 ? c.data.aId : c.data.bId)!;
    const H_ = s.world.horde;
    cash(s, -500);
    H_.spoils += 500;
    H_.ferals += 2;
    newRogue(s);
    t.influence = Math.max(0, t.influence - 10);
    loseKeepers(s, t, 1, 'wardens');
    loseKeepers(s, t, 1);
    if (t.keepers.spies > committedSpies(s, me(s))) shiftOpinion(t, -10);
    H_.bountyTarget = t.id;
    setProg(s, 'spartacusBounty', DONE);
    sd(s, 'spartacusBounty').target = t.id;
    return `−500 denarii. The Wild Horde turns its eyes on House ${t.name}.`;
  },
  dropped: (s) => setProg(s, 'spartacusBounty', 0),
};

function bountyWeek(state: GameState): void {
  if (prog(state, 'spartacusBounty') !== 0) return;
  const H_ = state.world.horde;
  const vis = visibleRivals(state);
  if (vis.length < 2 || !H_.spartacusFree || H_.spartacusDead || H_.ferals <= 40 || H_.rogues.length <= 5) return;
  if (!chance(0.2)) return;
  setProg(state, 'spartacusBounty', 1);
  queue(state, 'spartacusBounty', 'offer', 'spartacus', T.spartacusBounty(vis[0].name, vis[1].name), { aId: vis[0].id, bId: vis[1].id });
}

// --- Tomb of the Pharaoh -----------------------------------------------------------------------

function refreshPair(s: GameState, c: StoryConversation): void {
  const [a, b] = bestTwo(me(s));
  c.data.aId = a?.id;
  c.data.bId = b?.id;
  relabel(c, 0, a && `Send ${a.name}`);
  relabel(c, 1, b && `Send ${b.name}`);
  disable(c, 0, a ? null : 'Nobody fit to send.');
  disable(c, 1, b ? null : 'Nobody else fit to send.');
}

H['tombOfThePharaoh:map'] = {
  refresh: refreshPair,
  answer: (s, c, o) => {
    if (o === 2) {
      setProg(s, 'tombOfThePharaoh', 8);
      return 'The map goes back in the spy\'s satchel.';
    }
    const x = mine(s, o === 0 ? c.data.aId : c.data.bId)!;
    sendOnAdventure(s, 'tomb', [x.id], 3, { story: 'tombOfThePharaoh' }, 'The tomb of Necho II');
    setProg(s, 'tombOfThePharaoh', 2);
    return `${x.name} sails for Egypt.`;
  },
  dropped: (s) => setProg(s, 'tombOfThePharaoh', 8),
};

function tombWeek(state: GameState): void {
  const p = prog(state, 'tombOfThePharaoh');
  if (p !== 0 && p !== 8) return;
  if (!hasUpgrade(state, 'egyptianAncestry')) return;
  const h = me(state);
  const spies = committedSpies(state, h);
  if (h.influence <= 300 || h.creatures.length <= 2 || spies <= 2) return;
  const roll = rand(30) + spies + (state.player.heritage === 'egyptian' ? 3 : 0);
  if (roll <= (p === 8 ? 40 : 30)) return;
  const [a, b] = bestTwo(h);
  setProg(state, 'tombOfThePharaoh', 1);
  queue(state, 'tombOfThePharaoh', 'map', 'spy', T.tombMap(a?.name ?? 'your champion', b?.name ?? 'your second best'));
}

// --- Restoration of Troy ---------------------------------------------------------------------

H['restorationOfTroy:visit'] = {
  ready: (s, c) => me(s).denarii >= (c.data.fee >= 500 ? 600 : 300),
  refresh: (s, c) => disable(c, 0, me(s).denarii < c.data.fee ? `You need ${c.data.fee} denarii.` : null),
  answer: (s, c, o) => {
    if (o === 0) {
      cash(s, -c.data.fee);
      const at = s.world.week + 6 + rand(5);
      s.world.flags.troyWeek = at;
      setProg(s, 'restorationOfTroy', 3);
      return `−${fmtD(c.data.fee)}. The Trojan Games will be held in week ${at}.`;
    }
    setProg(s, 'restorationOfTroy', DONE);
    return 'Hector rides away.';
  },
  dropped: (s, c) => setProg(s, 'restorationOfTroy', c.data.fee >= 500 ? 4 : 1),
};

function troyWeek(state: GameState): void {
  const p = prog(state, 'restorationOfTroy');
  if (p === DONE || !hasUpgrade(state, 'restorationOfTroy')) return;
  const stage = Number(state.world.flags.troyStage ?? 0);
  if (stage < 0) {
    setProg(state, 'restorationOfTroy', DONE);
    return;
  }
  const w = state.world.week;
  const d = sd(state, 'restorationOfTroy');
  if (p === 0 && stage >= 1) setProg(state, 'restorationOfTroy', 1);
  const q = prog(state, 'restorationOfTroy');
  if (q === 1 && totalFame(me(state)) > 700 && me(state).creatures.length >= 2 && chance(0.3)) {
    setProg(state, 'restorationOfTroy', 2);
    queue(state, 'restorationOfTroy', 'visit', 'hector', T.hectorVisit(200, false), { fee: 200 });
  } else if (q === 3 && Number(state.world.flags.troyWeek ?? 0) < w) {
    setProg(state, 'restorationOfTroy', d.midas && d.spear ? DONE : 4);
  } else if (q === 4 && Number(state.world.flags.troyWeek ?? 0) < w && chance(0.2)) {
    setProg(state, 'restorationOfTroy', 5);
    queue(state, 'restorationOfTroy', 'visit', 'hector', T.hectorVisit(500, true), { fee: 500 });
  }
}

function troyRelics(state: GameState, final: boolean): void {
  const d = sd(state, 'restorationOfTroy');
  if (!d.midas) {
    d.midas = true;
    giveGear(me(state), newGear('handOfMidas', 2));
    message(state, 'assistant', 'A gift from Hector', 'Hector hands you an exquisite prize: the Hand of Midas!');
  }
  if (final && !d.spear) {
    d.spear = true;
    giveGear(me(state), newGear('bronzeHorn', 5, { unique: 'achillesSpear' }));
    message(state, 'assistant', 'Achilles\' Horn', 'The warrior claiming to be Achilles lies in the sand. His horn is yours: Achilles\' Horn.');
  }
  if (d.midas && d.spear) setProg(state, 'restorationOfTroy', DONE);
}

// --- Mysterious Hag ------------------------------------------------------------------------------

H['mysteriousHag:plea'] = {
  refresh: refreshPair,
  answer: (s, c, o) => {
    if (o === 2) {
      setProg(s, 'mysteriousHag', DONE);
      return 'The old woman spits on your doorstep and is gone.';
    }
    const x = mine(s, o === 0 ? c.data.aId : c.data.bId)!;
    sendOnAdventure(s, 'hagBandits', [x.id], 2, { story: 'mysteriousHag' }, 'The old woman\'s bandits');
    setProg(s, 'mysteriousHag', 2);
    return `${x.name} heads for the hills.`;
  },
  dropped: (s) => setProg(s, 'mysteriousHag', 0),
};

H['mysteriousHag:reward'] = {
  ttl: 99,
  refresh: (s, c) => {
    const x = mostCunning(me(s)) ?? me(s).creatures.filter((y) => y.kind === 'dino').sort((a, b) => b.fame - a.fame)[0];
    c.data.creatureId = x?.id;
    disable(c, 2, x ? null : 'You have no dino to teach.');
  },
  answer: (s, c, o) => {
    setProg(s, 'mysteriousHag', DONE);
    if (o === 0) {
      cash(s, 500);
      return '+500 denarii.';
    }
    if (o === 1) {
      giveGear(me(s), newGear('mysteriousEgg', 2));
      return 'You receive a Mysterious Egg. To hatch an egg like this, it needs the heat of battle!';
    }
    const x = mine(s, c.data.creatureId)!;
    if (!x.learnable.includes('Fireball')) x.learnable.push('Fireball');
    if (!x.techniques.some((t) => t.id === 'Fireball')) x.techniques.push({ id: 'Fireball', rank: 1, equipped: true });
    return `${x.name} learns Fireball, forbidden knowledge from beyond the Styx.`;
  },
};

function hagWeek(state: GameState): void {
  if (prog(state, 'mysteriousHag') !== 0) return;
  const p = state.player;
  const h = me(state);
  if (p.invaderWins < 1 || totalFame(h) <= 200 || h.influence <= 150) return;
  if (!(state.world.ascension > 0 || state.ascended)) return;
  if (rand(50) + p.invaderWins <= 50) return;
  const [a, b] = bestTwo(h);
  setProg(state, 'mysteriousHag', 1);
  queue(state, 'mysteriousHag', 'plea', 'hag', T.hagPlea(a?.name ?? 'your champion', b?.name ?? 'your second best'));
}

// --- Ludus Pact --------------------------------------------------------------------------------

H['ludusPact:offer'] = {
  valid: rivalAlive,
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const hated = rivalById(s, c.data.hatedId);
    const d = sd(s, 'ludusPact');
    if (o === 0) {
      shiftOpinion(r, 20);
      shiftOpinion(hated, -10);
      if (r.ai) r.ai.pact = true;
      d.ally = r.id;
      d.since = s.world.week;
      setProg(s, 'ludusPact', 2);
      return `House ${r.name} is now your ally (opinion +20)${hated ? `; House ${hated.name} is not pleased (−10)` : ''}.`;
    }
    shiftOpinion(r, o === 1 ? -15 : -30);
    d.declined = [...(d.declined ?? []), r.id];
    setProg(s, 'ludusPact', 0);
    return `Opinion ${o === 1 ? '−15' : '−30'}.`;
  },
  dropped: (s) => setProg(s, 'ludusPact', 0),
};

H['ludusPact:gift'] = {
  valid: (s, c) => rivalAlive(s, c) && !!rivalOf(s, c)?.ai?.pact,
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    sd(s, 'ludusPact').lastGift = s.world.week;
    if (o === 0) {
      cash(s, 200);
      r.denarii -= 200;
      shiftOpinion(r, -5);
      return '+200 denarii (opinion −5).';
    }
    shiftOpinion(r, 5);
    return 'Opinion +5.';
  },
  dropped: (s) => { sd(s, 'ludusPact').lastGift = s.world.week; },
};

H['ludusPact:breakup'] = {
  ttl: 4,
  answer: (s, c, o) => endPact(s, rivalOf(s, c), o === 0 ? -5 : -15),
  dropped: (s, c) => { endPact(s, rivalOf(s, c), 0); },
};

function endPact(state: GameState, r: Ludus | undefined, delta: number): string {
  const d = sd(state, 'ludusPact');
  if (r?.ai) r.ai.pact = false;
  shiftOpinion(r, delta);
  d.exAllies = [...(d.exAllies ?? []), r?.id].filter(Boolean);
  d.ally = undefined;
  setProg(state, 'ludusPact', 0);
  return `The pact with House ${r?.name ?? '?'} is over${delta ? ` (opinion ${delta})` : ''}.`;
}

function pactWeek(state: GameState): void {
  if (prog(state, 'ludusPact') !== 2) return;
  const d = sd(state, 'ludusPact');
  const ally = rivalById(state, d.ally);
  if (!ally || !ally.ai?.pact) {
    if (!ally) message(state, 'herald', 'An ally lost', 'The house you had a pact with is no more.');
    d.ally = undefined;
    setProg(state, 'ludusPact', 0);
    return;
  }
  if (pendingConv(state, 'ludusPact')) return;
  if (ally.ai.opinion < 40) {
    queue(state, 'ludusPact', 'breakup', 'unknown', T.pactBreakup(), {}, ally);
  } else if (me(state).denarii < 100 && ally.denarii > 200 && state.world.week - (d.lastGift ?? -99) >= 10) {
    queue(state, 'ludusPact', 'gift', 'unknown', T.pactGift(), {}, ally);
  }
}

// --- Train a rival's dino ---------------------------------------------------------------------

H['trainGladiator:ask'] = {
  valid: (s, c) => rivalAlive(s, c) && !!rivalOf(s, c)?.creatures.some((x) => x.id === c.data.creatureId),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 0) {
      const x = r.creatures.find((y) => y.id === c.data.creatureId)!;
      shiftOpinion(r, 5);
      moveCreature(r, me(s), x);
      x.loyalty = Math.max(x.loyalty, 60);
      Object.assign(sd(s, 'trainGladiator'), { rival: r.id, creatureId: x.id, name: x.name });
      spawnObjective(s, 'trainLoaned', { creatureId: x.id, baseStats: rawTotal(x), baseFame: x.fame });
      setProg(s, 'trainGladiator', 2);
      return `${x.name} joins your pens for ten weeks of training (opinion +5).`;
    }
    shiftOpinion(r, -5);
    setProg(s, 'trainGladiator', DONE);
    return 'Opinion −5.';
  },
};

function loanedOf(s: GameState): Creature | undefined {
  return mine(s, sd(s, 'trainGladiator').creatureId);
}

function returnLoaned(s: GameState, r: Ludus, x: Creature): void {
  moveCreature(me(s), r, x);
  changeTameness(x, 10);
}

H['trainGladiator:success'] = {
  ttl: 99,
  valid: (s, c) => rivalAlive(s, c) && !!loanedOf(s),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const x = loanedOf(s)!;
    setProg(s, 'trainGladiator', DONE);
    if (o === 0) {
      returnLoaned(s, r, x);
      shiftOpinion(r, 15);
      giveGear(me(s), newGear('tailWhip', 5, { unique: 'fulgur' }));
      return `${x.name} goes home. The whip Fulgur is yours (opinion +15).`;
    }
    shiftOpinion(r, -10);
    giveGear(r, newGear('tailWhip', 5, { unique: 'fulgur' }));
    return `${x.name} stays in your ludus (opinion −10).`;
  },
};

H['trainGladiator:failAlive'] = {
  ttl: 99,
  valid: (s, c) => rivalAlive(s, c) && !!loanedOf(s),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const x = loanedOf(s)!;
    setProg(s, 'trainGladiator', DONE);
    if (o === 0) {
      shiftOpinion(r, -35);
      return `${x.name} stays with you (opinion −35).`;
    }
    returnLoaned(s, r, x);
    return `${x.name} goes home.`;
  },
};

H['trainGladiator:failDead'] = {
  ttl: 99,
  valid: rivalAlive,
  refresh: (s, c) => disable(c, 1, me(s).denarii < 100 ? 'You need 100 denarii.' : null),
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    setProg(s, 'trainGladiator', DONE);
    if (o === 0) {
      shiftOpinion(r, -20);
      return 'Opinion −20.';
    }
    cash(s, -100);
    r.denarii += 100;
    shiftOpinion(r, -5);
    return '−100 denarii (opinion −5).';
  },
};

function trainWeek(state: GameState): void {
  if (prog(state, 'trainGladiator') !== 2) return;
  const d = sd(state, 'trainGladiator');
  const r = rivalById(state, d.rival);
  const o = findObjective(state, 'trainLoaned');
  if (!r) {
    message(state, 'assistant', 'A dino without a home', `${d.name ?? 'The loaned dino'}'s house is gone. It stays with you.`);
    setProg(state, 'trainGladiator', DONE);
    return;
  }
  if (!o) return;
  const x = loanedOf(state);
  if (o.done) {
    setProg(state, 'trainGladiator', 3);
    queue(state, 'trainGladiator', 'success', 'unknown', T.trainSuccess(x?.name ?? d.name), {}, r);
  } else if (o.failed) {
    setProg(state, 'trainGladiator', 3);
    if (x) queue(state, 'trainGladiator', 'failAlive', 'unknown', T.trainFailAlive(x.name), {}, r);
    else queue(state, 'trainGladiator', 'failDead', 'unknown', T.trainFailDead(d.name ?? 'My dino'), {}, r);
  }
}

// --- Grave Robbing -----------------------------------------------------------------------------

H['graveRobbing:map'] = {
  refresh: (s, c) => {
    const ch = champion(me(s));
    c.data.creatureId = ch?.id;
    relabel(c, 0, ch && `Buy the map and send ${ch.name} (200 denarii)`);
    disable(c, 0, !ch ? 'Nobody fit to send.' : me(s).denarii < 200 ? 'You need 200 denarii.' : null);
  },
  answer: (s, c, o) => {
    if (o === 0) {
      const ch = mine(s, c.data.creatureId)!;
      cash(s, -200); // GM quirk fixed: the map is actually paid for
      sendOnAdventure(s, 'graveRobbing', [ch.id], 3, { story: 'graveRobbing' }, 'The Celtic king\'s burial mound');
      setProg(s, 'graveRobbing', 2);
      return `−200 denarii. ${ch.name} sets off for Gaul.`;
    }
    shiftOpinion(rivalByKey(s, 'caesar'), 5);
    for (const r of activeRivals(s)) shiftOpinion(r, 2);
    inf(s, 25);
    const top = strongestRival(s);
    if (top) giveGear(top, newGear('spectralSaddle', 5));
    setProg(s, 'graveRobbing', DONE);
    return `+25 influence; the rivals approve. The veteran sells his map elsewhere${top ? `, and House ${top.name} ends up with a cold, strange saddle` : ''}.`;
  },
};

function graveWeek(state: GameState): void {
  if (prog(state, 'graveRobbing') !== 0) return;
  const h = me(state);
  if (h.influence <= 1000) return;
  if (!state.player.senator && !h.creatures.some((c) => hasTrait(c, 'MasterHorseman') || hasTrait(c, 'Cataphractoi'))) return;
  if (!chance(0.2)) return;
  setProg(state, 'graveRobbing', 1);
  queue(state, 'graveRobbing', 'map', 'veteran', T.graveMap(champion(h)?.name ?? 'your champion'));
}

// --- Mansion for Sale -----------------------------------------------------------------------------

H['mansionForSale:offer'] = {
  valid: rivalAlive,
  ready: (s) => me(s).denarii > 400 && !!champion(me(s), { dinoOnly: true }),
  refresh: (s, c) => {
    const ch = champion(me(s), { dinoOnly: true });
    c.data.creatureId = ch?.id;
    disable(c, 0, ch ? null : 'Your champion is not available.');
    disable(c, 1, !ch ? 'Your champion is not available.' : me(s).denarii < 500 ? 'You need 500 denarii.' : null);
  },
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    if (o === 2) {
      shiftOpinion(r, -5);
      setProg(s, 'mansionForSale', DONE);
      return 'Opinion −5.';
    }
    const ch = mine(s, c.data.creatureId)!;
    if (o === 0) me(s).projected -= 25;
    else cash(s, -500);
    me(s).buildings.romeMansion = Math.max(1, me(s).buildings.romeMansion ?? 0);
    ch.away = { kind: 'loan', weeksLeft: 5, ref: 'story:mansionForSale', note: `On loan to House ${r.name}` };
    giveGear(me(s), newGear('poultice', 2));
    shiftOpinion(r, 5);
    Object.assign(sd(s, 'mansionForSale'), { rival: r.id, creatureId: ch.id });
    setProg(s, 'mansionForSale', 2);
    return `${o === 0 ? 'Weekly income −25' : '−500 denarii'}. You own a mansion in Rome (Rome estate unlocked); ${ch.name} is on loan for 5 weeks (opinion +5).`;
  },
};

// --- Taking a Closer Look -------------------------------------------------------------------------

H['takingACloserLook:offer'] = {
  refresh: (s, c) => {
    const x = mostCunning(me(s));
    c.data.creatureId = x?.id;
    disable(c, 0, !x ? 'You have no dino fit to send.' : me(s).denarii < 100 ? 'You need 100 denarii.' : null);
  },
  answer: (s, c, o) => {
    const r = rivalById(s, c.data.targetId) ?? strongestRival(s);
    const d = sd(s, 'takingACloserLook');
    d.rival = r?.id;
    if (o === 0) {
      const x = mine(s, c.data.creatureId)!;
      cash(s, -100);
      shiftOpinion(r, -2);
      sendOnAdventure(s, 'lookingGlass', [x.id], 2, { story: 'takingACloserLook', rivalId: r?.id }, 'A closer look');
      setProg(s, 'takingACloserLook', 2);
      return `−100 denarii. ${x.name} slips out at dusk.`;
    }
    shiftOpinion(r, 5);
    for (const x of activeRivals(s)) shiftOpinion(x, 2);
    inf(s, 5);
    d.glassWeek = s.world.week + 4;
    setProg(s, 'takingACloserLook', 5);
    return '+5 influence; the rivals approve of your honesty.';
  },
};

function closerLookWeek(state: GameState): void {
  const p = prog(state, 'takingACloserLook');
  const d = sd(state, 'takingACloserLook');
  if (p === 5) {
    if (state.world.week >= (d.glassWeek ?? 0)) {
      const r = rivalById(state, d.rival) ?? strongestRival(state);
      if (r) giveGear(r, newGear('lookingGlass', 2));
      setProg(state, 'takingACloserLook', DONE);
    }
    return;
  }
  if (p !== 0) return;
  const h = me(state);
  if (h.influence <= 100) return;
  if (!state.player.senator && !h.creatures.some((c) => hasTrait(c, 'Thief') || hasTrait(c, 'Sneaky'))) return;
  const r = strongestRival(state);
  if (!r || !chance(0.2)) return;
  setProg(state, 'takingACloserLook', 1);
  queue(state, 'takingACloserLook', 'offer', 'veteran', T.closerLook(r.name), { targetId: r.id });
}

// --- Stud Request (Jurassic Ludus) ---------------------------------------------------------------

function studPair(state: GameState, r: Ludus): { male: Creature; female: Creature } | null {
  const females = r.creatures.filter((c) => c.sex === 'F' && isAdult(c) && isBreedable(c) && !breedingIssue(c) && c.mateCooldown <= 0);
  for (const f of females) {
    const males = me(state).creatures
      .filter((c) => c.sex === 'M' && c.species === f.species && isAdult(c) && isBreedable(c) && !breedingIssue(c) && !c.away)
      .sort((a, b) => geneticScore(b) - geneticScore(a) || b.level - a.level);
    if (males[0]) return { male: males[0], female: f };
  }
  return null;
}

H['studRequest:ask'] = {
  valid: (s, c) => {
    const r = rivalOf(s, c);
    const m = mine(s, c.data.maleId);
    const f = r?.creatures.find((x) => x.id === c.data.femaleId);
    return !!r && !!m && !!f && !m.away && !breedingIssue(m) && !breedingIssue(f);
  },
  ttl: 3,
  answer: (s, c, o) => {
    const r = rivalOf(s, c)!;
    const d = sd(s, 'studRequest');
    d.next = s.world.week + 15;
    setProg(s, 'studRequest', 0);
    if (o === 1) {
      shiftOpinion(r, -5);
      return 'Opinion −5.';
    }
    const m = mine(s, c.data.maleId)!;
    const f = r.creatures.find((x) => x.id === c.data.femaleId)!;
    cash(s, 300);
    r.denarii -= 300;
    shiftOpinion(r, 5);
    m.away = { kind: 'loan', weeksLeft: 1, ref: 'story:studRequest', note: `At stud with House ${r.name}` };
    const baby = studOffspring(s, r, m, f);
    return `+300 denarii (opinion +5). ${m.name} spends the week at House ${r.name}; ${baby ? `a ${SPECIES[f.species].name} called ${baby.name} will carry his blood` : 'the match came to nothing'}.`;
  },
  dropped: (s) => {
    setProg(s, 'studRequest', 0);
    sd(s, 'studRequest').next = s.world.week + 8;
  },
};

/** The rival raises an offspring of your male and its female (breeding rules as aiBreedingWeek). */
function studOffspring(state: GameState, r: Ludus, m: Creature, f: Creature): Creature | null {
  const mg = parentGenes(f);
  const fg = parentGenes(m);
  const genes = rollOffspringGenes(mg, fg, state.world.week);
  genes.imprint = 0.3 + rand(51) / 100;
  const baby = makeNewborn(state, r, f.species, genes, coin() ? 'M' : 'F', inheritTraits(mg, fg));
  baby.maturity = 0.5;
  baby.ageWeeks = Math.floor(SPECIES[f.species].matureWeeks / 2);
  baby.loyalty = clamp(70 + Math.round(30 * genes.imprint), 0, 100);
  r.creatures.push(baby);
  registerAncestor(state, f, r.name);
  registerAncestor(state, m, me(state).name);
  registerAncestor(state, baby, r.name);
  f.offspring++;
  m.offspring++;
  f.mateCooldown = Math.max(1, SPECIES[f.species].mateCooldown);
  return baby;
}

// ---------------------------------------------------------------------------
// Rival-initiated triggers (GM determineStoryLine order, plus the stud request)
// ---------------------------------------------------------------------------

interface RivalStory {
  story: StoryLineId;
  upgrade?: UpgradeId;
  /** only the six GM lanistae (default true) */
  dominus?: boolean;
  can: (s: GameState, r: Ludus) => boolean;
  start: (s: GameState, r: Ludus) => void;
}

const RIVAL_STORIES: RivalStory[] = [
  {
    story: 'carthaginianArtifact',
    can: (s, r) => r.denarii < 500 && opinion(r) >= 60 && s.world.week > 30 && me(s).denarii > 200,
    start: (s, r) => {
      const price = opinion(r) > 70 ? 350 : 400;
      setProg(s, 'carthaginianArtifact', 1);
      sd(s, 'carthaginianArtifact').rival = r.id;
      queue(s, 'carthaginianArtifact', 'offer', 'unknown', T.carthageOffer(price), { price }, r);
    },
  },
  {
    story: 'bowOfApollo', upgrade: 'spitters',
    can: (s, r) => opinion(r) < 45 && s.world.week > 15 && s.world.week % 2 === 0 && firstPlaces(me(s)) >= 1 && !!marksman(s) && chance(0.5),
    start: (s, r) => {
      const m = marksman(s)!;
      setProg(s, 'bowOfApollo', 1);
      queue(s, 'bowOfApollo', 'offer', 'unknown', T.apolloOffer(m.name), { creatureId: m.id }, r);
    },
  },
  {
    story: 'hannibalSandals', upgrade: 'hannibalsLegacy',
    can: (s, r) => holdsRegalia(s) && !ownsUnique(me(s), 'hannibalsSandals') && opinion(r) > 40 && chance(0.2),
    start: (s, r) => {
      const ch = champion(me(s));
      const w = strongestWeapon(me(s));
      setProg(s, 'hannibalSandals', 1);
      queue(s, 'hannibalSandals', 'offer', 'unknown', T.hannibalOffer(ch?.name ?? 'your champion', w ? gearName(w) : 'best weapon'), {}, r);
    },
  },
  {
    story: 'macedonianRebels', upgrade: 'legacyOfAlexander',
    can: (s, r) => r.ai?.key === 'caesar' && hasSenateInfluence(s) && s.world.week > 30 && s.world.week % 6 === 0 && opinion(r) > 0
      && !!champion(me(s), { dinoOnly: true }),
    start: (s, r) => {
      const ch = champion(me(s), { dinoOnly: true })!;
      setProg(s, 'macedonianRebels', 1);
      queue(s, 'macedonianRebels', 'pitch', 'caesar', T.macedonPitch(ch.name), { creatureId: ch.id }, r);
    },
  },
  {
    story: 'murderPlot',
    can: (s, r) => {
      if (s.world.week % 10 !== 0 || me(s).keepers.spies < 1) return false;
      if (!(r.keepers.spies > 0 || committedSpies(s, me(s)) > 4) || opinion(r) < 45) return false;
      const t = hatedOf(s, r);
      return !!t && t.influence >= 2 * r.influence && t.influence > 80 && topFame(t) > 2 * topFame(r) && topFame(t) > 50;
    },
    start: (s, r) => {
      const t = hatedOf(s, r)!;
      const star = [...t.creatures].sort((a, b) => b.fame - a.fame)[0];
      setProg(s, 'murderPlot', 1);
      queue(s, 'murderPlot', 'pitch', 'unknown', T.murderPitch(t.name, star?.name ?? 'champion'), { targetId: t.id }, r);
    },
  },
  {
    story: 'ludusPact',
    can: (s, r) => {
      const d = sd(s, 'ludusPact');
      if (activeRivals(s).some((x) => x.ai?.pact)) return false;
      if ((d.exAllies ?? []).includes(r.id) || (d.declined ?? []).includes(r.id)) return false;
      if (opinion(r) < 45 || s.world.week <= 10) return false;
      const hated = hatedOf(s, r);
      if (!hated || r.influence >= hated.influence || !chance(0.1)) return false;
      const struggling = (s.player.invaderWins === 0 && keeperCount(me(s)) < 5) || (firstPlaces(me(s)) === 0 && s.world.week > 15);
      return hated.influence > me(s).influence || struggling || chance(0.1);
    },
    start: (s, r) => {
      const hated = hatedOf(s, r)!;
      setProg(s, 'ludusPact', 1);
      queue(s, 'ludusPact', 'offer', 'unknown', T.pactOffer(hated.name), { hatedId: hated.id }, r);
    },
  },
  {
    story: 'mansionForSale', upgrade: 'romeMansion',
    can: (s, r) => s.world.week > 6 && me(s).denarii > 500 && (champion(me(s), { dinoOnly: true })?.fame ?? 0) > 200 && opinion(r) > 15
      && (me(s).buildings.romeMansion ?? 0) === 0 && chance(0.5),
    start: (s, r) => {
      const ch = champion(me(s), { dinoOnly: true })!;
      setProg(s, 'mansionForSale', 1);
      queue(s, 'mansionForSale', 'offer', 'unknown', T.mansionOffer(ch.name), { creatureId: ch.id }, r);
    },
  },
  {
    story: 'trainGladiator', upgrade: 'lashers',
    can: (s, r) => s.world.week > 6 && opinion(r) > 35 && !!me(s).doctoreId && doctoreLevel(me(s)) > doctoreLevel(r) && r.creatures.length > 1
      && !!champion(r, { dinoOnly: true, exclude: r.doctoreId ? [r.doctoreId] : [] }),
    start: (s, r) => {
      const x = champion(r, { dinoOnly: true, exclude: r.doctoreId ? [r.doctoreId] : [] })!;
      setProg(s, 'trainGladiator', 1);
      queue(s, 'trainGladiator', 'ask', 'unknown', T.trainAsk(x.name), { creatureId: x.id }, r);
    },
  },
  {
    story: 'loanRequest',
    can: (s, r) => r.denarii < 100 && me(s).denarii > 200 && opinion(r) > 50,
    start: (s, r) => {
      setProg(s, 'loanRequest', 1);
      sd(s, 'loanRequest').rival = r.id;
      queue(s, 'loanRequest', 'ask', 'unknown', T.loanAsk(r.name), {}, r);
    },
  },
  {
    story: 'studRequest', dominus: false,
    can: (s, r) => s.world.week > 8 && opinion(r) >= 40 && s.world.week >= (sd(s, 'studRequest').next ?? 0) && r.denarii >= 300
      && !!studPair(s, r) && chance(0.08),
    start: (s, r) => {
      const pair = studPair(s, r)!;
      setProg(s, 'studRequest', 1);
      sd(s, 'studRequest').rival = r.id;
      queue(s, 'studRequest', 'ask', 'unknown', T.studAsk(pair.male.name, pair.female.name, SPECIES[pair.female.species].name),
        { maleId: pair.male.id, femaleId: pair.female.id }, r);
    },
  },
];

const STORY_UPGRADE: Partial<Record<StoryLineId, UpgradeId>> = {
  macedonianRebels: 'legacyOfAlexander', hannibalSandals: 'hannibalsLegacy', bowOfApollo: 'spitters',
  tombOfThePharaoh: 'egyptianAncestry', restorationOfTroy: 'restorationOfTroy', trainGladiator: 'lashers',
  mansionForSale: 'romeMansion',
};

/** GM upgradeRequired: which upgrade a storyline needs (undefined = always available). */
export function storyUpgrade(story: StoryLineId): UpgradeId | undefined {
  return STORY_UPGRADE[story];
}

function rivalTriggers(state: GameState): void {
  if (state.player.conversations.length >= 4) return;
  for (const r of visibleRivals(state)) {
    if (!r.ai) continue;
    for (const rs of RIVAL_STORIES) {
      if (rs.upgrade && !hasUpgrade(state, rs.upgrade)) continue;
      if (rs.dominus !== false && !DOMINUS.includes(r.ai.key)) continue;
      if (prog(state, rs.story) !== 0 || pendingConv(state, rs.story)) continue;
      if (!rs.can(state, r)) continue;
      rs.start(state, r);
      return; // at most one new rival storyline per week
    }
  }
}

// ---------------------------------------------------------------------------
// Story loans (mansion champion, stud): away with ref 'story:<id>', counted down here
// ---------------------------------------------------------------------------

function tickLoans(state: GameState): void {
  for (const c of [...me(state).creatures]) {
    const ref = c.away?.ref;
    if (!c.away || !ref?.startsWith('story:')) continue;
    if (ref === 'story:mansionForSale' && chance(0.03)) {
      const r = rivalById(state, sd(state, 'mansionForSale').rival);
      bury(state, c, `Died on loan to House ${r?.name ?? 'a rival'} in Rome`);
      cash(state, 100);
      message(state, 'rival', 'A body comes home', `${c.name} died during a private exhibition in Rome. The body comes back with 100 denarii and a long, flowery apology from House ${r?.name ?? '?'}.`);
      setProg(state, 'mansionForSale', DONE);
      continue;
    }
    c.away.weeksLeft--;
    if (c.away.weeksLeft > 0) continue;
    c.away = undefined;
    if (ref === 'story:mansionForSale') {
      changeTameness(c, 15);
      message(state, 'assistant', `${c.name} is back from Rome`, `${c.name} returns from its loan, fat and pleased with itself (+15 tameness).`);
      setProg(state, 'mansionForSale', DONE);
    } else if (ref === 'story:studRequest') {
      message(state, 'assistant', `${c.name} is back`, `${c.name} returns from stud duty looking very smug.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Lazy triggers that must fire between weeks (Solonius' offer after registering for Rome's Finest). */
export function storyCheck(state: GameState): void {
  soloniusTrigger(state);
}

function prune(state: GameState): void {
  const w = state.world.week;
  for (const c of [...state.player.conversations]) {
    const h = H[key(c)];
    if (!h) {
      removeConv(state, c.id);
      continue;
    }
    const expired = w - (c.data.week ?? w) > (h.ttl ?? 8);
    if ((h.valid && !h.valid(state, c)) || expired) {
      removeConv(state, c.id);
      if (h.dropped) h.dropped(state, c);
      else if (prog(state, c.story) !== DONE) setProg(state, c.story, DONE);
    }
  }
}

/** Weekly: rival-initiated storylines (determineStoryLine), Spartacus/Pythia/Hag/etc triggers. Queues conversations. */
export function storyWeek(state: GameState): void {
  if (state.over) return;
  tickLoans(state);
  prune(state);
  soloniusWeek(state);
  loanWeek(state);
  murderWeek(state);
  carthageWeek(state);
  spartacusWeek(state);
  pythiaWeek(state);
  godsChosenWeek(state);
  bountyWeek(state);
  tombWeek(state);
  troyWeek(state);
  hagWeek(state);
  pactWeek(state);
  trainWeek(state);
  graveWeek(state);
  closerLookWeek(state);
  rivalTriggers(state);
}

/** Conversations waiting for the player (refreshed), in order. */
export function pendingConversations(state: GameState): StoryConversation[] {
  prune(state);
  for (const c of state.player.conversations) H[key(c)]?.refresh?.(state, c);
  return state.player.conversations.filter((c) => H[key(c)]?.ready?.(state, c) ?? true);
}

/** First ready conversation (shown as a portrait bubble on the hub). */
export function activeConversation(state: GameState): StoryConversation | null {
  storyCheck(state);
  return pendingConversations(state)[0] ?? null;
}

export function answerConversation(state: GameState, id: ID, option: number): { text: string; battle?: import('./types').BattleResult } {
  const conv = state.player.conversations.find((c) => c.id === id);
  if (!conv) return { text: 'That conversation is over.' };
  const h = H[key(conv)];
  if (!h || (h.valid && !h.valid(state, conv))) {
    removeConv(state, id);
    if (h?.dropped) h.dropped(state, conv);
    else if (h) setProg(state, conv.story, DONE);
    return { text: 'The moment has passed.' };
  }
  h.refresh?.(state, conv);
  const opt = conv.options[option];
  if (!opt) return { text: 'Choose one of the options.' };
  if (opt.disabled) return { text: opt.reason ?? 'That is not possible right now.' };
  removeConv(state, id);
  const result = h.answer(state, conv, option);
  const reply = conv.lines.filter((l) => l.choiceDependant === option && l.actor !== 'player').map((l) => l.text).join(' ');
  return { text: [reply, result].filter(Boolean).join(' ') };
}

/** Hooks called by other systems (tournament result vs Solonius, sabotage on Batiatus, kills for murder plot…). */
export function storyHook(state: GameState, hook: string, data: Record<string, unknown> = {}): void {
  const d = data as Record<string, any>;
  switch (hook) {
    case 'registered':
      storyCheck(state);
      break;
    case 'matchResult': {
      if (prog(state, 'soloniusThrow') !== 2) break;
      const sol = sd(state, 'soloniusThrow').rival as ID | undefined;
      const opp = d.opponentHouseId ?? d.opponentId ?? d.houseId ?? d.opponent;
      if (!sol || opp !== sol) break;
      const r = rivalById(state, sol);
      const won = d.won ?? d.playerWon ?? (d.winner !== undefined ? d.winner === 0 : undefined);
      if (won) {
        shiftOpinion(r, -15);
        message(state, 'rival', 'Solonius is not smiling', 'Your dino tore through Solonius\' fighter, deal or no deal. Solonius will not forget it (opinion −15).');
      } else {
        cash(state, 300);
        shiftOpinion(r, 10);
        message(state, 'rival', 'A purse in the crowd', 'As the crowd boos your dino off the sand, one of Solonius\' men slips a purse into your hands: 300 denarii (opinion +10).');
      }
      setProg(state, 'soloniusThrow', DONE);
      break;
    }
    case 'intrigue': {
      if (d.action === 'sabotage') spartacusSabotage(state, d);
      if (d.killed) murderKill(state, d.targetHouseId);
      break;
    }
    case 'kill': {
      if (d.byPlayer === false) break;
      if (d.killerHouseId && d.killerHouseId !== me(state).id) break;
      murderKill(state, d.victimHouseId ?? d.houseId);
      break;
    }
    case 'tournamentWon': {
      const t = d.tournamentId ? state.world.tournaments.find((x) => x.id === d.tournamentId) : undefined;
      const type = d.type ?? t?.type;
      const organizer = d.organizerId ?? t?.organizerId;
      if (organizer && organizer === me(state).id) objectiveEvent(state, 'wonOwn');
      if (type === 'prophecy') prophecyWon(state);
      if (type === 'troy' && prog(state, 'restorationOfTroy') !== DONE) troyRelics(state, true);
      break;
    }
    case 'tournamentRound': {
      const type = d.type ?? state.world.tournaments.find((x) => x.id === d.tournamentId)?.type;
      if (type === 'troy' && Number(d.round ?? 0) >= 3 && prog(state, 'restorationOfTroy') !== DONE) troyRelics(state, false);
      break;
    }
    case 'adventure':
      adventureDone(state, String(d.key ?? ''), !!d.success, (d.data ?? {}) as Record<string, any>, (d.creatureIds ?? []) as ID[]);
      break;
    case 'expedition':
      // Imperator / History Repeats are granted by horde.ts; nothing story-side yet.
      break;
    default:
      break;
  }
}

function murderKill(state: GameState, victimHouseId: unknown): void {
  if (prog(state, 'murderPlot') !== 2 || !victimHouseId) return;
  const d = sd(state, 'murderPlot');
  if (victimHouseId !== d.target) return;
  const r = rivalById(state, d.rival);
  cash(state, 500);
  shiftOpinion(r, 10);
  setProg(state, 'murderPlot', DONE);
  message(state, 'rival', 'For services rendered', `House ${r?.name ?? '?'} sends 500 denarii and a jar of honeyed dates. "For services rendered." (opinion +10)`);
}

/** Story bookkeeping when a story adventure resolves (adventures.ts pays the rewards). */
function adventureDone(state: GameState, k: string, success: boolean, data: Record<string, any>, crew: ID[]): void {
  switch (k) {
    case 'macedon':
      if (prog(state, 'macedonianRebels') !== 2) return;
      if (!success) {
        const caesar = rivalById(state, data.rivalId ?? sd(state, 'macedonianRebels').rival) ?? rivalByKey(state, 'caesar');
        if (caesar) giveGear(caesar, newGear('quiltedBarding', 5, { unique: 'alexandersArmor' }));
      }
      setProg(state, 'macedonianRebels', DONE);
      return;
    case 'apolloContest':
      if (prog(state, 'bowOfApollo') === 2) setProg(state, 'bowOfApollo', DONE);
      return;
    case 'delphi': {
      const pd = sd(state, 'pythiaVisions');
      pd.delphiPending = false;
      if (!success) {
        pd.nextAsk = state.world.week + 1;
        return;
      }
      const n = neokoros(state);
      n.loyalty = Math.max(n.loyalty, 90);
      me(state).creatures.push(n);
      pd.neokorosId = n.id;
      message(state, 'oracle', 'Neokoros', 'The trial is passed. The blind servant Neokoros has come back from Delphi to serve your ludus. The Pythia says he must prove himself in the pits and in a league.');
      objectiveEvent(state, 'delphi');
      completeObjective(state, 'pythia2');
      return;
    }
    case 'tomb':
      if (prog(state, 'tombOfThePharaoh') === 2) setProg(state, 'tombOfThePharaoh', success ? DONE : 0);
      return;
    case 'hagBandits':
      if (prog(state, 'mysteriousHag') !== 2) return;
      if (success) {
        setProg(state, 'mysteriousHag', 3);
        queue(state, 'mysteriousHag', 'reward', 'hag', T.hagReward());
      } else {
        setProg(state, 'mysteriousHag', 0);
      }
      return;
    case 'graveRobbing':
      if (prog(state, 'graveRobbing') === 2) setProg(state, 'graveRobbing', DONE);
      return;
    case 'lookingGlass': {
      if (prog(state, 'takingACloserLook') !== 2) return;
      if (success) {
        setProg(state, 'takingACloserLook', DONE);
      } else {
        const pd = sd(state, 'takingACloserLook');
        pd.glassWeek = state.world.week + 4;
        setProg(state, 'takingACloserLook', 5);
      }
      return;
    }
    default:
      void crew;
      return;
  }
}

/** Readable status of every storyline (debug / codex screen). */
export function storyOverview(state: GameState): { story: StoryLineId; step: number; done: boolean; locked: boolean }[] {
  const all: StoryLineId[] = ['soloniusThrow', 'loanRequest', 'murderPlot', 'carthaginianArtifact', 'macedonianRebels', 'spartacusEscape',
    'hannibalSandals', 'bowOfApollo', 'pythiaVisions', 'spartacusBounty', 'godsChosen', 'tombOfThePharaoh', 'restorationOfTroy',
    'mysteriousHag', 'ludusPact', 'trainGladiator', 'graveRobbing', 'mansionForSale', 'takingACloserLook', 'studRequest'];
  return all.map((s) => {
    const up = STORY_UPGRADE[s];
    return { story: s, step: prog(state, s), done: prog(state, s) === DONE, locked: !!up && !hasUpgrade(state, up) };
  });
}
