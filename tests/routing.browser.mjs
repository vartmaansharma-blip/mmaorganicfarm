import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { createDatabase, callAs } from './database/runtime.mjs';
import { startFixtureServer, sessionFor } from './database/supabase-fixture-server.mjs';
const withPins=process.env.ROUTING_SCHEMA !== 'legacy';
const runtime=await createDatabase({routingFoundation:withPins});
const {db}=runtime;
const bridge=await startFixtureServer(runtime.config,{port:55486});
const port=3176, base=`http://127.0.0.1:${port}`, output=`docs/screenshots/routing-foundation${withPins?'':'-legacy'}`;
await mkdir(output,{recursive:true});
let log='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:bridge.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',SUPABASE_SECRET_KEY:'local-service-fixture'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
const customer=randomUUID(),manager=randomUUID(),driver=randomUUID();
const results=[];
let browser, activePage;
try {
  await db.query("insert into auth.users(id,email,raw_user_meta_data) select x,x::text||'@fixture.invalid','{\"full_name\":\"Fictional routing customer\"}'::jsonb from unnest($1::uuid[]) x",[[customer,manager,driver]]);
  await db.query("insert into farm_staff(user_id,role) values($1,'manager'),($2,'driver')",[manager,driver]);
  const area=(await db.query("insert into delivery_areas(name,slug) values('Synthetic pin zone','synthetic-pin-zone') returning id")).rows[0].id;
  const route=(await db.query("insert into delivery_routes(area_id,name) values($1,'Synthetic entrance route') returning id",[area])).rows[0].id;
  await db.query("update customer_profiles set address_line='Fictional entrance, Test Colony',phone='0000000000',delivery_area_id=$2,delivery_route_id=$3 where user_id=$1",[customer,area,route]);
  await db.query('insert into route_driver_assignments(route_id,driver_id,updated_by) values($1,$2,$3)',[route,driver,manager]);
  const date=(await db.query("select ((now() at time zone 'Asia/Kolkata')::date+1)::text d")).rows[0].d;
  const order=randomUUID();
  await db.query("insert into orders(id,user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,$2,'once','paid','none',100,100,$3,'0000000000','Fictional entrance, Test Colony')",[order,customer,date]);
  await db.query("insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",[order,customer,order]);
  const delivery=(await db.query("insert into daily_deliveries(order_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,route_stop_order,customer_name,address_snapshot,bottle_choice,generated_by) values($1,$2,$3,'planned',$4,$5,$6,1,'Fictional routing customer','Fictional entrance, Test Colony','none',$7) returning id",[order,customer,date,area,route,driver,manager])).rows[0].id;
  await db.query("insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'paneer',1,'500 g')",[delivery]);
  await callAs(db,manager,'select prepare_daily_dispatch($1)',[date]);
  for(let i=0;i<100;i++){try{if((await fetch(base+'/sign-in')).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,100));}
  const cookie=user=>({name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(sessionFor(user))).toString('base64url'),domain:'127.0.0.1',path:'/'});
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    browser=await engine.launch();
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},geolocation:{latitude:22.8,longitude:86.2,accuracy:12},permissions:['geolocation']});
      await context.addCookies([cookie(customer)]);
      const page=await context.newPage();activePage=page;const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/account?section=settings');
      if(withPins) {
      const capture=page.getByRole('button',{name:/Use my current location|Update entrance location/});
      await capture.click();
      await page.getByRole('button',{name:'Confirm this is my delivery entrance'}).waitFor();
      assert.ok((await page.getByRole('link',{name:'Check this pin on the map'}).getAttribute('href')).includes('22.8'));
      await page.getByRole('button',{name:'Confirm this is my delivery entrance'}).click();
      await page.getByText('Entrance saved for matching future, unreleased deliveries.',{exact:true}).waitFor();
      assert.equal((await db.query('select latitude from customer_delivery_pins where user_id=$1',[customer])).rows[0].latitude,22.8);
      assert.equal((await db.query('select destination_latitude from daily_deliveries where id=$1',[delivery])).rows[0].destination_latitude,22.8);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await capture.waitFor({state:'visible'});
      await page.waitForFunction(() => !document.querySelector('[aria-labelledby="delivery-pin-title"] button')?.disabled);
      await page.screenshot({path:`${output}/${name}-${width}-customer.png`,fullPage:true});
      // Denied and imprecise capture never submit a saved pin.
      await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 1, message: 'Synthetic permission denied' }); });await capture.click();
      await page.getByText(/permission was declined/).waitFor();
      await page.reload();await context.setGeolocation({latitude:22.8,longitude:86.2,accuracy:250});await capture.click();
      await page.getByText(/Location is too imprecise/).waitFor();
      assert.equal(await page.getByRole('button',{name:'Confirm this is my delivery entrance'}).count(),0);
      } else {
        await page.getByText('Location saving is currently unavailable.',{exact:false}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Use my current location'}).count(),0);
      }
      await page.waitForLoadState('networkidle');
      assert.deepEqual(errors,[]);
      // Check each live page before teardown; WebKit reports cancellation of
      // in-flight speculative Link prefetch as pageerror during context.close.
      page.removeAllListeners('pageerror');
      await context.close();
      const managerContext=await browser.newContext({viewport:{width,height:900}});
      await managerContext.addCookies([cookie(manager)]);
      const managerPage=await managerContext.newPage();activePage=managerPage;managerPage.on('pageerror',e=>errors.push(e.message));
      await managerPage.goto(base+`/farm/routes?date=${date}`);
      if(withPins) {
        await managerPage.getByText('No routing blockers found.',{exact:false}).waitFor();
        await managerPage.getByText('1 visit · 1 with a confirmed entrance pin.',{exact:false}).waitFor();
      } else await managerPage.getByText('Routing checks could not be loaded.',{exact:false}).waitFor();
      assert.equal(await managerPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await managerPage.screenshot({path:`${output}/${name}-${width}-manager.png`,fullPage:true});
      if(name==='chromium' && width===390) await callAs(db,manager,'select release_daily_dispatch($1)',[date]);
      await managerPage.waitForLoadState('networkidle');assert.deepEqual(errors,[]);managerPage.removeAllListeners('pageerror');await managerContext.close();
      const driverContext=await browser.newContext({viewport:{width,height:900}});
      await driverContext.addCookies([cookie(driver)]);
      const driverPage=await driverContext.newPage();activePage=driverPage;driverPage.on('pageerror',e=>errors.push(e.message));
      await driverPage.goto(base+`/farm/delivery-sheet?date=${date}`);
      const nav=driverPage.getByRole('link',{name:withPins?'Navigate to confirmed entrance':'Navigate by address'});
      await nav.waitFor();
      assert.equal(new URL(await nav.getAttribute('href')).searchParams.get('destination'),withPins?'22.8,86.2':'Fictional entrance, Test Colony');
      assert.equal(await driverPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await driverPage.screenshot({path:`${output}/${name}-${width}-driver.png`,fullPage:true});
      assert.deepEqual(errors,[]);
      results.push({engine:name,width,schema:withPins?'migrated':'legacy',gpsCapture:withPins?'passed':'unavailable as expected',denied:withPins?'passed':'not applicable',imprecise:withPins?'passed':'not applicable',serverSave:withPins?'passed':'not applicable',managerReadiness:withPins?'passed':'unavailable as expected',driverNavigation:'passed',errors});
      await driverPage.waitForLoadState('networkidle');await driverContext.close();
    }
    await browser.close();browser=null;
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} catch(e) {console.error(log.slice(-5000));if(activePage && !activePage.isClosed()){console.error((await activePage.locator('body').innerText()).slice(-5000));await activePage.screenshot({path:output+'/failure.png',fullPage:true});}throw e;}
finally {await browser?.close();server.kill();await bridge.stop();await runtime.stop();}
