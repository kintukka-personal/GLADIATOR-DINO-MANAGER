// Species catalogue: dinos (gladiator analogue, species = GM origin) and beasts.
// See DESIGN.md §3.3–3.4.

import type { SpeciesDef, SpeciesId, DinoSpeciesId, BeastSpeciesId, Stats } from '../types';

const S = (str: number, agi: number, cun: number, hp: number): Stats => ({ str, agi, cun, hp });

// palette helpers: per-region lists of natural colour indices (see colors.ts)
const EARTH = [7, 8, 9, 10, 11, 12, 20, 21];
const GREENS = [20, 21, 22, 23, 24, 26];
const GREYS = [1, 2, 3, 4];
const LIGHT = [4, 5, 9, 10];
const BRIGHT = [13, 14, 15, 16, 17, 18, 27, 28, 31, 33];
const EYES = [0, 11, 18, 36, 15];

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  // ------------------------------------------------------------------ dinos
  velociraptor: {
    id: 'velociraptor', name: 'Velociraptor', kind: 'dino', body: 'raptor', size: 'S',
    base: S(2, 5, 4, 15), weights: S(2, 4, 3, 2), diet: 'carn', repro: 'egg', eggSize: 'small',
    incubWeeks: 1, tempRange: [24, 32], gestationWeeks: 0, matureWeeks: 6, mateCooldown: 2, kibble: 'simple',
    favClass: 'slasher', disClass: 'phalanx',
    basicBonus: '+25% training XP', advancedBonus: '+1 weapon point and +1 accuracy after every attack (stacks)',
    natural: ['Lunge'], palette: [EARTH, LIGHT, [0, 1, 7, 12, 22], BRIGHT, EARTH, EYES],
    marketFromWeek: 1, marketWeight: 10, flavour: 'Quick, clever pack hunters from the Thracian hills.',
  },
  dilophosaurus: {
    id: 'dilophosaurus', name: 'Dilophosaurus', kind: 'dino', body: 'raptor', size: 'S',
    base: S(2, 4, 5, 15), weights: S(2, 3, 4, 2), diet: 'carn', repro: 'egg', eggSize: 'small',
    incubWeeks: 1, tempRange: [26, 34], gestationWeeks: 0, matureWeeks: 6, mateCooldown: 2, kibble: 'simple',
    favClass: 'spitter', disClass: 'bulwark',
    basicBonus: '+1 reach', advancedBonus: '+50% critical damage while at full health',
    natural: ['ThrowSand'], palette: [GREENS, LIGHT, [0, 22, 29], [15, 16, 18, 33, 27], GREENS, EYES],
    marketFromWeek: 1, marketWeight: 8, flavour: 'Frilled spitters bred in Iberian marshes. The venom blinds.',
  },
  troodon: {
    id: 'troodon', name: 'Troodon', kind: 'dino', body: 'raptor', size: 'S',
    base: S(1, 4, 6, 12), weights: S(1, 3, 5, 2), diet: 'carn', repro: 'egg', eggSize: 'small',
    incubWeeks: 1, tempRange: [22, 30], gestationWeeks: 0, matureWeeks: 5, mateCooldown: 2, kibble: 'simple',
    favClass: 'snarer', disClass: 'brute',
    basicBonus: '+10 trait-gain chance', advancedBonus: '+1 bonus damage per 2 traits',
    natural: ['Gouge'], palette: [GREYS, LIGHT, [0, 1, 29, 31], [18, 36, 16], GREYS, [18, 36, 19]],
    marketFromWeek: 1, marketWeight: 7, flavour: 'Big-eyed and cunning. Carthaginian traders swear they can count.',
  },
  allosaurus: {
    id: 'allosaurus', name: 'Allosaurus', kind: 'dino', body: 'theropod', size: 'M',
    base: S(4, 4, 3, 22), weights: S(4, 3, 2, 3), diet: 'carn', repro: 'egg', eggSize: 'medium',
    incubWeeks: 2, tempRange: [24, 32], gestationWeeks: 0, matureWeeks: 10, mateCooldown: 3, kibble: 'regular',
    favClass: 'brute', disClass: 'lasher',
    basicBonus: '+10% damage against foes below half health', advancedBonus: 'Heals 15% max health on every knockout',
    natural: ['Smash'], palette: [EARTH, LIGHT, [0, 1, 7, 13], [13, 14, 15, 12], EARTH, EYES],
    marketFromWeek: 1, marketWeight: 8, flavour: 'Thracian butchers. Spartacus is one of them.',
  },
  carnotaurus: {
    id: 'carnotaurus', name: 'Carnotaurus', kind: 'dino', body: 'theropod', size: 'M',
    base: S(4, 5, 2, 20), weights: S(4, 4, 1, 2), diet: 'carn', repro: 'egg', eggSize: 'medium',
    incubWeeks: 2, tempRange: [26, 34], gestationWeeks: 0, matureWeeks: 9, mateCooldown: 3, kibble: 'regular',
    favClass: 'phalanx', disClass: 'snarer',
    basicBonus: 'Charge deals +25% damage; +3 accuracy in round 1', advancedBonus: 'The first hit it lands each battle is a critical',
    natural: ['Charge'], palette: [[12, 13, 14, 8], LIGHT, [0, 1, 7], [0, 1, 4], [12, 13, 7], EYES],
    marketFromWeek: 1, marketWeight: 7, flavour: 'The bull-horned charger. Crowds love the first impact.',
  },
  tyrannosaurus: {
    id: 'tyrannosaurus', name: 'Tyrannosaurus', kind: 'dino', body: 'theropod', size: 'L',
    base: S(6, 2, 3, 30), weights: S(5, 2, 2, 4), diet: 'carn', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [28, 36], gestationWeeks: 0, matureWeeks: 16, mateCooldown: 4, kibble: 'superior',
    favClass: 'brute', disClass: 'spitter',
    basicBonus: '+10 critical chance', advancedBonus: 'Heals 10% max health on every critical hit',
    natural: ['Smash'], palette: [[7, 8, 20, 21, 22, 1], LIGHT, [0, 1, 7], [12, 13, 14, 15], [7, 8, 1], EYES],
    marketFromWeek: 30, marketWeight: 3, flavour: 'Tyrant of the Britannic forests. Every crunch is a meal.',
  },
  spinosaurus: {
    id: 'spinosaurus', name: 'Spinosaurus', kind: 'dino', body: 'spino', size: 'L',
    base: S(5, 3, 3, 28), weights: S(4, 2, 3, 4), diet: 'carn', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [30, 38], gestationWeeks: 0, matureWeeks: 15, mateCooldown: 4, kibble: 'superior',
    favClass: 'snarer', disClass: 'bulwark',
    basicBonus: 'Divine favour ×2', advancedBonus: 'Favour is added to weapon damage (doubled on crits)',
    natural: ['Smash'], palette: [[26, 27, 28, 2, 9], LIGHT, [0, 29, 26], [15, 16, 17, 18, 33, 36], [26, 29, 2], EYES],
    marketFromWeek: 12, marketWeight: 4, flavour: 'Sail-backed river giant of the Nile, sacred to the priests of Egypt.',
  },
  triceratops: {
    id: 'triceratops', name: 'Triceratops', kind: 'dino', body: 'ceratops', size: 'L',
    base: S(5, 2, 2, 30), weights: S(4, 2, 2, 5), diet: 'herb', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [22, 30], gestationWeeks: 0, matureWeeks: 14, mateCooldown: 4, kibble: 'superior',
    favClass: 'phalanx', disClass: 'slasher',
    basicBonus: '+7 status resistance', advancedBonus: '+2 to every stat each time it is hit (stacks)',
    natural: ['Decimate'], palette: [[8, 9, 20, 21, 2], LIGHT, [7, 1, 22], [15, 16, 17, 18, 13, 31], [8, 7, 4], EYES],
    marketFromWeek: 4, marketWeight: 6, flavour: 'Gallic three-horns. Stubborn, and angrier with every wound.',
  },
  ankylosaurus: {
    id: 'ankylosaurus', name: 'Ankylosaurus', kind: 'dino', body: 'ankylo', size: 'L',
    base: S(3, 1, 2, 32), weights: S(3, 1, 2, 6), diet: 'herb', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [20, 28], gestationWeeks: 0, matureWeeks: 14, mateCooldown: 4, kibble: 'superior',
    favClass: 'bulwark', disClass: 'spitter',
    basicBonus: '+1 armor', advancedBonus: 'Critical chance rises with missing health',
    natural: ['Headbutt'], palette: [[7, 8, 9, 20, 2, 3], LIGHT, [1, 7], [4, 9, 10], [1, 2, 7, 12], EYES],
    marketFromWeek: 4, marketWeight: 5, flavour: 'A walking fortress from the Greek isles, club tail and all.',
  },
  stegosaurus: {
    id: 'stegosaurus', name: 'Stegosaurus', kind: 'dino', body: 'stego', size: 'L',
    base: S(4, 1, 2, 30), weights: S(4, 1, 2, 5), diet: 'herb', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [22, 30], gestationWeeks: 0, matureWeeks: 13, mateCooldown: 4, kibble: 'superior',
    favClass: 'brute', disClass: 'spitter',
    basicBonus: 'Tail weapon (off-hand) attacks have no accuracy penalty', advancedBonus: 'Off-hand weapon hits cause bleeding',
    natural: ['Cleave'], palette: [[20, 21, 22, 23, 8], LIGHT, [0, 7, 22], [13, 14, 15, 16, 17, 18], [12, 13, 15, 16], EYES],
    marketFromWeek: 6, marketWeight: 5, flavour: 'Plates like shields, a tail like a spiked mace.',
  },
  iguanodon: {
    id: 'iguanodon', name: 'Iguanodon', kind: 'dino', body: 'hadro', size: 'M',
    base: S(3, 3, 3, 24), weights: S(3, 3, 3, 3), diet: 'herb', repro: 'egg', eggSize: 'medium',
    incubWeeks: 2, tempRange: [20, 28], gestationWeeks: 0, matureWeeks: 10, mateCooldown: 3, kibble: 'regular',
    favClass: 'bulwark', disClass: 'brute',
    basicBonus: '+1 tameness each week; +1 weapon proficiency per gain', advancedBonus: 'Every weapon proficiency applies to every weapon',
    natural: ['Lunge'], palette: [[21, 22, 23, 24, 8, 9], LIGHT, [7, 22], [4, 9, 10], [21, 22, 8], EYES],
    marketFromWeek: 1, marketWeight: 8, flavour: 'Disciplined, thumb-spiked, Roman to the bone.',
  },
  parasaurolophus: {
    id: 'parasaurolophus', name: 'Parasaurolophus', kind: 'dino', body: 'hadro', size: 'M',
    base: S(2, 4, 4, 22), weights: S(2, 4, 4, 3), diet: 'herb', repro: 'egg', eggSize: 'medium',
    incubWeeks: 2, tempRange: [20, 28], gestationWeeks: 0, matureWeeks: 9, mateCooldown: 3, kibble: 'regular',
    favClass: 'spitter', disClass: 'lasher',
    basicBonus: 'Extra class mastery XP', advancedBonus: 'Rider bonuses are doubled',
    natural: ['Rally'], palette: [[9, 10, 11, 16, 24], LIGHT, [7, 8, 12], [15, 16, 17, 30, 31, 28], [11, 12, 9], EYES],
    marketFromWeek: 1, marketWeight: 7, flavour: 'Crested trumpeters ridden by Parthian outriders.',
  },
  pachycephalosaurus: {
    id: 'pachycephalosaurus', name: 'Pachycephalosaurus', kind: 'dino', body: 'pachy', size: 'M',
    base: S(3, 3, 2, 22), weights: S(4, 3, 2, 3), diet: 'herb', repro: 'egg', eggSize: 'small',
    incubWeeks: 1, tempRange: [22, 30], gestationWeeks: 0, matureWeeks: 8, mateCooldown: 2, kibble: 'simple',
    favClass: 'brawler', disClass: 'snarer',
    basicBonus: 'Headbutt, Stomp and Charge stun harder; +5 stun resistance', advancedBonus: 'Immune to stuns',
    natural: ['Headbutt'], palette: [[9, 10, 8, 2], LIGHT, [7, 1, 13], [4, 5, 15, 16], [8, 9], EYES],
    marketFromWeek: 1, marketWeight: 7, flavour: 'Dome-headed rams. Arena physicians hate them.',
  },
  therizinosaurus: {
    id: 'therizinosaurus', name: 'Therizinosaurus', kind: 'dino', body: 'theriz', size: 'L',
    base: S(4, 3, 3, 26), weights: S(4, 2, 3, 4), diet: 'herb', repro: 'egg', eggSize: 'large',
    incubWeeks: 3, tempRange: [24, 32], gestationWeeks: 0, matureWeeks: 13, mateCooldown: 4, kibble: 'superior',
    favClass: 'slasher', disClass: 'phalanx',
    basicBonus: 'Claw weapons get +1 weapon point', advancedBonus: 'Every critical hit causes bleeding',
    natural: ['Swipe'], palette: [[9, 10, 8, 3, 4], LIGHT, [7, 1], [13, 14, 31, 33], [8, 9, 3], EYES],
    marketFromWeek: 10, marketWeight: 4, flavour: 'Feathered scythes. Placid, until it is not.',
  },
  brachiosaurus: {
    id: 'brachiosaurus', name: 'Brachiosaurus', kind: 'dino', body: 'sauropod', size: 'H',
    base: S(5, 1, 2, 40), weights: S(4, 1, 1, 8), diet: 'herb', repro: 'egg', eggSize: 'xlarge',
    incubWeeks: 4, tempRange: [26, 34], gestationWeeks: 0, matureWeeks: 22, mateCooldown: 6, kibble: 'exceptional',
    favClass: 'lasher', disClass: 'slasher',
    basicBonus: '+1 reach and +10 max health', advancedBonus: 'Frightens every enemy at the start of battle',
    natural: ['Cleave'], palette: [[2, 3, 20, 21, 28], LIGHT, [1, 29, 22], [4, 9, 28], [2, 3, 20], EYES],
    marketFromWeek: 30, marketWeight: 2, innateTraits: ['Giant'],
    flavour: 'A tower of muscle whose tail cracks like thunder.',
  },
  giganotosaurus: {
    id: 'giganotosaurus', name: 'Giganotosaurus', kind: 'dino', body: 'theropod', size: 'H',
    base: S(7, 2, 2, 36), weights: S(6, 2, 1, 5), diet: 'carn', repro: 'egg', eggSize: 'xlarge',
    incubWeeks: 4, tempRange: [30, 38], gestationWeeks: 0, matureWeeks: 20, mateCooldown: 6, kibble: 'exceptional',
    favClass: 'brute', disClass: 'spitter',
    basicBonus: '+15% damage', advancedBonus: 'Frightens every enemy at the start of battle',
    natural: ['Smash'], palette: [[1, 2, 7, 13, 14], LIGHT, [0, 13, 38], [13, 14, 15, 38], [1, 7, 13], EYES],
    marketFromWeek: 60, marketWeight: 1, innateTraits: ['Giant'],
    flavour: 'Bigger than a tyrant, and hungrier.',
  },

  // ------------------------------------------------------------------ beasts
  direwolf: beast('direwolf', 'Dire Wolf', 'wolf', 'S', S(5, 15, 2, 15), 'gestation', 2, 4, 2, ['Bite'], [GREYS, LIGHT, [0, 1], GREYS, GREYS, EYES], 'Packs of them follow the legions.'),
  alphadirewolf: beast('alphadirewolf', 'Alpha Dire Wolf', 'wolf', 'M', S(9, 13, 3, 20), 'gestation', 2, 5, 3, ['Bite'], [[0, 1, 2], LIGHT, [0, 38], [0, 1], [0, 1], [15, 38]], 'The leader of the pack.', ['Alpha']),
  sabertooth: beast('sabertooth', 'Sabertooth', 'cat', 'M', S(8, 12, 3, 18), 'gestation', 3, 6, 3, ['Maul'], [[9, 10, 11, 8], LIGHT, [7, 1], [9, 10], [8, 9], EYES], 'The arena\'s answer to the lion.'),
  direbear: beast('direbear', 'Dire Bear', 'bear', 'M', S(11, 8, 2, 28), 'gestation', 3, 7, 3, ['Maul'], [[7, 8, 1], LIGHT, [0, 7], [7, 8], [7, 1], EYES], 'Half a ton of claw and temper.'),
  sarcosuchus: beast('sarcosuchus', 'Sarcosuchus', 'croc', 'L', S(9, 3, 3, 40), 'egg', 3, 8, 4, ['Bite'], [[20, 21, 22, 7], LIGHT, [0, 22], [20, 21], [21, 22, 7], [18, 11]], 'A crocodile as long as a warship.', ['ThickHide', 'ColdBlooded']),
  terrorbird: beast('terrorbird', 'Terror Bird', 'bird', 'S', S(6, 17, 2, 14), 'egg', 1, 4, 2, ['Bite', 'Pounce'], [[8, 9, 3, 2], LIGHT, [0, 7], [15, 16, 18, 28], [8, 9], EYES], 'A beak like an axe, legs like a horse.'),
  woollyrhino: beast('woollyrhino', 'Woolly Rhino', 'rhino', 'L', S(19, 4, 1, 40), 'gestation', 4, 10, 5, ['Headbutt'], [[7, 8, 9], LIGHT, [7], [4, 5], [7, 8], EYES], 'A battering ram with a coat.', ['ThickHide'], 'woollyRhinos'),
  mammoth: beast('mammoth', 'Mammoth', 'mammoth', 'H', S(13, 2, 4, 70), 'gestation', 5, 14, 6, ['Maul', 'Headbutt'], [[7, 8, 12], LIGHT, [7], [4, 5, 6], [7, 8], EYES], 'War mammoths terrify mounted riders.', undefined, 'warMammoths'),
  gigantopithecus: beast('gigantopithecus', 'Gigantopithecus', 'ape', 'L', S(17, 4, 3, 35), 'gestation', 4, 9, 4, ['Warcry', 'Rampage'], [[0, 1, 7, 2], LIGHT, [1], [1, 2], [0, 1], EYES], 'An ape the size of a hut.'),

  // ------------------------------------------------------------------ mythic
  harpy: mythic('harpy', 'Harpy', 'harpy', S(9, 23, 15, 55), ['SneakAttack', 'Gouge'], ['Mythical', 'Flying', 'Sneaky']),
  minotaur: mythic('minotaur', 'Minotaur', 'minotaur', S(30, 16, 8, 120), ['Headbutt', 'Warcry'], ['Mythical', 'Indomitable', 'ThickHide']),
  medusa: mythic('medusa', 'Medusa', 'serpent', S(50, 75, 75, 500), ['Pounce', 'Swipe', 'SneakAttack', 'Execute'], ['ThickHide', 'Killer', 'Carnivorous', 'BestiaSummum', 'Alpha', 'Preparation', 'SharpenedClaws', 'ShowMan', 'PoisonedClaws', 'PoisonMaster', 'Mythical']),
  cyclops: mythic('cyclops', 'Cyclops', 'giant', S(30, 16, 8, 120), ['Rampage', 'Warcry'], ['Mythical', 'Indomitable', 'ThickHide']),
  manticore: mythic('manticore', 'Manticore', 'manticore', S(70, 115, 50, 800), ['Fireball', 'Impale'], ['Mythical', 'Flying', 'Strong', 'Tough']),
  hydra: mythic('hydra', 'Hydra', 'hydra', S(75, 25, 20, 1000), ['Bite', 'Maul', 'Headbutt'], ['ManyHeads', 'Mythical', 'Strong', 'Tough', 'Impact']),
  lesserhydra: mythic('lesserhydra', 'Lesser Hydra', 'hydra', S(40, 14, 10, 300), ['Bite', 'Maul'], ['ManyHeads', 'Mythical', 'Impact']),
  wraith: mythic('wraith', 'Wraith', 'wraith', S(80, 70, 60, 450), ['Rally', 'Warcry', 'Thunderstrike'], ['Mythical', 'Intangible', 'Impact', 'FeralIntelligence', 'Tough', 'Devotion']),
  wyvern: mythic('wyvern', 'Wyvern', 'wyvern', S(12, 22, 10, 75), ['Hurricane', 'Bite', 'Fireball'], ['Mythical', 'Flying', 'FeralIntelligence']),
  mandrake: mythic('mandrake', 'Mandrake', 'mandrake', S(14, 18, 8, 30), ['Bite'], ['PoisonedClaws', 'LightningSpeed', 'Tough'], 'S'),
};

function beast(
  id: BeastSpeciesId, name: string, body: SpeciesDef['body'], size: SpeciesDef['size'], base: Stats,
  repro: 'egg' | 'gestation', gestOrIncub: number, matureWeeks: number, mateCooldown: number,
  natural: SpeciesDef['natural'], palette: number[][], flavour: string,
  innateTraits?: SpeciesDef['innateTraits'], upgrade?: SpeciesDef['upgrade'],
): SpeciesDef {
  return {
    id, name, kind: 'beast', body, size, base, weights: S(3, 3, 1, 2),
    diet: id === 'mammoth' || id === 'woollyrhino' ? 'herb' : 'carn',
    repro, eggSize: size === 'L' || size === 'H' ? 'large' : 'medium',
    incubWeeks: repro === 'egg' ? gestOrIncub : 0, tempRange: [24, 32],
    gestationWeeks: repro === 'gestation' ? gestOrIncub : 0, matureWeeks, mateCooldown,
    kibble: size === 'H' ? 'exceptional' : size === 'L' ? 'superior' : 'regular',
    basicBonus: 'Never surrenders', advancedBonus: '–', natural, innateTraits, palette,
    marketFromWeek: 1, marketWeight: 5, upgrade, flavour,
  };
}

function mythic(id: BeastSpeciesId, name: string, body: SpeciesDef['body'], gm: Stats, natural: SpeciesDef['natural'], innateTraits: SpeciesDef['innateTraits'], size?: SpeciesDef['size']): SpeciesDef {
  return {
    id, name, kind: 'beast', body, size: size ?? (gm.hp >= 200 ? 'H' : 'L'), base: gm, weights: S(1, 1, 1, 1),
    diet: 'carn', repro: 'none', eggSize: 'mythic', incubWeeks: 0, tempRange: [20, 40], gestationWeeks: 0,
    matureWeeks: 20, mateCooldown: 99, kibble: 'extraordinary', basicBonus: 'Mythical', advancedBonus: '–',
    natural, innateTraits, palette: [[2, 3, 37, 29], [4, 5], [0, 37], [15, 36, 38], [1, 37], [15, 36, 18]],
    mythic: true, marketFromWeek: 9999, marketWeight: 0, flavour: 'A creature of legend.',
  };
}

export const DINO_SPECIES: DinoSpeciesId[] = [
  'velociraptor', 'dilophosaurus', 'troodon', 'allosaurus', 'carnotaurus', 'tyrannosaurus', 'spinosaurus',
  'triceratops', 'ankylosaurus', 'stegosaurus', 'iguanodon', 'parasaurolophus', 'pachycephalosaurus',
  'therizinosaurus', 'brachiosaurus', 'giganotosaurus',
];

export const BEAST_SPECIES: BeastSpeciesId[] = [
  'direwolf', 'alphadirewolf', 'sabertooth', 'direbear', 'sarcosuchus', 'terrorbird', 'woollyrhino', 'mammoth',
  'gigantopithecus',
];

/** GM beast stat lines (STR/AGI/CUN/HP) and prices for market beasts. */
export const BEAST_MARKET: Partial<Record<BeastSpeciesId, { stats: Stats; price: number }>> = {
  direwolf: { stats: S(8, 20, 3, 20), price: 100 },
  alphadirewolf: { stats: S(13, 18, 4, 30), price: 200 },
  sabertooth: { stats: S(12, 17, 4, 25), price: 250 },
  direbear: { stats: S(15, 12, 3, 38), price: 350 },
  sarcosuchus: { stats: S(13, 4, 4, 50), price: 350 },
  terrorbird: { stats: S(9, 22, 3, 18), price: 150 },
  woollyrhino: { stats: S(26, 6, 2, 52), price: 500 },
  mammoth: { stats: S(18, 3, 6, 90), price: 700 },
  gigantopithecus: { stats: S(24, 6, 5, 45), price: 400 },
};

export function species(id: SpeciesId): SpeciesDef {
  return SPECIES[id];
}

export const isGiantSize = (id: SpeciesId): boolean => {
  const s = SPECIES[id].size;
  return s === 'L' || s === 'H';
};
