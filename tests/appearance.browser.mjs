import {assetUrl} from './production-assets.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:1160,height:1000},reducedMotion:'no-preference'});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();
 await page.getByRole('combobox',{name:'显示样式',exact:true}).selectOption('avatar');
 const preview=page.getByLabel('外观预览', {exact:true});assert.equal(await preview.locator('.avatar-layout').count(),1);
 const portrait=preview.locator('.character-portrait');
 const portraitBox=await portrait.boundingBox();assert.equal(Math.round(portraitBox.width),88);assert.equal(Math.round(portraitBox.height),88);
 for(const [label,id] of [['等候',0],['专注',1],['思考',2],['输出',3],['工具',4],['等你',5],['完成',6],['待确认',7],['不可读',8]]){
  await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await portrait.getAttribute('data-expression'),String(id));
  assert.equal(await preview.locator('.pet-face.active').count(),[1,2,3,4].includes(id)?1:0);
 }
 checks.push('Nine expressions and work animation follow status, including silence and unreadable monitoring');
 await page.getByRole('button',{name:'思考',exact:true}).click();
 await page.waitForFunction(()=>{const p=document.querySelector('[aria-label="外观预览"] .character-portrait');return p?.dataset.swapPhase===''&&p.querySelector('.expression-frame')?.dataset.renderedExpression==='2';});
 const atlas=await portrait.locator('.open').last().evaluate(el=>getComputedStyle(el).backgroundImage);
 assert.ok(atlas.includes(assetUrl('src/assets/mai/open.png')));assert.ok(await portrait.locator('.blink').last().evaluate(el=>getComputedStyle(el).animationName.includes('blink')));
 await page.getByRole('checkbox',{name:'启用角色动效'}).uncheck();assert.equal(await portrait.evaluate(el=>el.classList.contains('animated')),false);assert.equal(await preview.locator('.pet-face.active').count(),0);
 await page.getByRole('checkbox',{name:'启用角色动效'}).check();await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await portrait.locator('.open').last().evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 checks.push('Blink atlas loads, animations can stop, and system reduced motion is respected');
 for(const [label,key] of [['樱花奶霜','sakura'],['月光藤紫','moon'],['冰川蓝','ice'],['奶茶琥珀','tea'],['薄荷抹茶','mint']]){
  await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-settings')).theme),key);
 }
 checks.push('All five palettes persist');
 await page.getByRole('combobox',{name:'气泡显示',exact:true}).selectOption('working');await page.getByRole('button',{name:'等候',exact:true}).click();assert.equal(await preview.locator('.pet-bubble.concealed').count(),1);
 await page.getByRole('button',{name:'待确认',exact:true}).click();assert.equal(await preview.locator('.pet-bubble.concealed').count(),0);
 await page.getByRole('combobox',{name:'气泡显示',exact:true}).selectOption('always');
 await page.getByRole('combobox',{name:'多任务显示',exact:true}).selectOption('combined');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-settings')).task_display),'combined');
 await page.getByLabel('导入头像图片',{exact:true}).setInputFiles('src-tauri/icons/128x128.png');await preview.locator('img[alt="自定义头像"]').waitFor();assert.equal(await page.getByRole('combobox',{name:'角色头像',exact:true}).inputValue(),'custom');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'偏好设置'}).click();await preview.locator('img[alt="自定义头像"]').waitFor();
 assert.equal(await page.getByRole('combobox',{name:'多任务显示',exact:true}).inputValue(),'combined');
 checks.push('Custom local image and multi-task layout preference persist after restart');
 await page.getByRole('combobox',{name:'角色头像',exact:true}).selectOption('mai');await page.getByRole('button',{name:'思考',exact:true}).click();await page.screenshot({path:'test-results/appearance-settings-070.png',fullPage:true});
 const mini=await browser.newPage({viewport:{width:280,height:168}});mini.on('pageerror',e=>errors.push(String(e)));
 await mini.addInitScript(()=>localStorage.setItem('pulse-settings',JSON.stringify({overlay_layout:'avatar',theme:'moon',character:'mai',animations:true,locked:false,overlay_enabled:true})));
 await mini.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
 for(const name of ['完成','取消']){const box=await mini.getByRole('button',{name,exact:true}).boundingBox();assert.ok(box&&box.y>=128&&box.y+box.height<=168&&box.x+box.width<=280);}
 await mini.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await mini.getByRole('button',{name:'完成',exact:true}).count(),0);assert.equal(await mini.getByRole('button',{name:'拖动悬浮条',exact:true}).isEnabled(),true);
 await mini.setViewportSize({width:280,height:128});await mini.screenshot({path:'test-results/appearance-avatar-070.png'});
 checks.push('Avatar edit buttons fit the native footer and cancellation returns to a locked draggable avatar');
 assert.deepEqual(errors,[]);await writeFile('test-results/appearance-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
}finally{await browser.close();}
