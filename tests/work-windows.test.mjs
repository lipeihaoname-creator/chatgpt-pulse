import test from 'node:test';import assert from 'node:assert/strict';
import {projectWorkSample} from '../src/lib/work-windows.js';import {emptySample} from '../src/lib/domain.js';
test('each bubble stays bound to its session across selection, pinning and missing rows',()=>{
 const base=emptySample(),root={...base,log_id:'b',poll_sequence:8,checked_at:1000,sessions:[{...base,log_id:'a',output_tokens:30},{...base,log_id:'b',output_tokens:70}]};
 assert.equal(projectWorkSample(root,'a').output_tokens,30);assert.equal(projectWorkSample(root,'b').output_tokens,70);assert.equal(projectWorkSample(root,'a').poll_sequence,8);
 assert.equal(projectWorkSample({...root,sessions:[]},'a').output_tokens,null);assert.equal(projectWorkSample(root,'').log_id,'b');
 const direct={...base,log_id:'a',output_tokens:40,checked_at:2000,poll_sequence:9};assert.equal(projectWorkSample(direct,'a').output_tokens,40);
});
test('group projection retains independent rows but never repeats primary or displays IDs',()=>{
 const base=emptySample(),root={...base,log_id:'b',overlay_log_id:'a',sessions:[{...base,log_id:'a',output_tokens:30},{...base,log_id:'b',output_tokens:70}],monitored_sessions:2};
 const group=projectWorkSample(root,'a',true);assert.equal(group.output_tokens,30);assert.deepEqual(group.sessions.map(s=>[s.log_id,s.output_tokens]),[['b',70]]);assert.equal(group.session_label,null);assert.deepEqual(projectWorkSample(root,'a').sessions,[]);
});
