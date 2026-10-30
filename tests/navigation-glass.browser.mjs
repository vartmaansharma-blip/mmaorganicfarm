import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { startPublicCatalogueFixture } from './helpers/public-catalogue-fixture.mjs';
const base=process.env.BASE_URL || 'http://127.0.0.1:3113';
const fixture=process.env.BASE_URL?null:await startPublicCatalogueFixture();
const server=process.env.BASE_URL?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3113'],{env:{...process.env,...fixture.env},stdio:'ignore'});
const output=process.env.GLASS_OUTPUT || 'work/glass-review';await mkdir(output,{recursive:true});
const results=[];
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
try {
 for(let i=0;i<100;i++){try{if((await fetch(base+'/shop')).ok)break;}catch{} await new Promise(r=>setTimeout(r,200));}
 for(const [engine,driver] of Object.entries({chromium,webkit})){
  const browser=await driver.launch();
  try{
   for(const width of [320,390,1440]) for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:width===320?568:960}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/shop',{waitUntil:'networkidle'});
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/Switch to .* mode/}).click();
    const toggle=page.getByRole('button',{name:'Open navigation menu'});await toggle.click();const dialog=page.getByRole('dialog');
    await dialog.evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
    const surface=await dialog.evaluate(e=>({background:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).backdropFilter||getComputedStyle(e).webkitBackdropFilter,box:e.getBoundingClientRect().toJSON(),radius:getComputedStyle(e).borderRadius}));
    if(!/rgba/.test(surface.background)||!surface.filter.includes('blur'))throw Error('Glass surface is not transparent and blurred');
    if(surface.box.x<8||surface.box.y<8||surface.box.right>width-8)throw Error('Floating sidebar does not fit viewport');
    await page.screenshot({path:`${output}/${engine}-${width}-${theme}.png`});
    const samples=[];
    for(const backdrop of ['#fff','#000']){
      const layer=await page.evaluateHandle(color=>{const e=document.createElement('div');e.style.cssText=`position:fixed;inset:0;background:${color};z-index:2147483647;pointer-events:none`;document.body.append(e);return e;},backdrop);
      await page.waitForTimeout(100);
      const links=await dialog.locator('nav a').evaluateAll(elements=>elements.map(e=>({color:getComputedStyle(e).color,box:e.getBoundingClientRect().toJSON()})));
      const buffer=await page.screenshot();const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
      for(const link of links){const x=Math.round(link.box.right-40),y=Math.round(link.box.y+link.box.height/2);if(y>=info.height)continue;const pixel=Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));const ink=link.color.match(/[\d.]+/g).slice(0,3).map(Number);samples.push({backdrop,contrast:+contrast(ink,pixel).toFixed(2)});}
      await layer.evaluate(e=>e.remove());
    }
    const minimum=Math.min(...samples.map(s=>s.contrast));
    if(minimum<4.5)throw Error(`${engine} ${width} ${theme}: link contrast ${minimum}`);
    for(let i=0;i<10;i++){await page.keyboard.press('Tab');if(!await page.evaluate(()=>!!document.activeElement.closest('dialog')))throw Error('Focus escaped menu');}
    await page.keyboard.press('Escape');if(await dialog.isVisible()||!await toggle.evaluate(e=>e===document.activeElement))throw Error('Escape/focus restoration failed');
    await toggle.click();await page.waitForTimeout(360);await page.mouse.click(3,180);if(await dialog.isVisible())throw Error('Backdrop closing failed');
    await toggle.click();await dialog.getByRole('link',{name:'Our Story',exact:false}).click();await page.waitForURL('**/#about');
    if(await dialog.isVisible()||await page.evaluate(()=>document.body.style.overflow==='hidden'))throw Error('Navigation cleanup failed');
    if(errors.length)throw Error(errors.join('\n'));
    results.push({engine,width,theme,surface,minimumContrast:minimum,focus:true,escape:true,backdrop:true,navigation:true});console.log(`${engine} ${width} ${theme}: glass, contrast ${minimum}, focus and navigation passed`);
    await context.close();
   }
   const context=await browser.newContext({reducedMotion:'reduce',contrast:'more'}),page=await context.newPage();await page.goto(base+'/shop',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Open navigation menu'}).click();
   const style=await page.getByRole('dialog').evaluate(e=>({animation:getComputedStyle(e).animationName,filter:getComputedStyle(e).backdropFilter||getComputedStyle(e).webkitBackdropFilter,background:getComputedStyle(e).backgroundColor}));
   if(style.animation!=='none'||style.filter!=='none'||style.background.startsWith('rgba'))throw Error('Accessibility fallback failed');
   results.push({engine,accessibility:style});await context.close();
  }finally{await browser.close();}
 }
}finally{server?.kill();fixture?.server.close();await writeFile(output+'/results.json',JSON.stringify(results,null,2));}
