import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase({
  routingFoundation: true,
  driverRuns: true,
  farmNotifications: true,
  milkIntake: true,
});
const { db } = runtime;
after(() => runtime.stop());
const owner = randomUUID(),
  otherOwner = randomUUID(),
  manager = randomUUID(),
  driver = randomUUID(),
  customer = randomUUID();
await db.query(
  "insert into auth.users(id,email) select id,id::text||'@fixture.invalid' from unnest($1::uuid[]) id",
  [[owner, otherOwner, manager, driver, customer]],
);
for (const [id, role] of [
  [owner, "admin"],
  [otherOwner, "admin"],
  [manager, "manager"],
  [driver, "driver"],
])
  await db.query("insert into farm_staff(user_id,role) values($1,$2)", [
    id,
    role,
  ]);
const date = (
  await db.query(
    "select ((now() at time zone 'Asia/Kolkata')::date-1)::text date",
  )
).rows[0].date;
const payload = (extra = {}) => ({
  date,
  time: "08:15",
  source: "Synthetic dairy intake",
  reference: randomUUID(),
  received_litres: "100.50",
  accepted_litres: "98.25",
  rejection_reason: "Synthetic rejection observation",
  handling: "chilled",
  storage_location: "Test tank A",
  quality_notes: "Synthetic measured reading only",
  ...extra,
});
async function command(
  action,
  p,
  key = randomUUID(),
  actor = manager,
  connection = db,
) {
  return (
    await callAs(
      connection,
      actor,
      "select milk_intake_command($1,$2::jsonb,$3) data",
      [action, JSON.stringify(p), key],
    )
  ).rows[0].data;
}
async function inbox(actor = owner, before = null) {
  return (
    await callAs(db, actor, "select get_farm_notifications($1) data", [before])
  ).rows[0].data;
}
const baselineNotices = (await inbox()).total;
let receipt, original;
test("manager records measured quantities, rejection, operator and one owner event", async () => {
  original = payload();
  receipt = await command("create", original);
  const row = (
    await db.query("select * from milk_intakes where id=$1", [receipt.id])
  ).rows[0];
  assert.equal(Number(row.rejected_litres), 2.25);
  assert.equal(row.recorded_by, manager);
  const notices = await inbox();
  assert.equal(notices.total, baselineNotices + 1);
  assert.equal(notices.items[0].severity, "attention");
  assert.equal(notices.items[0].category, "Milk intake");
});
test("replay keeps one receipt, audit event and notification; changed payload and actor cannot reuse its key", async () => {
  const p = payload(),
    key = randomUUID();
  const first = await command("create", p, key);
  const second = await command("create", p, key);
  assert.equal(first.id, second.id);
  assert.equal(second.replayed, true);
  await assert.rejects(
    command("create", { ...p, received_litres: "101" }, key),
    /request key/,
  );
  await assert.rejects(command("create", p, key, owner), /request key/);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from milk_intake_events where request_key=$1",
        [key],
      )
    ).rows[0].n,
    1,
  );
});
test("invalid quantities, unmeasured precision, rejection explanations and future times cannot create evidence", async () => {
  for (const change of [
    { received_litres: "0" },
    { accepted_litres: "101" },
    { accepted_litres: "NaN" },
    { received_litres: "10.555" },
    { accepted_litres: "98", rejection_reason: "" },
    { time: "25:10" },
    { date: "2099-01-01" },
  ])
    await assert.rejects(command("create", payload(change)));
});
test("duplicate receipt identity is rejected case-insensitively", async () => {
  await assert.rejects(
    command("create", { ...original, source: original.source.toUpperCase() }),
    /unique|duplicate/i,
  );
});
test("correction retains before/after evidence and rejects stale versions", async () => {
  const corrected = {
    ...original,
    id: receipt.id,
    version: 1,
    accepted_litres: "99",
    reason: "Measured entry corrected",
  };
  await command("correct", corrected);
  await assert.rejects(command("correct", corrected), /changed/);
  const history = (
    await callAs(db, owner, "select get_milk_intake_history($1) data", [
      receipt.id,
    ])
  ).rows[0].data;
  assert.equal(history.length, 2);
  assert.equal(history[0].version, 2);
  assert.equal(Number(history[0].before_state.accepted_litres), 98.25);
  assert.equal(Number(history[0].after_state.accepted_litres), 99);
  await assert.rejects(
    db.query(
      "update milk_intake_events set reason='rewrite' where intake_id=$1",
      [receipt.id],
    ),
    /append-only/,
  );
});
test("void excludes quantities from totals and preserves receipt and history", async () => {
  const before = (
    await callAs(db, manager, "select get_milk_intake_workspace($1) data", [
      date,
    ])
  ).rows[0].data;
  await command("void", {
    id: receipt.id,
    version: 2,
    reason: "Receipt entered twice in paper records",
  });
  const after = (
    await callAs(db, manager, "select get_milk_intake_workspace($1) data", [
      date,
    ])
  ).rows[0].data;
  assert.equal(
    Number(before.summary.received) - Number(after.summary.received),
    100.5,
  );
  assert.equal(after.summary.voided, 1);
  await assert.rejects(
    command("correct", {
      ...original,
      id: receipt.id,
      version: 3,
      reason: "Restore",
    }),
    /voided/,
  );
});
test("driver, customer, inactive owner and anonymous contexts cannot read or write physical intake or management feed", async () => {
  for (const actor of [driver, customer]) {
    await assert.rejects(
      command("create", payload(), randomUUID(), actor),
      /manager access/,
    );
    await assert.rejects(
      callAs(db, actor, "select get_milk_intake_workspace($1)", [date]),
      /manager access/,
    );
  }
  for (const actor of [driver, customer])
    await assert.rejects(inbox(actor), /manager or owner access/);
  await db.query("update farm_staff set active=false where user_id=$1", [
    otherOwner,
  ]);
  await assert.rejects(inbox(otherOwner), /manager or owner access/);
  await db.query("update farm_staff set active=true where user_id=$1", [
    otherOwner,
  ]);
  await assert.rejects(
    callAs(db, null, "select get_farm_notifications()"),
    /manager or owner access/,
  );
});
test("owners and managers share operations while finance and staff access stay owner-only", async () => {
  const managerFeed = await inbox(manager),
    ownerFeed = await inbox();
  assert.ok(managerFeed.items.some((item) => item.category === "Milk intake"));
  assert.ok(ownerFeed.items.some((item) => item.category === "Staff access"));
  assert.ok(
    managerFeed.items.every(
      (item) => !["Payments", "Staff access"].includes(item.category),
    ),
  );
  const restricted = ownerFeed.items.find(
    (item) => item.category === "Staff access",
  );
  await callAs(db, manager, "select dismiss_farm_notifications($1)", [
    [restricted.id],
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from farm_notification_dismissals where owner_id=$1 and notification_id=$2",
        [manager, restricted.id],
      )
    ).rows[0].n,
    0,
  );
});
test("dismissal is per owner and never resolves the underlying intake", async () => {
  const all = await inbox(),
    id = all.items[0].id;
  await callAs(db, owner, "select dismiss_farm_notifications($1)", [[id]]);
  assert.equal(
    (await inbox()).items.some((item) => item.id === id),
    false,
  );
  assert.ok((await inbox(otherOwner)).items.some((item) => item.id === id));
  assert.equal(
    (
      await db.query("select status from milk_intakes where id=$1", [
        receipt.id,
      ])
    ).rows[0].status,
    "voided",
  );
});
test("simultaneous corrections with the same version produce one change and one conflict", async () => {
  const p = payload();
  const item = await command("create", p);
  const a = new Client(runtime.config),
    b = new Client(runtime.config);
  await a.connect();
  await b.connect();
  try {
    const results = await Promise.allSettled([
      command(
        "correct",
        {
          ...p,
          id: item.id,
          version: 1,
          reason: "First correction",
          accepted_litres: "99",
        },
        randomUUID(),
        manager,
        a,
      ),
      command(
        "correct",
        {
          ...p,
          id: item.id,
          version: 1,
          reason: "Second correction",
          accepted_litres: "100",
        },
        randomUUID(),
        manager,
        b,
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  } finally {
    await a.end();
    await b.end();
  }
});
test("owner pagination uses stable IDs and includes no duplicates", async () => {
  for (let i = 0; i < 34; i++)
    await command(
      "create",
      payload({ reference: "paging-" + i, accepted_litres: "100.50" }),
    );
  const first = await inbox();
  assert.equal(first.items.length, 31);
  const second = await inbox(owner, first.items[29].id);
  const ids = first.items.slice(0, 30).map((item) => item.id);
  assert.ok(second.items.every((item) => !ids.includes(item.id)));
});
test("new tables deny direct client table access; only invoker entry points are exposed", async () => {
  for (const table of [
    "milk_intakes",
    "milk_intake_events",
    "farm_notifications",
    "farm_notification_dismissals",
  ]) {
    const row = (
      await db.query(
        "select c.relrowsecurity,has_table_privilege('authenticated',c.oid,'select') client_read,has_table_privilege('anon',c.oid,'select') anon_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1",
        [table],
      )
    ).rows[0];
    assert.equal(row.relrowsecurity, true);
    assert.equal(row.client_read, false);
    assert.equal(row.anon_read, false);
  }
  const exposed = (
    await db.query(
      "select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_farm_notifications','dismiss_farm_notifications','milk_intake_command','get_milk_intake_workspace','get_milk_intake_history')",
    )
  ).rows;
  assert.equal(exposed.length, 5);
  assert.ok(exposed.every((row) => !row.prosecdef));
});
test("capacity changes and removed overrides notify once per actual change", async () => {
  const before = (
    await db.query(
      "select count(*)::int n from farm_notifications where category='Capacity'",
    )
  ).rows[0].n;
  await callAs(
    db,
    manager,
    "update production_capacity set daily_limit=997 where product_key='milk'",
  );
  await callAs(
    db,
    manager,
    "update production_capacity set daily_limit=997 where product_key='milk'",
  );
  await callAs(
    db,
    manager,
    "insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('milk',$1,996)",
    [date],
  );
  await callAs(
    db,
    manager,
    "delete from production_capacity_overrides where product_key='milk' and delivery_date=$1",
    [date],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from farm_notifications where category='Capacity'",
      )
    ).rows[0].n - before,
    3,
  );
});
test("captured test payments are excluded and live capture retries do not create duplicate owner notifications", async () => {
  const before = (
    await db.query(
      "select count(*)::int n from farm_notifications where category='Payments'",
    )
  ).rows[0].n;
  for (const isTest of [true, false]) {
    const order = randomUUID();
    await db.query(
      "insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,is_test,phone_snapshot,address_snapshot,start_date) values($1,$2,'once','draft','none',100,100,$3,'0000000000','Synthetic payment fixture','2026-10-01')",
      [order, customer, isTest],
    );
    const payment = (
      await db.query(
        "insert into payments(order_id,user_id,amount_paise,status,provider,provider_order_id,is_test) values($1,$2,100,'created','manual',$3,$4) returning id",
        [order, customer, order, isTest],
      )
    ).rows[0].id;
    await db.query("update payments set status='captured' where id=$1", [
      payment,
    ]);
    await db.query("update payments set status='captured' where id=$1", [
      payment,
    ]);
  }
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from farm_notifications where category='Payments'",
      )
    ).rows[0].n - before,
    1,
  );
});
test("a partial delivery event and a failed preparation attempt carry attention without leaking raw preparation errors", async () => {
  const event = randomUUID();
  await db.query(
    "insert into delivery_operation_events(id,request_key,delivery_date,actor_id,actor_role,action,request_payload,before_state,after_state) values($1,$2,$3,$4,'manager','outcome','{\"outcome\":\"partial\"}','[]','[]')",
    [event, randomUUID(), date, manager],
  );
  const delivery = (
    await db.query(
      "select severity from farm_notifications where event_key=$1",
      ["delivery_operation_events:" + event],
    )
  ).rows[0];
  assert.equal(delivery.severity, "attention");
  const run = (
    await db.query(
      "insert into delivery_automation_runs(job_key,service_date,status,completed_at) values('nightly_dispatch',$1,'failed',now()) returning id",
      [date],
    )
  ).rows[0].id;
  await db.query(
    "insert into delivery_automation_attempts(run_id,service_date,attempt_number,status,started_at,completed_at,error_message,summary) values($1,$2,1,'failed',now(),now(),'raw-private-error','{}')",
    [run, date],
  );
  const failed = (
    await db.query(
      "select severity,message from farm_notifications where category='Automation' order by id desc limit 1",
    )
  ).rows[0];
  assert.equal(failed.severity, "attention");
  assert.equal(failed.message.includes("raw-private-error"), false);
});
test("an immediate customer plan cancellation emits one completed update, not a spurious pending review", async () => {
  const plan = randomUUID();
  await db.query(
    "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'none')",
    [plan, customer, date],
  );
  const before = (
    await db.query(
      "select count(*)::int n from farm_notifications where category='Customer requests'",
    )
  ).rows[0].n;
  await callAs(
    db,
    customer,
    "select cancel_my_delivery_plan($1,'Synthetic cancellation')",
    [plan],
  );
  const notice = (
    await db.query(
      "select title,message,severity from farm_notifications where category='Customer requests' order by id desc limit 1",
    )
  ).rows[0];
  assert.equal(notice.title, "Cancellation update recorded");
  assert.equal(notice.severity, "info");
  assert.match(notice.message, /completed/);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from farm_notifications where category='Customer requests'",
      )
    ).rows[0].n - before,
    1,
  );
});
