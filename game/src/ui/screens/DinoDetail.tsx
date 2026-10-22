// Dino detail [GladiatorDetailsActivityRevisited + fragments]: hero header, Stats, Genetics (ARK panel,
// pedigree, offspring), Techniques, Traits, Gear, Style; actions sheet (rename, favourite, bond, reward,
// surgery, sell, offer to rivals, release, use item, beast treat).
import React, { useState } from 'react';
import type { ClassId, Creature, GameState, GearSlot, Stat, TechId } from '../../engine/types';
import { STATS } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { TRAITS } from '../../engine/data/traits';
import { TECHNIQUES, LEARNABLE, techRequirement } from '../../engine/data/techniques';
import { CLASSES, CLASS_IDS } from '../../engine/data/classes';
import { GEAR, gearLine, gearName } from '../../engine/data/gear';
import { colorHex, colorName } from '../../engine/data/colors';
import {
  INC, ageLabel, ageMods, classProficiency, getStat, isLearnable, knownTech, lifePhase, meetsRequirement, rawStat, salePrice, stage,
  wildLevel, xpForLevel, xpMultiplier, eqAge,
} from '../../engine/creature';
import { MUTATION_LIMIT, offspringOf, pedigree, type PedigreeNode } from '../../engine/breeding';
import {
  assignGear, bond, learnTech, rename, retire, setClass, setTechOrder, spendPoint, surgery, toggleFavourite, toggleOfferToRivals, toggleTech, treat, useItem,
} from '../../engine/care';
import { rewardCreature } from '../../engine/loyalty';
import { sellCreature } from '../../engine/market';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Tabs } from '../components/Tabs';
import { Btn, EmptyState, Field, Hint, KV, Meter, Panel, Pill, Plaque, Rule, Toggle } from '../components/primitives';
import { Sheet } from '../components/Sheet';
import { Icon, SexIcon } from '../components/Icon';
import { CreatureRow } from '../components/CreatureRow';
import { GearPicker, GearName, SLOT_ICON, SLOT_LABEL, SLOT_ORDER, gearLineText } from '../components/GearPicker';
import { DinoArt } from '../art/DinoArt';
import { ColorSwatches } from '../art/ColorSwatches';
import { safe } from '../safe';
import { STAT_COLOR, STAT_LABEL, STAT_SHORT, fmt, pct, signed, camelToWords } from '../format';
import { findCreature } from '../../engine/util';

export function DinoScreen() {
  const store = useStore();
  const g = store.game!;
  const id = store.screen.id ?? '';
  const c = g.player.ludus.creatures.find((x) => x.id === id);
  const [actions, setActions] = useState(false);
  if (!c) {
    return (
      <>
        <ScreenHead title="Gone" />
        <Plaque><EmptyState icon="skull" title="This creature is no longer in your ludus">It may have been sold, released or buried.</EmptyState></Plaque>
      </>
    );
  }
  const tab = store.screen.tab ?? 'stats';
  const beast = c.kind === 'beast';
  const items = [
    { id: 'stats', label: 'Stats', icon: 'target' as const, badge: c.statPoints || undefined },
    { id: 'genetics', label: 'Genetics', icon: 'dna' as const },
    { id: 'techniques', label: 'Techniques', icon: 'claw' as const, badge: c.techPoints || undefined },
    { id: 'traits', label: 'Traits', icon: 'star' as const },
    ...(beast ? [] : [{ id: 'gear', label: 'Gear', icon: 'shield' as const }, { id: 'style', label: 'Style', icon: 'helmet' as const }]),
  ];
  return (
    <>
      <ScreenHead title={c.name} sub={SPECIES[c.species].name} actions={<Btn id="dino-actions" icon="menu" onClick={() => setActions(true)}>Actions</Btn>} />
      <div className="cols cols-wide-left">
        <div className="stack">
          <Hero c={c} g={g} />
        </div>
        <div className="stack">
          <Tabs id="dino" label="Creature sections" value={tab} onChange={(t) => store.nav.update({ tab: t })} items={items} />
          {tab === 'stats' && <StatsTab c={c} />}
          {tab === 'genetics' && <GeneticsTab c={c} />}
          {tab === 'techniques' && <TechTab c={c} />}
          {tab === 'traits' && <TraitsTab c={c} />}
          {tab === 'gear' && !beast && <GearTab c={c} />}
          {tab === 'style' && !beast && <StyleTab c={c} />}
        </div>
      </div>
      <ActionsSheet c={c} open={actions} onClose={() => setActions(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function Hero({ c, g }: { c: Creature; g: GameState }) {
  const sp = SPECIES[c.species];
  const lo = xpForLevel(c.level);
  const hi = xpForLevel(c.level + 1);
  const adult = c.maturity >= 1;
  return (
    <div className="hero">
      <div className="hero-art">
        <DinoArt creature={c} width={300} animate />
      </div>
      <div className="hero-info">
        <div className="row between top gap-2">
          <div className="grow">
            <div className="hero-name">{c.name}{c.nickname ? <span style={{ fontSize: 18 }}> &ldquo;{c.nickname}&rdquo;</span> : null}</div>
            <div className="hero-sub row gap-1 wrap">
              <SexIcon sex={c.sex} size={15} />
              <span>{sp.name}</span><span>·</span><span>{lifePhase(c)}</span><span>·</span><span>{ageLabel(c)}</span>
              {c.genes.bred && <><span>·</span><span>Gen {c.genes.generation}</span></>}
            </div>
          </div>
          <div className="right">
            <div className="hero-name num">{c.level}</div>
            <div className="micro" style={{ color: '#c9b89a' }}>Level</div>
          </div>
        </div>
        <div className="row gap-1 wrap mt-2">
          <Pill tone="amber" title="1 + all wild points">Wild Lv {wildLevel(c)}</Pill>
          <Pill tone="info">Fame {c.fame}</Pill>
          {c.genes.imprint > 0 && <Pill tone="good">Imprint {pct(c.genes.imprint)}</Pill>}
          {c.injury && <Pill tone="bad" icon="injury">{camelToWords(c.injury.type)} · {c.injury.weeks}w</Pill>}
          {c.ill > 0 && <Pill tone="bad">Ill {c.ill}w</Pill>}
          {c.away && <Pill tone="info" icon="hourglass">Away {c.away.weeksLeft}w</Pill>}
          {c.cls && <Pill tone="muted">{CLASSES[c.cls].name}</Pill>}
          {g.player.ludus.bondedId === c.id && <Pill tone="amber" icon="star">Bonded</Pill>}
        </div>
        <div className="hero-bars">
          <div>
            <div className="row between"><span className="micro">XP</span><span className="xs num" style={{ color: '#d8c6a6' }}>{fmt(c.xp - lo)} / {fmt(hi - lo)}</span></div>
            <Meter value={c.xp - lo} max={hi - lo} tone="amber" height={6} label="Experience" />
          </div>
          <div>
            <div className="row between"><span className="micro">Tameness</span><span className="xs num" style={{ color: '#d8c6a6' }}>{Math.round(c.loyalty)}</span></div>
            <Meter value={c.loyalty} max={100} tone={c.loyalty < 40 ? 'bad' : c.loyalty < 65 ? 'warn' : 'good'} height={6} label="Tameness" />
          </div>
          {!adult && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="row between"><span className="micro">Maturity · {lifePhase(c)}</span><span className="xs num" style={{ color: '#d8c6a6' }}>{pct(c.maturity)}</span></div>
              <Meter value={c.maturity} max={1} tone="verdigris" height={6} marks={[0.1, 0.5]} label="Maturity" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function statParts(c: Creature, s: Stat) {
  const sp = SPECIES[c.species];
  const base = sp.base[s];
  const wild = c.genes.wild[s] * INC[s];
  const imprinted = Math.round((base + wild) * (1 + 0.2 * c.genes.imprint));
  const imprint = imprinted - base - wild;
  const dom = c.dom[s] * INC[s];
  const raw = rawStat(c, s);
  const bonus = raw - imprinted - dom;
  return { base, wild, imprint, dom, bonus, raw };
}

function StatsTab({ c }: { c: Creature }) {
  const store = useStore();
  const mods = ageMods(c);
  const maxRaw = Math.max(...STATS.map((s) => rawStat(c, s) / (s === 'hp' ? 5 : 1)), 10);
  return (
    <div className="stack">
      {c.statPoints > 0 && <Hint icon="plus">{c.statPoints} unspent stat point{c.statPoints > 1 ? 's' : ''}. Each adds +1 (Health +5) as a domestic point; domestic points are never inherited.</Hint>}
      <Plaque label="Attributes" title="Raw and age-adjusted">
        {STATS.map((s) => {
          const p = statParts(c, s);
          const cur = getStat(c, s);
          const div = s === 'hp' ? 5 : 1;
          const segs = [
            { v: p.base, col: 'color-mix(in srgb, var(--muted) 70%, var(--wall))', label: 'base' },
            { v: p.wild, col: 'var(--verdigris)', label: 'wild' },
            { v: p.imprint, col: 'var(--good)', label: 'imprint' },
            { v: p.dom, col: 'var(--info)', label: 'domestic' },
            { v: Math.max(0, p.bonus), col: 'var(--amber)', label: 'bonus' },
          ];
          return (
            <div key={s} className="stat-row">
              <div>
                <div className="stat-big num" style={{ color: STAT_COLOR[s] }}>{cur}</div>
                <div className="stat-name">{STAT_SHORT[s]}</div>
              </div>
              <div className="col gap-1">
                <div className="row between xs">
                  <span className="strong">{STAT_LABEL[s]}</span>
                  <span className="muted num">raw {p.raw}{mods[s] !== 1 ? ` · age ×${mods[s]}` : ''}</span>
                </div>
                <div className="stack-bar" style={{ width: `${Math.min(100, (p.raw / div / maxRaw) * 100)}%` }} aria-hidden="true">
                  {segs.map((x) => x.v > 0 && <span key={x.label} style={{ width: `${(x.v / Math.max(1, p.raw)) * 100}%`, background: x.col }} title={`${x.label} ${x.v}`} />)}
                </div>
                <div className="xs muted num">
                  base {p.base} · wild {signed(p.wild)} · imprint {signed(p.imprint)} · dom {signed(p.dom)}{p.bonus ? ` · bonus ${signed(p.bonus)}` : ''}
                </div>
              </div>
              <div>
                {c.statPoints > 0 && c.kind === 'dino' && (
                  <Btn id={`spend-${s}`} size="sm" variant="primary" icon="plus" aria-label={`Spend a point on ${STAT_LABEL[s]}`} onClick={() => store.act((g) => spendPoint(g, c.id, s))} />
                )}
              </div>
            </div>
          );
        })}
        <div className="legend mt-2">
          <span><i style={{ background: 'color-mix(in srgb, var(--muted) 70%, var(--wall))' }} />Species base</span>
          <span><i style={{ background: 'var(--verdigris)' }} />Wild (inherited)</span>
          <span><i style={{ background: 'var(--good)' }} />Imprint</span>
          <span><i style={{ background: 'var(--info)' }} />Domestic</span>
          <span><i style={{ background: 'var(--amber)' }} />Traits & events</span>
        </div>
      </Plaque>
      <div className="grid-2">
        <Panel label="Career">
          <KV k="Battles">{c.career.battles}</KV>
          <KV k="Won / lost">{c.career.wins} / {c.career.losses}</KV>
          <KV k="Kills">{c.career.kills}</KV>
          <KV k="Tournaments won">{c.career.tournamentWins}</KV>
          <KV k="Biggest hit">{c.career.biggestHit}</KV>
        </Panel>
        <Panel label="Condition">
          <KV k="XP rate">{pct(safe(() => xpMultiplier(c), 1))}</KV>
          <KV k="Equivalent age">{Math.floor(eqAge(c))}</KV>
          <KV k="Offspring">{c.offspring}</KV>
          <KV k="Mating cooldown">{c.mateCooldown ? `${c.mateCooldown}w` : 'Ready'}</KV>
          <KV k="Worth (sale)">{fmt(safe(() => salePrice(c), 0))}</KV>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function speciesNorm(c: Creature): Record<Stat, number> {
  const w = SPECIES[c.species].weights;
  const tot = STATS.reduce((n, s) => n + w[s] + 1, 0);
  return { str: (10 * (w.str + 1)) / tot, agi: (10 * (w.agi + 1)) / tot, cun: (10 * (w.cun + 1)) / tot, hp: (10 * (w.hp + 1)) / tot };
}

function MutBox({ label, n, side }: { label: string; n: number; side: string }) {
  const capped = n >= MUTATION_LIMIT;
  return (
    <div className={`mut-box${capped ? ' capped' : ''}`}>
      <div className="micro">{label}</div>
      <div className="row base gap-1"><span className="big num">{n}</span><span className="muted small">/ {MUTATION_LIMIT}</span></div>
      <div className="mut-scale" aria-hidden="true"><span style={{ width: `${Math.min(100, (n / MUTATION_LIMIT) * 100)}%`, background: capped ? 'var(--bad)' : undefined }} /><i className="lim" /></div>
      <div className="xs muted mt-1">{side}</div>
    </div>
  );
}

function GeneticsTab({ c }: { c: Creature }) {
  const store = useStore();
  const g = store.game!;
  const norm = speciesNorm(c);
  const scale = Math.max(...STATS.map((s) => Math.max(c.genes.wild[s] + 2, norm[s] * 2.4)));
  const total = c.genes.mutMatri + c.genes.mutPatri;
  const tree = safe(() => pedigree(g, c.id, 3), undefined);
  const kids = safe(() => offspringOf(g, c.id), [] as Creature[]);
  const parent = (pid?: string, name?: string) => {
    if (!pid) return <span className="muted">{name ?? 'Wild-caught'}</span>;
    const live = g.player.ludus.creatures.find((x) => x.id === pid);
    if (live) return <button type="button" className="link-btn" onClick={() => store.nav.push({ name: 'dino', id: pid })}>{live.name}</button>;
    const other = findCreature(g, pid);
    if (other) return <span>{other.creature.name} <span className="xs muted">({other.house?.name ?? 'elsewhere'})</span></span>;
    const rec = g.ancestry[pid];
    return <span>{rec?.name ?? name ?? 'Unknown'} {rec?.fate && <span className="xs muted">· {rec.fate}</span>}</span>;
  };
  return (
    <div className="stack">
      <Plaque label="ARK genetics" title={`Wild level ${wildLevel(c)}`} actions={<Pill tone={c.genes.bred ? 'verdigris' : 'muted'}>{c.genes.bred ? `Bred · gen ${c.genes.generation}` : 'Wild-caught'}</Pill>}>
        {STATS.map((s) => {
          const w = c.genes.wild[s];
          const m = Math.min(w, c.genes.mutatedPoints[s] ?? 0);
          return (
            <div key={s} className="gene-row">
              <span className="micro" style={{ color: STAT_COLOR[s] }}>{STAT_SHORT[s]}</span>
              <div className="gene-track" title={`${w} wild points (${m} from mutations); species norm about ${norm[s].toFixed(1)}`}>
                <span className="gene-fill" style={{ width: `${((w - m) / scale) * 100}%` }} />
                {m > 0 && <span className="gene-mut" style={{ left: `${((w - m) / scale) * 100}%`, width: `${(m / scale) * 100}%` }} />}
                <span className="gene-norm" style={{ left: `${(norm[s] / scale) * 100}%` }} />
              </div>
              <span className="right num small"><b>{w}</b>{m > 0 && <span className="amber xs"> ({m}m)</span>}</span>
            </div>
          );
        })}
        <div className="legend mt-1">
          <span><i style={{ background: 'var(--verdigris)' }} />Wild points</span>
          <span><i style={{ background: 'var(--amber)' }} />Mutated points</span>
          <span><i style={{ background: 'var(--fg)', width: 3 }} />Species norm</span>
        </div>
        <Rule>Mutations</Rule>
        <div className="mut-counter">
          <MutBox label="Matrilineal" n={c.genes.mutMatri} side="From the mother's line" />
          <MutBox label="Patrilineal" n={c.genes.mutPatri} side="From the father's line" />
        </div>
        <p className="xs muted mt-2">
          {total >= MUTATION_LIMIT
            ? `At the limit: with ${total} mutations this creature can no longer pass new mutations on (rolls on its side fail).`
            : `${MUTATION_LIMIT - total} more before its side of a pairing stops mutating. Each offspring rolls 3 × 2.5%.`}
        </p>
        {c.genes.mutations.length > 0 && (
          <ul className="list-reset stack-sm mt-2">
            {c.genes.mutations.map((m, i) => (
              <li key={i} className="row gap-2 small">
                <Icon name="mutation" size={16} className="amber" />
                <span className="grow">{STAT_LABEL[m.stat]} +2 wild · {m.side === 'matri' ? 'matrilineal' : 'patrilineal'} · week {m.week}</span>
                {m.color !== undefined && <span className="row gap-1 xs muted"><span className="sw" style={{ width: 14, height: 14, borderRadius: 3, background: colorHex(m.color), display: 'inline-block' }} />{colorName(m.color)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Plaque>
      <Panel label="Lineage" title="Parents">
        <KV k="Mother">{parent(c.genes.motherId, c.genes.motherName)}</KV>
        <KV k="Father">{parent(c.genes.fatherId, c.genes.fatherName)}</KV>
        <KV k="Imprint">{c.genes.bred ? pct(c.genes.imprint) : '—'}</KV>
        {c.genes.tamingEffectiveness !== undefined && <KV k="Taming effectiveness">{pct(c.genes.tamingEffectiveness)}</KV>}
        {c.hatchedAt && <KV k="Hatched at">{c.hatchedAt}{c.bornWeek ? `, week ${c.bornWeek}` : ''}</KV>}
      </Panel>
      <Panel label="Colours" title="Regions">
        <ColorSwatches colors={c.genes.colors} highlight={c.genes.mutations.map(() => -1)} />
      </Panel>
      <Panel label="Pedigree" title="Three generations" flush>
        <div className="table-wrap" style={{ padding: '4px 14px 14px' }}>
          {tree ? <PedigreeTree node={tree} g={g} /> : <div className="empty small muted">No records.</div>}
        </div>
      </Panel>
      <Panel label="Offspring" title={kids.length ? `${kids.length} living` : 'None yet'} flush>
        {kids.length === 0 && <div className="empty small muted">No living offspring.</div>}
        {kids.map((k) => (
          <CreatureRow key={k.id} c={k} g={g} thumb={44} showTame={false}
            onClick={g.player.ludus.creatures.includes(k) ? () => store.nav.push({ name: 'dino', id: k.id }) : undefined}
            sub={`${SPECIES[k.species].name} · gen ${k.genes.generation}${g.player.ludus.creatures.includes(k) ? '' : ' · another house'}`} />
        ))}
      </Panel>
    </div>
  );
}

function PedNode({ n, g, self }: { n?: PedigreeNode; g: GameState; self?: boolean }) {
  const store = useStore();
  if (!n) return <div className="ped-node unknown"><div className="ped-name">Unknown</div><div className="ped-meta">wild stock</div></div>;
  const wl = 1 + n.wild.str + n.wild.agi + n.wild.cun + n.wild.hp;
  const mine = g.player.ludus.creatures.some((c) => c.id === n.id);
  const body = (
    <>
      <div className="ped-name"><SexIcon sex={n.sex} size={12} /><span className="ellipsis">{n.name}</span></div>
      <div className="ped-meta">G{n.generation} · Wild {wl} · M{n.mutMatri}/P{n.mutPatri}</div>
      {!n.alive && n.fate && <div className="ped-meta ellipsis" title={n.fate}>{n.fate}</div>}
    </>
  );
  const cls = `ped-node${self ? ' self' : ''}${!n.alive ? ' dead' : ''}`;
  if (mine && !self) return <button type="button" className={cls} onClick={() => store.nav.push({ name: 'dino', id: n.id })}>{body}</button>;
  return <div className={cls} title={n.fate}>{body}</div>;
}

function PedigreeTree({ node, g }: { node: PedigreeNode; g: GameState }) {
  const gen1 = [node.mother, node.father];
  const gen2 = gen1.flatMap((p) => [p?.mother, p?.father]);
  const gen3 = gen2.flatMap((p) => [p?.mother, p?.father]);
  return (
    <div className="pedigree" role="tree" aria-label="Pedigree">
      <div className="ped-col"><PedNode n={node} g={g} self /></div>
      <div className="ped-col">{gen1.map((n, i) => <PedNode key={i} n={n} g={g} />)}</div>
      <div className="ped-col">{gen2.map((n, i) => <PedNode key={i} n={n} g={g} />)}</div>
      <div className="ped-col">{gen3.map((n, i) => <PedNode key={i} n={n} g={g} />)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function TechTab({ c }: { c: Creature }) {
  const store = useStore();
  const g = store.game!;
  const order: TechId[] = c.techOrder?.length ? c.techOrder.filter((t) => knownTech(c, t)) : c.techniques.map((t) => t.id);
  const known = [...c.techniques].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const pool = [...new Set([...SPECIES[c.species].natural, ...(c.kind === 'beast' ? (['Bite', 'Pounce', 'Charge', 'Maul', 'Swipe'] as TechId[]) : LEARNABLE), ...c.learnable])]
    .filter((t) => !knownTech(c, t) && safe(() => isLearnable(c, t), false));
  const move = (id: TechId, dir: -1 | 1) => {
    const o = [...order];
    const i = o.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    store.act((s) => { setTechOrder(s, c.id, o); return true; });
  };
  const reqText = (id: TechId, rank: number) => `${STAT_SHORT[TECHNIQUES[id].stat]} ${techRequirement(id, rank)}`;
  return (
    <div className="stack">
      <Hint icon="claw">{c.techPoints} technique point{c.techPoints === 1 ? '' : 's'} to spend. A dino gains one every third level. Requirements use raw attributes.</Hint>
      <Plaque label="Known" title="Loadout and priority" flush>
        {known.length === 0 && <div className="empty small muted">No techniques yet.</div>}
        {known.map((t, i) => {
          const d = TECHNIQUES[t.id];
          const maxed = t.rank >= d.maxRank;
          const canRank = !maxed && meetsRequirement(c, t.id, t.rank + 1);
          return (
            <div key={t.id} className="tech">
              <div>
                <div className="tech-name">
                  <span>{d.name}</span>
                  <span className="rank-dots" aria-label={`Rank ${t.rank}`}>{Array.from({ length: Math.min(10, d.maxRank) }, (_, k) => <i key={k} className={k < t.rank ? 'on' : ''} />)}</span>
                  {d.rare && <Pill tone="amber">Rare</Pill>}
                </div>
                <div className="tech-desc">{d.desc}</div>
                <div className="xs muted num mt-1">Rank {t.rank}{maxed ? ' (max)' : ` · next needs ${reqText(t.id, t.rank + 1)}`} · cooldown {d.cooldown}</div>
              </div>
              <div className="col gap-1" style={{ alignItems: 'flex-end' }}>
                <Toggle id={`eq-${t.id}`} checked={t.equipped} onChange={() => store.act((s) => toggleTech(s, c.id, t.id))} label={<span className="xs">Equipped</span>} />
                <div className="row gap-1">
                  <Btn size="sm" variant="ghost" icon="chevronUp" aria-label="Higher priority" disabled={i === 0} onClick={() => move(t.id, -1)} />
                  <Btn size="sm" variant="ghost" icon="chevronDown" aria-label="Lower priority" disabled={i === known.length - 1} onClick={() => move(t.id, 1)} />
                  {!maxed && <Btn size="sm" disabled={c.techPoints <= 0 || !canRank} title={!canRank ? `Needs ${reqText(t.id, t.rank + 1)}` : undefined} onClick={() => store.act((s) => learnTech(s, c.id, t.id))}>Rank up</Btn>}
                </div>
              </div>
            </div>
          );
        })}
      </Plaque>
      <Panel label="Learnable" title="New techniques" flush>
        {pool.length === 0 && <div className="empty small muted">Nothing new to learn right now.</div>}
        {pool.map((t) => {
          const d = TECHNIQUES[t];
          const locked = !!d.upgrade && !g.unlocks.includes(d.upgrade) && !g.world.difficulty.sandbox;
          const ok = meetsRequirement(c, t, 1);
          return (
            <div key={t} className={`tech${locked ? ' locked' : ''}`}>
              <div>
                <div className="tech-name">{locked && <Icon name="lock" size={14} />}<span>{d.name}</span>{d.rare && <Pill tone="amber">Rare</Pill>}</div>
                <div className="tech-desc">{d.desc}</div>
                <div className={`xs num mt-1 ${ok ? 'muted' : 'bad'}`}>Needs {reqText(t, 1)} (has {rawStat(c, d.stat)}){locked ? ' · needs an upgrade' : ''}</div>
              </div>
              <Btn size="sm" variant={ok && c.techPoints > 0 && !locked ? 'primary' : 'default'} disabled={!ok || c.techPoints <= 0 || locked} onClick={() => store.act((s) => learnTech(s, c.id, t), { ok: `${c.name} learned ${d.name}.` })}>Learn</Btn>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

function TraitsTab({ c }: { c: Creature }) {
  if (!c.traits.length) return <Plaque><EmptyState icon="star" title="No traits yet">Traits come from birth, training, battles and events.</EmptyState></Plaque>;
  return (
    <Plaque label="Traits" title={`${c.traits.length} trait${c.traits.length > 1 ? 's' : ''}`} flush>
      {c.traits.map((t) => {
        const d = TRAITS[t];
        const tone = d?.polarity === '+' ? 'good' : d?.polarity === '-' ? 'bad' : 'warn';
        const fx = d ? Object.entries(d.stats).filter(([, v]) => v).map(([k, v]) => `${STAT_SHORT[k as Stat]} ${signed(v as number)}`) : [];
        return (
          <div key={t} className="tech">
            <div>
              <div className="tech-name">
                <span className={tone}>{d?.polarity ?? '±'}</span>
                <span>{d?.name ?? camelToWords(t)}</span>
                {d?.heritable && <Pill tone="verdigris" icon="dna">Heritable</Pill>}
                {d?.wound && <Pill tone="bad">Wound</Pill>}
              </div>
              <div className="tech-desc">{d?.desc}</div>
              {(fx.length > 0 || d?.loyalty || d?.injury) && (
                <div className="xs muted num mt-1">
                  {fx.join(' · ')}{d?.loyalty ? `${fx.length ? ' · ' : ''}tameness ${signed(d.loyalty)}/wk` : ''}{d?.injury ? ` · injury-prone ${signed(d.injury)}` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </Plaque>
  );
}

function GearTab({ c }: { c: Creature }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [slot, setSlot] = useState<GearSlot | null>(null);
  const of = (s: GearSlot) => (c.gear[s] ? me.armory.find((x) => x.id === c.gear[s]) ?? null : null);
  const tot = { dmg: 0, blk: 0, dr: 0, str: 0, agi: 0, cun: 0, hp: 0, reach: 0 };
  for (const s of SLOT_ORDER) {
    const x = of(s);
    if (!x) continue;
    const l = gearLine(x);
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += l[k];
  }
  return (
    <div className="stack">
      <div className="slot-grid">
        {SLOT_ORDER.map((s) => {
          const x = of(s);
          return (
            <button key={s} type="button" id={`slot-${s}`} className={`gear-slot${x ? ' filled' : ''}`} onClick={() => setSlot(s)}>
              <span className="row gap-1 micro"><Icon name={SLOT_ICON[s]} size={14} />{SLOT_LABEL[s]}</span>
              {x ? <><GearName g={x} /><span className="gear-line">{gearLineText(x)}</span></> : <span className="muted small">Empty</span>}
            </button>
          );
        })}
      </div>
      <Panel label="Harness" title="Totals">
        <div className="stat-mini">
          {(Object.keys(tot) as (keyof typeof tot)[]).map((k) => <span key={k}>{k.toUpperCase()} <b>{signed(tot[k])}</b></span>)}
        </div>
        <Hint>Gear left unassigned is chosen automatically before each battle: the style&rsquo;s weapon first, then the dino&rsquo;s best proficiency.</Hint>
      </Panel>
      <Sheet open={!!slot} onClose={() => setSlot(null)} title={slot ? `${SLOT_LABEL[slot]} for ${c.name}` : ''} wide>
        {slot && (
          <GearPicker id="pick" h={me} slot={slot} current={of(slot)} onPick={(gid) => {
            const r = store.act((s) => assignGear(s, c.id, slot, gid));
            if (r === null) setSlot(null);
          }} />
        )}
      </Sheet>
    </div>
  );
}

function StyleTab({ c }: { c: Creature }) {
  const store = useStore();
  const sp = SPECIES[c.species];
  const cur = c.cls;
  return (
    <div className="stack">
      <Hint icon="warning">A dino earns XP in proportion to its style proficiency: a fresh dino in a style it has no techniques or traits for earns only about 20% XP. Favoured styles add +5, disliked ones −5.</Hint>
      <Panel flush label="Fighting style" title={cur ? CLASSES[cur].name : 'No style'}>
        {CLASS_IDS.map((id: ClassId) => {
          const d = CLASSES[id];
          const p = safe(() => classProficiency(c, id), 0);
          const locked = !!d.upgrade && !store.game!.unlocks.includes(d.upgrade) && !store.game!.world.difficulty.sandbox;
          return (
            <div key={id} className={`tech${locked ? ' locked' : ''}`}>
              <div>
                <div className="tech-name">
                  {locked && <Icon name="lock" size={14} />}
                  <span>{d.name}</span>
                  {sp.favClass === id && <Pill tone="good">Favoured</Pill>}
                  {sp.disClass === id && <Pill tone="bad">Disliked</Pill>}
                  {cur === id && <Pill tone="amber">Current</Pill>}
                </div>
                <div className="tech-desc">{d.desc}</div>
                <div className="xs muted mt-1">{GEAR[d.mainWeapon].name}{d.offhand ? ` + ${GEAR[d.offhand].name}` : ''} · main stat {STAT_SHORT[d.mainStat]}</div>
                <div className="row gap-2 mt-1" style={{ maxWidth: 280 }}>
                  <Meter value={p} max={100} tone={p < 35 ? 'bad' : p < 60 ? 'warn' : 'good'} height={5} label="Proficiency" />
                  <span className="xs num strong">{p}%</span>
                </div>
              </div>
              <Btn size="sm" disabled={cur === id || locked} onClick={() => store.act((s) => setClass(s, c.id, id), { ok: `${c.name} now fights as a ${d.name}.` })}>Choose</Btn>
            </div>
          );
        })}
        {cur && <div style={{ padding: '10px 14px' }}><Btn size="sm" variant="ghost" onClick={() => store.act((s) => setClass(s, c.id, null))}>Clear style</Btn></div>}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const ITEM_ON_ASSIGN = new Set(['silphium', 'bestiaryScroll', 'bottledLightning', 'amberShard', 'mutagen']);

function ActionsSheet({ c, open, onClose }: { c: Creature; open: boolean; onClose: () => void }) {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [name, setName] = useState(c.name);
  const [nick, setNick] = useState(c.nickname ?? '');
  const [choices, setChoices] = useState<{ gearId: string; list: string[] } | null>(null);
  const price = safe(() => salePrice(c), 0);
  const items = me.armory.filter((x) => ITEM_ON_ASSIGN.has(x.type));
  const sell = async () => {
    const ok = await store.confirm({ title: `Sell ${c.name}?`, text: <>The market pays <b>{fmt(price)}</b> denarii. {c.genes.bred ? 'Its pedigree stays in your bloodline records.' : ''}</>, confirmLabel: `Sell for ${fmt(price)}`, danger: true });
    if (ok && store.act((s) => sellCreature(s, c.id), { ok: `${c.name} was sold.` }) === null) { onClose(); store.nav.pop(); }
  };
  const release = async () => {
    const ok = await store.confirm({ title: `Release ${c.name}?`, text: 'It is turned loose into the hills for good. A handler stays on as a keeper.', confirmLabel: 'Release', danger: true });
    if (ok && store.act((s) => retire(s, c.id), { ok: `${c.name} runs for the hills.` }) === null) { onClose(); store.nav.pop(); }
  };
  const use = (gearId: string, choice?: string) => {
    const r = store.act((s) => useItem(s, c.id, gearId, choice as never), { ok: (x) => (x.ok && !x.choices ? x.text : undefined) });
    if (r?.choices?.length) setChoices({ gearId, list: r.choices });
    else if (r?.ok) setChoices(null);
  };
  return (
    <Sheet open={open} onClose={onClose} title={c.name} label="Actions">
      <div className="stack">
        <div className="grid-2">
          <Field id="act-name" label="Name"><input id="act-name" className="input" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id="act-nick" label="Nickname"><input id="act-nick" className="input" maxLength={18} value={nick} onChange={(e) => setNick(e.target.value)} /></Field>
        </div>
        <div className="row gap-2 wrap">
          <Btn id="act-rename" disabled={!name.trim() || name === c.name} onClick={() => store.act((s) => rename(s, c.id, name.trim()), { ok: 'Renamed.' })}>Rename</Btn>
          <Btn id="act-nickname" disabled={nick === (c.nickname ?? '')} onClick={() => store.act((s) => { const x = s.player.ludus.creatures.find((y) => y.id === c.id); if (x) x.nickname = nick.trim() || undefined; return true; }, { ok: 'Nickname set.' })}>Set nickname</Btn>
          <Btn id="act-fav" icon="star" variant={c.favourite ? 'primary' : 'default'} onClick={() => store.act((s) => { toggleFavourite(s, c.id); return true; })}>{c.favourite ? 'Favourite' : 'Mark favourite'}</Btn>
        </div>
        <Rule>Care</Rule>
        <div className="row gap-2 wrap">
          <Btn id="act-bond" icon="heart" disabled={me.bondedId === c.id} onClick={() => store.act((s) => bond(s, c.id), { ok: `${c.name} is now bonded to you.` })}>Bond</Btn>
          <Btn id="act-reward" icon="coin" onClick={() => store.act((s) => rewardCreature(s, s.player.ludus, s.player.ludus.creatures.find((x) => x.id === c.id)!), { ok: `${c.name} is delighted.` })}>Reward</Btn>
          <Btn id="act-surgery" icon="injury" onClick={() => store.act((s) => surgery(s, c.id), { ok: (r) => r.text })}>Surgery</Btn>
          {c.kind === 'beast' && <Btn id="act-treat" icon="meat" disabled={c.treatedThisWeek} onClick={() => store.act((s) => treat(s, c.id), { ok: 'Good beast.' })}>Treat</Btn>}
        </div>
        {items.length > 0 && (
          <>
            <Rule>Use an item</Rule>
            <div className="row gap-2 wrap">
              {items.map((x) => <Btn key={x.id} size="sm" icon="item" onClick={() => use(x.id)}>{gearName(x)}</Btn>)}
            </div>
            {choices && (
              <div className="choices">
                {choices.list.map((ch) => <button key={ch} type="button" className="choice-btn" onClick={() => use(choices.gearId, ch)}>{TRAITS[ch as keyof typeof TRAITS]?.name ?? TECHNIQUES[ch as TechId]?.name ?? ch}</button>)}
              </div>
            )}
          </>
        )}
        <Rule>Trade</Rule>
        <Toggle id="act-offer" checked={!!c.offerToRivals} onChange={() => store.act((s) => { toggleOfferToRivals(s, c.id); return true; })} label="Offer to rivals" desc="Rival houses may send bids for this creature." />
        <div className="row gap-2 wrap">
          <Btn id="act-sell" variant="danger" icon="coin" onClick={sell}>Sell for {fmt(price)}</Btn>
          <Btn id="act-release" variant="ghost" onClick={release}>Release to the wild</Btn>
        </div>
        {stage(c) !== 'adult' && <p className="xs muted">Young creatures fetch less: buyers pay for the adult they might become.</p>}
      </div>
    </Sheet>
  );
}
