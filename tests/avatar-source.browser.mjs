import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './playwright.mjs';
import {defaults,emptySample} from '../src/lib/domain.js';
const project=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(project,'dist');
const checks=[],errors=[];
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:760,height:640}});
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('https://pulse.test/**',async route=>{
  const url=new URL(route.request().url());
  const target=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(target!==path.join(dist,'index.html')&&!target.startsWith(dist+path.sep))return route.abort();
  try{
   const body=await readFile(target);
   const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(target)]||'application/octet-stream';
   await route.fulfill({status:200,contentType,body});
  }catch{await route.fulfill({status:404,body:''});}
 });
 await page.addInitScript(({settings,base})=>{
  globalThis.isTauri=true;
  let callback=0;window.dragRequests=0;
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={
   metadata:{currentWindow:{label:'overlay'},currentWebview:{label:'overlay'}},
   transformCallback(){return ++callback;},
   async invoke(command){
    if(command==='plugin:event|listen')return ++callback;
    const sample={...base,state:'waiting',checked_at:Date.now(),poll_sequence:1};
    if(command==='bootstrap_overlay')return {settings,sample,platform:'windows',offline_test:true,overlay_interaction:{}};
    if(command==='bootstrap')return {settings,sample,platform:'windows',offline_test:true,history:[],logs:[{id:'1001.jsonl',label:'1001',modified:1}],startup:{}};
    if(command==='sample_snapshot')return sample;
    if(command==='settings_snapshot')return settings;
    if(command==='get_custom_avatar')return null;
    if(command==='get_state_avatars')return {};
    if(command==='overlay_drag'){window.dragRequests++;return;}
    throw Error(command);
   }
  };
 },{settings:{...defaults,overlay_layout:'avatar',character:'mai',animations:false},base:emptySample()});
 await page.goto('https://pulse.test/?overlay',{waitUntil:'networkidle'});
 const grip=page.locator('.mini-grip');
 await grip.click();
 await page.getByLabel('头像对话',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('mini-grip')),false);
 assert.equal(await grip.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 checks.push('Pointer click opens dialogue and leaves no focus outline');
 const box=await grip.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8,y);await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.dragRequests),1);
 checks.push('Preventing pointer focus preserves threshold drag');
 await page.mouse.click(500,400);
 await page.keyboard.press('Tab');
 await grip.focus();
 assert.equal(await grip.evaluate(el=>getComputedStyle(el).outlineColor),'rgb(216, 220, 223)');
 assert.equal(await grip.evaluate(el=>getComputedStyle(el).outlineWidth),'2px');
 checks.push('Keyboard focus keeps a neutral visible outline');
 await page.goto('https://pulse.test/',{waitUntil:'networkidle'});
 const banner=page.locator('[data-source-status="stale"]');
 await banner.waitFor();
 assert.match(await banner.innerText(),/未接入当前 Work/);
 assert.match(await banner.innerText(),/当前状态与 Token 用量未知/);
 assert.equal(await page.locator('.status-tag.working').count(),0);
 checks.push('Old logs show an unconnected source warning without a green working indicator');
 assert.deepEqual(errors,[]);
 await writeFile('test-results/evidence/avatar-source-browser.json',JSON.stringify({passed:true,source:'local production build; mocked IPC; no live Work verification',checks,errors},null,2));
 console.log(JSON.stringify({passed:true,checks}));
}catch(error){
 await writeFile('test-results/evidence/avatar-source-browser.json',JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));
 throw error;
}finally{await browser?.close();}
