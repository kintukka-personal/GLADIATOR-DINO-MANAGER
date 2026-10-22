// Influence [InfluenceActivity, OpportunityInfoActivity, ElectionsActivity]: influence total, reserved, available
// and weekly gain; the 3 × 5 opportunity tree (Lanista / Senator / Trickster) with tier locks, costs, unlocks,
// toggles and alternate swaps; Senate and consul campaigns; the road to Ascension.
import React, { useState } from 'react';
import type { Creature, OpportunityId } from '../../engine/types';
import {
  ELECTION_COST, ELECTION_WEEKS, OPPORTUNITIES, PATHS, SMEAR_COST, availableInfluence, campaignVotes, canStartElection, canUnlock, hasOpp,
  nextOpportunityCost, projectedVotes, setElectionAction, setToggle, startElection, swapAlternate, treeFor, unlock, type OpportunityDef,
} from '../../engine/influence';
import { influenceGain } from '../../engine/economy';
import { publicSessionsIncome } from '../../engine/influence';
import { ascensionProgress } from '../../engine/ascension';
import { eqAge } from '../../engine/creature';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, Influence, KV, Meter, Money, Panel, Pill, Plaque, Toggle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, type IconName } from '../components/Icon';
import { CreaturePicker } from '../components/CreatureRow';
import { safe } from '../safe';
import { fmt, plural, signed } from '../format';

type Path = OpportunityDef['path'];
const PATH_META: Record<Path, { name: string; icon: IconName; blurb: string }> = {
  lanista: { name: 'Lanista', icon: 'gate', blurb: 'Run the ludus like a business.' },
  senator: { name: 'Senator', icon: 'temple', blurb: 'Friends in the curia, votes in the forum.' },
  trickster: { name: 'Trickster', icon: 'spy', blurb: 'Loans, bets and knives in the dark.' },
};

const TOGGLE_KEY: Partial<Record<OpportunityId, 'publicSessions' | 'bribeGeneral' | 'loan'>> = { publicSessions: 'publicSessions', bribeGeneral: 'bribeGeneral', takeLoan: 'loan' };

export function InfluenceScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [path, setPath] = useState<Path>('lanista');
  const [info, setInfo] = useState<OpportunityDef | null>(null);
  const avail = safe(() => availableInfluence(me), Math.max(0, me.influence - me.allocatedInfluence));
  const cost = safe(() => nextOpportunityCost(g), 0);
  const gain = safe(() => influenceGain(g, me), { total: 0, lines: [] as { label: string; amount: number }[] });
  const tree = safe(() => treeFor(g), [] as OpportunityDef[][]);
  const senatorLocked = !g.unlocks.includes('senatorTree') && !g.world.difficulty.sandbox;
  const status = g.player.consul ? 'Consul of Rome' : g.player.senator ? 'Senator of Rome' : 'Lanista of Capua';
  return (
    <>
      <ScreenHead title="Influence" sub={status} />
      <div className="cols cols-wide-left">
        <Plaque label="Standing" title={<Influence value={me.influence} size="lg" />}>
          <div className="grid-2">
            <KV k="Available">{fmt(avail)}</KV>
            <KV k="Reserved">{fmt(me.allocatedInfluence)}</KV>
            <KV k="Weekly gain"><span className="verdigris">{signed(gain.total)}</span></KV>
            <KV k="Next opportunity">{fmt(cost)}</KV>
          </div>
          {gain.lines.filter((l) => l.amount).length > 0 && (
            <div className="mt-2">
              {gain.lines.filter((l) => l.amount).map((l) => <div key={l.label} className="ledger-line"><span className="muted">{l.label}</span><span className="num">{signed(l.amount)}</span></div>)}
            </div>
          )}
          <p className="xs muted mt-2">Unlocking an opportunity reserves influence; it is never spent or refunded. Tournaments, raids and many events add or take influence too.</p>
        </Plaque>
        <AscensionTeaser />
      </div>

      <Plaque className="mt-3" label={`${g.player.opportunities.length} of ${Object.keys(OPPORTUNITIES).length} taken`} title="Opportunities">
        <div className="seg opp-paths" role="tablist" aria-label="Path">
          {PATHS.map((p) => (
            <button key={p} id={`path-${p}`} type="button" role="tab" aria-selected={path === p} className={`seg-item${path === p ? ' on' : ''}`} onClick={() => setPath(p)}>
              {p === 'senator' && senatorLocked && <Icon name="lock" size={12} />} {PATH_META[p].name}
            </button>
          ))}
        </div>
        <div className="opp-tree">
          {PATHS.map((p, pi) => (
            <div key={p} className={`opp-col${path === p ? ' active' : ''}`}>
              <div className="opp-col-head">
                <Icon name={PATH_META[p].icon} size={18} className="amber" />
                <div className="grow"><div className="display">{PATH_META[p].name}</div><div className="xs muted">{PATH_META[p].blurb}</div></div>
              </div>
              {p === 'senator' && senatorLocked && (
                <button type="button" id="senator-locked" className="opp-lock" onClick={() => store.nav.push({ name: 'upgrades' })}>
                  <Icon name="lock" size={16} /><span>The Senate path needs the <b>Senator Tree</b> upgrade.</span><Icon name="chevronRight" size={16} />
                </button>
              )}
              {(tree[pi] ?? []).map((d, ti) => <OppNode key={d.id} d={d} tier={ti + 1} onInfo={() => setInfo(d)} />)}
            </div>
          ))}
        </div>
      </Plaque>

      <Elections />
      {info && <OppSheet d={info} onClose={() => setInfo(null)} />}
    </>
  );
}

function oppState(g: NonNullable<ReturnType<typeof useStore>['game']>, d: OpportunityDef): { owned: boolean; reason: string | null; altOwned?: OpportunityDef } {
  const owned = hasOpp(g, d.id);
  const altOwned = (d.alt ?? []).filter((a) => hasOpp(g, a)).map((a) => OPPORTUNITIES[a])[0];
  return { owned, reason: owned ? null : safe(() => canUnlock(g, d.id), 'Not available.'), altOwned };
}

function OppNode({ d, tier, onInfo }: { d: OpportunityDef; tier: number; onInfo: () => void }) {
  const store = useStore();
  const g = store.game!;
  const st = oppState(g, d);
  const cost = safe(() => nextOpportunityCost(g), 0);
  const tk = TOGGLE_KEY[d.id];
  const tierLocked = !!st.reason && /first|locked/i.test(st.reason);
  const cls = st.owned ? 'owned' : st.altOwned ? 'owned alt' : !st.reason ? 'ready' : tierLocked ? 'locked' : 'short';
  return (
    <div className={`opp-node ${cls}`}>
      <button type="button" id={`opp-${d.id}`} className="opp-main" onClick={onInfo}>
        <span className="opp-tier num">{['I', 'II', 'III', 'IV', 'V'][tier - 1]}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="opp-name">{d.name}</span>
          <span className="opp-desc">{d.desc}</span>
          {st.altOwned && !st.owned && <span className="xs verdigris">You hold {st.altOwned.name} at this tier.</span>}
        </span>
        <span className="opp-state">
          {st.owned ? <Icon name="check" size={18} className="verdigris" /> : tierLocked ? <Icon name="lock" size={16} className="muted" /> : <span className="num xs">{fmt(cost)}</span>}
        </span>
      </button>
      {st.owned && tk && (
        <div className="opp-toggle">
          <Toggle id={`toggle-${d.id}`} inline checked={!!g.player.toggles[tk]} label={<span className="xs">{tk === 'loan' ? (g.player.toggles.loan ? 'Loan taken (−25/week)' : 'Take the loan (+500)') : 'Active'}</span>}
            onChange={(on) => store.act((s) => setToggle(s, tk, on), { ok: on ? `${d.name} on.` : `${d.name} off.` })} />
        </div>
      )}
      {!st.owned && !st.reason && (
        <div className="opp-toggle"><Btn id={`unlock-${d.id}`} size="sm" variant="primary" onClick={() => store.act((s) => unlock(s, d.id), { ok: `${d.name} is yours.` })}>Unlock · {fmt(cost)}</Btn></div>
      )}
    </div>
  );
}

function OppSheet({ d, onClose }: { d: OpportunityDef; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const st = oppState(g, d);
  const cost = safe(() => nextOpportunityCost(g), 0);
  const mansion = g.player.ludus.buildings.romeMansion ?? 0;
  const tk = TOGGLE_KEY[d.id];
  const sessions = d.id === 'publicSessions' ? safe(() => publicSessionsIncome(g, g.player.ludus), 0) : 0;
  return (
    <Sheet open onClose={onClose} title={d.name} label={`${PATH_META[d.path].name} path · tier ${d.tier}`}
      footer={
        <div className="row gap-2 end wrap">
          {d.alt?.length ? (
            <Btn id="opp-swap" icon="swap" disabled={mansion < 2 || g.player.ludus.denarii < 250} title={mansion < 2 ? 'Needs a Rome Mansion of level 2' : undefined}
              onClick={() => { const r = store.act((s) => swapAlternate(s, d.path, d.tier), { ok: 'The offer in Capua has changed.' }); if (r === null) onClose(); }}>Swap · 250</Btn>
          ) : null}
          {!st.owned && <Btn id="opp-unlock" variant="primary" icon="laurel" disabled={!!st.reason} onClick={() => { const r = store.act((s) => unlock(s, d.id), { ok: `${d.name} is yours.` }); if (r === null) onClose(); }}>Unlock · {fmt(cost)}</Btn>}
        </div>
      }>
      <p className="story-intro">{d.desc}</p>
      <div className="mt-2">
        {st.owned ? <Pill tone="verdigris" icon="check">Yours</Pill> : st.reason ? <Pill tone="bad" icon="lock">{st.reason}</Pill> : <Pill tone="good">Available: reserves {fmt(cost)} influence</Pill>}
      </div>
      {d.alt?.length ? (
        <p className="small muted mt-2">Alternatives at this tier: {d.alt.map((a) => OPPORTUNITIES[a].name).join(', ')}. With a Rome Mansion of level 2 you can pay 250 denarii to swap which one Capua offers{mansion < 2 ? ' (your mansion is not grand enough yet)' : ''}.</p>
      ) : null}
      {tk && <p className="small mt-2">{tk === 'publicSessions' ? <>A switch: while it is on, the sessions bring about <Money value={sessions} size="sm" /> a week.</> : tk === 'bribeGeneral' ? 'A switch: −5 denarii a week while it is on, and a captured fighter is offered at the market most weeks.' : 'A switch: +500 denarii now and −25 a week until you repay 500.'}</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Elections [ElectionsActivity]
// ---------------------------------------------------------------------------------------------

function campaignReason(c: Creature): string | null {
  if (c.kind !== 'dino') return 'Only dinos shake claws with voters';
  if (c.injury) return 'Injured';
  if (c.ill > 0) return 'Ill';
  if (c.away && c.away.kind !== 'campaign') return 'Away';
  if (eqAge(c) < 15) return 'Too young';
  return null;
}

function Elections() {
  const store = useStore();
  const g = store.game!;
  const p = g.player;
  const e = p.election;
  const [pick, setPick] = useState(false);
  const offices: { office: 'senate' | 'consul'; name: string; perks: string[]; need: string }[] = [
    { office: 'senate', name: 'The Senate', need: 'Elected Senator opportunity, 200 influence', perks: ['+50 denarii and +5 influence a week', '+10% on every influence gain', '+1 influence every fifth week', 'Replace the guards before a fight', 'Senator-only events and the consulship'] },
    { office: 'consul', name: 'The consulship', need: 'A Senate seat and the Consul opportunity', perks: ['Two lictors: security +2 and a bodyguard in street fights', '+5 intrigue detection', 'Uphold the law against captured spies', 'Better choices in many events'] },
  ];
  return (
    <div className="cols mt-3">
      <Plaque label="Elections" title={e ? (e.office === 'senate' ? 'Campaign for the Senate' : 'Campaign for consul') : p.consul ? 'Consul of Rome' : p.senator ? 'Senator of Rome' : 'Stand for office'}>
        {e ? <Campaign onPick={() => setPick(true)} /> : (
          <div className="stack">
            {offices.map((o) => {
              const held = o.office === 'senate' ? p.senator : p.consul;
              const why = safe(() => canStartElection(g, o.office), 'Not available.');
              return (
                <div key={o.office} className="office">
                  <div className="row between gap-2">
                    <span className="display">{o.name}</span>
                    {held ? <Pill tone="verdigris" icon="check">Held</Pill> : <Money value={ELECTION_COST[o.office]} size="sm" />}
                  </div>
                  {!held && <div className="xs muted">Needs: {o.need}. {ELECTION_WEEKS} weeks to reach 100 votes.</div>}
                  {!held && (
                    <div className="row gap-2 mt-2 wrap">
                      <Btn id={`elect-${o.office}`} size="sm" variant="primary" icon="temple" disabled={!!why} onClick={() => store.act((s) => startElection(s, o.office), { ok: 'The campaign begins.' })}>Start the campaign</Btn>
                      {why && <span className="cb-reason xs bad row gap-1"><Icon name="lock" size={12} />{why}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Plaque>
      <Panel label="What office brings" title="Perks">
        {offices.map((o) => (
          <div key={o.office} className="mb-2">
            <div className="row gap-2"><span className="strong">{o.office === 'senate' ? 'Senator' : 'Consul'}</span>{(o.office === 'senate' ? p.senator : p.consul) && <Pill tone="verdigris">Yours</Pill>}</div>
            <ul className="perk-list">{o.perks.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </Panel>
      {pick && e && <CampaignerSheet onClose={() => setPick(false)} />}
    </div>
  );
}

function Campaign({ onPick }: { onPick: () => void }) {
  const store = useStore();
  const g = store.game!;
  const e = g.player.election!;
  const me = g.player.ludus;
  const proj = safe(() => projectedVotes(g), { min: 0, max: 0 });
  const camp = safe(() => campaignVotes(g), 0);
  const done = Math.max(0, e.history.length - 1);
  const left = Math.max(0, ELECTION_WEEKS - done);
  const deltas = e.history.map((v, i) => (i === 0 ? v : v - e.history[i - 1]));
  const names = e.campaigners.map((id) => me.creatures.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <div className="stack">
      <div>
        <div className="row between"><span className="micro">Votes</span><span className="num strong">{Math.min(100, e.votes)} / 100</span></div>
        <Meter value={Math.min(100, e.votes)} max={100} ghost={Math.min(100, e.votes + proj.max)} tone={e.votes >= 100 ? 'good' : 'verdigris'} height={10} marks={[0.5]} label="Votes" />
        <div className="xs muted mt-1">{left > 0 ? `${plural(left, 'week')} to go · next week about +${proj.min}–${proj.max}` : 'The urns are counted this week.'}</div>
      </div>
      <div className="vote-history" aria-label="Votes gained each week">
        {deltas.map((d, i) => (
          <div key={i} className="vh-col" title={i === 0 ? `Pledged at the start: ${d}` : `Week ${e.startWeek + i}: ${signed(d)}`}>
            <span className="vh-bar" style={{ height: `${Math.max(4, Math.min(100, Math.abs(d) * 4))}%` }} data-neg={d < 0 || undefined} />
            <span className="xs num">{i === 0 ? 'start' : signed(d)}</span>
          </div>
        ))}
        {Array.from({ length: left }, (_, i) => <div key={`f${i}`} className="vh-col future"><span className="vh-bar" /><span className="xs muted">·</span></div>)}
      </div>
      <Toggle id="elect-smear" checked={e.smear} onChange={(smear) => store.act((s) => { setElectionAction(s, { smear }); return true; })}
        label={`Smear campaign (−${SMEAR_COST} a week)`} desc={`+${g.world.difficulty.hard ? 6 : 8} votes a week while you can pay.`} />
      <div className="row between gap-2">
        <div className="grow"><div className="strong">Campaigners</div><div className="xs muted">{names.length ? `${names.join(', ')}: +${camp} votes a week` : 'Famous dinos win votes (up to 10 a week); they skip the arena while campaigning.'}</div></div>
        <Btn id="elect-campaigners" size="sm" icon="paw" onClick={onPick}>Choose</Btn>
      </div>
      <Hint icon="laurel">Weekly votes follow your influence gain that week, plus a little luck. 100 votes by the end wins the seat.</Hint>
    </div>
  );
}

function CampaignerSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const e = g.player.election!;
  const [sel, setSel] = useState<string[]>(e.campaigners);
  const save = () => {
    store.act((s) => { setElectionAction(s, { campaigners: sel }); return true; }, { ok: sel.length ? `${plural(sel.length, 'dino')} on the campaign trail.` : 'Nobody is campaigning.' });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title="Campaigners" label="Send dinos to meet the voters"
      footer={<div className="row between gap-2"><span className="xs muted">Campaigning costs a little security ({g.world.difficulty.hard ? 4 : 2}) while anyone is out.</span><Btn id="campaign-save" variant="primary" onClick={save}>Send them</Btn></div>}>
      <CreaturePicker id="campaign" g={g} creatures={g.player.ludus.creatures} selected={sel} onChange={setSel} eligible={campaignReason} initialKind="dinos" />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Ascension teaser
// ---------------------------------------------------------------------------------------------

function AscensionTeaser() {
  const store = useStore();
  const g = store.game!;
  const a = safe(() => ascensionProgress(g), null);
  return (
    <Panel label={g.world.ascension > 0 ? `Ascension ${g.world.ascension}` : 'Beyond the Senate'} title="The road to Ascension"
      actions={<Btn id="to-ascension" size="sm" iconRight="chevronRight" onClick={() => store.nav.push({ name: 'ascension' })}>Open</Btn>}>
      {a ? (
        <div className="stack-sm">
          <Req ok={a.trophies >= a.needed} label={`League trophies ${Math.min(a.trophies, a.needed)} / ${a.needed}`} />
          <Req ok={a.hordeDefeated} label="The Wild Horde defeated" />
          <Req ok={a.shrine} label="A Shrine on your estate" />
        </div>
      ) : <EmptyState icon="temple" title="The gods are silent" />}
    </Panel>
  );
}

export function Req({ ok, label }: { ok: boolean; label: React.ReactNode }) {
  return <div className={`req${ok ? ' ok' : ''}`}><Icon name={ok ? 'check' : 'close'} size={14} /><span>{label}</span></div>;
}
