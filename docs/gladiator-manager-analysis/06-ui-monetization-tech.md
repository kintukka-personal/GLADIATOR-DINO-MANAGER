# 06 — Screens and UX Flow, Monetization, Tech Stack, Online Features

Source: jadx decompilation of Gladiator Manager (Renegade Games) v3.16.2b, versionCode 898, minSdk 23 / targetSdk 36. Package `com.rene.gladiatormanager`, 533 game classes (about 120k decompiled lines). Everything below comes from reading the decompiled code, the manifest, the layouts and the string table. No backend identifiers, keys or endpoint URLs are reproduced here. Where jadx lost control flow (some `continue` branches in `UpgradesActivity`, for example), the behaviour is inferred and marked as such.

---

## 1. Screens and UX flow

### 1.1 Overall structure

- **76 activities** are registered in the manifest and every one is in the game package. All of them are locked to `sensorLandscape`. 20 use dialog themes (`GmDialog`, `GmDialogSticky`, `GmSimpleDialog`, `GmSimpleLightDialog`) and float over the screen beneath them as modal pop-ups.
- **7 fragments** are all tabs of the gladiator detail screen.
- Shared base classes:
  - `BaseActivity` / `BaseFragmentActivity` apply the custom pixel font to the whole view tree (`overrideFonts`), handle immersive full-screen, and suppress transition animations when the player has turned them off.
  - `BackActivity` adds a back button and a context "?" button that opens the wiki.
  - `MenuActivity` adds the persistent bottom navigation bar: **Ludus, Market, Arena, Intrigue, Menu**.
  - `StateActivity` / `StateMenuActivity` load the save state in an `AsyncTask` and then call `render()`.
- A persistent **top menu** (`topmenu.xml`) on the hub has **Objectives, Messages, Events, Finance, Influence, Estate (Construction), Uprising (when active), Advance**.
- Navigation is a deep stack of activities rather than a single-activity or fragment design. Each sub-area is its own screen, and dialog-styled activities handle selections such as gear, tactics, bribes, bets and agents.

### 1.2 Navigation map (player perspective)

```
Launcher -> MainActivity (main menu)
  |- Play ------------> SaveSlotActivity (3 slots, 5 with upgrade; toggle to 5 multiplayer slots)
  |                       |- empty slot -> NewGame (name, story intro panel, Advanced settings)
  |                       |                 -> HeritageActivity (Roman / Punic / Celtic / Greek* / Egyptian*, portrait incl. female)
  |                       |                 -> OverviewActivity (normal)   | AscensionActivity (ascension run)
  |                       |                 -> GladiatorEditorActivity (sandbox start)
  |                       |                 -> MultiplayerGameActivity (lobby, if multiplayer)
  |                       |- used slot  -> OverviewActivity (continue)  /  cloud status dialog / delete
  |- Upgrades ---------> UpgradesActivity (tab Upgrades) -> UpgradeInfoActivity (unlock) ; PurchasesActivity (gems IAP)
  |- Achievements -----> UpgradesActivity (tab Achievements) -> UpgradeInfoActivity (details)
  |- Login (Google) / Highscores (when signed in) -> HighscoresActivity
  |- Friends (when signed in) -> FriendsActivity
  |- Settings dialog (music, sound, tooltips, hints, fullscreen, transitions, language, wiki, community link, credits, editor)
  |- Wiki -----------> WikiActivity (also deep-linkable via a custom gm://wiki/<page> scheme)
  '- Gladiator Editor (if unlocked) -> GladiatorEditorActivity -> TraitEditorActivity

OverviewActivity (hub: animated estate, week counter, tips) 
  bottom bar: Ludus  -> LudusActivity -> Gladiators / Training / Forge / Armory
              Market -> Market -> SlaveMarketActivity (gladiators, beasts) / GoodsMarketActivity (weapons, equipment, items, mounts)
              Arena  -> ColosseumActivity -> TournamentDetailsActivity -> TournamentGladiatorSelectionActivity
              Intrigue -> IntrigueActivity -> DominusDetailsActivity (rival) -> AgentSelectionActivity
              Menu (dialog: save & exit, about, close)
  top bar:    Objectives, Messages(->MessageDetails->Offer), Events(->League / OrganizeTournament),
              Finance (slaves/loans), Influence(->OpportunityInfo/Elections/Ascension), Estate (Construction),
              Uprising (->Expedition), Advance
```

### 1.3 Screen catalogue

| Area | Screen (class) | Purpose |
|---|---|---|
| Boot / menu | `MainActivity` | Main menu: Play, Upgrades (with gem counter), Achievements, Login or Highscores, Friends, Settings, Wiki, Gladiator Editor (only once unlocked). Silent Google sign-in, build label, account merge on load. |
| | `AboutActivity` | Credits (see section 4). |
| | `SaveSlotActivity` | Save slots with lanista portrait, mode tags (Nightmare / Hard / Sandbox / Ascension N / Multiplayer), season, week. Start, continue, delete. Shows cloud-backup status and offers a retry. A toggle switches to the multiplayer slots and invitations. |
| New game | `NewGame` | Two panels: a story intro, then a name field (max 16 characters, with reserved names such as "Spartacus", "Batiatus", "Caesar"). Advanced settings toggle **Sandbox**, **Ascension**, **Hard**, **Nightmare** and **Cloud sync**. Multiplayer hosts get a friend-invite picker. |
| | `HeritageActivity`, `AdvancedInfoActivity` | Choose heritage and portrait (Roman has a male and a female portrait). Greek and Egyptian are greyed out until bought. |
| | `AscensionActivity`, `ReincarnatedSelectionActivity` | Start an ascension run and choose which champion (or beast, with an upgrade) reincarnates. |
| Hub | `OverviewActivity` | The main hub. Animated estate scene that reflects construction, sky backdrop by time of day, week number, ascension or multiplayer bookmark, story button. Rotating contextual tooltip nudges such as "Click here to wrap up this week", "Consider increasing security" and "Market now sells mounts!". Holds the week-advance logic. |
| Ludus | `LudusActivity` | Sub-hub for Gladiators, Training, Forge and Armory. |
| | `GladiatorsActivity` | Roster of gladiators and beasts, plus a link to the Tomb. |
| | `GladiatorDetailsActivityRevisited` + fragments `Details`, `Techniques`, `Traits`, `Heritage` (age/origin), `Equipment`, `Class` | Full gladiator sheet: stats, loyalty, injuries, technique loadout, traits, age effects, outfit and set bonuses, class proficiency. Leads to `BonusSelectionActivity` (pick one of three bonuses), `TechniqueDetailsActivity`, `TacticsActivity` and `DialogActivity`. |
| | `DialogActivity` | Gladiator management dialog: rename or nickname, favourite, adopt, sell, convert to slave, surgery, repair or reforge an heirloom, beast treats, send to Delphi, auto-manage. |
| | `TrainingActivity`, `DoctoreSelectionActivity` | Training intensity (light, standard, heavy, technique, bestiary), assign a doctore, sparring matches, hire specialised trainers (weapons master, Spartan trainer, bestiarii). |
| | `ForgeActivity`, `ArmoryActivity`, `GearSelectionActivity` | Blacksmith crafting and upgrading. Armory inventory shown as "swipe wheel" carousels. |
| | `TombActivity` | Dead gladiators. Resurrection is possible with the Temple of Pluto. |
| Market | `Market`, `SlaveMarketActivity`, `GoodsMarketActivity`, `AuctionActivity`, `OfferActivity` | Buy gladiators and beasts (with a "poke the merchant" Easter egg: tap him 15 times for a 10-denarii discount), weapons, equipment, items and mounts. An art-collector auction event. Buy or sell offers, including to online players. Locked premium gear shows a lock icon, and tapping buy opens the Upgrades screen. |
| Arena | `ColosseumActivity` | List of the week's tournaments as illustrated "cards": Luna, Sol, Jupiter, Bacchus, Annum, Pankration, Ascension, Hyperion, Prophecy, Online Bronze/Silver/Gold/Diamond. |
| | `TournamentDetailsActivity`, `TournamentGladiatorSelectionActivity` | Rules and rewards, register gladiators, let the doctore attend, pay an arbiter. Upgrade-locked leagues (Bacchus, Vulcan) redirect to Upgrades. |
| | `TournamentBattleActivity` | Pre-fight hub for each round: matchup, difficulty label, gear choice, `TacticsActivity` (technique order, Tactician upgrade), `TournamentGladiatorInstructionActivity` (kill / avoid injury / throw, Instructions upgrade), `BribeActivity` (chains, poison, swap guards, release a beast), `BettingDetailsActivity`. |
| | `BattleReportActivity`, `BattleCombatantDetailsActivity` | Animated fight with a scrolling battle log. "Tap anywhere to continue" or skip to the end. |
| | `TournamentReportActivity`, `TournamentOtherRoundsActivity`, `TournamentFinalReportActivity` | Round results, bet payouts, other brackets, and the final prizes, fame and special drops. Week resolution is triggered from here. |
| Week results | `ResultActivity`, `LeagueResultActivity` | Chained result pages: elections, league conclusion, plague, artifact story, escape attempts. |
| | `WeekReportActivity` | Weekly ludus report and "herald" news, plus Hall of Fame induction. Pushes highscores. Leads on to the Intrigue report, Decisions and Adventures. |
| | `DecisionActivity`, `EventBattleReportActivity`, `AdventureActivity` | Random narrative events with choices and consequences, story battles, quests. |
| | `StoryActivity` | Chat-style storyline conversations with portrait tiles, typewriter text, blip sounds and answer options. |
| Intrigue | `IntrigueActivity`, `DominusDetailsActivity`, `AgentSelectionActivity`, `IntrigueReportActivity` | View rival lanistae (alliance, persuade, poison, assassinate). Pick an agent gladiator for persuade, poison, raid, sabotage or steal. Watch an animated night-time infiltration. |
| Estate / politics | `ConstructionActivity` | Buildings in Capua, Ariminum and Rome (the Rome mansion requires an upgrade). Locked buildings redirect to Upgrades. |
| | `FinancesActivity` | Assign slaves to mining, entertainment, security or spying. Income overview, loans. |
| | `InfluenceActivity`, `OpportunityInfoActivity`, `ElectionsActivity` | Influence opportunity tree (the Senator branch is behind an upgrade), senate and consul campaigns, entry to Ascension. |
| | `UprisingActivity`, `ExpeditionActivity` | Spartacus-style servile revolt and military expeditions. |
| | `EventsActivity`, `LeagueActivity`, `OrganizeTournamentActivity` | Events and rankings, league table, host your own tournament. |
| | `ObjectivesActivity` | "Getting started (1/6...6/6)" guidance chain, other objectives, ascension, prophecy, senator and Spartacus milestones. |
| | `MessageActivity`, `MessageDetailsActivity` | Inbox for NPC letters (Magistrate Septus and others), transfer offers, sell and buy requests. |
| | `DefeatedActivity` | Game over. Reasons are debt pile-up, slave betrayal, surrender, raid or slave attack. Shows weeks survived and influence gathered. |
| Online | `HighscoresActivity`, `FriendsActivity`, `MultiplayerGameActivity` | See section 3.4. |
| Meta | `UpgradesActivity`, `UpgradeInfoActivity`, `PurchasesActivity` | See section 2. |
| Tools | `GladiatorEditorActivity`, `TraitEditorActivity` | Paid custom-gladiator creator and its trait picker (see section 3.7). |
| Help | `WikiActivity`, `InfoActivity`, `InfoLightActivity`, `RedesignInfoActivity`, `TechniqueActivity` | Wiki pages and contextual info pop-ups. |

### 1.4 The week loop from the player's side

1. **Plan the week on the Overview hub.** Buy gladiators and gear, set training, register for tournaments, assign slaves, build, spend influence, plan intrigue and answer messages. Tooltips point to pending opportunities.
2. **Press Advance.** On the first week this also completes guidance step 5. The press does several things:
   - If the game is cloud-synced, it queues a backup.
   - It throttles a sync of achievements to the cloud (at most once every 2 minutes).
   - If you registered for a tournament, it goes to `TournamentBattleActivity`.
   - Otherwise, before week 50, if any healthy gladiator could still enter a tournament this week, it opens the Colosseum as a reminder.
   - With no tournament, it goes straight to the final report.
3. **Tournament rounds.** For each round, prepare (gear, tactics, instructions, bribe, bet), watch the animated battle, then read the round report. Other brackets resolve, then the final report shows the prizes.
4. **Week resolution** (`WeekResolver`):
   - AI rivals progress.
   - Random decisions and events are seeded.
   - Legal funding may arrive.
   - Story hooks fire (for example the Tomb of the Pharaoh, if Egyptian Ancestry is owned).
   - Achievements are checked.
   - Next week's tournaments are seeded.
   - With about a 25% chance per week after week 3, in normal online games only, a **Legends tournament** is generated from other players' Hall-of-Fame gladiators.
5. **Result chain.** Elections, then league results, then plague, then artifacts, then escapees, then the Week Report. The Week Report can lead on to the Intrigue report (animated), Decision screens (which may chain into an auction or a story battle) and Adventures.
6. **Back to the Overview** for the next week. Storylines appear through the story button and pop-ups.

**Multiplayer variant.** Every player acts at the same time. Pressing Advance marks you "ready". When everyone is ready, the host resolves the shared tournaments and the week and uploads the result. The other clients see the newer host state through real-time listeners and resolve their own player week locally.

### 1.5 Onboarding and tutorial

- **Week-1 welcome.** A dialog appears on the first visit to the hub, plus a "Welcome to Capua!" letter from *Magistrate Septus*. Separate letters announce Hard, Nightmare or custom settings.
- **Guidance quest chain.** "Getting started 1/6 to 6/6" in Objectives:
  1. Buy a gladiator.
  2. Pick a technique.
  3. Buy a weapon.
  4. Register for a tournament.
  5. Advance the week.
  6. Open finances and recruit a worker.
- Completing the whole chain unlocks the **Student** achievement (50 gems), which in turn makes the *More Save Slots* and *Cestarii* upgrades available.
- **Market guidance.** Highlights on the first market items in weeks 1–2 (`tutorialStep` 3–5) and a first-tournament hint in the Colosseum ("a good first tournament").
- **Contextual tooltip bubbles.** A custom `ViewTooltip`/`TooltipManager` shows about 18 rotating tips on the hub plus tips on other screens. They can be turned off in Settings ("Tooltips").
- **Hints.** An optional setting, off by default. `HintFactory` shows a random hint dialog at startup from 12 hint types: initiative reach, spies, technique attributes, rebels, gladiators are mortal, roguelite, low opinion, random events, avoid battles, cooldowns, beast treats, age and stat explanation.
- **TapTargetView (getkeepsafe).** The library is bundled and wrapped in `common/Tutorial.java` (styled spotlight sequences), but **nothing calls it** in this build. It is a leftover from an older coach-mark tutorial.
- **In-game wiki** (`WikiActivity` + `WikiFactory`). 14 pages of rich text with internal links in a custom `gm://wiki/<page>` scheme, which is also exposed as an exported deep-link intent filter:

  | Page | Content |
  |---|---|
  | Main | Intro |
  | Quickstart | Start with gold, buy a gladiator and weapons, buy slaves early, build facilities |
  | Tips & Tricks | Technique and weapon synergy, cheat and bribe early, mine early |
  | Ludus | |
  | Estate | |
  | Gladiator | |
  | Gladiator Class | |
  | Strength | |
  | Initiative | |
  | Cunning | |
  | Health | |
  | Slaves | Mining, Entertainment, Security, Spying |
  | Ascension | |
  | Heritage | |

  Many screens have a "?" that opens the matching page.

### 1.6 Animation

All animation is **frame-by-frame pixel art**. At runtime, `DrawableLayerGenerator` composites layers (body, head/appearance, weapon/armor variant, effects) into `ARGB_4444` bitmaps and builds `AnimationDrawable`s from them. The low bit depth suggests the developer was saving memory.

- **Battles** (`BattleAnimationHandler` and `BattleAnimationActor`):
  - There are **85 animation types**:
    - Every weapon style (sword, sword and shield, spear, spear and shield, axe, axe and shield, dual sword, dual axe, sword and axe, fist, whip, whip and knife, bow, javelin), each crossed with armor skins (leather, cuirass, linthorax, segmentata, "Alexander").
    - Mounted riders: horseman (grey, white, spectral, spear variants), elephant rider, gryphon rider.
    - Beasts: lion, bear, wolf, dire wolf, crocodile, rhino (incl. white), elephant, gorilla.
    - Mythical foes: harpy, minotaur, medusa, cyclops, hydra (spawns heads), manticore (fireball), gryphon, mandrake, wraith, werewolf (transformation), mummy.
    - Others: bandit, guard, kid gladiator, "dark" variants.
  - States per actor: entrance, idle, attack, off-hand attack, mount attack, special attack, fireball, impact, execution, knockout, yield, death, net deploy. Full-screen thunder and hurricane impact effects appear for divine techniques.
  - The animation is driven by the battle log. Each log line triggers actor animations and a sound on a background thread: about 300 ms per action, 100 ms for quick attacks and Hail of Arrows, 15–20 ms in fast-forward. Scrolling the log pauses auto-follow. The player can tap to skip to the end.
- **Intrigue** (`IntrigueAnimationHandler`). The chosen agent sneaks across a night scene toward a guard. A rejected attempt makes him retreat; a successful one plays the proceed animation. Night ambience plays underneath, and fast-forward is supported.
- **Estate** (`ConstructionAnimation`). An animated encampment with left and right building clusters that change with construction levels and location. The lanista figure differs for female lanistae. Overview sky backdrops come in sunrise, noon and sunset variants plus a 12-frame backdrop animation.
- **Portraits.** `YoungBloodAnimation` idle loops appear in save slots, messages, gladiator details and the uprising screen. `MarketAnimation` provides idle loops for market gladiators (standard, alt, dark, barbarian, rhino).
- **Screen transitions** use standard activity transitions and can be turned off in Settings ("Transitions", which effectively works as reduce-motion).

### 1.7 Sound and music

- **Music** (`MusicHandler`, `MediaPlayer`):
  - The main menu plays an intro theme: *Gates of Assyria* part 1.
  - In-game, a two-track playlist plays once: a "relaxing Roman" track (credited music includes *Aetas Romana* by Adrian von Ziegler), then *Gates of Assyria* part 2.
  - Menu music fades into game music in 8 steps of 250 ms.
  - Music pauses when the app goes to the background (`AppLifecycleObserver`).
  - It can be toggled in Settings.
- **UI sound effects** (`UiSoundHandler`, `SoundPool`): press, back, tab, pop, switch on and off, level up, cost (coin), disabled, new week, forged (anvil), tournament start (drums), achievement and upgrade unlocked (harp).
- **Battle sound effects** (`BattleSoundHandler`): sword hits on flesh, armor and shield (two variants each), miss swoosh, parry, block, chop, bite, grunts, knockout (human and beast), death, critical axe hit, disarm, whip crack, thunderclap, transformation roar. Crowd cheering plays on wins, and large-crowd chatter runs as arena ambience.
- **Intrigue**: a night ambience loop. There is also a marching and yelling ambience type.
- **Story**: retro "typewriter" text blips (three variants).
- 53 raw audio files in total, in OGG and MP3.

### 1.8 Art style

- **Hand-made pixel art** throughout, by artist Sim Kaart. About 3,400 PNG drawables, mostly tiny native sprites (32×32, 47×50, 64×64, 72×72 are the most common sizes). They are scaled up with nearest-neighbour filtering: `PixelImageView`, `ClickablePixelImageView` and `setFilterBitmap(false)` appear everywhere.
- Gladiator looks are **combinatorial**. There are about 84 head/appearance sprites (`gladiator_head_*`), and body, weapon and armor frames are layered on top. Each weapon-and-armor combination has its own 11–27 frame sprite set.
- The UI uses a **parchment and paper skin**: `paper_*` tabs, buttons and cards, plus illustrated tournament cards, upgrade cards and achievement cards with medal and laurel icons.
- **Pixel and bitmap fonts**: NeueBit Bold, Mondwest Bold and TickerBit (pixel fonts), and Celtic Time for decorative titles.
- Drawable names are **not obfuscated** in this build (for example `gladiator_1_defeated`, `roman_heritage_female`, `upgrades_iap_card_chest`).

---

## 2. Monetization

### 2.1 Model summary

| Aspect | Finding |
|---|---|
| Business model | Free to play with a **single premium currency, Gems**. Gems buy permanent, account-wide **Upgrades** (content unlocks). |
| IAP products | Two **consumable** one-time products (Play Billing type `inapp`): **`gems_small` = "Pouch of gems", 500 gems** and **`gems_large` = "Chest of gems", 1,500 gems**. Prices come live from the store. The App Store lists $3.99 and $7.99. |
| Value per dollar | Pouch: 125 gems/$. Chest: about 188 gems/$, which is **50% better value**. |
| Subscriptions | **None.** Only the `inapp` product type is queried. |
| Ads | **None.** No ad SDK is present (no AdMob, Unity, AppLovin and so on). The `AD_ID` / AdServices attribution permissions and `ga_ad_services_config` come bundled with Firebase / Google Analytics. |
| Energy, timers, gacha | None. No stamina, no loot boxes, no rerolls for money. Gems cannot be turned into in-game denarii. |
| Free gem source | **Achievements only.** Each of the 65 achievements grants 50 or 100 gems. There are no daily rewards, login bonuses or ad rewards. |
| Persistence | Upgrades are stored in the per-account achievement record (local plus cloud when signed in). Players who never sign in keep them only on the device. |
| Developer tone | The purchase button has a tooltip "Toss a coin to your dev!". The Upgrades intro says: "The gems used to unlock these upgrades are earned by completing achievements or by purchasing them." |

### 2.2 How the gem ledger works

- `currentGems = Σ(gems of unlocked achievements) + boughtGems − Σ(current price of owned upgrades)`.
  - The balance is **recomputed** every time rather than stored, so a price change to an upgrade retroactively changes the balance.
  - If the balance drops below 0, the Upgrades screen shows a **Refund** button. It clears every owned upgrade so the gems can be re-spent.
- **Purchase flow.**
  1. The player taps a product card (pixel art pouch or chest) and Play Billing runs, with pending purchases enabled.
  2. When the purchase state is *purchased*, the client:
     - consumes the purchase immediately,
     - records the token so the same purchase cannot be credited twice,
     - adds 500 or 1,500 to `boughtGems`,
     - uploads a purchase record (token, order, SKU, state, time, account) to the backend,
     - re-saves the achievement record and shows "Purchase confirmed / Gems added".
  3. On every visit to the store screen, unconsumed purchases are re-processed.
  - No server-side receipt validation is visible in the client. Crediting appears to be client-trusted.
- **Account merge** on the main menu: the union of achievements, the union of upgrades, the maximum of `boughtGems`, and the maximum ascension levels. The cloud copy therefore restores purchases on a new device for signed-in users.

### 2.3 Every Upgrade (56 total, 7,650 gems for everything)

Prerequisites: **Parent** = another upgrade must be owned first. **Locked by** = an achievement must be earned first. In both cases the card is presumably hidden until the condition is met (jadx dropped part of this branch). *Cloud Synchronization* only appears when the player is signed in.

#### Gladiator (9 upgrades, 950 gems)

| Upgrade (display name) | Gems | Prerequisite | Unlocks |
|---|---:|---|---|
| Weapons Master | 100 | – | Hire a specialised weapons trainer. Weapon specialisation grants a damage bonus. |
| Rally Technique | 100 | – | Rally: the team ignores some damage and one negative effect for 2 rounds. |
| Disarm Technique | 100 | – | A cunning-based disarm technique. |
| The Great Spiculus | 100 | – | The legendary champion Spiculus can appear in tournaments. Defeat him and he joins the winner. |
| Sneak Attack Technique | 100 | Locked by *Et tu Domine?* (assassinate or poison a rival gladiator) | A beast technique: big damage against impaired fighters, then extra dodge. |
| Hail of Arrows | 100 | Locked by *Adventurer* | **Sagittarius class** (bow), Hail of Arrows technique, marksman training event, mythical-bow quest. |
| Cestarii | 150 | Locked by *Student* | **Cestarius class** (fists), a fist tournament type, a rare fist technique. |
| Thunder Strike | 100 | Locked by *Favoured by the Gods* | A technique that scales with divine favour. Also gates the Lightning Bottle item. |
| Lorarii | 100 | Locked by *Influencer* | **Lorarius class** (whip). |

#### General (16 upgrades, 2,550 gems)

| Upgrade | Gems | Prerequisite | Unlocks |
|---|---:|---|---|
| Senator Influence Tree | 250 | – | The whole Senator branch of the influence-opportunity tree, including the elections path. |
| Hard Mode | 300 | – | A Hard difficulty option at new game. Leaderboard score ×1.5 and extra hard-mode achievements. |
| Nightmare Mode | 200 | Parent: Hard Mode. Locked by *Divine (hard)* | Nightmare difficulty. Score ×3 and extra achievements. |
| Auto Manage By Doctore | 200 | – | Chosen gladiators level up automatically according to their class. |
| Release Arena Beast | 100 | – | A bribe option that releases a wolf or lion on the opponent. |
| Rhinoceros | 150 | – | Rhinos in the market and through events. |
| War Elephants | 250 | – | Elephants as beasts or as mounts. |
| Cloud Synchronization | 50 | Must be signed in | Sync **one** new game to the cloud (beta). |
| Ascendancy | 100 | Locked by *Ascension* | Reincarnated champion keeps an extra trait and gains early loyalty. |
| **Greek Heritage** | **150** | – | Greek lanista: starts with a Hoplon, and gladiators learn traits faster. |
| **Egyptian Ancestry** | **200** | Parent: Greek Heritage | Egyptian heritage (portrait is female) plus the Tomb of the Pharaoh quest line. |
| Gladiator Editor | 200 | Locked by *People manager* | Design a custom gladiator who shows up in your games (see section 3.7). |
| Instructions | 100 | – | Pre-battle instructions: mortally wound, avoid injury, or lose on purpose. |
| More Save Slots | 50 | Locked by *Student* | 3 to 5 save slots. |
| Tactician | 100 | – | Set the order in which techniques are used. |
| Undying Loyalty | 150 | Locked by *Divine* | Reincarnate a **beast** into new ascension levels. |

#### Events (12 upgrades, 1,750 gems)

| Upgrade | Gems | Prerequisite | Unlocks |
|---|---:|---|---|
| Traveling Merchant | 100 | – | A periodic exotic merchant visit. |
| Legends of Mars Tournament | 150 | – | A grand tournament whose prize is the Sword of Mars (Attila). |
| The Lost Blade | 150 | – | A Britannia event chain for Caesar's sword Crocea Mors. |
| Axe Of The Founder | 150 | – | An epic event chain for Romulus' axe. |
| League of Bacchus | 150 | – | The Bacchus league. Locked league tournaments redirect to Upgrades. |
| Vulcan League | 150 | – | The Vulcanalia league, with a divine cuirass as reward. |
| Carthaginian Artifacts | 150 | – | Carthaginian helmets in the market plus the Ksour Essef cuirass storyline. |
| Hannibal's Legacy | 150 | Parent: Carthaginian Artifacts | Hannibal relic challenges. |
| Legacy of Alexander | 150 | – | Linthorax armor plus an "Alexander's armor" quest chain. |
| Legendary Pit Fights | 100 | Locked by *Giantslayer* | Legendary figures in the underground pits. |
| Spartan Dynasty | 200 | Parent: Hoplon Shield | Spartan events, a special gladiator, the Impale technique, a new trait, Greaves. |
| Restoration Of Troy | 150 | Locked by *Giantslayer* | A Troy adventure and tournament with Trojan relics. |

#### Equipment (12 upgrades, 1,300 gems)

| Upgrade | Gems | Prerequisite | Unlocks |
|---|---:|---|---|
| Champion Helmet | 100 | – | A family heirloom helmet, wearable only by an adopted gladiator. |
| Spatha Weapons | 100 | – | Spatha longswords. |
| Parazonium Weapons | 50 | – | Parazonium daggers. |
| Sica Weapons | 100 | – | Sica curved swords. |
| Hoplon Shield | 100 | – | Hoplon shields, plus hints about Leonidas' shield. |
| Leather Armor | 100 | – | Leather armor in the market and forge. |
| Gallic Helmet | 50 | – | Gallic helmets. |
| Segmentata & Galea | 150 | – | Legionary armor and helmet. |
| Celtic War Horses | 200 | – | Celtic horses plus the legendary horse Enbarr event. |
| Celtiberian Weaponry | 100 | – | Falcata sword and Caetra shield. |
| Ascended Weaponry | 150 | Locked by *Ascension* | Start each ascension with a special broken weapon. |
| Cataphracts | 100 | – | Cataphract armor. |

#### Buildings (7 upgrades, 1,100 gems)

| Upgrade | Gems | Prerequisite | Unlocks |
|---|---:|---|---|
| Temple of Pluto | 150 | – | A temple building with bonuses and Pluto's favour, which enables resurrection in the Tomb. |
| Master Smith | 150 | – | Blacksmith level 2: better forging and improving existing gear. |
| Supreme Armory | 150 | Parent: Master Smith | Blacksmith final level: master-crafted gear and augments. |
| Aqueduct | 150 | Locked by *Builder* | An Aqueduct construction in Ariminum. |
| Athenian Artifacts | 200 | – | Pericles' helmet mystery, a private library, and the Corinthian helmet in the forge and market. |
| Tinkerers Workshop | 150 | Locked by *Apprentice* | A workshop that crafts rare combat items. |
| All roads lead to Rome | 150 | Locked by *Builder* | A Rome mansion estate location with influence buildings. |

### 2.4 Premium gating of heritages, gear and classes

- **Heritages.** Roman, Punic and Celtic are free. **Greek costs 150 gems** (this matches the review the brief cites). **Egyptian costs 200 more and needs Greek first**, so both together cost 350 gems.
  - Each heritage starts with one signature item even when that item's upgrade is not owned: Roman a galerus, Punic a Carthaginian helmet (plus +100 denarii and a mining bonus), Celtic a Gallic helmet (plus training effectiveness), Greek a Hoplon, Egyptian a linthorax. The market will not sell more of these items without the upgrade.
- **Gear locked behind upgrades** (`isUnlocked` checks):
  - Weapons: Falcata (Celtiberian), Spatha, Sica, Parazonium.
  - Equipment: Corinthian helmet, Cataphract armor, Caetra shield, Linthorax, Carthaginian helmet, Hoplon, Leather armor, Gallic helmet, Segmentata and Galea.
  - Mounts: Celtic horses.
  - Items: Greaves (Spartan Dynasty), Lightning Bottle (Thunder Strike).
- **Classes** behind upgrades: Sagittarius (bow), Cestarius (fist), Lorarius (whip).
- **Beasts** behind upgrades: rhino, elephant.
- **Upsell surfaces.**
  - Lock icons on market items: buying a locked item opens Upgrades.
  - Locked league tournaments and locked buildings open Upgrades.
  - A "You can unlock this opportunity in the upgrades from main menu" note on locked influence nodes.
  - An "Upgrade available!" tooltip on the main menu when the player can afford one.
  - A gem counter on the main menu.

### 2.5 Free-to-play gem ceiling (achievements)

| Achievements | Count | Gems |
|---|---:|---:|
| All defined | 65 | 5,900 |
| Visible in the list (not secret) | 46 | 4,150 |
| Secret / hidden until earned | 19 | 1,750 |
| Legacy, no longer earnable (Beta Champion, Season 1–5 Champion, Bug Hunter) | 7 | 700 |

- Most achievements are worth 100 gems; 12 are worth 50 (for example Champion of the arena, Adventurer, Apprentice, Student, Decanus, the Silver/Gold/Diamond Legend set, and the hard and nightmare tournament or adventure variants).
- Many need hard or nightmare mode, ascension level 10, or competitive online results: the Season 6 top-10 leaderboard, Legends tournaments and a multiplayer win.
- **Implication.** Even a perfect free player tops out at about **5,200 gems**, which is about **2,450 short** of the full 7,650-gem catalogue.
  - A realistic completionist needs at least **2 chests, or a chest plus 2 pouches**, about **$16**.
  - Buying the whole catalogue from zero costs about 5.1 chests, about **$41**.
  - A typical 100–150 gem upgrade costs about $0.53–0.80 at chest rates.
- Achievements can also unlock **premium-locked upgrades** (lockedBy). This intertwines progression and monetization: gems earned from playing pay for content the play itself has made available.

---

## 3. Tech stack and online features

### 3.1 Language and architecture

- **Java.** The game code has no Kotlin metadata. The Kotlin stdlib and coroutines are present only as transitive dependencies of AndroidX and Firebase.
- **Classic Android Views** with XML layouts (about 215, including library layouts) and many views built in code (upgrade cards, purchase cards). There are layout variants for `h400dp`, `sw600dp` and `w640dp`.
- **Concurrency**: `AsyncTask` state loaders (a deprecated API), raw threads with `SystemClock.sleep` to pace animations, `runOnUiThread`, and a single-thread scheduled executor for cloud backup.
- **State.** One global `GladiatorApp` (`Application`) holds three per-slot objects:
  - `Player` (the lanista, gladiators, inventory, messages, objectives),
  - `World` (week, markets, tournaments, leagues, laws, flags such as sandbox, hard and nightmare),
  - `OpponentData` (AI rival lanistae, online opponents, invaders).

  An account-level `AchievementData` sits alongside them. The simulation is fully client-side and deterministic per device; `Seed` generates the starting content.

### 3.2 Libraries

| Library | Version | Use |
|---|---|---|
| Google Play Billing | 8.0.0 | Gem IAPs, pending purchases. |
| Firebase Auth (+ Play Services Auth 20.7.0, GoogleId, Credentials, reCAPTCHA) | 23.0.0 | Google sign-in through the legacy `GoogleSignIn` client and an ID token exchanged for a Firebase credential. Silent sign-in on the main menu. There is **no sign-out** option in the UI. |
| Cloud Firestore (+ gRPC, protobuf-lite) | bundled | The entire online backend (section 3.4). |
| Firebase / Google Analytics | 22.0.0 | Automatic collection plus **exactly one** custom event: `select_content` when the language changes. No user properties, no funnels, no purchase events are coded (Analytics auto-collects in-app purchases). |
| Play Games Services v2 | 21.0.0 | **Bundled but unused.** Its init provider is in the manifest, but no game code calls Games APIs. All leaderboards and achievements are custom. |
| Play Integrity | 1.2.0 | Present as a dependency. The game code does not call it. |
| play-services-location / places | 19.0.0 / 17.0.0 | Transitive only. No location permission is declared. |
| Gson | – | JSON serialization of saves and DTOs, with custom polymorphic adapters for Technique, InfluenceAction, Message, Choice and Inventory. |
| Google Flexbox, Material Components, AndroidX (AppCompat, RecyclerView, ViewPager, ConstraintLayout, CardView, Lifecycle, ProfileInstaller, Emoji2) | – | UI. |
| TapTargetView (getkeepsafe) | – | Coach marks. Wrapped but unused (section 1.5). |
| Toasty (GrenderG) | 1.5.0 | Custom achievement toasts with a laurel icon. |

### 3.3 Saves and cloud saves

- **Local saves.**
  - Each slot is stored as three JSON strings in their own `SharedPreferences` files (player, world, opponents). Slots 1–5 are single-player and slots 11–15 are multiplayer.
  - The account record (achievements, upgrades, friends, settings, purchase tokens, ascension levels, the custom gladiator, the favourite name) is stored per login ID.
  - `android:allowBackup="true"`, so Android Auto Backup can carry these preferences across devices.
- **Cloud Synchronization** (a 50-gem upgrade, beta, signed-in players only).
  - Only **one** game can be synced at a time, and only when it is created.
  - A snapshot is queued every time the player presses **Advance**.
  - Disabling sync removes the game from cloud storage and frees the sync slot for a new game.
  - Loading resolves conflicts by **latest week wins**: the cloud copy replaces the local slot if it has a higher week.
- **`CloudSaveQueue` (offline-first)** is a well-built component:
  - Entries are persisted as JSON with `AtomicFile` in the app's *no-backup* directory (8 MB cap per file).
  - It deduplicates by SHA-256 fingerprint and never re-uploads an unchanged state.
  - It runs one upload at a time and retries with exponential backoff: 30 s doubling up to 15 min, capped after 6 failures.
  - It tells rejections apart from retryable errors and pauses or resumes when the signed-in account changes.
  - It reports a status for the save-slot UI: *Backup pending, Cloud sync on / saved, Backup failed* (with Retry), *Backup too large, local error, disabled*.
  - Payloads above about **1 MB** are refused (the per-document limit), so very long games eventually stop backing up.
- **Retention** (`SavedGameExpiry`). An expiry timestamp is written for backend clean-up: **3 years** after the last update for synced games, and **30 months** for unsynced ones. Unsynced saves from seasons 4 and earlier expire immediately.

### 3.4 Online backend (Firestore) and what is stored

| Data set | Content | Used for |
|---|---|---|
| Seasonal highscores (current season 6; season 5 kept as "previous") | Lanista name, **Imperium** = influence × mode multiplier (×1 normal, ×1.5 hard, ×3 nightmare), raw influence, week, alive or defeated reason, hard/nightmare flags, ascension level, app version | Global top list, "your scores", "friend scores". Sent from the weekly report (every other week after week 3 when influence ≥ 10, and on other weekly paths; jadx garbled this control flow). Never sent from custom or sandbox games. **Season 6 Champion** goes to the top 10. |
| Hall of Fame (seasonal) | A full snapshot of the player's most famous gladiator: stats, level, age, fame, wins, class, origin, techniques and levels, traits, appearance, weapon, off-hand, armor, helmet, item, weapon proficiencies, ascension and reincarnation, **champion tier** (Bronze, Silver, Gold, Diamond), lanista name and portrait. Inducted once fame exceeds 10 (after week 2). Re-uploaded with about a 25% chance each week. | Highscores "Gladiators" tab, **Challenge** duels, and **Legends tournaments** in other players' games. |
| Ascension scores | Ascension and prophecy levels per mode, week, influence | "Ascension" leaderboard, with mine and friends filters. |
| Achievement / account record | Achievements, upgrades, bought gems, purchase and pending tokens, ascension levels, friends map, friend code, favourite name | Cross-device restore of account progress and purchases. Friend info lookups. |
| Purchases | Token, order ID, SKU, state, timestamps, account | Purchase log (no validation is visible). |
| Saved games | Cloud-sync snapshots: player, world and opponent JSON plus metadata (season, week, score, synced flag, expiry) | Cloud sync (section 3.3). |
| Friend requests | Codes, names, accepted state | Friends system. |
| Multiplayer invites | Game, host, invitee, mode (Normal/Hard/Nightmare), seat number, accepted or declined | Lobby. |
| Multiplayer games, with **players** and **tournaments** sub-collections | Shared world and opponent state, sync versions, completed turns, tournament step, last action type, app version. Each player's state goes in its own document, and resolved tournament results in their own. | Simultaneous-turn multiplayer through **real-time snapshot listeners**. |

**Friends** (`FriendsActivity`):
- Every account has a short **friend code**, which the player can copy and share. Friends are added by code.
- Incoming and outgoing requests (up to 5 shown) can be accepted, denied or cancelled. Friends can be removed.
- Friend info shows the friend's best score and achievements.
- Friends unlock the multiplayer slots and the friend leaderboards.

**Multiplayer** (`MultiplayerGameActivity`, described in-game as "still being worked on... rough edges"):
- Setup: the host creates a game in a multiplayer slot and invites friends, choosing the difficulty. Invitees accept from their save-slot screen and create their own lanista. The lobby waits for everyone, then the host starts the first turn.
- Each week:
  - All players act at the same time.
  - Each player presses Advance to mark the turn ready ("Your turn", "Waiting for X's turn").
  - The host resolves the shared tournaments and the week and uploads the results.
  - Every client re-resolves its own week.
- Player-to-player **offers and transfers** of gladiators and items are supported ("X has received your offer...").
- About 29 synced action types exist (market purchases, construction, intrigue, level-ups, surrender, take-host and so on). Pending syncs are retried.
- A **version gate** blocks play ("Incompatible versions") if any participant runs a newer app build than the client.
- Multiplayer-only achievements: *Together, for Rome!* (beat Spartacus), *Devastation* (last one standing), *One of us* (a player ascends).
- Legends tournaments are disabled in multiplayer.

**Asynchronous PvP:**
- **Challenge.** From the Highscores Hall-of-Fame list, the player pits one of their own Hall-of-Famers against another player's champion. The 1-v-1 is simulated locally and then animated. Beating a top-highscore champion earns *Challenger*.
- **Legends tournaments.** In normal online single-player games (not custom or sandbox, not multiplayer; seasons ≥ 4), after week 3 there is about a 25% chance each week that the game pulls up to 20 Hall-of-Fame gladiators from other players whose week is similar to yours. It builds an "invader" tournament from them, tiered Bronze, Silver, Gold or Diamond according to your champion tier.
  - Rewards include the *Legendary*, *Silver Legend*, *Gold Legend* and *Diamond Legend* achievements.
  - Cheating is blocked in hard-mode legends ("No cheating in hard mode legends!").
- **Seasons** are hard-coded. New saves are season 6, and a new season needs an app update. Earlier season-champion achievements are now unobtainable.

### 3.5 Permissions (manifest)

`com.android.vending.BILLING`, `INTERNET`, `ACCESS_NETWORK_STATE`, `READ_GSERVICES`, `WAKE_LOCK`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_AD_ID`, `BIND_GET_INSTALL_REFERRER_SERVICE`, and a signature-level dynamic-receiver permission.

- No storage, location, camera, contacts or notification permissions.
- The touchscreen feature is not required.
- Exported components:
  - the launcher `MainActivity`,
  - `WikiActivity` (custom-scheme deep link),
  - the standard Firebase Auth helper activities,
  - the ProfileInstaller receiver.

### 3.6 Feature flags, remote config, debug

- **No Remote Config, A/B testing, Crashlytics or Performance SDKs.** All gating is static:
  - upgrades,
  - hard-coded season constants,
  - the app-version check in multiplayer,
  - `World` flags (sandbox, betrayals disabled, raids disabled, hard, nightmare).
- `BuildConfig.DEBUG = false`, release build. About 125 `Log` calls are still in the code. No hidden developer or cheat menu was found. The *Bug hunter* achievement rewarded beta-channel testers.
- **Sandbox mode** (a new-game setting) is the official "cheat" mode. It gives +5,000 denarii and +200 influence, disables betrayals and raids, and opens the Gladiator Editor so the player can drop custom gladiators straight into the ludus. Sandbox, like any custom setting, **excludes the game from achievements, highscores, the Hall of Fame and Legends**. Sandbox cannot be combined with hard, nightmare, ascension or multiplayer.

### 3.7 The "editor" activities: player features, not developer tools

- **`GladiatorEditorActivity`**: the paid **Gladiator Editor** upgrade (200 gems, requires the *People manager* achievement).
  - The player sets name, age, origin, appearance, strength, initiative and cunning (2–20 each), health (10–200, in steps of 5) and traits.
  - The resulting level is computed, and an "appears in week X–Y" window is derived: stronger or younger builds show up later. The gladiator can also be set to never appear.
  - The design is saved to the account. In each new game (single-player, or multiplayer host) he shows up for sale in the market.
  - In sandbox mode the same screen adds gladiators straight to the roster.
- **`TraitEditorActivity`**: just the trait picker opened from the editor, listing every gladiator trait with add and remove.

---

## 4. Third-party, legal, inclusivity, language, accessibility

### 4.1 Credits (About screen)

- Programming and design: Rene Slump.
- Art and UI: Sim Kaart.
- External images credited to their authors: an "escape through the insula" piece, a Caesar picture, blood effects from an itch.io artist.
- Thanks to pixel-art tutor Bandygrass.
- Music: *Gates of Assyria* (Ancient Ambience) and *Aetas Romana* (Adrian von Ziegler).
- Sound effects from several named community SFX artists.
- A community chat (Discord) link appears in Settings.
- No licence or EULA screen and no in-app privacy-policy screen were found in the code.

### 4.2 Female characters (players have requested female gladiators)

- **There are no female gladiators.** `Gladiator` has no gender field. Gladiator text uses male pronouns throughout ("his", "he can decide...", "your men"), and every gladiator sprite and head is a male gladiator.
- **The player-character lanista can be female.**
  - The Roman heritage offers a female portrait.
  - The premium **Egyptian** heritage uses a female portrait.
  - `Player.isFemale` drives the portraits in saves and stories, a female lanista sprite on the estate animation, and gender-aware dialogue (for example the Pythia addresses you as "man" or "woman").
- Female NPCs exist in the story: Pythia, Gaia, Venus, Minerva. None of them is a fighter.

### 4.3 Language support

- **13 in-game languages**, chosen manually in Settings: English, Spanish, Italian, French, Portuguese, German, Indonesian, Korean, Russian, Traditional Chinese, Turkish, Arabic, Vietnamese.
- About 3,665 strings per locale, about **97–99% coverage** of the English table. The wiki is translated too.
- The default language is English whatever the device locale.
- **Arabic is translated, but the manifest does not set `supportsRtl`**, so layouts do not mirror.
- Language changes are the only explicit analytics event.

### 4.4 Accessibility

| Aspect | Status |
|---|---|
| Text scaling | Weak. Most text sizes are in **dp, not sp** (34 dp vs 3 sp in activity layouts; 28 vs 15 in styles), so system font size has little effect. The pixel fonts are small. |
| Screen readers | Weak. `contentDescription` appears in only 14 activity layouts, with generic labels such as "item icon" and "gladiator head". Image buttons and many custom-drawn views are unlabeled. |
| Motion | Good. There are toggles to turn off screen transitions, fast-forward and skip-to-end for battles and intrigue, and a performance flag (stored, but not exposed in the visible settings). |
| Audio | Separate music and sound toggles. Nothing needs audio to be understood. |
| Cognitive load | Mixed. Tooltips (toggle), optional hints, the guidance quest and the wiki help, but the deep screen stack and dense numbers make the game demanding. |
| Colour | No colour-blind mode. Item quality and attributes rely on colour coding (technique attribute colours, quality tints). |
| Orientation and input | Landscape only. Debounced buttons prevent double taps. Immersive full-screen is an option. |

---

## 5. Design takeaways

1. **The monetization is "premium content via a soft wall", with no ads, energy, gacha or subscriptions.** About two-thirds of the 7,650-gem catalogue can be earned through achievements. Paying mainly speeds up and completes the unlocks, and a completionist spends about $16. That ethical positioning can be carried forward.
2. **Content gating is broad but shallow.** 56 small unlocks cover classes, techniques, gear, heritages, buildings, events, difficulty modes and quality-of-life features. Lock icons in the markets and locked tournaments and buildings act as in-context upsells. Some genuine QoL is behind the paywall: Hard and Nightmare modes, extra save slots, cloud sync, auto-management and tactics ordering. Gating difficulty modes and QoL is usually unpopular.
3. **The online layer is mostly asynchronous and cleverly cheap.** Hall-of-Fame snapshots double as PvE content: Legends tournaments put other players' champions into your single-player game. A local Challenge duel gives PvP without servers. Real-time multiplayer exists but is labelled beta.
4. **The tech is a solo-developer stack:** Java Views, Gson blobs in SharedPreferences, and Firestore as the whole backend. There is no remote config or crash reporting, purchase crediting is client-side, seasons are hard-coded, and only one game can be cloud-synced. The newer `CloudSaveQueue` is clearly more robust than the rest of the persistence layer.
5. **UX is information-rich and screen-heavy.** There are 76 activities plus dialogs. The pixel-art presentation is strong, with combinatorial sprites, an animated estate and an animated battle log. Onboarding relies on a 6-step guidance quest, tooltips and a hyperlinked wiki; the older coach-mark tutorial is dead code.
6. **Gaps players notice:**
   - no female gladiators (only a female lanista),
   - no RTL layout despite Arabic,
   - weak text scaling and screen-reader support,
   - no sign-out,
   - legacy achievements (about 700 gems) that can no longer be earned.
