// BattleViewer: replays a BattleResult (pure presentation). Two sides of DinoArt sprites (side 1 flipped),
// HP bars driven by log[i].hp, the current log line, hit flash/shake, damage numbers, crit emphasis,
// knockouts (sprite falls and greys), round counter, 1×/2×/4× and Skip, and a scrollable full log whose
// auto-follow pauses when the player scrolls up.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogLine, BattleResult, LogKind } from '../../engine/types';
import { DinoArt } from '../art/DinoArt';
import { Icon, type IconName } from '../components/Icon';
import { Btn, Meter, Pill, Segmented } from '../components/primitives';

export interface BattleViewerProps {
  result: BattleResult;
  onDone: () => void;
  title?: string;
  initialSpeed?: 1 | 2 | 4;
  /** which side is the player's (for the Victory/Defeat banner) */
  playerSide?: 0 | 1;
  sideNames?: [string, string];
  autoplay?: boolean;
}

const DELAY: Partial<Record<LogKind, number>> = {
  start: 900, round: 650, attack: 950, tech: 1050, crit: 1300, miss: 750, glance: 850, ko: 1400, heal: 900, status: 850,
  yield: 1200, trick: 1000, info: 800, transform: 1200, end: 1500,
};

const KIND_ICON: Partial<Record<LogKind, IconName>> = {
  attack: 'claw', tech: 'sparkle', crit: 'star', miss: 'close', glance: 'shield', ko: 'skull', heal: 'heart', status: 'info',
  yield: 'flag', trick: 'spy', round: 'hourglass', start: 'arena', end: 'trophy', transform: 'moon', info: 'info',
};


export function BattleViewer({ result, onDone, title, initialSpeed = 1, playerSide = 0, sideNames, autoplay = true }: BattleViewerProps) {
  const log = result.log;
  const last = log.length - 1;
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState<1 | 2 | 4>(initialSpeed);
  const [follow, setFollow] = useState(true);
  const [stageW, setStageW] = useState(390);
  const stageRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  const fighters = result.fighters;
  const line: BattleLogLine | undefined = idx >= 0 ? log[idx] : undefined;
  const hp = line?.hp ?? fighters.map((f) => f.hpMax);
  const finished = idx >= last;

  // playback
  useEffect(() => {
    if (!playing || finished) return;
    const next = log[idx + 1];
    const base = idx < 0 ? 500 : DELAY[line?.kind ?? 'info'] ?? 900;
    const t = window.setTimeout(() => setIdx((i) => Math.min(last, i + 1)), base / speed);
    void next;
    return () => window.clearTimeout(t);
  }, [playing, idx, speed, finished, last, line, log]);

  useEffect(() => {
    if (finished) {
      setPlaying(false);
      window.setTimeout(() => doneRef.current?.focus({ preventScroll: true }), 50);
    }
  }, [finished]);

  // stage size for sprite scaling
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // auto-follow the log
  useEffect(() => {
    const el = logRef.current;
    if (!el || !follow) return;
    el.scrollTop = el.scrollHeight;
  }, [idx, follow]);
  const onLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
    setFollow(atBottom);
  };

  const skip = useCallback(() => {
    setIdx(last);
    setPlaying(false);
  }, [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDone(); }
      if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const sides = useMemo(() => [0, 1].map((s) => fighters.map((f, i) => ({ f, i })).filter((x) => x.f.side === s)), [fighters]);
  const round = line?.round ?? 0;
  const isHit = line && (line.kind === 'attack' || line.kind === 'crit' || line.kind === 'tech' || line.kind === 'glance') && line.target !== undefined;
  const baseW = Math.max(110, Math.min(260, stageW * 0.4));
  const won = result.winner === playerSide;
  const names = sideNames ?? ['Your side', 'Opponents'];

  return (
    <div className="battle-layer" role="dialog" aria-modal="true" aria-label={title ?? 'Battle'}>
      <div className="battle-top">
        <Icon name="arena" size={20} className="amber" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="strong ellipsis">{title ?? 'Battle'}</div>
          <div className="xs muted ellipsis">{names[0]} vs {names[1]}</div>
        </div>
        <span className="battle-round num" aria-live="polite">{round > 0 ? `Round ${round}` : 'Start'}</span>
      </div>
      <div className="battle-stage" ref={stageRef}>
        {line?.crit && <div key={`fl${idx}`} className="battle-flash" />}
        <div className="battle-huds">
          {sides.map((list, s) => (
            <div key={s} className={`col${s === 1 ? ' r' : ''}`}>
              {list.map(({ f, i }) => {
                const cur = Math.max(0, hp[i] ?? 0);
                const frac = cur / Math.max(1, f.hpMax);
                return (
                  <div key={f.id} className={`fighter-hud${cur <= 0 ? ' is-ko' : ''}${isHit && line?.target === i ? ' is-target' : ''}${isHit && line?.actor === i ? ' is-actor' : ''}`}>
                    <div className="row"><span className="fighter-name">{f.name}</span><span className="hpnum">{cur}/{f.hpMax}</span></div>
                    <Meter value={cur} max={f.hpMax} tone={frac < 0.3 ? 'bad' : frac < 0.6 ? 'warn' : 'good'} height={5} label={`${f.name} health`} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="battle-sides">
          {sides.map((list, s) => (
            <div key={s} className="battle-side">
              {list.map(({ f, i }, k) => {
                const ko = (hp[i] ?? 0) <= 0;
                const n = list.length;
                const w = baseW * (n > 1 ? 0.86 : 1.05) * (k === 0 ? 1 : 0.92);
                const hit = isHit && line?.target === i;
                const acting = line?.actor === i && isHit;
                // front fighter nearest the centre and lowest; others further back and higher
                const inner = (n > 1 ? 2 : 14) + k * 28;
                const pos: React.CSSProperties = s === 0
                  ? { right: `${inner}%`, bottom: `${4 + k * 16}%`, zIndex: 4 - k }
                  : { left: `${inner}%`, bottom: `${4 + k * 16}%`, zIndex: 4 - k };
                const pop = line && line.target === i && (line.dmg !== undefined || line.kind === 'miss')
                  ? line.kind === 'miss' ? { cls: 'miss', text: 'Miss' } : line.kind === 'heal' ? { cls: 'heal', text: `+${line.dmg}` } : line.dmg ? { cls: line.crit ? 'crit' : '', text: `${line.crit ? 'CRIT ' : ''}−${line.dmg}` } : null
                  : null;
                return (
                  <div key={f.id} className={`fighter side-${s}${hit ? ' hit' : ''}${acting ? ` actor-${s}` : ''}${ko ? ' ko' : ''}`} style={pos}>
                    <DinoArt species={f.species} colors={f.colors} sex={f.sex} maturity={f.maturity} seed={f.id} flip={s === 1} width={Math.round(w)}
                      gear={{ rider: !!f.rider, weapon: !!f.weapon, armor: !!f.armor }} animate={!ko} sizeScale />
                    {pop && <span key={`p${idx}`} className={`dmg-pop ${pop.cls}`}>{pop.text}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {finished && (
          <div className="battle-banner" role="status">
            {won ? 'Victory' : 'Defeat'}
            <small>{result.decidedBy === 'crowd' ? 'The crowd decides' : result.decidedBy === 'forfeit' ? 'By forfeit' : 'By knockout'} · {result.rounds} round{result.rounds === 1 ? '' : 's'}</small>
          </div>
        )}
      </div>
      <div className={`battle-caption${line?.crit ? ' crit' : ''}`} aria-live="polite">
        <Icon name={KIND_ICON[line?.kind ?? 'start'] ?? 'info'} size={20} className={line?.kind === 'ko' ? 'bad' : line?.crit ? 'amber' : 'muted'} />
        <div className="cap-text">{line ? line.text : 'The gates open…'}</div>
      </div>
      <ol className="battle-log list-reset" ref={logRef} onScroll={onLogScroll} aria-label="Battle log">
        {log.map((l, i) => (
          <li key={i} className={`k-${l.kind}${i > idx ? ' future' : ''}${i === idx ? ' cur' : ''}`}>
            <span className="r">{l.round > 0 ? `R${l.round}` : ''}</span>
            <span className="t">{l.text}</span>
          </li>
        ))}
      </ol>
      {!follow && <div className="follow-pill"><Btn size="sm" icon="chevronDown" onClick={() => setFollow(true)}>Follow</Btn></div>}
      <div className="battle-bottom">
        {!finished ? (
          <>
            <Btn id="battle-play" className="lbl-wide" icon={playing ? 'pause' : 'play'} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</Btn>
            <Btn id="battle-step" variant="ghost" icon="chevronRight" disabled={playing} aria-label="Step" onClick={() => setIdx((i) => Math.min(last, i + 1))} />
            <Btn id="battle-skip" className="lbl-wide" variant="ghost" icon="skip" onClick={skip}>Skip</Btn>
          </>
        ) : (
          <Pill tone={won ? 'good' : 'bad'} icon={won ? 'trophy' : 'skull'}>{won ? 'You won' : 'You lost'}</Pill>
        )}
        <div className="grow" />
        {!finished && <Segmented id="battle-speed" label="Speed" size="sm" value={String(speed) as '1' | '2' | '4'} onChange={(v) => setSpeed(Number(v) as 1 | 2 | 4)}
          options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} />}
        <Btn id="battle-done" ref={doneRef} variant={finished ? 'primary' : 'ghost'} iconRight={finished ? 'arrow' : undefined} icon={finished ? undefined : 'close'} aria-label={finished ? undefined : 'Close'} onClick={onDone}>{finished ? 'Continue' : undefined}</Btn>
      </div>
    </div>
  );
}
