import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase();
const { db } = runtime;
const manager = randomUUID(),
  driver = randomUUID(),
  customer = randomUUID(),
  plan = randomUUID(),
  order = randomUUID();
async function system(sql, values = []) {
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
try {
  const {
    today,
    tomorrow,
    weekday: day,
  } = (
    await db.query(
      "select (now() at time zone 'Asia/Kolkata')::date::text today,((now() at time zone 'Asia/Kolkata')::date+1)::text tomorrow,extract(isodow from (now() at time zone 'Asia/Kolkata')::date+1)::int weekday",
    )
  ).rows[0];
  await db.query(
    "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
    [[manager, driver, customer]],
  );
  await db.query(
    "insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver')",
    [manager, driver],
  );
  const area = (
    await db.query(
      "insert into delivery_areas(name,slug) values('Automatic test area','automatic-test') returning id",
    )
  ).rows[0].id;
  const route = (
    await db.query(
      "insert into delivery_routes(name,area_id) values('Automatic test route',$1) returning id",
      [area],
    )
  ).rows[0].id;
  await db.query(
    "insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)",
    [route, driver, manager],
  );
  await db.query(
    "update customer_profiles set full_name='Automatic fixture',address_line='Synthetic test address',delivery_area_id=$2,delivery_route_id=$3 where user_id=$1",
    [customer, area, route],
  );
  await db.query(
    "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'return')",
    [plan, customer, tomorrow],
  );
  await db.query(
    "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','paid','return',100,100,$4,'0000000000','Synthetic test address')",
    [order, customer, plan, tomorrow],
  );
  await db.query(
    "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
    [order, customer, order],
  );
  await db.query(
    "insert into weekly_delivery_items(plan_id,day_of_week,product_key,quantity,unit,user_id) values($1,$2,'milk',2,'L',$3)",
    [plan, day, customer],
  );
  await db.query("update delivery_plans set status='active' where id=$1", [
    plan,
  ]);
  await test("only the server role can invoke scheduled preparation; drivers cannot retry or read runs", async () => {
    await assert.rejects(
      callAs(db, manager, "select run_nightly_dispatch_preparation()"),
      /permission denied/,
    );
    await assert.rejects(
      callAs(db, driver, "select retry_dispatch_preparation($1)", [tomorrow]),
      /Manager/,
    );
    assert.equal(
      (await callAs(db, driver, "select * from delivery_automation_runs"))
        .rowCount,
      0,
    );
    await assert.rejects(
      callAs(
        db,
        manager,
        "select private.generate_dispatch_deliveries($1,true)",
        [tomorrow],
      ),
      /permission denied/,
    );
  });
  await test("automatic preparation preserves an existing planned visit and its manual ordering", async () => {
    await db.query("begin");
    try {
      await db.query("select private.generate_dispatch_deliveries($1,true)", [
        tomorrow,
      ]);
      const before = (
        await db.query(
          "update daily_deliveries set route_stop_order=42 where plan_id=$1 and delivery_date=$2 returning id",
          [plan, tomorrow],
        )
      ).rows[0].id;
      await db.query("select run_nightly_dispatch_preparation()");
      assert.equal(
        (
          await db.query(
            "select route_stop_order from daily_deliveries where id=$1",
            [before],
          )
        ).rows[0].route_stop_order,
        42,
      );
    } finally {
      await db.query("rollback");
    }
  });
  await test("automatic preparation creates a draft and default assignments as the system, with no release or entitlement consumption", async () => {
    const result = (
      await system("select run_nightly_dispatch_preparation() result")
    ).rows[0].result;
    assert.equal(result.status, "succeeded");
    assert.equal(result.summary.visits, 1);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from delivery_automation_attempts",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("update delivery_automation_attempts set status='failed'"),
      /append-only/,
    );
    assert.equal(
      (await callAs(db, driver, "select * from delivery_automation_attempts"))
        .rowCount,
      0,
    );
    const dispatch = (
      await db.query(
        "select * from delivery_dispatches where delivery_date=$1",
        [tomorrow],
      )
    ).rows[0];
    assert.equal(dispatch.status, "draft");
    assert.equal(dispatch.prepared_by, null);
    assert.equal(dispatch.released_by, null);
    const row = (
      await db.query(
        "select * from daily_deliveries where delivery_date=$1 and user_id=$2",
        [tomorrow, customer],
      )
    ).rows[0];
    assert.equal(row.assigned_driver_id, driver);
    assert.equal(row.generated_by, null);
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [plan],
        )
      ).rows[0].delivered_deliveries,
      0,
    );
  });
  await test("repeated scheduler invocations and manager retries reuse successful work without duplicating rows", async () => {
    const before = (
      await db.query("select id from daily_deliveries where delivery_date=$1", [
        tomorrow,
      ])
    ).rows;
    assert.equal(
      (await system("select run_nightly_dispatch_preparation() result")).rows[0]
        .result.reused,
      true,
    );
    assert.equal(
      (
        await callAs(
          db,
          manager,
          "select retry_dispatch_preparation($1) result",
          [tomorrow],
        )
      ).rows[0].result.reused,
      true,
    );
    assert.deepEqual(
      (
        await db.query(
          "select id from daily_deliveries where delivery_date=$1",
          [tomorrow],
        )
      ).rows,
      before,
    );
    assert.equal(
      (
        await db.query(
          "select attempts from delivery_automation_runs where service_date=$1",
          [tomorrow],
        )
      ).rows[0].attempts,
      1,
    );
  });
  await test("failed preparation rolls back partial work and retains a failed attempt for staff review", async () => {
    await db.query("begin");
    try {
      await db.query(
        "create or replace function private.prepare_dispatch_assignments(p_delivery_date date,p_system boolean) returns integer language plpgsql security definer set search_path='' as $$begin raise exception 'Synthetic preparation failure';end$$",
      );
      const result = (
        await db.query("select private.run_dispatch_preparation($1) result", [
          today,
        ])
      ).rows[0].result;
      assert.equal(result.status, "failed");
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from daily_deliveries where delivery_date=$1",
            [today],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select status,error_message from delivery_automation_runs where service_date=$1",
            [today],
          )
        ).rows[0].status,
        "failed",
      );
    } finally {
      await db.query("rollback");
    }
  });
  await test("automation preserves a released day instead of reopening or regenerating it", async () => {
    await db.query(
      "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
      [today, manager],
    );
    const result = (
      await callAs(
        db,
        manager,
        "select retry_dispatch_preparation($1) result",
        [today],
      )
    ).rows[0].result;
    assert.equal(result.status, "skipped");
    assert.equal(
      (
        await db.query(
          "select status from delivery_dispatches where delivery_date=$1",
          [today],
        )
      ).rows[0].status,
      "released",
    );
  });
} finally {
  await runtime.stop();
}
