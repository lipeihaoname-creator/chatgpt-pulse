export const spectrumStyles=[['bars','贴近横条'],['arc','下缘半环'],['dots','跳动光点'],['curve','柔光曲线'],['mirror','镜像声柱'],['led','像素灯阵']];
export const visualDefaults={color_mode:'theme',color:'#a6baff',color2:'#67e8d0',density:24,width:2.6,height:1,gain:1,contrast:2,response:1,opacity:1,peaks:true,rounded:true,mirror:false,fill:.18};
const bounded=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
export function cleanVisual(input={}){
 const v=object(input),out={...visualDefaults};
 if(['theme','solid','gradient','rainbow'].includes(v.color_mode))out.color_mode=v.color_mode;
 for(const key of ['color','color2'])if(typeof v[key]==='string'&&/^#[0-9a-f]{6}$/i.test(v[key]))out[key]=v[key].toLowerCase();
 if([12,18,24].includes(v.density))out.density=v.density;
 for(const [key,min,max]of [['width',1,4],['height',.6,1.4],['gain',.5,1.8],['contrast',1,3],['response',.5,2],['opacity',.3,1],['fill',0,.4]])out[key]=bounded(v[key],min,max,out[key]);
 for(const key of ['peaks','rounded','mirror'])if(typeof v[key]==='boolean')out[key]=v[key];
 return out;
}
export function cleanDesign(input={}){const v=object(input);return {style:spectrumStyles.some(([id])=>id===v.style)?v.style:'bars',visual:cleanVisual(v.visual)};}
export function cleanPresets(input){
 const names=new Set();return (Array.isArray(input)?input:[]).flatMap(item=>{
  const v=object(item),name=typeof v.name==='string'?Array.from(v.name.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim()).slice(0,24).join(''):'';
  if(!name||names.has(name))return [];names.add(name);return [{name,...cleanDesign(v)}];
 }).slice(0,12);
}
export const musicDefaults={music_enabled:false,music_spectrum:true,music_style:'bars',music_motion:true,music_strength:.5,music_dialogue:true,music_visual:visualDefaults,music_presets:[]};
export function cleanMusic(value={}){
 const out={...musicDefaults,music_visual:cleanVisual(value.music_visual),music_presets:cleanPresets(value.music_presets)};
 for(const key of ['music_enabled','music_spectrum','music_motion','music_dialogue'])if(typeof value[key]==='boolean')out[key]=value[key];
 if(spectrumStyles.some(([id])=>id===value.music_style))out.music_style=value.music_style;
 if(Number.isFinite(value.music_strength))out.music_strength=Math.max(0,Math.min(1,value.music_strength));
 return out;
}
export function exportDesign(style,visual){return JSON.stringify({type:'chatgpt-pulse-spectrum',version:1,...cleanDesign({style,visual})},null,2);}
export function importDesign(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>16384)throw Error('方案过大，最多 16 KB');
 let v;try{v=JSON.parse(text);}catch{throw Error('方案格式不正确，请粘贴完整的方案文本');}
 if(!v||v.type!=='chatgpt-pulse-spectrum'||v.version!==1||!spectrumStyles.some(([id])=>id===v.style)||!v.visual||typeof v.visual!=='object'||Array.isArray(v.visual))throw Error('这不是受支持的频谱方案');
 return cleanDesign(v);
}
