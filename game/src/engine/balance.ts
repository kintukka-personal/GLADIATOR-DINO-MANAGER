// Difficulty-scaled balance knobs (DESIGN §10). Gladiator Manager's raids, Horde growth and upkeep form death
// spirals its players and reviews call out: raids feed the Horde, the Horde outgrows any garrison, and level
// upkeep outruns the purse. Normal softens them so a careful newcomer survives and learns; Hard softens them
// less; Nightmare keeps most of GM's bite. "Classic rules" (difficulty.classic) restores GM's own numbers.
// Tuned against the competent-player sweep in tests/survival.test.ts. OWNER: integration.

import type { GameState } from './types';

export interface Balance {
  /** share of the keepers carried off in a raid who join the Horde as ferals (the rest scatter) */
  feralShare: number;
  /** weekly share of the ferals that drift back to the farms */
  feralDesertion: number;
  /** Senate legions: min weeks between interventions, army size that provokes one, chance per week */
  senateGap: number;
  senateArmy: number;
  senateChance: number;
  /** size of the band that raids the player, as a share of the Horde's army */
  raidArmyScale: number;
  /** no raids on the player before this week; then at least this many weeks between them */
  raidGrace: number;
  raidGap: number;
  /** most of the house's keepers / denarii one raid can take (shares) */
  raidKeeperCap: number;
  raidPlunderCap: number;
  /** rogue spawn intervals are multiplied by this (GM: 1) */
  rogueSpawnPeriod: number;
  /** Hard-mode rival boosts: a buffUp every N weeks, and the weekly chance of a free Epic dino after week 20 */
  rivalBuffEvery: number;
  rivalEpicChance: number;
  /** most of the house's keepers one bad event can take (abductions) */
  eventKeeperCap: number;
  /** Hard-mode bracket fillers (the default house): Epic dinos (GM) or normal ones, and their level bonus */
  fillerEpic: boolean;
  fillerLevelBonus: number;
  /** Hard-mode raids that break in take a dino with them (GM); otherwise they maul it */
  raidStealsCreatures: boolean;
  /** hiding with no dino at home ends the run (GM); otherwise only a house with no dinos and no keepers falls */
  raidEmptyHouseFalls: boolean;
  /** GM's level surcharge on creature upkeep ((L−2)×3, +(L−6)×5) is multiplied by this */
  upkeepSurchargeScale: number;
}

const NORMAL: Balance = {
  feralShare: 0.25, feralDesertion: 0.05, senateGap: 20, senateArmy: 35, senateChance: 0.5,
  raidArmyScale: 0.6, raidGrace: 24, raidGap: 8, raidKeeperCap: 0.25, raidPlunderCap: 0.4, rogueSpawnPeriod: 1.5,
  rivalBuffEvery: 0, rivalEpicChance: 0, eventKeeperCap: 0.25, fillerEpic: false, fillerLevelBonus: 2,
  raidStealsCreatures: false, raidEmptyHouseFalls: false, upkeepSurchargeScale: 0.5,
};
const HARD: Balance = {
  feralShare: 0.35, feralDesertion: 0.03, senateGap: 30, senateArmy: 45, senateChance: 0.4,
  raidArmyScale: 0.75, raidGrace: 16, raidGap: 7, raidKeeperCap: 0.3, raidPlunderCap: 0.5, rogueSpawnPeriod: 1.5,
  rivalBuffEvery: 2, rivalEpicChance: 0.15, eventKeeperCap: 0.3, fillerEpic: false, fillerLevelBonus: 3,
  raidStealsCreatures: false, raidEmptyHouseFalls: false, upkeepSurchargeScale: 0.6,
};
const NIGHTMARE: Balance = {
  feralShare: 0.6, feralDesertion: 0.01, senateGap: 50, senateArmy: 80, senateChance: 0.3,
  raidArmyScale: 0.9, raidGrace: 10, raidGap: 6, raidKeeperCap: 0.45, raidPlunderCap: 0.75, rogueSpawnPeriod: 1.25,
  rivalBuffEvery: 1, rivalEpicChance: 0.25, eventKeeperCap: 1, fillerEpic: true, fillerLevelBonus: 5,
  raidStealsCreatures: true, raidEmptyHouseFalls: false, upkeepSurchargeScale: 1,
};

/** Classic rules: Gladiator Manager's own numbers, unsoftened (normal and hard variants; Nightmare plays as hard). */
const CLASSIC_NORMAL: Balance = {
  feralShare: 1, feralDesertion: 0, senateGap: 40, senateArmy: 60, senateChance: 0.25,
  raidArmyScale: 1, raidGrace: 0, raidGap: 6, raidKeeperCap: 1, raidPlunderCap: 1, rogueSpawnPeriod: 1,
  rivalBuffEvery: 1, rivalEpicChance: 0.25, eventKeeperCap: 1, fillerEpic: true, fillerLevelBonus: 5,
  raidStealsCreatures: true, raidEmptyHouseFalls: true, upkeepSurchargeScale: 1,
};
const CLASSIC_HARD: Balance = { ...CLASSIC_NORMAL, senateGap: 70, senateArmy: 120, raidGap: 5 };

export function balance(state: GameState): Balance {
  const d = state.world.difficulty;
  if (d.classic) return d.hard ? CLASSIC_HARD : CLASSIC_NORMAL;
  return d.nightmare ? NIGHTMARE : d.hard ? HARD : NORMAL;
}

/** Keepers who actually join the Horde out of `lost` carried off (at least one when any are lost, on Nightmare all). */
export function feralRecruits(state: GameState, lost: number): number {
  if (lost <= 0) return 0;
  const share = balance(state).feralShare;
  return share >= 1 ? lost : Math.max(0, Math.round(lost * share));
}

/** Keepers a raid may take from a house that has `have` (at least one when it takes any). */
export function raidKeeperLimit(state: GameState, have: number): number {
  const cap = balance(state).raidKeeperCap;
  return cap >= 1 ? have : Math.min(have, Math.max(1, Math.ceil(have * cap)));
}

/** Denarii a raid may take from a house holding `cash`. */
export function raidPlunderLimit(state: GameState, cash: number): number {
  return Math.max(0, Math.floor(Math.max(0, cash) * balance(state).raidPlunderCap));
}

/** Keepers one bad event (an abduction) may take from a house that has `have`. */
export function eventKeeperLimit(state: GameState, have: number): number {
  const cap = balance(state).eventKeeperCap;
  return cap >= 1 ? have : Math.min(have, Math.max(1, Math.ceil(have * cap)));
}
