import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {chromium} from './playwright.mjs';import {defaults,emptySample} from '../src/lib/domain.js';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(({settings,sample})=>{
  globalThis.isTauri=true;let callback=0;window.historyCalls=0;
  const row={started_at:Date.now(),duration:10,output_tokens:100,reasoning_tokens:10,average_rate:10,source:'logs',reason:'completed'};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback(){return ++callback;},async invoke(cmd){
   if(cmd==='plugin:event|listen')return callback;if(cmd==='plugin:event|unlisten')return;
   if(cmd==='bootstrap')return {settings,sample,history:[row],logs:[],platform:'macos',startup:{supported:false}};
   if(cmd==='sample_snapshot')return sample;if(cmd==='settings_snapshot')return settings;
   if(cmd==='history'){window.historyCalls++;if(window.historyCalls===1)return new Promise(r=>window.resolveHistory=()=>r([row]));throw Error('记录读取失败');}
   if(cmd==='clear_history')return;throw Error(cmd);
  }};
 },{settings:{...defaults,keep_history:true},sample:emptySample()});
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'本地记录'}).click();await page.waitForFunction(()=>!!window.resolveHistory);
 await page.getByRole('button',{name:'清空记录',exact:true}).click();await page.getByRole('heading',{name:'暂无记录',exact:true}).waitFor();
 await page.evaluate(()=>window.resolveHistory());await page.waitForTimeout(100);
 assert.equal(await page.locator('tbody tr').count(),0);
 await page.getByRole('button',{name:'实时概览'}).click();await page.getByRole('button',{name:'本地记录'}).click();await page.getByRole('alert').filter({hasText:'记录读取失败'}).waitFor();
 assert.deepEqual(errors,[]);const result={passed:true,checks:['A history response started before Clear cannot restore deleted rows','History read failures show an alert without an unhandled rejection'],errors};await writeFile('test-results/history-race-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
