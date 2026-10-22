# 03 — Core loop, progression, rivals, tournaments and meta-progression

Source: jadx decompile of Gladiator Manager v3.16.2b (`com.rene.gladiatormanager`).
Method: I read the restructured jadx output. Where jadx marked a method "Code decompiled incorrectly" (for example `World.AppendWeek`, `Gladiator.winTournament`, `Tournament.finishTournament`, `Ascension.ascensionTurnEffects`, `Trait.get*Bonus`, `Opponent.reactToPlayerAction`), I checked it against a jadx *fallback* (raw-instruction) decompile. In several of those methods the restructured output inverts ternaries or adds `break`s that are not in the bytecode, so the fallback reading is the one used here. Trait stat tables come from a small interpreter run over the fallback switch tables.
Constants that jadx had replaced with Android/Google symbols were resolved: `LogSeverity.ERROR_VALUE`=500, `NOTICE_VALUE`=300, `WARNING_VALUE`=400, `CRITICAL_VALUE`=600, `EMERGENCY_VALUE`=800, `ItemTouchHelper…SWIPE_ANIMATION_DURATION`=250, `ConnectionResult.DRIVE_EXTERNAL_STORAGE_REQUIRED`=1500, `CredentialsApi.CREDENTIAL_PICKER_REQUEST_CODE`=2000, `es.dmoral.toasty.BuildConfig.VERSION_CODE`=150.
"(?)" marks something I am not sure of.

Conventions: "week" means a game turn. Stats are STR (strength), CUN (cunning), INI (initiative) and HP (max life). Gladiator constructor order in code is `(name, STR, CUN, HP, INI, …, ageInWeeks)`.

---

## 1. Turn structure

### 1.1 The player-facing cycle
1. **Management phase (week W).** The player buys and sells, trains, builds, schedules intrigue, joins tournaments and organizes events.
2. **Advance** (`OverviewActivity.Advance`). The game calls `World.SeedWeekTournaments` to build this week's `Tournament` objects. The first tournament the player joins in a week is **attended** (fought interactively in `TournamentBattleActivity`). Every other joined tournament is **auto-resolved** (`World.resolveTournament`). Before week 50, if the player has eligible fighters and the week has events, the game first shows the Colosseum screen.
   - In auto-resolution the player's teams always use the "Care" instruction. AI teams use "Care" if their opinion of the player is >45, "AllOut" if it is <15, and "Default" otherwise. AI pit fighters decide each bonus round whether to continue (§6.6). With the AutoManage upgrade, the player's pit team retires as soon as the next pit trait is earned.
3. **Tournament final report**, then `WeekResolver.ResolveWeek()` advances the world from week W to W+1.
4. **Result screens**, in priority order: elections, league result, plague, Carthaginian artifacts, escape attempts, then the Week report (`ResultActivity.goNext`).
5. The week report saves a Hall of Fame snapshot (25% chance per week) and a highscore (even weeks, week >3, influence ≥10).

### 1.2 Exact order inside `WeekResolver.ResolveWeek` (single-player / host)
1. If a defeated rival holds a gladiator on loan from the player, that gladiator returns to the player.
2. `player.CleanupLastWeeksTransfers()`.
3. **`Player.AppendWeekCascading`** (this runs *before* the week counter increments):
   - Clears offered gladiators and beasts. Resets the "targeted" flag. Cleans old messages.
   - Sets sparring sessions for the week: 1, plus 1 for each doctore threshold met (doctore level >5 & CUN >10, >8 & >15, >12 & >20, >15 & >30).
   - Updates the PublicSessions influence opportunity. Elected senator: +1 influence every 5 weeks. Founder event chain step 22 yields an Old Celtic shield.
   - `World.handleInfluenceEvents` (Bribe General).
   - **`Dominus.AppendWeekCascading`** (the ludus economy step, shared by the player and the AI):
     1. Doctore: keeps the chosen doctore, or auto-picks a Lorarius-class gladiator.
     2. Unassigned slaves are moved to security.
     3. `+influenceGain()`, then `+income()`, then `+expenses()` (expenses are a negative number).
     4. **Debt handling:**
        - If denarii < 0: −1 influence.
        - If denarii > −6: projected income −1 and +5 denarii.
        - Else if denarii > −11: projected −3 and +10.
        - Else: projected −2, half of wages and slave costs are refunded (the ludus does not pay), the "unpaid gladiators" flag is set (each gladiator loses 10 loyalty), −5 influence, and either −1 mining bonus for +20 or projected −3 for +10.
        - Below −200 denarii: a further −2 influence and projected −2.
        - Still negative after all this: −2 influence and projected −5. If the ludus was **already bankrupt** last week, it is defeated (`DebtPileUp`) when it has 0 slaves; otherwise it loses another projected −15 and −1 mining bonus, sells a slave, and is defeated if still negative. On defeat, all its gladiators turn rogue.
     5. Active status (a dominus already in this week's tournament is inactive).
     6. **`AppendWeekForCombatants`:**
        - Beasts: death and burial (+50 denarii), alpha fights, treats/Good Boy, training.
        - Gladiators:
          - Assigned items are attached. A Dark Blade can drain life.
          - Equipment "happiness" is updated.
          - **Aging:** +1 week of age always, plus another +1 with 50% chance. The second week is guaranteed for the player at ascension ≥1 (Saturn's mutator).
          - Dead gladiators are buried (+50 denarii).
          - Pyromaniac can burn a building (1/60 per week, 1/20 if also Psychopath).
          - Spartacus gains DemandingFreedom after more than 2 tournament wins.
          - Inspiring-gladiator loyalty pull: `(inspiringAvg − loyalty)/4`.
          - Weekly loyalty change (halved while on an adventure). Lycanthropy can kill a slave.
          - Loyalty check (rebel candidates are collected).
          - **Training** (§3.4).
          - `WeekPassed`: trait gain, origin level, injury healing (Greek heritage doubles the trait roll).
          - Unpaid wages: −10 loyalty.
          - Doctore auto-manage spends stat points.
        - Loyalty simulation (betrayals and uprisings) runs if betrayals are enabled.
   - Player transfers. Delayed outcomes. The "Doctore" ludus report message. Low cash and debt messages. Senate or consul election progress.
   - If not defeated:
     - `checkObjectives` (§9).
     - Decisions older than 7 weeks are dropped.
     - **Slave market refresh:** availableSlaves = 2–4 (Jupiter+ −1; Egyptian 50% +1). Cost = 80/100/120 (Jupiter+ +10; Gaia+ 50%: +10 and 50% one fewer slave; Nightmare: +20 after week 20 and another +20 after week 40).
     - Arbiter cooldown −1.
4. The default "Unknown" opponent's denarii are reset to 200.
5. `player.ClearInvaders()`.
6. **`World.AppendWeek`** (world step, detailed in §1.3).
7. **Legends (invader) tournament.** Rolled only if week >3, a 25% roll succeeds, the game has no custom settings and it is not multiplayer. Hall-of-Fame snapshots of other players are loaded asynchronously and an `Invader` tournament is added this week (§6.9).
8. A random **decision event** from `DecisionFactory` (see [04 §6](04-story-events.md)).
9. **Public funding law** (if passed by a senate decision): +500 denarii to every ludus on weeks divisible by 4.
10. Tartarus+ only: a "mysterious tunnels" message when week >10 and (week+1)%20 == 0.
11. **`progressOpponents`** (AI step):
    1. The default opponent processes its combatants and learns random techniques. It is refilled if it has fewer than 3 gladiators or fewer than 2 healthy: a random gladiator of level `rand(week/10+1)+2`, or an Epic gladiator at +3 in Hard mode.
    2. **Hard mode:**
       - A random rival's random available gladiator gets `buffUp()`: ranks up equipped techniques, gains a random trait, and gains enough XP to level.
       - After week 20, 25% chance per week that a random rival gains an Epic gladiator of level `week/10`.
    3. For each rival, in reverse list order:
       1. `helpOpponents` catch-up (§5.4).
       2. Public funding.
       3. **`ResolveAIWeekCascading`** (§5.3).
       4. `considerIntrigueVsPlayer` (§5.5).
       5. Opinion boosts: Egyptian heritage +1 every 3 weeks before week 50 and every 8 weeks; OpinionIncrease opportunity; BacchusPatron.
       6. In host multiplayer, intrigue against every online player.
       7. **Defeated houses are removed.** A herald message names the reason (debt / burned by slaves / ransacked by rebels), and the `EliminateOpponent` achievement is granted.
    4. An informant report of rival transfers is posted.
    5. **Crassus spawn.** Not in Nightmare: if a house was destroyed this week, exactly 5 rivals remain, the destroyed house was not Crassus, and Crassus is absent, Crassus opens a ludus.
12. Tomb of the Pharaoh storyline trigger (EgyptianAncestry upgrade, influence >300, more than 2 gladiators, more than 2 committed spies; roll `rand(30)+spies` (+3 for Egyptian heritage) must exceed 30).
13. `checkAchievements`: Famous (gladiator fame >100), GreedIsGood (>2000 denarii), Influencer (>100 influence; hard variant; nightmare variant needs >1000), PeopleManager (≥5 gladiators all with loyalty ≥80), and Gods-Chosen prophecy level.
14. **`World.SeedWeekTournaments`** builds the tournaments for the new week. AI entrants are added. In Nightmare after week 10, underground events gain one extra AI team.
15. The state is saved.

In multiplayer, non-host clients run `ResolvePlayerWeek`, a reduced version of steps 2–3 and 8–13 (the host owns the world step).

### 1.3 `World.AppendWeek` in order (verified against fallback bytecode)
1. week++. The tournament list is cleared. **Recurring events are rescheduled:**
   - Hippodrome and Triumph come back at `currentWeek + 1 + oldEventWeek`, so the interval roughly doubles each time. Hippodrome: weeks 3 → 8 → 18 → 38 → …
   - Above-ground Pankration returns 8 weeks later.
   - Challenge (Bestiarii Exhibition) returns 4 weeks later with fresh beasts.
2. A **Rookie** "Initium" every 3 weeks. A **Junior** "Iunior Victores" every 4 weeks (2 teams if week%8==0, else 4).
3. The Spartacus-defeated flag is set if: Spartacus is dead or absent, expeditions are enabled, week >32, and the rebel army is small. "Small" means (rogue gladiators <3 and army <50), or (week >60, <4 and <70), or (ascension >2, week >100, army <100 and <8 rogues).
4. **Spartan Pankration** (Cestarii upgrade): every 13 weeks if the week is not crowded and Melankomas has not joined yet. Underground, 1/team, 4 teams, fee 200.
5. If the **Ascension requirements** are met (§8.1), an Ascension tournament is added. Otherwise the weekly **Underground fighting rings** event is added (a "Better together" tutorial in tutorial worlds).
6. **Ascension turn effects** (cascading, §8.3).
7. If the GodsChosen objective is active: a "Prophecy" tournament is added 10 weeks ahead.
8. **Markets regenerate:**
   - Gladiators (§3.1). Week 1 always offers the three starters.
   - Weapons: quality seed = week + 2×spies + 25 per MarketConnections.
   - Equipment, mounts, beasts and items: seed = week + spies + 25×MarketConnections.
   - Theokoles check (§5.6). Custom-gladiator check (§3.1).
9. **Rebel army** (summary; rebels and expeditions are detailed in [04 §8–9](04-story-events.md)):
   - plunderedGold += 3×rogues + escapedSlaves/2.
   - Each rogue gladiator trains: +50 XP (+50 at Jupiter+, +50 at Sol+), stat points, best class.
   - With army >40, Spartacus (or the rogue leader) gains week/10 XP (+100 at Mars+, +100 at Jupiter+). He gains RebelLeader (+500 XP); above 120 he gains week/5 XP and becomes RebelGeneral (+2000 XP).
   - **Senate intervention.** Needs at least 40 weeks since the last one (70 in Hard; ×2 at Sol+), more than 3 rogues, army >60 (120 in Hard; ×2 at Sol+), and a 25% roll.
     - Roll `rand(800)+50` against `escaped + plunder/100 (+200 if Spartacus lives)`.
     - Senate wins: escaped /2, plunder /3, 1–2 weakest rogues die.
     - Senate loses: escaped −1/4, plunder −1/6, the weakest rogues are wounded and gain Killer/Veteran, +1500 XP and +50 fame.
   - Plunder >3500 with a living Spartacus forges **Libertas** (−3000). Plunder >5000: −200 per week and +1 escaped.
10. Every 6 weeks: if there are fewer than 4 rivals, a new random ludus opens (`Seed.CreateOpponent`, §5.2). Hard: plunder >1000 converts 200 into +1 escaped slave.
11. Every 12 weeks: every ludus (player and AI) gets projected income −1 (inflation).
12. Every 7 weeks (Hard: every 5): a new rogue Epic gladiator (level week/10+1), or +5 escaped if there are already more than 100 rogues. After week 12, every 5 weeks: +1 escaped. With Spartacus alive, on even weeks (every week in Hard): +1 escaped. After week 25, every 4 weeks (Hard: 3): a random rogue gladiator (level week/20+1), or +3 escaped.
13. **Named rival arrivals:** Caesar at week 25 (Hard 20, Nightmare 12). Crassus at week 20 in Nightmare.
14. **Spartacus timeline** (normal / hard week):
    - 15 / 10: Batiatus (or the weakest rival) acquires Spartacus.
    - 20 / 18: Spartacus's family is butchered: −20 loyalty and LostFamily. With committed spies the player gets +5 influence and Batiatus −5.
    - 28 / 24: Spartacus is humiliated. Batiatus −10 influence (−15 more if spied) and +600 denarii. Spartacus −30 loyalty, all of Batiatus's gladiators −35. The SpartacusEscape story starts.
    - 35 / 30: Spartacus plots revolt. His owner (Batiatus, or the player if Batiatus is gone) −10 influence. Spartacus −20 loyalty and PlottingUprising; the owner's gladiators −15.
15. **PythiaVisions** story starts when (Spartacus defeated, more than 1 league win and week >80 − 4×ascension) or week >160. **SpartacusBounty** story: ≥2 rivals, Spartacus alive, army >40, more than 5 rogues, 20% roll.
16. The default opponent's gear improves:
    - Week 10: Old Gladius (Old Spatha in Hard).
    - Week 20: Regular Wooden shield and Shoddy Galerus.
    - Week 40: Regular Securis, Regular Hoplon and Old Cloak.
    - Week 60: Quality Fuscina, Regular Hood and Regular Leather armor.
17. Escaped-slave growth after week 40: every 2 weeks (4 weeks at ascension ≤2), an Epic rogue (level week/15+1), or +4 escaped. After week 50: +1 escaped every 3 weeks (every week at ascension >2). At ascension >2 and week >15: +2 escaped per week (+1 more in Hard).
18. Expeditions are enabled once army >2 with at least 1 rogue, or plunder >500.
19. **League scheduling** (§7). Solar, Bacchus, Jupiter and Vulcan are created once if missing. After week 100 a new **Annum** league is created whenever none is pending.
20. Ascendancy upgrade: the Reincarnated gladiator gains `15 − week` loyalty each week before week 15.
21. **Rudis gladiators** (freed gladiators) can return: 4% per week (`rand(100) > 95`).
    - The gladiator is reset to 100 loyalty.
    - On a roll of 98–99, or if no rivals remain, or if he is Loyal: he offers to rejoin the player for `price + 200 + 50×level`.
    - On 97: he joins the rebels.
    - Otherwise: he joins a random rival.
22. **`resolveLeague`**: activation on the start week, scoring and final rewards on the end week (§7).

### 1.4 Calendar, aging and retirement
- There is no calendar beyond the week counter. Age is stored in weeks (52 per year). New games start at **week 1**; tutorial worlds start at week −2.
- **Aging speed:** +1 week of age per turn, plus 50% chance of another. On average a year passes every ~35 turns. At **ascension ≥1** the second week always applies, so a year passes every 26 turns. AI gladiators keep the 50% rule.
- **No death from old age** was found. Aging works through multipliers applied to the raw stats every time they are read (`world.Age`). Ages are in years; ranges are inclusive.

| Age | STR × | HP × | INI × | CUN × | XP gain × | Injury-prone bonus |
|---|---|---|---|---|---|---|
| <4 | .1 | .2 | .1 | .1 | .1 | +3 |
| 4–7 | .2 | .4 | .5 | .3 | .2 | +2 |
| 8–11 | .5 | .7 | .7 | .4 | .5 | +1 |
| 12–14 | .5 | .7 | .7 | .4–.5 | .9 | +1 |
| 15 | .8 | .9 | 1.0 | .6 | .9 | 0 |
| 16 | .8 | .9 | 1.0 | .7 | 1.0 | 0 |
| 17 | .9 | .9 | 1.0 | .8 | 1.0 | 0 |
| 18–27 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0 |
| 28–32 | 1.0 | 1.0 | .9 | 1.0 | .8 | +1 |
| 33–39 | .9 | .9 | .8 | 1.0 | .6 | +2 |
| 40–45 | .8 | .7 | .6 | 1.0 | .4 | +2 |
| 46–48 | .8 | .7 | .4 | .9 | .3 | +4 |
| 49 | .7 | .5 | .4 | .9 | .3 | +4 |
| 50–54 | .7 | .5 | .4 | .9 | .2 | +4 |
| 55–58 | .6 | .4 | .3 | .9 | .2 | +4 |
| 59–61 | .6 | .4 | .3 | .8–.9 | .2 | +5 |
| 62–69 | .5 | .3 | .2 | .8 | .2 | +5 |
| 70–79 | .3 | .1 | .1 | .7 | .2 | +6 |
| 80–99 | .3 | .1 | .1 | .6 | .2 | +7 |
| ≥100 | .1 | .1 | .1 | 1.0 (code quirk) | .2 | +8 |

  Minimums after the multiplier: STR, INI and CUN ≥1; HP ≥5.
- Age-related rules:
  - Under 15 counts as a **kid**: no mount, a kid sprite, cheaper wages. Only Junior tournaments take under-17s by design. Age >7 is required to fight at all (`canFight`).
  - Over 49 counts as **old**: an old sprite.
  - The AI values gladiators over 30, over 36 and over 45 years old lower (−20%, −25%, −25%, compounding).
- **Retirement or freedom.** There is no automatic retirement. A gladiator who reaches **≥10 major tournament wins** (25 if he is a GlorySeeker) can trigger the "requests the rudis" decision. The player can:
  - grant freedom: +25 influence and +25 loyalty for all; the gladiator leaves with the *Rudiarius* (Freedom) trait and may come back later (§1.3, step 21);
  - threaten lashings: −25 loyalty and DemandingFreedom;
  - pay `100×level` denarii: −15 loyalty.

  AI gladiators with ≥10 wins gain DemandingFreedom with 4% chance per week.

---

## 2. Game start, heritage and difficulty

### 2.1 New game (`NewGame.CreateNewGame`)
- **Options:**
  - name (reserved: batiatus, magnus, decimus, salonius, solonius, spartacus, unknown, caesar, vettius, crassus, hannibal);
  - male or female dominus;
  - heritage;
  - an "advanced" dialog: Sandbox, Ascension (if unlocked), Hard (needs the 300-gem upgrade), Nightmare (200-gem upgrade; enabling it forces Hard on; disabling Hard turns Nightmare off);
  - cloud sync;
  - multiplayer host or invite.
- **Starting money:** **1000** denarii; **800** in Hard or Nightmare. Sandbox adds +5000 denarii and +200 influence.
- **Normal-only extras:** +1 slave on entertainment and 1 Regular Bandages. Every ludus starts with 1 slave (on security) and residence level 0.
- **No starting gladiator.** The week-1 market always offers three legendary starters:

| Name | STR/CUN/HP/INI | Age | Origin | Trait | Price (level <5) |
|---|---|---|---|---|---|
| Tetraites | 8/5/30/5 | 19 | Roman | Agile | 350 |
| Carpophorus | 7/8/30/5 | 19 | Greek | Beast Tamer | 400 |
| Flamma | 7/6/30/5 | 19 | Greek | Glory Seeker | 300 |

  Week 1 also offers the beast **Aello** (a wolf with Sharpened Claws).
- **Rivals** are seeded (§5.1), plus the default opponent "Unknown": 200 denarii, a Shoddy Gladius, 2 random level-1 gladiators (level 2 in Hard), and **Emericus** (5/5/30/5, Dagger Specialist; PitFighter in Nightmare). In Hard, Unknown's gladiators know Rally, Decimate and Parry, and it has better daggers.
- Election actions are seeded. The fixed opening tournament calendar is created (§6.1), along with the Lunar league and the first Solar league. The custom gladiator may be put in the market.
- **Guidance objectives** start at ascension 0 (§9).
- Ascension mode then routes to `AscensionActivity` (§8.2).

### 2.2 Heritages (`HeritageType`: Roman, Punic, Celtic, Egyptian, Greek)

| Heritage | Unlock | Start item | Mechanical effects (code) |
|---|---|---|---|
| Roman | free | Shoddy Galerus helmet | **+20% of every positive influence gain**. +1 on the weapon-mastery trait roll in training. Gladiator loyalty: Roman origin +1, Gaul/Punic origin −1 per week |
| Punic | free | Old Carthaginian helmet | **+100 starting denarii, +1 mining bonus** (+1 denarius per mining slave per week). Loyalty: Punic origin +2, Roman/Iberian −1 |
| Celtic | free | Old Gallic helmet | Training base effectiveness 10 → **12** ("+20% training XP"). Loyalty: Gaul/Briton/Thracian +1, Roman −2, Greek −1 |
| Greek | **GreekHeritage, 150 gems** | Old Hoplon shield | Weekly trait-gain roll factor **×2.0** ("100% increased trait gain"). +1 on the weapon-mastery roll. Loyalty: Greek +1, Briton/Thracian −1. Opens one Greek-only decision path (DecisionFactory) |
| Egyptian | **EgyptianAncestry, 200 gems** (requires GreekHeritage) | Shoddy Linthorax | **Every rival's opinion +1** every 3 weeks before week 50 and every 8 weeks. **50% chance of +1 available slave each week**. +5 on one weapon-market roll. +3 on the Tomb-of-the-Pharaoh story roll |

### 2.3 Difficulty modes
Mode flags live in `World`: `hardModeEnabled` (Nightmare implies Hard), `nightmareMode`, `sandboxEnabled`, `betrayalsDisabled` and `raidsDisabled`. Sandbox sets "custom settings" (betrayals and raids off). **Custom-settings games disable achievements, highscores, Hall of Fame entries and invader tournaments.**

**Hard mode** (300 gems; "increased score and extra achievements"):
- 800 starting denarii instead of 1000, and no free slave or bandage.
- **Richer, better-equipped rivals at seed:**
  - Batiatus 1200 (vs 600) and Decimus 750 (vs 400). Solonius 2800 vs 1700, Magnus 1500 vs 750, Vettius 2000 vs 1000.
  - Higher weapon qualities, extra slaves, +20–30 influence.
  - Solonius's and Magnus's random gladiators start at level 2 instead of 1.
  - Pontius learns Smash and Lunge; Cadeyrn learns Throw Sand.
  - Gannicus's broken bones last 4 weeks instead of 6.
  - Caesar's and Crassus's gladiators get +500 XP.
- Default opponent: Epic refills (+3 levels); Old Spatha at week 10.
- Weekly `buffUp` of a random rival gladiator. After week 20, 25% chance per week of an Epic gladiator for a rival.
- Rebels:
  - a rogue Epic every 5 weeks (vs 7);
  - an extra rogue every 3 weeks after week 25 (vs 4);
  - +1 escaped slave every week while Spartacus lives (vs even weeks);
  - plunder >1000 → +escapes every 6 weeks;
  - senate intervention thresholds 70 weeks / 120 army (vs 40 / 60).
- Earlier timeline: Spartacus at week 10, Caesar at week 20, Theokoles threshold week >30 (vs >50).
- Harder market wolves (`createWolf(hard)`). The Gwyn and Jupiter Wolf league champions gain HP.
- **Score ×1.5**. Extra Hard achievements.
- Influence-tree costs ×1.5 (§2.4).
- (?) Pit/ascension "hard" variants read `defaultOpponent.getHardMode()`. That flag is never set to true anywhere in the code, so in practice only the Nightmare variants of those special entrants apply.

**Nightmare mode** (200 gems; needs the HardMode upgrade and the *Divine (hard)* achievement). Everything in Hard, plus:
- Rivals richer still: Batiatus 1600, Decimus 1000, Magnus 2000, Vettius 2500, Caesar 2500. Better weapons, Sand items, extra spies and mines.
  - Gannicus gets FirstBlood, a +2 origin level and a 3-week injury. Gigantus gets Impact. Lions get +300 XP.
  - Vettius +75 influence; Caesar +150; Crassus and Hannibal +250.
  - Initial Lunar league scores: Gannicus 10 / Pontius 6 (vs 8 / 2).
- **Caesar arrives at week 12** and **Crassus at week 20**.
- From week 10, every rival gladiator gains `(week % 5) × 10` XP per week (0–40).
- From week 10, underground events gain an extra AI team.
- Player slave prices +20 after week 20 and +40 after week 40.
- Player tournament winnings −50 if the prize is >150, else −25 if >100. Organizing income −25 if >100.
- Rivals' intrigue rolls +10. Sabotage and theft against the player are unlocked even without Venus.
- Theokoles threshold week >25. Rivals with one major event already scheduled 3 weeks out may still organize more.
- AI wants fewer treats for beast bonding (7 vs 9) (?).
- **Score ×3.0**.

### 2.4 Influence-tree cost scaling (difficulty lever)
The n-th influence opportunity costs a base amount of 20, 40, 80, 160, 300, 500, 1000, 2000, 4000, 8000, 14000, 20000, 28000, 34000, 45000 or 60000 influence. The final cost is `base × (1 + k/2)`, where k = (Hard?1) + (Nightmare?1) + (Sol ascension+?1).

---

## 3. Gladiators: generation, XP and training

### 3.1 Generation (`state.Seed`)
- **Origins** (uniform random among 9): Gaul, Roman, Greek, Iberian, Punic, Thracian, Briton, Egyptian, Parthian. Names come from the origin's name list. Egyptian and Parthian origins have dedicated portraits.
- **RandomGladiator(level):** STR, CUN and INI each 4–7; HP 25 or 30 (50/50).
- **RandomCheapGladiator:** STR, CUN and INI 4–6; HP 25.
- **EpicGladiator:**
  - STR, CUN and INI each 6–9; HP 30.
  - Always gains one rare learnable technique.
  - 20% chance of one extra random trait (1/500 of which is **Lycanthropy**).
- **Age:** `ageYears = levelBasedAgeBonus + 16` for normal, `+17` for cheap, and `+13` for Epic (`+12` if STR+CUN+INI <22). Normal gladiators also get +30 weeks.
  - `levelBasedAgeBonus(L) = rand(10) + L/2`; +1 if L >5; +L/4 if L >10; capped at 75; −4 if >10; −rand(12) if >20; −rand(20) if >40.
  - Low-level market gladiators are therefore about 16–25 years old.
- **Then (all types):**
  - if L >1, `setLevelAndStats(L)`: STR += L%2 + L/4; INI += (L%4 − 2) + L/4; CUN += L/4; HP += 5×(L/4 + (L%3 − 1)). Skill points are spent on random learnable techniques, with at most 2 kept equipped.
  - **+1 random trait** drawn from the first 19 trait types: Strong, Underdog, Sneaky, Untrustworthy, Veteran, Fanatic, Giant, Talented, True Grit, Exotic Fighting Style, Master Horseman, Made of Glass, Preparation, Loyal, Tough, Fury, Temperamental, Inspiring, Tactician.
  - 10% chance of a rare learnable technique.
- **No hidden "potential" stat exists.** Growth comes from levels, traits, class levels and training. Scouting text is derived from current stats ("impressive physique", "sharp tongue", and so on).
- **Weekly market (`GenerateMarketGladiators`):**
  - w = week, clamped: w ≤10 stays as is; weeks 11–29 → 10; weeks 30–101 → week/2; above that → 40.
  - Level L = max(rand(w)/3 + 1, 2).
  - 0–1 normal gladiators at L, plus 1–2 cheap gladiators at L/2.
  - **+1 Epic** when w >5 and `w % 5 == marketSeed`. marketSeed is a 0–4 value rolled once per game, so with seed 0 an Epic appears *every* week from week 11 to 29 (quirk).
  - Multiplayer or MarketConnections adds extra Epic and normal rolls.
- **Prices** (`Gladiator.getPrice`): base 50 + 10×(STR+CUN+INI) + HP; +10 more with more than one trait (60 instead of 50); +100 with more than 2 traits; +100 more with more than 3; +500 + 10×progressionWorth at origin level 2; then +20×(level−1) + 10.
  - Legendary overrides: Theokoles 800, Spartacus 350, Crixus 250, Maximus 300; the starters as above.
  - Custom gladiator: 50×level (×2 above level 4) + 50×traits + 100.
- **Custom gladiator** (Gladiator Editor upgrade, 200 gems, needs PeopleManager): appears in the market based on an "appearance chance".
  - The chance starts at 50 (+5 per year under 18, +2 per year over 28), then is reduced per level above 1 and per trait beyond the first.
  - A chance of ≥50 appears in week 1. Lower chances use start and end windows (e.g. chance >25 → weeks 50–100) plus weekly rolls, halved at Apollo+.
- **Special arrivals:** Theokoles (§5.6); Spiculus (upgrade; joins the default opponent's entry in non-rookie, non-underground tournaments after week 10 until defeated, then joins the victor); Neokoros (Pythia story); Agiad and Hector (Spartan/Troy events); Melankomas (wins of the Spartan Pankration).

### 3.2 XP curve and level-ups (`world.Progression`)
- XP is cumulative. To leave level L you need a total of `R(L) = 100·L² − R(L−1)`, which simplifies to **50·L·(L+1)**.
- Total XP to reach level N is `50·N·(N−1)`:

| Level | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Total XP | 100 | 300 | 600 | 1000 | 1500 | 2100 | 2800 | 3600 | 4500 | 6600 | 10500 | 19000 |

- **Per level:** +1 attribute point. Spending it gives +1 STR, CUN or INI, or **+5 HP**. Points are spent manually, by the doctore's auto-manage (AutoManage upgrade), or automatically by the AI.
- **Technique (skill) points:** start with 1; **+1 at every level divisible by 3** (3, 6, 9, …). Talented, Lord of Cinders and Force of Nature each grant +1. A technique can be learned or ranked up only if its main-stat requirement is met (raw stat, plus a reincarnation bonus).
- **Effective XP multiplier.** All XP sources are multiplied by:
  - the age XP modifier (table in §1.4);
  - the **class proficiency %**: 100% without a class, otherwise `15×(preferred techniques + preferred traits owned) + 10 + level + classSpecialization + 5 (if best stat = class main stat) ±5 (origin favoured/disliked class)`, clamped to 0–100.

  So an off-class gladiator can lose most of his XP.
- **XP sources:**
  - **Battle:** winner `(loserTeamWorth×40)/winnerTeamWorth + 10`; loser `(winnerTeamWorth×20)/loserTeamWorth + 10`. Clamped to 1–250, ×1.25 with Quick Study. Fame: winner +XP/9, loser (XP−125)/5. Loyalty ±2.
  - **Tournament win bonuses:** §6.5.
  - **Training:** §3.4.
  - **Sparring:** each fighter gets 5×(level₁+level₂). 10% chance of Duelist for the underdog.
  - Events and adventures.
- **Class levels:** class XP +1 per uninjured training week. Parthians sometimes get +2. The ClassTraining opportunity gives 50% +1. Class level = ⌊√classXP⌋ − 1. **Class level-up rewards** (`Training.classLvlup`):
  - if 2×classLevel > level: +50×classLevel XP;
  - when (classLevel+1) % 3 == 0: a free preferred trait;
  - else when classLevel % 4 == 0: +1 technique point and a preferred rare technique;
  - otherwise: +1 to the class main stat (+5 HP for Health classes).
- **Weekly trait gain** (`Gladiator.WeekPassed`):
  - Roll `rand(80) + int((level + 2×CUN + originTraitChance − #traits − 5) × f) ≥ 80`, where f = 2.0 for Greek heritage and 1.0 otherwise, and originTraitChance is 10 for Punic origin.
  - The trait is drawn from 12 options: Exotic Fighting Style, Preparation, Alert, Indomitable, Sneaky, Dual Wield, All In, Tactician, Eques Slayer, Quick Study, Pugilist, Deadeye. Titanic Strength replaces the draw for Giants/Titans with sword or axe proficiency in suitable classes. Marksman is the fallback for bow classes.
  - **Psychopath:** at least 4 killer-type traits (Killer, Assassin, Enforcer, Sudden Death) plus Sneaky, Untrustworthy or Ruthless gives a 2/30 chance per week.
- **Origin level:** 0 → 1 automatically at level >4 with fame >800. 1 → 2 requires a "Sand" item; the AI uses Sand automatically. Level 2 unlocks the origin's advanced combat effect and a large price/worth bonus.

### 3.3 Origins

| Origin | Basic bonus (code) | Advanced (level 2) effect | Favoured / disliked class |
|---|---|---|---|
| Gaul | +7 status resist; −1 loyalty per week | On damage received: +2 all stats | Barbarus / Dimachaerus |
| Roman | +1 loyalty per week; +1 weapon-specialization gain | Weapon proficiencies stack and apply to all weapons | Murmillo / Barbarus |
| Greek | +1 block | Crit chance + % of health missing | Hoplomachus / Barbarus |
| Iberian | +1 reach (strike first) | +50% crit damage at full HP | Retiarius / Murmillo |
| Punic | +10 trait-gain chance | +1 damage per 2 traits | Hoplomachus / Barbarus |
| Thracian | +25% training XP | +10% damage and +1% hit after every attack | Dimachaerus / Retiarius |
| Briton | +10 crit chance | On crit: restore 10% max HP | Barbarus / Hoplomachus |
| Egyptian | Favour ×2 | Favour added to weapon damage (×2 on crits) | Sagittarius / Murmillo |
| Parthian | Bonus class mastery (extra class XP) | Mount equipment bonuses ×2 | Sagittarius / Lorarius |

### 3.4 Training and the doctore (`world.Training`)
- **Team training type:** Light, Standard, Intense or Technique, with optional per-gladiator overrides. Rivals use their personality's type. Base effectiveness starts at 10. Adjustments: Celtic +2; Jupiter ascension −3; CommonerTourists +3; Gladiator Campaigning +10; some influence options ±2 or ±3; rivals at Mars/Juno ascension +10 each.
- **Paid training bonus** (weekly upkeep, taken from projected income): Bestiarii 25, Spartan 35, Weapons 50 (needs the Weapons Master upgrade).
- **Training XP formula** (verified in fallback):
  1. `D = DoctoreBonus × (0.1×baseEff + 0.1)`. If there is no usable doctore, `D = 5`. If the doctore is a Lorarius, D += 2×doctore level.
     - `DoctoreBonus = (2×level + 3) + CUN` (age-modified CUN); ×1.5 with the Doctore trait; +2 if the doctore's best stat is CUN. An injured doctore counts as no doctore.
  2. `E = baseEff + ⌊D⌋`, then +1 if facility bonus% >30 and +2 more if >60.
  3. `E += ⌊E × bonus% × 0.015⌋`. bonus% = construction training bonus (only for gladiators within facility capacity) + Quick Study 25 + Thracian 25.
  4. Multiplier: **Light ×0.75, Standard ×1, Intense ×1.5, Technique ×0.5**.
  5. + Bestiarii 5 / Spartan 10 / Weapons 10. Never below 0.
  6. Arrogant: ½. Injured (injury length >1): ½. **The doctore himself** trains as if there were no doctore and has a **10% chance per week to gain the Doctore trait**.

  Worked examples: with no doctore, Standard training gives 15 XP (Intense 22). A level-4, CUN-6 doctore without the trait gives E = 10 + ⌊17×1.1⌋ = 28 (Intense 42).
- **Training injuries:** 50% chance of 0 risk; otherwise Light 1, Standard/Technique 2, Intense 4.
  - The injury roll uses `injuryProne + risk − (medicusLevel + earlyProtection)`.
    - injuryProne = trait injury bonuses (§4), −1 at reincarnation >1, −1 for Spartacus at level ≤4, plus the age bonus.
    - earlyProtection = 2 before week 5 and 1 before week 12.
  - Careful: 70% chance of +2 protection and −1/8 XP.
  - Bandages downgrade a fresh injury and are consumed.
- **Training side-effects** (uninjured gladiators):
  - 1/30 chance per week of a new rare learnable technique.
  - **Intense:** 2% chance of Strong, or Ambidextrous, or Lightning Speed (not for Giants).
  - **Technique training:**
    - 1% chance of +1 technique point, or the Talented or Exotic Fighting Style trait.
    - Sagittarius: 4% chance of Hail of Arrows.
    - Cestarius: Uppercut (also learned at Master or Grandmaster fist proficiency).
    - Hoplite trait: Impale, at 4% (20% at Grandmaster spear).
    - **Doctore teaching:** if `rand(15) + (doctore knows a technique the pupil can learn ? 1 : 0) > 14` and the pupil's level exceeds his technique count, the pupil learns that technique for free. In practice this is a 2/15 (≈13%) weekly chance, and only when the doctore has a teachable technique. Otherwise a roll of 14 (1/15) makes a rare technique learnable.
  - **Bestiarii bonus:** 15% chance of Bestiarii, or 1% Beast Tamer. **Spartan bonus:** 2/30 chance of Conditioning, else 1/30 Indomitable.
  - **Weapon proficiency gain per week:**
    - Amount: (Weapons bonus 2) + (25% chance +1) + (10% chance +1, 40% with the Weapons bonus) + Roman origin +1.
    - Weapon type, in order of priority: the class's preferred weapon type, then the assigned weapon, then an existing proficiency, then the ludus's best weapon.
    - Mastery traits (Blade Whisperer, Axial Momentum, Shadow Blade, Piercing Precision, Deafening Crackle, Fists of Steel) are possible at Master or Grandmaster with the Weapons or Spartan bonus, or on very rare rolls. Greek and Roman heritage add +1 to this roll.
- **Doctore extras:**
  - It sets the number of weekly sparring sessions (1–5, §1.2).
  - With AutoManage it spends stat points according to class and the doctore's best stat.
  - The AI picks its highest-level gladiator as doctore, with +5 to the score for crippled, blind or bum-leg gladiators (who can still teach).
  - The TrainGladiator rival story compares the two doctores' DoctoreBonus.

### 3.5 Loyalty (summary)
Loyalty starts at 80 and is clamped to 0–100.

**Weekly change** = influence effect + entertainment effect + security effect + `(level==1 ? 2 : 1) − level` + trait expected changes + heritage/origin bonus + legendary modifiers (Spartacus with Crixus −5 / Oenomaus −3 / Gannicus −2; Crixus with Spartacus −6; other legends −1) + equipment happiness + ascension penalties.
- Ascension penalties: Venus+ −1 (−2 after week 30, −3 after week 80); Juno+ −1; Apollo+ another Venus-size penalty; Tartarus+ −1 (−2 after week 80).
- Sol+ computes the influence effect on 80% of influence.
- The effect is halved while on an adventure.

**Revolt check:** loyalty passes if `rand(40) + 10 ≤ loyalty`, or if the gladiator is injured with loyalty ≥15. A one-time "rebellion grace" skip is granted after a reward, a transfer or an adventure.

**Reward:** costs 50×(level/2+1); +40 loyalty; once every 10 weeks.

---

## 4. Traits (all 146 + None)
Columns:
- Inj: injury-proneness modifier (negative = fewer injuries).
- Stats: permanent attribute change applied when the trait is gained.
- CE: combat effect hook. Combat details are in [01](01-combat.md); the text below is the in-game description.
- Loy: weekly loyalty drift from the trait.
- Tech: extra technique point.

Sources key: **R** random roll at generation (first 19 types); **W** weekly learnable roll; **C** class/training; **T** tournament; **E** event/story; **I** injury/wound; **B** beast-only; **L** legendary/boss.

Classification: (+) positive, (−) negative, (±) mixed.

| Trait (internal) | Name | Stats | Inj | Loy | Combat effect / description | Source |
|---|---|---|---|---|---|---|
| Strong | Strong (+) | STR+1 | | | — | R, Intense training |
| Underdog | Underdog (±) | INI+1 CUN+1 STR−1 | | | AI "Established" fans dislike him | R |
| Sneaky | Sneaky (+) | INI+1 CUN+1 | | −1 | intrigue | R, W |
| Untrustworthy | Untrustworthy (±) | CUN+2 | | −1 | intrigue | R |
| Veteran | Veteran (+) | STR+1 | | | — | R, E |
| Fanatic | Fanatic (±) | HP+10 INI+1 STR+1 | +1 | +1 | "pushes himself too far" | R |
| Giant | Giant (±) | HP+5 INI−2 STR+2 | | | larger size | R |
| Talented | Talented (+) | INI+1, **+1 tech** | | | extra technique | R, Technique training |
| TrueGrit | True Grit (+) | HP+5 | −1 | | can fight with short incapacitating injuries | R |
| ExoticFightingStyle | Exotic Fighting Style (+) | INI+1 CUN+1 | | | hard to defend against | R, W, Technique training |
| MasterHorseman | Master Horseman (+) | INI+1 | | | double mount STR/block bonus | R |
| ManOfGlass | Made of Glass (±) | HP−5 INI+4 CUN+2 | +1 | | fragile | R |
| Preparation | Preparation (+) | CUN+1 | | −1 | Block (prepared) | R, W |
| Loyal | Loyal (+) | HP+5 | | +1 | — | R |
| Tough | Tough (±) | HP+5 INI−2 STR+1 | | | Tough (shrugs light wounds) | R |
| Fury | Fury (±) | HP+5 CUN−2 STR+2 | | | — | R |
| Temperamental | Temperamental (±) | INI+1 STR+2 | | | Temperamental | R |
| Inspiring | Inspiring (+) | HP+5 CUN+1 | | −1 | team buff; pulls the team's loyalty toward his own | R |
| Tactician | Tactician (+) | CUN+1 | | | — | R, W |
| QuickStudy | Quick study (+) | CUN+1 | | | +25% training and combat XP | W |
| BeastTamer | Beast Tamer (+) | CUN+2 | | | defence vs beasts | Bestiarii training (1%) |
| Bestiarii | Bestiarii (+) | CUN+1 | | | +30% damage vs beasts | Bestiarii training |
| Conditioning | Conditioning (+) | HP+5 INI+1 | | | tireless | Spartan training |
| OneManArmy | One Man Army (+) | HP+5 STR+1 | | | bonus when outnumbered | L |
| Hero | Hero (+) | INI+1 CUN+1 STR+1 | | | — | E |
| RebelSlayer | Rebel Slayer (+) | HP+5 STR+1 | | | — | expedition |
| Pyromaniac | Pyromaniac (±) | INI+1 CUN+1 | | −2 | burns buildings | E |
| SwordSpecialist / AxeSpecialist / DaggerSpecialist / SpearSpecialist | X Specialist (+) | — | | | +2 damage with that weapon | legacy proficiency |
| SwordMaster | Sword Master (+) | STR+1 | | | big sword damage | legacy |
| DaggerMaster | Dagger Master (+) | INI+1 | | | big dagger damage | legacy |
| SpearMaster | Spear Master (+) | CUN+1 | | | big spear damage | legacy |
| DualWield | Dual Wield (+) | INI+1 | | | reduced dual-wield penalty | W, class |
| PoisonMaster | Poison Master (+) | CUN+1 | | | poison actions and weapons | — |
| LostFamily | Lost Family (±) | INI+1 CUN+1 STR+1 | | −4 | — | Spartacus story |
| Mithridatism | Mithridatism (+) | CUN+1 | | | poison resistance | E |
| Assassin | Assassin (+) | INI+1 | | | assassination bonus | intrigue |
| SuddenDeath | Sudden Death (+) | INI+1 | | | one-hit kill record | battle |
| Killer | Killer (+) | STR+1 | | | — | battle kills |
| ArenaChampion | Arena Champion (+) | INI+1 CUN+1 STR+1 | | | bars Rookie events | T (any non-underground win) |
| PitFighter | Pit Fighter (+) | HP+5 CUN+1 | | | — | T (underground, ≥2 bonus rounds) |
| PitChampion | Pit Champion (+) | HP+5 INI+1 CUN+2 | | | — | T (≥5) |
| ColossusSlayer | Giant Slayer (+) | CUN+1 | | | bonus vs large | T (≥8) |
| PitLegend | Pit Legend (+) | HP+10 INI+2 CUN+2 STR+1 | | | — | T (≥10) |
| BaneOfTigris | Bane of Tigris (+) | STR+2 | | | — | T (beat Tigris, round 13) |
| WorldChampion | World Champion (+) | HP+5 INI+1 CUN+1 STR+1 | | | — | T (Legends/Invader) |
| ReunitedWithFamily | Reunited With Family (+) | HP+5 | | +1 | — | E |
| RevoltLeader | Revolt Leader (±) | HP+5 INI+1 CUN+1 STR+1 | | −4 | — | E |
| Lawbringer | Lawbringer (+) | INI+1 STR+1 | | | — | E |
| ShowMan | Showman (+) | CUN+1 | | | wins draws | — |
| Enforcer | Enforcer (+) | STR+1 | | | — | E |
| Doctore | Doctore (+) | CUN+1 | | | +50% doctore XP | 10% per week as doctore |
| Adopted | Adopted (+) | HP+5 | | +1 | — | adoption (25 denarii, fame >20, one per ludus) |
| FirstBlood | First Blood (+) | INI+1 | | | — | T (Rookie win) |
| RebelLeader | Rebel Leader (−) | HP+5 INI+1 CUN+1 STR+1 | | −5 | — | rebels |
| LunarChampion | Lunar Champion (+) | HP+5 INI+1 | | | — | Lunar league 1st |
| Mythical | Mythical (+) | HP+5 | | | hard to destroy | L |
| HorribleDisfigurement | Horribly Disfigured (±) | — | | | causes fear | I, Pluto |
| PartiallyBlind | Partially Blind (−) | INI−1 | | | — | I |
| Blind | Blind (−) | INI−2 | | | blindness | I |
| BumLeg | Bum Leg (−) | INI−4 STR−2 | | | — | I |
| Crippled | Crippled (−) | INI−5 STR−5 | | | — | I |
| Anemic | Anemic (−) | INI−1 STR−2 | +1 | | — | Dark Blade |
| MissingFingers | Missing Fingers (−) | INI−1 STR−1 | | | — | I |
| Concussion | Concussion (−) | INI−1 CUN−3 | | | — | I |
| DemandingFreedom | Demanding Freedom (−) | CUN+1 | | **−8** | — | ≥10 wins / Spartacus |
| AllIn | All in (+) | STR+1 | | | two-handed damage and crit | W |
| Ambidextrous | Ambidextrous (+) | INI+1 | | | accurate offhand | Intense training |
| LightningSpeed | Lightning Speed (+) | INI+2 | | | hit and dodge | Intense training |
| Hunter | Hunter (+) | INI+1 CUN+1 | | | — | E |
| SurvivalOfTheFittest | Survival of the Fittest (+) | HP+5 INI+1 | −1 | | — | B |
| ForceOfNature | Force of Nature (+) | INI+1 CUN+1 STR+1, +1 tech | | | — | B |
| FeralIntelligence | Feral Intelligence (+) | CUN+2 | | | — | B |
| AnimalInstinct | Animal Instinct (+) | INI+1 CUN+1 | | | — | B |
| SharpenedClaws | Sharpened Claws (+) | STR+1 | | | armor piercing | B |
| SelfPreservation | Self Preservation (±) | HP+5 CUN−1 STR−1 | | | blocks first 10 damage | B |
| BestiaSummum | Bestia Summum (+) | HP+5 INI+1 CUN+1 STR+1 | | | +30% vs humans | B |
| Alpha | Alpha (±) | HP+5 STR+1 | | | alphas fight each other | B |
| ThickHide | Thick Hide (+) | HP+5 | | | Tough | B |
| SolarChampion | Solar Champion (+) | CUN+1 STR+1 | | | bars Rookie | Solar 1st |
| BacchusChampion | Bacchus Champion (+) | HP+5 INI−1 CUN+2 | | | — | Bacchus 1st |
| JupiterChampion | Jupiter Champion (+) | INI+1 CUN+1 STR+1 | | | — | Jupiter 1st |
| VulcanChampion | Vulcan Champion (+) | HP+5 STR+1 | | | — | Vulcan 1st |
| AnnumChampion | Annum Champion (+) | INI+1 CUN+1 | | | — | Annum 1st |
| EquesSlayer | Eques Slayer (+) | INI+1 | | | +30% vs mounted | W |
| Psychopath | Psychopath (±) | HP+10 INI+2 CUN+2 STR+1 | | −5 | demoralizing | §3.2 |
| RebelGeneral | Rebel General (−) | HP+20 INI+2 CUN+3 STR+2 | | −8 | — | rebels |
| PlottingUprising | Plotting Uprising (−) | HP+5 CUN+1 | | **−10** | — | Spartacus |
| Titan | Titan (±) | HP+10 INI−2 STR+4 | | | less damage from giant slayers | L |
| Ascended | Ascended (+) | HP+5 INI+2 STR+2 | | −2 | marks the ascension champion | T (Ascension win) |
| Reincarnated | Reincarnated (+) | HP+5 INI+2 STR+2 | | +1 (+1 at reinc >4, +1 at >6) | — | ascension carry-over |
| RaisedInTheArena | Raised in the Arena (+) | HP+5 INI+1 CUN+1 STR+2 | | +1 | — | T (Junior win) |
| Thief | Thief (±) | INI+2 CUN+1 | | −2 | stealing | E |
| Underhanded | Underhanded (±) | CUN+2 | | −2 | — | L |
| Impact | Impact (+) | STR+2 | | | hit chance / stagger | — |
| Carnivorous | Carnivorous (+) | INI+1 STR+1 | | | life steal | B |
| Indomitable | Indomitable (+) | HP+5 STR+1 | | | damage resistance | W, Spartan training |
| ApolloBlessing | Apollo's Blessing (±) | HP+5 CUN+1 | | −2 | blessed | E |
| GoodBoy / BestBoy | Good Boy / Best Boy (+) | HP+5 CUN+1 / HP+10 INI+2 CUN+2 STR+2 | | | — | B (fame >60 with treats) |
| Alert | Alert (+) | INI+1 CUN+1 | | | resists poison and assassination, acts first | W |
| Albino | Albino (−) | CUN+1 | | | photophobia | L |
| GlorySeeker | Glory Seeker (±) | STR+1 | | +1 | +fame (+1 per win, +5 per tournament); delays rudis to 25 wins | starter |
| Agile | Agile (±) | INI+2 STR−1 | | | dislikes heavy armor | starter |
| Arrogant | Arrogant (−) | INI−2 CUN−1 | | −2 | half training XP | E |
| BladeWhisperer, AxialMomentum, PiercingPrecision, ShadowBlade, DeafeningCrackle, FistsOfSteel | weapon mastery traits (+) | INI+1 / STR+1 / CUN+1 / INI+1 / INI+2 CUN+1 STR+2 / STR+3 | | | weapon-specific procs | Weapons training at Master or Grandmaster |
| Freedom | Rudiarius (+) | HP+5 CUN+1 | | +2 | — | granted the rudis |
| PoisonedClaws | Poisoned Claws (+) | INI+1 | | | poisoned weapons | B |
| Undeath | Undeath (±) | HP+10 INI−2 CUN−3 | | +2 | — | resurrection (§10.3) |
| Marksman | Marksman (+) | INI+1 CUN+1 | | | opening accuracy | bow classes |
| Devotion | Devotion (+) | HP+10 STR+1 | | +2 | blessed | L |
| BlindFighter | Blind Mastery (+) | INI+1 CUN+1 | | | fights blinded | — |
| Hoplite | Hoplite (+) | HP+5 STR+1 | | | spear mastery; Impale | Spartan Dynasty |
| LordOfCinders | Lord of Cinders (+) | HP+10 INI+1 CUN+1 STR+1, +1 tech | −1 | | — | Gwyn wins Solar again |
| TitanicStrength | Titanic Strength (+) | INI−2 STR+4 | | | one-handed large weapons | W (Giant/Titan) |
| Adventurous | Adventurous (+) | HP+5 CUN+1 | | | fear resist | adventures |
| Recaptured | Recaptured (+) | CUN+1 | | +2 | — | rebels |
| Ruthless | Ruthless (±) | CUN+1 STR+2 | | −1 | ruthless | — |
| SpartanResolve | Spartan Resolve (+) | HP+5 INI+1 | | | never surrenders | Agiad |
| LifeBringer | Life Bringer (+) | HP+5 CUN+1 | | +1 | — | hatches the Mysterious Egg |
| Bloodstarved | Bloodstarved (−) | INI−2 STR−4 | +2 | | near death | Dark Blade |
| Pugilist | Pugilist (+) | HP+5 INI+1 STR+1 | | | unarmed | W |
| PankrationChampion | Pankration Champion (+) | HP+5 INI+1 | | | — | T (Pankration) |
| CelestialChampion | Celestial Champion (+) | HP+5 STR+1 | | | +1 favour | — |
| Careful | Careful (±) | HP+5 INI−1 CUN+2 | | +1 | fewer injuries, slower training | — |
| Paranoid | Paranoid (±) | HP−5 INI+1 | | −1 | intrigue defence | — |
| ManyHeads | Many Heads (+) | HP+50 | | | Hydra | B |
| Lycanthropy | Lycanthropy (±) | HP+10 CUN−1 | | | werewolf; kills slaves at full moon | Epic 1/500, Tartarus |
| HerculeanStrength | Herculean Strength (+) | HP+10 INI+1 CUN+1 STR+4 | | | — | E |
| Cataphractoi | Cataphractoi (+) | HP+5 INI−1 STR+2 | | | heavy cavalry | — |
| Deadeye | Deadeye (+) | INI+1 CUN+1 | | | reach adds to accuracy and crit | W |
| ExplosiveRelease | Power Throw (+) | STR+1 | | | thrown weapons | — |
| Intangible | Intangible (±) | INI+2 | −2 | −2 | can only be hit after attacking | B (Wraith) |
| ReincarnatedBeast | Reincarnated (beast) (+) | HP+5 INI+1 CUN+1 STR+1 | | | — | Undying Loyalty |
| ColdBlooded | Coldblooded (+) | HP+5 INI−1 CUN+1 | | | — | — |
| ManEater | Man Eater (+) | INI+1 STR+1 | | | — | B |
| Duelist | Duelist (+) | INI+1 CUN+1 | | | duel bonus | sparring (10%) |
| Flying | Flying (±) | HP−5 INI+1 | | | — | Icarus |
| TombRaider | (unnamed, no effect) | — | | | — | — |

Other notes:
- Loyalty drift also applies to **Intangible** and **Ascended** (−2), and Untrustworthy, Ruthless, Preparation, Sneaky, Inspiring and Paranoid (−1).
- **Reincarnation-valid traits** (carried over at ascension): Flying, Exotic Fighting Style, Preparation, Poison Master, Sneaky, Dual Wield, All In, Tactician, Eques Slayer, Quick Study, Master Horseman, Ruthless, Spartan Resolve, Mythical, Pugilist, Fists of Steel, Careful, Paranoid, Lycanthropy, Deadeye, Strong, Apollo's Blessing, Agile, Beast Tamer, Glory Seeker, Alert, Indomitable, Underdog, Untrustworthy, Veteran, Fanatic, Hunter, Giant, Talented, True Grit, Made of Glass, Loyal, Tough, Fury, Inspiring, Horribly Disfigured, Ambidextrous, Blind Mastery, Devotion, Marksman, Lightning Speed, Hoplite, Cataphractoi, Power Throw, plus the beast traits. Titan carries over as Giant; Albino and Blind always carry over.
- **Tome of Traits** item: choose one of three random traits (a STR-type, an INI-type and a CUN-type list).
- Surgery (medicus) can remove wound traits.

---

## 5. Rivals (AI houses)

### 5.1 Named rivals at game start (`Seed.CreateOpponents`; values are normal / hard / nightmare)
Personality fields are Financial / Arena / Honesty / Training / Class mindset, plus gladiator preferences.

| Rival | Personality | Start denarii | Roster and notes |
|---|---|---|---|
| **Batiatus** | Greedy / RiskTaker / Treacherous / Technique / AlwaysClass; prefers Talented, Quick | 600 / 1200 / 1600 | **Gannicus**: 8/8/35/11, level 4, Dimachaerus, Arena Champion, Dual Wield, fame 100, broken bones 6/4/3 weeks. **Oenomaus**: 9/6/30/7, level 4, Lorarius, Doctore, Bum Leg, Loyal; he is the doctore. **Faust**: 5/5/25/8. One random level-1 gladiator. Whip, Gladius, (Fuscina in hard). Hated rival: Solonius. Receives **Spartacus** at week 15/10 |
| **Decimus** | Balanced / Balanced / Honest / Technique / Normal; prefers Cheap, Mythic | 400 / 750 / 1000 | **Aeneas** (Greek, Quick Study, Strong), Pontius, Atila, Cadeyrn; Lion V (level 2). Residence upgraded. +250 denarii at week 10 |
| **Solonius** | Spender / Conservative / Dishonest / Standard / PrioExp; prefers Established | 1700 / 2800 | 3 random level-1 gladiators (level 2 in hard), one 15-year-old, one 13-year-old; beast "Old Wolf". Residence and mine. Hated rival: Batiatus. Organizes "Rome's finest" (week 1) |
| **Magnus** | Spender / Crazy / Neutral / Light / PrioExp; prefers Cunning | 750 / 1500 / 2000 | 3 random gladiators (level 1–3); Lions I and II. Training ground. Hated rival: Vettius. Organizes the Hippodrome |
| **Vettius** | Crazy / Crazy / Dishonest / Intense / AlwaysClass; prefers Tough, Strong | 1000 / 2000 / 2500 | **Starts invisible.** He appears when he fields **Gigantus** (9/3/40/4, level 5, Hoplomachus, Giant, One Man Army, Warcry, Cleave; Impact in nightmare) in "Who can defeat Gigantus?" (week 6). Lions III and IV. Hated rival: Magnus |
| **Caesar** | Balanced / RiskTaker / Dishonest / Technique / Normal; prefers Established, Talented | 2000 / 2500 | Arrives at week 25/20/12. A level-5 champion with Exotic Fighting Style, World Champion, Killer and Strike&Roll (+Tough at Sol+); two level-4 gladiators; 2 lions and a rhino; 30 slaves; Quality and MasterCrafted gear. 50/75/150 influence |
| **Crassus** | Greedy / Balanced / Neutral / Light / AlwaysClass; prefers Cunning, Established | 5000 | Arrives in Nightmare at week 20, or when a house falls and 5 rivals remain. Level-9 champion (Untrustworthy, Underhanded, Veteran, Conditioning, True Grit, Execute; Killer and +100 sword proficiency if he arrives after week 50; Sol/Diana/Jupiter add more); two level-8 gladiators; elephant; 60+ slaves; MasterCrafted kit; +2 mining bonus; +100 projected income. Opinion −10 |
| **Hannibal** | Spender / RiskTaker / Treacherous / Intense / AlwaysClass; prefers Cunning, Mythic, Talented | 5000 | Only at **Cronus (asc 16)**, week 13. Level-4 champion (Loyal, Devotion, Veteran, Conditioning, Alert, Rally, origin level 2, +100 proficiency in four weapons); two legendary elephants; Precision/Reinforced kit; all buildings. Opinion −5/−10/−15. Has +1 cheat and +10 intrigue rolls, and organizes extra tournaments |
| Random new houses | Balanced or Spender / Balanced or RiskTaker / Neutral or Dishonest / Standard or Light; prefers Quick or Cheap | 1000 + 25×week | Opened every 6 weeks while fewer than 4 rivals remain. Three gladiators of level week/10+2 (with 3 extra traits), week/10+1 and week/12+1; week/10+15 slaves; residence, mine and wall (more after week 100 in hard) |
| "Unknown" (default) | Balanced / Balanced | reset to 200 every week | Filler and pit house (§2.1) |

### 5.2 Personality effects (`world.Personality`)
- **Cheat propensity** (`wantsToCheat`): Honest 0, Neutral 1, Dishonest 3, Treacherous 5. The cheat score also adds:
  - +1 if the player's influence is higher; +1 for Hannibal;
  - +1 or +2 if the rival has >200 or >500 denarii (−1 below 100);
  - opinion <45 +1, <25 +1; opinion >55 −1, >75 −1;
  - Apollo+ +1;
  - champion and fame comparisons ±1.
- **Spending buffer** (money kept back): Crazy 100, Spender 150, Balanced 200, Greedy 400.
- **Offer price** for a target gladiator: Crazy 50–162% (random), Greedy −20%, Spender +1/6, Balanced as is.
- **Class adoption threshold** (`useClassFrom`): AlwaysClass 10, Normal 50, PrioExp 75.
- **Pit-fight continue rule** (team level sum S vs target T = (round+1)/2): Balanced continues if S ≥ T; RiskTaker if S > T/2; Conservative if S > 1.5T; Crazy if S > T or on a coin flip. The rival always stops once its team has just earned the next pit trait.
- **Preference scoring** (favourite − hated):
  - Cheap: favourite if worth <200 or <denarii/5; hated if >500 or >2×denarii.
  - Talented: favourite if Talented, or level <3 with physical stats − level >18; hated if blind/crippled, or level >3 with physical − level <18.
  - Established: favourite if level >3 and fame >20, or Arena Champion; hated if level <2 and fame <10, or Underdog.
  - Quick / Strong / Cunning: favourite if the stat is >8; hated if it is <6.
  - Mythic: favourite if Mythical.
- **Gladiator valuation:**
  - `statWorth = 15×(CUN+STR+INI) + 3×HP + 30×level + 2×fame`.
  - Injured: halved, plus a share depending on injury length. Under 17: +1/5. Over 30, 36 and 45: progressively lower.
  - × `(10 + 3×preferenceScore)/10` (+5 for Spartacus, +3 for Theokoles, +4 for Sagittarius).
- **Hated rival pairs:** Solonius↔Batiatus, Vettius↔Magnus, Caesar→Batiatus; everyone else hates Caesar.

### 5.3 AI weekly routine (`Opponent.ResolveAIWeekCascading`, in order)
1. Spartacus-escape hook. A gladiator who died while on loan is returned to the player with 100 denarii compensation.
2. +1 influence. Tourist income. The economy and combatants week (same as §1.2.3, including training with the personality's training type). Transfers.
3. **Surgery:** wounded gladiators are operated on for 50 denarii if the rival has >150.
4. **Rewards:** gladiators below 40 loyalty are rewarded (50×(level/2+1) denarii). Gannicus is rewarded cheaply before week 18. Gladiators with ≥10 wins: 4% chance per week of Demanding Freedom.
5. **Emergency loan** (once per game): if more than one gladiator is unhappy, or rogue gladiators outnumber its security, and the rival has <50 denarii: +500 denarii, −1 mining bonus, −5 projected.
6. **Construction** (50% chance after week 3), in priority order: stables, training ground, mine, wall, medicus, residence, blacksmith.
7. **Buy slaves** (100 each), up to 3 per week. Conditions: >400 denarii and fewer than week/2+2 slaves, or unhappy gladiators / rebel threat, or >1500 denarii.
8. **Recruitment:**
   - Prisoners offered by the general (BribeGeneral opportunity), every 3 weeks after week 10 (hard: from the start), if influence >40.
   - 10% chance per week of bidding on the player's favourite-type gladiators (offers go to the player's inbox; the same gladiator can be re-offered only after 4 weeks).
   - Buys leftover market gladiators when its roster is below week/15+4 (or the market has interesting gladiators).
   - Poaches favourite-type gladiators from rivals with more than 2.
   - Buys a beast if it has fewer than 2 and more than 500 denarii.
9. Divest a mine (if <50 denarii and mining bonus >0). **Buy gear** (reforges at its own blacksmith; buys leftover market gear within denarii − 2×buffer).
10. **Selling:**
    - When broke or unpaid: offers a disliked gladiator to the player and sells to rivals; dumps excess weapons and armor at 75% of worth.
    - Otherwise sells disliked gladiators when it has more than 3–5. With more than 8 gladiators it sells the weakest.
    - Excess mounts and armor; beasts when broke.
11. Assigns new slaves to entertainment, mines or security, depending on morale, greed and risk.
12. `manageGladiators`: spends stat points according to preferences, sets classes, picks a doctore.
13. **Organizes a tournament** if no major event is scheduled 3 weeks out (or 1 event in nightmare or for Hannibal) and it has >300 denarii. Format: `<Name>'s tournament`, 1–3 per team, 2/4/8 teams for influence <20/<50/more, beasts allowed, mounts 50% if it has stables.
14. **Invest:** >1600 denarii and 10% chance → −400 denarii for +1 mining bonus.
15. **Rival storylines** (`determineStoryLine`), started with the player depending on opinion: Carthaginian Artifact, Bow of Apollo, Hannibal's Sandals, Macedonian Rebels (Caesar), Murder Plot (against its hated rival), Ludus Pact, Mansion for Sale (gladiator loan), Train Gladiator, Loan Request.
16. If bankrupt: sell gear and slaves ("panic mode").

### 5.4 Catch-up help (`WeekResolver.helpOpponents`, every rival every week)
- Nightmare and week >10: every gladiator +(week%5)×10 XP.
- Every 20 weeks (and after week 100 only every 40): +2 mining bonus, −5 projected.
- Every 15 weeks: +1 slave, −2 projected. Every 30 weeks: +1 spy slave, −5 projected.
- Week 10: Decimus +250.
- After week 5, 10% chance per week: +100 denarii, −4 projected, and a free 14-year-old level-1 gladiator (after week 20: +1 trait and +200 XP; after week 30: another trait and +300 XP).

### 5.5 Rival scheming against the player (`considerIntrigueVsPlayer`, each rival each week)
- Roll = `rand(120) − opinion/2` (+10 in Nightmare, +10 for Hannibal; −10 before week 5 and −5 before week 15 in Normal at ascension 0).
- **>120:** **assassination** of a random or the most famous player gladiator. Needs more than 2 rival gladiators and a success chance >35.
- **>105:** **sabotage** (Venus+ or Nightmare; player construction level >4; chance >40).
- **>95:** **theft** (Venus+ or Nightmare; player >200 denarii; chance >40).
- **≥85:** if the rival has less influence than the player and the player has more than 2 gladiators (more than 0 in hard): **persuasion** (bribe a player gladiator to defect; chance >40 and target loyalty >50, or >30 when targeting Spartacus), otherwise **poison** (chance >30).
- The player is warned ("targeted") except that at Apollo+ only half the time, and in Nightmare half again for some actions.
- At the default opinion of 50 the persuasion/poison band triggers on `rand(120) ≥ 110`, about 8% per eligible rival per week. Assassination effectively needs a strongly negative opinion.
- **Opinion** starts at 50 (displayed with a minimum of 1).
  - When the player acts against a rival, `reactToPlayerAction` applies through a switch fall-through (a code bug confirmed in bytecode): Honest +3+1−2−4 = **−2**, Neutral **−5**, Dishonest **−6**, Treacherous **−4**.
  - Other changes: Egyptian heritage and influence opportunities raise it; resurrection −10; ascension levels Venus and Apollo −5 each at start; tournament instructions and actions ±1.

### 5.6 Theokoles and other boss gladiators
- **Theokoles**: 20/5/(70+week/20)/10, level 8, Albino, Titan, Horribly Disfigured, Strong, Killer, Showman, Indomitable, Ambidextrous, Dual Wield, Alert, Dimachaerus with 10 class XP, Specialist swords, rank-4 Headbutt, Rampage, Cleave.
  - Threshold t: 20 normal (10 at asc ≥2), 0 hard, −5 nightmare; −10 more at asc >4.
  - If week > t+30, the strongest rival has less influence than the player, and a 20% roll succeeds: he joins that rival, who pays half its denarii.
  - Else, if week + t >50 and that rival has *more* influence than the player, with a 20% roll: he appears in the market for 800.
- League champions: **Gwyn** (Solar, joins the weakest rival with +400 denarii), the **Jupiter Wolf**, and a Quality Cuirass for the weakest rival (Vulcan).
- Ascension bosses: Cronus/Chosen of Saturn, Hephaestus, Poseidon, Ares, Jove, Harpies, Minotaur, Icarus, Draugluin, Perseus (§8.3).

### 5.7 How a rival ludus is defeated
`Dominus.defeat(reason)`:
- **DebtPileUp:** two consecutive bankrupt weeks (§1.2). Drained by theft or sabotage, unpaid wages and so on.
- **SlaveBetrayal:** a loyalty uprising burns the house down.
- **SlaveAttack:** ransacked by the rebel army (`RogueGladiatorAttackFactory`).
- **Raid:** a successful player **Raid** intrigue action.
- **Surrender:** the player only.

Defeated houses are removed at the end of the AI step, with a herald message and the *Veni Vidi Vici* achievement. Their gladiators either go rogue (debt) or are destroyed. Every 6 weeks a new random ludus refills the field back up to 4 rivals. Crassus can appear as the replacement (§1.2.11).

---

## 6. Tournaments

### 6.1 Types (`TournamentType`) and the fixed calendar
`TournamentEvent(name, week, perTeam, teams, fee, underground, organizer, mounted, beastsAllowed, type, isLeague)`.
- Mount rules: None, OpeningOnly (first round), FinalOnly (last 2 teams), Full.
- Bracket: single elimination; `log2(teams)` rounds.

| Event | Week | Format | Type | Notes |
|---|---|---|---|---|
| Rome's finest | 1 | 1v1, 4 teams, fee 100 | Normal | organized by Solonius |
| Initium | 1, 2, then every 3 weeks | 1v1, 4 teams, fee 0, beasts | Rookie | level ≤ `maxTournamentLevel(week)`; no Arena/Solar champions |
| Iunior Victores | 2, then every 4 weeks | 1v1, 2 or 4 teams | Junior | age <17 only; beasts from week 5 |
| Underground fighting rings | weekly | 1v1, 2 teams, fee 0, beasts | underground Normal | bracket plus up to 11 bonus rounds (§6.6) |
| Hippodrome extraordinaire | 3, recurring | 2v2, 4 teams, final mounted, beasts | Hippodrome | Magnus enters Lions I & II; league |
| Bestiarii Exhibition | 4, every 4 weeks after | 1v1, 8 teams, beasts | Challenge | default house fields bear, lion and best gladiator (or wolf); league |
| Teamwork prevails | 5 | 2v2, 2 teams | Normal | league |
| Who can defeat Gigantus? | 6 | 2v2, 4 teams | Gigantus | Vettius; he may release wild beasts; win → *The bigger they are..* |
| Pankration | 8, every 8 weeks | 1v1, 8 teams | Pankration | unarmed; not a league event |
| Lunar Champions | 10 | 1v1, 8 teams | **League** (double points) | Lunar finale |
| Imperator's triumph | 12, recurring | 3v3, 16 teams, final mounted | Triumph | captured soldier / beast teams fill empty slots; league |
| For the gods! | 52 | 2v2, 4 teams | Final | league |
| Solar set (start S ≥ 20) | S+1, S+10, S+14, S+19 | 2v2×4; 2v2×8; 3v3×4; Solar Champions 1v1×8 (League) | | |
| Bacchus set | B+1 (mounted opening), +10, +14, +19 (finale, mounted final) | 2v2×4; 2v2×8; 2v2×4; 1v1×8 | | needs the **League of Bacchus** upgrade to enter |
| Jupiter set | +1, +6, +10, +14, +19 | 1v1×4; 2v2×8; 1v1×8; 3v3×4; 1v1×8 | | |
| Vulcan set | +1, +6, +10, +14 (Vulcanalia, full mounts), +19 | 1v1×4; 2v2×4; 1v1×8; 3v3×8; 1v1×8 | | needs the **Vulcan League** upgrade |
| Annum set | +1 Initiation Rites (Rookie), +2 Glory of Rome (mounted), +6, +8 Coming of age (Junior), +10, +14, +19 | | | repeats after week 100 |
| Legends of Mars | 25 (or now+6) | 1v1, 8 teams, fee 200 | Mars | LegendsOfMars upgrade; **Champion of Mars** (15/10/45/12, level 6, One Man Army, Strong, Sword of Mars); winner gets the **Sword of Mars** |
| Spartan Pankration | every 13 weeks | underground, 1v1, 4 teams, fee 200 | Pankration | Cestarii upgrade; 2 bonus rounds (1 after Melankomas); **Melankomas** joins the victor |
| Poseidon's blessing / Bread and games | decision event | 2v2, 8 teams | Poseidon / Normal | Poseidon winner gets **Poseidon's Trident** |
| Trojan War | story | underground, 2v2, 4 teams | Troy | 3 bonus rounds; Hand of Midas at bonus round 4; **Achilles' Spear** at ≥5 |
| Hyperion's Practice / Gaze / Hubris | 2 / 7 / 13 at Hyperion+ | 3v3, 4 teams | Normal / Hyperion | Hyperion winner gets a Petrified **Mysterious Egg** |
| Prophecy | GodsChosen +10 weeks | underground, 3v3, 2 teams, opening mounted | Prophecy | 1 bonus round; 8-turn battles; the opponent fights to kill |
| Ascension | §8.1 | underground, 1v1, 2 teams, full mounts | Ascension | bonus rounds = ascension level + 1 (§8.1) |
| Legends (Invader) | random (§6.9) | 1v1, 4 teams, fee 100 | Invader | Hall-of-Fame champions of other players |
| Organized | custom | 1–3 per team, 2/4/8 teams | Normal | player or AI (§6.8) |

`maxTournamentLevel(week)` = week/7+1 (week <20), week/9+1 (week <50), week/15+4 (otherwise).

### 6.2 Entering
- Fighters must be healthy, active, not hidden and not on an adventure. Kids may only fight in Junior events (the AI also removes them from other events).
- A dominus in a normal event becomes inactive for that week (Rookie and Junior events are exempt).
- The **first** tournament joined in a week is attended; later ones are auto-resolved.
- Entering more fighters than one team tries to **double the bracket** (non-underground events only). Brackets then fill with AI houses and the default house, and snap to 2/4/8/16 teams.
- The "fee" is **never actually charged**. In code it only scales the prize (?).
- Locked league events (Bacchus or Vulcan without the upgrade) redirect to the gem shop.

### 6.3 Prize formulas (`Tournament`)
- **Winning denarii** = `(fee × contestants)/2`, where fee 0 counts as 50 and contestants = perTeam × teams. −100 if the result is >500. **+25 per bonus round** survived.
  - Examples: Rookie 4×1 → 100; standard 1v1×8 at fee 100 → 400; Triumph 3v3×16 → 2300; Legends of Mars → 700; Underground → 50 + 25/round.
  - Nightmare: the player's prize is −50 if >150, else −25 if >100.
- **Winner influence ("prestige")** = contestants + teams + 2 per bonus round (Rookie 8, 1v1×8 16, Triumph 64). Invader wins give +10 more.
- **Non-winning houses** that won at least one round get `roundNumber × 25` denarii.
- **Organizer reward** depends on spectators:
  - base +5 influence and +100 denarii;
  - spectators >1000: 10 and 200 instead;
  - each of >5000, >10000, >20000 and >50000: +5 and +200;
  - >100000: +5 and +400.
- **Spectators** = (base + per entrant) × weather factor.
  - Weather factor: Sunny 10, Windy or Overcast 8, Rain 6.
  - Base: 100 above ground, 20 underground; +100 for Poseidon, Ascension, Mars or Final; +1000 for Prophecy; Rookie or Junior = 50; League +50.
  - Per entrant: influence (above 1000: 1000 + influence/100; then if ≥20: influence/10 + 20).
  - Per combatant: fame (>100: +45 + fame/15; otherwise fame/2) + level (above 50: level/20 + 45).
- **Betting** (needs the Gambler influence opportunity): stakes 0/20/50/100/200, capped by funds. Bet on self or on the opponent.
  - "Odds" = Σ(player team worth+10) − Σ(opponent worth+10).
  - Payout = stake + stake×multiplier. Multiplier by odds: >50 → 0.2; >30 → 0.3; >20 → 0.4; >10 → 0.55; >0 → 0.8; >−10 → 1.0; >−20 → 1.3; >−30 → 1.5; >−40 → 2; >−50 → 4; >−60 → 6; >−80 → 8; else 10.
  - If the player's advantage is >80, AI opponents fight carefully. Above 120, with opinion >70, they may **throw** the fight (50% chance).

### 6.4 League points (verified)
- Multiplier m = 2 for `League`-type finales, 1 for other league events.
- Winner: **4m** points to each gladiator in the team. Finalist (same round reached): **2m**. Semi-finalists: **m**.
- Points are per gladiator. They follow the gladiator when he is sold. Dead gladiators' points are deleted.

### 6.5 Win effects on the gladiator (`Gladiator.winTournament`, verified)
Every win: +2 loyalty; +5 fame for Glory Seekers.

| Event | Fame / XP | Trait |
|---|---|---|
| Invader (Legends) | +30 / +50 | World Champion (or a rare technique); counts as a major win |
| Rookie | +10 / +7 | First Blood |
| Junior | +10 / +7 | Raised in the Arena |
| Pankration (above ground) | +10 / +7 | Pankration Champion |
| Any other above-ground event | +15 / +10 | **Arena Champion**; major win |
| Ascension | +50 / +150 (if newly Ascended) | **Ascended**; major win |
| Prophecy or Troy | +50 / +150 | — ; major win |
| Underground Pankration | +20 / +40 | Pankration Champion |
| Underground, bonus rounds k (k = rounds won + 1) | | k>2: **Pit Fighter** (+5/+5). k>5: **Pit Champion** (+15/+15, replaces Pit Fighter). k>8: **Giant Slayer** (+20/+20). k>10: **Pit Legend** (+20/+20, replaces lower). k≥14: **Bane of Tigris** (+20/+20). k≥11 adds +5/+5 and counts as a major win |

Only one new trait is granted per event. The pit chain is an else-if ladder, so a fresh gladiator who clears all 11 rounds still only gets Pit Fighter. Pit traits therefore climb one tier per pit tournament. Underground non-winners (knocked out) gain nothing. "Major wins" count toward the rudis request (§1.4).

### 6.6 Underground pits and bonus rounds
- After winning the 2-team bracket, the surviving team may keep fighting **bonus rounds** against scripted opponents (`UndergroundBattleFactory`). The player can **retire** between rounds and keep the rewards for the rounds already won.
- The code allows bonus rounds while the counter is ≤ N, so **N+1 rounds** are actually fought.
  - N = 10 normally (12 with Legendary Pit Fights).
  - N = ascension level + 1 for Ascension.
  - N = 1 for Prophecy, 3 for Troy.
  - N = 2 for Pankration (1 after Melankomas).
- Scripted normal-pit opponents: 1 Hungry wolf … 4 Hungry bear + Gorilla … 6–7 lions, wolves and bears … **8 Colossus** (16/10/50/10, level 10) … 9 Eques … 10 two Eques … 12 Provocator (level 12) … **13 Tigris** (24/14/80/28, level 14) with two level-8 lions (upgrade only).
- Beating the Colossus gives the *Giantslayer* achievement.
- Mounted opponents appear from bonus round 7 onward, and always in Ascension bonus rounds.

### 6.7 Auto-resolution instructions
See §1.1. In Nightmare, events the player auto-resolves are marked resolved.

### 6.8 Organizing a tournament
- **Player** (Events → Organize): costs **300 denarii**, fee 100.
  - Choose 1–3 combatants per team, 2/4/8 teams, the week (current+1 onward), beasts and mounts.
  - Named `<Dominus>'s tournament`; one per week.
  - The organizer earns the spectator-based reward (§6.3).
  - Completing it advances the *Organize* objective. Winning your own tournament gives the *Organizer* achievement.
- **AI:** §5.3 step 13.

### 6.9 Legends (Invader) tournaments and champion tiers
- **Hall of Fame snapshots:**
  - Each week (week >2, fame >10, or already inducted), the player's most famous gladiator is inducted. With 25% chance per week his full snapshot is uploaded: stats, age, traits, techniques with ranks, class, weapon proficiencies, gear, origin, reincarnation level.
  - It is stored with the ludus's **champion tier**, but only if the gladiator has World Champion.
- **Invader event:** weekly 25% chance (week >3, not custom, not multiplayer). Up to 20 snapshots are fetched whose snapshot week lies in (W − W/3, W + W/10), or (W − W/3, W + W/5) for a tiered event with matching tier. The player's own snapshots are excluded. At least 3 invader houses are required.
- **Gear:** invaders get era-appropriate gear when they have none: Old → Regular after week 20 → Quality after week 50 → MasterCrafted after week 80. In **Hard mode** the thresholds are earlier (Regular from the start, Quality after week 10, MasterCrafted after week 20). Hard mode at ascension >0 also adds Blessed weapons and Reinforced armor.
- **Tier of the event**, depending on the player's tier:
  - Bronze, or Silver with 50%: then 50% → Bronze.
  - Else Silver, or Gold with 50%: then 50% → Silver.
  - Else Gold or Diamond: 60% → Gold.
  - Else Diamond: 50% → Diamond.
  - Otherwise untiered.
  - Names: "Legends Tournament", "Bronze/Silver/Gold/Diamond Legends Tournament".
- **Winning** (`InvaderTournamentsParticipated`): None → Bronze. Winning an event of your current tier moves Bronze → Silver → Gold → Diamond. Gold → Diamond and each Diamond win also give a **Sand** item (origin upgrade).
- Achievements: *Legendary*, plus *Silver/Gold/Diamond Legend* for the tiers. Each win gives +10 extra influence.

---

## 7. Leagues

| League | Window | Pool (denarii) | 1st / 2nd / 3rd items | Winner trait | Activation effect |
|---|---|---|---|---|---|
| Lunar | weeks 0–13 | 700 | Gladius Quality Lunar / Regular Lunar / Old Lunar | Lunar Champion | starts with Gannicus 8 and Pontius 2 points (10 and 6 in Nightmare) |
| Solar | start max(week, 20), 20 weeks | 1000 | Xiphos MasterCrafted Solar / Quality Solar / Quality Solar | Solar Champion (Gwyn → **Lord of Cinders**) | weakest rival +400 and **Gwyn** (12/14/40/16, level 8, Retiarius; scales with mode and ascension) |
| Bacchus | ≥ week 50, 10 weeks after Solar/Jupiter/Vulcan, 5 after Annum | 1500 | **Thyrsus** / Hasta MasterCrafted / Hasta MasterCrafted | Bacchus Champion | — (player needs the upgrade) |
| Jupiter | ≥ week 85, 20 after Bacchus | 2000 | **Ancile** / Wooden shield MasterCrafted ×2 | Jupiter Champion | weakest rival +400 and **Jupiter Wolf** (14/6/500/35 beast) |
| Vulcan | ≥ week 120 (+15 gaps) | 3000 | Cuirass Quality Vulcan / Regular Vulcan / Old Vulcan | Vulcan Champion | weakest rival +500 and a Quality Cuirass (Reinforced in Nightmare) |
| Annum | after week 100: ≥ week 160, then every 16+ weeks | 2000 | random weapon type (Gladius / Hasta / Pugio or Parazonium / Securis / Spatha) MasterCrafted / Quality / Regular "Bloody" | Annum Champion | — |

**End-of-league rewards** (`League.rewardLeagueWinner`), by gladiator ranking:
- 1st: trophy, trait, pool/2 denarii, +20 influence, item (and the *Lunar/Solar Champion* achievement).
- 2nd: trophy, pool/3, +10 influence, item.
- 3rd: trophy, pool/6, +5 influence, item.

One house can take several places (the *League Sweep* achievement needs 1st–3rd in both Lunar and Solar). Only one league is active at a time (the first one whose window contains the week). League events outside every window score nothing.

---

## 8. Ascension (meta-progression)

### 8.1 Unlocking and the Ascension tournament
- **Requirements** (`World.hasAscensionRequirements`), all of:
  1. League 1st-place trophies + (1 if elected senator) **≥4** (≥5 at Mars ascension and above). Multiplayer pools the trophies of all players.
  2. **Spartacus/rebellion defeated** (§1.3 step 3).
  3. A **Shrine** with level >0 (any player's shrine counts in multiplayer).
  4. Timing: every even week if ascension is not yet unlocked in this run, otherwise only every 50th week.

  When all are met, the Ascension event replaces that week's underground rings.
- **Format:** 1v1 against the default house, then **bonus rounds 1…L+2** at current ascension level L, fought with up to 8 battle turns and mounts. The opponent in the second-to-last round fights "All Out".

| Bonus round | Opponent (STR/CUN/HP/INI, level) |
|---|---|
| 1 | Mad Rhino + Mangy bear |
| 2 | Saturn Horseman 20/14/80/16, L10 |
| 3 | Vulcan Juggernaut 30/10/100/14, L15, Titan |
| 4 | Solar Chosen 20/20/80/25, L20 |
| 5 | Son of Neptune 26/15/100/22, L25 |
| 6 | The Wise One 30/42/130/35, L30 |
| 7 | Venus Descendant 26/16/120/32, L35 |
| 8 | Great hunter 20/18/90/24, L28 (+ L15 companion) |
| 9 | Death Incarnate 20/25/130/30, L40 |
| 10 | Judgement 38/20/160/30, L45 |
| 11 | Benefit 25/20/100/30 + Rejuvenate 20/14/160/16, both L35 |
| 12 | The Warrior 44/20/150/33, L50 |
| 13 | The Messenger 30/46/140/75, L55 |
| 14 | One Eyed Giant 35/30/400/27, L60 |
| 15 | Harpy I + Harpy II |
| 16 | Manticore |
| 17 | Hydra |
| 18 | Wraith |

  So a Mortal run (L0) must beat round 1 and the Saturn Horseman; a Saturn run (L1) must also beat the Vulcan Juggernaut, and so on.
- **Winning without retiring:**
  - sets `ascendedUnlocked`;
  - the winning gladiator gains **Ascended**;
  - the account's ascension level for the current difficulty becomes L+1. Normal, Hard and Nightmare are tracked separately;
  - the winner is stored as the **ascended champion**, and the beast too with Undying Loyalty;
  - the winner's weapon type is stored as the favoured weapon for Ascended Weaponry;
  - the account ascension score is saved;
  - achievements are checked (*Ascension*; *Divine* at ascension ≥4, or ≥3 with the prophecy; *Radiance* at ≥9, or ≥8 with the prophecy).

  The run continues; Ascension events then recur every 50 weeks.
- **Prophecy (Pythia/Gods' Chosen chain):** winning the Prophecy tournament sets prophecy level = L+1 for the mode.
  - Effect: the next new game may start **one level higher** than the normal unlock (selectable level = max(ascension level, prophecy level + 1)).
  - Every new ascended game started with prophecy >0 includes a **Cyclops Eye** and +1 bonus reincarnation level.
- **Max ascension level:** 16.

### 8.2 Starting an ascended run and champion carry-over
- New game → ascension enabled → choose a level ≤ the unlocked level for that difficulty (or the prophecy bonus level). The champion of the matching difficulty is used (Nightmare falls back to Hard, then Normal).
- **Reincarnate young** (default):
  - age **15** years + 16 weeks + 4 weeks per reincarnation level; base stats **8/8/30/8**;
  - keeps his **first technique**; at an ascension level above 8 he also keeps his rare techniques as learnable;
  - keeps up to **1 valid trait (2 with the Ascendancy upgrade)**, filling with a random trait if fewer; Titan becomes Giant; Albino and Blind stay;
  - gains **Reincarnated**;
  - reincarnation level += min(old+1, chosen ascension) + bonus;
  - reinc >5: +5 to all weapon proficiencies; reinc ≥10: class XP 2 in every class.
- **Reincarnate old** (chosen on the champion screen):
  - keeps raw stats, all traits, techniques with ranks, level, class XP and proficiencies; +30 loyalty;
  - age = ageYears/20 + **54** years; Ascended is removed;
  - starts Ill for 2 weeks (3 at Apollo+).
- **Persistent reincarnation-level bonuses:** >1 injury-prone −1; >2 combat effect *Reincarnated*; ≥12 *ReincarnatedBlessed*; >3 +1 STR and +1 INI; >4 +1 CUN; >7 +5 HP.
- **Upgrades:**
  - *Ascendancy*: +1 kept trait, and early loyalty bonus of 15−week per week.
  - *Undying Loyalty*: the beast reincarnates too.
  - *Ascended Weaponry*: an Old "Broken Time-Warp" weapon of the favoured type.
- After setup, `ascensionStartOfGameEffects` runs (cascading).

### 8.3 The 16 levels
**Stacking rule:** both the start-of-game effects (`ascensionStartOfGameEffects`) and the weekly turn effects (`ascensionTurnEffects`) use switch fall-through. Level L therefore applies its own effects **plus all lower levels'** (confirmed in bytecode: the turn-effect switch has no breaks). The scattered `isMinimum<God>Ascension(level)` checks are also "≥" checks. Events marked "wN" happen at week N of the run.

| # | Name | Start-of-game effects | Weekly / timed effects | Other permanent modifiers (≥ level) |
|---|---|---|---|---|
| 1 | **Wealth of Saturn** | Every rival +1000 denarii, a Regular random weapon, +1 slave; Gigantus Tough; player projected income **−5/week** | w10: strongest rival + Regular Segmentata and +2 mining; player −1 mining. w20: all visible rivals +500 and a mine level. **w30: "Cronus" (Chosen of Saturn**, 15/10/45/10, L5, Decimate, Rally, Giant, Spear Specialist, Fury, Inspiring) + MasterCrafted Hoplon joins the rival with fewest gladiators; player −5 projected. w40: strongest rival +1000; player −1 mining | **Player gladiators age 2 weeks per turn**; certain early help decisions disabled |
| 2 | **Vulcan's Forging Destiny** | All rivals + Shoddy Segmentata | w10: rivals + Regular Precision weapon. w15: weakest + Old Vulcan cuirass. w20: rivals +500 and blacksmith. w30: blacksmith 2. **w60: Hephaestus** (18/14/65/12, L9, Titan, Impact; Disarm, Sunder) joins the **rebels** with a MasterCrafted Fuscina, +10 escaped, +1000 plunder | Buying items from rivals costs ×1.25 +0.1 |
| 3 | **Prowess of Sol** | All rival gladiators +50 XP; +1 escaped | After w3: every fit rival and rogue gladiator **+30 XP/week**. Every 20 weeks +1 escaped; w50 +2 | Rogue gladiators +50 XP/week; senate thresholds ×2; influence-loyalty uses 80% of influence; **influence-tree costs +1 step**; Caesar's and Crassus's champions tougher; Gwyn +1500 XP; harder adventures |
| 4 | **Wrath of Neptune** | (message) | w35: visible rivals improve training grounds. **w85: Poseidon** (Chosen of Neptune, 24/18/85/12, L15, Titan…) + MasterCrafted Bloody Fuscina + 1000 to the strongest rival | Disaster events; harder expedition weather |
| 5 | **Wisdom of Minerva** | Rivals +1 slave, +100; their gladiators +5 spear & dagger or sword & axe proficiency | w55: weakest rival +1000, + MasterCrafted Precision Hasta | Player intrigue actions −10 success; bribe and cheat costs up; buying gladiators/beasts ×1.25 |
| 6 | **Desire of Venus** | Rivals +1 spy, −5 opinion, 50% Bandages | **Every 3 weeks: player −1 influence** | Gladiator loyalty −1/−2/−3 per week (week <30 / <80 / more); election vote gains ½; buildings cost +50 (+500 for big ones); rivals may **sabotage** and **steal**; extra decisions |
| 7 | **Diana's Hunt** | Decimus gets the gorilla "Harambe"; other rivals a random beast; 50% Caltrops | Every 4 weeks: rivals' best beast +200 XP (player's +50). w10 / w15: weakest / strongest rival gets a Celtic horse (and stables). w12: weakest gets "Diana's Dire wolf". w28: strongest gets the elephant "Pachyderm" (if the player has a league trophy) | Stronger enemy beasts (Caesar's lion, Triumph beasts, adventure beasts, White Rhino) |
| 8 | **Pluto's killing** | Rivals +250; default house + Parazonium; player −1 projected | Every 28 weeks: visible rivals +100, player −1 projected. **Week L+5: the player's most famous fit gladiator becomes Horribly Disfigured** and Ill 2 weeks. w20: half of the rival gladiators +500 XP; player −1 projected | Player's injury modifier +1 in battle; more dangerous surgery; plague events; harsher adventures |
| 9 | **Judgement of Jupiter** | Rivals get Spartan training, training ground ≥2, extra shields; **player training base −3**; +2 escaped; player −1 projected | **Every week player −1 influence.** w48: **Jove** (16/16/65/16, L15) + MasterCrafted Precision Dory to the weakest rival; player −2 projected. Every 6 weeks after w8: a new rogue gladiator | Slaves: one fewer available, +10 price; rogues +50 XP/week; Spartacus +100 XP and Hero; boss champions +3000 XP |
| 10 | **Vitality of Juno** | Rivals +100, training +10, medicus up to 3; Vettius + Mandrake | w8: weakest rival gets **Life Drinker**. w16: "Rhino of Juno". w23 and w46: weakest +2 slaves and a Poseidon Amulet. After w100: 50% rogue leader +500 XP and a trait, else +1 escaped. Plunder >1000: −100 for +1 escaped every 3 weeks | Loyalty −1 per week; buildings +100; gladiator purchase ×+0.1 |
| 11 | **Violence of Mars** | Rivals training +10; every rival gladiator + a random trait (Gigantus +800 XP, Gannicus +400); training ground ≥3 | Every 7 weeks after w12: rogue leader 50% trait; rival gladiators 50% trait +200 XP. **w18: Ares** (Chosen of Mars, 14/7/70/10, L9) + MasterCrafted Blessed Securis + 1000 + 2 slaves to the weakest rival | **Ascension tournament needs 5 trophies**; player intrigue harder; expeditions −10%; Spartacus +Veteran, +Preparation, +1000 XP; Gwyn buffed |
| 12 | **Apollo's Prophecy** | Rivals +100, −5 opinion, +1 spy; Magnus gets **Sagittarius** (8/12/40/9; Hail of Arrows in Hard, All In in Nightmare) and a bow; all rival gladiators +1 CUN (Gigantus and Gannicus +2) | Every 24 weeks (before w100): all rival and default gladiators +1 CUN. Every 11 weeks with plunder >1500: −500 for a rogue gladiator | Loyalty penalty again (Venus size); **warnings of rival intrigue only 50% of the time**; AI cheat +1; old reincarnation Ill 3 weeks; custom gladiator rarer |
| 13 | **Creation of Gaia** | Rivals +50, +5 projected, +5 influence; Magnus gets **Harpy Podarge**, Solonius **Harpy Aello** | Every 20 weeks with plunder >1500: a rogue gladiator. w20: rivals +1 spy. w26: rivals +1 security slave, medicus ≥2; **Minotaur** (Giant) to the weakest | Slave price +10 / −1 available (50% each); bosses +XP |
| 14 | **Hyperion's Heights** | Three Hyperion tournaments (w2, w7, w13; Mysterious Egg prize); rivals +5 projected, +5 influence, Old Greaves, +1 slave; Decimus gets a **Mysterious Egg, Icarus** (Mythical, Flying) and a bow; Vettius +1000 | w20 (Hard): strongest rival gets Sand | Trade prices +0.1 (items) / +0.05 (gladiators) |
| 15 | **Depths of Tartarus** | Pontius and Faust gain **Lycanthropy**; Magnus Mandrake; every rival +1 slave | **w33: Draugluin** (werewolf, 20/12/75/26, L8) + Moonstone to the weakest. "Mysterious tunnels" messages and Tartarus events every 20 weeks | Loyalty −1 (−2 after w80); Spartacus All In + Decimate |
| 16 | **Reaping of Cronus** | (message) | **w13: Hannibal's ludus opens.** w20: **Perseus** (18/18/80/18, L6, Mythical, Hero, Devotion) + MasterCrafted Greaves to the weakest | **Curse of Time: the player's techniques all start on cooldown** in every battle; raid and rebel-attack changes |

### 8.4 Ascension scoring (leaderboard)
- `ascensionScore` = the normal level, or (hard level + 1), or (nightmare level + 2), whichever dominates by the code's comparison. +1 if the prophecy level of that top mode is at least its ascension level.
- The leaderboard sorts by score descending, then by fewer weeks. Being in the top 10 gives *Demigod*.

---

## 9. Objectives (quests) — `world.Objective`
Rewards are claimed manually. "Window" = weeks in which the objective can appear. "Dur" = weeks to complete (0 = no limit).

| Objective | Title | Trigger (window) | Goal | Dur | Reward |
|---|---|---|---|---|---|
| Guidance1–6 | Getting started (1/6 … 6/6) | new non-ascended game, chained | 1 buy a gladiator; 2 pick a technique; 3 buy a weapon; 4 register for a tournament; 5 advance a week; 6 open finances and recruit a worker | – | – (all six → *Student*) |
| ExpandLudus | Expand the ludus | mine or training ground at level 0 (week 1–10) | build a mine and training grounds | 10 | 50 denarii |
| RecruitSpy | Cloak and dagger | week >10, residence 1 (12–50) | residence level 3 and assign a spy | – | Old Reinforced Cloak |
| WheredoesItHurt | Where does it hurt? | a wounded gladiator (4–50) | build a medicus and perform surgery | – | Old Precision Pugio, +5 influence |
| Imperator | Imperator | army >20 and expeditions enabled (15–50) | expedition crushing the rebels | – | 200 denarii, +10 influence |
| Security | Security concerns | security <5 and (army >8 or rogues >2) (15–80) | 5 security slaves and a wall | 10 | 50 denarii, +5 influence |
| Poison | Underhanded methods | week >6, Vettius with fit Gigantus (6–30) | poison Gigantus | 10 | Old Reinforced Hood, 50 denarii, +5 influence |
| MountUp | Mount up | no stables, residence >1, >300 denarii, ≥120 influence, ≥10 slaves (20–100) | build stables and buy a mount | 20 | 100 denarii, +10 influence |
| Ascension | Ascension | week >20, a league win, not unlocked (25–1000) | milestones = min(league wins, 4) + senator + Spartacus defeated + shrine (≥6), then win the Ascension tournament | – | **MasterCrafted Blessed Xiphos** |
| ExertInfluence | Exert influence | influence ≥15 (3–200) | activate an influence action | 10 | 50 denarii |
| Organize | Organize tournament | influence ≥150 and a free week coming (50–400) | organize, then win your own | 25 | 100 denarii, +10 influence |
| Thievery | One man's loss | week >6, a rival >800 denarii, player <300 (8–200) | steal from a rival | 15 | Old Blessed Hasta, 50 denarii |
| BeastNaming | Name your beast | week >8, owns a beast, 50% (9–200) | rename a beast | – | +5 influence |
| Pythia1 / Pythia1Alt | Pythia (1/4) | Pythia story | 4 combatants with fame ≥1000 / hold **10000 influence** | – | +10 influence |
| Pythia2 | Pythia (2/4) | – | send an adopted gladiator to Delphi | – | +10 influence |
| Pythia3 | Pythia (3/4) | – | train Neokoros: win the pits (Pit Champion) and a league | – | +25 influence |
| Pythia4 | Pythia (4/4) | – | **100 slaves and 10000 denarii** (sacrifice) | – | **Danaid Dagger**, +100 influence → starts the GodsChosen story |
| GodsChosen | Gods' chosen | – | win the **Prophecy** tournament | – | **1000 denarii, Cyclops Eye** |
| TrainLoanedGladiator | Train loaned gladiator | rival TrainGladiator story | +5 total stats and +100 fame on the loaned gladiator | 10 | 100 denarii, +25 influence |

---

## 10. Win and lose conditions, score and the end screen

### 10.1 Losing
The player is defeated by:
- **DebtPileUp** (two consecutive negative-balance weeks after emergency measures, §1.2);
- **SlaveBetrayal** (loyalty uprising);
- **Raid** (rival raid);
- **SlaveAttack** (rebels ransack the ludus);
- **Surrender** (save-slot menu).

On defeat, `DefeatedActivity` shows "You gathered X total influence" and "Your ludus survived for N turns", plus a tips page. The run is over and the highscore is saved with the defeat reason.

### 10.2 Winning
There is **no victory screen**: the sandbox is open-ended. The goals are:
- **Imperium score** = influence × (1.0 Normal, 1.5 Hard, 3.0 Nightmare). Uploaded on even weeks after week 3 (needs influence ≥10, leaderboard season 6) and on defeat. Top 10 per season gives the "Season N Champion" achievement.
- Hall of Fame (top fame);
- league trophies;
- **Ascension**, the real meta goal: 16 levels × 3 difficulties, plus prophecy.

Leaderboards: Highscores (Imperium), Hall of Fame (fame), Ascension (score, then weeks), each with "mine" and "friends" filters. From the Hall of Fame you can **challenge** a top champion with one of your own Hall-of-Fame gladiators in an exhibition 1v1 (no stakes); a win gives *Challenger*.

### 10.3 Entombed and resurrection
- Dead player gladiators are buried in the Tomb, keeping at most 5 (the lowest score `fame + level + 10×leagues won` is evicted).
- **Resurrection** requires Pluto's favour (Temple of Pluto building), ascension ≥1 or sandbox, and works only on **Reincarnated** gladiators.
- Cost: 100×level + 1000 + fame/5 + 50×traits denarii. Side effects: −1 slave, −10% influence, all rivals −10 opinion, all own gladiators −20 loyalty.
- The gladiator returns with **Undeath** and his injury downgraded twice.

---

## 11. Achievements (gems; "H" = hidden)
Gems also come from purchases (500 small, 1500 large).

| Achievement | Name | Gems | Condition (code) |
|---|---|---|---|
| WonTournament / Hard / Nightmare | Champion of the arena | 50 each | win any above-ground, non-Rookie, non-Junior tournament |
| EliminateOpponent | Veni Vidi Vici | 100 | a rival ludus destroyed (bankrupt, burned or ransacked) |
| DefeatGigantus | The bigger they are.. | 100 | win "Who can defeat Gigantus?" |
| ColossusSlayer / Hard | Giantslayer | 100 / 100 | beat the Colossus (pit round 8) |
| Influencer / Hard / Nightmare | Influencer | 100 each | >100 influence (Nightmare: >1000) at week start |
| Famous | Famous | 100 | a gladiator with >100 fame |
| LegendsChampion | Legendary | 100 | win a Legends (invader) tournament |
| GreedIsGood | Greed is good | 100 | ≥2000 denarii |
| PeopleManager | People manager | 100 | ≥5 gladiators, all loyalty ≥80 |
| Organizer | Organizer | 100 | win your own tournament |
| Assassin | Et tu Domine? | 100 | kill a rival gladiator by poison or assassination |
| WinSenateElections | Politician | 100 | elected senator |
| MasterOfOne | Master of One | 100 | 100% class proficiency |
| Adventurer / Hard / Nightmare | Adventurer | 50 each | finish an adventure |
| Builder | Builder | 100 | residence >2 and training grounds >1 |
| Apprentice | Apprentice | 50 | forge something |
| EyesCanDeceive | Your eyes can deceive you | 100 | win with a fully blind solo gladiator |
| Demigod | Demigod | 100 | top-10 ascension score |
| Imperator | Imperator | 100 | successful expedition |
| LunarChampion / SolarChampion | Lunar / Solar Champion | 100 | 1st in that league |
| LeagueDomination | League Domination | 100 | >5 league wins (all leagues plus an Annum) |
| LeagueSweep | League Sweep | 100 | top 3 in Lunar and Solar (×3 each) |
| Dejavu | History Repeats | 100 | let Spartacus revolt, then kill him on an expedition |
| Ascension | Ascension | 100 | win an Ascension tournament |
| Divine / Hard / Nightmare | Divine | 100 | reach ascension level 5 (code: win at level ≥4, or ≥3 with prophecy); Nightmare variant requires DivineHard |
| Radiance / Hard / Nightmare | Radiance | 100 | reach level 10 (code: ≥9, or ≥8 with prophecy) |
| Student | Student | 50 | all Guidance objectives |
| OneManArmy | One man army | 100 | one gladiator beats 3 opponents |
| WeaponsMaster | Weapons Master | 100 | master proficiency in all 6 weapon types |
| ConduitOfTheGods | Conduit of the Gods | 100 | all Pythia assignments (requires WonTournament) |
| Prophecy | Prophecy fulfilled | 100 | win the Prophecy tournament |
| Favoured | Favoured by the Gods | 100 | win with a Celestial Champion (≥4 favour) |
| Decanus | Decanus | 50 | a level-10 gladiator |
| SeasonSixChampion | Season 6 Champion | 100 | top-10 Imperium in season 6 |
| H: BetaChampion, SeasonOne–FiveChampion, FirstAnniversary (win with no techniques equipped), SecondAnniversary (beat a foe after blinding, disarming and stunning), TonsOfDamage, BugHunter, StillStanding (all six wound traits), Cooperation (Spartacus defeated in multiplayer), Devastation (last standing in multiplayer), AscendTogether, Challenger, Completionist (every influence opportunity), Silver/Gold/DiamondLegend (50 each) | | 100 (50 for legends) | as named |

---

## 12. Gem shop upgrades (meta unlocks; `common.Upgrade`)
Format: name — gem cost — prerequisite or locked-by achievement.

**General**
- Senator Influence Tree — 250
- Hard Mode — 300
- Auto Manage by Doctore — 200
- Release Arena Beast — 100
- Rhinoceros — 150
- Cloud Sync — 50
- Ascendancy — 100 (locked by *Ascension*)
- Greek Heritage — 150
- Egyptian Ancestry — 200 (parent: Greek Heritage)
- Gladiator Editor — 200 (locked by *People manager*)
- Instructions — 100
- More Save Slots — 50 (locked by *Student*; 3 → 5 slots)
- War Elephants — 250
- Nightmare Mode — 200 (parent: Hard Mode; locked by *Divine (hard)*)
- Tactician (technique order) — 100
- Undying Loyalty — 150 (locked by *Divine*)

**Gladiator**
- Weapons Master trainer — 100
- Rally — 100
- Disarm — 100
- The Great Spiculus — 100
- Sneak Attack — 100 (locked by *Assassin*)
- Hail of Arrows / Sagittarius — 100 (locked by *Adventurer*)
- Cestarii — 150 (locked by *Student*)
- Thunder Strike — 100 (locked by *Favoured*)
- Lorarii — 100 (locked by *Influencer*)

**Events**
- Traveling Merchant — 100
- Legends of Mars — 150
- The Lost Blade (Crocea Mors) — 150
- Axe of the Founder — 150
- League of Bacchus — 150
- Vulcan League — 150
- Carthaginian Artifacts — 150
- Legacy of Alexander — 150
- Legendary Pit Fights — 100 (locked by *Giantslayer*)
- Hannibal's Legacy — 150 (parent: Carthaginian Artifacts)
- Spartan Dynasty — 200 (parent: Hoplon)
- Restoration of Troy — 150 (locked by *Giantslayer*)

**Buildings**
- Temple of Pluto — 150
- Master Smith — 150
- Supreme Armory — 150 (parent: Master Smith)
- Aqueduct — 150 (locked by *Builder*)
- Athenian Artifacts — 200
- Tinkerers Workshop — 150 (locked by *Apprentice*)
- All roads lead to Rome (mansion) — 150 (locked by *Builder*)

**Equipment**
- Champion Helmet — 100
- Spatha — 100
- Parazonium — 50
- Sica — 100
- Hoplon — 100
- Leather Armor — 100
- Gallic Helmet — 50
- Segmentata & Galea — 150
- Celtic War Horses — 200
- Celtiberian Weaponry — 100
- Ascended Weaponry — 150 (locked by *Ascension*)
- Cataphracts — 100

Upgrades can be refunded (`refundUpgrades`). Current gems = all achievement gems + bought gems − spent gems.

---

## 13. Notable quirks and bugs (as implemented)
1. `Opponent.reactToPlayerAction` falls through its switch, so even Honest rivals lose opinion (−2) when the player acts against them.
2. Tournament "entrance fees" only scale prizes; nobody pays them.
3. When marketSeed = 0, an Epic gladiator appears every week from week 11 to 29 and every week after week ~102.
4. Bonus-round loops use `≤ N`, so N+1 bonus rounds are fought. This is consistent with the round content (Colossus at 8, Tigris at 13 with N=12).
5. `Opponent.hardMode` is never set, so Hard-only special-entrant tweaks in the pits never fire.
6. Cunning age multiplier returns 1.0 at age ≥100.
7. The Highscore "season" gate: scores are written only when season >5 (current season is 6).
8. (?) Retiring from Ascension bonus rounds still runs `AwardWinningGladiators`, which appears to grant the *Ascended* trait. Only a full clear sets `ascendedUnlocked` and raises the account's ascension level.
9. In several "decompiled incorrectly" methods, jadx's restructured output is misleading: inverted hard/normal week ternaries in `World.AppendWeek`, a forced `traitType = null` in `winTournament`, and spurious `break`s in `ascensionTurnEffects`. Re-read such methods in jadx fallback mode when in doubt.
