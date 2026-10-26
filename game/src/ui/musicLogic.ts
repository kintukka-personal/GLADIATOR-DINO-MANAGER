// Pure music logic for the generative score: no WebAudio and no React here, so it runs in vitest and in the
// offline render. It holds the modes, a seeded RNG, the motif grammar (motif → variations → call-and-answer
// phrases → cadences), the per-mood arrangements that write the score one bar at a time, the one-shot
// stings, and the screen → mood map. music.ts plays what this writes; tests/music.test.ts checks it.
import type { ScreenName } from './store';

// ---------------------------------------------------------------------------------------------
// Moods, modes, pitch
// ---------------------------------------------------------------------------------------------

export type Mood = 'title' | 'ludus' | 'nursery' | 'arena' | 'battle' | 'night' | 'lament';
export const MOODS: readonly Mood[] = ['title', 'ludus', 'nursery', 'arena', 'battle', 'night', 'lament'];

export type ModeName = 'hijaz' | 'dorian' | 'aeolian' | 'phrygian' | 'majorPenta';

/** Semitones above the tonic. Hijaz = Phrygian dominant. */
export const MODES: Record<ModeName, readonly number[]> = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  majorPenta: [0, 2, 4, 7, 9],
};

/** MIDI note of a scale degree (0 = tonic; negative degrees and degrees past the octave wrap). */
export function degreeToMidi(root: number, mode: ModeName, degree: number): number {
  const sc = MODES[mode];
  const n = sc.length;
  const oct = Math.floor(degree / n);
  return root + oct * 12 + sc[degree - oct * n];
}

export function inMode(midi: number, root: number, mode: ModeName): boolean {
  return MODES[mode].includes((((midi - root) % 12) + 12) % 12);
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ---------------------------------------------------------------------------------------------
// Seeded RNG (mulberry32)
// ---------------------------------------------------------------------------------------------

export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(xs: readonly (readonly [T, number])[]): T;
  /** triangular noise in [-amt, amt] (for humanised timing and velocity) */
  jitter(amt: number): number;
}

export function makeRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: (xs) => {
      const total = xs.reduce((n, [, w]) => n + w, 0);
      let r = next() * total;
      for (const [x, w] of xs) {
        r -= w;
        if (r <= 0) return x;
      }
      return xs[xs.length - 1][0];
    },
    jitter: (amt) => (next() + next() - 1) * amt,
  };
}

// ---------------------------------------------------------------------------------------------
// Score events (times in seconds from the start of their bar)
// ---------------------------------------------------------------------------------------------

export type PitchedVoice = 'lyre' | 'drone' | 'pad';
export type HitVoice = 'dum' | 'tek' | 'tymp' | 'low' | 'zill';
export interface NoteEvent { voice: PitchedVoice; t: number; dur: number; midi: number; vel: number }
export interface LineNote { t: number; dur: number; midi: number; vel: number }
/** A legato aulos phrase: one breath, the notes timed from the line's start. */
export interface LineEvent { voice: 'aulos'; t: number; notes: LineNote[] }
export interface HitEvent { voice: HitVoice; t: number; vel: number; midi?: number }
export interface GrowlEvent { voice: 'growl'; t: number; dur: number; vel: number }
export type MusicEvent = NoteEvent | LineEvent | HitEvent | GrowlEvent;
export type Voice = MusicEvent['voice'];
export interface Bar { dur: number; beats: number; bpm: number; events: MusicEvent[] }

// ---------------------------------------------------------------------------------------------
// The motif grammar
// ---------------------------------------------------------------------------------------------

export type Feel = 'stately' | 'dance' | 'fast' | 'slow';
/** A motif note: scale-degree offset from the motif's anchor, length in beats. */
export interface MotifNote { d: number; len: number }
export type Motif = MotifNote[];

/** Rhythm cells per feel; every cell lasts 2 beats, a motif is two cells (one 4/4 bar). */
const CELLS: Record<Feel, readonly (readonly number[])[]> = {
  stately: [[2], [1, 1], [1.5, 0.5], [1, 0.5, 0.5], [0.5, 0.5, 1]],
  dance: [[1, 1], [0.5, 0.5, 1], [1, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [1.5, 0.5], [0.75, 0.25, 1]],
  fast: [[0.5, 0.5, 1], [0.25, 0.25, 0.5, 1], [0.5, 0.25, 0.25, 1], [0.5, 0.5, 0.5, 0.5], [1, 0.5, 0.5], [0.25, 0.25, 0.25, 0.25, 1]],
  slow: [[2], [1.5, 0.5], [1, 1], [2], [0.5, 0.5, 1]],
};

type Shape = 'arch' | 'fall' | 'rise' | 'turn' | 'leapfall' | 'hover';
const SHAPES: readonly (readonly [Shape, number])[] = [['arch', 3], ['fall', 3], ['rise', 1.5], ['turn', 1], ['leapfall', 2], ['hover', 1.5]];

function contour(rng: Rng, n: number, shape: Shape): number[] {
  const out = [0];
  let d = 0;
  let dir = shape === 'fall' ? -1 : shape === 'hover' ? (rng.chance(0.5) ? 1 : -1) : 1;
  let leapt = false;
  for (let i = 1; i < n; i++) {
    if (shape === 'turn') {
      d = [1, 0, -1, 0][(i - 1) % 4];
      out.push(d);
      continue;
    }
    if (shape === 'leapfall' && i === 1) {
      d = 3; // up a fourth, then step back down: the classic opening gesture of a maqam phrase
      dir = -1;
      out.push(d);
      continue;
    }
    if (shape === 'arch' && i >= Math.ceil(n / 2)) dir = -1;
    let step: number;
    if (leapt) {
      step = 1; // a leap is recovered by a step the other way
      leapt = false;
      if (shape !== 'arch') dir = -dir;
    } else if (rng.chance(0.14)) step = 0;
    else if (rng.chance(0.2)) {
      step = rng.pick([2, 2, 3]);
      leapt = true;
    } else step = 1;
    if (shape === 'hover' && Math.abs(d + dir * step) > 2) dir = -dir;
    d += dir * step;
    out.push(d);
  }
  return out;
}

function cellsOf(rng: Rng, feel: Feel): number[] {
  return [...rng.pick(CELLS[feel]), ...rng.pick(CELLS[feel])];
}

/** A fresh one-bar motif: two rhythm cells over a melodic contour. */
export function makeMotif(rng: Rng, feel: Feel): Motif {
  const rhythm = cellsOf(rng, feel);
  const degs = contour(rng, rhythm.length, rng.weighted(SHAPES));
  return rhythm.map((len, i) => ({ d: degs[i], len }));
}

export type VariationOp = 'repeat' | 'sequence' | 'invert' | 'retro' | 'ornament' | 'rhythm' | 'tail';

function splitAt(m: Motif, beats: number): [Motif, Motif] {
  const a: Motif = [];
  const b: Motif = [];
  let t = 0;
  for (const x of m) {
    (t < beats - 1e-6 ? a : b).push({ ...x });
    t += x.len;
  }
  return [a, b];
}

function ornamentMotif(rng: Rng, m: Motif): Motif {
  const long = m.map((x, i) => [i, x.len] as const).filter(([, l]) => l >= 1);
  if (!long.length) return m.map((x) => ({ ...x }));
  const [i] = rng.pick(long);
  const x = m[i];
  const up = rng.chance(0.7) ? 1 : -1;
  // a mordent (main, neighbour, main) or an appoggiatura (neighbour leaning into the main note)
  const orn: Motif = rng.chance(0.6)
    ? [{ d: x.d, len: x.len * 0.5 }, { d: x.d + up, len: x.len * 0.25 }, { d: x.d, len: x.len * 0.25 }]
    : [{ d: x.d + up, len: x.len * 0.25 }, { d: x.d, len: x.len * 0.75 }];
  return [...m.slice(0, i).map((y) => ({ ...y })), ...orn, ...m.slice(i + 1).map((y) => ({ ...y }))];
}

/** One variation of a motif (same total length). */
export function vary(rng: Rng, m: Motif, feel: Feel, op?: VariationOp, ornament = 0.3): Motif {
  const o = op ?? rng.weighted<VariationOp>([['repeat', 2], ['sequence', 2], ['invert', 1], ['retro', 0.8], ['ornament', 4 * ornament], ['rhythm', 1], ['tail', 1.2]]);
  switch (o) {
    case 'repeat':
      return m.map((x) => ({ ...x }));
    case 'sequence': {
      const k = rng.pick([-2, -1, 1, 2]);
      return m.map((x) => ({ d: x.d + k, len: x.len }));
    }
    case 'invert': {
      const d0 = m[0].d;
      return m.map((x) => ({ d: d0 - (x.d - d0), len: x.len }));
    }
    case 'retro': {
      const ds = m.map((x) => x.d).reverse();
      return m.map((x, i) => ({ d: ds[i], len: x.len }));
    }
    case 'ornament':
      return ornamentMotif(rng, m);
    case 'rhythm': {
      const r = cellsOf(rng, feel);
      return r.map((len, i) => ({ d: m[Math.min(m.length - 1, Math.floor((i * m.length) / r.length))].d, len }));
    }
    case 'tail': {
      const [head] = splitAt(m, 2);
      const [, fresh] = splitAt(makeMotif(rng, feel), 2);
      const from = head[head.length - 1]?.d ?? 0;
      const shift = from + (rng.chance(0.5) ? 1 : -1) - (fresh[0]?.d ?? 0);
      return [...head, ...fresh.map((x) => ({ d: x.d + shift, len: x.len }))];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Phrases: call and answer, cadences
// ---------------------------------------------------------------------------------------------

export type Role = 'call' | 'answer' | 'close';
/** A phrase note: start and length in beats from the phrase start, absolute scale degree of the lead register. */
export interface PhraseNote { t: number; len: number; deg: number }
export interface PhraseOpts { mode: ModeName; feel: Feel; phraseBars: 1 | 2; ornament: number; range: readonly [number, number] }

/** Final formulas (degrees, ending on the tonic): the Hijaz tetrachord falls 4–3–♭2–1. */
const CADENCES: Record<ModeName, readonly (readonly number[])[]> = {
  hijaz: [[3, 2, 1, 0], [2, 1, 0], [4, 3, 2, 1, 0], [1, 2, 1, 0]],
  dorian: [[2, 1, 0], [-1, 0], [3, 2, 1, 0], [1, -1, 0]],
  aeolian: [[2, 1, 0], [4, 3, 2, 1, 0], [-1, 0], [1, 0]],
  phrygian: [[1, 0], [2, 1, 0], [3, 2, 1, 0], [-1, 1, 0]],
  majorPenta: [[1, 0], [2, 1, 0], [-1, 0]],
};
/** Half cadences: the answer stops on the fifth and leaves the door open. */
const HALF: readonly (readonly number[])[] = [[5, 4], [2, 3, 4], [3, 4], [6, 5, 4]];
const CAD_LENS: Record<number, readonly number[]> = { 2: [1, 3], 3: [1, 1, 2], 4: [0.5, 0.5, 1, 2], 5: [0.5, 0.5, 0.5, 0.5, 2] };

/** Shift (in degrees) that keeps a line inside the register; prefers no shift. */
function fitShift(degs: number[], lo: number, hi: number, n: number): number {
  let best = 0;
  let cost = Infinity;
  for (const s of [0, -1, 1, -2, 2, -3, 3, -n, n]) {
    let c = Math.abs(s) * 0.01;
    for (const d of degs) c += Math.max(0, lo - (d + s)) + Math.max(0, d + s - hi);
    if (c < cost - 1e-9) {
      cost = c;
      best = s;
    }
  }
  return best;
}

function openTarget(rng: Rng, prev: number, n: number, lo: number, hi: number): number {
  const opts: [number, number][] = [];
  for (const [d, w] of [[4, 5], [1, 3], [3, 2]] as const) {
    for (const k of [-1, 0, 1]) {
      const c = d + k * n;
      if (c >= lo && c <= hi) opts.push([c, w / Math.pow(1 + Math.abs(c - prev), 2)]);
    }
  }
  return opts.length ? rng.weighted(opts) : prev;
}

function cadence(rng: Rng, mode: ModeName, prev: number, beats: number, full: boolean, lo: number, hi: number): Motif {
  const n = MODES[mode].length;
  const f = full ? rng.pick(CADENCES[mode]) : rng.pick(HALF);
  const end = f[f.length - 1];
  let best = 0;
  let cost = Infinity;
  for (const k of [-2, -1, 0, 1, 2]) {
    const s = k * n;
    const c = Math.abs(f[0] + s - prev) + (end + s < lo || end + s > hi ? 20 : 0) + (f.some((d) => d + s < lo - 1 || d + s > hi + 1) ? 5 : 0);
    if (c < cost) {
      cost = c;
      best = s;
    }
  }
  const lens = CAD_LENS[f.length];
  return f.map((d, i) => ({ d: d + best, len: (lens[i] * beats) / 4 }));
}

/**
 * One lead phrase of `phraseBars` bars. A call states the motif and stops on an open degree (the 2nd, 4th or
 * 5th); an answer varies the motif and closes with a cadence on the tonic (a plain answer sometimes stops on
 * the fifth instead); a close always ends on the tonic. The last note leaves room for a breath.
 */
export function buildPhrase(rng: Rng, o: PhraseOpts, motif: Motif, role: Role, anchor: number): PhraseNote[] {
  const n = MODES[o.mode].length;
  const [lo, hi] = o.range;
  const placed = (m: Motif): Motif => {
    const s = fitShift(m.map((x) => x.d + anchor), lo, hi, n);
    return m.map((x) => ({ d: x.d + anchor + s, len: x.len }));
  };
  const head = (m: Motif, beats: number): Motif => splitAt(m, beats)[0];
  let notes: Motif;
  if (role === 'call') {
    const body = o.phraseBars === 2 ? [...placed(motif), ...head(placed(vary(rng, motif, o.feel, undefined, o.ornament)), 2)] : head(placed(motif), 2);
    notes = [...body, { d: openTarget(rng, body[body.length - 1].d, n, lo, hi), len: 2 }];
  } else {
    const v = placed(vary(rng, motif, o.feel, undefined, o.ornament));
    const body = o.phraseBars === 2 ? v : head(v, 2);
    notes = [...body, ...cadence(rng, o.mode, body[body.length - 1].d, o.phraseBars === 2 ? 4 : 2, role === 'close' || rng.chance(0.7), lo, hi)];
  }
  const last = notes[notes.length - 1];
  last.len = Math.max(0.25, last.len - (o.feel === 'slow' ? 0.5 : 0.25));
  let t = 0;
  return notes.map((x) => {
    const r = { t, len: x.len, deg: x.d };
    t += x.len;
    return r;
  });
}

// ---------------------------------------------------------------------------------------------
// Moods: arrangement specs
// ---------------------------------------------------------------------------------------------

type Lead = 'aulos' | 'lyre';
type Accomp = 'strum' | 'arp' | 'ostinato' | 'sparse';

/** A drum lane: 16-step bar patterns. Frame drum D/d dum, T/t tek; low lane B/b big drum, P/p tympanum; Z/z finger cymbals. */
interface Lane {
  voice: 'frame' | 'low' | 'zill';
  pats: readonly string[];
  /** comes in at this build/intensity level */
  from?: number;
  /** only every n-th bar of a section */
  every?: number;
  /** pick the pattern by level instead of per section */
  byLevel?: boolean;
  /** the last beat of a phrase may become a fill */
  fill?: boolean;
}
interface Kit { lanes: readonly Lane[]; ghost: number; fills: readonly string[]; level: number; chance?: number }

const HIT: Record<string, { voice: HitVoice; vel: number }> = {
  D: { voice: 'dum', vel: 0.9 }, d: { voice: 'dum', vel: 0.55 }, T: { voice: 'tek', vel: 0.75 }, t: { voice: 'tek', vel: 0.32 },
  B: { voice: 'low', vel: 1 }, b: { voice: 'low', vel: 0.55 }, P: { voice: 'tymp', vel: 0.9 }, p: { voice: 'tymp', vel: 0.55 },
  Z: { voice: 'zill', vel: 0.7 }, z: { voice: 'zill', vel: 0.4 },
};

const KITS: Record<Mood, Kit | null> = {
  // a processional: the big drum on one, the tympanum answering on three
  title: {
    lanes: [
      { voice: 'low', pats: ['B.......p.......', 'B.......p...p...'] },
      { voice: 'frame', pats: ['........d...t.t.', '....t...d...t...'], fill: true },
    ],
    ghost: 0.05, fills: ['d.t.', 't.tt'], level: 0.8,
  },
  // maqsum on a soft frame drum
  ludus: {
    lanes: [
      { voice: 'frame', pats: ['d.t...t.d...t...', 'd.t.t.t.d...t...', 'd...t.t.d.t.t...'], fill: true },
      { voice: 'zill', pats: ['..............z.', '......z.......z.'], every: 2 },
    ],
    ghost: 0.12, fills: ['t.tt', 'd.t.'], level: 0.55, chance: 0.75,
  },
  nursery: { lanes: [{ voice: 'zill', pats: ['z...............'], every: 4 }], ghost: 0, fills: [], level: 0.45 },
  // builds from the big drum alone to saidi on the frame drum with cymbals
  arena: {
    lanes: [
      { voice: 'low', pats: ['B.......B.......', 'B.......B...b...'] },
      { voice: 'low', pats: ['....p.......p...', '....p.....p.p...'], from: 0.3 },
      { voice: 'frame', pats: ['D.T...D.D...T...', 'D.T.T.D.D...T.t.'], from: 0.5, fill: true },
      { voice: 'zill', pats: ['..z...z...z...z.'], from: 0.85 },
    ],
    ghost: 0.25, fills: ['pppp', 'tTtT', 'DTDT'], level: 0.75,
  },
  battle: {
    lanes: [
      { voice: 'frame', pats: ['D..TD.T.D..TD.T.', 'D.TtD.T.D.TtD.Tt', 'D..TD.TtD..TDtTt'], fill: true },
      { voice: 'low', pats: ['B.......B.......', 'B.......B.....b.', 'B...B...B...B.b.'], byLevel: true },
      { voice: 'low', pats: ['....P.......P...'], from: 0.3 },
      { voice: 'zill', pats: ['..z...z...z...z.'], from: 0.45 },
    ],
    ghost: 0.35, fills: ['tTtT', 'DTDT', 'TTTT'], level: 0.72,
  },
  // a slow heartbeat
  night: { lanes: [{ voice: 'low', pats: ['Bb..............'], every: 2 }], ghost: 0, fills: [], level: 0.42 },
  // a tolling drum
  lament: {
    lanes: [
      { voice: 'low', pats: ['B...............'], every: 2 },
      { voice: 'low', pats: ['........p.......'], every: 4 },
    ],
    ghost: 0, fills: [], level: 0.55,
  },
};

export interface MoodSpec {
  root: number;
  mode: ModeName;
  bpm: number;
  phraseBars: 1 | 2;
  feel: Feel;
  /** lead instrument per phrase (call, answer, call, close), one plan picked per section */
  leads: readonly (readonly Lead[])[];
  /** chance a phrase has no lead (the accompaniment breathes alone) */
  rest: number;
  ornament: number;
  accomp: Accomp;
  accompDensity: number;
  accompVel: number;
  leadVel: number;
  drone: number;
  pad: number;
  kit: Kit | null;
  /** loudness of the distant saurian growl (0 = never) */
  growl: number;
  humanMs: number;
  /** flat: a steady groove; build: drums build up over sections; intensity: follows setIntensity (battle) */
  level: 'flat' | 'build' | 'intensity';
}

export const MOOD_SPECS: Record<Mood, MoodSpec> = {
  title: {
    root: 50, mode: 'hijaz', bpm: 72, phraseBars: 2, feel: 'stately',
    leads: [['aulos', 'lyre', 'aulos', 'lyre'], ['aulos', 'aulos', 'lyre', 'aulos']], rest: 0.1, ornament: 0.35,
    accomp: 'strum', accompDensity: 0.6, accompVel: 0.5, leadVel: 0.8, drone: 0.8, pad: 0.35, kit: KITS.title, growl: 0, humanMs: 14, level: 'flat',
  },
  ludus: {
    root: 55, mode: 'dorian', bpm: 92, phraseBars: 2, feel: 'dance',
    leads: [['lyre', 'aulos', 'lyre', 'aulos'], ['aulos', 'lyre', 'aulos', 'lyre'], ['lyre', 'lyre', 'aulos', 'aulos']], rest: 0.3, ornament: 0.25,
    accomp: 'arp', accompDensity: 0.75, accompVel: 0.34, leadVel: 0.72, drone: 0.45, pad: 0.2, kit: KITS.ludus, growl: 0, humanMs: 12, level: 'flat',
  },
  nursery: {
    root: 50, mode: 'dorian', bpm: 66, phraseBars: 2, feel: 'stately',
    leads: [['lyre', 'lyre', 'lyre', 'lyre']], rest: 0.3, ornament: 0.2,
    accomp: 'sparse', accompDensity: 0.5, accompVel: 0.3, leadVel: 0.62, drone: 0.25, pad: 0.35, kit: KITS.nursery, growl: 0, humanMs: 18, level: 'flat',
  },
  arena: {
    root: 50, mode: 'hijaz', bpm: 104, phraseBars: 2, feel: 'dance',
    leads: [['aulos', 'aulos', 'aulos', 'aulos'], ['aulos', 'lyre', 'aulos', 'lyre']], rest: 0.35, ornament: 0.3,
    accomp: 'ostinato', accompDensity: 0.6, accompVel: 0.4, leadVel: 0.75, drone: 0.6, pad: 0, kit: KITS.arena, growl: 0, humanMs: 10, level: 'build',
  },
  battle: {
    root: 50, mode: 'hijaz', bpm: 138, phraseBars: 2, feel: 'fast',
    leads: [['aulos', 'aulos', 'aulos', 'aulos']], rest: 0.15, ornament: 0.35,
    accomp: 'ostinato', accompDensity: 0.85, accompVel: 0.42, leadVel: 0.8, drone: 0.5, pad: 0, kit: KITS.battle, growl: 0, humanMs: 8, level: 'intensity',
  },
  night: {
    root: 48, mode: 'phrygian', bpm: 56, phraseBars: 1, feel: 'slow',
    leads: [['lyre', 'lyre', 'aulos', 'lyre'], ['lyre', 'lyre', 'lyre', 'lyre']], rest: 0.5, ornament: 0.15,
    accomp: 'sparse', accompDensity: 0.35, accompVel: 0.3, leadVel: 0.55, drone: 0.75, pad: 0, kit: KITS.night, growl: 1, humanMs: 20, level: 'flat',
  },
  lament: {
    root: 50, mode: 'aeolian', bpm: 50, phraseBars: 1, feel: 'slow',
    leads: [['aulos', 'aulos', 'aulos', 'aulos'], ['aulos', 'lyre', 'aulos', 'aulos']], rest: 0.15, ornament: 0.45,
    accomp: 'sparse', accompDensity: 0.3, accompVel: 0.3, leadVel: 0.66, drone: 0.8, pad: 0.25, kit: KITS.lament, growl: 0.6, humanMs: 22, level: 'flat',
  },
};

/** Chord root per phrase (scale degrees); the last bar of a section always returns to the tonic. */
const HARMONY: Record<ModeName, readonly (readonly number[])[]> = {
  hijaz: [[0, 0, 1, 0], [0, 3, 1, 0], [0, -1, 0, 1], [0, 1, 3, 0], [0, 0, 3, 1]],
  dorian: [[0, 3, 0, -1], [0, 0, 3, 4], [0, -1, 3, 0], [0, 2, 3, -1]],
  aeolian: [[0, 5, -1, 0], [0, 3, 4, 0], [0, -2, -1, 0], [0, 5, 3, -1]],
  phrygian: [[0, 1, 0, -1], [0, 0, 1, 0], [0, 3, 1, 0], [0, -1, 1, 0]],
  majorPenta: [[0, 0, 3, 0]],
};
/** Broken-chord orders (indices into [root, third, fifth, octave]) and bass ostinati (degrees above the chord root). */
const ARPS: readonly (readonly number[])[] = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 1, 2, 0, 2], [0, 1, 2, 1, 3, 2, 1, 2], [0, 2, 3, 2, 1, 2, 3, 1]];
const OSTINATI: readonly (readonly number[])[] = [[0, 0, 4, 0, 0, 0, 4, 3], [0, 0, 0, 4, 0, 0, 1, 0], [0, 4, 0, 4, 0, 4, 1, 0], [0, 0, 4, 3, 0, 0, 4, 1]];
/** Lead registers (degrees around the tonic an octave above the mood's root). */
const RANGE: Record<Lead, readonly [number, number]> = { aulos: [-2, 9], lyre: [-1, 10] };
const ROLES: readonly Role[] = ['call', 'answer', 'call', 'close'];

// ---------------------------------------------------------------------------------------------
// The composer: one bar at a time
// ---------------------------------------------------------------------------------------------

interface Pluck { t: number; deg: number; v: number }
interface PlannedPhrase { lead: Lead | null; notes: PhraseNote[]; plucks: Pluck[]; harmony: number }
interface Section { bars: number; phrases: PlannedPhrase[]; build: number; grooves: number[]; drums: boolean; arp: readonly number[]; ost: readonly number[] }

export interface Composer {
  readonly mood: Mood;
  readonly spec: MoodSpec;
  readonly barDur: number;
  /** the next bar of the score; `intensity` (0–1) only matters for the battle */
  nextBar(intensity?: number): Bar;
}

export function createComposer(mood: Mood, seed: number): Composer {
  const spec = MOOD_SPECS[mood];
  const rng = makeRng(seed);
  const n = MODES[spec.mode].length;
  const spb = 60 / spec.bpm;
  const barDur = 4 * spb;
  const leadRoot = spec.root + 12;
  let theme = makeMotif(rng, spec.feel);
  let contrast = makeMotif(rng, spec.feel);
  let sectionNo = 0;
  let section: Section | null = null;
  let barInSection = 0;
  let sinceGrowl = 0;
  let nextGrowl = rng.int(2, 5);

  const plucksOf = (notes: PhraseNote[]): Pluck[] => {
    const out: Pluck[] = [];
    for (const x of notes) {
      out.push({ t: x.t, deg: x.deg, v: 1 });
      if (x.len >= 2 && rng.chance(0.65)) out.push({ t: x.t + x.len / 2, deg: x.deg, v: 0.55 }); // re-strike a held note
    }
    return out;
  };

  const planSection = (intensity: number): Section => {
    // the material drifts: the theme is kept for a while, varied, then replaced by the contrast motif
    if (sectionNo > 0) {
      if (rng.chance(0.3)) {
        theme = rng.chance(0.5) ? contrast : vary(rng, theme, spec.feel, 'tail');
        contrast = makeMotif(rng, spec.feel);
      } else if (rng.chance(0.4)) contrast = makeMotif(rng, spec.feel);
    }
    const leads = rng.pick(spec.leads);
    const harmony = rng.pick(HARMONY[spec.mode]);
    const anchor = rng.pick([0, 0, 2, 4]);
    const restP = spec.rest * (spec.level === 'intensity' ? 1 - intensity * 0.8 : 1);
    const phrases = ROLES.map((role, i): PlannedPhrase => {
      const lead: Lead | null = (sectionNo === 0 && i === 0) || !rng.chance(restP * (role === 'close' ? 0.5 : 1)) ? leads[i] : null;
      const motif = i < 2 ? theme : rng.chance(0.5) ? contrast : vary(rng, theme, spec.feel, 'sequence');
      const notes = buildPhrase(rng, { mode: spec.mode, feel: spec.feel, phraseBars: spec.phraseBars, ornament: spec.ornament, range: RANGE[lead ?? 'aulos'] }, motif, role, i === 2 ? anchor + rng.pick([0, 1, 2]) : anchor);
      return { lead, notes, plucks: lead === 'lyre' ? plucksOf(notes) : [], harmony: harmony[i] };
    });
    const build = spec.level !== 'build' ? 0.6
      : sectionNo < 4 ? [0.2, 0.55, 0.8, 1][sectionNo]
        : rng.chance(0.15) ? 0.2 : rng.range(0.7, 1);
    const kit = spec.kit;
    return {
      bars: 4 * spec.phraseBars,
      phrases,
      build,
      grooves: (kit?.lanes ?? []).map(() => rng.int(0, 7)),
      drums: !!kit && (kit.chance === undefined || sectionNo === 0 || rng.chance(kit.chance)),
      arp: rng.pick(ARPS),
      ost: rng.pick(OSTINATI),
    };
  };

  const leadVel = (deg: number, i: number, count: number): number => {
    const v = spec.leadVel * (1 + 0.03 * (deg - 2)) * (i === 0 ? 1.05 : 1) * (i === count - 1 ? 0.92 : 1);
    return Math.max(0.2, Math.min(1, v));
  };

  const nextBar = (intensity = 0): Bar => {
    const inten = Math.max(0, Math.min(1, intensity));
    if (!section || barInSection >= section.bars) {
      section = planSection(inten);
      barInSection = 0;
      sectionNo++;
    }
    const S = section;
    const b = barInSection++;
    const pi = Math.floor(b / spec.phraseBars);
    const kb = b % spec.phraseBars;
    const ph = S.phrases[pi];
    const h0 = b === S.bars - 1 ? 0 : ph.harmony;
    const h = h0 > 3 ? h0 - n : h0; // voice high chord roots (the fifth, the sixth) from below
    const level = spec.level === 'build' ? Math.min(1, S.build + (b / S.bars) * 0.2) : spec.level === 'intensity' ? 0.25 + 0.75 * inten : 0.6;
    const ev: MusicEvent[] = [];
    const human = spec.humanMs / 1000;
    const lyreAt = (t: number, midi: number, vel: number, dur = 1.5) => ev.push({ voice: 'lyre', t, dur, midi, vel });

    // drone for the whole section, pad chords per phrase
    if (b === 0 && spec.drone > 0) ev.push({ voice: 'drone', t: 0, dur: S.bars * barDur, midi: spec.root - 12, vel: spec.drone });
    if (kb === 0 && spec.pad > 0) {
      [h, h + 4, h + 2].forEach((d, i) => ev.push({ voice: 'pad', t: i * 0.04, dur: spec.phraseBars * barDur, midi: degreeToMidi(spec.root, spec.mode, d), vel: spec.pad * (i === 2 ? 0.6 : 1) }));
    }

    // the lead
    const from = kb * 4;
    if (ph.lead === 'aulos' && kb === 0) {
      const notes: LineNote[] = ph.notes.map((x, i) => ({
        t: Math.max(0, x.t * spb + (i ? rng.jitter(human * 0.5) : 0)),
        dur: x.len * spb,
        midi: degreeToMidi(leadRoot, spec.mode, x.deg),
        vel: leadVel(x.deg, i, ph.notes.length) * (1 + rng.jitter(0.08)),
      }));
      ev.push({ voice: 'aulos', t: Math.max(0, rng.jitter(human)), notes });
    } else if (ph.lead === 'lyre') {
      ph.plucks.forEach((p, i) => {
        if (p.t < from || p.t >= from + 4) return;
        lyreAt((p.t - from) * spb, degreeToMidi(leadRoot, spec.mode, p.deg), leadVel(p.deg, i, ph.plucks.length) * p.v);
      });
    }
    // heterophony: in a hot battle the lyre doubles the aulos an octave down
    if (ph.lead === 'aulos' && spec.level === 'intensity' && level > 0.8) {
      for (const x of ph.notes) {
        if (x.t < from || x.t >= from + 4 || x.len < 0.5) continue;
        lyreAt((x.t - from) * spb, degreeToMidi(spec.root, spec.mode, x.deg), 0.42);
      }
    }

    // accompaniment
    const chord = [h, h + 2, h + 4, h + 7];
    const acc = (d: number, beat: number, vel: number, root = leadRoot) => lyreAt(beat * spb, degreeToMidi(root, spec.mode, d), vel * spec.accompVel);
    switch (spec.accomp) {
      case 'strum': {
        const strum = (beat: number, ds: number[], v: number) => ds.forEach((d, i) => lyreAt(beat * spb + i * 0.024, degreeToMidi(spec.root, spec.mode, d), v * spec.accompVel * (i === 0 ? 1.1 : 1)));
        strum(0, [h, h + n, h + 2 + n, h + 4 + n], 1);
        if (rng.chance(spec.accompDensity * 0.7)) strum(2, [h + n, h + 2 + n, h + 4 + n], 0.7);
        if (rng.chance(0.25)) acc(h - n, 3.5, 0.6);
        break;
      }
      case 'arp':
        for (let i = 0; i < 8; i++) {
          if (i > 0 && !rng.chance(spec.accompDensity)) continue;
          acc(chord[S.arp[i]] - n, i * 0.5, i % 2 ? 0.75 : 1);
        }
        break;
      case 'ostinato': {
        const sixteenths = level > 0.55;
        for (let i = 0; i < 8; i++) {
          if (i > 0 && !rng.chance(spec.accompDensity + 0.15)) continue;
          const d = h + S.ost[i];
          acc(d, i * 0.5, i % 4 === 0 ? 1.1 : i % 2 ? 0.7 : 0.9, spec.root);
          if (sixteenths && rng.chance(0.6)) acc(d, i * 0.5 + 0.25, 0.45, spec.root);
        }
        break;
      }
      case 'sparse': {
        if (rng.chance(0.8)) acc(h - n, 0, 1);
        const k = rng.chance(spec.accompDensity) ? rng.int(1, 2) : 0;
        for (let i = 0; i < k; i++) acc(rng.pick(chord) - (rng.chance(0.6) ? n : 0), rng.pick([1, 1.5, 2, 2.5, 3]), 0.7);
        break;
      }
    }

    // drums
    const kit = spec.kit;
    if (kit && S.drums) {
      const step = spb / 4;
      const phraseEnd = kb === spec.phraseBars - 1;
      const fill = phraseEnd && kit.fills.length > 0 && (b === S.bars - 1 || rng.chance(0.35)) ? rng.pick(kit.fills) : null;
      kit.lanes.forEach((lane, li) => {
        if (lane.from !== undefined && level < lane.from) return;
        if (lane.every && b % lane.every !== 0) return;
        let pat = lane.byLevel ? lane.pats[Math.min(lane.pats.length - 1, Math.floor(level * lane.pats.length))] : lane.pats[S.grooves[li] % lane.pats.length];
        if (fill && lane.fill) pat = pat.slice(0, 12) + fill;
        for (let i = 0; i < 16; i++) {
          let ch = pat[i];
          if (ch === '.' && lane.voice === 'frame' && i % 2 === 1 && rng.chance(kit.ghost * level)) ch = 't';
          const hit = HIT[ch];
          if (!hit) continue;
          ev.push({ voice: hit.voice, t: i * step, vel: hit.vel * kit.level * (i === 0 ? 1.08 : 1), midi: hit.voice === 'tymp' ? spec.root - 12 : undefined });
        }
      });
    }

    // the saurian touch: now and then a distant growl swells under the drone
    if (spec.growl > 0) {
      sinceGrowl++;
      if (sinceGrowl >= nextGrowl) {
        ev.push({ voice: 'growl', t: rng.range(0, barDur * 0.5), dur: rng.range(3.5, 5.5), vel: spec.growl });
        sinceGrowl = 0;
        nextGrowl = rng.int(6, 12);
      }
    }

    // humanise: a little timing and velocity spread (drums tighter), then keep every event inside its bar
    for (const e of ev) {
      if (e.voice === 'aulos' || e.voice === 'drone' || e.voice === 'pad' || e.voice === 'growl') continue;
      const drum = e.voice !== 'lyre';
      e.t += rng.jitter(drum ? human * 0.5 : human);
      e.vel = Math.max(0.05, Math.min(1.1, e.vel * (1 + rng.jitter(0.1))));
    }
    for (const e of ev) e.t = Math.min(barDur - 0.001, Math.max(0, e.t));
    ev.sort((a, b2) => a.t - b2.t);
    return { dur: barDur, beats: 4, bpm: spec.bpm, events: ev };
  };

  return { mood, spec, barDur, nextBar };
}

// ---------------------------------------------------------------------------------------------
// Stings
// ---------------------------------------------------------------------------------------------

export type StingKind = 'victory' | 'defeat' | 'hatch' | 'week';
export interface Sting {
  root: number;
  mode: ModeName;
  /** seconds after the call (lets the matching sound effect speak first) */
  delay: number;
  /** seconds the bed stays ducked */
  dur: number;
  events: MusicEvent[];
}

function stingLine(t: number, root: number, mode: ModeName, notes: readonly (readonly [number, number])[], vel: number): LineEvent {
  let at = 0;
  return {
    voice: 'aulos', t, notes: notes.map(([deg, dur], i) => {
      const r = { t: at, dur, midi: degreeToMidi(root, mode, deg), vel: vel * (i === notes.length - 1 ? 1 : 0.9) };
      at += dur;
      return r;
    }),
  };
}

/** The one-shot stings, in fixed keys: victory and defeat in the arena's D, hatching and the new week in the ludus's G. */
export function stingEvents(kind: StingKind): Sting {
  switch (kind) {
    case 'victory': {
      const root = 50;
      const mode: ModeName = 'hijaz';
      const b = 0.42;
      const ev: MusicEvent[] = [];
      for (let i = 0; i < 7; i++) ev.push({ voice: 'tek', t: i * 0.06, vel: 0.2 + i * 0.08 });
      ev.push({ voice: 'dum', t: b, vel: 1 }, { voice: 'low', t: b, vel: 0.9 });
      ev.push(stingLine(b, root + 12, mode, [[4, 0.25 * b], [5, 0.25 * b], [4, 0.5 * b], [7, b], [6, 0.25 * b], [7, 2.4 * b]], 0.95));
      [0, 2, 4, 7].forEach((d, i) => ev.push({ voice: 'lyre', t: b + i * 0.024, dur: 2, midi: degreeToMidi(root, mode, d), vel: 0.6 }));
      const end = b + 2.25 * b;
      [-7, 0, 2, 4, 7].forEach((d, i) => ev.push({ voice: 'lyre', t: end + i * 0.024, dur: 2.5, midi: degreeToMidi(root + 12, mode, d), vel: 0.65 }));
      ev.push({ voice: 'low', t: end, vel: 1 }, { voice: 'tymp', t: end, vel: 0.8, midi: root - 12 }, { voice: 'zill', t: end + 0.02, vel: 0.6 });
      return { root, mode, delay: 0.35, dur: end + 1.6, events: ev.sort((x, y) => x.t - y.t) };
    }
    case 'defeat': {
      const root = 50;
      const mode: ModeName = 'phrygian';
      const ev: MusicEvent[] = [
        { voice: 'low', t: 0, vel: 0.9 }, { voice: 'low', t: 1.3, vel: 0.7 }, { voice: 'low', t: 2.6, vel: 0.6 },
        { voice: 'drone', t: 0, dur: 3.6, midi: root - 12, vel: 0.7 },
        stingLine(0.12, root + 12, mode, [[4, 1.1], [3, 0.55], [2, 0.55], [1, 0.85], [0, 1.7]], 0.85),
        { voice: 'lyre', t: 3.2, dur: 2, midi: root, vel: 0.5 },
      ];
      return { root, mode, delay: 0.5, dur: 4.4, events: ev.sort((x, y) => x.t - y.t) };
    }
    case 'hatch': {
      const root = 55;
      const mode: ModeName = 'majorPenta';
      const ev: MusicEvent[] = [{ voice: 'zill', t: 0, vel: 0.35 }];
      [0, 1, 2, 3, 5].forEach((d, i) => ev.push({ voice: 'lyre', t: 0.02 + i * 0.11, dur: 1.6, midi: degreeToMidi(root + 12, mode, d), vel: 0.5 + i * 0.04 }));
      ev.push({ voice: 'lyre', t: 0.95, dur: 1.4, midi: degreeToMidi(root + 12, mode, 4), vel: 0.42 });
      ev.push({ voice: 'lyre', t: 1.3, dur: 1.8, midi: degreeToMidi(root + 12, mode, 3), vel: 0.4 });
      [0, 3, 2].forEach((d, i) => ev.push({ voice: 'pad', t: 0.05 + i * 0.03, dur: 1.8, midi: degreeToMidi(root, mode, d), vel: 0.4 }));
      return { root, mode, delay: 0.45, dur: 2.6, events: ev.sort((x, y) => x.t - y.t) };
    }
    case 'week': {
      const root = 55;
      const mode: ModeName = 'dorian';
      const ev: MusicEvent[] = [];
      [-7, 0, 2, 4].forEach((d, i) => ev.push({ voice: 'lyre', t: i * 0.026, dur: 1.8, midi: degreeToMidi(root + 12, mode, d), vel: 0.55 }));
      ev.push(stingLine(0.16, root + 12, mode, [[0, 0.2], [1, 0.2], [2, 0.2], [4, 0.6], [3, 0.2], [4, 0.9]], 0.8));
      ev.push({ voice: 'dum', t: 0, vel: 0.6 }, { voice: 'dum', t: 2.3, vel: 0.5 });
      return { root, mode, delay: 0.8, dur: 2.6, events: ev.sort((x, y) => x.t - y.t) };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Screen → mood
// ---------------------------------------------------------------------------------------------

/** The mood of each screen; 'inherit' takes the mood of the screen below it in the stack (a dino opened from the nursery). */
export const SCREEN_MOOD: Record<ScreenName, Mood | 'inherit'> = {
  menu: 'title', newgame: 'title', load: 'title',
  upgrades: 'ludus', achievements: 'ludus', halloffame: 'ludus', transfer: 'ludus', settings: 'ludus', codex: 'ludus',
  hub: 'ludus', ludus: 'ludus', market: 'ludus', estate: 'ludus', finance: 'ludus', objectives: 'ludus', messages: 'ludus',
  events: 'ludus', results: 'ludus', influence: 'ludus', ascension: 'ludus', intrigue: 'ludus', rival: 'ludus',
  dino: 'inherit',
  breeding: 'nursery',
  arena: 'arena', arenaPlay: 'arena',
  horde: 'night',
  defeated: 'lament',
};

export interface MoodInput {
  /** the screen stack, bottom first (the last entry is on screen) */
  stack: readonly ScreenName[];
  inGame: boolean;
  /** the battle viewer is open */
  battle?: boolean;
  /** moods held by open sheets (night scenes, raid decisions); the last one wins */
  holds?: readonly Mood[];
}

/** The one place that decides what plays: battle > game over > a sheet's hold > out of game > the screen. */
export function moodFor(i: MoodInput): Mood {
  const top = i.stack[i.stack.length - 1] ?? 'menu';
  if (i.battle) return 'battle';
  if (top === 'defeated') return 'lament';
  const held = i.holds?.[i.holds.length - 1];
  if (held) return held;
  if (!i.inGame) return 'title';
  for (let k = i.stack.length - 1; k >= 0; k--) {
    const m = SCREEN_MOOD[i.stack[k]];
    if (m && m !== 'inherit') return m;
  }
  return 'ludus';
}
