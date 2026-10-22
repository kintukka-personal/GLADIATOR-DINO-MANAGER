// Technique catalogue (GM 01-combat §11.2), renamed for dinos. Formulas live in combat/techniques.ts.

import type { TechniqueDef, TechId } from '../types';

const T = (
  id: TechId, name: string, stat: TechniqueDef['stat'], req: number, cooldown: number, basePriority: number,
  dmgBase: number, dmgPerRank: number, weaponAttack: boolean, desc: string, extra: Partial<TechniqueDef> = {},
): TechniqueDef => ({ id, name, stat, req, cooldown, basePriority, dmgBase, dmgPerRank, weaponAttack, maxRank: 10, desc, ...extra });

export const TECHNIQUES: Record<TechId, TechniqueDef> = {
  Smash: T('Smash', 'Crushing Bite', 'str', 5, 1, 3, 4, 3, true, 'A bone-crunching bite driven by raw strength.'),
  Kick: T('Kick', 'Stomp', 'agi', 7, 2, 3, 6, 2, false, 'A stamping blow that can stun the target.'),
  Lunge: T('Lunge', 'Lunge', 'agi', 5, 1, 1, 4, 2, true, 'A darting strike, deadlier while unhurt.'),
  Sunder: T('Sunder', 'Rend', 'str', 7, 2, 1, 3, 2, true, 'Tears at harness and plates, breaking shields, helms and barding.'),
  ThrowSand: T('ThrowSand', 'Kick Dust', 'cun', 3, 3, 0, 0, 0, false, 'Kicks dust into the eyes to blind; at higher ranks blinds several foes.'),
  Parry: T('Parry', 'Counter', 'agi', 8, 3, 1, 0, 0, false, 'Braces to turn the next blows back on the attacker.'),
  Headbutt: T('Headbutt', 'Headbutt', 'str', 8, 2, 3, 3, 2, false, 'A skull-first ram that stuns both, the target worse.'),
  Feint: T('Feint', 'Feint', 'agi', 9, 3, 0, 1, 2, true, 'A deceptive strike that slips past armor, counters and guards.', { piercing: true }),
  Charge: T('Charge', 'Charge', 'agi', 6, 3, 7, 4, 2, true, 'A full-tilt charge that stuns; only when unhurt since its last attack.'),
  Decimate: T('Decimate', 'Gore', 'str', 8, 2, 1, 3, 3, true, 'Gores big, slow foes for huge damage.'),
  Gouge: T('Gouge', 'Eye Rake', 'cun', 7, 2, 1, 2, 2, true, 'Rakes at the eyes to blind.'),
  Rally: T('Rally', 'Rallying Call', 'cun', 5, 3, 1, 0, 0, false, 'A trumpeting call that clears afflictions and braces the whole pack.', { upgrade: 'rallyTechnique' }),
  Disarm: T('Disarm', 'Tear Harness', 'cun', 6, 2, 0, 1, 2, true, 'Rips the weapon harness loose, leaving the foe bare-jawed.', { upgrade: 'disarmTechnique' }),
  Rampage: T('Rampage', 'Rampage', 'str', 9, 3, 1, 8, 4, true, 'Enrages, ignores pain and smashes wildly.'),
  Warcry: T('Warcry', 'Roar', 'hp', 40, 3, 3, 0, 0, false, 'A deafening roar that stuns every enemy and pumps up strength.', { rare: true }),
  Cleave: T('Cleave', 'Tail Swipe', 'str', 10, 3, 1, 4, 2, true, 'A sweeping tail strike that hits every enemy.', { rare: true }),
  Execute: T('Execute', 'Killing Bite', 'str', 8, 1, 2, 14, 5, true, 'Finishes wounded prey, chaining to the next on a kill.', { rare: true }),
  StrikeAndRoll: T('StrikeAndRoll', 'Hit and Run', 'agi', 8, 2, 3, 0, 3, true, 'Strikes then darts away, evading the next attack.', { rare: true }),
  CheapShot: T('CheapShot', 'Low Blow', 'cun', 8, 2, 8, 6, 3, true, 'A vicious strike at an impaired foe that also stuns.', { rare: true }),
  ShieldBash: T('ShieldBash', 'Frill Bash', 'str', 7, 3, 1, 4, 3, false, 'Slams with the guard, blocking and breaking enemy gear.', { rare: true }),
  HailOfArrows: T('HailOfArrows', 'Venom Barrage', 'agi', 10, 3, 3, 2, 1, true, 'A spray of venom globs at random enemies (needs a Venom Spitter).', { rare: true, upgrade: 'spitters' }),
  Impale: T('Impale', 'Impale', 'str', 10, 2, 5, 4, 3, true, 'Drives horns deep, causing heavy bleeding (horn weapons).', { rare: true }),
  Uppercut: T('Uppercut', 'Jaw Crunch', 'str', 6, 3, 3, 4, 3, true, 'A bare-jawed crushing bite that stuns or dazes (unarmed only).', { rare: true, upgrade: 'brawlers' }),
  Thunderstrike: T('Thunderstrike', 'Thunderstrike', 'agi', 6, 2, 3, 6, 4, true, 'Jupiter\'s lightning: splash damage to all foes, scaled by favour.', { rare: true, mythical: true, upgrade: 'thunderStrike' }),
  Fireball: T('Fireball', 'Fireball', 'cun', 15, 4, 5, 8, 6, false, 'Forbidden fire that ignores most armor and burns gear.', { rare: true, mythical: true, piercing: true }),
  Hurricane: T('Hurricane', 'Hurricane', 'agi', 8, 3, 3, 2, 3, true, 'A whirlwind of wings and claws that hits and stuns every enemy.', { rare: true }),
  Maul: T('Maul', 'Maul', 'str', 6, 2, 0, 4, 4, false, 'A heavy mauling.', { beastOnly: true }),
  Swipe: T('Swipe', 'Swipe', 'agi', 6, 2, 0, 2, 3, false, 'A raking swipe at every enemy.', { beastOnly: true }),
  Bite: T('Bite', 'Bite', 'agi', 2, 1, 0, 2, 4, false, 'A quick bite.', { beastOnly: true }),
  Pounce: T('Pounce', 'Pounce', 'agi', 12, 2, 1, 4, 3, false, 'Leaps on prey; stuns if neither has struck yet.', { beastOnly: true }),
  SneakAttack: T('SneakAttack', 'Ambush', 'cun', 5, 2, 1, 1, 2, false, 'Strikes from cover, devastating against impaired foes.', { upgrade: 'ambushTechnique' }),
};

/** GM's human learnable pool (dinos). Rally/Disarm need their upgrades. */
export const LEARNABLE: TechId[] = ['Smash', 'Sunder', 'Lunge', 'ThrowSand', 'Kick', 'Parry', 'Headbutt', 'Feint',
  'Charge', 'Decimate', 'Gouge', 'Rampage', 'Rally', 'Disarm'];

/** Rare learnables granted by progression (GetRandomRareLearnable). */
export const RARE_LEARNABLE: TechId[] = ['Warcry', 'Cleave', 'Execute', 'StrikeAndRoll', 'CheapShot', 'ShieldBash'];

/** Beast pool. */
export const BEAST_LEARNABLE: TechId[] = ['Pounce', 'Bite', 'Charge', 'Maul', 'Swipe'];

export function techRequirement(id: TechId, rank: number): number {
  const d = TECHNIQUES[id];
  return d.req + Math.floor(d.req / 2) * (rank - 1);
}

export function techDamage(id: TechId, rank: number): number {
  const d = TECHNIQUES[id];
  return d.dmgBase + d.dmgPerRank * (rank - 1);
}
