import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { callAs, createDatabase } from "./runtime.mjs";

test("staff monthly capture rolls back on failure and serializes with online checkout", async () => {
  const { db, config, stop } = await createDatabase();
  const online = new Client(config);
  await online.connect();
  try {
    await db.query(await readFile(new URL("../../docs/verification/record-monthly-farm-payment.local.sql", import.meta.url), "utf8"));
    const customer = randomUUID();
    const order = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [customer, customer + "@fixture.invalid"]);
    await db.query("update customer_profiles set phone='0000000000',address_line='Fixture address' where user_id=$1", [customer]);
    const { day, revision } = (await db.query(
      "select (private.operational_today()+1)::text as day, revision from farm_catalog_prices",
    )).rows[0];
    const rules = JSON.stringify([
      { id: "paneer", quantity: 2, repeat: "once", firstDate: day },
      { id: "ghee", quantity: 1, repeat: "once", firstDate: day },
    ]);
    const items = JSON.stringify([
      { product_key: "paneer", product_name: "Fresh paneer", quantity: 2, unit: "500 g", unit_price_paise: 20000, line_total_paise: 40000, delivery_date: day },
      { product_key: "ghee", product_name: "Farm ghee", quantity: 1, unit: "500 g", unit_price_paise: 37500, line_total_paise: 37500, delivery_date: day },
    ]);
    const args = [order, customer, day, "none", rules, items, revision, 77500, 0, "cash", "ATOMIC-FIXTURE"];
    const command = "select record_monthly_farm_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as id";
    await assert.rejects(callAs(db, customer, command, args), /permission denied/);
    await db.query("update production_capacity set daily_limit=1000");
    await db.query("insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('ghee',$1,0)", [day]);
    await assert.rejects(db.query(command, args), /capacity is full/);
    await db.query("delete from production_capacity_overrides where product_key='ghee' and delivery_date=$1", [day]);
    await assert.rejects(db.query(command, [...args.slice(0, 9), "invalid", args[10]]), /valid payment method/);
    const counts = async () => (await db.query(
      `select
        (select count(*)::int from delivery_plans where user_id=$1) as plans,
        (select count(*)::int from orders where user_id=$1) as orders,
        (select count(*)::int from payments where user_id=$1) as receipts,
        (select count(*)::int from scheduled_delivery_items where user_id=$1) as dated_items`,
      [customer],
    )).rows[0];
    assert.deepEqual(await counts(), { plans: 0, orders: 0, receipts: 0, dated_items: 0 });

    await db.query("begin");
    await db.query("set local role service_role");
    assert.equal((await db.query(command, args)).rows[0].id, order);
    const onlineResult = assert.rejects(
      callAs(online, customer, "select save_pending_monthly_plan($1,'none',$2)", [day, rules]),
      /already have a current paid plan/,
    );
    let waiting = false;
    for (let attempt = 0; attempt < 40 && !waiting; attempt++) {
      waiting = (await db.query(
        "select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) as waiting",
        [online.processID],
      )).rows[0].waiting;
      if (!waiting) await delay(50);
    }
    assert.ok(waiting, "online checkout waits on the staff transaction's customer lock");
    await db.query("commit");
    await onlineResult;
    assert.equal((await db.query(command, args)).rows[0].id, order);
    assert.deepEqual(await counts(), { plans: 1, orders: 1, receipts: 1, dated_items: 2 });
  } finally {
    await db.query("rollback");
    await online.end();
    await stop();
  }
});
