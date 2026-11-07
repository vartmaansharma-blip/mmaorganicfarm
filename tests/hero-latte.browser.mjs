import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium, webkit } from 'playwright';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';

const output=path.resolve(process.env.LATTE_ARTIFACT_DIR || 'work/hero-verification/latte');
await mkdir(output,{recursive:true});
const port=process.env.LATTE_TEST_PORT || '3238', base=`http://127.0.0.1:${port}`;
const fixture=await startPublicCatalogueFixture();
let log='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{env:{...process.env,...fixture.env},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const results=[];
async function progress(page,p){
 await page.evaluate(p=>{const root=document.getElementById('home'),panel=root.firstElementChild,r=root.getBoundingClientRect(),h=parseFloat(getComputedStyle(panel).top)||0,travel=r.height-panel.offsetHeight;window.scrollTo({top:scrollY+r.top-h+travel*(.55+1.25*p)/1.8,behavior:'instant'});},p);
 try{await page.waitForFunction(p=>Math.abs(Number(document.getElementById('home').dataset.latteProgress)-p)<.005,p);}catch(error){console.log('progress failure',p,await page.evaluate(()=>({y:scrollY,root:document.getElementById('home')?.dataset,rect:document.getElementById('home')?.getBoundingClientRect().toJSON(),state:history.state,body:document.body.style.cssText})));throw error;}
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
async function outsideDifference(before,after,bounds){
 const a=await sharp(before).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(after).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);
 let outside=0,inside=0,maxOutsideDelta=0,maxInsideDelta=0;
 for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
  const i=(y*a.info.width+x)*4;
  if(a.data.subarray(i,i+4).equals(b.data.subarray(i,i+4)))continue;
  const sx=(x-bounds.x)/bounds.scale,sy=(y-bounds.y)/bounds.scale;
  if(((sx-650)/420)**2+((sy-602)/420)**2>1){outside++;for(let c=0;c<4;c++)maxOutsideDelta=Math.max(maxOutsideDelta,Math.abs(a.data[i+c]-b.data[i+c]));}else {inside++;for(let c=0;c<4;c++)maxInsideDelta=Math.max(maxInsideDelta,Math.abs(a.data[i+c]-b.data[i+c]));}
 }
 return {outside,inside,maxOutsideDelta,maxInsideDelta};
}
try{
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(log);if(/Ready in/.test(log)){try{if((await fetch(base)).ok)break;}catch{}}await new Promise(r=>setTimeout(r,200));if(i===99)throw Error(log);}
 for(const [engine,type]of Object.entries({chromium,webkit}).filter(([name])=>!process.env.LATTE_BROWSERS||process.env.LATTE_BROWSERS.split(',').includes(name))){
  const browser=await type.launch();
  const errors=[];
  try{
   for(const [width,height]of [[390,844],[1440,960]])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},colorScheme:theme});
    await context.addInitScript(theme=>{localStorage.setItem('mma-theme',theme);},theme);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.waitForFunction(()=>document.getElementById('home').dataset.assets==='ready');
    // Theme control uses the site's persisted choice rather than the OS alone.
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/ mode/}).click();
    await page.mouse.wheel(0,9000);
    await page.waitForFunction(()=>document.getElementById('home').dataset.state==='COMPLETED');
    const art=page.locator('[data-overhead-composition]');
    const frames=new Map();
    let fixedBase;
    for(const p of [0,.25,.5,.75,1]){
     await progress(page,p);
     assert.notEqual(await page.locator('#home').getAttribute('data-held'),'true','latte segment never locks scrolling');
     assert.equal(await page.evaluate(()=>document.body.style.position),'');
     const currentBase=await page.locator('[data-overhead-photo]').evaluate(e=>{const r=e.getBoundingClientRect();return{src:e.currentSrc,x:r.x,y:r.y,w:r.width,h:r.height,opacity:getComputedStyle(e.parentElement).opacity,transform:getComputedStyle(e.parentElement).transform};});
     if(fixedBase){for(const key of ['src','opacity','transform'])assert.equal(currentBase[key],fixedBase[key],`base ${key} stays fixed`);for(const key of ['x','y','w','h'])assert.ok(Math.abs(currentBase[key]-fixedBase[key])<.001,`base ${key} stays fixed within layout precision`);}else fixedBase=currentBase;
     const file=path.join(output,`${engine}-${width}-${theme}-${Math.round(p*100)}.png`);
     await page.screenshot({path:file});frames.set(p,await art.screenshot());await writeFile(file.replace(".png","-composition.png"),frames.get(p));
    }
    const bounds=await art.evaluate(e=>{const r=e.getBoundingClientRect(),scale=Math.min(r.width/1317,r.height/1194);return{x:(r.width-1317*scale)/2,y:(r.height-1194*scale)/2,scale};});
    await writeFile(path.join(output,`${engine}-${width}-${theme}-bounds.json`),JSON.stringify(bounds));
    const diffs=[];
    for(const p of [.25,.5,.75,1]){const diff=await outsideDifference(frames.get(0),frames.get(p),bounds);assert.ok(diff.maxOutsideDelta<=1,`outside art, allow at most one compositor channel level: ${JSON.stringify(diff)}`);assert.ok(diff.inside>0,'art develops spatially');diffs.push({progress:p,...diff});}
    await progress(page,.5);const reverse=await art.screenshot();await writeFile(path.join(output,`${engine}-${width}-${theme}-reverse-composition.png`),reverse);const reverseDiff=await outsideDifference(frames.get(.5),reverse,bounds);assert.ok(reverseDiff.maxInsideDelta<=1 && reverseDiff.maxOutsideDelta<=1,`reverse returns the same formation within compositor tolerance: ${JSON.stringify(reverseDiff)}`);
    await page.waitForTimeout(200);const midY=await page.evaluate(()=>scrollY);await page.reload();await page.waitForFunction(()=>document.getElementById('home').dataset.assets==='ready');console.log('reload position',engine,width,theme,{expected:midY,actual:await page.evaluate(()=>scrollY)});await page.waitForFunction(y=>Math.abs(scrollY-y)<3,midY);await page.waitForFunction(()=>Math.abs(Number(document.getElementById('home').dataset.latteProgress)-.5)<.005);
    await progress(page,0);await progress(page,1); // rapid jumps, no elapsed-time catch-up
    for(const p of [.85,.65,.45,.25,0])await progress(page,p);
    assert.equal(await page.locator('#home').getAttribute('data-state'),'COMPLETED','intro never replays when art reverses');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({engine,width,theme,diffs,reverse:true,reload:true,fastAndSlow:true});console.log(`${engine} ${width} ${theme} passed`);await writeFile(path.join(output,"results.json"),JSON.stringify(results,null,2));await context.close();
   }
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.getElementById('home').dataset.assets==='ready');assert.equal(await page.locator('#home').getAttribute('data-latte-progress'),'1.000');assert.equal(await page.locator('#home').evaluate(e=>e.offsetHeight===e.firstElementChild.offsetHeight),true);await page.screenshot({path:path.join(output,`${engine}-reduced-motion.png`)});await context.close();
   const noJs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});const staticPage=await noJs.newPage();await staticPage.goto(base);assert.equal(await staticPage.locator('[data-overhead-composition]').evaluate(e=>getComputedStyle(e).opacity),'1');await staticPage.screenshot({path:path.join(output,`${engine}-no-script.png`)});await noJs.close();
   assert.deepEqual(errors,[]);results.push({engine,reducedMotion:true,noJavaScript:true,runtimeErrors:0});
  }finally{await browser.close();}
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await writeFile(path.join(output,'server.log'),log);server.kill('SIGTERM');fixture.server.closeAllConnections();fixture.server.close();}
