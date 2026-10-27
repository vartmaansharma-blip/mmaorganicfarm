import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createDatabase } from "./database/runtime.mjs";
import {
  startFixtureServer,
  sessionFor,
} from "./database/supabase-fixture-server.mjs";
const base = "http://127.0.0.1:3188",
  output = process.env.NOTIFICATION_ARTIFACT_DIR || "work/notification-review";
await mkdir(output, { recursive: true });
const cookie = (user) => ({
  name: "sb-127-auth-token",
  value:
    "base64-" +
    Buffer.from(JSON.stringify(sessionFor(user))).toString("base64url"),
  domain: "127.0.0.1",
  path: "/",
});
let runtime,
  bridge,
  server,
  browser,
  activePage,
  log = "";
const results = [];
async function ready() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/sign-in")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(log);
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
try {
  for (const [engineName, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ].filter(
    ([name]) =>
      !process.env.RUN_BROWSER_ENGINE ||
      name === process.env.RUN_BROWSER_ENGINE,
  )) {
    runtime = await createDatabase({
      routingFoundation: true,
      driverRuns: true,
      milkIntake: true,
      farmNotifications: true,
    });
    const { db } = runtime;
    bridge = await startFixtureServer(runtime.config, { port: 55489 });
    if (!server) {
      server = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          "3188",
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
      await ready();
    }
    const owner = randomUUID(),
      manager = randomUUID(),
      driver = randomUUID();
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'owner@fixture.invalid','{\"full_name\":\"Synthetic owner\"}'),($2,'manager@fixture.invalid','{\"full_name\":\"Synthetic manager\"}'),($3,'driver@fixture.invalid','{\"full_name\":\"Synthetic driver\"}')",
      [owner, manager, driver],
    );
    for (const [id, role] of [
      [owner, "admin"],
      [manager, "manager"],
      [driver, "driver"],
    ])
      await db.query("insert into farm_staff(user_id,role) values($1,$2)", [
        id,
        role,
      ]);
    const area = (
      await db.query(
        "insert into delivery_areas(name,slug) values('Test area','test-area') returning id",
      )
    ).rows[0].id;
    const route = (
      await db.query(
        "insert into delivery_routes(area_id,name) values($1,'Synthetic assigned route') returning id",
        [area],
      )
    ).rows[0].id;
    await db.query(
      "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
      [route, driver, owner],
    );
    const date = (
      await db.query(
        "select ((now() at time zone 'Asia/Kolkata')::date-1)::text d",
      )
    ).rows[0].d;
    const context = await browserContext(engine, owner),
      managerContext = await browser.newContext({
        viewport: { width: 390, height: 950 },
      });
    await managerContext.addCookies([cookie(manager)]);
    const p = await context.newPage(),
      m = await managerContext.newPage(),
      errors = [];
    for (const page of [p, m]) {
      page.on("pageerror", (error) => {
        errors.push(error.message);
        if (process.env.BROWSER_DEBUG) console.error(page.url(), error.stack);
      });
      if (process.env.BROWSER_DEBUG)
        page.on("requestfailed", (request) =>
          console.error(request.method(), request.url(), request.failure()),
        );
    }
    activePage = p;
    await p.goto(base + "/farm/staff");
    await p.getByRole("heading", { name: "Farm staff", exact: true }).waitFor();
    const staffRow = p.locator("form").filter({
      has: p.getByRole("button", { name: "Deactivate", exact: true }),
    });
    const before = await staffRow.boundingBox();
    for (let i = 0; i < 3; i++) {
      await p.getByRole("button", { name: "Deactivate", exact: true }).click();
      await p.waitForFunction(
        (expected) =>
          document.querySelectorAll('[data-farm-notice="error"]').length ===
          expected,
        i + 1,
      );
    }
    assert.equal(
      (
        await db.query("select active from farm_staff where user_id=$1", [
          driver,
        ])
      ).rows[0].active,
      true,
    );
    const blocked = p.locator('[data-farm-notice="error"]');
    assert.equal(await blocked.count(), 3);
    assert.match(await blocked.first().innerText(), /Reassign this driver/);
    assert.ok(
      Math.abs((await staffRow.boundingBox()).height - before.height) < 2,
      "blocked message does not expand the row",
    );
    await p.screenshot({
      path: `${output}/${engineName}-stacked-action-notices.png`,
      animations: "disabled",
    });
    const workspaceBefore = await p.locator("#farm-workspace").boundingBox();
    await blocked
      .first()
      .getByRole("button", { name: "View notifications" })
      .click();
    const panel = p.getByRole("dialog", { name: "Notifications", exact: true });
    await panel.waitFor();
    assert.equal(
      await p.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    assert.equal(
      await p
        .locator("#farm-workspace")
        .evaluate((el) => el.closest("[inert]") !== null),
      true,
    );
    assert.equal(
      (await p.locator("#farm-workspace").boundingBox()).width,
      workspaceBefore.width,
      "overlay does not add a column",
    );
    await panel.getByText("Your actions", { exact: true }).click();
    assert.equal(
      await panel
        .getByRole("heading", { name: "Action needs attention", exact: true })
        .count(),
      3,
    );
    assert.equal(
      await panel.getByRole("button", { name: /read|unread|filter/i }).count(),
      0,
    );
    assert.equal(await panel.getByRole("navigation").count(), 0);
    await p.keyboard.press("Escape");
    const bell = p.getByRole("button", { name: /^Notifications/ });
    await bell.waitFor();
    await p.waitForFunction(() =>
      document.activeElement
        ?.getAttribute("aria-label")
        ?.startsWith("Notifications"),
    );
    assert.equal(
      await bell.evaluate((el) => document.activeElement === el),
      true,
    );
    await p.waitForLoadState("networkidle");
    await p.reload();
    await p.getByRole("heading", { name: "Farm staff", exact: true }).waitFor();
    await bell.click();
    await panel.getByText("Your actions", { exact: true }).click();
    assert.equal(
      await panel
        .getByRole("heading", { name: "Action needs attention", exact: true })
        .count(),
      3,
      "action history survives reload in this user tab",
    );
    await p.keyboard.press("Escape");
    activePage = m;
    await m.goto(base + "/farm/production?date=" + date);
    await m.getByRole("heading", { name: "Record a milk receipt" }).waitFor();
    const form = m.getByRole("form", { name: "Record milk intake" });
    await form.getByLabel("Receipt time").fill("08:15");
    await form
      .getByLabel("Source", { exact: true })
      .fill("Synthetic morning collection");
    await form.getByLabel("Receipt reference").fill("TEST-INTAKE-001");
    await form.getByLabel("Received · litres", { exact: true }).fill("100");
    await form
      .getByLabel("Accepted at intake · litres", { exact: true })
      .fill("95");
    await form.getByLabel("Handling state").selectOption("chilled");
    await form
      .getByLabel("Storage or holding location")
      .fill("Synthetic tank A");
    await form
      .getByLabel("Reason for rejected milk", { exact: false })
      .fill("Synthetic measured rejection");
    await form
      .getByRole("button", { name: "Record intake", exact: true })
      .click();
    await m
      .getByRole("heading", {
        name: "Synthetic morning collection",
        exact: true,
      })
      .waitFor();
    assert.equal(
      (await db.query("select count(*)::int n from milk_intakes")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select accepted_litres::text n from milk_intakes"))
        .rows[0].n,
      "95.00",
    );
    await m.screenshot({
      path: `${output}/${engineName}-milk-intake-mobile.png`,
      fullPage: true,
      animations: "disabled",
    });
    const receipt = m.locator("article").filter({
      has: m.getByRole("heading", {
        name: "Synthetic morning collection",
        exact: true,
      }),
    });
    await receipt.getByText("Correct this receipt", { exact: true }).click();
    const correction = m.getByRole("form", {
      name: "Correct receipt TEST-INTAKE-001",
    });
    await correction
      .getByLabel("Accepted at intake · litres", { exact: true })
      .fill("96");
    await correction
      .getByLabel("Reason for correction")
      .fill("Synthetic measurement correction");
    await correction.getByRole("button", { name: "Save correction" }).click();
    await m.waitForFunction(() =>
      [...document.querySelectorAll("p")].some((el) =>
        el.textContent.includes("version 2"),
      ),
    );
    await receipt.getByText("Receipt history", { exact: true }).click();
    await receipt
      .getByText("Synthetic measurement correction", { exact: true })
      .waitFor();
    await receipt.getByText("Void this receipt", { exact: true }).click();
    const voidForm = m.getByRole("form", {
      name: "Void receipt TEST-INTAKE-001",
    });
    await voidForm
      .getByLabel("Reason for voiding")
      .fill("Synthetic duplicate paper receipt");
    await voidForm
      .getByRole("button", { name: "Void receipt", exact: true })
      .click();
    await receipt.getByText("Voided", { exact: true }).waitFor();
    assert.equal(
      (await db.query("select status from milk_intakes")).rows[0].status,
      "voided",
    );
    await m.getByRole("button", { name: /^Notifications/ }).click();
    const managerPanel = m.getByRole("dialog", { name: "Notifications" });
    await managerPanel.getByText("Milk intake", { exact: true }).waitFor();
    assert.equal(
      await managerPanel.getByText("Staff access", { exact: true }).count(),
      0,
    );
    assert.equal(
      await managerPanel.getByText("Payments", { exact: true }).count(),
      0,
    );
    await m.screenshot({
      path: `${output}/${engineName}-manager-notification-centre.png`,
      animations: "disabled",
    });
    await m.keyboard.press("Escape");
    activePage = p;
    await p.goto(base + "/farm/production?date=" + date);
    await p.getByRole("heading", { name: "Record a milk receipt" }).waitFor();
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.getByRole("button", { name: /^Notifications/ }).click();
    await panel.getByText("Milk intake", { exact: true }).waitFor();
    await p.screenshot({
      path: `${output}/${engineName}-notification-centre-desktop.png`,
      animations: "disabled",
    });
    await panel.getByText("Milk intake", { exact: true }).click();
    await panel
      .getByRole("heading", { name: "Milk intake voided", exact: true })
      .waitFor();
    const notificationCount = (
      await db.query("select count(*)::int n from farm_notifications")
    ).rows[0].n;
    assert.equal(notificationCount, 6);
    await panel
      .getByRole("button", { name: "Dismiss Milk intake voided" })
      .click();
    assert.equal(
      (await db.query("select status from milk_intakes")).rows[0].status,
      "voided",
    );
    await p.keyboard.press("Escape");
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.setViewportSize({ width: 320, height: 850 });
    await p.getByRole("button", { name: /^Notifications/ }).click();
    assert.equal(
      await panel.evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await noOverflow(p);
    await p.screenshot({
      path: `${output}/${engineName}-notifications-320-reduced-motion.png`,
      animations: "disabled",
    });
    await p.keyboard.press("Escape");
    await noOverflow(m);
    await p.waitForLoadState("networkidle");
    await m.waitForLoadState("networkidle");
    assert.deepEqual(errors, []);
    results.push({
      engine: engineName,
      blockedDriverUnchanged: true,
      multipleActionNotices: "passed",
      noRowOrColumnShift: "passed",
      userScopedSessionHistory: "passed",
      managementDurableFeed: "passed",
      dismissScope: "passed",
      managerOperationalFeed: "passed",
      noReadUnreadControls: "passed",
      intakeCreateCorrectVoid: "passed",
      reducedMotionAnd320: "passed",
      pageErrors: errors,
    });
    for (const page of [p, m]) page.removeAllListeners("pageerror");
    await context.close();
    await managerContext.close();
    await browser.close();
    browser = null;
    await bridge.stop();
    bridge = null;
    await runtime.stop();
    runtime = null;
  }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(log.slice(-2000));
  if (activePage && !activePage.isClosed()) {
    console.error((await activePage.locator("body").innerText()).slice(-6000));
    await activePage.screenshot({
      path: output + "/failure.png",
      fullPage: true,
    });
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  await bridge?.stop();
  await runtime?.stop();
}
async function browserContext(engine, user) {
  browser = await engine.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 950 },
  });
  await context.addCookies([cookie(user)]);
  return context;
}
