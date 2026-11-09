// Browser checks from the idea's "How we'll know it works", run in headless Chromium.
//   node tests/e2e.mjs                 -> serves site/ locally
//   BASE_URL=https://... node tests/e2e.mjs  -> checks a deployed copy (make verify)
// Screenshots land in evidence/ (gitignored; CI uploads them as an artifact).
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serve } from './serve.mjs';

const OUT = process.env.EVIDENCE_DIR || 'evidence';
fs.mkdirSync(OUT, { recursive: true });

let server = null;
let base = process.env.BASE_URL;
if (!base) {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}/`;
}
if (!base.endsWith('/')) base += '/';

const browser = await chromium.launch();
const results = [];
let failed = 0;

async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${e.message}`);
  }
  console.log(results[results.length - 1]);
}

async function open(ctxOpts = {}, query = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...ctxOpts });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SkyHoppers && window.SkyHoppers.snapshot().titleCards.length > 0);
  return { context, page, errors };
}
const snap = (page) => page.evaluate(() => window.SkyHoppers.snapshot());

await check('desktop: title shows all three characters, no console errors', async () => {
  const { context, page, errors } = await open();
  const s = await snap(page);
  assert.equal(s.screen, 'title');
  assert.deepEqual(s.titleCards, ['Puff', 'Tock', 'Mira']);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-title.png` });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('desktop: pick a character, hold right + jump -> moves right and collects a star', async () => {
  const { context, page, errors } = await open();
  await page.keyboard.press('ArrowRight'); // select Tock
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.SkyHoppers.snapshot().screen === 'playing');
  const s0 = await snap(page);
  assert.equal(s0.character, 'tock');
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await page.keyboard.up('Space');
    await page.waitForTimeout(150);
  }
  await page.keyboard.up('ArrowRight');
  const s1 = await snap(page);
  console.log(`     x ${s0.x.toFixed(1)} -> ${s1.x.toFixed(1)}, score ${s0.score} -> ${s1.score}, stars ${s1.stars}`);
  assert.ok(s1.x > s0.x + 50, 'player moved right');
  assert.ok(s1.score > s0.score && s1.stars >= 1, 'a star pickup raised the score');
  await page.screenshot({ path: `${OUT}/2-gameplay.png` });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('desktop: falling off the bottom decrements lives', async () => {
  const { context, page, errors } = await open();
  await page.keyboard.press('Space'); // start as Puff
  await page.waitForFunction(() => window.SkyHoppers.snapshot().screen === 'playing');
  assert.equal((await snap(page)).lives, 3);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.SkyHoppers.snapshot().lives === 2, null, { timeout: 5000 });
  await page.keyboard.up('ArrowLeft');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('desktop: frame time under 16 ms while playing', async () => {
  const { context, page } = await open();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.SkyHoppers.snapshot().screen === 'playing');
  await page.evaluate(() => window.SkyHoppers.resetPerf());
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down('Space'); await page.waitForTimeout(300);
    await page.keyboard.up('Space'); await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowRight');
  const p = await page.evaluate(() => window.SkyHoppers.perf());
  console.log(`     frame work over ${p.samples} frames: avg ${p.avg.toFixed(2)} ms, p95 ${p.p95.toFixed(2)} ms, max ${p.max.toFixed(2)} ms`);
  fs.writeFileSync(`${OUT}/frame-time.json`, JSON.stringify(p, null, 2));
  assert.ok(p.samples > 60, 'enough samples');
  assert.ok(p.p95 < 16, `p95 ${p.p95.toFixed(2)} ms`);
  await context.close();
});

for (const ch of ['puff', 'tock', 'mira']) {
  await check(`autopilot (${ch}) completes level 1 and reaches the rainbow gate`, async () => {
    const { context, page, errors } = await open();
    await page.evaluate((c) => { window.SkyHoppers.debug.setManual(true); window.SkyHoppers.debug.start(c); }, ch);
    const plan = await page.evaluate(() => window.SkyHoppers.debug.autopilot());
    assert.ok(plan.ok, 'solver found a route');
    const half = Math.floor(plan.frames / 2);
    await page.evaluate((n) => window.SkyHoppers.debug.advance(n), half);
    if (ch === 'mira') await page.screenshot({ path: `${OUT}/3-autopilot-midway.png` });
    const s = await page.evaluate((n) => window.SkyHoppers.debug.advance(n), plan.frames - half + 1);
    console.log(`     ${plan.frames} frames, lives ${s.lives}, stars ${s.stars}, score ${s.score}`);
    assert.equal(s.screen, 'levelComplete');
    if (ch === 'mira') await page.screenshot({ path: `${OUT}/4-level-complete.png` });
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('best score persists in localStorage', async () => {
  const { context, page } = await open();
  await page.evaluate(() => { window.SkyHoppers.debug.setManual(true); window.SkyHoppers.debug.start('puff'); window.SkyHoppers.debug.autopilot(); });
  await page.evaluate(() => window.SkyHoppers.debug.advance(3000));
  const best = (await snap(page)).best;
  assert.ok(best >= 1000, `best ${best}`);
  await page.reload();
  await page.waitForFunction(() => window.SkyHoppers);
  assert.equal((await snap(page)).best, best);
  await context.close();
});

await check('pauses when the tab loses focus', async () => {
  const { context, page } = await open();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.SkyHoppers.snapshot().screen === 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const s = await snap(page);
  assert.equal(s.paused, true);
  const f = s.frame;
  await page.waitForTimeout(300);
  assert.equal((await snap(page)).frame, f, 'no frames advance while paused');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert.ok((await snap(page)).frame > f, 'resumes');
  await context.close();
});

await check('phone: touch controls, tap to pick a character, sound off by default', async () => {
  const { context, page, errors } = await open({ ...devices['Pixel 7'] });
  const s0 = await snap(page);
  assert.equal(s0.touch, true);
  assert.equal(s0.muted, true);
  assert.deepEqual(s0.titleCards, ['Puff', 'Tock', 'Mira']);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/5-phone-title.png` });
  for (const label of ['Move left', 'Move right', 'Jump']) assert.ok(await page.getByRole('button', { name: label }).isVisible(), `${label} visible`);
  // Tap Mira's card (third card, logical x 420..560 of 640).
  const box = await page.locator('#game').boundingBox();
  await page.touchscreen.tap(box.x + box.width * (490 / 640), box.y + box.height * (200 / 360));
  await page.waitForFunction(() => window.SkyHoppers.snapshot().screen === 'playing');
  assert.equal((await snap(page)).character, 'mira');
  const x0 = (await snap(page)).x;
  const right = page.getByRole('button', { name: 'Move right' });
  const rb = await right.boundingBox();
  // Hold "right" via pointer events (what a finger produces).
  await right.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: rb.x + 10, clientY: rb.y + 10 });
  await page.waitForTimeout(700);
  await right.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  const s1 = await snap(page);
  assert.ok(s1.x > x0 + 30, `touch right moved player (${x0.toFixed(1)} -> ${s1.x.toFixed(1)})`);
  await page.screenshot({ path: `${OUT}/6-phone-gameplay.png` });
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
if (server) server.close();
console.log(`\n${results.length - failed}/${results.length} browser checks passed against ${base}`);
fs.writeFileSync(`${OUT}/e2e-results.txt`, results.join('\n') + '\n');
process.exit(failed ? 1 : 0);
