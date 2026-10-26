import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerDeliverySnapshot as build, indiaDate } from '../lib/customer-delivery.ts';
const now = new Date('2026-10-26T06:00:00Z');
const item = (key='milk',quantity=2,fulfilled_quantity=null) => ({product_key:key,quantity,unit:'L',fulfilled_quantity});
const plan = (overrides={}) => ({id:'p',status:'active',start_date:'2026-10-01',billing_model:'calendar_month',period_end_exclusive:'2026-11-01',purchased_deliveries:0,delivered_deliveries:0,weekly_delivery_items:[],scheduled_delivery_items:[{...item(),delivery_date:'2026-10-26'},{...item(),delivery_date:'2026-10-27'}],delivery_exceptions:[],delivery_pauses:[],...overrides});
const row = (overrides={}) => ({id:'a',plan_id:'p',order_id:null,delivery_date:'2026-10-26',visit_key:'visit1',status:'planned',updated_at:'2026-10-26T05:00:00Z',delivered_confirmed_at:null,delivery_confirmed:false,replacement_of_delivery_id:null,fulfilment_root_id:null,daily_delivery_items:[item()],...overrides});
const snapshot = (overrides={}) => build({plans:[plan()],orders:[],records:[],now,...overrides});
test('India midnight rolls over independently of the browser timezone',()=> {
 assert.equal(indiaDate(new Date('2026-10-26T18:29:59Z')),'2026-10-26');
 assert.equal(indiaDate(new Date('2026-10-26T18:30:00Z')),'2026-10-27');
 assert.equal(snapshot({now:new Date('2026-10-26T18:30:00Z')}).date,'2026-10-27');
});
test('a paid schedule without generated rows stays scheduled, not on the way',()=>assert.equal(snapshot().state,'scheduled'));
test('unpaid pending plans never become confirmed deliveries',()=> {
 const s=snapshot({plans:[plan({status:'pending_confirmation'})]});assert.equal(s.state,'setup');assert.equal(s.upcoming.length,0);
});
test('ready and out-for-delivery are distinct actual farm states',()=> {
 assert.equal(snapshot({records:[row({status:'ready'})]}).state,'preparing');
 assert.equal(snapshot({records:[row({status:'out_for_delivery'})]}).state,'out');
});
test('delivered flags without confirmation cannot complete a visit',()=> {
 assert.equal(snapshot({records:[row({status:'delivered'})]}).state,'attention');
});
test('full recorded quantities still require a confirmed delivered leaf',()=> {
 assert.equal(snapshot({records:[row({status:'ready',daily_delivery_items:[item('milk',2,2)]})]}).state,'attention');
});
test('a confirmed delivery exposes only its real confirmation timestamp',()=> {
 const s=snapshot({records:[row({status:'delivered',delivery_confirmed:true,delivered_confirmed_at:'2026-10-26T05:01:00Z'})]});assert.equal(s.state,'delivered');assert.equal(s.completedAt,'2026-10-26T05:01:00Z');
});
test('one completed visit never completes a separate unfulfilled visit',()=> {
 const s=snapshot({records:[row({status:'delivered',delivery_confirmed:true}),row({id:'b',plan_id:null,visit_key:'visit2',status:'out_for_delivery',daily_delivery_items:[item('paneer',1)]})]});assert.equal(s.state,'attention');assert.equal(s.visits.length,2);assert.equal(s.completedAt,null);
});
test('two obligations in the same actual visit are presented together',()=> {
 const s=snapshot({records:[row(),row({id:'b',plan_id:null,daily_delivery_items:[item('ghee',1)]})]});assert.equal(s.visits.length,1);assert.equal(s.visits[0].items.length,2);
});
test('partial quantities remain outstanding and an unapproved follow-up stays unapproved',()=> {
 const s=snapshot({records:[row({status:'failed',daily_delivery_items:[item('milk',2,1)]})],history:[{delivery_date:'2026-10-26',visit_key:'visit1',outcome:'partial',resolution:'pending',follow_up_date:'2026-10-27'}]});assert.equal(s.state,'attention');assert.equal(s.visits[0].items[0].fulfilled_quantity,1);assert.equal(s.visits[0].followUpApproved,false);
});
test('approved follow-ups are not completed replacements',()=> {
 const s=snapshot({records:[row({status:'failed',daily_delivery_items:[item('milk',2,1)]})],history:[{delivery_date:'2026-10-26',visit_key:'visit1',outcome:'partial',resolution:'rescheduled',follow_up_date:'2026-10-27'}]});assert.equal(s.state,'attention');assert.equal(s.visits[0].followUp,'2026-10-27');
});
test('same-day replacement lineage neither doubles the purchase nor loses delivered quantity',()=> {
 const s=snapshot({records:[row({status:'failed',daily_delivery_items:[item('milk',2,1)]}),row({id:'b',visit_key:'replacement',replacement_of_delivery_id:'a',fulfilment_root_id:'a',status:'delivered',delivery_confirmed:true,daily_delivery_items:[item('milk',1,1)]})]});assert.equal(s.state,'delivered');assert.equal(s.visits.length,1);assert.equal(s.visits[0].items[0].quantity,2);assert.equal(s.visits[0].items[0].fulfilled_quantity,2);
});
test('a replacement from yesterday does not suppress today’s normal schedule',()=> {
 const s=snapshot({records:[row({id:'b',replacement_of_delivery_id:'yesterday',fulfilment_root_id:'yesterday'})]});assert.equal(s.visits.length,2);
});
test('explicit today lookup does not depend on a limited history RPC',()=> {
 const s=snapshot({records:[row({status:'out_for_delivery'})],history:[]});assert.equal(s.state,'out');
});
test('monthly end is exclusive and independent product dates are retained',()=> {
 const s=snapshot({plans:[plan({period_end_exclusive:'2026-10-26'}),plan({id:'paneer',scheduled_delivery_items:[{...item('paneer',1),delivery_date:'2026-10-26'}]})]});assert.equal(s.visits.length,1);assert.equal(s.visits[0].items[0].product_key,'paneer');assert.equal(s.upcoming.length,0);
});
test('pauses and date skips have explicit states',()=> {
 assert.equal(snapshot({plans:[plan({delivery_pauses:[{start_date:'2026-10-26',end_date:'2026-10-26'}]})]}).state,'paused');
 assert.equal(snapshot({plans:[plan({delivery_exceptions:[{delivery_date:'2026-10-26',product_key:'milk',action:'skip',quantity:null,unit:null}]})]}).state,'skipped');
});
test('a real cancelled operational row suppresses fallback schedule',()=>assert.equal(snapshot({records:[row({status:'cancelled'})]}).state,'cancelled'));
test('paid one-time orders are included; unpaid drafts never appear as scheduled',()=> {
 const base={id:'o',purchase_mode:'once',start_date:'2026-10-26',order_items:[item('ghee',1)]};
 assert.equal(snapshot({plans:[],orders:[{...base,status:'paid'}]}).state,'scheduled');
 assert.equal(snapshot({plans:[],orders:[{...base,status:'draft'}]}).state,'setup');
});
test('multiple plans are combined and completed legacy balances never invent future deliveries',()=> {
 const p=plan({billing_model:'delivery_count',period_end_exclusive:null,purchased_deliveries:30,delivered_deliveries:30,scheduled_delivery_items:[],weekly_delivery_items:[{...item(),day_of_week:1}]});
 assert.equal(snapshot({plans:[p]}).state,'none');assert.equal(snapshot({plans:[p]}).upcoming.length,0);
 assert.equal(snapshot({plans:[plan(),plan({id:'p2'})]}).visits.length,2);
});
test('the last legacy entitlement reserved for today is not also projected for tomorrow',()=> {
 const p=plan({billing_model:'delivery_count',period_end_exclusive:null,purchased_deliveries:30,delivered_deliveries:29,scheduled_delivery_items:[],weekly_delivery_items:[1,2,3,4,5,6,7].map(day_of_week=>({...item(),day_of_week}))});
 const s=snapshot({plans:[p],records:[row({status:'out_for_delivery'})]});assert.equal(s.state,'out');assert.equal(s.upcoming.length,0);
});
