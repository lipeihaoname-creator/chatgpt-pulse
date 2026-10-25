// Native first-run/reconnect fixtures, isolated from all real user data.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve('test-results');
const folder=fs.mkdtempSync(path.join(root,'首次 启动-'));
const binary=path.resolve('src-tauri/target/release/chatgpt-pulse.exe');
const env={...process.env,PULSE_OFFLINE_TEST:'1',PULSE_DATA_DIR:folder,PULSE_RENDER_PROBE:'1'};
let child,closed;
const probe=()=>{try{return JSON.parse(fs.readFileSync(path.join(folder,'probe-sampler.json'),'utf8'));}catch{return {};}};
async function until(test,label){const end=Date.now()+20000;while(Date.now()<end){if(child.exitCode!==null)throw Error('App exited: '+label);if(test())return;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout: '+label);}
function launch(){child=spawn(binary,['--background'],{env,windowsHide:true,stdio:'ignore'});closed=new Promise(resolve=>child.once('close',resolve));}
async function stop(){child.kill();await closed;}
const checks=[];
try{
 launch();await until(()=>probe().sequence>=3,'first-run sample');
 assert.notEqual(probe().state,'running');assert.equal(probe().output_tokens,null);
 checks.push('Empty Unicode data directory starts without real logs or invented usage');
 const logs=path.join(folder,'logs');fs.mkdirSync(logs);
 const file=path.join(logs,'1001.jsonl');
 const event=p=>fs.appendFileSync(file,JSON.stringify({type:'event_msg',timestamp:new Date().toISOString(),payload:p})+'\n');
 event({type:'token_count',info:{total_token_usage:{output_tokens:0,reasoning_output_tokens:0}}});
 event({type:'task_started',turn_id:'fresh-numeric'});
 event({type:'token_count',info:{total_token_usage:{output_tokens:6,reasoning_output_tokens:1}}});
 await until(()=>probe().state==='running'&&probe().output_tokens===6,'new logs detected');
 checks.push('A log created after startup is discovered automatically with exact numeric usage');
 event({type:'task_complete',turn_id:'fresh-numeric',duration_ms:1000});
 await until(()=>probe().state==='completed'&&probe().output_tokens===6,'matched completion');
 checks.push('Real native parser/render loop receives the synthetic matched completion');
 await stop();fs.rmSync(path.join(folder,'probe-sampler.json'));
 launch();await until(()=>probe().sequence>=3,'restart');
 assert.equal(probe().state,'completed');assert.equal(probe().output_tokens,6);
 checks.push('Restart reopens the Unicode settings database and replays the same count without duplication');
 const report={passed:true,synthetic:true,real_user_data_accessed:false,native_executed:true,checks};
 fs.writeFileSync(path.join(root,'evidence','hardening-fresh-native.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{if(child&&child.exitCode===null)await stop();}
