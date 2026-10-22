// Fighting styles (GM classes, 01-combat §16).

import type { ClassId, GearTypeId, Stat, TechId, TraitId, UpgradeId, WeaponFamily } from '../types';

export interface ClassDef {
  id: ClassId;
  name: string;
  gm: string;
  mainWeapon: GearTypeId;
  mainFamily: WeaponFamily;
  offhand?: GearTypeId;
  mainStat: Stat;
  techniques: TechId[];
  traits: TraitId[];
  upgrade?: UpgradeId;
  desc: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  bulwark: {
    id: 'bulwark', name: 'Bulwark', gm: 'Murmillo', mainWeapon: 'talonBlades', mainFamily: 'claw', offhand: 'frillGuard',
    mainStat: 'str', techniques: ['Smash', 'Warcry', 'Decimate', 'ShieldBash', 'Sunder', 'Execute'],
    traits: ['Fanatic', 'Enforcer', 'Strong', 'TrueGrit', 'Indomitable'],
    desc: 'Talon blades behind a frill guard. Holds the line and grinds foes down.',
  },
  spitter: {
    id: 'spitter', name: 'Spitter', gm: 'Sagittarius', mainWeapon: 'venomSpitter', mainFamily: 'spit',
    mainStat: 'agi', techniques: ['HailOfArrows', 'StrikeAndRoll', 'Execute', 'Lunge', 'Feint'],
    traits: ['Alert', 'Agile', 'Underhanded', 'Hunter', 'LightningSpeed', 'Preparation', 'Marksman'],
    upgrade: 'spitters', desc: 'Venom glands strapped to a pressure harness. Strikes first from range.',
  },
  snarer: {
    id: 'snarer', name: 'Snarer', gm: 'Retiarius', mainWeapon: 'tridentHorns', mainFamily: 'horn', offhand: 'bolaRig',
    mainStat: 'cun', techniques: ['Disarm', 'Gouge', 'CheapShot', 'Lunge', 'ThrowSand'],
    traits: ['Preparation', 'ManOfGlass', 'Sneaky', 'Underdog', 'Tactician'],
    desc: 'Bolas to entangle, trident horns to finish. Fights dirty and smart.',
  },
  slasher: {
    id: 'slasher', name: 'Slasher', gm: 'Dimachaerus', mainWeapon: 'sickleClaws', mainFamily: 'claw', offhand: 'fangCaps',
    mainStat: 'agi', techniques: ['Charge', 'Lunge', 'Feint', 'Kick', 'StrikeAndRoll', 'Parry'],
    traits: ['DualWield', 'Ambidextrous', 'ShowMan', 'Talented', 'Agile'],
    desc: 'Sickle claws and fang caps together: a blur of cuts.',
  },
  phalanx: {
    id: 'phalanx', name: 'Phalanx', gm: 'Hoplomachus', mainWeapon: 'hornLance', mainFamily: 'horn', offhand: 'bashPlate',
    mainStat: 'hp', techniques: ['Impale', 'Lunge', 'Warcry', 'Rally', 'ShieldBash', 'Decimate'],
    traits: ['Conditioning', 'ExoticFightingStyle', 'OneManArmy', 'Veteran', 'Alert'],
    desc: 'Horn lance and bash plate. Endures, then impales.',
  },
  brute: {
    id: 'brute', name: 'Brute', gm: 'Barbarus', mainWeapon: 'tailClub', mainFamily: 'mace', offhand: 'hideShield',
    mainStat: 'str', techniques: ['Warcry', 'Smash', 'Headbutt', 'Cleave', 'Charge', 'Rampage'],
    traits: ['Strong', 'AllIn', 'Tough', 'Fury', 'Fanatic', 'Temperamental'],
    desc: 'A spiked tail club and fury. Simple, loud, effective.',
  },
  brawler: {
    id: 'brawler', name: 'Brawler', gm: 'Cestarius', mainWeapon: 'ironJaws', mainFamily: 'jaw',
    mainStat: 'hp', techniques: ['Uppercut', 'Kick', 'Headbutt', 'Charge', 'StrikeAndRoll'],
    traits: ['Pugilist', 'Strong', 'Conditioning', 'GlorySeeker', 'Impact', 'Tough', 'TrueGrit'],
    upgrade: 'brawlers', desc: 'Iron jaw braces and nothing else. Bites twice.',
  },
  lasher: {
    id: 'lasher', name: 'Lasher', gm: 'Lorarius', mainWeapon: 'tailWhip', mainFamily: 'whip',
    mainStat: 'cun', techniques: ['Disarm', 'Kick', 'Cleave', 'ThrowSand', 'Gouge', 'Feint'],
    traits: ['Doctore', 'Lawbringer', 'Underhanded', 'Agile', 'QuickStudy', 'Loyal', 'Tactician'],
    upgrade: 'lashers', desc: 'A barbed tail-whip that cracks, snares and keeps the pack in line.',
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
