// Status-specific decision events (GM 04 §6.3, 05 §3.4 and §3.7): Senate proposals, election campaign,
// Consul, the Tartarus underworld attacks, and the auction machinery (02 §11.5). OWNER: systems-story agent.

import type { Augment, Creature, Decision, GameState, Gear, GearTypeId, Ludus, Quality } from '../types';
import type { EventDef } from '../events';
import { chance, coin, pick, rand } from '../rng';
import { activeRivals, asc, ASC, message, newId, report, visibleRivals } from '../util';
import { addTrait } from '../creature';
import { gearWorth, gearName, makeGear, UNIQUES } from './gear';
import { addKeepers, addInfluence, loseKeepers } from '../economy';
import { changeOpinion } from '../rivals';
import { markFate } from '../breeding';
import { sendOnAdventure, adventureFoes } from '../adventures';
import {
  type DelayedHandler, champion, cname, decide, dinoFoe, dn, earn, fitOf, giveGear, infl, injure, isConsul, keepers, L,
  me, optId, payOption, princeps, rank, req, schedule, stillOrChampion, streetFight, tameAll, wk,
} from './eventsDataKit';

const election = (s: GameState) => s.player.election;
const campaignWeek = (s: GameState): number => (s.player.election ? s.world.week - s.player.election.startWeek : -1);
const mining = (s: GameState, d: number): void => {
  me(s).miningBonus = Math.max(-9, me(s).miningBonus + d);
};
const totalWorth = (h: Ludus): number => h.creatures.reduce((a, c) => a + c.level * 10 + c.fame, 0);

// ---------------------------------------------------------------------------
// Auctions (02 §11.5): opening bid 200; raise +100 (+200 above 500); a rich rival counters ×1.5,
// otherwise a Greek collector may bid rand(25)×100; if nobody counters you win at your bid.
// Each raise re-queues a follow-up decision ('auctionBid').
// ---------------------------------------------------------------------------

export interface AuctionLot {
  type: GearTypeId;
  quality: Quality;
  augment?: Augment;
  unique?: string;
  name: string;
  worth: number;
  /** world flag set once the lot is gone (won, sold or taken) */
  flag?: string;
}

export function lotOf(g: Gear, flag?: string): AuctionLot {
  return { type: g.type, quality: g.quality, augment: g.augment, unique: g.unique, name: gearName(g), worth: gearWorth(g), flag };
}

export function uniqueLot(key: string, flag?: string): AuctionLot {
  const u = UNIQUES[key];
  return lotOf(makeGear(u.base, u.quality, 'lot', { unique: key }), flag);
}

function lotGear(lot: AuctionLot): Gear {
  const extra: Partial<Gear> = {};
  if (lot.augment) extra.augment = lot.augment;
  if (lot.unique) extra.unique = lot.unique;
  return makeGear(lot.type, lot.quality, newId('g'), extra);
}

const nextBid = (bid: number): number => (bid <= 0 ? 200 : bid + (bid > 500 ? 200 : 100));

function bidDecision(s: GameState, lot: AuctionLot, bid: number, high: string, highName: string): Decision {
  const raise = nextBid(bid);
  return decide(s, 'auctionBid', `Auction: ${lot.name}`,
    `${highName} bids ${dn(bid)} for the ${lot.name}. The auctioneer looks at you.`,
    [
      { id: 'raise', label: `Raise to ${dn(raise)}`, cost: raise },
      { id: 'quit', label: 'This is madness!' },
    ], { lot, bid, high, highName, raise }, 'auction');
}

/** The player bids `amount`: rivals or the collector may counter, otherwise the player wins. */
export function placeBid(s: GameState, lot: AuctionLot, amount: number): { text: string } {
  const rivals = visibleRivals(s).filter((r) => r.denarii > 3 * amount && (lot.worth * 2 > amount || coin()));
  if (rivals.length) {
    const r = pick(rivals);
    const counter = Math.floor(amount * 1.5);
    s.player.decisions.push(bidDecision(s, lot, counter, r.id, r.name));
    return { text: `You bid ${dn(amount)}. ${r.name} immediately counters with ${dn(counter)}.` };
  }
  const collector = rand(25) * 100;
  if (collector > amount) {
    s.player.decisions.push(bidDecision(s, lot, collector, 'collector', 'A Greek collector'));
    return { text: `You bid ${dn(amount)}. A Greek collector at the back raises to ${dn(collector)}.` };
  }
  me(s).denarii -= amount;
  me(s).armory.push(lotGear(lot));
  if (lot.flag) s.world.flags[lot.flag] = true;
  return { text: `Nobody bids higher. The ${lot.name} is yours for ${dn(amount)}.` };
}

/** Opening decision for an auction lot (attending needs ≥ 100 denarii). */
export function auctionDecision(s: GameState, key: string, title: string, text: string, lot: AuctionLot, extra: { id: string; label: string; desc?: string }[] = []): Decision {
  return decide(s, key, title, `${text} Bidding opens at ${dn(200)}.`,
    [
      { id: 'bid', label: `Bid ${dn(200)}`, cost: 200, need: req(me(s).denarii >= 100, 'You need at least 100 denarii to attend.') },
      ...extra,
      { id: 'skip', label: 'Stay away' },
    ], { lot }, 'auction');
}

function lotLost(s: GameState, lot: AuctionLot, high: string, bid: number): string {
  if (lot.flag) s.world.flags[lot.flag] = true;
  const r = s.rivals.find((x) => x.id === high && !x.defeated);
  if (r) {
    r.denarii -= bid;
    r.armory.push(lotGear(lot));
    return `${r.name} takes the ${lot.name} home for ${dn(bid)}.`;
  }
  return `The ${lot.name} sails to Greece with the collector.`;
}

const BLESSED: GearTypeId[] = ['bronzeFrillGuard', 'frillGuard', 'hideShield', 'bronzeBarding', 'bronzeMuzzle', 'carthaginianCrest', 'hornedHelm', 'lightHarness', 'studdedBarding'];

/** GM random master-crafted Blessed lot. */
export function blessedLot(): AuctionLot {
  return lotOf(makeGear(pick(BLESSED), 4, 'lot', { augment: 'Blessed' }));
}

// ---------------------------------------------------------------------------
// Monster trophy (Tartarus)
// ---------------------------------------------------------------------------

function upgradeTrophy(s: GameState): string {
  const h = me(s);
  const g = h.armory.find((x) => x.type === 'monsterTrophy');
  if (!g) {
    giveGear(s, 'monsterTrophy', 1, { state: 1 });
    return 'You mount the monster\'s head as a trophy.';
  }
  g.quality = Math.min(5, g.quality + 1) as Quality;
  g.state = (g.state ?? 0) + 1;
  return 'Your Monster Trophy grows more fearsome.';
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const POLITICS_EVENTS: EventDef[] = [
  // ==================================================================== Auction follow-up
  {
    key: 'auctionBid', followUp: true,
    make: () => null,
    resolve(s, d, o) {
      const lot = d.data.lot as AuctionLot;
      if (optId(d, o) === 'quit') return { text: `"This is madness!" you cry, and leave. ${lotLost(s, lot, d.data.high, d.data.bid)}` };
      return placeBid(s, lot, d.data.raise);
    },
    onExpire(s, d) {
      const lot = d.data.lot as AuctionLot;
      lotLost(s, lot, d.data.high, d.data.bid);
    },
  },

  // ==================================================================== Senator: Public ludus funding
  {
    key: 'publicFunding',
    make(s) {
      if (!s.player.senator || s.world.laws.publicFunding) return null;
      return decide(s, 'publicFunding', 'Senate proposal: public ludus funding',
        'A tribune proposes that the treasury pay every ludus in Capua 500 denarii every four weeks "for the glory of the games". Your rivals would get it too.',
        [
          { id: 'for', label: 'Vote for', desc: `−10 influence. Likely to pass${princeps(s) ? ' (your word as Princeps carries weight)' : ''}.` },
          { id: 'against', label: 'Vote against', desc: '−5 influence. It will probably fail.' },
          { id: 'abstain', label: 'Abstain' },
        ], {}, 'senate');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      let power = -1;
      if (id === 'for') {
        infl(s, -10);
        power = princeps(s) ? 10 : 5;
      } else if (id === 'against') {
        infl(s, -5);
        power = -4;
      }
      const passed = rand(power + 10) > 4;
      if (passed) s.world.laws.publicFunding = true;
      return { text: passed ? 'The law passes. Every ludus will receive 500 denarii every fourth week.' : 'The proposal fails. The treasury breathes again.' };
    },
  },

  // ==================================================================== Senator: Bread and games
  {
    key: 'breadAndGames',
    make(s) {
      if (!s.player.senator) return null;
      const p = princeps(s);
      return decide(s, 'breadAndGames', 'Senate proposal: bread and games',
        'The plebs are restless and the price of grain is rising. Your colleagues look to you for a solution.',
        [
          { id: 'games', label: p ? `Host Poseidon's blessing (${dn(250)})` : `Organise games (${dn(250)})`, cost: 250, desc: p ? 'A tournament in your name with a legendary trident as the prize.' : '+10 influence.' },
          { id: 'tax', label: `Tax the wealthy (${dn(100)})`, cost: 100, desc: '+10 influence.' },
          { id: 'reject', label: 'Let them eat grass', desc: '−10 influence.' },
        ], {}, 'senate');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      payOption(s, d, o);
      if (id === 'games') {
        if (princeps(s)) {
          s.world.flags.poseidonWeek = wk(s) + 4;
          return { text: "Poseidon's blessing will be held in four weeks, under your name. The prize: a legendary trident." };
        }
        s.world.flags.breadGamesWeek = wk(s) + 3;
        return { text: `The plebs cheer your name in the streets. +${infl(s, 10)} influence.` };
      }
      if (id === 'tax') return { text: `The wealthy (you included) pay for the bread. +${infl(s, 10)} influence.` };
      return { text: `The plebs throw rotten figs at your litter (${infl(s, -10)} influence).` };
    },
  },

  // ==================================================================== Senator: state artifact auction
  {
    key: 'stateArtifactAuction',
    make(s) {
      if (!s.player.senator) return null;
      const lot = blessedLot();
      return auctionDecision(s, 'stateArtifactAuction', 'Auction of a state artifact',
        `The treasury is selling a ${lot.name} from the temple stores to pay for a new road.`, lot,
        [{ id: 'safe', label: 'Propose to keep it safe in the temple', desc: '+5 influence.' }]);
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'bid') return placeBid(s, d.data.lot, 200);
      if (id === 'safe') return { text: `The artifact stays in the temple, and the priests remember your piety. +${infl(s, 5)} influence.` };
      return { text: 'The auction goes ahead without you.' };
    },
  },

  // ==================================================================== Senator: ludus school equalizing
  {
    key: 'schoolEqualizing',
    make(s) {
      if (!s.player.senator || s.player.consul) return null;
      const h = me(s);
      const vis = visibleRivals(s);
      if (!vis.length) return null;
      const mine = totalWorth(h);
      if (!vis.every((r) => r.influence * 2 <= h.influence && totalWorth(r) < mine)) return null;
      return decide(s, 'schoolEqualizing', 'Senate proposal: ludus equalizing',
        'Your rivals, jealous of your success, propose that the strongest ludus in Capua share its keepers and coin with the others "for the sake of fair games".',
        [
          { id: 'veto', label: 'Whip the vote as Princeps', need: req(princeps(s), 'Only the Princeps Senatus can.'), desc: '−5 influence; the proposal dies.' },
          { id: 'against', label: 'Vote against', desc: '−25 influence; it may pass anyway.' },
          { id: 'filibuster', label: 'Filibuster until sunset', desc: '−100 influence; the vote is cancelled.' },
        ], {}, 'senate');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'veto') return { text: `The proposal dies in committee. ${infl(s, -5)} influence.` };
      if (id === 'filibuster') return { text: `You talk about grain prices until the sun sets and the vote is cancelled (${infl(s, -100)} influence).` };
      infl(s, -25);
      // GM made the redistribution pass every time; here voting against fails it half of the time
      if (coin()) return { text: 'Your speech carries the day: the proposal fails. −25 influence for the favours it cost.' };
      const h = me(s);
      const k = Math.min(20, keepers(h));
      const coins = Math.min(1000, Math.max(0, h.denarii));
      if (k) loseKeepers(s, h, k);
      h.denarii -= coins;
      for (const r of activeRivals(s)) {
        addKeepers(r, 3);
        r.denarii += 200;
      }
      return { text: `The vote passed despite your best efforts. You lose ${k} keepers and ${dn(coins)}; every rival gains 3 keepers and 200 denarii.` };
    },
  },

  // ==================================================================== Campaign: popular candidate
  {
    key: 'popularCandidate', campaign: true,
    make(s) {
      if (!election(s) || campaignWeek(s) >= 4) return null;
      const champ = champion(s);
      return decide(s, 'popularCandidate', 'A popular candidate joins the race',
        'A smooth-talking candidate has joined the race, promising free bread and a dino in every household. The plebs adore him.',
        [
          { id: 'kill', label: champ ? `Send ${cname(champ)} to have a word with him` : 'Send your champion', need: req(!!champ, 'Nobody fit to go.'), desc: 'Fight his guards: +20 influence and Assassin.' },
          { id: 'match', label: `Match his promises (${dn(200)})`, cost: 200 },
          { id: 'ignore', label: 'Ignore him', desc: '−10 influence.' },
        ], { champ: champ?.id }, 'senate');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      if (id === 'match') {
        payOption(s, d, o);
        return { text: 'You promise two dinos in every household. The plebs are confused but delighted.' };
      }
      if (id === 'kill') {
        const c = stillOrChampion(s, d.data.champ);
        if (c) {
          sendOnAdventure(s, 'electionRival', [c.id], 1);
          return { text: `${cname(c)} slips out after dark.` };
        }
      }
      return { text: `The candidate eats into your votes (${infl(s, -10)} influence).` };
    },
  },

  // ==================================================================== Campaign: political sponsor
  {
    key: 'politicalSponsor', campaign: true,
    make(s) {
      if (!election(s)) return null;
      return decide(s, 'politicalSponsor', 'A political sponsor',
        'A merchant guild offers to fund your campaign. Their price is a law or two in their favour, or a tax on their rivals.',
        [
          { id: 'reject', label: 'Reject them' },
          { id: 'tax', label: `Campaign on taxing merchants (${dn(200)})`, cost: 200, desc: '+20 influence; −20% mining and −5 denarii a week from their revenge.' },
          { id: 'take', label: 'Take their 500 denarii', cost: -500, desc: '−30 influence.' },
        ], {}, 'senate');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      payOption(s, d, o);
      if (id === 'tax') {
        mining(s, -2);
        me(s).projected -= 5;
        return { text: `The plebs love it. The merchants do not, and they own your ore buyers. +${infl(s, 20)} influence.` };
      }
      if (id === 'take') return { text: `+${dn(500)}. Everyone knows whose candidate you are now (${infl(s, -30)} influence).` };
      return { text: 'The guild finds another candidate.' };
    },
  },

  // ==================================================================== Campaign: call in favours
  {
    key: 'callInFavours', campaign: true,
    make(s) {
      const e = election(s);
      if (!e || campaignWeek(s) < 4 || e.votes >= 100) return null;
      return decide(s, 'callInFavours', 'Call in favours',
        'The vote is close. Your agents could promise anything to anyone, and collect the bill later.',
        [
          { id: 'promise', label: 'Make empty promises', desc: '+30 influence now, −50 in five weeks.' },
          { id: 'honest', label: 'Run an honest campaign', desc: '−10 influence.' },
        ], {}, 'senate');
    },
    resolve(s, d, o) {
      if (optId(d, o) === 'promise') {
        const got = infl(s, 30);
        schedule(s, 'emptyPromises', 5, { amount: 50 });
        return { text: `Promises are cheap, until they are due. +${got} influence.` };
      }
      return { text: `Honesty is admired, briefly (${infl(s, -10)} influence).` };
    },
  },

  // ==================================================================== Campaign: ambush!
  {
    key: 'electionAmbush', campaign: true,
    make(s) {
      if (!election(s)) return null;
      const champ = champion(s);
      return decide(s, 'electionAmbush', 'Ambush!',
        'Thugs in the pay of your opponent block the street on your way home from the forum, with a ruffian and a mercenary leading the dinos.',
        [
          { id: 'fight', label: champ ? `${cname(champ)}, protect me!` : 'Fight', need: req(!!champ, 'You have no bodyguard fit to fight.'), desc: 'Stake: 15 influence.' },
          { id: 'talk', label: 'Talk your way out', desc: 'Lose up to 200 denarii, −20 influence, and your clothes.' },
          { id: 'run', label: 'Run', desc: champ ? '−10 influence.' : '−30 influence.' },
        ], { champ: champ?.id }, 'ambush');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const champ = stillOrChampion(s, d.data.champ);
      if (id === 'fight' && champ) {
        const foes = [
          dinoFoe(s, 'allosaurus', "Ruffian's Allosaurus", { gear: [L('tailClub', 2), L('studdedBarding', 1)] }),
          dinoFoe(s, 'carnotaurus', "Mercenary's Carnotaurus", { gear: [L('hornLance', 2), L('bronzeMuzzle', 1)] }),
        ];
        const f = streetFight(s, { title: 'Election ambush', fighters: [champ], foes, foeName: 'the thugs', stake: 15, allies: true });
        return { text: f.won ? `The thugs scatter. Your supporters cheer. ${f.text}` : `You crawl home bruised. ${f.text}`, battle: f.battle };
      }
      if (id === 'talk') {
        const loss = Math.min(200, Math.max(0, me(s).denarii));
        me(s).denarii -= loss;
        infl(s, -20);
        return { text: `You talk, they listen, they take ${dn(loss)} and your toga. You walk home in a loincloth, waving at voters. −20 influence.` };
      }
      return { text: `You run. Capua saw you run (${infl(s, champ ? -10 : -30)} influence).` };
    },
  },

  // ==================================================================== Consul: uphold the law
  {
    key: 'upholdTheLaw',
    make(s) {
      if (!isConsul(s)) return null;
      const found = caughtAgent(s);
      if (!found) return null;
      const { agent, house } = found;
      const crocs = me(s).creatures.some((c) => c.species === 'sarcosuchus');
      return decide(s, 'upholdTheLaw', 'Uphold the law',
        `Your lictors have dragged in ${cname(agent)}, a dino of ${house.name} caught working against your house. As Consul, its fate is yours to decide.`,
        [
          { id: 'lash', label: 'Twenty lashings', desc: `${house.name} will hear its howls.` },
          { id: 'execute', label: 'Execute it in the forum', desc: `It dies; ${house.name} is outraged.` },
          { id: 'croc', label: 'Feed it to the Sarcosuchus', need: req(crocs, 'You need a Sarcosuchus.'), desc: '+10 influence, +15 tameness for your pack.' },
          { id: 'beneath', label: 'Beneath my station', desc: '+10 influence.' },
        ], { agent: agent.id, house: house.id }, 'consul');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      me(s).caught = me(s).caught.filter((x) => x !== d.data.agent);
      const house = s.rivals.find((r) => r.id === d.data.house);
      const agent = house?.creatures.find((c) => c.id === d.data.agent);
      if (!house || !agent) return { text: 'The prisoner has already been released by some fool of a magistrate.' };
      if (id === 'beneath') return { text: `You wave the matter away. Capua admires a Consul above petty revenge. +${infl(s, 10)} influence.` };
      if (id === 'lash') {
        injure(agent, 3);
        changeOpinion(s, house, -5);
        return { text: `Twenty lashings in the forum. ${cname(agent)} is returned to ${house.name}, limping.` };
      }
      house.creatures = house.creatures.filter((c) => c.id !== agent.id);
      house.pairs = house.pairs.filter((p) => p.maleId !== agent.id && p.femaleId !== agent.id);
      markFate(s, agent, id === 'croc' ? 'Fed to a Sarcosuchus by order of the Consul' : 'Executed by order of the Consul');
      if (id === 'croc') {
        for (const c of me(s).creatures) if (c.species === 'sarcosuchus') addTrait(c, 'ManEater');
        tameAll(s, 15);
        changeOpinion(s, house, -10);
        return { text: `${cname(agent)} goes into the Sarcosuchus pen. Your own pack watches very carefully (+15 tameness). +${infl(s, 10)} influence.` };
      }
      changeOpinion(s, house, -20);
      const how = coin() ? '"It will be buried alive!"' : '"Nail it to the cross!"';
      return { text: `${how} ${cname(agent)} of ${house.name} is executed before the crowd.` };
    },
  },

  // ==================================================================== Tartarus: horrors from the underworld (priority)
  {
    key: 'underworld', priority: true,
    make(s) {
      const w = wk(s);
      if (!asc(s, ASC.tartarus) || w <= 10 || (w - 10) % 20 !== 0) return null;
      const team = rank(fitOf(me(s)));
      const bar = 2 * w + 50;
      return decide(s, 'underworld', 'Horrors from the underworld',
        'Pits have opened in the hills around Capua, and nightmarish creatures venture forth from them at night. Something is scratching at your gate.',
        [
          { id: 'defend', label: 'Defend the ludus', need: req(team.length > 0, 'Nobody fit to fight.'), desc: 'Your best face the lesser horrors. Win: +5 influence and a Monster Trophy.' },
          { id: 'hunt', label: 'Hunt the worst of them', need: req(team.length > 0, 'Nobody fit to fight.'), desc: 'Your best three against the terrors of Tartarus. Win: +10 influence and a Monster Trophy; lose: −100 influence.' },
          { id: 'bar', label: 'Bar the gates', desc: `A keeper is taken; −${bar} influence for cowering.` },
        ], { bar }, 'underworld');
    },
    resolve(s, d, o) {
      const id = optId(d, o);
      const team = rank(fitOf(me(s)));
      if (id === 'bar' || !team.length) {
        loseKeepers(s, me(s), 1);
        // GM bug fixed: barring the gates costs influence instead of granting it
        const got = infl(s, -(d.data.bar ?? 2 * wk(s) + 50));
        return { text: `You bar the gates. In the morning a keeper is missing and the gate is scored with claw marks. ${got} influence.` };
      }
      if (id === 'defend') {
        const foes = [...adventureFoes(s, 'underworldWeak'), ...adventureFoes(s, 'underworldWeak')];
        const f = streetFight(s, { title: 'Horrors from the underworld', fighters: team.slice(0, 2), foes, foeName: 'the horrors', stake: 5, allies: true, deathCause: 'Killed by a horror from the underworld' });
        return { text: f.won ? `The horrors are driven back into the pits. ${upgradeTrophy(s)} ${f.text}` : `The horrors ravage the pens before dawn drives them off. ${f.text}`, battle: f.battle };
      }
      const n = wk(s) >= 50 ? 1 : 2;
      const foes = Array.from({ length: n }, () => adventureFoes(s, 'underworldStrong')[0]);
      const f = streetFight(s, { title: 'Hunting the terrors of Tartarus', fighters: team.slice(0, 3), foes, foeName: 'the terrors of Tartarus', stake: 10, lossInfluence: -100, deathCause: 'Killed hunting the terrors of Tartarus' });
      return { text: f.won ? `Your hunters bring back the head of the worst of them. ${upgradeTrophy(s)} ${f.text}` : `The hunt was a massacre. Capua mocks the lanista who went looking for Tartarus. ${f.text}`, battle: f.battle };
    },
  },
];

function caughtAgent(s: GameState): { agent: Creature; house: Ludus } | undefined {
  for (const id of me(s).caught) {
    for (const r of activeRivals(s)) {
      const c = r.creatures.find((x) => x.id === id);
      if (c) return { agent: c, house: r };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Delayed outcomes
// ---------------------------------------------------------------------------

export const POLITICS_DELAYED: Record<string, DelayedHandler> = {
  emptyPromises(s, data) {
    const got = infl(s, -(data.amount ?? 50));
    message(s, 'magistrate', 'Promises come due', `The people you made promises to have come to collect. They are disappointed (${got} influence).`);
    report(s, 'bad', `Empty campaign promises came due: ${got} influence.`);
  },
};

