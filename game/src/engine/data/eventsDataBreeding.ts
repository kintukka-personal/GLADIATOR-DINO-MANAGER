// Breeding and dino-life decision events (Jurassic Ludus additions on the GM event engine).
// OWNER: systems-story agent. DESIGN §4.

import type { Creature, Egg, FoodId, GameState, KibbleTier, Ludus, SpeciesId } from '../types';
import { STATS } from '../types';
import type { EventDef } from '../events';
import { chance, clamp, coin, pick, rand, range } from '../rng';
import { activeRivals, hasUpgrade, message, report } from '../util';
import { addTrait, generateDino, getStat, hasTrait, isAdult, marketPrice, wildLevel } from '../creature';
import { SPECIES, DINO_SPECIES } from './species';
import { EGG_BASE_PRICE, EGG_SIZE_NAME, FOODS, KIBBLE_FOR_TIER } from './food';
import { breedingIssue, conceive, eggValue, generateMarketEgg, markFate, seasonName } from '../breeding';
import { changeOpinion } from '../rivals';
import { loseKeepers } from '../economy';
import { sendOnAdventure, tamingEffectiveness, wildHerdSpecies } from '../adventures';
import {
  type DelayedHandler, bestOf, champion, cname, decide, dinoFoe, dn, earn, fit, fitOf, full, giveGear, infl, keepers,
  killMine, me, mine, optId, payOption, rank, req, sicken, sname, someRival, spend, stillOrChampion, streetFight, tame, wk,
  detach,
} from './eventsDataKit';

const fertEggs = (h: Ludus): Egg[] => h.eggs.filter((e) => e.fertilized);
const bestEgg = (h: Ludus): Egg | undefined => [...fertEggs(h)].sort((a, b) => eggValue(b) - eggValue(a))[0];
const young = (h: Ludus): Creature[] => h.creatures.filter((c) => c.maturity < 1);
const eggName = (e: Egg): string => `${SPECIES[e.species].name} egg`;
const TIERS: KibbleTier[] = ['simple', 'regular', 'superior', 'exceptional', 'extraordinary'];

function stealEgg(s: GameState, egg: Egg, to?: Ludus): void {
  const h = me(s);
  h.eggs = h.eggs.filter((e) => e.id !== egg.id);
  if (to) to.eggs.push({ ...egg, source: 'rival' });
}

/** Change the health of eggs; eggs at 0 die. Returns lines. */
function eggHealth(s: GameState, eggs: Egg[], delta: number): string[] {
  const h = me(s);
  const out: string[] = [];
  for (const e of eggs) {
    e.health = clamp(Math.round((e.health + delta) * 100) / 100, 0, 1);
    if (e.health <= 0) {
      h.eggs = h.eggs.filter((x) => x.id !== e.id);
      out.push(`A ${eggName(e)} did not survive.`);
    }
  }
  return out;
}

function weatherEvent(key: 'heatwave' | 'coldSnap'): EventDef {
  const hot = key === 'heatwave';
  return {
    key,
    make(s) {
      const eggs = fertEggs(me(s));
      if (!eggs.length) return null;
      const season = seasonName(wk(s));
      const t = s.world.temperature;
      if (hot ? !(season === 'Summer' || t >= 30) : !(season === 'Winter' || t <= 12)) return null;
      const cost = 15 * eggs.length;
      return decide(s, key, hot ? 'Heatwave' : 'Cold snap',
        hot
          ? `A furnace wind is blowing out of Africa and the hatchery sand is too hot to touch. ${eggs.length === 1 ? 'Your egg is' : `Your ${eggs.length} eggs are`} cooking.`
          : `A cold snap has come down from the mountains; there is frost on the hatchery straw. ${eggs.length === 1 ? 'Your egg is' : `Your ${eggs.length} eggs are`} chilling.`,
        [
          { id: 'pay', label: hot ? `Buy shade cloth and wet sacks (${dn(cost)})` : `Buy extra fuel for the braziers (${dn(cost)})`, cost, desc: 'Every egg +20% health.' },
          { id: 'risk', label: 'Risk it', desc: 'Every egg −30% health; weak eggs may die.' },
        ], { eggs: eggs.map((e) => e.id) }, 'hatchery');
    },
    resolve(s, d, o) {
      const eggs = me(s).eggs.filter((e) => (d.data.eggs as string[]).includes(e.id));
      if (optId(d, o) === 'pay') {
        payOption(s, d, o);
        eggHealth(s, eggs, 0.2);
        return { text: hot ? 'Wet sacks and shade cloth keep the clutch cool. The eggs are healthier for the care.' : 'The braziers burn day and night. The eggs are healthier for the warmth.' };
      }
      const dead = eggHealth(s, eggs, -0.3);
      return { text: `${hot ? 'The heat' : 'The cold'} takes its toll on the clutch.${dead.length ? ` ${dead.join(' ')}` : ' All the eggs survived, weaker.'}` };
    },
    onExpire(s, d) {
      const eggs = me(s).eggs.filter((e) => (d.data.eggs as string[]).includes(e.id));
      eggHealth(s, eggs, -0.3);
    },
  };
}

/** A female with 1–2 mutations from a famous bloodline, for the breeders' fair. */
function mutatedFemale(s: GameState): Creature {
  const c = generateDino({ week: wk(s), sex: 'F', level: range(1, 3), bonusWild: 2 });
  c.maturity = 1;
  if (c.adultWeeks < 10) c.adultWeeks = 10 + rand(60);
  c.ageWeeks = SPECIES[c.species].matureWeeks + c.adultWeeks;
  const n = chance(0.3) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const stat = pick(STATS);
    const side = coin() ? 'matri' : 'patri';
    c.genes.wild[stat] += 2;
    c.genes.mutatedPoints[stat] += 2;
    if (side === 'matri') c.genes.mutMatri++;
    else c.genes.mutPatri++;
    c.genes.mutations.push({ stat, side, week: wk(s) });
  }
  c.genes.generation = Math.max(c.genes.generation, range(2, 5));
  c.genes.bred = true;
  c.traits = c.traits.filter((t) => t !== 'Sterile');
  return c;
}

/** Females of the player that could be mated this week. */
function breedableFemales(s: GameState): Creature[] {
  const h = me(s);
  return h.creatures.filter((c) => c.sex === 'F' && !breedingIssue(c) && c.mateCooldown <= 0 && !h.pairs.some((p) => p.femaleId === c.id));
}

function studFor(s: GameState, female: Creature): { male: Creature; house: Ludus } | undefined {
  let best: { male: Creature; house: Ludus } | undefined;
  for (const r of activeRivals(s)) {
    for (const m of r.creatures) {
      if (m.sex !== 'M' || m.species !== female.species || breedingIssue(m)) continue;
      if (!best || wildLevel(m) > wildLevel(best.male)) best = { male: m, house: r };
    }
  }
  return best;
}

export const BREEDING_EVENTS: EventDef[] = [
  // -------------------------------------------------------------------- Egg poachers
  {
    key: 'eggPoachers',
    make(s) {
      const egg = bestEgg(me(s));
      if (!egg) return null;
      const champ = champion(s);
      const wardens = me(s).keepers.wardens;
      const pct = Math.round(clamp(0.4 + 0.1 * wardens, 0.4, 0.95) * 100);
      return decide(s, 'eggPoachers', 'Egg poachers',
        `Your wardens found raptor tracks and a rope ladder by the hatchery wall. Poachers are after your ${eggName(egg)}, and they will be back tonight. A fertilized egg fetches a fortune in Neapolis.`,
        [
          { id: 'wardens', label: 'Post wardens around the hatchery', need: req(wardens >= 2, 'You need at least 2 wardens.'), desc: `${pct}% chance they hold.` },
          { id: 'fight', label: champ ? `Have ${cname(champ)} lie in wait` : 'Lie in wait', need: req(!!champ, 'Nobody fit to fight.'), desc: 'A street fight against the poachers\' raptors.' },
          { id: 'let', label: 'Let them have it', desc: 'The egg is lost.' },
        ], { egg: egg.id, champ: champ?.id, pct }, 'hatchery');
    },
    resolve(s, d, o) {
      const h = me(s);
      const egg = h.eggs.find((e) => e.id === d.data.egg);
      if (!egg) return { text: 'The egg is no longer in your hatchery.' };
      const id = optId(d, o);
      if (id === 'wardens') {
        if (rand(100) < d.data.pct) return { text: 'The poachers came, saw the torches, and went home.' };
        stealEgg(s, egg);
        loseKeepers(s, h, 1, 'wardens');
        return { text: `The poachers came over the far wall. A warden took a claw to the throat, and the ${eggName(egg)} is gone.` };
      }
      if (id === 'fight') {
        const c = stillOrChampion(s, d.data.champ);
        if (!c) return { text: 'Nobody was fit to fight; the poachers took the egg.' };
        const foes = [
          dinoFoe(s, 'velociraptor', "Poacher's Velociraptor", { mult: 0.85 }),
          dinoFoe(s, 'troodon', "Poacher's Troodon", { mult: 0.85, traits: ['Sneaky'] }),
        ];
        const f = streetFight(s, { title: 'Egg poachers', fighters: [c], foes, foeName: 'the egg poachers', allies: true });
        if (!f.won) stealEgg(s, egg);
        return { text: f.won ? `${cname(c)} was waiting in the dark. The poachers left without the egg, and without some of their teeth. ${f.text}` : `The poachers fought their way out with the ${eggName(egg)}. ${f.text}`, battle: f.battle };
      }
      stealEgg(s, egg);
      return { text: `In the morning the ${eggName(egg)} is gone and a single feather lies in the straw.` };
    },
    onExpire(s, d) {
      const egg = me(s).eggs.find((e) => e.id === d.data.egg);
      if (egg) stealEgg(s, egg);
    },
  },

  // -------------------------------------------------------------------- Strange egg
  {
    key: 'strangeEgg',
    make(s) {
      const week = wk(s);
      const pool = DINO_SPECIES.filter((sp) => SPECIES[sp].marketFromWeek <= week + 20 || chance(0.1));
      const sp: SpeciesId = chance(0.1) ? pick(['sarcosuchus', 'terrorbird'] as SpeciesId[]) : pick(pool.length ? pool : DINO_SPECIES);
      const size = SPECIES[sp].eggSize;
      const price = Math.round(EGG_BASE_PRICE[size] * 0.6);
      if (me(s).denarii < price) return null;
      return decide(s, 'strangeEgg', 'A strange egg',
        `A one-eyed sailor offers you a ${EGG_SIZE_NAME[size].toLowerCase()} speckled egg wrapped in a fishing net. He swears it is fertile and will not say where he got it. ${dn(price)}, no questions.`,
        [
          { id: 'buy', label: `Buy it (${dn(price)})`, cost: price, desc: 'Who knows what will hatch?' },
          { id: 'refuse', label: 'No questions, no egg' },
        ], { species: sp, price }, 'hatchery');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'buy') return { text: 'The sailor shrugs and offers it to the fishmonger.' };
      payOption(s, d, o);
      if (rand(100) < 2) {
        giveGear(s, 'mysteriousEgg', 2);
        return { text: 'The egg is heavier than it looks, warm, and it hums. Your hatchery keeper refuses to touch it. It is a Mysterious Egg: it needs the heat of battle to hatch.' };
      }
      const egg = generateMarketEgg(s, d.data.species as SpeciesId);
      egg.source = 'event';
      egg.known = false;
      egg.price = d.data.price;
      me(s).eggs.push(egg);
      return { text: `The egg goes into the hatchery. Your keeper squints at it: "${SPECIES[egg.species].name}, I think. Or a very big chicken."` };
    },
  },

  // -------------------------------------------------------------------- Stud services
  {
    key: 'studServices',
    make(s) {
      const females = breedableFemales(s).filter((f) => studFor(s, f));
      if (!females.length) return null;
      const female = rank(females)[0];
      const stud = studFor(s, female)!;
      const op = stud.house.ai?.opinion ?? 50;
      const base = 150 + 6 * Math.max(0, wildLevel(stud.male) - 10) + Math.floor(stud.male.fame / 5);
      const price = clamp(Math.round(base * (1 + (60 - op) / 100)), 150, 400);
      return decide(s, 'studServices', 'Stud services',
        `${stud.house.name} offers the services of ${full(stud.male)} (wild level ${wildLevel(stud.male)}${stud.male.genes.mutations.length ? `, ${stud.male.genes.mutMatri + stud.male.genes.mutPatri} mutations in the line` : ''}) ` +
        `to your ${cname(female)}. The fee is ${dn(price)}, paid up front, results not guaranteed by the gods.`,
        [
          { id: 'pay', label: `Pay ${dn(price)}`, cost: price, desc: `${cname(female)} is mated with ${cname(stud.male)} this week.` },
          { id: 'refuse', label: 'Decline' },
        ], { female: female.id, male: stud.male.id, house: stud.house.id }, 'hatchery');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'pay') return { text: 'The stud goes home unemployed.' };
      const female = mine(s, d.data.female);
      const house = s.rivals.find((r) => r.id === d.data.house && !r.defeated);
      const male = house?.creatures.find((c) => c.id === d.data.male);
      if (!female || !male || !house) return { text: 'The arrangement fell through before anything happened.' };
      if (breedingIssue(female) || female.mateCooldown > 0) return { text: `${cname(female)} is in no condition to mate this week. Maybe another time.` };
      payOption(s, d, o);
      house.denarii += d.data.costs?.[o] ?? 0;
      changeOpinion(s, house, 5);
      const line = conceive(s, me(s), male, female);
      return { text: `${house.name} sends ${cname(male)} over with two handlers and a basket of figs. ${line}` };
    },
  },

  // -------------------------------------------------------------------- Breeders' fair
  {
    key: 'breedersFair',
    make(s) {
      if (wk(s) < 6) return null;
      const female = mutatedFemale(s);
      const price = Math.round(marketPrice(female) * 1.5);
      const egg = bestEgg(me(s));
      const sale = egg ? Math.round(eggValue(egg) * 1.5) : 0;
      const muts = female.genes.mutations.length;
      return decide(s, 'breedersFair', "The breeders' fair",
        `The breeders of Campania meet in Capua. The star of the fair is ${full(female)}, a female from a famous line carrying ${muts === 1 ? 'a mutation' : `${muts} mutations`}. ` +
        `Her owner wants ${dn(price)}.${egg ? ` A dealer has also asked after your ${eggName(egg)}: he offers ${dn(sale)}.` : ''}`,
        [
          { id: 'buy', label: `Buy ${female.name} (${dn(price)})`, cost: price },
          { id: 'sell', label: egg ? `Sell your ${eggName(egg)} (+${dn(sale)})` : 'Sell an egg', cost: egg ? -sale : 0, need: req(!!egg, 'You have no fertilized egg.') },
          { id: 'browse', label: 'Just look around' },
        ], { female, price, egg: egg?.id, sale }, 'hatchery');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'buy') {
        payOption(s, d, o);
        const c = d.data.female as Creature;
        c.price = undefined;
        me(s).creatures.push(c);
        return { text: `${full(c)} joins your ludus. Her bloodline is now yours.` };
      }
      if (id === 'sell') {
        const egg = me(s).eggs.find((e) => e.id === d.data.egg);
        if (!egg) return { text: 'The egg is gone; the dealer walks away.' };
        payOption(s, d, o);
        me(s).eggs = me(s).eggs.filter((e) => e.id !== egg.id);
        return { text: `The dealer pays ${dn(d.data.sale)} and carries the ${eggName(egg)} off like a newborn.` };
      }
      return { text: 'You admire the crests and frills and go home with nothing but ideas.' };
    },
  },

  // -------------------------------------------------------------------- Heatwave / cold snap
  weatherEvent('heatwave'),
  weatherEvent('coldSnap'),

  // -------------------------------------------------------------------- Hatchling escapes the pen
  {
    key: 'hatchlingEscapes',
    make(s) {
      const h = me(s);
      const runaway = h.creatures.find((c) => c.maturity >= 0.1 && c.maturity < 1 && !c.away);
      if (!runaway) return null;
      const fast = [...fitOf(h, (c) => c.id !== runaway.id && c.maturity >= 1)].sort((a, b) => getStat(b, 'agi') - getStat(a, 'agi'))[0];
      return decide(s, 'hatchlingEscapes', 'A hatchling escapes the pen',
        `${full(runaway)} squeezed under the fence in the night. A shepherd saw it in the olive groves, squaring up to a wild juvenile twice its size.`,
        [
          { id: 'chase', label: fast ? `Send ${cname(fast)} after it` : 'Send your fastest dino', need: req(!!fast, 'Nobody fit to run.'), desc: 'A fight with the wild juvenile.' },
          { id: 'coax', label: 'Let the keepers coax it home', desc: `${cname(runaway)} comes back with a taste for freedom: −15 tameness.` },
          { id: 'let', label: 'Let it go wild', desc: 'It is gone for good.' },
        ], { cid: runaway.id, fast: fast?.id }, 'hatchery');
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The hatchling is already gone.' };
      const id = optId(d, o);
      if (id === 'coax') {
        tame(c, -15);
        return { text: `After two days of whistling and dangling meat, ${cname(c)} wanders back in, filthy and pleased with itself. −15 tameness.` };
      }
      if (id === 'let') {
        detach(s, c);
        markFate(s, c, 'Ran off into the wild as a hatchling');
        return { text: `${cname(c)} is never seen again. Shepherds will tell stories about it for years.` };
      }
      const fast = stillOrChampion(s, d.data.fast, [c.id]);
      if (!fast) {
        tame(c, -15);
        return { text: `Nobody was fit to run, so the keepers coaxed ${cname(c)} home. −15 tameness.` };
      }
      const species = pick(['velociraptor', 'troodon', 'dilophosaurus', 'pachycephalosaurus'] as const);
      const wild = generateDino({ species, week: wk(s), eqAge: 11 + rand(4), level: 1 });
      wild.name = `Wild juvenile ${SPECIES[species].name}`;
      const f = streetFight(s, { title: 'The runaway hatchling', fighters: [fast], foes: [wild], foeName: 'a wild juvenile', stake: 0 });
      if (f.won) {
        tame(c, 5);
        return { text: `${cname(fast)} chases the wild one off and herds ${cname(c)} home. ${f.text}`, battle: f.battle };
      }
      tame(c, -15);
      return { text: `The wild juvenile sent ${cname(fast)} packing. ${cname(c)} came home on its own two days later, wilder (−15 tameness). ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Feathered fever
  {
    key: 'featheredFever',
    make(s) {
      const h = me(s);
      const kids = young(h);
      if (kids.length < 2) return null;
      const vet = h.buildings.veterinarium > 0;
      const cost = (vet ? 20 : 40) * kids.length;
      return decide(s, 'featheredFever', 'Feathered fever',
        `The hatchlings are sneezing, shedding feathers and refusing their meat. Feathered fever: it runs through a nursery like fire through a granary. ${kids.length} young creatures are at risk.`,
        [
          { id: 'vet', label: vet ? `Treat them at the Veterinarium (${dn(cost)})` : `Call in a veterinarian (${dn(cost)})`, cost, desc: 'All cured.' },
          { id: 'isolate', label: 'Isolate the sick ones', desc: 'Some fall ill; the adults are safe.' },
          { id: 'nothing', label: 'It is only a sniffle', desc: 'Many will fall ill. It may spread. The smallest may die.' },
        ], { kids: kids.map((c) => c.id) }, 'hatchery');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const kids = (d.data.kids as string[]).map((x) => mine(s, x)).filter((c): c is Creature => !!c);
      if (id === 'vet') {
        payOption(s, d, o);
        return { text: 'Steam, bitter herbs and a lot of squawking. Every hatchling is back on its meat within the week.' };
      }
      const chanceIll = id === 'isolate' ? 0.4 : 0.6;
      const ill: string[] = [];
      const dead: string[] = [];
      for (const c of kids) {
        if (id === 'nothing' && c.maturity < 0.1 && chance(0.1)) {
          dead.push(cname(c));
          killMine(s, c, 'Died of feathered fever');
          continue;
        }
        if (chance(chanceIll)) {
          sicken(c, range(2, 3));
          ill.push(cname(c));
        }
      }
      if (id === 'nothing' && chance(0.25)) {
        const adult = me(s).creatures.filter((c) => c.maturity >= 1 && !c.away);
        if (adult.length) {
          const a = pick(adult);
          sicken(a, 2);
          ill.push(`${cname(a)} (an adult)`);
        }
      }
      const parts: string[] = [];
      if (ill.length) parts.push(`Fell ill: ${ill.join(', ')}.`);
      if (dead.length) parts.push(`Died: ${dead.join(', ')}.`);
      return { text: parts.length ? parts.join(' ') : 'The fever burned itself out. Lucky.' };
    },
  },

  // -------------------------------------------------------------------- Gene merchant (Mutagen)
  {
    key: 'geneMerchant',
    make(s) {
      if (!hasUpgrade(s, 'mutagenLab')) return null;
      const price = range(6, 8) * 100;
      if (me(s).denarii < price / 2) return null;
      return decide(s, 'geneMerchant', 'The gene merchant',
        `An Alexandrian alchemist with stained fingers offers a vial of Mutagen, distilled from amber and something he will not name. ${dn(price)}. "One dose per creature. Side effects are... interesting."`,
        [
          { id: 'buy', label: `Buy the Mutagen (${dn(price)})`, cost: price },
          { id: 'refuse', label: 'Refuse' },
        ], { price }, 'merchant');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'buy') return { text: 'The alchemist bows and takes his vial to your rivals.' };
      payOption(s, d, o);
      giveGear(s, 'mutagen', 2);
      return { text: 'The vial of Mutagen goes into the armory, glowing faintly.' };
    },
  },

  // -------------------------------------------------------------------- Proud mother
  {
    key: 'proudMother',
    make(s) {
      const h = me(s);
      const mother = h.creatures.find((c) => c.sex === 'F' && isAdult(c) && !c.away && (
        h.eggs.some((e) => e.fertilized && e.motherId === c.id) || h.creatures.some((b) => b.maturity < 0.1 && b.genes.motherId === c.id)));
      if (!mother) return null;
      return decide(s, 'proudMother', 'A proud mother',
        `${full(mother)} has decided that her clutch is hers and nobody else's. She hisses at the keepers, broke a feeding pole and will not leave the nest.`,
        [
          { id: 'nest', label: 'Let her nest', desc: '+10 tameness for her; her eggs do better; she does nothing else this week.' },
          { id: 'drive', label: 'Drive her off with prods', desc: '−15 tameness for her.' },
          { id: 'treat', label: 'Send a keeper in with a treat', desc: 'Brave. Possibly fatal.' },
        ], { cid: mother.id }, 'hatchery');
    },
    resolve(s, d, o) {
      const m = mine(s, d.data.cid);
      if (!m) return { text: 'The mother is gone; the nest is quiet.' };
      const id = optId(d, o);
      if (id === 'nest') {
        tame(m, 10);
        m.inactive = true;
        for (const e of me(s).eggs) if (e.motherId === m.id) e.health = Math.min(1, e.health + 0.1);
        return { text: `${cname(m)} settles on her nest with a contented rumble. +10 tameness.` };
      }
      if (id === 'drive') {
        tame(m, -15);
        return { text: `The keepers drive ${cname(m)} off the nest. She will not forget it (−15 tameness).` };
      }
      if (coin()) {
        tame(m, 10);
        return { text: `The keeper crawls in with a leg of mutton. ${cname(m)} takes it, sniffs him, and lets him live. +10 tameness.` };
      }
      loseKeepers(s, me(s), 1);
      return { text: `The keeper crawled in with a leg of mutton. ${cname(m)} preferred the keeper.` };
    },
  },

  // -------------------------------------------------------------------- Wild herd sighted → Wild Capture
  {
    key: 'wildHerd',
    make(s) {
      if (wk(s) < 3) return null;
      const c = champion(s);
      if (!c) return null;
      const h = me(s);
      const species = wildHerdSpecies(s);
      const pref = KIBBLE_FOR_TIER[SPECIES[species].kibble];
      const opts = TIERS.map((t) => {
        const k = KIBBLE_FOR_TIER[t];
        const have = h.pantry[k] ?? 0;
        const price = s.world.market.foodPrices?.[k] ?? FOODS[k].price;
        const te = Math.round(tamingEffectiveness(species, k) * 100);
        return {
          id: k,
          label: `Lure it with ${FOODS[k].name}${have > 0 ? ` (${have} in the pantry)` : ` (buy for ${dn(price)})`}`,
          cost: have > 0 ? 0 : price,
          desc: `Taming effectiveness ${te}%${k === pref ? ' (its favourite)' : ''}.`,
        };
      });
      return decide(s, 'wildHerd', 'A wild herd sighted',
        `Shepherds report a herd of wild ${SPECIES[species].name}s grazing in the hills above Capua. With the right kibble, ${full(c)} could wear one down and bring it home tamed. ` +
        `Better kibble makes a better tame.`,
        [...opts, { id: 'ignore', label: 'Leave the herd alone' }], { species, champ: c.id }, 'hunt');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'ignore') return { text: 'The herd moves on over the hills.' };
      const c = stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody is fit for the hunt.' };
      const kibble = id as FoodId;
      sendOnAdventure(s, 'wildCapture', [c.id], 2, { species: d.data.species, kibble }, `Wild Capture: ${SPECIES[d.data.species as SpeciesId].name}`);
      return { text: `${cname(c)} sets off into the hills with a sack of ${FOODS[kibble].name} and a coil of rope.` };
    },
  },

  // -------------------------------------------------------------------- Rival egg theft rumour
  {
    key: 'rivalEggTheft',
    make(s) {
      const h = me(s);
      const egg = bestEgg(h);
      const r = someRival(s);
      if (!egg || !r) return null;
      const cost = 40 + 10 * fertEggs(h).length;
      return decide(s, 'rivalEggTheft', 'Rumours of egg theft',
        `Your spies hear that ${r.name} has hired a nimble thief to steal your ${eggName(egg)}. A fine egg would look very good in their hatchery.`,
        [
          { id: 'pay', label: `Pay your wardens for double shifts (${dn(cost)})`, cost, desc: 'The egg is safe.' },
          { id: 'post', label: 'Post your own wardens', need: req(h.keepers.wardens >= 3, 'You need at least 3 wardens.'), desc: '70% safe.' },
          { id: 'ignore', label: 'Rumours, rumours', desc: 'The egg will be stolen.' },
        ], { egg: egg.id, rival: r.id }, 'hatchery');
    },
    resolve(s, d, o) {
      const h = me(s);
      const egg = h.eggs.find((e) => e.id === d.data.egg);
      const r = s.rivals.find((x) => x.id === d.data.rival && !x.defeated);
      if (!egg) return { text: 'The egg is no longer in your hatchery.' };
      const id = optId(d, o);
      if (id === 'pay') {
        payOption(s, d, o);
        return { text: 'Your wardens watch the hatchery around the clock. The thief never shows.' };
      }
      if (id === 'post' && chance(0.7)) return { text: 'The wardens catch a skinny boy on the hatchery roof and send him home with a sore backside.' };
      stealEgg(s, egg, r);
      if (r) changeOpinion(s, r, -5);
      return { text: `The ${eggName(egg)} vanished in the night. A week later ${r?.name ?? 'a rival house'} is showing off a very similar egg.` };
    },
    onExpire(s, d) {
      const egg = me(s).eggs.find((e) => e.id === d.data.egg);
      if (egg) stealEgg(s, egg, s.rivals.find((x) => x.id === d.data.rival && !x.defeated));
    },
  },
];

export const BREEDING_DELAYED: Record<string, DelayedHandler> = {};

