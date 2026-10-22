// Tameness (loyalty), breakouts and uprisings. OWNER: world-economy agent. GM 05 §4, 03 §3.5.
import type { Creature, GameState, Heritage, Ludus, ResultCard, SpeciesId } from './types';
import { gearWorth } from './data/gear';
import { clamp, rand, shuffle } from './rng';
import { asc, ASC, isPlayerHouse, report } from './util';
import { addTrait, getStat, grantXp, injuryProne, maxHp, traitLoyaltyDrift } from './creature';
import { addInfluence, betrayalDR, entertainment, keeperCount, loseKeepers, securityTotal } from './economy';
import { influenceLoyaltyEffect } from './influence';
import { joinHorde } from './horde';
import { GEAR_SLOTS, removeFromHouse } from './care';
import { addInjury, rollInjury } from './training';

export interface LoyaltyBreakdown { total: number; parts: { label: string; amount: number }[] }

/** Dynasty heritage × species (GM heritage × origin table, mapped onto species). AI houses count as Roman. */
export const HERITAGE_SPECIES: Record<Heritage, Partial<Record<SpeciesId, number>>> = {
  roman: { iguanodon: 1, triceratops: -1, troodon: -1 },
  greek: { ankylosaurus: 1, stegosaurus: 1, brachiosaurus: 1, tyrannosaurus: -1, velociraptor: -1 },
  punic: { troodon: 2, iguanodon: -1, dilophosaurus: -1 },
  celtic: { triceratops: 1, tyrannosaurus: 1, velociraptor: 1, iguanodon: -2, ankylosaurus: -1 },
  egyptian: { spinosaurus: 1 },
};

/** Species basic tameness drift (Iguanodon = Roman +1, Triceratops = Gaul −1). */
export const SPECIES_TAMENESS: Partial<Record<SpeciesId, number>> = { iguanodon: 1, triceratops: -1 };

/** GM legendary fighters (−1/week unless a specific pairing applies); keys as in data/arenaData LEGENDS. */
const LEGENDS = new Set([
  'spartacus', 'crixus', 'gannicus', 'oenomaus', 'gigantus', 'theokoles', 'spiculus', 'melankomas', 'hector', 'achilles',
  'neokoros', 'agiad', 'maximus', 'hannibalbarca', 'barca', 'hermes', 'gwyn', 'mars',
]);

export function entertainmentTameness(E: number, tavern: boolean): number {
  let v: number;
  if (E <= 0) v = -2;
  else if (E < 5) v = E - 1;
  else if (E < 20) v = Math.trunc(E / 2) + 2;
  else v = Math.trunc(E / 3) + 6;
  return v + (tavern ? 3 : 0);
}

export function wardenTameness(S: number): number {
  if (S > 50) return Math.trunc(S / 15) + 2;
  if (S > 10) return Math.trunc(S / 10) + 1;
  return Math.trunc(Math.max(0, S) / 5);
}

function legendTerm(h: Ludus, c: Creature): number {
  const has = (k: string) => h.creatures.some((x) => x !== c && x.legend === k);
  if (c.legend === 'spartacus') {
    let v = 0;
    if (has('crixus')) v -= 5;
    if (has('oenomaus')) v -= 3;
    if (has('gannicus')) v -= 2;
    return v || -1;
  }
  if (c.legend === 'crixus') return has('spartacus') ? -6 : -1;
  return c.legend && LEGENDS.has(c.legend) ? -1 : 0;
}

function ascensionTerm(state: GameState): number {
  const w = state.world.week;
  const venus = w <= 30 ? 1 : w <= 80 ? 2 : 3;
  let v = 0;
  if (asc(state, ASC.venus)) v -= venus;
  if (asc(state, ASC.juno)) v -= 1;
  if (asc(state, ASC.apollo)) v -= venus;
  if (asc(state, ASC.tartarus)) v -= w > 80 ? 2 : 1;
  return v;
}

function tamenessSubjects(h: Ludus): Creature[] {
  return h.creatures.filter((c) => c.kind === 'dino');
}

/** Average tameness of the house's Inspiring dinos (null without any). */
export function inspiringAverage(h: Ludus): number | null {
  const insp = tamenessSubjects(h).filter((c) => c.traits.includes('Inspiring'));
  if (!insp.length) return null;
  return Math.trunc(insp.reduce((s, c) => s + c.loyalty, 0) / insp.length);
}

/** GM weekly loyalty change (+ imprint bonus: ≥50% +1, 100% +2; Iguanodon +1). */
export function loyaltyChange(state: GameState, h: Ludus, c: Creature): LoyaltyBreakdown {
  const parts: { label: string; amount: number }[] = [];
  if (c.kind !== 'dino') return { total: 0, parts };
  const player = isPlayerHouse(state, h);
  const heritage: Heritage = player ? state.player.heritage : 'roman';
  const add = (label: string, amount: number) => { if (amount) parts.push({ label, amount }); };
  add('Showmen', entertainmentTameness(entertainment(h), (h.buildings.tavern ?? 0) >= 1));
  add('Wardens', wardenTameness(h.keepers.wardens));
  add('Influence', influenceLoyaltyEffect(state, h));
  add('Experience', (c.level === 1 ? 1 : 0) + 1 - c.level);
  add('Traits', traitLoyaltyDrift(c));
  add('Species', SPECIES_TAMENESS[c.species] ?? 0);
  add('Heritage', HERITAGE_SPECIES[heritage][c.species] ?? 0);
  add('Legend', legendTerm(h, c));
  if (player) {
    add('Harness', c.happiness);
    add('Ascension', ascensionTerm(state));
  }
  add('Imprint', c.genes.imprint >= 0.999 ? 2 : c.genes.imprint >= 0.5 ? 1 : 0);
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  if (c.away && sum) add('Away (halved)', Math.trunc(sum / 2) - sum);
  const X = inspiringAverage(h);
  if (X !== null) add('Inspiring pack', Math.trunc((X - c.loyalty) / 4));
  if (h.unpaidThisWeek) add('Unpaid wages', -10);
  return { total: parts.reduce((s, p) => s + p.amount, 0), parts };
}

/** Apply weekly change to every creature; returns rebels that failed the stay check (rand(40)+10 ≤ loyalty). */
export function loyaltyWeek(state: GameState, h: Ludus): Creature[] {
  const subjects = tamenessSubjects(h);
  const deltas = new Map<Creature, number>();
  for (const c of subjects) deltas.set(c, loyaltyChange(state, h, c).total);
  // GM: the weekly change and the stay check come first; unpaid wages (−10, part of the breakdown) bite after
  const unpaid = h.unpaidThisWeek ? -10 : 0;
  for (const c of subjects) c.loyalty = clamp(c.loyalty + (deltas.get(c) ?? 0) - unpaid, 0, 100);
  const rebels: Creature[] = [];
  const checked = !(h.ai && !h.ai.visible) && !state.world.difficulty.betrayalsDisabled;
  if (checked) {
    for (const c of subjects) {
      if (c.away || c.maturity < 0.5) continue;
      if (c.rebellionGrace) {
        c.rebellionGrace = false;
        continue;
      }
      if (rand(40) + 10 <= c.loyalty) continue;
      if (c.injury && c.loyalty >= 15) continue;
      rebels.push(c);
    }
  }
  if (unpaid) for (const c of subjects) c.loyalty = clamp(c.loyalty + unpaid, 0, 100);
  // Spartacus exception: he murders a keeper instead of running alone
  if (rebels.length === 1 && rebels[0].legend === 'spartacus') {
    const s = rebels[0];
    const others = subjects.filter((x) => x !== s);
    if (subjects.length > 2 && others.some((o) => (deltas.get(o) ?? 0) < -1 && o.loyalty < 60)) {
      s.loyalty = Math.max(0, s.loyalty - 10);
      addInfluence(state, h, -1);
      loseKeepers(state, h, 1, 'wardens');
      if (isPlayerHouse(state, h)) report(state, 'bad', `${s.name} murdered a warden in the night and stayed, smiling.`);
      return [];
    }
  }
  return rebels;
}

function physical(c: Creature): number {
  return getStat(c, 'agi') + getStat(c, 'str') + Math.trunc(maxHp(c) / 5);
}

function escapeEffects(state: GameState, h: Ludus, c: Creature): void {
  addTrait(c, 'Escaped');
  c.fame += 5;
  c.loyalty = Math.max(0, c.loyalty - 50);
  grantXp(c, 100);
  addInfluence(state, h, -5);
  joinHorde(state, c, h);
  removeFromHouse(state, h, c);
}

function failureEffects(c: Creature): void {
  c.loyalty = Math.min(100, c.loyalty + 10);
  c.fame = Math.max(0, c.fame - 5);
  const inj = rollInjury(injuryProne(c) + 4, false);
  if (inj && inj !== 'dead') addInjury(c, inj);
}

const list = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Resolve solo/coordinated breakout or uprising (GM Betrayal). May destroy the house ('uprising'). Escaped creatures join the Horde. */
export function resolveBreakouts(state: GameState, h: Ludus, rebels: Creature[]): ResultCard | null {
  rebels = rebels.filter((c) => h.creatures.includes(c));
  if (!rebels.length || h.defeated) return null;
  const player = isPlayerHouse(state, h);
  const D = betrayalDR(securityTotal(state, h));
  const K = keeperCount(h);
  const unhappy = h.unpaidThisWeek ? K : Math.trunc(K / 10);
  const n = rebels.length;
  const spartacus = rebels.find((c) => c.legend === 'spartacus');
  let bonus = spartacus ? physical(spartacus) : 0;
  if (n === 1 && player) {
    const tries = state.player.counters.soloEscapes ?? 0;
    bonus += tries === 0 ? -10 : state.world.difficulty.hard ? 0 : -3;
    state.player.counters.soloEscapes = tries + 1;
  }
  const cunning = (group: Creature[]): boolean => {
    const c = group.reduce((a, b) => (getStat(b, 'cun') > getStat(a, 'cun') ? b : a));
    return 4 * D + 5 < getStat(c, 'cun') + bonus + c.level + rand(15) + unhappy;
  };
  const brute = (group: Creature[]): boolean =>
    group.reduce((s, c) => s + physical(c), 0) + bonus + unhappy + 10 * group.length > 10 * D + rand(15);
  const casualties = (div: number, min: number, max: number): number => clamp(Math.trunc(rand(D) / div), min, max);

  let escaped: Creature[] = [];
  let failed: Creature[] = [];
  let killed = 0;
  let outcome: string;
  let text: string;
  const names = rebels.map((c) => c.name);
  if (n === 1) {
    const c = rebels[0];
    if (cunning(rebels)) {
      escaped = rebels;
      outcome = 'Escaped';
      text = `${c.name} picked the lock of its pen and slipped away into the night. Nobody noticed until breakfast.`;
    } else if (brute(rebels)) {
      escaped = rebels;
      killed = casualties(3, 0, 2);
      outcome = 'Escaped';
      text = `${c.name} smashed through the gate and ran for the hills${killed ? `, trampling ${killed} warden${killed > 1 ? 's' : ''} on the way` : ''}.`;
    } else {
      failed = rebels;
      killed = casualties(5, 0, 1);
      outcome = 'Caught';
      text = `${c.name} tried to break out, but the wardens netted it${killed ? ' (one of them will not be netting anything again)' : ''}. It seems calmer now.`;
    }
  } else if (n <= 3) {
    if (cunning(rebels)) {
      escaped = rebels;
      outcome = 'Escaped';
      text = `${list(names)} worked the latch together and vanished without a sound. Clever animals. Too clever.`;
    } else if (brute(rebels)) {
      escaped = rebels;
      killed = casualties(2, 1, 5);
      outcome = 'Escaped';
      text = `${list(names)} stormed the gate together. ${killed} warden${killed > 1 ? 's' : ''} died; the dinos are gone.`;
    } else {
      failed = rebels;
      killed = casualties(4, 0, 2);
      outcome = 'Caught';
      text = `${list(names)} tried a coordinated breakout and were beaten back into their pens${killed ? `, at the cost of ${killed} warden${killed > 1 ? 's' : ''}` : ''}.`;
    }
  } else {
    const c1 = cunning(rebels);
    const b1 = brute(rebels);
    if (c1 && b1) {
      h.defeated = 'uprising';
      escaped = [...h.creatures];
      outcome = 'Ludus destroyed';
      text = `${list(names)} led an uprising. The pens burned, the wardens were eaten and every creature in the ludus ran off to join the Wild Horde.`;
    } else {
      const half = [...rebels].sort((a, b) => physical(b) - physical(a)).slice(0, Math.max(1, Math.trunc(n / 2)));
      const b2 = brute(half);
      if (!b1 && !b2) {
        failed = rebels;
        killed = casualties(3, 0, 4);
        outcome = 'Crushed';
        text = `The uprising of ${list(names)} was crushed${killed ? `; ${killed} warden${killed > 1 ? 's' : ''} died holding the gate` : ''}.`;
      } else if (b1 && b2) {
        escaped = rebels;
        killed = casualties(2, 2, 10);
        outcome = 'Escaped';
        text = `${list(names)} broke out in a bloody rush. ${killed} wardens died. The rest of the ludus watched and took notes.`;
      } else {
        const sh = shuffle([...rebels]);
        const k = Math.max(0, rand(n) - 1);
        escaped = sh.slice(0, k);
        failed = sh.slice(k);
        killed = casualties(2, 2, 6);
        outcome = 'Partial';
        text = escaped.length
          ? `The uprising half-worked: ${list(escaped.map((c) => c.name))} got away, ${list(failed.map((c) => c.name))} did not. ${killed} wardens died.`
          : `The uprising fell apart at the gate. Nobody got out, but ${killed} wardens died.`;
      }
    }
  }
  if (killed > 0) loseKeepers(state, h, killed, 'wardens');
  // escapees join the Horde (joinHorde adds Spartacus' extra ferals and takes 2 keepers when he is among them)
  for (const c of escaped) escapeEffects(state, h, c);
  for (const c of failed) failureEffects(c);
  if (!player) return null;
  report(state, escaped.length ? 'bad' : 'warning', text);
  return { kind: 'escape', text, names, outcome };
}

/** Reward ("gift"): 50×(level/2+1) denarii, +40 tameness, grace, 10-week cooldown. */
export function rewardCreature(state: GameState, h: Ludus, c: Creature): string | null {
  if (!h.creatures.includes(c)) return 'That creature is not in this ludus.';
  if (c.kind !== 'dino') return 'Beasts prefer treats.';
  if (c.rewardCooldown > 0) return `${c.name} was spoiled recently. Try again in ${c.rewardCooldown} week${c.rewardCooldown > 1 ? 's' : ''}.`;
  if (c.loyalty >= 100) return `${c.name} is as tame as a dino gets.`;
  const cost = 50 * (Math.trunc(c.level / 2) + 1);
  if (h.denarii < cost) return `A worthy gift costs ${cost} denarii.`;
  h.denarii -= cost;
  c.loyalty = Math.min(100, c.loyalty + 40);
  c.rebellionGrace = true;
  c.rewardCooldown = 10;
  return null;
}

/** Total worth of the gear assigned to a creature. */
export function assignedGearWorth(h: Ludus, c: Creature): number {
  let w = 0;
  for (const s of GEAR_SLOTS) {
    const id = c.gear[s];
    const g = id ? h.armory.find((x) => x.id === id) : undefined;
    if (g) w += gearWorth(g);
  }
  return w;
}

/** Gear happiness drift (GM 9.6). */
export function gearHappinessWeek(state: GameState, h: Ludus, c: Creature): void {
  if (c.kind !== 'dino') return;
  const worth = assignedGearWorth(h, c);
  const last = c.lastGearWorth ?? 0;
  if (worth !== last) {
    const pct = clamp(last > 0 ? ((worth - last) / last) * 100 : 100, -100, 100);
    const damp = Math.min(1, Math.max(worth, last) / 500);
    c.happiness += clamp(Math.trunc((pct * damp) / 10), -9, 9);
  }
  const target = c.fame >= 30 && worth <= 999 ? -2 : c.fame >= 10 && worth <= 9999 ? -1 : 0;
  if (c.happiness > target) c.happiness--;
  else if (c.happiness < target) c.happiness++;
  c.happiness = clamp(c.happiness, -10, 10);
  c.lastGearWorth = worth;
}
