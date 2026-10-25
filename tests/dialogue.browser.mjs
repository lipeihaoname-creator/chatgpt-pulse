import {assetUrl} from './production-assets.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const checks=[],errors=[];
try{
 const context=await browser.newContext({reducedMotion:'no-preference'});
 await context.addInitScript(({settings,base})=>{
  globalThis.isTauri=true;const callbacks=new Map(),listeners=new Map();let id=0,sequence=0,tapId=0;
  const sample=()=>({...base,checked_at:Date.now(),poll_sequence:++sequence});
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){callbacks.set(++id,fn);return id;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){const ids=listeners.get(args.event)||[];ids.push(args.handler);listeners.set(args.event,ids);return args.handler;}
   if(cmd==='sample_snapshot')return sample();if(cmd==='settings_snapshot')return settings;
   if(cmd==='bootstrap_overlay')return {settings,sample:sample(),overlay_interaction:{}};
   if(cmd==='overlay_drag')return null;
   throw Error('Unexpected command '+cmd);
  }};
  globalThis._petTap=(serial)=>{tapId=serial??tapId+1;for(const id of listeners.get('pulse:pet-tap')||[])callbacks.get(id)({payload:{id:tapId}});};
  globalThis._petInteraction=value=>{for(const id of listeners.get('pulse:overlay')||[])callbacks.get(id)({payload:value});};
  globalThis._petSetting=(key,value)=>{settings={...settings,[key]:value,revision:settings.revision+1};for(const id of listeners.get('pulse:settings')||[])callbacks.get(id)({payload:settings});};
 },{settings:{...defaults,revision:1,overlay_layout:'avatar',overlay_enabled:true},base:{...emptySample(),state:'running',activity_status:'tool',activity_at:Date.now(),current_rate:42.8,rate_status:'held_interval',rate_updated_at:Date.now()-10000,pending_tools:1}});
 const page=await context.newPage({viewport:{width:280,height:128}});page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewportSize({width:280,height:128});
 await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 const mini=page.locator('.mini'),grip=page.getByRole('button',{name:'拖动悬浮条',exact:true});
 assert.equal(Math.round((await mini.boundingBox()).width),280);
 await page.evaluate(()=>{window._petInteraction({dragging:true});window._petTap(1);});const speech=page.getByLabel('头像对话',{exact:true});await speech.waitFor();const first=await speech.locator('p').getAttribute('aria-label');
 await page.evaluate(()=>window._petTap(1));assert.equal(await speech.locator('p').getAttribute('aria-label'),first);
 await page.evaluate(()=>window._petInteraction({dragging:false}));
 await grip.click();assert.equal(await speech.locator('p').getAttribute('aria-label'),first);
 assert.equal(await page.locator('.mini-rate b').textContent(),'42.8');assert.equal(await page.locator('.mini-work').textContent(),'✦工具中');
 await page.waitForFunction(()=>{const p=document.querySelector('.pet-dialogue p');return p&&p.textContent===p.getAttribute('aria-label');});
 assert.equal(await page.locator('.character-portrait').getAttribute('data-expression'),'3');
 assert.ok((await page.locator('.half').last().evaluate(el=>getComputedStyle(el).backgroundImage)).includes(assetUrl('src/assets/mai/half.png')));
 await page.screenshot({path:'test-results/dialogue-avatar-071.png'});
 checks.push('Confirmed native tap survives stale dragging=true; duplicate event and native DOM echo cannot double-trigger; status/rate stay visible');
 const one=await speech.locator('p').getAttribute('aria-label');await page.evaluate(()=>window._petTap());const two=await speech.locator('p').getAttribute('aria-label');await page.evaluate(()=>window._petTap());assert.notEqual(two,one);assert.notEqual(await speech.locator('p').getAttribute('aria-label'),two);
 checks.push('Two distinct rapid native taps both respond without a blanket 400ms cooldown');
 const previousLine=await speech.locator('p').getAttribute('aria-label');await page.evaluate(()=>window._petTap());assert.notEqual(await speech.locator('p').getAttribute('aria-label'),previousLine);
 await page.waitForFunction(()=>{const p=document.querySelector('.pet-dialogue p');return p&&p.textContent===p.getAttribute('aria-label');});
 checks.push('Native tap event reaches the overlay; consecutive lines do not repeat');
 await page.evaluate(()=>window._petSetting('dialogue_enabled',false));await speech.waitFor({state:'hidden'});await grip.click();assert.equal(await speech.count(),0);
 await page.evaluate(()=>{window._petSetting('dialogue_enabled',true);window._petSetting('animations',false);window._petSetting('overlay_layout','bar');});
 await page.setViewportSize({width:272,height:64});
 const box=await grip.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+25,box.y+10);await page.mouse.up();assert.equal(await speech.count(),0);
 await page.evaluate(()=>window._petTap());await speech.waitFor();assert.equal(await speech.locator('p').textContent(),await speech.locator('p').getAttribute('aria-label'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=272&&document.documentElement.scrollHeight<=64),true);
 const gap=await page.locator('.mini-content').evaluate(el=>{const a=el.querySelector('.mini-work').getBoundingClientRect(),b=el.querySelector('.mini-rate').getBoundingClientRect();return b.left-a.right;});assert.ok(gap<=10&&gap>=0);
 await page.screenshot({path:'test-results/dialogue-bar-071.png'});
 checks.push('Compact bar fits 272x64 with adjacent status/rate; dragging never chats; disabled motion shows full text immediately');
 await speech.waitFor({state:'hidden',timeout:10000});assert.equal(await page.locator('.character-portrait').getAttribute('data-expression'),'4');
 checks.push('Dialogue expires and returns to true work expression');
 assert.deepEqual(errors,[]);await writeFile('test-results/dialogue-browser.json',JSON.stringify({passed:true,checks,errors,native_bridge_mock:true},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();}
