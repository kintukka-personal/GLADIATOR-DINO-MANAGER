// Drives the music from the app shell: moodFor() (musicLogic.ts) over the store's screen stack, the battle
// overlay and any mood an open sheet holds, plus Settings → Music and Music volume. Sheets that are scenes of
// their own (the intrigue night scene, a rival's scheme, a raid decision) call useMoodHold('night') while open.
import { useEffect, useSyncExternalStore } from 'react';
import type { Store } from './store';
import { moodFor, type Mood } from './musicLogic';
import { DEFAULT_MUSIC_VOLUME, initMusic, setMusicEnabled, setMusicMood, setMusicVolume } from './music';

let holds: { id: number; mood: Mood }[] = [];
let snapshot: readonly Mood[] = [];
let seq = 0;
const subs = new Set<() => void>();

function emit(): void {
  snapshot = holds.map((h) => h.mood);
  for (const f of [...subs]) f();
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

const getSnapshot = () => snapshot;

/** While the calling component is mounted (and `mood` is set), its mood plays over the screen's. */
export function useMoodHold(mood: Mood | null | undefined | false): void {
  useEffect(() => {
    if (!mood) return undefined;
    const id = ++seq;
    holds = [...holds, { id, mood }];
    emit();
    return () => {
      holds = holds.filter((h) => h.id !== id);
      emit();
    };
  }, [mood]);
}

/** Mounted once by the shell. */
export function useMusicDirector(store: Store): void {
  const held = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const s = store.meta.settings;
  const mood = moodFor({ stack: store.stack.map((r) => r.name), inGame: !!store.game, battle: !!store.battle, holds: held });
  // the setters only record until initMusic runs, so it goes last and starts with the right settings
  useEffect(() => setMusicEnabled(s.music !== false), [s.music]);
  useEffect(() => setMusicVolume(s.musicVolume ?? DEFAULT_MUSIC_VOLUME), [s.musicVolume]);
  useEffect(() => setMusicMood(mood), [mood]);
  useEffect(() => initMusic(), []);
}
