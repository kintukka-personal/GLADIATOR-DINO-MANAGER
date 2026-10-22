// The 31 techniques (GM 01 §11.3), with GM formulas. Coefficients are truncated per term as in GM.
// Each technique replaces a main-hand attack that hit; it computes its own damage and effects.

import type { TechId } from '../types';
import { TECHNIQUES } from '../data/techniques';
import { rand, coin } from '../rng';
import type { Battle } from './battle';
import type { Fighter } from './model';
import {
  alive, armed, disarmed, fists, fam, has, helmetUp, impaired, lineHas, negative, shieldUp, armorUp, NEGATIVE,
} from './combatant';
import {
  addStatus, boost, deceptiveCount, removeStatus, tryBleed, tryBlind, tryDisarm, tryStun, trySunder,
} from './statuses';

const tr = Math.trunc;
/** "×W": x + int(x × W / 10) */
const wm = (x: number, W: number): number => x + tr((x * W) / 10);

/** Technique context: attacker, primary target, rank, damage field d, crit flag and weapon points W. */
export interface TX {
  b: Battle;
  a: Fighter;
  t: Fighter;
  id: TechId;
  r: number;
  d: number;
  crit: boolean;
  W: number;
}

export interface TechImpl {
  usable?: (x: TX) => boolean;
  prio?: (x: TX, p: number) => number;
  run: (x: TX) => void;
}

const pachy = (a: Fighter): number => (a.species === 'pachycephalosaurus' ? 5 : 0);
const solar = (a: Fighter): boolean => lineHas(a.w, 'Solar') || lineHas(a.off, 'Solar') || lineHas(a.item, 'Solar');
const below = (f: Fighter, frac: number): boolean => f.hp < f.H * frac;

interface StrikeOpts { piercing?: boolean; fireball?: boolean; splash?: boolean; weapon?: boolean; verb?: string }

/** Deal technique damage to one target (through TakeDamage), log it and run on-hit effects. */
function strike(x: TX, tgt: Fighter, dmg: number, o: StrikeOpts = {}): number {
  const { a, b } = x;
  const def = TECHNIQUES[x.id];
  const weaponHit = (o.weapon ?? def.weaponAttack) && armed(a);
  const weapon = weaponHit ? a.w : null;
  const before = tgt.hp;
  const dealt = b.hit(a, tgt, dmg, {
    crit: x.crit, tech: x.id, piercing: o.piercing ?? def.piercing, fireball: o.fireball, splash: o.splash,
    weapon, weaponHit, slot: 'main',
  });
  if (b.lastCountered) return 0;
  b.techLog(x, tgt, dealt, before, o.verb);
  if (!o.splash) b.onHit(a, tgt, dealt, { crit: x.crit, weapon, weaponHit, slot: 'main', tech: x.id });
  return dealt;
}

function otherEnemies(x: TX, exclude: Fighter[]): Fighter[] {
  return x.b.enemies(x.a).filter((e) => !exclude.includes(e) && alive(e));
}

export const TECHS: Record<TechId, TechImpl> = {
  Smash: {
    run: (x) => {
      const { a } = x;
      strike(x, x.t, wm(tr(1.3 * a.S) + x.d + a.B + (x.crit ? a.S : 0), x.W));
    },
  },

  Kick: {
    prio: (x, p) => p + (has(x.t, 'STUNNED') ? -2 : 0) + (disarmed(x.a) ? 2 : 0),
    run: (x) => {
      const { a, t } = x;
      const dmg = tr(0.35 * a.S) + tr(0.55 * a.I) + tr(0.35 * a.C) + x.d + a.B + (x.crit ? a.S : 0);
      strike(x, t, dmg);
      if (alive(t)) tryStun(x.b, a, t, boost(a, x.r + dmg + a.F) + pachy(a), 2);
    },
  },

  Lunge: {
    prio: (x, p) => p + (x.a.hp >= x.a.H ? 2 : 0),
    run: (x) => {
      const { a } = x;
      const unhurt = a.hp >= a.startHp;
      const dmg = tr(0.75 * a.S) + tr(0.35 * a.I) + (unhurt ? 2 * x.d : x.d) + a.B + (x.crit ? tr(a.S / 2) + tr(a.I / 3) : 0);
      strike(x, x.t, wm(dmg, x.W));
    },
  },

  Sunder: {
    prio: (x, p) => {
      const t = x.t;
      const anySundered = has(t, 'SHIELD_SUNDERED') || has(t, 'HELMET_SUNDERED') || has(t, 'ARMOR_SUNDERED');
      const sunderable = shieldUp(t) || helmetUp(t) || armorUp(t);
      if (!anySundered && sunderable) return p + (shieldUp(t) ? 4 : 2) + (helmetUp(t) && armorUp(t) ? 2 : 0);
      return p - tr(x.r / 2);
    },
    run: (x) => {
      const { a, t, r, d } = x;
      const G = tr((a.S + tr(a.I / 2) + a.C + d) / 2) + r + a.F;
      const dmg = tr(G / 2) + tr(a.S / 2) + d + a.B + (x.crit ? tr(a.S / 2) + tr(a.I / 4) + tr(a.C / 4) : 0);
      strike(x, t, wm(dmg, x.W));
      // GM adds favour twice (once inside G); counted once here
      if (alive(t)) trySunder(x.b, a, t, boost(a, G + 5 * r), 10);
    },
  },

  ThrowSand: {
    prio: (x, p) => (has(x.t, 'BLINDED') ? -1 : p + x.r + 1 + (disarmed(x.a) ? 1 : 0)),
    run: (x) => {
      const { a, t, r, b } = x;
      b.log('tech', `${a.name} kicks dust at ${t.name}'s eyes.`, { actor: a.idx, target: t.idx, tech: x.id });
      const P = 3 + 3 * r + a.C + a.F + 5 * deceptiveCount(a) + (solar(a) ? 5 : 0);
      if (!tryBlind(b, a, t, P, 3)) return;
      const foes = b.enemies(a);
      if (a.C > 2 * t.C && foes.length >= 2 && r > 1) {
        const t2 = otherEnemies(x, [t])[0];
        if (!t2) return;
        const ok2 = tryBlind(b, a, t2, 3 * r + 3 + tr(a.C / 2) + a.F, 3);
        if (ok2 && a.C > 2 * t2.C && foes.length >= 3 && r > 9) {
          const t3 = otherEnemies(x, [t, t2])[0];
          if (t3) tryBlind(b, a, t3, 2 * r + 3 + tr(a.C / 3) + a.F, 3);
        }
      }
    },
  },

  Parry: {
    prio: (x, p) => p + (below(x.a, 0.5) ? 1 : 0),
    run: (x) => {
      const { a, b, r } = x;
      b.log('tech', `${a.name} plants its feet and waits to Counter.`, { actor: a.idx, target: x.t.idx, tech: x.id });
      addStatus(b, a, 'PARRY', 1, r, a.idx, true);
      const sumI = b.enemies(a).reduce((s, e) => s + Math.max(0, e.I), 0);
      if (rand(3 + sumI) - 3 * r < 5) addStatus(b, a, 'DEFLECT', 1, 0, a.idx, true);
    },
  },

  Headbutt: {
    prio: (x, p) => p + (has(x.t, 'STUNNED') ? -1 : 1) - (has(x.t, 'BLINDED') ? 1 : 0) - (x.t.hp > x.a.hp ? 1 : 0)
      + (disarmed(x.a) ? 1 : 0),
    run: (x) => {
      const { a, t, r, d, b } = x;
      let core = tr(0.5 * a.S) + tr(0.2 * a.H) + (x.crit ? a.S : 0);
      const hb = helmetUp(a) ? a.helmet!.l.blk + a.heirloomBlk : 0;
      core += tr((core * hb) / 10);
      strike(x, t, d + core + a.B);
      // self-stun: impaired until the next turn, no lost turn
      tryStun(b, a, a, tr(core / 2) + tr(t.H / 10) - a.F - r, 1);
      if (alive(t)) tryStun(b, a, t, boost(a, r + core + a.F) + 3 * r + pachy(a), 2);
    },
  },

  Feint: {
    prio: (x, p) => {
      if (has(x.t, 'PARRY') || has(x.t, 'BLOCK')) return p + 6;
      if (armed(x.t)) return tr(p / 2) + 1;
      return p;
    },
    run: (x) => {
      const { a } = x;
      const dmg = tr(0.5 * a.S) + tr(0.5 * a.I) + x.d + a.B + (x.crit ? tr(a.S / 2) : 0);
      strike(x, x.t, wm(dmg, x.W), { piercing: true });
    },
  },

  Charge: {
    usable: (x) => !x.a.damagedSinceAttack,
    run: (x) => {
      const { a, t, r, d } = x;
      let dmg = tr(0.75 * a.S) + tr(0.45 * a.I) + d + a.B + (x.crit ? tr(a.S / 2) + tr(a.I / 4) : 0);
      if (a.rider) dmg += d;
      dmg = wm(dmg, x.W);
      strike(x, t, dmg);
      if (alive(t)) tryStun(x.b, a, t, boost(a, 2 * r + dmg + a.F) + 3 * r + pachy(a), 2);
    },
  },

  Decimate: {
    prio: (x, p) => {
      const t = x.t;
      if (tr(t.H / 8) > t.I) return p + 3;
      if (tr(t.H / 6) > t.I) return p + 2;
      if (tr(t.H / 5) > t.I) return p + 1;
      return p;
    },
    run: (x) => {
      const { a, t, d, r } = x;
      const raw = a.S + (tr(t.H / 4) - 3) - (tr(t.I / 2) + tr(t.I / 4)) + d + a.B + (x.crit ? a.S + r : 0);
      strike(x, t, Math.max(d, wm(raw, x.W)));
    },
  },

  Gouge: {
    prio: (x, p) => p + (has(x.t, 'BLINDED') ? 0 : 1),
    run: (x) => {
      const { a, t, r, d } = x;
      const G = tr((a.I + a.C + d + a.B) / 2) + r;
      const dmg = tr(G / 2) + tr(a.S / 2) + tr((d + a.B) / 2) + tr(a.C / 4) + (x.crit ? tr(a.S / 3) + tr(a.I / 3) : 0);
      strike(x, t, wm(dmg, x.W));
      if (alive(t)) tryBlind(x.b, a, t, boost(a, G + 3 * r + a.F, false) + (solar(a) ? 5 : 0), 2);
    },
  },

  Rally: {
    prio: (x, p) => p + 5 * x.b.allies(x.a).filter((f) => negative(f) || has(f, 'BLEEDING')).length + (below(x.a, 0.5) ? 1 : 0),
    run: (x) => {
      const { a, b, r } = x;
      b.log('tech', `${a.name} sounds a Rallying Call. The pack steadies.`, { actor: a.idx, tech: x.id });
      for (const f of b.allies(a)) {
        for (const s of [...NEGATIVE, 'BLEEDING' as const]) removeStatus(b, f, s);
        addStatus(b, f, 'BLOCK', 4, tr(a.C / 2) + 8 * r, a.idx, true);
        addStatus(b, f, 'DEFLECT', 4, 0, a.idx, true);
      }
    },
  },

  Disarm: {
    prio: (x, p) => p + (armed(x.t) && !fists(x.t) ? 2 : 0),
    run: (x) => {
      const { a, t, r, d } = x;
      const G = tr((a.I + a.C + d + a.B) / 2) + r;
      const dmg = tr(G / 2) + tr(0.5 * a.S) + tr((d + a.B) / 2) + tr(a.C / 4) + (x.crit ? tr(a.S / 3) + tr(a.I / 3) : 0);
      strike(x, t, wm(dmg, x.W));
      if (alive(t)) tryDisarm(x.b, a, t, boost(a, G + 2 * r + a.F, false), 5);
    },
  },

  Rampage: {
    prio: (x, p) => p + (below(x.t, 0.5) ? 1 : 0) + (below(x.a, 0.5) ? 1 : 0) + (below(x.a, 0.25) ? 1 : 0),
    run: (x) => {
      const { a, b } = x;
      addStatus(b, a, 'ENRAGED', 3, 0, a.idx, true);
      addStatus(b, a, 'FEEL_NO_PAIN', 3, 0, a.idx, true);
      strike(x, x.t, wm(a.S + x.d + a.B + (x.crit ? a.S : 0), x.W));
    },
  },

  Warcry: {
    prio: (x, p) => {
      const n = x.b.enemies(x.a).length;
      if (n >= 3) return p + 5;
      if (n === 2) return p + (x.a.hp > x.a.H / 2 ? 4 : 2);
      if (n === 1 && x.t.hp > x.a.hp) return p - 1;
      return p;
    },
    run: (x) => {
      const { a, b, r } = x;
      b.log('tech', `${a.name} lets out a Roar that rattles the stands.`, { actor: a.idx, tech: x.id });
      addStatus(b, a, 'WARCRY', 3, r, a.idx, true);
      for (const e of b.enemies(a)) tryStun(b, a, e, boost(a, tr(a.H / 2) + 15 * r - 10 + a.F), 2);
    },
  },

  Cleave: {
    prio: (x, p) => {
      const n = x.b.enemies(x.a).length;
      return p + (n >= 3 ? 4 : n === 2 ? 3 : 0);
    },
    run: (x) => {
      const { a, b } = x;
      const foes = b.enemies(a);
      const n = foes.length;
      for (const e of foes) {
        const dmg = a.S + tr(0.25 * a.I) + x.d + a.B + (x.crit ? tr(a.S / 2) + 1 : 0) - n;
        strike(x, e, wm(Math.max(0, dmg), x.W));
        if (a.out || a.hp < 1) break;
      }
    },
  },

  Execute: {
    usable: (x) => x.t.hp < x.t.H / 2 || x.t.hp < x.d + x.a.S + tr(0.1 * x.a.C),
    prio: (x, p) => (x.t.hp < x.t.H / 3 ? p * 2 : x.t.hp < x.t.H / 2 ? p + 4 : p),
    run: (x) => {
      const { a, b } = x;
      const preview = x.d + a.S + tr(0.1 * a.C);
      const ok = (t: Fighter) => t.hp < t.H / 2 || t.hp < preview;
      const done: Fighter[] = [];
      let t: Fighter | undefined = x.t;
      while (t) {
        done.push(t);
        let dmg = wm(a.S + tr(0.1 * a.C) + x.d + a.B + (x.crit ? a.S : 0), x.W);
        if (!ok(t)) dmg = tr(dmg / 2);
        strike(x, t, dmg);
        if (t.hp >= 1 || a.hp < 1) break;
        t.executed = true;
        t = otherEnemies(x, done)[0];
        if (t) b.log('tech', `${a.name} is already going for ${t.name}'s throat.`, { actor: a.idx, target: t.idx, tech: x.id });
      }
    },
  },

  StrikeAndRoll: {
    prio: (x, p) => p + (below(x.a, 0.5) ? 1 : 0),
    run: (x) => {
      const { a, b } = x;
      strike(x, x.t, wm(a.S + tr(0.25 * a.I) + x.d + a.B + (x.crit ? a.S : 0), x.W));
      const ev = a.st.get('EVADING');
      if (ev) ev.dur = Math.max(ev.dur, 2);
      else addStatus(b, a, 'EVADING', 1, 0, a.idx);
    },
  },

  CheapShot: {
    usable: (x) => impaired(x.t),
    run: (x) => {
      const { a, t, r } = x;
      const core = tr(0.45 * a.S) + tr(0.35 * a.I) + tr(0.7 * a.C) + x.d + a.B + r + (x.crit ? tr(a.C / 2) + tr(a.I / 3) : 0);
      strike(x, t, wm(core, x.W) + x.W);
      if (alive(t)) tryStun(x.b, a, t, boost(a, 2 * r + tr(core / 2) + a.F) + 3 * r, 2);
    },
  },

  ShieldBash: {
    usable: (x) => x.a.beast || shieldUp(x.a),
    prio: (x, p) => p + (has(x.t, 'STUNNED') ? 0 : 4),
    run: (x) => {
      const { a, t, r, b } = x;
      const sb = shieldUp(a) ? a.off!.l.blk : 0;
      let dmg = a.S + tr(0.2 * a.I) + tr(0.2 * a.C) + x.d + a.B + (x.crit ? a.S + 1 : 0);
      dmg += tr((dmg * sb) / 10);
      strike(x, t, dmg);
      addStatus(b, a, 'BLOCK', 4, (sb + r) * 3, a.idx, true);
      // GM counts Momentum twice here; once in ours
      if (alive(t)) trySunder(b, a, t, boost(a, tr((r + dmg + a.F) / 2)), 10);
    },
  },

  HailOfArrows: {
    usable: (x) => x.a.bow && armed(x.a),
    prio: (x, p) => p + (tr(x.a.I / 2) > x.t.I ? 1 : 0) - (x.a.I < x.t.I ? 2 : 0),
    run: (x) => {
      const { a, t, r, b } = x;
      const tI = t.I;
      let n = 1;
      const v = a.I + 24 * r - 4;
      if (v > tI || coin()) {
        n = 2;
        const v1 = v - tr(v / 4);
        if (v1 > tI || (coin() && v1 + 5 > tI)) {
          n = 3;
          const v2 = v1 - tr(v1 / 5);
          if (v2 > tI) {
            n = 4;
            if (v2 - tr(v2 / 5) > tI) n = 5;
          }
        }
      }
      b.log('tech', `${a.name} sprays a Venom Barrage: ${n} globs.`, { actor: a.idx, target: t.idx, tech: x.id });
      for (let i = 0; i < n; i++) {
        const foes = b.enemies(a).filter(alive);
        if (!foes.length || a.hp < 1) break;
        const tgt = foes[rand(foes.length)];
        let dmg = tr(0.15 * a.S) + tr(0.25 * a.I) + tr(0.25 * a.C) + x.d + a.B + (x.crit ? tr(a.S / 4) + 1 : 0);
        if (i > 0 && a.C > tgt.C) dmg += 1;
        strike(x, tgt, wm(dmg, x.W));
      }
    },
  },

  Impale: {
    usable: (x) => x.a.beast || (armed(x.a) && (fam(x.a.w) === 'horn' || x.a.pilum)),
    prio: (x, p) => p + (x.t.hp > 0.9 * x.t.H ? 1 : 0) - (has(x.t, 'BLEEDING') ? 5 : 0) - (x.t.hp < 10 ? 1 : 0) - (x.t.hp < 20 ? 1 : 0),
    run: (x) => {
      const { a, t, r } = x;
      const dmg = wm(tr(0.8 * a.S) + tr(0.3 * a.I) + tr(0.3 * a.C) + x.d + a.B + (x.crit ? a.S : 0), x.W);
      strike(x, t, dmg);
      if (alive(t)) tryBleed(x.b, a, t, boost(a, dmg + 6 * r), 5);
    },
  },

  Uppercut: {
    usable: (x) => x.a.beast || fists(x.a),
    run: (x) => {
      const { a, t, r, b } = x;
      const W = (a.ironJaws || !a.w) && !disarmed(a) ? x.W : 0;
      const dmg = wm(a.S + tr(0.5 * a.I) + tr(x.d / 2) + 1 + a.B + (x.crit ? a.S + tr(a.I / 2) : 0), W);
      strike(x, t, dmg, { weapon: a.ironJaws });
      if (!alive(t)) return;
      const P = r + dmg + a.F;
      if (!tryStun(b, a, t, tr(P / 2) + 2 * r, 2)) tryStun(b, a, t, 2 * P + 2 * r, 4, true);
    },
  },

  Thunderstrike: {
    run: (x) => {
      const { a, b, r, d } = x;
      strike(x, x.t, wm(tr(0.4 * a.S) + tr(0.4 * a.I) + tr(0.3 * a.C) + tr(d / 3) + a.B + (x.crit ? a.S : 0), x.W));
      const splash = a.F * (r + 1) + tr(d / 2) + a.F + r + 1;
      b.log('tech', `Lightning forks across the sand!`, { actor: a.idx, tech: x.id });
      for (const e of b.enemies(a)) {
        strike(x, e, splash, { piercing: true, splash: true, weapon: false, verb: 'scorches' });
        if (alive(e)) tryStun(b, a, e, 2 * splash + 2 * r, 3, true);
      }
    },
  },

  Fireball: {
    run: (x) => {
      const { a, t, r } = x;
      let dmg = tr(0.8 * a.C) + tr(0.25 * a.S) + tr(0.25 * a.I) + x.d + a.B + (x.crit ? tr(a.S / 2) : 0);
      if (a.traits.has('Pyromaniac')) dmg += tr(dmg / 10);
      const dealt = strike(x, t, dmg, { piercing: true, fireball: true });
      if (alive(t)) trySunder(x.b, a, t, boost(a, dealt + 2 * r + a.F, false), 10);
    },
  },

  Hurricane: {
    usable: (x) => !x.a.transformed,
    run: (x) => {
      const { a, b, r, d } = x;
      b.log('tech', `${a.name} whips up a Hurricane of wings and claws!`, { actor: a.idx, tech: x.id });
      for (const e of b.enemies(a)) {
        const W2 = x.W + a.wReach - e.wReach;
        let dmg = tr(0.3 * (a.S + a.I + a.C)) + d + a.B + (x.crit ? tr(a.S / 3) : 0);
        if (W2 > 0) dmg = wm(dmg, W2);
        strike(x, e, dmg);
        const P = r + dmg + a.F;
        if (alive(e)) tryStun(b, a, e, boost(a, P - tr(P / 4)), 2);
        if (a.hp < 1) break;
      }
    },
  },

  Maul: {
    run: (x) => {
      const { a } = x;
      strike(x, x.t, a.S + x.d + a.B + (x.crit ? tr(a.S / 2) : 0));
    },
  },

  Swipe: {
    run: (x) => {
      const { a, b } = x;
      const foes = b.enemies(a);
      for (const e of foes) {
        const dmg = tr(0.5 * a.S) + tr(0.5 * a.I) + x.d + a.B - foes.length + (x.crit ? tr(a.S / 3) + tr(a.I / 3) : 0);
        strike(x, e, Math.max(0, dmg));
        if (a.hp < 1) break;
      }
    },
  },

  Bite: {
    run: (x) => {
      const { a } = x;
      strike(x, x.t, tr(0.5 * a.S) + tr(0.5 * a.I) + x.d + a.B + (x.crit ? tr(a.S / 3) + tr(a.I / 3) : 0));
    },
  },

  Pounce: {
    prio: (x, p) => p + (x.a.attacks === 0 && x.t.attacks === 0 ? 4 : 0),
    run: (x) => {
      const { a, t, r } = x;
      const first = a.attacks === 0 && t.attacks === 0;
      const dmg = tr(0.5 * a.S) + tr(0.35 * a.I) + x.W + x.d + a.B + (x.crit ? tr(a.S / 2) + x.d : 0);
      strike(x, t, dmg);
      if (first && alive(t)) tryStun(x.b, a, t, r + dmg + a.F, 2);
    },
  },

  SneakAttack: {
    prio: (x, p) => p + (impaired(x.t) ? 4 : 0),
    run: (x) => {
      const { a, t, r, b } = x;
      let dmg = tr(0.35 * a.S) + tr(0.35 * a.C) + x.d + a.B + (x.crit ? tr(a.S / 2) + x.d : 0);
      if (b.opts.event) dmg += tr(a.I / 3) + r;
      if (impaired(t)) dmg += tr(a.I / 3) + r;
      strike(x, t, wm(dmg, x.W));
      if (x.crit) addStatus(b, a, 'EVADING', 1, 0, a.idx);
    },
  },
};
