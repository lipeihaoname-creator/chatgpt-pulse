import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {idleExchanges,exchangeMoods} from '../src/lib/idle-lines.js';import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:280,height:128}});
 await context.addInitScript(({base,initial})=>{
  globalThis.isTauri=true;let n=0,seq=0,phase='idle',settings=JSON.parse(localStorage.getItem('feature-test-settings')||'null')||initial;const callbacks=new Map(),listeners=new Map();window.menuRequests=0;window.dragRequests=0;
  const snapshot=()=>{if(phase==='idle')return {...base,state:'waiting',checked_at:Date.now(),poll_sequence:++seq};const rows=(phase==='idle'?['a']:['a','b']).map((id,i)=>({...base,log_id:id,state:phase==='idle'?'waiting':'running',activity_status:phase==='idle'?'waiting':i?'tool':phase,activity_at:Date.now()-(phase==='quiet'?40000:0),checked_at:Date.now(),current_rate:i?20:10,rate_status:'reported_interval',rate_updated_at:Date.now(),output_tokens:i?70:30}));return {...rows[0],overlay_log_id:'a',sessions:rows,monitored_sessions:2,checked_at:Date.now(),poll_sequence:++seq};};
  const emit=(event,payload)=>{for(const id of listeners.get(event)||[])callbacks.get(id)?.({payload});};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search?'overlay':'main'},currentWebview:{label:location.search?'overlay':'main'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}if(cmd==='bootstrap'||cmd==='bootstrap_overlay')return {settings,sample:snapshot(),history:[],logs:[],startup:{},overlay_interaction:{}};if(cmd==='sample_snapshot')return snapshot();if(cmd==='settings_snapshot')return settings;if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};if(cmd==='overlay_menu'){window.menuRequests++;return;}if(cmd==='overlay_drag'){window.dragRequests++;return;}if(cmd==='patch_settings'){settings={...settings,[args.key]:args.value,revision:settings.revision+1};localStorage.setItem('feature-test-settings',JSON.stringify(settings));emit('pulse:settings',settings);return settings;}throw Error(cmd);}};
  window.phase=(value)=>{phase=value;emit('pulse:sample',snapshot());};window.interaction=value=>emit('pulse:overlay',value);window.patch=(value)=>{settings={...settings,...value,revision:settings.revision+1};emit('pulse:settings',settings);};
 },{base:emptySample(),initial:{...defaults,overlay_layout:'avatar',character:'roxy',theme:'spellbook',animations:true,overlay_enabled:true,task_names:{b:'代码'}}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install({time:new Date('2026-10-23T04:00:00Z')});await page.addInitScript(()=>Math.random=()=>0);
 await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});await page.clock.runFor(1000);
 assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);
 await page.clock.runFor(19000);assert.ok(await page.locator('.mini').getAttribute('data-idle-mood'));assert.equal(await page.locator('.character-portrait').last().getAttribute('data-expression'),'6');checks.push('Idle expression/motion appears on a separate randomized deadline');
 await page.clock.runFor(73000);const opening=await page.getByLabel('头像对话',{exact:true}).innerText();assert.ok(opening.length>3);assert.equal(await page.locator('.mini').getAttribute('data-pulse-activity'),'waiting');
 const openingText=await page.getByLabel('头像对话',{exact:true}).locator('p').getAttribute('aria-label');
 const exchangeIndex=idleExchanges.roxy.findIndex(lines=>lines[0]===openingText);assert.ok(exchangeIndex>=0);
 assert.equal(await page.locator('.mini').getAttribute('data-idle-mood'),exchangeMoods.roxy[exchangeIndex][0]);
 await page.locator('.mini-grip').press('Enter');await page.clock.runFor(3000);const reply=await page.getByLabel('头像对话',{exact:true}).innerText();assert.notEqual(reply,opening);await page.locator('.mini-grip').press('Enter');await page.clock.runFor(3000);assert.notEqual(await page.getByLabel('头像对话',{exact:true}).innerText(),reply);checks.push('Random idle opening accepts two linked avatar-click replies while true status stays waiting');
 assert.equal(await page.locator('.mini').getAttribute('data-idle-mood'),exchangeMoods.roxy[exchangeIndex][2]);
 assert.equal(await page.locator('.character-portrait').getAttribute('data-emotion'),'bashful');
 await page.clock.runFor(3000);assert.equal(await page.locator('.character-portrait').getAttribute('data-emotion'),'bashful');
 checks.push('Authored line moods reach the actual portrait and stay through a reply instead of reverting halfway');
 await page.evaluate(()=>window.phase('tool'));await page.clock.runFor(1000);assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);assert.equal(await page.locator('.mini').getAttribute('data-idle-mood'),'');await page.clock.runFor(200000);assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);checks.push('New work immediately interrupts idle speech and prevents further idle triggers');
 await page.evaluate(()=>{window.phase('idle');window.patch({do_not_disturb:true});});await page.clock.runFor(300000);assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);assert.equal(await page.locator('.mini').getAttribute('data-idle-mood'),'');
 await page.evaluate(()=>window.patch({do_not_disturb:false,idle_chat:false}));await page.clock.runFor(200000);assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(60000);assert.equal(await page.locator('.mini').getAttribute('data-idle-mood'),'');checks.push('DND and chat-off stop proactive lines; reduced motion stops idle gestures');
 // Continuous movement survives the single-face blink bridge.
 const motionPage=await context.newPage();motionPage.on('pageerror',e=>errors.push(String(e)));
 await motionPage.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 await motionPage.locator('.mini-grip').press('Enter');
 await motionPage.waitForTimeout(1400);
 await motionPage.evaluate(()=>{
  window.originalPose=document.querySelector('.pose');window.originalBreath=document.querySelector('.breath');
  const gesture=window.originalPose.getAnimations()[0];gesture.currentTime=1800;
  window.beforePose=getComputedStyle(window.originalPose).transform;
  window.beforeBreath=window.originalBreath.getAnimations()[0];
  window.beforeBlink=document.querySelector('.expression-frame:last-child .blink').getAnimations()[0].effect.getComputedTiming().progress;
 });
 await motionPage.locator('.mini-grip').press('Enter');
 const continuity=await motionPage.evaluate(()=>{
  const pose=document.querySelector('.pose'),frames=pose.getAnimations()[0].effect.getKeyframes();
  const a=new DOMMatrix(window.beforePose),b=new DOMMatrix(frames[0].transform);
  return {pose:pose===window.originalPose,breath:document.querySelector('.breath')===window.originalBreath&&window.beforeBreath===window.originalBreath.getAnimations()[0],jump:Math.max(...['a','b','c','d','e','f'].map(k=>Math.abs(a[k]-b[k]))),blinks:document.querySelectorAll('.expression-frame .blink').length};
 });
 assert.ok(continuity.pose&&continuity.breath);assert.ok(continuity.jump<.2,JSON.stringify(continuity));
 await motionPage.waitForTimeout(650);
 assert.equal(await motionPage.locator('.expression-frame').count(),1);
 assert.equal(await motionPage.locator('.character-portrait').getAttribute('data-swap-phase'),'');
 await motionPage.evaluate(()=>window.lastNod=document.querySelector('.pose').getAnimations()[0]);
 await motionPage.locator('.mini-grip').press('Enter');
 assert.ok(await motionPage.evaluate(()=>document.querySelector('.pose').getAnimations()[0]!==window.lastNod),'Each linked reply acknowledges the click even when it uses the same nod');
 await motionPage.evaluate(()=>window.patch({animations:false}));
 await motionPage.waitForTimeout(100);
 assert.equal(await motionPage.locator('.pose').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length),0);
 checks.push('Persistent pose and breathing survive facial transitions; interrupted gestures continue from their current pose; single-face blink bridge finishes cleanly; repeated linked clicks each acknowledge the user');
 await motionPage.close();
 // Native proximity signals must pause, rather than restart, the random deadline.
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>window.patch({idle_chat:true,idle_motions:false,idle_frequency:'lively'}));
 for(let i=0;i<6;i++){
  await page.clock.runFor(8000);await page.evaluate(()=>window.interaction({grip_active:true,faded:true}));
  await page.clock.runFor(2000);await page.evaluate(()=>window.interaction({grip_active:false,faded:false}));
 }
 assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),1);
 checks.push('Repeated native hover/fade pauses preserve the random opening instead of starving it');
 assert.deepEqual(errors,[]);await writeFile('test-results/idle-companion-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
