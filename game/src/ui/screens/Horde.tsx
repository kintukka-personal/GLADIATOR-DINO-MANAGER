// The Wild Horde [UprisingActivity, ExpeditionActivity]: Spartacus and the Horde with spy-gated intel (army ≥ 2
// committed spies, spoils ≥ 3, the leader ≥ 5), rogue dinos, raids, and the expedition: setup, the march and
// the tactics choice when the camp is found → resolveExpedition → battle + outcome.
import React, { useState } from 'react';
import type { BattleResult, Creature, Expedition } from '../../engine/types';
import {
  expeditionPreview, expeditionWeeks, findSpartacus, hordeIntel, maxExpeditionKeepers, rebelLeader, resolveExpedition, startExpedition,
} from '../../engine/horde';
import { TACTICS } from '../../engine/data/politicsData';
import { hasOpp } from '../../engine/influence';
import { canFight } from '../../engine/creature';
import { SPECIES } from '../../engine/data/species';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Field, Hint, KV, Money, Panel, Pill, Plaque, Stepper, Toggle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { CreaturePicker, CreatureRow } from '../components/CreatureRow';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { safe } from '../safe';
import { keepersOf } from '../derive';
import { fmt, plural } from '../format';

const Hidden = ({ need }: { need: number }) => <span className="hidden-stat" title={`Needs ${need} committed spies`}>? <span className="xs muted" style={{ letterSpacing: 0 }}>({need} spies)</span></span>;

export function HordeScreen() {
  const store = useStore();
  const g = store.game!;
  const h = g.world.horde;
  const intel = safe(() => hordeIntel(g), { spies: 0 } as ReturnType<typeof hordeIntel>);
  const sp = safe(() => findSpartacus(g), undefined);
  const leader = safe(() => rebelLeader(g), undefined);
  const raids = g.player.messages.filter((m) => /raid|horde|rebel|spartacus/i.test(m.title)).slice(-5).reverse();
  const status = h.defeated ? 'Broken' : h.spartacusDead ? 'Spartacus is dead' : h.spartacusFree ? 'Spartacus is free' : 'Restless in the hills';
  const spText = h.spartacusDead ? 'Dead. History repeats itself.'
    : !sp ? 'Nobody knows where he is.'
      : sp.where === 'horde' ? 'Leads the Wild Horde from the hills.'
        : sp.where === 'market' ? 'In chains at the Capua market.'
          : sp.where === 'released' ? 'Released to the wild.'
            : sp.house?.isPlayer ? 'Fights for your ludus. Keep him tame.'
              : `Still in chains, fighting for House ${sp.house?.name ?? 'Batiatus'}.`;
  return (
    <>
      <ScreenHead title="Wild Horde" sub={status} />
      <div className="cols cols-wide-left">
        <div className="stack">
          <div className="horde-hero">
            <div className="horde-art" aria-hidden="true">
              {sp && !h.spartacusDead ? <DinoArt creature={sp.creature} width={220} flip /> : leader ? <DinoArt creature={leader} width={200} flip /> : <DinoArt species="allosaurus" seed="spartacus" colors={[12, 4, 0, 14, 8, 36]} width={200} flip dead={h.spartacusDead} />}
            </div>
            <div className="horde-info">
              <div className="micro">Spartacus · Thracian Allosaurus</div>
              <h2>{h.defeated ? 'The Horde is broken' : 'The hills above Capua'}</h2>
              <p className="small">{spText}</p>
            </div>
          </div>
          <Plaque label={`${plural(intel.spies, 'committed spy', 'committed spies')}`} title="What your spies know">
            <div className="kv-grid">
              <KV k="Army">{intel.army !== undefined ? <span className="num">{fmt(intel.army)}</span> : <Hidden need={2} />}</KV>
              <KV k="Spoils">{intel.spoils !== undefined ? <Money value={intel.spoils} size="sm" /> : <Hidden need={3} />}</KV>
              <KV k="Leader">{intel.leader ? `${intel.leader.name}, level ${intel.leader.level}` : <Hidden need={5} />}</KV>
              <KV k="Rogue dinos">{intel.army !== undefined ? h.rogues.length : <Hidden need={2} />}</KV>
            </div>
            <Hint icon="warning">Every dino that breaks out joins the Horde. Keep tameness up, and wardens on the walls.</Hint>
          </Plaque>
          <Panel label="Raids" title="Fires in the night" flush>
            <div className="grid-2" style={{ padding: '0 14px' }}>
              <KV k="Last raid in Capua">{h.lastRaidWeek ? `week ${h.lastRaidWeek}` : 'none yet'}</KV>
              <KV k="Last raid on you">{h.lastRaidOnPlayer ? `week ${h.lastRaidOnPlayer}` : 'none yet'}</KV>
            </div>
            {raids.length === 0 ? <div className="empty small muted">No news of the Horde yet.</div> : raids.map((m) => (
              <div key={m.id} className="msg" style={{ cursor: 'default' }}>
                <span className="msg-ic"><Icon name="horde" size={16} /></span>
                <span style={{ minWidth: 0 }}><span className="msg-title">{m.title}</span><span className="msg-prev" style={{ display: 'block' }}>{m.text}</span></span>
                <span className="xs muted">wk {m.week}</span>
              </div>
            ))}
          </Panel>
        </div>
        <div className="stack">
          <ExpeditionPanel />
          <Panel label={intel.army !== undefined ? `${h.rogues.length} known` : 'Rumours'} title="Rogue dinos" flush>
            {h.rogues.length === 0 && <EmptyState icon="horde" title="No rogues yet">Escaped dinos that join the Horde are listed here.</EmptyState>}
            {h.rogues.slice().sort((a, b) => b.level - a.level).slice(0, 12).map((c) => (
              <div key={c.id} className="crow">
                <DinoThumb creature={c} size={44} />
                <div className="crow-main">
                  <div className="crow-name"><span className="nm">{c.name}</span>{c.legend === 'spartacus' && <Pill tone="fresco">Leader</Pill>}</div>
                  <div className="crow-sub">{SPECIES[c.species].name}{intel.spies >= 5 ? ` · level ${c.level}` : ''}{c.hatchedAt ? ` · from ${c.hatchedAt}` : ''}</div>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Expedition [ExpeditionActivity]
// ---------------------------------------------------------------------------------------------

type ExpResult = { text: string; battle?: BattleResult; victory: boolean };

function ExpeditionPanel() {
  const store = useStore();
  const g = store.game!;
  const exp = g.player.expedition;
  // the result outlives the expedition (resolveExpedition clears player.expedition)
  const [res, setRes] = useState<ExpResult | null>(null);
  return (
    <>
      {exp ? <ExpeditionAway exp={exp} onResult={setRes} /> : <ExpeditionSetup />}
      {res && (
        <Sheet open onClose={() => setRes(null)} title={res.victory ? 'Victory in the hills' : 'Defeat in the hills'} label="Expedition"
          footer={<div className="row gap-2 end">{res.battle && <Btn id="exp-battle" icon="arena" onClick={() => store.showBattle(res.battle!, 'Expedition against the Wild Horde')}>Watch the clash</Btn>}<Btn id="exp-done" variant="primary" onClick={() => setRes(null)}>Continue</Btn></div>}>
          <div className="row gap-2 mb-2">{res.victory ? <Pill tone="good" icon="trophy">Victory</Pill> : <Pill tone="bad" icon="skull">Defeat</Pill>}</div>
          <p className="story-intro">{res.text}</p>
        </Sheet>
      )}
    </>
  );
}

function commanderReason(c: Creature): string | null {
  if (c.kind !== 'dino') return 'Beasts cannot lead men';
  if (c.away) return 'Away';
  if (!canFight(c)) return c.injury ? 'Injured' : 'Cannot fight';
  return null;
}

function ExpeditionSetup() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const h = g.world.horde;
  const best = me.creatures.filter((c) => !commanderReason(c)).sort((a, b) => b.level - a.level || b.fame - a.fame)[0];
  const [cmd, setCmd] = useState<string | undefined>(best?.id);
  const [funds, setFunds] = useState(Math.min(Math.max(200, Math.floor(me.denarii / 4 / 25) * 25), Math.max(200, me.denarii)));
  const [keepers, setKeepers] = useState(0);
  const [capture, setCapture] = useState(true);
  const [pick, setPick] = useState(false);
  const maxK = safe(() => maxExpeditionKeepers(g), 0);
  const commander = me.creatures.find((c) => c.id === cmd);
  const prev = safe(() => expeditionPreview(g, { commanderId: cmd ?? '', funds, keepers }), { militia: 0, ok: 'Not available.', label: 'Skirmish' });
  const army = safe(() => hordeIntel(g).army, undefined);
  const maxFunds = Math.max(200, Math.min(me.denarii, 5000));
  const start = () => {
    if (!cmd) return;
    store.act((s) => startExpedition(s, { commanderId: cmd, funds, keepers, capture }), { ok: 'The militia marches into the hills.' });
  };
  if (!h.expeditionsEnabled) {
    return (
      <Panel label="Expedition" title="Raise a militia">
        <EmptyState icon="horde" title="No war to fight yet">The Senate only arms lanistae once the Horde is a real threat. When the hills are full of runaways, you can lead a militia against them.</EmptyState>
        {!hasOpp(g, 'imperator') && <p className="xs muted">The Imperator opportunity (Lanista path) adds 50 militia to every expedition.</p>}
      </Panel>
    );
  }
  return (
    <Plaque label="Expedition" title="March on the Horde">
      <div className="stack">
        <Field id="exp-commander" label="Commander">
          {commander ? (
            <div className="row gap-2">
              <div className="grow panel flush"><CreatureRow c={commander} g={g} showTame={false} thumb={44} chips={false} /></div>
              <Btn id="exp-commander" size="sm" onClick={() => setPick(true)}>Change</Btn>
            </div>
          ) : <Btn id="exp-commander" onClick={() => setPick(true)} icon="paw">Choose a commander</Btn>}
        </Field>
        <Field id="exp-funds" label={<>Funds <span className="num">{fmt(funds)}</span></>} help="At least 200 denarii. Every 40 denarii buys another militiaman.">
          <input id="exp-funds" type="range" className="range" min={200} max={maxFunds} step={25} value={Math.min(funds, maxFunds)} onChange={(e) => setFunds(Number(e.target.value))} disabled={me.denarii < 200} />
        </Field>
        <div className="row between gap-2">
          <div><div className="strong">Keepers</div><div className="xs muted">Up to {maxK} of your {keepersOf(me)}; +3 militia each. They come back if you win.</div></div>
          <Stepper id="exp-keepers" label="keepers" value={keepers} onDec={() => setKeepers(Math.max(0, keepers - 1))} onInc={() => setKeepers(Math.min(maxK, keepers + 1))} decDisabled={keepers <= 0} incDisabled={keepers >= maxK} />
        </div>
        <Toggle id="exp-capture" checked={capture} onChange={setCapture} label="Take prisoners" desc="Try to drag a rogue (or the leader) back to your pens in chains." />
        <div className="exp-preview">
          <div><span className="micro">Militia</span><span className="display num">{fmt(prev.militia)}</span></div>
          <div><span className="micro">Horde</span><span className="display num">{army !== undefined ? fmt(army) : '?'}</span></div>
          <div><span className="micro">Battle</span><span className="display">{prev.label}</span></div>
        </div>
        <p className="xs muted">The militia needs {expeditionWeeks(g)} weeks to find the camp. Then you choose how to attack, and your commander duels the Horde&rsquo;s champion.</p>
        {prev.ok && <div className="cb-reason xs bad row gap-1"><Icon name="lock" size={12} />{prev.ok}</div>}
        <Btn id="exp-start" variant="primary" icon="horde" disabled={!!prev.ok} onClick={start}>Send the militia · {fmt(funds)}</Btn>
      </div>
      {pick && (
        <Sheet open onClose={() => setPick(false)} wide title="Commander" label="Who leads the militia?">
          <CreaturePicker id="exp-pick" g={g} creatures={me.creatures} max={1} selected={cmd ? [cmd] : []} eligible={commanderReason} initialKind="dinos"
            onChange={(ids) => { setCmd(ids[0]); if (ids[0]) setPick(false); }} />
        </Sheet>
      )}
    </Plaque>
  );
}

function ExpeditionAway({ exp, onResult }: { exp: Expedition; onResult: (r: ExpResult) => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const c = me.creatures.find((x) => x.id === exp.commanderId);
  const tactics: string[] = (g.player.storyData.expeditionTactics as string[] | undefined) ?? (exp.weeksLeft === 0 ? exp.tactics : []);
  const go = (key: string) => {
    const r = store.act((s) => resolveExpedition(s, key), { quiet: true });
    if (!r) return;
    onResult(r);
    if (r.battle) store.showBattle(r.battle, 'Expedition against the Wild Horde', undefined, { sideNames: [me.name, 'The Wild Horde'] });
  };
  return (
    <Plaque label="Expedition" title={tactics.length ? 'The camp is found' : 'The militia is marching'}>
      <div className="row gap-3">
        {c ? <DinoThumb creature={c} size={56} /> : <Icon name="horde" size={32} />}
        <div className="grow">
          <div className="strong">{c?.name ?? 'The commander'}</div>
          <div className="xs muted">{fmt(exp.militia)} militia · {exp.keepers} keepers · {fmt(exp.funds)} denarii{exp.capture ? ' · taking prisoners' : ''}</div>
        </div>
        {!tactics.length && <Pill tone="info" icon="hourglass">{exp.weeksLeft > 0 ? `${plural(exp.weeksLeft, 'week')} away` : 'Arriving'}</Pill>}
      </div>
      {tactics.length > 0 ? (
        <>
          <p className="small mt-3">The scouts have found the Horde&rsquo;s camp. How do we attack?</p>
          <div className="tactics mt-2">
            {tactics.map((k) => (
              <button key={k} type="button" id={`tactic-${k}`} className="tactic" onClick={() => go(k)}>
                <span className="display">{TACTICS[k]?.name ?? k}</span>
                <span className="xs muted">{TACTICS[k]?.desc ?? ''}</span>
              </button>
            ))}
          </div>
        </>
      ) : <p className="xs muted mt-3">When the scouts find the camp you will be asked how to attack. Keep an eye on the hub.</p>}
    </Plaque>
  );
}
