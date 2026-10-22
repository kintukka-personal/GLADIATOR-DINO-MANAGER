// Estate [ConstructionActivity] and Finance [FinancesActivity].
import React from 'react';
import type { BuildingId, KeeperJob } from '../../engine/types';
import { BUILDINGS, build, canBuild } from '../../engine/buildings';
import { assignKeepers, influenceGain, projectedBalance, weeklyExpenses, weeklyIncome, type Ledger } from '../../engine/economy';
import { setToggle } from '../../engine/influence';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, Influence, KV, Money, Panel, Pill, Plaque, Stepper, Toggle } from '../components/primitives';
import { Icon, type IconName } from '../components/Icon';
import { safe, tryRead } from '../safe';
import { totals, keepersOf } from '../derive';
import { fmt, signed } from '../format';

const FALLBACK: Record<BuildingId, { name: string; location: 'capua' | 'ariminium' | 'rome'; max: number }> = {
  residence: { name: 'Residence', location: 'capua', max: 4 }, trainingField: { name: 'Training Field', location: 'capua', max: 3 },
  mine: { name: 'Mine', location: 'capua', max: 2 }, forge: { name: 'Forge', location: 'capua', max: 3 },
  veterinarium: { name: 'Veterinarium', location: 'capua', max: 2 }, palisade: { name: 'Palisade', location: 'capua', max: 2 },
  saddlery: { name: 'Saddlery', location: 'capua', max: 1 }, templeOfPluto: { name: 'Temple of Pluto', location: 'capua', max: 1 },
  library: { name: 'Library', location: 'capua', max: 1 }, breedingPen: { name: 'Breeding Pen', location: 'capua', max: 3 },
  hatchery: { name: 'Hatchery', location: 'capua', max: 3 }, nursery: { name: 'Nursery', location: 'capua', max: 3 },
  kitchen: { name: 'Kitchen', location: 'capua', max: 1 }, ariminiumCamp: { name: 'Ariminium Camp', location: 'ariminium', max: 3 },
  shrine: { name: 'Shrine', location: 'ariminium', max: 1 }, workshop: { name: 'Workshop', location: 'ariminium', max: 1 },
  guardTower: { name: 'Guard Tower', location: 'ariminium', max: 1 }, aqueduct: { name: 'Aqueduct', location: 'ariminium', max: 1 },
  romeMansion: { name: 'Rome Mansion', location: 'rome', max: 2 }, tavern: { name: 'Tavern', location: 'rome', max: 1 },
  bathHouse: { name: 'Bath House', location: 'rome', max: 1 },
};

const ICON: Record<BuildingId, IconName> = {
  residence: 'home', trainingField: 'target', mine: 'coin', forge: 'anvil', veterinarium: 'injury', palisade: 'shield', saddlery: 'rider',
  templeOfPluto: 'temple', library: 'book', breedingPen: 'heart', hatchery: 'flame', nursery: 'baby', kitchen: 'kibble',
  ariminiumCamp: 'flag', shrine: 'temple', workshop: 'gear', guardTower: 'eye', aqueduct: 'drop', romeMansion: 'estate', tavern: 'amphora', bathHouse: 'drop',
};

const LOC: { id: 'capua' | 'ariminium' | 'rome'; name: string; gate?: BuildingId }[] = [
  { id: 'capua', name: 'Capua' },
  { id: 'ariminium', name: 'Ariminium', gate: 'ariminiumCamp' },
  { id: 'rome', name: 'Rome', gate: 'romeMansion' },
];

export function EstateScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const ids = Object.keys(FALLBACK) as BuildingId[];
  const loaded = Object.keys(BUILDINGS).length > 0;
  return (
    <>
      <ScreenHead title="Estate" sub={me.builtThisWeek ? 'Builders are busy until next week' : 'One construction a week; only denarii are spent'} actions={<Money value={me.denarii} />} />
      {!loaded && <Hint icon="estate">Construction plans are still being drawn up; levels are shown, building opens soon.</Hint>}
      <div className="cols">
        {LOC.map((loc) => {
          const list = ids.filter((id) => (BUILDINGS[id]?.location ?? FALLBACK[id].location) === loc.id);
          const gated = loc.gate && (me.buildings[loc.gate] ?? 0) < 1;
          return (
            <Panel key={loc.id} label={loc.name} title={gated ? `${loc.name} (closed)` : loc.name} flush className={loc.id === 'capua' ? 'span-2' : undefined}>
              {gated && <div style={{ padding: '0 14px 8px' }}><Hint icon="lock">{loc.id === 'ariminium' ? 'The first Ariminium Camp comes through an event.' : 'The Rome Mansion comes through a story.'} Then you can build here.</Hint></div>}
              <div className={loc.id === 'capua' ? 'cols' : undefined} style={loc.id === 'capua' ? { gap: 0 } : undefined}>
                {list.map((id) => <BuildingRow key={id} id={id} />)}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function BuildingRow({ id }: { id: BuildingId }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const def = BUILDINGS[id];
  const lvl = me.buildings[id] ?? 0;
  const max = def?.levels.length ?? FALLBACK[id].max;
  const name = def?.name ?? FALLBACK[id].name;
  const cb = tryRead(() => canBuild(g, me, id));
  const maxed = lvl >= max;
  const next = def?.levels[lvl];
  const cur = lvl > 0 ? def?.desc[lvl - 1] : undefined;
  const nextDesc = def?.desc[lvl];
  return (
    <div className="bld">
      <span className="bld-ic"><Icon name={ICON[id]} size={20} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="row gap-2 wrap"><span className="strong">{name}</span>{def?.upgrade && !g.unlocks.includes(def.upgrade) && <Pill tone="muted" icon="lock">Upgrade</Pill>}</div>
        <div className="bld-lv" aria-label={`Level ${lvl} of ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</div>
        {cur && <div className="xs mt-1">{cur}</div>}
        {!maxed && nextDesc && <div className="xs muted mt-1"><b>Next:</b> {nextDesc}</div>}
        {!maxed && next && (
          <div className="stat-mini mt-1">
            {next.keepers > 0 && <span><Icon name="keeper" size={12} /> <b>{next.keepers}</b></span>}
            {next.creatures > 0 && <span>dinos <b>{next.creatures}</b></span>}
            {next.influence > 0 && <span>influence <b>{next.influence}</b></span>}
            {next.residence > 0 && <span>residence <b>{next.residence + 1}</b></span>}
          </div>
        )}
        {cb.ok && !cb.value.ok && cb.value.reason && !maxed && <div className="xs bad mt-1">{cb.value.reason}</div>}
      </div>
      <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
        {maxed ? <Pill tone="good">Max</Pill> : (
          <>
            {cb.ok && <Money value={cb.value.cost} size="sm" />}
            <Btn id={`build-${id}`} size="sm" variant={cb.ok && cb.value.ok ? 'primary' : 'default'} disabled={!cb.ok || !cb.value.ok} onClick={() => store.act((s) => build(s, s.player.ludus, id), { ok: `${name} ${lvl ? 'upgraded' : 'built'}.` })}>
              {lvl ? 'Upgrade' : 'Build'}
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const JOBS: { job: KeeperJob; label: string; icon: IconName; desc: string }[] = [
  { job: 'miners', label: 'Miners', icon: 'coin', desc: 'Dig for denarii in the mine.' },
  { job: 'showmen', label: 'Showmen', icon: 'laurel', desc: 'Entertain the crowds: influence and tameness.' },
  { job: 'wardens', label: 'Wardens', icon: 'shield', desc: 'Security: stop breakouts and intrigue.' },
  { job: 'spies', label: 'Spies', icon: 'spy', desc: 'Market intel and intrigue; need Residence 2.' },
];

function LedgerPanel({ label, title, r, tone }: { label: string; title: string; r: ReturnType<typeof tryRead<Ledger>>; tone: 'good' | 'bad' | 'verdigris' }) {
  return (
    <Panel label={label} title={title}>
      {!r.ok ? <p className="small muted">Ledger not available yet.</p> : (
        <>
          {r.value.lines.length === 0 && <p className="small muted">Nothing this week.</p>}
          {r.value.lines.map((l, i) => (
            <div key={i} className="ledger-line"><span>{l.label}</span><span className={`num strong ${l.amount < 0 ? 'bad' : tone === 'verdigris' ? 'verdigris' : 'good'}`}>{signed(l.amount)}</span></div>
          ))}
          <div className="ledger-total"><span>Total</span><span className={`num ${tone}`}>{signed(r.value.total)}</span></div>
        </>
      )}
    </Panel>
  );
}

export function FinanceScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const t = totals(me);
  const inc = tryRead(() => weeklyIncome(g, me));
  const exp = tryRead(() => weeklyExpenses(g, me));
  const inf = tryRead(() => influenceGain(g, me));
  const proj = safe(() => projectedBalance(g, me), null as number | null);
  const move = (job: KeeperJob, d: number) => store.act((s) => assignKeepers(s, s.player.ludus, job, d), { failText: d > 0 ? 'No unassigned keepers.' : 'Nobody on that job.' });
  return (
    <>
      <ScreenHead title="Finance" sub={`${keepersOf(me)} keepers · ${t.beds} beds`} actions={<Money value={me.denarii} />} />
      <div className="cols">
        <div className="stack">
          <Plaque label="Keepers" title={`${me.keepers.unassigned} unassigned`} actions={<Btn size="sm" icon="keeper" onClick={() => store.nav.area('market', 'keepers')}>Hire</Btn>}>
            {JOBS.map((j) => {
              const locked = j.job === 'spies' && !t.spiesUnlocked;
              return (
                <div key={j.job} className="job">
                  <span className="food-ic"><Icon name={locked ? 'lock' : j.icon} size={18} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="strong">{j.label}</div>
                    <div className="xs muted">{j.desc}</div>
                  </div>
                  <Stepper id={`job-${j.job}`} label={j.label} value={me.keepers[j.job]} onDec={() => move(j.job, -1)} onInc={() => move(j.job, 1)}
                    decDisabled={me.keepers[j.job] <= 0} incDisabled={me.keepers.unassigned <= 0 || locked} />
                </div>
              );
            })}
            {me.keepers.spies > 0 && <p className="xs muted mt-2">Spies assigned now become committed next week ({me.spiesLastWeek} committed this week).</p>}
          </Plaque>
          <Panel label="Credit" title="Loans">
            <Toggle id="toggle-loan" checked={g.player.toggles.loan} onChange={(v) => store.act((s) => setToggle(s, 'loan', v))} label="Take a loan" desc="Money now, interest every week. Debt spirals end a ludus." />
            <Toggle id="toggle-public" checked={g.player.toggles.publicSessions} onChange={(v) => store.act((s) => setToggle(s, 'publicSessions', v))} label="Public sessions" desc="Open training to the public for coin (needs the opportunity)." />
          </Panel>
        </div>
        <div className="stack">
          <Plaque label="Projection" title="Next week">
            <div className="row between wrap gap-2">
              <div><div className="micro">Balance after the week</div>{proj === null ? <span className="muted">—</span> : <Money value={proj} size="lg" />}</div>
              <div className="right"><div className="micro">Influence gain</div>{inf.ok ? <Influence value={inf.value.total} signedValue size="lg" /> : <span className="muted">—</span>}</div>
            </div>
            {inc.ok && exp.ok && <KV k="Net">{signed(inc.value.total + exp.value.total)}</KV>}
          </Plaque>
          <LedgerPanel label="Income" title="Weekly income" r={inc} tone="good" />
          <LedgerPanel label="Expenses" title="Weekly expenses" r={exp} tone="bad" />
          <LedgerPanel label="Influence" title="Influence sources" r={inf} tone="verdigris" />
        </div>
      </div>
    </>
  );
}

export { FALLBACK as BUILDING_FALLBACK, ICON as BUILDING_ICON };
void EmptyState;
void fmt;
