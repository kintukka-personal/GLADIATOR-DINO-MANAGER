import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  MOODS, MODES, MOOD_SPECS, SCREEN_MOOD, buildPhrase, createComposer, degreeToMidi, inMode, makeMotif, makeRng, moodFor, stingEvents, vary,
  type Bar, type Mood, type MusicEvent, type StingKind,
} from '../src/ui/musicLogic';
import { initMusic, musicSting, musicState, setMusicEnabled, setMusicIntensity, setMusicMood, setMusicVolume } from '../src/ui/music';
import { migrateMeta } from '../src/engine/save';
import { emptyMeta } from '../src/engine/newgame';

function screenNames(): string[] {
  const src = readFileSync(new URL('../src/ui/store.tsx', import.meta.url), 'utf8');
  const start = src.indexOf('export type ScreenName =');
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
}

function bars(mood: Mood, seed: number, count: number, intensity = 0): Bar[] {
  const c = createComposer(mood, seed);
  // a negative intensity sweeps it from 0 to 0.9 and back, like a battle swinging
  return Array.from({ length: count }, (_, i) => c.nextBar(intensity >= 0 ? intensity : (i % 10) / 10));
}

function pitches(e: MusicEvent): number[] {
  if (e.voice === 'aulos') return e.notes.map((n) => n.midi);
  if (e.voice === 'lyre' || e.voice === 'drone' || e.voice === 'pad') return [e.midi];
  return [];
}

const STINGS: StingKind[] = ['victory', 'defeat', 'hatch', 'week'];

describe('modes and the RNG', () => {
  it('maps scale degrees across octaves', () => {
    expect(degreeToMidi(50, 'hijaz', 0)).toBe(50);
    expect(degreeToMidi(50, 'hijaz', 1)).toBe(51); // the flat second
    expect(degreeToMidi(50, 'hijaz', 2)).toBe(54); // the major third
    expect(degreeToMidi(50, 'hijaz', 7)).toBe(62);
    expect(degreeToMidi(50, 'hijaz', -1)).toBe(48);
    expect(degreeToMidi(55, 'majorPenta', 5)).toBe(67);
    for (const mode of Object.keys(MODES) as (keyof typeof MODES)[]) {
      for (let d = -14; d <= 14; d++) expect(inMode(degreeToMidi(57, mode, d), 57, mode)).toBe(true);
    }
    expect(inMode(52, 50, 'hijaz')).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(makeRng(43).next()).not.toBe(xs[0]);
  });
});

describe('the motif grammar', () => {
  it('writes one-bar motifs and length-preserving variations', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const feel = rng.pick(['stately', 'dance', 'fast', 'slow'] as const);
      const m = makeMotif(rng, feel);
      expect(m.reduce((n, x) => n + x.len, 0)).toBeCloseTo(4, 6);
      for (const op of ['repeat', 'sequence', 'invert', 'retro', 'ornament', 'rhythm', 'tail'] as const) {
        const v = vary(rng, m, feel, op);
        expect(v.reduce((n, x) => n + x.len, 0)).toBeCloseTo(4, 6);
        expect(v.every((x) => x.len > 0 && Number.isInteger(x.d))).toBe(true);
      }
    }
  });

  it('builds calls that stay open and answers that cadence, with sane lengths', () => {
    const rng = makeRng(99);
    for (const mood of MOODS) {
      const spec = MOOD_SPECS[mood];
      const n = MODES[spec.mode].length;
      for (let i = 0; i < 60; i++) {
        const motif = makeMotif(rng, spec.feel);
        for (const role of ['call', 'answer', 'close'] as const) {
          const range = [-2, 9] as const;
          const ph = buildPhrase(rng, { mode: spec.mode, feel: spec.feel, phraseBars: spec.phraseBars, ornament: spec.ornament, range }, motif, role, rng.pick([0, 2, 4]));
          const beats = spec.phraseBars * 4;
          const last = ph[ph.length - 1];
          expect(ph.length).toBeGreaterThanOrEqual(2);
          expect(ph.length).toBeLessThanOrEqual(beats * 4);
          expect(ph.every((x) => x.len >= 0.125 - 1e-9)).toBe(true);
          expect(last.t + last.len).toBeLessThanOrEqual(beats - 0.25 + 1e-9);
          expect(last.t + last.len).toBeGreaterThanOrEqual(beats - 0.5 - 1e-9);
          for (let k = 1; k < ph.length; k++) expect(ph[k].t).toBeCloseTo(ph[k - 1].t + ph[k - 1].len, 9);
          // a leap larger than an octave never happens inside a phrase
          for (let k = 1; k < ph.length; k++) expect(Math.abs(ph[k].deg - ph[k - 1].deg)).toBeLessThanOrEqual(n + 3);
          const cls = ((last.deg % n) + n) % n;
          if (role === 'close') expect(cls).toBe(0);
          if (role === 'call') expect([1, 3, 4]).toContain(cls);
          if (role === 'answer') expect([0, 4]).toContain(cls);
        }
      }
    }
  });
});

describe('the composer', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    for (const mood of MOODS) {
      expect(JSON.stringify(bars(mood, 1234, 24, 0.5))).toBe(JSON.stringify(bars(mood, 1234, 24, 0.5)));
      expect(JSON.stringify(bars(mood, 1234, 24))).not.toBe(JSON.stringify(bars(mood, 4321, 24)));
    }
  });

  it('stays in mode, keeps events inside their bar and in a sane range', () => {
    for (const mood of MOODS) {
      const spec = MOOD_SPECS[mood];
      for (const seed of [1, 2, 3]) {
        for (const bar of bars(mood, seed, 64, mood === 'battle' ? -1 : 0)) {
          expect(bar.dur).toBeCloseTo((4 * 60) / spec.bpm, 9);
          let prev = 0;
          for (const e of bar.events) {
            expect(e.t).toBeGreaterThanOrEqual(0);
            expect(e.t).toBeLessThan(bar.dur);
            expect(e.t).toBeGreaterThanOrEqual(prev);
            prev = e.t;
            for (const v of e.voice === 'aulos' ? e.notes.map((x) => x.vel) : [e.vel]) {
              expect(v).toBeGreaterThan(0);
              expect(v).toBeLessThanOrEqual(1.1);
            }
            for (const m of pitches(e)) {
              expect(inMode(m, spec.root, spec.mode)).toBe(true);
              expect(m).toBeGreaterThanOrEqual(spec.root - 14);
              expect(m).toBeLessThanOrEqual(spec.root + 12 + 19);
            }
            if (e.voice === 'aulos') {
              expect(e.notes.length).toBeGreaterThan(0);
              const span = e.notes[e.notes.length - 1].t + e.notes[e.notes.length - 1].dur;
              expect(span).toBeLessThanOrEqual(spec.phraseBars * bar.dur + 0.05);
            }
          }
        }
      }
    }
  });

  it('never loops: lead phrases keep changing while the material recurs', () => {
    for (const mood of MOODS) {
      const lines = new Set<string>();
      let count = 0;
      for (const bar of bars(mood, 5, 96)) {
        for (const e of bar.events) {
          if (e.voice !== 'aulos') continue;
          count++;
          lines.add(e.notes.map((n) => `${n.midi}:${n.dur.toFixed(2)}`).join(' '));
        }
      }
      if (count > 4) expect(lines.size).toBeGreaterThan(count * 0.6);
    }
  });

  it('gives each mood its own tempo and density', () => {
    const rate = (mood: Mood, intensity = 0) => {
      const bs = bars(mood, 11, 48, intensity);
      const secs = bs.reduce((n, b) => n + b.dur, 0);
      const notes = bs.reduce((n, b) => n + b.events.reduce((k, e) => k + (e.voice === 'aulos' ? e.notes.length : 1), 0), 0);
      return notes / secs;
    };
    const r = Object.fromEntries(MOODS.map((m) => [m, rate(m)])) as Record<Mood, number>;
    expect(rate('battle', 1)).toBeGreaterThan(r.battle);
    expect(r.battle).toBeGreaterThan(r.arena);
    expect(r.battle).toBeGreaterThan(r.ludus);
    expect(r.ludus).toBeGreaterThan(r.nursery);
    for (const calm of ['nursery', 'night', 'lament'] as const) expect(r[calm]).toBeLessThan(r.ludus);
    expect(r.night).toBeLessThan(r.title);
    const bpm = (m: Mood) => MOOD_SPECS[m].bpm;
    expect(bpm('battle')).toBeGreaterThan(bpm('arena'));
    expect(bpm('arena')).toBeGreaterThan(bpm('ludus'));
    expect(bpm('ludus')).toBeGreaterThan(bpm('nursery'));
    expect(bpm('night')).toBeLessThan(bpm('nursery'));
    expect(bpm('lament')).toBeLessThan(bpm('night'));
  });

  it('growls only in the dark moods, and only now and then', () => {
    const growls = (mood: Mood) => bars(mood, 3, 60).reduce((n, b) => n + b.events.filter((e) => e.voice === 'growl').length, 0);
    expect(growls('night')).toBeGreaterThanOrEqual(3);
    expect(growls('night')).toBeLessThanOrEqual(12);
    expect(growls('lament')).toBeGreaterThanOrEqual(2);
    for (const m of ['title', 'ludus', 'nursery', 'arena', 'battle'] as const) expect(growls(m)).toBe(0);
  });

  it('builds the arena drums up from the big drum alone', () => {
    const bs = bars('arena', 8, 64);
    const frameIn = (from: number, to: number) => bs.slice(from, to).reduce((n, b) => n + b.events.filter((e) => e.voice === 'dum' || e.voice === 'tek').length, 0);
    expect(frameIn(0, 8)).toBe(0);
    expect(frameIn(16, 32)).toBeGreaterThan(0);
  });
});

describe('stings', () => {
  it('stay in key, are short and start after their sound effect', () => {
    for (const k of STINGS) {
      const s = stingEvents(k);
      expect(s.dur).toBeGreaterThan(1.5);
      expect(s.dur).toBeLessThan(6);
      expect(s.delay).toBeGreaterThan(0.2);
      expect(s.events.length).toBeGreaterThan(3);
      for (const e of s.events) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(s.dur);
        for (const m of pitches(e)) expect(inMode(m, s.root, s.mode)).toBe(true);
      }
    }
  });
});

describe('screen → mood', () => {
  it('maps every screen to a mood, in and out of a game', () => {
    const names = screenNames();
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      expect(SCREEN_MOOD).toHaveProperty(name);
      for (const inGame of [true, false]) {
        const m = moodFor({ stack: ['hub', name as never], inGame });
        expect(MOODS).toContain(m);
        const alone = moodFor({ stack: [name as never], inGame });
        expect(MOODS).toContain(alone);
      }
    }
    expect(Object.keys(SCREEN_MOOD).sort()).toEqual([...names].sort());
  });

  it('follows the game', () => {
    expect(moodFor({ stack: ['menu'], inGame: false })).toBe('title');
    expect(moodFor({ stack: ['settings'], inGame: false })).toBe('title');
    expect(moodFor({ stack: ['hub', 'settings'], inGame: true })).toBe('ludus');
    expect(moodFor({ stack: ['hub'], inGame: true })).toBe('ludus');
    expect(moodFor({ stack: ['hub', 'market'], inGame: true })).toBe('ludus');
    expect(moodFor({ stack: ['hub', 'breeding'], inGame: true })).toBe('nursery');
    expect(moodFor({ stack: ['hub', 'breeding', 'dino'], inGame: true })).toBe('nursery');
    expect(moodFor({ stack: ['hub', 'ludus', 'dino'], inGame: true })).toBe('ludus');
    expect(moodFor({ stack: ['hub', 'arena'], inGame: true })).toBe('arena');
    expect(moodFor({ stack: ['hub', 'arenaPlay'], inGame: true })).toBe('arena');
    expect(moodFor({ stack: ['hub', 'arenaPlay'], inGame: true, battle: true })).toBe('battle');
    expect(moodFor({ stack: ['hub', 'horde'], inGame: true })).toBe('night');
    expect(moodFor({ stack: ['hub', 'intrigue'], inGame: true, holds: ['night'] })).toBe('night');
    expect(moodFor({ stack: ['hub', 'intrigue'], inGame: true, holds: ['night'], battle: true })).toBe('battle');
    expect(moodFor({ stack: ['defeated'], inGame: true })).toBe('lament');
    expect(moodFor({ stack: [], inGame: false })).toBe('title');
  });
});

describe('the live controller without WebAudio', () => {
  it('never throws in node and reports that nothing runs', () => {
    expect(() => {
      const off = initMusic();
      setMusicEnabled(true);
      setMusicMood('battle');
      setMusicVolume(0.3);
      setMusicIntensity(0.9);
      musicSting('victory');
      setMusicEnabled(false);
      off();
    }).not.toThrow();
    const s = musicState();
    expect(s.running).toBe(false);
    expect(s.playing).toBeNull();
    expect(s.mood).toBe('battle');
  });
});

describe('settings migration', () => {
  it('turns the music on once for metas saved with the placeholder switch', () => {
    const fresh = emptyMeta();
    expect(fresh.settings.music).toBe(true);
    expect(fresh.settings.musicVolume).toBeGreaterThan(0);
    const old = { ...fresh, settings: { sound: false, music: false, battleSpeed: 2, tooltips: false, reduceMotion: true, theme: 'dark' } };
    const m = migrateMeta(JSON.parse(JSON.stringify(old)));
    expect(m.settings).toMatchObject({ music: true, musicVolume: fresh.settings.musicVolume, sfxVolume: 1, sound: false, battleSpeed: 2, theme: 'dark', reduceMotion: true });
    // once the volume is stored, an explicit "off" sticks
    const later = migrateMeta(JSON.parse(JSON.stringify({ ...m, settings: { ...m.settings, music: false, musicVolume: 0.25 } })));
    expect(later.settings.music).toBe(false);
    expect(later.settings.musicVolume).toBe(0.25);
    expect(migrateMeta(null).settings.music).toBe(true);
    expect(migrateMeta({ amber: 9 }).amber).toBe(9);
  });
});
