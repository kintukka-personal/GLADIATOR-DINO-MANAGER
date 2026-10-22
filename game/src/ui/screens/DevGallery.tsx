// Dev-only art gallery (#gallery): every species at detail and thumbnail size, babies and gear overlays.
import React from 'react';
import { SPECIES } from '../../engine/data/species';
import type { SpeciesId } from '../../engine/types';
import { DinoArt, DinoThumb } from '../art/DinoArt';
import { EggArt } from '../art/EggArt';

export function DevGallery() {
  const ids = Object.keys(SPECIES) as SpeciesId[];
  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {ids.map((id, i) => {
        const pal = SPECIES[id].palette;
        const colors = pal.map((r, j) => r[(i + j) % r.length]);
        return (
          <div key={id} className="panel" style={{ padding: 10 }}>
            <div className="micro">{SPECIES[id].body} · {id}</div>
            <div style={{ background: 'var(--fresco-panel)', borderRadius: 4 }}>
              <DinoArt species={id} colors={colors} width={280} seed={id} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 6 }}>
              <DinoThumb species={id} colors={colors} />
              <DinoThumb species={id} colors={pal.map((r) => r[r.length - 1])} />
              <div style={{ width: 90 }}><DinoArt species={id} colors={colors} maturity={0.05} width={90} seed={id + 'b'} /></div>
              <div style={{ width: 90 }}><DinoArt species={id} colors={colors} maturity={0.45} width={90} seed={id + 'j'} gear={{ armor: true, helmet: true, rider: true, weapon: true }} /></div>
              {SPECIES[id].repro === 'egg' && <EggArt species={id} size={34} progress={0.8} temp={SPECIES[id].tempRange[0] - 3} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
