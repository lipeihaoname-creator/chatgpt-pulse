import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from './playwright.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'偏好设置'}).click();
 await page.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');
 const preview=page.getByLabel('外观预览',{exact:true}),portrait=preview.locator('.character-portrait');
 for(const role of ['mai','roxy']){
  await page.getByRole('combobox',{name:'角色头像',exact:true}).selectOption(role);
  await page.getByRole('button',{name:'等候',exact:true}).click();await page.waitForTimeout(850);
  // Sample actual paints while work phases and four facial atlases alternate.
  const report=await preview.evaluate(async root=>{
   const el=root.querySelector('.character-portrait'),pose=el.querySelector('.pose'),grip=root.querySelector('.mini-grip'),base=el.getBoundingClientRect();
   const states=[...document.querySelector('[aria-label="预览表情"]').querySelectorAll('button')],moods=[...document.querySelector('[aria-label="空闲表情预览"]').querySelectorAll('button')];
   const samples=[];let running=true;
   function sample(){const r=el.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(pose).transform);samples.push({at:performance.now(),key:el.querySelector('.expression-frame')?.dataset.renderedExpression,eye:el.dataset.swapEye,phase:el.dataset.swapPhase,count:el.querySelectorAll('.expression-frame').length,drift:Math.max(Math.abs(r.x-base.x),Math.abs(r.y-base.y),Math.abs(r.width-base.width),Math.abs(r.height-base.height)),scale:Math.hypot(m.a,m.b),outer:grip.getAnimations().filter(a=>a.playState==='running').length});if(running)requestAnimationFrame(sample);}
   sample();const wait=ms=>new Promise(r=>setTimeout(r,ms));
   for(let i=0;i<24;i++){(i%2?states[i%states.length]:moods[i%moods.length]).click();await wait(22);}
   states.find(b=>b.textContent==='工具').click();await wait(1000);
   running=false;
   const changes=samples.filter((s,i)=>i&&s.key!==samples[i-1].key);
   return {samples:samples.length,changes,oneFace:samples.every(s=>s.count===1),maxDrift:Math.max(...samples.map(s=>s.drift)),maxScaleChange:Math.max(...samples.map(s=>Math.abs(s.scale-1))),outerAnimations:Math.max(...samples.map(s=>s.outer)),latest:el.querySelector('.expression-frame').dataset.renderedExpression,phase:el.dataset.swapPhase};
  });
  assert.ok(report.oneFace,JSON.stringify(report));assert.ok(report.maxDrift<.01,JSON.stringify(report));assert.ok(report.maxScaleChange<.0001,JSON.stringify(report));
  assert.equal(report.outerAnimations,0);assert.ok(report.changes.length>0&&report.changes.length<=4,JSON.stringify(report));
  assert.ok(report.changes.every(s=>s.eye==='closed'&&s.phase==='opening'),JSON.stringify(report));assert.equal(report.latest,'4');assert.equal(report.phase,'');results.push({role,...report});
  await page.getByRole('button',{name:'等候',exact:true}).click();await page.waitForTimeout(850);
  const grip=preview.locator('.mini-grip');
  await grip.press('Enter');await page.waitForTimeout(160);
  await portrait.locator('.pose').evaluate(el=>{const current=el.getAnimations()[0];current.currentTime=1400;window.lastPose=getComputedStyle(el).transform;window.lastGesture=current;});
  await grip.press('Enter');
  const interruption=await portrait.locator('.pose').evaluate(el=>{const next=el.getAnimations()[0],a=new DOMMatrix(window.lastPose),b=new DOMMatrix(next.effect.getKeyframes()[0].transform);return {replaced:next!==window.lastGesture,jump:Math.max(...['a','b','c','d','e','f'].map(k=>Math.abs(a[k]-b[k])))};});
  assert.ok(interruption.replaced&&interruption.jump<.2,JSON.stringify(interruption));
  await page.getByRole('button',{name:'工具',exact:true}).click();await page.waitForTimeout(90);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByRole('button',{name:'输出',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await portrait.getAttribute('data-swap-phase'),'');assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),'3');
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(500);
  assert.equal(await portrait.getAttribute('data-swap-phase'),'');assert.equal(await portrait.locator('.expression-frame').getAttribute('data-rendered-expression'),'3');
 }
 checks.push('24 rapid work/expression changes per role retain one face, fixed avatar geometry and unit gesture scale, and coalesce to at most four closed-eye commits');
 checks.push('Consecutive avatar replies resume the current pose without an outer button animation');
 checks.push('Hiding during a transition clears pending timers; background changes and restoration retain the newest face');
 assert.deepEqual(errors,[]);await writeFile('test-results/portrait-smoothness-browser.json',JSON.stringify({passed:true,checks,results,errors},null,2));console.log(JSON.stringify({passed:true,checks,results}));
}finally{await browser.close();}
