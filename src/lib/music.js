import {readable} from 'svelte/store';
import {native,call,listenLocal} from './bridge.js';
import {acceptAudio} from './audio-order.js';
export {spectrumLines} from './music-animation.js';
export const silentAudio={status:'off',detail:'未启用系统音频',supported:false,view_visible:null,epoch:0,sequence:0,at:0,bars:Array(24).fill(0),rms:0,low:0,mid:0,high:0,active:false,stable_seconds:0,beat:0,beat_strength:0};
export function cleanAudio(value={}){
 const bounded=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
 return {...silentAudio,...value,bars:Array.from({length:24},(_,i)=>bounded(value.bars?.[i])),rms:bounded(value.rms),beat_strength:bounded(value.beat_strength)};
}
let latest={...silentAudio};
export const currentAudio=()=>latest;
export function freshAudio(frame,now=Date.now()){
 return frame?.supported&&frame.status==='active'&&frame.active&&Number.isFinite(frame.at)&&now-frame.at>=-1000&&now-frame.at<1200;
}
export function musicIdle(sample,work,now=Date.now()){
 // This authorizes a decorative response to audio, not a claim that GPT is idle.
 // The backend requires a successful live scan and excludes every unfinished/error row.
 return sample.music_idle_confirmed===true&&sample.source==='logs'&&['waiting','completed','aborted'].includes(sample.state)&&Number.isFinite(sample.checked_at)&&now-sample.checked_at>=-1000&&now-sample.checked_at<5000&&!sample.task_unfinished&&!sample.pending_tools&&(sample.sessions||[]).every(s=>!s.task_unfinished&&!s.pending_tools&&['waiting','completed','aborted'].includes(s.state));
}
export function musicTalkAllowed(settings,sample,work,audio,now=Date.now()){
 return settings.music_enabled&&settings.music_dialogue&&!settings.do_not_disturb&&musicIdle(sample,work,now)&&freshAudio(audio,now)&&audio.stable_seconds>=3;
}
// Only components needing audio subscribe. High-rate frames never enter the
// dashboard/sample/settings stores or trigger an entire dashboard render.
export const systemAudio=readable(latest,set=>{
 if(!native)return;
 let disposed=false,off;
 const receive=value=>{if(disposed||!acceptAudio(latest,value))return;const f=cleanAudio(value);latest=f;set(f);};
 const cleanup=()=>{try{Promise.resolve(off?.()).catch(()=>{});}catch{}};
 (async()=>{off=await listenLocal('pulse:audio',e=>receive(e.payload));if(disposed){cleanup();return;}receive(await call('music_status'));})().catch(()=>receive({...silentAudio,status:'unavailable',detail:'系统音频连接不可用'}));
 return()=>{disposed=true;cleanup();};
});
