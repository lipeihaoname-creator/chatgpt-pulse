<script>
 import {onDestroy,onMount} from 'svelte';
 import {avatarPress} from './lib/avatar-press.js';
 import {idleDirector,isCompanionIdle,idleMoodsFor} from './lib/idle-companion.js';
 import {exchangeDeck} from './lib/idle-lines.js';
 import {chooseDialogue} from './lib/dialogue.js';
 import StatusAccessory from './StatusAccessory.svelte';
 import MusicSpectrum from './MusicSpectrum.svelte';
 import {currentAudio,musicIdle,musicTalkAllowed} from './lib/music.js';
 import {musicSurfaceVisible} from './lib/music-animation.js';
 import {anchorBubbles} from './lib/bubble-anchor.js';
 import MaiAvatar from './MaiAvatar.svelte';
 import PetFace from './PetFace.svelte';
 import TaskMetrics from './TaskMetrics.svelte';
 import {statusDisplay,rateDisplay,pulseCells} from './lib/domain.js';
 import {shortStatus,themeStyle,bubbleVisible,characterName} from './lib/appearance.js';
 import {shouldCollapse,completionScene} from './lib/personalization.js';
 import {reducedMotion} from './lib/reduced-motion.js';
 export let settings,work,speed,pulses=[],sample,card=null,custom=null;
 export let musicAvailable=false;
 export let bubbleOnly=false,proactive=false,previewMood='',previewSequence=0,offlineTest=false;
 export let locked=true,faded=false,gripActive=false,dragging=false,error='';
 export let ondrag=()=>{},onlock=()=>{},nativePointer=false,onmenu=()=>{};
 export let stateAvatars={},dockSide=0,avatarRight=dockSide===1;
 let dialogue=null,shown='',typing=false,talkTimer,typeTimer,lastNativeTap=0,lastLine='',interactionSequence=0;
 let scene=null,sceneTimer,clock=Date.now(),idleSince=Date.now();const mounted=Date.now(),scenes=completionScene();
 const director=idleDirector(),exchanges=exchangeDeck();
 let idleDebug='',lastMusicConversation=0,conversation=null,mood='',moodSequence=0,moodTimer,previousMood='',wasVisible=true,previousFrequency;
 $: if(settings.idle_frequency!==previousFrequency){previousFrequency=settings.idle_frequency;director.reset();}
 $: idleReady=proactive&&!bubbleOnly&&settings.overlay_enabled&&locked&&['mai','roxy'].includes(settings.character)&&(isCompanionIdle(sample,work,clock)||(musicAvailable&&settings.music_enabled&&musicIdle(sample,work,clock)));
 function clearMood(){clearTimeout(moodTimer);mood='';}
 function animateIdle(value,duration=5200){if(settings.do_not_disturb||!settings.animations||$reducedMotion||!settings.idle_motions)return;clearMood();mood=value;moodSequence++;previousMood=value;moodTimer=setTimeout(()=>mood='',duration);}
 function showDialogue(value){
  clearTimeout(talkTimer);clearInterval(typeTimer);dialogue=value;lastLine=value.text;shown='';typing=true;
  const chars=Array.from(value.text);let i=1;shown=chars[0]||'';
  if(!settings.animations||$reducedMotion){shown=value.text;typing=false;}
  else typeTimer=setInterval(()=>{shown=chars.slice(0,++i).join('');if(i>=chars.length){clearInterval(typeTimer);typing=false;}},38);
  talkTimer=setTimeout(stop,value.automatic?12000:8000);
 }
 function companion(automatic=false){
  const now=Date.now();
  if(!automatic&&conversation&&(!conversation.music||musicTalkAllowed(settings,sample,work,currentAudio(),now))&&now-conversation.at<45000&&conversation.next<conversation.lines.length){
   const index=conversation.next++;showDialogue({text:conversation.lines[index],channel:'companion',automatic:false});conversation.at=now;animateIdle(conversation.moods[index],8000);
  }else{const next=exchanges.next(settings.character,{music:musicAvailable&&musicTalkAllowed(settings,sample,work,currentAudio(),now),preferMusic:automatic&&now-lastMusicConversation>300000});if(!next)return;if(next.music)lastMusicConversation=now;conversation={...next,next:1,at:now};showDialogue({text:next.lines[0],channel:'companion',automatic});animateIdle(next.moods[0],automatic?12000:8000);}
  director.defer(now,settings.idle_frequency);
 }
 function idleTick(){
  const visible=typeof document!=='undefined'&&musicSurfaceVisible(currentAudio(),document.visibilityState==='visible');
  if(!visible){wasVisible=false;director.reset();clearMood();if(dialogue?.automatic)stop();return;}
  if(!wasVisible){wasVisible=true;director.reset();return;}
  const event=director.tick({now:Date.now(),eligible:idleReady&&!settings.do_not_disturb,suppressed:dragging||gripActive||faded,chat:settings.idle_chat&&settings.dialogue_enabled,motion:settings.idle_motions&&settings.animations&&!$reducedMotion,busy:!!dialogue||!!scene||!!mood,frequency:settings.idle_frequency,music:musicAvailable&&musicTalkAllowed(settings,sample,work,currentAudio())});
  if(offlineTest)idleDebug=JSON.stringify({...director.inspect(),chat:settings.idle_chat,enabled:settings.dialogue_enabled,frequency:settings.idle_frequency,visible,now:Date.now()});
  if(event==='chat')companion(true);
  if(event==='motion'){const choices=idleMoodsFor(settings.character).filter(value=>value!==previousMood);animateIdle(choices[Math.floor(Math.random()*choices.length)]);}
 }
 $: if(!idleReady){director.reset();clearMood();if(dialogue?.automatic||(dialogue?.channel==='companion'&&proactive&&!['paused','waiting','completed','aborted'].includes(work.key))){stop();conversation=null;}}
 $: if(settings.do_not_disturb||!settings.idle_chat||!settings.dialogue_enabled){if(dialogue?.automatic)stop();}
 $: if(dragging){clearMood();if(dialogue?.automatic)stop();}
 $: if(settings.do_not_disturb||!settings.idle_motions||!settings.animations||$reducedMotion)clearMood();
 let previousCharacter;
 $: if(settings.character!==previousCharacter){previousCharacter=settings.character;stop();scene=null;clearTimeout(sceneTimer);lastLine='';conversation=null;director.reset();clearMood();}
 onMount(()=>{const timer=setInterval(()=>{clock=Date.now();idleTick();},500);return()=>clearInterval(timer);});
 function celebrate(sample,settings){
  if(!bubbleOnly&&scenes.take(sample,settings,Date.now(),mounted)){
   scene=chooseDialogue('completed','',settings.character).text;clearTimeout(sceneTimer);sceneTimer=setTimeout(()=>scene=null,4500);
  }
 }
 $: celebrate(sample,settings);
 $: if(!settings.completion_scene||settings.do_not_disturb){scene=null;clearTimeout(sceneTimer);}
 $: if(work.key!=='completed'){scene=null;clearTimeout(sceneTimer);}
 $: if(!['paused','waiting','completed','aborted'].includes(work.key))idleSince=clock;
 function stop(){if(dialogue?.channel==='companion')clearMood();clearTimeout(talkTimer);clearInterval(typeTimer);dialogue=null;shown='';typing=false;}
 export function speak({nativeId}={}){
  const confirmed=Number.isSafeInteger(nativeId)&&nativeId>0;
  if(bubbleOnly||!settings.dialogue_enabled||confirmed&&nativeId<=lastNativeTap||!confirmed&&dragging)return;
  if(confirmed)lastNativeTap=nativeId;
  interactionSequence++;
  if(['mai','roxy'].includes(settings.character)&&(['paused','waiting','completed','aborted'].includes(work.key)||musicReady)){companion(false);return;}
  conversation=null;director.defer(Date.now(),settings.idle_frequency);
  showDialogue(chooseDialogue(work.key,lastLine,settings.character));
 }
 const press=avatarPress();
 function down(event){
  // Pointer presses must not leave a keyboard focus ring on the avatar.
  if(event.button===0)event.preventDefault();
  if(press.begin(event)&&nativePointer)ondrag(event);
 }
 function move(event){
  if(!nativePointer&&press.move(event))ondrag(event);
 }
 function click(event){
  if(press.finish(event,nativePointer))speak();
 }
 $: if(!settings.dialogue_enabled)stop();
 $: if((!settings.animations||$reducedMotion)&&typing&&dialogue){clearInterval(typeTimer);shown=dialogue.text;typing=false;}
 onDestroy(()=>{stop();clearMood();director.reset();clearTimeout(sceneTimer);});
 $: displayMood=!proactive&&previewMood?previewMood:mood;
 $: displaySequence=!proactive&&previewMood?previewSequence:moodSequence;
 $: avatar=settings.overlay_layout==='avatar';
 $: musicSpace=musicAvailable&&!bubbleOnly&&settings.music_enabled&&settings.music_spectrum&&settings.character!=='none';
 $: musicReady=proactive&&!bubbleOnly&&settings.overlay_enabled&&locked&&['mai','roxy'].includes(settings.character)&&musicIdle(sample,work,clock);
 $: musicParticles=settings.status_accessories!==false&&settings.animations&&!settings.do_not_disturb&&!$reducedMotion&&((work.animated&&['processing','reasoning','responding','tool'].includes(work.key))||(!!scene&&work.key==='completed'));
 $: musicOptions={enabled:!!(musicAvailable&&musicReady&&settings.music_enabled&&settings.music_motion&&settings.animations&&!$reducedMotion&&!settings.do_not_disturb&&!dialogue&&!scene&&!displayMood&&!dragging&&!gripActive&&!faded),strength:settings.music_strength,character:settings.character,debug:offlineTest};
 $: tasks=bubbleOnly?[]:(sample.sessions||[]).filter(row=>row.log_id!==sample.log_id);
 $: multitask=tasks.length>0;
 $: collapsed=!multitask&&!bubbleOnly&&avatar&&shouldCollapse(settings,work,{docked:!!dockSide,locked,gripActive,dragging,talking:!!dialogue||!!scene,elapsed:clock-idleSince});
 $: showBubble=multitask||bubbleOnly||!collapsed&&(bubbleVisible(settings,work,card)||!locked||!!dialogue||!!scene);
</script>
<svelte:window onblur={()=>press.cancel()} onmouseup={event=>{if(!event.target?.closest?.('.mini-grip'))press.cancel();}}/>
<div class="mini pet-monitor" class:music-space={musicSpace} data-idle-mood={displayMood} data-idle-ready={idleReady} data-idle-debug={idleDebug} data-music-talk={!!dialogue&&!!conversation?.music} class:multitask class:combined={multitask&&settings.task_display==='combined'} class:bubble-only={bubbleOnly} class:avatar-layout={avatar} class:editing={!locked} class:faded class:grip-active={gripActive} class:dragging class:chatting={!!dialogue||!!scene} class:celebrating={!!scene&&settings.animations} class:docked-right={avatar&&avatarRight} class:collapsed data-tone={work.tone} data-animations={settings.animations} data-pulse-log-id={sample.log_id||''} data-pulse-output={sample.output_tokens??''} data-pulse-sequence={sample.poll_sequence} data-pulse-activity={work.key} data-pulse-card={!!card} style={themeStyle(settings.theme)}>
 <button class="mini-grip" onmousedown={down} onmousemove={move} onclick={click} oncontextmenu={event=>{event.preventDefault();press.cancel();onmenu();}} aria-label={bubbleOnly?'拖动任务气泡':'拖动悬浮条'} title={bubbleOnly?'按住拖动此任务气泡':'点击头像聊一句 · 按住拖动位置'}>
  {#if bubbleOnly}<span class="bubble-handle" aria-hidden="true">⠿</span>{:else if avatar}<PetFace {musicOptions} {settings} {work} {custom} {stateAvatars} talking={!!dialogue} idleMood={displayMood} idleSequence={displaySequence} {interactionSequence} celebrating={!!scene}/>{:else if settings.character!=='none'}<MaiAvatar {musicOptions} status={dialogue?'responding':work.key} character={settings.character} {custom} {settings} {stateAvatars} animations={settings.animations} working={work.animated} idleMood={displayMood} idleSequence={displaySequence} {interactionSequence} talking={!!dialogue} celebrating={!!scene}/><StatusAccessory {settings} {work} celebrating={!!scene}/>{:else}⠿{/if}
 </button>
 {#if musicSpace}<MusicSpectrum style={settings.music_style} visual={settings.music_visual} {avatar} particles={musicParticles}/>{/if}
 <div class="pet-bubbles" class:concealed={!showBubble} use:anchorBubbles={avatar&&!bubbleOnly}>
 <div class="pet-bubble" class:concealed={!showBubble}>
   {#if offlineTest}<small class="fixture-label">模拟日志 · 隔离测试</small>{/if}
  {#if dialogue||scene}<div class="pet-dialogue" aria-label={dialogue?'头像对话':'完成小剧场'}><span class="dialogue-kind">{characterName(settings.character)}</span><p aria-live="polite" aria-atomic="true" aria-label={dialogue?.text||scene}>{sample.source==='demo'?'演示 · ':''}{dialogue?shown:scene}<span class:typing class="typing-cursor" aria-hidden="true"></span></p></div>{/if}
  <TaskMetrics {sample} {settings} {work} {speed} {pulses} {locked} {ondrag} {error} showPulses={!avatar||bubbleOnly||multitask}/>
 </div>
 {#each tasks as row (row.log_id)}
  <div class="pet-bubble companion-bubble">
   <TaskMetrics sample={row} {settings} work={statusDisplay(row,clock)} speed={rateDisplay(row,clock)} pulses={pulseCells(row,clock)} {locked} {ondrag} showPulses/>
  </div>
 {/each}
 </div>
 {#if !locked}<div class="mini-edit-actions" role="group" aria-label="编辑操作"><button class="mini-lock" onclick={()=>onlock(false)}>完成</button><button class="mini-cancel" onclick={()=>onlock(true)}>取消</button></div>{/if}
 {#if error}<span class="pet-error" role="alert">{error}</span>{/if}
</div>

<style>
 .fixture-label{display:block;font-size:10px;line-height:1.3;opacity:.8;pointer-events:none}
</style>
