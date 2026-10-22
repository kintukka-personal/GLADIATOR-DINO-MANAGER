// Main menu [MainActivity] and its sub-screens: Load [SaveSlotActivity], Upgrades [UpgradesActivity],
// Achievements, Hall of Fame, Export/Import save.
import React, { useMemo, useRef, useState } from 'react';
import type { AchievementId, GameState, UpgradeId } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { deleteGame, exportString, importString, loadGame, saveGame, slotSummaries, SLOTS, type SlotSummary } from '../../engine/save';
import { UPGRADES, amberBalance, buyUpgrade, refundUpgrades, upgradeAvailable, type UpgradeDef } from '../../engine/upgrades';
import { ACHIEVEMENTS } from '../../engine/achievements';
import { useStore, isDevGame } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Amber, Btn, EmptyState, Field, Hint, Panel, Pill, Plaque, Segmented } from '../components/primitives';
import { Icon, type IconName } from '../components/Icon';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { safe, friendlyError } from '../safe';
import { camelToWords, fmt } from '../format';

function latestSlot(list: (SlotSummary | null)[]): SlotSummary | null {
  return list.filter((x): x is SlotSummary => !!x && !x.over).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
}

function MenuItem({ id, icon, label, sub, right, onClick, primary, disabled }: { id: string; icon: IconName; label: string; sub?: React.ReactNode; right?: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" id={id} className={`menu-item${primary ? ' primary' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={22} />
      <span>{label}{sub && <span className="mi-sub">{sub}</span>}</span>
      <span className="mi-right">{right}<Icon name="chevronRight" size={18} /></span>
    </button>
  );
}

export function MenuHero({ small }: { small?: boolean }) {
  return (
    <div className="menu-hero" style={small ? { minHeight: 200 } : undefined}>
      <div className="lockup lockup-big">
        <span className="lockup-top">JURASSIC</span>
        <span className="lockup-main">Lud<em>u</em>s</span>
      </div>
      <p className="tagline">Capua, 73 BC. Rome never lost the great saurians.</p>
      <div className="menu-hero-art" aria-hidden="true">
        <span style={{ marginRight: -40, marginBottom: 2 }}><DinoArt species="velociraptor" colors={[10, 4, 12, 15, 8, 18]} width={small ? 120 : 170} seed="menu-raptor" /></span>
        <span style={{ zIndex: 2 }}><DinoArt species="tyrannosaurus" colors={[8, 9, 1, 14, 7, 36]} width={small ? 210 : 300} seed="menu-rex" /></span>
        <span style={{ marginLeft: -50 }}><DinoArt species="triceratops" colors={[9, 4, 7, 16, 8, 11]} width={small ? 150 : 210} flip seed="menu-trike" /></span>
      </div>
    </div>
  );
}

export function MainMenu() {
  const store = useStore();
  const slots = useMemo(() => slotSummaries(), [store.v]);
  const latest = latestSlot(slots);
  const m = store.meta;
  const amber = safe(() => amberBalance(m), m.amber);
  const cont = () => {
    if (!latest) return;
    const g = loadGame(latest.slot);
    if (!g) { store.toast('That save could not be read.', 'bad'); return; }
    store.startGame(g, isDevGame(g));
  };
  return (
    <div className="menu-screen">
      <MenuHero />
      <div className="menu-body">
        <div className="menu-list">
          {latest && <MenuItem id="menu-continue" primary icon="advance" label="Continue" sub={`${latest.ludus} · week ${latest.week} · ${latest.mode}`} onClick={cont} />}
          <MenuItem id="menu-new" primary={!latest} icon="plus" label="New game" sub="Found a ludus in Capua" onClick={() => store.nav.push({ name: 'newgame' })} />
          <MenuItem id="menu-load" icon="save" label="Load game" sub={`${slots.filter(Boolean).length} of ${SLOTS} slots used`} onClick={() => store.nav.push({ name: 'load' })} />
          <MenuItem id="menu-upgrades" icon="sparkle" label="Upgrades" right={<Amber value={amber} />} onClick={() => store.nav.push({ name: 'upgrades' })} />
          <MenuItem id="menu-achievements" icon="trophy" label="Achievements" right={<span className="num">{m.achievements.length}</span>} onClick={() => store.nav.push({ name: 'achievements' })} />
          <MenuItem id="menu-hof" icon="laurel" label="Hall of Fame" right={<span className="num">{m.hallOfFame.length}</span>} onClick={() => store.nav.push({ name: 'halloffame' })} />
          <MenuItem id="menu-codex" icon="book" label="Codex" sub="Species, stats, breeding, keepers" onClick={() => store.nav.push({ name: 'codex' })} />
          <MenuItem id="menu-settings" icon="gear" label="Settings" onClick={() => store.nav.push({ name: 'settings' })} />
          <MenuItem id="menu-transfer" icon="copy" label="Export / import save" onClick={() => store.nav.push({ name: 'transfer' })} />
        </div>
        <p className="xs muted center mt-4">A dinosaur fighting school with ARK-style breeding, built on the systems of Gladiator Manager. No real money anywhere: Amber comes from achievements.</p>
      </div>
    </div>
  );
}

function BareWrap({ title, sub, children, actions }: { title: string; sub?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }) {
  const store = useStore();
  const inGame = !!store.game;
  return (
    <div style={inGame ? undefined : { maxWidth: 760, margin: '0 auto', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <ScreenHead title={title} sub={sub} actions={actions} />
      {children}
    </div>
  );
}

export function LoadScreen() {
  const store = useStore();
  const [v, setV] = useState(0);
  const slots = useMemo(() => slotSummaries(), [v, store.v]);
  const load = (n: number) => {
    const g = loadGame(n);
    if (!g) { store.toast('That save could not be read.', 'bad'); return; }
    store.startGame(g, isDevGame(g));
  };
  const del = async (s: SlotSummary) => {
    const ok = await store.confirm({ title: `Delete slot ${s.slot}?`, text: <>{s.ludus}, week {s.week}. This cannot be undone.</>, confirmLabel: 'Delete', danger: true });
    if (ok) { deleteGame(s.slot); setV((x) => x + 1); store.toast('Save deleted.', 'info'); }
  };
  return (
    <BareWrap title="Load game" sub={`${SLOTS} save slots`}>
      <Plaque flush>
        {slots.map((s, i) => (
          <div key={i} className="slot">
            <span className="slot-num">{i + 1}</span>
            {s ? (
              <div style={{ minWidth: 0 }}>
                <div className="strong ellipsis">{s.ludus}</div>
                <div className="xs muted">Lanista {s.lanista} · week {s.week} · {s.mode}{s.ascension ? ` · Ascension ${s.ascension}` : ''}{s.over ? ' · fallen' : ''}</div>
                <div className="row gap-2 mt-1 xs"><span className="money"><Icon name="coin" size={13} />{fmt(s.denarii)}</span><span className="influence"><Icon name="laurel" size={13} />{fmt(s.influence)}</span><span className="muted">saved {new Date(s.savedAt).toLocaleDateString()}</span></div>
              </div>
            ) : (
              <div className="muted">Empty slot</div>
            )}
            <div className="row gap-1">
              {s ? (
                <>
                  <Btn id={`load-${i + 1}`} size="sm" variant="primary" onClick={() => load(s.slot)}>Load</Btn>
                  <Btn id={`del-${i + 1}`} size="sm" variant="ghost" icon="close" aria-label="Delete save" onClick={() => del(s)} />
                </>
              ) : (
                <Btn size="sm" onClick={() => store.nav.push({ name: 'newgame', id: String(i + 1) })}>New</Btn>
              )}
            </div>
          </div>
        ))}
      </Plaque>
    </BareWrap>
  );
}

const CATS: { id: UpgradeDef['category']; label: string }[] = [
  { id: 'breeding', label: 'Breeding' }, { id: 'creatures', label: 'Dinos & techniques' }, { id: 'general', label: 'General' },
  { id: 'events', label: 'Events' }, { id: 'equipment', label: 'Equipment' }, { id: 'buildings', label: 'Buildings' },
];

export function UpgradesScreen() {
  const store = useStore();
  const m = store.meta;
  const [cat, setCat] = useState<UpgradeDef['category']>('breeding');
  const list = (Object.values(UPGRADES) as UpgradeDef[]).filter((u) => u.category === cat);
  const amber = safe(() => amberBalance(m), m.amber);
  const any = Object.keys(UPGRADES).length > 0;
  const buy = (id: UpgradeId) => {
    store.actMeta((mm) => buyUpgrade(mm, id), `${UPGRADES[id].name} unlocked.`);
  };
  const refund = async () => {
    const ok = await store.confirm({ title: 'Refund every upgrade?', text: 'All Amber spent on upgrades comes back. Games in progress keep what they already have.', confirmLabel: 'Refund' });
    if (ok) store.actMeta((mm) => { refundUpgrades(mm); return null; }, 'Upgrades refunded.');
  };
  return (
    <BareWrap title="Upgrades" sub="Permanent unlocks for every future run" actions={<Amber value={amber} />}>
      {!any ? (
        <Plaque><EmptyState icon="sparkle" title="The amber vault is closed">Upgrades are still being catalogued. Earn Amber from achievements meanwhile.</EmptyState></Plaque>
      ) : (
        <>
          <div className="mb-3" style={{ overflowX: 'auto' }}>
            <Segmented id="up-cat" label="Category" size="sm" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c.id, label: c.label }))} />
          </div>
          <Panel flush>
            {list.map((u) => {
              const owned = m.upgrades.includes(u.id);
              const why = owned ? null : safe(() => upgradeAvailable(m, u.id), 'Unavailable');
              const locked = !owned && !!why && !why.startsWith('Needs ');
              return (
                <div key={u.id} className={`tech${locked ? ' locked' : ''}`}>
                  <div>
                    <div className="tech-name">{owned ? <Icon name="check" size={16} className="good" /> : locked ? <Icon name="lock" size={14} /> : <Icon name="sparkle" size={14} className="amber" />}<span>{u.name}</span></div>
                    <div className="tech-desc">{u.desc}</div>
                    {!owned && why && <div className={`xs mt-1 ${locked ? 'bad' : 'muted'}`}>{why}</div>}
                  </div>
                  {owned ? <Pill tone="good">Owned</Pill> : <Btn id={`buy-up-${u.id}`} size="sm" variant={why ? 'default' : 'primary'} disabled={!!why} onClick={() => buy(u.id)}><Amber value={u.cost} /></Btn>}
                </div>
              );
            })}
          </Panel>
          {m.upgrades.length > 0 && <div className="row end mt-3"><Btn size="sm" variant="ghost" onClick={refund}>Refund all upgrades</Btn></div>}
        </>
      )}
    </BareWrap>
  );
}

export function AchievementsScreen() {
  const store = useStore();
  const m = store.meta;
  const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
  const earned = new Set(m.achievements);
  return (
    <BareWrap title="Achievements" sub={`${m.achievements.length} earned${ids.length ? ` of ${ids.length}` : ''}`} actions={<Amber value={m.amber} />}>
      {ids.length === 0 && m.achievements.length === 0 && <Plaque><EmptyState icon="trophy" title="No achievements yet">Every achievement pays Amber, the only currency for upgrades.</EmptyState></Plaque>}
      <Panel flush>
        {(ids.length ? ids : m.achievements).map((id) => {
          const d = ACHIEVEMENTS[id];
          const got = earned.has(id);
          const hidden = d?.hidden && !got;
          return (
            <div key={id} className={`tech${got ? '' : ' locked'}`}>
              <div>
                <div className="tech-name">{got ? <Icon name="trophy" size={16} className="amber" /> : <Icon name="lock" size={14} />}<span>{hidden ? 'Hidden achievement' : d?.name ?? camelToWords(id)}</span></div>
                <div className="tech-desc">{hidden ? 'Keep playing to discover it.' : d?.desc}</div>
              </div>
              <Amber value={d?.amber ?? 50} />
            </div>
          );
        })}
      </Panel>
    </BareWrap>
  );
}

export function HallOfFameScreen() {
  const store = useStore();
  const m = store.meta;
  return (
    <BareWrap title="Hall of Fame" sub="Champions of every run">
      {m.hallOfFame.length === 0 ? (
        <Plaque><EmptyState icon="laurel" title="No legends yet">Famous dinos are inducted here from the week report. They return as foes in the Legends tournaments.</EmptyState></Plaque>
      ) : (
        <Panel flush>
          {[...m.hallOfFame].sort((a, b) => b.fame - a.fame).map((h) => (
            <div key={h.id} className="crow">
              <DinoThumb creature={h.creature} size={52} />
              <div className="crow-main">
                <div className="crow-name"><span className="nm">{h.name}</span></div>
                <div className="crow-sub">{SPECIES[h.species]?.name} · level {h.level} · fame {h.fame}</div>
                <div className="xs muted">{h.lanista} · week {h.week} · {camelToWords(h.difficulty)}{h.ascension ? ` · Ascension ${h.ascension}` : ''}</div>
              </div>
              <div className="crow-right">{h.tier > 0 && <Pill tone="amber" icon="trophy">Tier {h.tier}</Pill>}</div>
            </div>
          ))}
        </Panel>
      )}
      {m.highscores.length > 0 && (
        <Panel className="mt-3" label="Highscores" title="Best runs" flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Lanista</th><th className="num">Score</th><th className="num">Influence</th><th className="num">Week</th><th>Mode</th></tr></thead>
              <tbody>{[...m.highscores].sort((a, b) => b.score - a.score).slice(0, 20).map((s, i) => <tr key={i}><td>{s.name}</td><td className="num strong">{fmt(s.score)}</td><td className="num">{fmt(s.influence)}</td><td className="num">{s.week}</td><td className="muted">{camelToWords(s.difficulty)}{s.alive ? '' : ' · fallen'}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
      )}
    </BareWrap>
  );
}

export function TransferScreen() {
  const store = useStore();
  const g = store.game;
  const slots = useMemo(() => slotSummaries(), [store.v]);
  const firstUsed = slots.find(Boolean)?.slot ?? 1;
  const [from, setFrom] = useState<number>(g?.slot ?? firstUsed);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<number>(slots.findIndex((s) => !s) + 1 || 1);
  const out = useMemo(() => {
    try {
      const src = g ?? (slots[from - 1] ? loadGame(from) : null);
      return src ? exportString(src) : '';
    } catch {
      return '';
    }
  }, [g, from, slots, store.v]);
  const outRef = useRef<HTMLTextAreaElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(out);
      store.toast('Save copied to the clipboard.', 'good');
    } catch {
      outRef.current?.focus();
      outRef.current?.select();
      store.toast('Copying is blocked here: the text is selected, copy it by hand.', 'warn');
    }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result ?? ''));
    r.readAsText(f);
  };
  const doImport = async () => {
    let s: GameState;
    try {
      s = importString(text);
    } catch (e) {
      store.toast(`That is not a valid save: ${friendlyError(e)}`, 'bad');
      return;
    }
    if (slots[target - 1]) {
      const ok = await store.confirm({ title: `Overwrite slot ${target}?`, text: `${slots[target - 1]!.ludus}, week ${slots[target - 1]!.week} will be replaced.`, confirmLabel: 'Overwrite', danger: true });
      if (!ok) return;
    }
    s.slot = target;
    saveGame(s);
    store.toast(`Imported ${s.player.ludus.name} into slot ${target}.`, 'good');
    store.startGame(s, isDevGame(s));
  };
  return (
    <BareWrap title="Export / import" sub="Move a ludus between browsers">
      <div className="cols">
        <Plaque label="Export" title={g ? g.player.ludus.name : 'Choose a slot'}>
          {!g && (
            <Field id="tx-from" label="Slot">
              <select id="tx-from" className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
                {slots.map((s, i) => <option key={i} value={i + 1} disabled={!s}>{i + 1}: {s ? `${s.ludus}, week ${s.week}` : 'empty'}</option>)}
              </select>
            </Field>
          )}
          <Field id="tx-out" label="Save text">
            <textarea id="tx-out" ref={outRef} className="textarea" readOnly value={out} placeholder="Nothing to export" onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <Btn id="tx-copy" className="mt-2" variant="primary" icon="copy" disabled={!out} onClick={copy}>Copy</Btn>
          <Hint>Keep the text somewhere safe. Paste it into Import on any device to continue.</Hint>
        </Plaque>
        <Panel label="Import" title="Paste or open a save">
          <Field id="tx-in" label="Save text">
            <textarea id="tx-in" className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the exported text here" />
          </Field>
          <div className="row gap-2 wrap mt-2">
            <label className="btn btn-default btn-md" htmlFor="tx-file"><Icon name="upload" size={18} /><span className="btn-label">Open file</span></label>
            <input id="tx-file" type="file" accept=".txt,.json,text/plain,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            <select id="tx-target" className="select select-sm" style={{ width: 'auto' }} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Import into slot">
              {slots.map((s, i) => <option key={i} value={i + 1}>Slot {i + 1}{s ? ` (${s.ludus})` : ' (empty)'}</option>)}
            </select>
            <Btn id="tx-import" variant="primary" disabled={!text.trim()} onClick={doImport}>Import</Btn>
          </div>
        </Panel>
      </div>
    </BareWrap>
  );
}
