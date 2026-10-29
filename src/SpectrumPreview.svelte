<script>
 import {spectrumShape,spectrumColor} from './lib/spectrum-design.js';
 export let style='bars',visual={};
 const gradientId='preview-'+Math.random().toString(36).slice(2);
 const levels=[.12,.18,.3,.23,.48,.72,.56,.32,.6,.82,.93,.69,.46,.78,.62,.39,.25,.53,.68,.44,.26,.3,.2,.12];
 $: design=spectrumShape(style,levels,levels,{visual});
</script>
<svg viewBox="0 0 112 36" aria-hidden="true" focusable="false" style={`opacity:${design.visual.opacity}`}>
 <defs><linearGradient id={gradientId}>{#each [0,1,2,3,4] as i}<stop offset={i*25+'%'} stop-color={spectrumColor(design.visual,i,5)}/>{/each}</linearGradient></defs>
 {#if style==='curve'}<path d={design.area} fill={`url(#${gradientId})`} opacity={design.visual.fill}/><path d={design.path} fill="none" stroke={`url(#${gradientId})`} stroke-width={design.visual.width}/>
 {:else}{#each design.strokes as line}{#if style==='dots'}<circle cx={line.x2} cy={line.y2} r={line.radius} fill={line.color}/>{:else}<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} stroke-width={line.width} stroke-linecap={design.visual.rounded?'round':'butt'} stroke-dasharray={style==='led'?'1 2.2':undefined}/>{/if}{/each}{/if}
</svg>
<style>svg{width:100%;height:44px;display:block;pointer-events:none;overflow:hidden;color:var(--pet-accent,#a6baff)}</style>
