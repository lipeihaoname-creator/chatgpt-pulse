<script>
 import StatusAccessory from './StatusAccessory.svelte';
 import MaiAvatar from './MaiAvatar.svelte';
 export let settings,work,custom=null,stateAvatars={},talking=false,celebrating=false,idleMood='',idleSequence=0,interactionSequence=0;

</script>
<div class="pet-face" class:active={settings.animations&&work.animated} data-motion={settings.motion}>
 <div class="pet-image"><MaiAvatar status={talking?'responding':work.key} character={settings.character} {custom} {settings} {stateAvatars} animations={settings.animations} working={work.animated} {talking} {celebrating} {idleMood} {idleSequence} {interactionSequence}/></div>
 <StatusAccessory {settings} {work} {celebrating}/>
 <span class="pet-orbit" aria-hidden="true">✦</span>
</div>
<style>
 .pet-face{width:112px;height:112px;position:relative}.pet-image{position:absolute;inset:12px;border-radius:50%;border:0;overflow:hidden;box-shadow:none}.pet-orbit{position:absolute;inset:0;text-align:center;line-height:17px;color:var(--pet-accent);opacity:0;font-size:15px;transform-origin:center;pointer-events:none}.active .pet-orbit{opacity:1;animation:spark 2s ease-in-out infinite}.active[data-motion=orbit] .pet-orbit{animation:orbit 5s linear infinite}.active[data-motion=breath] .pet-orbit{animation:spark 3.5s ease-in-out infinite}@keyframes spark{50%{opacity:.35;filter:drop-shadow(0 0 4px var(--pet-accent))}}@keyframes orbit{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.active .pet-orbit,.active .pet-image{animation:none!important}}
</style>
