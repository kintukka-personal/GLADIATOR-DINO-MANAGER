// The UI store: one GameState + one Meta held in refs (the engine mutates them in place),
// a version counter that forces a re-render after each action, a screen stack, toasts,
// the confirm sheet and the battle overlay. Every engine action goes through act().

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AchievementId, BattleResult, GameState, Meta, Settings } from '../engine/types';
import { saveGame, saveMeta, serialize, deserialize } from '../engine/save';
import { ACHIEVEMENTS } from '../engine/achievements';
import { beginAdvance, completeWeek } from '../engine/week';
import { attendedTournament } from '../engine/tournaments';
import { friendlyError, safe } from './safe';
import { camelToWords } from './format';

// ---------------------------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------------------------

export type ScreenName =
  | 'menu' | 'newgame' | 'load' | 'upgrades' | 'achievements' | 'halloffame' | 'settings' | 'codex' | 'transfer'
  | 'hub' | 'ludus' | 'dino' | 'breeding' | 'market' | 'arena' | 'arenaPlay' | 'intrigue' | 'influence' | 'horde'
  | 'estate' | 'finance' | 'objectives' | 'messages' | 'events' | 'results' | 'defeated';

export interface ScreenRef {
  name: ScreenName;
  /** creature id, tournament id … */
  id?: string;
  /** active tab inside the screen (kept in the stack so Back returns to it) */
  tab?: string;
  /** codex page */
  page?: string;
}

/** Screens drawn without the in-game chrome (status bar, tabs, rail). */
export const BARE_SCREENS = new Set<ScreenName>(['menu', 'newgame', 'defeated']);
/** The five bottom tabs. */
export const TAB_SCREENS: ScreenName[] = ['ludus', 'breeding', 'market', 'arena', 'intrigue'];

// ---------------------------------------------------------------------------------------------
// Store contract
// ---------------------------------------------------------------------------------------------

export type ToastKind = 'info' | 'good' | 'bad' | 'warn' | 'achievement';
export interface Toast { id: number; text: string; kind: ToastKind; title?: string }

export interface ConfirmOpts {
  title: string;
  text?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ActOpts<T> {
  /** success toast (string or derived from the result) */
  ok?: string | ((r: T) => string | undefined);
  /** failure text when the engine returns `false` */
  failText?: string;
  /** a returned string is a success message, not an error */
  stringIsText?: boolean;
  /** called instead of the toast when the engine throws */
  onError?: (message: string) => void;
}

export interface Nav {
  push: (s: ScreenRef) => void;
  pop: () => void;
  replace: (s: ScreenRef) => void;
  reset: (stack: ScreenRef[]) => void;
  /** patch the current screen (tab changes) */
  update: (patch: Partial<ScreenRef>) => void;
  /** switch to a top-level area: stack becomes [hub, area] */
  area: (name: ScreenName, tab?: string) => void;
}

export interface Store {
  game: GameState | null;
  meta: Meta;
  /** version counter, bumps after every action */
  v: number;
  /** playing on hand-built dev data (engine seeders still stubs) */
  dev: boolean;
  stack: ScreenRef[];
  screen: ScreenRef;
  nav: Nav;
  act: <T>(fn: (g: GameState) => T, opts?: ActOpts<T>) => T | undefined;
  actMeta: (fn: (m: Meta) => string | null | void | boolean, ok?: string) => boolean;
  setSettings: (patch: Partial<Settings>) => void;
  toast: (text: string, kind?: ToastKind, title?: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  confirmState: { opts: ConfirmOpts; resolve: (v: boolean) => void } | null;
  battle: { result: BattleResult; title?: string; onDone?: () => void } | null;
  showBattle: (result: BattleResult, title?: string, onDone?: () => void) => void;
  closeBattle: () => void;
  startGame: (g: GameState, dev: boolean, stack?: ScreenRef[]) => void;
  quit: () => void;
  /** Advance pressed. Returns false when the week could not start. */
  advance: (onBlocked?: (msg: string) => void) => void;
  /** Finish the week after the arena (completeWeek → results chain). */
  finishWeek: (onBlocked?: (msg: string) => void) => void;
  storageOk: boolean;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** The current game; screens under the game chrome may assume it exists. */
export function useGame(): GameState {
  const s = useStore();
  if (!s.game) throw new Error('No game loaded');
  return s.game;
}

/** Live references for the host hot-reload snapshot (main.tsx). */
export const live: { game: GameState | null; meta: Meta | null } = { game: null, meta: null };

export const DEV_FLAG = '__devFixture';

export function isDevGame(g: GameState | null): boolean {
  return !!g?.player?.storyData?.[DEV_FLAG];
}

// ---------------------------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------------------------

export interface StoreInit {
  game: GameState | null;
  meta: Meta;
  stack: ScreenRef[];
}

function resultFailure<T>(r: T, opts: ActOpts<T>): string | null {
  if (typeof r === 'string') return opts.stringIsText ? null : r;
  if (r === false) return opts.failText ?? 'That is not possible right now.';
  if (r && typeof r === 'object' && 'ok' in (r as object) && (r as { ok?: unknown }).ok === false) {
    return ((r as { text?: string }).text) ?? 'That did not work.';
  }
  return null;
}

export function StoreProvider({ init, children }: { init: StoreInit; children: React.ReactNode }) {
  const gameRef = useRef<GameState | null>(init.game);
  const metaRef = useRef<Meta>(init.meta);
  const [v, setV] = useState(0);
  const [stack, setStack] = useState<ScreenRef[]>(init.stack);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<Store['confirmState']>(null);
  const [battle, setBattle] = useState<Store['battle']>(null);
  const [storageOk, setStorageOk] = useState(true);
  const warnedStorage = useRef(false);
  const toastId = useRef(1);

  live.game = gameRef.current;
  live.meta = metaRef.current;

  const bump = useCallback(() => setV((x) => x + 1), []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, kind: ToastKind = 'info', title?: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind, title }]);
    window.setTimeout(() => dismissToast(id), kind === 'achievement' ? 5200 : kind === 'bad' ? 4600 : 3200);
  }, [dismissToast]);

  const persist = useCallback(() => {
    const g = gameRef.current;
    if (g) {
      const ok = saveGame(g);
      if (!ok && !warnedStorage.current) {
        warnedStorage.current = true;
        setStorageOk(false);
        toast('This browser is not keeping saves. Use Export save in the menu to keep your game.', 'warn');
      }
    }
    saveMeta(metaRef.current);
  }, [toast]);

  /** Move state.pendingAchievements into the account meta and award Amber. */
  const collectAchievements = useCallback(() => {
    const g = gameRef.current;
    if (!g || !g.pendingAchievements?.length) return;
    const ids: AchievementId[] = g.pendingAchievements.splice(0);
    if (g.world.difficulty.sandbox) return; // achievements are disabled in Sandbox
    const m = metaRef.current;
    for (const id of ids) {
      if (m.achievements.includes(id)) continue;
      m.achievements.push(id);
      const def = ACHIEVEMENTS[id];
      const amber = def?.amber ?? 50;
      m.amber += amber;
      toast(`${def?.desc ?? 'A new deed for the annals of your house.'} +${amber} Amber`, 'achievement', def?.name ?? camelToWords(id));
    }
  }, [toast]);

  const act = useCallback(<T,>(fn: (g: GameState) => T, opts: ActOpts<T> = {}): T | undefined => {
    const g = gameRef.current;
    if (!g) return undefined;
    let backup: string | null = null;
    try {
      backup = serialize(g);
    } catch {
      backup = null;
    }
    let r: T;
    try {
      r = fn(g);
    } catch (e) {
      // roll back any half-applied mutation so a stub can never corrupt the save
      if (backup) {
        try {
          gameRef.current = deserialize(backup);
        } catch {
          /* keep current */
        }
      }
      const msg = friendlyError(e);
      if (opts.onError) opts.onError(msg);
      else toast(msg, 'bad');
      bump();
      return undefined;
    }
    const fail = resultFailure(r, opts);
    if (fail) toast(fail, 'bad');
    else {
      const okText = typeof opts.ok === 'function' ? opts.ok(r) : opts.ok;
      if (okText) toast(okText, 'good');
    }
    collectAchievements();
    persist();
    bump();
    return r;
  }, [bump, collectAchievements, persist, toast]);

  const actMeta = useCallback((fn: (m: Meta) => string | null | void | boolean, ok?: string): boolean => {
    try {
      const r = fn(metaRef.current);
      if (typeof r === 'string') {
        toast(r, 'bad');
        return false;
      }
      if (r === false) {
        toast('That is not possible right now.', 'bad');
        return false;
      }
      if (gameRef.current) gameRef.current.unlocks = [...metaRef.current.upgrades];
      if (ok) toast(ok, 'good');
      persist();
      bump();
      return true;
    } catch (e) {
      toast(friendlyError(e), 'bad');
      return false;
    }
  }, [bump, persist, toast]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    metaRef.current.settings = { ...metaRef.current.settings, ...patch };
    saveMeta(metaRef.current);
    bump();
  }, [bump]);

  // theme + reduced motion on <html>
  const settings = metaRef.current.settings;
  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', settings.theme);
    el.classList.toggle('reduce-motion', !!settings.reduceMotion);
  }, [settings.theme, settings.reduceMotion]);

  const nav: Nav = useMemo(() => ({
    push: (s) => setStack((st) => [...st, s]),
    pop: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    replace: (s) => setStack((st) => [...st.slice(0, -1), s]),
    reset: (s) => setStack(s.length ? s : [{ name: 'menu' }]),
    update: (patch) => setStack((st) => [...st.slice(0, -1), { ...st[st.length - 1], ...patch }]),
    area: (name, tab) => setStack(name === 'hub' ? [{ name: 'hub' }] : [{ name: 'hub' }, { name, tab }]),
  }), []);

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setConfirmState({ opts, resolve: (val: boolean) => { setConfirmState(null); resolve(val); } });
  }), []);

  const battleRef = useRef<Store['battle']>(null);
  const showBattle = useCallback((result: BattleResult, title?: string, onDone?: () => void) => {
    battleRef.current = { result, title, onDone };
    setBattle(battleRef.current);
  }, []);
  const closeBattle = useCallback(() => {
    const b = battleRef.current;
    battleRef.current = null;
    setBattle(null);
    b?.onDone?.();
  }, []);

  const startGame = useCallback((g: GameState, devData: boolean, st?: ScreenRef[]) => {
    gameRef.current = g;
    g.unlocks = [...new Set([...(g.unlocks ?? []), ...metaRef.current.upgrades])];
    collectAchievements();
    persist();
    setStack(st ?? (g.over ? [{ name: 'defeated' }] : [{ name: 'hub' }]));
    bump();
    void devData;
  }, [bump, collectAchievements, persist]);

  const quit = useCallback(() => {
    if (gameRef.current) persist();
    gameRef.current = null;
    setStack([{ name: 'menu' }]);
    bump();
  }, [bump, persist]);

  const finishWeek = useCallback((onBlocked?: (msg: string) => void) => {
    const res = act((g) => completeWeek(g), { onError: (m) => (onBlocked ? onBlocked(m) : toast(m, 'bad')) });
    if (res === undefined) return;
    const g = gameRef.current;
    const m = metaRef.current;
    m.stats.weeksPlayed += 1;
    if (g) {
      m.stats.bestWeek = Math.max(m.stats.bestWeek, g.world.week);
      m.stats.bestInfluence = Math.max(m.stats.bestInfluence, g.player.ludus.influence);
    }
    saveMeta(m);
    setStack(g?.over ? [{ name: 'defeated' }] : [{ name: 'hub' }, { name: 'results' }]);
  }, [act, toast]);

  const advance = useCallback((onBlocked?: (msg: string) => void) => {
    const g = gameRef.current;
    if (!g) return;
    if (g.over) {
      setStack([{ name: 'defeated' }]);
      return;
    }
    if (!g.player.week.uiAdvanceBegun) {
      const ok = act((s) => {
        beginAdvance(s);
        s.player.week.uiAdvanceBegun = true;
        return true;
      }, { onError: (m) => (onBlocked ? onBlocked(m) : toast(m, 'bad')) });
      if (ok === undefined) return;
    }
    const cur = gameRef.current;
    const t = cur ? safe(() => attendedTournament(cur), undefined) : undefined;
    if (t && t.status !== 'done') {
      setStack([{ name: 'hub' }, { name: 'arenaPlay', id: t.id }]);
      return;
    }
    finishWeek(onBlocked);
  }, [act, finishWeek, toast]);

  const value: Store = {
    game: gameRef.current,
    meta: metaRef.current,
    v,
    dev: isDevGame(gameRef.current),
    stack,
    screen: stack[stack.length - 1] ?? { name: 'menu' },
    nav,
    act,
    actMeta,
    setSettings,
    toast,
    toasts,
    dismissToast,
    confirm,
    confirmState,
    battle,
    showBattle,
    closeBattle,
    startGame,
    quit,
    advance,
    finishWeek,
    storageOk,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
