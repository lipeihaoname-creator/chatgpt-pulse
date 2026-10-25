<script>
  export let cells=[];
  export let compact=false;
  $: count=cells.reduce((n,c)=>n+c.count,0);
</script>
<div class="pulse-strip" class:compact role="img" aria-label={`近 40 秒记录到 ${count} 个活动事件；每格 2 秒，空格不代表任务停止`}>
  {#each cells as cell}<span class:lit={cell.count>0} class:tool={['tool_started','tool_finished'].includes(cell.kind)} class:attention={['waiting_approval','waiting_user','retrying'].includes(cell.kind)} data-count={cell.count} title={`${cell.age} 秒前：${cell.count} 个事件`}></span>{/each}
</div>
