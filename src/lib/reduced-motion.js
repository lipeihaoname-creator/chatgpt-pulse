import {readable} from 'svelte/store';

// One live browser preference listener per webview, shared by portraits/speech.
export const reducedMotion=readable(false,set=>{
 const query=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 if(!query)return;
 const update=()=>set(query.matches);
 update();query.addEventListener('change',update);
 return()=>query.removeEventListener('change',update);
});
