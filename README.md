# Gladiator-manager-copy

This repository holds two things:

1. **Jurassic Ludus** (`game/`), a playable web game: our own *Gladiator Manager* with dinosaurs in place of
   gladiators and *ARK: Survival Evolved*-style breeding on top.
2. A full teardown of the original **Gladiator Manager** (Renegade Games, Android/iOS) in `docs/`. Every formula
   the game uses comes from it.

## Jurassic Ludus

Capua, 73 BC. Rome never lost the great saurians. You found a modest ludus, buy and breed dinos, train them,
gear them in battle harness and send them into the arenas of Capua. Along the way you scheme against rival
houses, climb the Senate and survive Spartacus, a Thracian Allosaurus who escapes and leads a Wild Horde
across Italy.

### What it keeps from Gladiator Manager

Every system keeps Gladiator Manager's mechanics and numbers and changes the fiction:

- **Weekly loop**, in the original order: economy, ageing, tameness (loyalty), training, events, tournaments,
  rival AI, the Horde, then results.
- **Combat**: the same turn engine, armor formula, reach, techniques, statuses, surrender and injury rolls
  (`rand(11) + modifier`). Riders take the place of mounts.
- **Arenas**: rookie, junior, senior and grand tournaments, the Pits, Primal Bouts (Pankration), the Hatchling
  Games (Iunior Victores), leagues, bonus rounds, bribes and betting.
- **Estate**: 21 buildings, keepers (miners, showmen, wardens, spies), upkeep, loans and a debt spiral.
- **Rivals**: the named houses of Capua run the same AI. They buy, train, register, scheme and breed.
- **Intrigue**: spying, sabotage, theft, assassination, trading and scenario cards.
- **Politics**: the influence tree, Senate and consul elections, and laws.
- **The Wild Horde**: raids, expeditions and Spartacus.
- **Content**: 82 decision events, 23 adventures, story chains and objectives.
- **Meta progression**: 16 Ascension levels with reincarnated champions and prophecy, plus achievements that
  pay **Amber**, which buys permanent unlocks. There is no real money anywhere.

16 dino species (Velociraptor to Giganotosaurus) carry the role of the original origins, each with a basic
and a level-2 bonus. Prehistoric beasts and mythic monsters fill the beast slot.

### What it adds: ARK breeding

The breeding system follows ARK: Survival Evolved's rules from mating to adulthood:

- **Stats** are `(base + wild points × increment) × (1 + 0.2 × imprint) + domestic points × increment`.
- **Inheritance**: each stat comes from one parent, the higher one 55% of the time.
- **Mutations**: 3 rolls at 2.5%, each adding +2 wild points to a stat and possibly a color mutation.
  Matrilineal and patrilineal counters, a 20-mutation limit, and stacking when a stat mutates twice.
- **Eggs** need the right temperature. The season sets it; a hatchery holds it. Live bearers gestate instead,
  with a 5% chance of twins and 1% of triplets.
- **Raising**: baby, juvenile, adolescent and adult stages, feeding from the pantry, and imprint care requests
  (cuddle, walk, feed). Full imprint gives +20% stats and a bond with the rider.
- **Kibble** is crafted from eggs, in tiers. Mate Boost: an adult male and female of the same species on one side each take a
  third less damage while both stand.
- **Bloodlines**: an ancestry registry, pedigrees and generation counters. Rival houses breed too, every 8 weeks
  (every 6 on Hard).

[`game/DESIGN.md`](game/DESIGN.md) is the full specification: the terminology map, species, breeding numbers,
combat, gear, estate and screens.

### Run it

```bash
cd game
npm install
npm run dev            # play at http://localhost:5173
npm test               # the full engine test suite
npm run sim            # a bot plays long games on every difficulty
npm run build          # typecheck and production build
npm run build:artifact # one self-contained HTML file in dist-artifact/
```

Saves live in the browser's localStorage: five slots plus account-wide meta (Amber, upgrades, Ascension,
hall of fame).

### Layout

| Path | What it holds |
|---|---|
| `game/src/engine/` | The whole game in pure TypeScript: state model, seeded RNG, combat, breeding, the weekly loop, every system. It has no UI dependencies. |
| `game/src/engine/data/` | Species, beasts, colors, names, techniques, classes, traits, gear, food, events, stories, arenas, rivals, politics, Ascension |
| `game/src/ui/` | The React interface: screens, the battle viewer, procedural dino and egg art |
| `game/tests/` | Vitest suites for each system, plus a long-run bot simulation |
| `game/scripts/` | The single-file artifact build and Playwright screenshot and end-to-end scripts |

## Gladiator Manager analysis

A full teardown of the original game lives in [`docs/gladiator-manager-analysis/`](docs/gladiator-manager-analysis/README.md). It covers what the game is, its story, every mechanic with formulas, monetization, technology, history and reception, the bugs it ships with, and design lessons.

| Document | Topic |
|---|---|
| [Overview](docs/gladiator-manager-analysis/README.md) | Master report and strategy guide |
| [01](docs/gladiator-manager-analysis/01-combat.md) | Combat engine |
| [02](docs/gladiator-manager-analysis/02-items-economy.md) | Items, buildings, economy, markets |
| [03](docs/gladiator-manager-analysis/03-loop-progression.md) | Weekly loop, progression, rivals, tournaments, ascension |
| [04](docs/gladiator-manager-analysis/04-story-events.md) | Story, events, quests |
| [05](docs/gladiator-manager-analysis/05-intrigue-influence-loyalty.md) | Intrigue, influence, loyalty |
| [06](docs/gladiator-manager-analysis/06-ui-monetization-tech.md) | Screens, monetization, tech |
| [07](docs/gladiator-manager-analysis/07-history-reception-community.md) | History, reception, community |
