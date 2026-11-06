import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { callAs, createDatabase } from "./runtime.mjs";

test("referrals lock in owner-set rewards and unlock once on a confirmed paid monthly delivery", async () => {
  const runtime = await createDatabase();
  const { db } = runtime;
  try {
    await db.query(await readFile(new URL("../../docs/verification/referrals.local.sql", import.meta.url), "utf8"));
    const [owner, manager, referrer, newcomer, previousCustomer, otherReferrer] = Array.from({ length: 6 }, randomUUID);
    await db.query(
      "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
      [[owner, manager, referrer, newcomer, previousCustomer, otherReferrer]],
    );
    await db.query("insert into farm_staff(user_id,role) values($1,'admin'),($2,'manager')", [owner, manager]);
    const as = (user, query, values = []) => callAs(db, user, query, values);
    const workspace = async (user) => (await as(user, "select referral_workspace() as data")).rows[0].data;
    const settings = (user, values) => as(user, "select save_referral_settings($1,$2,$3,$4)", values);
    const claim = (user, code) => as(user, "select claim_referral_code($1)", [code]);
    const revision = (await workspace(owner)).revision;
    assert.equal((await workspace(owner)).enabled, false);
    await assert.rejects(as(referrer, "select create_referral_code()"), /paused/);
    await assert.rejects(settings(manager, [true, 2500, 1000, revision]), /Owner access/);
    await assert.rejects(settings(owner, [true, 0, 0, revision]), /reward/);
    await settings(owner, [true, 2500, 1000, revision]);
    await assert.rejects(settings(owner, [true, 2600, 1000, revision]), /changed/);
    await assert.rejects(as(referrer, "select * from private.referral_claims"), /permission denied/);
    await assert.rejects(as(null, "select referral_workspace()"), /Sign in/);
    await as(referrer, "select create_referral_code()");
    const code = (await workspace(referrer)).code;
    await as(referrer, "select create_referral_code()");
    assert.equal((await workspace(referrer)).code, code);
    await as(otherReferrer, "select create_referral_code()");
    await assert.rejects(claim(referrer, code), /someone else/);
    await claim(newcomer, code.toLowerCase());
    await claim(newcomer, code);
    await assert.rejects(claim(newcomer, (await workspace(otherReferrer)).code), /already linked/);
    await settings(owner, [true, 5000, 2000, (await workspace(owner)).revision]);
    assert.deepEqual((await workspace(newcomer)).claim, { reward_paise: 1000, unlocked: false });
    assert.equal((await workspace(referrer)).invites, 1);

    const { rows: [{ date, yesterday, beforeYesterday }] } = await db.query(
      'select private.operational_today()::text date, (private.operational_today()-1)::text yesterday, (private.operational_today()-2)::text "beforeYesterday"',
    );
    const area = (await db.query("insert into delivery_areas(name,slug) values('Fixture','referral-fixture') returning id")).rows[0].id;
    const route = (await db.query("insert into delivery_routes(area_id,name) values($1,'Fixture') returning id", [area])).rows[0].id;
    await db.query("insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) select x,'released',$1,$1,now() from unnest($2::date[]) x", [manager, [date, yesterday, beforeYesterday]]);
    async function purchase(user, day, { monthly = false, isTest = false, paymentTest = false } = {}) {
      const order = randomUUID();
      const plan = monthly ? randomUUID() : null;
      if (plan) await db.query(
        "insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,is_test,schedule_rules) values($1,$2,'paused',$3,'none','calendar_month',($3::date+interval '1 month')::date,0,$4,$5)",
        [plan, user, day, isTest, JSON.stringify([{ id: "milk", repeat: "custom", quantity: 2, firstDate: day, dates: [day] }])],
      );
      await db.query(
        "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot,is_test) values($1,$2,$3,$4,'paid','none',100,100,$5,'0000000000','Fixture address',$6)",
        [order, user, plan, monthly ? "plan" : "once", day, isTest],
      );
      await db.query(
        "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id,is_test) values($1,$2,100,'manual','captured',$3,$4)",
        [order, user, order, isTest || paymentTest],
      );
      return { user, order, plan, isTest };
    }
    async function deliver({ user, order, plan, isTest }, day, outcome = "delivered") {
      const delivery = (await db.query(
        "insert into daily_deliveries(plan_id,order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,customer_name,address_snapshot,bottle_choice,generated_by,is_test) values($1,$2,$3,$4,'ready',$5,$6,'Fixture','Fixture address','none',$7,$8) returning id",
        [plan, plan ? null : order, user, day, area, route, manager, isTest],
      )).rows[0].id;
      await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L')", [delivery]);
      const request = randomUUID();
      const record = () => as(manager, "select record_delivery_outcome($1,$2,null,null,0,null,$3)", [[delivery], outcome, request]);
      await record();
      await record();
    }

    await purchase(previousCustomer, date);
    await assert.rejects(claim(previousCustomer, code), /first payment/);
    await deliver(await purchase(newcomer, beforeYesterday), beforeYesterday);
    assert.equal((await workspace(referrer)).earned_paise, 0);
    await deliver(await purchase(newcomer, yesterday, { monthly: true, paymentTest: true }), yesterday);
    assert.equal((await workspace(referrer)).unlocked_invites, 0);

    const monthly = await purchase(newcomer, date, { monthly: true });
    assert.equal((await workspace(referrer)).earned_paise, 0, "payment alone never unlocks a reward");
    await deliver(monthly, date);
    const referrerRewards = await workspace(referrer);
    assert.equal(referrerRewards.earned_paise, 2500);
    assert.equal(referrerRewards.unlocked_invites, 1);
    assert.deepEqual((await workspace(newcomer)).claim, { reward_paise: 1000, unlocked: true });
    assert.equal((await db.query("select qualifying_order_id from private.referral_claims where customer_id=$1", [newcomer])).rows[0].qualifying_order_id, monthly.order);
    assert.equal((await workspace(otherReferrer)).earned_paise, 0);

    await settings(owner, [false, 5000, 2000, (await workspace(owner)).revision]);
    assert.equal((await workspace(referrer)).enabled, false);
    assert.equal((await workspace(referrer)).earned_paise, 2500);
  } finally {
    await runtime.stop();
  }
});
