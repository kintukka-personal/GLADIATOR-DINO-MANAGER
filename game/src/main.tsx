// Boot. The hosted page may be hot-updated by its host: window.claude.hot hands the previous
// version's snapshot back to us (data.save) so a player's game survives page updates.
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import './ui/theme.css';
import './ui/ui.css';
import { App } from './ui/App';
import { live } from './ui/store';
import { serialize } from './engine/save';

let root: Root | null = null;

const start = (data: HotData) => {
  const el = document.getElementById('root');
  if (!el) return;
  root ??= createRoot(el);
  root.render(
    <React.StrictMode>
      <App boot={data ?? {}} />
    </React.StrictMode>,
  );
};

window.claude?.hot?.snapshot?.(() => {
  let save: string | undefined;
  try {
    save = live.game ? serialize(live.game) : undefined;
  } catch {
    save = undefined;
  }
  return { save, meta: live.meta ?? undefined };
});

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
