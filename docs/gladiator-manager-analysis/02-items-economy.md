# 02 — Equipment, Items, Buildings, Economy and Markets

This document was reverse-engineered from the jadx decompilation (package `com.rene.gladiatormanager`). Text names were resolved through the game's string table. All numbers come from code unless marked **(uncertain)**. Where jadx output is garbled, the most plausible reading is given and labelled.

Conventions:
- **Quality ladder** (enum order, index 0–5): Shoddy, Old, Regular, Quality, MasterCrafted ("Master-crafted"; shown as "Excellent" for mounts), Legendary.
- `rand(n)` means a uniform integer in 0..n-1.
- "Projected denarii" is a permanent, signed weekly cash-flow modifier (`_denariiChangesProjected`). Many events, debts and investments change it permanently.
- Stats: **dmg** is the weapon damage bonus, **blk** is block value (armor), **DR** is damage resistance and **reach** is reach. In combat, `agility` in equipment stats maps to the gladiator's Initiative.

---

## 1. Currencies and tracked resources

| Resource | Scope | How it is gained or spent |
|---|---|---|
| **Denarii** | Per run | The main money. It comes from mining, buildings, the senate (+50/week), tournament prizes, sales and events. It is spent on purchases, upkeep, construction, forging and bribes. |
| **Influence** | Per run | Weekly gain comes from entertainment slaves, buildings and senate status. Influence acts as a threshold for construction. Unlocking influence opportunities in the Lanista, Senator and Trickster trees "allocates" (locks) influence. The base cost by number already unlocked is 20, 40, 80, 160, 300, 500, 1000, 2000, 4000, … 60000, plus tier × base / 2. Examples: Loan is Trickster tier 0, Public Sessions is Lanista tier 0, Bribe General is Lanista tier 1, Market Connections is one possible Senator tier 1 perk. Influence never drops below 0. |
| **Slaves** | Per run | Bought in the slave market, gained or lost through events. They are assigned to Mining, Entertainment, Security or Spies. Any unassigned slaves are auto-assigned to Security at week end. |
| **Gems** | Meta (account-wide) | Earned from achievements and bought as IAP (`gems_small` = +500, `gems_large` = +1500). They are spent on permanent **Upgrades** that unlock weapons, armor, buildings and events (costs 50–300, see §13). |
| Fame | Per gladiator | Feeds gladiator price and worth. |
| Favour | Combat only | Comes from temple artifacts, the Temple of Pluto and similar sources. |
| Heirloom score | Per player | Tracked by the Helm of the Woven Path (§4.4). |

---

## 2. Value ("worth") formula and how prices derive from it

Every inventory object has `getWorth()` = **base(type) + augment/legendary bonus**, multiplied by a quality multiplier:

| Category | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary |
|---|---|---|---|---|---|---|
| Weapons | ×0.5 | ×1 | ×1.5 | ×3 | ×4 | ×9 |
| Equipment, Items, Mounts | ×0.5 | ×1 | ×1.5 | ×3 | ×5 | ×11 |

Broken weapons (augment Broken/BrokenTimeWarp) are worth /10, and all their combat stats become 0.

Worth drives everything:
- **Market purchase price** = worth.
- **Sell to market** (player) = worth / 2. The sold item goes back into the current market list.
- **AI sells** surplus gear for 75% of worth. AI buys leftovers from last week's market at worth − worth/4 (75%).
- **Forge, reforge and repair costs** are fractions of worth (§7).
- **Auto-equip** picks the highest-worth gear: proficient weapon types ×2, the class's preferred weapon ×8, similar types ×3, preferred off-hand ×8.
- **Gladiator gear happiness** uses total assigned gear worth (§9.6).

---

## 3. Weapons

### 3.1 Weapon types, families and handling

| Type (UI name) | Family | Handling notes |
|---|---|---|
| Pugio | Dagger | Backstab. Dual-wield option. |
| Parazonium | Dagger | Backstab plus **Concealed**: when used off-hand, the first strike always crits. Dual-wield option. Needs the *Parazonium* upgrade. |
| Gladius | Sword | Gets +2 damage when paired with a Scutum (Centurion or Legionary shield). Dual-wield option. |
| Spatha | Sword | **TwoHanded**: +2 dmg when the off-hand is empty. Needs the *Spatha* upgrade. |
| Xiphos | Sword | +1 block when no shield is carried, including when it is used as the off-hand. |
| Sica | Sword | Bypasses the enemy shield's block value. Needs the *Sica* upgrade. |
| Khopesh ("Bronze Khopesh") | Sword | Bonus damage vs light armor and shields, slightly less vs heavy. |
| Falcata | Sword | +2 dmg (Shoddy/Old) or +3 dmg (Regular+) when used two-handed. Punic and Iberian gladiators add another +1/+2. Needs *Celtiberian Weaponry*. |
| Securis (battle axe) | Axe | −3 initiative (partly offset by quality). Dual-wield option. |
| Bipennis | Axe | −3 initiative (offset by quality). **TwoHandedOnly**. |
| Palm Axe | Axe | **TwoHandedOnly**. **Egyptian**: +5 accuracy for Egyptian-origin gladiators. |
| Hasta | Spear | No special effect. |
| Dory | Spear | **Sauroter**: negates the first disarm. |
| Fuscina (trident) | Spear | −2 strength and −2 initiative. Massive crit chance vs ensnared targets. |
| Pilum | Javelin | Reach +8. Pilum effect: −25% accuracy, but a crit lowers target armor 25% for the battle. Uses spear or bow proficiency, whichever is higher. |
| Wooden Bow | Bow | **TwoHandedOnly**. Gets a free long-range shot vs slower melee opponents. Reach 10. |
| Cestus | Fist | **HandToHand**: worn on both hands, counts as bare-fisted, cannot be disarmed, extra attack each turn. |
| Leather Whip | Whip | +15% (crit) hit chance vs beasts and unarmed targets. A crit snares for 2 turns. Allows a dagger in the off-hand. |

TwoHandedOnly is described as "+10% crit". In `Combatant` the +10 is added in two separate conditions for TwoHandedOnly weapons, so they effectively get **+20 crit** (probable bug).

Equipping weapons in all of the following slots grants **+1 armor**: mainhand (counts 2 if two-handed), off-hand, helmet, armor, mount and item, totalling ≥ 6.

### 3.2 Weapon stat and worth table

Each cell is dmg / blk / worth. Worth = base × quality multiplier.

| Weapon | Reach | Base worth | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary | Initiative / Strength penalty |
|---|---|---|---|---|---|---|---|---|---|
| Pilum | 8 | 200 | 2/0/100 | 2/1/200 | 3/1/300 | 4/1/600 | 5/2/800 | 5/3/1800 | – |
| Cestus | 0 | 100 | 1/0/50 | 1/1/100 | 2/1/150 | 2/2/300 | 3/2/400 | 4/3/900 | – |
| Leather Whip | 3 | 160 | 0/1/80 | 1/1/160 | 2/1/240 | 3/2/480 | 4/2/640 | 5/3/1440 | – |
| Hasta | 3 | 100 | 1/0/50 | 1/1/100 | 2/1/150 | 3/1/300 | 4/2/400 | 5/2/900 | – |
| Palm Axe | 3 | 200 | 2/1/100 | 3/1/200 | 4/2/300 | 5/2/600 | 6/3/800 | 7/4/1800 | – |
| Wooden Bow | 10 | 150 | 2/0/75 | 3/0/150 | 4/0/225 | 4/1/450 | 5/1/600 | 6/1/1350 | – |
| Dory | 4 | 200 | 1/0/100 | 1/0/200 | 2/0/300 | 3/0/600 | 4/1/800 | 5/1/1800 | – |
| Securis | 1 | 120 | 3/0/60 | 4/1/120 | 5/1/180 | 6/1/360 | 7/1/480 | 9/2/1080 | Ini −3, −3, −2, −2, −1, −3 |
| Bipennis | 2 | 250 | 5/1/125 | 6/2/250 | 7/2/375 | 8/3/750 | 9/3/1000 | 10/4/2250 | Ini −3, −3, −2, −2, −1, 0 |
| Fuscina | 3 | 160 | 3/1/80 | 3/2/160 | 4/2/240 | 5/2/480 | 5/3/640 | 6/3/1440 | Str −2, Ini −2 |
| Spatha | 2 | 300 | 1/1/150 | 2/2/300 | 2/3/450 | 3/4/900 | 4/5/1200 | 5/6/2700 | – |
| Xiphos | 1 | 200 | 1/1/100 | 2/2/200 | 2/3/300 | 2/4/600 | 4/4/800 | 5/5/1800 | – |
| Falcata | 1 | 180 | 1/1/90 | 2/2/180 | 3/2/270 | 3/3/540 | 5/3/720 | 6/4/1620 | – |
| Sica | 1 | 200 | 1/1/100 | 2/1/200 | 2/2/300 | 2/3/600 | 4/3/800 | 5/3/1800 | – |
| Khopesh | 1 | 250 | 2/1/125 | 3/1/250 | 4/2/375 | 5/2/750 | 6/2/1000 | 6/3/2250 | – |
| Gladius | 1 | 150 | 1/1/75 | 2/2/150 | 2/3/225 | 3/3/450 | 4/3/600 | 5/4/1350 | – |
| Parazonium | 0 | 180 | 2/0/90 | 3/0/180 | 3/1/270 | 4/1/540 | 5/1/720 | 6/2/1620 | – |
| Pugio | 0 | 50 | 1/1/25 | 2/1/50 | 2/2/75 | 3/2/150 | 4/2/200 | 5/3/450 | – |

When no weapon is assigned, the default weapon is "Shoddy Pugio (Arena provided)", or "Shoddy Cestus" for pugilists.

### 3.3 Weapon augments (prefix or state on a weapon)

| Augment | Effect | Worth bonus (added before the quality multiplier) | Source |
|---|---|---|---|
| Lunar | Protects from blinding. Each time a status is resisted, +1 dmg | +100 | Lunar League prizes (Gladius Q/R/Old) |
| Solar | Can blind the opponent. +2 dmg when an opponent is blinded | +100 | Solar League (Xiphos MC/Q/Q) |
| Bloody | **BloodDrinker**: heals 30% of weapon damage | +150 | Annum League, rival gifts, LifeDrinker |
| Precision | Increased hit chance | +125 | Reforging a MasterCrafted weapon, forging at Blacksmith 3, objective rewards |
| Blessed | **TempleArtifact**: +1 favour | +150 | Objectives, rival gifts, Supreme auctions (armor) |
| TimeWarped | **AscendedBlade**: after 2 rounds, +30% lifesteal and crit | +100 | Ascension favoured weapon (arrives Broken, see below) |
| Broken / BrokenTimeWarp | All stats 0, worth /10 | – | Repair at the blacksmith. BrokenTimeWarp is repaired into TimeWarped. |

### 3.4 Legendary and unique weapons

| Name | Base type / quality | Stat changes vs base | Effects | Worth | How obtained |
|---|---|---|---|---|---|
| Sword of Mars | Gladius, Legendary | – (5/4) | Fear | (150+50)×9 = 1800 | Win the **Mars** tournament (Legends of Mars upgrade). It is also carried by the "Champion of Mars". |
| Libertas | Gladius, Legendary | +1 dmg, −1 blk (6/3) | +10% crit | 3150 | Forged by the rebel army when plundered gold > 3500 while Spartacus lives. It joins the rogue weapons and can be looted from a winning expedition. |
| Crocea Mors | Gladius, Legendary | – | **RomanConquest**: Roman gladiators get 30% lifesteal and +5 accuracy | 2250 | Adventure quest "The Lost Blade" (difficulty code 150; *CroceaMors* upgrade) |
| Dark Blade | Gladius, Legendary | Bloody state +2 dmg, Sated +1, Neutral 0, Hungry −2/−2, Starving −3/−3 | BloodLust (50% lifesteal) when Bloody, otherwise BloodDrinker 30%. **Cannot be unequipped.** | 2250 | Beggar delayed outcome "BeggarGivesArtefact" (once per game) |
| Myrmex | Cestus, Legendary | +1 dmg (5/3) | Bleeding | 2700 | Win the Myrmex streetfight event (event result 20) |
| Fulgur | Whip, Legendary | +3 initiative | Increased hit chance. Bleeding on crit instead of snare. | 3240 | Story line (rival or player) |
| Bow of Apollo | Wooden Bow, Legendary | +1 dmg, +1 blk, +4 reach (7/2, reach 14) | Free bow shot even vs ranged opponents | 2700 | Adventure code 201. If the quest fails, a rival gets it. |
| Thyrsus | Hasta, Legendary | −2 dmg (3/2) | Always deals poison damage | 2250 | 1st prize of the **League of Bacchus** |
| Black Death | Palm Axe, Legendary | +1 dmg (8/4) | Fear, +1 favour (main or off-hand) | 3600 | Adventure code 300 (Tomb of the Pharaoh story, *Egyptian Ancestry*) |
| Achilles' Spear | Dory, Legendary | +2 dmg, +2 blk, +10 HP, +2 Str (7/3) | Needs ≥30 strength to wield effectively | 3600 | Win 5+ knockout rounds of the **Troy** pit tournament (Restoration of Troy story) |
| Founder's Axe | Securis, Legendary | No initiative penalty (9/2) | +10% crit | 2430 | Founder chain adventure (code 8, which also gives the Ancient Celtic Shield). If it fails, a rival gets it. |
| Poseidon's Trident | Fuscina, Legendary | – (6/3, Str −2, Ini −2) | Fuscina effect | 2340 | Win the **Poseidon** tournament |
| LifeDrinker | Parazonium, MasterCrafted, Bloody | +2 dmg, −1 blk (7/0) | BloodDrinker 30%, Concealed, Backstab | (180+150+50)×4 = 1520 | An ascension turn effect gives it to the weakest rival |
| Danaid Dagger | Pugio, Legendary | +1 dmg (6/3) | **Deceptive** | 1800 | Objective reward. The exact objective mapping was lost in decompilation **(uncertain)**. |

**Dark Blade lifecycle.** Each week the blade's wielder is checked:
- The blade steps one stage down: Bloody → Sated → Neutral → Hungry → Starving.
- At Starving it cannot drop further, and there is a 50% chance per week to drain the wielder's life force.
- Wounding a human opponent in battle moves it one stage up.
- Killing one resets it to Bloody.
- A decision event lets you ignore or destroy it.

### 3.5 Weapon unlocks (Upgrades, gems)

| Weapon | Required upgrade |
|---|---|
| Falcata | Celtiberian Weaponry (100 gems) |
| Spatha | Spatha (100) |
| Sica | Sica (100) |
| Parazonium | Parazonium (50) |

Locked items appear in markets but cannot be bought, reforged or forged.

---

## 4. Armor, helmets, shields, nets

Slots are armor (chest), helmet, off-hand (shield or net), item and mount.
- `isArmor`: Cloak, Segmentata, Cataphract, Cuirass, Leather Armor, Galerus, Linthorax.
- `isHelmet`: Aquarius, Tigris, Corinthian, Carthaginian, Galeo, Gallic, Bronze, Hood.
- `isShield`: Wooden, Hoplon, Centurion, Legionary, Caetra. Shields also get bonus armor vs long-reach weapons, scaled by the attacker's reach.
- Off-hand: shields or Rete (net).
- Heavy armor (used by the Agile trait check): Centurion and Legionary scuta, Cuirass, Segmentata, Cataphract.

### 4.1 Chest armor

Each cell is blk, plus other modifiers.

| Armor | Base worth | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary | Notes |
|---|---|---|---|---|---|---|---|---|
| Galerus | 200 | 1 | 1, Ini +1 | 1, Ini +2 | 2, Ini +2 | 2, Ini +3 | 3, Ini +3 | Light |
| Cloak | 250 | 0, Cun +2 | 1, Cun +2 | 1, Cun +3 | 2, Cun +3 | 2, Cun +4 | 3, Cun +4 | **Stealthy** (helps intrigue) |
| Leather Armor | 300 | 1 | 2 | 2 | 3 | 4, Ini +1 | 5, Ini +2 | Mobility +2 block when faster than the attacker (Shoddy/Old); Greater Mobility +4 (Regular+). Needs *Leather Armor*. |
| Linthorax | 150 | 1 | 1 | 2 | 3 | 4 | 5 | Sturdy: +2 block vs unarmed/beasts (Shoddy). Very Sturdy: +3 (Old+). Needs *Legacy of Alexander*. |
| Cuirass | 500 | 2, Ini −1 | 3, −1 | 4, −1 | 5, −1 | 6, −1 | 7, −1 | Heavy |
| Segmentata | 450 | 2 | 3 | 4 | 5 | 6 | 7 | Set "Roman Legionary" (§4.5). Needs *Segmentata & Galea*. |
| Cataphract Armor | 700 | 4, Ini −4 | 5, −4 | 6, −4 | 7, −4 | 8, −3 | 8, −2 | Cataphract set. Needs *Cataphracts*. |
| Unarmored | – | 0 | | | | | | Placeholder |

### 4.2 Helmets

| Helmet | Base worth | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary | Notes |
|---|---|---|---|---|---|---|---|---|
| Hood | 100 | 0, Cun +1 | 0, +2 | 0, +3 | 1, +3 | 1, +4 | 2, +5 | Stealthy |
| Bronze Helmet | 120 | 1, DR 1, Cun −3 | 2, DR 1, −3 | 2, DR 1, −2 | 3, DR 2, −2 | 4, DR 2, −2 | 5, DR 3, −2 | |
| Galeo | 150 | 1 | 2 | 3 | 4 | 5 | 6 | Legionary set. Needs *Segmentata & Galea*. |
| Carthaginian Helmet | 150 | 0 | 1 | 2 | 2, +5 HP | 3, +5 HP | 4, +10 HP | **CarthageHelmet**: Punic gladiators get +HP and +initiative. Needs *Carthaginian Artifacts*. |
| Gallic Helmet | 200 | 0 | 1 | 2 | 3 | 4 | 5 | **StunResist** (text says 20%, code adds +8 stun resist). Needs *Gallic Helmet*. |
| Corinthian Helmet | 200 | 1, Cun −4 | 2, −4 | 3, −3 | 4, −1 | 5, −1 | 6, −1, DR 1 | **CriticalBlock** (+2 block vs crits). Needs *Athenian Artifacts*. |
| Aquarius Helmet ("Champion Helmet") | 100 | 1, DR 1, Cun −2 | 2, DR 1, −2 | 3, DR 1, −2 | 4, DR 2, −2 | 5, DR 2, −1 | 6, DR 3, −1 | **Magnificent** (+2 bonus fame). **Family item**: only adopted gladiators may wear it. Given (Old) on adoption if the *AquariusHelmet* upgrade is owned. |
| Tigris Helmet | 300 + 100 | 1, Str +2, Cun −4 | 2, Str +2, Cun −3 | 2, +2, −2 | 3, +3, −2 | 4, +4, −2 | 5, +4, −2 | Not sold in the market. It comes from underground battles and events. |
| No Helmet | – | – | | | | | | Placeholder |

### 4.3 Shields and nets (off-hand)

| Off-hand | Base worth | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary | Notes |
|---|---|---|---|---|---|---|---|---|
| Wooden Shield | 100 | 1 | 2 | 3 | 4 | 5 | 6 | Str −1 (all qualities) |
| Caetra | 120 | 1, Str −1 | 1 | 2 | 3 | 4 | 5 | **Strapped**: the mainhand counts as two-handed (Spatha/Falcata bonuses apply). Needs *Celtiberian Weaponry*. |
| Legionary Scutum ("Scutum") | 150 | 2 | 3 | 4 | 5 | 6 | 7 | Str −2, Ini −2. Scutum effect: +2 Gladius damage. |
| Centurion Scutum | 250 | 2 | 3 | 4 | 5 | 6 | 7 | Str −1, Ini −1. Scutum effect. |
| Hoplon | 200 | 2, Str −3 | 2, −2 | 3, −2 | 4, −2 | 5, −2 | 6, −1 | **ShieldBash**: chance to stun each round; stun strength = block value. Needs *Hoplon*. |
| Rete (net) | 150 | Str −3, Ini −2, Net | −2/−2, Net | −2/−2, Hooked | −1/−1, Hooked | −1/−1, Hooked | −1/−1, Hooked | Net ensnare level 2, Hooked Net level 4. No block. A MasterCrafted Rete cannot be reforged. Forging it requires the Workshop. |

### 4.4 Equipment augments and unique or legendary equipment

**Augments**

| Augment | Effect | Worth bonus |
|---|---|---|
| Reinforced | +2 blk, −1 initiative | +125 |
| Fortified | +3 blk | +175 |
| Vulcan | +5 HP | +200 |
| Blessed | +1 favour (TempleArtifact) | +250 |

**Unique and legendary pieces**

| Name | Base | Stats (incl. base) | Effects | Worth | How obtained |
|---|---|---|---|---|---|
| Shield of Leonidas | Hoplon, Legendary | blk 6, Str −1, +10 HP | Magnificent, ShieldBash | 2200 | Auction event (§11.5) |
| Taranis' Aegis | Wooden, Legendary | blk 6, Str 0, +10 HP | **Taranis**: Gauls and Britons add favour to block; +1 favour each time the Aegis is hit | 2200 | The Ancient Celtic Shield transforms into it when wielded by a Gaul or Briton in the Myrmex event battle |
| Ancient Celtic Shield | Wooden, Legendary | blk 3 (−3), Str −1 | – | 1100 | Founder chain (adventure code 8, or founder progress 22 → 40) |
| Ancile | Wooden, Legendary | blk 7, Str −1 | +1 favour | 1100 | 1st prize of the **Jupiter League** |
| Helmet of Pericles | Corinthian, Legendary | blk 6, DR 1, Cun 0, +10 HP | CriticalBlock | 3300 | Pericles adventure (code 9). If it fails, the weakest rival gets it. |
| Hannibal's Helmet | Carthaginian, Legendary | blk 4, +10 HP, Cun +5 | CarthageHelmet; Hannibal set | 2200 | Auction event (*Hannibal's Legacy*) |
| Hannibal's Regalia | Cloak, Legendary | blk 3, Cun +4 | Stealthy; Hannibal set | 4400 | Hannibal adventure (code 250) |
| Alexander's Armor | Linthorax, Legendary | blk 5, +2 Str/Ini/Cun | Very Sturdy | 5500 | Adventure code 200. If it fails, a rival gets it plus 200 denarii and 20 influence. |
| Ksour Essef | Cuirass, Legendary | blk 7, Ini +1 (−1 +2) | CarthageArmor (Punic bonus) | 5500 | Carthaginian Artifact story result. Without the upgrade you get an MC Cuirass instead. |
| Helm of the Woven Path | Gallic Helmet (bought as Old) | Gallic stats, +5 HP | **Heirloom** | 300 at Old | Traveling merchant, 150 denarii. It keeps its name when reforged. |

**Heirloom score.** The Helm of the Woven Path tracks a per-player score:
- Buying it gives +1.
- Each battle won while it is worn gives +1 (capped at 100).
- Losing while wearing an **Aquarius** helmet sets score = score × ¾ (that is what the code checks; probably meant for the Woven helm).

| Heirloom score | Display bonus |
|---|---|
| ≥ 3 | +1 blk |
| ≥ 10 | +2 blk, +1 dmg |
| ≥ 20 | +2 dmg |
| ≥ 100 | +3 blk |

The code only adds these bonuses in the gear-selection and detail UIs. No combat application was found **(uncertain whether they apply in combat)**.

### 4.5 Set bonuses (checked at battle start)

| Set | Pieces | Bonus |
|---|---|---|
| **Roman Legionary** | Segmentata + Galeo + Gladius + Centurion or Legionary scutum (4 pieces) | +2 blk, +2 DR |
| **Hannibal** | Regalia + Hannibal's Helmet + Hannibal's Sandals (3 pieces) | +2 blk, +2 dmg. CarthageSet: more fame and influence generated, rival opinion decreases. |
| **Cataphract** | Cataphract Armor + (Numidian or Celtic horse, or any Reins item) + a spear-type weapon (3 pieces) | +4 armor |

The Cataphract piece-count decompiles badly: 1 for the armor, +1 for a mount or reins, +1 for a spear **(slightly uncertain)**. The Cataphract *trait* (separate from the set) adds +10 stun resist on a horse, and +5 HP per armor point above 20.

---

## 5. Items and consumables (item slot)

Items cannot be reforged. Their quality is fixed when they are created.

| Item (UI name) | Base worth | Effect (quality-dependent values) | Consumed? | Sources |
|---|---|---|---|---|
| Bandages | 100 | Prevents or downgrades one injury from training or battle, then auto-assigns the next bandage | Single-use | Market (20%, plus 40% after week 15), Workshop craft, start (normal mode), Market Connections (2) |
| Antidote | 100 | Poison immunity for the battle (consumed). Also lowers poison-intrigue chance. | Single-use | Market 10%, Workshop |
| Neptune Amulet (`PoseidonAmulet`) | 150 | Poison resistance (+1), lower intrigue poisoning chance | No | Market, Workshop, events |
| Jupiter Amulet | 300 | **EagleVision**: +5 accuracy, crit, blind resistance | No | Market, Workshop, events |
| Lucky Ring | 175 | TempleArtifact, +1 favour | No | Traveling merchant 150 |
| Sandals | 100 | Initiative +0/+1/+2/+3/+3/+4; MC +5 HP; Legendary +10 HP; +5 stun resist | No | Merchant (Old, 100). Hannibal's Sandals (Legendary, worth +100). |
| Greaves | 100 | blk/Ini: 1/−2, 1/−1, 2/−1, 2/0, 3/0, 4/0 | No | Market; forge (MC) at Blacksmith 3 with *Spartan Dynasty* |
| Caltrops | 150 | Str: Old −2, Regular −1, Quality −1, MC 0. Throwable: lowers initiative and deals damage (1 charge; 2 at Quality+). | No | Market |
| Silphium Extract | 300 | **Forget 1 of 3 random techniques** (all ranks refunded) and +20 loyalty | On assign | Market ~1%, Workshop |
| Tome of Traits | 400 | Choose 1 of 3 new traits (one strength, one initiative, one cunning trait) | On assign | Market ~1%, merchant 300, library events 300/500, Forbidden Contraband, family heirloom event |
| Bottled Lightning | 500 flat | Gladiator learns the ThunderStrike technique; −5 loyalty; Ill for 2 weeks | On assign | Market 30%; Workshop (MC) with *Thunder Strike* |
| Whispering Sand | 500 | Unlocks origin level 2 (hidden origin power) | On assign | Invader-tournament champion tiers; rivals |
| Monster Loot | 50 | Piece (Shoddy) → Set (Old) → Bunch (Regular). Each underworld win upgrades it. The Regular bunch grants the **Herculean Strength** trait. | On assign | Underworld event battles |
| Mysterious Egg | 300 | Str −1. 10% per battle (plus a win or 50% roll) to progress: Glowing → Cracked → Hatching. It then becomes a **Gryphon** beast and the carrier gets the Life Bringer trait. Petrified egg: the first progress removes the petrification. | No | Story, Hyperion tournament (petrified), ascension |
| Mandrake | 500 | Shatter on the battlefield to release a mandrake beast. Strength depends on quality: weak if Shoddy, regular if Old, strong otherwise. | No | Market (rare), merchant 200 |
| Moonstone | 250 | +5 HP. Werewolf transformation for lycanthropes; slaves may be killed on full moons. | No | Market 1/500, merchant 200 |
| Cyclops' Eye (`EyeBall`) | 50 | +1 cunning, +2 accuracy. Gives vision to blind gladiators. | No | Ascension/prophecy rewards |
| Hand of Midas | 400 | +1 blk, +1 favour. Cures and immunises Missing Fingers. **Cannot be unequipped.** After battle it logs "coins scattered" (rand(2×favour+25+fame/200)), but no AddDenarii call was found, so it looks cosmetic **(uncertain)**. | No | Troy tournament, knockout round 4 |
| Reins / Spectral Reins | 50 (+200) | Spectral Reins: +5 HP. Summons a spectral steed when no mount is equipped. With a mount: +10 dodge, +5 damage, +10 HP. | No | Grave-robbing adventure (code 330), or the strongest rival |
| Looking Glass | 50 | Lets you inspect enemies before event battles | Not equippable | Adventure code 340 |
| Loaded Dice | 0 | While owned: +1 denarius per **entertainment slave** per week | Not equippable | Tavern gambling event |
| Strange Fruit | 50 | No code references (unused) | – | – |

---

## 6. Mounts

Mounts need **Stables** before they show in the market. They take the mount slot and can be reforged ("Train"). All mounts apply a base −6 initiative.

| Mount | Base worth | Shoddy | Old | Regular | Quality | MasterCrafted ("Excellent") | Legendary |
|---|---|---|---|---|---|---|---|
| Numidian horse | 500 | (Ini −6 only) | Str +2, blk 1, HP +10, reach 1 | +2, 1, +15, 2 | +3, 2, +15, 3 | +4, 2, +20, 3 | +5, 2, +20, 3 |
| Celtic horse (*Celtic War Horses*) | 600 | (Ini −6) | Str +1, blk 1, HP +25 | +1, 2, +30, reach 1 | +2, 3, +35, 2 | +3, 4, +35, 2 | +4, 4, +40, 2 |
| Elephant (from an owned elephant beast) | 2500 | Str +10, blk 3, HP 20, reach 4, Ini −16 | +15, 4, 25, 4, −14 | +20, 5, 35, 4, −14 | +25, 5, 45, 4, −12 | +30, 6, 60, 5, −6 | +35, 6, 80, 5, −6 |
| Gryphon (from a gryphon beast) | 3500 | Str/Ini +5, blk 4, HP 10, reach 2 | +8, 5, 15, 2 | +10, 6, 20, 2 | +15, 6, 25, 3 | +20, 7, 30, 3 | +25, 7, 35, 3 |
| Spectral Steed | 100 | Str +4, blk 2, HP +20, reach 2, Ini −6 | | | | | |
| **Enbarr** | Celtic Legendary (6600) | Ini −1 net (+5), Magnificent, **LightFooted** (+5 accuracy) | | | | | |

Mount quality is "Regular" when not stated otherwise. Market horses only roll Old, Regular or Quality.

- **Barded** augment: only MC mounts, via reforge with the *Cataphracts* upgrade. Gives +2 blk, −2 initiative, +10 HP, worth +100.
- **Elephants** derived from beasts take quality from beast level: <5 Shoddy, ≥5 Old, ≥12 Regular, ≥25 Quality, ≥45 Legendary. They gain an augment from the beast's best stat:
  - Strong (Str ≥ 45): +10% of elephant strength to the rider.
  - Fast (Ini ≥ 30): +10% of its initiative.
  - Smart (Cun ≥ 36): +10% of its cunning.
  - Tough (max life ≥ 220): +10% of its health.
  - Elephants frighten horses.
- **Gryphons** grant the Hurricane technique. Riders must be "worthy": ≥3 points, where Reincarnated and Mythical count 2 each, and Adopted, BeastTamer, Ascended and each champion trait (Lunar, Solar, Jupiter, Vulcan, Bacchus, Annum, LifeBringer, World) count 1 each.
- **Enbarr** is won in a specific event streetfight (event result 5).

---

## 7. Blacksmith forge, Workshop crafting, reforge, repair

### 7.1 Forging new gear (ForgeActivity + ForgeFactory.forge)

The catalogue quality depends on Blacksmith level: L1 = Regular, L2 = Quality, L3 = MasterCrafted. Each forge is an immediate cash purchase; there is no build time.

**Catalogue**
- **Weapons:** Gladius, Pugio, Hasta, Securis, Khopesh, Falcata*, Wooden Bow, Fuscina, Bipennis, Sica*, Parazonium*, Spatha*, Cestus.
  - Falcata needs its upgrade and Blacksmith ≥1.
  - Sica, Parazonium and Spatha need their upgrades and Blacksmith ≥2.
- **Equipment:** Galerus, Cloak, Leather Armor*, Segmentata*, Cuirass, Hood, Bronze Helmet, Galeo, Corinthian Helmet, Gallic Helmet*, Wooden Shield, Caetra*, Cataphract Armor*, Legionary Scutum, Centurion Scutum.
  - Leather, Segmentata/Galeo and Gallic need their upgrade and Blacksmith ≥2.
  - Caetra needs its upgrade and Blacksmith ≥1.
  - Cataphract needs *Cataphracts* (the jadx output is garbled here **(uncertain)**).
- **Workshop (any level ≥1) adds:** Rete, and the craftable items Bandages, Antidote, Neptune Amulet, Jupiter Amulet and Silphium Extract (all Regular).
- **MasterCrafted Greaves** need Blacksmith 3 and *Spartan Dynasty*.
- **MasterCrafted Bottled Lightning** needs the Workshop and *Thunder Strike*.

**Cost** = worth × (0.80 at Blacksmith 0, 0.75 at L1, 0.65 at L2+), minimum 10.
- ×2 if the template is augmented.
- ×2 for items.
- At Blacksmith 3, a Pugio costs at least 150.

**Outcome (rand(10))**
- At Blacksmith ≥3, add rand(5). If that extra roll is ≥3 and the template has no augment, the piece gets **Precision** (weapons) or **Reinforced** (armor, helmet, shield). Reinforced is upgraded to **Fortified** if the total roll >7.
- Roll <2: "bad forge". You get Shoddy at L1, Regular at L2+.
- Roll >8: "great". You get Quality at L1, MasterCrafted at L2+.
- Otherwise you get the catalogue quality.
- Items always come out as listed.

The weapon/equipment branches of `forge()` are partly garbled in jadx. The above is the intended reading **(medium confidence)**.

**Forge cost table** (computed from the formulas)

| Weapon | L1 (Regular) | L2 (Quality) | L3 (MC) |
|---|---|---|---|
| Gladius | 168 | 292 | 390 |
| Pugio | 56 | 97 | 150 |
| Hasta / Cestus | 112 | 195 | 260 |
| Securis | 135 | 234 | 312 |
| Khopesh / Bipennis | 281 | 487 | 650 |
| Falcata / Parazonium | 202 | 351 | 468 |
| Wooden Bow | 168 | 292 | 390 |
| Fuscina | 180 | 312 | 416 |
| Sica | 225 | 390 | 520 |
| Spatha | 337 | 585 | 780 |

| Equipment | L1 | L2 | L3 |
|---|---|---|---|
| Galerus / Corinthian / Gallic | 225 | 390 | 650 |
| Cloak / Centurion Scutum | 281 | 487 | 812 |
| Leather Armor | 337 | 585 | 975 |
| Segmentata | 506 | 877 | 1462 |
| Cuirass | 562 | 975 | 1625 |
| Cataphract Armor | 787 | 1365 | 2275 |
| Hood / Wooden Shield | 112 | 195 | 325 |
| Bronze Helmet / Caetra | 135 | 234 | 390 |
| Galeo / Legionary Scutum / Rete | 168 | 292 | 487 |

| Workshop item | Cost at Blacksmith L1 | L2+ |
|---|---|---|
| Bandages, Antidote | 224 | 194 |
| Neptune Amulet | 336 | 292 |
| Jupiter Amulet, Silphium Extract | 674 | 584 |
| Greaves (MC) | 750 | 650 |
| Bottled Lightning (MC) | 750 | 650 |

### 7.2 Reforging (upgrade an owned piece)

**Allowed when all of these hold:**
- Blacksmith ≥ 1.
- The piece is unlocked and reforgeable. Weapons, equipment (except an MC Rete) and mounts are reforgeable; items are not.
- Either its quality is below the tier (L1 Regular, L2 Quality, L3 MC), or it is MasterCrafted, unaugmented and not the Sword of Mars.
- MC mounts additionally need *Cataphracts*.

**Cost** = worth × (1.00 at L0, 0.95 at L1, 0.90 at L2+), minimum 10.

**Roll** r = rand(10) + Blacksmith level (+2 when repairing).
- Success needs r ≥ (quality index + 1). Shoddy needs ≥1, Old ≥2, Regular ≥3, Quality ≥4, MC ≥5.
- On failure the money is lost and the item is unchanged.

**On success**
- Quality goes up one step, or two steps if r > 10 and the new index < 4 (only possible at L2/L3).
- If the piece was MasterCrafted, it stays MC and gains an augment: Precision for weapons, Barded for mounts (with Cataphracts), or Reinforced (or Fortified if r > 7 and Blacksmith 3) for armor, helmets and shields.

The AI rivals reforge too. With player ascension >1 they pay half price, and their tier jumps to MasterCrafted at Blacksmith 2.

### 7.3 Repair (broken weapons and equipment)

Cost = worth of the unbroken version × (0.50 at L0, 0.45 at L1, 0.40 at L2+), minimum 10. The repair uses the reforge roll (+2) and keeps the quality. BrokenTimeWarp becomes TimeWarped.

---

## 8. Buildings (Construction)

### 8.1 General rules

- **One construction action per week**, in any location. The `hasConstructed` flag resets during weekly resolution.
- Building is **instant** on payment. There is no build time and no per-building upkeep. Negative "denarii" benefits (Rome Mansion) work as upkeep.
- Requirements are thresholds: slaves, gladiators, influence and residence level must be met. **Only denarii are consumed.**
- A residence requirement R means the internal residence level must be ≥ R. The UI shows level R+1.
- **Locations:**
  - **Capua:** Residence, Training Field, Temple, Stables, Blacksmith, Medicus, Mine, Wall, Library.
  - **Ariminum** (Ariminium Camp, Shrine, Aqueduct, Workshop, Guard Tower) requires Ariminium Camp ≥ 1.
  - **Rome** (Rome Mansion, Tavern, Bath House) requires Rome Mansion ≥ 1.
- **Gem-upgrade gates:**
  - Temple: *Temple of Pluto*.
  - Aqueduct and Bath House: *Aqueduct*.
  - Workshop: *Tinkerers Workshop*.
  - Blacksmith L2: *Master Smith*. L3: *Supreme Armory* (`LegendarySmith`).
  - Library: *Athenian Artifacts* (`CorinthianHelmet`).
  - Rome Mansion story: *All roads lead to Rome*.
- **Ascension surcharge** on denarii cost (`i`). Venus adds the first amount, Juno adds the second, and the surcharge doubles or multiplies at higher levels where shown.

| Building | Venus | Juno | Multiplier by level |
|---|---|---|---|
| Residence | +50 | +100 | i, 2i, 4i, 10i |
| Blacksmith | +50 | +100 | i, 2i, 4i |
| Wall, Mine, Medicus, Tavern, Bath House, Training Field | +50 | +50 | i, 2i, 4i as applicable |
| Shrine, Workshop | +500 | +1000 | – |
| Guard Tower | +500 | +500 | – |

Aqueduct, Ariminium Camp, Rome Mansion, Temple, Stables and Library get no surcharge.

### 8.2 Build costs and requirements

Each level entry gives denarii / slaves / gladiators / influence / residence ≥, before any ascension surcharge.

| Building | Lv1 | Lv2 | Lv3 | Lv4 |
|---|---|---|---|---|
| Residence | 300 / 4 / 0 / 25 / – | 800 / 12 / 0 / 50 / – | 2000 / 20 / 0 / 100 / – | 5000 / 30 / 0 / 250 / – |
| Training Field | 100 / 2 / 1 / 10 / 0 | 500 / 5 / 4 / 50 / 1 | 750 / 10 / 5 / 200 / 2 | – |
| Mine | 250 / 3 / 0 / 5 / 0 | 500 / 16 / 0 / 50 / 2 | – | – |
| Blacksmith | 400 / 12 / 0 / 10 / 1 | 800 / 20 / 0 / 80 / 2 | 1000 / 25 / 0 / 160 / 3 | – |
| Medicus | 300 / 6 / 1 / 20 / 1 | 500 / 15 / 1 / 100 / 3 | – | – |
| Wall | 200 / 5 / 1 / 0 / 1 | 1000 / 10 / 1 / 150 / 2 | – | – |
| Stables | 500 / 5 / 0 / 120 / 2 | – | – | – |
| Temple (of Pluto) | 600 / 15 / 0 / 50 / 2 | – | – | – |
| Library | 400 / 5 / 0 / 50 / 3 (offered only once Residence is at max level 4) | – | – | – |
| Ariminium Camp | Lv1 via event only (1000 denarii, see §8.5) | 500 / 30 / 2 / 300 / 2 | 2000 / 50 / 5 / 500 / 3 | – |
| Shrine | 600 / 10 / 0 / 50 / 2 | – | – | – |
| Workshop | 2000 / 10 / 0 / 300 / 3 | – | – | – |
| Guard Tower | 1000 / 15 / 3 / 200 / 2 | – | – | – |
| Aqueduct | 5000 / 60 / 0 / 500 / 3 | – | – | – |
| Rome Mansion | Lv1 via story only | 500 / 20 / 1 / 400 / 2 | – | – |
| Tavern | 750 / 20 / 1 / 1000 / 1 | – | – | – |
| Bath House | 500 / 15 / 1 / 500 / 1 | – | – | – |

The internal requirement tables also hold an Ariminium L1 entry (1000 / 10 slaves / 50 influence) and a Rome Mansion L1 entry (300 / 15 slaves / 200 influence). The UI only allows building in a location once its level-1 building exists, so these entries are reachable only through the event or story.

### 8.3 Benefits per level

Totals are summed from the listed buildings. **"Den"** is weekly denarii, **"Beds"** is slave accommodations, **"Fac"** is gladiator training facilities (base 3), **"Train%"** is training XP bonus and **"Sec"** is security.

| Building / level | Influence/wk | Den/wk | Beds | Fac | Train% | Sec | Other |
|---|---|---|---|---|---|---|---|
| Residence L0 (start) | 0 | 0 | 15 | 0 | 0 | 0 | – |
| Residence L1 | 2 | 25 | 40 | 0 | 0 | 1 | – |
| Residence L2 | 3 | 50 | 60 | 0 | 0 | 2 | **Spies unlocked** |
| Residence L3 | 5 | 100 | 150 | 0 | 0 | 4 | Spies |
| Residence L4 | 8 | 150 | 300 | 0 | 0 | 10 | Spies; Library option |
| Training Field L1 / L2 / L3 | 0 / 1 / 2 | 0 | 0 | 3 / 10 / 20 | 25 / 50 / 75 | 0 | – |
| Mine L0 / L1 / L2 | 0 / 0 / 1 | 0 / 0 / 5 | 0 | 0 | 0 | 0 / 0 / 1 | Mining efficiency **10 / 12 / 15** per miner |
| Blacksmith L1 / L2 / L3 | 0 / 1 / 2 | 0 | 5 / 10 / 15 | 0 | 0 | 1 / 1 / 1 | Forge/reforge tier Regular / Quality / MC |
| Medicus L1 / L2 | 1 / 2 | 0 | 0 / (5 listed but not counted) | 0 | 10 / 10 | 0 / 1 | Surgeries per week = level. −level to training injury risk. Opium costs 10 instead of 25. |
| Wall L1 / L2 | 1 / 2 | 0 | 0 | 0 | 0 | 2 / 5 | Each level −20 to enemy raid chance |
| Stables L1 | 1 | 0 | 0 | 0 | 10 | 0 | Buy mounts in the market |
| Temple of Pluto | 2 | 10 | 25 | 0 | 0 | 0 | **Pluto's favour**: every combatant +1 favour and +1 max HP (Egyptians +2/+2) |
| Shrine (Pantheon/Janus) | 3 | 5 | 0 | 0 | 0 | 0 | Required for the Ascension tournament; counts toward the Ascension objective; Neptune-flood sacrifice option |
| Library | 1 | 0 | 1 | 0 | 5 | 0 | More Tome of Traits merchants (25% vs 15%), library events |
| Ariminium Camp L1 / L2 / L3 | 0 / 1 / 1 | 0 / 0 / 10 | 0 / 5 / 20 | 0 | 0 | 0 / 0 / 1 | Unlocks Ariminum construction |
| Workshop | 1 | 0 | 10 | 0 | 0 | 0 | Crafting items and Rete |
| Guard Tower | 1 | 0 | 5 | 0 | 0 | 10 | +1 "committed spy" |
| Aqueduct | **30** | **100** | 0 | 0 | 0 | −2 | Drought immunity |
| Rome Mansion L1 / L2 | 5 / 10 | −10 / −20 | 10 / 20 | 1 / 2 | 0 | 2 / 3 | Re-roll influence perks; mansion events |
| Tavern | 10 | 100 | 20 | 0 | 0 | 2 | +3 loyalty to all gladiators (entertainment effect); tavern events |
| Bath House | (5) | (50) | (5) | 0 | 0 | 0 | Most famous gladiator gets **+10 max HP** in battle |

The parenthesised Bath House values are defined but are **never added to any total**, so they are not applied (likely bug). Medicus beds are likewise excluded from the bed total. The influence, denarii, beds, facilities, training and security totals each sum a specific list of buildings; the Bath House is in none of them.

`ConstructionPositioning` only places sprites on the estate map (fractional x, y, w, h per level). It has no gameplay effect.

### 8.4 Building destruction

- `loseRandomBuilding()` rolls rand(8) and cascades down the list until it finds a built one: Stables → Temple → Medicus → Blacksmith → Mine → Walls → Training Field → Residence. It removes 1 level.
- Triggers include:
  - Pyromaniac gladiators: 1/60 per week, or 1/20 if also Psychopath.
  - Sabotage intrigue.
  - Raid victories against a crippled house.
  - Flooding events.
  - Mine collapse decisions.
- Walls are also lost to successful raids and some events.

### 8.5 Getting the off-site buildings

- **Ariminium Camp L1** comes from the "Sacred ruins / holy shrine rumours" event.
  - Conditions: camp 0, denarii > 1000, influence > 200, slaves > 10, committed spies > 1, and (senator influence, The Organizer or Bacchus Patron).
  - Cost: **1000 denarii and 1 slave**.
- **Rome Mansion L1** comes from the "Mansion for sale" story.
  - Conditions: *All roads lead to Rome* upgrade, week > 6, denarii > 500, most famous gladiator fame > 200, a rival with opinion > 15, 50% roll.
  - You lend your most famous gladiator to the rival. You then either pay 500 denarii or accept **−25 denarii/week permanently**.
  - The gladiator later returns with +15 loyalty. If it dies on loan, it returns and you get +100.

---

## 9. Slaves and worker roles

### 9.1 Slave market

| Setting | Values |
|---|---|
| Start of game | 5 slaves available at 100 each |
| Weekly refresh: count | rand(3)+2 = **2–4** slaves |
| Weekly refresh: price | 80 + 20×rand(3) = **80, 100 or 120** |
| Jupiter ascension | −1 slave, +10 price |
| Gaia ascension | 50%: +10 price, and then 50%: −1 slave |
| Egyptian heritage | 50%: +1 slave |
| Nightmare mode | +20 price after week 20, +20 more after week 40 |
| Each purchase | 50%: +20 price; Hard mode another 50%: +10; Nightmare another 50%: +10 |

Purchased slaves start unassigned. Any still unassigned at week end go to Security.

### 9.2 Upkeep and housing

- Slaves within accommodations cost **2 denarii/week each**.
- Each slave over the bed total costs **4/week**, or **6/week** if you own more than 1000 slaves.
- Starting beds: 15 (Residence L0).

### 9.3 Roles and exact effects

**Mining.**
- Income = miners × max(4, mineEfficiency + miningBonus).
- mineEfficiency is 10 / 12 / 15 at Mine level 0 / 1 / 2. Miners can be assigned even before a mine is built (efficiency 10).
- `miningBonus` is a permanent integer investment counter. The stored value is clamped at −9, and the per-miner yield floor is 4.
- Changes:
  - Punic heritage: +1.
  - Mineral vein event: +1 for 100 denarii (the alternative is selling the rights for +200).
  - Investor event: −1 (with +400 denarii).
  - Fool's gold: −1.
  - Political sponsor: −2.
  - Bankruptcy steps: −1.
  - AI "invest": 400 for +1.
- Events: mine collapse (rescue 50×miners − 50, halved above 200 and capped at 300; otherwise lose 1–5 miners); young mining slaves (+3 miners).

**Entertainment.** Let E = entertainment slaves + entertainment bonus.
- Weekly influence = E if E ≤ 10, E/2 + 8 if 10 < E ≤ 100, E/4 + 48 if E > 100. Buildings add their influence, and senators add +5.
- Weekly loyalty modifier (all gladiators):

| E | Loyalty modifier |
|---|---|
| 0 | −2 |
| 1–4 | E − 1 |
| 5–19 | E/2 + 2 |
| ≥ 20 | E/3 + 6 |
| Tavern built | +3 more |

- Loaded Dice add +1 denarius per entertainment slave.
- Entertainment slaves also reduce persuasion intrigue against you by 0.75 per slave (together with security).

**Security.**
- Security total = security slaves − security penalties + building security (Residence, Walls, Guard Tower and others). It cannot go below 0.
- Penalties: Public Sessions +1; Consul −2.
- Weekly loyalty modifier uses raw security slaves S:

| S | Loyalty modifier |
|---|---|
| ≤ 10 | S/5 |
| 11–50 | S/10 + 1 |
| > 50 | S/15 + 2 |

- **Escapes and uprisings** (`Betrayal`) use a diminishing-returns value D of the security total T:

| T | D |
|---|---|
| < 5 | T |
| < 10 | T/2 + 3 |
| < 30 | T/3 + 5 |
| < 50 | T/4 + 8 |
| < 100 | T/6 + 15 |
| ≥ 100 | T/10 + 25 |

  - Cunning escape succeeds if 4D + 5 < cunning + bonus + level + rand(15) + unhappy, where unhappy = slaves/10, or all slaves when gladiators are unpaid.
  - Brute force succeeds if physical + bonus + unhappy + 10×escapees > 10D + rand(15).
  - Each attempt can kill up to rand(D)/k security slaves.
  - Noob protection: the player's first solo escape gets −10 bonus, and later ones −3 outside Hard mode.
- **Intrigue against you** (raid, steal, poison, sabotage, assassinate) subtracts a second diminishing-returns value of T:

| T | Value |
|---|---|
| < 4 | T |
| < 12 | T/2 + 4 + T/4 |
| < 24 | T/2 + 8 |
| < 40 | T/3 + 12 |
| < 65 | T/4 + 16 |
| < 100 | T/6 + 24 |
| ≥ 100 | T/10 + 38 |

  - There are also flat tiers (T<1: 0; <10: 5; <20: 10; <100: 15; else 20) in raid and sabotage.
  - Walls subtract 20 per level from raid chance.

**Spies** (need Residence level ≥ 2).
- "Committed spies" = spies assigned at the start of last week, +1 with a Guard Tower.
- Intrigue success bonus = clamp(2 × own committed − target committed, −15, +15).
- Discovery roll: rand(100) + base + (2 × target spies − actor spies, slightly diminished above 30) > 99. Princeps Senatus adds +10, Consul +5, the Informants opportunity +15.
- **Market quality:** the goods market is generated with effective week = week + 2×spies for weapons, or week + spies for equipment, mounts, beasts and items. Raw current spies are used here, not committed ones.
- **Market intel** on gladiators requires committed spies:

| Committed spies | Revealed |
|---|---|
| ≥ 1 | Age, origin |
| ≥ 2 | Strength |
| ≥ 3 | Initiative |
| ≥ 5 | Cunning |
| ≥ 7 | HP |
| ≥ 8 | Traits, one per spy above 7 |

- Spies also unlock story and event branches (Tomb of the Pharaoh roll rand(30)+spies, Spartacus spy reports, league arrival warnings).

### 9.4 Slave gains, losses and sales

- **Losing a slave** removes unassigned slaves first, then Entertainment → Mines → Security → Spies. A typed loss targets a specific pool.
- If you have **0 slaves** when a loss occurs, you pay **100 denarii** instead.
- **Sale paths:**
  - Bankruptcy auto-sale: +50 per slave.
  - Senator buys a slave: +200 for one slave.
  - Converting a gladiator to a slave: removes the gladiator, +1 slave.
- **Loss events:**
  - Abduction: lose min(8, week/5) slaves, or pay 50 per slave, or send your champion on a rescue adventure.
  - Tax collector: lose (tax/100) slaves and −5 influence.
  - Drought: pillage or hope options.
  - Party apology and underworld attacks.
  - Werewolves: a Lycanthropy gladiator or a Moonstone carrier kills a slave at 25% on week % 4 == 0.
  - Raids and intrigue.
  - Spartacus murders.
- **Promotion:** when a battle needs a fighter and none is available, a slave is promoted to a gladiator with Str 3–8, Cun 2–11, HP 15–30, Ini 2–8.

### 9.5 Gladiator upkeep ("training costs")

- Per gladiator: **5/week** within training facilities (base 3 + Training Field 3/10/20 + Rome Mansion 1/2); **10/week** beyond.
- Level surcharge: level > 2 adds (L−2)×3 (kids pay L−2). Level > 6 adds a further (L−6)×5.
  - Example: L5 = +9, L8 = +28, L10 = +44, L15 = +84.
- Gladiators beyond facility capacity also lose the building training-XP bonus that week.

### 9.6 Gear-happiness (equipment and loyalty link)

- Each week the % change of total assigned gear worth vs last week (clamped ±100, damped for low totals) is converted to happiness steps and accumulated.
- Happiness then drifts 1/week toward a target:
  - −2 if fame ≥ 30 and gear worth ≤ 999.
  - −1 if fame ≥ 10 and gear worth ≤ 9999.
  - 0 otherwise.
- Famous gladiators therefore demand expensive gear.

---

## 10. Weekly finances

### 10.1 Formulas (Dominus.income / expenses)

**income** =
- miningIncome
- \+ max(0, projectedDenarii)
- \+ (Loaded Dice ? entertainment slaves : 0)
- \+ max(0, influenceProjected)
- \+ 50 if elected Senator
- \+ Σ building denarii

**expenses** =
- −slaveUpkeep
- −gladiatorUpkeep
- \+ min(0, projectedDenarii)
- \+ min(0, influenceProjected)

The weekly order is: influence gain, then income, then expenses, then the debt check.

**Recurring modifiers** (permanent, applied through projected denarii unless stated)

| Source | Weekly change |
|---|---|
| Training regimes (Bestiarii / Spartan / Weapons) | −25 / −35 / −50 |
| Loan (influence opportunity, Trickster tree) | Toggle on: +500 once, −25/week until repaid. Toggling off repays 500 and needs ≥ 500 on hand. |
| Public Training Sessions (opportunity) | +income weekly (formula below), recalculated each week; +1 security penalty; −2 training effectiveness while active. |
| Bribe General | −5/week. Offers "promising gladiators" (Crixus, Barca, Hermes, Maximus or an epic) at their price. |
| Every 12 weeks (inflation) | −1 for the player and all rivals |
| Investor event | −5 |
| Political sponsor | −5 |
| Mansion deal | −25 |
| Court Battle outcome | +50 |
| Plague preparations | +150 (as coded) |
| Saturn ascension | −5 |
| Pluto ascension | −1 |
| Jupiter ascension | −1 |
| Debt penalties | see 10.2 |

**Public Sessions income** =
- 5 × arena champions
- \+ (Infl/5) × min(5, gladiators + beasts), where Infl = influence/10 (or influence/100 + 180 if influence/10 > 200)
- \+ fame term (total fame/10, compressed above 500)
- \+ 2 × (gladiators + 2 × beasts)

AI rivals receive this amount **every week for free**.

**Other inflows**

| Source | Amount |
|---|---|
| Public Funding law (passed by senate vote) | +500 to every house every 4th week |
| Senator | +50 denarii and +5 influence per week; +1 influence every 5 weeks; +10% on influence gains |
| Burying a dead gladiator or beast | +50 |
| Selling gear | worth/2 |
| Selling a gladiator or beast to the market | worth × 3, capped at **700** |

**Influence gain multipliers** (on positive gains): Roman heritage +20%, Power Begets Power +25%, Bacchus Patron +15%, Senator +10%. Influence is floored at 0.

### 10.2 Debt and bankruptcy (applied after income and expenses)

If denarii < 0 after the week:
1. −1 influence.
2. Then one of:
   - Debt > −6: projected −1 permanently, +5 emergency cash.
   - Debt −6 to −10: projected −3 permanently, +10.
   - Worse: projected −2 permanently, refund of half of (gladiator + slave upkeep) ("cut living expenses"), **all gladiators −10 loyalty** (unpaid), −5 influence, and then either consume 1 mining bonus for +20 or take projected −3 for +10.
3. If below −200: another −2 influence and projected −2.
4. If still negative: −2 influence and projected −5.
   - If you were already bankrupt last week: with 0 slaves you are **defeated** (Debt Pile-Up; all gladiators go rogue). Otherwise projected becomes −15 from its prior value, −1 mining bonus, one slave is sold (+50), and you are defeated if still negative.
   - The bankrupt flag is set.

Denarii below −100000 are reset to 0 (overflow guard).

### 10.3 Tournament money

| Item | Amount |
|---|---|
| Winning reward | entranceFee × contestants / 2, −100 if that exceeds 500, +25 per knockout round. entranceFee defaults to 50 and is a **prize basis, not a charge**: no code deducts an entry fee. |
| Prestige | contestants + teams (+2 per knockout round) |
| Nightmare | Player's prize −50 if > 150, or −25 if > 100 |
| Non-winning houses | round reached × 25 if they reached round > 1 |
| League points | 4 / 2 / 1 for finalist tiers, ×2 in a League tournament |
| Organising a tournament | Costs **300**. The organiser gets 100 + 5 prestige, rising with spectators (>1k: 200/10; >5k +200/+5; >10k +200/+5; >20k +200/+5; >50k +200/+5; >100k +400/+5). Nightmare −25 if > 100. |
| League end prizes | 1st: total/2 + 1st item + champion trait; 2nd: total/3 + item; 3rd: total/6 + item |

**League totals and items**

| League | Total | 1st / 2nd / 3rd item |
|---|---|---|
| Lunar (weeks 0–13) | 700 | Lunar Gladius Quality / Regular / Old |
| Solar | 1000 | Solar Xiphos MC / Quality / Quality |
| Bacchus | 1500 | Thyrsus / MC Hasta / MC Hasta |
| Jupiter | 2000 | Ancile / MC Wooden Shield / MC Wooden Shield |
| Vulcan | 3000 | Vulcan Cuirass Quality / Regular / Old |
| Annum (after week 100) | 2000 | Bloody weapon MC / Quality / Regular |

### 10.4 Miscellaneous player costs

| Action | Cost |
|---|---|
| Rename a gladiator or beast | 25 |
| Adopt | 25 (plus an Old Aquarius Helmet with the upgrade) |
| Reward a gladiator | 50 × (level/2 + 1) |
| Opium | (Medicus ? 10 : 25) × (level/4 + 1) |
| Surgery | 100 (Medicus needed; refund 50 if the patient dies; limited to Medicus level per week) |
| Beast treat | 10 |
| Expedition | Funds start at 500 (or all your money if less), +100 per click with larger steps when rich. Up to 10 slaves (or half your slaves if < 10). A win recovers half the rebels' plundered gold, captured slaves and possibly a rogue weapon such as Libertas. |

---

## 11. Markets

### 11.1 Weekly regeneration

Every week, `World.AppendWeek` **replaces** the gladiator, beast, weapon, equipment, mount and item market lists. Last week's unsold stock becomes the "old" lists, which AI rivals can buy during their turn at 75% price.

The effective generation week is boosted as follows:

| Market list | Effective week |
|---|---|
| Weapons | week + 2×spies (+25 with Market Connections) |
| Equipment, mounts, beasts, items | week + spies (+25 with Market Connections) |

The extra-slot count `i2` is the number of online players plus one per Market Connections holder.

### 11.2 Goods generation (Seed.GenerateMarket*), with w = effective week

**Weapons** (typically 4–9 entries)
- **Two basic blades.** Each is a Spatha, Gladius or Pugio (Pugio has a 50% or 25% chance to become a Parazonium).
  - Blade 1 roll r = rand(w+10): Shoddy if r < 6, Regular if r > 15, else Old.
  - Blade 2 roll r3 = rand(20)+w: Shoddy if < 15, Regular if > 25, else Old.
- **Bonus quality blade:** if 30 < r < 50, a Quality blade; if r > 50, a MasterCrafted Spatha, Gladius or Pugio.
- **Spear:** rand(100) + w/2 > 20 gives a Hasta (10% Dory). Quality: < 50 Shoddy, ≤ 95 Old, ≤ 120 Regular, ≤ 160 Quality, else MC.
- **Cestus** (frequent):
  - r2 = rand(w/10 + 100) ≥ 95: 95–96 Old, 97–99 Regular, 100–102 Shoddy, > 102 Quality.
  - Separately, if 40 < r2 < 95, a second Cestus by r2 % 3: Shoddy, Old or Regular (Quality at r2 = 50).
- **Wooden Bow:** 28% after week 1. Shoddy/Old before week 10, Regular/Old after.
- **Fuscina:** rand(100) + small week boosts > 86. 87–92 Shoddy, 93–96 Old, > 96 Regular.
- **Sica:** rand(90) + w/3 (+10 or +30 when the list is short) > 60. ≤ 80 Shoddy, ≤ 100 Old, ≤ 130 Regular, > 130 Quality, > 170 and 40% MC.
- **Axe (Securis, or Bipennis 33%):** 40% (or when the list is short). v = rand(10) + w/20: ≤ 7 Shoddy, ≤ 9 Old, ≤ 12 Regular, > 12 Quality, > 15 and 50% MC.
- **Khopesh:** 22%+. v = r + w/15 + rand(5): ≤ 7 Shoddy, ≤ 10 Old, ≤ 16 Regular, > 16 Quality, > 21 and 50% MC.
- **Falcata, Whip and Pilum:** each about 17–50%. v = r + w/25 + rand(15): ≤ 9 Shoddy, ≤ 14 Old, ≤ 18 Regular, > 18 Quality, > 24 and 50% MC.
- **Palm Axe:** rand(20) (+5 Egyptian heritage) > 15. Quality by roll + w/10: > 25 Quality, > 20 Regular, > 17 Old, else Shoddy.
- **Extra Shoddy–Regular basics** for `i2` slots.

**Equipment** (h = w/2)

| Piece | Spawn condition | Quality thresholds |
|---|---|---|
| Wooden Shield | rand(h+15) > h+4 | < 10 Shoddy, < 20 Old, < 25 Regular, < 50 Quality, else MC |
| Rete | rand(h+15) > h+5 | < 10 Shoddy, < 30 Old, < 40 Regular, < 70 Quality, else MC |
| Centurion Scutum | rand(w/4+100) > 98 | > 120 Regular, else Old |
| Legionary Scutum | rand(h+15) > h + w/4 + 7 | Quality 10%, Old 30%, Shoddy 60% |
| Hoplon (first roll) | 25% | Shoddy, Old or Regular |
| Hoplon (second roll) | rand(5) > 3 or list < 5 | Shoddy–MC |
| Cloak (w > 5) | rand(100) + rand(2w) + 5·i2 > 75 | > 90 Old, > 120 Regular, > 150 Quality, > 180 MC |
| Leather Armor (w > 5) | rand(150) + … > 110 | > 140 Old, > 170 Regular, > 210 Quality, > 260 MC |
| Cuirass (w > 5) | rand(200) + … > 190 | > 220 Regular, > 300 Quality, > 350 MC |
| Galerus | rand(90) + rand(2w) + 5·i2 > 70 | > 85 Old, > 100 Regular, > 140 Quality, > 180 MC |
| Linthorax | 50%, or list < 3 | Thresholds as Galerus, on n + rand(3w) |
| Segmentata or Galeo (50/50) | rand(85) + rand(2w) + 5·i2 > 80 | > 95 Old, > 110 Regular, > 170 Quality, > 220 MC |
| Bronze Helmet | rand(90) + rand(2w) > 50 | > 75 Old, > 80 Regular, > 120 Quality, > 160 MC |
| Hood | rand(50) + rand(2w) > 20 | > 35 Old, > 50 Regular, > 100 Quality, > 140 MC |
| Gallic Helmet | Hood roll > 50 | MC if Hood roll > 120, otherwise its own roll |
| Caetra | Frequent | Falcata thresholds |
| Carthaginian Helmet | Frequent | v = r + w/6 + rand(12): ≤ 12 Shoddy, ≤ 16 Old, ≤ 22 Regular, > 22 Quality, > 26 and 50% MC |
| Cataphract Armor | rand(100) + w > 100 | ≤ 105 Shoddy, ≤ 112 Old, ≤ 122 Regular, > 122 Quality, > 126 and 50% MC |

The equipment list **always** contains one extra Old Cataphract Armor (unconditional in code). It can only be bought with the *Cataphracts* upgrade.

**Mounts** (only shown with Stables)
- Numidian if rand(w/2 + 120) + 5·i2 > 40.
- Celtic if a second roll > 60 (−10 if the roll is even).
- Quality: < 100 Old, < 150 Regular, else Quality.

**Items**

| Item | Chance / condition | Quality |
|---|---|---|
| Bandages | 20%, plus 40% after week 15 | Regular |
| Caltrops (or amulet) | Roll ≤ 90 (≤ 85 with Market Connections) gives Caltrops if rand(100) + w/10 + 5·i2 > 75; otherwise a Jupiter Amulet (> 95) or Neptune Amulet | Caltrops: > 90 Regular, > 100 Quality, > 120 MC, else Old |
| Tome of Traits | (1 + i2)% | Regular |
| Silphium Extract | (1 + i2)% | Regular |
| Greaves | rand(100) + w/10 + 2·i2 > 50 | > 65 Old, > 90 Regular, > 99 Quality, > 110 MC |
| Antidote | 10% | Regular |
| Bottled Lightning | 30% | Regular |
| Moonstone | 0.2% | Regular |
| Mandrake | rand(w/4 + 500) > 498 | > 505 Old, > 520 Regular |

### 11.3 Gladiator market

**Week 1** offers the three legends, plus the wolf "Aello" (Str 8, Cun 3, Ini 20, HP 20, Sharpened Claws, price 100):

| Gladiator | Str / Cun / Ini / HP | Trait | Fixed price |
|---|---|---|---|
| Tetraites | 8 / 5 / 5 / 30 | Agile | 350 |
| Carpophorus | 7 / 8 / 5 / 30 | Beast Tamer | 400 |
| Flamma | 7 / 6 / 5 / 30 | Glory Seeker | 300 |

The fixed market prices apply while week < 5.

**Later weeks** (`GenerateMarketGladiators`)
- **Count:** 0–1 normal RandomGladiators plus 1–2 cheap ones.
- **Epic gladiator** in weeks where w > 5 and w % 5 equals the per-world `marketSeed` (0–4).
- **Online or extra slots:** another epic with probability i3/3, and another random one with probability i3/6.
- **Level:** first the week is compressed. If w > 10, w = max(10, w/2). If w > 50, w = max(40, w/8). Then level = max(rand(w)/3 + 1, 2). Cheap gladiators get half that level.

| Kind | Str | Cun | Ini | HP | Age |
|---|---|---|---|---|---|
| Random | 4–7 | 4–7 | 4–7 | 25 or 30 | (16 + ageBonus) years |
| Cheap | 4–6 | 4–6 | 4–6 | 25 | (17 + ageBonus) years |
| Epic | 6–9 | 6–9 | 6–9 | 30 | (13 or 12 + ageBonus) years |

- All three kinds then gain stats for their level, 1 random trait, and a 10% rare learnable technique.
- Epic gladiators always get a rare learnable technique, and have a 20% chance of an extra trait (1/500 of which is Lycanthropy).
- ageBonus = rand(10) + level/2 with later adjustments, capped around 75.
- **Origin** is uniformly random among Gaul, Roman, Greek, Iberian, Punic, Thracian, Briton, Egyptian and Parthian.

**Market price** (`getPrice(true, week)`)

    price = 10×(Str+Cun+Ini) + MaxHP + traitTerm + 20×(level−1) + 10

- traitTerm = +50 with 1 trait, +60 with 2, +160 with 3, +260 with 4+.
- Origin level 2 adds 10 × progressionWorth + 500.
- Legendary fixed prices: Theokoles 800, Spartacus 350, Crixus 250, Maximus 300 (used only in AI/offer contexts). Flamma, Tetraites and Carpophorus keep 300/350/400 until week 5.
- Custom (editor) gladiators: 50×level (×2 above level 4) + 50×traits + 100.
- Tapping the salesman 15+ times gives a 10-denarius discount (easter egg).

**Worth and selling**
- Gladiator worth = (10×level + fame/4) + 5×traits + 10. Crippled, Bum Leg or Blind subtract 25. Origin level 2 adds 5 × progressionWorth + 500.
- **Selling to the market pays worth × 3, capped at 700.** The gladiator then reappears in the market at its full price.

**Market beasts** (fixed stats and prices)

| Beast | Str / Cun / Ini / HP | Price | Notes |
|---|---|---|---|
| Wolf | 8 / 3 / 20 / 20 | 100 | |
| Dire Wolf | 13 / 4 / 18 / 30 | 200 | Alpha; replaces the wolf after week 40 |
| Lion | 12 / 4 / 17 / 25 | 250 | Bonus HP 50%, more stats after week 50 |
| Bear | 15 / 3 / 12 / 38 | 350 | |
| Crocodile | 13 / 4 / 4 / 50 | 350 | |
| Rhino | 24–28 / 1–2 / 4–8 / 50–55 | 500 | Needs the *Rhinoceros* upgrade to buy |
| Elephant | 16–19 / 5–8 / 2–5 / 80–100 | 700 | Week > 15 on even weeks, 50%. Needs *War Elephants* to buy. |

After purchase, a beast's stored price becomes worth × 3 + 10. Beast worth = T/2 + T/5 + 4 × (traits + 2×techniques + 5 if Mythical) + fame/5, where T = Ini + Str + Cun + HP/4.

### 11.4 Trading with rivals

**Player buying from a rival** (OfferActivity; one offer per rival per week)
- The default offer is worth + 50 for an item, or 100×level + 250 + 10×fame for a combatant.
- **Rival's valuation of a combatant ("stat worth")**:

      statWorth = 15×(Str+Cun+Ini) + 3×MaxHP + 30×level + 2×fame

  - Injured: half + half/(weeks left + 1).
  - Age < 17: +20%. Age > 30: −20%, then a further −25% above 36 and another −25% above 45.
- Preference modifier: if the rival's favourite-minus-hated score n ≠ 0, worth × max(3n + 10, 1)/10. Spartacus adds +5 to the multiplier, Theokoles +3, Sagittarius +4.
- **Poverty discount:** rivals with < 100 denarii value things at 75%, and at 50% if broke.
- "Wanted" = discounted worth + 10.
- **Multiplier d for gladiators and beasts** = 1.0 + (60 − opinion)/100, plus:
  - Minerva ascension: base 1.25.
  - Juno ascension: +0.10.
  - Hyperion ascension: +0.05.
- **Acceptance rule (gladiators):**
  - The rival adds +1/3 if the gladiator is its best fighter.
  - It refuses outright if it owns ≤ 2 gladiators and your offer ≤ 2× the wanted price.
  - It accepts if offer ≥ wanted × d. Otherwise it counters with wanted + rand(wanted/2) + 10%.
- **Beasts:** −20% if the rival is broke. It refuses to sell its only beast unless broke or the offer is > 2× wanted.
- **Items** (rival's want):
  - Worth × d', where d' = 1.0 base, 1.25 + 0.1 at Vulcan ascension, +0.1 at Hyperion. The opinion term uses **integer division** `(60 − opinion)/100`, so it is effectively always 0 (bug).
  - +50% if the rival has < 2 of that category, +50% if it is its best piece. Weapons: +25% if < 4 weapons, +25% more if < 2, +50% if best.
  - Legendary +1000. −25% if the rival has < 200 denarii, a further −25% if < 0.
- **On a successful purchase** of a gladiator: +20 loyalty if its loyalty < 75, plus rebellion grace.

**Rivals buying from the player** (TransferMessage; valid for the current week only)
- They bid for your gladiators of their favourite type, or any you flagged "Offer to rivals". For flagged gladiators the base is DetermineGladiatorWorth − worth/3.
- The bid is adjusted by personality:

| Personality | Bid adjustment | Spending buffer |
|---|---|---|
| Greedy | −20% | 400 |
| Spender | +1/6 | 150 |
| Crazy | 50–162% | 100 |
| Balanced | ±0 | 200 |

- Accepting adds +3 opinion. The gladiator gets +20 loyalty if < 50.
- Bankrupt rivals offer you gladiators at their wanted price.
- Unclaimed "offered" gladiators (Rudis returns, General Gallaecus) are bought by rivals with < 6 gladiators at the end of the week.
- A **Rudis (freed) gladiator** may return (4%/week): price = price + 200 + 50×level.

**AI economy, summarised**
- Each week rivals earn the Public Sessions income formula.
- They reforge gear, buy last week's leftovers at 75%, and buy slaves at 100 (up to 3 per week).
- They invest 400 for +1 mining bonus when they have > 1600 (10%), and de-invest (+200) when < 50.
- They take a one-time loan of +500 (−1 mining bonus, −5/week) when broke.
- They sell excess gear at 75% and sell gladiators to each other.
- They organise tournaments when they have > 300 denarii.
- The "Unknown" default house is reset to 200 denarii every week.

### 11.5 Auctions

The auction is a decision choice and needs ≥ 100 denarii to attend.
- **Lot:** Shield of Leonidas, Hannibal's Helmet, or a random **MasterCrafted Blessed** piece (Centurion/Legionary/Wooden shield, Cuirass, Bronze/Carthaginian/Gallic helmet, Galerus or Leather Armor).
- **Bidding:**
  - Opening bid is 200. Your raise is +100, or +200 once the bid is above 500.
  - After each raise, a random visible rival with denarii > 3× the bid (and worth×2 > bid, or a 50% roll) counters at ×1.5.
  - Otherwise a Greek collector bids rand(25)×100 if that is higher.
  - If nobody counters, you win at your bid.
- "This is madness" quits. The rival bidder, if any, gets the lot.

### 11.6 Traveling merchant (needs the *Traveling Merchant* upgrade; needs ≥ 100 denarii)

The merchant shows 3 random offers from this pool:

| Offer | Price |
|---|---|
| Tome of Traits | 300 (15% chance; 25% with a Library) |
| Lucky Ring | 150 |
| Sandals (Old) | 100 |
| Centurion Scutum | 200 |
| Xiphos | 100 |
| Dory | 100 |
| One of: Moonstone 200, Mandrake 200, Helm of the Woven Path 150, or Fuscina 150 (+ maybe Hoplon 150 / Parazonium 100) | as listed |
| Khopesh | 150 |

Weapon and armor quality = rand(3 + k), where k = 0 early, 1 after week 10 (or 50%), and 2 after week 20. Results 0–4 map to Shoddy–MC.

Other merchant-like events:
- Captive smith: forges a weapon of your champion's best type, Regular (Quality after week 55, MC after week 75).
- Family heirloom: a free Tome, a free amulet, or +250.
- Library books: Tome 300/500, or resell the books for +100.

---

## 12. Starting state (NewGame + Seed)

| Item | Normal | Hard |
|---|---|---|
| Denarii | 1000 | 800 |
| Slaves | 2 (1 security, 1 entertainment) | 1 (security) |
| Items | 1 Bandages | – |
| Buildings | Residence level 0 (15 beds), 3 training facilities | same |
| Weapons | none (the arena provides a Shoddy Pugio) | same |

Heritage bonuses:

| Heritage | Bonus |
|---|---|
| Roman | Shoddy Galerus; +20% influence gains |
| Punic | +1 mining bonus, +100 denarii, Old Carthaginian Helmet |
| Celtic | Old Gallic Helmet, +2 training effectiveness |
| Greek | Old Hoplon; doubles the weekly random trait-gain roll factor |
| Egyptian | Shoddy Linthorax; +1 market slave at 50%; +5 Palm Axe roll; periodic rival opinion gains |

Sandbox mode adds +5000 denarii and +200 influence.

Rival starting cash (normal / hard / nightmare): Batiatus 600 / 1200 / 1600, Decimus 400 / 750 / 1000, Solonius 1700 / 2800, Magnus 750 / 1500 / 2000, Vettius 1000 / 2000 / 2500. New schools may open every 6 weeks when fewer than 4 rivals remain.

---

## 13. Difficulty, ascension and meta-upgrade modifiers that touch the economy

**Hard and Nightmare modes**
- Hard: lower start (800, no extra slave or bandage).
- Both: slave price creep on purchase.
- Nightmare: slave price +20 after week 20 and again after week 40; tournament prize −25/−50; organiser income −25.
- Rivals are buffed (gear, cash and weekly XP in Nightmare).

**Ascension levels (cumulative)**

| Level | Ascension | Economic effects |
|---|---|---|
| 1 | Saturn's Wealth | Every rival +1000, a Regular random weapon, +1 slave; **player −5/week** |
| 2 | Vulcan Smith | Rivals get a Shoddy Segmentata; rival item prices ×1.35 |
| 3 | Sol Prowess | Rival XP; +1 escaped slave; your influence counts ×0.8 for loyalty; senate thresholds ×2 |
| 4 | Neptune Wrath | Flood/drought events; expeditions +1 length |
| 5 | Minerva Wisdom | Rivals +1 slave, +100; gladiator/beast purchase multiplier base 1.25; intrigue −10; higher bribe costs |
| 6 | Venus Love | Rivals +1 spy, −5 opinion; **construction surcharges begin**; loyalty penalty 1/2/3 by week |
| 7 | Hunt of Diana | Rivals gain beasts and caltrops |
| 8 | Pluto Death | Rivals +250; player −1/week; harsher surgery |
| 9 | Jupiter Judgement | Rivals' Spartan training; player training −3; +2 escaped slaves; −1/week; slave market −1 slave and +10 price |
| 10 | Vitality of Juno | Rivals +100; more construction surcharge; gladiator purchase multiplier +0.1; extra loyalty penalty |
| 11 | Violence of Mars | Rivals' training and traits |
| 12 | Apollo Prophecy | Rivals +100, +1 spy |
| 13 | Creation of Gaia | Rivals +50, +5/week, +5 influence; slave market price and count penalties |
| 14 | Height of Hyperion | Rivals +5/week, +5 influence, Old greaves, +1 slave; Vettius +1000; trade multipliers +0.1 (items) and +0.05 (gladiators) |
| 15 | Depths of Tartarus | Rivals +1 slave |
| 16 | Reaping of Cronus | Narrative only (in start effects) |

**Meta upgrades (gems) relevant to items and economy**

| Upgrade | Gems | Prerequisite |
|---|---|---|
| Champion Helmet (Aquarius) | 100 | |
| Traveling Merchant | 100 | |
| Spatha | 100 | |
| Parazonium | 50 | |
| Sica | 100 | |
| Temple of Pluto | 150 | |
| Rhinoceros | 150 | |
| Hoplon | 100 | |
| Master Smith | 150 | |
| Supreme Armory | 150 | Master Smith |
| Leather Armor | 100 | |
| Gallic Helmet | 50 | |
| Segmentata & Galea | 150 | |
| Aqueduct | 150 | Builder achievement |
| Celtic War Horses | 200 | |
| Celtiberian Weaponry | 100 | |
| Carthaginian Artifacts | 150 | |
| Hannibal's Legacy | 150 | Carthaginian Artifacts |
| Legacy of Alexander (Linthorax) | 150 | |
| Athenian Artifacts (Corinthian, Library) | 200 | |
| War Elephants | 250 | |
| Spartan Dynasty (Greaves) | 200 | Hoplon |
| Tinkerers Workshop | 150 | Apprentice achievement |
| Thunder Strike | 100 | Favoured achievement |
| Cataphracts | 100 | |
| All roads lead to Rome (Mansion) | 150 | Builder achievement |
| Ascended Weaponry | 150 | Ascension achievement |

---

## 14. Notable quirks, probable bugs and uncertainties

1. **Bath House benefits** (+5 influence, +50 denarii/week, +5 beds) are never added to any total. Only its +10 HP battle buff for the most famous gladiator works. **Medicus L2 beds** (+5) are also not counted.
2. **Item offer multiplier** uses integer division `(60 − opinion)/100`, so rival opinion does not affect item prices. It does affect gladiator and beast prices, which use floating-point division.
3. **TwoHandedOnly** weapons get the "+10% crit" twice (+20).
4. `name.equals(EquipmentType.GallicHelmet)` in Equipment worth compares a String to an enum, so it is always false. The intended +50 worth for Gallic helmets never applies.
5. The market always adds an Old Cataphract Armor, even to players without the upgrade (shown locked).
6. Hand of Midas "gold scattered" only logs a number. No denarii are credited (as far as the decompilation shows).
7. The Gallic helmet's stun resist text says 20%, but code adds +8 stun resist points.
8. Heirloom bonuses appear only in the UI. A combat application was not found **(uncertain)**.
9. `ForgeFactory.forge`, `ForgeActivity.redraw`, `World.AppendWeek`, `Player.checkObjectives` and the Cataphract set count are partially mis-decompiled. They were interpreted from the surviving structure.
10. The Danaid Dagger and Cyclops' Eye (prophecy) objective rewards map to objective indices 23/24, but the objective switch map is missing from the decompilation. The exact objectives are uncertain.
11. The Tax collector event gives a **refund** to small estates: (400, or 700 with senator influence) − 50 × (construction level), halved early on. Larger estates pay 100 × level − 300, or lose slaves.
12. Losing a slave while owning none costs 100 denarii, a hidden penalty during raids and events.
