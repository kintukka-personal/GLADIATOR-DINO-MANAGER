# Jurassic Ludus — Design Specification

*Jurassic Ludus* is our own take on **Gladiator Manager** (Renegade Games), with dinosaurs in place of
gladiators and a full **ARK: Survival Evolved**-style breeding system on top.

The rule for every system: **keep Gladiator Manager's mechanic and numbers, change the fiction.**
The teardown in [`../docs/gladiator-manager-analysis/`](../docs/gladiator-manager-analysis/README.md) is the
reference for every formula. Where this document is silent, follow the teardown exactly, renamed per the
tables below. Known Gladiator Manager bugs (the `[quirk]` items) are **fixed** in our version unless this
document says otherwise (e.g. Bath House benefits apply, assassination uses the right house, Iberian-style
advanced bonuses are implemented, item prices respect opinion, reward fall-throughs are fixed).

---

## 1. Premise

Capua, 73 BC. Rome never lost the great saurians: they were bred in the hills of Thrace and the swamps of
Egypt and shipped to the arenas. You arrive in Capua after "an incident in your hometown" and found a modest
**ludus**: a dinosaur fighting school. You buy, breed, raise, train and fight **dinos** (and prehistoric
**beasts**), run an estate, scheme against rival houses, climb the Senate and survive the uprising of
**Spartacus**, a Thracian Allosaurus who escapes Batiatus and leads a **Wild Horde** of escaped dinos.

Tone: darkly comic Roman, as in the original. One turn = one **week**.

## 2. Terminology map

| Gladiator Manager | Jurassic Ludus | Notes |
|---|---|---|
| Gladiator | **Dino** | The trainable, equippable fighter. `kind: 'dino'` |
| Beast | **Beast** | Prehistoric mammals/reptiles + mythic monsters. `kind: 'beast'`. No gear, no class, never surrender |
| Origin (Gaul, Roman…) | **Species** | Each species carries the origin's basic + advanced (level 2) bonus |
| Origin level 2 via Whispering Sand | **Species level 2** via **Amber Shard** | "Ancestral memory sealed in amber" |
| Strength / Initiative / Cunning / Health | **Strength / Agility / Cunning / Health** | `str / agi / cun / hp`. 1 point = +1 (HP +5) |
| Loyalty | **Tameness** | 0–100, starts 80; low tameness → breakouts. Internally `loyalty` |
| Slaves | **Keepers** | Hired hands. Market 2–4/wk at 80/100/120. Upkeep 2 (4 beyond beds) |
| Mining / Entertainment / Security / Spies | **Miners / Showmen / Wardens / Spies** | Same formulas |
| Escaped slaves (rebel army count) | **Ferals** | Unnamed wild dinos & beasts that join the Horde |
| Rebel army / rogue gladiators | **Wild Horde** / **rogue dinos** | Led by Spartacus |
| Plundered gold | **Spoils** | |
| Bandages | **Healing Poultice** | |
| Doctore | **Doctore** (kept) | A veteran dino who drills the pack |
| Adoption / Adopted | **Bonding** / **Bonded** | One bonded dino at a time; can wear the Champion's Crest |
| Rudis / Freedom | **Release** / **Released** | Famous dinos ask to be released to the wild |
| Gems (premium) | **Amber** (meta) | Earned only from achievements; buys permanent unlocks. No real money anywhere |
| Mount slot (horses) | **Rider** slot | Human riders on saddles (Numidian Lancer…); needs **Saddlery** |
| Stables | **Saddlery** | |
| Medicus | **Veterinarium** | Surgery, fewer training injuries |
| Wall | **Palisade** | |
| Blacksmith | **Forge** | |
| Pankration (unarmed) | **Primal Bout** | No gear at all |
| Iunior Victores (under 17) | **Hatchling Games** | Juveniles and adolescents only |
| Werewolf / Lycanthropy | **Moon Frenzy** | Full-moon berserk "Alpha" transformation |
| Gryphon (egg) | **Wyvern** (Mysterious Egg) | |
| Whispering Sand | **Amber Shard** | |
| Theokoles | **Theokoles**, albino Tyrannosaurus | |
| Gigantus | **Gigantus**, young Giganotosaurus | Vettius' giant |

Rival houses, gods, Senate, Capua/Ariminium/Rome, tournaments, leagues and Ascension keep their names.

## 3. Creatures

### 3.1 Stats: base + wild + domestic (ARK model on GM leveling)

A creature's raw stat is:

```
raw(stat) = round( (speciesBase[stat] + wild[stat]·inc[stat]) × (1 + 0.2·imprint) )
            + dom[stat]·inc[stat] + bonus[stat]
inc = { str: 1, agi: 1, cun: 1, hp: 5 }
```

- **Wild points** (`genes.wild`) are genetic. They are rolled when a wild-caught creature is generated and
  **inherited** by offspring (§4). Shown as **Wild Lv = 1 + Σ wild points** (ARK style).
- **Domestic points** (`dom`) come from GM leveling: XP level L via `50·L·(L−1)`, +1 stat point per level,
  +1 technique point every 3rd level. Never inherited.
- **Bonus** holds permanent changes from traits (GM applies trait stats when the trait is gained), events,
  class level-ups and reincarnation.
- **Imprint** (0–1, bred creatures only) multiplies the base+wild part by up to +20% (ARK).
- Age multipliers (GM table) apply on read, exactly as GM (`getStrength` etc.). Beasts ignore age.
- Minimums: STR/AGI/CUN ≥ 1, HP ≥ 5. Wild points per stat cap at 255 (ARK).

### 3.2 Life stages and age

- `maturity` 0→1 for bred creatures; hatchlings mature at `1/matureWeeks` per week. Market creatures are
  generated adult (or nearly).
- **Equivalent age** feeds the GM age table: `eqAge = 18·maturity` while maturing; after maturity
  `eqAge = 18 + adultWeeks/52`, and `adultWeeks` grows 1 per week plus 50% chance of +1 (always +2 at
  Ascension ≥ 1), exactly GM's aging.
- Stages: **Baby** (maturity < 0.1), **Juvenile** (< 0.5), **Adolescent** (< 1), **Adult**. Then by eqAge:
  Prime (18–27), Veteran (28–39), Old (40+).
- GM rules by eqAge: can't fight below 8 (babies/young juveniles), "kid" below 15 (no rider, Hatchling Games
  only), Hatchling Games accept eqAge < 17, "old" above 49.

### 3.3 Species (dinos)

`base` is STR/AGI/CUN/HP at 0 wild points. `w` = weights used to distribute wild points at generation.
Bonuses map GM origins 1:1 where noted. "Fav/Dis" = favoured/disliked class (+5/−5 class proficiency).

| Species | Body | Size | Base | Weights s/a/c/h | Basic bonus | Advanced (species lv 2) | Fav / Dis | Diet | Egg | Incub. (wk) | Temp °C | Mature (wk) | Mate CD | Kibble |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Velociraptor | raptor | S | 2/5/4/15 | 2/4/3/2 | +25% training XP (Thracian) | +1 weapon pt & +1 acc per attack, stacking | Slasher / Phalanx | carn | small | 1 | 24–32 | 6 | 2 | simple |
| Dilophosaurus | raptor | S | 2/4/5/15 | 2/3/4/2 | +1 reach (Iberian) | +50% crit damage at full HP | Spitter / Bulwark | carn | small | 1 | 26–34 | 6 | 2 | simple |
| Troodon | raptor | S | 1/4/6/12 | 1/3/5/2 | +10 trait-gain chance (Punic) | +1 bonus damage per 2 traits | Snarer / Brute | carn | small | 1 | 22–30 | 5 | 2 | simple |
| Allosaurus | theropod | M | 4/4/3/22 | 4/3/2/3 | +10% damage vs targets < 50% HP | Heal 15% max HP on a knockout | Brute / Lasher | carn | medium | 2 | 24–32 | 10 | 3 | regular |
| Carnotaurus | theropod | M | 4/5/2/20 | 4/4/1/2 | Charge +25% damage; +3 accuracy in round 1 | First landed hit each battle is a critical | Phalanx / Snarer | carn | medium | 2 | 26–34 | 9 | 3 | regular |
| Tyrannosaurus | theropod | L | 6/2/3/30 | 5/2/2/4 | +10 crit (Briton) | Heal 10% max HP on crit | Brute / Spitter | carn | large | 3 | 28–36 | 16 | 4 | superior |
| Spinosaurus | spino | L | 5/3/3/28 | 4/2/3/4 | Favour ×2 (Egyptian) | Favour added to weapon damage (×2 crit) | Snarer / Bulwark | carn | large | 3 | 30–38 | 15 | 4 | superior |
| Triceratops | ceratops | L | 5/2/2/30 | 4/2/2/5 | +7 status resist (Gaul) | +2 STR/AGI/CUN/maxHP per hit taken | Phalanx / Slasher | herb | large | 3 | 22–30 | 14 | 4 | superior |
| Ankylosaurus | ankylo | L | 3/1/2/32 | 3/1/2/6 | +1 armor (Greek) | Crit chance + % of HP missing | Bulwark / Spitter | herb | large | 3 | 20–28 | 14 | 4 | superior |
| Stegosaurus | stego | L | 4/1/2/30 | 4/1/2/5 | Tail (off-hand weapon) attacks have no −10 penalty | Off-hand weapon hits inflict Bleed | Brute / Spitter | herb | large | 3 | 22–30 | 13 | 4 | superior |
| Iguanodon | hadro | M | 3/3/3/24 | 3/3/3/3 | +1 tameness/week; +1 proficiency per gain (Roman) | Every weapon proficiency applies to every weapon | Bulwark / Brute | herb | medium | 2 | 20–28 | 10 | 3 | regular |
| Parasaurolophus | hadro | M | 2/4/4/22 | 2/4/4/3 | Bonus class mastery XP (Parthian) | Rider bonuses ×2 | Spitter / Lasher | herb | medium | 2 | 20–28 | 9 | 3 | regular |
| Pachycephalosaurus | pachy | M | 3/3/2/22 | 4/3/2/3 | Headbutt/Stomp/Charge stun power +5; stun resist +5 | Immune to stun | Brawler / Snarer | herb | small | 1 | 22–30 | 8 | 2 | simple |
| Therizinosaurus | theriz | L | 4/3/3/26 | 4/2/3/4 | Claw weapons +1 weapon point | Bleed on every crit | Slasher / Phalanx | herb | large | 3 | 24–32 | 13 | 4 | superior |
| Brachiosaurus | sauropod | H | 5/1/2/40 | 4/1/1/8 | +1 reach, +10 max HP | Start of battle: fear check on all enemies (STR/4 + HP/10 + 10) | Lasher / Slasher | herb | xlarge | 4 | 26–34 | 22 | 6 | exceptional |
| Giganotosaurus | theropod | H | 7/2/2/36 | 6/2/1/5 | +15% damage | Start of battle: fear check on all enemies | Brute / Spitter | carn | xlarge | 4 | 30–38 | 20 | 6 | exceptional |

Giganotosaurus is rare (bosses, Gigantus, Epic rolls after week 60). Brachiosaurus and Tyrannosaurus are
Epic-only in the market before week 30.

Size: S small, M medium, L large, H huge. Large and huge creatures count as **Giant** for Giant Slayer and
the Giant→Titan rules. Riders: eqAge ≥ 15, any size.

### 3.4 Beasts

Beasts use the GM beast stats (as base + wild points that sum to the GM numbers), GM beast techniques,
never surrender, get treats/Good Boy/Alpha rules. Mammals **gestate** (live birth, twins/triplets possible);
reptiles and birds lay eggs.

| Beast | Replaces | STR/CUN/AGI/HP | Price | Techniques | Notes | Repro | Upgrade |
|---|---|---|---|---|---|---|---|
| Dire Wolf | Wolf | 8/3/20/20 | 100 | Bite | carnivore | gestation 2 wk | – |
| Alpha Dire Wolf | Dire wolf | 13/4/18/30 | 200 | Bite | Alpha | gestation 2 | – |
| Sabertooth | Lion | 12/4/17/25 | 250 | Maul | carnivore | gestation 3 | – |
| Dire Bear | Bear | 15/3/12/38 | 350 | Maul | carnivore | gestation 3 | – |
| Sarcosuchus | Crocodile | 13/4/4/50 | 350 | Bite | ThickHide, ColdBlooded | egg | – |
| Terror Bird | (new) | 9/3/22/18 | 150 | Bite, Pounce | fast | egg | – |
| Woolly Rhino | Rhino | 26/2/6/52 | 500 | Headbutt | ThickHide | gestation 4 | Woolly Rhinos |
| Mammoth | Elephant | 18/6/3/90 | 700 | Maul, Headbutt | frightens riders | gestation 5 | War Mammoths |
| Gigantopithecus | Gorilla | 24/5/6/45 | 400 | Roar, Rampage | | gestation 4 | – |

Mythic (event/boss only, not breedable): Harpy, Minotaur, Medusa, Cyclops (+boss), Manticore, Hydra,
Lesser Hydra, Wraith, Mandrake, **Wyvern** (replaces Gryphon; hatches from the Mysterious Egg; knows
Hurricane and Fireball). Use the GM stat lines.

Week 1 market always offers the starters (GM's three legends, now dinos) and the dire wolf pup **Aello**
(AGI 20, Sharpened Claws, 100 denarii):

| Starter | Species | STR/CUN/AGI/HP | Trait | Price |
|---|---|---|---|---|
| Tetraites | Carnotaurus | 8/5/5/30 | Agile | 350 |
| Carpophorus | Troodon | 7/8/5/30 | Beast Tamer | 400 |
| Flamma | Velociraptor | 7/6/5/30 | Glory Seeker | 300 |

(For starters, wild points are back-solved so the raw stats match.)

## 4. Breeding (ARK: Survival Evolved)

The headline addition. Everything below is modelled on ARK's breeding rules, with ARK's real-time hours
compressed into weeks.

### 4.1 Mating
- Two **adult** creatures of the **same species** and **opposite sex**, both owned, healthy (no injury
  > 1 week), not on an adventure, not Sterile. The female must have **mating cooldown 0**. Mythic beasts
  cannot breed.
- Pairs are assigned in the **Breeding Pen** (building; level 1/2/3 = 1/2/4 pairs). A paired female does
  not fight that week ("mating"); the male can.
- At week resolution a pair mates (always succeeds, as in ARK once the bar fills). Then:
  - **Egg-layers**: the female lays a **fertilized egg** into the Hatchery. Its genetics (§4.3) are rolled
    at laying.
  - **Live-bearers** (mammal beasts): the female becomes **pregnant** for the species' gestation weeks and
    cannot fight. Then she gives birth.
- Female **mating cooldown** = species `mateCooldown` weeks (Fertile trait halves it). Males: none. For
  live-bearers the cooldown only counts down after the birth (ARK's mating interval).
- The pair stays assigned until removed; each eligible week produces another egg.
- **Unfertilized eggs**: an adult female not in a pair lays an unfertilized egg with 25% chance per week
  (ARK egg-laying). Used for kibble (§4.7) or sold (small 10, medium 25, large 60, xlarge 150).

### 4.2 Inheritance (per offspring)
- **Sex**: 50/50.
- **Each stat's wild points**: taken from the parent with the **higher** value with **55%**, the lower with
  **45%** (ARK). Domestic points, imprint and traits' stat bonuses are never inherited.
- **Colors**: each of the 6 color regions comes from a random parent (50/50).
- **Heritable traits** (marked in the trait table, e.g. Strong, Giant, Albino, Tough, Fertile, Moon Frenzy):
  each one a parent has is passed on with 30% (55% if both parents have it), at most 3.
- **Mutation counters**: `mutMatri = mother.mutMatri + mother.mutPatri`, `mutPatri = father.mutMatri +
  father.mutPatri` (ARK).
- **Generation** = max(parents) + 1. Parents' ids/names are recorded; the game keeps an **ancestry
  registry** so pedigrees survive deaths and sales.

### 4.3 Mutations (exact ARK rules)
- Every offspring gets **3 independent mutation rolls**, each **2.5%**.
- Each roll picks a random parent (50/50). If that parent's total mutations (matri + patri) is **≥ 20**, the
  roll cannot mutate (ARK's mutation limit), otherwise it rolls 2.5%.
- On a mutation: pick a random stat; the offspring takes **that parent's** wild value for it, then gets
  **+2 wild points**. One random color region changes to a random color. The counter on that parent's side
  (+1 patrilineal from the father, +1 matrilineal from the mother) increases.
- At least one mutation ≈ 7.31%. Three in one baby is possible.
- The UI shows each mutation (stat, side) and both counters, so players can run ARK's "clean female /
  mutated male" stacking strategy.
- Mutations are recorded in `genes.mutations` and accumulated per stat in `genes.mutatedPoints` for display.
- Wild points above 255 overflow to 0 (ARK quirk, kept as flavour; unreachable in normal play).

### 4.4 Incubation (eggs)
- Eggs sit in the **Hatchery** (building). Without one, only 1 egg can be kept (in a nest of straw) at
  ambient temperature.
- Each egg has the species' ideal temperature range and needs `incubWeeks` weeks in range.
- **Ambient temperature** per week follows Capua's seasons: `T = 21 + 9·sin(2π·(week−13)/52) + rand(−4..4)`
  °C (week 1 is early spring). Eggs outside their range lose health; at 0 the egg dies.
- **Hatchery level** shifts each egg's temperature toward its ideal by up to ±6 / ±12 / ±∞ °C
  (L1/L2/L3), at a brazier/shade cost of 3 denarii per egg per week. Capacity 2/4/8 eggs.
- In range: +1 week of incubation, egg health +0.1 (max 1). Out of range by d °C: health −0.08·d,
  no progress.
- When incubation completes the egg hatches into a **baby** (maturity 0) in the Nursery.
- Fertilized eggs can also be bought (market, events) and sold (worth based on genetics).
  Market eggs hide their genetics unless you have ≥ 3 committed spies (then the parents' quality is shown).

### 4.5 Gestation (live birth)
- Pregnant females carry the litter's pre-rolled genetics. At term: **twins with 5%**, **triplets with 1%**
  (ARK; each baby rolls its own inheritance and mutations). Babies go to the Nursery.

### 4.6 Maturation and imprinting
- Babies need a **Nursery** slot (Nursery level 0/1/2/3 = 1/3/6/10 babies; juveniles and older don't use a
  slot). Over capacity, each unhoused baby has a 15% weekly death chance.
- Babies and juveniles eat each week: 1 food of their diet (carnivores Raw Meat, herbivores Mejoberries)
  from the Pantry; if missing it is bought automatically at the Provisions price; if you can't pay, the
  baby goes hungry: no maturation that week and a 25% death chance (ARK starvation).
- Maturity grows `1/matureWeeks` per week. Stages: Baby → Juvenile (10%) → Adolescent (50%) → Adult.
- **Imprinting** (ARK): starting the week after hatching, the baby makes one **care request** per week
  until adult: **Cuddle**, **Walk**, or **Feed X** (a specific food or kibble: carnivores Raw Meat / Prime
  Meat / their kibble; herbivores Mejoberries / their kibble). The player fulfils it on the Nursery screen
  before advancing (Feed consumes the item). Each fulfilled request adds `1/matureWeeks` imprint (so every
  request must be met for 100%). A missed request is gone, as in ARK.
- **Imprint effects**:
  - +20% × imprint to the base+wild part of every stat (ARK's 20%).
  - **Rider bonus**: with a rider from your ludus, +30% × imprint damage dealt and damage resisted (ARK's
    imprinter rider bonus).
  - Tameness: newborns start at 70 + 30 × imprint (recomputed on maturity), and imprint ≥ 50% gives +1
    tameness/week, 100% gives +2.
- Bred creatures start at XP level 1 with no techniques except their species' natural one and get one free
  technique point; their first 1–2 traits come from inheritance (§4.2) plus a 50% chance of one random
  trait.

### 4.7 Food, kibble and the Pantry
- Foods: **Raw Meat** (8), **Prime Meat** (25), **Mejoberries** (5), and the ARK kibble tiers **Simple**,
  **Regular**, **Superior**, **Exceptional**, **Extraordinary** (market 40/70/120/200/350).
- **Kitchen** (building) crafts kibble: 1 unfertilized egg of the matching size (small→Simple,
  medium→Regular, large→Superior, xlarge→Exceptional, mythic→Extraordinary) + 1 Raw Meat or Mejoberries +
  10 denarii.
- Each species prefers one kibble tier (table §3.3). Kibble is used for imprint Feed requests and as
  **Taming kibble** for *Wild Capture* adventures (ARK taming: better kibble → higher taming effectiveness →
  up to +50% bonus wild points on the captured creature).

### 4.8 Mate Boost
- ARK's mate boost: in a battle, an adult male and female of the same species on the same side are
  **Mate Boosted**: each takes 33% less damage while both stand.

### 4.9 Rivals and breeding
- AI rivals with a same-species adult pair breed too: every 8 weeks (Hard 6), 50% chance, producing an
  offspring by the same inheritance and mutation rules, raised off-screen (it appears as a juvenile).
- The market occasionally sells fertilized eggs and **stud services** (event: pay to mate your female with
  a famous rival male).

## 5. Combat

GM's engine ([01-combat](../docs/gladiator-manager-analysis/01-combat.md)) unchanged in its math.
6 rounds (8 for events), up to 3v3, initiative `AGI + 5×reach + favour`, hit total
`45 + rand(30) + 1.5×(A − 7/12·targetA) …`, armor `A/√(A²+900)`, 1 dirty trick per battle, surrender by
instruction & tameness, injuries and death by `rand(11)+m`. Additions: Mate Boost (§4.8), imprint rider
bonus (§4.6), species bonuses (§3.3), size-based Giant rules.

**Instructions**: Default ("Good luck"), All Out, Kill, Avoid Injury (Care), Throw.
**Dirty tricks** (Cunning): enrage, tear harness (disarm), blind (kick dust in the eyes).

### 5.1 Techniques (GM id → name)
| GM | Jurassic Ludus | | GM | Jurassic Ludus |
|---|---|---|---|---|
| Smash | Crushing Bite | | Cleave | Tail Swipe |
| Kick | Stomp | | Execute | Killing Bite |
| Lunge | Lunge | | StrikeAndRoll | Hit and Run |
| Sunder | Rend | | CheapShot | Low Blow |
| ThrowSand | Kick Dust | | ShieldBash | Frill Bash |
| Parry | Counter | | HailOfArrows | Venom Barrage |
| Headbutt | Headbutt | | Impale | Impale |
| Feint | Feint | | Uppercut | Jaw Crunch |
| Charge | Charge | | Thunderstrike | Thunderstrike |
| Decimate | Gore | | Fireball | Fireball |
| Gouge | Eye Rake | | Hurricane | Hurricane |
| Rally | Rallying Call | | Maul / Swipe / Bite / Pounce | same (beast) |
| Disarm | Tear Harness | | SneakAttack | Ambush |
| Rampage | Rampage | | | |
| Warcry | Roar | | | |

### 5.2 Classes (fighting styles)
| GM class | Style | Main weapon | Off-hand | Main stat | Upgrade |
|---|---|---|---|---|---|
| Murmillo | **Bulwark** | Talon Blades | Frill Guard | STR | – |
| Sagittarius | **Spitter** | Venom Spitter | – | AGI | Venom Barrage |
| Retiarius | **Snarer** | Trident Horns | Bola Rig | CUN | – |
| Dimachaerus | **Slasher** | Sickle Claws | Fang Caps (weapon) | AGI | – |
| Hoplomachus | **Phalanx** | Horn Lance | Bash Plate | HP | – |
| Barbarus | **Brute** | Tail Club | Hide Shield | STR | – |
| Cestarius | **Brawler** | Iron Jaws | – | HP | Brawlers |
| Lorarius | **Lasher** | Barbed Tail-Whip | – | CUN | Lashers |

Preferred techniques and traits per class: GM's lists, renamed.

## 6. Equipment ("battle harness")

Same slots, stats, worth and quality ladder (Shoddy, Old, Regular, Quality, Master-crafted, Legendary) as GM.
Weapon families: **Claw** (sword), **Fang** (dagger), **Horn** (spear), **Mace** (axe), **Spit** (bow/javelin),
**Jaw** (fist), **Whip**.

| GM | Jurassic Ludus | | GM | Jurassic Ludus |
|---|---|---|---|---|
| Pugio | Fang Caps | | Wooden Shield | Hide Shield |
| Parazonium | Venom Fangs | | Caetra | Strapped Buckler |
| Gladius | Talon Blades | | Legionary Scutum | Frill Guard |
| Spatha | Great Talons | | Centurion Scutum | Bronze Frill Guard |
| Xiphos | Parrying Spurs | | Hoplon | Bash Plate |
| Sica | Sickle Claws | | Rete | Bola Rig |
| Khopesh | Hook Claws | | Galerus | Light Harness |
| Falcata | Scythe Claws | | Cloak | Camouflage Hide |
| Securis | Tail Club | | Leather Armor | Studded Barding |
| Bipennis | Ankylo Hammer | | Linthorax | Quilted Barding |
| Palm Axe | Obsidian Crusher | | Cuirass | Bronze Barding |
| Hasta | Horn Lance | | Segmentata | Legion Barding |
| Dory | Bronze Horn | | Cataphract | Cataphract Barding |
| Fuscina | Trident Horns | | Hood | Hunter's Hood |
| Pilum | Spine Darts | | Bronze Helmet | Bronze Muzzle |
| Wooden Bow | Venom Spitter | | Galeo | Legion Faceplate |
| Cestus | Iron Jaws | | Carthaginian | Carthaginian Crest |
| Leather Whip | Barbed Tail-Whip | | Gallic | Horned Helm |
| Numidian horse | Numidian Lancer (rider) | | Corinthian | Corinthian Visor |
| Celtic horse | Celtic Spearman (rider) | | Aquarius | Champion's Crest |
| Reins | Spectral Saddle | | Tigris Helmet | Tigris Skull |
| Enbarr | Lugh of Hibernia (legendary rider) | | Bandages | Healing Poultice |
| Antidote | Antivenom | | Jupiter Amulet | Eagle-Eye Charm |
| Neptune Amulet | Neptune Charm | | Lucky Ring | Lucky Tooth |
| Sandals | Grip Wraps | | Greaves | Leg Plates |
| Tome of Traits | Bestiary Scroll | | Whispering Sand | Amber Shard |

Egyptian (Palm Axe) bonus → Spinosaurus; Punic/Iberian (Falcata) bonus → Therizinosaurus/Dilophosaurus;
Carthaginian gear Punic bonus → Troodon; Roman Conquest → Iguanodon. Legendary relics keep their names
(Libertas, Crocea Mors, Achilles' Spear (horn), Black Death (crusher), Dark Blade → **Dark Fangs**, …).

## 7. Estate

GM's 17 buildings (renamed where listed above; Bath House benefits now apply) plus breeding buildings in
Capua:

| Building | Lv1 | Lv2 | Lv3 | Effect |
|---|---|---|---|---|
| Breeding Pen | 300 / 4 keepers | 800 / 10 / Residence 1 | 2000 / 20 / Residence 2 | 1 / 2 / 4 pairs |
| Hatchery | 250 / 2 | 700 / 8 / Res 1 | 1800 / 15 / Res 2 | 2/4/8 eggs, ±6/±12/full temperature control |
| Nursery | 200 / 2 | 600 / 6 / Res 1 | 1500 / 12 / Res 2 | 3/6/10 babies (1 without) |
| Kitchen | 150 / 2 | – | – | Craft kibble |

## 8. Meta progression

- **Amber** comes only from achievements (50 or 100 each). New accounts start with 250 Amber.
- **Upgrades** mirror GM's 56 unlocks (renamed). Quality-of-life upgrades are free in our version:
  technique order (Tactician), instructions, extra save slots and doctore auto-manage. Hard mode is free;
  Nightmare needs the *Divine (hard)* achievement.
- Ascension levels per difficulty, champions and the Hall of Fame are account-level.
- "Legends" tournaments draw from the player's own Hall of Fame across runs plus generated foreign
  champions (no server).

## 9. Screens

Mobile-first web app, five-tab bottom bar like GM: **Ludus · Breeding · Market · Arena · Intrigue**, a top
bar with week, denarii, influence and **Advance**, and a hub with Objectives, Messages, Events, Finance,
Influence, Estate and Horde.
