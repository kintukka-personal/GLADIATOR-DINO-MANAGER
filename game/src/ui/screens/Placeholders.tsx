// Intrigue, Influence and Horde: real data where it exists today, with clear "coming next" states.
// Another engineer will build the full flows on top of these (see UI_GUIDE.md).
import React from 'react';
import type { Ludus } from '../../engine/types';
import { opinionLabel } from '../../engine/rivals';
import { OPPORTUNITIES, availableInfluence } from '../../engine/influence';
import { hordeSize } from '../../engine/horde';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { EmptyState, Hint, Influence, KV, Meter, Money, Panel, Pill, Plaque } from '../components/primitives';
import { DinoThumb } from '../art/DinoArt';
import { safe } from '../safe';
import { camelToWords, fmt } from '../format';

function opinionTone(o: number): 'good' | 'warn' | 'bad' {
  return o >= 60 ? 'good' : o >= 35 ? 'warn' : 'bad';
}

function RivalCard({ r }: { r: Ludus }) {
  const op = r.ai?.opinion ?? 50;
  const label = safe(() => opinionLabel(op), op >= 60 ? 'Friendly' : op >= 35 ? 'Neutral' : 'Hostile');
  const top = [...r.creatures].sort((a, b) => b.fame - a.fame).slice(0, 4);
  return (
    <Panel label={r.ai ? camelToWords(r.ai.personality.honesty) : 'House'} title={`House ${r.name}`} actions={<Pill tone={opinionTone(op)}>{label}</Pill>}>
      <div className="row gap-1">{top.map((c) => <DinoThumb key={c.id} creature={c} size={44} />)}</div>
      <div className="grid-2 mt-2">
        <KV k="Creatures">{r.creatures.length}</KV>
        <KV k="Influence"><Influence value={r.influence} size="sm" /></KV>
      </div>
      <div className="row gap-2 mt-1"><span className="xs muted">Opinion of you</span><Meter value={Math.max(0, op)} max={100} tone={opinionTone(op)} height={5} label="Opinion" /><span className="xs num">{Math.round(op)}</span></div>
    </Panel>
  );
}

export function IntrigueScreen() {
  const store = useStore();
  const g = store.game!;
  const rivals = g.rivals.filter((r) => !r.defeated && (r.ai?.visible ?? true));
  return (
    <>
      <ScreenHead title="Intrigue" sub={`${rivals.length} rival houses · ${g.player.ludus.keepers.spies} spies`} back={false} />
      {g.player.defenses.length > 0 && (
        <Plaque label="Under threat" title={`${g.player.defenses.length} scheme${g.player.defenses.length > 1 ? 's' : ''} against you`}>
          <p className="small">Answer it from the hub before you advance.</p>
        </Plaque>
      )}
      <div className="cols mt-3">{rivals.map((r) => <RivalCard key={r.id} r={r} />)}</div>
      <Panel className="mt-3" label="Coming next" title="Agents and night work">
        <EmptyState icon="spy" title="Intrigue actions are on their way">Send an agent to persuade, poison, steal, sabotage, raid or assassinate, watch the night infiltration and read the report. The rival dossiers above are live already.</EmptyState>
      </Panel>
    </>
  );
}

export function InfluenceScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const avail = safe(() => availableInfluence(me), me.influence - me.allocatedInfluence);
  const owned = g.player.opportunities;
  return (
    <>
      <ScreenHead title="Influence" sub={g.player.consul ? 'Consul of Rome' : g.player.senator ? 'Senator' : 'Lanista of Capua'} />
      <div className="cols">
        <Plaque label="Standing" title={<Influence value={me.influence} size="lg" />}>
          <KV k="Available to spend">{fmt(avail)}</KV>
          <KV k="Allocated">{fmt(me.allocatedInfluence)}</KV>
          <KV k="Opportunities taken">{owned.length} of {Object.keys(OPPORTUNITIES).length || '—'}</KV>
          {g.player.election && <KV k="Election">{camelToWords(g.player.election.office)} · {g.player.election.votes} votes</KV>}
        </Plaque>
        <Panel label="Opportunities" title="Owned">
          {owned.length === 0 && <p className="small muted">None yet.</p>}
          {owned.map((o) => <div key={o} className="ledger-line"><span>{OPPORTUNITIES[o]?.name ?? camelToWords(o)}</span><span className="xs muted">{OPPORTUNITIES[o]?.path}</span></div>)}
        </Panel>
        <Panel className="span-2" label="Coming next" title="The opportunity tree">
          <EmptyState icon="laurel" title="The Senate awaits">The three paths (lanista, senator, trickster), elections for the Senate and the consulship, laws and the road to Ascension arrive with the influence update.</EmptyState>
        </Panel>
      </div>
    </>
  );
}

export function HordeScreen() {
  const store = useStore();
  const g = store.game!;
  const h = g.world.horde;
  const size = safe(() => hordeSize(g), h.ferals + h.rogues.length);
  return (
    <>
      <ScreenHead title="Wild Horde" sub={h.defeated ? 'Defeated' : h.spartacusFree ? 'Spartacus is free' : 'Restless in the hills'} />
      <div className="cols">
        <Plaque label="The hills above Capua" title={`${fmt(size)} strong`}>
          <KV k="Ferals">{fmt(h.ferals)}</KV>
          <KV k="Rogue dinos">{h.rogues.length}</KV>
          <KV k="Spoils"><Money value={h.spoils} size="sm" /></KV>
          <KV k="Spartacus">{h.spartacusDead ? 'Dead' : h.spartacusFree ? 'Leading the Horde' : 'Still in chains (Batiatus)'}</KV>
          {h.rogues.length > 0 && <div className="row gap-1 wrap mt-2">{h.rogues.slice(0, 8).map((c) => <DinoThumb key={c.id} creature={c} size={44} />)}</div>}
        </Plaque>
        <Panel label="Coming next" title="Expeditions">
          <EmptyState icon="horde" title="Raise a militia">Expeditions against the Horde, Senate armies and raid defence arrive with the Horde update.</EmptyState>
          <Hint icon="warning">Low tameness feeds the Horde: every escaped dino joins it.</Hint>
        </Panel>
      </div>
    </>
  );
}
