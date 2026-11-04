import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDatabase, callAs } from "../database/runtime.mjs";
export async function gpsFixture() {
  const runtime = await createDatabase({
    routingFoundation: true,
    driverRuns: true,
  });
  const { db } = runtime;
  try {
    await db.query(
      await readFile(
        new URL(
          "../../supabase/migrations/20261101143540_gps_route_execution.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
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
    const date = (
      await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")
    ).rows[0].d;
    const area = (
      await db.query(
        "insert into delivery_areas(name,slug) values('GPS fixture','gps-fixture') returning id",
      )
    ).rows[0].id;
    const route = (
      await db.query(
        "insert into delivery_routes(area_id,name) values($1,'Sample morning route') returning id",
        [area],
      )
    ).rows[0].id;
    await db.query(
      "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
      [route, driver, manager],
    );
    for (let i = 0; i < 3; i++) {
      const order = randomUUID(),
        person = i === 0 ? customer : randomUUID();
      if (i > 0)
        await db.query("insert into auth.users(id,email) values($1,$2)", [
          person,
          person + "@fixture.invalid",
        ]);
      await db.query(
        "update customer_profiles set address_line='Fictional entrance',postal_code='831001',delivery_area_id=$2 where user_id=$1",
        [person, area],
      );
      await callAs(db, person, "select save_my_delivery_pin($1,$2,$3,$4)", [
        22.8 + i * 0.01,
        86.2 + i * 0.01,
        10,
        "Fictional entrance",
      ]);
      await db.query(
        "insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'once','paid','none',100,100,$3,'0000000000','Fictional entrance')",
        [order, person, date],
      );
      await db.query(
        "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
        [order, person, order],
      );
      const id = (
        await db.query(
          "insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,bottle_choice,generated_by,destination_latitude,destination_longitude,destination_confirmed_at) values($1,$2,$3,'planned',$4,$5,$6,$7,$8,'Fictional entrance','none',$9,$10,$11,now()) returning id",
          [
            order,
            person,
            date,
            area,
            route,
            driver,
            i + 1,
            `Sample household ${i + 1}`,
            manager,
            22.8 + i * 0.01,
            86.2 + i * 0.01,
          ],
        )
      ).rows[0].id;
      await db.query(
        "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L')",
        [id],
      );
    }
    await callAs(db, manager, "select prepare_daily_dispatch($1)", [date]);
    const operation = async (actor, action, payload) =>
      (
        await callAs(
          db,
          actor,
          "select driver_operations_command($1,$2,$3) r",
          [action, JSON.stringify(payload), randomUUID()],
        )
      ).rows[0].r;
    const vehicle = (
      await operation(manager, "vehicle", {
        name: "Fixture bike",
        registration: "GPS-TEST",
        ownership: "farm",
        milk_capacity: 20,
        paneer_capacity: 5,
        ghee_capacity: 5,
        stop_capacity: 25,
      })
    ).id;
    await operation(manager, "profile", {
      driver_id: driver,
      phone: "0000000000",
      default_vehicle_id: vehicle,
    });
    await operation(driver, "availability", {
      driver_id: driver,
      date,
      available: true,
    });
    const run = (
      await operation(manager, "create", {
        date,
        route_id: route,
        driver_id: driver,
        vehicle_id: vehicle,
      })
    ).id;
    const current = async () =>
      (
        await callAs(db, manager, "select get_driver_run_workspace($1) r", [
          date,
        ])
      ).rows[0].r.runs.find((r) => r.id === run);
    const change = async (actor, action, payload = {}) =>
      operation(actor, action, {
        id: run,
        version: (await current()).version,
        ...payload,
      });
    const workspace = async (actor = manager) =>
      (await callAs(db, actor, "select get_gps_workspace($1) r", [date]))
        .rows[0].r;
    const command = async (actor, action, payload = {}, key = randomUUID()) =>
      (
        await callAs(db, actor, "select gps_run_command($1,$2,$3,$4) r", [
          run,
          action,
          JSON.stringify(payload),
          key,
        ])
      ).rows[0].r;
    const configure = async (
      start_mode = "already_loaded",
      sequencing = "review",
    ) =>
      command(manager, "configure", {
        version: (await workspace()).runs[0].config?.version ?? 0,
        start_mode,
        travel_mode: "TWO_WHEELER",
        sequencing,
        hub_latitude: 22.79,
        hub_longitude: 86.19,
        hub_label: "Fixture farm",
      });
    const release = async () => {
      await change(manager, "load", { load: { milk: 6 } });
      await change(driver, "acknowledge", { checked: "yes" });
      await change(manager, "release");
    };
    return {
      ...runtime,
      manager,
      driver,
      other,
      customer,
      date,
      route,
      run,
      current,
      change,
      workspace,
      command,
      configure,
      release,
    };
  } catch (e) {
    await runtime.stop();
    throw e;
  }
}
