// Influence opportunity tree, toggles, elections, laws. OWNER: systems-politics agent. GM 05 §3.
//
// Who does what:
// - Unlocking reserves influence (allocatedInfluence); nothing is ever refunded (GM).
// - Bribe General and Take a Loan cost denarii through ludus.projected while switched on.
// - Public Sessions: the economy pays publicSessionsIncome() to the player while toggles.publicSessions is on
//   (and to every AI rival every week as "commoner tourists"); the toggle adds +1 security penalty; training
//   reads the −2 effectiveness from player.toggles.publicSessions.
// - Senator perks other than "+1 influence every 5 weeks" (+50 denarii/week, +5 influence/week, +10 % on
//   gains) are read by the economy from player.senator.

import type {
  Creature, ElectionState, GameState, Ludus, OpportunityId, ResultCard,
} from './types';
import { rand, coin } from './rng';
import { activeRivals, achieve, asc, ASC, hasUpgrade, message, newId, report } from './util';
import { hasTrait, marketPrice, generateDino, canFightAge } from './creature';
import { makeGear } from './data/gear';
import { addInfluence } from './economy';
import { changeOpinion } from './rivals';
import { objectiveEvent } from './objectives';
import { legendCreature, lictorLevel, makeLictor } from './data/politicsData';

export interface OpportunityDef { id: OpportunityId; name: string; path: 'lanista' | 'senator' | 'trickster'; tier: number; desc: string; toggle?: boolean; alt?: OpportunityId[] }

type Path = OpportunityDef['path'];

function opp(id: OpportunityId, name: string, path: Path, tier: number, desc: string, extra: Partial<OpportunityDef> = {}): OpportunityDef {
  return { id, name, path, tier, desc, ...extra };
}

export const OPPORTUNITIES: Record<OpportunityId, OpportunityDef> = {
  // Lanista path
  publicSessions: opp('publicSessions', 'Public Training Sessions', 'lanista', 1,
    'Let the plebs watch feeding time for a coin a head. Weekly denarii from your fame, influence and roster. ' +
    'While it runs: security −1 and training effectiveness −2.', { toggle: true }),
  bribeGeneral: opp('bribeGeneral', 'Bribe a General', 'lanista', 2,
    'A legate with debts sells you first pick of the beasts his legions capture: Crixus, Barca, Hermes, Maximus or ' +
    'some savage epic brute. −5 denarii a week while active.', { toggle: true }),
  theOrganizer: opp('theOrganizer', 'The Organizer', 'lanista', 3,
    'Host your own tournaments. Name them after yourself. Everyone does.'),
  classTraining: opp('classTraining', 'Class Training', 'lanista', 4,
    '+50 % fighting-style specialisation from training.', { alt: ['weightedTraining'] }),
  weightedTraining: opp('weightedTraining', 'Weighted Training', 'lanista', 4,
    'Drag logs, pull carts, carry keepers. +3 training effectiveness, +25 % training XP and some fame from training.',
    { alt: ['classTraining'] }),
  imperator: opp('imperator', 'Imperator', 'lanista', 5,
    'The Senate trusts you with a militia. Expeditions against the Wild Horde muster +50 men.'),
  // Senator path (needs the Senator Tree upgrade)
  lobbySenate: opp('lobbySenate', 'Lobby the Senate', 'senator', 1,
    'Friends in the curia. Unlocks senator options in events and halves the cost of releasing a wild beast in the arena.'),
  marketConnections: opp('marketConnections', 'Market Connections', 'senator', 2,
    'Merchants save their best stock for you. Better market rolls and two free Healing Poultices.',
    { alt: ['powerBegetsPower', 'socializer'] }),
  powerBegetsPower: opp('powerBegetsPower', 'Power Begets Power', 'senator', 2,
    '+10 % of your influence at once and +25 % on every influence gain.', { alt: ['marketConnections', 'socializer'] }),
  socializer: opp('socializer', 'Socializer', 'senator', 2,
    'Dinner parties, wine, flattery. Rival lanistae warm to you now and then, and some bad events pass you by.',
    { alt: ['powerBegetsPower', 'marketConnections'] }),
  electedSenator: opp('electedSenator', 'Elected Senator', 'senator', 3,
    'Stand for the Senate: 400 denarii and 200 influence to start a five-week campaign.'),
  princepsSenatus: opp('princepsSenatus', 'Princeps Senatus', 'senator', 4,
    'First voice of the Senate (while you are a senator). +10 intrigue detection, stronger senate votes, doubled expedition militia.'),
  consul: opp('consul', 'Consul', 'senator', 5,
    'Stand for consul: 1000 denarii. Consuls get two lictors, less paperwork and the right to feed spies to crocodiles.'),
  // Trickster path
  takeLoan: opp('takeLoan', 'Take a Loan', 'trickster', 1,
    'A moneylender who asks no questions. +500 denarii now, −25 a week until you repay the 500.', { toggle: true }),
  informants: opp('informants', 'Informants', 'trickster', 2,
    'Ears in every tavern. ±5 on intrigue, +15 detection, a smaller Horde in raids on you and fewer false spy scares.',
    { alt: ['forbiddenContraband'] }),
  forbiddenContraband: opp('forbiddenContraband', 'Forbidden Contraband', 'trickster', 2,
    'Fermented meat and other things the aediles frown upon. +2 to the weekly tameness from influence, and a free Bestiary Scroll.',
    { alt: ['informants'] }),
  gambler: opp('gambler', 'Gambler', 'trickster', 3, 'Place bets on your own matches.'),
  bacchusPatron: opp('bacchusPatron', 'Bacchus Patron', 'trickster', 4,
    'Throw the wildest parties in Capua. +15 % influence gains, +1 tameness a week, rivals warm to you, +1 favour in battle.'),
  veilOfNight: opp('veilOfNight', 'Veil of Night', 'trickster', 5,
    'Unlocks the Raid: send two dinos over a rival\'s palisade at night to kill and burn.'),
};

export const ALL_OPPORTUNITIES = Object.keys(OPPORTUNITIES) as OpportunityId[];

/** Tier layout per path; arrays list the alternates for that tier. */
const LAYOUT: Record<Path, OpportunityId[][]> = {
  lanista: [['publicSessions'], ['bribeGeneral'], ['theOrganizer'], ['classTraining', 'weightedTraining'], ['imperator']],
  senator: [['lobbySenate'], ['marketConnections', 'powerBegetsPower', 'socializer'], ['electedSenator'], ['princepsSenatus'], ['consul']],
  trickster: [['takeLoan'], ['informants', 'forbiddenContraband'], ['gambler'], ['bacchusPatron'], ['veilOfNight']],
};
export const PATHS: Path[] = ['lanista', 'senator', 'trickster'];

/** Base cost by number of opportunities already owned (05 §3.3, 03 §2.4). */
export const OPPORTUNITY_BASE_COSTS = [20, 40, 80, 160, 300, 500, 1000, 2000, 4000, 8000, 14000, 20000, 28000, 34000, 45000, 60000];

function seedChoice(state: GameState, path: Path, tier: number, n: number): number {
  const seed = Math.abs(state.player.treeSeed | 0);
  const base = path === 'lanista' ? seed % 2 : path === 'senator' ? Math.trunc(seed / 2) % 3 : Math.trunc(seed / 6) % 2;
  const swaps = state.player.counters[`oppSwap:${path}:${tier}`] ?? 0;
  return (base + swaps) % n;
}

/** Tree as shown for this run (alternates chosen by treeSeed, shifted by Rome Mansion swaps). */
export function treeFor(state: GameState): OpportunityDef[][] {
  return PATHS.map((path) => LAYOUT[path].map((alts, i) => OPPORTUNITIES[alts.length === 1 ? alts[0] : alts[seedChoice(state, path, i + 1, alts.length)]]));
}

/** Swap the alternate shown at a tier (GM: Rome Mansion ≥ 2, 250 denarii). Owned alternates stay owned. */
export function swapAlternate(state: GameState, path: Path, tier: number): string | null {
  const alts = LAYOUT[path]?.[tier - 1];
  if (!alts || alts.length < 2) return 'There is nothing to swap at that tier.';
  const me = state.player.ludus;
  if ((me.buildings.romeMansion ?? 0) < 2) return 'You need a Rome Mansion of level 2 to pull those strings.';
  if (me.denarii < 250) return 'Swapping costs 250 denarii.';
  me.denarii -= 250;
  const k = `oppSwap:${path}:${tier}`;
  state.player.counters[k] = (state.player.counters[k] ?? 0) + 1;
  return null;
}

export function hasOpp(state: GameState, id: OpportunityId): boolean {
  return state.player.opportunities.includes(id);
}

/** Princeps Senatus is only active while you hold a senate seat. */
export function princepsActive(state: GameState): boolean {
  return state.player.senator && hasOpp(state, 'princepsSenatus');
}

/** Lobby the Senate (GM hasSenatorInfluence). */
export function hasSenatorInfluence(state: GameState): boolean {
  return hasOpp(state, 'lobbySenate');
}

export function nextOpportunityCost(state: GameState): number {
  const n = state.player.opportunities.length;
  const base = OPPORTUNITY_BASE_COSTS[Math.min(n, OPPORTUNITY_BASE_COSTS.length - 1)];
  const d = state.world.difficulty;
  const k = (d.hard ? 1 : 0) + (d.nightmare ? 1 : 0) + (asc(state, ASC.sol) ? 1 : 0);
  return base + Math.trunc((base * k) / 2);
}

export function availableInfluence(h: Ludus): number {
  return Math.max(0, h.influence - h.allocatedInfluence);
}

export function canUnlock(state: GameState, id: OpportunityId): string | null {
  const def = OPPORTUNITIES[id];
  if (!def) return 'Unknown opportunity.';
  if (hasOpp(state, id)) return 'Already yours.';
  if (def.path === 'senator' && !hasUpgrade(state, 'senatorTree')) return 'The Senate path is locked (Senator Tree upgrade).';
  const tree = treeFor(state)[PATHS.indexOf(def.path)];
  if (tree[def.tier - 1]?.id !== id) return 'Not on offer in Capua this time.';
  if (def.tier > 1) {
    const prev = LAYOUT[def.path][def.tier - 2];
    if (!prev.some((p) => hasOpp(state, p))) return `Unlock ${tree[def.tier - 2].name} first.`;
  }
  const cost = nextOpportunityCost(state);
  if (availableInfluence(state.player.ludus) < cost) return `Needs ${cost} free influence.`;
  return null;
}

export function unlock(state: GameState, id: OpportunityId): string | null {
  const err = canUnlock(state, id);
  if (err) return err;
  const me = state.player.ludus;
  const cost = nextOpportunityCost(state);
  me.allocatedInfluence += cost;
  state.player.opportunities.push(id);
  switch (id) {
    case 'powerBegetsPower':
      me.influence += Math.trunc(me.influence / 10);
      break;
    case 'marketConnections':
      me.armory.push(makeGear('poultice', 2, newId('g')), makeGear('poultice', 2, newId('g')));
      break;
    case 'forbiddenContraband':
      me.armory.push(makeGear('bestiaryScroll', 2, newId('g')));
      break;
    default:
      break;
  }
  objectiveEvent(state, 'influence');
  objectiveEvent(state, `opportunity:${id}`);
  if (ALL_OPPORTUNITIES.every((o) => hasOpp(state, o))) achieve(state, 'completionist');
  return null;
}

export function setToggle(state: GameState, key: 'publicSessions' | 'bribeGeneral' | 'loan', on: boolean): string | null {
  const p = state.player;
  const me = p.ludus;
  const need: OpportunityId = key === 'loan' ? 'takeLoan' : key;
  if (!hasOpp(state, need)) return `Unlock ${OPPORTUNITIES[need].name} first.`;
  if (p.toggles[key] === on) return null;
  switch (key) {
    case 'publicSessions':
      me.securityPenalties += on ? 1 : -1;
      break;
    case 'bribeGeneral':
      me.projected += on ? -5 : 5;
      break;
    case 'loan':
      if (on) {
        me.denarii += 500;
        me.projected -= 25;
      } else {
        if (me.denarii < 500) return 'Repaying the moneylender takes 500 denarii.';
        me.denarii -= 500;
        me.projected += 25;
      }
      break;
  }
  p.toggles[key] = on;
  return null;
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

/** GM Public Sessions income (also paid free to AI rivals every week as "commoner tourists"). */
export function publicSessionsIncome(state: GameState, h: Ludus): number {
  const roster = h.creatures.filter((c) => canFightAge(c));
  const dinos = roster.filter((c) => c.kind === 'dino').length;
  const beasts = roster.filter((c) => c.kind === 'beast').length;
  const champions = roster.filter((c) => hasTrait(c, 'ArenaChampion')).length;
  let I = Math.trunc(h.influence / 10);
  if (I > 200) I = Math.trunc(h.influence / 100) + 180;
  const totalFame = roster.reduce((s, c) => s + Math.max(0, c.fame), 0);
  let F = Math.trunc(totalFame / 10);
  if (F > 500) F = Math.trunc(totalFame / 100) + 450;
  return 5 * champions + Math.trunc(I / 5) * Math.min(5, dinos + beasts) + F + 2 * (dinos + 2 * beasts);
}

const LOYALTY_INFLUENCE_STEPS = [50, 100, 500, 1000, 2000, 3000, 4000, 5000, 8000, 15000, 30000, 100000];

/** GM influenceLoyaltyEffect (−2 … +12/+15). */
export function influenceLoyaltyEffect(state: GameState, h: Ludus): number {
  let inf = h.influence;
  let e = 0;
  if (h.isPlayer) {
    if (asc(state, ASC.sol)) inf = inf * 0.8;
    if (hasOpp(state, 'forbiddenContraband')) e += 2;
    if (hasOpp(state, 'bacchusPatron')) e += 1;
  }
  if (inf < 10) e -= 1;
  if (inf < 20) e -= 1;
  for (const s of LOYALTY_INFLUENCE_STEPS) if (inf >= s) e += 1;
  return e;
}

// ---------------------------------------------------------------------------
// Elections (05 §3.4–3.5)
// ---------------------------------------------------------------------------

export const ELECTION_COST = { senate: 400, consul: 1000 } as const;
export const ELECTION_WEEKS = 5;
export const SMEAR_COST = 200;

export function electionStartVotes(office: 'senate' | 'consul', influence: number): number {
  if (office === 'senate') return 5 + (influence > 1200 ? 10 : influence > 700 ? 7 : influence > 400 ? 5 : 0);
  return 5 + (influence > 12000 ? 10 : influence > 6000 ? 5 : influence > 2000 ? 2 : 0);
}

export function canStartElection(state: GameState, office: 'senate' | 'consul'): string | null {
  const p = state.player;
  const me = p.ludus;
  if (p.election) return 'A campaign is already under way.';
  if (office === 'senate') {
    if (!hasUpgrade(state, 'senatorTree')) return 'The Senate path is locked (Senator Tree upgrade).';
    if (!hasOpp(state, 'electedSenator')) return 'Unlock Elected Senator first.';
    if (p.senator) return 'You already sit in the Senate.';
  } else {
    if (!p.senator) return 'Only a senator may stand for consul.';
    if (!hasOpp(state, 'consul')) return 'Unlock Consul first.';
    if (p.consul) return 'You are already consul.';
  }
  if (me.denarii < ELECTION_COST[office]) return `A campaign costs ${ELECTION_COST[office]} denarii.`;
  if (me.influence < 200) return 'Nobody votes for a lanista with less than 200 influence.';
  return null;
}

export function startElection(state: GameState, office: 'senate' | 'consul'): string | null {
  const err = canStartElection(state, office);
  if (err) return err;
  const me = state.player.ludus;
  me.denarii -= ELECTION_COST[office];
  const votes = electionStartVotes(office, me.influence);
  const e: ElectionState = {
    office, startWeek: state.world.week, votes, smear: false, campaigners: [], history: [votes], lastInfluence: me.influence,
  };
  state.player.election = e;
  message(state, 'herald', office === 'senate' ? 'Campaign for the Senate' : 'Campaign for the consulship',
    `Your name is painted on every wall in Capua. ${votes} votes pledged so far; you need 100 within ${ELECTION_WEEKS} weeks.`);
  return null;
}

/** Fame thresholds for campaigning dinos (senate / consul). */
const CAMPAIGN_FAME: Record<'senate' | 'consul', number[]> = {
  senate: [100, 250, 400, 600, 1000],
  consul: [300, 600, 1000, 1500, 2500],
};

function campaignPenalty(state: GameState): number {
  return state.world.difficulty.hard ? 4 : 2;
}

/** Apply/remove the campaigning security penalty so it tracks whether anyone is campaigning. */
function syncCampaignPenalty(state: GameState): void {
  const me = state.player.ludus;
  const applied = Number(state.player.storyData.campaignSecPenalty ?? 0);
  const want = state.player.election && state.player.election.campaigners.length > 0 ? campaignPenalty(state) : 0;
  if (applied !== want) {
    me.securityPenalties += want - applied;
    state.player.storyData.campaignSecPenalty = want;
  }
}

function campaignEligible(c: Creature): boolean {
  if (c.kind !== 'dino') return false;
  if (c.away && c.away.kind !== 'campaign') return false;
  if (c.injury || c.ill > 0) return false;
  return canFightAge(c);
}

export function setElectionAction(state: GameState, o: { smear?: boolean; campaigners?: string[] }): void {
  const e = state.player.election;
  if (!e) return;
  if (o.smear !== undefined) e.smear = o.smear;
  if (o.campaigners) {
    const me = state.player.ludus;
    const wanted = new Set(o.campaigners);
    // release dinos taken off the campaign trail
    for (const id of e.campaigners) {
      if (wanted.has(id)) continue;
      const c = me.creatures.find((x) => x.id === id);
      if (c?.away?.kind === 'campaign') c.away = undefined;
    }
    const list: string[] = [];
    for (const id of wanted) {
      const c = me.creatures.find((x) => x.id === id);
      if (!c || !campaignEligible(c)) continue;
      c.away = { kind: 'campaign', weeksLeft: 1, note: 'Shaking claws with voters' };
      list.push(id);
    }
    e.campaigners = list;
  }
  syncCampaignPenalty(state);
}

/** GM vote table f(g). */
export function votesForGain(g: number): number {
  if (g <= -11) return -4;
  if (g <= -1) return -2;
  if (g <= 2) return 0;
  if (g <= 4) return 1;
  if (g <= 7) return 2;
  if (g <= 10) return 3;
  if (g <= 15) return 5;
  if (g <= 20) return 6;
  if (g <= 35) return 7;
  if (g <= 55) return 9;
  if (g <= 65) return 11;
  if (g <= 85) return 13;
  if (g <= 105) return 15;
  return 17;
}

export function campaignVotes(state: GameState): number {
  const e = state.player.election;
  if (!e) return 0;
  const me = state.player.ludus;
  const th = CAMPAIGN_FAME[e.office];
  let v = 0;
  for (const id of e.campaigners) {
    const c = me.creatures.find((x) => x.id === id);
    if (!c || c.injury || c.ill > 0) continue;
    v += 1 + th.filter((t) => c.fame > t).length;
  }
  return Math.min(10, v);
}

function endCampaign(state: GameState): void {
  const e = state.player.election;
  if (!e) return;
  for (const id of e.campaigners) {
    const c = state.player.ludus.creatures.find((x) => x.id === id);
    if (c?.away?.kind === 'campaign') c.away = undefined;
  }
  e.campaigners = [];
  syncCampaignPenalty(state);
  state.player.election = undefined;
}

/** Weekly vote progress; returns a result card when decided. */
export function electionWeek(state: GameState): ResultCard | null {
  const p = state.player;
  const e = p.election;
  if (!e) return null;
  const me = p.ludus;
  let g = me.influence - e.lastInfluence;
  if (asc(state, ASC.venus)) g = Math.trunc(g / 2);
  if (e.office === 'consul') g = Math.trunc(g / 2);
  let gained = votesForGain(g) + (state.world.difficulty.nightmare ? rand(2) : 1 + rand(3));
  if (e.smear) {
    if (me.denarii >= SMEAR_COST) {
      me.denarii -= SMEAR_COST;
      gained += state.world.difficulty.hard ? 6 : 8;
      report(state, 'expense', 'Smear campaign', -SMEAR_COST);
    } else {
      e.smear = false;
      message(state, 'assistant', 'Smear campaign halted', 'The pamphleteers want 200 denarii up front. You could not pay, so they are writing nice things about your rival instead.');
    }
  }
  gained += campaignVotes(state);
  e.votes = Math.max(0, e.votes + gained);
  e.history.push(e.votes);
  e.lastInfluence = me.influence;
  if (p.week) p.week.electionVotes = gained;
  const updates = e.history.length - 1;
  if (updates < ELECTION_WEEKS) {
    // keep campaigners on the trail for next week
    for (const id of e.campaigners) {
      const c = me.creatures.find((x) => x.id === id);
      if (c && campaignEligible(c)) c.away = { kind: 'campaign', weeksLeft: 1, note: 'Shaking claws with voters' };
    }
    e.campaigners = e.campaigners.filter((id) => me.creatures.some((c) => c.id === id && c.away?.kind === 'campaign'));
    syncCampaignPenalty(state);
    return null;
  }
  const won = e.votes >= 100;
  const office = e.office;
  const votes = e.votes;
  endCampaign(state);
  if (won) winOffice(state, office);
  else {
    message(state, 'herald', office === 'senate' ? 'The Senate says no' : 'The consulship slips away',
      `Only ${votes} votes. The other candidate's slaves carried more urns to the forum than yours did. There is always next year.`);
  }
  return { kind: 'election', won, office, votes };
}

function winOffice(state: GameState, office: 'senate' | 'consul'): void {
  const p = state.player;
  if (office === 'senate') {
    p.senator = true;
    achieve(state, 'winSenateElections');
    message(state, 'herald', 'Senator!',
      'You have been elected to the Senate of Rome. Your toga now has a purple stripe and your dinos have a new reason to hate the smell of perfume. ' +
      '+50 denarii and +5 influence a week, and +10 % on influence gains.');
  } else {
    p.consul = true;
    p.ludus.securityPenalties -= 2;
    const lictor = makeLictorFor(state);
    p.storyData.lictor = lictor;
    message(state, 'herald', 'Consul of Rome',
      `The fasces are yours. Two lictors now follow you everywhere, including places you would rather they did not. ${lictor.name} will stand by you in street fights.`);
  }
}

/** GM Lictor (level 6/10/15 by week 120/220), built locally so the level rule always holds. */
function makeLictorFor(state: GameState): Creature {
  const c = makeLictor(state);
  c.loyalty = 100;
  state.player.storyData.lictorLevel = c.level;
  // quality legion barding and faceplate, kept with the lictor (not in your armory)
  state.player.storyData.lictorGear = [makeGear('legionBarding', 3, newId('g')), makeGear('legionFaceplate', 3, newId('g'))];
  return c;
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

const BRIBE_GENERAL_NAMES = ['crixus', 'hannibalbarca', 'hermes', 'maximus'] as const;

/** Queue a creature for the market after this week's market regeneration (flushed by horde.timelineWeek). */
export function queueMarketOffer(state: GameState, c: Creature): void {
  const q: Creature[] = state.player.storyData.pendingMarket ?? [];
  q.push(c);
  state.player.storyData.pendingMarket = q;
}

/** Move queued offers into the market (called after the markets regenerate). */
export function flushMarketOffers(state: GameState): Creature[] {
  const q: Creature[] = state.player.storyData.pendingMarket ?? [];
  state.player.storyData.pendingMarket = [];
  for (const c of q) if (!state.world.market.creatures.includes(c)) state.world.market.creatures.push(c);
  return q;
}

/** GM World.handleInfluenceEvents: the general's weekly prisoner offer. */
export function bribeGeneralOffer(state: GameState): Creature | null {
  const f = state.world.flags;
  const week = state.world.week;
  if (f.bgNamedOffered && rand(10) >= 4) return null; // after a named prisoner: 40 % of weeks
  const roll = rand(5);
  let key: string | null = roll < 4 ? BRIBE_GENERAL_NAMES[roll] : null;
  if (key === 'maximus' && (week < 24 || !coin())) key = null;
  if (key && f[`bg:${key}`]) key = null;
  let c: Creature;
  if (key) {
    c = legendCreature(state, key);
    f[`bg:${key}`] = true;
    f.bgNamedOffered = true;
  } else {
    c = generateDino({ tier: 'epic', week, level: Math.max(1, Math.trunc(week / 10) + 1) });
  }
  c.price = c.price ?? marketPrice(c);
  c.loyalty = Math.min(c.loyalty, 60);
  queueMarketOffer(state, c);
  message(state, 'informant', 'A gift from the legions',
    `Your friend the general writes: "We netted ${key ? 'a famous' : 'a savage'} ${c.kind === 'beast' ? 'beast' : 'dino'} in the hills. ${c.name} is yours for ${c.price} denarii, ` +
    'if you want it. It bit two of my centurions, so do not dawdle." You will find it at the market.');
  return c;
}

function opinionTicks(state: GameState): void {
  const w = state.world.week;
  let n = 0;
  if (hasOpp(state, 'socializer') && ((w < 60 && w % 5 === 1) || w % 9 === 4)) n += 1;
  if (hasOpp(state, 'bacchusPatron') && ((w < 50 && w % 10 === 3) || w % 15 === 1)) n += 1;
  if (!n) return;
  for (const r of activeRivals(state)) changeOpinion(state, r, n);
}

function refreshLictor(state: GameState): void {
  const p = state.player;
  if (!p.consul || !p.storyData.lictor) return;
  const want = lictorLevel(state.world.week);
  if (Number(p.storyData.lictorLevel ?? 0) < want) {
    const c = makeLictorFor(state);
    p.storyData.lictor = c;
    message(state, 'magistrate', 'A new lictor', `The Senate has assigned you a better bodyguard: ${c.name}.`);
  }
}

/** Bribe General weekly prisoner offers, senator influence ticks etc. */
export function influenceWeek(state: GameState): void {
  const p = state.player;
  const me = p.ludus;
  const week = state.world.week;
  if (p.senator && week > 0 && week % 5 === 0) addInfluence(state, me, 1);
  if (p.toggles.bribeGeneral && hasOpp(state, 'bribeGeneral')) bribeGeneralOffer(state);
  opinionTicks(state);
  refreshLictor(state);
  if (ALL_OPPORTUNITIES.every((o) => hasOpp(state, o))) achieve(state, 'completionist');
  // keep the toggles consistent with ownership (e.g. after a load)
  p.toggles.publicSessions = p.toggles.publicSessions && hasOpp(state, 'publicSessions');
  // healthy campaigners only
  if (p.election) {
    const before = p.election.campaigners.length;
    p.election.campaigners = p.election.campaigners.filter((id) => {
      const c = me.creatures.find((x) => x.id === id);
      const ok = !!c && !c.injury && c.ill <= 0;
      if (c && !ok && c.away?.kind === 'campaign') c.away = undefined;
      return ok;
    });
    if (p.election.campaigners.length !== before) syncCampaignPenalty(state);
  }
}

/** Votes the player would gain this week if nothing changed (UI projection). */
export function projectedVotes(state: GameState): { min: number; max: number } {
  const e = state.player.election;
  if (!e) return { min: 0, max: 0 };
  let g = state.player.ludus.influence - e.lastInfluence;
  if (asc(state, ASC.venus)) g = Math.trunc(g / 2);
  if (e.office === 'consul') g = Math.trunc(g / 2);
  const base = votesForGain(g) + (e.smear ? (state.world.difficulty.hard ? 6 : 8) : 0) + campaignVotes(state);
  return state.world.difficulty.nightmare ? { min: base, max: base + 1 } : { min: base + 1, max: base + 3 };
}

