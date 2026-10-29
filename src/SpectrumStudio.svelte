<script>
 import SpectrumPreview from './SpectrumPreview.svelte';
 import {themeStyle} from './lib/appearance.js';
 import {spectrumStyles,cleanVisual,cleanPresets,exportDesign,importDesign} from './lib/music-settings.js';
 export let settings,change;
 let draft=cleanVisual(),previous,busy=false,name='',selected='',message='',error='',sharing=false,shareText='',fileInput,textInput;
 $: if(JSON.stringify(settings.music_visual)!==previous){previous=JSON.stringify(settings.music_visual);draft=cleanVisual(settings.music_visual);}
 $: presets=cleanPresets(settings.music_presets);
 function preview(key,value){draft=cleanVisual({...draft,[key]:value});}
 async function saveVisual(){await change('music_visual',draft);}
 async function design(style,visual=draft){busy=true;error='';try{return await change('music_design',{style,visual});}finally{busy=false;}}
 async function savePreset(){
  const clean=Array.from(name.trim()).slice(0,24).join('');if(!clean){error='请先给方案起个名字';return;}
  if(presets.length>=12&&!presets.some(p=>p.name===clean)){error='最多保存 12 个方案，请先删除一个';return;}
  busy=true;error='';try{if(await change('music_presets',[...presets.filter(p=>p.name!==clean),{name:clean,style:settings.music_style,visual:draft}])!==false){selected=clean;name=clean;message='方案已保存';}}finally{busy=false;}
 }
 async function loadPreset(value){selected=value;const p=presets.find(p=>p.name===value);if(p&&await design(p.style,p.visual)!==false){name=p.name;message='已应用 '+p.name;}}
 async function removePreset(){if(!selected)return;busy=true;try{if(await change('music_presets',presets.filter(p=>p.name!==selected))!==false){selected='';message='方案已删除';}}finally{busy=false;}}
 function share(){error='';message='';shareText=exportDesign(settings.music_style,draft);sharing=true;}
 async function applyText(){error='';try{const next=importDesign(shareText);if(await design(next.style,next.visual)!==false){sharing=false;message='方案已应用';}}catch(e){error=String(e.message||e);}}
 async function readFile(event){const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;error='';try{if(file.size>16384)throw Error('方案文件最多 16 KB');const next=importDesign(await file.text());if(await design(next.style,next.visual)!==false){message='方案已导入';sharing=false;}}catch(e){error=String(e.message||e);}}
 async function copy(){try{await navigator.clipboard.writeText(shareText);message='方案已复制';}catch{textInput?.focus();textInput?.select();message='请按 ⌘C 复制已选中的方案';}}
</script>
<section class="panel settings-panel spectrum-studio" aria-label="频谱设置" style={themeStyle(settings.theme)}>
 <div class="spectrum-heading"><h2>频谱</h2><label class="spectrum-switch"><input type="checkbox" aria-label="显示频谱" checked={settings.music_spectrum} onchange={e=>change('music_spectrum',e.currentTarget.checked)}/>显示</label></div>
 <div class="spectrum-cards" role="group" aria-label="频谱样式选择">
  {#each spectrumStyles as [id,label]}<button class:selected={settings.music_style===id} aria-pressed={settings.music_style===id} aria-label={'选择'+label} disabled={busy} onclick={()=>design(id)}><SpectrumPreview style={id} visual={draft}/><span>{label}</span></button>{/each}
 </div>
 <div class="setting-row"><div><b>频谱样式</b></div><select aria-label="频谱样式" value={settings.music_style} disabled={busy} onchange={e=>design(e.currentTarget.value)}>{#each spectrumStyles as [id,label]}<option value={id}>{label}</option>{/each}</select></div>
 <div class="studio-sample" aria-label="当前频谱示例"><SpectrumPreview style={settings.music_style} visual={draft}/><span>样式示例</span></div>
 <div class="setting-row"><b>配色</b><select aria-label="频谱配色" value={draft.color_mode} onchange={e=>{preview('color_mode',e.currentTarget.value);saveVisual();}}><option value="theme">跟随主题</option><option value="solid">自选单色</option><option value="gradient">双色渐变</option><option value="rainbow">彩虹频段</option></select></div>
 {#if ['solid','gradient'].includes(draft.color_mode)}<div class="color-row"><label>主色<input type="color" aria-label="频谱主色" value={draft.color} oninput={e=>preview('color',e.currentTarget.value)} onchange={saveVisual}/></label>{#if draft.color_mode==='gradient'}<label>尾色<input type="color" aria-label="频谱尾色" value={draft.color2} oninput={e=>preview('color2',e.currentTarget.value)} onchange={saveVisual}/></label>{/if}</div>{/if}
 <div class="setting-row"><b>疏密</b><select aria-label="频谱疏密" value={String(draft.density)} onchange={e=>{preview('density',Number(e.currentTarget.value));saveVisual();}}><option value="12">疏朗 · 12 条</option><option value="18">适中 · 18 条</option><option value="24">细腻 · 24 条</option></select></div>
 <details class="spectrum-details"><summary>精细调整</summary>
  {#each [['width','线条粗细',1,4,.1,'px'],['height','频谱高度',.6,1.4,.05,'×'],['gain','响应强度',.5,1.8,.05,'×'],['contrast','条带对比度',1,3,.05,'×'],['response','回落柔和度',.5,2,.05,'×'],['opacity','频谱透明度',.3,1,.05,'']] as [key,label,min,max,step,unit]}<label class="spectrum-range"><span>{label}</span><input type="range" aria-label={label} {min} {max} {step} value={draft[key]} oninput={e=>preview(key,Number(e.currentTarget.value))} onchange={saveVisual}/><output>{draft[key].toFixed(2)}{unit}</output></label>{/each}
  {#if settings.music_style==='curve'}<label class="spectrum-range"><span>曲线填充</span><input type="range" aria-label="曲线填充" min="0" max=".4" step=".02" value={draft.fill} oninput={e=>preview('fill',Number(e.currentTarget.value))} onchange={saveVisual}/><output>{Math.round(draft.fill*100)}%</output></label>{/if}
  {#each [['peaks','峰值点'],['rounded','圆角线条'],['mirror','中心对称']] as [key,label]}<label class="studio-check"><span>{label}</span><input type="checkbox" aria-label={label} checked={draft[key]} onchange={e=>{preview(key,e.currentTarget.checked);saveVisual();}}/></label>{/each}
  <button class="quiet" disabled={busy} onclick={()=>design(settings.music_style,cleanVisual())}>重置频谱外观</button>
 </details>
 <details class="spectrum-details"><summary>我的方案</summary>
  <div class="preset-row"><input aria-label="方案名称" maxlength="24" bind:value={name} placeholder="给方案起个名字"/><button class="secondary" disabled={busy} onclick={savePreset}>保存 / 覆盖</button></div>
  {#if presets.length}<div class="preset-row"><select aria-label="已保存方案" value={selected} disabled={busy} onchange={e=>loadPreset(e.currentTarget.value)}><option value="">选择已保存方案</option>{#each presets as p}<option value={p.name}>{p.name}</option>{/each}</select><button class="quiet" disabled={busy||!selected} onclick={removePreset}>删除</button></div>{/if}
  <div class="preset-row"><button class="secondary" onclick={share}>导出方案</button><button class="secondary" onclick={()=>{sharing=true;shareText='';error='';message='';}}>导入方案</button></div>
 </details>
 {#if sharing}<div class="scheme-share" role="group" aria-label="分享频谱方案"><label for="spectrum-json">频谱方案文本</label><textarea id="spectrum-json" aria-label="频谱方案文本" bind:this={textInput} bind:value={shareText} spellcheck="false"></textarea><div class="preset-row"><button class="secondary" onclick={copy}>复制方案</button><button class="secondary" disabled={busy} onclick={applyText}>应用文本方案</button><button class="quiet" onclick={()=>fileInput.click()}>读取 JSON 文件</button><button class="quiet" onclick={()=>sharing=false}>关闭</button></div></div>{/if}
 <input class="spectrum-file" bind:this={fileInput} type="file" accept="application/json,.json" aria-label="选择频谱方案文件" onchange={readFile}/>
 {#if message}<p class="studio-note" role="status">{message}</p>{/if}{#if error}<p class="warning" role="alert">{error}</p>{/if}
</section>
<style>
 .spectrum-heading{display:flex;justify-content:space-between;align-items:center}.spectrum-heading h2{margin:0}.spectrum-switch{display:flex;gap:8px;align-items:center;font-size:12px}.spectrum-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:20px 0 4px}.spectrum-cards button{min-width:0;background:#141e19;border:1px solid #354b3e;border-radius:12px;padding:14px 10px;color:#a8d6bd}.spectrum-cards button.selected{border-color:#8ee0b4;background:#223d2e;box-shadow:0 0 0 1px #8ee0b455}.spectrum-cards span{display:block;font-size:12px;margin-top:5px}.studio-sample{display:flex;align-items:center;justify-content:center;gap:20px;background:#101713;border-radius:12px;border:1px solid #314037;padding:18px 24px;color:#b0d9c2}.studio-sample :global(svg){width:220px;height:68px}.studio-sample span{font-size:10px;color:#8fa397;white-space:nowrap}.color-row{display:flex;gap:24px;justify-content:flex-end;padding:12px}.color-row label{display:flex;gap:12px;align-items:center;font-size:12px}.color-row input{padding:2px;width:48px;height:32px;background:none;border:1px solid #53685b}.spectrum-details{border-top:1px solid #354239;margin-top:16px;padding-top:16px}.spectrum-details summary{cursor:pointer;color:#c4d5c9;font-size:13px;padding:6px 0}.spectrum-range{display:grid;grid-template-columns:110px minmax(80px,1fr) 64px;gap:14px;align-items:center;padding:12px 0;font-size:12px;color:#bacabe}.spectrum-range input{width:100%;min-width:0}.spectrum-range output{text-align:right;font-variant-numeric:tabular-nums;color:#90b39d}.studio-check{display:flex;justify-content:space-between;padding:10px 0;font-size:12px}.preset-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.preset-row input,.preset-row select{flex:1;min-width:140px}.preset-row input,.preset-row select,textarea{background:#111c15;border:1px solid #43584a;color:#d0e4d6;border-radius:6px;padding:10px}.preset-row button{white-space:nowrap}.scheme-share{margin-top:18px}.scheme-share label{font-size:12px;color:#aabdac}textarea{display:block;width:100%;min-height:170px;box-sizing:border-box;font:11px/1.6 monospace;margin-top:10px;resize:vertical}.spectrum-file{display:none}.studio-note{font-size:12px;color:#a7cbb4}.spectrum-range input[type=range]{accent-color:#91d4ae}
 @media(max-width:850px){.spectrum-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.spectrum-range{grid-template-columns:92px minmax(60px,1fr) 54px;gap:8px}}
</style>
