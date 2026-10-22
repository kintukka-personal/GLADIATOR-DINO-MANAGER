// Forge, reforge, repair, workshop. OWNER: world-economy agent. GM 02 §7.
//
// Forge level 1/2/3 sets the catalogue quality (Regular / Quality / Master-crafted). Forging is an instant
// purchase at worth × 0.80/0.75/0.65 (×2 for items and augmented templates); the rand(10) outcome can come
// out worse or better, and Forge 3 adds rand(5) with a chance of a Precision/Reinforced/Fortified augment.
import type { Augment, GameState, Gear, GearTypeId, ID, Quality, UpgradeId } from './types';
import { GEAR, GEAR_TYPES, gearHas, gearName, gearWorth, makeGear } from './data/gear';
import { rand } from './rng';
import { achieve, hasUpgrade, newId } from './util';
import { buildingTotals } from './buildings';

export interface ForgeOption { type: GearTypeId; quality: Quality; cost: number; locked: boolean; reason?: string }

/** Items the Workshop crafts at Regular quality. */
export const WORKSHOP_ITEMS: GearTypeId[] = ['poultice', 'antivenom', 'neptuneCharm', 'eagleEyeCharm', 'silphium'];

/** Special recipes (GM: Master-crafted Greaves at Blacksmith 3 with Spartan Dynasty; MC Bottled Lightning with the Workshop). */
const SPECIAL: { type: GearTypeId; quality: Quality; forge?: number; workshop?: boolean; upgrade: UpgradeId }[] = [
  { type: 'legPlates', quality: 4, forge: 3, upgrade: 'spartanDynasty' },
  { type: 'bottledLightning', quality: 4, workshop: true, upgrade: 'thunderStrike' },
  { type: 'mutagen', quality: 2, workshop: true, upgrade: 'mutagenLab' },
];

const forgeMult = (level: number): number => (level <= 0 ? 0.8 : level === 1 ? 0.75 : 0.65);
const reforgeMult = (level: number): number => (level <= 0 ? 1 : level === 1 ? 0.95 : 0.9);
const repairMult = (level: number): number => (level <= 0 ? 0.5 : level === 1 ? 0.45 : 0.4);

/** Catalogue quality for a forge level. */
export function forgeTierQuality(level: number): Quality {
  return level >= 3 ? 4 : level === 2 ? 3 : 2;
}

function forgeLevel(state: GameState): number {
  return buildingTotals(state.player.ludus).forgeTier;
}

function hasWorkshop(state: GameState): boolean {
  return (state.player.ludus.buildings.workshop ?? 0) >= 1;
}

function gearLocked(state: GameState, g: Gear): boolean {
  if (g.unique) return false;
  const up = GEAR[g.type].upgrade;
  return !!up && !hasUpgrade(state, up);
}

/** GM forge cost: worth × (0.80/0.75/0.65), min 10, ×2 for items and augmented templates; Fang Caps ≥ 150 at Forge 3. */
export function forgeCost(type: GearTypeId, quality: Quality, level: number, augment?: Augment): number {
  const tmpl = makeGear(type, quality, 'template', augment ? { augment } : {});
  let cost = Math.max(10, Math.floor(gearWorth(tmpl) * forgeMult(level)));
  if (augment) cost *= 2;
  if (GEAR[type].slot === 'item') cost *= 2;
  if (level >= 3 && type === 'fangCaps') cost = Math.max(150, cost);
  return cost;
}

export function forgeCatalog(state: GameState): ForgeOption[] {
  const L = forgeLevel(state);
  const ws = hasWorkshop(state);
  const out: ForgeOption[] = [];
  const q = forgeTierQuality(L);
  for (const type of GEAR_TYPES) {
    const d = GEAR[type];
    if (d.slot === 'item' || d.slot === 'rider') continue;
    if (d.forge === undefined || d.forge >= 99) continue;
    let reason: string | undefined;
    if (d.upgrade && !hasUpgrade(state, d.upgrade)) reason = 'Locked: needs an Amber upgrade.';
    else if (L < 1) reason = 'Build a Forge first.';
    else if (L < d.forge) reason = `Needs Forge level ${d.forge}.`;
    else if (d.workshop && !ws) reason = 'Needs a Workshop.';
    out.push({ type, quality: q, cost: forgeCost(type, q, L), locked: !!reason, reason });
  }
  for (const type of WORKSHOP_ITEMS) {
    const reason = ws ? undefined : 'Needs a Workshop.';
    out.push({ type, quality: 2, cost: forgeCost(type, 2, L), locked: !!reason, reason });
  }
  for (const s of SPECIAL) {
    let reason: string | undefined;
    if (!hasUpgrade(state, s.upgrade)) reason = 'Locked: needs an Amber upgrade.';
    else if (s.forge && L < s.forge) reason = `Needs Forge level ${s.forge}.`;
    else if (s.workshop && !ws) reason = 'Needs a Workshop.';
    out.push({ type: s.type, quality: s.quality, cost: forgeCost(s.type, s.quality, L), locked: !!reason, reason });
  }
  return out;
}

/** Forge new gear (rand(10) outcome; Forge 3 augments). Returns the new gear or an error string. */
export function forgeItem(state: GameState, type: GearTypeId): Gear | string {
  const h = state.player.ludus;
  const opt = forgeCatalog(state).find((o) => o.type === type);
  if (!opt) return 'The smith does not know how to make that.';
  if (opt.locked) return opt.reason ?? 'Locked.';
  if (h.denarii < opt.cost) return `That costs ${opt.cost} denarii.`;
  h.denarii -= opt.cost;
  const d = GEAR[type];
  let quality: Quality = opt.quality;
  let augment: Augment | undefined;
  if (d.slot !== 'item') {
    const L = forgeLevel(state);
    let roll = rand(10);
    let extra = 0;
    if (L >= 3) {
      extra = rand(5);
      roll += extra;
    }
    if (roll < 2) quality = L >= 2 ? 2 : 0;
    else if (roll > 8) quality = L >= 2 ? 4 : 3;
    else quality = forgeTierQuality(L);
    if (L >= 3 && extra >= 3) {
      if (d.slot === 'weapon') augment = 'Precision';
      else if (d.slot === 'armor' || d.slot === 'helmet' || (d.slot === 'offhand' && d.isShield)) augment = roll > 7 ? 'Fortified' : 'Reinforced';
    }
  }
  const g = makeGear(type, quality, newId('g'), augment ? { augment } : {});
  h.armory.push(g);
  const counters = state.player.counters;
  if (!counters.forged) achieve(state, 'apprentice');
  counters.forged = (counters.forged ?? 0) + 1;
  return g;
}

function isBroken(g: Gear): boolean {
  return g.augment === 'Broken' || g.augment === 'BrokenTimeWarp';
}

export function reforgeCost(state: GameState, g: Gear): number | null {
  const L = forgeLevel(state);
  if (L < 1) return null;
  const d = GEAR[g.type];
  if (d.slot === 'item' || d.noReforge || gearHas(g, 'NoReforge')) return null;
  if (gearLocked(state, g) || isBroken(g) || g.quality >= 5) return null;
  if (d.isNet && g.quality >= 4) return null;
  const mcAugment = g.quality === 4 && !g.augment && g.unique !== 'swordOfMars';
  if (!(g.quality < forgeTierQuality(L) || mcAugment)) return null;
  if (mcAugment && d.slot === 'rider' && !hasUpgrade(state, 'cataphracts')) return null;
  return Math.max(10, Math.floor(gearWorth(g) * reforgeMult(L)));
}

/** Reforge: rand(10)+forge level ≥ quality+1 → up one tier (or augment at MC). Money spent either way. */
export function reforge(state: GameState, id: ID): { ok: boolean; text: string } {
  const h = state.player.ludus;
  const g = h.armory.find((x) => x.id === id);
  if (!g) return { ok: false, text: 'That piece is not in your armory.' };
  const cost = reforgeCost(state, g);
  if (cost === null) return { ok: false, text: `${gearName(g)} cannot be reforged here.` };
  if (h.denarii < cost) return { ok: false, text: `Reforging costs ${cost} denarii.` };
  h.denarii -= cost;
  const L = forgeLevel(state);
  const before = gearName(g);
  const r = rand(10) + L;
  if (r < g.quality + 1) return { ok: false, text: `The smith botched the ${before}. It is unchanged; the ${cost} denarii are not.` };
  const d = GEAR[g.type];
  if (g.quality === 4) {
    if (d.slot === 'weapon') g.augment = 'Precision';
    else if (d.slot === 'rider') g.augment = 'Barded';
    else g.augment = r > 7 && L >= 3 ? 'Fortified' : 'Reinforced';
  } else {
    const step = r > 10 && g.quality + 2 < 4 ? 2 : 1;
    g.quality = Math.min(5, g.quality + step) as Quality;
  }
  return { ok: true, text: `The ${before} came out of the fire as ${gearName(g)}.` };
}

export function repairCost(state: GameState, g: Gear): number | null {
  if (!isBroken(g)) return null;
  const whole: Gear = { ...g, augment: g.augment === 'BrokenTimeWarp' ? 'TimeWarped' : undefined };
  return Math.max(10, Math.floor(gearWorth(whole) * repairMult(forgeLevel(state))));
}

export function repair(state: GameState, id: ID): { ok: boolean; text: string } {
  const h = state.player.ludus;
  const g = h.armory.find((x) => x.id === id);
  if (!g) return { ok: false, text: 'That piece is not in your armory.' };
  const cost = repairCost(state, g);
  if (cost === null) return { ok: false, text: `${gearName(g)} is not broken.` };
  if (h.denarii < cost) return { ok: false, text: `Repairs cost ${cost} denarii.` };
  h.denarii -= cost;
  const r = rand(10) + forgeLevel(state) + 2;
  if (r < g.quality + 1) return { ok: false, text: `The smith could not save the ${gearName(g)}. The ${cost} denarii are gone.` };
  g.augment = g.augment === 'BrokenTimeWarp' ? 'TimeWarped' : undefined;
  return { ok: true, text: `${gearName(g)} is whole again.` };
}
