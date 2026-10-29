// Movement is independent of the painted expression and continuous breathing.
// Every gesture ends at neutral; an interruption starts at the current matrix.
import {systemAudio,currentAudio} from './music.js';
import {MusicPoseAnimation,musicSurfaceVisible,musicPoseEligible} from './music-animation.js';
export const neutralPose='translate(0px, 0px) rotate(0deg) scale(1)';

// A lower-priority additive layer, below the existing gesture and breath layers.
// One continuous inertial pose; beats change the target, never restart a clip.
export function musicMotion(node,options={}){
 let config=options,raf=0,timer=0,last=0,disposed=false,lastTransform='',debugAt=0;
 const pose=new MusicPoseAnimation();
 function debug(){
  if(!config.debug)return;const a=currentAudio(),now=Date.now();
  if(now-debugAt<300)return;debugAt=now;
  node.dataset.musicDebug=JSON.stringify({enabled:!!config.enabled,status:a.status,stable:a.stable_seconds,age:now-a.at,visible:document.visibilityState,pose:[pose.x,pose.y,pose.angle]});
 }
 function paint(){
  debug();
  const transform=pose.settling?`translate(${pose.x.toFixed(3)}px, ${pose.y.toFixed(3)}px) rotate(${pose.angle.toFixed(3)}deg)`:'none';
  if(transform!==lastTransform){node.style.transform=transform;lastTransform=transform;}
  const moving=pose.allowed?'true':'false';if(node.dataset.musicMoving!==moving)node.dataset.musicMoving=moving;
 }
 const visible=()=>musicSurfaceVisible(currentAudio(),document.visibilityState!=='hidden');
 function cancel(){cancelAnimationFrame(raf);clearTimeout(timer);raf=timer=0;}
 function schedule(){if(document.visibilityState==='hidden')timer=setTimeout(()=>frame(performance.now()),16);else raf=requestAnimationFrame(frame);}
 function frame(now){
  raf=timer=0;if(disposed)return;
  if(!visible()){pose.reset();paint();last=0;return;}
  const elapsed=last?now-last:16.667;
  if(elapsed<15){schedule();return;}
  last=now;
  pose.step(currentAudio(),config,Math.min(.05,elapsed/1000),Date.now());paint();
  if(pose.settling)schedule();else last=0;
 }
 const wake=()=>{if(disposed)return;if(!visible()){cancel();last=0;pose.reset();paint();return;}if(!raf&&!timer&&(pose.settling||musicPoseEligible(currentAudio(),config)))schedule();};
 const off=systemAudio.subscribe(wake);
 const visibility=()=>{cancel();last=0;if(!visible()){pose.reset();paint();}else wake();};
 document.addEventListener('visibilitychange',visibility);paint();
 return {update(next){config=next||{};debug();wake();},destroy(){disposed=true;cancel();off();document.removeEventListener('visibilitychange',visibility);node.style.transform='none';}};
}
export function portraitGesture(kind,character='mai'){
 const strength=character==='roxy'?1:.85;
 // Keep apparent head size fixed. Expression registration handles framing;
 // gestures and breathing only translate/rotate, never add another zoom.
 const pose=(x,y,angle)=>`translate(${x*strength}px, ${y*strength}px) rotate(${angle*strength}deg)`;
 const points={
  smile:[[.3,0,-.6,-.5],[.65,0,-.3,.4]],
  curious:[[.3,.7,-.2,-2],[.65,.7,-.2,-2],[.82,.2,.2,-.5]],
  nod:[[.2,0,1.3,.5],[.4,0,-.4,-.2],[.62,0,1,.3],[.8,0,-.2,0]],
  sway:[[.25,-.7,0,-1.3],[.65,.7,-.2,1.2],[.85,.2,0,.4]],
  stretch:[[.35,0,-1.2,-.3],[.6,0,-1.2,.3],[.82,0,-.3,0]],
  'glance-left':[[.3,-1.3,0,-1],[.65,-1.3,-.2,-1],[.85,-.3,0,-.2]],
  'glance-right':[[.3,1.3,0,1],[.65,1.3,-.2,1],[.85,.3,0,.2]],
  shy:[[.3,.4,.6,1.8],[.65,.4,.6,1.8],[.85,.1,.2,.5]],
  relax:[[.3,0,.6,-.5],[.7,0,.6,-.5]],
  bashful:[[.25,0,.6,-.8],[.5,.3,-.2,.5],[.72,0,.4,-.3]],
  pout:[[.2,-.5,.1,-1],[.42,.5,.1,1],[.62,-.2,0,-.4],[.82,0,0,0]],
  sleepy:[[.35,0,1.1,1.1],[.68,0,1.1,1.1],[.86,0,.4,.3]],
  proud:[[.3,0,-.8,.5],[.64,0,-.8,.5],[.84,0,-.2,.1]],
  greet:[[.3,0,-.8,-.6],[.65,0,.2,.3]],
  celebrate:[[.2,0,-1,-.8],[.42,0,.2,.5],[.65,0,-.5,-.3],[.85,0,.1,.1]]
 }[kind];
 if(!points)return null;
 return {duration:kind==='greet'?720:kind==='celebrate'?1600:4800,frames:points.map(([offset,x,y,a])=>({offset,transform:pose(x,y,a)}))};
}
