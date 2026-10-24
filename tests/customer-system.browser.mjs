import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit } from 'playwright';
const project = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(project, 'tests/fixtures/customer-system');
const output = path.resolve(process.env.CUSTOMER_ARTIFACT_DIR || 'work/customer-system-verification');
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, root: fixture, publicDir: path.join(project, 'public'), plugins: [react()], resolve: { alias: { '@': project, 'next/image': path.join(fixture, 'image-adapter.tsx'), 'next/link': path.join(fixture, 'link-adapter.tsx') }, dedupe: ['react','react-dom'] }, optimizeDeps: { force: true, exclude: ['next/image','next/link'] }, server: { port: 3117, host: '127.0.0.1', fs: { allow: [project] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const results = [];
try {
 for(const engine of (process.env.HERO_BROWSERS||'chromium,webkit').split(',')) {
  const browser = await ({chromium,webkit})[engine].launch();
  try {
   for(const width of [320,375,390,430,768,1024,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<769});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const theme of ['dark','light']) {
     await page.goto(base,{waitUntil:'networkidle'});await page.waitForSelector('#build-order');
     if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Switch to .* mode/}).click();
     await page.getByRole('button',{name:'Scheduled plan',exact:true}).click();
     await page.getByRole('button',{name:'Increase Monday quantity'}).click();
     await page.getByRole('checkbox').first().check();
     const date=page.locator('input[type=date]');const savedDate=await date.inputValue();
     const snapshot=async()=>({quantity:await page.getByLabel('Monday quantity',{exact:true}).innerText(),date:await date.inputValue(),extras:await page.getByRole('checkbox').first().isChecked()});
     const before=await snapshot();
     await page.evaluate(()=>scrollTo({top:document.getElementById('weekly-quantity').getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
     const y=await page.evaluate(()=>scrollY);
     await page.getByRole('button',{name:/Switch to .* mode/}).click();
     assert.deepEqual(await snapshot(),before,'theme switch preserves the actual builder state');
     assert.equal(await page.evaluate(()=>scrollY),y,'theme switch preserves scroll');
     await page.getByRole('button',{name:/Switch to .* mode/}).click();
     assert.equal(await date.inputValue(),savedDate);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} builder overflow`);
     const tiny=await page.locator('#build-order button:visible').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.width<43.5||r.height<43.5}).map(e=>({label:e.getAttribute('aria-label')||e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
     assert.deepEqual(tiny,[],`${engine} ${width} scheduling tap targets`);
     const order=page.getByRole('link',{name:/Continue/}).last();
     assert.match(await order.getAttribute('href'),/schedule=2%2C1%2C1%2C1%2C1%2C2%2C2/,'whole-litre Monday change survives in the real order URL');
     if(width===390||width===1440){await page.locator('#weekly-quantity').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-schedule.png`)});}
     for(const view of ['order','account','calendar','checkout','success']) {
      await page.goto(`${base}?view=${view}`,{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view} ${width} overflow`);
      if(view==='order') {const input=page.getByRole('textbox',{name:'Address',exact:true});assert.ok((await page.locator('[class*=phoneField]').boundingBox()).height <= 60, 'phone field keeps a single comfortable input boundary');await input.fill('Changed synthetic address');await page.getByRole('button',{name:/Switch to .* mode/}).click();assert.equal(await input.inputValue(),'Changed synthetic address');await page.getByRole('button',{name:/Switch to .* mode/}).click();}
      if(view==='checkout')assert.equal(await page.getByRole('button',{name:'Pay ₹620'}).isDisabled(),true,'unready payment stays disabled');
      if(width===390||width===1440)await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-${view}.png`),fullPage:true});
     }
     results.push({engine,width,theme,fixtures:6,realBuilderStatePreserved:true,wholeLitreSchedulePreserved:true,tapTargets:44,overflow:false});
    }
    assert.deepEqual(errors,[]);await context.close();
   }
  }finally{await browser.close();}
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify({scope:'Real client builder and checkout-disabled state; representative protected-page CSS fixtures, not authenticated backend acceptance.',results},null,2));
 console.log(JSON.stringify({checks:results.length,engines:[...new Set(results.map(r=>r.engine))],widths:7,fixtures:6,runtimeErrors:0}));
}finally{await server.close();}
