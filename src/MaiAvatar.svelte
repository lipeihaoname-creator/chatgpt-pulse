<script>
 import {onDestroy,onMount} from 'svelte';
 import {currentAudio} from './lib/music.js';
 import {musicSurfaceVisible} from './lib/music-animation.js';
 import {neutralPose,portraitGesture,musicMotion} from './lib/portrait-motion.js';
 import {portraitRegistration} from './lib/portrait-registration.js';
 import {moodExpression,moodEmotion,emotionColumn,emotionNames} from './lib/idle-companion.js';
 import open from './assets/mai/open.png';
 import half from './assets/mai/half.png';
 import blink from './assets/mai/blink.png';
 import roxyOpen from './assets/roxy/open.png';
 import roxyHalf from './assets/roxy/half.png';
 import roxyBlink from './assets/roxy/blink.png';
 import maiEmotions from './assets/mai/emotions-v1.png';
 import roxyEmotions from './assets/roxy/emotions-v1.png';
 import {expressionFor,expressionNames,characters,characterName} from './lib/appearance.js';
 import {portraitAsset,cropStyle} from './lib/personalization.js';
 import {reducedMotion} from './lib/reduced-motion.js';
 export let status='paused', character='mai', custom=null, animations=true, working=false,talking=false,celebrating=false,idleMood='',idleSequence=0,interactionSequence=0;
 export let settings={},stateAvatars={},musicOptions={};
 let shown=null,desiredPortrait=null,portraitTimers=[],settleTimer,shownAt=0,swapEye='',swapPhase='',swapDim=false,swapping=false,portraitRequest=0,destroyed=false;
 const paintCache=new Map();
 let portrait,pose,motionStopQueued=false,gesture=null,lastGesture='',lastNode=null;
 const emotionAtlases={mai:maiEmotions,roxy:roxyEmotions};
 let readyCharacter='',preloadEpoch=0,preloadCharacter;
 async function prepareEmotion(character){
  const epoch=++preloadEpoch;readyCharacter='';if(!emotionAtlases[character])return;
  const img=new Image();img.src=emotionAtlases[character];
  try{await img.decode();if(epoch===preloadEpoch)readyCharacter=character;}catch{/* Original work portraits remain available if an optional atlas fails. */}
 }
 $: if(preloadCharacter!==character){preloadCharacter=character;prepareEmotion(character);}
 const atlases={mai:{open,half,blink},roxy:{open:roxyOpen,half:roxyHalf,blink:roxyBlink}};
 $: atlas=atlases[character];
 $: asset=portraitAsset(settings,custom,stateAvatars,status,character);
 $: cell=asset.image||!animations||$reducedMotion?expressionFor(status):(moodExpression(idleMood)??expressionFor(status));
 $: emotion=!asset.image&&readyCharacter===character?moodEmotion(idleMood):null;
 $: portraitKey=asset.image?'image:'+asset.slot+':'+asset.image+':'+cropStyle(asset.crop):character+':'+(emotion||cell);
 $: nextPortrait={key:portraitKey,character,cell,emotion,atlas,image:asset.image,crop:cropStyle(asset.crop),slot:asset.slot,position:`${cell%3*50}% ${Math.floor(cell/3)*50}%`,glyph:status==='completed'?'✓':['waiting_user','waiting_approval'].includes(status)?'!':'✦'};
 function paintStyle(value,eye,neutral=false){
  const emotion=neutral?null:value.emotion,cell=neutral?0:value.cell;
  const url=emotion?emotionAtlases[value.character]:value.atlas[eye];
  const position=emotion?`${emotionColumn(emotion)*100/3}% ${({open:0,half:50,blink:100})[eye]}%`:`${cell%3*50}% ${Math.floor(cell/3)*50}%`;
  return `background-image:url('${url}');background-size:${emotion?400:300}% 300%;background-position:${position};${portraitRegistration(value.character,cell,emotion,eye)}`;
 }
 $: requestPortrait(nextPortrait,animations&&!$reducedMotion);
 function cancelPortrait(){clearTimeout(settleTimer);settleTimer=null;portraitTimers.forEach(clearTimeout);portraitTimers=[];swapping=false;swapEye='';swapPhase='';swapDim=false;}
 function decode(url){
  if(!paintCache.has(url)){const image=new Image();image.src=url;paintCache.set(url,image.decode().then(()=>true).catch(()=>{paintCache.delete(url);return false;}));if(paintCache.size>16)paintCache.delete(paintCache.keys().next().value);}
  return paintCache.get(url);
 }
 async function requestPortrait(next,enabled){
  const request=++portraitRequest;
  if(!enabled)cancelPortrait();
  // Decode before replacing the currently visible paint. A slow first load or
  // an old character's completed request cannot blank/restore the wrong face.
  const urls=next.image?[next.image]:next.emotion?[emotionAtlases[next.character]]:next.atlas?Object.values(next.atlas):[];
  const decoded=await Promise.all(urls.map(decode));
  if(destroyed||request!==portraitRequest)return;
  if(decoded.some(ready=>!ready))return;
  desiredPortrait=next;
  if(!shown||!enabled||!musicSurfaceVisible(currentAudio(),document.visibilityState!=='hidden')){cancelPortrait();shown=next;shownAt=performance.now();return;}
  schedulePortrait();
 }
 function schedulePortrait(){
  clearTimeout(settleTimer);settleTimer=null;
  if(swapping||!desiredPortrait||desiredPortrait.key===shown?.key)return;
  // Coalesce bursts without delaying the actual work metrics. A newly opened
  // face stays visible briefly instead of starting another blink immediately.
  settleTimer=setTimeout(()=>{settleTimer=null;beginPortrait();},Math.max(55,350-(performance.now()-shownAt)));
 }
 function beginPortrait(){
  if(!desiredPortrait||desiredPortrait.key===shown?.key)return;
  swapping=true;swapPhase='closing';swapDim=!!shown?.image||!!desiredPortrait.image||!shown?.atlas||!desiredPortrait.atlas||shown.character!==desiredPortrait.character;
  swapEye=portrait&&Number(getComputedStyle(portrait.querySelector('.blink')||portrait).opacity)>.5?'closed':'half';
  const later=(delay,fn)=>portraitTimers.push(setTimeout(fn,delay));
  later(60,()=>swapEye='closed');
  later(140,()=>{shown=desiredPortrait;shownAt=performance.now();swapPhase='opening';});
  // The facial patch returns through the neutral closed-eye portrait. Hair,
  // jaw, neck and clothing never switch with an expression. Reopen only once
  // the new features are fully opaque, avoiding two displaced open eyes.
  later(275,()=>swapEye='half');
  later(335,()=>{swapEye='';});
  later(380,()=>{swapping=false;swapPhase='';swapDim=false;portraitTimers=[];schedulePortrait();});
 }
 onMount(()=>{const visibility=()=>{if(!musicSurfaceVisible(currentAudio(),document.visibilityState!=='hidden')){cancelPortrait();if(desiredPortrait){shown=desiredPortrait;shownAt=performance.now();}}};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);});
 function move(node,kind,enabled,character,sequence){
  const next=enabled?character+':'+kind+':'+sequence:'';
  if(!node||next===lastGesture&&node===lastNode)return;
  lastGesture=next;lastNode=node;
  const from=getComputedStyle(node).transform;
  const interrupted=gesture&&gesture.playState==='running';
  gesture?.cancel();gesture=null;
  if(!enabled)return;
  const action=portraitGesture(kind,character);
  if(action||interrupted)gesture=node.animate([
   {offset:0,transform:from==='none'?neutralPose:from},
   ...(action?.frames||[]),{offset:1,transform:neutralPose}
  ].map(frame=>({...frame,easing:'cubic-bezier(.45,0,.55,1)'})),{duration:action?.duration||420});
 }
 $: move(pose,idleMood||(celebrating?'celebrate':talking?'greet':''),animations&&!$reducedMotion&&!!characters[character],character,`${idleSequence}:${interactionSequence}`);
 onDestroy(()=>{destroyed=true;portraitRequest++;preloadEpoch++;gesture?.cancel();cancelPortrait();});
 function stopExpressionMotion(){
  if(motionStopQueued)return;
  motionStopQueued=true;
  queueMicrotask(()=>{
   motionStopQueued=false;
   if((!animations||$reducedMotion)&&portrait){
    for(const animation of portrait.getAnimations({subtree:true})){
     // Transition start fires before its deferred animation is installed.
     // Check after that microtask; finish finite transitions only.
     if(['running','paused'].includes(animation.playState)&&Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
    }
   }
  });
 }
 $: if((!animations||$reducedMotion)&&portrait)stopExpressionMotion();
</script>
<div bind:this={portrait} class="character-portrait" data-idle-motion={animations&&!$reducedMotion?idleMood:''} class:animated={animations&&!$reducedMotion&&!!characters[character]} class:working={animations&&working} class:talking={animations&&talking} data-swap-eye={swapEye} data-swap-phase={swapPhase} data-expression={cell} data-emotion={emotion||''} data-character={character} role="img" aria-label={characters[character]?`${characterName(character)} · ${emotionNames[emotion]||expressionNames[cell]}`:character==='custom'?'自定义头像':'工作状态图标'}>
 <div class="crop"><div class="breath"><div class="music-pose" use:musicMotion={musicOptions}><div class="pose" bind:this={pose}>
  {#if shown}<div class="expression-frame" class:swap-dim={swapDim&&swapPhase==='closing'} data-rendered-expression={shown.emotion||shown.cell} data-frame-character={shown.character} class:custom-frame={!!shown.image}>
   <div class="frame-crop">
   {#if shown.image}<img src={shown.image} alt={shown.slot==='custom'?'自定义头像':'自定义状态头像'} draggable="false" style={shown.crop}/>
   {:else if shown.atlas}
    {#each ['open','half','blink'] as eye (eye)}<span class={`base-atlas ${eye}`} style={paintStyle(shown,eye,true)}></span>{/each}
    <div class="facial-features eyes-features" class:withdrawing={swapPhase==='closing'}><div class="eyes-window">
     {#each ['open','half','blink'] as eye (eye)}<span class={`atlas ${eye}`} class:emotion-atlas={!!shown.emotion} style={paintStyle(shown,eye)}></span>{/each}
    </div></div>
    <div class="facial-features mouth-features" class:withdrawing={swapPhase==='closing'}>
     <span class="feature-mouth" style={paintStyle(shown,'open')}></span>
    </div>
   {:else}<span class="plain-avatar">{shown.glyph}</span>{/if}
   </div>
  </div>{/if}
 </div></div></div></div>
</div>
<style>
 .character-portrait{width:100%;height:100%;position:relative;overflow:hidden;border-radius:50%;background:color-mix(in srgb,var(--pet-accent) 12%,var(--pet-bg));isolation:isolate}
 .expression-frame[data-frame-character=roxy]{--portrait-scale:1.18;--portrait-focus:56%}
 .crop,.frame-crop,.breath,.music-pose,.expression-frame,.pose,.atlas,.base-atlas,.facial-features,.eyes-window,.feature-mouth{position:absolute;inset:0}
 /* Overscan is shared across every expression. Registration used to shrink
    the entire sprite, pulling its straight bottom edge inside the circle. */
 .frame-crop{transform:scale(var(--portrait-scale,1.12));transform-origin:50% var(--portrait-focus,65%)}
 .custom-frame .frame-crop{transform:none}
 .facial-features{opacity:1;transition:opacity 110ms ease-in-out}
 .eyes-features{mask-image:radial-gradient(ellipse 42% 24% at 50% 52%,#000 85%,transparent 100%)}
 .eyes-window{mask-image:linear-gradient(to bottom,#000 62%,transparent 66%)}
 .mouth-features{mask-image:radial-gradient(ellipse 22% 7.5% at 49% 68%,#000 72%,transparent 100%)}
 .facial-features.withdrawing{opacity:0}
 .pose{isolation:isolate}
 .expression-frame{opacity:1;transition:opacity 100ms ease-in-out}.expression-frame.swap-dim{opacity:.3}
 .character-portrait[data-swap-eye=half] .half,.character-portrait[data-swap-eye=closed] .blink{animation:none!important;opacity:1}
 .character-portrait[data-swap-eye=half] .blink,.character-portrait[data-swap-eye=closed] .half{animation:none!important;opacity:0}
 .pose,.breath,.music-pose{transform-origin:50% 75%;will-change:transform}
 .atlas,.base-atlas,.feature-mouth{background-size:300% 300%;background-repeat:no-repeat;transform-origin:50% 50%}.emotion-atlas{background-size:400% 300%}.half,.blink{clip-path:inset(39% 12% 33% 12% round 20%);mask-image:linear-gradient(to bottom,transparent 39%,#000 43% 62%,transparent 67%);opacity:0;transition:opacity 45ms linear}
 .animated .half{animation:half-blink 6.6s ease-in-out infinite}
 .animated .blink{animation:blink 6.6s ease-in-out infinite}
 .animated .breath{animation:breathe 6.8s cubic-bezier(.45,0,.55,1) infinite}
 img{width:100%;height:100%;object-fit:cover}.plain-avatar{display:grid;place-items:center;height:100%;font-size:32px;color:var(--pet-accent)}
 @keyframes half-blink{0%,94%,98%,100%{opacity:0}94.5%,95%,97%,97.5%{opacity:1}95.5%,96.5%{opacity:0}}
 @keyframes blink{0%,95%,97%,100%{opacity:0}95.5%,96.5%{opacity:1}}
 @keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-.35px)}}
 @media(prefers-reduced-motion:reduce){.expression-frame,.facial-features,.half,.blink{transition:none!important}.animated .pose,.animated .breath,.animated .atlas,.animated .base-atlas{animation:none!important;will-change:auto}.half,.blink{display:none}}
</style>
