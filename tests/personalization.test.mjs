import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSettings,defaults} from '../src/lib/domain.js';
import {cleanCrop,moveCrop,portraitAsset,shouldCollapse,completionScene} from '../src/lib/personalization.js';
test('crop placement stays within the image, migration keeps recording opt-in',()=>{
 assert.deepEqual(cleanCrop({x:-10,y:200,zoom:10}),{x:0,y:100,zoom:3});
 assert.deepEqual(moveCrop({zoom:2,x:50,y:50},42,0,100,100,168),{x:25,y:50,zoom:2});
 assert.deepEqual(moveCrop({zoom:1,x:50,y:50},100,100,100,100,168),{x:50,y:50,zoom:1});
 const s=cleanSettings({state_avatar_crops:{reasoning:{zoom:2},bad:{zoom:3}},avatar_crop:{zoom:100}});
 assert.equal(s.avatar_crop.zoom,3);assert.deepEqual(Object.keys(s.state_avatar_crops),['reasoning']);assert.equal(s.keep_history,false);
});
test('state pack overrides only assigned states and respects disable/minimal choices',()=>{
 const settings={...defaults,character:'mai',state_avatar_crops:{reasoning:{x:10,zoom:2}}},pack={reasoning:'think.png',attention:'wait.png'};
 assert.equal(portraitAsset(settings,null,pack,'reasoning').image,'think.png');
 assert.equal(portraitAsset(settings,null,pack,'reasoning').crop.x,10);
 assert.equal(portraitAsset(settings,null,pack,'waiting_approval').image,'wait.png');
 assert.equal(portraitAsset({...settings,character:'custom'},'base.png',pack,'tool').image,'base.png');
 assert.equal(portraitAsset({...settings,state_avatars_enabled:false},null,pack,'reasoning').image,null);
 assert.equal(portraitAsset({...settings,character:'none'},null,pack,'reasoning').image,null);
});
test('idle docking never hides active, uncertain or attention states, and hover restores the bubble',()=>{
 const view={docked:true,elapsed:16000};
 assert.equal(shouldCollapse(defaults,{key:'waiting'},view),true);
 for(const key of ['reasoning','tool','quiet','unknown','waiting_user','waiting_approval','disconnected'])assert.equal(shouldCollapse(defaults,{key},view),false,key);
 for(const block of [{gripActive:true},{dragging:true},{talking:true},{locked:false},{docked:false},{elapsed:14000}])assert.equal(shouldCollapse(defaults,{key:'completed'},{...view,...block}),false);
});
test('completion celebrates only fresh matched natural completion once, and never replays after unmuting',()=>{
 const now=100000,sample={state:'completed',checked_at:now,completion:{id:'turn-1',reason:'completed',ended_at:now}};
 const scene=completionScene();assert.equal(scene.take(sample,defaults,now,now),true);assert.equal(scene.take(sample,defaults,now+1,now),false);
 const muted=completionScene();assert.equal(muted.take(sample,{...defaults,do_not_disturb:true},now,now),false);assert.equal(muted.take(sample,defaults,now+1,now),false);
 assert.equal(completionScene().take({...sample,state:'aborted'},defaults,now,now),false);
 assert.equal(completionScene().take({...sample,completion:{...sample.completion,ended_at:now-8000}},defaults,now,now),false);
 assert.equal(completionScene().take({...sample,checked_at:now-6000},defaults,now,now),false);
});
