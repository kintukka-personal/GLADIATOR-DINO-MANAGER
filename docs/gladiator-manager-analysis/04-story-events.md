# 04 — Story, Narrative, Events, Quests & Decisions

*Gladiator Manager (Renegade Games) v3.16.2b, reverse-engineered from the jadx decompilation.*

**Sources read:** `world/story/Story.java`, `factories/StoryFactory.java`, `enums/StoryLine`, `enums/StoryActor`, `world/Adventure.java`, `world/Expedition.java`, all 29 files in `world/decisions/*`, `factories/DecisionFactory.java`, `factories/RogueGladiatorAttackFactory.java`, `factories/UndergroundBattleFactory.java`, `world/Event|Message|Entombed|Invader|EscapeAttempt.java`, `world/loyalty/*` (escape/uprising), `world/Objective.java`, `state/World.java` (`AppendWeek`), `state/WeekResolver.java`, `state/Seed.java` (selected parts), `state/Ascension.java`, `world/Opponent.java` (`determineStoryLine`), `world/Player.java` (story and delayed-outcome parts), plus these activities: Decision, EventBattleReport, Story, Overview, Tournament*, Result, Tomb, Uprising and Expedition. All text comes from the game's string table.

**Conventions**
- Numbers come from the code. "Normal/Hard" means normal vs hard-mode values. `rand(n)` means Java `Random.nextInt(n)`, which returns a value from 0 to n−1.
- Several key methods are flagged by jadx as "Code decompiled incorrectly" (`World.AppendWeek`, `Opponent.determineStoryLine`, `Story.getConversation`, `StreetfightChoice.select`, parts of `DecisionFactory`). Where control flow had to be inferred from a mangled method, I mark it **[inferred]**. Where I am unsure, I mark it **[?]**.
- "Opinion" is a rival lanista's opinion of the player. "Influence" is the player's political standing. "Loyalty (all)" means the change applies to every gladiator the player owns.

---

## 1. Premise and framing

### 1.1 Opening
- **Setup.** The player is a newly arrived *lanista* (owner and trainer of a gladiator school). In the arrival text, "an incident in your hometown" forced the player to leave everything behind. They settle in **Capua**, "considered the home of gladiatorial battles", and found "a modest ludus".
- **Heritage.** The player picks one at the start. Roman (male or female portrait) and Celtic are always available. Punic is described as a "descendant of Carthage". Greek is a paid upgrade, with faster trait learning and a starting Hoplon. Egyptian is a paid upgrade with a female portrait; rivals' opinion of the player rises every few weeks, and it adds a bonus to the Pharaoh-tomb trigger. Heritage selects the portrait the player speaks with in story conversations (`StoryFactory.getPlayerActor`).
- **Tutorial.** It is the "Getting started" objective chain (Guidance 1–6): buy a gladiator, pick a technique, buy a weapon, register for a tournament, advance the week, then hire a worker.
- **Later objectives.**
  - *Expand the ludus*.
  - *Cloak and dagger*: upgrade the residence to level 3 and assign a spy.
  - *Where does it hurt*: build a Medicus and perform surgery.
  - *Underhanded methods*: poison Vettius' giant **Gigantus**, with the hint "give Gigantus a taste of Roman medicine".
  - *Security concerns*: assign 5 slaves to security and build a wall when rebels appear.
  - *Imperator*: send an expedition.
  - *Mount up*, *Organize*, *One man's loss* (steal from a rival), *Name your beast*, *Exert influence*.
  - *Ascension*: "You feel as if there is a greater calling than just this mortal world".

### 1.2 Historical and pop-culture framing
The setting is the late Roman Republic, around the Third Servile War. It mixes history, the Starz *Spartacus* TV series, HBO's *Rome*, and Greco-Roman myth:

| Element | Where it appears |
|---|---|
| **Spartacus** (Thracian slave, later "bane of Rome") | Batiatus acquires him in week 15 (10 on Hard). He drives the escape storyline, the rebel army and the bounty storyline. |
| **Lentulus Batiatus** | Starting rival ("Greedy / Treacherous"). His starting roster includes **Gannicus**, **Oenomaus** and Faust, all names from the TV show. His "hated rival" is Solonius. |
| **Solonius** | Rival who opens the game by asking you to throw a fight. His hated rival is Batiatus. |
| **Caesar** | A rival house opens in week 25 (20 on Hard, 12 on Nightmare) ("The infamous Caesar family…"). He also drives the Macedonian Rebels story. The lost **Crocea Mors** is "Julius Caesars' famous gladius". |
| **Marcus Licinius Crassus** | "The richest man of Rome". He opens a school in Nightmare week 20, or as a replacement when a house is destroyed and 5 houses remain (non-Nightmare). |
| **Decimus, Magnus** | Starting rivals. Vettius and Magnus hate each other. |
| **Vettius** | An invisible house (`_visible=false`) that serves as the intrigue broker ("Go to Intrigue to visit Vettius"). He owns Gigantus. |
| **Hannibal Barca** | Brought "back to life" as a rival house at the 16th ascension level (Cronus), week 13. His regalia, helmet and sandals form a questline. |
| **Senate / Consul / Princeps** | Elections cost 400 denarii (Senate) or 1000 (Consul). Senators get Senate-proposal events. A Consul gets 2 lictor bodyguards and can punish caught intriguers. |
| **Vorenus & Pullo** (HBO *Rome*) | The two Caesarian soldiers fought in the Macedonian-spoils quest. |
| **Theokoles** | The albino "Titan" (also from the *Spartacus* TV show). He is recruited by the strongest rival or appears in the market. |
| Myth | Pythia of Delphi, Hector and Achilles of Troy, Romulus' axe, Pericles, Alexander, Leonidas, the Sphinx riddle, gryphon egg, werewolves, underworld horrors, and Titans (Gaia, Hyperion, Cronus) at high ascension. |
| Memes | The Veteran "took an arrow to the knee" (Skyrim). "I'm not trapped in here with you.. You are trapped in here with %s!" (Watchmen). |

No "Varro" appears anywhere in the strings or code.

### 1.3 Cast of story actors (`StoryActor`)
These are the speaking characters in conversation storylines, each with neutral, angry and happy portraits:
- **Rival lanistas:** Solonius, Batiatus, Vettius, Decimus, Caesar, Magnus. Only these six can start "dominus" storylines; Crassus, Hannibal and randomly generated houses never do (`getNumberForDominus` returns 0 for them).
- **Spartacus.**
- **Pythia** (the Oracle of Apollo).
- **Hector** ("troy_descendent").
- **Hag** (mysterious old woman).
- **Veteran** (ex-soldier or ex-gladiator; "I'd rather not say my name").
- **Messenger/Spy** (used for the Egyptian tomb).
- **Unknown** (Spartacus whispering from an alley).
- **Player portraits:** Roman M/F, Celtic M, Punic M, Greek M, Egyptian F.

**Message senders** in the inbox are flavor NPCs: *Assistant* (mission departures and outcomes), *Herald* (attacks, destroyed houses, Senate army), *Spy* (spy reports), *Magistrate* (new schools), *Informant* (weekly rival activity, returning rudis champions) and *Medicus* (disease).

### 1.4 Tone
The tone is darkly comic and brutal Roman. A few examples:
- Mutilation as discipline: "Cut his eye out!" and "nail him to the cross!".
- Ridiculing failure: the player has to walk home in a loincloth after an ambush.
- Gleeful cruelty: feeding traitors to crocodiles, or killing a gladiator's family "and made it look like a simple robbery. Now we shall have his undivided attention.."
- Faux-epic myth framing for the late game.

---

## 2. Scripted world timeline (`World.AppendWeek`, `WeekResolver`)

| Week (Normal / Hard) | Beat |
|---|---|
| 1 | The "Rome's finest" tournament is seeded. If the player is registered, the **Solonius Throw** conversation fires (see §4.1). |
| every 3 | "Initium" rookie tournament. |
| every 4 | "Iunior Victores" junior tournament. |
| every week | "Underground fighting rings" (pit fights, §10). Replaced by the Ascension tournament when its requirements are met. |
| every 6 | If fewer than 4 rival houses exist, a new randomly named school opens (Magistrate: "A new Gladiator school called %s has opened it's doors."). |
| every 7 / every 5 | A new elite rebel joins the escaped-gladiator pool, or +5 escaped slaves if more than 100 rebels exist. Extra escaped slaves are added after week 12, and when Spartacus is free. **[inferred]** |
| 15 / 10 | **Spartacus** is added to Batiatus (or the weakest rival if Batiatus is gone): "Your rival %s has used his unsavory connections to get his hands on a slave called Spartacus.." |
| 25 / 20 (Nightmare 12) | **Caesar** opens a school. |
| Nightmare 20 | **Crassus** opens a school. |
| 20 / 18 | Spartacus' family is butchered. He loses 20 loyalty and gains the *LostFamily* trait. Spy report; the player gains +5 influence and Batiatus loses 5 **[?: the spy-gate condition looks inverted in the decompile]**. |
| 28 / 24 | Batiatus "whores out" his gladiators. Batiatus −10 influence and +600 denarii; Spartacus −30 loyalty; all of Batiatus' gladiators −35. With spies, the player gets +5 influence, Batiatus −15 more, and a message. **The SpartacusEscape storyline starts.** |
| 35 / 30 | "Spartacus is plotting to mobilize slaves": owner −10 influence, Spartacus −20 loyalty and the *PlottingUprising* trait, all of the owner's gladiators −15. This also applies if the player owns him. |
| 30+ (with conditions) | Theokoles appears (§11.3). |
| > 32 | The world flags **Spartacus defeated** once the rebel army is beaten and expeditions are enabled (§9.6). |
| 40+ | The Senate may send its own army against the rebels (§9.5). |
| ~50+ | The Sol, Bacchus, Jupiter and Vulcan leagues are seeded. An annual league is added after week 100. |
| > 160, or earlier | **Pythia Visions** starts once Spartacus is defeated, the player has more than 1 first-place trophy and the week is past 80 − 4×ascension. |

Every week, `WeekResolver` also does the following:
- Gives the player **one random decision event** (§6).
- After week 3, adds a 25% chance (`rand(4) > 2`) of scheduling an **Invader tournament**. Its entrants are real gladiators loaded from other players' online saves (Bronze to Diamond champion tiers). The `Invader` class is just a remote Dominus with an email, appearance and tier.
- Rolls the **Egyptian tomb** trigger.
- With the Public Funding law active, pays all ludi +500 denarii every 4 weeks.

---

## 3. How storylines work (engine)

- **Storage.** `Player.storyLines` maps a StoryLine ordinal to a progress integer.
- **Initiator encoding.** For rival-initiated stories, the progress value encodes both the step and *which rival* started it: `progress = dominusIndex + 6 × step`, where the dominus order is Solonius = 1, Batiatus = 2, Vettius = 3, Decimus = 4, Caesar = 5, Magnus = 6. The step is recovered as `normalized = (progress−1)/6`.
- **Selection.** `StoryFactory.getActiveStory` returns the *first* storyline whose next conversation is "ready". Only one story is offered at a time. It appears on the Overview screen as the initiator's portrait with an animated speech bubble, and tapping it opens `StoryActivity`.
- **Conversations.** A conversation is a list of lines. A player line can offer 2–3 numbered options, and later lines show only if their `choiceDependant` matches the chosen option. `Story.optionSelected` then applies the consequences.
- **Upgrade gating.** Stories tied to paid upgrades only run if the upgrade is owned (`upgradeRequired`):

| Storyline | Required upgrade |
|---|---|
| Macedonian Rebels | Linthorax armor |
| Carthaginian Artifact | Carthaginian Artifacts |
| Bow of Apollo | Bow & Arrow |
| Hannibal's Sandals | Hannibal |
| Tomb of the Pharaoh | Egyptian Ancestry |
| Restoration of Troy | Echoes of Troy |
| Train Gladiator | Lorarii |
| Mansion for Sale | Roman Mansion |

The 19 storylines (`enums/StoryLine`) are: SoloniusThrow, LoanRequest, MurderPlot, CarthaginianArtifact, MacedonianRebels, SpartacusEscape, HannibalSandals, BowOfApollo, PythiaVisions, SpartacusBounty, GodsChosen, TombOfThePharaoh, RestorationOfTroy, MysteriousHag, LudusPact, TrainGladiator, GraveRobbing, MansionForSale, TakingACloserLook.

---

## 4. Storylines in detail

### 4.1 Act I — Solonius Throw ("Rome's finest", week 1)
- **Trigger.** Week 1, the player has no story history, is not a multiplayer guest, and is registered for "Rome's finest".
- **Pitch.** Solonius "welcome[s] you to Capua" and proposes "Quid pro quo… make sure my gladiator wins… Let's say.. 200 denarii?"
- **Choices:**
  1. *"Make it 300 and we have a deal!"* → Solonius opinion +5.
  2. *"…my foot will make its way into your arse!"* → opinion −10; "You will regret this!"
- **During the tournament.** If the deal was taken, Solonius taunts you before your match ("Need I remind you of our deal %s? Make sure to lose!").
- **Outcome if you lose to Solonius:** +300 denarii (slipped secretly into your hands), opinion +10.
- **Outcome if you beat him anyway:** opinion −15.

### 4.2 The Spartacus arc
**A. Acquisition and abuse** are the scripted weeks in §2. Batiatus' cruelty drives Spartacus' loyalty down.

**B. SpartacusEscape storyline** (progress 1)
- **Setup.** Starts in week 28 (24 Hard), and requires Batiatus to exist with Spartacus alive. "Psst! Over here! In the alleyway!" Spartacus offers 100 hidden denarii and a share of looted gear. He asks you to "set fire to the Batiatus estate", which means performing a **Sabotage** intrigue action on Batiatus.
- **Choices.** Every choice gives Spartacus +25 loyalty.

| Choice | Effect |
|---|---|
| "Batiatus will hear of this treachery!" | Batiatus opinion +10, influence +5 (Spartacus scoffs). |
| "I will not be involved in this madness" | Batiatus opinion −5, influence −5. |
| "I will help you break out!" | +100 denarii. Batiatus opinion −10, influence −10, loses 1 security slave and 1 slave; all of his gladiators −10 loyalty. Progress 4. |

- **The sabotage (progress 4).** A successful SABOTAGE on Batiatus means Batiatus loses 3 security and 3 slaves, Spartacus gains *Sneaky* and is healed, and all of Batiatus' gladiators lose 20 loyalty (progress 5). If Spartacus is already gone, progress goes to 10 and the story dies.
- **The breakout.** It happens through the normal loyalty and escape system (§9.1); Spartacus adds his full physical stats to escape rolls. Once he joins the rebel pool, the player receives **a random weapon and a random armour piece from Batiatus' armoury**, and the world gains +5 escaped slaves and +500 plundered gold (progress 6).
- **Farewell (progress 6→7).** "I speak to you now as a free man, thanks to your diversion." He promises equipment and that "it will be as if we never met".
- **Spartacus waiting for support.** If Spartacus is the *only* gladiator about to betray, but other gladiators are unhappy, he waits instead of escaping alone. He loses 10 loyalty, the owner loses 1 influence, and a security slave is murdered ("We suspect one of our own gladiators might be responsible..").
- **Freedom demand.** A Spartacus with more than 2 tournament wins gains *DemandingFreedom*.

**C. The rebel army.** Once loose, Spartacus leads the rogue pool (§9): plunder, raids, the Libertas sword, Senate battles and expeditions.

**D. SpartacusBounty storyline**
- **Trigger.** At least 2 visible rivals, Spartacus free and alive, slave army above 40, more than 5 rebels, and a 20% roll.
- **Conversation.** Needs ≥500 denarii and the first two rivals undefeated. "Doubtless you have heard of me, as I am Spartacus, bane of Rome!" He offers to "bring fire and death to a rival of your choosing" for 500 denarii.

| Choice | Effect |
|---|---|
| Refuse ("my head will surely part from neck!") | All rivals +5 opinion. "You might be my next target then!" |
| Pay to hit rival 1 or rival 2 | −500 denarii. Rebels gain +500 plunder, +2 escaped slaves and +1 new rebel. The target loses 10 influence, 1 security and 1 slave. The target's opinion −10 only if they have more spies than your committed spies, i.e. they find out. The next rebel raid is **redirected at that rival with +⅓ danger**. |

**E. End of the rebellion** is a milestone (§12): "His lifeless corpse has been nailed on a cross along the Appian way."

### 4.3 Rival-lanista storylines (initiated by one of the six houses)

#### Loan Request
- **Trigger:** rival has <100 denarii, player has >200, rival opinion >50. "Loan me the small sum of 300 denarii… With 100 denarii interest!"
- **Lend:** −300 denarii, opinion +15.
- **Decline:** −5. **Insult** ("throw the money into a well"): −15.
- **Repayment:** once the rival has >300 denarii he returns. *Accept 300* → opinion +5. *Demand the promised 400* → +400 and opinion −5.

#### Mansion for Sale
- **Trigger:** week >6, player >500 denarii, champion fame >200, rival opinion >15, 50% roll. The conversation also needs >400 denarii and a fit champion who is not already on loan.
- **Offer:** a mansion in central Rome in exchange for loaning your champion for 5 weeks, plus money.

| Choice | Effect |
|---|---|
| Decline | Opinion −5. |
| "Smaller installments" | −25 denarii per week permanently. Mansion level 1 (unlocks the Rome estate). Champion loaned (the rival also equips him with bandages). Opinion +5. |
| Pay 500 up front | −500 denarii, same benefits. |

- The champion returns after about 5 weeks with +15 loyalty. If he dies while on loan, the body comes back with 100 denarii and an apology.

#### Train Gladiator (Lorarii upgrade)
- **Trigger:** your Doctore is better than the rival's, rival opinion >35, week >6.
- **Pitch:** "train one of my gladiators… if he dies, a reimbursement!"
- **Accept:** opinion +5. You receive the rival's best gladiator on loan, plus the objective *Train loaned gladiator*: +5 total stats and +100 fame within 10 weeks; reward 100 denarii and 25 influence.
- **Refuse:** opinion −5.

| Situation | Choices and outcomes |
|---|---|
| Trained successfully; offered the whip **Fulgur** | *Return him:* opinion +15, gladiator +10 loyalty, you get Fulgur. *Keep him* ("I will be keeping %s for myself!"): opinion −10, rival keeps Fulgur. |
| Objective failed, gladiator dead | *"Accidents happen":* opinion −20. *Pay 100:* opinion −5. |
| Objective failed, gladiator alive | *Keep him:* opinion −35. *Return him:* opinion unchanged, gladiator +10 loyalty. |

#### Ludus Pact (alliance)
- **Trigger:** rival opinion ≥45, week >10, the rival's influence is below its hated rival's, and a 10% roll. A second check must also pass: the hated rival is more influential than you, a 10% roll, or you are struggling (no invader wins and few slaves, or no league trophy after week 15).
- **Pitch:** "imagine our efforts united… our gladiators avoid injuring each other… share intel, security, and perhaps even equipment and gladiators!"
- **Choices:** *Polite no:* opinion −15. *Insult* ("a weakling such as yourself"): −30. *Accept:* opinion +20, and the hated rival −10.
- **Benefits while allied** (ally opinion ≥60):
  - During rebel raids the ally sends 1/10 of its security slaves.
  - In dangerous street fights the ally sends its best gladiator to fight beside you.
  - Rebel raids are steered away from the ally.
  - The "%s under attack!" event can appear (§6).
- **Gift:** if you drop below 100 denarii while the ally has >200, the ally offers a 200-denarii gift. Accept → +200, opinion −5. Proud refusal → opinion +5.
- **Breakup:** if the ally's opinion falls below 40, they end the pact. "Fare thee well" → −5; "worthless ally anyway" → −15.
- **[?]** "Take it easy in the arena" is only flavour; no code checks the pact during battles.

#### Murder Plot
- **Trigger:**
  - The rival has spies, or you have more than 4 committed spies, and you have at least one spy.
  - Rival opinion ≥45, and the check runs every 10th week.
  - The rival's hated rival has at least 2× its influence (and more than 80).
  - The hated rival's top gladiator has more than 2× the fame (and more than 50).
- **Pitch:** "kill one of his famous gladiators!… poison, assassination, or just kill them in the arena. I will pay you 500 denarii."
- **Accept:** opinion +10, you **receive a free spy slave**, the target house −5.
- **Refuse:** opinion −15, target +5.
- **Success:** any gladiator of the target dies by your hand (arena, intrigue or event battle) → +500 denarii, opinion +10.
- **Failure:** after 10 weeks without a kill, opinion −5 and later −10. "This has certainly been the last time I asked your for assistance!"

#### Carthaginian Artifact
- **Trigger:** rival has <500 denarii, opinion ≥60, week >30, player >200 denarii (≥400 to show).
- **Offer:** a Carthaginian breastplate for **350 denarii if opinion >70, otherwise 400**.
- **Buy:** opinion +5. **Decline:** −5.
- **Result:** on every 6th week after week 50, a Carthaginian smith reforges it into the legendary cuirass **Ksour Essef** (a plain cuirass without the upgrade).

#### Hannibal's Sandals
- **Trigger:** you hold Hannibal's regalia (set status >2), rival opinion >40, 20% roll.
- **Offer:** the rival trades the Sandals for your **champion gladiator** or your **strongest weapon**.

| Choice | Effect |
|---|---|
| Give the gladiator | He joins the rival (+15 loyalty). Opinion +10. You get the Sandals. |
| Give the weapon | Opinion +10. You get the Sandals. |
| Refuse | Opinion −15. The rival keeps the Sandals and gains 2 slaves (1 spy, 1 security). If rich (>1000 denarii) it buys 3 more for 500. |

#### Bow of Apollo (Bow & Arrow upgrade)
- **Trigger:** rival opinion <45, week >15 and even, 50% roll, you have ≥1 first-place trophy and a healthy *Marksman* Sagittarius.
- **Accept:** −100 denarii to the rival, opinion +5. The marksman goes on a 2-week adventure, wins the contest, then is attacked by an **Assassin** (Sneak Attack, Cheap Shot, Gouge; master-crafted hood, cloak and two parazonia) sent by that same rival.
  - Win: **Bow of Apollo** plus the *Hail of Arrows* technique.
  - Lose: the rival gets the Bow.
- **Decline:** opinion −5.

#### Macedonian Rebels (Caesar)
- **Trigger:** Caesar exists, you have Senate influence, week >30 and a multiple of 6, Caesar opinion >0.
- **Pitch:** "Some fool calls himself the descendant of Alexander the great…" Caesar wants your vote and a gladiator as second in command.
- **Support:** Caesar +10 opinion. Your best gladiator leaves for 3 weeks. On return he fights **Vorenus and Pullo** over the spoils (Caesar +200 denarii and +20 influence regardless).
  - Win: **Alexander's Armor**, 200 denarii, 20 influence, *Veteran* trait.
  - Lose: −10 influence and Caesar keeps the armour.
- **Refuse:** Caesar −15.

### 4.4 Special-NPC storylines

#### Grave Robbing (the Veteran)
- **Trigger:** influence >1000, you are a senator or own a *MasterHorseman*/*Cataphractoi* gladiator, 20% roll.
- **Pitch:** a veteran of "Caesars army in Gaul" offers a map to a Celtic king's burial mound for 200 denarii.
- **Buy:** champion leaves 3 weeks and is ambushed by 3 Gauls (Angry Celt ×2 and a Local Chief with *CelestialChampion*).
  - Win: **Spectral Reins** (summons a spectral horse, or buffs an equipped mount by 10%), 100 denarii, 10 influence.
  - Lose: −10 influence.
  - **[?]** The code never subtracts the 200 denarii.
- **Refuse:** Caesar +5, all rivals +2, +25 influence. The veteran then goes to Batiatus, and the strongest rival ends up with the Reins.

#### Taking a Closer Look — the battle-log questline
- **Trigger:** influence >100, you are a senator or own a *Thief*/*Sneaky* gladiator, 20% roll.
- **Pitch:** an ex-gladiator of the strongest rival offers to steal its "most prized possession". It is "Not particularly [valuable].. But it might be useful".
- **Accept:** −100 denarii, strongest rival −2 opinion. Your most cunning favourite breaks in (2 weeks) and must beat a Guard Captain and a Guard.
  - Win: the **Looking Glass**, *"Allows a dominus to view the arena more closely. Individual battle logs can now be inspected."* Also 100 denarii, 10 influence and the *Thief* trait. Code: `BattleReportActivity` receives `canInspect` when the player owns a LookingGlass.
  - Lose: −10 influence.
- **Refuse:** strongest rival +5, all rivals +2, +5 influence.
- **If you fail or refuse,** the strongest rival gains the Looking Glass within 4 weeks.

#### Mysterious Hag
- **Trigger:** at least 1 invader tournament won, total gladiator fame >200, influence >150, ascension unlocked, and `rand(50) + invaderWins > 50`.
- **Pitch:** bandits robbed her; "kill them all, and retrieve my possessions."
- **Send** your champion (or second best): 2 weeks against a Bandit Leader and 2 bandits. Your gladiator gets a *Surprised* bonus if *Sneaky*, *Preparation*, *Tactician*, *Enforcer* or *Underhanded*.
  - Win: 100 denarii, 10 influence, *Enforcer* trait, then the second conversation.
  - Lose: −10 influence; the story can re-trigger.
- **Refuse:** "I do not forget a slight" (the story ends).
- **Second conversation:**

| Choice | Effect |
|---|---|
| Take the 500 gold | +500 denarii; she takes the egg. |
| Keep the egg | You receive a **Mysterious Egg**: "To hatch an egg like this, it needs the heat of battle!" Carried in battle, it can hatch a **Gryphon** beast; the carrier gains *LifeBringer*. |
| Teach my gladiator | Your most cunning favourite learns **Fireball** ("forbidden knowledge"). |

#### Tomb of the Pharaoh — the Egyptian questline
- **Trigger:** Egyptian Ancestry upgrade, influence >300, more than 2 gladiators, more than 2 committed spies. Roll `rand(30) + committedSpies (+3 if Egyptian heritage) > 30`, or >40 to re-trigger after refusing.
- **Pitch:** the spy messenger has found "an old Egyptian map detailing the tomb of an ancient Pharaoh", **Necho II**, guarded by "traps and curses".
- **Choices:** send your best or second-best active gladiator (3 weeks; 500 denarii, 10 influence, *Adventurous* trait), or refuse.
- **The Sphinx's riddle:** "What walks on four legs in the morning, two legs in the afternoon, and three legs in the evening?"
  - *Man* → correct. You then fight the **"Risen One"**: a level-10 mummy with *Undeath*, *Indomitable* and a master-crafted, *TimeWarped* Khopesh.
  - *Tree* ("IT IS WRONG!") or *Caterpillar* → failure; the story resets.
- **Victory:** the obsidian palm axe **"Black Death"**, plus treasure "worth at least 500 denarii".
- **Defeat:** −10 influence; the story resets.

#### Restoration of Troy (Echoes of Troy upgrade)
1. **Decision event** (week ≥10, total fame ≥150). A Trojan nobleman asks for an escort to Capua.
   - *Pay 250 for guards*, or *send your champion* for 2 weeks. The champion is ambushed by 3 bow assassins, but **Hector fights beside him**.
   - Escort dies → "along with his dreams for a restored Troy" (story over). Escort survives → story continues.
2. **Waiting.** Once total fame >700 and ≥2 gladiators remain, there is a 30% weekly chance Hector visits (needs ≥300 denarii). His plan: a grand tournament with a 200-denarii entry fee, and the relics he smuggled as prizes.
3. **Tournament.** Pay 200 → the **"Trojan warriors"** tournament is scheduled 6–10 weeks later. Refuse → story ends.
   - Round 1: a Myrmidon. Round 2: two Myrmidons. Round 3: Hector, a Trojan captain and a Trojan warrior.
   - After round 3, Hector "hands you an exquisite prize: The Hand of Midas!"
   - The final opponent is "Some warrior claiming to be Achilles", with two Myrmidons.
   - Winning gives **Achilles' Spear**.
4. **Retry.** If you lack either relic and no Troy tournament is pending, there is a 20% weekly chance Hector returns: "expenses have risen due to war and inflation". Entry is now 500 (requires 600).

#### Pythia Visions → Gods' Chosen — the Prophecy questline
1. **Visions.** Trigger in §2. The Pythia of Apollo has "journeyed far from the sacred precincts of Delphi": "You who have toiled in the realm of Mars, have awakened the curiosity of the Olympians." Either reply works ("The gods have taken an interest in you!").
2. **Objective "The Oracle's vision" (1/4)**, chosen 50/50: four gladiators or beasts with ≥1000 fame, *or* 10,000 influence.
3. **(2/4) Show of devotion.** Send an *adopted* gladiator to Delphi (2 weeks, 20 influence, *Devotion* trait). The final trial is three dire wolves.
   - Win: the blind servant **Neokoros** joins your ludus.
   - Fail: −50 influence; you may retry.
4. **(3/4) Neokoros supremacy.** Neokoros must win a league (Jupiter, Vulcan, Annual or Bacchus champion trait) and become Pit Champion. If he dies, the step-2 objective is reset so you must send another adopted gladiator to Delphi. A −10 denarii / −30 influence penalty applies only if that objective record is missing **[?]**.
5. **(4/4) Sacrifice for the gods.** Hold 100 slaves and 10,000 denarii. Reward: the **Danaid Dagger** (+25% to special-effect chances) and the *Conduit of the Gods* achievement.
6. **Gods' Chosen conversation:** "The gods demand a sacrifice… Lose 100 slaves and 10000 gold?"
   - Accept → lose 100 slaves and 10,000 denarii. The **Prophecy** tournament is scheduled 5 weeks later (re-created whenever missing while the objective is active).
   - Refuse → story ends.
7. **Prophecy tournament:** three level-10 Harpies, then a level-40 **Cyclops** boss.
   - Win: 1,000 denarii, 25 influence, the **Cyclops Eye** item, the *Prophecy* achievement (and *Divine* at ascension ≥3), and **one extra ascension level unlocked**.

---

## 5. Decision-driven questlines (multi-step adventures)

| Questline | Requirements | Steps | Reward | Failure |
|---|---|---|---|---|
| **Quest for Crocea Mors** | Crocea Mors upgrade, week ≥20, a gladiator with a stat above (week/6 or week/10)+9 | Intercepted Senate letter → 4-week voyage to **Britannia** → 3 random approaches out of 8 (table below) | Caesar's gladius *Crocea Mors* | Injury or death. Or "Send word to the senate": +15 influence, all rivals +5, quest closed. |
| **Hannibal's legacy** (Hannibal upgrade) | ≥2 healthy gladiators, week ≥12+2×ascension, influence ≥100, ≥1 spy | Ruins of **Carthage**: 4 weeks (−1 if the gladiator is Punic; −1 after a "gather more info" delay) → merchant holds the chest-piece. Choose: *Rob* (fight Guard ×2 and a Captain), *Steal* (`rand(80)` + cunning + initiative/2 + trait bonuses, incl. Punic +5, must exceed 80), or *Pay* 2,000 (1,500 if Punic). | **Hannibal's Regalia**, set status 3. This unlocks the **Hannibal's Helmet auction** (senator or Imperator) and the **Sandals** storyline. | −10 influence; can retry. |
| **The Mythical Romulus** I–III (Founder's Axe upgrade, week ≥10) | I: >1 spy and >100 denarii. II: >2 spies. III: >2 spies. | I: steal scrolls from the library, either with spies (100 denarii, 2 spies used, 4 weeks; +2 spies back and +5 influence) or with your champion (fight 2 guards). II: decipher by paying the scholar (500+10×week), threatening him (Princeps only), or street-fighting his Bodyguard. III: a cave on the **Palatine hill**, 3 weeks; fight the weakest rival's best gladiator and beast. | **Founder's Axe** ("rumoured to have been the weapon with which he killed his brother Remus"), **Old Celtic Shield** (can later "radiate with power"), 500 denarii | I failure: −10 influence, reset. III failure: −20 influence and the rival gets the Axe. |
| **Legend of Pericles** | Library, ≥2 entertainment slaves, a champion | 3 weeks; grave robbers already at the tomb (2 Graverobbers) | **Helmet of Pericles** | −10 influence; the weakest rival gets the helmet. |
| **Hunt for the White Rhino** (Rhinoceros upgrade, week ≥25) | A *Bestiarii* gladiator | 3 weeks, fight the White Rhino | The White Rhino joins (wounded), *Hunter* trait | — |
| **Ancient Greek shield** (Hoplon upgrade) | Senator / Imperator / Bacchus patron | Auction | **Shield of Leonidas** | Sold to a collector |
| **Descendant of Sparta** (Spartan Dynasty upgrade) | Greek heritage, senator, or the BribeGeneral/Gambler opportunity; 50%; ≥100 denarii | An old man hides Leonidas' heir | *Protect:* −100 and the **Agiad** gladiator joins. *Betray:* +200 denarii, +10 influence ("burned at a pyre on the public square of Capua"). | — |

**Crocea Mors approaches** (three are offered at random). Bonuses come from the listed traits.

| Approach | Success check |
|---|---|
| Counterfeit gold | `rand(50)` + cunning > 38 (+5 *Underhanded*, +5 *Untrustworthy*) |
| Threaten "with the wrath of Rome" | `rand(75)` + cunning > 60; **can kill** |
| Out-drink the guards | `rand(50)` + HP/5 > 42 (+5 *Tough*, *Indomitable*, *BacchusChampion*) |
| Sneak in at night | `rand(50)` + initiative > 43 (+5 *Thief*, *Agile*, *Sneaky*) |
| **Abduct a local child** for ransom | `rand(75)` + initiative > 66; can kill; on a clean failure "he has taken it back home to be used as a slave" (+1 slave) |
| Fistfight their strongman | `rand(50)` + strength > 46 |
| Storm the keep | `rand(75)` + strength > 66; can kill |
| "Whatever means necessary" | `rand(100)` > 75 + bonus. **Bug:** the trait bonuses *lower* the chance (§15). |

---

## 6. Random decision events

### 6.1 Selection rules (`DecisionFactory.getRandomDecision`)
- Each week, exactly **one** event is drawn uniformly from the eligible pool. Events already in the player's history are excluded, and the history resets when the pool empties ("Recent events will usually not appear again for some time").
- **Priority 1:** at the Tartarus ascension level, an *Underworld attack* fires on every 20th week after week 10.
- **Priority 2:** a **rebel raid** (§9.3), if raids are enabled and not a repeat.
- Some generators are added multiple times, which raises their weight: *Hannibal's legacy* ×2, *Holy shrine rumours* up to ×3.
- **Election campaign:** while campaigning, *only* political events plus *Gladiator requests rudis* are possible.
- **Option scripting:** each option is a typed `Choice`:

| Choice type | What it does |
|---|---|
| Pay denarii | Cost (negative = gain) and influence. |
| Rejection | Influence change. |
| Gladiator adventure | Sends a gladiator away for N weeks with a battle and a reward. |
| Street fight | Event battle. |
| Delayed result | A random outcome resolved N weeks later. |
| Gladiator loyalty | Cost, a loyalty change for *all* gladiators, and a trait for one. |
| Gladiator injury | Injury roll; can kill. |
| Slave loss | Lose slaves. |
| Senator influence | Only available with Senate influence. |
| Invest | Mining bonus or ongoing income change. |
| Equipment purchase | Buy an item or weapon. |
| Auction | Opens an auction. |
| Others | Construction, Rebel fight, Redistribution, Senate vote, Organize tournament, Reunite family, Captive smith. |

### 6.2 General events (normal play)
"All" means every gladiator in the ludus.

| Event (title) | Trigger | Choices → outcomes |
|---|---|---|
| **Gladiator requests rudis** | Most famous gladiator has ≥10 tournament wins (25 if *GlorySeeker*) | *Free him:* he leaves, +25 influence, +25 loyalty (all); he may later return (§9.7). *Threaten lashings:* −25 loyalty (all), *DemandingFreedom* trait. *Lavish reward* (level×100 denarii): −15 loyalty (all), out of jealousy. |
| **Gladiator spying** (suspect behind a door) | Week ≥20. 50% if one of your gladiators really is a rival's spy; otherwise only 15% (and less with the Informants opportunity) | *Whip him:* injury, −20 loyalty; reveals the real employer, or "innocent" plus *MissingFingers*. *Feed to crocodiles* (if you own crocs): kills him, +10 influence, +15 loyalty (all), crocs gain *ManEater*. *Have the champion follow him:* street fight against thugs (if a real spy) or against the offended suspect, or nothing found. *Ignore:* −10 loyalty (all); an innocent suspect gains *Loyal*. |
| **Sponsoring** (merchant offers bandages) | ≤3 items, week ≤80 | *Accept:* +100 denarii, 2 sponsored bandages, −10 influence. *Senator threatens over import tax:* +300. *Reject.* |
| **Not strictly legal..** (skim arena fees) | Even weeks; low funds (≤200 before week 20, ≤1000 after) | *Accept:* +300 (+500 after week 20, −100 at Minerva ascension), −10 influence; every rival gains a spy and −10 opinion. *Refuse.* |
| **Hannibal's legacy** | §5 | |
| **Rumors of death** (plague) | Pluto ascension, week ≥20 | *Prepare:* −100 now, −150 per week until it resolves, −5 influence. *Ignore:* +10 influence. 2–4 weeks later "Plague arrives to Rome!": prepared = lose 1–3 slaves and 1 gladiator falls ill; unprepared = lose up to 8 slaves and about 2 fall ill. Rivals lose 2 slaves and 1 gladiator falls ill. |
| **Holy shrine rumours** ("Sacred ruins found near Ariminium") | No Ariminium camp, >1000 denarii, >200 influence, senator / TheOrganizer / Bacchus patron, >10 slaves, >1 committed spy | *Buy land* for 1000: founds the **Ariminium camp** (1 slave relocates), where the Pantheum Shrine can be built. *"I have my hands full here in Capua!"* |
| **A chance for fame** (boastful Beast Master) | You have a healthy beast | Pit one of your beasts against the Beast Master (win: +300 denarii and influence). *Ignore.* |
| **Cestus duel!** | **Melankomas** has joined you, week ≥20, once only | Champion or second best fights **Theagenes**, an "Olympic pankration champion with a habit of killing his opponents". Win: the **Myrmex** cestus. *Ignore:* −5 influence. |
| **Wild beast offer** | Odd weeks ≥10, ≥100 denarii | Lion 100, Rhino 200 (Rhinoceros upgrade), Elephant 300 (War Elephants upgrade); beasts may arrive injured. "I'm running a ludus here, not a zoo!" |
| **Plebe in debt** | Always | Make him a slave for 50, or a gladiator for 50. "Pay your own debts, cur!" |
| **Local orphanage closing doors** | >100 denarii, week ≥2, no pending delayed outcome | *Buy young miners:* 100 denarii, −5 influence, 3 mining slaves after 8 weeks. *Buy "the meanest kid":* a young gladiator for 100. *Refuse.* |
| **Accusation against gladiator %s** (assault) | Week ≥5 | *Let justice run:* a trial roll that can execute, lash or acquit. *Advocate:* 75 (150 at Minerva ascension). *Senate connections* (needs Senate influence). *Crocodiles* (if owned). |
| **Specialized training** | Senate influence | 4 weeks; the gladiator gains *ExoticFightingStyle*, or *Hoplite* for a grandmaster-spear Hoplomachus with the Spartan Dynasty upgrade. |
| **Marksman training** (Cretan trader) | Bow & Arrow upgrade, week ≥8, ≥100 denarii | 100 denarii, 4 weeks on **Crete**: *Marksman* trait and an old bow. |
| **Mine collapsed!** | ≥2 miners; week ≥15 (≥6 at ascension ≥2) | *Rescue:* 50×miners − 50 denarii (capped at 300). *Abandon:* lose 1–5 miners. *Consul seizes local mines:* −10 influence. |
| **Public challenge to %s!** (rival calls you a coward) | Week ≥2 | Champion fights the rival's best, normally or "to the death". Influence stake 10 (20 to the death). "We are romans, not barbarians!" costs −10 influence. |
| **Jousting challenge** (Celtic Horses upgrade) | Week ≥30, stables, champion | Mounted duel against **Lugh**, a Celtic hero from **Hibernia**. Win: the legendary horse **Enbarr**. *Pay 300* for *MasterHorseman* (−10 loyalty, all). *Decline:* −5. |
| **Baseless accusations!** (embezzlement suit) | Senator, or Minerva ascension; week ≥10 | *Fight in court:* +5 influence, −50 per week for 12 weeks, then acquittal and income restored. *Pay 500:* −5 influence. *Silence the advocate:* champion against a City Guard; a loss costs −500 denarii and −100 influence. |
| **Gladiator family found** (slave trader in **Sicily**) | A gladiator without the family traits | *Buy them for 300:* *ReunitedWithFamily* trait and +2 slaves. *"Arrange for an accident"* for 100: *LostFamily* trait. *Refuse.* |
| **A Rival's Weaponsmith** | ≥4 security, week ≥15 | *Demand a weapon:* a weapon of the champion's best type (Regular before week 55, Quality 55–74, Master-crafted ≥75), +5 influence, rival −10. *Send him to the mines:* +1 miner, +100 denarii, rival −5; one-third chance he is discovered (rival −15, −5 influence). *Return him:* +10 influence, rival +10. |
| **Armory Sabotage!** | Week ≥20; best weapon is the finest in Capua; hard mode at 50%, or ascension ≥2 | *Reforge in-house:* worth/2/(blacksmith level+1). *Scrap it:* +100, or +200 after week 25. *Pay the finest smith in Capua:* worth/2. |
| **Uncovered large mineral vein** | Miners present; 50% (always in Nightmare) | *Sell the rights:* +200. *Exploit it:* 100 for a permanent +10% mining bonus. |
| **Fires raging in the city** | Slaves present | *Senate connections:* +10 influence. *Pay 50:* +5. *Ignore:* −5. |
| **Criminal activity** (friend's villa robbed) | Week ≥4 | 3 weeks against a brigand: 200 denarii, 10 influence, *Enforcer* trait. *Refuse:* −5. |
| **Scouted a gladiator** | You entered the last pit fights | Recruit him for 150. |
| **Active spy** (Venus ascension) | ≥3 entertainment slaves | *Manhunt:* lose 1–2 slaves. *Hush it up:* −5 influence, or 50% chance the spy wounds your champion. |
| **Sensitive information** | An entertainment slave | *Leak via the mansion or senate:* +10 influence. *Refuse:* +5. *Blackmail:* +150. |
| **Legend of Pericles** | §5 | |
| **Patrician request** (private exhibition matches) | Champion with tournament wins, lacking *ShowMan* | 2 weeks; the finale is against a wild lion. 200 denarii, 10 influence, *ShowMan*. *Refuse:* −5. |
| **Setting a trap** (caravan bait) | Week ≥14 | 2 weeks against a bandit and a highwayman: 200 denarii, 20 influence, *OneManArmy*. |
| **Fools gold** (ascension ≥1) | Miners present | *Sell it as gold:* +100, −15 influence, −10% mining. *Dig new tunnels:* 200. *"Make the best of it":* 200 *and* −10% mining (quirk, §15). |
| **Capua flooded!** (Neptune ascension) | Construction ≥5, week ≥10 | *Senate relief* (Princeps): lose wall and a slave; rivals lose walls (the promised +1000 is not paid, §15). *Sacrifice cattle* (500): wall only. *Sandbags* (500 − 200×wall level): lose wall and 2 slaves. *"Tell the slaves to hide indoors":* lose wall, a building, 200 denarii and 3 slaves, and an injury roll. |
| **Extended drought** (Neptune ascension) | ≥5 slaves, week ≥8; 50% that it is a long drought | *Pillage rivals' water:* −1 slave, +50, −20 influence; rivals −5 opinion and lose 2–5 slaves if long. *Aqueduct:* +20 influence. *Stock up:* −200. *Hope:* lose 1–6 slaves if long. |
| **Old acquaintance appears** (beggar) | Odd weeks ≥5 | *Feed him* (50): 50% nothing, 50% he repays 150 and +5 influence. *Host him* (75, −5 influence): one of 7 random results — leaves; repays 150; was a spy (−10); steals up to 100; murders a slave; inherits and repays 500; vanishes leaving a pool of blood and the cursed **Dark Blade** (once). *Consul:* sends him to the mines (free slave). |
| **A visit from the Tax collector** | Always | Low construction (<4; <6 for a senator): refund of 400/700 − 50×level, or donate it for +15 influence. Otherwise a tax of level×100 − 300: *pay*, *give slaves* (−5 influence), *grovel* (−50 influence), or *Consul exemption* (+5). |
| **Book sale** | Library, or week ≥50 | *Tome of Traits:* 300 (500 Hard). *Stock the library:* 100–150, +2 entertainment. *Resell:* +100. |
| **Gladiator caught red-handed** (theft) | Apollo ascension, or week >100; loyalty ≤95 | Sum stolen: 50–300 depending on wealth. *Forgive:* lose the sum, −sum/10 loyalty (all), culprit gains *Thief*. *Lash him:* gold recovered, injury. *"An eye for an eye":* lose the sum, +sum/10 loyalty (all), culprit becomes *PartiallyBlind* (then *Blind*). |
| **Restoration of Troy** | §4.4 | |
| **The hunt for the white rhino**, **Quest for Crocea Mors**, **Romulus I–III**, **Ancient Greek shield** | §5 | |
| **Secrets of the Trade** (travelling virtuoso) | Week ≥5; price 100/250/400/500 by game stage | Pay for a random trait on the favourite, a random gladiator or a beast. |
| **Interested buyer** (investor) | ≤200 denarii, week ≤40, no first-place trophy | *Accept:* +400 now; −10% mining, −5 per week, −5 influence. *Refuse.* |
| **A night at the tavern** (dice) | Week ≥3, no Loaded Dice | *Quit while ahead:* +200. *Play for information:* a free spy. *Play for his dice:* the **Loaded Dice** item. At ascension ≥5 or Hard there is a 50% losing variant (−100 or nothing). |
| **Gladiator slacking off** | ≥2 league trophies; the gladiator has ≥2 wins and none of *Fanatic*/*GlorySeeker*/*Arrogant* | *Champion beats sense into him:* event fight; a loss makes the winner *Arrogant*. *Lash him.* *Let him be:* −10 loyalty (all) and *Arrogant*. |
| **A bad feeling..** (Dark Blade) | A gladiator wields the Dark Blade | *Take it by force:* champion against the possessed gladiator. *Ignore:* +5 influence. *Steal and destroy it:* lose 2 slaves, wielder −10 loyalty; "No fire seemed to hurt the blade". |
| **A death in the family..** (inheritance) | Week 2–25, ascension 0 | Tome of Traits, a Jupiter or Poseidon amulet, or +250 denarii and +5 influence. |
| **%s under attack!** (rebels hit your ally) | Ludus Pact active | *Send gladiators and security* (fight beside the ally; ally +15). *Send a few guards:* −10 influence, ally −25. *Do nothing:* −15 influence, ally −30 − opinion/2. |
| **Gladiator request** (Hoplite war) | Spartan Dynasty; a spear-skilled non-Roman/Gaul/Briton | Leave for **Iberia, Greece, Thrace or Carthage** for 3–5 weeks: always returns with *Hoplite* and +5 influence. *Refuse:* **−30 loyalty to every gladiator.** |
| **Descendant of Sparta** | §5 | |
| **The strongest of bonds** (a *GoodBoy* beast) | Always | *Train harder yourself:* random trait for the champion, −10 loyalty (all). *Retreat to the countryside with the beast:* it becomes *BestBoy*, +10 influence, −5 loyalty (all). *Refuse:* +20 influence. |
| **Slaves abducted** (Hard mode only) | Slaves present | n = week/5, clamped to 1–8. *Pay a ransom* of 50n. *Trap* with your champion, "very hard": abductor plus guard dog; win returns them (+*Hero*, +10 influence). *Abandon:* "found beheaded along the Appian way". |
| **Travelling merchant** (upgrade) | ≥100 denarii | Three random items: Tome of Traits, Lucky Ring, Sandals, Centurion shield, Xiphos, Dory, Moonstone, Mandrake, the Celtic "Helm of Woven Path", Fuscina, Hoplon, Parazonium, Khopesh. Quality is a gamble (shoddy to master-crafted). |

### 6.3 Status-specific events

**Not a senator**

| Event | Choices → outcomes |
|---|---|
| **Party got out of hand** (an aristocrat chokes an entertainment slave) | *Tavern in Rome:* +5 influence. *Senate connections* (needs Senate influence). *Demand reimbursement:* −10. *Apologise:* −5 influence and the slave is lost. |
| **Slave purchase offer** | *Senate haggling* (needs Senate influence): +300. *Keep him:* +5 influence. *Sell:* +200. |

**Senator** (Senate proposals)

| Event | Choices → outcomes |
|---|---|
| **Public ludus funding** | *For:* −10 influence; passes on `rand(power+10) > 4` with power 5, or 10 as Princeps, i.e. 67% / 75%. *Against:* −5; still passes 17% of the time. *Abstain:* 44%. If passed, all ludi get +500 every 4 weeks. |
| **Bread and games** | *Organise a tournament* (−250; as Princeps it becomes "Poseidon's blessing", prize a legendary trident). *Tax the wealthy:* −100, +10 influence. *Reject:* −10. |
| **Auction state artifact** | Attend, or *"keep it safe"*: +5. |
| **Gladiator school equalizing** (only while you dominate) | *Princeps veto:* −5. *Vote against:* −25 influence **and the redistribution still passes** (you lose up to 20 slaves and up to 1000 denarii; each rival gets +3 slaves and +200). *Filibuster:* −100 influence, vote cancelled. |

**Election campaign** (Senate or Consul)

| Event | Choices → outcomes |
|---|---|
| **Popular candidate joins race** (first 4 weeks) | *Assassinate him:* fight 2 guards; +20 influence and *Assassin*. *Match promises:* 200. *Ignore:* −10. |
| **Political sponsor** | *Reject.* *Run on taxing merchants:* −200, +20 influence, −20% mining, −5 per week. *Take 500:* −30 influence. |
| **Call in favors** (after week 4 of the campaign) | *Empty promises:* +30 influence now, −50 five weeks later. *Honest:* −10. |
| **Ambush!** | *Fight* (with the champion as bodyguard, against Ruffian and Mercenary; stake 15). *Talk your way out:* lose up to 200 and −20 influence, plus the loincloth walk home. *Run:* −10 with a bodyguard, −30 without. |

**Consul**

| Event | Choices → outcomes |
|---|---|
| **Uphold the law** (a rival's gladiator caught in intrigue) | 20 lashings. Death: "He will be buried alive!" or "Nail him to the cross!". Crocodiles. *Beneath my station:* +10 influence. |
| Consul variants | Seize mines after a collapse; tax exemption; send beggars to the mines. |

**Tartarus ascension: "Horrors from the underworld"** ("pits have opened from which nightmarish creatures venture forth")
- *Defend the ludus* (champions face weaker monsters), *hunt the worst monsters* (a loss costs −100 influence; a win upgrades the **Monster Loot** item), or *bar the gates* (lose a slave; influence note in §15).
- Monster scaling: weak tier — Mandrake before week 60, Harpy at 60–99, Minotaur at 100+. Dangerous tier — Harpy before week 30, Minotaur at 30–49, Lesser Hydra at 50+. All monsters are buffed every few weeks.

### 6.4 Tutorial-week events
- Week −1: *Plebe in debt*.
- Week 0: *Sensitive information*, *Mine collapsed*, *Not strictly legal*, *Mineral vein*, *Orphanage*.

---

## 7. Event battles (street fights) — `StreetfightChoice` + `EventBattleReportActivity`

**Influence stake:** 15 for scenario 1 (the election ambush), 10 otherwise, doubled if to the death. A win gives +stake (the rival loses it); a loss gives −stake. Scenario-specific results:

| Scenario | Source event | Win | Loss |
|---|---|---|---|
| 1 | Election ambush | stake | −stake |
| 2 | Romulus II bodyguard | Founder chain → step III | — |
| 3 | Beast Master | +300 denarii | — |
| 4 | Assassinate the advocate | +stake | **−500 denarii, −100 influence** |
| 5 | Lugh joust | +stake, the mount **Enbarr** | — |
| 7 | Lazy gladiator | +stake | Winner becomes *Arrogant* |
| 14 | Dark Blade | Blade unassigned, +influence | "Perhaps we best not anger him again.." |
| 16 | Ally attacked by rebels | Ally +15 opinion | — |
| 20 | Theagenes cestus duel | **Myrmex**, Melankomas flag | −stake: "You fool! You thought to defeat me at my own sport…" |
| 27–29 | Spy-suspect follow-ups | +stake; the spy status is cleared | — |
| 98 / 99 | Underworld (defend / hunt) | +5 / +10 influence and Monster Loot upgrade | −100 influence |

- **Dangerous fights** (rebel raids) also spread rival opinion and charge property damage.
- **Allied help:** a pact ally (opinion ≥60) sends its best gladiator, a *GoodBoy/BestBoy* beast "leaps to defend", and a Consul gets two **Lictors**. A Lictor is a randomly generated level 6/10/15 Murmillo bodyguard (level 10 after week 120, 15 after week 220) with *Enforcer*, *Tough*, *Veteran* and more, wearing quality Segmentata and Galea.
- **Looking Glass:** owning it lets the player inspect individual event battle logs.

---

## 8. Adventures and expeditions (`Adventure.java`)

A gladiator sent away is unavailable for the adventure's duration. When the duration elapses, `AdventureActivity` resolves it:
- Difficulty 0 → automatic success (text only). This covers the training trips.
- Difficulty 150–199 → a choice screen (Crocea Mors).
- Otherwise a scripted battle, sometimes preceded by a choice (Hannibal merchant, Sphinx, expedition tactics).

Rewards are the stored denarii and influence, a trait and/or technique, and "experience = 20×weeks" (as text). Returning gladiators get *rebellion grace*: they skip their next betrayal check.

### Adversary table (by difficulty code)

| Code | Adventure | Opponents |
|---|---|---|
| 1 / default | Criminal activity | Brigand |
| 2 | Patrician request | Wild lion |
| 3 | Caravan trap | Bandit and Highwayman |
| 4 | Slaves abducted | Abductor and guard dog |
| 5 | Kill election rival | Guard and guard dog |
| 6 | White Rhino | White Rhino |
| 7 | Romulus I | Guard I and II |
| 8 | Romulus III | Weakest rival's best gladiator and a beast |
| 9 | Pericles | Graverobber I and II |
| 10 | Delphi trial | Mangy, Rabid and Dire wolves |
| 11 | Troy escort | 3 bow assassins; Hector joins your side |
| 200 | Macedon spoils | Vorenus and Pullo |
| 201 | Apollo contest | Assassin |
| 250 | Hannibal merchant (rob) | Guard I, Captain, Guard II |
| 300 | Pharaoh tomb | Risen One (mummy) |
| 301 | Hag's bandits | Bandit Leader and 2 bandits |
| 330 | Grave robbing | 2 Angry Celts and the Local Chief |
| 340 | Looking Glass heist | Guard Captain and Guard |
| 51 | Expedition | Rebel leader (Spartacus wields the best rebel weapon, e.g. Libertas) plus the rebel champion if the rebels outnumber you |

Adversaries scale with ascension level (Sol/Pluto) and Hard/Nightmare: +2 to stats per tier and extra traits.

### Expeditions — "Imperator" / "Servile uprising!" screen
- **Spy visibility.** The Uprising screen shows the slave army size only with ≥2 committed spies, the plundered gold with ≥3, and the rebel leader's level and fame with ≥5.
- **Senate approval:**
  - Refused if the rebels are fewer than 8, with fewer than 5 rebel gladiators, before week 40.
  - Also refused if influence <100, funds <200, or no commander is assigned.
- **Militia size:** 10, plus 5 (BribeGeneral), plus 50 (Imperator), plus army/10, plus funds/40, plus slaves×3. Doubled for a senator and doubled again for the Princeps. Further bonuses at influence tiers from 150 up to 500,000.
- **Size labels:** a force above 75 counts as an *army*; one larger than the rebels is an *extermination*.
- **Duration:** 3 weeks (+1 at Neptune ascension). Default commit is up to 500 denarii and up to 10 slaves. The commander gains *RebelSlayer*. "Capture" mode can be toggled.
- **Tactics.** Three random tactics are offered: Encircle, Night attack, Send scouts, Split forces, Storm defenses, Use fog, Starve them out. Each makes a roll using army ratio, commander cunning versus the rebel leader, traits and Spartacus penalties (−30 on Split forces). The result shifts a battle score by ±0.1–0.3.
- **Outcome:** a commander-led battle, then a battle score; above 0.4 is victory.
  - **Victory:** +50 influence (army) or +30 (skirmish). Rebels are killed in proportion to the score. Slaves return, and half of the reclaimed plunder is paid to you. If the rebellion is nearly broken you loot a rebel weapon (e.g. *Libertas*). If Spartacus is still alive: "the enemy general Spartacus has managed to escape". All rivals +5 opinion. Achievement *Imperator*.
  - **Defeat:** commander −50 fame; −25 influence. The commander may be **captured** (he joins the rebels) if the militia was outnumbered, or flees wounded. Rebels gain escaped slaves and plunder.
  - **Capture mode:** may bring home the rebel general (Spartacus himself, *Recaptured*) or a rebel champion as your gladiator.

---

## 9. Rebellion systems: escapes, raids, Senate armies

### 9.1 Escape attempts and uprisings (`world/loyalty/*`)
- **Weekly check.** Each gladiator not on an adventure passes the check if `rand(40) + 10 ≤ loyalty`. Loyalty ≥50 is always safe. Injured gladiators with ≥15 loyalty also pass.
- **Failed checks** set the size of the betrayal:
  - 1 gladiator → **solo escape**.
  - 2–3 → **coordinated escape**.
  - 4 or more → **uprising**.
- **Rolls.** The cunning roll and the brute-force roll both compare against security, which has diminishing returns. Unhappy unpaid slaves add a bonus, and Spartacus adds his physical stats.
- **Successful escape:** the gladiators join the rebel pool (−10 influence each), and security guards may be slain.
- **Failed escape:** −5 fame and +10 loyalty, plus an injury that can be fatal ("Killed during escape attempt").
- **Uprising where both rolls succeed:** the house is **destroyed** ("burned to the ground by traitorous slaves") and all its gladiators turn rebel.
- **Protection.** A new-player protection reduces the player's solo-escape chance, and betrayals can be disabled in custom settings.

### 9.2 Rebel economy
- **Plunder:** every week the rebels gain 3 plunder per rebel gladiator plus escaped slaves/2.
- **Libertas:** with more than 3500 plunder and a live, free Spartacus, the rebels forge the sword *Libertas* (−3000; a spy rumour reports it). Above 5000 plunder, they convert 200 plunder into a new escaped slave each week.
- **Spartacus' growth:** with an army above 40 he gains *RebelLeader* (+500 XP). Above 120 he becomes *RebelGeneral* (+2000 XP and stat points). He also earns XP every week, more at Mars/Jupiter ascension.
- **Hephaestus** ("chosen of Vulcan") joins the rebellion at the Vulcan ascension level.

### 9.3 Rebel raids (`DecisionFactory.rogueGladiatorEvent`)
- **Trigger:** army size above 1 (large armies count as army/2 + 25). Then `rand(5) > 3` (20%), or `> 2` on Hard (40%), or always if the last raid was more than 3 weeks ago.
- **Target:** the player becomes the target with roughly a 1/3 chance once 6 weeks have passed since the last raid on you (5 on Hard, 4 at ascension >0). Otherwise a random visible rival is chosen, skipping your ally. A raid is skipped if the target's security exceeds 10× the army.
- **Raid on the player** — "Gladiator Uprising!" (army >4) or "Escaped gladiators attack!":
  1. **Fight:** your champion against the rebel champion. A "dangerous" fight brings extra rebels if security is low: "champion is surrounded / outnumbered".
  2. **Buy them off:** 25×army (+10×army at ascension >1), reduced by (50 − week)% early in the game and halved if your security outnumbers them. The gold goes to rebel plunder.
  3. **Retreat behind the gates:** −5 influence; then the hiding rules apply.
- **Hiding rules:** property damage of 5×rebels (15× without walls), divided by 4 if security suffices. If security is short, you lose slaves, the wall, and possibly a gladiator (injured, or stolen on Hard). With no gladiators left, the ludus falls ("your head has been put on a pike at the gate!").
- **Losing a fight** destroys the wall (or the residence), costs slaves or 50 denarii per missing slave, and may cost buildings. The lowest-loyalty gladiator is injured (Normal) or defects (Hard).
- **Raids on rivals** produce Herald reports ("%s attacked by former gladiators!"). They can destroy rival houses ("ransacked by a roaming band of ex-gladiators").

### 9.4 Player raids (intrigue)
The **Raid** intrigue action is how the player wages war on rivals ("invade a rival ludus, killing and destroying as much as they can").
- **Chance:** cunning + level − 20×wall − security, plus trait and spy bonuses, clamped to 1–90%.
- **Success:** destroys the wall and kills 1–2 slaves.
- **Winning the raid battle:** −150 denarii and −25 loyalty to all of the target's gladiators, 2–5 slaves killed, and possibly an item looted. A house reduced to nothing is wiped out ("their entire family has been slaughtered").

### 9.5 Senate armies
- **Trigger:** more than 40 weeks since the last intervention (70 Hard; doubled at Sol), more than 3 rebels, escaped + rebels above 60 (120 Hard), and a 25% roll.
- **Battle:** the Senate wins if `rand(800) + 50 > escaped + plunder/100 + 200 (if Spartacus is free)`.
- **Senate win:** escaped slaves halved, plunder cut to a third, 1–2 rebels killed.
- **Senate loss:** the rebels lose a quarter of escaped slaves and a sixth of plunder, but the weakest rebels become *Killer*/*Veteran* with +1500 XP and +50 fame ("…retreated in shame! … Perhaps we should start an expedition ourselves..").

### 9.6 Defeating the rebellion
The rebellion counts as defeated when Spartacus is not free or is dead, **and** one of these holds:
- fewer than 3 rebels and an army below 50;
- after week 60, fewer than 4 rebels and an army below 70;
- at ascension >2 after week 100, fewer than 8 rebels and an army below 100.

It also requires expeditions to be enabled and week >32. This sets *Spartacus defeated*, which is required for Pythia and for Ascension.

### 9.7 Rudis gladiators (freed champions)
Each week there is a 4% chance one of your freed gladiators resurfaces:
- **2%:** asks to return to you, for a price of base + 200 + 50×level ("civilian life is not for me").
- **1%:** "decided to betray Rome by taking up the sword against us!" (joins the rebels).
- **1%:** joins a rival ("The fool.").

---

## 10. Underground fights and special tournaments (narrative bosses)

### Underground fighting rings
A weekly gauntlet of 10 rounds (12 with the *Legendary Pit Fights* upgrade):

| Round | Opponent(s) |
|---|---|
| 1 | Hungry wolf |
| 2 | "Challenger" (Throw Sand, Cheap Shot) |
| 3 | "Champion" (Gouge, dual wield) |
| 4 | Hungry bear or gorilla |
| 5 | Primus and Secundus |
| 6 | Lion and wolf |
| 7 | Lion and bear |
| 8 | Colossus |
| 9 | Eques |
| 10 | Eques I and II |
| 11 | Primus, Secundus and Tertius (level 8) |
| 12 | Provocator |
| bonus | Two lions and **Tigris** (level 14) |

Wins can grant the *Pit Champion* trait, which the Pythia questline needs.

### Other special tournaments

| Tournament | Content |
|---|---|
| **Spartan Pankration** (every 13 weeks, Cestarii upgrade) | Pugilists, then **Melankomas**, who joins the victor. |
| **Trojan warriors** | §4.4. |
| **Prophecy** | §4.4. |
| **Ascension tournament** (16 levels) | Divine champions: Saturn Horseman, Vulcan Juggernaut, Solar Chosen, Son of Neptune, The Wise One, Venus Descendant, Great hunter, Death Incarnate, Judgement, Benefit and Rejuvenate, The Warrior, The Messenger, One Eyed Giant, then harpies, Manticore, Hydra and Wraith at the Titan levels. |
| Legends of Mars, Poseidon's blessing, league finals | See [03 §6](03-loop-progression.md). |

---

## 11. Persistent characters, legends and curiosities

### 11.1 Werewolves
- Any random market gladiator who rolls a trait has a 1-in-500 chance (`rand(500)==444`) that the trait is **Lycanthropy**: "disappearing at full moon, and then waking up with clothes torn and covered in blood".
- Every 4th week (the "full moon") a lycanthrope or a **Moonstone** holder has a 25% chance to kill one of the owner's slaves ("the gored body was barely recognizable").
- In battle he can transform: "Rips out of his clothes and transforms into a werewolf! His wounds heal by %d". Rivals value lycanthropes double on full-moon weeks.
- The Moonstone (merchant item) "is said to allow one to change into a werewolf during a full moon".
- **Draugluin**, a legendary Briton werewolf (*Lycanthropy*, *Ruthless*, *Fanatic*, dual wield) carrying a Moonstone, joins the weakest rival in week 33 at the **Depths of Tartarus** ascension level. At Tartarus and higher, Decimus' Pontius and Batiatus' Faust also become lycanthropes.

### 11.2 Gryphon egg
- Source: the Hag questline, or winning the Hyperion tournament ("granted a petrified egg").
- Effect: it is heavy and reduces the carrier's strength. In battle it may hatch: "An actual Gryphon has hatched from our egg!"

### 11.3 Theokoles
- **Recruited by the strongest rival:** after about week 50 (earlier on Hard/Nightmare and at higher ascension), if that rival's influence is below yours, with a 20% roll. The rival also spends half its gold.
- **Market appearance:** otherwise he appears in the market, and spies report it.
- **Profile:** "Titan, Albino, HorribleDisfigurement".

### 11.4 Ascension-level appearances (Herald messages)
- **Saturn:** "Cronus, chosen of Saturn" goes to your fiercest opponent after 30 weeks.
- **Vulcan:** "Hephaestus, chosen of Vulcan" joins the rebels.
- **Neptune:** "Poseidon, chosen of Neptune".
- **Pluto:** the champion is struck by a disfiguring disease ("punishment from the gods").
- **Jupiter:** "Jove, chosen of Jupiter" (week 48). The Jupiter league also brings a "Jupiter wolf".
- **Juno:** the ritual dagger "Blood drinker" is found by a rival.
- **Mars:** "Ares, chosen of Mars" (week 18).
- **Gaia:** a Minotaur joins a rival.
- **Tartarus:** Draugluin; underworld attacks every 20 weeks.
- **Cronus:** "The fables Perseus has been swung forward in time by Cronus" (week 20); **Hannibal** returns (week 13). Cronus puts all techniques on cooldown at the start of combat and "will even resurrect heroes long since dead".

### 11.5 Burials and resurrection
- Up to 5 dead gladiators are entombed, ranked by level, fame and leagues won. Each record shows the cause of death, e.g. "Killed while fighting as rebel against the Roman army" or "Executed".
- **Resurrection** requires Pluto's temple favour and ascension. It works only for *Reincarnated* gladiators. It costs 1000 + 100×level + fame/5 + 50×traits denarii, plus a slave, −10% influence, all rivals −10 opinion and all your gladiators −20 loyalty. The gladiator returns with *Undeath*. "The priests of Pluto will demand… both animal and human sacrifices".

---

## 12. Endgame: shrine, milestones and ascension

1. **Milestones** (tracked by the *Ascension* objective):
   - 4 league trophies (5 from Mars ascension). Becoming a senator counts as one.
   - **Spartacus' rebellion crushed**: "nailed on a cross along the Appian way".
   - **Pantheum Shrine** built in **Ariminium**: a shrine "to the entire 'Pantheon'… and in particular the Roman god of time Janus". Ariminium itself comes from the *Holy shrine rumours* event. "Whispers… the shrine makes time pass differently".
   - Bonus: the Prophecy.
2. When milestones are met, the **Ascension tournament** appears every even week (every 50th week once already unlocked). Winning it unlocks ascension: "you have defeated the god's champions and ascension beckons!"
3. **Ascending** starts a new game one level higher. The champion is reincarnated and keeps traits; repeated ascensions make his skin "hard as stone", then "hard as steel". Each level is presided over by a god:
   1. Wealth of Saturn
   2. Vulcan's Forging Destiny
   3. Prowess of Sol
   4. Wrath of Neptune (floods and droughts)
   5. Wisdom of Minerva ("Cheating and intrigue will be harder")
   6. Desire of Venus (loyalty penalties)
   7. Diana's Hunt
   8. Pluto's killing (plague)
   9. Judgement of Jupiter
   10. Vitality of Juno
   11. Violence of Mars (+1 trophy needed)
   12. Apollo's Prophecy, "the last of the Roman Gods"
   13. Creation of Gaia
   14. Hyperion's Heights
   15. Depths of Tartarus
   16. Reaping of Cronus
4. **Pythia's Prophecy** adds one more ascension level as a reward, plus achievements.

**Defeat endings:** debt ("worked itself into considerable debt… the ludus closed"), slave betrayal (burned to the ground), slave attack (ransacked, "head… on a pike") or rival raid (family slaughtered).

---

## 13. Legendary item index (narrative sources)

| Item | How obtained |
|---|---|
| Looking Glass (battle-log inspection) | *Taking a Closer Look* heist |
| Spectral Reins | *Grave Robbing* |
| Black Death (obsidian palm axe) | *Tomb of the Pharaoh* (Sphinx) |
| Achilles' Spear; Hand of Midas | Trojan tournament (Hector) |
| Fulgur (whip) | *Train Gladiator* (honour the deal) |
| Alexander's Armor | *Macedonian Rebels* (beat Vorenus & Pullo) |
| Bow of Apollo (+ Hail of Arrows) | *Bow of Apollo* contest |
| Ksour Essef | *Carthaginian Artifact* |
| Hannibal's Regalia, Helmet, Sandals | *Hannibal's legacy* event, auction, *Hannibal's Sandals* story |
| Crocea Mors | *Quest for Crocea Mors* |
| Founder's Axe, Old Celtic Shield | *Mythical Romulus* I–III |
| Helmet of Pericles | *Legend of Pericles* |
| Shield of Leonidas | Auction event |
| Myrmex (cestus) | *Cestus duel* vs Theagenes |
| Enbarr (mount) | *Jousting challenge* vs Lugh |
| Dark Blade (cursed) | Beggar outcome |
| Libertas | Rebel-forged; looted on expedition |
| Mysterious Egg → Gryphon | *Mysterious Hag* / Hyperion |
| Danaid Dagger; Cyclops Eye | Pythia 4/4; Prophecy |
| White Rhino (beast), Neokoros, Agiad, Melankomas (gladiators) | Rhino hunt, Delphi, Sparta event, Pankration |

---

## 14. Representative flavor quotes (short)
- Solonius: "Quid pro quo %s! … you will make sure my gladiator wins."
- Spartacus: "Rome has not seen the last of me!"
- Pythia: "Do you think the favor of the gods comes lightly?"
- Sphinx: "I have endured half a millennia on this forsaken desert… And you tell me the answer is 'Caterpillar'?"
- Hag: "Tsk. You will regrets those words, death-peddler. I do not forget a slight."
- Ludus Pact: "But Capua has not seen the last of house %s!"
- Hector: "I may have.. smuggled some very valuable items with me."
- Tax collector: "Taxes.. Is there anything more unjust?"
- Drought/flood: "Neptune does not favor us this day.."
- Fools gold: "Gods be damned.. This must be Saturn's doing.."

---

## 15. Code quirks and probable bugs (design-relevant)
1. **Underworld "bar the gates"** *grants* +(2×week + 50) influence. The string implies a loss, but `SlaveLossAndInfluenceChoice` negates an already-negative cost.
2. **Crocea Mors "whatever means necessary"**: success needs `rand(100) > 75 + bonus`, so helpful traits *reduce* the chance (base 24%).
3. **Flood "Senate relief"**: the 1000-denarii compensation (`denariiForAll`) is never paid. Rivals' building loss uses the wrong counter and destroys nothing.
4. **Fools gold "make the best of it"** costs 200 *and* cuts mining, which is strictly worse than paying 200.
5. **Grave Robbing** never charges the 200-denarii map price.
6. **Ludus redistribution "vote against"** still executes the redistribution (this may be intended: "The vote passed despite your best efforts").
7. **Hoplite war refusal** applies −30 loyalty to *every* gladiator, not just the requester.
8. **Hannibal merchant** text says 1500 denarii, but non-Punic gladiators pay 2000.
9. **Party "tavern" option** grants +5 influence while the text says +10.
10. **Spartacus' family-butchered spy report** appears gated on *no* committed spies, which looks inverted (decompiler) **[?]**.

## 16. Uncertainties
- Exact nesting of rebel spawn rates in `World.AppendWeek` (badly decompiled); the cadence in §2 is approximate.
- The "take it easy" arena effect of the Ludus Pact is not visible in battle code.
- `LoanRequest` repayment toggling in `Opponent.determineStoryLine` is partially mangled; the gist (repay once the rival has >300) is clear.
- Expedition tactic shown text and odds are clear, but the final battle-score weights should be re-checked against bytecode if exact win rates are needed.
