import test from 'node:test';
import assert from 'node:assert/strict';
import {musicDefaults,cleanMusic} from '../src/lib/music-settings.js';
import {cleanSettings,defaults,emptySample,statusDisplay} from '../src/lib/domain.js';
import {musicIdle,musicTalkAllowed,spectrumLines,cleanAudio,silentAudio} from '../src/lib/music.js';
import {musicExchanges} from '../src/lib/music-lines.js';
import {idleExchanges,exchangeDeck} from '../src/lib/idle-lines.js';
const now=1_000_000;
const idle={...emptySample(),source:'logs',state:'waiting',checked_at:now,music_idle_confirmed:true};
const work=statusDisplay(idle,now);
const audio={...silentAudio,supported:true,status:'active',active:true,at:now,stable_seconds:4};
test('music defaults off, preserves old settings and validates controls',()=>{
 assert.equal(musicDefaults.music_enabled,false);assert.equal(cleanSettings({}).music_enabled,false);
 const s=cleanSettings({theme:'spellbook',overlay_position:{x:34,y:55},music_enabled:true,music_style:'bad',music_strength:100});
 assert.equal(s.theme,'spellbook');assert.deepEqual(s.overlay_position,{x:34,y:55});assert.equal(s.music_style,'bars');assert.equal(s.music_strength,1);
 assert.equal(cleanMusic({music_strength:NaN,music_enabled:'yes'}).music_strength,.5);
});
test('only backend-cleared fresh scans permit music; unfinished and error tasks still block',()=>{
 assert.equal(musicIdle(idle,work,now),true);
 for(const sample of [{...idle,music_idle_confirmed:false},{...idle,task_unfinished:true},{...idle,source:'demo'},{...idle,checked_at:now-6000},...['paused','running','unavailable','loading'].map(state=>({...idle,state})),
  ...['running','loading','unavailable','paused'].map(state=>({...idle,sessions:[{state}]})),{...idle,sessions:[{state:'completed',task_unfinished:true}]}]){
  assert.equal(musicIdle(sample,statusDisplay(sample,now),now),false,JSON.stringify(sample));
 }
 assert.equal(musicIdle({...idle,sessions:[{state:'completed'},{state:'aborted'}]},work,now),true);
 const noTask={...idle,log_id:'new.jsonl',activity_status:'unknown',sessions:[{state:'waiting'}]};
 assert.equal(statusDisplay(noTask,now).key,'unknown');
 assert.equal(musicIdle(noTask,statusDisplay(noTask,now),now),true,'Decorative music must not rewrite the unknown work status');
 assert.equal(musicIdle({...idle,pending_tools:1},work,now),false);
});
test('music conversations require stable fresh system audio and confirmed idle',()=>{
 const settings={...defaults,music_enabled:true};assert.ok(musicTalkAllowed(settings,idle,work,audio,now));
 for(const a of [{...audio,stable_seconds:2},{...audio,at:now-1300},{...audio,active:false},{...audio,status:'permission_denied'}])assert.equal(musicTalkAllowed(settings,idle,work,a,now),false);
 for(const setting of [{...settings,do_not_disturb:true},{...settings,music_dialogue:false},{...settings,music_enabled:false}])assert.equal(musicTalkAllowed(setting,idle,work,audio,now),false);
});
test('both spectrum styles fit their separate transparent lane',()=>{
 for(const style of ['bars','arc'])for(const bars of [Array(24).fill(0),Array(24).fill(1)])for(const l of spectrumLines(style,bars))for(const [k,v]of Object.entries(l))assert.ok(Number.isFinite(v)&&v>=0&&v<=(k.startsWith('x')?112:36),`${style} ${k} ${v}`);
 assert.equal(cleanAudio({bars:[NaN,Infinity,-1,5]}).bars[3],1);
});
test('music topics extend the existing exchanges without replacing them or losing reply context',()=>{
 for(const role of ['mai','roxy']){
  assert.equal(idleExchanges[role].length,36);assert.equal(musicExchanges[role].length,12);
  const deck=exchangeDeck(()=>.01);const seen=new Set();
  for(let i=0;i<12;i++){const value=deck.next(role,{music:true});assert.ok(value.music);assert.equal(value.lines.length,3);assert.equal(value.moods.length,3);seen.add(value.id);}
  assert.equal(seen.size,12);assert.equal(deck.next(role).music,undefined);
 }
});
