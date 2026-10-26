// Generative music on WebAudio: nothing is fetched (the host's CSP blocks audio files), every note is
// synthesised. musicLogic.ts writes the score a bar at a time; this file plays it.
//
//   instruments  lyre / kithara (Karplus-Strong plucks rendered into small cached buffers), aulos (two detuned
//                saws through a reed formant, slow vibrato, breath noise, legato glides per phrase), frame drum
//                (dum, tek), tympanum, big arena drum, finger cymbals, drone and pad, the distant growl
//   bus          per-mood player gains (crossfades) → bed (ducked under stings) + stings → reverb (generated
//                impulse) → high-pass 35 Hz, high shelf, low-pass → glue compressor → Music volume → limiter
//   scheduler    a 50 ms timer schedules every note up to 0.3 s ahead on the audio clock (never at note time)
//
// The live controller (initMusic, setMusicEnabled, setMusicMood, setMusicVolume, setMusicIntensity, musicSting)
// is driven by the app shell (musicDirector.ts). It shares the AudioContext of audio.ts, starts only after the
// first user gesture, stops scheduling when Music is off or the tab is hidden, and keeps one scheduler even when
// the host hot-swaps the page (a newer copy of this module disposes the older one through `window`).
// renderMusicOffline() plays the same engine into an OfflineAudioContext (scripts/music-render.mjs).
import { audioUnlocked, getAudioContext, holdAudio, onAudioChange, pageHidden } from './audio';
import {
  createComposer, midiToHz, MOOD_SPECS, stingEvents,
  type Composer, type GrowlEvent, type HitEvent, type LineEvent, type Mood, type MusicEvent, type NoteEvent, type StingKind, type Voice,
} from './musicLogic';

type Ctx = BaseAudioContext;

/** Settings → Music volume default (emptyMeta() and the meta migration use the same value). */
export const DEFAULT_MUSIC_VOLUME = 0.6;
const LOOKAHEAD = 0.3;
const TICK_MS = 50;

/** Voice levels (per note at velocity 1, before the bus). */
const LV = { lyre: 0.85, aulos: 0.14, drone: 0.05, pad: 0.05, dum: 0.42, tek: 0.2, tymp: 0.3, low: 0.34, zill: 0.03, growl: 0.08 };
/** Gain into the master chain. */
const MIX = 0.75;
const DUCK = 0.32;

function volumeGain(v: number): number {
  const x = Math.max(0, Math.min(1, Number.isFinite(v) ? v : DEFAULT_MUSIC_VOLUME));
  return x * x * 1.6;
}

// ---------------------------------------------------------------------------------------------
// Per-context resources: noise, reverb impulse, plucked-string buffers
// ---------------------------------------------------------------------------------------------

interface Res { noise: AudioBuffer; ir: AudioBuffer; ks: Map<number, { buf: AudioBuffer; rate: number }> }
const RES = new WeakMap<Ctx, Res>();

function lcg(seed: number): () => number {
  let s = (seed % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

function res(c: Ctx): Res {
  let r = RES.get(c);
  if (r) return r;
  const sr = c.sampleRate;
  const noise = c.createBuffer(1, Math.floor(sr * 2), sr);
  const nd = noise.getChannelData(0);
  const rnd = lcg(4242);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd();
  // a 2.4 s hall: exponentially decaying noise that darkens as it fades, a short pre-delay
  const secs = 2.4;
  const ir = c.createBuffer(2, Math.floor(sr * secs), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const rn = lcg(1234 + ch * 777);
    const pre = Math.floor(sr * 0.018);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const k = 0.12 + 0.7 * Math.exp(-t * 2.4);
      lp += k * (rn() - lp);
      d[i] = i < pre ? 0 : lp * Math.exp((-t * 6.9) / secs);
    }
  }
  r = { noise, ir, ks: new Map() };
  RES.set(c, r);
  return r;
}

/**
 * Karplus-Strong pluck for one MIDI note, cached per context. The delay line is an integer length; the
 * playback rate corrects the small tuning error. Low strings ring longer, like gut strings on a kithara.
 * Low and middle strings render at half the context rate (the lyre bus is low-passed at 4.2 kHz anyway).
 */
function ksBuffer(c: Ctx, midi: number): { buf: AudioBuffer; rate: number } {
  const r = res(c);
  const hit = r.ks.get(midi);
  if (hit) return hit;
  const f = midiToHz(midi);
  // high strings keep the full rate (a short loop at half rate would drift out of tune)
  const half = c.sampleRate > 30000 && c.sampleRate / 2 / f > 48;
  const sr = half ? c.sampleRate / 2 : c.sampleRate;
  // the loop filter y = (1 − S)·a + S·b: S = 0.5 is classic KS; a smaller S keeps the overtones ringing (the
  // lower buffer rate would otherwise dull them), and the loop delay becomes N − S samples
  const S = half ? 0.16 : 0.3;
  const N = Math.max(4, Math.round(sr / f + S));
  const f0 = sr / (N - S);
  const t60 = Math.max(0.8, Math.min(2.6, 2.6 - (midi - 50) * 0.055));
  const len = Math.floor(sr * Math.min(2.4, t60 * 0.85));
  const rho = Math.pow(10, -3 / (t60 * f0));
  // excitation: soft (low-passed) noise with a pluck-position comb, no DC
  const rnd = lcg(midi * 7919 + 17);
  const ex = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += 0.7 * (rnd() - lp);
    ex[i] = lp;
  }
  const p = Math.max(1, Math.round(N * 0.21));
  const line = new Float32Array(N);
  let mean = 0;
  for (let i = 0; i < N; i++) {
    line[i] = ex[i] - 0.65 * ex[(i - p + N) % N];
    mean += line[i];
  }
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  let idx = 0;
  let peak = 1e-6;
  for (let n = 0; n < len; n++) {
    const a = line[idx];
    const nb = idx + 1 === N ? 0 : idx + 1;
    out[n] = a;
    line[idx] = rho * ((1 - S) * a + S * line[nb]);
    idx = nb;
    const m = a < 0 ? -a : a;
    if (m > peak) peak = m;
  }
  const fade = Math.floor(sr * 0.05);
  for (let n = 0; n < len; n++) {
    out[n] /= peak;
    if (n > len - fade) out[n] *= (len - n) / fade;
  }
  const v = { buf, rate: f / f0 };
  r.ks.set(midi, v);
  return v;
}

// ---------------------------------------------------------------------------------------------
// Buses: one per instrument family, each with a pan, its tone filters and a reverb send
// ---------------------------------------------------------------------------------------------

type Family = 'lyre' | 'aulos' | 'drone' | 'pad' | 'frame' | 'low' | 'zill' | 'growl';
const FAMILY: Record<Family, { pan: number; wet: number; lp?: number; peak?: readonly [number, number, number] }> = {
  lyre: { pan: -0.22, wet: 0.3, lp: 4200, peak: [230, 0.9, 3] },
  aulos: { pan: 0.16, wet: 0.34, lp: 3600, peak: [1150, 1.3, 4] },
  drone: { pan: 0, wet: 0.22 },
  pad: { pan: 0.05, wet: 0.45, lp: 1800 },
  frame: { pan: 0.28, wet: 0.16 },
  low: { pan: -0.08, wet: 0.2 },
  zill: { pan: 0.42, wet: 0.4, lp: 6000 },
  growl: { pan: -0.35, wet: 0.85, lp: 520 },
};
const FAMILY_OF: Record<Voice, Family> = {
  lyre: 'lyre', aulos: 'aulos', drone: 'drone', pad: 'pad', dum: 'frame', tek: 'frame', tymp: 'low', low: 'low', zill: 'zill', growl: 'growl',
};

class Buses {
  readonly input = {} as Record<Family, GainNode>;
  private nodes: AudioNode[] = [];
  constructor(c: Ctx, dry: AudioNode, wet: AudioNode) {
    (Object.keys(FAMILY) as Family[]).forEach((f) => {
      const def = FAMILY[f];
      const g = c.createGain();
      this.nodes.push(g);
      let node: AudioNode = g;
      if (def.peak) {
        const pk = c.createBiquadFilter();
        pk.type = 'peaking';
        [pk.frequency.value, pk.Q.value, pk.gain.value] = def.peak;
        node.connect(pk);
        node = pk;
        this.nodes.push(pk);
      }
      if (def.lp) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = def.lp;
        lp.Q.value = 0.5;
        node.connect(lp);
        node = lp;
        this.nodes.push(lp);
      }
      if (typeof (c as AudioContext).createStereoPanner === 'function') {
        const pan = c.createStereoPanner();
        pan.pan.value = def.pan;
        node.connect(pan);
        node = pan;
        this.nodes.push(pan);
      }
      node.connect(dry);
      const send = c.createGain();
      send.gain.value = def.wet;
      node.connect(send);
      send.connect(wet);
      this.nodes.push(send);
      this.input[f] = g;
    });
  }
  disconnect(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------

interface Live { nodes: AudioScheduledSourceNode[]; end: number }

function env(c: Ctx, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

function osc(c: Ctx, type: OscillatorType, f: number, at: number, stop: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  o.start(at);
  o.stop(stop);
  return o;
}

function noiseSrc(c: Ctx, at: number, stop: number, loop = false): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = res(c).noise;
  s.loop = loop;
  s.start(at, (at * 0.37) % 1.5);
  s.stop(stop);
  return s;
}

function playLyre(c: Ctx, out: AudioNode, e: NoteEvent, at: number): void {
  const { buf, rate } = ksBuffer(c, e.midi);
  const s = c.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = LV.lyre * e.vel;
  s.connect(g).connect(out);
  s.start(at);
  s.stop(at + buf.duration / rate + 0.02);
}

function playAulos(c: Ctx, out: AudioNode, e: LineEvent, at: number, live: Live[]): void {
  const ns = e.notes;
  if (!ns.length) return;
  const t0 = at + ns[0].t;
  const last = ns[ns.length - 1];
  const tEnd = at + last.t + last.dur;
  const stop = tEnd + 0.5;
  const f0 = midiToHz(ns[0].midi);
  const o1 = osc(c, 'sawtooth', f0, t0, stop);
  const o2 = osc(c, 'sawtooth', f0, t0, stop);
  o2.detune.value = 7; // the second pipe, a hair sharp
  const g2 = c.createGain();
  g2.gain.value = 0.55;
  const lfo = osc(c, 'sine', 5.1 + (ns[0].midi % 5) * 0.12, t0, stop);
  const vib = c.createGain();
  vib.gain.setValueAtTime(0, t0);
  lfo.connect(vib);
  vib.connect(o1.detune);
  vib.connect(o2.detune);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0);
  o1.connect(lp);
  o2.connect(g2).connect(lp);
  lp.connect(amp).connect(out);
  // breath: a little band-passed noise riding the envelope, strongest at the attack
  const nz = noiseSrc(c, t0, stop, true);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, t0);
  nz.connect(bp).connect(ng).connect(out);
  const cut = (midi: number, vel: number) => Math.min(3200, 900 + 1700 * vel + (midi - 60) * 15);
  let prev = -1;
  ns.forEach((n, i) => {
    const t = at + n.t;
    const v = LV.aulos * n.vel;
    if (i === 0) {
      const attack = Math.min(0.06, ns.length > 1 ? (ns[1].t - n.t) * 0.5 : 0.06);
      amp.gain.linearRampToValueAtTime(v, t + attack);
      lp.frequency.setValueAtTime(cut(n.midi, n.vel), t);
      ng.gain.linearRampToValueAtTime(v * 0.3, t + attack * 0.6);
      ng.gain.setTargetAtTime(v * 0.07, t + attack, 0.08);
    } else {
      const f = midiToHz(n.midi);
      if (n.midi === prev) {
        // a tongued repeat: a short dip in the breath
        amp.gain.setTargetAtTime(v * 0.35, t - 0.03, 0.01);
        amp.gain.setTargetAtTime(v, t + 0.006, 0.018);
      } else {
        o1.frequency.setTargetAtTime(f, t - 0.012, 0.014);
        o2.frequency.setTargetAtTime(f, t - 0.012, 0.014);
        amp.gain.setTargetAtTime(v, t, 0.04);
      }
      lp.frequency.setTargetAtTime(cut(n.midi, n.vel), t, 0.05);
    }
    // vibrato blooms only on held notes
    if (n.dur > 0.45) {
      vib.gain.setTargetAtTime(3, t, 0.02);
      vib.gain.setTargetAtTime(15, t + 0.22, 0.22);
    } else vib.gain.setTargetAtTime(3, t, 0.03);
    prev = n.midi;
  });
  amp.gain.setTargetAtTime(0, tEnd - 0.03, 0.05);
  ng.gain.setTargetAtTime(0, tEnd - 0.03, 0.04);
  live.push({ nodes: [o1, o2, lfo, nz], end: stop });
}

function playDrone(c: Ctx, out: AudioNode, e: NoteEvent, at: number, live: Live[]): void {
  const f = midiToHz(e.midi);
  const end = at + e.dur;
  const stop = end + 2.6;
  const v = LV.drone * e.vel;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(320, at);
  lp.frequency.linearRampToValueAtTime(720, at + e.dur * 0.45);
  lp.frequency.linearRampToValueAtTime(380, stop);
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + 2.2);
  g.gain.setValueAtTime(v, end);
  g.gain.linearRampToValueAtTime(0, end + 2.4);
  lp.connect(g).connect(out);
  // a soft sine fundamental for weight, the reedy body an octave up, and the fifth above it
  const parts: [OscillatorType, number, number, number][] = [['sine', 1, 0, 0.7], ['sawtooth', 2, -6, 0.75], ['sawtooth', 2, 6, 0.6], ['triangle', 3, 0, 0.45]];
  const nodes = parts.map(([type, ratio, det, lvl]) => {
    const o = osc(c, type, f * ratio, at, stop);
    o.detune.value = det;
    const og = c.createGain();
    og.gain.value = lvl;
    o.connect(og).connect(lp);
    return o;
  });
  live.push({ nodes, end: stop });
}

function playPad(c: Ctx, out: AudioNode, e: NoteEvent, at: number, live: Live[]): void {
  const f = midiToHz(e.midi);
  const end = at + e.dur;
  const stop = end + 2;
  const v = LV.pad * e.vel;
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + Math.min(1.6, e.dur * 0.4));
  g.gain.setValueAtTime(v, end);
  g.gain.linearRampToValueAtTime(0, end + 1.8);
  g.connect(out);
  const a = osc(c, 'triangle', f, at, stop);
  const b = osc(c, 'sine', f * 2, at, stop);
  b.detune.value = 4;
  const bg = c.createGain();
  bg.gain.value = 0.35;
  a.connect(g);
  b.connect(bg).connect(g);
  live.push({ nodes: [a, b], end: stop });
}

/** A pitched sine thump gliding down, plus a filtered noise slap. */
function thump(c: Ctx, out: AudioNode, at: number, f: number, to: number, glide: number, peak: number, decay: number): void {
  const o = osc(c, 'sine', f, at, at + decay + 0.1);
  o.frequency.exponentialRampToValueAtTime(to, at + glide);
  o.connect(env(c, at, peak, 0.003, decay)).connect(out);
}

function slap(c: Ctx, out: AudioNode, at: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number): void {
  const s = noiseSrc(c, at, at + decay + 0.06);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f).connect(env(c, at, peak, 0.002, decay)).connect(out);
}

function playHit(c: Ctx, out: AudioNode, e: HitEvent, at: number): void {
  const v = e.vel;
  switch (e.voice) {
    case 'dum':
      thump(c, out, at, 112, 62, 0.09, LV.dum * v, 0.36);
      slap(c, out, at, 'lowpass', 700, 0.7, LV.dum * v * 0.35, 0.05);
      break;
    case 'tek':
      slap(c, out, at, 'bandpass', 3000, 1.2, LV.tek * v, 0.045);
      thump(c, out, at, 540, 380, 0.03, LV.tek * v * 0.45, 0.035);
      break;
    case 'tymp': {
      const f = midiToHz(e.midi ?? 38);
      thump(c, out, at, f, f * 0.94, 0.4, LV.tymp * v, 0.7);
      thump(c, out, at, f * 1.59, f * 1.52, 0.25, LV.tymp * v * 0.3, 0.25);
      slap(c, out, at, 'lowpass', 1500, 0.7, LV.tymp * v * 0.25, 0.04);
      break;
    }
    case 'low':
      thump(c, out, at, 64, 46, 0.3, LV.low * v, 0.95);
      thump(c, out, at, 112, 84, 0.2, LV.low * v * 0.28, 0.25);
      slap(c, out, at, 'lowpass', 300, 0.7, LV.low * v * 0.3, 0.12);
      break;
    case 'zill':
      ([[1, 1, 0.9], [1.56, 0.55, 0.6], [2.41, 0.3, 0.35]] as const).forEach(([r, a, d]) => {
        const o = osc(c, 'sine', 1720 * r, at, at + d + 0.1);
        o.connect(env(c, at, LV.zill * v * a, 0.002, d)).connect(out);
      });
      break;
  }
}

function playGrowl(c: Ctx, out: AudioNode, e: GrowlEvent, at: number, live: Live[]): void {
  const d = e.dur;
  const end = at + d;
  const v = LV.growl * e.vel;
  const shape = (g: GainNode, peak: number) => {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + d * 0.42);
    g.gain.linearRampToValueAtTime(peak * 0.8, at + d * 0.6);
    g.gain.linearRampToValueAtTime(0, end);
  };
  // throat: low band-passed noise, roughened by a fast tremolo, falling in pitch
  const nz = noiseSrc(c, at, end + 0.1, true);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(240, at);
  bp.frequency.exponentialRampToValueAtTime(110, end);
  const am = c.createGain();
  am.gain.value = 0.55;
  const lfo = osc(c, 'sine', 23, at, end + 0.1);
  const depth = c.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(am.gain);
  const g = c.createGain();
  shape(g, v);
  nz.connect(bp).connect(am).connect(g).connect(out);
  // chest: a falling sine under it
  const o = osc(c, 'sine', 78, at, end + 0.1);
  o.frequency.exponentialRampToValueAtTime(41, end);
  const og = c.createGain();
  shape(og, v * 0.7);
  o.connect(og).connect(out);
  live.push({ nodes: [nz, lfo, o], end: end + 0.1 });
}

function play(c: Ctx, buses: Buses, e: MusicEvent, at: number, live: Live[]): void {
  const out = buses.input[FAMILY_OF[e.voice]];
  switch (e.voice) {
    case 'lyre': return playLyre(c, out, e, at);
    case 'aulos': return playAulos(c, out, e, at, live);
    case 'drone': return playDrone(c, out, e, at, live);
    case 'pad': return playPad(c, out, e, at, live);
    case 'growl': return playGrowl(c, out, e, at, live);
    default: return playHit(c, out, e, at);
  }
}

// ---------------------------------------------------------------------------------------------
// The engine: players (one per mood), crossfades, stings, the master chain
// ---------------------------------------------------------------------------------------------

interface Player {
  mood: Mood;
  composer: Composer;
  dry: GainNode;
  wet: GainNode;
  buses: Buses;
  queue: { at: number; ev: MusicEvent }[];
  nextBarAt: number;
  retireAt: number | null;
  live: Live[];
  done: boolean;
}

function fade(p: AudioParam, now: number, to: number, secs: number): void {
  const v = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(v, now);
  p.linearRampToValueAtTime(to, now + Math.max(0.01, secs));
}

export interface EngineOpts {
  volume?: number;
  seed?: number;
  /** play only these voices (level checks) */
  solo?: readonly Voice[];
}

export class MusicEngine {
  readonly ctx: Ctx;
  /** events scheduled so far, by voice */
  readonly counts: Record<string, number> = {};
  private players: Player[] = [];
  private intensity = 0;
  private seed: number;
  private out: GainNode;
  private bed: GainNode;
  private bedWet: GainNode;
  private stings: Buses;
  private stingLive: Live[] = [];
  private stingUntil = 0;
  private nodes: AudioNode[] = [];
  private solo: ReadonlySet<Voice> | null;

  constructor(ctx: Ctx, dest: AudioNode, o: EngineOpts = {}) {
    const c = ctx;
    this.ctx = c;
    this.solo = o.solo?.length ? new Set(o.solo) : null;
    this.seed = (o.seed ?? 1) >>> 0;
    const node = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    this.out = node(c.createGain());
    this.out.gain.value = volumeGain(o.volume ?? DEFAULT_MUSIC_VOLUME);
    const mix = node(c.createGain());
    mix.gain.value = MIX;
    const hp = node(c.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = 35;
    hp.Q.value = 0.7;
    const shelf = node(c.createBiquadFilter());
    shelf.type = 'highshelf';
    shelf.frequency.value = 5000;
    shelf.gain.value = -4;
    const lp = node(c.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = 9500;
    lp.Q.value = 0.5;
    const glue = node(c.createDynamicsCompressor());
    glue.threshold.value = -18;
    glue.knee.value = 10;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.02;
    glue.release.value = 0.3;
    const limit = node(c.createDynamicsCompressor());
    limit.threshold.value = -9;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.12;
    // the volume sits before the limiter, so no setting can push the bus into clipping
    mix.connect(hp).connect(shelf).connect(lp).connect(glue).connect(this.out).connect(limit).connect(dest);
    const conv = node(c.createConvolver());
    conv.buffer = res(c).ir;
    const wetIn = node(c.createGain());
    const wetOut = node(c.createGain());
    wetOut.gain.value = 0.8;
    wetIn.connect(conv).connect(wetOut).connect(mix);
    this.bed = node(c.createGain());
    this.bed.connect(mix);
    this.bedWet = node(c.createGain());
    this.bedWet.connect(wetIn);
    this.stings = new Buses(c, mix, wetIn);
  }

  /** The mood playing now (not counting players fading out). */
  get mood(): Mood | null {
    return this.players.find((p) => p.retireAt === null && !p.done)?.mood ?? null;
  }

  get playerCount(): number {
    return this.players.filter((p) => !p.done).length;
  }

  get events(): number {
    return Object.values(this.counts).reduce((n, x) => n + x, 0);
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(volumeGain(v), this.ctx.currentTime, 0.05);
  }

  setIntensity(x: number): void {
    this.intensity = Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  }

  /** Crossfade to a mood (a mood still fading out is brought back rather than restarted). */
  setMood(mood: Mood, secs = 3): void {
    const c = this.ctx;
    const now = c.currentTime;
    const cur = this.players.find((p) => p.retireAt === null && !p.done);
    if (cur?.mood === mood) return;
    if (cur) this.retire(cur, now, secs * 1.15);
    const back = this.players.find((p) => p.mood === mood && p.retireAt !== null && !p.done);
    if (back) {
      back.retireAt = null;
      fade(back.dry.gain, now, 1, secs * 0.6);
      fade(back.wet.gain, now, 1, secs * 0.6);
      return;
    }
    const dry = c.createGain();
    const wet = c.createGain();
    for (const g of [dry, wet]) {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(1, now + Math.max(0.01, secs * 0.8));
    }
    dry.connect(this.bed);
    wet.connect(this.bedWet);
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    this.players.push({
      mood, composer: createComposer(mood, this.seed), dry, wet, buses: new Buses(c, dry, wet),
      queue: [], nextBarAt: now + 0.08, retireAt: null, live: [], done: false,
    });
    // never more than two players fading out at once
    const fading = this.players.filter((p) => p.retireAt !== null && !p.done);
    for (const p of fading.slice(0, Math.max(0, fading.length - 2))) this.finalize(p);
  }

  /** Fade everything out (Music turned off). */
  stop(secs = 0.8): void {
    const now = this.ctx.currentTime;
    for (const p of this.players) if (p.retireAt === null && !p.done) this.retire(p, now, secs);
  }

  private retire(p: Player, now: number, secs: number): void {
    p.retireAt = now + secs;
    fade(p.dry.gain, now, 0, secs);
    fade(p.wet.gain, now, 0, secs);
  }

  private finalize(p: Player): void {
    if (p.done) return;
    p.done = true;
    const now = this.ctx.currentTime;
    for (const l of p.live) {
      for (const n of l.nodes) {
        try {
          n.stop(now + 0.02);
        } catch {
          /* already stopped */
        }
      }
    }
    p.live = [];
    p.queue = [];
    p.buses.disconnect();
    for (const g of [p.dry, p.wet]) {
      try {
        g.disconnect();
      } catch {
        /* gone */
      }
    }
  }

  /** Schedule every note that starts before `horizon` (audio-clock seconds). */
  pump(horizon: number): void {
    const c = this.ctx;
    const now = c.currentTime;
    for (const p of this.players) {
      if (p.done) continue;
      if (p.retireAt !== null && now > p.retireAt + 0.15) {
        this.finalize(p);
        continue;
      }
      if (p.retireAt === null && p.nextBarAt < now - 0.1) {
        // the timer was starved (a frozen tab): skip ahead instead of rushing through the backlog
        p.queue = p.queue.filter((q) => q.at >= now);
        p.nextBarAt = now + 0.05;
      }
      while (p.nextBarAt < horizon + 0.05 && (p.retireAt === null || p.nextBarAt < p.retireAt)) {
        const bar = p.composer.nextBar(this.intensity);
        for (const ev of bar.events) p.queue.push({ at: p.nextBarAt + ev.t, ev });
        p.nextBarAt += bar.dur;
      }
      let i = 0;
      while (i < p.queue.length && p.queue[i].at < horizon) {
        const { at, ev } = p.queue[i++];
        if (at < now - 0.03 || (p.retireAt !== null && at > p.retireAt)) continue;
        this.play(p.buses, ev, Math.max(at, now), p.live);
      }
      if (i) p.queue.splice(0, i);
      if (p.live.length > 24) p.live = p.live.filter((l) => l.end > now);
    }
    this.players = this.players.filter((p) => !p.done);
    if (this.stingLive.length > 8) this.stingLive = this.stingLive.filter((l) => l.end > now);
  }

  private play(buses: Buses, ev: MusicEvent, at: number, live: Live[]): void {
    this.counts[ev.voice] = (this.counts[ev.voice] ?? 0) + 1;
    if (this.solo && !this.solo.has(ev.voice)) return;
    play(this.ctx, buses, ev, at, live);
  }

  /** A one-shot sting over a ducked bed; a sting during another one waits for it (or is dropped). */
  sting(kind: StingKind, when?: number): void {
    const c = this.ctx;
    const now = c.currentTime;
    const s = stingEvents(kind);
    let at = (when ?? now) + s.delay;
    if (this.stingUntil > at) {
      if (this.stingUntil - at > 2.5) return;
      at = this.stingUntil + 0.1;
    }
    for (const ev of s.events) this.play(this.stings, ev, at + ev.t, this.stingLive);
    const t0 = Math.max(now, at - 0.08);
    for (const g of [this.bed.gain, this.bedWet.gain]) {
      g.cancelScheduledValues(t0);
      g.setTargetAtTime(DUCK, t0, 0.07);
      g.setTargetAtTime(1, at + Math.max(0.5, s.dur - 0.6), 0.45);
    }
    this.stingUntil = at + s.dur;
  }

  dispose(): void {
    for (const p of this.players) this.finalize(p);
    this.players = [];
    for (const l of this.stingLive) for (const n of l.nodes) {
      try {
        n.stop();
      } catch {
        /* stopped */
      }
    }
    this.stings.disconnect();
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* gone */
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Live controller (the page's one scheduler)
// ---------------------------------------------------------------------------------------------

export interface MusicState {
  enabled: boolean;
  unlocked: boolean;
  /** the scheduler timer is running */
  running: boolean;
  hidden: boolean;
  /** the mood the game asks for */
  mood: Mood;
  /** the mood the engine is playing (null when stopped or before the first gesture) */
  playing: Mood | null;
  players: number;
  volume: number;
  intensity: number;
  context: string;
  /** notes scheduled since the page loaded */
  events: number;
}

interface LiveHandle { dispose(): void }
interface MusicGlobal { __jlMusicLive?: LiveHandle; __jlMusic?: { state(): MusicState } }

const want = { enabled: true, mood: 'title' as Mood, volume: DEFAULT_MUSIC_VOLUME, intensity: 0 };
let engine: MusicEngine | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let disposed = false;
let inited = false;
let warned = false;
const handle: LiveHandle = { dispose: () => disposeLive() };

function glob(): MusicGlobal | null {
  return typeof window !== 'undefined' ? (window as unknown as MusicGlobal) : null;
}

function tick(): void {
  if (!engine) return;
  try {
    engine.pump(engine.ctx.currentTime + LOOKAHEAD);
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn('music: scheduler stopped', e);
    }
    stopTimer();
  }
}

function startTimer(): void {
  if (timer !== null) return;
  timer = setInterval(tick, TICK_MS);
  tick();
}

function stopTimer(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function sync(): void {
  if (disposed || !inited) return;
  holdAudio('music', want.enabled);
  if (!want.enabled) {
    stopTimer();
    engine?.stop(0.8);
    return;
  }
  const ctx = getAudioContext();
  if (!ctx || pageHidden()) {
    // before the first gesture, without WebAudio, or in a hidden tab (audio.ts suspends the context; the
    // players keep their place and carry on when the tab comes back)
    stopTimer();
    return;
  }
  if (!engine || engine.ctx !== ctx) {
    engine?.dispose();
    try {
      engine = new MusicEngine(ctx, ctx.destination, { volume: want.volume, seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 });
    } catch {
      engine = null;
      return;
    }
  }
  engine.setVolume(want.volume);
  engine.setIntensity(want.intensity);
  engine.setMood(want.mood, engine.mood ? 3 : 2);
  startTimer();
}

function disposeLive(): void {
  if (disposed) return;
  disposed = true;
  stopTimer();
  const e = engine;
  engine = null;
  if (e) {
    e.stop(0.25);
    setTimeout(() => e.dispose(), 400);
  }
}

/**
 * Start following the game (idempotent; called by the app shell after it has passed the settings and the mood).
 * Registers for the first gesture and visibility changes, retires a scheduler left by an older copy of this
 * module, and installs the read-only debug hook `window.__jlMusic.state()`. The setters only record what is
 * wanted until this has run.
 */
export function initMusic(): () => void {
  const g = glob();
  if (disposed || !g) return () => undefined;
  if (g.__jlMusicLive && g.__jlMusicLive !== handle) {
    try {
      g.__jlMusicLive.dispose();
    } catch {
      /* the old copy is gone */
    }
  }
  g.__jlMusicLive = handle;
  g.__jlMusic = { state: musicState };
  inited = true;
  const off = onAudioChange(sync);
  sync();
  return off;
}

export function setMusicEnabled(on: boolean): void {
  if (want.enabled === on) return;
  want.enabled = on;
  sync();
}

export function setMusicMood(m: Mood): void {
  if (want.mood === m) return;
  want.mood = m;
  sync();
}

export function setMusicVolume(v: number): void {
  want.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : DEFAULT_MUSIC_VOLUME));
  engine?.setVolume(want.volume);
}

/** Battle intensity 0–1 (the battle viewer raises it as the fighters' health drops). */
export function setMusicIntensity(x: number): void {
  want.intensity = Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
  engine?.setIntensity(want.intensity);
}

/** Victory, defeat, a hatching, a new week: short cues over a ducked bed. Silent while Music is off. */
export function musicSting(kind: StingKind): void {
  if (disposed || !want.enabled || !engine || timer === null) return;
  try {
    engine.sting(kind);
  } catch {
    /* never break the caller */
  }
}

export function musicState(): MusicState {
  const ctx = engine?.ctx as AudioContext | undefined;
  return {
    enabled: want.enabled, unlocked: audioUnlocked(), running: timer !== null, hidden: pageHidden(), mood: want.mood,
    playing: engine?.mood ?? null, players: engine?.playerCount ?? 0, volume: want.volume, intensity: want.intensity,
    context: ctx?.state ?? 'none', events: engine?.events ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Offline render (the level check in scripts/music-render.mjs): the same engine, a fixed seed
// ---------------------------------------------------------------------------------------------

export interface OfflineRender { buffer: AudioBuffer; counts: Record<string, number>; bpm: number; seconds: number }

export async function renderMusicOffline(o: { mood: Mood; seconds?: number; seed?: number; volume?: number; intensity?: number; sampleRate?: number; sting?: { kind: StingKind; at: number }; solo?: Voice[] }): Promise<OfflineRender> {
  const OAC: typeof OfflineAudioContext | undefined = typeof OfflineAudioContext !== 'undefined'
    ? OfflineAudioContext
    : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) throw new Error('No OfflineAudioContext here.');
  const sr = o.sampleRate ?? 44100;
  const seconds = o.seconds ?? 20;
  const ctx = new OAC(2, Math.ceil(sr * seconds), sr);
  const eng = new MusicEngine(ctx, ctx.destination, { volume: o.volume ?? DEFAULT_MUSIC_VOLUME, seed: o.seed ?? 7, solo: o.solo });
  eng.setIntensity(o.intensity ?? 0);
  eng.setMood(o.mood, 0.05);
  eng.pump(seconds);
  if (o.sting) eng.sting(o.sting.kind, o.sting.at);
  const buffer = await ctx.startRendering();
  return { buffer, counts: { ...eng.counts }, bpm: MOOD_SPECS[o.mood].bpm, seconds };
}
