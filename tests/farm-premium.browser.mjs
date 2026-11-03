import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const atomicPayment = process.env.PREMIUM_ATOMIC_MONTHLY_PAYMENT === "1";
if (atomicPayment) {
  await fixture.db.query(await readFile(new URL("../docs/verification/record-monthly-farm-payment.local.sql", import.meta.url), "utf8"));
}
await fixture.db.query("update farm_staff set role='admin' where user_id=$1", [
  fixture.manager,
]);
await fixture.release();
let activateCompetingPlan;
const bridge = await startFixtureServer(fixture.config, {
  port: 55493,
  manualOrders: Boolean(process.env.PREMIUM_MANUAL_ORDER_ONLY),
  afterManualPlanLookup: async (client) => {
    const activate = activateCompetingPlan;
    activateCompetingPlan = undefined;
    await activate?.(client);
  },
});
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
      FARM_ATOMIC_MONTHLY_PAYMENT: atomicPayment ? "true" : "false",
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
await fixture.db.query("update customer_profiles set phone='0000000000',address_line='Fictional entrance' where user_id=$1", [customer]);
await fixture.db.query("update production_capacity set daily_limit=1000");
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
const routes = process.env.PREMIUM_MANUAL_ORDER_ONLY
  ? [`/customers/${customer}`]
  : process.env.PREMIUM_OVERVIEW_ONLY ? ["", "/capacity"] : allRoutes;
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
          if (route === `/customers/${customer}`) {
            const order = main.locator("#new-order");
            await order.getByText("Record paid order", { exact: true }).click();
            await order.getByRole("spinbutton", { name: /Fresh paneer/ }).fill("2");
            const firstDate = await order.locator('input[name="startDate"]').inputValue();
            const firstWeekday = new Date(firstDate).getUTCDay() || 7;
            await order.getByLabel("Fresh paneer repeat").selectOption("days");
            await order.locator(`input[name="paneerWeekday"][value="${firstWeekday}"]`).check();
            await order.locator(`input[name="paneerWeekday"][value="${firstWeekday % 7 + 1}"]`).check();
            await order.getByRole("spinbutton", { name: /Farm ghee/ }).fill("1");
            await order.getByLabel("Farm ghee repeat").selectOption("custom");
            await order.locator('input[name="gheeDeliveryDate"]').nth(0).check();
            await order.locator('input[name="gheeDeliveryDate"]').nth(13).check();
            await order.getByText("Review dated deliveries", { exact: true }).click();
            assert.ok(await order.getByText(/2 × Fresh paneer/).count() >= 4);
            assert.ok(await order.getByText(/1 × Farm ghee/).count() >= 2);
            assert.equal(await order.getByLabel("Bottle").inputValue(), "none");
            await order.getByRole("checkbox", { name: /confirm the farm received/ }).check();
            assert.equal(await order.getByRole("button", { name: "Record paid order" }).isEnabled(), true, await order.innerText());
            if (process.env.PREMIUM_MANUAL_ORDER_ONLY && !results.length) {
              const date = await order.locator('input[name="startDate"]').inputValue();
              const recordingId = await order.locator('input[name="recordingId"]').inputValue();
              const expected = Number(await order.locator('input[name="expectedTotalPaise"]').inputValue());
              const reference = "TEST-MONTHLY-PANEER-GHEE";
              await order.getByRole("textbox", { name: "Payment reference" }).fill(reference);
              const submit = order.getByRole("button", { name: "Record paid order" });
              const feedback = order.getByRole("status").or(order.getByRole("alert"));

              if (!atomicPayment) {
                let competingPlan;
                let competingOrder;
                activateCompetingPlan = async (client) => {
                  competingPlan = (await client.query(
                    "insert into delivery_plans(user_id,status,start_date,bottle_choice,purchased_deliveries) values($1,'pending_confirmation',$2,'return',30) returning id",
                    [customer, date],
                  )).rows[0].id;
                  competingOrder = (await client.query(
                    "insert into orders(user_id,delivery_plan_id,purchase_mode,status,bottle_choice,start_date,subtotal_paise,total_paise,phone_snapshot,address_snapshot) values($1,$2,'plan','pending_payment','return',$3,6200,6200,'0000000000','Fixture address') returning id",
                    [customer, competingPlan, date],
                  )).rows[0].id;
                  await client.query("select capture_farm_order_payment($1,'cash','TEST-COMPETING-PLAN')", [competingOrder]);
                };
                await submit.click();
                const conflict = order.getByRole("alert");
                await conflict.waitFor({ timeout: 5000 });
                assert.match(await conflict.innerText(), /already has a current plan/);
                const remainingPlans = (await fixture.db.query(
                  "select id,status from delivery_plans where user_id=$1", [customer],
                )).rows;
                assert.deepEqual(remainingPlans, [{ id: competingPlan, status: "active" }]);
                assert.equal((await fixture.db.query(
                  "select count(*)::int as count from payments where provider_payment_id=$1", [reference],
                )).rows[0].count, 0);
                await fixture.db.query("delete from payments where order_id=$1", [competingOrder]);
                await fixture.db.query("delete from orders where id=$1", [competingOrder]);
                await fixture.db.query("delete from delivery_plans where id=$1", [competingPlan]);
                await order.getByRole("checkbox", { name: /confirm the farm received/ }).check();
              }

              // Capacity can change after the manager has opened the form.
              const laterGheeDate = (await fixture.db.query(
                "select ($1::date+13)::text as delivery_date", [date],
              )).rows[0].delivery_date;
              await fixture.db.query(
                "insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('ghee',$1,0)",
                [laterGheeDate],
              );
              await submit.click();
              await order.getByRole("alert").filter({ hasText: "capacity is full" }).waitFor();
              const rejected = (await fixture.db.query(
                `select
                  (select count(*)::int from orders where user_id=$1 and purchase_mode='plan') as orders,
                  (select count(*)::int from delivery_plans where user_id=$1) as plans,
                  (select count(*)::int from payments where provider_payment_id=$2) as receipts`,
                [customer, reference],
              )).rows[0];
              assert.deepEqual(rejected, { orders: 0, plans: 0, receipts: 0 });

              await fixture.db.query(
                "delete from production_capacity_overrides where product_key='ghee' and delivery_date=$1",
                [laterGheeDate],
              );
              await order.getByRole("checkbox", { name: /confirm the farm received/ }).check();
              await submit.click();
              await feedback.filter({ hasText: "Paid order recorded" }).waitFor({ timeout: 5000 });
              const receipt = (await fixture.db.query(
                `select o.id, o.delivery_plan_id, p.amount_paise::int as amount, o.total_paise::int as total
                 from orders o join payments p on p.order_id=o.id
                 where o.user_id=$1 and o.purchase_mode='plan' and p.status='captured'`,
                [customer],
              )).rows;
              assert.equal(receipt.length, 1);
              if (atomicPayment) assert.equal(receipt[0].id, recordingId);
              assert.equal(receipt[0].amount, expected);
              assert.equal(receipt[0].total, expected);
              await fixture.db.query("select set_config('request.jwt.claim.sub',$1,false)", [fixture.manager]);
              await fixture.db.query("select generate_daily_deliveries($1)", [date]);
              const items = (await fixture.db.query(
                `select i.product_key, i.quantity::int as quantity
                 from daily_deliveries d join daily_delivery_items i on i.delivery_id=d.id
                 where d.plan_id=$1 and d.delivery_date=$2 order by i.product_key`,
                [receipt[0].delivery_plan_id, date],
              )).rows;
              assert.deepEqual(items, [
                { product_key: "ghee", quantity: 1 },
                { product_key: "paneer", quantity: 2 },
              ]);
              const handoff = await context.newPage();
              try {
                await handoff.goto(`${base}/farm/payments?customer=${customer}`);
                const financeReceipt = handoff.getByRole("article").filter({ hasText: reference });
                await financeReceipt.getByText(`Order MMA-${receipt[0].id.slice(0, 8).toUpperCase()}`).waitFor();
                await financeReceipt.getByText(/Fresh paneer × [1-9]/).waitFor();
                await financeReceipt.getByText(/Farm ghee × [1-9]/).waitFor();

                await handoff.goto(`${base}/farm/delivery-sheet?date=${date}`);
                await handoff.getByText(/Fresh paneer · 2 × 500 g/).first().waitFor();
                await handoff.getByText(/Farm ghee · 1 × 500 g/).first().waitFor();
              } finally {
                await handoff.close();
              }
              const customerContext = await browser.newContext({
                viewport: { width, height: 950 },
              });
              try {
                await customerContext.addCookies([cookie(customer)]);
                const calendar = await customerContext.newPage();
                await calendar.goto(`${base}/calendar?plan=${receipt[0].delivery_plan_id}`);
                const monthly = calendar.getByRole("region", { name: "Your monthly delivery plan" });
                await monthly.getByText("See all delivery dates", { exact: true }).click();
                const firstDelivery = monthly.getByRole("listitem").filter({
                  has: calendar.locator(`time[datetime="${date}"]`),
                });
                await firstDelivery.getByText(/Fresh paneer · 2 × 500 g/).waitFor();
                await firstDelivery.getByText(/Farm ghee · 1 × 500 g/).waitFor();
                assert.ok(await monthly.getByText(/Fresh paneer · 2 × 500 g/).count() >= 4);
                assert.equal(await monthly.getByText(/Farm ghee · 1 × 500 g/).count(), 2);
                const secondGhee = monthly.getByRole("listitem").filter({
                  has: calendar.locator(`time[datetime="${laterGheeDate}"]`),
                });
                await secondGhee.getByText(/Farm ghee · 1 × 500 g/).waitFor();

                await calendar.goto(`${base}/account?section=orders`);
                const orderNumber = `Order MMA-${receipt[0].id.slice(0, 8).toUpperCase()}`;
                const history = calendar.locator("details").filter({ hasText: orderNumber });
                await history.getByText("Scheduled plan", { exact: true }).waitFor();
                if (!(await history.getByText(orderNumber, { exact: false }).isVisible())) {
                  await history.locator("summary").click();
                }
                await history.getByText("Fresh paneer", { exact: true }).waitFor();
                await history.getByText("Farm ghee", { exact: true }).waitFor();
              } finally {
                await customerContext.close();
              }
            }
          }
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
