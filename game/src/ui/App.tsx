// App shell: boot (hot snapshot, saves, #dev deep links), the in-game chrome (sticky status bar,
// bottom tab bar on phones, left rail on ≥960px, menu drawer), the screen router and overlays.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Meta } from '../engine/types';
import { loadMeta, deserialize, migrateMeta } from '../engine/save';
import { seasonName } from '../engine/breeding';
import { StoreProvider, useStore, BARE_SCREENS, TAB_SCREENS, type ScreenName, type ScreenRef, type StoreInit } from './store';
import { Icon, type IconName } from './components/Icon';
import { Btn, Influence, Money } from './components/primitives';
import { Sheet, ConfirmHost } from './components/Sheet';
import { ToastHost } from './components/Toast';
import { BattleViewer } from './battle/BattleViewer';
import { buildDevFixture, devBattle, devSampleResults } from './devFixture';
import { DevGallery } from './screens/DevGallery';
import { attention } from './screens/attention';
import { MainMenu, LoadScreen, UpgradesScreen, AchievementsScreen, HallOfFameScreen, TransferScreen } from './screens/MainMenu';
import { NewGameScreen } from './screens/NewGame';
import { SettingsScreen } from './screens/Settings';
import { CodexScreen } from './screens/Codex';
import { HubScreen, AdvanceButton } from './screens/Hub';
import { LudusScreen } from './screens/Ludus';
import { DinoScreen } from './screens/DinoDetail';
import { BreedingScreen } from './screens/Breeding';
import { MarketScreen } from './screens/Market';
import { EstateScreen, FinanceScreen } from './screens/Estate';
import { ObjectivesScreen, MessagesScreen, EventsScreen } from './screens/Ledger';
import { ArenaScreen } from './screens/Arena';
import { ArenaPlayScreen } from './screens/ArenaPlay';
import { IntrigueScreen, RivalScreen } from './screens/Intrigue';
import { InfluenceScreen } from './screens/Influence';
import { HordeScreen } from './screens/Horde';
import { AscensionScreen } from './screens/Ascension';
import { ResultsScreen, DefeatedScreen } from './screens/Results';
import { initAudio, setEffectsVolume, setSoundEnabled } from './audio';
import { useMusicDirector } from './musicDirector';
import { eligibility, register } from '../engine/tournaments';
import { beginAdvance } from '../engine/week';
import { TACTIC_KEYS } from '../engine/data/politicsData';

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

const MENU_ONLY = new Set<string>(['menu', 'newgame', 'load', 'upgrades', 'achievements', 'halloffame', 'transfer']);

interface DevBoot { battle?: boolean }

function bootState(boot: HotData): StoreInit & { dev?: DevBoot } {
  const lsMeta = loadMeta();
  // a hot-swap snapshot may come from an older page version: migrate it like a stored meta
  const hot = boot.meta && typeof boot.meta === 'object' ? migrateMeta(boot.meta) : null;
  const meta: Meta = hot ? { ...lsMeta, ...hot, settings: { ...lsMeta.settings, ...hot.settings } } : lsMeta;
  const hash = typeof location !== 'undefined' ? location.hash : '';
  if (hash.startsWith('#dev')) {
    const [, name = 'hub', a, b] = hash.slice(1).split('/');
    if (MENU_ONLY.has(name)) return { game: null, meta, stack: [{ name: name as ScreenName }] };
    const g = buildDevFixture({}, meta);
    g.slot = 99; // never overwrite a real save slot
    const me = g.player.ludus;
    const pickId = (key?: string) =>
      key === 'bred' ? me.creatures.find((c) => c.name === 'Rhesus')?.id
        : key === 'baby' ? me.creatures.find((c) => c.maturity < 0.1)?.id
          : key === 'first' || !key ? me.creatures[0]?.id : key;
    let stack: ScreenRef[] = [{ name: 'hub' }];
    if (name === 'dino') stack = [{ name: 'hub' }, { name: 'ludus' }, { name: 'dino', id: pickId(a), tab: b }];
    else if (name === 'rival') stack = [{ name: 'hub' }, { name: 'intrigue' }, { name: 'rival', id: a === 'first' || !a ? g.rivals[0]?.id : a }];
    else if (name === 'arenaPlay') {
      // register the best fighters for the first event they fit, then start the day (real engine on the fixture)
      try {
        const t = g.world.tournaments.find((x) => x.status === 'open' && x.type !== 'junior' && (a ? x.key === a : !x.underground)) ?? g.world.tournaments[0];
        if (t.underground) t.teams = 2; // straight to the pit master's choice
        if (!g.player.opportunities.includes('gambler')) g.player.opportunities.push('gambler'); // show the bookmakers
        const fit = g.player.ludus.creatures.filter((c) => eligibility(g, t, c) === null).sort((x, y) => y.level - x.level).slice(0, t.perTeam);
        register(g, t.id, [fit.map((c) => c.id)]);
        beginAdvance(g);
        g.player.week.uiAdvanceBegun = true;
        stack = [{ name: 'hub' }, { name: 'arenaPlay', id: t.id }];
      } catch (e) {
        console.warn('dev arenaPlay setup failed', e);
      }
    } else if (name === 'defeated') {
      g.over = { reason: (a as 'debt') || 'debt', week: g.world.week, influence: g.player.ludus.influence };
      stack = [{ name: 'defeated' }];
    } else if (name === 'horde' && a === 'tactics') {
      const c = g.player.ludus.creatures.find((x) => x.kind === 'dino' && x.maturity >= 1);
      g.world.horde.expeditionsEnabled = true;
      if (c) {
        const tactics = TACTIC_KEYS.slice(0, 3);
        c.away = { kind: 'expedition', weeksLeft: 1, note: 'Hunting the Wild Horde' };
        g.player.expedition = { commanderId: c.id, funds: 400, keepers: 2, capture: true, weeksLeft: 0, tactics, militia: 40 };
        g.player.storyData.expeditionTactics = [...tactics];
      }
      stack = [{ name: 'hub' }, { name: 'horde' }];
    } else if (name === 'horde' && a === 'open') {
      g.world.horde.expeditionsEnabled = true;
      stack = [{ name: 'hub' }, { name: 'horde' }];
    }
    else if (name === 'results') {
      g.results = devSampleResults(g);
      stack = [{ name: 'hub' }, { name: 'results' }];
    } else if (name === 'codex') stack = [{ name: 'hub' }, { name: 'codex', page: a }];
    else if (!['hub', 'battle', 'rival', 'arenaPlay', 'defeated', 'horde', 'dino'].includes(name) || (name === 'horde' && !a)) stack = [{ name: 'hub' }, { name: name as ScreenName, tab: a }];
    return { game: g, meta, stack, dev: { battle: name === 'battle' } };
  }
  if (boot.save) {
    try {
      const g = deserialize(boot.save);
      return { game: g, meta, stack: [{ name: g.over ? 'defeated' : 'hub' }] };
    } catch {
      /* fall through to the menu */
    }
  }
  return { game: null, meta, stack: [{ name: 'menu' }] };
}

export function App({ boot }: { boot: HotData }) {
  const [gallery] = useState(() => typeof location !== 'undefined' && location.hash === '#gallery');
  const init = useMemo(() => bootState(boot), [boot]);
  if (gallery) return <DevGallery />;
  return (
    <StoreProvider init={init}>
      <Shell devBoot={init.dev} />
    </StoreProvider>
  );
}

// ---------------------------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------------------------

const SCREENS: Record<ScreenName, React.ComponentType> = {
  menu: MainMenu, newgame: NewGameScreen, load: LoadScreen, upgrades: UpgradesScreen, achievements: AchievementsScreen,
  halloffame: HallOfFameScreen, settings: SettingsScreen, codex: CodexScreen, transfer: TransferScreen,
  hub: HubScreen, ludus: LudusScreen, dino: DinoScreen, breeding: BreedingScreen, market: MarketScreen, arena: ArenaScreen,
  arenaPlay: ArenaPlayScreen, intrigue: IntrigueScreen, rival: RivalScreen, influence: InfluenceScreen, horde: HordeScreen,
  ascension: AscensionScreen, estate: EstateScreen,
  finance: FinanceScreen, objectives: ObjectivesScreen, messages: MessagesScreen, events: EventsScreen, results: ResultsScreen,
  defeated: DefeatedScreen,
};

function Shell({ devBoot }: { devBoot?: DevBoot }) {
  const store = useStore();
  const { screen, stack, game, battle } = store;
  const didDev = useRef(false);

  useEffect(() => {
    if (didDev.current || !devBoot?.battle || !game) return;
    didDev.current = true;
    store.showBattle(devBattle(game), 'Sparring bout (preview)');
  }, [devBoot, game, store]);

  // sound: unlocked on the first gesture, follows Settings → Sound and Effects volume
  useEffect(() => initAudio(), []);
  useEffect(() => setSoundEnabled(store.meta.settings.sound), [store.meta.settings.sound]);
  useEffect(() => setEffectsVolume(store.meta.settings.sfxVolume ?? 1), [store.meta.settings.sfxVolume]);
  // music: the mood follows the screen, the battle overlay and night-scene sheets (musicDirector.ts)
  useMusicDirector(store);

  // a run can end mid-week (a lost raid decision): show the Defeated screen once any battle is closed
  useEffect(() => {
    if (game?.over && !battle && !BARE_SCREENS.has(screen.name)) store.nav.reset([{ name: 'defeated' }]);
  }, [game?.over, battle, screen.name, store.nav]);

  // Android-style back on Escape (sheets handle their own Escape first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.body.classList.contains('sheet-open')) return;
      if (store.battle) return;
      if (stack.length > 1) store.nav.pop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stack.length, store]);

  // new screen → scroll to top
  const key = `${stack.length}:${screen.name}:${screen.id ?? ''}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [key]);

  const Screen = SCREENS[screen.name] ?? MainMenu;
  const bare = !game || BARE_SCREENS.has(screen.name);

  return (
    <>
      {bare ? (
        <div className="app">
          <main className="main bare" id="main">
            <Screen key={key} />
          </main>
        </div>
      ) : (
        <div className="app app-game">
          <Rail />
          <div className="app-col">
            <StatusBar />
            <main className="main" id="main">
              <Screen key={key} />
            </main>
          </div>
          <TabBar />
        </div>
      )}
      {battle && <BattleOverlay />}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}

/** The battle viewer over everything; side names follow the side the player fights on. */
function BattleOverlay() {
  const store = useStore();
  const b = store.battle;
  if (!b) return null;
  const ps = b.result.playerSide ?? b.opts?.playerSide ?? 0;
  const [mine, theirs] = b.opts?.sideNames ?? [store.game?.player.ludus.name ?? 'Your side', 'Opponents'];
  const names: [string, string] = ps === 0 ? [mine, theirs] : [theirs, mine];
  return <BattleViewer result={b.result} title={b.title} onDone={store.closeBattle} initialSpeed={store.meta.settings.battleSpeed} playerSide={ps} sideNames={names} />;
}

// ---------------------------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------------------------

interface NavItem { name: ScreenName; label: string; icon: IconName }

const TABS: NavItem[] = [
  { name: 'ludus', label: 'Ludus', icon: 'gate' },
  { name: 'breeding', label: 'Breeding', icon: 'egg' },
  { name: 'market', label: 'Market', icon: 'amphora' },
  { name: 'arena', label: 'Arena', icon: 'arena' },
  { name: 'intrigue', label: 'Intrigue', icon: 'spy' },
];

const MORE: NavItem[] = [
  { name: 'hub', label: 'Hub', icon: 'home' },
  { name: 'estate', label: 'Estate', icon: 'estate' },
  { name: 'finance', label: 'Finance', icon: 'finance' },
  { name: 'influence', label: 'Influence', icon: 'laurel' },
  { name: 'horde', label: 'Horde', icon: 'horde' },
  { name: 'objectives', label: 'Objectives', icon: 'flag' },
  { name: 'messages', label: 'Messages', icon: 'message' },
  { name: 'events', label: 'Events', icon: 'bell' },
  { name: 'codex', label: 'Codex', icon: 'book' },
  { name: 'settings', label: 'Settings', icon: 'gear' },
];

/** The top-level area the current stack belongs to (for highlighting). */
const PARENT_AREA: Partial<Record<ScreenName, ScreenName>> = { arenaPlay: 'arena', rival: 'intrigue', ascension: 'influence' };

function currentArea(stack: ScreenRef[]): ScreenName {
  for (let i = stack.length - 1; i >= 0; i--) {
    const n = PARENT_AREA[stack[i].name] ?? stack[i].name;
    if (TAB_SCREENS.includes(n) || MORE.some((m) => m.name === n)) return n;
  }
  return 'hub';
}

function badgeFor(name: ScreenName, g: GameState): number {
  const a = attention(g);
  switch (name) {
    case 'breeding': return a.care + a.eggsAtRisk;
    case 'messages': return a.unread;
    case 'objectives': return a.objectives;
    case 'events': return a.decisions;
    case 'intrigue': return a.defenses;
    case 'ludus': return a.statPoints;
    default: return 0;
  }
}

function StatusBar() {
  const store = useStore();
  const g = store.game!;
  const me = g.player.ludus;
  const [drawer, setDrawer] = useState(false);
  return (
    <header className="statusbar">
      <Btn id="sb-menu" className="sb-menu hide-wide" variant="ghost" icon="menu" aria-label="Menu" onClick={() => setDrawer(true)} />
      <button type="button" className="sb-week link-plain" onClick={() => store.nav.area('hub')} aria-label="Go to the hub">
        <span className="sb-wk">Week {g.world.week}{store.dev && <span className="dev-tag" title="Playing on hand-built development data">dev data</span>}</span>
        <span className="sb-season">{seasonName(g.world.week)} · {g.world.temperature}°C</span>
      </button>
      <div className="sb-res">
        <Money value={me.denarii} />
        <Influence value={me.influence} />
      </div>
      {!['results', 'arenaPlay', 'defeated'].includes(store.screen.name) && (
        <div className="sb-advance">
          <AdvanceButton compact />
        </div>
      )}
      <Drawer open={drawer} onClose={() => setDrawer(false)} />
    </header>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const g = store.game;
  if (!g) return null;
  const go = (n: ScreenName) => {
    onClose();
    store.nav.area(n);
  };
  return (
    <Sheet open={open} onClose={onClose} title={g.player.ludus.name} label={`Lanista ${g.player.lanista}`}>
      <div className="drawer-grid">
        {MORE.map((m) => {
          const b = badgeFor(m.name, g);
          return (
            <button key={m.name} id={`drawer-${m.name}`} type="button" className="drawer-item" onClick={() => go(m.name)}>
              <Icon name={m.icon} />
              <span>{m.label}</span>
              {b > 0 && <span className="rail-badge pill pill-fresco num">{b}</span>}
            </button>
          );
        })}
        <button type="button" id="drawer-export" className="drawer-item" onClick={() => { onClose(); store.nav.push({ name: 'transfer' }); }}>
          <Icon name="copy" />
          <span>Export save</span>
        </button>
        <button type="button" id="drawer-quit" className="drawer-item" onClick={() => { onClose(); store.quit(); }}>
          <Icon name="save" />
          <span>Save &amp; quit</span>
        </button>
      </div>
    </Sheet>
  );
}

function TabBar() {
  const store = useStore();
  const g = store.game!;
  const area = currentArea(store.stack);
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        const b = badgeFor(t.name, g);
        return (
          <button
            key={t.name}
            id={`tab-${t.name}`}
            type="button"
            className={`tabbar-item${area === t.name ? ' on' : ''}`}
            aria-current={area === t.name ? 'page' : undefined}
            onClick={() => store.nav.area(t.name)}
          >
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {b > 0 && <span className="tb-badge num">{b}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Rail() {
  const store = useStore();
  const g = store.game!;
  const area = currentArea(store.stack);
  const item = (m: NavItem) => {
    const b = badgeFor(m.name, g);
    return (
      <button key={m.name} id={`rail-${m.name}`} type="button" className={`rail-item${area === m.name ? ' on' : ''}`} onClick={() => store.nav.area(m.name)} aria-current={area === m.name ? 'page' : undefined}>
        <Icon name={m.icon} />
        <span>{m.label}</span>
        {b > 0 && <span className="rail-badge pill pill-fresco num">{b}</span>}
      </button>
    );
  };
  return (
    <aside className="rail" aria-label="Navigation">
      <div className="rail-logo">
        <div className="lockup">
          <span className="lockup-top">JURASSIC</span>
          <span className="lockup-main">Lud<em>u</em>s</span>
        </div>
      </div>
      {item(MORE[0])}
      {TABS.map(item)}
      <div className="rail-section micro">Estate</div>
      {MORE.slice(1, 5).map(item)}
      <div className="rail-section micro">Ledger</div>
      {MORE.slice(5, 8).map(item)}
      <div className="grow" />
      {MORE.slice(8).map(item)}
      <button type="button" id="rail-quit" className="rail-item" onClick={() => store.quit()}>
        <Icon name="save" />
        <span>Save &amp; quit</span>
      </button>
    </aside>
  );
}
