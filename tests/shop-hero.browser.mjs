import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';

const port = process.env.SHOP_HERO_PORT || '3111';
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.SHOP_HERO_ARTIFACT_DIR || 'work/shop-hero-review');
await mkdir(output, { recursive: true });
const fixture = process.env.BASE_URL ? null : await startPublicCatalogueFixture();
let log = '';
const server = process.env.BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port], {env:{...process.env,...fixture.env},stdio:['ignore','pipe','pipe']});
server?.stdout.on('data', data => {log += data;});
server?.stderr.on('data', data => {log += data;});
const results = [];
const slide = (page, id) => page.waitForFunction(id => document.querySelector('[data-shop-hero]')?.dataset.slide === id, id);
const settled = page => page.waitForTimeout(1600);
try {
  for (let i=0;i<100;i++) {
    if (server && server.exitCode !== null) throw new Error(log);
    try {if ((!server || /Ready in/.test(log)) && (await fetch(base+'/shop')).ok) break;} catch {}
    if (i===99) throw new Error('Owned shop preview did not start');
    await new Promise(resolve => setTimeout(resolve,200));
  }
  for (const [engine, driver] of Object.entries({chromium,webkit})) {
    const browser = await driver.launch();
    try {
      for (const width of [320,390,768,1440]) for (const theme of ['dark','light']) {
        const context = await browser.newContext({viewport:{width,height:width===320?700:960},...(width===390 && theme==='dark'?{recordVideo:{dir:path.join(output,'recordings'),size:{width,height:960}}}:{})});
        await context.addInitScript(theme => localStorage.setItem('mma-theme',theme), theme);
        const page=await context.newPage();
        const errors=[];page.on('pageerror', e=>errors.push(e.message));
        await page.goto(base+'/shop',{waitUntil:'networkidle'});
        if (await page.locator('html').getAttribute('data-theme')!==theme) await page.getByRole('button',{name:/Switch to .* mode/}).click();
        await page.locator('[data-shop-hero] img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
        await slide(page,'basket');
        await settled(page);
        assert.equal(await page.locator('[class*=heroPhoto]').getAttribute('href'),'#counter-title');
        assert.ok(await page.getByRole('img',{name:/woven basket/}).isVisible());
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const hero=page.locator('[data-shop-hero]');
        assert.ok(!(await hero.innerText()).includes('₹'), 'collection image has no invented bundle price');
        await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-basket.png`)});
        const photo=page.locator('[class*=heroPhoto]');
        await photo.click();
        await page.waitForFunction(()=>location.hash==='#counter-title');
        assert.ok(await page.getByRole('heading',{name:'From our counter.'}).isVisible());
        await page.goto(base+'/shop',{waitUntil:'networkidle'});
        await page.locator('[data-shop-hero] img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
        const box=await photo.boundingBox();
        for (const id of ['milk','paneer','ghee']) {
          await page.getByRole('button',{name:'Next product photograph',exact:true}).click();
          await slide(page,id);
          await page.waitForTimeout(180);
          const clip=await page.locator('[data-position="current"]').evaluate(e=>getComputedStyle(e).clipPath);
          assert.match(clip,/ellipse/, 'transition is a masked reveal rather than a whole-frame screen switch');
          await settled(page);
          const nextBox=await photo.boundingBox();
          assert.ok(Math.abs(box.width-nextBox.width)<1&&Math.abs(box.height-nextBox.height)<1,'the photographic frame remains fixed');
          assert.equal(await photo.getAttribute('href'),`/shop/${id}`);
        }
        assert.equal(await page.getByRole('button',{name:'Last product photograph'}).isDisabled(),true);
        assert.equal(await page.getByRole('button',{name:'Pause product photographs'}).isDisabled(),true);
        assert.deepEqual(errors,[]);
        await context.close();
        results.push({engine,width,theme,basketFirst:true,forwardOrder:['basket','milk','paneer','ghee'],fixedFrame:true,maskedReveal:true,runtimeErrors:0});
        console.log(`${engine} ${width} ${theme}: basket, reveal, forward controls passed`);
      }
      const context=await browser.newContext({viewport:{width:1440,height:960}}); const page=await context.newPage();
      await page.goto(base+'/shop',{waitUntil:'networkidle'});await page.locator('[data-shop-hero] img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
      await page.getByRole('button',{name:'Pause product photographs'}).click();await page.mouse.move(1,1);await page.locator('body').click({position:{x:1,y:1}});
      await page.waitForTimeout(6800);await slide(page,'basket');
      await page.getByRole('button',{name:'Play product photographs'}).click();await page.mouse.move(1,1);await page.locator('body').click({position:{x:1,y:1}});
      await slide(page,'milk');
      await page.getByRole('button',{name:'Next product photograph'}).focus();await page.mouse.move(1,1);await page.waitForTimeout(5800);await slide(page,'milk');
      await page.locator('body').click({position:{x:1,y:1}});
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
      await page.waitForTimeout(5800);await slide(page,'milk');
      await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
      await slide(page,'paneer');await page.getByRole('button',{name:'Next product photograph'}).click();await slide(page,'ghee');await page.locator('body').click({position:{x:1,y:1}});await page.mouse.move(1,1);
      await page.waitForTimeout(5800);await slide(page,'ghee');
      await context.close();
      const reduced=await browser.newContext({reducedMotion:'reduce'});const rp=await reduced.newPage();await rp.goto(base+'/shop',{waitUntil:'networkidle'});await settled(rp);await rp.waitForTimeout(6800);await slide(rp,'basket');
      assert.equal(await rp.getByRole('button',{name:'Pause product photographs'}).count(),0);
      assert.equal(await rp.locator('[class*=heroPhoto]').evaluate(e=>getComputedStyle(e).animationName),'none');
      await rp.getByRole('button',{name:'Next product photograph'}).click();await slide(rp,'milk');
      assert.equal(await rp.locator('[data-position="current"]').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
      await reduced.close();results.push({engine,lifecycle:'pause/play, keyboard focus, hidden/resume, no wrap, static reduced motion with manual next'});
    } finally {await browser.close();}
  }
} finally {server?.kill();fixture?.server.close();await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));}
