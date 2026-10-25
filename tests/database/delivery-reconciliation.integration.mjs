import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase();
const { db, config } = runtime;
const today = (
  await db.query("select (now() at time zone 'Asia/Kolkata')::date::text date")
).rows[0].date;
const tomorrow = (
  await db.query(
    "select ((now() at time zone 'Asia/Kolkata')::date+1)::text date",
  )
).rows[0].date;
const manager = randomUUID(),
  admin = randomUUID(),
  driver = randomUUID(),
  other = randomUUID(),
  inactive = randomUUID();
await db.query(
  "insert into auth.users(id,email) select x, x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
  [[manager, admin, driver, other, inactive]],
);
for (const [id, role, active] of [
  [manager, "manager", true],
  [admin, "admin", true],
  [driver, "driver", true],
  [other, "driver", true],
  [inactive, "manager", false],
])
  await db.query(
    "insert into farm_staff(user_id,role,active) values($1,$2,$3)",
    [id, role, active],
  );
const area = (
  await db.query(
    "insert into delivery_areas(name,slug) values('Synthetic zone','synthetic-zone') returning id",
  )
).rows[0].id;
const route = (
  await db.query(
    "insert into delivery_routes(area_id,name,code,stop_capacity) values($1,'Synthetic route','SYN',100) returning id",
    [area],
  )
).rows[0].id;
await db.query(
  "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
  [route, driver, manager],
);
await db.query(
  "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
  [today, manager],
);
let customerCounter = 0;
async function fixture({
  milk = 2,
  once = false,
  products = null,
  date = today,
  model = "legacy_delivery_count",
} = {}) {
  const user = randomUUID(),
    plan = once ? null : randomUUID(),
    order = randomUUID();
  customerCounter++;
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      user,
      `customer-${customerCounter}@fixture.invalid`,
      { full_name: `Synthetic customer ${customerCounter}` },
    ],
  );
  await db.query(
    "update customer_profiles set delivery_area_id=$2,delivery_route_id=$3,address_line='Synthetic address',phone='0000000000',route_stop_order=$4 where user_id=$1",
    [user, area, route, customerCounter],
  );
  if (plan)
    await db.query(
      "insert into delivery_plans(id,user_id,status,start_date,bottle_choice,entitlement_model) values($1,$2,'paused',$3,'return',$4)",
      [plan, user, date, model],
    );
  await db.query(
    "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,$4,'paid','return',100,100,'0000000000','Synthetic address',$5)",
    [order, user, plan, once ? "once" : "plan", date],
  );
  await db.query(
    "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
    [order, user, order],
  );
  if (plan)
    await db.query("update delivery_plans set status='active' where id=$1", [
      plan,
    ]);
  const id = (
    await db.query(
      "insert into daily_deliveries(plan_id,order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,$4,'ready',$5,$6,$7,$8,'Synthetic address','return',$9) returning id,visit_key",
      [
        plan,
        once ? order : null,
        user,
        date,
        area,
        route,
        driver,
        `Synthetic customer ${customerCounter}`,
        manager,
      ],
    )
  ).rows[0];
  const items = products ?? [{ key: "milk", quantity: milk, unit: "L" }];
  for (const item of items)
    await db.query(
      "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,$2,$3,$4)",
      [id.id, item.key, item.quantity, item.unit],
    );
  return { user, plan, order, id: id.id, visit: id.visit_key, date, items };
}
async function outcome(
  f,
  {
    who = driver,
    kind = "delivered",
    reason = null,
    note = null,
    bottles = 0,
    quantities = null,
    key = randomUUID(),
    ids = [f.id],
  } = {},
) {
  const r = await callAs(
    db,
    who,
    "select record_delivery_outcome($1,$2,$3,$4,$5,$6,$7) result",
    [
      ids,
      kind,
      reason,
      note,
      bottles,
      quantities ? JSON.stringify(quantities) : null,
      key,
    ],
  );
  return r.rows[0].result;
}
async function resolve(
  f,
  event,
  {
    action = "retain_entitlement",
    follow = tomorrow,
    note = "Manager reviewed the obligation",
    key = randomUUID(),
    who = manager,
  } = {},
) {
  return (
    await callAs(
      db,
      who,
      "select resolve_delivery_exception($1,$2,$3,$4,$5,$6,$7) result",
      [f.date, f.visit, event, action, note, follow, key],
    )
  ).rows[0].result;
}
async function count(f) {
  return (
    await db.query(
      "select delivered_deliveries,purchased_deliveries from delivery_plans where id=$1",
      [f.plan],
    )
  ).rows[0];
}
try {
  await test("A/C: successful prepaid delivery and identical retry consume once", async () => {
    const f = await fixture(),
      key = randomUUID();
    await outcome(f, { key, bottles: 1 });
    await outcome(f, { key, bottles: 1 });
    assert.equal((await count(f)).delivered_deliveries, 1);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_operation_events where request_key=$1",
          [key],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from customer_notifications where delivery_id=$1",
          [f.id],
        )
      ).rows[0].n,
      1,
    );
  });
  await test("B/G/N: failed attempt keeps all 30 purchased entitlements and structured reason", async () => {
    const f = await fixture();
    await outcome(f, { kind: "attempt_failed", reason: "gate_locked" });
    assert.deepEqual(await count(f), {
      delivered_deliveries: 0,
      purchased_deliveries: 30,
    });
    const row = (
      await db.query(
        "select reason_code,resolution from delivery_visit_outcomes where visit_key=$1",
        [f.visit],
      )
    ).rows[0];
    assert.deepEqual(row, {
      reason_code: "gate_locked",
      resolution: "pending",
    });
  });
  await test("reason/other are required and unsuccessful save is atomic", async () => {
    const f = await fixture();
    await assert.rejects(outcome(f, { kind: "attempt_failed" }), /reason/i);
    await assert.rejects(
      outcome(f, { kind: "attempt_failed", reason: "other", note: "x" }),
      /Explain/i,
    );
    assert.equal(
      (
        await db.query("select status from daily_deliveries where id=$1", [
          f.id,
        ])
      ).rows[0].status,
      "ready",
    );
  });
  await test("J/security: wrong driver, customer, anonymous, inactive staff cannot mutate", async () => {
    const f = await fixture();
    for (const who of [other, f.user, null, inactive])
      await assert.rejects(outcome(f, { who }), /assigned|staff/i);
    await assert.rejects(resolve(f, randomUUID(), { who: driver }), /Manager/i);
  });
  await test("D: concurrent opposite outcomes commit only one result", async () => {
    const f = await fixture();
    const a = new Client(config),
      b = new Client(config);
    await a.connect();
    await b.connect();
    try {
      const queries = [
        ["delivered", null],
        ["attempt_failed", "gate_locked"],
      ].map(async ([kind, reason], i) =>
        callAs(
          i === 0 ? a : b,
          driver,
          "select record_delivery_outcome($1,$2,$3,null,0,null,$4)",
          [[f.id], kind, reason, randomUUID()],
        ),
      );
      const results = await Promise.allSettled(queries);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from delivery_operation_events where visit_key=$1",
            [f.visit],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await a.end();
      await b.end();
    }
  });
  await test("E: grouped mixed commercial obligations are one visit and cannot be submitted incompletely", async () => {
    const f = await fixture();
    const order = randomUUID();
    await db.query(
      "insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,'once','paid','none',100,100,'0000000000','Synthetic address',$3)",
      [order, f.user, today],
    );
    await db.query(
      "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
      [order, f.user, order],
    );
    const extra = (
      await db.query(
        "insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_route_id,assigned_driver_id,customer_name,address_snapshot,generated_by) values($1,$2,$3,'ready',$4,$5,'Synthetic mixed visit','Synthetic address',$6) returning id",
        [order, f.user, today, route, driver, manager],
      )
    ).rows[0].id;
    await db.query(
      "insert into daily_delivery_items values($1,'paneer',1,'500 g',null),($1,'ghee',1,'500 g',null)",
      [extra],
    );
    await assert.rejects(outcome(f), /every active/i);
    await outcome(f, { ids: [f.id, extra] });
    assert.equal((await count(f)).delivered_deliveries, 1);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_visit_outcomes where visit_key=$1",
          [f.visit],
        )
      ).rows[0].n,
      1,
    );
  });
  await test("F/H: partial milk retains credit; a linked replacement completes that original entitlement once", async () => {
    const f = await fixture();
    const event = await outcome(f, {
      kind: "partial",
      reason: "product_shortage",
      quantities: [{ delivery_id: f.id, product_key: "milk", quantity: 1 }],
    });
    assert.equal((await count(f)).delivered_deliveries, 0);
    await resolve(f, event.event_id, { action: "reschedule" });
    const replacement = (
      await db.query(
        "select id,delivery_date::text,visit_key from daily_deliveries where replacement_of_delivery_id=$1",
        [f.id],
      )
    ).rows[0];
    assert.ok(replacement);
    assert.equal(
      (
        await db.query(
          "select quantity from daily_delivery_items where delivery_id=$1",
          [replacement.id],
        )
      ).rows[0].quantity,
      "1.00",
    );
    await assert.rejects(
      resolve(f, event.event_id, { action: "reschedule" }),
      /changed|resolved/i,
    );
  });
  await test("I: retry cannot duplicate documented bottle return", async () => {
    const f = await fixture(),
      key = randomUUID();
    await outcome(f, { bottles: 1, key });
    await outcome(f, { bottles: 1, key });
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from daily_deliveries where id=$1 and bottle_returned",
          [f.id],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      outcome(await fixture(), { bottles: 2 }),
      /expectation/i,
    );
  });
  await test("O: monthly delivery adapter refuses unsupported consumption", async () => {
    const f = await fixture({ model: "calendar_period" });
    await assert.rejects(outcome(f), /not activated/i);
    assert.equal((await count(f)).delivered_deliveries, 0);
  });
  await test("P: one-time fulfilment creates no subscription movement", async () => {
    const f = await fixture({ once: true });
    await outcome(f);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_entitlement_movements where root_delivery_id=$1",
          [f.id],
        )
      ).rows[0].n,
      0,
    );
  });
  await test("Q: missing/zero/overfilled partial quantities cannot become success", async () => {
    const f = await fixture();
    for (const quantity of [null, 0, 3])
      await assert.rejects(
        outcome(f, {
          kind: "partial",
          reason: "product_shortage",
          quantities: [{ delivery_id: f.id, product_key: "milk", quantity }],
        }),
        /quantity|Partial/i,
      );
    assert.equal((await count(f)).delivered_deliveries, 0);
  });
  await test("M: manager correction preserves original event and current customer history", async () => {
    const f = await fixture(),
      first = await outcome(f, {
        kind: "attempt_failed",
        reason: "customer_unavailable",
      });
    const key = randomUUID();
    await resolve(f, first.event_id, {
      action: "confirm_delivered",
      follow: null,
      key,
    });
    await resolve(f, first.event_id, {
      action: "confirm_delivered",
      follow: null,
      key,
    });
    assert.equal((await count(f)).delivered_deliveries, 1);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_operation_events where visit_key=$1",
          [f.visit],
        )
      ).rows[0].n,
      2,
    );
    const history = await callAs(
      db,
      f.user,
      "select get_customer_delivery_outcomes($1,20) h",
      [f.user],
    );
    assert.equal(history.rows[0].h[0].outcome, "delivered");
    await assert.rejects(
      callAs(db, other, "select get_customer_delivery_outcomes($1,20)", [
        f.user,
      ]),
      /denied/i,
    );
  });
  await test("K: unresolved material discrepancies block closeout", async () => {
    await assert.rejects(
      callAs(
        db,
        manager,
        "select close_delivery_day($1,'closed','Synthetic closeout',$2)",
        [today, randomUUID()],
      ),
      /blockers/i,
    );
  });
  await test("direct writes and tampering cannot bypass command accounting", async () => {
    const f = await fixture();
    await assert.rejects(
      callAs(
        db,
        manager,
        "update daily_deliveries set status='delivered' where id=$1",
        [f.id],
      ),
      /command/i,
    );
    const e = await outcome(f, {
      kind: "attempt_failed",
      reason: "gate_locked",
    });
    await assert.rejects(
      callAs(
        db,
        manager,
        "update delivery_operation_events set reason='tamper' where id=$1",
        [e.event_id],
      ),
      /permission/i,
    );
    await assert.rejects(
      db.query(
        "update delivery_operation_events set reason='tamper' where id=$1",
        [e.event_id],
      ),
      /append-only/i,
    );
  });
  await test("L/M: fully accounted day closes idempotently, blocks writes and preserves correction versions", async () => {
    const past = (
      await db.query(
        "select ((now() at time zone 'Asia/Kolkata')::date-1)::text date",
      )
    ).rows[0].date;
    await db.query(
      "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
      [past, manager],
    );
    const f = await fixture({ date: past });
    await outcome(f, { who: manager });
    const key = randomUUID();
    await callAs(
      db,
      manager,
      "select close_delivery_day($1,'closed','All visits reviewed',$2)",
      [past, key],
    );
    await callAs(
      db,
      manager,
      "select close_delivery_day($1,'closed','All visits reviewed',$2)",
      [past, key],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_day_reviews where delivery_date=$1",
          [past],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "update daily_deliveries set driver_note='overwrite' where id=$1",
        [f.id],
      ),
      /closed/i,
    );
    await callAs(
      db,
      admin,
      "select close_delivery_day($1,'correction_required','Review historical evidence',$2)",
      [past, randomUUID()],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_day_reviews where delivery_date=$1",
          [past],
        )
      ).rows[0].n,
      2,
    );
  });
  await test("RLS restricts driver customer and subscription reads directly", async () => {
    const f = await fixture();
    assert.equal(
      (
        await callAs(
          db,
          other,
          "select * from customer_profiles where user_id=$1",
          [f.user],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await callAs(
          db,
          driver,
          "select * from customer_profiles where user_id=$1",
          [f.user],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await callAs(db, driver, "select * from delivery_plans where id=$1", [
          f.plan,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await callAs(db, manager, "select * from delivery_plans where id=$1", [
          f.plan,
        ])
      ).rowCount,
      1,
    );
  });
  await test("read-only exception filters and quantity totals use grouped native records", async () => {
    const f = await fixture();
    await outcome(f, { kind: "attempt_failed", reason: "quality_concern" });
    const queue = (
      await callAs(
        db,
        manager,
        "select get_delivery_exceptions($1,'pending','quality_concern',$2,null,'',0,25) q",
        [today, route],
      )
    ).rows[0].q;
    assert.ok(queue.rows.some((r) => r.visit_key === f.visit));
    const excluded=(await callAs(db,manager,"select get_delivery_exceptions(p_date=>$1,p_resolution=>'pending',p_area=>$2) q",[today,randomUUID()])).rows[0].q;
    assert.equal(excluded.total,0,"zone filters must apply before pagination and totals");
    const summary = (
      await callAs(db, manager, "select get_delivery_reconciliation($1) r", [
        today,
      ])
    ).rows[0].r;
    for (const p of summary.products)
      assert.equal(
        Number(p.scheduled),
        Number(p.delivered) + Number(p.cancelled) + Number(p.outstanding),
      );
    await assert.rejects(
      callAs(db, driver, "select get_delivery_reconciliation($1)", [today]),
      /Manager/,
    );
  });
  await test("replacement completion consumes original partial milk entitlement exactly once under advanced test clock", async () => {
    const f = await fixture();
    const first = await outcome(f, {
      kind: "partial",
      reason: "product_shortage",
      quantities: [{ delivery_id: f.id, product_key: "milk", quantity: 1 }],
    });
    await resolve(f, first.event_id, { action: "reschedule" });
    const replacement = (
      await db.query(
        "select id,visit_key from daily_deliveries where replacement_of_delivery_id=$1",
        [f.id],
      )
    ).rows[0];
    await db.query(
      "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
      [tomorrow, manager],
    );
    await db.query(
      "update daily_deliveries set assigned_driver_id=$2,status='ready' where id=$1",
      [replacement.id, driver],
    );
    await db.query(
      `create or replace function private.operational_today() returns date language sql stable set search_path='' as $$ select date '${tomorrow}'; $$;`,
    );
    try {
      const key = randomUUID();
      await outcome({ ...f, id: replacement.id }, { key });
      await outcome({ ...f, id: replacement.id }, { key });
      assert.equal((await count(f)).delivered_deliveries, 1);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from delivery_entitlement_movements where root_delivery_id=$1",
            [f.id],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await db.query(
        "create or replace function private.operational_today() returns date language sql stable set search_path='' as $$ select (now() at time zone 'Asia/Kolkata')::date; $$;",
      );
    }
  });
} finally {
  await runtime.stop();
}
