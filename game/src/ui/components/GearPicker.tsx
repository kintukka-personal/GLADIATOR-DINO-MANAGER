// Gear helpers + GearPicker (choose a piece from the armory for one slot, with stat deltas).
import React from 'react';
import type { Gear, GearSlot, Ludus } from '../../engine/types';
import { GEAR, gearLine, gearName, gearWorth } from '../../engine/data/gear';
import { Icon, type IconName } from './Icon';
import { Money, Pill } from './primitives';

export const SLOT_ORDER: GearSlot[] = ['weapon', 'offhand', 'armor', 'helmet', 'rider', 'item'];
export const SLOT_LABEL: Record<GearSlot, string> = { weapon: 'Weapon', offhand: 'Off-hand', armor: 'Barding', helmet: 'Helmet', rider: 'Rider', item: 'Item' };
export const SLOT_ICON: Record<GearSlot, IconName> = { weapon: 'claw', offhand: 'shield', armor: 'armor', helmet: 'helmet', rider: 'rider', item: 'item' };

type LineKey = 'dmg' | 'blk' | 'dr' | 'str' | 'agi' | 'cun' | 'hp' | 'reach';
const LINE_LABEL: Record<LineKey, string> = { dmg: 'DMG', blk: 'BLK', dr: 'DR', str: 'STR', agi: 'AGI', cun: 'CUN', hp: 'HP', reach: 'Reach' };
const LINE_KEYS: LineKey[] = ['dmg', 'blk', 'dr', 'reach', 'str', 'agi', 'cun', 'hp'];

export function gearLineText(g: Gear): string {
  const l = gearLine(g);
  const parts = LINE_KEYS.filter((k) => l[k]).map((k) => `${LINE_LABEL[k]} ${l[k] > 0 && k !== 'dmg' && k !== 'blk' && k !== 'reach' ? '+' : ''}${l[k]}`);
  if (l.charges) parts.push(`${l.charges} use${l.charges > 1 ? 's' : ''}`);
  return parts.join(' · ') || GEAR[g.type].desc;
}

export function gearDelta(next: Gear | null, cur: Gear | null): { k: string; d: number }[] {
  const a = next ? gearLine(next) : null;
  const b = cur ? gearLine(cur) : null;
  return LINE_KEYS.map((k) => ({ k: LINE_LABEL[k], d: (a?.[k] ?? 0) - (b?.[k] ?? 0) })).filter((x) => x.d !== 0);
}

export function wearerName(h: Ludus, gearId: string): string | undefined {
  const c = h.creatures.find((x) => Object.values(x.gear).includes(gearId));
  return c?.name;
}

export function GearName({ g }: { g: Gear }) {
  return <span className={`gear-name q-${g.quality}`}>{gearName(g)}</span>;
}

export function GearPicker({ id, h, slot, current, onPick, filter }: { id: string; h: Ludus; slot: GearSlot; current: Gear | null; onPick: (gearId: string | null) => void; filter?: (g: Gear) => string | null }) {
  const list = h.armory.filter((g) => GEAR[g.type]?.slot === slot);
  return (
    <div className="stack-sm">
      {current && (
        <button type="button" id={`${id}-none`} className="choice-btn" onClick={() => onPick(null)}>
          <span className="row gap-2"><Icon name="close" size={16} /> Remove {gearName(current)}</span>
          <span className="cb-desc">Leave the {SLOT_LABEL[slot].toLowerCase()} slot empty.</span>
        </button>
      )}
      {list.length === 0 && <div className="empty small muted">No {SLOT_LABEL[slot].toLowerCase()} gear in the armory. Buy some at the market or forge it.</div>}
      {list.map((g) => {
        const who = wearerName(h, g.id);
        const reason = filter?.(g) ?? null;
        const delta = gearDelta(g, current);
        const isCur = current?.id === g.id;
        return (
          <button key={g.id} type="button" id={`${id}-${g.id}`} className="choice-btn" disabled={!!reason || isCur} onClick={() => onPick(g.id)}>
            <span className="row gap-2 between" style={{ width: '100%' }}>
              <GearName g={g} />
              <Money value={gearWorth(g)} size="sm" />
            </span>
            <span className="cb-desc num">{gearLineText(g)}</span>
            <span className="row gap-1 wrap">
              {isCur && <Pill tone="amber">Equipped</Pill>}
              {who && !isCur && <Pill tone="muted">Worn by {who}</Pill>}
              {delta.map((x) => <Pill key={x.k} tone={x.d > 0 ? 'good' : 'bad'}>{x.k} {x.d > 0 ? '+' : '−'}{Math.abs(x.d)}</Pill>)}
              {reason && <span className="cb-reason"><Icon name="lock" size={12} />{reason}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
