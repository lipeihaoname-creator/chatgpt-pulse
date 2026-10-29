// Align the first bubble with the portrait center, without moving the portrait.
export const bubbleTop=(height,inset=0)=>Math.max(8,Math.min(64,64-Math.max(0,Number(inset)||0)-Math.max(0,Number(height)||0)/2));
export function anchorBubbles(node,enabled){
 let active=enabled,last=-1;const first=node.firstElementChild;
 const measure=()=>{if(!active||!first)return;const rect=first.getBoundingClientRect(),top=bubbleTop(rect.height,rect.top-node.getBoundingClientRect().top);if(top!==last){node.style.setProperty('--bubble-top',top+'px');last=top;}};
 const observer=new ResizeObserver(measure);if(first)observer.observe(first);observer.observe(node);measure();
 return {update(value){active=value;if(active)measure();else{node.style.removeProperty('--bubble-top');last=-1;}},destroy(){observer.disconnect();node.style.removeProperty('--bubble-top');}};
}
