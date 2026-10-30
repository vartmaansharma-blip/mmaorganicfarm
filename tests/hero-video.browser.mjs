import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';

const access = process.env.HERO_ACCESS_FILE ? JSON.parse(await readFile(process.env.HERO_ACCESS_FILE, 'utf8')) : null;
const port = process.env.HERO_TEST_PORT || '3103';
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.HERO_ARTIFACT_DIR || 'work/hero-video-verification');
await mkdir(output, { recursive: true });
let log = '';
const fixture = process.env.BASE_URL ? null : await startPublicCatalogueFixture();
const server = process.env.BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], {
  env: { ...process.env, ...fixture.env }, stdio: ['ignore', 'pipe', 'pipe'],
});
server?.stdout.on('data', chunk => { log += chunk; });
server?.stderr.on('data', chunk => { log += chunk; });
const results = [];
const state = (page, expected) => page.waitForFunction(s => document.getElementById('home')?.dataset.state === s, expected);
async function observe(page) {
  await page.addInitScript(() => {
    window.clipEvents = []; window.clipFrames = []; window.shotEvents = []; window.clipEndPixels = null;
    for (const type of ['play', 'playing', 'pause', 'ended', 'error']) document.addEventListener(type, event => {
      if (event.target.tagName !== 'VIDEO') return;
      const video = event.target;
      window.clipEvents.push({ type, time: video.currentTime, rate: video.playbackRate, muted: video.muted, at: performance.now() });
    }, true);
    document.addEventListener('loadeddata', event => {
      if (event.target.tagName !== 'VIDEO') return;
      const video = event.target;
      const sample = (_, metadata) => {
        const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 14;
        const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, 24, 14);
        const pixels = Array.from(ctx.getImageData(0, 0, 24, 14).data);
        window.clipFrames.push({ time: metadata.mediaTime, brightness: pixels.filter((_, i) => i % 4 !== 3).reduce((a,b) => a+b,0) / 1008, fingerprint: pixels.join(',') });
        video.requestVideoFrameCallback(sample);
      };
      video.requestVideoFrameCallback(sample);
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.getElementById('home');
      if (!root) return;
      new MutationObserver(() => {
        const video = root.querySelector('video');
        if (root.dataset.videoState === 'ended' && !window.clipEndPixels) {
          const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 14;
          const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, 24, 14);
          window.clipEndPixels = Array.from(ctx.getImageData(0, 0, 24, 14).data).join(',');
        }
        const stage = root.dataset.filmStage;
        if (window.shotEvents.at(-1)?.stage === stage) return;
        window.shotEvents.push({ stage, state: root.dataset.state, time: video.currentTime, ended: video.ended, media: root.dataset.videoState, at: performance.now() });
      }).observe(root, { attributes: true, attributeFilter: ['data-film-stage', 'data-video-state'] });
    });
  });
}
async function fresh(context, theme = 'dark') {
  await context.addInitScript(t => { localStorage.setItem('mama-theme', t); }, theme);
  if (access) {
    assert.equal(new URL(access.url).origin, new URL(base).origin, 'preview access is scoped to the tested origin');
    try { assert.equal((await context.request.get(access.url)).status(), 200); } catch { throw Error('Protected preview access could not be established.'); }
  }
  const page = await context.newPage();
  await observe(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('home').dataset.assets === 'ready');
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
  return page;
}
async function start(page) {
  await page.mouse.wheel(0, 9000);
  await state(page, 'PLAYING_FORWARD');
}
async function shot(page, engine, width, theme) {
  await start(page);
  await page.waitForFunction(() => document.querySelector('#home video').currentTime > .08 && document.getElementById('home').dataset.videoVisible === 'true');
  const format = await page.locator('#home video').evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, muted: v.muted, inline: v.playsInline, controls: v.controls, loop: v.loop, rate: v.playbackRate, fit: getComputedStyle(v).objectFit }));
  const { duration, ...presentation } = format;
  assert.ok(Math.abs(duration - 3.041667) < .001, 'browser duration rounding stays within 1ms of the exact media duration');
  assert.deepEqual(presentation, { width: 1284, height: 724, muted: true, inline: true, controls: false, loop: false, rate: 1, fit: 'cover' });
  const crops = await page.locator('#home video').evaluate(v => {
    const img = v.previousElementSibling;
    return [v, img].map(e => ({ box: e.getBoundingClientRect().toJSON(), fit: getComputedStyle(e).objectFit, position: getComputedStyle(e).objectPosition, transform: getComputedStyle(e).transform }));
  });
  assert.deepEqual(crops[0], crops[1], 'video and exact fallback share positioning, crop and transform');
  await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}-macro-start.png`) });
  const credit = page.getByText('Video generated with Kling AI', { exact: true });
  assert.equal(await credit.evaluate(e => Number(getComputedStyle(e).opacity)), 1);
  const bounds = await credit.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y > 0, 'attribution remains in frame in portrait and landscape');
  await page.waitForFunction(() => document.querySelector('#home video').currentTime > 1.85);
  await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}-macro-end.png`) });
  await state(page, 'COMPLETED');
  const finalFrameMatches = await page.locator('video').evaluate(async video => {
    const fingerprint = element => {
      const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 14;
      const ctx = canvas.getContext('2d'); ctx.drawImage(element, 0, 0, 24, 14);
      return Array.from(ctx.getImageData(0, 0, 24, 14).data).join(',');
    };
    // Sample the presented final hold, before WebKit can cull the faded-out layer.
    const retained = window.clipEndPixels;
    if (!retained) return { matches: false, reason: 'No source-out frame was captured' };
    const reference = document.createElement('video'); reference.muted = true; reference.preload = 'auto'; reference.src = video.currentSrc;
    await new Promise((resolve, reject) => { reference.onloadeddata = resolve; reference.onerror = reject; });
    reference.currentTime = 1.999;
    await new Promise(resolve => { reference.onseeked = resolve; });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const expected = fingerprint(reference);
    const actualPixels = retained.split(',').map(Number), expectedPixels = expected.split(',').map(Number);
    const errors = actualPixels.map((value, i) => Math.abs(value - expectedPixels[i])).filter((_, i) => i % 4 !== 3);
    const comparison = { matches: retained === expected, meanError: errors.reduce((a,b) => a+b, 0) / errors.length, maxError: Math.max(...errors), time: video.currentTime, referenceTime: reference.currentTime, referenceReadyState: reference.readyState };
    reference.removeAttribute('src'); reference.load();
    return comparison;
  });
  const report = await page.evaluate(() => ({ events: window.clipEvents, shots: window.shotEvents, frames: window.clipFrames.map(frame => ({ time: frame.time, brightness: frame.brightness })), distinctFrames: new Set(window.clipFrames.map(frame => frame.fingerprint)).size, held: document.body.style.position, filmTime: document.getElementById('home').dataset.filmTime }));
  await writeFile(path.join(output, `${engine}-${width}-${theme}-frames.json`), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, `${engine}-${width}-${theme}-final-comparison.json`), JSON.stringify(finalFrameMatches, null, 2));
  assert.equal(finalFrameMatches.matches, true, 'presented final hold equals an independently decoded final source frame');
  report.finalFrameMatches = finalFrameMatches.matches;
  report.finalFrameComparison = finalFrameMatches;
  const plays = report.events.filter(e => e.type === 'play');
  assert.equal(plays.length, 1);
  assert.ok(plays[0].time < .05, 'first playback starts at the actual first frame');
  assert.equal(report.events.some(e => e.type === 'ended'), false, 'the 2-second excerpt does not wait for the full source to end');
  assert.ok(report.shots.some(s => s.stage === 'overhead-pull' && s.media === 'ended' && s.time >= 1.99 && s.time <= 2.01));
  assert.ok(report.frames.length >= 24 && report.distinctFrames > 20, 'decoded liquid is moving');
  assert.ok(report.frames.every(frame => frame.brightness > 15), 'no black decoded frames');
  assert.ok(report.frames[0].time <= .05, 'presentation begins within one source frame of time zero');
  assert.ok(report.frames.at(-1).time >= 1.9, 'presentation callbacks span the clip; the exact retained final frame is checked separately');
  assert.equal(report.held, '');
  assert.equal(report.filmTime, '4700');
  await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}-overhead.png`) });
  await page.mouse.wheel(0, 350); await page.waitForTimeout(150); await page.mouse.wheel(0, -9000);
  await page.waitForFunction(() => scrollY < 2);
  await state(page, 'COMPLETED');
  assert.equal(await page.locator('#home').getAttribute('data-shot'), 'top');
  assert.equal(await page.locator('#home').getAttribute('data-film-time'), report.filmTime, 'upward reentry never rewinds');
  assert.equal(await page.evaluate(() => window.clipEvents.filter(e => e.type === 'play').length), 1, 'returning upward never restarts autoplay');
  return { engine, width, theme, format, ...report };
}
async function lifecycle(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await fresh(context); await start(page);
  await page.waitForFunction(() => document.querySelector('video').currentTime > .3);
  const paused = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    return { clip: document.querySelector('video').currentTime, film: document.getElementById('home').dataset.filmTime };
  });
  await page.waitForTimeout(350);
  assert.equal(await page.locator('video').evaluate(v => v.paused), true);
  assert.ok(Math.abs(await page.locator('video').evaluate(v => v.currentTime) - paused.clip) < .05);
  assert.equal(await page.locator('#home').getAttribute('data-film-time'), paused.film);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(t => document.querySelector('video').currentTime > t + .15, paused.clip);
  await page.locator('a').filter({ hasText: 'Skip introduction' }).filter({ visible: true }).last().click();
  await state(page, 'COMPLETED');
  assert.equal(await page.locator('video').evaluate(v => v.paused), true);
  assert.equal(await page.evaluate(() => document.body.style.position), '');
  await context.close();
  results.push({ engine, lifecycle: 'macro visibility pause/resume and skip release' });
}
async function fallbacks(browser, engine) {
  for (const mode of ['failed', 'slow', 'rejected', 'stalled', 'reduced']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    let requests = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    if (['failed','slow'].includes(mode)) await context.route('**/hero/coffee-macro-motion.mp4', async route => {
      requests++;
      if (mode === 'failed') await route.abort();
      else { await gate; await route.continue().catch(() => {}); }
    });
    if (mode === 'rejected') await context.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked fixture', 'NotAllowedError')); });
    if (mode === 'stalled') await context.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.resolve(); });
    const page = await fresh(context);
    assert.equal(await page.locator('video').getAttribute('src'), null, 'initial render does not request video');
    if (mode === 'reduced') {
      await page.mouse.wheel(0, 9000); await state(page, 'COMPLETED');
      assert.equal(await page.locator('video').getAttribute('src'), null);
    } else {
      const startAt = Date.now(); await start(page); await state(page, 'COMPLETED');
      assert.ok(Date.now() - startAt < 15000, 'failed media cannot hold scroll indefinitely');
      assert.equal(await page.locator('#home').getAttribute('data-video-state'), 'fallback');
      assert.equal(await page.locator('#home').getAttribute('data-video-visible'), 'false');
      if (mode === 'slow') { release(); await page.waitForTimeout(300); assert.equal(await page.locator('#home').getAttribute('data-video-visible'), 'false'); }
    }
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    await context.close(); release();
    results.push({ engine, fallback: mode, requests });
    console.log(`${engine}: ${mode} fallback passed`);
  }
}
try {
  for (let i = 0; i < 100; i++) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw Error(log);
    if (!server) break;
    if (/Ready in/.test(log)) { try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) break; } catch {} }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  let checkedAsset = false;
  for (const engine of (process.env.HERO_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await ({ chromium, webkit })[engine].launch();
    try {
      for (const width of [390, 1440].filter(width => !process.env.HERO_WIDTHS || process.env.HERO_WIDTHS.split(',').includes(String(width)))) for (const theme of (process.env.HERO_THEMES || 'dark,light').split(',')) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, hasTouch: width === 390, recordVideo: { dir: path.join(output, 'recordings'), size: { width, height: width === 390 ? 844 : 960 } } });
        const page = await fresh(context, theme);
        if (!checkedAsset) {
          const asset = await context.request.get(`${base}/hero/coffee-macro-motion.mp4`);
          assert.equal(asset.status(), 200);
          const bytes = await asset.body();
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          assert.equal(sha256, 'cc255f456ffa3304be88bcdc40fc1fd9671c46762b4ca0d82ed4039e5b206612');
          results.push({ asset: 'coffee-macro-motion.mp4', bytes: bytes.length, sha256, audio: 'none: identical to atom-verified source' });
          checkedAsset = true;
        }
        assert.equal(await page.locator('video').getAttribute('src'), null);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        results.push(await shot(page, engine, width, theme));
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`${engine} ${width} ${theme}: silent 2-second excerpt, boundaries and one-way return passed`);
      }
      if (!process.env.HERO_SHOTS_ONLY) { await lifecycle(browser, engine); await fallbacks(browser, engine); }
    } finally { await browser.close(); }
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
} finally { server?.kill('SIGTERM'); fixture?.server.closeAllConnections(); fixture?.server.close(); }
