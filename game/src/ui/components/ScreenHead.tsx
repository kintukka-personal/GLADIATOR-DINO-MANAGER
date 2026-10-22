// Screen header: back arrow (when the stack allows), title, subtitle and actions.
import React from 'react';
import { useStore } from '../store';
import { Btn } from './primitives';

export function ScreenHead({ title, sub, actions, back = true }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: boolean }) {
  const store = useStore();
  const canBack = back && store.stack.length > 1;
  return (
    <div className="screen-head">
      {canBack && <Btn className="back-btn" id="screen-back" variant="ghost" icon="back" aria-label="Back" onClick={() => store.nav.pop()} />}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <div className="screen-sub">{sub}</div>}
      </div>
      {actions && <div className="screen-actions">{actions}</div>}
    </div>
  );
}
