# Jurassic Ludus — UI guide

The UI is React 18 + plain CSS, mobile-first (designed at 390×844, works 360–1440px). The concept is a
**torchlit fresco**: the inside of a Capuan ludus at night — basalt walls, Pompeian-red fresco niches,
verdigris bronze, and **amber** as the single signature accent (money, attention, primary action).

```
src/main.tsx            boot (window.claude.hot snapshot/restore), mounts <App>
src/ui/
  theme.css             tokens (palette contract, type scale, spacing), base element styles
  ui.css                layout + every component style
  App.tsx               boot state, chrome (status bar, tab bar, rail, drawer), router, overlays
  store.tsx             the store: GameState + Meta, act(), nav stack, toasts, confirm, battle overlay
  safe.ts               safe() / tryRead() / friendlyError()
  format.ts             pure formatting (numbers, stat labels, region names, hashing)
  derive.ts             stub-safe derived reads that touch engine logic (building totals, keepers, spies)
  audio.ts              WebAudio synth (no files): sfx.tap/coin/levelUp/newWeek/hatch/hit/crit/miss/ko/cheer/groan/…
  records.ts            account records the engine leaves to the app: game-over highscore + stats, Hall of Fame
  devFixture.ts         hand-built GameState, sample battle, sample week results
  components/           Icon, primitives (Panel, Plaque, Btn, Pill, Money…), Tabs, Sheet, Toast,
                        CreatureRow/CreaturePicker, GearPicker, ScreenHead
  art/                  DinoArt (+plans, geom), EggArt + Thermometer, ColorSwatches, EstateBanner, Portrait
  battle/BattleViewer   replays a BattleResult
  screens/              one file per area (Hub, Ludus, DinoDetail, Breeding, Market, Estate, Ledger, Arena,
                        ArenaPlay, Intrigue, Influence, Horde, Ascension, Results, MainMenu, NewGame, Settings,
                        Codex, DevGallery)
```

## 1. Tokens

`theme.css` holds the palette contract on `:root` (dark first) and the "daylight" values under
`prefers-color-scheme: light` and `:root[data-theme="light"]`. The Settings theme option writes
`data-theme` on `<html>` (`system` removes it). Never hard-code colours in screens; use the tokens:

| Token | Use |
|---|---|
| `--bg` `--wall` `--plaque` `--plaque-2` | page, chrome (bars/rail), panels, raised controls |
| `--line` `--bronze` | hairlines; bronze edges of key plaques |
| `--fg` `--muted` | text |
| `--amber` / `--amber-ink` | the one accent: money, attention, primary buttons (ink = text on amber) |
| `--fresco` | Pompeian red: badges, danger, art niches |
| `--verdigris` | influence, genetics |
| `--good` `--warn` `--bad` `--info` | status |

Derived tokens: type scale `--fs-12/14/16/20/26/34`, spacing `--sp-1…6` (4/8/12/16/24/32),
`--radius: 4px`, `--shadow`, `--gutter-l/r` (16px or the safe-area inset), `--statusbar-h`, `--tabbar-h`.

Type: display face **Marcellus SC** for headings (`h1–h4`, `.display`), **Alegreya Sans** for everything
else. All numbers use tabular numerals (`.num`, tables, `Money`). Micro labels: `.micro` (12px, uppercase,
+0.06em). Headings use `text-wrap: balance`.

Motion respects `prefers-reduced-motion` *and* the in-game Reduce motion toggle (`html.reduce-motion`).
Focus is always visible (`:focus-visible` amber outline). Art panels (estate banner, dino niches, battle
stage) stay dark in both themes — they are paintings, not chrome.

## 2. Layout

- Phones: sticky status bar (week, season, temperature, denarii, influence, Advance), scrolling content,
  fixed bottom tab bar **Ludus · Breeding · Market · Arena · Intrigue**, menu drawer from the top-left button.
- ≥ 960px: left rail (all areas) + content max 1180px. Use `.cols` for the 2-column grid
  (`.cols-wide-left` for 1.25:1; `.span-2` to span). `.hide-wide` / `.hide-narrow` swap blocks.
- Never cause horizontal page scroll: wide tables go in `.table-wrap` (scrolls inside), long rows use
  `.ellipsis`, flex children get `min-width: 0` (built into `.row`/`.col`/`.panel`).
- Safe areas: gutters use `--gutter-l/r`; the tab bar adds `env(safe-area-inset-bottom)`; the status bar
  sticks at `env(safe-area-inset-top)`.

## 3. The store and calling the engine safely

```tsx
const store = useStore();          // { game, meta, v, dev, stack, screen, nav, act, … }
const g = store.game!;             // screens under the game chrome may assume a game
```

The engine mutates state in place. The store keeps one `GameState` and one `Meta` in refs and bumps a
version counter `v` after every action so everything re-renders.

**Actions — always `store.act(fn, opts)`:**

```tsx
store.act((s) => buyCreature(s, c.id), { ok: `${c.name} joins the ludus.` });
store.act((s) => assignKeepers(s, s.player.ludus, 'miners', 1), { failText: 'No unassigned keepers.' });
const r = store.act((s) => resolveDecision(s, d.id, i));     // returns the engine's result (or undefined)
```

`act` snapshots the state, runs `fn`, and:
- if `fn` throws (e.g. a stub's "not implemented"): **rolls the state back**, toasts a friendly message
  (or calls `opts.onError`), returns `undefined`;
- reads the result: a returned **string** = error toast (unless `stringIsText`), `false` = error toast
  (`failText`), `{ ok: false, text }` = error toast; otherwise success (`opts.ok` toast if given);
- moves `pendingAchievements` into Meta via the engine's `grantAchievements` (Amber, achievement toast),
  saves the game (`saveGame`) and the meta, bumps `v`.

UI-only settings with no engine function (training regimen, nickname, message read flags) are written
inside `act` too, so they are saved and rolled back like everything else.

**Derived reads — `safe(() => fn(), fallback)`:** never let a stub or odd state crash a screen.
`tryRead(fn)` returns `{ ok, value | error }` when you need to say "not available yet".
`derive.ts` has the shared ones: `totals(h)` (building totals with a DESIGN §7 fallback), `keepersOf`,
`spiesOf`.

Do not call engine functions that **mutate** during render. Example: `activeConversation()` prunes and
triggers stories, so the hub runs it inside `act` in an effect.

**Meta actions:** `store.actMeta((m) => buyUpgrade(m, id), 'Unlocked.')` (also merges the upgrade into
`state.unlocks` when a game is loaded). `store.setSettings({ theme: 'dark' })`.

**Week flow:** `store.advance(onBlocked?)` → `beginAdvance` (once per week, flag in `player.week`) → if
`attendedTournament()` is pending, route to `arenaPlay`; otherwise `store.finishWeek()` →
`completeWeek` → `syncAscensionMeta` → Hall of Fame induction every 10th week and the game-over record
(`records.ts`) → results chain (`results` screen) → hub. A run can also end mid-week (a lost raid decision):
the shell routes to `defeated` as soon as `game.over` is set and no battle is on screen. The Defeated screen
records the run once (`world.flags.uiRunRecorded`; never for dev data).

**Sound:** `act()` plays a coin when the player's denarii change (pass `{ quiet: true }` when the caller has
its own cue), achievements play the harp, `finishWeek` the drums and a lyre when a dino levelled. Buttons,
tabs and switches tick through one capture listener (`initAudio`, mounted by the shell, which also unlocks the
AudioContext on the first gesture). Everything obeys Settings → Sound (`setSoundEnabled`).

**Overlays:** `await store.confirm({ title, text, confirmLabel, danger })` (never `window.confirm`),
`store.toast(text, kind)`, `store.showBattle(result, title, onDone, { sideNames: [mine, theirs] })`: the viewer
puts the names on the right sides from `BattleResult.playerSide`.

## 4. Navigation

A screen stack of `ScreenRef { name, id?, tab?, page? }`.

| Call | Use |
|---|---|
| `nav.push({ name: 'dino', id })` | drill in |
| `nav.pop()` | back (also Escape) |
| `nav.replace(ref)` | swap the current screen (prev/next creature) |
| `nav.update({ tab })` | change the tab of the current screen (kept, so Back returns to it) |
| `nav.area('breeding', 'nursery')` | top-level jump: stack becomes `[hub, area]` |
| `nav.reset([...])` | replace the whole stack |

**Adding a screen:** add the name to `ScreenName` in `store.tsx`, write `screens/Foo.tsx` exporting
`FooScreen`, register it in `SCREENS` in `App.tsx`, start it with `<ScreenHead title sub actions />`. If it
should hide the game chrome add it to `BARE_SCREENS`. For a tabbed screen read `store.screen.tab` and
render `<Tabs value onChange={(t) => store.nav.update({ tab: t })} />`. Give every form control a stable `id`.

## 5. Components

| Component | Notes |
|---|---|
| `Panel` / `Plaque` | `title`, `label` (micro), `actions`, `flush` (no padding, for lists). Plaque = key panel with the double bronze edge |
| `Btn` | `variant` primary/default/ghost/quiet/danger, `size` sm/md/lg, `icon`, `iconRight`, `block`; forwards refs; icon-only when no children (give `aria-label`) |
| `Pill` | `tone` muted/good/warn/bad/info/amber/fresco/verdigris, `icon`, `solid` |
| `Money` / `Influence` / `Amber` | coin / laurel / gem + tabular number; `signedValue`, `size` |
| `Meter` / `StatBar` | thin bar (`marks` for tick marks e.g. maturity 10%/50%, `ghost`), labelled stat bar |
| `EmptyState` | icon, title, text, action — every list needs one |
| `Hint` | contextual tip; hidden when Settings → Tips is off |
| `KV`, `Rule`, `SectionTitle` | key–value line, labelled divider, section header |
| `Stepper`, `Toggle`, `Field`, `Segmented` | form controls (each needs `id`) |
| `Tabs` | scrollable tablist with badges, arrow-key navigation |
| `Sheet` | bottom sheet on phones, centred dialog ≥ 720px; `title`, `label`, `footer`, `wide`, `sticky`; Escape closes |
| `ConfirmSheet` / `store.confirm()` | in-page confirm (browser dialogs are blocked where we host) |
| `ToastHost` | mounted once; use `store.toast` |
| `CreatureRow` | thumbnail, name, sex, species · phase · age, level, wild level, tameness, status chips (`statusChips()`); `onClick`, `selected`, `disabled` + `reason`, custom `right`/`sub` |
| `CreaturePicker` | multi-select (`max`), kind chips + species filter, `eligible(c) → reason|null` greys out with the reason |
| `GearPicker` | armory items for one slot, worth, who wears it, stat deltas vs current; `gearLineText(g)` |
| `ScreenHead` | back arrow when the stack allows, title, sub, actions |
| `formatChips(g, t)` (Arena) | event format pills: NvN, teams, level cap, hatchlings only, no harness, riders rule, beasts, bonus rounds, league, host, fee, prize |
| `LeaguePanel` / `CalendarPanel` (Arena) | league table with prizes and rounds (`compact` for side columns); upcoming events by week |
| `DefenseSheet` (Intrigue) | a rival scheme against you: `defensePromptText`, Assertive / Passive, the outcome |
| `ScenarioSheet` (Intrigue) | the night scene for a planned `IntrigueOrder`: scenario text and roll hint, Proceed / Retreat, report (raids open the battle viewer) |
| `TechOrderSheet` (ArenaPlay) | technique priority, saved with `setTechOrder` |
| `Req` (Influence) | met / unmet requirement line |
| `Icon` | inline SVG set (24px grid, stroke 1.75, currentColor) — see `ICONS` in `Icon.tsx`; `SexIcon` |

## 6. Art

- `DinoArt` — `creature` (or `species`/`colors`/`sex`/`maturity`/`seed`), `framing` full|bust, `width`,
  `flip`, `gear` hints `{ armor, helmet, rider, weapon }` (derived from `creature.gear` by default),
  `animate` (idle breathing; default on ≥120px), `dead` (grey), `fill` (young at full frame size), `scale`.
  Six ARK regions from `genes.colors`: 0 body, 1 underbelly, 2 pattern (seeded stripes/spots/bands/saddle,
  clipped to the body), 3 crest/frill/sail/horns, 4 back plates/spikes/feathers, 5 eyes & claws.
  Babies: bigger head and eyes, smaller body. Body plans live in `art/plans.ts` (one builder per
  `SpeciesDef.body` with species tweaks) on the helpers in `art/geom.ts` (`tube`, `blob`, `horn`, `plate`,
  `quill`). A plan lists far limbs, behind shapes (sails, far plates), body, belly, over shapes, near limbs,
  head (pivot, main, belly, over, eye, mouth, teeth) and anchors for gear overlays. Check new art at
  `#gallery`.
- `DinoThumb` — framed niche for lists. `EggArt` (speckles from the palette, cracks near hatching, frost/heat
  tint vs `lastTemp`), `Thermometer` (ideal band + marker), `ColorSwatches`, `EstateBanner` (night scene
  reflecting built buildings, full moon on Moon Frenzy weeks), `Portrait` (story actors, lanista).

## 7. Battle viewer

`<BattleViewer result onDone title? initialSpeed? playerSide? sideNames? autoplay? />` — pure
presentation of a `BattleResult`: HUD strip (HP from `log[i].hp`), sprites per side (side 1 flipped),
hit flash/shake, damage numbers, crit emphasis, KO slump, round counter, 1×/2×/4×, Step, Skip, full log with
auto-follow that pauses when the player scrolls up. Usually opened through `store.showBattle`.

## 7b. Arena, intrigue, influence, horde, ascension

- **Tournament day** (`screens/ArenaPlay.tsx`, screen `arenaPlay`, id = tournament id): intro card → loop
  `nextPlayerMatch` (always inside `act`: it resolves AI matches and fixes the AI's cheat) → preview (versus
  panel with `prepareFighter` loadouts, odds, "Bribed guards" / "Fair play expected") + preparation (per-slot
  harness override via `GearPicker`, instruction with GM yield/injury notes, technique order, one bribe with
  `cheatCost`/`cheatAvailable`, a bet with the Gambler) → `playMatch` → battle viewer → round report → pits:
  `bonusPending` and no pending bonus match ⇒ Keep fighting / Retire (`continueBonus`) → final report (prizes
  from the `»` log lines, fame/traits/league points against a snapshot taken when the day began, the bracket)
  → `store.finishWeek()`. Preparation and the snapshot live in module maps keyed by tournament id, so leaving
  the screen mid-tournament and coming back resumes. "Resolve automatically" (`autoResolve`) is always there.
- **Arena tab**: This week (format chips, registration, your fighters), Calendar (`upcoming`), League
  (`activeLeague` + `leagueStandings`, prizes per place), Organize sheet (The Organizer, 300 denarii).
- **Intrigue** (`intrigue`, `rival`): rivals by influence with spy-gated wealth (your committed spies > theirs)
  and keepers (> theirs / 2); the dossier spy-gates creature stats with the market table (age 1, STR 2,
  AGI 3, CUN 5, HP 7, traits 8+). House actions and creature actions show `chanceRange`; the agent sheet shows
  `intrigueChance` per agent (registered fighters sink to the bottom with a warning) → `planIntrigue` →
  `ScenarioSheet` (sticky until decided; undecided plans are listed on the Intrigue tab) → `resolveIntrigue`.
  Trade: `rivalAskingPrice`, `offerToRival` (wrapped so a refusal is shown in the sheet, not as an error toast).
- **Influence** (`influence`): standing and weekly gain (`influenceGain`), the tree from `treeFor` (path tabs
  on phones, three columns ≥ 900px), unlock/toggles/swaps, elections (`startElection`, `setElectionAction`,
  `projectedVotes`), the Ascension teaser.
- **Horde** (`horde`): `hordeIntel` gating, rogues, raid news, expedition setup (`expeditionPreview`) and the
  tactics cards when `storyData.expeditionTactics` is set (also a hub attention row).
- **Ascension** (`ascension`, pushed from Influence or the hub quick link): `ascensionProgress`, the 16 levels,
  the account's unlocked levels (`selectableAscension`), the champion and reincarnation.

## 8. Dev data, deep links, screenshots

- `devFixture.ts` builds a playable-looking GameState (week 14: pairs, eggs at risk, hatchlings with care
  requests, a real stud-request story, a real breeding event, rival offer, pedigree records). New Game falls
  back to it when `createNewGame` throws; such games show a **dev data** tag in the status bar.
- Deep links (dev only, slot 99 so real saves are never touched): `#dev/<screen>[/<tab or id>][/<tab>]`, e.g.
  `#dev/breeding/hatchery`, `#dev/dino/bred/genetics`, `#dev/results`, `#dev/battle`, `#dev/menu`,
  `#dev/arenaPlay[/<event key>]` (registers the best fighters and starts the day on the real engine; `pits`
  shrinks the bracket to reach the pit choice), `#dev/rival/first`, `#dev/horde/open`, `#dev/horde/tactics`,
  `#dev/defeated[/<reason>]`, `#dev/ascension`, `#dev/influence`. Dev data shares the account meta in this
  browser: achievements earned on it are real.
  `#gallery` renders every species, baby and gear overlay.
- `node scripts/ui-shot.mjs [names…] [--mobile|--desktop] [--dark|--light]` with `npx vite --port 5173`
  running; output in `$SHOT_DIR`. It also reports console errors and horizontal overflow.
- `node scripts/e2e.mjs [--weeks=7] [--desktop] [--light]`: a whole session on the real engine (new game,
  market, Rome's Finest with preparation and the battle viewer, the results chain, then more weeks with
  decisions, schemes, one intrigue action and an influence unlock when affordable). Exits 1 on any console
  error; screenshots in `$SHOT_DIR` (default `<tmp>/jl-e2e`).

## 9. Copy and patterns

- No emoji anywhere; icons come from `Icon`. Sentence case for UI text; display face for titles only.
- Every list has an empty state that says what fills it and how.
- Disabled actions carry the reason (pill, `title`, or `cb-reason` line) — mirror the engine's message.
- Prices and counts: `Money`, `.num`. Signed deltas: `signed()`.
- Locked content shows a lock icon and the upgrade/achievement it needs; tapping a locked market item
  opens Upgrades.
