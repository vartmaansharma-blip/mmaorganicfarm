import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase();
const { db } = runtime;
const manager = randomUUID(),
  driver = randomUUID(),
  other = randomUUID(),
  customer = randomUUID(),
  plan = randomUUID(),
  order = randomUUID();
try {
  const { today, tomorrow, weekday } = (
    await db.query(
      "select (now() at time zone 'Asia/Kolkata')::date::text today,((now() at time zone 'Asia/Kolkata')::date+1)::text tomorrow,extract(isodow from (now() at time zone 'Asia/Kolkata')::date+1)::int weekday",
    )
  ).rows[0];
  await db.query(
    "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
    [[manager, driver, other, customer]],
  );
  await db.query(
    "insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver'),($3,'driver')",
    [manager, driver, other],
  );
  const area = (
    await db.query(
      "insert into delivery_areas(name,slug) values('Request zone','request-zone') returning id",
    )
  ).rows[0].id;
  const route = (
    await db.query(
      "insert into delivery_routes(name,area_id) values('Request route',$1) returning id",
      [area],
    )
  ).rows[0].id;
  await db.query(
    "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
    [route, driver, manager],
  );
  await db.query(
    "update customer_profiles set address_line='Synthetic address',full_name='Spoken request fixture',delivery_area_id=$2,delivery_route_id=$3 where user_id=$1",
    [customer, area, route],
  );
  await db.query(
    "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'return')",
    [plan, customer, today],
  );
  await db.query(
    "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','paid','return',100,100,$4,'0000000000','Synthetic address')",
    [order, customer, plan, today],
  );
  await db.query(
    "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
    [order, customer, order],
  );
  await db.query(
    "insert into weekly_delivery_items(plan_id,user_id,day_of_week,product_key,quantity,unit) values($1,$2,$3,'milk',2,'L')",
    [plan, customer, weekday],
  );
  await db.query("update delivery_plans set status='active' where id=$1", [
    plan,
  ]);
  const delivery = (
    await db.query(
      "insert into daily_deliveries(plan_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,'ready',$4,$5,$6,'Spoken request fixture','Synthetic address','return',$7) returning id",
      [plan, customer, today, area, route, driver, manager],
    )
  ).rows[0].id;
  await db.query(
    "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L')",
    [delivery],
  );
  await db.query(
    "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
    [today, manager],
  );
  const save = (who = driver, kind = "skip_milk", key = randomUUID()) =>
    callAs(
      db,
      who,
      "select record_driver_customer_request($1,$2,$3,$4,$5) result",
      [
        delivery,
        tomorrow,
        kind,
        "No milk tomorrow; please resume after that.",
        key,
      ],
    );
  const review = (
    id,
    decision = "approve",
    who = manager,
    key = randomUUID(),
  ) =>
    callAs(
      db,
      who,
      "select review_driver_customer_request($1,$2,$3,$4) result",
      [id, decision, "Confirmed directly with the customer", key],
    );
  let request;
  await test("driver captures a verbal request idempotently without changing today's delivery or paid entitlement", async () => {
    const key = randomUUID();
    request = (await save(driver, "skip_milk", key)).rows[0].result.id;
    assert.equal(
      (await save(driver, "skip_milk", key)).rows[0].result.reused,
      true,
    );
    assert.equal(
      (
        await db.query("select status from daily_deliveries where id=$1", [
          delivery,
        ])
      ).rows[0].status,
      "ready",
    );
    assert.equal(
      (await db.query("select count(*)::int n from delivery_visit_outcomes"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [plan],
        )
      ).rows[0].delivered_deliveries,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from delivery_customer_requests"))
        .rows[0].n,
      1,
    );
  });
  await test("another driver, customer, anonymous caller and direct private calls cannot capture or approve a request", async () => {
    for (const who of [other, customer, null])
      await assert.rejects(save(who), /assigned|staff/);
    await assert.rejects(review(request, "approve", driver), /Manager/);
    await assert.rejects(
      callAs(
        db,
        driver,
        "select private.record_customer_request($1,$2,'skip_milk','skip please',$3)",
        [delivery, tomorrow, randomUUID()],
      ),
      /permission denied/,
    );
    assert.equal(
      (await callAs(db, other, "select * from delivery_customer_requests"))
        .rowCount,
      0,
    );
    assert.equal(
      (await callAs(db, customer, "select * from delivery_customer_requests"))
        .rowCount,
      1,
    );
    await assert.rejects(
      callAs(
        db,
        driver,
        "update delivery_customer_requests set status='approved'",
      ),
      /permission denied/,
    );
  });
  await test("manager approval refreshes an unlocked draft, skips only milk, preserves other products and keeps prepaid count", async () => {
    await db.query(
      "insert into weekly_delivery_items(plan_id,user_id,day_of_week,product_key,quantity,unit) values($1,$2,$3,'paneer',1,'500 g')",
      [plan, customer, weekday],
    );
    await callAs(db, manager, "select generate_daily_deliveries($1)", [
      tomorrow,
    ]);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [tomorrow]);
    const original = (
      await db.query(
        "update daily_deliveries set route_stop_order=42 where plan_id=$1 and delivery_date=$2 returning id",
        [plan, tomorrow],
      )
    ).rows[0].id;
    const key = randomUUID();
    assert.equal(
      (await review(request, "approve", manager, key)).rows[0].result.status,
      "approved",
    );
    assert.equal(
      (await review(request, "approve", manager, key)).rows[0].result.reused,
      true,
    );
    const items = (
      await db.query(
        "select i.product_key from daily_deliveries d join daily_delivery_items i on i.delivery_id=d.id where d.delivery_date=$1 and d.plan_id=$2",
        [tomorrow, plan],
      )
    ).rows.map((r) => r.product_key);
    assert.deepEqual(items, ["paneer"]);
    assert.equal(
      (
        await db.query(
          "select route_stop_order from daily_deliveries where id=$1",
          [original],
        )
      ).rows[0].route_stop_order,
      42,
    );
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [plan],
        )
      ).rows[0].delivered_deliveries,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select status from delivery_dispatches where delivery_date=$1",
          [tomorrow],
        )
      ).rows[0].status,
      "draft",
    );
  });
  await test("quantity requests require follow-up; they cannot be marked applied or create unpaid milk", async () => {
    const id = (await save(driver, "quantity_change")).rows[0].result.id;
    await assert.rejects(review(id), /reviewed plan/);
    assert.equal(
      (await review(id, "follow_up")).rows[0].result.status,
      "follow_up",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_exceptions where action='override'",
        )
      ).rows[0].n,
      0,
    );
  });
  await test("released future dispatch blocks automatic approval and retains the pending request", async () => {
    const id = (await save()).rows[0].result.id;
    await db.query(
      "update delivery_dispatches set status='released',released_by=$2,released_at=now() where delivery_date=$1",
      [tomorrow, manager],
    );
    await assert.rejects(review(id), /released or closed/);
    assert.equal(
      (
        await db.query(
          "select status from delivery_customer_requests where id=$1",
          [id],
        )
      ).rows[0].status,
      "requested",
    );
    await db.query("update farm_staff set active=false where user_id=$1", [
      driver,
    ]);
    assert.equal(
      (await callAs(db, driver, "select * from delivery_customer_requests"))
        .rowCount,
      0,
    );
  });
  await test("delivering other products on a milk-skip day cannot consume a milk entitlement", async () => {
    await db.query(
      "select set_config('test.customer_request_clock',$1,false)",
      [tomorrow],
    );
    await db.query(
      "create or replace function private.operational_today() returns date language sql stable set search_path='' as $$select current_setting('test.customer_request_clock')::date$$",
    );
    const ids = (
      await db.query(
        "select id from daily_deliveries where plan_id=$1 and delivery_date=$2",
        [plan, tomorrow],
      )
    ).rows.map((r) => r.id);
    await callAs(
      db,
      manager,
      "select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",
      [ids, randomUUID()],
    );
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [plan],
        )
      ).rows[0].delivered_deliveries,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_entitlement_movements where plan_id=$1",
          [plan],
        )
      ).rows[0].n,
      0,
    );
  });
} finally {
  await runtime.stop();
}
