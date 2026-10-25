<script>
  import {onMount,onDestroy} from 'svelte';
  import {projectWorkSample} from './lib/work-windows.js';
  const sessionId=new URLSearchParams(location.search).get('session');
  import MonitorFace from './MonitorFace.svelte';
  import {avatarLoader,stateAvatars as readStateAvatars} from './lib/avatar.js';
  import {listen} from '@tauri-apps/api/event';
  import {call,subscribe,native,listenLocal} from './lib/bridge.js';
  import {emptySample,number,statusDisplay,rateDisplay,defaults,acceptSample,acceptSettings,pulseCells,completionDisplay} from './lib/domain.js';
  let custom=null,stateAvatars={},face,avatarError='',packError='',dockSide=0,avatarRight=false,nativePointer=false,offlineTest=false;
  const packLoader=avatarLoader(value=>stateAvatars=value||{},value=>packError=value,readStateAvatars);
  const loader=avatarLoader(value=>custom=value,value=>avatarError=value);onDestroy(()=>{loader.dispose();packLoader.dispose();});
  $: if(!sessionId)loader.load(settings.avatar_revision);
  $: if(!sessionId)packLoader.load(settings.state_avatar_revision);
  let sample=emptySample(), locked=true, faded=false, gripActive=false, dragging=false, error='', clock=Date.now(), settings={...defaults};
  $: work=statusDisplay(sample,clock);
  $: speed=rateDisplay(sample,clock);
  $: pulses=pulseCells(sample,clock);
  $: card=settings.completion_card?completionDisplay(sample,clock):null;
  function receiveSettings(next){if(acceptSettings(settings,next)){settings=next;locked=next.locked;}}
  function receive(next){const projected=projectWorkSample(next,sessionId||next.overlay_log_id,!sessionId);if(acceptSample(sample,projected))sample=projected;}
  function interaction(value={}){faded=!!value.faded;gripActive=!!value.grip_active;dragging=!!value.dragging;dockSide=value.dock_side||0;avatarRight=value.avatar_right??dockSide===1;}
  onMount(()=>{
    let disposed=false;const offs=[];const ticker=setInterval(()=>clock=Date.now(),500);
    const keep=fn=>{if(disposed)fn();else offs.push(fn);};
    (async()=>{
      if(native){
        keep(await listen('pulse:settings',e=>{receiveSettings(e.payload);}));
        keep(await listenLocal('pulse:overlay',e=>interaction(e.payload)));
        keep(await listenLocal('pulse:pet-tap',e=>face?.speak({nativeId:e.payload?.id})));
      }
      keep(await subscribe(receive,receiveSettings));
      const b=await call('bootstrap_overlay');
      if(disposed)return;
      offlineTest=!!b.offline_test;
      nativePointer=native&&(b.platform??'macos')==='macos';
      receive(b.sample);receiveSettings(b.settings);interaction(b.overlay_interaction);
    })().catch(e=>error=String(e));
    const escape=e=>{if(e.key==='Escape'&&!locked)lock(true);};
    window.addEventListener('keydown',escape);
    return()=>{clearInterval(ticker);disposed=true;offs.forEach(fn=>fn());window.removeEventListener('keydown',escape);};
  });
  async function menu(){try{await call('overlay_menu');}catch(e){error=String(e);}}
  async function lock(cancel=false){try{locked=await call('overlay_edit',{editing:false,cancel});}catch(e){error=String(e);}}
  async function drag(event){
    if(event.button!==0||event.buttons!==undefined&&!(event.buttons&1))return;
    event.preventDefault();error='';
    if(!native)return;
    faded=false;
    try{await call('overlay_drag');}catch(e){error=String(e);}
  }
</script>
<MonitorFace proactive {offlineTest} bind:this={face} bubbleOnly={!!sessionId} {nativePointer} {settings} {sample} {work} {speed} {pulses} {card} {custom} {stateAvatars} {dockSide} {avatarRight} {locked} {faded} {gripActive} {dragging} error={error||packError||(settings.character==='custom'?avatarError:'')} ondrag={drag} onlock={lock} onmenu={menu}/>
