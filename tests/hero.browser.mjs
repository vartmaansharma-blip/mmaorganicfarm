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
  await page.waitForFunction(p => Math.abs(Number(document.getElementById("home").dataset.progress) - p) < .004, progress);
}

try {
  await ready();
  const engines = (process.env.HERO_BROWSERS || "chromium").split(",");
  for (const name of engines) {
    const browser = await ({ chromium, webkit })[name].launch({ headless: true });
    const errors = [];
    try {
      for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 960]]) {
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
        assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
        await page.getByRole("button", { name: "Switch to light mode" }).click();
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("html").getAttribute("data-theme"), "light", "saved light choice must survive reload");
        await page.screenshot({ path: path.join(output, `${name}-${width}-light.png`) });
        await page.getByRole("button", { name: "Switch to dark mode" }).click();
        const initial = await page.locator("#home").getAttribute("data-fill");
        assert.equal(initial, "0.000");
        const tops = [];
        let previousFill = 0;
        for (const p of [.12, .3, .5, .58, .7, .8, .86, 1]) {
          await scrollToProgress(page, p);
          const state = await page.locator("#home").evaluate(root => ({ fill: Number(root.dataset.fill), top: root.firstElementChild.getBoundingClientRect().top }));
          assert.ok(state.fill >= previousFill);
          previousFill = state.fill;
          if (p < .9) tops.push(state.top);
          if (width === 390 && [.3, .58, .8, .86, 1].includes(p)) await page.screenshot({ path: path.join(output, `${name}-mobile-${p}.png`) });
        }
        assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, "glass panel must stay stationary while filling");
        await scrollToProgress(page, .2);
        assert.ok(Number(await page.locator("#home").getAttribute("data-fill")) < .4, "scrolling back must lower the liquid");
        await scrollToProgress(page, 0);
        await page.screenshot({ path: path.join(output, `${name}-${width}-arrival.png`) });

        const headerShop = page.locator("header").getByRole("link", { name: /^Shop(?: Mama)?$/ }).first();
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
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => location.hash), "#site-content");
        assert.ok((await headerShop.boundingBox()).y >= 0, "Shop must remain visible after skipping");
        results.push({ engine: name, width, height, fill: "forward/reverse", menu: width < 901 ? "focus, Escape, backdrop, destinations" : "capsule", overflow: false });
        await context.close();
      }

      const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const staticPage = await reduced.newPage();
      await staticPage.goto(base, { waitUntil: "networkidle" });
      await staticPage.waitForFunction(() => document.getElementById("home").dataset.fill === "1.000");
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
      assert.deepEqual(errors, [], `${name}: browser runtime errors`);
      results.push({ engine: name, reducedMotion: "static", runtimeErrors: errors.length });
    } finally { await browser.close(); }
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  server?.kill("SIGTERM");
}
