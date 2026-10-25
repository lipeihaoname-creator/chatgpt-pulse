import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:300,height:180}});
 await context.addInitScript(({settings,base})=>{
  globalThis.isTauri=true;let n=0,seq=0,selection='a';const callbacks=new Map(),listeners=new Map();
  const snapshot=()=>{const rows=['a','b'].map((id,i)=>({...base,log_id:id,state:'running',activity_status:i?'tool':'reasoning',activity_at:Date.now(),current_rate:i?20:10,rate_status:'reported_interval',rate_updated_at:Date.now(),output_tokens:i?70:30}));return {...rows.find(r=>r.log_id===selection),overlay_log_id:'a',sessions:rows,monitored_sessions:2,checked_at:Date.now(),poll_sequence:++seq};};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}if(cmd==='bootstrap'||cmd==='bootstrap_overlay')return {settings,sample:snapshot(),history:[],logs:[],platform:'macos',overlay_interaction:{}};if(cmd==='sample_snapshot')return snapshot();if(cmd==='settings_snapshot')return settings;if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};throw Error(cmd);}};
  globalThis.selectB=()=>{selection='b';for(const id of listeners.get('pulse:sample')||[])callbacks.get(id)?.({payload:snapshot()});};
 },{settings:{...defaults,overlay_layout:'avatar'},base:emptySample()});
 const a=await context.newPage(),b=await context.newPage();for(const page of [a,b])page.on('pageerror',e=>errors.push(String(e)));
 await a.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});await b.goto('http://127.0.0.1:1420/?overlay&session=b',{waitUntil:'networkidle'});
 assert.equal(await a.locator('.mini').getAttribute('data-pulse-log-id'),'a');assert.equal(await b.locator('.mini').getAttribute('data-pulse-log-id'),'b');
 assert.ok((await a.locator('.mini').innerText()).includes('10.0'));assert.ok((await b.locator('.mini').innerText()).includes('20.0'));
 await a.evaluate(()=>window.selectB());await b.evaluate(()=>window.selectB());assert.equal(await a.locator('.mini').getAttribute('data-pulse-log-id'),'a');assert.equal(await a.locator('.mini').getAttribute('data-pulse-output'),'30');
 assert.equal(await a.locator('.mini-grip .pet-face').count(),1);assert.equal(await b.locator('.mini-grip .pet-face, .mini-grip .character-portrait').count(),0);
 for(const page of [a,b])assert.equal(await page.locator('vite-error-overlay').count(),0,'Build/HMR errors must fail layout validation');
 assert.equal(await b.locator('.pulse-strip').count(),1,'Companions keep their own activity pulses');
 checks.push('Separate bubbles keep their session, token count and rate when main selection changes');
 await a.locator('.mini').screenshot({path:'test-results/work-bubble-a.png'});await b.locator('.mini').screenshot({path:'test-results/work-bubble-b.png'});
 await a.getByRole('button',{name:'拖动悬浮条',exact:true}).press('Enter');await a.getByLabel('头像对话',{exact:true}).waitFor();assert.equal(await b.getByLabel('头像对话',{exact:true}).count(),0);
 checks.push('Exactly one character remains interactive; task-only companions have no character');
 const main=await context.newPage();await main.setViewportSize({width:1160,height:850});await main.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});assert.equal(await main.getByLabel('监测模式',{exact:true}).count(),0);assert.equal(await main.getByLabel('普通聊天状态',{exact:true}).count(),0);assert.equal(await main.locator('.metric').count(),3);
 checks.push('Chat mode and permission UI removed; Work metrics and task list retained');assert.deepEqual(errors,[]);
 await writeFile('test-results/work-windows-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
