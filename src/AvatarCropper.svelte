<script>
 import {cleanCrop,cropStyle,moveCrop,defaultCrop} from './lib/personalization.js';
 export let image,initial={},onsave,oncancel;
 let crop=cleanCrop(initial),picture,press=null,busy=false,error='';
 function down(e){if(e.button!==0)return;e.preventDefault();press={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e){if(!press)return;const size=e.currentTarget.clientWidth;crop=moveCrop(crop,e.clientX-press.x,e.clientY-press.y,picture.naturalWidth,picture.naturalHeight,size);press={x:e.clientX,y:e.clientY};}
 async function save(){busy=true;error='';try{await onsave(crop);}catch(e){error=String(e);}finally{busy=false;}}
</script>
<section class="avatar-cropper" aria-label="头像裁剪">
 <div class="crop-viewport" role="img" aria-label="拖动图片调整头像位置" onpointerdown={down} onpointermove={move} onpointerup={()=>press=null} onpointercancel={()=>press=null} onlostpointercapture={()=>press=null}>
  <img bind:this={picture} src={image} alt="裁剪预览" draggable="false" style={cropStyle(crop)}/>
 </div>
 <div class="crop-controls"><b>头像裁剪与缩放</b><p>先放大，再拖动图片调整位置；原图保存在本机。</p>
  <label>缩放 <input aria-label="头像缩放" type="range" min="1" max="3" step="0.01" bind:value={crop.zoom}/><output>{Number(crop.zoom).toFixed(2)}×</output></label>
  <label>左右 <input aria-label="头像左右位置" type="range" min="0" max="100" step="1" bind:value={crop.x}/></label>
  <label>上下 <input aria-label="头像上下位置" type="range" min="0" max="100" step="1" bind:value={crop.y}/></label>
  <div class="appearance-control"><button class="primary" disabled={busy} onclick={save}>{busy?'保存中':'保存裁剪'}</button><button class="secondary" disabled={busy} onclick={()=>crop={...defaultCrop}}>重置</button><button class="quiet" disabled={busy} onclick={oncancel}>取消裁剪</button></div>
  {#if error}<p class="warning" role="alert">{error}</p>{/if}
 </div>
</section>
<style>
 .avatar-cropper{display:flex;gap:24px;align-items:center;margin:20px 0;padding:20px;border:1px solid #46594b;border-radius:12px;background:#15221a}.crop-viewport{width:168px;height:168px;flex-shrink:0;overflow:hidden;border-radius:50%;outline:2px solid #b6dbbd;cursor:grab;touch-action:none;background:#26392c}.crop-viewport:active{cursor:grabbing}img{width:100%;height:100%;object-fit:cover;pointer-events:none}.crop-controls{flex:1;min-width:0}.crop-controls p{font-size:11px;color:#a3b8aa}.crop-controls label{display:flex;align-items:center;gap:10px;font-size:11px;margin:12px 0}.crop-controls input{flex:1;min-width:60px}.crop-controls output{width:42px}.appearance-control{flex-wrap:wrap;gap:6px}
</style>
