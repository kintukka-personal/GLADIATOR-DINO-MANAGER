// Achievements (Amber rewards). OWNER: systems-story agent. GM 03 §11 + breeding achievements.
//
// Event achievements (tournament wins, pit rounds, kills, forging…) are pushed by the system that sees the
// event through util.achieve / unlockAchievement. checkAchievements runs weekly for the state-based ones and
// adds the Hard/Nightmare variants of anything earned this session. Nothing is ever granted in Sandbox games.
import type { AchievementId, Creature, GameState, LeagueId, Meta, TraitId, WeaponFamily } from './types';
import { achieve, difficultyKey } from './util';
import { classProficiency } from './creature';
import { treeFor } from './influence';

export interface AchievementDef { id: AchievementId; name: string; desc: string; amber: number; hidden?: boolean }

const A = (id: AchievementId, name: string, amber: 50 | 100, desc: string, hidden = false): AchievementDef =>
  (hidden ? { id, name, desc, amber, hidden } : { id, name, desc, amber });

const LIST: AchievementDef[] = [
  A('wonTournament', 'Champion of the arena', 50, 'Win any tournament above ground (Initium and the Hatchling Games do not count).'),
  A('wonTournamentHard', 'Champion of the arena (Hard)', 50, 'Win a tournament above ground on Hard.'),
  A('wonTournamentNightmare', 'Champion of the arena (Nightmare)', 50, 'Win a tournament above ground on Nightmare.'),
  A('eliminateOpponent', 'Veni Vidi Vici', 100, 'See a rival ludus destroyed: bankrupt, burned or ransacked.'),
  A('defeatGigantus', 'The bigger they are..', 100, 'Win "Who can defeat Gigantus?".'),
  A('colossusSlayer', 'Giantslayer', 100, 'Beat the Colossus in the underground pits.'),
  A('colossusSlayerHard', 'Giantslayer (Hard)', 100, 'Beat the Colossus in the underground pits on Hard.'),
  A('influencer', 'Influencer', 100, 'Have more than 100 influence.'),
  A('influencerHard', 'Influencer (Hard)', 100, 'Have more than 100 influence on Hard.'),
  A('influencerNightmare', 'Influencer (Nightmare)', 100, 'Have more than 1000 influence on Nightmare.'),
  A('famous', 'Famous', 100, 'Own a dino with more than 100 fame.'),
  A('legendsChampion', 'Legendary', 100, 'Win a Legends tournament.'),
  A('greedIsGood', 'Greed is good', 100, 'Hold 2000 denarii.'),
  A('peopleManager', 'People manager', 100, 'Own at least 5 dinos, all with tameness 80 or more.'),
  A('organizer', 'Organizer', 100, 'Win a tournament you organised yourself.'),
  A('assassin', 'Et tu Domine?', 100, 'Kill a rival\'s dino by poison or assassination.'),
  A('winSenateElections', 'Politician', 100, 'Get elected to the Senate.'),
  A('masterOfOne', 'Master of One', 100, 'Reach 100% proficiency in a fighting style.'),
  A('adventurer', 'Adventurer', 50, 'Bring a dino home from an adventure.'),
  A('adventurerHard', 'Adventurer (Hard)', 50, 'Finish an adventure on Hard.'),
  A('adventurerNightmare', 'Adventurer (Nightmare)', 50, 'Finish an adventure on Nightmare.'),
  A('builder', 'Builder', 100, 'Residence above level 2 and Training Field above level 1.'),
  A('apprentice', 'Apprentice', 50, 'Forge something.'),
  A('eyesCanDeceive', 'Your eyes can deceive you', 100, 'Win with a completely blind dino fighting alone.'),
  A('imperator', 'Imperator', 100, 'Crush the Wild Horde with a successful expedition.'),
  A('lunarChampion', 'Lunar Champion', 100, 'Finish first in the Lunar league.'),
  A('solarChampion', 'Solar Champion', 100, 'Finish first in the Solar league.'),
  A('leagueDomination', 'League Domination', 100, 'Win every league: Lunar, Solar, Bacchus, Jupiter, Vulcan and an Annum.'),
  A('leagueSweep', 'League Sweep', 100, 'Take first, second and third place in both a Lunar and a Solar league.'),
  A('dejavu', 'History Repeats', 100, 'Let Spartacus break out, then kill him on an expedition.'),
  A('ascension', 'Ascension', 100, 'Win an Ascension tournament.'),
  A('divine', 'Divine', 100, 'Reach Ascension level 5.'),
  A('divineHard', 'Divine (Hard)', 100, 'Reach Ascension level 5 on Hard.'),
  A('divineNightmare', 'Divine (Nightmare)', 100, 'Reach Ascension level 5 on Nightmare.'),
  A('radiance', 'Radiance', 100, 'Reach Ascension level 10.'),
  A('radianceHard', 'Radiance (Hard)', 100, 'Reach Ascension level 10 on Hard.'),
  A('radianceNightmare', 'Radiance (Nightmare)', 100, 'Reach Ascension level 10 on Nightmare.'),
  A('student', 'Student', 50, 'Complete every "Getting started" objective.'),
  A('oneManArmy', 'One dino army', 100, 'Have one dino beat three opponents in a single battle.'),
  A('weaponsMasterAch', 'Weapons Master', 100, 'Master proficiency (150) with claws, fangs, horns, maces, spit and jaws on one dino.'),
  A('conduitOfTheGods', 'Conduit of the Gods', 100, 'Complete every task of the Pythia.'),
  A('prophecy', 'Prophecy fulfilled', 100, 'Win the Prophecy tournament.'),
  A('favoured', 'Favoured by the Gods', 100, 'Win with a Celestial Champion.'),
  A('decanus', 'Decanus', 50, 'Raise a dino to level 10.'),
  A('firstAnniversary', 'First Anniversary', 100, 'Win a battle with no techniques equipped.', true),
  A('secondAnniversary', 'Second Anniversary', 100, 'Beat a foe after blinding it, tearing its harness and stunning it.', true),
  A('stillStanding', 'Still Standing', 100, 'Own a dino carrying all six kinds of permanent wound.', true),
  A('completionist', 'Completionist', 100, 'Unlock every influence opportunity in a run.', true),
  A('silverLegend', 'Silver Legend', 50, 'Reach the Silver Legends tier.', true),
  A('goldLegend', 'Gold Legend', 50, 'Reach the Gold Legends tier.', true),
  A('diamondLegend', 'Diamond Legend', 50, 'Reach the Diamond Legends tier.', true),
  // breeding (Jurassic Ludus)
  A('firstClutch', 'First Clutch', 50, 'Hatch your first bred dino.'),
  A('mutant', 'Mutant', 100, 'Breed a dino with a mutation.'),
  A('tripleMutation', 'Triple Helix', 100, 'Breed a dino with three mutations at once.', true),
  A('fullImprint', 'Imprinted', 100, 'Raise a dino to adulthood with 100% imprint.'),
  A('dynasty', 'Dynasty', 100, 'Breed a fifth-generation dino.'),
  A('twins', 'Double Trouble', 50, 'Have twins (or triplets) born in your ludus.'),
  A('apexBloodline', 'Apex Bloodline', 100, 'Breed a creature with 40 wild points in one stat.'),
  A('breeder', 'Breeder', 50, 'Hatch 10 creatures in one run.'),
];

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = Object.fromEntries(LIST.map((a) => [a.id, a])) as Record<AchievementId, AchievementDef>;

export const ACHIEVEMENT_IDS = LIST.map((a) => a.id);

/** Sandbox-safe achievement push (use this instead of util.achieve where possible). */
export function unlockAchievement(state: GameState, id: AchievementId): void {
  if (state.world.difficulty.sandbox) return;
  achieve(state, id);
}

/** Hard / Nightmare variants granted together with a base achievement. */
const VARIANTS: Partial<Record<AchievementId, { hard?: AchievementId; nightmare?: AchievementId }>> = {
  wonTournament: { hard: 'wonTournamentHard', nightmare: 'wonTournamentNightmare' },
  adventurer: { hard: 'adventurerHard', nightmare: 'adventurerNightmare' },
  colossusSlayer: { hard: 'colossusSlayerHard' },
};

const MASTER = 150;
const MASTER_FAMILIES: WeaponFamily[] = ['claw', 'fang', 'horn', 'mace', 'spit', 'jaw'];
/** The six GM wound kinds (partial blindness and blindness are one kind). */
const WOUND_KINDS: TraitId[][] = [['HorribleDisfigurement'], ['PartiallyBlind', 'Blind'], ['BumLeg'], ['Crippled'], ['MissingFingers'], ['Concussion']];
const LEAGUES: LeagueId[] = ['lunar', 'solar', 'bacchus', 'jupiter', 'vulcan', 'annum'];

function sweptLeague(state: GameState, league: LeagueId): boolean {
  const byWeek = new Map<number, Set<number>>();
  for (const t of state.player.ludus.trophies) {
    if (t.league !== league) continue;
    const s = byWeek.get(t.week) ?? new Set<number>();
    s.add(t.place);
    byWeek.set(t.week, s);
  }
  for (const s of byWeek.values()) if (s.has(1) && s.has(2) && s.has(3)) return true;
  return false;
}

function hasWoundKinds(c: Creature): boolean {
  return WOUND_KINDS.every((kind) => kind.some((t) => c.traits.includes(t)));
}

/** Weekly checks (GM checkAchievements) pushing into state.pendingAchievements. */
export function checkAchievements(state: GameState): void {
  if (state.world.difficulty.sandbox) {
    state.pendingAchievements.length = 0;
    return;
  }
  const p = state.player;
  const me = p.ludus;
  const d = state.world.difficulty;
  const give = (id: AchievementId, cond: boolean) => { if (cond) achieve(state, id); };
  const cs = me.creatures;

  give('influencer', me.influence > 100);
  give('influencerHard', d.hard && me.influence > 100);
  give('influencerNightmare', d.nightmare && me.influence > 1000);
  give('greedIsGood', me.denarii >= 2000);
  give('famous', cs.some((c) => c.fame > 100));
  give('peopleManager', cs.length >= 5 && cs.every((c) => c.loyalty >= 80));
  give('decanus', cs.some((c) => c.level >= 10));
  give('masterOfOne', cs.some((c) => c.kind === 'dino' && !!c.cls && classProficiency(c) >= 100));
  give('builder', me.buildings.residence > 2 && me.buildings.trainingField > 1);
  give('weaponsMasterAch', cs.some((c) => MASTER_FAMILIES.every((f) => (c.prof?.[f] ?? 0) >= MASTER)));
  give('stillStanding', cs.some(hasWoundKinds));
  give('winSenateElections', p.senator);
  give('eliminateOpponent', state.rivals.some((r) => !!r.defeated));
  const firsts = new Set(me.trophies.filter((t) => t.place === 1).map((t) => t.league));
  give('lunarChampion', firsts.has('lunar'));
  give('solarChampion', firsts.has('solar'));
  give('leagueDomination', LEAGUES.every((l) => firsts.has(l)));
  give('leagueSweep', sweptLeague(state, 'lunar') && sweptLeague(state, 'solar'));
  give('legendsChampion', p.invaderWins > 0 || me.championTier >= 1);
  give('silverLegend', me.championTier >= 2);
  give('goldLegend', me.championTier >= 3);
  give('diamondLegend', me.championTier >= 4);
  give('ascension', !!state.ascended);
  // Pythia chain (objectives)
  const obj = (id: string) => p.objectives.find((o) => o.id === id);
  give('conduitOfTheGods', !!obj('pythia4')?.done);
  give('prophecy', !!obj('godsChosen')?.done);
  // breeding fall-backs (breeding.ts pushes most of these as they happen)
  const bred = cs.filter((c) => c.genes.bred);
  give('firstClutch', state.runStats.hatched > 0);
  give('mutant', state.runStats.mutations > 0 || bred.some((c) => c.genes.mutations.length > 0));
  give('tripleMutation', bred.some((c) => c.genes.mutations.length >= 3));
  give('fullImprint', bred.some((c) => c.maturity >= 1 && c.genes.imprint >= 0.999));
  give('dynasty', state.runStats.maxGeneration >= 5 || bred.some((c) => c.genes.generation >= 5));
  give('breeder', state.runStats.hatched >= 10 || (p.counters.hatched ?? 0) >= 10);
  give('apexBloodline', bred.some((c) => c.genes.wild.str >= 40 || c.genes.wild.agi >= 40 || c.genes.wild.cun >= 40 || c.genes.wild.hp >= 40));
  // every influence opportunity of this run's tree
  let tree: string[] = [];
  try {
    tree = treeFor(state).flat().map((o) => o.id);
  } catch {
    tree = [];
  }
  give('completionist', tree.length > 0 && tree.every((id) => p.opportunities.includes(id as never)));

  addDifficultyVariants(state);
}

/** Add the Hard / Nightmare variants of base achievements earned this session. */
export function addDifficultyVariants(state: GameState): void {
  if (state.world.difficulty.sandbox) return;
  const key = difficultyKey(state);
  if (key === 'normal') return;
  for (const id of [...state.pendingAchievements]) {
    const v = VARIANTS[id];
    if (!v) continue;
    if (v.hard) achieve(state, v.hard);
    if (key === 'nightmare' && v.nightmare) achieve(state, v.nightmare);
  }
}

/**
 * Move this session's pending achievements into the account: new ones are recorded and pay their Amber.
 * Returns the newly earned achievements (for toasts). Sandbox games never grant anything.
 */
export function grantAchievements(meta: Meta, state: GameState): AchievementId[] {
  if (state.world.difficulty.sandbox) {
    state.pendingAchievements.length = 0;
    return [];
  }
  addDifficultyVariants(state);
  const out: AchievementId[] = [];
  for (const id of state.pendingAchievements) {
    if (meta.achievements.includes(id) || !ACHIEVEMENTS[id]) continue;
    // GM: the Nightmare Divine needs Divine (hard) first
    if (id === 'divineNightmare' && !meta.achievements.includes('divineHard') && !state.pendingAchievements.includes('divineHard')) continue;
    meta.achievements.push(id);
    meta.amber = (meta.amber ?? 0) + ACHIEVEMENTS[id].amber;
    out.push(id);
  }
  state.pendingAchievements.length = 0;
  return out;
}

/** Amber an account has earned from achievements so far. */
export function amberEarned(meta: Meta): number {
  return meta.achievements.reduce((s, id) => s + (ACHIEVEMENTS[id]?.amber ?? 0), 0);
}
