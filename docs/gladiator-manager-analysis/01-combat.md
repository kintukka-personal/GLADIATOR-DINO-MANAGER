# 01 — Combat Engine

Source: jadx decompilation of `com.rene.gladiatormanager` (`world/Battle.java`, `world/Combatant.java`,
`world/BattleEffectHandler.java`, `world/techniques/*`, `world/classes/*`, `world/Beast.java`,
`factories/BeastFactory.java`, `world/armory/Mount.java`, `world/Injury.java`, `factories/InjuryFactory.java`,
`world/WeaponProficiency.java`, `world/Origins.java`, `world/Age.java`, `world/Progression.java`, `world/Gladiator.java` …).

**Verification note.** Several core methods (`Combatant.AttemptAttack`, `Combatant.Attack`, `Combatant.TakeDamage`,
the `Combatant` constructor, `Battle.ResolveBattle`, `Battle.handleAllInjuriesAndRewards`, `Technique.GetCooldown`,
`Trait.getCombatEffect`) are flagged "decompiled incorrectly" by jadx, and the normal Java output contains
**inverted conditions** in several places (e.g. Briton heal, Thracian stacking, Indomitable poison halving, the
draw branch). Every formula in this document for those methods was re-checked against jadx's raw
instruction ("fallback") dump. Where something is still uncertain it is marked **[uncertain]**.
Probable bugs/quirks are marked **[quirk]**.

Notation: `S` = Strength, `I` = Initiative, `C` = Cunning, `H` = max HP ("Health"/maxLife), `F` = favour,
`B` = flat "bonus damage" stat, `r` = technique rank, `d` = technique's damage field. A `t` prefix means
"target's" (e.g. `tI`). All divisions are Java integer division (truncate toward zero). `rand(n)` = uniform
integer 0…n‑1. "W" = weapon damage-bonus points (see §6.3).

---------------------------------------------------------------------------------------------------

## 1. Architecture in one paragraph

A `Battle` holds two `EntrantsTuple`s (a dominus + up to 3 `ICombatant`s, each with optional
weapon/offhand/armor/helmet/mount/item slots and a fight instruction). `ResolveBattle(week)` converts each
`Gladiator`/`Beast` into a transient `Combatant` (all equipment, traits, origin, class, proficiency folded
into numbers), applies start-of-battle effects, then runs at most N rounds in initiative order. Each living
combatant per round: tick its own status effects → pick a target → `AttemptAttack` (hit roll, main hand,
offhand, extra attacks, DoTs, dirty trick or net) → every enemy is checked for knockout/surrender. When one
side is empty the other wins; otherwise after the last round the crowd decides. Then injuries/death, XP,
fame, loyalty, weapon proficiency and trait unlocks are applied. There is **no stamina/fatigue system**;
HP only changes through damage, DoTs, heals/lifesteal and transformation effects.

---------------------------------------------------------------------------------------------------

## 2. The attributes

### 2.1 Base attributes (stored in `Attributes`)
| Attribute | Stored as | Notes |
|---|---|---|
| Strength | `_strength` | main damage stat |
| Initiative | `_initiative` (shown as "agility" in equipment stats) | turn order, accuracy, crit, many resists |
| Cunning | `_cunning` | tricks, targeting, status power/resist, techniques |
| Health | `_maxLife` | each attribute point adds **+5 HP** (`addHp` → `adjustMaxLife(5)`); other stats +1 per point |
| Loyalty | `_loyalty` (0–100, default 80) | in combat: fear resist and surrender only |

Gladiator getters apply **age modifiers** and reincarnation bonuses (beasts use raw values, age fixed at 10):
- `GetStrength = int(raw S + (reincLevel>3 ? 1:0)) × strMod(age)`, min 1
- `GetInitiative` likewise with `reincLevel>3`, `GetCunning` with `reincLevel>4`, min 1
- `GetMaxLife = int((raw H + (reincLevel>7 ? 5:0)) × hpMod(age))`, min 5

Age modifier table (years):
| Age | Str | Ini | Cun | HP | XP gain | Injury-prone bonus |
|---|---|---|---|---|---|---|
| <4 | .1 | .1 | .1 | .2 | .1 | +3 |
| 4–7 | .2 | .5 | .3 | .4 | .2 | +2 |
| 8–11 | .5 | .7 | .4 | .7 | .5 | +1 |
| 12 | .5 | .7 | .4 | .7 | .9 | +1 |
| 13–14 | .5 | .7 | .5 | .7 | .9 | +1 |
| 15 | .8 | 1.0 | .6 | .9 | .9 | 0 |
| 16 | .8 | 1.0 | .7 | .9 | 1.0 | 0 |
| 17 | .9 | 1.0 | .8 | .9 | 1.0 | 0 |
| 18–27 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0 |
| 28–32 | 1.0 | .9 | 1.0 | 1.0 | .8 | +1 |
| 33–39 | .9 | .8 | 1.0 | .9 | .6 | +2 |
| 40–45 | .8 | .6 | 1.0 | .7 | .4 | +2 |
| 46–48 | .8 | .4 | .9 | .7 | .3 | +4 |
| 49 | .7 | .4 | .9 | .5 | .3 | +4 |
| 50–54 | .7 | .4 | .9 | .5 | .2 | +4 |
| 55–58 | .6 | .3 | .9 | .4 | .2 | +4 |
| 59 | .6 | .3 | .9 | .4 | .2 | +5 |
| 60–61 | .6 | .3 | .8 | .4 | .2 | +5 |
| 62–69 | .5 | .2 | .8 | .3 | .2 | +5 |
| 70–79 | .3 | .1 | .7 | .1 | .2 | +6 |
| 80–99 | .3 | .1 | .6 | .1 | .2 | +7 |
| ≥100 | .1 | .1 | 1.0 [quirk] | .1 | .2 | +8 |

Kids (<15) cannot use mounts in battle (mount set to null) and use kid appearance. Technique stat requirements
are checked against **raw** attributes (+reincarnation bonus), not age-modified or equipment values.

### 2.2 What each stat feeds in combat (summary)
| Stat | Uses |
|---|---|
| **Strength** | base damage of every normal attack and most techniques; stun/daze resist (`S + H/5`); disarm resist (`S/2`); sunder & bleed resist (`S/4`); FEEL_NO_PAIN armor (`S/10+2`); caltrops damage taken (heavier = more); shield-slam power; Hoplite/Warcry buffs |
| **Initiative** | turn order; main hit/crit roll (`1.5×(I − 7tI/12)`); bow opening volley (`2.5×(I − tI/2)`); disarm/blind/sunder resist (`I`, `I`, `I/3`); parry; Hail-of-Arrows extra hits; Fireball dodge; caltrops avoidance; many technique coefficients |
| **Cunning** | smart targeting (`C+rand(20)>20`); dirty-trick roll; net roll; fear resist (`1.5C`); blind resist (`C`); bleed resist (`C/2`); sunder resist (`C/4`); Fireball/Disarm/Gouge/CheapShot/ThrowSand; Rally block size; poison (−1 if victim's C > attacker's) |
| **Health** | HP pool; stun resist (`H/5`); fear resist (`H/10`); sunder resist (`H/20`); Headbutt (`0.2H`), Warcry power (`H/2`), Decimate (`tH/4`); bleed tick (missing HP/10); poison (`tH/10`) |
| **Loyalty** | fear resist (`L/15`); surrender if `L<60`; INSPIRED/DEMORALIZED modify it |
| **Favour** | added to almost every roll: turn order, hit roll, status power and resist, parry (×2), Hand-of-Midas coins; also +F starting HP |

---------------------------------------------------------------------------------------------------

## 3. Building a Combatant (all derived stats)

The `Combatant` constructor (verified in fallback) computes:

**Core stats.** `S`, `I`, `C`, `H` = attribute + Σ(stat bonuses of weapon, offhand, armor, helmet, mount, item).
`_baseStrength/_baseInitiative` keep these values for percentage effects. Loyalty unchanged.

**Starting HP.** `hpLoss = H × injuryHpEffect` if the fighter carries an injury
(Flesh wound 10 %, Broken bones 15 %, Severely wounded 30 %, Multiple injuries 45 %, Ill 15 %).
`startOfCombatLife = H − hpLoss`, `currentLife = H + favour − hpLoss` (favour HP can exceed max).
Later additions: Bathhouse +10 max/current; "favoured" (Pluto-favoured dominus or Bacchus-patron influence)
+1 favour & +1 HP (Egyptians: +2 favour, +2 HP); OneManArmy/Inspired buffs; Reins (see below).

**Armor value (`baseArmor`).** Σ blockValue of armor + helmet + mount (+ mount again with MasterHorseman or
Parthian lvl‑2), + set bonuses, + origin Greek +1, + Mythical +2, + Tough/ThickHide +1, + Intangible +1
(Wraith +10), + Reincarnated (+1) / ReincarnatedBlessed (+1), + Agile +1 (no armor or non-heavy non-Linthorax),
+1 if ≥6 equipment "pieces" (assigned weapon counts 1, two-hander 2; offhand, helmet, armor, mount, item 1 each).
Weapon and offhand block are added *at hit time* (§7).

**Damage resist (flat, after armor).** armor DR + helmet DR + mount DR (×2 Parthian), Tough/ThickHide +1,
Intangible +1 (Wraith +2).

**Reach.** weapon reach + mount reach (×2 Parthian) + Iberian +1 + Alert trait (`raw I/10 + 1`) +
ExplosiveRelease with a pilum +1.

**Favour.** +1 each: Black Death weapon (main or offhand), Mythical, each "Blessed" trait (Devotion,
ApolloBlessing), CelestialChampion, ReincarnatedBlessed, TempleArtifact on weapon, offhand, armor, helmet,
mount or item (an item with TempleArtifact is counted twice — once in the armor/helmet/mount/item pass and once
in the weapon pass [quirk]), Hand of Midas item; then **×2 for Egyptian origin**; then setFavoured (+1/+2) is
added afterwards.

**Accuracy pieces.** `baseAccuracyBonus`: LightningSpeed +5, AllIn +10 (free hand), PiercingPrecision +10
(spear/javelin), EagleVision item +5, EyeBall item +2, LightFooted gear +5. `weaponAccuracyBonus`: weapon
proficiency (Master +5, Grandmaster +10), class preferred main weapon +3, class preferred offhand +2,
RomanConquest weapon (Roman) +5, Egyptian weapon (Egyptian) +5. `offhandAccuracyBonus`: offhand proficiency.

**Dodge (`baseDodgeBonus`).** LightningSpeed +5, Reins while mounted +10, Werewolf+Moonstone +5. It only
subtracts from the attacker's hit total.

**Crit bonus (`criticalHitBonus`).** Briton +10, weapon CriticalHits +10, offhand CriticalHits +10, a
TwoHandedOnly weapon gets **+20** (it satisfies both checks) [quirk], TRANCE +30 while active.

**Weapon damage bonus points (`weaponDamageBonus`, `offhandDamageBonus`).** proficiency (Proficient +1,
Specialist +2, Master +3, Grandmaster +5), Scutum shield with a Gladius +2, Falcata +2 / Falcata2 +3 with a
free hand (+1/+2 more for Punic or Iberian), TwoHanded effect +2 with a free hand, AllIn +1 with a free hand,
pilum + ExplosiveRelease +1, active set bonuses. "Free hand" = no offhand, a Strapped offhand, or
TitanicStrength. Each point = +10 % damage **and** +1 flat (§6.3).

**Status resists.** `statusResist`: Gaul +7; INDOMITABLE status +40. `stunResist`: StunResist gear +8,
SteadyFooting +5, Cataphract trait on a horse +10. `weakBlock`: Sturdy +2 / VerySturdy +3 (armor vs unarmed &
fists). `criticalBlock`: CriticalBlock gear +2 (armor vs crits). `poisonResistance` item flag. Caltrops item
count (+1, quality +2). Sauroter spear → one free disarm immunity.

**Other.** Reins item: no mount → summons a Spectral Steed; already mounted → +10 dodge, +5 bonus damage,
+10 max HP. PunicOriginTraitStacking: `B += traitCount/2`. Cataphract+horse with armor > 20: +5 starting HP per
armor point above 20. All technique cooldowns reset to 0. INDOMITABLE status (1 turn) applied if trait.

---------------------------------------------------------------------------------------------------

## 4. Battle setup (`Battle.ResolveBattle`, `prepCombatants`)

1. **Moon.** If `week % 4 == 0`: gladiators with Lycanthropy, and anyone carrying a Moonstone item, get
   `WerewolfActive` for this fight.
2. **Injury modifiers** (per side, used only for losers): player side +1 at Pluto ascension (level 8+);
   both −2 if both sides belong to the same dominus (sparring). Some event battles pass custom modifiers
   (raids give +2 to one of the two sides depending on who raids; rogue-gladiator attacks use 0, 2 or 4+).
3. **Gear.** For each of up to 3 fighters per side the slot item is used if still available
   (`BattleEquipmentAvailability`: every physical item can be used by only one fighter in the battle).
   Empty slots on gladiators are auto-filled from the owner's armory (assigned item first, else
   `WeaponSelectionFactory`: classed gladiators pick their class's preferred main weapon type, unclassed
   pick by proficiencies). No weapon → arena-provided Shoddy Cestus (fists). Pankration → fist weapons only.
   Mounts only if allowed for that side (tournament round rules). Mountable beasts (elephant, gryphon) of the
   owner can be ridden if not fighting themselves, healthy and "worthy" (§15).
4. **Beast special kit.** Unarmed Minotaur gets a Quality Bipennis (Precision). Medusa/Cyclops are assigned
   armor (+Jupiter Amulet for Cyclops) but `Beast.AsCombatant` ignores all equipment except the Minotaur weapon,
   so this is **dead code** [quirk].
5. **Mandrake item.** If a side has fewer than 3 fighters, a Mandrake item summons a Mandrake beast
   (Shoddy → weak, Old → regular, better → strong; §14) as an extra combatant (not in the entrant list, so it
   gets no rewards/injuries).
6. **Escaped wild beast cheat** adds a *temporary* beast (removed from the roster immediately; fights only).
7. Instructions are applied (`setInstructions`, §17). Team flag set if >1 fighter.

---------------------------------------------------------------------------------------------------

## 5. Turn order and the round loop

### 5.1 Initiative order
Sort descending by `I + 5×reach + favour` (`initiativeComparator`). Ties keep list order (stable sort),
which is **first entrant's fighters first** (the player in tournaments). The order is computed, start-of-battle
effects are applied, then the list is **re-sorted once**; it is never re-sorted again during the fight, so
later initiative changes (fear, stun, daze…) affect rolls but not turn order.

### 5.2 Start-of-battle effects (`startBattleEffects`, per side, first side then second)
| Source | Effect |
|---|---|
| Weapon/offhand with **Fear** effect | fear check on every enemy, power `C/4 + S/4 + 15` |
| Elephant **beast** fighting | fear check on enemies **riding a non-elephant mount only**, power `S/2 + H/10 + 10` |
| Elephant **mount** | same rider-only fear, power `mountStr/2 + mountHP/10 + 10` |
| Traits HorribleDisfigurement (CausesFear) / Mythical | one pooled fear check on all enemies: power `10 + Σ_holders (S/4 + C/4 + F if wearing a helmet, else S/3 + C/3 + F) + 5 per CarthageSet holder` |
| Carthage helmet or armor on a Punic fighter | INSPIRED 3 on self |
| Inspiring trait | every *other* teammate not yet inspired: INSPIRED 5 |
| Psychopath trait (Demoralizing) | every *other teammate* (own side!) without the trait: DEMORALIZED 5 |
| Hoplite trait + spear | every teammate (incl. self) +1 armor, +1 Str (stacks per Hoplite) |
| Blind trait | self BLINDED 99 (fights permanently blind) |
| Preparation / SelfPreservation (Block) | self BLOCK 99 (blocks 10 of the first hit; removed at end of round 1) |
| Chains cheat (Chained) | CHAINED 99 (−⅔ base Ini) |
| Cronus ascension / raids (CurseOfTime) | TIME_CURSE 99: all techniques start on full cooldown |
| Ambush (Surprised, adventures) | Ini −2 −baseIni/6, Cun −2 −Cun/6 (min 0), armor −1 |
| Surrounded (raid attackers/rogue) | Ini −4 −baseIni/5, armor −1 |
| Walled (raid defenders) | Ini +4 +baseIni/5, Str +2, armor +2 |

### 5.3 Rounds
Rounds = 6 (`MAX_MOVES`), 8 for event battles (adventures, raids, rogue attacks), or a custom 8 for
Ascension/Prophecy knock-out rounds (`setCustomRounds`; values <4 fall back to the default).

Per round, for each combatant in order that is not defeated:
1. `selfRoundStart`: every status effect on this combatant loses 1; effects reaching 0 are removed and their
   stat change reversed. (Durations therefore count the **owner's** turns: e.g. STUNNED 2 = loses exactly one
   turn; EVADING 1 lasts until the owner's next turn.)
2. **OneManArmy**: if own side currently has fewer fighters than the enemy and not PUMPED → PUMPED 10.
   **Duelist**: if exactly 1 v 1 and not DUEL → DUEL 10.
3. Target selection (§5.4) and `AttemptAttack` (§6).
4. For every enemy: if HP < 1 → knocked out; else **surrender check** (§12.2). Removed fighters release nets;
   if the enemy list becomes empty → attacker's side wins immediately. When a side is reduced to one fighter,
   temporary combatants (escaped beasts) on it are dropped.
5. The attacker itself is checked (caltrops, bleed, parry counter can KO it).

After all have acted: `roundEnd` removes any BLOCK with remaining duration > 10 (i.e. the trait BLOCK 99).

### 5.4 Target selection (`getTarget`)
One enemy → that one. Otherwise `smart = C + rand(20) > 20`. Start from a random enemy; if smart, switch to
the enemy with the **lowest current HP**; otherwise switch to whoever last hit this combatant (if still alive).

---------------------------------------------------------------------------------------------------

## 6. Attack resolution

### 6.1 `AttemptAttack` (one turn)
**a) Opening volley (round 1 only).** If wielding a bow, not disarmed, and not yet damaged: if the target is
not an archer (or own bow has Apollo) and `tI ≤ I + I/4`, fire a free *secondary* shot at the target with
accuracy `rand(15) + (Marksman ? 10:0) + baseAcc − tDodge + (blinded ? blindBase/2 : ensnared ? 10 : 20) + F
+ int(2.5 × (I − tI/2))`, then gain EVADING 1. (The code also looks at enemies #2/#3 for the archer test but
still shoots the primary target [quirk].) The normal attack follows in the same turn.

**b) TRANCE.** From round 3 with an AscendedBlade main weapon (round 4 for an AscendedBlade offhand): TRANCE 4
(+30 crit, 30 % weapon lifesteal) if not already in trance and not disarmed.

**c) Main-hand hit total.**
```
base = baseAccuracyBonus − target.baseDodge + V        V = 45 normally, 30 if self ENSNARED,
                                                          blindBase if self BLINDED (0; +15 BlindFighter; +20 EyeBall item)
roll = rand(30) + F + int(1.5 × (I − (tI/3 + tI/4)))
       + weapon reach (Deadeye)   − 25 (Pilum)
       + 15 if target ENSNARED (+40 instead with a Fuscina)
       + 15 whip vs disarmed/unarmed target   + 15 if target DAZED
if roll < 0: roll = roll/2
if armed & not disarmed: roll += weaponAccuracyBonus;
       P = Precision weapon ? (base > 50 ? 5 : 10) : 0;  Backstab vs impaired target: P += rand(30)+15
dual wield (offhand is a sword/dagger/axe): roll −= 30 (−15 with DualWield trait); −5 more if main needs 2 hands
T = base + roll + P
```
Achilles' Spear: −10 if S < I or S < C, −10 for each of S < 50, 40, 30, 20, 10; S > 60 → +10 % crit damage
(added permanently **every attack** [quirk]).

- STUNNED → no attack this turn (DoTs still tick).
- `T < 30` → miss (BladeWhisperer with a sword main hand never misses).
- `30 < T < 40` → T is raised to **45** (so weak hits never glance/crit) [quirk: T = 30 exactly is not raised].
- Otherwise `Attack(target, T, main weapon, secondary=false)`.

**d) Offhand / second blow.** Happens if the offhand is a weapon and either dual-wieldable (sword, dagger,
axe; two-handers only with TitanicStrength) or the main weapon is a cestus; a cestus with no offhand punches
twice (second punch uses `T−10`). Offhand total = (main T without P, after the 45 bump) − 10
(0 with Ambidextrous) + offhandAccuracyBonus (+10 Precision offhand, Backstab, −5 if the offhand needs two
hands). Miss if < 30 (BladeWhisperer + sword offhand never misses), bump 30–40 → 45, then **−10 × offhand
reach**. Resolved as a *secondary* attack.

**e) Hydra heads.** TWO_HEADS: extra secondary attack (no weapon) at T+15; THREE_HEADS: another at T+25.

**f) DoTs on self.** Caltrops trigger (§9) and bleeding tick: `rand(2) + 2 + (H − currentHP)/10`.

**g) Dirty trick or net.** If the battle-wide "trick available" flag is set, it is round ≥2, the attacker is
not a beast (Medusa excepted), not PARRYing and not STUNNED → `AttemptTrick` (§10) and the turn ends.
Otherwise: net throw (Net offhand 2, Hooked net 4) if no net deployed and target not ensnared:
`min((C/2+I/2) − (tC/2+tI/2), 5) + rand(10) + F + net + (target is beast ? 3 : 0) > 5` → target ENSNARED 4.
Because the trick branch returns early, nets are normally thrown only in round 1 or after the battle's
one successful trick [quirk]. Finally ManyHeads: < 75 % HP → TWO_HEADS 99; < 25 % with two heads →
THREE_HEADS 99.

### 6.2 `Attack` — crit, glance, technique choice
```
T' = T − 5 (bow vs unsundered shield) − 5 (target Flying)
greek = Greek lvl-2 ? (100 − HP%) : 0      (−5 if target Flying)
glancing = T' < 40 or target EVADING
crit     = T' + criticalHitBonus + greek + rand(30) > 109
if crit and glancing: neither            (they cancel)
secondary attack with a Concealed weapon and < 2 attacks made so far: forced crit
```
**Techniques** (only on main, non-secondary attacks): every equipped technique with cooldown 0 that is
`Useable` is collected (cooldowns of *all* techniques tick down by 1 during this scan). While glancing only
piercing techniques (Fireball, Feint) are usable. ENRAGED → no technique. The list is sorted by priority
(ties random); if the top priority is > −1 it replaces the normal attack and its cooldown is set
(full rules §11).

**Temporary bonus** (this attack only, to main or offhand points): Khopesh +1 if target's offhand is not
heavy equipment (−1 if it is), +1 more if target's armor is not heavy (−1 if it is); fists/disarmed with
Hand of Midas +1; own main weapon reach > target's weapon reach +1. FistsOfSteel (fists or disarmed): target
Str −1, −1 more if own S > 20, −1 more on crit, −1 more if target S > 40 (permanent for the fight).

### 6.3 Normal-attack damage
```
base = S + B
crit:       base += B + B×critDmg%/100          (ranged secondary: B/2 + B×critDmg%/100)
glancing:   base −= int(0.75 × S)
ranged secondary (bow volley, extra heads, any weaponless secondary): base −= int(0.25 × S)
base = max(base, 0)
W = weapon.damageBonus + weapon points (main or offhand)   [0 if no weapon or disarmed]
    + 2 (spear while own net is deployed) + 3 (dagger crit with ShadowBlade)
    + favour (+favour again on crit) for Egyptian lvl-2
dmg = base + base×W/10
secondary attack (offhand, volley, heads) and dmg > 2: dmg −= dmg/4
final = dmg + W
```
Important: a **critical hit does not add Strength** — it only re-adds `B` (bonus damage, normally 0–5) plus the
crit-damage %. For ordinary gladiators a crit's value is that it removes the glancing penalty, gets
`criticalBlock`, can shatter Fragile gear, and powers technique crit bonuses (which *do* add Strength).

Worked example: S 20, B 0, W 3 vs armor 10, no DR → 20 + 6 + 3 = 29 → armor 31.6 % → 29 − 9 = **20**.
Same attack glancing: (20−15)=5 → 5+1+3 = 9 → −2 = 7.

### 6.4 On-hit effects (after normal attacks and techniques)
"Weapon hit" = normal attack or `isWeaponAttack` technique with a weapon and not disarmed.
- Lifesteal (weapon hit, target lost > 2 HP this hit): BloodLust weapon 50 %, BloodDrinker / TRANCE /
  RomanConquest(for Romans) 30 %. Pilum weapon hit: target armor −(attacker's armor/4) [quirk: uses the
  attacker's armor].
- Briton lvl‑2: on crit heal 10 % max HP. LifeSteal effect (Carnivorous trait, werewolves): heal 30 % of the
  damage dealt; ManEater vs non-beasts 20 %.
- Bleeding weapon (weapon hit): `Bleed(S/2 + I/2 + C/2 + rand(20), 5)`.
- Poison (PoisonedWeapons trait/cheat or Poisoned weapon; needs weapon hit or attacker beast; target lost HP;
  not on head attacks): `tH/10 + 2` (`tH/20 + 2` vs Mithridatism), ×1.5 PoisonMaster (unless target also
  has it), ÷2 with a poison-resistance item, −1 if target C > attacker C, ÷2 if target is Indomitable and
  has not attacked yet, minimum 1, ignores armor. An Antidote item makes the target immune (consumed).
- Whip (not disarmed): on crit target ENSNARED 2 (Fulgur: BLEEDING 4 instead). DeafeningCrackle: if the
  target has a negative status → Fear check with power `lastRoundDamage + I + C`.
- Counters: `numberOfAttacks++`. Thracian lvl‑2: +1 main and offhand weapon points and +1 accuracy **per
  attack, cumulative**.

---------------------------------------------------------------------------------------------------

## 7. Taking damage (`TakeDamage`)

**Effective armor A** (recomputed per hit):
```
A = baseArmor + (own weapon blockValue + weaponBlockBonus, if armed & not disarmed)
  + offhand blockValue (halved if the offhand is a dual-wield weapon; a shield is ignored by a Sica)
  + attacker weapon reach (if I carry a shield)        + 2 shield vs bow
  + weakBlock (attacker unarmed/disarmed/fists)         + 3 (fists vs fists/unarmed)
  − 5 (attacker Pugilist with fists, I'm not a beast)
  + 2 Mobility / +4 GreaterMobility armor if my I > attacker I
  BeastTamer hit by a beast: baseArmor += 2 permanently (stacks every hit)
  ÷2 if attacker ArmorPiercing (SharpenedClaws);  + criticalBlock on crits;  min 0
  Pilum: A −= A/4
```
Weapon blockValue includes Xiphos +1 (without shield). Taranis shield (Gaul/Briton, unsundered) adds the
owner's favour as a flat block.

**Armor curve:** `reduction = A / sqrt(A² + 900)`; `dmg −= int(dmg × reduction)`.
| A | 2 | 5 | 8 | 10 | 15 | 20 | 25 | 30 | 40 | 50 |
|---|---|---|---|---|---|---|---|---|---|---|
| reduction | 6.6 % | 16.4 % | 25.8 % | 31.6 % | 44.7 % | 55.5 % | 64.0 % | 70.7 % | 80 % | 85.7 % |

(The helper `getArmorReductionText` displays `A/(A+5)` — e.g. 67 % for A=10 — far above the real value
[quirk: UI/engine mismatch; where it is shown not verified].)

**Order of operations**
1. Class preferred technique: ×1.1 damage (only when the hit is that technique).
2. Piercing hits (Fireball, Feint, ThunderStrike splash) use `A/2` (Fireball `A/10`) and skip parry/BLOCK.
   Fireball dodge: `rand(tI+60+tC) + tI/5 + tC/5 (−10 if attacker C > target C) > 65` → half damage.
3. Non-piercing: PARRY check (§11, Parry) — success reflects the full pre-armor damage onto the attacker
   (through the attacker's own armor) and the defender takes nothing.
4. Armor reduction.
5. Non-piercing: Intangible with no damage dealt on its last action −90 %; BLOCK subtracts blockAmount
   (default 10) and is consumed; Indomitable before its first attack also blocks half the damage; Taranis
   favour subtracted. Piercing path: Intangible −70 %, Indomitable −25 % always, Taranis subtracted.
6. − damage resist (min 0). Taranis shield: any damage taken → favour +1 (stacks).
7. One multiplier (first that applies): Bestiarii vs beast +30 % (+20 % more if the beast is Mythical and the
   weapon is AscendedBlade/TempleArtifact); BestiaSummum beast vs non-beast +30 %; Mythical target vs
   AscendedBlade/TempleArtifact weapon +20 %; ColossusSlayer vs Giant +30 % (Titan +15 %); EquesSlayer vs
   mounted +30 %.
8. HP reduced. **Resist knockout** (once per fight): if HP was > 1 before the hit, instruction is "go all out"
   or the fighter has SpartanResolve, and the hit leaves `0 ≥ HP > −(rand(10)+2 [+5 if both])` → HP = 1.
9. Impact attacker marks +1 injury risk. Werewolf check. If KO'd: KO from full HP in one hit (non-beast
   victim) flags the attacker for SuddenDeath; victim injury modifier += attacker's instruction bonus (§13).
   If not KO'd: Gaul lvl‑2 +2 S/I/C/maxHP (stacks). A damaging crit that does not KO shatters Fragile armor
   and/or helmet (ARMOR/HELMET_SUNDERED 5).

---------------------------------------------------------------------------------------------------

## 8. Status effects

`Effect(status, n)`: if already present keep the longer duration, stat change applied only on first
application; reversed on expiry (reversal of current-value-based changes like DAZED's Cun is not exact
[quirk]). Durations tick at the start of the owner's turn.

| Status | While active | Sources (duration) |
|---|---|---|
| BLINDED | own hit base 45 → 0 (+15 BlindFighter, +20 EyeBall); impaired | Gouge 2, Throw Sand 3, trick 2, Solar flash 1, Blind trait 99 |
| STUNNED | cannot attack, no tricks; impaired | Kick, Charge, Cheap Shot, Headbutt, Pounce, Uppercut, Hurricane, Warcry 2; Headbutt self 1; Medusa gaze 2; shield slam 2 |
| DAZED | −baseIni/5, −baseStr/5, −Cun/5; attackers +15 hit | Uppercut 4, Thunderstrike 3 |
| DISARM | no weapon damage/block, counts as unarmed; impaired | Disarm 5, trick 4, werewolf 99 |
| FRIGHTENED | −baseIni/3; impaired | fear checks 3 |
| ENRAGED | cannot use techniques | trick 3, Rampage (self) 3, werewolf 2 |
| ENSNARED | −3 Str, −3 Ini, own hit base 30; attackers +15 (+40 Fuscina) | net 4, whip crit 2 |
| BLEEDING | −baseStr/4; lose `rand(2)+2+(H−HP)/10` per own turn | Impale 5, Bleeding weapon 5, Fulgur crit 4 |
| CALTROPS_THROWN | −(baseIni/5+1) Ini, −1 Cun; caltrops damage | caltrops item 4 |
| ARMOR/HELMET/SHIELD_SUNDERED | lose that item's block | Sunder/Fireball/Shield Bash 10, Fragile on crit 5, werewolf 99 |
| EVADING | incoming attacks glance (no crits, only piercing techniques) | bow volley 1, Sneak Attack crit 1, Strike and Roll 1–2 |
| PARRY | counter chance vs each non-piercing hit | Parry 1 |
| DEFLECT | negates the next *successful* status effect | Parry (chance) 1, Rally 4 |
| BLOCK | −blockAmount from next non-piercing hit | Rally 4, Shield Bash 4, Block traits 99 (round 1) |
| WARCRY | +(2r+3) Str | Warcry 3 |
| FEEL_NO_PAIN | +(S/10+2) armor, +10 stun resist | Rampage 3 |
| PUMPED | +5 Str, +15 max & current HP | OneManArmy 10 |
| DUEL | +baseIni/10 Ini, +armor/10 armor | Duelist 10 |
| INSPIRED | +baseIni/5 Ini, +10 HP, +baseLoyalty/4 | Inspiring teammate 5, Carthage gear 3 |
| DEMORALIZED | −Cun/5, −baseIni/5, −baseStr/5, −baseLoyalty/4 | Psychopath teammate 5 |
| TRANCE | +30 crit bonus, 30 % weapon lifesteal | AscendedBlade 4 |
| INDOMITABLE | +40 status resist | Indomitable trait 1 (until first turn) |
| CHAINED | −⅔ baseIni | chains cheat 99 |
| TIME_CURSE | all techniques put on full cooldown | Cronus / raids 99 |
| TWO_/THREE_HEADS, WEREWOLF | see §14 | |

"Impaired" = BLINDED, FRIGHTENED, STUNNED or DISARM (enables Cheap Shot, Sneak Attack bonus, Backstab).
"Negative" (Rally priority, Crackle) = BLINDED, ENRAGED, FRIGHTENED, STUNNED, ENSNARED; Rally also removes
BLEEDING.

### 8.1 Application / resist formulas (P = effect power, SR = statusResist)
| Effect | Succeeds if | Notes |
|---|---|---|
| Stun, Daze | `P + rand(15) > S + H/5 + R + R×P/100 + rand(15) + F`, `R = SR + stunResist (+10 FEEL_NO_PAIN)` | resist scales with power |
| Disarm | `P + rand(10) > SR + I + S/2 + F` | target needs a non-fist weapon, not already disarmed; Sauroter cancels the first one |
| Blind | `P + rand(10) > SR + I + C + F + (Lunar ? C/4+8) + (EagleVision ? C/6+4) − (Albino ? 5)` | |
| Bleed | `P + rand(20) > SR + S/4 + I/4 + C/2 + F + rand(20)` | |
| Sunder | `P + rand(15) > H/20 + SR + C/4 + S/4 + I/3 + F` | needs helmet or armor; breaks shield first, helmet/armor only if nothing else broke or P beats `H/10+SR+C/2+I+F` (armor also vs `+rand(10)+2F`) |
| Fear | `P + rand(50) > L/15 + SR + H/10 + 1.5C + F (+C/2+5 Adventurous, +C/2+5 ColdBlooded)` | FRIGHTENED 3 |
| Caltrops | `P > I/5 + C/5 + F` | |
| Enrage, Medusa gaze, werewolf/statuses from traits | no resist | |

Every successful effect is still cancelled by DEFLECT. Whenever a Stun/Daze/Disarm/Sunder/Blind/Bleed/Fear
is *resisted* by someone not already affected, a Lunar weapon/offhand gains +1 weapon point (stacks).
"Momentum" (AxialMomentum trait) adds P/4 per axe (main and offhand) to most stun/sunder powers; a Deceptive
weapon adds `1 + P/4` per Deceptive item (Throw Sand: +5 each).

---------------------------------------------------------------------------------------------------

## 9. Caltrops
A caltrops item lets the owner throw once (inside a failed-or-ineligible trick, cunning roll > 5):
`P = rand(5) + caltrops(1/2) + (I>tI) + (C>tC) + C/4 + I/4 + F` vs `tI/5 + tC/5 + tF` → CALTROPS_THROWN 4.
On each of the victim's turns: avoided if `rand(50) + I/3 + C/3 − S/3 ≥ 45`; else damage
`rand(4) + [S>8] + [S>13] + [S>20] + [H>40] + [H>55] − [LightningSpeed]`, ×2 if mounted, +2 beast,
+1 blinded, −1 stunned; cannot drop the victim below 1 HP.

---------------------------------------------------------------------------------------------------

## 10. Dirty tricks (`AttemptTrick`)

Global rule: **only one successful trick per battle** (the battle-wide flag is cleared by the first success;
shield slam, solar flash and caltrops do not clear it).
```
roll = min(C/2 − tC/2, 5) + rand(10) + F + (C/2 > tC) + (C/4 > tC)
       + 2 (target Albino) + 1 (target Temperamental) + 2 (Deceptive weapon)
```
Requires target alive and attacker not impaired.
- `roll > 10` and target not a beast:
  - Medusa → target STUNNED 2 ("turned to stone").
  - type = Albino target ? 5 : (Temperamental target and coin flip ? 0 : roll % 5)
  - type 0 → target ENRAGED 3 (no resist).
  - type 1 → if attacker HP > 10 and target armed: Disarm(roll, 4).
  - otherwise (or failed disarm) → Blind(roll + 5 Solar, 2).
- Else, if attacker has a ShieldBash-effect offhand (target doesn't), not yet used, target not stunned:
  `rand(10) + (I>tI) + (S>tS) + Deceptive > 8` → Stun(shieldBlock + S + I + F, 2) (once per fighter).
- Else Solar weapon/item, not used, target not beast: `rand(10) + (I>tI) + (C>tS) > 8` →
  Blind(n + C/2 + I/2 + F, 1) and +2 weapon points (once per fighter).
- Else caltrops (above).

---------------------------------------------------------------------------------------------------

## 11. Techniques

### 11.1 General rules
- **Learning.** Each technique has a main stat and requirement `req`; rank r requires
  `req + (req/2)×(r−1)` of the main stat (raw attribute), the next rank `req + (req/2)×r`. Learning or
  upgrading costs 1 skill point. A learned technique is auto-equipped if the requirement is met. No equip
  cap exists for the player; AI-generated gladiators keep at most 2 equipped.
- **Choice.** Only on main-hand turns that hit (`Attack`, non-secondary). Priority =
  `basePriority + rank − 1 + (class-preferred ? 1 : 0) + manual priority + situational modifiers`. The
  Tactics screen assigns manual priorities 100×N, 100×(N−1)… so the player's order dominates (a fixed −1
  from Throw Sand vs an already blinded target still blocks it). Highest priority > −1 is used.
- **Cooldown.** After use `cooldown = GetCooldown()`; the counter drops by 1 each time the owner makes a
  main attack (not on misses or stunned turns). A technique with cooldown N is usable on every (N+1)-th
  attacking turn at best.
- **Glancing hits** (T<40 or target EVADING) allow only piercing techniques (Fireball, Feint).
- Techniques compute their own damage (formulas below); "×W" means `x + int(x × W/10)` with W from the
  weapon passed in (none when disarmed). Unless stated, techniques do **not** add W flat.
- **Class preference:** +1 priority and ×1.1 damage. Crit flag is passed in from the hit roll.
- Damage field `d` = base + increment × (rank−1).

### 11.2 Technique table
(Prio = base priority; CD = cooldown; Req = main stat & base requirement, +req/2 per rank. Rare = learnable
only through special sources.)

| Technique | Req | CD | Prio | d (base / +rank) | Weapon atk | Rare |
|---|---|---|---|---|---|---|
| Smash | Str 5 | 1 | 3 | 4 / +3 | yes | |
| Kick | Ini 7 | 2 | 3 | 6 / +2 | no | |
| Lunge | Ini 5 | 1 | 1 | 4 / +2 | yes | |
| Sunder | Str 7 | 2 | 1 | 3 / +2 | yes | |
| Throw Sand | Cun 3 | 3 | 0 | – | no | |
| Parry | Ini 8 | 3 | 1 | – | no | |
| Headbutt | Str 8 | 2 | 3 | 3 / +2 | no | |
| Feint | Ini 9 | 3 | 0 | 1 / +2 | yes (piercing) | |
| Charge | Ini 6 | 3 | 7 | 4 / +2 | yes | |
| Decimate | Str 8 | 2 | 1 | 3 / +3 | yes | |
| Gouge | Cun 7 | 2 | 1 | 2 / +2 | yes | |
| Rally | Cun 5 | 3 | 1 | – | no | |
| Disarm | Cun 6 | 2 | 0 | 1 / +2 | yes | |
| Rampage | Str 9 | 3 | 1 | 8 / +4 | yes | |
| Warcry | Health 40 | 3 | 3 | – | no | yes |
| Cleave | Str 10 | 3 | 1 | 4 / +2 | yes | yes |
| Execute | Str 8 | 1 | 2 | 14 / +5 | yes | yes |
| Strike and Roll | Ini 8 | 2 | 3 | 0 / +3 | yes | yes |
| Cheap Shot | Cun 8 | 2 | 8 | 6 / +3 | yes | yes |
| Shield Bash | Str 7 | 3 | 1 | 4 / +3 | no | yes |
| Hail of Arrows | Ini 10 | 3 | 3 | 2 / +1 | yes | yes |
| Impale | Str 10 | 2 | 5 | 4 / +3 | yes | yes |
| Uppercut | Str 6 | 3 | 3 | 4 / +3 | yes | yes |
| Thunderstrike | Ini 6 | 2 | 3 | 6 / +4 | yes | yes (mythical) |
| Fireball | Cun 15 | 4 | 5 | 8 / +6 | no (piercing) | yes (mythical) |
| Hurricane | Ini 8 | 3 | 3 | 2 / +3 | yes | yes |
| Maul (beast) | Str 6 | 2 | 0 | 4 / +4 | no | |
| Swipe (beast) | Ini 6 | 2 | 0 | 2 / +3 | no | |
| Bite (beast) | Ini 2 | 1 | 0 | 2 / +4 | no | |
| Pounce (beast) | Ini 12 | 2 | 1 | 4 / +3 | no | |
| Sneak Attack | Cun 5 | 2 | 1 | 1 / +2 | no (but uses W) | |

Human learnable pool: Smash, Sunder, Lunge, Throw Sand, Kick, Parry, Headbutt, Feint, Charge, Decimate,
Gouge, Rampage (+Rally/Disarm in some contexts) plus "rare learnables" granted by progression
(GetRandomRareLearnable draws from Warcry, Cleave, Execute, Strike and Roll, Cheap Shot, Shield Bash).
Beast pool: Pounce, Bite, Charge; Headbutt & Sunder only rhino/elephant; Disarm only elephant (flag);
Sneak Attack (flag, not rhino/elephant). `SpiritDrain` exists in the enum but has no implementation.

### 11.3 Technique effects (exact formulas; coefficients are applied to the stat and truncated separately)
- **Smash** — `1.3S + d + B` (crit +S), ×W.
- **Kick** — `0.35S + 0.55I + 0.35C + d + B` (crit +S), no weapon bonus. Then Stun(`r + dmg + F` + momentum +
  deceptive, 2). Prio −2 if target stunned, +2 if self disarmed.
- **Lunge** — `0.75S + 0.35I + (unhurt ? 2d : d) + B` (crit +S/2 +I/3), ×W; unhurt = HP ≥ start HP. Prio +2 at
  full HP.
- **Sunder** — `G = (S + I/2 + C + d)/2 + r + F`; dmg `G/2 + S/2 + d + B` (crit +S/2 +I/4 +C/4), ×W; then
  Sunder(`G + 5r + F` + mom + dec, 10). Prio +2 (+4 if target has a shield, +2 more if helmet and armor) while
  nothing is sundered, else −r/2.
- **Throw Sand** — no damage; Blind(`3 + 3r + C + F` + 5/Deceptive + 5 Solar, 3). If it lands, `C > 2tC`,
  ≥2 enemies and r>1: second enemy Blind(`3r + 3 + C/2 + F …`, 3); third enemy if also `C > 2×(2nd)C`, ≥3
  enemies and **r>9** (`2r + 3 + C/3 + F`). Prio fixed −1 if target blinded, else +r+1 (+1 more if disarmed).
- **Parry** — PARRY 1; DEFLECT 1 if `rand(3 + Σ enemy I) − 3r < 5`. Each non-piercing hit while PARRYing:
  counter if `I/2 + 7r + C/5 + rand(20) + 2F > attacker I + 5 + attacker C/10` → attacker eats the
  pre-armor damage (through its own armor). Prio +1 below 50 % HP.
- **Headbutt** — core `0.5S + 0.2H` (crit +S), ×(1 + helmet block/10); dmg `d + core + B`. Self-Stun(`core/2 +
  tH/10 − F − r`, 1) (no lost turn, but impaired until next turn), target Stun(`r + core + F` + mom + dec + 3r,
  2). Prio +1 (−1 if target stunned) −1 target blinded −1 target has more HP +1 self disarmed.
- **Feint** — `0.5S + 0.5I + d + B` (crit +S/2), ×W; piercing (armor ½, ignores parry/BLOCK, usable when
  glancing). Prio +6 vs PARRY/BLOCK; vs an armed target `prio/2 + 1`.
- **Charge** — only if not damaged since own last attack. `0.75S + 0.45I + d + B` (crit +S/2 +I/4), +d if mounted,
  ×W; if the target survives Stun(`2r + core + F` + mom + dec + 3r, 2). Highest normal base priority (7).
- **Decimate** — `S + (tH/4 − 3) − (tI/2 + tI/4) + d + B` (crit +S +r), ×W, min d. Prio +3/+2/+1 if
  `tH/8`, `tH/6`, `tH/5` > tI.
- **Gouge** — `G = (I + C + d + B)/2 + r`; dmg `G/2 + S/2 + (d+B)/2 + C/4` (crit +S/3 +I/3), ×W; Blind(`G + 3r
  + F` + dec + 5 Solar, 2). Prio +1 if target not blind.
- **Rally** — all allies incl. self: remove negative effects, BLOCK 4 + DEFLECT 4 with block
  `C/2 + 8r`. Prio +5 per ally with a negative effect, +1 below 50 % HP. (Description string says "5 / rank×5"
  [quirk].)
- **Disarm** — `G = (I + C + d + B)/2 + r`; dmg `G/2 + 0.5S + (d+B)/2 + C/4` (crit +S/3 +I/3), ×W;
  Disarm(`G + 2r + F` + dec, 5). Prio +2 vs a non-fist weapon.
- **Rampage** — self ENRAGED 3 + FEEL_NO_PAIN 3, then `S + d + B` (crit +S), ×W. Prio +1 target <50 %, +1 self
  <50 %, +1 self <25 %.
- **Warcry** — self WARCRY 3 (+2r+3 Str); Stun every enemy with `H/2 + 15r − 10 + F` + mom + dec, 2. Prio +5
  vs 3+ enemies, vs 2: +4 above half HP else +2; 1 enemy with more HP than self: −1.
- **Cleave** — `S + 0.25I + d + B` (crit +S/2+1) − (#enemies), ×W, hits every enemy. Prio +3 (2 enemies) /
  +4 (3+).
- **Execute** — usable if target below 50 % HP or below the preview damage (`d + S + 0.1C`). `S + 0.1C + d + B`
  (crit +S), ×W, halved if no longer "usable". Kill → target +1 injury risk and Execute immediately re-fires
  on the next living enemy (chains). Prio ×2 below ⅓ HP, +4 below ½.
- **Strike and Roll** — `S + 0.25I + d + B` (crit +S), ×W; then EVADING 1 (2 if already evading). Prio +1 below
  50 % HP.
- **Cheap Shot** — only vs impaired targets. `0.45S + 0.35I + 0.7C + d + B + r` (crit +C/2 +I/3), ×W **+W flat**;
  then Stun(`2r + core/2 + F` + mom + dec + 3r, 2). Base priority 8.
- **Shield Bash** — needs an unsundered shield (beasts exempt). `S + 0.2I + 0.2C + d + B` (crit +S+1),
  ×(1 + shield block/10); self BLOCK 4 with `(shieldBlock + r)×3`; Sunder(`(r + mom + dmg + F)/2 + dec + mom`,
  10). Prio +4 if target not stunned.
- **Hail of Arrows** — needs a bow. Per arrow `0.15S + 0.25I + 0.25C + d + B` (crit +S/4+1), ×W; each arrow at a
  random enemy. Volley value `v = I + 24r − 4`: 2nd arrow if `v > tI` or coin flip; 3rd if `v' = v − v/4 > tI`
  (or coin and `v'+5 > tI`); 4th with `v'' = v' − v'/5`; 5th if `v'' − v''/5 > tI`; arrows 2–5 gain +1 damage
  each on cunning comparisons. Prio +1 if `I/2 > tI`, −2 if `I < tI`. Uses its own `new Random()`.
- **Impale** — spear/javelin (or beast). `0.8S + 0.3I + 0.3C + d + B` (crit +S), ×W; Bleed(`dmg + 6r` + mom + dec,
  5). Prio +1 vs >90 % HP, −5 if target bleeding, −1/−1 if target <10/<20 HP or %. (Description claims −30 %
  Str; code applies −¼ base Str via BLEEDING [quirk].)
- **Uppercut** — only unarmed/fists/disarmed (or beasts); W only from fist weapons. `S + 0.5I + d/2 + 1 + B`
  (crit +S +I/2), ×W; `P = r + dmg + F`: Stun(`P/2 + 2r`, 2), if that fails Daze(`2P + 2r`, 4).
- **Thunderstrike** — `0.4S + 0.4I + 0.3C + d/3 + B` (crit +S), ×W; then a piercing splash of
  `F×(r+1) + d/2 + F + r + 1` to **every** enemy (main target included); survivors Daze(`2×splash + 2r`, 3).
  Favour-scaled.
- **Fireball** — `0.8C + 0.25S + 0.25I + d + B` (+10 % Pyromaniac; crit +S/2), armor ÷10, dodge for half;
  then Sunder(`damage dealt + 2r + F` + dec, 10).
- **Hurricane** — not while a werewolf. W' = W + own weapon reach − target weapon reach; `0.3(S+I+C) + d + B`
  (crit +S/3), ×W' if W'>0, hits every enemy; each Stun(`P − P/4` + mom + dec, 2), `P = r + dmg + F`. A Gryphon
  mount that knows Hurricane lends it to its rider (priority from the Tactics screen).
- **Maul** — `S + d + B` (crit +S/2). **Swipe** — `0.5S + 0.5I + d + B − #enemies` (crit +S/3 +I/3), all enemies.
  **Bite** — `0.5S + 0.5I + d + B` (crit +S/3 +I/3). **Pounce** — `0.5S + 0.35I + W + d + B` (crit +S/2 +d); if
  neither fighter has attacked yet Stun(`r + dmg + F`, 2), prio +4 then.
- **Sneak Attack** — `0.35S + 0.35C + d + B` (crit +S/2 +d), + (I/3 + r) in event battles, + (I/3 + r) vs impaired,
  ×W; crit → EVADING 1. Prio +4 vs impaired.

---------------------------------------------------------------------------------------------------

## 12. Winning and losing

### 12.1 Knockout
HP < 1 after any action → knocked out (removed). Death is decided only afterwards by the injury roll (§13),
except in "to the death" battles (a constructor flag; set by some rogue-gladiator attack events — tournaments,
pit fights, adventures, raids and sparring all pass `false`): every loser of a *decided* fight dies ("Cut down
in a fight to the death") and surrender is disabled. In ordinary tournaments and pit fights death comes only
from the injury roll.

### 12.2 Surrender (`checkSurrender`, never for beasts or to-the-death)
Checked for every enemy after every action, with a fresh `x = rand(30)`; SpartanResolve uses `x/2 − 5`.
`p` = HP as % of start-of-fight HP.
| Instruction | Yields if |
|---|---|
| Throw ("lose fight") | `p < x + 20` (20–49 %) |
| Care ("avoid injury") | `p < x/2 + 10` (10–24 %) |
| Default ("good luck", explicitly chosen) | `p < x/2` and (attacker above 50 % and x even, or attacker CausesFear/Mythical above 25 %) |
| any (incl. none) with loyalty < 60 | `p < x/2 + 10 − loyalty/10` |
AllOut/Kill have no instruction-based surrender. Yielding gives −2 injury risk.

### 12.3 Time-out / crowd decision
If rounds run out: the side with **fewer** standing fighters loses; if equal, crowd score = Σ current HP
(+5 × "Magnificent" fame bonus **for the first side only** [quirk], +50 per ShowMan in non-event battles,
temporary fighters count 1); higher score wins; tie → higher (or equal for side one) dominus influence.
Losers of a time-out use the *winner* injury formula (no death possible).
If one side has no able fighters at start → forfeit.

---------------------------------------------------------------------------------------------------

## 13. Injuries and death

`GenerateInjury(m)`: `R = rand(11) + m`; `R ≤ 10` → nothing; else type by `min(R,15)`: 11 Flesh wound
(2 weeks), 12 Broken bones (3), 13 Severely wounded (4), 14 Multiple injuries (5), 15 Dead.
Death is only possible for decided-fight losers; if `m < 12` a coin flip turns Dead into Severely wounded.
A new injury on an injured fighter becomes Multiple injuries and adds weeks.

- Winner: `m = injuryProne + risk(HP% of start) + combatantMod`, `risk = −3 (≥100 %), −1 (>80 %), 0 (>50 %), +1`.
- Loser (decided fight): `m = injuryProne + 5 + sideMod + combatantMod (+1 if a living winner has Ruthless)`.
- `combatantMod` = instruction (AllOut/Kill +1, Care −1, Throw −2) − 2 if yielded + KO bonus from the attacker
  (attacker on Kill: +3 if attacker above half HP else +2; AllOut +1; Care/Throw −1; Careful −1) + 1 if
  Executed + 1 if hit by an Impact fighter − 1 if ended at full HP + 1 if ended below −15 HP − 1 Careful.
- `injuryProne` (gladiator) = Σ trait injury bonuses + age bonus (§2.1) − 1 (reincarnation level > 1)
  − 1 (Spartacus up to level 4). Beasts: −1 + Σ traits.
- sideMod: Pluto +1 (player), sparring −2, event-specific values.

Loser outcome probabilities (prone 0):
| m | none | Flesh | Broken | Severe | Multiple | Dead |
|---|---|---|---|---|---|---|
| 3 (yielded) | 72.7 % | 9.1 | 9.1 | 9.1 | 0 | 0 |
| 5 (plain KO) | 54.5 % | 9.1 | 9.1 | 13.6 | 9.1 | 4.5 |
| 6 (loser had "all out") | 45.5 % | 9.1 | 9.1 | 18.2 | 9.1 | 9.1 |
| 8 (KO by a "kill" attacker) | 27.3 % | 9.1 | 9.1 | 27.3 | 9.1 | 18.2 |
| 12 | 0 | 0 | 9.1 | 9.1 | 9.1 | 72.7 |

Bandages item: if the fight changed the injury type, it is downgraded (Dead → Multiple injuries +4 weeks;
Multiple → Severe −2 weeks; anything else → healed) and one bandage consumed — **bandages can prevent death**.
Injured fighters start with reduced HP (§3). Recovery from Severe/Multiple has a 50 % chance of a permanent
wound trait (disfigurement, partial blindness → blindness, crippled, bum leg, concussion, missing fingers).
Killer trait goes to the non-beast last attacker of a slain gladiator; Dark Blade weapons "feed" on kills.

---------------------------------------------------------------------------------------------------

## 14. Beasts

Beasts are `ICombatant`s with raw stats (no age), class "Beast" (no class bonuses), no equipment (Minotaur
weapon only), and always fight with all their (equipped) techniques. `Beast(name, Str, Cun, price, HP, Ini)`.

| Beast | Str | Cun | Ini | HP | Price | Techniques | Traits / notes | Size |
|---|---|---|---|---|---|---|---|---|
| Wolf | 8 | 3 | 20 | 20 | 100 | Bite | carnivore | Normal |
| Random wolf | 5–9 (7–11) | 1–3 | 16–21 (17–22) | 15–20 (17) | 200 | Bite | (strong variant) | Normal |
| Dire wolf | 13 | 4 | 18 | 30 | 200 | Bite | Alpha | Normal |
| Lion | 12 | 4 | 17 | 25 | 250 | Maul | carnivore | Normal |
| Random lion | 10–14 | 3–6 | 13–20 | 18–25 | 200 | Maul or Bite | strong: +Swipe, SurvivalOfTheFittest, ThickHide | Normal |
| Bear | 15 | 3 | 12 | 38 | 350 | Maul | carnivore | Normal |
| Random bear | 15–19 (+5) | 2–5 (+2) | 7–12 (+5) | 30–39 (+10) | 300 | Maul | strong: +Swipe, Alpha, ThickHide | Normal |
| Crocodile | 13 | 4 | 4 | 50 | 350 | Bite | ThickHide, ColdBlooded | Large |
| Elephant | 21 | 7 | 4 | 120 | 900 | Maul, Headbutt | rider-fear at start; mountable | Huge |
| Random elephant | 16–19 | 5–8 | 2–5 | 80/90/100 | 700 | Maul, Headbutt | strong: +1000 XP, Charge, SurvivalOfTheFittest, ThickHide | Huge |
| Rhino (random) | 24–28 (+5) | 1–2 (+2) | 4–8 (+5) | 50/55 (+20) | 500 | Headbutt | ThickHide; strong: Charge, BestiaSummum | Large |
| White rhino | 25 (27) | 5 (7) | 9 (11) | 60 (70) | 2000 | Headbutt, Impale (+Maul) | ThickHide, FeralIntelligence | Large |
| Gorilla (random) | 22–26 (+5) | 4–7 (+2) | 4–9 (+5) | 45 (+10) | 400 | Warcry, Rampage | strong: Alpha, FeralIntelligence | Large |
| Harpy | 9 | 15 | 23 | 55 | 750 | Sneak Attack, Gouge | Mythical, Flying, Sneaky | Large |
| Stronger harpy | 18 | 27 | 36 | 90 | 750 | same | same | Large |
| Mandrake weak/reg/strong | 9/14/18 | 8/8/12 | 14/18/26 | 20/30/45 | – | Bite (+Smash, +Rally) | PoisonedClaws, LightningSpeed, Tough (+PoisonMaster, +Alert) | Normal |
| Gryphon | 12 | 10 | 22 | 75 | 750 | Hurricane, Bite | Mythical, Flying, FeralIntelligence; mountable | Titanic |
| Minotaur | 30 | 8 | 16 | 120 | 750 | Headbutt, Warcry | Mythical, Indomitable, ThickHide; Bipennis | Large |
| Cyclops | 30 | 8 | 16 | 120 | 750 | Rampage, Warcry | Mythical, Indomitable, ThickHide | Titanic |
| Cyclops boss | 120 | 24 | 44 | 1200 | 7500 | Rampage r4, Kick r4, Headbutt r4 | Mythical, Strong, ThickHide, Titan, PartiallyBlind, ShowMan, Impact, FeralIntelligence | Titanic |
| Medusa | 50 | 75 | 75 | 500 | 1000 | Pounce, Swipe, Sneak Attack, Execute | ThickHide, Killer, Carnivorous, BestiaSummum, Alpha, Preparation, SharpenedClaws, ShowMan, PoisonedClaws, PoisonMaster, Mythical; gaze trick | Large |
| Manticore (lvl 100) | 70 | 50 | 115 | 800 | 550 | Fireball, Impale | Mythical, Flying, Strong, Tough | Titanic |
| Hydra (lvl 120) | 75 | 20 | 25 | 1000 | 550 | Bite, Maul, Headbutt | ManyHeads, Mythical, Strong, Tough, Impact | Titanic |
| Lesser hydra (lvl 120) | 40 | 10 | 14 | 300 | 250 | Bite, Maul | ManyHeads, Mythical, Impact | Titanic |
| Wraith (lvl 150) | 80 | 60 | 70 | 450 | 7500 | Rally r4, Warcry r4, Thunderstrike r4 | Mythical, Intangible (+10 armor, +2 DR), Impact, FeralIntelligence, Tough, Devotion | Huge |
| Escaped beast (cheat) | wolf 8/3/17/15 · lion 10/5/14/20 · bear 16/4/8/40 · rhino 24/3/5/50 by opponents' level sum <4/<7/<10/≥10 | | | | | | temporary | |
"Of Diana" event beasts = random wolf/lion/bear + FeralIntelligence + SharpenedClaws. Diana ascension uses the
strong variants in adventures. (Trait stat effects such as Strong/ThickHide/FeralIntelligence are in the trait
catalogue.)

**Special behaviours**
- Beasts never surrender, cannot perform dirty tricks (except Medusa) and dirty tricks/Solar flash cannot
  target them (shield slam can). Nets get +3 vs beasts. Caltrops hurt beasts +2.
- **Medusa gaze**: a "trick" with cunning roll > 10 vs a non-beast → target STUNNED 2 (no resist).
- **Hydra (ManyHeads)**: TWO_HEADS below 75 % HP, THREE_HEADS below 25 %; each gives an extra weaponless attack
  per turn. [quirk/bug] `ToggleStatusEffect` lacks `break`s, so gaining TWO_HEADS applies, in sequence: Ini and
  Cun ×1.5, +maxHP/6 HP; then the *werewolf* block (Ini = 2Ini+5, Str = 2Str+15, maxHP ×1.5+5); then the
  THREE_HEADS block (Ini ×1.25, Cun ×4/3, +maxHP/5 HP); then the ENSNARED block (−3 Str, −3 Ini). A 75-Str
  Hydra jumps to ~162 Str, ~95 Ini, ~1505 max HP and heals ~470.
- **Werewolf** (Lycanthropy gladiator on a full-moon week, or Moonstone): transforms once when HP ≤ 10
  (WerewolfActive) or ≤ 50 % (Lycanthropy + Moonstone): WEREWOLF stat surge (werewolf + three-heads +
  ensnared blocks as above), helmet/armor/shield sundered and DISARM for the rest of the fight, ENRAGED 2,
  gains LifeSteal (30 %), heals maxHP/3; with Moonstone also +1 armor, +5 dodge, +5 accuracy.
- **Intangible** (Wraith): −90 % from non-piercing / −70 % from piercing hits unless it dealt damage on its last
  action.
- Carnivores (wolf, dire wolf, bear, lion) that win with a biggest hit > 14 have a 20 % chance to gain
  Carnivorous (LifeSteal).
- **Beast progression**: XP = battle XP (no class/age modifiers); fame `+XP/5` on a win, `XP/5 − 20` on a loss;
  skill points on level-ups at levels divisible by 3 plus extra on even levels / level 2.
- **Treats**: 10 denarii, once per week, +5 XP each. Weekly, if (treats > 2 and `rand(100)+treats > 100`) or
  treats ≥ 7 (9 in nightmare mode), and fame > 60 and not BestBoy → gains **GoodBoy** (+100 XP, +5 influence).
- Two un-tamed Alpha beasts in one ludus: weekly 50 % × 20 % chance that the lower-level one is mauled
  (injury roll with +5, +2 if already injured).

---------------------------------------------------------------------------------------------------

## 15. Mounts, war elephants, gryphons

Mount stats are ordinary equipment stats (Str/Ini/HP/block/reach). Every mount has **−6 Initiative** base.
| Mount | Shoddy | Old | Regular | Quality | MasterCrafted | Legendary |
|---|---|---|---|---|---|---|
| Numidian (Str/Block/HP/Reach) | – | 2/1/10/1 | 2/1/15/2 | 3/2/15/3 | 4/2/20/3 | 5/2/20/3 |
| Celtic | – | 1/1/25/0 | 1/2/30/1 | 2/3/35/2 | 3/4/35/2 | 4/4/40/2 |
| Elephant (+ extra Ini) | 10/3/20/4, Ini −10 | 15/4/25/4, −8 | 20/5/35/4, −8 | 25/5/45/4, −6 | 30/6/60/5 | 35/6/80/5 |
| Gryphon (+6 Ini cancels the −6, then +Ini shown) | 5/4/10/2, +5 | 8/5/15/2, +8 | 10/6/20/2, +10 | 15/6/25/3, +15 | 20/7/30/3, +20 | 25/7/35/3, +25 |
| Spectral steed (Reins) | 4/2/20/2 | | | | | |
Barded augment: +2 block, −2 Ini, +10 HP. Enbarr (legendary Celtic): +5 Ini, Magnificent, LightFooted.
Elephant mount from an owned elephant beast: quality by beast level (<5 Shoddy, 5 Old, 12 Regular, 25 Quality,
45 Legendary); augment +10 % of the beast's Str (Str ≥ 45 and best stat), Ini (≥30), Cun (≥36) or HP (≥220).
A Gryphon mount needs a "worthy" rider (score ≥ 3: Reincarnated +2, Mythical +2, +1 each for Adopted,
BeastTamer, Ascended, the god-champion traits, LifeBringer, WorldChampion).

Combat effects: reach feeds turn order (×5) and Hurricane/reach advantage; elephants frighten **enemy riders of
horses/gryphons** at battle start; Charge +d when mounted; caltrops ×2 on riders; EquesSlayer +30 % vs riders;
Cataphractoi (horse) +10 stun resist and +5 HP per armor point over 20; MasterHorseman adds mount block and Str
again; Parthian lvl‑2 doubles all mount bonuses; Reins on a mounted fighter +10 dodge, +5 bonus damage, +10 HP.

---------------------------------------------------------------------------------------------------

## 16. Gladiator classes

| Class | Preferred main | Preferred offhand | Main stat | Preferred techniques | Preferred traits |
|---|---|---|---|---|---|
| Murmillo | Gladius | Legionary shield | Str | Smash, Warcry, Decimate, Shield Bash, Sunder, Execute | Fanatic, Enforcer, Strong, TrueGrit, Indomitable |
| Sagittarius | Wooden bow | – | Ini | Hail of Arrows, Strike and Roll, Execute, Lunge, Feint | Alert, Agile, Underhanded, Hunter, LightningSpeed, Preparation, Marksman |
| Retiarius | Fuscina | Rete (net) | Cun | Disarm, Gouge, Cheap Shot, Lunge, Throw Sand | Preparation, ManOfGlass, Sneaky, Underdog, Tactician |
| Dimachaerus | Sica | Pugio (weapon) | Ini | Charge, Lunge, Feint, Kick, Strike and Roll, Parry | DualWield, Ambidextrous, ShowMan, Talented, Agile |
| Hoplomachus | Hasta | Hoplon shield | Health | Impale, Lunge, Warcry, Rally, Shield Bash, Decimate | Conditioning, ExoticFightingStyle, OneManArmy, Veteran, Alert |
| Barbarus | Securis | Wooden shield | Str | Warcry, Smash, Headbutt, Cleave, Charge, Rampage | Strong, AllIn, Tough, Fury, Fanatic, Temperamental |
| Cestarius | Cestus | – | Health | Uppercut, Kick, Headbutt, Charge, Strike and Roll | Pugilist, Strong, Conditioning, GlorySeeker, Impact, Tough, TrueGrit |
| Lorarius | Whip | – | Cun | Disarm, Kick, Cleave, Throw Sand, Gouge, Feint | Doctore, Lawbringer, Underhanded, Agile, QuickStudy, Loyal, Tactician |
| None | – | – | – | – | – |
(`getAvailableClasses` offers None, Barbarus, Hoplomachus, Murmillo, Retiarius, Dimachaerus; the others appear
via upgrades/other code paths.)

**Combat bonuses**: +3 weapon accuracy with the preferred main weapon type; +2 with the preferred offhand
(equipment type, or Pugio for Dimachaerus); preferred techniques +1 priority and ×1.1 damage. Auto-equip picks
the preferred main weapon type.

**Class proficiency ("specialization")** — gates experience, not combat:
`prof% = clamp(0..100, 15 × (#preferred techniques known + #preferred traits owned) + 10 + level + classLevel
+ 5 (origin's favourite class) − 5 (origin's disliked class) + 5 (best stat = class main stat))`.
All XP (training and combat) is multiplied by `prof%/100`; class None is always 100 %. Class level =
`floor(sqrt(classXP)) − 1`. Origin disliked classes: Gaul–Dimachaerus, Greek–Barbarus, Thracian–Retiarius,
Iberian–Murmillo, Punic–Barbarus, Roman–Barbarus, Briton–Hoplomachus, Egyptian–Murmillo, Parthian–Lorarius
(favourite-class switch is mangled in the decompile [uncertain]).

---------------------------------------------------------------------------------------------------

## 17. Weapon proficiency

Points per weapon family (sword, spear, dagger, axe, bow (+javelin), fist, whip). Tiers: Proficient 15,
Specialist 60, Master 150, Grandmaster 800. Bonus: weapon points +1/+2/+3/+5; accuracy 0/0/+5/+10.
Javelins use bow proficiency if bow ≥ spear points, else spear. Roman lvl‑2 adds **all** families' bonuses to
any weapon (main and offhand). [quirk] **Whip proficiency is tracked and displayed but never applied** in
`Combatant`. Battle gains: winner +2 main (+1 main, +1 offhand weapon if dual), loser +1 main; Roman +1 per
gain (offhand only 50 % of the time). Training gives more (see [03 §3.4](03-loop-progression.md)).

---------------------------------------------------------------------------------------------------

## 18. Origins (combat hooks)

| Origin | Always | Origin level 2 (level > 4 and fame > 800 unlocks level 1; level 2 elsewhere) |
|---|---|---|
| Gaul | +7 status resist (loyalty −1) | each non-lethal hit taken: +2 Str/Ini/Cun/maxHP (stacks) |
| Greek | +1 armor | crit roll + % of HP missing |
| Thracian | +25 % training | +1 weapon point (=+10 %) and +1 accuracy per attack, stacking |
| Iberian | +1 reach | "+50 % crit damage at full HP" — **not implemented** in combat [quirk] |
| Punic | +10 trait gain chance | +1 bonus damage per 2 traits |
| Roman | +1 proficiency per gain, loyalty +1 | all proficiencies stack on all weapons |
| Briton | +10 crit | heal 10 % max HP on crit |
| Egyptian | favour ×2 (+1 extra when favoured) | weapon points + favour (doubled on crit) |
| Parthian | bonus class mastery | doubles mount bonuses |
Origin level 2 also adds 500 + 5×(level×10 + fame/4) to the gladiator's worth (affects opponents' XP).

---------------------------------------------------------------------------------------------------

## 19. Trait → combat effect map (combat hooks only)

Resolved from `Trait.getCombatEffect` (fallback switch table):
Intangible, Flying, Duelist, ManEater, ColdBlooded, ExplosiveRelease, Deadeye, Cataphractoi→Cataphract,
Lycanthropy→Werewolf, ManyHeads, DeafeningCrackle→Crackle, Careful, Paranoid (no hook), CelestialChampion→Favoured,
FistsOfSteel, Pugilist, SpartanResolve→Resolve, Ruthless, Adventurous→FearResist, TitanicStrength, Hoplite,
BlindFighter→BlindMastery, Devotion & ApolloBlessing→Blessed, Marksman, PoisonedClaws→PoisonedWeapons, Mythical,
ShadowBlade→CriticalDamage, PiercingPrecision→Accuracy, AxialMomentum→Momentum, BladeWhisperer, Agile, BeastTamer,
GlorySeeker→Fame (no combat hook), Albino→PhotoPhobia, Alert, Temperamental, Indomitable, Carnivorous→LifeSteal,
Impact, Pyromaniac, MasterHorseman, AllIn, Ambidextrous, Bestiarii, BestiaSummum, Blind, ColossusSlayer→GiantSlayer,
DualWield, HorribleDisfigurement→CausesFear, Inspiring, LightningSpeed, Mithridatism→PoisonResistance, OneManArmy,
PoisonMaster, Preparation & SelfPreservation→Block, SharpenedClaws→ArmorPiercing, ShowMan, ThickHide & Tough→Tough,
EquesSlayer, Psychopath→Demoralizing; Sword/Spear/Dagger/Axe Specialist & Master map to effects that the engine
never reads (legacy, migrated into proficiency points). Each effect's mechanics are described in §§3–12.

---------------------------------------------------------------------------------------------------

## 20. Team battles

- Up to **3 fighters per side** (first/second/third slots); Mandrake summons and escaped-beast cheats can add a
  4th. Every turn each fighter picks its own target (§5.4); multi-target techniques (Cleave, Swipe, Hurricane,
  Warcry, Hail of Arrows, Thunderstrike, Throw Sand chain, Execute chain) gain priority with more enemies.
- Team-only mechanics: OneManArmy (outnumbered), Inspiring (+teammates), Psychopath (−teammates), Hoplite
  (+team armor/Str), Rally (team cleanse + block), smart targeting focus-fires the weakest enemy.
- Victory requires eliminating every enemy fighter; at time-out the side with more standing fighters wins.
- Archers: free opening volley plus EVADING in round 1, Hail of Arrows random targets, shield bearers get +2
  armor vs bows (+ attacker reach if shielded) and bow hits lose 5 accuracy vs shields.

---------------------------------------------------------------------------------------------------

## 21. Fight instructions

| Instruction (UI short text) | Stat change | Own injury risk | KO bonus inflicted on victim | Other |
|---|---|---|---|---|
| Default ("good luck") | – | 0 | 0 | special surrender rule (§12.2) |
| AllOut ("go all out!") | Ini +1, Cun −1 | +1 | +1 | knockout resistance (§7.8); no surrender |
| Kill ("kill them") | Ini +1, Cun −1 | +1 | +3 (attacker above half HP) / +2 | no surrender |
| Care ("avoid injury") | Cun +1 | −1 | −1 | yields at 10–24 % |
| Throw ("lose fight") | – | −2 | −1 | yields at 20–49 % |
`null` (AI default) = no stat change and no instruction surrender. The "instruction ignored" message exists but
the success flags are never set to false anywhere → instructions are always obeyed [dead code].
AI opponents in tournaments: if the player's team is much stronger (`playerScoreDiff > 80`) they choose Care
(or Throw if the gap > 120, opinion > 70 and a coin flip); otherwise opinion > 60 → 50 % Care; opinion < 50 and
a coin flip → Kill if `rand(opinion) < 5`, AllOut if `rand(opinion) < 15`. Non-AI rivals: Care.

---------------------------------------------------------------------------------------------------

## 22. Rewards after battle

- **XP**: winner `min(250, Σloser worth × 40 / Σwinner worth + 10)`, loser `Σwinner worth × 20 / Σloser worth +
  10` (min 1). Gladiators: ×1.25 QuickStudy, ×age XP modifier, ×class proficiency %. Worth (gladiator) =
  `level×10 + fame/4 + 5×traits + 10 − 25 (Crippled/BumLeg/Blind) (+origin‑2 bonus)`; beast worth
  `0.7×(I+S+C+H/4) + 4×(traits + 2×techniques (+5 Mythical)) + fame/5`.
- **Levels**: total XP for level L = `50×(L−1)×L` (100, 300, 600, 1000, 1500…). Each level +1 attribute point;
  every 3rd level +1 skill point (start with 1).
- **Fame**: winner `+XP/9` (+1 GlorySeeker/Freedom) + gear "Magnificent" bonuses (+2 per piece, −2 for a
  Sponsored item) (+3 Carthage set); loser `(XP − 125)/5` — usually a loss of ~15–20 fame, a gain only when
  losing to a much stronger team. Minimum fame 1.
- **Loyalty**: +2 win, −2 loss.
- **Trait unlocks** (winners): SuddenDeath (one-hit KO from full HP), DualWield (`rand(100)+RomanBonus > 96`
  while dual wielding), Power Throw/ExplosiveRelease (javelin, `rand(100)+C > 105`), Giant→Titan (beat a
  giant-type), Underhanded (caused Blind + Stun + Disarm in one fight), CelestialChampion (favour > 3),
  BlindFighter (fought blinded or was blinded 1v1; 1/30, 2/30 if Blind), Pugilist (fists, biggest hit > 15, 1/60),
  Impact (biggest hit > 39), Cataphractoi (player, horse, max HP > 40, armor > 20, 50 %), Carnivorous (beasts).
  Losers: Arrogant removed when knocked out. Killer to the killer. Mysterious Egg: 10 % per fight (5 % if lost)
  to advance hatching into a Gryphon.
- Hand of Midas: logs scattered coins `rand(2F + 25 + fame/200)` (winner) / `rand(F+10)` (loser) (not in event
  battles). No denarii credit was found in the battle code — it may be log-only [uncertain].

---------------------------------------------------------------------------------------------------

## 23. Cheats, difficulty and ascension hooks

| Hook | Effect on combat |
|---|---|
| Poisoned weapons bribe | all own gladiators PoisonedWeapons; 30/gladiator (20 underground), ×2 at Minerva (5+) |
| Chains bribe ("enchain opponents") | opposing gladiators CHAINED (−⅔ Ini); 20 (15 underground) each, ×2 Minerva |
| Release wild beast | adds an escaped beast (temporary) to own side (team ≤2); 80 (×2 Minerva, ÷2 senator influence) |
| Replace guards | 25; prevents the opponent's cheat |
| Pluto (8+) | player side +1 injury roll when losing |
| Cronus (16) | player's team starts with TIME_CURSE in tournaments (all techniques on cooldown) |
| Diana (7+) | stronger beast variants (adventures/events) |
| Sol/Jupiter/Mars/Apollo… | stronger opponents/XP for rebels etc. (outside the engine) |
| Nightmare mode | GoodBoy needs 9 treats instead of 7; various AI aggressiveness |

---------------------------------------------------------------------------------------------------

## 24. RNG usage

`java.util.Random`, unseeded by default (a seeded constructor exists but no caller uses it). The battle RNG is
shared by all combatants (`setRandom`) for hit/crit rolls, status rolls, tricks, targeting, surrender and
post-battle trait rolls. Separate unseeded RNGs: `InjuryFactory` (injury roll), Hail of Arrows and Parry
(`new Random()` per use), the technique-priority comparator tie-break (random comparator — technically violates
the `Comparator` contract [quirk]). Typical roll sizes: hit `rand(30)`, crit `rand(30)`, volley `rand(15)`,
stun/sunder `rand(15)`, disarm/blind `rand(10)`, bleed `rand(20)` both sides, fear `rand(50)`, surrender
`rand(30)`, injury `rand(11)`.

---------------------------------------------------------------------------------------------------

## 25. Quirks, bugs and uncertainties (summary)

1. Missing `break`s in `ToggleStatusEffect`: TWO_HEADS also applies werewolf + three-heads + ensnared stat
   changes; WEREWOLF also applies three-heads + ensnared; THREE_HEADS also ensnared (−3 Str/Ini).
2. Crits only re-add *bonus damage* (B) rather than Strength in normal attacks.
3. Hit totals of 31–39 are bumped to 45 (better than 40–44, which can glance after −5 modifiers).
4. One successful dirty trick per *battle*, shared by both sides; trick turns skip the net throw and Hydra checks.
5. Opening bow volley checks enemies #2/#3 but always shoots the primary target.
6. Achilles' Spear adds +10 % crit damage every attack (unbounded) when Str > 60.
7. Pilum lowers the target's armor by the *attacker's* armor/4 on each weapon hit.
8. TwoHandedOnly weapons receive the +10 crit bonus twice.
9. Iberian advanced origin effect, whip proficiency, Paranoid and the Sword/Spear/Dagger Master/Specialist
   combat effects have no combat implementation.
10. Medusa/Cyclops battle armor and the Cyclops amulet are discarded by `Beast.AsCombatant`.
11. Crowd-decision score includes Magnificent fame only for the first side.
12. `getArmorReductionText` shows `A/(A+5)` while the engine uses `A/√(A²+900)`.
13. "Instruction ignored" can never trigger (flags never cleared).
14. Sunder's eligibility test checks the helmet twice and never the armor; Shield Bash counts Momentum twice;
    Sunder counts favour twice.
15. Psychopath's "Demoralizing" hits *own* teammates (may be intentional flavour).
16. [uncertain] `Origins.favouriteClass` switch body is lost in the decompile (returns Sagittarius by default).
