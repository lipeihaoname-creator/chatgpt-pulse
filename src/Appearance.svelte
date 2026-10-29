<script>
 import {emotionNames} from './lib/idle-companion.js';
 import {onDestroy} from 'svelte';
 import MonitorFace from './MonitorFace.svelte';
 import AvatarCropper from './AvatarCropper.svelte';
 import {themes,characters,characterName} from './lib/appearance.js';
 import {emptySample,statusDisplay,rateDisplay,pulseCells} from './lib/domain.js';
 import {avatarLoader,importAvatar,importStateAvatar,stateAvatars as readStateAvatars} from './lib/avatar.js';
 import {avatarSlots,defaultCrop} from './lib/personalization.js';
 import {call} from './lib/bridge.js';
 export let settings,change,onsettings;
 let phase='reasoning',previewMood='',previewSequence=0,custom=null,error='',avatarError='',notice='',uploading=false,fileInput;
 let stateAvatars={},packError='',stateSlot='reasoning',slotInput,stateUploading=false,cropTarget=null;
 const packLoader=avatarLoader(value=>stateAvatars=value||{},value=>packError=value,readStateAvatars);
 const loader=avatarLoader(value=>custom=value,value=>avatarError=value);onDestroy(()=>{loader.dispose();packLoader.dispose();});
 const phases=[['paused','等候'],['processing','专注'],['reasoning','思考'],['responding','输出'],['tool','工具'],['waiting_user','等你'],['completed','完成'],['quiet','待确认'],['unavailable','不可读']];
 $: loader.load(settings.avatar_revision);
 $: packLoader.load(settings.state_avatar_revision);
 $: cropImage=cropTarget==='custom'?custom:stateAvatars[cropTarget];
 $: initialCrop=cropTarget==='custom'?settings.avatar_crop:settings.state_avatar_crops?.[cropTarget]||defaultCrop;
 $: now=Date.now();
 $: sample={...emptySample(),source:'demo',state:phase==='paused'?'paused':phase==='completed'?'completed':phase==='unavailable'?'unavailable':'running',activity_status:phase,activity_at:phase==='quiet'?now-31000:now,checked_at:now,rate:phase==='completed'?0:42.8,output_tokens:1280,pulses:[{at:Math.floor(now/2000)*2000,last_at:now,count:2,kind:'reasoning'},{at:Math.floor(now/2000)*2000-6000,count:1,kind:'tool_started'}]};
 $: work=statusDisplay(sample,now);$: speed=rateDisplay(sample,now);$: pulses=pulseCells(sample,now);
 async function upload(event){
  const input=event.currentTarget,file=input.files?.[0];if(!file||uploading)return;
  uploading=true;error='';notice='';
  try{const next=await importAvatar(file);if(next){onsettings(next);notice='头像已导入，可继续调整脸部位置';cropTarget='custom';}}
  catch(e){error=String(e);}finally{uploading=false;input.value='';}
 }
 async function uploadState(event){
  const input=event.currentTarget,file=input.files?.[0],slot=stateSlot;if(!file||stateUploading)return;
  stateUploading=true;error='';notice='';
  try{const next=await importStateAvatar(file,slot);if(next){onsettings(next);cropTarget=slot;phase=({idle:'paused',focused:'processing',attention:'waiting_user',uncertain:'quiet'})[slot]||slot;notice='状态图片已保存在本机，可继续裁剪';}}
  catch(e){error=String(e);}finally{stateUploading=false;input.value='';}
 }
 async function removeState(){error='';try{onsettings(await call('set_state_avatar',{slot:stateSlot,image:null}));if(cropTarget===stateSlot)cropTarget=null;notice='已恢复默认状态表情';}catch(e){error=String(e);}}
 async function saveCrop(value){
  const custom=cropTarget==='custom';
  onsettings(await call('patch_settings',{key:custom?'avatar_crop':'state_avatar_crops',value:custom?value:{...settings.state_avatar_crops,[cropTarget]:value}}));
  cropTarget=null;notice='裁剪已保存，悬浮头像同步更新';
 }
</script>
<section class="panel settings-panel" aria-label="个性化外观">
 <h2>个性化外观</h2>
 <div class="appearance-preview" aria-label="外观预览"><MonitorFace {previewMood} {previewSequence} {settings} {work} {speed} {pulses} {sample} {custom} {stateAvatars}/></div>
 <p class="appearance-caption">外观预览</p>
 <div class="appearance-states" aria-label="预览表情">{#each phases as [value,label]}<button class:selected={phase===value} onclick={()=>{phase=value;previewMood='';}}>{label}</button>{/each}</div>
 {#if characters[settings.character]}<div class="appearance-states" aria-label="空闲表情预览">{#each Object.entries(emotionNames) as [value,label]}<button class:selected={previewMood===value} onclick={()=>{phase='paused';previewMood=value;previewSequence++;}}>{label}</button>{/each}<button class:selected={previewMood==='proud'} onclick={()=>{phase='paused';previewMood='proud';previewSequence++;}}>小得意</button></div>{/if}
 <div class="setting-row"><div><b>显示样式</b></div><select aria-label="显示样式" value={settings.overlay_layout} onchange={e=>change('overlay_layout',e.currentTarget.value)}><option value="bar">轻盈悬浮条</option><option value="avatar">头像气泡</option></select></div>
 <div class="theme-picker" aria-label="主题配色">{#each Object.entries(themes) as [key,t]}<button class="theme-choice" class:selected={settings.theme===key} aria-pressed={settings.theme===key} onclick={()=>change('theme',key)}><i style={`background:${t.accent}`}></i>{t.name}</button>{/each}</div>
 <div class="setting-row"><div><b>角色头像</b></div><div class="appearance-control"><select aria-label="角色头像" value={settings.character} onchange={e=>change('character',e.currentTarget.value)}>{#each Object.entries(characters) as [key,c]}<option value={key}>{c.name} · 状态表情</option>{/each}<option value="custom" disabled={!settings.avatar_revision}>自定义图片</option><option value="none">极简图标</option></select><button class="secondary" disabled={uploading} onclick={()=>fileInput.click()}>{uploading?'处理中':'导入图片'}</button><input bind:this={fileInput} class="appearance-upload" aria-label="导入头像图片" type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onchange={upload}/></div></div>

 {#if custom}<div class="appearance-control"><button class="secondary" onclick={()=>cropTarget='custom'}>调整头像</button></div>{/if}
 <div class="setting-row"><div><b>自定义状态图包</b><p>为不同状态设置图片</p></div><input aria-label="启用状态图包" type="checkbox" checked={settings.state_avatars_enabled} onchange={e=>change('state_avatars_enabled',e.currentTarget.checked)}/></div>
 <div class="state-pack-control"><select aria-label="状态图片" bind:value={stateSlot} disabled={stateUploading}>{#each avatarSlots as [slot,label]}<option value={slot}>{label}{stateAvatars[slot]?' · 已设置':''}</option>{/each}</select><button class="secondary" disabled={stateUploading} onclick={()=>slotInput.click()}>{stateUploading?'处理中':'导入状态图片'}</button><button class="secondary" disabled={!stateAvatars[stateSlot]} onclick={()=>cropTarget=stateSlot}>裁剪状态图片</button><button class="quiet" disabled={!stateAvatars[stateSlot]||stateUploading} onclick={removeState}>恢复默认</button><input bind:this={slotInput} class="appearance-upload" aria-label="导入状态图片文件" type="file" disabled={stateUploading} accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onchange={uploadState}/></div>
 {#if cropTarget&&cropImage}{#key cropTarget+cropImage}<AvatarCropper image={cropImage} initial={initialCrop} onsave={saveCrop} oncancel={()=>cropTarget=null}/>{/key}{/if}
 {#if error||packError||(settings.character==='custom'&&avatarError)}<p class="warning" role="alert">{error||packError||avatarError}</p>{/if}
 {#if notice}<p class="appearance-caption" role="status">{notice}</p>{/if}
 {#if settings.character==='custom'&&(avatarError||!custom)}<p class="appearance-caption">图片尚未加载。<button class="text-button" onclick={()=>loader.load(settings.avatar_revision)}>重试加载头像</button></p>{/if}
 <div class="setting-row"><div><b>空闲主动对话</b><p>空闲时随机出现，点击头像接话</p></div><input type="checkbox" aria-label="空闲主动对话" checked={settings.idle_chat} onchange={e=>change('idle_chat',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>聊天频率</b></div><select aria-label="聊天频率" value={settings.idle_frequency} onchange={e=>change('idle_frequency',e.currentTarget.value)}><option value="quiet">安静一点</option><option value="balanced">偶尔聊聊</option><option value="lively">活泼一点</option></select></div>
 <div class="setting-row"><div><b>空闲表情与动作</b></div><input type="checkbox" aria-label="空闲表情与动作" checked={settings.idle_motions} onchange={e=>change('idle_motions',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>点击头像互动</b><p>轻点互动，按住拖动</p></div><input aria-label="点击头像互动" type="checkbox" checked={settings.dialogue_enabled} onchange={e=>change('dialogue_enabled',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>靠边自动吸附</b></div><input aria-label="靠边自动吸附" type="checkbox" checked={settings.edge_snap} onchange={e=>change('edge_snap',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>空闲贴边收纳</b><p>贴边空闲时只显示头像</p></div><input aria-label="空闲贴边收纳" type="checkbox" checked={settings.idle_collapse} onchange={e=>change('idle_collapse',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>完成小剧场</b></div><input aria-label="完成小剧场" type="checkbox" checked={settings.completion_scene} onchange={e=>change('completion_scene',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>勿扰模式</b><p>关闭自动互动，保留监测</p></div><input aria-label="勿扰模式" type="checkbox" checked={settings.do_not_disturb} onchange={e=>change('do_not_disturb',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>动效</b></div><input aria-label="启用角色动效" type="checkbox" checked={settings.animations} onchange={e=>change('animations',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>飘动粒子</b></div><input type="checkbox" aria-label="状态小饰品" checked={settings.status_accessories} onchange={e=>change('status_accessories',e.currentTarget.checked)}/></div>
 <div class="setting-row"><div><b>多任务显示</b><p>共享一个头像</p></div><select aria-label="多任务显示" value={settings.task_display} onchange={e=>change('task_display',e.currentTarget.value)}><option value="separate">多个气泡 · 上下排列</option><option value="combined">一个气泡 · 分行显示</option></select></div>
 <div class="setting-row"><div><b>气泡显示</b><p>需关注的状态始终显示</p></div><select aria-label="气泡显示" value={settings.bubble_mode} onchange={e=>change('bubble_mode',e.currentTarget.value)}><option value="always">一直显示</option><option value="working">工作或需关注时</option></select></div>
 <div class="setting-row"><div><b>显示累计输出</b></div><input aria-label="显示累计输出" type="checkbox" checked={settings.show_total} onchange={e=>change('show_total',e.currentTarget.checked)}/></div>
 
</section>
