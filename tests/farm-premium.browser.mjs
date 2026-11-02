import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { gpsFixture } from "./helpers/gps-fixture.mjs";
import {
  startFixtureServer,
  sessionFor,
} from "./database/supabase-fixture-server.mjs";
const output = "work/farm-premium",
  port = 3298,
  base = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });
const fixture = await gpsFixture();
await fixture.db.query("update farm_staff set role='admin' where user_id=$1", [
  fixture.manager,
]);
await fixture.release();
const bridge = await startFixtureServer(fixture.config, { port: 55493 });
let log = "";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: bridge.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "local-service-fixture",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (c) => (log += c));
server.stderr.on("data", (c) => (log += c));
const cookie = (user) => ({
  name: "sb-127-auth-token",
  value:
    "base64-" +
    Buffer.from(JSON.stringify(sessionFor(user))).toString("base64url"),
  domain: "127.0.0.1",
  path: "/",
});
const customer =
  (
    await fixture.db.query(
      "select user_id from customer_profiles where full_name=$1",
      ["Sample household 1"],
    )
  ).rows[0]?.user_id ?? fixture.customer;
const allRoutes = [
  "",
  "/runs",
  "/gps",
  "/delivery-sheet",
  "/routes",
  "/locations",
  `/customers/${customer}`,
  "/capacity",
  "/exceptions",
  "/cancellations",
  "/reconciliation",
  "/orders",
  "/payments",
  "/subscriptions",
  "/bottles",
  "/reports",
  "/activity",
  "/settings",
  "/staff",
];
const routes = process.env.PREMIUM_OVERVIEW_ONLY
  ? ["", "/capacity"]
  : allRoutes;
const results = [];
let browser;
try {
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw Error(log);
    try {
      if ((await fetch(base + "/sign-in")).ok) break;
    } catch {}
    if (i === 149) throw Error(log);
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.PREMIUM_ENGINE && process.env.PREMIUM_ENGINE !== engineName)
      continue;
    browser = await engine.launch();
    for (const width of [390, 1440])
      for (const theme of ["light", "dark"]) {
        if (
          process.env.PREMIUM_WIDTH &&
          Number(process.env.PREMIUM_WIDTH) !== width
        )
          continue;
        const context = await browser.newContext({
          viewport: { width, height: 950 },
          reducedMotion: "reduce",
        });
        await context.addCookies([cookie(fixture.manager)]);
        await context.addInitScript((t) => {
          if (!localStorage.getItem("mma-theme"))
            localStorage.setItem("mma-theme", t);
        }, theme);
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        for (const route of routes) {
          await page.goto(base + "/farm" + route, { waitUntil: "networkidle" });
          const main = page.locator("main");
          await main.waitFor();
          assert.equal(
            await main
              .getByText("This operation could not be loaded", { exact: true })
              .count(),
            0,
            `${route} failed to load\n${log.slice(-4000)}`,
          );
          assert.equal(
            await page.locator("html").getAttribute("data-theme"),
            theme,
          );
          const details = main.locator("details>summary").first();
          if (
            ["/locations", "/routes", "/capacity", "/settings"].includes(
              route,
            ) &&
            (await details.count())
          )
            await details.click();
          const diagnostics = await page.evaluate(() => {
            const main = document.querySelector("main");
            const rgb = (s) => {
              const m = s.match(/^rgba?\(([^)]+)\)/);
              if (!m) return null;
              return m[1].split(",").map(Number);
            };
            const lum = (c) =>
              c
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) =>
                  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                )
                .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
            const contrast = [];
            for (const el of main.querySelectorAll(
              "p,span,small,label,th,td,a,button,summary,h1,h2,h3,strong",
            )) {
              if (
                ![...el.childNodes].some(
                  (n) => n.nodeType === 3 && n.textContent.trim(),
                )
              )
                continue;
              if (!el.getClientRects().length || el.closest("[disabled]"))
                continue;
              const style = getComputedStyle(el),
                fg = rgb(style.color);
              let bg = null;
              for (let parent = el; parent; parent = parent.parentElement) {
                const c = rgb(getComputedStyle(parent).backgroundColor);
                if (c && (c[3] ?? 1) > 0.99) {
                  bg = c;
                  break;
                }
              }
              if (!fg || !bg) continue;
              const l1 = lum(fg),
                l2 = lum(bg),
                ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
              const large =
                parseFloat(style.fontSize) >= 24 ||
                (parseFloat(style.fontSize) >= 18.66 &&
                  Number(style.fontWeight) >= 700);
              if (ratio < (large ? 3 : 4.5) - 0.05)
                contrast.push({
                  text: el.textContent.trim().slice(0, 65),
                  ratio: +ratio.toFixed(2),
                  color: style.color,
                  bg: bg.slice(0, 3),
                  class: el.className,
                });
            }
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              bg: getComputedStyle(main.closest('[class*="shell"]'))
                .backgroundColor,
              contrast: contrast.slice(0, 30),
            };
          });
          assert.equal(
            diagnostics.overflow,
            false,
            `${route} overflow at ${width}`,
          );
          await page.evaluate(() => scrollTo(0, 0));
          const slug = route.replaceAll("/", "-") || "-overview";
          await page.screenshot({
            path: `${output}/${engineName}-${width}-${theme}${slug}.png`,
            fullPage: true,
          });
          results.push({
            engine: engineName,
            width,
            theme,
            route: "/farm" + route,
            ...diagnostics,
          });
          console.log(
            `${engineName} ${width} ${theme} /farm${route}: ${diagnostics.contrast.length} contrast findings`,
          );
        }
        // Workspace search filters navigation without exposing links from another role.
        if (width === 390)
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        const search = page.getByRole("searchbox", {
          name: "Find a workspace",
        });
        if (width === 390) {
          await page
            .getByRole("button", { name: "Close menu", exact: true })
            .focus();
          await page.keyboard.press("Tab");
          assert.ok(
            await search.evaluate((el) => document.activeElement === el),
          );
        }
        await search.fill("zz-no-workspace");
        await page
          .getByRole("status")
          .filter({ hasText: "No matching workspaces" })
          .waitFor();
        await page
          .getByRole("button", { name: "Clear workspace search" })
          .click();
        await search.fill("Reports");
        assert.equal(
          await page.getByRole("link", { name: "Inbox", exact: true }).count(),
          0,
        );
        await page.getByRole("link", { name: "Reports", exact: true }).click();
        await page.waitForURL(/\/farm\/reports/);
        // Theme switching persists through a real route transition and reload.
        await page
          .getByRole("button", {
            name:
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
            exact: true,
          })
          .click();
        const other = theme === "dark" ? "light" : "dark";
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          other,
        );
        if (width === 390)
          await page
            .getByRole("button", { name: "Open navigation", exact: true })
            .click();
        await page.getByRole("link", { name: "Overview", exact: true }).click();
        await page.waitForURL(base + "/farm");
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          other,
        );
        await page.setViewportSize({ width: 320, height: 900 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await page.setViewportSize({ width, height: 950 });
        await page
          .getByRole("button", {
            name:
              other === "dark" ? "Switch to light mode" : "Switch to dark mode",
            exact: true,
          })
          .click();
        await context.addCookies([cookie(fixture.driver)]);
        for (const driverRoute of ["/runs", "/delivery-sheet", "/gps"]) {
          await page.goto(base + "/farm" + driverRoute, {
            waitUntil: "networkidle",
          });
          assert.equal(
            await page
              .getByText("This operation could not be loaded", { exact: true })
              .count(),
            0,
          );
          assert.equal(
            await page
              .getByRole("link", { name: "Settings", exact: true })
              .count(),
            0,
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          await page.screenshot({
            path: `${output}/${engineName}-${width}-${theme}-driver${driverRoute.replaceAll("/", "-")}.png`,
            fullPage: true,
          });
          results.push({
            engine: engineName,
            width,
            theme,
            role: "driver",
            route: "/farm" + driverRoute,
            overflow: false,
          });
        }
        await page.goto(base + "/farm/delivery-sheet", {
          waitUntil: "networkidle",
        });
        await page.emulateMedia({ media: "print" });
        assert.equal(
          await page
            .locator("main")
            .evaluate((el) => getComputedStyle(el).color),
          "rgb(20, 27, 23)",
        );
        await page.emulateMedia({ media: "screen" });
        assert.deepEqual(errors, []);
        await context.close();
      }
    await browser.close();
    browser = null;
  }
  assert.deepEqual(
    results
      .filter((r) => r.contrast?.length)
      .map((r) => ({
        route: r.route,
        engine: r.engine,
        width: r.width,
        theme: r.theme,
        contrast: r.contrast,
      })),
    [],
    "All visible sampled dashboard text must meet its contrast threshold",
  );
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
} catch (e) {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await writeFile(`${output}/failure.log`, String(e) + "\n" + log);
  throw e;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await bridge.stop();
  await fixture.stop();
}
