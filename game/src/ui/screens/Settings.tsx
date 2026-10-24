// Settings dialog [MainActivity settings]: theme, sound and music (with volumes), battle speed, reduce motion, tooltips.
import React from 'react';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Field, Hint, Panel, Plaque, Segmented, Toggle } from '../components/primitives';
import { sfx, setEffectsVolume, setSoundEnabled } from '../audio';
import { DEFAULT_MUSIC_VOLUME } from '../music';

export function SettingsScreen() {
  const store = useStore();
  const s = store.meta.settings;
  const wrap = !store.game ? { maxWidth: 680, margin: '0 auto', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' } : undefined;
  return (
    <div style={wrap}>
      <ScreenHead title="Settings" />
      <div className="cols">
        <Plaque label="Display" title="Look and feel">
          <Field id="settings-theme" label="Theme">
            <Segmented id="settings-theme" label="Theme" value={s.theme} onChange={(theme) => store.setSettings({ theme })}
              options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Torchlight' }, { value: 'light', label: 'Daylight' }]} />
          </Field>
          <Toggle id="settings-motion" checked={s.reduceMotion} onChange={(reduceMotion) => store.setSettings({ reduceMotion })} label="Reduce motion" desc="No breathing sprites, shakes, flickering torches or typewriter text." />
          <Toggle id="settings-tooltips" checked={s.tooltips} onChange={(tooltips) => store.setSettings({ tooltips })} label="Tips" desc="Show the small blue hints on each screen." />
        </Plaque>
        <Panel label="Battles" title="Playback">
          <Field id="settings-speed" label="Default battle speed">
            <Segmented id="settings-speed" label="Battle speed" value={String(s.battleSpeed) as '1' | '2' | '4'} onChange={(v) => store.setSettings({ battleSpeed: Number(v) as 1 | 2 | 4 })}
              options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />
          </Field>
        </Panel>
        <Panel label="Audio" title="Sound and music">
          <Toggle id="settings-sound" checked={s.sound} onChange={(sound) => { store.setSettings({ sound }); setSoundEnabled(sound); if (sound) window.setTimeout(() => sfx.coin(), 30); }} label="Sound effects" desc="Taps, coins, arena drums, hits, roars and the crowd. All synthesised in the browser." />
          <Volume id="settings-sfx-volume" label="Effects volume" value={s.sfxVolume ?? 1} disabled={!s.sound}
            onChange={(sfxVolume) => { store.setSettings({ sfxVolume }); setEffectsVolume(sfxVolume); }} onRelease={() => sfx.coin()} />
          <Toggle id="settings-music" checked={s.music} onChange={(music) => store.setSettings({ music })} label="Music" desc="Lyre, aulos and frame drums, composed live in the browser and never quite the same twice. It follows the game: warm in the ludus, tense in the arena, dark at night." />
          <Volume id="settings-music-volume" label="Music volume" value={s.musicVolume ?? DEFAULT_MUSIC_VOLUME} disabled={!s.music}
            onChange={(musicVolume) => store.setSettings({ musicVolume })} />
        </Panel>
        <Panel label="About" title="Jurassic Ludus">
          <p className="small">A browser remake of Gladiator Manager&rsquo;s systems, with dinosaurs instead of gladiators and ARK: Survival Evolved breeding. Saves stay in this browser; use Export save to move them.</p>
          {!store.storageOk && <Hint icon="warning">This browser is not keeping saves. Export your game before closing the page.</Hint>}
        </Panel>
      </div>
    </div>
  );
}

function Volume({ id, label, value, disabled, onChange, onRelease }: { id: string; label: string; value: number; disabled?: boolean; onChange: (v: number) => void; onRelease?: () => void }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <Field id={id} label={<span className="row between"><span>{label}</span><span className="num">{pct}%</span></span>}>
      <input id={id} type="range" className="range" min={0} max={100} step={5} value={pct} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)} onPointerUp={onRelease} onKeyUp={onRelease} />
    </Field>
  );
}
