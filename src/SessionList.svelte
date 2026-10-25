<script>
 import {taskTag} from './lib/task-tags.js';
 import {statusDisplay,rateDisplay,number} from './lib/domain.js';
 export let sample,clock,onselect,settings={},onrename=()=>{};
 let draft='',previous='';
 $: selected=sample.log_id||'';
 $: name=settings.task_names?.[selected]||'';
 $: if(`${selected}:${name}`!==previous){previous=`${selected}:${name}`;draft=name;}

 $: rows=(sample.sessions||[]).filter(s=>s.state==='running'||s.state==='unavailable'&&s.task_unfinished||s.state==='loading'||s.log_id===sample.log_id||s.completion&&clock>=s.completion.ended_at&&clock-s.completion.ended_at<12000);
</script>
{#if rows.length}<section class="session-list panel" aria-label="并行工作对话">
 <div class="section-top"><div><h2>并行工作对话 · {sample.monitored_sessions||0} 项未结束</h2></div></div>
 {#if rows.length}<div class="session-rows">{#each rows as row (row.log_id)}{@const work=statusDisplay(row,clock)}{@const speed=rateDisplay(row,clock)}<button class:selected={row.log_id===sample.log_id} onclick={()=>onselect(row.log_id)} aria-label={`查看工作会话 ${row.log_id?.split('/').at(-1).slice(-20)}`}><span><i style={`color:${taskTag(row.log_id).color}`} aria-hidden="true">{taskTag(row.log_id).shape}</i> {settings.task_names?.[row.log_id]||'工作会话'}</span><b>{work.label}</b><span>{number(speed.value)} <small>Token/s{speed.held?' · 上次':''}</small></span><small>{work.ageText}</small></button>{/each}</div>{:else}<p class="section-desc">暂无工作任务</p>{/if}
{#if selected}<form class="task-name-editor" onsubmit={e=>{e.preventDefault();onrename(selected,draft);}}><label>当前任务昵称 <input aria-label="当前任务昵称" maxlength="48" placeholder="可选，如：数学" bind:value={draft}/></label><button type="submit">保存昵称</button><button type="button" onclick={()=>onrename(selected,'')}>清除</button></form>{/if}
</section>{/if}
<style>.session-list{padding:20px;margin-bottom:20px}.session-list p{font-size:11px;color:#839a8a;margin:8px 0}.session-rows{display:grid;gap:8px;margin-top:16px}.session-rows button{display:grid;grid-template-columns:90px 1fr 140px 140px;align-items:center;gap:10px;padding:12px;background:#202e24;border:1px solid #3a4c3e;border-radius:8px;text-align:left;font-size:12px}.session-rows button.selected{border-color:#a4ddb8}.session-rows small{font-size:10px;color:#93ad9b}@media(max-width:900px){.session-rows button{grid-template-columns:80px 1fr 130px}.session-rows button>small{display:none}}</style>
