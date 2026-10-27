import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createDatabase } from "./database/runtime.mjs";
import { startFixtureServer } from "./database/supabase-fixture-server.mjs";
const output = process.env.REVIEW_ARTIFACT_DIR || "work/dashboard-review",
  base = "http://127.0.0.1:3192";
await mkdir(output, { recursive: true });
let log = "",
  browser,
  runtime,
  bridge;
const servers = [];
function start(
  port,
  environment,
  supabaseUrl = "https://blocked.review.invalid",
) {
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
        FARM_DASHBOARD_REVIEW: "true",
        VERCEL_ENV: environment,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-review-key",
        SUPABASE_SECRET_KEY: "local-service-fixture",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (c) => (log += c));
  server.stderr.on("data", (c) => (log += c));
  servers.push(server);
  return server;
}
async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(log);
}
const results = [];
try {
  start(3192, "preview");
  await ready(base + "/farm");
  const snapshot = JSON.parse(
    await readFile("lib/dashboard-review/snapshot.json", "utf8"),
  );
  const customer = snapshot.tables.orders[0].user_id;
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    browser = await engine.launch();
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const pages = [
      "",
      "/routes",
      "/delivery-sheet",
      "/runs",
      "/exceptions",
      "/cancellations",
      "/reconciliation",
      "/locations",
      "/orders",
      "/subscriptions",
      "/production",
      "/capacity",
      "/bottles",
      "/payments",
      "/reports",
      "/activity",
      "/settings",
      "/staff",
      `/customers/${customer}`,
    ];
    for (const path of pages) {
      const response = await p.goto(base + "/farm" + path, {
        waitUntil: "networkidle",
      });
      assert.ok(response.ok(), path + ": " + response.status());
      assert.equal(new URL(p.url()).pathname, "/farm" + path);
      await p.locator("main h1").first().waitFor();
      assert.deepEqual(errors, [], path);
      assert.equal(
        await p
          .getByText("Sample data · changes paused", { exact: true })
          .count(),
        1,
      );
      assert.equal(
        await p.getByRole("button", { name: "Sign in", exact: true }).count(),
        0,
      );
    }
    await p.goto(base + "/farm");
    await p.getByRole("button", { name: "Notifications", exact: true }).click();
    const panel = p.getByRole("dialog", { name: "Notifications" });
    await panel.getByText("Milk intake", { exact: true }).waitFor();
    assert.equal(
      await panel.getByRole("button", { name: /read|unread/i }).count(),
      0,
    );
    await p.screenshot({
      path: `${output}/${name}-review-notifications.png`,
      animations: "disabled",
    });
    await p.keyboard.press("Escape");
    await p.getByRole("link", { name: "Manager", exact: true }).click();
    await p.locator('a[aria-current="page"][href$="role=manager"]').waitFor();
    await p.locator("main h1").first().waitFor();
    await p.goto(base + "/farm/payments", { waitUntil: "networkidle" });
    assert.equal(new URL(p.url()).pathname, "/farm");
    await p.getByRole("link", { name: "Driver", exact: true }).click();
    await p.waitForURL(base + "/farm/runs");
    await p.locator("main h1").first().waitFor();
    assert.equal(new URL(p.url()).pathname, "/farm/runs");
    await p.screenshot({
      path: `${output}/${name}-review-driver.png`,
      fullPage: true,
      animations: "disabled",
    });
    await p
      .getByRole("link", { name: "Owner / co-founder", exact: true })
      .click();
    await p.locator('a[aria-current="page"][href$="role=admin"]').waitFor();
    await p.goto(base + "/farm/production", { waitUntil: "networkidle" });
    const form = p.getByRole("form", { name: "Record milk intake" });
    await form.getByLabel("Receipt time").fill("00:01");
    await form
      .getByLabel("Source", { exact: true })
      .fill("Sample review entry");
    await form.getByLabel("Receipt reference").fill("SAMPLE-REVIEW");
    await form.getByLabel("Received · litres", { exact: true }).fill("10");
    await form
      .getByLabel("Accepted at intake · litres", { exact: true })
      .fill("10");
    await form.getByLabel("Handling state").selectOption("chilled");
    await form
      .getByLabel("Storage or holding location")
      .fill("Sample review tank");
    await form
      .getByRole("button", { name: "Record intake", exact: true })
      .click();
    await p
      .locator('[data-farm-notice="error"]')
      .filter({ hasText: "Changes are paused" })
      .waitFor();
    assert.equal(
      await form.getByLabel("Receipt reference").inputValue(),
      "SAMPLE-REVIEW",
    );
    await p.reload({ waitUntil: "networkidle" });
    assert.equal(
      await p.getByText("SAMPLE-REVIEW", { exact: true }).count(),
      0,
    );
    assert.equal(
      (
        await context.request.post(base + "/api/payments/razorpay/order", {
          data: {},
        })
      ).status(),
      403,
    );
    await p.setViewportSize({ width: 390, height: 900 });
    await p.getByRole("button", { name: "Notifications", exact: true }).click();
    await panel.waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: `${output}/${name}-review-mobile.png`,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    results.push({
      engine: name,
      pages: pages.length,
      anonymousReview: true,
      roles: true,
      mutationsBlocked: true,
      realPaymentApiBlocked: true,
      pageErrors: errors,
    });
    await context.close();
    await browser.close();
    browser = null;
  }
  runtime = await createDatabase();
  bridge = await startFixtureServer(runtime.config, { port: 55490 });
  start(3193, "production", bridge.url);
  await ready("http://127.0.0.1:3193/mma-logo.png");
  for (const headers of [{}, { cookie: "mma-dashboard-review-role=admin" }]) {
    const response = await fetch("http://127.0.0.1:3193/farm", {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers,
    });
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location"), /^\/sign-in\?/);
  }
  assert.equal(
    (await fetch("http://127.0.0.1:3193/farm/review-role?role=admin")).status,
    404,
  );
  await writeFile(
    output + "/results.json",
    JSON.stringify({ results, productionAuthPreserved: true }, null, 2),
  );
  console.log(JSON.stringify({ results, productionAuthPreserved: true }));
} catch (error) {
  console.error(log.slice(-5000));
  throw error;
} finally {
  if (browser) await browser.close();
  for (const server of servers) server.kill("SIGTERM");
  if (bridge) await bridge.stop();
  if (runtime) await runtime.stop();
}
