import test from 'node:test';
import assert from 'node:assert/strict';
import {spectrumStyles,cleanVisual,visualDefaults,cleanPresets,exportDesign,importDesign} from '../src/lib/music-settings.js';
import {bandLevels,spectrumShape,spectrumColor,contrastBands} from '../src/lib/spectrum-design.js';
import {spectrumLines,SpectrumAnimation} from '../src/lib/music-animation.js';
test('fewer visible strokes retain every measured band and its weight',()=>{
 for(const n of [12,18,24]){
  assert.deepEqual(bandLevels(Array(24).fill(.5),n),Array(n).fill(.5));
  for(let i=0;i<24;i++){const bands=Array(24).fill(0);bands[i]=1;const values=bandLevels(bands,n);assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)/n-1/24)<1e-10);}
 }
});
test('centered symmetry includes every captured band on both sides',()=>{
 for(const density of [12,18,24])for(let i=0;i<24;i++){const input=Array(24).fill(0);input[i]=1;const shape=spectrumShape('bars',input,input,{visual:{density,mirror:true}});assert.ok(shape.strokes.some(l=>l.y2<28));for(let k=0;k<density/2;k++)assert.equal(shape.strokes[k].y2,shape.strokes[density-1-k].y2);}
});
test('all styles and extreme custom dimensions fit their transparent lane',()=>{
 for(const [style]of spectrumStyles)for(const avatar of [false,true])for(const clearance of [0,.5,1])for(const density of [12,18,24])for(const level of [0,1]){
  const shape=spectrumShape(style,Array(24).fill(level),Array(24).fill(1),{avatar,clearance,visual:{density,width:4,height:1.4,gain:1.8}});
  assert.equal(shape.strokes.length,density);assert.ok(!/NaN|Infinity/.test(shape.path));
  for(const s of shape.strokes)for(const key of ['x1','y1','x2','y2'])assert.ok(Number.isFinite(s[key])&&s[key]>=0&&s[key]<=(key[0]==='x'?112:avatar?136:36),`${style} ${key} ${s[key]}`);
  if(avatar&&clearance===1)assert.ok(shape.strokes.every(s=>s.y1>=118&&s.y2>=118),'Custom height never enters work particle paths');
 }
});
test('the selected radial arc geometry is preserved with neutral contrast',()=>{
 const bands=Array.from({length:24},(_,i)=>(i%5)/5);
 for(const clearance of [0,1]){const a=spectrumLines('arc',bands,{avatar:true,clearance}),b=spectrumShape('arc',bands,bands,{avatar:true,clearance,visual:{contrast:1}}).strokes;for(let i=0;i<24;i++)for(const key of ['x1','y1','x2','y2'])assert.ok(Math.abs(a[i][key]-b[i][key])<1e-10);}
 const silent=spectrumShape('curve',Array(24).fill(0),Array(24).fill(0));assert.ok(silent.strokes.every(s=>s.y2===28));
});
test('design settings, names and shared JSON stay bounded and cannot carry code or capture preferences',()=>{
 const clean=cleanVisual({density:900,color:'url(https://example.com)',color2:'#FF00EE',height:Infinity,width:100,response:0,unexpected:'<script>'});
 assert.equal(clean.density,24);assert.equal(clean.color,visualDefaults.color);assert.equal(clean.color2,'#ff00ee');assert.equal(clean.width,4);assert.equal(clean.height,1);assert.equal(clean.response,.5);assert.equal(clean.unexpected,undefined);
 const saved=cleanPresets([{name:' test\n',style:'dots',visual:clean},{name:'test',style:'bars'},{name:''},...Array.from({length:20},(_,i)=>({name:'方案'+i,style:'curve'}))]);assert.equal(saved.length,12);assert.equal(saved[0].name,'test');
 for(const [style]of spectrumStyles){const text=exportDesign(style,clean);assert.deepEqual(importDesign(text),{style,visual:clean});assert.ok(!text.includes('music_enabled'));}
 for(const bad of ['null','{}','{bad',JSON.stringify({type:'chatgpt-pulse-spectrum',version:9,style:'bars',visual:{}}),'x'.repeat(17000)])assert.throws(()=>importDesign(bad));
 const malicious=JSON.parse(exportDesign('curve',{}));malicious.music_enabled=true;malicious.visual.color='javascript:bad';assert.equal(importDesign(JSON.stringify(malicious)).music_enabled,undefined);assert.equal(importDesign(JSON.stringify(malicious)).visual.color,visualDefaults.color);
});
test('palette selection and release controls work without fake motion or changing attack',()=>{
 const visual=cleanVisual({color_mode:'gradient',color:'#ff0000',color2:'#0000ff'});assert.equal(spectrumColor(visual,0,3),'#ff0000');assert.equal(spectrumColor(visual,1,3),'#800080');assert.equal(spectrumColor(visual,2,3),'#0000ff');
 const a=new SpectrumAnimation(),b=new SpectrumAnimation();const frame={supported:true,status:'active',active:true,at:1000,bars:Array(24).fill(1)};
 a.step(frame,.016,1000,'bars',false,false,.5);b.step(frame,.016,1000,'bars',false,false,2);assert.equal(a.levels[0],b.levels[0]);
 a.step({...frame,bars:Array(24).fill(0)},.016,1000,'bars',false,false,.5);b.step({...frame,bars:Array(24).fill(0)},.016,1000,'bars',false,false,2);assert.ok(a.levels[0]<b.levels[0]);
});

test('contrast increases actual band differences without adding fake frequency motion',()=>{
 const bands=[.68,.72,.74,.76,.78,.80,.84,.88];
 const neutral=contrastBands(bands,bands,1,1),enhanced=contrastBands(bands,bands,2,1);
 const spread=a=>Math.max(...a.map(n=>n**1.6))-Math.min(...a.map(n=>n**1.6));
 assert.ok(spread(enhanced.values)>spread(neutral.values)*1.5);
 assert.ok(enhanced.values.every((n,i)=>i===0||n>enhanced.values[i-1]));
 for(const value of [0,.001,.5,.8,1]){const equal=contrastBands(Array(24).fill(value),Array(24).fill(value),3,1.8);assert.equal(new Set(equal.values).size,1);assert.ok(equal.values.every(n=>n>=0&&n<=1));}
 assert.deepEqual(contrastBands(Array(24).fill(0),Array(24).fill(0),3,1.8).values,Array(24).fill(0));
 const loud=contrastBands([.7,.8,.9,1],[.75,.85,.95,1],2,1.8);assert.equal(new Set(loud.values).size,4);assert.ok(loud.values.slice(0,-1).every(n=>n<1));assert.ok(loud.peaks.every((n,i)=>n>=loud.values[i]));
 assert.equal(cleanVisual({contrast:99}).contrast,3);assert.equal(cleanVisual({contrast:NaN}).contrast,2);assert.equal(importDesign(exportDesign('arc',{contrast:2.7})).visual.contrast,2.7);
});
