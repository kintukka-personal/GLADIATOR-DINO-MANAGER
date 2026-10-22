// Dev fixture: a hand-assembled GameState for development while engine seeders are stubs.
// Built only from modules that work standalone: newgame (makeLudus/emptyMeta), creature, breeding,
// data/*, rng, util. Used when createNewGame throws and for #dev deep links (screenshots).
// Marked with player.storyData.__devFixture so the UI shows a "dev data" ribbon.

import type {
  AIState, BattleLogLine, BattleResult, Creature, Decision, Egg, GameState, Gear, GearTypeId, League, Ludus, Meta,
  Personality, Quality, ResultCard, Sex, SpeciesId, StoryConversation, Tournament, TournamentDef, TraitId,
} from '../engine/types';
import { makeLudus, SAVE_VERSION, type NewGameOptions } from '../engine/newgame';
import { generateBeast, generateDino, makeNamed, maxHp, getStat, addTrait } from '../engine/creature';
import { ancestorRecord, generateMarketEgg, makeNewborn, parentGenes, rollOffspringGenes, rollTemperature } from '../engine/breeding';
import { makeGear } from '../engine/data/gear';
import { FOODS, FOOD_IDS } from '../engine/data/food';
import { SPECIES } from '../engine/data/species';
import { TECHNIQUES } from '../engine/data/techniques';
import { getSeed, setSeed } from '../engine/rng';
import { getIdCounter, newId, setIdCounter, zeroStats } from '../engine/util';
import { eventDef } from '../engine/events';
import { studAsk } from '../engine/data/storiesData';
import { DEV_FLAG } from './store';
import { seeded } from './art/geom';

const WEEK = 14;

function personality(p: Partial<Personality>): Personality {
  return { financial: 'balanced', arena: 'balanced', honesty: 'neutral', training: 'standard', classMindset: 'normal', prefers: ['strong'], ...p };
}

function ai(key: AIState['key'], opinion: number, p: Partial<Personality>): AIState {
  return { key, personality: personality(p), opinion, visible: true, tookLoan: false, lastOffers: {}, offeredThisWeek: false, pact: false, flags: {} };
}

function gear(h: Ludus, type: GearTypeId, q: Quality, extra: Partial<Gear> = {}): Gear {
  const g = makeGear(type, q, newId('g'), extra);
  h.armory.push(g);
  return g;
}

function bred(c: Creature, gen: number, mother?: Creature | { id: string; name: string }, father?: Creature | { id: string; name: string }, imprint = 0.5): Creature {
  c.genes.bred = true;
  c.genes.generation = gen;
  c.genes.imprint = imprint;
  if (mother) { c.genes.motherId = mother.id; c.genes.motherName = mother.name; }
  if (father) { c.genes.fatherId = father.id; c.genes.fatherName = father.name; }
  return c;
}

function ancestor(state: GameState, species: SpeciesId, name: string, sex: Sex, wild: Partial<Record<'str' | 'agi' | 'cun' | 'hp', number>>, fate: string, house: string, extra: { gen?: number; mother?: string; father?: string; mutM?: number; mutP?: number } = {}) {
  const id = newId('c');
  state.ancestry[id] = {
    id, name, species, sex, wild: { ...zeroStats(), ...wild }, colors: SPECIES[species].palette.map((r, i) => r[(i + name.length) % r.length]),
    mutMatri: extra.mutM ?? 0, mutPatri: extra.mutP ?? 0, mutations: [], generation: extra.gen ?? 0,
    motherId: extra.mother, fatherId: extra.father, imprint: extra.gen ? 0.4 : 0, level: 3, fame: 12, fate, house,
  };
  return state.ancestry[id];
}

function tournament(def: Partial<TournamentDef> & Pick<TournamentDef, 'key' | 'name' | 'type'>): Tournament {
  return {
    week: WEEK, perTeam: 1, teams: 8, fee: 50, underground: false, mounts: 'none', beasts: false, ...def,
    id: newId('t'), entries: [], matches: [], currentRound: 0, bonusRound: 0, status: 'open', weather: 'sunny', log: [],
  } as Tournament;
}

export function buildDevFixture(o: Partial<NewGameOptions> = {}, meta?: Meta): GameState {
  setSeed(o.seed ?? 7307141);
  setIdCounter(1);
  const lanista = o.lanista?.trim() || 'Quintus';
  const female = o.female ?? false;
  const me = makeLudus(o.ludusName?.trim() || `House ${lanista}`, true, 1840);
  me.influence = 46;
  me.portrait = female ? 'f' : 'm';
  me.keepers = { unassigned: 1, miners: 3, showmen: 2, wardens: 2, spies: 1 };
  me.spiesLastWeek = 1;
  Object.assign(me.buildings, { residence: 2, trainingField: 1, mine: 1, forge: 1, palisade: 1, veterinarium: 1, breedingPen: 3, hatchery: 1, nursery: 1, kitchen: 1 });
  me.pantry = { rawMeat: 6, primeMeat: 1, mejoberries: 9, kibble_simple: 2, kibble_superior: 1 };

  const batiatus = makeLudus('Batiatus', false, 1350);
  batiatus.ai = ai('batiatus', 38, { financial: 'greedy', honesty: 'treacherous', prefers: ['strong', 'established'] });
  batiatus.influence = 120;
  const solonius = makeLudus('Solonius', false, 2100);
  solonius.ai = ai('solonius', 57, { financial: 'spender', arena: 'risktaker', prefers: ['quick', 'cunning'] });
  solonius.influence = 88;
  const decimus = makeLudus('Decimus', false, 640);
  decimus.ai = ai('decimus', 66, { honesty: 'honest', prefers: ['cheap', 'tough'] });
  decimus.influence = 41;
  const unknown = makeLudus('Unknown', false, 200);

  const state: GameState = {
    version: SAVE_VERSION, slot: o.slot ?? 1, createdAt: Date.now(), savedAt: Date.now(),
    player: {
      lanista, female, heritage: o.heritage ?? 'roman', ludus: me, opportunities: [], treeSeed: 7,
      toggles: { publicSessions: false, bribeGeneral: false, loan: false }, senator: false, consul: false,
      objectives: [], stories: { soloniusThrow: 9 }, storyData: { [DEV_FLAG]: true }, messages: [], decisions: [], decisionHistory: [],
      delayed: [], adventures: [], conversations: [], registrations: {}, intrigue: [], defenses: [], offers: [], tomb: [],
      organized: 0, leagueWins: 0, invaderWins: 0, tutorial: 6, bets: {}, week: {}, counters: { hatched: 2 },
    },
    rivals: [batiatus, solonius, decimus],
    unknown,
    world: {
      week: WEEK, rng: 0, difficulty: { hard: !!o.hard || !!o.nightmare, nightmare: !!o.nightmare, sandbox: !!o.sandbox, raidsDisabled: !!o.raidsDisabled, betrayalsDisabled: !!o.betrayalsDisabled },
      ascension: o.ascension ?? 0, marketSeed: 2, calendar: [], tournaments: [], leagues: [],
      market: { creatures: [], gear: [], oldCreatures: [], oldGear: [], keepers: { count: 3, price: 100 }, eggs: [], foodPrices: Object.fromEntries(FOOD_IDS.map((f) => [f, FOODS[f].price])) as GameState['world']['market']['foodPrices'], pokes: 0 },
      horde: { rogues: [], ferals: 4, spoils: 120, spartacusFree: false, spartacusDead: false, defeated: false, libertasForged: false, lastSenateWeek: 0, expeditionsEnabled: false, lastRaidOnPlayer: 0, lastRaidWeek: 0, armory: [] },
      laws: { publicFunding: false }, flags: {}, temperature: 19, released: [],
    },
    ancestry: {}, unlocks: [...(meta?.upgrades ?? [])], pendingAchievements: [], results: [], report: [], nextId: 1,
    runStats: { battles: 11, wins: 8, deaths: 1, hatched: 2, mutations: 1, maxGeneration: 3, peakInfluence: 46 },
  };
  state.world.temperature = Math.min(21, rollTemperature(WEEK));

  // ------------------------------------------------------------------ ancestry (dead or sold forebears)
  const mezena = ancestor(state, 'velociraptor', 'Mezena', 'F', { str: 2, agi: 6, cun: 3, hp: 2 }, 'Died of old age', me.name);
  const teres = ancestor(state, 'velociraptor', 'Teres', 'M', { str: 4, agi: 3, cun: 2, hp: 3 }, 'Killed in the arena by Gannicus', me.name);
  const kotyto = ancestor(state, 'velociraptor', 'Kotyto', 'F', { str: 4, agi: 6, cun: 3, hp: 3 }, 'Died in the arena (week 6)', me.name, { gen: 1, mother: mezena.id, father: teres.id, mutM: 1 });
  const seuthes = ancestor(state, 'velociraptor', 'Seuthes', 'M', { str: 3, agi: 5, cun: 5, hp: 2 }, 'Sold to Magnus', 'Magnus', { mutP: 1 });
  const dida = ancestor(state, 'velociraptor', 'Dida', 'F', { str: 2, agi: 7, cun: 4, hp: 1 }, 'Escaped to the Wild Horde', 'Batiatus');
  const bithus = ancestor(state, 'velociraptor', 'Bithus', 'M', { str: 5, agi: 4, cun: 2, hp: 4 }, 'Released to the wild', 'Batiatus', { mutP: 2 });
  const cotys = ancestor(state, 'velociraptor', 'Cotys', 'M', { str: 6, agi: 4, cun: 3, hp: 3 }, 'Died of a fever', 'Batiatus', { mutP: 3, gen: 1 });

  // ------------------------------------------------------------------ player creatures
  const tetraites = makeNamed('carnotaurus', 'Tetraites', { str: 8, agi: 5, cun: 5, hp: 30 }, { traits: ['Agile'], level: 5, techniques: [['Charge', 2], ['Lunge', 1]], cls: 'phalanx', eqAge: 21, legend: 'tetraites' });
  Object.assign(tetraites, { fame: 38, loyalty: 84, statPoints: 2, techPoints: 1, classXp: 9 });
  tetraites.career = { ...tetraites.career, wins: 7, losses: 2, kills: 1, battles: 9, tournamentWins: 1, biggestHit: 14, leaguePoints: 6 };
  tetraites.prof.horn = 64;

  const flamma = makeNamed('velociraptor', 'Flamma', { str: 7, agi: 5, cun: 6, hp: 30 }, { traits: ['GlorySeeker'], level: 3, techniques: [['Lunge', 2]], eqAge: 20, legend: 'flamma', cls: 'slasher' });
  Object.assign(flamma, { fame: 24, loyalty: 91, nickname: 'the Ember', favourite: true });
  flamma.career = { ...flamma.career, wins: 4, losses: 1, battles: 5 };

  const tirsa = generateDino({ species: 'velociraptor', sex: 'F', week: WEEK, level: 4, eqAge: 23 });
  tirsa.name = 'Tirsa';
  bred(tirsa, 1, dida, bithus, 0.66);
  tirsa.genes.wild = { str: 5, agi: 7, cun: 4, hp: 3 };
  tirsa.genes.mutPatri = 2;
  batiatus.creatures.push(tirsa);

  const livia = generateDino({ species: 'velociraptor', sex: 'F', week: WEEK, level: 4, eqAge: 21 });
  livia.name = 'Livia';
  bred(livia, 2, kotyto, seuthes, 0.83);
  livia.genes.wild = { str: 4, agi: 8, cun: 5, hp: 3 };
  livia.genes.mutMatri = 1;
  livia.genes.mutPatri = 1;
  livia.genes.mutatedPoints = { str: 0, agi: 2, cun: 0, hp: 0 };
  livia.genes.colors = [10, 4, 12, 15, 8, 18];
  livia.loyalty = 88;

  const bendis = generateDino({ species: 'velociraptor', sex: 'M', week: WEEK, level: 5, eqAge: 22 });
  bendis.name = 'Bendis';
  bred(bendis, 2, tirsa, { id: cotys.id, name: cotys.name }, 0.5);
  bendis.genes.wild = { str: 7, agi: 6, cun: 3, hp: 5 };
  bendis.genes.mutMatri = 2;
  bendis.genes.mutPatri = 4;
  bendis.genes.mutations = [{ stat: 'str', side: 'patri', week: 2, color: 13 }];
  bendis.genes.mutatedPoints = { str: 4, agi: 0, cun: 0, hp: 2 };
  bendis.genes.colors = [21, 5, 0, 13, 22, 36];
  bendis.loyalty = 72;

  const sobek = generateDino({ species: 'spinosaurus', sex: 'M', week: 40, level: 6, tier: 'epic', eqAge: 24 });
  sobek.name = 'Sobek';
  Object.assign(sobek, { fame: 55, loyalty: 64, injury: { type: 'broken', weeks: 2 } });
  sobek.career = { ...sobek.career, wins: 9, losses: 3, kills: 2, battles: 12 };

  const arsaces = generateDino({ species: 'parasaurolophus', sex: 'M', week: WEEK, level: 3, eqAge: 20 });
  arsaces.name = 'Arsaces';
  arsaces.away = { kind: 'adventure', weeksLeft: 2, note: 'Escorting a grain caravan to Neapolis' };

  const ajax = generateDino({ species: 'ankylosaurus', sex: 'M', week: WEEK, level: 2, eqAge: 19 });
  ajax.name = 'Ajax';
  ajax.ill = 1;

  const boudica = generateDino({ species: 'triceratops', sex: 'F', week: WEEK, level: 3, eqAge: 22 });
  boudica.name = 'Boudica';
  boudica.mateCooldown = 2;
  boudica.genes.wild = { str: 6, agi: 2, cun: 3, hp: 6 };
  const brennus = generateDino({ species: 'triceratops', sex: 'M', week: WEEK, level: 4, eqAge: 25 });
  brennus.name = 'Brennus';
  brennus.genes.wild = { str: 8, agi: 3, cun: 1, hp: 5 };
  if (!brennus.traits.includes('Tough')) addTrait(brennus, 'Tough');

  const aello = generateBeast('direwolf', { name: 'Aello', sex: 'F' });
  addTrait(aello, 'SharpenedClaws');
  aello.loyalty = 77;
  aello.level = 2;

  const iris = generateDino({ species: 'iguanodon', sex: 'F', week: WEEK, level: 2, eqAge: 21 });
  iris.name = 'Iris';

  me.creatures.push(tetraites, flamma, livia, bendis, sobek, boudica, brennus, arsaces, ajax, iris, aello);

  // hatchlings (real inheritance from Livia × Bendis and Boudica × Brennus)
  const rhesusGenes = rollOffspringGenes(parentGenes(livia), parentGenes(bendis), 13);
  const rhesus = makeNewborn(state, me, 'velociraptor', rhesusGenes, 'M', ['Strong']);
  rhesus.name = 'Rhesus';
  rhesus.bornWeek = 13;
  rhesus.ageWeeks = 1;
  rhesus.maturity = 1 / 6 * 0.35;
  rhesus.imprintRequest = { kind: 'cuddle', done: false };
  rhesus.genes.mutations = [{ stat: 'agi', side: 'matri', week: 13, color: 27 }];
  rhesus.genes.mutMatri += 1;
  rhesus.genes.wild.agi = livia.genes.wild.agi + 2;
  rhesus.genes.mutatedPoints.agi = 4;
  rhesus.genes.colors[3] = 27;

  const triGenes = rollOffspringGenes(parentGenes(boudica), parentGenes(brennus), 10);
  const ariadne = makeNewborn(state, me, 'triceratops', triGenes, 'F', []);
  ariadne.name = 'Ariadne';
  ariadne.bornWeek = 10;
  ariadne.ageWeeks = 4;
  ariadne.maturity = 4 / 14;
  ariadne.genes.imprint = 3 / 14;
  ariadne.imprintRequest = { kind: 'feed', food: 'kibble_superior', done: false };

  const pachyGenes = rollOffspringGenes(parentGenes(generateDino({ species: 'pachycephalosaurus', sex: 'F' })), parentGenes(generateDino({ species: 'pachycephalosaurus', sex: 'M' })), 12);
  const fausta = makeNewborn(state, me, 'pachycephalosaurus', pachyGenes, 'F', []);
  fausta.name = 'Fausta';
  fausta.bornWeek = 12;
  fausta.ageWeeks = 2;
  fausta.maturity = 0.125;
  fausta.genes.imprint = 1 / 8;
  fausta.imprintRequest = { kind: 'feed', food: 'mejoberries', done: false };

  const igGenes = rollOffspringGenes(parentGenes(iris), parentGenes(generateDino({ species: 'iguanodon', sex: 'M' })), 7);
  const lucius = makeNewborn(state, me, 'iguanodon', igGenes, 'M', []);
  lucius.name = 'Lucius';
  lucius.bornWeek = 7;
  lucius.ageWeeks = 7;
  lucius.maturity = 0.7;
  lucius.genes.imprint = 0.6;
  lucius.genes.motherId = iris.id;
  lucius.genes.motherName = iris.name;
  lucius.genes.fatherName = 'a stud of Decimus';
  lucius.imprintRequest = { kind: 'walk', done: true };
  me.creatures.push(rhesus, ariadne, fausta, lucius);

  livia.offspring = 3;
  bendis.offspring = 3;
  boudica.offspring = 1;
  brennus.offspring = 1;
  for (const c of [livia, bendis, tirsa, rhesus, ariadne, fausta, lucius, iris, boudica, brennus]) state.ancestry[c.id] = ancestorRecord(c, me.name);

  // pairs
  me.pairs = [
    { maleId: bendis.id, femaleId: livia.id, since: 9 },
    { maleId: brennus.id, femaleId: boudica.id, since: 8 },
  ];

  // eggs
  const eggOf = (mother: Creature, father: Creature, laid: number, progress: number, lastTemp: number, health = 1): Egg => ({
    id: newId('e'), species: mother.species, fertilized: true, motherId: mother.id, fatherId: father.id, motherName: mother.name, fatherName: father.name,
    genes: rollOffspringGenes(parentGenes(mother), parentGenes(father), laid), sex: (laid % 2 ? 'F' : 'M') as Sex, health, progress,
    needed: Math.max(1, SPECIES[mother.species].incubWeeks), laidWeek: laid, source: 'bred', known: true, lastTemp,
  });
  const triEgg = eggOf(boudica, brennus, 11, 2, 19, 0.76);
  const raptorEgg = eggOf(livia, bendis, 13, 0, 26);
  const spinoEgg = generateMarketEgg(state, 'spinosaurus');
  spinoEgg.progress = 1;
  spinoEgg.lastTemp = 21;
  spinoEgg.health = 0.62;
  spinoEgg.laidWeek = 12;
  me.eggs = [
    triEgg, raptorEgg, spinoEgg,
    { id: newId('e'), species: 'iguanodon', fertilized: false, motherId: iris.id, motherName: iris.name, health: 1, progress: 0, needed: 0, laidWeek: 12, source: 'bred', known: true },
    { id: newId('e'), species: 'velociraptor', fertilized: false, motherId: livia.id, motherName: livia.name, health: 1, progress: 0, needed: 0, laidWeek: 10, source: 'bred', known: true },
  ];

  // gear
  const lance = gear(me, 'hornLance', 3);
  const plate = gear(me, 'bashPlate', 1);
  const barding = gear(me, 'studdedBarding', 2);
  const muzzle = gear(me, 'bronzeMuzzle', 2);
  const lancer = gear(me, 'numidianLancer', 2);
  tetraites.gear = { weapon: lance.id, offhand: plate.id, armor: barding.id, helmet: muzzle.id, rider: lancer.id };
  const sickle = gear(me, 'sickleClaws', 2);
  const hood = gear(me, 'huntersHood', 1);
  flamma.gear = { weapon: sickle.id, helmet: hood.id };
  const club = gear(me, 'tailClub', 3);
  sobek.gear = { weapon: club.id };
  const poultice = gear(me, 'poultice', 2);
  bendis.gear = { item: poultice.id };
  gear(me, 'hideShield', 0);
  gear(me, 'lightHarness', 0);
  gear(me, 'fangCaps', 1);
  gear(me, 'legionBarding', 4);
  gear(me, 'talonBlades', 2, { augment: 'Bloody' });

  me.doctoreId = tetraites.id;
  me.bondedId = flamma.id;
  me.training.overrides[flamma.id] = 'intense';
  me.training.paid.weapons = true;
  me.trophies.push({ league: 'lunar', place: 3, week: 9, creatureName: 'Tetraites' });

  // ------------------------------------------------------------------ rivals
  const gannicus = makeNamed('allosaurus', 'Gannicus', { str: 13, agi: 9, cun: 7, hp: 45 }, { level: 8, techniques: [['Smash', 3], ['Feint', 1]], cls: 'brute', traits: ['Fury'], legend: 'gannicus' });
  gannicus.fame = 92;
  gannicus.career.leaguePoints = 9;
  const oenomaus = makeNamed('triceratops', 'Oenomaus', { str: 12, agi: 4, cun: 9, hp: 50 }, { level: 9, techniques: [['Decimate', 3]], cls: 'phalanx', traits: ['Doctore'], legend: 'oenomaus' });
  batiatus.creatures.push(gannicus, oenomaus);
  batiatus.doctoreId = oenomaus.id;
  for (let i = 0; i < 3; i++) solonius.creatures.push(generateDino({ week: WEEK, level: 3 + i }));
  decimus.creatures.push(generateDino({ week: WEEK, level: 2 }), generateDino({ week: WEEK, level: 4 }), generateBeast('sabertooth'));
  unknown.creatures.push(generateDino({ tier: 'cheap', week: WEEK }), generateDino({ tier: 'cheap', week: WEEK }));
  for (const c of [...solonius.creatures, ...decimus.creatures]) c.gear = {};

  // ------------------------------------------------------------------ world
  state.world.tournaments = [
    tournament({ key: 'ludi', name: 'Ludi Plebeii', type: 'normal', fee: 50, teams: 8 }),
    tournament({ key: 'lunar3', name: 'Lunar League, round 3', type: 'league', league: 'lunar', perTeam: 2, teams: 8, fee: 80 }),
    tournament({ key: 'hatchling', name: 'Hatchling Games', type: 'junior', fee: 20, teams: 4 }),
    tournament({ key: 'pits', name: 'The Pits', type: 'underground', underground: true, fee: 0, teams: 8, bonusRounds: 3 }),
  ];
  const lunar: League = {
    id: 'lunar', name: 'Lunar League', start: 8, end: 24, pool: 1200, active: true, done: false,
    points: { [gannicus.id]: 9, [tetraites.id]: 6, [oenomaus.id]: 5, [solonius.creatures[2].id]: 4 },
    owners: { [gannicus.id]: batiatus.id, [tetraites.id]: me.id, [oenomaus.id]: batiatus.id, [solonius.creatures[2].id]: solonius.id },
    names: { [gannicus.id]: 'Gannicus', [tetraites.id]: 'Tetraites', [oenomaus.id]: 'Oenomaus', [solonius.creatures[2].id]: solonius.creatures[2].name },
  };
  state.world.leagues = [lunar];

  const mk = state.world.market;
  mk.creatures = [
    generateDino({ week: WEEK, level: 2 }), generateDino({ week: WEEK, level: 1, tier: 'cheap' }), generateDino({ week: WEEK, level: 3 }),
    generateDino({ week: WEEK, level: 4, species: 'triceratops' }), generateDino({ week: 40, level: 5, tier: 'epic', species: 'tyrannosaurus' }),
    generateBeast('terrorbird'), generateBeast('woollyrhino'),
  ];
  const mg = (t: GearTypeId, q: Quality) => makeGear(t, q, newId('g'));
  mk.gear = [mg('talonBlades', 2), mg('venomFangs', 1), mg('tailClub', 1), mg('venomSpitter', 2), mg('frillGuard', 2), mg('quiltedBarding', 1), mg('hornedHelm', 1), mg('celticSpearman', 1), mg('poultice', 2), mg('luckyTooth', 2), mg('greatTalons', 3)];
  mk.eggs = [generateMarketEgg(state, 'parasaurolophus'), generateMarketEgg(state, 'velociraptor'), generateMarketEgg(state, 'stegosaurus')];

  // ------------------------------------------------------------------ player data
  const p = state.player;
  const msg = (sender: GameState['player']['messages'][number]['sender'], title: string, text: string, read = false, week = WEEK) =>
    p.messages.push({ id: newId('m'), week, sender, title, text, read });
  msg('hatchery', 'Hatchery report', `Livia laid a fertilized Velociraptor egg (sire Bendis).\nRhesus the Velociraptor hatched! 1 mutation!\nThe Triceratops egg is losing warmth: 19°C, it needs 22–30°C.`);
  msg('medicus', 'Sobek\'s leg', 'The bone is set. Two more weeks before he can fight or breed, dominus. Keep him off the sand.');
  msg('spy', 'Whispers from House Solonius', 'Solonius has bought a Spinosaurus egg from an Egyptian trader and is building a hatchery.');
  msg('magistrate', 'Welcome to Capua!', `Welcome to Capua, ${female ? 'domina' : 'dominus'} ${lanista}. Your ludus is modest: an empty pen, a few keepers and 1000 denarii. Buy your first dino at the market, teach it a technique, find it some harness and register for a tournament.`, true, 1);
  const offer = { id: newId('o'), rivalId: batiatus.id, creatureId: flamma.id, amount: 640, expiresWeek: WEEK + 1 };
  p.offers.push(offer);
  p.messages.unshift({ id: newId('m'), week: WEEK, sender: 'rival', title: 'An offer from Batiatus', text: 'Batiatus admires your Velociraptor Flamma and offers 640 denarii. The offer stands until next week.', read: false, offer });

  // a real breeding event when the events module can build one, else a static stand-in
  let d: Decision | null = null;
  for (const key of ['strangeEgg', 'studServices', 'breedersFair', 'geneMerchant', 'proudMother', 'eggPoachers']) {
    try {
      d = eventDef(key)?.make(state) ?? null;
    } catch {
      d = null;
    }
    if (d) break;
  }
  p.decisions.push(d ?? {
    id: newId('d'), key: 'devEggMerchant', title: 'A Merchant of Eggs', week: WEEK, art: 'merchant',
    text: 'A Nabataean trader unwraps a warm bundle of straw: a speckled egg "from the dunes beyond Petra". He wants 180 denarii, and he keeps glancing at the gate.',
    options: [
      { label: 'Buy the egg', desc: '−180 denarii. It goes into the hatchery.' },
      { label: 'Have a spy follow him first', desc: 'Find out where he got it.', disabled: true, reason: 'Needs 2 committed spies' },
      { label: 'Send him on his way' },
    ],
    data: {},
  });

  // Batiatus asks to borrow Bendis as a stud (a real storyline: studRequest)
  const stud = studAsk(bendis.name, tirsa.name, SPECIES[tirsa.species].name);
  const conv: StoryConversation = {
    id: newId('s'), story: 'studRequest', step: 1, actor: 'batiatus', title: stud.title,
    lines: stud.lines.map((l) => (l.actor === 'unknown' ? { ...l, actor: 'batiatus' as const } : l)),
    options: stud.options.map((o) => ({ ...o })),
    data: { kind: 'ask', week: WEEK, rivalId: batiatus.id, speaker: batiatus.name, maleId: bendis.id, femaleId: tirsa.id },
  };
  p.stories.studRequest = 1;
  p.conversations.push(conv);

  p.defenses.push({ id: newId('x'), rivalId: batiatus.id, action: 'poison', agentId: oenomaus.id, targetCreatureId: tetraites.id, prompt: 0, chance: 0.35 });

  p.objectives = [
    { id: 'guidance3', startWeek: 1, progress: 1, goal: 1, done: true, claimed: false },
    { id: 'imprintBaby', startWeek: 10, progress: 0, goal: 1, done: false, claimed: false },
    { id: 'bloodline', startWeek: 10, progress: 2, goal: 5, done: false, claimed: false },
    { id: 'firstClutch', startWeek: 9, progress: 1, goal: 1, done: true, claimed: true },
    { id: 'expandLudus', startWeek: 6, deadline: 20, progress: 3, goal: 5, done: false, claimed: false },
  ];

  const crixus = generateDino({ species: 'carnotaurus', sex: 'M', week: WEEK, level: 4 });
  crixus.name = 'Crixus';
  p.tomb.push({ id: crixus.id, name: 'Crixus', species: 'carnotaurus', level: 4, fame: 31, week: 9, cause: 'Killed in the arena by Gannicus', leagues: 0, creature: crixus });

  state.world.rng = getSeed();
  state.nextId = getIdCounter();
  return state;
}

// ---------------------------------------------------------------------------------------------
// Sample battle (presentation only) and sample week results, for previews while combat is a stub.
// ---------------------------------------------------------------------------------------------

export function devBattle(state: GameState): BattleResult {
  const me = state.player.ludus;
  const rival = state.rivals[0];
  const left = me.creatures.filter((c) => c.maturity >= 1 && !c.injury && !c.away).slice(0, 2);
  const right = (rival?.creatures ?? []).filter((c) => c.maturity >= 1).slice(0, 2);
  const all = [...left, ...right];
  const side = (i: number): 0 | 1 => (i < left.length ? 0 : 1);
  const rnd = seeded(state.world.week * 977 + all.length);
  const hpMax = all.map((c) => maxHp(c));
  const hp = [...hpMax];
  const log: BattleLogLine[] = [];
  const push = (l: Omit<BattleLogLine, 'hp'>) => log.push({ ...l, hp: [...hp] });
  push({ round: 0, kind: 'start', text: `${me.name} against ${rival?.name ?? 'the Unknown'}. The crowd roars.` });
  let round = 0;
  const alive = (s: 0 | 1) => all.some((_, i) => side(i) === s && hp[i] > 0);
  while (round < 6 && alive(0) && alive(1)) {
    round++;
    push({ round, kind: 'round', text: `Round ${round}` });
    const order = all.map((c, i) => ({ i, init: getStat(c, 'agi') + rnd() * 6 })).sort((a, b) => b.init - a.init);
    for (const { i } of order) {
      if (hp[i] <= 0 || !alive(0) || !alive(1)) continue;
      const foes = all.map((_, j) => j).filter((j) => side(j) !== side(i) && hp[j] > 0);
      const t = foes[Math.floor(rnd() * foes.length)];
      const a = all[i];
      const b = all[t];
      const tech = a.techniques[Math.floor(rnd() * Math.max(1, a.techniques.length))];
      const useTech = tech && rnd() < 0.4;
      const techName = useTech ? TECHNIQUES[tech.id].name : null;
      if (rnd() < 0.24) {
        push({ round, kind: 'miss', text: `${a.name} ${techName ? `tries ${techName} but ` : ''}misses ${b.name}.`, actor: i, target: t });
        continue;
      }
      const crit = rnd() < 0.14;
      let dmg = Math.max(1, Math.round(2 + rnd() * (getStat(a, 'str') * 0.7 + 3) + (useTech ? 2 : 0)));
      if (crit) dmg *= 2;
      hp[t] = Math.max(0, hp[t] - dmg);
      push({
        round, kind: crit ? 'crit' : useTech ? 'tech' : 'attack', actor: i, target: t, dmg, crit, tech: useTech ? tech.id : undefined,
        text: `${a.name} ${techName ? `uses ${techName} on` : crit ? 'savages' : 'strikes'} ${b.name} for ${dmg}${crit ? ' — a critical hit!' : '.'}`,
      });
      if (hp[t] <= 0) push({ round, kind: 'ko', actor: i, target: t, text: `${b.name} is knocked out!` });
      else if (rnd() < 0.06) {
        const heal = 4 + Math.floor(rnd() * 6);
        hp[t] = Math.min(hpMax[t], hp[t] + heal);
        push({ round, kind: 'heal', actor: t, target: t, dmg: heal, text: `${b.name} shakes it off and recovers ${heal} health.` });
      }
    }
  }
  const pct = (s: 0 | 1) => all.reduce((acc, _, i) => acc + (side(i) === s ? hp[i] / hpMax[i] : 0), 0);
  const winner: 0 | 1 = !alive(1) ? 0 : !alive(0) ? 1 : pct(0) >= pct(1) ? 0 : 1;
  const decidedBy = alive(0) && alive(1) ? 'crowd' : 'ko';
  push({ round, kind: 'end', text: decidedBy === 'crowd' ? `Time! The crowd chooses ${winner === 0 ? me.name : rival?.name}.` : `${winner === 0 ? me.name : rival?.name} wins the bout.` });
  return {
    winner, decidedBy, rounds: round, log,
    fighters: all.map((c, i) => ({
      id: c.id, name: c.name, species: c.species, side: side(i), hpMax: hpMax[i], colors: c.genes.colors, sex: c.sex, maturity: c.maturity,
      rider: !!c.gear.rider, weapon: c.gear.weapon ? me.armory.find((g) => g.id === c.gear.weapon)?.type : undefined,
      armor: c.gear.armor ? me.armory.find((g) => g.id === c.gear.armor)?.type : undefined,
    })),
    outcomes: all.map((c, i) => ({
      creatureId: c.id, side: side(i), knockedOut: hp[i] <= 0, yielded: false, died: false, injury: null, xp: 20, fame: 2, loyalty: 0,
      newTraits: [] as TraitId[], hpEnd: hp[i], hpMax: hpMax[i], biggestHit: 0,
    })),
  };
}

export function devSampleResults(state: GameState): ResultCard[] {
  const babies = state.player.ludus.creatures.filter((c) => c.maturity < 0.1).slice(0, 2);
  const w = state.world.week;
  return [
    { kind: 'league', league: 'lunar', standings: [
      { name: 'Gannicus', house: 'Batiatus', points: 12 }, { name: 'Tetraites', house: state.player.ludus.name, points: 9 },
      { name: 'Oenomaus', house: 'Batiatus', points: 7 }, { name: 'Hanno', house: 'Solonius', points: 4 },
    ] },
    { kind: 'story', title: 'The Thracian', text: 'Word spreads through the markets: Batiatus has bought a Thracian Allosaurus that killed four handlers on the road from the coast. The slaves already whisper his name. Spartacus.' },
    { kind: 'escape', text: 'In the dead of night Arsaces slipped his chain and made for the hills.', names: ['Arsaces'], outcome: 'Your wardens ran him down at the river. He is back in the pen, sulking.' },
    { kind: 'hatch', names: babies.map((b) => `${b.name} (${SPECIES[b.species].name})`), text: babies.length > 1 ? 'New hatchlings join the ludus.' : 'A new hatchling joins the ludus.' },
    { kind: 'death', names: ['Triceratops egg'], text: 'A Triceratops egg died: it was kept at 18°C (needs 22–30°C).' },
    { kind: 'report', week: w, entries: [
      { kind: 'income', text: 'Mining (3 miners)', amount: 30 }, { kind: 'income', text: 'Residence', amount: 50 },
      { kind: 'income', text: 'Ludi Plebeii: Tetraites reached the final', amount: 120 },
      { kind: 'expense', text: 'Keeper upkeep', amount: -18 }, { kind: 'expense', text: 'Dino upkeep', amount: -44 },
      { kind: 'expense', text: 'Hatchery braziers and shade', amount: -6 }, { kind: 'expense', text: 'Nursery feed', amount: -13 },
      { kind: 'good', text: 'Flamma learned the trait Glory Seeker' }, { kind: 'info', text: 'Livia laid a fertilized Velociraptor egg (sire Bendis).' },
      { kind: 'warning', text: 'Tameness of Bendis is falling (72).' }, { kind: 'bad', text: 'Sobek is still injured (2 weeks).' },
    ] },
  ];
}
