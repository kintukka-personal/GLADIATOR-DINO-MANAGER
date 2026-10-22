// Battle harness catalogue (GM 02-items-economy §3–6), renamed for dinos.
// Each GearDef has six quality lines (Shoddy..Legendary). Uniques add `mods` on top of their base line.

import type { Augment, Gear, GearDef, GearEffect, GearQualityLine, GearTypeId, Quality, UniqueDef } from '../types';

const W = (...rows: [number, number][]): GearQualityLine[] => rows.map(([dmg, blk]) => ({ dmg, blk }));
const B = (...blks: number[]): GearQualityLine[] => blks.map((blk) => ({ blk }));
function withMods(lines: GearQualityLine[], mods: Partial<GearQualityLine>[]): GearQualityLine[] {
  return lines.map((l, i) => ({ ...l, ...(mods[i] ?? {}) }));
}
const all = (m: Partial<GearQualityLine>) => [m, m, m, m, m, m];

function def(d: Omit<GearDef, 'effects' | 'market'> & { effects?: GearEffect[]; market?: boolean }): GearDef {
  return { effects: [], market: true, ...d };
}

export const GEAR: Record<GearTypeId, GearDef> = {
  // ------------------------------------------------------------------ weapons
  spineDarts: def({ type: 'spineDarts', name: 'Spine Darts', slot: 'weapon', family: 'spit', reach: 8, baseWorth: 200,
    lines: W([2, 0], [2, 1], [3, 1], [4, 1], [5, 2], [5, 3]), effects: ['Pilum'], forge: 99,
    desc: 'Tail-launched spines. Reach 8, −25 accuracy; hits pierce armor. Uses horn or spit proficiency.' }),
  ironJaws: def({ type: 'ironJaws', name: 'Iron Jaws', slot: 'weapon', family: 'jaw', reach: 0, baseWorth: 100,
    lines: W([1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [4, 3]), effects: ['HandToHand'], forge: 1,
    desc: 'Iron jaw braces. Counts as bare-jawed, cannot be torn off, bites twice.' }),
  tailWhip: def({ type: 'tailWhip', name: 'Barbed Tail-Whip', slot: 'weapon', family: 'whip', reach: 3, baseWorth: 160,
    lines: W([0, 1], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3]), effects: ['Whip'], forge: 99,
    desc: '+15 hit against unarmed foes and beasts; a crit snares. Allows fang caps in the off-hand.' }),
  hornLance: def({ type: 'hornLance', name: 'Horn Lance', slot: 'weapon', family: 'horn', reach: 3, baseWorth: 100,
    lines: W([1, 0], [1, 1], [2, 1], [3, 1], [4, 2], [5, 2]), forge: 1, desc: 'A bronze-capped horn extension.' }),
  obsidianCrusher: def({ type: 'obsidianCrusher', name: 'Obsidian Crusher', slot: 'weapon', family: 'mace', reach: 3, baseWorth: 200,
    lines: W([2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 4]), effects: ['TwoHandedOnly', 'Egyptian'], forge: 99,
    desc: 'Two-handed obsidian maul. +5 accuracy for Spinosaurus.' }),
  venomSpitter: def({ type: 'venomSpitter', name: 'Venom Spitter', slot: 'weapon', family: 'spit', reach: 10, baseWorth: 150,
    lines: W([2, 0], [3, 0], [4, 0], [4, 1], [5, 1], [6, 1]), effects: ['TwoHandedOnly', 'Bow'], forge: 1,
    desc: 'Pressure glands that spit venom at range 10. Free opening shot against slower melee foes.' }),
  bronzeHorn: def({ type: 'bronzeHorn', name: 'Bronze Horn', slot: 'weapon', family: 'horn', reach: 4, baseWorth: 200,
    lines: W([1, 0], [1, 0], [2, 0], [3, 0], [4, 1], [5, 1]), effects: ['Sauroter'], forge: 99,
    desc: 'Long bronze horn sheath. Negates the first harness tear.' }),
  tailClub: def({ type: 'tailClub', name: 'Tail Club', slot: 'weapon', family: 'mace', reach: 1, baseWorth: 120,
    lines: withMods(W([3, 0], [4, 1], [5, 1], [6, 1], [7, 1], [9, 2]), [{ agi: -3 }, { agi: -3 }, { agi: -2 }, { agi: -2 }, { agi: -1 }, { agi: -3 }]),
    effects: ['DualWieldable'], forge: 1, desc: 'A spiked bone club strapped to the tail. Heavy (−AGI).' }),
  ankyloHammer: def({ type: 'ankyloHammer', name: 'Ankylo Hammer', slot: 'weapon', family: 'mace', reach: 2, baseWorth: 250,
    lines: withMods(W([5, 1], [6, 2], [7, 2], [8, 3], [9, 3], [10, 4]), [{ agi: -3 }, { agi: -3 }, { agi: -2 }, { agi: -2 }, { agi: -1 }, {}]),
    effects: ['TwoHandedOnly'], forge: 1, desc: 'A massive two-handed tail hammer.' }),
  tridentHorns: def({ type: 'tridentHorns', name: 'Trident Horns', slot: 'weapon', family: 'horn', reach: 3, baseWorth: 160,
    lines: withMods(W([3, 1], [3, 2], [4, 2], [5, 2], [5, 3], [6, 3]), all({ str: -2, agi: -2 })),
    effects: ['Fuscina'], forge: 1, desc: 'Three-pronged horns. Devastating against snared foes.' }),
  greatTalons: def({ type: 'greatTalons', name: 'Great Talons', slot: 'weapon', family: 'claw', reach: 2, baseWorth: 300,
    lines: W([1, 1], [2, 2], [2, 3], [3, 4], [4, 5], [5, 6]), effects: ['TwoHanded'], upgrade: 'greatTalons', forge: 2,
    desc: 'Long claw blades. +2 damage with an empty off-hand.' }),
  parryingSpurs: def({ type: 'parryingSpurs', name: 'Parrying Spurs', slot: 'weapon', family: 'claw', reach: 1, baseWorth: 200,
    lines: W([1, 1], [2, 2], [2, 3], [2, 4], [4, 4], [5, 5]), effects: ['XiphosBlock', 'DualWieldable'], forge: 99,
    desc: 'Wrist spurs. +1 block without a shield.' }),
  scytheClaws: def({ type: 'scytheClaws', name: 'Scythe Claws', slot: 'weapon', family: 'claw', reach: 1, baseWorth: 180,
    lines: W([1, 1], [2, 2], [3, 2], [3, 3], [5, 3], [6, 4]), effects: ['Falcata', 'DualWieldable'], upgrade: 'therizinArsenal', forge: 1,
    desc: '+2/+3 damage with a free off-hand; Therizinosaurus and Dilophosaurus get more.' }),
  sickleClaws: def({ type: 'sickleClaws', name: 'Sickle Claws', slot: 'weapon', family: 'claw', reach: 1, baseWorth: 200,
    lines: W([1, 1], [2, 1], [2, 2], [2, 3], [4, 3], [5, 3]), effects: ['BypassShield', 'DualWieldable'], upgrade: 'sickleClaws', forge: 2,
    desc: 'Curved killing claws that slip past shields.' }),
  hookClaws: def({ type: 'hookClaws', name: 'Hook Claws', slot: 'weapon', family: 'claw', reach: 1, baseWorth: 250,
    lines: W([2, 1], [3, 1], [4, 2], [5, 2], [6, 2], [6, 3]), effects: ['Khopesh', 'DualWieldable'], forge: 1,
    desc: 'Hooked claws: better against light barding and shields.' }),
  talonBlades: def({ type: 'talonBlades', name: 'Talon Blades', slot: 'weapon', family: 'claw', reach: 1, baseWorth: 150,
    lines: W([1, 1], [2, 2], [2, 3], [3, 3], [4, 3], [5, 4]), effects: ['DualWieldable'], forge: 1,
    desc: 'Bronze talon sheaths. +2 damage behind a frill guard.' }),
  venomFangs: def({ type: 'venomFangs', name: 'Venom Fangs', slot: 'weapon', family: 'fang', reach: 0, baseWorth: 180,
    lines: W([2, 0], [3, 0], [3, 1], [4, 1], [5, 1], [6, 2]), effects: ['Backstab', 'Concealed', 'DualWieldable'], upgrade: 'venomFangs', forge: 2,
    desc: 'Hollow fang caps. The first off-hand bite always crits.' }),
  fangCaps: def({ type: 'fangCaps', name: 'Fang Caps', slot: 'weapon', family: 'fang', reach: 0, baseWorth: 50,
    lines: W([1, 1], [2, 1], [2, 2], [3, 2], [4, 2], [5, 3]), effects: ['Backstab', 'DualWieldable'], forge: 1,
    desc: 'Bronze fang caps. Vicious against impaired foes.' }),

  // ------------------------------------------------------------------ off-hand
  hideShield: def({ type: 'hideShield', name: 'Hide Shield', slot: 'offhand', baseWorth: 100, isShield: true,
    lines: withMods(B(1, 2, 3, 4, 5, 6), all({ str: -1 })), forge: 1, desc: 'Layered hide strapped to the flank.' }),
  strappedBuckler: def({ type: 'strappedBuckler', name: 'Strapped Buckler', slot: 'offhand', baseWorth: 120, isShield: true,
    lines: withMods(B(1, 1, 2, 3, 4, 5), [{ str: -1 }]), effects: ['Strapped'], upgrade: 'therizinArsenal', forge: 1,
    desc: 'Strapped tight: the main weapon counts as two-handed.' }),
  frillGuard: def({ type: 'frillGuard', name: 'Frill Guard', slot: 'offhand', baseWorth: 150, isShield: true, heavy: true,
    lines: withMods(B(2, 3, 4, 5, 6, 7), all({ str: -2, agi: -2 })), effects: ['Scutum'], forge: 1,
    desc: 'A heavy guard plate. +2 damage with Talon Blades.' }),
  bronzeFrillGuard: def({ type: 'bronzeFrillGuard', name: 'Bronze Frill Guard', slot: 'offhand', baseWorth: 250, isShield: true, heavy: true,
    lines: withMods(B(2, 3, 4, 5, 6, 7), all({ str: -1, agi: -1 })), effects: ['Scutum'], forge: 1,
    desc: 'A lighter centurion-grade guard. +2 damage with Talon Blades.' }),
  bashPlate: def({ type: 'bashPlate', name: 'Bash Plate', slot: 'offhand', baseWorth: 200, isShield: true,
    lines: withMods(B(2, 2, 3, 4, 5, 6), [{ str: -3 }, { str: -2 }, { str: -2 }, { str: -2 }, { str: -2 }, { str: -1 }]),
    effects: ['ShieldBash'], upgrade: 'bashPlate', forge: 1, desc: 'A round bronze plate for ramming. May stun each round.' }),
  bolaRig: def({ type: 'bolaRig', name: 'Bola Rig', slot: 'offhand', baseWorth: 150, isNet: true, workshop: true,
    lines: [
      { str: -3, agi: -2, effects: ['Net'] }, { str: -2, agi: -2, effects: ['Net'] }, { str: -2, agi: -2, effects: ['HookedNet'] },
      { str: -1, agi: -1, effects: ['HookedNet'] }, { str: -1, agi: -1, effects: ['HookedNet'] }, { str: -1, agi: -1, effects: ['HookedNet'] },
    ], forge: 1, desc: 'Weighted bolas that entangle legs. No block.' }),

  // ------------------------------------------------------------------ armor (barding)
  lightHarness: def({ type: 'lightHarness', name: 'Light Harness', slot: 'armor', baseWorth: 200,
    lines: [{ blk: 1 }, { blk: 1, agi: 1 }, { blk: 1, agi: 2 }, { blk: 2, agi: 2 }, { blk: 2, agi: 3 }, { blk: 3, agi: 3 }], forge: 1,
    desc: 'Leather straps and a few plates. Light.' }),
  camoHide: def({ type: 'camoHide', name: 'Camouflage Hide', slot: 'armor', baseWorth: 250,
    lines: [{ blk: 0, cun: 2 }, { blk: 1, cun: 2 }, { blk: 1, cun: 3 }, { blk: 2, cun: 3 }, { blk: 2, cun: 4 }, { blk: 3, cun: 4 }],
    effects: ['Stealthy'], forge: 1, desc: 'Dyed hides for night work. Helps intrigue.' }),
  studdedBarding: def({ type: 'studdedBarding', name: 'Studded Barding', slot: 'armor', baseWorth: 300,
    lines: [{ blk: 1, effects: ['Mobility'] }, { blk: 2, effects: ['Mobility'] }, { blk: 2, effects: ['GreaterMobility'] },
      { blk: 3, effects: ['GreaterMobility'] }, { blk: 4, agi: 1, effects: ['GreaterMobility'] }, { blk: 5, agi: 2, effects: ['GreaterMobility'] }],
    upgrade: 'studdedBarding', forge: 2, desc: 'Extra block against slower attackers.' }),
  quiltedBarding: def({ type: 'quiltedBarding', name: 'Quilted Barding', slot: 'armor', baseWorth: 150,
    lines: [{ blk: 1, effects: ['Sturdy'] }, { blk: 1, effects: ['VerySturdy'] }, { blk: 2, effects: ['VerySturdy'] },
      { blk: 3, effects: ['VerySturdy'] }, { blk: 4, effects: ['VerySturdy'] }, { blk: 5, effects: ['VerySturdy'] }],
    upgrade: 'legacyOfAlexander', forge: 1, desc: 'Layered linen. Extra block against bare jaws and beasts.' }),
  bronzeBarding: def({ type: 'bronzeBarding', name: 'Bronze Barding', slot: 'armor', baseWorth: 500, heavy: true,
    lines: withMods(B(2, 3, 4, 5, 6, 7), all({ agi: -1 })), forge: 1, desc: 'Heavy bronze scale.' }),
  legionBarding: def({ type: 'legionBarding', name: 'Legion Barding', slot: 'armor', baseWorth: 450, heavy: true,
    lines: B(2, 3, 4, 5, 6, 7), effects: ['Legionary'], upgrade: 'legionBarding', forge: 2,
    desc: 'Segmented legion plate. Part of the Legion set.' }),
  cataphractBarding: def({ type: 'cataphractBarding', name: 'Cataphract Barding', slot: 'armor', baseWorth: 700, heavy: true,
    lines: [{ blk: 4, agi: -4 }, { blk: 5, agi: -4 }, { blk: 6, agi: -4 }, { blk: 7, agi: -4 }, { blk: 8, agi: -3 }, { blk: 8, agi: -2 }],
    effects: ['Cataphract'], upgrade: 'cataphracts', forge: 2, desc: 'Full scale barding. Cataphract set with a rider and horns.' }),

  // ------------------------------------------------------------------ helmets
  huntersHood: def({ type: 'huntersHood', name: "Hunter's Hood", slot: 'helmet', baseWorth: 100,
    lines: [{ blk: 0, cun: 1 }, { blk: 0, cun: 2 }, { blk: 0, cun: 3 }, { blk: 1, cun: 3 }, { blk: 1, cun: 4 }, { blk: 2, cun: 5 }],
    effects: ['Stealthy'], forge: 1, desc: 'A dark hood over the eyes. Helps intrigue.' }),
  bronzeMuzzle: def({ type: 'bronzeMuzzle', name: 'Bronze Muzzle', slot: 'helmet', baseWorth: 120,
    lines: [{ blk: 1, dr: 1, cun: -3 }, { blk: 2, dr: 1, cun: -3 }, { blk: 2, dr: 1, cun: -2 }, { blk: 3, dr: 2, cun: -2 }, { blk: 4, dr: 2, cun: -2 }, { blk: 5, dr: 3, cun: -2 }],
    forge: 1, desc: 'Solid bronze over the snout.' }),
  legionFaceplate: def({ type: 'legionFaceplate', name: 'Legion Faceplate', slot: 'helmet', baseWorth: 150,
    lines: B(1, 2, 3, 4, 5, 6), effects: ['Legionary'], upgrade: 'legionBarding', forge: 2, desc: 'Part of the Legion set.' }),
  carthaginianCrest: def({ type: 'carthaginianCrest', name: 'Carthaginian Crest', slot: 'helmet', baseWorth: 150,
    lines: [{ blk: 0 }, { blk: 1 }, { blk: 2 }, { blk: 2, hp: 5 }, { blk: 3, hp: 5 }, { blk: 4, hp: 10 }],
    effects: ['CarthageHelmet'], upgrade: 'carthaginianArtifacts', forge: 1, desc: 'Troodon wearers gain health and agility.' }),
  hornedHelm: def({ type: 'hornedHelm', name: 'Horned Helm', slot: 'helmet', baseWorth: 200,
    lines: B(0, 1, 2, 3, 4, 5), effects: ['StunResist'], upgrade: 'hornedHelm', forge: 2, desc: 'Gallic horned helm. Resists stuns.' }),
  corinthianVisor: def({ type: 'corinthianVisor', name: 'Corinthian Visor', slot: 'helmet', baseWorth: 200,
    lines: [{ blk: 1, cun: -4 }, { blk: 2, cun: -4 }, { blk: 3, cun: -3 }, { blk: 4, cun: -1 }, { blk: 5, cun: -1 }, { blk: 6, cun: -1, dr: 1 }],
    effects: ['CriticalBlock'], upgrade: 'athenianArtifacts', forge: 1, desc: 'Extra block against critical hits.' }),
  championsCrest: def({ type: 'championsCrest', name: "Champion's Crest", slot: 'helmet', baseWorth: 100, market: false,
    lines: [{ blk: 1, dr: 1, cun: -2 }, { blk: 2, dr: 1, cun: -2 }, { blk: 3, dr: 1, cun: -2 }, { blk: 4, dr: 2, cun: -2 }, { blk: 5, dr: 2, cun: -1 }, { blk: 6, dr: 3, cun: -1 }],
    effects: ['Magnificent', 'FamilyItem'], upgrade: 'championsCrest', desc: 'Family heirloom. Only the bonded dino may wear it. +2 fame per win.' }),
  tigrisSkull: def({ type: 'tigrisSkull', name: 'Tigris Skull', slot: 'helmet', baseWorth: 400, market: false,
    lines: [{ blk: 1, str: 2, cun: -4 }, { blk: 2, str: 2, cun: -3 }, { blk: 2, str: 2, cun: -2 }, { blk: 3, str: 3, cun: -2 }, { blk: 4, str: 4, cun: -2 }, { blk: 5, str: 4, cun: -2 }],
    effects: ['PitOnly'], desc: 'A trophy skull from the pits.' }),

  // ------------------------------------------------------------------ riders
  numidianLancer: def({ type: 'numidianLancer', name: 'Numidian Lancer', slot: 'rider', baseWorth: 500,
    lines: [{ agi: -6 }, { agi: -6, str: 2, blk: 1, hp: 10, reach: 1 }, { agi: -6, str: 2, blk: 1, hp: 15, reach: 2 },
      { agi: -6, str: 3, blk: 2, hp: 15, reach: 3 }, { agi: -6, str: 4, blk: 2, hp: 20, reach: 3 }, { agi: -6, str: 5, blk: 2, hp: 20, reach: 3 }],
    effects: ['Rider'], desc: 'A light lancer in the saddle. Adds reach and strength.' }),
  celticSpearman: def({ type: 'celticSpearman', name: 'Celtic Spearman', slot: 'rider', baseWorth: 600,
    lines: [{ agi: -6 }, { agi: -6, str: 1, blk: 1, hp: 25 }, { agi: -6, str: 1, blk: 2, hp: 30, reach: 1 },
      { agi: -6, str: 2, blk: 3, hp: 35, reach: 2 }, { agi: -6, str: 3, blk: 4, hp: 35, reach: 2 }, { agi: -6, str: 4, blk: 4, hp: 40, reach: 2 }],
    effects: ['Rider'], upgrade: 'celticRiders', desc: 'A heavy shield-bearing rider. Lots of extra health.' }),
  spectralRider: def({ type: 'spectralRider', name: 'Spectral Rider', slot: 'rider', baseWorth: 100, market: false,
    lines: all({ agi: -6, str: 4, blk: 2, hp: 20, reach: 2 }), effects: ['Rider'], desc: 'A ghostly horseman summoned by the Spectral Saddle.' }),

  // ------------------------------------------------------------------ items
  poultice: def({ type: 'poultice', name: 'Healing Poultice', slot: 'item', baseWorth: 100, consumable: true, workshop: true,
    lines: all({}), effects: ['Bandage'], noReforge: true, desc: 'Downgrades one fresh injury, even a fatal one. Single use.' }),
  antivenom: def({ type: 'antivenom', name: 'Antivenom', slot: 'item', baseWorth: 100, consumable: true, workshop: true,
    lines: all({}), effects: ['Antidote'], noReforge: true, desc: 'Poison immunity for one battle. Also foils poisoners.' }),
  neptuneCharm: def({ type: 'neptuneCharm', name: 'Neptune Charm', slot: 'item', baseWorth: 150, workshop: true,
    lines: all({}), effects: ['PoisonResistance'], noReforge: true, desc: 'Halves poison damage; harder to poison.' }),
  eagleEyeCharm: def({ type: 'eagleEyeCharm', name: 'Eagle-Eye Charm', slot: 'item', baseWorth: 300, workshop: true,
    lines: all({}), effects: ['EagleVision'], noReforge: true, desc: '+5 accuracy and crit, resists blinding.' }),
  luckyTooth: def({ type: 'luckyTooth', name: 'Lucky Tooth', slot: 'item', baseWorth: 175, market: false,
    lines: all({}), effects: ['TempleArtifact', 'LuckyRing'], noReforge: true, desc: '+1 divine favour.' }),
  gripWraps: def({ type: 'gripWraps', name: 'Grip Wraps', slot: 'item', baseWorth: 100, market: false,
    lines: [{ agi: 0 }, { agi: 1 }, { agi: 2 }, { agi: 3 }, { agi: 3, hp: 5 }, { agi: 4, hp: 10 }], effects: ['StunResist'], noReforge: true,
    desc: 'Foot wraps for sure footing. +AGI, resists stuns.' }),
  legPlates: def({ type: 'legPlates', name: 'Leg Plates', slot: 'item', baseWorth: 100,
    lines: [{ blk: 1, agi: -2 }, { blk: 1, agi: -1 }, { blk: 2, agi: -1 }, { blk: 2 }, { blk: 3 }, { blk: 4 }], upgrade: 'spartanDynasty', noReforge: true,
    desc: 'Spartan greaves for the forelegs.' }),
  caltrops: def({ type: 'caltrops', name: 'Caltrops', slot: 'item', baseWorth: 150,
    lines: [{ str: -2, charges: 1 }, { str: -2, charges: 1 }, { str: -1, charges: 1 }, { str: -1, charges: 2 }, { str: 0, charges: 2 }, { str: 0, charges: 2 }],
    effects: ['Caltrops'], noReforge: true, desc: 'Scattered spikes that slow and wound.' }),
  silphium: def({ type: 'silphium', name: 'Silphium Extract', slot: 'item', baseWorth: 300, workshop: true,
    lines: all({}), effects: ['Silphium'], noReforge: true, desc: 'Forget one of three techniques (refunded) and +20 tameness.' }),
  bestiaryScroll: def({ type: 'bestiaryScroll', name: 'Bestiary Scroll', slot: 'item', baseWorth: 400,
    lines: all({}), effects: ['TomeOfTraits'], noReforge: true, desc: 'Choose one of three new traits.' }),
  bottledLightning: def({ type: 'bottledLightning', name: 'Bottled Lightning', slot: 'item', baseWorth: 500,
    lines: all({}), effects: ['BottledLightning'], upgrade: 'thunderStrike', noReforge: true, desc: 'Learns Thunderstrike; −5 tameness and ill for 2 weeks.' }),
  amberShard: def({ type: 'amberShard', name: 'Amber Shard', slot: 'item', baseWorth: 500, market: false,
    lines: all({}), effects: ['AmberShard'], noReforge: true, desc: 'Ancestral memory in amber. Unlocks species level 2.' }),
  monsterTrophy: def({ type: 'monsterTrophy', name: 'Monster Trophy', slot: 'item', baseWorth: 50, market: false,
    lines: all({}), effects: ['MonsterLoot'], noReforge: true, desc: 'Grows with every underworld victory.' }),
  mysteriousEgg: def({ type: 'mysteriousEgg', name: 'Mysterious Egg', slot: 'item', baseWorth: 300, market: false,
    lines: all({ str: -1 }), effects: ['MysteriousEgg'], noReforge: true, desc: 'Needs the heat of battle to hatch.' }),
  mandrakeRoot: def({ type: 'mandrakeRoot', name: 'Mandrake', slot: 'item', baseWorth: 500,
    lines: all({}), effects: ['Mandrake'], noReforge: true, desc: 'Shatter it to release a mandrake ally.' }),
  moonstone: def({ type: 'moonstone', name: 'Moonstone', slot: 'item', baseWorth: 250,
    lines: all({ hp: 5 }), effects: ['Moonstone'], noReforge: true, desc: 'Brings on the Moon Frenzy at full moon.' }),
  cyclopsEye: def({ type: 'cyclopsEye', name: "Cyclops' Eye", slot: 'item', baseWorth: 50, market: false,
    lines: all({ cun: 1 }), effects: ['EyeBall'], noReforge: true, desc: '+2 accuracy; gives sight to the blind.' }),
  handOfMidas: def({ type: 'handOfMidas', name: 'Hand of Midas', slot: 'item', baseWorth: 400, market: false,
    lines: all({ blk: 1 }), effects: ['HandOfMidas', 'TempleArtifact', 'CannotUnequip'], noReforge: true, desc: '+1 favour, scatters coins after battle.' }),
  spectralSaddle: def({ type: 'spectralSaddle', name: 'Spectral Saddle', slot: 'item', baseWorth: 250, market: false,
    lines: all({ hp: 5 }), effects: ['Reins'], noReforge: true, desc: 'Summons a spectral rider, or empowers an existing one.' }),
  lookingGlass: def({ type: 'lookingGlass', name: 'Looking Glass', slot: 'item', baseWorth: 50, market: false,
    lines: all({}), effects: ['LookingGlass'], noReforge: true, desc: 'Lets you inspect every battle log.' }),
  loadedDice: def({ type: 'loadedDice', name: 'Loaded Dice', slot: 'item', baseWorth: 0, market: false,
    lines: all({}), effects: ['LoadedDice'], noReforge: true, desc: '+1 denarius per showman each week while owned.' }),
  mutagen: def({ type: 'mutagen', name: 'Mutagen', slot: 'item', baseWorth: 800, market: false,
    lines: all({}), effects: ['Mutagen'], upgrade: 'mutagenLab', noReforge: true,
    desc: '+1 wild point to STR, AGI and HP, and +1 to both mutation counters. One per creature.' }),
};

export const UNIQUES: Record<string, UniqueDef> = Object.fromEntries(([
  { key: 'swordOfMars', name: 'Talons of Mars', base: 'talonBlades', quality: 5, mods: {}, effects: ['Fear'], worth: 1800, desc: 'Frightens foes.' },
  { key: 'libertas', name: 'Libertas', base: 'talonBlades', quality: 5, mods: { dmg: 1, blk: -1 }, effects: ['CriticalHits'], worth: 3150, desc: 'Unearthed by the Wild Horde. +10 crit.' },
  { key: 'croceaMors', name: 'Crocea Mors', base: 'talonBlades', quality: 5, mods: {}, effects: ['RomanConquest'], worth: 2250, desc: "Caesar's talons. Iguanodons gain 30% lifesteal and +5 accuracy." },
  { key: 'darkFangs', name: 'Dark Fangs', base: 'fangCaps', quality: 5, mods: {}, effects: ['DarkBlade', 'CannotUnequip', 'BloodDrinker'], worth: 2250, desc: 'Cursed fangs that hunger for blood.' },
  { key: 'myrmex', name: 'Myrmex', base: 'ironJaws', quality: 5, mods: { dmg: 1 }, effects: ['Bleeding'], worth: 2700, desc: 'Iron jaws that cause bleeding.' },
  { key: 'fulgur', name: 'Fulgur', base: 'tailWhip', quality: 5, mods: { agi: 3 }, effects: ['Precision'], worth: 3240, desc: 'Crits cause bleeding instead of snaring.' },
  { key: 'bowOfApollo', name: "Apollo's Venom", base: 'venomSpitter', quality: 5, mods: { dmg: 1, blk: 1, reach: 4 }, effects: ['Apollo'], worth: 2700, desc: 'Opening shot even against other spitters.' },
  { key: 'thyrsus', name: 'Thyrsus', base: 'hornLance', quality: 5, mods: { dmg: -2 }, effects: ['AlwaysPoison'], worth: 2250, desc: 'Always poisons.' },
  { key: 'blackDeath', name: 'Black Death', base: 'obsidianCrusher', quality: 5, mods: { dmg: 1 }, effects: ['Fear', 'TempleArtifact'], worth: 3600, desc: 'The obsidian crusher of Necho II.' },
  { key: 'achillesSpear', name: "Achilles' Horn", base: 'bronzeHorn', quality: 5, mods: { dmg: 2, blk: 2, hp: 10, str: 2 }, effects: ['AchillesSpear'], worth: 3600, desc: 'Needs 30+ strength to wield well.' },
  { key: 'foundersAxe', name: "Founder's Club", base: 'tailClub', quality: 5, mods: { agi: 3 }, effects: ['CriticalHits'], worth: 2430, desc: 'Romulus\' tail club. No agility penalty, +10 crit.' },
  { key: 'poseidonsTrident', name: "Poseidon's Trident", base: 'tridentHorns', quality: 5, mods: {}, effects: [], worth: 2340, desc: 'Gift of the sea god.' },
  { key: 'lifeDrinker', name: 'Life Drinker', base: 'venomFangs', quality: 4, mods: { dmg: 2, blk: -1 }, effects: ['BloodDrinker'], worth: 1520, desc: 'Ritual fangs that drink life.' },
  { key: 'danaidDagger', name: 'Danaid Fang', base: 'fangCaps', quality: 5, mods: { dmg: 1 }, effects: ['Deceptive'], worth: 1800, desc: 'Deceptive: tricks and stuns land more often.' },
  { key: 'shieldOfLeonidas', name: 'Shield of Leonidas', base: 'bashPlate', quality: 5, mods: { str: 0, hp: 10 }, effects: ['Magnificent'], worth: 2200, desc: 'The Spartan king\'s plate.' },
  { key: 'taranisAegis', name: "Taranis' Aegis", base: 'hideShield', quality: 5, mods: { str: 1, hp: 10 }, effects: ['Taranis'], worth: 2200, desc: 'Triceratops and Tyrannosaurus add favour to block.' },
  { key: 'ancientCelticShield', name: 'Ancient Celtic Shield', base: 'hideShield', quality: 5, mods: { blk: -3 }, effects: [], worth: 1100, desc: 'It hums faintly.' },
  { key: 'ancile', name: 'Ancile', base: 'hideShield', quality: 5, mods: { blk: 1 }, effects: ['TempleArtifact'], worth: 1100, desc: 'Fell from Jupiter\'s sky.' },
  { key: 'helmetOfPericles', name: 'Helmet of Pericles', base: 'corinthianVisor', quality: 5, mods: { cun: 1, hp: 10 }, effects: [], worth: 3300, desc: 'Statesman\'s visor.' },
  { key: 'hannibalsHelmet', name: "Hannibal's Crest", base: 'carthaginianCrest', quality: 5, mods: { cun: 5 }, effects: ['HannibalSet'], worth: 2200, desc: 'Part of Hannibal\'s set.' },
  { key: 'hannibalsRegalia', name: "Hannibal's Regalia", base: 'camoHide', quality: 5, mods: {}, effects: ['HannibalSet'], worth: 4400, desc: 'Part of Hannibal\'s set.' },
  { key: 'hannibalsSandals', name: "Hannibal's Wraps", base: 'gripWraps', quality: 5, mods: {}, effects: ['HannibalSet'], worth: 1200, desc: 'Part of Hannibal\'s set.' },
  { key: 'alexandersArmor', name: "Alexander's Barding", base: 'quiltedBarding', quality: 5, mods: { str: 2, agi: 2, cun: 2 }, effects: [], worth: 5500, desc: 'Barding of the Macedonian king.' },
  { key: 'ksourEssef', name: 'Ksour Essef', base: 'bronzeBarding', quality: 5, mods: { agi: 2 }, effects: ['CarthageArmor'], worth: 5500, desc: 'Troodon wearers gain more.' },
  { key: 'helmOfWovenPath', name: 'Helm of the Woven Path', base: 'hornedHelm', quality: 1, mods: { hp: 5 }, effects: ['Heirloom'], worth: 300, desc: 'Grows with every victory.' },
  { key: 'lugh', name: 'Lugh of Hibernia', base: 'celticSpearman', quality: 5, mods: { agi: 5 }, effects: ['Magnificent', 'LightFooted'], worth: 6600, desc: 'A legendary rider. +5 accuracy.' },
] as UniqueDef[]).map((u) => [u.key, u]));

export const WEAPON_WORTH_MULT = [0.5, 1, 1.5, 3, 4, 9];
export const OTHER_WORTH_MULT = [0.5, 1, 1.5, 3, 5, 11];

export const AUGMENT_WORTH: Record<Augment, number> = {
  Lunar: 100, Solar: 100, Bloody: 150, Precision: 125, Blessed: 150, TimeWarped: 100, Broken: 0, BrokenTimeWarp: 0,
  Reinforced: 125, Fortified: 175, Vulcan: 200, Barded: 100,
};

export const AUGMENT_NAMES: Record<Augment, string> = {
  Lunar: 'Lunar', Solar: 'Solar', Bloody: 'Bloody', Precision: 'Precise', Blessed: 'Blessed', TimeWarped: 'Time-warped',
  Broken: 'Broken', BrokenTimeWarp: 'Broken time-warped', Reinforced: 'Reinforced', Fortified: 'Fortified', Vulcan: 'Vulcan',
  Barded: 'Barded',
};

export function gearDef(type: GearTypeId): GearDef {
  return GEAR[type];
}

/** Resolved stat line of a concrete piece: base quality line + augment + unique mods. Broken → all zero. */
export function gearLine(g: Gear): Required<Pick<GearQualityLine, 'dmg' | 'blk' | 'dr' | 'str' | 'agi' | 'cun' | 'hp' | 'reach'>> & { effects: GearEffect[]; charges: number } {
  const d = GEAR[g.type];
  const base = d.lines[g.quality] ?? {};
  const out = {
    dmg: base.dmg ?? 0, blk: base.blk ?? 0, dr: base.dr ?? 0, str: base.str ?? 0, agi: base.agi ?? 0, cun: base.cun ?? 0,
    hp: base.hp ?? 0, reach: (d.reach ?? 0) + (base.reach ?? 0), effects: [...d.effects, ...(base.effects ?? [])] as GearEffect[],
    charges: base.charges ?? 0,
  };
  if (g.unique && UNIQUES[g.unique]) {
    const u = UNIQUES[g.unique];
    out.dmg += u.mods.dmg ?? 0; out.blk += u.mods.blk ?? 0; out.dr += u.mods.dr ?? 0; out.str += u.mods.str ?? 0;
    out.agi += u.mods.agi ?? 0; out.cun += u.mods.cun ?? 0; out.hp += u.mods.hp ?? 0; out.reach += u.mods.reach ?? 0;
    out.effects.push(...u.effects);
  }
  switch (g.augment) {
    case 'Lunar': out.effects.push('Lunar'); break;
    case 'Solar': out.effects.push('Solar'); break;
    case 'Bloody': out.effects.push('BloodDrinker'); break;
    case 'Precision': out.effects.push('Precision'); break;
    case 'Blessed': out.effects.push('TempleArtifact'); break;
    case 'TimeWarped': out.effects.push('AscendedBlade'); break;
    case 'Reinforced': out.blk += 2; out.agi -= 1; break;
    case 'Fortified': out.blk += 3; break;
    case 'Vulcan': out.hp += 5; break;
    case 'Barded': out.blk += 2; out.agi -= 2; out.hp += 10; break;
    case 'Broken': case 'BrokenTimeWarp':
      return { dmg: 0, blk: 0, dr: 0, str: 0, agi: 0, cun: 0, hp: 0, reach: 0, effects: ['Broken'], charges: 0 };
  }
  if (g.sponsored) out.effects.push('Sponsored');
  if (g.charges !== undefined) out.charges = g.charges;
  return out;
}

export function gearHas(g: Gear | null | undefined, e: GearEffect): boolean {
  if (!g) return false;
  return gearLine(g).effects.includes(e);
}

export function gearWorth(g: Gear): number {
  const d = GEAR[g.type];
  if (g.unique && UNIQUES[g.unique]) {
    const u = UNIQUES[g.unique];
    return g.augment === 'Broken' || g.augment === 'BrokenTimeWarp' ? Math.floor(u.worth / 10) : u.worth;
  }
  if (g.type === 'bottledLightning') return 500;
  let base = d.baseWorth;
  if (g.augment) base += g.augment === 'Blessed' && d.slot !== 'weapon' ? 250 : AUGMENT_WORTH[g.augment];
  const mult = (d.slot === 'weapon' ? WEAPON_WORTH_MULT : OTHER_WORTH_MULT)[g.quality];
  let w = Math.floor(base * mult);
  if (g.augment === 'Broken' || g.augment === 'BrokenTimeWarp') w = Math.floor(w / 10);
  return w;
}

export function gearName(g: Gear): string {
  if (g.name) return g.name;
  if (g.unique && UNIQUES[g.unique]) return UNIQUES[g.unique].name;
  const d = GEAR[g.type];
  const q = ['Shoddy', 'Old', 'Regular', 'Quality', 'Master-crafted', 'Legendary'][g.quality];
  const aug = g.augment ? AUGMENT_NAMES[g.augment] + ' ' : '';
  return d.slot === 'item' && d.consumable ? d.name : `${q} ${aug}${d.name}`;
}

export function isTwoHanded(g: Gear | null | undefined): boolean {
  return !!g && (gearHas(g, 'TwoHandedOnly'));
}

export const GEAR_TYPES = Object.keys(GEAR) as GearTypeId[];

export function makeGear(type: GearTypeId, quality: Quality, id: string, extra: Partial<Gear> = {}): Gear {
  const d = GEAR[type];
  const g: Gear = { id, type, quality, ...extra };
  const line = d.lines[quality];
  if (line?.charges && g.charges === undefined) g.charges = line.charges;
  return g;
}
