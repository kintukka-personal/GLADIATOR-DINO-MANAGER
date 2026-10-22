// Toast host: action feedback and achievement ribbons. aria-live so screen readers hear outcomes.
import React from 'react';
import { useStore } from '../store';
import { Icon, type IconName } from './Icon';

const ICON: Record<string, IconName> = { info: 'info', good: 'check', bad: 'warning', warn: 'warning', achievement: 'trophy' };

export function ToastHost() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'bad' ? 'alert' : 'status'}>
          <Icon name={ICON[t.kind] ?? 'info'} size={18} />
          <div className="toast-text">
            {t.title && <div className="toast-title display">{t.kind === 'achievement' ? `Achievement: ${t.title}` : t.title}</div>}
            <div>{t.text}</div>
          </div>
          <button type="button" className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
