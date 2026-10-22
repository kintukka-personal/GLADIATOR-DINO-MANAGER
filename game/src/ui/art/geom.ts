// Path helpers for the procedural creature art. All art is authored in a 240×160 box, side view,
// facing right, ground at y≈148.

export type P2 = [number, number];
/** spine point with width */
export type P3 = [number, number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
export function smoothClosed(pts: P2[], tension = 1): string {
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Smooth open path (for strokes: jaw lines, ribs). */
export function smoothOpen(pts: P2[], tension = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

export const blob = (pts: P2[]): string => smoothClosed(pts);

/** Sharp polygon. */
export function poly(pts: P2[]): string {
  return `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L')}Z`;
}

/**
 * A tapered limb/tail/neck: a spine of points with widths, outlined and smoothed.
 * Width 0 at an end gives a point; otherwise the end is rounded.
 */
export function tube(pts: P3[]): string {
  const n = pts.length;
  if (n < 2) return '';
  const L: P2[] = [];
  const R: P2[] = [];
  const T: P2[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, w] = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    T.push([tx, ty]);
    const nx = -ty;
    const ny = tx;
    L.push([x + (nx * w) / 2, y + (ny * w) / 2]);
    R.push([x - (nx * w) / 2, y - (ny * w) / 2]);
  }
  const ring: P2[] = [];
  const w0 = pts[0][2];
  const wn = pts[n - 1][2];
  ring.push(...L.slice(0, wn > 0 ? n : n - 1));
  if (wn > 0) ring.push([pts[n - 1][0] + T[n - 1][0] * wn * 0.45, pts[n - 1][1] + T[n - 1][1] * wn * 0.45]);
  else ring.push([pts[n - 1][0], pts[n - 1][1]]);
  const back = R.slice(0, wn > 0 ? n : n - 1).reverse();
  ring.push(...back);
  if (w0 > 0) ring.push([pts[0][0] - T[0][0] * w0 * 0.45, pts[0][1] - T[0][1] * w0 * 0.45]);
  return smoothClosed(ring);
}

/** Curved horn/claw: base point, tip, base width, sideways bend (positive = to the left of travel). */
export function horn(base: P2, tip: P2, w: number, bend = 0): string {
  const mx = (base[0] + tip[0]) / 2;
  const my = (base[1] + tip[1]) / 2;
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return tube([[base[0], base[1], w], [mx + nx * bend, my + ny * bend, w * 0.55], [tip[0], tip[1], 0]]);
}

/** Kite-like dorsal plate standing on (x, y) with height h, width w, lean (+ = forward). */
export function plate(x: number, y: number, h: number, w: number, lean = 0): string {
  return blob([
    [x - w / 2, y + 2],
    [x - w * 0.42 + lean * 0.3, y - h * 0.55],
    [x + lean, y - h],
    [x + w * 0.42 + lean * 0.55, y - h * 0.5],
    [x + w / 2, y + 2],
    [x, y + 4],
  ]);
}

/** Feather quill from (x,y) pointing in direction (dx,dy). */
export function quill(x: number, y: number, dx: number, dy: number, w = 4): string {
  return tube([[x, y, w], [x + dx * 0.55, y + dy * 0.55, w * 0.8], [x + dx, y + dy, 0]]);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${r1(cx - rx)} ${r1(cy)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(rx * 2)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-rx * 2)} 0Z`;
}

export function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

/** Row of small triangles (teeth) along a line from a to b, pointing down by h. */
export function teeth(a: P2, b: P2, n: number, h = 2.6): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 0.5) / n;
    const t2 = (i + 1) / n;
    const x0 = a[0] + (b[0] - a[0]) * t0;
    const y0 = a[1] + (b[1] - a[1]) * t0;
    const x1 = a[0] + (b[0] - a[0]) * t1;
    const y1 = a[1] + (b[1] - a[1]) * t1;
    const x2 = a[0] + (b[0] - a[0]) * t2;
    const y2 = a[1] + (b[1] - a[1]) * t2;
    d += `M${r1(x0)} ${r1(y0)}L${r1(x1)} ${r1(y1 + h)}L${r1(x2)} ${r1(y2)}Z`;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export const darken = (c: string, t: number) => mix(c, '#000000', t);
export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);

export function luminance(c: string): number {
  const [r, g, b] = hexToRgb(c).map((x) => x / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Small seeded PRNG for per-creature pattern layout. */
export function seeded(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
