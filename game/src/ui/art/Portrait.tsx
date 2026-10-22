// Portraits for story actors and the lanista (simple painted busts). Spartacus is a dino.
import React, { memo } from 'react';
import type { StoryActor } from '../../engine/types';
import { DinoArt } from './DinoArt';

interface Look { skin: string; hair: string; style: 'short' | 'bald' | 'curly' | 'long' | 'hood' | 'helmet' | 'wreath' | 'veil'; toga: string; trim: string; beard?: boolean; eye?: string }

const LOOKS: Partial<Record<StoryActor | 'player-m' | 'player-f', Look>> = {
  solonius: { skin: '#c79a74', hair: '#2b211b', style: 'bald', toga: '#e8dcc0', trim: '#5e3a7a' },
  batiatus: { skin: '#b9876a', hair: '#2a1d14', style: 'curly', toga: '#7a5232', trim: '#9e3326', beard: true },
  vettius: { skin: '#d2a582', hair: '#1d1712', style: 'short', toga: '#3b3f8f', trim: '#c9a227' },
  decimus: { skin: '#c9a07c', hair: '#9a948c', style: 'short', toga: '#d9cdb4', trim: '#2f7a66', beard: true },
  caesar: { skin: '#d6ab88', hair: '#3a2c20', style: 'wreath', toga: '#efe3c4', trim: '#a3202a' },
  magnus: { skin: '#b07e5e', hair: '#5a4632', style: 'curly', toga: '#5c6167', trim: '#c58a2b' },
  crassus: { skin: '#d8b090', hair: '#8f8a84', style: 'short', toga: '#c9a227', trim: '#5a0f1a' },
  hannibal: { skin: '#9c6e50', hair: '#1d1b1a', style: 'helmet', toga: '#5a4632', trim: '#c9a227', beard: true },
  pythia: { skin: '#d9b08c', hair: '#1d1b1a', style: 'veil', toga: '#5e3a7a', trim: '#c9a227', eye: '#e2b93b' },
  hag: { skin: '#a89a86', hair: '#8f8a84', style: 'hood', toga: '#3a3633', trim: '#56662f' },
  hector: { skin: '#c99a76', hair: '#2b211b', style: 'helmet', toga: '#8c3a2e', trim: '#c9a227' },
  veteran: { skin: '#b5866a', hair: '#5c6167', style: 'helmet', toga: '#5a4632', trim: '#8a6a3f', beard: true },
  spy: { skin: '#9c7b62', hair: '#1d1b1a', style: 'hood', toga: '#1d1b1a', trim: '#3a3633' },
  unknown: { skin: '#3a3633', hair: '#1d1b1a', style: 'hood', toga: '#1d1b1a', trim: '#1d1b1a' },
  'player-m': { skin: '#cfa07e', hair: '#3a2716', style: 'short', toga: '#e8dcc0', trim: '#9e3326' },
  'player-f': { skin: '#d7ab8a', hair: '#2a1a10', style: 'long', toga: '#e8dcc0', trim: '#2f7a66' },
};

function Bust({ look, size }: { look: Look; size: number }) {
  const { skin, hair, style, toga, trim, beard, eye } = look;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" fill="#5a1a14" />
      <circle cx="24" cy="14" r="22" fill="#9e3326" opacity="0.45" />
      {/* shoulders and toga */}
      <path d="M4 48c1-10 8-15 20-15s19 5 20 15z" fill={toga} />
      <path d="M14 35c4 6 10 12 22 13" stroke={trim} strokeWidth="2.4" fill="none" />
      <rect x="20" y="27" width="8" height="8" fill={skin} />
      {/* head */}
      {(style === 'long' || style === 'veil') && <path d="M12 22c-2 10 1 16 4 18h16c3-2 6-8 4-18z" fill={style === 'veil' ? toga : hair} />}
      {style === 'hood' && <path d="M9 26c0-14 7-20 15-20s15 6 15 20v10H9z" fill={toga} />}
      <ellipse cx="24" cy="20" rx="8.6" ry="10" fill={skin} />
      {style === 'short' && <path d="M15.4 18c0-7 4-10 8.6-10s8.6 3 8.6 10c-2-3-5-4.6-8.6-4.6S17.4 15 15.4 18z" fill={hair} />}
      {style === 'curly' && <path d="M15 19c-2-8 3-12 9-12s11 4 9 12c-1-2-2-4-3-4-1 1-3 1-4 0-1 1-3 1-4 0-1 1-3 1-4 0-1 0-2 2-3 4z" fill={hair} />}
      {style === 'bald' && <path d="M15.6 21c-.4-2 0-3 .6-4M32.4 21c.4-2 0-3-.6-4" stroke={hair} strokeWidth="2" />}
      {style === 'long' && <path d="M15.4 19c0-7 4-11 8.6-11s8.6 4 8.6 11c-3-4-5.4-5-8.6-5s-5.6 1-8.6 5z" fill={hair} />}
      {style === 'veil' && <path d="M14 18c0-8 5-12 10-12s10 4 10 12c-3-3-6-4-10-4s-7 1-10 4z" fill={toga} />}
      {style === 'wreath' && (
        <>
          <path d="M15.4 18c0-7 4-10 8.6-10s8.6 3 8.6 10c-2-3-5-4.6-8.6-4.6S17.4 15 15.4 18z" fill={hair} />
          <path d="M15 15c3-4 6-5 9-5s6 1 9 5" stroke="#c9a227" strokeWidth="2.4" fill="none" strokeDasharray="2 1.4" />
        </>
      )}
      {style === 'helmet' && (
        <>
          <path d="M14.6 19c0-8 4.4-11.4 9.4-11.4S33.4 11 33.4 19z" fill="#8a6a3f" />
          <path d="M24 7.6c-6-3-12 0-14 4" stroke="#9e3326" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
      {style === 'hood' && <path d="M14 20c0-9 5-13 10-13s10 4 10 13c-2-5-5-7-10-7s-8 2-10 7z" fill={toga} />}
      {beard && <path d="M16.4 23c1 6 4 8.6 7.6 8.6s6.6-2.6 7.6-8.6c-2 2-4.6 2.4-7.6 2.4s-5.6-.4-7.6-2.4z" fill={hair} />}
      <circle cx="20.6" cy="20" r="1.1" fill={eye ?? '#1d1712'} />
      <circle cx="27.4" cy="20" r="1.1" fill={eye ?? '#1d1712'} />
      <path d="M21.6 26.2c1.6.9 3.2.9 4.8 0" stroke="#5a2a20" strokeWidth="1" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PortraitImpl({ actor, size = 44, female }: { actor: StoryActor | 'player-m' | 'player-f'; size?: number; female?: boolean }) {
  if (actor === 'spartacus') {
    return (
      <span className="portrait" style={{ width: size, height: size, display: 'grid', placeItems: 'end center' }}>
        <DinoArt species="allosaurus" colors={[12, 4, 0, 14, 8, 36]} framing="bust" width={size} height={size} animate={false} seed="spartacus" />
      </span>
    );
  }
  if (actor === 'narrator') {
    return (
      <span className="portrait" style={{ width: size, height: size, display: 'grid', placeItems: 'center', color: '#e3a33b' }}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7 4.5h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1z" /><path d="M7 16.5V4.5a2 2 0 0 0-2 2v1.8h2" /></svg>
      </span>
    );
  }
  const key = actor === 'player' ? (female ? 'player-f' : 'player-m') : actor;
  const look = LOOKS[key] ?? LOOKS.unknown!;
  return (
    <span className="portrait" style={{ width: size, height: size }}>
      <Bust look={look} size={size} />
    </span>
  );
}

export const Portrait = memo(PortraitImpl);

export const ACTOR_NAME: Partial<Record<StoryActor, string>> = {
  solonius: 'Solonius', batiatus: 'Batiatus', vettius: 'Vettius', decimus: 'Decimus', caesar: 'Caesar', magnus: 'Magnus',
  crassus: 'Crassus', hannibal: 'Hannibal', spartacus: 'Spartacus', pythia: 'The Pythia', hector: 'Hector', hag: 'The old hag',
  veteran: 'An old veteran', spy: 'Your spy', unknown: 'A stranger', narrator: '',
};
