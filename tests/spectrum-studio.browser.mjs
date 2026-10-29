import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {defaults,emptySample} from '../src/lib/domain.js';
import {spectrumStyles,exportDesign} from '../src/lib/music-settings.js';
import {chromium} from './playwright.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:1160,height:980}});
 await context.addInitScript(({defaults,base})=>{
  globalThis.isTauri=true;const callbacks=new Map(),listeners=new Map();let id=0,seq=0,audioSeq=0;
  const load=()=>JSON.parse(localStorage.getItem('spectrum-native-settings')||'null')||{...defaults,overlay_layout:'avatar',overlay_enabled:true,character:'roxy',music_enabled:false};
  let settings=load();window.musicStarts=0;
  const emit=(event,payload)=>{for(const n of listeners.get(event)||[])callbacks.get(n)?.({payload});};
  const sample=()=>({...base,source:'logs',state:'running',task_unfinished:true,log_id:'fixture.jsonl',activity_status:'tool',activity_at:Date.now(),checked_at:Date.now(),poll_sequence:++seq});
  const audio=extra=>({supported:true,status:settings.music_enabled?'active':'off',detail:'隔离音频界面测试',epoch:1,sequence:++audioSeq,at:Date.now(),active:settings.music_enabled,stable_seconds:4,bars:Array.from({length:24},(_,i)=>.2+(i%7)/10),rms:.2,beat:1,beat_strength:.5,...extra});
  globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  globalThis.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search?'overlay':'main'},currentWebview:{label:location.search?'overlay':'main'}},transformCallback(fn){callbacks.set(++id,fn);return id;},async invoke(cmd,args){
   if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return args.handler;}
   if(cmd==='bootstrap'||cmd==='bootstrap_overlay')return {settings:load(),sample:sample(),history:[],logs:[],platform:'macos',offline_test:true,startup:{},overlay_interaction:{}};
   if(cmd==='sample_snapshot')return sample();if(cmd==='settings_snapshot'){settings=load();return settings;}
   if(cmd==='get_custom_avatar')return null;if(cmd==='get_state_avatars')return {};
   if(cmd==='music_status')return audio();if(cmd==='music_start'){window.musicStarts++;return audio();}
   if(cmd==='patch_settings'){settings={...load(),...(args.key==='music_design'?{music_style:args.value.style,music_visual:args.value.visual}:{[args.key]:args.value}),revision:load().revision+1};localStorage.setItem('spectrum-native-settings',JSON.stringify(settings));emit('pulse:settings',settings);return settings;}
   throw Error(cmd);
  }};
  window.stopAudio=()=>{clearInterval(window.audioTimer);emit('pulse:audio',audio({status:'off',active:false,bars:Array(24).fill(0)}));};
  window.audioTimer=setInterval(()=>emit('pulse:audio',audio()),80);
 },{defaults,base:emptySample()});
 const main=await context.newPage();main.on('pageerror',e=>errors.push(String(e)));
 await main.goto('http://127.0.0.1:1420/',{waitUntil:'networkidle'});await main.getByRole('button',{name:'音乐律动',exact:true}).click();
 for(const [,name]of spectrumStyles)await main.getByRole('button',{name:'选择'+name,exact:true}).waitFor();
 assert.equal(await main.evaluate(()=>window.musicStarts),0);assert.equal(await main.getByLabel('响应系统播放音频',{exact:true}).isChecked(),false);
 await main.getByLabel('频谱样式',{exact:true}).selectOption('dots');await main.getByLabel('频谱配色',{exact:true}).selectOption('gradient');
 for(const [label,color]of [['频谱主色','#ff8800'],['频谱尾色','#cc33ff']])await main.getByLabel(label,{exact:true}).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},color);
 await main.getByLabel('频谱疏密',{exact:true}).selectOption('12');await main.getByText('精细调整',{exact:true}).click();
 for(const [label,value]of [['频谱高度','1.4'],['响应强度','1.8'],['条带对比度','2.8'],['回落柔和度','1.6'],['频谱透明度','.75'],['线条粗细','4']])await main.getByLabel(label,{exact:true}).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 await main.getByLabel('频谱高度',{exact:true}).evaluate(el=>{el.value='.8';el.dispatchEvent(new Event('input',{bubbles:true}));});await main.waitForTimeout(1300);assert.equal(await main.getByLabel('频谱高度',{exact:true}).inputValue(),'0.8','Periodic unchanged settings snapshots cannot interrupt slider preview');
 await main.getByLabel('频谱高度',{exact:true}).evaluate(el=>{el.value='1.4';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await main.getByLabel('峰值点',{exact:true}).uncheck();await main.getByLabel('中心对称',{exact:true}).check();
 await main.getByText('我的方案',{exact:true}).click();await main.getByLabel('方案名称',{exact:true}).fill('薄荷星点');await main.getByRole('button',{name:'保存 / 覆盖',exact:true}).click();
 await main.getByLabel('已保存方案',{exact:true}).waitFor();
 await main.reload({waitUntil:'networkidle'});await main.getByRole('button',{name:'音乐律动',exact:true}).click();
 assert.equal(await main.getByLabel('频谱样式',{exact:true}).inputValue(),'dots');assert.equal(await main.getByLabel('频谱疏密',{exact:true}).inputValue(),'12');
 await main.getByText('我的方案',{exact:true}).click();await main.getByLabel('频谱样式',{exact:true}).selectOption('curve');await main.getByLabel('已保存方案',{exact:true}).selectOption('薄荷星点');
 await main.waitForFunction(()=>JSON.parse(localStorage.getItem('spectrum-native-settings')).music_style==='dots');
 const stored=await main.evaluate(()=>JSON.parse(localStorage.getItem('spectrum-native-settings')));assert.equal(stored.music_visual.color,'#ff8800');assert.equal(stored.music_visual.height,1.4);assert.equal(stored.music_visual.contrast,2.8);assert.equal(stored.music_visual.peaks,false);assert.equal(stored.music_enabled,false);
 checks.push('Six styles are configurable before enabling capture; colors, density, dimensions and named presets survive reload and restore atomically');
 await main.getByRole('button',{name:'导出方案',exact:true}).click();const exported=JSON.parse(await main.getByLabel('频谱方案文本',{exact:true}).inputValue());assert.equal(exported.style,'dots');assert.equal(exported.visual.density,12);assert.equal(exported.music_enabled,undefined);
 await main.getByLabel('频谱方案文本',{exact:true}).fill('{invalid');await main.getByRole('button',{name:'应用文本方案',exact:true}).click();await main.getByRole('alert').filter({hasText:'格式不正确'}).waitFor();assert.equal(await main.getByLabel('频谱样式',{exact:true}).inputValue(),'dots');
 await main.getByLabel('频谱方案文本',{exact:true}).fill(exportDesign('led',{...exported.visual,density:18}));await main.getByRole('button',{name:'应用文本方案',exact:true}).click();await main.waitForFunction(()=>JSON.parse(localStorage.getItem('spectrum-native-settings')).music_style==='led');
 await main.getByRole('button',{name:'导入方案',exact:true}).click();await main.getByLabel('选择频谱方案文件',{exact:true}).setInputFiles({name:'curve.json',mimeType:'application/json',buffer:Buffer.from(exportDesign('curve',exported.visual))});await main.waitForFunction(()=>JSON.parse(localStorage.getItem('spectrum-native-settings')).music_style==='curve');
 await main.getByLabel('已保存方案',{exact:true}).selectOption('薄荷星点');await main.getByRole('button',{name:'删除',exact:true}).click();await main.getByLabel('已保存方案',{exact:true}).waitFor({state:'hidden'});
 checks.push('Shared text and JSON-file imports work; malformed imports preserve the current design; export excludes capture permissions; saved presets can be deleted');
 await main.getByLabel('响应系统播放音频',{exact:true}).check();
 const overlay=await context.newPage();overlay.on('pageerror',e=>errors.push(String(e)));await overlay.setViewportSize({width:280,height:144});await overlay.goto('http://127.0.0.1:1420/?overlay',{waitUntil:'networkidle'});await overlay.locator('.music-spectrum.audible').waitFor();
 for(const [id]of spectrumStyles){
  await main.getByLabel('频谱样式',{exact:true}).selectOption(id);await overlay.waitForFunction(style=>document.querySelector('.music-spectrum')?.dataset.mode===style,id);await overlay.waitForTimeout(350);
  const result=await overlay.locator('.music-spectrum').evaluate(el=>({lines:[...el.querySelectorAll('[data-band]')].filter(l=>l.getAttribute('visibility')!=='hidden').map(l=>({top:Math.min(Number(l.getAttribute('y1')),Number(l.getAttribute('y2'))),bottom:Math.max(Number(l.getAttribute('y1')),Number(l.getAttribute('y2')))})),curve:el.querySelector('[data-curve]').getAttribute('d'),dotsOpacity:getComputedStyle(el.querySelector('.frequency-dots')).opacity,curveOpacity:getComputedStyle(el.querySelector('.frequency-curve')).opacity,firstColor:el.querySelector('[data-band]').getAttribute('stroke'),peakOpacity:[...el.querySelectorAll('[data-peak]')].map(p=>p.getAttribute('opacity')),pointer:getComputedStyle(el).pointerEvents}));
  assert.equal(result.lines.length,12);assert.ok(result.lines.every(l=>l.top>=117.8&&l.bottom<=134.01),JSON.stringify({id,result}));assert.ok(!/NaN|Infinity/.test(result.curve));assert.equal(result.pointer,'none');assert.equal(result.firstColor,'#ff8800');assert.ok(result.peakOpacity.every(v=>Number(v)===0));
  if(id==='dots')assert.equal(result.dotsOpacity,'1');if(id==='curve')assert.equal(result.curveOpacity,'1');
  assert.equal(await overlay.locator('.pet-particle').count(),6);assert.equal(await overlay.locator('.mini-grip .character-portrait').count(),1);
  await overlay.screenshot({path:`test-results/spectrum-style-${id}.png`});
 }
 checks.push('All six rendered styles respect custom colors and density, remain below work particles at maximum height, stay within the window and never capture pointer events');
 await overlay.evaluate(()=>window.stopAudio());await overlay.waitForTimeout(2500);assert.equal(await overlay.locator('.music-spectrum.audible').count(),0);
 await main.getByText('精细调整',{exact:true}).click();await main.mouse.move(1100,950);await main.screenshot({path:'test-results/spectrum-studio-page.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile('test-results/spectrum-studio-browser.json',JSON.stringify({passed:true,synthetic_audio:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
