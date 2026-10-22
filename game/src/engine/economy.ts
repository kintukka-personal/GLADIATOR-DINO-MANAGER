// Ludus economy. OWNER: world-economy agent. GM 02 §9–10, 05 §3.1.
import type { GameState, KeeperJob, Ludus, WeekReportEntry } from './types';

export interface Ledger { total: number; lines: { label: string; amount: number }[] }

/** Security total S (GM Dominus.GetSecurityTotal). */
export function securityTotal(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
/** GM intrigue SDR of the security total. */
export function securityDR(S: number): number { throw new Error('not implemented'); }
/** GM betrayal (escape) SDR. */
export function betrayalDR(S: number): number { throw new Error('not implemented'); }
/** Committed spies = spiesLastWeek + 1 with a Guard Tower. */
export function committedSpies(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
/** Total keepers. */
export function keeperCount(h: Ludus): number { throw new Error('not implemented'); }
/** Weekly influence gain before multipliers is applied (entertainment + buildings + senator) and after (Roman +20% etc). */
export function influenceGain(state: GameState, h: Ludus): Ledger { throw new Error('not implemented'); }
export function weeklyIncome(state: GameState, h: Ludus): Ledger { throw new Error('not implemented'); }
/** Negative amounts. Includes keeper upkeep, creature upkeep (facility capacity, level surcharge), nursery/hatchery fuel. */
export function weeklyExpenses(state: GameState, h: Ludus): Ledger { throw new Error('not implemented'); }
/** Apply influence gain, income, expenses and the GM debt spiral (may defeat the house: 'debt'). Writes report lines for the player. */
export function economyWeek(state: GameState, h: Ludus): void { throw new Error('not implemented'); }
/** Add influence through the GM multipliers (Roman heritage +20%, Power Begets Power, Bacchus Patron, Senator). Negative values skip multipliers; floor 0. */
export function addInfluence(state: GameState, h: Ludus, amount: number): number { throw new Error('not implemented'); }
export function addDenarii(h: Ludus, amount: number): void { h.denarii += amount; }
/** Move keepers between jobs (player). Spies need Residence ≥ 2. */
export function assignKeepers(state: GameState, h: Ludus, job: KeeperJob, delta: number): boolean { throw new Error('not implemented'); }
/** Lose n keepers in GM order (unassigned → showmen → miners → wardens → spies) or from a specific job. With none: pay 100 each. */
export function loseKeepers(state: GameState, h: Ludus, n: number, job?: KeeperJob): number { throw new Error('not implemented'); }
export function addKeepers(h: Ludus, n: number, job?: KeeperJob): void { throw new Error('not implemented'); }
/** Buy n keepers from this week's market (price creep per purchase). */
export function hireKeepers(state: GameState, n: number): string | null { throw new Error('not implemented'); }
/** Entertainment total E. */
export function entertainment(h: Ludus): number { throw new Error('not implemented'); }
export function projectedBalance(state: GameState, h: Ludus): number { throw new Error('not implemented'); }
