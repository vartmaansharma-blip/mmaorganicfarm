import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createDatabase, callAs } from "./runtime.mjs";
const runtime = await createDatabase();
const { db, config } = runtime;
const today = (await db.query("select private.operational_today()::text d")).rows[0].d;
const date = async (days) => (await db.query("select ($1::date+$2::int)::text d",[today,days])).rows[0].d;
const manager=randomUUID();
await db.query("insert into auth.users(id,email) values($1,'manager@fixture.invalid')",[manager]);
await db.query("insert into farm_staff(user_id,role) values($1,'manager')",[manager]);
async function fixture(monthly=false) {
  const user=randomUUID(),plan=randomUUID(),order=randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)",[user,`${user}@fixture.invalid`]);
  if(monthly) await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,schedule_rules) values($1,$2,'paused',$3,'none','calendar_month',($3::date+interval '1 month')::date,0,'[{\"productKey\":\"milk\",\"repeat\":\"daily\",\"quantity\":2}]')",[plan,user,today]);
  else await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'none')",[plan,user,today]);
  await db.query("insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,'plan','paid','none',100,100,'0000000000','Synthetic address',$4)",[order,user,plan,today]);
  await db.query("insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",[order,user,order]);
  await db.query("update delivery_plans set status='active' where id=$1",[plan]);
  await db.query("insert into weekly_delivery_items(plan_id,user_id,product_key,day_of_week,quantity,unit) values($1,$2,'milk',1,2,'L')",[plan,user]);
  return {user,plan,order};
}
async function visit(f,days,status='ready',fulfilled=null) {
  const id=(await db.query("insert into daily_deliveries(plan_id,user_id,delivery_date,status,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,$4,'Synthetic customer','Synthetic address','none',$5) returning id",[f.plan,f.user,await date(days),status,manager])).rows[0].id;
  await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,fulfilled_quantity,unit) values($1,'milk',2,$2,'L')",[id,fulfilled]);
  return id;
}
const cancel=async(f,reason=null,client=db)=>(await callAs(client,f.user,"select cancel_my_delivery_plan($1,$2) result",[f.plan,reason])).rows[0].result;
const status=async(id)=>(await db.query("select status from daily_deliveries where id=$1",[id])).rows[0].status;

test("customer cancellation is immediate on released routes and preserves paid terms/history",async()=>{
  const f=await fixture();
  await db.query("insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now()) on conflict(delivery_date) do nothing",[today,manager]);
  const enroute=await visit(f,0,'out_for_delivery'), future=await visit(f,1);
  const past=await visit(f,-1,'delivered',2), attempt=await visit(f,2,'failed',0);
  const planBefore=(await db.query("select purchased_deliveries,delivered_deliveries,start_date from delivery_plans where id=$1",[f.plan])).rows[0];
  const result=await cancel(f);
  assert.equal(result.status,'cancelled');assert.equal(result.cancelled_deliveries,2);
  assert.equal(await status(enroute),'cancelled');assert.equal(await status(future),'cancelled');
  assert.equal(await status(past),'delivered');assert.equal(await status(attempt),'failed');
  assert.deepEqual((await db.query("select purchased_deliveries,delivered_deliveries,start_date from delivery_plans where id=$1",[f.plan])).rows[0],planBefore);
  assert.equal((await db.query("select status from orders where id=$1",[f.order])).rows[0].status,'paid');
  assert.equal((await db.query("select status from payments where order_id=$1",[f.order])).rows[0].status,'captured');
  const audit=(await db.query("select status,resolved_by from cancellation_requests where id=$1",[result.request_id])).rows[0];
  assert.deepEqual(audit,{status:'completed',resolved_by:f.user});
  assert.equal((await db.query("select count(*) n from cancellation_requests where plan_id=$1 and status='requested'",[f.plan])).rows[0].n,'0');
});
test("retries and simultaneous cancellation create one customer notice and one canonical record",async()=>{
  const f=await fixture();await visit(f,1);
  const a=new Client(config),b=new Client(config);await a.connect();await b.connect();
  try { const result=await Promise.all([cancel(f,'Changed my plans',a),cancel(f,null,b)]);assert.deepEqual(result.map(r=>r.already_cancelled).sort(),[false,true]);assert.equal(result[0].request_id,result[1].request_id); }
  finally {await a.end();await b.end();}
  assert.equal((await db.query("select count(*) n from cancellation_requests where plan_id=$1",[f.plan])).rows[0].n,'1');
  assert.equal((await db.query("select count(*) n from customer_notifications where user_id=$1 and kind='cancellation_update'",[f.user])).rows[0].n,'1');
});
test("customers cannot cancel another account and an absent session cannot cancel",async()=>{
  const owner=await fixture(),other=await fixture();
  await assert.rejects(callAs(db,other.user,"select cancel_my_delivery_plan($1,null)",[owner.plan]),/cannot be cancelled/);
  await assert.rejects(callAs(db,null,"select cancel_my_delivery_plan($1,null)",[owner.plan]),/Sign in/);
  assert.equal((await db.query("select status from delivery_plans where id=$1",[owner.plan])).rows[0].status,'active');
});
test("old account clients inserting a plan request cancel in that same transaction",async()=>{
  const f=await fixture();const id=await visit(f,1);
  await callAs(db,f.user,"insert into cancellation_requests(user_id,plan_id,reason) values($1,$2,'Legacy client cancellation')",[f.user,f.plan]);
  assert.equal(await status(id),'cancelled');
  assert.equal((await db.query("select status from cancellation_requests where plan_id=$1",[f.plan])).rows[0].status,'completed');
});
test("ordinary order requests retain their separate review and do not cancel a plan",async()=>{
  const f=await fixture();
  await callAs(db,f.user,"insert into cancellation_requests(user_id,order_id,reason) values($1,$2,'Review this order')",[f.user,f.order]);
  assert.equal((await db.query("select status from cancellation_requests where order_id=$1",[f.order])).rows[0].status,'requested');
  assert.equal((await db.query("select status from delivery_plans where id=$1",[f.plan])).rows[0].status,'active');
});
test("monthly cancellation preserves the purchased calendar period and dated schedule",async()=>{
  const f=await fixture(true);const id=await visit(f,1);
  await db.query("insert into scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit) values($1,$2,'milk',$3,2,'L')",[f.plan,f.user,await date(1)]);
  const before=(await db.query("select billing_model,period_end_exclusive,schedule_rules from delivery_plans where id=$1",[f.plan])).rows[0];
  await cancel(f);assert.equal(await status(id),'cancelled');
  assert.deepEqual((await db.query("select billing_model,period_end_exclusive,schedule_rules from delivery_plans where id=$1",[f.plan])).rows[0],before);
  assert.equal((await db.query("select count(*) n from scheduled_delivery_items where plan_id=$1",[f.plan])).rows[0].n,'1');
});
test("recorded quantity evidence and closed-day records are not rewritten",async()=>{
  const f=await fixture();const recorded=await visit(f,1,'ready',1),closed=await visit(f,365),next=await visit(f,366);
  const event=(await db.query("insert into delivery_operation_events(request_key,delivery_date,actor_id,actor_role,action,request_payload,before_state,after_state) values($1,$2,$3,'manager','close_day','{}','{}','{}') returning id",[randomUUID(),await date(365),manager])).rows[0].id;
  await db.query("insert into delivery_day_reviews(delivery_date,version,action,event_id,snapshot) values($1,1,'closed',$2,'{}')",[await date(365),event]);
  await cancel(f);assert.equal(await status(recorded),'ready');assert.equal(await status(closed),'ready');assert.equal(await status(next),'cancelled');
});
test("a generator cannot insert new scheduled visits for a cancelled plan",async()=>{
  const f=await fixture();await cancel(f);
  await assert.rejects(visit(f,1),/plan has been cancelled/);
});
test("reason validation rolls back every cancellation side effect",async()=>{
  const f=await fixture();const id=await visit(f,1);
  await assert.rejects(cancel(f,'x'.repeat(501)),/under 500/);
  assert.equal(await status(id),'ready');assert.equal((await db.query("select status from delivery_plans where id=$1",[f.plan])).rows[0].status,'active');
});
test.after(()=>runtime.stop());
