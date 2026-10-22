// Tabs: a horizontally scrollable tablist; the active tab lives in the screen stack (nav.update).
import React, { useEffect, useRef } from 'react';
import { Icon, type IconName } from './Icon';

export interface TabItem { id: string; label: string; icon?: IconName; badge?: number | string; disabled?: boolean }

export function Tabs({ id, items, value, onChange, label }: { id: string; items: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const enabled = items.filter((i) => !i.disabled);
    const i = enabled.findIndex((t) => t.id === value);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : enabled.length - 1)) % enabled.length];
    if (next) {
      onChange(next.id);
      window.requestAnimationFrame(() => document.getElementById(`${id}-tab-${next.id}`)?.focus());
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {items.map((t) => (
        <button
          key={t.id}
          id={`${id}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          disabled={t.disabled}
          className={`tab${t.id === value ? ' on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <Icon name={t.icon} size={16} />}
          <span>{t.label}</span>
          {t.badge !== undefined && t.badge !== 0 && <span className="tab-badge num">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
