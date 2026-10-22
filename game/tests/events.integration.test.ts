// Events and adventures against the real engine (combat, economy, rivals, horde, stories…): no mocks.
import { describe, it, expect } from 'vitest';
import type { GameState } from '../src/engine/types';
import { STATS } from '../src/engine/types';
import { createNewGame, emptyMeta } from '../src/engine/newgame';
import { beginAdvance, completeWeek } from '../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus } from '../src/engine/tournaments';
import { EVENTS, resolveDecision } from '../src/engine/events';
import { pendingAdventures, resolveAdventure, sendOnAdventure, ADVENTURE_KEYS } from '../src/engine/adventures';
import { generateDino, generateBeast, addTrait, makeCreature } from '../src/engine/creature';
import { generateMarketEgg } from '../src/engine/breeding';
import { makeGear } from '../src/engine/data/gear';
import { rand, setSeed } from '../src/engine/rng';
import { serialize, deserialize } from '../src/engine/save';

function newGame(seed: number, hard = false): GameState {
  return createNewGame({
    lanista: 'Tester', female: false, heritage: 'roman', hard, nightmare: false, sandbox: false,
    raidsDisabled: false, betrayalsDisabled: false, ascension: 0, slot: 1, seed,
  }, emptyMeta());
}

function stock(s: GameState): void {
  const h = s.player.ludus;
  h.denarii = 4000;
  for (const sp of ['carnotaurus', 'allosaurus', 'velociraptor', 'triceratops'] as const) {
    const c = generateDino({ species: sp, week: s.world.week + 20, level: 5 });
    c.maturity = 1;
    h.creatures.push(c);
  }
  h.creatures.push(generateBeast('sarcosuchus'));
  h.keepers = { unassigned: 2, miners: 4, showmen: 3, wardens: 4, spies: 0 };
}

function invariants(s: GameState): void {
  const h = s.player.ludus;
  expect(Number.isFinite(h.denarii)).toBe(true);
  expect(Number.isFinite(h.influence)).toBe(true);
  for (const c of h.creatures) {
    expect(c.loyalty).toBeGreaterThanOrEqual(0);
    expect(c.loyalty).toBeLessThanOrEqual(100);
    for (const st of STATS) expect(Number.isFinite(c.genes.wild[st])).toBe(true);
  }
}

function answerAll(s: GameState, seen: Map<string, number>): void {
  for (const d of [...s.player.decisions]) {
    seen.set(d.key, (seen.get(d.key) ?? 0) + 1);
    const open = d.options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    resolveDecision(s, d.id, open.length ? open[rand(open.length)] : 0);
  }
  for (const a of pendingAdventures(s)) resolveAdventure(s, a.adventure.id, a.choices?.length ? rand(a.choices.length) : 0);
}

function playWeek(s: GameState): void {
  beginAdvance(s);
  const t = attendedTournament(s);
  if (t) {
    for (let g = 0; g < 40; g++) {
      if (!nextPlayerMatch(s, t)) break;
      playMatch(s, t, {});
      if (t.status === 'bonus') continueBonus(s, t, false);
    }
  }
  completeWeek(s);
}

describe('events with the real engine', () => {
  it('a long run draws many different events and answers them all', () => {
    const seen = new Map<string, number>();
    for (const [seed, hard] of [[11, false], [12, true]] as const) {
      const s = newGame(seed, hard);
      stock(s);
      for (let w = 0; w < 120 && !s.over; w++) {
        answerAll(s, seen);
        playWeek(s);
        invariants(s);
        if (w % 40 === 39) expect(deserialize(serialize(s)).world.week).toBe(s.world.week);
      }
    }
    expect(seen.get('plebeInDebt')).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThanOrEqual(25);
  }, 120_000);

  it('every event and option resolves with real battles', () => {
    setSeed(99);
    const s0 = newGame(5);
    s0.world.week = 61;
    s0.world.ascension = 16;
    s0.world.difficulty.hard = true;
    s0.world.difficulty.sandbox = true;
    stock(s0);
    const h = s0.player.ludus;
    h.denarii = 8000;
    h.influence = 3000;
    h.keepers = { unassigned: 3, miners: 6, showmen: 5, wardens: 6, spies: 4 };
    h.spiesLastWeek = 4;
    for (const b of ['residence', 'library', 'forge', 'saddlery', 'veterinarium', 'tavern', 'romeMansion', 'aqueduct', 'palisade', 'trainingField', 'mine'] as const) h.buildings[b] = 2;
    s0.player.senator = true;
    s0.player.consul = true;
    s0.player.opportunities = ['lobbySenate', 'electedSenator', 'princepsSenatus', 'consul', 'theOrganizer', 'imperator', 'bacchusPatron', 'bribeGeneral', 'gambler', 'informants'];
    s0.world.flags.melankomasJoined = 1;
    const champ = h.creatures[0];
    Object.assign(champ.career, { majorWins: 12, tournamentWins: 5, wins: 9 });
    champ.fame = 300;
    champ.bonus.str += 25;
    champ.prof.horn = 900;
    champ.cls = 'phalanx';
    addTrait(champ, 'Bestiarii');
    h.creatures[1].career.wins = 4;
    h.creatures[1].spyFor = s0.rivals[0].id;
    const wolf = generateBeast('direwolf');
    addTrait(wolf, 'GoodBoy');
    const fem = makeCreature({ species: 'velociraptor', sex: 'F', maturity: 1, adultWeeks: 60 });
    h.creatures.push(wolf, fem, makeCreature({ species: 'troodon', maturity: 0.4 }), makeCreature({ species: 'troodon', maturity: 0.05 }));
    s0.rivals[0].creatures.push(makeCreature({ species: 'velociraptor', sex: 'M', maturity: 1, adultWeeks: 60 }));
    s0.rivals[0].ai!.pact = true;
    s0.rivals[0].ai!.opinion = 70;
    const egg = generateMarketEgg(s0, 'velociraptor');
    egg.motherId = fem.id;
    h.eggs.push(egg);
    const fangs = makeGear('fangCaps', 5, 'darkF', { unique: 'darkFangs' });
    h.armory.push(fangs, makeGear('greatTalons', 4, 'bladeX'));
    h.creatures[2].gear.weapon = fangs.id;
    h.creatures[2].loyalty = 40;
    h.pantry = { kibble_simple: 2, kibble_superior: 2 };
    h.trophies = [{ league: 'lunar', place: 1, week: 20, creatureName: 'x' }, { league: 'solar', place: 1, week: 40, creatureName: 'y' }];
    if (s0.rivals[1]?.creatures[0]) h.caught = [s0.rivals[1].creatures[0].id];
    s0.world.temperature = 33;

    let battles = 0;
    const unbuilt: string[] = [];
    for (const def of EVENTS.filter((e) => !e.followUp)) {
      let built = false;
      for (let attempt = 0; attempt < 25 && !built; attempt++) {
        const s = deserialize(serialize(s0));
        setSeed(1000 + attempt);
        if (['callInFavours', 'politicalSponsor', 'electionAmbush', 'popularCandidate'].includes(def.key)) {
          s.player.election = { office: 'consul', startWeek: def.key === 'popularCandidate' ? 60 : 55, votes: 30, smear: false, campaigners: [], history: [], lastInfluence: 0 };
        }
        if (def.key === 'underworld') s.world.week = 70;
        if (def.key === 'romulus2') s.world.flags.romulusStage = 1;
        if (def.key === 'romulus3') s.world.flags.romulusStage = 2;
        const d = def.make(s);
        if (!d) continue;
        built = true;
        for (let o = 0; o < d.options.length; o++) {
          const st = deserialize(serialize(s));
          def.onDraw?.(st, d);
          st.player.decisions.push(JSON.parse(JSON.stringify(d)));
          const r = resolveDecision(st, d.id, o);
          if (r.battle) {
            battles++;
            expect(r.battle.log.length).toBeGreaterThan(0);
          }
          for (const a of pendingAdventures(st)) resolveAdventure(st, a.adventure.id, 0);
          invariants(st);
        }
      }
      if (!built) unbuilt.push(def.key);
    }
    // the rest need a poorer / non-senator / cold-week state and are covered in events.test.ts
    expect(unbuilt.length).toBeLessThanOrEqual(12);
    expect(battles).toBeGreaterThan(12);
  }, 120_000);

  it('every adventure resolves with real battles', () => {
    for (const key of ADVENTURE_KEYS) {
      const s = newGame(21);
      stock(s);
      s.world.week = 40;
      const c = s.player.ludus.creatures[0];
      const data: Record<string, unknown> = key === 'wildCapture' ? { species: 'iguanodon', kibble: 'kibble_regular' } : { rivalId: s.rivals[0]?.id };
      const adv = sendOnAdventure(s, key, [c.id], 0, data);
      const [p] = pendingAdventures(s);
      expect(p.adventure.id).toBe(adv.id);
      const r = resolveAdventure(s, adv.id, 0);
      expect(typeof r.text).toBe('string');
      expect(s.player.adventures.find((a) => a.id === adv.id) === undefined || key === 'hannibalMerchant').toBe(true);
      if (r.battle) expect(r.battle.outcomes.length).toBeGreaterThan(1);
      invariants(s);
    }
  });
});
