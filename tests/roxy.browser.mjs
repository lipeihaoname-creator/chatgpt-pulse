import {assetUrl} from './production-assets.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {defaults,emptySample} from '../src/lib/domain.js';
import {roxyDialoguePools,dialoguePools} from '../src/lib/dialogue.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];
try{
 const settingsPage=await browser.newPage({viewport:{width:1160,height:1000}});
 settingsPage.on('pageerror',e=>errors.push(String(e)));
 await settingsPage.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
 await settingsPage.getByRole('button',{name:'偏好设置'}).click();
 await settingsPage.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');
 await settingsPage.getByRole('combobox',{name:'角色头像',exact:true}).selectOption('roxy');
 await settingsPage.getByRole('button',{name:'魔法书蓝',exact:true}).click();
 const preview=settingsPage.getByLabel('外观预览',{exact:true}),portrait=preview.locator('.character-portrait');
 for(const [label,cell] of [['等候',0],['专注',1],['思考',2],['输出',3],['工具',4],['等你',5],['完成',6],['待确认',7],['不可读',8]]){
  await settingsPage.getByRole('button',{name:label,exact:true}).click();
  assert.equal(await portrait.getAttribute('data-character'),'roxy');
  assert.equal(await portrait.getAttribute('data-expression'),String(cell));
  assert.ok((await portrait.getAttribute('aria-label')).startsWith('洛琪希'));
  await settingsPage.waitForFunction(()=>document.querySelector('[aria-label="外观预览"] .expression-frame')?.dataset.frameCharacter==='roxy');
  assert.ok((await portrait.locator('.open').last().evaluate(el=>getComputedStyle(el).backgroundImage)).includes(assetUrl('src/assets/roxy/open.png')));
 }
 await settingsPage.getByRole('button',{name:'思考',exact:true}).click();
 await settingsPage.waitForFunction(()=>{const p=document.querySelector('[aria-label="外观预览"] .character-portrait');return p?.dataset.swapPhase===''&&p.querySelector('.expression-frame')?.dataset.renderedExpression==='2';});
 for(const frame of ['open','half','blink']){
  const url=await portrait.locator('.'+frame).last().evaluate(el=>getComputedStyle(el).backgroundImage.slice(5,-2));
  assert.ok(url.endsWith(assetUrl(`src/assets/roxy/${frame}.png`)));assert.equal(await settingsPage.evaluate(async url=>{const i=new Image();i.src=url;await i.decode();return i.naturalWidth>0;},url),true);
 }
 assert.ok(await portrait.locator('.blink').last().evaluate(el=>getComputedStyle(el).animationName.includes('blink')));
 await settingsPage.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await portrait.locator('.open').last().evaluate(el=>getComputedStyle(el).animationName),'none');
 await preview.locator('.character-portrait:not(.animated)').waitFor();
 await settingsPage.getByRole('button',{name:'完成',exact:true}).click();
 const reducedTransitions=await portrait.locator('.expression-frame').evaluateAll(elements=>elements.flatMap(el=>el.getAnimations()).filter(animation=>['running','paused'].includes(animation.playState)).map(animation=>animation.effect.getComputedTiming().duration));
 assert.equal(reducedTransitions.some(duration=>Number(duration)>0),false,'Live reduced-motion preference must stop expression crossfades: '+JSON.stringify(reducedTransitions));
 await settingsPage.emulateMedia({reducedMotion:'no-preference'});
 checks.push('Roxy has nine real state portraits and decoded open/half/closed frames; reduced motion stops animation');
 await settingsPage.reload({waitUntil:'networkidle'});await settingsPage.getByRole('button',{name:'偏好设置'}).click();
 assert.equal(await settingsPage.getByRole('combobox',{name:'角色头像',exact:true}).inputValue(),'roxy');
 assert.equal(await settingsPage.getByRole('button',{name:'魔法书蓝',exact:true}).getAttribute('aria-pressed'),'true');
 await settingsPage.screenshot({path:'test-results/roxy-settings.png',fullPage:true});
 await settingsPage.getByRole('combobox',{name:'角色头像',exact:true}).selectOption('mai');
 assert.equal(await portrait.getAttribute('data-character'),'mai');
 await settingsPage.waitForFunction(()=>document.querySelector('[aria-label="外观预览"] .expression-frame')?.dataset.frameCharacter==='mai');
 assert.ok((await portrait.locator('.open').last().evaluate(el=>getComputedStyle(el).backgroundImage)).includes(assetUrl('src/assets/mai/open.png')));
 assert.equal(await settingsPage.getByRole('button',{name:'魔法书蓝',exact:true}).getAttribute('aria-pressed'),'true');
 checks.push('Roxy and spellbook persist independently; switching back preserves Mai and the chosen palette');

 const context=await browser.newContext({viewport:{width:280,height:168}});
 await context.addInitScript(({settings,base})=>{
  globalThis.isTauri=true;let n=0,seq=0,tap=0;const callbacks=new Map(),listeners=new Map();
  let sample={...base,log_id:'a',state:'running',activity_status:'reasoning',activity_at:Date.now(),current_rate:42.8,rate_status:'reported_interval',rate_updated_at:Date.now()};
  const snapshot=()=>({...sample,checked_at:Date.now(),poll_sequence:++seq});
  const emit=(name,payload)=>{for(const id of listeners.get(name)||[])callbacks.get(id)?.({payload});};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'},currentWebview:{label:location.search.includes('overlay')?(new URLSearchParams(location.search).get('session')?'task-b':'overlay'):'main'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}
   if(cmd==='bootstrap_overlay')return {settings,sample:snapshot(),overlay_interaction:{}};
   if(cmd==='sample_snapshot')return snapshot();if(cmd==='settings_snapshot')return settings;
   if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};
   if(cmd==='overlay_edit'){settings={...settings,locked:!args.editing,revision:settings.revision+1};emit('pulse:settings',settings);return settings.locked;}
   throw Error(cmd);
  }};
  globalThis.setSetting=(key,value)=>{settings={...settings,[key]:value,revision:settings.revision+1};emit('pulse:settings',settings);};
  globalThis.setSample=value=>{sample={...sample,...value,activity_at:Date.now()};emit('pulse:sample',snapshot());};
  globalThis.tap=()=>emit('pulse:pet-tap',{id:++tap});
 },{settings:{...defaults,overlay_enabled:true,overlay_layout:'avatar',character:'roxy',theme:'spellbook',animations:false},base:emptySample()});
 const overlay=await context.newPage();overlay.on('pageerror',e=>errors.push(String(e)));
 await overlay.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 await overlay.evaluate(()=>window.tap());const dialogue=overlay.getByLabel('头像对话',{exact:true});await dialogue.waitFor();
 assert.equal(await overlay.locator('.dialogue-kind').textContent(),'洛琪希');
 assert.ok(roxyDialoguePools.working.includes(await dialogue.locator('p').getAttribute('aria-label')));
 assert.equal(await overlay.locator('.mini-rate b').textContent(),'42.8');
 await overlay.emulateMedia({reducedMotion:'reduce'});
 await dialogue.locator('.typing-cursor:not(.typing)').waitFor({state:'attached',timeout:300});
 assert.equal(await dialogue.locator('p').textContent(),await dialogue.locator('p').getAttribute('aria-label'));
 await overlay.emulateMedia({reducedMotion:'no-preference'});
 checks.push('Enabling reduced motion while open stops expression transitions and immediately completes an in-progress typed line');
 await overlay.evaluate(()=>window.setSetting('character','mai'));await dialogue.waitFor({state:'hidden'});
 await overlay.evaluate(()=>window.tap());await dialogue.waitFor();assert.ok(dialoguePools.working.includes(await dialogue.locator('p').getAttribute('aria-label')));
 await overlay.evaluate(()=>{window.setSetting('character','roxy');window.setSample({state:'completed',activity_status:'completed',rate_status:'idle',completion:{id:'roxy-complete',ended_at:Date.now(),reason:'completed'}});});
 const scene=overlay.getByLabel('完成小剧场',{exact:true});await scene.waitFor();
 assert.equal(await overlay.locator('.dialogue-kind').textContent(),'洛琪希');assert.ok(roxyDialoguePools.completed.includes(await scene.locator('p').getAttribute('aria-label')));
 assert.equal(await overlay.locator('.mini-rate b').textContent(),'0.0');
 await overlay.screenshot({path:'test-results/roxy-completion.png'});
 await overlay.evaluate(()=>window.setSetting('do_not_disturb',true));await scene.waitFor({state:'hidden'});
 await overlay.evaluate(()=>{window.setSetting('do_not_disturb',false);window.setSetting('locked',false);});
 for(const name of ['完成','取消']){const box=await overlay.getByRole('button',{name,exact:true}).boundingBox();assert.ok(box.y>=128&&box.y+box.height<=168&&box.x+box.width<=280);}
 await overlay.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await overlay.getByRole('button',{name:'完成',exact:true}).count(),0);
 checks.push('Character changes clear old speech; Roxy completion uses her lines, keeps real metrics, respects DND, and edit cancellation works');
 for(const page of [settingsPage,overlay])assert.equal(await page.locator('vite-error-overlay').count(),0);
 assert.deepEqual(errors,[]);
 await writeFile('test-results/roxy-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
