// DinoArt: an SVG portrait/sprite for any creature, side view facing right (flip prop to face left).
// Six ARK colour regions from genes.colors: 0 body, 1 underbelly, 2 pattern (clipped overlay),
// 3 crest/frill/sail/horns, 4 back plates/spikes/feathers, 5 eyes & claws.
// Painted look: dark outer outline, vertical shade gradient, top rim highlight, per-feature shading.
// Babies get a bigger head and smaller body; gear shows as a bronze band, helmet cap, rider and a glint.

import React, { memo, useId } from 'react';
import type { Creature, Sex, SpeciesId } from '../../engine/types';
import { SPECIES } from '../../engine/data/species';
import { colorHex } from '../../engine/data/colors';
import { planFor, type Plan, type Region, type Shape } from './plans';
import { circle, darken, ellipse, lighten, luminance, mix, poly, seeded, tube, blob } from './geom';
import { hashStr } from '../format';

export interface GearHints { armor?: boolean; helmet?: boolean; rider?: boolean; weapon?: boolean }

export interface DinoArtProps {
  creature?: Pick<Creature, 'id' | 'species' | 'sex' | 'maturity' | 'genes' | 'gear'> | null;
  species?: SpeciesId;
  colors?: number[];
  sex?: Sex;
  maturity?: number;
  seed?: string;
  gear?: GearHints;
  /** face left */
  flip?: boolean;
  /** full side view, or a head-and-shoulders crop for thumbnails */
  framing?: 'full' | 'bust';
  /** rendered width in px (height follows the frame aspect) */
  width?: number;
  height?: number;
  /** extra scale inside the frame (battle sprites use size class) */
  scale?: number;
  /** draw young creatures at full frame size (default for bust framing); otherwise they are smaller */
  fill?: boolean;
  animate?: boolean;
  /** greyed out (knocked out, dead, tomb) */
  dead?: boolean;
  showSex?: boolean;
  className?: string;
  title?: string;
}

const OUTLINE = '#120d0a';
const BONE = '#e7dcc2';

function gearFromCreature(c: DinoArtProps['creature']): GearHints {
  const g = c?.gear ?? {};
  return { armor: !!g.armor, helmet: !!g.helmet, rider: !!g.rider, weapon: !!(g.weapon || g.offhand) };
}

function patternPaths(plan: Plan, seed: number): string[] {
  const [x0, y0, x1, y1] = plan.patternBox;
  if (plan.pattern === 'none' || x1 <= x0) return [];
  const rnd = seeded(seed);
  const out: string[] = [];
  const H = y1 - y0;
  switch (plan.pattern) {
    case 'stripes': {
      const step = 10 + rnd() * 5;
      for (let x = x0 + rnd() * step; x < x1; x += step * (0.8 + rnd() * 0.45)) {
        const w = 3 + rnd() * 3.2;
        const len = H * (0.55 + rnd() * 0.5);
        const lean = -3 - rnd() * 5;
        out.push(tube([[x, y0 - 6, w], [x + lean * 0.5, y0 + len * 0.5, w * 0.8], [x + lean, y0 + len, 0]]));
      }
      break;
    }
    case 'spots': {
      const n = 16 + Math.floor(rnd() * 10);
      for (let i = 0; i < n; i++) {
        const cx = x0 + rnd() * (x1 - x0);
        const cy = y0 + rnd() * H * 0.85;
        const r = 1.8 + rnd() * 3.4;
        out.push(ellipse(cx, cy, r * 1.3, r));
      }
      break;
    }
    case 'bands': {
      const step = 17 + rnd() * 7;
      for (let x = x0 + rnd() * step; x < x1; x += step) {
        const w = 5 + rnd() * 4;
        out.push(tube([[x, y0 - 8, w], [x - 2, y0 + H * 0.5, w * 1.05], [x - 3, y1 + 6, w * 0.8]]));
      }
      break;
    }
    case 'saddle': {
      const w = x1 - x0;
      out.push(blob([[x0, y0 + H * 0.55], [x0 + w * 0.18, y0 - 6], [x1 - w * 0.2, y0 - 8], [x1, y0 + H * 0.45], [x1 - w * 0.25, y0 + H * 0.62], [x0 + w * 0.45, y0 + H * 0.78]]));
      const n = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) out.push(ellipse(x0 + rnd() * w, y0 + H * (0.65 + rnd() * 0.3), 1.6 + rnd() * 2, 1.4 + rnd() * 1.4));
      break;
    }
  }
  return out;
}

function riderPaths(x: number, y: number) {
  return {
    blanket: blob([[x - 14, y + 1], [x - 6, y - 3], [x + 8, y - 3], [x + 14, y + 1], [x + 10, y + 7], [x - 10, y + 7]]),
    legs: tube([[x - 1, y - 1, 5], [x + 3, y + 9, 4], [x + 7, y + 15, 3]]),
    torso: tube([[x - 1, y - 1, 9.5], [x + 1, y - 9, 9], [x + 3, y - 15, 8]]),
    head: circle(x + 4, y - 20, 4.4),
    helm: `M${x - 0.6} ${y - 20.5}A4.8 4.8 0 0 1 ${x + 8.8} ${y - 20.5}Z`,
    plume: tube([[x + 2, y - 25, 2.4], [x - 3, y - 27, 2.6], [x - 8, y - 24, 0]]),
    shield: circle(x - 5, y - 8, 5),
    lanceA: [x - 18, y + 1] as [number, number],
    lanceB: [x + 40, y - 30] as [number, number],
    arm: tube([[x + 2, y - 13, 3.6], [x + 9, y - 9, 3], [x + 14, y - 12, 2.6]]),
  };
}

function DinoArtImpl(props: DinoArtProps) {
  const rawId = useId();
  const uid = `d${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = props.creature ?? null;
  const species: SpeciesId = c?.species ?? props.species ?? 'velociraptor';
  const sp = SPECIES[species];
  const plan = planFor(species);
  const regionIdx = c?.genes?.colors ?? props.colors ?? sp.palette.map((r) => r[0] ?? 0);
  const col = [0, 1, 2, 3, 4, 5].map((i) => colorHex(regionIdx[i] ?? 0));
  const [main, belly, pat, crest, back, eyeC] = col;
  const maturity = Math.max(0, Math.min(1, c?.maturity ?? props.maturity ?? 1));
  const sex = c?.sex ?? props.sex;
  const seed = hashStr(c?.id ?? props.seed ?? species);
  const gear = props.gear ?? gearFromCreature(c);
  const framing = props.framing ?? 'full';
  const young = 1 - maturity;

  // geometry transforms
  const fill = props.fill ?? framing === 'bust';
  const s = (props.scale ?? 1) * (fill ? 0.82 + 0.18 * maturity : 0.56 + 0.44 * maturity);
  const k = 1 + 0.55 * young; // head scale for babies
  const [px, py] = plan.head.pivot;
  const headT = k === 1 ? undefined : `translate(${px} ${py}) scale(${k.toFixed(3)}) translate(${-px} ${-py})`;
  const cx = plan.cx;
  const gy = plan.ground;
  const scaleT = s === 1 ? undefined : `translate(${cx} ${gy}) scale(${s.toFixed(3)}) translate(${-cx} ${-gy})`;

  let vb: [number, number, number, number] = [0, 0, 240, 160];
  if (framing === 'bust') {
    // tighter than the authored box, anchored on the head end (right) and the top
    const [bx0, by, bw0, bh0] = plan.bust;
    const bw = bw0 * 0.88;
    const bh = bh0 * 0.88;
    const bx = bx0 + bw0 - bw;
    const pad = young * 9;
    vb = [cx + (bx - cx) * s - pad, gy + (by - gy) * s - pad * 1.4, bw * s + pad * 2, bh * s + pad * 2];
    if (props.flip) vb[0] = 240 - vb[0] - vb[2];
  }
  const width = props.width ?? (framing === 'bust' ? 56 : 220);
  const height = props.height ?? Math.round((width * vb[3]) / vb[2]);

  const resolve = (r: Region, far = false): string => {
    let v: string;
    switch (r) {
      case 0: v = main; break;
      case 1: v = belly; break;
      case 2: v = pat; break;
      case 3: v = crest; break;
      case 4: v = back; break;
      case 5: v = eyeC; break;
      case 'bone': v = mix(BONE, crest, 0.12); break;
      case 'dark': v = '#15100c'; break;
      case 'shade': v = darken(main, 0.3); break;
      case 'mouth': v = '#3b1512'; break;
      case 'light': v = lighten(main, 0.22); break;
      case 'horn': v = mix(crest, BONE, 0.42); break;
      default: v = main;
    }
    return far ? darken(v, r === 5 ? 0.2 : 0.34) : v;
  };

  const shapes = (list: Shape[], far = false, keyBase = 's') =>
    list.map((sh, i) => {
      const fill = resolve(sh.r, far);
      if (sh.line) {
        return <path key={`${keyBase}${i}`} d={sh.d} fill="none" stroke={fill} strokeWidth={sh.line} strokeLinecap="round" opacity={sh.o} />;
      }
      return (
        <g key={`${keyBase}${i}`} opacity={sh.o}>
          <path d={sh.d} fill={fill} stroke={OUTLINE} strokeOpacity={0.55} strokeWidth={0.9} strokeLinejoin="round" />
          {!sh.flat && <path d={sh.d} fill={`url(#${uid}-sh)`} />}
        </g>
      );
    });

  const pats = patternPaths(plan, seed);
  const eyeR = plan.head.eye[2] * (1 + 0.45 * young);
  const [ex, ey] = plan.head.eye;
  const darkEye = luminance(eyeC) < 0.09;
  const nearLine = darken(main, 0.42);
  const topY = Math.max(0, plan.bust[1]);
  const rider = gear.rider ? riderPaths(plan.anchors.rider[0], plan.anchors.rider[1]) : null;
  const [hx, hy, hr, hrot] = plan.anchors.helmet;
  const flipT = props.flip ? 'translate(240 0) scale(-1 1)' : undefined;
  const animate = props.animate ?? width >= 120;
  const delay = -((seed % 3800) / 1000);

  return (
    <svg
      className={`dino-art${props.dead ? ' is-dead' : ''}${props.className ? ` ${props.className}` : ''}`}
      width={width}
      height={height}
      viewBox={vb.map((n) => n.toFixed(1)).join(' ')}
      role="img"
      aria-label={props.title ?? `${maturity < 1 ? 'Young ' : ''}${sp.name}${sex ? (sex === 'M' ? ', male' : ', female') : ''}`}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id={`${uid}-sh`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.58" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.36" />
        </linearGradient>
        <linearGradient id={`${uid}-shu`} gradientUnits="userSpaceOnUse" x1="0" y1={topY} x2="0" y2={gy}>
          <stop offset="0" stopColor="#fff2dc" stopOpacity="0.16" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </linearGradient>
        {plan.head.glow && (
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0" stopColor={lighten(eyeC, 0.3)} stopOpacity="0.9" />
            <stop offset="1" stopColor={eyeC} stopOpacity="0" />
          </radialGradient>
        )}
        <g id={`${uid}-sil`}>
          {plan.body.map((d, i) => <path key={`b${i}`} d={d} />)}
          <g transform={headT}>{plan.head.main.map((d, i) => <path key={`h${i}`} d={d} />)}</g>
          {plan.near.map((d, i) => <path key={`n${i}`} d={d} />)}
        </g>
        <clipPath id={`${uid}-cb`}>{plan.body.map((d, i) => <path key={i} d={d} />)}</clipPath>
        <clipPath id={`${uid}-ch`}>{plan.head.main.map((d, i) => <path key={i} d={d} />)}</clipPath>
        <clipPath id={`${uid}-ca`}>
          {plan.body.map((d, i) => <path key={`b${i}`} d={d} />)}
          {plan.near.map((d, i) => <path key={`n${i}`} d={d} />)}
        </clipPath>
        <mask id={`${uid}-rim`} maskUnits="userSpaceOnUse" x="-40" y="-40" width="320" height="240">
          <rect x="-40" y="-40" width="320" height="240" fill="#000" />
          <use href={`#${uid}-sil`} fill="#fff" />
          <use href={`#${uid}-sil`} fill="#000" transform="translate(1.2 2.6)" />
        </mask>
      </defs>
      <g transform={flipT}>
        <g transform={scaleT}>
          <ellipse cx={cx} cy={gy + 1.5} rx={plan.shadowW / 2} ry={plan.floating ? 3 : 4.2} fill="#000" opacity={plan.floating ? 0.14 : 0.3} />
          <g className={animate ? 'dino-breathe' : undefined} style={animate ? { animationDelay: `${delay}s` } : undefined}>
            {shapes(plan.far, true, 'f')}
            {shapes(plan.behind, false, 'bh')}
            <g transform={headT}>{shapes(plan.head.behind, false, 'hb')}</g>
            <use href={`#${uid}-sil`} fill={OUTLINE} stroke={OUTLINE} strokeWidth={3.2} strokeLinejoin="round" opacity={0.9} />
            <g fill={main}>{plan.body.map((d, i) => <path key={i} d={d} />)}</g>
            {plan.belly && <path d={plan.belly} fill={belly} clipPath={`url(#${uid}-cb)`} opacity={0.96} />}
            {pats.length > 0 && (
              <g fill={pat} clipPath={`url(#${uid}-cb)`} opacity={0.86}>
                {pats.map((d, i) => <path key={i} d={d} />)}
              </g>
            )}
            {shapes(plan.over, false, 'o')}
            <g transform={headT}>
              <g fill={main}>{plan.head.main.map((d, i) => <path key={i} d={d} />)}</g>
              {plan.head.belly && <path d={plan.head.belly} fill={belly} clipPath={`url(#${uid}-ch)`} opacity={0.95} />}
            </g>
            <g fill={main} stroke={nearLine} strokeOpacity={0.55} strokeWidth={1}>
              {plan.near.map((d, i) => <path key={i} d={d} />)}
            </g>
            <use href={`#${uid}-sil`} fill={`url(#${uid}-shu)`} />
            <rect x="-40" y="-40" width="320" height="240" fill="#fff4de" opacity={0.42} mask={`url(#${uid}-rim)`} />
            {gear.armor && (
              <g clipPath={`url(#${uid}-cb)`}>
                <path d={plan.anchors.band} fill="#8a6a3f" stroke="#3b2a16" strokeWidth={1} />
                <path d={plan.anchors.band} fill={`url(#${uid}-sh)`} />
                <path d={plan.anchors.band} fill="none" stroke="#d8b878" strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="1.4 4" />
              </g>
            )}
            <g transform={headT}>
              {shapes(plan.head.over, false, 'ho')}
              {plan.head.mouth && <path d={plan.head.mouth} fill="none" stroke={darken(main, 0.6)} strokeWidth={1.25} strokeLinecap="round" opacity={0.85} />}
              {plan.head.teeth && <path d={plan.head.teeth} fill={BONE} opacity={0.92} />}
              {plan.head.glow && <circle cx={ex} cy={ey} r={eyeR * 3.4} fill={`url(#${uid}-glow)`} />}
              <circle cx={ex} cy={ey} r={eyeR * 1.32} fill={darken(main, 0.55)} />
              <circle cx={ex} cy={ey} r={eyeR} fill={darkEye ? '#2a221c' : eyeC} />
              <ellipse cx={ex + eyeR * 0.22} cy={ey} rx={eyeR * 0.34} ry={eyeR * 0.72} fill="#0a0705" />
              <circle cx={ex - eyeR * 0.32} cy={ey - eyeR * 0.36} r={Math.max(0.55, eyeR * 0.32)} fill="#fff" opacity={0.88} />
              {gear.helmet && (
                <g transform={`rotate(${hrot} ${hx} ${hy})`}>
                  <path d={`M${hx - hr} ${hy + 3}A${hr} ${hr * 0.78} 0 0 1 ${hx + hr} ${hy + 3}Z`} fill="#8a6a3f" stroke="#3b2a16" strokeWidth={1} />
                  <path d={`M${hx - hr} ${hy + 3}A${hr} ${hr * 0.78} 0 0 1 ${hx + hr} ${hy + 3}Z`} fill={`url(#${uid}-sh)`} />
                  <path d={`M${hx - hr - 1.5} ${hy + 3.2}H${hx + hr + 1.5}`} stroke="#d8b878" strokeWidth={1.6} strokeLinecap="round" />
                  <path d={tube([[hx - hr * 0.2, hy - hr * 0.62, 2.8], [hx - hr * 0.7, hy - hr * 1.05, 3.4], [hx - hr * 1.4, hy - hr * 0.7, 0]])} fill="#9e3326" stroke="#3b1512" strokeWidth={0.7} />
                </g>
              )}
            </g>
            {shapes(plan.nearOver, false, 'no')}
            {gear.weapon && (
              <g transform={`translate(${plan.anchors.glint[0]} ${plan.anchors.glint[1]})`}>
                <g className={animate ? 'glint' : undefined}>
                  <path d="M0 -7L1.3 -1.3L7 0L1.3 1.3L0 7L-1.3 1.3L-7 0L-1.3 -1.3Z" fill="#fff8e6" />
                  <circle r="1.6" fill="#e3a33b" />
                </g>
              </g>
            )}
            {rider && (
              <g className="rider">
                <path d={smoothLine(rider.lanceA, rider.lanceB)} stroke="#d9c9a0" strokeWidth={1.8} strokeLinecap="round" />
                <path d={poly([[rider.lanceB[0] + 1, rider.lanceB[1] - 1], [rider.lanceB[0] - 6, rider.lanceB[1] + 1.2], [rider.lanceB[0] - 3.4, rider.lanceB[1] + 4.6]])} fill="#c9a227" />
                <path d={rider.shield} fill="#8a6a3f" stroke="#3b2a16" strokeWidth={1} />
                <path d={rider.legs} fill="#3a2a1e" stroke={OUTLINE} strokeWidth={0.8} />
                <path d={rider.blanket} fill="#9e3326" stroke="#3b1512" strokeWidth={0.9} />
                <path d={rider.torso} fill="#6b4a2e" stroke={OUTLINE} strokeWidth={0.8} />
                <path d={rider.arm} fill="#c89a72" stroke={OUTLINE} strokeWidth={0.6} />
                <path d={rider.head} fill="#c89a72" stroke={OUTLINE} strokeWidth={0.8} />
                <path d={rider.helm} fill="#8a6a3f" stroke="#3b2a16" strokeWidth={0.8} />
                <path d={rider.plume} fill="#9e3326" />
              </g>
            )}
          </g>
        </g>
      </g>
      {props.showSex && sex && (
        <g transform={`translate(${vb[0] + 6} ${vb[1] + 6}) scale(${(vb[2] / width) * 0.9})`} className="dino-sex" opacity={0.92}>
          <circle r="7" cx="6" cy="6" fill="#120d0a" opacity="0.6" />
          {sex === 'M' ? (
            <g fill="none" stroke="#8fc1e3" strokeWidth="1.6" strokeLinecap="round"><circle cx="5" cy="7" r="2.6" /><path d="M7 5l3-3M8 2h2v2" /></g>
          ) : (
            <g fill="none" stroke="#e7a3b8" strokeWidth="1.6" strokeLinecap="round"><circle cx="6" cy="5" r="2.6" /><path d="M6 7.6v3.4M4.4 9.4h3.2" /></g>
          )}
        </g>
      )}
    </svg>
  );
}

function smoothLine(a: [number, number], b: [number, number]): string {
  return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
}

export const DinoArt = memo(DinoArtImpl);

/** A framed portrait niche (fresco panel + bronze edge) for lists. */
export function DinoThumb({ creature, size = 56, dead, species, colors }: { creature?: DinoArtProps['creature']; size?: number; dead?: boolean; species?: SpeciesId; colors?: number[] }) {
  return (
    <span className="dino-thumb" style={{ width: size, height: size }}>
      <DinoArt creature={creature} species={species} colors={colors} framing="bust" width={size - 6} height={size - 6} dead={dead} animate={false} />
    </span>
  );
}
