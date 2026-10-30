import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';

const port = process.env.GALLERY_TEST_PORT || '3112';
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.GALLERY_ARTIFACT_DIR || 'work/product-gallery-review');
await mkdir(output, { recursive: true });
const fixture = process.env.BASE_URL ? null : await startPublicCatalogueFixture();
let log = '';
const server = process.env.BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], { env: { ...process.env, ...fixture.env }, stdio: ['ignore', 'pipe', 'pipe'] });
server?.stdout.on('data', data => { log += data; });
server?.stderr.on('data', data => { log += data; });
const results = [];
const photo = (page, index) => page.waitForFunction(index => document.querySelector('[data-product-gallery]')?.dataset.photo === String(index), index);
async function decode(page) {
  await page.locator('[data-product-gallery] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await page.waitForTimeout(100);
}
try {
  for (let i = 0; i < 100; i++) {
    if (server && server.exitCode !== null) throw new Error(log);
    try { if ((!server || /Ready in/.test(log)) && (await fetch(base + '/shop/milk')).ok) break; } catch {}
    if (i === 99) throw new Error('Owned gallery preview did not start');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  for (const [engine, driver] of Object.entries({ chromium, webkit })) {
    const browser = await driver.launch();
    try {
      for (const width of [390, 1440]) for (const theme of ['dark', 'light']) for (const id of ['milk', 'paneer', 'ghee']) {
        const context = await browser.newContext({ viewport: { width, height: 960 } });
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install();
        await page.goto(`${base}/shop/${id}`, { waitUntil: 'networkidle' });
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: /Switch to .* mode/ }).click();
        await page.getByRole('switch', { name: 'Scheduled orders' }).uncheck();
        await decode(page); await photo(page, 0);
        const gallery = page.locator('[data-product-gallery]');
        const frame = gallery.locator('[class*=frame]');
        const thumbnails = gallery.getByRole('button');
        assert.equal(await thumbnails.count(), 2);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const initial = await frame.boundingBox();
        const thumb = await thumbnails.first().boundingBox();
        assert.ok(width < 700 ? thumb.y >= initial.y + initial.height : thumb.x < initial.x, 'thumbnails sit below on phones and beside on desktop');
        await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}-${id}-main.png`) });
        await page.mouse.move(1, 1);
        await page.clock.fastForward(6200); await photo(page, 1); await page.waitForTimeout(1250);
        assert.equal(await frame.locator('[data-current="true"] img').evaluate(image => getComputedStyle(image).objectFit), 'contain', 'complete supporting photograph stays visible');
        const next = await frame.boundingBox();
        assert.ok(Math.abs(next.height - initial.height) < 1 && Math.abs(next.width - initial.width) < 1, 'automatic photography does not shift the buying controls');
        await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}-${id}-extra.png`) });
        await page.getByRole('button', { name: `Increase ${id} quantity` }).click();
        const quantities = await page.locator('output').allTextContents();
        await thumbnails.first().click(); await photo(page, 0);
        await page.clock.fastForward(6500); await photo(page, 0);
        assert.deepEqual(await page.locator('output').allTextContents(), quantities, 'thumbnail and automatic changes preserve the chosen quantity');
        await frame.focus(); await page.keyboard.press('ArrowRight'); await photo(page, 1);
        const bounds = await frame.boundingBox();
        await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2);
        await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height / 2, { steps: 8 }); await page.mouse.up();
        await photo(page, 0);
        await page.getByRole('switch', { name: 'Scheduled orders' }).check(); await decode(page);
        assert.equal(await page.locator('[data-product-gallery]').count(), 1, 'the scheduled page also has the gallery');
        assert.deepEqual(errors, []);
        results.push({ engine, width, theme, id, auto: true, thumbnails: true, keyboard: true, swipe: true, stableFrame: true, quantityPreserved: true, scheduledGallery: true, runtimeErrors: 0 });
        console.log(`${engine} ${width} ${theme} ${id}: automatic gallery, thumbnails, swipe and purchase state passed`);
        await context.close();
      }
      const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 960 } });
      const page = await context.newPage(); await page.clock.install(); await page.goto(base + '/shop/milk', { waitUntil: 'networkidle' }); await decode(page);
      await page.clock.fastForward(13000); await photo(page, 0);
      await page.locator('[data-product-gallery]').getByRole('button').nth(1).click(); await photo(page, 1);
      assert.equal(await page.locator('[data-product-gallery] [data-current="true"]').evaluate(element => getComputedStyle(element).transitionDuration), '0s');
      results.push({ engine, reducedMotion: 'static by default with immediate manual thumbnails' }); await context.close();
    } finally { await browser.close(); }
  }
} finally {
  server?.kill(); fixture?.server.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
