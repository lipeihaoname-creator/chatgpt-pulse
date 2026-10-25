// Render the production main/overlay views against a synthetic native event bridge.
// This tests display semantics, not access to a real GPT client.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {shortStatus} from '../src/lib/appearance.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],external=[],passed=[];
try{
  const context=await browser.newContext();
  await context.addInitScript(({settings,initial})=>{
    globalThis.isTauri=true;
    let sample=initial,next=1;const callbacks=new Map(),listeners=new Map();
    globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    globalThis.__TAURI_INTERNALS__={
      metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){const id=next++;callbacks.set(id,fn);return id;},
      async invoke(cmd,args){
        if(cmd==='plugin:event|listen'){const ids=listeners.get(args.event)||[];ids.push(args.handler);listeners.set(args.event,ids);return args.handler;}
        if(cmd==='sample_snapshot')return sample;
        if(cmd==='settings_snapshot')return settings;
        if(cmd==='bootstrap_overlay')return {settings,sample,overlay_interaction:{}};
        if(cmd==='bootstrap')return {settings,sample,history:[],logs:[],platform:'macos',startup:{supported:false},overlay_interaction:{}};
        throw Error('Unexpected test command: '+cmd);
      }
    };
    globalThis.__pulseSetSnapshot=value=>{sample=value;};
    globalThis.__pulsePush=value=>{sample=value;for(const id of listeners.get('pulse:sample')||[])callbacks.get(id)({payload:value});};
  },{settings:{...defaults,overlay_enabled:true},initial:emptySample()});
  context.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:1420')&&!r.url().startsWith('data:'))external.push(r.url());});
  const main=await context.newPage(),mini=await context.newPage();
  main.on('pageerror',e=>errors.push(String(e)));mini.on('pageerror',e=>errors.push(String(e)));
  await main.setViewportSize({width:1280,height:1100});await mini.setViewportSize({width:272,height:64});
  await main.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
  await mini.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
  const phases=[['reasoning','推理有进展','reasoning'],['tool','工具处理中','tool_started'],['waiting_approval','等待你批准','waiting_approval'],['waiting_user','需要你回答','waiting_user'],['quiet','状态待确认','reasoning'],['completed','本轮已完成','completed'],['aborted','本轮已中止','aborted']];
  let fixtureSequence=1;
  for(const [status,label,kind] of phases){
    const now=Date.now(),at=status==='quiet'?now-31000:now;
    const sample={...emptySample(),state:['completed','aborted'].includes(status)?status:'running',activity_status:status,activity_at:at,checked_at:now,poll_sequence:fixtureSequence++,pending_tools:status==='tool'?2:0,running_seconds:20,observed_seconds:20,current_rate:0,rate_status:status==='completed'?'idle':'no_recent_usage',output_tokens:200,rate:10,activities:[{kind:'started',at:now-20000},{kind,at}]};
    for(const page of [main,mini])await page.evaluate(sample=>window.__pulsePush(sample),sample);
    await main.getByRole('region',{name:'工作状态',exact:true}).getByRole('heading',{name:label,exact:true}).waitFor();
    assert.match(await mini.locator('.mini-work').evaluate(el=>el.firstChild.textContent),new RegExp(shortStatus(status,label)+'$'));
    assert.equal(await mini.locator('.work-indicator').evaluate(el=>el.classList.contains('working')),['reasoning','tool'].includes(status));
    if(status==='quiet')assert.match(await main.getByRole('region',{name:'工作状态',exact:true}).textContent(),/不能判定卡死/);
    passed.push(status+' is consistent in main and overlay independently of Token/s');
    if(status==='tool')await main.screenshot({path:'test-results/status-browser-tool.png',fullPage:true});
  }
  const listNow=Date.now();
  const quietRow={...emptySample(),log_id:'aaaa.jsonl',state:'running',activity_status:'quiet',activity_at:listNow-60000,checked_at:listNow};
  const futureRow={...emptySample(),log_id:'bbbb.jsonl',state:'completed',checked_at:listNow,completion:{id:'future',ended_at:listNow+60000,output_tokens:10,duration:1,average_rate:10,reason:'completed'}};
  const brokenRow={...emptySample(),log_id:'cccc.jsonl',state:'unavailable',task_unfinished:true,checked_at:listNow};
  await main.evaluate(s=>window.__pulsePush(s),{...quietRow,poll_sequence:fixtureSequence++,sessions:[quietRow,futureRow,brokenRow],monitored_sessions:2});
  const tasks=main.getByRole('region',{name:'并行工作对话',exact:true});
  await tasks.getByRole('heading',{name:'并行工作对话 · 2 项未结束',exact:true}).waitFor();
  assert.match(await tasks.getByRole('button',{name:'查看工作会话 aaaa.jsonl',exact:true}).textContent(),/状态待确认/);
  assert.equal(await tasks.getByRole('button',{name:'查看工作会话 bbbb.jsonl',exact:true}).count(),0);
  const brokenText=await tasks.getByRole('button',{name:'查看工作会话 cccc.jsonl',exact:true}).textContent();
  assert.match(brokenText,/无法读取/);assert.match(brokenText,/—/);
  passed.push('Unfinished task count does not claim quiet work is actively running; future completions are not listed as fresh');
  const heldNow=Date.now();
  const held={...emptySample(),poll_sequence:fixtureSequence++,state:'running',activity_status:'reasoning',activity_at:heldNow,checked_at:heldNow,current_rate:42,rate_status:'held_interval',rate_updated_at:heldNow-22000,rate_interval_seconds:4,output_tokens:240,running_seconds:40};
  for(const page of [main,mini])await page.evaluate(sample=>window.__pulsePush(sample),held);
  await main.getByRole('heading',{name:'推理有进展',exact:true}).waitFor();
  assert.equal(await mini.locator('.mini-rate b').textContent(),'42.0');
  assert.match(await mini.locator('.mini-rate').textContent(),/上次/);
  assert.match(await mini.locator('.mini-content').getAttribute('title'),/22 秒前/);
  assert.equal(await mini.locator('.mini-rate').evaluate(el=>el.classList.contains('held')),true);
  assert.equal(await mini.evaluate(()=>document.documentElement.scrollWidth<=272&&document.documentElement.scrollHeight<=64),true);
  await mini.screenshot({path:'test-results/held-rate-mini.png'});
  passed.push('Held Token/s stays visible with condensed status, report age in tooltip, and distinct style without overflow');
  // A stopped sampler must not leave a breathing "working" indicator behind.
  const stale={...emptySample(),poll_sequence:fixtureSequence++,state:'running',activity_status:'reasoning',checked_at:Date.now()-6000,activity_at:Date.now()};
  for(const page of [main,mini])await page.evaluate(sample=>window.__pulsePush(sample),stale);
  await main.getByRole('heading',{name:'监测未更新',exact:true}).waitFor();
  assert.equal(await mini.locator('.work-indicator').evaluate(el=>el.classList.contains('working')),false);
  passed.push('Stale monitoring heartbeat overrides a working state');
  // Drop event delivery entirely: overlay snapshots still recover while hidden.
  const recoveryNow=Date.now(),recovered={...emptySample(),poll_sequence:fixtureSequence++,state:'running',activity_status:'responding',activity_at:recoveryNow,checked_at:recoveryNow};
  await mini.evaluate(value=>{Object.defineProperty(document,'visibilityState',{get:()=> 'hidden',configurable:true});window.__pulseSetSnapshot(value);},recovered);
  await mini.getByRole('button',{name:/拖动悬浮条内容：回复有更新/}).waitFor({timeout:5000});
  passed.push('Background overlay recovers a missed push through native snapshots');
  const finishNow=Date.now(),finished={...emptySample(),poll_sequence:fixtureSequence++,state:'completed',activity_status:'completed',activity_at:finishNow,checked_at:finishNow,rate_status:'idle',current_rate:0,output_tokens:240,completion:{id:'test-summary',ended_at:finishNow,output_tokens:240,duration:12,average_rate:20,reason:'completed'},pulses:[{at:Math.floor(finishNow/2000)*2000,last_at:finishNow,count:2,kind:'completed'}]};
  for(const page of [main,mini])await page.evaluate(s=>window.__pulsePush(s),finished);
  await main.getByRole('region',{name:'本轮结算',exact:true}).waitFor();
  assert.equal(await mini.locator('.mini-rate b').textContent(),'0.0');assert.equal(await main.getByRole('region',{name:'本轮结算',exact:true}).getByText('20.0 Token/s',{exact:true}).count(),1);
  assert.equal(await main.locator('.pulse-strip .lit').count()>0,true);
  await mini.screenshot({path:'test-results/summary-mini.png'});
  const heartbeatOnly={...finished,poll_sequence:fixtureSequence++,checked_at:Date.now()};
  for(const page of [main,mini])await page.evaluate(s=>window.__pulsePush(s),heartbeatOnly);
  assert.equal(await mini.locator('.pulse-strip .lit').count(),1);
  passed.push('Main completion card labels final average; condensed overlay stays at zero current rate; heartbeat adds no pulse');
  const expired={...finished,poll_sequence:fixtureSequence++,checked_at:Date.now(),completion:{...finished.completion,ended_at:Date.now()-13000}};
  for(const page of [main,mini])await page.evaluate(s=>window.__pulsePush(s),expired);
  await main.getByRole('region',{name:'本轮结算',exact:true}).waitFor({state:'hidden'});
  assert.equal(await mini.locator('.mini-rate b').textContent(),'0.0');
  passed.push('Expired settlement returns to zero current rate');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile('test-results/status-browser.json',JSON.stringify({native_bridge_mock:true,real_client_accessed:false,passed,errors,external},null,2));
  console.log(JSON.stringify({passed:passed.length,checks:passed}));
}finally{await browser.close();}
