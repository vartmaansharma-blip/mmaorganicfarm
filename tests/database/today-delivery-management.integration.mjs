import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { callAs, createDatabase } from "./runtime.mjs";

const runtime = await createDatabase({ routingFoundation: true, driverRuns: true });
test.after(() => runtime.stop());
const { db, config } = runtime;
await db.query(await readFile(new URL("../../docs/verification/todays-delivery-management.local.sql", import.meta.url), "utf8"));
const { today, tomorrow } = (await db.query("select private.operational_today()::text today, (private.operational_today()+1)::text tomorrow")).rows[0];
async function user() {
  const id = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@fixture.invalid`]);
  return id;
}
const manager = await user(), driver = await user(), otherDriver = await user(), outsider = await user();
await db.query("insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver'),($3,'driver')", [manager, driver, otherDriver]);
const zone = (await db.query("insert into delivery_areas(name,slug) values('Fixture zone','today-fixture') returning id")).rows[0].id;
const route = (await db.query("insert into delivery_routes(area_id,name,code,stop_capacity) values($1,'Fixture route','TODAY',100) returning id", [zone])).rows[0].id;

async function seed({ once = false } = {}) {
  const customer = await user(), plan = once ? null : randomUUID(), order = randomUUID(), delivery = randomUUID();
  if (plan) {
    await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,schedule_rules) values($1,$2,'paused',$3,'return','calendar_month',($3::date+interval '1 month')::date,0,$4)", [plan, customer, today, JSON.stringify([{ id: "milk", repeat: "daily", quantity: 3 }])]);
  }
  await db.query("insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,$4,'paid','return',24800,24800,'0000000000','Fixture address',$5)",
    [order, customer, plan, once ? "once" : "plan", today]);
  await db.query("insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,24800,'manual','captured',$3)", [order, customer, order]);
  if (plan) {
    await db.query("update delivery_plans set status='active' where id=$1", [plan]);
    await db.query("insert into scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit) values($1,$2,'milk',$3,3,'litre'),($1,$2,'milk',$4,1,'litre')", [plan, customer, today, tomorrow]);
  }
  await db.query("insert into daily_deliveries(id,plan_id,order_id,user_id,delivery_date,status,customer_name,generated_by,delivery_area_id,delivery_route_id,assigned_driver_id,address_snapshot) values($1,$2,$3,$4,$5,'planned','Fixture customer',$6,$7,$8,$9,'Fixture address')",
    [delivery, plan, once ? order : null, customer, today, manager, zone, route, driver]);
  await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',3,'litre'),($1,'paneer',1,'500 g')", [delivery]);
  return { customer, plan, order, delivery };
}
async function request(fixture, { id = randomUUID(), actor = fixture.customer, kind = "quantity", product = "milk", before = 3, quantity = 2, note = "" } = {}) {
  await callAs(db, actor, "select request_today_delivery_change($1,$2,$3,$4,$5,$6,$7)",
    [id, fixture.delivery, kind, product, before, quantity, note]);
  return id;
}
function review(id, decision = "applied", actor = manager, client = db) {
  return callAs(client, actor, "select review_today_delivery_change($1,$2,'Farm review of customer request') result", [id, decision]);
}
async function milk(fixture) {
  return (await db.query("select quantity from daily_delivery_items where delivery_id=$1 and product_key='milk'", [fixture.delivery])).rows[0].quantity;
}
async function notices(fixture) {
  return (await callAs(db, fixture.customer, "select title,message from customer_notifications where kind='delivery_change' order by created_at")).rows;
}
await db.query("insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('milk',$1,100000) on conflict(product_key,delivery_date) do update set daily_limit=100000", [tomorrow]);

test("customer and manager browser journey with notification receipt and outcome", {
  skip: process.env.TODAY_DELIVERY_BROWSER !== "1",
}, async () => {
  const { chromium, webkit } = await import("playwright");
  const { startFixtureServer, sessionFor } = await import("./supabase-fixture-server.mjs");
  const bridge = await startFixtureServer(runtime.config);
  const output = await mkdtemp(path.join(tmpdir(), "mma-today-delivery-"));
  const port = Number(process.env.TODAY_DELIVERY_BROWSER_PORT ?? 3172);
  const base = `http://127.0.0.1:${port}`;
  let log = "";
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "local-service-fixture" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", chunk => { log += chunk; });
  app.stderr.on("data", chunk => { log += chunk; });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base + "/sign-in")).ok) break; } catch {}
      if (attempt >= 100) throw Error(log);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
      const f = await seed();
      const browser = await engine.launch();
      try {
        async function pageFor(userId, width) {
          const context = await browser.newContext({ viewport: { width, height: 840 } });
          await context.addCookies([{ name: "sb-127-auth-token", url: base,
            value: "base64-" + Buffer.from(JSON.stringify(sessionFor(userId))).toString("base64url") }]);
          return context.newPage();
        }
        const customerPage = await pageFor(f.customer, 390);
        const managerPage = await pageFor(manager, 1280);
        await customerPage.goto(base + "/account", { waitUntil: "networkidle" });
        const response = await customerPage.request.get(base + "/api/account/delivery");
        const snapshot = await response.json();
        assert.equal(response.status(), 200, JSON.stringify(snapshot));
        assert.ok(snapshot.management?.deliveries.some(delivery => delivery.id === f.delivery && delivery.editable),
          JSON.stringify({ date: snapshot.date, today, state: snapshot.state, management: snapshot.management }));

        await customerPage.getByRole("button", { name: "Modify today’s delivery" }).click();
        const form = customerPage.locator("#today-change-form");
        await form.getByRole("spinbutton", { name: "Requested litres" }).fill("2");
        await form.getByRole("button", { name: "Review request" }).click();
        const comparison = form.getByRole("term").filter({ hasText: "Requested" });
        await comparison.waitFor();
        await form.getByText("3 L", { exact: true }).waitFor();
        await form.getByText("2 L", { exact: true }).waitFor();
        assert.equal(await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await form.screenshot({ path: path.join(output, `${name}-review-light.png`) });
        await form.getByRole("button", { name: "Send to the farm" }).click();
        await customerPage.getByRole("list", { name: "Your delivery requests" }).getByText("Awaiting farm review").waitFor();
        assert.equal(await milk(f), "3.00");
        const managerResponse = await managerPage.goto(base + "/farm/cancellations", { waitUntil: "networkidle" });
        assert.equal(managerResponse?.status(), 200, await managerPage.locator("body").innerText());
        assert.equal(new URL(managerPage.url()).pathname, "/farm/cancellations");
        const queue = managerPage.getByRole("region", { name: "Same-day delivery requests" });
        await queue.waitFor();
        await queue.getByRole("combobox", { name: "Decision" }).selectOption("applied");
        await queue.getByLabel("Message to customer").fill("We moved 1 L of prepaid milk to tomorrow.");
        await queue.getByRole("button", { name: "Save decision" }).click();
        await queue.getByText("No same-day requests awaiting review.").waitFor();
        await customerPage.reload({ waitUntil: "networkidle" });
        await customerPage.getByRole("list", { name: "Your delivery requests" }).getByText("Change confirmed").waitFor();
        assert.equal(await milk(f), "2.00");
        await customerPage.evaluate(() => localStorage.setItem("mma-theme", "dark"));
        await customerPage.reload({ waitUntil: "networkidle" });
        assert.equal(await customerPage.locator("html").getAttribute("data-theme"), "dark");
        await customerPage.locator("[data-delivery-state]").screenshot({ path: path.join(output, `${name}-today-dark.png`) });
        await customerPage.goto(base + "/account/notifications?filter=deliveries");
        await customerPage.getByRole("heading", { name: "Delivery quantity updated", exact: true }).waitFor();
        await customerPage.getByRole("heading", { name: "Delivery change requested", exact: true }).waitFor();
      } finally {
        await browser.close();
      }
    }
    console.log(`Today delivery browser screenshots: ${output}`);
  } catch (error) {
    console.error(log);
    throw error;
  } finally {
    app.kill("SIGTERM");
    await bridge.stop();
  }
});

test("customer request is private and idempotent; approval moves only the prepaid difference and notifies once", async () => {
  const f = await seed(), id = await request(f);
  await request(f, { id });
  await assert.rejects(request(f), /already awaiting/);
  await assert.rejects(request(f, { actor: outsider }), /your confirmed deliveries/);
  await assert.rejects(review(id, "applied", driver), /manager access/);
  await assert.rejects(callAs(db, f.customer, "update today_delivery_requests set status='applied' where id=$1", [id]), /permission denied/);
  assert.equal((await callAs(db, outsider, "select * from today_delivery_requests where id=$1", [id])).rowCount, 0);
  assert.equal((await notices(f)).length, 1);
  assert.equal(await milk(f), "3.00");
  await review(id);
  await review(id);
  assert.equal(await milk(f), "2.00");
  assert.equal((await db.query("select plan_product_quantity($1,'milk',$2) quantity", [f.plan, tomorrow])).rows[0].quantity, "2.00");
  assert.equal((await db.query("select quantity from daily_delivery_items where delivery_id=$1 and product_key='paneer'", [f.delivery])).rows[0].quantity, "1.00");
  assert.deepEqual((await db.query("select o.total_paise,p.status from orders o join payments p on p.order_id=o.id where o.id=$1", [f.order])).rows[0], { total_paise: 24800, status: "captured" });
  const notifications = await notices(f);
  assert.equal(notifications.length, 2);
  assert.match(notifications[1].message, /Milk changed from 3 to 2 L/);
  assert.equal((await callAs(db, outsider, "select * from customer_notifications where kind='delivery_change'")).rowCount, 0);
});

test("two customers cannot consume the same remaining next-day capacity", async () => {
  const f = await seed(), g = await seed(), a = await request(f), b = await request(g);
  const snapshot = (await db.query("select active_plan_quantity + paid_once_quantity + checkout_holds_quantity + 1 capacity from product_capacity_snapshot('milk',$1,1)", [tomorrow])).rows[0];
  await db.query("update production_capacity_overrides set daily_limit=$2 where product_key='milk' and delivery_date=$1", [tomorrow, snapshot.capacity]);
  const left = new Client(config), right = new Client(config);
  await Promise.all([left.connect(), right.connect()]);
  try {
    const results = await Promise.allSettled([review(a, "applied", manager, left), review(b, "applied", manager, right)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.match(results.find(result => result.status === "rejected").reason.message, /capacity/);
    assert.deepEqual([await milk(f), await milk(g)].sort(), ["2.00", "3.00"]);
  } finally {
    await Promise.all([left.end(), right.end()]);
  }
});

test("one-time edits, packed requests and additional quantities stay unconfirmed and can be followed up", async () => {
  const once = await seed({ once: true }), f = await seed();
  const onceRequest = await request(once);
  await assert.rejects(review(onceRequest), /before packing/);
  await review(onceRequest, "follow_up");
  const addition = await request(f, { quantity: 4 });
  await assert.rejects(review(addition), /partial prepaid reduction/);
  await review(addition, "declined");
  await db.query("update daily_deliveries set status='ready' where id=$1", [f.delivery]);
  const packed = await request(f);
  await assert.rejects(review(packed), /before packing/);
  assert.equal(await milk(f), "3.00");
  assert.equal(await milk(once), "3.00");
  assert.equal((await notices(once)).at(-1).title, "Delivery follow-up needed");
});

test("after handover quantity editing closes; issue reporting still notifies without altering payment", async () => {
  const f = await seed();
  await db.query("update daily_deliveries set status='delivered',delivery_confirmed=true where id=$1", [f.delivery]);
  await assert.rejects(request(f), /Quantity changes are closed/);
  const issue = await request(f, { kind: "issue", product: null, before: null, quantity: null, note: "Fixture missing item" });
  await review(issue, "follow_up");
  await review(issue, "resolved");
  await review(issue, "resolved");
  assert.deepEqual((await notices(f)).map(notice => notice.title),
    ["Delivery issue received", "Delivery follow-up needed", "Delivery follow-up closed"]);
  assert.equal((await db.query("select count(*) n from farm_change_log where record_id=$1", [issue])).rows[0].n, "2");
  assert.equal(await milk(f), "3.00");
});

test("released driver sees only assigned confirmed quantities and a stale outcome cannot overwrite them", async () => {
  const f = await seed();
  await db.query("update production_capacity_overrides set daily_limit=100000 where product_key='milk' and delivery_date=$1", [tomorrow]);
  await review(await request(f));
  // A refreshed dispatch sheet can regenerate the row while retaining the paid plan and service date.
  const replacement = randomUUID();
  await db.query("delete from daily_deliveries where id=$1", [f.delivery]);
  await db.query("insert into daily_deliveries(id,plan_id,user_id,delivery_date,status,customer_name,generated_by,delivery_area_id,delivery_route_id,assigned_driver_id,address_snapshot) values($1,$2,$3,$4,'planned','Fixture customer',$5,$6,$7,$8,'Fixture address')",
    [replacement, f.plan, f.customer, today, manager, zone, route, driver]);
  await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'litre'),($1,'paneer',1,'500 g')", [replacement]);
  f.delivery = replacement;
  await db.query("insert into delivery_dispatches(delivery_date,status,prepared_by) values($1,'draft',$2)", [today, manager]);
  await db.query("insert into daily_route_assignments(delivery_date,route_id,driver_id,updated_by) values($1,$2,$3,$4)", [today, route, driver, manager]);
  await db.query("update daily_deliveries set phone_snapshot='0000000000' where delivery_date=$1", [today]);
  await callAs(db, manager, "select release_daily_dispatch($1)", [today]);
  const assigned = (await callAs(db, driver, "select * from get_driver_today_changes($1)", [today])).rows;
  assert.equal(assigned.find(row => row.delivery_id === f.delivery).requested_quantity, "2.00");
  assert.equal((await callAs(db, otherDriver, "select * from get_driver_today_changes($1)", [today])).rowCount, 0);
  assert.equal((await callAs(db, driver, "select * from today_delivery_requests where delivery_id=$1", [f.delivery])).rowCount, 0);
  const expected = quantity => JSON.stringify([
    { delivery_id: f.delivery, product_key: "milk", quantity },
    { delivery_id: f.delivery, product_key: "paneer", quantity: 1 },
  ]);
  const outcome = (actor, quantity, key) => callAs(db, actor,
    "select record_current_delivery_outcome(array[$1::uuid],'delivered',null,null,0,null,$2,$3)", [f.delivery, key, expected(quantity)]);
  await assert.rejects(outcome(otherDriver, 2, randomUUID()), /assigned to you/);
  await assert.rejects(outcome(driver, 3, randomUUID()), /delivery changed/);
  const key = randomUUID();
  await outcome(driver, 2, key);
  await outcome(driver, 2, key);
  assert.equal((await db.query("select status from daily_deliveries where id=$1", [f.delivery])).rows[0].status, "delivered");
});
