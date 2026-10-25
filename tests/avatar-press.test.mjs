import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarPress} from '../src/lib/avatar-press.js';
const at=(x=10,y=10,extra={})=>({button:0,buttons:1,detail:1,clientX:x,clientY:y,...extra});
test('Windows DOM taps are consumed once and secondary buttons never start',()=>{
 const p=avatarPress();
 assert.equal(p.begin(at(10,10,{button:2})),false);
 assert.equal(p.finish(at(10,10,{button:2})),false);
 assert.equal(p.begin(at()),true);
 assert.equal(p.move(at(12,12)),false);
 assert.equal(p.finish(at(12,12)),true);
 assert.equal(p.finish(at()),false);
});
test('Crossing drag threshold starts once and suppresses subsequent click',()=>{
 const p=avatarPress();p.begin(at());
 assert.equal(p.move(at(15,10)),true);
 assert.equal(p.move(at(25,10)),false);
 assert.equal(p.finish(at(25,10)),false);
});
test('Lost button, blur cancellation and native taps cannot leave a stale DOM press',()=>{
 const p=avatarPress();p.begin(at());
 assert.equal(p.move(at(20,20,{buttons:0})),false);
 assert.equal(p.finish(at()),false);
 p.begin(at());p.cancel();assert.equal(p.finish(at()),false);
 p.begin(at());assert.equal(p.finish(at(),true),false);
 assert.equal(p.finish(at(0,0,{detail:0,buttons:0}),true),true);
});
test('Held mouse without movement cannot turn a long press into dialogue',()=>{
 const old=Date.now;let now=1000;Date.now=()=>now;
 try { const p=avatarPress();p.begin(at());now+=751;assert.equal(p.finish(at()),false); }
 finally { Date.now=old; }
});
