// A late bootstrap cannot replace the actual fixed source shown by newer samples.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(({base,empty})=>{
  globalThis.isTauri=true;let next=1;const callbacks=new Map(),calls=[],listeners=new Map();
  let files=['a','b'].map(id=>({id:id+'.jsonl',label:id,modified:Date.now()}));
  const settings={...base,follow_latest:false,pinned_log:'b.jsonl',revision:5};
  let sample={...empty,stream_epoch:1,poll_sequence:10,checked_at:Date.now(),state:'running',log_id:'b.jsonl',follow_latest:false,activity_status:'reasoning',activity_at:Date.now()};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){const id=next++;callbacks.set(id,fn);return id;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){listeners.set(args.event,args.handler);return args.handler;}
   if(cmd==='list_logs')return files;
   if(cmd==='sample_snapshot')return sample;
   if(cmd==='settings_snapshot')return settings;
   if(cmd==='bootstrap'){
    await new Promise(resolve=>setTimeout(resolve,300));
    return {settings,sample:empty,history:[],logs:files,selected_log:'a.jsonl',platform:'macos',startup:{supported:false}};
   }
   if(cmd==='history')return [];
   if(cmd==='control'){
    calls.push(args);sample={...empty,stream_epoch:sample.stream_epoch+1,checked_at:Date.now(),log_id:args.action==='live'?args.logId:null,state:args.action==='live'?'running':'paused'};return sample;
   }
   throw Error('Unexpected command '+cmd);
  }};
  globalThis.__pulseControlCalls=calls;
  globalThis.__pulseMissingSource=()=>{files=[];sample={...empty,stream_epoch:sample.stream_epoch,poll_sequence:20,checked_at:Date.now(),state:'unavailable',log_id:'b.jsonl',follow_latest:false};callbacks.get(listeners.get('pulse:logs'))?.({payload:files});};
 },{base:defaults,empty:emptySample()});
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
 await page.getByText('监测详情',{exact:true}).click();
 const picker=page.getByRole('combobox',{name:'日志会话',exact:true});assert.equal(await picker.inputValue(),'b.jsonl');
 await page.getByRole('button',{name:'暂停监测'}).click();assert.equal(await picker.inputValue(),'b.jsonl');
 await page.getByRole('button',{name:'开始监测'}).click();
 const calls=await page.evaluate(()=>window.__pulseControlCalls);assert.equal(calls.at(-1).logId,'b.jsonl');assert.deepEqual(errors,[]);
 await page.evaluate(()=>window.__pulseMissingSource());
 await page.waitForFunction(()=>document.querySelector('.shell')?.dataset.pulseSequence==='20');
 assert.equal(await picker.inputValue(),'b.jsonl');
 await page.getByRole('button',{name:'暂停监测'}).click();
 await page.getByRole('button',{name:'刷新列表',exact:true}).click();
 assert.equal(await picker.inputValue(),'b.jsonl');
 await page.getByRole('button',{name:'开始监测'}).click();
 assert.equal((await page.evaluate(()=>window.__pulseControlCalls)).at(-1).logId,'b.jsonl');assert.deepEqual(errors,[]);
 const result={passed:true,checks:['Actual fixed source wins over a late bootstrap selection','Pause and resume preserve the displayed fixed source','A fixed source absent from the current list remains visible and survives refreshing the list'],errors,real_client_accessed:false};await writeFile('test-results/source-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
