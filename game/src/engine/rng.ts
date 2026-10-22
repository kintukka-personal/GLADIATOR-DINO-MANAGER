// Seeded RNG (mulberry32). One shared generator, state persisted in world.rng.
// rand(n) mirrors Java's Random.nextInt(n): uniform integer in 0..n-1.

let s = 0x9e3779b9 | 0;

export function setSeed(seed: number): void {
  s = seed | 0;
}

export function getSeed(): number {
  return s;
}

function next(): number {
  s = (s + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** float in [0,1) */
export function random(): number {
  return next();
}

/** uniform integer 0..n-1 (n <= 0 returns 0) */
export function rand(n: number): number {
  n = Math.floor(n);
  if (n <= 0) return 0;
  return Math.floor(next() * n);
}

/** inclusive integer range */
export function range(lo: number, hi: number): number {
  if (hi < lo) return lo;
  return lo + rand(hi - lo + 1);
}

/** true with probability p (0..1) */
export function chance(p: number): boolean {
  return next() < p;
}

export function coin(): boolean {
  return next() < 0.5;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[rand(arr.length)];
}

export function pickOr<T>(arr: readonly T[], fallback: T): T {
  return arr.length ? arr[rand(arr.length)] : fallback;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** weighted pick; weights must be >= 0 */
export function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return items[rand(items.length)];
  let r = next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Java-style integer division (truncate toward zero). */
export function idiv(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.trunc(a / b);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
