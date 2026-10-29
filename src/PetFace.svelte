<script>
 import StatusAccessory from './StatusAccessory.svelte';
 import MaiAvatar from './MaiAvatar.svelte';
 export let musicOptions={};
 export let settings,work,custom=null,stateAvatars={},talking=false,celebrating=false,idleMood='',idleSequence=0,interactionSequence=0;

</script>
<div class="pet-face" class:active={settings.animations&&work.animated}>
 <div class="pet-image"><MaiAvatar {musicOptions} status={talking?'responding':work.key} character={settings.character} {custom} {settings} {stateAvatars} animations={settings.animations} working={work.animated} {talking} {celebrating} {idleMood} {idleSequence} {interactionSequence}/></div>
 <StatusAccessory {settings} {work} {celebrating}/>
</div>
<style>
 .pet-face{width:112px;height:112px;position:relative}.pet-image{position:absolute;inset:12px;border-radius:50%;border:0;overflow:hidden;box-shadow:none}
</style>
