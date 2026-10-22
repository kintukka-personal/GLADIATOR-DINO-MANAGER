// Integration harness: a simple bot plays whole runs through the public engine API.
// Catches crashes, NaNs and broken invariants across every module.
import { describe, it, expect } from 'vitest';
import type { GameState, Creature } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { beginAdvance, completeWeek } from '../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus, eligibility, register } from '../src/engine/tournaments';
import { buyCreature, buyFood } from '../src/engine/market';
import { hireKeepers, assignKeepers } from '../src/engine/economy';
import { canBuild, build } from '../src/engine/buildings';
import { learnTech, spendPoint } from '../src/engine/care';
import { resolveDecision } from '../src/engine/events';
import { activeConversation, answerConversation } from '../src/engine/stories';
import { resolveDefense } from '../src/engine/intrigue';
import { pendingAdventures, resolveAdventure } from '../src/engine/adventures';
import { assignPair, breedingIssue, fulfillImprint } from '../src/engine/breeding';
import { marketPrice, isAdult, knownTech, isLearnable, meetsRequirement } from '../src/engine/creature';
import { LEARNABLE } from '../src/engine/data/techniques';
import { serialize, deserialize } from '../src/engine/save';
import { STATS } from '../src/engine/types';

function tryDo(f: () => unknown): void {
  try { f(); } catch (e) { if (String(e).includes('not implemented')) throw e; }
}

function bot(state: GameState): void {
  const h = state.player.ludus;
  // answer everything pending
  for (const d of [...state.player.decisions]) {
    const opt = d.options.findIndex((o) => !o.disabled);
    resolveDecision(state, d.id, Math.max(0, opt));
  }
  for (let i = 0; i < 5; i++) {
    const c = activeConversation(state);
    if (!c) break;
    const opt = c.options.findIndex((o) => !o.disabled);
    answerConversation(state, c.id, Math.max(0, opt));
  }
  for (const d of [...state.player.defenses]) resolveDefense(state, d.id, 'passive');
  for (const a of pendingAdventures(state)) resolveAdventure(state, a.adventure.id, 0);

  // keepers
  if (h.denarii > 300 && h.keepers.miners < 12) {
    if (!hireKeepers(state, 1)) assignKeepers(state, h, 'miners', 1);
  }
  if (h.keepers.unassigned > 0) assignKeepers(state, h, 'miners', h.keepers.unassigned);

  // buy dinos
  const fighters = h.creatures.filter((c) => c.kind === 'dino');
  if (fighters.length < 4 && h.denarii > 500) {
    const pick = [...state.world.market.creatures].filter((c) => c.kind === 'dino').sort((a, b) => marketPrice(a) - marketPrice(b))[0];
    if (pick && marketPrice(pick) < h.denarii - 200) buyCreature(state, pick.id);
  }

  // build
  for (const b of ['mine', 'trainingField', 'residence', 'breedingPen', 'hatchery', 'nursery', 'veterinarium', 'palisade'] as const) {
    const chk = canBuild(state, h, b);
    if (chk.ok && h.denarii - chk.cost > 400) { build(state, h, b); break; }
  }

  // develop creatures
  for (const c of h.creatures) {
    while (c.statPoints > 0) spendPoint(state, c.id, STATS[c.level % 4]);
    if (c.techPoints > 0 && c.kind === 'dino') {
      const t = LEARNABLE.find((id) => isLearnable(c, id) && meetsRequirement(c, id, (knownTech(c, id)?.rank ?? 0) + 1));
      if (t) learnTech(state, c.id, t);
    }
  }

  // breeding
  const free = (c: Creature) => !h.pairs.some((p) => p.femaleId === c.id) && !breedingIssue(c);
  for (const f of h.creatures.filter((c) => c.sex === 'F' && isAdult(c) && free(c))) {
    const m = h.creatures.find((c) => c.sex === 'M' && c.species === f.species && !breedingIssue(c));
    if (m) tryDo(() => assignPair(state, m.id, f.id));
  }
  for (const c of h.creatures) {
    const r = c.imprintRequest;
    if (r && !r.done) {
      if (r.kind === 'feed' && r.food && (h.pantry[r.food] ?? 0) <= 0) buyFood(state, r.food, 1);
      fulfillImprint(state, c.id);
    }
  }

  // register for one tournament
  const ts = state.world.tournaments.filter((t) => t.status === 'open');
  for (const t of ts) {
    const ok = h.creatures.filter((c) => !eligibility(state, t, c));
    if (ok.length >= t.perTeam) {
      const team = ok.slice(0, t.perTeam).map((c) => c.id);
      if (!register(state, t.id, [team])) break;
    }
  }
}

function playWeek(state: GameState): void {
  beginAdvance(state);
  const t = attendedTournament(state);
  if (t) {
    for (let guard = 0; guard < 40; guard++) {
      const m = nextPlayerMatch(state, t);
      if (!m) break;
      playMatch(state, t, {});
      if (t.status === 'bonus') continueBonus(state, t, t.bonusRound < 2);
    }
  }
  completeWeek(state);
}

function checkInvariants(state: GameState): void {
  const h = state.player.ludus;
  expect(Number.isFinite(h.denarii)).toBe(true);
  expect(Number.isFinite(h.influence)).toBe(true);
  for (const c of [...h.creatures, ...state.rivals.flatMap((r) => r.creatures)]) {
    expect(Number.isFinite(c.xp)).toBe(true);
    expect(c.loyalty).toBeGreaterThanOrEqual(0);
    expect(c.loyalty).toBeLessThanOrEqual(100);
    for (const s of STATS) expect(Number.isFinite(c.genes.wild[s])).toBe(true);
  }
}

describe('long run', () => {
  for (const [label, opts] of [
    ['normal', { hard: false, nightmare: false }],
    ['hard', { hard: true, nightmare: false }],
    ['nightmare', { hard: true, nightmare: true }],
  ] as const) {
    it(`plays 160 weeks on ${label} without crashing`, () => {
      const meta = emptyMeta();
      const state = createNewGame({
        lanista: 'Bot', female: false, heritage: 'roman', hard: opts.hard, nightmare: opts.nightmare, sandbox: false,
        raidsDisabled: false, betrayalsDisabled: false, ascension: 0, slot: 1, seed: 4242 + label.length,
      }, meta);
      let weeks = 0;
      for (; weeks < 160 && !state.over; weeks++) {
        bot(state);
        playWeek(state);
        checkInvariants(state);
        if (weeks % 40 === 39) {
          const copy = deserialize(serialize(state));
          expect(copy.world.week).toBe(state.world.week);
        }
      }
      const h = state.player.ludus;
      // eslint-disable-next-line no-console
      console.log(`[${label}] weeks=${weeks} over=${state.over?.reason ?? '-'} denarii=${h.denarii} influence=${h.influence} ` +
        `creatures=${h.creatures.length} rivals=${state.rivals.length} hatched=${state.runStats.hatched} battles=${state.runStats.battles} ` +
        `wins=${state.runStats.wins} deaths=${state.runStats.deaths} horde=${state.world.horde.rogues.length}+${state.world.horde.ferals}`);
      expect(weeks).toBeGreaterThan(20);
    }, 120_000);
  }
});
