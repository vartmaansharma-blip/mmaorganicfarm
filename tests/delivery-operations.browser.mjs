import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { createDatabase, callAs } from "./database/runtime.mjs";
import {
  startFixtureServer,
  sessionFor,
} from "./database/supabase-fixture-server.mjs";
const runtime = await createDatabase();
const { db } = runtime;
const bridge = await startFixtureServer(runtime.config);
const output = path.resolve("docs/screenshots/delivery-operations");
await mkdir(output, { recursive: true });
const port = 3165,
  base = `http://127.0.0.1:${port}`;
let serverLog = "";
let activeBrowser, activePage;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: bridge.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
      SUPABASE_SECRET_KEY: "local-service-fixture",
      CRON_SECRET: "local-browser-fixture-secret-at-least-32-characters",
      FARM_AUTOMATION_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (c) => (serverLog += c));
server.stderr.on("data", (c) => (serverLog += c));
const today = (
  await db.query("select (now() at time zone 'Asia/Kolkata')::date::text date")
).rows[0].date;
const tomorrow = (
  await db.query(
    "select ((now() at time zone 'Asia/Kolkata')::date+1)::text date",
  )
).rows[0].date;
const manager = randomUUID(),
  driver = randomUUID(),
  other = randomUUID(),
  owner = randomUUID();
const results = [];
await db.query(
  "insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x",
  [[manager, driver, other, owner]],
);
for (const [id, role] of [
  [manager, "manager"],
  [driver, "driver"],
  [other, "driver"],
  [owner, "admin"],
])
  await db.query("insert into farm_staff(user_id,role) values($1,$2)", [
    id,
    role,
  ]);
const area = (
  await db.query(
    "insert into delivery_areas(name,slug) values('Synthetic zone','browser-fixture') returning id",
  )
).rows[0].id;
const route = (
  await db.query(
    "insert into delivery_routes(area_id,name,code,stop_capacity) values($1,'Synthetic route','BROWSER',100) returning id",
    [area],
  )
).rows[0].id;
await db.query(
  "insert into delivery_dispatches(delivery_date,status,prepared_by,released_by,released_at) values($1,'released',$2,$2,now())",
  [today, manager],
);
await db.query(
  "insert into daily_route_assignments(delivery_date,route_id,driver_id,updated_by) values($1,$2,$3,$4)",
  [today, route, driver, manager],
);
async function seed(label, assigned = driver) {
  const user = randomUUID(),
    plan = randomUUID(),
    order = randomUUID();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [user, `${user}@fixture.invalid`, { full_name: label }],
  );
  await db.query(
    "update customer_profiles set address_line='Synthetic address, Test locality',phone='0000000000',delivery_instructions='Hand over only to the named recipient',delivery_area_id=$2,delivery_route_id=$3 where user_id=$1",
    [user, area, route],
  );
  await db.query(
    "insert into delivery_plans(id,user_id,status,start_date,bottle_choice) values($1,$2,'paused',$3,'return')",
    [plan, user, today],
  );
  await db.query(
    "insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,phone_snapshot,address_snapshot,start_date) values($1,$2,$3,'plan','paid','return',100,100,'0000000000','Synthetic address',$4)",
    [order, user, plan, today],
  );
  await db.query(
    "insert into payments(order_id,user_id,amount_paise,provider,status,provider_order_id) values($1,$2,100,'manual','captured',$3)",
    [order, user, order],
  );
  await db.query(
    "insert into weekly_delivery_items(plan_id,user_id,day_of_week,product_key,quantity,unit) values($1,$2,extract(isodow from $3::date)::int,'milk',2,'L')",
    [plan, user, tomorrow],
  );
  await db.query("update delivery_plans set status='active' where id=$1", [
    plan,
  ]);
  const delivery = (
    await db.query(
      "insert into daily_deliveries(plan_id,user_id,delivery_date,status,delivery_area_id,delivery_route_id,assigned_driver_id,customer_name,address_snapshot,phone_snapshot,bottle_choice,generated_by) values($1,$2,$3,'ready',$4,$5,$6,$7,'Synthetic address, Test locality','0000000000','return',$8) returning id",
      [plan, user, today, area, route, assigned, label, manager],
    )
  ).rows[0].id;
  await db.query(
    "insert into daily_delivery_items(delivery_id,product_key,quantity,unit) values($1,'milk',2,'L')",
    [delivery],
  );
  return { user, plan, id: delivery, label };
}
async function contextFor(browser, user, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  const session = sessionFor(user);
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  return context;
}
async function draftMonthlyCheckout(user) {
  const rules=[{id:"milk",quantity:1,repeat:"custom",firstDate:tomorrow,dates:[tomorrow]}];
  const plan=(await callAs(db,user,"select save_pending_monthly_plan($1,'new',$2) id",[tomorrow,JSON.stringify(rules)])).rows[0].id;
  const order=randomUUID();
  await db.query("insert into orders(id,user_id,delivery_plan_id,purchase_mode,status,bottle_choice,subtotal_paise,bottle_charge_paise,total_paise,milk_litres,start_date,phone_snapshot,address_snapshot) values($1,$2,$3,'plan','draft','new',6200,1000,7200,1,$4,'0000000000','Synthetic address')",[order,user,plan,tomorrow]);
  await db.query("insert into order_items(order_id,user_id,product_key,product_name,quantity,unit,unit_price_paise,line_total_paise,frequency,scheduled_days,delivery_date) values($1,$2,'milk','Fresh farm milk',1,'litre',6200,6200,'once','{}',$3)",[order,user,tomorrow]);
  return {plan,order};
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `document overflow at ${page.viewportSize().width}`,
  );
}
try {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch {}
    if (i === 119) throw Error(`Next start failed: ${serverLog}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal((await fetch(`${base}/api/cron/prepare-dispatch`)).status, 401);
  const nightly = await fetch(`${base}/api/cron/prepare-dispatch`, {
    headers: {
      Authorization:
        "Bearer local-browser-fixture-secret-at-least-32-characters",
    },
  });
  assert.equal(nightly.status, 200);
  assert.equal((await nightly.json()).status, "succeeded");
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (name === "webkit")
      await callAs(
        db,
        manager,
        "select close_delivery_day($1,'correction_required','Next synthetic browser scenario',$2)",
        [today, randomUUID()],
      );
    const failure = await seed(`Synthetic ${name} issue`),
      success = await seed(`Synthetic ${name} delivery`),
      foreign = await seed(`Private ${name} other route`, other);
    await callAs(
      db,
      manager,
      "select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",
      [[foreign.id], randomUUID()],
    );
    const browser = await engine.launch({ headless: true });
    activeBrowser = browser;
    const context = await contextFor(browser, driver);
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (e) =>
      errors.push(
        `${name} ${new URL(page.url()).pathname}: ${e.stack ?? e.message}`,
      ),
    );
    await page.goto(`${base}/farm/delivery-sheet?date=${today}`, {
      waitUntil: "networkidle",
    });
    await page.getByText(failure.label, { exact: false }).first().waitFor();
    await page
      .getByRole("link", { name: "Skip to workspace", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    assert.equal(new URL(page.url()).hash, "#farm-workspace");
    assert.equal(
      (await page.locator("main").innerText()).includes(foreign.label),
      false,
    );
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await mkdir("work", { recursive: true });
    await writeFile("work/driver-debug.html", await page.content());
    await page.goto(
      `${base}/farm/delivery-sheet?date=${today}&stop=${failure.id}`,
      { waitUntil: "networkidle" },
    );
    const failedStop = page
      .locator("li")
      .filter({ has: page.getByText(failure.label, { exact: true }) });
    assert.equal(await failedStop.count(), 1);
    await failedStop
      .locator("select[name=outcome]")
      .selectOption("attempt_failed");
    await failedStop.getByLabel("Issue reason").selectOption("gate_locked");
    await failedStop
      .getByLabel("Short note (optional)")
      .fill("Synthetic locked gate report");
    await page.screenshot({
      path: path.join(output, `${name}-driver-issue.png`),
      fullPage: true,
    });
    await failedStop
      .getByRole("button", { name: "Save issue", exact: true })
      .click();
    await failedStop
      .getByRole("status")
      .filter({ hasText: "Issue saved" })
      .waitFor();
    await page.goto(
      `${base}/farm/delivery-sheet?date=${today}&stop=${success.id}`,
      { waitUntil: "networkidle" },
    );
    const doneStop = page.locator(`#stop-${success.id}`);
    await doneStop.getByLabel(/Bottles collected/).fill("1");
    await doneStop
      .getByRole("button", { name: "Save delivered", exact: true })
      .click();
    await doneStop
      .getByRole("status")
      .filter({ hasText: "Delivery saved" })
      .waitFor();
    await doneStop
      .getByText("Customer asked for a change?", { exact: true })
      .click();
    await doneStop
      .getByLabel("Customer’s exact request")
      .fill("No milk tomorrow; please resume the following day.");
    await page.screenshot({
      path: path.join(output, `${name}-driver-request.png`),
      fullPage: true,
    });
    await doneStop
      .getByRole("button", { name: "Save customer request", exact: true })
      .click();
    await doneStop
      .getByRole("status")
      .filter({ hasText: "Request saved" })
      .waitFor();
    const driverGuard=await context.newPage();
    await driverGuard.goto(`${base}/farm/exceptions`, { waitUntil: "networkidle" });
    assert.match(driverGuard.url(), /delivery-sheet/, "driver manager-route guard");
    await driverGuard.close();
    const managerContext = await contextFor(browser, manager, 1440);
    const mp = await managerContext.newPage();
    activePage = mp;
    mp.on("pageerror", (e) =>
      errors.push(
        `${name} ${new URL(mp.url()).pathname}: ${e.stack ?? e.message}`,
      ),
    );
    await mp.goto(`${base}/farm/cancellations`, { waitUntil: "networkidle" });
    const spoken = mp
      .locator("article")
      .filter({ has: mp.getByText(success.label, { exact: true }) });
    await spoken
      .getByText("No milk tomorrow; please resume the following day.", {
        exact: false,
      })
      .waitFor();
    await spoken
      .getByLabel("Decision note")
      .fill("Customer confirmed: skip milk tomorrow only");
    await mp.screenshot({
      path: path.join(output, `${name}-request-review.png`),
      fullPage: true,
    });
    await spoken
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await spoken.waitFor({ state: "detached" });
    assert.equal(
      (
        await db.query(
          "select status from delivery_customer_requests where user_id=$1",
          [success.user],
        )
      ).rows[0].status,
      "approved",
    );
    for (const [routePath, heading] of [
      ["/farm", "Today at the farm"],
      ["/farm/routes", "Routes"],
      ["/farm/capacity", "Production capacity"],
      ["/farm/locations", "Customers"],
      ["/farm/staff", "Farm staff"],
      ["/farm/cancellations", "Open requests"],
      ["/farm/orders", "Orders"],
      ["/farm/subscriptions", "Subscriptions"],
      ["/farm/bottles", "Bottles"],
      ["/farm/reports", "Operations report"],
      ["/farm/activity", "Automation & activity"],
      ["/farm/settings", "Settings"],
    ]) {
      await mp.goto(`${base}${routePath}`, { waitUntil: "networkidle" });
      await mp.getByRole("heading", { name: heading, exact: true, level:1 }).waitFor();
      assert.ok(await mp.getByRole("img", {name:"M’ma Farms",exact:true}).isVisible(), "brand visible on every farm page");
      await mp.screenshot({ path:path.join(output,`${name}-page-${routePath.split("/").at(-1)||"overview"}.png`),fullPage:true });
      await noOverflow(mp);
      assert.doesNotMatch(
        await mp.locator("main").innerText(),
        /NaN|Invalid Date/,
      );
      await mp.setViewportSize({ width: 320, height: 900 });
      await noOverflow(mp);
      await mp.setViewportSize({width:390,height:900});
      await mp.screenshot({ path:path.join(output,`${name}-mobile-page-${routePath.split("/").at(-1)||"overview"}.png`),fullPage:true });
      await mp.setViewportSize({ width: 1440, height: 900 });
    }
    await mp.goto(`${base}/farm/customers/${success.user}`,{waitUntil:"networkidle"});
    await mp.getByRole("heading",{level:1}).waitFor();
    await noOverflow(mp);
    await mp.screenshot({path:path.join(output,`${name}-page-customer.png`),fullPage:true});
    await mp.setViewportSize({width:320,height:900});
    await noOverflow(mp);
    await mp.setViewportSize({width:1440,height:900});
    await mp.goto(`${base}/farm/capacity?product=milk`,{waitUntil:"networkidle"});
    const normalEditor=mp.locator("details").filter({has:mp.locator("summary").getByText("Edit normal limit",{exact:true})});
    await normalEditor.locator("summary").click();
    const normalInput=mp.getByLabel("Litres per day",{exact:true}).first();
    await normalInput.fill("1001");
    await mp.getByRole("button",{name:"Update limit",exact:true}).click();
    await normalEditor.getByRole("status").filter({hasText:"Normal daily capacity updated"}).waitFor();
    assert.equal(new URL(mp.url()).search,"?product=milk","capacity save must not navigate");
    assert.equal(Number((await db.query("select daily_limit from production_capacity where product_key='milk'")).rows[0].daily_limit),1001);
    await normalInput.fill("100001");
    await mp.getByRole("button",{name:"Update limit",exact:true}).click();
    await normalEditor.getByRole("alert").waitFor();
    assert.equal(await normalInput.inputValue(),"100001","server error preserves entered capacity");
    await normalInput.fill("1001");
    await mp.getByRole("button",{name:"Update limit",exact:true}).click();
    await normalEditor.getByRole("status").waitFor();
    await mp.getByRole("button",{name:/Edit capacity for/}).nth(5).click();
    const dateInput=mp.getByRole("spinbutton",{name:/Capacity for/});
    const editForm=mp.locator("form").filter({has:dateInput});
    await dateInput.fill("777");
    await editForm.getByRole("button",{name:"Save day limit",exact:true}).scrollIntoViewIfNeeded();
    const beforeSave=await mp.evaluate(()=>scrollY);
    await editForm.getByRole("button",{name:"Save day limit",exact:true}).click();
    await editForm.getByRole("status").filter({hasText:"Capacity for that date was saved"}).waitFor();
    const afterSave=await mp.evaluate(()=>scrollY);
    assert.ok(beforeSave>100 && Math.abs(afterSave-beforeSave)<60,`capacity row save preserves scroll (${beforeSave} -> ${afterSave})`);
    assert.equal(Number(await dateInput.inputValue()),777);
    assert.equal(new URL(mp.url()).search,"?product=milk");
    await mp.screenshot({path:path.join(output,`${name}-capacity-edit.png`),fullPage:true});
    await mp.getByRole("button",{name:"Use normal limit",exact:true}).first().click();
    await mp.getByRole("status").filter({hasText:"The normal daily limit is active again"}).waitFor();
    await mp.setViewportSize({width:390,height:900});
    await noOverflow(mp);
    await mp.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
    const pull=async(repeat=1)=>mp.evaluate(repeat=>{
      const target=document.querySelector("main h1");
      const point=y=>({identifier:1,target,clientX:130,clientY:y});
      const dispatch=(type,touches)=>{
        const event=new Event(type,{bubbles:true,cancelable:true});
        Object.defineProperty(event,"touches",{value:touches});
        target.dispatchEvent(event);
      };
      for(let i=0;i<repeat;i++) {
        dispatch("touchstart",[point(140)]);
        dispatch("touchmove",[point(280)]);
        dispatch("touchend",[]);
      }
    },repeat);
    let refreshRequests=0;
    const countRefresh=request=>{if(request.method()==="GET" && new URL(request.url()).pathname==="/farm/capacity" && request.headers().rsc==="1") refreshRequests++;};
    mp.on("request",countRefresh);
    await pull(2);
    await mp.getByRole("status").filter({hasText:"Page updated"}).waitFor();
    assert.equal(refreshRequests,1,"repeated gestures coalesce into one refresh");
    mp.off("request",countRefresh);
    await managerContext.setOffline(true);
    await pull();
    await mp.getByRole("status").filter({hasText:"You’re offline"}).waitFor();
    await managerContext.setOffline(false);
    assert.equal(new URL(mp.url()).pathname,"/farm/capacity","pull refresh stays on current page");
    assert.equal(new URL(mp.url()).search,"?product=milk","pull refresh preserves product scope");
    await normalInput.fill("999");
    await mp.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
    await pull();
    await mp.getByRole("status").filter({hasText:"Save your unfinished edit"}).waitFor();
    assert.equal(await normalInput.inputValue(),"999","pull does not erase unsaved edit");
    await mp.screenshot({path:path.join(output,`${name}-capacity-mobile.png`),fullPage:true});
    await mp.setViewportSize({width:1440,height:900});
    const managerGuard=await managerContext.newPage();
    await managerGuard.goto(`${base}/farm/payments`, {waitUntil:"networkidle"});
    assert.equal(new URL(managerGuard.url()).pathname,"/farm","manager cannot open owner finance");
    await managerGuard.close();
    await mp.goto(`${base}/farm`, { waitUntil: "networkidle" });
    await mp.screenshot({
      path: path.join(output, `${name}-dashboard-overview.png`),
      fullPage: true,
    });
    const workspaceBefore = await mp.locator("#farm-workspace").boundingBox();
    await mp.getByRole("button", { name: "Collapse navigation", exact: true }).click();
    await mp.getByRole("button", { name: "Expand navigation", exact: true }).waitFor();
    await mp.waitForFunction(() => document.querySelector("#farm-workspace").getBoundingClientRect().left < 100);
    const workspaceAfter = await mp.locator("#farm-workspace").boundingBox();
    assert.ok(workspaceAfter.width > workspaceBefore.width + 100, "collapsing navigation returns workspace width");
    assert.equal(await mp.getByRole("navigation", { name: "Farm operations", exact: true }).getByRole("link", { name: "Routes", exact: true }).count(), 1);
    await noOverflow(mp);
    await mp.screenshot({ path: path.join(output, `${name}-dashboard-collapsed.png`), fullPage: true });
    await mp.getByRole("button", { name: "Expand navigation", exact: true }).click();
    await mp.setViewportSize({ width: 390, height: 900 });
    await mp.getByRole("button", {name:"Open navigation",exact:true}).click();
    await mp.keyboard.press("Escape");
    await mp.getByRole("button", {name:"Open navigation",exact:true}).waitFor();
    assert.ok(await mp.getByRole("button", {name:"Open navigation",exact:true}).evaluate(element=>document.activeElement===element),"Escape returns focus to mobile menu button");
    await mp.getByRole("button", {name:"Open navigation",exact:true}).click();
    await mp.getByRole("navigation", { name: "Farm operations", exact: true }).getByRole("link", { name: "Routes", exact: true }).click();
    await mp.getByRole("heading", { name: "Routes", exact: true }).waitFor();
    await mp.waitForLoadState("networkidle");
    assert.equal(await mp.getByRole("button", {name:"Open navigation",exact:true}).getAttribute("aria-expanded"),"false", "mobile navigation closes after selection");
    await mp.goto(`${base}/farm`, { waitUntil: "networkidle" });
    await noOverflow(mp);
    await mp.screenshot({
      path: path.join(output, `${name}-dashboard-mobile.png`),
      fullPage: true,
    });
    await mp.setViewportSize({ width: 1440, height: 900 });
    await mp.goto(`${base}/farm/exceptions?date=${today}`, {
      waitUntil: "networkidle",
    });
    await mp
      .getByRole("heading", { name: failure.label, exact: true })
      .waitFor();
    await noOverflow(mp);
    await mp.screenshot({
      path: path.join(output, `${name}-exception-queue.png`),
      fullPage: true,
    });
    const item = mp.locator("article").filter({
      has: mp.getByRole("heading", { name: failure.label, exact: true }),
    });
    await item.getByLabel("Future follow-up date").fill(tomorrow);
    await item
      .getByLabel("Decision reason")
      .fill("Retain prepaid obligation and follow up tomorrow");
    await item
      .getByRole("button", { name: "Save decision", exact: true })
      .click();
    await mp.getByText("No visits match these filters.").waitFor();
    await mp.goto(`${base}/farm/reconciliation?date=${today}`, {
      waitUntil: "networkidle",
    });
    await mp
      .getByRole("heading", {
        name: /Ready for manager review|Correction review open/,
        exact: true,
      })
      .waitFor();
    await mp.screenshot({
      path: path.join(output, `${name}-reconciliation-ready.png`),
      fullPage: true,
    });
    await mp
      .getByLabel("Closeout note and acknowledged follow-ups")
      .fill(
        "Reviewed deliveries, documented bottles and tracked prepaid follow-up",
      );
    await mp.getByRole("button", { name: "Close day", exact: true }).click();
    await mp
      .getByRole("heading", { name: "Day closed", exact: true })
      .waitFor();
    await mp.locator("summary").filter({ hasText: "closed" }).first().click();
    await mp.screenshot({
      path: path.join(output, `${name}-closed-history.png`),
      fullPage: true,
    });
    await mp.setViewportSize({ width: 320, height: 900 });
    await noOverflow(mp);
    const ownerContext = await contextFor(browser, owner, 1440);
    const ownerPage = await ownerContext.newPage();
    activePage=ownerPage;
    ownerPage.on("pageerror",error=>errors.push(error.message));
    await ownerPage.goto(`${base}/farm/payments`, { waitUntil: "networkidle" });
    await ownerPage
      .getByRole("heading", { name: "Finance", exact: true })
      .waitFor();
    await noOverflow(ownerPage);
    await ownerPage.screenshot({path:path.join(output,`${name}-page-finance.png`),fullPage:true});
    await ownerPage.setViewportSize({width:320,height:900});
    await noOverflow(ownerPage);
    await ownerPage.goto(`${base}/farm/settings`,{waitUntil:"networkidle"});
    const priceField=ownerPage.getByLabel("Fresh milk price in rupees",{exact:true});
    await priceField.fill("63.37");
    await ownerPage.getByLabel("Reason for change",{exact:true}).fill("Synthetic owner price verification");
    await ownerPage.getByRole("button",{name:"Save product prices",exact:true}).click();
    await ownerPage.getByRole("status").filter({hasText:"Product prices saved"}).waitFor();
    assert.equal((await db.query("select prices->>'milk' amount from farm_catalog_prices")).rows[0].amount,"6337");
    assert.equal(new URL(ownerPage.url()).pathname,"/farm/settings");
    await ownerPage.screenshot({path:path.join(output,`${name}-editable-prices-mobile.png`),fullPage:true});
    await noOverflow(ownerPage);
    await ownerPage.goto(`${base}/shop/milk`,{waitUntil:"networkidle"});
    assert.match(await ownerPage.locator("main").innerText(),/63.37/);
    await ownerPage.goto(`${base}/farm/settings`,{waitUntil:"networkidle"});
    await ownerPage.getByLabel("Fresh milk price in rupees",{exact:true}).fill("62");
    await ownerPage.getByLabel("Reason for change",{exact:true}).fill("Restore synthetic fixture catalogue");
    await ownerPage.getByRole("button",{name:"Save product prices",exact:true}).click();
    await ownerPage.getByRole("status").filter({hasText:"Product prices saved"}).waitFor();
    await ownerPage.goto(`${base}/farm/payments`,{waitUntil:"networkidle"});
    const receipt=ownerPage.locator("details").filter({has:ownerPage.locator("summary").getByText("Edit receipt details",{exact:true})}).first();
    await receipt.locator("summary").click();
    await receipt.getByLabel("Reference",{exact:true}).fill("SYNTHETIC-CORRECTION");
    await receipt.getByLabel("Reason for correction",{exact:true}).fill("Correct synthetic receipt reference");
    await receipt.getByRole("button",{name:"Save receipt details",exact:true}).click();
    await ownerPage.getByRole("status").filter({hasText:"Receipt details corrected"}).waitFor();
    assert.equal((await db.query("select count(*) n from farm_change_log where action='correct_receipt'")).rows[0].n,name==='chromium'?'1':'2');
    await ownerPage.screenshot({path:path.join(output,`${name}-editable-receipt-mobile.png`),fullPage:true});
    await noOverflow(ownerPage);
    await ownerPage.goto(`${base}/farm/customers/${success.user}`,{waitUntil:"networkidle"});
    const quantities=ownerPage.locator("#quantity-editor");
    await quantities.getByRole("heading",{name:"Edit prepaid quantities"}).waitFor();
    await quantities.getByLabel("Adjustment type",{exact:true}).selectOption("skip");
    await quantities.getByLabel("Reason",{exact:true}).fill("Synthetic customer requested a full skip");
    await quantities.getByRole("button",{name:"Save quantity change",exact:true}).click();
    await quantities.getByRole("status").filter({hasText:"Prepaid quantities updated"}).waitFor();
    assert.equal((await db.query("select action from delivery_exceptions where plan_id=$1 and delivery_date=$2 and product_key='milk'",[success.plan,tomorrow])).rows[0].action,"skip");
    await ownerPage.screenshot({path:path.join(output,`${name}-editable-quantity-mobile.png`),fullPage:true});
    await noOverflow(ownerPage);
    await ownerContext.close();
    const customerContext = await contextFor(browser, failure.user);
    const cp = await customerContext.newPage();
    await cp.goto(`${base}/account?section=deliveries`, { waitUntil: "networkidle" });
    await cp
      .getByRole("region", { name: "Confirmed delivery outcomes" })
      .getByText(/Attempt failed/)
      .waitFor();
    await cp
      .getByRole("region", { name: "Confirmed delivery outcomes" })
      .getByText(/retained/)
      .waitFor();
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [failure.plan],
        )
      ).rows[0].delivered_deliveries,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select delivered_deliveries from delivery_plans where id=$1",
          [success.plan],
        )
      ).rows[0].delivered_deliveries,
      1,
    );
    await cp.locator("summary").filter({hasText:"Cancel plan"}).click();
    await cp.getByRole("button",{name:"Cancel plan now",exact:true}).click();
    await cp.getByText("Your plan is cancelled. No farm approval is needed.",{exact:true}).waitFor();
    assert.equal((await db.query("select status from delivery_plans where id=$1",[failure.plan])).rows[0].status,"cancelled");
    assert.equal((await db.query("select count(*) n from cancellation_requests where plan_id=$1 and status='requested'",[failure.plan])).rows[0].n,"0");
    await cp.screenshot({path:path.join(output,`${name}-customer-plan-cancelled.png`),fullPage:true});
    await cp.goto(`${base}/welcome-back`,{waitUntil:"networkidle"});
    assert.equal(await cp.getByLabel("Your personal, one-use code").count(),0,"no discount codes on the invitation page");
    await cp.getByRole("link",{name:"Plan my fresh start",exact:true}).waitFor();
    await noOverflow(cp);
    await cp.screenshot({path:path.join(output,`${name}-welcome-back-mobile.png`),fullPage:true});
    const {plan:monthPlan,order:monthOrder}=await draftMonthlyCheckout(failure.user);
    await cp.goto(`${base}/checkout/review?order=${monthOrder}`,{waitUntil:"networkidle"});
    assert.equal(await cp.getByRole("region",{name:"Your welcome-back offer",exact:true}).count(),0,"returning customer checkout has no coupon section");
    await cp.getByRole("button",{name:"Pay ₹72",exact:true}).waitFor();
    await noOverflow(cp);
    await cp.screenshot({path:path.join(output,`${name}-welcome-back-checkout-mobile.png`),fullPage:true});
    await cp.setViewportSize({width:1440,height:900});
    await cp.screenshot({path:path.join(output,`${name}-welcome-back-checkout-desktop.png`),fullPage:true});
    await cp.goto(`${base}/welcome-back`,{waitUntil:"networkidle"});
    assert.equal(await cp.getByLabel("Your personal, one-use code").count(),0);
    await cp.screenshot({path:path.join(output,`${name}-welcome-back-desktop.png`),fullPage:true});
    await cp.goto(`${base}/account?section=deliveries`,{waitUntil:"networkidle"});
    await cp.locator("summary").filter({hasText:"Cancel plan"}).click();
    await cp.getByRole("button",{name:"Cancel plan now",exact:true}).click();
    await cp.getByText("Your plan is cancelled. No farm approval is needed.",{exact:true}).waitFor();
    assert.equal((await db.query("select status from delivery_plans where id=$1",[monthPlan])).rows[0].status,"cancelled","monthly plans use the same immediate cancellation flow");
    assert.equal((await db.query("select count(*) n from private.welcome_back_offers where user_id=$1",[failure.user])).rows[0].n,"0","cancellations never mint discount offers");
    await cp.goto(`${base}/welcome-back`,{waitUntil:"networkidle"});
    assert.equal(await cp.getByLabel("Your personal, one-use code").count(),0,"second cancellation must not show the first unused code");
    const nextCheckout=await draftMonthlyCheckout(failure.user);
    await cp.goto(`${base}/checkout/review?order=${nextCheckout.order}`,{waitUntil:"networkidle"});
    assert.equal(await cp.getByRole("region",{name:"Your welcome-back offer",exact:true}).count(),0,"coupon section hidden after second cancellation");
    await cp.screenshot({path:path.join(output,`${name}-second-cancellation-no-coupon.png`),fullPage:true});
    const newUser=randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)",[newUser,`${newUser}@fixture.invalid`]);
    const newCheckout=await draftMonthlyCheckout(newUser);
    const newContext=await contextFor(browser,newUser),newPage=await newContext.newPage();
    await newPage.goto(`${base}/checkout/review?order=${newCheckout.order}`,{waitUntil:"networkidle"});
    assert.equal(await newPage.getByRole("region",{name:"Your welcome-back offer",exact:true}).count(),0,"coupon section hidden for a first-time customer");
    await noOverflow(newPage);
    await newPage.screenshot({path:path.join(output,`${name}-new-customer-no-coupon.png`),fullPage:true});
    await newContext.close();
    assert.deepEqual(errors, []);
    results.push({
      engine: name,
      widths: [320, 375, 390, 430, 1440],
      journey: "passed",
      runtimeErrors: errors,
    });
    await customerContext.close();
    await managerContext.close();
    await context.close();
    await browser.close();
  }
  await writeFile(
    path.join(output, "browser-results.json"),
    JSON.stringify(
      {
        boundary:
          "Production Next pages and server actions with native PostgreSQL; test-only auth/REST HTTP adapter. Hosted GoTrue/PostgREST not exercised.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} catch (error) {
  console.error(error);
  await writeFile(
    "work-browser-failure.log",
    String(error.stack) + "\n" + serverLog,
  );
  if (activePage)
    await writeFile("work/driver-debug.html", await activePage.content()).catch(
      () => {},
    );
  if (activeBrowser) await activeBrowser.close();
  throw error;
} finally {
  server.kill("SIGTERM");
  await bridge.stop();
  await runtime.stop();
}
