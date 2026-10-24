// Tiny WebAudio synth: every sound is generated (no audio files). The AudioContext is created only after
// the first user gesture (browsers block autoplay) and every call is a no-op while Settings → Sound is off.
//
//   sfx.tap() · coin() · levelUp() · newWeek() · hatch() · hit() · crit() · miss() · ko() · cheer() · groan()
//   · achievement() · night()
//
// initAudio() is called once from the app shell; setSoundEnabled() and setEffectsVolume() follow the settings.
// The context is shared with the music (music.ts: getAudioContext, holdAudio, onAudioChange): it runs while
// sound or music wants it and the tab is visible, and is suspended otherwise. It lives on `window.__jlAudio`
// so a hot-swapped copy of this module (the host may re-run the page script) reuses it instead of opening a
// second one.

type Ctx = AudioContext;

interface Shared {
  ctx: Ctx | null;
  /** the sound-effects master gain */
  sfx: GainNode | null;
  unlocked: boolean;
  /** who wants the context running ('sfx', 'music') */
  users: Record<string, boolean>;
}

const LOCAL: Shared = { ctx: null, sfx: null, unlocked: false, users: {} };

function shared(): Shared {
  if (typeof window === 'undefined') return LOCAL;
  const w = window as unknown as { __jlAudio?: Shared };
  const s = (w.__jlAudio ??= { ctx: null, sfx: null, unlocked: false, users: {} });
  s.users ??= {};
  return s;
}

/** Sound-effects level at 100% (the level the effects were tuned at). */
const SFX_BASE = 0.55;

let master: GainNode | null = null;
let enabled = true;
let sfxVolume = 1;
let noiseBuf: AudioBuffer | null = null;
let lastTap = 0;
const listeners = new Set<() => void>();

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  shared().users.sfx = on;
  syncContext();
}

export function soundEnabled(): boolean {
  return enabled;
}

/** Settings → Effects volume (0–1, perceptual curve; 1 is the original level). */
export function setEffectsVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
  const s = shared();
  if (s.ctx && s.sfx) s.sfx.gain.setTargetAtTime(SFX_BASE * sfxVolume * sfxVolume, s.ctx.currentTime, 0.03);
}

/** True once the player has interacted with the page (audio may start). */
export function audioUnlocked(): boolean {
  return shared().unlocked;
}

export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** The shared context, created on demand, or null before the first gesture or without WebAudio. */
export function getAudioContext(): Ctx | null {
  return shared().unlocked ? make() : null;
}

/** Ask for the context to keep running (or release it): the music holds it while it is on. */
export function holdAudio(user: string, on: boolean): void {
  shared().users[user] = on;
  syncContext();
}

/** Called after the first gesture and on every visibility change. */
export function onAudioChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* a listener must never break the page */
    }
  }
}

function wanted(): boolean {
  const s = shared();
  const users = { sfx: enabled, ...s.users };
  return s.unlocked && !pageHidden() && Object.values(users).some(Boolean);
}

function syncContext(): void {
  const c = shared().ctx;
  if (!c || c.state === 'closed') return;
  if (wanted()) {
    if (c.state !== 'running') void c.resume().catch(() => undefined);
  } else if (c.state === 'running') void c.suspend().catch(() => undefined);
}

function make(): Ctx | null {
  const s = shared();
  if (s.ctx && s.ctx.state !== 'closed') {
    master = s.sfx;
    return s.ctx;
  }
  const AC: typeof AudioContext | undefined = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!AC) return null;
  try {
    s.ctx = new AC();
    s.sfx = s.ctx.createGain();
    s.sfx.gain.value = SFX_BASE * sfxVolume * sfxVolume;
    s.sfx.connect(s.ctx.destination);
  } catch {
    s.ctx = null;
    s.sfx = null;
  }
  master = s.sfx;
  return s.ctx;
}

/** Register the gesture listener that unlocks audio, the tab-visibility handling, and the global button tap sound. */
export function initAudio(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const unlock = () => {
    const s = shared();
    const first = !s.unlocked;
    s.unlocked = true;
    if (wanted()) make();
    const c = s.ctx;
    syncContext();
    if (first || (c && c.state !== 'running')) notify();
  };
  const onVisible = () => {
    syncContext();
    notify();
  };
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, [role="tab"], [role="radio"], [role="switch"], label.toggle');
    if (!el || (el as HTMLButtonElement).disabled) return;
    // the bigger cues (coins, drums) are played by the actions themselves; keep taps quiet and rare
    const now = performance.now();
    if (now - lastTap < 60) return;
    lastTap = now;
    tap();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('click', onClick, { capture: true });
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
    window.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function ready(): Ctx | null {
  if (!enabled || !shared().unlocked) return null;
  const c = make();
  if (!c || !master) return null;
  if (c.state !== 'running' && !pageHidden()) void c.resume().catch(() => undefined);
  return c;
}

function noise(c: Ctx): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 1.5);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  noiseBuf = b;
  return b;
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** end frequency (exponential glide) */
  to?: number;
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
}

function tone(c: Ctx, o: ToneOpts): void {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  const v = o.vol ?? 0.2;
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts { at?: number; dur: number; vol?: number; type?: BiquadFilterType; freq: number; to?: number; q?: number; attack?: number }

function burst(c: Ctx, o: NoiseOpts): void {
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const v = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.05);
}

// ---------------------------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------------------------

/** Soft wooden tick for buttons and tabs. */
export function tap(): void {
  const c = ready();
  if (!c) return;
  tone(c, { type: 'triangle', freq: 880, to: 660, dur: 0.05, vol: 0.05 });
}

/** Two bright metallic pings: denarii changing hands. */
export function coin(): void {
  const c = ready();
  if (!c) return;
  tone(c, { type: 'square', freq: 1568, dur: 0.09, vol: 0.05 });
  tone(c, { type: 'sine', freq: 2093, at: 0.07, dur: 0.22, vol: 0.09 });
  tone(c, { type: 'sine', freq: 3136, at: 0.07, dur: 0.12, vol: 0.03 });
}

/** Rising lyre arpeggio. */
export function levelUp(): void {
  const c = ready();
  if (!c) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, { type: 'triangle', freq: f, at: i * 0.08, dur: 0.35, vol: 0.12 }));
}

/** Achievement or upgrade: a held harp chord. */
export function achievement(): void {
  const c = ready();
  if (!c) return;
  [392, 494, 587, 784].forEach((f, i) => tone(c, { type: 'triangle', freq: f, at: i * 0.05, dur: 0.9, vol: 0.08, attack: 0.01 }));
}

/** Arena drums for a new week. */
export function newWeek(): void {
  const c = ready();
  if (!c) return;
  const hits = [0, 0.18, 0.36, 0.62];
  hits.forEach((at, i) => {
    tone(c, { type: 'sine', freq: i === 3 ? 70 : 95, to: 42, at, dur: 0.32, vol: i === 3 ? 0.5 : 0.36 });
    burst(c, { at, dur: 0.08, vol: 0.12, type: 'lowpass', freq: 900 });
  });
}

/** Hatchling chirps. */
export function hatch(): void {
  const c = ready();
  if (!c) return;
  burst(c, { dur: 0.06, vol: 0.18, type: 'highpass', freq: 2500 });
  [0.12, 0.28, 0.4].forEach((at, i) => tone(c, { type: 'sine', freq: 1900 + i * 250, to: 2900 + i * 200, at, dur: 0.09, vol: 0.09 }));
}

/** A blow landing: a thud and a little grit. */
export function hit(): void {
  const c = ready();
  if (!c) return;
  tone(c, { type: 'sine', freq: 160, to: 60, dur: 0.16, vol: 0.32 });
  burst(c, { dur: 0.1, vol: 0.22, type: 'bandpass', freq: 1400, q: 0.8 });
}

/** A critical: harder, with a bright crack. */
export function crit(): void {
  const c = ready();
  if (!c) return;
  tone(c, { type: 'sawtooth', freq: 220, to: 55, dur: 0.22, vol: 0.18 });
  burst(c, { dur: 0.16, vol: 0.35, type: 'highpass', freq: 2200 });
  tone(c, { type: 'sine', freq: 110, to: 40, at: 0.02, dur: 0.3, vol: 0.4 });
}

/** A swing through empty air. */
export function miss(): void {
  const c = ready();
  if (!c) return;
  burst(c, { dur: 0.22, vol: 0.12, type: 'bandpass', freq: 600, to: 2600, q: 2, attack: 0.05 });
}

/** A knockout roar: low growl gliding down with a rasp on top. */
export function ko(): void {
  const c = ready();
  if (!c) return;
  tone(c, { type: 'sawtooth', freq: 180, to: 70, dur: 0.9, vol: 0.16, attack: 0.06 });
  tone(c, { type: 'square', freq: 92, to: 48, dur: 0.95, vol: 0.08, attack: 0.08 });
  burst(c, { dur: 0.85, vol: 0.16, type: 'bandpass', freq: 500, to: 220, q: 1.5, attack: 0.08 });
}

/** The crowd roaring. */
export function cheer(): void {
  const c = ready();
  if (!c) return;
  burst(c, { dur: 1.8, vol: 0.22, type: 'bandpass', freq: 900, to: 1300, q: 0.6, attack: 0.35 });
  burst(c, { at: 0.2, dur: 1.4, vol: 0.12, type: 'bandpass', freq: 2200, q: 0.7, attack: 0.3 });
}

/** The crowd groaning after a defeat. */
export function groan(): void {
  const c = ready();
  if (!c) return;
  burst(c, { dur: 1.2, vol: 0.18, type: 'bandpass', freq: 520, to: 260, q: 0.8, attack: 0.2 });
}

/** A short owl call over the wind, for the night scenes. */
export function night(): void {
  const c = ready();
  if (!c) return;
  burst(c, { dur: 1.6, vol: 0.05, type: 'lowpass', freq: 400, attack: 0.5 });
  tone(c, { type: 'sine', freq: 520, to: 470, at: 0.3, dur: 0.35, vol: 0.06, attack: 0.05 });
  tone(c, { type: 'sine', freq: 500, to: 440, at: 0.8, dur: 0.5, vol: 0.06, attack: 0.05 });
}

export const sfx = { tap, coin, levelUp, achievement, newWeek, hatch, hit, crit, miss, ko, cheer, groan, night };
