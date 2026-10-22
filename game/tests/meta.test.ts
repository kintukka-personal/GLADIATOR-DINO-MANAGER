import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

vi.mock('../src/engine/influence', async () => (await import('./storiesFixture')).influenceMock);

import { UPGRADES, UPGRADE_IDS, buyUpgrade, upgradeAvailable, amberBalance, upgradeLockReason, refundUpgrades, upgradeCatalogueCost } from '../src/engine/upgrades';
import { ACHIEVEMENTS, checkAchievements, grantAchievements, unlockAchievement } from '../src/engine/achievements';
import { makeState, emptyMetaForTest, dino, addTo, resetMocks, influenceMock } from './storiesFixture';

function unionMembers(name: string): string[] {
  const src = readFileSync(new URL('../src/engine/types.ts', import.meta.url), 'utf8');
  const start = src.indexOf(`export type ${name} =`);
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
}

beforeEach(() => resetMocks());

describe('upgrade catalogue', () => {
  it('covers every UpgradeId with GM costs and categories', () => {
    const ids = unionMembers('UpgradeId');
    expect(ids.filter((i) => !(i in UPGRADES))).toEqual([]);
    expect(UPGRADE_IDS.length).toBe(ids.length);
    // 56 GM upgrades − 7 free quality-of-life ones + 2 breeding upgrades
    expect(ids.length).toBe(51);
    expect(UPGRADES.senatorTree.cost).toBe(250);
    expect(UPGRADES.venomFangs.cost).toBe(50);
    expect(UPGRADES.brawlers).toMatchObject({ cost: 150, lockedBy: 'student', category: 'creatures' });
    expect(UPGRADES.egyptianAncestry).toMatchObject({ cost: 200, parent: 'greekHeritage' });
    expect(UPGRADES.supremeArmory.parent).toBe('masterSmith');
    expect(UPGRADES.hannibalsLegacy.parent).toBe('carthaginianArtifacts');
    expect(UPGRADES.spartanDynasty.parent).toBe('bashPlate');
    expect(UPGRADES.nightmareMode.lockedBy).toBe('divineHard');
    expect(UPGRADES.geneticist).toMatchObject({ cost: 150, category: 'breeding' });
    expect(UPGRADES.mutagenLab).toMatchObject({ cost: 200, lockedBy: 'mutant' });
    for (const u of Object.values(UPGRADES)) {
      if (u.parent) expect(UPGRADES[u.parent]).toBeTruthy();
      if (u.lockedBy) expect(ACHIEVEMENTS[u.lockedBy]).toBeTruthy();
    }
    expect(upgradeCatalogueCost()).toBeGreaterThan(6000);
  });

  it('buys with Amber, respecting parents and achievement locks', () => {
    const meta = emptyMetaForTest();
    expect(amberBalance(meta)).toBe(250);
    expect(upgradeAvailable(meta, 'egyptianAncestry')).toMatch(/Greek Heritage/);
    expect(upgradeAvailable(meta, 'brawlers')).toMatch(/Student/);
    expect(buyUpgrade(meta, 'greekHeritage')).toBeNull();
    expect(meta.amber).toBe(100);
    expect(meta.upgrades).toEqual(['greekHeritage']);
    expect(buyUpgrade(meta, 'greekHeritage')).toMatch(/Already/);
    expect(upgradeLockReason(meta, 'egyptianAncestry')).toBeNull();
    expect(buyUpgrade(meta, 'egyptianAncestry')).toMatch(/Amber/);
    meta.achievements.push('student');
    meta.amber = 150;
    expect(buyUpgrade(meta, 'brawlers')).toBeNull();
    expect(meta.amber).toBe(0);
    expect(refundUpgrades(meta)).toBe(300);
    expect(meta.amber).toBe(300);
    expect(meta.upgrades).toEqual([]);
  });
});

describe('achievement catalogue', () => {
  it('covers every AchievementId with 50 or 100 Amber', () => {
    const ids = unionMembers('AchievementId');
    expect(ids.filter((i) => !(i in ACHIEVEMENTS))).toEqual([]);
    for (const a of Object.values(ACHIEVEMENTS)) expect([50, 100]).toContain(a.amber);
    expect(ACHIEVEMENTS.tripleMutation.hidden).toBe(true);
    expect(ACHIEVEMENTS.stillStanding.hidden).toBe(true);
    expect(ACHIEVEMENTS.eliminateOpponent.name).toBe('Veni Vidi Vici');
  });
});

describe('checkAchievements', () => {
  it('grants the weekly state-based achievements', () => {
    const s = makeState({ hard: true });
    const me = s.player.ludus;
    me.denarii = 2500;
    me.influence = 150;
    me.buildings.residence = 3;
    me.buildings.trainingField = 2;
    const [a] = addTo(me, dino('Rex', { fame: 120, level: 10 }));
    a.prof = { claw: 150, fang: 150, horn: 160, mace: 150, spit: 151, jaw: 150, whip: 0 };
    a.traits.push('HorribleDisfigurement', 'Blind', 'BumLeg', 'Crippled', 'MissingFingers', 'Concussion');
    me.trophies.push({ league: 'lunar', place: 1, week: 13, creatureName: 'Rex' }, { league: 'lunar', place: 2, week: 13, creatureName: 'B' },
      { league: 'lunar', place: 3, week: 13, creatureName: 'C' });
    checkAchievements(s);
    const got = s.pendingAchievements;
    for (const id of ['greedIsGood', 'influencer', 'influencerHard', 'famous', 'decanus', 'builder', 'weaponsMasterAch', 'stillStanding', 'lunarChampion'] as const) {
      expect(got).toContain(id);
    }
    expect(got).not.toContain('influencerNightmare');
    expect(got).not.toContain('leagueSweep');
    expect(got).not.toContain('peopleManager');
  });

  it('people manager, league sweep, completionist and difficulty variants', () => {
    const s = makeState({ nightmare: true });
    const me = s.player.ludus;
    me.influence = 1500;
    for (let i = 0; i < 5; i++) addTo(me, dino(`D${i}`)).forEach((c) => { c.loyalty = 85; });
    for (const league of ['lunar', 'solar'] as const) for (const place of [1, 2, 3] as const) me.trophies.push({ league, place, week: 30, creatureName: 'x' });
    influenceMock.treeFor.mockReturnValueOnce([[{ id: 'publicSessions' }], [{ id: 'takeLoan' }]]);
    s.player.opportunities = ['publicSessions', 'takeLoan'];
    unlockAchievement(s, 'wonTournament');
    unlockAchievement(s, 'adventurer');
    checkAchievements(s);
    const got = s.pendingAchievements;
    for (const id of ['peopleManager', 'leagueSweep', 'solarChampion', 'completionist', 'influencerNightmare', 'wonTournamentHard', 'wonTournamentNightmare', 'adventurerNightmare'] as const) {
      expect(got).toContain(id);
    }
  });

  it('never grants anything in Sandbox games', () => {
    const s = makeState({ sandbox: true });
    s.player.ludus.denarii = 5000;
    s.pendingAchievements.push('firstClutch');
    unlockAchievement(s, 'wonTournament');
    checkAchievements(s);
    expect(s.pendingAchievements).toEqual([]);
    const meta = emptyMetaForTest();
    s.pendingAchievements.push('famous');
    expect(grantAchievements(meta, s)).toEqual([]);
    expect(meta.achievements).toEqual([]);
  });

  it('grantAchievements pays Amber once and enforces Divine (hard) before Divine (nightmare)', () => {
    const s = makeState();
    const meta = emptyMetaForTest();
    s.pendingAchievements.push('famous', 'student', 'divineNightmare');
    expect(grantAchievements(meta, s)).toEqual(['famous', 'student']);
    expect(meta.amber).toBe(250 + 100 + 50);
    expect(s.pendingAchievements).toEqual([]);
    s.pendingAchievements.push('famous', 'divineHard', 'divineNightmare');
    expect(grantAchievements(meta, s)).toEqual(['divineHard', 'divineNightmare']);
    expect(meta.amber).toBe(250 + 150 + 200);
  });
});
