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
    await db.query(await readFile(new URL("../../docs/verification/referral-checkout.local.sql", import.meta.url), "utf8"));
    const [owner, manager, referrer, newcomer, previousCustomer, otherReferrer, batchCustomer] = Array.from({ length: 7 }, randomUUID);
    await db.query(
      "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
      [[owner, manager, referrer, newcomer, previousCustomer, otherReferrer, batchCustomer]],
    );
    await db.query("insert into farm_staff(user_id,role) values($1,'admin'),($2,'manager')", [owner, manager]);
    const as = (user, query, values = []) => callAs(db, user, query, values);
    const workspace = async (user) => (await as(user, "select referral_workspace() as data")).rows[0].data;
    const settings = (user, values) => as(user, "select save_referral_settings($1,$2,$3,$4,$5)", [...values.slice(0,4),values[4] ?? false]);
    const claim = (user, code) => as(user, "select claim_referral_code($1)", [code]);
    const revision = (await workspace(owner)).revision;
    const defaults = await workspace(owner);
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.discount_enabled, false);
    assert.equal(defaults.referrer_paise, 10000);
    assert.equal(defaults.newcomer_paise, 10000);
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

    const { rows: [{ date, yesterday, beforeYesterday, tomorrow }] } = await db.query(
      'select private.operational_today()::text date, (private.operational_today()-1)::text yesterday, (private.operational_today()-2)::text "beforeYesterday", (private.operational_today()+1)::text tomorrow',
    );
    const area = (await db.query("insert into delivery_areas(name,slug) values('Fixture','referral-fixture') returning id")).rows[0].id;
    const route = (await db.query("insert into delivery_routes(area_id,name) values($1,'Fixture') returning id", [area])).rows[0].id;
    await db.query("insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) select x,'released',$1,$1,now() from unnest($2::date[]) x", [manager, [date, yesterday, beforeYesterday, tomorrow]]);
    async function purchase(user, day, { monthly = false, isTest = false, paymentTest = false, draft = false } = {}) {
      const order = randomUUID();
      const plan = monthly ? randomUUID() : null;
      if (plan) await db.query(
        "insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,is_test,schedule_rules) values($1,$2,$6,$3,'none','calendar_month',($3::date+interval '1 month')::date,0,$4,$5)",
        [plan, user, day, isTest, JSON.stringify([{ id: "milk", repeat: "custom", quantity: 2, firstDate: day, dates: [day] }]), draft && !isTest ? "pending_confirmation" : "paused"],
      );
      await db.query(
        "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot,is_test) values($1,$2,$3,$4,$7,'none',20000,20000,$5,'0000000000','Fixture address',$6)",
        [order, user, plan, monthly ? "plan" : "once", day, isTest, draft ? "draft" : "paid"],
      );
      if (!draft) await db.query(
        "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id,is_test) values($1,$2,20000,'manual','captured',$3,$4)",
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
    await deliver(await purchase(newcomer, yesterday, { monthly: true, isTest: true }), yesterday);
    assert.equal((await workspace(referrer)).unlocked_invites, 0);

    const apply = async (user, orderId, batchId = null) => (await as(user,
      "select apply_referral_checkout($1,$2) amount", [orderId, batchId])).rows[0].amount;
    const monthly = await purchase(newcomer, tomorrow, { monthly: true, draft: true });
    assert.equal(await apply(newcomer, monthly.order), 0, "the discount switch is independent of sharing");
    await settings(owner, [true, 5000, 2000, (await workspace(owner)).revision, true]);
    await assert.rejects(apply(otherReferrer, monthly.order), /unavailable/);
    assert.equal(await apply(newcomer, monthly.order), 1000, "the invited customer gets the snapshotted discount at checkout");
    assert.equal(await apply(newcomer, monthly.order), 1000);
    const earlySender = await purchase(referrer, tomorrow, { monthly: true, draft: true });
    assert.equal(await apply(referrer, earlySender.order), 0, "the sender cannot use a discount before delivery");
    await db.query("update orders set status='cancelled' where id=$1", [earlySender.order]);
    await db.query("update delivery_plans set status='cancelled' where id=$1", [earlySender.plan]);
    await db.query("update orders set status='paid',paid_total_paise=total_paise where id=$1", [monthly.order]);
    await db.query(
      "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,19000,'manual','captured',$3)",
      [monthly.order, newcomer, monthly.order],
    );
    await db.query("update delivery_plans set status='active' where id=$1", [monthly.plan]);
    assert.equal((await workspace(referrer)).earned_paise, 0, "payment alone never unlocks a reward");
    await db.query("select set_config('test.referral_clock',$1,false)", [tomorrow]);
    await db.query("create or replace function private.operational_today() returns date language sql stable set search_path='' as $$select current_setting('test.referral_clock')::date$$");
    await deliver(monthly, tomorrow);
    const referrerRewards = await workspace(referrer);
    assert.equal(referrerRewards.earned_paise, 2500);
    assert.equal(referrerRewards.unlocked_invites, 1);
    assert.deepEqual((await workspace(newcomer)).claim, { reward_paise: 1000, unlocked: true });
    assert.equal((await db.query("select qualifying_order_id from private.referral_claims where customer_id=$1", [newcomer])).rows[0].qualifying_order_id, monthly.order);
    assert.equal((await workspace(otherReferrer)).earned_paise, 0);

    const senderDraft = await purchase(referrer, tomorrow, { monthly: true, draft: true });
    assert.equal(await apply(referrer, senderDraft.order), 2500);
    assert.equal((await db.query("select total_paise from orders where id=$1", [senderDraft.order])).rows[0].total_paise, 17500);
    const competing = (await db.query(
      "insert into orders(user_id,delivery_plan_id,purchase_mode,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'plan','none',20000,20000,$3,'0000000000','Fixture address') returning id",
      [referrer, senderDraft.plan, tomorrow],
    )).rows[0].id;
    assert.equal(await apply(referrer, competing), 0, "the same reward cannot be reserved for two checkouts");

    await claim(batchCustomer, code);
    const batchPlan = await purchase(batchCustomer, tomorrow, { monthly: true, draft: true });
    const batchOnce = await purchase(batchCustomer, date, { draft: true });
    const batch = (await db.query(
      "insert into checkout_batches(user_id,once_order_id,plan_order_id,amount_paise) values($1,$2,$3,40000) returning id",
      [batchCustomer, batchOnce.order, batchPlan.order],
    )).rows[0].id;
    await assert.rejects(apply(batchCustomer, batchPlan.order), /combined checkout/);
    assert.equal(await apply(batchCustomer, null, batch), 2000);
    assert.equal((await db.query("select amount_paise from checkout_batches where id=$1", [batch])).rows[0].amount_paise, 38000);
    assert.equal((await db.query("select total_paise from orders where id=$1", [batchOnce.order])).rows[0].total_paise, 20000);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const { schedule_rules: rules } = (await db.query("select schedule_rules from delivery_plans where id=$1", [batchPlan.plan])).rows[0];
    await assert.rejects(db.query("select claim_checkout_batch($1,40000,$2)", [batch, JSON.stringify(rules)]), /changed/);
    await db.query("select claim_checkout_batch($1,38000,$2)", [batch, JSON.stringify(rules)]);
    assert.equal((await db.query("select status from checkout_batches where id=$1", [batch])).rows[0].status, "preparing");


    await settings(owner, [false, 5000, 2000, (await workspace(owner)).revision]);
    assert.equal((await workspace(referrer)).enabled, false);
    assert.equal(await apply(referrer, senderDraft.order), 2500, "an already reviewed total keeps its discount");
    assert.equal(await apply(referrer, competing), 0);
    assert.equal((await workspace(referrer)).earned_paise, 2500);
  } finally {
    await runtime.stop();
  }
});
