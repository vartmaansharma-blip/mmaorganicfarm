import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase,callAs} from './runtime.mjs';
const runtime=await createDatabase(),{db}=runtime;
test('cancellation no longer issues coupons and old offer RPCs cannot redeem',async()=>{
  const user=randomUUID(),plan=randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,`${user}@fixture.invalid`]);
  await db.query("insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',private.operational_today(),'none')",[plan,user]);
  await callAs(db,user,'select cancel_my_delivery_plan($1,null)',[plan]);
  assert.equal((await db.query('select count(*) n from private.welcome_back_offers')).rows[0].n,'0');
  assert.equal((await callAs(db,user,'select my_welcome_back_offer() offer')).rows[0].offer,null);
  await assert.rejects(callAs(db,user,"select apply_my_checkout_code($1,'MMA-0000000000000000')",[randomUUID()]),/permission denied/);
  const access=(await db.query("select has_function_privilege('authenticated','private.apply_my_checkout_code(uuid,text)','execute') private_access,has_function_privilege('authenticated','public.apply_my_checkout_code(uuid,text)','execute') public_access")).rows[0];
  assert.deepEqual(access,{private_access:false,public_access:false});
});
test('discount fields cannot be forged by any new order',async()=>{
  const user=randomUUID();await db.query('insert into auth.users(id) values($1)',[user]);
  await assert.rejects(db.query("insert into orders(user_id,purchase_mode,bottle_choice,subtotal_paise,total_paise,discount_code,discount_paise,phone_snapshot,address_snapshot) values($1,'once','none',10000,9500,'MMA-0000000000000000',500,'0000000000','Synthetic address')",[user]),/Discount offers are not available/);
});
test.after(()=>runtime.stop());
