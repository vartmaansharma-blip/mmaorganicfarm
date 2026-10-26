import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { indiaDate } from '../lib/customer-delivery.ts';

// A local-only Supabase protocol fixture drives the actual built Next page and API.
// No production credentials, customers, writes, or checkout calls are used.
const output=path.resolve(process.env.ACCOUNT_ARTIFACT_DIR || 'work/account-verification');
await mkdir(output,{recursive:true});
const userId='00000000-0000-4000-8000-000000000001';
const planId='00000000-0000-4000-8000-000000000002';
const recordId='00000000-0000-4000-8000-000000000003';
const date=indiaDate();
const plus=n=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
let scenario='out', fail=false;
const requests=[];
const product=(key='milk',quantity=2,fulfilled_quantity=null)=>({product_key:key,product_name:key==='milk'?'Fresh milk':'Fresh paneer',quantity,unit:key==='milk'?'L':'kg',fulfilled_quantity});
const plan=()=>({id:planId,user_id:userId,status:scenario==='pending'?'pending_confirmation':scenario==='paused'?'paused':'active',start_date:date,billing_model:'calendar_month',period_end_exclusive:plus(30),purchased_deliveries:30,delivered_deliveries:0,bottle_choice:'return',weekly_delivery_items:[],scheduled_delivery_items:[0,1,2,3].map(n=>({...product(),delivery_date:plus(n)})),delivery_exceptions:[],delivery_pauses:[]});
const rows=()=>['none','pending','paused'].includes(scenario)?[]:[{id:recordId,user_id:userId,plan_id:planId,order_id:null,delivery_date:date,visit_key:'local-visit',status:({out:'out_for_delivery',preparing:'ready',delivered:'delivered',partial:'failed'})[scenario]??'planned',updated_at:new Date().toISOString(),delivery_confirmed:scenario==='delivered',delivered_confirmed_at:scenario==='delivered'?new Date().toISOString():null,replacement_of_delivery_id:null,fulfilment_root_id:null,daily_delivery_items:scenario==='partial'?[product('milk',2,2),product('paneer',.5,0)]:[product('milk',2,scenario==='delivered'?2:null)]}];
const user={id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Test Customer'},identities:[]};
const stub=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'); requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:req.method});
 res.setHeader('Content-Type','application/json');
 if(url.pathname==='/auth/v1/user'){res.end(JSON.stringify(user));return;}
 if(req.method!=='GET' && url.pathname!=='/rest/v1/rpc/get_customer_delivery_outcomes'){res.writeHead(405);res.end('{}');return;}
 if(url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/') && !url.pathname.endsWith('/farm_catalog_prices')) assert.equal(url.searchParams.get('user_id'),`eq.${userId}`,'every customer data query must be explicitly owned');
 let data=[];
 if(url.pathname.endsWith("/farm_catalog_prices"))data={revision:"00000000-0000-4000-8000-000000000099",prices:{milk:6200,paneer:20000,ghee:37500,bottle:1000}};
 if(url.pathname.endsWith('/customer_profiles'))data={full_name:'Test Customer',email:user.email,avatar_url:null,phone:'9000000000',address_line:'Synthetic test address',postal_code:'400001'};
 if(url.pathname.endsWith('/delivery_plans'))data=scenario==='none'?[]:[plan()];
 if(url.pathname.endsWith('/daily_deliveries')){
  if(fail){res.writeHead(503);res.end(JSON.stringify({message:'Synthetic delivery outage',code:'TEST'}));return;}
  data=rows();
  if(url.searchParams.get('status')==='eq.delivered')data=data.filter(r=>r.status==='delivered');
 }
 if(url.pathname.endsWith('/orders'))data=scenario==='none'?[]:[{id:'00000000-0000-4000-8000-000000000004',status:'paid',purchase_mode:'plan',total_paise:62000,paid_total_paise:62000,start_date:date,created_at:new Date().toISOString(),order_items:[{...product(),id:'item1'}]}];
 if(url.pathname.endsWith('/customer_notifications'))data=[{id:'update1',title:'Your plan is confirmed',message:'Your delivery dates are saved.',created_at:new Date().toISOString(),read_at:null}];
 if(url.pathname.endsWith('/rpc/get_customer_delivery_outcomes')) data=rows().map(r=>({delivery_date:date,visit_key:r.visit_key,outcome:scenario==='partial'?'partial':scenario==='delivered'?'delivered':'scheduled',resolution:scenario==='partial'?'rescheduled':null,follow_up_date:scenario==='partial'?plus(1):null,items:r.daily_delivery_items}));
 res.end(JSON.stringify(data));
});
await new Promise(resolve=>stub.listen(0,'127.0.0.1',resolve));
const stubPort=stub.address().port;
const appPort=Number(process.env.ACCOUNT_TEST_PORT || 3226);
const base=`http://127.0.0.1:${appPort}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${stubPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_account_fixture'},stdio:['ignore','pipe','pipe']});
let serverLog='';child.stdout.on('data',d=>serverLog+=d);child.stderr.on('data',d=>serverLog+=d);
const tokenPart=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const accessToken=`${tokenPart({alg:'HS256',typ:'JWT'})}.${tokenPart({sub:userId,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.fixture`;
const session={access_token:accessToken,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'local-fixture',user};
const sessionCookie={name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:base};
const results=[];
try{
 const deadline=Date.now()+30000;
 while(!serverLog.includes('Ready in')){if(child.exitCode!==null)throw new Error(serverLog);if(Date.now()>deadline)throw new Error(`Next server did not start: ${serverLog}`);await new Promise(r=>setTimeout(r,200));}
 for(const engine of (process.env.ACCOUNT_BROWSERS||'chromium,webkit').split(',')){
  const browser=await ({chromium,webkit})[engine].launch();
  try{
   const anonymous=await browser.newContext();const anonymousPage=await anonymous.newPage();await anonymousPage.goto(`${base}/account`);assert.match(anonymousPage.url(),/\/sign-in/);const unauth=await anonymousPage.request.get(`${base}/api/account/delivery`);assert.equal(unauth.status(),401);assert.match(unauth.headers()['cache-control'],/no-store/);await anonymous.close();
   for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([sessionCookie]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const theme of ['dark','light']){
     scenario='out';fail=false;await page.goto(`${base}/account`,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'On the way to you',exact:true}).waitFor();
     if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Switch to .* mode/}).click();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} ${theme} Today overflow`);
     assert.equal(await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'Today',exact:true}).getAttribute('aria-current'),'page');
     await page.locator('[data-scene-state]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-scene-state]').dataset.motion==='running');
     await page.getByRole('button',{name:'Pause animation',exact:true}).click();assert.equal(await page.locator('[data-scene-state]').getAttribute('data-motion'),'paused');await page.getByRole('button',{name:'Resume animation',exact:true}).click();
     if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-today.png`),fullPage:true});
     for(const section of ['Deliveries','Orders','Settings']){
      await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:section,exact:true}).click();await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${section} ${width} overflow`);
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      if(section==='Settings'){await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Update delivery details'}).getAttribute('href'),'/order');}
      if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-${section.toLowerCase()}.png`),fullPage:true});
     }
     results.push({engine,width,theme,sections:4,overflow:false});
    }
    assert.deepEqual(errors,[]);await context.close();
   }
   const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([sessionCookie]);const page=await context.newPage();
   for(const state of ['preparing','delivered','partial','none','pending','paused']){
    scenario=state;fail=false;await page.goto(`${base}/account`,{waitUntil:'networkidle'});
    const expected={preparing:'preparing',delivered:'delivered',partial:'attention',none:'none',pending:'setup',paused:'paused'}[state];assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),expected);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${state} overflow`);
    if(state==='pending'){assert.equal(await page.getByRole('link',{name:'Orders & payment →',exact:true}).getAttribute('href'),'/account?section=orders');assert.ok((await page.locator('[data-scene-state]').boundingBox()).height<110,'unconfirmed delivery scene stays compact');}
    if(state!=='out')assert.equal(await page.getByRole('button',{name:'Pause animation',exact:true}).count(),0);
    await page.screenshot({path:path.join(output,`${engine}-390-${state}.png`),fullPage:true});
   }
   scenario='out';await page.goto(`${base}/account`,{waitUntil:'networkidle'});fail=true;await page.getByRole('button',{name:'Refresh delivery updates',exact:true}).click();await page.getByText('Showing the last successful update',{exact:false}).waitFor();assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),'out');await page.screenshot({path:path.join(output,`${engine}-390-stale.png`),fullPage:true});
   fail=false;scenario='delivered';await page.getByRole('button',{name:'Refresh delivery updates',exact:true}).click();await page.getByRole('heading',{name:'Delivered today',exact:true}).waitFor();assert.equal(await page.getByText('Showing the last successful update',{exact:false}).count(),0);
   fail=true;await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),'error');assert.equal(await page.getByRole('heading',{name:'A quiet day at your doorstep',exact:true}).count(),0);fail=false;await page.getByRole('button',{name:'Try again →'}).click();await page.getByRole('heading',{name:'Delivered today',exact:true}).waitFor();
   scenario='out';await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`${base}/account`,{waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:'Pause animation',exact:true}).isVisible(),false);assert.deepEqual(await page.locator('[data-scene-state]').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
   await context.close();
  }finally{await browser.close();}
 }
 assert.ok(requests.some(r=>r.path.endsWith('/daily_deliveries')&&r.query.delivery_date==='lte.'+plus(60)&&r.query.is_test==='eq.false'));
 const postReads=requests.filter(r=>r.method==='POST');assert.ok(postReads.every(r=>r.path.endsWith('/rpc/get_customer_delivery_outcomes')),'fixture permits no production mutations');
 await writeFile(path.join(output,'results.json'),JSON.stringify({scope:'Actual built Next account page → authenticated API → local Supabase protocol fixture → real UI. Synthetic data only; live customer acceptance is separate.',results,states:6,errorRetention:true,retry:true,reducedMotion:true,anonymousGuard:true,ownedQueryCount:requests.filter(r=>r.path.startsWith('/rest/v1/')).length},null,2));
 console.log(JSON.stringify({layouts:results.length,sections:4,states:6,staleRetention:true,retry:true,reducedMotion:true,anonymousGuard:true,runtimeErrors:0}));
}finally{child.kill('SIGTERM');await new Promise(resolve=>stub.close(resolve));await writeFile(path.join(output,'server.log'),serverLog);}
