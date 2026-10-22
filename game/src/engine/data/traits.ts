// Trait catalogue (GM 03-loop-progression §4), dino-flavoured names.
// stats: permanent change applied once when gained. inj: injury-proneness. loy: weekly tameness drift.

import type { TraitDef, TraitId, TraitPolarity, TraitSource, Stats } from '../types';

type F = { tech?: number; heritable?: boolean; reinc?: boolean; beast?: boolean; wound?: boolean };

function tr(
  id: TraitId, name: string, polarity: TraitPolarity, stats: Partial<Stats>, injury: number, loyalty: number,
  desc: string, sources: TraitSource[], f: F = {},
): TraitDef {
  return {
    id, name, polarity, stats, injury, loyalty, desc, sources,
    techPoint: f.tech, heritable: f.heritable, reincarnationValid: f.reinc, beastOnly: f.beast, wound: f.wound,
  };
}

const H = { heritable: true, reinc: true };
const R = { reinc: true };

const LIST: TraitDef[] = [
  tr('Strong', 'Strong', '+', { str: 1 }, 0, 0, 'Powerful jaws.', ['R'], H),
  tr('Underdog', 'Underdog', '±', { agi: 1, cun: 1, str: -1 }, 0, 0, 'Small for its kind; fans of the established dislike it.', ['R'], H),
  tr('Sneaky', 'Sneaky', '+', { agi: 1, cun: 1 }, 0, -1, 'Good at intrigue.', ['R', 'W'], R),
  tr('Untrustworthy', 'Untrustworthy', '±', { cun: 2 }, 0, -1, 'Easily swayed by rivals; good at intrigue.', ['R'], R),
  tr('Veteran', 'Veteran', '+', { str: 1 }, 0, 0, 'Took a spear to the knee once.', ['R', 'E'], R),
  tr('Fanatic', 'Fanatic', '±', { hp: 10, agi: 1, str: 1 }, 1, 1, 'Pushes itself too far.', ['R'], H),
  tr('Giant', 'Giant', '±', { hp: 5, agi: -2, str: 2 }, 0, 0, 'Enormous even for its species.', ['R'], H),
  tr('Talented', 'Talented', '+', { agi: 1 }, 0, 0, 'Learns an extra technique.', ['R'], { tech: 1, heritable: true, reinc: true }),
  tr('TrueGrit', 'True Grit', '+', { hp: 5 }, -1, 0, 'Fights on through short incapacitating injuries.', ['R'], H),
  tr('ExoticFightingStyle', 'Exotic Fighting Style', '+', { agi: 1, cun: 1 }, 0, 0, 'Hard to defend against.', ['R', 'W'], R),
  tr('MasterHorseman', "Rider's Bond", '+', { agi: 1 }, 0, 0, 'Doubles the rider\'s strength and block bonus.', ['R'], R),
  tr('ManOfGlass', 'Glass Bones', '±', { hp: -5, agi: 4, cun: 2 }, 1, 0, 'Fast and clever, but fragile.', ['R'], H),
  tr('Preparation', 'Preparation', '+', { cun: 1 }, 0, -1, 'Blocks the first 10 damage of a battle.', ['R', 'W'], R),
  tr('Loyal', 'Loyal', '+', { hp: 5 }, 0, 1, 'Devoted to its keepers.', ['R'], H),
  tr('Tough', 'Tough', '±', { hp: 5, agi: -2, str: 1 }, 0, 0, 'Shrugs off light wounds (+1 armor, +1 damage resist).', ['R'], H),
  tr('Fury', 'Fury', '±', { hp: 5, cun: -2, str: 2 }, 0, 0, 'All rage, no thought.', ['R'], H),
  tr('Temperamental', 'Temperamental', '±', { agi: 1, str: 2 }, 0, 0, 'Easily enraged by dirty tricks.', ['R'], H),
  tr('Inspiring', 'Inspiring', '+', { hp: 5, cun: 1 }, 0, -1, 'Inspires its pack; pulls their tameness toward its own.', ['R'], R),
  tr('Tactician', 'Tactician', '+', { cun: 1 }, 0, 0, 'Reads the fight.', ['R', 'W'], R),
  tr('QuickStudy', 'Quick Study', '+', { cun: 1 }, 0, 0, '+25% training and battle XP.', ['W'], R),
  tr('BeastTamer', 'Beast Tamer', '+', { cun: 2 }, 0, 0, 'Grows tougher every time a beast hits it.', ['C'], R),
  tr('Bestiarii', 'Beast Hunter', '+', { cun: 1 }, 0, 0, '+30% damage against beasts.', ['C']),
  tr('Conditioning', 'Conditioning', '+', { hp: 5, agi: 1 }, 0, 0, 'Tireless.', ['C']),
  tr('OneManArmy', 'One-Dino Army', '+', { hp: 5, str: 1 }, 0, 0, 'Pumped up when outnumbered.', ['L', 'E']),
  tr('Hero', 'Hero', '+', { agi: 1, cun: 1, str: 1 }, 0, 0, 'Saved the day.', ['E']),
  tr('RebelSlayer', 'Horde Slayer', '+', { hp: 5, str: 1 }, 0, 0, 'Has crushed the Wild Horde.', ['E']),
  tr('Pyromaniac', 'Pyromaniac', '±', { agi: 1, cun: 1 }, 0, -2, 'Loves knocking over braziers. Burns buildings.', ['E']),
  tr('DualWield', 'Dual Wield', '+', { agi: 1 }, 0, 0, 'Reduced penalty for tail and fang off-hand weapons.', ['W', 'C'], R),
  tr('PoisonMaster', 'Venomous', '+', { cun: 1 }, 0, 0, 'Poison hits 50% harder; skilled poisoner.', ['E'], R),
  tr('LostFamily', 'Lost Clutch', '±', { agi: 1, cun: 1, str: 1 }, 0, -4, 'Its clutch was smashed. It remembers.', ['E']),
  tr('Mithridatism', 'Venom Immunity', '+', { cun: 1 }, 0, 0, 'Resists poison.', ['E']),
  tr('Assassin', 'Assassin', '+', { agi: 1 }, 0, 0, 'Assassination bonus.', ['E']),
  tr('SuddenDeath', 'Sudden Death', '+', { agi: 1 }, 0, 0, 'Has killed with a single blow.', ['T']),
  tr('Killer', 'Killer', '+', { str: 1 }, 0, 0, 'Has killed in the arena.', ['T']),
  tr('ArenaChampion', 'Arena Champion', '+', { agi: 1, cun: 1, str: 1 }, 0, 0, 'Won an above-ground tournament. Barred from rookie events.', ['T']),
  tr('PitFighter', 'Pit Fighter', '+', { hp: 5, cun: 1 }, 0, 0, 'Survived the underground pits.', ['T']),
  tr('PitChampion', 'Pit Champion', '+', { hp: 5, agi: 1, cun: 2 }, 0, 0, 'Champion of the pits.', ['T']),
  tr('ColossusSlayer', 'Giant Slayer', '+', { cun: 1 }, 0, 0, '+30% damage against giants.', ['T']),
  tr('PitLegend', 'Pit Legend', '+', { hp: 10, agi: 2, cun: 2, str: 1 }, 0, 0, 'A legend of the pits.', ['T']),
  tr('BaneOfTigris', 'Bane of Tigris', '+', { str: 2 }, 0, 0, 'Beat Tigris.', ['T']),
  tr('WorldChampion', 'World Champion', '+', { hp: 5, agi: 1, cun: 1, str: 1 }, 0, 0, 'Won a Legends tournament.', ['T']),
  tr('ReunitedWithFamily', 'Reunited', '+', { hp: 5 }, 0, 1, 'Reunited with its clutch-mates.', ['E']),
  tr('RevoltLeader', 'Breakout Leader', '±', { hp: 5, agi: 1, cun: 1, str: 1 }, 0, -4, 'Led a breakout.', ['E']),
  tr('Lawbringer', 'Lawbringer', '+', { agi: 1, str: 1 }, 0, 0, 'Enforces order.', ['E']),
  tr('ShowMan', 'Showman', '+', { cun: 1 }, 0, 0, 'The crowd adores it; wins close calls.', ['E']),
  tr('Enforcer', 'Enforcer', '+', { str: 1 }, 0, 0, 'Muscle for hire.', ['E']),
  tr('Doctore', 'Pack Mentor', '+', { cun: 1 }, 0, 0, '+50% doctore training power.', ['C']),
  tr('Adopted', 'Bonded', '+', { hp: 5 }, 0, 1, 'Personally bonded to the lanista.', ['E']),
  tr('FirstBlood', 'First Blood', '+', { agi: 1 }, 0, 0, 'Won a rookie tournament.', ['T']),
  tr('RebelLeader', 'Horde Leader', '-', { hp: 5, agi: 1, cun: 1, str: 1 }, 0, -5, 'Leads the Wild Horde.', ['E']),
  tr('LunarChampion', 'Lunar Champion', '+', { hp: 5, agi: 1 }, 0, 0, 'Lunar League winner.', ['T']),
  tr('Mythical', 'Mythical', '+', { hp: 5 }, 0, 0, 'Hard to destroy; +1 favour, +2 armor, causes fear.', ['L'], R),
  tr('HorribleDisfigurement', 'Horribly Disfigured', '±', {}, 0, 0, 'Causes fear.', ['I'], { wound: true, reinc: true }),
  tr('PartiallyBlind', 'Half-Blind', '-', { agi: -1 }, 0, 0, 'Lost an eye.', ['I'], { wound: true }),
  tr('Blind', 'Blind', '-', { agi: -2 }, 0, 0, 'Fights blind.', ['I'], { wound: true }),
  tr('BumLeg', 'Bum Leg', '-', { agi: -4, str: -2 }, 0, 0, 'A crippled leg.', ['I'], { wound: true }),
  tr('Crippled', 'Crippled', '-', { agi: -5, str: -5 }, 0, 0, 'Badly crippled.', ['I'], { wound: true }),
  tr('Anemic', 'Anemic', '-', { agi: -1, str: -2 }, 1, 0, 'Drained by the Dark Fangs.', ['E']),
  tr('MissingFingers', 'Broken Claws', '-', { agi: -1, str: -1 }, 0, 0, 'Lost claws.', ['I'], { wound: true }),
  tr('Concussion', 'Concussion', '-', { agi: -1, cun: -3 }, 0, 0, 'Took one too many headbutts.', ['I'], { wound: true }),
  tr('DemandingFreedom', 'Restless', '-', { cun: 1 }, 0, -8, 'Demands to be released.', ['E']),
  tr('AllIn', 'All In', '+', { str: 1 }, 0, 0, 'Fights with everything: two-handed damage and accuracy.', ['W'], R),
  tr('Ambidextrous', 'Ambidextrous', '+', { agi: 1 }, 0, 0, 'Accurate off-hand attacks.', ['C'], R),
  tr('LightningSpeed', 'Lightning Speed', '+', { agi: 2 }, 0, 0, '+5 hit and +5 dodge.', ['C'], H),
  tr('Hunter', 'Hunter', '+', { agi: 1, cun: 1 }, 0, 0, 'A born hunter.', ['E'], R),
  tr('SurvivalOfTheFittest', 'Survival of the Fittest', '+', { hp: 5, agi: 1 }, -1, 0, 'Hardened by the wild.', ['B'], { beast: true }),
  tr('ForceOfNature', 'Force of Nature', '+', { agi: 1, cun: 1, str: 1 }, 0, 0, 'Raw nature.', ['B'], { tech: 1, beast: true }),
  tr('FeralIntelligence', 'Feral Intelligence', '+', { cun: 2 }, 0, 0, 'Disturbingly clever.', ['B']),
  tr('AnimalInstinct', 'Animal Instinct', '+', { agi: 1, cun: 1 }, 0, 0, 'Senses danger.', ['B']),
  tr('SharpenedClaws', 'Sharpened Claws', '+', { str: 1 }, 0, 0, 'Halves the target\'s armor.', ['B'], H),
  tr('SelfPreservation', 'Self Preservation', '±', { hp: 5, cun: -1, str: -1 }, 0, 0, 'Blocks the first 10 damage.', ['B']),
  tr('BestiaSummum', 'Bestia Summum', '+', { hp: 5, agi: 1, cun: 1, str: 1 }, 0, 0, '+30% damage against dinos.', ['B'], { beast: true }),
  tr('Alpha', 'Alpha', '±', { hp: 5, str: 1 }, 0, 0, 'Two untamed alphas in one ludus will fight.', ['B'], { heritable: true }),
  tr('ThickHide', 'Thick Hide', '+', { hp: 5 }, 0, 0, '+1 armor, +1 damage resistance.', ['B'], { heritable: true }),
  tr('SolarChampion', 'Solar Champion', '+', { cun: 1, str: 1 }, 0, 0, 'Solar League winner.', ['T']),
  tr('BacchusChampion', 'Bacchus Champion', '+', { hp: 5, agi: -1, cun: 2 }, 0, 0, 'Bacchus League winner.', ['T']),
  tr('JupiterChampion', 'Jupiter Champion', '+', { agi: 1, cun: 1, str: 1 }, 0, 0, 'Jupiter League winner.', ['T']),
  tr('VulcanChampion', 'Vulcan Champion', '+', { hp: 5, str: 1 }, 0, 0, 'Vulcan League winner.', ['T']),
  tr('AnnumChampion', 'Annum Champion', '+', { agi: 1, cun: 1 }, 0, 0, 'Annum League winner.', ['T']),
  tr('EquesSlayer', 'Rider Slayer', '+', { agi: 1 }, 0, 0, '+30% damage against ridden foes.', ['W'], R),
  tr('Psychopath', 'Deranged', '±', { hp: 10, agi: 2, cun: 2, str: 1 }, 0, -5, 'Demoralises its own pack.', ['E']),
  tr('RebelGeneral', 'Horde Warlord', '-', { hp: 20, agi: 2, cun: 3, str: 2 }, 0, -8, 'Warlord of the Wild Horde.', ['E']),
  tr('PlottingUprising', 'Plotting Breakout', '-', { hp: 5, cun: 1 }, 0, -10, 'Plotting a mass breakout.', ['E']),
  tr('Titan', 'Titan', '±', { hp: 10, agi: -2, str: 4 }, 0, 0, 'Takes less damage from giant slayers.', ['L']),
  tr('Ascended', 'Ascended', '+', { hp: 5, agi: 2, str: 2 }, 0, -2, 'Defeated the gods\' champions.', ['T']),
  tr('Reincarnated', 'Reincarnated', '+', { hp: 5, agi: 2, str: 2 }, 0, 1, 'Reborn through Ascension.', ['X']),
  tr('RaisedInTheArena', 'Raised in the Arena', '+', { hp: 5, agi: 1, cun: 1, str: 2 }, 0, 1, 'Won the Hatchling Games.', ['T']),
  tr('Thief', 'Thief', '±', { agi: 2, cun: 1 }, 0, -2, 'Steals shiny things.', ['E']),
  tr('Underhanded', 'Underhanded', '±', { cun: 2 }, 0, -2, 'Fights dirty.', ['L', 'T']),
  tr('Impact', 'Impact', '+', { str: 2 }, 0, 0, 'Hits so hard victims are hurt worse.', ['T']),
  tr('Carnivorous', 'Bloodthirsty', '+', { agi: 1, str: 1 }, 0, 0, 'Heals 30% of damage dealt.', ['B']),
  tr('Indomitable', 'Indomitable', '+', { hp: 5, str: 1 }, 0, 0, 'Resists effects and damage before it first attacks.', ['W', 'C'], R),
  tr('ApolloBlessing', "Apollo's Blessing", '±', { hp: 5, cun: 1 }, 0, -2, 'Blessed by Apollo (+1 favour).', ['E'], R),
  tr('GoodBoy', 'Good Boy', '+', { hp: 5, cun: 1 }, 0, 0, 'Spoiled with treats.', ['B'], { beast: true }),
  tr('BestBoy', 'Best Boy', '+', { hp: 10, agi: 2, cun: 2, str: 2 }, 0, 0, 'The very best.', ['B'], { beast: true }),
  tr('Alert', 'Alert', '+', { agi: 1, cun: 1 }, 0, 0, 'Resists poison and assassins; strikes first.', ['W'], H),
  tr('Albino', 'Albino', '-', { cun: 1 }, 0, 0, 'Pale and light-shy: easy to blind and trick.', ['L'], H),
  tr('GlorySeeker', 'Glory Seeker', '±', { str: 1 }, 0, 1, '+fame from wins; asks for release later.', ['X'], R),
  tr('Agile', 'Agile', '±', { agi: 2, str: -1 }, 0, 0, '+1 armor when not in heavy barding.', ['X'], H),
  tr('Arrogant', 'Arrogant', '-', { agi: -2, cun: -1 }, 0, -2, 'Half training XP.', ['E']),
  tr('BladeWhisperer', 'Claw Whisperer', '+', { agi: 1 }, 0, 0, 'Never misses with claws.', ['C']),
  tr('AxialMomentum', 'Momentum', '+', { str: 1 }, 0, 0, 'Maces add stun and rend power.', ['C']),
  tr('PiercingPrecision', 'Piercing Precision', '+', { cun: 1 }, 0, 0, '+10 accuracy with horns and spines.', ['C']),
  tr('ShadowBlade', 'Shadow Fang', '+', { agi: 1 }, 0, 0, 'Fang crits deal +3 damage.', ['C']),
  tr('DeafeningCrackle', 'Deafening Crack', '+', { agi: 2, cun: 1, str: 2 }, 0, 0, 'Whip cracks frighten afflicted foes.', ['C']),
  tr('FistsOfSteel', 'Iron Jaw', '+', { str: 3 }, 0, 0, 'Bare-jawed hits weaken the target.', ['C']),
  tr('Freedom', 'Released', '+', { hp: 5, cun: 1 }, 0, 2, 'Was released and came back.', ['E']),
  tr('PoisonedClaws', 'Poisoned Claws', '+', { agi: 1 }, 0, 0, 'Every hit poisons.', ['B']),
  tr('Undeath', 'Undeath', '±', { hp: 10, agi: -2, cun: -3 }, 0, 2, 'Returned from Pluto\'s realm.', ['E']),
  tr('Marksman', 'Marksman', '+', { agi: 1, cun: 1 }, 0, 0, 'Accurate opening volley.', ['C'], R),
  tr('Devotion', 'Devotion', '+', { hp: 10, str: 1 }, 0, 2, 'Blessed by the gods (+1 favour).', ['L', 'E'], R),
  tr('BlindFighter', 'Blind Mastery', '+', { agi: 1, cun: 1 }, 0, 0, 'Fights well blinded.', ['T'], R),
  tr('Hoplite', 'Hoplite', '+', { hp: 5, str: 1 }, 0, 0, 'Horn mastery; braces the whole pack.', ['E'], R),
  tr('LordOfCinders', 'Lord of Cinders', '+', { hp: 10, agi: 1, cun: 1, str: 1 }, -1, 0, 'Won the Solar League twice.', ['T'], { tech: 1 }),
  tr('TitanicStrength', 'Titanic Strength', '+', { agi: -2, str: 4 }, 0, 0, 'Wields two-handed weapons with a free off-hand.', ['W']),
  tr('Adventurous', 'Adventurous', '+', { hp: 5, cun: 1 }, 0, 0, 'Resists fear.', ['E']),
  tr('Recaptured', 'Recaptured', '+', { cun: 1 }, 0, 2, 'Brought back from the Horde.', ['E']),
  tr('Ruthless', 'Ruthless', '±', { cun: 1, str: 2 }, 0, -1, 'Shows no mercy.', ['E'], R),
  tr('SpartanResolve', 'Spartan Resolve', '+', { hp: 5, agi: 1 }, 0, 0, 'Never surrenders.', ['L'], R),
  tr('LifeBringer', 'Life Bringer', '+', { hp: 5, cun: 1 }, 0, 1, 'Hatched the Mysterious Egg.', ['E']),
  tr('Bloodstarved', 'Bloodstarved', '-', { agi: -2, str: -4 }, 2, 0, 'Drained near death by the Dark Fangs.', ['E']),
  tr('Pugilist', 'Bare-Jaw Brawler', '+', { hp: 5, agi: 1, str: 1 }, 0, 0, 'Pierces armor with bare jaws.', ['W'], R),
  tr('PankrationChampion', 'Primal Champion', '+', { hp: 5, agi: 1 }, 0, 0, 'Won a Primal Bout.', ['T']),
  tr('CelestialChampion', 'Celestial Champion', '+', { hp: 5, str: 1 }, 0, 0, '+1 favour.', ['T']),
  tr('Careful', 'Careful', '±', { hp: 5, agi: -1, cun: 2 }, 0, 1, 'Fewer injuries, slower training.', ['E'], R),
  tr('Paranoid', 'Paranoid', '±', { hp: -5, agi: 1 }, 0, -1, 'Good at sensing intrigue.', ['E'], R),
  tr('ManyHeads', 'Many Heads', '+', { hp: 50 }, 0, 0, 'Grows heads as it is hurt.', ['B'], { beast: true }),
  tr('Lycanthropy', 'Moon Frenzy', '±', { hp: 10, cun: -1 }, 0, 0, 'At the full moon it becomes a berserk alpha. Kills keepers.', ['E'], H),
  tr('HerculeanStrength', 'Herculean Strength', '+', { hp: 10, agi: 1, cun: 1, str: 4 }, 0, 0, 'Strength of Hercules.', ['E']),
  tr('Cataphractoi', 'Armored Charger', '+', { hp: 5, agi: -1, str: 2 }, 0, 0, 'Heavy cavalry instincts.', ['T'], R),
  tr('Deadeye', 'Deadeye', '+', { agi: 1, cun: 1 }, 0, 0, 'Reach adds to accuracy.', ['W'], R),
  tr('ExplosiveRelease', 'Power Throw', '+', { str: 1 }, 0, 0, 'Spine darts fly harder.', ['T'], R),
  tr('Intangible', 'Intangible', '±', { agi: 2 }, -2, -2, 'Can only be hit after attacking.', ['B']),
  tr('ReincarnatedBeast', 'Reincarnated', '+', { hp: 5, agi: 1, cun: 1, str: 1 }, 0, 0, 'Reborn through Ascension.', ['X'], { beast: true }),
  tr('ColdBlooded', 'Cold-Blooded', '+', { hp: 5, agi: -1, cun: 1 }, 0, 0, 'Resists fear.', ['B'], { heritable: true }),
  tr('ManEater', 'Man-Eater', '+', { agi: 1, str: 1 }, 0, 0, 'Has tasted human flesh.', ['B']),
  tr('Duelist', 'Duelist', '+', { agi: 1, cun: 1 }, 0, 0, 'Excels one on one.', ['T']),
  tr('Flying', 'Flying', '±', { hp: -5, agi: 1 }, 0, 0, 'Harder to hit.', ['B'], R),
  tr('Escaped', 'Escaped', '±', {}, 0, 0, 'Broke out of a ludus.', ['E']),
  // breeding additions
  tr('Fertile', 'Fertile', '+', {}, 0, 0, 'Mating cooldown halved; twins more likely.', ['R'], { heritable: true }),
  tr('Sterile', 'Sterile', '-', {}, 0, 0, 'Cannot breed.', ['R'], { heritable: true }),
  tr('Runt', 'Runt', '-', { hp: -5, str: -1 }, 1, 0, 'The weakest of its clutch.', ['R'], { heritable: true }),
  tr('Hatchling', 'Ludus-Hatched', '+', { cun: 1 }, 0, 1, 'Hatched and raised in your ludus.', ['X']),
];

export const TRAITS: Record<TraitId, TraitDef> = Object.fromEntries(LIST.map((t) => [t.id, t])) as Record<TraitId, TraitDef>;

/** GM: random generation draws from the first 19 trait types. */
export const RANDOM_TRAITS: TraitId[] = ['Strong', 'Underdog', 'Sneaky', 'Untrustworthy', 'Veteran', 'Fanatic', 'Giant',
  'Talented', 'TrueGrit', 'ExoticFightingStyle', 'MasterHorseman', 'ManOfGlass', 'Preparation', 'Loyal', 'Tough', 'Fury',
  'Temperamental', 'Inspiring', 'Tactician'];

/** GM weekly learnable trait pool. */
export const WEEKLY_TRAITS: TraitId[] = ['ExoticFightingStyle', 'Preparation', 'Alert', 'Indomitable', 'Sneaky',
  'DualWield', 'AllIn', 'Tactician', 'EquesSlayer', 'QuickStudy', 'Pugilist', 'Deadeye'];

export const WOUND_TRAITS: TraitId[] = ['HorribleDisfigurement', 'PartiallyBlind', 'Blind', 'BumLeg', 'Crippled',
  'MissingFingers', 'Concussion'];

export const CHAMPION_TRAITS: TraitId[] = ['LunarChampion', 'SolarChampion', 'JupiterChampion', 'VulcanChampion',
  'BacchusChampion', 'AnnumChampion', 'LifeBringer', 'WorldChampion'];

/** Tome of Traits (Bestiary Scroll) lists. */
export const TOME_STR: TraitId[] = ['Strong', 'Fury', 'AllIn', 'Tough', 'Indomitable', 'Ruthless'];
export const TOME_AGI: TraitId[] = ['Agile', 'LightningSpeed', 'Alert', 'Deadeye', 'Ambidextrous', 'DualWield'];
export const TOME_CUN: TraitId[] = ['Tactician', 'QuickStudy', 'Sneaky', 'ExoticFightingStyle', 'Preparation', 'Inspiring'];

export function trait(id: TraitId): TraitDef {
  return TRAITS[id];
}
