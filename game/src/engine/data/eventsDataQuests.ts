// Decision-driven questlines (GM 04 §5): Crocea Mors, Hannibal's legacy, Mythical Romulus I–III, Pericles,
// the White Rhino, the Shield of Leonidas and Hannibal's Crest auctions, the Descendant of Sparta and the
// Restoration of Troy escort. OWNER: systems-story agent.
//
// World flags written here (and by the adventures they launch):
//   lostBladeDone, hannibalStage (3 = regalia owned), hannibalCrestDone, romulusStage (0..3, −1 failed),
//   periclesDone, whiteRhinoDone, leonidasDone, spartaDone, troyStage (1 escort survived, −1 failed).

import type { Creature, GameState } from '../types';
import type { EventDef } from '../events';
import { chance, range } from '../rng';
import { activeRivals, hasUpgrade, message, report } from '../util';
import { addTrait, generateDino, getStat, hasTrait } from '../creature';
import { changeOpinion } from '../rivals';
import { committedSpies, loseKeepers, addKeepers } from '../economy';
import { sendOnAdventure } from '../adventures';
import { auctionDecision, placeBid, uniqueLot } from './eventsDataPolitics';
import {
  type DelayedHandler, champion, cname, decide, dinoFoe, dn, fitOf, full, hasDelayed, hasOppSafe, infl, L, me, mine,
  optId, payOption, princeps, rank, req, schedule, stillOrChampion, streetFight, weakestRival, wk, foeLevel, fit,
} from './eventsDataKit';

const flag = (s: GameState, k: string) => s.world.flags[k];
const num = (s: GameState, k: string): number => Number(s.world.flags[k] ?? 0) || 0;
const onAdv = (s: GameState, key: string): boolean => s.player.adventures.some((a) => a.key === key);
const spies = (s: GameState): number => me(s).keepers.spies;
const fitDinos = (s: GameState): Creature[] => fitOf(me(s), (c) => c.kind === 'dino');

function hannibalWeeks(c: Creature, gathered: boolean): number {
  return 4 - (c.species === 'troodon' ? 1 : 0) - (gathered ? 1 : 0);
}

export const QUEST_EVENTS: EventDef[] = [
  // ==================================================================== Quest for Crocea Mors
  {
    key: 'lostBlade',
    make(s) {
      if (!hasUpgrade(s, 'lostBlade') || wk(s) < 20 || flag(s, 'lostBladeDone') || onAdv(s, 'croceaMors')) return null;
      // GM: a gladiator with a stat above week/10 + 9 (week/6 + 9 on Hard)
      const need = Math.floor(wk(s) / (s.world.difficulty.hard ? 6 : 10)) + 9;
      const c = rank(fitDinos(s).filter((x) => Math.max(getStat(x, 'str'), getStat(x, 'agi'), getStat(x, 'cun')) > need))[0];
      if (!c) return null;
      return decide(s, 'lostBlade', 'The quest for Crocea Mors',
        "Your spies intercepted a letter to the Senate: Crocea Mors, Julius Caesar's lost talons, hangs in a Britannic hill-fort, taken in a skirmish and never returned. " +
        'A ship leaves for Britannia within the week.',
        [
          { id: 'send', label: `Send ${cname(c)} to Britannia (4 weeks)`, desc: 'Three ways in will present themselves. Some can kill.' },
          { id: 'senate', label: 'Send word to the Senate', desc: '+15 influence, every rival +5 opinion. The quest is over.' },
          { id: 'ignore', label: 'Burn the letter' },
        ], { cid: c.id }, 'quest');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'senate') {
        s.world.flags.lostBladeDone = 'senate';
        for (const r of activeRivals(s)) changeOpinion(s, r, 5);
        return { text: `The Senate thanks you for your loyalty and sends a legion of its own. +${infl(s, 15)} influence.` };
      }
      if (id === 'ignore') return { text: 'The letter curls up in the brazier.' };
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit for the voyage.' };
      sendOnAdventure(s, 'croceaMors', [c.id], 4);
      return { text: `${cname(c)} boards a grain ship for Britannia, already seasick.` };
    },
  },

  // ==================================================================== Hannibal's legacy (×2)
  {
    key: 'hannibalsLegacy', weight: 2,
    make(s) {
      if (!hasUpgrade(s, 'hannibalsLegacy') || num(s, 'hannibalStage') >= 3) return null;
      if (onAdv(s, 'hannibalMerchant') || hasDelayed(s, 'hannibalInfo')) return null;
      const healthy = fitDinos(s);
      if (healthy.length < 2 || wk(s) < 12 + 2 * s.world.ascension || me(s).influence < 100 || spies(s) < 1) return null;
      const c = rank(healthy)[0];
      return decide(s, 'hannibalsLegacy', "Hannibal's legacy",
        'Your spy has word from the ruins of Carthage: a merchant there has a chest-piece that belonged to Hannibal Barca himself, and does not know what it is worth. Yet.',
        [
          { id: 'send', label: `Send ${cname(c)} to Carthage (${hannibalWeeks(c, false)} weeks)` },
          { id: 'info', label: 'Have your spies gather more information first', desc: 'Two weeks; the journey is then a week shorter.' },
          { id: 'refuse', label: 'Leave Carthage to the dead' },
        ], { cid: c.id }, 'quest');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'Hannibal sleeps on.' };
      if (id === 'info') {
        schedule(s, 'hannibalInfo', 2, {});
        return { text: 'Your spies start asking questions in the port.' };
      }
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit for the journey.' };
      sendOnAdventure(s, 'hannibalMerchant', [c.id], hannibalWeeks(c, false));
      return { text: `${cname(c)} sails for Carthage.` };
    },
  },
  {
    key: 'hannibalReport', followUp: true,
    make: () => null,
    resolve(s, d, o) {
      if (optId(d, o) !== 'send') return { text: 'Hannibal sleeps on.' };
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit for the journey.' };
      sendOnAdventure(s, 'hannibalMerchant', [c.id], hannibalWeeks(c, true));
      return { text: `${cname(c)} sails for Carthage, knowing exactly where to look.` };
    },
  },

  // ==================================================================== Mythical Romulus I
  {
    key: 'romulus1',
    make(s) {
      if (!hasUpgrade(s, 'founderAxe') || wk(s) < 10 || num(s, 'romulusStage') !== 0) return null;
      if (spies(s) <= 1 || me(s).denarii <= 100 || hasDelayed(s, 'romulusSpies') || onAdv(s, 'romulus1')) return null;
      const champ = champion(s);
      return decide(s, 'romulus1', 'The mythical Romulus',
        'A scholar swears that the library of the temple of Mars holds scrolls about the founder of Rome, and about the tail club he used on his brother Remus.',
        [
          { id: 'spies', label: `Send two spies to steal the scrolls (${dn(100)})`, cost: 100, need: req(spies(s) >= 2, 'You need two spies.'), desc: 'Four weeks; the spies return with the scrolls and +5 influence.' },
          { id: 'champ', label: champ ? `Send ${cname(champ)} to take them` : 'Send your champion', need: req(!!champ, 'Nobody fit to go.'), desc: 'Two temple guards stand in the way.' },
          { id: 'refuse', label: 'Myths are for children' },
        ], { champ: champ?.id }, 'quest');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'The scrolls gather dust.' };
      if (id === 'spies') {
        payOption(s, d, o);
        loseKeepers(s, me(s), 2, 'spies');
        schedule(s, 'romulusSpies', 4, {});
        return { text: 'Two of your spies take holy orders. Temporarily.' };
      }
      const c = stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody is fit to go.' };
      sendOnAdventure(s, 'romulus1', [c.id], 2);
      return { text: `${cname(c)} sets off for the temple library. The librarians have been warned about nothing.` };
    },
  },

  // ==================================================================== Mythical Romulus II
  {
    key: 'romulus2',
    make(s) {
      if (!hasUpgrade(s, 'founderAxe') || num(s, 'romulusStage') !== 1 || spies(s) <= 2) return null;
      const price = 500 + 10 * wk(s);
      const champ = champion(s);
      return decide(s, 'romulus2', 'The scrolls of Romulus',
        `The scrolls are written in an archaic hand. One scholar can read them. He wants ${dn(price)}, and he keeps a very large bodyguard.`,
        [
          { id: 'pay', label: `Pay the scholar (${dn(price)})`, cost: price },
          { id: 'threaten', label: 'Threaten him as Princeps', need: req(princeps(s), 'Only the Princeps Senatus can.') },
          { id: 'fight', label: champ ? `Have ${cname(champ)} deal with the bodyguard` : 'Deal with the bodyguard', need: req(!!champ, 'Nobody fit to fight.') },
          { id: 'refuse', label: 'Not now' },
        ], { champ: champ?.id }, 'quest');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const done = () => {
        s.world.flags.romulusStage = 2;
        return 'The scrolls point to a cave on the Palatine hill.';
      };
      if (id === 'refuse') return { text: 'The scrolls stay unread.' };
      if (id === 'pay') {
        payOption(s, d, o);
        return { text: `The scholar reads all night. ${done()}` };
      }
      if (id === 'threaten') return { text: `The scholar remembers that the Princeps can have him exiled. ${done()}` };
      const c = stillOrChampion(s, d.data.champ);
      if (!c) return { text: 'Nobody is fit to fight.' };
      const foe = dinoFoe(s, 'allosaurus', "The Scholar's Bodyguard", { mult: 1.15, cls: 'brute', traits: ['Giant'], gear: [L('tailClub', 2), L('studdedBarding', 1)] });
      const f = streetFight(s, { title: 'The scholar\'s bodyguard', fighters: [c], foes: [foe], foeName: 'the bodyguard', stake: 0 });
      return { text: f.won ? `With his bodyguard in pieces, the scholar is suddenly eager to help. ${done()} ${f.text}` : `The bodyguard was as large as promised. ${f.text}`, battle: f.battle };
    },
  },

  // ==================================================================== Mythical Romulus III
  {
    key: 'romulus3',
    make(s) {
      if (!hasUpgrade(s, 'founderAxe') || num(s, 'romulusStage') !== 2 || spies(s) <= 2 || onAdv(s, 'romulus3')) return null;
      const c = champion(s);
      const r = weakestRival(s);
      if (!c || !r) return null;
      return decide(s, 'romulus3', 'The cave on the Palatine hill',
        `The cave is real, and ${r.name} has heard of it too. Their best are already on the road.`,
        [
          { id: 'send', label: `Send ${cname(c)} (3 weeks)`, desc: `Fight ${r.name}'s best dino and beast for the Founder's Club.` },
          { id: 'refuse', label: 'Let them have it' },
        ], { cid: c.id, rival: r.id }, 'quest');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'send') {
        s.world.flags.romulusStage = -1;
        return { text: 'You let the legend go. Somebody else will dig it up.' };
      }
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit to go.' };
      sendOnAdventure(s, 'romulus3', [c.id], 3, { rivalId: d.data.rival });
      return { text: `${cname(c)} races ${s.rivals.find((r) => r.id === d.data.rival)?.name ?? 'the rival'} to the Palatine.` };
    },
  },

  // ==================================================================== Legend of Pericles
  {
    key: 'pericles',
    make(s) {
      const h = me(s);
      if (flag(s, 'periclesDone') || h.buildings.library < 1 || h.keepers.showmen < 2 || onAdv(s, 'pericles')) return null;
      const c = champion(s);
      if (!c) return null;
      return decide(s, 'pericles', 'The legend of Pericles',
        'Your library has turned up a map to the tomb of Pericles of Athens, where his helmet was buried with him. Your showmen are already singing about it, so everyone knows.',
        [
          { id: 'send', label: `Send ${cname(c)} (3 weeks)`, desc: 'Grave robbers will be there first.' },
          { id: 'refuse', label: 'Let the dead rest' },
        ], { cid: c.id }, 'quest');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'send') return { text: 'Pericles rests a while longer.' };
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit to go.' };
      sendOnAdventure(s, 'pericles', [c.id], 3);
      return { text: `${cname(c)} sets off for Greece with a map and a shovel.` };
    },
  },

  // ==================================================================== Hunt for the White Rhino
  {
    key: 'whiteRhino',
    make(s) {
      if (!hasUpgrade(s, 'woollyRhinos') || wk(s) < 25 || flag(s, 'whiteRhinoDone') || onAdv(s, 'whiteRhino')) return null;
      const c = rank(fitDinos(s).filter((x) => hasTrait(x, 'Bestiarii')))[0];
      if (!c) return null;
      return decide(s, 'whiteRhino', 'The hunt for the White Rhino',
        'Shepherds in the northern hills tell of a woolly rhino as white as snow, that has gored three hunters and a bishop\'s ox. A true beast hunter could bring it back alive.',
        [
          { id: 'hunt', label: `Send ${cname(c)} (3 weeks)`, desc: 'Fight the White Rhino; if it survives, it joins you. Hunter trait.' },
          { id: 'refuse', label: 'Leave it to the shepherds' },
        ], { cid: c.id }, 'quest');
    },
    resolve(s, d, o) {
      if (optId(d, o) !== 'hunt') return { text: 'The White Rhino roams on.' };
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit for the hunt.' };
      sendOnAdventure(s, 'whiteRhino', [c.id], 3);
      return { text: `${cname(c)} heads north with nets and a great deal of rope.` };
    },
  },

  // ==================================================================== Ancient Greek shield auction (Shield of Leonidas)
  {
    key: 'greekShieldAuction',
    make(s) {
      if (!hasUpgrade(s, 'bashPlate') || flag(s, 'leonidasDone')) return null;
      if (!(s.player.senator || hasOppSafe(s, 'imperator') || hasOppSafe(s, 'bacchusPatron'))) return null;
      return auctionDecision(s, 'greekShieldAuction', 'An ancient Greek shield',
        'An art collector is auctioning a bronze bash plate said to have been carried by Leonidas at Thermopylae.', uniqueLot('shieldOfLeonidas', 'leonidasDone'));
    },
    resolve(s, d, o) {
      if (optId(d, o) === 'bid') return placeBid(s, d.data.lot, 200);
      s.world.flags.leonidasDone = true;
      return { text: 'The shield of Leonidas is sold to a collector from Corinth.' };
    },
  },

  // ==================================================================== Hannibal's Crest auction
  {
    key: 'hannibalCrestAuction',
    make(s) {
      if (num(s, 'hannibalStage') < 3 || flag(s, 'hannibalCrestDone')) return null;
      if (!(s.player.senator || hasOppSafe(s, 'imperator'))) return null;
      return auctionDecision(s, 'hannibalCrestAuction', "Hannibal's Crest",
        "Word of your Carthaginian regalia has spread. A dealer in Rome is auctioning the crested helm that went with it: Hannibal's Crest.", uniqueLot('hannibalsHelmet', 'hannibalCrestDone'));
    },
    resolve(s, d, o) {
      if (optId(d, o) === 'bid') return placeBid(s, d.data.lot, 200);
      s.world.flags.hannibalCrestDone = true;
      return { text: "Hannibal's Crest goes to a senator's wife, who will wear it to dinner." };
    },
  },

  // ==================================================================== Descendant of Sparta
  {
    key: 'spartaDescendant',
    make(s) {
      if (!hasUpgrade(s, 'spartanDynasty') || flag(s, 'spartaDone') || me(s).denarii < 100) return null;
      if (!(s.player.heritage === 'greek' || s.player.senator || hasOppSafe(s, 'bribeGeneral') || hasOppSafe(s, 'gambler'))) return null;
      if (!chance(0.5)) return null;
      return decide(s, 'spartaDescendant', 'Descendant of Sparta',
        'An old Laconian herder comes to you at night. He has been hiding the last hatchling of the Agiad line, bred from the war-beasts of Leonidas himself. Rome wants it dead; he wants it safe.',
        [
          { id: 'protect', label: `Protect it (${dn(100)})`, cost: 100, desc: 'Agiad joins your ludus.' },
          { id: 'betray', label: 'Hand it over to the authorities', cost: -200, desc: '+200 denarii, +10 influence.' },
        ], {}, 'quest');
    },
    resolve(s, d, o) {
      s.world.flags.spartaDone = true;
      payOption(s, d, o);
      if (optId(d, o) === 'betray') return { text: `The Agiad and the old man are burned on a pyre on the public square of Capua. +${dn(200)}, +${infl(s, 10)} influence.` };
      const c = makeAgiad(s);
      me(s).creatures.push(c);
      return { text: `${full(c)} joins your ludus. It looks at you as if it has been waiting for you.` };
    },
  },

  // ==================================================================== Restoration of Troy: the escort
  {
    key: 'troyEscort',
    make(s) {
      if (!hasUpgrade(s, 'restorationOfTroy') || wk(s) < 10 || num(s, 'troyStage') !== 0 || onAdv(s, 'troyEscort') || hasDelayed(s, 'troyGuards')) return null;
      const fame = me(s).creatures.reduce((a, c) => a + c.fame, 0);
      if (fame < 150) return null;
      const c = champion(s);
      return decide(s, 'troyEscort', 'A Trojan nobleman',
        'A nobleman claiming descent from the royal house of Troy asks for an escort to Capua. He is hunted, he says, by men who want Troy to stay dead. He speaks of restoring it.',
        [
          { id: 'guards', label: `Hire guards for him (${dn(250)})`, cost: 250, desc: 'They may or may not be enough.' },
          { id: 'champ', label: c ? `Send ${cname(c)} (2 weeks)` : 'Send your champion', need: req(!!c, 'Nobody fit to go.'), desc: 'His bodyguard Hector will fight beside it.' },
          { id: 'refuse', label: 'Troy fell. Let it lie.' },
        ], { cid: c?.id }, 'troy');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'refuse') return { text: 'The nobleman bows and goes on alone.' };
      if (id === 'guards') {
        payOption(s, d, o);
        schedule(s, 'troyGuards', 2, {});
        return { text: 'Six hired spears march off with the nobleman.' };
      }
      const c = stillOrChampion(s, d.data.cid);
      if (!c) return { text: 'Nobody is fit to go.' };
      sendOnAdventure(s, 'troyEscort', [c.id], 2);
      return { text: `${cname(c)} sets off with the nobleman and his bodyguard, a tall man called Hector.` };
    },
  },
];

/** Agiad: a Spartan-bred Ankylosaurus of the Agiad line. */
export function makeAgiad(s: GameState): Creature {
  const c = generateDino({ species: 'ankylosaurus', week: wk(s), level: Math.max(3, Math.round(foeLevel(s) * 0.9)), sex: 'M', bonusWild: 6 });
  c.name = 'Agiad';
  c.legend = 'agiad';
  c.maturity = 1;
  c.adultWeeks = Math.max(c.adultWeeks, 20);
  c.ageWeeks = Math.max(c.ageWeeks, 34);
  c.cls = 'phalanx';
  c.classXp = Math.max(c.classXp, 9);
  addTrait(c, 'SpartanResolve');
  addTrait(c, 'Veteran');
  c.loyalty = 90;
  c.fame = Math.max(c.fame, 30);
  return c;
}

// ---------------------------------------------------------------------------
// Delayed outcomes
// ---------------------------------------------------------------------------

export const QUEST_DELAYED: Record<string, DelayedHandler> = {
  hannibalInfo(s) {
    const c = rank(fitDinos(s))[0];
    if (!c) {
      message(s, 'spy', "Hannibal's legacy", 'Your spies found the merchant in Carthage, but nobody in your ludus is fit to make the journey.');
      return;
    }
    const d = decide(s, 'hannibalReport', "Hannibal's legacy: the spies report",
      'Your spies are back from the port: they know the merchant\'s tent, his guards, and the hour he sleeps. The journey will be shorter now.',
      [
        { id: 'send', label: `Send ${cname(c)} to Carthage (${hannibalWeeks(c, true)} weeks)` },
        { id: 'refuse', label: 'Leave it' },
      ], { cid: c.id }, 'quest');
    s.player.decisions.push(d);
    message(s, 'spy', "Hannibal's legacy", 'Your spies have returned from the port with news of the merchant.');
  },
  romulusSpies(s) {
    addKeepers(me(s), 2, 'spies');
    const got = infl(s, 5);
    s.world.flags.romulusStage = 1;
    message(s, 'spy', 'The scrolls of Romulus', `Your two spies are back from the temple library with the scrolls under their robes. +${got} influence for the scholarship.`);
    report(s, 'good', 'Your spies stole the scrolls of Romulus.');
  },
  troyGuards(s) {
    const ok = chance(0.7);
    s.world.flags.troyStage = ok ? 1 : -1;
    const text = ok
      ? 'The Trojan nobleman reached Capua safely. His bodyguard, Hector, sends his thanks and says you will hear from him.'
      : 'The hired guards ran at the first sight of the assassins. The nobleman died on the road, and with him his dreams of a restored Troy.';
    message(s, 'assistant', 'The Trojan nobleman', text);
    report(s, ok ? 'good' : 'bad', text);
  },
};

