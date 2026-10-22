// Week resolution in Gladiator Manager's order (GM 03 §1.2–1.3: WeekResolver.ResolveWeek + World.AppendWeek),
// plus the breeding steps. OWNER: integration (main thread).
//
// Player flow:
//   beginAdvance()  → brackets built, attended tournament chosen (UI plays its matches)
//   completeWeek()  → remaining tournaments auto-resolve, then resolveWeek() fills state.results

import type { Creature, GameState, Ludus, ResultCard } from './types';
import { SPECIES } from './data/species';
import { chance, getSeed } from './rng';
import { activeRivals, message, report, asc, ASC, getIdCounter } from './util';
import { eqAge, hasTrait, addTrait } from './creature';
import { economyWeek } from './economy';
import { loyaltyWeek, resolveBreakouts, gearHappinessWeek } from './loyalty';
import { trainingWeek, chooseDoctore } from './training';
import { regenerateMarkets } from './market';
import { startTournaments, finishTournaments, seedWeekTournaments, leagueWeek } from './tournaments';
import { rivalWeek, helpRival, unknownWeek, cleanupRivals, rivalBids } from './rivals';
import { rivalSchemes } from './intrigue';
import { influenceWeek, electionWeek } from './influence';
import { hordeWeek, timelineWeek, expeditionWeek } from './horde';
import { drawWeeklyDecision, delayedWeek, expireDecisions } from './events';
import { storyWeek } from './stories';
import { adventureWeek } from './adventures';
import { checkObjectives } from './objectives';
import { checkAchievements } from './achievements';
import { ascensionTurnEffects } from './ascension';
import { breedingWeek, incubationWeek, nurseryWeek, aiBreedingWeek, rollTemperature, breedingReport } from './breeding';
import { loseKeepers } from './economy';

/** Age every creature of a house by one turn (GM: +1 week, +1 more 50%; always 2 for the player at Ascension ≥ 1). */
export function ageHouse(state: GameState, h: Ludus): void {
  for (const c of h.creatures) ageCreature(state, c, h.isPlayer && asc(state, ASC.saturn));
}

export function ageCreature(state: GameState, c: Creature, double: boolean): void {
  const n = double ? 2 : 1 + (chance(0.5) ? 1 : 0);
  c.ageWeeks += 1;
  if (c.maturity >= 1) c.adultWeeks += n;
}

/** Things every ludus does each week (GM Dominus.AppendWeekCascading). Returns breakout card for the player. */
export function houseWeek(state: GameState, h: Ludus): ResultCard | null {
  chooseDoctore(state, h);
  economyWeek(state, h);
  if (h.defeated) return null;
  ageHouse(state, h);
  if (h.isPlayer) for (const c of h.creatures) gearHappinessWeek(state, h, c);
  // Moon Frenzy (Lycanthropy / Moonstone) may kill a keeper on full-moon weeks
  if (state.world.week % 4 === 0) {
    for (const c of h.creatures) {
      const moon = hasTrait(c, 'Lycanthropy') || h.armory.some((g) => g.type === 'moonstone' && c.gear.item === g.id);
      if (moon && chance(0.25)) {
        loseKeepers(state, h, 1);
        if (h.isPlayer) report(state, 'bad', `Full moon: ${c.name} went into a frenzy and killed a keeper.`);
      }
    }
  }
  // loyaltyWeek always applies the weekly tameness change; it suppresses breakouts itself when betrayals are off
  darkFangsWeek(state, h);
  const rebels = loyaltyWeek(state, h);
  trainingWeek(state, h);
  // breeding
  const b1 = breedingWeek(state, h);
  const b2 = incubationWeek(state, h);
  const newly = new Set([...b1.born, ...b2.hatched].map((c) => c.id));
  const b3 = nurseryWeek(state, h, newly);
  if (h.isPlayer) {
    breedingReport(state, [...b1.lines, ...b2.lines, ...b3.lines]);
    const names = [...b1.born, ...b2.hatched].map((c) => `${c.name} (${SPECIES[c.species].name})`);
    if (names.length) state.results.push({ kind: 'hatch', names, text: names.length === 1 ? 'A new hatchling joins the ludus.' : 'New hatchlings join the ludus.' });
    if (b3.died.length) state.results.push({ kind: 'death', names: b3.died, text: 'Lost in the nursery.' });
  } else {
    aiBreedingWeek(state, h);
  }
  if (rebels.length && !h.defeated) return resolveBreakouts(state, h, rebels);
  return null;
}

/** GM Dark Blade lifecycle: hunger rises one stage a week; when Starving it may drain its wielder. */
function darkFangsWeek(state: GameState, h: Ludus): void {
  for (const g of h.armory) {
    if (g.unique !== 'darkFangs') continue;
    const wielder = h.creatures.find((c) => c.gear.weapon === g.id || c.gear.offhand === g.id);
    if (!wielder) continue;
    const stage = g.state ?? 2;
    if (stage < 4) {
      g.state = stage + 1;
      continue;
    }
    if (chance(0.5)) {
      if (!hasTrait(wielder, 'Anemic')) addTrait(wielder, 'Anemic');
      else if (!hasTrait(wielder, 'Bloodstarved')) addTrait(wielder, 'Bloodstarved');
      else wielder.injury = { type: 'severe', weeks: Math.max(wielder.injury?.weeks ?? 0, 4) };
      if (h.isPlayer) report(state, 'bad', `The starving Dark Fangs drained ${wielder.name}'s life force.`);
    }
  }
}

function resetWeekFlags(state: GameState): void {
  const p = state.player;
  p.registrations = {};
  p.intrigue = [];
  p.week = {};
  p.bets = {};
  for (const h of [p.ludus, ...state.rivals, state.unknown]) {
    h.builtThisWeek = false;
    h.surgeriesThisWeek = 0;
    h.targetedThisWeek = false;
    if (h.ai) h.ai.offeredThisWeek = false;
    h.spiesLastWeek = h.keepers.spies;
    h.unpaidThisWeek = false;
    for (const c of h.creatures) {
      c.inactive = false;
      c.treatedThisWeek = false;
      if (c.rewardCooldown > 0) c.rewardCooldown--;
    }
  }
}

/** Advance pressed: build brackets for this week's events. */
export function beginAdvance(state: GameState): void {
  startTournaments(state);
}

/** After the attended tournament: auto-resolve the rest, then resolve the week. */
export function completeWeek(state: GameState): ResultCard[] {
  const lines = finishTournaments(state);
  state.results = [];
  // keep report lines written during the management phase (decisions, intrigue) for this week's report
  for (const l of lines) report(state, 'info', l);
  resolveWeek(state);
  return state.results;
}

export function resolveWeek(state: GameState): void {
  const p = state.player;
  const me = p.ludus;
  const results: ResultCard[] = state.results;

  // --- Player.AppendWeekCascading (before the week counter moves) -----------------------------
  p.offers = p.offers.filter((o) => o.expiresWeek > state.world.week);
  influenceWeek(state);
  const breakout = houseWeek(state, me);
  delayedWeek(state);
  const election = electionWeek(state);
  if (election) results.unshift(election);
  if (me.defeated) return gameOver(state, me.defeated);
  checkObjectives(state);
  expireDecisions(state);
  adventureWeek(state);
  expeditionWeek(state);

  // --- Unknown house ------------------------------------------------------------------------
  unknownWeek(state);

  // --- World.AppendWeek ---------------------------------------------------------------------
  state.world.week++;
  const week = state.world.week;
  state.world.temperature = rollTemperature(week);
  hordeWeek(state);
  ascensionTurnEffects(state);
  regenerateMarkets(state);
  timelineWeek(state);
  if (week % 12 === 0) {
    for (const h of [me, ...state.rivals]) h.projected -= 1;
    report(state, 'expense', 'Inflation: weekly income −1 for every ludus');
  }
  const league = leagueWeek(state);
  if (league) results.push(league);

  // --- Random decision ----------------------------------------------------------------------
  const d = drawWeeklyDecision(state);
  if (d) p.decisions.push(d);

  // --- Public funding law -------------------------------------------------------------------
  if (state.world.laws.publicFunding && week % 4 === 0) {
    for (const h of [me, ...activeRivals(state)]) h.denarii += 500;
    report(state, 'income', 'Public ludus funding', 500);
  }

  // --- Rivals -------------------------------------------------------------------------------
  for (const r of [...state.rivals].reverse()) {
    if (r.defeated) continue;
    helpRival(state, r);
    houseWeek(state, r);
    if (r.defeated) continue;
    rivalWeek(state, r);
    rivalSchemes(state, r);
  }
  cleanupRivals(state);
  rivalBids(state);

  // --- Stories, achievements, next week's events --------------------------------------------
  storyWeek(state);
  checkAchievements(state);
  resetWeekFlags(state);
  seedWeekTournaments(state);
  state.runStats.peakInfluence = Math.max(state.runStats.peakInfluence, me.influence);

  if (breakout) results.push(breakout);
  results.push({ kind: 'report', entries: [...state.report], week: week - 1 });
  const order: ResultCard['kind'][] = ['election', 'league', 'story', 'escape', 'hatch', 'death', 'report'];
  results.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  state.report = [];
  state.world.rng = getSeed();
  state.nextId = getIdCounter();
}

function gameOver(state: GameState, reason: NonNullable<Ludus['defeated']>): void {
  state.over = { reason, week: state.world.week, influence: state.player.ludus.influence };
  message(state, 'herald', 'The ludus has fallen', defeatText(reason));
}

export function defeatText(reason: NonNullable<Ludus['defeated']>): string {
  switch (reason) {
    case 'debt': return 'Your ludus worked itself into considerable debt. The creditors came for the pens, the eggs and finally the gates. The ludus is closed.';
    case 'uprising': return 'Your dinos broke out together and burned the ludus to the ground. The Wild Horde grows.';
    case 'raid': return 'A rival raid slaughtered your household in the night.';
    case 'horde': return 'The Wild Horde ransacked your ludus. Your head has been put on a pike at the gate.';
    case 'surrender': return 'You gave up the ludus and walked home in a loincloth.';
  }
}

/** Kids must not be entered outside Hatchling Games etc.: exported for tournaments. */
export function ageEligible(c: Creature, juniorEvent: boolean): boolean {
  const e = eqAge(c);
  if (e < 8) return false;
  if (juniorEvent) return e < 17;
  return e >= 15;
}
