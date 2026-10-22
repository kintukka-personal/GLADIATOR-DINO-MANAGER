// Hub [OverviewActivity]: estate banner, week/season/temperature, money, the big Advance button,
// what needs attention, quick links; story conversation, decision, defense and adventure sheets.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BattleResult, Decision, GameState, PendingDefense, StoryConversation } from '../../engine/types';
import { seasonName } from '../../engine/breeding';
import { answerConversation } from '../../engine/stories';
import { resolveDecision } from '../../engine/events';
import { resolveDefense, DEFENSE_PROMPTS } from '../../engine/intrigue';
import { resolveAdventure, type AdventureResolution } from '../../engine/adventures';
import { useStore } from '../store';
import { Icon, type IconName } from '../components/Icon';
import { Btn, Influence, Money, Panel, Plaque, Hint } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { EstateBanner } from '../art/EstateBanner';
import { Portrait, ACTOR_NAME } from '../art/Portrait';
import { attention } from './attention';
import { fmt, plural } from '../format';
import { keepersOf } from '../derive';
import { devSampleResults } from '../devFixture';
import { houseById } from '../../engine/util';

// ---------------------------------------------------------------------------------------------
// Advance
// ---------------------------------------------------------------------------------------------

function advanceWarnings(g: GameState): string[] {
  const a = attention(g);
  const out: string[] = [];
  if (a.care) out.push(`${plural(a.care, 'hatchling')} still ${a.care === 1 ? 'waits' : 'wait'} for care. A missed care request is gone for good.`);
  if (a.decisions) out.push(`${plural(a.decisions, 'decision')} unanswered.`);
  if (a.defenses) out.push('A rival scheme against you awaits your answer.');
  if (a.eggsAtRisk) out.push(`${plural(a.eggsAtRisk, 'egg')} kept outside ${a.eggsAtRisk === 1 ? 'its' : 'their'} ideal temperature.`);
  const fighters = g.player.ludus.creatures.filter((c) => c.maturity >= 1 && !c.injury && !c.away).length;
  const registered = Object.keys(g.player.registrations).length;
  if (fighters > 0 && registered === 0 && g.world.tournaments.length > 0 && g.world.week < 50) out.push('No dino is registered for a tournament this week.');
  return out;
}

export function AdvanceButton({ compact }: { compact?: boolean }) {
  const store = useStore();
  const g = store.game!;
  const [warn, setWarn] = useState<string[] | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const go = () => {
    setWarn(null);
    store.advance((msg) => setBlocked(msg));
  };
  const click = () => {
    const w = advanceWarnings(g);
    if (w.length) setWarn(w);
    else go();
  };
  return (
    <>
      {compact ? (
        <Btn id="sb-advance" variant="primary" icon="advance" onClick={click} aria-label="Advance the week">Advance</Btn>
      ) : (
        <Btn id="hub-advance" variant="primary" size="lg" block icon="advance" onClick={click}>Advance to week {g.world.week + 1}</Btn>
      )}
      <Sheet
        open={!!warn}
        onClose={() => setWarn(null)}
        title="End the week?"
        label={`Week ${g.world.week}`}
        footer={
          <div className="row gap-2 end wrap">
            <Btn variant="ghost" onClick={() => setWarn(null)}>Not yet</Btn>
            <Btn id="advance-confirm" variant="primary" icon="advance" onClick={go}>Advance anyway</Btn>
          </div>
        }
      >
        <ul className="list-reset stack-sm">
          {warn?.map((w) => (
            <li key={w} className="row gap-2 top small"><Icon name="warning" size={16} className="warn" /><span>{w}</span></li>
          ))}
        </ul>
      </Sheet>
      <Sheet
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title="The week cannot end yet"
        footer={
          <div className="row gap-2 end wrap">
            {store.dev && (
              <Btn
                id="advance-preview"
                onClick={() => {
                  setBlocked(null);
                  store.act((s) => {
                    s.results = devSampleResults(s);
                    return true;
                  });
                  store.nav.reset([{ name: 'hub' }, { name: 'results' }]);
                }}
              >
                Preview sample results
              </Btn>
            )}
            <Btn variant="primary" onClick={() => setBlocked(null)}>Back to the ludus</Btn>
          </div>
        }
      >
        <p className="small">{blocked}</p>
        <p className="small muted">Week resolution runs every system of the ludus. Some of them are still being built, so nothing was changed and your game is safe.</p>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Typewriter + conversation
// ---------------------------------------------------------------------------------------------

function useReducedMotion(): boolean {
  const { meta } = useStore();
  const [sys, setSys] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setSys(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, []);
  return sys || meta.settings.reduceMotion;
}

export { useReducedMotion };

function ConversationSheet({ conv, onClose }: { conv: StoryConversation; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const reduce = useReducedMotion();
  const total = conv.lines.reduce((n, l) => n + l.text.length, 0);
  const [chars, setChars] = useState(reduce ? total : 0);
  const [result, setResult] = useState<{ text: string; battle?: BattleResult } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduce || chars >= total) return;
    const t = window.setTimeout(() => setChars((c) => Math.min(total, c + 2)), 28);
    return () => window.clearTimeout(t);
  }, [chars, total, reduce]);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'nearest' }), [chars, result]);
  let budget = chars;
  const done = chars >= total;
  const answer = (i: number) => {
    const r = store.act((s) => answerConversation(s, conv.id, i));
    if (r) setResult(r);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={conv.title}
      label={ACTOR_NAME[conv.actor] ?? 'A conversation'}
      footer={!done ? (
        <div className="row end"><Btn id="conv-skip" variant="ghost" icon="skip" onClick={() => setChars(total)}>Skip</Btn></div>
      ) : result ? (
        <div className="row gap-2 end wrap">
          {result.battle && <Btn id="conv-battle" icon="arena" onClick={() => store.showBattle(result.battle!, conv.title)}>Watch the fight</Btn>}
          <Btn id="conv-done" variant="primary" onClick={onClose}>Continue</Btn>
        </div>
      ) : undefined}
    >
      <div className="chat" aria-live="polite">
        {conv.lines.map((l, i) => {
          if (budget <= 0) return null;
          const shown = l.text.slice(0, budget);
          const typing = budget < l.text.length;
          budget -= l.text.length;
          const me = l.actor === 'player';
          const narr = l.actor === 'narrator';
          return (
            <div key={i} className={`chat-line${me ? ' me' : ''}${narr ? ' narrator' : ''}`}>
              {!narr && <Portrait actor={l.actor} female={g.player.female} size={40} />}
              <div className="chat-bubble">
                {!narr && <div className="chat-who">{me ? g.player.lanista : ACTOR_NAME[l.actor] ?? l.actor}</div>}
                {shown}{typing && <span className="caret" aria-hidden="true" />}
              </div>
            </div>
          );
        })}
        {done && !result && (
          <div className="choices mt-2">
            {conv.options.map((o, i) => (
              <button key={i} id={`conv-opt-${i}`} type="button" className="choice-btn" disabled={o.disabled} onClick={() => answer(i)}>
                <span>{o.label}</span>
                {o.desc && <span className="cb-desc">{o.desc}</span>}
                {o.disabled && o.reason && <span className="cb-reason"><Icon name="lock" size={12} />{o.reason}</span>}
              </button>
            ))}
          </div>
        )}
        {result && <div className="chat-line narrator"><div className="chat-bubble">{result.text}</div></div>}
        <div ref={endRef} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Decision / defense / adventure
// ---------------------------------------------------------------------------------------------

export function DecisionSheet({ d, onClose }: { d: Decision; onClose: () => void }) {
  const store = useStore();
  const [result, setResult] = useState<{ text: string; battle?: BattleResult } | null>(null);
  const choose = (i: number) => {
    const r = store.act((s) => resolveDecision(s, d.id, i));
    if (r) {
      setResult(r);
      if (r.battle) store.showBattle(r.battle, d.title);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={d.title}
      label={`Event · week ${d.week}`}
      footer={result ? (
        <div className="row gap-2 end wrap">
          {result.battle && <Btn icon="arena" onClick={() => store.showBattle(result.battle!, d.title)}>Watch again</Btn>}
          <Btn id="decision-done" variant="primary" onClick={onClose}>Continue</Btn>
        </div>
      ) : undefined}
    >
      <p className="story-intro">{result ? result.text : d.text}</p>
      {!result && (
        <div className="choices mt-3">
          {d.options.map((o, i) => (
            <button key={i} id={`decision-opt-${i}`} type="button" className="choice-btn" disabled={o.disabled} onClick={() => choose(i)}>
              <span>{o.label}</span>
              {o.desc && <span className="cb-desc">{o.desc}</span>}
              {o.disabled && o.reason && <span className="cb-reason"><Icon name="lock" size={12} />{o.reason}</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

const ACTION_TEXT: Record<string, string> = {
  assassinate: 'An assassin is loose in your ludus', poison: 'Someone is tampering with the feed', persuade: 'A rival is whispering to your dinos',
  steal: 'A thief is after your armory', sabotage: 'Saboteurs are near the pens', raid: 'Armed men gather at your palisade',
};

function DefenseSheet({ d, onClose }: { d: PendingDefense; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const [text, setText] = useState<string | null>(null);
  const prompt = DEFENSE_PROMPTS[d.prompt];
  const rival = houseById(g, d.rivalId);
  const target = d.targetCreatureId ? g.player.ludus.creatures.find((c) => c.id === d.targetCreatureId) : undefined;
  const answer = (choice: 'assertive' | 'passive') => {
    const r = store.act((s) => resolveDefense(s, d.id, choice), { stringIsText: true });
    if (typeof r === 'string') setText(r);
  };
  return (
    <Sheet open onClose={onClose} title={ACTION_TEXT[d.action] ?? 'A scheme against you'} label={rival ? `House ${rival.name}` : 'A rival house'}
      footer={text ? <div className="row end"><Btn variant="primary" onClick={onClose}>Continue</Btn></div> : undefined}>
      <p className="story-intro">
        {text ?? prompt?.text ?? `Your wardens report movement in the night${target ? ` near ${target.name}` : ''}. How do you respond?`}
      </p>
      {!text && (
        <>
          <p className="small muted">Estimated chance the scheme succeeds: <b className="num">{Math.round(d.chance * 100)}%</b></p>
          <div className="choices mt-2">
            <button type="button" id="defense-assertive" className="choice-btn" onClick={() => answer('assertive')}>
              <span>{prompt?.assertive ?? 'Confront them'}</span>
              <span className="cb-desc">Risky, but may catch the agent.</span>
            </button>
            <button type="button" id="defense-passive" className="choice-btn" onClick={() => answer('passive')}>
              <span>{prompt?.passive ?? 'Double the guard and wait'}</span>
              <span className="cb-desc">Safer; the scheme may still succeed.</span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function AdventureSheet({ a, onClose }: { a: AdventureResolution; onClose: () => void }) {
  const store = useStore();
  const [res, setRes] = useState<{ text: string; battle?: BattleResult; success: boolean } | null>(null);
  const go = (choice?: number) => {
    const r = store.act((s) => resolveAdventure(s, a.adventure.id, choice));
    if (r) {
      setRes(r);
      if (r.battle) store.showBattle(r.battle, a.adventure.title);
    }
  };
  return (
    <Sheet open onClose={onClose} title={a.adventure.title} label="Adventure returns"
      footer={res ? <div className="row end"><Btn variant="primary" onClick={onClose}>Continue</Btn></div> : !a.choices?.length ? <div className="row end"><Btn variant="primary" onClick={() => go()}>Hear the tale</Btn></div> : undefined}>
      <p className="story-intro">{res ? res.text : a.text}</p>
      {!res && a.choices?.length ? (
        <div className="choices mt-2">
          {a.choices.map((c, i) => <button key={i} type="button" className="choice-btn" onClick={() => go(i)}>{c}</button>)}
        </div>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------------------------

interface AttnRow { id: string; icon: IconName; tone: string; title: string; sub?: string; onClick: () => void }

export function HubScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const a = attention(g);
  const [conv, setConv] = useState<StoryConversation | null>(null);
  const [dec, setDec] = useState<Decision | null>(null);
  const [def, setDef] = useState<PendingDefense | null>(null);
  const [adv, setAdv] = useState<AdventureResolution | null>(null);
  const star = useMemo(() => [...me.creatures].filter((c) => c.maturity >= 1 && c.kind === 'dino').sort((x, y) => y.fame - x.fame)[0] ?? null, [me.creatures, store.v]);
  const adults = me.creatures.filter((c) => c.maturity >= 1).length;

  const rows: AttnRow[] = [];
  if (a.conversation) rows.push({ id: 'attn-conversation', icon: 'scroll', tone: 'amber', title: `${ACTOR_NAME[a.conversation.actor] ?? 'Someone'} wants a word`, sub: a.conversation.title, onClick: () => setConv(a.conversation) });
  if (a.decisions) rows.push({ id: 'attn-decision', icon: 'bell', tone: 'amber', title: g.player.decisions[0].title, sub: a.decisions > 1 ? `${a.decisions} decisions waiting` : 'A decision awaits you', onClick: () => setDec(g.player.decisions[0]) });
  if (a.defenses) {
    const d = g.player.defenses[0];
    rows.push({ id: 'attn-defense', icon: 'spy', tone: 'bad', title: `${houseById(g, d.rivalId)?.name ?? 'A rival'} is scheming`, sub: ACTION_TEXT[d.action], onClick: () => setDef(d) });
  }
  for (const ad of a.adventures) rows.push({ id: `attn-adv-${ad.adventure.id}`, icon: 'flag', tone: 'info', title: `${ad.adventure.title} has returned`, sub: 'Hear what happened', onClick: () => setAdv(ad) });
  if (a.care) rows.push({ id: 'attn-care', icon: 'baby', tone: 'amber', title: `${plural(a.care, 'hatchling')} ${a.care === 1 ? 'wants' : 'want'} care`, sub: 'Cuddle, walk or feed them before the week ends', onClick: () => store.nav.area('breeding', 'nursery') });
  if (a.eggsAtRisk) rows.push({ id: 'attn-eggs', icon: 'thermo', tone: 'info', title: `${plural(a.eggsAtRisk, 'egg')} at risk`, sub: `Ambient ${g.world.temperature}°C is outside the ideal range`, onClick: () => store.nav.area('breeding', 'hatchery') });
  if (a.offers) {
    const o = g.player.offers[0];
    const c = me.creatures.find((x) => x.id === o.creatureId);
    rows.push({ id: 'attn-offer', icon: 'coin', tone: 'amber', title: `${houseById(g, o.rivalId)?.name ?? 'A rival'} bids ${fmt(o.amount)} for ${c?.name ?? 'a dino'}`, sub: `Expires week ${o.expiresWeek}`, onClick: () => store.nav.area('market', 'offers') });
  }
  if (a.injured) rows.push({ id: 'attn-injured', icon: 'injury', tone: 'bad', title: `${plural(a.injured, 'dino')} injured`, sub: me.creatures.filter((c) => c.injury).map((c) => `${c.name} (${c.injury!.weeks}w)`).join(', '), onClick: () => store.nav.area('ludus') });
  if (a.statPoints) rows.push({ id: 'attn-points', icon: 'plus', tone: 'amber', title: `${plural(a.statPoints, 'dino')} with unspent points`, sub: 'Spend them on the Stats tab', onClick: () => store.nav.area('ludus') });
  if (a.unread) rows.push({ id: 'attn-messages', icon: 'message', tone: 'info', title: `${plural(a.unread, 'unread message')}`, sub: g.player.messages.find((m) => !m.read)?.title, onClick: () => store.nav.area('messages') });
  if (a.objectives) rows.push({ id: 'attn-objectives', icon: 'flag', tone: 'good', title: `${plural(a.objectives, 'objective')} to claim`, onClick: () => store.nav.area('objectives') });

  const quick: { name: 'objectives' | 'messages' | 'events' | 'finance' | 'influence' | 'estate' | 'horde'; label: string; icon: IconName; badge: number }[] = [
    { name: 'objectives', label: 'Objectives', icon: 'flag', badge: a.objectives },
    { name: 'messages', label: 'Messages', icon: 'message', badge: a.unread },
    { name: 'events', label: 'Events', icon: 'bell', badge: a.decisions },
    { name: 'finance', label: 'Finance', icon: 'finance', badge: 0 },
    { name: 'influence', label: 'Influence', icon: 'laurel', badge: 0 },
    { name: 'estate', label: 'Estate', icon: 'estate', badge: 0 },
    { name: 'horde', label: 'Horde', icon: 'horde', badge: 0 },
  ];

  return (
    <div className="cols cols-wide-left">
      <div className="stack">
        <div className="estate-banner">
          <EstateBanner ludus={me} week={g.world.week} star={star} />
          <div className="estate-overlay">
            <div>
              <h2>{me.name}</h2>
              <div className="eo-sub">Lanista {g.player.lanista} · {g.player.heritage[0].toUpperCase() + g.player.heritage.slice(1)}</div>
            </div>
            <div className="estate-chips">
              <span className="estate-chip"><Icon name="hourglass" size={13} />Week {g.world.week}</span>
              <span className="estate-chip"><Icon name="sun" size={13} />{seasonName(g.world.week)}</span>
              <span className="estate-chip"><Icon name="thermo" size={13} />{g.world.temperature}°C</span>
              {g.world.week % 4 === 0 && <span className="estate-chip"><Icon name="moon" size={13} />Full moon</span>}
            </div>
          </div>
        </div>
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="hub-stats">
            <div className="hub-stat"><span className="micro">Denarii</span><span className="v"><Money value={me.denarii} /></span></div>
            <div className="hub-stat"><span className="micro">Influence</span><span className="v"><Influence value={me.influence} /></span></div>
            <div className="hub-stat"><span className="micro">Keepers</span><span className="v"><Icon name="keeper" size={16} className="muted" />{keepersOf(me)}</span></div>
            <div className="hub-stat"><span className="micro">Dinos</span><span className="v"><Icon name="paw" size={16} className="muted" />{adults}<span className="xs muted">+{me.creatures.length - adults}</span></span></div>
          </div>
        </div>
        <div className="advance-big"><AdvanceButton /></div>
        {g.world.ascension > 0 && <Hint icon="temple">Ascension {g.world.ascension}: the gods are watching this run.</Hint>}
      </div>
      <div className="stack">
        <Plaque label="This week" title="Needs your attention" flush>
          {rows.length === 0 ? (
            <div className="empty small muted">All quiet in the ludus. Advance when you are ready.</div>
          ) : (
            <ul className="attn">
              {rows.map((r) => (
                <li key={r.id}>
                  <button type="button" id={r.id} className="attn-item" onClick={r.onClick}>
                    <span className={`attn-ic ${r.tone}`}><Icon name={r.icon} size={18} /></span>
                    <span className="attn-txt">
                      <span className="attn-title">{r.title}</span>
                      {r.sub && <span className="attn-sub" style={{ display: 'block' }}>{r.sub}</span>}
                    </span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Plaque>
        <Panel label="Ludus" title="Quick links">
          <div className="quick">
            {quick.map((q) => (
              <button key={q.name} id={`quick-${q.name}`} type="button" className="quick-btn" onClick={() => store.nav.area(q.name)}>
                <Icon name={q.icon} size={22} />
                <span>{q.label}</span>
                {q.badge > 0 && <span className="tb-badge num">{q.badge}</span>}
              </button>
            ))}
          </div>
          {g.results.length > 0 && (
            <Btn className="mt-3" block variant="quiet" icon="scroll" onClick={() => store.nav.push({ name: 'results' })}>Last week&rsquo;s report</Btn>
          )}
        </Panel>
      </div>
      {conv && <ConversationSheet conv={conv} onClose={() => setConv(null)} />}
      {dec && <DecisionSheet d={dec} onClose={() => setDec(null)} />}
      {def && <DefenseSheet d={def} onClose={() => setDef(null)} />}
      {adv && <AdventureSheet a={adv} onClose={() => setAdv(null)} />}
    </div>
  );
}
