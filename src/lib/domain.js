export const defaults = {dialogue_enabled:true,overlay_layout:"bar",theme:"mint",character:"mai",motion:"spark",animations:true,show_total:false,bubble_mode:"always",task_display:"separate",task_names:{},status_accessories:true,avatar_revision:0,revision:0,auto_monitor:true,follow_latest:true,pinned_log:null,overlay_position:null,tray_enabled: true, overlay_enabled: false, locked: true, hover_hide: true, keep_history: false, retention_days: 7, interval_ms: 1000,rate_idle_seconds:30,adaptive_retention:true,completion_card:true};
import {personalizationDefaults,cleanPersonalization} from './personalization.js';
Object.assign(defaults,personalizationDefaults);
export function cleanSettings(value = {}) {
  const out = {...defaults,...cleanPersonalization(value)};
  if(Number.isSafeInteger(value.revision)&&value.revision>=0)out.revision=value.revision;
  for (const key of ['tray_enabled','overlay_enabled','locked','hover_hide','keep_history','auto_monitor','follow_latest','adaptive_retention','completion_card','animations','show_total','dialogue_enabled','status_accessories']) if (typeof value[key] === 'boolean') out[key] = value[key];
  for (const [key,min,max] of [['retention_days',1,30],['interval_ms',500,3000],['rate_idle_seconds',10,120]]) if (Number.isFinite(value[key])) out[key] = Math.min(max,Math.max(min,Math.round(value[key])));
  if(typeof value.pinned_log==='string'&&value.pinned_log.length<240)out.pinned_log=value.pinned_log;
  if(Number.isInteger(value.overlay_position?.x)&&Number.isInteger(value.overlay_position?.y)&&Math.abs(value.overlay_position.x)<=100000&&Math.abs(value.overlay_position.y)<=100000)out.overlay_position={x:value.overlay_position.x,y:value.overlay_position.y};
  for(const [key,allowed] of Object.entries({overlay_layout:["bar","avatar"],theme:["mint","sakura","moon","ice","tea","spellbook"],character:["mai","roxy","custom","none"],motion:["spark","orbit","breath"],bubble_mode:["always","working"],task_display:["separate","combined"]}))if(allowed.includes(value[key]))out[key]=value[key];
  if(Number.isSafeInteger(value.avatar_revision)&&value.avatar_revision>=0)out.avatar_revision=value.avatar_revision;
  out.task_names=Object.fromEntries(Object.entries(value.task_names&&typeof value.task_names==='object'&&!Array.isArray(value.task_names)?value.task_names:{}).filter(([id,name])=>id.length>0&&id.length<240&&typeof name==='string').slice(0,512).map(([id,name])=>[id,Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f]/g,'')).slice(0,24).join('').trim()]).filter(([,name])=>name));
  return out;
}
export function emptySample() {return {task_unfinished:false,sessions:[],monitored_sessions:0,stream_epoch:0,retention_mode:"fixed",cadence_samples:0,expected_report_seconds:null,pulses:[],completion:null,activity_status:"unknown",activity_at:null,activity_age_seconds:null,pending_tools:0,activities:[],checked_at:null,poll_sequence:0,usage_age_seconds:null,usage_updated_at:null,running_seconds:null,current_rate:null,rate_status:"unavailable",rate_interval_seconds:null,rate_updated_at:null,rate_idle_seconds:30,follow_latest:false,source: 'logs', state: 'paused', message: '选择日志会话后，读取实际用量', log_id:null, output_tokens:null,reasoning_tokens:null,total_output_tokens:null,total_reasoning_tokens:null,measurement_id:null,log_updated_at:null,rate: null, chars_per_second: null, models: [], observed_seconds: null, scan_ms: null, nodes: 0, network: 'unknown', timestamp: Date.now(), quality: 'unavailable'};}
export function number(value, digits = 1) {return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';}
export function linePath(values, width=800, height=180) {
  const max = Math.max(60,...values.filter(v=>Number.isFinite(v)));
  let pen=false;
  return values.map((v,i)=>{if(!Number.isFinite(v)){pen=false;return '';} const cmd=pen?'L':'M';pen=true;return `${cmd}${(i*width/Math.max(values.length-1,1)).toFixed(1)},${(height-12-v/max*(height-28)).toFixed(1)}`;}).filter(Boolean).join(' ');
}
export function demoSample(second) {
  const n=Math.floor(second/4),rate=Math.round((32+12*Math.sin(n/2))*10)/10;
  const phases=['processing','reasoning','tool','responding','waiting_user','completed'], index=Math.floor(second/4)%phases.length, now=Date.now();
  const activities=phases.slice(0,index+1).map((phase,i)=>({kind:['started','reasoning','tool_started','message','waiting_user','completed'][i],at:now-(index-i)*4000}));
  return {...emptySample(),retention_mode:'adaptive',cadence_samples:index,expected_report_seconds:index>=3?20:null,rate_idle_seconds:index>=3?40:30,pulses:activities.map(e=>({at:Math.floor(e.at/2000)*2000,last_at:e.at,count:1,kind:e.kind})),completion:index===5?{id:`demo:${n}`,ended_at:now-(second%4)*1000,output_tokens:Math.round(rate*10),duration:10,average_rate:rate,reason:'completed'}:null,activity_status:phases[index],activity_at:now,activity_age_seconds:0,pending_tools:index===2?1:0,running_seconds:second%24,activities:phases.slice(0,index+1).map((phase,i)=>({kind:['started','reasoning','tool_started','message','waiting_user','completed'][i],at:now-(index-i)*4000})),source:'demo',state:index===5?'completed':'running',message:'合成任务记录；不是客户端数据',rate,output_tokens:Math.round(rate*10),reasoning_tokens:80,total_output_tokens:Math.round(rate*10),total_reasoning_tokens:80,observed_seconds:10,measurement_id:`demo:${n}`,quality:'synthetic'};
}

export function rateDisplay(sample,clock=Date.now()){
  const reference=Math.max(clock,sample.checked_at||0), at=sample.rate_updated_at;
  const age=Number.isFinite(at)&&reference>=at?(reference-at)/1000:null;
  const meta={held:false,age,ageText:age===null?'尚无有效速率':`${duration(age)}前上报`};
  if(sample.source==='demo')return {...meta,value:sample.rate,label:'演示任务均速',short:'演示',ageText:'合成样例',note:'合成数据，不代表实际模型速度'};
  const label='日志区间速率';
  if(['paused','loading','unavailable','incomplete'].includes(sample.state))return {...meta,value:null,label,short:'不可获取',note:sample.state==='paused'?'已暂停监测':'等待有效的日志用量与时间'};
  if(sample.checked_at&&clock-sample.checked_at>5000)return {...meta,value:null,label,short:'监测未更新',note:'检查结果已过期；不能将旧速度视为当前速度'};
  if(sample.rate_status==='idle')return {...meta,value:0,label,short:'已结束',ageText:'本轮已结束',note:'已收到结束事件；最终均速单独保留'};
  if(sample.rate_status==='insufficient_interval')return {...meta,value:null,label,short:'区间过短',note:'日志用量区间不足 100 毫秒；计数有效，暂不计算速率'};
  if(sample.rate_status==='no_recent_usage')return {...meta,value:null,label,short:'等待上报',note:'没有可用的近期输出区间；速率未知，不代表模型已停止'};
  if(['reported_interval','held_interval'].includes(sample.rate_status)&&Number.isFinite(sample.current_rate)){
    const held=sample.rate_status==='held_interval';
    return {...meta,held,value:sample.current_rate,label:held?'上次报告速率':label,short:held?'上次报告':'日志区间',note:held?`保留上次区间值 · ${meta.ageText}；非当前生成速度`:`最近 ${number(sample.rate_interval_seconds)} 秒上报区间的均速；非瞬时速度`};
  }
  return {...meta,value:null,label,short:'等待数据',note:'缺少完整基线或有效上报时间'};
}
export function pollLabel(sample,clock=Date.now()){
  if(sample.state==='paused')return '已暂停检查';
  if(!sample.checked_at)return '等待首次检查';
  return `已检查 ${sample.poll_sequence} 次 · ${Math.max(0,Math.floor((clock-sample.checked_at)/1000))} 秒前`;
}

export function duration(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return '—';
  const n=Math.floor(seconds);return n<60?`${n} 秒`:n<3600?`${Math.floor(n/60)} 分 ${n%60} 秒`:`${Math.floor(n/3600)} 时 ${Math.floor(n%3600/60)} 分`;
}
const eventNames={started:'任务开始',reasoning:'推理记录更新',message:'回复记录更新',tool_started:'工具开始',tool_finished:'工具返回',usage:'输出用量更新',waiting_approval:'请求批准',waiting_user:'请求回答',retrying:'连接重试',completed:'任务完成',aborted:'任务中止'};
export function eventLabel(kind){return eventNames[kind]||'状态记录';}
export function statusDisplay(sample,clock=Date.now()){
  const reference=Math.max(clock,sample.checked_at||0);
  const age=sample.activity_at!==null&&Number.isFinite(sample.activity_at)&&reference>=sample.activity_at?(reference-sample.activity_at)/1000:null;
  let key=sample.activity_status||'unknown';
  if(sample.state==='paused')key='paused';
  else if(['unavailable','incomplete','loading'].includes(sample.state))key=sample.state;
  else if(sample.source!=='demo'&&sample.checked_at&&clock-sample.checked_at>5000)key='disconnected';
  else if(sample.state==='waiting')key=sample.log_id?'unknown':'waiting';
  else if(sample.source!=='demo'&&age===null)key='unknown';
  else if(sample.state==='running'&&age!==null&&age>=30&&!['waiting_user','waiting_approval'].includes(key))key='quiet';
  const states={
    processing:['处理中','已记录任务开始或后续进展，尚未收到结束事件。','green',true],
    reasoning:['推理有进展','日志新增推理记录；无需等到 Token 用量上报。','green',true],
    responding:['回复有更新','日志新增回复记录；不表示能逐字读取实时输出。','green',true],
    tool:['工具处理中',`日志中尚有 ${sample.pending_tools||1} 个工具调用未匹配返回记录。`,'blue',true],
    waiting_user:['需要你回答','检测到明确的提问事件，请回到客户端查看。','amber',false],
    waiting_approval:['等待你批准','检测到明确的批准请求，请回到客户端查看。','amber',false],
    retrying:['正在重试','日志报告连接或流重试；并非已经失败。','amber',false],
    quiet:['状态待确认','30 秒没有新活动记录，尚未收到结束事件；可能仍在推理或等工具，不能判定卡死。','amber',false],
    completed:['本轮已完成','已收到匹配的任务完成事件。','green',false],
    aborted:['本轮已中止','已收到匹配的任务中止事件。','muted',false],
    paused:['监测已暂停','点击开始监测后恢复检查。','muted',false],
    waiting:['未收到任务信号','尚未读取到当前 Work 的任务事件，当前状态未知。','muted',false],
    loading:['正在读取','正在建立日志基线。','muted',false],
    unavailable:['无法读取','日志不可读取；当前工作状态未知。','amber',false],
    incomplete:['状态未知','记录不完整，无法可靠判断当前任务状态。','amber',false],
    disconnected:['监测未更新','已超过 5 秒没有检查结果，请查看 Pulse 是否正常运行。','amber',false],
    unknown:['等待任务信号','没有可靠的任务生命周期信号；不能将它当成空闲。','muted',false]
  };
  const [label,detail,tone,animated]=states[key]||states.unknown;
  const events=sample.activities||[],last=events.at(-1);
  return {key,label,detail,tone,animated,age,ageText:age===null?'活动时间未知':`${duration(age)}前有活动`,lastEvent:last?eventLabel(last.kind):'尚无活动记录',confidence:sample.source==='demo'?'合成演示':['quiet','unknown','incomplete','unavailable','disconnected','paused','waiting','loading'].includes(key)?'待确认':'日志事件',elapsed:duration(sample.state==='running'?sample.running_seconds:sample.observed_seconds)};
}

export function acceptSample(current,next){
  if(!next)return false;
  const a=current.stream_epoch||0,b=next.stream_epoch||0;
  if(a!==b)return b>a;
  const x=current.poll_sequence||0,y=next.poll_sequence||0;
  if(x!==y)return y>x;
  return (next.checked_at||0)>=(current.checked_at||0);
}
export function pulseCells(sample,clock=Date.now()){
  const end=Math.max(clock,sample.checked_at||0),bucket=Math.floor(end/2000)*2000;
  return Array.from({length:20},(_,i)=>{
    const at=bucket-(19-i)*2000,p=(sample.pulses||[]).find(p=>p.at===at&&(p.last_at??p.at)<=end);
    return {at,count:p?.count||0,kind:p?.kind||'',age:Math.max(0,Math.floor((end-at)/1000))};
  });
}
export function completionDisplay(sample,clock=Date.now()){
  const c=sample.completion,reference=Math.max(clock,sample.checked_at||0);
  if(!c||!['completed','aborted'].includes(sample.state)||!Number.isFinite(c.ended_at)||reference<c.ended_at||reference-c.ended_at>=12000)return null;
  if(sample.checked_at&&clock-sample.checked_at>5000&&sample.source!=='demo')return null;
  return {...c,title:c.reason==='aborted'?'本轮中止结算':'本轮完成结算',seconds:Math.ceil((12000-reference+c.ended_at)/1000),durationText:duration(c.duration)};
}

// Late bootstrap, IPC responses, and window events cannot undo newer preferences.
export function acceptSettings(current,next){return !!next&&(next.revision||0)>=(current.revision||0);}
