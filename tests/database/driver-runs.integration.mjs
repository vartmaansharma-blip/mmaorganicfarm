import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase({
  routingFoundation: process.env.RUNS_WITH_PINS !== "false",
  driverRuns: true,
  farmNotifications: true,
});
const { db, config } = runtime;
const manager = randomUUID(),
  driver = randomUUID(),
  other = randomUUID(),
  customer = randomUUID();
await db.query(
  "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
  [[manager, driver, other, customer]],
);
await db.query(
  "insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver'),($3,'driver')",
  [manager, driver, other],
);
const today = (
  await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")
).rows[0].d;
const area = (
  await db.query(
    "insert into delivery_areas(name,slug) values('Run fixture','run-fixture') returning id",
  )
).rows[0].id;
const route = (
  await db.query(
    "insert into delivery_routes(area_id,name) values($1,'Morning gardens') returning id",
    [area],
  )
).rows[0].id;
await db.query(
  "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
  [route, driver, manager],
);
async function visit(date = today, rt = route, user = customer, quantity = 2) {
  const order = randomUUID();
  await db.query(
    "insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'once','paid','none',100,100,$3,'0000000000','Fictional gate, Test Colony')",
    [order, user, date],
  );
  await db.query(
    "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
    [order, user, order],
  );
  const id = (
    await db.query(
      "insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,'planned',$4,$5,$6,1,'Fictional run customer','Fictional gate, Test Colony','none',$7) returning id",
      [order, user, date, area, rt, driver, manager],
    )
  ).rows[0].id;
  await db.query(
    "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',$2,'L'),($1,'paneer',1,'500 g')",
    [id, quantity],
  );
  return id;
}
const delivery = await visit();
await callAs(db, manager, "select prepare_daily_dispatch($1)", [today]);
const command = async (
  actor,
  action,
  payload,
  key = randomUUID(),
  client = db,
) =>
  (
    await callAs(
      client,
      actor,
      "select driver_operations_command($1,$2,$3) r",
      [action, JSON.stringify(payload), key],
    )
  ).rows[0].r;
const workspace = async (actor = manager, date = today) =>
  (await callAs(db, actor, "select get_driver_run_workspace($1) r", [date]))
    .rows[0].r;
const current = async () => (await workspace()).runs.find((r) => r.id === run);
let vehicle, run;
const change = async (actor, action, extra = {}) =>
  command(actor, action, {
    id: run,
    version: (await current()).version,
    ...extra,
  });
try {
  await test("RPCs require active staff; protected tables expose no direct writes or reads", async () => {
    await assert.rejects(workspace(customer), /access|staff|permitted/i);
    await assert.rejects(command(driver, "vehicle", {}), /Manager access/);
    await assert.rejects(
      callAs(db, driver, "select * from delivery_runs"),
      /permission denied/,
    );
    await assert.rejects(
      callAs(db, manager, "insert into farm_vehicles(name) values('bypass')"),
      /permission denied/,
    );
    const r = await db.query(
      "select bool_and(c.relrowsecurity) enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)",
      [
        [
          "farm_vehicles",
          "driver_operating_profiles",
          "driver_day_availability",
          "delivery_runs",
          "delivery_run_deliveries",
          "driver_operations_events",
        ],
      ],
    );
    assert.equal(r.rows[0].enabled, true);
  });
  await test("driver profiles and dated availability are required, with self-only availability", async () => {
    vehicle = (
      await command(manager, "vehicle", {
        name: "Farm van",
        registration: "TEST-01",
        ownership: "farm",
        milk_capacity: 20,
        paneer_capacity: 10,
        ghee_capacity: 10,
        stop_capacity: 20,
      })
    ).id;
    await assert.rejects(
      command(manager, "create", {
        date: today,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      }),
      /profile.*availability/,
    );
    await command(manager, "profile", {
      driver_id: driver,
      phone: "0000000000",
      default_vehicle_id: vehicle,
    });
    await assert.rejects(
      command(other, "availability", {
        driver_id: driver,
        date: today,
        available: true,
      }),
      /own availability/,
    );
    await command(driver, "availability", {
      driver_id: driver,
      date: today,
      available: true,
    });
    run = (
      await command(manager, "create", {
        date: today,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      })
    ).id;
    assert.equal((await current()).stop_count, 1);
    assert.equal((await workspace(other)).runs.length, 0);
    assert.deepEqual((await workspace(driver)).runs[0].manifest, []);
  });
  await test("loading enforces planned units and vehicle capacity; no manager may accept for the driver", async () => {
    await assert.rejects(
      change(manager, "load", { load: { milk: 1, paneer: 1 } }),
      /cover every/,
    );
    await assert.rejects(
      change(manager, "load", { load: { milk: 21, paneer: 1 } }),
      /capacity/,
    );
    await assert.rejects(
      change(manager, "load", { load: { milk: 3, paneer: 1.5 } }),
      /unsupported/,
    );
    await change(manager, "load", { load: { milk: 3, paneer: 1 } });
    await assert.rejects(change(manager, "acknowledge"), /driver must check/);
    await assert.rejects(change(other, "acknowledge"), /not assigned/);
    await change(driver, "reject_load", { note: "One litre missing" });
    assert.equal((await current()).status, "loading");
  });
  await test("load saves are idempotent and stale actions cannot overwrite current custody", async () => {
    const payload = {
        id: run,
        version: (await current()).version,
        load: { milk: 3, paneer: 1 },
      },
      key = randomUUID();
    assert.deepEqual(
      await command(manager, "load", payload, key),
      await command(manager, "load", payload, key),
    );
    await assert.rejects(
      command(
        manager,
        "load",
        { ...payload, load: { milk: 4, paneer: 1 } },
        key,
      ),
      /different action/,
    );
    await assert.rejects(command(manager, "load", payload), /changed.*Refresh/);
    await change(driver, "acknowledge");
    await assert.rejects(
      change(manager, "vehicle", { id: vehicle }),
      /assigned runs/,
    );
  });
  await test("a changed manifest invalidates release and requires a new physical load check", async () => {
    await db.query(
      "update daily_deliveries set address_snapshot='Fictional corrected gate' where id=$1",
      [delivery],
    );
    await assert.rejects(change(manager, "release"), /route changed/);
    await change(manager, "refresh");
    assert.equal((await current()).status, "loading");
    assert.deepEqual((await current()).load, {});
    await change(manager, "load", { load: { milk: 3, paneer: 1 } });
    await change(driver, "acknowledge");
    await change(manager, "release");
    assert.equal((await current()).status, "released");
    assert.equal(
      (await workspace(driver)).runs[0].manifest[0].address_snapshot,
      "Fictional corrected gate",
    );
    await assert.rejects(
      command(driver, "availability", {
        driver_id: driver,
        date: today,
        available: false,
      }),
      /active run/,
    );
    await assert.rejects(
      db.query(
        "update daily_deliveries set address_snapshot='bypass' where id=$1",
        [delivery],
      ),
      /manifest|frozen|Reopen/,
    );
    await assert.rejects(
      db.query(
        "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'ghee',1,'500 g')",
        [delivery],
      ),
      /frozen/,
    );
    await assert.rejects(
      db.query(
        "update daily_delivery_items set quantity=1 where delivery_id=$1 and product_key='milk'",
        [delivery],
      ),
      /frozen/,
    );
  });
  await test("delivery recording is gated by actual journey start, not location or release alone", async () => {
    const outcome = () =>
      callAs(
        db,
        driver,
        "select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",
        [[delivery], randomUUID()],
      );
    await assert.rejects(outcome(), /Start your run/);
    await assert.rejects(
      change(manager, "start", { odometer: 100 }),
      /driver can start/,
    );
    await assert.rejects(
      change(driver, "start", { odometer: "NaN" }),
      /odometer/,
    );
    await change(driver, "start", { odometer: 100.1 });
    await outcome();
    assert.equal(
      (
        await db.query("select status from daily_deliveries where id=$1", [
          delivery,
        ])
      ).rows[0].status,
      "delivered",
    );
    assert.deepEqual((await current()).delivered, { milk: 2, paneer: 1 });
  });
  await test("stock closeout balances actual fulfilment and reported odometer, without generating pay", async () => {
    await assert.rejects(
      change(driver, "finish", { odometer: 99 }),
      /at least/,
    );
    await change(driver, "finish", { odometer: 112.4 });
    const returned = await current();
    assert.equal(returned.status, "returned");
    assert.ok(returned.started_at && returned.returned_at);
    await assert.rejects(
      change(manager, "close", {
        returns: { milk: 0, paneer: 0 },
        losses: { milk: 0, paneer: 0 },
      }),
      /Loaded stock/,
    );
    await assert.rejects(
      change(manager, "close", {
        returns: { milk: 0, paneer: 0 },
        losses: { milk: 1, paneer: 0 },
      }),
      /Explain any/,
    );
    await change(manager, "close", {
      returns: { milk: 1, paneer: 0 },
      losses: { milk: 0, paneer: 0 },
    });
    assert.equal((await current()).status, "closed");
    await assert.rejects(
      db.query(
        "update daily_delivery_items set fulfilled_quantity=0 where delivery_id=$1 and product_key='milk'",
        [delivery],
      ),
      /Run is closed/,
    );
    await assert.rejects(
      db.query("update driver_operations_events set action='bypass'"),
      /append-only|immutable|cannot/i,
    );
  });
  await test("future runs cannot be started, cancelled runs free custody without cancelling obligations", async () => {
    const date = (await db.query("select ($1::date+1)::text d", [today]))
      .rows[0].d;
    const id = await visit(date);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [date]);
    await command(driver, "availability", {
      driver_id: driver,
      date,
      available: true,
    });
    const next = (
      await command(manager, "create", {
        date,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      })
    ).id;
    const mutation = async (action, actor = manager, extra = {}) =>
      command(actor, action, {
        id: next,
        version: (await workspace(manager, date)).runs[0].version,
        ...extra,
      });
    await mutation("load", manager, { load: { milk: 2, paneer: 1 } });
    await mutation("acknowledge", driver);
    await mutation("release");
    await assert.rejects(
      mutation("start", driver, { odometer: 120 }),
      /service day/,
    );
    // A second future run can be prepared, but cannot hold the same driver/vehicle.
    const conflictDate = (
      await db.query("select ($1::date+4)::text d", [today])
    ).rows[0].d;
    await visit(conflictDate);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [
      conflictDate,
    ]);
    await command(driver, "availability", {
      driver_id: driver,
      date: conflictDate,
      available: true,
    });
    const conflict = (
      await command(manager, "create", {
        date: conflictDate,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      })
    ).id;
    const concurrent = async (action, actor = manager, extra = {}) =>
      command(actor, action, {
        id: conflict,
        version: (await workspace(manager, conflictDate)).runs[0].version,
        ...extra,
      });
    await concurrent("load", manager, { load: { milk: 2, paneer: 1 } });
    await concurrent("acknowledge", driver);
    await assert.rejects(concurrent("release"), /one_active_run/);
    assert.equal(
      (await workspace(manager, conflictDate)).runs[0].status,
      "acknowledged",
    );
    await concurrent("cancel", manager, { note: "Duplicate resource test" });

    await mutation("cancel", manager, { note: "Vehicle reassignment" });
    assert.notEqual(
      (await db.query("select status from daily_deliveries where id=$1", [id]))
        .rows[0].status,
      "cancelled",
    );
    assert.equal(
      (
        await db.query(
          "select active from delivery_run_deliveries where run_id=$1",
          [next],
        )
      ).rows[0].active,
      false,
    );
  });
  await test("concurrent run creation reserves each route and obligation exactly once", async () => {
    const date = (await db.query("select ($1::date+2)::text d", [today]))
      .rows[0].d;
    await visit(date);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [date]);
    await command(driver, "availability", {
      driver_id: driver,
      date,
      available: true,
    });
    const one = new Client(config),
      two = new Client(config);
    await one.connect();
    await two.connect();
    try {
      const results = await Promise.allSettled(
        [one, two].map((c) =>
          command(
            manager,
            "create",
            { date, route_id: route, driver_id: driver, vehicle_id: vehicle },
            randomUUID(),
            c,
          ),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    } finally {
      await one.end();
      await two.end();
    }
  });

  await test("returning with an unrecorded stop requires review; partial stock remains payable service owed", async () => {
    const date = (await db.query("select ($1::date+3)::text d", [today]))
      .rows[0].d;
    const id = await visit(date);
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [date]);
    await command(driver, "availability", {
      driver_id: driver,
      date,
      available: true,
    });
    const partial = (
      await command(manager, "create", {
        date,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      })
    ).id;
    const mutation = async (action, actor = manager, extra = {}) =>
      command(actor, action, {
        id: partial,
        version: (await workspace(manager, date)).runs[0].version,
        ...extra,
      });
    await mutation("load", manager, { load: { milk: 2, paneer: 1 } });
    await mutation("acknowledge", driver);
    await mutation("release");
    // Advance only this disposable fixture's operational clock.
    await db.query(
      `create or replace function private.operational_today() returns date language sql stable set search_path='' as $$select '${date}'::date$$`,
    );
    await mutation("start", driver, { odometer: 150 });
    await assert.rejects(
      mutation("finish", driver, { odometer: 160 }),
      /unrecorded stops/,
    );
    await mutation("finish", driver, {
      odometer: 160,
      note: "One stop needs manager review",
    });
    await assert.rejects(
      mutation("close", manager, {
        returns: { milk: 2, paneer: 1 },
        losses: { milk: 0, paneer: 0 },
      }),
      /remaining visit outcomes/,
    );
    await assert.rejects(
      callAs(
        db,
        driver,
        "select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",
        [[id], randomUUID()],
      ),
      /Start your run/,
    );
    await callAs(
      db,
      manager,
      "select record_delivery_outcome($1,'partial','product_shortage',null,0,$2,$3)",
      [
        [id],
        JSON.stringify([
          { delivery_id: id, product_key: "milk", quantity: 1 },
          { delivery_id: id, product_key: "paneer", quantity: 0.5 },
        ]),
        randomUUID(),
      ],
    );
    await mutation("close", manager, {
      returns: { milk: 1, paneer: 0.5 },
      losses: { milk: 0, paneer: 0 },
    });
    assert.equal(
      (await db.query("select status from daily_deliveries where id=$1", [id]))
        .rows[0].status,
      "failed",
    );
    assert.equal(
      (
        await db.query(
          "select resolution from delivery_visit_outcomes where event_id=(select event_id from delivery_visit_outcomes where delivery_date=$1 limit 1)",
          [date],
        )
      ).rows[0].resolution,
      "pending",
    );
    assert.equal(
      (
        await db.query(
          "select o.status from orders o join daily_deliveries d on d.order_id=o.id where d.id=$1",
          [id],
        )
      ).rows[0].status,
      "paid",
    );
  });
} finally {
  await runtime.stop();
}
