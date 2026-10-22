// General weekly decision events (GM 04 §6.2), renamed for dinos. OWNER: systems-story agent.

import type { BeastSpeciesId, Creature, Decision, GameState, GearTypeId, Quality, TraitId, WeaponFamily } from '../types';
import type { EventDef } from '../events';
import { chance, clamp, coin, pick, rand, range } from '../rng';
import { activeRivals, asc, ASC, hasUpgrade, message, report, visibleRivals } from '../util';
import { addTrait, generateBeast, generateDino, hasTrait, removeTrait, replaceTrait } from '../creature';
import { SPECIES } from './species';
import { GEAR, gearName, gearWorth } from './gear';
import { committedSpies, loseKeepers, addKeepers } from '../economy';
import { constructionLevel, loseRandomBuilding } from '../buildings';
import { rollMerchant } from '../market';
import { changeOpinion } from '../rivals';
import { sendOnAdventure } from '../adventures';
import {
  type DelayedHandler, armoryHas, bestOf, beastFoe, champion, cname, decide, detach, dinoFoe, dn, earn, fit, fitMine, fitOf,
  full, giveGear, giveUnique, hasDelayed, hasOppSafe, infl, injure, isConsul, keepers, killMine, L, me, mine, minerva,
  optId, payOption, princeps, randomGoodTrait, rank, req, schedule, senateInfluence, sicken, sname, someRival,
  stillOrChampion, streetFight, tame, tameAll, traitName, wearer, wk, foeLevel, spend, cloneAsFoe, words,
} from './eventsDataKit';

const TUT = '__tutorial';
/** True while the GM tutorial weeks are being drawn (thresholds relaxed). */
export const tutorial = (s: GameState): boolean => s.player.week[TUT] === true;

const dinosOf = (s: GameState): Creature[] => me(s).creatures.filter((c) => c.kind === 'dino' && !c.away);
const fitDinos = (s: GameState): Creature[] => fitOf(me(s), (c) => c.kind === 'dino');
const crocs = (s: GameState): Creature[] => me(s).creatures.filter((c) => c.species === 'sarcosuchus');
const hasCroc = (s: GameState): boolean => crocs(s).length > 0;
const feedCrocs = (s: GameState): void => {
  for (const c of crocs(s)) addTrait(c, 'ManEater');
};
const firstPlaces = (s: GameState): number => me(s).trophies.filter((t) => t.place === 1).length;
const mining = (s: GameState, d: number): void => {
  const h = me(s);
  h.miningBonus = Math.max(-9, h.miningBonus + d);
};
const lose = (s: GameState, n: number, job?: Parameters<typeof loseKeepers>[3]): number => (n > 0 ? loseKeepers(s, me(s), n, job) : 0);
const pl = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Release a dino to the wild (GM rudis): leaves with the Freedom trait into world.released. */
export function releaseCreature(s: GameState, c: Creature): void {
  detach(s, c);
  addTrait(c, 'Freedom');
  removeTrait(c, 'DemandingFreedom');
  c.away = undefined;
  c.loyalty = 100;
  c.injury = null;
  s.world.released.push(c);
}

function scoutedPits(s: GameState): boolean {
  const id = me(s).id;
  return s.world.tournaments.some((t) => (t.underground || t.type === 'underground') && t.entries.some((e) => e.houseId === id));
}

const WEAPONS_BY_FAMILY: Record<WeaponFamily, GearTypeId[]> = {
  claw: ['talonBlades', 'greatTalons', 'hookClaws', 'sickleClaws', 'scytheClaws', 'parryingSpurs'],
  fang: ['venomFangs', 'fangCaps'],
  horn: ['bronzeHorn', 'tridentHorns', 'hornLance'],
  mace: ['obsidianCrusher', 'ankyloHammer', 'tailClub'],
  spit: ['venomSpitter', 'spineDarts'],
  jaw: ['ironJaws'],
  whip: ['tailWhip'],
};

function bestFamily(c: Creature): WeaponFamily {
  const fams = Object.keys(c.prof) as WeaponFamily[];
  return fams.reduce((a, b) => (c.prof[b] > c.prof[a] ? b : a), 'claw' as WeaponFamily);
}

function weaponFor(s: GameState, fam: WeaponFamily): GearTypeId {
  const opts = WEAPONS_BY_FAMILY[fam].filter((t) => !GEAR[t].upgrade || hasUpgrade(s, GEAR[t].upgrade!));
  return opts[0] ?? 'talonBlades';
}

/** Weapon quality by the calendar (GM captive smith: Regular, Quality after 55, MC after 75). */
const smithQuality = (week: number): Quality => (week >= 75 ? 4 : week >= 55 ? 3 : 2);

function bestWeapon(h: GameState['player']['ludus']) {
  return h.armory
    .filter((g) => GEAR[g.type].slot === 'weapon' && g.augment !== 'Broken' && g.augment !== 'BrokenTimeWarp')
    .sort((a, b) => gearWorth(b) - gearWorth(a))[0];
}

export const GENERAL_EVENTS: EventDef[] = [
  // -------------------------------------------------------------------- Dino requests release (rudis)
  {
    key: 'releaseRequest', campaignToo: true,
    make(s) {
      const c = rank(dinosOf(s))[0];
      if (!c) return null;
      const need = hasTrait(c, 'GlorySeeker') ? 25 : 10;
      if (c.career.majorWins < need) return null;
      const lavish = c.level * 100;
      return decide(s, 'releaseRequest', `${cname(c)} requests release`,
        `${full(c)} has won ${c.career.majorWins} great tournaments and Capua chants its name. Its keepers say it paces the pen at night, staring at the hills. ` +
        `${cname(c)} wants to be released to the wild.`,
        [
          { id: 'free', label: 'Release it to the wild', desc: `${cname(c)} leaves the ludus. +25 influence, +25 tameness for the pack.` },
          { id: 'threaten', label: 'Threaten it with the prod', desc: '−25 tameness for the pack. It becomes Restless.' },
          { id: 'lavish', label: `Lavish rewards on it (${dn(lavish)})`, cost: lavish, desc: 'It stays, happier. The pack is jealous: −15 tameness.' },
        ], { cid: c.id }, 'release');
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The dino in question is no longer yours to release.' };
      switch (optId(d, o)) {
        case 'free': {
          releaseCreature(s, c);
          const got = infl(s, 25);
          tameAll(s, 25);
          return { text: `The gates open and ${cname(c)} walks out into the hills without looking back. The crowd will tell this story for years. +${got} influence, +25 tameness for the pack.` };
        }
        case 'threaten':
          tameAll(s, -25);
          addTrait(c, 'DemandingFreedom');
          return { text: `The prod settles the matter for now. ${cname(c)} is Restless, and the rest of the pack watched it all. −25 tameness.` };
        default:
          payOption(s, d, o);
          tameAll(s, -15, c.id);
          tame(c, 20);
          return { text: `${cname(c)} gets a new pen, prime meat and a keeper of its own. The others noticed. −15 tameness for the pack.` };
      }
    },
  },

  // -------------------------------------------------------------------- Suspected spy (05 §4.7)
  {
    key: 'spySuspect',
    make(s) {
      if (wk(s) < 20) return null;
      const dinos = dinosOf(s);
      if (dinos.length < 2) return null;
      const spies = dinos.filter((c) => c.spyFor);
      let suspect: Creature | undefined;
      let real = false;
      if (spies.length && chance(0.5)) {
        suspect = pick(spies);
        real = true;
      } else {
        if (!chance(0.3)) return null;
        if (hasOppSafe(s, 'informants') && chance(0.4)) return null;
        const innocent = dinos.filter((c) => !c.spyFor);
        if (!innocent.length) return null;
        suspect = pick(innocent);
      }
      const champ = champion(s, [suspect.id]);
      return decide(s, 'spySuspect', 'A spy in the pens?',
        `A keeper swears he saw ${full(suspect)} slip out of its pen at night and sniff around the back gate, where a hooded man waited with a sack of treats. ` +
        'A dino spying for a rival house? In Capua, anything is possible.',
        [
          { id: 'whip', label: 'Have it whipped until it talks', desc: 'Injury and −20 tameness for the suspect.' },
          { id: 'croc', label: 'Feed it to the Sarcosuchus', need: req(hasCroc(s), 'You need a Sarcosuchus.'), desc: 'It dies. +10 influence, +15 tameness for the pack.' },
          { id: 'follow', label: champ ? `Have ${cname(champ)} follow it` : 'Have your champion follow it', need: req(!!champ, 'Nobody fit to follow it.'), desc: 'It may come to a street fight.' },
          { id: 'ignore', label: 'Ignore the rumour', desc: '−10 tameness for the pack.' },
        ], { cid: suspect.id, real, champ: champ?.id, rival: suspect.spyFor }, 'spy');
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The suspect is gone; the question answered itself.' };
      const real: boolean = !!c.spyFor;
      const employer = s.rivals.find((r) => r.id === c.spyFor);
      switch (optId(d, o)) {
        case 'whip': {
          injure(c, 2);
          tame(c, -20);
          lose(s, 1);
          if (real) {
            c.spyFor = undefined;
            if (employer) changeOpinion(s, employer, -5);
            return { text: `Under the whip ${cname(c)} gives it all up: it was spying for ${employer?.name ?? 'a rival house'}. The keeper holding the whip lost two fingers and quit. −20 tameness for ${cname(c)}.` };
          }
          addTrait(c, 'MissingFingers');
          return { text: `${cname(c)} was innocent, and now has Broken Claws to prove it. The keeper holding the whip was bitten and quit.` };
        }
        case 'croc': {
          killMine(s, c, 'Fed to the Sarcosuchus as a suspected spy');
          feedCrocs(s);
          const got = infl(s, 10);
          tameAll(s, 15);
          return { text: `${cname(c)} goes into the Sarcosuchus pen. Whether it was a spy, only the Sarcosuchus knows, and it is not telling. +${got} influence; the pack is suddenly very well behaved (+15 tameness).` };
        }
        case 'follow': {
          const champ = stillOrChampion(s, d.data.champ, [c.id]);
          if (!champ) return { text: 'Nobody was fit to follow it. The matter is dropped.' };
          if (real) {
            const foes = [
              dinoFoe(s, 'velociraptor', "Thug's Velociraptor", { mult: 0.9, gear: [L('fangCaps', 2)] }),
              beastFoe(s, 'direwolf', "Thug's Dire Wolf", { mult: 0.9 }),
            ];
            const f = streetFight(s, { title: 'Following the spy', fighters: [champ], foes, foeName: 'hired thugs', allies: true, rival: employer });
            if (f.won) {
              c.spyFor = undefined;
              if (employer) changeOpinion(s, employer, -5);
              return { text: `${cname(champ)} followed ${cname(c)} to an alley where thugs of ${employer?.name ?? 'a rival house'} were waiting. ${f.text} The spy is turned back to your side.`, battle: f.battle };
            }
            return { text: `${cname(champ)} walked into an ambush in the alley. ${f.text}`, battle: f.battle };
          }
          if (coin()) return { text: `${cname(champ)} followed ${cname(c)} all night. It ate a goat, howled at the moon and went back to bed.` };
          const f = streetFight(s, { title: 'An offended suspect', fighters: [champ], foes: [c], foeHouse: me(s), foeName: cname(c), stake: 0 });
          tame(c, -10);
          return { text: `${cname(c)} noticed it was being followed and took offence. ${f.text}`, battle: f.battle };
        }
        default:
          tameAll(s, -10);
          if (!real) addTrait(c, 'Loyal');
          return { text: `You let it go. The pack takes your silence for weakness (−10 tameness).${real ? '' : ` ${cname(c)}, wrongly accused, is touched by your trust.`}` };
      }
    },
  },

  // -------------------------------------------------------------------- Sponsoring
  {
    key: 'sponsoring',
    make(s) {
      const items = me(s).armory.filter((g) => GEAR[g.type].slot === 'item').length;
      if (items > 3 || wk(s) > 80) return null;
      return decide(s, 'sponsoring', 'A sponsor for the arena',
        'A Neapolitan merchant wants your dinos to wear his healing poultices in the arena, his seal stamped on every one. ' +
        `He offers ${dn(100)} and two poultices if the crowd can read his name. Some will call it unbecoming.`,
        [
          { id: 'accept', label: 'Accept the deal', cost: -100, desc: '+100 denarii, 2 sponsored poultices, −10 influence.' },
          { id: 'senate', label: 'Remind him of the import tax on poultices', cost: -300, need: req(senateInfluence(s), 'Requires influence in the Senate.'), desc: '+300 denarii.' },
          { id: 'reject', label: 'Reject him' },
        ], {}, 'merchant');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'accept') {
        payOption(s, d, o);
        giveGear(s, 'poultice', 2, { sponsored: true });
        giveGear(s, 'poultice', 2, { sponsored: true });
        const got = infl(s, -10);
        return { text: `+${dn(100)} and two sponsored Healing Poultices. The patricians sneer at the merchant's seal (${got} influence).` };
      }
      if (id === 'senate') {
        payOption(s, d, o);
        return { text: `The merchant goes pale at the words "import tax" and pays ${dn(300)} to make the matter go away.` };
      }
      return { text: 'The merchant takes his poultices elsewhere.' };
    },
  },

  // -------------------------------------------------------------------- Not strictly legal..
  {
    key: 'notStrictlyLegal', tutorial: 0,
    make(s) {
      const w = wk(s);
      if (!tutorial(s) && (w % 2 !== 0 || me(s).denarii > (w < 20 ? 200 : 1000))) return null;
      const gain = (w > 20 ? 500 : 300) - (minerva(s) ? 100 : 0);
      return decide(s, 'notStrictlyLegal', 'Not strictly legal..',
        `An arena clerk offers to "misplace" part of the entry fees into your purse: ${dn(gain)}. Nobody would notice. Probably. ` +
        'Rival houses have clerks of their own, of course.',
        [
          { id: 'accept', label: 'Take the money', cost: -gain, desc: `+${gain} denarii, −10 influence. Every rival gains a spy and thinks less of you.` },
          { id: 'refuse', label: 'Refuse' },
        ], { gain });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'accept') return { text: 'The clerk shrugs and offers the deal to someone else.' };
      payOption(s, d, o);
      const got = infl(s, -10);
      for (const r of activeRivals(s)) {
        r.keepers.spies += 1;
        changeOpinion(s, r, -10);
      }
      return { text: `+${dn(d.data.gain)}. Word gets around anyway: ${got} influence, and every rival house has put an extra spy on you.` };
    },
  },

  // -------------------------------------------------------------------- Rumours of death (plague, Pluto)
  {
    key: 'plagueRumours',
    make(s) {
      if (!asc(s, ASC.pluto) || wk(s) < 20 || hasDelayed(s, 'plague')) return null;
      return decide(s, 'plagueRumours', 'Rumours of death',
        'Sailors in the port whisper of a sickness spreading from the east, of feathers falling out and keepers coughing blood. ' +
        'Pluto is hungry this year.',
        [
          { id: 'prepare', label: 'Prepare the ludus', cost: 100, desc: '−100 now and −150 every week until it passes, −5 influence. Far fewer losses.' },
          { id: 'ignore', label: 'Ignore the sailors', desc: '+10 influence for keeping calm.' },
        ], {}, 'plague');
    },
    resolve(s, d, o) {
      const prepared = optId(d, o) === 'prepare';
      if (prepared) {
        payOption(s, d, o);
        me(s).projected -= 150;
        infl(s, -5);
      } else infl(s, 10);
      schedule(s, 'plague', range(2, 4), { prepared });
      return { text: prepared ? 'Vinegar, smoke and sealed pens. The keepers grumble about the cost. −5 influence.' : 'You tell Capua there is nothing to fear. +10 influence, for now.' };
    },
  },

  // -------------------------------------------------------------------- Holy shrine rumours (Ariminium)
  {
    key: 'holyShrine', weight: 3,
    make(s) {
      const h = me(s);
      if (h.buildings.ariminiumCamp > 0) return null;
      if (h.denarii <= 1000 || h.influence <= 200 || keepers(h) <= 10) return null;
      if (!(s.player.senator || hasOppSafe(s, 'theOrganizer') || hasOppSafe(s, 'bacchusPatron'))) return null;
      if (committedSpies(s, h) <= 1) return null;
      return decide(s, 'holyShrine', 'Sacred ruins near Ariminium',
        'Your spies report sacred ruins in the hills near Ariminium, a shrine to the whole Pantheon and above all to Janus, god of doors and of time. ' +
        `The land is for sale for ${dn(1000)}. They whisper that time passes differently there.`,
        [
          { id: 'buy', label: 'Buy the land', cost: 1000, desc: 'Founds the Ariminium camp, where the Pantheum Shrine can be built. One keeper moves there.' },
          { id: 'refuse', label: 'I have my hands full here in Capua!' },
        ], {}, 'shrine');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'buy') return { text: 'The ruins stay in the hills, waiting.' };
      payOption(s, d, o);
      me(s).buildings.ariminiumCamp = Math.max(1, me(s).buildings.ariminiumCamp);
      lose(s, 1);
      return { text: 'The land near Ariminium is yours. A keeper packs his things and moves out to the camp to clear the ruins.' };
    },
  },

  // -------------------------------------------------------------------- A chance for fame (Beast Master)
  {
    key: 'beastMaster',
    make(s) {
      const beast = bestOf(fitOf(me(s), (c) => c.kind === 'beast'));
      if (!beast) return null;
      const species: BeastSpeciesId = pick(['direbear', 'sabertooth', 'gigantopithecus'] as BeastSpeciesId[]);
      return decide(s, 'beastMaster', 'A chance for fame',
        `A boastful Beast Master is touring Capua with his prized ${SPECIES[species].name}, claiming no ludus owns a beast that can stand against it. ` +
        `He will pay ${dn(300)} to anyone who proves him wrong.`,
        [
          { id: 'fight', label: `Send ${cname(beast)} into the ring`, desc: 'Win: +300 denarii and influence.' },
          { id: 'ignore', label: 'Ignore him' },
        ], { cid: beast.id, species });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'fight') return { text: 'The Beast Master goes on boasting.' };
      const beast = fitMine(s, d.data.cid) ?? bestOf(fitOf(me(s), (c) => c.kind === 'beast'));
      if (!beast) return { text: 'None of your beasts is fit to fight.' };
      const foe = beastFoe(s, d.data.species, `The Beast Master's ${SPECIES[d.data.species as BeastSpeciesId].name}`, { mult: 1.1, variant: 'strong' });
      const f = streetFight(s, { title: 'A chance for fame', fighters: [beast], foes: [foe], foeName: 'the Beast Master' });
      if (f.won) earn(s, 300);
      return { text: f.won ? `${cname(beast)} sends the Beast Master's pride limping out of the ring. +${dn(300)}. ${f.text}` : `The Beast Master's beast was everything he claimed. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Cestus duel (Theagenes, Myrmex)
  {
    key: 'cestusDuel',
    make(s) {
      if (s.world.flags.cestusDuel) return null;
      const mel = me(s).creatures.some((c) => c.legend === 'melankomas') || !!s.world.flags.melankomas;
      if (!mel || wk(s) < 20) return null;
      const champ = champion(s);
      if (!champ) return null;
      const second = champion(s, [champ.id]);
      return decide(s, 'cestusDuel', 'Cestus duel!',
        'Theagenes of Thasos, Olympic champion of the primal bout, has heard that Melankomas now lives in your ludus. ' +
        'He challenges your best to a duel in iron jaws. He has a habit of killing his opponents.',
        [
          { id: 'champ', label: `${cname(champ)} accepts`, desc: 'Win: the legendary iron jaws Myrmex.' },
          { id: 'second', label: second ? `${cname(second)} accepts` : 'Send your second best', need: req(!!second, 'You have no second fighter.') },
          { id: 'ignore', label: 'Ignore him', desc: '−5 influence.' },
        ], { champ: champ.id, second: second?.id });
    },
    resolve(s, d, o) {
      s.world.flags.cestusDuel = true;
      const id = optId(d, o);
      if (id === 'ignore') {
        const got = infl(s, -5);
        return { text: `Theagenes tells the taverns that your ludus is full of cowards (${got} influence).` };
      }
      const c = id === 'second' ? stillOrChampion(s, d.data.second) : stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody was fit to face Theagenes. He laughs and leaves.' };
      const foe = dinoFoe(s, 'pachycephalosaurus', 'Theagenes', {
        mult: 1.25, cls: 'brawler', traits: ['Killer', 'Pugilist'], techs: [['Uppercut', 2], ['Headbutt', 2]], gear: [L('ironJaws', 4)],
      });
      const f = streetFight(s, { title: 'Cestus duel', fighters: [c], foes: [foe], foeName: 'Theagenes', foeInstruction: 'kill' });
      if (f.won) {
        giveUnique(s, 'myrmex');
        s.world.flags.myrmexDone = true;
        return { text: `${cname(c)} breaks Theagenes' jaw. Melankomas laughs for the first time in years. The iron jaws Myrmex are yours. ${f.text}`, battle: f.battle };
      }
      return { text: `"You fool! You thought to defeat me at my own sport?" ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Wild beast offer
  {
    key: 'wildBeastOffer',
    make(s) {
      const w = wk(s);
      if (w < 10 || w % 2 === 0 || me(s).denarii < 100) return null;
      return decide(s, 'wildBeastOffer', 'Wild beast offer',
        'A hunter just back from the frontier has cages on his cart and no wish to feed what is in them. Some of the beasts may have been knocked about on the road.',
        [
          { id: 'sabertooth', label: `Sabertooth (${dn(100)})`, cost: 100 },
          { id: 'woollyrhino', label: `Woolly Rhino (${dn(200)})`, cost: 200, need: req(hasUpgrade(s, 'woollyRhinos'), 'Requires the Woolly Rhinos upgrade.') },
          { id: 'mammoth', label: `Mammoth (${dn(300)})`, cost: 300, need: req(hasUpgrade(s, 'warMammoths'), 'Requires the War Mammoths upgrade.') },
          { id: 'refuse', label: "I'm running a ludus here, not a zoo!" },
        ], {}, 'hunter');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'The hunter drives his cages on to the next ludus.' };
      payOption(s, d, o);
      const b = generateBeast(id as BeastSpeciesId, { variant: 'random' });
      const hurt = chance(1 / 3);
      if (hurt) injure(b, range(1, 3));
      me(s).creatures.push(b);
      return { text: `${full(b)} joins your ludus${hurt ? ', a little worse for the journey' : ''}.` };
    },
  },

  // -------------------------------------------------------------------- Plebe in debt (tutorial −1)
  {
    key: 'plebeInDebt', tutorial: -1,
    make(s) {
      return decide(s, 'plebeInDebt', 'Plebe in debt',
        `A plebe throws himself at your feet. He owes ${dn(50)} to a moneylender who has promised to feed him to his dogs. ` +
        'He offers to work your pens for life, or to hand over his scrawny dino.',
        [
          { id: 'keeper', label: `Pay his debt; he becomes a keeper (${dn(50)})`, cost: 50 },
          { id: 'dino', label: `Pay his debt; take his dino (${dn(50)})`, cost: 50 },
          { id: 'refuse', label: 'Pay your own debts, cur!' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'He is dragged off by the moneylender\'s men. The dogs will eat well tonight.' };
      payOption(s, d, o);
      if (id === 'keeper') {
        addKeepers(me(s), 1);
        return { text: 'The plebe kisses your sandals and goes to muck out the pens. +1 keeper.' };
      }
      const c = generateDino({ tier: 'cheap', week: wk(s), level: 1 });
      me(s).creatures.push(c);
      return { text: `The plebe hands over the leash of ${full(c)}, weeping. It bites him on the way out.` };
    },
  },

  // -------------------------------------------------------------------- Orphanage closing (young keepers / meanest hatchling)
  {
    key: 'orphanage', tutorial: 0,
    make(s) {
      if (me(s).denarii <= 100 || (wk(s) < 2 && !tutorial(s)) || hasDelayed(s, 'orphanage')) return null;
      return decide(s, 'orphanage', 'The orphanage closes its doors',
        'Capua\'s orphanage is closing and selling what it cannot feed: a dozen hungry urchins and, in the back yard, a nest of abandoned hatchlings ' +
        'that nobody dares go near. One of them has already eaten a goose.',
        [
          { id: 'keepers', label: `Buy three young keepers (${dn(100)})`, cost: 100, desc: '−5 influence. They join the mines when they are old enough, in 8 weeks.' },
          { id: 'hatchling', label: `Buy the meanest hatchling (${dn(100)})`, cost: 100 },
          { id: 'refuse', label: 'Refuse' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'You leave the orphans to the gods.' };
      payOption(s, d, o);
      if (id === 'keepers') {
        infl(s, -5);
        schedule(s, 'orphanage', 8, { n: 3 });
        return { text: 'Three skinny children follow you home. In eight weeks they will be fit for the mines. Some call it charity; others do not (−5 influence).' };
      }
      const c = generateDino({ tier: 'cheap', week: wk(s), eqAge: 8 + rand(5) });
      addTrait(c, 'Fury');
      c.loyalty = 65;
      me(s).creatures.push(c);
      return { text: `${full(c)} is still young, already furious and missing nothing but manners. It joins your ludus.` };
    },
  },

  // -------------------------------------------------------------------- Accusation against a dino
  {
    key: 'accusation',
    make(s) {
      if (wk(s) < 5) return null;
      const pool = dinosOf(s);
      if (!pool.length) return null;
      const c = pick(pool);
      const fee = minerva(s) ? 150 : 75;
      return decide(s, 'accusation', `Accusation against ${cname(c)}`,
        `A citizen claims that ${full(c)} broke loose during a walk and mauled him in the market. He has the bite marks, a good advocate and a lot of friends.`,
        [
          { id: 'justice', label: 'Let justice run its course', desc: 'The court may execute it, have it lashed, or acquit it.' },
          { id: 'advocate', label: `Hire an advocate (${dn(fee)})`, cost: fee, desc: 'Acquitted.' },
          { id: 'senate', label: 'Use your Senate connections', need: req(senateInfluence(s), 'Requires influence in the Senate.'), desc: 'Acquitted.' },
          { id: 'croc', label: 'Invite the accuser to see the Sarcosuchus', need: req(hasCroc(s), 'You need a Sarcosuchus.'), desc: 'No accuser, no case. −5 influence.' },
        ], { cid: c.id });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The accused is no longer yours; the case is dropped.' };
      switch (optId(d, o)) {
        case 'justice': {
          const r = rand(10);
          if (r < 2) {
            killMine(s, c, 'Executed after a trial for mauling a citizen');
            return { text: `The court finds ${cname(c)} guilty. It is executed in the forum, to great applause.` };
          }
          if (r < 6) {
            injure(c, 3);
            tame(c, -10);
            return { text: `${cname(c)} is sentenced to forty lashes, laid on by a magistrate's slave with obvious pleasure. −10 tameness.` };
          }
          return { text: `${cname(c)} is acquitted. The magistrate rules the citizen should not have offered it a carrot.` };
        }
        case 'advocate':
          payOption(s, d, o);
          return { text: `Your advocate talks for three hours. ${cname(c)} is acquitted, mostly to make him stop.` };
        case 'senate':
          return { text: 'A word in the right ear. The case is dismissed before it begins.' };
        default:
          feedCrocs(s);
          infl(s, -5);
          return { text: 'The accuser accepted your invitation to see the Sarcosuchus up close. Very close. The case is dropped, and so was he. −5 influence (people talk).' };
      }
    },
  },

  // -------------------------------------------------------------------- Specialised training (Senate influence)
  {
    key: 'specialisedTraining',
    make(s) {
      if (!senateInfluence(s)) return null;
      const hopliteOk = (c: Creature) => hasUpgrade(s, 'spartanDynasty') && c.cls === 'phalanx' && c.prof.horn >= 800 && !hasTrait(c, 'Hoplite');
      const pool = fitDinos(s).filter((c) => hopliteOk(c) || !hasTrait(c, 'ExoticFightingStyle'));
      const c = rank(pool)[0];
      if (!c) return null;
      const trait: TraitId = hopliteOk(c) ? 'Hoplite' : 'ExoticFightingStyle';
      return decide(s, 'specialisedTraining', 'Specialised training',
        `A senator friend can get ${full(c)} four weeks with the legion's own beast-masters. They teach things the arenas of Capua have never seen.`,
        [
          { id: 'send', label: `Send ${cname(c)} for 4 weeks`, desc: `It returns with ${traitName(trait)}.` },
          { id: 'refuse', label: 'Not now' },
        ], { cid: c.id, trait });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'send') return { text: 'Perhaps another time.' };
      const c = fitMine(s, d.data.cid);
      if (!c) return { text: 'The dino is no longer fit to travel.' };
      sendOnAdventure(s, 'specialTraining', [c.id], 4, { trait: d.data.trait }, 'Specialised training');
      return { text: `${cname(c)} leaves with the legion's beast-masters for four weeks.` };
    },
  },

  // -------------------------------------------------------------------- Marksman training (Cretan trader)
  {
    key: 'marksmanTraining',
    make(s) {
      if (!hasUpgrade(s, 'spitters') || wk(s) < 8 || me(s).denarii < 100) return null;
      const pool = fitDinos(s).filter((c) => !hasTrait(c, 'Marksman'));
      const c = pool.find((x) => x.cls === 'spitter') ?? rank(pool)[0];
      if (!c) return null;
      return decide(s, 'marksmanTraining', 'Marksman training',
        `A Cretan trader says the spitter masters of Crete can teach ${full(c)} to put venom in a crow's eye at forty paces. Four weeks, ${dn(100)}, and he throws in an old Venom Spitter.`,
        [
          { id: 'send', label: `Send ${cname(c)} to Crete (${dn(100)})`, cost: 100, desc: 'Marksman trait and an old Venom Spitter.' },
          { id: 'refuse', label: 'Refuse' },
        ], { cid: c.id });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'send') return { text: 'The Cretan sails without you.' };
      const c = fitMine(s, d.data.cid);
      if (!c) return { text: 'The dino is no longer fit to travel.' };
      payOption(s, d, o);
      sendOnAdventure(s, 'marksmanTraining', [c.id], 4, {}, 'Marksman training on Crete');
      return { text: `${cname(c)} boards a ship for Crete, and is sick over the side.` };
    },
  },

  // -------------------------------------------------------------------- Mine collapsed! (tutorial 0)
  {
    key: 'mineCollapse', tutorial: 0,
    make(s) {
      const m = me(s).keepers.miners;
      if (m < 2) return null;
      if (!tutorial(s) && wk(s) < (asc(s, ASC.vulcan) ? 6 : 15)) return null;
      let cost = 50 * m - 50;
      if (cost > 200) cost = Math.floor(cost / 2);
      cost = Math.min(300, cost);
      return decide(s, 'mineCollapse', 'Mine collapsed!',
        `A tunnel has caved in with ${pl(m, 'miner')} somewhere beneath it. Digging them out will cost ${dn(cost)} in timber and hired hands.`,
        [
          { id: 'rescue', label: `Dig them out (${dn(cost)})`, cost },
          { id: 'abandon', label: 'Abandon them', desc: 'Lose 1–5 miners.' },
          { id: 'consul', label: 'As Consul, have the state dig them out', need: req(isConsul(s), 'Only a Consul can do this.'), desc: '−10 influence.' },
        ], { cost });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'rescue') {
        payOption(s, d, o);
        return { text: 'Your miners crawl out coughing and blinking. Every one of them alive.' };
      }
      if (id === 'consul') {
        const got = infl(s, -10);
        return { text: `The legion digs your miners out. The Senate grumbles about consuls who use soldiers as shovels (${got} influence).` };
      }
      const n = Math.min(me(s).keepers.miners, range(1, 5));
      lose(s, n, 'miners');
      return { text: `You seal the tunnel. ${pl(n, 'miner')} will not be coming back up.` };
    },
  },

  // -------------------------------------------------------------------- Public challenge
  {
    key: 'publicChallenge',
    make(s) {
      if (wk(s) < 2) return null;
      const champ = champion(s);
      if (!champ) return null;
      const r = someRival(s, (x) => fitOf(x).length > 0);
      if (!r) return null;
      const foe = bestOf(fitOf(r));
      if (!foe) return null;
      return decide(s, 'publicChallenge', `Public challenge to ${cname(champ)}!`,
        `In the forum, ${r.name} calls your ludus a henhouse and ${cname(champ)} a coward. His ${full(foe)} will fight yours in the street, tonight, ` +
        'in front of everyone. The influence of both houses is at stake.',
        [
          { id: 'fight', label: 'Accept the challenge', desc: 'Stake: 10 influence.' },
          { id: 'death', label: 'Accept, to the death', desc: 'Stake: 20 influence. Someone will die.' },
          { id: 'refuse', label: 'We are Romans, not barbarians!', desc: '−10 influence.' },
        ], { champ: champ.id, rival: r.id, foe: foe.id });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') {
        const got = infl(s, -10);
        return { text: `The forum laughs at you (${got} influence).` };
      }
      const r = s.rivals.find((x) => x.id === d.data.rival && !x.defeated);
      const foe = r?.creatures.find((c) => c.id === d.data.foe && fit(c)) ?? (r ? bestOf(fitOf(r)) : undefined);
      const champ = stillOrChampion(s, d.data.champ);
      if (!r || !foe) return { text: 'The challenger has thought better of it and is nowhere to be found.' };
      if (!champ) return { text: 'Nobody in your ludus is fit to fight. The challenge lapses, and so does your reputation.' };
      const death = id === 'death';
      const f = streetFight(s, {
        title: 'Public challenge', fighters: [champ], foes: [foe], foeHouse: r, foeName: r.name, rival: r, toTheDeath: death,
        foeInstruction: death ? 'kill' : undefined, deathCause: `Killed in a street challenge against ${r.name}`,
      });
      return { text: `${cname(champ)} against ${cname(foe)}${death ? ', to the death' : ''}. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Jousting challenge (Lugh)
  {
    key: 'jousting',
    make(s) {
      if (s.world.flags.lughDone || !hasUpgrade(s, 'celticRiders') || me(s).buildings.saddlery < 1 || wk(s) < 30) return null;
      const champ = champion(s);
      if (!champ) return null;
      return decide(s, 'jousting', 'Jousting challenge',
        'Lugh of Hibernia, a Celtic hero who rides as if he were born in the saddle, challenges your champion to a mounted duel. ' +
        'He rides the great three-horn Enbarr. If you win, Lugh swears to ride for your ludus.',
        [
          { id: 'joust', label: `${cname(champ)} accepts the joust`, desc: 'Win: the legendary rider Lugh of Hibernia.' },
          { id: 'pay', label: `Pay Lugh to teach ${cname(champ)} (${dn(300)})`, cost: 300, desc: "Rider's Bond trait. The pack resents the attention (−10 tameness)." },
          { id: 'decline', label: 'Decline', desc: '−5 influence.' },
        ], { champ: champ.id });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const champ = stillOrChampion(s, d.data.champ);
      if (id === 'decline') {
        const got = infl(s, -5);
        return { text: `Lugh rides on, singing a song about your cowardice (${got} influence).` };
      }
      if (!champ) return { text: 'Nobody is fit for the saddle. Lugh rides on.' };
      if (id === 'pay') {
        payOption(s, d, o);
        addTrait(champ, 'MasterHorseman');
        tameAll(s, -10, champ.id);
        return { text: `For a week Lugh rides ${cname(champ)} up and down the training field. It gains Rider's Bond; the others sulk (−10 tameness).` };
      }
      const foe = dinoFoe(s, 'triceratops', 'Lugh of Hibernia on Enbarr', {
        mult: 1.3, traits: ['MasterHorseman', 'Hero'], gear: [{ slot: 'rider', type: 'celticSpearman', quality: 5, unique: 'lugh' }, L('bronzeHorn', 3), L('bronzeBarding', 3)],
      });
      const f = streetFight(s, { title: 'Jousting challenge', fighters: [champ], foes: [foe], foeName: 'Lugh of Hibernia' });
      if (f.won) {
        giveUnique(s, 'lugh');
        s.world.flags.lughDone = true;
        return { text: `Lugh is unhorsed, laughs, and keeps his word: Lugh of Hibernia now rides for your ludus. ${f.text}`, battle: f.battle };
      }
      return { text: `Lugh tips an imaginary helmet and rides away. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Baseless accusations!
  {
    key: 'baselessAccusations',
    make(s) {
      if (!(s.player.senator || minerva(s)) || wk(s) < 10 || hasDelayed(s, 'courtCase')) return null;
      return decide(s, 'baselessAccusations', 'Baseless accusations!',
        'An advocate in the pay of your enemies sues you for embezzlement of public games money. It is entirely untrue, and it could take months.',
        [
          { id: 'court', label: 'Fight it in court', desc: '+5 influence; −50 denarii every week for 12 weeks, then acquittal.' },
          { id: 'pay', label: `Settle (${dn(500)})`, cost: 500, desc: '−5 influence.' },
          { id: 'silence', label: 'Silence the advocate', desc: 'Your champion against his City Guard. A loss costs 500 denarii and 100 influence.' },
        ], { champ: champion(s)?.id });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'court') {
        infl(s, 5);
        me(s).projected -= 50;
        schedule(s, 'courtCase', 12, { amount: 50 });
        return { text: 'You will see him in court. The legal fees will run for twelve weeks (−50 a week). +5 influence for standing firm.' };
      }
      if (id === 'pay') {
        payOption(s, d, o);
        infl(s, -5);
        return { text: 'The suit is withdrawn. Everybody assumes you were guilty (−5 influence).' };
      }
      const champ = stillOrChampion(s, d.data.champ);
      if (!champ) return { text: 'Nobody is fit for the job. You will have to see him in court after all.' };
      const foe = dinoFoe(s, 'iguanodon', 'City Guard', { mult: 1.1, cls: 'bulwark', gear: [L('talonBlades', 2), L('frillGuard', 2), L('legionBarding', 2)] });
      const f = streetFight(s, { title: 'Silencing the advocate', fighters: [champ], foes: [foe], foeName: "the advocate's City Guard", lossInfluence: -100 });
      if (!f.won) {
        spend(s, 500);
        return { text: `The City Guard caught ${cname(champ)} at the advocate's door. The fine is ${dn(500)} and Capua is appalled. ${f.text}`, battle: f.battle };
      }
      return { text: `The advocate has decided to retire to Sicily. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Clutch-mates found (GM family found)
  {
    key: 'clutchMates',
    make(s) {
      const pool = dinosOf(s).filter((c) => !hasTrait(c, 'ReunitedWithFamily') && !hasTrait(c, 'LostFamily'));
      if (!pool.length) return null;
      const c = pick(pool);
      return decide(s, 'clutchMates', 'Clutch-mates found',
        `A trader from Sicily swears he has two clutch-mates of ${full(c)}, hatched in the same nest, and the herders who raised them. ` +
        `For ${dn(300)} he will bring them all to Capua.`,
        [
          { id: 'buy', label: `Buy them (${dn(300)})`, cost: 300, desc: `${cname(c)} is Reunited. The two herders stay on as keepers.` },
          { id: 'accident', label: `Arrange for an accident (${dn(100)})`, cost: 100, desc: `${cname(c)} gains Lost Clutch.` },
          { id: 'refuse', label: 'Refuse' },
        ], { cid: c.id });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      const id = optId(d, o);
      if (id === 'refuse' || !c) return { text: 'The trader sails back to Sicily.' };
      payOption(s, d, o);
      if (id === 'buy') {
        addTrait(c, 'ReunitedWithFamily');
        addKeepers(me(s), 2);
        return { text: `${cname(c)} recognises its clutch-mates at once and will not stop chirping. Their two herders stay on as keepers.` };
      }
      addTrait(c, 'LostFamily');
      return { text: `The clutch-mates had an accident on the road and made a fine omelette for the trader's crew. ${cname(c)} senses something and grows cold. Now you have its undivided attention.` };
    },
  },

  // -------------------------------------------------------------------- A rival's weaponsmith
  {
    key: 'rivalWeaponsmith',
    make(s) {
      if (me(s).keepers.wardens < 4 || wk(s) < 15) return null;
      const r = someRival(s);
      const champ = champion(s);
      if (!r || !champ) return null;
      const type = weaponFor(s, bestFamily(champ));
      const q = smithQuality(wk(s));
      return decide(s, 'rivalWeaponsmith', "A rival's weaponsmith",
        `Your wardens caught a weaponsmith of ${r.name} climbing over your palisade, drunk and lost. He is very sorry and very good at his trade.`,
        [
          { id: 'demand', label: `Make him forge for ${cname(champ)}`, desc: `A ${gearName({ id: '', type, quality: q })}. +5 influence; ${r.name} is furious.` },
          { id: 'mines', label: 'Send him to the mines', desc: '+1 miner, +100 denarii. He may be missed.' },
          { id: 'return', label: 'Return him', desc: `+10 influence; ${r.name} is grateful.` },
        ], { rival: r.id, type, q, champ: champ.id });
    },
    resolve(s, d, o) {
      const r = s.rivals.find((x) => x.id === d.data.rival);
      const id = optId(d, o);
      if (id === 'demand') {
        const g = giveGear(s, d.data.type, d.data.q);
        infl(s, 5);
        if (r) changeOpinion(s, r, -10);
        return { text: `After three days at your forge he hands over a ${gearName(g)} and is thrown back over the wall. +5 influence.` };
      }
      if (id === 'mines') {
        addKeepers(me(s), 1, 'miners');
        earn(s, 100);
        if (r) changeOpinion(s, r, -5);
        if (chance(1 / 3)) {
          if (r) changeOpinion(s, r, -15);
          infl(s, -5);
          return { text: `He sells his tools for ${dn(100)} and joins your miners. Then ${r?.name ?? 'his master'} found out. −5 influence.` };
        }
        return { text: `He sells his tools for ${dn(100)} and joins your miners. Nobody asks after him.` };
      }
      infl(s, 10);
      if (r) changeOpinion(s, r, 10);
      return { text: `You send him home with a headache and a note. ${r?.name ?? 'His master'} appreciates the courtesy. +10 influence.` };
    },
  },

  // -------------------------------------------------------------------- Armory sabotage!
  {
    key: 'armorySabotage',
    make(s) {
      if (wk(s) < 20) return null;
      if (!((s.world.difficulty.hard && chance(0.5)) || asc(s, ASC.vulcan))) return null;
      const g = bestWeapon(me(s));
      if (!g) return null;
      const w = gearWorth(g);
      const rivalBest = Math.max(0, ...activeRivals(s).map((r) => Math.max(0, ...r.armory.filter((x) => GEAR[x.type].slot === 'weapon').map(gearWorth))));
      if (w <= rivalBest) return null;
      const forge = me(s).buildings.forge;
      const inHouse = Math.floor(w / 2 / (forge + 1));
      const smith = Math.floor(w / 2);
      const scrap = wk(s) > 25 ? 200 : 100;
      return decide(s, 'armorySabotage', 'Armory sabotage!',
        `Someone broke into your armory and took a hammer to your ${gearName(g)}, the finest weapon in Capua. It is ruined unless it is reforged.`,
        [
          { id: 'forge', label: `Reforge it in-house (${dn(inHouse)})`, cost: inHouse, need: req(forge > 0, 'You need a Forge.') },
          { id: 'scrap', label: `Scrap it (+${dn(scrap)})`, cost: -scrap },
          { id: 'smith', label: `Pay the finest smith in Capua (${dn(smith)})`, cost: smith },
        ], { gid: g.id, aug: g.augment ?? null, name: gearName(g) });
    },
    onDraw(s, d) {
      const g = me(s).armory.find((x) => x.id === d.data.gid);
      if (g) g.augment = g.augment === 'TimeWarped' ? 'BrokenTimeWarp' : 'Broken';
    },
    resolve(s, d, o) {
      const h = me(s);
      const g = h.armory.find((x) => x.id === d.data.gid);
      if (!g) return { text: 'The broken weapon is gone.' };
      const id = optId(d, o);
      payOption(s, d, o);
      if (id === 'scrap') {
        const w = wearer(h, g.id);
        if (w) for (const k of Object.keys(w.gear) as (keyof typeof w.gear)[]) if (w.gear[k] === g.id) delete w.gear[k];
        h.armory = h.armory.filter((x) => x.id !== g.id);
        return { text: `The pieces of the ${d.data.name} go to a scrap dealer for ${dn(-(d.data.costs?.[o] ?? 0))}.` };
      }
      g.augment = d.data.aug ?? undefined;
      if (!g.augment) delete g.augment;
      return { text: `The ${d.data.name} is good as new.${id === 'smith' ? ' The smith of Capua charged like a senator.' : ''}` };
    },
  },

  // -------------------------------------------------------------------- Uncovered mineral vein (tutorial 0)
  {
    key: 'mineralVein', tutorial: 0,
    make(s) {
      if (me(s).keepers.miners < 1) return null;
      if (!tutorial(s) && !s.world.difficulty.nightmare && !chance(0.5)) return null;
      return decide(s, 'mineralVein', 'Uncovered a mineral vein',
        'Your miners have broken into a rich new vein. A dealer offers 200 denarii for the rights; or you could shore up the tunnel and work it yourself.',
        [
          { id: 'sell', label: 'Sell the rights (+200 denarii)', cost: -200 },
          { id: 'exploit', label: `Exploit it (${dn(100)})`, cost: 100, desc: 'Permanent +10% mining income.' },
        ]);
    },
    resolve(s, d, o) {
      payOption(s, d, o);
      if (optId(d, o) === 'sell') return { text: `The dealer pays ${dn(200)} and sends his own men down the hole.` };
      mining(s, 1);
      return { text: 'The new vein is shored up. Your mines will yield more from now on.' };
    },
  },

  // -------------------------------------------------------------------- Fires raging in the city
  {
    key: 'cityFires',
    make(s) {
      if (keepers(me(s)) < 1) return null;
      return decide(s, 'cityFires', 'Fires raging in the city',
        'A fire is eating its way through the poor quarter of Capua. The vigiles are short of hands, as always.',
        [
          { id: 'senate', label: 'Use your Senate connections to send help', need: req(senateInfluence(s), 'Requires influence in the Senate.'), desc: '+10 influence.' },
          { id: 'pay', label: `Pay for buckets and hands (${dn(50)})`, cost: 50, desc: '+5 influence.' },
          { id: 'ignore', label: 'Not my quarter, not my problem', desc: '−5 influence.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'senate') return { text: `Your friends in the Senate send the vigiles where you point. Capua thanks you: +${infl(s, 10)} influence.` };
      if (id === 'pay') {
        payOption(s, d, o);
        return { text: `Your keepers pass buckets all night. +${infl(s, 5)} influence.` };
      }
      return { text: `The poor quarter burns, and the poor remember (${infl(s, -5)} influence).` };
    },
  },

  // -------------------------------------------------------------------- Criminal activity
  {
    key: 'criminalActivity',
    make(s) {
      if (wk(s) < 4) return null;
      const champ = champion(s);
      if (!champ) return null;
      return decide(s, 'criminalActivity', 'Criminal activity',
        'A friend\'s villa was robbed by a brigand who rides an Allosaurus. He asks whether your champion could find the man and bring back his silver.',
        [
          { id: 'send', label: `Send ${cname(champ)} (3 weeks)`, desc: 'Fight a brigand: 200 denarii, 10 influence, Enforcer.' },
          { id: 'refuse', label: 'Refuse', desc: '−5 influence.' },
        ], { champ: champ.id });
    },
    resolve(s, d, o) {
      if (optId(d, o) === 'refuse') return { text: `Your friend is disappointed (${infl(s, -5)} influence).` };
      const c = stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody is fit to go. Your friend will have to hire someone else.' };
      sendOnAdventure(s, 'criminal', [c.id], 3);
      return { text: `${cname(c)} sets off after the brigand.` };
    },
  },

  // -------------------------------------------------------------------- Scouted a dino (after the pits)
  {
    key: 'scoutedDino',
    make(s) {
      if (!scoutedPits(s)) return null;
      const c = generateDino({ week: wk(s), level: Math.max(1, Math.round(foeLevel(s) * 0.8)) });
      c.price = 150;
      return decide(s, 'scoutedDino', 'Scouted a dino',
        `At the underground pits your keepers noticed a scarred ${sname(c)} called ${c.name}, fighting for scraps. Its owner would part with it for ${dn(150)}.`,
        [
          { id: 'buy', label: `Recruit ${c.name} (${dn(150)})`, cost: 150 },
          { id: 'pass', label: 'Pass' },
        ], { creature: c });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'buy') return { text: 'Someone else will buy it, or it will die in the pits.' };
      payOption(s, d, o);
      const c = d.data.creature as Creature;
      c.price = undefined;
      c.loyalty = Math.max(c.loyalty, 80);
      me(s).creatures.push(c);
      return { text: `${full(c)} joins your ludus.` };
    },
  },

  // -------------------------------------------------------------------- Active spy (Venus)
  {
    key: 'activeSpy',
    make(s) {
      if (!asc(s, ASC.venus) || me(s).keepers.showmen < 3) return null;
      return decide(s, 'activeSpy', 'An active spy',
        'One of your showmen is selling your secrets to the rivals between performances. Nobody knows which one.',
        [
          { id: 'hunt', label: 'Organise a manhunt', desc: 'Lose 1–2 keepers in the process.' },
          { id: 'hush', label: 'Hush it up', desc: 'Lose face, or risk the spy lashing out.' },
        ], { champ: champion(s)?.id });
    },
    resolve(s, d, o) {
      if (optId(d, o) === 'hunt') {
        const n = lose(s, range(1, 2));
        return { text: `The manhunt finds the spy, and ${n > 1 ? 'an innocent juggler with him' : 'he is dealt with'}. ${pl(n, 'keeper')} lost.` };
      }
      if (coin()) return { text: `Word gets out anyway (${infl(s, -5)} influence).` };
      const champ = stillOrChampion(s, d.data.champ);
      if (champ) {
        injure(champ, range(2, 4));
        return { text: `Before slipping away, the spy put a knife into ${cname(champ)}'s flank.` };
      }
      return { text: 'The spy slips away in the night.' };
    },
  },

  // -------------------------------------------------------------------- Sensitive information (tutorial 0)
  {
    key: 'sensitiveInfo', tutorial: 0,
    make(s) {
      if (me(s).keepers.showmen < 1) return null;
      const can = me(s).buildings.romeMansion > 0 || senateInfluence(s);
      return decide(s, 'sensitiveInfo', 'Sensitive information',
        'While performing at a banquet, one of your showmen overheard a magistrate boasting about bribes. The showman wants to know what to do with it.',
        [
          { id: 'leak', label: 'Leak it through your mansion or the Senate', need: req(can, 'Requires a Rome mansion or influence in the Senate.'), desc: '+10 influence.' },
          { id: 'refuse', label: 'Forget you ever heard it', desc: '+5 influence for discretion.' },
          { id: 'blackmail', label: 'Blackmail the magistrate', cost: -150, desc: '+150 denarii.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'leak') return { text: `The magistrate is ruined, and everyone knows who to thank: +${infl(s, 10)} influence.` };
      if (id === 'refuse') return { text: `Discretion is noticed in the right circles. +${infl(s, 5)} influence.` };
      payOption(s, d, o);
      return { text: `The magistrate pays ${dn(150)} and smiles like a man planning a funeral.` };
    },
  },

  // -------------------------------------------------------------------- Patrician request (ShowMan)
  {
    key: 'patricianRequest',
    make(s) {
      const c = rank(fitDinos(s).filter((x) => x.career.tournamentWins > 0 && !hasTrait(x, 'ShowMan')))[0];
      if (!c) return null;
      return decide(s, 'patricianRequest', 'Patrician request',
        `A patrician wants ${full(c)} for two weeks of private exhibition bouts at his villa, with a wild beast for the finale. He pays well, and he talks a lot.`,
        [
          { id: 'accept', label: `Send ${cname(c)} (2 weeks)`, desc: '200 denarii, 10 influence, Showman.' },
          { id: 'refuse', label: 'Refuse', desc: '−5 influence.' },
        ], { cid: c.id });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'accept') return { text: `The patrician takes offence (${infl(s, -5)} influence).` };
      const c = fitMine(s, d.data.cid);
      if (!c) return { text: 'The dino is no longer fit to perform.' };
      sendOnAdventure(s, 'patrician', [c.id], 2);
      return { text: `${cname(c)} leaves for the villa, groomed and oiled.` };
    },
  },

  // -------------------------------------------------------------------- Setting a trap (OneManArmy)
  {
    key: 'settingTrap',
    make(s) {
      if (wk(s) < 14) return null;
      const champ = champion(s);
      if (!champ) return null;
      return decide(s, 'settingTrap', 'Setting a trap',
        'Bandits keep robbing the caravans on the Via Appia. The merchants of Capua propose a trap: a fat-looking cart, and your champion hidden under the hay.',
        [
          { id: 'accept', label: `Hide ${cname(champ)} in the cart (2 weeks)`, desc: 'Fight a bandit and a highwayman: 200 denarii, 20 influence, One-Dino Army.' },
          { id: 'refuse', label: 'Refuse' },
        ], { champ: champ.id });
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'accept') return { text: 'The merchants find another fool.' };
      const c = stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody fit to hide in the hay.' };
      sendOnAdventure(s, 'trap', [c.id], 2);
      return { text: `${cname(c)} is buried in hay and driven off down the Via Appia. It does not like hay.` };
    },
  },

  // -------------------------------------------------------------------- Fool's gold (ascension ≥ 1)
  {
    key: 'foolsGold',
    make(s) {
      if (!asc(s, ASC.saturn) || me(s).keepers.miners < 1) return null;
      return decide(s, 'foolsGold', "Fool's gold",
        'Your miners struck gold! Then the assayer bit it. "Gods be damned.. This must be Saturn\'s doing.." The vein is pyrite, and the good rock around it is ruined.',
        [
          { id: 'sell', label: 'Sell it as gold anyway', cost: -100, desc: '+100 denarii, −15 influence, −10% mining.' },
          { id: 'dig', label: `Dig new tunnels (${dn(200)})`, cost: 200, desc: 'Mining unaffected.' },
          { id: 'best', label: 'Make the best of it', desc: '−10% mining.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      payOption(s, d, o);
      if (id === 'sell') {
        mining(s, -1);
        return { text: `A Greek buyer pays ${dn(100)}. By the time he bites it you have a reputation (${infl(s, -15)} influence). Mining yields less.` };
      }
      if (id === 'dig') return { text: 'New tunnels, old yields. The miners curse Saturn.' };
      // GM bug fixed: "make the best of it" no longer also costs 200 denarii
      mining(s, -1);
      return { text: 'You work what is left of the vein. Mining yields less from now on.' };
    },
  },

  // -------------------------------------------------------------------- Capua flooded! (Neptune)
  {
    key: 'capuaFlooded',
    make(s) {
      if (!asc(s, ASC.neptune) || wk(s) < 10 || constructionLevel(me(s)) < 5) return null;
      const wall = me(s).buildings.palisade;
      const bags = Math.max(0, 500 - 200 * wall);
      return decide(s, 'capuaFlooded', 'Capua flooded!',
        'The Volturnus has burst its banks and the water is rising in the streets. "Neptune does not favour us this day.."',
        [
          { id: 'relief', label: 'Demand Senate relief', need: req(princeps(s), 'Only the Princeps Senatus can.'), desc: 'Lose the palisade and a keeper; the Senate pays 1000 denarii and every ludus loses its palisade.' },
          { id: 'cattle', label: `Sacrifice cattle to Neptune (${dn(500)})`, cost: 500, desc: 'Lose the palisade only.' },
          { id: 'bags', label: `Sandbags (${dn(bags)})`, cost: bags, desc: 'Lose the palisade and 2 keepers.' },
          { id: 'hide', label: 'Tell the keepers to hide indoors', desc: 'Lose the palisade, a building, 200 denarii and 3 keepers; a dino may be hurt.' },
        ]);
    },
    resolve(s, d, o) {
      const h = me(s);
      const id = optId(d, o);
      const wallDown = (x: typeof h) => {
        if (x.buildings.palisade > 0) x.buildings.palisade--;
      };
      wallDown(h);
      payOption(s, d, o);
      if (id === 'relief') {
        lose(s, 1);
        earn(s, 1000); // GM bug fixed: the promised compensation is actually paid
        for (const r of activeRivals(s)) wallDown(r);
        return { text: `The Senate votes relief: ${dn(1000)} for your losses. The water still took your palisade and a keeper, and every other ludus lost its palisade too.` };
      }
      if (id === 'cattle') return { text: 'Neptune accepts the cattle and takes only your palisade.' };
      if (id === 'bags') {
        lose(s, 2);
        return { text: 'The sandbags held, mostly. The palisade and two keepers were swept away.' };
      }
      const b = loseRandomBuilding(h);
      spend(s, 200);
      lose(s, 3);
      const victim = h.creatures.length ? pick(h.creatures) : undefined;
      if (victim && coin()) injure(victim, 2);
      return { text: `The flood takes your palisade${b ? `, part of your ${words(b)}` : ''}, ${dn(200)} of stores and three keepers.${victim && victim.injury ? ` ${cname(victim)} was hurt by floating debris.` : ''}` };
    },
  },

  // -------------------------------------------------------------------- Extended drought (Neptune)
  {
    key: 'drought',
    make(s) {
      if (!asc(s, ASC.neptune) || wk(s) < 8 || keepers(me(s)) < 5) return null;
      return decide(s, 'drought', 'Extended drought',
        'The cisterns of Capua are running dry and the dinos are drinking more than the keepers. Nobody knows how long it will last.',
        [
          { id: 'pillage', label: "Pillage your rivals' water", desc: '+50 denarii, −1 keeper, −20 influence. Rivals are not amused.' },
          { id: 'aqueduct', label: 'Rely on your aqueduct', need: req(me(s).buildings.aqueduct > 0, 'You need an Aqueduct.'), desc: '+20 influence.' },
          { id: 'stock', label: `Buy water in stock (${dn(200)})`, cost: 200 },
          { id: 'hope', label: 'Pray for rain', desc: 'If the drought is long, keepers will die.' },
        ], { long: chance(0.5) });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const long: boolean = !!d.data.long;
      if (id === 'pillage') {
        lose(s, 1);
        earn(s, 50);
        infl(s, -20);
        for (const r of activeRivals(s)) {
          changeOpinion(s, r, -5);
          if (long) loseKeepers(s, r, range(2, 5));
        }
        return { text: `Your keepers raid the rivals' cisterns by night. One of them did not come back. +${dn(50)} in sold water, −20 influence.${long ? ' The drought dragged on; your rivals lost keepers to thirst.' : ''}` };
      }
      if (id === 'aqueduct') return { text: `Your aqueduct runs while the city's cisterns crack. You share the water: +${infl(s, 20)} influence.` };
      if (id === 'stock') {
        payOption(s, d, o);
        return { text: 'Amphorae of water are carted in. Expensive, but nobody dies.' };
      }
      if (!long) return { text: 'The rain came after a week. The gods were kind.' };
      const n = lose(s, range(1, 6));
      return { text: `The drought lasted for weeks. ${pl(n, 'keeper')} died of thirst.` };
    },
  },

  // -------------------------------------------------------------------- Old acquaintance (beggar)
  {
    key: 'oldAcquaintance',
    make(s) {
      const w = wk(s);
      if (w < 5 || w % 2 === 0) return null;
      return decide(s, 'oldAcquaintance', 'An old acquaintance appears',
        'A beggar at your gate claims to know you from your hometown, from before "the incident". He looks hungry. He looks at your silver even more.',
        [
          { id: 'feed', label: `Feed him (${dn(50)})`, cost: 50 },
          { id: 'host', label: `Take him in (${dn(75)})`, cost: 75, desc: '−5 influence. Who knows what he will do.' },
          { id: 'consul', label: 'As Consul, send him to the mines', need: req(isConsul(s), 'Only a Consul can do this.'), desc: '+1 miner.' },
          { id: 'away', label: 'Send him away' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'away') return { text: 'He spits on your gate and shuffles off.' };
      if (id === 'consul') {
        addKeepers(me(s), 1, 'miners');
        return { text: 'He is now an old acquaintance of your mines. +1 miner.' };
      }
      payOption(s, d, o);
      if (id === 'feed') {
        schedule(s, 'beggarFed', 2, {});
        return { text: 'He eats like a wolf and promises to repay you.' };
      }
      infl(s, -5);
      schedule(s, 'beggarHost', 3, {});
      return { text: 'He moves into the keepers\' quarters. The neighbours talk (−5 influence).' };
    },
  },

  // -------------------------------------------------------------------- Tax collector
  {
    key: 'taxCollector',
    make(s) {
      const lvl = constructionLevel(me(s));
      const sen = s.player.senator;
      if (lvl < (sen ? 6 : 4)) {
        const refund = (sen ? 700 : 400) - 50 * lvl;
        if (refund <= 0) return null;
        return decide(s, 'taxCollector', 'A visit from the tax collector',
          `"Taxes.. Is there anything more unjust?" For once the collector brings good news: your modest estate is owed a refund of ${dn(refund)}.`,
          [
            { id: 'take', label: `Take the refund (+${dn(refund)})`, cost: -refund },
            { id: 'donate', label: 'Donate it to the public games', desc: '+15 influence.' },
          ], { refund });
      }
      const tax = lvl * 100 - 300;
      const n = Math.max(1, Math.ceil(tax / 100));
      return decide(s, 'taxCollector', 'A visit from the tax collector',
        `"Taxes.. Is there anything more unjust?" The collector has counted every pen and forge on your estate: ${dn(tax)} is due.`,
        [
          { id: 'pay', label: `Pay (${dn(tax)})`, cost: tax },
          { id: 'keepers', label: `Pay him in keepers (${pl(n, 'keeper')})`, need: req(keepers(me(s)) >= n, `You need ${n} keepers.`), desc: '−5 influence.' },
          { id: 'grovel', label: 'Grovel', desc: '−50 influence.' },
          { id: 'consul', label: 'Remind him who the Consul is', need: req(isConsul(s), 'Only a Consul can do this.'), desc: '+5 influence.' },
        ], { tax, n });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      payOption(s, d, o);
      switch (id) {
        case 'take': return { text: `The collector counts out ${dn(d.data.refund)} as if it were his own blood.` };
        case 'donate': return { text: `Your refund pays for a day of games in your name. +${infl(s, 15)} influence.` };
        case 'pay': return { text: `The collector leaves ${dn(d.data.tax)} heavier.` };
        case 'keepers':
          lose(s, d.data.n);
          infl(s, -5);
          return { text: `The collector leads ${pl(d.data.n, 'keeper')} away in a chain. −5 influence.` };
        case 'grovel': return { text: `You grovel. He is moved, and so is your reputation (${infl(s, -50)} influence).` };
        default: return { text: `The collector suddenly finds an error in his sums. +${infl(s, 5)} influence.` };
      }
    },
  },

  // -------------------------------------------------------------------- Book sale (Bestiary Scroll)
  {
    key: 'bookSale',
    make(s) {
      const lib = me(s).buildings.library > 0;
      if (!lib && wk(s) < 50) return null;
      const price = s.world.difficulty.hard ? 500 : 300;
      const stock = range(100, 150);
      return decide(s, 'bookSale', 'Book sale',
        'A dead scholar\'s heirs are selling his library by the cartload, without reading any of it. Among the scrolls is a Bestiary Scroll on the habits of great beasts.',
        [
          { id: 'scroll', label: `Buy the Bestiary Scroll (${dn(price)})`, cost: price },
          { id: 'stock', label: `Stock your library (${dn(stock)})`, cost: stock, need: req(lib, 'You need a Library.'), desc: 'Permanent +2 entertainment.' },
          { id: 'resell', label: 'Buy the lot and resell it', cost: -100, desc: '+100 denarii.' },
          { id: 'pass', label: 'Pass' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      payOption(s, d, o);
      if (id === 'scroll') {
        giveGear(s, 'bestiaryScroll', 2);
        return { text: 'The Bestiary Scroll is yours. Your dinos may learn a thing or two.' };
      }
      if (id === 'stock') {
        me(s).entBonus += 2;
        return { text: 'Your library fills with scrolls, and with visitors. +2 entertainment.' };
      }
      if (id === 'resell') return { text: `You buy the lot and sell it to a Greek at twice the price. +${dn(100)}.` };
      return { text: 'The scrolls go to the fishmongers for wrapping.' };
    },
  },

  // -------------------------------------------------------------------- Caught red-handed (Apollo or week > 100)
  {
    key: 'caughtRedHanded',
    make(s) {
      if (!(asc(s, ASC.apollo) || wk(s) > 100)) return null;
      const c = [...dinosOf(s)].filter((x) => x.loyalty <= 95).sort((a, b) => a.loyalty - b.loyalty)[0];
      if (!c) return null;
      const sum = clamp(Math.round(Math.max(0, me(s).denarii) / 10), 50, 300);
      return decide(s, 'caughtRedHanded', `${cname(c)} caught red-handed`,
        `The strongbox was found empty and ${full(c)} was found asleep on ${dn(sum)}, nested like a hen. Raptors and their shiny things.`,
        [
          { id: 'forgive', label: 'Forgive it', cost: sum, desc: `The coins are chewed beyond saving. −${Math.floor(sum / 10)} tameness for the pack; it becomes a Thief.` },
          { id: 'lash', label: 'Lash it', desc: 'Coins recovered; it is injured.' },
          { id: 'eye', label: 'An eye for an eye', cost: sum, desc: `+${Math.floor(sum / 10)} tameness for the cowed pack; it loses an eye.` },
        ], { cid: c.id, sum });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The culprit is gone, and so are the coins.' };
      const id = optId(d, o);
      const t = Math.floor(d.data.sum / 10);
      if (id === 'lash') {
        injure(c, 2);
        return { text: `The coins are fished out of the straw. ${cname(c)} is lashed and will remember it.` };
      }
      payOption(s, d, o);
      if (id === 'forgive') {
        tameAll(s, -t);
        addTrait(c, 'Thief');
        return { text: `You let it keep the nest. The others take note (−${t} tameness). ${cname(c)} is now a Thief.` };
      }
      tameAll(s, t);
      if (hasTrait(c, 'PartiallyBlind')) replaceTrait(c, 'PartiallyBlind', 'Blind');
      else addTrait(c, 'PartiallyBlind');
      return { text: `An eye for an eye. ${cname(c)} is ${hasTrait(c, 'Blind') ? 'now completely blind' : 'half-blind'}. The pack is very, very good for a while (+${t} tameness).` };
    },
  },

  // -------------------------------------------------------------------- Secrets of the trade
  {
    key: 'secretsOfTrade',
    make(s) {
      const w = wk(s);
      if (w < 5) return null;
      const price = w < 20 ? 100 : w < 50 ? 250 : w < 100 ? 400 : 500;
      const h = me(s);
      const fav = h.creatures.find((c) => c.favourite && !c.away) ?? mine(s, h.bondedId) ?? champion(s);
      if (!fav) return null;
      const beast = bestOf(h.creatures.filter((c) => c.kind === 'beast' && !c.away));
      const half = Math.floor(price / 2);
      return decide(s, 'secretsOfTrade', 'Secrets of the trade',
        'A travelling virtuoso, once beast-master to a king of Pontus, offers to share his secrets with one of your creatures. For a fee.',
        [
          { id: 'fav', label: `Train ${cname(fav)} (${dn(price)})`, cost: price, desc: 'A random new trait.' },
          { id: 'random', label: `Train a random dino (${dn(half)})`, cost: half },
          { id: 'beast', label: beast ? `Train ${cname(beast)} (${dn(half)})` : `Train a beast (${dn(half)})`, cost: half, need: req(!!beast, 'You have no beast.') },
          { id: 'refuse', label: 'Refuse' },
        ], { fav: fav.id, beast: beast?.id });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'The virtuoso takes his secrets to the next ludus.' };
      const target = id === 'fav' ? mine(s, d.data.fav) : id === 'beast' ? mine(s, d.data.beast) : (dinosOf(s).length ? pick(dinosOf(s)) : undefined);
      if (!target) return { text: 'There is nobody to teach.' };
      payOption(s, d, o);
      const t = randomGoodTrait(target);
      if (!t) return { text: `${cname(target)} already knows everything he could teach. He keeps your money anyway.` };
      addTrait(target, t);
      return { text: `After a week of strange exercises, ${cname(target)} gains ${traitName(t)}.` };
    },
  },

  // -------------------------------------------------------------------- Interested buyer (investor)
  {
    key: 'interestedBuyer',
    make(s) {
      if (me(s).denarii > 200 || wk(s) > 40 || firstPlaces(s) > 0) return null;
      return decide(s, 'interestedBuyer', 'An interested buyer',
        `An investor offers ${dn(400)} for a share of your mines and your weekly takings. Forever. He smiles a great deal.`,
        [
          { id: 'accept', label: 'Accept (+400 denarii)', cost: -400, desc: '−10% mining, −5 denarii every week, −5 influence.' },
          { id: 'refuse', label: 'Refuse' },
        ]);
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'accept') return { text: 'The investor bows and leaves, still smiling.' };
      payOption(s, d, o);
      mining(s, -1);
      me(s).projected -= 5;
      return { text: `+${dn(400)}. The investor will take his share every week from now on (${infl(s, -5)} influence).` };
    },
  },

  // -------------------------------------------------------------------- A night at the tavern (Loaded Dice)
  {
    key: 'tavernNight',
    make(s) {
      if (wk(s) < 3 || armoryHas(me(s), 'loadedDice')) return null;
      return decide(s, 'tavernNight', 'A night at the tavern',
        'Dice in the back room of the Gilded Raptor. You are winning, the sailor across the table is losing, and his dice look suspiciously lucky.',
        [
          { id: 'quit', label: 'Quit while ahead', desc: '+200 denarii.' },
          { id: 'info', label: 'Play for information', desc: 'A free spy.' },
          { id: 'dice', label: 'Play for his dice', desc: 'The Loaded Dice.' },
        ], { bad: (asc(s, ASC.minerva) || s.world.difficulty.hard) && coin() });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (d.data.bad) {
        if (id === 'quit') {
          spend(s, 100);
          return { text: `You were not ahead after all. The sailor walks out ${dn(100)} richer.` };
        }
        return { text: 'The sailor wins every throw and vanishes into the night. Lucky dice indeed.' };
      }
      if (id === 'quit') {
        earn(s, 200);
        return { text: `You walk out ${dn(200)} richer and only slightly drunk.` };
      }
      if (id === 'info') {
        const spies = me(s).buildings.residence >= 2;
        addKeepers(me(s), 1, spies ? 'spies' : 'unassigned');
        return { text: spies ? 'The sailor loses everything and pays in the only coin he has left: his services as a spy.' : 'The sailor loses and joins your keepers. He will make a fine spy once your residence can hide one.' };
      }
      giveGear(s, 'loadedDice', 2);
      return { text: 'You win the dice themselves. They always seem to land well for you now.' };
    },
  },

  // -------------------------------------------------------------------- Dino slacking off (Arrogant)
  {
    key: 'slackingDino',
    make(s) {
      if (firstPlaces(s) < 2) return null;
      const champ = champion(s);
      const c = dinosOf(s).find((x) => x.id !== champ?.id && x.career.wins >= 2 && !['Fanatic', 'GlorySeeker', 'Arrogant'].some((t) => hasTrait(x, t as TraitId)));
      if (!c) return null;
      return decide(s, 'slackingDino', `${cname(c)} slacking off`,
        `Since its last few wins ${full(c)} lies in the sun all day and snaps at anyone who brings a training dummy. It thinks it has made it.`,
        [
          { id: 'beat', label: champ ? `Have ${cname(champ)} beat some sense into it` : 'Have your champion beat some sense into it', need: req(!!champ, 'Nobody fit to do it.'), desc: 'A fight. If it wins, it becomes Arrogant.' },
          { id: 'lash', label: 'Lash it', desc: 'Injury.' },
          { id: 'let', label: 'Let it be', desc: '−10 tameness for the pack; it becomes Arrogant.' },
        ], { cid: c.id, champ: champ?.id });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The slacker is gone.' };
      const id = optId(d, o);
      if (id === 'lash') {
        injure(c, 2);
        tame(c, -10);
        return { text: `${cname(c)} is back at the training dummies, limping and sullen.` };
      }
      if (id === 'let') {
        tameAll(s, -10);
        addTrait(c, 'Arrogant');
        return { text: `${cname(c)} is Arrogant, and the others wonder why they bother (−10 tameness).` };
      }
      const champ = stillOrChampion(s, d.data.champ, [c.id]);
      if (!champ) return { text: 'Nobody was fit to do it. The slacker sleeps on.' };
      const f = streetFight(s, { title: 'Beating some sense into it', fighters: [champ], foes: [c], foeHouse: me(s), foeName: cname(c) });
      if (!f.won) addTrait(c, 'Arrogant');
      return { text: f.won ? `${cname(champ)} gives ${cname(c)} a lesson it will not forget. ${f.text}` : `${cname(c)} won, and now it is unbearable: Arrogant. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- A bad feeling.. (Dark Fangs)
  {
    key: 'badFeeling',
    make(s) {
      const h = me(s);
      const fangs = h.armory.find((g) => g.unique === 'darkFangs');
      if (!fangs) return null;
      const c = wearer(h, fangs.id);
      if (!c) return null;
      const champ = champion(s, [c.id]);
      return decide(s, 'badFeeling', 'A bad feeling..',
        `${full(c)} has not slept since it was fitted with the Dark Fangs. It stares at the keepers as if counting them. Its eyes are very red.`,
        [
          { id: 'force', label: champ ? `Have ${cname(champ)} take them by force` : 'Take them by force', need: req(!!champ, 'Nobody fit to try.'), desc: 'A fight against the possessed dino.' },
          { id: 'ignore', label: 'It is probably nothing', desc: '+5 influence (the crowd loves it).' },
          { id: 'destroy', label: 'Steal the fangs at night and destroy them', desc: 'Lose 2 keepers; −10 tameness for it.' },
        ], { cid: c.id, gid: fangs.id, champ: champ?.id });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      const id = optId(d, o);
      if (!c) return { text: 'The fangs lie in the armory, quiet for now.' };
      if (id === 'ignore') return { text: `The crowd adores a dino with red eyes. +${infl(s, 5)} influence.` };
      if (id === 'destroy') {
        lose(s, 2);
        tame(c, -10);
        return { text: `Two keepers crept in to steal the fangs. In the morning there were only pieces of them. No fire seemed to hurt the fangs.` };
      }
      const champ = stillOrChampion(s, d.data.champ, [c.id]);
      if (!champ) return { text: 'Nobody is fit to try.' };
      const f = streetFight(s, { title: 'Taking the Dark Fangs', fighters: [champ], foes: [c], foeHouse: me(s), foeName: cname(c) });
      if (f.won) {
        for (const k of Object.keys(c.gear) as (keyof typeof c.gear)[]) if (c.gear[k] === d.data.gid) delete c.gear[k];
        return { text: `${cname(champ)} pins ${cname(c)} down while the keepers pry the Dark Fangs loose. ${f.text}`, battle: f.battle };
      }
      return { text: `Perhaps we best not anger it again.. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- A death in the family.. (inheritance)
  {
    key: 'deathInFamily',
    make(s) {
      const w = wk(s);
      if (w < 2 || w > 25 || s.world.ascension > 0) return null;
      return decide(s, 'deathInFamily', 'A death in the family..',
        'An uncle you barely remember has died in your hometown, and left you something. The letter does not say what you did to deserve it. The family lets you choose.',
        [
          { id: 'scroll', label: 'His Bestiary Scroll' },
          { id: 'eagle', label: 'His Eagle-Eye Charm (Jupiter)' },
          { id: 'neptune', label: 'His Neptune Charm' },
          { id: 'coin', label: 'His savings (+250 denarii)', cost: -250, desc: '+5 influence.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'scroll') giveGear(s, 'bestiaryScroll', 2);
      else if (id === 'eagle') giveGear(s, 'eagleEyeCharm', 2);
      else if (id === 'neptune') giveGear(s, 'neptuneCharm', 2);
      else {
        payOption(s, d, o);
        infl(s, 5);
      }
      return { text: id === 'coin' ? `+${dn(250)} and a respectable mourning period (+5 influence).` : 'The inheritance arrives on a mule, wrapped in his old toga.' };
    },
  },

  // -------------------------------------------------------------------- Ally under attack (Ludus Pact)
  {
    key: 'allyUnderAttack',
    make(s) {
      const ally = activeRivals(s).find((r) => r.ai?.pact);
      const champ = champion(s);
      if (!ally || !champ) return null;
      return decide(s, 'allyUnderAttack', `${ally.name} under attack!`,
        `A band of the Wild Horde is battering the gates of ${ally.name}, your ally under the Ludus Pact. A runner begs for help.`,
        [
          { id: 'send', label: `Send ${cname(champ)} and your wardens`, desc: `Fight beside ${ally.name}. Win: ${ally.name} +15 opinion.` },
          { id: 'few', label: 'Send a few guards', desc: `−10 influence; ${ally.name} −25 opinion.` },
          { id: 'nothing', label: 'Do nothing', desc: `−15 influence; ${ally.name} will not forgive this.` },
        ], { ally: ally.id, champ: champ.id });
    },
    resolve(s, d, o) {
      const ally = s.rivals.find((r) => r.id === d.data.ally && !r.defeated);
      if (!ally) return { text: 'Too late: your ally is no more.' };
      const id = optId(d, o);
      if (id === 'few') {
        changeOpinion(s, ally, -25);
        return { text: `Your handful of guards arrives after the fighting. ${ally.name} is not impressed (${infl(s, -10)} influence).` };
      }
      if (id === 'nothing') {
        changeOpinion(s, ally, -(30 + Math.floor((ally.ai?.opinion ?? 0) / 2)));
        return { text: `You bar your own gates and listen to the screams. ${ally.name} will remember (${infl(s, -15)} influence).` };
      }
      const champ = stillOrChampion(s, d.data.champ);
      if (!champ) return { text: 'Nobody is fit to fight. You send your apologies instead.' };
      const n = s.world.horde.ferals > 40 ? 3 : 2;
      const foes = [
        dinoFoe(s, 'allosaurus', 'Rogue Allosaurus', { traits: ['Escaped'] }),
        dinoFoe(s, 'velociraptor', 'Rogue Raptor', { traits: ['Escaped'], mult: 0.9 }),
        beastFoe(s, 'direwolf', 'Feral Dire Wolf', { mult: 0.9 }),
      ].slice(0, n);
      const allyBest = bestOf(fitOf(ally));
      const f = streetFight(s, {
        title: `${ally.name} under attack`, fighters: [champ], foes, foeName: 'the Wild Horde', allies: !allyBest,
        extraAllies: allyBest ? [cloneAsFoe(allyBest, ally)] : undefined,
      });
      if (f.won) changeOpinion(s, ally, 15);
      return { text: f.won ? `The Horde is driven from the gates of ${ally.name}. ${f.text}` : `The Horde broke through. ${f.text}`, battle: f.battle };
    },
  },

  // -------------------------------------------------------------------- Hoplite request (Spartan Dynasty)
  {
    key: 'hopliteRequest',
    make(s) {
      if (!hasUpgrade(s, 'spartanDynasty')) return null;
      const c = rank(fitDinos(s).filter((x) => x.prof.horn >= 15 && !['iguanodon', 'triceratops', 'tyrannosaurus'].includes(x.species) && !hasTrait(x, 'Hoplite')))[0];
      if (!c) return null;
      const place = pick(['Iberia', 'Greece', 'Thrace', 'Carthage']);
      return decide(s, 'hopliteRequest', `${cname(c)} wants to go to war`,
        `Word has come of a war in ${place}, where the old hoplite herds still fight in the phalanx. ${full(c)}, horn-skilled and restless, wants to go. It is very insistent.`,
        [
          { id: 'go', label: `Let it go to ${place} (3–5 weeks)`, desc: 'It returns a Hoplite. +5 influence.' },
          { id: 'refuse', label: 'Refuse', desc: `−30 tameness for ${cname(c)}.` },
        ], { cid: c.id, place });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      if (!c) return { text: 'The dino is gone.' };
      if (optId(d, o) === 'refuse') {
        // GM bug fixed: only the requester resents the refusal
        tame(c, -30);
        return { text: `${cname(c)} stares at the horizon and sulks (−30 tameness).` };
      }
      if (!fit(c)) return { text: `${cname(c)} is in no state to travel.` };
      sendOnAdventure(s, 'hopliteWar', [c.id], range(3, 5), { place: d.data.place }, `The hoplite war in ${d.data.place}`);
      return { text: `${cname(c)} marches off towards ${d.data.place}.` };
    },
  },

  // -------------------------------------------------------------------- The strongest of bonds (Good Boy → Best Boy)
  {
    key: 'strongestBonds',
    make(s) {
      const b = me(s).creatures.find((c) => c.kind === 'beast' && hasTrait(c, 'GoodBoy') && !hasTrait(c, 'BestBoy') && !c.away);
      if (!b) return null;
      const champ = champion(s);
      return decide(s, 'strongestBonds', 'The strongest of bonds',
        `${full(b)} follows you everywhere, sleeps at your door and growls at your accountant. Your keepers joke that it is your true heir. Your dinos are not laughing.`,
        [
          { id: 'train', label: champ ? `Train ${cname(champ)} harder yourself` : 'Train your champion harder yourself', need: req(!!champ, 'No champion to train.'), desc: 'A random trait for the champion; −10 tameness for the pack.' },
          { id: 'country', label: `Retreat to the countryside with ${cname(b)}`, desc: `It becomes a Best Boy. +10 influence, −5 tameness for the pack.` },
          { id: 'refuse', label: 'Keep your distance', desc: '+20 influence.' },
        ], { bid: b.id, champ: champ?.id });
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const b = mine(s, d.data.bid);
      if (id === 'train') {
        const c = stillOrChampion(s, d.data.champ);
        if (!c) return { text: 'There is nobody to train.' };
        const t = randomGoodTrait(c);
        if (t) addTrait(c, t);
        tameAll(s, -10, c.id);
        return { text: `You drill ${cname(c)} yourself for a week${t ? `: it gains ${traitName(t)}` : ''}. The rest of the pack feels neglected (−10 tameness).` };
      }
      if (id === 'country' && b) {
        replaceTrait(b, 'GoodBoy', 'BestBoy');
        tameAll(s, -5, b.id);
        return { text: `A week of long walks and thrown sticks. ${cname(b)} is now the Best Boy. +${infl(s, 10)} influence; the dinos sulk (−5 tameness).` };
      }
      return { text: `You remind Capua that a lanista has no favourites. +${infl(s, 20)} influence.` };
    },
  },

  // -------------------------------------------------------------------- Keepers abducted (Hard only)
  {
    key: 'keepersAbducted',
    make(s) {
      if (!s.world.difficulty.hard) return null;
      const have = keepers(me(s));
      if (have < 1) return null;
      const n = Math.min(have, clamp(Math.floor(wk(s) / 5), 1, 8));
      const champ = champion(s);
      return decide(s, 'keepersAbducted', 'Keepers abducted',
        `${pl(n, 'keeper')} were snatched on the road from the market. A note pinned to your gate asks for ${dn(50 * n)}, or else.`,
        [
          { id: 'ransom', label: `Pay the ransom (${dn(50 * n)})`, cost: 50 * n },
          { id: 'trap', label: champ ? `Send ${cname(champ)} to free them` : 'Send your champion to free them', need: req(!!champ, 'Nobody fit to go.'), desc: 'Very hard: the abductor and his guard wolf. Win: Hero, +10 influence.' },
          { id: 'abandon', label: 'Abandon them' },
        ], { n, champ: champ?.id });
    },
    onDraw(s, d) {
      d.data.lost = loseKeepers(s, me(s), d.data.n);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const n: number = d.data.n;
      if (id === 'ransom') {
        payOption(s, d, o);
        addKeepers(me(s), n);
        return { text: `You pay. ${pl(n, 'keeper')} come home, embarrassed and hungry.` };
      }
      if (id === 'trap') {
        const c = stillOrChampion(s, d.data.champ);
        if (c) {
          sendOnAdventure(s, 'abducted', [c.id], 2, { keepers: n });
          return { text: `${cname(c)} follows the abductors' trail into the hills.` };
        }
      }
      return { text: `Your ${n === 1 ? 'keeper was' : 'keepers were'} found beheaded along the Appian way.` };
    },
  },

  // -------------------------------------------------------------------- Travelling merchant (upgrade)
  {
    key: 'travelingMerchant',
    make(s) {
      if (!hasUpgrade(s, 'travelingMerchant') || me(s).denarii < 100) return null;
      return decide(s, 'travelingMerchant', 'A travelling merchant',
        'A merchant with a painted cart and a parrot on his shoulder has stopped at your gate. "Rare goods from the edge of the world! Quality? A gamble, like everything!"',
        [
          { id: 'look', label: 'See his wares' },
          { id: 'away', label: 'Send him on his way' },
        ], {}, 'merchant');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'look') return { text: 'The parrot insults you as the cart rolls off.' };
      rollMerchant(s);
      const n = s.world.market.merchant?.items.length ?? 0;
      return { text: n ? `The merchant lays out ${pl(n, 'item')} in the market. He will stay a few days.` : 'His cart turned out to be empty.' };
    },
  },

  // -------------------------------------------------------------------- Party got out of hand (not a senator)
  {
    key: 'partyOutOfHand',
    make(s) {
      if (s.player.senator || me(s).keepers.showmen < 1) return null;
      const tavern = me(s).buildings.tavern > 0 || me(s).buildings.romeMansion > 0;
      return decide(s, 'partyOutOfHand', 'The party got out of hand',
        'At a banquet where your showmen performed, a drunken aristocrat strangled one of them for fumbling a juggling raptor egg. He now expects you to forget it.',
        [
          { id: 'tavern', label: 'Tell the story in your taverns', need: req(tavern, 'Requires a Tavern or a Rome mansion.'), desc: '+10 influence.' },
          { id: 'senate', label: 'Use your Senate connections', need: req(senateInfluence(s), 'Requires influence in the Senate.'), desc: '+5 influence, +100 denarii.' },
          { id: 'demand', label: 'Demand reimbursement', cost: -100, desc: '+100 denarii, −10 influence.' },
          { id: 'apologise', label: 'Apologise for the inconvenience', desc: '−5 influence; the showman is lost.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      // GM quirk fixed: the tavern option grants the +10 influence its text promises
      if (id === 'tavern') return { text: `By the next evening all of Capua is laughing at the aristocrat. +${infl(s, 10)} influence.` };
      if (id === 'senate') {
        earn(s, 100);
        return { text: `A quiet word, and the aristocrat pays ${dn(100)} with a fixed smile. +${infl(s, 5)} influence.` };
      }
      if (id === 'demand') {
        payOption(s, d, o);
        return { text: `He pays ${dn(100)}, and tells everyone you are a grocer (${infl(s, -10)} influence).` };
      }
      lose(s, 1, 'showmen');
      return { text: `You apologise. Your showman is buried quietly (${infl(s, -5)} influence).` };
    },
  },

  // -------------------------------------------------------------------- Keeper purchase offer (not a senator)
  {
    key: 'keeperPurchase',
    make(s) {
      if (s.player.senator || keepers(me(s)) < 1) return null;
      return decide(s, 'keeperPurchase', 'An offer for a keeper',
        'A rich widow has taken a liking to one of your keepers, the one who sings to the hatchlings. She offers to buy him.',
        [
          { id: 'haggle', label: 'Haggle like a senator', cost: -300, need: req(senateInfluence(s), 'Requires influence in the Senate.'), desc: '+300 denarii, lose the keeper.' },
          { id: 'keep', label: 'Keep him', desc: '+5 influence.' },
          { id: 'sell', label: 'Sell him', cost: -200, desc: '+200 denarii, lose the keeper.' },
        ]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'keep') return { text: `The hatchlings keep their singer. Capua finds it charming: +${infl(s, 5)} influence.` };
      payOption(s, d, o);
      lose(s, 1);
      return { text: `The widow pays ${dn(id === 'haggle' ? 300 : 200)}. The hatchlings sulk for a week.` };
    },
  },

  // -------------------------------------------------------------------- Moon Frenzy (werewolves, 04 §11.1)
  {
    key: 'moonFrenzy',
    make(s) {
      if (wk(s) % 4 !== 3) return null;
      const h = me(s);
      const c = h.creatures.find((x) => !x.away && (hasTrait(x, 'Lycanthropy') || h.armory.some((g) => g.type === 'moonstone' && x.gear.item === g.id)));
      if (!c) return null;
      return decide(s, 'moonFrenzy', 'The moon is rising',
        `Tomorrow the moon is full, and ${full(c)} knows it. It has torn its harness twice today and the keepers will not go near its pen.`,
        [
          { id: 'chain', label: 'Chain it in the deepest pen', desc: `−10 tameness for ${cname(c)}.` },
          { id: 'roam', label: 'Let it roam the hills tonight', desc: 'Something will die. Hopefully not a keeper.' },
          { id: 'priests', label: `Pay the priests of Diana (${dn(100)})`, cost: 100 },
        ], { cid: c.id });
    },
    resolve(s, d, o) {
      const c = mine(s, d.data.cid);
      const id = optId(d, o);
      if (!c) return { text: 'The pen is empty. The moon rises anyway.' };
      if (id === 'chain') {
        tame(c, -10);
        return { text: `${cname(c)} howls all night in chains. Nobody sleeps, but nobody dies.` };
      }
      if (id === 'priests') {
        payOption(s, d, o);
        return { text: 'The priests of Diana chant until dawn. Nothing happens. Perhaps that was the point.' };
      }
      const r = rand(10);
      if (r < 3) {
        lose(s, 1);
        return { text: `${cname(c)} came back at dawn covered in blood. One keeper did not come back at all.` };
      }
      if (r < 6) {
        const h = me(s);
        h.pantry.rawMeat = (h.pantry.rawMeat ?? 0) + 3;
        return { text: `${cname(c)} came back at dawn dragging half a wild boar. +3 Raw Meat for the pantry.` };
      }
      c.fame += 5;
      return { text: `Shepherds tell of a monster in the hills. ${cname(c)} sleeps it off; its legend grows (+5 fame).` };
    },
  },
];

// ---------------------------------------------------------------------------
// Delayed outcomes
// ---------------------------------------------------------------------------

export const GENERAL_DELAYED: Record<string, DelayedHandler> = {
  plague(s, data) {
    const h = me(s);
    const prepared = !!data.prepared;
    if (prepared) h.projected += 150;
    const n = lose(s, prepared ? range(1, 3) : range(1, 8));
    const sickN = prepared ? 1 : 2;
    const pool = h.creatures.filter((c) => !c.away);
    const sick: string[] = [];
    for (let i = 0; i < sickN && pool.length; i++) {
      const c = pool.splice(rand(pool.length), 1)[0];
      sicken(c, range(2, 4));
      sick.push(cname(c));
    }
    for (const r of activeRivals(s)) {
      loseKeepers(s, r, 2);
      const c = r.creatures.length ? pick(r.creatures) : undefined;
      if (c) sicken(c, 3);
    }
    const text = `Plague arrives in Capua! ${pl(n, 'keeper')} died${sick.length ? ` and ${sick.join(', ')} fell ill` : ''}.${prepared ? ' Your preparations kept it from being far worse.' : ''} The rival houses suffer too.`;
    message(s, 'medicus', 'Plague arrives in Capua!', text);
    report(s, 'bad', text);
  },
  orphanage(s, data) {
    const n: number = data.n ?? 3;
    addKeepers(me(s), n, 'miners');
    message(s, 'assistant', 'The orphans are grown', `${pl(n, 'orphan')} from the old orphanage are old enough to work and go down the mines.`);
    report(s, 'good', `${pl(n, 'young keeper')} joined the mines.`);
  },
  courtCase(s, data) {
    me(s).projected += data.amount ?? 50;
    message(s, 'magistrate', 'Acquitted', 'After twelve weeks of speeches the court acquits you of embezzlement. The legal fees stop.');
    report(s, 'good', 'Acquitted of embezzlement; legal fees end.');
  },
  beggarFed(s) {
    if (coin()) {
      earn(s, 150);
      infl(s, 5);
      message(s, 'assistant', 'The beggar repays you', `The beggar you fed found work in the port and repaid you ${dn(150)}. Word of your kindness spreads (+5 influence).`);
      report(s, 'income', 'The beggar repaid his meal', 150);
    }
  },
  beggarHost(s) {
    const h = me(s);
    const r = rand(7);
    let text: string;
    if (r === 1) {
      earn(s, 150);
      text = `Your guest found his feet and repaid you ${dn(150)}.`;
    } else if (r === 2) {
      infl(s, -10);
      text = 'Your guest was a spy for a rival house all along. He is gone, and so are your secrets (−10 influence).';
    } else if (r === 3) {
      const n = Math.max(0, Math.min(100, h.denarii));
      h.denarii -= n;
      text = `Your guest left in the night with ${dn(n)} from the strongbox.`;
    } else if (r === 4) {
      loseKeepers(s, h, 1);
      text = 'Your guest murdered a keeper in a quarrel over dice and fled.';
    } else if (r === 5) {
      earn(s, 500);
      text = `Your guest inherited a fortune from a cousin in Neapolis, and repaid your kindness with ${dn(500)}.`;
    } else if (r === 6 && !s.world.flags.darkFangsGiven) {
      s.world.flags.darkFangsGiven = true;
      giveUnique(s, 'darkFangs');
      text = 'Your guest vanished in the night. In his room: a pool of blood and a pair of black fangs that are warm to the touch. The Dark Fangs are in your armory.';
    } else {
      text = 'Your guest left one morning without a word.';
    }
    message(s, 'assistant', 'Your old acquaintance', text);
    report(s, 'event', text);
  },
};
