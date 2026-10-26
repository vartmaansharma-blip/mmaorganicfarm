import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {createDatabase,callAs} from './runtime.mjs';
const runtime=await createDatabase(),{db,config}=runtime;
const owner=randomUUID(),manager=randomUUID(),customer=randomUUID(),other=randomUUID();
for(const id of [owner,manager,customer,other]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id}@fixture.invalid`]);
await db.query("insert into farm_staff(user_id,role) values($1,'admin'),($2,'manager')",[owner,manager]);
const prices={milk:6200,paneer:20000,ghee:37500,bottle:1000};
const catalog=async()=>(await db.query('select revision,prices from farm_catalog_prices')).rows[0];
const change=async(book,actor=owner,revision=null,client=db)=>(await callAs(client,actor,'select update_farm_prices($1,$2,$3) revision',[JSON.stringify(book),'Confirmed product price update',revision??(await catalog()).revision])).rows[0].revision;
async function order(user=customer,amount=6200,revision=null){
 const id=randomUUID();
 await db.query("insert into orders(id,user_id,purchase_mode,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,catalog_revision) values($1,$2,'once','none',$3,$3,'0000000000','Synthetic address',$4)",[id,user,amount,revision]);
 return id;
}
async function payment(provider='manual'){
 const orderId=await order(),id=randomUUID();
 await db.query("insert into payments(id,order_id,user_id,provider,provider_order_id,amount_paise,status,payment_method,paid_at) values($1,$2,$3,$4,$5,6200,'captured','cash',now())",[id,orderId,customer,provider,orderId]);
 await db.query("update orders set status='paid' where id=$1",[orderId]);
 return {id,order:orderId};
}
const agreed=async(id,user=customer)=>(await callAs(db,user,'select order_product_prices($1) prices',[id])).rows[0].prices;

test('price edits use integer paise, are owner-only and record before/after history',async()=>{
 const before=await catalog(),next={...prices,milk:6450,paneer:21999};
 await assert.rejects(change(next,manager),/Owner access/);
 await assert.rejects(change(next,customer),/Owner access/);
 await change(next);
 assert.deepEqual((await catalog()).prices,next);
 const audit=(await db.query("select actor_id,before_state,after_state from farm_change_log where action='update_prices' order by created_at desc limit 1")).rows[0];
 assert.equal(audit.actor_id,owner);assert.deepEqual(audit.before_state,before.prices);assert.deepEqual(audit.after_state,next);
 await assert.rejects(change({...next,milk:64.5}),/positive prices/);
 await change(prices);
});
test('order creation freezes the catalogue revision and customers cannot choose a historical rate',async()=>{
 const oldRevision=(await catalog()).revision,oldOrder=await order();
 await change({...prices,milk:6800});
 const newOrder=await order(customer,6800,oldRevision);
 assert.equal((await agreed(oldOrder)).milk,6200);
 assert.equal((await agreed(newOrder)).milk,6800);
 assert.notEqual((await db.query('select catalog_revision from orders where id=$1',[newOrder])).rows[0].catalog_revision,oldRevision);
 // Orders that predate this feature retain the original agreed catalogue.
 await assert.rejects(callAs(db,customer,'update orders set catalog_revision=$2 where id=$1',[newOrder,oldRevision]),/agreed catalogue|permission denied/);
 await db.query('alter table orders disable trigger stamp_order_catalog_revision');
 await db.query('update orders set catalog_revision=null where id=$1',[oldOrder]);
 await db.query('alter table orders enable trigger stamp_order_catalog_revision');
 assert.equal((await agreed(oldOrder)).milk,6200);
 await assert.rejects(agreed(newOrder,other),/Order unavailable/);
 await assert.rejects(agreed(newOrder,null),/Order unavailable/);
 await change(prices);
});
test('two stale price editors cannot overwrite one another',async()=>{
 const revision=(await catalog()).revision,a=new Client(config),b=new Client(config);await a.connect();await b.connect();
 try{const results=await Promise.allSettled([change({...prices,milk:6500},owner,revision,a),change({...prices,milk:6600},owner,revision,b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/Prices changed/);}
 finally{await a.end();await b.end();}
 await change(prices);
});
test('catalogue is public but price revision internals and operational audit are private',async()=>{
 await db.query('begin');try{await db.query('set local role anon');assert.equal((await db.query('select count(*) n from farm_catalog_prices')).rows[0].n,'1');await db.query('rollback');}catch(e){await db.query('rollback');throw e;}
 await assert.rejects(callAs(db,customer,'select * from private.catalog_price_revisions'),/permission denied/);
 assert.equal((await callAs(db,customer,'select count(*) n from farm_change_log')).rows[0].n,'0');
 await assert.rejects(callAs(db,owner,"update farm_catalog_prices set prices='{}'"),/permission denied/);
});
test('manual receipt corrections preserve amounts and service while keeping a full audit',async()=>{
 const f=await payment(),before=(await db.query('select * from payments where id=$1',[f.id])).rows[0];
 await callAs(db,owner,"select correct_manual_payment_details($1,'upi','SYNTHETIC-RECEIPT',now()-interval '1 day','Correct receipt method and date',0)",[f.id]);
 const after=(await db.query('select * from payments where id=$1',[f.id])).rows[0];
 assert.equal((await callAs(db,manager,"select count(*) n from farm_change_log where record_type='payment'")).rows[0].n,'0');
 assert.equal(after.amount_paise,before.amount_paise);assert.equal(after.status,'captured');assert.equal(after.payment_method,'upi');assert.equal(after.record_revision,1);
 assert.equal((await db.query('select status from orders where id=$1',[f.order])).rows[0].status,'paid');
 assert.equal((await db.query("select count(*) n from farm_change_log where record_id=$1 and action='correct_receipt'",[f.id])).rows[0].n,'1');
 await assert.rejects(callAs(db,owner,"select correct_manual_payment_details($1,'cash',null,now(),'Stale receipt edit',0)",[f.id]),/receipt changed/);
});
test('customers and managers cannot correct payments or exploit the legacy reset path',async()=>{
 const f=await payment();
 for(const actor of [customer,manager,null])await assert.rejects(callAs(db,actor,"select correct_manual_payment_details($1,'cash',null,now(),'Not an owner',0)",[f.id]),/Owner access/);
 await assert.rejects(callAs(db,customer,"select reset_manual_payment($1,'Attempt from a customer')",[f.id]),/Owner access/);
 assert.equal((await db.query('select status from payments where id=$1',[f.id])).rows[0].status,'captured');
 const online=await payment('razorpay');
 await assert.rejects(callAs(db,owner,"select correct_manual_payment_details($1,'cash',null,now(),'External payment edit',0)",[online.id]),/farm-recorded/);
});
test('manager customer edits are audited and customer self-service is not mislabelled as a staff edit',async()=>{
 await callAs(db,manager,"update customer_profiles set full_name='Updated customer',phone='+910000000000',address_line='Synthetic new address' where user_id=$1",[customer]);
 const audit=(await db.query("select actor_id,after_state from farm_change_log where record_type='customer' and record_id=$1 order by created_at desc limit 1",[customer])).rows[0];
 assert.equal(audit.actor_id,manager);assert.equal(audit.after_state.full_name,'Updated customer');
 const before=(await db.query("select count(*) n from farm_change_log where record_type='customer'")).rows[0].n;
 await callAs(db,customer,"update customer_profiles set full_name='Customer chosen name' where user_id=$1",[customer]);
 assert.equal((await db.query("select count(*) n from farm_change_log where record_type='customer'")).rows[0].n,before);
});
test.after(()=>runtime.stop());

let offset=30;
async function prepaid(monthly=true,baseSource=null) {
 const user=randomUUID(),plan=randomUUID(),orderId=randomUUID();offset+=40;
 const source=baseSource ?? (await db.query("select (private.operational_today()+$1::int)::text d",[offset])).rows[0].d;
 const target=(await db.query("select ($1::date+1)::text d",[source])).rows[0].d;
 await db.query('insert into auth.users(id,email) values($1,$2)',[user,`${user}@fixture.invalid`]);
 if(monthly) await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice,billing_model,period_end_exclusive,purchased_deliveries,schedule_rules) values($1,$2,'paused',$3,'return','calendar_month',($3::date+interval '1 month')::date,0,'[{\"id\":\"milk\",\"repeat\":\"daily\",\"quantity\":3}]')",[plan,user,source]);
 else await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'return')",[plan,user,source]);
 await db.query("insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,'plan','paid','return',18600,18600,'0000000000','Synthetic address',$4)",[orderId,user,plan,source]);
 await db.query("insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,18600,'manual','captured',$3)",[orderId,user,orderId]);
 await db.query("update delivery_plans set status='active' where id=$1",[plan]);
 if(monthly)await db.query("insert into scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit) values($1,$2,'milk',$3,3,'litre'),($1,$2,'milk',$4,1,'litre')",[plan,user,source,target]);
 else await db.query("insert into weekly_delivery_items(plan_id,user_id,product_key,day_of_week,quantity,unit) select $1,$2,'milk',n,3,'litre' from generate_series(1,7)n",[plan,user]);
 await db.query("insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values('milk',$1,100000) on conflict(product_key,delivery_date) do update set daily_limit=100000",[target]);
 return {user,plan,order:orderId,source,target};
}
async function move(f,{actor=manager,qty=1,source=3,target=1,to=f.target,reason='Customer asked to change delivery'}={}) {
 return callAs(db,actor,'select move_farm_prepaid_quantity($1,\'milk\',$2,$3,$4,$5,$6,$7)',[f.plan,f.source,to,qty,source,target,reason]);
}
const quantities=async(f)=>(await db.query('select plan_product_quantity($1,\'milk\',$2) a,plan_product_quantity($1,\'milk\',$3) b',[f.plan,f.source,f.target])).rows[0];
test('monthly quantity moves are atomic, preserve total, audit and reject stale/unauthorized edits',async()=>{
 const f=await prepaid(),before=(await db.query('select total_paise,status from orders where id=$1',[f.order])).rows[0];
 await assert.rejects(move(f,{actor:f.user}),/manager access/);
 await move(f);
 assert.deepEqual(await quantities(f),{a:'2.00',b:'2.00'});
 assert.deepEqual((await db.query('select total_paise,status from orders where id=$1',[f.order])).rows[0],before);
 await assert.rejects(move(f),/schedule changed/);
 assert.equal((await db.query("select count(*) n from farm_change_log where record_id=$1",[f.plan])).rows[0].n,'1');
 await assert.rejects(move(f,{source:2,target:2,to:(await db.query("select ($1::date+40)::text d",[f.source])).rows[0].d}),/purchased month/);
});
test('capacity conflict rolls back both source and destination quantities',async()=>{
 const f=await prepaid();await db.query("update production_capacity_overrides set daily_limit=1 where product_key='milk' and delivery_date=$1",[f.target]);
 await assert.rejects(move(f),/capacity/);assert.deepEqual(await quantities(f),{a:'3.00',b:'1.00'});
});
test('released dispatch and recorded outcomes protect schedule history',async()=>{
 const f=await prepaid();
 await db.query("insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",[f.source,manager]);
 await assert.rejects(move(f),/Reopen dispatch/);
 await db.query("update delivery_dispatches set status='draft',released_by=null,released_at=null where delivery_date=$1",[f.source]);
 const id=(await db.query("insert into daily_deliveries(plan_id,user_id,delivery_date,status,customer_name,generated_by) values($1,$2,$3,'ready','Synthetic customer',$4) returning id",[f.plan,f.user,f.source,manager])).rows[0].id;
 await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,fulfilled_quantity,unit) values($1,'milk',3,1,'L')",[id]);
 await assert.rejects(move(f),/Recorded delivery evidence/);assert.deepEqual(await quantities(f),{a:'3.00',b:'1.00'});
});
test('legacy reductions carry to the next calendar day and full skips retain credits',async()=>{
 const f=await prepaid(false);
 await move(f,{target:3});assert.deepEqual(await quantities(f),{a:'2.00',b:'4.00'});
 await assert.rejects(move(f,{source:2,target:4,to:(await db.query("select ($1::date+2)::text d",[f.source])).rows[0].d}),/schedule changed|next calendar/);
 const before=(await db.query('select purchased_deliveries,delivered_deliveries from delivery_plans where id=$1',[f.plan])).rows[0];
 await move(f,{source:2,target:0,to:null,qty:2});
 assert.deepEqual(await quantities(f),{a:'0',b:'4.00'});
 assert.deepEqual((await db.query('select purchased_deliveries,delivered_deliveries from delivery_plans where id=$1',[f.plan])).rows[0],before);
});
test('quantity moves synchronize only the affected untouched sheet rows',async()=>{
 const f=await prepaid();
 const id=(await db.query("insert into daily_deliveries(plan_id,user_id,delivery_date,status,customer_name,generated_by) values($1,$2,$3,'ready','Synthetic customer',$4) returning id",[f.plan,f.user,f.source,manager])).rows[0].id;
 await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',3,'L')",[id]);
 await move(f);
 assert.equal((await db.query('select quantity from daily_delivery_items where delivery_id=$1',[id])).rows[0].quantity,'2.00');
});
test('simultaneous quantity moves cannot oversell one destination',async()=>{
 const f=await prepaid(),g=await prepaid(true,f.source);
 const current=(await db.query("select active_plan_quantity+paid_once_quantity+checkout_holds_quantity n from product_capacity_snapshot('milk',$1,1)",[f.target])).rows[0].n;
 await db.query("update production_capacity_overrides set daily_limit=$2 where product_key='milk' and delivery_date=$1",[f.target,Number(current)+1]);
 const a=new Client(config),b=new Client(config);await a.connect();await b.connect();
 try{
  const results=await Promise.allSettled([f,g].map((x,i)=>callAs([a,b][i],manager,"select move_farm_prepaid_quantity($1,'milk',$2,$3,1,3,1,'Concurrent capacity check')",[x.plan,x.source,x.target])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/capacity/);
 }finally{await a.end();await b.end();}
});
test('paneer and ghee can move within their prepaid month without changing their purchased totals',async()=>{
 const f=await prepaid();
 for(const product of ['paneer','ghee']) {
  await db.query("insert into scheduled_delivery_items(plan_id,user_id,product_key,delivery_date,quantity,unit) values($1,$2,$3,$4,2,'500 g')",[f.plan,f.user,product,f.source]);
  await db.query("insert into production_capacity_overrides(product_key,delivery_date,daily_limit) values($1,$2,100000)",[product,f.target]);
  await callAs(db,manager,"select move_farm_prepaid_quantity($1,$2,$3,$4,1,2,0,'Move a prepaid product')",[f.plan,product,f.source,f.target]);
  assert.equal((await db.query('select sum(quantity) n from scheduled_delivery_items where plan_id=$1 and product_key=$2',[f.plan,product])).rows[0].n,'2.00');
 }
});
