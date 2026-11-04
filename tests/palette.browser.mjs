import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';

// The actual built site, with read-only synthetic catalogue data. No live writes.
const output = path.resolve(process.env.PALETTE_ARTIFACT_DIR || 'work/palette-review');
await mkdir(output, { recursive: true });
const fixture = await startPublicCatalogueFixture();
const port = process.env.PALETTE_TEST_PORT || '3285';
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port], {env:{...process.env,...fixture.env},stdio:['ignore','pipe','pipe']});
let log = ''; server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
const results = [];
try {
  for (let i=0;i<150;i++) {
    if (server.exitCode !== null) throw Error(log);
    if (/Ready in/.test(log)) break;
    if (i===149) throw Error('Preview startup timed out: '+log);
    await new Promise(r=>setTimeout(r,200));
  }
  for (const [engine, driver] of Object.entries({chromium,webkit})) {
    const browser = await driver.launch();
    try {
      for (const width of [320,390,1440]) for (const theme of ['dark','light']) {
        const context = await browser.newContext({viewport:{width,height:width===320?740:960},reducedMotion:'reduce',colorScheme:'light'});
        await context.addInitScript(theme => localStorage.getItem('mma-theme') === null && localStorage.setItem('mma-theme',theme),theme);
        const page = await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
        for (const [name, route] of [['home','/'],['shop','/shop'],['milk','/shop/milk'],['sign-in','/sign-in']]) {
          await page.goto(base+route,{waitUntil:'networkidle'});
          await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(async image=>{image.loading='eager';try{await image.decode();}catch{}}));});
          assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
          assert.equal(await page.locator('html').evaluate((e,t)=>e.classList.contains(t),theme),true);
          const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,rect:e.getBoundingClientRect().toJSON()})).filter(e=>e.rect.right>innerWidth+1||e.rect.left < -1).slice(0,12)}));
          assert.ok(overflow.scrollWidth<=overflow.width,`${name} ${width}: ${JSON.stringify(overflow)}`);
          const contrast=await page.evaluate(()=>{
            const style=getComputedStyle(document.documentElement);
            const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
            const rgb=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>x/255);};
            const token=name=>rgb(style.getPropertyValue(name).trim());
            const lum=a=>a.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            const ratio=(a,b)=>{const x=lum(token(a)),y=lum(token(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
            return Object.fromEntries([['body','--color-text-primary','--color-background'],['muted','--color-text-secondary','--color-background'],['button','--color-action-primary-text','--color-action-primary'],['forest','--color-on-botanical','--color-section-botanical'],['feedback','--color-warning','--color-warning-surface']].map(([name,a,b])=>[name,ratio(a,b)]));
          });
          for (const [role, ratio] of Object.entries(contrast)) assert.ok(ratio>=4.5,`${name}/${theme}/${role}: ${ratio}`);
          if (name==='home') {
            const copy = await page.locator('main').innerText();
            assert.match(copy, /Build your monthly/);
            assert.doesNotMatch(copy, /30-delivery|moves to the end of your plan/i);
            const cta = page.locator('.closing-actions .button').first();
            assert.equal(await cta.evaluate(e => getComputedStyle(e).borderRadius), '999px');
            const banner=page.locator('.ticker');
            assert.equal(await banner.evaluate(e=>getComputedStyle(e).backgroundColor), await page.evaluate(()=>{const e=document.createElement('i');e.style.background='var(--color-action-primary)';document.body.append(e);const v=getComputedStyle(e).backgroundColor;e.remove();return v;}));
            assert.equal(await banner.locator('div').evaluate(e=>getComputedStyle(e).animationName),'none');
          }
          await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-${name}.png`),fullPage:true});
          if(name==='home'||name==='shop')await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-${name}-viewport.png`)});
          results.push({engine,width,theme,page:name,contrast,overflow:false});
        }
        await page.goto(base+'/shop',{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Open navigation menu'}).click();
        await page.getByRole('dialog').waitFor();
        await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}-navigation.png`)});
        await page.getByRole('button',{name:'Close navigation menu'}).click();
        await page.getByRole('button',{name:`Switch to ${theme==='dark'?'light':'dark'} mode`}).click();
        await page.reload({waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme==='dark'?'light':'dark');
        await page.goto(base+'/account',{waitUntil:'networkidle'});assert.match(page.url(),/\/sign-in/);
        assert.deepEqual(errors,[]);
        await context.close();
        console.log(`${engine} ${width} ${theme}: four pages, contrast, persistence and account guard passed`);
      }
      // Verify the actual public metadata returned by the production build.
      {
        const page = await browser.newPage();
        for (const route of ['/', '/shop', '/shop/milk', '/shop/paneer', '/shop/ghee', '/pricing', '/shipping', '/contact', '/terms', '/privacy', '/cancellation-refunds']) {
          await page.goto(base + route, { waitUntil: 'networkidle' });
          const expected = 'https://mmaorganicfarm.vercel.app' + (route === '/' ? '' : route);
          assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), expected, route);
          assert.equal(await page.locator('meta[property=\"og:url\"]').getAttribute('content'), expected, route);
          assert.ok(await page.locator('meta[property=\"og:title\"]').getAttribute('content'), route);
          assert.ok(await page.locator('meta[property=\"og:description\"]').getAttribute('content'), route);
        }
        await page.close();
      }
      // Fresh visits use light on either OS; an existing dark choice survives migration.
      for (const colorScheme of ['dark','light']) for (const legacy of [false,true]) {
        const context=await browser.newContext({colorScheme,reducedMotion:'reduce'});
        if(legacy) await context.addInitScript(()=>localStorage.setItem('mama-theme','dark'));
        const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('data-theme'),legacy?'dark':'light');
        await context.close();
      }
    } finally { await browser.close(); }
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
} finally { server.kill('SIGTERM'); fixture.server.close(); }
