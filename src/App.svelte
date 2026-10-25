<script>
  import {version} from '../package.json';
  import {sourceHealth} from './lib/source-health.js';
  import {reportedUsage} from './lib/reported-usage.js';
  import {onMount} from 'svelte';
  import {listen} from '@tauri-apps/api/event';
  import Overlay from './Overlay.svelte';
  import Appearance from './Appearance.svelte';
  import SessionList from './SessionList.svelte';
  import appIcon from './assets/app-icon.png';
  import PulseStrip from './PulseStrip.svelte';
  import {call,subscribe,native} from './lib/bridge.js';
  import {defaults,emptySample,number,linePath,rateDisplay,pollLabel,statusDisplay,eventLabel,duration,acceptSample,acceptSettings,pulseCells,completionDisplay} from './lib/domain.js';
  const overlay=new URLSearchParams(location.search).has('overlay');
  let tab='overview', settings={...defaults}, sample=emptySample(), history=[], values=[], error='', busy=false, platform='macos', shortcutError=null;
  let disposed=false,historyRequest=0,clearingHistory=false,offlineTest=false;
  let source='logs', logs=[], selectedLog='', lastMeasurement=null,clock=Date.now(),startup={installed:false,loaded:false,supported:false};
  $: displayedRate=rateDisplay(sample,clock);
  $: usage=reportedUsage(sample);
  $: work=statusDisplay(sample,clock);
  $: sourceStatus=sourceHealth(sample,logs,clock);
  $: pulses=pulseCells(sample,clock);
  $: card=settings.completion_card?completionDisplay(sample,clock):null;
  $: heartbeat=pollLabel(sample,clock);
  $: usageAge=sample.usage_updated_at?Math.max(0,(clock-sample.usage_updated_at)/1000):null;
  $: selectedId=sample.log_id||selectedLog;
  $: selected=logs.find(f=>f.id===selectedId)||(selectedId?{id:selectedId,label:selectedId.replace(/\.jsonl$/,'').slice(-12)}:null);
  $: selectionUnlisted=!!selectedLog&&!logs.some(f=>f.id===selectedLog);
  $: synthetic=sample.source==='demo';
  $: tag=synthetic?'合成':'日志报告';
  const tabs=[['overview','◉','实时概览'],['history','◷','本地记录'],['settings','⚙','偏好设置']];
  $: active=sample.state!=='paused';
  $: badge=synthetic?'合成演示':sample.state==='paused'?'尚未开始':sourceStatus.label;
  $: path=linePath(values);
  function receive(next){
    if(!acceptSample(sample,next))return;
    if(next.source!==source || next.log_id!==sample.log_id){values=[];lastMeasurement=null;source=next.source;}
    sample=next;
    if(next.log_id)selectedLog=next.log_id;
    if(['completed','aborted'].includes(next.state)&&next.measurement_id&&next.measurement_id!==lastMeasurement){
      values=[...values,next.rate].slice(-90);lastMeasurement=next.measurement_id;
    }
  }
  function receiveSettings(next){if(acceptSettings(settings,next))settings=next;}
  async function selectSession(id){try{receiveSettings(await call('patch_settings',{key:'follow_latest',value:false,pinnedLog:id}));selectedLog=id;receive(await call('control',{action:'live',logId:id}));}catch(e){error=String(e);}}
  async function refreshLogs(){try{logs=await call('list_logs');if(!logs.some(f=>f.id===selectedLog)&&(settings.follow_latest||!selectedLog))selectedLog=logs[0]?.id||'';}catch(e){error=String(e);}}
  async function refreshHistory(){
    if(clearingHistory)return;const request=++historyRequest;
    try{const rows=await call('history');if(!disposed&&request===historyRequest&&!clearingHistory)history=rows;}catch(e){if(!disposed&&request===historyRequest&&!clearingHistory)throw e;}
  }
  async function openTab(value){tab=value;if(value==='history'){try{await refreshHistory();}catch(e){error=String(e);}}}
  onMount(()=>{
    if(overlay)return;const offs=[];
    const keep=promise=>promise.then(off=>{if(disposed)off();else offs.push(off);}).catch(e=>{if(!disposed)error=String(e);});
    call('bootstrap').then(b=>{if(disposed)return;receiveSettings(b.settings);receive(b.sample);if(historyRequest===0&&!clearingHistory)history=b.history;logs=b.logs||[];selectedLog=sample.log_id||b.selected_log||logs[0]?.id||'';offlineTest=!!b.offline_test;platform=b.platform;shortcutError=b.shortcut_error;startup=b.startup||startup;}).catch(e=>{if(!disposed)error=String(e);});
    keep(subscribe(receive,receiveSettings));
    if(native){
      keep(listen('pulse:logs',e=>logs=e.payload));keep(listen('pulse:settings',e=>receiveSettings(e.payload)));keep(listen('pulse:error',e=>error=e.payload));
      keep(listen('pulse:history',()=>refreshHistory().catch(e=>{if(!disposed)error=String(e);}))); 
    }
    const ticker=setInterval(()=>clock=Date.now(),500);
    return()=>{disposed=true;historyRequest++;clearInterval(ticker);offs.forEach(off=>off());};
  });
  async function control(action){busy=true;error='';values=[];try{receive(await call('control',{action,logId:action==='live'?selectedLog:null}));if(action==='pause')await refreshHistory();}catch(e){error=String(e);}finally{busy=false;}}
  async function change(key,value){error='';try{receiveSettings(await call('patch_settings',{key,value,pinnedLog:key==='follow_latest'&&!value?(sample.log_id||selectedLog||null):null}));}catch(e){error=String(e);}}
  async function setWatch(enabled){error='';busy=true;try{startup=await call('set_client_watch',{enabled});}catch(e){error=String(e);}finally{busy=false;}}
  async function clear(){if(clearingHistory)return;clearingHistory=true;historyRequest++;try{await call('clear_history');history=[];}catch(e){error=String(e);}finally{clearingHistory=false;}}
  async function finishEdit(cancel=false){try{const locked=await call('overlay_edit',{editing:false,cancel});settings={...settings,locked};}catch(e){error=String(e);}}
  async function edit(){try{await call('overlay_edit',{editing:true});settings={...settings,locked:false,overlay_enabled:true};}catch(e){error=String(e);}}
</script>

{#if overlay}<Overlay/>{:else}
<div class="shell" data-pulse-sequence={sample.poll_sequence} data-pulse-activity={work.key} data-pulse-card={!!card}>
  <aside>
    <div class="brand"><span class="brand-icon app-brand-icon"><img src={appIcon} alt="ChatGPT Pulse 图标"/></span><div>ChatGPT<span>Pulse<span class="version"> / {version.split('.').slice(0,2).join('.')}</span></span></div></div>
    <nav aria-label="主导航">{#each tabs as item}<button class:selected={tab===item[0]} onclick={()=>openTab(item[0])}><span>{item[1]}</span>{item[2]}{#if tab===item[0]}<i></i>{/if}</button>{/each}</nav>

  </aside>
  <main>
    <header class="page-header"><h1>{tab==='overview'?'实时概览':tab==='history'?'本地记录':'偏好设置'}</h1></header>
    {#if error}<div class="error" role="alert">{error}<button onclick={()=>error=''} aria-label="关闭提示">×</button></div>{/if}
    {#if offlineTest}<div class="preview-note" role="status">隔离测试 · 模拟日志，不读取真实 Work</div>{/if}
    {#if !native}<div class="preview-note">浏览器预览 · 本地监测请使用桌面应用</div>{/if}
    {#if sample.source==='demo'}<div class="demo-banner"><b>合成演示</b>仅供预览，不代表真实模型速度。<button onclick={()=>control('pause')}>退出演示</button></div>{/if}
    {#if sourceStatus.warn}<div class="source-status" role="status" data-source-status={sourceStatus.state}><b>{sourceStatus.label}</b><span>{sourceStatus.detail}</span>{#if sourceStatus.count}<small>发现 {sourceStatus.count} 个兼容日志{sourceStatus.lastWrite?` · 最近写入 ${new Date(sourceStatus.lastWrite).toLocaleString('zh-CN')}`: ''}</small>{/if}</div>{/if}
    {#if !settings.locked}<div class="edit-notice" role="group" aria-label="悬浮条编辑"><span>悬浮条正在编辑 · 60 秒未移动自动完成</span><button class="secondary" onclick={()=>finishEdit(false)}>完成编辑</button><button class="quiet" onclick={()=>finishEdit(true)}>取消编辑</button></div>{/if}
    {#if tab==='overview'}
      <SessionList {sample} {clock} {settings} onselect={selectSession} onrename={(id,name)=>change('task_names',{...settings.task_names,[id]:name})}/>
      <details class="diagnostic-details"><summary>监测详情</summary><div class="diagnostic-body">
      <div class="log-picker"><label for="log-session">日志会话</label><select id="log-session" aria-label="日志会话" bind:value={selectedLog} disabled={active||settings.follow_latest}><option value="">{logs.length?'请选择会话':'未发现兼容日志'}</option>{#if selectionUnlisted}<option value={selectedLog}>…{selectedLog.replace(/\.jsonl$/,'').slice(-12)} · 暂未列出</option>{/if}{#each logs as f}<option value={f.id}>{new Date(f.modified).toLocaleString('zh-CN')} · …{f.label}</option>{/each}</select><button class="quiet" disabled={active} onclick={refreshLogs}>刷新列表</button></div>
      <div class="follow-row"><label><input type="checkbox" aria-label="自动跟随活跃日志" checked={settings.follow_latest} onchange={e=>change('follow_latest',e.currentTarget.checked)}/>自动跟随活跃日志</label><span>{settings.follow_latest?'优先跟随正在运行的兼容任务':'手动固定所选会话'}</span></div>
      <div class="poll-status" aria-label="检查状态"><span class="heartbeat-dot" class:running={active}></span><b>{number(settings.interval_ms/1000,1)} 秒检查</b><span>{heartbeat}</span><span>{usageAge===null?'尚无用量事件':`用量事件 ${Math.floor(usageAge)} 秒前`}</span></div>
      </div></details>
      <div class="session-toolbar"><span class="status-tag" class:working={work.animated}><i></i>{badge}</span><span class="session-detail">{sample.message}</span><div class="toolbar-actions"><button class="quiet" disabled={busy} onclick={()=>control('demo')}>查看演示</button><button class="primary" disabled={busy} onclick={()=>control(active?'pause':'live')}>{active?'暂停监测':'开始监测'}<span>{active?'Ⅱ':'↗'}</span></button></div></div>
      <section class="work-card" data-tone={work.tone} aria-label="工作状态">
        <div class="work-main"><span class="work-signal" class:working={work.animated} aria-hidden="true">{work.key==='completed'?'✓':['waiting_user','waiting_approval'].includes(work.key)?'!':work.key==='tool'?'⌘':work.key==='quiet'?'?':'◉'}</span><div><div class="work-eyebrow">{synthetic?'合成演示':'Work 日志'} · {work.confidence}{sample.monitored_sessions>1?` · ${sample.monitored_sessions} 个任务信号`:""}</div><h2>{work.label}</h2><p>{work.detail}</p></div></div>
        <div class="work-facts"><div><span>{sample.state==='running'?'本轮已进行':'本轮耗时'}</span><b>{work.elapsed}</b></div><div><span>最近活动</span><b>{work.ageText}</b></div></div>
      </section>
      <section class="pulse-panel" aria-label="活动脉冲"><div><b>活动脉冲</b><span>近 40 秒 · 每格 2 秒</span></div><PulseStrip cells={pulses}/></section>
      {#if card}<section class="completion-panel" aria-label="本轮结算"><div><b>{card.title}</b><span>{card.seconds} 秒后收起 · {synthetic?'合成样例':'日志结算'}</span></div><dl><div><dt>输出</dt><dd>{number(card.output_tokens,0)} Token</dd></div><div><dt>耗时</dt><dd>{card.durationText}</dd></div><div><dt>本轮平均</dt><dd>{number(card.average_rate)} Token/s</dd></div></dl></section>{/if}
      <section class="metrics" aria-label="性能指标">
        <article class="metric main-metric" class:held={displayedRate.held}><div class="metric-label">{displayedRate.label} <span class="tag" class:estimate={synthetic} class:measured={!synthetic}>{synthetic?'合成':'计算'}</span></div><div class="metric-number">{number(displayedRate.value)}<small>Token/s</small></div><p class="rate-summary" title={displayedRate.note}>{displayedRate.held?`上次报告 · ${Math.floor((clock-(sample.rate_updated_at||clock))/1000)} 秒前`:synthetic?'演示数据':displayedRate.value===null?displayedRate.short:'日志区间速率'}</p><span class="metric-watermark">⌁</span></article>
        <article class="metric" data-usage-scope={usage.scope}><div class="metric-label">{usage.label} <span class="tag measured">{tag}</span></div><div class="metric-number">{number(usage.output,0)}<small>Token</small></div>{#if usage.note}<p>{usage.note}</p>{/if}</article>
        <article class="metric"><div class="metric-label">其中推理用量 <span class="tag measured">{tag}</span></div><div class="metric-number">{number(usage.reasoning,0)}<small>Token</small></div><p>已包含在输出中{usage.scope==='session'?' · 会话累计':''}</p></article>
      </section>
      <section class="activity-panel" aria-label="最近活动轨迹"><div class="section-top"><div><h2>最近活动</h2></div></div>{#if sample.activities?.length}<ol>{#each [...sample.activities].reverse() as event}<li><span class="activity-mark"></span><b>{eventLabel(event.kind)}</b><time>{new Date(event.at).toLocaleTimeString('zh-CN',{hour12:false})}</time></li>{/each}</ol>{:else}<p class="activity-empty">暂无活动</p>{/if}</section>
      {#if values.some(v=>Number.isFinite(v))}<section class="chart-panel"><div class="section-top"><div><h2>任务的节奏</h2><p>最近 90 条已结束任务 · 每条记录只计一次</p></div><span class="chart-legend"><i></i>{synthetic?'合成数据':'任务平均 Token/s'}</span></div><div class="chart"><div class="chart-grid"><span>高速</span><span>中速</span><span>0</span></div><svg viewBox="0 0 800 180" preserveAspectRatio="none" aria-label="任务平均速率趋势"><path d={path} fill="none" stroke="#83eac5" stroke-width="2.3" vector-effect="non-scaling-stroke"/></svg></div><div class="chart-axis"><span>较早</span><span>包含推理、工具和等待，不是实时解码速度</span><span>最近</span></div></section>
      {/if}
      <details class="diagnostic-details"><summary>用量详情</summary>      <section class="details-grid compact-diagnostics"><article class="detail-panel"><h2>日志来源 <span class="tag measured">{tag}</span></h2><dl><div><dt>所选文件标识</dt><dd>{synthetic?'演示':selected?'…'+selected.label:'未选择'}</dd></div><div><dt>会话累计输出 / 推理</dt><dd>{number(sample.total_output_tokens,0)} / {number(sample.total_reasoning_tokens,0)}</dd></div><div><dt>{sample.state==='running'?'任务已过时长':'已结束任务耗时'}</dt><dd>{number(sample.state==='running'?sample.running_seconds:sample.observed_seconds)} 秒</dd></div><div><dt>已结束任务均速</dt><dd>{number(sample.rate)} Token/s</dd></div><div><dt>最近用量 / 任务事件</dt><dd>{sample.log_updated_at?new Date(sample.log_updated_at).toLocaleString('zh-CN'):'尚未读取'}</dd></div></dl></article></section></details>
    {:else if tab==='history'}
      <section class="panel history-panel"><div class="section-top"><h2>任务记录</h2>{#if history.length}<button class="danger" disabled={clearingHistory} onclick={clear}>清空记录</button>{/if}</div>
      {#if history.length}<div class="table-wrap"><table><thead><tr><th>时间</th><th>任务耗时</th><th>输出 / 推理</th><th>平均速率</th><th>来源 / 结果</th></tr></thead><tbody>{#each history as row}<tr><td>{new Date(row.started_at).toLocaleString('zh-CN')}</td><td>{number(row.duration)} 秒</td><td>{number(row.output_tokens,0)} / {number(row.reasoning_tokens,0)}</td><td>{number(row.average_rate)} Token/s</td><td>{row.source==='logs'?'日志 · '+(row.reason==='completed'?'已完成':'已中止'):'旧版界面估算'}</td></tr>{/each}</tbody></table></div>{:else}<div class="empty-history"><h3>{settings.keep_history?'暂无记录':'记录未开启'}</h3>{#if !settings.keep_history}<button class="secondary" onclick={()=>change('keep_history',true)}>开启记录</button>{/if}</div>{/if}</section>
    {:else if tab==='settings'}
      <Appearance {settings} {change} onsettings={receiveSettings}/>
      <section class="panel settings-panel"><h2>自动运行</h2><div class="setting-row"><div><b>打开 Pulse 后自动监测</b></div><input aria-label="打开 Pulse 后自动监测" type="checkbox" checked={settings.auto_monitor} onchange={e=>change('auto_monitor',e.currentTarget.checked)}/></div>{#if startup.supported}<div class="setting-row"><div><b>随 GPT 启动</b><p>GPT 启动时自动打开 Pulse</p>{#if startup.installed&&!startup.loaded}<p class="warning">启动项存在但未加载；可关闭后重新开启，或检查系统登录项。</p>{/if}</div><input aria-label="随 GPT 启动" type="checkbox" disabled={busy||!startup.supported} checked={startup.installed&&startup.loaded} onchange={e=>setWatch(e.currentTarget.checked)}/></div>{/if}</section>
      <section class="panel settings-panel"><h2>悬浮条</h2><div class="setting-row"><div><b>显示悬浮条</b></div><input aria-label="显示悬浮条" type="checkbox" checked={settings.overlay_enabled} onchange={e=>change('overlay_enabled',e.currentTarget.checked)}/></div><div class="setting-row"><div><b>鼠标靠近时渐隐</b><p>移开鼠标后恢复显示</p></div><input aria-label="鼠标靠近时渐隐" type="checkbox" checked={settings.hover_hide} onchange={e=>change('hover_hide',e.currentTarget.checked)}/></div><div class="setting-row"><div><b>调整位置</b><p>拖动头像移动；Esc 取消编辑</p>{#if shortcutError}<p class="warning">{shortcutError}；仍可使用右侧按钮。</p>{/if}</div><button class="secondary" onclick={edit}>编辑悬浮条 ↗</button></div><div class="setting-row"><div><b>显示菜单栏图标</b><p>关闭窗口后继续在后台运行</p></div><input aria-label="显示菜单栏图标" type="checkbox" checked={settings.tray_enabled} onchange={e=>change('tray_enabled',e.currentTarget.checked)}/></div></section>
      <section class="panel settings-panel"><h2>采样与隐私</h2><div class="setting-row"><div><b>保留本地记录</b><p>保存已结束任务的数字摘要</p></div><input aria-label="保留本地记录" type="checkbox" checked={settings.keep_history} onchange={e=>change('keep_history',e.currentTarget.checked)}/></div><div class="setting-row"><div><b>保留天数</b></div><select aria-label="保留天数" value={String(settings.retention_days)} onchange={e=>change('retention_days',Number(e.currentTarget.value))}><option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option></select></div><div class="setting-row"><div><b>自动适应日志节奏</b><p>根据上报节奏调整速率保留时间</p></div><input aria-label="自动适应日志节奏" type="checkbox" checked={settings.adaptive_retention} onchange={e=>change('adaptive_retention',e.currentTarget.checked)}/></div><div class="setting-row"><div><b>完成结算卡</b><p>结束时显示任务摘要</p></div><input aria-label="完成结算卡" type="checkbox" checked={settings.completion_card} onchange={e=>change('completion_card',e.currentTarget.checked)}/></div><div class="setting-row"><div><b>无活动后隐藏旧速率</b><p>到期隐藏旧速率</p></div><select aria-label="无活动后隐藏旧速率" value={String(settings.rate_idle_seconds??30)} onchange={e=>change('rate_idle_seconds',Number(e.currentTarget.value))}><option value="15">15 秒</option><option value="30">30 秒（默认）</option><option value="60">60 秒</option><option value="120">120 秒</option></select></div><div class="setting-row"><div><b>采样间隔</b></div><select aria-label="采样间隔" value={String(settings.interval_ms)} onchange={e=>change('interval_ms',Number(e.currentTarget.value))}><option value="500">0.5 秒</option><option value="1000">1 秒</option><option value="2000">2 秒</option><option value="3000">3 秒</option></select></div></section>

    {/if}
    <footer><span>v{version}</span></footer>
  </main>
</div>
{/if}
