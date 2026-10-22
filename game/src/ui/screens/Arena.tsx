// Arena [ColosseumActivity, TournamentDetailsActivity, TournamentGladiatorSelectionActivity].
// The list and registration are real; the match-by-match arena flow (battle prep, bribes, bets) is
// the Arena engineer's next step: ArenaPlayScreen offers "Resolve automatically" for now.
import React, { useState } from 'react';
import type { Creature, Tournament } from '../../engine/types';
import { eqAge, canFight } from '../../engine/creature';
import { eligibility, prizeFor, register, unregister, autoResolve, attendedTournament } from '../../engine/tournaments';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, KV, Panel, Pill, Plaque } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, type IconName } from '../components/Icon';
import { CreaturePicker } from '../components/CreatureRow';
import { DinoThumb } from '../art/DinoArt';
import { safe, tryRead } from '../safe';
import { devBattle } from '../devFixture';
import { camelToWords, fmt } from '../format';

function crest(t: Tournament): IconName {
  if (t.league) return t.league === 'lunar' ? 'moon' : t.league === 'solar' ? 'sun' : 'trophy';
  if (t.underground) return 'skull';
  if (t.type === 'junior') return 'baby';
  if (t.type === 'pankration' || t.natural) return 'paw';
  return 'arena';
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
  const ready = teams.every((x) => x.length === t.perTeam);
  const submit = () => {
    const r = store.act((s) => register(s, t.id, teams), { ok: `Registered for ${t.name}.` });
    if (r === null) onClose();
  };
  return (
    <Sheet open onClose={onClose} wide title={t.name} label={`Register · ${t.perTeam} per team`}
      footer={
        <div className="row between gap-2 wrap">
          <div className="row gap-1">
            {teams.map((tm, i) => <Btn key={i} size="sm" variant={i === cur ? 'primary' : 'default'} onClick={() => setCur(i)}>Team {i + 1} · {tm.length}/{t.perTeam}</Btn>)}
            {!t.underground && teams.length < 2 && <Btn size="sm" variant="ghost" icon="plus" onClick={() => { setTeams([...teams, []]); setCur(teams.length); }}>Team</Btn>}
          </div>
          <Btn id="register-go" variant="primary" disabled={!ready} onClick={submit}>Register{t.fee ? ` · ${fmt(t.fee * teams.length)}` : ''}</Btn>
        </div>
      }>
      <CreaturePicker id={`reg-${cur}`} g={g} creatures={me.creatures} max={t.perTeam} selected={teams[cur]} eligible={elig}
        onChange={(ids) => setTeams(teams.map((x, i) => (i === cur ? ids : x)))} />
      {teams.length > 1 && <p className="xs muted mt-2">A second team doubles the bracket and the entry fee.</p>}
    </Sheet>
  );
}

export function ArenaScreen() {
  const store = useStore();
  const g = store.game!;
  const [reg, setReg] = useState<Tournament | null>(null);
  const list = g.world.tournaments.filter((t) => t.week === g.world.week || t.status !== 'done');
  return (
    <>
      <ScreenHead title="Arena" sub={`Week ${g.world.week} · ${list.length} event${list.length === 1 ? '' : 's'}`} back={false} />
      <div className="cols cols-wide-left">
        <Plaque label="This week" title="Tournaments" flush>
          {list.length === 0 && <EmptyState icon="arena" title="No events this week">The calendar opens again next week.</EmptyState>}
          {list.map((t) => {
            const prize = safe(() => prizeFor(g, t), null as { denarii: number; influence: number } | null);
            const regd = g.player.registrations[t.id];
            const names = regd?.flat().map((id) => g.player.ludus.creatures.find((c) => c.id === id)?.name).filter(Boolean);
            return (
              <div key={t.id} className="tourney">
                <span className="tourney-crest"><Icon name={crest(t)} size={22} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="strong">{t.name}</div>
                  <div className="xs muted">{t.perTeam}v{t.perTeam} · {t.teams} teams · {camelToWords(t.type)}{t.underground ? ' · to the death' : ''}</div>
                  <div className="row gap-1 wrap mt-1">
                    {t.fee > 0 ? <Pill tone="muted">Fee {fmt(t.fee)}</Pill> : <Pill tone="muted">No fee</Pill>}
                    {prize && <Pill tone="amber" icon="coin">{fmt(prize.denarii)}</Pill>}
                    {prize && prize.influence > 0 && <Pill tone="verdigris" icon="laurel">{fmt(prize.influence)}</Pill>}
                    {t.beasts && <Pill tone="info">Beasts</Pill>}
                    {t.mounts !== 'none' && <Pill tone="info" icon="rider">Riders</Pill>}
                    {t.natural && <Pill tone="info">No harness</Pill>}
                    {t.league && <Pill tone="amber">League</Pill>}
                  </div>
                  {names?.length ? <div className="xs good mt-1 row gap-1"><Icon name="check" size={12} />{names.join(', ')}</div> : null}
                </div>
                <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                  <Btn id={`reg-${t.key}`} size="sm" variant={regd ? 'default' : 'primary'} onClick={() => setReg(t)}>{regd ? 'Change' : 'Register'}</Btn>
                  {regd && <Btn size="sm" variant="ghost" onClick={() => store.act((s) => { unregister(s, t.id); return true; }, { ok: 'Withdrawn.' })}>Withdraw</Btn>}
                </div>
              </div>
            );
          })}
        </Plaque>
        <div className="stack">
          <Panel label="Coming next" title="The arena floor">
            <p className="small">Match-by-match play arrives with the arena update: battle preparation, harness choice, instructions, bribes, bets and the animated bouts. For now, the first event you registered for resolves automatically when you advance.</p>
            {store.dev && <Btn className="mt-2" icon="arena" onClick={() => store.showBattle(devBattle(g), 'Sample bout (dev data)')}>Preview the battle viewer</Btn>}
          </Panel>
          <Hint icon="trophy">Entering the right event matters: rookies, the Hatchling Games and league rounds each have their own rules and prizes.</Hint>
        </div>
      </div>
      {reg && <RegisterSheet t={reg} onClose={() => setReg(null)} />}
    </>
  );
}

export function ArenaPlayScreen() {
  const store = useStore();
  const g = store.game!;
  const t = g.world.tournaments.find((x) => x.id === store.screen.id) ?? safe(() => attendedTournament(g), undefined);
  const [busy, setBusy] = useState(false);
  const resolve = () => {
    if (!t) { store.finishWeek(); return; }
    setBusy(true);
    const r = store.act((s) => { const tt = s.world.tournaments.find((x) => x.id === t.id); if (tt) autoResolve(s, tt); return true; });
    setBusy(false);
    if (r) store.finishWeek();
  };
  const mine = t ? (g.player.registrations[t.id] ?? []).flat().map((id) => g.player.ludus.creatures.find((c) => c.id === id)).filter((c): c is Creature => !!c) : [];
  return (
    <>
      <ScreenHead title="Arena" sub={t ? t.name : 'Tournament day'} back={false} />
      <Plaque label="Tournament day" title={t?.name ?? 'The games'}>
        {t && (
          <div className="stack-sm">
            <KV k="Format">{t.perTeam}v{t.perTeam} · {t.teams} teams</KV>
            <KV k="Weather">{camelToWords(t.weather)}</KV>
            <div className="row gap-2 wrap mt-1">{mine.map((c) => <span key={c.id} className="col center" style={{ alignItems: 'center' }}><DinoThumb creature={c} size={64} /><span className="xs">{c.name}</span></span>)}</div>
          </div>
        )}
        <Hint icon="arena">The full arena (preparation, instructions, bribes, bets and every bout on screen) is coming next. Resolve this event automatically: your dinos fight with the Care instruction.</Hint>
        <div className="row gap-2 wrap mt-3">
          <Btn id="arena-auto" variant="primary" size="lg" icon="advance" disabled={busy} onClick={resolve}>Resolve automatically</Btn>
          {store.dev && <Btn icon="arena" onClick={() => store.showBattle(devBattle(g), 'Sample bout (dev data)')}>Watch a sample bout</Btn>}
        </div>
      </Plaque>
    </>
  );
}
