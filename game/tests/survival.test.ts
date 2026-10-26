// Balance: a competent, cautious player (tests/bots/competent.ts) should survive most runs.
// JL_SWEEP=<seeds> runs a wide sweep and prints the survival table; the default run checks a few seeds.
import { describe, it, expect } from 'vitest';
import type { GameState } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { competentBot, playBotWeek } from './bots/competent';
import { hordeSize, raidArmyVsPlayer } from '../src/engine/horde';
import { securityTotal } from '../src/engine/economy';

export interface RunResult { seed: number; weeks: number; over?: string; denarii: number; influence: number; creatures: number; wins: number; battles: number }

export function runCompetent(seed: number, diff: 'normal' | 'hard' | 'nightmare', maxWeeks: number, trace = false): RunResult {
  const state: GameState = createNewGame({
    lanista: 'Bot', female: false, heritage: 'roman', hard: diff !== 'normal', nightmare: diff === 'nightmare', sandbox: false,
    raidsDisabled: false, betrayalsDisabled: false, classic: !!process.env.JL_CLASSIC, ascension: 0, slot: 1, seed,
  }, emptyMeta());
  let weeks = 0;
  for (; weeks < maxWeeks && !state.over; weeks++) {
    competentBot(state);
    playBotWeek(state);
    if (trace && process.env.JL_GREP) {
      const re = new RegExp(process.env.JL_GREP, 'i');
      const lines = state.results.flatMap((r) => (r.kind === 'report' ? r.entries.map((e) => `${e.text}${e.amount !== undefined ? ` (${e.amount})` : ''}`) : [r.kind === 'story' || r.kind === 'escape' ? JSON.stringify(r).slice(0, 160) : '']))
        .concat(state.player.messages.filter((m) => m.week === state.world.week - 1).map((m) => `MSG ${m.title}: ${m.text.slice(0, 140)}`))
        .filter((t) => t && re.test(t));
      if (lines.length) console.log(`   W${state.world.week - 1}: ${lines.join(' | ')}`);
    }
    if (trace && weeks % 5 === 0) {
      const h = state.player.ludus;
      console.log(`  w${state.world.week} d=${h.denarii} inf=${h.influence} k=${h.keepers.miners}/${h.keepers.wardens}/${h.keepers.showmen} dinos=${h.creatures.length} lv=${h.creatures.map((c) => c.level).join(',')} wins=${state.runStats.wins}/${state.runStats.battles} horde=${hordeSize(state)} army=${raidArmyVsPlayer(state)} S=${securityTotal(state, h)} ferals=${state.world.horde.ferals} rogues=${state.world.horde.rogues.length}`);
    }
  }
  const h = state.player.ludus;
  return { seed, weeks, over: state.over?.reason, denarii: h.denarii, influence: h.influence, creatures: h.creatures.length, wins: state.runStats.wins, battles: state.runStats.battles };
}

const SWEEP = Number(process.env.JL_SWEEP ?? 0);

describe('survival', () => {
  if (SWEEP > 0) {
    for (const diff of ['normal', 'hard', 'nightmare'] as const) {
      it(`sweep ${diff}`, () => {
        const weeks = Number(process.env.JL_WEEKS ?? 120);
        const rs = Array.from({ length: SWEEP }, (_, i) => runCompetent(1000 + i * 7919, diff, weeks, process.env.JL_TRACE === String(1000 + i * 7919)));
        const alive = rs.filter((r) => !r.over).length;
        const causes: Record<string, number> = {};
        for (const r of rs) if (r.over) causes[r.over] = (causes[r.over] ?? 0) + 1;
        const deaths = rs.filter((r) => r.over).map((r) => r.weeks).sort((a, b) => a - b);
        const winRate = rs.reduce((s, r) => s + r.wins, 0) / Math.max(1, rs.reduce((s, r) => s + r.battles, 0));
        console.log(`[${diff}] survived ${weeks}w: ${alive}/${rs.length}  causes=${JSON.stringify(causes)}  death weeks=${deaths.join(',')}  ` +
          `win rate=${(winRate * 100).toFixed(0)}%  median influence=${rs.map((r) => r.influence).sort((a, b) => a - b)[Math.floor(rs.length / 2)]}`);
        if (process.env.JL_LIST) for (const r of rs) console.log('   ', JSON.stringify(r));
      }, 600000);
    }
  } else {
    // sweep result when tuned (20 seeds, tests/bots/competent.ts): Normal 20/20 survive 200 weeks, Hard 10/20,
    // Nightmare 2/20 survive 120 weeks
    it('a competent player survives two years on Normal', () => {
      const rs = [11, 22, 33, 44, 55, 66].map((s) => runCompetent(s, 'normal', 104));
      expect(rs.filter((r) => !r.over).length).toBeGreaterThanOrEqual(5);
    }, 120000);
    it('a competent player usually gets through the first year and a half on Hard', () => {
      const rs = [11, 22, 33, 44].map((s) => runCompetent(s, 'hard', 78));
      expect(rs.filter((r) => !r.over).length).toBeGreaterThanOrEqual(2);
    }, 120000);
  }
});
