// Jurassic Ludus — shared state model and ID unions.
// Every engine module and the UI import from here. See DESIGN.md for the mapping
// from Gladiator Manager concepts to these names.

export type ID = string;

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type Stat = 'str' | 'agi' | 'cun' | 'hp';
export const STATS: Stat[] = ['str', 'agi', 'cun', 'hp'];
export interface Stats { str: number; agi: number; cun: number; hp: number }

/** Shoddy, Old, Regular, Quality, MasterCrafted, Legendary */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5;
export const QUALITY_NAMES = ['Shoddy', 'Old', 'Regular', 'Quality', 'Master-crafted', 'Legendary'] as const;

export type Sex = 'M' | 'F';
export type CreatureKind = 'dino' | 'beast';

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export type DinoSpeciesId =
  | 'velociraptor' | 'dilophosaurus' | 'troodon' | 'allosaurus' | 'carnotaurus'
  | 'tyrannosaurus' | 'spinosaurus' | 'triceratops' | 'ankylosaurus' | 'stegosaurus'
  | 'iguanodon' | 'parasaurolophus' | 'pachycephalosaurus' | 'therizinosaurus'
  | 'brachiosaurus' | 'giganotosaurus';

export type BeastSpeciesId =
  | 'direwolf' | 'alphadirewolf' | 'sabertooth' | 'direbear' | 'sarcosuchus' | 'terrorbird'
  | 'woollyrhino' | 'mammoth' | 'gigantopithecus'
  // mythic (not breedable)
  | 'harpy' | 'minotaur' | 'medusa' | 'cyclops' | 'manticore' | 'hydra' | 'lesserhydra'
  | 'wraith' | 'wyvern' | 'mandrake';

export type SpeciesId = DinoSpeciesId | BeastSpeciesId;

export type BodyPlan =
  | 'raptor' | 'theropod' | 'spino' | 'ceratops' | 'ankylo' | 'stego' | 'hadro' | 'pachy'
  | 'theriz' | 'sauropod'
  | 'wolf' | 'cat' | 'bear' | 'croc' | 'bird' | 'rhino' | 'mammoth' | 'ape'
  | 'harpy' | 'minotaur' | 'serpent' | 'giant' | 'manticore' | 'hydra' | 'wraith' | 'wyvern' | 'mandrake';

export type Size = 'S' | 'M' | 'L' | 'H';
export type Diet = 'carn' | 'herb';
export type EggSize = 'small' | 'medium' | 'large' | 'xlarge' | 'mythic';
export type KibbleTier = 'simple' | 'regular' | 'superior' | 'exceptional' | 'extraordinary';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  kind: CreatureKind;
  body: BodyPlan;
  size: Size;
  base: Stats;
  /** relative weights for distributing wild points at generation */
  weights: Stats;
  diet: Diet;
  repro: 'egg' | 'gestation' | 'none';
  eggSize: EggSize;
  incubWeeks: number;
  tempRange: [number, number];
  gestationWeeks: number;
  matureWeeks: number;
  mateCooldown: number;
  kibble: KibbleTier;
  favClass?: ClassId;
  disClass?: ClassId;
  /** short descriptions shown in the UI */
  basicBonus: string;
  advancedBonus: string;
  /** natural techniques every member knows (beasts) or starts with (bred dinos) */
  natural: TechId[];
  /** innate traits every member gets at creation */
  innateTraits?: TraitId[];
  /** default color palette indices per region (6 regions) */
  palette: number[][];
  mythic?: boolean;
  /** market availability: earliest week a normal (non-epic) roll can produce it */
  marketFromWeek: number;
  /** relative market weight */
  marketWeight: number;
  upgrade?: UpgradeId;
  flavour: string;
}

// ---------------------------------------------------------------------------
// Classes, families, techniques, traits
// ---------------------------------------------------------------------------

export type ClassId = 'bulwark' | 'spitter' | 'snarer' | 'slasher' | 'phalanx' | 'brute' | 'brawler' | 'lasher';
export type WeaponFamily = 'claw' | 'fang' | 'horn' | 'mace' | 'spit' | 'jaw' | 'whip';
export const WEAPON_FAMILIES: WeaponFamily[] = ['claw', 'fang', 'horn', 'mace', 'spit', 'jaw', 'whip'];

export type TechId =
  | 'Smash' | 'Kick' | 'Lunge' | 'Sunder' | 'ThrowSand' | 'Parry' | 'Headbutt' | 'Feint'
  | 'Charge' | 'Decimate' | 'Gouge' | 'Rally' | 'Disarm' | 'Rampage' | 'Warcry' | 'Cleave'
  | 'Execute' | 'StrikeAndRoll' | 'CheapShot' | 'ShieldBash' | 'HailOfArrows' | 'Impale'
  | 'Uppercut' | 'Thunderstrike' | 'Fireball' | 'Hurricane' | 'Maul' | 'Swipe' | 'Bite'
  | 'Pounce' | 'SneakAttack';

export interface TechniqueDef {
  id: TechId;
  name: string;           // dino display name (e.g. Smash -> "Crushing Bite")
  stat: Stat;             // main stat for requirement
  req: number;            // base requirement; rank r needs req + floor(req/2)*(r-1)
  cooldown: number;
  basePriority: number;
  dmgBase: number;        // d at rank 1
  dmgPerRank: number;     // +d per rank
  weaponAttack: boolean;
  piercing?: boolean;
  rare?: boolean;
  beastOnly?: boolean;
  mythical?: boolean;
  upgrade?: UpgradeId;
  maxRank: number;
  desc: string;
}

export interface LearnedTech {
  id: TechId;
  rank: number;
  equipped: boolean;
}

export type TraitId =
  | 'Strong' | 'Underdog' | 'Sneaky' | 'Untrustworthy' | 'Veteran' | 'Fanatic' | 'Giant' | 'Talented'
  | 'TrueGrit' | 'ExoticFightingStyle' | 'MasterHorseman' | 'ManOfGlass' | 'Preparation' | 'Loyal'
  | 'Tough' | 'Fury' | 'Temperamental' | 'Inspiring' | 'Tactician' | 'QuickStudy' | 'BeastTamer'
  | 'Bestiarii' | 'Conditioning' | 'OneManArmy' | 'Hero' | 'RebelSlayer' | 'Pyromaniac' | 'DualWield'
  | 'PoisonMaster' | 'LostFamily' | 'Mithridatism' | 'Assassin' | 'SuddenDeath' | 'Killer'
  | 'ArenaChampion' | 'PitFighter' | 'PitChampion' | 'ColossusSlayer' | 'PitLegend' | 'BaneOfTigris'
  | 'WorldChampion' | 'ReunitedWithFamily' | 'RevoltLeader' | 'Lawbringer' | 'ShowMan' | 'Enforcer'
  | 'Doctore' | 'Adopted' | 'FirstBlood' | 'RebelLeader' | 'LunarChampion' | 'Mythical'
  | 'HorribleDisfigurement' | 'PartiallyBlind' | 'Blind' | 'BumLeg' | 'Crippled' | 'Anemic'
  | 'MissingFingers' | 'Concussion' | 'DemandingFreedom' | 'AllIn' | 'Ambidextrous' | 'LightningSpeed'
  | 'Hunter' | 'SurvivalOfTheFittest' | 'ForceOfNature' | 'FeralIntelligence' | 'AnimalInstinct'
  | 'SharpenedClaws' | 'SelfPreservation' | 'BestiaSummum' | 'Alpha' | 'ThickHide' | 'SolarChampion'
  | 'BacchusChampion' | 'JupiterChampion' | 'VulcanChampion' | 'AnnumChampion' | 'EquesSlayer'
  | 'Psychopath' | 'RebelGeneral' | 'PlottingUprising' | 'Titan' | 'Ascended' | 'Reincarnated'
  | 'RaisedInTheArena' | 'Thief' | 'Underhanded' | 'Impact' | 'Carnivorous' | 'Indomitable'
  | 'ApolloBlessing' | 'GoodBoy' | 'BestBoy' | 'Alert' | 'Albino' | 'GlorySeeker' | 'Agile' | 'Arrogant'
  | 'BladeWhisperer' | 'AxialMomentum' | 'PiercingPrecision' | 'ShadowBlade' | 'DeafeningCrackle'
  | 'FistsOfSteel' | 'Freedom' | 'PoisonedClaws' | 'Undeath' | 'Marksman' | 'Devotion' | 'BlindFighter'
  | 'Hoplite' | 'LordOfCinders' | 'TitanicStrength' | 'Adventurous' | 'Recaptured' | 'Ruthless'
  | 'SpartanResolve' | 'LifeBringer' | 'Bloodstarved' | 'Pugilist' | 'PankrationChampion'
  | 'CelestialChampion' | 'Careful' | 'Paranoid' | 'ManyHeads' | 'Lycanthropy' | 'HerculeanStrength'
  | 'Cataphractoi' | 'Deadeye' | 'ExplosiveRelease' | 'Intangible' | 'ReincarnatedBeast' | 'ColdBlooded'
  | 'ManEater' | 'Duelist' | 'Flying' | 'Escaped'
  // Jurassic Ludus additions (breeding)
  | 'Fertile' | 'Sterile' | 'Runt' | 'Hatchling';

export type TraitPolarity = '+' | '-' | '±';
export type TraitSource = 'R' | 'W' | 'C' | 'T' | 'E' | 'I' | 'B' | 'L' | 'X';

export interface TraitDef {
  id: TraitId;
  name: string;          // display name (dino flavoured)
  polarity: TraitPolarity;
  stats: Partial<Stats>; // permanent change applied once when gained (goes to creature.bonus)
  injury: number;        // injury-proneness modifier
  loyalty: number;       // weekly tameness drift
  techPoint?: number;    // extra technique points granted
  desc: string;
  sources: TraitSource[];
  /** inherited through breeding (DESIGN §4.2) */
  heritable?: boolean;
  /** carried over by reincarnation (GM list) */
  reincarnationValid?: boolean;
  beastOnly?: boolean;
  wound?: boolean;       // permanent wound trait (removable by surgery)
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

export type GearSlot = 'weapon' | 'offhand' | 'armor' | 'helmet' | 'rider' | 'item';

export type GearTypeId =
  // weapons
  | 'fangCaps' | 'venomFangs' | 'talonBlades' | 'greatTalons' | 'parryingSpurs' | 'sickleClaws'
  | 'hookClaws' | 'scytheClaws' | 'tailClub' | 'ankyloHammer' | 'obsidianCrusher' | 'hornLance'
  | 'bronzeHorn' | 'tridentHorns' | 'spineDarts' | 'venomSpitter' | 'ironJaws' | 'tailWhip'
  // off-hand (shields / bola)
  | 'hideShield' | 'strappedBuckler' | 'frillGuard' | 'bronzeFrillGuard' | 'bashPlate' | 'bolaRig'
  // armor (barding)
  | 'lightHarness' | 'camoHide' | 'studdedBarding' | 'quiltedBarding' | 'bronzeBarding'
  | 'legionBarding' | 'cataphractBarding'
  // helmets
  | 'huntersHood' | 'bronzeMuzzle' | 'legionFaceplate' | 'carthaginianCrest' | 'hornedHelm'
  | 'corinthianVisor' | 'championsCrest' | 'tigrisSkull'
  // riders
  | 'numidianLancer' | 'celticSpearman' | 'spectralRider'
  // items
  | 'poultice' | 'antivenom' | 'neptuneCharm' | 'eagleEyeCharm' | 'luckyTooth' | 'gripWraps'
  | 'legPlates' | 'caltrops' | 'silphium' | 'bestiaryScroll' | 'bottledLightning' | 'amberShard'
  | 'monsterTrophy' | 'mysteriousEgg' | 'mandrakeRoot' | 'moonstone' | 'cyclopsEye' | 'handOfMidas'
  | 'spectralSaddle' | 'lookingGlass' | 'loadedDice' | 'mutagen';

/** Combat/economy effect flags carried by gear definitions, augments and uniques. */
export type GearEffect =
  | 'Backstab' | 'Concealed' | 'DualWieldable' | 'TwoHanded' | 'TwoHandedOnly' | 'Scutum'
  | 'XiphosBlock' | 'BypassShield' | 'Khopesh' | 'Falcata' | 'HandToHand' | 'Whip' | 'Sauroter'
  | 'Fuscina' | 'Pilum' | 'Bow' | 'Fear' | 'Bleeding' | 'AlwaysPoison' | 'Lunar' | 'Solar'
  | 'BloodDrinker' | 'BloodLust' | 'Precision' | 'TempleArtifact' | 'AscendedBlade' | 'Broken'
  | 'Strapped' | 'ShieldBash' | 'Net' | 'HookedNet' | 'Stealthy' | 'Mobility' | 'GreaterMobility'
  | 'Sturdy' | 'VerySturdy' | 'Heavy' | 'CarthageHelmet' | 'CarthageArmor' | 'StunResist'
  | 'CriticalBlock' | 'Magnificent' | 'FamilyItem' | 'CriticalHits' | 'Deceptive' | 'RomanConquest'
  | 'Egyptian' | 'LightFooted' | 'Taranis' | 'Fragile' | 'Apollo' | 'Heirloom' | 'EagleVision'
  | 'PoisonResistance' | 'Bandage' | 'Antidote' | 'Caltrops' | 'Mandrake' | 'Moonstone' | 'EyeBall'
  | 'HandOfMidas' | 'Reins' | 'MysteriousEgg' | 'Silphium' | 'TomeOfTraits' | 'BottledLightning'
  | 'AmberShard' | 'MonsterLoot' | 'LookingGlass' | 'LoadedDice' | 'LuckyRing' | 'Mutagen'
  | 'Sponsored' | 'CannotUnequip' | 'DarkBlade' | 'AchillesSpear' | 'ThunderGod' | 'Cataphract'
  | 'Legionary' | 'HannibalSet' | 'ElephantFear' | 'Rider' | 'Hurricane' | 'NoReforge' | 'PitOnly';

export type Augment =
  | 'Lunar' | 'Solar' | 'Bloody' | 'Precision' | 'Blessed' | 'TimeWarped' | 'Broken' | 'BrokenTimeWarp'
  | 'Reinforced' | 'Fortified' | 'Vulcan' | 'Barded';

/** Per-quality stat line of a gear type. */
export interface GearQualityLine {
  dmg?: number;
  blk?: number;
  dr?: number;
  str?: number;
  agi?: number;
  cun?: number;
  hp?: number;
  reach?: number;
  effects?: GearEffect[];
  charges?: number;
}

export interface GearDef {
  type: GearTypeId;
  name: string;
  slot: GearSlot;
  family?: WeaponFamily;
  /** base reach for weapons/riders */
  reach?: number;
  baseWorth: number;
  /** six entries, Shoddy..Legendary */
  lines: GearQualityLine[];
  effects: GearEffect[];
  isShield?: boolean;
  isNet?: boolean;
  heavy?: boolean;
  /** gem/amber upgrade required to buy/forge */
  upgrade?: UpgradeId;
  /** minimum forge level to forge (undefined = not forgeable) */
  forge?: number;
  /** needs workshop to craft */
  workshop?: boolean;
  consumable?: boolean;
  /** cannot be reforged */
  noReforge?: boolean;
  /** shown in normal market rolls */
  market: boolean;
  desc: string;
}

/** Unique/legendary relic definition (e.g. Libertas, Crocea Mors). */
export interface UniqueDef {
  key: string;
  name: string;
  base: GearTypeId;
  quality: Quality;
  mods: GearQualityLine;      // added on top of the base line
  effects: GearEffect[];
  worth: number;
  desc: string;
}

export interface Gear {
  id: ID;
  type: GearTypeId;
  quality: Quality;
  augment?: Augment;
  /** UniqueDef.key for relics */
  unique?: string;
  /** custom display name (kept on reforge) */
  name?: string;
  /** remaining uses for consumables / throwables */
  charges?: number;
  /** generic per-item state: Dark Fangs hunger stage, egg hatch progress, heirloom score */
  state?: number;
  sponsored?: boolean;
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

export type InjuryType = 'flesh' | 'broken' | 'severe' | 'multiple';
export interface Injury { type: InjuryType; weeks: number }

export type Instruction = 'default' | 'allout' | 'kill' | 'care' | 'throw';

export interface MutationRecord { stat: Stat; side: 'matri' | 'patri'; week: number; color?: number }

export interface Genetics {
  /** inherited wild points per stat */
  wild: Stats;
  /** 6 color regions, palette color indices */
  colors: number[];
  mutMatri: number;
  mutPatri: number;
  /** mutations that happened at this creature's own birth */
  mutations: MutationRecord[];
  /** cumulative mutated wild points per stat along the lineage (display/analytics) */
  mutatedPoints: Stats;
  generation: number;
  motherId?: ID;
  fatherId?: ID;
  motherName?: string;
  fatherName?: string;
  /** 0..1 */
  imprint: number;
  bred: boolean;
  /** taming effectiveness bonus applied at capture (0..0.5), informational */
  tamingEffectiveness?: number;
}

export type ImprintKind = 'cuddle' | 'walk' | 'feed';
export interface ImprintRequest { kind: ImprintKind; food?: FoodId; done: boolean }

export interface CareerStats {
  wins: number;
  losses: number;
  kills: number;
  /** "major" tournament wins (rudis/release requests) */
  majorWins: number;
  tournamentWins: number;
  pitBest: number;
  biggestHit: number;
  battles: number;
  trophies: string[];
  leaguePoints: number;
}

export interface Creature {
  id: ID;
  name: string;
  kind: CreatureKind;
  species: SpeciesId;
  sex: Sex;

  /** 0..1, 1 = adult */
  maturity: number;
  /** weeks lived as an adult (drives the GM age table via eqAge) */
  adultWeeks: number;
  /** total weeks since hatching */
  ageWeeks: number;

  genes: Genetics;
  dom: Stats;
  bonus: Stats;

  xp: number;
  level: number;
  statPoints: number;
  techPoints: number;
  techniques: LearnedTech[];
  /** rare techniques made learnable */
  learnable: TechId[];
  /** player's technique priority order (Tactician) */
  techOrder?: TechId[];
  traits: TraitId[];
  cls: ClassId | null;
  classXp: number;
  prof: Record<WeaponFamily, number>;

  loyalty: number;
  fame: number;
  injury: Injury | null;
  /** weeks of illness remaining */
  ill: number;
  career: CareerStats;

  /** gear ids assigned from the owner's armory */
  gear: Partial<Record<GearSlot, ID>>;
  instruction: Instruction;

  /** away on adventure/loan/expedition/campaign */
  away?: { kind: 'adventure' | 'loan' | 'expedition' | 'campaign' | 'delphi'; weeksLeft: number; ref?: string; note?: string };
  /** used this week (agent, sparring, tournament) */
  inactive: boolean;
  rewardCooldown: number;
  rebellionGrace: boolean;
  speciesLevel: 0 | 1 | 2;
  reincarnation: number;
  /** gear happiness (GM 9.6) */
  happiness: number;
  lastGearWorth: number;
  /** id of the house this creature secretly spies for */
  spyFor?: ID;

  // breeding
  mateCooldown: number;
  pregnancy?: { weeksLeft: number; fatherId: ID; litter: Genetics[]; sexes: Sex[] };
  imprintRequest?: ImprintRequest | null;
  hungerWeeks?: number;
  /** count of offspring produced */
  offspring: number;

  // beasts
  treats?: number;
  treatedThisWeek?: boolean;

  /** unique legend key ('spartacus', 'gannicus', 'theokoles', starters…) */
  legend?: string;
  /** fixed market price override */
  price?: number;
  nickname?: string;
  favourite?: boolean;
  offerToRivals?: boolean;
  autoManage?: boolean;
  bornWeek?: number;
  /** name of the ludus where it hatched */
  hatchedAt?: string;
  /** free-form notes (scripted gear hints, history) */
  notes?: string[];
  /** epic market roll */
  epic?: boolean;
  /** week of the last trait-gain etc. (generic counters) */
  counters?: Record<string, number>;
}

/** Light pedigree record kept after a creature dies or is sold. */
export interface AncestorRecord {
  id: ID;
  name: string;
  species: SpeciesId;
  sex: Sex;
  wild: Stats;
  colors: number[];
  mutMatri: number;
  mutPatri: number;
  mutations: MutationRecord[];
  generation: number;
  motherId?: ID;
  fatherId?: ID;
  imprint: number;
  level: number;
  fame: number;
  fate?: string;
  house?: string;
}

// ---------------------------------------------------------------------------
// Eggs, food, breeding pairs
// ---------------------------------------------------------------------------

export type FoodId = 'rawMeat' | 'primeMeat' | 'mejoberries' | 'kibble_simple' | 'kibble_regular'
  | 'kibble_superior' | 'kibble_exceptional' | 'kibble_extraordinary';

export interface Egg {
  id: ID;
  species: SpeciesId;
  fertilized: boolean;
  motherId?: ID;
  fatherId?: ID;
  motherName?: string;
  fatherName?: string;
  /** rolled at laying for fertilized eggs */
  genes?: Genetics;
  sex?: Sex;
  /** 0..1 */
  health: number;
  /** weeks of in-range incubation done */
  progress: number;
  needed: number;
  laidWeek: number;
  source: 'bred' | 'market' | 'event' | 'rival';
  /** genetics visible to the player */
  known: boolean;
  /** temperature last week (°C) after hatchery adjustment */
  lastTemp?: number;
  price?: number;
}

export interface BreedingPair { maleId: ID; femaleId: ID; since: number }

// ---------------------------------------------------------------------------
// Houses (ludi)
// ---------------------------------------------------------------------------

export type BuildingId =
  | 'residence' | 'trainingField' | 'mine' | 'forge' | 'veterinarium' | 'palisade' | 'saddlery'
  | 'templeOfPluto' | 'library' | 'breedingPen' | 'hatchery' | 'nursery' | 'kitchen'
  | 'ariminiumCamp' | 'shrine' | 'workshop' | 'guardTower' | 'aqueduct'
  | 'romeMansion' | 'tavern' | 'bathHouse';

export type TrainingType = 'light' | 'standard' | 'intense' | 'technique';

export interface Keepers { unassigned: number; miners: number; showmen: number; wardens: number; spies: number }
export type KeeperJob = keyof Keepers;

export type FinancialPersonality = 'greedy' | 'spender' | 'balanced' | 'crazy';
export type ArenaPersonality = 'conservative' | 'balanced' | 'risktaker' | 'crazy';
export type Honesty = 'honest' | 'neutral' | 'dishonest' | 'treacherous';
export type ClassMindset = 'always' | 'normal' | 'prioexp';
export type Preference = 'cheap' | 'talented' | 'established' | 'quick' | 'strong' | 'cunning' | 'mythic' | 'tough';

export interface Personality {
  financial: FinancialPersonality;
  arena: ArenaPersonality;
  honesty: Honesty;
  training: TrainingType;
  classMindset: ClassMindset;
  prefers: Preference[];
}

export type RivalKey = 'batiatus' | 'solonius' | 'decimus' | 'magnus' | 'vettius' | 'caesar' | 'crassus'
  | 'hannibal' | 'random';

export type DefeatReason = 'debt' | 'uprising' | 'raid' | 'horde' | 'surrender';

export interface TrophyRecord { league: LeagueId | string; place: 1 | 2 | 3; week: number; creatureName: string }

export interface AIState {
  key: RivalKey;
  personality: Personality;
  /** raw opinion of the player; starts 50; can go negative */
  opinion: number;
  hatedRival?: RivalKey;
  visible: boolean;
  tookLoan: boolean;
  /** creature id -> last week it was offered to the player */
  lastOffers: Record<ID, number>;
  /** player made an offer to this rival this week */
  offeredThisWeek: boolean;
  /** ally via Ludus Pact */
  pact: boolean;
  /** misc AI flags/counters */
  flags: Record<string, number>;
}

export interface Ludus {
  id: ID;
  name: string;
  isPlayer: boolean;
  /** portrait key for UI */
  portrait?: string;

  denarii: number;
  influence: number;
  allocatedInfluence: number;
  /** permanent weekly denarii modifier (GM "projected denarii") */
  projected: number;
  miningBonus: number;
  entBonus: number;
  securityPenalties: number;
  keepers: Keepers;
  /** spies assigned at the start of last week (committed spies base) */
  spiesLastWeek: number;

  buildings: Record<BuildingId, number>;
  builtThisWeek: boolean;

  creatures: Creature[];
  armory: Gear[];
  pantry: Partial<Record<FoodId, number>>;
  eggs: Egg[];
  pairs: BreedingPair[];

  bankruptLastWeek: boolean;
  unpaidThisWeek: boolean;
  defeated?: DefeatReason;

  doctoreId?: ID;
  training: {
    type: TrainingType;
    overrides: Record<ID, TrainingType>;
    paid: { bestiarii: boolean; spartan: boolean; weapons: boolean };
    sparring: { a: ID; b: ID }[];
  };
  trophies: TrophyRecord[];
  /** rival houses only */
  ai?: AIState;
  /** set during week when targeted by intrigue */
  targetedThisWeek: boolean;
  /** agent ids caught spying on this house */
  caught: ID[];
  /** surgeries used this week */
  surgeriesThisWeek: number;
  /** id of currently bonded (adopted) creature */
  bondedId?: ID;
  /** Legends champion tier: 0 none, 1 bronze … 4 diamond */
  championTier: number;
}

// ---------------------------------------------------------------------------
// Tournaments & leagues
// ---------------------------------------------------------------------------

export type TournamentType =
  | 'normal' | 'rookie' | 'junior' | 'underground' | 'hippodrome' | 'challenge' | 'gigantus'
  | 'pankration' | 'triumph' | 'league' | 'final' | 'mars' | 'spartanPankration' | 'poseidon'
  | 'troy' | 'hyperion' | 'prophecy' | 'ascension' | 'invader' | 'organized';

export type MountRule = 'none' | 'opening' | 'final' | 'full';
export type LeagueId = 'lunar' | 'solar' | 'bacchus' | 'jupiter' | 'vulcan' | 'annum';
export type Weather = 'sunny' | 'windy' | 'overcast' | 'rain';

export interface TournamentDef {
  /** stable key for scripted events ("romesFinest", "initium", "pits"...) */
  key: string;
  name: string;
  week: number;
  perTeam: number;
  teams: number;
  fee: number;
  underground: boolean;
  organizerId?: ID;
  mounts: MountRule;
  beasts: boolean;
  type: TournamentType;
  league?: LeagueId;
  /** double points finale */
  leagueFinale?: boolean;
  /** bonus rounds N (fought N+1 per GM) for underground-style events */
  bonusRounds?: number;
  /** no gear at all */
  natural?: boolean;
  /** custom rounds per battle */
  rounds?: number;
  /** extra info for special events */
  special?: string;
  upgrade?: UpgradeId;
}

export interface Entry {
  houseId: ID;
  creatureIds: ID[];
  /** for invaders/scripted opponents that are not in any house */
  temp?: Creature[];
  eliminated: boolean;
  roundsWon: number;
}

export interface MatchRecord {
  round: number;
  a: number;          // entry index
  b: number;          // entry index
  winner?: number;    // entry index
  summary?: string;
  playerInvolved: boolean;
}

export interface Tournament extends TournamentDef {
  id: ID;
  entries: Entry[];
  matches: MatchRecord[];
  currentRound: number;
  /** bonus round reached in pits (0 = still in bracket) */
  bonusRound: number;
  status: 'open' | 'running' | 'bonus' | 'done';
  weather: Weather;
  spectators?: number;
  attended?: boolean;
  /** player retired from bonus rounds */
  retired?: boolean;
  log: string[];
}

export interface League {
  id: LeagueId;
  name: string;
  start: number;
  end: number;
  pool: number;
  active: boolean;
  done: boolean;
  /** creature id -> points (also kept on creature.career.leaguePoints) */
  points: Record<ID, number>;
  /** creature id -> house id for display */
  owners: Record<ID, ID>;
  names: Record<ID, string>;
  upgrade?: UpgradeId;
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

export type SideModifier = 'Surrounded' | 'Walled' | 'Surprised' | 'CurseOfTime' | 'Chained' | 'PoisonedWeapons';
export type CheatType = 'poison' | 'chains' | 'beast' | 'guards';

export interface BattleFighter {
  creature: Creature;
  /** resolved gear for this battle (already chosen) */
  gear: Partial<Record<GearSlot, Gear | null>>;
  instruction: Instruction | null;
  /** temporary fighter (escaped beast, mandrake) */
  temporary?: boolean;
}

export interface BattleSide {
  houseId?: ID;
  name: string;
  fighters: BattleFighter[];
  modifiers: SideModifier[];
  injuryMod: number;
  /** influence of the owner, used for crowd ties */
  influence: number;
  /** side is controlled by the player */
  player?: boolean;
}

export interface BattleOptions {
  week: number;
  rounds?: number;
  toTheDeath?: boolean;
  event?: boolean;
  sparring?: boolean;
  /** riders allowed this battle */
  riders: boolean;
  /** no gear at all (Primal Bout) */
  natural?: boolean;
  /** favour bonus for houses with Temple of Pluto etc. keyed by side index */
  favoured?: [boolean, boolean];
  /** Bath House: most famous creature +10 HP, by side */
  bathHouse?: [ID | undefined, ID | undefined];
  /** Ascension: Cronus curse on player side */
  label?: string;
}

export type LogKind =
  | 'start' | 'round' | 'attack' | 'miss' | 'crit' | 'glance' | 'tech' | 'status' | 'heal' | 'ko'
  | 'yield' | 'trick' | 'info' | 'transform' | 'end';

export interface BattleLogLine {
  round: number;
  kind: LogKind;
  text: string;
  /** fighter index in the combined list (side 0 fighters first) */
  actor?: number;
  target?: number;
  dmg?: number;
  crit?: boolean;
  tech?: TechId;
  /** HP of every fighter after this line */
  hp: number[];
}

export interface FighterOutcome {
  creatureId: ID;
  side: 0 | 1;
  temporary?: boolean;
  knockedOut: boolean;
  yielded: boolean;
  died: boolean;
  injury: Injury | null;
  xp: number;
  fame: number;
  loyalty: number;
  newTraits: TraitId[];
  /** id of creature that delivered the KO */
  killedBy?: ID;
  hpEnd: number;
  hpMax: number;
  bandageUsed?: boolean;
  biggestHit: number;
}

export interface BattleResult {
  winner: 0 | 1;
  decidedBy: 'ko' | 'crowd' | 'forfeit';
  rounds: number;
  log: BattleLogLine[];
  fighters: { id: ID; name: string; species: SpeciesId; side: 0 | 1; hpMax: number; colors: number[]; sex: Sex; maturity: number; rider?: boolean; weapon?: GearTypeId; armor?: GearTypeId }[];
  outcomes: FighterOutcome[];
  /** did the player side cheat, used for opinion effects */
  cheated?: [boolean, boolean];
  /** which side is the player's, when the player fights */
  playerSide?: 0 | 1;
}

// ---------------------------------------------------------------------------
// Influence, politics, intrigue
// ---------------------------------------------------------------------------

export type OpportunityId =
  | 'publicSessions' | 'bribeGeneral' | 'theOrganizer' | 'classTraining' | 'weightedTraining' | 'imperator'
  | 'lobbySenate' | 'marketConnections' | 'powerBegetsPower' | 'socializer' | 'electedSenator'
  | 'princepsSenatus' | 'consul'
  | 'takeLoan' | 'informants' | 'forbiddenContraband' | 'gambler' | 'bacchusPatron' | 'veilOfNight';

export interface ElectionState {
  office: 'senate' | 'consul';
  startWeek: number;
  votes: number;
  smear: boolean;
  campaigners: ID[];
  history: number[];
  lastInfluence: number;
}

export type IntrigueAction = 'assassinate' | 'poison' | 'persuade' | 'steal' | 'sabotage' | 'raid';

export interface IntrigueOrder {
  id: ID;
  action: IntrigueAction;
  agentId: ID;
  targetHouseId: ID;
  targetCreatureId?: ID;
  scenario: number;
  /** player decided after seeing the scenario */
  decision?: 'proceed' | 'retreat';
  resolved?: boolean;
  report?: string;
}

/** A rival's intrigue attempt against the player awaiting the defender prompt. */
export interface PendingDefense {
  id: ID;
  rivalId: ID;
  action: IntrigueAction;
  agentId: ID;
  targetCreatureId?: ID;
  prompt: number;
  chance: number;
}

// ---------------------------------------------------------------------------
// Rebels (Wild Horde)
// ---------------------------------------------------------------------------

export interface Horde {
  rogues: Creature[];
  ferals: number;
  spoils: number;
  spartacusFree: boolean;
  spartacusDead: boolean;
  defeated: boolean;
  libertasForged: boolean;
  lastSenateWeek: number;
  expeditionsEnabled: boolean;
  lastRaidOnPlayer: number;
  lastRaidWeek: number;
  /** redirected next raid at a rival (Spartacus bounty) */
  bountyTarget?: ID;
  armory: Gear[];
}

export interface Expedition {
  commanderId: ID;
  funds: number;
  keepers: number;
  capture: boolean;
  weeksLeft: number;
  tactics: string[];
  chosenTactic?: string;
  militia: number;
}

// ---------------------------------------------------------------------------
// Decisions, stories, messages, objectives
// ---------------------------------------------------------------------------

export interface DecisionOption {
  label: string;
  desc?: string;
  disabled?: boolean;
  reason?: string;
}

export interface Decision {
  id: ID;
  /** event registry key */
  key: string;
  title: string;
  text: string;
  options: DecisionOption[];
  week: number;
  /** event-specific payload (creature ids, amounts…) */
  data: Record<string, any>;
  /** portrait/art key */
  art?: string;
}

export interface DelayedOutcome { id: ID; key: string; week: number; data: Record<string, any> }

export interface Adventure {
  id: ID;
  key: string;
  title: string;
  creatureIds: ID[];
  weeksLeft: number;
  data: Record<string, any>;
}

export type StoryLineId =
  | 'soloniusThrow' | 'loanRequest' | 'murderPlot' | 'carthaginianArtifact' | 'macedonianRebels'
  | 'spartacusEscape' | 'hannibalSandals' | 'bowOfApollo' | 'pythiaVisions' | 'spartacusBounty'
  | 'godsChosen' | 'tombOfThePharaoh' | 'restorationOfTroy' | 'mysteriousHag' | 'ludusPact'
  | 'trainGladiator' | 'graveRobbing' | 'mansionForSale' | 'takingACloserLook' | 'studRequest';

export type StoryActor =
  | 'solonius' | 'batiatus' | 'vettius' | 'decimus' | 'caesar' | 'magnus' | 'crassus' | 'hannibal'
  | 'spartacus' | 'pythia' | 'hector' | 'hag' | 'veteran' | 'spy' | 'unknown' | 'player' | 'narrator';

export interface StoryLine { actor: StoryActor; text: string; choiceDependant?: number }
export interface StoryConversation {
  id: ID;
  story: StoryLineId;
  step: number;
  actor: StoryActor;
  title: string;
  lines: StoryLine[];
  options: DecisionOption[];
  data: Record<string, any>;
}

export type MessageSender = 'assistant' | 'herald' | 'spy' | 'magistrate' | 'informant' | 'medicus' | 'rival' | 'oracle' | 'hatchery';
export interface Message {
  id: ID;
  week: number;
  sender: MessageSender;
  title: string;
  text: string;
  read: boolean;
  /** offer from a rival to buy one of the player's creatures */
  offer?: TransferOffer;
}

export interface TransferOffer {
  id: ID;
  rivalId: ID;
  creatureId: ID;
  amount: number;
  /** rival sells to the player instead */
  sell?: boolean;
  creature?: Creature;
  expiresWeek: number;
}

export type ObjectiveId =
  | 'guidance1' | 'guidance2' | 'guidance3' | 'guidance4' | 'guidance5' | 'guidance6'
  | 'expandLudus' | 'recruitSpy' | 'whereDoesItHurt' | 'imperator' | 'security' | 'poison' | 'saddleUp'
  | 'ascension' | 'exertInfluence' | 'organize' | 'thievery' | 'beastNaming'
  | 'pythia1' | 'pythia1Alt' | 'pythia2' | 'pythia3' | 'pythia4' | 'godsChosen' | 'trainLoaned'
  | 'firstClutch' | 'imprintBaby' | 'bloodline';

export interface ObjectiveState {
  id: ObjectiveId;
  startWeek: number;
  deadline?: number;
  progress: number;
  goal: number;
  done: boolean;
  claimed: boolean;
  failed?: boolean;
  data?: Record<string, any>;
}

export interface TombRecord {
  id: ID;
  name: string;
  species: SpeciesId;
  level: number;
  fame: number;
  week: number;
  cause: string;
  leagues: number;
  creature: Creature;
}

// ---------------------------------------------------------------------------
// Meta (account level, outside a run)
// ---------------------------------------------------------------------------

export type UpgradeId =
  // creatures & techniques
  | 'weaponsMaster' | 'rallyTechnique' | 'disarmTechnique' | 'greatSpiculus' | 'ambushTechnique'
  | 'spitters' | 'brawlers' | 'thunderStrike' | 'lashers'
  // general
  | 'senatorTree' | 'nightmareMode' | 'releaseBeast' | 'woollyRhinos' | 'warMammoths' | 'ascendancy'
  | 'greekHeritage' | 'egyptianAncestry' | 'undyingLoyalty' | 'travelingMerchant'
  // events
  | 'legendsOfMars' | 'lostBlade' | 'founderAxe' | 'bacchusLeague' | 'vulcanLeague'
  | 'carthaginianArtifacts' | 'hannibalsLegacy' | 'legacyOfAlexander' | 'legendaryPits'
  | 'spartanDynasty' | 'restorationOfTroy'
  // equipment
  | 'championsCrest' | 'greatTalons' | 'venomFangs' | 'sickleClaws' | 'bashPlate' | 'studdedBarding'
  | 'hornedHelm' | 'legionBarding' | 'celticRiders' | 'therizinArsenal' | 'ascendedWeaponry' | 'cataphracts'
  // buildings
  | 'templeOfPluto' | 'masterSmith' | 'supremeArmory' | 'aqueduct' | 'athenianArtifacts'
  | 'tinkerersWorkshop' | 'romeMansion'
  // breeding
  | 'geneticist' | 'mutagenLab';

export type AchievementId =
  | 'wonTournament' | 'wonTournamentHard' | 'wonTournamentNightmare' | 'eliminateOpponent'
  | 'defeatGigantus' | 'colossusSlayer' | 'colossusSlayerHard' | 'influencer' | 'influencerHard'
  | 'influencerNightmare' | 'famous' | 'legendsChampion' | 'greedIsGood' | 'peopleManager' | 'organizer'
  | 'assassin' | 'winSenateElections' | 'masterOfOne' | 'adventurer' | 'adventurerHard'
  | 'adventurerNightmare' | 'builder' | 'apprentice' | 'eyesCanDeceive' | 'imperator' | 'lunarChampion'
  | 'solarChampion' | 'leagueDomination' | 'leagueSweep' | 'dejavu' | 'ascension' | 'divine' | 'divineHard'
  | 'divineNightmare' | 'radiance' | 'radianceHard' | 'radianceNightmare' | 'student' | 'oneManArmy'
  | 'weaponsMasterAch' | 'conduitOfTheGods' | 'prophecy' | 'favoured' | 'decanus' | 'firstAnniversary'
  | 'secondAnniversary' | 'stillStanding' | 'completionist' | 'silverLegend' | 'goldLegend'
  | 'diamondLegend'
  // breeding
  | 'firstClutch' | 'mutant' | 'tripleMutation' | 'fullImprint' | 'dynasty' | 'twins' | 'apexBloodline'
  | 'breeder';

export interface ChampionRecord {
  creature: Creature;
  difficulty: DifficultyKey;
  level: number;
  week: number;
  beast?: Creature;
}

export type DifficultyKey = 'normal' | 'hard' | 'nightmare';

export interface HallOfFameEntry {
  id: ID;
  name: string;
  species: SpeciesId;
  level: number;
  fame: number;
  week: number;
  lanista: string;
  ascension: number;
  difficulty: DifficultyKey;
  creature: Creature;
  gear: Gear[];
  tier: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  /** 0–1; absent in metas saved before the music existed (loadMeta's migration fills it and turns music on) */
  musicVolume?: number;
  /** sound-effects volume 0–1 (1 = the level the effects were tuned at) */
  sfxVolume?: number;
  battleSpeed: 1 | 2 | 4;
  tooltips: boolean;
  reduceMotion: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface Meta {
  version: number;
  amber: number;
  achievements: AchievementId[];
  upgrades: UpgradeId[];
  ascension: Record<DifficultyKey, number>;
  prophecy: Record<DifficultyKey, number>;
  champions: Partial<Record<DifficultyKey, ChampionRecord>>;
  hallOfFame: HallOfFameEntry[];
  settings: Settings;
  stats: { runs: number; weeksPlayed: number; bestInfluence: number; bestWeek: number };
  highscores: { name: string; score: number; influence: number; week: number; difficulty: DifficultyKey; alive: boolean; reason?: string; ascension: number }[];
}

// ---------------------------------------------------------------------------
// Player & world
// ---------------------------------------------------------------------------

export type Heritage = 'roman' | 'punic' | 'celtic' | 'greek' | 'egyptian';

export interface Difficulty {
  hard: boolean;
  nightmare: boolean;
  sandbox: boolean;
  raidsDisabled: boolean;
  betrayalsDisabled: boolean;
  /** Gladiator Manager's original, unsoftened balance (balance.ts) */
  classic?: boolean;
}

export interface PlayerData {
  lanista: string;
  female: boolean;
  heritage: Heritage;
  ludus: Ludus;

  opportunities: OpportunityId[];
  /** alternates chosen per seed for the influence tree */
  treeSeed: number;
  toggles: { publicSessions: boolean; bribeGeneral: boolean; loan: boolean };
  senator: boolean;
  consul: boolean;
  election?: ElectionState;

  objectives: ObjectiveState[];
  stories: Partial<Record<StoryLineId, number>>;
  storyData: Record<string, any>;
  messages: Message[];
  decisions: Decision[];
  decisionHistory: string[];
  delayed: DelayedOutcome[];
  adventures: Adventure[];
  expedition?: Expedition;
  conversations: StoryConversation[];

  /** tournament id -> list of teams (creature ids) registered */
  registrations: Record<ID, ID[][]>;
  intrigue: IntrigueOrder[];
  defenses: PendingDefense[];
  offers: TransferOffer[];
  tomb: TombRecord[];
  /** organised tournaments by the player this run */
  organized: number;
  leagueWins: number;
  invaderWins: number;
  tutorial: number;
  bets: Record<ID, { stake: number; onSelf: boolean }>;
  /** week-level flags reset each week */
  week: Record<string, number | boolean>;
  /** counters for achievements/objectives */
  counters: Record<string, number>;
}

export interface Market {
  creatures: Creature[];
  gear: Gear[];
  /** last week's leftovers that AI may buy at 75% */
  oldCreatures: Creature[];
  oldGear: Gear[];
  keepers: { count: number; price: number };
  eggs: Egg[];
  foodPrices: Record<FoodId, number>;
  merchant?: { items: { gear: Gear; price: number }[]; week: number };
  /** pokes on the merchant (easter egg) */
  pokes: number;
}

export interface World {
  week: number;
  /** current mulberry32 state */
  rng: number;
  difficulty: Difficulty;
  ascension: number;
  marketSeed: number;
  calendar: TournamentDef[];
  tournaments: Tournament[];
  leagues: League[];
  market: Market;
  horde: Horde;
  laws: { publicFunding: boolean };
  /** scripted/story world flags */
  flags: Record<string, number | boolean | string>;
  /** ambient temperature this week (°C) */
  temperature: number;
  /** rudis/released creatures that may return */
  released: Creature[];
}

export interface WeekReportEntry { kind: 'income' | 'expense' | 'event' | 'info' | 'warning' | 'good' | 'bad'; text: string; amount?: number }

/** Screens to show after a week resolves, in order (GM ResultActivity chain). */
export type ResultCard =
  | { kind: 'election'; won: boolean; office: 'senate' | 'consul'; votes: number }
  | { kind: 'league'; league: LeagueId; standings: { name: string; house: string; points: number }[] }
  | { kind: 'escape'; text: string; names: string[]; outcome: string }
  | { kind: 'hatch'; names: string[]; text: string; ids?: ID[] }
  | { kind: 'death'; names: string[]; text: string; ids?: ID[] }
  | { kind: 'story'; title: string; text: string }
  | { kind: 'report'; entries: WeekReportEntry[]; week: number };

export interface GameState {
  version: number;
  slot: number;
  createdAt: number;
  savedAt: number;
  player: PlayerData;
  rivals: Ludus[];
  /** the filler "Unknown" house */
  unknown: Ludus;
  world: World;
  ancestry: Record<ID, AncestorRecord>;
  /** upgrades owned (synced from Meta at load) */
  unlocks: UpgradeId[];
  /** achievements earned this session, to be pushed to Meta by the app */
  pendingAchievements: AchievementId[];
  /** result chain for the last resolved week */
  results: ResultCard[];
  /** week report entries being accumulated */
  report: WeekReportEntry[];
  /** game over */
  over?: { reason: DefeatReason; week: number; influence: number };
  /** id counter */
  nextId: number;
  /** ascension tournament won this run → ascension available */
  ascended?: boolean;
  /** stats for the run */
  runStats: { battles: number; wins: number; deaths: number; hatched: number; mutations: number; maxGeneration: number; peakInfluence: number };
}
