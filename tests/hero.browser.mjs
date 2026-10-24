import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";

const port = process.env.HERO_TEST_PORT || "3101";
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.HERO_ARTIFACT_DIR || "work/hero-verification");
await mkdir(output, { recursive: true });
let server;
let serverLog = "";
const results = [];

if (!process.env.BASE_URL) {
  // Non-secret, deliberately unreachable fixture. Anonymous navigation needs no database.
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://hero-verification.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_hero_browser_fixture" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", chunk => { serverLog += chunk; });
  server.stderr.on("data", chunk => { serverLog += chunk; });
}

async function ready() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Preview did not start: ${serverLog}`);
}

async function scrollToProgress(page, progress) {
  await page.evaluate(p => {
    const root = document.getElementById("glass-story");
    const panel = root.firstElementChild;
    const rect = root.getBoundingClientRect();
    const header = parseFloat(getComputedStyle(panel).top) || 0;
    window.scrollTo({ top: scrollY + rect.top - header + p * (rect.height - panel.offsetHeight), behavior: "instant" });
  }, progress);
  await page.waitForFunction(p => Math.abs(Number(document.getElementById("glass-story").dataset.progress) - p) < .004, progress);
}

function contrast(foreground, background) {
  const luminance = hex => {
    const raw = hex.trim().replace('#', '');
    const expanded = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
    const rgb = hex.trim().startsWith('#') ? expanded.match(/.{2}/g).map(c => parseInt(c, 16) / 255) : hex.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255);
    const linear = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

async function verifyConnectedPages(browser, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const routes = ['/sign-in', '/forgot-password', '/reset-password', '/pricing', '/shipping', '/contact', '/terms', '/privacy', '/cancellation-refunds'];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const measured = [];
  for (const theme of ['dark', 'light']) {
    await page.goto(base, { waitUntil: 'networkidle' });
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `${route} retains theme`);
      assert.equal(await page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` }).count(), 1);
      const state = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        const heading = document.querySelector('h1');
        let ancestor = heading;
        let background = 'rgb(255,255,255)';
        while (ancestor) {
          const color = getComputedStyle(ancestor).backgroundColor;
          if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') { background = color; break; }
          ancestor = ancestor.parentElement;
        }
        const keys = ['text','muted','page','surface','action','on-action','selected','on-selected','success-text','success-bg','error-text','error-bg','warning-text','warning-bg','input-border'];
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
          bodyFont: getComputedStyle(document.body).fontFamily,
          editorialContract: bodyStyle.getPropertyValue('--font-fraunces').trim().split(',')[0].trim(),
          interfaceContract: bodyStyle.getPropertyValue('--font-space-grotesk').trim().split(',')[0].trim(),
          headingColor: getComputedStyle(heading).color, headingBackground: background,
          tokens: Object.fromEntries(keys.map(k => [k, style.getPropertyValue('--ui-' + k).trim()])) };
      });
      assert.equal(state.overflow, false, `${route} ${theme} mobile overflow`);
      const face = value => value.split(',')[0].replace(/["']/g, '').trim();
      assert.equal(face(state.headingFont), face(state.editorialContract), `${route} shares the editorial face`);
      assert.equal(face(state.bodyFont), face(state.interfaceContract), `${route} shares the interface face`);
      assert.ok(contrast(state.headingColor, state.headingBackground) >= 4.5, `${route} heading contrast`);
      if (route === '/sign-in') {
        const pairs = [['text','page'],['muted','page'],['muted','surface'],['on-action','action'],['on-selected','selected'],['success-text','success-bg'],['error-text','error-bg'],['warning-text','warning-bg']];
        for (const [fg,bg] of pairs) {
          const ratio = contrast(state.tokens[fg], state.tokens[bg]);
          assert.ok(ratio >= 4.5, `${theme}: ${fg}/${bg} contrast ${ratio}`);
          measured.push({ theme, pair: `${fg}/${bg}`, ratio: +ratio.toFixed(2) });
        }
        assert.ok(contrast(state.tokens['input-border'], state.tokens.page) >= 3, 'input boundary contrast');
        await page.screenshot({ path: path.join(output, `${name}-connected-sign-in-${theme}.png`) });
      }
      if (route === '/pricing') await page.screenshot({ path: path.join(output, `${name}-connected-pricing-${theme}.png`) });
    }
  }
  assert.deepEqual(errors, [], `${name}: connected-page runtime errors`);
  await context.close();
  results.push({ engine: name, connectedPublicPages: routes.length, themes: 2, typography: 'shared', textContrastMinimum: 4.5, measured });
}

try {
  await ready();
  for (const name of (process.env.HERO_BROWSERS || "chromium").split(",")) {
    const browser = await ({ chromium, webkit })[name].launch({ headless: true });
    try {
      for (const [width,height] of [[320,568],[360,740],[390,844],[768,1024],[1440,960]]) {
        const context = await browser.newContext({viewport:{width,height},hasTouch:width<901});
        const page = await context.newPage(); const errors=[];const requests=[];
        page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>requests.push(r.url()));
        await page.goto(base,{waitUntil:"networkidle"});await page.evaluate(()=>document.fonts.ready);
        assert.equal(await page.locator('h1').count(),1);
        assert.match(await page.locator('h1').innerText(),/Farm-fresh milk/);
        assert.equal(await page.locator('#glass-story').count(),0);
        assert.equal(requests.some(url=>/coffee-(front|side|top|macro)|glass-empty/.test(decodeURIComponent(url))),false,'optional film must not download before opening');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const heroCTA=page.locator('[data-conversion="hero_cta_click"]');
        const box=await heroCTA.boundingBox();assert.ok(box.y+box.height<height,'plan CTA fits first screen');
        assert.equal(await heroCTA.getAttribute('href'),'/milk');
        assert.match(await page.locator('#home').innerText(),/Jamshedpur/);
        assert.match(await page.locator('#home').innerText(),/₹62 per litre/);
        assert.equal(await page.locator('[lang="hi"]').count(),1);
        assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
        for (const theme of ['dark','light']) {
          if(theme==='light')await page.getByRole('button',{name:'Switch to light mode'}).click();
          await page.screenshot({path:path.join(output,`${name}-${width}-${theme}.png`)});
          const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return {ink:s.getPropertyValue('--hero-ink'),muted:s.getPropertyValue('--hero-muted'),paper:s.getPropertyValue('--hero-paper')};});
          assert.ok(contrast(colors.ink,colors.paper)>=4.5);assert.ok(contrast(colors.muted,colors.paper)>=4.5);
        }
        await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
        await page.getByRole('button',{name:'Switch to dark mode'}).click();
        if(width<901){
          const toggle=page.getByRole('button',{name:'Open navigation menu'});await toggle.click();const dialog=page.getByRole('dialog');
          assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.getByRole('navigation').getByRole('link').count(),5);
          assert.equal(await dialog.getByRole('link',{name:/Plans/}).getAttribute('href'),'/milk');
          assert.equal(await dialog.getByRole('link',{name:/Sign in/}).getAttribute('href'),'/sign-in');
          for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);}
          await page.screenshot({path:path.join(output,`${name}-${width}-menu.png`)});
          await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
          await toggle.click();await page.mouse.click(4,180);assert.equal(await dialog.isVisible(),false);
          await toggle.click();await dialog.getByRole('link',{name:/Our Story/}).click();await page.waitForFunction(()=>location.hash==='#about');
          await page.waitForFunction(()=>document.querySelector('nav a[href="#about"][aria-current]'));
          await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
        }
        if(width<=720){const bar=page.getByRole('navigation',{name:'Quick milk plan actions'});assert.equal(await bar.isVisible(),true);const b=await bar.boundingBox();assert.ok(b.y+b.height<=height+1);}
        const faq=page.locator('details').first();await faq.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await faq.getAttribute('open'),'');await page.keyboard.press('Enter');
        const schema=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
        const questions=schema['@graph'].find(item=>item['@type']==='FAQPage').mainEntity;
        assert.equal(questions.length,await page.locator('details').count());
        for(let i=0;i<questions.length;i++){assert.equal((await page.locator('details').nth(i).locator('summary').innerText()).replace(/\s*\+$/,''),questions[i].name);assert.equal(await page.locator('details').nth(i).locator('p').textContent(),questions[i].acceptedAnswer.text);}
        await page.evaluate(()=>{window.conversions=[];window.addEventListener('mma:conversion',e=>window.conversions.push(e.detail));document.addEventListener('click',e=>{if(e.target.closest('[data-conversion]'))e.preventDefault();},{capture:true});});
        await heroCTA.click();assert.ok((await page.evaluate(()=>window.conversions)).some(e=>e.event==='hero_cta_click'));
        assert.equal((await page.evaluate(()=>window.conversions)).some(e=>e.event==='plan_builder_start'),false);
        await page.getByRole('button',{name:'Watch the glass story'}).click();await page.locator('#glass-story').waitFor();
        await page.locator('#glass-story img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
        assert.equal(await page.locator('h1').count(),1);
        assert.equal(await page.locator('#glass-story a').first().innerText(),'Skip introduction');
        let previous=0;const tops=[];
        for(const p of [.12,.3,.48,.57,.66,.86,.99,1]){
          await scrollToProgress(page,p);const state=await page.locator('#glass-story').evaluate(root=>({fill:Number(root.dataset.fill),top:root.firstElementChild.getBoundingClientRect().top}));assert.ok(state.fill>=previous);previous=state.fill;if(width<=720)assert.equal(await page.getByRole('navigation',{name:'Quick milk plan actions'}).isVisible(),false,'film controls must stay unobstructed');if(p<.86)tops.push(state.top);
          if(p===.66||p===.86||p===.99)assert.equal(await page.locator('#glass-story').getAttribute('data-shot'),p===.66?'side':p===.86?'macro':'top');
          if([360,390,1440].includes(width)&&[.57,.66,.86,.99].includes(p))await page.screenshot({path:path.join(output,`${name}-${width}-frame-${p}.png`)});
        }
        assert.ok(Math.max(...tops)-Math.min(...tops)<2,'panel stays pinned');
        // Compare photographed silhouette bounds after the uniform side-view calibration.
        const alignment=await page.locator('#glass-story').evaluate(root=>{
          const front=root.querySelector('img[src*="coffee-front"]');const side=root.querySelector('img[src*="coffee-side"]');const f=front.getBoundingClientRect();const s=side.getBoundingClientRect();
          return {rim:Math.abs((f.y+f.height*139/1200)-(s.y+s.height*164/1200)),base:Math.abs((f.y+f.height*1074/1200)-(s.y+s.height*1020/1200))};
        });assert.ok(alignment.rim<2&&alignment.base<2,JSON.stringify(alignment));
        await scrollToProgress(page,.86);assert.equal(await page.locator('header').isVisible(),false);assert.equal(await page.locator('#glass-story-heading').isVisible(),false);
        if(width<=720)assert.equal(await page.getByRole('navigation',{name:'Quick milk plan actions'}).isVisible(),false);
        await scrollToProgress(page,.99);assert.equal(await page.locator('header').isVisible(),true);
        await scrollToProgress(page,.2);assert.ok(Number(await page.locator('#glass-story').getAttribute('data-fill'))<.4);
        await scrollToProgress(page,0);await page.getByRole('link',{name:'Skip introduction',exact:true}).click();await page.waitForFunction(()=>location.hash==='#after-glass-story'&&document.documentElement.dataset.heroImmersive==='false');
        await page.getByRole('button',{name:'Close the glass story'}).click();assert.equal(await page.locator('#glass-story').count(),0);assert.equal(await page.locator('html').getAttribute('data-hero-immersive'),null);
        assert.equal(requests.some(url=>/[?&]w=3840/.test(url)),false);
        assert.deepEqual(errors,[]);results.push({engine:name,width,height,film:'optional, forward/reverse, skip, cleanup',sideAlignmentPixels:alignment,runtimeErrors:errors.length});await context.close();
      }
      const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const p=await reduced.newPage();await p.goto(base,{waitUntil:'networkidle'});await p.getByRole('button',{name:'Watch the glass story'}).click();await p.waitForFunction(()=>document.getElementById('glass-story')?.dataset.fill==='1.000');assert.equal(await p.locator('#glass-story').evaluate(r=>r.offsetHeight===r.firstElementChild.offsetHeight),true);await reduced.close();
      const nojs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});const n=await nojs.newPage();await n.goto(base);assert.equal(await n.locator('h1').count(),1);assert.equal(await n.locator('[data-conversion="hero_cta_click"]').getAttribute('href'),'/milk');await n.locator('summary').first().click();assert.equal(await n.locator('details').first().getAttribute('open'),'');await nojs.close();
      if(!process.env.BASE_URL){const anonymous=await browser.newPage();await anonymous.goto(base+'/milk');assert.match(anonymous.url(),/\/sign-in\?next=%2Fmilk/);await anonymous.close();}
      await verifyConnectedPages(browser,name);
    }finally{await browser.close();}
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({...r,measured:undefined})),null,2));
}finally{server?.kill('SIGTERM');}
