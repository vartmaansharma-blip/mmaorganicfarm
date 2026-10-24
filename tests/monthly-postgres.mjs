process.on("uncaughtException", (error) => {
  console.error(error.message, error.where ?? "", error.position ?? "");
  process.exit(1);
});
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  pathToFileURL(
    process.env.PGLITE_MODULE ??
      `${process.cwd()}/work/postgres-tests/node_modules/@electric-sql/pglite/dist/index.js`,
  )
);
const db = new PGlite();
const schema = await fs.readFile("tests/fixtures/monthly-schema.sql", "utf8");
await db.exec(schema);
// Minimal actual baseline helper, kept verbatim in the fixture companion below.
await db.exec(
  await fs.readFile("tests/fixtures/monthly-baseline-functions.sql", "utf8"),
);
await db.exec(
  await fs.readFile("supabase/monthly_product_schedules.sql", "utf8"),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const user = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  manager = "10000000-0000-4000-8000-000000000003";
await db.query("insert into auth.users values ($1),($2),($3)", [
  user,
  other,
  manager,
]);
await db.query(
  "insert into public.customer_profiles(user_id,full_name) values ($1,'Synthetic customer')",
  [user],
);
await db.query("insert into public.farm_staff values($1,'manager',true)", [
  manager,
]);
await db.exec(
  "insert into public.production_capacity values('milk',100),('paneer',100),('ghee',100)",
);
const start = (
  await one("select ((now() at time zone 'Asia/Kolkata')::date+1)::text d")
).d;
const datePlus = async (n) =>
  (await one("select ($1::date+$2::integer)::text d", [start, n])).d;
const end = (
  await one("select ($1::date+interval '1 month')::date::text d", [start])
).d;
const rules = [
  { id: "milk", quantity: 1, repeat: "daily", firstDate: start },
  { id: "paneer", quantity: 1, repeat: "weekly", firstDate: await datePlus(5) },
  {
    id: "ghee",
    quantity: 1,
    repeat: "custom",
    firstDate: await datePlus(12),
    dates: [await datePlus(12), await datePlus(25)],
  },
];
async function asUser(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function save(r = rules) {
  return (
    await one("select public.save_pending_monthly_plan($1,$2,$3) id", [
      start,
      r.some((x) => x.id === "milk") ? "return" : "none",
      JSON.stringify(r),
    ])
  ).id;
}
await asUser(user);
const plan = await save();
let rows = (
  await db.query(
    "select * from public.scheduled_delivery_items where plan_id=$1",
    [plan],
  )
).rows;
assert.equal(
  rows.filter((x) => x.product_key === "milk").length,
  Math.round((new Date(end) - new Date(start)) / 86400000),
);
assert.equal(rows.filter((x) => x.product_key === "ghee").length, 2);
assert.equal(
  (
    await one("select billing_model from public.delivery_plans where id=$1", [
      plan,
    ])
  ).billing_model,
  "calendar_month",
);
assert.equal(
  (
    await db.query(
      "update public.delivery_plans set start_date=start_date+1 where id=$1 returning id",
      [plan],
    )
  ).rows.length,
  0,
);
assert.equal(
  (
    await db.query(
      "delete from public.scheduled_delivery_items where plan_id=$1 returning plan_id",
      [plan],
    )
  ).rows.length,
  0,
);
await assert.rejects(
  () =>
    db.query(
      "insert into public.weekly_delivery_items values($1,$2,'milk',1,5,'litre')",
      [plan, user],
    ),
  /row-level security/,
);
await assert.rejects(
  () =>
    db.query(
      "insert into public.delivery_exceptions values($1,$2,'milk',$3,'override',5,'litre')",
      [plan, user, start],
    ),
  /row-level security/,
);
await asUser(other);
assert.equal(
  (await db.query("select id from public.delivery_plans where id=$1", [plan]))
    .rows.length,
  0,
);
await asUser("");
await assert.rejects(() => save(), /Authentication required/);
await asUser(user);
for (const invalid of [
  [{ ...rules[0], quantity: 6 }],
  [rules[0], rules[0]],
  [{ ...rules[0], firstDate: end }],
  [{ ...rules[2], dates: [end] }],
  [{ ...rules[2], dates: [rules[2].firstDate, rules[2].firstDate] }],
  [{ ...rules[0], repeat: "unknown" }],
])
  await assert.rejects(() => save(invalid));
// Stale unstarted checkout is cancelled when a draft changes, but a provider checkout freezes it.
await db.exec("reset role");
const order = (
  await one(
    "insert into public.orders(user_id,delivery_plan_id,purchase_mode,status,start_date) values($1,$2,'plan','draft',$3) returning id",
    [user, plan, start],
  )
).id;
await asUser(user);
assert.equal(await save(), plan);
await db.exec("reset role");
assert.equal(
  (await one("select status from public.orders where id=$1", [order])).status,
  "cancelled",
);
await db.query(
  "update public.orders set status='pending_payment',razorpay_order_id='synthetic_provider' where id=$1",
  [order],
);
await asUser(user);
await assert.rejects(() => save(), /checkout is already in progress/);
await db.exec("reset role");
await db.query(
  "update public.orders set status='draft',razorpay_order_id=null where id=$1",
  [order],
);
// Checkout claim freezes even before a provider id exists, and rejects stale rule snapshots.
await db.query(
  "select set_config('request.jwt.claim.role','service_role',false)",
);
await assert.rejects(
  () =>
    db.query("select public.claim_monthly_checkout($1,$2)", [
      order,
      JSON.stringify(rules.slice(1)),
    ]),
  /selection changed/,
);
await db.query("select public.claim_monthly_checkout($1,$2)", [
  order,
  JSON.stringify(rules),
]);
await asUser(user);
await assert.rejects(() => save(), /checkout is already in progress/);
await db.exec("reset role");
await db.query("update public.orders set status='draft' where id=$1", [order]);
// A capacity failure in week four must reject the whole hold transaction.
await db.query(
  "insert into public.production_capacity_overrides values('ghee',$1,0)",
  [await datePlus(25)],
);
await assert.rejects(
  () => db.query("select public.reserve_order_capacity($1)", [order]),
  /capacity is full/,
);
assert.equal(
  (await one("select count(*)::int n from public.order_capacity_reservations"))
    .n,
  0,
);
await db.exec("delete from public.production_capacity_overrides");
const hold = await one("select public.reserve_order_capacity($1) q", [order]);
assert.ok(hold.q.reserved_product_dates > 30);
await assert.rejects(
  () =>
    db.query("update public.delivery_plans set status='active' where id=$1", [
      plan,
    ]),
  /only after payment/,
);
async function activateSyntheticPaid(id, owner) {
  const paid = (
    await one(
      "insert into public.orders(user_id,delivery_plan_id,purchase_mode,status,start_date) values($1,$2,'plan','paid',$3) returning id",
      [owner, id, start],
    )
  ).id;
  await db.query(
    "insert into public.payments(order_id,status) values($1,'captured')",
    [paid],
  );
  await db.query(
    "update public.delivery_plans set status='active' where id=$1",
    [id],
  );
}
await activateSyntheticPaid(plan, user);
const snapshot = await one(
  "select * from public.milk_capacity_snapshot($1,1)",
  [start],
);
assert.equal(Number(snapshot.active_plan_litres), 1);
// The actual sheet generator consumes finite dated milk and nonmilk rows, then stops.
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
  manager,
]);
assert.equal(
  (await one("select public.generate_daily_deliveries($1) n", [start])).n,
  1,
);
assert.equal(
  Number(
    (
      await one(
        "select quantity from public.daily_delivery_items where product_key='milk'",
      )
    ).quantity,
  ),
  1,
);
assert.equal(
  (await one("select public.generate_daily_deliveries($1) n", [end])).n,
  0,
);
// Nonmilk-only plans complete on their last dated visit and never spend legacy milk credits.
await db.query(
  "update public.delivery_plans set status='completed' where id=$1",
  [plan],
);
await asUser(user);
const nonmilk = await save([
  {
    id: "ghee",
    quantity: 1,
    repeat: "custom",
    firstDate: start,
    dates: [start],
  },
]);
await db.exec("reset role");
await activateSyntheticPaid(nonmilk, user);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
  manager,
]);
const visit = (
  await one(
    "insert into public.daily_deliveries(plan_id,user_id,delivery_date) values($1,$2,$3) returning id",
    [nonmilk, user, start],
  )
).id;
await db.query(
  "insert into public.daily_delivery_items values($1,'ghee',1,'500 g')",
  [visit],
);
await db.query("select private.record_delivery_visit_impl($1,true,0)", [
  [visit],
]);
assert.deepEqual(
  await one(
    "select status,purchased_deliveries,delivered_deliveries from public.delivery_plans where id=$1",
    [nonmilk],
  ),
  { status: "completed", purchased_deliveries: 0, delivered_deliveries: 0 },
);
const legacy = (
  await one(
    "insert into public.delivery_plans(user_id,start_date,bottle_choice,status,purchased_deliveries) values($1,$2,'return','pending_confirmation',30) returning id",
    [other, start],
  )
).id;
await activateSyntheticPaid(legacy, other);
const legacyVisit = (
  await one(
    "insert into public.daily_deliveries(plan_id,user_id,delivery_date) values($1,$2,$3) returning id",
    [legacy, other, start],
  )
).id;
await db.query(
  "insert into public.daily_delivery_items values($1,'milk',1,'litre')",
  [legacyVisit],
);
await db.query("select private.record_delivery_visit_impl($1,true,0)", [
  [legacyVisit],
]);
await db.query("select private.record_delivery_visit_impl($1,true,0)", [
  [legacyVisit],
]);
assert.equal(
  (
    await one(
      "select delivered_deliveries from public.delivery_plans where id=$1",
      [legacy],
    )
  ).delivered_deliveries,
  1,
);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
await assert.rejects(
  () =>
    db.query("select private.record_delivery_visit_impl($1,true,0)", [
      [legacyVisit],
    ]),
  /staff access/,
);
await db.close();
console.log(
  "PASS: monthly migration, independent products, custom dates, ownership/RLS, immutable invoice dates, provider freeze, full-month capacity, actual sheet generation, nonmilk completion, legacy idempotent credits. Synthetic local PostgreSQL only.",
);
