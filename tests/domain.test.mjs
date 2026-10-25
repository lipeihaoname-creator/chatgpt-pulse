import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSettings,emptySample,demoSample,linePath,number,rateDisplay,pollLabel,statusDisplay,duration,eventLabel,acceptSample,acceptSettings,pulseCells,completionDisplay} from '../src/lib/domain.js';
test('missing or invalid settings cannot enable recording',()=>{assert.equal(cleanSettings({keep_history:'true'}).keep_history,false);assert.equal(cleanSettings({interval_ms:0,retention_days:99}).interval_ms,500);assert.equal(cleanSettings({retention_days:99}).retention_days,30);});
test('real metrics start unavailable; a demo is always labelled',()=>{assert.equal(emptySample().rate,null);assert.equal(emptySample().source,'logs');assert.equal(demoSample(3).source,'demo');assert.equal(emptySample().output_tokens,null);assert.equal(emptySample().reasoning_tokens,null);assert.equal(demoSample(3).measurement_id,demoSample(2).measurement_id);});
test('a missing rate creates a gap instead of a fabricated line',()=>{const p=linePath([10,null,20]);assert.equal((p.match(/M/g)||[]).length,2);assert.equal((p.match(/L/g)||[]).length,0);assert.equal(linePath([null,null]),'');});
test('unavailable is never formatted as zero',()=>{assert.equal(number(null),'—');assert.equal(number(NaN),'—');assert.equal(number(0),'0.0');});

test('automatic defaults keep privacy opt-in and remember manual override',()=>{const s=cleanSettings({auto_monitor:false,follow_latest:false,pinned_log:'a.jsonl'});assert.equal(s.auto_monitor,false);assert.equal(s.follow_latest,false);assert.equal(s.pinned_log,'a.jsonl');assert.equal(s.keep_history,false);assert.equal(cleanSettings().interval_ms,1000);});
test('current rate never falls back to a historical final average',()=>{
  const done={...emptySample(),state:'completed',rate:25,rate_status:'idle'};
  assert.equal(rateDisplay(done).value,0);
  assert.equal(rateDisplay({...emptySample(),state:'running',current_rate:10,rate_status:'reported_interval',rate_interval_seconds:2}).value,10);
  assert.equal(rateDisplay({...done,state:'running',rate_status:'no_recent_usage'}).value,null);
  assert.match(rateDisplay({...done,state:'running',rate_status:'no_recent_usage'}).note,/不代表模型已停止/);
  assert.equal(rateDisplay({...done,state:'unavailable',current_rate:10}).value,null);
  assert.equal(rateDisplay({...done,state:'paused'}).value,null);
  assert.equal(rateDisplay({...done,state:'running',rate_status:'unavailable'}).value,null);
  assert.equal(rateDisplay(demoSample(0)).value,32);
});
test('heartbeat reports actual last check age instead of fabricating token updates',()=>{assert.match(pollLabel({...emptySample(),state:'running',checked_at:1000,poll_sequence:3},4000),/已检查 3 次 · 3 秒前/);assert.equal(pollLabel(emptySample()),'已暂停检查');});

test('work state is independent from zero or unavailable token rate',()=>{
  const s={...emptySample(),state:'running',activity_status:'reasoning',activity_at:1000,current_rate:0,checked_at:2000};
  assert.equal(statusDisplay(s,3000).label,'推理有进展');
  assert.equal(statusDisplay({...s,current_rate:null},3000).label,'推理有进展');
  assert.equal(statusDisplay({...s,activity_status:'tool',pending_tools:2},3000).label,'工具处理中');
});
test('silent work is uncertain, never idle, and stopped monitor cannot look active',()=>{
  const s={...emptySample(),state:'running',activity_status:'reasoning',activity_at:1000,checked_at:31000};
  assert.equal(statusDisplay(s,31000).key,'quiet');
  assert.equal(statusDisplay({...s,checked_at:1000},31000).key,'disconnected');
  assert.equal(statusDisplay({...s,state:'paused'},31000).key,'paused');
  assert.equal(statusDisplay({...s,state:'incomplete'},31000).key,'incomplete');
  assert.equal(statusDisplay({...s,activity_status:'waiting_approval'},31000).label,'等待你批准');
});
test('completion and evidence trail have explicit labels, safe unknowns, and readable times',()=>{
  assert.equal(statusDisplay({...emptySample(),state:'completed',activity_status:'completed',activity_at:1000},40000).label,'本轮已完成');
  assert.equal(statusDisplay(emptySample()).label,'监测已暂停');
  assert.equal(eventLabel('untrusted arbitrary content'),'状态记录');
  assert.equal(duration(null),'—');assert.equal(duration(61),'1 分 1 秒');
});

test('activity clock uses the latest check but never treats a future event as live',()=>{const s={...emptySample(),state:'running',activity_status:'reasoning',activity_at:2000,checked_at:2000};assert.equal(statusDisplay(s,1800).age,0);assert.equal(statusDisplay({...s,activity_at:10000},3000).key,'unknown');});

test('held speed has an explicit age and is not displayed as a fresh measurement',()=>{
 const s={...emptySample(),state:'running',activity_status:'reasoning',current_rate:42,rate_status:'held_interval',rate_updated_at:1000,checked_at:23000};
 const d=rateDisplay(s,23000);assert.equal(d.value,42);assert.equal(d.held,true);assert.equal(d.short,'上次报告');assert.match(d.ageText,/22 秒前/);assert.match(d.note,/非当前/);
 assert.equal(rateDisplay({...s,checked_at:1000},23000).value,null);
 assert.equal(rateDisplay({...s,state:'completed',rate_status:'idle'},23000).value,0);
});
test('idle expiry defaults migrate safely and custom values are bounded',()=>{
 assert.equal(cleanSettings({}).rate_idle_seconds,30);assert.equal(cleanSettings({rate_idle_seconds:60}).rate_idle_seconds,60);
 assert.equal(cleanSettings({rate_idle_seconds:1}).rate_idle_seconds,10);assert.equal(cleanSettings({rate_idle_seconds:999}).rate_idle_seconds,120);
});

test('stale bootstraps and old monitoring epochs cannot overwrite a newer sample',()=>{
 const latest={...emptySample(),stream_epoch:2,poll_sequence:10,checked_at:1000};
 assert.equal(acceptSample(latest,{...latest,poll_sequence:9}),false);
 assert.equal(acceptSample(latest,{...latest,stream_epoch:1,poll_sequence:999}),false);
 assert.equal(acceptSample(latest,{...latest,stream_epoch:3,poll_sequence:0}),true);
});
test('pulse cells reflect only recorded events, filter future data and ignore polling',()=>{
 const s={...emptySample(),checked_at:10000,pulses:[{at:8000,last_at:9000,count:2,kind:'reasoning'},{at:10000,last_at:12000,count:1,kind:'message'}]};
 assert.equal(pulseCells(s,10000).reduce((a,b)=>a+b.count,0),2);
 assert.equal(pulseCells({...s,poll_sequence:500},10000).reduce((a,b)=>a+b.count,0),2);
 assert.equal(pulseCells(s,60000).reduce((a,b)=>a+b.count,0),0);
});
test('completion cards expire and never obscure a new task or bad source',()=>{
 const s={...emptySample(),state:'completed',completion:{id:'a',ended_at:1000,duration:12,output_tokens:240,average_rate:20,reason:'completed'}};
 assert.equal(completionDisplay(s,2000).average_rate,20);
 assert.equal(completionDisplay(s,13000),null);assert.equal(completionDisplay({...s,state:'running'},2000),null);
 assert.equal(completionDisplay({...s,state:'incomplete'},2000),null);
});

test('old settings responses cannot restore a stale editing state or position',()=>{
 const latest={...cleanSettings(),revision:10,locked:true,overlay_position:{x:200,y:300}};
 assert.equal(acceptSettings(latest,{...latest,revision:9,locked:false,overlay_position:{x:1,y:2}}),false);
 assert.equal(acceptSettings(latest,{...latest,revision:11,hover_hide:false}),true);
 assert.equal(acceptSettings(latest,{...latest}),true);
});

test('appearance preferences migrate with safe defaults and preserve privacy',()=>{
 const s=cleanSettings({theme:'bad',character:'remote',animations:'yes',overlay_layout:'avatar',show_total:true,avatar_revision:2});
 assert.equal(s.theme,'mint');assert.equal(s.character,'mai');assert.equal(s.animations,true);assert.equal(s.keep_history,false);assert.equal(s.overlay_layout,'avatar');assert.equal(s.show_total,true);assert.equal(s.avatar_revision,2);
});

test('removed chat settings migrate to Work defaults without changing appearance or privacy',()=>{
 const settings=cleanSettings({monitor_scope:'chat',theme:'moon',keep_history:false});
 assert.equal('monitor_scope' in settings,false);assert.equal(settings.theme,'moon');assert.equal(settings.keep_history,false);
});
test('Roxy and spellbook preferences survive reload and keep monitoring and existing crop settings',()=>{
 const settings=cleanSettings({character:'roxy',theme:'spellbook',follow_latest:false,avatar_crop:{x:20,y:80,zoom:1.5},overlay_position:{x:345,y:678}});
 assert.equal(settings.character,'roxy');assert.equal(settings.theme,'spellbook');assert.equal(settings.follow_latest,false);assert.equal(settings.keep_history,false);assert.deepEqual(settings.overlay_position,{x:345,y:678});assert.equal(settings.avatar_crop.zoom,1.5);
});
test('millisecond usage batches never display a misleading huge speed or lose reported counts',()=>{
 const now=Date.now(),s={...emptySample(),state:'running',activity_status:'responding',activity_at:now,checked_at:now,output_tokens:40,rate_status:'insufficient_interval',rate_interval_seconds:.001};
 assert.equal(rateDisplay(s,now).value,null);assert.equal(rateDisplay(s,now).short,'区间过短');assert.equal(s.output_tokens,40);assert.equal(statusDisplay(s,now).animated,true);
});
