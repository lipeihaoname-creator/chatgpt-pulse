<script>
 import {reducedMotion} from './lib/reduced-motion.js';
 export let settings,work,celebrating=false;
 // Fixed, staggered paths stay around the portrait rim, away from the face.
 const particles=[
  {path:'M 5 53 C 0 30 14 6 39 7',duration:6.2,delay:-1.1,size:12},
  {path:'M 61 5 C 87 1 108 20 105 43',duration:5.8,delay:-3.8,size:10},
  {path:'M 108 58 C 113 84 96 103 77 104',duration:6.7,delay:-2.5,size:12},
  {path:'M 53 108 C 29 113 7 94 8 74',duration:5.9,delay:-4.6,size:10},
  {path:'M 11 85 C 0 65 1 36 13 24',duration:7.1,delay:-.4,size:9},
  {path:'M 94 17 C 110 30 112 58 103 77',duration:6.4,delay:-5.3,size:9}
 ];
 const runes=['M4 3v16m0-15 10 6-10 6m0-6h12','M9 2 3 10l6 10 6-10zM3 10h12M9 2v20','M3 5h12L3 17h12M9 2v20'];
 $: accessory=settings.status_accessories!==false&&settings.animations&&!settings.do_not_disturb&&!$reducedMotion&&['mai','roxy'].includes(settings.character)&&((work.animated&&['processing','reasoning','responding','tool'].includes(work.key))||(celebrating&&work.key==='completed'));
</script>
{#if accessory}
 <span class="status-accessory particle-field" data-accessory={work.key} data-character={settings.character} aria-hidden="true">
  {#each particles as particle,i}
   <span class="pet-particle" style={`offset-path:path('${particle.path}');--flight:${particle.duration}s;--phase:${particle.delay}s;--particle-size:${particle.size}px;--tilt:${i%2?-12:12}deg`}>
    <svg viewBox="0 0 18 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
     {#if settings.character==='mai'}
      <path d="M5 12C1 3 3 0 5 3l3 8M10 11l2-8c1-4 5-3 3 3l-2 7M5 12c-5 3-3 10 4 10s10-7 4-10"/>
     {:else}<path d={runes[i%runes.length]}/>{/if}
    </svg>
   </span>
  {/each}
 </span>
{/if}
