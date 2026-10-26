// Sheet: bottom sheet on phones, centred dialog on wide screens. ConfirmSheet replaces window.confirm
// (blocked where the game is hosted). Rendered through a portal; Escape closes; focus is trapped loosely.
import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Btn } from './primitives';
import { useStore } from '../store';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  label?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** wider dialog on desktop */
  wide?: boolean;
  /** the sheet cannot be dismissed by tapping the scrim */
  sticky?: boolean;
  className?: string;
}

const openStack: string[] = [];

export function Sheet({ open, onClose, title, label, children, footer, wide, sticky, className }: SheetProps) {
  const id = useId().replace(/:/g, '');
  const panel = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openStack.push(id);
    prevFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      el?.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) {
        // mark it handled: the app's Escape-means-back listener may run after this one, by which time React
        // has already unmounted the sheet and cleared body.sheet-open
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
      if (!openStack.length) document.body.classList.remove('sheet-open');
      prevFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open, id, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-layer">
      <div className="sheet-scrim" onClick={sticky ? undefined : onClose} aria-hidden="true" />
      <div
        ref={panel}
        className={`sheet${wide ? ' sheet-wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {(title || label) && (
          <header className="sheet-head">
            <div className="sheet-titles">
              {label && <div className="micro">{label}</div>}
              {title && <h3 id={`${id}-title`}>{title}</h3>}
            </div>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={20} />
            </button>
          </header>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Global confirm sheet, driven by store.confirm(). Mounted once in App. */
export function ConfirmHost() {
  const { confirmState } = useStore();
  if (!confirmState) return null;
  const { opts, resolve } = confirmState;
  return (
    <Sheet
      open
      onClose={() => resolve(false)}
      title={opts.title}
      footer={
        <div className="row gap-2 end wrap">
          <Btn id="confirm-cancel" variant="ghost" onClick={() => resolve(false)}>{opts.cancelLabel ?? 'Cancel'}</Btn>
          <Btn id="confirm-ok" variant={opts.danger ? 'danger' : 'primary'} onClick={() => resolve(true)} data-autofocus>
            {opts.confirmLabel ?? 'Confirm'}
          </Btn>
        </div>
      }
    >
      {opts.text && <div className="small">{opts.text}</div>}
    </Sheet>
  );
}

/** Stand-alone confirm sheet for local use (when a promise is awkward). */
export function ConfirmSheet({ open, title, text, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { open: boolean; title: string; text?: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="row gap-2 end wrap">
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>{confirmLabel}</Btn>
        </div>
      }
    >
      {text && <div className="small">{text}</div>}
    </Sheet>
  );
}
