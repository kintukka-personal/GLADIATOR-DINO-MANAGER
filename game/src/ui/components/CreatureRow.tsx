// CreatureRow: roster line (thumbnail, name, species, sex, level, wild level, stage, tameness, chips).
// CreaturePicker: multi-select list with filters and eligibility reasons.
import React, { useMemo, useState } from 'react';
import type { Creature, GameState, SpeciesId } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { ageLabel, lifePhase, wildLevel, stage } from '../../engine/creature';
import { isPaired, matingThisWeek } from '../../engine/breeding';
import { DinoThumb } from '../art/DinoArt';
import { Icon, SexIcon } from './Icon';
import { Meter, Pill } from './primitives';
import { safe } from '../safe';

export function statusChips(g: GameState | null, c: Creature, opts: { compact?: boolean } = {}): React.ReactNode[] {
  const h = g?.player.ludus;
  const chips: React.ReactNode[] = [];
  const st = stage(c);
  if (st !== 'adult') chips.push(<Pill key="st" tone="info">{lifePhase(c)}</Pill>);
  if (c.away) chips.push(<Pill key="away" tone="info" icon="hourglass">Away {c.away.weeksLeft}w</Pill>);
  if (c.injury) chips.push(<Pill key="inj" tone="bad" icon="injury">Injured {c.injury.weeks}w</Pill>);
  if (c.ill > 0) chips.push(<Pill key="ill" tone="warn">Ill {c.ill}w</Pill>);
  if (c.pregnancy) chips.push(<Pill key="preg" tone="fresco" icon="heart">Pregnant {c.pregnancy.weeksLeft}w</Pill>);
  else if (h && safe(() => matingThisWeek(h, c), false)) chips.push(<Pill key="mate" tone="fresco" icon="heart">Mating</Pill>);
  else if (h && safe(() => isPaired(h, c), false)) chips.push(<Pill key="pair" tone="muted" icon="heart">Paired</Pill>);
  if (c.imprintRequest && !c.imprintRequest.done) chips.push(<Pill key="care" tone="amber" icon="baby">Care</Pill>);
  if (c.statPoints > 0 && c.kind === 'dino') chips.push(<Pill key="pts" tone="amber" icon="plus">{c.statPoints} pt{c.statPoints > 1 ? 's' : ''}</Pill>);
  if (h?.doctoreId === c.id) chips.push(<Pill key="doc" tone="verdigris">Doctore</Pill>);
  if (h?.bondedId === c.id) chips.push(<Pill key="bond" tone="amber" icon="star">Bonded</Pill>);
  if (!opts.compact && c.genes.mutations.length) chips.push(<Pill key="mut" tone="amber" icon="mutation">{c.genes.mutations.length} mut</Pill>);
  return chips;
}

export interface CreatureRowProps {
  c: Creature;
  g: GameState | null;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  reason?: string | null;
  right?: React.ReactNode;
  sub?: React.ReactNode;
  showTame?: boolean;
  id?: string;
  /** thumbnail size */
  thumb?: number;
  chips?: boolean;
}

export function CreatureRow({ c, g, onClick, selected, disabled, reason, right, sub, showTame = true, id, thumb = 56, chips = true }: CreatureRowProps) {
  const sp = SPECIES[c.species];
  const content = (
    <>
      <DinoThumb creature={c} size={thumb} dead={false} />
      <div className="crow-main">
        <div className="crow-name">
          <span className="nm">{c.nickname ? `${c.name} "${c.nickname}"` : c.name}</span>
          <SexIcon sex={c.sex} size={15} />
          {c.favourite && <Icon name="star" size={14} className="amber" title="Favourite" />}
        </div>
        <div className="crow-sub">{sub ?? `${sp.name} · ${lifePhase(c)} · ${ageLabel(c)}`}</div>
        {reason ? (
          <div className="crow-chips"><Pill tone="bad" icon="lock">{reason}</Pill></div>
        ) : chips ? (
          <div className="crow-chips">{statusChips(g, c)}</div>
        ) : null}
      </div>
      <div className="crow-right">
        {right ?? (
          <>
            <span className="crow-lv"><small>LV</small>{c.level}</span>
            <span className="xs muted num" title="ARK wild level: 1 + all wild points">Wild {wildLevel(c)}</span>
            {showTame && (
              <span className="tame" title={`Tameness ${Math.round(c.loyalty)}`}>
                <Meter value={c.loyalty} max={100} tone={c.loyalty < 40 ? 'bad' : c.loyalty < 65 ? 'warn' : 'good'} height={4} label="Tameness" />
              </span>
            )}
          </>
        )}
      </div>
    </>
  );
  const cls = `crow${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`;
  if (!onClick) return <div className={cls} id={id}>{content}</div>;
  return (
    <button type="button" id={id} className={cls} onClick={onClick} disabled={disabled} aria-pressed={selected}>
      {content}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------

export type KindFilter = 'all' | 'dinos' | 'beasts' | 'young';

export function filterCreatures(list: Creature[], kind: KindFilter, species: SpeciesId | 'any', q = ''): Creature[] {
  const qq = q.trim().toLowerCase();
  return list.filter((c) => {
    if (kind === 'dinos' && (c.kind !== 'dino' || c.maturity < 1)) return false;
    if (kind === 'beasts' && c.kind !== 'beast') return false;
    if (kind === 'young' && c.maturity >= 1) return false;
    if (species !== 'any' && c.species !== species) return false;
    if (qq && !`${c.name} ${c.nickname ?? ''} ${SPECIES[c.species].name}`.toLowerCase().includes(qq)) return false;
    return true;
  });
}

export function KindChips({ id, value, onChange, counts }: { id: string; value: KindFilter; onChange: (k: KindFilter) => void; counts?: Partial<Record<KindFilter, number>> }) {
  const opts: [KindFilter, string][] = [['all', 'All'], ['dinos', 'Dinos'], ['beasts', 'Beasts'], ['young', 'Hatchlings']];
  return (
    <div className="seg seg-sm" role="radiogroup" aria-label="Filter" id={id}>
      {opts.map(([k, l]) => (
        <button key={k} id={`${id}-${k}`} type="button" role="radio" aria-checked={value === k} className={`seg-item${value === k ? ' on' : ''}`} onClick={() => onChange(k)}>
          {l}{counts?.[k] !== undefined ? <span className="muted num"> {counts[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SpeciesSelect({ id, value, onChange, list }: { id: string; value: SpeciesId | 'any'; onChange: (s: SpeciesId | 'any') => void; list: Creature[] }) {
  const present = useMemo(() => [...new Set(list.map((c) => c.species))].sort((a, b) => SPECIES[a].name.localeCompare(SPECIES[b].name)), [list]);
  return (
    <select id={id} className="select select-sm" value={value} onChange={(e) => onChange(e.target.value as SpeciesId | 'any')} aria-label="Species">
      <option value="any">All species</option>
      {present.map((s) => <option key={s} value={s}>{SPECIES[s].name}</option>)}
    </select>
  );
}

export interface CreaturePickerProps {
  id: string;
  g: GameState;
  creatures: Creature[];
  /** null = eligible, string = reason it cannot be picked */
  eligible?: (c: Creature) => string | null;
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  /** show ineligible creatures greyed out (default true) */
  showIneligible?: boolean;
  right?: (c: Creature) => React.ReactNode;
  initialKind?: KindFilter;
}

/** Multi-select creature list with filters and eligibility reasons. */
export function CreaturePicker({ id, g, creatures, eligible, selected, onChange, max = 99, showIneligible = true, right, initialKind = 'all' }: CreaturePickerProps) {
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [species, setSpecies] = useState<SpeciesId | 'any'>('any');
  const shown = filterCreatures(creatures, kind, species);
  const rows = shown
    .map((c) => ({ c, reason: eligible ? eligible(c) : null }))
    .filter((r) => showIneligible || !r.reason)
    .sort((a, b) => Number(!!a.reason) - Number(!!b.reason));
  const toggle = (cid: string) => {
    if (selected.includes(cid)) onChange(selected.filter((x) => x !== cid));
    else if (max === 1) onChange([cid]);
    else if (selected.length < max) onChange([...selected, cid]);
  };
  return (
    <div className="stack-sm">
      <div className="row gap-2 wrap">
        <KindChips id={`${id}-kind`} value={kind} onChange={setKind} />
        <SpeciesSelect id={`${id}-species`} value={species} onChange={setSpecies} list={creatures} />
        {max < 99 && <span className="xs muted num" aria-live="polite">{selected.length}/{max} chosen</span>}
      </div>
      <div className="panel flush">
        <div className="panel-body" style={{ padding: 0 }}>
          {rows.length === 0 && <div className="empty small muted">Nothing matches these filters.</div>}
          {rows.map(({ c, reason }) => (
            <CreatureRow
              key={c.id}
              id={`${id}-c-${c.id}`}
              c={c}
              g={g}
              onClick={reason ? undefined : () => toggle(c.id)}
              selected={selected.includes(c.id)}
              disabled={!!reason}
              reason={reason}
              showTame={false}
              thumb={48}
              right={right ? right(c) : selected.includes(c.id) ? <Icon name="check" size={22} className="amber" /> : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
