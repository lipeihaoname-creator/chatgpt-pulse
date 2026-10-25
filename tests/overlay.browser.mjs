// CSS/interaction checks in an isolated profile; native dragging is checked separately.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:272,height:64},reducedMotion:'no-preference'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});
  const grip=page.getByRole('button',{name:'拖动悬浮条',exact:true});
  assert.equal(await grip.isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:'拖动悬浮条内容'}).isDisabled(),true);
  const opacity=()=>page.locator('.mini').evaluate(el=>Number(getComputedStyle(el).opacity));
  assert.equal(await opacity(),1);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgba(0, 0, 0, 0)');
  // Sample the browser's real CSS transition timeline directly. Headless macOS
  // can throttle requestAnimationFrame for fully transparent/occluded windows.
  const animate=fade=>page.locator('.mini').evaluate((el,fade)=>{
    getComputedStyle(el).opacity;
    el.classList.toggle('faded',fade);
    getComputedStyle(el).opacity;
    const animation=el.getAnimations().find(a=>a.playState!=='finished');
    if(!animation)throw Error('Opacity transition was not created');
    animation.pause();animation.currentTime=110;
    const middle=Number(getComputedStyle(el).opacity);
    animation.finish();const end=Number(getComputedStyle(el).opacity);
    return {middle,end};
  },fade);
  const fadeOut=await animate(true),fadeIn=await animate(false);
  const intermediateOut=fadeOut.middle,intermediateIn=fadeIn.middle;
  assert.ok(intermediateOut>0&&intermediateOut<1);assert.equal(fadeOut.end,0);
  assert.ok(intermediateIn>0&&intermediateIn<1);assert.equal(fadeIn.end,1);
  await page.setViewportSize({width:272,height:104});
  await page.evaluate(()=>localStorage.setItem('pulse-settings',JSON.stringify({locked:false,overlay_enabled:true})));
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.getByRole('button',{name:'拖动悬浮条内容'}).isEnabled(),true);
  for(const name of ['完成','取消']){
    const box=await page.getByRole('button',{name,exact:true}).boundingBox();
    assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=272&&box.y+box.height<=104);
  }
  await page.screenshot({path:'test-results/editing-060.png'});
  await page.getByRole('button',{name:'完成',exact:true}).click();
  assert.equal(await grip.isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:'拖动悬浮条内容'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'完成',exact:true}).count(),0);
  await page.evaluate(()=>localStorage.setItem('pulse-settings',JSON.stringify({locked:false,overlay_enabled:true})));
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'拖动悬浮条内容'}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  const result={locked_handle_enabled:true,editing_body_draggable:true,lock_preserves_handle:true,fade_out_intermediate:intermediateOut,fade_in_intermediate:intermediateIn,fade_duration_ms:220,errors};
  await writeFile('test-results/overlay-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
