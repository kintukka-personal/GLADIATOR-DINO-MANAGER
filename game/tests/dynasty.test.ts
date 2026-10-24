// Integration: a breeder plays a real game through the weekly loop and raises several generations.
// Exercises pairing, laying, gestation, incubation, the nursery, imprinting, mutations and the ancestry registry
// alongside every other weekly system.
import { describe, it, expect } from 'vitest';
import type { GameState, Creature } from '../src/engine/types';
import { STATS } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { beginAdvance, completeWeek } from '../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus } from '../src/engine/tournaments';
import { build, canBuild } from '../src/engine/buildings';
import { buyFood } from '../src/engine/market';
import { resolveDecision } from '../src/engine/events';
import { activeConversation, answerConversation } from '../src/engine/stories';
import { resolveDefense } from '../src/engine/intrigue';
import { pendingAdventures, resolveAdventure } from '../src/engine/adventures';
import { assignPair, breedingIssue, fulfillImprint, pairCapacity, pedigree, removePair, totalMutations } from '../src/engine/breeding';
import { assignKeepers, hireKeepers, keeperCount as totalKeepers } from '../src/engine/economy';
import { generateBeast, generateDino, isAdult } from '../src/engine/creature';
import { serialize, deserialize } from '../src/engine/save';

function answerAll(state: GameState): void {
  for (const d of [...state.player.decisions]) {
    const opt = d.options.findIndex((o) => !o.disabled);
    resolveDecision(state, d.id, d.key === 'rebelRaid' ? (d.options[1] && !d.options[1].disabled ? 1 : 2) : Math.max(0, opt));
  }
  for (let i = 0; i < 5; i++) {
    const c = activeConversation(state);
    if (!c) break;
    answerConversation(state, c.id, Math.max(0, c.options.findIndex((o) => !o.disabled)));
  }
  for (const d of [...state.player.defenses]) resolveDefense(state, d.id, 'passive');
  for (const a of pendingAdventures(state)) resolveAdventure(state, a.adventure.id, 0);
}

function breeder(state: GameState): void {
  const h = state.player.ludus;
  answerAll(state);
  for (const b of ['breedingPen', 'hatchery', 'nursery', 'kitchen', 'residence', 'breedingPen', 'nursery', 'hatchery'] as const) {
    if (canBuild(state, h, b).ok) { build(state, h, b); break; }
  }
  // keep the pantry stocked for the nursery and care requests
  for (const f of ['rawMeat', 'kibble_simple', 'kibble_regular'] as const) {
    if ((h.pantry[f] ?? 0) < 6 && h.denarii > 400) buyFood(state, f, 6);
  }
  // keepers for the building requirements
  if (totalKeepers(h) < 22 && state.world.market.keepers.count > 0 && !hireKeepers(state, 1)) assignKeepers(state, h, 'miners', 1);
  // pair the youngest generation of each line (lines advance), spread across species, within pen capacity
  const ready = (c: Creature) => isAdult(c) && !breedingIssue(c);
  const byGen = (a: Creature, b: Creature) => b.genes.generation - a.genes.generation;
  const wanted: { m: Creature; f: Creature }[] = [];
  for (const sp of [...new Set(h.creatures.map((c) => c.species))]) {
    const fs = h.creatures.filter((c) => c.species === sp && c.sex === 'F' && (ready(c) || c.pregnancy)).sort(byGen);
    const ms = h.creatures.filter((c) => c.species === sp && c.sex === 'M' && ready(c)).sort(byGen);
    if (fs[0] && ms[0]) wanted.push({ m: ms[0], f: fs[0] });
  }
  wanted.splice(pairCapacity(h));
  const same = wanted.length === h.pairs.length && wanted.every((w) => h.pairs.some((p) => p.femaleId === w.f.id && p.maleId === w.m.id));
  if (!same) {
    for (const p of [...h.pairs]) removePair(state, p.femaleId);
    for (const w of wanted) assignPair(state, w.m.id, w.f.id);
  }
  // answer every care request
  for (const c of h.creatures) {
    const r = c.imprintRequest;
    if (!r || r.done) continue;
    if (r.kind === 'feed' && r.food && (h.pantry[r.food] ?? 0) <= 0) buyFood(state, r.food, 2);
    const err = fulfillImprint(state, c.id);
    if (err && process.env.JL_DYN) console.log(`  care failed W${state.world.week}: ${err}`);
  }
}

function playWeek(state: GameState): void {
  beginAdvance(state);
  const t = attendedTournament(state);
  if (t) {
    for (let guard = 0; guard < 40; guard++) {
      if (!nextPlayerMatch(state, t)) break;
      playMatch(state, t, {});
      if (t.status === 'bonus') continueBonus(state, t, false);
    }
  }
  completeWeek(state);
}

describe('dynasty', () => {
  it('raises generations of raptors and dire wolves through the full weekly loop', () => {
    const state = createNewGame({
      lanista: 'Breeder', female: true, heritage: 'roman', hard: false, nightmare: false, sandbox: true,
      raidsDisabled: true, betrayalsDisabled: true, ascension: 0, slot: 1, seed: 777,
    }, emptyMeta());
    const h = state.player.ludus;
    h.denarii += 20000;
    h.creatures.push(
      generateDino({ species: 'velociraptor', sex: 'M', eqAge: 20, week: 1 }),
      generateDino({ species: 'velociraptor', sex: 'M', eqAge: 20, week: 1 }),
      generateDino({ species: 'velociraptor', sex: 'F', eqAge: 20, week: 1 }),
      generateBeast('direwolf', { sex: 'M', variant: 'random' }),
      generateBeast('direwolf', { sex: 'F', variant: 'random' }),
    );

    const homeBred = new Set<string>();
    let weeks = 0;
    for (; weeks < 90 && !state.over; weeks++) {
      h.denarii = Math.max(h.denarii, 3000); // a breeder's patron: this test is about the bloodline, not the books
      breeder(state);
      playWeek(state);
      for (const r of state.results) if (r.kind === 'hatch') for (const id of r.ids ?? []) homeBred.add(id);
      if (process.env.JL_DYN) {
        const lines = state.results.flatMap((r) => (r.kind === 'report' ? r.entries.map((e) => e.text) : []))
          .filter((t) => /egg|laid|hatch|pregnan|born|mated|grown|died/i.test(t));
        console.log(`W${state.world.week} T=${state.world.temperature} pairs=${h.pairs.length}/${pairCapacity(h)} eggs=${h.eggs.length} ` + lines.join(' | '));
      }
      for (const c of h.creatures) {
        expect(c.maturity).toBeGreaterThanOrEqual(0);
        expect(c.maturity).toBeLessThanOrEqual(1);
        expect(c.genes.imprint).toBeGreaterThanOrEqual(0);
        expect(c.genes.imprint).toBeLessThanOrEqual(1);
        for (const s of STATS) expect(Number.isFinite(c.genes.wild[s])).toBe(true);
        // counters are additive across parents (ARK), so inbred lines climb past 20; they stay whole numbers
        expect(Number.isInteger(totalMutations(c.genes))).toBe(true);
      }
      if (weeks === 45) {
        // the save round-trips mid-dynasty
        const copy = deserialize(serialize(state));
        expect(copy.player.ludus.creatures.length).toBe(h.creatures.length);
        expect(copy.player.ludus.eggs.length).toBe(h.eggs.length);
      }
    }

    expect(state.over).toBeFalsy();
    const bred = h.creatures.filter((c) => c.genes.bred);
    const maxGen = Math.max(0, ...h.creatures.map((c) => c.genes.generation));
    const grown = bred.filter((c) => c.maturity >= 1);
    const wolves = bred.filter((c) => c.species === 'direwolf');
    const raptors = bred.filter((c) => c.species === 'velociraptor');
    console.log(`[dynasty] weeks=${weeks} creatures=${h.creatures.length} bred=${bred.length} grown=${grown.length} ` +
      `maxGen=${maxGen} hatched=${state.runStats.hatched} mutations=${state.runStats.mutations} eggs=${h.eggs.length} ` +
      `raptors=${raptors.length} wolves=${wolves.length} ancestry=${Object.keys(state.ancestry).length}`);

    expect(state.runStats.hatched).toBeGreaterThan(5);
    expect(raptors.length).toBeGreaterThan(0);
    expect(wolves.length).toBeGreaterThan(0);
    expect(maxGen).toBeGreaterThanOrEqual(3);
    expect(grown.length).toBeGreaterThan(0);
    // every care request answered: our own grown offspring are fully imprinted (bought bred stock is not)
    const ours = grown.filter((c) => homeBred.has(c.id));
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((c) => c.genes.imprint > 0.95)).toBe(true);
    // a third-generation creature bred here has a pedigree reaching back to the founders
    const g3 = h.creatures.find((c) => c.genes.generation >= 3 && homeBred.has(c.id));
    expect(g3).toBeTruthy();
    const tree = pedigree(state, g3?.id, 3);
    expect(tree?.mother ?? tree?.father).toBeTruthy();
  });
});
