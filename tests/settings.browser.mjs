// Production views with delayed/reordered native messages and dropped settings events.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];
try{
 const context=await browser.newContext();
 await context.addInitScript(({initial,base})=>{
  globalThis.isTauri=true;let settings={...base,revision:5,locked:true,overlay_enabled:true};
  let next=1,patched=0;const callbacks=new Map(),listeners=new Map(),calls=[];
  const emit=value=>{for(const id of listeners.get('pulse:settings')||[])callbacks.get(id)({payload:value});};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){const id=next++;callbacks.set(id,fn);return id;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){const ids=listeners.get(args.event)||[];ids.push(args.handler);listeners.set(args.event,ids);return args.handler;}
   if(cmd==='sample_snapshot')return initial;
   if(cmd==='settings_snapshot')return settings;
   if(cmd==='bootstrap'||cmd==='bootstrap_overlay'){
    await new Promise(resolve=>setTimeout(resolve,200));emit({...settings});
    return {settings:{...base,revision:1,locked:false},sample:initial,history:[],logs:[],platform:'macos',startup:{supported:false},overlay_interaction:{}};
   }
   if(cmd==='patch_settings'){
    calls.push(args);settings={...settings,[args.key]:args.value,revision:settings.revision+1};const response={...settings};
    await new Promise(resolve=>setTimeout(resolve,++patched===1?250:30));return response;
   }
   throw Error('Unexpected command '+cmd);
  }};
  globalThis.__pulseSettings=value=>{settings={...settings,...value};};
  globalThis.__pulseOldSettings=value=>emit({...base,...value});
  globalThis.__pulseCalls=calls;
 },{initial:emptySample(),base:defaults});
 const main=await context.newPage(),mini=await context.newPage();
 for(const page of [main,mini])page.on('pageerror',e=>errors.push(String(e)));
 await main.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
 await mini.setViewportSize({width:390,height:70});await mini.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 assert.equal(await main.getByRole('group',{name:'悬浮条编辑',exact:true}).count(),0);
 assert.equal(await mini.getByRole('button',{name:'完成',exact:true}).count(),0);
 checks.push('Delayed bootstrap cannot restore old editing state after a newer native event');
 for(const page of [main,mini])await page.evaluate(()=>window.__pulseSettings({revision:6,locked:false}));
 await main.getByRole('button',{name:'完成编辑',exact:true}).waitFor({timeout:4000});
 await mini.getByRole('button',{name:'完成',exact:true}).waitFor({timeout:4000});
 checks.push('Snapshots recover missed settings events in both windows');
 for(const page of [main,mini])await page.evaluate(()=>window.__pulseOldSettings({revision:4,locked:true}));
 assert.equal(await main.getByRole('button',{name:'完成编辑',exact:true}).isVisible(),true);
 assert.equal(await mini.getByRole('button',{name:'完成',exact:true}).isVisible(),true);
 checks.push('An older lock notification cannot undo the newer editing state');
 for(const page of [main,mini])await page.evaluate(()=>window.__pulseSettings({revision:7,locked:true}));
 await mini.getByRole('button',{name:'完成',exact:true}).waitFor({state:'hidden',timeout:4000});
 await main.getByRole('button',{name:'偏好设置'}).click();
 await main.getByRole('checkbox',{name:'鼠标靠近时渐隐'}).uncheck();
 await main.getByRole('checkbox',{name:'自动适应日志节奏'}).uncheck();
 await main.waitForFunction(()=>window.__pulseCalls.length===2);
 // Wait on rendered final state rather than timing alone: the first response arrives last.
 await main.waitForFunction(()=>window.__pulseCalls.length===2&&document.querySelector('[aria-label="自动适应日志节奏"]')?.checked===false);
 await main.evaluate(()=>new Promise(resolve=>setTimeout(resolve,350)));
 assert.equal(await main.getByRole('checkbox',{name:'鼠标靠近时渐隐'}).isChecked(),false);
 assert.equal(await main.getByRole('checkbox',{name:'自动适应日志节奏'}).isChecked(),false);
 const calls=await main.evaluate(()=>window.__pulseCalls);
 assert.deepEqual(calls.map(c=>c.key),['hover_hide','adaptive_retention']);assert.ok(calls.every(c=>!('settings'in c)&&!('locked'in c)&&!('overlay_position'in c)));
 checks.push('Fast independent preference changes survive reordered responses and never send position/edit state');
 assert.deepEqual(errors,[]);await writeFile('test-results/settings-browser.json',JSON.stringify({passed:true,checks,errors,real_client_accessed:false},null,2));
 console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();}
