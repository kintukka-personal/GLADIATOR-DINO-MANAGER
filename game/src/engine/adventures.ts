// Adventures (creatures sent away for scripted fights) incl. Wild Capture. OWNER: systems-story agent. GM 04 §8.
//
// sendOnAdventure marks the crew away and stores the Adventure; adventureWeek counts down; a finished
// adventure stays in player.adventures (weeksLeft ≤ 0) until resolveAdventure is called (the UI shows
// pendingAdventures). Adventures left unanswered for 6 weeks resolve themselves with choice 0.
//
// Keys (ADVENTURE_KEYS): criminal, patrician, trap, abducted, electionRival, whiteRhino, romulus1, romulus3,
// pericles, delphi, troyEscort, macedon, apolloContest, hannibalMerchant, tomb, hagBandits, graveRobbing,
// lookingGlass, croceaMors, wildCapture, specialTraining, marksmanTraining, hopliteWar.
// Any other key resolves as a plain success that pays data.reward.
// data.reward / data.fail (Reward) override or extend the default rewards; data.rivalId names the rival
// behind an adventure (Apollo contest assassin, Romulus III).

import type {
  Adventure, BattleResult, BeastSpeciesId, Creature, DinoSpeciesId, FoodId, GameState, ID, KibbleTier, SideModifier,
  SpeciesId, TechId, TraitId,
} from './types';
import { STATS } from './types';
import { chance, clamp, pick, rand, range, shuffle } from './rng';
import { achieve, message, newId } from './util';
import {
  addTrait, distributeWild, generateBeast, generateDino, getStat, hasTrait, isLearnable, learnTechnique, meetsRequirement,
  grantXp,
} from './creature';
import { SPECIES } from './data/species';
import { FOODS, KIBBLE_FOR_TIER } from './data/food';
import { storyHook } from './stories';
import { makeLegend } from './rivals';
import { addKeepers } from './economy';
import {
  L, OFF, UQ, andList, beastFoe, cloneAsFoe, cname, dinoFoe, dn, earn, fitOf, foeOutcome, full, giveGear, giveUnique,
  infl, injure, killMine, me, mine, monsterFoe, rivalById, sname, streetFight, traitName, uniqueName, weakestRival, bestOf,
  setLoadout,
} from './data/eventsDataKit';

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface Reward {
  denarii?: number;
  influence?: number;
  /** trait for the lead creature */
  trait?: TraitId;
  /** traits for every member of the crew */
  crewTrait?: TraitId;
  tech?: TechId;
  unique?: string | string[];
  gear?: { type: Parameters<typeof giveGear>[1]; quality: Parameters<typeof giveGear>[2] }[];
  flags?: Record<string, number | boolean | string>;
  /** a creature that joins the ludus */
  creature?: Creature;
  keepers?: number;
  text?: string;
}

function mergeReward(a: Reward | undefined, b: Reward | undefined): Reward {
  return { ...(a ?? {}), ...(b ?? {}) };
}

/** Apply a reward; returns the lines describing it. */
export function applyReward(s: GameState, crew: Creature[], r: Reward | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  const lead = crew[0];
  if (r.denarii) {
    earn(s, r.denarii);
    out.push(`${r.denarii > 0 ? '+' : ''}${dn(r.denarii)}`);
  }
  if (r.influence) {
    const got = infl(s, r.influence);
    out.push(`${got > 0 ? '+' : ''}${got} influence`);
  }
  if (r.trait && lead && addTrait(lead, r.trait)) out.push(`${cname(lead)} gains ${traitName(r.trait)}`);
  if (r.crewTrait) for (const c of crew) if (addTrait(c, r.crewTrait)) out.push(`${cname(c)} gains ${traitName(r.crewTrait)}`);
  if (r.tech && lead) {
    if (!lead.learnable.includes(r.tech)) lead.learnable.push(r.tech);
    if (meetsRequirement(lead, r.tech, 1) && isLearnable(lead, r.tech) && learnTechnique(lead, r.tech, true)) out.push(`${cname(lead)} learns a new technique`);
    else out.push(`${cname(lead)} can now learn a new technique`);
  }
  for (const key of r.unique === undefined ? [] : Array.isArray(r.unique) ? r.unique : [r.unique]) {
    giveUnique(s, key);
    out.push(uniqueName(key));
  }
  for (const g of r.gear ?? []) giveGear(s, g.type, g.quality);
  if (r.flags) Object.assign(s.world.flags, r.flags);
  if (r.creature) {
    me(s).creatures.push(r.creature);
    out.push(`${full(r.creature)} joins the ludus`);
  }
  if (r.keepers) {
    addKeepers(me(s), r.keepers);
    out.push(`${r.keepers} keeper${r.keepers === 1 ? '' : 's'}`);
  }
  if (r.text) out.push(r.text);
  return out;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface AdventureOutcome { text: string; battle?: BattleResult; success: boolean; keep?: boolean }

export interface AdventureDef {
  key: string;
  title: string;
  /** default duration */
  weeks: number;
  /** GM difficulty code (04 §8) */
  code: number;
  intro?: (s: GameState, adv: Adventure, crew: Creature[]) => string;
  choices?: (s: GameState, adv: Adventure, crew: Creature[]) => string[];
  onSend?: (s: GameState, adv: Adventure) => void;
  onArrive?: (s: GameState, adv: Adventure) => void;
  resolve: (s: GameState, adv: Adventure, crew: Creature[], choice: number) => AdventureOutcome;
}

const ADVENTURES: Record<string, AdventureDef> = {};
function def(d: AdventureDef): AdventureDef {
  ADVENTURES[d.key] = d;
  return d;
}

export function adventureDef(key: string): AdventureDef | undefined {
  return ADVENTURES[key];
}

interface BattleAdv {
  key: string; title: string; weeks: number; code: number;
  foeName: string;
  reward: Reward;
  fail?: Reward;
  win: string;
  lose: string;
  intro?: (s: GameState, adv: Adventure, crew: Creature[]) => string;
  modifiers?: (s: GameState, adv: Adventure, crew: Creature[]) => { player?: SideModifier[]; foe?: SideModifier[] };
  allies?: (s: GameState, adv: Adventure) => Creature[];
  onWin?: (s: GameState, adv: Adventure, crew: Creature[], r: BattleResult) => string | void;
  onLose?: (s: GameState, adv: Adventure, crew: Creature[], r: BattleResult) => string | void;
}

function battleAdv(o: BattleAdv): AdventureDef {
  return def({
    key: o.key, title: o.title, weeks: o.weeks, code: o.code,
    intro: o.intro ?? ((s, adv, crew) => `${andList(crew.map(cname))} ${crew.length === 1 ? 'has' : 'have'} reached the end of the road: ${o.foeName} block${o.foeName.includes(' and ') ? '' : 's'} the way.`),
    resolve(s, adv, crew) {
      const foes = adventureFoes(s, adv.key, adv);
      const mods = o.modifiers?.(s, adv, crew) ?? {};
      const f = streetFight(s, {
        title: adv.title, fighters: crew, foes, foeName: o.foeName, stake: 0,
        extraAllies: o.allies?.(s, adv), playerModifiers: mods.player, foeModifiers: mods.foe,
        deathCause: `Killed on an adventure: ${adv.title}`,
      });
      const alive = crew.filter((c) => mine(s, c.id));
      const lines: string[] = [];
      if (f.won) {
        lines.push(o.win);
        const extra = o.onWin?.(s, adv, alive, f.battle);
        if (extra) lines.push(extra);
        const got = applyReward(s, alive, mergeReward(o.reward, adv.data.reward));
        if (got.length) lines.push(`${got.join(', ')}.`);
      } else {
        lines.push(o.lose);
        const extra = o.onLose?.(s, adv, alive, f.battle);
        if (extra) lines.push(extra);
        const got = applyReward(s, alive, mergeReward(o.fail, adv.data.fail));
        if (got.length) lines.push(`${got.join(', ')}.`);
      }
      if (f.dead.length) lines.push(`Fallen: ${f.dead.join(', ')}.`);
      return { text: lines.join(' '), battle: f.battle, success: f.won };
    },
  });
}

function trip(key: string, title: string, weeks: number, text: (s: GameState, adv: Adventure, crew: Creature[]) => string, reward: (s: GameState, adv: Adventure, crew: Creature[]) => Reward): AdventureDef {
  return def({
    key, title, weeks, code: 0,
    intro: (s, adv, crew) => `${andList(crew.map(cname))} ${crew.length === 1 ? 'is' : 'are'} back from ${title.toLowerCase()}.`,
    resolve(s, adv, crew) {
      const got = applyReward(s, crew, mergeReward(reward(s, adv, crew), adv.data.reward));
      return { text: `${text(s, adv, crew)}${got.length ? ` ${got.join(', ')}.` : ''}`, success: true };
    },
  });
}

// --- 1 Criminal activity -----------------------------------------------------------------------
battleAdv({
  key: 'criminal', title: 'Hunting the villa robber', weeks: 3, code: 1, foeName: "a brigand's Allosaurus",
  reward: { denarii: 200, influence: 10, trait: 'Enforcer' },
  win: 'The brigand is dragged before the magistrate; his Allosaurus is dragged to the butcher. Your friend is grateful.',
  lose: 'The brigand got away, laughing, on the back of his Allosaurus.',
});

// --- 2 Patrician request ---------------------------------------------------------------------
battleAdv({
  key: 'patrician', title: 'Private exhibition for a patrician', weeks: 2, code: 2, foeName: 'a wild Sabertooth',
  reward: { denarii: 200, influence: 10, trait: 'ShowMan' },
  intro: (s, adv, crew) => `After two weeks of exhibition bouts in a patrician's garden, the finale: ${cname(crew[0] ?? ({ name: 'your dino' } as Creature))} against a wild Sabertooth, while the guests eat dormice.`,
  win: 'The guests applaud between mouthfuls. The patrician pays handsomely and tells all of Capua.',
  lose: 'The Sabertooth ate well. So did the guests, who found it all very amusing.',
});

// --- 3 Setting a trap ---------------------------------------------------------------------------
battleAdv({
  key: 'trap', title: 'Bait for the caravan robbers', weeks: 2, code: 3, foeName: 'a bandit and a highwayman',
  reward: { denarii: 200, influence: 20, trait: 'OneManArmy' },
  win: 'The bandits took the bait and lost their mounts and their nerve. The merchants of Capua are in your debt.',
  lose: 'The bandits took the bait, the cart and very nearly your dino.',
});

// --- 4 Keepers abducted ---------------------------------------------------------------------
battleAdv({
  key: 'abducted', title: 'Rescuing the abducted keepers', weeks: 2, code: 4, foeName: 'the abductor and his guard wolf',
  reward: { influence: 10, trait: 'Hero' },
  win: 'The abductor is dead and your keepers walk home, sunburnt but alive.',
  lose: 'The rescue failed. Your keepers were found along the Appian way, without their heads.',
  onWin: (s, adv) => {
    const n: number = adv.data.keepers ?? 0;
    if (n > 0) addKeepers(me(s), n);
    return n > 0 ? `${n} keeper${n === 1 ? '' : 's'} return${n === 1 ? 's' : ''}.` : undefined;
  },
});

// --- 5 Election rival ---------------------------------------------------------------------------
battleAdv({
  key: 'electionRival', title: 'A word with the popular candidate', weeks: 1, code: 5, foeName: "the candidate's guard and guard wolf",
  reward: { influence: 20, trait: 'Assassin' },
  fail: { influence: -10 },
  win: 'The popular candidate has withdrawn from public life, and from life in general.',
  lose: 'The guards drove your dino off. The candidate now tells the Forum that you tried to have him eaten.',
});

// --- 6 White Rhino ------------------------------------------------------------------------------
battleAdv({
  key: 'whiteRhino', title: 'The hunt for the White Rhino', weeks: 3, code: 6, foeName: 'the White Rhino',
  reward: { trait: 'Hunter', flags: { whiteRhinoDone: true } },
  win: 'After three weeks in the frozen hills, the White Rhino is brought down and roped.',
  lose: 'The White Rhino trampled the hunting party and vanished into the snow.',
  onWin: (s, adv, crew, r) => {
    const rhino = adv.data.rhino as Creature | undefined;
    if (!rhino) return;
    const o = foeOutcome(r, rhino);
    if (o?.died) {
      earn(s, 300);
      return 'Sadly it did not survive the capture; its pale horn fetches 300 denarii.';
    }
    rhino.injury = { type: 'broken', weeks: 4 };
    rhino.loyalty = 60;
    rhino.notes = (rhino.notes ?? []).filter((n) => !n.startsWith('gear:'));
    me(s).creatures.push(rhino);
    return `${rhino.name} joins your ludus, wounded and furious.`;
  },
});

// --- 7 Romulus I ------------------------------------------------------------------------------
battleAdv({
  key: 'romulus1', title: 'Stealing the Romulus scrolls', weeks: 2, code: 7, foeName: 'two temple guards',
  reward: { flags: { romulusStage: 1 } },
  fail: { influence: -10 },
  win: 'The scrolls are yours. They mention a cave, a she-wolf, and a tail club that killed a brother.',
  lose: 'The temple guards chased your dino out of the library. The scrolls stay where they are.',
});

// --- 8 Romulus III ------------------------------------------------------------------------------
battleAdv({
  key: 'romulus3', title: 'The cave on the Palatine hill', weeks: 3, code: 8, foeName: "a rival's best dino and beast",
  reward: { unique: ['foundersAxe', 'ancientCelticShield'], denarii: 500, flags: { romulusStage: 3 } },
  fail: { influence: -20, flags: { romulusStage: -1 } },
  intro: (s, adv) => {
    const r = rivalById(s, adv.data.rivalId);
    return `In the cave on the Palatine hill, ${r ? `${r.name}'s` : 'a rival house\'s'} creatures got there first. They will not share.`;
  },
  win: "Deep in the cave lies the Founder's Club, the tail club Romulus used on Remus, beside an old Celtic shield.",
  lose: 'Your rival carried the Founder\'s Club out of the cave while your dino licked its wounds.',
  onLose: (s, adv) => {
    const r = rivalById(s, adv.data.rivalId) ?? weakestRival(s);
    if (r) giveUnique(s, 'foundersAxe', r);
  },
});

// --- 9 Pericles -------------------------------------------------------------------------------
battleAdv({
  key: 'pericles', title: 'The tomb of Pericles', weeks: 3, code: 9, foeName: 'two grave robbers',
  reward: { unique: 'helmetOfPericles', flags: { periclesDone: true } },
  fail: { influence: -10, flags: { periclesDone: true } },
  win: 'The grave robbers will rob no more graves; they have a new one of their own.',
  lose: 'The grave robbers escaped with the helmet and sold it to a rival lanista.',
  onLose: (s) => {
    const r = weakestRival(s);
    if (r) giveUnique(s, 'helmetOfPericles', r);
  },
});

// --- 10 Delphi -------------------------------------------------------------------------------
battleAdv({
  key: 'delphi', title: 'The trial at Delphi', weeks: 2, code: 10, foeName: 'three wolves of Apollo',
  reward: { influence: 20, trait: 'Devotion' },
  fail: { influence: -50 },
  win: 'The Pythia nods. Apollo is satisfied, for now.',
  lose: '"Do you think the favour of the gods comes lightly?" The Pythia turns her back.',
});

// --- 11 Troy escort ---------------------------------------------------------------------------
battleAdv({
  key: 'troyEscort', title: 'Escorting the Trojan nobleman', weeks: 2, code: 11, foeName: 'three venom-spitting assassins',
  reward: { flags: { troyStage: 1 } },
  fail: { flags: { troyStage: -1 } },
  intro: () => 'On the road to Capua, three assassins rise from the reeds. The Trojan\'s bodyguard, Hector, lowers the horns of his Triceratops beside you.',
  allies: (s) => [adventureAlly(s, 'hector')],
  win: 'The assassins are dead. "Troy will remember this," says Hector. "And so will I."',
  lose: 'The nobleman died in the reeds, and with him his dreams of a restored Troy.',
});

// --- 200 Macedonian spoils ----------------------------------------------------------------------
battleAdv({
  key: 'macedon', title: 'The Macedonian spoils', weeks: 3, code: 200, foeName: 'Vorenus and Pullo',
  reward: { unique: 'alexandersArmor', denarii: 200, influence: 20, trait: 'Veteran' },
  fail: { influence: -10 },
  win: 'Vorenus and Pullo yield, cursing. The barding of Alexander is yours.',
  lose: 'Vorenus and Pullo carry the barding back to Caesar, arguing about who did the work.',
});

// --- 201 Apollo contest -----------------------------------------------------------------------
battleAdv({
  key: 'apolloContest', title: 'The contest of Apollo', weeks: 2, code: 201, foeName: 'a hooded assassin',
  reward: { unique: 'bowOfApollo', tech: 'HailOfArrows' },
  intro: (s, adv, crew) => `${cname(crew[0] ?? ({ name: 'Your dino' } as Creature))} won the contest. On the way home, a hooded figure steps out of the shadows with a Troodon on a leash.`,
  win: "The assassin is dead and Apollo's Venom is yours.",
  lose: "The assassin left your dino in the dust and took the prize back to the rival who sent him.",
  onLose: (s, adv) => {
    const r = rivalById(s, adv.data.rivalId);
    if (r) giveUnique(s, 'bowOfApollo', r);
  },
});

// --- 300 Tomb of the Pharaoh (Sphinx) ------------------------------------------------------
const SPHINX = ['Man', 'A tree', 'A caterpillar'];
def({
  key: 'tomb', title: 'The tomb of Necho II', weeks: 3, code: 300,
  intro: (s, adv, crew) => `${cname(crew[0] ?? ({ name: 'Your dino' } as Creature))} reaches the tomb. A Sphinx bars the way: "What walks on four legs in the morning, two legs in the afternoon, and three legs in the evening?"`,
  choices: () => [...SPHINX],
  resolve(s, adv, crew, choice) {
    if (choice !== 0) {
      infl(s, -10);
      const quip = choice === 2
        ? '"I have endured half a millennium on this forsaken desert... and you tell me the answer is \'Caterpillar\'?" The Sphinx sends your party packing.'
        : '"IT IS WRONG!" roars the Sphinx. Your party runs all the way to Alexandria.';
      return { text: `${quip} −10 influence.`, success: false };
    }
    const foes = adventureFoes(s, 'tomb', adv);
    const f = streetFight(s, { title: adv.title, fighters: crew, foes, foeName: 'the Risen One', stake: 0, deathCause: 'Slain by the Risen One in the tomb of Necho II' });
    const alive = crew.filter((c) => mine(s, c.id));
    if (f.won) {
      const got = applyReward(s, alive, mergeReward({ unique: 'blackDeath', denarii: 500, influence: 10, trait: 'Adventurous' }, adv.data.reward));
      return { text: `"Man," says your dino's keeper. The Sphinx steps aside. In the burial chamber the Risen One stirs, and falls again. Black Death, the obsidian crusher of Necho II, and a pile of treasure. ${got.join(', ')}.`, battle: f.battle, success: true };
    }
    infl(s, -10);
    return { text: 'The Risen One drove your party from the tomb. Some curses are real. −10 influence.', battle: f.battle, success: false };
  },
});

// --- 301 Hag's bandits ---------------------------------------------------------------------------
battleAdv({
  key: 'hagBandits', title: "The old woman's bandits", weeks: 2, code: 301, foeName: 'the bandit leader and his men',
  reward: { denarii: 100, influence: 10, trait: 'Enforcer' },
  fail: { influence: -10 },
  modifiers: (s, adv, crew) => {
    const sly = crew.some((c) => ['Sneaky', 'Preparation', 'Tactician', 'Enforcer', 'Underhanded'].some((t) => hasTrait(c, t as TraitId)));
    return sly ? { foe: ['Surprised'] } : {};
  },
  win: 'The bandits are dead and the old woman\'s bundle is recovered. She smiles with too many teeth.',
  lose: 'The bandits laughed your dino out of the hills.',
});

// --- 330 Grave robbing ---------------------------------------------------------------------------
battleAdv({
  key: 'graveRobbing', title: 'The Celtic king\'s burial mound', weeks: 3, code: 330, foeName: 'two angry Celts and their chief',
  reward: { gear: [{ type: 'spectralSaddle', quality: 5 }], denarii: 100, influence: 10, text: 'the Spectral Saddle' },
  fail: { influence: -10 },
  win: 'The Celts are beaten and the mound is yours. Among the bones lies a saddle that is cold to the touch.',
  lose: 'The Celts defended their king. Your dino came home with a spear in its hide.',
});

// --- 340 Looking Glass heist -----------------------------------------------------------------------
battleAdv({
  key: 'lookingGlass', title: 'A closer look', weeks: 2, code: 340, foeName: 'the guard captain and a guard',
  reward: { gear: [{ type: 'lookingGlass', quality: 2 }], denarii: 100, influence: 10, trait: 'Thief', text: 'the Looking Glass' },
  fail: { influence: -10 },
  win: 'The guards are down and the rival\'s most prized possession is yours: a Looking Glass. You can now inspect every battle log.',
  lose: 'The guards caught your dino at the window. The Looking Glass stays where it is.',
});

// --- 250 Hannibal's merchant ---------------------------------------------------------------
function hannibalPrice(crew: Creature[]): number {
  return crew.some((c) => c.species === 'troodon') ? 1500 : 2000;
}
def({
  key: 'hannibalMerchant', title: 'The ruins of Carthage', weeks: 4, code: 250,
  intro: (s, adv, crew) => `In the ruins of Carthage a merchant guards a chest-piece that once belonged to Hannibal Barca. He wants ${dn(hannibalPrice(crew))} for it, and he has hired guards.`,
  choices: (s, adv, crew) => ['Rob him (fight his guards)', 'Steal the chest-piece at night', `Pay ${dn(hannibalPrice(crew))}`],
  resolve(s, adv, crew, choice) {
    const lead = crew[0];
    const win = (text: string, battle?: BattleResult): AdventureOutcome => {
      const got = applyReward(s, crew.filter((c) => mine(s, c.id)), mergeReward({ unique: 'hannibalsRegalia', flags: { hannibalStage: 3 } }, adv.data.reward));
      return { text: `${text} ${got.join(', ')}.`, battle, success: true };
    };
    const lose = (text: string, battle?: BattleResult): AdventureOutcome => {
      infl(s, -10);
      return { text: `${text} −10 influence.`, battle, success: false };
    };
    if (choice === 2) {
      const price = hannibalPrice(crew);
      if (me(s).denarii < price) return { text: `You cannot afford ${dn(price)}. The merchant waits.`, success: false, keep: true };
      me(s).denarii -= price;
      return win(`You pay ${dn(price)}. The merchant bites every coin.`);
    }
    if (choice === 1 && lead) {
      let bonus = 0;
      for (const t of ['Thief', 'Sneaky', 'Underhanded'] as TraitId[]) if (hasTrait(lead, t)) bonus += 5;
      if (lead.species === 'troodon') bonus += 5;
      const score = rand(80) + getStat(lead, 'cun') + Math.floor(getStat(lead, 'agi') / 2) + bonus;
      if (score > 80) return win(`${cname(lead)} slips into the merchant's tent at night and out again with the chest-piece in its jaws.`);
      injure(lead, 2);
      return lose(`${cname(lead)} was caught with its head in the chest and beaten with sticks.`);
    }
    const foes = adventureFoes(s, 'hannibalMerchant', adv);
    const f = streetFight(s, { title: adv.title, fighters: crew, foes, foeName: "the merchant's guards", stake: 0, deathCause: 'Killed in the ruins of Carthage' });
    return f.won ? win('The guards are scattered among the ruins.', f.battle) : lose('The guards held. The merchant raises his price.', f.battle);
  },
});

// --- 150 Quest for Crocea Mors ---------------------------------------------------------------
interface Approach { label: string; kill?: boolean; check: (c: Creature) => boolean; cleanFail?: boolean }
const tb = (c: Creature, ts: TraitId[]): number => ts.reduce((a, t) => a + (hasTrait(c, t) ? 5 : 0), 0);
export const CROCEA_APPROACHES: Approach[] = [
  { label: 'Pay the guards in counterfeit gold', check: (c) => rand(50) + getStat(c, 'cun') + tb(c, ['Underhanded', 'Untrustworthy']) > 38 },
  { label: 'Roar the wrath of Rome at the gate', kill: true, check: (c) => rand(75) + getStat(c, 'cun') > 60 },
  { label: 'Out-drink the guards (a trough of wine)', check: (c) => rand(50) + Math.floor(getStat(c, 'hp') / 5) + tb(c, ['Tough', 'Indomitable', 'BacchusChampion']) > 42 },
  { label: 'Sneak in at night', check: (c) => rand(50) + getStat(c, 'agi') + tb(c, ['Thief', 'Agile', 'Sneaky']) > 43 },
  { label: "Snatch the chieftain's child for ransom", kill: true, cleanFail: true, check: (c) => rand(75) + getStat(c, 'agi') > 66 },
  { label: 'Wrestle their strongest war-beast', check: (c) => rand(50) + getStat(c, 'str') > 46 },
  { label: 'Storm the keep', kill: true, check: (c) => rand(75) + getStat(c, 'str') > 66 },
  // GM bug fixed: helpful traits now raise the chance instead of lowering it
  { label: 'Whatever means necessary', check: (c) => rand(100) + tb(c, ['Ruthless', 'Killer', 'Underhanded', 'Psychopath']) > 75 },
];
def({
  key: 'croceaMors', title: 'The voyage to Britannia', weeks: 4, code: 150,
  onArrive: (s, adv) => {
    if (!Array.isArray(adv.data.approaches)) adv.data.approaches = shuffle(CROCEA_APPROACHES.map((_, i) => i)).slice(0, 3);
  },
  intro: (s, adv, crew) => `${cname(crew[0] ?? ({ name: 'Your dino' } as Creature))} has reached the Britannic hill-fort where Caesar's lost talons, Crocea Mors, hang above the chieftain's hearth. How will it get in?`,
  choices: (s, adv) => approachesOf(adv).map((i) => CROCEA_APPROACHES[i].label),
  resolve(s, adv, crew, choice) {
    const lead = crew[0];
    if (!lead) return { text: 'Nobody came back from Britannia.', success: false };
    const list = approachesOf(adv);
    const a = CROCEA_APPROACHES[list[clamp(choice, 0, list.length - 1)]];
    if (a.check(lead)) {
      const got = applyReward(s, crew, mergeReward({ unique: 'croceaMors', flags: { lostBladeDone: true } }, adv.data.reward));
      return { text: `${a.label}: it works! ${cname(lead)} comes home with Crocea Mors. ${got.join(', ')}.`, success: true };
    }
    if (a.kill && chance(0.3)) {
      killMine(s, lead, 'Died in Britannia hunting for Crocea Mors');
      return { text: `${a.label}: it goes horribly wrong. ${cname(lead)} will not be coming home.`, success: false };
    }
    if (a.cleanFail && chance(0.5)) {
      addKeepers(me(s), 1);
      return { text: `${a.label}: the chieftain refused to pay. The child, however, followed ${cname(lead)} home and now works as a keeper.`, success: false };
    }
    injure(lead, range(2, 6), 'broken');
    return { text: `${a.label}: it fails. ${cname(lead)} limps home from Britannia empty-jawed.`, success: false };
  },
});
function approachesOf(adv: Adventure): number[] {
  if (!Array.isArray(adv.data.approaches)) adv.data.approaches = [0, 3, 5];
  return adv.data.approaches as number[];
}

// --- Wild Capture ------------------------------------------------------------------------------
const TIERS: KibbleTier[] = ['simple', 'regular', 'superior', 'exceptional', 'extraordinary'];

/** ARK taming effectiveness for a kibble (0.1 Simple … 0.5 Extraordinary; +0.05 for the species' favourite, max 0.5). */
export function tamingEffectiveness(species: SpeciesId, kibble: FoodId | undefined): number {
  if (!kibble) return 0;
  const tier = FOODS[kibble]?.tier;
  if (!tier) return 0;
  let te = 0.1 * (TIERS.indexOf(tier) + 1);
  if (KIBBLE_FOR_TIER[SPECIES[species].kibble] === kibble) te += 0.05;
  return Math.round(Math.min(0.5, te) * 100) / 100;
}

/** Generate the wild creature a capture party will meet. */
export function wildCreature(s: GameState, species: SpeciesId): Creature {
  const sp = SPECIES[species];
  let c: Creature;
  if (sp.kind === 'beast') {
    c = generateBeast(species as BeastSpeciesId, { variant: 'random' });
  } else {
    const alpha = chance(0.2);
    c = generateDino({ species: species as DinoSpeciesId, week: s.world.week, level: 1, bonusWild: alpha ? 6 : 0 });
    c.maturity = 1;
    if (c.adultWeeks < 20) c.adultWeeks = 20 + rand(120);
    c.ageWeeks = sp.matureWeeks + c.adultWeeks;
    if (alpha) c.notes = [...(c.notes ?? []), 'Herd alpha'];
  }
  c.fame = 0;
  c.price = undefined;
  c.epic = undefined;
  return c;
}

def({
  key: 'wildCapture', title: 'Wild Capture', weeks: 2, code: 400,
  onSend: (s, adv) => {
    const h = me(s);
    const k = adv.data.kibble as FoodId | undefined;
    if (k) {
      if ((h.pantry[k] ?? 0) > 0) h.pantry[k] = (h.pantry[k] ?? 0) - 1;
      else {
        const price = s.world.market.foodPrices?.[k] ?? FOODS[k].price;
        if (h.denarii >= price) h.denarii -= price;
        else adv.data.kibble = undefined;
      }
    }
    if (!adv.data.wild && adv.data.species) adv.data.wild = wildCreature(s, adv.data.species as SpeciesId);
  },
  intro: (s, adv, crew) => {
    const w = adv.data.wild as Creature | undefined;
    const k = adv.data.kibble as FoodId | undefined;
    return `${andList(crew.map(cname))} found the herd. ${w ? `A wild ${sname(w)} (${w.sex === 'F' ? 'female' : 'male'}) ` : 'A wild creature '}is lured out with ${k ? FOODS[k].name : 'nothing but hope'}. It has to be worn down before it can be tamed.`;
  },
  resolve(s, adv, crew) {
    const w = (adv.data.wild as Creature | undefined) ?? wildCreature(s, (adv.data.species ?? 'velociraptor') as SpeciesId);
    const f = streetFight(s, { title: adv.title, fighters: crew, foes: [w], foeName: `a wild ${sname(w)}`, stake: 0, deathCause: `Killed trying to capture a wild ${sname(w)}` });
    if (!f.won) return { text: `The wild ${sname(w)} drove the party off and returned to its herd.`, battle: f.battle, success: false };
    const o = foeOutcome(f.battle, w);
    if (o?.died) return { text: `The wild ${sname(w)} fought to the last and died. Nothing to tame but a carcass.`, battle: f.battle, success: false };
    const te = tamingEffectiveness(w.species, adv.data.kibble as FoodId | undefined);
    const { creature: tamed, bonus } = tameWild(s, w, te);
    if (o?.injury) tamed.injury = o.injury;
    return {
      text: `The ${sname(w)} is tamed! Taming effectiveness ${Math.round(te * 100)}%: +${bonus} wild points. ${full(tamed)} joins your ludus.`,
      battle: f.battle, success: true,
    };
  },
});

/** ARK taming: bonus wild points = round(TE × total wild points), spread by species weights; joins the ludus. */
export function tameWild(s: GameState, c: Creature, te: number): { creature: Creature; bonus: number } {
  const total = c.genes.wild.str + c.genes.wild.agi + c.genes.wild.cun + c.genes.wild.hp;
  const bonus = Math.round(te * total);
  const add = distributeWild(c.species, bonus);
  for (const k of STATS) c.genes.wild[k] = Math.min(255, c.genes.wild[k] + add[k]);
  c.genes.tamingEffectiveness = te;
  c.loyalty = clamp(Math.round(50 + 50 * te), 0, 100);
  c.notes = [...(c.notes ?? []).filter((n) => !n.startsWith('gear:')), `Captured in the wild (week ${s.world.week})`];
  c.gear = {};
  c.away = undefined;
  me(s).creatures.push(c);
  return { creature: c, bonus };
}

// --- Training trips (GM difficulty 0: automatic success) ----------------------------------------
trip('specialTraining', 'Specialised training', 4,
  (s, adv, crew) => `Legion instructors drilled ${andList(crew.map(cname))} for four weeks.`,
  (s, adv) => ({ trait: (adv.data.trait as TraitId | undefined) ?? 'ExoticFightingStyle' }));
trip('marksmanTraining', 'Marksman training on Crete', 4,
  (s, adv, crew) => `The Cretan spitters taught ${andList(crew.map(cname))} to lead the target.`,
  () => ({ trait: 'Marksman', gear: [{ type: 'venomSpitter', quality: 1 }], text: 'an old Venom Spitter' }));
trip('hopliteWar', 'The hoplite war', 4,
  (s, adv, crew) => `${andList(crew.map(cname))} returns from the war in ${adv.data.place ?? 'Greece'}, horns notched and head held high.`,
  () => ({ trait: 'Hoplite', influence: 5 }));

export const ADVENTURE_KEYS: string[] = Object.keys(ADVENTURES);

// ---------------------------------------------------------------------------
// Scripted foes (GM adversary table, renamed)
// ---------------------------------------------------------------------------

/** Scripted allies that join the player's side (Hector on the Troy escort). */
export function adventureAlly(s: GameState, key: string): Creature {
  if (key === 'hector') {
    // the shared Hector legend (rivals.makeLegend), carrying his harness as a scripted loadout
    let c: Creature | undefined;
    try {
      c = makeLegend(s, 'hector');
    } catch {
      c = undefined;
    }
    if (!c) {
      c = dinoFoe(s, 'triceratops', 'Hector', { mult: 1.3, noScale: true, traits: ['Hero', 'Inspiring'], cls: 'phalanx' });
    }
    c.name = 'Hector';
    setLoadout(c, [L('hornLance', 4), L('bashPlate', 3), L('bronzeBarding', 3)]);
    return c;
  }
  return dinoFoe(s, 'iguanodon', 'Ally', {});
}

/** Scripted foe roster for an adventure (GM table, scaled by week, ascension and difficulty). */
export function adventureFoes(state: GameState, key: string, adv?: Adventure): Creature[] {
  const s = state;
  switch (key) {
    case 'criminal':
      return [dinoFoe(s, 'allosaurus', "Brigand's Allosaurus", { gear: [L('talonBlades', 2), L('studdedBarding', 1)] })];
    case 'patrician':
      return [beastFoe(s, 'sabertooth', 'Wild Sabertooth', { variant: 'strong' })];
    case 'trap':
      return [
        dinoFoe(s, 'velociraptor', "Bandit's Velociraptor", { mult: 0.9, gear: [L('fangCaps', 2), L('lightHarness', 1)] }),
        dinoFoe(s, 'carnotaurus', "Highwayman's Carnotaurus", { mult: 0.9, gear: [L('hornLance', 2)] }),
      ];
    case 'abducted':
      return [
        dinoFoe(s, 'troodon', "Abductor's Troodon", { mult: 1.3, extraTiers: 1, traits: ['Sneaky'], gear: [L('venomFangs', 3), L('camoHide', 2)] }),
        beastFoe(s, 'direwolf', 'Guard Wolf', { mult: 1.3, variant: 'strong', extraTiers: 1 }),
      ];
    case 'electionRival':
      return [
        dinoFoe(s, 'iguanodon', 'Candidate\'s Guard', { cls: 'bulwark', gear: [L('talonBlades', 2), L('frillGuard', 2), L('legionFaceplate', 1)] }),
        beastFoe(s, 'direwolf', 'Guard Wolf', {}),
      ];
    case 'whiteRhino': {
      const rhino = adv?.data.rhino as Creature | undefined;
      if (rhino) return [rhino];
      const c = beastFoe(s, 'woollyrhino', 'The White Rhino', { mult: 1.3, variant: 'strong', traits: ['Albino', 'ThickHide', 'SurvivalOfTheFittest'], plus: { str: 4, hp: 30 } });
      c.genes.colors = c.genes.colors.map((x, i) => (i === 5 ? 15 : 39));
      if (adv) adv.data.rhino = c;
      return [c];
    }
    case 'romulus1':
      return [
        dinoFoe(s, 'iguanodon', 'Temple Guard I', { mult: 0.9, gear: [L('talonBlades', 2), L('frillGuard', 1), L('legionBarding', 1)] }),
        dinoFoe(s, 'iguanodon', 'Temple Guard II', { mult: 0.9, gear: [L('hornLance', 2), L('legionBarding', 1)] }),
      ];
    case 'romulus3': {
      const r = rivalById(s, adv?.data.rivalId) ?? weakestRival(s);
      const out: Creature[] = [];
      const bestDino = r ? bestOf(fitOf(r, (c) => c.kind === 'dino')) : undefined;
      const bestBeast = r ? bestOf(fitOf(r, (c) => c.kind === 'beast')) : undefined;
      out.push(bestDino ? cloneAsFoe(bestDino, r) : dinoFoe(s, 'carnotaurus', 'Rival Champion', { mult: 1.2, gear: [L('greatTalons', 3), L('bronzeBarding', 2)] }));
      out.push(bestBeast ? cloneAsFoe(bestBeast, r) : beastFoe(s, 'sabertooth', 'Rival Sabertooth', { mult: 1.1, variant: 'strong' }));
      return out;
    }
    case 'pericles':
      return [
        dinoFoe(s, 'dilophosaurus', 'Grave Robber I', { gear: [L('fangCaps', 2), L('camoHide', 1)] }),
        dinoFoe(s, 'dilophosaurus', 'Grave Robber II', { gear: [L('venomFangs', 2), L('camoHide', 1)] }),
      ];
    case 'delphi':
      return [
        beastFoe(s, 'direwolf', 'Mangy Wolf', { mult: 0.8 }),
        beastFoe(s, 'direwolf', 'Rabid Wolf', { mult: 1, traits: ['Fury'] }),
        beastFoe(s, 'alphadirewolf', 'Dire Wolf of Apollo', { mult: 1.2, variant: 'strong' }),
      ];
    case 'troyEscort':
      return [1, 2, 3].map((i) => dinoFoe(s, 'dilophosaurus', `Assassin ${['I', 'II', 'III'][i - 1]}`, {
        mult: 1.1, cls: 'spitter', traits: ['Marksman'], gear: [L('venomSpitter', i === 3 ? 3 : 2), L('huntersHood', 2)],
      }));
    case 'macedon':
      return [
        dinoFoe(s, 'iguanodon', 'Vorenus', { mult: 1.3, cls: 'bulwark', traits: ['Veteran', 'Tough'], gear: [L('talonBlades', 3), L('frillGuard', 3), L('legionBarding', 3), L('legionFaceplate', 3)] }),
        dinoFoe(s, 'iguanodon', 'Pullo', { mult: 1.3, cls: 'brute', traits: ['Strong', 'Fury'], gear: [L('tailClub', 3), L('legionBarding', 3), L('legionFaceplate', 2)] }),
      ];
    case 'apolloContest':
      return [dinoFoe(s, 'troodon', 'The Assassin', {
        mult: 1.3, traits: ['Assassin', 'Sneaky'], techs: [['SneakAttack', 2], ['CheapShot', 2], ['Gouge', 2]],
        gear: [L('venomFangs', 4), OFF('venomFangs', 4), L('huntersHood', 4), L('camoHide', 4)],
      })];
    case 'hannibalMerchant':
      return [
        dinoFoe(s, 'troodon', 'Guard I', { gear: [L('talonBlades', 2), L('strappedBuckler', 2), L('carthaginianCrest', 1)] }),
        dinoFoe(s, 'carnotaurus', 'Captain of the Guard', { mult: 1.2, gear: [L('scytheClaws', 3), L('bronzeBarding', 2), L('carthaginianCrest', 2)] }),
        dinoFoe(s, 'troodon', 'Guard II', { gear: [L('hornLance', 2), L('carthaginianCrest', 1)] }),
      ];
    case 'tomb':
      return [dinoFoe(s, 'spinosaurus', 'The Risen One', {
        level: Math.max(10, Math.round(foeLevelOf(s) * 1.2)), traits: ['Undeath', 'Indomitable'],
        gear: [L('obsidianCrusher', 4, 'TimeWarped'), L('quiltedBarding', 3)],
      })];
    case 'hagBandits':
      return [
        dinoFoe(s, 'allosaurus', 'Bandit Leader', { mult: 1.2, gear: [L('scytheClaws', 3), L('studdedBarding', 2)] }),
        dinoFoe(s, 'velociraptor', 'Bandit', { mult: 0.8, gear: [L('fangCaps', 1)] }),
        dinoFoe(s, 'velociraptor', 'Bandit', { mult: 0.8, gear: [L('talonBlades', 1)] }),
      ];
    case 'graveRobbing':
      return [
        dinoFoe(s, 'pachycephalosaurus', 'Angry Celt', { gear: [L('tailClub', 2), L('hornedHelm', 1)] }),
        dinoFoe(s, 'pachycephalosaurus', 'Angry Celt', { gear: [L('hornLance', 2), L('hornedHelm', 1)] }),
        dinoFoe(s, 'tyrannosaurus', 'The Local Chief', { mult: 1.2, traits: ['CelestialChampion'], gear: [L('tailClub', 3), L('hornedHelm', 3), L('studdedBarding', 2)] }),
      ];
    case 'lookingGlass':
      return [
        dinoFoe(s, 'carnotaurus', 'Guard Captain', { mult: 1.15, gear: [L('hornLance', 3), L('bronzeBarding', 2)] }),
        dinoFoe(s, 'iguanodon', 'Guard', { gear: [L('talonBlades', 2), L('frillGuard', 2)] }),
      ];
    case 'wildCapture': {
      const w = adv?.data.wild as Creature | undefined;
      if (w) return [w];
      return [wildCreature(s, (adv?.data.species ?? 'velociraptor') as SpeciesId)];
    }
    case 'underworldWeak':
      return [monsterFoe(s, s.world.week < 60 ? 'mandrake' : s.world.week < 100 ? 'harpy' : 'minotaur', 'Horror from the pit')];
    case 'underworldStrong':
      return [monsterFoe(s, s.world.week < 30 ? 'harpy' : s.world.week < 50 ? 'minotaur' : 'lesserhydra', 'Terror of Tartarus')];
    default:
      return [dinoFoe(s, 'allosaurus', 'Brigand\'s Allosaurus', {})];
  }
}

function foeLevelOf(s: GameState): number {
  return clamp(Math.round(2 + s.world.week / 7), 1, 45);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function sendOnAdventure(state: GameState, key: string, creatureIds: ID[], weeks: number, data?: Record<string, unknown>, title?: string): Adventure {
  const d = ADVENTURES[key];
  const h = state.player.ludus;
  const crew = creatureIds
    .map((id) => h.creatures.find((c) => c.id === id))
    .filter((c): c is Creature => !!c && !c.away);
  const w = Math.max(0, Math.round(Number.isFinite(weeks) ? weeks : d?.weeks ?? 2));
  const adv: Adventure = {
    id: newId('a'), key, title: title ?? d?.title ?? 'An adventure', creatureIds: crew.map((c) => c.id), weeksLeft: w,
    data: { ...(data ?? {}), weeks: w, sentWeek: state.world.week },
  };
  for (const c of crew) c.away = { kind: 'adventure', weeksLeft: w, ref: adv.id, note: adv.title };
  state.player.adventures.push(adv);
  d?.onSend?.(state, adv);
  if (w <= 0) {
    d?.onArrive?.(state, adv);
    adv.data.arrivedWeek = state.world.week;
  }
  if (crew.length) {
    message(state, 'assistant', adv.title, `${andList(crew.map(cname))} set${crew.length === 1 ? 's' : ''} off: ${adv.title}${w > 0 ? ` (${w} week${w === 1 ? '' : 's'})` : ''}.`);
  }
  return adv;
}

/** Countdown; finished adventures become pending results. */
export function adventureWeek(state: GameState): void {
  const p = state.player;
  const auto: Adventure[] = [];
  for (const adv of p.adventures) {
    if (adv.weeksLeft > 0) {
      adv.weeksLeft--;
      for (const id of adv.creatureIds) {
        const c = mine(state, id);
        if (c?.away && c.away.ref === adv.id) c.away.weeksLeft = Math.max(0, adv.weeksLeft);
      }
      if (adv.weeksLeft <= 0) {
        ADVENTURES[adv.key]?.onArrive?.(state, adv);
        adv.data.arrivedWeek = state.world.week;
        const crew = adv.creatureIds.map((id) => mine(state, id)).filter((c): c is Creature => !!c);
        message(state, 'assistant', adv.title, crew.length
          ? `${andList(crew.map(cname))} ${crew.length === 1 ? 'has' : 'have'} reached the end of the journey: ${adv.title}. Your orders are awaited.`
          : `Word has come back from ${adv.title}.`);
      }
    } else if (state.world.week - (adv.data.arrivedWeek ?? state.world.week) >= 6) {
      auto.push(adv);
    }
  }
  for (const adv of auto) {
    const r = resolveAdventure(state, adv.id, 0);
    message(state, 'assistant', adv.title, `Left without orders, the party acted on its own. ${r.text}`);
  }
}

export interface AdventureResolution { adventure: Adventure; choices?: string[]; text: string }

function crewOf(state: GameState, adv: Adventure): Creature[] {
  return adv.creatureIds.map((id) => mine(state, id)).filter((c): c is Creature => !!c);
}

/** Pending finished adventures waiting for the player. */
export function pendingAdventures(state: GameState): AdventureResolution[] {
  return state.player.adventures.filter((a) => a.weeksLeft <= 0).map((adv) => {
    const d = ADVENTURES[adv.key];
    const crew = crewOf(state, adv);
    const text = !crew.length
      ? `Nobody came back from ${adv.title}.`
      : d?.intro?.(state, adv, crew) ?? `${andList(crew.map(cname))} ${crew.length === 1 ? 'is' : 'are'} back: ${adv.title}.`;
    const choices = crew.length ? d?.choices?.(state, adv, crew) : undefined;
    return choices?.length ? { adventure: adv, choices, text } : { adventure: adv, text };
  });
}

/** Resolve (with optional choice: Sphinx answer, Crocea Mors approach, Hannibal merchant…). */
export function resolveAdventure(state: GameState, adventureId: ID, choice?: number): { text: string; battle?: BattleResult; success: boolean } {
  const p = state.player;
  const adv = p.adventures.find((a) => a.id === adventureId);
  if (!adv) return { text: 'There is no such adventure.', success: false };
  if (adv.weeksLeft > 0) return { text: `${adv.title} is still under way (${adv.weeksLeft} week${adv.weeksLeft === 1 ? '' : 's'} left).`, success: false };
  const d = ADVENTURES[adv.key];
  const crew = crewOf(state, adv);
  const awayBefore = new Map(crew.map((c) => [c.id, c.away]));
  for (const c of crew) c.away = undefined;
  let r: AdventureOutcome;
  if (!crew.length) {
    r = { text: `Nobody came back from ${adv.title}.`, success: false };
  } else if (d) {
    r = d.resolve(state, adv, crew, Math.max(0, Math.floor(choice ?? 0)));
  } else {
    const got = applyReward(state, crew, adv.data.reward as Reward | undefined);
    r = { text: `${andList(crew.map(cname))} returned from ${adv.title}.${got.length ? ` ${got.join(', ')}.` : ''}`, success: true };
  }
  if (r.keep) {
    for (const c of crew) c.away = awayBefore.get(c.id);
    return { text: r.text, battle: r.battle, success: r.success };
  }
  const weeks: number = adv.data.weeks ?? d?.weeks ?? 1;
  for (const c of crew) {
    if (!mine(state, c.id)) continue;
    c.away = undefined;
    c.rebellionGrace = true;
    grantXp(c, 20 * Math.max(1, weeks));
  }
  p.adventures = p.adventures.filter((a) => a.id !== adv.id);
  if (r.success) {
    achieve(state, 'adventurer');
    if (state.world.difficulty.hard) achieve(state, 'adventurerHard');
    if (state.world.difficulty.nightmare) achieve(state, 'adventurerNightmare');
  }
  storyHook(state, 'adventure', { key: adv.key, success: r.success, adventureId: adv.id, data: adv.data, creatureIds: adv.creatureIds });
  return { text: r.text, battle: r.battle, success: r.success };
}

/** Is a creature busy on an adventure? */
export function onAdventure(c: Creature): boolean {
  return c.away?.kind === 'adventure';
}

/** Light helper for UIs: weeks left of the adventure a creature is on. */
export function adventureOf(state: GameState, c: Creature): Adventure | undefined {
  return state.player.adventures.find((a) => a.creatureIds.includes(c.id));
}

/** Pick a species for a wild herd sighting (dinos available by the week, some beasts). */
export function wildHerdSpecies(s: GameState): SpeciesId {
  const week = s.world.week;
  const dinos = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => {
    const sp = SPECIES[id];
    return sp.kind === 'dino' && sp.marketFromWeek <= week + 10;
  });
  const beasts: SpeciesId[] = ['direwolf', 'sabertooth', 'terrorbird', 'direbear', 'sarcosuchus'];
  return chance(0.25) ? pick(beasts) : pick(dinos);
}

export type { Adventure };
