import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createDatabase, callAs } from './runtime.mjs';
const runtime=await createDatabase({ routingFoundation:true });
const {db,config}=runtime;
const manager=randomUUID(), driver=randomUUID(), otherDriver=randomUUID(), customer=randomUUID(), outsider=randomUUID();
const today=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")).rows[0].d;
await db.query("insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",[[manager,driver,otherDriver,customer,outsider]]);
await db.query("insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver'),($3,'driver')",[manager,driver,otherDriver]);
const area=(await db.query("insert into delivery_areas(name,slug) values('Routing fixture','routing-fixture') returning id")).rows[0].id;
const makeRoute=async(name,terms=[],postal=['831001'])=>(await db.query('insert into delivery_routes(area_id,name,match_terms,postal_codes,stop_capacity) values($1,$2,$3,$4,20) returning id',[area,name,terms,postal])).rows[0].id;
const a=await makeRoute('Route A'), b=await makeRoute('Route B');
await db.query("update customer_profiles set address_line='Gate 4, Synthetic Colony',postal_code='831001',delivery_area_id=$2 where user_id=$1",[customer,area]);
const assign=async(user=customer)=>(await callAs(db,user,'select refresh_customer_route($1,false) id',[user])).rows[0].id;
const pin=async(lat=22.8,lon=86.2,accuracy=15,address='Gate 4, Synthetic Colony')=>callAs(db,customer,'select save_my_delivery_pin($1,$2,$3,$4)',[lat,lon,accuracy,address]);
const readiness=async()=> (await callAs(db,manager,'select get_dispatch_routing_readiness($1) r',[today])).rows[0].r;
const release=()=>callAs(db,manager,'select release_daily_dispatch($1)',[today]);
let first, second;
async function visit(user=customer, route=a, date=today) {
  const order=randomUUID();
  await db.query("insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'once','paid','none',100,100,$3,'0000000000','Gate 4, Synthetic Colony')",[order,user,date]);
  await db.query("insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",[order,user,order]);
  const id=(await db.query("insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,'planned',$4,$5,$6,1,'Fictional routing customer','Gate 4, Synthetic Colony','none',$7) returning id",[order,user,date,area,route,driver,manager])).rows[0].id;
  await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'paneer',1,'500 g')",[id]);
  return id;
}
try {
  await test('equal postal matches remain unassigned instead of choosing by name or sort order',async()=>{
    assert.equal(await assign(),null);
    assert.equal((await db.query('select delivery_route_id from customer_profiles where user_id=$1',[customer])).rows[0].delivery_route_id,null);
  });
  await test('literal locality refines a broad postal match and a valid explicit choice is preserved',async()=>{
    await db.query("update delivery_routes set match_terms=array['Synthetic Colony'] where id=$1",[a]);
    assert.equal(await assign(),a);
    await db.query('update delivery_routes set sort_order=-10 where id=$1',[b]);
    assert.equal(await assign(),a);
  });
  await test('punctuation-only rules cannot match and selected areas cannot be crossed silently',async()=>{
    await db.query("update customer_profiles set address_line='Unknown district',postal_code='000000',delivery_route_id=null where user_id=$1",[outsider]);
    await db.query("update delivery_routes set match_terms=array['%%%'] where id=$1",[b]);
    assert.equal(await assign(outsider),null);
    await db.query('update customer_profiles set delivery_area_id=$2,delivery_route_id=null where user_id=$1',[outsider,area]);
    assert.equal(await assign(outsider),null);
  });
  await test('customers cannot refresh another customer or run the manager routing sweep',async()=>{
    await assert.rejects(callAs(db,outsider,'select refresh_customer_route($1,true)',[customer]),/cannot update/);
    await assert.rejects(callAs(db,outsider,'select assign_unrouted_customers()'),/Manager/);
    await assert.rejects(callAs(db,driver,'select get_dispatch_routing_readiness($1)',[today]),/Manager/);
    await assert.rejects(callAs(db,null,'select save_my_delivery_pin(22,86,10,\'x\')'),/Sign in/);
  });
  await test('GPS requires a bounded accurate location and the current address',async()=>{
    await assert.rejects(pin(91),/accurate|accuracy|metres/);
    await assert.rejects(pin(22.8,86.2,101),/metres/);
    await assert.rejects(pin(22.8,86.2,15,'Old address'),/address changed/);
    await pin();
    assert.equal((await callAs(db,outsider,'select * from customer_delivery_pins')).rowCount,0);
    assert.equal((await callAs(db,driver,'select * from customer_delivery_pins')).rowCount,0);
    await assert.rejects(callAs(db,customer,'update customer_delivery_pins set latitude=0'),/permission denied/);
  });
  await test('confirmed pins snapshot matching destinations and readiness counts doorsteps, not order rows',async()=>{
    first=await visit();second=await visit();
    await callAs(db,manager,'select prepare_daily_dispatch($1)',[today]);
    // Preparation has no configured default driver, so preserve fixture assignment.
    await callAs(db,manager,'select assign_daily_route_driver($1,$2,$3,false)',[today,a,driver]);
    const r=await readiness();assert.equal(r.visits,1);assert.equal(r.confirmed_pin_visits,1);assert.deepEqual(r.issues,[]);
    assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[first])).rows[0].destination_latitude,22.8);
  });
  await test('address edits invalidate draft pins and a fresh confirmation updates only matching drafts',async()=>{
    await db.query("update customer_profiles set locality='Changed fixture locality' where user_id=$1",[customer]);
    assert.equal((await db.query('select * from customer_delivery_pins where user_id=$1',[customer])).rowCount,0);
    assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[first])).rows[0].destination_latitude,null);
    await pin();
    assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[first])).rows[0].destination_latitude,22.8);
  });
  await test('anonymous execution and direct privileged helper calls are denied by database grants',async()=>{
    for(const fn of ['public.save_my_delivery_pin(double precision,double precision,double precision,text)','public.get_dispatch_routing_readiness(date)','private.assign_daily_route_driver_impl(date,uuid,uuid,boolean)'])
      assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') allowed",[fn])).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated','private.customer_route_candidates(uuid)','execute') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_table_privilege('anon','public.customer_delivery_pins','select') allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.customer_delivery_pins'::regclass")).rows[0].relrowsecurity,true);
  });
  await test('inactive drivers and inactive routes block release and leave the dispatch draft',async()=>{
    await db.query('update farm_staff set active=false where user_id=$1',[driver]);
    assert.ok((await readiness()).issues.some(i=>i.code==='invalid_driver'));
    await assert.rejects(release(),/Routing review/);
    assert.equal((await db.query('select status from delivery_dispatches where delivery_date=$1',[today])).rows[0].status,'draft');
    assert.equal((await db.query('select status from daily_deliveries where id=$1',[first])).rows[0].status,'planned');
    await db.query('update farm_staff set active=true where user_id=$1',[driver]);
    await db.query('update delivery_routes set active=false where id=$1',[a]);
    await assert.rejects(release(),/Routing review/);
    await db.query('update delivery_routes set active=true where id=$1',[a]);
  });
  await test('split order lines at one doorstep block release',async()=>{
    await db.query('update daily_deliveries set delivery_route_id=$2 where id=$1',[second,b]);
    assert.ok((await readiness()).issues.some(i=>i.code==='split_visit'));
    await assert.rejects(release(),/Routing review/);
    await db.query('update daily_deliveries set delivery_route_id=$2 where id=$1',[second,a]);
  });
  await test('route capacity counts distinct visits and missing written addresses block release',async()=>{
    await db.query('update delivery_routes set stop_capacity=1 where id=$1',[a]);
    const extra=await visit(outsider);
    assert.ok((await readiness()).issues.some(i=>i.code==='route_capacity'));
    await assert.rejects(release(),/capacity|stop limit/);
    await db.query("update daily_deliveries set status='cancelled' where id=$1",[extra]);
    await db.query('update daily_deliveries set address_snapshot=null where id=$1',[second]);
    await assert.rejects(release(),/address|doorstep/);
    await db.query("update daily_deliveries set address_snapshot='Gate 4, Synthetic Colony' where id=$1",[second]);
  });
  await test('release freezes destinations and driver reassignment while GPS updates affect future drafts only',async()=>{
    await release();
    await assert.rejects(callAs(db,manager,'select assign_daily_route_driver($1,$2,$3,false)',[today,a,otherDriver]),/Reopen/);
    await assert.rejects(db.query('update daily_deliveries set route_stop_order=2 where id=$1',[first]),/Reopen/);
    const late=await visit();
    const lateRow=(await db.query('select status,delivery_route_id,assigned_driver_id,visit_key from daily_deliveries where id=$1',[late])).rows[0];
    assert.equal(lateRow.status,'planned');assert.equal(lateRow.delivery_route_id,null);assert.equal(lateRow.assigned_driver_id,null);assert.match(lateRow.visit_key,/:after-release:/);
    assert.ok((await readiness()).issues.some(i=>i.code==='invalid_route'));
    await assert.rejects(db.query('delete from daily_deliveries where id=$1',[first]),/cannot be deleted/);
    await pin(22.9,86.3);
    assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[first])).rows[0].destination_latitude,22.8);
  });
  await test('address changes invalidate saved pins without changing a released manifest; driver outcomes still work',async()=>{
    await db.query("update customer_profiles set landmark='New gate landmark' where user_id=$1",[customer]);
    assert.equal((await db.query('select * from customer_delivery_pins where user_id=$1',[customer])).rowCount,0);
    assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[first])).rows[0].destination_latitude,22.8);
    await callAs(db,driver,"select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",[[first,second],randomUUID()]);
    assert.equal((await db.query('select status from daily_deliveries where id=$1',[first])).rows[0].status,'delivered');
  });
  await test('a concurrent move waits for release and then fails without changing the committed manifest',async()=>{
    const day=(await db.query('select ($1::date+1)::text d',[today])).rows[0].d;
    const id=await visit(customer,a,day);
    await callAs(db,manager,'select prepare_daily_dispatch($1)',[day]);
    const one=new Client(config),two=new Client(config);await one.connect();await two.connect();
    try {
      await one.query('begin');await one.query("select set_config('request.jwt.claim.sub',$1,true)",[manager]);
      await one.query('select release_daily_dispatch($1)',[day]);
      const moving=callAs(two,manager,'select move_delivery_visit($1,$2,$3,1,false)',[day,(await db.query('select visit_key from daily_deliveries where id=$1',[id])).rows[0].visit_key,b]);
      await one.query('commit');await assert.rejects(moving,/Reopen/);
      assert.equal((await db.query('select delivery_route_id from daily_deliveries where id=$1',[id])).rows[0].delivery_route_id,a);
    } finally {await one.end();await two.end();}
  });
} finally {await runtime.stop();}
