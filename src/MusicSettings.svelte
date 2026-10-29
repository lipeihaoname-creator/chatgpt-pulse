<script>
 import {onMount} from 'svelte';
 import SpectrumStudio from './SpectrumStudio.svelte';
 import {call,native,listenLocal} from './lib/bridge.js';
 import {silentAudio} from './lib/music.js';
 import {acceptAudio} from './lib/audio-order.js';
 import {reducedMotion} from './lib/reduced-motion.js';
 export let settings,change,platform;
 let audio={...silentAudio},busy=false,error='';
 function receive(next){if(acceptAudio(audio,next))audio=next;}
 onMount(()=>{
  if(!native)return;let disposed=false,off;
  const cleanup=()=>{try{Promise.resolve(off?.()).catch(()=>{});}catch{}};
  (async()=>{off=await listenLocal('pulse:audio-status',e=>{if(!disposed)receive(e.payload);});if(disposed){cleanup();return;}const next=await call('music_status');if(!disposed)receive(next);})().catch(e=>{if(!disposed)error=String(e);});
  return()=>{disposed=true;cleanup();};
 });
 async function start(){busy=true;error='';try{receive(await call('music_start'));}catch(e){error=String(e);}finally{busy=false;}}
 async function toggle(enabled){busy=true;error='';try{if(await change('music_enabled',enabled)===false)return;if(enabled)receive(await call('music_start'));else receive(await call('music_status'));}catch(e){error=String(e);}finally{busy=false;}}
</script>
<section class="panel settings-panel" aria-label="音乐律动设置">
 <h2>系统音频</h2>
 <div class="setting-row"><div><b>响应系统播放音频</b><p>仅在本机内存分析，不保存音频、不上传，不使用麦克风。</p></div><input aria-label="响应系统播放音频" type="checkbox" disabled={busy||!native||(!audio.supported&&!settings.music_enabled)} checked={settings.music_enabled} onchange={e=>toggle(e.currentTarget.checked)}/></div>
 <p class="music-status" role="status">{!native?'请在桌面应用中使用':settings.music_enabled&&audio.status==='off'?'采集未启动，可点击下方重试':audio.detail}</p>
 {#if platform==='windows'}<p class="music-status">跟随默认播放设备；系统混音可能包含视频、游戏和通话声音，受保护音频可能无法取得。</p>{/if}
  {#if settings.music_enabled&&audio.supported}
  {#if !['active','silent','starting','recovering'].includes(audio.status)}<button class="secondary" disabled={busy} onclick={start}>启动 / 重试音频</button>{/if}
 {/if}
</section>
<SpectrumStudio {settings} {change}/>
{#if settings.music_enabled&&audio.supported}
 <section class="panel settings-panel" aria-label="人物律动设置">
  <h2>人物</h2>
  <div class="setting-row"><div><b>空闲人物律动</b><p>未发现进行中的任务时随音乐轻动；工作或日志读取异常时暂停。</p></div><input type="checkbox" aria-label="空闲人物律动" checked={settings.music_motion} onchange={e=>change('music_motion',e.currentTarget.checked)}/></div>
  <div class="setting-row"><div><b>律动强度</b></div><input type="range" aria-label="律动强度" min="0" max="1" step="0.05" value={settings.music_strength} onchange={e=>change('music_strength',Number(e.currentTarget.value))}/></div>
  <div class="setting-row"><div><b>音乐话题</b></div><input type="checkbox" aria-label="音乐话题" checked={settings.music_dialogue} onchange={e=>change('music_dialogue',e.currentTarget.checked)}/></div>
  {#if settings.music_motion&&!settings.animations}<p class="music-status">角色动效已关闭 <button class="quiet" onclick={()=>change('animations',true)}>开启动效</button></p>{:else if settings.music_motion&&settings.do_not_disturb}<p class="music-status">勿扰模式已开启，人物律动暂停</p>{:else if settings.music_motion&&$reducedMotion}<p class="music-status">系统已开启“减少动态效果”，人物律动暂停</p>{/if}
 </section>
{/if}
{#if error}<p class="warning" role="alert">{error}</p>{/if}
<style>.music-status{font-size:12px;color:var(--muted,#9aaca2);margin:12px 0}input[type=range]{max-width:150px}</style>
