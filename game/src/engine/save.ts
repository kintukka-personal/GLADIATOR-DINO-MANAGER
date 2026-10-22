// Save/load: JSON in localStorage (slots + account meta), with export/import strings. OWNER: integration.

import type { GameState, Meta } from './types';
import { setSeed, getSeed } from './rng';
import { setIdCounter, getIdCounter } from './util';
import { SAVE_VERSION, emptyMeta } from './newgame';

const META_KEY = 'jurassic-ludus.meta';
const SLOT_KEY = (slot: number) => `jurassic-ludus.slot.${slot}`;
export const SLOTS = 5;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = '__jl_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

/** Bind a loaded state to the engine globals (RNG + id counter). */
export function bindState(state: GameState): void {
  setSeed(state.world.rng || 1);
  setIdCounter(state.nextId || 1);
}

/** Copy engine globals back into the state before serializing. */
export function captureGlobals(state: GameState): void {
  state.world.rng = getSeed();
  state.nextId = getIdCounter();
}

export function serialize(state: GameState): string {
  captureGlobals(state);
  state.savedAt = Date.now();
  return JSON.stringify(state);
}

export function migrate(raw: any): GameState {
  const s = raw as GameState;
  if (!s.version) s.version = 1;
  s.pendingAchievements ??= [];
  s.results ??= [];
  s.report ??= [];
  s.ancestry ??= {};
  s.runStats ??= { battles: 0, wins: 0, deaths: 0, hatched: 0, mutations: 0, maxGeneration: 0, peakInfluence: 0 };
  s.version = SAVE_VERSION;
  return s;
}

export function deserialize(json: string): GameState {
  const s = migrate(JSON.parse(json));
  bindState(s);
  return s;
}

export function saveGame(state: GameState): boolean {
  const st = storage();
  if (!st) return false;
  try {
    st.setItem(SLOT_KEY(state.slot), serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot: number): GameState | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(SLOT_KEY(slot));
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function deleteGame(slot: number): void {
  try {
    storage()?.removeItem(SLOT_KEY(slot));
  } catch {
    /* ignore */
  }
}

export interface SlotSummary { slot: number; lanista: string; ludus: string; week: number; denarii: number; influence: number; ascension: number; mode: string; over: boolean; savedAt: number }

export function slotSummaries(): (SlotSummary | null)[] {
  const out: (SlotSummary | null)[] = [];
  const st = storage();
  for (let i = 1; i <= SLOTS; i++) {
    try {
      const raw = st?.getItem(SLOT_KEY(i));
      if (!raw) { out.push(null); continue; }
      const s = JSON.parse(raw) as GameState;
      const d = s.world.difficulty;
      out.push({
        slot: i, lanista: s.player.lanista, ludus: s.player.ludus.name, week: s.world.week, denarii: s.player.ludus.denarii,
        influence: s.player.ludus.influence, ascension: s.world.ascension,
        mode: d.sandbox ? 'Sandbox' : d.nightmare ? 'Nightmare' : d.hard ? 'Hard' : 'Normal', over: !!s.over, savedAt: s.savedAt,
      });
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function loadMeta(): Meta {
  const st = storage();
  try {
    const raw = st?.getItem(META_KEY);
    if (!raw) return emptyMeta();
    return { ...emptyMeta(), ...(JSON.parse(raw) as Meta) };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta: Meta): void {
  try {
    storage()?.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** Portable save string (base64 of the JSON) for copy/paste export. */
export function exportString(state: GameState): string {
  const json = serialize(state);
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
  return Buffer.from(json, 'utf8').toString('base64');
}

export function importString(s: string): GameState {
  const trimmed = s.trim();
  const json = trimmed.startsWith('{') ? trimmed
    : typeof atob === 'function' ? decodeURIComponent(escape(atob(trimmed))) : Buffer.from(trimmed, 'base64').toString('utf8');
  return deserialize(json);
}
