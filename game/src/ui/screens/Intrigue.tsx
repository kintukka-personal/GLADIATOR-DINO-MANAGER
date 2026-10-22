// Intrigue [IntrigueActivity, DominusDetailsActivity, AgentSelectionActivity, IntrigueReportActivity, OfferActivity].
// Rivals sorted by influence (spy-gated wealth and keepers, GM 05 §5), the rival dossier with house actions
// (Sabotage, Steal, Raid with Veil of Night) and creature actions (Persuade, Poison, Assassinate), trade offers,
// the agent picker with each agent's chance, the night scenario (Proceed / Retreat) and the report.
// Schemes against you: DefenseSheet (also used by the hub).
import React, { useEffect, useState } from 'react';
import type { BattleResult, Creature, Gear, IntrigueAction, IntrigueOrder, Ludus, PendingDefense, StoryActor } from '../../engine/types';
import { STATS } from '../../engine/types';
import {
  ACTION_NAMES, DEFENSE_PROMPTS, availableAgents, chanceRange, defensePromptText, intrigueChance, planIntrigue, resolveDefense,
  resolveIntrigue,
} from '../../engine/intrigue';
import { SCENARIO_DEFS } from '../../engine/data/politicsData';
import { opinionLabel } from '../../engine/rivals';
import { offerToRival, rivalAskingPrice } from '../../engine/market';
import { committedSpies, keeperCount } from '../../engine/economy';
import { hasOpp } from '../../engine/influence';
import { BUILDINGS } from '../../engine/buildings';
import { getStat, lifePhase, ageLabel, wildLevel } from '../../engine/creature';
import { SPECIES } from '../../engine/data/species';
import { TRAITS } from '../../engine/data/traits';
import { GEAR, gearName, gearWorth } from '../../engine/data/gear';
import { houseById } from '../../engine/util';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, Influence, KV, Meter, Money, Panel, Pill, Plaque, Rule, Stepper, type Tone } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, SexIcon, type IconName } from '../components/Icon';
import { CreatureRow } from '../components/CreatureRow';
import { GearName, SLOT_ICON, gearLineText } from '../components/GearPicker';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { Portrait } from '../art/Portrait';
import { safe } from '../safe';
import { STAT_SHORT, camelToWords, fmt, plural } from '../format';
import { sfx } from '../audio';

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

const ACTORS = new Set<string>(['batiatus', 'solonius', 'decimus', 'magnus', 'vettius', 'caesar', 'crassus', 'hannibal']);

export function rivalActor(r: Ludus): StoryActor {
  const k = r.ai?.key;
  return k && ACTORS.has(k) ? (k as StoryActor) : 'unknown';
}

export function opinionOf(r: Ludus): { label: string; tone: Tone; value: number } {
  const v = r.ai?.opinion ?? 50;
  if (r.ai?.pact) return { label: 'Alliance', tone: 'verdigris', value: v };
  const label = safe(() => opinionLabel(v), v > 60 ? 'Favourable' : v >= 40 ? 'Neutral' : v >= 16 ? 'Unfavourable' : 'Sworn enemy');
  const tone: Tone = v > 60 ? 'good' : v >= 40 ? 'muted' : v >= 16 ? 'warn' : 'bad';
  return { label, tone, value: v };
}

const HONESTY: Record<string, string> = { honest: 'Keeps its word', neutral: 'Bends the rules', dishonest: 'Cheats when it can', treacherous: 'Will knife you in the dark' };
const ARENA: Record<string, string> = { conservative: 'cautious in the arena', balanced: 'steady in the arena', risktaker: 'takes risks in the arena', crazy: 'reckless in the arena' };
const MONEY: Record<string, string> = { greedy: 'hoards its coin', spender: 'spends freely', balanced: 'careful with money', crazy: 'wild with money' };

export function personalityHint(r: Ludus): string {
  const p = r.ai?.personality;
  if (!p) return '';
  return `${HONESTY[p.honesty] ?? camelToWords(p.honesty)}; ${ARENA[p.arena] ?? p.arena}; ${MONEY[p.financial] ?? p.financial}.`;
}

/** GM 05 §5 spy intel on a rival: wealth if your committed spies > theirs, keepers if > theirs / 2. */
export function rivalIntel(g: NonNullable<ReturnType<typeof useStore>['game']>, r: Ludus): { mine: number; theirs: number; wealth: boolean; keepers: boolean } {
  const mine = safe(() => committedSpies(g, g.player.ludus), g.player.ludus.spiesLastWeek);
  const theirs = safe(() => committedSpies(g, r), r.spiesLastWeek);
  return { mine, theirs, wealth: mine > theirs, keepers: mine > theirs / 2 };
}

/** Market spy table applied to a rival's creature: age 1, STR 2, AGI 3, CUN 5, HP 7, traits from 8. */
function creatureIntel(spies: number, c: Creature, geneticist: boolean) {
  return { age: spies >= 1, str: spies >= 2, agi: spies >= 3, cun: spies >= 5, hp: spies >= 7, traits: spies >= 8 ? Math.min(c.traits.length, spies - 7) : 0, wild: geneticist };
}

const Q = ({ need }: { need: number }) => <span className="hidden-stat" title={`Needs ${need} committed spies`}>?</span>;
const STAT_NEED = { str: 2, agi: 3, cun: 5, hp: 7 } as const;

const ACTION_ICON: Record<IntrigueAction, IconName> = { assassinate: 'skull', poison: 'drop', persuade: 'message', steal: 'coin', sabotage: 'flame', raid: 'horde' };
const ACTION_DESC: Record<IntrigueAction, string> = {
  sabotage: 'Set fire to their estate. A building may lose a level.',
  steal: 'Rob their strongbox or armory.',
  raid: 'Two of your dinos go over the palisade to kill and burn. A real fight against their defenders.',
  persuade: 'Talk their dino into working for you: it throws fights against you and may defect.',
  poison: 'Taint its feed. Illness or worse.',
  assassinate: 'Kill it in its pen.',
};

function rangeText(r: { min: number; max: number } | null): string {
  if (!r) return 'no agent free';
  return r.min === r.max ? `${r.max}%` : `${r.min}–${r.max}%`;
}

// ---------------------------------------------------------------------------------------------
// Intrigue tab
// ---------------------------------------------------------------------------------------------

export function IntrigueScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const rivals = g.rivals.filter((r) => !r.defeated && (r.ai?.visible ?? true)).sort((a, b) => b.influence - a.influence);
  const spies = safe(() => committedSpies(g, me), me.spiesLastWeek);
  const [def, setDef] = useState<PendingDefense | null>(null);
  const [scen, setScen] = useState<string | null>(null);
  const plans = g.player.intrigue;
  const agents = safe(() => availableAgents(g), [] as Creature[]);
  return (
    <>
      <ScreenHead title="Intrigue" sub={`${plural(rivals.length, 'rival house')} · ${plural(spies, 'committed spy', 'committed spies')}`} back={false} />
      {g.player.defenses.length > 0 && (
        <Plaque className="mb-3" label="Under threat" title={`${plural(g.player.defenses.length, 'scheme')} against you`} flush>
          {g.player.defenses.map((d) => (
            <button key={d.id} id={`defense-${d.id}`} type="button" className="attn-item" onClick={() => setDef(d)}>
              <span className="attn-ic bad"><Icon name="spy" size={18} /></span>
              <span className="attn-txt"><span className="attn-title">{ACTION_TEXT[d.action]}</span><span className="attn-sub" style={{ display: 'block' }}>Answer before you advance</span></span>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </Plaque>
      )}
      <div className="cols cols-wide-left">
        <Panel label="Sorted by influence" title="Rival houses" flush>
          {rivals.length === 0 && <EmptyState icon="spy" title="No rivals in sight">Rival houses appear as they arrive in Capua.</EmptyState>}
          {rivals.map((r) => {
            const op = opinionOf(r);
            const iv = rivalIntel(g, r);
            return (
              <button key={r.id} id={`rival-${r.ai?.key ?? r.id}`} type="button" className="rival-row" onClick={() => store.nav.push({ name: 'rival', id: r.id })}>
                <Portrait actor={rivalActor(r)} size={48} />
                <span className="rival-main">
                  <span className="row gap-2 wrap"><span className="strong">House {r.name}</span><Pill tone={op.tone}>{op.label}</Pill></span>
                  <span className="xs muted rival-hint">{personalityHint(r)}</span>
                  <span className="rival-stats">
                    <Influence value={r.influence} size="sm" />
                    {iv.wealth ? <Money value={r.denarii} size="sm" /> : <span className="money money-sm muted" title="Needs more committed spies than they have"><Icon name="coin" size={14} />?</span>}
                    <span className="xs muted row gap-1"><Icon name="keeper" size={13} />{iv.keepers ? safe(() => keeperCount(r), 0) : '?'}</span>
                    <span className="xs muted row gap-1"><Icon name="paw" size={13} />{r.creatures.length}</span>
                  </span>
                </span>
                <span className="row gap-1">{r.creatures.slice().sort((a, b) => b.fame - a.fame).slice(0, 2).map((c) => <DinoThumb key={c.id} creature={c} size={40} />)}<Icon name="chevronRight" size={18} className="muted" /></span>
              </button>
            );
          })}
        </Panel>
        <div className="stack">
          <Panel label="This week" title="Night work">
            {plans.length === 0 ? (
              <p className="small muted">No plans yet. Open a rival house to send an agent. Each agent can act once a week, and misses the arena for it.</p>
            ) : (
              <ul className="list-reset stack-sm">
                {plans.map((o) => {
                  const r = houseById(g, o.targetHouseId);
                  const a = me.creatures.find((c) => c.id === o.agentId);
                  return (
                    <li key={o.id} className="plan">
                      <div className="row gap-2 between">
                        <span className="row gap-2"><Icon name={ACTION_ICON[o.action]} size={16} className="amber" /><b>{ACTION_NAMES[o.action]}</b><span className="xs muted">vs {r?.name ?? 'a rival'} · {a?.name ?? 'agent'}</span></span>
                        {o.resolved ? <Pill tone={o.decision === 'retreat' ? 'muted' : 'info'}>{o.decision === 'retreat' ? 'Retreated' : 'Done'}</Pill> : <Btn id={`plan-${o.id}`} size="sm" variant="primary" onClick={() => setScen(o.id)}>Decide</Btn>}
                      </div>
                      {o.report && <p className="xs muted mt-1">{o.report}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel label="Agents" title={plural(agents.length, 'dino', 'dinos') + ' free tonight'}>
            <div className="row gap-1 wrap">{agents.slice(0, 10).map((c) => <span key={c.id} title={c.name}><DinoThumb creature={c} size={40} /></span>)}</div>
            {agents.length === 0 && <p className="small muted">Every dino is busy, away or hurt. Agents must be fit dinos (beasts make poor spies).</p>}
          </Panel>
          <Hint icon="spy">Spies show a rival&rsquo;s wealth when you have more committed spies than they do, and their keepers when you have more than half as many. Newly assigned spies count from next week.</Hint>
        </div>
      </div>
      {def && <DefenseSheet d={def} onClose={() => setDef(null)} />}
      {scen && <ScenarioSheet orderId={scen} onClose={() => setScen(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Rival dossier [DominusDetailsActivity]
// ---------------------------------------------------------------------------------------------

const BUILD_HINTS = ['residence', 'palisade', 'guardTower', 'veterinarium', 'forge', 'templeOfPluto', 'breedingPen'] as const;

export function RivalScreen() {
  const store = useStore();
  const g = store.game!;
  const r = g.rivals.find((x) => x.id === store.screen.id);
  const [action, setAction] = useState<{ action: IntrigueAction; target?: Creature } | null>(null);
  const [scen, setScen] = useState<string | null>(null);
  const [open, setOpen] = useState<Creature | null>(null);
  const [trade, setTrade] = useState<{ item: Creature | Gear } | null>(null);
  if (!r) return <><ScreenHead title="Rival" /><Plaque><EmptyState icon="spy" title="That house is gone">Its gates are shut and its pens are empty.</EmptyState></Plaque></>;
  const op = opinionOf(r);
  const iv = rivalIntel(g, r);
  const veil = hasOpp(g, 'veilOfNight');
  const ci = (c: Creature) => creatureIntel(iv.mine, c, g.unlocks.includes('geneticist'));
  const offered = !!r.ai?.offeredThisWeek;
  const creatures = [...r.creatures].sort((a, b) => b.level - a.level || b.fame - a.fame);
  const houseAction = (a: IntrigueAction) => {
    const locked = a === 'raid' && !veil;
    const rg = safe(() => chanceRange(g, a, r), null);
    return (
      <button key={a} type="button" id={`act-${a}`} className={`choice-btn act-btn${locked ? ' locked' : ''}`} disabled={!rg && !locked} onClick={() => (locked ? store.nav.push({ name: 'influence' }) : setAction({ action: a }))}>
        <span className="row gap-2 between" style={{ width: '100%' }}>
          <span className="row gap-2"><Icon name={locked ? 'lock' : ACTION_ICON[a]} size={16} />{ACTION_NAMES[a]}</span>
          <span className="xs num muted">{locked ? 'Veil of Night' : rangeText(rg)}</span>
        </span>
        <span className="cb-desc">{ACTION_DESC[a]}</span>
      </button>
    );
  };
  return (
    <>
      <ScreenHead title={`House ${r.name}`} sub={personalityHint(r)} />
      <div className="cols cols-wide-left">
        <div className="stack">
          <Plaque>
            <div className="dossier-head">
              <Portrait actor={rivalActor(r)} size={84} />
              <div className="grow">
                <div className="row gap-2 wrap"><Pill tone={op.tone}>{op.label}</Pill>{r.trophies.length > 0 && <Pill tone="amber" icon="trophy">{r.trophies.length} trophies</Pill>}</div>
                <div className="row gap-2 mt-2"><span className="xs muted">Opinion</span><Meter value={Math.max(0, op.value)} max={100} tone={op.tone === 'muted' ? 'amber' : op.tone} height={6} label="Opinion" /><span className="xs num">{Math.round(Math.max(1, op.value))}</span></div>
                <div className="kv-grid mt-2">
                  <KV k="Influence"><Influence value={r.influence} size="sm" /></KV>
                  <KV k="Wealth" title={iv.wealth ? undefined : `Needs more than ${iv.theirs} committed spies`}>{iv.wealth ? <Money value={r.denarii} size="sm" /> : <Q need={iv.theirs + 1} />}</KV>
                  <KV k="Keepers" title={iv.keepers ? undefined : `Needs more than ${iv.theirs / 2} committed spies`}>{iv.keepers ? safe(() => keeperCount(r), 0) : <Q need={Math.floor(iv.theirs / 2) + 1} />}</KV>
                  <KV k="Your spies">{iv.mine}</KV>
                </div>
              </div>
            </div>
            <Rule>Estate</Rule>
            <div className="bld-hints">
              {BUILD_HINTS.map((b) => {
                const lv = r.buildings[b] ?? 0;
                const max = BUILDINGS[b]?.levels.length ?? 3;
                return (
                  <div key={b} className="bld-hint">
                    <span className="xs">{BUILDINGS[b]?.name ?? camelToWords(b)}</span>
                    <span className="bld-lv" aria-label={`Level ${lv} of ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < lv ? 'on' : ''} />)}</span>
                  </div>
                );
              })}
            </div>
          </Plaque>
          <Panel label="Against the house" title="Night work">
            <div className="choices">{(['sabotage', 'steal', 'raid'] as IntrigueAction[]).map(houseAction)}</div>
            <p className="xs muted mt-2">The chance shown is the range over your free agents. You pick the agent next.</p>
          </Panel>
        </div>
        <div className="stack">
          <Panel label={`${r.creatures.length} in the pens`} title="Their dinos" flush>
            {creatures.length === 0 && <EmptyState icon="paw" title="Empty pens">House {r.name} has nobody left.</EmptyState>}
            {creatures.map((c) => {
              const v = ci(c);
              return (
                <CreatureRow key={c.id} id={`rc-${c.id}`} c={c} g={null} onClick={() => setOpen(c)} thumb={48} chips={false}
                  sub={<span className="stat-mini">{STATS.map((s) => <span key={s}>{STAT_SHORT[s]} {v[s] ? <b>{getStat(c, s)}</b> : <Q need={STAT_NEED[s]} />}</span>)}<span>fame <b>{fmt(c.fame)}</b></span></span>}
                  right={<><span className="crow-lv"><small>LV</small>{c.level}</span><span className="xs muted">{SPECIES[c.species].name}</span></>} />
              );
            })}
          </Panel>
          <Panel label="Trade" title="Their armory" flush actions={offered ? <Pill tone="muted">Offer made this week</Pill> : undefined}>
            {r.armory.length === 0 && <div className="empty small muted">Nothing worth buying.</div>}
            {r.armory.slice().sort((a, b) => gearWorth(b) - gearWorth(a)).slice(0, 12).map((x) => (
              <div key={x.id} className="offer">
                <span className="bld-ic" style={{ width: 36, height: 36 }}><Icon name={SLOT_ICON[GEAR[x.type].slot]} size={16} /></span>
                <div style={{ minWidth: 0 }}><GearName g={x} /><div className="xs muted num">{gearLineText(x)}</div></div>
                <Btn id={`offer-g-${x.id}`} size="sm" disabled={offered} onClick={() => setTrade({ item: x })}>Offer</Btn>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {open && (
        <Sheet open onClose={() => setOpen(null)} title={open.name} label={`${SPECIES[open.species].name} · House ${r.name}`}
          footer={<div className="row gap-2 end wrap"><Btn id="rc-offer" icon="coin" disabled={offered} title={offered ? 'One offer per house per week' : undefined} onClick={() => { setTrade({ item: open }); setOpen(null); }}>Make an offer</Btn></div>}>
          {(() => {
            const v = ci(open);
            const acts: IntrigueAction[] = open.kind === 'dino' ? ['persuade', 'poison', 'assassinate'] : ['poison', 'assassinate'];
            return (
              <div className="stack">
                <div className="hero" style={{ border: 0 }}><div className="hero-art"><DinoArt creature={open} width={240} /></div></div>
                <div className="grid-2">
                  <KV k="Level">{open.level}</KV>
                  <KV k="Age">{v.age ? `${lifePhase(open)} · ${ageLabel(open)}` : <Q need={1} />}</KV>
                  {STATS.map((s) => <KV key={s} k={STAT_SHORT[s]}>{v[s] ? getStat(open, s) : <Q need={STAT_NEED[s]} />}</KV>)}
                  <KV k="Fame">{fmt(open.fame)}</KV>
                  <KV k="Wild level">{v.wild ? wildLevel(open) : <span className="hidden-stat" title="Needs the Geneticist upgrade">?</span>}</KV>
                </div>
                <div className="row gap-1 wrap">
                  {open.traits.slice(0, v.traits).map((t) => <Pill key={t} tone="muted">{TRAITS[t]?.name ?? t}</Pill>)}
                  {open.traits.length > v.traits && <Pill tone="muted">{open.traits.length - v.traits} hidden trait{open.traits.length - v.traits > 1 ? 's' : ''}</Pill>}
                  {open.injury && <Pill tone="bad" icon="injury">Injured</Pill>}
                </div>
                <Rule>Night work</Rule>
                <div className="choices">
                  {acts.map((a) => {
                    const rg = safe(() => chanceRange(g, a, r, open), null);
                    return (
                      <button key={a} type="button" id={`cact-${a}`} className="choice-btn act-btn" disabled={!rg} onClick={() => { setAction({ action: a, target: open }); setOpen(null); }}>
                        <span className="row gap-2 between" style={{ width: '100%' }}><span className="row gap-2"><Icon name={ACTION_ICON[a]} size={16} />{ACTION_NAMES[a]}</span><span className="xs num muted">{rangeText(rg)}</span></span>
                        <span className="cb-desc">{ACTION_DESC[a]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Sheet>
      )}
      {action && <AgentSheet rival={r} action={action.action} target={action.target} onClose={() => setAction(null)} onPlanned={(o) => { setAction(null); setScen(o.id); }} />}
      {scen && <ScenarioSheet orderId={scen} onClose={() => setScen(null)} />}
      {trade && <TradeSheet rival={r} item={trade.item} onClose={() => setTrade(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Agent selection [AgentSelectionActivity]
// ---------------------------------------------------------------------------------------------

function AgentSheet({ rival, action, target, onClose, onPlanned }: { rival: Ludus; action: IntrigueAction; target?: Creature; onClose: () => void; onPlanned: (o: IntrigueOrder) => void }) {
  const store = useStore();
  const g = store.game!;
  const registered = new Set(Object.values(g.player.registrations).flat(2));
  const agents = safe(() => availableAgents(g), [] as Creature[])
    .map((c) => ({ c, p: safe(() => intrigueChance(g, action, c, rival, target), 0) }))
    .sort((a, b) => Number(registered.has(a.c.id)) - Number(registered.has(b.c.id)) || b.p - a.p);
  const send = (c: Creature) => {
    const o = store.act((s) => planIntrigue(s, action, c.id, rival.id, target?.id));
    if (o && typeof o === 'object') onPlanned(o);
  };
  return (
    <Sheet open onClose={onClose} wide title={`${ACTION_NAMES[action]}${target ? ` ${target.name}` : ''}`} label={`Choose an agent · House ${rival.name}`}>
      <p className="small muted mb-2">{ACTION_DESC[action]} The agent misses the arena this week, win or lose.{action === 'raid' ? ' Your most famous free dino goes along as the second raider.' : ''}</p>
      {agents.length === 0 && <EmptyState icon="spy" title="Nobody is free">Agents must be fit dinos that have not fought or schemed this week.</EmptyState>}
      <div className="panel flush"><div className="panel-body" style={{ padding: 0 }}>
        {agents.map(({ c, p }) => (
          <CreatureRow key={c.id} id={`agent-${c.id}`} c={c} g={g} onClick={() => send(c)} thumb={48} showTame={false}
            sub={registered.has(c.id) ? <span className="warn">Registered for the arena: would miss it</span> : undefined}
            right={<><span className={`agent-pct num ${p >= 60 ? 'good' : p >= 35 ? 'warn' : 'bad'}`}>{p}%</span><span className="xs muted">chance</span></>} />
        ))}
      </div></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// The night scenario [IntrigueActivity animation + IntrigueReportActivity]
// ---------------------------------------------------------------------------------------------

function NightScene({ agent, mode, raid }: { agent?: Creature; mode: 'sneak' | 'proceed' | 'retreat'; raid?: boolean }) {
  return (
    <div className={`night-scene ${mode}`} aria-hidden="true">
      <svg className="night-bg" viewBox="0 0 400 180" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#070912" /><stop offset=".7" stopColor="#141a2c" /><stop offset="1" stopColor="#1d1a1c" /></linearGradient>
          <radialGradient id="ntorch" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffb85a" stopOpacity=".55" /><stop offset="1" stopColor="#ffb85a" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="400" height="180" fill="url(#nsky)" />
        {[[30, 20], [80, 42], [130, 14], [210, 30], [260, 12], [318, 40], [370, 22], [168, 52], [52, 64]].map(([x, y], i) => <circle key={i} className="twinkle" cx={x} cy={y} r={i % 3 ? 0.9 : 1.4} fill="#e8e2d0" style={{ animationDelay: `${i * 0.4}s` }} />)}
        <path d="M352 30a16 16 0 1 0 6 24a13 13 0 1 1-6-24z" fill="#e8dfc4" opacity=".85" />
        <path d="M0 150 L60 128 L120 140 L190 118 L260 136 L330 122 L400 138 V180 H0z" fill="#0d1018" />
        {/* palisade */}
        <g fill="#2a2018" stroke="#140e0a" strokeWidth="1">
          {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${232 + i * 13} 160 V${104 - (i % 3) * 4} l6 -9 l6 9 V160z`} />)}
        </g>
        <rect x="232" y="128" width="170" height="5" fill="#1a130d" />
        {/* guard with torch */}
        <circle cx="306" cy="96" r="26" fill="url(#ntorch)" className="torch-glow" />
        <path className="flame" d="M306 80c3 4 4 7 0 11c-4-4-3-7 0-11z" fill="#ffc46b" />
        <rect x="305" y="90" width="2" height="16" fill="#5a4030" />
        <path d="M316 160v-30a6 6 0 0 1 12 0v30z M322 118a5 5 0 1 0 .1 0z" fill="#0e0b0a" />
        <rect y="160" width="400" height="20" fill="#14100d" />
      </svg>
      {agent && (
        <div className="night-agent">
          <DinoArt creature={agent} width={raid ? 130 : 110} animate={false} />
        </div>
      )}
    </div>
  );
}

export function ScenarioSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const o = g.player.intrigue.find((x) => x.id === orderId);
  const [res, setRes] = useState<{ text: string; success: boolean; battle?: BattleResult } | null>(o?.resolved ? { text: o.report ?? '', success: false } : null);
  const [mode, setMode] = useState<'sneak' | 'proceed' | 'retreat'>(o?.resolved ? (o.decision === 'retreat' ? 'retreat' : 'proceed') : 'sneak');
  useEffect(() => { if (!o?.resolved) sfx.night(); }, [o?.resolved]);
  if (!o) return null;
  const agent = g.player.ludus.creatures.find((c) => c.id === o.agentId);
  const rival = houseById(g, o.targetHouseId);
  const target = o.targetCreatureId ? rival?.creatures.find((c) => c.id === o.targetCreatureId) : undefined;
  const sc = SCENARIO_DEFS[o.scenario];
  const decide = (d: 'proceed' | 'retreat') => {
    setMode(d);
    const r = store.act((s) => resolveIntrigue(s, o.id, d), { quiet: true });
    if (!r) return;
    window.setTimeout(() => {
      setRes(r);
      if (d === 'proceed') { if (r.success) sfx.coin(); else sfx.groan(); }
      if (r.battle) store.showBattle(r.battle, `Night raid on House ${rival?.name ?? ''}`, undefined, { sideNames: [g.player.ludus.name, rival?.name ?? 'Defenders'] });
    }, 700);
  };
  return (
    <Sheet open onClose={onClose} sticky={!res} title={`${ACTION_NAMES[o.action]}${target ? `: ${target.name}` : ''}`} label={`Night · House ${rival?.name ?? 'unknown'}`}
      footer={res ? (
        <div className="row gap-2 end wrap">
          {res.battle && <Btn id="scen-battle" icon="arena" onClick={() => store.showBattle(res.battle!, `Night raid on House ${rival?.name ?? ''}`)}>Watch the raid</Btn>}
          <Btn id="scen-done" variant="primary" onClick={onClose}>Continue</Btn>
        </div>
      ) : (
        <div className="row gap-2 end wrap">
          <Btn id="scen-retreat" icon="back" disabled={mode !== 'sneak'} onClick={() => decide('retreat')}>Retreat</Btn>
          <Btn id="scen-proceed" variant="primary" icon="spy" disabled={mode !== 'sneak'} onClick={() => decide('proceed')}>Proceed</Btn>
        </div>
      )}>
      <NightScene agent={agent} mode={mode} raid={o.action === 'raid'} />
      {!res ? (
        <div className="mt-3">
          <p className="story-intro">{sc?.text ?? 'The night is quiet.'}</p>
          <div className="row gap-2 wrap mt-2">
            <Pill tone="info" icon="dice">If you proceed: {sc?.range ?? '±0'}</Pill>
            {agent && <Pill tone="muted">{agent.name}</Pill>}
          </div>
          <p className="xs muted mt-2">Retreating is safe: {agent?.name ?? 'the agent'} learns something (+15 XP) but the night is wasted.</p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="row gap-2 mb-2">{mode === 'retreat' ? <Pill tone="muted" icon="back">Retreated</Pill> : res.success ? <Pill tone="good" icon="check">Success</Pill> : <Pill tone="bad" icon="close">Failure</Pill>}</div>
          <p className="story-intro">{res.text}</p>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Trade [OfferActivity]
// ---------------------------------------------------------------------------------------------

function TradeSheet({ rival, item, onClose }: { rival: Ludus; item: Creature | Gear; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const isC = 'species' in item;
  const name = isC ? item.name : gearName(item);
  const ask = safe(() => rivalAskingPrice(g, rival, item.id), 0);
  const [amount, setAmount] = useState(Math.max(10, Math.min(me.denarii, Math.round((ask * 0.9) / 10) * 10)));
  const [res, setRes] = useState<{ ok: boolean; text: string; counter?: number } | null>(null);
  const offered = !!rival.ai?.offeredThisWeek;
  const submit = () => {
    const r = store.act((s) => ({ res: offerToRival(s, rival.id, item.id, amount) }));
    if (r) setRes(r.res);
  };
  const step = amount >= 1000 ? 50 : 10;
  return (
    <Sheet open onClose={onClose} title={`Offer for ${name}`} label={`Trade · House ${rival.name}`}
      footer={res ? <div className="row end"><Btn id="trade-done" variant="primary" onClick={onClose}>Done</Btn></div> : (
        <div className="row between gap-2 wrap">
          <span className="small">You have <Money value={me.denarii} size="sm" /></span>
          <Btn id="trade-go" variant="primary" icon="coin" disabled={offered || amount <= 0 || amount > me.denarii} onClick={submit}>Offer {fmt(amount)}</Btn>
        </div>
      )}>
      <div className="stack">
        <div className="row gap-3">
          {isC ? <DinoThumb creature={item} size={64} /> : <span className="bld-ic"><Icon name={SLOT_ICON[GEAR[item.type].slot]} size={20} /></span>}
          <div className="grow">
            <div className="strong">{isC ? <span className="row gap-1">{item.name}<SexIcon sex={item.sex} size={14} /></span> : <GearName g={item} />}</div>
            <div className="xs muted">{isC ? `${SPECIES[item.species].name} · level ${item.level} · fame ${fmt(item.fame)}` : gearLineText(item)}</div>
          </div>
        </div>
        {res ? (
          <div className={`trade-res ${res.ok ? 'ok' : 'no'}`}>
            <p className="story-intro">{res.text}</p>
            {!res.ok && res.counter ? <p className="small">Their price: <Money value={res.counter} size="sm" />. One offer per house per week: come back next week.</p> : null}
          </div>
        ) : offered ? (
          <Hint icon="warning">House {rival.name} will not hear another offer until next week.</Hint>
        ) : (
          <>
            <KV k="They are asking about">{ask > 0 ? <Money value={ask} size="sm" /> : '—'}</KV>
            <div className="row gap-2 wrap">
              <Stepper id="trade-amount" label="denarii" value={fmt(amount)} onDec={() => setAmount(Math.max(step, amount - step))} onInc={() => setAmount(Math.min(me.denarii, amount + step))} decDisabled={amount <= step} incDisabled={amount + step > me.denarii} />
              <Btn id="trade-90" size="sm" variant="ghost" onClick={() => setAmount(Math.min(me.denarii, Math.round(ask * 0.9)))}>90%</Btn>
              <Btn id="trade-ask" size="sm" variant="ghost" disabled={ask > me.denarii} onClick={() => setAmount(ask)}>Their price</Btn>
            </div>
            <p className="xs muted">Opinion moves the price: a house that likes you asks less. Below their price they name a counter-offer; you may only make one offer to a house each week.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Schemes against you (defender prompt)
// ---------------------------------------------------------------------------------------------

export const ACTION_TEXT: Record<IntrigueAction, string> = {
  assassinate: 'An assassin is loose in your ludus', poison: 'Someone is tampering with the feed', persuade: 'A rival is whispering to your dinos',
  steal: 'A thief is after your strongbox', sabotage: 'Saboteurs are near the pens', raid: 'Armed men gather at your palisade',
};

export function DefenseSheet({ d, onClose }: { d: PendingDefense; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const [text, setText] = useState<string | null>(null);
  const raw = DEFENSE_PROMPTS[d.prompt] ?? DEFENSE_PROMPTS[3];
  const prompt = safe(() => defensePromptText(g, d), { title: 'Something stirs in the night', text: raw?.text ?? '', assertive: raw?.assertive ?? 'Confront them', passive: raw?.passive ?? 'Wait' });
  const rival = houseById(g, d.rivalId);
  const spies = safe(() => committedSpies(g, g.player.ludus), 0);
  const answer = (choice: 'assertive' | 'passive') => {
    const r = store.act((s) => resolveDefense(s, d.id, choice), { stringIsText: true });
    if (typeof r === 'string') {
      setText(r);
      if (/killed|stole|burn|lost|poison/i.test(r)) sfx.groan();
    }
  };
  return (
    <Sheet open onClose={onClose} title={text ? 'Morning after' : prompt.title} label={rival && spies >= 1 ? `House ${rival.name} · ${ACTION_TEXT[d.action]}` : ACTION_TEXT[d.action]}
      footer={text ? <div className="row end"><Btn id="defense-done" variant="primary" onClick={onClose}>Continue</Btn></div> : undefined}>
      <NightScene mode="sneak" />
      <p className="story-intro mt-3">{text ?? prompt.text}</p>
      {!text && (
        <>
          {spies >= 1 && d.chance > 0 && <p className="small muted">Your spies put the scheme&rsquo;s chance at about <b className="num">{Math.round(d.chance)}%</b> before your answer.</p>}
          <div className="choices mt-2">
            <button type="button" id="defense-assertive" className="choice-btn" onClick={() => answer('assertive')}>
              <span>{prompt.assertive}</span>
              <span className="cb-desc">Act on it.</span>
            </button>
            <button type="button" id="defense-passive" className="choice-btn" onClick={() => answer('passive')}>
              <span>{prompt.passive}</span>
              <span className="cb-desc">Let it be.</span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
