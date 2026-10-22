// Integration harness: a simple bot plays whole runs through the public engine API.
// Catches crashes, NaNs and broken invariants across every module.
import { describe, it, expect } from 'vitest';
import type { GameState, Creature } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { beginAdvance, completeWeek } from '../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus, eligibility, register } from '../src/engine/tournaments';
import { buyCreature, buyFood, buyGear, marketGearPrice } from '../src/engine/market';
import { assignGear, setDoctore } from '../src/engine/care';
import { GEAR } from '../src/engine/data/gear';
import { buildingTotals } from '../src/engine/buildings';
import { hireKeepers, assignKeepers } from '../src/engine/economy';
import { canBuild, build } from '../src/engine/buildings';
import { learnTech, spendPoint } from '../src/engine/care';
import { resolveDecision } from '../src/engine/events';
import { activeConversation, answerConversation } from '../src/engine/stories';
import { resolveDefense } from '../src/engine/intrigue';
import { pendingAdventures, resolveAdventure } from '../src/engine/adventures';
import { assignPair, breedingIssue, fulfillImprint } from '../src/engine/breeding';
import { marketPrice, isAdult, knownTech, isLearnable, meetsRequirement, getStats } from '../src/engine/creature';
import { gearLine } from '../src/engine/data/gear';
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
    // a sensible player: the cheapest option that is allowed (raids: fight with the champion)
    const costs: number[] = d.data?.costs ?? d.options.map(() => 0);
    let best = -1;
    d.options.forEach((o, i) => {
      if (o.disabled) return;
      if (best < 0 || (costs[i] ?? 0) < (costs[best] ?? 0)) best = i;
    });
    resolveDecision(state, d.id, d.key === 'rebelRaid' ? (!d.options[0].disabled ? 0 : !d.options[1].disabled ? 1 : 2) : Math.max(0, best));
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
  const keepers = h.keepers.miners + h.keepers.showmen + h.keepers.wardens + h.keepers.spies + h.keepers.unassigned;
  if (h.denarii > 350 && keepers < buildingTotals(h).beds + 2 && state.world.market.keepers.count > 0) {
    if (!hireKeepers(state, 1)) {
      // GM opening: miners first, a couple of wardens, then showmen for influence and tameness
      const job = h.keepers.miners < 6 ? 'miners' : h.keepers.wardens < 2 + state.world.week / 25 ? 'wardens'
        : h.keepers.showmen < 3 + state.world.week / 20 ? 'showmen' : 'miners';
      assignKeepers(state, h, job, 1);
    }
  }
  if (h.keepers.unassigned > 0) assignKeepers(state, h, 'miners', h.keepers.unassigned);

  // GM opening: a starter legend and the cheap dire wolf Aello in week 1
  if (state.world.week === 1) {
    const tet = state.world.market.creatures.find((c) => c.name === 'Tetraites');
    const aello = state.world.market.creatures.find((c) => c.name === 'Aello');
    if (tet && h.denarii >= marketPrice(tet) + 300) buyCreature(state, tet.id);
    if (aello && h.denarii >= marketPrice(aello) + 200) buyCreature(state, aello.id);
  }
  // buy dinos: the best value adult a sensible lanista can afford (stats per denarius), never hatchlings
  const fighters = h.creatures.filter((c) => c.kind === 'dino');
  if (fighters.length < 4 && h.denarii > 450) {
    const value = (c: Creature) => { const st = getStats(c); return (st.str * 1.4 + st.agi * 1.2 + st.cun * 0.6 + st.hp / 4 + c.level * 3) / Math.max(50, marketPrice(c)); };
    const pick = [...state.world.market.creatures].filter((c) => c.kind === 'dino' && c.maturity >= 1 && marketPrice(c) < h.denarii - 250)
      .sort((a, b) => value(b) - value(a))[0];
    if (pick) buyCreature(state, pick.id);
  }

  // gear: a weapon then barding for each dino, within budget
  for (const c of h.creatures.filter((x) => x.kind === 'dino' && x.maturity >= 0.8)) {
    for (const slot of ['weapon', 'armor', 'helmet'] as const) {
      if (c.gear[slot]) continue;
      const own = h.armory.find((g) => GEAR[g.type].slot === slot && !h.creatures.some((o) => Object.values(o.gear).includes(g.id)));
      if (own) { assignGear(state, c.id, slot, own.id); continue; }
      const offer = state.world.market.gear
        .filter((g) => GEAR[g.type].slot === slot && !GEAR[g.type].upgrade && !(GEAR[g.type].effects.includes('TwoHandedOnly')))
        .filter((g) => marketGearPrice(state, g) < h.denarii - 300)
        .sort((a, b) => { const la = gearLine(a), lb = gearLine(b); return (lb.dmg * 3 + lb.blk * 2 + lb.reach * 2 + lb.agi) - (la.dmg * 3 + la.blk * 2 + la.reach * 2 + la.agi); })[0];
      if (offer) {
        if (!buyGear(state, offer.id)) {
          const g = h.armory[h.armory.length - 1];
          if (g) assignGear(state, c.id, slot, g.id);
        }
      }
    }
  }

  // build
  for (const b of ['mine', 'trainingField', 'residence', 'breedingPen', 'hatchery', 'nursery', 'veterinarium', 'palisade'] as const) {
    const chk = canBuild(state, h, b);
    if (chk.ok && h.denarii - chk.cost > 400) { build(state, h, b); break; }
  }

  if (!h.doctoreId && h.creatures.filter((c) => c.kind === 'dino').length >= 3) {
    const d = [...h.creatures].filter((c) => c.kind === 'dino' && !c.injury).sort((a, b) => b.level - a.level || getStats(b).cun - getStats(a).cun)[0];
    if (d) setDoctore(state, d.id);
  }
  // develop creatures
  for (const c of h.creatures) {
    while (c.statPoints > 0) spendPoint(state, c.id, c.level % 3 === 0 ? 'hp' : getStats(c).str >= getStats(c).agi ? 'str' : 'agi');
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
  const best = Math.max(0, ...h.creatures.map((c) => c.level));
  const ts = state.world.tournaments.filter((t) => t.status === 'open' && (['rookie', 'junior', 'underground'].includes(t.type) || best >= 4))
    .sort((a, b) => (['rookie', 'junior'].includes(b.type) ? 1 : 0) - (['rookie', 'junior'].includes(a.type) ? 1 : 0));
  for (const t of ts) {
    const ok = h.creatures.filter((c) => !eligibility(state, t, c));
    if (ok.length >= t.perTeam) {
      const fit = ok.filter((c) => !c.injury && c.loyalty > 40);
      if (fit.length < t.perTeam) continue;
      for (const c of fit) c.instruction = 'care';
      const team = fit.slice(0, t.perTeam).map((c) => c.id);
      if (!register(state, t.id, [team])) break;
    }
  }
}

const STATS_BY_TYPE: Record<string, number> = {};
function playWeek(state: GameState): void {
  beginAdvance(state);
  const t = attendedTournament(state);
  if (t) {
    for (let guard = 0; guard < 40; guard++) {
      const m = nextPlayerMatch(state, t);
      if (!m) break;
      const pm = playMatch(state, t, {});
      const k = t.type + (pm.won ? ':W' : ':L');
      STATS_BY_TYPE[k] = (STATS_BY_TYPE[k] ?? 0) + 1;
      if (process.env.JL_MATCH) {
        const fs = pm.result.fighters.map((f) => `${f.name}(${f.species.slice(0, 5)} hp${f.hpMax} ${f.weapon ?? '-'} ${f.armor ?? '-'})`);
        console.log(`   M w${state.world.week} ${t.name} ${pm.won ? 'WON' : 'lost'} ${pm.result.decidedBy}: ${fs.join(' vs ')}`);
      }
      if (t.status === 'bonus') continueBonus(state, t, false);
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
        if (process.env.JL_TRACE2 && weeks > Number(process.env.JL_FROM ?? 30)) { const rep = state.results.find((r) => r.kind === 'report'); if (rep && rep.kind === 'report') console.log(`  W${state.world.week}: ` + rep.entries.map((e) => `${e.text}${e.amount !== undefined ? ' (' + e.amount + ')' : ''}`).join(' | ')); for (const r of state.results) if (r.kind !== 'report') console.log('   card', JSON.stringify(r).slice(0, 200)); }
        if (process.env.JL_RIVALS && weeks % 10 === 0) console.log(`  R w${state.world.week} ` + state.rivals.map((r) => `${r.name.replace('House ', '')}:${r.denarii}d/${r.keepers.miners + r.keepers.showmen + r.keepers.wardens + r.keepers.spies}k/${r.creatures.length}c/${r.armory.length}g`).join(' '));
        if (process.env.JL_TRACE && weeks % 5 === 0) console.log(`  w${state.world.week} d=${state.player.ludus.denarii} inf=${state.player.ludus.influence} keepers=${JSON.stringify(state.player.ludus.keepers)} dinos=${state.player.ludus.creatures.length} proj=${state.player.ludus.projected}`);
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
      console.log('   by type', JSON.stringify(STATS_BY_TYPE));
      for (const k of Object.keys(STATS_BY_TYPE)) delete STATS_BY_TYPE[k];
      expect(weeks).toBeGreaterThan(20);
    }, 120_000);
  }
});
