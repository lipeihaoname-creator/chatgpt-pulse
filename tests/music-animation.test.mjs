import test from 'node:test';
import assert from 'node:assert/strict';
import {SpectrumAnimation,MusicPoseAnimation,spectrumLines,musicSurfaceVisible,spectrumWidth,musicPoseEligible} from '../src/lib/music-animation.js';
const audio=(at=1000,extra={})=>({supported:true,status:'active',active:true,at,epoch:1,beat:1,beat_strength:.8,rms:.2,stable_seconds:4,bars:Array(24).fill(.75),...extra});
const options={enabled:true,strength:1,character:'roxy'};

test('spectrum interpolates data packets without inventing silent activity',()=>{
 const view=new SpectrumAnimation();
 view.step(audio(),1/60,1000);assert.ok(view.levels.every(v=>v>0&&v<.75));
 const first=view.levels[0];view.step(audio(),1/60,1017);assert.ok(view.levels[0]>first);
 for(let i=0;i<180;i++)view.step(audio(),1/60,1300+i*17);
 assert.equal(view.opacity,0);assert.ok(view.levels.every(v=>v===0));assert.ok(view.peaks.every(v=>v===0));assert.equal(view.settling,false);
 const silent=new SpectrumAnimation();for(let i=0;i<100;i++)silent.step(audio(1000,{active:false,status:'silent',bars:[]}),1/60,1000);
 assert.equal(silent.opacity,0);assert.deepEqual(silent.levels,Array(24).fill(0));
});
test('spectrum resampling is independent of display frame rate and cannot overshoot',()=>{
 const simulate=hz=>{const view=new SpectrumAnimation();for(let i=0;i<hz;i++)view.step(audio(1000+i*1000/hz),1/hz,1000+i*1000/hz);return view;};
 const sixty=simulate(60),fast=simulate(120);assert.ok(Math.abs(sixty.levels[0]-fast.levels[0])<1e-9);
 assert.ok(sixty.levels.every(v=>v>=0&&v<=.75));
 for(const style of [0,.2,.5,.8,1])for(const line of spectrumLines(style,sixty.levels))for(const [key,value]of Object.entries(line))assert.ok(value>=0&&value<=(key.startsWith('x')?112:36));
});
test('style changes morph from the current shape and reduced motion remains direct',()=>{
 const view=new SpectrumAnimation('bars');view.step(audio(),.016,1000,'arc');assert.ok(view.style>0&&view.style<1);
 const middle=view.style;view.step(audio(),.016,1000,'bars');assert.ok(view.style<middle&&view.style>0);
 view.step(audio(),.016,1000,'arc',true);assert.equal(view.style,1);assert.deepEqual(view.peaks,view.levels);
 view.reset('bars');assert.equal(view.opacity,0);assert.equal(view.style,0);
});
test('portrait starts continuously, keeps size fixed and returns without overshoot when work wins',()=>{
 const pose=new MusicPoseAnimation(()=>0);pose.step(audio(),options,1/60,1000);
 assert.ok(Math.abs(pose.angle)<.02);assert.equal(pose.nod,0,'Do not replay the last beat on activation');
 for(let i=1;i<180;i++)pose.step(audio(1000+i*17,{beat:Math.floor(i/30)+1}),options,1/60,1000+i*17);
 assert.ok(pose.allowed);assert.ok(Math.abs(pose.angle)<3.5&&Math.abs(pose.x)<.6&&Math.abs(pose.y)<1.8);
 const before={x:pose.x,y:pose.y,angle:pose.angle};
 pose.step(audio(4100),{...options,enabled:false},1/60,4100);assert.equal(pose.allowed,false);
 for(const axis of ['x','y','angle'])assert.ok(Math.abs(pose[axis])<=Math.abs(before[axis])+1e-12);
 for(let i=0;i<40;i++)pose.step(audio(4100),{...options,enabled:false},1/60,4100);
 assert.equal(pose.settling,false);assert.equal(pose.angle,0);assert.equal(pose.x,0);assert.equal(pose.y,0);
});
test('old beats after interruptions/reconnect cannot trigger a fresh nod',()=>{
 const pose=new MusicPoseAnimation(()=>0);pose.step(audio(),options,.016,1000);pose.step(audio(1040,{beat:2}),options,.016,1040);assert.ok(pose.impulse>0);
 pose.step(audio(1080,{beat:8}),{...options,enabled:false},.016,1080);
 pose.step(audio(1120,{beat:15}),options,.016,1120);assert.equal(pose.impulse,0);
 pose.step(audio(1160,{epoch:2,beat:100}),options,.016,1160);assert.equal(pose.impulse,0);
 pose.step(audio(1200,{epoch:2,beat:101}),options,.016,1200);assert.ok(pose.impulse>0);
 pose.step(audio(1240,{epoch:2,beat:0,beat_strength:1}),options,.016,1240);assert.equal(pose.impulse,0,'A restarted device beat counter is not a new beat');
});
test('character styles differ subtly and missing audio settles instead of free-running',()=>{
 const mai=new MusicPoseAnimation(()=>0),roxy=new MusicPoseAnimation(()=>0);
 for(let i=0;i<120;i++){const f=audio(1000+i*17);mai.step(f,{...options,character:'mai'},1/60,f.at);roxy.step(f,options,1/60,f.at);}
 assert.ok(Math.abs(mai.angle)<Math.abs(roxy.angle));
 for(let i=0;i<120;i++)roxy.step(audio(1000),options,1/60,4000+i*17);
 assert.equal(roxy.allowed,false);assert.equal(roxy.settling,false);
});

test('avatar half-ring hugs the portrait and work clearance uses a compact lower lane',()=>{
 const idle=spectrumLines('arc',Array(24).fill(1),{avatar:true});
 for(const line of idle){assert.ok(Math.abs(Math.hypot(line.x1-56,line.y1-56)-46)<1e-9);assert.ok(Math.abs(((line.x2-56)/54)**2+((line.y2-56)/63)**2-1)<1e-9);}
 const work=spectrumLines('arc',Array(24).fill(1),{avatar:true,clearance:1});
 assert.ok(work.every(line=>line.y1>=118&&line.y2>=118));
 for(const clearance of [0,.2,.5,.8,1])for(const style of [0,.5,1])for(const line of spectrumLines(style,Array(24).fill(1),{avatar:true,clearance}))for(const [key,value]of Object.entries(line))assert.ok(value>=0&&value<=(key.startsWith('x')?112:136));
 const model=new SpectrumAnimation('arc');model.step(audio(),.016,1000,'arc',false,true);assert.ok(model.clearance>0&&model.clearance<1);model.step(audio(),.016,1000,'arc',true,true);assert.equal(model.clearance,1);
});

test('native window visibility takes precedence over hidden unfocused WebKit documents',()=>{
 assert.equal(musicSurfaceVisible({view_visible:true},false),true);
 assert.equal(musicSurfaceVisible({view_visible:false},true),false);
 assert.equal(musicSurfaceVisible({},false),false);
 assert.equal(musicSurfaceVisible({view_visible:null},true),true);
});

test('registered music keys remain continuous around cycle boundaries and in quiet audible audio',()=>{
 const pose=new MusicPoseAnimation(()=>0);let previous=null,maxJump=0;
 for(let i=0;i<1200;i++){const f=audio(1000+i*1000/60,{rms:.0008,beat:Math.floor(i/30)});pose.step(f,options,1/60,f.at);if(previous!==null)maxJump=Math.max(maxJump,Math.abs(pose.angle-previous));previous=pose.angle;}
 assert.ok(maxJump<.09,maxJump);assert.ok(pose.level>=.21,'Audible quiet playback retains a small visible gesture');
});

test('spectrum has stronger vertical travel while the portrait rim and work clearance stay fixed',()=>{
 const center=12,bands=v=>Array(25).fill(v);
 const low=spectrumLines('arc',bands(.2),{avatar:true})[center],high=spectrumLines('arc',bands(.8),{avatar:true})[center];
 assert.equal(low.y1,102);assert.equal(high.y1,102);
 assert.ok(high.y2-low.y2>9,'At least twice the old mid-band vertical swing');
 assert.ok(spectrumLines('arc',bands(1),{avatar:true})[center].y2<=119);
 const working=spectrumLines('arc',bands(1),{avatar:true,clearance:1});
 assert.ok(working.every(line=>line.y1>=118&&line.y2<=134),'Stronger work spectrum remains below the particle field and within the window');
 assert.ok(spectrumLines('arc',bands(0),{avatar:true})[center].y2===103,'Silence has no synthetic extension');
});

test('the arc keeps a full middle and tapered ends without merging adjacent strokes',()=>{
 const distance=(point,line)=>{const x=line.x2-line.x1,y=line.y2-line.y1,t=Math.max(0,Math.min(1,((point[0]-line.x1)*x+(point[1]-line.y1)*y)/(x*x+y*y)));return Math.hypot(point[0]-line.x1-t*x,point[1]-line.y1-t*y);};
 for(const clearance of [0,.2,.5,.8,1])for(const levels of [Array(24).fill(1),Array.from({length:24},(_,i)=>i%2)]){
  const lines=spectrumLines('arc',levels,{avatar:true,clearance});
  const gaps=lines.slice(1).map((b,i)=>Math.hypot(b.x1-lines[i].x1,b.y1-lines[i].y1));
  for(let i=1;i<lines.length;i++){
   const a=lines[i-1],b=lines[i],width=(spectrumWidth('arc',i-1,24,clearance)+spectrumWidth('arc',i,24,clearance))/2;
   assert.ok(Math.min(distance([a.x1,a.y1],b),distance([a.x2,a.y2],b),distance([b.x1,b.y1],a),distance([b.x2,b.y2],a))>width+.1,'Rounded neighboring strokes keep clear space');
  }
  if(clearance===1){
   assert.ok(gaps[11]>gaps[0]*2,'Retain the original wider-middle angular rhythm');
   assert.ok(gaps[0]>1.9,'The narrow ends are gently opened instead of made uniform');
  }
 }
 const arc=spectrumLines('arc',Array(25).fill(1),{avatar:true,clearance:1});
 assert.ok(arc[12].y2-arc[12].y1>7.9);assert.ok(Math.abs(arc[0].y2-arc[0].y1)<.01,'Radial lines keep shorter ends');
 assert.equal(spectrumWidth('bars',0,24,1),2.6);assert.equal(spectrumWidth('arc',12,25,1),2.6);assert.equal(spectrumWidth('arc',0,25,1),1.3);
});

test('silent, stale and zero-strength music never start a pose loop',()=>{
 for(const frame of [audio(1000,{active:false,status:'silent'}),audio(0),audio(1000,{stable_seconds:1})])assert.equal(musicPoseEligible(frame,options,1000),false);
 assert.equal(musicPoseEligible(audio(),{...options,strength:0},1000),false);
 assert.equal(musicPoseEligible(audio(),options,1000),true);
 const pose=new MusicPoseAnimation();for(let i=0;i<120;i++)pose.step(audio(1000+i*17),{...options,strength:0},1/60,1000+i*17);assert.equal(pose.allowed,false);assert.equal(pose.settling,false);assert.equal(pose.angle,0);
});
