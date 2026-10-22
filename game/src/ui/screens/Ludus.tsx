// Ludus tab [LudusActivity, GladiatorsActivity, TrainingActivity, ForgeActivity, ArmoryActivity, TombActivity].
import React, { useMemo, useState } from 'react';
import type { Creature, Gear, GearSlot, SpeciesId, TrainingType } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { GEAR, gearName, gearWorth, gearHas } from '../../engine/data/gear';
import { QUALITY_NAMES } from '../../engine/types';
import { wildLevel } from '../../engine/creature';
import { projectedTrainingXp, doctoreBonus, sparringSlots, spar } from '../../engine/training';
import { setDoctore } from '../../engine/care';
import { forgeCatalog, forgeItem, reforge, reforgeCost, repair, repairCost, type ForgeOption } from '../../engine/forge';
import { sellGear } from '../../engine/market';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Tabs } from '../components/Tabs';
import { Btn, EmptyState, Hint, Money, Panel, Pill, Plaque, Segmented, Toggle, KV } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { CreatureRow, CreaturePicker, KindChips, SpeciesSelect, filterCreatures, type KindFilter } from '../components/CreatureRow';
import { GearName, SLOT_ICON, SLOT_LABEL, SLOT_ORDER, gearLineText, wearerName } from '../components/GearPicker';
import { Icon } from '../components/Icon';
import { DinoThumb } from '../art/DinoArt';
import { safe } from '../safe';
import { fmt } from '../format';

const TRAINING: { id: TrainingType; label: string; xp: number; risk: string; desc: string }[] = [
  { id: 'light', label: 'Light', xp: 0.75, risk: 'Low', desc: '75% XP. Fewest training injuries.' },
  { id: 'standard', label: 'Standard', xp: 1, risk: 'Normal', desc: 'Full XP at the usual risk.' },
  { id: 'intense', label: 'Intense', xp: 1.5, risk: 'High', desc: '150% XP. Injuries are twice as likely.' },
  { id: 'technique', label: 'Technique', xp: 0.5, risk: 'Normal', desc: 'Half XP; the doctore may teach a technique it knows.' },
];

export function LudusScreen() {
  const store = useStore();
  const g = store.game!;
  const tab = store.screen.tab ?? 'roster';
  const me = g.player.ludus;
  return (
    <>
      <ScreenHead title="Ludus" sub={`${me.creatures.length} creatures · ${me.armory.length} pieces of harness`} back={false} />
      <Tabs
        id="ludus"
        label="Ludus sections"
        value={tab}
        onChange={(t) => store.nav.update({ tab: t })}
        items={[
          { id: 'roster', label: 'Roster', icon: 'paw', badge: me.creatures.length },
          { id: 'training', label: 'Training', icon: 'target' },
          { id: 'forge', label: 'Forge', icon: 'anvil' },
          { id: 'armory', label: 'Armory', icon: 'shield' },
          { id: 'tomb', label: 'Tomb', icon: 'skull', badge: g.player.tomb.length || undefined },
        ]}
      />
      {tab === 'roster' && <Roster />}
      {tab === 'training' && <Training />}
      {tab === 'forge' && <Forge />}
      {tab === 'armory' && <Armory />}
      {tab === 'tomb' && <Tomb />}
    </>
  );
}

type SortKey = 'level' | 'wild' | 'fame' | 'tame' | 'name' | 'age';

function Roster() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [kind, setKind] = useState<KindFilter>('all');
  const [species, setSpecies] = useState<SpeciesId | 'any'>('any');
  const [sort, setSort] = useState<SortKey>('level');
  const list = useMemo(() => {
    const l = filterCreatures(me.creatures, kind, species);
    const key: Record<SortKey, (c: Creature) => number | string> = {
      level: (c) => -c.level * 1000 - c.xp, wild: (c) => -wildLevel(c), fame: (c) => -c.fame, tame: (c) => c.loyalty, name: (c) => c.name, age: (c) => -c.ageWeeks,
    };
    return [...l].sort((a, b) => {
      const x = key[sort](a);
      const y = key[sort](b);
      return typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    });
  }, [me.creatures, kind, species, sort, store.v]);
  const counts = {
    all: me.creatures.length,
    dinos: me.creatures.filter((c) => c.kind === 'dino' && c.maturity >= 1).length,
    beasts: me.creatures.filter((c) => c.kind === 'beast').length,
    young: me.creatures.filter((c) => c.maturity < 1).length,
  };
  if (!me.creatures.length) {
    return (
      <Plaque>
        <EmptyState icon="paw" title="The pens are empty" action={<Btn variant="primary" icon="amphora" onClick={() => store.nav.area('market', 'dinos')}>Visit the market</Btn>}>
          Every ludus starts with a single purchase. Tetraites, Carpophorus and Flamma are waiting at the market this week.
        </EmptyState>
      </Plaque>
    );
  }
  return (
    <div className="stack">
      <div className="row gap-2 wrap">
        <KindChips id="roster-kind" value={kind} onChange={setKind} counts={counts} />
        <SpeciesSelect id="roster-species" value={species} onChange={setSpecies} list={me.creatures} />
        <label className="row gap-1 small muted" htmlFor="roster-sort">
          <Icon name="sort" size={16} />
          <select id="roster-sort" className="select select-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="level">Level</option>
            <option value="wild">Wild level</option>
            <option value="fame">Fame</option>
            <option value="tame">Tameness (low first)</option>
            <option value="age">Age</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <Panel flush>
        {list.length === 0 && <div className="empty small muted">Nothing matches these filters.</div>}
        {list.map((c) => <CreatureRow key={c.id} id={`roster-${c.id}`} c={c} g={g} onClick={() => store.nav.push({ name: 'dino', id: c.id })} />)}
      </Panel>
    </div>
  );
}

function Training() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [pickDoc, setPickDoc] = useState(false);
  const [sparSel, setSparSel] = useState<string[] | null>(null);
  const doctore = me.creatures.find((c) => c.id === me.doctoreId);
  const bonus = safe(() => doctoreBonus(g, me), null as number | null);
  const slots = safe(() => sparringSlots(g, me), 1);
  const trainees = me.creatures.filter((c) => c.maturity >= 0.45 && !c.away);
  const t = TRAINING.find((x) => x.id === me.training.type) ?? TRAINING[1];
  const setType = (type: TrainingType) => store.act((s) => { s.player.ludus.training.type = type; return true; });
  const setOverride = (id: string, v: TrainingType | '') => store.act((s) => {
    const o = s.player.ludus.training.overrides;
    if (v) o[id] = v;
    else delete o[id];
    return true;
  });
  const setPaid = (k: 'bestiarii' | 'spartan' | 'weapons', v: boolean) => store.act((s) => { s.player.ludus.training.paid[k] = v; return true; });
  return (
    <div className="cols">
      <div className="stack">
        <Plaque label="Regimen" title={`${t.label} training`}>
          <Segmented id="training-type" label="Training intensity" value={me.training.type} onChange={setType} options={TRAINING.map((x) => ({ value: x.id, label: x.label }))} />
          <p className="small muted mt-2">{t.desc}</p>
          <div className="grid-2 mt-2">
            <KV k="XP multiplier">×{t.xp}</KV>
            <KV k="Injury risk">{t.risk}</KV>
          </div>
        </Plaque>
        <Panel label="Doctore" title={doctore ? doctore.name : 'No doctore'} actions={<Btn id="doctore-pick" size="sm" onClick={() => setPickDoc(true)}>{doctore ? 'Change' : 'Appoint'}</Btn>}>
          {doctore ? (
            <div className="row gap-3">
              <DinoThumb creature={doctore} size={52} />
              <div className="grow small">
                <div>{SPECIES[doctore.species].name} · level {doctore.level}</div>
                <div className="muted">Drill bonus {bonus === null ? 'not available yet' : <b className="num">+{fmt(bonus)} XP</b>}</div>
              </div>
            </div>
          ) : (
            <p className="small muted">A veteran dino who drills the pack. Its level and Cunning add XP to everyone's training.</p>
          )}
        </Panel>
        <Panel label="Hired trainers" title="Specialists">
          <Toggle id="paid-bestiarii" checked={me.training.paid.bestiarii} onChange={(v) => setPaid('bestiarii', v)} label="Bestiarii (25 / week)" desc="Beast handlers: beasts train faster." />
          <Toggle id="paid-spartan" checked={me.training.paid.spartan} onChange={(v) => setPaid('spartan', v)} label="Spartan trainer (35 / week)" desc="Harsh drills: more XP and grit, more injuries." />
          <Toggle id="paid-weapons" checked={me.training.paid.weapons} onChange={(v) => setPaid('weapons', v)} label="Weapons master (50 / week)" desc="Faster weapon proficiency; needs the Weapons Master upgrade." />
        </Panel>
      </div>
      <div className="stack">
        <Panel label="This week" title="Projected XP" flush>
          {trainees.map((c) => {
            const xp = safe(() => projectedTrainingXp(g, me, c), null as number | null);
            return (
              <div key={c.id} className="crow">
                <DinoThumb creature={c} size={44} />
                <div className="crow-main">
                  <div className="crow-name"><span className="nm">{c.name}</span></div>
                  <div className="crow-sub">{SPECIES[c.species].name} · Lv {c.level}</div>
                </div>
                <div className="row gap-2">
                  <span className="num strong" title="Projected training XP">{xp === null ? '—' : `+${fmt(xp)}`}</span>
                  <select id={`override-${c.id}`} className="select select-sm" style={{ width: 118 }} value={me.training.overrides[c.id] ?? ''} onChange={(e) => setOverride(c.id, e.target.value as TrainingType | '')} aria-label={`Training for ${c.name}`}>
                    <option value="">Regimen</option>
                    {TRAINING.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </Panel>
        <Panel label="Sparring" title={`${slots} session${slots === 1 ? '' : 's'} a week`} actions={<Btn id="spar-new" size="sm" icon="swap" onClick={() => setSparSel([])}>Spar now</Btn>}>
          <p className="small muted">Two of your dinos fight with blunted harness. Both gain XP; injuries are rare.</p>
          <Hint>Sparring partners of similar level learn the most.</Hint>
        </Panel>
      </div>
      <Sheet open={pickDoc} onClose={() => setPickDoc(false)} title="Appoint a doctore" wide>
        <CreaturePicker id="doc" g={g} creatures={me.creatures} max={1} selected={doctore ? [doctore.id] : []}
          eligible={(c) => (c.kind !== 'dino' ? 'Only dinos can drill the pack' : c.maturity < 1 ? 'Too young' : c.away ? 'Away' : null)}
          onChange={(ids) => {
            const r = store.act((s) => setDoctore(s, ids[0] ?? null), { ok: ids[0] ? 'A new doctore takes the sand.' : undefined });
            if (r === null) setPickDoc(false);
          }} />
      </Sheet>
      <Sheet open={!!sparSel} onClose={() => setSparSel(null)} title="Choose two sparring partners" wide
        footer={<div className="row end gap-2"><Btn variant="ghost" onClick={() => setSparSel(null)}>Cancel</Btn><Btn id="spar-go" variant="primary" disabled={(sparSel?.length ?? 0) !== 2} onClick={() => {
          const [a, b] = sparSel ?? [];
          const r = store.act((s) => spar(s, s.player.ludus, a, b));
          if (r && typeof r === 'object') {
            setSparSel(null);
            store.showBattle(r, 'Sparring');
          }
        }}>Spar</Btn></div>}>
        {sparSel && <CreaturePicker id="spar" g={g} creatures={me.creatures} max={2} selected={sparSel} onChange={setSparSel}
          eligible={(c) => (c.maturity < 0.45 ? 'Too young' : c.injury ? 'Injured' : c.away ? 'Away' : c.inactive ? 'Already busy this week' : null)} />}
      </Sheet>
    </div>
  );
}

function Forge() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const lvl = me.buildings.forge ?? 0;
  const catalog = safe(() => forgeCatalog(g), [] as ForgeOption[]);
  if (lvl === 0) {
    return (
      <Plaque>
        <EmptyState icon="anvil" title="No forge yet" action={<Btn variant="primary" icon="estate" onClick={() => store.nav.area('estate')}>Open the estate</Btn>}>
          Build a Forge to make talon blades, horn lances and barding to your dinos&rsquo; measure, and to reforge what you own.
        </EmptyState>
      </Plaque>
    );
  }
  if (!catalog.length) {
    return (
      <Plaque>
        <EmptyState icon="anvil" title="The forge is cold">The smiths are still sorting their moulds. The forge catalogue will appear here.</EmptyState>
      </Plaque>
    );
  }
  const bySlot = SLOT_ORDER.map((slot) => ({ slot, items: catalog.filter((o) => GEAR[o.type]?.slot === slot) })).filter((x) => x.items.length);
  return (
    <div className="stack">
      <Hint icon="anvil">Forge level {lvl}: forged pieces come out at up to {QUALITY_NAMES[Math.min(5, lvl + 1)]} quality. Reforging lives in the Armory.</Hint>
      <div className="cols">
        {bySlot.map(({ slot, items }) => (
          <Panel key={slot} label="Forge" title={SLOT_LABEL[slot]} flush>
            {items.map((o) => (
              <div key={`${o.type}-${o.quality}`} className={`offer${o.locked ? ' locked' : ''}`}>
                <span className="bld-ic" style={{ width: 36, height: 36 }}><Icon name={o.locked ? 'lock' : SLOT_ICON[slot]} size={18} /></span>
                <div className="grow">
                  <div className="strong">{GEAR[o.type].name} <span className={`q-${o.quality} small`}>{QUALITY_NAMES[o.quality]}</span></div>
                  <div className="xs muted">{o.locked ? o.reason ?? 'Locked' : GEAR[o.type].desc}</div>
                </div>
                <Btn size="sm" disabled={o.locked || me.denarii < o.cost} onClick={() => store.act((s) => forgeItem(s, o.type), { ok: (r) => (typeof r === 'object' ? `Forged ${gearName(r)}.` : undefined) })}>
                  <Money value={o.cost} size="sm" />
                </Btn>
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Armory() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [slot, setSlot] = useState<GearSlot | 'all'>('all');
  const list = me.armory.filter((x) => slot === 'all' || GEAR[x.type]?.slot === slot).sort((a, b) => gearWorth(b) - gearWorth(a));
  const sell = async (x: Gear) => {
    const ok = await store.confirm({ title: `Sell ${gearName(x)}?`, text: <>The market pays about <b>{fmt(Math.floor(gearWorth(x) / 2))}</b> denarii for it. Whoever wears it goes without.</>, confirmLabel: 'Sell', danger: true });
    if (ok) store.act((s) => sellGear(s, x.id), { ok: `Sold ${gearName(x)}.` });
  };
  return (
    <div className="stack">
      <Segmented id="armory-slot" label="Slot" size="sm" value={slot} onChange={setSlot}
        options={[{ value: 'all', label: 'All' }, ...SLOT_ORDER.map((s) => ({ value: s, label: SLOT_LABEL[s] }))]} />
      <Panel flush>
        {list.length === 0 && <EmptyState icon="shield" title="Nothing here">Buy harness at the market or forge it.</EmptyState>}
        {list.map((x) => {
          const who = wearerName(me, x.id);
          const rc = safe(() => reforgeCost(g, x), null as number | null);
          const broken = gearHas(x, 'Broken');
          const fc = broken ? safe(() => repairCost(g, x), null as number | null) : null;
          return (
            <div key={x.id} className="offer">
              <span className="bld-ic" style={{ width: 36, height: 36 }}><Icon name={SLOT_ICON[GEAR[x.type].slot]} size={18} /></span>
              <div className="grow">
                <div className="row gap-2 wrap"><GearName g={x} />{who && <Pill tone="muted">{who}</Pill>}{broken && <Pill tone="bad">Broken</Pill>}</div>
                <div className="xs muted num">{gearLineText(x)}</div>
                <div className="row gap-1 mt-1 wrap">
                  {rc !== null && <Btn size="sm" variant="quiet" icon="anvil" onClick={() => store.act((s) => reforge(s, x.id))}>Reforge {fmt(rc)}</Btn>}
                  {fc !== null && <Btn size="sm" variant="quiet" onClick={() => store.act((s) => repair(s, x.id))}>Repair {fmt(fc)}</Btn>}
                  <Btn size="sm" variant="ghost" onClick={() => sell(x)}>Sell</Btn>
                </div>
              </div>
              <Money value={gearWorth(x)} size="sm" />
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function Tomb() {
  const store = useStore();
  const g = store.game!;
  const tomb = [...g.player.tomb].reverse();
  if (!tomb.length) return <Plaque><EmptyState icon="skull" title="The tomb is empty">May it stay that way. The fallen of your ludus are laid to rest here.</EmptyState></Plaque>;
  return (
    <Panel flush label="In memoriam" title="The tomb">
      {tomb.map((t) => (
        <div key={t.id} className="crow">
          <DinoThumb creature={t.creature} size={52} dead />
          <div className="crow-main">
            <div className="crow-name"><span className="nm">{t.name}</span></div>
            <div className="crow-sub">{SPECIES[t.species].name} · level {t.level} · fame {t.fame}</div>
            <div className="xs muted">{t.cause}</div>
          </div>
          <div className="crow-right"><span className="xs muted">Week {t.week}</span></div>
        </div>
      ))}
    </Panel>
  );
}
