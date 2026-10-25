import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {defaults,emptySample} from '../src/lib/domain.js';
import {chromium} from './playwright.mjs';const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:280,height:176}});
 await context.addInitScript(({base,initial})=>{
  globalThis.isTauri=true;let n=0,seq=0,phase='reasoning',settings=JSON.parse(localStorage.getItem('feature-test-settings')||'null')||initial;const callbacks=new Map(),listeners=new Map();window.menuRequests=0;window.dragRequests=0;
  const snapshot=()=>{const rows=['a','b'].map((id,i)=>({...base,log_id:id,state:'running',activity_status:i?'tool':phase,activity_at:Date.now()-(phase==='quiet'?40000:0),checked_at:Date.now(),current_rate:i?20:10,rate_status:'reported_interval',rate_updated_at:Date.now(),output_tokens:i?70:30}));return {...rows[0],overlay_log_id:'a',sessions:rows,monitored_sessions:2,checked_at:Date.now(),poll_sequence:++seq};};
  const emit=(event,payload)=>{for(const id of listeners.get(event)||[])callbacks.get(id)?.({payload});};
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search?'overlay':'main'},currentWebview:{label:location.search?'overlay':'main'}},transformCallback(fn){callbacks.set(++n,fn);return n;},async invoke(cmd,args){if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}if(cmd==='bootstrap'||cmd==='bootstrap_overlay')return {settings,sample:snapshot(),history:[],logs:[],startup:{},overlay_interaction:{}};if(cmd==='sample_snapshot')return snapshot();if(cmd==='settings_snapshot')return settings;if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};if(cmd==='overlay_menu'){window.menuRequests++;return;}if(cmd==='overlay_drag'){window.dragRequests++;return;}if(cmd==='patch_settings'){settings={...settings,[args.key]:args.value,revision:settings.revision+1};localStorage.setItem('feature-test-settings',JSON.stringify(settings));emit('pulse:settings',settings);return settings;}throw Error(cmd);}};
  window.phase=(value)=>{phase=value;emit('pulse:sample',snapshot());};window.patch=(value)=>{settings={...settings,...value,revision:settings.revision+1};emit('pulse:settings',settings);};
 },{base:emptySample(),initial:{...defaults,overlay_layout:'avatar',character:'roxy',theme:'spellbook',animations:true,overlay_enabled:true,task_names:{b:'代码'}}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.task-tag').count(),2);assert.equal(await page.locator('.task-nickname').innerText(),'代码');assert.ok(!/Work|jsonl|…/.test(await page.locator('.mini').innerText()));const colors=await page.locator('.task-tag').evaluateAll(es=>es.map(e=>getComputedStyle(e).color));
 await page.locator('.mini-grip').click({button:'right'});assert.equal(await page.evaluate(()=>window.menuRequests),1);assert.equal(await page.evaluate(()=>window.dragRequests),0);assert.equal(await page.getByLabel('头像对话',{exact:true}).count(),0);checks.push('Right click requests native quick menu once without dragging or starting dialogue');
 const grip=page.locator('.mini-grip');
 const states=[];
 for(const layout of ['avatar','bar'])for(const locked of [true,false])for(const nativeGrip of [false,true])for(const hover of [false,true]){
  await page.evaluate(({layout,locked,nativeGrip})=>{window.patch({overlay_layout:layout,locked});document.querySelector('.mini').classList.toggle('grip-active',nativeGrip);},{layout,locked,nativeGrip});
  if(hover)await grip.hover();else await page.mouse.move(275,175);
  await page.waitForTimeout(220);
  const color=await grip.evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(color,'rgba(0, 0, 0, 0)',JSON.stringify({layout,locked,nativeGrip,hover,color}));states.push({layout,locked,nativeGrip,hover,color});
 }
 await page.evaluate(()=>window.patch({overlay_layout:'avatar',locked:true}));
 await grip.hover();await page.mouse.down();await page.waitForTimeout(220);assert.equal(await grip.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');await page.mouse.up();
 await page.evaluate(()=>{document.querySelector('.mini').classList.remove('grip-active');});
 await page.mouse.move(275,175);
 await grip.focus();await grip.press('Tab');await page.keyboard.press('Shift+Tab');
 const focused=await grip.evaluate(el=>({visible:el.matches(':focus-visible'),width:getComputedStyle(el).outlineWidth,background:getComputedStyle(el).backgroundColor}));assert.ok(focused.visible);assert.equal(focused.width,'2px');assert.equal(focused.background,'rgba(0, 0, 0, 0)');await grip.evaluate(el=>el.blur());
 checks.push('All 16 layout/lock/native-grip/hover combinations and held mouse keep the handle transparent; keyboard focus remains visible');
 assert.equal(await page.locator('.pet-particle').count(),6);
 const particleCheck=await page.locator('.pet-particle').evaluateAll(async elements=>{
  const result=[];
  for(const el of elements){const animation=el.getAnimations()[0];if(!animation)throw Error('Missing particle animation');const duration=animation.effect.getTiming().duration;animation.pause();animation.currentTime=duration*.25;}
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const initial=elements.map(el=>el.getBoundingClientRect());
  for(const el of elements){const animation=el.getAnimations()[0];animation.currentTime=animation.effect.getTiming().duration*.65;}
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  for(let i=0;i<elements.length;i++){const el=elements[i],r=el.getBoundingClientRect(),field=el.parentElement.getBoundingClientRect();result.push({moved:Math.hypot(r.x-initial[i].x,r.y-initial[i].y),distance:Math.hypot(r.x+r.width/2-field.x-56,r.y+r.height/2-field.y-56),path:getComputedStyle(el).offsetPath,pointer:getComputedStyle(el.parentElement).pointerEvents});el.getAnimations()[0].play();}
  return result;
 });
 assert.ok(particleCheck.every(p=>p.moved>3&&p.distance>40&&p.path!=='none'&&p.pointer==='none'),JSON.stringify(particleCheck));
 assert.equal(await page.locator('.particle-field').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
 checks.push('Six staggered particles follow curved paths outside the face, without a badge or pointer interception');
 for(const background of ['#ffffff','#101412']){
  await page.evaluate(color=>document.documentElement.style.background=color,background);
  for(const theme of ['mint','sakura','moon','ice','tea','spellbook']){
   await page.evaluate(theme=>window.patch({theme}),theme);await page.waitForTimeout(20);
   const style=await page.evaluate(()=>({portrait:getComputedStyle(document.querySelector('.pet-image')).boxShadow,bubble:getComputedStyle(document.querySelector('.pet-bubble')).boxShadow,particle:getComputedStyle(document.querySelector('.pet-particle svg')).filter,border:getComputedStyle(document.querySelector('.pet-image')).borderTopWidth}));
   assert.deepEqual(style,{portrait:'none',bubble:'none',particle:'none',border:'0px'});
  }
  await page.screenshot({path:`test-results/particles-flat-${background==='#ffffff'?'white':'dark'}.png`});
 }
 checks.push('Six themes on white and dark desktops have no portrait/bubble shadows or particle blur');

 assert.equal(await page.locator('.status-accessory').getAttribute('data-accessory'),'reasoning');await page.evaluate(()=>window.phase('tool'));await page.waitForTimeout(60);assert.equal(await page.locator('.status-accessory').getAttribute('data-accessory'),'tool');await page.screenshot({path:'test-results/particles-roxy.png'});
 await page.evaluate(()=>window.patch({do_not_disturb:true}));assert.equal(await page.locator('.status-accessory').count(),0);await page.evaluate(()=>window.patch({do_not_disturb:false}));await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(80);assert.equal(await page.locator('.status-accessory').count(),0);await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>window.phase('quiet'));await page.waitForTimeout(60);assert.equal(await page.locator('.status-accessory').count(),0);await page.evaluate(()=>{window.phase('reasoning');window.patch({character:'mai'});});await page.waitForTimeout(60);assert.equal(await page.locator('.status-accessory').getAttribute('data-character'),'mai');await page.screenshot({path:'test-results/particles-mai.png'});await page.evaluate(()=>window.patch({status_accessories:false}));assert.equal(await page.locator('.status-accessory').count(),0);assert.deepEqual(await page.locator('.task-tag').evaluateAll(es=>es.map(e=>getComputedStyle(e).color)),colors);checks.push('State accessories follow reasoning/tool activity and character; stop for silence, DND, reduced motion and disable');
 await page.locator('.mini-grip').press('Enter');await page.getByLabel('头像对话',{exact:true}).waitFor();checks.push('Existing left/keyboard interaction remains available');
 await page.evaluate(()=>{window.phase('tool');window.patch({overlay_layout:'bar',status_accessories:true,character:'roxy'});});await page.setViewportSize({width:272,height:152});await page.waitForTimeout(70);assert.equal(await page.locator('.status-accessory').count(),1);assert.equal(await page.locator('.pet-particle:visible').count(),3);checks.push('Compact bar limits visible particles to three without duplicating the character');
 const main=await context.newPage();main.on('pageerror',e=>errors.push(String(e)));await main.setViewportSize({width:1160,height:1000});await main.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await main.getByLabel('当前任务昵称').fill('数学');await main.getByRole('button',{name:'保存昵称',exact:true}).click();await main.reload({waitUntil:'networkidle'});assert.equal(await main.getByLabel('当前任务昵称').inputValue(),'数学');await main.getByRole('button',{name:'清除',exact:true}).click();await main.waitForTimeout(50);assert.equal(await main.getByLabel('当前任务昵称').inputValue(),'');checks.push('Task nickname can save, reload and clear without changing monitoring or requiring a title read');
 assert.deepEqual(errors,[]);await writeFile('test-results/grip-hover-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
