// Generates ONLY synthetic, read-only review fixtures in an ephemeral local database.
import { randomUUID } from "node:crypto";
import { types } from "pg";
types.setTypeParser(1082, (value) => value);
import { writeFile } from "node:fs/promises";
import { createDatabase, callAs } from "../tests/database/runtime.mjs";
const runtime = await createDatabase({
  routingFoundation: true,
  driverRuns: true,
  milkIntake: true,
});
const { db } = runtime;
try {
  const date = (
    await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")
  ).rows[0].d;
  const ids = {
    admin: randomUUID(),
    manager: randomUUID(),
    driver: randomUUID(),
  };
  for (const [role, id] of Object.entries(ids)) {
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        id,
        `sample-${role}@example.invalid`,
        JSON.stringify({
          full_name: `Sample ${role === "admin" ? "owner" : role}`,
        }),
      ],
    );
    await db.query("insert into farm_staff(user_id,role) values($1,$2)", [
      id,
      role,
    ]);
  }
  const area = (
    await db.query(
      "insert into delivery_areas(name,slug) values('Sample Garden neighbourhood','sample-garden') returning id",
    )
  ).rows[0].id;
  const route = (
    await db.query(
      "insert into delivery_routes(area_id,name,code,stop_capacity) values($1,'Garden morning','SAMPLE-01',25) returning id",
      [area],
    )
  ).rows[0].id;
  await db.query(
    "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
    [route, ids.driver, ids.manager],
  );
  const deliveries = [];
  for (let i = 0; i < 7; i++) {
    const user = randomUUID(),
      order = randomUUID(),
      plan = randomUUID(),
      name = [
        "Sample Anaya family",
        "Sample Kabir home",
        "Sample Tara family",
        "Sample Neel home",
        "Sample Mira family",
        "Sample Rohan home",
        "Sample Isha family",
      ][i];
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        user,
        `sample-family-${i + 1}@example.invalid`,
        JSON.stringify({ full_name: name }),
      ],
    );
    await db.query(
      "update customer_profiles set address_line=$2,phone='0000000000',postal_code='000000',delivery_area_id=$3,delivery_route_id=$4 where user_id=$1",
      [user, `Sample gate ${i + 1}, Garden neighbourhood`, area, route],
    );
    await db.query(
      "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'return')",
      [plan, user, date],
    );
    for (let day = 1; day <= 7; day++)
      await db.query(
        "insert into weekly_delivery_items(plan_id,user_id,day_of_week,product_key,quantity,unit) values($1,$2,$3,'milk',2,'L')",
        [plan, user, day],
      );
    await db.query(
      "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','paid','return',372000,372000,$4,'0000000000',$5)",
      [order, user, plan, date, `Sample gate ${i + 1}, Garden neighbourhood`],
    );
    await db.query(
      "insert into order_items(order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,line_total_paise,frequency,scheduled_days) values($1,$2,'milk','Fresh milk',2,'L',6200,12400,'weekly','{1,2,3,4,5,6,7}')",
      [order, user],
    );
    await db.query(
      "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,372000,'manual','captured',$3)",
      [order, user, order],
    );
    await db.query("update delivery_plans set status='active' where id=$1", [
      plan,
    ]);
    const delivery = (
      await db.query(
        "insert into daily_deliveries(plan_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,phone_snapshot,bottle_choice,generated_by) values($1,$2,$3,'planned',$4,$5,$6,$7,$8,$9,'0000000000','return',$10) returning id",
        [
          plan,
          user,
          date,
          area,
          route,
          ids.driver,
          i + 1,
          name,
          `Sample gate ${i + 1}, Garden neighbourhood`,
          ids.manager,
        ],
      )
    ).rows[0].id;
    await db.query(
      "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L')",
      [delivery],
    );
    deliveries.push(delivery);
  }
  await callAs(db, ids.manager, "select prepare_daily_dispatch($1)", [date]);
  const command = async (actor, action, payload) =>
    (
      await callAs(
        db,
        actor,
        "select driver_operations_command($1,$2,$3) data",
        [action, JSON.stringify(payload), randomUUID()],
      )
    ).rows[0].data;
  const vehicle = (
    await command(ids.manager, "vehicle", {
      name: "Sample farm van",
      registration: "SAMPLE-01",
      ownership: "farm",
      milk_capacity: 80,
      paneer_capacity: 20,
      ghee_capacity: 20,
      stop_capacity: 25,
    })
  ).id;
  await command(ids.manager, "profile", {
    driver_id: ids.driver,
    phone: "0000000000",
    default_vehicle_id: vehicle,
  });
  await command(ids.driver, "availability", {
    driver_id: ids.driver,
    date,
    available: true,
  });
  const run = (
    await command(ids.manager, "create", {
      date,
      route_id: route,
      driver_id: ids.driver,
      vehicle_id: vehicle,
    })
  ).id;
  const change = async (actor, action, extra = {}) => {
    const current = (
      await callAs(
        db,
        ids.manager,
        "select get_driver_run_workspace($1) data",
        [date],
      )
    ).rows[0].data.runs.find((r) => r.id === run);
    return command(actor, action, {
      id: run,
      version: current.version,
      ...extra,
    });
  };
  await change(ids.manager, "load", { load: { milk: 15 } });
  await change(ids.driver, "acknowledge");
  await change(ids.manager, "release");
  await change(ids.driver, "start", { odometer: 12450 });
  for (let i = 0; i < 3; i++)
    await callAs(
      db,
      ids.driver,
      "select record_delivery_outcome($1,$2,$3,$4,$5,null,$6)",
      [
        [deliveries[i]],
        i === 2 ? "attempt_failed" : "delivered",
        i === 2 ? "gate_locked" : null,
        i === 2 ? "Sample access issue" : null,
        i === 2 ? 0 : 1,
        randomUUID(),
      ],
    );
  await callAs(db, ids.manager, "select milk_intake_command($1,$2,$3)", [
    "create",
    JSON.stringify({
      date,
      time: "00:01",
      source: "Sample farm collection",
      reference: "SAMPLE-INTAKE-001",
      received_litres: "180",
      accepted_litres: "178",
      rejection_reason: "Sample measured rejection",
      handling: "chilled",
      storage_location: "Sample tank A",
      quality_notes: "",
    }),
    randomUUID(),
  ]);
  const tables = {};
  for (const { tablename } of (
    await db.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).rows) {
    if (!/^[a-z_]+$/.test(tablename)) throw Error("Unexpected table");
    tables[tablename] = (
      await db.query(`select to_jsonb(t) row from public."${tablename}" t`)
    ).rows.map((r) => r.row);
  }
  const rpc = {};
  for (const [role, user] of Object.entries(ids)) {
    rpc[role] = {};
    const reads = {
      get_driver_run_workspace: [
        "select get_driver_run_workspace($1) data",
        [date],
      ],
    };
    if (role !== "driver")
      Object.assign(reads, {
        get_farm_notifications: ["select get_farm_notifications() data", []],
        get_milk_intake_workspace: [
          "select get_milk_intake_workspace($1) data",
          [date],
        ],
        get_delivery_reconciliation: [
          "select get_delivery_reconciliation($1) data",
          [date],
        ],
        get_delivery_exceptions: [
          "select get_delivery_exceptions($1) data",
          [date],
        ],
        get_dispatch_routing_readiness: [
          "select get_dispatch_routing_readiness($1) data",
          [date],
        ],
      });
    for (const [name, [sql, args]] of Object.entries(reads))
      rpc[role][name] = (await callAs(db, user, sql, args)).rows[0].data;
  }
  const capacities = {};
  for (const product of ["milk", "paneer", "ghee"])
    capacities[product] = (
      await db.query("select * from product_capacity_snapshot($1,$2,31)", [
        product,
        date,
      ])
    ).rows;
  const customerOutcomes = {};
  for (const id of new Set(tables.orders.map((row) => row.user_id)))
    customerOutcomes[id] = (
      await callAs(
        db,
        ids.admin,
        "select get_customer_delivery_outcomes($1) data",
        [id],
      )
    ).rows[0].data;
  const snapshot = {
    synthetic: true,
    date,
    ids,
    tables,
    rpc,
    capacities,
    customerOutcomes,
  };
  await writeFile(
    new URL("../lib/dashboard-review/snapshot.json", import.meta.url),
    JSON.stringify(snapshot),
  );
  console.log(
    JSON.stringify({
      synthetic: true,
      date,
      tables: Object.keys(tables).length,
      customers: 7,
      roles: Object.keys(ids),
    }),
  );
} finally {
  await runtime.stop();
}
