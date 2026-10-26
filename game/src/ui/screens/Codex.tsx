// Codex (in-game wiki) [WikiActivity]: Quickstart, Species, Stats, Breeding, Keepers, Ascension.
import React from 'react';
import type { SpeciesId } from '../../engine/types';
import { SPECIES, DINO_SPECIES, BEAST_SPECIES } from '../../engine/data/species';
import { CLASSES } from '../../engine/data/classes';
import { ASCENSION_LEVELS } from '../../engine/ascension';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Panel, Plaque } from '../components/primitives';
import { DinoThumb } from '../art/DinoArt';
import { SIZE_NAME } from '../format';

const PAGES = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'species', label: 'Species' },
  { id: 'stats', label: 'Stats' },
  { id: 'breeding', label: 'Breeding' },
  { id: 'keepers', label: 'Keepers' },
  { id: 'ascension', label: 'Ascension' },
];

function SpeciesTable({ ids }: { ids: SpeciesId[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th /><th>Species</th><th>Size</th><th className="num">STR</th><th className="num">AGI</th><th className="num">CUN</th><th className="num">HP</th><th>Diet</th><th>Egg / birth</th><th>Temp</th><th className="num">Mature</th><th>Favoured</th><th>Bonus</th></tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const s = SPECIES[id];
            return (
              <tr key={id}>
                <td style={{ padding: '4px 6px' }}><DinoThumb species={id} size={44} /></td>
                <td><b>{s.name}</b><div className="xs muted">{s.body}</div></td>
                <td>{SIZE_NAME[s.size]}</td>
                <td className="num">{s.base.str}</td><td className="num">{s.base.agi}</td><td className="num">{s.base.cun}</td><td className="num">{s.base.hp}</td>
                <td>{s.diet === 'herb' ? 'Herbivore' : 'Carnivore'}</td>
                <td>{s.repro === 'egg' ? `${s.eggSize} egg · ${s.incubWeeks}w` : s.repro === 'gestation' ? `live birth · ${s.gestationWeeks}w` : '—'}</td>
                <td className="num">{s.repro === 'egg' ? `${s.tempRange[0]}–${s.tempRange[1]}°C` : '—'}</td>
                <td className="num">{s.matureWeeks}w</td>
                <td>{s.favClass ? CLASSES[s.favClass].name : '—'}</td>
                <td className="xs" style={{ whiteSpace: 'normal', minWidth: 220 }}>{s.basicBonus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CodexScreen() {
  const store = useStore();
  const page = store.screen.page ?? 'quickstart';
  const wrap = !store.game ? { maxWidth: 900, margin: '0 auto', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' } : undefined;
  return (
    <div style={wrap}>
      <ScreenHead title="Codex" sub="The lanista's handbook" />
      <div className="codex-nav" role="tablist" aria-label="Codex pages">
        {PAGES.map((p) => (
          <button key={p.id} id={`codex-${p.id}`} type="button" role="tab" aria-selected={page === p.id} className={`btn btn-sm ${page === p.id ? 'btn-primary' : 'btn-default'}`} onClick={() => store.nav.update({ page: p.id })}>{p.label}</button>
        ))}
      </div>
      <div className="codex">
        {page === 'quickstart' && (
          <Plaque label="Codex" title="Quickstart">
            <ol>
              <li><b>Buy a dino.</b> The week-1 market always has Tetraites, Carpophorus and Flamma, plus the dire wolf pup Aello.</li>
              <li><b>Teach it a technique</b> on its Techniques tab and <b>buy harness</b> (a weapon first) in the market.</li>
              <li><b>Register for a tournament</b> in the Arena and press <b>Advance</b>. One turn is one week.</li>
              <li><b>Hire keepers</b> and put them to work in the Estate: miners for coin, showmen for influence, wardens for security, spies for intel.</li>
              <li><b>Build</b> in the Estate: one construction a week. A Breeding Pen, Hatchery and Nursery open the breeding game.</li>
              <li>Keep tameness up. Unhappy dinos break out and join Spartacus&rsquo; Wild Horde.</li>
            </ol>
          </Plaque>
        )}
        {page === 'quickstart' && (
          <Plaque label="Codex" title="Staying alive">
            <ul>
              <li><b>Keepers before dinos.</b> A miner earns about 8 denarii a week after upkeep and pays for himself in twelve weeks. Every extra dino costs upkeep, more as it levels.</li>
              <li><b>Keep a reserve.</b> Two weeks in the red and the creditors start seizing keepers; with none left they close the ludus. The hub warns you when the strongbox will run dry within eight weeks.</li>
              <li><b>Enter every tournament.</b> Entry is free and the events you do not watch resolve on &ldquo;avoid injury&rdquo;.</li>
              <li><b>Watch the hills.</b> A raid breaks in when the Horde&rsquo;s band outnumbers your wardens plus half your roster. Wardens and a Palisade keep your keepers at home; two spies tell you the numbers.</li>
              <li><b>Never leave the pens empty.</b> Keep at least two dinos at home, and sell the crippled ones: they cost full upkeep and lose most fights.</li>
              <li><b>Take the fight to the Horde.</b> At 100 influence the Senate funds expeditions that can crush it.</li>
            </ul>
          </Plaque>
        )}
        {page === 'species' && (
          <div className="stack">
            <Panel label="Codex" title="Dinos" flush><SpeciesTable ids={DINO_SPECIES} /></Panel>
            <Panel label="Codex" title="Beasts" flush><SpeciesTable ids={BEAST_SPECIES} /></Panel>
          </div>
        )}
        {page === 'stats' && (
          <Plaque label="Codex" title="Stats">
            <p>Every creature has <b>Strength</b> (damage), <b>Agility</b> (initiative, hitting and dodging), <b>Cunning</b> (tricks, techniques, intrigue) and <b>Health</b>. Base stats come from the species.</p>
            <div className="formula">raw = round((base + wild × inc) × (1 + 0.2 × imprint)) + domestic × inc + bonus{'\n'}inc: STR/AGI/CUN 1, HP 5</div>
            <ul>
              <li><b>Wild points</b> are genetic: rolled for wild-caught creatures, inherited by offspring. <b>Wild level</b> = 1 + all wild points.</li>
              <li><b>Domestic points</b> come from levelling (one per level). They are never inherited.</li>
              <li><b>Imprint</b> raises the base and wild part by up to 20%.</li>
              <li><b>Age</b> multiplies stats when they are used: young dinos are weaker, old ones slow down. Beasts ignore age.</li>
              <li>A dino earns XP in proportion to its <b>style proficiency</b>: pick a fighting style that suits its techniques and traits.</li>
            </ul>
          </Plaque>
        )}
        {page === 'breeding' && (
          <Plaque label="Codex" title="Breeding (ARK rules)">
            <h3>Mating</h3>
            <p>Two healthy adults of the same species and opposite sex share a Breeding Pen (1, 2 or 4 pairs). When the female&rsquo;s mating cooldown is 0 they mate: egg-layers lay a fertilized egg, mammals become pregnant (twins 5%, triplets 1%).</p>
            <h3>Inheritance</h3>
            <ul>
              <li>Each stat&rsquo;s wild points come from the parent with the <b>higher</b> value <b>55%</b> of the time, the lower one 45%.</li>
              <li>Each of the six colour regions comes from either parent.</li>
              <li>Heritable traits pass with 30% (55% if both parents have them), at most three.</li>
            </ul>
            <h3>Mutations</h3>
            <ul>
              <li>Every offspring gets <b>3 rolls of 2.5%</b> (≈7.31% for at least one). Each roll picks a parent at random.</li>
              <li>A mutation gives +2 wild points to one stat and changes one colour region.</li>
              <li>Counters: matrilineal = the mother&rsquo;s total, patrilineal = the father&rsquo;s total, +1 on the side that mutated.</li>
              <li>A parent with <b>20 or more</b> mutations can no longer mutate (the 20 limit). Breeders keep a clean female and stack mutations on a male line.</li>
            </ul>
            <h3>Incubation</h3>
            <p>Eggs need their species&rsquo; temperature range for a number of weeks. Capua swings from about 12°C in winter to 30°C in summer; out of range an egg loses health instead of progressing. A Hatchery shifts each egg toward its ideal by ±6°C, ±12°C or fully, for 3 denarii a week per egg.</p>
            <h3>Imprinting</h3>
            <p>From the week after hatching each baby asks for one thing a week: a cuddle, a walk or a specific food. Each fulfilled request adds imprint; a missed one is gone. Full imprint gives +20% to base and wild stats, a rider bonus and steady tameness.</p>
          </Plaque>
        )}
        {page === 'keepers' && (
          <Plaque label="Codex" title="Keepers">
            <ul>
              <li><b>Miners</b> dig for denarii (10 per miner, more with a better Mine).</li>
              <li><b>Showmen</b> entertain: influence and tameness.</li>
              <li><b>Wardens</b> are your security against breakouts, intrigue and raids.</li>
              <li><b>Spies</b> (Residence 2) reveal market stats, rival plans and egg genetics. Only spies assigned since last week count as <i>committed</i>.</li>
            </ul>
            <p>Each keeper costs 2 denarii a week, 4 beyond your beds. The market offers 2–4 a week, priced from 80 to 120.</p>
          </Plaque>
        )}
        {page === 'ascension' && (
          <Plaque label="Codex" title="Ascension">
            <p>Win the Ascension tournament (four trophies, the Horde defeated and a Shrine) and your champion ascends. Start again harder: each level stacks one more god&rsquo;s curse, and your champion can be reincarnated young or old.</p>
            {ASCENSION_LEVELS.length > 0 && (
              <ol className="mt-2">
                {ASCENSION_LEVELS.map((l) => <li key={l.level}><b>{l.god}</b> · {l.name}: <span className="muted">{l.summary.join(' ')}</span></li>)}
              </ol>
            )}
          </Plaque>
        )}
      </div>
    </div>
  );
}
