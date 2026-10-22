// Real-engine integration run for the meta layer: an Ascension-16 game with a reincarnated champion, every god
// level stacking, stories answered by a simple bot. Catches crashes and broken invariants across modules.
import { describe, it, expect } from 'vitest';
import type { GameState } from '../src/engine/types';
import { STATS } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { beginAdvance, completeWeek } from '../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus } from '../src/engine/tournaments';
import { resolveDecision } from '../src/engine/events';
import { activeConversation, answerConversation } from '../src/engine/stories';
import { resolveDefense } from '../src/engine/intrigue';
import { pendingAdventures, resolveAdventure } from '../src/engine/adventures';
import { syncAscensionMeta } from '../src/engine/ascension';
import { makeNamed, addTrait } from '../src/engine/creature';
import { deserialize, serialize } from '../src/engine/save';

function bot(state: GameState): void {
  for (const d of [...state.player.decisions]) {
    const opt = d.options.findIndex((o) => !o.disabled);
    resolveDecision(state, d.id, Math.max(0, opt));
  }
  for (let i = 0; i < 6; i++) {
    const c = activeConversation(state);
    if (!c) break;
    const opt = c.options.findIndex((o) => !o.disabled);
    answerConversation(state, c.id, Math.max(0, opt));
  }
  for (const d of [...state.player.defenses]) resolveDefense(state, d.id, 'passive');
  for (const a of pendingAdventures(state)) resolveAdventure(state, a.adventure.id, 0);
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

describe('ascension 16 run', () => {
  it('stacks every god level and reincarnates the champion without crashing', () => {
    const meta = emptyMeta();
    const champ = makeNamed('tyrannosaurus', 'Victor', { str: 25, agi: 12, cun: 10, hp: 90 }, { level: 20, eqAge: 26, traits: ['Strong', 'Tough'] });
    champ.techniques.push({ id: 'Smash', rank: 4, equipped: true });
    addTrait(champ, 'Ascended');
    champ.reincarnation = 4;
    meta.ascension.normal = 16;
    meta.champions.normal = { creature: champ, difficulty: 'normal', level: 15, week: 120 };
    meta.upgrades.push('ascendedWeaponry', 'ascendancy');
    const state = createNewGame({
      lanista: 'Bot', female: false, heritage: 'roman', hard: false, nightmare: false, sandbox: false,
      raidsDisabled: true, betrayalsDisabled: true, ascension: 16, slot: 1, seed: 1616, reincarnation: 'young',
    }, meta);
    const me = state.player.ludus;
    const re = me.creatures.find((c) => c.traits.includes('Reincarnated'))!;
    expect(re).toBeTruthy();
    expect(re.name).toBe('Victor');
    expect(re.reincarnation).toBe(4 + 5);
    expect(me.armory.some((g) => g.augment === 'BrokenTimeWarp')).toBe(true);
    // start effects of every level
    expect(state.rivals.some((r) => r.creatures.some((c) => c.legend === 'harambe'))).toBe(true);
    expect(state.rivals.some((r) => r.creatures.some((c) => c.legend === 'sagittarius'))).toBe(true);
    expect(state.rivals.some((r) => r.creatures.some((c) => c.legend === 'icarus'))).toBe(true);

    const seen = new Set<string>();
    let weeks = 0;
    for (; weeks < 70 && !state.over; weeks++) {
      for (const c of [...state.rivals.flatMap((r) => r.creatures), ...state.world.horde.rogues]) if (c.legend) seen.add(c.legend);
      me.denarii = Math.max(me.denarii, 3000); // keep the bot solvent so the timed effects get exercised
      bot(state);
      playWeek(state);
      syncAscensionMeta(state, meta);
      expect(Number.isFinite(me.denarii)).toBe(true);
      for (const c of [...me.creatures, ...state.rivals.flatMap((r) => r.creatures), ...state.world.horde.rogues]) {
        for (const s of STATS) expect(Number.isFinite(c.genes.wild[s])).toBe(true);
        expect(Number.isFinite(c.xp)).toBe(true);
      }
      if (weeks % 30 === 29) expect(deserialize(serialize(state)).world.week).toBe(state.world.week);
    }
    expect(weeks).toBeGreaterThan(30);
    expect(state.rivals.some((r) => r.ai?.key === 'hannibal')).toBe(true);
    for (const k of ['cronus', 'perseus', 'ares', 'jove', 'podarge', 'aello', 'minotaur']) expect(seen.has(k)).toBe(true);
    if (state.world.week > 61) expect(seen.has('hephaestus')).toBe(true);
  }, 120_000);
});
