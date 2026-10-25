// Isolated numeric fixture: a new log lacks the task baseline but has timed reports.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const root=path.resolve('test-results');
fs.mkdirSync(root,{recursive:true});
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
const folder=fs.mkdtempSync(path.join(root,'first-usage-'));
const logs=path.join(folder,'logs');fs.mkdirSync(logs);
const file=path.join(logs,'1001.jsonl');
const db=new DatabaseSync(path.join(folder,'pulse.sqlite'));
db.exec('CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL)');
db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({auto_monitor:true,follow_latest:true,overlay_enabled:true,show_total:true,overlay_layout:'avatar',hover_hide:false}));db.close();
const base=Date.now()-230000;
const event=(at,payload)=>fs.appendFileSync(file,JSON.stringify({type:'event_msg',timestamp:new Date(at).toISOString(),payload})+'\n');
const count=output=>({type:'token_count',info:{total_token_usage:{output_tokens:output,reasoning_output_tokens:100}}});
event(base,{type:'task_started',turn_id:'numeric-first'});
event(base+212000,count(1000));
const macBuild='src-tauri/target/universal-apple-darwin/release/bundle/macos/ChatGPT Pulse.app/Contents/MacOS/chatgpt-pulse';
const macPackaged='release/.artifacts.noindex/ChatGPT Pulse.app/Contents/MacOS/chatgpt-pulse';
const binary=path.resolve(process.env.PULSE_APP||(process.platform==='win32'
 ?'src-tauri/target/release/chatgpt-pulse.exe':fs.existsSync(macBuild)?macBuild:macPackaged));
const child=spawn(binary,['--background'],{env:{...process.env,PULSE_OFFLINE_TEST:'1',PULSE_DATA_DIR:folder,PULSE_RENDER_PROBE:'1'},windowsHide:true,stdio:'ignore'});
let spawnError;child.on('error',error=>spawnError=error);
const closed=new Promise(resolve=>child.once('close',resolve));
const probe=name=>{try{return JSON.parse(fs.readFileSync(path.join(folder,'probe-'+name+'.json'),'utf8'));}catch{return {};}};
async function until(test,label){const end=Date.now()+20000;while(Date.now()<end){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('App exited: '+label);if(test())return;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('Native timeout: '+label);}
const checks=[];
try{
 await until(()=>probe('sampler').sequence>=3&&probe('sampler').state==='running','first report');
 assert.equal(probe('sampler').output_tokens,null);
 assert.equal(probe('sampler').current_rate,null);
 checks.push('First real-shaped snapshot cannot establish a task total or rate');
 event(base+222000,count(1020));
 await until(()=>probe('sampler').current_rate===2,'second report interval');
 assert.equal(probe('sampler').output_tokens,null);
 await until(()=>probe('overlay').rendered_sequence>=probe('sampler').sequence-2,'WebView receives the updated sample');
 assert.equal(probe('overlay').rendered_output_tokens,null);
 checks.push('Two timed cumulative snapshots yield 2 Token/s, never a fabricated task total');
 event(Date.now(),{type:'task_complete',turn_id:'numeric-first',duration_ms:Date.now()-base});
 await until(()=>probe('sampler').state==='completed','completion');
 assert.equal(probe('sampler').output_tokens,null);
 checks.push('Completion still preserves the unknown task total');
 const report={version:'0.16.6',passed:true,synthetic:true,real_user_data_accessed:false,native_executed:true,checks};
 fs.writeFileSync(path.join(root,'evidence','usage-gap-native-first-usage.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{if(child.exitCode===null)child.kill();await closed;}
