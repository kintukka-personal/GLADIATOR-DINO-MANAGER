# Jurassic Ludus: project handoff

A summary of the work so far, for picking the project up in a new chat. Last updated 2026-11-12.

## The goal

The original request: recreate the mobile game **Gladiator Manager** (Renegade Games) with **dinosaurs in place of
gladiators**, and keep as much of its mechanics, game flow, menus, rivals and Ascension as possible, retold for
dinosaurs. The one new system is **breeding**, copied as closely as possible from **ARK: Survival Evolved**. The
work runs from beginning to end with full creative and technical control on Claude's side: the user asked not to
be asked for decisions, and to have agents and skills used wherever they help.

Two follow-up requests, both done:
1. **Add music.**
2. **Balance the game so players can survive.**

## Where everything is

| What | Where |
|---|---|
| Repository | `Kintukka2/Gladiator-manager-copy`, default branch `main` |
| Working branch used so far | `claude/clever-hamilton-6nk1ze`; all of its work is merged into `main` |
| Merged pull requests | #2 (the whole game), #3 (music and balance) |
| Hosted, playable build | https://claude.ai/artifact/4FPD6XeSctDG84pM6gQrmm (a claude.ai Artifact, private to its owner until shared; version 2 is music and balance) |
| The game | `game/` (Vite 5 + React 18 + TypeScript 5.6 + Vitest 2) |
| Design spec | `game/DESIGN.md`: the Gladiator Manager → dino mapping, species, ARK breeding rules, combat, gear, estate, screens, and the balance table (§10) |
| UI conventions | `game/src/ui/UI_GUIDE.md`: components, tokens, screens, music, dev deep links, scripts |
| Gladiator Manager teardown | `docs/gladiator-manager-analysis/`: the original game's mechanics with formulas, which the engine follows |
| Project README | `README.md` |

## How to run and check it

```bash
cd game
npm install
npm run dev              # play at http://localhost:5173
npx tsc --noEmit         # typecheck
npx vitest run           # 487 tests in 31 files, all passing at handoff
npm run build            # typecheck + production build
npm run build:artifact   # one self-contained HTML page in dist-artifact/jurassic-ludus.html
```

More checks:
- `JL_SWEEP=20 npx vitest run tests/survival.test.ts`: the balance sweep. A competent bot plays 20 seeds per
  difficulty and the table of survivors is printed. `JL_WEEKS=200` lengthens the runs; `JL_CLASSIC=1` uses the
  original rules.
- `npx vitest run tests/longrun.test.ts`: a crash and invariant smoke test (a deliberately simple bot over 160 weeks).
- `node scripts/e2e.mjs [--weeks=10] [--desktop] [--light]`: drives a real game in Chromium against a running dev
  server (`BASE_URL`, default `http://localhost:5173/`). It exits 1 on any console error.
- `node scripts/ui-shot.mjs`: screenshots of every screen through the dev deep links (`#dev/...`, `#gallery`).
- `node scripts/music-render.mjs`: renders every music mood offline and reports levels; it also writes WAVs.
- In this cloud environment Playwright must launch Chromium with `executablePath: '/opt/pw-browsers/chromium'`.
  Never run `playwright install`.

## What has been built

### Engine (`game/src/engine`, pure TypeScript, about 26k lines with data)
- A shared state model (`types.ts`) and a seeded RNG stored in the save. The engine mutates state in place, and the UI calls it through `store.act()`.
- **The weekly loop** (`week.ts`) runs in Gladiator Manager's order: economy, ageing, tameness, training, breeding, events, tournaments, rival AI, the Horde, then results.
- **Combat** (`combat/`) uses GM's turn engine, armor formula A/√(A²+900), reach, 31 techniques, statuses, surrender, injuries (rand(11)+m), riders and Mate Boost.
- **Arenas** (`tournaments.ts`):
  - rookie, junior, senior and grand events, the Underground Pits with bonus rounds, Primal Bouts, the Hatchling Games and leagues;
  - organising your own events, bribes (`bribes.ts`) and bets.
- **Economy:**
  - 21 buildings, keepers (miners, showmen, wardens, spies), upkeep and the debt spiral (`economy.ts`, `buildings.ts`);
  - markets for dinos, beasts, gear, food and eggs (`market.ts`), the forge, training (`training.ts`), and care, stats and techniques (`care.ts`).
- **Rival houses** (`rivals.ts`) run a full AI: buying, training, registering, scheming, trading and breeding.
- **Intrigue and politics:**
  - spying, sabotage, theft, assassination, poisoning, persuasion and scenario cards (`intrigue.ts`);
  - the influence tree, Senate and consul elections, and laws (`influence.ts`).
- **The Wild Horde** (`horde.ts`): Spartacus as a Thracian Allosaurus, raids (fight, pay or hide), expeditions with tactics, and Senate legions.
- **Story content:**
  - 82 decision events (`events.ts` + `data/eventsData*.ts`);
  - 23 adventures, story chains (`stories.ts`) and objectives.
- **Meta progression:**
  - achievements pay **Amber** (no real money anywhere), which buys permanent upgrades;
  - 16 Ascension levels with reincarnated champions and prophecy.
- **Saves** (`save.ts`): five localStorage slots plus account meta, export and import strings, and a meta migration.
- **Creatures:**
  - 16 dino species (Velociraptor … Giganotosaurus), each standing in for a GM origin;
  - beasts (dire wolf, sabertooth and others) and mythic monsters.

### ARK breeding (`breeding.ts`)
- Stats: (base + wild × increment) × (1 + 0.2 × imprint) + domestic × increment. Increments are str/agi/cun 1 and HP 5.
- Inheritance: each stat comes from one parent, the higher one 55% of the time.
- Mutations: 3 rolls at 2.5%, each +2 wild points. A mutation can also change a color. Matrilineal and patrilineal counters are additive, as in ARK. A parent at 20 mutations or more can't pass new ones, and repeat mutations stack on one stat.
- Eggs incubate against Capua's seasonal temperature, with hatchery control of ±6°C, ±12°C or full.
- Live bearers gestate, with 5% twins and 1% triplets. The mating cooldown starts after the birth.
- Babies grow through baby, juvenile and adolescent stages and need feeding from the pantry.
- Imprint care requests (cuddle, walk, feed) come in. Full imprint gives +20% stats and a rider bonus, and a sick baby that asks for a walk is carried instead.
- Unfertilized eggs feed kibble crafting (5 tiers) or sell.
- Mate Boost: a mated pair fighting together each take a third less damage.
- An ancestry registry keeps pedigrees and generations. Rival houses breed every 8 weeks (6 on Hard).

### UI (`game/src/ui`, React, phone-first, dark and light themes)
- **Screens:**
  - the hub (attention list, quick links, survival warnings), ludus, dino detail (genetics, pedigree, stats, techniques, gear) and breeding (pen, hatchery, nursery, kitchen);
  - market, estate, finance, the arena tab and the full match flow (preview → preparation → battle viewer → round report → pits → final report);
  - intrigue with the rival dossier and night scenes, influence and elections, the Horde and expeditions;
  - Ascension, results, defeat with highscores and hall of fame, codex, settings, new game and main menu.
- Dino and egg art is procedural, from species body plans and ARK-style color regions.
- **Sound effects and music** are all synthesised with WebAudio, with no audio files:
  - the files are `audio.ts`, `music.ts`, `musicLogic.ts` and `musicDirector.ts`;
  - seven moods follow the screen: title, ludus, nursery, arena, battle (intensity follows HP), night and lament;
  - stings play for victory, defeat, hatching and a new week;
  - Settings has a Music toggle plus Music and Effects volume sliders.

### Balance (`game/src/engine/balance.ts`, documented in `game/DESIGN.md` §10)
- The original numbers form death spirals: raids carry keepers off into the Horde, the Horde outgrows any garrison, and level upkeep outruns the purse. Each difficulty now softens those knobs by degree.
- **Classic rules** on the New Game screen restores the original numbers. The tests that pin the original numbers run under it.
- Results with the competent bot (`game/tests/bots/competent.ts`), 20 seeds per difficulty:

  | Difficulty | Original rules, 120 weeks | New rules, 120 weeks | New rules, 200 weeks |
  |---|---|---|---|
  | Normal | 10/20 | 20/20 | 20/20 |
  | Hard | 0/20 | 13/20 | 10/20 |
  | Nightmare | 0/20 | 2/20 | 0/20 |

- Overspending still bankrupts a run within 8 weeks.
- The hub warns when money runs out within 8 weeks and when the Horde's raiding band outnumbers your defence. The Codex has a "Staying alive" section.

### Tests (`game/tests`)
- Unit and integration tests for every engine system.
- `dynasty.test.ts` plays 90 weeks of breeding through the real weekly loop: many generations, imprinting, mutations, pedigrees and a save round trip.
- `survival.test.ts` and `balance.test.ts` cover the balance and the hub warnings.
- `music.test.ts` covers the music.
- The `longrun` smoke test plays 160 weeks per difficulty.

## How the work was done
- Claude wrote the design spec and the engine core and shared types first. Parallel agents then built combat, economy, markets, tournaments, rivals, intrigue, events, stories, Ascension and the UI. Claude integrated their work, reviewed screenshots and fixed bugs between waves.
- Balance came from bot simulation. A competent bot follows the teardown's strategy guide: miners first, a cash reserve, entering every tournament (fees are never charged), wardens against raids, expeditions, chain bribes, selling crippled dinos and paying ransoms. Each knob was measured by its survival effect.
- An agent built the music. Levels were checked by offline rendering, because nobody in the session can listen to it.

## Known gaps and rough edges
- **Balance:**
  - Real players have not tested it yet.
  - On Hard, Nightmare and late Normal, the player's win rate against rival houses is low; the bot wins about 30% of matches on Normal and 17–20% on Hard. Strong houses such as Vettius field level 10–13 dinos by week 40.
  - Skimping on wardens costs keepers and coin but no longer ends a run on Normal or Hard.
  - Early influence comes slowly.
- **Music:**
  - Stings use fixed keys and can clash briefly with a bed that is crossfading.
  - The Intrigue tab plays the `ludus` mood; only night-scene sheets switch to `night`. It's a one-line change in `SCREEN_MOOD` in `musicLogic.ts`.
  - The bass is heavy on some speakers.
  - The battle mood keeps playing quietly under the end sting until the battle viewer is closed.
  - The claude.ai host's hot-swap (`window.claude.hot`) has only been simulated.
- **The pit-round foe preview** only names the possible beasts for round 4, because the engine picks one at random.
- **Saves** live only in the browser's localStorage, with no cloud sync. Export and import strings exist in the menu.
- **Dev deep links** (`#dev/...`) share the real account meta, so achievements earned on dev data count.
- **The repository has no CI.** Nothing runs tsc or vitest on pull requests.
- **The hosted Artifact:** to update the same URL from a new chat, read it first with the Artifact tool (`action: "read"`, `url` above), then publish the new `game/dist-artifact/jurassic-ludus.html` with that `url`. Publishing without `url` makes a new, separate artifact.

## What could come next
These are ideas; none has been requested yet.
1. **Playtest and tune.** Play real runs on Normal and Hard, then adjust `balance.ts` from what feels unfair. Possible levers: rival strength on Hard, early influence, and making wardens worth more.
2. **Add CI.** A GitHub Actions workflow running `npx tsc --noEmit` and `npx vitest run` in `game/`.
3. **Music polish.** Key-aware stings, a darker Intrigue tab, an optional bass trim, and fading the battle bed out under the end sting.
4. **Cloud saves.** The Artifact `db` capability could keep saves across devices; saves would need compressing to fit the document size limits.
5. **Onboarding.** A guided first few weeks that point at the market, harness, registration and keepers.
6. **Breeding UX.** Side-by-side parent comparison with predicted offspring ranges, and mutation-stacking helpers.
7. **Content.** More events, stories and species. `DESIGN.md` §8 plans for Legends tournaments to draw from the
   player's hall of fame; the engine doesn't do that yet.

## Conventions used in this repo
- Develop on a `claude/...` branch, commit, push with `git push -u origin <branch>`, and open a draft PR. Once a PR merges, start follow-up work from the latest `main` as a new PR.
- No model identifiers go in commits, PRs or code.
- User-facing copy is plain and specific, and the game never asks for real money.
