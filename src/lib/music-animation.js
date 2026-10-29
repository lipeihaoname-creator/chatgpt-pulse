// Pure animation state. Targets always come from real audio features; no
// generated bar motion, waveform history, audio samples, timers or DOM here.
const clamp=(v,lo=0,hi=1)=>Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):lo;
const follow=(value,target,dt,tau)=>target+(value-target)*Math.exp(-dt/tau);
const recent=(frame,now,age=260)=>frame?.supported&&['active','silent'].includes(frame.status)&&Number.isFinite(frame.at)&&now-frame.at>=-1000&&now-frame.at<age;
const audible=(frame,now)=>recent(frame,now)&&frame.active&&frame.status==='active';
export const musicPoseEligible=(frame,options={},now=Date.now())=>!!(options.enabled&&clamp(options.strength??.5)>0&&audible(frame,now)&&frame.stable_seconds>=2);
// WKWebView may call an unfocused, visible Mac overlay "hidden". Native
// visibility accompanies audio frames; browser previews still honor the DOM.
export const musicSurfaceVisible=(frame,documentVisible)=>typeof frame?.view_visible==='boolean'?frame.view_visible:documentVisible;
// Use the old angular rhythm with a small spacing correction at shallow ends.
// Cache the shared layout for bars/peak tips; steady frames do no arc sampling.
let arcCache;
function arcAngles(count,rx,ry){
 if(arcCache?.count===count&&arcCache.rx===rx&&arcCache.ry===ry)return arcCache.angles;
 const steps=192,lengths=[0];let x=-rx,y=0,total=0;
 for(let i=1;i<=steps;i++){const angle=Math.PI*(1-i/steps),nx=rx*Math.cos(angle),ny=ry*Math.sin(angle);total+=Math.hypot(nx-x,ny-y);lengths.push(total);x=nx;y=ny;}
 let cursor=1;
 const angles=Array.from({length:count},(_,i)=>{
  const distance=total*(count>1?i/(count-1):.5);
  while(cursor<steps&&lengths[cursor]<distance)cursor++;
  const fraction=(distance-lengths[cursor-1])/(lengths[cursor]-lengths[cursor-1]);
  const uniform=Math.PI*(1-(count>1?i/(count-1):.5));
  const even=Math.PI*(1-(cursor-1+fraction)/steps);
  return uniform+(even-uniform)*.38;
 });
 arcCache={count,rx,ry,angles};return angles;
}
export function spectrumWidth(style,index,count,clearance=0){
 const mix=typeof style==='number'?clamp(style):['arc','dots'].includes(style)?1:0;
 const edge=count>1?Math.abs(2*index/(count-1)-1):0;
 return 2.6-1.3*mix*clamp(clearance)*edge*edge;
}
export function spectrumLines(style,bars,{avatar=false,clearance=0}={}){
 const mix=typeof style==='number'?clamp(style):['arc','dots'].includes(style)?1:0;
 const gap=clamp(clearance),rx=avatar?46-2*gap:44,ry=avatar?46-38*gap:14;
 const angles=arcAngles(bars.length,rx,ry);
 return bars.map((value,i)=>{
  // Expand real changes perceptually: small levels retract, strong bands extend.
  const v=Math.pow(clamp(value),1.6),fraction=bars.length>1?i/(bars.length-1):.5;
  const angle=angles[i],c=Math.cos(angle),s=Math.sin(angle);
  // Avatar center is fixed at (56,56), with a 44px portrait radius. At rest
  // the arc starts 2px outside it. Work particles retain their entire field;
  // only the spectrum moves down into the compact lane beneath those paths.
  const bar=avatar?{x1:4+fraction*104,y1:118+16*gap,x2:4+fraction*104,y2:117+16*gap-v*(16-4*gap)}:{x1:4+fraction*104,y1:29,x2:4+fraction*104,y2:28-v*23};
  const arc=avatar?{
   x1:56+rx*c,y1:56+62*gap+ry*s,
   x2:56+(47+v*7-(2+2*v)*gap)*c,y2:56+62*gap+(47+v*16-(38+9*v)*gap)*s
  }:{x1:56+rx*c,y1:5+ry*s,x2:56+(45+v*10)*c,y2:5+(15+v*10)*s};
  return Object.fromEntries(Object.keys(bar).map(key=>[key,bar[key]+(arc[key]-bar[key])*mix]));
 });
}

// Audio packets are ~25Hz. Visual frames interpolate the already-smoothed DSP
// targets, with fast attack and a softer release instead of jumping at IPC rate.
export class SpectrumAnimation {
 constructor(style='bars') { this.style=['arc','dots'].includes(style)?1:0;this.levels=Array(24).fill(0);this.peaks=Array(24).fill(0);this.holds=Array(24).fill(0);this.opacity=0;this.clearance=0; }
 reset(style='bars'){this.style=['arc','dots'].includes(style)?1:0;this.levels.fill(0);this.peaks.fill(0);this.holds.fill(0);this.opacity=0;this.clearance=0;}
 step(frame,seconds,now,style='bars',reduced=false,particles=false,response=1){
  const dt=clamp(seconds,0,.1),valid=recent(frame,now),active=audible(frame,now);
  const targetStyle=['arc','dots'].includes(style)?1:0,targetClearance=particles?1:0;
  this.clearance=reduced?targetClearance:follow(this.clearance,targetClearance,dt,.12);
  if(Math.abs(this.clearance-targetClearance)<.0001)this.clearance=targetClearance;
  this.style=reduced?targetStyle:follow(this.style,targetStyle,dt,.075);
  if(Math.abs(this.style-targetStyle)<.0001)this.style=targetStyle;
  this.opacity=reduced?(active?.95:0):follow(this.opacity,active?.95:0,dt,active?.11:.29);
  if(this.opacity<.002)this.opacity=0;
  for(let i=0;i<24;i++){
   const target=valid?clamp(frame.bars?.[i]):0;
   let value=reduced?target:follow(this.levels[i],target,dt,target>this.levels[i]?.020:.060*clamp(response,.5,2));
   if(value<.0005)value=0;this.levels[i]=value;
   if(reduced){this.peaks[i]=value;this.holds[i]=0;}
   else if(value>=this.peaks[i]){this.peaks[i]=value;this.holds[i]=.14;}
   else{this.holds[i]=Math.max(0,this.holds[i]-dt);if(!this.holds[i])this.peaks[i]=Math.max(value,this.peaks[i]-dt*.85);}
  }
  this.settling=this.opacity>0||this.levels.some(v=>v>0)||this.peaks.some(v=>v>0)||this.style!==targetStyle||this.clearance!==targetClearance;
  return this;
 }
}

// Twelve registered motion keys per cycle, with closed Catmull-Rom curves.
// The sprite remains fixed; only its existing internal pose layer moves.
const musicCurves=Array.from({length:3},(_,kind)=>Array.from({length:12},(_,i)=>{
 const p=i*Math.PI*2/12,s=Math.sin(p),s2=Math.sin(2*p);
 return kind===0?[s*3,s*.55,s2*.4]:kind===1?[s*2+Math.sin(3*p)*.25,s*.38,-(.5-.5*Math.cos(2*p))*.65]:[s*2.5+s2*.3,s*.45,s2*.3];
}));
function musicKey(kind,phase){
 const t=((phase/(2*Math.PI))%1+1)%1*12,i=Math.floor(t),f=t-i,keys=musicCurves[kind];
 return [0,1,2].map(axis=>{const a=keys[(i+11)%12][axis],b=keys[i][axis],c=keys[(i+1)%12][axis],d=keys[(i+2)%12][axis];return .5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);});
}
// A continuous, bounded pose with audio-driven amplitude. Beat events influence
// a smooth nod envelope, never restart a keyframe animation. The local phase
// starts only while eligible, so entering music doesn't jump to wall-clock pose.
export class MusicPoseAnimation {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.x=this.y=this.angle=this.level=this.nod=this.impulse=this.phase=this.blend=0;this.beat=null;this.epoch=null;this.lastBeatAt=null;this.period=.82;this.pattern=0;this.accepted=0;this.allowed=false;}
 step(frame,options,seconds,now){
  const dt=clamp(seconds,0,.05),allowed=musicPoseEligible(frame,options,now);
  const epoch=frame?.epoch??0;
  // Ignore old beats on activation, reconnect, waking or higher-priority work.
  const restarted=this.epoch!==epoch||(Number.isFinite(frame?.beat)&&this.beat!==null&&frame.beat<this.beat);
  if(!allowed||!this.allowed||restarted){this.beat=frame?.beat??null;this.epoch=epoch;this.lastBeatAt=null;this.impulse=0;}
  if(allowed&&this.allowed&&Number.isFinite(frame.beat)&&frame.beat!==this.beat){
   this.beat=frame.beat;
   const interval=this.lastBeatAt===null?null:(frame.at-this.lastBeatAt)/1000;this.lastBeatAt=frame.at;
   if(interval!==null&&interval>=.32&&interval<=1.5)this.period=follow(this.period,interval,.25,.85);
   if(clamp(this.random())<.72){
    this.impulse=Math.max(this.impulse,clamp(frame.beat_strength));this.accepted++;
    if(this.accepted%8===0)this.pattern=Math.floor(clamp(this.random(),0,.999999)*3);
   }
  }
  this.allowed=allowed;
  const energy=allowed?clamp(Math.max(.22,Math.sqrt(clamp(frame.rms))*3.2)):0;
  this.level=follow(this.level,energy,dt,allowed?.24:.07);
  this.impulse=follow(this.impulse,0,dt,.28);
  this.nod=follow(this.nod,allowed?this.impulse:0,dt,allowed?.085:.065);
  this.blend=follow(this.blend,this.pattern,dt,1.8);
  if(allowed)this.phase+=dt*Math.PI*2/(this.period*4);
  const strength=clamp(options.strength??.5)*(options.character==='roxy'?1:.72);
  const amplitude=this.level*strength;
  const lo=Math.floor(this.blend),hi=Math.min(2,lo+1),mix=this.blend-lo;
  const a=musicKey(lo,this.phase),b=musicKey(hi,this.phase),key=a.map((v,i)=>v+(b[i]-v)*mix);
  const targetAngle=allowed?clamp(key[0],-3.15,3.15)*amplitude:0;
  const targetX=allowed?clamp(key[1],-.55,.55)*amplitude:0;
  const targetY=allowed?clamp(key[2]-this.nod*1.4,-1.5,1)*amplitude:0;
  const tau=allowed?.15:.065;
  this.angle=follow(this.angle,targetAngle,dt,tau);this.x=follow(this.x,targetX,dt,tau);this.y=follow(this.y,targetY,dt,tau);
  if(!allowed&&Math.abs(this.angle)+Math.abs(this.x)+Math.abs(this.y)<.002){this.x=this.y=this.angle=this.level=this.nod=0;}
  this.settling=allowed||this.x!==0||this.y!==0||this.angle!==0;
  return this;
 }
}
