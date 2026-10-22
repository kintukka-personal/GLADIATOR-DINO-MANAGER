import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { TRAITS } from '../src/engine/data/traits';
import { TECHNIQUES } from '../src/engine/data/techniques';
import { GEAR, UNIQUES } from '../src/engine/data/gear';
import { SPECIES } from '../src/engine/data/species';

function unionMembers(name: string): string[] {
  const src = readFileSync(new URL('../src/engine/types.ts', import.meta.url), 'utf8');
  const start = src.indexOf(`export type ${name} =`);
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
}

describe('data catalogues cover every id', () => {
  it('traits', () => {
    const missing = unionMembers('TraitId').filter((t) => !(t in TRAITS));
    expect(missing).toEqual([]);
  });
  it('techniques', () => {
    expect(unionMembers('TechId').filter((t) => !(t in TECHNIQUES))).toEqual([]);
  });
  it('gear', () => {
    expect(unionMembers('GearTypeId').filter((t) => !(t in GEAR))).toEqual([]);
    for (const g of Object.values(GEAR)) expect(g.lines.length).toBe(6);
    for (const u of Object.values(UNIQUES)) expect(GEAR[u.base]).toBeTruthy();
  });
  it('species', () => {
    const ids = [...unionMembers('DinoSpeciesId'), ...unionMembers('BeastSpeciesId')];
    expect(ids.filter((s) => !(s in SPECIES))).toEqual([]);
    for (const s of Object.values(SPECIES)) expect(s.palette.length).toBe(6);
  });
});
