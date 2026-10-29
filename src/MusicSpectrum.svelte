<script>
 import {systemAudio,currentAudio,spectrumLines} from './lib/music.js';
 import {SpectrumAnimation,musicSurfaceVisible} from './lib/music-animation.js';
 import {reducedMotion} from './lib/reduced-motion.js';
 import {spectrumShape,spectrumColor} from './lib/spectrum-design.js';
 import {cleanVisual} from './lib/music-settings.js';
 export let style='bars',avatar=false,particles=false,visual={};
 const gradientId='spectrum-'+Math.random().toString(36).slice(2);
 const resting=spectrumLines('bars',Array(24).fill(0));
 function renderSpectrum(node,options){
  let config=options,raf=0,timer=0,last=0,disposed=false;
  const model=new SpectrumAnimation(config.style);
  const bars=[...node.querySelectorAll('[data-band]')],peaks=[...node.querySelectorAll('[data-peak]')],dots=[...node.querySelectorAll('[data-dot]')],stops=[...node.querySelectorAll('stop')],curve=node.querySelector('[data-curve]'),area=node.querySelector('[data-area]');
  const values=new WeakMap();
  function set(element,key,value){
   const text=typeof value==='number'?value.toFixed(3):String(value);
   let cache=values.get(element);if(!cache){cache={};values.set(element,cache);}
   if(cache[key]!==text){element.setAttribute(key,text);cache[key]=text;}
  }
  function paint(){
   const design=spectrumShape(config.style,model.levels,model.peaks,{...config,mix:model.style,clearance:model.clearance});
   const v=design.visual;
   for(let i=0;i<24;i++){
    const line=design.strokes[i];
    for(const element of [bars[i],peaks[i],dots[i]])set(element,'visibility',line?'visible':'hidden');
    if(!line)continue;
    for(const key of ['x1','y1','x2','y2'])set(bars[i],key,line[key]);
    set(bars[i],'stroke-width',line.width);set(bars[i],'stroke',line.color);set(bars[i],'stroke-linecap',v.rounded?'round':'butt');set(bars[i],'stroke-dasharray',config.style==='led'?'1 2.2':'none');
    set(peaks[i],'r',line.width*.365);set(peaks[i],'cx',line.tip.x2);set(peaks[i],'cy',line.tip.y2);set(peaks[i],'fill',line.color);
    set(peaks[i],'opacity',!config.reduced&&line.peak?.8:0);
    set(dots[i],'cx',line.x2);set(dots[i],'cy',line.y2);set(dots[i],'r',line.radius);set(dots[i],'fill',line.color);
   }
   for(let i=0;i<stops.length;i++)set(stops[i],'stop-color',spectrumColor(v,i,stops.length));
   set(curve,'d',design.path);set(curve,'stroke',`url(#${gradientId})`);set(curve,'stroke-width',Math.min(3,v.width));set(area,'d',design.area);set(area,'fill',`url(#${gradientId})`);set(area,'fill-opacity',v.fill);
   const opacity=(model.opacity*v.opacity).toFixed(3);if(node.style.opacity!==opacity)node.style.opacity=opacity;
   node.classList.toggle('audible',model.opacity>.025);
   set(node,'data-audio-state',currentAudio().status);set(node,'data-music-style',config.style);
  }
  function cancel(){cancelAnimationFrame(raf);clearTimeout(timer);raf=timer=0;}
  const visible=()=>musicSurfaceVisible(currentAudio(),document.visibilityState!=='hidden');
  function schedule(){if(config.reduced||document.visibilityState==='hidden')timer=setTimeout(()=>tick(performance.now()),config.reduced?200:16);else raf=requestAnimationFrame(tick);}
  function tick(now){
   raf=timer=0;if(disposed||!visible())return;
   const elapsed=last?now-last:16.667;
   if(!config.reduced&&elapsed<15){schedule();return;}
   last=now;model.step(currentAudio(),Math.min(.1,elapsed/1000),Date.now(),config.style,config.reduced,config.particles,cleanVisual(config.visual).response);paint();
   if(model.settling)schedule();else last=0;
  }
  const wake=()=>{
   if(disposed)return;
   if(!visible()){cancel();last=0;model.reset(config.style);paint();return;}
   if(raf||timer)return;
   const input=currentAudio();
   if(input.active||input.bars.some(v=>v>.001)||model.settling)schedule();
  };
  const off=systemAudio.subscribe(wake);
  const visibility=()=>{cancel();last=0;if(!visible()){model.reset(config.style);paint();}else wake();};
  document.addEventListener('visibilitychange',visibility);paint();wake();
  return {update(next){const changed=next.reduced!==config.reduced;config=next;if(changed)cancel();model.settling=true;wake();},destroy(){disposed=true;cancel();off();document.removeEventListener('visibilitychange',visibility);}};
 }
</script>
<svg class="music-spectrum" use:renderSpectrum={{style,avatar,particles,visual,reduced:$reducedMotion}} viewBox={avatar?"0 0 112 136":"0 0 112 36"} data-music-style={style} data-mode={style} aria-hidden="true" focusable="false">
 <defs><linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">{#each [0,25,50,75,100] as offset}<stop offset={offset+'%'} stop-color="currentColor"/>{/each}</linearGradient></defs>
 <g class="frequency-bars">{#each resting as line,i}<line {...line} stroke="currentColor" stroke-width="2.6" data-band={i}/>{/each}</g>
 <g class="frequency-peaks">{#each resting as line,i}<circle cx={line.x2} cy={line.y2} r=".95" opacity="0" data-peak={i}/>{/each}</g>
 <g class="frequency-dots">{#each resting as line,i}<circle cx={line.x2} cy={line.y2} r="1.4" data-dot={i}/>{/each}</g>
 <g class="frequency-curve"><path data-area/><path data-curve fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>
<style>
 .music-spectrum{position:absolute;left:6px;top:56px;width:96px;height:24px;color:color-mix(in srgb,var(--pet-accent) 85%,var(--pet-bg));pointer-events:none;opacity:0;overflow:hidden;contain:layout paint;isolation:isolate}
 g{pointer-events:none;transition:opacity .18s ease}.frequency-dots,.frequency-curve{opacity:0}
 [data-mode=dots] .frequency-dots,[data-mode=curve] .frequency-curve{opacity:1}
 [data-mode=dots] .frequency-bars,[data-mode=dots] .frequency-peaks,[data-mode=curve] .frequency-bars,[data-mode=curve] .frequency-peaks{opacity:0}
 :global(.avatar-layout) .music-spectrum{top:8px;left:6px;width:112px;height:136px}
 :global(.avatar-layout.docked-right) .music-spectrum{left:auto;right:6px}
 @media(prefers-reduced-motion:reduce){.music-spectrum,g{transition:none}}
</style>
