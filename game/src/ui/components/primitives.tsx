// Small building blocks: Panel, Plaque, Btn, Pill, Money, Influence, StatBar, Meter, EmptyState,
// Hint, Stepper, Toggle, Field, SectionTitle, KV. Documented in src/ui/UI_GUIDE.md.

import React from 'react';
import { Icon, type IconName } from './Icon';
import { fmt, signed } from '../format';
import { useStore } from '../store';

// ---------------------------------------------------------------------------------------------
// Panel / Plaque
// ---------------------------------------------------------------------------------------------

export interface PanelProps {
  title?: React.ReactNode;
  /** uppercase micro label above the title */
  label?: React.ReactNode;
  /** right side of the header */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** flush = no inner padding (lists) */
  flush?: boolean;
  id?: string;
  style?: React.CSSProperties;
}

/** Quiet information panel. */
export function Panel({ title, label, actions, children, className, flush, id, style }: PanelProps) {
  return (
    <section className={`panel${flush ? ' flush' : ''}${className ? ` ${className}` : ''}`} id={id} style={style}>
      {(title || label || actions) && (
        <header className="panel-head">
          <div className="panel-titles">
            {label && <div className="micro">{label}</div>}
            {title && <h3 className="panel-title">{title}</h3>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Key panel: bronze double-line border, a touch of torchlight. */
export function Plaque(props: PanelProps) {
  return <Panel {...props} className={`plaque${props.className ? ` ${props.className}` : ''}`} />;
}

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  iconRight?: IconName;
  variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}

export function Btn({ icon, iconRight, variant = 'default', size = 'md', block, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size}${block ? ' btn-block' : ''}${!children ? ' btn-icon' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />}
      {children && <span className="btn-label">{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Pill
// ---------------------------------------------------------------------------------------------

export type Tone = 'muted' | 'good' | 'warn' | 'bad' | 'info' | 'amber' | 'fresco' | 'verdigris';

export function Pill({ tone = 'muted', icon, children, title, solid }: { tone?: Tone; icon?: IconName; children: React.ReactNode; title?: string; solid?: boolean }) {
  return (
    <span className={`pill pill-${tone}${solid ? ' pill-solid' : ''}`} title={title}>
      {icon && <Icon name={icon} size={13} strokeWidth={2} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Money / Influence
// ---------------------------------------------------------------------------------------------

export function Money({ value, signedValue, size = 'md', className }: { value: number; signedValue?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const neg = value < 0;
  return (
    <span className={`money money-${size}${neg ? ' neg' : ''}${className ? ` ${className}` : ''}`}>
      <Icon name="coin" size={size === 'lg' ? 20 : size === 'sm' ? 14 : 16} />
      <span className="num">{signedValue ? signed(value) : neg ? `−${fmt(-value)}` : fmt(value)}</span>
      <span className="sr-only"> denarii</span>
    </span>
  );
}

export function Influence({ value, signedValue, size = 'md' }: { value: number; signedValue?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`influence money-${size}`}>
      <Icon name="laurel" size={size === 'lg' ? 20 : size === 'sm' ? 14 : 16} />
      <span className="num">{signedValue ? signed(value) : fmt(value)}</span>
      <span className="sr-only"> influence</span>
    </span>
  );
}

export function Amber({ value }: { value: number }) {
  return (
    <span className="amber-gem">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5l7.5 6-3 12h-9l-3-12z" fill="var(--amber)" />
        <path d="M12 2.5l-2.5 6h5zM4.5 8.5h15" fill="none" stroke="var(--amber-ink)" strokeOpacity=".35" strokeWidth="1.2" />
      </svg>
      <span className="num">{fmt(value)}</span>
      <span className="sr-only"> Amber</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------------------------

export interface MeterProps {
  value: number;
  max?: number;
  tone?: Tone | 'stat';
  color?: string;
  /** fractions 0..1 to draw tick marks at */
  marks?: number[];
  height?: number;
  label?: string;
  /** secondary value drawn as a ghost (e.g. projected) */
  ghost?: number;
}

/** Thin progress bar. */
export function Meter({ value, max = 1, tone = 'amber', color, marks, height = 6, label, ghost }: MeterProps) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const g = ghost !== undefined && max > 0 ? Math.max(0, Math.min(1, ghost / max)) : undefined;
  return (
    <div
      className={`meter meter-${tone}`}
      style={{ height }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-label={label}
    >
      {g !== undefined && <div className="meter-ghost" style={{ width: `${g * 100}%` }} />}
      <div className="meter-fill" style={{ width: `${f * 100}%`, background: color }} />
      {marks?.map((m) => <div key={m} className="meter-mark" style={{ left: `${m * 100}%` }} />)}
    </div>
  );
}

/** Labelled stat bar: "STR  12  [=====---]". */
export function StatBar({ label, value, max, color, sub, marks, right }: { label: React.ReactNode; value: number; max: number; color?: string; sub?: React.ReactNode; marks?: number[]; right?: React.ReactNode }) {
  return (
    <div className="statbar">
      <div className="statbar-top">
        <span className="statbar-label micro">{label}</span>
        <span className="statbar-value num">{right ?? fmt(value)}</span>
      </div>
      <Meter value={value} max={max} color={color} marks={marks} height={7} label={typeof label === 'string' ? label : undefined} />
      {sub && <div className="statbar-sub xs muted">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Empty state, hint, key-value
// ---------------------------------------------------------------------------------------------

export function EmptyState({ icon = 'scroll', title, children, action }: { icon?: IconName; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={28} /></div>
      <div className="empty-title display">{title}</div>
      {children && <div className="empty-text small muted">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Contextual tip; hidden when the Tooltips setting is off. */
export function Hint({ children, icon = 'info' }: { children: React.ReactNode; icon?: IconName }) {
  const { meta } = useStore();
  if (!meta.settings.tooltips) return null;
  return (
    <div className="hint small">
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function KV({ k, children, title }: { k: React.ReactNode; children: React.ReactNode; title?: string }) {
  return (
    <div className="kv" title={title}>
      <span className="kv-k">{k}</span>
      <span className="kv-v">{children}</span>
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Form controls (every control gets a stable id)
// ---------------------------------------------------------------------------------------------

export function Stepper({ id, value, onDec, onInc, decDisabled, incDisabled, label }: { id: string; value: React.ReactNode; onDec: () => void; onInc: () => void; decDisabled?: boolean; incDisabled?: boolean; label: string }) {
  return (
    <div className="stepper" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="sr-only">{label}</span>
      <button id={`${id}-dec`} type="button" className="stepper-btn" onClick={onDec} disabled={decDisabled} aria-label={`Fewer ${label}`}>
        <Icon name="minus" size={16} strokeWidth={2.2} />
      </button>
      <span className="stepper-value num" aria-live="polite">{value}</span>
      <button id={`${id}-inc`} type="button" className="stepper-btn" onClick={onInc} disabled={incDisabled} aria-label={`More ${label}`}>
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export function Toggle({ id, checked, onChange, label, desc, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; desc?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`toggle${disabled ? ' disabled' : ''}`} htmlFor={id}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {desc && <span className="toggle-desc xs muted">{desc}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
    </label>
  );
}

export function Field({ id, label, children, help, error }: { id: string; label: React.ReactNode; children: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label micro" htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="field-error xs" role="alert">{error}</div> : help ? <div className="field-help xs muted">{help}</div> : null}
    </div>
  );
}

export interface SegOption<T extends string> { value: T; label: React.ReactNode; disabled?: boolean; title?: string }

/** Segmented control (radio group). */
export function Segmented<T extends string>({ id, value, options, onChange, label, size = 'md' }: { id: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label} id={id}>
      {options.map((o) => (
        <button
          key={o.value}
          id={`${id}-${o.value}`}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`seg-item${o.value === value ? ' on' : ''}`}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Thin labelled divider used inside plaques. */
export function Rule({ children }: { children?: React.ReactNode }) {
  return <div className="rule">{children && <span className="micro">{children}</span>}</div>;
}
