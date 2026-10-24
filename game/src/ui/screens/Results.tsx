// Results chain after completeWeek [ResultActivity, LeagueResultActivity, WeekReportActivity] and the
// game-over screen [DefeatedActivity].
import React, { useEffect, useState } from 'react';
import type { Creature, DefeatReason, ResultCard, SpeciesId, WeekReportEntry } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { defeatText } from '../../engine/week';
import { useStore } from '../store';
import { Btn, Influence, KV, Money, Panel, Plaque } from '../components/primitives';
import { Icon, type IconName } from '../components/Icon';
import { DinoArt } from '../art/DinoArt';
import { EggArt } from '../art/EggArt';
import { camelToWords, fmt, signed } from '../format';
import { sfx } from '../audio';
import { musicSting } from '../music';
import { difficultyOf, mostFamous, recordGameOver, runScore } from '../records';

const META: Record<ResultCard['kind'], { icon: IconName; label: string }> = {
  election: { icon: 'temple', label: 'Elections' },
  league: { icon: 'trophy', label: 'League' },
  escape: { icon: 'horde', label: 'Breakout' },
  hatch: { icon: 'egg', label: 'Hatchery' },
  death: { icon: 'skull', label: 'Loss' },
  story: { icon: 'scroll', label: 'News from Capua' },
  report: { icon: 'scroll', label: 'Week report' },
};

function findByLabel(list: Creature[], label: string): Creature | undefined {
  const name = label.replace(/\s*\(.*\)\s*$/, '');
  return [...list].reverse().find((c) => c.name === name);
}

function Report({ entries }: { entries: WeekReportEntry[] }) {
  const money = entries.filter((e) => e.amount !== undefined);
  const notes = entries.filter((e) => e.amount === undefined);
  const net = money.reduce((n, e) => n + (e.amount ?? 0), 0);
  return (
    <div className="stack-sm">
      {money.length > 0 && (
        <div>
          <div className="micro mb-1">Ledger</div>
          {money.map((e, i) => (
            <div key={i} className="report-line"><span className={`dot dot-${e.kind}`} /><span>{e.text}</span><span className={`num strong ${(e.amount ?? 0) < 0 ? 'bad' : 'good'}`}>{signed(e.amount ?? 0)}</span></div>
          ))}
          <div className="ledger-total"><span>Net</span><Money value={net} signedValue /></div>
        </div>
      )}
      {notes.length > 0 && (
        <div className="mt-2">
          <div className="micro mb-1">Happenings</div>
          {notes.map((e, i) => (
            <div key={i} className="report-line"><span className={`dot dot-${e.kind}`} /><span>{e.text}</span><span /></div>
          ))}
        </div>
      )}
      {entries.length === 0 && <p className="small muted">A quiet week.</p>}
    </div>
  );
}

function CardBody({ card }: { card: ResultCard }) {
  const store = useStore();
  const g = store.game!;
  switch (card.kind) {
    case 'election':
      return <p className="story-intro center">{card.won ? `The votes are counted: you are elected ${card.office === 'consul' ? 'Consul' : 'to the Senate'}!` : `The ${card.office === 'consul' ? 'consulship' : 'Senate seat'} goes to another.`} <span className="muted">({fmt(card.votes)} votes)</span></p>;
    case 'league':
      return (
        <table className="table">
          <tbody>
            {card.standings.map((s, i) => (
              <tr key={i} className={s.house === g.player.ludus.name ? 'amber' : undefined}>
                <td className="num muted" style={{ width: 28 }}>{i + 1}</td><td className="strong">{s.name}</td><td className="muted">{s.house}</td><td className="num strong">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'escape': {
      const who = card.names.map((n) => findByLabel([...g.player.ludus.creatures, ...g.world.horde.rogues], n)).filter((c): c is Creature => !!c);
      return (
        <>
          {who.length > 0 && <div className="result-art">{who.map((c) => <DinoArt key={c.id} creature={c} width={150} flip />)}</div>}
          <p className="story-intro">{card.text}</p><p className="small"><b>{card.names.join(', ')}</b> · {card.outcome}</p>
        </>
      );
    }
    case 'hatch': {
      const babies = card.names.map((n, i) => (card.ids?.[i] ? g.player.ludus.creatures.find((c) => c.id === card.ids![i]) : undefined) ?? findByLabel(g.player.ludus.creatures, n));
      return (
        <>
          <div className="result-art">
            {babies.map((b, i) => (b ? <DinoArt key={b.id} creature={b} width={150} /> : <Icon key={i} name="egg" size={48} />))}
          </div>
          <p className="story-intro center">{card.text}</p>
          <ul className="list-reset stack-sm mt-2">
            {card.names.map((n, i) => {
              const b = babies[i];
              return (
                <li key={n} className="row between">
                  <span className="strong">{n}</span>
                  {b && <Btn size="sm" variant="quiet" onClick={() => store.nav.push({ name: 'dino', id: b.id, tab: 'genetics' })}>{b.genes.mutations.length ? `${b.genes.mutations.length} mutation${b.genes.mutations.length > 1 ? 's' : ''} · ` : ''}Genetics</Btn>}
                </li>
              );
            })}
          </ul>
        </>
      );
    }
    case 'death': {
      const art = card.names.map((n, i) => {
        const egg = (Object.keys(SPECIES) as SpeciesId[]).find((sid) => n === `${SPECIES[sid].name} egg`);
        if (egg) return <EggArt key={i} species={egg} size={64} health={0.2} fertilized />;
        const id = card.ids?.[i];
        const t = (id ? g.player.tomb.find((x) => x.creature?.id === id || x.id === id) : undefined) ?? [...g.player.tomb].reverse().find((x) => x.name === n);
        return t ? <DinoArt key={i} creature={t.creature} width={140} dead /> : null;
      }).filter(Boolean);
      return <>{art.length > 0 && <div className="result-art">{art}</div>}<p className="story-intro">{card.text}</p><p className="small"><b>{card.names.join(', ')}</b></p></>;
    }
    case 'story':
      return <><h3 className="center mb-2">{card.title}</h3><p className="story-intro">{card.text}</p></>;
    case 'report':
      return <Report entries={card.entries} />;
  }
}

export function ResultsScreen() {
  const store = useStore();
  const g = store.game!;
  const cards = g.results;
  const [i, setI] = useState(0);
  const cur = cards[Math.min(i, Math.max(0, cards.length - 1))];
  useEffect(() => {
    if (cur?.kind === 'hatch') {
      sfx.hatch();
      musicSting('hatch');
    }
    else if (cur?.kind === 'election' && cur.won) sfx.achievement();
  }, [cur]);
  if (!cards.length) {
    return <Plaque><div className="empty"><div className="empty-title display">No report yet</div><Btn variant="primary" onClick={() => store.nav.reset([{ name: 'hub' }])}>Back to the ludus</Btn></div></Plaque>;
  }
  const card = cards[Math.min(i, cards.length - 1)];
  const last = i >= cards.length - 1;
  const m = META[card.kind];
  const title = card.kind === 'report' ? `Week ${card.week}` : card.kind === 'league' ? `${camelToWords(card.league)} League` : card.kind === 'story' ? '' : card.kind === 'hatch' ? (card.names.length > 1 ? 'Hatchlings!' : 'A hatchling!') : card.kind === 'death' ? 'Lost' : card.kind === 'escape' ? 'Breakout' : 'Election day';
  return (
    <div className="result-card">
      <div className="result-progress" aria-label={`Card ${i + 1} of ${cards.length}`}>
        {cards.map((_, k) => <span key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />)}
      </div>
      <Plaque>
        <div className="result-head">
          <div className="micro row gap-1 center-x"><Icon name={m.icon} size={14} />{m.label}</div>
          {title && <h2>{title}</h2>}
        </div>
        <div className="mt-3"><CardBody card={card} /></div>
      </Plaque>
      <div className="row gap-2 mt-3 end">
        {i > 0 && <Btn variant="ghost" icon="back" onClick={() => setI(i - 1)}>Previous</Btn>}
        {!last ? (
          <Btn id="result-next" variant="primary" iconRight="arrow" onClick={() => setI(i + 1)}>Continue</Btn>
        ) : (
          <Btn id="result-done" variant="primary" iconRight="arrow" onClick={() => store.nav.reset([{ name: 'hub' }])}>Back to the ludus</Btn>
        )}
      </div>
    </div>
  );
}

const CAUSE: Record<DefeatReason, string> = {
  debt: 'Ruined by debt', uprising: 'Burned by its own dinos', raid: 'Slaughtered in a raid', horde: 'Overrun by the Wild Horde', surrender: 'Surrendered',
};

export function DefeatedScreen() {
  const store = useStore();
  const g = store.game;
  const over = g?.over;
  // record the run once (highscore + stats); never for dev data
  useEffect(() => {
    if (!g?.over || store.dev || g.world.flags.uiRunRecorded) return;
    store.act((s) => { recordGameOver(s, store.meta); return true; }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.over]);
  const star = g ? mostFamous(g) : undefined;
  const fallen = g ? [...g.player.tomb].sort((a, b) => b.fame - a.fame).slice(0, 3) : [];
  const score = g && over ? runScore(g, over.influence) : 0;
  const rank = g && over ? store.meta.highscores.findIndex((h) => h.score === score && h.week === over.week && h.name === g.player.lanista) + 1 : 0;
  return (
    <div className="defeat">
      <div className="defeat-art" aria-hidden="true">
        {star ? <DinoArt creature={star} width={200} dead /> : fallen[0] ? <DinoArt creature={fallen[0].creature} width={200} dead /> : <Icon name="skull" size={56} />}
      </div>
      <div className="micro mt-3">{over ? CAUSE[over.reason] : 'The end'}</div>
      <h1>The ludus has fallen</h1>
      <p className="story-intro mt-3">{over ? defeatText(over.reason) : 'Your house is no more.'}</p>
      {over && (
        <div className="defeat-stats mt-3">
          <div><div className="micro">Weeks survived</div><div className="lg display num">{over.week}</div></div>
          <div><div className="micro">Influence</div><Influence value={over.influence} size="lg" /></div>
          <div><div className="micro">Score</div><div className="lg display num">{fmt(score)}</div></div>
        </div>
      )}
      {g && (
        <Panel className="mt-3" label={`${g.player.lanista} · ${camelToWords(difficultyOf(g))}${g.world.ascension ? ` · Ascension ${g.world.ascension}` : ''}`} title={g.player.ludus.name}>
          <KV k="Battles fought">{fmt(g.runStats?.battles ?? 0)}</KV>
          <KV k="Battles won">{fmt(g.runStats?.wins ?? 0)}</KV>
          <KV k="Hatchlings raised">{fmt(g.runStats?.hatched ?? 0)}</KV>
          <KV k="Peak influence">{fmt(Math.max(g.runStats?.peakInfluence ?? 0, over?.influence ?? 0))}</KV>
          {fallen.length > 0 && <KV k="In the tomb">{fallen.map((t) => t.name).join(', ')}{g.player.tomb.length > 3 ? ` and ${g.player.tomb.length - 3} more` : ''}</KV>}
          {rank > 0 && !g.world.difficulty.sandbox && <KV k="Highscores">#{rank} of {store.meta.highscores.length}</KV>}
          {g.world.difficulty.sandbox && <p className="xs muted mt-1">Sandbox runs are not scored.</p>}
        </Panel>
      )}
      <div className="row gap-2 center-x mt-4 wrap">
        <Btn id="defeat-hof" icon="laurel" onClick={() => { store.quit(); store.nav.push({ name: 'halloffame' }); }}>Hall of Fame</Btn>
        <Btn id="defeat-menu" variant="primary" icon="home" onClick={() => store.quit()}>Main menu</Btn>
      </div>
    </div>
  );
}
