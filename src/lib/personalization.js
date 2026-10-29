export const avatarSlots=[['idle','等候'],['focused','专注'],['reasoning','思考'],['responding','输出'],['tool','工具'],['attention','等你'],['completed','完成'],['uncertain','待确认'],['unavailable','不可读']];
export const defaultCrop={x:50,y:50,zoom:1};
export const personalizationDefaults={avatar_crop:defaultCrop,state_avatar_crops:{},state_avatar_revision:0,state_avatars_enabled:true,edge_snap:true,idle_collapse:true,completion_scene:true,do_not_disturb:false,idle_chat:true,idle_motions:true,idle_frequency:"balanced"};
const bounded=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function cleanCrop(crop={}){return {x:bounded(crop?.x,0,100,50),y:bounded(crop?.y,0,100,50),zoom:bounded(crop?.zoom,1,3,1)};}
export function cleanPersonalization(value){
 const out={...personalizationDefaults,avatar_crop:cleanCrop(value.avatar_crop),state_avatar_crops:{}};
 for(const key of ['state_avatars_enabled','edge_snap','idle_collapse','completion_scene','do_not_disturb','idle_chat','idle_motions'])if(typeof value[key]==='boolean')out[key]=value[key];
 if(Number.isSafeInteger(value.state_avatar_revision)&&value.state_avatar_revision>=0)out.state_avatar_revision=value.state_avatar_revision;
 for(const [slot] of avatarSlots)if(value.state_avatar_crops?.[slot])out.state_avatar_crops[slot]=cleanCrop(value.state_avatar_crops[slot]);
 if(["quiet","balanced","lively"].includes(value.idle_frequency))out.idle_frequency=value.idle_frequency;
 return out;
}
export function slotFor(status){return ({processing:'focused',loading:'focused',reasoning:'reasoning',responding:'responding',tool:'tool',waiting_user:'attention',waiting_approval:'attention',completed:'completed',quiet:'uncertain',unknown:'uncertain',retrying:'uncertain',unavailable:'unavailable',incomplete:'unavailable',disconnected:'unavailable'})[status]||'idle';}
export function portraitAsset(settings,custom,pack,status,character=settings.character){
 const slot=slotFor(status),state=character!=='none'&&settings.state_avatars_enabled!==false?pack?.[slot]:null;
 return state?{image:state,crop:cleanCrop(settings.state_avatar_crops?.[slot]),slot}:{image:character==='custom'?custom:null,crop:cleanCrop(settings.avatar_crop),slot:'custom'};
}
export function cropStyle(value){const c=cleanCrop(value);return `object-position:${c.x}% ${c.y}%;transform-origin:${c.x}% ${c.y}%;transform:scale(${c.zoom});`;}
export function moveCrop(value,dx,dy,width,height,size){
 const c=cleanCrop(value),scale=Math.max(size/width,size/height)*c.zoom;
 return cleanCrop({...c,x:c.x-(width*scale-size>0?dx*100/(width*scale-size):0),y:c.y-(height*scale-size>0?dy*100/(height*scale-size):0)});
}
export function shouldCollapse(settings,work,{docked=false,locked=true,gripActive=false,dragging=false,talking=false,elapsed=0}={}){
 return settings.idle_collapse&&docked&&locked&&!dragging&&!talking&&elapsed>=15000&&['paused','waiting','completed','aborted'].includes(work.key);
}
export function completionScene(){
 const seen=new Set();
 return {take(sample,settings,clock=Date.now(),mounted=clock){
  const c=sample.completion;if(!c?.id||seen.has(c.id))return false;
  seen.add(c.id);if(seen.size>64)seen.delete(seen.values().next().value);
  return !!(settings.completion_scene&&!settings.do_not_disturb&&sample.state==='completed'&&c.reason==='completed'&&Number.isFinite(c.ended_at)&&c.ended_at>=mounted-1500&&clock>=c.ended_at&&clock-c.ended_at<10000&&(!sample.checked_at||sample.source==='demo'||clock-sample.checked_at<=5000));
 }};
}
