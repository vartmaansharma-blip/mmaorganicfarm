import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { startPublicCatalogueFixture } from "./helpers/public-catalogue-fixture.mjs";

const port = process.env.HERO_TEST_PORT || "3101";
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.HERO_ARTIFACT_DIR || "work/hero-verification");
await mkdir(output, { recursive: true });
const fixture = process.env.BASE_URL ? null : await startPublicCatalogueFixture();
let server;
let serverLog = "";
const results = [];

if (!process.env.BASE_URL) {
  // Non-secret local fixture for the required public catalogue; all writes are rejected.
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
    env: { ...process.env, ...fixture.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { serverLog += chunk; });
  server.stderr.on("data", chunk => { serverLog += chunk; });
}

async function ready() {
  for (let i = 0; i < 100; i++) {
    if (server && server.exitCode !== null) throw new Error(`Owned preview exited: ${serverLog}`);
    // Do not accidentally validate an older process already listening on this port.
    if (!server || /Ready in/.test(serverLog)) {
      try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* Wait for startup. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Preview did not start: ${serverLog}`);
}

async function scrollToFill(page, progress) {
  await page.evaluate(p => {
    const root = document.getElementById("home");
    const panel = root.firstElementChild;
    const rect = root.getBoundingClientRect();
    const header = parseFloat(getComputedStyle(panel).top) || 0;
    window.scrollTo({ top: scrollY + rect.top - header + p * (rect.height - panel.offsetHeight), behavior: "instant" });
  }, progress);
  if (progress < .99) await page.waitForFunction(p => Math.abs(Number(document.getElementById("home").dataset.fill) - p * p * (3 - 2 * p)) < .01, progress);
}
const state = (page, value) => page.waitForFunction(s => document.getElementById('home')?.dataset.state === s, value);
async function observeFilm(page) {
  await page.evaluate(() => {
    window.filmSamples = [];
    const sample = () => {
      const root = document.getElementById('home');
      if (!root) return;
      const previous = window.filmSamples.at(-1);
      const current = { state: root.dataset.state, stage: root.dataset.filmStage, time: Number(root.dataset.filmTime), at: performance.now(), top: root.firstElementChild.getBoundingClientRect().top };
      if (!previous || previous.state !== current.state || previous.stage !== current.stage) window.filmSamples.push(current);
      window.filmObserver = requestAnimationFrame(sample);
    };
    cancelAnimationFrame(window.filmObserver);
    window.filmObserver = requestAnimationFrame(sample);
  });
}
const stageNames = ['filled-front', 'coffee-treatment', 'elevated', 'macro-push', 'macro-hold', 'overhead-pull', 'settled-overhead'];
async function verifyHybrid(page, name, width) {
  const front = await page.locator('img[src*="coffee-front"]').boundingBox();
  const tops = [];
  for (const progress of [.2, .65, .3]) {
    await scrollToFill(page, progress);
    tops.push(await page.locator('#home > div').first().evaluate(e => e.getBoundingClientRect().top));
    assert.equal(await page.locator('#home').getAttribute('data-shot'), 'front');
  }
  assert.ok(Math.max(...tops) - Math.min(...tops) < 2, 'panel stays still throughout fill');
  assert.equal(await page.locator('[data-condensation-drop]').count(), 8, 'condensation stays sparse');
  assert.ok(await page.locator('[data-condensation]').evaluate(e => Number(getComputedStyle(e).opacity)) > 0);
  const beadBefore = await page.locator('[data-bead]').first().getAttribute('transform');
  await page.waitForTimeout(120);
  assert.notEqual(await page.locator('[data-bead]').first().getAttribute('transform'), beadBefore, 'beads continue flowing while fill scroll pauses');
  await observeFilm(page);
  await page.mouse.wheel(0, 9000);
  assert.ok(await page.locator('#home > div').first().evaluate(e => e.getBoundingClientRect().top) >= 0, 'crossing wheel cannot paint an overshoot into content');
  await state(page, 'PLAYING_FORWARD');
  assert.equal(await page.locator('#home').getAttribute('data-fill'), '1.000');
  assert.equal(await page.locator('#home').getAttribute('data-held'), 'true');
  const heldY = await page.locator('#home > div').first().evaluate(e => e.getBoundingClientRect().top);
  assert.ok(Math.abs(heldY - tops[0]) < 2, `hold preserves original panel position: ${heldY} vs ${tops[0]}`);
  assert.ok((await page.locator('header').boundingBox()).y >= -1, 'hold preserves header position');
  await page.mouse.wheel(0, -8000); // incidental reversal cannot reverse this film
  await page.mouse.wheel(0, 12000);
  assert.equal(await page.evaluate(() => {
    const e = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    return e.defaultPrevented;
  }), true, 'touch momentum is consumed only during the hold');
  await page.keyboard.press('ArrowUp');
  await page.evaluate(() => document.querySelector('button[aria-label*=" mode"]').click());
  await page.setViewportSize({ width: width + 1, height: page.viewportSize().height });
  await page.setViewportSize({ width, height: page.viewportSize().height });
  await page.waitForFunction(() => {
    const root = document.getElementById('home');
    return root.style.getPropertyValue('--side-opacity') === '1' && root.dataset.filmStage === 'elevated';
  });
  const elevated = await page.locator('img[src*="coffee-side"]').boundingBox();
  assert.ok(Math.abs(front.y + front.height * 139 / 1200 - elevated.y - elevated.height * 108 / 1200) < 2, 'camera lift lands on the matched rim');
  assert.ok(Math.abs(front.y + front.height * 1074 / 1200 - elevated.y - elevated.height * 1092 / 1200) < 2, 'camera lift lands on the matched base');
  await page.waitForFunction(() => document.getElementById('home').dataset.filmStage === 'macro-hold');
  assert.equal(await page.locator('header').isVisible(), false);
  assert.equal(await page.locator('#hero-heading').isVisible(), false);
  assert.equal(await page.locator('[data-condensation]').evaluate(e => Number(getComputedStyle(e).opacity)), 0, 'macro stays free of condensation overlays');
  await page.screenshot({ path: path.join(output, `${name}-${width}-full-screen-macro.png`) });
  await state(page, 'COMPLETED'); // No scrolling: clock must finish by itself.
  const forward = await page.evaluate(() => window.filmSamples.filter(s => s.state === 'PLAYING_FORWARD'));
  assert.deepEqual(forward.map(s => s.stage), stageNames, 'all forward stages receive screen time despite large deltas');
  assert.ok(forward.every(s => Math.abs(s.top - heldY) < 2), 'hold does not move panel');
  for (let i = 1; i < forward.length; i++) assert.ok(forward[i].time > forward[i-1].time, 'theme/resize/input never restarts clock');
  assert.equal(await page.locator('#home').getAttribute('data-held'), 'false');
  assert.equal(await page.evaluate(() => document.body.style.position), '');
  assert.equal(await page.locator('#home').getAttribute('data-shot'), 'top');
  assert.equal(await page.locator('header').isVisible(), true);
  await page.screenshot({ path: path.join(output, `${name}-${width}-closing-overhead.png`) });
  const end = await page.locator('#home').getAttribute('data-film-time');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#home').getAttribute('data-film-time'), end);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 350);
  await page.waitForFunction(y => scrollY > y + 100, y);
  assert.equal(await page.locator('#home').getAttribute('data-shot'), 'top', 'overhead is retained while leaving');
  await observeFilm(page);
  await page.mouse.wheel(0, -9000);
  await state(page, 'PLAYING_REVERSE');
  await page.mouse.wheel(0, 8000);
  await page.mouse.wheel(0, -12000);
  await state(page, 'FILLING');
  const reverse = await page.evaluate(() => window.filmSamples.filter(s => s.state === 'PLAYING_REVERSE'));
  assert.deepEqual(reverse.map(s => s.stage), [...stageNames].reverse(), 'reverse film follows every stage backward');
  assert.equal(await page.locator('#home').getAttribute('data-shot'), 'front');
  for (let i = 0; i < 5; i++) {
    await scrollToFill(page, i % 2 ? 1 : .998);
    assert.equal(await page.locator('#home').getAttribute('data-state'), 'FILLING', 'trigger hysteresis prevents jitter replay');
  }
  await scrollToFill(page, .25);
  assert.ok(Number(await page.locator('#home').getAttribute('data-fill')) < .2, 'upward scroll empties milk after reverse');
  await scrollToFill(page, 0);
  await page.screenshot({ path: path.join(output, `${name}-${width}-arrival.png`) });
  const first = forward[0].at;
  assert.ok(forward.at(-1).at - first >= 3450, 'the new film must actually give its shots more time');
  return { forward, reverse };
}

async function verifyLifecycle(browser, name) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const fresh = async () => {
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.evaluate(() => { history.replaceState({ ...history.state, mmaHeroCompleted: false }, ''); scrollTo({ top: 0, behavior: 'instant' }); });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.getElementById('home').dataset.assets === 'ready');
    };
    await fresh();
    if (name === 'chromium' && width === 390) {
      const touch = await context.newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 700 }] });
      for (const y of [620, 520, 420, 300, 180, 80]) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
        await page.waitForTimeout(25);
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await state(page, 'PLAYING_FORWARD');
      await state(page, 'COMPLETED');
      assert.equal(await page.evaluate(() => document.body.style.position), '', 'native Chromium touch momentum releases cleanly');
      await touch.detach();
      await fresh();
    }
    await page.mouse.wheel(0, 9000);
    await state(page, 'PLAYING_FORWARD');
    // Browser visibility event adapter; time spent hidden must not advance the film.
    const paused = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.hiddenBeadPose = document.querySelector('[data-bead]').getAttribute('transform');
      return Number(document.getElementById('home').dataset.filmTime);
    });
    await page.waitForTimeout(300);
    assert.equal(Number(await page.locator('#home').getAttribute('data-film-time')), paused);
    assert.equal(await page.locator('[data-bead]').first().getAttribute('transform'), await page.evaluate(() => window.hiddenBeadPose), 'hidden time pauses the condensation too');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(t => Number(document.getElementById('home').dataset.filmTime) > t, paused);
    await page.waitForFunction(() => document.getElementById('home').dataset.filmStage === 'macro-hold');
    await page.getByRole('link', { name: /Skip introduction/ }).last().click();
    await page.waitForFunction(() => !document.body.style.position && document.querySelector('#site-content').getBoundingClientRect().top < 150);
    assert.equal(await page.locator('#home').getAttribute('data-held'), 'false');
    await fresh();
    await page.mouse.wheel(0, 9000);
    await state(page, 'PLAYING_FORWARD');
    await page.locator('header').getByRole('button', { name: /^Open cart,/ }).click();
    await page.getByRole('dialog', {name:'Your cart.'}).getByRole('link', {name:'Explore the shop'}).click();
    await page.waitForURL('**/shop');
    // Let the anonymous redirect commit before traversing its history entry.
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => document.body.style.position || document.documentElement.style.overflow), '', 'route navigation releases hold');
    await page.goBack({ waitUntil: 'networkidle' });
    await state(page, 'COMPLETED');
    assert.equal(await page.evaluate(() => document.body.style.position), '', 'back restoration remains unlocked');
    await page.goForward({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    await page.goto(base + '/#farm', { waitUntil: 'networkidle' });
    await state(page, 'COMPLETED');
    assert.equal(await page.evaluate(() => document.body.style.position), '', 'direct anchor has no forced film');
    await fresh();
    await page.mouse.wheel(0, 9000);
    await state(page, 'PLAYING_FORWARD');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await state(page, 'COMPLETED');
    assert.equal(await page.evaluate(() => document.body.style.position), '', 'changing motion preference immediately releases hold');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${name} ${width}: lifecycle passed`);
    results.push({ engine: name, width, lifecycle: 'visibility pause/resume, macro skip, route cleanup, back/forward, direct anchor, motion preference change' });
  }
  // Slow/broken image connections must not reveal blank layers or hold indefinitely.
  for (const fail of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000);
    let releaseImage;
    const delayedImage = new Promise(resolve => { releaseImage = resolve; });
    await page.route('**/_next/image?*', async route => {
      if (decodeURIComponent(route.request().url()).includes('coffee-side-v2')) {
        if (fail) await route.abort();
        else { await delayedImage; await route.continue(); }
      } else await route.continue();
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('home').dataset.state === 'FILLING');
    await page.mouse.wheel(0, 9000);
    await state(page, 'COMPLETED');
    assert.equal(await page.locator('#home').getAttribute('data-held'), 'false');
    assert.equal(await page.locator('#home').getAttribute('data-shot'), 'front', 'failed/over-budget decode retains loaded front');
    if (!fail) {
      releaseImage();
      await page.waitForFunction(() => document.getElementById('home').dataset.assets === 'ready');
      assert.equal(await page.locator('#home').getAttribute('data-shot'), 'front', 'late decode cannot abruptly replace the fallback');
    }
    await context.close();
  }
}

function contrast(foreground, background) {
  const luminance = hex => {
    const raw = hex.trim().replace('#', '');
    const expanded = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
    const rgb = hex.trim().startsWith('#') ? expanded.match(/.{2}/g).map(c => parseInt(c, 16) / 255) : hex.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255);
    const linear = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

async function verifyHomepageContrast(page) {
  const colors = await page.locator('#hero-heading, #home p, #home a, .confidence-strip p, .glass-story > p, .story-metrics strong, .story-metrics span, .button, .closing-section .eyebrow, .ticker').evaluateAll(elements => elements.map(element => {
    let ancestor = element;
    let background;
    while (ancestor && !background) {
      const value = getComputedStyle(ancestor).backgroundColor;
      if (value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') background = value;
      ancestor = ancestor.parentElement;
    }
    return { label: element.textContent.trim().slice(0, 35), text: getComputedStyle(element).color, background };
  }));
  for (const color of colors) assert.ok(contrast(color.text, color.background) >= 4.5, `homepage contrast: ${color.label}`);
}

async function verifyConnectedPages(browser, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const routes = ['/sign-in', '/forgot-password', '/reset-password', '/pricing', '/shipping', '/contact', '/terms', '/privacy', '/cancellation-refunds'];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const measured = [];
  for (const theme of ['dark', 'light']) {
    await page.goto(base, { waitUntil: 'networkidle' });
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `${route} retains theme`);
      const focusedAuth=["/sign-in","/forgot-password","/reset-password"].includes(route);
      assert.equal(await page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` }).count(), focusedAuth?0:1);
      assert.equal(await page.getByRole("button",{name:"Open navigation menu"}).count(),focusedAuth?0:1);
      const state = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const heading = document.querySelector('h1');
        let ancestor = heading;
        let background = 'rgb(255,255,255)';
        while (ancestor) {
          const color = getComputedStyle(ancestor).backgroundColor;
          if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') { background = color; break; }
          ancestor = ancestor.parentElement;
        }
        const keys = ['text','muted','page','surface','action','on-action','selected','on-selected','success-text','success-bg','error-text','error-bg','warning-text','warning-bg','input-border'];
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
          bodyFont: getComputedStyle(document.body).fontFamily,
          editorialContract: bodyStyle.getPropertyValue('--font-fraunces').trim().split(',')[0].trim(),
          interfaceContract: bodyStyle.getPropertyValue('--font-space-grotesk').trim().split(',')[0].trim(),
          headingColor: getComputedStyle(heading).color, headingBackground: background,
          tokens: Object.fromEntries(keys.map(k => [k, style.getPropertyValue('--ui-' + k).trim()])) };
      });
      assert.equal(state.overflow, false, `${route} ${theme} mobile overflow`);
      const face = value => value.split(',')[0].replace(/["']/g, '').trim();
      assert.equal(face(state.headingFont), face(state.editorialContract), `${route} shares the editorial face`);
      assert.equal(face(state.bodyFont), face(state.interfaceContract), `${route} shares the interface face`);
      assert.ok(contrast(state.headingColor, state.headingBackground) >= 4.5, `${route} heading contrast`);
      if (route === '/sign-in') {
        const email = page.getByLabel('Email address', { exact: true });
        await email.fill('visual-fixture@example.invalid');
        assert.equal(await email.inputValue(), 'visual-fixture@example.invalid');
        const field = await email.evaluate(element => ({ size: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height }));
        assert.ok(field.size >= 16 && field.height >= 48, 'customer fields stay readable and comfortable on mobile');
        const pairs = [['text','page'],['muted','page'],['muted','surface'],['on-action','action'],['on-selected','selected'],['success-text','success-bg'],['error-text','error-bg'],['warning-text','warning-bg']];
        for (const [fg,bg] of pairs) {
          const ratio = contrast(state.tokens[fg], state.tokens[bg]);
          assert.ok(ratio >= 4.5, `${theme}: ${fg}/${bg} contrast ${ratio}`);
          measured.push({ theme, pair: `${fg}/${bg}`, ratio: +ratio.toFixed(2) });
        }
        assert.ok(contrast(state.tokens['input-border'], state.tokens.page) >= 3, 'input boundary contrast');
        await page.screenshot({ path: path.join(output, `${name}-connected-sign-in-${theme}.png`) });
      }
      if (route === '/pricing') await page.screenshot({ path: path.join(output, `${name}-connected-pricing-${theme}.png`) });
    }
  }
  assert.deepEqual(errors, [], `${name}: connected-page runtime errors`);
  await context.close();
  results.push({ engine: name, connectedPublicPages: routes.length, themes: 2, typography: 'shared', textContrastMinimum: 4.5, measured });
}

try {
  await ready();
  const engines = (process.env.HERO_BROWSERS || "chromium").split(",");
  for (const name of engines) {
    const browser = await ({ chromium, webkit })[name].launch({ headless: true });
    const errors = [];
    try {
      for (const [width, height] of [[320, 568], [360, 740], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1200, 630], [1440, 960]].filter(([width]) => !process.env.HERO_WIDTHS || process.env.HERO_WIDTHS.split(",").includes(String(width)))) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 901, ...([390,1440].includes(width) ? { recordVideo: { dir: path.join(output, "recordings"), size: { width, height } } } : {}) });

        const page = await context.newPage();
        page.setDefaultNavigationTimeout(60000);
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(base, { waitUntil: "networkidle" });
        await page.locator("#home img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator("#hero-heading").innerText(), "Every glass\nhas a beginning.");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} ${width}: horizontal overflow`);
        const heroBox = await page.locator("#hero-heading").boundingBox();
        assert.ok(heroBox.x >= 0 && heroBox.x + heroBox.width <= width + 1);
        const priceColors = await page.locator('.price-tag').evaluate(e => ({ foreground: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor }));
        assert.ok(contrast(priceColors.foreground, priceColors.background) >= 4.5, 'milk price badge is readable');
        assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
        await page.getByRole("button", { name: "Switch to light mode" }).click();
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light", "saved light choice must survive reload");
        await verifyHomepageContrast(page);
        await page.screenshot({ path: path.join(output, `${name}-${width}-light.png`) });
        await page.getByRole("button", { name: "Switch to dark mode" }).click();
        await verifyHomepageContrast(page);
        const initial = await page.locator("#home").getAttribute("data-fill");
        assert.equal(initial, "0.000");
        const alignment = await page.locator("#home").evaluate(root => {
          const f = root.querySelector('img[src*="coffee-front"]').getBoundingClientRect();
          const s = root.querySelector('img[src*="coffee-side"]').getBoundingClientRect();
          return { rim: Math.abs(f.y + f.height * 139 / 1200 - s.y - s.height * 108 / 1200), base: Math.abs(f.y + f.height * 1074 / 1200 - s.y - s.height * 1092 / 1200), height: f.height };
        });
        assert.ok(alignment.rim < 8 && alignment.base < 8, "incoming camera starts within its restrained glide distance");
        if (width === 390) assert.ok(alignment.height >= 340, "mobile glass is larger than the production 295px canvas");
        const cue = await page.locator('a').filter({ hasText: 'Scroll to fill' }).boundingBox();
        if (width > 720) assert.ok(Math.abs(cue.x + cue.width / 2 - width / 2) < 1, "laptop scroll indicator is centered");
        else assert.ok(Math.abs(cue.x - 24) < 1, "phone scroll cue keeps the production left alignment");
        const film = await verifyHybrid(page, name, width);
        await page.getByRole('button', { name: 'Switch to dark mode' }).click();
        assert.equal(await page.getByRole("progressbar", { name: "Glass story progress", includeHidden: true }).getAttribute("aria-valuenow"), "0");


        const headerShop = page.locator("header").getByRole("button", { name: /^Open cart,/ }).first();
        assert.equal(await headerShop.getAttribute("aria-haspopup"), "dialog");
        if (width < 901) {
          const toggle = page.getByRole("button", { name: "Open navigation menu" });
          await toggle.click();
          const dialog = page.getByRole("dialog");
          assert.equal(await dialog.isVisible(), true);
          await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
          const glass = await dialog.evaluate(element => ({ surface: getComputedStyle(element).backgroundColor, backdrop: getComputedStyle(element, '::backdrop').backdropFilter || getComputedStyle(element, '::backdrop').webkitBackdropFilter }));
          assert.match(glass.surface, /rgba\(/, 'glass menu retains a translucent tinted surface');
          assert.match(glass.backdrop, /blur/, 'modal backdrop softens the page behind navigation');
          assert.equal(await dialog.getByRole("navigation").getByRole("link").count(), 5);
          for (let i = 0; i < 10; i++) {
            await page.keyboard.press("Tab");
            assert.equal(await page.evaluate(() => !!document.activeElement.closest("dialog")), true, "focus escaped modal");
          }
          await page.keyboard.press("Escape");
          assert.equal(await dialog.isVisible(), false);
          assert.equal(await toggle.evaluate(element => document.activeElement === element), true);
          await toggle.click();
          await page.screenshot({ path: path.join(output, `${name}-${width}-menu.png`) });
          await page.mouse.click(4, 180);
          assert.equal(await dialog.isVisible(), false, "backdrop must close navigation");
          await toggle.click();
          await dialog.getByRole("link", { name: "Farm", exact: false }).click();
          await page.waitForFunction(() => location.hash === "#farm");
          assert.equal(await dialog.isVisible(), false);
          await page.waitForFunction(() => document.querySelector('nav a[href="#farm"][aria-current="location"]'));
          await toggle.click();
          assert.equal(await dialog.getByRole("link", { name: /Farm/ }).getAttribute("aria-current"), "location");
          await dialog.getByRole("link", { name: /Home/ }).click();
          await page.waitForFunction(() => document.getElementById("home").dataset.progress === "0.000");
        } else {
          assert.equal(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").count(), 5);
        }
        await page.goto(base, { waitUntil: "networkidle" });
        await page.getByRole("link", { name: /Skip introduction/ }).click();
        await page.waitForFunction(() => document.documentElement.dataset.heroImmersive === 'false' && document.querySelector('#site-content').getBoundingClientRect().top < 150);
        assert.equal(await page.evaluate(() => location.hash), "#site-content");
        assert.ok((await headerShop.boundingBox()).y >= 0, "Cart must remain visible after skipping");
        results.push({ engine: name, width, height, fill: "forward/reverse", menu: width < 901 ? "focus, Escape, backdrop, destinations" : "capsule", overflow: false, sideAlignmentPixels: alignment, ...film });

        await context.close();
        console.log(`${name} ${width}x${height}: hybrid motion and navigation passed`);
      }

      await verifyLifecycle(browser, name);

      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const staticPage = await reduced.newPage();
      await staticPage.goto(base, { waitUntil: "networkidle" });
      await staticPage.waitForFunction(() => document.getElementById("home").dataset.fill === "1.000");
      assert.equal(await staticPage.getByRole("progressbar", { name: "Glass story progress", includeHidden: true }).getAttribute("aria-valuenow"), "100");
      assert.equal(await staticPage.locator("#home").evaluate(root => root.offsetHeight === root.firstElementChild.offsetHeight), true, "reduced motion must not require a scroll sequence");
      assert.equal(await staticPage.locator('[data-condensation]').isVisible(), false, 'reduced motion removes the ambient droplets');
      await staticPage.screenshot({ path: path.join(output, `${name}-reduced-motion.png`) });
      await reduced.close();

      // Local fixture checks only: verify existing anonymous auth gates without customer data or writes.
      if (!process.env.BASE_URL) {
        const anonymous = await browser.newPage();
        const shop = await anonymous.goto(`${base}/milk`);
        assert.equal(shop.status(), 200);
        assert.match(anonymous.url(), /\/shop\/milk$/);
        const account = await anonymous.goto(`${base}/account`);
        assert.equal(account.status(), 200);
        assert.match(anonymous.url(), /\/sign-in$/);
        await anonymous.close();
      }
      await verifyConnectedPages(browser, name);
      assert.deepEqual(errors, [], `${name}: browser runtime errors`);
      results.push({ engine: name, reducedMotion: "static", runtimeErrors: errors.length });
    } finally { await browser.close(); }
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  server?.kill("SIGTERM");
  fixture?.server.closeAllConnections();
  fixture?.server.close();
}
