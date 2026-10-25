import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase();
const { db } = runtime;
const manager = randomUUID(),
  driver = randomUUID();
try {
  const { start, following_day: second } = (
    await db.query(
      "select ((now() at time zone 'Asia/Kolkata')::date+1)::text start,((now() at time zone 'Asia/Kolkata')::date+2)::text following_day",
    )
  ).rows[0];
  await db.query(
    "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
    [[manager, driver]],
  );
  await db.query(
    "insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver')",
    [manager, driver],
  );
  const area = (
    await db.query(
      "insert into delivery_areas(name,slug) values('Monthly zone','monthly-operations') returning id",
    )
  ).rows[0].id;
  const route = (
    await db.query(
      "insert into delivery_routes(area_id,name,stop_capacity) values($1,'Monthly route',100) returning id",
      [area],
    )
  ).rows[0].id;
  await db.query(
    "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
    [route, driver, manager],
  );
  await db.query(
    "update production_capacity set daily_limit=1000 where product_key in ('milk','paneer','ghee')",
  );
  await db.query("select set_config('test.monthly_clock',$1,false)", [start]);
  await db.query(
    "create or replace function private.operational_today() returns date language sql stable set search_path='' as $$select current_setting('test.monthly_clock')::date$$",
  );
  async function plan(product, dates) {
    const user = randomUUID(),
      order = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      user,
      user + "@fixture.invalid",
    ]);
    await db.query(
      "update customer_profiles set full_name='Synthetic monthly customer',phone='0000000000',address_line='Synthetic monthly address',delivery_area_id=$2,delivery_route_id=$3 where user_id=$1",
      [user, area, route],
    );
    const rules = [
      {
        id: product,
        repeat: "custom",
        quantity: 2,
        firstDate: dates[0],
        dates,
      },
    ];
    const id = (
      await callAs(db, user, "select save_pending_monthly_plan($1,$2,$3) id", [
        start,
        product === "milk" ? "return" : "none",
        JSON.stringify(rules),
      ])
    ).rows[0].id;
    await db.query(
      "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','paid',$4,100,100,$5,'0000000000','Synthetic monthly address')",
      [order, user, id, product === "milk" ? "return" : "none", start],
    );
    await db.query(
      "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
      [order, user, order],
    );
    await db.query("update delivery_plans set status='active' where id=$1", [
      id,
    ]);
    return { id, user };
  }
  const milk = await plan("milk", [start, second]);
  const paneer = await plan("paneer", [start]);
  await test("monthly plans are classified and generated from paid dated schedules alongside legacy plans", async () => {
    const before = (
      await db.query("select * from delivery_plans where id=$1", [milk.id])
    ).rows[0];
    assert.equal(before.entitlement_model, "calendar_period");
    assert.equal(before.purchased_deliveries, 0);
    assert.equal(
      (
        await callAs(db, manager, "select generate_daily_deliveries($1) n", [
          start,
        ])
      ).rows[0].n,
      2,
    );
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [start]);
    await callAs(db, manager, "select release_daily_dispatch($1)", [start]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from daily_deliveries where delivery_date=$1",
          [start],
        )
      ).rows[0].n,
      2,
    );
  });
  async function deliver(planId, date, kind = "delivered", quantities = null) {
    const ids = (
      await db.query(
        "select id from daily_deliveries where plan_id=$1 and delivery_date=$2",
        [planId, date],
      )
    ).rows.map((r) => r.id);
    return callAs(
      db,
      driver,
      "select record_delivery_outcome($1,$2,$3,null,0,$4,$5)",
      [
        ids,
        kind,
        kind === "delivered" ? null : "product_shortage",
        quantities ? JSON.stringify(quantities) : null,
        randomUUID(),
      ],
    );
  }
  await test("monthly milk and nonmilk fulfilment never consume legacy milk credits; finite nonmilk plan completes", async () => {
    await deliver(milk.id, start);
    await deliver(paneer.id, start);
    const rows = (
      await db.query(
        "select id,status,delivered_deliveries from delivery_plans where id=any($1::uuid[])",
        [[milk.id, paneer.id]],
      )
    ).rows;
    assert.equal(rows.find((r) => r.id === milk.id).status, "active");
    assert.equal(rows.find((r) => r.id === paneer.id).status, "completed");
    assert.ok(rows.every((r) => r.delivered_deliveries === 0));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_entitlement_movements",
        )
      ).rows[0].n,
      0,
    );
    assert.deepEqual(
      (
        await callAs(db, manager, "select get_delivery_reconciliation($1) r", [
          start,
        ])
      ).rows[0].r.blockers,
      [],
    );
  });
  await test("monthly partial quantities remain outstanding and cannot be rescheduled through the legacy financial adapter", async () => {
    await db.query("select set_config('test.monthly_clock',$1,false)", [
      second,
    ]);
    await callAs(db, manager, "select generate_daily_deliveries($1)", [second]);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [second]);
    await callAs(db, manager, "select release_daily_dispatch($1)", [second]);
    const row = (
      await db.query(
        "select id,visit_key from daily_deliveries where plan_id=$1 and delivery_date=$2",
        [milk.id, second],
      )
    ).rows[0];
    await deliver(milk.id, second, "partial", [
      { delivery_id: row.id, product_key: "milk", quantity: 1 },
    ]);
    assert.equal(
      (
        await db.query("select status from delivery_plans where id=$1", [
          milk.id,
        ])
      ).rows[0].status,
      "active",
    );
    const event = (
      await db.query(
        "select event_id from delivery_visit_outcomes where delivery_date=$1 and visit_key=$2",
        [second, row.visit_key],
      )
    ).rows[0].event_id;
    await assert.rejects(
      callAs(
        db,
        manager,
        "select resolve_delivery_exception($1,$2,$3,'reschedule','Needs a monthly policy review',$4,$5)",
        [second, row.visit_key, event, "2027-01-01", randomUUID()],
      ),
      /legacy entitlement/,
    );
    await callAs(
      db,
      manager,
      "select resolve_delivery_exception($1,$2,$3,'confirm_delivered','Remaining milk handed over and verified',null,$4)",
      [second, row.visit_key, event, randomUUID()],
    );
    assert.equal(
      (
        await db.query("select status from delivery_plans where id=$1", [
          milk.id,
        ])
      ).rows[0].status,
      "completed",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_entitlement_movements",
        )
      ).rows[0].n,
      0,
    );
  });
  await test("monthly checkout still reserves the whole paid period and detects a week-four capacity shortfall", async () => {
    const user = randomUUID(),
      order = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      user,
      user + "@fixture.invalid",
    ]);
    const id = (
      await callAs(
        db,
        user,
        "select save_pending_monthly_plan($1,'return',$2) id",
        [
          start,
          JSON.stringify([
            { id: "milk", repeat: "daily", quantity: 2, firstDate: start },
          ]),
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','draft','return',100,100,$4,'0000000000','Synthetic capacity address')",
      [order, user, id, start],
    );
    const day = (
      await db.query("select ($1::date+21)::text service_date", [start])
    ).rows[0].service_date;
    await db.query(
      "insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('milk',$1,1)",
      [day],
    );
    await assert.rejects(
      db.query("select reserve_order_capacity($1)", [order]),
      /capacity is full/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from order_capacity_reservations where order_id=$1",
          [order],
        )
      ).rows[0].n,
      0,
    );
  });
} finally {
  await runtime.stop();
}
