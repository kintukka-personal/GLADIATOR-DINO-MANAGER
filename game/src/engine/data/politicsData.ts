// Data and small shared helpers for intrigue, bribes, influence and the Wild Horde.
// OWNER: systems-politics agent. Numbers follow the GM teardown (05, 04 §8–9, 03 §1.3).

import type { ClassId, Creature, GameState, Injury, InjuryType, Ludus, TraitId } from '../types';
import * as rivalsModule from '../rivals';
import { rand, coin, clamp } from '../rng';
import { addTrait, generateDino, makeNamed, injuryProne, setLevelAndStats, bestStat, hasTrait, xpForLevel, autoSpendStatPoints } from '../creature';
import { CLASSES, CLASS_IDS } from './classes';

// ---------------------------------------------------------------------------
// Attacker scenarios (05 §1.1). Rolled when the player orders an intrigue action.
// ---------------------------------------------------------------------------

export interface ScenarioDef { key: string; text: string; range: string }

export const SCENARIO_DEFS: ScenarioDef[] = [
  { key: 'dark_night', range: '+5 to +19',
    text: 'A moonless night. Not even the raptors can see their own claws. Perfect weather for mischief.' },
  { key: 'raven_flying_left', range: '−0 to −39',
    text: 'A raven flies past on the left. The augurs would call that a very bad sign. The augurs are not paid to do this job.' },
  { key: 'goat_sacrificed', range: '+0 to +39',
    text: 'The priests offer to sacrifice a goat to Mercury for luck. The goat costs 50 denarii, the priests insist.' },
  { key: 'party_ongoing', range: '−10 to −39',
    text: 'The target is throwing a feast. There are guests everywhere, which is bad for sneaking but good for slipping away unnoticed.' },
  { key: 'sprained_ankle', range: '−5',
    text: 'Your agent twisted an ankle jumping the fence on the scouting run. It limps, but insists it is fine.' },
  { key: 'everything_going_as_planned', range: '+5 to +14',
    text: 'The guards are drunk, the gate is open and the dogs are asleep. Everything is going exactly as planned. Suspicious, really.' },
  { key: 'agent_paranoid', range: '50%: −20',
    text: 'Your agent keeps sniffing the air and flinching at shadows. It might be nerves. It might be instinct.' },
  { key: 'agent_spots_loot', range: '−10, loot on success',
    text: 'Your agent spots a strongbox left open on the way in. Grabbing it would slow things down, but coin is coin.' },
  { key: 'agent_spots_bystanders', range: '0',
    text: 'There are keepers sleeping in the stables your agent means to set alight. Nobody told them to sleep there.' },
];

/** GM scenario roll modifier on Proceed (05 §1.1). */
export function scenarioModifier(scenario: number): number {
  switch (scenario) {
    case 0: return 5 + rand(15);
    case 1: return -rand(40);
    case 2: return rand(40);
    case 3: return -(10 + rand(30));
    case 4: return -5;
    case 5: return 5 + rand(10);
    case 6: return coin() ? -20 : 0;
    case 7: return -10;
    default: return 0;
  }
}

export const GOAT_COST = 50;

// ---------------------------------------------------------------------------
// Defender prompts (05 §1.1). `%s` is replaced by the dino involved.
// ---------------------------------------------------------------------------

export const DEFENSE_PROMPT_DEFS: { key: string; text: string; assertive: string; passive: string }[] = [
  { key: 'spies_intel',
    text: 'Your spies whisper that somebody means your ludus harm tonight. Hiring extra night guards would cost 50 denarii.',
    assertive: 'Hire night guards (50 denarii)', passive: 'Save the coin' },
  { key: 'security_disagreement',
    text: 'Your head warden wants the night watch moved from the gates to the pens. Your steward swears the gates matter more. They are both shouting.',
    assertive: 'Guard the pens', passive: 'Guard the gates' },
  { key: 'security_for_friend',
    text: 'A senator of your acquaintance asks to borrow a few of your wardens tonight for a "private errand". He would remember the favour.',
    assertive: 'Lend him the wardens (+10 influence)', passive: 'Refuse him (−10 influence)' },
  { key: 'intrigue_bad_feeling',
    text: 'You wake in the night with a bad feeling. It is too quiet. Even the raptors have stopped chirping.',
    assertive: 'Call the town watch (−10 influence)', passive: 'Go back to sleep' },
  { key: 'good_boy_restless',
    text: '%s is pacing its pen and growling at the dark. It clearly wants to be let out.',
    assertive: 'Let it patrol the grounds tonight', passive: 'Give it a treat and shut the gate' },
  { key: 'loyal_glad_guards',
    text: '%s, ever tame, plants itself by the gate and refuses to move. It seems to want to stand guard.',
    assertive: 'Let it guard (it misses the week)', passive: 'Send it back to its pen' },
  { key: 'gladiator_worried',
    text: '%s will not sleep. It hisses about poisoned meat and knives in the dark to anyone who will listen.',
    assertive: 'Muzzle it and get some sleep', passive: 'Humour it: double the night watch' },
  { key: 'target_worried',
    text: '%s is restless tonight, pacing and sniffing the air as if it can smell trouble coming.',
    assertive: 'Chain it in the inner pen under guard', passive: 'Leave it be' },
];

// ---------------------------------------------------------------------------
// Expedition tactics (04 §8)
// ---------------------------------------------------------------------------

export const TACTICS: Record<string, { name: string; desc: string }> = {
  encircle: { name: 'Encircle', desc: 'Surround the camp. Works when you have the numbers.' },
  nightAttack: { name: 'Night attack', desc: 'Strike in the dark. A cunning commander shines.' },
  sendScouts: { name: 'Send scouts', desc: 'Scout first, strike later. Safe, rarely brilliant. Spies help.' },
  splitForces: { name: 'Split forces', desc: 'Attack from two sides. Spartacus loves it when Romans do this.' },
  stormDefenses: { name: 'Storm defenses', desc: 'Go straight over the stakes. Brute strength wins or loses it.' },
  useFog: { name: 'Use fog', desc: 'Advance under the river fog. Weather is a fickle ally.' },
  starveThemOut: { name: 'Starve them out', desc: 'Cut off the supply lines. Works on a poor Horde.' },
};
export const TACTIC_KEYS = Object.keys(TACTICS);

// ---------------------------------------------------------------------------
// Injuries outside battle: local GM GenerateInjury (01 §13)
// ---------------------------------------------------------------------------

const INJURY_WEEKS: Record<InjuryType, number> = { flesh: 2, broken: 3, severe: 4, multiple: 5 };
export const INJURY_NAMES: Record<InjuryType, string> = {
  flesh: 'a flesh wound', broken: 'broken bones', severe: 'severe wounds', multiple: 'multiple injuries',
};

/** GM GenerateInjury(m): R = rand(11)+m; ≤10 nothing; 11 flesh … 14 multiple; 15 dead (coin flip → severe if m < 12). */
export function rollInjury(m: number, canDie = true): Injury | 'dead' | null {
  const R = rand(11) + Math.trunc(m);
  if (R <= 10) return null;
  const t = Math.min(R, 15);
  if (t === 15) {
    if (!canDie || (m < 12 && coin())) return { type: 'severe', weeks: INJURY_WEEKS.severe };
    return 'dead';
  }
  const type: InjuryType = t === 11 ? 'flesh' : t === 12 ? 'broken' : t === 13 ? 'severe' : 'multiple';
  return { type, weeks: INJURY_WEEKS[type] };
}

/** Put an injury on a creature: a new injury on an injured creature becomes Multiple injuries and adds weeks. */
export function applyInjury(c: Creature, inj: Injury): Injury {
  if (c.injury) c.injury = { type: 'multiple', weeks: c.injury.weeks + inj.weeks };
  else c.injury = { ...inj };
  return c.injury;
}

/** Roll and apply GenerateInjury(injuryProne + extra). Returns 'dead' (caller buries), the injury, or null. */
export function injureCreature(c: Creature, extra: number, canDie = true): Injury | 'dead' | null {
  const r = rollInjury(injuryProne(c) + extra, canDie);
  if (r === null || r === 'dead') return r;
  return applyInjury(c, r);
}

// ---------------------------------------------------------------------------
// House helpers
// ---------------------------------------------------------------------------

export function keeperTotal(h: Ludus): number {
  const k = h.keepers;
  return k.unassigned + k.miners + k.showmen + k.wardens + k.spies;
}

/** Remove a creature from its house (pairs, doctore, bond) without touching the armory. */
export function detachCreature(h: Ludus | undefined, c: Creature): void {
  if (!h) return;
  h.creatures = h.creatures.filter((x) => x !== c && x.id !== c.id);
  h.pairs = h.pairs.filter((p) => p.maleId !== c.id && p.femaleId !== c.id);
  if (h.doctoreId === c.id) h.doctoreId = undefined;
  if (h.bondedId === c.id) h.bondedId = undefined;
  if (h.training?.sparring) h.training.sparring = h.training.sparring.filter((s) => s.a !== c.id && s.b !== c.id);
  if (h.training?.overrides) delete h.training.overrides[c.id];
}

export function changeLoyalty(c: Creature, delta: number): void {
  c.loyalty = clamp(c.loyalty + delta, 0, 100);
}

/** The house's most famous creature (ties: higher level). */
export function mostFamous(list: Creature[]): Creature | undefined {
  return [...list].sort((a, b) => b.fame - a.fame || b.level - a.level)[0];
}

/** Pick a fighting style from the creature's best stat (rogue "best class"). */
export function bestClassFor(c: Creature): ClassId {
  const s = bestStat(c);
  const match = CLASS_IDS.filter((id) => CLASSES[id].mainStat === s && !CLASSES[id].upgrade);
  return match[0] ?? 'brute';
}

// ---------------------------------------------------------------------------
// Legends: rivals.makeLegend (world-arena engineer) with a local fallback
// ---------------------------------------------------------------------------

type LegendFn = (state: GameState, key: string) => Creature;

/** Build a legendary creature by key ('spartacus', 'crixus', 'theokoles', 'hannibalbarca', 'hermes', 'maximus', 'lictor'…). */
export function legendCreature(state: GameState, key: string): Creature {
  try {
    const fn = (rivalsModule as unknown as Record<string, unknown>).makeLegend as LegendFn | undefined;
    if (typeof fn === 'function') {
      const c = fn(state, key);
      if (c) return c;
    }
  } catch {
    // not implemented for this key yet: fall back below
  }
  return fallbackLegend(state, key);
}

const named = makeNamed;

/** Local versions of the legends, used only when rivals.makeLegend does not know the key. */
export function fallbackLegend(state: GameState, key: string): Creature {
  const week = state.world.week;
  switch (key) {
    case 'spartacus':
      return named('allosaurus', 'Spartacus', { str: 9, agi: 8, cun: 7, hp: 35 }, {
        legend: 'spartacus', level: 3, price: 350, eqAge: 24, traits: ['Strong', 'TrueGrit'], techniques: [['Smash', 1], ['Lunge', 1]],
      });
    case 'crixus':
      return named('carnotaurus', 'Crixus', { str: 10, agi: 6, cun: 4, hp: 35 }, {
        legend: 'crixus', level: 4, price: 250, eqAge: 23, traits: ['Strong', 'Fury'], techniques: [['Charge', 1], ['Smash', 1]],
      });
    case 'hannibalbarca':
      return named('triceratops', 'Barca', { str: 9, agi: 4, cun: 7, hp: 40 }, {
        legend: 'hannibalbarca', level: 4, price: 300, eqAge: 22, traits: ['Tactician', 'Tough'], techniques: [['Headbutt', 1]],
      });
    case 'hermes':
      return named('velociraptor', 'Hermes', { str: 5, agi: 12, cun: 8, hp: 25 }, {
        legend: 'hermes', level: 3, price: 250, eqAge: 20, traits: ['LightningSpeed', 'Agile'], techniques: [['StrikeAndRoll', 1]],
      });
    case 'maximus':
      return named('tyrannosaurus', 'Maximus', { str: 12, agi: 6, cun: 7, hp: 45 }, {
        legend: 'maximus', level: 5, price: 300, eqAge: 25, traits: ['Inspiring', 'Veteran', 'Hero'], techniques: [['Smash', 2], ['Rally', 1]],
      });
    case 'theokoles': {
      const c = named('tyrannosaurus', 'Theokoles', { str: 20, agi: 10, cun: 5, hp: 70 + Math.trunc(week / 20) }, {
        legend: 'theokoles', level: 8, price: 800, eqAge: 26, cls: 'slasher',
        traits: ['Albino', 'Titan', 'HorribleDisfigurement', 'Strong', 'Killer', 'ShowMan', 'Indomitable', 'Ambidextrous', 'DualWield', 'Alert'],
        techniques: [['Headbutt', 4], ['Rampage', 1], ['Cleave', 1]],
      });
      c.classXp = 10;
      c.fame = 150;
      c.genes.colors = c.genes.colors.map((_, i) => (i === 5 ? 15 : 39));
      return c;
    }
    case 'lictor':
      return makeLictor(state);
    default: {
      const c = generateDino({ tier: 'epic', week, level: Math.trunc(week / 10) + 1 });
      c.legend = key;
      return c;
    }
  }
}

/** GM Lictor: random level 6/10/15 (after week 120/220) Murmillo bodyguard with Enforcer, Tough, Veteran. */
export function lictorLevel(week: number): number {
  return week > 220 ? 15 : week > 120 ? 10 : 6;
}

export function makeLictor(state: GameState): Creature {
  const week = state.world.week;
  const c = generateDino({ week, level: 1, species: coin() ? 'triceratops' : 'allosaurus', eqAge: 24 });
  for (const t of ['Enforcer', 'Tough', 'Veteran', 'Loyal'] as TraitId[]) addTrait(c, t);
  c.cls = 'bulwark';
  c.classXp = 9;
  setLevelAndStats(c, lictorLevel(week));
  c.legend = 'lictor';
  c.name = `Lictor ${c.name}`;
  c.loyalty = 100;
  return c;
}

/** True if the creature is any kind of Horde leader. */
export function isRebelLeader(c: Creature): boolean {
  return hasTrait(c, 'RebelLeader') || hasTrait(c, 'RebelGeneral') || c.legend === 'spartacus';
}

/** Raw XP without the age/class multipliers (Horde training and scripted boosts), with GM level-ups. */
export function rawXp(c: Creature, n: number): void {
  if (n <= 0) return;
  c.xp += Math.trunc(n);
  while (c.xp >= xpForLevel(c.level + 1)) {
    c.level++;
    c.statPoints++;
    if (c.level % 3 === 0) c.techPoints++;
    if (c.kind === 'beast' && (c.level % 2 === 0 || c.level === 2)) c.techPoints++;
  }
  autoSpendStatPoints(c);
}
