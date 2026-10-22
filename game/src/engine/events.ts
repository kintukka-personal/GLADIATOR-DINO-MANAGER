// Random weekly decision events (~85) and delayed outcomes. OWNER: systems-story agent. GM 04 §6–7.
//
// Event definitions live in data/eventsData*.ts (general, politics, quests, breeding); helpers in
// data/eventsDataKit.ts. Selection follows GM DecisionFactory.getRandomDecision (04 §6.1):
//   1. Tartarus: the underworld attack every 20th week after week 10 (ascension ≥ 15)
//   2. a rebel raid from the horde module (if it returns a Decision)
//   3. one event drawn uniformly (by weight) from the eligible pool not in player.decisionHistory;
//      the history resets when the pool runs dry; an election campaign restricts the pool.
// The first two draws of a run follow the GM tutorial weeks (04 §6.4).

import type { BattleResult, Decision, GameState, ID } from './types';
import { pick, weighted } from './rng';
import { message } from './util';
import { rebelRaid, resolveRaid } from './horde';
import { dn, optionProblem, type DelayedHandler } from './data/eventsDataKit';
import { GENERAL_EVENTS, GENERAL_DELAYED } from './data/eventsDataGeneral';
import { POLITICS_EVENTS, POLITICS_DELAYED } from './data/eventsDataPolitics';
import { QUEST_EVENTS, QUEST_DELAYED } from './data/eventsDataQuests';
import { BREEDING_EVENTS, BREEDING_DELAYED } from './data/eventsDataBreeding';

export interface EventDef {
  key: string;
  /** eligibility + build (returns null when not eligible) */
  make: (state: GameState) => Decision | null;
  /** apply the chosen option; may fight a street battle and return it for viewing */
  resolve: (state: GameState, d: Decision, option: number) => { text: string; battle?: BattleResult };
  weight?: number;
  /** election-campaign-only event */
  campaign?: boolean;
  /** applied once when the event is drawn (a weapon is sabotaged, keepers are abducted…) */
  onDraw?: (state: GameState, d: Decision) => void;
  /** applied when the decision expires unanswered */
  onExpire?: (state: GameState, d: Decision) => void;
  /** never drawn at random (auction bids, follow-up reports) */
  followUp?: boolean;
  /** priority event outside the pool (Tartarus) */
  priority?: boolean;
  /** GM tutorial week (−1 or 0) the event belongs to (04 §6.4) */
  tutorial?: -1 | 0;
  /** also allowed during an election campaign (GM: the rudis request) */
  campaignToo?: boolean;
}

export const EVENTS: EventDef[] = [...GENERAL_EVENTS, ...POLITICS_EVENTS, ...QUEST_EVENTS, ...BREEDING_EVENTS];

const BY_KEY = new Map<string, EventDef>(EVENTS.map((e) => [e.key, e]));

export function eventDef(key: string): EventDef | undefined {
  return BY_KEY.get(key);
}

const DELAYED: Record<string, DelayedHandler> = {
  ...GENERAL_DELAYED, ...POLITICS_DELAYED, ...QUEST_DELAYED, ...BREEDING_DELAYED,
};

/** Other modules may register handlers for their own delayed outcome keys. */
export function registerDelayed(key: string, handler: DelayedHandler): void {
  DELAYED[key] = handler;
}

/** Keys of every event that can be drawn at random. */
export const EVENT_KEYS: string[] = EVENTS.filter((e) => !e.followUp && !e.priority).map((e) => e.key);

/** Rebel raid decisions come from the horde module and are resolved there. */
export function isRaidDecision(d: Decision): boolean {
  if (BY_KEY.has(d.key)) return false;
  return d.data?.__raid === true || /raid|rebel|horde/i.test(d.key);
}

function safeMake(def: EventDef, state: GameState): Decision | null {
  try {
    return def.make(state);
  } catch (e) {
    // an event whose dependencies are unavailable is simply not eligible
    if (String(e).includes('not implemented')) return null;
    throw e;
  }
}

function inElection(state: GameState): boolean {
  return !!state.player.election;
}

interface Candidate { def: EventDef; d: Decision }

function eligible(state: GameState, pool: EventDef[]): Candidate[] {
  const history = new Set(state.player.decisionHistory);
  const pending = new Set(state.player.decisions.map((d) => d.key));
  const out: Candidate[] = [];
  for (const def of pool) {
    if (history.has(def.key) || pending.has(def.key)) continue;
    const d = safeMake(def, state);
    if (d) out.push({ def, d });
  }
  return out;
}

function take(state: GameState, c: Candidate): Decision {
  state.player.decisionHistory.push(c.def.key);
  c.def.onDraw?.(state, c.d);
  return c.d;
}

/** Tutorial draws (GM weeks −1 and 0): plebe in debt, then one of the week-0 set. */
function tutorialDraw(state: GameState): Decision | null {
  const p = state.player;
  const n = p.counters.tutorialEvents ?? 0;
  if (n >= 2 || state.world.week > 4) return null;
  p.counters.tutorialEvents = n + 1;
  const stage = n === 0 ? -1 : 0;
  const pool = EVENTS.filter((e) => e.tutorial === stage);
  // tutorial draws relax the events' calendar thresholds (data/eventsDataGeneral.ts `tutorial`)
  p.week.__tutorial = true;
  let cands: Candidate[];
  try {
    cands = eligible(state, pool);
  } finally {
    delete p.week.__tutorial;
  }
  if (!cands.length) return null;
  return take(state, pick(cands));
}

/** GM DecisionFactory.getRandomDecision: underworld attack, rebel raid priority, then one eligible event not in history. */
export function drawWeeklyDecision(state: GameState): Decision | null {
  const p = state.player;
  refreshDecisions(state);
  // 1. Tartarus underworld attack
  for (const def of EVENTS.filter((e) => e.priority)) {
    if (p.decisions.some((d) => d.key === def.key)) continue;
    const d = safeMake(def, state);
    if (d) {
      def.onDraw?.(state, d);
      return d;
    }
  }
  // 2. Rebel raid
  const raid = rebelRaid(state);
  if (raid) {
    raid.data = { ...(raid.data ?? {}), __raid: true };
    return raid;
  }
  // tutorial weeks
  const tut = tutorialDraw(state);
  if (tut) return tut;
  // 3. One eligible event
  const campaign = inElection(state);
  const pool = EVENTS.filter((e) => !e.followUp && !e.priority && (campaign ? e.campaign || e.campaignToo : !e.campaign));
  let cands = eligible(state, pool);
  if (!cands.length) {
    // "Recent events will usually not appear again for some time": the history resets when the pool empties
    p.decisionHistory = [];
    cands = eligible(state, pool);
  }
  if (!cands.length) return null;
  const pickd = weighted(cands, cands.map((c) => c.def.weight ?? 1));
  return take(state, pickd);
}

/**
 * Re-evaluate every pending decision's options against today's purse (costs and requirements are stored
 * by data/eventsDataKit.decide), so `option.disabled` / `reason` stay true for the UI.
 */
export function refreshDecisions(state: GameState): void {
  for (const d of state.player.decisions) {
    if (isRaidDecision(d) || !Array.isArray(d.data?.costs)) continue;
    d.options.forEach((o, i) => {
      const problem = optionProblem(state, d, i);
      if (problem) {
        o.disabled = true;
        o.reason = d.data.needs?.[i] ?? `Needs ${dn(d.data.costs[i])}.`;
      } else {
        delete o.disabled;
        delete o.reason;
      }
    });
  }
}

/** Can this option be chosen right now? (null = yes; else the reason). */
export function decisionOptionProblem(state: GameState, decisionId: ID, option: number): string | null {
  const d = state.player.decisions.find((x) => x.id === decisionId);
  if (!d) return 'That matter has already been settled.';
  if (isRaidDecision(d)) return d.options[option]?.disabled ? d.options[option].reason ?? 'Not possible.' : null;
  return optionProblem(state, d, option);
}

export function resolveDecision(state: GameState, decisionId: ID, option: number): { text: string; battle?: BattleResult } {
  const p = state.player;
  const d = p.decisions.find((x) => x.id === decisionId);
  if (!d) return { text: 'That matter has already been settled.' };
  if (isRaidDecision(d)) {
    const r = resolveRaid(state, d, option);
    p.decisions = p.decisions.filter((x) => x.id !== d.id);
    return r;
  }
  const def = BY_KEY.get(d.key);
  if (!def) {
    p.decisions = p.decisions.filter((x) => x.id !== d.id);
    return { text: 'Nobody remembers what that was about.' };
  }
  const problem = optionProblem(state, d, option);
  if (problem) return { text: problem };
  const r = def.resolve(state, d, option);
  p.decisions = p.decisions.filter((x) => x.id !== d.id);
  p.counters.decisionsResolved = (p.counters.decisionsResolved ?? 0) + 1;
  refreshDecisions(state);
  return r;
}

/** Resolve delayed outcomes whose week has come. */
export function delayedWeek(state: GameState): void {
  const p = state.player;
  const now = state.world.week;
  const due = p.delayed.filter((o) => o.week <= now && DELAYED[o.key]);
  // drop unknown outcomes that nobody claimed for a year
  p.delayed = p.delayed.filter((o) => !due.includes(o) && !(o.week < now - 52 && !DELAYED[o.key]));
  for (const o of due) DELAYED[o.key](state, o.data ?? {}, o);
}

/** Drop decisions older than 7 weeks. */
export function expireDecisions(state: GameState): void {
  const p = state.player;
  const now = state.world.week;
  const old = p.decisions.filter((d) => now - d.week > 7);
  if (!old.length) return;
  p.decisions = p.decisions.filter((d) => now - d.week <= 7);
  for (const d of old) {
    const def = BY_KEY.get(d.key);
    def?.onExpire?.(state, d);
  }
  if (old.length) message(state, 'assistant', 'Matters left unattended', `${old.map((d) => d.title).join(', ')}: the moment has passed.`);
}
