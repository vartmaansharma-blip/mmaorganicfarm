import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeVisits} from '../lib/farm-overview.ts';
const row=(id,visit,status,quantity=2,actual=null,unit='L')=>({id,visit_key:visit,status,delivery_route_id:'route',assigned_driver_id:'driver',delivery_confirmed:status==='delivered',daily_delivery_items:[{product_key:'milk',quantity,unit,fulfilled_quantity:actual}]});
test('groups multiple paid lines into one visit while preserving physical product quantities',()=>{
 const s=summarizeVisits([row('1','home','delivered',1),row('2','home','delivered',2),row('3','pending','ready'),row('4','cancelled','cancelled')],[]);
 assert.deepEqual(s,{expected:2,delivered:1,partial:0,unsuccessful:0,pending:1,milkPlanned:5,milkDelivered:3});
});
test('partial, unsuccessful, and pending visits stay distinct; unknown product units cannot become litres',()=>{
 const s=summarizeVisits([row('1','a','failed',2,1),row('2','b','failed'),row('3','c','ready'),row('4','d','delivered',3,null,'packs')],[{visit_key:'a',outcome:'partial',resolution:'pending'},{visit_key:'b',outcome:'attempt_failed',resolution:'retained'}]);
 assert.deepEqual(s,{expected:4,delivered:1,partial:1,unsuccessful:1,pending:1,milkPlanned:6,milkDelivered:1});
});
test('an empty input is distinct from preparation state, which is supplied by dispatch',()=>{assert.equal(summarizeVisits([],[]).expected,0);});
