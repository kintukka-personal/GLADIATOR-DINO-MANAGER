// UI screenshots with Playwright (Chromium at /opt/pw-browsers/chromium).
//   npx vite --port 5173 &   then   node scripts/ui-shot.mjs [names…] [--mobile|--desktop] [--dark|--light] [--full]
// Each shot loads a dev deep link (#dev/<screen>/<tab>) that boots the dev fixture and opens a screen.
// Output: $SHOT_DIR (default: <tmp>/jl-shots). Console errors are printed per shot.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const OUT = process.env.SHOT_DIR || join(tmpdir(), 'jl-shots');
mkdirSync(OUT, { recursive: true });

/** name, hash, optional click selectors run in order, optional extra wait */
const SHOTS = [
  { name: 'menu', hash: '#dev/menu' },
  { name: 'newgame', hash: '#dev/newgame' },
  { name: 'newgame-heritage', hash: '#dev/newgame', fill: [['#ng-lanista', 'Quintus']], click: ['#ng-next'] },
  { name: 'newgame-rules', hash: '#dev/newgame', fill: [['#ng-lanista', 'Quintus']], click: ['#ng-next', '#ng-next2'] },
  { name: 'hub', hash: '#dev/hub' },
  { name: 'hub-story', hash: '#dev/hub', click: ['#attn-conversation'], wait: 2600 },
  { name: 'hub-decision', hash: '#dev/hub', click: ['#attn-decision'] },
  { name: 'drawer', hash: '#dev/hub', click: ['#sb-menu'], mobileOnly: true },
  { name: 'ludus', hash: '#dev/ludus' },
  { name: 'ludus-training', hash: '#dev/ludus/training' },
  { name: 'ludus-armory', hash: '#dev/ludus/armory' },
  { name: 'dino-stats', hash: '#dev/dino/first/stats' },
  { name: 'dino-genetics', hash: '#dev/dino/bred/genetics' },
  { name: 'dino-techniques', hash: '#dev/dino/first/techniques' },
  { name: 'dino-traits', hash: '#dev/dino/first/traits' },
  { name: 'dino-gear', hash: '#dev/dino/first/gear' },
  { name: 'dino-style', hash: '#dev/dino/first/style' },
  { name: 'breeding-pairs', hash: '#dev/breeding/pairs' },
  { name: 'breeding-newpair', hash: '#dev/breeding/pairs', click: ['#pair-new'] },
  { name: 'breeding-hatchery', hash: '#dev/breeding/hatchery' },
  { name: 'breeding-nursery', hash: '#dev/breeding/nursery' },
  { name: 'breeding-pantry', hash: '#dev/breeding/pantry' },
  { name: 'breeding-bloodlines', hash: '#dev/breeding/bloodlines' },
  { name: 'market-dinos', hash: '#dev/market/dinos' },
  { name: 'market-goods', hash: '#dev/market/goods' },
  { name: 'market-eggs', hash: '#dev/market/eggs' },
  { name: 'market-keepers', hash: '#dev/market/keepers' },
  { name: 'arena', hash: '#dev/arena' },
  { name: 'estate', hash: '#dev/estate' },
  { name: 'finance', hash: '#dev/finance' },
  { name: 'messages', hash: '#dev/messages' },
  { name: 'objectives', hash: '#dev/objectives' },
  { name: 'events', hash: '#dev/events' },
  { name: 'intrigue', hash: '#dev/intrigue' },
  { name: 'results', hash: '#dev/results' },
  { name: 'results-hatch', hash: '#dev/results', click: ['#result-next', '#result-next', '#result-next'] },
  { name: 'results-report', hash: '#dev/results', click: ['#result-next', '#result-next', '#result-next', '#result-next', '#result-next'] },
  { name: 'battle', hash: '#dev/battle', wait: 2600 },
  { name: 'battle-end', hash: '#dev/battle', click: ['#battle-skip'], wait: 900 },
  { name: 'codex', hash: '#dev/codex/species' },
  { name: 'settings', hash: '#dev/settings' },
  { name: 'upgrades', hash: '#dev/upgrades' },
  { name: 'gallery', hash: '#gallery', full: true },
];

const args = process.argv.slice(2);
const names = args.filter((a) => !a.startsWith('--'));
const flags = new Set(args.filter((a) => a.startsWith('--')));
const viewports = [
  { tag: 'm', width: 390, height: 844, scale: 2, mobile: true },
  { tag: 'd', width: 1280, height: 800, scale: 1, mobile: false },
].filter((v) => (flags.has('--mobile') ? v.mobile : flags.has('--desktop') ? !v.mobile : true));
const schemes = ['dark', 'light'].filter((s) => (flags.has('--dark') ? s === 'dark' : flags.has('--light') ? s === 'light' : true));
const list = SHOTS.filter((s) => !names.length || names.some((n) => s.name === n || s.name.startsWith(`${n}-`) || (n.endsWith('*') && s.name.startsWith(n.slice(0, -1)))));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-dev-shm-usage'] });
const files = [];
let errors = 0;
for (const vp of viewports) {
  for (const scheme of schemes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
      colorScheme: scheme,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      reducedMotion: 'no-preference',
    });
    for (const s of list) {
      if (s.mobileOnly && !vp.mobile) continue;
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
      page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
      try {
        await page.goto(BASE + s.hash, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(500);
        for (const [sel, val] of s.fill ?? []) await page.fill(sel, val);
        for (const sel of s.click ?? []) {
          await page.click(sel, { timeout: 5000 });
          await page.waitForTimeout(350);
        }
        await page.waitForTimeout(s.wait ?? 250);
        const file = join(OUT, `${s.name}.${vp.tag}.${scheme}.png`);
        await page.screenshot({ path: file, fullPage: !!(s.full || flags.has('--full')) });
        files.push(file);
        // horizontal overflow check
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) logs.push(`horizontal overflow: ${overflow}px`);
      } catch (e) {
        logs.push(`shot failed: ${e.message.split('\n')[0]}`);
      }
      if (logs.length) {
        errors += logs.length;
        console.log(`[${s.name} ${vp.tag} ${scheme}]`, logs.join(' | '));
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`${files.length} screenshots in ${OUT}${errors ? `, ${errors} problems logged above` : ''}`);
