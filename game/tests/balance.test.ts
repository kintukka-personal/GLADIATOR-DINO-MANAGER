// Difficulty balance knobs (balance.ts): Normal softens Gladiator Manager's death spirals, Classic restores them.
import { describe, it, expect } from 'vitest';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { balance, feralRecruits, raidKeeperLimit, raidPlunderLimit, eventKeeperLimit } from '../src/engine/balance';
import { creatureUpkeepOf, levelSurcharge } from '../src/engine/economy';
import { raidArmyVsPlayer, hordeSize } from '../src/engine/horde';
import { makeCreature } from '../src/engine/creature';
import type { GameState } from '../src/engine/types';

function game(o: { hard?: boolean; nightmare?: boolean; classic?: boolean } = {}): GameState {
  return createNewGame({
    lanista: 'Test', female: false, heritage: 'roman', hard: !!o.hard || !!o.nightmare, nightmare: !!o.nightmare, sandbox: false,
    raidsDisabled: false, betrayalsDisabled: false, classic: o.classic, ascension: 0, slot: 1, seed: 7,
  }, emptyMeta());
}

describe('balance profiles', () => {
  it('get harsher from Normal to Nightmare, and Classic is GM', () => {
    const n = balance(game()), h = balance(game({ hard: true })), x = balance(game({ nightmare: true }));
    const c = balance(game({ classic: true }));
    expect(n.raidKeeperCap).toBeLessThan(h.raidKeeperCap);
    expect(h.raidKeeperCap).toBeLessThan(x.raidKeeperCap);
    expect(n.feralShare).toBeLessThan(x.feralShare);
    expect(n.upkeepSurchargeScale).toBeLessThan(h.upkeepSurchargeScale);
    expect(c).toMatchObject({ feralShare: 1, raidKeeperCap: 1, raidPlunderCap: 1, upkeepSurchargeScale: 1, raidGrace: 0, rogueSpawnPeriod: 1 });
    expect(game({ classic: true }).world.difficulty.classic).toBe(true);
    expect(game().world.difficulty.classic).toBeUndefined();
  });

  it('caps what one raid can take, but always lets it take something', () => {
    const s = game();
    expect(raidKeeperLimit(s, 20)).toBe(5);
    expect(raidKeeperLimit(s, 1)).toBe(1);
    expect(raidPlunderLimit(s, 1000)).toBe(400);
    expect(raidPlunderLimit(s, -50)).toBe(0);
    expect(eventKeeperLimit(s, 8)).toBe(2);
    const c = game({ classic: true });
    expect(raidKeeperLimit(c, 20)).toBe(20);
    expect(raidPlunderLimit(c, 1000)).toBe(1000);
  });

  it('sends only part of the carried-off keepers to the Horde', () => {
    expect(feralRecruits(game(), 8)).toBe(2);
    expect(feralRecruits(game({ classic: true }), 8)).toBe(8);
    expect(feralRecruits(game(), 0)).toBe(0);
  });

  it('raids the player with a smaller band on Normal', () => {
    const s = game();
    s.world.horde.ferals = 20;
    expect(hordeSize(s)).toBe(20);
    expect(raidArmyVsPlayer(s)).toBe(12);
    const c = game({ classic: true });
    c.world.horde.ferals = 20;
    expect(raidArmyVsPlayer(c)).toBe(20);
  });

  it('scales the level surcharge on upkeep', () => {
    const c = makeCreature({ species: 'velociraptor', level: 8 });
    c.level = 8;
    expect(levelSurcharge(c)).toBe(28);
    expect(levelSurcharge(c, 0.5)).toBe(14);
    expect(creatureUpkeepOf(c, true, 0.5)).toBe(19);
  });
});

describe('hub survival warnings', () => {
  it('flags a shrinking purse and an outnumbered garrison', async () => {
    const { attention } = await import('../src/ui/screens/attention');
    const s = game();
    s.world.week = 30;
    expect(attention(s).raidRisk).toBeNull();
    s.world.horde.ferals = 30;
    const r = attention(s).raidRisk;
    expect(r).not.toBeNull();
    expect(r!.known).toBe(false);
    expect(r!.army).toBe(raidArmyVsPlayer(s));
    s.player.ludus.keepers.wardens = 40;
    expect(attention(s).raidRisk).toBeNull();
    s.player.ludus.denarii = 20;
    s.player.ludus.keepers.wardens = 30; // upkeep 60 a week against no income
    const w = attention(s).runway;
    expect(w).not.toBeNull();
    expect(w!.net).toBeLessThan(0);
    expect(w!.weeks).toBe(0);
  });
});
