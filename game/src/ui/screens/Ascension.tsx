// Ascension [AscensionActivity]: progress toward the Ascension tournament (league trophies, the Horde, a Shrine),
// the 16 stacking god levels with this run's level and the account's unlocked levels, the champion and how
// reincarnation works.
import React from 'react';
import { ASCENSION_LEVELS, MAX_ASCENSION, ascensionProgress, selectableAscension } from '../../engine/ascension';
import { SPECIES } from '../../engine/data/species';
import { useStore } from '../store';
import { ScreenHead } from '../components/ScreenHead';
import { Btn, EmptyState, Hint, Meter, Panel, Pill, Plaque } from '../components/primitives';
import { DinoArt } from '../art/DinoArt';
import { safe } from '../safe';
import { difficultyOf } from '../records';
import { Req } from './Influence';

export function AscensionScreen() {
  const store = useStore();
  const g = store.game!;
  const meta = store.meta;
  const key = difficultyOf(g);
  const run = g.world.ascension;
  const account = meta.ascension[key] ?? 0;
  const selectable = safe(() => selectableAscension(meta, key), account);
  const p = safe(() => ascensionProgress(g), { trophies: 0, needed: 4, hordeDefeated: false, shrine: false, ready: false });
  const champ = meta.champions[key];
  const thisWeek = g.world.tournaments.find((t) => t.type === 'ascension');
  const met = [p.trophies >= p.needed, p.hordeDefeated, p.shrine].filter(Boolean).length;
  return (
    <>
      <ScreenHead title="Ascension" sub={run > 0 ? `This run: ${ASCENSION_LEVELS[run - 1]?.name ?? `level ${run}`}` : 'Defeat the champions of the gods'} />
      <div className="cols cols-wide-left">
        <div className="stack">
          <Plaque label={`${met} of 3 requirements`} title={p.ready || thisWeek ? 'The gods are waiting' : 'The road to Olympus'}>
            <Meter value={met} max={3} tone={met === 3 ? 'good' : 'amber'} height={8} label="Requirements met" />
            <div className="stack-sm mt-3">
              <Req ok={p.trophies >= p.needed} label={<>League trophies (first places, a Senate seat counts): <b className="num">{Math.min(p.trophies, p.needed)} / {p.needed}</b></>} />
              <Req ok={p.hordeDefeated} label="The Wild Horde defeated by an expedition" />
              <Req ok={p.shrine} label="A Shrine built on your estate" />
            </div>
            <p className="small mt-3">Once all three are met, the Ascension tournament is held on every even week{g.ascended ? ' (after your first ascension in a run: every 50th week)' : ''}: a gauntlet of {run + 2} bonus rounds against the gods&rsquo; champions, ridden and armoured, fought for eight rounds each.</p>
            {thisWeek && <Btn id="asc-arena" className="mt-2" variant="primary" icon="arena" onClick={() => store.nav.area('arena')}>The Ascension is this week</Btn>}
            {!thisWeek && !p.shrine && <Btn id="asc-estate" className="mt-2" icon="estate" onClick={() => store.nav.area('estate')}>Estate</Btn>}
          </Plaque>
          <Panel label="Reincarnation" title="What ascending means">
            <p className="small">Clearing the gauntlet ends the run in glory and unlocks the next god level for this difficulty. A new game may then start at any unlocked level; each level stacks its god&rsquo;s curse on top of every lower one.</p>
            <p className="small">Your champion is reborn into the new run:</p>
            <ul className="perk-list">
              <li><b>Young</b>: back to fifteen, with a fresh body (8/8/8/30) but the same bloodline, colours and mutation counters, one valid trait (two with Ascendancy) and the Reincarnated trait.</li>
              <li><b>Old</b>: keeps everything, aged into a veteran, ill for a couple of weeks and fiercely tame.</li>
            </ul>
            {champ ? (
              <div className="row gap-3 mt-2">
                <span className="dino-thumb" style={{ width: 96, height: 72, placeItems: 'end center' }}><DinoArt creature={champ.creature} width={92} animate={false} /></span>
                <div><div className="strong">{champ.creature.name}</div><div className="xs muted">{SPECIES[champ.creature.species]?.name} · ascended at level {champ.level}, week {champ.week}{champ.beast ? ` · with ${champ.beast.name}` : ''}</div></div>
              </div>
            ) : <p className="xs muted">No champion has ascended on this difficulty yet.</p>}
          </Panel>
        </div>
        <Panel label={`Unlocked on ${key}: ${account} · new runs up to ${selectable}`} title="The sixteen gods" flush>
          <ol className="list-reset">
            {ASCENSION_LEVELS.slice(0, MAX_ASCENSION).map((l) => {
              const active = l.level <= run;
              const current = l.level === run;
              const unlocked = l.level <= selectable;
              return (
                <li key={l.level} className={`asc-level${current ? ' current' : active ? ' active' : ''}${unlocked ? '' : ' locked'}`}>
                  <span className="asc-n display num">{l.level}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row gap-2 wrap"><span className="strong">{l.name}</span>{current && <Pill tone="amber" icon="star">This run</Pill>}{active && !current && <Pill tone="muted">In effect</Pill>}{!unlocked && <Pill tone="muted" icon="lock">Locked</Pill>}</div>
                    <ul className="asc-sum">{l.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                </li>
              );
            })}
          </ol>
          {ASCENSION_LEVELS.length === 0 && <EmptyState icon="temple" title="The gods are silent" />}
        </Panel>
      </div>
      <div className="mt-3"><Hint icon="temple">Every god level is permanent for the account and difficulty: Normal, Hard and Nightmare climb separately.</Hint></div>
    </>
  );
}
