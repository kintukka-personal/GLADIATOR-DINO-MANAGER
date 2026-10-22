// The battle loop (GM world/Battle.java + Combatant.AttemptAttack/Attack/TakeDamage): setup, turn order,
// attack resolution, damage, tricks, surrender, time-out and post-battle outcomes. Pure with respect to creatures.

import type {
  BattleLogLine, BattleOptions, BattleResult, BattleSide, InjuryType, Injury, LogKind, TechId, TraitId,
} from '../types';
import { rand, coin } from '../rng';
import { worth, injuryProne } from '../creature';
import { TECHNIQUES, techDamage } from '../data/techniques';
import type { CombatOutcome, Fighter, Piece } from './model';
import {
  alive, armed, baseArmor, buildFighter, classPref, disarmed, fam, fists, has, holy, impaired, initiativeKey, isGiant,
  lineHas, negative, shieldUp,
} from './combatant';
import {
  addStatus, deceptiveCount, inflict, removeStatus, tickStatuses, tryBleed, tryBlind, tryDisarm, tryFear, tryStun,
} from './statuses';
import { TECHS, type TX } from './techniques';

const tr = Math.trunc;

export interface HitOpts {
  crit: boolean;
  tech?: TechId;
  piercing?: boolean;
  fireball?: boolean;
  /** Thunderstrike splash: piercing, no counter, no on-hit effects */
  splash?: boolean;
  /** weapon piece that struck (null: jaws, beast, head, non-weapon technique) */
  weapon: Piece | null;
  weaponHit: boolean;
  slot: 'main' | 'off' | 'none';
  head?: boolean;
  secondary?: boolean;
}

const INJURY_WEEKS: Record<InjuryType, number> = { flesh: 2, broken: 3, severe: 4, multiple: 5 };

/** GM InjuryFactory.GenerateInjury: R = rand(11) + m; ≤10 nothing; 11 flesh … 14 multiple, 15 dead (coin to severe if m < 12). */
export function rollInjury(m: number, canDie: boolean): InjuryType | 'dead' | null {
  const R = rand(11) + m;
  if (R <= 10) return null;
  const k = Math.min(R, 15);
  if (k === 11) return 'flesh';
  if (k === 12) return 'broken';
  if (k === 13) return 'severe';
  if (k === 14 || !canDie) return 'multiple';
  if (m < 12 && rand(2) === 0) return 'severe';
  return 'dead';
}

export function injuryOf(t: InjuryType): Injury {
  return { type: t, weeks: INJURY_WEEKS[t] };
}

/** Healing Poultice (GM bandage): downgrade a fresh injury. Dead → multiple (+4 weeks), multiple → severe (−2), else healed. */
export function bandage(t: InjuryType | 'dead'): Injury | null {
  if (t === 'dead') return { type: 'multiple', weeks: INJURY_WEEKS.multiple + 4 };
  if (t === 'multiple') return { type: 'severe', weeks: INJURY_WEEKS.severe - 2 };
  return null;
}

const CARNIVORES = new Set(['direwolf', 'alphadirewolf', 'sabertooth', 'direbear']);

/** Deterministic flavour pick that does not consume battle RNG. */
function flav<T>(arr: readonly T[], n: number): T {
  return arr[((n % arr.length) + arr.length) % arr.length];
}

const VERB: Record<string, string[]> = {
  claw: ['slashes', 'rakes', 'carves into'],
  fang: ['bites', 'punctures', 'sinks its fangs into'],
  horn: ['gores', 'skewers', 'jabs'],
  mace: ['clubs', 'smashes', 'batters'],
  spit: ['spits venom at', 'splatters', 'sprays'],
  jaw: ['chomps', 'crunches', 'savages'],
  whip: ['lashes', 'flogs', 'cracks the whip across'],
  beast: ['mauls', 'tears at', 'savages'],
};

const KO_TEXT = [
  '{t} crashes into the sand. The crowd approves.',
  '{t} goes down in a heap of scales.',
  '{t} collapses. The keepers reach for their hooks.',
  '{t} is out cold. Somewhere a bookmaker smiles.',
];
const YIELD_TEXT = [
  '{t} yields, tail between its legs.',
  '{t} rolls over and shows its belly. It yields.',
  '{t} has had enough and backs away. It yields.',
];
const MISS_TEXT = [
  '{a} snaps at {t} and bites only air.',
  '{a} lunges at {t} and misses.',
  '{a} swings wide. {t} is not impressed.',
  '{a} misses {t} and eats a mouthful of sand.',
];

export class Battle {
  readonly f: Fighter[];
  order: Fighter[] = [];
  readonly lines: BattleLogLine[] = [];
  round = 0;
  readonly rounds: number;
  trickAvailable = true;
  winner: 0 | 1 | null = null;
  decidedBy: BattleResult['decidedBy'] = 'ko';
  lastCountered = false;
  private mates = new Map<number, number[]>();
  private endText = '';

  constructor(public readonly sides: [BattleSide, BattleSide], public readonly opts: BattleOptions, public readonly extra: ResolveExtra = {}) {
    const list: { bf: BattleSide['fighters'][number]; s: 0 | 1 }[] = [
      ...sides[0].fighters.map((bf) => ({ bf, s: 0 as const })),
      ...sides[1].fighters.map((bf) => ({ bf, s: 1 as const })),
    ];
    this.f = list.map(({ bf, s }, i) => buildFighter(bf, i, { opts, side: sides[s], sideIdx: s }));
    // disambiguate identical names in the log
    const seen = new Map<string, number>();
    for (const f of this.f) {
      const n = (seen.get(f.name) ?? 0) + 1;
      seen.set(f.name, n);
      if (n > 1) f.name = `${f.name} ${['', '', 'II', 'III', 'IV', 'V'][n] ?? n}`;
    }
    this.rounds = opts.rounds && opts.rounds >= 4 ? opts.rounds : opts.event ? 8 : 6;
  }

  // -------------------------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------------------------

  log(kind: LogKind, text: string, x: { actor?: number; target?: number; dmg?: number; crit?: boolean; tech?: TechId } = {}): void {
    const line: BattleLogLine = { round: this.round, kind, text, hp: this.f.map((f) => Math.max(0, f.hp)) };
    if (x.actor !== undefined) line.actor = x.actor;
    if (x.target !== undefined) line.target = x.target;
    if (x.dmg !== undefined) line.dmg = x.dmg;
    if (x.crit) line.crit = true;
    if (x.tech) line.tech = x.tech;
    this.lines.push(line);
  }

  living(side: 0 | 1): Fighter[] {
    return this.f.filter((f) => f.side === side && !f.out);
  }
  enemies(f: Fighter): Fighter[] {
    return this.f.filter((e) => e.side !== f.side && !e.out);
  }
  allies(f: Fighter): Fighter[] {
    return this.f.filter((e) => e.side === f.side && !e.out);
  }

  heal(f: Fighter, amt: number, why: string): void {
    if (amt <= 0 || f.out || f.hp >= f.H) return;
    const before = f.hp;
    f.hp = Math.min(f.H, f.hp + amt);
    if (f.hp > before) this.log('heal', `${f.name} ${why} (+${f.hp - before}).`, { actor: f.idx, dmg: f.hp - before });
  }

  releaseNetOn(victim: Fighter): void {
    for (const f of this.f) if (f.netOn === victim.idx) f.netOn = null;
  }

  mateBoosted(f: Fighter): boolean {
    const ps = this.mates.get(f.idx);
    return !!ps && !f.out && ps.some((i) => !this.f[i].out);
  }

  private blindBase(f: Fighter): number {
    return (f.traits.has('BlindFighter') ? 15 : 0) + (lineHas(f.item, 'EyeBall') ? 20 : 0);
  }

  private verb(f: Fighter, slot: 'main' | 'off' | 'none'): string {
    const p = slot === 'main' ? (armed(f) ? f.w : null) : slot === 'off' ? f.off : null;
    const key = p?.def.family ?? (f.beast ? 'beast' : 'jaw');
    return flav(VERB[key] ?? VERB.jaw, this.lines.length);
  }

  // -------------------------------------------------------------------------------------------
  // setup
  // -------------------------------------------------------------------------------------------

  private findMates(): void {
    for (const a of this.f) {
      const ca = a.bf.creature;
      if (a.sp.mythic || ca.maturity < 1) continue;
      const ps = this.f.filter((b) => b !== a && b.side === a.side && b.species === a.species
        && b.bf.creature.maturity >= 1 && b.bf.creature.sex !== ca.sex).map((b) => b.idx);
      if (ps.length) this.mates.set(a.idx, ps);
    }
    const logged = new Set<number>();
    for (const [i, ps] of this.mates) {
      if (logged.has(i)) continue;
      const j = ps.find((p) => !logged.has(p));
      if (j === undefined) continue;
      logged.add(i); logged.add(j);
      const a = this.f[i], b = this.f[j];
      this.log('info', `${a.name} and ${b.name} fight as a mated pair. Mate Boost: each takes a third less damage while both stand.`, { actor: i, target: j });
    }
  }

  private startEffects(): void {
    if (this.f.some((f) => f.werewolfActive)) this.log('info', 'A full moon hangs over the arena. Somebody is twitching.');
    for (const f of this.f) {
      if (f.riderSummoned) this.log('info', `A spectral rider climbs into ${f.name}'s saddle.`, { actor: f.idx });
      if (f.temporary && f.species === 'mandrake') this.log('info', `A mandrake shrieks out of a shattered root and joins ${this.sides[f.side].name}.`, { actor: f.idx });
    }
    for (const side of [0, 1] as const) {
      const mine = this.f.filter((f) => f.side === side);
      const foes = this.f.filter((f) => f.side !== side);
      const mods = this.sides[side].modifiers;
      // fear: weapons
      for (const f of mine) {
        if (lineHas(f.w, 'Fear') || lineHas(f.off, 'Fear')) {
          this.log('info', `${f.name}'s cursed harness makes the air go cold.`, { actor: f.idx });
          for (const e of foes) tryFear(this, f, e, tr(f.C / 4) + tr(f.S / 4) + 15);
        }
      }
      // mammoths frighten ridden foes (GM elephants vs horses)
      for (const f of mine) {
        if (f.species !== 'mammoth') continue;
        for (const e of foes) if (e.rider) tryFear(this, f, e, tr(f.S / 2) + tr(f.H / 10) + 10);
      }
      // pooled fear (Horribly Disfigured / Mythical)
      const holders = mine.filter((f) => f.causesFear);
      if (holders.length) {
        let P = 10;
        for (const h of holders) P += h.helmet ? tr(h.S / 4) + tr(h.C / 4) + h.F : tr(h.S / 3) + tr(h.C / 3) + h.F;
        P += 5 * mine.filter((f) => f.carthageSet).length;
        this.log('info', `${holders.map((h) => h.name).join(' and ')} ${holders.length > 1 ? 'are' : 'is'} a sight to curdle blood.`, { actor: holders[0].idx });
        for (const e of foes) tryFear(this, holders[0], e, P);
      }
      // Brachiosaurus / Giganotosaurus advanced bonus
      for (const f of mine) {
        if (!f.adv || (f.species !== 'brachiosaurus' && f.species !== 'giganotosaurus')) continue;
        this.log('info', `${f.name} looms over the arena. The ground shakes.`, { actor: f.idx });
        for (const e of foes) tryFear(this, f, e, tr(f.S / 4) + tr(f.H / 10) + 10);
      }
      for (const f of mine) {
        if (f.species === 'troodon' && (lineHas(f.helmet, 'CarthageHelmet') || lineHas(f.armor, 'CarthageArmor'))) addStatus(this, f, 'INSPIRED', 3, 0, f.idx);
      }
      for (const f of mine) {
        if (!f.traits.has('Inspiring')) continue;
        for (const o of mine) if (o !== f && !has(o, 'INSPIRED')) addStatus(this, o, 'INSPIRED', 5, 0, f.idx);
      }
      for (const f of mine) {
        if (!f.traits.has('Psychopath')) continue;
        for (const o of mine) if (o !== f && !o.traits.has('Psychopath')) addStatus(this, o, 'DEMORALIZED', 5, 0, f.idx);
      }
      for (const f of mine) {
        if (!f.traits.has('Hoplite') || fam(f.w) !== 'horn') continue;
        for (const o of mine) { o.armorExtra += 1; o.S += 1; }
        this.log('info', `${f.name} braces the pack like a phalanx.`, { actor: f.idx });
      }
      for (const f of mine) {
        if (f.traits.has('Blind')) addStatus(this, f, 'BLINDED', 99, 0, f.idx, true);
        if (f.traits.has('Preparation') || f.traits.has('SelfPreservation')) addStatus(this, f, 'BLOCK', 99, 10, f.idx, true);
        if (f.traits.has('Indomitable')) addStatus(this, f, 'INDOMITABLE', 1, 0, f.idx, true);
      }
      if (mods.includes('Chained')) for (const f of mine) addStatus(this, f, 'CHAINED', 99, 0, -1);
      if (mods.includes('CurseOfTime')) {
        for (const f of mine) {
          for (const t of f.techs) t.cd = TECHNIQUES[t.id]?.cooldown ?? 0;
          addStatus(this, f, 'TIME_CURSE', 99, 0, -1, true);
        }
        this.log('info', `Time itself drags at ${this.sides[side].name}'s fighters.`);
      }
      if (mods.includes('Surprised')) for (const f of mine) { f.I -= 2 + tr(f.baseI / 6); f.C = Math.max(0, f.C - 2 - tr(f.C / 6)); f.armorExtra -= 1; }
      if (mods.includes('Surrounded')) for (const f of mine) { f.I -= 4 + tr(f.baseI / 5); f.armorExtra -= 1; }
      if (mods.includes('Walled')) for (const f of mine) { f.I += 4 + tr(f.baseI / 5); f.S += 2; f.armorExtra += 2; }
    }
  }

  // -------------------------------------------------------------------------------------------
  // round loop
  // -------------------------------------------------------------------------------------------

  run(): BattleResult {
    const n0 = this.sides[0].fighters.length;
    const n1 = this.sides[1].fighters.length;
    const s0 = this.sides[0].name;
    const s1 = this.sides[1].name;
    this.log('start', `${s0} against ${s1}, ${n0} on ${n1}. The crowd settles in with wine and opinions.`);
    if (n0 === 0 || n1 === 0) {
      this.winner = n0 === 0 && n1 > 0 ? 1 : 0;
      this.decidedBy = 'forfeit';
      this.endText = `${this.sides[this.winner === 0 ? 1 : 0].name} fields no fighters. ${this.sides[this.winner].name} wins by forfeit.`;
      return this.result(0);
    }
    this.order = [...this.f].sort((a, b) => initiativeKey(b) - initiativeKey(a));
    this.findMates();
    this.startEffects();
    this.order = [...this.order].sort((a, b) => initiativeKey(b) - initiativeKey(a));
    let fought = 0;
    for (let r = 1; r <= this.rounds && this.winner === null; r++) {
      this.round = r;
      fought = r;
      this.log('round', `Round ${r}.`);
      for (const f of this.order) {
        if (this.winner !== null) break;
        if (f.out) continue;
        this.turn(f);
        this.postAction(f);
      }
      for (const f of this.f) {
        const blk = f.st.get('BLOCK');
        if (blk && blk.dur > 10) removeStatus(this, f, 'BLOCK');
      }
    }
    if (this.winner === null) this.timeout();
    else {
      const w = this.sides[this.winner].name;
      this.endText = flav([`${w} wins. The sand drinks deep.`, `Victory to ${w}!`, `${w} takes the day. The crowd cheers, mostly.`], this.lines.length);
    }
    return this.result(fought);
  }

  private turn(f: Fighter): void {
    tickStatuses(this, f);
    if (f.out) return;
    const foes = this.enemies(f);
    if (!foes.length) return;
    if (f.traits.has('OneManArmy') && this.allies(f).length < foes.length && !has(f, 'PUMPED')) addStatus(this, f, 'PUMPED', 10, 0, f.idx);
    if (f.traits.has('Duelist') && this.allies(f).length === 1 && foes.length === 1 && !has(f, 'DUEL')) addStatus(this, f, 'DUEL', 10, 0, f.idx);
    const t = this.pickTarget(f, foes);
    f.dealtThisTurn = 0;
    this.attemptAttack(f, t);
    f.dealtLast = f.dealtThisTurn > 0;
  }

  private pickTarget(f: Fighter, foes: Fighter[]): Fighter {
    if (foes.length === 1) return foes[0];
    const smart = f.C + rand(20) > 20;
    let t = foes[rand(foes.length)];
    if (smart) {
      for (const e of foes) if (e.hp < t.hp) t = e;
    } else if (f.lastAttacker !== undefined) {
      const la = this.f[f.lastAttacker];
      if (la && !la.out && la.side !== f.side) t = la;
    }
    return t;
  }

  /** Main-hand hit total T (GM 01 §6.1c). Returns T and T without the precision/backstab part. */
  private hitTotal(f: Fighter, t: Fighter): { T: number; Tnp: number } {
    let V = 45;
    if (has(f, 'ENSNARED')) V = 30;
    if (has(f, 'BLINDED')) V = this.blindBase(f);
    const base = f.baseAcc - t.dodge + V;
    let roll = rand(30) + f.F + tr(1.5 * (f.I - (tr(t.I / 3) + tr(t.I / 4))));
    const arm = armed(f);
    if (arm && f.traits.has('Deadeye')) roll += f.wReach;
    if (arm && f.pilum) roll -= 25;
    if (has(t, 'ENSNARED')) roll += arm && f.fuscina ? 40 : 15;
    if (arm && f.whip && (fists(t) || t.beast)) roll += 15;
    if (has(t, 'DAZED')) roll += 15;
    if (roll < 0) roll = tr(roll / 2);
    if (arm) roll += f.weaponAcc;
    roll += f.thracian; // Velociraptor advanced: +1 accuracy per attack made
    if (this.round === 1 && f.species === 'carnotaurus') roll += 3;
    let P = 0;
    if (arm && lineHas(f.w, 'Precision')) P = base > 50 ? 5 : 10;
    if (arm && lineHas(f.w, 'Backstab') && impaired(t)) P += rand(30) + 15;
    if (f.dual && f.offAttacks) {
      roll -= f.traits.has('DualWield') ? 15 : 30;
      if (f.twoHandedOnly) roll -= 5;
    }
    if (arm && lineHas(f.w, 'AchillesSpear')) {
      if (f.S < f.I || f.S < f.C) roll -= 10;
      for (const th of [50, 40, 30, 20, 10]) if (f.S < th) roll -= 10;
      if (f.S > 60 && !f.achillesDone) { f.critDmgPct += 10; f.achillesDone = true; } // GM stacks this every attack
    }
    return { T: base + roll + P, Tnp: base + roll };
  }

  private attemptAttack(f: Fighter, t: Fighter): void {
    const stunned = has(f, 'STUNNED');
    if (stunned) {
      this.log('status', `${f.name} is stunned and can only sway.`, { actor: f.idx });
    } else {
      // a) opening volley
      if (this.round === 1 && f.bow && armed(f) && !f.tookDamage) {
        const tArcher = t.bow && armed(t);
        if ((!tArcher || lineHas(f.w, 'Apollo')) && t.I <= f.I + tr(f.I / 4)) {
          const acc = rand(15) + (f.traits.has('Marksman') ? 10 : 0) + f.baseAcc - t.dodge
            + (has(f, 'BLINDED') ? tr(this.blindBase(f) / 2) : has(f, 'ENSNARED') ? 10 : 20) + f.F + tr(2.5 * (f.I - tr(t.I / 2)));
          this.log('info', `${f.name} opens up with a volley before ${t.name} can close.`, { actor: f.idx, target: t.idx });
          this.attack(f, t, acc, 'main', true, { volley: true });
          addStatus(this, f, 'EVADING', 1, 0, f.idx, true);
        }
      }
      // b) trance (time-warped gear)
      if (!has(f, 'TRANCE')) {
        if ((this.round >= 3 && armed(f) && lineHas(f.w, 'AscendedBlade')) || (this.round >= 4 && f.offKind === 'weapon' && lineHas(f.off, 'AscendedBlade'))) {
          addStatus(this, f, 'TRANCE', 4, 0, f.idx);
        }
      }
      // c) main hand
      const { T, Tnp } = this.hitTotal(f, t);
      // GM raises 31–39 to 45, which made 40–44 worse than 31–39 (and left 30 out); the whole 30–44 band becomes 45
      const bump = (x: number) => (x >= 30 && x < 45 ? 45 : x);
      const whisper = (p: Piece | null) => f.traits.has('BladeWhisperer') && fam(p) === 'claw';
      if (T < 30 && !(armed(f) && whisper(f.w))) {
        this.log('miss', flav(MISS_TEXT, this.lines.length).replace('{a}', f.name).replace('{t}', t.name), { actor: f.idx, target: t.idx });
      } else {
        this.attack(f, t, bump(T), 'main', false);
      }
      // d) off-hand / second bite
      if (f.offAttacks && f.off) {
        let To = bump(Tnp) - (f.traits.has('Ambidextrous') || f.species === 'stegosaurus' ? 0 : 10) + f.offAcc;
        if (lineHas(f.off, 'Precision')) To += 10;
        if (lineHas(f.off, 'Backstab') && impaired(t)) To += rand(30) + 15;
        if (lineHas(f.off, 'TwoHandedOnly')) To -= 5;
        if (To < 30 && !whisper(f.off)) {
          this.log('miss', `${f.name}'s off-hand strike finds nothing but air.`, { actor: f.idx, target: t.idx });
        } else {
          To = bump(To) - 10 * f.off.l.reach;
          this.attack(f, t, To, 'off', true);
        }
      } else if (f.ironJaws && armed(f) && !f.off) {
        const T2 = bump(T) - 10;
        if (T2 < 30) this.log('miss', `${f.name}'s second bite snaps shut on nothing.`, { actor: f.idx, target: t.idx });
        else this.attack(f, t, bump(T2), 'main', true);
      }
      // e) extra heads
      if (has(f, 'TWO_HEADS')) this.attack(f, t, T + 15, 'none', true, { head: true });
      if (has(f, 'THREE_HEADS')) this.attack(f, t, T + 25, 'none', true, { head: true });
    }
    // f) damage over time on self
    this.dots(f);
    // g) bolas or a dirty trick (GM: the trick branch returned early so nets were thrown only in round 1 — fixed)
    if (!stunned && !f.out && f.hp >= 1 && (!f.beast || f.species === 'medusa') && !has(f, 'PARRY') && alive(t)) {
      if (f.net && f.netOn === null && !has(t, 'ENSNARED')) this.throwNet(f, t);
      else if (this.round >= 2) this.attemptTrick(f, t);
    }
    // Hydra heads
    if (f.traits.has('ManyHeads') && !f.out && f.hp >= 1) {
      if (!has(f, 'TWO_HEADS') && f.hp < 0.75 * f.H) {
        // GM's missing breaks also applied the werewolf/three-heads/ensnared blocks here; ours applies only this one
        const st = { dur: 99, delta: { I: tr(f.I * 0.5), C: tr(f.C * 0.5) }, value: 0, source: f.idx, hpGain: 0 };
        f.I += st.delta.I; f.C += st.delta.C;
        f.st.set('TWO_HEADS', st);
        this.log('transform', `${f.name} sprouts a second snapping head!`, { actor: f.idx });
        this.heal(f, tr(f.H / 6), 'regrows flesh');
      }
      if (has(f, 'TWO_HEADS') && !has(f, 'THREE_HEADS') && f.hp < 0.25 * f.H) {
        const st = { dur: 99, delta: { I: tr(f.I * 0.25), C: tr(f.C / 3) }, value: 0, source: f.idx, hpGain: 0 };
        f.I += st.delta.I; f.C += st.delta.C;
        f.st.set('THREE_HEADS', st);
        this.log('transform', `${f.name} grows a third head. The front row leaves.`, { actor: f.idx });
        this.heal(f, tr(f.H / 5), 'regrows flesh');
      }
    }
  }

  /** GM Combatant.Attack: crit/glance roll, technique choice, normal damage. */
  private attack(f: Fighter, t: Fighter, T: number, slot: 'main' | 'off' | 'none', secondary: boolean, x: { head?: boolean; volley?: boolean } = {}): void {
    if (t.out) return;
    let Tp = T;
    if (f.bow && armed(f) && slot === 'main' && shieldUp(t)) Tp -= 5;
    if (t.flying) Tp -= 5;
    let greek = 0;
    if (f.adv && f.species === 'ankylosaurus') greek = 100 - tr((Math.max(0, f.hp) * 100) / f.H) - (t.flying ? 5 : 0);
    let glancing = Tp < 40 || has(t, 'EVADING');
    let crit = Tp + f.critBonus + greek + rand(30) > 109;
    if (crit && glancing) { crit = false; glancing = false; }
    if (secondary && slot === 'off' && lineHas(f.off, 'Concealed') && f.attacks < 2) { crit = true; glancing = false; }
    if (f.adv && f.species === 'carnotaurus' && !f.firstHitLanded) { crit = true; glancing = false; }
    f.firstHitLanded = true;

    if (!secondary && this.useTechnique(f, t, crit, glancing)) {
      this.afterAttack(f, false);
      return;
    }
    const weapon = slot === 'main' ? (armed(f) ? f.w : null) : slot === 'off' ? f.off : null;
    const ranged = !!x.volley || slot === 'none';
    const dmg = this.normalDamage(f, t, slot, crit, glancing, secondary, ranged);
    const before = t.hp;
    const dealt = this.hit(f, t, dmg, { crit, weapon, weaponHit: !!weapon, slot, head: x.head, secondary });
    if (!this.lastCountered) {
      const who = x.head ? `${f.name}'s extra head` : slot === 'off' ? `${f.name}'s off-hand` : f.name;
      const downed = before < 1 ? ` the fallen ${t.name}` : ` ${t.name}`;
      const verb = this.verb(f, slot);
      let text: string;
      if (crit) text = `${who} ${verb}${downed} with a brutal critical for ${dealt}!`;
      else if (glancing) text = `${who} ${verb}${downed}, but it glances off: ${dealt}.`;
      else text = `${who} ${verb}${downed} for ${dealt}.`;
      this.log(crit ? 'crit' : glancing ? 'glance' : 'attack', text, { actor: f.idx, target: t.idx, dmg: dealt, crit });
      this.onHit(f, t, dealt, { crit, weapon, weaponHit: !!weapon, slot, head: x.head, secondary });
    }
    this.afterAttack(f, secondary);
  }

  private afterAttack(f: Fighter, secondary: boolean): void {
    f.attacks++;
    if (f.adv && f.species === 'velociraptor') f.thracian++;
    if (!secondary) f.damagedSinceAttack = false;
  }

  /** Technique choice on a main attack that hit (GM 11.1). Returns true if a technique replaced the attack. */
  private useTechnique(f: Fighter, t: Fighter, crit: boolean, glancing: boolean): boolean {
    if (!f.techs.length) return false;
    const enraged = has(f, 'ENRAGED');
    const W = this.weaponW(f, t, 'main', crit);
    const cands: { i: number; p: number; tie: number; x: TX }[] = [];
    f.techs.forEach((ts, i) => {
      if (ts.cd > 0) { ts.cd--; return; }
      const def = TECHNIQUES[ts.id];
      if (!def || enraged) return;
      if (glancing && !def.piercing) return;
      const impl = TECHS[ts.id];
      const x: TX = { b: this, a: f, t, id: ts.id, r: ts.rank, d: techDamage(ts.id, ts.rank), crit, W };
      if (impl.usable && !impl.usable(x)) return;
      let p = def.basePriority + ts.rank - 1 + (classPref(f, ts.id) ? 1 : 0) + ts.manual;
      if (impl.prio) p = impl.prio(x, p);
      cands.push({ i, p, tie: rand(1000), x });
    });
    if (!cands.length) return false;
    cands.sort((a, b) => b.p - a.p || a.tie - b.tie);
    const best = cands[0];
    if (best.p <= -1) return false;
    const ts = f.techs[best.i];
    ts.cd = TECHNIQUES[ts.id].cooldown;
    TECHS[ts.id].run(best.x);
    return true;
  }

  /** Weapon points W for an attack (GM 6.3), including the per-attack temporary bonus. */
  weaponW(f: Fighter, t: Fighter, slot: 'main' | 'off' | 'none', crit: boolean): number {
    if (slot === 'none') return 0;
    const lunar = (p: Piece | null) => (lineHas(p, 'Lunar') ? f.lunarPts : 0);
    if (slot === 'main') {
      if (!armed(f)) {
        if (f.beast) return 0;
        let W = (disarmed(f) ? 0 : f.barePts) + f.thracian;
        if (f.midas) W += 1;
        return W;
      }
      const p = f.w!;
      let W = p.l.dmg + f.wpnPts + f.thracian + f.solarPts + lunar(p);
      if (p.def.family === 'horn' && f.netOn !== null) W += 2;
      if (p.def.family === 'fang' && crit && f.traits.has('ShadowBlade')) W += 3;
      if (f.adv && f.species === 'spinosaurus') W += f.F + (crit ? f.F : 0);
      if (f.ironJaws && f.midas) W += 1;
      if (lineHas(p, 'Khopesh')) {
        W += t.off && t.off.def.heavy ? -1 : 1;
        W += t.armor && t.armor.def.heavy ? -1 : 1;
      }
      if (f.wReach > t.wReach) W += 1;
      return W;
    }
    const p = f.off;
    if (!p) return 0;
    let W = p.l.dmg + f.offPts + f.thracian + lunar(p);
    if (p.def.family === 'fang' && crit && f.traits.has('ShadowBlade')) W += 3;
    if (lineHas(p, 'Khopesh')) {
      W += t.off && t.off.def.heavy ? -1 : 1;
      W += t.armor && t.armor.def.heavy ? -1 : 1;
    }
    return W;
  }

  private normalDamage(f: Fighter, t: Fighter, slot: 'main' | 'off' | 'none', crit: boolean, glancing: boolean, secondary: boolean, ranged: boolean): number {
    const S = Math.max(0, f.S);
    const B = f.B;
    let base = S + B;
    if (crit) base += ranged ? tr(B / 2) + tr((B * f.critDmgPct) / 100) : B + tr((B * f.critDmgPct) / 100);
    if (glancing) base -= tr(0.75 * S);
    if (ranged) base -= tr(0.25 * S);
    base = Math.max(0, base);
    const W = this.weaponW(f, t, slot, crit);
    let dmg = base + tr((base * W) / 10);
    if (secondary && dmg > 2) dmg -= tr(dmg / 4);
    return Math.max(0, dmg + W);
  }

  // -------------------------------------------------------------------------------------------
  // taking damage (GM 7)
  // -------------------------------------------------------------------------------------------

  private taranis(d: Fighter): boolean {
    return shieldUp(d) && lineHas(d.off, 'Taranis') && (d.species === 'triceratops' || d.species === 'tyrannosaurus');
  }

  /** Effective armor of D against this hit from A. */
  armorVs(d: Fighter, a: Fighter, o: Pick<HitOpts, 'crit' | 'weapon' | 'slot'>): number {
    if (d.traits.has('BeastTamer') && a.beast) d.armorExtra += 2;
    let A = baseArmor(d);
    if (armed(d)) A += d.w!.l.blk + (lineHas(d.w, 'XiphosBlock') && d.offKind !== 'shield' ? 1 : 0);
    if (d.off) {
      if (d.offKind === 'shield') {
        if (!has(d, 'SHIELD_SUNDERED') && !(o.weapon && lineHas(o.weapon, 'BypassShield'))) {
          A += d.off.l.blk;
          if (o.weapon) A += o.weapon.l.reach;
          if (o.weapon && lineHas(o.weapon, 'Bow')) A += 2;
        }
      } else if (d.offKind === 'weapon') {
        A += tr((d.off.l.blk + (lineHas(d.off, 'XiphosBlock') ? 1 : 0)) / 2);
      }
    }
    const weak = !o.weapon || lineHas(o.weapon, 'HandToHand');
    if (weak) {
      A += d.weakBlock;
      if (fists(d)) A += 3;
      if (a.traits.has('Pugilist') && !d.beast) A -= 5;
    }
    if (d.armor && !has(d, 'ARMOR_SUNDERED') && d.I > a.I) {
      if (lineHas(d.armor, 'GreaterMobility')) A += 4;
      else if (lineHas(d.armor, 'Mobility')) A += 2;
    }
    if (a.traits.has('SharpenedClaws')) A = tr(A / 2);
    if (o.crit) A += d.critBlock;
    A = Math.max(0, A);
    if (o.weapon && lineHas(o.weapon, 'Pilum')) A -= tr(A / 4);
    return A;
  }

  /** GM TakeDamage. Returns HP actually lost. */
  hit(a: Fighter, d: Fighter, raw: number, o: HitOpts): number {
    this.lastCountered = false;
    if (d.out) return 0;
    let dmg = Math.max(0, tr(raw));
    if (o.tech && classPref(a, o.tech)) dmg = tr(dmg * 1.1);
    let A = this.armorVs(d, a, o);
    if (o.piercing || o.splash) {
      A = o.fireball ? tr(A / 10) : tr(A / 2);
      if (o.fireball) {
        const roll = rand(Math.max(1, d.I + 60 + d.C)) + tr(d.I / 5) + tr(d.C / 5) - (a.C > d.C ? 10 : 0);
        if (roll > 65) {
          dmg = tr(dmg / 2);
          this.log('info', `${d.name} dives aside and is only half-roasted.`, { actor: a.idx, target: d.idx });
        }
      }
    } else if (has(d, 'PARRY')) {
      const r = d.st.get('PARRY')!.value;
      if (tr(d.I / 2) + 7 * r + tr(d.C / 5) + rand(20) + 2 * d.F > a.I + 5 + tr(a.C / 10)) {
        this.counter(d, a, dmg);
        this.lastCountered = true;
        return 0;
      }
    }
    if (A > 0) dmg -= tr((dmg * A) / Math.sqrt(A * A + 900));
    const intang = d.intangible && !d.dealtLast;
    if (!(o.piercing || o.splash)) {
      if (intang) dmg -= tr(dmg * 0.9);
      const blk = d.st.get('BLOCK');
      if (blk) {
        dmg = Math.max(0, dmg - blk.value);
        removeStatus(this, d, 'BLOCK');
      }
      if (d.traits.has('Indomitable') && d.attacks === 0) dmg -= tr(dmg / 2);
    } else {
      if (intang) dmg -= tr(dmg * 0.7);
      if (d.traits.has('Indomitable')) dmg -= tr(dmg / 4);
    }
    const tar = this.taranis(d);
    if (tar) dmg -= Math.max(0, d.F);
    dmg = Math.max(0, dmg - d.dr);
    if (tar && dmg > 0) d.F += 1;
    dmg = this.multiply(a, d, dmg, o);
    return this.applyDamage(a, d, dmg, o);
  }

  /** The single GM multiplier (first that applies), then species bonuses, imprint rider bonus and Mate Boost (last). */
  private multiply(a: Fighter, d: Fighter, dmg: number, o: HitOpts): number {
    if (dmg <= 0) return 0;
    let m = 1;
    if (a.traits.has('Bestiarii') && d.beast) m = 1.3 + (d.mythic && holy(o.weapon) ? 0.2 : 0);
    else if (a.traits.has('BestiaSummum') && a.beast && !d.beast) m = 1.3;
    else if (d.mythic && holy(o.weapon)) m = 1.2;
    else if (a.traits.has('ColossusSlayer') && isGiant(d)) m = d.traits.has('Titan') ? 1.15 : 1.3;
    else if (a.traits.has('EquesSlayer') && d.rider) m = 1.3;
    if (a.species === 'giganotosaurus') m *= 1.15;
    if (a.species === 'allosaurus' && d.hp < d.H / 2) m *= 1.1;
    if (a.species === 'carnotaurus' && o.tech === 'Charge') m *= 1.25;
    if (a.adv && a.species === 'dilophosaurus' && o.crit && a.hp >= a.H) m *= 1.5;
    if (a.imprint > 0) m *= 1 + 0.3 * a.imprint;
    if (d.imprint > 0) m *= 1 - 0.3 * d.imprint;
    if (this.mateBoosted(d)) m *= 0.67;
    return m === 1 ? dmg : Math.round(dmg * m);
  }

  private applyDamage(a: Fighter, d: Fighter, dmg: number, o: Partial<HitOpts>): number {
    const before = d.hp;
    d.hp -= dmg;
    if (dmg > 0) {
      d.lastAttacker = a.idx;
      d.damagedSinceAttack = true;
      d.tookDamage = true;
      a.dealtThisTurn += dmg;
      if (a.traits.has('Impact')) d.impactHit = true;
      if (dmg > a.biggestHit) a.biggestHit = dmg;
    }
    // knockout resistance (once): all-out or Spartan Resolve
    if (!d.koResistUsed && before > 1 && d.hp <= 0) {
      const ao = d.instruction === 'allout';
      const sr = d.traits.has('SpartanResolve');
      if (ao || sr) {
        const lim = -(rand(10) + 2 + (ao && sr ? 5 : 0));
        if (d.hp > lim) {
          d.hp = 1;
          d.koResistUsed = true;
          this.log('status', `${d.name} staggers but refuses to fall!`, { target: d.idx });
        }
      }
    }
    this.werewolfCheck(d);
    if (d.hp < 1) {
      if (before >= d.H && !d.beast && !o.splash) a.suddenDeath = true;
    } else if (dmg > 0) {
      if (d.adv && d.species === 'triceratops') { d.S += 2; d.I += 2; d.C += 2; d.H += 2; }
      if (o.crit) {
        if (lineHas(d.armor, 'Fragile') && !has(d, 'ARMOR_SUNDERED')) addStatus(this, d, 'ARMOR_SUNDERED', 5, 0, a.idx);
        if (lineHas(d.helmet, 'Fragile') && !has(d, 'HELMET_SUNDERED')) addStatus(this, d, 'HELMET_SUNDERED', 5, 0, a.idx);
      }
    }
    return dmg;
  }

  /** Counter (Parry): the attacker eats the pre-armor damage through its own armor. */
  private counter(d: Fighter, a: Fighter, dmg: number): void {
    const A = this.armorVs(a, d, { crit: false, weapon: armed(d) ? d.w : null, slot: 'main' });
    let x = dmg - tr((dmg * A) / Math.sqrt(A * A + 900));
    x = Math.max(0, x - a.dr);
    this.applyDamage(d, a, x, {});
    this.log('tech', `${d.name} Counters and turns the blow back on ${a.name} for ${x}!`, { actor: d.idx, target: a.idx, dmg: x, tech: 'Parry' });
  }

  private werewolfCheck(f: Fighter): void {
    if (!f.werewolfActive || f.transformed || f.out) return;
    const both = f.traits.has('Lycanthropy') && f.moonstone;
    if (!(f.hp <= 10 || (both && f.hp <= f.H / 2))) return;
    f.transformed = true;
    // werewolf block only (GM's missing breaks also stacked the three-heads and ensnared blocks)
    const dI = f.I + 5;
    const dS = f.S + 15;
    const newH = tr(f.H * 1.5) + 5;
    f.I += dI;
    f.S += dS;
    f.H = newH;
    f.st.set('WEREWOLF', { dur: 999, delta: {}, value: 0, source: f.idx, hpGain: 0 });
    addStatus(this, f, 'ARMOR_SUNDERED', 99, 0, f.idx, true);
    addStatus(this, f, 'HELMET_SUNDERED', 99, 0, f.idx, true);
    addStatus(this, f, 'SHIELD_SUNDERED', 99, 0, f.idx, true);
    addStatus(this, f, 'DISARM', 99, 0, f.idx, true);
    addStatus(this, f, 'ENRAGED', 2, 0, f.idx, true);
    f.lifeSteal = Math.max(f.lifeSteal, 0.3);
    if (f.moonstone) { f.armorExtra += 1; f.dodge += 5; f.baseAcc += 5; }
    const healAmt = tr(f.H / 3);
    const before = f.hp;
    f.hp = Math.min(f.H, f.hp + healAmt);
    this.log('transform', `${f.name} howls at the moon and bursts out of its harness in a Moon Frenzy! Its wounds close by ${f.hp - before}.`, { actor: f.idx });
  }

  /** On-hit effects (GM 6.4). */
  onHit(a: Fighter, d: Fighter, dealt: number, o: Partial<HitOpts> & { crit: boolean; weapon: Piece | null; weaponHit: boolean }): void {
    const wpn = o.weaponHit ? o.weapon : null;
    if (wpn && dealt > 2) {
      let pct = 0;
      if (lineHas(wpn, 'BloodLust') || (lineHas(wpn, 'DarkBlade') && a.fangsBloody)) pct = 0.5;
      else if (lineHas(wpn, 'BloodDrinker') || has(a, 'TRANCE') || (lineHas(wpn, 'RomanConquest') && a.species === 'iguanodon')) pct = 0.3;
      if (pct) this.heal(a, tr(dealt * pct), 'drinks deep');
    }
    if (wpn && a.pilum && wpn === a.w) d.pilumShred += tr(Math.max(0, baseArmor(d)) / 4); // GM used the attacker's armor
    if (dealt > 0) {
      if (a.adv && a.species === 'tyrannosaurus' && o.crit) this.heal(a, tr(a.H / 10), 'gulps down a mouthful');
      if (a.lifeSteal > 0) this.heal(a, tr(dealt * a.lifeSteal), 'feeds on the wound');
      if (a.traits.has('ManEater') && !d.beast) this.heal(a, tr(dealt * 0.2), 'savours the taste');
    }
    if (alive(d) && dealt > 0) {
      const bleedP = () => tr(a.S / 2) + tr(a.I / 2) + tr(a.C / 2) + rand(20);
      if (wpn && lineHas(wpn, 'Bleeding')) tryBleed(this, a, d, bleedP(), 5);
      else if (wpn && a.adv && a.species === 'stegosaurus' && wpn === a.off) tryBleed(this, a, d, bleedP(), 5);
      else if (a.adv && a.species === 'therizinosaurus' && o.crit) tryBleed(this, a, d, bleedP(), 5);
    }
    // poison
    if ((a.poisoner || (wpn && lineHas(wpn, 'AlwaysPoison'))) && (wpn || a.beast) && dealt > 0 && !o.head && alive(d) && !d.poisonImmune) {
      if (d.antidote && !d.antidoteUsed) {
        d.antidoteUsed = true;
        d.poisonImmune = true;
        this.log('status', `${d.name}'s antivenom neutralises the poison.`, { actor: a.idx, target: d.idx });
      } else {
        let p = d.traits.has('Mithridatism') ? tr(d.H / 20) + 2 : tr(d.H / 10) + 2;
        if (a.traits.has('PoisonMaster') && !d.traits.has('PoisonMaster')) p = tr(p * 1.5);
        if (d.poisonResistItem) p = tr(p / 2);
        if (d.C > a.C) p -= 1;
        if (d.traits.has('Indomitable') && d.attacks === 0) p = tr(p / 2);
        p = Math.max(1, p);
        d.hp -= p;
        d.lastAttacker = a.idx;
        this.log('status', `Venom burns through ${d.name}'s veins (${p}).`, { actor: a.idx, target: d.idx, dmg: p });
      }
    }
    // whip crack
    if (wpn && a.whip && wpn === a.w && alive(d)) {
      if (o.crit) {
        if (wpn.g.unique === 'fulgur') inflict(this, a, d, 'BLEEDING', 4);
        else inflict(this, a, d, 'ENSNARED', 2);
      }
      if (a.traits.has('DeafeningCrackle') && negative(d)) tryFear(this, a, d, dealt + a.I + a.C);
    }
    if (a.traits.has('FistsOfSteel') && fists(a) && !a.beast && dealt > 0 && !d.out) {
      const n = 1 + (a.S > 20 ? 1 : 0) + (o.crit ? 1 : 0) + (d.S > 40 ? 1 : 0);
      d.S = Math.max(1, d.S - n);
    }
    if (wpn && lineHas(wpn, 'DarkBlade') && !d.beast && dealt > 0) a.woundedHuman = true;
  }

  /** Technique damage line. */
  techLog(x: TX, tgt: Fighter, dealt: number, before: number, verb?: string): void {
    const name = TECHNIQUES[x.id].name;
    const fallen = before < 1 ? 'the fallen ' : '';
    const text = verb
      ? `${name} ${verb} ${fallen}${tgt.name} for ${dealt}.`
      : x.crit
        ? `${x.a.name}'s ${name} lands on ${fallen}${tgt.name} with a sickening crunch: ${dealt}, critical!`
        : `${x.a.name} uses ${name} on ${fallen}${tgt.name} for ${dealt}.`;
    this.log('tech', text, { actor: x.a.idx, target: tgt.idx, dmg: dealt, crit: x.crit, tech: x.id });
  }

  // -------------------------------------------------------------------------------------------
  // DoTs, nets, tricks
  // -------------------------------------------------------------------------------------------

  private dots(f: Fighter): void {
    if (f.out) return;
    if (has(f, 'CALTROPS')) {
      if (rand(50) + tr(f.I / 3) + tr(f.C / 3) - tr(f.S / 3) < 45) {
        let d = rand(4) + (f.S > 8 ? 1 : 0) + (f.S > 13 ? 1 : 0) + (f.S > 20 ? 1 : 0) + (f.H > 40 ? 1 : 0) + (f.H > 55 ? 1 : 0)
          - (f.traits.has('LightningSpeed') ? 1 : 0);
        if (f.rider) d *= 2;
        if (f.beast) d += 2;
        if (has(f, 'BLINDED')) d += 1;
        if (has(f, 'STUNNED')) d -= 1;
        d = Math.max(0, Math.min(d, f.hp - 1));
        if (d > 0) {
          f.hp -= d;
          this.log('status', `${f.name} steps on caltrops (${d}).`, { target: f.idx, dmg: d });
        }
      }
    }
    const bl = f.st.get('BLEEDING');
    if (bl) {
      const d = rand(2) + 2 + Math.max(0, tr((f.H - f.hp) / 10));
      f.hp -= d;
      if (bl.source >= 0 && this.f[bl.source].side !== f.side) f.lastAttacker = bl.source;
      this.log('status', `${f.name} bleeds (${d}).`, { target: f.idx, dmg: d });
    }
  }

  private throwNet(f: Fighter, t: Fighter): void {
    const roll = Math.min((tr(f.C / 2) + tr(f.I / 2)) - (tr(t.C / 2) + tr(t.I / 2)), 5) + rand(10) + f.F + f.net + (t.beast ? 3 : 0);
    if (roll > 5) {
      this.log('trick', `${f.name} whirls its bolas at ${t.name}'s legs.`, { actor: f.idx, target: t.idx });
      if (inflict(this, f, t, 'ENSNARED', 4)) f.netOn = t.idx;
    } else {
      this.log('trick', `${f.name}'s bolas sail past ${t.name}.`, { actor: f.idx, target: t.idx });
    }
  }

  /** GM AttemptTrick. Dirty tricks are limited to one success per battle; shield slam, solar flash and caltrops are not. */
  private attemptTrick(f: Fighter, t: Fighter): void {
    if (impaired(f) || !alive(t)) return;
    const dec = deceptiveCount(f);
    const roll = Math.min(tr(f.C / 2) - tr(t.C / 2), 5) + rand(10) + f.F + (tr(f.C / 2) > t.C ? 1 : 0) + (tr(f.C / 4) > t.C ? 1 : 0)
      + (t.traits.has('Albino') ? 2 : 0) + (t.traits.has('Temperamental') ? 1 : 0) + (dec > 0 ? 2 : 0);
    if (this.trickAvailable && roll > 10 && !t.beast) {
      let ok = false;
      if (f.species === 'medusa') {
        this.log('trick', `${f.name} meets ${t.name}'s eyes.`, { actor: f.idx, target: t.idx });
        ok = inflict(this, f, t, 'STUNNED', 2);
        if (ok) this.log('trick', `${t.name} is turned to stone, for now.`, { actor: f.idx, target: t.idx });
      } else {
        const type = t.traits.has('Albino') ? 5 : t.traits.has('Temperamental') && coin() ? 0 : roll % 5;
        if (type === 0) {
          this.log('trick', `${f.name} nips ${t.name}'s tail and dances away.`, { actor: f.idx, target: t.idx });
          ok = inflict(this, f, t, 'ENRAGED', 3);
        } else {
          if (type === 1 && f.hp > 10 && armed(t) && !fists(t)) {
            this.log('trick', `${f.name} hooks a claw under ${t.name}'s harness straps.`, { actor: f.idx, target: t.idx });
            ok = tryDisarm(this, f, t, roll, 4);
          }
          if (!ok) {
            this.log('trick', `${f.name} kicks dust in ${t.name}'s eyes.`, { actor: f.idx, target: t.idx });
            ok = tryBlind(this, f, t, roll + (lineHas(f.w, 'Solar') || lineHas(f.item, 'Solar') ? 5 : 0), 2);
          }
        }
      }
      if (ok) this.trickAvailable = false;
      else this.log('trick', `${t.name} is having none of it.`, { actor: f.idx, target: t.idx });
      return;
    }
    // shield slam (once per fighter)
    if (lineHas(f.off, 'ShieldBash') && shieldUp(f) && !f.shieldSlamUsed && !lineHas(t.off, 'ShieldBash') && !has(t, 'STUNNED')) {
      if (rand(10) + (f.I > t.I ? 1 : 0) + (f.S > t.S ? 1 : 0) + dec > 8) {
        f.shieldSlamUsed = true;
        this.log('trick', `${f.name} slams its bash plate into ${t.name}.`, { actor: f.idx, target: t.idx });
        if (!tryStun(this, f, t, f.off!.l.blk + f.S + f.I + f.F, 2)) this.log('trick', `${t.name} keeps its feet.`, { actor: f.idx, target: t.idx });
        return;
      }
    }
    // solar flash (once per fighter, not on beasts)
    if ((lineHas(f.w, 'Solar') || lineHas(f.off, 'Solar') || lineHas(f.item, 'Solar')) && !f.solarUsed && !t.beast) {
      const n = rand(10);
      if (n + (f.I > t.I ? 1 : 0) + (f.C > t.C ? 1 : 0) > 8) { // GM compared cunning to the target's strength
        f.solarUsed = true;
        this.log('trick', `${f.name} flashes sunlight off its gear into ${t.name}'s eyes.`, { actor: f.idx, target: t.idx });
        if (!tryBlind(this, f, t, n + tr(f.C / 2) + tr(f.I / 2) + f.F, 1)) this.log('trick', `${t.name} squints through it.`, { actor: f.idx, target: t.idx });
        f.solarPts += 2;
        return;
      }
    }
    // caltrops
    if (f.caltrops > 0 && roll > 5 && !has(t, 'CALTROPS')) {
      f.caltrops--;
      const P = rand(5) + f.caltropsPow + (f.I > t.I ? 1 : 0) + (f.C > t.C ? 1 : 0) + tr(f.C / 4) + tr(f.I / 4) + f.F;
      this.log('trick', `${f.name} scatters caltrops under ${t.name}.`, { actor: f.idx, target: t.idx });
      if (P > tr(t.I / 5) + tr(t.C / 5) + t.F) inflict(this, f, t, 'CALTROPS', 4);
      else this.log('trick', `${t.name} picks its way around them.`, { target: t.idx });
    }
  }

  // -------------------------------------------------------------------------------------------
  // knockouts, surrender, end
  // -------------------------------------------------------------------------------------------

  private postAction(actor: Fighter): void {
    for (const e of this.f) {
      if (e.out) continue;
      if (e.hp < 1) this.knockOut(e);
      else if (e.side !== actor.side) this.checkSurrender(e, actor);
    }
    for (const s of [0, 1] as const) {
      const live = this.living(s);
      // temporary helpers (mandrakes, escaped beasts, loaned allies) do not fight on alone
      if (live.length && live.every((f) => f.temporary) && this.f.some((f) => f.side === s && !f.temporary)) {
        for (const f of live) {
          f.out = true;
          this.log('info', `${f.name} has nobody left to fight for and scuttles off.`, { actor: f.idx });
        }
      }
    }
    const l0 = this.living(0).length;
    const l1 = this.living(1).length;
    if (l0 === 0 || l1 === 0) this.winner = l0 === 0 && l1 === 0 ? actor.side : l0 === 0 ? 1 : 0;
  }

  private knockOut(e: Fighter): void {
    e.out = true;
    e.ko = true;
    e.koBy = e.lastAttacker;
    this.releaseNetOn(e);
    e.netOn = null;
    const a = e.koBy !== undefined ? this.f[e.koBy] : undefined;
    this.log('ko', flav(KO_TEXT, this.lines.length).replace('{t}', e.name), { actor: a?.idx, target: e.idx });
    if (a && a.side !== e.side) {
      let kb = 0;
      if (a.instruction === 'kill') kb = a.hp > a.H / 2 ? 3 : 2;
      else if (a.instruction === 'allout') kb = 1;
      else if (a.instruction === 'care' || a.instruction === 'throw') kb = -1;
      if (a.traits.has('Careful')) kb -= 1;
      e.koBonus = kb;
      if (a.adv && a.species === 'allosaurus' && !a.out) this.heal(a, tr(a.H * 0.15), 'feeds on the kill');
    }
  }

  private checkSurrender(e: Fighter, a: Fighter): void {
    if (e.beast || e.temporary || this.opts.toTheDeath) return;
    let x = rand(30);
    if (e.traits.has('SpartanResolve')) x = tr(x / 2) - 5;
    const p = e.startHp > 0 ? tr((e.hp * 100) / e.startHp) : 0;
    let y = false;
    switch (e.instruction) {
      case 'throw': y = p < x + 20; break;
      case 'care': y = p < tr(x / 2) + 10; break;
      case 'default':
        y = p < tr(x / 2) && ((a.hp > a.H / 2 && x % 2 === 0) || (a.causesFear && a.hp > a.H / 4));
        break;
      default: break;
    }
    if (!y && e.loyalty < 60 && p < tr(x / 2) + 10 - tr(e.loyalty / 10)) y = true;
    if (!y) return;
    e.out = true;
    e.yielded = true;
    this.releaseNetOn(e);
    e.netOn = null;
    this.log('yield', flav(YIELD_TEXT, this.lines.length).replace('{t}', e.name), { actor: a.idx, target: e.idx });
  }

  private timeout(): void {
    this.decidedBy = 'crowd';
    const l0 = this.living(0);
    const l1 = this.living(1);
    if (l0.length !== l1.length) {
      this.winner = l0.length > l1.length ? 0 : 1;
      this.endText = `Time! ${this.sides[this.winner].name} has more fighters standing and takes it.`;
      return;
    }
    const score = (list: Fighter[]) => list.reduce((s, f) => s + (f.temporary ? 1 : Math.max(0, f.hp)) + 5 * Math.max(0, f.fameBonus)
      + (!this.opts.event && f.traits.has('ShowMan') ? 50 : 0), 0); // GM counted Magnificent for the first side only
    const c0 = score(l0);
    const c1 = score(l1);
    if (c0 !== c1) this.winner = c0 > c1 ? 0 : 1;
    else this.winner = this.sides[0].influence >= this.sides[1].influence ? 0 : 1;
    this.endText = `Time! The crowd roars for ${this.sides[this.winner].name}, and the editor agrees.`;
  }

  // -------------------------------------------------------------------------------------------
  // outcomes (GM handleAllInjuriesAndRewards)
  // -------------------------------------------------------------------------------------------

  private result(rounds: number): BattleResult {
    const winner = (this.winner ?? 0) as 0 | 1;
    const decided = this.decidedBy === 'ko';
    const forfeit = this.decidedBy === 'forfeit';
    const real = (s: 0 | 1) => this.f.filter((f) => f.side === s && !f.temporary);
    const sumWorth = (l: Fighter[]) => l.reduce((s, f) => s + worth(f.bf.creature), 0);
    const ww = Math.max(1, sumWorth(real(winner)));
    const lw = Math.max(1, sumWorth(real(winner === 0 ? 1 : 0)));
    const winXp = Math.min(250, tr((lw * 40) / ww) + 10);
    const loseXp = Math.max(1, Math.min(250, tr((ww * 20) / lw) + 10));
    const losers = real(winner === 0 ? 1 : 0);
    const ruthless = this.f.some((f) => f.side === winner && !f.out && f.traits.has('Ruthless'));
    const giantFoe = losers.some(isGiant);
    const oneVone = this.f.filter((f) => f.side === 0).length === 1 && this.f.filter((f) => f.side === 1).length === 1;

    const outcomes: CombatOutcome[] = this.f.map((f) => {
      const c = f.bf.creature;
      const won = f.side === winner;
      const o: CombatOutcome = {
        creatureId: c.id, side: f.side, knockedOut: f.ko, yielded: f.yielded, died: false, injury: null, xp: 0, fame: 0,
        loyalty: 0, newTraits: [], hpEnd: f.hp, hpMax: f.H, biggestHit: f.biggestHit,
      };
      if (f.temporary) { o.temporary = true; return o; }
      if (f.koBy !== undefined) o.killedBy = this.f[f.koBy].id;
      if (forfeit) return o;
      // ---- injuries & death (GM 13); none at all in exhibitions
      let mod = 0;
      if (f.instruction === 'allout' || f.instruction === 'kill') mod += 1;
      else if (f.instruction === 'care') mod -= 1;
      else if (f.instruction === 'throw') mod -= 2;
      if (f.yielded) mod -= 2;
      mod += f.koBonus;
      if (f.executed) mod += 1;
      if (f.impactHit) mod += 1;
      if (f.hp >= f.startHp) mod -= 1;
      if (f.hp < -15) mod += 1;
      if (f.traits.has('Careful')) mod -= 1;
      const prone = injuryProne(c);
      let m: number;
      let canDie = false;
      if (won || !decided) {
        const pct = f.startHp > 0 ? (f.hp * 100) / f.startHp : 0;
        const risk = pct >= 100 ? -3 : pct > 80 ? -1 : pct > 50 ? 0 : 1;
        m = prone + risk + mod;
      } else {
        m = prone + 5 + this.sides[f.side].injuryMod + mod + (ruthless ? 1 : 0);
        canDie = true;
      }
      const inj = this.extra.exhibition ? null : rollInjury(m, canDie);
      const deathMatch = !!this.opts.toTheDeath && decided && !won && !this.extra.exhibition;
      if (deathMatch) {
        o.died = true;
        o.deathCause = 'Cut down in a fight to the death';
      } else if (inj) {
        const poultice = lineHas(f.item, 'Bandage');
        if (poultice) {
          o.injury = bandage(inj);
          o.bandageUsed = true;
        } else if (inj === 'dead') {
          o.died = true;
        } else {
          o.injury = injuryOf(inj);
        }
      }
      if (f.antidoteUsed) o.antidoteUsed = true;
      // ---- XP, fame, tameness (GM 22)
      o.xp = won ? winXp : loseXp;
      if (f.beast) o.fame = won ? tr(o.xp / 5) : tr(o.xp / 5) - 20;
      else if (won) o.fame = tr(o.xp / 9) + (f.traits.has('GlorySeeker') || f.traits.has('Freedom') ? 1 : 0) + f.fameBonus + (f.carthageSet ? 3 : 0);
      else o.fame = tr((o.xp - 125) / 5);
      o.loyalty = won ? 2 : -2;
      o.favour = f.F;
      if (f.woundedHuman) o.woundedHuman = true;
      // ---- trait unlocks (winners)
      if (won && !o.died) {
        const add = (t: TraitId) => { if (!f.traits.has(t) && !o.newTraits.includes(t)) o.newTraits.push(t); };
        if (f.suddenDeath) add('SuddenDeath');
        if (f.dual && !f.traits.has('DualWield') && rand(100) + (c.species === 'iguanodon' ? 1 : 0) > 96) add('DualWield');
        if (f.pilum && !f.traits.has('ExplosiveRelease') && rand(100) + f.C > 105) add('ExplosiveRelease');
        if (f.traits.has('Giant') && !f.traits.has('Titan') && giantFoe) add('Titan');
        if (f.causedBlind && f.causedStun && f.causedDisarm) add('Underhanded');
        if (f.F > 3) add('CelestialChampion');
        const blindTrait = f.traits.has('Blind');
        if ((blindTrait || (f.wasBlinded && oneVone)) && !f.traits.has('BlindFighter') && rand(30) < (blindTrait ? 2 : 1)) add('BlindFighter');
        if (!f.beast && fists(f) && f.biggestHit > 15 && !f.traits.has('Pugilist') && rand(60) === 0) add('Pugilist');
        if (f.biggestHit > 39) add('Impact');
        if (this.sides[f.side].player && f.rider && !f.riderSummoned && f.H > 40 && baseArmor(f) > 20 && rand(2) === 0) add('Cataphractoi');
        if (f.beast && CARNIVORES.has(f.species) && f.biggestHit > 14 && !f.traits.has('Carnivorous') && rand(5) === 0) add('Carnivorous');
      }
      // ---- Hand of Midas
      if (f.midas && !this.opts.event) {
        o.midasCoins = won ? rand(2 * f.F + 25 + tr(c.fame / 200)) : rand(f.F + 10);
      }
      return o;
    });
    // Killer to the (non-beast) killer of each slain fighter
    for (const o of outcomes) {
      if (!o.died || !o.killedBy) continue;
      const k = this.f.find((f) => f.id === o.killedBy);
      const ko = outcomes.find((x) => x.creatureId === o.killedBy);
      if (!k || !ko || k.beast || k.temporary || k.traits.has('Killer') || ko.newTraits.includes('Killer')) continue;
      ko.newTraits.push('Killer');
    }
    // log consequences
    for (const o of outcomes) {
      const f = this.f.find((x) => x.id === o.creatureId)!;
      if (o.died) this.log('info', `${f.name} does not get up again.`, { target: f.idx });
      else if (o.bandageUsed) this.log('info', `A keeper slaps a poultice on ${f.name}'s wounds.`, { target: f.idx });
      if (o.midasCoins) this.log('info', `${f.name}'s Hand of Midas scatters ${o.midasCoins} coins in the sand.`, { actor: f.idx });
    }
    this.log('end', this.endText);
    const fighters: BattleResult['fighters'] = this.f.map((f) => {
      const c = f.bf.creature;
      const e: BattleResult['fighters'][number] = {
        id: c.id, name: f.name, species: c.species, side: f.side, hpMax: f.hpMax0, colors: [...(c.genes.colors ?? [])],
        sex: c.sex, maturity: c.maturity,
      };
      if (f.rider) e.rider = true;
      if (f.w) e.weapon = f.w.g.type;
      if (f.armor) e.armor = f.armor.g.type;
      return e;
    });
    const cheated: [boolean, boolean] = [
      this.sides[0].modifiers.includes('PoisonedWeapons') || this.sides[1].modifiers.includes('Chained'),
      this.sides[1].modifiers.includes('PoisonedWeapons') || this.sides[0].modifiers.includes('Chained'),
    ];
    const playerSide = this.sides[0].player ? 0 : this.sides[1].player ? 1 : undefined;
    return { winner, decidedBy: this.decidedBy, rounds, log: this.lines, fighters, outcomes, cheated, ...(playerSide !== undefined ? { playerSide } : {}) };
  }
}

/** Extra resolve flags not carried by BattleOptions. */
export interface ResolveExtra {
  /** exhibition bout: no injury rolls and no deaths */
  exhibition?: boolean;
}

/** Simulate a battle. Pure with respect to creatures and gear (only reads them). */
export function resolveBattle(sides: [BattleSide, BattleSide], opts: BattleOptions, extra: ResolveExtra = {}): BattleResult {
  return new Battle(sides, opts, extra).run();
}
