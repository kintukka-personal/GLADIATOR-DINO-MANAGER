// Level check for the generative music (the one you can't do by ear): renders ~20 s of every mood through an
// OfflineAudioContext in Chromium (Playwright, /opt/pw-browsers/chromium) on the real engine code — the page
// imports src/ui/music.ts from a Vite dev server this script starts — and reports peak, RMS, the loudest
// 400 ms, a rough spectral balance and the note density per mood. It also renders each sting over its bed.
// WAV files (16-bit stereo) go to --out (default $MUSIC_DIR or <tmp>/jl-music).
//   node scripts/music-render.mjs [--seconds=20] [--out=<dir>] [--url=<running dev server>] [--seed=7]
// Renders are at the default Music volume (one at 100%). Exits 1 when a render clips (peak ≥ 0.95) or a mood
// sits outside −30…−16 dBFS RMS.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SECONDS = Number(arg('seconds', 20));
const SEED = Number(arg('seed', 7));
const OUT = arg('out', process.env.MUSIC_DIR || join(tmpdir(), 'jl-music'));
mkdirSync(OUT, { recursive: true });

const RENDERS = [
  { name: 'title', mood: 'title' },
  { name: 'ludus', mood: 'ludus' },
  { name: 'nursery', mood: 'nursery' },
  { name: 'arena', mood: 'arena', seconds: Math.max(SECONDS, 30) },
  { name: 'battle', mood: 'battle', intensity: 0.15 },
  { name: 'battle-hot', mood: 'battle', intensity: 1 },
  { name: 'battle-100%', mood: 'battle', intensity: 1, volume: 1, seconds: 12 },
  { name: 'night', mood: 'night', seconds: Math.max(SECONDS, 30) },
  { name: 'lament', mood: 'lament' },
  { name: 'sting-victory', mood: 'battle', intensity: 0.6, seconds: 8, sting: { kind: 'victory', at: 2 } },
  { name: 'sting-defeat', mood: 'battle', intensity: 0.6, seconds: 8, sting: { kind: 'defeat', at: 2 } },
  { name: 'sting-hatch', mood: 'ludus', seconds: 7, sting: { kind: 'hatch', at: 2 } },
  { name: 'sting-week', mood: 'ludus', seconds: 7, sting: { kind: 'week', at: 2 } },
];

// ---------------------------------------------------------------------------------------------
// Analysis (node side): FFT band balance of the mono mix
// ---------------------------------------------------------------------------------------------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
}

const BANDS = [['<120', 0, 120], ['120-500', 120, 500], ['500-2k', 500, 2000], ['2k-5k', 2000, 5000], ['>5k', 5000, 1e9]];

function spectrum(wav, sr) {
  const n = (wav.length - 44) / 4;
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const N = 4096;
  const e = BANDS.map(() => 0);
  let cNum = 0, cDen = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= n; s += N) {
    for (let i = 0; i < N; i++) {
      const o = 44 + (s + i) * 4;
      const m = (dv.getInt16(o, true) + dv.getInt16(o + 2, true)) / 65536;
      re[i] = m * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      const b = BANDS.findIndex(([, lo, hi]) => f >= lo && f < hi);
      e[b] += p;
      cNum += f * p; cDen += p;
    }
  }
  const tot = e.reduce((a, b) => a + b, 0) || 1;
  return { bands: e.map((x) => Math.round((100 * x) / tot)), centroid: Math.round(cNum / (cDen || 1)) };
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

let server = null;
let base = arg('url');
if (!base) {
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false } });
  await server.listen();
  base = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`;
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const problems = [];
const rows = [];
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const r of RENDERS) {
    const seconds = r.seconds ?? SECONDS;
    const t0 = Date.now();
    const res = await page.evaluate(async ({ mood, seconds, seed, intensity, sting, volume }) => {
      const m = await import('/src/ui/music.ts');
      const out = await m.renderMusicOffline({ mood, seconds, seed, intensity, sting, volume });
      const b = out.buffer;
      const L = b.getChannelData(0), R = b.getChannelData(1);
      const n = L.length;
      let peak = 0, sum = 0, loud = 0, win = 0, wn = 0;
      const W = Math.floor(b.sampleRate * 0.4);
      for (let i = 0; i < n; i++) {
        const a = Math.abs(L[i]), c = Math.abs(R[i]);
        if (a > peak) peak = a;
        if (c > peak) peak = c;
        const p = L[i] * L[i] + R[i] * R[i];
        sum += p; win += p; wn++;
        if (wn === W) { loud = Math.max(loud, Math.sqrt(win / (2 * W))); win = 0; wn = 0; }
      }
      const buf = new ArrayBuffer(44 + n * 4);
      const v = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, b.sampleRate, true);
      v.setUint32(28, b.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      const bytes = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { peak, rms: Math.sqrt(sum / (2 * n)), loud, counts: out.counts, bpm: out.bpm, sr: b.sampleRate, wav: btoa(s) };
    }, { mood: r.mood, seconds, seed: SEED, intensity: r.intensity ?? 0, sting: r.sting, volume: r.volume });
    const wav = Buffer.from(res.wav, 'base64');
    const file = join(OUT, `${r.name}.wav`);
    writeFileSync(file, wav);
    const sp = spectrum(new Uint8Array(wav), res.sr);
    const c = res.counts;
    const melodic = (c.lyre ?? 0) + (c.aulos ?? 0);
    const drums = ['dum', 'tek', 'tymp', 'low', 'zill'].reduce((k, x) => k + (c[x] ?? 0), 0);
    const row = {
      name: r.name, bpm: res.bpm, peak: res.peak, rmsDb: db(res.rms), loudDb: db(res.loud), melodicPerSec: melodic / seconds, drumsPerSec: drums / seconds,
      growls: c.growl ?? 0, bands: sp.bands, centroid: sp.centroid, ms: Date.now() - t0, file,
    };
    rows.push(row);
    if (row.peak >= 0.95) problems.push(`${r.name}: clips (peak ${row.peak.toFixed(3)})`);
    if (!r.sting && !r.volume && (row.rmsDb < -30 || row.rmsDb > -16)) problems.push(`${r.name}: RMS ${row.rmsDb.toFixed(1)} dBFS outside −30…−16`);
  }
} catch (e) {
  problems.push(`script: ${String(e?.message ?? e).split('\n')[0]}`);
}
await browser.close();
if (server) await server.close();

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`\n${pad('render', 15)}${lpad('bpm', 4)}${lpad('peak', 7)}${lpad('RMS dB', 8)}${lpad('max400', 8)}${lpad('mel/s', 7)}${lpad('drum/s', 7)}${lpad('growl', 6)}  bands % (<120 | 120-500 | 500-2k | 2k-5k | >5k)  centroid`);
for (const r of rows) {
  console.log(`${pad(r.name, 15)}${lpad(r.bpm, 4)}${lpad(r.peak.toFixed(3), 7)}${lpad(r.rmsDb.toFixed(1), 8)}${lpad(r.loudDb.toFixed(1), 8)}${lpad(r.melodicPerSec.toFixed(2), 7)}${lpad(r.drumsPerSec.toFixed(2), 7)}${lpad(r.growls, 6)}  ${r.bands.map((b) => lpad(b, 3)).join(' |')}            ${lpad(r.centroid, 5)} Hz`);
}
console.log(`\nWAV files in ${OUT}`);
if (errors.length) problems.push(...errors.map((e) => `page: ${e}`));
if (problems.length) {
  console.log(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('levels ok: no clipping, every mood inside −30…−16 dBFS RMS');
