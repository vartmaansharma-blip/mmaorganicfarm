import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createDatabase, callAs } from "./database/runtime.mjs";
import {
  startFixtureServer,
  sessionFor,
} from "./database/supabase-fixture-server.mjs";
const port = 3177,
  base = `http://127.0.0.1:${port}`,
  output = "docs/screenshots/driver-runs";
await mkdir(output, { recursive: true });
const cookie = (user) => ({
  name: "sb-127-auth-token",
  value:
    "base64-" +
    Buffer.from(JSON.stringify(sessionFor(user))).toString("base64url"),
  domain: "127.0.0.1",
  path: "/",
});
let server,
  log = "",
  browser,
  runtime,
  bridge,
  activePage;
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
async function waitForDb(sql, params, expected) {
  for (let i = 0; i < 100; i++) {
    const r = (await runtime.db.query(sql, params)).rows[0];
    if (Object.values(r)[0] === expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(`Database did not reach ${expected}`);
}
try {
  for (const [engineName, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    browser = await engine.launch();
    for (const width of [390, 1440]) {
      runtime = await createDatabase({
        routingFoundation: true,
        driverRuns: true,
      });
      const { db } = runtime;
      bridge = await startFixtureServer(runtime.config, { port: 55487 });
      if (!server) {
        server = spawn(
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
        await ready();
      }
      const manager = randomUUID(),
        driver = randomUUID(),
        customer = randomUUID();
      await db.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,'manager@fixture.invalid','{\"full_name\":\"Farm manager\"}'),($2,'driver@fixture.invalid','{\"full_name\":\"Aarav · test driver\"}'),($3,'customer@fixture.invalid','{\"full_name\":\"Fictional customer\"}')",
        [manager, driver, customer],
      );
      await db.query(
        "insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver')",
        [manager, driver],
      );
      const area = (
        await db.query(
          "insert into delivery_areas(name,slug) values('Fixture neighbourhood','fixture-neighbourhood') returning id",
        )
      ).rows[0].id;
      const route = (
        await db.query(
          "insert into delivery_routes(area_id,name) values($1,'Garden morning') returning id",
          [area],
        )
      ).rows[0].id;
      await db.query(
        "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
        [route, driver, manager],
      );
      const date = (
        await db.query(
          "select (now() at time zone 'Asia/Kolkata')::date::text d",
        )
      ).rows[0].d;
      const order = randomUUID();
      await db.query(
        "insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'once','paid','none',100,100,$3,'0000000000','Fictional gate 4, Garden Colony')",
        [order, customer, date],
      );
      await db.query(
        "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
        [order, customer, order],
      );
      const delivery = (
        await db.query(
          "insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,'planned',$4,$5,$6,1,'Fictional customer','Fictional gate 4, Garden Colony','none',$7) returning id",
          [order, customer, date, area, route, driver, manager],
        )
      ).rows[0].id;
      await db.query(
        "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L'),($1,'paneer',1,'500 g')",
        [delivery],
      );
      await callAs(db, manager, "select prepare_daily_dispatch($1)", [date]);
      const managerContext = await browser.newContext({
          viewport: { width, height: 950 },
        }),
        driverContext = await browser.newContext({
          viewport: { width, height: 950 },
        });
      await managerContext.addCookies([cookie(manager)]);
      await driverContext.addCookies([cookie(driver)]);
      const m = await managerContext.newPage(),
        d = await driverContext.newPage(),
        errors = [];
      activePage = m;
      for (const p of [m, d]) p.on("pageerror", (e) => errors.push(e.message));
      await m.goto(base + "/farm/runs");
      const tab = m.getByRole("button", { name: "Vehicles", exact: true });
      assert.equal(
        await tab.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
      await tab.click();
      const vehicleForm = m.getByRole("form", { name: "Add vehicle" });
      await vehicleForm.getByLabel("Vehicle name").fill("Morning farm van");
      await vehicleForm.getByLabel("Registration").fill("TEST-DELIVERY");
      await vehicleForm.getByLabel("Milk capacity").fill("25");
      await vehicleForm.getByLabel("Paneer capacity").fill("10");
      await vehicleForm.getByLabel("Ghee capacity").fill("5");
      await vehicleForm.getByRole("button", { name: "Add vehicle" }).click();
      await m
        .getByRole("heading", { name: "Morning farm van", exact: true })
        .waitFor();
      await m.getByRole("button", { name: "Driver team", exact: true }).click();
      await m
        .getByText("Contact and vehicle preferences", { exact: true })
        .click();
      const profile = m.getByRole("form", { name: "Save driver profile" });
      await profile.getByLabel("Contact number").fill("0000000000");
      await profile
        .getByLabel("Preferred vehicle")
        .selectOption({ label: "Morning farm van" });
      await profile
        .getByRole("button", { name: "Save driver profile" })
        .click();
      await waitForDb(
        "select count(*)::integer n from driver_operating_profiles",
        [],
        1,
      );
      await d.goto(base + "/farm/runs");
      activePage = d;
      await d.getByLabel(/Availability for/).waitFor();
      assert.ok(
        (await d.getByLabel(/Availability for/).boundingBox()).height >= 44,
      );
      await d
        .getByRole("link", { name: "Skip to workspace", exact: true })
        .focus();
      await d.keyboard.press("Enter");
      assert.equal(new URL(d.url()).hash, "#farm-workspace");
      await d.getByLabel(/Availability for/).selectOption("true");
      await d
        .getByRole("button", { name: "Save availability", exact: true })
        .click();
      await d.getByText("Available", { exact: true }).waitFor();
      activePage = m;
      await m.reload();
      await m
        .getByRole("button", { name: "Delivery runs", exact: false })
        .click();
      const create = m.getByRole("form", { name: "Create delivery run" });
      await create.getByLabel("Prepared route").selectOption(route);
      await create.getByLabel("Available driver").selectOption(driver);
      const vehicle = (await db.query("select id from farm_vehicles")).rows[0]
        .id;
      await create.locator('select[name="vehicle_id"]').selectOption(vehicle);
      await create.getByRole("button", { name: "Create delivery run" }).click();
      await m
        .getByRole("heading", { name: "Garden morning", exact: true })
        .waitFor();
      const run = (await db.query("select id from delivery_runs")).rows[0].id;
      const load = m.getByRole("form", { name: "Save physical load" });
      await load.getByLabel(/Milk.*litres/i).fill("3");
      await load.getByLabel(/Paneer.*packs/i).fill("1");
      await load.getByRole("button", { name: "Save physical load" }).click();
      await m.locator('article[data-state="awaiting_ack"]').waitFor();
      await d.reload();
      await d
        .getByRole("heading", { name: "A quick check before you go" })
        .waitFor();
      assert.equal(
        await d
          .getByText("Fictional gate 4, Garden Colony", { exact: true })
          .count(),
        0,
      );
      await d.evaluate(() => window.scrollTo(0, 0));
      await d.screenshot({
        path: `${output}/${engineName}-${width}-driver-load.png`,
        fullPage: true,
      });
      await d.getByLabel("I counted the products").check();
      await d.getByRole("button", { name: "Accept this load" }).click();
      await d.locator('article[data-state="acknowledged"]').waitFor();
      await m.reload();
      await m.getByRole("button", { name: "Release this run" }).click();
      await m.locator('article[data-state="released"]').waitFor();
      await d.reload();
      await d.getByLabel("Opening odometer").fill("120.1");
      await d.getByRole("button", { name: "Start my run" }).click();
      await d.locator('article[data-state="in_progress"]').waitFor();
      await m.reload();
      await m.locator('article[data-state="in_progress"]').waitFor();
      await m.waitForLoadState("networkidle");
      await m.evaluate(() => window.scrollTo(0, 0));
      await m.screenshot({
        path: `${output}/${engineName}-${width}-manager.png`,
        fullPage: true,
      });
      await d.evaluate(() => window.scrollTo(0, 0));
      await d.screenshot({
        path: `${output}/${engineName}-${width}-driver-journey.png`,
        fullPage: true,
      });
      await d.getByRole("link", { name: "Open my delivery stops" }).click();
      await d
        .getByRole("heading", { name: "Fictional customer", exact: true })
        .waitFor();
      await d.getByRole("button", { name: "Save delivered" }).click();
      await d
        .getByText("Delivery saved. Continue to the next stop.", {
          exact: true,
        })
        .waitFor();
      await d.waitForLoadState("networkidle");
      await waitForDb(
        "select status from daily_deliveries where id=$1",
        [delivery],
        "delivered",
      );
      await d.goto(base + "/farm/runs");
      await d
        .getByText("Back at the farm? Finish your run", { exact: true })
        .click();
      await d.getByLabel("Closing odometer").fill("132.4");
      await d.getByRole("button", { name: "Record return to farm" }).click();
      await d.locator('article[data-state="returned"]').waitFor();
      await m.reload();
      const close = m.getByRole("form", { name: "Review and close run" });
      await close.locator('input[name="returned_milk"]').fill("0");
      await close.locator('input[name="returned_paneer"]').fill("0");
      await close.locator('input[name="lost_milk"]').fill("0");
      await close.locator('input[name="lost_paneer"]').fill("0");
      await close.getByRole("button", { name: "Review and close run" }).click();
      await close
        .getByRole("alert")
        .filter({ hasText: "Loaded stock" })
        .waitFor();
      assert.equal(
        await close.locator('input[name="returned_paneer"]').inputValue(),
        "0",
      );
      await close.locator('input[name="returned_milk"]').fill("1");
      await close.getByRole("button", { name: "Review and close run" }).click();
      await m.getByRole("heading", { name: "Stock reconciled" }).waitFor();
      const saved = (
        await db.query(
          "select status,closing_odometer-opening_odometer distance,closeout from delivery_runs where id=$1",
          [run],
        )
      ).rows[0];
      assert.equal(saved.status, "closed");
      assert.equal(Number(saved.distance), 12.3);
      assert.equal(saved.closeout.returns.milk, 1);
      await d.reload();
      await d.getByRole("heading", { name: "A day well delivered" }).waitFor();
      await d.evaluate(() => window.scrollTo(0, 0));
      await d.screenshot({
        path: `${output}/${engineName}-${width}-driver-closed.png`,
        fullPage: true,
      });
      for (const p of [m, d]) {
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await p.waitForLoadState("networkidle");
      }
      assert.deepEqual(errors, []);
      // Also inspect the narrowest supported phone width after completing the flow.
      await d.setViewportSize({ width: 320, height: 850 });
      assert.equal(
        await d.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      results.push({
        engine: engineName,
        width,
        vehicleProfileAvailability: "passed",
        loadDriverCheckRelease: "passed",
        journeyAndDelivery: "passed",
        balancedCloseout: "passed",
        reportedDistance: 12.3,
        overflowAt320: "none",
        pageErrors: errors,
      });
      for (const p of [m, d]) p.removeAllListeners("pageerror");
      await managerContext.close();
      await driverContext.close();
      await bridge.stop();
      bridge = null;
      await runtime.stop();
      runtime = null;
    }
    await browser.close();
    browser = null;
  }
  // Missing schema keeps the existing route accessible; access is still authenticated.
  runtime = await createDatabase();
  bridge = await startFixtureServer(runtime.config, { port: 55487 });
  const legacyDriver = randomUUID();
  await runtime.db.query(
    "insert into auth.users(id,email) values($1,'legacy@fixture.invalid')",
    [legacyDriver],
  );
  await runtime.db.query(
    "insert into farm_staff(user_id,role) values($1,'driver')",
    [legacyDriver],
  );
  browser = await chromium.launch();
  const c = await browser.newContext();
  await c.addCookies([cookie(legacyDriver)]);
  const p = await c.newPage();
  activePage = p;
  await p.goto(base + "/farm/runs");
  await p
    .getByText("Driver runs are awaiting setup.", { exact: false })
    .waitFor();
  await p.getByRole("link", { name: "Open my route" }).waitFor();
  results.push({ schema: "legacy", fallback: "passed" });
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(log.slice(-5000));
  if (activePage && !activePage.isClosed()) {
    console.error((await activePage.locator("body").innerText()).slice(-5000));
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
