import { invoke, isTauri } from '@tauri-apps/api/core';
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow';
import { defaults, cleanSettings, emptySample, demoSample,acceptSample } from './domain.js';
export const native = isTauri();
export function listenLocal(event,handler){return getCurrentWebviewWindow().listen(event,handler);}
let settings=cleanSettings();
try { settings=cleanSettings(JSON.parse(localStorage.getItem('pulse-settings')||'{}')); } catch { settings={...defaults}; }
let sample=emptySample(), tick=0, timer, browserEpoch=0;
const listeners=new Set();
function publish(){for(const fn of listeners)fn(sample);}
export async function call(command,args={}) {
  if(native) return invoke(command,args);
  switch(command){
    case 'get_custom_avatar': return localStorage.getItem('pulse-custom-avatar');
    case 'get_state_avatars': return JSON.parse(localStorage.getItem('pulse-state-avatars')||'{}');
    case 'set_state_avatar': {
      if(!['idle','focused','reasoning','responding','tool','attention','completed','uncertain','unavailable'].includes(args.slot))throw Error('未知的头像状态');
      const pack=JSON.parse(localStorage.getItem('pulse-state-avatars')||'{}');
      if(args.image)pack[args.slot]=args.image;else delete pack[args.slot];
      localStorage.setItem('pulse-state-avatars',JSON.stringify(pack));
      const crops={...settings.state_avatar_crops};delete crops[args.slot];
      settings={...settings,state_avatar_crops:crops,state_avatar_revision:settings.state_avatar_revision+1,revision:settings.revision+1};
      localStorage.setItem('pulse-settings',JSON.stringify({...settings,locked:true}));return settings;
    }
    case 'set_custom_avatar':
      localStorage.setItem('pulse-custom-avatar',args.image);settings={...settings,avatar_crop:{x:50,y:50,zoom:1},character:'custom',avatar_revision:settings.avatar_revision+1,revision:settings.revision+1};localStorage.setItem('pulse-settings',JSON.stringify({...settings,locked:true}));return settings;
    case 'music_status': return {status:'unsupported',detail:'浏览器预览不采集系统音频',supported:false,epoch:0,sequence:0,at:0,bars:Array(24).fill(0)};
    case 'sample_snapshot': return sample;
    case 'settings_snapshot': return settings;
    case 'bootstrap_overlay': return {settings,sample,overlay_interaction:{}};
    case 'bootstrap': return {settings,sample,history:[],platform:'browser',shortcut_error:null,logs:[],selected_log:null,startup:{installed:false,loaded:false,supported:false}};
    case 'control':
      if(args.action==='live')throw Error('浏览器预览不能读取本地日志。请运行桌面应用，或查看演示。');
      clearInterval(timer);const epoch=++browserEpoch;sample={...emptySample(),stream_epoch:epoch};
      if(args.action==='demo'){tick=0;sample={...demoSample(tick),stream_epoch:epoch,checked_at:Date.now(),poll_sequence:1};timer=setInterval(()=>{sample={...demoSample(++tick),stream_epoch:epoch,checked_at:Date.now(),poll_sequence:tick+1};publish();},1000);}publish();return sample;
    case 'patch_settings': settings=cleanSettings({...settings,...(args.key==='music_design'?{music_style:args.value?.style,music_visual:args.value?.visual}:{[args.key]:args.value}),...(args.key==='follow_latest'&&!args.value?{pinned_log:args.pinnedLog}:{}),revision:settings.revision+1});localStorage.setItem('pulse-settings',JSON.stringify({...settings,locked:true}));return settings;
    case 'set_client_watch': throw Error('浏览器预览不能修改系统启动项。');
    case 'list_logs': return [];
    case 'history': return [];
    case 'clear_history': return null;
    case 'overlay_edit': settings={...settings,revision:settings.revision+1,locked:!args.editing,...(args.editing?{overlay_enabled:true}:{})};return !args.editing;
    case 'overlay_drag': return null;
    case 'show_main': return null;
    default: throw Error('此功能需要桌面应用');
  }
}
export async function subscribe(fn,onSettings=()=>{}){
  if(!native){listeners.add(fn);return ()=>listeners.delete(fn);}
  let disposed=false,busy=false,latest=emptySample();
  const receive=s=>{if(!disposed&&acceptSample(latest,s)){latest=s;fn(s);}};
  // Push for low latency; cheap native snapshots recover lost/queued events and
  // establish truth even when the main window has never been shown.
  const pull=async()=>{
    if(disposed||busy)return;
    if(!location.search.includes('overlay')&&document.visibilityState==='hidden')return;
    busy=true;
    try{const view=document.querySelector('[data-pulse-sequence]'),n=Number(view?.dataset.pulseSequence);receive(await invoke('sample_snapshot',{renderedIdleMood:view?.dataset.idleMood||null,renderedMusicMoving:document.querySelector('.music-pose')?.dataset.musicMoving==='true',renderedMusicDebug:document.querySelector('.music-pose')?.dataset.musicDebug||null,renderedMusicConversation:document.querySelector('.mini')?.dataset.musicTalk==='true',renderedCompanion:!!document.querySelector('.pet-dialogue'),renderedTasks:[...document.querySelectorAll('[data-task-id]')].map(el=>[el.dataset.taskId,el.dataset.taskOutput===''?null:Number(el.dataset.taskOutput)]),receivedLogId:latest.log_id||null,receivedSessionCount:latest.sessions?.length||0,renderedAvatarCount:document.querySelectorAll('.mini-grip .pet-face, .mini-grip > .character-portrait').length,renderedLogId:view?.dataset.pulseLogId||null,renderedOutputTokens:view?.dataset.pulseOutput!==''&&view?.dataset.pulseOutput!==undefined?Number(view.dataset.pulseOutput):null,renderedSequence:Number.isFinite(n)?n:null,renderedActivity:view?.dataset.pulseActivity||null,renderedCompletion:view?.dataset.pulseCard==='true'}));onSettings(await invoke('settings_snapshot'));}catch{}finally{busy=false;}
  };
  let off;
  try{off=await listenLocal('pulse:sample',event=>receive(event.payload));}catch{}
  const timer=setInterval(pull,1000);window.addEventListener('focus',pull);document.addEventListener('visibilitychange',pull);pull();
  return()=>{disposed=true;clearInterval(timer);off?.();window.removeEventListener('focus',pull);document.removeEventListener('visibilitychange',pull);};
}
