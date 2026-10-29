import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptAudio} from '../src/lib/audio-order.js';

test('delayed audio snapshots cannot undo recovery, failure or restarted capture',()=>{
 const active={epoch:2,sequence:120,status:'active'};
 const recovering={epoch:2,sequence:121,status:'recovering'};
 const failed={epoch:2,sequence:122,status:'unavailable'};
 assert.ok(acceptAudio(active,recovering));assert.ok(acceptAudio(recovering,failed));
 assert.equal(acceptAudio(failed,active),false);
 assert.ok(acceptAudio(failed,{epoch:3,sequence:1,status:'starting'}));
 assert.equal(acceptAudio({epoch:3,sequence:1},failed),false);
 assert.ok(acceptAudio({epoch:0,sequence:0},{epoch:0,sequence:0}));
 for(const invalid of [null,{}, {epoch:NaN,sequence:0},{epoch:1,sequence:-1},{epoch:1,sequence:Infinity}])assert.equal(acceptAudio(active,invalid),false);
});
