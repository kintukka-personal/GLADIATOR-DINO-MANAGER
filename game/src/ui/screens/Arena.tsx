// Arena [ColosseumActivity, TournamentDetailsActivity, TournamentGladiatorSelectionActivity, EventsActivity,
// LeagueActivity, OrganizeTournamentActivity]. This week's events (format chips, registration), the calendar,
// the league table and hosting your own tournament. The match-by-match flow lives in ArenaPlay.tsx.
import React, { useState } from 'react';
import type { Creature, GameState, League, Tournament, TournamentDef } from '../../engine/types';
import { eqAge, canFight } from '../../engine/creature';
import {
  activeLeague, eligibility, leagueStandings, maxTournamentLevel, organizeTournament, prizeFor, register, unregister, upcoming,
} from '../../engine/tournaments';
import { hasOpp } from '../../engine/influence';
import { LEAGUES, LEAGUE_EVENT_KEYS } from '../../engine/data/arenaData';
import { TRAITS } from '../../engine/data/traits';
import { gearName } from '../../engine/data/gear';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Field, Hint, Influence, KV, Money, Panel, Pill, Plaque, Segmented, Toggle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Tabs } from '../components/Tabs';
import { Icon, type IconName } from '../components/Icon';
import { CreaturePicker } from '../components/CreatureRow';
import { DinoThumb } from '../art/DinoArt';
import { safe, tryRead } from '../safe';
import { devBattle } from '../devFixture';
import { fmt, plural } from '../format';

export function crest(t: TournamentDef): IconName {
  if (t.league) return t.league === 'lunar' ? 'moon' : t.league === 'solar' ? 'sun' : 'trophy';
  if (t.type === 'ascension' || t.type === 'prophecy') return 'temple';
  if (t.underground) return 'skull';
  if (t.type === 'junior') return 'baby';
  if (t.type === 'pankration' || t.natural) return 'paw';
  if (t.type === 'organized') return 'flag';
  return 'arena';
}

const MOUNTS: Record<TournamentDef['mounts'], string | null> = { none: null, opening: 'Riders: opening round', final: 'Riders: final', full: 'Riders' };

/** Format chips for an event: teams, size, riders, beasts, harness, level cap, league, fee and prize. */
export function formatChips(g: GameState, t: TournamentDef, o: { prize?: boolean; fee?: boolean } = {}): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  out.push(<Pill key="fmt" tone="muted">{t.perTeam}v{t.perTeam}</Pill>);
  out.push(<Pill key="teams" tone="muted">{t.teams} teams</Pill>);
  if (t.type === 'rookie') out.push(<Pill key="cap" tone="warn" title="Rookie events bar experienced fighters and champions">Level ≤ {maxTournamentLevel(t.week)}</Pill>);
  if (t.type === 'junior') out.push(<Pill key="cap" tone="warn" icon="baby">Hatchlings only</Pill>);
  if (t.natural) out.push(<Pill key="nat" tone="info" icon="paw">No harness</Pill>);
  const m = t.natural ? null : MOUNTS[t.mounts];
  if (m) out.push(<Pill key="mnt" tone="info" icon="rider">{m}</Pill>);
  if (t.beasts) out.push(<Pill key="bst" tone="info">Beasts allowed</Pill>);
  if (t.underground && t.bonusRounds !== undefined) out.push(<Pill key="bonus" tone="fresco" icon="skull">Bonus rounds</Pill>);
  if (t.league) out.push(<Pill key="lg" tone="verdigris" icon="trophy">{LEAGUES[t.league]?.name ?? 'League'}{t.leagueFinale ? ' · double points' : ''}</Pill>);
  if (t.organizerId === g.player.ludus.id) out.push(<Pill key="host" tone="amber" icon="flag">You host</Pill>);
  if (t.upgrade && !g.unlocks.includes(t.upgrade) && !g.world.difficulty.sandbox) out.push(<Pill key="lock" tone="bad" icon="lock">Locked</Pill>);
  if (o.fee !== false) out.push(t.fee > 0 ? <Pill key="fee" tone="muted">Fee {fmt(t.fee)}</Pill> : <Pill key="fee" tone="muted">No fee</Pill>);
  if (o.prize !== false) {
    const p = safe(() => prizeFor(g, t), null as { denarii: number; influence: number } | null);
    if (p) {
      out.push(<Pill key="pd" tone="amber" icon="coin">{fmt(p.denarii)}</Pill>);
      if (p.influence > 0) out.push(<Pill key="pi" tone="verdigris" icon="laurel">{fmt(p.influence)}</Pill>);
    }
  }
  return out;
}

function localEligibility(t: Tournament, c: Creature): string | null {
  if (c.kind === 'beast' && !t.beasts) return 'No beasts in this event';
  const junior = t.type === 'junior';
  const e = eqAge(c);
  if (e < 8) return 'Too young to fight';
  if (junior && e >= 17) return 'Too old for the Hatchling Games';
  if (!junior && e < 15) return 'Too young: Hatchling Games only';
  if (!canFight(c)) return c.injury ? 'Injured' : c.away ? 'Away' : c.pregnancy ? 'Pregnant' : 'Cannot fight';
  return null;
}

function RegisterSheet({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const existing = g.player.registrations[t.id] ?? [];
  const [teams, setTeams] = useState<string[][]>(existing.length ? existing.map((x) => [...x]) : [[]]);
  const [cur, setCur] = useState(0);
  const used = new Set(teams.flat());
  const elig = (c: Creature) => {
    if (used.has(c.id) && !teams[cur].includes(c.id)) return 'In another team';
    const r = tryRead(() => eligibility(g, t, c));
    return r.ok ? r.value : localEligibility(t, c);
  };
  const ready = teams.every((x) => x.length > 0 && x.length <= t.perTeam);
  const full = teams.every((x) => x.length === t.perTeam);
  const submit = () => {
    const r = store.act((s) => register(s, t.id, teams), { ok: `Registered for ${t.name}.` });
    if (r === null) onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title={t.name} label={`Register · up to ${t.perTeam} per team`}
      footer={
        <div className="row between gap-2 wrap">
          <div className="row gap-1 wrap">
            {teams.map((tm, i) => <Btn key={i} id={`reg-team-${i}`} size="sm" variant={i === cur ? 'primary' : 'default'} onClick={() => setCur(i)}>Team {i + 1} · {tm.length}/{t.perTeam}</Btn>)}
            {!t.underground && t.type !== 'ascension' && t.type !== 'prophecy' && teams.length < 2 && <Btn size="sm" variant="ghost" icon="plus" onClick={() => { setTeams([...teams, []]); setCur(teams.length); }}>Team</Btn>}
          </div>
          <Btn id="register-go" variant="primary" disabled={!ready} onClick={submit}>Register{t.fee ? ` · ${fmt(t.fee * teams.length)}` : ''}</Btn>
        </div>
      }>
      <div className="row gap-1 wrap mb-2">{formatChips(g, t, { prize: false })}</div>
      {!full && ready && <p className="xs warn mb-2">A team short of {t.perTeam} fights outnumbered.</p>}
      <CreaturePicker id={`reg-${cur}`} g={g} creatures={me.creatures} max={t.perTeam} selected={teams[cur]} eligible={elig}
        onChange={(ids) => setTeams(teams.map((x, i) => (i === cur ? ids : x)))} />
      {teams.length > 1 && <p className="xs muted mt-2">A second team doubles the bracket and the entry fee.</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------------------------

export function ArenaScreen() {
  const store = useStore();
  const g = store.game!;
  const tab = store.screen.tab ?? 'week';
  const [org, setOrg] = useState(false);
  const list = g.world.tournaments.filter((t) => t.week === g.world.week || t.status !== 'done');
  const l = safe(() => activeLeague(g), undefined);
  return (
    <>
      <ScreenHead title="Arena" sub={`Week ${g.world.week} · ${plural(list.length, 'event')}`} back={false}
        actions={<Btn id="arena-organize" size="sm" icon="flag" onClick={() => setOrg(true)}>Organize</Btn>} />
      <Tabs id="arena" label="Arena sections" value={tab} onChange={(t) => store.nav.update({ tab: t })}
        items={[
          { id: 'week', label: 'This week', icon: 'arena', badge: list.length || undefined },
          { id: 'calendar', label: 'Calendar', icon: 'hourglass' },
          { id: 'league', label: l ? l.name : 'League', icon: 'trophy' },
        ]} />
      {tab === 'week' && <ThisWeek list={list} />}
      {tab === 'calendar' && <CalendarPanel weeks={10} />}
      {tab === 'league' && <LeaguePanel />}
      {org && <OrganizeSheet onClose={() => setOrg(false)} />}
    </>
  );
}

function ThisWeek({ list }: { list: Tournament[] }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [reg, setReg] = useState<Tournament | null>(null);
  const fighters = me.creatures.filter((c) => c.maturity >= 0.44);
  const where = (c: Creature) => Object.entries(g.player.registrations).find(([, teams]) => teams.some((tm) => tm.includes(c.id)))?.[0];
  return (
    <div className="cols cols-wide-left">
      <Plaque label="This week" title="Tournaments" flush>
        {list.length === 0 && <EmptyState icon="arena" title="No events this week">The calendar opens again next week.</EmptyState>}
        {list.map((t) => {
          const regd = g.player.registrations[t.id];
          const names = regd?.flat().map((id) => me.creatures.find((c) => c.id === id)?.name).filter(Boolean);
          const locked = !!t.upgrade && !g.unlocks.includes(t.upgrade) && !g.world.difficulty.sandbox;
          return (
            <div key={t.id} className={`tourney${regd ? ' registered' : ''}`}>
              <span className="tourney-crest"><Icon name={crest(t)} size={22} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="strong">{t.name}</div>
                <div className="row gap-1 wrap mt-1">{formatChips(g, t)}</div>
                {names?.length ? <div className="xs good mt-1 row gap-1"><Icon name="check" size={12} />Registered: {names.join(', ')}</div> : null}
                {t.status === 'done' && <div className="xs muted mt-1">Over.</div>}
              </div>
              <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                {locked ? (
                  <Btn id={`reg-${t.key}`} size="sm" icon="lock" onClick={() => store.nav.push({ name: 'upgrades' })}>Unlock</Btn>
                ) : (
                  <Btn id={`reg-${t.key}`} size="sm" variant={regd ? 'default' : 'primary'} disabled={t.status !== 'open'} onClick={() => setReg(t)}>{regd ? 'Change' : 'Register'}</Btn>
                )}
                {regd && t.status === 'open' && <Btn id={`unreg-${t.key}`} size="sm" variant="ghost" onClick={() => store.act((s) => { unregister(s, t.id); return true; }, { ok: 'Withdrawn.' })}>Withdraw</Btn>}
              </div>
            </div>
          );
        })}
      </Plaque>
      <div className="stack">
        <Panel label="Your fighters" title="Ready for the sand" flush>
          {fighters.length === 0 && <EmptyState icon="paw" title="No fighters" action={<Btn size="sm" variant="primary" onClick={() => store.nav.area('market')}>Visit the market</Btn>}>Buy a dino at the market to enter your first tournament.</EmptyState>}
          {fighters.map((c) => {
            const tid = where(c);
            const tt = tid ? g.world.tournaments.find((x) => x.id === tid) : undefined;
            return (
              <div key={c.id} className="crow">
                <DinoThumb creature={c} size={40} />
                <div className="crow-main">
                  <div className="crow-name"><span className="nm">{c.name}</span></div>
                  <div className="crow-sub">Level {c.level} · fame {fmt(c.fame)}</div>
                </div>
                <div className="crow-right">
                  {tt ? <Pill tone="amber" icon="arena">{tt.name}</Pill>
                    : c.injury ? <Pill tone="bad" icon="injury">Injured {c.injury.weeks}w</Pill>
                      : c.away ? <Pill tone="info" icon="hourglass">Away</Pill>
                        : c.pregnancy ? <Pill tone="fresco">Pregnant</Pill>
                          : eqAge(c) < 15 ? <Pill tone="info" icon="baby">Hatchling Games</Pill>
                            : <Pill tone="good">Free</Pill>}
                </div>
              </div>
            );
          })}
        </Panel>
        <LeaguePanel compact />
        <Hint icon="trophy">Rookies, the Hatchling Games, the pits and league rounds each have their own rules and prizes. League events also score points for the season.</Hint>
        {store.dev && <Btn icon="arena" onClick={() => store.showBattle(devBattle(g), 'Sample bout (dev data)')}>Preview the battle viewer</Btn>}
      </div>
      {reg && <RegisterSheet t={reg} onClose={() => setReg(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

export function CalendarPanel({ weeks = 8 }: { weeks?: number }) {
  const store = useStore();
  const g = store.game!;
  const list = safe(() => upcoming(g, weeks), [] as TournamentDef[]).filter((t) => t.week > g.world.week);
  const byWeek = new Map<number, TournamentDef[]>();
  for (const t of list) byWeek.set(t.week, [...(byWeek.get(t.week) ?? []), t]);
  return (
    <Panel label="Calendar" title={`The next ${weeks} weeks`} flush>
      {list.length === 0 && <EmptyState icon="hourglass" title="Nothing scheduled">New events are announced as the season turns.</EmptyState>}
      {[...byWeek.entries()].map(([w, ts]) => (
        <div key={w} className="cal-week">
          <div className="cal-wk"><span className="micro">Week</span><span className="display num">{w}</span></div>
          <div className="stack-sm" style={{ minWidth: 0 }}>
            {ts.map((t, i) => (
              <div key={`${t.key}-${i}`} className="cal-ev">
                <div className="row gap-2"><Icon name={crest(t)} size={16} className="amber" /><span className="strong ellipsis">{t.name}</span></div>
                <div className="row gap-1 wrap mt-1">{formatChips(g, t)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="xs muted" style={{ padding: '8px 14px' }}>Initium, the Hatchling Games and the pits come round on their own schedule. Legends tournaments arrive unannounced.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// League [LeagueActivity]
// ---------------------------------------------------------------------------------------------

function nextLeague(g: GameState): League | undefined {
  return [...g.world.leagues].filter((l) => !l.done && !l.active && l.end > g.world.week).sort((a, b) => a.start - b.start)[0];
}

function prizeLines(l: League): { place: string; denarii: number; influence: number; gear: string }[] {
  const def = LEAGUES[l.id];
  const gear = l.id === 'annum' ? null : safe(() => def.prizes(), null);
  return ['1st', '2nd', '3rd'].map((place, i) => ({
    place, denarii: Math.floor(l.pool / [2, 3, 6][i]), influence: [20, 10, 5][i],
    gear: gear ? gearName({ id: 'preview', type: gear[i].type, quality: gear[i].quality, augment: gear[i].augment, unique: gear[i].unique }) : 'A Bloody weapon',
  }));
}

export function LeaguePanel({ compact }: { compact?: boolean }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const l = safe(() => activeLeague(g), undefined) ?? nextLeague(g);
  if (!l) {
    return <Panel label="League" title="Between seasons"><p className="small muted">No league is running. The next one is announced by the herald.</p></Panel>;
  }
  const running = l.active && !l.done;
  const rows = running ? safe(() => leagueStandings(g, l), []) : [];
  const top = rows.slice(0, compact ? 5 : 12);
  const mine = rows.map((r, i) => ({ ...r, place: i + 1 })).filter((r) => r.houseId === me.id && r.place > top.length);
  const locked = !!l.upgrade && !g.unlocks.includes(l.upgrade) && !g.world.difficulty.sandbox;
  const def = LEAGUES[l.id];
  const events = g.world.calendar.filter((d) => d.week >= l.start && d.week < l.end && (d.league === l.id || LEAGUE_EVENT_KEYS.has(d.key)))
    .concat(g.world.tournaments.filter((t) => t.league === l.id))
    .sort((a, b) => a.week - b.week);
  const table = (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th className="num">#</th><th>Fighter</th><th>House</th><th className="num">Pts</th></tr></thead>
        <tbody>
          {top.map((r, i) => (
            <tr key={r.id} className={r.houseId === me.id ? 'mine' : undefined}>
              <td className="num muted">{i + 1}</td><td className="strong">{r.name}</td><td className="muted">{r.house}</td><td className="num strong">{r.points}</td>
            </tr>
          ))}
          {mine.map((r) => (
            <tr key={r.id} className="mine"><td className="num muted">{r.place}</td><td className="strong">{r.name}</td><td className="muted">{r.house}</td><td className="num strong">{r.points}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (compact) {
    return (
      <Panel label={running ? `Ends week ${l.end}` : `Starts week ${l.start}`} title={l.name} flush actions={<Btn id="league-more" size="sm" variant="ghost" iconRight="chevronRight" onClick={() => (store.screen.name === 'arena' ? store.nav.update({ tab: 'league' }) : store.nav.area('arena', 'league'))}>Table</Btn>}>
        {running ? (top.length ? table : <p className="small muted" style={{ padding: '0 14px 10px' }}>No points scored yet.</p>) : <p className="small muted" style={{ padding: '0 14px 10px' }}>Pool <Money value={l.pool} size="sm" /> for the top three.</p>}
      </Panel>
    );
  }
  return (
    <div className="cols cols-wide-left">
      <Plaque label={running ? `Weeks ${l.start}–${l.end} · ends week ${l.end}` : `Starts week ${l.start}`} title={l.name} flush
        actions={locked ? <Pill tone="bad" icon="lock">Needs an upgrade</Pill> : running ? <Pill tone="good">Running</Pill> : <Pill tone="muted">Upcoming</Pill>}>
        {running && top.length ? table : <EmptyState icon="trophy" title={running ? 'No points yet' : 'The season has not begun'}>Dinos that reach the last rounds of league events score points: 4 for the winner, 2 for the finalist, 1 for each semi-finalist (double in the finale).</EmptyState>}
      </Plaque>
      <div className="stack">
        <Panel label="Prizes" title={`Pool ${fmt(l.pool)} denarii`}>
          {prizeLines(l).map((p) => (
            <div key={p.place} className="ledger-line">
              <span className="strong">{p.place}</span>
              <span className="row gap-2 wrap end"><Money value={p.denarii} size="sm" /><Influence value={p.influence} size="sm" /><span className="xs muted">{p.gear}</span></span>
            </div>
          ))}
          <p className="xs muted mt-2">The champion earns the {TRAITS[def.trait]?.name ?? def.trait} trait{def.achievement ? ' and an achievement' : ''}.</p>
        </Panel>
        <Panel label="Events" title="League rounds">
          {events.length === 0 && <p className="small muted">League rounds are announced as the season goes on.</p>}
          {events.map((d, i) => <KV key={`${d.key}-${i}`} k={`Week ${d.week}`}>{d.name}{d.leagueFinale || d.type === 'league' ? ' (double points)' : ''}</KV>)}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Organize [OrganizeTournamentActivity]
// ---------------------------------------------------------------------------------------------

function OrganizeSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const can = hasOpp(g, 'theOrganizer');
  const hosted = new Set(g.world.calendar.filter((d) => d.organizerId === me.id).map((d) => d.week));
  const weeks = Array.from({ length: 12 }, (_, i) => g.world.week + 1 + i).filter((w) => !hosted.has(w));
  const [perTeam, setPerTeam] = useState<'1' | '2' | '3'>('1');
  const [teams, setTeams] = useState<'2' | '4' | '8'>('4');
  const [week, setWeek] = useState(weeks[1] ?? weeks[0] ?? g.world.week + 2);
  const [beasts, setBeasts] = useState(false);
  const [mounts, setMounts] = useState(false);
  const [name, setName] = useState('');
  const submit = () => {
    const r = store.act((s) => organizeTournament(s, { perTeam: Number(perTeam), teams: Number(teams), week, beasts, mounts, name: name.trim() || undefined }),
      { ok: `Your tournament is on the calendar for week ${week}.` });
    if (r === null) onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Organize a tournament" label="Host your own games"
      footer={can ? (
        <div className="row between gap-2">
          <span className="small">Costs <Money value={300} size="sm" /></span>
          <Btn id="organize-go" variant="primary" icon="flag" disabled={me.denarii < 300 || !weeks.length} onClick={submit}>Put it on the calendar</Btn>
        </div>
      ) : undefined}>
      {!can ? (
        <EmptyState icon="lock" title="You need The Organizer" action={<Btn id="organize-influence" variant="primary" icon="laurel" onClick={() => { onClose(); store.nav.push({ name: 'influence' }); }}>Influence</Btn>}>
          Hosting your own games needs The Organizer opportunity (Lanista path, third tier). The gate money and influence from the crowd go to the host.
        </EmptyState>
      ) : (
        <div className="stack">
          <Field id="org-name" label="Name">
            <input id="org-name" className="input" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${g.player.lanista}'s Tournament`} autoComplete="off" />
          </Field>
          <Field id="org-per" label="Dinos per team">
            <Segmented id="org-per" label="Dinos per team" value={perTeam} onChange={setPerTeam} options={[{ value: '1', label: '1v1' }, { value: '2', label: '2v2' }, { value: '3', label: '3v3' }]} />
          </Field>
          <Field id="org-teams" label="Teams">
            <Segmented id="org-teams" label="Teams" value={teams} onChange={setTeams} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: '8', label: '8' }]} />
          </Field>
          <Field id="org-week" label="Week" help={hosted.size ? `You already host in week ${[...hosted].join(', ')}.` : 'Any week in the next three months.'}>
            <select id="org-week" className="select" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
              {weeks.map((w) => <option key={w} value={w}>Week {w}{w === g.world.week + 1 ? ' (next week)' : ''}</option>)}
            </select>
          </Field>
          <Toggle id="org-beasts" checked={beasts} onChange={setBeasts} label="Beasts allowed" desc="Wolves, sabertooths and bears may enter." />
          <Toggle id="org-mounts" checked={mounts} onChange={setMounts} label="Riders allowed" desc="Riders fight in every round." />
          <Hint icon="coin">Entrants pay 100 denarii each. As host you take the gate money and some influence, more the bigger the crowd: famous fighters and rich houses draw spectators.</Hint>
        </div>
      )}
    </Sheet>
  );
}
