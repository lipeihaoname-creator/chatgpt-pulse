import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHealth} from '../src/lib/source-health.js';
const now=1000000, sample={source:'logs',state:'waiting',log_id:null,activity_at:null};
test('old compatible logs do not imply connected or idle Work',()=>{
  const health=sourceHealth(sample,[{modified:1}],now);
  assert.equal(health.state,'stale');assert.equal(health.warn,true);assert.equal(health.lastWrite,1);
});
test('a touched file is not proof of task activity',()=>{
  assert.equal(sourceHealth(sample,[{modified:now}],now).state,'unverified');
  assert.equal(sourceHealth(sample,[],now).state,'missing');
  assert.equal(sourceHealth(sample,[{modified:now+1}],now).state,'stale');
});
test('only a recent task event confirms an event signal, independently from token availability',()=>{
  const work={...sample,state:'running',log_id:'synthetic.jsonl',activity_at:now-1000,current_rate:null};
  assert.equal(sourceHealth(work,[],now).state,'activity');
  assert.notEqual(sourceHealth({...work,activity_at:now+1},[],now).state,'activity');
});
test('unreadable, unfinished quiet, paused and demo states remain distinct',()=>{
  assert.equal(sourceHealth({...sample,state:'unavailable'},[{modified:now}],now).state,'unreadable');
  assert.equal(sourceHealth({...sample,state:'running',log_id:'synthetic.jsonl',task_unfinished:true},[],now).state,'uncertain');
  assert.equal(sourceHealth({...sample,state:'paused'},[],now).warn,false);
  assert.equal(sourceHealth({...sample,source:'demo'},[],now).state,'demo');
});
