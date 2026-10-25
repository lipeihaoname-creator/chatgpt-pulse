import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarCache,avatarLoader} from '../src/lib/avatar.js';
test('failed avatar reads can retry the same revision and successful reads are shared',async()=>{
 let calls=0;const cache=avatarCache(async()=>{if(++calls===1)throw Error('temporary');return 'image';});
 await assert.rejects(cache.get(1),/temporary/);assert.equal(await cache.get(1),'image');assert.equal(await cache.get(1),'image');assert.equal(calls,2);
 cache.seed(2,'imported');assert.equal(await cache.get(2),'imported');assert.equal(calls,2);
});
test('late old avatar responses and disposed views cannot overwrite a newer image',async()=>{
 const pending=new Map(),values=[],errors=[];
 const loader=avatarLoader(value=>values.push(value),value=>errors.push(value),revision=>new Promise((resolve,reject)=>pending.set(revision,{resolve,reject})));
 const old=loader.load(1),recent=loader.load(2);pending.get(2).resolve('new');await recent;pending.get(1).resolve('old');await old;assert.deepEqual(values,['new']);
 const destroyed=loader.load(3);loader.dispose();pending.get(3).resolve('disposed');await destroyed;assert.deepEqual(values,['new']);
});
