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
const fixtures = () => Array.from({ length: 22 }, (_, index) => ({
 id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
 title: ['Payment confirmed', 'Milk is on the way', 'Plan delivery scheduled', 'Delivery prepared', 'Delivery completed'][index] ?? `Delivery notice ${index}`,
 message: [
  'We received the payment for your prepaid delivery plan.',
  'Your fresh milk is with the delivery team.',
  'Your delivery date has been confirmed.',
  'The farm has prepared your milk for delivery.',
  'Your previous delivery was confirmed.',
 ][index] ?? 'A saved update from the farm.',
 kind: index === 0 ? 'payment_confirmed' : 'delivery_ready',
 order_id: index === 0 ? '00000000-0000-4000-8000-000000000004' : null,
 delivery_id: index === 1 || index === 3 ? recordId : null,
 created_at: new Date(Date.UTC(2026, 10, index < 4 ? 5 : 4, 5, 30 - index)).toISOString(),
 read_at: null,
}));
let notices = [];
let notificationOutage = false;
let notificationReadOutage = false;
let deliveryDetails={phone:'9000000000',address_line:'Synthetic test address',postal_code:'400001'};
const routeRefreshes=[];
const requests=[];
const product=(key='milk',quantity=2,fulfilled_quantity=null)=>({product_key:key,product_name:key==='milk'?'Fresh milk':'Fresh paneer',quantity,unit:key==='milk'?'L':'kg',fulfilled_quantity});
const extendedWeek=()=>['legacy-window','legacy-prepared'].includes(scenario);
const plan=()=>({id:planId,user_id:userId,status:scenario==='pending'?'pending_confirmation':scenario==='paused'?'paused':'active',start_date:date,billing_model:scenario==='legacy'||extendedWeek()?'milk_credits':'calendar_month',period_end_exclusive:plus(30),purchased_deliveries:30,delivered_deliveries:0,bottle_choice:'return',weekly_delivery_items:[],scheduled_delivery_items:(extendedWeek()?[1,2,9]:[0,1,2,3]).map(n=>({...product(),delivery_date:plus(n)})),delivery_exceptions:extendedWeek()?[{delivery_date:plus(1),product_key:'milk',action:'skip',quantity:null,unit:null}]:[],delivery_pauses:extendedWeek()?[{id:'pause1',start_date:plus(2),end_date:plus(2)}]:[]});
const rows=()=>['none','pending','paused','legacy-window'].includes(scenario)?[]:[{id:recordId,user_id:userId,plan_id:planId,order_id:null,delivery_date:scenario==='legacy-prepared'?plus(9):date,visit_key:'local-visit',status:({out:'out_for_delivery',preparing:'ready',delivered:'delivered',partial:'failed'})[scenario]??'planned',updated_at:new Date().toISOString(),delivery_confirmed:scenario==='delivered',delivered_confirmed_at:scenario==='delivered'?new Date().toISOString():null,replacement_of_delivery_id:null,fulfilment_root_id:null,daily_delivery_items:scenario==='partial'?[product('milk',2,2),product('paneer',.5,0)]:[product('milk',2,scenario==='delivered'?2:null)]}];
const user={id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Test Customer'},identities:[]};
const stub=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'); requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:req.method});
 res.setHeader('Content-Type','application/json');
 if(url.pathname==='/auth/v1/user'){res.end(JSON.stringify(user));return;}
 if(req.method==='PATCH' && url.pathname==='/rest/v1/customer_profiles'){
  assert.equal(url.searchParams.get('user_id'),`eq.${userId}`);
  let raw='';for await(const chunk of req)raw+=chunk;
  const {phone,address_line,postal_code}=JSON.parse(raw);
  deliveryDetails={phone,address_line,postal_code};
  res.end(JSON.stringify({user_id:userId}));return;
 }
 if(req.method==='PATCH' && url.pathname==='/rest/v1/customer_notifications'){
  assert.equal(url.searchParams.get('user_id'),`eq.${userId}`);
  assert.equal(url.searchParams.get('read_at'),'is.null');
  let raw='';for await(const chunk of req)raw+=chunk;
  const patch=JSON.parse(raw);
  assert.deepEqual(Object.keys(patch),['read_at']);
  if(notificationReadOutage){res.writeHead(503);res.end(JSON.stringify({message:'Synthetic notification write outage',code:'TEST'}));return;}
  const id=url.searchParams.get('id');
  for(const item of notices) if(!item.read_at && (!id || id===`eq.${item.id}`))item.read_at=patch.read_at;
  res.end('[]');return;
 }
 if(req.method==='POST' && url.pathname==='/rest/v1/rpc/refresh_customer_route'){
  let raw='';for await(const chunk of req)raw+=chunk;
  routeRefreshes.push(JSON.parse(raw));
  res.end('null');return;
 }
 if(!['GET','HEAD'].includes(req.method) && url.pathname!=='/rest/v1/rpc/get_customer_delivery_outcomes'){res.writeHead(405);res.end('{}');return;}
 if(url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/') && !url.pathname.endsWith('/farm_catalog_prices')) assert.equal(url.searchParams.get('user_id'),`eq.${userId}`,'every customer data query must be explicitly owned');
 let data=[];
 if(url.pathname.endsWith("/farm_catalog_prices"))data={revision:"00000000-0000-4000-8000-000000000099",prices:{milk:6200,paneer:20000,ghee:37500,bottle:1000}};
 if(url.pathname.endsWith('/customer_profiles'))data={full_name:'Test Customer',email:user.email,avatar_url:null,...deliveryDetails};
 if(url.pathname.endsWith('/delivery_plans')){
  data=scenario==='none'?[]:[plan()];
  const billing=url.searchParams.get('billing_model');
  if(billing)data=data.filter(item=>billing===`eq.${item.billing_model}`);
 }
 if(url.pathname.endsWith('/daily_deliveries')){
  if(fail){res.writeHead(503);res.end(JSON.stringify({message:'Synthetic delivery outage',code:'TEST'}));return;}
  data=rows();
  const exactDate=url.searchParams.get('delivery_date');
  if(exactDate?.startsWith('eq.'))data=data.filter(row=>row.delivery_date===exactDate.slice(3));
  if(url.searchParams.has('id'))data=data.filter(row=>url.searchParams.get('id')===`eq.${row.id}`);
  if(url.searchParams.get('status')==='eq.delivered')data=data.filter(r=>r.status==='delivered');
 }
 if(url.pathname.endsWith('/orders')) {
  const paid={id:'00000000-0000-4000-8000-000000000004',status:'paid',purchase_mode:'plan',total_paise:62000,paid_total_paise:62000,start_date:date,created_at:new Date().toISOString(),order_items:[{...product(),id:'item1'}]};
  const draft={...paid,id:'00000000-0000-4000-8000-000000000005',status:'draft',paid_total_paise:null,order_items:[{...product(),id:'item2',product_name:'Draft-only item'}]};
  const pending={...paid,id:'00000000-0000-4000-8000-000000000006',status:'pending_payment',paid_total_paise:null,order_items:[{...product(),id:'item3',product_name:'Pending checkout'}]};
  data=scenario==='none'?[]:extendedWeek()?[paid]:[paid,draft,pending];
  const status=url.searchParams.get('status')||'';
  if(status.startsWith('in.(')&&status.endsWith(')')) {
    const allowed=status.slice(4,-1).split(',');
    data=data.filter(order=>allowed.includes(order.status));
  }
  if(status.startsWith('eq.'))data=data.filter(order=>order.status===status.slice(3));
  if(url.searchParams.has('id'))data=data.filter(order=>url.searchParams.get('id')===`eq.${order.id}`);
  res.setHeader('content-range',data.length?'0-'+(data.length-1)+'/'+data.length:'*/0');
}
 if(url.pathname.endsWith('/customer_notifications')){
  if(notificationOutage){res.writeHead(503);res.end(JSON.stringify({message:'Synthetic notification outage',code:'TEST'}));return;}
  data=notices;
  if(url.searchParams.get('read_at')==='is.null')data=data.filter(item=>item.read_at===null);
  const kind=url.searchParams.get('kind');
  if(kind?.startsWith('in.('))data=data.filter(item=>kind.slice(4,-1).split(',').includes(item.kind));
  const cursor=url.searchParams.get('or')?.match(/created_at\.lt\.([^,]+)/)?.[1];
  if(cursor)data=data.filter(item=>item.created_at<cursor);
  res.setHeader('content-range',data.length?`0-${data.length-1}/${data.length}`:'*/0');
  if(url.searchParams.has('limit'))data=data.slice(0,Number(url.searchParams.get('limit')));
 }
 if(url.pathname.endsWith('/rpc/get_customer_delivery_outcomes')) data=rows().map(r=>({delivery_date:date,visit_key:r.visit_key,outcome:scenario==='partial'?'partial':scenario==='delivered'?'delivered':'scheduled',resolution:scenario==='partial'?'rescheduled':null,follow_up_date:scenario==='partial'?plus(1):null,items:r.daily_delivery_items}));
 res.end(JSON.stringify(data));
});
await new Promise(resolve=>stub.listen(Number(process.env.ACCOUNT_FIXTURE_PORT || 0),'127.0.0.1',resolve));
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
   const anonymous=await browser.newContext();
   const anonymousPage=await anonymous.newPage();
   await anonymousPage.goto(`${base}/account`);
   assert.match(anonymousPage.url(),/\/sign-in/);
   const unauth=await anonymousPage.request.get(`${base}/api/account/delivery`);
   assert.equal(unauth.status(),401);
   assert.match(unauth.headers()['cache-control'],/no-store/);
   await anonymousPage.goto(`${base}/account/notifications`);
   assert.equal(new URL(anonymousPage.url()).searchParams.get('next'),'/account/notifications');
   await anonymousPage.goto(`${base}/shop`);
   await anonymousPage.getByRole('button',{name:'Notifications',exact:true}).click();
   await anonymousPage.getByRole('dialog',{name:'Notifications'}).getByRole('link',{name:'Sign in to see your notifications'}).waitFor();
   await anonymousPage.goto(`${base}/contact`);
   assert.equal(await anonymousPage.locator('a[href="tel:+917546998822"]').count(),1);
   const contactChat=await anonymousPage.locator('a[href^="https://wa.me/"]').getAttribute('href');
   assert.equal(new URL(contactChat).pathname,'/917546998822');
   await anonymousPage.goto(`${base}/milk?edit=plan`);
   assert.equal(new URL(anonymousPage.url()).searchParams.get('next'),'/milk?edit=plan');
   await anonymous.close();
   for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([sessionCookie]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const theme of ['dark','light']){
     scenario='out';fail=false;await page.goto(`${base}/account`,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'On the way to you',exact:true}).waitFor();
     if(await page.locator('html').getAttribute('data-theme')!==theme){
      await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'Account',exact:true}).click();
      await page.getByRole('button',{name:/Switch to .* mode/}).click();
      await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'Today',exact:true}).click();
      await page.getByRole('heading',{name:'On the way to you',exact:true}).waitFor();
     }
     await page.waitForFunction(()=>!document.getAnimations().some(a=>a instanceof CSSTransition && ['color','background-color','border-color'].includes(a.transitionProperty) && a.playState==='running'));
     const navigationColour=await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'Today',exact:true}).evaluate(e=>{const probe=document.createElement('i');probe.style.color='var(--color-nav-active)';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {actual:getComputedStyle(e).color,expected};});
     assert.equal(navigationColour.actual,navigationColour.expected,'account navigation follows the shared brand palette');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine} ${width} ${theme} Today overflow`);
     assert.equal(await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'Today',exact:true}).getAttribute('aria-current'),'page');
     await page.locator('[data-scene-state]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-scene-state]').dataset.motion==='running');
     await page.getByRole('button',{name:'Pause animation',exact:true}).click();assert.equal(await page.locator('[data-scene-state]').getAttribute('data-motion'),'paused');await page.getByRole('button',{name:'Resume animation',exact:true}).click();
     if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-today.png`),fullPage:true});
     for(const section of ['Schedule','My Plans','Orders','Account']){
      await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:section,exact:true}).click();await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:section,exact:true}).and(page.locator('[aria-current=page]')).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${section} ${width} overflow`);
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      if(section==='Account'){await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();await page.getByText('Update delivery details',{exact:true}).waitFor();}
      if(section==='Orders') {
       const tabs=page.getByRole('navigation',{name:'Order status'});
       assert.equal(await tabs.getByRole('link',{name:'Paid orders'}).getAttribute('aria-current'),'page');
       assert.equal(await page.getByRole('heading',{name:'Paid purchases'}).count(),1);
       assert.equal(await page.getByText('Draft-only item').count(),0,'draft order must not appear in paid purchase history');
       if(width===390&&theme==='light') {
        await tabs.getByRole('link',{name:'To pay'}).click();
        await page.getByRole('heading',{name:'Payments needing attention'}).waitFor();
        assert.equal(await page.getByText('Draft-only item').count(),0,'draft must not pollute pending orders');
        await page.getByRole('link',{name:'Review and complete payment →'}).waitFor();
       }
      }
      if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-${section.toLowerCase()}.png`),fullPage:true});
     }
     results.push({engine,width,theme,sections:5,overflow:false});
    }
    assert.deepEqual(errors,[]);await context.close();
   }
   const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([sessionCookie]);const page=await context.newPage();
   deliveryDetails={phone:'9000000000',address_line:'Synthetic test address',postal_code:'400001'};
   await page.goto(`${base}/account?section=settings`);
   await page.getByText('Update delivery details',{exact:true}).click();
   await page.getByLabel('Mobile number').fill('9000000001');
   await page.getByLabel('Delivery address',{exact:true}).fill('New synthetic delivery address');
   await page.getByLabel('PIN code').fill('831001');
   await page.getByRole('button',{name:'Save delivery details'}).click();
   await page.getByText('Delivery details saved.',{exact:true}).waitFor();
   assert.deepEqual(deliveryDetails,{phone:'+919000000001',address_line:'New synthetic delivery address',postal_code:'831001'});
   assert.deepEqual(routeRefreshes.at(-1),{p_user_id:userId,p_force_reroute:true});
   scenario='legacy';
   await page.goto(`${base}/milk?edit=plan`);
   await page.waitForURL(url=>url.pathname==='/calendar' && url.searchParams.get('plan')===planId);
   await page.getByRole('link',{name:'Contact the farm to change your regular week'}).waitFor();
   scenario='out';
   await page.goto(`${base}/milk?edit=plan`);
   await page.waitForURL(url=>url.pathname==='/account' && url.searchParams.get('section')==='deliveries');
   await page.getByRole('navigation',{name:'Your account'}).getByRole('link',{name:'My Plans',exact:true}).and(page.locator('[aria-current=page]')).waitFor();
   for(const state of ['preparing','delivered','partial','none','pending','paused']){
    scenario=state;fail=false;await page.goto(`${base}/account`,{waitUntil:'networkidle'});
    const expected={preparing:'preparing',delivered:'delivered',partial:'attention',none:'none',pending:'setup',paused:'paused'}[state];assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),expected);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${state} overflow`);
    if(state==='pending'){assert.equal(await page.getByRole('link',{name:'Orders & payment →',exact:true}).getAttribute('href'),'/account?section=orders&order_view=pending');assert.ok((await page.locator('[data-scene-state]').boundingBox()).height<110,'unconfirmed delivery scene stays compact');}
    if(state!=='out')assert.equal(await page.getByRole('button',{name:'Pause animation',exact:true}).count(),0);
    await page.screenshot({path:path.join(output,`${engine}-390-${state}.png`),fullPage:true});
   }
   scenario='legacy-window';await page.goto(`${base}/account`,{waitUntil:'networkidle'});
   const week=page.getByRole('region',{name:'Coming up · 7 days'});
   assert.equal(await week.getByRole('button').count(),7);
   await week.getByRole('button',{name:/Skipped/}).click();
   const details=page.getByRole('dialog');
   await details.getByText('Skipped',{exact:true}).waitFor();
   await page.keyboard.press('Escape');
   await details.waitFor({state:'hidden'});
   await week.getByRole('button',{name:/Paused/}).waitFor();
   await page.getByRole('button',{name:'Manage delivery →'}).click();
   await details.getByText('Fresh milk',{exact:true}).waitFor();
   const quantity=details.getByRole('link',{name:/Review a milk quantity change/});
   const editorPath=`/calendar?plan=${planId}&date=${plus(9)}#quantity-change`;
   assert.equal(await quantity.getAttribute('href'),editorPath);
   await page.screenshot({path:path.join(output,`${engine}-390-delivery-details.png`)});
   await quantity.click();
   await page.waitForURL(url=>url.pathname==='/calendar'&&url.searchParams.get('date')===plus(9));
   assert.equal(await page.locator('#quantity-change input[name=date]').inputValue(),plus(9));
   await page.getByText(/goes to checkout for a price review/).waitFor();
   scenario='legacy-prepared';
   await page.getByRole('button',{name:'Skip this delivery day'}).click();
   await page.getByText(/This date has been prepared or paused/).waitFor();
   await page.getByText(/The farm has prepared this delivery/).waitFor();
   assert.equal(await page.getByRole('button',{name:'Save quantity'}).count(),0);
   scenario='out';notices=fixtures();
   await page.goto(`${base}/shop`);
   const bell=page.getByRole('button',{name:'Notifications, 22 unread'});
   await bell.focus();
   notificationOutage=true;
   await page.keyboard.press('Enter');
   const preview=page.getByRole('dialog',{name:'Notifications',exact:true});
   await preview.getByRole('alert').getByRole('button',{name:'Retry'}).waitFor();
   assert.equal(await page.locator('button[aria-label="Notifications, 22 unread"]').count(),1);
   notificationOutage=false;
   await preview.getByRole('button',{name:'Retry'}).click();
   await preview.getByRole('heading',{name:'Payment confirmed',exact:true}).waitFor();
   assert.equal(await preview.getByRole('listitem').count(),5);
   await page.screenshot({path:path.join(output,`${engine}-390-notification-preview.png`)});
   notificationReadOutage=true;
   await preview.getByRole('button',{name:'Mark Payment confirmed as read'}).click();
   await preview.getByRole('alert').getByText('The read status couldn’t be saved. Try again.').waitFor();
   assert.equal(notices[0].read_at,null);
   notificationReadOutage=false;
   await preview.getByRole('button',{name:'Mark Payment confirmed as read'}).click();
   await page.locator('button[aria-label="Notifications, 21 unread"]').waitFor({state:'attached'});
   await page.keyboard.press('Escape');
   await preview.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Notifications, 21 unread');
   const readBell=page.getByRole('button',{name:'Notifications, 21 unread'});
   await readBell.click();
   await preview.getByRole('heading',{name:'Payment confirmed',exact:true}).waitFor();
   const swipePreview = (x, y) => preview.getByRole('heading',{name:'Notifications',exact:true}).evaluate((heading, [dx,dy]) => {
     const start = {clientX: 24, clientY: 40};
     for (const [type, touches, changedTouches] of [
       ['touchstart', [start], [start]],
       ['touchend', [], [{clientX:start.clientX+dx,clientY:start.clientY+dy}]],
     ]) {
       const event = new Event(type, { bubbles:true, cancelable:true });
       Object.defineProperties(event, { touches:{ value:touches }, changedTouches:{ value:changedTouches } });
       heading.dispatchEvent(event);
     }
   }, [x,y]);
   await swipePreview(105,25);
   assert.ok(await preview.isVisible(),'horizontal movement keeps the notification panel open');
   await swipePreview(4,110);
   await preview.waitFor({state:'hidden'});
   await readBell.click();
   await preview.getByRole('heading',{name:'Payment confirmed',exact:true}).waitFor();
   await page.mouse.click(5,5);
   await preview.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Notifications, 21 unread');
   assert.equal(await page.getByRole('button',{name:/Open notification:/}).count(),0,'existing unread items never pop up on page entry');
   notices.unshift({ ...notices[0], id:'0ecfc66a-e2e0-439c-9bb3-95d5af93b602', kind:'delivery_change',
     title:'Delivery quantity updated', message:'Your prepaid milk was moved to the next delivery.', read_at:null,
     delivery_id:null, order_id:null, created_at:new Date(Math.max(Date.now(),Date.parse(notices[0].created_at)+60_000)).toISOString() });
   await page.evaluate(()=>window.dispatchEvent(new Event('mma:notifications-updated')));
   const banner = page.getByRole('button',{name:'Open notification: Delivery quantity updated'});
   await banner.waitFor();
   assert.equal(await page.getByRole('button',{name:/Open notification:/}).count(),1);
   await page.screenshot({path:path.join(output,`${engine}-390-notification-banner.png`),animations:"disabled"});
   await banner.click();
   await preview.getByRole('heading',{name:'Delivery quantity updated',exact:true}).waitFor();
   await preview.getByRole('button',{name:'Close notifications'}).click();
   await page.evaluate(()=>window.dispatchEvent(new Event('mma:notifications-updated')));
   await preview.waitFor({state:'hidden'});
   assert.equal(await banner.count(),0,'the same update does not reappear');
   notices.shift();
   await page.goto(`${base}/account/notifications`);
   await page.getByRole('heading',{name:'Notification Centre',exact:true}).waitFor();
   await page.getByRole('heading',{name:'Payment confirmed',exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:/November 2026/}).count(),2,'inbox groups notices by delivery time zone date');
   const earlier = page.locator('summary').filter({hasText:'1 earlier delivery update'});
   const earlierNotice = page.getByRole('heading',{name:'Delivery prepared',exact:true});
   assert.equal(await earlierNotice.isVisible(),false,'only the latest related notice is shown initially');
   await earlier.press('Enter');
   await earlierNotice.waitFor();
   await page.locator('summary').filter({hasText:'Hide earlier updates'}).press('Enter');
   await earlierNotice.waitFor({state:'hidden'});
   await page.locator('summary').filter({hasText:'1 earlier delivery update'}).evaluate(summary=>summary.blur());
   await page.setViewportSize({width:320,height:760});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'notification inbox fits a 320px viewport');
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:path.join(output,`${engine}-390-notification-centre.png`)});
   await page.setViewportSize({width:1440,height:960});
   await page.screenshot({path:path.join(output,`${engine}-1440-notification-centre.png`)});
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('link',{name:'Older notifications →'}).click();
   await page.getByRole('heading',{name:'Delivery notice 21',exact:true}).waitFor();
   await page.getByRole('link',{name:'Payments',exact:true}).click();
   await page.getByRole('button',{name:'View order →'}).click();
   await page.getByRole('heading',{name:'Order details',exact:true}).waitFor();
   await page.goto(`${base}/account/notifications?filter=deliveries`);
   await page.getByRole('article',{name:'Milk is on the way',exact:true}).click({position:{x:80,y:36}});
   await page.locator('#selected-delivery').getByText('Fresh milk', {exact:false}).waitFor();
   await page.goto(`${base}/account/notifications`);
   await page.getByRole('button',{name:'Mark all as read'}).click();
   await page.getByText('All read',{exact:true}).waitFor();
   assert.equal(notices.filter(item=>!item.read_at).length,0);
   scenario='out';await page.goto(`${base}/account`,{waitUntil:'networkidle'});fail=true;await page.getByRole('button',{name:'Refresh delivery updates',exact:true}).click();await page.getByText('Showing the last successful update',{exact:false}).waitFor();assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),'out');await page.screenshot({path:path.join(output,`${engine}-390-stale.png`),fullPage:true});
   fail=false;scenario='delivered';await page.getByRole('button',{name:'Refresh delivery updates',exact:true}).click();await page.getByRole('heading',{name:'Delivered today',exact:true}).waitFor();assert.equal(await page.getByText('Showing the last successful update',{exact:false}).count(),0);
   fail=true;await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-delivery-state]').getAttribute('data-delivery-state'),'error');assert.equal(await page.getByRole('heading',{name:'A quiet day at your doorstep',exact:true}).count(),0);fail=false;await page.getByRole('button',{name:'Try again →'}).click();await page.getByRole('heading',{name:'Delivered today',exact:true}).waitFor();
   scenario='out';await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`${base}/account`,{waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:'Pause animation',exact:true}).isVisible(),false);assert.deepEqual(await page.locator('[data-scene-state]').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
   await context.close();
  }finally{await browser.close();}
 }
 assert.ok(requests.some(r=>r.path.endsWith('/daily_deliveries')&&r.query.delivery_date==='lte.'+plus(60)&&r.query.is_test==='eq.false'));
 const postReads=requests.filter(r=>r.method==='POST');assert.ok(postReads.every(r=>r.path.endsWith('/rpc/get_customer_delivery_outcomes')||r.path.endsWith('/rpc/refresh_customer_route')),'fixture permits no order or payment writes');
 await writeFile(path.join(output,'results.json'),JSON.stringify({scope:'Actual built Next account page → authenticated API → local Supabase protocol fixture → real UI. Synthetic data only; live customer acceptance is separate.',results,states:6,errorRetention:true,retry:true,reducedMotion:true,anonymousGuard:true,ownedQueryCount:requests.filter(r=>r.path.startsWith('/rest/v1/')).length},null,2));
 console.log(JSON.stringify({layouts:results.length,sections:5,states:6,staleRetention:true,retry:true,reducedMotion:true,anonymousGuard:true,runtimeErrors:0}));
}finally{child.kill('SIGTERM');await new Promise(resolve=>stub.close(resolve));await writeFile(path.join(output,'server.log'),serverLog);}
