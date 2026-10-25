import {assetUrl} from './production-assets.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],portraits=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();
 await page.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');
 const preview=page.getByLabel('外观预览',{exact:true}),portrait=preview.locator('.character-portrait'),choices=page.getByLabel('空闲表情预览',{exact:true});
 for(const role of ['mai','roxy']){
  await page.getByRole('combobox',{name:'角色头像',exact:true}).selectOption(role);
  for(const [i,[key,label]] of Object.entries({shy:'害羞',bashful:'忍笑',pout:'鼓脸',sleepy:'困倦'}).entries()){
   await choices.getByRole('button',{name:label,exact:true}).click();
   await portrait.locator(`.expression-frame[data-frame-character="${role}"][data-rendered-expression="${key}"] .emotion-atlas.open`).waitFor();
   assert.equal(await portrait.getAttribute('data-emotion'),key);
   assert.ok((await portrait.getAttribute('aria-label')).endsWith(label));
   await page.waitForTimeout(300);
   const frames=await portrait.locator('.emotion-atlas').evaluateAll(els=>els.map(el=>({bg:getComputedStyle(el).backgroundImage,size:getComputedStyle(el).backgroundSize,x:getComputedStyle(el).backgroundPositionX,y:getComputedStyle(el).backgroundPositionY})));
   assert.equal(frames.length,3);assert.ok(frames.every(f=>f.size==='400% 300%'&&f.bg.includes(assetUrl(`src/assets/${role}/emotions-v1.png`))));
   assert.ok(await portrait.locator('.emotion-atlas.half').evaluate(el=>getComputedStyle(el).clipPath.startsWith('inset(')));
   assert.deepEqual(frames.map(f=>f.y),['0%','50%','100%']);assert.ok(Math.abs(parseFloat(frames[0].x)-i*100/3)<.01);
   const url=frames[0].bg.slice(5,-2);assert.ok(await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return img.naturalWidth/img.naturalHeight===4/3;},url));
   portraits.push({role,label,html:await portrait.evaluate(el=>el.outerHTML)});
   assert.equal(await preview.locator('.pet-monitor').getAttribute('data-pulse-activity'),'paused');
   assert.ok(await portrait.locator('.pose').evaluate(el=>el.getAnimations().length>0));
  }
  await choices.getByRole('button',{name:'害羞',exact:true}).click();
  await preview.screenshot({path:`test-results/${role}-shy-preview.png`});
 }
 checks.push('Both roles render four distinct facial paintings with decoded transparent 4×3 atlases and three eye frames; preview never changes the real monitor');
 await page.emulateMedia({reducedMotion:'reduce'});await choices.getByRole('button',{name:'忍笑',exact:true}).click();
 assert.equal(await portrait.getAttribute('data-emotion'),'bashful');assert.equal(await portrait.locator('.pose').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length),0);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'工具',exact:true}).click();
 assert.equal(await portrait.getAttribute('data-emotion'),'');assert.equal(await portrait.getAttribute('data-expression'),'4');
 checks.push('Reduced motion permits a static facial preview while stopping movement; switching back to a work phase restores its original portrait');
 const unavailable=await browser.newPage();unavailable.on('pageerror',e=>errors.push(String(e)));
 await unavailable.route('**/emotions-v1*.png',route=>route.abort());
 await unavailable.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await unavailable.getByRole('button',{name:'偏好设置'}).click();await unavailable.getByLabel('空闲表情预览',{exact:true}).getByRole('button',{name:'害羞',exact:true}).click();
 const fallback=unavailable.getByLabel('外观预览',{exact:true}).locator('.character-portrait');
 assert.equal(await fallback.getAttribute('data-emotion'),'');assert.ok((await fallback.locator('.open').last().evaluate(el=>getComputedStyle(el).backgroundImage)).includes(assetUrl('src/assets/mai/open.png')));
 checks.push('Unavailable optional emotion assets fall back to the original portraits without hiding the character or work metrics');
 const css=await page.evaluate(()=>[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText);}catch{return [];}}).join('\n'));
 const sheet=await browser.newPage({viewport:{width:1080,height:960}});
 await sheet.goto('http://127.0.0.1:1420/',{waitUntil:'domcontentloaded'});
 await sheet.setContent(`<style>${css} body{margin:0;padding:20px;background:#fff;color:#303448;--pet-bg:#242b42;--pet-accent:#b5c5ff}main{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}figure{margin:0;display:grid;justify-items:center;gap:4px;font:12px system-ui}.frame{width:154px;height:154px}.atlas,.breath{animation:none!important}.half,.blink{opacity:0!important}[data-eye=half] .half,[data-eye=blink] .blink{opacity:1!important}</style><main>${portraits.flatMap(p=>['open','half','blink'].map(eye=>`<figure data-eye="${eye}"><div class="frame">${p.html}</div><figcaption>${p.role} · ${p.label} · ${eye}</figcaption></figure>`)).join('')}</main>`);
 await sheet.screenshot({path:'test-results/emotions-eye-frames.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile('test-results/emotions-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
