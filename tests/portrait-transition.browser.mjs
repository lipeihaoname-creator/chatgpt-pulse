import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();await page.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');
 const preview=page.getByLabel('外观预览',{exact:true}),portrait=preview.locator('.character-portrait'),moods=page.getByLabel('空闲表情预览',{exact:true});
 for(const role of ['mai','roxy']){
  await page.getByRole('combobox',{name:'角色头像',exact:true}).selectOption(role);await page.getByRole('button',{name:'思考',exact:true}).click();await page.waitForTimeout(650);
  await portrait.evaluate(el=>{window.pose=el.querySelector('.pose');window.breath=el.querySelector('.breath');window.breathAnimation=window.breath.getAnimations()[0];});
  for(const [label,expected] of [['输出','3'],['工具','4'],['完成','6'],['等候','0']]){
   const before=await portrait.locator('.expression-frame').getAttribute('data-rendered-expression');
   await portrait.evaluate(el=>{
    window.faceSamples=[];window.observeFace?.disconnect();
    window.observeFace=new MutationObserver(()=>window.faceSamples.push({count:el.querySelectorAll('.expression-frame').length,key:el.querySelector('.expression-frame')?.dataset.renderedExpression,eye:el.dataset.swapEye,phase:el.dataset.swapPhase}));
    window.observeFace.observe(el,{attributes:true,childList:true,subtree:true});
   });
   await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(480);
   const transition=await portrait.evaluate(el=>({samples:window.faceSamples,persistent:window.pose===el.querySelector('.pose')&&window.breath===el.querySelector('.breath')&&window.breathAnimation===window.breath.getAnimations()[0]}));
   assert.ok(transition.samples.every(s=>s.count===1),JSON.stringify(transition));
   assert.ok(transition.samples.some(s=>s.phase==='closing'&&s.key===before),JSON.stringify(transition));
   assert.ok(transition.samples.some(s=>s.phase==='opening'&&s.key===expected&&s.eye==='closed'),JSON.stringify(transition));
   assert.ok(transition.persistent);assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),expected);
   assert.equal(await portrait.getAttribute('data-swap-phase'),'');
  }
  await page.evaluate(async()=>{
   const buttons=[...document.querySelector('[aria-label="预览表情"]').querySelectorAll('button')];
   for(const label of ['专注','思考','输出','工具','完成','等候']){buttons.find(b=>b.textContent===label).click();await new Promise(r=>setTimeout(r,25));}
  });
  await page.waitForTimeout(950);assert.equal(await portrait.locator('.expression-frame').count(),1);assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),'0');
  await moods.getByRole('button',{name:'害羞',exact:true}).click();await page.waitForTimeout(400);
  await portrait.evaluate(el=>{const a=el.querySelector('.pose').getAnimations()[0];a.currentTime=1800;window.before=getComputedStyle(el.querySelector('.pose')).transform;});
  await page.getByRole('button',{name:'工具',exact:true}).click();
  const returning=await portrait.locator('.pose').evaluate(el=>{const a=el.getAnimations()[0];return {from:a.effect.getKeyframes()[0].transform,before:window.before};});
  const jump=await page.evaluate(({from,before})=>{const a=new DOMMatrix(from),b=new DOMMatrix(before);return Math.max(...['a','b','c','d','e','f'].map(k=>Math.abs(a[k]-b[k])));},returning);
  assert.ok(jump<.2,JSON.stringify(returning));await page.waitForTimeout(500);assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),'4');
 }
 checks.push('Both characters close their eyes before replacing the face, reopen afterward, and always render exactly one expression frame');
 checks.push('Rapid changes settle on the latest state; persistent breathing and interrupted gestures keep their current pose');
 await moods.getByRole('button',{name:'忍笑',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'专注',exact:true}).click();await page.waitForTimeout(70);
 assert.equal(await portrait.locator('.expression-frame').count(),1);assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),'1');
 assert.equal(await portrait.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>['running','paused'].includes(a.playState)&&Number.isFinite(a.effect?.getComputedTiming().endTime)).length),0);
 checks.push('Reduced motion cancels pending blink bridges and renders the latest expression with no finite animation left');
 assert.deepEqual(errors,[]);await writeFile('test-results/portrait-transition-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
