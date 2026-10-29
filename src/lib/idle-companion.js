// Evidence gates prevent quiet/unknown work from being treated as idle.
export function isCompanionIdle(sample,work,clock=Date.now()){
 return sample.source==='logs'&&['waiting','completed','aborted'].includes(work.key)&&Number.isFinite(sample.checked_at)&&clock-sample.checked_at>=-1000&&clock-sample.checked_at<5000&&!(sample.sessions||[]).some(s=>s.state==='running'||s.task_unfinished||s.state==='loading');
}
export function idleDirector(random=Math.random){
 let chatAt=null,motionAt=null,lastTick=null,resumeAt=null,held=false,musicMode=false,resetCount=0,ticks=0;const safe=()=>{const n=random();return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):0;};
 const wait=(type,frequency)=>{const [lo,hi]=type==='motion'?[18000,48000]:frequency==='quiet'?[180000,420000]:frequency==='lively'?[45000,130000]:[90000,240000];const range=type==='chat'&&musicMode?(frequency==='quiet'?[90000,240000]:frequency==='lively'?[22000,55000]:[45000,105000]):[lo,hi];return range[0]+safe()*(range[1]-range[0]);};
 return {inspect(){return {chatAt,motionAt,lastTick,resumeAt,held,musicMode,resetCount,ticks};},reset(){resetCount++;chatAt=motionAt=lastTick=resumeAt=null;held=false;},defer(now,frequency){chatAt=now+wait('chat',frequency);motionAt=now+wait('motion',frequency);},tick({now,eligible,chat,motion,busy=false,suppressed=false,frequency='balanced',music=false}){
  ticks++;const elapsed=lastTick===null?0:now-lastTick,wake=elapsed<0||elapsed>15000;lastTick=now;
  if(!eligible||wake){chatAt=motionAt=resumeAt=null;held=false;return null;}
  if(!!music!==musicMode){musicMode=!!music;chatAt=null;}
  if(!chat)chatAt=null;else if(chatAt===null)chatAt=now+wait('chat',frequency);
  if(!motion)motionAt=null;else if(motionAt===null)motionAt=now+wait('motion',frequency);
  // Brief pointer interactions pause the remaining wait instead of starving it.
  // Never queue a burst or speak immediately as the pointer leaves.
  if(suppressed){if(chatAt!==null)chatAt+=elapsed;if(motionAt!==null)motionAt+=elapsed;held=true;return null;}
  if(busy){held=true;return null;}
  if(held){held=false;resumeAt=now+800+safe()*1000;}
  if(resumeAt!==null&&now<resumeAt)return null;resumeAt=null;
  if(chat&&now>=chatAt){chatAt=now+wait('chat',frequency);motionAt=now+wait('motion',frequency);return 'chat';}
  if(motion&&now>=motionAt){motionAt=now+wait('motion',frequency);return 'motion';}
  return null;
 }};
}
export const idleMoods=['smile','curious','nod','sway','stretch','glance-left','glance-right','shy','relax','bashful','pout','sleepy','proud'];
export function moodExpression(mood){return ({smile:6,curious:2,nod:0,sway:0,stretch:0,'glance-left':0,'glance-right':0,shy:5,relax:0,bashful:6,pout:7,sleepy:0,proud:6})[mood]??null;}

// Four new facial paintings share open/half/closed rows in a 4 × 3 atlas.
export const emotionNames={shy:'害羞',bashful:'忍笑',pout:'鼓脸',sleepy:'困倦'};
export function moodEmotion(mood){return Object.hasOwn(emotionNames,mood)?mood:null;}
export function emotionColumn(mood){return ['shy','bashful','pout','sleepy'].indexOf(mood);}

export function idleMoodsFor(character){
 return [...idleMoods,...(character==='mai'?['shy','bashful','proud','pout']:['curious','shy','nod','bashful'])];
}
