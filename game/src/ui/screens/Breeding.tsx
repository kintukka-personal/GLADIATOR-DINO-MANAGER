// Breeding tab (new): Pairs (Breeding Pen + offspring prediction), Hatchery (incubation, temperature),
// Nursery (maturation, imprint care requests), Pantry & Kitchen, Bloodlines (ARK breeder's spreadsheet).
import React, { useMemo, useState } from 'react';
import type { Creature, Egg, FoodId, GameState, SpeciesId, Stat, Stats, TraitId } from '../../engine/types';
import { STATS } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { TRAITS } from '../../engine/data/traits';
import { colorHex, colorName } from '../../engine/data/colors';
import { FOODS, FOOD_IDS, KIBBLE_FOR_TIER, TIER_FOR_EGG, EGG_SIZE_NAME } from '../../engine/data/food';
import { lifePhase, wildLevel } from '../../engine/creature';
import {
  HIGHER_STAT_CHANCE, MUTATION_CHANCE, MUTATION_LIMIT, MUTATION_ROLLS, assignPair, breedingIssue, craftKibble, eggCapacity, eggTemperature,
  eggVisible, fulfillImprint, kibbleFromEgg, matingThisWeek, nurseryCapacity, pairIssue, removePair, seasonName, sellEggValue, dietFood,
  imprintStep,
} from '../../engine/breeding';
import { buyFood, sellEgg } from '../../engine/market';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Tabs } from '../components/Tabs';
import { Btn, EmptyState, Hint, KV, Meter, Money, Panel, Pill, Plaque, Rule, Toggle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, SexIcon, type IconName } from '../components/Icon';
import { CreaturePicker, SpeciesSelect } from '../components/CreatureRow';
import { DinoArt } from '../art/DinoArt';
import { EggArt, Thermometer } from '../art/EggArt';
import { safe } from '../safe';
import { totals } from '../derive';
import { STAT_SHORT, fmt, pct, plural, eggAtRisk, REGION_NAMES } from '../format';
import { hasUpgrade } from '../../engine/util';

export function BreedingScreen() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const tab = store.screen.tab ?? 'pairs';
  const care = me.creatures.filter((c) => c.imprintRequest && !c.imprintRequest.done).length;
  const risk = me.eggs.filter(eggAtRisk).length;
  return (
    <>
      <ScreenHead title="Breeding" sub={`${seasonName(g.world.week)} · ${g.world.temperature}°C · ${plural(me.eggs.filter((e) => e.fertilized).length, 'egg')} · ${plural(me.creatures.filter((c) => c.maturity < 1).length, 'hatchling')}`} back={false} />
      <Tabs id="breeding" label="Breeding sections" value={tab} onChange={(t) => store.nav.update({ tab: t })}
        items={[
          { id: 'pairs', label: 'Pairs', icon: 'heart', badge: me.pairs.length || undefined },
          { id: 'hatchery', label: 'Hatchery', icon: 'flame', badge: risk || undefined },
          { id: 'nursery', label: 'Nursery', icon: 'baby', badge: care || undefined },
          { id: 'pantry', label: 'Pantry', icon: 'kibble' },
          { id: 'bloodlines', label: 'Bloodlines', icon: 'tree' },
        ]} />
      {tab === 'pairs' && <Pairs />}
      {tab === 'hatchery' && <Hatchery />}
      {tab === 'nursery' && <Nursery />}
      {tab === 'pantry' && <Pantry />}
      {tab === 'bloodlines' && <Bloodlines />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------------------------

function mutationOdds(g: GameState, mother: Creature, father: Creature) {
  const q = MUTATION_CHANCE + (hasUpgrade(g, 'geneticist') ? 0.005 : 0);
  const mTot = mother.genes.mutMatri + mother.genes.mutPatri;
  const fTot = father.genes.mutMatri + father.genes.mutPatri;
  const mCan = mTot < MUTATION_LIMIT;
  const fCan = fTot < MUTATION_LIMIT;
  const perRoll = 0.5 * (mCan ? q : 0) + 0.5 * (fCan ? q : 0);
  const any = 1 - Math.pow(1 - perRoll, MUTATION_ROLLS);
  return { any, mCan, fCan, mTot, fTot, q };
}

function heritableOdds(mother: Creature, father: Creature): { t: TraitId; p: number; both: boolean }[] {
  const set = new Set<TraitId>([...mother.traits, ...father.traits].filter((t) => TRAITS[t]?.heritable));
  return [...set].map((t) => {
    const both = mother.traits.includes(t) && father.traits.includes(t);
    return { t, p: both ? 0.55 : 0.3, both };
  });
}

function OffspringPrediction({ mother, father }: { mother: Creature; father: Creature }) {
  const store = useStore();
  const g = store.game!;
  const m = mutationOdds(g, mother, father);
  const traits = heritableOdds(mother, father);
  const lo = 1 + STATS.reduce((n, s) => n + Math.min(mother.genes.wild[s], father.genes.wild[s]), 0);
  const hi = 1 + STATS.reduce((n, s) => n + Math.max(mother.genes.wild[s], father.genes.wild[s]), 0);
  return (
    <div className="stack">
      <Plaque label="Predicted offspring" title={`Wild level ${lo}–${hi}`} actions={<Pill tone="verdigris">Gen {Math.max(mother.genes.generation, father.genes.generation) + 1}</Pill>}>
        <div className="predict-row micro"><span>Stat</span><span>Higher parent · {pct(HIGHER_STAT_CHANCE)}</span><span>Lower parent · {pct(1 - HIGHER_STAT_CHANCE)}</span></div>
        {STATS.map((s) => {
          const a = mother.genes.wild[s];
          const b = father.genes.wild[s];
          const hiV = Math.max(a, b);
          const loV = Math.min(a, b);
          const hiFrom = a >= b ? 'mother' : 'father';
          return (
            <div key={s} className="predict-row">
              <span className="micro">{STAT_SHORT[s]}</span>
              {a === b ? (
                <span className="predict-opt hi" style={{ gridColumn: 'span 2' }}><span className="val">{a}</span><span className="pct">100%</span><span className="xs muted">both parents</span></span>
              ) : (
                <>
                  <span className="predict-opt hi"><span className="val">{hiV}</span><span className="xs muted">{hiFrom}</span></span>
                  <span className="predict-opt"><span className="val">{loV}</span><span className="xs muted">{hiFrom === 'mother' ? 'father' : 'mother'}</span></span>
                </>
              )}
            </div>
          );
        })}
        <Rule>Mutations</Rule>
        <div className="row between gap-3 wrap">
          <div>
            <div className="lg display num">{pct(m.any, 2)}</div>
            <div className="xs muted">chance of at least one mutation ({MUTATION_ROLLS} rolls × {pct(m.q, 1)})</div>
          </div>
          <div className="stack-sm">
            <Pill tone={m.mCan ? 'good' : 'bad'} icon={m.mCan ? 'check' : 'lock'}>Mother {m.mTot}/{MUTATION_LIMIT} {m.mCan ? 'can mutate' : 'at limit'}</Pill>
            <Pill tone={m.fCan ? 'good' : 'bad'} icon={m.fCan ? 'check' : 'lock'}>Father {m.fTot}/{MUTATION_LIMIT} {m.fCan ? 'can mutate' : 'at limit'}</Pill>
          </div>
        </div>
        <p className="xs muted mt-2">Offspring counters: matrilineal {m.mTot}, patrilineal {m.fTot}. A mutation adds +2 wild points to one stat and changes one colour region.</p>
      </Plaque>
      <Panel label="Colours" title="Each region from either parent">
        <div className="color-inherit">
          {REGION_NAMES.map((r, i) => (
            <div key={r} className="ci-cell" title={`${r}: ${colorName(mother.genes.colors[i])} or ${colorName(father.genes.colors[i])}`}>
              <div className="ci-pair">
                <span style={{ background: colorHex(mother.genes.colors[i]) }} />
                <span style={{ background: colorHex(father.genes.colors[i]) }} />
              </div>
              <span>{r.split(' ')[0]}</span>
            </div>
          ))}
        </div>
        <div className="row gap-3 mt-2 center-x">
          <div className="col center"><DinoArt species={mother.species} colors={mother.genes.colors.map((c, i) => (i % 2 ? father.genes.colors[i] : c))} maturity={0.06} width={110} seed={mother.id + father.id} animate={false} /><span className="xs muted">one possible hatchling</span></div>
          <div className="col center"><DinoArt species={mother.species} colors={father.genes.colors.map((c, i) => (i % 2 ? mother.genes.colors[i] : c))} maturity={0.06} width={110} seed={father.id + mother.id} animate={false} /><span className="xs muted">another</span></div>
        </div>
      </Panel>
      <Panel label="Heritable traits" title={traits.length ? 'Odds per trait (max 3)' : 'None to pass on'}>
        {traits.length === 0 && <p className="small muted">Neither parent carries a heritable trait.</p>}
        {traits.map((x) => (
          <KV key={x.t} k={<span className="row gap-1"><Icon name="dna" size={14} />{TRAITS[x.t].name}{x.both && <Pill tone="good">both parents</Pill>}</span>}>{pct(x.p)}</KV>
        ))}
      </Panel>
    </div>
  );
}

function PairCard({ maleId, femaleId, since }: { maleId: string; femaleId: string; since: number }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const male = me.creatures.find((c) => c.id === maleId);
  const female = me.creatures.find((c) => c.id === femaleId);
  const [details, setDetails] = useState(false);
  if (!male || !female) return null;
  const issue = safe(() => pairIssue(me, male, female), null);
  const mating = safe(() => matingThisWeek(me, female), false);
  const sp = SPECIES[female.species];
  const status = female.pregnancy
    ? { tone: 'fresco' as const, text: `Pregnant · ${female.pregnancy.weeksLeft}w` }
    : issue ? { tone: 'bad' as const, text: issue }
      : female.mateCooldown > 0 ? { tone: 'warn' as const, text: `Cooldown ${female.mateCooldown}w` }
        : mating ? { tone: 'good' as const, text: sp.repro === 'egg' ? 'Lays an egg this week' : 'Mates this week' }
          : { tone: 'muted' as const, text: 'Waiting' };
  const odds = mutationOdds(g, female, male);
  return (
    <Panel label={`${sp.name} · paired since week ${since}`} actions={<Btn size="sm" variant="ghost" icon="close" onClick={() => store.act((s) => { removePair(s, femaleId); return true; }, { ok: 'Pair split up.' })} aria-label="Remove pair" />}>
      <div className="pair-card">
        <button type="button" className="pair-side link-plain" onClick={() => store.nav.push({ name: 'dino', id: female.id, tab: 'genetics' })}>
          <span className="dino-thumb" style={{ width: 104, height: 84 }}><DinoArt creature={female} framing="bust" width={98} height={78} animate={false} /></span>
          <span className="strong row gap-1">{female.name}<SexIcon sex="F" size={14} /></span>
          <span className="xs muted num">Wild {wildLevel(female)} · M{female.genes.mutMatri}/P{female.genes.mutPatri}</span>
        </button>
        <div className="pair-heart">
          <Icon name="heart" size={26} />
          <Pill tone={status.tone}>{status.text}</Pill>
        </div>
        <button type="button" className="pair-side link-plain" onClick={() => store.nav.push({ name: 'dino', id: male.id, tab: 'genetics' })}>
          <span className="dino-thumb" style={{ width: 104, height: 84 }}><DinoArt creature={male} framing="bust" width={98} height={78} flip animate={false} /></span>
          <span className="strong row gap-1">{male.name}<SexIcon sex="M" size={14} /></span>
          <span className="xs muted num">Wild {wildLevel(male)} · M{male.genes.mutMatri}/P{male.genes.mutPatri}</span>
        </button>
      </div>
      <div className="row between mt-2 wrap gap-2">
        <span className="xs muted">Mutation chance <b className="num">{pct(odds.any, 2)}</b> · cooldown after mating {sp.mateCooldown}w</span>
        <Btn size="sm" variant="quiet" icon="dna" onClick={() => setDetails(true)}>Predict</Btn>
      </div>
      <Sheet open={details} onClose={() => setDetails(false)} title={`${female.name} × ${male.name}`} label="Offspring prediction" wide>
        <OffspringPrediction mother={female} father={male} />
      </Sheet>
    </Panel>
  );
}

function NewPairSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [fem, setFem] = useState<string[]>([]);
  const [mal, setMal] = useState<string[]>([]);
  const female = me.creatures.find((c) => c.id === fem[0]);
  const male = me.creatures.find((c) => c.id === mal[0]);
  const paired = new Set(me.pairs.map((p) => p.femaleId));
  const close = () => { setFem([]); setMal([]); onClose(); };
  const assign = () => {
    if (!female || !male) return;
    const r = store.act((s) => assignPair(s, male.id, female.id), { ok: `${female.name} and ${male.name} share a pen.` });
    if (r === null) close();
  };
  return (
    <Sheet open={open} onClose={close} wide title={female ? (male ? `${female.name} × ${male.name}` : `A mate for ${female.name}`) : 'Choose the female'} label="New pair"
      footer={
        <div className="row gap-2 between wrap">
          <Btn variant="ghost" icon="back" disabled={!female} onClick={() => (male ? setMal([]) : setFem([]))}>Back</Btn>
          <Btn id="pair-assign" variant="primary" icon="heart" disabled={!female || !male} onClick={assign}>Assign to the pen</Btn>
        </div>
      }>
      {!female && (
        <CreaturePicker id="pf" g={g} creatures={me.creatures.filter((c) => c.sex === 'F')} max={1} selected={fem} onChange={setFem}
          eligible={(c) => (paired.has(c.id) ? 'Already paired' : safe(() => breedingIssue(c), 'Cannot breed'))} />
      )}
      {female && !male && (
        <CreaturePicker id="pm" g={g} creatures={me.creatures.filter((c) => c.sex === 'M')} max={1} selected={mal} onChange={setMal}
          eligible={(c) => safe(() => pairIssue(me, c, female), 'Cannot breed')} />
      )}
      {female && male && <OffspringPrediction mother={female} father={male} />}
    </Sheet>
  );
}

function Pairs() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const t = totals(me);
  const [newPair, setNewPair] = useState(false);
  if (t.pairs === 0) {
    return (
      <Plaque>
        <EmptyState icon="heart" title="Build a Breeding Pen" action={<Btn variant="primary" icon="estate" onClick={() => store.nav.area('estate')}>Open the estate</Btn>}>
          Two adults of the same species and opposite sex share a pen and produce an egg (or a litter) whenever the female is ready. The pen holds 1, 2 or 4 pairs as it grows.
        </EmptyState>
      </Plaque>
    );
  }
  const full = me.pairs.length >= t.pairs;
  return (
    <div className="stack">
      <div className="row between wrap gap-2">
        <div>
          <div className="micro">Breeding Pen · level {me.buildings.breedingPen}</div>
          <div className="lg display">{me.pairs.length} of {t.pairs} pairs</div>
        </div>
        <Btn id="pair-new" variant="primary" icon="plus" disabled={full} onClick={() => setNewPair(true)} title={full ? 'The pen is full: upgrade it for more pairs' : undefined}>New pair</Btn>
      </div>
      {me.pairs.length === 0 ? (
        <Plaque><EmptyState icon="heart" title="No pairs yet">Pick a healthy adult female, then a compatible male. The prediction shows what their offspring can inherit.</EmptyState></Plaque>
      ) : (
        <div className="cols">{me.pairs.map((p) => <PairCard key={p.femaleId} {...p} />)}</div>
      )}
      <Hint icon="dna">ARK rules: each stat comes from the parent with the higher value 55% of the time. Stack mutations with a clean female (few mutations) and a mutated male, and keep both lines under the 20-mutation limit.</Hint>
      <NewPairSheet open={newPair} onClose={() => setNewPair(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Hatchery
// ---------------------------------------------------------------------------------------------

function SeasonDial({ week }: { week: number }) {
  const w = ((week - 1) % 52 + 52) % 52;
  const a = (w / 52) * Math.PI * 2 - Math.PI / 2;
  const cols = ['#7fb069', '#e0b13b', '#c58a2b', '#6fa6cf'];
  return (
    <svg className="season-dial" viewBox="0 0 64 64" role="img" aria-label={`${seasonName(week)}, week ${w + 1} of the year`}>
      {cols.map((c, i) => {
        const a0 = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / 4) * Math.PI * 2 - Math.PI / 2;
        return <path key={i} d={`M32 32L${32 + 28 * Math.cos(a0)} ${32 + 28 * Math.sin(a0)}A28 28 0 0 1 ${32 + 28 * Math.cos(a1)} ${32 + 28 * Math.sin(a1)}Z`} fill={c} opacity={0.35} />;
      })}
      <circle cx="32" cy="32" r="28" fill="none" stroke="var(--line)" />
      <line x1="32" y1="32" x2={32 + 24 * Math.cos(a)} y2={32 + 24 * Math.sin(a)} stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3" fill="var(--fg)" />
    </svg>
  );
}

function localEggTemp(g: GameState, e: Egg, control: number, controlled: boolean): number {
  const T = g.world.temperature;
  if (!controlled) return T;
  const [lo, hi] = SPECIES[e.species].tempRange;
  const ideal = (lo + hi) / 2;
  const diff = ideal - T;
  if (Math.abs(diff) <= control) return Math.round(ideal);
  return Math.round(T + Math.sign(diff) * control);
}

function EggGenes({ e }: { e: Egg }) {
  if (!e.genes) return null;
  const w = e.genes.wild;
  return (
    <div className="row gap-2 wrap xs">
      {e.sex && <SexIcon sex={e.sex} size={14} />}
      <Pill tone="amber">Wild {wildLevel({ genes: e.genes })}</Pill>
      <span className="stat-mini">{STATS.map((s) => <span key={s}>{STAT_SHORT[s]} <b>{w[s]}</b></span>)}</span>
      {e.genes.mutations.length > 0 && <Pill tone="amber" icon="mutation">{e.genes.mutations.length} mutation{e.genes.mutations.length > 1 ? 's' : ''}</Pill>}
    </div>
  );
}

function Hatchery() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const t = totals(me);
  const slots = t.eggSlots;
  const cap = safe(() => eggCapacity(me), Math.max(1, slots));
  const fert = me.eggs.filter((e) => e.fertilized).sort((a, b) => a.laidWeek - b.laidWeek);
  const unf = me.eggs.filter((e) => !e.fertilized);
  const control = t.tempControl;
  const sellIt = async (e: Egg) => {
    const v = sellEggValue(e);
    const ok = await store.confirm({ title: `Sell this ${SPECIES[e.species].name} egg?`, text: <>The market pays <b>{fmt(v)}</b> denarii.{e.fertilized ? ' A fertilized egg sells at half its worth.' : ''}</>, confirmLabel: `Sell for ${fmt(v)}` });
    if (ok) store.act((s) => sellEgg(s, e.id), { ok: 'Egg sold.' });
  };
  return (
    <div className="stack">
      <Plaque label={me.buildings.hatchery ? `Hatchery · level ${me.buildings.hatchery}` : 'No hatchery'} title={me.buildings.hatchery ? `${plural(fert.length, 'egg')} · ${plural(cap, 'slot')}` : 'A straw nest'}>
        <div className="ambient">
          <SeasonDial week={g.world.week} />
          <div className="grow">
            <div className="temp num">{g.world.temperature}°C</div>
            <div className="small muted">{seasonName(g.world.week)} in Capua, week {g.world.week}</div>
          </div>
          <div className="col gap-1 right">
            <Pill tone="verdigris" icon="thermo">{control >= 99 ? 'Full control' : control > 0 ? `±${control}°C control` : 'No control'}</Pill>
            <span className="xs muted">Braziers: 3 denarii per egg per week</span>
          </div>
        </div>
        {!me.buildings.hatchery && <Hint icon="flame">Without a Hatchery only the oldest egg sits in a straw nest at the ambient temperature; any other egg lies in the open and weakens. Build one in the Estate.</Hint>}
      </Plaque>
      <Panel label="Fertilized" title={fert.length ? `${fert.length} incubating` : 'No eggs'} flush>
        {fert.length === 0 && <EmptyState icon="egg" title="No eggs in the hatchery">Assign pairs in the Breeding Pen, or buy a fertilized egg at the market.</EmptyState>}
        {fert.map((e, i) => {
          const sp = SPECIES[e.species];
          const inHatchery = i < slots;
          const inNest = slots === 0 && i === 0;
          const open = !inHatchery && !inNest;
          const proj = safe(() => eggTemperature(g, me, e, inHatchery), localEggTemp(g, e, control, inHatchery));
          const [lo, hi] = sp.tempRange;
          const lastOk = e.lastTemp === undefined || (e.lastTemp >= lo && e.lastTemp <= hi);
          const projOk = proj >= lo && proj <= hi;
          const visible = safe(() => eggVisible(g, e), e.known);
          const cold = e.lastTemp !== undefined && e.lastTemp < lo;
          const hot = e.lastTemp !== undefined && e.lastTemp > hi;
          return (
            <div key={e.id} className="egg-card">
              <div className={`egg-niche${cold ? ' cold' : hot ? ' hot' : ''}`}><EggArt egg={e} size={54} /></div>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                <div className="row gap-2 wrap">
                  <span className="strong">{sp.name}</span>
                  {inHatchery ? <Pill tone="good">Hatchery slot</Pill> : inNest ? <Pill tone="muted">Straw nest</Pill> : <Pill tone="bad">No slot: weakening</Pill>}
                  {!lastOk && <Pill tone={cold ? 'info' : 'bad'} icon="thermo">{cold ? 'Too cold' : 'Too hot'}</Pill>}
                </div>
                <div className="xs muted">{e.motherName && e.fatherName ? `${e.motherName} × ${e.fatherName}` : e.source === 'market' ? 'Bought at the market' : 'Unknown parents'} · laid week {e.laidWeek}</div>
                <div className="egg-meters">
                  <div>
                    <div className="row between xs"><span className="micro">Incubation</span><span className="num">{e.progress}/{e.needed} wk</span></div>
                    <Meter value={e.progress} max={e.needed} tone="amber" height={5} label="Incubation" />
                  </div>
                  <div>
                    <div className="row between xs"><span className="micro">Health</span><span className="num">{pct(e.health)}</span></div>
                    <Meter value={e.health} max={1} tone={e.health < 0.4 ? 'bad' : e.health < 0.75 ? 'warn' : 'good'} height={5} label="Egg health" />
                  </div>
                </div>
                {visible ? <EggGenes e={e} /> : <span className="xs muted row gap-1"><Icon name="lock" size={12} />Genetics hidden: needs 3 committed spies or the Geneticist upgrade</span>}
                <div className="row gap-2 wrap xs">
                  <span className={projOk ? 'good' : 'bad'}>This week: <b className="num">{proj}°C</b> {open ? '(in the open)' : ''}</span>
                  <span className="muted">needs {lo}–{hi}°C</span>
                  <button type="button" className="link-btn xs" onClick={() => sellIt(e)}>Sell</button>
                </div>
              </div>
              <Thermometer temp={e.lastTemp ?? proj} range={sp.tempRange} min={5} max={45} />
            </div>
          );
        })}
      </Panel>
      <Panel label="Unfertilized" title={unf.length ? `${unf.length} for the kitchen` : 'None'} flush>
        {unf.length === 0 && <div className="empty small muted">Adult females not in a pair lay an unfertilized egg now and then (25% a week). They make kibble.</div>}
        {unf.map((e) => {
          const k = kibbleFromEgg(e);
          const age = g.world.week - e.laidWeek;
          return (
            <div key={e.id} className="egg-card">
              <div className="egg-niche"><EggArt egg={e} size={44} /></div>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                <div className="strong">{SPECIES[e.species].name} <span className="muted small">· {EGG_SIZE_NAME[SPECIES[e.species].eggSize]}</span></div>
                <div className="xs muted">From {e.motherName ?? 'a female'} · spoils in {Math.max(0, 8 - age)} week{8 - age === 1 ? '' : 's'} · makes {FOODS[k].name}</div>
                <div className="row gap-1 wrap">
                  <Btn size="sm" icon="meat" disabled={!t.kitchen} title={!t.kitchen ? 'Build a Kitchen first' : undefined} onClick={() => store.act((s) => craftKibble(s, e.id, 'rawMeat'), { ok: `Made ${FOODS[k].name}.` })}>Kibble (meat)</Btn>
                  <Btn size="sm" icon="berries" disabled={!t.kitchen} onClick={() => store.act((s) => craftKibble(s, e.id, 'mejoberries'), { ok: `Made ${FOODS[k].name}.` })}>Kibble (berries)</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => sellIt(e)}>Sell {fmt(sellEggValue(e))}</Btn>
                </div>
              </div>
              <span />
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Nursery
// ---------------------------------------------------------------------------------------------

const FOOD_ICON: Record<string, IconName> = { meat: 'meat', berry: 'berries', kibble: 'kibble' };

function careLabel(c: Creature): { label: string; icon: IconName } {
  const r = c.imprintRequest;
  if (!r) return { label: 'No request', icon: 'baby' };
  if (r.kind === 'cuddle') return { label: 'Cuddle', icon: 'heart' };
  if (r.kind === 'walk') return { label: 'Walk', icon: 'paw' };
  return { label: `Feed ${r.food ? FOODS[r.food].name : 'food'}`, icon: r.food ? FOOD_ICON[FOODS[r.food].kind] : 'meat' };
}

function Nursery() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const young = me.creatures.filter((c) => c.maturity < 1).sort((a, b) => a.maturity - b.maturity);
  const cap = safe(() => nurseryCapacity(me), totals(me).nurserySlots);
  const babies = young.filter((c) => c.maturity < 0.1).length;
  if (!young.length) {
    return <Plaque><EmptyState icon="baby" title="The nursery is quiet">Hatchlings appear here when eggs hatch or litters are born. Each one asks for care once a week until it is grown.</EmptyState></Plaque>;
  }
  return (
    <div className="stack">
      <div className="row between wrap gap-2">
        <div>
          <div className="micro">Nursery · level {me.buildings.nursery ?? 0}</div>
          <div className="lg display">{babies} of {cap} baby beds</div>
        </div>
        {babies > cap && <Pill tone="bad" icon="warning">Overcrowded: 15% death risk a week</Pill>}
      </div>
      <Hint icon="baby">Answer each care request before you advance: every one adds imprint, and a missed request is gone for good. Babies and juveniles also eat one portion of their usual food a week from the pantry.</Hint>
      <div className="cols">
        {young.map((c) => {
          const sp = SPECIES[c.species];
          const req = c.imprintRequest;
          const { label, icon } = careLabel(c);
          const food = req?.kind === 'feed' ? req.food : undefined;
          const have = food ? me.pantry[food] ?? 0 : 0;
          const left = Math.ceil((1 - c.maturity) * sp.matureWeeks);
          const diet = dietFood(c);
          const step = imprintStep(c);
          return (
            <Panel key={c.id} label={`${sp.name} · ${lifePhase(c)}`} title={<span className="row gap-1">{c.name}<SexIcon sex={c.sex} size={14} /></span>}
              actions={<Btn size="sm" variant="ghost" icon="chevronRight" aria-label={`Open ${c.name}`} onClick={() => store.nav.push({ name: 'dino', id: c.id })} />}>
              <div className="row gap-3 top">
                <span className="dino-thumb" style={{ width: 120, height: 90 }}><DinoArt creature={c} width={112} height={84} animate={false} fill /></span>
                <div className="grow stack-sm">
                  <div>
                    <div className="row between xs"><span className="micro">Maturity</span><span className="num">{pct(c.maturity)} · adult in {left}w</span></div>
                    <Meter value={c.maturity} max={1} tone="verdigris" marks={[0.1, 0.5]} height={6} label="Maturity" />
                  </div>
                  <div>
                    <div className="row between xs"><span className="micro">Imprint</span><span className="num">{pct(c.genes.imprint)} <span className="muted">+{pct(step)}/req</span></span></div>
                    <Meter value={c.genes.imprint} max={1} tone="good" height={6} label="Imprint" />
                  </div>
                  <div className="xs muted">Eats {FOODS[diet].name} (pantry {me.pantry[diet] ?? 0}){(c.hungerWeeks ?? 0) > 0 ? <span className="bad"> · went hungry</span> : null}</div>
                </div>
              </div>
              <div className="care mt-2">
                {!req ? (
                  <span className="xs muted">No care request this week{c.bornWeek === g.world.week ? ' (newly hatched)' : ''}.</span>
                ) : req.done ? (
                  <span className="care-done"><Icon name="check" size={16} />{label}: done this week</span>
                ) : (
                  <>
                    <Btn id={`care-${c.id}`} variant="primary" icon={icon} disabled={!!food && have <= 0} onClick={() => store.act((s) => fulfillImprint(s, c.id), { ok: `${c.name} imprints on you a little more.` })}>
                      {label}{food ? ` (${have})` : ''}
                    </Btn>
                    {food && have <= 0 && (
                      <Btn size="sm" onClick={() => store.act((s) => buyFood(s, food, 1), { ok: `Bought ${FOODS[food].name}.` })}>Buy {FOODS[food].name} · {fmt(g.world.market.foodPrices[food] ?? FOODS[food].price)}</Btn>
                    )}
                  </>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pantry & Kitchen
// ---------------------------------------------------------------------------------------------

function Pantry() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const t = totals(me);
  const prefer = (tier: string) => (Object.keys(SPECIES) as SpeciesId[]).filter((s) => SPECIES[s].kind === 'dino' && SPECIES[s].kibble === tier).map((s) => SPECIES[s].name);
  return (
    <div className="stack">
      <Plaque label="Pantry" title="Provisions">
        <div className="food-grid">
          {FOOD_IDS.map((f: FoodId) => {
            const d = FOODS[f];
            const price = g.world.market.foodPrices[f] ?? d.price;
            return (
              <div key={f} className="food">
                <div className="food-head">
                  <span className="food-ic"><Icon name={FOOD_ICON[d.kind]} size={18} /></span>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="strong small ellipsis">{d.name}</span>
                    <span className="xs muted"><Money value={price} size="sm" /></span>
                  </div>
                  <span className="food-count num">{me.pantry[f] ?? 0}</span>
                </div>
                <div className="row gap-1">
                  <Btn id={`buy-${f}-1`} size="sm" block onClick={() => store.act((s) => buyFood(s, f, 1), { ok: `Bought 1 ${d.name}.` })}>Buy 1</Btn>
                  <Btn id={`buy-${f}-5`} size="sm" block onClick={() => store.act((s) => buyFood(s, f, 5), { ok: `Bought 5 ${d.name}.` })}>Buy 5</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </Plaque>
      <Panel label="Kitchen" title={t.kitchen ? 'Kibble recipes' : 'No kitchen yet'} actions={!t.kitchen ? <Btn size="sm" onClick={() => store.nav.area('estate')}>Build</Btn> : undefined}>
        <p className="small">One unfertilized egg + 1 Raw Meat or Mejoberries + 10 denarii makes a kibble. The egg&rsquo;s size sets the tier. Kibble answers Feed requests and tames wild captures better.</p>
        <div className="table-wrap mt-2">
          <table className="table">
            <thead><tr><th>Egg</th><th>Kibble · preferred by</th><th className="num">Market</th></tr></thead>
            <tbody>
              {(['small', 'medium', 'large', 'xlarge', 'mythic'] as const).map((sz) => {
                const tier = TIER_FOR_EGG[sz];
                const k = KIBBLE_FOR_TIER[tier];
                return (
                  <tr key={sz}>
                    <td>{EGG_SIZE_NAME[sz]}</td>
                    <td style={{ whiteSpace: 'normal' }}><b>{FOODS[k].name}</b><div className="xs muted">{prefer(tier).join(', ') || (sz === 'mythic' ? 'Mythic beasts' : '—')}</div></td>
                    <td className="num">{fmt(FOODS[k].price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Bloodlines
// ---------------------------------------------------------------------------------------------

interface LineRow { id: string; name: string; species: SpeciesId; sex: 'M' | 'F'; gen: number; wild: Stats; wl: number; mutM: number; mutP: number; imprint: number; alive: boolean; mine: boolean; status: string }
type LineSort = 'wl' | Stat | 'gen' | 'mut' | 'name';

function Bloodlines() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [species, setSpecies] = useState<SpeciesId | 'any'>('any');
  const [livingOnly, setLivingOnly] = useState(false);
  const [sort, setSort] = useState<LineSort>('wl');
  const rows = useMemo(() => {
    const out: LineRow[] = [];
    const seen = new Set<string>();
    for (const c of me.creatures) {
      if (c.kind !== 'dino' && SPECIES[c.species].repro === 'none') continue;
      seen.add(c.id);
      out.push({ id: c.id, name: c.name, species: c.species, sex: c.sex, gen: c.genes.generation, wild: c.genes.wild, wl: wildLevel(c), mutM: c.genes.mutMatri, mutP: c.genes.mutPatri, imprint: c.genes.imprint, alive: true, mine: true, status: c.maturity < 1 ? lifePhase(c) : 'In your ludus' });
    }
    for (const r of Object.values(g.ancestry)) {
      if (seen.has(r.id)) continue;
      const liveElsewhere = [...g.rivals, g.unknown].find((h) => h.creatures.some((c) => c.id === r.id));
      out.push({ id: r.id, name: r.name, species: r.species, sex: r.sex, gen: r.generation, wild: r.wild, wl: 1 + r.wild.str + r.wild.agi + r.wild.cun + r.wild.hp, mutM: r.mutMatri, mutP: r.mutPatri, imprint: r.imprint, alive: !!liveElsewhere, mine: false, status: liveElsewhere ? `With ${liveElsewhere.name}` : r.fate ?? 'Unknown' });
    }
    return out;
  }, [me.creatures, g.ancestry, g.rivals, g.unknown, store.v]);
  const list = rows.filter((r) => (species === 'any' || r.species === species) && (!livingOnly || r.alive));
  const key = (r: LineRow): number | string => (sort === 'wl' ? -r.wl : sort === 'gen' ? -r.gen : sort === 'mut' ? -(r.mutM + r.mutP) : sort === 'name' ? r.name : -r.wild[sort]);
  list.sort((a, b) => { const x = key(a); const y = key(b); return typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number); });
  const best: Record<Stat, number> = { str: 0, agi: 0, cun: 0, hp: 0 };
  if (species !== 'any') for (const r of list) for (const s of STATS) best[s] = Math.max(best[s], r.wild[s]);
  const th = (k: LineSort, label: string, num = true) => (
    <th className={num ? 'num' : undefined}><button type="button" className={`th-btn${sort === k ? ' on' : ''}`} onClick={() => setSort(k)} aria-pressed={sort === k}>{label}{sort === k && <Icon name="chevronDown" size={12} />}</button></th>
  );
  const speciesList = useMemo(() => rows.map((r) => ({ species: r.species }) as Creature), [rows]);
  return (
    <div className="stack">
      <div className="row gap-2 wrap">
        <SpeciesSelect id="bl-species" value={species} onChange={setSpecies} list={speciesList} />
        <Toggle id="bl-living" inline checked={livingOnly} onChange={setLivingOnly} label={<span className="small">Living only</span>} />
        <label className="row gap-1 small muted" htmlFor="bl-sort">
          <Icon name="sort" size={16} />
          <select id="bl-sort" className="select select-sm" value={sort} onChange={(e) => setSort(e.target.value as LineSort)}>
            <option value="wl">Wild level</option>
            {STATS.map((s) => <option key={s} value={s}>Wild {STAT_SHORT[s]}</option>)}
            <option value="gen">Generation</option>
            <option value="mut">Mutations</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <Panel flush label="Ancestry registry" title={`${list.length} records`}>
        <div className="table-wrap" style={{ maxHeight: '62vh' }}>
          <table className="table">
            <thead>
              <tr>
                {th('name', 'Name', false)}<th>Species</th>{th('gen', 'Gen')}{th('wl', 'Wild')}
                {STATS.map((s) => <React.Fragment key={s}>{th(s, STAT_SHORT[s])}</React.Fragment>)}
                {th('mut', 'Mut M/P')}<th className="num">Imprint</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={{ cursor: r.mine ? 'pointer' : undefined, opacity: r.alive ? 1 : 0.7 }} onClick={r.mine ? () => store.nav.push({ name: 'dino', id: r.id, tab: 'genetics' }) : undefined}>
                  <td><span className="row gap-1"><SexIcon sex={r.sex} size={12} /><b>{r.name}</b></span></td>
                  <td className="muted">{SPECIES[r.species].name}</td>
                  <td className="num">{r.gen}</td>
                  <td className="num strong">{r.wl}</td>
                  {STATS.map((s) => <td key={s} className={`num${species !== 'any' && r.wild[s] === best[s] && best[s] > 0 ? ' amber strong' : ''}`}>{r.wild[s]}</td>)}
                  <td className="num">{r.mutM}/{r.mutP}{r.mutM + r.mutP >= MUTATION_LIMIT ? <span className="bad"> !</span> : null}</td>
                  <td className="num">{r.imprint ? pct(r.imprint) : '—'}</td>
                  <td className="muted xs">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {species === 'any' && <Hint icon="tree">Pick a species to highlight the best wild value of each stat across its bloodline, the way ARK breeders track their lines.</Hint>}
    </div>
  );
}
