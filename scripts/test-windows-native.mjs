// Numeric/lifecycle fixtures only. This script NEVER reads real client logs.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const combined=process.argv.includes('--combined');
const bar=process.argv.includes('--bar');
fs.mkdirSync(path.join(project,'test-results'),{recursive:true});
const folder=fs.mkdtempSync(path.join(project,'test-results',process.platform+'-native-'));
fs.mkdirSync(path.join(folder,'logs','2026','10','24'),{recursive:true});
const db=new DatabaseSync(path.join(folder,'pulse.sqlite'));
db.exec('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({
 auto_monitor:true,follow_latest:false,pinned_log:'2026/10/24/1001.jsonl',
 overlay_enabled:true,overlay_layout:bar?'bar':'avatar',character:'roxy',
 hover_hide:false,keep_history:false,overlay_position:{x:80,y:200},
 task_display:combined?'combined':'separate'
}));
db.close();
const event=(name,payload,at=Date.now())=>fs.appendFileSync(path.join(folder,'logs',name),
 JSON.stringify({type:'event_msg',timestamp:new Date(at).toISOString(),payload})+'\n');
const count=(output,reasoning=10)=>({type:'token_count',info:{total_token_usage:{
 output_tokens:output,reasoning_output_tokens:reasoning}}});
for(const name of ['2026/10/24/1001.jsonl','2026/10/24/1002.jsonl'])event(name,count(100),Date.now()-120000);
fs.writeFileSync(path.join(folder,'logs','2026','10','24','1003.jsonl'),JSON.stringify({type:'session_meta',payload:{thread_source:'guardian_review'}})+'\n');
event('2026/10/24/1003.jsonl',{type:'task_started',turn_id:'synthetic_review'});

const manifest={synthetic:true,real_client_accessed:false,data_dir:folder,
 log_subdirectory:'logs',layout:bar?'bar':'avatar',display:combined?'combined':'separate',
 status:'prepared-only',native_executed:false};
fs.writeFileSync(path.join(folder,'fixture-manifest.json'),JSON.stringify(manifest,null,2));
if(process.argv.includes('--prepare-only')){console.log(JSON.stringify(manifest));process.exit(0);}
if(!['win32','darwin'].includes(process.platform))throw Error('This harness requires native Windows or macOS');
const macBuild=path.join(project,'src-tauri','target','universal-apple-darwin','release','bundle','macos','ChatGPT Pulse.app','Contents','MacOS','chatgpt-pulse');
const macPackaged=path.join(project,'release','.artifacts.noindex','ChatGPT Pulse.app','Contents','MacOS','chatgpt-pulse');
const binary=path.resolve(process.env.PULSE_APP||(process.platform==='win32'
 ?path.join(project,'src-tauri','target','release','chatgpt-pulse.exe')
 :fs.existsSync(macBuild)?macBuild:macPackaged));
if(!fs.existsSync(binary))throw Error('Build the native candidate first, or set absolute PULSE_APP');
const renderer=process.platform==='win32'?'WebView2':'WKWebView';
const env={...process.env,PULSE_OFFLINE_TEST:'1',PULSE_DATA_DIR:folder,PULSE_RENDER_PROBE:'1'};
delete env.PULSE_TEST_STALE_PULL;
const child=spawn(binary,['--background'],{cwd:project,env,stdio:'ignore'});
let spawnError;child.on('error',e=>spawnError=e);
const exited=new Promise(resolve=>child.once('close',resolve));
const probe=name=>{try{return JSON.parse(fs.readFileSync(path.join(folder,'probe-'+name+'.json'),'utf8'));}catch{return {};}};
async function until(test,label){
 const end=Date.now()+20000;
 while(Date.now()<end){
  if(spawnError)throw spawnError;
  if(child.exitCode!==null||child.signalCode!==null)throw Error('Native app exited during '+label);
  if(test())return;
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('Native timeout: '+label);
}
const outputs=()=>Object.fromEntries(probe('sampler').sessions?.map(r=>[r.id,r.output])||[]);
const rendered=()=>Object.fromEntries(probe('overlay').rendered_tasks||[]);
const checks=[];
try{
 await until(()=>probe('sampler').sessions?.length===2,'baseline discovery');
 for(const [name,n] of [['2026/10/24/1001.jsonl',130],['2026/10/24/1002.jsonl',170]]){
  event(name,{type:'task_started',turn_id:name==='2026/10/24/1001.jsonl'?'1001':'1002'},Date.now()-1000);
  event(name,count(n,20));
 }
 await until(()=>outputs()['2026/10/24/1001.jsonl']===30&&outputs()['2026/10/24/1002.jsonl']===70,'separate numeric deltas');
 checks.push('Two independent cumulative deltas: 30 and 70; reasoning not added to output');
 const beforeDuplicate=probe('sampler').sequence;
 event('2026/10/24/1001.jsonl',count(130,20));event('2026/10/24/1002.jsonl',count(170,20));
 await until(()=>probe('sampler').sequence>=beforeDuplicate+2,'duplicate polling');
 assert.deepEqual(outputs(),{'2026/10/24/1001.jsonl':30,'2026/10/24/1002.jsonl':70});
 checks.push('Duplicate counts did not accumulate twice');
 event('2026/10/24/1001.jsonl',{type:'item_completed',turn_id:'1001',item:{type:'reasoning',id:'synthetic_reasoning',content:'SYNTHETIC_BODY_NOT_EXPORTED'}});
 await until(()=>probe('sampler').activity==='reasoning','paginated reasoning metadata');
 event('2026/10/24/1001.jsonl',{type:'item_completed',turn_id:'foreign',item:{type:'agentMessage',id:'synthetic_foreign'}});
 const beforeForeign=probe('sampler').sequence;
 await until(()=>probe('sampler').sequence>=beforeForeign+2,'foreign paginated item polling');
 assert.equal(probe('sampler').activity,'reasoning');
 event('2026/10/24/1001.jsonl',{type:'item_completed',turn_id:'1001',item:{type:'agentMessage',id:'synthetic_message',text:'SYNTHETIC_BODY_NOT_EXPORTED'}});
 await until(()=>probe('sampler').activity==='responding','paginated assistant metadata');
 assert.deepEqual(outputs(),{'2026/10/24/1001.jsonl':30,'2026/10/24/1002.jsonl':70});
 checks.push('Paginated reasoning and response progress follows its own turn without changing Token counts');

 await until(()=>rendered()['2026/10/24/1001.jsonl']===30&&rendered()['2026/10/24/1002.jsonl']===70,renderer+' rendered both tasks');
 assert.equal(probe('overlay').rendered_avatar_count,1);
 assert.deepEqual(probe('windows').tasks,{});
 checks.push('Native '+renderer+' rendered both task values with exactly one avatar and no detached windows');
 event('2026/10/24/1001.jsonl',{type:'task_complete',turn_id:'1001',duration_ms:1000});
 event('2026/10/24/1002.jsonl',count(190,25));
 await until(()=>probe('sampler').sessions?.some(r=>r.id==='2026/10/24/1001.jsonl'&&r.state==='completed')&&
  probe('sampler').sessions?.some(r=>r.id==='2026/10/24/1002.jsonl'&&r.state==='running'&&r.output===90),'one completion');
 checks.push('Completing 1001 leaves 1002 running at 90');
 event('2026/10/24/1002.jsonl',{type:'turn_aborted',turn_id:'1002',duration_ms:2000});
 await until(()=>probe('sampler').sessions?.some(r=>r.id==='2026/10/24/1002.jsonl'&&r.state==='aborted'),'second abort');
 checks.push('Abort ends only its own task');
 // Record success only after process cleanup and the history assertion.
}catch(error){
 fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({...manifest,status:'failed',
  native_executed:!!child.pid,passed:false,checks,error:String(error)},null,2));
 throw error;
}finally{
 // This is test-process cleanup, not the app's graceful-exit acceptance test.
 if(child.exitCode===null&&child.signalCode===null)child.kill();
 await exited;
 const history=new DatabaseSync(path.join(folder,'pulse.sqlite'),{readOnly:true});
 try{assert.equal(history.prepare('SELECT COUNT(*) AS n FROM log_observations').get().n,0);}
 finally{history.close();}
 // Test flags were passed only to the child; no parent/user environment mutation.
}

fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({...manifest,status:'passed',native_executed:true,passed:true,checks},null,2));
console.log(JSON.stringify({synthetic:true,passed:true,folder,checks}));
