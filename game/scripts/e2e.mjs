// End-to-end session on the real engine (no dev fixture), with Playwright + Chromium at /opt/pw-browsers/chromium.
//   npx vite --port 5173 &   then   node scripts/e2e.mjs [--weeks=7] [--desktop] [--light]
// New game → buy a starter and a weapon → register for Rome's Finest → Advance → prepare and fight every match
// (instruction, technique order, harness slot, a bribe) through the battle viewer → results chain → keep playing:
// register every week, answer decisions, stories, schemes and adventures, try one intrigue action and one
// influence unlock. Screenshots of each new screen go to $SHOT_DIR (default <tmp>/jl-e2e). Exits 1 on any
// console error or page error.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const OUT = process.env.SHOT_DIR || join(tmpdir(), 'jl-e2e');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const WEEKS = Number(args.find((a) => a.startsWith('--weeks='))?.slice(8) ?? 7);
const desktop = args.includes('--desktop');
const scheme = args.includes('--light') ? 'light' : 'dark';
const tag = `${desktop ? 'd' : 'm'}.${scheme}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  viewport: desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 },
  deviceScaleFactor: desktop ? 1 : 2, isMobile: !desktop, hasTouch: !desktop, colorScheme: scheme,
});
const page = await ctx.newPage();
const errors = [];
const badToasts = new Set();
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const log = (...a) => console.log('·', ...a);
const wait = (ms) => page.waitForTimeout(ms);
const shots = new Set();
async function shot(name, { force = false, full = false } = {}) {
  if (shots.has(name) && !force) return;
  shots.add(name);
  await page.screenshot({ path: join(OUT, `e2e-${name}.${tag}.png`), fullPage: full });
}
async function visible(sel) {
  try { return await page.locator(sel).first().isVisible(); } catch { return false; }
}
async function enabled(sel) {
  try { const l = page.locator(sel).first(); return (await l.isVisible()) && (await l.isEnabled()); } catch { return false; }
}
async function click(sel, ms = 300) {
  await page.locator(sel).first().click({ timeout: 6000 });
  await wait(ms);
}
async function noteToasts() {
  for (const t of await page.locator('.toast-bad .toast-text').allInnerTexts().catch(() => [])) badToasts.add(t.trim());
}
async function overflow(where) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o > 1) errors.push(`horizontal overflow ${o}px on ${where}`);
}
async function money() {
  const t = await page.locator('.sb-res .money .num').first().innerText().catch(() => '0');
  return Number(t.replace(/[^\d-]/g, '')) || 0;
}

/** Close the battle viewer if it is open (skip to the end, then continue). */
async function closeBattle(name) {
  if (!(await visible('.battle-layer'))) return false;
  if (name) { await wait(1400); await shot(name); }
  if (await visible('#battle-skip')) await click('#battle-skip', 500);
  if (name) await shot(`${name}-end`);
  await click('#battle-done', 400);
  return true;
}

async function toHub() {
  if (await visible('.sb-week')) await click('.sb-week', 400);
}

async function nav(area) {
  if (desktop) await click(`#rail-${area}`, 400);
  else if (['ludus', 'breeding', 'market', 'arena', 'intrigue'].includes(area)) await click(`#tab-${area}`, 400);
  else { await click('#sb-menu', 300); await click(`#drawer-${area}`, 400); }
}

// ---------------------------------------------------------------------------------------------
// Hub chores: stories, decisions, schemes, adventures, expedition tactics
// ---------------------------------------------------------------------------------------------

async function chores() {
  await toHub();
  for (let i = 0; i < 12; i++) {
    await closeBattle();
    if (await visible('#attn-conversation')) {
      await click('#attn-conversation', 400);
      if (await visible('#conv-skip')) await click('#conv-skip', 300);
      const opt = page.locator('[id^="conv-opt-"]:not([disabled])').first();
      if (await opt.isVisible().catch(() => false)) { await shot('story'); await opt.click(); await wait(500); }
      await closeBattle();
      if (await visible('#conv-done')) await click('#conv-done', 400);
      else await page.keyboard.press('Escape');
      log('answered a story');
      continue;
    }
    if (await visible('#attn-decision')) {
      await click('#attn-decision', 400);
      await shot('decision');
      // the last option is usually the cautious one (the first often sends a dino away on an adventure)
      const opt = page.locator('[id^="decision-opt-"]:not([disabled])').last();
      if (await opt.isVisible().catch(() => false)) { await opt.click(); await wait(500); }
      await closeBattle('decision-battle');
      if (await visible('#decision-done')) await click('#decision-done', 400);
      else await page.keyboard.press('Escape');
      log('answered a decision');
      continue;
    }
    if (await visible('#attn-defense')) {
      await click('#attn-defense', 400);
      await shot('defense');
      await click('#defense-passive', 500);
      await shot('defense-outcome');
      await click('#defense-done', 400);
      log('answered a rival scheme');
      continue;
    }
    const adv = page.locator('[id^="attn-adv-"]').first();
    if (await adv.isVisible().catch(() => false)) {
      await adv.click(); await wait(400);
      const choice = page.locator('.sheet .choice-btn').first();
      if (await choice.isVisible().catch(() => false)) await choice.click();
      else await page.locator('.sheet-foot .btn-primary').first().click();
      await wait(500);
      await closeBattle();
      await page.locator('.sheet-foot .btn-primary').first().click().catch(() => undefined);
      await wait(300);
      log('heard an adventure');
      continue;
    }
    if (await visible('#attn-expedition')) {
      await click('#attn-expedition', 500);
      await shot('expedition-tactics');
      await page.locator('[id^="tactic-"]').first().click();
      await wait(600);
      await closeBattle('expedition-battle');
      if (await visible('#exp-done')) await click('#exp-done', 300);
      await toHub();
      log('fought the expedition');
      continue;
    }
    break;
  }
  await noteToasts();
}

// ---------------------------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------------------------

/** Register a free fighter for every open event it fits (preferring the given key). */
async function registerAll(prefer) {
  await nav('arena');
  if (await visible('#arena-tab-week')) await click('#arena-tab-week', 300);
  await shot('arena-week');
  let count = 0;
  const ids = await page.locator('[id^="reg-"]').evaluateAll((els) => els.filter((e) => e.textContent?.trim() === 'Register' && !e.disabled).map((e) => e.id));
  const order = prefer ? [...ids.filter((i) => i === `reg-${prefer}`), ...ids.filter((i) => i !== `reg-${prefer}`)] : ids;
  for (const id of order) {
    if (!(await enabled(`#${id}`))) continue;
    await click(`#${id}`, 400);
    const row = page.locator('.sheet button.crow:not([disabled])').first();
    if (await row.isVisible().catch(() => false)) {
      await row.click(); await wait(200);
      if (count === 0) await shot('register-sheet');
      if (await enabled('#register-go')) { await click('#register-go', 400); count++; log(`registered for ${id.slice(4)}`); }
    }
    if (await visible('.sheet')) await page.keyboard.press('Escape');
    await wait(200);
  }
  return count;
}

async function advance() {
  await click('#sb-advance', 500);
  if (await visible('#advance-confirm')) await click('#advance-confirm', 600);
  await wait(400);
}

async function playTournament(firstWeek) {
  let fights = 0;
  let pitSeen = false;
  for (let i = 0; i < 40; i++) {
    await closeBattle();
    if (await visible('#arena-enter')) {
      await shot('tournament-day');
      await overflow('tournament day');
      await click('#arena-enter', 600);
      continue;
    }
    if (await visible('#arena-fight')) {
      await shot(`match-preview${fights ? '-2' : ''}`);
      await overflow('match preview');
      if (fights === 0) {
        // preparation: instruction, technique order, a harness slot and a bribe
        const care = page.locator('[id^="instr-"][id$="-care"]').first();
        if (await care.isVisible().catch(() => false)) { await care.click(); await wait(200); }
        const tech = page.locator('[id^="tech-"]').first();
        if (await tech.isVisible().catch(() => false)) {
          await tech.click(); await wait(300);
          await shot('technique-order');
          const down = page.locator('[id^="to-down-"]:not([disabled])').first();
          if (await down.isVisible().catch(() => false)) { await down.click(); await wait(200); }
          await click('#tech-done', 300);
        }
        const slot = page.locator('[id^="prep-"][id$="-armor"]').first();
        if (await slot.isVisible().catch(() => false)) {
          await slot.click(); await wait(300);
          await shot('harness-slot');
          await page.keyboard.press('Escape'); await wait(200);
        }
        if (firstWeek && await enabled('#bribe-poison')) { await click('#bribe-poison', 200); log('bribed: poisoned weapons'); }
        await shot('match-prepared', { full: true });
      }
      await click('#arena-fight', 300);
      fights++;
      if (await visible('.battle-layer')) await closeBattle(fights === 1 ? 'battle' : undefined);
      continue;
    }
    if (await visible('#report-next')) {
      await shot('round-report');
      await click('#report-next', 500);
      continue;
    }
    if (await visible('#pit-continue')) {
      await shot('pit-choice');
      if (!pitSeen && await enabled('#pit-continue')) { pitSeen = true; await click('#pit-continue', 500); log('kept fighting in the pits'); }
      else { await click('#pit-retire', 500); log('retired from the pits'); }
      continue;
    }
    if (await visible('#arena-finish')) {
      await shot('final-report');
      await overflow('final report');
      await click('#arena-finish', 900);
      log(`tournament over after ${fights} match${fights === 1 ? '' : 'es'}`);
      return fights;
    }
    await wait(300);
  }
  throw new Error('The tournament flow got stuck.');
}

async function results() {
  for (let i = 0; i < 20; i++) {
    await closeBattle();
    if (await visible('#defeat-menu')) return 'over';
    if (await visible('#result-next')) { await shot(`results-${i}`); await click('#result-next', 300); continue; }
    if (await visible('#result-done')) { await shot('results-last'); await click('#result-done', 500); return 'ok'; }
    await wait(300);
  }
  return 'ok';
}

// ---------------------------------------------------------------------------------------------
// One-off actions
// ---------------------------------------------------------------------------------------------

async function tryIntrigue() {
  await nav('intrigue');
  await shot('intrigue');
  await page.locator('.rival-row').first().click();
  await wait(500);
  await shot('rival-dossier');
  await overflow('rival dossier');
  // trade: look at an offer without making one
  const tc = page.locator('[id^="rc-"]').first();
  if (await tc.isVisible().catch(() => false)) {
    await tc.click(); await wait(300);
    await shot('rival-creature');
    if (await enabled('#rc-offer')) {
      await click('#rc-offer', 400);
      await shot('trade-sheet');
      await page.keyboard.press('Escape'); await wait(200);
    } else await page.keyboard.press('Escape');
    await wait(200);
  }
  const act = (await enabled('#act-steal')) ? '#act-steal' : (await enabled('#act-sabotage')) ? '#act-sabotage' : null;
  if (!act) { log('no agent free for intrigue'); return false; }
  await click(act, 400);
  await shot('agent-sheet');
  await page.locator('[id^="agent-"]').first().click();
  await wait(900);
  await shot('night-scenario');
  await click('#scen-proceed', 1400);
  await closeBattle('raid-battle');
  await shot('intrigue-report');
  await click('#scen-done', 400);
  log(`intrigue: ${act.slice(5)}`);
  return true;
}

async function tryInfluence() {
  await nav('influence');
  await shot('influence');
  await overflow('influence');
  const btn = page.locator('[id^="unlock-"]:not([disabled])').first();
  if (await btn.isVisible().catch(() => false)) {
    const id = await btn.getAttribute('id');
    await btn.click(); await wait(400);
    await shot('influence-unlocked', { force: true });
    log(`unlocked ${id?.slice(7)}`);
    return true;
  }
  return false;
}

async function tour() {
  await nav('arena');
  await click('#arena-tab-calendar', 300); await shot('arena-calendar');
  await click('#arena-tab-league', 300); await shot('arena-league');
  await click('#arena-organize', 300); await shot('organize-sheet');
  await page.keyboard.press('Escape'); await wait(200);
  await click('#arena-tab-week', 200);
  await nav('horde'); await shot('horde'); await overflow('horde');
  await toHub();
  const asc = desktop ? '#quickw-ascension' : '#quick-ascension';
  if (await visible(asc)) { await click(asc, 400); await shot('ascension'); await overflow('ascension'); }
  await nav('settings');
  await shot('settings');
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await click('#menu-new', 400);
  await page.fill('#ng-lanista', 'Quintus');
  await click('#ng-next', 300);
  await click('#ng-next2', 300);
  await click('#ng-create', 800);
  log('new game founded');
  await chores();

  // starter + weapon
  await nav('market');
  await shot('market');
  const buy = page.locator('[id^="buy-c-"]:not([disabled])').first();
  await buy.click(); await wait(400);
  log('bought a starter');
  await click('#market-tab-goods', 300);
  if (await visible('#goods-slot-weapon')) await click('#goods-slot-weapon', 300);
  const wpn = page.locator('[id^="buy-g-"]:not([disabled])').first();
  if (await wpn.isVisible().catch(() => false)) { await wpn.click(); await wait(400); log('bought a weapon'); }
  // a second showman for a little more influence each week
  await nav('finance');
  if (await enabled('#job-wardens-dec')) { await click('#job-wardens-dec', 200); if (await enabled('#job-showmen-inc')) await click('#job-showmen-inc', 200); log('moved a warden to the showmen'); }
  await noteToasts();

  let intrigueDone = false;
  let influenceDone = false;
  for (let w = 1; w <= WEEKS; w++) {
    log(`--- week ${w}: ${await money()} denarii`);
    await chores();
    if (!influenceDone) influenceDone = await tryInfluence();
    if (w === 3 && await money() > 450) {
      // a second dino so one can scheme while another fights
      await nav('market');
      const more = page.locator('[id^="buy-c-"]:not([disabled])').last();
      if (await more.isVisible().catch(() => false)) { await more.click(); await wait(400); log('bought a second fighter'); }
    }
    if (!intrigueDone && w >= 3) intrigueDone = await tryIntrigue();
    const n = await registerAll(w === 1 ? 'romesFinest' : undefined);
    if (w === 1 && n === 0) throw new Error('Could not register for Rome\'s Finest.');
    if (w === 2) await tour();
    await advance();
    if (await visible('#arena-enter') || await visible('#arena-fight') || await visible('#arena-finish')) await playTournament(w === 1);
    const r = await results();
    await noteToasts();
    await overflow(`week ${w}`);
    if (r === 'over') { await shot('defeated'); log('the run ended'); break; }
  }
  await chores();
  await shot('hub-end');
  log(`intrigue ${intrigueDone ? 'done' : 'not tried'}, influence ${influenceDone ? 'unlocked' : 'not affordable'}`);
} catch (e) {
  errors.push(`script: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: join(OUT, `e2e-failure.${tag}.png`) }).catch(() => undefined);
}

await browser.close();
if (badToasts.size) console.log('error toasts seen:', [...badToasts].join(' | '));
console.log(`${shots.size} screenshots in ${OUT}`);
if (errors.length) {
  console.log(`${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log('e2e passed: no console errors');
