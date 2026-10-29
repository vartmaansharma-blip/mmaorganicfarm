import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { createDatabase, callAs } from './runtime.mjs';

const runtime = await createDatabase({ routingFoundation: true, driverRuns: true });
const { db, config } = runtime;
await db.query(await readFile(new URL('../../supabase/migrations/20261029132348_razorpay_atomic_payment_confirmation.sql', import.meta.url), 'utf8'));
// Match the hosted service role's existing table grants; callers still use the
// new function's restricted EXECUTE grant and the real database transactions.
await db.query('grant select,insert,update on all tables in schema public to service_role');
const sql = 'select record_razorpay_payment($1,$2,$3,$4,$5,$6,$7) result';
const providerId = prefix => prefix + randomUUID().replaceAll('-', '');
async function fixture({ mode = 'plan', isTest = false, cancelled = false, adjustmentApplied = false } = {}) {
  const user = randomUUID(), order = randomUUID(), plan = mode === 'once' ? null : randomUUID();
  const providerOrder = providerId('order_'), payment = providerId('pay_');
  await db.query('insert into auth.users(id,email) values($1,$2)', [user, `${user}@fixture.invalid`]);
  if (plan) await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice,is_test) values($1,$2,$3,private.operational_today()+30,'none',$4)", [plan,user,mode==='adjustment'?'paused':'pending_confirmation',isTest]);
  await db.query("insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,razorpay_order_id,is_test) values($1,$2,$3,$4,$5,'none',6200,6200,'0000000000','Synthetic fixture',$6,$7)", [order,user,plan,mode,cancelled?'cancelled':'pending_payment',providerOrder,isTest]);
  const date = (await db.query('select (private.operational_today()+30)::text d')).rows[0].d;
  await db.query("insert into order_capacity_reservations(order_id,product_key,delivery_date,quantity,expires_at) values($1,'milk',$2,1,now()+interval '1 day')", [order,date]);
  if (mode === 'adjustment') {
    await db.query("insert into delivery_adjustments(user_id,plan_id,order_id,delivery_date,previous_quantity,requested_quantity,status) values($1,$2,$3,$4,1,2,$5)", [user,plan,order,date,adjustmentApplied?'applied':'pending_payment']);
    if (adjustmentApplied) await db.query("insert into delivery_exceptions(plan_id,user_id,delivery_date,product_key,action,quantity,unit) values($1,$2,$3,'milk','override',4,'litre')", [plan,user,date]);
  }
  return { user,order,plan,date,args:[order,providerOrder,payment,6200,'INR',isTest,'captured'] };
}
async function record(f, { client = db, status = 'captured', args = f.args } = {}) {
  await client.query('begin');
  try {
    await client.query('set local role service_role');
    const params = [...args]; params[6] = status;
    const result = (await client.query(sql, params)).rows[0].result;
    await client.query('commit');
    return result;
  } catch (error) { await client.query('rollback'); throw error; }
}
async function state(f) {
  return (await db.query(`select
    (select count(*)::int from payments where order_id=$1) payments,
    (select count(*)::int from customer_notifications where order_id=$1 and kind='payment_confirmed') notifications,
    (select count(*)::int from private.razorpay_payment_confirmations where order_id=$1) confirmations,
    (select status from orders where id=$1) order_status,
    (select status from delivery_plans where id=$2) plan_status,
    (select status from order_capacity_reservations where order_id=$1) capacity`, [f.order,f.plan])).rows[0];
}

test('capture replay creates one payment, activation, notification and consumed hold', async () => {
  const f = await fixture();
  assert.equal((await record(f)).status, 'paid');
  const paidAt = (await db.query('select paid_at from payments where order_id=$1', [f.order])).rows[0].paid_at;
  assert.equal((await record(f)).duplicate, true);
  assert.deepEqual(await state(f), {payments:1,notifications:1,confirmations:1,order_status:'paid',plan_status:'active',capacity:'consumed'});
  assert.deepEqual((await db.query('select paid_at from payments where order_id=$1', [f.order])).rows[0].paid_at, paidAt);
  assert.equal((await db.query('select paid_total_paise from orders where id=$1',[f.order])).rows[0].paid_total_paise,6200);
});
test('simultaneous webhook and checkout verification serialize without repeating effects', async () => {
  const f = await fixture(), a = new Client(config), b = new Client(config);
  await a.connect(); await b.connect();
  try { const results = await Promise.all([record(f,{client:a}),record(f,{client:b})]); assert.equal(results.filter(r=>r.duplicate).length,1); }
  finally { await a.end(); await b.end(); }
  assert.deepEqual(await state(f), {payments:1,notifications:1,confirmations:1,order_status:'paid',plan_status:'active',capacity:'consumed'});
});
test('adjustment replay succeeds and preserves edits made after its first application', async () => {
  const f = await fixture({mode:'adjustment'});
  await record(f);
  assert.equal((await db.query('select status from delivery_adjustments where order_id=$1',[f.order])).rows[0].status,'applied');
  assert.equal(Number((await db.query('select quantity from delivery_exceptions where plan_id=$1',[f.plan])).rows[0].quantity),2);
  await db.query('update delivery_exceptions set quantity=4 where plan_id=$1',[f.plan]);
  assert.equal((await record(f)).status,'paid');
  assert.equal(Number((await db.query('select quantity from delivery_exceptions where plan_id=$1',[f.plan])).rows[0].quantity),4);
  assert.equal((await state(f)).notifications,1);
});
test('legacy applied adjustment recovers without replacing the current quantity', async () => {
  const f = await fixture({mode:'adjustment',adjustmentApplied:true});
  assert.equal((await record(f)).status,'paid');
  assert.equal(Number((await db.query('select quantity from delivery_exceptions where plan_id=$1',[f.plan])).rows[0].quantity),4);
});
test('notification failure rolls back payment, activation, adjustment and capacity; retry recovers', async () => {
  const f = await fixture({mode:'adjustment'});
  await db.query("create function private.fail_payment_notification() returns trigger language plpgsql as $$ begin raise exception 'injected notification failure'; end $$; create trigger fail_payment_notification before insert on customer_notifications for each row execute function private.fail_payment_notification()");
  try { await assert.rejects(record(f), /injected notification failure/); }
  finally { await db.query('drop trigger fail_payment_notification on customer_notifications; drop function private.fail_payment_notification()'); }
  assert.deepEqual(await state(f), {payments:0,notifications:0,confirmations:0,order_status:'pending_payment',plan_status:'paused',capacity:'pending'});
  assert.equal((await db.query('select count(*)::int n from delivery_exceptions where plan_id=$1',[f.plan])).rows[0].n,0);
  assert.equal((await db.query('select status from delivery_adjustments where order_id=$1',[f.order])).rows[0].status,'pending_payment');
  await record(f);
  assert.equal((await state(f)).capacity,'consumed');
});
test('captured test payment stays isolated from live order status, fulfilment and notifications', async () => {
  const f = await fixture({isTest:true});
  assert.equal((await record(f)).isTest,true);
  await record(f);
  assert.deepEqual(await state(f), {payments:1,notifications:0,confirmations:1,order_status:'pending_payment',plan_status:'pending_confirmation',capacity:'pending'});
  assert.equal((await db.query('select is_test from payments where order_id=$1',[f.order])).rows[0].is_test,true);
  assert.equal((await db.query('select count(*)::int n from daily_deliveries where plan_id=$1',[f.plan])).rows[0].n,0);
});
test('authorization may precede capture but a delayed authorization never downgrades capture', async () => {
  const f = await fixture();
  assert.equal((await record(f,{status:'authorized'})).status,'processing');
  assert.equal((await state(f)).notifications,0);
  await record(f);
  assert.equal((await record(f,{status:'authorized'})).status,'paid');
  assert.equal((await db.query('select status from payments where order_id=$1',[f.order])).rows[0].status,'captured');
  assert.equal((await state(f)).notifications,1);
});
test('cancelled orders retain captured evidence and require review without reactivation', async () => {
  const f = await fixture({cancelled:true});
  assert.equal((await record(f)).status,'review_required');
  assert.equal((await record(f)).status,'review_required');
  assert.deepEqual(await state(f), {payments:1,notifications:0,confirmations:1,order_status:'cancelled',plan_status:'pending_confirmation',capacity:'pending'});
});
test('a cancelled plan is not reactivated by a late capture', async () => {
  const f=await fixture();
  await db.query("update delivery_plans set status='cancelled' where id=$1",[f.plan]);
  assert.equal((await record(f)).status,'review_required');
  assert.equal((await state(f)).plan_status,'cancelled');
  assert.equal((await state(f)).notifications,0);
});
test('wrong amount, currency, mode, provider order and empty payment identifiers cannot write', async () => {
  const f = await fixture();
  for(const [index,value] of [[3,1],[4,'USD'],[5,true],[1,providerId('order_')],[2,''],[6,null]]) {
    const args = [...f.args]; args[index]=value;
    await assert.rejects(record(f,{args,status:args[6]}), /Invalid provider payment|does not match/);
  }
  assert.equal((await state(f)).payments,0);
});
test('an existing provider payment cannot be rebound to another order or customer', async () => {
  const a = await fixture(), b = await fixture();
  await record(a);
  const args = [...b.args]; args[2]=a.args[2];
  await assert.rejects(record(b,{args}), /already bound/);
  assert.equal((await state(b)).payments,0);
  assert.equal((await state(a)).payments,1);
});
test('a second captured payment preserves evidence and requires review without duplicating service', async () => {
  const f = await fixture(); await record(f);
  const args = [...f.args]; args[2]=providerId('pay_');
  assert.equal((await record(f,{args})).status,'review_required');
  assert.equal((await state(f)).payments,2);
  assert.equal((await state(f)).notifications,1);
});
test('legacy confirmation notifications are not repeated when recovering partial processing', async () => {
  const f = await fixture({mode:'once'});
  await db.query("insert into customer_notifications(user_id,order_id,kind,title,message) values($1,$2,'payment_confirmed','Payment confirmed','Legacy fixture')",[f.user,f.order]);
  await record(f);
  assert.equal((await state(f)).notifications,1);
});
test('browser roles cannot invoke settlement or inspect private confirmation markers', async () => {
  const f = await fixture();
  await assert.rejects(callAs(db,f.user,sql,f.args), /permission denied/);
  await assert.rejects(callAs(db,f.user,'select * from private.razorpay_payment_confirmations'), /permission denied/);
  const privileges=(await db.query("select has_function_privilege('anon','public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text)','execute') anon,has_function_privilege('authenticated','public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text)','execute') authenticated,has_function_privilege('service_role','public.record_razorpay_payment(uuid,text,text,integer,text,boolean,text)','execute') service")).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:false,service:true});
});
test.after(()=>runtime.stop());
