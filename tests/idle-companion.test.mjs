import test from 'node:test';import assert from 'node:assert/strict';import {idleDirector,isCompanionIdle,idleMoods,moodEmotion,emotionColumn} from '../src/lib/idle-companion.js';import {exchangeDeck,idleExchanges,exchangeMoods} from '../src/lib/idle-lines.js';
test('only fresh confirmed idle is eligible; quiet running, paused, demo and other unfinished tasks are excluded',()=>{const s={source:'logs',checked_at:1000,sessions:[]};assert.ok(isCompanionIdle(s,{key:'waiting'},1000));assert.ok(isCompanionIdle({...s,checked_at:1400},{key:'waiting'},1000));assert.ok(!isCompanionIdle({...s,checked_at:5000},{key:'waiting'},1000));for(const key of ['quiet','unknown','paused','reasoning','unavailable'])assert.ok(!isCompanionIdle(s,{key},1000));assert.ok(!isCompanionIdle({...s,sessions:[{task_unfinished:true}]},{key:'completed'},1000));assert.ok(!isCompanionIdle(s,{key:'waiting'},6000));assert.ok(!isCompanionIdle({...s,source:'demo'},{key:'waiting'},1000));});
test('random deadlines vary, never catch up after sleep, and defer on interaction',()=>{let now=0,events=[];const d=idleDirector(()=>.5);const tick=(extra={})=>d.tick({now,eligible:true,chat:true,motion:false,...extra});assert.equal(tick(),null);for(now=500;now<166000;now+=500){const e=tick();if(e)events.push([now,e]);}assert.deepEqual(events,[[165000,'chat']]);now+=600000;assert.equal(tick(),null);assert.equal(tick(),null);d.defer(now,'balanced');now+=500;assert.equal(tick(),null);d.reset();assert.equal(tick({eligible:false}),null);});
test('disabled chat still permits motion, busy work cancels scheduling, large lists never duplicate lines within a deck',()=>{const d=idleDirector(()=>0);assert.equal(d.tick({now:0,eligible:true,chat:false,motion:true}),null);assert.equal(d.tick({now:10000,eligible:true,chat:false,motion:true}),null);assert.equal(d.tick({now:18000,eligible:true,chat:false,motion:true}),'motion');assert.equal(d.tick({now:19000,eligible:false,chat:true,motion:true}),null);const deck=exchangeDeck(()=>.5);for(const role of ['mai','roxy']){const ids=Array.from({length:36},()=>deck.next(role).id);assert.equal(new Set(ids).size,36);assert.notEqual(deck.next(role).id,ids.at(-1));assert.equal(idleExchanges[role].flat().length,108);}});

test('repeated short hovers preserve accumulated waiting time, with a soft release guard',()=>{
 const d=idleDirector(()=>0);let event=null;
 for(let now=0;now<=60000;now+=500){
  event=d.tick({now,eligible:true,chat:true,motion:false,frequency:'lively',suppressed:now%10000>=8000});
  if(event){assert.equal(event,'chat');assert.ok(now>=54000&&now<=60000);return;}
 }
 assert.fail('Repeated hover must not restart the full 45 second deadline');
});
test('an overdue gesture waits for the current one, while real work resets all deadlines',()=>{
 const d=idleDirector(()=>0);const tick=(now,extra={})=>d.tick({now,eligible:true,chat:false,motion:true,...extra});
 tick(0);tick(10000);assert.equal(tick(18000,{busy:true}),null);assert.equal(tick(19000),null);assert.equal(tick(20000),'motion');
 tick(21000,{eligible:false});tick(22000);tick(32000);assert.equal(tick(39000),null);assert.equal(tick(40000),'motion');
});

test('every linked line has an authored valid mood; all new paintings can appear in both roles',()=>{
 for(const role of ['mai','roxy']){
  assert.equal(exchangeMoods[role].length,idleExchanges[role].length);
  for(const [i,moods] of exchangeMoods[role].entries()){
   assert.equal(moods.length,idleExchanges[role][i].length);
   for(const mood of moods)assert.ok(idleMoods.includes(mood));
  }
  for(const mood of ['shy','bashful','pout','sleepy']){
   assert.ok(exchangeMoods[role].flat().includes(mood));assert.equal(moodEmotion(mood),mood);assert.ok(emotionColumn(mood)>=0);
  }
  const deck=exchangeDeck(()=>NaN);assert.ok(deck.next(role).lines.length===3);
 }
});
