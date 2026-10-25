import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:280,height:344}});
 await context.addInitScript(({base,initial})=>{
  globalThis.isTauri=true;let n=0,seq=0,settings=initial,count=4,primary='a',output=40;const callbacks=new Map(),listeners=new Map();
  const snapshot=()=>{const rows=Array.from({length:count},(_,i)=>({...base,log_id:String.fromCharCode(97+i),state:'running',activity_status:i%2?'tool':'reasoning',activity_at:Date.now(),checked_at:Date.now(),current_rate:10*(i+1),rate_status:'reported_interval',rate_updated_at:Date.now(),output_tokens:i===1?output:(i+1)*20}));return {...rows.find(r=>r.log_id===primary),overlay_log_id:primary,sessions:rows,monitored_sessions:count,checked_at:Date.now(),poll_sequence:++seq};};
  const emit=(event,payload)=>{for(const id of listeners.get(event)||[])callbacks.get(id)?.({payload});};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'overlay'},currentWebview:{label:'overlay'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}if(cmd==='bootstrap_overlay')return {settings,sample:snapshot(),overlay_interaction:{}};if(cmd==='sample_snapshot')return snapshot();if(cmd==='settings_snapshot')return settings;if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};if(cmd==='overlay_edit'){settings={...settings,locked:true,revision:settings.revision+1};emit('pulse:settings',settings);return true;}throw Error(cmd);}};
  window.changeGroup=(patch={})=>{settings={...settings,...patch,revision:settings.revision+1};emit('pulse:settings',settings);};
  window.changeTasks=(c,o=40)=>{count=c;output=o;emit('pulse:sample',snapshot());};
  window.dockRight=()=>emit('pulse:overlay',{avatar_right:true,dock_side:1});
 },{base:emptySample(),initial:{...defaults,overlay_layout:'avatar',theme:'moon',animations:false,hover_hide:false,overlay_enabled:true}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 const metrics=page.locator('.task-metrics');await metrics.nth(3).waitFor();
 assert.deepEqual(await metrics.evaluateAll(es=>es.map(e=>[e.dataset.taskId,e.dataset.taskOutput])),[['a','20'],['b','40'],['c','60'],['d','80']]);
 assert.equal(await page.locator('.pet-face').count(),1);assert.equal(await page.locator('.pet-bubble').count(),4);assert.ok(!/Work|…|jsonl/.test(await page.locator('.mini').innerText()));
 let rects=await page.locator('.pet-bubble').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
 assert.ok(rects.every(r=>Math.abs(r.x-126)<1));for(let i=1;i<rects.length;i++)assert.ok(rects[i].y>=rects[i-1].y+rects[i-1].h+7);
 assert.ok(rects.at(-1).y+rects.at(-1).h<=344);await page.screenshot({path:'test-results/task-group-separate.png'});
 checks.push('Four attached bubbles align under the original, share one avatar and show separate usage without Work IDs');
 await page.evaluate(()=>window.dockRight());await page.waitForTimeout(80);assert.ok(Math.abs((await page.locator('.pet-bubble').first().boundingBox()).x-10)<1);await page.screenshot({path:'test-results/task-group-right.png'});
 await page.evaluate(()=>window.changeGroup({task_display:'combined'}));await page.setViewportSize({width:280,height:300});await page.waitForTimeout(80);
 assert.equal(await page.locator('.mini.combined').count(),1);assert.equal(await metrics.count(),4);assert.equal(await page.locator('.pet-face').count(),1);
 let geometry=await page.locator('.pet-bubbles').evaluate(el=>({h:el.clientHeight,scroll:el.scrollHeight,b:el.getBoundingClientRect().bottom}));assert.ok(geometry.scroll<=geometry.h+1,JSON.stringify(geometry));assert.ok(geometry.b<=300);
 await page.screenshot({path:'test-results/task-group-combined.png'});
 await page.evaluate(()=>window.changeTasks(4,120));await page.waitForTimeout(50);assert.equal(await metrics.nth(1).getAttribute('data-task-output'),'120');assert.equal(await metrics.first().getAttribute('data-task-output'),'20');checks.push('Combined mode keeps every task metric independent and fits the native height');
 await page.evaluate(()=>window.changeGroup({locked:false}));await page.setViewportSize({width:280,height:340});await page.waitForTimeout(50);
 const actions=await page.getByRole('group',{name:'编辑操作'}).boundingBox();geometry=await page.locator('.pet-bubbles').evaluate(el=>({bottom:el.getBoundingClientRect().bottom}));assert.ok(geometry.bottom<=actions.y,JSON.stringify({geometry,actions}));await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.getByRole('group',{name:'编辑操作'}).count(),0);
 await page.evaluate(()=>window.changeTasks(1));await page.setViewportSize({width:280,height:128});await page.waitForTimeout(50);assert.equal(await page.locator('.mini.multitask').count(),0);assert.equal(await metrics.count(),1);assert.equal(await page.locator('.pet-face').count(),1);checks.push('Cancel exits editing; shrinking to one task restores the original compact layout');
 await page.evaluate(()=>{window.changeGroup({locked:false,task_display:'separate'});window.changeTasks(16);});await page.setViewportSize({width:280,height:500});await page.waitForTimeout(60);geometry=await page.locator('.pet-bubbles').evaluate(el=>({h:el.clientHeight,scroll:el.scrollHeight}));assert.ok(geometry.scroll>geometry.h);await page.locator('.pet-bubbles').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await metrics.last().isVisible());checks.push('Large task lists scroll within the screen in edit mode instead of spawning detached windows');
 // Bar layout shares the same group and independent values.
 await page.evaluate(()=>{window.changeGroup({overlay_layout:'bar',locked:true,task_display:'separate'});window.changeTasks(4);});await page.setViewportSize({width:272,height:264});await page.waitForTimeout(60);rects=await page.locator('.pet-bubble').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,h:r.height};}));assert.ok(rects.at(-1).y+rects.at(-1).h<=264);geometry=await page.locator('.pet-bubbles').evaluate(el=>({h:el.clientHeight,scroll:el.scrollHeight}));assert.ok(geometry.scroll<=geometry.h+1,JSON.stringify(geometry));await page.screenshot({path:'test-results/task-group-bar.png'});
 await page.evaluate(()=>window.changeGroup({task_display:'combined'}));await page.setViewportSize({width:272,height:268});await page.waitForTimeout(50);geometry=await page.locator('.pet-bubbles').evaluate(el=>({h:el.clientHeight,scroll:el.scrollHeight}));assert.ok(geometry.scroll<=geometry.h+1,JSON.stringify(geometry));
 checks.push('Both bar layouts fit all rows without clipping; no duplicate avatar or visible session number');
 assert.equal(await page.locator('vite-error-overlay').count(),0);assert.deepEqual(errors,[]);await writeFile('test-results/task-group-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
