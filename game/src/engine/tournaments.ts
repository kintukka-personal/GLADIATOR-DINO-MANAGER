// Tournaments, pits and leagues. OWNER: world-arena agent. GM 03 §6–7, 04 §10.
//
// Flow (see week.ts): seedWeekTournaments() builds this week's events from the calendar and the GM rules and adds
// AI entrants → the player registers → startTournaments() fills the brackets and marks the first registered event
// as attended → the UI loops nextPlayerMatch()/playMatch() (and continueBonus() in the pits) → finishTournaments()
// auto-resolves the rest and pays prizes → leagueWeek() activates/closes leagues after the week turns.
//
// Scripted and foreign fighters (pit foes, invaders, fillers) live only inside their Entry (`temp`). Their harness is
// written into creature.notes ("gear:<slot>:<type>:<quality>:<augment>:<unique>") and rebuilt into a transient
// armory when they fight; "house:<name>" names their side.

import type {
  BattleFighter, BattleOptions, BattleResult, BattleSide, CheatType, Creature, Entry, GameState, Gear, GearSlot, ID,
  Instruction, League, LeagueId, Ludus, MatchRecord, ResultCard, SideModifier, Tournament, TournamentDef, TraitId,
  Weather, BeastSpeciesId,
} from './types';
import {
  EVENT_TEMPLATES, OPENING_CALENDAR, LEAGUE_EVENT_KEYS, RECURRING, HYPERION_CALENDAR, LEGENDS_TIER_NAMES, INVADER_CITIES,
  WEATHERS, WEATHER_FACTOR, WEATHER_WEIGHTS, WEATHER_TEXT, LEAGUES, PIT_LADDER, pitRound, spartanRound, troyRound,
  prophecyRound, makeFoe, gearNote, parseGearNote, houseNote, type FoeRound,
} from './data/arenaData';
import { ENTRY_CHANCE, PIT_ENTRY_CHANCE } from './data/rivalsData';
import { makeGear } from './data/gear';
import { CLASSES, CLASS_IDS } from './data/classes';
import { SPECIES } from './data/species';
import { chance, clamp, coin, pick, rand, shuffle, weighted } from './rng';
import { achieve, fmt, hasUpgrade, houseById, findCreature, message, newId, ASC } from './util';
import {
  addTrait, bestStat, canFight, generateBeast, generateDino, grantRareLearnable, grantXp, hasTrait, removeTrait,
  setLevelAndStats, statWorth,
} from './creature';
import { ageEligible } from './week';
import { matingThisWeek, seasonName } from './breeding';
import { buildSide, prepareFighter, resolveBattle, applyBattleResult, teamWorth } from './combat';
import { cheatCost, cheatAvailable, aiCheatChoice, betMultiplier } from './bribes';
import { hasOpp } from './influence';
import { addInfluence } from './economy';
import { storyHook } from './stories';
import { ascensionProgress, ascensionFoes } from './ascension';
import { aiInstruction, changeOpinion, makeLegend, possessive, weakestRival } from './rivals';
import { makeLudus } from './newgame';

/** Events only the player can enter (cancelled when nobody registers). */
const PLAYER_ONLY = new Set(['ascension', 'prophecy']);
const CHEATS: CheatType[] = ['poison', 'chains', 'beast', 'guards'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function template(key: string, week: number, extra: Partial<TournamentDef> = {}): TournamentDef {
  return { ...EVENT_TEMPLATES[key], week, ...extra };
}

function isPlayerEntry(state: GameState, e: Entry | undefined): boolean {
  return !!e && e.houseId === state.player.ludus.id;
}

function realHouse(state: GameState, e: Entry): Ludus | undefined {
  return houseById(state, e.houseId);
}

function mkEntry(houseId: ID, creatureIds: ID[], temp?: Creature[]): Entry {
  const e: Entry = { houseId, creatureIds: [...creatureIds], eliminated: false, roundsWon: 0 };
  if (temp?.length) e.temp = temp;
  return e;
}

/** Display name of an entry's side. */
export function entryName(state: GameState, e: Entry): string {
  const h = realHouse(state, e);
  if (h) return h.name;
  const n = (e.temp ?? []).flatMap((c) => c.notes ?? []).find((x) => x.startsWith('house:'));
  return n ? n.slice(6) : 'Unknown';
}

/** Living fighters of an entry: house creatures still in the house, plus temporary fighters. */
export function entryCreatures(state: GameState, e: Entry): Creature[] {
  const h = realHouse(state, e);
  const real = h ? e.creatureIds.map((id) => h.creatures.find((c) => c.id === id)).filter((c): c is Creature => !!c) : [];
  return [...real, ...(e.temp ?? [])];
}

/** Rebuild a temporary fighter's harness from its notes and assign it. */
function noteGear(c: Creature): Gear[] {
  const out: Gear[] = [];
  const assigned: Creature['gear'] = {};
  for (const n of c.notes ?? []) {
    const g = parseGearNote(n);
    if (!g) continue;
    const id = `${c.id}~${g.slot}`;
    out.push(makeGear(g.type, g.quality, id, { augment: g.augment, unique: g.unique }));
    assigned[g.slot] = id;
  }
  if (out.length) c.gear = assigned;
  return out;
}

/** The house used to prepare an entry's fighters (real, a real house with extra kit, or a transient one). */
function prepHouse(state: GameState, e: Entry): Ludus {
  const h = realHouse(state, e);
  const temps = e.temp ?? [];
  const extra: Gear[] = [];
  for (const c of temps) extra.push(...noteGear(c));
  if (h && !extra.length) return h;
  if (h) return { ...h, armory: [...h.armory, ...extra], creatures: [...h.creatures, ...temps] };
  const t = makeLudus(entryName(state, e), false, 0);
  t.id = e.houseId;
  t.armory = extra;
  t.creatures = [...temps];
  return t;
}

function usedThisWeek(state: GameState): Set<ID> {
  const s = new Set<ID>();
  for (const t of state.world.tournaments) for (const e of t.entries) for (const id of e.creatureIds) s.add(id);
  return s;
}

function ownerOfCreature(state: GameState, c: Creature): Ludus | undefined {
  return [state.player.ludus, ...state.rivals, state.unknown].find((h) => h.creatures.includes(c));
}

function names(cs: Creature[]): string {
  const n = cs.map((c) => c.name);
  return n.length <= 1 ? (n[0] ?? 'nobody') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export function isMajorEvent(d: TournamentDef): boolean {
  return !d.underground && d.type !== 'rookie' && d.type !== 'junior';
}

export function isLeagueEvent(d: TournamentDef): boolean {
  return d.league !== undefined || LEAGUE_EVENT_KEYS.has(d.key);
}

function importance(t: TournamentDef): number {
  if (t.leagueFinale || t.type === 'league') return 0;
  if (t.league) return 1;
  if (isMajorEvent(t)) return 2;
  if (t.type === 'rookie' || t.type === 'junior') return 3;
  return 4;
}

/** GM maxTournamentLevel(week). */
export function maxTournamentLevel(week: number): number {
  if (week < 20) return Math.floor(week / 7) + 1;
  if (week < 50) return Math.floor(week / 9) + 1;
  return Math.floor(week / 15) + 4;
}

export function bracketRounds(t: { teams: number }): number {
  return Math.max(1, Math.round(Math.log2(Math.max(2, t.teams))));
}

/** Bonus rounds actually fought (GM loops ≤ N, so N + 1). 0 when the event has none. */
export function maxBonusRounds(t: TournamentDef): number {
  return t.bonusRounds === undefined ? 0 : t.bonusRounds + 1;
}

function championIndex(t: Tournament): number | undefined {
  const R = bracketRounds(t);
  return t.matches.find((m) => m.round === R && m.winner !== undefined)?.winner;
}

function pendingBonusMatch(t: Tournament): MatchRecord | undefined {
  const R = bracketRounds(t);
  return t.matches.find((m) => m.round > R && m.winner === undefined);
}

/** The player has won the bracket of an underground event and must choose to fight on or retire. */
export function bonusPending(state: GameState, t: Tournament): boolean {
  if (t.status !== 'bonus' || t.retired) return false;
  const c = championIndex(t);
  return c !== undefined && isPlayerEntry(state, t.entries[c]);
}

export function roundLabel(state: GameState, t: Tournament, m: MatchRecord): string {
  const R = bracketRounds(t);
  if (m.round > R) return `Bonus round ${m.round - R}: ${entryName(state, t.entries[m.b])}`;
  const left = R - m.round;
  return left === 0 ? 'Final' : left === 1 ? 'Semi-final' : left === 2 ? 'Quarter-final' : `Round of ${2 ** (left + 1)}`;
}

function ridersFor(t: Tournament, round: number): boolean {
  if (t.natural) return false;
  const R = bracketRounds(t);
  if (round > R) return t.mounts === 'full';
  switch (t.mounts) {
    case 'full': return true;
    case 'opening': return round === 1;
    case 'final': return round === R;
    default: return false;
  }
}

function foeRiders(t: Tournament, k: number): boolean {
  if (t.natural) return false;
  return t.type === 'ascension' || (t.type === 'underground' && k >= 7);
}

function rollWeather(week: number): Weather {
  const idx = ['Spring', 'Summer', 'Autumn', 'Winter'].indexOf(seasonName(week));
  return weighted(WEATHERS, WEATHER_WEIGHTS[Math.max(0, idx)]);
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** Fixed opening calendar + Lunar league + first Solar league (GM 03 §6.1, NewGame). */
export function seedCalendar(state: GameState): void {
  const w = state.world;
  w.calendar = [];
  for (const [key, week] of OPENING_CALENDAR) w.calendar.push(template(key, week));
  if (w.ascension >= ASC.hyperion) for (const [key, week] of HYPERION_CALENDAR) w.calendar.push(template(key, week));
  if (hasUpgrade(state, 'legendsOfMars')) {
    w.calendar.push(template('legendsOfMars', Math.max(25, w.week + 6)));
    w.flags.marsScheduled = 1;
  }
  w.leagues = [];
  const lunar = newLeague('lunar', 0);
  lunar.active = true;
  w.leagues.push(lunar);
  // GM: the Lunar league opens with Gannicus 8 and Pontius 2 points (10 / 6 in Nightmare)
  const nm = w.difficulty.nightmare;
  for (const [legend, pts] of [['gannicus', nm ? 10 : 8], ['pontius', nm ? 6 : 2]] as [string, number][]) {
    for (const r of state.rivals) {
      const c = r.creatures.find((x) => x.legend === legend);
      if (!c) continue;
      lunar.points[c.id] = pts;
      lunar.owners[c.id] = r.id;
      lunar.names[c.id] = c.name;
      c.career.leaguePoints += pts;
    }
  }
  scheduleLeague(state, 'solar');
}

function newLeague(id: LeagueId, start: number): League {
  const def = LEAGUES[id];
  return {
    id, name: def.name, start, end: start + def.length, pool: def.pool, active: false, done: false, points: {}, owners: {},
    names: {}, upgrade: def.upgrade,
  };
}

function scheduleLeague(state: GameState, id: LeagueId): League {
  const def = LEAGUES[id];
  const w = state.world;
  const prevEnd = w.leagues.reduce((m, l) => Math.max(m, l.end), 0);
  let start = Math.max(def.minStart, w.week, prevEnd + def.gap);
  if (id === 'annum') start = Math.max(start, w.week + 16);
  const l = newLeague(id, start);
  w.leagues.push(l);
  for (const e of def.events) {
    w.calendar.push({
      key: e.key, name: e.name, week: start + e.offset, perTeam: e.perTeam, teams: e.teams, fee: e.fee ?? 100,
      underground: false, mounts: e.mounts ?? 'none', beasts: e.beasts ?? false, type: e.type ?? 'normal', league: id,
      leagueFinale: e.finale, upgrade: def.upgrade,
    });
  }
  return l;
}

/**
 * Every event scheduled for a week: calendar entries plus the GM rules (Initium, Hatchling Games, the pits or the
 * Ascension, Spartan Primal Bout, flagged story events). `live` asks the Ascension requirements (seeding only);
 * otherwise the pits are predicted. Legends (invader) events are rolled at seeding and never predicted.
 */
export function eventsForWeek(state: GameState, week: number, live = false): TournamentDef[] {
  const w = state.world;
  const out: TournamentDef[] = [];
  for (const d of w.calendar) if (d.week === week) out.push({ ...d });
  if (week === 1 || week === 2 || week % 3 === 0) out.push(template('initium', week));
  if (week === 2 || week % 4 === 0) out.push(template('hatchling', week, { teams: week % 8 === 0 ? 2 : 4, beasts: week >= 5 }));
  let ascensionEvent: TournamentDef | null = null;
  if (live) {
    const due = state.ascended ? week % 50 === 0 : week % 2 === 0;
    if (due && ascensionProgress(state).ready) ascensionEvent = template('ascension', week, { bonusRounds: w.ascension + 1 });
  }
  out.push(ascensionEvent ?? template('pits', week, {
    teams: w.difficulty.nightmare && week >= 10 ? 4 : 2, bonusRounds: hasUpgrade(state, 'legendaryPits') ? 12 : 10,
  }));
  if (hasUpgrade(state, 'brawlers') && week % 13 === 0 && !w.flags.melankomasJoined && out.filter(isMajorEvent).length < 3) {
    out.push(template('spartanPrimal', week));
  }
  if (w.flags.prophecyWeek === week) out.push(template('prophecy', week));
  if (w.flags.troyWeek === week) out.push(template('troy', week));
  if (w.flags.poseidonWeek === week) out.push(template('poseidon', week));
  return out;
}

function makeTournament(state: GameState, d: TournamentDef): Tournament {
  const t: Tournament = {
    ...d, id: newId('t'), entries: [], matches: [], currentRound: 0, bonusRound: 0, status: 'open',
    weather: rollWeather(d.week), log: [],
  };
  if (isLeagueEvent(d)) {
    const l = activeLeague(state);
    t.league = l && d.week >= l.start && d.week < l.end && (!d.league || d.league === l.id) ? l.id : undefined;
  }
  if (d.key === 'romesFinest') t.organizerId = state.rivals.find((r) => r.ai?.key === 'solonius' && !r.defeated)?.id;
  return t;
}

/** Build this week's Tournament objects from the calendar/recurring rules/leagues/organised/invader; add AI entrants. */
export function seedWeekTournaments(state: GameState): void {
  const w = state.world;
  const week = w.week;
  if (w.flags.seededWeek === week && w.tournaments.length) return;
  w.flags.seededWeek = week;
  w.tournaments = [];
  if (hasUpgrade(state, 'legendsOfMars') && !w.flags.marsScheduled) {
    w.calendar.push(template('legendsOfMars', Math.max(25, week + 6)));
    w.flags.marsScheduled = 1;
  }
  const defs = eventsForWeek(state, week, true);
  for (const d of defs) {
    const next = RECURRING[d.key];
    if (next && !w.calendar.some((x) => x.key === d.key && x.week > week)) w.calendar.push({ ...d, week: next(week) });
  }
  w.calendar = w.calendar.filter((d) => d.week > week);
  for (const d of defs) w.tournaments.push(makeTournament(state, d));
  if (week > 3 && !w.difficulty.sandbox && rand(4) > 2) w.tournaments.push(makeInvaderTournament(state));
  const used = usedThisWeek(state);
  for (const t of [...w.tournaments].sort((a, b) => importance(a) - importance(b))) addAiEntrants(state, t, used);
}

// ---------------------------------------------------------------------------
// Legends (invader) tournaments (GM 6.9, generated: no server)
// ---------------------------------------------------------------------------

function rollInvaderTier(p: number): number {
  if ((p === 1 || (p === 2 && coin())) && coin()) return 1;
  if ((p === 2 || (p === 3 && coin())) && coin()) return 2;
  if (p >= 3 && chance(0.6)) return 3;
  if (p === 4 && coin()) return 4;
  return 0;
}

/** Era-appropriate harness quality (GM 6.9). */
function invaderQuality(state: GameState): Gear['quality'] {
  const week = state.world.week;
  if (state.world.difficulty.hard) return week > 20 ? 4 : week > 10 ? 3 : 2;
  return week > 80 ? 4 : week > 50 ? 3 : week > 20 ? 2 : 1;
}

function invaderChampion(state: GameState, city: string, tier: number): Creature {
  const week = state.world.week;
  const level = clamp(Math.floor(week / 8) + 3 + tier * 2 + rand(3), 3, 45);
  const c = generateDino({ tier: 'epic', level, week: Math.max(week, 30) });
  c.fame = 40 + level * 12 + tier * 60;
  if (tier > 0) addTrait(c, 'WorldChampion');
  const bs = bestStat(c);
  const options = CLASS_IDS.filter((k) => CLASSES[k].mainStat === bs && (!CLASSES[k].upgrade || hasUpgrade(state, CLASSES[k].upgrade!)));
  c.cls = options.length ? pick(options) : 'brute';
  c.classXp = 9 + tier * 7;
  const cls = CLASSES[c.cls];
  c.prof[cls.mainFamily] = Math.min(100, 20 + level * 3);
  const q = invaderQuality(state);
  const blessed = state.world.difficulty.hard && state.world.ascension > 0;
  const notes = [houseNote(`Champions of ${city}`), gearNote({ slot: 'weapon', type: cls.mainWeapon, quality: q, augment: blessed ? 'Blessed' : undefined })];
  if (cls.offhand) notes.push(gearNote({ slot: 'offhand', type: cls.offhand, quality: q }));
  const heavy = cls.mainStat === 'str' || cls.mainStat === 'hp';
  notes.push(gearNote({ slot: 'armor', type: heavy ? 'bronzeBarding' : 'lightHarness', quality: q, augment: blessed ? 'Reinforced' : undefined }));
  notes.push(gearNote({ slot: 'helmet', type: 'bronzeMuzzle', quality: Math.max(0, q - 1) as Gear['quality'] }));
  c.notes = notes;
  return c;
}

function makeInvaderTournament(state: GameState): Tournament {
  const tier = rollInvaderTier(state.player.ludus.championTier);
  const t = makeTournament(state, template('invader', state.world.week, { name: LEGENDS_TIER_NAMES[tier], special: `tier:${tier}` }));
  for (const city of shuffle([...INVADER_CITIES]).slice(0, 3)) {
    t.entries.push(mkEntry(`inv-${city.toLowerCase().replace(/[^a-z]+/g, '')}`, [], [invaderChampion(state, city, tier)]));
  }
  return t;
}

function eventTier(t: TournamentDef): number {
  const m = /^tier:(\d)$/.exec(t.special ?? '');
  return m ? Number(m[1]) : 0;
}

// ---------------------------------------------------------------------------
// Eligibility and registration
// ---------------------------------------------------------------------------

/** null if eligible, else reason (level cap, champion traits, age for Hatchling Games, beasts, injury, away…). */
export function eligibility(state: GameState, t: Tournament, c: Creature, opts: { house?: Ludus; ai?: boolean } = {}): string | null {
  const h = opts.house ?? ownerOfCreature(state, c);
  if (t.upgrade && h?.isPlayer && !hasUpgrade(state, t.upgrade)) return 'This league is locked: it needs its upgrade.';
  if (c.away) return 'Away from the ludus.';
  if (c.pregnancy) return 'Pregnant. The crowd would riot, and not in a good way.';
  if (!canFight(c)) return c.injury ? 'Injured.' : 'Too young to fight at all.';
  if (c.inactive) return 'Busy elsewhere this week.';
  if (h && matingThisWeek(h, c)) return 'In the breeding pen this week.';
  const junior = t.type === 'junior';
  if (!ageEligible(c, junior)) return junior ? 'Too old for the Hatchling Games.' : 'Too young: hatchlings only fight in the Hatchling Games.';
  if (c.kind === 'beast' && !t.beasts) return 'No beasts allowed.';
  if (t.type === 'rookie') {
    const cap = maxTournamentLevel(state.world.week);
    if (c.level > cap) return `Too experienced for rookies (level ${cap} at most).`;
    if (hasTrait(c, 'ArenaChampion') || hasTrait(c, 'SolarChampion')) return 'Champions are barred from rookie events.';
  }
  if (h?.isPlayer && !opts.ai) {
    for (const [tid, teams] of Object.entries(state.player.registrations)) {
      if (tid === t.id || !teams.some((team) => team.includes(c.id))) continue;
      const other = state.world.tournaments.find((x) => x.id === tid);
      return `Already entered in ${other?.name ?? 'another tournament'} this week.`;
    }
  }
  if (!h?.isPlayer) {
    for (const o of state.world.tournaments) {
      if (o !== t && o.entries.some((e) => e.creatureIds.includes(c.id))) return 'Already entered this week.';
    }
  }
  return null;
}

/** Register player teams (each team 1..perTeam creatures). Extra teams double the bracket (non-underground). */
export function register(state: GameState, tournamentId: ID, teams: ID[][]): string | null {
  const t = state.world.tournaments.find((x) => x.id === tournamentId);
  if (!t) return 'No such tournament this week.';
  if (t.status !== 'open') return 'Registration is closed.';
  if (t.upgrade && !hasUpgrade(state, t.upgrade)) return 'This league is locked: it needs its upgrade.';
  const clean = teams.filter((team) => team.length > 0);
  if (!clean.length) { unregister(state, tournamentId); return null; }
  const maxTeams = t.underground || PLAYER_ONLY.has(t.type) ? 1 : Math.min(16, Math.max(t.teams, t.teams * 2));
  if (clean.length > maxTeams) return maxTeams === 1 ? 'Only one team may enter this event.' : `At most ${maxTeams} teams.`;
  const me = state.player.ludus;
  const seen = new Set<ID>();
  for (const team of clean) {
    if (team.length > t.perTeam) return `Teams of at most ${t.perTeam}.`;
    for (const id of team) {
      if (seen.has(id)) return 'A dino can only fight in one team.';
      const c = me.creatures.find((x) => x.id === id);
      if (!c) return 'That dino is not in your ludus.';
      const why = eligibility(state, t, c, { house: me });
      if (why) return `${c.name}: ${why}`;
      seen.add(id);
    }
  }
  state.player.registrations[tournamentId] = clean.map((x) => [...x]);
  storyHook(state, 'registered', { tournamentId, key: t.key });
  return null;
}

export function unregister(state: GameState, tournamentId: ID): void {
  delete state.player.registrations[tournamentId];
}

// ---------------------------------------------------------------------------
// AI entrants and bracket filling
// ---------------------------------------------------------------------------

function pickTeam(state: GameState, t: Tournament, h: Ludus, used: Set<ID>, n = t.perTeam): Creature[] | null {
  const cands = h.creatures
    .filter((c) => !used.has(c.id) && c.loyalty >= 15 && eligibility(state, t, c, { house: h, ai: true }) === null)
    .sort((a, b) => statWorth(b) - statWorth(a));
  return cands.length >= n ? cands.slice(0, n) : null;
}

function pushTeam(t: Tournament, h: Ludus, team: Creature[], used: Set<ID>): void {
  t.entries.push(mkEntry(h.id, team.map((c) => c.id)));
  for (const c of team) used.add(c.id);
}

function fitUnused(state: GameState, t: Tournament, h: Ludus, used: Set<ID>, pred: (c: Creature) => boolean): Creature[] {
  return h.creatures.filter((c) => pred(c) && !used.has(c.id) && eligibility(state, t, c, { house: h, ai: true }) === null);
}

function specialEntrants(state: GameState, t: Tournament, used: Set<ID>): void {
  const rival = (key: string) => state.rivals.find((r) => r.ai?.key === key && !r.defeated);
  const week = state.world.week;
  switch (t.key) {
    case 'hippodrome': {
      const magnus = rival('magnus');
      if (!magnus) break;
      const leos = fitUnused(state, t, magnus, used, (c) => c.legend === 'leoI' || c.legend === 'leoII');
      if (leos.length >= t.perTeam) pushTeam(t, magnus, leos.slice(0, t.perTeam), used);
      break;
    }
    case 'gigantus': {
      const v = rival('vettius');
      if (!v?.ai) break;
      if (!v.ai.visible) {
        v.ai.visible = true;
        message(state, 'herald', 'Vettius', 'A young lanista called Vettius has paid for this week\'s games. He says he has "something big" for the crowd. His keepers would not stop shaking.');
      }
      const giant = fitUnused(state, t, v, used, (c) => c.legend === 'gigantus');
      const rest = fitUnused(state, t, v, used, (c) => c.legend !== 'gigantus').sort((a, b) => statWorth(b) - statWorth(a));
      const team = [...giant, ...rest].slice(0, t.perTeam);
      if (team.length) pushTeam(t, v, team, used);
      break;
    }
    case 'challenge': {
      const u = state.unknown;
      const best = fitUnused(state, t, u, used, (c) => c.kind === 'dino').sort((a, b) => statWorth(b) - statWorth(a))[0];
      t.entries.push(mkEntry(u.id, [], [generateBeast('direbear', { variant: 'random', name: 'Arena Dire Bear' })]));
      t.entries.push(mkEntry(u.id, [], [generateBeast('sabertooth', { variant: 'random', name: 'Arena Sabertooth' })]));
      if (best) { t.entries.push(mkEntry(u.id, [best.id])); used.add(best.id); }
      else t.entries.push(mkEntry(u.id, [], [generateBeast('direwolf', { variant: 'random', name: 'Arena Dire Wolf' })]));
      break;
    }
    case 'legendsOfMars': {
      const champ = makeFoe({ legend: 'mars' }, week);
      champ.notes = [...(champ.notes ?? []), houseNote('Temple of Mars')];
      t.entries.push(mkEntry('temple-of-mars', [], [champ]));
      break;
    }
  }
}

function addAiEntrants(state: GameState, t: Tournament, used: Set<ID>): void {
  if (PLAYER_ONLY.has(t.type)) return;
  specialEntrants(state, t, used);
  const cap = t.teams - 1; // always leave room for the player
  const pool = state.rivals.filter((r) => !r.defeated && r.ai?.visible);
  const organizer = pool.find((r) => r.id === t.organizerId);
  const houses = [...(organizer ? [organizer] : []), ...shuffle(pool.filter((r) => r !== organizer))];
  for (const h of houses) {
    if (t.entries.length >= cap) break;
    if (t.entries.some((e) => e.houseId === h.id)) continue;
    const arena = h.ai!.personality.arena;
    const p = h === organizer ? 1 : t.underground ? PIT_ENTRY_CHANCE[arena] : Math.min(1, ENTRY_CHANCE[arena] + (t.league ? 0.2 : 0));
    if (!chance(p)) continue;
    const team = pickTeam(state, t, h, used);
    if (!team) continue;
    pushTeam(t, h, team, used);
    if (t.teams >= 8 && t.entries.length < cap && chance(0.3)) {
      const second = pickTeam(state, t, h, used);
      if (second) pushTeam(t, h, second, used);
    }
  }
}

function filler(state: GameState, t: Tournament): Creature {
  const week = state.world.week;
  if (t.beasts && t.type !== 'junior' && chance(0.3)) {
    const species = pick<BeastSpeciesId>(week > 30 ? ['sabertooth', 'direbear', 'terrorbird', 'sarcosuchus'] : ['direwolf', 'terrorbird', 'sabertooth']);
    return generateBeast(species, { variant: 'random' });
  }
  if (t.type === 'junior') return generateDino({ tier: 'cheap', week, level: 1, eqAge: 12 + rand(4) });
  const level = t.type === 'rookie' ? 1 : Math.max(1, Math.floor(week / 10) + rand(2));
  return generateDino({ tier: 'cheap', week, level });
}

function spiculusJoins(state: GameState, t: Tournament): boolean {
  const w = state.world;
  return hasUpgrade(state, 'greatSpiculus') && w.week > 10 && !w.flags.spiculusTaken && w.flags.spiculusWeek !== w.week
    && !t.underground && t.type !== 'rookie' && t.type !== 'junior' && !PLAYER_ONLY.has(t.type);
}

function unknownEntry(state: GameState, t: Tournament, used: Set<ID>): Entry {
  const u = state.unknown;
  const temp: Creature[] = [];
  if (spiculusJoins(state, t)) {
    temp.push(makeFoe({ legend: 'spiculus' }, state.world.week));
    state.world.flags.spiculusWeek = state.world.week;
  }
  const real = u.creatures
    .filter((c) => !used.has(c.id) && eligibility(state, t, c, { house: u, ai: true }) === null)
    .sort((a, b) => statWorth(b) - statWorth(a))
    .slice(0, Math.max(0, t.perTeam - temp.length));
  for (const c of real) used.add(c.id);
  while (real.length + temp.length < t.perTeam) temp.push(filler(state, t));
  return mkEntry(u.id, real.map((c) => c.id), temp);
}

function keepEntry(state: GameState, e: Entry): boolean {
  const h = realHouse(state, e);
  if (!h) return !!e.temp?.length;
  if (h.defeated) return false;
  e.creatureIds = e.creatureIds.filter((id) => {
    const c = h.creatures.find((x) => x.id === id);
    return !!c && canFight(c);
  });
  return e.creatureIds.length > 0 || !!e.temp?.length;
}

function mkMatch(state: GameState, t: Tournament, round: number, a: number, b: number): MatchRecord {
  return { round, a, b, playerInvolved: isPlayerEntry(state, t.entries[a]) || isPlayerEntry(state, t.entries[b]) };
}

function openBracket(state: GameState, t: Tournament, playerTeams: ID[][]): void {
  const me = state.player.ludus;
  const teams = playerTeams
    .map((team) => team.filter((id) => {
      const c = me.creatures.find((x) => x.id === id);
      return !!c && eligibility(state, t, c, { house: me }) === null;
    }))
    .filter((team) => team.length > 0);
  if (PLAYER_ONLY.has(t.type) && !teams.length) {
    t.status = 'done';
    t.entries = [];
    t.log.push(`No challenger stepped forward for ${t.name}. The priests went home disappointed.`);
    return;
  }
  let size = t.teams;
  if (!t.underground && teams.length > 1) size = Math.min(16, size * 2);
  while (size < 16 && teams.length > size) size *= 2;
  const mine = teams.slice(0, size).map((team) => mkEntry(me.id, team));
  t.entries = t.entries.filter((e) => keepEntry(state, e));
  while (t.entries.length + mine.length > size) t.entries.pop();
  t.entries.push(...mine);
  t.teams = size;
  const used = usedThisWeek(state);
  if (!PLAYER_ONLY.has(t.type)) {
    for (const h of shuffle(state.rivals.filter((r) => !r.defeated && r.ai?.visible))) {
      if (t.entries.length >= size) break;
      if (t.entries.some((e) => e.houseId === h.id) || !chance(0.4)) continue;
      const team = pickTeam(state, t, h, used);
      if (team) pushTeam(t, h, team, used);
    }
  }
  while (t.entries.length < size) t.entries.push(unknownEntry(state, t, used));
  // seeding: shuffle, then keep the player's own teams apart in the first round where possible
  const bracket = shuffle(t.entries.slice(0, size));
  for (let i = 0; i + 1 < size; i += 2) {
    if (!isPlayerEntry(state, bracket[i]) || !isPlayerEntry(state, bracket[i + 1])) continue;
    const j = bracket.findIndex((e, idx) => idx > i + 1 && !isPlayerEntry(state, e) && !isPlayerEntry(state, bracket[idx ^ 1]));
    if (j >= 0) [bracket[i + 1], bracket[j]] = [bracket[j], bracket[i + 1]];
  }
  t.entries = bracket;
  t.matches = [];
  for (let i = 0; i + 1 < size; i += 2) t.matches.push(mkMatch(state, t, 1, i, i + 1));
  t.currentRound = 1;
  t.status = 'running';
  t.spectators = spectatorsFor(state, t);
  t.log.push(`${t.name}: ${size} teams, ${fmt(t.spectators)} spectators. ${WEATHER_TEXT[t.weather]}`);
}

/** Called on Advance: fill brackets with AI houses and the Unknown house; mark the first registered as attended. */
export function startTournaments(state: GameState): void {
  const regs = state.player.registrations;
  for (const t of [...state.world.tournaments].sort((a, b) => importance(a) - importance(b))) {
    if (t.status === 'open') openBracket(state, t, regs[t.id] ?? []);
  }
  const first = Object.keys(regs)
    .map((id) => state.world.tournaments.find((t) => t.id === id))
    .find((t) => !!t && t.status !== 'done' && t.entries.some((e) => isPlayerEntry(state, e)));
  for (const t of state.world.tournaments) t.attended = t === first;
  for (const t of state.world.tournaments) {
    for (const e of t.entries) {
      const h = realHouse(state, e);
      if (!h) continue;
      for (const id of e.creatureIds) {
        const c = h.creatures.find((x) => x.id === id);
        if (c) c.inactive = true;
      }
    }
  }
}

export function attendedTournament(state: GameState): Tournament | undefined {
  return state.world.tournaments.find((t) => t.attended);
}

// ---------------------------------------------------------------------------
// Spectators and prizes (GM 6.3)
// ---------------------------------------------------------------------------

function influenceTerm(i: number): number {
  let v = i > 1000 ? 1000 + i / 100 : i;
  if (v >= 20) v = v / 10 + 20;
  return Math.max(0, v);
}

export function spectatorsFor(state: GameState, t: Tournament): number {
  let base = t.underground ? 20 : 100;
  if (['poseidon', 'ascension', 'mars', 'final'].includes(t.type)) base += 100;
  if (t.type === 'prophecy') base += 1000;
  if (t.type === 'rookie' || t.type === 'junior') base = 50;
  if (t.league) base += 50;
  let per = 0;
  for (const e of t.entries.slice(0, t.teams)) {
    per += influenceTerm(realHouse(state, e)?.influence ?? 0);
    for (const c of entryCreatures(state, e)) {
      per += c.fame > 100 ? 45 + c.fame / 15 : c.fame / 2;
      per += c.level > 50 ? c.level / 20 + 45 : c.level;
    }
  }
  return Math.floor((base + per) * WEATHER_FACTOR[t.weather]);
}

function basePrize(d: TournamentDef): number {
  const fee = d.fee > 0 ? d.fee : 50;
  let p = Math.floor((fee * d.perTeam * d.teams) / 2);
  if (p > 500) p -= 100;
  return p;
}

function prestige(d: TournamentDef, bonusWon: number): number {
  return d.perTeam * d.teams + d.teams + 2 * bonusWon + (d.type === 'invader' ? 10 : 0);
}

function nightmareCut(p: number): number {
  return p > 150 ? p - 50 : p > 100 ? p - 25 : p;
}

/** Prize preview for the winner (GM fee × contestants / 2 …), as the player would receive it. */
export function prizeFor(state: GameState, t: TournamentDef): { denarii: number; influence: number } {
  let denarii = basePrize(t);
  const influence = prestige(t, 0);
  if (state.world.difficulty.nightmare) denarii = nightmareCut(denarii);
  return { denarii, influence };
}

function organizerIncome(spectators: number): { denarii: number; influence: number } {
  let influence = 5;
  let denarii = 100;
  if (spectators > 1000) { influence = 10; denarii = 200; }
  for (const th of [5000, 10000, 20000, 50000]) if (spectators > th) { influence += 5; denarii += 200; }
  if (spectators > 100000) { influence += 5; denarii += 400; }
  return { denarii, influence };
}

// ---------------------------------------------------------------------------
// Fighting a match
// ---------------------------------------------------------------------------

export interface MatchPreview {
  tournament: Tournament;
  match: MatchRecord;
  player: Entry;
  opponent: Entry;
  opponentHouse?: Ludus;
  opponentCreatures: Creature[];
  playerCreatures: Creature[];
  roundLabel: string;
  bonusRound: number;
  /** AI cheating announced ("Bribed guards" / "Fair play expected") */
  aiCheats: boolean;
  /** odds for betting (GM Σ(worth+10) difference) */
  odds: number;
  riders: boolean;
}

export interface MatchPrep {
  gear?: Record<ID, Partial<Record<GearSlot, ID | null>>>;
  instructions?: Record<ID, Instruction>;
  bribe?: CheatType;
  bet?: { stake: number; onSelf: boolean };
}

interface FightOutcome { result: BattleResult; text: string; playerWon?: boolean; betPayout?: number }

function matchKey(t: Tournament, m: MatchRecord): string {
  return `${t.id}:${t.matches.indexOf(m)}`;
}

/** The AI's cheat for a match against the player, decided once (preview and fight agree). */
function aiCheatFor(state: GameState, t: Tournament, m: MatchRecord, rival: Ludus | undefined, own: Creature[], enemy: Creature[]): CheatType | null {
  if (!rival?.ai || state.world.week < 2 || m.round > bracketRounds(t)) return null;
  const key = `cheat:${matchKey(t, m)}`;
  const stored = state.player.week[key];
  if (typeof stored === 'number') return stored > 0 ? CHEATS[stored - 1] : null;
  const choice = aiCheatChoice(state, rival, t, own.length, enemy.length, own, enemy);
  state.player.week[key] = choice ? CHEATS.indexOf(choice) + 1 : 0;
  return choice;
}

function escapedBeast(enemies: Creature[]): BattleFighter {
  const species = pick<BeastSpeciesId>(['sabertooth', 'direbear', 'direwolf']);
  const c = generateBeast(species, { variant: 'random', name: `Escaped ${SPECIES[species].name}` });
  const level = Math.min(40, enemies.reduce((s, x) => s + x.level, 0) + 1);
  if (level > 1) setLevelAndStats(c, level);
  return { creature: c, gear: {}, instruction: null, temporary: true };
}

/** Apply a cheat for the side that bought it. */
function applyCheat(type: CheatType | null, own: SideModifier[], enemy: SideModifier[], ownExtra: BattleFighter[], enemies: Creature[]): void {
  if (type === 'poison') own.push('PoisonedWeapons');
  else if (type === 'chains') enemy.push('Chained');
  else if (type === 'beast') ownExtra.push(escapedBeast(enemies));
}

function makeSide(
  state: GameState, t: Tournament, e: Entry, house: Ludus, creatures: Creature[], ins: Record<ID, Instruction | null>,
  riders: boolean, modifiers: SideModifier[], player: boolean, overrides?: MatchPrep['gear'],
): BattleSide {
  const side = buildSide(state, house, creatures, ins, { riders, natural: t.natural, name: entryName(state, e), modifiers, player });
  if (overrides && creatures.some((c) => overrides[c.id])) {
    const used = new Set<ID>();
    const byId = new Map<ID, BattleFighter>();
    const order = [...creatures].sort((a, b) => (overrides[b.id] ? 1 : 0) - (overrides[a.id] ? 1 : 0));
    for (const c of order) {
      const f = prepareFighter(state, house, c, ins[c.id] ?? null, { riders, natural: t.natural, used, override: overrides[c.id] });
      for (const g of Object.values(f.gear)) if (g) used.add(g.id);
      byId.set(c.id, f);
    }
    side.fighters = creatures.map((c) => byId.get(c.id)!);
  }
  side.modifiers = side.modifiers ?? [];
  for (const m of modifiers) if (!side.modifiers.includes(m)) side.modifiers.push(m);
  return side;
}

function bathHouseFighter(h: Ludus, cs: Creature[]): ID | undefined {
  if (!(h.buildings.bathHouse > 0) || !cs.length) return undefined;
  return [...cs].sort((a, b) => b.fame - a.fame)[0].id;
}

function instructionsFor(
  state: GameState, t: Tournament, e: Entry, cs: Creature[], o: { live: boolean; vsPlayer: boolean; odds: number; prep?: MatchPrep; bonusK: number },
): Record<ID, Instruction | null> {
  const out: Record<ID, Instruction | null> = {};
  let fixed: Instruction | null = null;
  const h = realHouse(state, e);
  if (isPlayerEntry(state, e)) {
    for (const c of cs) out[c.id] = o.live && o.vsPlayer ? (o.prep?.instructions?.[c.id] ?? c.instruction) : 'care';
    return out;
  }
  if (t.type === 'prophecy') fixed = 'kill';
  else if (o.bonusK > 0) fixed = t.type === 'ascension' && o.bonusK === maxBonusRounds(t) - 1 ? 'allout' : null;
  else if (o.vsPlayer && h?.ai) fixed = aiInstruction(state, h, o.odds, o.live);
  // scripted foes may carry their own orders (e.g. the Ascension's All Out round)
  for (const c of cs) out[c.id] = fixed ?? (!h && c.instruction !== 'default' ? c.instruction : null);
  return out;
}

function fakeResult(winner: 0 | 1): BattleResult {
  return { winner, decidedBy: 'forfeit', rounds: 0, log: [], fighters: [], outcomes: [] };
}

function giveItem(state: GameState, h: Ludus | undefined, g: Gear, why: string): void {
  if (!h) return;
  h.armory.push(g);
  if (h.isPlayer) message(state, 'herald', 'A prize from the arena', `${why} The armory now holds ${g.unique ? 'a relic' : 'a new piece'}: keep it oiled.`);
}

/** Fight one match (live: the player's attended match with preparation). Records the winner. */
function fight(state: GameState, t: Tournament, m: MatchRecord, live: boolean, prep?: MatchPrep): FightOutcome {
  const R = bracketRounds(t);
  const bonusK = Math.max(0, m.round - R);
  const pa = isPlayerEntry(state, t.entries[m.a]);
  const pb = isPlayerEntry(state, t.entries[m.b]);
  const flip = pb && !pa;
  const i0 = flip ? m.b : m.a;
  const i1 = flip ? m.a : m.b;
  const e0 = t.entries[i0];
  const e1 = t.entries[i1];
  const vsPlayer = isPlayerEntry(state, e0) && !isPlayerEntry(state, e1);
  const c0 = entryCreatures(state, e0);
  const c1 = entryCreatures(state, e1);
  const label = roundLabel(state, t, m);
  const me = state.player.ludus;

  let result: BattleResult;
  let playerCheat: CheatType | null = null;
  let ins0: Record<ID, Instruction | null> = {};
  let stake = 0;
  let onSelf = true;
  const r1 = realHouse(state, e1);
  const rival = vsPlayer && r1?.ai ? r1 : undefined;
  const odds = c0.length && c1.length ? teamWorth(c0) - teamWorth(c1) : 0;
  let dead: string[] = [];
  let enemyCount = c1.length;

  if (!c0.length || !c1.length) {
    result = fakeResult(c0.length ? 0 : 1);
  } else {
    const h0 = prepHouse(state, e0);
    const h1 = prepHouse(state, e1);
    const riders0 = ridersFor(t, m.round);
    const riders1 = bonusK ? foeRiders(t, bonusK) || riders0 : riders0;
    ins0 = instructionsFor(state, t, e0, c0, { live, vsPlayer, odds, prep, bonusK });
    const ins1 = instructionsFor(state, t, e1, c1, { live, vsPlayer, odds, prep, bonusK });
    // cheats
    let aiCheat = vsPlayer ? aiCheatFor(state, t, m, rival, c1, c0) : null;
    if (live && vsPlayer && prep?.bribe && cheatAvailable(state, t, prep.bribe, c0.length, c1.length) === null) {
      const cost = cheatCost(state, t, prep.bribe, c0.length, c1.length, me);
      if (me.denarii >= cost) { me.denarii -= cost; playerCheat = prep.bribe; }
    }
    if (playerCheat === 'guards') aiCheat = null;
    if (aiCheat && rival) rival.denarii -= Math.max(0, cheatCost(state, t, aiCheat, c1.length, c0.length, rival));
    const mods0: SideModifier[] = [];
    const mods1: SideModifier[] = [];
    const extra0: BattleFighter[] = [];
    const extra1: BattleFighter[] = [];
    applyCheat(playerCheat, mods0, mods1, extra0, c1);
    applyCheat(aiCheat, mods1, mods0, extra1, c0);
    // bet (stake paid on placement)
    if (live && vsPlayer && prep?.bet && prep.bet.stake > 0 && hasOpp(state, 'gambler')) {
      stake = Math.max(0, Math.min(prep.bet.stake, 200, me.denarii));
      onSelf = prep.bet.onSelf;
      if (stake > 0) {
        me.denarii -= stake;
        state.player.bets[matchKey(t, m)] = { stake, onSelf };
      }
    }
    const s0 = makeSide(state, t, e0, h0, c0, ins0, riders0, mods0, isPlayerEntry(state, e0), live ? prep?.gear : undefined);
    const s1 = makeSide(state, t, e1, h1, c1, ins1, riders1, mods1, false);
    s0.fighters.push(...extra0);
    s1.fighters.push(...extra1);
    enemyCount = s1.fighters.length;
    const opts: BattleOptions = {
      week: state.world.week, rounds: t.rounds, riders: riders0 || riders1, natural: t.natural,
      favoured: [h0.buildings.templeOfPluto > 0, h1.buildings.templeOfPluto > 0],
      bathHouse: [bathHouseFighter(h0, c0), bathHouseFighter(h1, c1)], label: `${t.name}: ${label}`,
    };
    result = resolveBattle([s0, s1], opts);
    dead = applyBattleResult({ state, tournament: t }, [s0, s1], result) ?? [];
    for (const e of [e0, e1]) {
      if (e.temp) e.temp = e.temp.filter((c) => !result.outcomes.some((o) => o.creatureId === c.id && o.died));
    }
  }

  const winIdx = result.winner === 0 ? i0 : i1;
  const loseIdx = result.winner === 0 ? i1 : i0;
  const winner = t.entries[winIdx];
  const loser = t.entries[loseIdx];
  m.winner = winIdx;
  winner.roundsWon++;
  loser.eliminated = true;

  const how = result.decidedBy === 'crowd' ? ' The crowd decided it.' : result.decidedBy === 'forfeit' ? ' The loser yielded the sand.' : '';
  const graves = dead.length ? ` ${names(dead.map((n) => ({ name: n } as Creature)))} did not leave the sand alive.` : '';
  let text: string;
  let playerWon: boolean | undefined;
  let betPayout: number | undefined;
  if (vsPlayer) {
    playerWon = result.winner === 0;
    text = playerWon
      ? `${names(c0)} won the ${label.toLowerCase()} against ${entryName(state, e1)}.${how}${graves}`
      : `${names(c0)} lost the ${label.toLowerCase()} to ${entryName(state, e1)}.${how}${graves}`;
    if (rival) {
      if (playerWon && playerCheat && playerCheat !== 'guards') changeOpinion(state, rival, -2);
      if (!playerWon && !playerCheat && c0.length && c0.every((c) => (ins0[c.id] ?? 'default') === 'care')) {
        changeOpinion(state, rival, 1);
        addInfluence(state, rival, 1);
        rival.denarii += 50;
      }
    }
    storyHook(state, 'matchResult', {
      rivalKey: r1?.ai?.key, playerWon, won: playerWon, opponentHouseId: e1.houseId, tournamentKey: t.key, tournamentId: t.id,
    });
    for (const o of result.outcomes) {
      if (!o.died || o.side !== 1 || !o.killedBy || !c0.some((c) => c.id === o.killedBy)) continue;
      storyHook(state, 'kill', { victimHouseId: e1.houseId, victimId: o.creatureId, byPlayer: true, killerHouseId: me.id });
    }
    if (stake > 0 && playerWon === onSelf) {
      betPayout = Math.floor(stake * (1 + betMultiplier(onSelf ? odds : -odds)));
      me.denarii += betPayout;
      text += ` The bookmakers paid out ${betPayout} denarii.`;
    } else if (stake > 0) {
      betPayout = 0;
      text += ` The bookmakers kept your ${stake} denarii.`;
    }
    if (playerWon && c0.length === 1 && enemyCount >= 3) achieve(state, 'oneManArmy');
    if (playerWon && c0.length === 1 && hasTrait(c0[0], 'Blind')) achieve(state, 'eyesCanDeceive');
  } else {
    text = `${entryName(state, winner)} beat ${entryName(state, loser)} (${label.toLowerCase()}).${how}${graves}`;
  }
  m.summary = text;
  t.log.push(text);

  // bonus-round milestones and relics
  const winHouse = realHouse(state, winner);
  if (bonusK && winIdx === i0) {
    if (t.type === 'underground' && bonusK === 8 && isPlayerEntry(state, winner)) {
      achieve(state, 'colossusSlayer');
      if (state.world.difficulty.hard) achieve(state, 'colossusSlayerHard');
    }
    // Troy relics are handed out by stories.ts (Hand of Midas after round 3, Achilles' Horn on the final win)
    if (isPlayerEntry(state, winner)) storyHook(state, 'tournamentRound', { type: t.type, round: bonusK, tournamentId: t.id });
  }
  // Spiculus joins whoever beats him
  const spic = (loser.temp ?? []).find((c) => c.legend === 'spiculus');
  if (spic && winHouse && winHouse !== state.unknown && !state.world.flags.spiculusTaken) {
    state.world.flags.spiculusTaken = 1;
    const s = makeLegend(state, 'spiculus');
    winHouse.creatures.push(s);
    if (winHouse.isPlayer) message(state, 'herald', 'Spiculus', 'The great Spiculus has been beaten fairly, and by custom he now fights for the ludus that beat him: yours.');
  }
  return { result, text, playerWon, betPayout };
}

// ---------------------------------------------------------------------------
// Bracket progression and bonus rounds
// ---------------------------------------------------------------------------

function bonusFoes(state: GameState, t: Tournament, k: number): { label: string; creatures: Creature[] } {
  const week = state.world.week;
  if (t.type === 'ascension') {
    const cs = ascensionFoes(state, k);
    return { label: cs.length ? names(cs) : 'The gods\' champion', creatures: cs };
  }
  let fr: FoeRound;
  switch (t.type) {
    case 'spartanPankration': fr = spartanRound(k); break;
    case 'troy': fr = troyRound(k); break;
    case 'prophecy': fr = prophecyRound(k); break;
    default: fr = pitRound(k);
  }
  return { label: fr.label, creatures: fr.foes.map((f) => makeFoe(f, week)) };
}

function createBonusMatch(state: GameState, t: Tournament): MatchRecord {
  const k = t.bonusRound + 1;
  const champ = championIndex(t)!;
  const { label, creatures } = bonusFoes(state, t, k);
  for (const c of creatures) c.notes = [...(c.notes ?? []).filter((n) => !n.startsWith('house:')), houseNote(label)];
  t.entries.push(mkEntry(`bonus-${k}`, [], creatures));
  const m = mkMatch(state, t, bracketRounds(t) + k, champ, t.entries.length - 1);
  t.matches.push(m);
  t.bonusRound = k;
  t.currentRound = m.round;
  return m;
}

/** Advance after matches resolve: next round, bonus stage or conclusion. */
function step(state: GameState, t: Tournament): void {
  const R = bracketRounds(t);
  if (t.status === 'running') {
    const cur = t.matches.filter((m) => m.round === t.currentRound);
    if (cur.some((m) => m.winner === undefined)) return;
    if (t.currentRound < R) {
      const winners = cur.map((m) => m.winner!);
      t.currentRound++;
      for (let i = 0; i + 1 < winners.length; i += 2) t.matches.push(mkMatch(state, t, t.currentRound, winners[i], winners[i + 1]));
      return;
    }
    if (maxBonusRounds(t) > 0) { t.status = 'bonus'; return; }
    conclude(state, t);
    return;
  }
  if (t.status !== 'bonus' || pendingBonusMatch(t)) return;
  const champ = championIndex(t);
  const last = [...t.matches].reverse().find((m) => m.round > R);
  if (champ === undefined || (last && last.winner !== champ) || t.retired || t.bonusRound >= maxBonusRounds(t)
    || !entryCreatures(state, t.entries[champ]).length) {
    conclude(state, t);
  }
}

function pitTier(c: Creature): number {
  let tier = -1;
  PIT_LADDER.forEach((s, i) => { if (hasTrait(c, s.trait)) tier = i; });
  return tier;
}

function justEarnedPitTrait(t: Tournament, cs: Creature[]): boolean {
  const k = t.bonusRound + 1;
  return cs.some((c) => {
    const next = PIT_LADDER[pitTier(c) + 1];
    return !!next && k >= next.minK;
  });
}

/** Does the bracket winner fight the next bonus round? (AI: GM pit-continue rule; player auto: until the next pit trait.) */
function wantsToContinue(state: GameState, t: Tournament): boolean {
  const champ = championIndex(t);
  if (champ === undefined) return false;
  const e = t.entries[champ];
  const cs = entryCreatures(state, e);
  if (!cs.length) return false;
  if (t.type === 'underground' && justEarnedPitTrait(t, cs)) return false;
  if (isPlayerEntry(state, e)) return true;
  const next = t.bonusRound + 1;
  const S = cs.reduce((s, c) => s + c.level, 0);
  const T = Math.floor((next + 1) / 2);
  switch (realHouse(state, e)?.ai?.personality.arena ?? 'balanced') {
    case 'risktaker': return S > T / 2;
    case 'conservative': return S > 1.5 * T;
    case 'crazy': return S > T || coin();
    default: return S >= T;
  }
}

function runBonusAuto(state: GameState, t: Tournament): void {
  let guard = 60;
  while (t.status === 'bonus' && guard-- > 0) {
    const pend = pendingBonusMatch(t);
    if (pend) { fight(state, t, pend, false); step(state, t); continue; }
    step(state, t);
    if (t.status !== 'bonus') break;
    if (!wantsToContinue(state, t)) { t.retired = true; conclude(state, t); break; }
    createBonusMatch(state, t);
  }
  if (t.status === 'bonus') conclude(state, t);
}

function isPlayerMatch(state: GameState, t: Tournament, m: MatchRecord): boolean {
  return isPlayerEntry(state, t.entries[m.a]) !== isPlayerEntry(state, t.entries[m.b]);
}

/** Resolve everything up to the player's next match; null when the player is out or the event is over. */
function runToPlayerMatch(state: GameState, t: Tournament): MatchRecord | null {
  let guard = 1000;
  while (guard-- > 0) {
    if (t.status === 'open' || t.status === 'done') return null;
    if (t.status === 'running') {
      const pend = t.matches.filter((m) => m.round === t.currentRound && m.winner === undefined);
      if (!pend.length) { step(state, t); continue; }
      const m = pend[0];
      if (isPlayerMatch(state, t, m)) return m;
      fight(state, t, m, false);
      continue;
    }
    // bonus stage
    const champ = championIndex(t);
    if (champ === undefined || !isPlayerEntry(state, t.entries[champ])) { runBonusAuto(state, t); continue; }
    const pend = pendingBonusMatch(t);
    if (pend) return pend;
    step(state, t);
    if (t.status !== 'bonus') continue;
    return createBonusMatch(state, t);
  }
  return null;
}

function buildPreview(state: GameState, t: Tournament, m: MatchRecord): MatchPreview {
  const flip = isPlayerEntry(state, t.entries[m.b]);
  const player = t.entries[flip ? m.b : m.a];
  const opponent = t.entries[flip ? m.a : m.b];
  const pc = entryCreatures(state, player);
  const oc = entryCreatures(state, opponent);
  const R = bracketRounds(t);
  const rival = realHouse(state, opponent);
  const cheat = aiCheatFor(state, t, m, rival?.ai ? rival : undefined, oc, pc);
  return {
    tournament: t, match: m, player, opponent, opponentHouse: prepHouse(state, opponent), opponentCreatures: oc,
    playerCreatures: pc, roundLabel: roundLabel(state, t, m), bonusRound: Math.max(0, m.round - R), aiCheats: !!cheat,
    odds: pc.length && oc.length ? teamWorth(pc) - teamWorth(oc) : 0, riders: ridersFor(t, m.round),
  };
}

/** Resolve AI-vs-AI matches up to the player's next match in the attended tournament; null when the player is out or done. */
export function nextPlayerMatch(state: GameState, t: Tournament): MatchPreview | null {
  const m = runToPlayerMatch(state, t);
  return m ? buildPreview(state, t, m) : null;
}

/** Play the previewed player match with the chosen preparation; applies results. */
export function playMatch(state: GameState, t: Tournament, prep: MatchPrep): { result: BattleResult; won: boolean; text: string; betPayout?: number } {
  const m = runToPlayerMatch(state, t);
  if (!m) throw new Error('There is no match left to play in this tournament.');
  const f = fight(state, t, m, true, prep);
  step(state, t);
  return { result: f.result, won: !!f.playerWon, text: f.text, betPayout: f.betPayout };
}

/** Underground: after winning the bracket the player may keep fighting bonus rounds or retire. */
export function continueBonus(state: GameState, t: Tournament, go: boolean): void {
  if (t.status !== 'bonus') return;
  const champ = championIndex(t);
  if (champ === undefined || !isPlayerEntry(state, t.entries[champ])) return;
  const pend = pendingBonusMatch(t);
  if (!go) {
    if (pend) {
      t.matches = t.matches.filter((m) => m !== pend);
      if (pend.b === t.entries.length - 1) t.entries.pop();
      t.bonusRound = Math.max(0, t.bonusRound - 1);
      t.currentRound = bracketRounds(t) + t.bonusRound;
    }
    t.retired = true;
    t.log.push(`${entryName(state, t.entries[champ])} retired from the pits while still breathing.`);
    conclude(state, t);
    return;
  }
  if (!pend && !t.retired && t.bonusRound < maxBonusRounds(t)) createBonusMatch(state, t);
}

/** Auto-resolve a whole tournament (player entries use Care). */
export function autoResolve(state: GameState, t: Tournament): void {
  if (t.status === 'open') openBracket(state, t, state.player.registrations[t.id] ?? []);
  let guard = 1000;
  while (t.status !== 'done' && guard-- > 0) {
    if (t.status === 'running') {
      const pend = t.matches.filter((m) => m.round === t.currentRound && m.winner === undefined);
      for (const m of pend) fight(state, t, m, false);
      step(state, t);
    } else if (t.status === 'bonus') {
      runBonusAuto(state, t);
    } else break;
  }
  if (t.status !== 'done') conclude(state, t);
}

// ---------------------------------------------------------------------------
// Conclusion: prizes, win effects, league points (GM 6.3–6.5)
// ---------------------------------------------------------------------------

function eliminationRound(t: Tournament, i: number): number {
  return t.matches.find((m) => (m.a === i || m.b === i) && m.winner !== undefined && m.winner !== i)?.round ?? 0;
}

/** GM Gladiator.winTournament: one new trait per event. Returns the new trait's id, if any. */
function applyWinEffects(t: Tournament, c: Creature, k: number, cleared: boolean): TraitId | null {
  c.loyalty = Math.min(100, c.loyalty + 2);
  if (hasTrait(c, 'GlorySeeker')) c.fame += 5;
  let fame = 0;
  let xp = 0;
  let trait: TraitId | null = null;
  let major = false;
  let rare = false;
  const replace: TraitId[] = [];
  if (t.type === 'invader') {
    fame = 30; xp = 50; major = true;
    if (hasTrait(c, 'WorldChampion')) rare = true; else trait = 'WorldChampion';
  } else if (t.type === 'rookie') {
    fame = 10; xp = 7; trait = 'FirstBlood';
  } else if (t.type === 'junior') {
    fame = 10; xp = 7; trait = 'RaisedInTheArena';
  } else if (t.type === 'pankration' && !t.underground) {
    fame = 10; xp = 7; trait = 'PankrationChampion';
  } else if (t.type === 'ascension') {
    if (cleared) { fame = 50; xp = 150; trait = 'Ascended'; major = true; }
  } else if (t.type === 'prophecy' || t.type === 'troy') {
    fame = 50; xp = 150; major = true;
  } else if (t.type === 'spartanPankration') {
    fame = 20; xp = 40; trait = 'PankrationChampion';
  } else if (t.underground) {
    for (const s of PIT_LADDER) if (k >= s.minK) { fame = s.fame; xp = s.xp; }
    if (k >= 11) { fame += 5; xp += 5; major = true; }
    const next = PIT_LADDER[pitTier(c) + 1];
    if (next && k >= next.minK) {
      trait = next.trait;
      if (trait === 'PitChampion') replace.push('PitFighter');
      if (trait === 'PitLegend') replace.push('PitFighter', 'PitChampion');
    }
    c.career.pitBest = Math.max(c.career.pitBest, k - 1);
  } else {
    fame = 15; xp = 10; trait = 'ArenaChampion'; major = true;
  }
  c.fame += fame;
  if (xp) grantXp(c, xp);
  let gained: TraitId | null = null;
  if (trait && !hasTrait(c, trait)) {
    for (const r of replace) removeTrait(c, r);
    if (addTrait(c, trait)) gained = trait;
  }
  if (rare) grantRareLearnable(c);
  c.career.tournamentWins++;
  if (major) c.career.majorWins++;
  if (!t.underground || t.type === 'prophecy' || t.type === 'troy' || t.type === 'ascension') c.career.trophies.push(t.name);
  return gained;
}

function awardLeaguePoints(state: GameState, t: Tournament, champIdx: number): void {
  if (!t.league) return;
  const l = state.world.leagues.find((x) => x.id === t.league && x.active && !x.done);
  if (!l) return;
  const mult = t.type === 'league' || t.leagueFinale ? 2 : 1;
  const R = bracketRounds(t);
  const give = (idx: number, pts: number) => {
    const e = t.entries[idx];
    const h = e && realHouse(state, e);
    if (!h) return;
    for (const c of entryCreatures(state, e)) {
      if (!h.creatures.includes(c)) continue;
      l.points[c.id] = (l.points[c.id] ?? 0) + pts;
      l.owners[c.id] = h.id;
      l.names[c.id] = c.name;
      c.career.leaguePoints += pts;
    }
  };
  give(champIdx, 4 * mult);
  const final = t.matches.find((m) => m.round === R);
  if (final) give(final.a === champIdx ? final.b : final.a, 2 * mult);
  if (R >= 2) for (const m of t.matches.filter((x) => x.round === R - 1 && x.winner !== undefined)) give(m.winner === m.a ? m.b : m.a, mult);
}

function invaderVictory(state: GameState, t: Tournament): void {
  const p = state.player;
  const h = p.ludus;
  p.invaderWins++;
  achieve(state, 'legendsChampion');
  const tier = eventTier(t);
  const before = h.championTier;
  let shard = false;
  if (before === 0) h.championTier = 1;
  else if (tier === before) {
    if (before >= 3) shard = true;
    if (before < 4) h.championTier = before + 1;
  }
  if (shard) giveItem(state, h, makeGear('amberShard', 2, newId('g')), 'The foreign champions paid tribute in amber.');
  const names = ['None', 'Bronze', 'Silver', 'Gold', 'Diamond'];
  if (h.championTier > before) {
    message(state, 'herald', `${names[h.championTier]} Legend`, `Word of your victory has crossed the sea. Your ludus is now a ${names[h.championTier]} legend, and foreign houses will send better champions.`);
  }
  if (before < 2 && h.championTier >= 2) achieve(state, 'silverLegend');
  if (before < 3 && h.championTier >= 3) achieve(state, 'goldLegend');
  if (before < 4 && h.championTier >= 4) achieve(state, 'diamondLegend');
}

function conclude(state: GameState, t: Tournament): void {
  if (t.status === 'done') return;
  t.status = 'done';
  const R = bracketRounds(t);
  const champIdx = championIndex(t);
  if (champIdx === undefined) { t.log.push(`${t.name} ended without a champion.`); return; }
  const champ = t.entries[champIdx];
  const house = realHouse(state, champ);
  const isMe = isPlayerEntry(state, champ);
  const bonusWon = t.matches.filter((m) => m.round > R && m.winner === champIdx).length;
  const cleared = maxBonusRounds(t) > 0 && bonusWon >= maxBonusRounds(t);
  const k = bonusWon + 1;
  const all = entryCreatures(state, champ);
  const winners = house ? all.filter((c) => house.creatures.includes(c)) : [];
  const playerIn = t.entries.some((e) => isPlayerEntry(state, e));

  // prize and prestige
  let denarii = basePrize(t) + 25 * bonusWon;
  const influence = prestige(t, bonusWon);
  if (isMe && state.world.difficulty.nightmare) denarii = nightmareCut(denarii);
  if (house) {
    house.denarii += denarii;
    addInfluence(state, house, influence);
  }

  // win effects
  const gained: string[] = [];
  for (const c of winners) {
    const tr = applyWinEffects(t, c, k, cleared);
    if (tr && isMe) gained.push(`${c.name} gained ${tr.replace(/([a-z])([A-Z])/g, '$1 $2')}`);
  }

  // houses knocked out after winning a round: round × 25
  for (let i = 0; i < t.teams && i < t.entries.length; i++) {
    if (i === champIdx) continue;
    const reached = eliminationRound(t, i);
    const h = realHouse(state, t.entries[i]);
    if (reached > 1 && h) {
      h.denarii += reached * 25;
      if (h.isPlayer) t.log.push(`» ${t.name}: knocked out in the ${roundLabel(state, t, t.matches.find((m) => m.round === reached)!).toLowerCase()}, +${reached * 25} denarii for the effort.`);
    }
  }

  awardLeaguePoints(state, t, champIdx);

  // organiser
  if (t.organizerId) {
    const org = houseById(state, t.organizerId);
    if (org) {
      const inc = organizerIncome(t.spectators ?? 0);
      let den = inc.denarii;
      if (org.isPlayer && state.world.difficulty.nightmare && den > 100) den -= 25;
      org.denarii += den;
      addInfluence(state, org, inc.influence);
      if (org.isPlayer) {
        state.player.counters.organizedHeld = (state.player.counters.organizedHeld ?? 0) + 1;
        t.log.push(`» ${t.name}: ${fmt(t.spectators ?? 0)} spectators came. The gate takes ${den} denarii and you gain ${inc.influence} influence.`);
      }
    }
  }

  // special prizes
  switch (t.type) {
    case 'mars': giveItem(state, house, makeGear('talonBlades', 5, newId('g'), { unique: 'swordOfMars' }), 'Mars himself would approve: the Talons of Mars are yours.'); break;
    case 'poseidon': giveItem(state, house, makeGear('tridentHorns', 5, newId('g'), { unique: 'poseidonsTrident' }), 'The priests of Neptune present Poseidon\'s Trident.'); break;
    case 'hyperion': giveItem(state, house, makeGear('mysteriousEgg', 2, newId('g')), 'Hyperion\'s priests hand over a petrified egg. It is warm.'); break;
    case 'spartanPankration':
      if (cleared && house && !state.world.flags.melankomasJoined) {
        state.world.flags.melankomasJoined = 1;
        house.creatures.push(makeLegend(state, 'melankomas'));
        if (isMe) message(state, 'herald', 'Melankomas', 'Melankomas of Caria picked himself up off the sand, spat out a tooth and declared he would fight for the house that beat him. He eats a lot.');
      }
      break;
    case 'ascension':
      if (cleared && isMe && winners[0]) {
        state.ascended = true;
        state.world.flags.ascensionChampion = winners[0].id;
        message(state, 'oracle', 'Ascension', `${winners[0].name} has defeated the champions of the gods. Olympus is taking notes.`);
      }
      break;
  }
  if (t.type === 'underground' && k >= 14) giveItem(state, house, makeGear('tigrisSkull', 4, newId('g')), 'Tigris is dead. His skull makes a fine helmet.');

  // the player's bookkeeping and achievements
  if (isMe) {
    if (isMajorEvent(t)) {
      achieve(state, 'wonTournament');
      if (state.world.difficulty.hard) achieve(state, 'wonTournamentHard');
      if (state.world.difficulty.nightmare) achieve(state, 'wonTournamentNightmare');
    }
    if (t.type === 'gigantus') achieve(state, 'defeatGigantus');
    if (t.organizerId === state.player.ludus.id) {
      achieve(state, 'organizer');
      state.player.counters.organizedWon = (state.player.counters.organizedWon ?? 0) + 1;
    }
    if (t.type === 'invader') invaderVictory(state, t);
  }

  // summary
  const champNames = names(all);
  if (isMe) {
    const pit = bonusWon > 0 ? ` (${bonusWon} bonus round${bonusWon > 1 ? 's' : ''}${cleared ? ', every last one' : ''})` : '';
    t.log.push(`» ${t.name}: ${champNames} won${pit}! +${denarii} denarii, +${influence} influence.${gained.length ? ` ${gained.join('; ')}.` : ''}`);
  } else {
    t.log.push(`» ${t.name}: won by ${champNames} of ${entryName(state, champ)}.`);
  }
  // stories: Prophecy and Troy only count as won once every bonus round has been cleared
  const won = isMe && (t.type === 'prophecy' || t.type === 'troy' ? cleared : true);
  if (won) storyHook(state, 'tournamentWon', { type: t.type, key: t.key, tournamentId: t.id, organizerId: t.organizerId, bonusRounds: bonusWon, cleared });
  if (playerIn) storyHook(state, 'tournamentResult', { tournamentKey: t.key, type: t.type, playerWon: isMe, bonusRounds: isMe ? bonusWon : 0, cleared: isMe && cleared });
}

/** Resolve every remaining tournament this week and pay prizes/fame/traits/league points (GM 6.3–6.5). Returns summary lines. */
export function finishTournaments(state: GameState): string[] {
  for (const t of state.world.tournaments) if (t.status !== 'done') autoResolve(state, t);
  const lines: string[] = [];
  for (const t of state.world.tournaments) {
    const mine = t.entries.some((e) => isPlayerEntry(state, e)) || t.organizerId === state.player.ludus.id;
    if (!mine) continue;
    for (const l of t.log) if (l.startsWith('» ')) lines.push(l.slice(2));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Leagues (GM 03 §7)
// ---------------------------------------------------------------------------

export function activeLeague(state: GameState): League | undefined {
  return state.world.leagues.find((l) => l.active && !l.done);
}

function creatureExists(state: GameState, id: ID): boolean {
  if (findCreature(state, id)) return true;
  const m = state.world.market;
  return m.creatures.some((c) => c.id === id) || m.oldCreatures.some((c) => c.id === id);
}

export function leagueStandings(state: GameState, l: League): { id: ID; name: string; house: string; houseId?: ID; points: number }[] {
  return Object.entries(l.points)
    .map(([id, points]) => {
      const f = findCreature(state, id);
      const h = f?.house ?? houseById(state, l.owners[id]);
      return { id, name: f?.creature.name ?? l.names[id] ?? 'Unknown', house: h?.name ?? 'the wild', houseId: h?.id, points };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function activateLeague(state: GameState, l: League): void {
  l.active = true;
  message(state, 'herald', `${l.name} begins`, `The ${l.name} has begun. Every dino that reaches the last rounds of its events scores points; the top three share ${fmt(l.pool)} denarii and the glory.`);
  const weak = weakestRival(state);
  if (!weak) return;
  switch (l.id) {
    case 'solar': {
      weak.denarii += 400;
      weak.creatures.push(makeLegend(state, 'gwyn'));
      message(state, 'herald', 'Gwyn', `${weak.name} has bought Gwyn, a sail-backed Spinosaurus from the far west, to burn through the Solar League.`);
      break;
    }
    case 'jupiter': {
      weak.denarii += 400;
      weak.creatures.push(makeLegend(state, 'jupiterWolf'));
      message(state, 'herald', 'Jupiter\'s Wolf', `${weak.name} has caught a dire wolf the size of a horse. The priests say Jupiter sent it. The wolf says nothing and eats a priest.`);
      break;
    }
    case 'vulcan':
      weak.denarii += 500;
      weak.armory.push(makeGear('bronzeBarding', 3, newId('g'), state.world.difficulty.nightmare ? { augment: 'Reinforced' } : {}));
      break;
  }
}

function endLeague(state: GameState, l: League): ResultCard {
  l.active = false;
  l.done = true;
  const def = LEAGUES[l.id];
  const standings = leagueStandings(state, l);
  const prizes = def.prizes();
  const playerPlaces: number[] = [];
  const lines: string[] = [];
  standings.slice(0, 3).forEach((s, i) => {
    if (s.points <= 0) return;
    const place = (i + 1) as 1 | 2 | 3;
    const found = findCreature(state, s.id);
    const c = found?.creature;
    const h = found?.house;
    const ord = ['1st', '2nd', '3rd'][i];
    if (h) {
      h.trophies.push({ league: l.id, place, week: state.world.week, creatureName: s.name });
      h.denarii += Math.floor(l.pool / [2, 3, 6][i]);
      addInfluence(state, h, [20, 10, 5][i]);
      const p = prizes[i];
      h.armory.push(makeGear(p.type, p.quality, newId('g'), { augment: p.augment, unique: p.unique }));
      if (h.isPlayer) playerPlaces.push(place);
    }
    if (c) {
      c.career.trophies.push(`${l.name} (${ord})`);
      if (place === 1) addTrait(c, c.legend === 'gwyn' && l.id === 'solar' ? 'LordOfCinders' : def.trait);
    }
    if (place === 1 && h?.isPlayer) {
      state.player.leagueWins++;
      if (def.achievement) achieve(state, def.achievement);
    }
    lines.push(`${ord}: ${s.name} of ${s.house}, ${s.points} points`);
  });
  if (playerPlaces.length === 3 && (l.id === 'lunar' || l.id === 'solar')) {
    state.world.flags[`swept_${l.id}`] = 1;
    if (state.world.flags.swept_lunar && state.world.flags.swept_solar) achieve(state, 'leagueSweep');
  }
  if (state.player.leagueWins > 5) achieve(state, 'leagueDomination');
  message(state, 'herald', `${l.name} ends`, lines.length ? `The ${l.name} is over.\n${lines.join('\n')}` : `The ${l.name} is over. Nobody scored a point. The crowd wants its money back.`);
  return { kind: 'league', league: l.id, standings: standings.slice(0, 8).map((s) => ({ name: s.name, house: s.house, points: s.points })) };
}

/** League activation, scoring and end-of-league rewards (GM 03 §7). */
export function leagueWeek(state: GameState): ResultCard | null {
  const w = state.world;
  const week = w.week;
  for (const id of ['solar', 'bacchus', 'jupiter', 'vulcan'] as LeagueId[]) if (!w.leagues.some((l) => l.id === id)) scheduleLeague(state, id);
  if (week > 100 && !w.leagues.some((l) => l.id === 'annum' && !l.done)) scheduleLeague(state, 'annum');
  for (const l of w.leagues) {
    if (l.done) continue;
    for (const id of Object.keys(l.points)) {
      if (creatureExists(state, id)) continue;
      delete l.points[id];
      delete l.owners[id];
      delete l.names[id];
    }
  }
  let card: ResultCard | null = null;
  for (const l of w.leagues) if (l.active && !l.done && week >= l.end) card = endLeague(state, l);
  for (const l of [...w.leagues].sort((a, b) => a.start - b.start)) {
    if (l.done || l.active || week < l.start || week >= l.end || activeLeague(state)) continue;
    activateLeague(state, l);
  }
  return card;
}

// ---------------------------------------------------------------------------
// Organised tournaments, calendar views
// ---------------------------------------------------------------------------

/** Put an organised tournament on the calendar (player or AI). */
export function scheduleOrganized(
  state: GameState, h: Ludus, o: { perTeam: number; teams: number; week: number; beasts: boolean; mounts: boolean; name?: string },
): TournamentDef {
  const host = h.isPlayer ? state.player.lanista : h.name;
  const d: TournamentDef = {
    key: 'organized', name: o.name ?? `${possessive(host)} Tournament`, week: o.week, perTeam: clamp(Math.floor(o.perTeam), 1, 3),
    teams: [2, 4, 8].includes(o.teams) ? o.teams : 4, fee: 100, underground: false, organizerId: h.id,
    mounts: o.mounts ? 'full' : 'none', beasts: o.beasts, type: 'organized',
  };
  state.world.calendar.push(d);
  return d;
}

/**
 * Player organises a tournament (300 denarii; The Organizer opportunity). `cost`, `free` (skip the opportunity
 * check, for events such as "Bread and games") and `name` are optional extras.
 */
export function organizeTournament(
  state: GameState, o: { perTeam: number; teams: number; week: number; beasts: boolean; mounts: boolean; cost?: number; free?: boolean; name?: string },
): string | null {
  const me = state.player.ludus;
  if (!o.free && !hasOpp(state, 'theOrganizer')) return 'You need The Organizer influence opportunity first.';
  if (o.perTeam < 1 || o.perTeam > 3) return 'Teams must have 1 to 3 dinos.';
  if (![2, 4, 8].includes(o.teams)) return 'Choose 2, 4 or 8 teams.';
  if (o.week <= state.world.week) return 'Pick a week after this one.';
  if (state.world.calendar.some((d) => d.week === o.week && d.organizerId === me.id)) return 'You already host a tournament that week.';
  const cost = o.cost ?? 300;
  if (me.denarii < cost) return `Hosting costs ${cost} denarii.`;
  me.denarii -= cost;
  scheduleOrganized(state, me, o);
  state.player.organized++;
  return null;
}

/** Upcoming scheduled events for the Arena screen (this week's tournaments plus the next `weeks` weeks). */
export function upcoming(state: GameState, weeks: number): TournamentDef[] {
  const week = state.world.week;
  const out: TournamentDef[] = [...state.world.tournaments];
  for (let w = week + 1; w <= week + weeks; w++) out.push(...eventsForWeek(state, w, false));
  return out.sort((a, b) => a.week - b.week || importance(a) - importance(b));
}
