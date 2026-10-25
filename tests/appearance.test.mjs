import test from 'node:test';
import assert from 'node:assert/strict';
import {expressionFor,bubbleVisible} from '../src/lib/appearance.js';
import {emptySample,statusDisplay} from '../src/lib/domain.js';
test('expressions distinguish working, attention, completion and unreadable states',()=>{
 assert.deepEqual(['paused','processing','reasoning','responding','tool','waiting_user','completed','quiet','unavailable'].map(expressionFor),[0,1,2,3,4,5,6,7,8]);
 assert.equal(expressionFor('waiting_approval'),5);assert.equal(expressionFor('disconnected'),8);assert.equal(expressionFor('new-unknown-key'),0);
});
test('on-demand bubble never hides attention or uncertain monitoring',()=>{
 const settings={bubble_mode:'working'};
 for(const key of ['waiting_user','waiting_approval','quiet','unknown','unavailable','incomplete','disconnected','reasoning'])assert.equal(bubbleVisible(settings,{key},null),true,key);
 for(const key of ['paused','completed','waiting','aborted'])assert.equal(bubbleVisible(settings,{key},null),false,key);
 assert.equal(bubbleVisible(settings,{key:'completed'},{}),true);
});
test('activity animation stops on silence, missing monitoring and completion',()=>{
 const now=Date.now(),sample={...emptySample(),source:'logs',state:'running',activity_status:'reasoning',activity_at:now,checked_at:now};
 assert.equal(statusDisplay(sample,now).animated,true);
 assert.equal(statusDisplay({...sample,activity_at:now-31000},now).animated,false);
 assert.equal(statusDisplay({...sample,checked_at:now-6000},now).animated,false);
 assert.equal(statusDisplay({...sample,state:'completed',activity_status:'completed'},now).animated,false);
});

import {chooseDialogue,dialoguePools,roxyDialoguePools} from '../src/lib/dialogue.js';
test('fan dialogue stays short, does not immediately repeat, and preserves uncertainty',()=>{
 for(const pool of Object.values(dialoguePools))for(const line of pool)assert.ok(Array.from(line).length<=28,line);
 for(const key of ['paused','reasoning','waiting_user','completed','quiet','unavailable']){
  const a=chooseDialogue(key,'','mai',0),b=chooseDialogue(key,a.text,'mai',0);assert.notEqual(a.text,b.text);assert.equal(a.kind,'同人互动');
 }
 assert.equal(chooseDialogue('quiet').group,'uncertain');assert.equal(chooseDialogue('unavailable').group,'uncertain');assert.equal(chooseDialogue('waiting_approval').group,'attention');
 assert.equal(chooseDialogue('reasoning','','custom',NaN).group,'generic');
});
test('Roxy dialogue covers each status without borrowing Mai lines or promising unseen progress',()=>{
 for(const pool of Object.values(roxyDialoguePools))for(const line of pool){assert.ok(Array.from(line).length<=28,line);assert.equal(Object.values(dialoguePools).flat().includes(line),false);}
 for(const [key,group] of [['paused','idle'],['reasoning','working'],['tool','working'],['waiting_approval','attention'],['completed','completed'],['quiet','uncertain'],['unavailable','uncertain']]){
  const a=chooseDialogue(key,'','roxy',0),b=chooseDialogue(key,a.text,'roxy',0);
  assert.equal(a.group,group);assert.equal(a.kind,'同人互动');assert.ok(roxyDialoguePools[group].includes(a.text));assert.notEqual(a.text,b.text);
 }
});
