// Settings dialog [MainActivity settings]: theme, sound, battle speed, reduce motion, tooltips.
import React from 'react';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Field, Hint, Panel, Plaque, Segmented, Toggle } from '../components/primitives';
import { sfx, setSoundEnabled } from '../audio';

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
        <Panel label="Audio" title="Sound">
          <Toggle id="settings-sound" checked={s.sound} onChange={(sound) => { store.setSettings({ sound }); setSoundEnabled(sound); if (sound) window.setTimeout(() => sfx.coin(), 30); }} label="Sound effects" desc="Taps, coins, arena drums, hits, roars and the crowd. All synthesised in the browser." />
          <Toggle id="settings-music" checked={s.music} onChange={(music) => store.setSettings({ music })} label="Music" desc="Not in the game yet; the switch is remembered for when it arrives." />
        </Panel>
        <Panel label="About" title="Jurassic Ludus">
          <p className="small">A browser remake of Gladiator Manager&rsquo;s systems, with dinosaurs instead of gladiators and ARK: Survival Evolved breeding. Saves stay in this browser; use Export save to move them.</p>
          {!store.storageOk && <Hint icon="warning">This browser is not keeping saves. Export your game before closing the page.</Hint>}
        </Panel>
      </div>
    </div>
  );
}
