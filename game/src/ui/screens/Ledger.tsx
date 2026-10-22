// Objectives [ObjectivesActivity], Messages [MessageActivity], Events [EventsActivity, LeagueActivity].
import React, { useState } from 'react';
import type { Decision, Message, MessageSender, ObjectiveState, TournamentDef } from '../../engine/types';
import { objectiveDef, claimObjective, objectiveProgressText } from '../../engine/objectives';
import { acceptTransfer, declineTransfer } from '../../engine/market';
import { upcoming } from '../../engine/tournaments';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Meter, Panel, Pill, Plaque } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, type IconName } from '../components/Icon';
import { DecisionSheet } from './Hub';
import { safe } from '../safe';
import { camelToWords, fmt } from '../format';
import { houseById } from '../../engine/util';

const OBJ_FALLBACK: Record<string, string> = {
  guidance1: 'Getting started 1/6: buy a dino', guidance2: 'Getting started 2/6: pick a technique', guidance3: 'Getting started 3/6: buy a weapon',
  guidance4: 'Getting started 4/6: register for a tournament', guidance5: 'Getting started 5/6: advance the week', guidance6: 'Getting started 6/6: hire a keeper',
  firstClutch: 'First clutch', imprintBaby: 'Raise a hatchling with full imprint', bloodline: 'Found a bloodline', expandLudus: 'Expand the ludus',
};

function objTitle(o: ObjectiveState): string {
  return objectiveDef(o.id)?.title ?? OBJ_FALLBACK[o.id] ?? camelToWords(o.id);
}

export function ObjectivesScreen() {
  const store = useStore();
  const g = store.game!;
  const list = g.player.objectives;
  const groups: { title: string; items: ObjectiveState[] }[] = [
    { title: 'Ready to claim', items: list.filter((o) => o.done && !o.claimed) },
    { title: 'In progress', items: list.filter((o) => !o.done && !o.failed) },
    { title: 'Completed', items: list.filter((o) => o.claimed) },
    { title: 'Failed', items: list.filter((o) => o.failed) },
  ].filter((x) => x.items.length);
  return (
    <>
      <ScreenHead title="Objectives" sub={`${list.filter((o) => o.claimed).length} completed`} />
      {list.length === 0 && <Plaque><EmptyState icon="flag" title="No objectives yet">Guidance and quests appear here as the story unfolds.</EmptyState></Plaque>}
      <div className="cols">
        {groups.map((gr) => (
          <Panel key={gr.title} label="Objectives" title={gr.title} flush className={gr.title === 'Ready to claim' ? 'plaque' : undefined}>
            {gr.items.map((o) => {
              const d = objectiveDef(o.id);
              return (
                <div key={o.id} className="tech">
                  <div>
                    <div className="tech-name">{o.done ? <Icon name="check" size={16} className="good" /> : o.failed ? <Icon name="close" size={16} className="bad" /> : <Icon name="flag" size={16} className="amber" />}<span>{objTitle(o)}</span></div>
                    {d?.desc && <div className="tech-desc">{d.desc}</div>}
                    {!o.done && !o.failed && (
                      <div className="row gap-2 mt-1" style={{ maxWidth: 320 }}>
                        <Meter value={o.progress} max={Math.max(1, o.goal)} tone="amber" height={5} label="Progress" />
                        <span className="xs num muted nowrap">{safe(() => objectiveProgressText(o), `${o.progress}/${o.goal}`)}</span>
                      </div>
                    )}
                    <div className="xs muted mt-1">{d?.reward ? `Reward: ${d.reward}` : ''}{o.deadline ? `${d?.reward ? ' · ' : ''}deadline week ${o.deadline}` : ''}</div>
                  </div>
                  {o.done && !o.claimed && <Btn id={`claim-${o.id}`} variant="primary" size="sm" onClick={() => store.act((s) => claimObjective(s, o.id), { ok: 'Reward claimed.' })}>Claim</Btn>}
                </div>
              );
            })}
          </Panel>
        ))}
      </div>
    </>
  );
}

const SENDER: Record<MessageSender, { icon: IconName; name: string }> = {
  assistant: { icon: 'scroll', name: 'Your assistant' }, herald: { icon: 'bell', name: 'The herald' }, spy: { icon: 'spy', name: 'Your spy' },
  magistrate: { icon: 'temple', name: 'Magistrate Septus' }, informant: { icon: 'eye', name: 'An informant' }, medicus: { icon: 'injury', name: 'The veterinarium' },
  rival: { icon: 'coin', name: 'A rival house' }, oracle: { icon: 'sparkle', name: 'The oracle' }, hatchery: { icon: 'egg', name: 'The hatchery' },
};

export function MessagesScreen() {
  const store = useStore();
  const g = store.game!;
  const [open, setOpen] = useState<Message | null>(null);
  const msgs = g.player.messages;
  const unread = msgs.filter((m) => !m.read).length;
  const read = (m: Message) => {
    setOpen(m);
    if (!m.read) store.act((s) => { const x = s.player.messages.find((y) => y.id === m.id); if (x) x.read = true; return true; });
  };
  const offer = open?.offer;
  const offerLive = offer && g.player.offers.some((o) => o.id === offer.id);
  return (
    <>
      <ScreenHead title="Messages" sub={unread ? `${unread} unread` : 'All read'}
        actions={unread ? <Btn size="sm" variant="ghost" onClick={() => store.act((s) => { s.player.messages.forEach((m) => { m.read = true; }); return true; })}>Mark all read</Btn> : undefined} />
      <Panel flush>
        {msgs.length === 0 && <EmptyState icon="message" title="No letters">Letters from magistrates, spies and rivals arrive here.</EmptyState>}
        {msgs.map((m) => (
          <button key={m.id} type="button" id={`msg-${m.id}`} className={`msg${m.read ? '' : ' unread'}`} onClick={() => read(m)}>
            <span className="msg-ic"><Icon name={SENDER[m.sender]?.icon ?? 'scroll'} size={18} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="msg-title" style={{ display: 'block' }}>{m.title}</span>
              <span className="msg-prev" style={{ display: 'block' }}>{SENDER[m.sender]?.name} · {m.text.split('\n')[0]}</span>
            </span>
            <span className="xs muted nowrap">W{m.week}{m.offer && <Pill tone="amber">Offer</Pill>}</span>
          </button>
        ))}
      </Panel>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} label={open ? `${SENDER[open.sender]?.name ?? ''} · week ${open.week}` : ''}
        footer={offer && offerLive ? (
          <div className="row gap-2 end wrap">
            <Btn variant="ghost" onClick={() => { store.act((s) => { try { declineTransfer(s, offer.id); } catch { s.player.offers = s.player.offers.filter((x) => x.id !== offer.id); } return true; }, { ok: 'Offer declined.' }); setOpen(null); }}>Decline</Btn>
            <Btn variant="primary" icon="coin" onClick={() => { if (store.act((s) => acceptTransfer(s, offer.id), { ok: 'Deal struck.' }) === null) setOpen(null); }}>Accept {fmt(offer.amount)}</Btn>
          </div>
        ) : undefined}>
        {open && <div className="msg-body">{open.text}</div>}
        {offer && !offerLive && <p className="xs muted mt-2">This offer has expired.</p>}
      </Sheet>
    </>
  );
}

export function EventsScreen() {
  const store = useStore();
  const g = store.game!;
  const [dec, setDec] = useState<Decision | null>(null);
  const next = safe(() => upcoming(g, 6), [] as TournamentDef[]);
  return (
    <>
      <ScreenHead title="Events" sub={`Week ${g.world.week}`} actions={g.results.length ? <Btn size="sm" icon="scroll" onClick={() => store.nav.push({ name: 'results' })}>Week report</Btn> : undefined} />
      <div className="cols">
        <Plaque label="Decisions" title={g.player.decisions.length ? `${g.player.decisions.length} waiting` : 'None waiting'} flush>
          {g.player.decisions.length === 0 && <div className="empty small muted">Random events reach you as the weeks pass. Unanswered ones expire after seven weeks.</div>}
          {g.player.decisions.map((d) => (
            <button key={d.id} type="button" className="attn-item" onClick={() => setDec(d)}>
              <span className="attn-ic amber"><Icon name="bell" size={18} /></span>
              <span className="attn-txt"><span className="attn-title">{d.title}</span><span className="attn-sub" style={{ display: 'block' }}>Week {d.week} · {d.options.length} options</span></span>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </Plaque>
        <Panel label="Leagues" title="Standings">
          {g.world.leagues.length === 0 && <p className="small muted">No league is running.</p>}
          {g.world.leagues.map((l) => {
            const rows = Object.entries(l.points).sort((a, b) => b[1] - a[1]).slice(0, 8);
            return (
              <div key={l.id} className="mb-3">
                <div className="row between"><span className="strong">{l.name}</span><span className="xs muted">weeks {l.start}–{l.end} · pool {fmt(l.pool)}</span></div>
                <table className="table mt-1">
                  <tbody>
                    {rows.map(([cid, pts], i) => (
                      <tr key={cid} className={l.owners[cid] === g.player.ludus.id ? 'amber' : undefined}>
                        <td className="num muted" style={{ width: 28 }}>{i + 1}</td>
                        <td className="strong">{l.names[cid] ?? 'Unknown'}</td>
                        <td className="muted">{houseById(g, l.owners[cid])?.name ?? ''}</td>
                        <td className="num strong">{pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </Panel>
        <Panel label="Calendar" title="Coming up" className="span-2">
          {next.length === 0 && <p className="small muted">The calendar is not available yet. This week&rsquo;s events are in the Arena.</p>}
          {next.map((t, i) => <div key={i} className="ledger-line"><span>{t.name}</span><span className="muted xs">week {t.week} · {t.perTeam}v{t.perTeam}</span></div>)}
        </Panel>
      </div>
      {dec && <DecisionSheet d={dec} onClose={() => setDec(null)} />}
    </>
  );
}
