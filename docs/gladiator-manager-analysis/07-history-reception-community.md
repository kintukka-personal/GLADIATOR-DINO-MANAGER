# 07 — History, Reception, Community and Sister Games

*Gladiator Manager (Renegade Games). External research: store listings, mirror changelogs, the developer's site, reviews, and a 2,703-review Google Play sample. Collected 22 Oct 2026.*

**Labels.** **[S]** comes straight from an official, store or press source. **[DEV]** is the developer's own words in a Play Store reply. **[U]** is a player claim (lower confidence). **[INF]** is an inference. Reviewer names, the developer's personal contact details and account IDs are deliberately left out.

---

## 1. Identity

| Field | Value |
|---|---|
| Title | Gladiator Manager |
| Developer / publisher | Renegade Games, a solo studio run by **René Slump** (Netherlands). He does all programming and design. |
| Artist | **Sim Kaart** (also credited on *Rift Riff* and the upcoming *Castle Away*) [S: Steam page and in-game credits] |
| Android package | `com.rene.gladiatormanager` |
| iOS | App Store id 1670358723 (also runs on Apple-silicon Macs and visionOS) |
| PC | Google Play Games on PC ("Play on PC") |
| Genre | Turn-based ludus-management sim with auto-resolved battles; roguelite runs with an "Ascension" New Game+ ladder |
| Price | Free. No ads. Two optional gem IAPs: Pouch (500 gems, $3.99) and Chest (1,500 gems, $7.99) |
| Ratings | Google Play rating 4.27 from 13,037 ratings (5★ 9,000 · 4★ 1,584 · 3★ 571 · 2★ 643 · 1★ 1,222). App Store rating 4.3 from 259 ratings (US). TouchArcade 4/5. Hardcore Droid 3.5. |
| Installs | 1M+ on Play (embedded figure ≈1.82M) |
| Content rating | Teen on Play (Violence, Blood); 12+/13+ on iOS; 0+ on RuStore |
| Languages | 13 in-game on Android (EN, ES, IT, FR, PT, DE, ID, KO, RU, zh-TW, TR, AR, VI). iOS lists English only. |
| Data collection | "No data collected or shared" (Play data-safety). The privacy policy names only Google Play Services and Firebase Analytics. |

**Name confusion.** Several unrelated games share the name:
- Eternity Games' *Gladiator Manager*, a text-based sports sim on Steam (app 1251970, also on `gladiatormanager.itch.io`).
- *Gladiator Guild Manager*, a Steam autobattler.
- *Ludus Magnatus: Gladiator Manager Simulator*, a 2026 PC early-access title.
- *Gladiator Manager II*, an old Java phone game.

---

## 2. Timeline

| Date | Event | Source |
|---|---|---|
| 13 Mar 2019 | First commit of the game's privacy-policy site ("Renegade games built the Gladiator manager app as a Free app"). This is the earliest dated artefact. | [S] GitHub |
| **7 Nov 2020** | **Android release** (Google Play "Released on") | [S] |
| 27 Nov 2020 | Earliest Play review (v1.8.2). At this point the game had no equipment, music or achievements. | [S]/[DEV] |
| 22 Dec 2020 | Official Discord server established | [S] |
| ~Feb 2021 | Achievements added; endgame tweaks; fewer raids | [DEV] |
| after Feb 2021 | Optional gem IAPs added, "so that everything can be unlocked with achievements" | [DEV] |
| May 2021 | Asynchronous "ghost" multiplayer: your gladiators invade other players' games | [DEV] |
| Jun–Jul 2021 | Beast levelling; Rookie tournaments for low-level gladiators | [DEV]/[U] |
| Sep 2021 | Leaderboard "Beta season" (season 0) begins | [S] renegade.games API |
| Oct 2021 | v2.0.8 | [S] Uptodown |
| Nov 2021 | Military expeditions against the rebels | [DEV] |
| early 2022 | Sandbox mode; option to disable raids | [DEV] |
| mid-2022 | Sound and music begin to be added. Ascension exists by v2.6 (Jun 2022). | [DEV]/[U] |
| 13 Jun 2023 | **iOS release** (iTunes lookup). It appears in TouchArcade's "Out Now" of 29 Jun 2023. | [S] |
| 13 Jul 2023 | TouchArcade review, 4 stars | [S] |
| **15 Sep 2023** | **v3.0.0a**, a complete UI overhaul | [S]/[DEV] |
| Nov 2023 – Feb 2024 | Breakout growth: 50K installs (1 Nov 2023), 100K (2 Dec 2023), 500K (3 Feb 2024) | [S] androidrank |
| 30 Jan 2024 | Hardcore Droid review, 3.5 | [S] |
| Feb 2024 | Hard mode moved into a gem upgrade | [DEV] |
| Apr 2024 | Open beta channel on Google Play | [DEV] |
| Jul 2024 | Nightmare mode (unlocked by reaching Ascension 5 on Hard) | [DEV] |
| 1 Sep 2024 | **1M installs** | [S] |
| Dec 2024 – Mar 2025 | War elephants; influence overhaul (consul elections, raids, rebel recapture); ranged weapons and Hail of Arrows; whip class; Crassus; Nightmare achievements; Workshop crafting | [S] App Store notes / [DEV] |
| Jun–Sep 2025 | Revamped gladiator market; Egyptian heritage and the Pharaoh-tomb quest; new traits and ascension levels | [S] App Store notes |
| Nov 2025 | Sister game *Imperium: Rome* released (Android 11 Nov, iOS 4 Dec) | [S] |
| Jan 2026 | Season 6 leaderboard begins (v3.15.2) | [S] |
| Jul–Sep 2026 | v3.16: "Taking a Closer Look" questline (Looking Glass, battle-log inspection); a new trait for specific gladiators and beasts; captured-weaponsmith event; equipment purchase from rivals; "Titanic Strength" | [S] |
| 26 Sep 2026 | **v3.16.2b (build 898)**: the build decompiled for this analysis | [S] |
| 21 Oct 2026 | v3.16.3 on Android / iOS 3.5: **Varro**, "a new late-game rival with elite gladiators and unique events"; renaming and favourites | [S] |

**Release cadence.** Uptodown lists **381 Android builds** between May 2021 and Oct 2026, often several a week. iOS uses separate version numbers (1.x until mid-2024, 2.x from Dec 2024, 3.x from Aug 2026). The developer said in 2024 that "android is quite a few versions ahead since the player base is so much bigger."

---

## 3. Press reception

### TouchArcade: "Only a Famous Death Will Do" (13 Jul 2023), 4/5
- **The reviewer's story.** He bought Flamma at the market and arranged his family's "accident" to keep him focused. Flamma escaped, raised barbarians, burned the estate and left the reviewer's head on a pike.
- **Mechanics praised:**
  - nationalities with bonuses;
  - week-by-week play, limited by the number of active gladiators and by money;
  - pre-fight fairness readouts;
  - bribes such as chained opponents and an open lion cage;
  - rivals who cheat too;
  - status-gated event choices.
- **Comparisons:** *King of Dragon Pass* and *Monster Rancher*.
- **Monetization:** "Gems … are the only way the game monetizes." Finishing every achievement yields enough for "just about everything".
- **Pacing:** "A game of momentum". Losing spirals into less income, waning influence and lower loyalty. With no money left, you "drag one of your slaves up" to fight.
- **Cons:** sloppy UI, text spilling out of boxes, under-explained advanced features, occasional bugs. The developer is "very attentive".

### Hardcore Droid (30 Jan 2024), 3.5, "Is it Hardcore? Yes"
- **Mechanics described:** four heritages (Roman +20 % influence; Celtic +20 % training XP; Punic extra gold; Greek double trait-unlock rate, 150 gems); classes; 1–4 tournaments a week; pre-round cheats; pre-tournament poisoning; slaves as miners, guards and entertainers; loyalty through gifts and adoption; deserters joining Spartacus.
- **Criticism:** locked gear still appears in lists, so upgrades feel like "holding content for ransom". The game "requires a lot of patience for a mobile game".

### Other coverage
- **Uptodown editorial:** "demanding strategy and management title". It compares the game to *Domina*.
- **YouTube community:** "Badger Gladiator" guides (tips, ascension, gem upgrades, editor, Hannibal's Legacy) have up to ~64K views. Other channels include "Sam prime" (ascension-14 boss, revival), Caelan (season-3 leaderboard #1, doctore training) and "The Best Strategy Game You've Never Heard Of".

---

## 4. Player sentiment: a 2,703-review Google Play sample

The sample runs from Nov 2020 to Oct 2026 and includes 554 developer replies.

**Star rating by year**

| Year | Reviews | Avg ★ | % 5★ | % 1–2★ |
|---|---|---|---|---|
| 2020 | 10 | 5.00 | 100 | 0 |
| 2021 | 60 | 4.35 | 63 | 8 |
| 2022 | 63 | 4.32 | 68 | 13 |
| 2023 | 627 | 4.21 | 61 | 12 |
| 2024 | 1,091 | 4.31 | 68 | 12 |
| 2025 | 614 | 4.30 | 69 | 12 |
| 2026 | 238 | 4.26 | 67 | 14 |

Sentiment stayed flat through 100× growth. The review spike in 2023–24 matches the v3.0 UI overhaul and the iOS launch.

**Themes** (keyword-matched, so the counts are indicative)

| Theme | % of all reviews | Avg ★ of those reviews | % of 1–2★ reviews |
|---|---|---|---|
| Gems / locked content / purchases | 14.2 | 4.33 | 11 |
| Difficulty / punishing / RNG | 13.8 | 3.78 | **26** |
| Addictive / "hours" | 11.6 | 4.68 | 4 |
| Death / injury frustration | 5.3 | 3.34 | 14 |
| Late game repetitive / too easy / too much money | 5.2 | 3.87 | 7 |
| Rebels / raids / escapes | 5.0 | 3.68 | 10 |
| Bugs / crashes | 5.0 | 3.98 | 7 |
| Depth / strategy | 4.6 | 4.75 | 1 |
| No ads / not pay-to-win | 4.4 | **4.81** | 1 |
| UI clunky / unexplained | 3.7 | 3.58 | 7 |
| Ascension | 3.6 | 4.41 | 2 |
| Pixel art | 2.7 | 4.42 | 2 |
| Saves / cloud | 1.8 | 3.55 | 4 |
| Multiplayer / online | 1.0 | 4.37 | 1 |

**Reading the themes:**
- **Praise.** The ethical monetization ("one of the best ACTUALLY free games", no ads, no energy) and depth ("an actual game!") are the most positive signals.
- **Negative reviews.** These are dominated by **perceived unfairness**: RNG deaths, cascading disasters, rebels and raids, and unexplained death and injury rules.
- **Recurring requests:**
  - Hard mode, save slots and cloud sync should not cost gems.
  - Mechanics should be explained better.
  - The late game should be more varied.
  - Some players ask for female gladiators.
  - Gladiators should be sortable and favouritable (favourites were added in 3.16.3).
- **Developer engagement is unusually high.** He answered about 20 % of reviews, giving design rationale such as "being true to history is important, even the parts we would consider highly immoral", "for normal mode I decided to allow save-scumming", and "cloud storage is not free for me to provide".

---

## 5. Community and online data (renegade.games)

- **Discord.** "Renegade Games" server, ~10,000 members (674 online in Oct 2026). It is the official server for Gladiator Manager, Imperium and Castle Away. The store listing says "9,000+ lanistas".
- **Public stats API on the developer's site.** It covers 1,250 reporting players:
  - **Achievement completion:**

    | Achievement | Players | Share |
    |---|---|---|
    | Student | 1,079 | 86 % |
    | Influencer | 936 | 75 % |
    | Ascension | 411 | 33 % |
    | Divine (asc 5) | 90 | 7 % |
    | Divine (Nightmare) | 6 | 0.5 % |
    | Completionist | 1 | |
    | Demigod | 1 | |

  - **Most-owned upgrades:** Master Smith 609, Temple of Pluto 554, League of Bacchus 544, Senate Elections 487, Legendary Smith 484.
  - **Least-owned upgrades:** Hail of Arrows 4, Undying Loyalty 24, Nightmare Mode 24, Hannibal 54, Thunder Strike 61.
- **Seasonal leaderboards (season 0 Beta → season 6).** The score is "Imperium" (influence × 1 normal, × 1.5 hard, × 3 nightmare).
  - Top players have survived tens of thousands of in-game weeks: one season-4 run was at week 37,406.
  - The highest ascension observed is **16**.
  - Recorded defeat reasons include `DebtPileUp` and `SlaveBetrayal`.

---

## 6. Sister games

| Game | Status | Relation |
|---|---|---|
| **Imperium: Rome** | Released Nov/Dec 2025 (Android 10K+ installs, 4.42★; iOS). IAP $5.49–$14.99. | Roman-legion merge-unit autobattler against Gauls, Carthaginians and mythical enemies. Three campaigns (the first free, later ones gem-gated), endless survival, and asynchronous PvP against other players' armies. Same gem/achievement model and the same Discord. The developer hinted at it in Dec 2023 ("cool plans for a follow up game"). |
| **Castle Away** | Steam (app 4362480), 2027 (Q4 2026 per 4Gamer). Built in Godot. Co-published with WhisperGames. | Run-based floating-castle autobattler: a 3×3 grid with adjacency synergies, 50+ structures, demon bosses and ascension runs. Team: René Slump (design and code), Sim Kaart (art), Matthijs Koster (audio), Tom Schoen (marketing). |

---

## 7. Notable developer statements (paraphrased or quoted from Play replies)

- On ascension: unlock the tournament by "winning 3 or 4 leagues, defeating Spartacus and all the rebel gladiators, and constructing the shrine in Ariminium." "Ascension 2 is Vulcan … opponents have better equipment."
- On Nightmare: "unlocked by reaching ascension level 5 hard"; "I did go all out on nightmare". Save-scumming is allowed on normal but not on Nightmare.
- On the starting roster: "I actually like keeping the three starting gladiators the same (it's a bit of a nod to a certain popular game)". Those three are Flamma, Tetraites and Carpophorus.
- On builds: "Initiative is the most popular build, and cunning is very powerful outside of combat." "Start with a low cooldown technique like Lunge or Smash." "Endurance is just confusing wording for max health."
- On loyalty: adopt, reward, assign valuable gear, and raise entertainment.
- On inspiration: "Of course the game is inspired by Spartacus, just like Gladiator, football manager and 20 other forms of media."
- On AI fairness: "The ai has to follow the same rules as the player, but they do start with a bit more workers."
- On later content: "in higher ascensions you will already be able to encounter some mythical creatures."
