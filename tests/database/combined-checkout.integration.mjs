import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { callAs, createDatabase } from "./runtime.mjs";
import { sessionFor, startFixtureServer } from "./supabase-fixture-server.mjs";

async function browserFixture(config, users, combinedCheckout = false) {
  const { chromium, webkit } = await import("playwright");
  const bridge = await startFixtureServer(config, { port: 0, combinedCheckout });
  const base = "http://127.0.0.1:3167";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3167"], {
    env: {
      ...process.env, NEXT_PUBLIC_SUPABASE_URL: bridge.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "local-service-fixture",
      RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_LIVE_CHECKOUT_ENABLED: "false",
    },
    stdio: "ignore",
  });
  const pages = [];
  const browsers = [];
  async function close() {
    await Promise.all(browsers.map((browser) => browser.close()));
    server.kill("SIGTERM");
    await bridge.stop();
  }
  try {
    for (let attempt = 0; ; attempt++) {
      if ((await fetch(`${base}/pricing`).catch(() => null))?.ok) break;
      if (attempt >= 40 || server.exitCode !== null) throw new Error("Local preview did not start");
      await delay(250);
    }
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch();
      browsers.push(browser);
      const [customer, manager] = await Promise.all(users.map(async (user) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
        await context.addCookies([{
          name: "sb-127-auth-token",
          value: "base64-" + Buffer.from(JSON.stringify(sessionFor(user))).toString("base64url"),
          url: base,
        }]);
        return context.newPage();
      }));
      pages.push({ customer, manager });
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { base, pages, close };
}

test("combined checkout prices bottles once, captures atomically and notifies farm staff", async () => {
  const runtime = await createDatabase({ routingFoundation: true, driverRuns: true, farmNotifications: true });
  const { db } = runtime;
  let browser;
  try {
    const owner = randomUUID(), manager = randomUUID(), driver = randomUUID();
    for (const user of [owner, manager, driver])
      await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@fixture.invalid`]);
    await db.query("insert into farm_staff(user_id,role) values($1,'admin'),($2,'manager'),($3,'driver')", [owner, manager, driver]);
    const { day } = (await db.query("select (private.operational_today()+1)::text as day")).rows[0];

    async function prepare(isTest = false) {
      const user = randomUUID(), once = randomUUID(), scheduled = randomUUID(), batch = randomUUID();
      await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@fixture.invalid`]);
      const rules = JSON.stringify([{ id: "milk", quantity: 2, repeat: "once", firstDate: day }]);
      const { plan } = (await callAs(db, user, "select save_pending_monthly_plan($1,'return',$2) plan", [day, rules])).rows[0];
      await db.query("update delivery_plans set is_test=$2 where id=$1", [plan, isTest]);
      await db.query(
        `insert into orders(id,user_id,purchase_mode,delivery_plan_id,bottle_choice,milk_litres,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot,is_test)
         values($1,$3,'once',null,'return',1,6200,6700,$4,'0000000000','Fixture address',$6),
               ($2,$3,'plan',$5,'return',2,12400,12400,$4,'0000000000','Fixture address',$6)`,
        [once, scheduled, user, day, plan, isTest],
      );
      await db.query(
        `insert into order_items(order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,line_total_paise,frequency,delivery_date)
         values($1,$3,'milk','Fresh milk',1,'litre',6200,6200,'once',$4),($2,$3,'milk','Fresh milk',2,'litre',6200,12400,'once',$4)`,
        [once, scheduled, user, day],
      );
      await db.query("insert into checkout_batches(id,user_id,once_order_id,plan_order_id,amount_paise,is_test) values($1,$2,$3,$4,19100,$5)", [batch, user, once, scheduled, isTest]);
      return { user, once, scheduled, batch, plan, rules, isTest };
    }
    const changeMode = (order, mode, total, user = order.user) => callAs(db, user,
      "select set_checkout_batch_bottle_mode($1,$2,$3)", [order.batch, mode, total]);
    async function claim(order, total) {
      await db.query("select set_config('request.jwt.claim.role','service_role',false)");
      await db.query("select claim_checkout_batch($1,$2,$3)", [order.batch, total, order.rules]);
      if (!order.isTest) {
        for (const child of [order.once, order.scheduled])
          await db.query("select reserve_order_capacity($1)", [child]);
      }
      await db.query("select bind_checkout_batch($1,$2)", [order.batch, `order_${order.batch}`]);
    }
    async function capture(order, total) {
      return (await db.query("select capture_checkout_batch($1,$2,$3,$4) status",
        [order.batch, `order_${order.batch}`, `pay_${order.batch}`, total])).rows[0].status;
    }
    const notifications = async (user) => (await callAs(db, user, "select get_farm_notifications() feed")).rows[0].feed.items;

    const order = await prepare();
    if (process.env.COMBINED_CHECKOUT_BROWSER === "1") {
      browser = await browserFixture(runtime.config, [order.user, manager]);
      for (const { customer } of browser.pages) {
        await customer.goto(`${browser.base}/checkout/batch/review?batch=${order.batch}`, { waitUntil: "networkidle" });
        const bottleSwitch = customer.getByRole("switch", { name: "Keep bottle" });
        await bottleSwitch.waitFor();
        assert.equal(await bottleSwitch.getAttribute("aria-checked"), "false");
        await customer.getByRole("button", { name: "Pay ₹191", exact: true }).waitFor();
        await bottleSwitch.click();
        await customer.getByRole("button", { name: "Pay ₹221", exact: true }).waitFor();
        assert.equal(await bottleSwitch.getAttribute("aria-checked"), "true");
        await bottleSwitch.press("Space");
        await customer.getByRole("button", { name: "Pay ₹191", exact: true }).waitFor();
        assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    await assert.rejects(changeMode(order, "new", 19100, manager), /unavailable/);
    await assert.rejects(callAs(db, order.user, "select set_checkout_bottle_mode($1,'new',6700)", [order.once]), /combined checkout/);
    await assert.rejects(db.query("update orders set status='pending_payment' where id=$1", [order.once]), /combined checkout/);
    await changeMode(order, "new", 19100);
    assert.equal((await db.query("select amount_paise from checkout_batches where id=$1", [order.batch])).rows[0].amount_paise, 22100);
    assert.equal((await db.query("select bottle_choice from delivery_plans where id=$1", [order.plan])).rows[0].bottle_choice, "new");
    await assert.rejects(changeMode(order, "return", 19100), /bill changed/);
    await changeMode(order, "return", 22100);
    await changeMode(order, "new", 19100);
    await assert.rejects(claim(order, 19100), /changed/);
    await claim(order, 22100);
    await assert.rejects(changeMode(order, "return", 22100), /unavailable/);
    await assert.rejects(capture(order, 19100), /mismatch/);
    assert.equal(await capture(order, 22100), "paid");
    assert.equal(await capture(order, 22100), "paid");
    const paidRetry = await db.query(
      "select prepare_combined_checkout($1,$2,$3,$4,'{}','[]') as batch",
      [order.user, order.once, day, order.rules],
    );
    assert.equal(paidRetry.rows[0].batch, order.batch);
    const allocations = (await db.query("select amount_paise,provider_payment_id from payments where checkout_batch_id=$1 order by amount_paise", [order.batch])).rows;
    assert.deepEqual(allocations.map((row) => row.amount_paise), [7700, 14400]);
    assert.equal(allocations.filter((row) => row.provider_payment_id).length, 1);
    assert.equal((await db.query("select status from delivery_plans where id=$1", [order.plan])).rows[0].status, "active");
    const feed = await notifications(manager);
    const confirmed = feed.filter((item) => item.title === "Combined order confirmed");
    assert.equal(confirmed.length, 1);
    assert.match(confirmed[0].message, /One-time milk: keep bottle; Scheduled milk: keep bottle/);
    assert.doesNotMatch(confirmed[0].message, /221|₹|INR/);
    assert.equal((await notifications(owner)).filter((item) => item.title === "Payment recorded").length, 0);
    await assert.rejects(notifications(driver), /access required/);
    for (const { manager } of browser?.pages ?? []) {
      await manager.goto(`${browser.base}/farm/settings`, { waitUntil: "networkidle" });
      await manager.getByRole("button", { name: "Notifications", exact: true }).click();
      const panel = manager.getByRole("dialog", { name: "Notifications" });
      await panel.getByText("Combined order confirmed", { exact: true }).waitFor();
      await panel.getByText(/One-time milk: keep bottle; Scheduled milk: keep bottle/).waitFor();
    }

    const cancelled = await prepare();
    await claim(cancelled, 19100);
    await db.query("update delivery_plans set status='cancelled' where id=$1", [cancelled.plan]);
    assert.equal(await capture(cancelled, 19100), "review_required");
    assert.equal((await db.query("select status from delivery_plans where id=$1", [cancelled.plan])).rows[0].status, "cancelled");
    assert.equal((await notifications(owner)).filter((item) => item.title === "Combined payment needs review").length, 1);
    assert.equal((await notifications(manager)).filter((item) => item.title === "Combined payment needs review").length, 0);

    const testOrder = await prepare(true);
    await claim(testOrder, 19100);
    assert.equal(await capture(testOrder, 19100), "test_captured");
    assert.equal((await db.query("select status from delivery_plans where id=$1", [testOrder.plan])).rows[0].status, "pending_confirmation");
    assert.equal((await notifications(manager)).filter((item) => item.title === "Combined order confirmed").length, 1);
  } finally {
    await browser?.close();
    await runtime.stop();
  }
});

test("combined preparation is atomic, idempotent and safely recovers from a stale review", async () => {
  const runtime = await createDatabase();
  const { db } = runtime;
  let browser;
  try {
    const user = randomUUID(), other = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
    const { day } = (await db.query("select (private.operational_today()+1)::text as day")).rows[0];
    const rules = [{ id: "milk", quantity: 2, repeat: "once", firstDate: day }];
    const order = {
      address_snapshot: "Fixture delivery address", phone_snapshot: "+919000000000",
      bottle_choice: "return", milk_litres: 2, subtotal_paise: 12400,
      bottle_charge_paise: 0, handling_fee_paise: 0, platform_fee_paise: 0, total_paise: 12400,
    };
    const items = [{
      product_key: "milk", product_name: "Fresh milk", quantity: 2, unit: "litre",
      unit_price_paise: 6200, line_total_paise: 12400, frequency: "once",
      scheduled_days: [], delivery_date: day,
    }];
    async function onceOrder() {
      const { id } = (await db.query(
        `insert into orders(user_id,purchase_mode,bottle_choice,milk_litres,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot)
         values($1,'once','return',1,6200,6700,$2,$3,$4) returning id`,
        [user, day, order.phone_snapshot, order.address_snapshot],
      )).rows[0];
      await db.query(
        `insert into order_items(order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,line_total_paise,frequency,delivery_date)
         values($1,$2,'milk','Fresh milk',1,'litre',6200,6200,'once',$3)`, [id, user, day],
      );
      return id;
    }
    const query = "select prepare_combined_checkout($1,$2,$3,$4,$5,$6) as batch";
    const args = (once, { owner = user, details = order, lines = items } = {}) =>
      [owner, once, day, JSON.stringify(rules), details, JSON.stringify(lines)];
    async function prepare(once, options) {
      const client = new Client(runtime.config);
      await client.connect();
      try {
        await client.query("begin");
        await client.query("set local role service_role");
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [other]);
        const { batch } = (await client.query(query, args(once, options))).rows[0];
        assert.equal((await client.query("select auth.uid() as subject")).rows[0].subject, other);
        await client.query("commit");
        return batch;
      } finally {
        await client.end();
      }
    }
    const once = await onceOrder();
    await assert.rejects(callAs(db, user, query, args(once)), /permission denied/);
    await assert.rejects(callAs(db, user,
      "select private.save_pending_monthly_plan_for_user($1,$2,'return',$3)",
      [other, day, JSON.stringify(rules)]), /permission denied/);
    await assert.rejects(callAs(db, null,
      "select save_pending_monthly_plan($1,'return',$2)",
      [day, JSON.stringify(rules)]), /Authentication required/);
    await assert.rejects(prepare(once, { owner: other }), /unavailable/);
    const [batch, duplicate] = await Promise.all([prepare(once), prepare(once)]);
    assert.equal(duplicate, batch);
    assert.equal(await prepare(once), batch);
    assert.equal((await db.query("select count(*)::int as n from orders where user_id=$1 and purchase_mode='plan'", [user])).rows[0].n, 1);

    const state = async (id) => (await db.query(
      `select b.status as batch_status, o.status as plan_status, o.id as plan_order, b.amount_paise, o.pricing_version
       from checkout_batches b join orders o on o.id=b.plan_order_id where b.id=$1`, [id],
    )).rows[0];
    const initial = await state(batch);
    assert.equal(initial.amount_paise, 19100);
    assert.equal(initial.pricing_version, 2);
    assert.equal(initial.plan_status, "draft");
    await assert.rejects(prepare(once, { details: { ...order, address_snapshot: "Updated delivery address" } }), /updated selection/);

    const fresh = await onceOrder();
    await assert.rejects(prepare(fresh, { lines: [{ ...items[0], quantity: 0 }] }), /check constraint/);
    assert.deepEqual(await state(batch), initial);
    assert.equal((await db.query("select count(*)::int as n from checkout_batches where once_order_id=$1", [fresh])).rows[0].n, 0);

    // Reproduce an old review whose scheduled child was replaced before this fix.
    await callAs(db, user, "select save_pending_monthly_plan($1,'return',$2)", [day, JSON.stringify(rules)]);
    assert.equal((await state(batch)).plan_status, "cancelled");
    assert.equal(await prepare(once), batch);
    assert.deepEqual(await state(batch), { ...initial, plan_status: "cancelled" });

    if (process.env.COMBINED_CHECKOUT_BROWSER === "1") {
      browser = await browserFixture(runtime.config, [user, other], true);
      const nextDay = (await db.query("select (private.operational_today()+2)::text as day")).rows[0].day;
      for (const [index, { customer }] of browser.pages.entries()) {
        await customer.setViewportSize(index === 0 ? { width: 1280, height: 900 } : { width: 390, height: 900 });
        await customer.addInitScript(({ start, later }) => {
          const milk = (quantity) => ({ start, quantity, repeat: "once" });
          const product = (quantity, extra = {}) => ({ enabled: true, frequency: "once", days: [], quantity, ...extra });
          if (sessionStorage.getItem("mma-shop-draft-v1")) return;
          sessionStorage.setItem("mma-shop-draft-v1", JSON.stringify({
            mode: "once",
            carts: {
              once: { start, milk: milk(1), paneer: product(2), ghee: product(1), selected: { milk: true, paneer: true, ghee: false } },
              plan: { start, milk: milk(2), paneer: product(1), ghee: product(1, { repeat: "custom", dates: [start, later] }), selected: { milk: true, paneer: false, ghee: true } },
            },
          }));
        }, { start: day, later: nextDay });
        await customer.goto(`${browser.base}/checkout/batch/review?batch=${batch}`);
        await customer.getByRole("heading", { name: "Review your cart again." }).waitFor();
        assert.equal(await customer.getByRole("button", { name: /Pay ₹/ }).count(), 0);
        await customer.getByRole("link", { name: "Open saved cart" }).click();
        const continueLink = customer.getByRole("dialog").getByRole("link", { name: "Continue to delivery details" });
        const cartHref = await continueLink.getAttribute("href");
        const signedOut = await customer.context().browser().newPage();
        try {
          await signedOut.goto(`${browser.base}${cartHref}`);
          await signedOut.waitForURL("**/sign-in?*");
          const returnTo = new URL(signedOut.url()).searchParams.get("next");
          assert.deepEqual(Object.fromEntries(new URL(returnTo, browser.base).searchParams),
            Object.fromEntries(new URL(cartHref, browser.base).searchParams));
          await signedOut.context().addCookies(await customer.context().cookies());
          await signedOut.goto(`${browser.base}${returnTo}`);
          await signedOut.getByRole("heading", { name: "Your complete order" }).waitFor();
        } finally { await signedOut.close(); }

        await continueLink.click();
        await customer.waitForURL((url) => url.pathname === "/order" && url.searchParams.has("checkout"));
        const formUrl = customer.url();
        await customer.reload();
        assert.equal(customer.url(), formUrl);
        const summary = customer.getByRole("region", { name: "Your complete order" });
        const oneTime = summary.getByRole("region", { name: "One-time delivery" });
        const scheduled = summary.getByRole("region", { name: "Scheduled deliveries" });
        await oneTime.getByText("Fresh paneer", { exact: true }).waitFor();
        await oneTime.getByText("1 L · ₹62 / L", { exact: true }).waitFor();
        await oneTime.getByText("2 × 500 g · ₹200 / 500 g", { exact: true }).waitFor();
        assert.equal(await oneTime.getByText("Farm ghee", { exact: true }).count(), 0);
        await scheduled.locator("strong").filter({ hasText: "Farm ghee" }).waitFor();
        await scheduled.getByText("2 L in total · ₹62 / L", { exact: true }).waitFor();
        assert.equal(await scheduled.getByText("Fresh paneer", { exact: true }).count(), 0);
        const calendar = scheduled.getByRole("region", { name: "Shared delivery calendar" });
        assert.equal(await calendar.isVisible(), false);
        const calendarToggle = scheduled.getByText("See delivery calendar");
        if (index === 0) await calendarToggle.press("Enter");
        else await calendarToggle.click();
        await calendar.waitFor();
        const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${nextDay}T12:00:00Z`));
        const dateButton = calendar.getByRole("button", { name: new RegExp(`${shortDate}.*Farm ghee`) });
        await dateButton.click();
        assert.equal(await dateButton.getAttribute("aria-pressed"), "true");
        await calendar.getByText("1 × 500 g", { exact: true }).waitFor();
        if (index) {
          await customer.getByRole("button", { name: "Switch to dark mode" }).click();
          assert.equal(await customer.locator("html").getAttribute("data-theme"), "dark");
        }
        assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const total = await customer.locator("[data-checkout-total]").textContent();
        assert.equal(total, "₹1,336");
        assert.equal(await customer.locator("textarea[name=address]").count(), 1);

        let reviewUrl;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await customer.goto(formUrl);
          await customer.locator("input[name=phone]").fill("9000000000");
          await customer.locator("textarea[name=address]").fill(order.address_snapshot);
          await customer.getByRole("button", { name: "Save delivery details & review order" }).click();
          await customer.waitForURL("**/checkout/batch/review?batch=*");
          if (reviewUrl) assert.equal(customer.url(), reviewUrl);
          reviewUrl = customer.url();
          await customer.getByRole("button", { name: `Pay ${total}`, exact: true }).waitFor();
        }

        const batchId = new URL(reviewUrl).searchParams.get("batch");
        const prepared = (await db.query(
          `select b.*, o.delivery_plan_id, p.schedule_rules from checkout_batches b
            join orders o on o.id=b.plan_order_id join delivery_plans p on p.id=o.delivery_plan_id where b.id=$1`, [batchId],
        )).rows[0];
        assert.equal(prepared.once_order_id, new URL(formUrl).searchParams.get("checkout"));
        assert.equal(prepared.amount_paise, 133600);
        assert.equal((await db.query("select count(*)::int n from checkout_batches where once_order_id=$1", [prepared.once_order_id])).rows[0].n, 1);
        const itemsFor = async (id) => (await db.query("select product_key,quantity::int from order_items where order_id=$1 order by product_key", [id])).rows;
        assert.deepEqual(await itemsFor(prepared.once_order_id), [{ product_key: "milk", quantity: 1 }, { product_key: "paneer", quantity: 2 }]);
        assert.deepEqual(await itemsFor(prepared.plan_order_id), [{ product_key: "ghee", quantity: 2 }, { product_key: "milk", quantity: 2 }]);

        if (index === browser.pages.length - 1) {
          await db.query("update production_capacity set daily_limit=20 where product_key in ('paneer','ghee')");
          await db.query("select set_config('request.jwt.claim.role','service_role',false)");
          await db.query("select claim_checkout_batch($1,$2,$3)", [batchId, prepared.amount_paise, JSON.stringify(prepared.schedule_rules)]);
          await db.query("select reserve_order_capacity($1)", [prepared.once_order_id]);
          await db.query("select reserve_order_capacity($1)", [prepared.plan_order_id]);
          await db.query("select bind_checkout_batch($1,$2)", [batchId, `order_${batchId}`]);
          const { status } = (await db.query("select capture_checkout_batch($1,$2,$3,$4) status",
            [batchId, `order_${batchId}`, `pay_${batchId}`, prepared.amount_paise])).rows[0];
          assert.equal(status, "paid");
          assert.deepEqual((await db.query(
            "select status from orders where id in ($1,$2)", [prepared.once_order_id, prepared.plan_order_id],
          )).rows.map((row) => row.status), ["paid", "paid"]);
          assert.deepEqual((await db.query(
            "select amount_paise from payments where checkout_batch_id=$1 order by amount_paise", [batchId],
          )).rows.map((row) => row.amount_paise), [46200, 87400]);
          assert.deepEqual((await db.query(
            "select product_key,delivery_date::text from scheduled_delivery_items where plan_id=$1 and product_key='ghee' order by delivery_date",
            [prepared.delivery_plan_id],
          )).rows, [{ product_key: "ghee", delivery_date: day }, { product_key: "ghee", delivery_date: nextDay }]);
          await customer.goto(`${browser.base}/checkout/batch/success?batch=${batchId}`);
          await customer.waitForFunction(() => {
            const { carts } = JSON.parse(sessionStorage.getItem("mma-shop-draft-v1"));
            return !carts.once.milk && !carts.once.paneer && carts.once.ghee
              && !carts.plan.milk && !carts.plan.ghee && carts.plan.paneer;
          });
        }
      }
    } else {
      const replacement = await prepare(fresh);
      assert.notEqual(replacement, batch);
      assert.equal((await state(replacement)).plan_status, "draft");
    }
  } finally {
    await browser?.close();
    await runtime.stop();
  }
});

test("unified preparation rolls back both orders and safely deduplicates overlapping submissions", async () => {
  const runtime = await createDatabase();
  const { db } = runtime;
  try {
    const user = randomUUID(), other = randomUUID(), checkout = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [user, other]);
    const { day, revision } = (await db.query(
      "select (private.operational_today()+1)::text as day,revision from farm_catalog_prices",
    )).rows[0];
    const rules = [{ id: "milk", quantity: 2, repeat: "once", firstDate: day }];
    const order = {
      start_date: day, address_snapshot: "Fixture delivery address", phone_snapshot: "+919000000000",
      bottle_choice: "return", milk_litres: 2, subtotal_paise: 12400,
      bottle_charge_paise: 0, handling_fee_paise: 0, platform_fee_paise: 0, total_paise: 12400,
    };
    const milk = {
      product_key: "milk", product_name: "Fresh milk", quantity: 2, unit: "litre",
      unit_price_paise: 6200, line_total_paise: 12400, frequency: "once", scheduled_days: [], delivery_date: day,
    };
    const query = "select prepare_unified_checkout($1,$2,$3,$4,$5,$6,$7,$8) as batch";
    const args = ({ customer = user, id = checkout, catalogue = revision, planLine = milk, onceLine = milk } = {}) => [
      customer, id, catalogue, { ...order, total_paise: 12900 }, JSON.stringify([onceLine]),
      order, JSON.stringify([planLine]), JSON.stringify(rules),
    ];
    async function prepare(options) {
      const client = new Client(runtime.config);
      await client.connect();
      try {
        await client.query("set role service_role");
        return (await client.query(query, args(options))).rows[0].batch;
      } finally { await client.end(); }
    }
    const footprint = async () => (await db.query(
      `select (select count(*)::int from orders where user_id=$1) orders,
         (select count(*)::int from checkout_batches where user_id=$1) batches,
         (select count(*)::int from delivery_plans where user_id=$1) plans`, [user],
    )).rows[0];
    await assert.rejects(callAs(db, user, query, args()), /permission denied/);
    await assert.rejects(prepare({ planLine: { ...milk, quantity: 0 } }), /check constraint/);
    assert.deepEqual(await footprint(), { orders: 0, batches: 0, plans: 0 });
    await assert.rejects(prepare({ catalogue: randomUUID() }), /prices changed/);
    assert.deepEqual(await footprint(), { orders: 0, batches: 0, plans: 0 });

    const [first, duplicate] = await Promise.all([prepare(), prepare()]);
    assert.equal(first, duplicate);
    assert.equal(await prepare(), first);
    assert.deepEqual(await footprint(), { orders: 2, batches: 1, plans: 1 });
    await assert.rejects(prepare({ customer: other }), /unavailable/);
    await assert.rejects(prepare({ onceLine: { ...milk, quantity: 1 } }), /updated basket/);
    await assert.rejects(prepare({ id: randomUUID(), planLine: { ...milk, quantity: 0 } }), /check constraint/);
    assert.deepEqual(await footprint(), { orders: 2, batches: 1, plans: 1 });
    const state = (await db.query(
      `select b.amount_paise,o.status,p.status as plan_status from checkout_batches b
       join orders o on o.id=b.plan_order_id join delivery_plans p on p.id=o.delivery_plan_id where b.id=$1`, [first],
    )).rows[0];
    assert.deepEqual(state, { amount_paise: 25300, status: "draft", plan_status: "pending_confirmation" });
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    await db.query("select claim_checkout_batch($1,$2,$3)", [first, state.amount_paise, JSON.stringify(rules)]);
    const { once_order_id, plan_order_id } = (await db.query("select once_order_id,plan_order_id from checkout_batches where id=$1", [first])).rows[0];
    await db.query("select reserve_order_capacity($1)", [once_order_id]);
    await db.query("select reserve_order_capacity($1)", [plan_order_id]);
    await db.query("select bind_checkout_batch($1,$2)", [first, `order_${first}`]);
    const { status } = (await db.query("select capture_checkout_batch($1,$2,$3,$4) status",
      [first, `order_${first}`, `pay_${first}`, state.amount_paise])).rows[0];
    assert.equal(status, "paid");
    assert.equal(await prepare(), first);
    await assert.rejects(prepare({ id: randomUUID() }), /current paid plan/);
    assert.deepEqual(await footprint(), { orders: 2, batches: 1, plans: 1 });
  } finally {
    await runtime.stop();
  }
});
