// App shell: boot (hot snapshot, saves, #dev deep links), the in-game chrome (sticky status bar,
// bottom tab bar on phones, left rail on ≥960px, menu drawer), the screen router and overlays.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Meta } from '../engine/types';
import { loadMeta, deserialize } from '../engine/save';
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
import { ArenaScreen, ArenaPlayScreen } from './screens/Arena';
import { IntrigueScreen, InfluenceScreen, HordeScreen } from './screens/Placeholders';
import { ResultsScreen, DefeatedScreen } from './screens/Results';

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

const MENU_ONLY = new Set<string>(['menu', 'newgame', 'load', 'upgrades', 'achievements', 'halloffame', 'transfer']);

interface DevBoot { battle?: boolean }

function bootState(boot: HotData): StoreInit & { dev?: DevBoot } {
  const lsMeta = loadMeta();
  const meta: Meta = boot.meta && typeof boot.meta === 'object' ? { ...lsMeta, ...(boot.meta as Meta), settings: { ...lsMeta.settings, ...((boot.meta as Meta).settings ?? {}) } } : lsMeta;
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
    else if (name === 'results') {
      g.results = devSampleResults(g);
      stack = [{ name: 'hub' }, { name: 'results' }];
    } else if (name === 'codex') stack = [{ name: 'hub' }, { name: 'codex', page: a }];
    else if (name !== 'hub' && name !== 'battle') stack = [{ name: 'hub' }, { name: name as ScreenName, tab: a }];
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
  arenaPlay: ArenaPlayScreen, intrigue: IntrigueScreen, influence: InfluenceScreen, horde: HordeScreen, estate: EstateScreen,
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
      {store.dev && game && <div className="dev-ribbon" aria-hidden="true">dev data</div>}
      {battle && <BattleViewer result={battle.result} title={battle.title} onDone={store.closeBattle} initialSpeed={store.meta.settings.battleSpeed} sideNames={[game?.player.ludus.name ?? 'Your side', 'Opponents']} />}
      <ToastHost />
      <ConfirmHost />
    </>
  );
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
function currentArea(stack: ScreenRef[]): ScreenName {
  for (let i = stack.length - 1; i >= 0; i--) {
    const n = stack[i].name;
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
        <span className="sb-wk">Week {g.world.week}</span>
        <span className="sb-season">{seasonName(g.world.week)} · {g.world.temperature}°C</span>
      </button>
      <div className="sb-res">
        <Money value={me.denarii} />
        <Influence value={me.influence} />
      </div>
      <div className="sb-advance">
        <AdvanceButton compact />
      </div>
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
