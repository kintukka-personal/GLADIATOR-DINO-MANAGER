// Rival houses: seed table, personalities and AI constants (GM 03 §5.1–5.2, 02 §11.4).
// Rosters (the dinos themselves) are built in rivals.ts from the legend table in arenaData.ts.

import type {
  ArenaPersonality, BuildingId, ClassMindset, FinancialPersonality, GearTypeId, Honesty, Keepers, Personality, Preference,
  Quality, RivalKey, TrainingType,
} from '../types';

/** [normal, hard, nightmare] */
export type ByDifficulty<T> = [T, T, T];

export interface RivalSeed {
  key: RivalKey;
  name: string;
  portrait: string;
  personality: Personality;
  denarii: ByDifficulty<number>;
  influence: ByDifficulty<number>;
  /** starting opinion of the player */
  opinion: ByDifficulty<number>;
  keepers: Partial<Keepers>;
  buildings: Partial<Record<BuildingId, number>>;
  hated?: RivalKey;
  /** starting armory (normal); Hard +1 quality, Nightmare +1 more (max Master-crafted) */
  gear: [GearTypeId, Quality][];
  /** extra pieces in Hard and Nightmare */
  hardGear?: [GearTypeId, Quality][];
  miningBonus?: number;
  projected?: number;
  visible: boolean;
  desc: string;
}

const P = (
  financial: FinancialPersonality, arena: ArenaPersonality, honesty: Honesty, training: TrainingType,
  classMindset: ClassMindset, prefers: Preference[],
): Personality => ({ financial, arena, honesty, training, classMindset, prefers });

export const RIVAL_SEEDS: Record<Exclude<RivalKey, 'random'>, RivalSeed> = {
  batiatus: {
    key: 'batiatus', name: 'Batiatus', portrait: 'batiatus',
    personality: P('greedy', 'risktaker', 'treacherous', 'technique', 'always', ['talented', 'quick']),
    denarii: [600, 1200, 1600], influence: [10, 30, 45], opinion: [50, 50, 50],
    keepers: { wardens: 3, showmen: 2, miners: 1 }, buildings: {},
    hated: 'solonius',
    gear: [['tailWhip', 2], ['talonBlades', 2]], hardGear: [['tridentHorns', 2]],
    visible: true,
    desc: 'A lanista with debts, ambitions and a wife who wants both settled. He would sell his own mother to the beast pens.',
  },
  solonius: {
    key: 'solonius', name: 'Solonius', portrait: 'solonius',
    personality: P('spender', 'conservative', 'dishonest', 'standard', 'prioexp', ['established']),
    denarii: [1700, 2800, 2800], influence: [20, 45, 60], opinion: [50, 50, 50],
    keepers: { wardens: 3, showmen: 3, miners: 3 }, buildings: { residence: 1, mine: 1 },
    hated: 'batiatus',
    gear: [['talonBlades', 2], ['hideShield', 2], ['lightHarness', 1]], hardGear: [['fangCaps', 2]],
    visible: true,
    desc: 'Smooth, rich and always smiling. The smile is the dangerous part.',
  },
  decimus: {
    key: 'decimus', name: 'Decimus', portrait: 'decimus',
    personality: P('balanced', 'balanced', 'honest', 'technique', 'normal', ['cheap', 'mythic']),
    denarii: [400, 750, 1000], influence: [5, 25, 35], opinion: [50, 50, 50],
    keepers: { wardens: 2, showmen: 2 }, buildings: { residence: 1 },
    hated: 'caesar',
    gear: [['hornLance', 1], ['fangCaps', 2], ['hideShield', 1]], hardGear: [['talonBlades', 1]],
    visible: true,
    desc: 'An honest lanista. Capua considers this a medical condition.',
  },
  magnus: {
    key: 'magnus', name: 'Magnus', portrait: 'magnus',
    personality: P('spender', 'crazy', 'neutral', 'light', 'prioexp', ['cunning']),
    denarii: [750, 1500, 2000], influence: [10, 35, 45], opinion: [50, 50, 50],
    keepers: { wardens: 3, showmen: 2, miners: 1 }, buildings: { trainingField: 1 },
    hated: 'vettius',
    gear: [['tridentHorns', 1], ['bolaRig', 1], ['fangCaps', 2]], hardGear: [['venomSpitter', 1]],
    visible: true,
    desc: 'Owner of the Hippodrome and of several opinions about it, all loud.',
  },
  vettius: {
    key: 'vettius', name: 'Vettius', portrait: 'vettius',
    personality: P('crazy', 'crazy', 'dishonest', 'intense', 'always', ['tough', 'strong']),
    denarii: [1000, 2000, 2500], influence: [15, 40, 90], opinion: [50, 50, 50],
    keepers: { wardens: 3, showmen: 2, miners: 1 }, buildings: {},
    hated: 'magnus',
    gear: [['hornLance', 2], ['bashPlate', 1], ['tailClub', 2]], hardGear: [['bronzeBarding', 1]],
    visible: false,
    desc: 'Young, rich and unhinged. He keeps something enormous behind his walls.',
  },
  caesar: {
    key: 'caesar', name: 'Caesar', portrait: 'caesar',
    personality: P('balanced', 'risktaker', 'dishonest', 'technique', 'normal', ['established', 'talented']),
    denarii: [2000, 2500, 2500], influence: [50, 75, 150], opinion: [50, 50, 50],
    keepers: { wardens: 12, showmen: 10, miners: 8 }, buildings: { residence: 2, trainingField: 1, palisade: 1 },
    hated: 'batiatus',
    gear: [['talonBlades', 3], ['frillGuard', 3], ['bronzeBarding', 3], ['legionFaceplate', 3], ['hornLance', 4], ['bashPlate', 3]],
    visible: true,
    desc: 'A patrician who funds the games to fund his career. Everyone hates him; he barely notices.',
  },
  crassus: {
    key: 'crassus', name: 'Crassus', portrait: 'crassus',
    personality: P('greedy', 'balanced', 'neutral', 'light', 'always', ['cunning', 'established']),
    denarii: [5000, 5000, 5000], influence: [80, 120, 250], opinion: [40, 40, 40],
    keepers: { wardens: 25, showmen: 20, miners: 15 }, buildings: { residence: 3, mine: 2, trainingField: 2, palisade: 2, veterinarium: 1 },
    hated: 'caesar',
    gear: [['greatTalons', 4], ['bronzeFrillGuard', 4], ['legionBarding', 4], ['corinthianVisor', 4], ['tailClub', 4], ['tridentHorns', 4]],
    miningBonus: 2, projected: 100,
    visible: true,
    desc: 'The richest man in Rome, which he will tell you, and then invoice you for the telling.',
  },
  hannibal: {
    key: 'hannibal', name: 'Hannibal', portrait: 'hannibal',
    personality: P('spender', 'risktaker', 'treacherous', 'intense', 'always', ['cunning', 'mythic', 'talented']),
    denarii: [5000, 5000, 5000], influence: [100, 150, 250], opinion: [45, 40, 35],
    keepers: { wardens: 20, showmen: 15, miners: 10, spies: 5 },
    buildings: { residence: 4, trainingField: 3, mine: 2, forge: 3, veterinarium: 2, palisade: 2, saddlery: 1, templeOfPluto: 1, library: 1 },
    hated: 'caesar',
    gear: [['scytheClaws', 4], ['carthaginianCrest', 4], ['bronzeBarding', 4], ['strappedBuckler', 4], ['numidianLancer', 4], ['hornLance', 4]],
    visible: true,
    desc: 'Pulled out of time by Cronus himself. He has not forgiven Rome, and he brought mammoths.',
  },
};

/** The five houses seeded at a new game, in list order. */
export const STARTING_RIVALS: Exclude<RivalKey, 'random'>[] = ['batiatus', 'solonius', 'decimus', 'magnus', 'vettius'];

/** GM spending buffer (money kept back). */
export const SPENDING_BUFFER: Record<FinancialPersonality, number> = { crazy: 100, spender: 150, balanced: 200, greedy: 400 };

/** GM class adoption threshold (useClassFrom). */
export const CLASS_THRESHOLD: Record<ClassMindset, number> = { always: 10, normal: 50, prioexp: 75 };

/** Extra opinion loss on negative changes (fixed version of GM reactToPlayerAction). */
export const HONESTY_EXTRA: Record<Honesty, number> = { honest: 0, neutral: 1, dishonest: 2, treacherous: 3 };

/** GM wantsToCheat base by honesty (used by bribes.ts; listed here for reference/UI). */
export const HONESTY_CHEAT: Record<Honesty, number> = { honest: 0, neutral: 1, dishonest: 3, treacherous: 5 };

/** Chance an AI house enters an above-ground event it can field a team for. */
export const ENTRY_CHANCE: Record<ArenaPersonality, number> = { crazy: 0.9, risktaker: 0.8, balanced: 0.65, conservative: 0.5 };
/** Chance an AI house sends a team to the underground pits. */
export const PIT_ENTRY_CHANCE: Record<ArenaPersonality, number> = { crazy: 0.45, risktaker: 0.35, balanced: 0.2, conservative: 0.1 };

/** AI construction priority (GM: stables, training ground, mine, wall, medicus, residence, blacksmith). */
export const BUILD_PRIORITY: BuildingId[] = ['saddlery', 'trainingField', 'mine', 'palisade', 'veterinarium', 'residence', 'forge'];

/** Wound traits the AI will operate on (it keeps scars that are part of a legend's look). */
export const AI_SURGERY_TRAITS = ['Crippled', 'BumLeg', 'MissingFingers', 'Concussion', 'PartiallyBlind'] as const;

/** Names used for newly opened random houses. */
export const RANDOM_HOUSE_PREFIX = 'House';

/**
 * The Unknown house's kit improves over time (GM World.AppendWeek step 16):
 * [week, [type, quality, hard-mode type]]. Gladius → Talon Blades (Spatha → Great Talons in Hard), Wooden shield →
 * Hide Shield, Galerus → Light Harness, Securis → Tail Club, Hoplon → Bash Plate, Cloak → Camouflage Hide,
 * Fuscina → Trident Horns, Hood → Hunter's Hood, Leather → Studded Barding.
 */
export const UNKNOWN_GEAR: [number, [GearTypeId, Quality, GearTypeId?][]][] = [
  [10, [['talonBlades', 1, 'greatTalons']]],
  [20, [['hideShield', 2], ['lightHarness', 0]]],
  [40, [['tailClub', 2], ['bashPlate', 2], ['camoHide', 1]]],
  [60, [['tridentHorns', 3], ['huntersHood', 2], ['studdedBarding', 2]]],
];

/** Herald lines for a destroyed house, by reason. */
export const DEFEAT_HERALD: Record<string, (name: string) => string> = {
  debt: (n) => `The creditors have taken the gates of ${n}'s ludus. Its dinos were turned loose into the hills.`,
  uprising: (n) => `${n}'s dinos broke their pens and burned the ludus to the ground. Capua smells of roast lanista.`,
  raid: (n) => `${n}'s ludus was raided in the night. Nobody saw anything, and everybody is talking about it.`,
  horde: (n) => `The Wild Horde ransacked ${n}'s ludus. The pens are empty and the walls are scorched.`,
  surrender: (n) => `${n} has given up the ludus and left Capua in a cart.`,
};
