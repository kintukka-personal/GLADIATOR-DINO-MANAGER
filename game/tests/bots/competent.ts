// A competent, cautious player for balance sweeps. It follows the opening the Gladiator Manager teardown
// recommends (docs §9): a starter plus the cheap wolf, miners first, enter every tournament (fees are never
// charged), "avoid injury" on stars, reward low-tameness fighters, keep a cash reserve and sell before the
// books go red. It is not clever: no intrigue, no bribes, no breeding. A run it survives is a run a
// thoughtful newcomer can survive.
import type { Creature, Decision, GameState, GearSlot, Ludus } from '../../src/engine/types';
import { beginAdvance, completeWeek } from '../../src/engine/week';
import { attendedTournament, nextPlayerMatch, playMatch, continueBonus, eligibility, register } from '../../src/engine/tournaments';
import { buyCreature, buyGear, marketGearPrice, sellCreature, sellGear } from '../../src/engine/market';
import { assignGear, learnTech, setDoctore, spendPoint, wearerOf } from '../../src/engine/care';
import { GEAR, gearLine } from '../../src/engine/data/gear';
import { buildingTotals, build, canBuild } from '../../src/engine/buildings';
import { assignKeepers, hireKeepers, keeperCount, securityTotal, weeklyNet } from '../../src/engine/economy';
import { resolveDecision } from '../../src/engine/events';
import { activeConversation, answerConversation } from '../../src/engine/stories';
import { resolveDefense } from '../../src/engine/intrigue';
import { pendingAdventures, resolveAdventure } from '../../src/engine/adventures';
import { rewardCreature } from '../../src/engine/loyalty';
import { expeditionPreview, hordeSize, maxExpeditionKeepers, raidArmyVsPlayer, resolveExpedition, startExpedition } from '../../src/engine/horde';
import { cheatAvailable, cheatCost } from '../../src/engine/bribes';
import { prizeFor } from '../../src/engine/tournaments';
import { canFight, getStats, hasTrait, isLearnable, knownTech, marketPrice, meetsRequirement } from '../../src/engine/creature';
import { LEARNABLE } from '../../src/engine/data/techniques';

export interface BotLog { week: number; text: string }

function gearPower(h: Ludus, c: Creature): number {
  let p = 0;
  for (const s of ['weapon', 'offhand', 'armor', 'helmet'] as const) {
    const id = c.gear[s];
    const g = id ? h.armory.find((x) => x.id === id) : undefined;
    if (!g) continue;
    const l = gearLine(g);
    p += l.dmg * 2.5 + l.blk * 1.5 + l.dr * 2 + l.reach * 0.6 + l.str * 1.5 + l.agi * 1.2 + l.hp / 4;
  }
  return p;
}

/** Rough fighting power used to pick teams and judge purchases. */
export function power(h: Ludus | null, c: Creature): number {
  const s = getStats(c);
  return s.str * 1.5 + s.agi * 1.3 + s.cun * 0.5 + s.hp / 3 + c.level * 1.5 + (h ? gearPower(h, c) : 0);
}

const reserve = (state: GameState) => 150 + Math.min(350, state.world.week * 5);

function answerDecisions(state: GameState): void {
  const h = state.player.ludus;
  for (const d of [...state.player.decisions]) {
    if (d.key === 'rebelRaid') { resolveDecision(state, d.id, raidChoice(state, d)); continue; }
    // keepers are worth more than their ransom or rescue: a miner earns ~8 a week and costs ~100 to replace
    const save = ({ keepersAbducted: 'ransom', mineCollapse: 'rescue' } as Record<string, string>)[d.key];
    const si = save ? (d.data?.ids as string[] | undefined ?? []).findIndex((id, i) => id === save && !d.options[i]?.disabled) : -1;
    if (si >= 0 && h.denarii - ((d.data?.costs ?? [])[si] ?? 0) > 50) { resolveDecision(state, d.id, si); continue; }
    const costs: number[] = d.data?.costs ?? d.options.map(() => 0);
    let best = -1;
    d.options.forEach((o, i) => {
      if (o.disabled) return;
      // a careful lanista keeps a reserve: never pick an option that would empty the strongbox
      if ((costs[i] ?? 0) > 0 && h.denarii - (costs[i] ?? 0) < reserve(state) / 2) return;
      if (best < 0 || (costs[i] ?? 0) < (costs[best] ?? 0)) best = i;
    });
    if (best < 0) best = Math.max(0, d.options.findIndex((o) => !o.disabled));
    resolveDecision(state, d.id, best);
  }
  for (let i = 0; i < 5; i++) {
    const c = activeConversation(state);
    if (!c) break;
    answerConversation(state, c.id, Math.max(0, c.options.findIndex((o) => !o.disabled)));
  }
  for (const d of [...state.player.defenses]) resolveDefense(state, d.id, 'passive');
  for (const a of pendingAdventures(state)) resolveAdventure(state, a.adventure.id, 0);
}

function raidChoice(state: GameState, d: Decision): number {
  const h = state.player.ludus;
  const danger: number = d.data?.danger ?? 0;
  const cost: number = d.data?.cost ?? 0;
  const fightable = !d.options[0]?.disabled;
  const best = Math.max(0, ...h.creatures.filter((c) => canFight(c) && !c.away).map((c) => power(h, c)));
  // fight when the champion is strong and the danger low; pay when it is cheap; otherwise hide
  if (fightable && danger <= 0 && best > 40) return 0;
  if (!d.options[1]?.disabled && cost <= Math.max(60, h.denarii / (danger > 0 ? 2 : 3))) return 1;
  if (fightable && best > 55) return 0;
  return 2;
}

function manageKeepers(state: GameState): void {
  const h = state.player.ludus;
  const beds = buildingTotals(h).beds;
  const m = state.world.market.keepers;
  // keepers before more dinos: a miner pays for itself in ~12 weeks (docs §9)
  for (let i = 0; i < 4; i++) {
    if (m.count <= 0 || keeperCount(h) >= beds || h.denarii <= reserve(state) / 2 + m.price || weeklyNet(state, h) < -40) break;
    if (hireKeepers(state, 1)) break;
  }
  const k = keeperCount(h);
  // enough wardens that a raid finds no opening (danger = army − (roster/2 + security))
  const roster = h.creatures.filter((c) => !c.away).length;
  const wantWardens = Math.min(Math.ceil(k * Number(process.env.JL_WSHARE ?? 0.5)), Math.max(1, raidArmyVsPlayer(state) - Math.floor(roster / 2) + 1));
  // showmen: influence gates every building (Residence needs 25)
  const wantShowmen = Math.min(Math.ceil(k * 0.3), 2 + Math.floor(state.world.week / 15));
  if (h.keepers.wardens < wantWardens && h.keepers.miners > 3) assignKeepers(state, h, 'wardens', Math.min(wantWardens - h.keepers.wardens, h.keepers.miners - 3), 'miners');
  while (h.keepers.unassigned > 0) {
    const job = h.keepers.miners < 4 ? 'miners' : h.keepers.showmen < Math.min(2, wantShowmen) ? 'showmen'
      : h.keepers.wardens < wantWardens ? 'wardens' : h.keepers.showmen < wantShowmen ? 'showmen' : 'miners';
    if (!assignKeepers(state, h, job, 1)) break;
  }
}

function manageBuildings(state: GameState): void {
  const h = state.player.ludus;
  const dinos = h.creatures.filter((c) => c.kind === 'dino').length;
  const order: (Parameters<typeof canBuild>[2])[] = [];
  if (h.keepers.miners >= 4) order.push('mine');
  if (dinos >= 3) order.push('trainingField');
  if (keeperCount(h) >= buildingTotals(h).beds - 2) order.push('residence');
  if (hordeSize(state) > 6) order.push('palisade');
  order.push('veterinarium', 'trainingField', 'residence', 'mine');
  for (const b of order) {
    const chk = canBuild(state, h, b);
    if (chk.ok && h.denarii - chk.cost > reserve(state) + 100) { build(state, h, b); return; }
  }
}

function fighters(h: Ludus): Creature[] {
  return h.creatures.filter((c) => c.maturity >= 1 && !c.away);
}

function buyDinos(state: GameState): void {
  const h = state.player.ludus;
  const m = state.world.market.creatures;
  if (state.world.week === 1) {
    // GM opening: a starter legend and the 100-denarii wolf
    const starter = m.find((c) => c.name === 'Tetraites') ?? m.find((c) => c.name === 'Flamma');
    const wolf = m.find((c) => c.name === 'Aello');
    if (starter && h.denarii >= marketPrice(starter) + 300) buyCreature(state, starter.id);
    if (wolf && h.denarii >= marketPrice(wolf) + 250) buyCreature(state, wolf.id);
  }
  const cap = Math.max(2, buildingTotals(h).facilities + 1);
  const net = weeklyNet(state, h);
  // always keep two fighters at home: an empty pen invites the Horde
  if (fighters(h).length >= cap || (net < 0 && fighters(h).length >= 2)) return;
  const budget = h.denarii - reserve(state) - 100;
  const pick = m.filter((c) => c.maturity >= 1 && !c.injury && marketPrice(c) <= budget)
    .sort((a, b) => power(null, b) / Math.sqrt(marketPrice(b)) - power(null, a) / Math.sqrt(marketPrice(a)))[0];
  if (pick && power(null, pick) > 30) buyCreature(state, pick.id);
}

function buyAndAssignGear(state: GameState): void {
  const h = state.player.ludus;
  const slots: GearSlot[] = ['weapon', 'armor', 'helmet'];
  const dinos = fighters(h).filter((c) => c.kind === 'dino').sort((a, b) => power(h, b) - power(h, a));
  const lineScore = (g: Parameters<typeof gearLine>[0]) => { const l = gearLine(g); return l.dmg * 3 + l.blk * 2 + l.dr * 2 + l.reach + l.agi + l.str; };
  for (const c of dinos) {
    for (const slot of slots) {
      const cur = c.gear[slot] ? h.armory.find((g) => g.id === c.gear[slot]) : undefined;
      const spare = h.armory.filter((g) => GEAR[g.type].slot === slot && !wearerOf(h, g.id) && !GEAR[g.type].effects.includes('TwoHandedOnly'))
        .sort((a, b) => lineScore(b) - lineScore(a))[0];
      if (spare && (!cur || lineScore(spare) > lineScore(cur))) { assignGear(state, c.id, slot, spare.id); continue; }
      if (cur) continue;
      const offer = state.world.market.gear
        .filter((g) => GEAR[g.type].slot === slot && !GEAR[g.type].effects.includes('TwoHandedOnly'))
        .filter((g) => marketGearPrice(state, g) <= h.denarii - reserve(state) - 50)
        .sort((a, b) => lineScore(b) / Math.sqrt(marketGearPrice(state, b) + 20) - lineScore(a) / Math.sqrt(marketGearPrice(state, a) + 20))[0];
      if (offer && !buyGear(state, offer.id)) {
        const g = h.armory[h.armory.length - 1];
        if (g) assignGear(state, c.id, slot, g.id);
      }
    }
  }
}

function developCreatures(state: GameState): void {
  const h = state.player.ludus;
  for (const c of h.creatures) {
    while (c.statPoints > 0) {
      const s = getStats(c);
      const stat = c.level % 3 === 0 ? 'hp' : s.str <= s.agi ? 'str' : 'agi';
      if (spendPoint(state, c.id, stat)) break;
    }
    if (c.techPoints > 0 && c.kind === 'dino') {
      const t = LEARNABLE.find((id) => isLearnable(c, id) && meetsRequirement(c, id, (knownTech(c, id)?.rank ?? 0) + 1));
      if (t) learnTech(state, c.id, t);
    }
    // tameness: a gift before they get ideas
    if (c.kind === 'dino' && c.loyalty < 50 && h.denarii > reserve(state) + 100) rewardCreature(state, h, c);
  }
  if (!h.doctoreId && h.creatures.filter((c) => c.kind === 'dino').length >= 3) {
    const d = [...h.creatures].filter((c) => c.kind === 'dino' && !c.injury).sort((a, b) => b.level - a.level || getStats(b).cun - getStats(a).cun)[0];
    if (d) setDoctore(state, d.id);
  }
}

/** Retire the badly wounded: a crippled fighter costs full upkeep and loses most of its fights. */
function cullWounded(state: GameState): void {
  const h = state.player.ludus;
  const fit = fighters(h);
  if (fit.length < 3) return;
  const best = Math.max(...fit.map((c) => power(h, c)));
  const victim = fit.find((c) => c.id !== h.doctoreId && (hasTrait(c, 'Crippled') || hasTrait(c, 'BumLeg')) && power(h, c) < best * 0.7);
  if (victim) sellCreature(state, victim.id);
}

/** Sell spare gear, then the costliest-to-keep, least useful creature, until next week is safe. */
function avoidDebt(state: GameState): void {
  const h = state.player.ludus;
  for (let guard = 0; guard < 6; guard++) {
    const net = weeklyNet(state, h);
    if (h.denarii + net * 2 >= 0) return;
    const spare = h.armory.find((g) => !wearerOf(h, g.id));
    if (spare) { sellGear(state, spare.id); continue; }
    const pool = h.creatures.filter((c) => !c.away && c.id !== h.doctoreId);
    if (pool.length <= 2) return;
    const worst = [...pool].sort((a, b) => power(h, a) - power(h, b))[0];
    if (!worst || sellCreature(state, worst.id)) return;
  }
}

function registerEverything(state: GameState): void {
  const h = state.player.ludus;
  const open = state.world.tournaments.filter((t) => t.status === 'open');
  // big purses first, then rookie and junior events (fees are never charged)
  open.sort((a, b) => b.perTeam * b.teams - a.perTeam * a.teams);
  for (const t of open) {
    const ok = h.creatures.filter((c) => !eligibility(state, t, c) && !c.injury && c.loyalty > 35)
      .sort((a, b) => power(h, b) - power(h, a));
    if (ok.length < t.perTeam) continue;
    const team = ok.slice(0, t.perTeam);
    for (const c of team) c.instruction = c.level >= 5 || c.fame >= 20 ? 'care' : 'default';
    register(state, t.id, [team.map((c) => c.id)]);
  }
}

/** Take the fight to the Horde once the Senate will fund it (the designed counter to a growing rebellion). */
function manageExpedition(state: GameState): void {
  const h = state.player.ludus;
  const tactics = state.player.storyData.expeditionTactics as string[] | undefined;
  if (state.player.expedition && tactics?.length) {
    const pref = ['sendScouts', 'encircle', 'stormDefenses', 'starveThemOut'];
    resolveExpedition(state, pref.find((t) => tactics.includes(t)) ?? tactics[0]);
    return;
  }
  if (state.player.expedition || hordeSize(state) < 12) return;
  const commander = h.creatures.filter((c) => c.kind === 'dino' && canFight(c) && !c.away).sort((a, b) => power(h, b) - power(h, a))[0];
  if (!commander) return;
  const funds = Math.min(1200, h.denarii - reserve(state) - 100);
  if (funds < 300) return;
  const keepers = Math.min(maxExpeditionKeepers(state), 4);
  const p = expeditionPreview(state, { commanderId: commander.id, funds, keepers });
  if (p.ok || p.militia < hordeSize(state) * 0.8) return;
  startExpedition(state, { commanderId: commander.id, funds, keepers, capture: false });
}

export function competentBot(state: GameState): void {
  answerDecisions(state);
  avoidDebt(state);
  if (state.world.week === 1) buyDinos(state);
  cullWounded(state);
  manageKeepers(state);
  buyDinos(state);
  buyAndAssignGear(state);
  manageBuildings(state);
  developCreatures(state);
  manageExpedition(state);
  registerEverything(state);
  avoidDebt(state);
}

/** Resolve the week: play the attended tournament (retire from pit bonus rounds while ahead). */
export function playBotWeek(state: GameState): void {
  beginAdvance(state);
  const t = attendedTournament(state);
  if (t) {
    for (let guard = 0; guard < 40; guard++) {
      const pv = nextPlayerMatch(state, t);
      if (!pv) break;
      // chain the enemy when the purse is worth it and the books allow (docs §9: chains cut Initiative by ⅔)
      const h = state.player.ludus;
      const n = pv.opponentCreatures.length;
      const cost = cheatCost(state, t, 'chains', pv.playerCreatures.length, n);
      const worth = prizeFor(state, t).denarii >= 150 || t.type === 'rookie';
      const bribe = worth && !cheatAvailable(state, t, 'chains', pv.playerCreatures.length, n) && h.denarii - cost > reserve(state) ? 'chains' as const : undefined;
      playMatch(state, t, bribe ? { bribe } : {});
      if (t.status === 'bonus') continueBonus(state, t, false);
    }
  }
  completeWeek(state);
}

export { securityTotal };
