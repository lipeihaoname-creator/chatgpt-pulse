import {call} from './bridge.js';
// Cache by asset revision, never cache a rejected read, and ignore late old loads.
export function avatarCache(read){
 const entries=new Map();
 const trim=()=>{while(entries.size>2)entries.delete(entries.keys().next().value);};
 return {
  get(revision){
   if(!revision)return Promise.resolve(null);
   if(!entries.has(revision)){
    const request=Promise.resolve().then(()=>read());entries.set(revision,request);trim();
    request.catch(()=>{if(entries.get(revision)===request)entries.delete(revision);});
   }
   return entries.get(revision);
  },
  seed(revision,image){entries.set(revision,Promise.resolve(image));trim();}
 };
}
const cache=avatarCache(()=>call('get_custom_avatar'));
const packCache=avatarCache(()=>call('get_state_avatars'));
export const stateAvatars=revision=>revision?packCache.get(revision):Promise.resolve({});
export const customAvatar=revision=>cache.get(revision);
export function avatarLoader(set,error,read=customAvatar){
 let generation=0,disposed=false;
 return {async load(revision){const current=++generation;try{const image=await read(revision);if(!disposed&&current===generation){set(image);error('');}}catch(e){if(!disposed&&current===generation)error(String(e));}},dispose(){disposed=true;generation++;}};
}
function dataUrl(file){return new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('无法读取这张图片，请重新选择'));reader.onabort=()=>reject(Error('图片读取已取消'));reader.readAsDataURL(file);
});}
export async function encodeAvatar(file){
 if(!file) return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)&&!(file.type===''&&/\.(png|jpe?g|webp)$/i.test(file.name)))throw Error('请选择 PNG、JPEG 或 WebP 图片');
 if(file.size>5*1024*1024)throw Error('图片请小于 5 MB');
 // Native CSP permits data: images, but intentionally does not permit blob:.
 const image=new Image();image.src=await dataUrl(file);
 try{await image.decode();}catch{throw Error('图片无法解码，请选择有效的 PNG、JPEG 或 WebP 图片');}
 if(!image.width||!image.height||image.width*image.height>40_000_000)throw Error('图片尺寸过大或无效');
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 if(!context)throw Error('图片处理不可用，请重新打开设置后重试');
 let encoded='';
 // Highly detailed alpha images can exceed the native PNG limit even at 384px.
 for(const bound of [384,320,256]){
  const scale=Math.min(1,bound/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  context.drawImage(image,0,0,canvas.width,canvas.height);encoded=canvas.toDataURL('image/png');
  if((encoded.length-'data:image/png;base64,'.length)*3/4<=512*1024)break;
 }
 return encoded;
}
export async function importAvatar(file){const encoded=await encodeAvatar(file);if(!encoded)return null;const settings=await call('set_custom_avatar',{image:encoded});cache.seed(settings.avatar_revision,encoded);return settings;}
export async function importStateAvatar(file,slot){const image=await encodeAvatar(file);return image?call('set_state_avatar',{slot,image}):null;}
