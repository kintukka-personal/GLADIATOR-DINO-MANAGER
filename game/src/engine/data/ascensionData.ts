// Ascension data (GM 03 §8): the 16 god levels, the bonus-round gauntlet and the gods' champions, as dinos.
// GM stat lines are written in GM order STR / CUN / HP / INI (INI = our AGI) and converted with `gm()`.

import type { ClassId, Gear, GearSlot, GearTypeId, Instruction, Quality, SpeciesId, Stats, TechId, TraitId } from '../types';

export interface AscensionLevelData { level: number; name: string; god: string; summary: string[] }

export const ASCENSION_LEVEL_DATA: AscensionLevelData[] = [
  { level: 1, name: 'Wealth of Saturn', god: 'Saturn', summary: [
    'Rival houses start richer: +1000 denarii, a weapon harness and a keeper each.',
    'Your weekly income is 5 denarii lower, and your dinos age twice as fast.',
    'Week 30: Cronus, chosen of Saturn, a Giganotosaurus, joins the smallest rival house.',
  ] },
  { level: 2, name: 'Vulcan\'s Forging Destiny', god: 'Vulcan', summary: [
    'Rivals start in Legion Barding and are re-armed throughout the run; they build forges.',
    'Buying from rival houses costs more.',
    'Week 60: Hephaestus, chosen of Vulcan, an Ankylosaurus Titan, joins the Wild Horde.',
  ] },
  { level: 3, name: 'Prowess of Sol', god: 'Sol', summary: [
    'Rival and Horde dinos train harder: +30 XP every week.',
    'Influence opportunities cost more, Senate armies march later and adventures are harder.',
  ] },
  { level: 4, name: 'Wrath of Neptune', god: 'Neptune', summary: [
    'Floods and droughts strike Capua; expeditions face worse weather.',
    'Week 85: Poseidon, chosen of Neptune, a Spinosaurus Titan, joins the strongest rival.',
  ] },
  { level: 5, name: 'Wisdom of Minerva', god: 'Minerva', summary: [
    'Cheating and intrigue will be harder; bribes, cheats and market dinos cost more.',
    'Rival dinos start with extra weapon proficiency.',
  ] },
  { level: 6, name: 'Desire of Venus', god: 'Venus', summary: [
    'Tameness falls every week, and you lose 1 influence every 3 weeks.',
    'Rivals may sabotage and rob you; buildings cost more; elections are harder.',
  ] },
  { level: 7, name: 'Diana\'s Hunt', god: 'Diana', summary: [
    'Rivals field beasts (Decimus brings a Gigantopithecus called Harambe) and feed them well.',
    'Every enemy beast you meet is stronger.',
  ] },
  { level: 8, name: 'Pluto\'s Killing', god: 'Pluto', summary: [
    'Plague comes to Capua; surgery and injuries are deadlier.',
    'Early in the run your most famous dino is struck by a disfiguring disease.',
  ] },
  { level: 9, name: 'Judgement of Jupiter', god: 'Jupiter', summary: [
    'You lose 1 influence every week; your training is weaker; keepers are scarcer and dearer.',
    'Week 48: Jove, chosen of Jupiter, a Tyrannosaurus, joins a rival. The Horde gains rogues every 6 weeks.',
  ] },
  { level: 10, name: 'Vitality of Juno', god: 'Juno', summary: [
    'Tameness falls faster; buildings and dinos cost more.',
    'A rival digs up the Life Drinker fangs.',
  ] },
  { level: 11, name: 'Violence of Mars', god: 'Mars', summary: [
    'The Ascension tournament needs 5 trophies; your intrigue and expeditions are harder.',
    'Rival dinos keep gaining traits. Week 18: Ares, chosen of Mars, an Allosaurus, joins a rival.',
  ] },
  { level: 12, name: 'Apollo\'s Prophecy', god: 'Apollo', summary: [
    'The last of the Roman gods: warnings of rival intrigue reach you only half the time; rivals cheat more.',
    'Magnus fields Sagittarius, a spitting Dilophosaurus, and rival dinos grow more cunning.',
  ] },
  { level: 13, name: 'Creation of Gaia', god: 'Gaia', summary: [
    'The Titans stir: harpies join Magnus and Solonius, and a Minotaur joins a rival in week 26.',
    'Keepers are rarer and pricier; the gods\' champions are stronger.',
  ] },
  { level: 14, name: 'Hyperion\'s Heights', god: 'Hyperion', summary: [
    'Three Hyperion tournaments offer a Mysterious Egg as their prize.',
    'Decimus fields Icarus, a winged Dilophosaurus; trade prices rise.',
  ] },
  { level: 15, name: 'Depths of Tartarus', god: 'Tartarus', summary: [
    'Pontius and Faust are touched by the Moon Frenzy; Draugluin, an Alpha Dire Wolf, joins a rival in week 33.',
    'Horrors from the underworld crawl out of the pits every 20 weeks.',
  ] },
  { level: 16, name: 'Reaping of Cronus', god: 'Cronus', summary: [
    'Curse of Time: your techniques start every battle on cooldown.',
    'Week 13: Hannibal\'s ludus opens. Week 20: Perseus is swung forward in time to join a rival.',
  ] },
];

/** GM stat order (STR, CUN, HP, INI) → our Stats. */
export const gm = (str: number, cun: number, hp: number, ini: number): Stats => ({ str, agi: ini, cun, hp });

export interface GearSpec { type: GearTypeId; q: Quality; extra?: Partial<Gear>; slot?: GearSlot }
export interface FoeSpec {
  name: string;
  species: SpeciesId;
  stats: Stats;
  level: number;
  traits?: TraitId[];
  techniques?: [TechId, number][];
  gear?: GearSpec[];
  cls?: ClassId;
  instruction?: Instruction;
  female?: boolean;
}

const g = (type: GearTypeId, q: Quality, extra?: Partial<Gear>, slot?: GearSlot): GearSpec => ({ type, q, extra, slot });

/** Ascension bonus rounds 1..18 (GM table), renamed as dinos and prehistoric beasts. */
export const ASCENSION_FOES: FoeSpec[][] = [
  // 1: Mad Rhino + Mangy Bear
  [
    { name: 'Mad Woolly Rhino', species: 'woollyrhino', stats: gm(28, 2, 55, 8), level: 5, techniques: [['Charge', 1]], traits: ['Fury'] },
    { name: 'Mangy Dire Bear', species: 'direbear', stats: gm(13, 3, 32, 10), level: 3 },
  ],
  // 2: Saturn Horseman
  [{ name: 'Saturn Horseman', species: 'parasaurolophus', stats: gm(20, 14, 80, 16), level: 10, cls: 'phalanx',
    traits: ['MasterHorseman'], techniques: [['Charge', 2], ['Lunge', 2]],
    gear: [g('hornLance', 3), g('numidianLancer', 3), g('lightHarness', 3)] }],
  // 3: Vulcan Juggernaut
  [{ name: 'Vulcan Juggernaut', species: 'ankylosaurus', stats: gm(30, 10, 100, 14), level: 15, cls: 'brute',
    traits: ['Titan'], techniques: [['Smash', 3], ['Headbutt', 2]],
    gear: [g('ankyloHammer', 4), g('bronzeBarding', 3, { augment: 'Vulcan' }), g('bronzeMuzzle', 3)] }],
  // 4: Solar Chosen
  [{ name: 'Solar Chosen', species: 'carnotaurus', stats: gm(20, 20, 80, 25), level: 20, cls: 'bulwark',
    traits: ['SolarChampion'], techniques: [['Charge', 3], ['Feint', 2]],
    gear: [g('talonBlades', 4, { augment: 'Solar' }), g('frillGuard', 3), g('legionBarding', 3)] }],
  // 5: Son of Neptune
  [{ name: 'Son of Neptune', species: 'spinosaurus', stats: gm(26, 15, 100, 22), level: 25, cls: 'snarer',
    traits: ['Tough'], techniques: [['Disarm', 2], ['Gouge', 3], ['Lunge', 3]],
    gear: [g('tridentHorns', 4, { augment: 'Bloody' }), g('bolaRig', 4), g('quiltedBarding', 3)] }],
  // 6: The Wise One
  [{ name: 'The Wise One', species: 'troodon', stats: gm(30, 42, 130, 35), level: 30, cls: 'snarer',
    traits: ['Tactician', 'Sneaky', 'Preparation'], techniques: [['Feint', 4], ['Gouge', 4], ['ThrowSand', 3]],
    gear: [g('sickleClaws', 4), g('huntersHood', 4), g('camoHide', 4)] }],
  // 7: Venus Descendant
  [{ name: 'Venus Descendant', species: 'dilophosaurus', stats: gm(26, 16, 120, 32), level: 35, cls: 'slasher', female: true,
    traits: ['Inspiring', 'Agile', 'ShowMan'], techniques: [['Lunge', 4], ['StrikeAndRoll', 3], ['Kick', 3]],
    gear: [g('scytheClaws', 4, { augment: 'Blessed' }), g('lightHarness', 4), g('corinthianVisor', 4)] }],
  // 8: Great Hunter + companion
  [
    { name: 'The Great Hunter', species: 'therizinosaurus', stats: gm(20, 18, 90, 24), level: 28, cls: 'phalanx',
      traits: ['Hunter', 'Bestiarii'], techniques: [['Impale', 3], ['Lunge', 3]],
      gear: [g('spineDarts', 4), g('celticSpearman', 3), g('camoHide', 4)] },
    { name: 'Hunter\'s Sabertooth', species: 'sabertooth', stats: gm(15, 5, 30, 20), level: 15, traits: ['SharpenedClaws'] },
  ],
  // 9: Death Incarnate
  [{ name: 'Death Incarnate', species: 'tyrannosaurus', stats: gm(20, 25, 130, 30), level: 40, cls: 'brute',
    traits: ['Killer', 'Psychopath', 'Ruthless'], techniques: [['Execute', 4], ['Gouge', 3], ['CheapShot', 3]],
    gear: [g('venomFangs', 4, { augment: 'Bloody' }), g('cataphractBarding', 4), g('bronzeMuzzle', 4)] }],
  // 10: Judgement
  [{ name: 'Judgement', species: 'triceratops', stats: gm(38, 20, 160, 30), level: 45, cls: 'phalanx',
    traits: ['Lawbringer', 'Indomitable'], techniques: [['Thunderstrike', 3], ['Impale', 4], ['Charge', 3]],
    gear: [g('bronzeHorn', 4, { augment: 'Precision' }), g('bashPlate', 4), g('legionBarding', 4), g('legionFaceplate', 4)] }],
  // 11: Benefit + Rejuvenate
  [
    { name: 'Benefit', species: 'iguanodon', stats: gm(25, 20, 100, 30), level: 35, cls: 'bulwark',
      traits: ['LifeBringer', 'Inspiring'], techniques: [['Rally', 4], ['Smash', 3]],
      gear: [g('talonBlades', 4, { augment: 'Blessed' }), g('bronzeFrillGuard', 4), g('bronzeBarding', 4)] },
    { name: 'Rejuvenate', species: 'stegosaurus', stats: gm(20, 14, 160, 16), level: 35, cls: 'brute', female: true,
      traits: ['TrueGrit', 'Tough'], techniques: [['Rally', 3], ['Cleave', 3]],
      gear: [g('tailClub', 4), g('hideShield', 4), g('bronzeBarding', 4, { augment: 'Fortified' })] },
  ],
  // 12: The Warrior
  [{ name: 'The Warrior', species: 'allosaurus', stats: gm(44, 20, 150, 33), level: 50, cls: 'brute',
    traits: ['Fury', 'Strong', 'Veteran', 'Indomitable'], techniques: [['Smash', 5], ['Rampage', 4], ['Cleave', 3]],
    gear: [g('greatTalons', 5), g('legionBarding', 5), g('hornedHelm', 5)] }],
  // 13: The Messenger
  [{ name: 'The Messenger', species: 'velociraptor', stats: gm(30, 46, 140, 75), level: 55, cls: 'slasher',
    traits: ['LightningSpeed', 'Agile', 'DualWield', 'Alert'], techniques: [['StrikeAndRoll', 5], ['Feint', 5], ['Lunge', 5]],
    gear: [g('sickleClaws', 5, { augment: 'Precision' }), g('fangCaps', 5, undefined, 'offhand'), g('lightHarness', 5), g('gripWraps', 5)] }],
  // 14: One Eyed Giant
  [{ name: 'One Eyed Giant', species: 'cyclops', stats: gm(35, 30, 400, 27), level: 60,
    traits: ['Titan', 'PartiallyBlind'], techniques: [['Rampage', 4], ['Warcry', 3], ['Kick', 3]] }],
  // 15: Harpy I + II (the stronger harpy line)
  [
    { name: 'Harpy I', species: 'harpy', stats: gm(18, 27, 90, 36), level: 70, female: true, techniques: [['SneakAttack', 3], ['Gouge', 3]] },
    { name: 'Harpy II', species: 'harpy', stats: gm(18, 27, 90, 36), level: 70, female: true, techniques: [['SneakAttack', 3], ['Gouge', 3]] },
  ],
  // 16: Manticore
  [{ name: 'Manticore', species: 'manticore', stats: gm(70, 50, 800, 115), level: 100, techniques: [['Fireball', 3], ['Impale', 3]] }],
  // 17: Hydra
  [{ name: 'Hydra', species: 'hydra', stats: gm(75, 20, 1000, 25), level: 120, techniques: [['Bite', 3], ['Maul', 3], ['Headbutt', 3]] }],
  // 18: Wraith
  [{ name: 'Wraith', species: 'wraith', stats: gm(80, 60, 450, 70), level: 150, techniques: [['Rally', 4], ['Warcry', 4], ['Thunderstrike', 4]] }],
];

/** The gods' champions who join rivals or the Horde during an ascended run (GM 03 §8.3). */
export const GOD_CHAMPIONS: Record<string, FoeSpec> = {
  cronus: { name: 'Cronus, Chosen of Saturn', species: 'giganotosaurus', stats: gm(15, 10, 45, 10), level: 5,
    traits: ['Fury', 'Inspiring'], techniques: [['Decimate', 1], ['Rally', 1]], gear: [g('bashPlate', 4)] },
  hephaestus: { name: 'Hephaestus, Chosen of Vulcan', species: 'ankylosaurus', stats: gm(18, 14, 65, 12), level: 9,
    traits: ['Titan', 'Impact'], techniques: [['Disarm', 1], ['Sunder', 1]], gear: [g('tridentHorns', 4)] },
  poseidon: { name: 'Poseidon, Chosen of Neptune', species: 'spinosaurus', stats: gm(24, 18, 85, 12), level: 15, cls: 'snarer',
    traits: ['Titan', 'Tough'], techniques: [['Disarm', 2], ['Gouge', 2], ['Lunge', 2]], gear: [g('tridentHorns', 4, { augment: 'Bloody' })] },
  jove: { name: 'Jove, Chosen of Jupiter', species: 'tyrannosaurus', stats: gm(16, 16, 65, 16), level: 15, cls: 'phalanx',
    traits: ['Strong'], techniques: [['Thunderstrike', 1], ['Smash', 2]], gear: [g('bronzeHorn', 4, { augment: 'Precision' })] },
  ares: { name: 'Ares, Chosen of Mars', species: 'allosaurus', stats: gm(14, 7, 70, 10), level: 9, cls: 'brute',
    traits: ['Fury'], techniques: [['Smash', 2], ['Rampage', 1]], gear: [g('tailClub', 4, { augment: 'Blessed' })] },
  sagittarius: { name: 'Sagittarius', species: 'dilophosaurus', stats: gm(8, 12, 40, 9), level: 5, cls: 'spitter',
    traits: ['Marksman'], techniques: [], gear: [g('venomSpitter', 2)] },
  podarge: { name: 'Harpy Podarge', species: 'harpy', stats: gm(9, 15, 55, 23), level: 8, female: true },
  aello: { name: 'Harpy Aello', species: 'harpy', stats: gm(9, 15, 55, 23), level: 8, female: true },
  minotaur: { name: 'The Minotaur', species: 'minotaur', stats: gm(30, 8, 120, 16), level: 20, traits: ['Giant'] },
  icarus: { name: 'Icarus', species: 'dilophosaurus', stats: gm(10, 12, 45, 16), level: 6, cls: 'spitter',
    traits: ['Mythical', 'Flying'], techniques: [['Lunge', 1]], gear: [g('venomSpitter', 3)] },
  draugluin: { name: 'Draugluin', species: 'alphadirewolf', stats: gm(20, 12, 75, 26), level: 8,
    traits: ['Lycanthropy', 'Ruthless', 'Fanatic'], gear: [g('moonstone', 2)] },
  perseus: { name: 'Perseus', species: 'velociraptor', stats: gm(18, 18, 80, 18), level: 6, cls: 'slasher',
    traits: ['Mythical', 'Hero', 'Devotion'], techniques: [['Lunge', 2], ['Feint', 2]], gear: [g('legPlates', 4)] },
};

/** Weapon type used for Ascended Weaponry, by the champion's favoured family. */
export const FAMILY_WEAPON: Record<string, GearTypeId> = {
  claw: 'talonBlades', fang: 'fangCaps', horn: 'hornLance', mace: 'tailClub', spit: 'venomSpitter', jaw: 'ironJaws', whip: 'tailWhip',
};
