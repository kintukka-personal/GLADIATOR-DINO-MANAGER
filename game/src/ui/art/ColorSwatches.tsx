// ARK colour-region swatches with names (colorName from data/colors.ts).
import React from 'react';
import { colorHex, colorName } from '../../engine/data/colors';
import { REGION_NAMES } from '../format';

export function ColorSwatches({ colors, compact, highlight }: { colors: number[]; compact?: boolean; highlight?: number[] }) {
  if (compact) {
    return (
      <span className="swatches-compact" aria-label={colors.map((c, i) => `${REGION_NAMES[i]}: ${colorName(c)}`).join(', ')}>
        {colors.slice(0, 6).map((c, i) => <span key={i} className="sw" style={{ background: colorHex(c) }} title={`${REGION_NAMES[i]}: ${colorName(c)}`} />)}
      </span>
    );
  }
  return (
    <ul className="swatches">
      {colors.slice(0, 6).map((c, i) => (
        <li key={i} className={highlight?.includes(i) ? 'hl' : undefined}>
          <span className="sw" style={{ background: colorHex(c) }} />
          <span className="sw-text">
            <span className="micro">{i} · {REGION_NAMES[i]}</span>
            <span className="small">{colorName(c)} <span className="muted xs num">#{c}</span></span>
          </span>
        </li>
      ))}
    </ul>
  );
}
