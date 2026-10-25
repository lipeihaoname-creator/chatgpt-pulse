import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from './playwright.mjs';
import {defaults,emptySample} from '../src/lib/domain.js';
const dist=path.resolve('dist');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.route('https://pulse.test/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep))return route.abort();
  await route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});
 });
 await page.addInitScript(({base,settings})=>{
  globalThis.isTauri=true;let cb=0;
  let sample={...base,source:'logs',state:'running',log_id:'numeric-fixture',activity_status:'reasoning',activity_at:Date.now(),checked_at:Date.now(),poll_sequence:1,rate_status:'no_recent_usage',total_output_tokens:3151,total_reasoning_tokens:467};
  globalThis.__pulsePatchUsage=patch=>{sample={...sample,...patch,checked_at:Date.now(),poll_sequence:sample.poll_sequence+1};};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback(){return ++cb;},async invoke(command){
   if(command==='plugin:event|listen')return ++cb;
   if(command==='bootstrap')return {sample,settings,platform:'windows',offline_test:true,logs:[],history:[],startup:{}};
   if(command==='bootstrap_overlay')return {sample,settings,platform:'windows',offline_test:true};
   if(command==='sample_snapshot')return sample;
   if(command==='settings_snapshot')return settings;
   if(command==='get_custom_avatar')return null;
   if(command==='get_state_avatars')return {};
   throw Error(command);
  }};
 },{base:emptySample(),settings:{...defaults,show_total:true,overlay_layout:'avatar'}});
 await page.goto('https://pulse.test/',{waitUntil:'networkidle'});
 await page.locator('[data-usage-scope="session"]').waitFor();
 assert.match(await page.locator('[data-usage-scope="session"]').innerText(),/会话累计输出[\s\S]*3151[\s\S]*本轮起始用量未知/);
 assert.match(await page.locator('.rate-summary').innerText(),/等待上报/);
 await page.evaluate(()=>globalThis.__pulsePatchUsage({current_rate:2,rate_interval_seconds:10,rate_updated_at:Date.now(),rate_status:'reported_interval'}));
 await page.waitForFunction(()=>document.querySelector('.main-metric .metric-number')?.textContent.includes('2.0'));
 assert.equal(await page.locator('[data-usage-scope="session"]').count(),1);
 await page.goto('https://pulse.test/?overlay',{waitUntil:'networkidle'});
 assert.match(await page.locator('.mini-work').innerText(),/会话累计 3151 Token/);
 assert.equal(await page.locator('[data-task-output=""]').count(),1);
 assert.match(await page.locator('.mini-rate').innerText(),/等待上报/);
 await page.evaluate(()=>globalThis.__pulsePatchUsage({current_rate:2,rate_interval_seconds:10,rate_updated_at:Date.now(),rate_status:'reported_interval'}));
 await page.waitForFunction(()=>document.querySelector('.mini-rate b')?.textContent==='2.0');
 assert.equal(await page.locator('[data-task-output=""]').count(),1);
 await writeFile('test-results/evidence/delivery-usage-browser.json',JSON.stringify({passed:true,mocked_ipc:true,checks:['Main view labels reported session total','Overlay uses the same scope label','Unknown task total stays unknown','Both views explain pending usage and show valid later intervals without inventing task totals']},null,2));
 console.log('Usage provenance passed in production main and overlay views (mocked IPC).');
} finally {await browser.close();}
