import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from './playwright.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[],portraits=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();
 await page.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');await page.getByLabel('启用角色动效',{exact:true}).uncheck();
 const portrait=page.getByLabel('外观预览',{exact:true}).locator('.character-portrait');
 const css=await page.evaluate(()=>[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText);}catch{return [];}}).join('\n'));
 const render=await browser.newPage({viewport:{width:220,height:220}});await render.goto('http://127.0.0.1:1420/');
 const rows=[['等候','0'],['专注','1'],['思考','2'],['输出','3'],['工具','4'],['等你','5'],['完成','6'],['待确认','7'],['不可读','8'],['害羞','shy'],['忍笑','bashful'],['鼓脸','pout'],['困倦','sleepy']];
 for(const role of ['mai','roxy']){
  await page.getByRole('combobox',{name:'角色头像',exact:true}).selectOption(role);let reference=null;const centerChanges=[];
  for(const [label,key] of rows){
   await page.getByRole('button',{name:label,exact:true}).click();await portrait.locator(`.expression-frame[data-rendered-expression="${key}"][data-frame-character="${role}"]`).waitFor();
   const html=await portrait.evaluate(el=>el.outerHTML);portraits.push({role,label,html});
   if(key==='0')await portrait.evaluate(el=>window.stablePortraitNodes=[el.querySelector('.base-atlas.open'),el.querySelector('.atlas.open')]);
   else assert.ok(await portrait.evaluate(el=>window.stablePortraitNodes[0]===el.querySelector('.base-atlas.open')&&window.stablePortraitNodes[1]===el.querySelector('.atlas.open')),`${role} ${label}: expression switch rebuilt the head or eye layer`);
   // Render the real component styles on transparent pixels. The normal
   // circular fill must not hide a missing strip of character artwork.
   await render.setContent(`<style>${css}html,body{margin:0;background:transparent!important}#stage{width:200px;height:200px;--pet-bg:#242b42;--pet-accent:#b5c5ff}.character-portrait{background:transparent!important}.breath,.pose{animation:none!important;transform:none!important}.half,.blink{display:none!important}.facial-features,.expression-frame{transition:none!important;opacity:1!important}</style><div id="stage">${html}</div>`);
   await render.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.open')].map(async el=>{const url=getComputedStyle(el).backgroundImage.slice(5,-2);const img=new Image();img.src=url;try{await img.decode();}catch{throw Error('Cannot decode portrait paint: '+getComputedStyle(el).backgroundImage);}}));});
   const png=await render.locator('#stage').screenshot({omitBackground:true});
   const pixels=await render.evaluate(async base64=>{window.readPortraitPNG=async value=>{const img=new Image();img.src='data:image/png;base64,'+value;await img.decode();const c=document.createElement('canvas');c.width=c.height=200;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,200,200).data,top=[],bottom=[],face=[],eyes=[],mouth=[];
    for(let y=0;y<200;y++)for(let x=0;x<200;x++){const k=(y*200+x)*4;if(y<20)top.push(...data.slice(k,k+4));if(y>=184)bottom.push(...data.slice(k,k+4));if(y>=82&&y<150&&x>=65&&x<140)face.push(...data.slice(k,k+4));if(y>=82&&y<115&&x>=68&&x<134)eyes.push(...data.slice(k,k+4));if(y>=134&&y<140&&x>=90&&x<110)mouth.push(...data.slice(k,k+4));}
    let opaque=0,total=0;for(let y=186;y<196;y++)for(let x=85;x<115;x++){total++;if(data[(y*200+x)*4+3]>=250)opaque++;}return {top,bottom,face,eyes,mouth,coverage:opaque/total};};return window.readPortraitPNG(base64);
   },png.toString('base64'));
   assert.equal(pixels.coverage,1,`${role} ${label}: artwork ends before the circular crop bottom`);
   if(reference){assert.deepEqual(pixels.top,reference.top,`${role} ${label}: upper silhouette changed`);assert.deepEqual(pixels.bottom,reference.bottom,`${role} ${label}: shoulders/bottom changed`);centerChanges.push(pixels.face.filter((n,i)=>Math.abs(n-reference.face[i])>12).length);}
   else reference=pixels;
   // In the eye/mouth core, the new paint must fully cover the neutral face.
   // A mask feather crossing an old eye creates an apparent extra iris.
   await render.locator('.facial-features,.eyes-window').evaluateAll(els=>els.forEach(el=>el.style.maskImage='none'));
   const unmasked=await render.locator('#stage').screenshot({omitBackground:true});
   const expected=await render.evaluate(base64=>window.readPortraitPNG(base64),unmasked.toString('base64'));
   const deltas=pixels.eyes.map((n,i)=>Math.abs(n-expected.eyes[i]));
   // Separate masked compositing surfaces can differ by a few RGB units at
   // resampled edges. A leaked iris is much larger than this small tolerance.
   assert.ok(Math.max(...deltas)<=6&&deltas.reduce((a,b)=>a+b,0)/deltas.length<.75,`${role} ${label}: neutral eyes leak through the patch`);
   assert.ok(pixels.mouth.every((n,i)=>Math.abs(n-expected.mouth[i])<=6),`${role} ${label}: neutral mouth leaks through the patch`);
   if(key==='0'||key==='3'||key==='bashful')await writeFile(`test-results/${role}-body-${key}.png`,png);
  }
  assert.ok(centerChanges.filter(n=>n>150).length>=10,`${role}: preserving the body must not remove the facial expressions`);
  // A stronger excursion than the actual 88px avatar gestures, expressed at
  // this 200px screenshot scale, must still leave the torso covering the crop.
  const last=portraits.at(-1).html;
  await render.setContent(`<style>${css}html,body{margin:0;background:transparent!important}#stage{width:200px;height:200px;--pet-bg:#242b42;--pet-accent:#b5c5ff}.character-portrait{background:transparent!important}.half,.blink{display:none!important}.pose,.breath{animation:none!important}.breath{transform:translateY(-.8px)!important}.pose{transform:translate(1px,-4px) rotate(2deg)!important}.facial-features,.expression-frame{transition:none!important;opacity:1!important}</style><div id="stage">${last}</div>`);
  const moving=await render.locator('#stage').screenshot({omitBackground:true});const motion=await render.evaluate(base64=>window.readPortraitPNG(base64),moving.toString('base64'));
  assert.equal(motion.coverage,1,`${role}: a gesture exposes the bottom crop edge`);
  results.push({role,expressions:rows.length,minimumBottomCoverage:1,movingBottomCoverage:motion.coverage,upperAndLowerPixelChanges:0,distinctFacialStates:centerChanges.filter(n=>n>150).length});
 }
 const gallery=await browser.newPage({viewport:{width:1320,height:920}});await gallery.goto('http://127.0.0.1:1420/');
 await gallery.setContent(`<style>${css}html,body{background:#fff!important;color:#333;margin:0}main{display:grid;grid-template-columns:repeat(7,1fr);gap:14px;padding:20px}figure{margin:0;text-align:center;font:12px system-ui}.frame{width:166px;height:166px;--pet-bg:#242b42;--pet-accent:#b5c5ff}.breath,.pose{animation:none!important;transform:none!important}.half,.blink{display:none!important}.facial-features,.expression-frame{transition:none!important;opacity:1!important}</style><main>${portraits.map(p=>`<figure><div class="frame">${p.html}</div><figcaption>${p.role} · ${p.label}</figcaption></figure>`).join('')}</main>`);
 await gallery.screenshot({path:'test-results/portrait-fixed-body-gallery.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile('test-results/portrait-body-browser.json',JSON.stringify({passed:true,results,errors},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();}
