# 05 — Intrigue, Bribery, Influence/Politics, Loyalty and Security

Source: jadx decompile of `com.rene.gladiatormanager`. Main files: `world/intrigue/*`, `factories/BribeFactory`, `world/influence/*`, `world/loyalty/*`, `world/Dominus`, `world/Player`, `world/Opponent`, `world/Gladiator`, `state/WeekResolver`, `state/World`, `factories/DecisionFactory`, `factories/RogueGladiatorAttackFactory`, and the activities `IntrigueReportActivity`, `AgentSelectionActivity`, `DominusDetailsActivity`, `InfluenceActivity`, `OpportunityInfoActivity`, `ElectionsActivity`, `BribeActivity`, `TournamentBattleActivity`, `BettingDetailsActivity`.

Conventions:
- `rand(n)` means a uniform integer from 0 to n−1.
- "S" is a house's **security total**. "SDR" is the security diminishing-returns value (§5).
- Integer division truncates, as in Java.
- **[UNCERTAIN]** marks code that jadx decompiled badly or that looks like a bug. Those points should be checked in-game.

---

## 0. Key concepts and shared state

| Concept | Definition (code) |
|---|---|
| Security total `S` | `max(0, securitySlaves − securityPenalties + buildingSecurityBonus)` (`Dominus.GetSecurityTotal`). `securityPenalties` grows with Public Training Sessions (+1) and Gladiator Campaigning (+2, or +4 on hard). It shrinks by 2 when you win the Consul election (the lictors). |
| Building security / influence | Residence L0–L4: influence 0/2/3/5/8 per week, security +0/1/2/4/10. Spies unlock at Residence L2. Wall L1/L2: +1/+2 influence, +2/+5 security. Guard Tower L1: +1 influence, +10 security, +1 committed spy. Tavern: +10 influence, +100 denarii, +2 security, +3 to the entertainment loyalty term. Other buildings add their own amounts (see [02 §8](02-items-economy.md)). |
| Spies | Slaves assigned to the spy job (`_spies`). **Committed spies** = the spy count saved at the start of the previous weekly tick (`spiesLastTurn`), plus 1 if you have a Guard Tower. Newly assigned spies therefore count only from the next week ("Give your spies some time to gather intel!"). The spy job needs Residence ≥ L2 (`canUseSpies`). |
| Entertainment total `E` | Entertainment slaves plus `_entBonus` (permanent bonuses from events). |
| Opinion (AI rivals) | Starts at 50. Some scripted rivals start lower: −10, or −5/−10/−15 by difficulty. The stored value can go negative; `GetOpinion()` shows a floor of 1. UI labels: >60 Favourable, 40–60 Neutral, 16–39 Unfavourable, ≤15 "Sworn enemy". An active Ludus Pact ally is labelled "Alliance". |
| Influence | Never drops below 0. Unlocking an Opportunity **reserves** influence (`allocatedInfluence`) rather than spending it. Available influence = influence − allocated. |

---

## 1. Intrigue actions (player vs rivals, and rivals vs player)

### 1.1 Access, cost and flow
- **Where:** Intrigue screen → pick a rival (sorted by influence) → `DominusDetailsActivity`. That screen offers **Sabotage**, **Steal** and **Raid** against the house. Raid appears only with the *Veil of Night* opportunity and never against another human player. Opening a rival gladiator offers **Persuade**, **Poison** and **Assassinate**.
- **Agent:** any of your gladiators who is active this week, fighting fit, and not on an adventure. Beasts cannot be agents.
- **Cost:** no gold or influence. The real cost is that the agent is set inactive for the week, so he cannot enter tournaments. The only direct charge is the "goat sacrifice" scenario (below). There is no weekly cap except available agents. One action per agent per week.
- **Chance shown:** the UI shows the min–max `computeChance` over all your eligible agents.
- **Attacker scenario prompt.** Before resolution the attacker gets one random situation. You either **Proceed** or **Retreat**. Retreat costs nothing: the agent is still used up for the week, gains +15 XP, and has a 10 % chance (`rand(20) > 17`) to gain *Careful*. When you proceed, the scenario modifies the roll:

| # | Text key | Roll modifier on proceed | Other effect |
|---|---|---|---|
| 0 | dark_night | +5…+19 | |
| 1 | raven_flying_left | −0…−39 | |
| 2 | goat_sacrificed | +0…+39 | Attacker pays 50 denarii (sometimes 100, see quirks) |
| 3 | party_ongoing | −10…−39 | Detection check −50. On failure the agent's injury roll counts as +20 (milder). |
| 4 | sprained_ankle | −5 | On failure the injury roll counts as −20 (worse) |
| 5 | everything_going_as_planned | +5…+14 | |
| 6 | agent_paranoid | 50 %: −20, else 0 | |
| 7 | agent_spots_loot | −10 | On success +100 denarii (+200 if final roll > 150) |
| 8 | agent_spots_bystanders (Sabotage only) | 0 | On a natural 100 roll: agent gains *Ruthless*, rival opinion −10, target loses a slave. Attacker influence −10 in some cases. |

- **Defender prompt.** This appears only when a rival targets *you*; AI-vs-AI defence uses no choices. You choose Assertive (1) or Passive (−1). The prompt is picked from `playerScenario = rand(8)` and re-rolled when its precondition is missing:

| Prompt | Assertive | Passive |
|---|---|---|
| spies_intel ("hire night guards, 50 d") | −25 to attacker roll; nominal −50 d (see quirks) | 0 |
| security_disagreement (move guards to gladiators) | Gladiator-targeted actions (assassinate/poison/persuade): −25. House-targeted actions: +20. | The opposite: house-targeted −25, gladiator-targeted +20 |
| security_for_friend (lend guards to a senator) | +10 to attacker, +10 influence | −10 to attacker, −10 influence |
| intrigue_bad_feeling (call the town watch) | −30 to attacker, −10 influence | −5 to attacker |
| good_boy_restless (BestBoy/GoodBoy beast guards) | −25; the beast misses the week; may gain *Loyal* (otherwise net −20) | +5 |
| loyal_glad_guards (a *Loyal* gladiator guards) | −20; that gladiator misses the week; 50 %: *Alert* trait, otherwise net −15 | +5 |
| gladiator_worried (a *Paranoid* gladiator) | +15 | −5 |
| gladiator_worried (the target himself) | −25; 10 % the target gains *Paranoid* (otherwise net −20) | +5 |

### 1.2 Shared modifiers
- **SpyBonus** = clamp(2 × attackerCommittedSpies − defenderCommittedSpies, −15, +15).
- **StandardPenalties** (subtracted from the chance):
  - −5 if the attacker is a player with *Informants*; otherwise +5 if the defender is a player with *Informants*.
  - +5 if the target gladiator has reincarnation level ≥ 11.
  - +5 if the target is *Paranoid*.
  - −5 for each defender gladiator secretly spying for the attacker.
  - +5 for each attacker gladiator spying for the defender.
  - Ascension (player attacker only): +10 at Minerva (asc ≥ 5); +5 more at Mars (asc ≥ 11). Mars does not apply to Persuasion.
- **GlobalBonuses:** +5 if the agent's armour has *Stealthy*, +5 if his helmet has *Stealthy*.
- **PvP (target is another human):** Poison, Sabotage and Raid take −10 (target S ≤ 2) or −15, and −5 more if S > 5. Steal takes −5 or −7, and −2 more if S > 5.
- Some formulas subtract 1 for each of the thresholds 50/60/70/80/90 the chance passes ("diminishing").

### 1.3 Detection (`checkDiscovered(agent, base)`)
- Discovered if `rand(100) + base + D > 99`. So P ≈ (base + D)/100.
- **D** = 2 × defenderCommittedSpies − attackerCommittedSpies. D is trimmed by 1–4 points once it passes 30/40/50/60.
- If the defender is a player: +10 as Princeps Senatus, +5 as Consul, +15 with *Informants*.
- The party scenario subtracts 50 from `base`.
- **Base values:**
  - Assassinate: 25 (target wounded), 30 (target unhurt), 35 (failure).
  - Poison: 15 success, 25 failure.
  - Persuade: 5 success, 15 failure.
  - Steal: 5 success, 25 failure.
  - Sabotage: 35 success, 55 failure.
  - Raid: no detection check.
- **On discovery:**
  - The defender stores the agent's id (`setIntrigueCaught`). This unlocks the Consul "Uphold the law" event (§3.7).
  - An AI defender loses 1 opinion, plus a 50 % chance of another −1.
  - A human defender sees the attacker's identity; otherwise the report shows "Unknown".
- **Opinion cost of every player action against an AI rival:**
  - 50 % chance of −1 when the action resolves.
  - −4 on success, −2 on failure (`IntrigueReportActivity`).
  - −1 to −2 if discovered.
  - Sabotage: another −1. Raid: −10.

### 1.4 Assassination (`AssasinationAction`)
1. `best` = the agent's largest stat gap over the target, plus the average gap. For gaps dS, dC, dI (agent − target in Str, Cun, Ini): best = max(dS, dC, dI) + (dS + dC + dI)/3.
2. Add +10 if the target is injured. Add for target loyalty: +5 if < 50, +10 if < 25. The intended +15 for loyalty < 10 is lost to a code bug, so it stays +10.
3. x = best + 15 (*Assassin*) + 5 (*Sneaky*) + 3 (*Hunter*) − SDR(defender) − 7 (target *Alert*).
4. If x ≤ 0 the chance is 15. Otherwise chance = clamp(15 + 4x + SpyBonus/2 − Penalties + Global, 15, 99).
5. **Roll:** chance + scenario + 1 (if chance > 80) + 1 (if chance > 90) + rand(101). **> 100 succeeds.**

**On success** (+20 XP):
- A target already at *MultipleInjuries* dies.
- Otherwise the target takes an injury of severity InjuryProne + (roll − 100), with +5 if already injured and +3 if the agent is *Ruthless*.
- If the target ends up injured, the attempt is logged as a success and the agent has a 20 % chance of the *Assassin* trait. If he stays unhurt it is reported as a failure, although `resolve` still returns true.
- An achievement and Murder Plot story progress trigger if the victim dies.

**On failure** (+10 XP): the agent is injured with severity InjuryProne + (100 − r)/8. Here r is the roll, +20 for the party scenario, −20 for the sprained ankle, +10 if the agent is *Careful*. The agent can die.

**[UNCERTAIN / apparent bug].** `IntrigueReportActivity.initAction` builds the action that actually resolves as `new AssasinationAction(victim, actor, actor)`. The **target house is the attacker's own house**. Every other action passes (victim, target, actor) correctly. Consequences at resolution:
- Security, spies and *Informants* are read from the attacker's own ludus.
- The defender-prompt effects (loyal guards, influence changes) apply to the attacker's ludus.
- When a rival assassinates you, your security and spies are not consulted.

The chance shown in the agent picker, and the AI's go/no-go check, use the correct houses.

### 1.5 Poison (`PoisonAction`)
1. x = 1 (*Sneaky*) + 6 (*PoisonMaster*) + 1 (*Psychopath*) − 7 (target *Alert*) + [3·Cun(agent) − (MaxLife(target)/10 + Cun(target)/2) − SDR(def)] − 5.
2. chance = (x > 0 ? 3x : 0) + 30 − 25 (target *Mithridatism*) + SpyBonus − Penalties − Cun(target)/4 − 3·WallLevel(def) − 10 (target equipped with a *PoisonResistance* item) [− PvP] + Global.
3. Apply the diminishing at 50–90. Clamp to 0–99.
4. **Roll:** chance + scenario + rand(101). If chance > 70: 50 % chance of +rand(5). If chance < 35: 50 % chance of −rand(5). **≥ 100 succeeds.**

**On success** (+20 XP; Poison objective progress):
- If the target has an Antidote assigned, the antidote is consumed and the poison has no effect. A spare antidote, if any, is auto-assigned.
- Otherwise a final roll > 160 (+5 if the agent is *Ruthless*) kills the target. Below that the target is *Ill* for 2 weeks, with a 20 % chance of *Mithridatism*.
- The agent has a 20 % chance of *Poison Master*.

**On failure:** agent injury of severity InjuryProne + (100 − r)/10. The target has a 10 % chance of *Mithridatism*.

### 1.6 Persuasion: turning a rival gladiator (`PersuasionAction`)
1. x = 2 (*Underhanded*) + ⌊3·Cun(agent) − 2·Cun(target) − 0.75·(SDR(def) + defenderEntertainmentSlaves)⌋.
2. chance = (x > 0 ? 2x : 0) + 25 + SpyBonus − Penalties (Minerva +10 only; no Mars).
3. Target trait modifiers: +5 *Untrustworthy*, +5 *Underhanded*, −5 *Fanatic*, −5 *Careful*.
4. Agent trait modifiers: +5 *Tactician*, +5 *Inspiring*. Add Global. Clamp to 0–99.
5. **Roll:** chance + scenario + rand(101) **≥ 100.**

**On success** (+15 XP):
- The target loses loyalty: −35 if the roll > 150, otherwise −20.
- Conversion score = (roll > 150 ? 1 : 0) + 1 (target loyalty now < 30) − 2 (*Loyal*) + 1 (*Untrustworthy*) + 1 (*Sneaky*) + rand(10).
- A score **> 7** makes the target a **spy** for the attacker. The base rate is 20 %.

**On failure:** +5 XP. There is **no injury risk**.

**What a turned spy does:**
- In any tournament battle against the house he spies for, he is forced to the **Throw** instruction (`checkGladiatorSpies`).
- Each spy gives his master +5 intrigue chance against his own house; the other way round it costs −5.
- The victim may uncover him through the "Gladiator suspected" event (§4.7).

### 1.7 Steal (`StealAction`)
1. secBand = 0 / 3 / 5 / 8 for defender S < 1 / < 10 / < 20 / ≥ 20.
2. wealth term from defender denarii:
   - < 100: −20.
   - > 5000: +25. > 1500: +18. > 300: +3. The "> 500: +7" branch is unreachable.
   - Then +5 (> 7000), +5 (> 10 000), +10 (> 50 000), +10 (> 100 000).
3. x = (Ini + Cun/2)/2 + wealth − (SDR/2 + secBand) + traits:
   - +5 *LightningSpeed*, −5 *Giant*/*Titan*, +5 *Untrustworthy*, +5 *Sneaky*, +15 *Thief*, +2 *Ambidextrous*.
   - −5 *Loyal*/*Lawbringer*, −5 *MissingFingers*/*Blind*/*PartiallyBlind*.
   - If x ≤ 0, halve it.
4. chance = x + 30 + SpyBonus − Penalties [− PvP] + Global. Apply diminishing. Clamp to 1–90.
5. **Roll:** rand(101), +30 if it is > 95, then + chance + scenario. **≥ 100 succeeds.**

**On success** (+20 XP; Thievery objective progress):
- If the victim is AI, 2 of its miners move to security, and 1/3 of the time an entertainer becomes a spy.
- **Critical (> 150):**
  - 50 %: steal a random equipment piece (AI victims only).
  - Otherwise: steal a random weapon (AI only).
  - Otherwise gold: 200, plus denarii/60 when the victim holds 2 000–20 000, plus denarii/200 at ≥ 20 000. The amount is halved if it exceeds 2 000.
  - 50 % chance of the *Thief* trait.
- **Normal success:** take 100 + (victim denarii/40 if the victim holds > 2 000).

**On failure:** agent injury of severity InjuryProne + (100 − r)/14.

### 1.8 Sabotage (`SabotageAction`)
1. secBand = 0 (S < 1) / 5 (< 10) / 10 (< 20) / 15 (< 100) / 20.
2. x = (Cun + (Str + Ini)/2)/2 + 3·ConstructionLevel(def) − (SDR/2 + secBand + 10) + traits:
   - +5 *Psychopath*, +2 *Ruthless*, −5 *Hero*, +5 *Untrustworthy*, +5 *Sneaky*, +10 *Pyromaniac*, +2 *Tactician*, −2 *Careful*.
   - If x ≤ 0, halve it.
3. chance = x + 30 + SpyBonus − Penalties [− PvP] + Global. Clamp to 1–90. Bigger ludi are easier to sabotage.
4. **Roll:** rand(101). A natural 100 becomes 150 (and triggers the bystanders effect in scenario 8). Add chance + scenario. **≥ 100 succeeds.**

**On success** (+20 XP; rival opinion −1):
- If roll % 4 == 0: a miner moves to security. If roll % 3 == 0: an entertainer becomes a spy.
- **Critical (> 150):** 2 random buildings lose a level, −50 denarii, −2 slaves, 50 % chance of *Pyromaniac*.
- **Normal:** 1 random building loses a level and the victim pays −50 denarii.
- Building choice (`loseRandomBuilding`): a random slot from 0–7 (stables, temple, medicus, blacksmith, mine, walls, training ground, residence). If that building is missing, the next slot is tried, with no wrap-around.
- [bug] `destroyStables` only works if the victim has a Shrine.

**On failure:** agent injury of severity InjuryProne + (100 − r)/10, and opinion −1.

### 1.9 Raid (requires *Veil of Night*; AI targets only)
The player's raid is resolved as a **real battle**, not by a dice roll. `RaidAction.computeChance` is only displayed, and `RaidAction.resolve` is never called.
- **Attackers:** the leader plus your most famous other available gladiator, so 2 fighters. They get *Surrounded* and the *Kill* instruction.
- **Defenders:**
  - Up to 3 gladiators/beasts, fighting with the *Walled* bonus and the *AllOut* instruction.
  - A defender with few gladiators drafts slaves as fighters: one if slaves > 3 and < 2 gladiators present; another if slaves > 15 and < 3 present; another if slaves > 30 and < 4 present.
  - At Cronus ascension the attacker gets *CurseOfTime*.
- If the target has **no gladiators present**, you win automatically ("bonus" win).
- **Win (`winBattle`):**
  - Victim −150 denarii; you +50 denarii and +10 influence (victim −10).
  - Every victim gladiator −25 loyalty.
  - Victim loses 2 slaves, +1 if it has > 20 slaves, +1 if > 50, +1 on a bonus win.
  - If the victim is now at < 1 slave or < 3 present gladiators:
    - if it has > 500 denarii and construction level > 1, or any healthy gladiator: it loses ¼ of its denarii and a random building;
    - otherwise **its ludus is destroyed** (`DefeatReason.Raid`).
  - Otherwise the victim loses 1/20 of its denarii.
  - A bonus win also steals one random equipment piece.
  - Winners gain `winEvent(20)` fame and XP.
- **Loss:**
  - −10 influence (event stake), −5 more influence.
  - You lose a spy slave.
  - Every rival's opinion −2.
  - **All your gladiators −25 loyalty.**
- The unused dice formula, for reference: x = Cun + Level − (20·WallLevel + SDR) + secBand/2 + traits, then chance = x + 30 + SpyBonus − Penalties.

### 1.10 Rival AI intrigue against the player (`Opponent.considerIntrigueVsPlayer`)
Each week every AI rival evaluates n = rand(120) − rawOpinion/2. Modifiers:
- +10 on Nightmare; +10 for Hannibal.
- Normal difficulty at ascension 0: −10 while week < 5, −5 while week < 15.

| Action | Trigger | Further requirements | AI picks it if its chance is |
|---|---|---|---|
| Assassination | n > 120 | Rival has > 2 gladiators and an available agent. Target: 50 % a random available gladiator, otherwise your most famous. | > 35 |
| Sabotage | n > 105 | You are not yet targeted this week; your construction level > 4; **Venus ascension (≥ 6) or Nightmare only** | > 40 |
| Steal | n > 95 | Not yet targeted; you hold > 200 denarii; Venus+ or Nightmare only | > 40 |
| Persuasion, falling back to Poison | n ≥ 85 | Not yet targeted; **your influence > the rival's**; you have > 2 gladiators (> 0 on hard). Target: random or most famous; 50 % Spartacus if you own him. | Persuade if > 40 and target loyalty > 50, or > 30 when you own Spartacus. Otherwise poison if > 30. |

- Sabotage, Steal and Persuasion/Poison form one else-if chain. Assassination is checked separately, so several rivals can try to assassinate in the same week.
- Being targeted sets a weekly "targeted" flag that blocks the other actions. At Apollo ascension or on Nightmare the flag is set only 50 % of the time, which allows several attacks per week.
- **Practical frequencies** (normal difficulty, no modifiers):
  - At opinion 50 only Persuasion/Poison can fire (rand ≥ 110 → about 8 %).
  - At opinion 20: Persuasion/Poison about 21 %, Steal about 12 %, Sabotage about 3 %. Steal and Sabotage are possible only at Venus+ or on Nightmare; when they are, they take the highest rolls first, which leaves Persuasion slightly less.
  - Assassination needs a raw opinion ≤ −4 for ordinary rivals, ≤ 17 for Hannibal or on Nightmare, and ≤ 37 for Hannibal on Nightmare. Early-week penalties make it harder still.
- AI rivals **never** run intrigue against each other.
- The pending action resolves when you open the week report (`WeekReportActivity` → `IntrigueReportActivity` with the defender prompt).

### 1.11 Ruining rivals (summary of levers)
- **Raids** can delete a ludus outright once it has < 3 gladiators present or no slaves. Thin out its roster first with Assassinate and Poison.
- **Sabotage and Steal** drain buildings and coin. AI victims also lose miners to security, which hurts their income.
- **Persuasion** creates spies who throw fights against you and lowers the target's loyalty. Low loyalty makes escapes and uprisings more likely (§4), and a successful AI uprising destroys that house ("burned to the ground").
- **Rebel attacks:** see §6.

---

## 2. Pre-battle bribes and cheats (`BribeFactory`, `BribeActivity`)
- Opened from the tournament battle screen.
- One player cheat per battle (`hasFirstCheated == null`).
- Costs double at Minerva ascension (≥ 5).
- The "cheap" rate applies in Underground, Rookie and Junior tournaments. The eligibility check uses only the underground flag.

| Bribe | Cost (normal / cheap) | Requirement | Effect |
|---|---|---|---|
| Poisoned weapons | 30 / 20 per **own** gladiator | Enough denarii | Your fighters get the `PoisonedWeapons` combat effect. Each damaging hit also deals poison damage of about maxLife/10 + 2 (maxLife/20 against PoisonResistance). ×1.5 with PoisonMaster. Halved by poison immunity. −1 if the victim is more cunning. |
| Enchain opponents | 20 / 15 per **enemy** gladiator | Enough denarii | Enemies get `Chained` for the whole battle (99 rounds): initiative reduced by ⅔ of base initiative. |
| Release wild animal | 80 (halved with Lobby-the-Senate or Senator status) | *ReleaseBeast* upgrade; **not underground**; your side has ≤ 2 fighters | Adds an escaped beast to your side whose level is the sum of the enemy levels + 1. |
| Replace guards | 25 | **Elected senator** (and `hasSenatorInfluence`); not underground | Blocks the opponent from cheating and strips any cheat they already applied. |

**AI cheating (`activateOpponentCheats`).**
- Checked once per battle from week 2 onward, if the AI is still allowed to cheat.
- likelihood L = `howLikelyToCheatAgainst`:
  - +1 if your influence > the AI's; +1 for Hannibal.
  - AI denarii > 500: +2; > 200: +1; < 100: −1.
  - Opinion < 45: +1; < 25: +1; > 55: −1; > 75: −1.
  - +1 at Apollo ascension.
  - Champion comparison ±1. The code only checks the **last** listed fighter on each side for the ArenaChampion/PitFighter/PitChampion traits.
  - Fame totals ±1.
  - Personality: Honest 0, Neutral +1, Dishonest +3, Treacherous +5.
  - Seeded personalities [inferred from Seed order]: Batiatus and Hannibal Treacherous; Decimus Honest; Solonius, Vettius and Caesar Dishonest; Magnus and Crassus Neutral; random rivals Neutral or Dishonest.
- The AI **cheats if rand(8) + L > 9**, so L ≥ 3 is needed.
- Which cheat:
  - If it can release a beast, L > 5 and rand(3) > 1 (1/3), and it is not Hannibal: it releases a beast.
  - Else if it can afford chains: 50 % poisoned weapons (if affordable), otherwise chains.
  - Else poisoned weapons.
- The battle screen shows "Bribed guards" or "Fair play expected", so you are warned.
- **Opinion side effects:**
  - You win after cheating: that rival −2.
  - You lose to an AI without cheating while on the *Care* instruction: rival +1 opinion, and it gains +1 influence and +50 denarii.

**Betting (*Gambler* opportunity).**
- Stakes are 0/20/50/100/200, capped by your cash, and paid when placed.
- "odds" = Σ(worth + 10) of your fighters minus the opponents'. You can bet on either side; betting on the opponent uses the negated value.
- Payout = stake × (1 + multiplier):

| odds | multiplier |
|---|---|
| > 50 | 0.2 |
| > 30 | 0.3 |
| > 20 | 0.4 |
| > 10 | 0.55 |
| > 0 | 0.8 |
| > −10 | 1.0 |
| > −20 | 1.3 |
| > −30 | 1.5 |
| > −40 | 2 |
| > −50 | 4 |
| > −60 | 6 |
| > −80 | 8 |
| ≤ −80 | 10 |

- [UNCERTAIN] The settlement branch in `TournamentReportActivity` is decompiled with an inverted condition.

---

## 3. Influence and politics

### 3.1 Weekly influence income (`Dominus.influenceGain`, applied in `AppendWeekCascading`)
- **Base:** entertainment E:
  - E ≤ 10 → E.
  - 11–100 → E/2 + 8.
  - > 100 → E/4 + 48. There is a jump at 100/101: 58 → 73.
- **Elected senator:** +5.
- **Buildings:** + the building influence bonuses (§0).
- **Multipliers on every positive gain** (`influenceAfterChange`). They are additive and each is truncated:
  - Roman heritage: +20 %. AI rivals are Roman by default, so they get it too.
  - *Power Begets Power*: +25%.
  - *Bacchus Patron*: +15%.
  - Elected senator: +10%.
- **Other sources:**
  - Senator: +1 every 5th week.
  - +1 for each valid tournament-progression win.
  - Event battles ± their stake (×2 if fought to the death).
  - Raid win +10.
  - A beast gaining *Good Boy*: +5. *Best Boy*: +10.
  - Feeding a traitor to crocodiles: +10.
  - Many decision events.
  - Unlocking *Power Begets Power* gives an instant +10% of current influence.
- **Losses:**
  - Negative balance at the weekly tick: −1. If unable to pay wages: −5 more. If below −200: −2. If still negative after relief: −2.
  - Each gladiator who escapes: −5.
  - A failed expedition: −25 (more if the commander is captured).
  - Raid loss −15. Event choices.
- **AI rivals:** +1 influence per week plus the same entertainment formula. Every week they also receive the "commoner tourists" amount (the Public Sessions formula below) **as denarii**.

### 3.2 What influence does
- **Loyalty.** Term added every week (`influenceLoyaltyEffect`, influence ×0.8 at Sol ascension ≥ 3):
  - Start at 0. +2 with *Forbidden Contraband*, +1 with *Bacchus Patron*.
  - −1 if influence < 10, another −1 if < 20.
  - +1 at each of: ≥ 50, 100, 500, 1 000, 2 000, 3 000, 4 000, 5 000, 8 000, 15 000, 30 000, 100 000.
  - So the range is −2 to +12 (+15 with both opportunities).
- **Opportunity tree** unlocks (§3.3) by reserving influence.
- **Elections:** need ≥ 200 influence. Starting votes scale with influence.
- **AI behaviour:**
  - Rivals only try Persuasion/Poison when your influence > theirs.
  - +1 cheat likelihood when your influence is higher.
  - "Gladiator school equalizing" senate event when you dominate.
- **Public Sessions income** uses influence (below).
- **Thresholds for objectives and stories:**
  - Exert Influence objective at ≥ 15; Organize at ≥ 150.
  - Taking a Closer Look > 100; Grave Robbing > 1 000; Mysterious Hag > 150.
  - Holy Shrine event > 200 (with > 1 000 denarii).
  - Achievements Influencer > 100 (Nightmare > 1 000).
- **No influence ranks or titles exist** other than Senator, Princeps Senatus and Consul.

### 3.3 Influence opportunity tree (`Influence.java`, `InfluenceActivity`)
- Three paths of 5 tiers, unlocked in order within a path.
- The path variant (alternates) is fixed by a per-game `seed`.
- **Cost of the next unlock** depends only on how many opportunities n you already own (any path):

| n owned | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | 20 | 40 | 80 | 160 | 300 | 500 | 1000 | 2000 | 4000 | 8000 | 14000 | 20000 | 28000 | 34000 | 45000 |

  - Actual cost = base + base·d/2, where d = (Hard) + (Nightmare) + (Sol ascension ≥ 3). That is +50 % per factor.
  - Unlocking reserves the cost; it is not refunded or lost later.
- **Swapping alternates:** with Rome Mansion ≥ L2, pay 250 denarii. Swaps are Class↔Weighted Training, Forbidden Contraband↔Informants, and the cycle Socializer → Power Begets Power → Market Connections → Socializer.
- The Senator path needs the paid/achievement upgrade *SenateElections*. Lobby the Senate and Elected Senator are locked without it, so the whole path is.

| Tier | Lanista | Senator | Trickster |
|---|---|---|---|
| 1 | **Public Training Sessions** (toggle): +X denarii/week; security −1; training effectiveness −2 | **Lobby the Senate**: `hasSenatorInfluence` unlocks senator options in events and halves the wild-beast bribe | **Take a Loan** (toggle): +500 denarii now, −25 denarii/week; repaying needs 500 |
| 2 | **Bribe General** (toggle, −5 denarii/week): each week a "promising gladiator" offer (Crixus, Barca, Hermes; Maximus after week 24 at 50 %; otherwise an epic gladiator). Each named gladiator is offered only once. An offer comes every week until a named one has been offered; after that, 40 % of weeks. | One of: **Market Connections** (better market, 2 free bandages), **Power Begets Power** (+10 % now, +25 % on gains), **Socializer** (+1 opinion to all rivals in weeks where week%5==1 before week 60, or week%9==4; 20 % chance to skip some bad events) | **Informants** (intrigue ±5, detection +15, rebel army −⅛ when > 7, fewer spy-suspicion events) or **Forbidden Contraband** (+2 influence-loyalty term, free Tome of Traits) |
| 3 | **The Organizer** (organise tournaments) | **Elected Senator**: unlocks the senate election | **Gambler**: betting (§2) |
| 4 | **Class Training** (+50 % class specialisation) or **Weighted Training** (+3 base training effectiveness, +25 % XP, fame from training) | **Princeps Senatus**: active while you are an elected senator; see §3.6 | **Bacchus Patron**: +15 % influence, +1 influence-loyalty, +1 opinion to all rivals (week%10==3 before week 50, or week%15==1), +1 battle favour |
| 5 | **Imperator**: expeditions against the rebels, extra militia | **Consul**: unlocks the consul election | **Veil of Night**: Raid action |

- Public Sessions income = 5·arenaChampions + (I′/5)·min(5, gladiators + beasts) + F + 2·(gladiators + 2·beasts).
  - I′ = influence/10, or influence/100 + 180 if influence/10 > 200.
  - F = total fame/10, soft-capped to F/100 + 450 above 500.
  - Recalculated weekly.
- Of the toggles, Bribe General and Loan cost **denarii**, not influence. Their "projected influence cost" field actually adjusts weekly denarii.

### 3.4 Senate election (`Player.startSenateCampaign`, `handleElectionProgress`)
- **Start:** you need the Elected Senator opportunity, the *SenateElections* upgrade, ≥ 400 denarii (paid) and ≥ 200 influence.
- **Starting votes:** 5, plus 10 if influence > 1 200, 7 if > 700, 5 if > 400.
- **Duration:** results come at startWeek + 5, so there are 5 weekly updates.
- **Weekly votes** = f(Δinfluence this week) + rand(1..3) + election-action yields. On Nightmare the random part is rand(0..1).
- **f(g), the vote table** (g is halved at Venus ascension, and halved again in consul campaigns):

| g | ≤ −11 | −10…−1 | 0–2 | 3–4 | 5–7 | 8–10 | 11–15 | 16–20 | 21–35 | 36–55 | 56–65 | 66–85 | 86–105 | > 105 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| votes | −4 | −2 | 0 | 1 | 2 | 3 | 5 | 6 | 7 | 9 | 11 | 13 | 15 | 17 |

- **Election actions** (on the Elections screen):
  - *Smear Campaign*: −200 denarii/week; +8 votes/week (6 on hard).
  - *Send gladiators on campaign*: free. Each healthy gladiator gives 1 vote, +1 each for fame > 100/250/400/600/1000 (consul thresholds 300/600/1000/1500/2500). Capped at 10 votes/week. Costs security penalty +2 (+4 hard) and training −10.
- **Campaign events** (replace normal events while campaigning):
  - *Popular political rival*: send a gladiator to eliminate him, pay 200, or ignore (−10 influence).
  - *Political sponsor*: reject, invest, or take +500 denarii for −30 influence.
  - *Call in favours* (final week, < 100 votes): +30 influence immediately, which feeds that week's votes, then −50 influence 5 weeks later. Or reject for −10.
  - *Rival ambush*: street fight with your champion, pay up to 200 denarii (−20 influence), or reject (−10/−30).
- **Win:** ≥ 100 votes. The UI caps the display at 100 %.
- **Senator rewards:**
  - +50 denarii/week income; +5 influence/week; +10 % influence multiplier; +1 influence every 5 weeks.
  - Replace Guards bribe; senator-only events (public funding law, ludus redistribution, bread games, state-artifact auction, holy shrine).
  - Counts as a league trophy toward the Ascension objective.
  - Unlocks the Consul tier and Princeps Senatus.

### 3.5 Consul election
- **Start:** must already be a senator, own the Consul opportunity, and pay **1 000 denarii**. Influence ≥ 200 is still checked.
- **Starting votes:** 5, plus 10 if influence > 12 000, 5 if > 6 000, 2 if > 2 000.
- Influence-to-vote gains are halved. Gladiator campaigning uses the higher fame thresholds.
- **Win (≥ 100 votes):**
  - Consul title; security penalties −2 (two lictors).
  - +5 intrigue detection.
  - A *Lictor* bodyguard (level 6/10/15 by week 120/220) joins your street and rebel fights.
  - "Uphold the law" events.
  - "Improved event choices."

### 3.6 Princeps Senatus
- Active when you are an elected senator **and** own the opportunity.
- +10 intrigue detection.
- Public Funding vote "for" gets voting power 10 instead of 5.
- Gladiator-school-equalizing event: a "whip" option that kills the proposal for −5 influence.
- Bread-games proposal can host Poseidon's tournament.
- (The legacy `SenateWhip` InfluenceAction, which reserved 1000/2500, appears unused.)

### 3.7 Laws and senate events
- **Only one law exists: "Public ludus funds"** (`LawType.PublicFunding`).
  - Proposed through a senator event.
  - Votes: For (−10 influence, power 5 or 10), Against (−5, power −4), Abstain (0, power −1).
  - It passes if rand(power + 10) > 4. For: 67 % (75 % as Princeps). Against: 17 %. Abstain: 44 %.
  - Once active, **every ludus, AI included, gets 500 denarii every 4th week**.
- **Gladiator school equalizing** (senator, not consul; only when every visible rival has ≤ half your influence and is weaker):
  - Whip (Princeps): −5 influence.
  - Vote against: −25 influence. The tax is then applied anyway [as coded]: you lose up to 20 slaves and up to 1 000 denarii; each rival gains 3 slaves and 200 denarii.
  - Filibuster: −100 influence.
- **Uphold the law** (Consul, and a captured enemy agent is on record):
  - Feed him to crocodiles (needs crocodiles): +10 influence, +15 loyalty to all your gladiators, crocodiles gain *ManEater*.
  - Lashings, or execution.
  - "Beneath my station": +10 influence.
- **Bread games:** organise a tournament, or pay 100 for +10 influence, or reject for −10.
- **Senator buys slave / Senator gone wild / Sensitive information:** influence and denarii trades. Most have a senator-connection option that needs `hasSenatorInfluence`.

---

## 4. Loyalty

### 4.1 Weekly loyalty change (`Dominus.getGladiatorLoyaltyChanges`, `getLoyaltyProjection`)
- Loyalty is clamped to 0–100. Every gladiator starts at 80.
- The weekly delta is the sum below. It is halved on adventures, and AI houses skip the equipment term.

| Component | Formula |
|---|---|
| Entertainment | E ≥ 20: E/3 + 6. 5 ≤ E < 20: E/2 + 2. E < 5: E − 1, so E = 0 gives −2. +3 with a Tavern. |
| Security | Uses security **slaves**, not the total. S > 50: S/15 + 2. S > 10: S/10 + 1. Otherwise S/5. |
| Influence | §3.2, from −2 to +12/+15 |
| Level | (level == 1 ? +1 : 0) + 1 − level. Level 1 gives +1; level L ≥ 2 gives −(L − 1). **Veterans erode fastest.** |
| Traits | +1: Loyal, GlorySeeker, RaisedInTheArena, Reincarnated (plus +1 at reincarnation > 4 and another at > 6), Adopted, Fanatic, ReunitedWithFamily, LifeBringer, Careful. +2: Recaptured, Freedom, Undeath, Devotion. −1: Untrustworthy, Ruthless, Preparation, Sneaky, Inspiring, Paranoid. −2: Intangible, ApolloBlessing, Ascended, Pyromaniac, Thief, Underhanded, Arrogant. −4: LostFamily, RevoltLeader. −5: Psychopath, RebelLeader. −8: DemandingFreedom, RebelGeneral. −10: PlottingUprising. |
| Origin (gladiator) | Roman +1, Gaul −1 |
| Heritage (your dynasty) × origin | Roman: Roman +1, Gaul/Punic −1. Greek: Greek +1, Briton/Thracian −1. Punic: Punic +2, Roman/Iberian −1. Celtic: Gaul/Briton/Thracian +1, Roman −2, Greek −1. Egyptian: 0. |
| Legendary | Any legendary −1. Crixus −6 if you also own Spartacus. Spartacus −1, −5 with Crixus, −3 with Oenomaus, −2 with Gannicus. |
| Equipment happiness (player only) | When assigned gear value changes, add `percentageToHappiness(%change)` (roughly ±1 per 10 %, up to ±9). Small gear values shrink big percentage swings. It then drifts 1 per week toward a target: 0 if gear worth > 9 999 or fame < 10; −1 if gear worth > 999 or fame < 30; otherwise **−2**. Famous gladiators expect better gear. |
| Ascension | Venus (≥ 6): −1/−2/−3 (weeks ≤ 30 / ≤ 80 / later). Juno (≥ 10): −1. Apollo (≥ 12): another Venus-scale penalty. Tartarus (≥ 15): −1/−2 (> week 80). |
| Inspiration | If you own *Inspiring* gladiators: X = a running average of their loyalty. Every gladiator moves (X − own)/4 toward X. |
| Unpaid wages | −10 in a week when wages could not be paid (debt < −10 after relief) |

### 4.2 One-off loyalty changes
- Battle aftermath (`Rest`): +2 on a win, −2 on a loss. A tournament win gives another +2.
- **Reward ("gift")** in the gladiator dialog:
  - Cost 50 × (level/2 + 1) denarii.
  - +40 loyalty, plus rebellion grace (skips the next loyalty check).
  - Cooldown 10 weeks. Only when loyalty < 100.
  - AI rivals use it on gladiators below 40 loyalty (never on Spartacus).
- **Adoption:**
  - Cost 25 denarii. The gladiator needs fame > 20 and must not already be adopted.
  - **Only one adopted heir alive at a time.**
  - Effect: rename, +5 fame, *Adopted* trait (+1 loyalty/week). An Aquarius Helmet is granted if you own that upgrade.
- **Purchase or transfer:** +20 if loyalty < 75, plus rebellion grace. Loan return +15/+10; the Spiculus join event +50.
- **Items:** Silphium Extract +20; Lightning Bottle −5.
- **Group effects:**
  - Lost raid: all −25. A rival wins a raid on you: all −25.
  - Fed traitor to crocodiles: all +15.
  - Freedom request: grant gives all +25 (+25 influence; the champion leaves with *Freedom*). Threaten gives all −25 and *DemandingFreedom*. Lavish reward (level × 100 denarii) gives all −15.
  - Ignore suspected spy: all −10.
  - Misbehaving gladiator: −cost/10 or +cost/10 to all.
  - Punishment injuries: −20 to the victim.
- **Escape-related:** failed escape +10, −5 fame, an injury (InjuryProne + 4). Persuasion −20/−35.
- A spy's punishment clears his spy status.

### 4.3 Escape check (only if Betrayals are enabled; for the player and visible AI houses)
- Each week, for each gladiator not on an adventure:
  - A rebellion grace consumes itself and he stays.
  - Otherwise he **stays if rand(40) + 10 ≤ loyalty, or if he is injured and loyalty ≥ 15.**
- So: loyalty ≥ 49 never rebels. Loyalty < 10 always rebels, unless injured and ≥ 15, which is impossible below 10. In between, P(rebel) = (49 − L)/40, e.g. L 30 → 47.5 %, L 40 → 22.5 %.
- **Spartacus exception:** if only Spartacus would rebel, you own more than 2 gladiators, and another gladiator is trending down (< −1) with loyalty < 60, then nobody escapes. Instead Spartacus murders a slave: Spartacus −10 loyalty, −1 influence, −1 security slave.
- The number of rebels decides the event: **1 → Solo escape, 2–3 → Coordinated escape, ≥ 4 → Uprising.**

**Escape rolls (`Betrayal`):**
- Betrayal SDR: S < 5: S; < 10: S/2 + 3; < 30: S/3 + 5; < 50: S/4 + 8; < 100: S/6 + 15; otherwise S/10 + 25.
- unhappy = your slaves (if wages were unpaid this week), otherwise slaves/10.
- **Cunning roll** succeeds if 4·SDR + 5 < Cun + bonus + level + rand(15) + unhappy. Group events use the most cunning rebel.
- **Brute-force roll** (n rebels, physical = Ini + Str + MaxLife/5, summed for a group) succeeds if physical + bonus + unhappy + 10n > 10·SDR + rand(15).
- **Bonus:**
  - Spartacus adds his own physical total, and in groups sets the "Spartacus betrayal" flag.
  - The player's very first solo attempt ever gets −10 ("noob protection"). Later solo attempts on non-hard get −3.

| Event | Result |
|---|---|
| Solo | Cunning roll succeeds: he escapes cleanly. Else brute-force succeeds: he escapes and kills 0–2 guards (rand(SDR)/3). Else he fails: +10 loyalty, −5 fame, an injury (InjuryProne + 4), and 0–1 guards killed (rand(SDR)/5). |
| Coordinated | Cunning: all escape, no casualties. Brute-force: all escape and kill 1–5 guards (rand(SDR)/2). Else all fail and are injured, with 0–2 guards killed (rand(SDR)/4). |
| Uprising | Cunning **and** brute-force (n) both succeed: **the ludus is destroyed** (`SlaveBetrayal`; game over for the player) and every gladiator joins the rebels. Neither brute-force roll (n, n/2) succeeds: total failure, 0–4 guards killed. Both brute-force rolls succeed: all escape and kill 2–10 guards. Otherwise a partial escape: rand(n) − 1 escape, the rest fail, and 2–6 guards die. |

- **Casualties:** security slaves killed = clamp(rand(SDR)/divisor, min, max). Each casualty removes a security slave, or another slave if no security is left.
- **Escaped gladiators:**
  - Each gets `Escaped`: +5 fame, −50 loyalty, +100 XP. The old owner loses −5 influence.
  - They join the world's rogue/rebel pool (Spartacus' slave army).
  - With Spartacus, extra "escaped slaves" are added (week/10) and the house loses 2 slaves.
- There is **no targeted revenge on the former owner**. Rebels raid random houses (§6). Escapees can be brought back as *Recaptured* (+2 loyalty/week) through Imperator expeditions with the recapture flag.

### 4.4 Scripted Spartacus arc (`World`)
| Week (hard) | Event |
|---|---|
| 15 (10) | Batiatus (or the weakest rival) acquires Spartacus |
| 20 (18) | Family butchered: Spartacus −20 loyalty and *LostFamily* (−4 per week). A spy report gives you +5 influence and Batiatus −5. [UNCERTAIN: the condition is decompiled as committed spies ≤ 0, probably > 0.] |
| 28 (24) | Humiliation: Spartacus −30, every Batiatus gladiator −35, Batiatus −10 influence and +600 denarii. With spies > 0: you +5 influence, Batiatus −15. The Spartacus Escape story starts. |
| 35 (30) | Plotting revolt: *PlottingUprising* (−10 per week), Spartacus −20, others −15. With spies > 1: +5 influence. |
- Spartacus with > 2 tournament wins gains *DemandingFreedom* (−8 per week).

### 4.5 Freedom (rudis)
- Your most famous gladiator with ≥ 10 tournament wins (25 if *GlorySeeker*) may ask for freedom (§4.2).
- AI gladiators with ≥ 10 wins have a 4 % weekly chance of *DemandingFreedom*.
- Each week a freed (rudis) gladiator has about 4 % (`rand(100) > 95`) to reset to 100 loyalty and be offered back for hire.

### 4.6 AI loyalty management
- If more than 1 gladiator is below 50 loyalty (or the rebels outnumber their security), the AI holds < 50 denarii, and it has not borrowed before: **it takes one 500-denarii loan**.
- Gladiators below 40 loyalty get rewarded when the AI can afford it.

### 4.7 Spy-suspicion event (player)
- **Trigger:** from week 20, 50 % of the time, and only if you have a turned spy, or 30 % otherwise. With *Informants* there is a 40 % chance it does not fire on an innocent.
- **Choices:**
  - Punish: injury, −20 loyalty to him, −1 slave. Spy status is cleared.
  - Feed to crocodiles: fatal, +10 influence, +15 loyalty to all.
  - Follow him: a street fight. Winning clears a spy.
  - Ignore: −10 loyalty to all. An innocent suspect gains *Loyal*.

---

## 5. Security interplay (summary)
- **Intrigue defence** uses the "Dominus SDR":
  - S < 4 → S.
  - < 12 → S/2 + 4 + S/4.
  - < 24 → S/2 + 8.
  - < 40 → S/3 + 12.
  - < 65 → S/4 + 16.
  - < 100 → S/6 + 24.
  - Otherwise S/10 + 38.
  - Example: 10 security → 11; 30 → 22; 100 → 48.
  - Assassination subtracts it at ×4 inside the chance. Poison ×3 (via x). Steal and Sabotage ½ plus band penalties. Persuasion ¾ (with entertainers).
  - Walls: Poison −3 per level; the unused raid formula −20 per level.
- **Escape defence** uses the "Betrayal SDR" (§4.3) at ×4 against cunning and ×10 against brute force. Each security point is worth roughly 1 cunning point and 3–10 physical points.
- **Rebel raids:**
  - Danger = armySize − ((healthy glads + healthy beasts + all glads + all beasts)/2 + S).
  - A defending army stronger than 2·S gets *Surrounded*. Walls give *Walled*.
  - A Ludus-Pact ally with opinion ≥ 60 lends security/10 of its slaves.
- **Spies vs intrigue:** see SpyBonus and D (§1.2 and §1.3). Two of your spies cancel up to four enemy spies in the chance term. Both spy counts are "committed" (last week's).
- **Spy intel:**
  - A rival's wealth is shown if your committed spies > theirs; its slave count if > theirs/2.
  - Rebel screen: army size needs ≥ 2 spies, plundered gold ≥ 3, the leader ≥ 5.
- **Loyalty:** security slaves also feed the weekly loyalty term (§4.1).
- **Things that lower security:**
  - Public Sessions −1; Gladiator Campaigning −2/−4.
  - AI sabotage/steal on you are only possible at Venus+ or on Nightmare.
  - Rebel raids kill guards.

---

## 6. Rebels (slave army) and raids on ludi
- **Army size** = rogue gladiators + escaped slaves.
  - It grows with escapes, rebel victories (escaped slaves added), and passive growth: +1 most weeks after week 50 at ascension > 2, more on hard.
  - It is softened as size/2 + 25 above 50, except on Nightmare.
- **Weekly roll** (only if raids are enabled and the army > 1): rand(5) > 3 (> 2 on hard), or no raid in the last 3 weeks.
- **Target choice:** usually a random visible rival, or you when your "weeks since last raid" ≥ 4–7. [UNCERTAIN: the decompiled code is garbled.]
- **Security gate:** compared against 10 × army. [UNCERTAIN: decompiled as "return null if security ≤ 10 × army", probably the reverse: high security deters.]
- **A raid on you:** army = size/2 + 15 above 30, −⅛ with Informants. Choices:
  - **Fight:** your champion vs the rebel champion plus up to 2 rebels. Rebels are equipped by danger level. Win: +1 opinion with every rival.
  - **Pay off:** 25 × army denarii (35 × at ascension > 1). Scaled down before week 50 by (50 − week)%. Halved if S > army. The money goes to the rebels' plundered gold.
  - **Hide/retreat:** −5 influence and plunder of 5 × army denarii (15 × without walls; ¼ if S > army − 2 (−1 on hard)). Escaped slaves and slave losses follow; the wall can be destroyed; if no gladiators are present you are **defeated**.
- **Losing the fight** (`LoseRogueBattle`, i = danger):
  - If i > S:
    - Lose a wall level, or a residence level if you have no wall.
    - The lowest-loyalty gladiator is injured (normal) or **defects to the rebels** (hard).
    - Lose i − S/2 slaves (or 50 denarii each); possibly a building.
    - With no gladiators or slaves left: **defeat (SlaveAttack)**.
  - Otherwise you lose about i − S/2 (normal) or i − S/4 (hard) slaves.
  - Plunder of 50·i goes to the rebels. Lost slaves swell the army.
- **Allies:** *Ally attacked by rebels* event. Help (streetfight), send guards (security/3 + 1 bonus, −10 influence, opinion −25), or refuse (−15 influence, opinion −(30 + opinion/2)).
- **Recapture:** only through Imperator expeditions (see [04 §8](04-story-events.md)). Expedition success raises all rivals' opinion +1/+5. Recaptured rebels join you with *Recaptured*.

---

## 7. Rival opinion: sources and uses (consolidated)
- **Lowers opinion:** every intrigue action (§1.3); a raid −10 (and −2 to all rivals if you lose); winning after cheating −2; sabotage −1; story and event choices.
- **Raises opinion:** Socializer and Bacchus Patron ticks; Egyptian heritage (+1 to all every 3rd week before week 50, and every 8th week); losing fairly with *Care* +1; defending against rebels +1 to all; Crocea Mors +5; event choices. Transfers can be ±.
- **Uses:**
  - Intrigue frequency (§1.10) and cheat likelihood (§2).
  - Auto-resolved tournament instructions: opinion > 45 → Care, < 15 → AllOut. In live battles low opinion can bring Kill or AllOut.
  - Transfer prices ×(1 + (60 − opinion)/100), ×1.25 at Minerva.
  - Ludus Pact ally aid at ≥ 60.
- **Honesty reaction:** `reactToPlayerAction(true)` adjusts opinion by honesty, roughly Honest +3 … Treacherous −4. [UNCERTAIN: the switch is garbled.] `playerActionTaken(false)` is a no-op.

---

## 8. Misc
- **Invader:** a `Dominus` subclass for the online "World Champion" who invades tournaments. Wins step your Champion tier Bronze → Silver → Gold → Diamond. At Gold and Diamond a win yields Mysterious Sand. Not an intrigue system.
- **Delayed-outcome events** in this domain:
  - Beggar spies: −10 influence.
  - Founder chain "Spying": spend 2 spies and 100 denarii; 4 weeks later +5 influence and +2 spies.
  - Empty promises: −50 influence after 5 weeks.

## 9. Bugs and quirks worth noting (as decompiled)
1. The resolved assassination uses the attacker's own house as the target house (§1.4).
2. "Hire night guards" (defender prompt 0) adds and then removes 50 denarii, so the net cost is 0.
3. The defender influence prompts (senate friend, town watch) apply the influence change **twice** (±20 real, ±10 shown).
4. The goat sacrifice always takes 50 denarii. In 1 of 8 cases it takes another 50, and the dialog may show 0.
5. The assassination bonus for target loyalty < 10 (+15) is overwritten, so it stays +10.
6. The steal wealth tier "> 500: +7" is unreachable.
7. `destroyStables` checks the shrine level instead of the stables level.
8. The champion check in AI cheat likelihood only looks at the last fighter on each side.
9. Betting settlement and the rebel security gate are decompiled with inverted-looking conditions; these could not be confirmed.
