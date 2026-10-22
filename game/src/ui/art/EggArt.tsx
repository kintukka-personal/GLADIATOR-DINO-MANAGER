// EggArt: a speckled egg coloured by the species palette; cracks as incubation nears its end;
// frost tint when kept too cold, heat shimmer when too hot.
import React, { memo, useId } from 'react';
import type { Egg, SpeciesId } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { colorHex } from '../../engine/data/colors';
import { darken, lighten, mix, seeded } from './geom';
import { hashStr } from '../format';

const SIZE_SCALE: Record<string, number> = { small: 0.74, medium: 0.86, large: 0.97, xlarge: 1.06, mythic: 1.06 };

export interface EggArtProps {
  egg?: Egg;
  species?: SpeciesId;
  /** px height */
  size?: number;
  /** 0..1 incubation progress */
  progress?: number;
  /** last temperature (°C) */
  temp?: number;
  fertilized?: boolean;
  health?: number;
  title?: string;
}

function EggArtImpl({ egg, species, size = 48, progress, temp, fertilized, health, title }: EggArtProps) {
  const uid = `e${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const id = egg?.species ?? species ?? 'velociraptor';
  const sp = SPECIES[id];
  const fert = egg?.fertilized ?? fertilized ?? true;
  const prog = progress ?? (egg && egg.needed > 0 ? egg.progress / egg.needed : 0);
  const t = temp ?? egg?.lastTemp;
  const hp = health ?? egg?.health ?? 1;
  const [lo, hi] = sp.tempRange;
  const cold = t !== undefined && t < lo;
  const hot = t !== undefined && t > hi;
  const pal = sp.palette;
  const seed = hashStr(egg?.id ?? id);
  const rnd = seeded(seed);
  const shellBase = lighten(mix(colorHex(pal[1][0] ?? 4), colorHex(pal[0][0] ?? 9), 0.25), fert ? 0.18 : 0.38);
  const speck = darken(colorHex(pal[2][0] ?? 7), 0.1);
  const speck2 = colorHex(pal[0][Math.floor(rnd() * pal[0].length)] ?? 8);
  const sc = SIZE_SCALE[sp.eggSize] ?? 0.9;
  const egPath = 'M20 3C30.6 3 37.4 20 37.4 31.6C37.4 43.4 29.6 50 20 50C10.4 50 2.6 43.4 2.6 31.6C2.6 20 9.4 3 20 3Z';
  const specks: [number, number, number][] = [];
  const n = 9 + Math.floor(rnd() * 8);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    specks.push([20 + Math.cos(a) * r * 14, 30 + Math.sin(a) * r * 15 - 2, 0.6 + rnd() * 1.7]);
  }
  const w = Math.round(size * (40 / 52));
  const label = title ?? `${sp.name} egg${!fert ? ' (unfertilized)' : ''}${cold ? ', too cold' : hot ? ', too hot' : ''}`;
  return (
    <svg className={`egg-art${hp < 0.35 ? ' is-weak' : ''}`} width={w} height={size} viewBox="0 0 40 52" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${uid}-hl`} cx="0.36" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id={`${uid}-cold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe6ff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#7cc6ff" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`${uid}-hot`} cx="0.5" cy="0.7" r="0.7">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ff5a2a" stopOpacity="0.55" />
        </radialGradient>
        <clipPath id={`${uid}-clip`}><path d={egPath} /></clipPath>
      </defs>
      <g transform={`translate(20 50) scale(${sc}) translate(-20 -50)`}>
        <ellipse cx="20" cy="50" rx="15" ry="2.4" fill="#000" opacity="0.3" />
        {hot && <path d={egPath} fill="none" stroke="#ff7a2a" strokeOpacity="0.45" strokeWidth="5" className="egg-heat" />}
        <path d={egPath} fill={shellBase} stroke="#120d0a" strokeOpacity="0.7" strokeWidth="1.2" />
        <g clipPath={`url(#${uid}-clip)`}>
          {specks.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r * 1.2} ry={r} fill={i % 3 === 0 ? speck2 : speck} opacity={fert ? 0.8 : 0.55} />)}
          <path d={egPath} fill={`url(#${uid}-hl)`} />
          {cold && (
            <>
              <path d={egPath} fill={`url(#${uid}-cold)`} />
              <path d="M6 44l3-3 2 3 3-4 3 4 3-3 3 3 3-4 3 4 3-3 3 3" fill="none" stroke="#eaf7ff" strokeWidth="1.2" opacity="0.85" />
            </>
          )}
          {hot && <path d={egPath} fill={`url(#${uid}-hot)`} />}
          {fert && prog >= 0.5 && (
            <path d="M20 9l-2.4 4.6 3.2 2.2-2.6 4.4" fill="none" stroke="#2a1d12" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
          )}
          {fert && prog >= 0.8 && (
            <path d="M9 26l4 2.6 3.4-3.4 3.6 3.6 3.2-3.6 4 3.2 3.8-2.4" fill="none" stroke="#2a1d12" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
          )}
        </g>
        {fert && prog >= 0.8 && <circle cx="20" cy="27" r="9" fill="#ffd27a" opacity="0.12" className="egg-pulse" />}
      </g>
    </svg>
  );
}

export const EggArt = memo(EggArtImpl);

/** A thermometer with the species' ideal band and a marker at the current temperature. */
export function Thermometer({ temp, range, min = 0, max = 45, label }: { temp?: number; range: [number, number]; min?: number; max?: number; label?: string }) {
  const H = 120;
  const y = (v: number) => 8 + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * (H - 24);
  const ok = temp !== undefined && temp >= range[0] && temp <= range[1];
  const col = temp === undefined ? 'var(--muted)' : ok ? 'var(--good)' : temp < range[0] ? 'var(--info)' : 'var(--bad)';
  return (
    <svg className="thermo" width="34" height={H} viewBox={`0 0 34 ${H}`} role="img" aria-label={label ?? `Temperature ${temp ?? '?'} degrees, ideal ${range[0]} to ${range[1]}`}>
      <rect x="11" y="6" width="12" height={H - 22} rx="6" fill="var(--wall)" stroke="var(--line)" />
      <rect x="11" y={y(range[1])} width="12" height={y(range[0]) - y(range[1])} fill="var(--good)" opacity="0.28" />
      <line x1="8" x2="26" y1={y(range[1])} y2={y(range[1])} stroke="var(--good)" strokeWidth="1" opacity="0.8" />
      <line x1="8" x2="26" y1={y(range[0])} y2={y(range[0])} stroke="var(--good)" strokeWidth="1" opacity="0.8" />
      {temp !== undefined && <rect x="14.5" y={y(temp)} width="5" height={H - 14 - y(temp)} rx="2.5" fill={col} />}
      <circle cx="17" cy={H - 10} r="8" fill={col} stroke="var(--line)" />
      {temp !== undefined && <path d={`M4 ${y(temp)}l6 0`} stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
