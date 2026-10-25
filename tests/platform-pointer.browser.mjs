import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {chromium} from './playwright.mjs';import {defaults,emptySample} from '../src/lib/domain.js';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 for(const platform of ['windows','macos']){
  const page=await browser.newPage({viewport:{width:280,height:128}});page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(({settings,base,platform})=>{
   globalThis.isTauri=true;window.dragRequests=0;let n=0;const callbacks=new Map(),listeners=new Map();
   globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
   globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'overlay'},currentWebview:{label:'overlay'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){
    if(cmd==='plugin:event|listen'){listeners.set(args.event,args.handler);return args.handler;}
    const sample={...base,state:'waiting',checked_at:Date.now()};
    if(cmd==='bootstrap_overlay')return {settings,sample,platform,offline_test:platform==='windows',overlay_interaction:{}};
    if(cmd==='sample_snapshot')return sample;if(cmd==='settings_snapshot')return settings;
    if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};if(cmd==='overlay_drag'){window.dragRequests++;return;}throw Error(cmd);
   }};
   window.tap=()=>callbacks.get(listeners.get('pulse:pet-tap'))?.({payload:{id:1}});
  },{settings:{...defaults,overlay_layout:'avatar',character:'roxy',animations:false},base:emptySample(),platform});
  await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
  await page.locator('.mini-grip').click();
  if(platform==='windows'){await page.getByText('模拟日志 · 隔离测试',{exact:true}).waitFor();checks.push('Offline native fixtures carry a visible label while keeping log-derived metrics');await page.getByLabel('头像对话',{exact:true}).waitFor();checks.push('Windows bridge permits avatar DOM clicks without waiting for a macOS tap event');}
  else{assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);await page.evaluate(()=>window.tap());await page.getByLabel('头像对话',{exact:true}).waitFor();checks.push('macOS continues using its confirmed native tap and does not double-trigger on the DOM click');}
  if(platform==='windows'){
   assert.equal(await page.evaluate(()=>window.dragRequests),0);
   const grip=await page.locator('.mini-grip').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8,y);await page.mouse.up();
   assert.equal(await page.evaluate(()=>window.dragRequests),1);
   checks.push('Windows taps stay in DOM; threshold starts native drag once');
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);await writeFile('test-results/platform-pointer-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
