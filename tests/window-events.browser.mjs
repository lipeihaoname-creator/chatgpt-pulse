// Model Tauri 2 targets faithfully: a private event does not reach Any listeners.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const context=await browser.newContext({viewport:{width:280,height:168}});
 await context.addInitScript(({settings,base})=>{
  globalThis.isTauri=true;const child=location.search.includes('session='),label=child?'task-b':'overlay',id=child?'b':'a';
  let serial=0,sequence=0;const callbacks=new Map(),listeners=[],avatarReads=[];
  const sample=()=>({...base,log_id:id,overlay_log_id:'a',state:'running',activity_status:child?'tool':'reasoning',current_rate:child?20:10,rate_status:'reported_interval',activity_at:Date.now(),checked_at:Date.now(),poll_sequence:++sequence});
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label},currentWebview:{label}},transformCallback(fn){callbacks.set(++serial,fn);return serial;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){listeners.push({...args});return args.handler;}
   if(cmd==='sample_snapshot')return sample();if(cmd==='settings_snapshot')return settings;
   if(cmd==='bootstrap_overlay')return {settings,sample:sample(),overlay_interaction:{}};
   if(cmd==='get_custom_avatar'){avatarReads.push(cmd);return null;}if(cmd==='get_state_avatars'){avatarReads.push(cmd);return {};}
   throw Error(cmd);
  }};
  globalThis.routeEvent=(target,event,payload)=>{for(const listener of listeners)if(listener.event===event&&(!target||listener.target?.label===target))callbacks.get(listener.handler)?.({payload});};
  globalThis.eventTargets=()=>listeners.filter(l=>['pulse:sample','pulse:overlay','pulse:pet-tap'].includes(l.event)).map(l=>l.target);
  globalThis.avatarReads=avatarReads;
 },{settings:{...defaults,overlay_enabled:true,overlay_layout:'avatar',character:'roxy',animations:false,avatar_revision:1,state_avatar_revision:1},base:emptySample()});
 const root=await context.newPage(),child=await context.newPage();for(const page of [root,child])page.on('pageerror',e=>errors.push(String(e)));
 await root.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});await child.goto('http://127.0.0.1:1420/?overlay&session=b',{waitUntil:'networkidle'});
 for(const [page,label] of [[root,'overlay'],[child,'task-b']]){
  const targets=await page.evaluate(()=>window.eventTargets());assert.equal(targets.length,3);assert.ok(targets.every(t=>t.kind==='WebviewWindow'&&t.label===label));
 }
 assert.equal(await root.evaluate(()=>window.avatarReads.length),2);assert.equal(await child.evaluate(()=>window.avatarReads.length),0,'Pure task bubbles must not load unused custom images');
 for(const page of [root,child])await page.evaluate(()=>window.routeEvent('task-b','pulse:overlay',{faded:true,grip_active:false,dragging:false}));
 assert.equal(await root.locator('.mini.faded').count(),0);assert.equal(await child.locator('.mini.faded').count(),1);
 for(const page of [root,child])await page.evaluate(()=>window.routeEvent('task-b','pulse:pet-tap',{id:1}));
 assert.equal(await root.getByLabel('头像对话',{exact:true}).count(),0);assert.equal(await child.getByLabel('头像对话',{exact:true}).count(),0);
 for(const page of [root,child])await page.evaluate(()=>{window.routeEvent('overlay','pulse:overlay',{faded:false,grip_active:true});window.routeEvent('overlay','pulse:pet-tap',{id:2});});
 await root.getByLabel('头像对话',{exact:true}).waitFor();assert.equal(await child.locator('.mini.faded').count(),1);assert.equal(await child.getByLabel('头像对话',{exact:true}).count(),0);
 assert.equal(await root.locator('.mini-rate b').textContent(),'10.0');assert.equal(await child.locator('.mini-rate b').textContent(),'20.0');
 for(const page of [root,child])assert.equal(await page.locator('vite-error-overlay').count(),0);
 assert.deepEqual(errors,[]);
 const result={passed:true,checks:['Sample, hover and tap listeners use the actual public SDK window target','Fading a companion does not fade the character window','Companion taps never trigger character dialogue','Character taps and its hover state leave companions unchanged','Independent task rates remain visible']};
 await writeFile('test-results/window-events-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
