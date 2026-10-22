// Tournaments, pits and leagues. OWNER: world-arena agent. GM 03 §6–7, 04 §10.
import type {
  BattleResult, CheatType, Creature, Entry, GameState, GearSlot, ID, Instruction, League, LeagueId, Ludus, MatchRecord,
  Tournament, TournamentDef,
} from './types';

/** Fixed opening calendar + Lunar league + first Solar league (GM 03 §6.1, NewGame). */
export function seedCalendar(state: GameState): void { throw new Error('not implemented'); }
/** Build this week's Tournament objects from the calendar/recurring rules/leagues/organised/invader; add AI entrants. */
export function seedWeekTournaments(state: GameState): void { throw new Error('not implemented'); }
/** GM maxTournamentLevel(week). */
export function maxTournamentLevel(week: number): number { throw new Error('not implemented'); }
/** null if eligible, else reason (level cap, champion traits, age for Hatchling Games, beasts, injury, away…). */
export function eligibility(state: GameState, t: Tournament, c: Creature): string | null { throw new Error('not implemented'); }
/** Register player teams (each team perTeam creatures). Extra teams double the bracket (non-underground). */
export function register(state: GameState, tournamentId: ID, teams: ID[][]): string | null { throw new Error('not implemented'); }
export function unregister(state: GameState, tournamentId: ID): void { throw new Error('not implemented'); }
/** Called on Advance: fill brackets with AI houses and the Unknown house; mark the first registered as attended. */
export function startTournaments(state: GameState): void { throw new Error('not implemented'); }
export function attendedTournament(state: GameState): Tournament | undefined { throw new Error('not implemented'); }

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
/** Resolve AI-vs-AI matches up to the player's next match in the attended tournament; null when the player is out or done. */
export function nextPlayerMatch(state: GameState, t: Tournament): MatchPreview | null { throw new Error('not implemented'); }

export interface MatchPrep {
  gear?: Record<ID, Partial<Record<GearSlot, ID | null>>>;
  instructions?: Record<ID, Instruction>;
  bribe?: CheatType;
  bet?: { stake: number; onSelf: boolean };
}
/** Play the previewed player match with the chosen preparation; applies results. */
export function playMatch(state: GameState, t: Tournament, prep: MatchPrep): { result: BattleResult; won: boolean; text: string; betPayout?: number } { throw new Error('not implemented'); }
/** Underground: after winning the bracket the player may keep fighting bonus rounds or retire. */
export function continueBonus(state: GameState, t: Tournament, go: boolean): void { throw new Error('not implemented'); }
/** Auto-resolve a whole tournament (player entries use Care). */
export function autoResolve(state: GameState, t: Tournament): void { throw new Error('not implemented'); }
/** Resolve every remaining tournament this week and pay prizes/fame/traits/league points (GM 6.3–6.5). Returns summary lines. */
export function finishTournaments(state: GameState): string[] { throw new Error('not implemented'); }
/** League activation, scoring and end-of-league rewards (GM 03 §7). */
export function leagueWeek(state: GameState): import('./types').ResultCard | null { throw new Error('not implemented'); }
export function activeLeague(state: GameState): League | undefined { throw new Error('not implemented'); }
/** Player organises a tournament (300 denarii; The Organizer opportunity). */
export function organizeTournament(state: GameState, o: { perTeam: number; teams: number; week: number; beasts: boolean; mounts: boolean }): string | null { throw new Error('not implemented'); }
/** Upcoming scheduled events for the Arena screen. */
export function upcoming(state: GameState, weeks: number): TournamentDef[] { throw new Error('not implemented'); }
/** Prize preview (GM fee × contestants / 2 …). */
export function prizeFor(state: GameState, t: TournamentDef): { denarii: number; influence: number } { throw new Error('not implemented'); }
