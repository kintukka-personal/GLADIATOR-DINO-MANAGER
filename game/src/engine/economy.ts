// Ludus economy. OWNER: world-economy agent. GM 02 §9–10, 05 §3.1.
//
// Weekly order (GM Dominus.AppendWeekCascading): unassigned keepers → wardens, influence gain, income,
// expenses, debt spiral. Hatchery fuel and hatchling food are charged by breeding.ts, the loan and Bribe
// General toggles live in `projected` (influence module), so neither is counted here.
import type { Creature, GameState, KeeperJob, Ludus, WeekReportEntry } from './types';
import { chance } from './rng';
import { hasUpgrade, report, message, isPlayerHouse } from './util';
import { isKid } from './creature';
import { buildingTotals } from './buildings';
import { hasOpp, publicSessionsIncome } from './influence';
import { joinHorde } from './horde';
import { objectiveEvent } from './objectives';
import { removeFromHouse } from './care';

export interface Ledger { total: number; lines: { label: string; amount: number }[] }

const ledger = (lines: { label: string; amount: number }[]): Ledger => ({
  total: lines.reduce((s, l) => s + l.amount, 0),
  lines: lines.filter((l) => l.amount !== 0),
});

// ---------------------------------------------------------------------------
// Security, spies, keepers
// ---------------------------------------------------------------------------

/** Security total S (GM Dominus.GetSecurityTotal). Public Sessions / Consul adjust `securityPenalties`. */
export function securityTotal(state: GameState, h: Ludus): number {
  return Math.max(0, h.keepers.wardens - h.securityPenalties + buildingTotals(h).security);
}

/** GM intrigue SDR of the security total. */
export function securityDR(S: number): number {
  S = Math.max(0, Math.floor(S));
  if (S < 4) return S;
  if (S < 12) return Math.trunc(S / 2) + 4 + Math.trunc(S / 4);
  if (S < 24) return Math.trunc(S / 2) + 8;
  if (S < 40) return Math.trunc(S / 3) + 12;
  if (S < 65) return Math.trunc(S / 4) + 16;
  if (S < 100) return Math.trunc(S / 6) + 24;
  return Math.trunc(S / 10) + 38;
}

/** GM betrayal (escape) SDR. */
export function betrayalDR(S: number): number {
  S = Math.max(0, Math.floor(S));
  if (S < 5) return S;
  if (S < 10) return Math.trunc(S / 2) + 3;
  if (S < 30) return Math.trunc(S / 3) + 5;
  if (S < 50) return Math.trunc(S / 4) + 8;
  if (S < 100) return Math.trunc(S / 6) + 15;
  return Math.trunc(S / 10) + 25;
}

/** Committed spies = spiesLastWeek + 1 with a Guard Tower. */
export function committedSpies(state: GameState, h: Ludus): number {
  return h.spiesLastWeek + ((h.buildings.guardTower ?? 0) >= 1 ? 1 : 0);
}

/** Total keepers. */
export function keeperCount(h: Ludus): number {
  const k = h.keepers;
  return k.unassigned + k.miners + k.showmen + k.wardens + k.spies;
}

/** Entertainment total E. */
export function entertainment(h: Ludus): number {
  return Math.max(0, h.keepers.showmen + h.entBonus);
}

/** GM entertainment influence: E ≤ 10 → E; ≤ 100 → E/2 + 8; above → E/4 + 48. */
export function entertainmentInfluence(E: number): number {
  if (E <= 10) return E;
  if (E <= 100) return Math.trunc(E / 2) + 8;
  return Math.trunc(E / 4) + 48;
}

// ---------------------------------------------------------------------------
// Influence
// ---------------------------------------------------------------------------

/** Positive-gain multipliers (GM influenceAfterChange). AI rivals count as Roman. */
export function influenceMultipliers(state: GameState, h: Ludus): { label: string; pct: number }[] {
  const out: { label: string; pct: number }[] = [];
  const player = isPlayerHouse(state, h);
  if (!player || state.player.heritage === 'roman') out.push({ label: 'Roman heritage', pct: 20 });
  if (player) {
    if (hasOpp(state, 'powerBegetsPower')) out.push({ label: 'Power Begets Power', pct: 25 });
    if (hasOpp(state, 'bacchusPatron')) out.push({ label: 'Bacchus Patron', pct: 15 });
    if (state.player.senator) out.push({ label: 'Senator', pct: 10 });
  }
  return out;
}

function influenceBaseLines(state: GameState, h: Ludus): { label: string; amount: number }[] {
  const lines = [
    { label: 'Showmen', amount: entertainmentInfluence(entertainment(h)) },
    { label: 'Estate', amount: buildingTotals(h).influence },
  ];
  // The AI's flat +1 influence (GM ResolveAIWeekCascading step 2) is paid by rivals.ts rivalWeek.
  if (isPlayerHouse(state, h) && state.player.senator) lines.push({ label: 'Senate seat', amount: 5 });
  return lines;
}

/** Weekly influence gain: entertainment + buildings + senator, then the multipliers. */
export function influenceGain(state: GameState, h: Ludus): Ledger {
  const lines = influenceBaseLines(state, h);
  const base = lines.reduce((s, l) => s + l.amount, 0);
  if (base > 0) for (const m of influenceMultipliers(state, h)) lines.push({ label: m.label, amount: Math.floor((base * m.pct) / 100) });
  return ledger(lines);
}

/** Add influence through the GM multipliers (Roman heritage +20%, Power Begets Power, Bacchus Patron, Senator). Negative values skip multipliers; floor 0. */
export function addInfluence(state: GameState, h: Ludus, amount: number): number {
  const before = h.influence;
  if (amount > 0) {
    let total = amount;
    for (const m of influenceMultipliers(state, h)) total += Math.floor((amount * m.pct) / 100);
    h.influence += total;
  } else if (amount < 0) {
    h.influence = Math.max(0, h.influence + amount);
  }
  return h.influence - before;
}

export function addDenarii(h: Ludus, amount: number): void { h.denarii += amount; }

// ---------------------------------------------------------------------------
// Income and expenses
// ---------------------------------------------------------------------------

/** Mining: miners × max(4, efficiency (10/12/15) + miningBonus). */
export function miningIncome(h: Ludus): number {
  const per = Math.max(4, buildingTotals(h).mineEfficiency + Math.max(-9, h.miningBonus));
  return h.keepers.miners * per;
}

/** Paid trainers in effect this week (the Weapons master needs the upgrade for the player). */
export function paidTrainers(state: GameState, h: Ludus): { bestiarii: boolean; spartan: boolean; weapons: boolean } {
  const p = h.training.paid;
  const weaponsOk = !isPlayerHouse(state, h) || hasUpgrade(state, 'weaponsMaster');
  return { bestiarii: !!p.bestiarii, spartan: !!p.spartan, weapons: !!p.weapons && weaponsOk };
}

export const TRAINER_COST = { bestiarii: 25, spartan: 35, weapons: 50 } as const;

/** Creatures that occupy training facilities, in roster order (babies live in the nursery; loans are fed elsewhere). */
export function facilityUsers(h: Ludus): Creature[] {
  return h.creatures.filter((c) => c.maturity >= 0.1 && c.away?.kind !== 'loan');
}

/** Is this creature within the training facility capacity (base 3 + Training Field + Rome Mansion)? */
export function withinFacilities(h: Ludus, c: Creature): boolean {
  const idx = facilityUsers(h).indexOf(c);
  return idx >= 0 && idx < buildingTotals(h).facilities;
}

/** GM level surcharge on creature upkeep: (L−2)×3 above level 2 (kids pay L−2), +(L−6)×5 above level 6. */
export function levelSurcharge(c: Creature): number {
  const L = c.level;
  let s = 0;
  if (L > 2) s += isKid(c) ? L - 2 : (L - 2) * 3;
  if (L > 6) s += (L - 6) * 5;
  return s;
}

/** Weekly upkeep of one creature given whether it fits the facilities. Babies cost 1. */
export function creatureUpkeepOf(c: Creature, withinCapacity: boolean): number {
  if (c.away?.kind === 'loan') return 0;
  if (c.maturity < 0.1) return 1;
  return (withinCapacity ? 5 : 10) + levelSurcharge(c);
}

export function creatureUpkeep(h: Ludus): number {
  const cap = buildingTotals(h).facilities;
  let used = 0;
  let total = 0;
  for (const c of h.creatures) {
    if (c.away?.kind === 'loan') continue;
    if (c.maturity < 0.1) { total += 1; continue; }
    total += creatureUpkeepOf(c, used < cap);
    used++;
  }
  return total;
}

/** Keepers: 2 each within beds, 4 beyond (6 when the house owns more than 1000). */
export function keeperUpkeep(h: Ludus): number {
  const K = keeperCount(h);
  const beds = buildingTotals(h).beds;
  const within = Math.min(K, beds);
  const beyond = Math.max(0, K - beds);
  return within * 2 + beyond * (K > 1000 ? 6 : 4);
}

export function weeklyIncome(state: GameState, h: Ludus): Ledger {
  const player = isPlayerHouse(state, h);
  const estate = buildingTotals(h).denarii;
  const lines = [
    { label: 'Mining', amount: miningIncome(h) },
    { label: 'Standing income', amount: Math.max(0, h.projected) },
    { label: 'Estate', amount: Math.max(0, estate) },
  ];
  if (h.armory.some((g) => g.type === 'loadedDice')) lines.push({ label: 'Loaded dice', amount: h.keepers.showmen });
  // AI rivals' free "commoner tourists" income (same formula) is paid by rivals.ts rivalWeek.
  if (player) {
    if (state.player.senator) lines.push({ label: 'Senate stipend', amount: 50 });
    if (state.player.toggles.publicSessions) lines.push({ label: 'Public training sessions', amount: Math.max(0, publicSessionsIncome(state, h)) });
  }
  return ledger(lines);
}

/** Negative amounts. Keeper upkeep, creature upkeep (facility capacity, level surcharge), paid trainers, negative
 *  projected and estate upkeep. Hatchery fuel and hatchling food are charged by breeding.ts, not here. */
export function weeklyExpenses(state: GameState, h: Ludus): Ledger {
  const t = paidTrainers(state, h);
  const trainers = (t.bestiarii ? TRAINER_COST.bestiarii : 0) + (t.spartan ? TRAINER_COST.spartan : 0) + (t.weapons ? TRAINER_COST.weapons : 0);
  const estate = buildingTotals(h).denarii;
  return ledger([
    { label: 'Keeper upkeep', amount: -keeperUpkeep(h) },
    { label: 'Dino upkeep', amount: -creatureUpkeep(h) },
    { label: 'Paid trainers', amount: -trainers },
    { label: 'Standing costs', amount: Math.min(0, h.projected) },
    { label: 'Estate upkeep', amount: Math.min(0, estate) },
  ]);
}

export function projectedBalance(state: GameState, h: Ludus): number {
  return h.denarii + weeklyIncome(state, h).total + weeklyExpenses(state, h).total;
}

/** Net weekly change in denarii (income + expenses). */
export function weeklyNet(state: GameState, h: Ludus): number {
  return weeklyIncome(state, h).total + weeklyExpenses(state, h).total;
}

// ---------------------------------------------------------------------------
// Weekly step
// ---------------------------------------------------------------------------

/** Apply influence gain, income, expenses and the GM debt spiral (may defeat the house: 'debt'). Writes report lines for the player. */
export function economyWeek(state: GameState, h: Ludus): void {
  if (h.defeated) return;
  const player = isPlayerHouse(state, h);
  // GM: unassigned keepers go to security at the week's end
  if (h.keepers.unassigned > 0) {
    h.keepers.wardens += h.keepers.unassigned;
    h.keepers.unassigned = 0;
  }
  // influence
  const base = influenceBaseLines(state, h).reduce((s, l) => s + l.amount, 0);
  const gained = addInfluence(state, h, base);
  if (player && gained) report(state, gained > 0 ? 'good' : 'bad', 'Influence this week', gained);
  // denarii
  const inc = weeklyIncome(state, h);
  const exp = weeklyExpenses(state, h);
  h.denarii += inc.total;
  h.denarii += exp.total;
  if (player) {
    for (const l of inc.lines) report(state, 'income', l.label, l.amount);
    for (const l of exp.lines) report(state, 'expense', l.label, l.amount);
  }
  debtWeek(state, h, keeperUpkeep(h) + creatureUpkeep(h));
}

function debtNote(state: GameState, h: Ludus, kind: WeekReportEntry['kind'], text: string, amount?: number): void {
  if (isPlayerHouse(state, h)) report(state, kind, text, amount);
}

/** GM 02 §10.2 / 03 §1.2 debt handling, applied after income and expenses. */
function debtWeek(state: GameState, h: Ludus, upkeep: number): void {
  if (h.denarii >= 0) {
    h.bankruptLastWeek = false;
    return;
  }
  const player = isPlayerHouse(state, h);
  addInfluence(state, h, -1);
  if (h.denarii > -6) {
    h.projected -= 1;
    h.denarii += 5;
    debtNote(state, h, 'warning', 'In the red: a moneylender advanced 5 denarii (−1 a week, for good)', 5);
  } else if (h.denarii > -11) {
    h.projected -= 3;
    h.denarii += 10;
    debtNote(state, h, 'warning', 'In the red: a moneylender advanced 10 denarii (−3 a week, for good)', 10);
  } else {
    h.projected -= 2;
    const refund = Math.floor(upkeep / 2);
    h.denarii += refund;
    h.unpaidThisWeek = true;
    addInfluence(state, h, -5);
    debtNote(state, h, 'bad', 'Wages unpaid: living expenses cut, the keepers grumble and the dinos sulk (−10 tameness)', refund);
    if (h.miningBonus > 0) {
      h.miningBonus -= 1;
      h.denarii += 20;
      debtNote(state, h, 'bad', 'Sold a share of the mine', 20);
    } else {
      h.projected -= 3;
      h.denarii += 10;
      debtNote(state, h, 'bad', 'Borrowed against next month (−3 a week, for good)', 10);
    }
  }
  if (h.denarii < -200) {
    addInfluence(state, h, -2);
    h.projected -= 2;
  }
  if (h.denarii < 0) {
    addInfluence(state, h, -2);
    h.projected -= 5;
    if (h.bankruptLastWeek) {
      if (keeperCount(h) === 0) {
        defeatByDebt(state, h);
      } else {
        h.projected -= 15;
        h.miningBonus = Math.max(-9, h.miningBonus - 1);
        loseKeepers(state, h, 1);
        h.denarii += 50;
        debtNote(state, h, 'bad', 'Creditors seized a keeper and sold him', 50);
        if (h.denarii < 0) defeatByDebt(state, h);
      }
    } else if (player) {
      message(state, 'assistant', 'Bankrupt', 'The ludus is bankrupt. If the books are still red next week, the creditors will take everything.');
    }
    h.bankruptLastWeek = true;
  } else {
    h.bankruptLastWeek = false;
  }
  if (h.denarii < -100000) h.denarii = 0;
}

function defeatByDebt(state: GameState, h: Ludus): void {
  h.defeated = 'debt';
  for (const c of [...h.creatures]) {
    c.gear = {};
    joinHorde(state, c, h);
    removeFromHouse(state, h, c);
  }
  debtNote(state, h, 'bad', 'Debt pile-up: the creditors closed the ludus. Its dinos fled to the Wild Horde.');
}

// ---------------------------------------------------------------------------
// Keepers
// ---------------------------------------------------------------------------

/** Move keepers between jobs (player). Spies need Residence ≥ 2. Negative delta returns them to `from` (default unassigned). */
export function assignKeepers(state: GameState, h: Ludus, job: KeeperJob, delta: number, from: KeeperJob = 'unassigned'): boolean {
  delta = Math.trunc(delta);
  if (delta === 0 || job === from) return false;
  if (job === 'spies' && delta > 0 && !buildingTotals(h).spiesUnlocked) return false;
  if (delta > 0) {
    if (h.keepers[from] < delta) return false;
    h.keepers[from] -= delta;
    h.keepers[job] += delta;
  } else {
    if (h.keepers[job] < -delta) return false;
    h.keepers[job] += delta;
    h.keepers[from] -= delta;
  }
  if (isPlayerHouse(state, h) && delta > 0) objectiveEvent(state, 'assigned:' + job);
  return true;
}

const LOSS_ORDER: KeeperJob[] = ['unassigned', 'showmen', 'miners', 'wardens', 'spies'];

/** Lose n keepers in GM order (unassigned → showmen → miners → wardens → spies) or from a specific job. With none: pay 100 each. */
export function loseKeepers(state: GameState, h: Ludus, n: number, job?: KeeperJob): number {
  let lost = 0;
  for (let i = 0; i < n; i++) {
    const from: KeeperJob | undefined = job && h.keepers[job] > 0 ? job : LOSS_ORDER.find((j) => h.keepers[j] > 0);
    if (!from) {
      h.denarii -= 100;
      continue;
    }
    h.keepers[from]--;
    lost++;
  }
  return lost;
}

export function addKeepers(h: Ludus, n: number, job?: KeeperJob): void {
  if (n <= 0) return;
  h.keepers[job ?? 'unassigned'] += n;
}

/** Buy n keepers from this week's market (price creep per purchase). */
export function hireKeepers(state: GameState, n: number): string | null {
  const m = state.world.market.keepers;
  const h = state.player.ludus;
  n = Math.trunc(n);
  if (n <= 0) return 'Hire at least one keeper.';
  if (m.count <= 0) return 'No keepers for hire this week.';
  if (n > m.count) return `Only ${m.count} keeper${m.count === 1 ? ' is' : 's are'} for hire this week.`;
  if (h.denarii < m.price) return `A keeper costs ${m.price} denarii.`;
  let hired = 0;
  for (let i = 0; i < n; i++) {
    if (h.denarii < m.price) break;
    h.denarii -= m.price;
    m.count--;
    h.keepers.unassigned++;
    hired++;
    if (chance(0.5)) m.price += 20;
    if (state.world.difficulty.hard && chance(0.5)) m.price += 10;
    if (state.world.difficulty.nightmare && chance(0.5)) m.price += 10;
  }
  objectiveEvent(state, 'hired');
  return hired < n ? `Hired ${hired} keeper${hired === 1 ? '' : 's'} before the purse ran dry.` : null;
}
