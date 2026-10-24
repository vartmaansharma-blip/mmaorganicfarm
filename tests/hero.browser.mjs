import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";

const port = process.env.HERO_TEST_PORT || "3101";
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.HERO_ARTIFACT_DIR || "work/hero-verification");
await mkdir(output, { recursive: true });
let server;
let serverLog = "";
const results = [];

if (!process.env.BASE_URL) {
  // Non-secret, deliberately unreachable fixture. Anonymous navigation needs no database.
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://hero-verification.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_hero_browser_fixture" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { serverLog += chunk; });
  server.stderr.on("data", chunk => { serverLog += chunk; });
}

async function ready() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Preview did not start: ${serverLog}`);
}

async function scrollToProgress(page, progress) {
  await page.evaluate(p => {
    const root = document.getElementById("home");
    const panel = root.firstElementChild;
    const rect = root.getBoundingClientRect();
    const header = parseFloat(getComputedStyle(panel).top) || 0;
    window.scrollTo({ top: scrollY + rect.top - header + p * (rect.height - panel.offsetHeight), behavior: "instant" });
  }, progress);
  await page.waitForFunction(p => Math.abs(Number(document.getElementById("home").dataset.progress) - p) < .004 && document.getElementById("home").dataset.transitioning === "false", progress);
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
      assert.equal(await page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` }).count(), 1);
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
      for (const [width, height] of [[320, 568], [360, 740], [390, 844], [768, 1024], [1200, 630], [1440, 960]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 901 });
        const page = await context.newPage();
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
        await page.screenshot({ path: path.join(output, `${name}-${width}-light.png`) });
        await page.getByRole("button", { name: "Switch to dark mode" }).click();
        const initial = await page.locator("#home").getAttribute("data-fill");
        assert.equal(initial, "0.000");
        const alignment = await page.locator("#home").evaluate(root => {
          const f = root.querySelector('img[src*="coffee-front"]').getBoundingClientRect();
          const s = root.querySelector('img[src*="coffee-side"]').getBoundingClientRect();
          return { rim: Math.abs(f.y + f.height * 139 / 1200 - s.y - s.height * 108 / 1200), base: Math.abs(f.y + f.height * 1074 / 1200 - s.y - s.height * 1092 / 1200), height: f.height };
        });
        assert.ok(alignment.rim < 2 && alignment.base < 2, "front and side have matching glass heights");
        if (width === 390) assert.ok(alignment.height >= 340, "mobile glass is larger than the production 295px canvas");
        const cue = await page.locator('a').filter({ hasText: 'Scroll to fill' }).boundingBox();
        if (width > 720) assert.ok(Math.abs(cue.x + cue.width / 2 - width / 2) < 1, "laptop scroll indicator is centered");
        else assert.ok(Math.abs(cue.x - 24) < 1, "phone scroll cue keeps the production left alignment");
        const tops = [];
        let previousFill = 0;
        for (const p of [.12, .3, .48, .5, .57, .66, .86, .99, 1]) {
          await scrollToProgress(page, p);
          assert.equal(await page.getByRole("progressbar", { name: "Glass story scroll progress", includeHidden: true }).getAttribute("aria-valuenow"), String(Math.round(p * 100)));
          const state = await page.locator("#home").evaluate(root => ({ fill: Number(root.dataset.fill), top: root.firstElementChild.getBoundingClientRect().top }));
          assert.ok(state.fill >= previousFill);
          previousFill = state.fill;
          if (p < .86) tops.push(state.top);
          if (p === .66 || p === .86 || p === .99) {
            const expected = p === .66 ? "side" : p === .99 ? "top" : "macro";
            assert.equal(await page.locator("#home").getAttribute("data-shot"), expected);
          }
          if (width === 390 && [.3, .57, .66, .86, .99, 1].includes(p)) await page.screenshot({ path: path.join(output, `${name}-mobile-${p}.png`) });
        }
        await scrollToProgress(page, .89);
        assert.equal(await page.locator("header").isVisible(), false, "macro frame hides navigation");
        assert.equal(await page.locator("#hero-heading").isVisible(), false, "macro frame hides copy");
        assert.equal(await page.locator(".whatsapp-float").isVisible(), false, "macro frame hides floating controls");
        await page.screenshot({ path: path.join(output, `${name}-${width}-full-screen-macro.png`) });
        await scrollToProgress(page, .99);
        assert.equal(await page.locator('#home').getAttribute('data-shot'), 'top', 'closing frame is the supplied overhead composition');
        assert.equal(await page.locator('header').isVisible(), true, 'navigation returns for closing shot');
        assert.equal(await page.locator('#hero-heading').isVisible(), true, 'copy returns for closing shot');
        assert.equal(await page.locator('.whatsapp-float').isVisible(), true, 'contact action returns for closing shot');
        await page.screenshot({ path: path.join(output, `${name}-${width}-closing-overhead.png`) });
        await page.evaluate(() => { const r=document.querySelector('#home').getBoundingClientRect(); window.scrollTo({top:scrollY+r.bottom-50,behavior:'instant'}); });
        await page.waitForFunction(() => document.documentElement.dataset.heroImmersive === 'false');
        assert.equal(await page.locator("header").isVisible(), true, "site resumes after final frame");
        assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, "glass panel must stay stationary while filling");
        await scrollToProgress(page, .2);
        assert.ok(Number(await page.locator("#home").getAttribute("data-fill")) < .4, "scrolling back must lower the liquid");
        if (width === 390 || width === 1440) {
          for (const pause of [.525, .62, .78, .93]) {
            await scrollToProgress(page, pause);
            const weights = await page.locator('#home').evaluate(root => ['--coffee-progress','--side-opacity','--top-opacity','--macro-opacity'].map(key => Number(root.style.getPropertyValue(key))));
            assert.ok(weights.every(value => value === 0 || value === 1), 'stopping between shots must settle on a clean photograph');
          }
        }
        await scrollToProgress(page, 0);
        await page.screenshot({ path: path.join(output, `${name}-${width}-arrival.png`) });
        assert.equal(await page.getByRole("progressbar", { name: "Glass story scroll progress", includeHidden: true }).getAttribute("aria-valuenow"), "0");

        const headerShop = page.locator("header").getByRole("link", { name: /^Shop(?: M'ma)?$/ }).first();
        assert.equal(await headerShop.getAttribute("href"), "/milk");
        if (width < 901) {
          const toggle = page.getByRole("button", { name: "Open navigation menu" });
          await toggle.click();
          const dialog = page.getByRole("dialog");
          assert.equal(await dialog.isVisible(), true);
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
        assert.ok((await headerShop.boundingBox()).y >= 0, "Shop must remain visible after skipping");
        results.push({ engine: name, width, height, fill: "forward/reverse", menu: width < 901 ? "focus, Escape, backdrop, destinations" : "capsule", overflow: false, sideAlignmentPixels: alignment });
        await context.close();
      }

      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const staticPage = await reduced.newPage();
      await staticPage.goto(base, { waitUntil: "networkidle" });
      await staticPage.waitForFunction(() => document.getElementById("home").dataset.fill === "1.000");
      assert.equal(await staticPage.getByRole("progressbar", { name: "Glass story scroll progress", includeHidden: true }).getAttribute("aria-valuenow"), "100");
      assert.equal(await staticPage.locator("#home").evaluate(root => root.offsetHeight === root.firstElementChild.offsetHeight), true, "reduced motion must not require a scroll sequence");
      await staticPage.screenshot({ path: path.join(output, `${name}-reduced-motion.png`) });
      await reduced.close();

      // Local fixture checks only: verify existing anonymous auth gates without customer data or writes.
      if (!process.env.BASE_URL) {
        const anonymous = await browser.newPage();
        const shop = await anonymous.goto(`${base}/milk`);
        assert.equal(shop.status(), 200);
        assert.match(anonymous.url(), /\/sign-in\?next=%2Fmilk/);
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
}
