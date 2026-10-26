import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase(),
  { db, config } = runtime;
const today = (await db.query("select private.operational_today()::text d"))
  .rows[0].d;
async function customer({ paid = true, cancelled = true } = {}) {
  const user = randomUUID(),
    plan = randomUUID(),
    order = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    user,
    `${user}@fixture.invalid`,
  ]);
  await db.query(
    "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'none')",
    [plan, user, today],
  );
  if (paid) {
    await db.query(
      "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date,created_at) values($1,$2,$3,'plan','paid','none',10000,10000,'0000000000','Synthetic address',$4,now()-interval '2 months')",
      [order, user, plan, today],
    );
    await db.query(
      "insert into payments(order_id,user_id,provider,status,amount_paise,provider_order_id) values($1,$2,'manual','captured',10000,$3)",
      [order, user, order],
    );
  }
  if (cancelled)
    await callAs(db, user, "select cancel_my_delivery_plan($1,null)", [plan]);
  return { user, plan, order };
}
async function checkout(
  f,
  { subtotal = 300000, fees = 1100, monthly = true } = {},
) {
  const order = randomUUID();
  const reuse =
    f.newPlan &&
    (
      await db.query("select status from delivery_plans where id=$1", [
        f.newPlan,
      ])
    ).rows[0]?.status === "pending_confirmation";
  const plan = reuse ? f.newPlan : randomUUID();
  const start = (await db.query("select ($1::date+1)::text d", [today])).rows[0]
    .d;
  const rules = [
    { id: "milk", quantity: 1, repeat: "daily", firstDate: start },
  ];
  if (!reuse && monthly)
    await db.query(
      "insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,schedule_rules) values($1,$2,'pending_confirmation',$3,'new','calendar_month',($3::date+interval '1 month')::date,0,$4)",
      [plan, f.user, start, JSON.stringify(rules)],
    );
  else if (!reuse)
    await db.query(
      "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'pending_confirmation',$3,'none')",
      [plan, f.user, start],
    );
  await db.query(
    "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,bottle_charge_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,'plan','draft','new',$4,1000,$5,'0000000000','Synthetic address',$6)",
    [order, f.user, plan, subtotal, subtotal + fees, start],
  );
  await db.query(
    "insert into order_items(order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,line_total_paise,frequency) values($1,$2,'milk','Synthetic milk',1,'L',$3,$3,'once')",
    [order, f.user, subtotal],
  );
  return { ...f, newPlan: plan, newOrder: order, rules };
}
const offer = async (f, client = db) =>
  (await callAs(client, f.user, "select my_welcome_back_offer() o")).rows[0].o;
const apply = async (f, code, client = db) =>
  (
    await callAs(client, f.user, "select apply_my_checkout_code($1,$2) o", [
      f.newOrder,
      code,
    ])
  ).rows[0].o;
const order = async (f) =>
  (
    await db.query(
      "select status,discount_paise,discount_code,total_paise from orders where id=$1",
      [f.newOrder],
    )
  ).rows[0];
async function claim(f, expectedTotal) {
  const expected = expectedTotal ?? (await order(f)).total_paise;
  await db.query("begin");
  try {
    await db.query("set local role service_role");
    await db.query(
      "select set_config('request.jwt.claim.role','service_role',true)",
    );
    await db.query("select claim_monthly_checkout_total($1,$2,$3)", [
      f.newOrder,
      JSON.stringify(f.rules),
      expected,
    ]);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

test("paid cancellation issues one durable random personal code and unpaid cancellations do not qualify", async () => {
  const a = await customer(),
    b = await customer(),
    unpaid = await customer({ paid: false }),
    current = await customer({ cancelled: false });
  const first = await offer(a),
    second = await offer(b);
  assert.match(first.code, /^MMA-[A-F0-9]{16}$/);
  assert.notEqual(first.code, second.code);
  assert.deepEqual(await offer(a), first);
  assert.equal(await offer(unpaid), null);
  assert.equal(await offer(current), null);
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.welcome_back_offers where user_id=$1",
        [a.user],
      )
    ).rows[0].n,
    "1",
  );
});
test("5% applies only to products, in paise, without compounding on retries", async () => {
  const f = await checkout(await customer()),
    code = (await offer(f)).code;
  assert.deepEqual(await apply(f, code.toLowerCase()), {
    code,
    discount_paise: 15000,
    total_paise: 286100,
  });
  assert.deepEqual(await apply(f, code), {
    code,
    discount_paise: 15000,
    total_paise: 286100,
  });
  assert.equal(
    (
      await db.query(
        "select subtotal_paise,bottle_charge_paise from orders where id=$1",
        [f.newOrder],
      )
    ).rows[0].bottle_charge_paise,
    1000,
  );
});
test("wrong, shared and anonymous codes cannot alter a checkout", async () => {
  const a = await checkout(await customer()),
    b = await checkout(await customer()),
    code = (await offer(a)).code;
  await assert.rejects(apply(b, code), /not valid for your account/);
  await assert.rejects(
    apply(a, "MMA-0000000000000000"),
    /not valid for your account/,
  );
  await assert.rejects(
    callAs(db, b.user, "select apply_my_checkout_code($1,$2)", [
      a.newOrder,
      code,
    ]),
    /Order unavailable/,
  );
  await assert.rejects(
    callAs(db, null, "select apply_my_checkout_code($1,$2)", [
      a.newOrder,
      code,
    ]),
    /Sign in/,
  );
  assert.equal((await order(a)).discount_paise, 0);
  assert.equal((await order(b)).discount_paise, 0);
  await assert.rejects(
    callAs(db, a.user, "select * from private.welcome_back_offers"),
    /permission denied/,
  );
});
test("removal restores the full total and permits another unpaid checkout", async () => {
  const f = await checkout(await customer()),
    code = (await offer(f)).code;
  await apply(f, code);
  const removed = await apply(f, "");
  assert.equal(removed.total_paise, 301100);
  assert.equal(removed.discount_paise, 0);
  const other = await checkout(f);
  await apply(other, code);
  assert.equal((await offer(f)).order_id, other.newOrder);
});
test("simultaneous checkouts reserve the same account offer only once", async () => {
  const a = await checkout(await customer()),
    b = await checkout(a),
    code = (await offer(a)).code;
  const x = new Client(config),
    y = new Client(config);
  await x.connect();
  await y.connect();
  try {
    const r = await Promise.allSettled([apply(a, code, x), apply(b, code, y)]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.match(
      r.find((x) => x.status === "rejected").reason.message,
      /another checkout/,
    );
  } finally {
    await x.end();
    await y.end();
  }
  assert.equal(
    (
      await db.query(
        "select count(*) n from orders where user_id=$1 and discount_paise>0",
        [a.user],
      )
    ).rows[0].n,
    "1",
  );
});
test("payment freezes the code and paid retries consume it once; another cancellation never resets it", async () => {
  const f = await checkout(await customer()),
    code = (await offer(f)).code;
  await apply(f, code);
  await claim(f);
  await assert.rejects(apply(f, ""), /Payment has started/);
  await db.query("update orders set status='paid' where id=$1", [f.newOrder]);
  const redeemed = (
    await db.query(
      "select redeemed_at from private.welcome_back_offers where user_id=$1",
      [f.user],
    )
  ).rows[0].redeemed_at;
  await db.query("update orders set status='paid' where id=$1", [f.newOrder]);
  assert.equal((await offer(f)).state, "redeemed");
  assert.deepEqual(
    (
      await db.query(
        "select redeemed_at from private.welcome_back_offers where user_id=$1",
        [f.user],
      )
    ).rows[0].redeemed_at,
    redeemed,
  );
  await callAs(db, f.user, "select cancel_my_delivery_plan($1,null)", [
    f.newPlan,
  ]);
  const again = await checkout(f);
  await assert.rejects(apply(again, code), /already used/);
  assert.equal((await offer(f)).code, code);
});
test("legacy credit plans and invoices created before cancellation cannot use the first-month offer", async () => {
  const legacy = await checkout(await customer(), { monthly: false });
  await assert.rejects(
    apply(legacy, (await offer(legacy)).code),
    /first monthly plan back/,
  );
  const f = await checkout(await customer()),
    code = (await offer(f)).code;
  await db.query(
    "update orders set created_at=now()-interval '1 day' where id=$1",
    [f.newOrder],
  );
  await assert.rejects(apply(f, code), /after cancelling a paid plan/);
});
test("abandoning a draft releases its reservation, while uncertain payment keeps the code frozen", async () => {
  const f = await checkout(await customer()),
    code = (await offer(f)).code;
  await apply(f, code);
  await db.query("update orders set status='cancelled' where id=$1", [
    f.newOrder,
  ]);
  assert.equal((await offer(f)).state, "available");
  assert.equal((await order(f)).discount_paise, 0);
  const other = await checkout(f);
  await apply(other, code);
  await claim(other);
  assert.equal((await offer(f)).state, "reserved");
  await assert.rejects(apply(other, ""), /Payment has started/);
});
test("first return already bought without a coupon is no longer eligible", async () => {
  const f = await checkout(await customer());
  await db.query("update orders set status='paid' where id=$1", [f.newOrder]);
  await db.query(
    "insert into payments(order_id,user_id,provider,status,amount_paise,provider_order_id) values($1,$2,'manual','captured',301100,$3)",
    [f.newOrder, f.user, f.newOrder],
  );
  assert.equal(await offer(f), null);
});
test("direct customer inserts cannot forge a discount", async () => {
  const f = await customer();
  await assert.rejects(
    callAs(
      db,
      f.user,
      "insert into orders(user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,discount_code,discount_paise) values($1,'once','draft','none',10000,9500,'0000000000','Synthetic address','MMA-0000000000000000',500)",
      [f.user],
    ),
    /Apply your personal code/,
  );
});
test("payment preparation rejects a stale reviewed total before freezing checkout", async () => {
  const f = await checkout(await customer());
  await apply(f, (await offer(f)).code);
  await assert.rejects(claim(f, 301100), /total changed/);
  assert.equal((await order(f)).status, 'draft');
  await assert.rejects(callAs(db, f.user, 'select claim_monthly_checkout_total($1,$2,$3)', [f.newOrder, JSON.stringify(f.rules), 286100]), /permission denied/);
});
test.after(() => runtime.stop());
