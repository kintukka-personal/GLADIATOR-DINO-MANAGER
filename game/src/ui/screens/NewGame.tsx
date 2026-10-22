// New game wizard [NewGame + HeritageActivity + Advanced settings + AscensionActivity].
import React, { useMemo, useState } from 'react';
import type { DifficultyKey, Heritage } from '../../engine/types';
import { createNewGame, RESERVED_NAMES, type NewGameOptions } from '../../engine/newgame';
import { selectableAscension, ASCENSION_LEVELS } from '../../engine/ascension';
import { slotSummaries, SLOTS } from '../../engine/save';
import { UPGRADES } from '../../engine/upgrades';
import { useStore } from '../store';
import { Btn, Field, Hint, Panel, Plaque, Segmented, Toggle } from '../components/primitives';
import { Icon } from '../components/Icon';
import { Portrait } from '../art/Portrait';
import { DinoThumb } from '../art/DinoArt';
import { MenuHero } from './MainMenu';
import { buildDevFixture } from '../devFixture';
import { friendlyError, safe } from '../safe';

const HERITAGES: { id: Heritage; name: string; item: string; desc: string; upgrade?: 'greekHeritage' | 'egyptianAncestry' }[] = [
  { id: 'roman', name: 'Roman', item: 'Shoddy Light Harness', desc: '+20% to every influence gain. Iguanodons warm to you.' },
  { id: 'punic', name: 'Punic', item: 'Old Carthaginian Crest', desc: 'A descendant of Carthage: +100 denarii and +1 per miner each week. Troodons are loyal.' },
  { id: 'celtic', name: 'Celtic', item: 'Old Horned Helm', desc: 'Training is 20% more effective. Triceratops and Tyrannosaurs respect you.' },
  { id: 'greek', name: 'Greek', item: 'Old Bash Plate', desc: 'Dinos gain traits twice as often. Ankylosaurs and Stegosaurs thrive.', upgrade: 'greekHeritage' },
  { id: 'egyptian', name: 'Egyptian', item: 'Shoddy Quilted Barding', desc: 'Rivals warm to you over time; extra keepers at the market. The Tomb of the Pharaoh awaits.', upgrade: 'egyptianAncestry' },
];

export function NewGameScreen() {
  const store = useStore();
  const m = store.meta;
  const slots = useMemo(() => slotSummaries(), []);
  const pref = Number(store.screen.id);
  const [step, setStep] = useState(0);
  const [lanista, setLanista] = useState('');
  const [ludusName, setLudusName] = useState('');
  const [female, setFemale] = useState(false);
  const [heritage, setHeritage] = useState<Heritage>('roman');
  const [hard, setHard] = useState(false);
  const [nightmare, setNightmare] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [raidsOff, setRaidsOff] = useState(false);
  const [breakoutsOff, setBreakoutsOff] = useState(false);
  const [asc, setAsc] = useState(0);
  const [rein, setRein] = useState<'young' | 'old'>('young');
  const [slot, setSlot] = useState<number>(pref >= 1 && pref <= SLOTS ? pref : (slots.findIndex((s) => !s) + 1 || 1));

  const nameErr = !lanista.trim() ? 'Your lanista needs a name.' : RESERVED_NAMES.includes(lanista.trim().toLowerCase()) ? 'That name belongs to someone in Capua already.' : lanista.length > 16 ? 'At most 16 characters.' : null;
  const diff: DifficultyKey = nightmare ? 'nightmare' : hard ? 'hard' : 'normal';
  const maxAsc = safe(() => selectableAscension(m, diff), m.ascension[diff] ?? 0);
  const champ = m.champions[diff] ?? m.champions.hard ?? m.champions.normal;
  const hasNightmare = m.upgrades.includes('nightmareMode');
  const ascVal = Math.min(asc, maxAsc);

  const create = () => {
    const o: NewGameOptions = {
      lanista: lanista.trim(), ludusName: ludusName.trim() || undefined, female, heritage, hard: hard || nightmare, nightmare, sandbox,
      raidsDisabled: raidsOff, betrayalsDisabled: breakoutsOff, ascension: ascVal, slot, reincarnation: ascVal > 0 && champ ? rein : undefined,
    };
    try {
      const g = createNewGame(o, m);
      store.startGame(g, false);
      store.toast(`Welcome to Capua, ${female ? 'domina' : 'dominus'} ${o.lanista}.`, 'good');
    } catch (e) {
      const g = buildDevFixture(o, m);
      g.slot = slot;
      store.startGame(g, true);
      store.toast(`The new-game builder is not ready (${friendlyError(e)}). You are playing on development data.`, 'warn');
    }
  };

  const steps = ['Lanista', 'Heritage', 'Rules'];
  return (
    <div className="menu-screen">
      <MenuHero small />
      <div className="menu-body" style={{ maxWidth: 680 }}>
        <div className="row gap-2 mb-2">
          <Btn id="ng-back" variant="ghost" icon="back" onClick={() => (step ? setStep(step - 1) : store.nav.pop())}>{step ? 'Back' : 'Menu'}</Btn>
          <div className="grow right micro">Step {step + 1} of 3 · {steps[step]}</div>
        </div>
        <div className="wizard-steps" aria-hidden="true">{steps.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

        {step === 0 && (
          <div className="stack">
            <Plaque>
              <div className="story-intro">
                <p>Capua, 73 BC. After an incident in your hometown that nobody mentions twice, you arrive with a purse of coin and a deed to a modest ludus: an empty pen, a few keepers, and a sand yard that still smells of the last owner&rsquo;s raptors.</p>
                <p className="muted small">Buy, breed, raise and fight dinos. Climb the Senate. Survive Spartacus.</p>
              </div>
            </Plaque>
            <Panel label="You" title="The lanista">
              <div className="stack">
                <Field id="ng-lanista" label="Name (16 characters)" error={lanista && nameErr ? nameErr : undefined}>
                  <input id="ng-lanista" className="input" maxLength={16} value={lanista} onChange={(e) => setLanista(e.target.value)} placeholder="Quintus" autoComplete="off" />
                </Field>
                <Field id="ng-ludus" label="Ludus name" help={`Leave empty for "House ${lanista.trim() || 'Quintus'}".`}>
                  <input id="ng-ludus" className="input" maxLength={24} value={ludusName} onChange={(e) => setLudusName(e.target.value)} placeholder={`House ${lanista.trim() || 'Quintus'}`} autoComplete="off" />
                </Field>
                <div className="field">
                  <span className="field-label micro">Portrait</span>
                  <div className="row gap-2">
                    {[false, true].map((f) => (
                      <button key={String(f)} id={`ng-portrait-${f ? 'f' : 'm'}`} type="button" className={`choice${female === f ? ' on' : ''}`} style={{ minHeight: 0, alignItems: 'center', flex: '0 0 auto', width: 112 }} onClick={() => setFemale(f)} aria-pressed={female === f}>
                        <Portrait actor={f ? 'player-f' : 'player-m'} size={64} />
                        <span className="small strong">{f ? 'Domina' : 'Dominus'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
            <Btn id="ng-next" variant="primary" size="lg" block iconRight="arrow" disabled={!!nameErr} onClick={() => setStep(1)}>Choose a heritage</Btn>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h2>Your heritage</h2>
            <div className="choice-grid">
              {HERITAGES.map((h) => {
                const locked = !!h.upgrade && !m.upgrades.includes(h.upgrade);
                return (
                  <button key={h.id} id={`ng-heritage-${h.id}`} type="button" className={`choice${heritage === h.id ? ' on' : ''}`} disabled={locked} onClick={() => setHeritage(h.id)} aria-pressed={heritage === h.id}>
                    {locked && <span className="choice-lock"><Icon name="lock" size={18} /></span>}
                    <span className="choice-title">{h.name}</span>
                    <span className="small">{h.desc}</span>
                    <span className="xs muted">Starts with: {h.item}</span>
                    {locked && <span className="xs bad">Needs the {UPGRADES[h.upgrade!]?.name ?? (h.upgrade === 'greekHeritage' ? 'Greek Heritage' : 'Egyptian Ancestry')} upgrade</span>}
                  </button>
                );
              })}
            </div>
            <Btn id="ng-next2" variant="primary" size="lg" block iconRight="arrow" onClick={() => setStep(2)}>Rules of the house</Btn>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <Panel label="Difficulty" title={nightmare ? 'Nightmare' : hard ? 'Hard' : 'Normal'}>
              <Toggle id="ng-hard" checked={hard || nightmare} disabled={nightmare} onChange={setHard} label="Hard" desc="Richer rivals, a faster Horde, 800 starting denarii." />
              <Toggle id="ng-nightmare" checked={nightmare} disabled={!hasNightmare} onChange={setNightmare} label={<span className="row gap-1">{!hasNightmare && <Icon name="lock" size={14} />}Nightmare</span>} desc={hasNightmare ? 'Crassus is in town. Good luck.' : 'Needs the Nightmare Mode upgrade (earn Divine on Hard).'} />
              <Toggle id="ng-sandbox" checked={sandbox} onChange={setSandbox} label="Sandbox" desc="+5000 denarii and +200 influence; no achievements or highscores." />
              <Toggle id="ng-raids" checked={raidsOff || sandbox} disabled={sandbox} onChange={setRaidsOff} label="No raids" desc="Rivals and the Horde never raid your ludus." />
              <Toggle id="ng-breakouts" checked={breakoutsOff || sandbox} disabled={sandbox} onChange={setBreakoutsOff} label="No breakouts" desc="Dinos never escape, however wild." />
            </Panel>
            <Panel label="Ascension" title={ascVal ? `Ascension ${ascVal}` : 'No ascension'}>
              {maxAsc === 0 ? (
                <p className="small muted">Win the Ascension tournament to unlock god-modified reruns for this difficulty.</p>
              ) : (
                <div className="stack-sm">
                  <Field id="ng-asc" label="Level">
                    <select id="ng-asc" className="select" value={ascVal} onChange={(e) => setAsc(Number(e.target.value))}>
                      {Array.from({ length: maxAsc + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'None' : `${i} · ${ASCENSION_LEVELS[i - 1]?.god ?? ''} ${ASCENSION_LEVELS[i - 1]?.name ?? ''}`}</option>)}
                    </select>
                  </Field>
                  {ascVal > 0 && ASCENSION_LEVELS[ascVal - 1] && <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{ASCENSION_LEVELS[ascVal - 1].summary.map((s) => <li key={s}>{s}</li>)}</ul>}
                  {ascVal > 0 && champ && (
                    <div className="row gap-3 mt-1">
                      <DinoThumb creature={champ.creature} size={64} />
                      <div className="grow">
                        <div className="strong">{champ.creature.name} returns</div>
                        <Segmented id="ng-rein" label="Reincarnation" value={rein} onChange={setRein} options={[{ value: 'young', label: 'Young' }, { value: 'old', label: 'Old' }]} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
            <Panel label="Save" title={`Slot ${slot}`}>
              <Field id="ng-slot" label="Save slot" help={slots[slot - 1] ? <span className="bad">This replaces {slots[slot - 1]!.ludus} (week {slots[slot - 1]!.week}).</span> : 'Empty slot.'}>
                <select id="ng-slot" className="select" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                  {slots.map((s, i) => <option key={i} value={i + 1}>Slot {i + 1}{s ? `: ${s.ludus}, week ${s.week}` : ': empty'}</option>)}
                </select>
              </Field>
            </Panel>
            {sandbox && <Hint icon="info">Sandbox runs do not earn achievements.</Hint>}
            <Btn id="ng-create" variant="primary" size="lg" block icon="gate" disabled={!!nameErr} onClick={create}>Found the ludus</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
