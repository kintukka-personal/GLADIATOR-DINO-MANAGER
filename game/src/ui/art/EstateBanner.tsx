// EstateBanner: the hub's night scene. Silhouettes reflect what is built: palisade/walls, residence
// size, breeding pens, the glowing hatchery kiln, nursery lantern, temple, training posts, forge
// embers, kitchen smoke, guard tower. Vesuvius smokes in the distance; the moon is full on
// Moon Frenzy weeks (week % 4 === 0). Torches flicker (disabled with reduced motion).
import React, { memo, useId } from 'react';
import type { Creature, Ludus } from '../../engine/types';
import { seeded } from './geom';
import { DinoArt } from './DinoArt';

const INK = '#0d0a09';
const INK2 = '#15100d';
const LIT = '#f0b250';

function Window({ x, y, w = 8, h = 10, on = true }: { x: number; y: number; w?: number; h?: number; on?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={1} fill={on ? LIT : '#2a201a'} opacity={on ? 0.92 : 1} className={on ? 'win' : undefined} />;
}

function Torch({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 1.5} y={y} width={3} height={24} fill={INK2} />
      <circle cx={x} cy={y - 3} r={16} fill="url(#eb-torchglow)" className="torch-glow" />
      <path d={`M${x} ${y - 12}C${x + 5} ${y - 6} ${x + 4} ${y} ${x} ${y}C${x - 4} ${y} ${x - 5} ${y - 6} ${x} ${y - 12}Z`} fill="#ffb347" className="flame" />
      <path d={`M${x} ${y - 7}C${x + 2.4} ${y - 4} ${x + 2} ${y} ${x} ${y}C${x - 2} ${y} ${x - 2.4} ${y - 4} ${x} ${y - 7}Z`} fill="#fff0c2" className="flame" />
    </g>
  );
}

function EstateBannerImpl({ ludus, week, star }: { ludus: Ludus; week: number; star?: Creature | null }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const b = ludus.buildings;
  const rnd = seeded(week * 31 + 7);
  const stars = Array.from({ length: 46 }, () => [rnd() * 800, rnd() * 120, 0.4 + rnd() * 1.1] as const);
  const phase = week % 4; // 0 full, 1 waning, 2 new-ish, 3 waxing
  const moonShift = [0, 14, 30, -14][phase];
  const res = b.residence ?? 0;
  const wall = b.palisade ?? 0;
  const glow = `url(#${id}-kiln)`;
  return (
    <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice" role="img" aria-label={`${ludus.name} at night`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06060c" />
          <stop offset="0.55" stopColor="#171329" />
          <stop offset="1" stopColor="#3b2330" />
        </linearGradient>
        <radialGradient id={`${id}-kiln`}>
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#e3693b" stopOpacity="0.35" />
          <stop offset="1" stopColor="#e3693b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="eb-torchglow">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff9b3d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-moonglow`}>
          <stop offset="0" stopColor="#f3e6c8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f3e6c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1512" />
          <stop offset="1" stopColor="#0b0807" />
        </linearGradient>
        <clipPath id={`${id}-moon`}><circle cx="668" cy="62" r="22" /></clipPath>
      </defs>
      <rect width="800" height="300" fill={`url(#${id}-sky)`} />
      {stars.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#f3ead8" opacity={0.35 + (i % 5) * 0.12} className={i % 7 === 0 ? 'twinkle' : undefined} />)}
      <circle cx="668" cy="62" r="70" fill={`url(#${id}-moonglow)`} />
      <g clipPath={`url(#${id}-moon)`}>
        <circle cx="668" cy="62" r="22" fill="#efe2c2" />
        {phase !== 0 && <circle cx={668 + moonShift} cy="58" r="22" fill="#141024" />}
        <circle cx="660" cy="56" r="4" fill="#d9c9a3" opacity={0.7} />
        <circle cx="674" cy="70" r="3" fill="#d9c9a3" opacity={0.6} />
      </g>
      {/* Vesuvius */}
      <path d="M330 210L450 112L476 104L494 110L520 104L660 210Z" fill="#1c1527" />
      <path d="M476 104C470 80 492 70 486 46C500 66 512 60 506 34" fill="none" stroke="#6b6070" strokeOpacity="0.35" strokeWidth="14" strokeLinecap="round" className="smoke" />
      <path d="M0 214C80 190 150 198 230 186C320 172 380 196 470 186C560 176 650 196 800 180V300H0Z" fill="#16111d" />
      {/* aqueduct in the distance */}
      {(b.aqueduct ?? 0) > 0 && (
        <g fill="#1d1724">
          <rect x="520" y="168" width="240" height="8" />
          {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${524 + i * 30} 176h26v24h-4a9 9 0 0 0-18 0h-4z`} />)}
        </g>
      )}
      {/* ground */}
      <path d="M0 236C120 226 240 230 400 224C560 218 680 228 800 222V300H0Z" fill={`url(#${id}-ground)`} />
      <path d="M330 300C360 262 380 244 410 232" fill="none" stroke="#2c211a" strokeWidth="18" strokeLinecap="round" />

      {/* temple on the hill */}
      {(b.templeOfPluto ?? 0) > 0 && (
        <g fill={INK}>
          <path d="M70 190l46-20 46 20z" />
          <rect x="74" y="190" width="84" height="5" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={78 + i * 17} y="195" width="6" height="26" />)}
          <rect x="70" y="220" width="92" height="6" />
          <circle cx="116" cy="207" r="9" fill="url(#eb-torchglow)" />
        </g>
      )}

      {/* residence */}
      <g fill={INK}>
        {res === 0 && (
          <>
            <path d="M300 214l34-22 34 22z" />
            <rect x="306" y="214" width="56" height="26" />
            <Window x={326} y={222} />
          </>
        )}
        {res >= 1 && (
          <>
            <path d={`M262 ${res >= 2 ? 178 : 196}l82-${res >= 2 ? 30 : 24} 82 ${res >= 2 ? 30 : 24}z`} />
            <rect x="270" y={res >= 2 ? 178 : 196} width="148" height={res >= 2 ? 62 : 44} />
            {res >= 2 && <rect x="270" y="206" width="148" height="3" fill="#2a201a" />}
            {[0, 1, 2, 3, 4].map((i) => <Window key={i} x={282 + i * 27} y={res >= 2 ? 216 : 208} on={i % 2 === 0 || res >= 3} />)}
            {res >= 2 && [0, 1, 2, 3].map((i) => <Window key={`u${i}`} x={294 + i * 30} y={186} w={7} h={9} on={i !== 1} />)}
            {res >= 3 && (
              <>
                <rect x="400" y="142" width="32" height="98" />
                <path d="M396 142l20-16 20 16z" />
                <Window x={411} y={156} w={10} h={14} />
              </>
            )}
            {res >= 4 && [0, 1, 2, 3, 4, 5].map((i) => <rect key={`c${i}`} x={268 + i * 30} y="226" width="6" height="14" fill="#2a201a" />)}
          </>
        )}
      </g>

      {/* hatchery kiln */}
      {(b.hatchery ?? 0) > 0 && (
        <g>
          <circle cx="498" cy="226" r={34 + (b.hatchery ?? 0) * 6} fill={glow} className="kiln-glow" />
          <path d={`M470 240C470 ${210 - (b.hatchery ?? 0) * 4} 526 ${210 - (b.hatchery ?? 0) * 4} 526 240Z`} fill={INK} />
          <path d="M490 240v-12a8 8 0 0 1 16 0v12z" fill="#ff9b3d" opacity="0.9" className="flame" />
          <path d="M512 214c4-14-4-22 4-34" fill="none" stroke="#6b6070" strokeOpacity="0.3" strokeWidth="6" strokeLinecap="round" className="smoke" />
        </g>
      )}

      {/* nursery hut + lantern */}
      {(b.nursery ?? 0) > 0 && (
        <g fill={INK}>
          <path d="M540 230l20-14 20 14z" />
          <rect x="544" y="230" width="32" height="14" />
          <circle cx="584" cy="232" r="10" fill="url(#eb-torchglow)" />
          <circle cx="584" cy="232" r="2" fill={LIT} />
        </g>
      )}

      {/* breeding pens */}
      {(b.breedingPen ?? 0) > 0 && (
        <g stroke={INK} strokeWidth="3" fill="none">
          <path d="M600 252h120M600 240h120" />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${602 + i * 19.5} 234v24`} />)}
          {(b.breedingPen ?? 0) >= 2 && <path d="M720 252h60M720 240h60M740 234v24M760 234v24M778 234v24" />}
          <path d="M640 250c6-10 20-12 30-6 6-6 14-6 18 0l-2 6h-46z" fill={INK} stroke="none" />
        </g>
      )}

      {/* training field */}
      {(b.trainingField ?? 0) > 0 && (
        <g fill={INK}>
          <ellipse cx="196" cy="252" rx="56" ry="9" fill="#2a1f18" />
          {[0, 1, 2].map((i) => <rect key={i} x={164 + i * 30} y={228} width="5" height="24" />)}
          <rect x="160" y="232" width="74" height="3" />
        </g>
      )}

      {/* forge chimney */}
      {(b.forge ?? 0) > 0 && (
        <g>
          <rect x="236" y="196" width="24" height="44" fill={INK} />
          <rect x="242" y="176" width="10" height="20" fill={INK} />
          <rect x="242" y="214" width="12" height="10" fill="#ff7a2a" opacity="0.9" className="win" />
          {[0, 1, 2].map((i) => <circle key={i} cx={247 + i * 3} cy={168 - i * 9} r={1.6} fill="#ffb347" className="ember" style={{ animationDelay: `${i * 0.6}s` }} />)}
        </g>
      )}

      {/* kitchen smoke */}
      {(b.kitchen ?? 0) > 0 && (
        <g>
          <rect x="452" y="216" width="16" height="24" fill={INK} />
          <path d="M460 212c-6-10 6-16 0-28" fill="none" stroke="#6b6070" strokeOpacity="0.28" strokeWidth="5" strokeLinecap="round" className="smoke" />
        </g>
      )}

      {/* guard tower */}
      {(b.guardTower ?? 0) > 0 && (
        <g fill={INK}>
          <rect x="22" y="150" width="20" height="92" />
          <path d="M16 150h32l-4-10H20z" />
          <circle cx="32" cy="136" r="14" fill="url(#eb-torchglow)" />
        </g>
      )}

      {/* palisade / walls */}
      {wall >= 1 && (
        <g fill={INK2}>
          {wall === 1
            ? Array.from({ length: 40 }, (_, i) => <path key={i} d={`M${i * 20} 300V${266 + (i % 3) * 2}l5-8 5 8V300z`} />)
            : (
              <>
                <rect x="0" y="266" width="800" height="34" />
                {Array.from({ length: 40 }, (_, i) => <rect key={i} x={i * 20 + 2} y="258" width="12" height="10" />)}
              </>
            )}
        </g>
      )}
      {/* the star of the ludus at the gate */}
      {star && (
        <g transform="translate(560 172)">
          <DinoArt creature={star} width={168} animate={false} />
        </g>
      )}
      <Torch x={372} y={250} />
      <Torch x={430} y={250} />
      <rect x="378" y="246" width="48" height="6" fill={INK2} />
    </svg>
  );
}

export const EstateBanner = memo(EstateBannerImpl);
