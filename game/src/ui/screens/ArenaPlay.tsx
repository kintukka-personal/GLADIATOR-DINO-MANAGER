// Tournament day [TournamentBattleActivity, TacticsActivity, TournamentGladiatorInstructionActivity, BribeActivity,
// BettingDetailsActivity, BattleReportActivity, TournamentReportActivity, TournamentOtherRoundsActivity,
// TournamentFinalReportActivity].
//
// Flow: intro card → loop { nextPlayerMatch → preview + preparation (harness, instruction, technique order, bribe,
// bet) → playMatch → battle viewer → round report } → pits: keep fighting or retire (continueBonus) → final report
// → store.finishWeek() (the other registered events auto-resolve inside completeWeek).
// nextPlayerMatch() resolves AI matches and records the AI's cheat, so it always runs inside store.act().
import React, { useEffect, useMemo, useState } from 'react';
import type { BattleResult, CheatType, Creature, Gear, GearSlot, ID, Instruction, Ludus, TechId, Tournament } from '../../engine/types';
import { STATS } from '../../engine/types';
import {
  attendedTournament, autoResolve, bonusPending, bracketRounds, continueBonus, entryCreatures, entryName, maxBonusRounds,
  nextPlayerMatch, playMatch, prizeFor, roundLabel, type MatchPrep, type MatchPreview,
} from '../../engine/tournaments';
import { BET_STAKES, CHEAT_NAMES, betMultiplier, cheatAvailable, cheatCost } from '../../engine/bribes';
import { hasOpp } from '../../engine/influence';
import { prepareFighter } from '../../engine/combat';
import { setTechOrder } from '../../engine/care';
import { getStat, knownTech, lifePhase } from '../../engine/creature';
import { TECHNIQUES } from '../../engine/data/techniques';
import { TRAITS } from '../../engine/data/traits';
import { GEAR, gearName } from '../../engine/data/gear';
import { SPECIES } from '../../engine/data/species';
import { PIT_LADDER, WEATHER_TEXT, pitRound, prophecyRound, spartanRound, troyRound } from '../../engine/data/arenaData';
import { INJURY_NAMES } from '../../engine/data/politicsData';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, Influence, KV, Money, Panel, Pill, Plaque, Rule, Segmented } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, SexIcon } from '../components/Icon';
import { GearName, GearPicker, SLOT_ICON, SLOT_LABEL, SLOT_ORDER } from '../components/GearPicker';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { safe } from '../safe';
import { STAT_SHORT, camelToWords, fmt, signed } from '../format';
import { formatChips } from './Arena';

// ---------------------------------------------------------------------------------------------
// Session memory (survives leaving the screen mid-tournament)
// ---------------------------------------------------------------------------------------------

type GearOv = Record<ID, Partial<Record<GearSlot, ID | null>>>;
interface PrepMemo { gear: GearOv; instr: Record<ID, Instruction>; intro: boolean }
interface Snap { denarii: number; influence: number; creatures: Record<ID, { fame: number; level: number; traits: string[]; points: number; name: string }> }

const PREP = new Map<ID, PrepMemo>();
const SNAPS = new Map<ID, Snap>();

function memo(tid: ID): PrepMemo {
  let m = PREP.get(tid);
  if (!m) {
    m = { gear: {}, instr: {}, intro: false };
    PREP.set(tid, m);
  }
  return m;
}

function myCreatures(g: ReturnType<typeof useStore>['game'], t: Tournament): Creature[] {
  if (!g) return [];
  const me = g.player.ludus;
  const ids = new Set([...(g.player.registrations[t.id] ?? []).flat(), ...t.entries.filter((e) => e.houseId === me.id).flatMap((e) => e.creatureIds)]);
  return me.creatures.filter((c) => ids.has(c.id));
}

function snapshot(g: NonNullable<ReturnType<typeof useStore>['game']>, t: Tournament): Snap {
  const l = t.league ? g.world.leagues.find((x) => x.id === t.league) : undefined;
  const creatures: Snap['creatures'] = {};
  for (const c of myCreatures(g, t)) creatures[c.id] = { fame: c.fame, level: c.level, traits: [...c.traits], points: l?.points[c.id] ?? 0, name: c.name };
  return { denarii: g.player.ludus.denarii, influence: g.player.ludus.influence, creatures };
}

// ---------------------------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------------------------

export const INSTRUCTIONS: { id: Instruction; label: string; short: string; text: string }[] = [
  { id: 'default', label: 'Good luck', short: 'Default', text: 'No change to its stats. It yields only when nearly beaten (under about 15% health) against a strong or fearsome foe. Normal injury risk.' },
  { id: 'allout', label: 'Go all out', short: 'All out', text: '+1 Agility, −1 Cunning. Never yields, and once per fight it shrugs off a knockout blow. Injury risk +1 for it and for whoever it knocks out.' },
  { id: 'kill', label: 'Kill them', short: 'Kill', text: '+1 Agility, −1 Cunning. Never yields. Its knockouts are far more likely to maim or kill (+2, or +3 while above half health). Its own injury risk +1.' },
  { id: 'care', label: 'Avoid injury', short: 'Avoid injury', text: '+1 Cunning. Yields at 10–24% health. Injury risk −1, and its knockouts are gentler. Losing fairly on this order pleases the rival house.' },
  { id: 'throw', label: 'Throw the fight', short: 'Throw', text: 'Yields early, at 20–49% health. Injury risk −2. For a dino you cannot afford to lose.' },
];

const CHEATS: CheatType[] = ['poison', 'chains', 'beast', 'guards'];
const CHEAT_ICON: Record<CheatType, 'drop' | 'lock' | 'paw' | 'shield'> = { poison: 'drop', chains: 'lock', beast: 'paw', guards: 'shield' };

/** Label of the next bonus foe without building it (no RNG, no ids). */
function bonusFoeLabel(t: Tournament, k: number): string {
  switch (t.type) {
    case 'spartanPankration': return spartanRound(k).label;
    case 'troy': return troyRound(k).label;
    case 'prophecy': return prophecyRound(k).label;
    case 'ascension': return `Round ${k} of the gods' gauntlet`;
    default: return k === 4 ? 'A hungry beast (dire bear or gigantopithecus)' : pitRound(k).label;
  }
}

function oddsLabel(odds: number): string {
  if (odds > 50) return 'Heavy favourites';
  if (odds > 10) return 'Favourites';
  if (odds > -10) return 'An even match';
  if (odds > -50) return 'Underdogs';
  return 'Long shots';
}

function pendingBonus(t: Tournament): boolean {
  const R = bracketRounds(t);
  return t.matches.some((m) => m.round > R && m.winner === undefined);
}

function champIndex(t: Tournament): number | undefined {
  const R = bracketRounds(t);
  return t.matches.find((m) => m.round === R && m.winner !== undefined)?.winner;
}

function bonusWon(t: Tournament): number {
  const R = bracketRounds(t);
  const c = champIndex(t);
  return c === undefined ? 0 : t.matches.filter((m) => m.round > R && m.winner === c).length;
}

// ---------------------------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------------------------

type Phase =
  | { kind: 'intro' }
  | { kind: 'preview'; p: MatchPreview }
  | { kind: 'report'; label: string; won: boolean; text: string; betPayout?: number; result: BattleResult }
  | { kind: 'bonus' }
  | { kind: 'final' };

export function ArenaPlayScreen() {
  const store = useStore();
  const g = store.game!;
  const t = g.world.tournaments.find((x) => x.id === store.screen.id) ?? safe(() => attendedTournament(g), undefined);
  if (!t) {
    return (
      <>
        <ScreenHead title="Tournament day" back={false} />
        <Plaque><EmptyState icon="arena" title="No tournament today" action={<Btn id="arena-finish" variant="primary" icon="advance" onClick={() => store.finishWeek()}>Finish the week</Btn>}>None of your dinos is fighting in an event you attend this week.</EmptyState></Plaque>
      </>
    );
  }
  return <TournamentDay key={t.id} t={t} />;
}

function TournamentDay({ t }: { t: Tournament }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const m = memo(t.id);
  const [phase, setPhase] = useState<Phase>(() => (m.intro || t.status === 'done' ? { kind: 'final' } : { kind: 'intro' }));
  const [busy, setBusy] = useState(false);
  if (!SNAPS.has(t.id)) SNAPS.set(t.id, snapshot(g, t));

  const live = (): Tournament | undefined => store.game?.world.tournaments.find((x) => x.id === t.id);

  /** Work out what comes next: the next player match, the pit choice, or the final report. */
  const next = () => {
    const tt = live();
    const cur = store.game;
    if (!tt || !cur || tt.status === 'done') { setPhase({ kind: 'final' }); return; }
    if (safe(() => bonusPending(cur, tt), false) && !pendingBonus(tt)) { setPhase({ kind: 'bonus' }); return; }
    const p = store.act((s) => {
      const x = s.world.tournaments.find((y) => y.id === t.id);
      return x ? nextPlayerMatch(s, x) : null;
    }, { quiet: true });
    if (p) setPhase({ kind: 'preview', p });
    else setPhase({ kind: 'final' });
  };

  // resume mid-tournament (e.g. after leaving the screen)
  useEffect(() => {
    if (m.intro && t.status !== 'done') next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = () => {
    m.intro = true;
    next();
  };

  const autoAll = async () => {
    const ok = await store.confirm({
      title: 'Resolve the rest automatically?',
      text: 'Every remaining match of this event is fought without you, with the Avoid injury order. No bribes, no bets.',
      confirmLabel: 'Resolve automatically',
    });
    if (!ok) return;
    m.intro = true;
    store.act((s) => {
      const x = s.world.tournaments.find((y) => y.id === t.id);
      if (x) autoResolve(s, x);
      return true;
    }, { quiet: true });
    setPhase({ kind: 'final' });
  };

  const fight = (prep: MatchPrep, label: string, oppName: string) => {
    setBusy(true);
    const r = store.act((s) => {
      const x = s.world.tournaments.find((y) => y.id === t.id);
      if (!x) throw new Error('The tournament is over.');
      return playMatch(s, x, prep);
    }, { quiet: true });
    setBusy(false);
    if (!r) return;
    setPhase({ kind: 'report', label, won: r.won, text: r.text, betPayout: r.betPayout, result: r.result });
    if (r.result.log.length) store.showBattle(r.result, `${t.name}: ${label}`, undefined, { sideNames: [me.name, oppName] });
  };

  const pit = (go: boolean) => {
    store.act((s) => {
      const x = s.world.tournaments.find((y) => y.id === t.id);
      if (x) continueBonus(s, x, go);
      return true;
    }, { quiet: true });
    if (go) next();
    else setPhase({ kind: 'final' });
  };

  const sub = `${t.perTeam}v${t.perTeam} · ${t.teams} teams · ${camelToWords(t.weather)}`;
  const actions = phase.kind !== 'final' ? <Btn id="arena-auto" size="sm" variant="ghost" icon="skip" onClick={autoAll}>Resolve automatically</Btn> : undefined;

  return (
    <>
      <ScreenHead title={t.name} sub={phase.kind === 'preview' ? `${phase.p.roundLabel} · ${sub}` : sub} back={false} actions={actions} />
      {phase.kind === 'intro' && <Intro t={t} onEnter={enter} />}
      {phase.kind === 'preview' && <Preview key={`${phase.p.match.round}:${t.matches.indexOf(phase.p.match)}`} t={t} p={phase.p} busy={busy} onFight={fight} />}
      {phase.kind === 'report' && <RoundReport t={t} r={phase} onNext={next} />}
      {phase.kind === 'bonus' && <BonusChoice t={t} onChoose={pit} />}
      {phase.kind === 'final' && <FinalReport t={t} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------------------------

function Intro({ t, onEnter }: { t: Tournament; onEnter: () => void }) {
  const store = useStore();
  const g = store.game!;
  const mine = myCreatures(g, t);
  const prize = safe(() => prizeFor(g, t), null);
  return (
    <div className="cols cols-wide-left">
      <div className="stack">
        <div className="arena-hero">
          <div className="arena-hero-art" aria-hidden="true">
            {mine.slice(0, 3).map((c, i) => <DinoArt key={c.id} creature={c} width={i === 0 ? 190 : 150} animate={i === 0} />)}
          </div>
          <div className="arena-hero-info">
            <div className="micro">Tournament day · week {g.world.week}</div>
            <h2>{t.name}</h2>
            <p className="small">{WEATHER_TEXT[t.weather] ?? ''}{t.spectators ? ` ${fmt(t.spectators)} spectators fill the stands.` : ''}</p>
            <div className="row gap-1 wrap mt-2">{formatChips(g, t)}</div>
          </div>
        </div>
        <Btn id="arena-enter" variant="primary" size="lg" block icon="arena" onClick={onEnter}>Enter the arena</Btn>
      </div>
      <div className="stack">
        <Panel label="Your entry" title={mine.length === 1 ? mine[0].name : `${mine.length} fighters`} flush>
          {mine.map((c) => (
            <div key={c.id} className="crow">
              <DinoThumb creature={c} size={48} />
              <div className="crow-main">
                <div className="crow-name"><span className="nm">{c.name}</span><SexIcon sex={c.sex} size={14} /></div>
                <div className="crow-sub">{SPECIES[c.species].name} · level {c.level} · fame {fmt(c.fame)}</div>
                <span className="stat-mini">{STATS.map((s) => <span key={s}>{STAT_SHORT[s]} <b>{getStat(c, s)}</b></span>)}</span>
              </div>
            </div>
          ))}
        </Panel>
        {prize && (
          <Panel label="Prize for the winner">
            <div className="row gap-3 wrap"><Money value={prize.denarii} /><Influence value={prize.influence} /></div>
            {maxBonusRounds(t) > 0 && <p className="xs muted mt-2">Bracket winners may fight up to {maxBonusRounds(t)} bonus rounds for +25 denarii each and pit honours.</p>}
          </Panel>
        )}
        <Bracket t={t} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Match preview + preparation
// ---------------------------------------------------------------------------------------------

function effectiveGear(g: NonNullable<ReturnType<typeof useStore>['game']>, h: Ludus | undefined, cs: Creature[], riders: boolean, natural: boolean | undefined, ov: GearOv): Map<ID, Partial<Record<GearSlot, Gear | null>>> {
  const out = new Map<ID, Partial<Record<GearSlot, Gear | null>>>();
  const used = new Set<ID>();
  const order = [...cs].sort((a, b) => (ov[b.id] ? 1 : 0) - (ov[a.id] ? 1 : 0));
  for (const c of order) {
    const f = safe(() => prepareFighter(g, h, c, null, { riders, natural, used, override: ov[c.id] }), null);
    if (!f) continue;
    for (const x of Object.values(f.gear)) if (x) used.add(x.id);
    out.set(c.id, f.gear);
  }
  return out;
}

function techOrderOf(c: Creature): TechId[] {
  const known = c.techniques.map((x) => x.id);
  const base = c.techOrder?.length ? c.techOrder.filter((x) => knownTech(c, x)) : [];
  return [...base, ...known.filter((x) => !base.includes(x))];
}

function FighterCard({ c, gear, flip, stats = true }: { c: Creature; gear?: Partial<Record<GearSlot, Gear | null>>; flip?: boolean; stats?: boolean }) {
  const pieces = SLOT_ORDER.map((s) => gear?.[s]).filter((x): x is Gear => !!x);
  return (
    <div className={`vs-fighter${flip ? ' flip' : ''}`}>
      <div className="vs-art">
        <DinoArt creature={c} width={150} flip={flip} sizeScale gear={{ weapon: !!(gear?.weapon || gear?.offhand), armor: !!gear?.armor, helmet: !!gear?.helmet, rider: !!gear?.rider }} />
      </div>
      <div className="vs-name">{c.name}</div>
      <div className="vs-sub">{SPECIES[c.species].name} · Lv {c.level}</div>
      {stats && <div className="stat-mini vs-stats">{STATS.map((s) => <span key={s}>{STAT_SHORT[s]} <b>{getStat(c, s)}</b></span>)}</div>}
      {pieces.length > 0 && (
        <div className="vs-gear">
          {pieces.map((x) => <span key={x.id} className="vs-gear-chip" title={gearName(x)}><Icon name={SLOT_ICON[GEAR[x.type].slot]} size={12} /><GearName g={x} /></span>)}
        </div>
      )}
    </div>
  );
}

function Preview({ t, p, busy, onFight }: { t: Tournament; p: MatchPreview; busy: boolean; onFight: (prep: MatchPrep, label: string, opp: string) => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const m = memo(t.id);
  const [gearOv, setGearOv] = useState<GearOv>(() => ({ ...m.gear }));
  const [instr, setInstr] = useState<Record<ID, Instruction>>(() => ({ ...m.instr }));
  const [bribe, setBribe] = useState<CheatType | null>(null);
  const [stake, setStake] = useState(0);
  const [onSelf, setOnSelf] = useState(true);
  const [slotPick, setSlotPick] = useState<{ c: Creature; slot: GearSlot } | null>(null);
  const [techFor, setTechFor] = useState<Creature | null>(null);
  useEffect(() => { m.gear = gearOv; }, [gearOv, m]);
  useEffect(() => { m.instr = instr; }, [instr, m]);

  const mine = p.playerCreatures;
  const foes = p.opponentCreatures;
  const oppName = entryName(g, p.opponent);
  const myGear = useMemo(() => effectiveGear(g, me, mine, p.riders, t.natural, gearOv), [g, me, mine, p.riders, t.natural, gearOv, store.v]);
  const foeGear = useMemo(() => effectiveGear(g, p.opponentHouse, foes, p.riders, t.natural, {}), [g, p.opponentHouse, foes, p.riders, t.natural]);

  const own = mine.length;
  const enemy = foes.length;
  const canBet = hasOpp(g, 'gambler');
  const betOdds = onSelf ? p.odds : -p.odds;
  const mult = betMultiplier(betOdds);
  const payout = Math.floor(stake * (1 + mult));
  const bribeCost = bribe ? safe(() => cheatCost(g, t, bribe, own, enemy), 0) : 0;
  const total = bribeCost + (canBet ? stake : 0);
  const short = total > me.denarii;

  const fight = () => {
    const prep: MatchPrep = {
      gear: Object.fromEntries(Object.entries(gearOv).filter(([id]) => mine.some((c) => c.id === id))),
      instructions: Object.fromEntries(mine.map((c) => [c.id, instr[c.id] ?? c.instruction])),
      bribe: bribe ?? undefined,
      bet: canBet && stake > 0 ? { stake, onSelf } : undefined,
    };
    onFight(prep, p.roundLabel, oppName);
  };

  return (
    <div className="stack">
      <div className="versus" aria-label="Match preview">
        <div className="versus-head">
          <span className="micro">{p.bonusRound ? `Bonus round ${p.bonusRound}` : p.roundLabel}</span>
          <div className="row gap-1 wrap center-x">
            {p.aiCheats ? <Pill tone="bad" icon="warning" title="The rival has paid someone off">Bribed guards</Pill> : <Pill tone="good" icon="check">Fair play expected</Pill>}
            {p.riders && !t.natural && <Pill tone="info" icon="rider">Riders allowed</Pill>}
            {t.natural && <Pill tone="info" icon="paw">No harness</Pill>}
          </div>
        </div>
        <div className="vs-grid">
          <div className="vs-team">
            <div className="vs-house">{me.name}</div>
            {mine.map((c) => <FighterCard key={c.id} c={c} gear={myGear.get(c.id)} />)}
          </div>
          <div className="vs-mid">
            <span className="vs-word">vs</span>
            <span className="vs-odds num" title="Team worth difference (GM: Σ worth + 10)">{signed(p.odds)}</span>
            <span className="vs-odds-l">{oddsLabel(p.odds)}</span>
          </div>
          <div className="vs-team">
            <div className="vs-house">{oppName}</div>
            {foes.length === 0 && <div className="xs muted center">Nobody turned up.</div>}
            {foes.map((c) => <FighterCard key={c.id} c={c} gear={foeGear.get(c.id)} flip />)}
          </div>
        </div>
      </div>

      <div className="cols">
        <Panel label="Preparation" title="Your fighters" flush>
          {mine.map((c) => {
            const ins = instr[c.id] ?? c.instruction;
            const info = INSTRUCTIONS.find((x) => x.id === ins) ?? INSTRUCTIONS[0];
            const eg = myGear.get(c.id) ?? {};
            const order = techOrderOf(c).filter((x) => c.techniques.find((k) => k.id === x)?.equipped);
            return (
              <div key={c.id} className="prep-card">
                <div className="row gap-2">
                  <DinoThumb creature={c} size={44} />
                  <div className="grow">
                    <div className="strong ellipsis">{c.name}</div>
                    <div className="xs muted">{lifePhase(c)} {SPECIES[c.species].name} · tameness {Math.round(c.loyalty)}{c.loyalty < 60 ? ' (quick to yield)' : ''}</div>
                  </div>
                </div>
                {c.kind === 'dino' && !t.natural ? (
                  <div className="slot-chips mt-2" role="group" aria-label={`${c.name} harness`}>
                    {SLOT_ORDER.map((s) => {
                      const x = eg[s];
                      const changed = gearOv[c.id]?.[s] !== undefined;
                      const noRider = s === 'rider' && !p.riders;
                      return (
                        <button key={s} id={`prep-${c.id}-${s}`} type="button" className={`slot-chip${x ? ' filled' : ''}${changed ? ' changed' : ''}`} disabled={noRider} title={noRider ? 'No riders this round' : undefined} onClick={() => setSlotPick({ c, slot: s })}>
                          <Icon name={SLOT_ICON[s]} size={14} />
                          <span className="sc-l">{SLOT_LABEL[s]}</span>
                          <span className="sc-v">{x ? <GearName g={x} /> : noRider ? 'Not this round' : 'None'}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="xs muted mt-2">{c.kind === 'beast' ? 'Beasts fight with tooth and claw, and never yield.' : 'Primal Bout: no harness at all.'}</p>
                )}
                <div className="mt-2">
                  <Segmented id={`instr-${c.id}`} label={`${c.name} instruction`} size="sm" value={ins} onChange={(v) => setInstr({ ...instr, [c.id]: v })}
                    options={INSTRUCTIONS.map((x) => ({ value: x.id, label: x.short, title: x.label }))} />
                  <p className="instr-note xs"><b>{info.label}.</b> {info.text}</p>
                </div>
                {order.length > 0 && (
                  <div className="row gap-2 between mt-1">
                    <span className="xs muted ellipsis">Techniques: {order.map((x) => TECHNIQUES[x]?.name ?? x).join(' › ')}</span>
                    <Btn id={`tech-${c.id}`} size="sm" variant="quiet" icon="sort" onClick={() => setTechFor(c)}>Order</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>

        <div className="stack">
          <Panel label="Bribes" title="A word with the handlers" actions={<span className="xs muted">One per fight</span>}>
            <div className="choices" role="radiogroup" aria-label="Bribe">
              <button type="button" id="bribe-none" role="radio" aria-checked={bribe === null} className={`choice-btn${bribe === null ? ' on' : ''}`} onClick={() => setBribe(null)}>
                <span className="row gap-2"><Icon name="check" size={16} />Fight fair</span>
              </button>
              {CHEATS.map((k) => {
                const cost = safe(() => cheatCost(g, t, k, own, enemy), 0);
                const why = safe(() => cheatAvailable(g, t, k, own, enemy), 'Not available.');
                return (
                  <button key={k} type="button" id={`bribe-${k}`} role="radio" aria-checked={bribe === k} className={`choice-btn${bribe === k ? ' on' : ''}`} disabled={!!why} onClick={() => setBribe(k)}>
                    <span className="row gap-2 between" style={{ width: '100%' }}><span className="row gap-2"><Icon name={CHEAT_ICON[k]} size={16} />{CHEAT_NAMES[k].name}</span><Money value={cost} size="sm" /></span>
                    <span className="cb-desc">{CHEAT_NAMES[k].desc}</span>
                    {why && <span className="cb-reason"><Icon name="lock" size={12} />{why}</span>}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel label="Bookmakers" title="Place a bet">
            {canBet ? (
              <div className="stack-sm">
                <Segmented id="bet-side" label="Back which side" value={onSelf ? 'self' : 'them'} onChange={(v) => setOnSelf(v === 'self')}
                  options={[{ value: 'self', label: `On ${me.name}` }, { value: 'them', label: `On ${oppName}` }]} />
                <Segmented id="bet-stake" label="Stake" size="sm" value={String(stake)} onChange={(v) => setStake(Number(v))}
                  options={BET_STAKES.map((s) => ({ value: String(s), label: s === 0 ? 'No bet' : String(s), disabled: s > me.denarii }))} />
                <KV k="Odds on that side">{oddsLabel(betOdds)} · ×{(1 + mult).toFixed(2)}</KV>
                <KV k="Pays if it wins">{stake > 0 ? <span className="num">{fmt(stake)} × (1 + {mult}) = <b>{fmt(payout)}</b></span> : '—'}</KV>
                <p className="xs muted">The stake is paid when the bet is placed.</p>
              </div>
            ) : (
              <div className="row gap-2 top">
                <Icon name="lock" size={16} className="muted" />
                <div className="small">Betting needs the <b>Gambler</b> opportunity on the Trickster path. <button type="button" className="link-btn" onClick={() => store.nav.push({ name: 'influence' })}>Influence</button></div>
              </div>
            )}
          </Panel>
          <Hint icon="info">Your fighters wear what they wear in the ludus unless you change a slot here. Changes last for this tournament.</Hint>
        </div>
      </div>

      <div className="fight-bar">
        <div className="grow">
          <div className="xs muted">{bribe ? CHEAT_NAMES[bribe].name : 'No bribe'}{canBet && stake ? ` · bet ${fmt(stake)}` : ''}</div>
          <div className="row gap-2">{total > 0 ? <Money value={-total} /> : <span className="small muted">Costs nothing</span>}{short && <span className="xs bad">Not enough denarii</span>}</div>
        </div>
        <Btn id="arena-fight" variant="primary" size="lg" icon="arena" disabled={busy || short} onClick={fight}>Fight</Btn>
      </div>

      {slotPick && (
        <Sheet open onClose={() => setSlotPick(null)} title={`${slotPick.c.name}: ${SLOT_LABEL[slotPick.slot]}`} label="Harness for this tournament"
          footer={gearOv[slotPick.c.id]?.[slotPick.slot] !== undefined ? (
            <div className="row end"><Btn id="slot-reset" variant="ghost" icon="back" onClick={() => {
              const o = { ...gearOv, [slotPick.c.id]: { ...gearOv[slotPick.c.id] } };
              delete o[slotPick.c.id][slotPick.slot];
              if (!Object.keys(o[slotPick.c.id]).length) delete o[slotPick.c.id];
              setGearOv(o);
              setSlotPick(null);
            }}>Use the ludus loadout</Btn></div>
          ) : undefined}>
          <GearPicker id="prep-gear" h={me} slot={slotPick.slot} current={myGear.get(slotPick.c.id)?.[slotPick.slot] ?? null}
            onPick={(id) => { setGearOv({ ...gearOv, [slotPick.c.id]: { ...(gearOv[slotPick.c.id] ?? {}), [slotPick.slot]: id } }); setSlotPick(null); }} />
        </Sheet>
      )}
      {techFor && <TechOrderSheet c={techFor} onClose={() => setTechFor(null)} />}
    </div>
  );
}

/** Technique priority (GM TacticsActivity): saved to creature.techOrder. */
export function TechOrderSheet({ c, onClose }: { c: Creature; onClose: () => void }) {
  const store = useStore();
  const order = techOrderOf(c);
  const move = (i: number, d: -1 | 1) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    store.act((s) => { setTechOrder(s, c.id, o); return true; });
  };
  return (
    <Sheet open onClose={onClose} title={`${c.name}: tactics`} label="Technique priority" footer={<div className="row end"><Btn id="tech-done" variant="primary" onClick={onClose}>Done</Btn></div>}>
      <p className="small muted mb-2">When several techniques are ready, the one higher on the list is used first. Unequipped techniques are never used.</p>
      <ol className="list-reset tech-order">
        {order.map((id, i) => {
          const k = c.techniques.find((x) => x.id === id);
          const d = TECHNIQUES[id];
          return (
            <li key={id} className={k?.equipped ? '' : 'off'}>
              <span className="to-n num">{i + 1}</span>
              <span className="grow"><span className="strong">{d?.name ?? id}</span> <span className="xs muted">rank {k?.rank ?? 1} · cooldown {d?.cooldown ?? 0}{k?.equipped ? '' : ' · not equipped'}</span></span>
              <Btn id={`to-up-${id}`} size="sm" variant="ghost" icon="chevronUp" aria-label={`Move ${d?.name} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <Btn id={`to-down-${id}`} size="sm" variant="ghost" icon="chevronDown" aria-label={`Move ${d?.name} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)} />
            </li>
          );
        })}
      </ol>
      {order.length === 0 && <p className="small muted">No techniques learned yet.</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------
// Round report
// ---------------------------------------------------------------------------------------------

function RoundReport({ t, r, onNext }: { t: Tournament; r: Extract<Phase, { kind: 'report' }>; onNext: () => void }) {
  const store = useStore();
  const g = store.game!;
  const side = r.result.playerSide ?? 0;
  const mineOut = r.result.outcomes.filter((o) => o.side === side && !o.temporary);
  const name = (id: ID) => r.result.fighters.find((f) => f.id === id)?.name ?? g.player.ludus.creatures.find((c) => c.id === id)?.name ?? 'A fighter';
  const over = t.status === 'done';
  return (
    <div className="result-card">
      <Plaque>
        <div className="result-head">
          <div className="micro row gap-1 center-x"><Icon name={r.won ? 'trophy' : 'skull'} size={14} />{r.label}</div>
          <h2 className={r.won ? 'good' : 'bad'}>{r.won ? 'Victory' : 'Defeat'}</h2>
        </div>
        <div className="result-art">
          {mineOut.map((o) => {
            const c = g.player.ludus.creatures.find((x) => x.id === o.creatureId) ?? g.player.tomb.find((x) => x.creature?.id === o.creatureId)?.creature;
            return c ? <DinoArt key={c.id} creature={c} width={130} dead={o.died} animate={!o.died} /> : null;
          })}
        </div>
        <p className="story-intro mt-3">{r.text}</p>
        {r.betPayout !== undefined && <p className="small">{r.betPayout > 0 ? <>The bookmakers paid <Money value={r.betPayout} size="sm" />.</> : 'The bookmakers kept your stake.'}</p>}
        <Rule>Your fighters</Rule>
        <ul className="list-reset stack-sm">
          {mineOut.map((o) => (
            <li key={o.creatureId} className="report-line">
              <span className={`dot ${o.died ? 'dot-bad' : o.injury ? 'dot-warning' : 'dot-good'}`} />
              <span>
                <b>{name(o.creatureId)}</b>
                {o.died ? ' died on the sand.' : o.injury ? ` suffered ${INJURY_NAMES[o.injury.type] ?? 'an injury'} (${o.injury.weeks} week${o.injury.weeks === 1 ? '' : 's'}).` : o.knockedOut ? ' was knocked out but is unhurt.' : o.yielded ? ' yielded, unhurt.' : ' walked off unhurt.'}
                {o.newTraits.length > 0 && <> New trait: {o.newTraits.map((x) => TRAITS[x]?.name ?? camelToWords(x)).join(', ')}.</>}
              </span>
              <span className="xs muted num nowrap">{o.xp ? `+${o.xp} XP` : ''}{o.fame ? ` · ${signed(o.fame)} fame` : ''}</span>
            </li>
          ))}
          {mineOut.length === 0 && <li className="small muted">Nobody had to fight.</li>}
        </ul>
      </Plaque>
      <div className="row gap-2 mt-3 end">
        {r.result.log.length > 0 && <Btn id="report-replay" variant="ghost" icon="arena" onClick={() => store.showBattle(r.result, `${t.name}: ${r.label}`)}>Watch again</Btn>}
        <Btn id="report-next" variant="primary" iconRight="arrow" onClick={onNext}>{over ? 'Tournament results' : 'Continue'}</Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Underground: keep fighting or retire
// ---------------------------------------------------------------------------------------------

function BonusChoice({ t, onChoose }: { t: Tournament; onChoose: (go: boolean) => void }) {
  const store = useStore();
  const g = store.game!;
  const won = bonusWon(t);
  const k = t.bonusRound + 1;
  const max = maxBonusRounds(t);
  const left = Math.max(0, max - t.bonusRound);
  const champ = champIndex(t);
  const cs = champ !== undefined ? entryCreatures(g, t.entries[champ]) : [];
  const nextTrait = t.type === 'underground' ? PIT_LADDER.find((s) => s.minK === won + 2) : undefined;
  const hurt = cs.filter((c) => c.injury);
  return (
    <div className="result-card">
      <Plaque>
        <div className="result-head">
          <div className="micro row gap-1 center-x"><Icon name="skull" size={14} />{t.underground ? 'The pit master calls' : 'The crowd wants more'}</div>
          <h2>{won ? `${won} bonus round${won > 1 ? 's' : ''} won` : 'Bracket won'}</h2>
        </div>
        <div className="result-art">{cs.map((c) => <DinoArt key={c.id} creature={c} width={150} />)}</div>
        <p className="story-intro center">The sand is still wet. {left > 0 ? `Up to ${left} more round${left > 1 ? 's' : ''} await, each worth another 25 denarii.` : 'There is nobody left to fight.'}</p>
        <div className="kv-grid mt-2">
          <KV k="Next foe">{bonusFoeLabel(t, k)}</KV>
          <KV k="Bonus so far"><Money value={25 * won} size="sm" /></KV>
          {nextTrait && <KV k="Win it to earn">{TRAITS[nextTrait.trait]?.name ?? nextTrait.trait}</KV>}
          {hurt.length > 0 && <KV k="Injured">{hurt.map((c) => c.name).join(', ')}</KV>}
        </div>
        <Hint icon="warning">Bonus foes fight to win and never go easy. A loss ends the run, and injuries can kill.</Hint>
      </Plaque>
      <div className="row gap-2 mt-3 end wrap">
        <Btn id="pit-retire" icon="flag" onClick={() => onChoose(false)}>Retire with the winnings</Btn>
        <Btn id="pit-continue" variant="primary" icon="arena" disabled={left <= 0} onClick={() => onChoose(true)}>Keep fighting</Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------------------------

function FinalReport({ t }: { t: Tournament }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const snap = SNAPS.get(t.id);
  const champ = champIndex(t);
  const champEntry = champ !== undefined ? t.entries[champ] : undefined;
  const iWon = champEntry?.houseId === me.id;
  const lines = t.log.filter((l) => l.startsWith('» ')).map((l) => l.slice(2));
  const league = t.league ? g.world.leagues.find((l) => l.id === t.league) : undefined;
  const rows = Object.entries(snap?.creatures ?? {}).map(([id, s]) => {
    const c = me.creatures.find((x) => x.id === id);
    const dead = !c && g.player.tomb.some((x) => x.creature?.id === id || x.name === s.name);
    const traits = c ? c.traits.filter((x) => !s.traits.includes(x)) : [];
    return { id, s, c, dead, traits, fame: c ? c.fame - s.fame : 0, level: c ? c.level - s.level : 0, points: league && c ? (league.points[id] ?? 0) - s.points : 0 };
  });
  const purse = snap ? me.denarii - snap.denarii : 0;
  const infl = snap ? me.influence - snap.influence : 0;
  const others = Object.keys(g.player.registrations).filter((id) => id !== t.id).map((id) => g.world.tournaments.find((x) => x.id === id)).filter((x): x is Tournament => !!x);
  const finish = () => {
    PREP.delete(t.id);
    SNAPS.delete(t.id);
    store.finishWeek();
  };
  return (
    <div className="cols cols-wide-left">
      <div className="stack">
        <Plaque>
          <div className="result-head">
            <div className="micro row gap-1 center-x"><Icon name="trophy" size={14} />Final report</div>
            <h2>{t.status !== 'done' ? 'Still running' : iWon ? 'Champions!' : champEntry ? `Victory for ${entryName(g, champEntry)}` : 'No champion'}</h2>
          </div>
          {champEntry && (
            <div className="result-art">{entryCreatures(g, champEntry).slice(0, 3).map((c) => <DinoArt key={c.id} creature={c} width={140} />)}</div>
          )}
          {lines.length > 0 ? (
            <ul className="list-reset stack-sm mt-2">{lines.map((l, i) => <li key={i} className="report-line"><span className="dot dot-event" /><span>{l}</span><span /></li>)}</ul>
          ) : (
            <p className="small muted center mt-2">{iWon ? '' : 'Your fighters went home without a prize.'}</p>
          )}
          <div className="kv-grid mt-3">
            <KV k="Purse this event"><Money value={purse} signedValue /></KV>
            <KV k="Influence"><Influence value={infl} signedValue /></KV>
          </div>
        </Plaque>
        <Panel label="Your fighters" title="How they fared" flush>
          {rows.map((r) => (
            <div key={r.id} className="crow">
              {r.c ? <DinoThumb creature={r.c} size={48} /> : <span className="dino-thumb" style={{ width: 48, height: 48, placeItems: 'center' }}><Icon name="skull" size={20} /></span>}
              <div className="crow-main">
                <div className="crow-name"><span className="nm">{r.s.name}</span></div>
                <div className="crow-sub">{r.dead ? 'Died in the arena' : r.c?.injury ? `Injured, ${r.c.injury.weeks} week${r.c.injury.weeks === 1 ? '' : 's'}` : 'Fit'}{r.level > 0 ? ` · level ${r.c?.level}` : ''}</div>
                {r.traits.length > 0 && <div className="crow-chips">{r.traits.map((x) => <Pill key={x} tone="amber" icon="star">{TRAITS[x]?.name ?? camelToWords(x)}</Pill>)}</div>}
              </div>
              <div className="crow-right">
                <span className="xs num">{signed(r.fame)} fame</span>
                {league && <span className="xs num verdigris">{signed(r.points)} league pts</span>}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="empty small muted">No fighters of yours took part.</div>}
        </Panel>
      </div>
      <div className="stack">
        <Bracket t={t} open />
        {others.length > 0 && <Hint icon="arena">Your entries in {others.map((x) => x.name).join(', ')} fight without you; their results are in the week report.</Hint>}
        <Btn id="arena-finish" variant="primary" size="lg" block icon="advance" onClick={finish}>Finish the week</Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Bracket [TournamentOtherRoundsActivity]
// ---------------------------------------------------------------------------------------------

function Bracket({ t, open }: { t: Tournament; open?: boolean }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [show, setShow] = useState(!!open);
  const R = bracketRounds(t);
  const rounds = [...new Set(t.matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <Panel label="Bracket" title={`${t.entries.length ? Math.min(t.teams, t.entries.length) : t.teams} teams`} actions={<Btn id="bracket-toggle" size="sm" variant="ghost" icon={show ? 'chevronUp' : 'chevronDown'} aria-label={show ? 'Hide the bracket' : 'Show the bracket'} onClick={() => setShow(!show)} />}>
      {!show ? <p className="xs muted">{t.matches.filter((m) => m.winner !== undefined).length} of {t.matches.length} matches fought.</p> : (
        <div className="bracket">
          {rounds.length === 0 && <p className="small muted">The draw has not been made.</p>}
          {rounds.map((r) => (
            <div key={r} className="bk-round">
              <div className="micro">{r > R ? `Bonus ${r - R}` : safe(() => roundLabel(g, t, t.matches.find((m) => m.round === r)!), `Round ${r}`)}</div>
              {t.matches.filter((m) => m.round === r).map((m, i) => {
                const a = t.entries[m.a];
                const b = t.entries[m.b];
                const cls = (idx: number) => `${m.winner === idx ? 'win' : m.winner !== undefined ? 'lose' : ''}${t.entries[idx]?.houseId === me.id ? ' mine' : ''}`;
                return (
                  <div key={i} className="bk-match">
                    <span className={cls(m.a)}>{a ? entryName(g, a) : '—'}</span>
                    <span className="bk-vs">v</span>
                    <span className={cls(m.b)}>{b ? entryName(g, b) : '—'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
