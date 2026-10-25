<script>
 import {taskTag} from './lib/task-tags.js';
 import PulseStrip from './PulseStrip.svelte';
 import {number} from './lib/domain.js';
 import {shortStatus} from './lib/appearance.js';
 import {reportedUsage} from './lib/reported-usage.js';
 export let sample,settings,work,speed,pulses=[],locked=true,ondrag=()=>{},error='',showPulses=false;
 $: usage=reportedUsage(sample);
</script>
<div class="task-metrics" data-task-id={sample.log_id||''} data-task-output={sample.output_tokens??''} data-task-activity={work.key}>
 <button class="mini-content" onmousedown={ondrag} disabled={locked} aria-label={`拖动悬浮条内容：${work.label}，${number(speed.value)} Token/s，${speed.short}`} title={error||(`${work.detail} ${speed.note}；${speed.ageText}${sample.source==='demo'?' · 合成演示':''}`)}>
  <span class="mini-value mini-work"><span class="pet-status"><i class="work-indicator" class:working={settings.animations&&work.animated} aria-hidden="true">{work.key==='completed'?'✓':work.animated?'✦':['waiting_user','waiting_approval'].includes(work.key)?'!':'·'}</i>{#if sample.log_id}<span class="task-tag" style={`color:${taskTag(sample.log_id).color}`} aria-label="任务色签">{taskTag(sample.log_id).shape}</span>{/if}{shortStatus(work.key,work.label)}</span>{#if settings.task_names?.[sample.log_id]}<small class="task-nickname" title={settings.task_names[sample.log_id]}>{settings.task_names[sample.log_id]}</small>{/if}{#if sample.source==='demo'}<small>合成演示</small>{/if}{#if settings.show_total}<small title={usage.note}>{usage.shortLabel} {number(usage.output,0)} Token</small>{/if}</span>
  <span class="mini-rate" class:held={speed.held}><b>{number(speed.value)}</b><small>Token/s{speed.held?' · 上次':speed.value===null?` · ${speed.short}`:''}</small></span>
 </button>
 {#if showPulses}<div class="mini-pulses"><PulseStrip cells={pulses} compact/></div>{/if}
</div>
