// Account records written by the UI (the engine has no hook for them): the game-over highscore and run
// stats, and the Hall of Fame induction every 10th week. Both are idempotent through flags on the run.

import type { Creature, DifficultyKey, GameState, Gear, HallOfFameEntry, Meta } from '../engine/types';
import { saveMeta } from '../engine/save';

const SCORE_MULT: Record<DifficultyKey, number> = { normal: 1, hard: 1.5, nightmare: 3 };
const HOF_MAX = 30;
const SCORES_MAX = 50;

export function difficultyOf(g: GameState): DifficultyKey {
  const d = g.world.difficulty;
  return d.nightmare ? 'nightmare' : d.hard ? 'hard' : 'normal';
}

/** GM highscore: influence × 1 / 1.5 / 3 by difficulty. */
export function runScore(g: GameState, influence = g.player.ludus.influence): number {
  return Math.round(influence * SCORE_MULT[difficultyOf(g)]);
}

function deepCopy<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/**
 * Record a fallen run once: highscore (sandbox runs never score) and meta.stats. Returns true when it wrote.
 * Call inside store.act so the run's flag is saved with it; the store's persist saves the meta too.
 */
export function recordGameOver(g: GameState, meta: Meta): boolean {
  if (!g.over || g.world.flags.uiRunRecorded) return false;
  g.world.flags.uiRunRecorded = 1;
  const { reason, week, influence } = g.over;
  meta.stats.runs += 1;
  meta.stats.bestWeek = Math.max(meta.stats.bestWeek, week);
  meta.stats.bestInfluence = Math.max(meta.stats.bestInfluence, influence, g.runStats?.peakInfluence ?? 0);
  if (!g.world.difficulty.sandbox) {
    meta.highscores.push({
      name: g.player.lanista, score: runScore(g, influence), influence, week, difficulty: difficultyOf(g), alive: false, reason,
      ascension: g.world.ascension,
    });
    meta.highscores.sort((a, b) => b.score - a.score);
    if (meta.highscores.length > SCORES_MAX) meta.highscores.length = SCORES_MAX;
  }
  saveMeta(meta);
  return true;
}

/** The player's most famous fighter (adult dinos and beasts; mythic beasts too). */
export function mostFamous(g: GameState): Creature | undefined {
  return [...g.player.ludus.creatures].filter((c) => c.maturity >= 1).sort((a, b) => b.fame - a.fame || b.level - a.level)[0];
}

/**
 * Every 10th week the most famous creature is inducted (or updated) in the Hall of Fame; the hall keeps the
 * 30 most famous. `week` is the week just played. Returns the entry when one was written.
 */
export function inductHallOfFame(g: GameState, meta: Meta, week: number): HallOfFameEntry | null {
  if (week <= 0 || week % 10 !== 0 || g.world.difficulty.sandbox) return null;
  const key = `uiHof:${week}`;
  if (g.world.flags[key]) return null;
  g.world.flags[key] = 1;
  const c = mostFamous(g);
  if (!c || c.fame <= 0) return null;
  const me = g.player.ludus;
  const gear: Gear[] = Object.values(c.gear)
    .map((id) => me.armory.find((x) => x.id === id))
    .filter((x): x is Gear => !!x)
    .map(deepCopy);
  const entry: HallOfFameEntry = {
    id: c.id, name: c.name, species: c.species, level: c.level, fame: c.fame, week, lanista: g.player.lanista,
    ascension: g.world.ascension, difficulty: difficultyOf(g), creature: deepCopy(c), gear, tier: me.championTier ?? 0,
  };
  const i = meta.hallOfFame.findIndex((h) => h.id === c.id);
  if (i >= 0) meta.hallOfFame[i] = entry;
  else meta.hallOfFame.push(entry);
  meta.hallOfFame.sort((a, b) => b.fame - a.fame);
  if (meta.hallOfFame.length > HOF_MAX) meta.hallOfFame.length = HOF_MAX;
  saveMeta(meta);
  return meta.hallOfFame.includes(entry) ? entry : null;
}
