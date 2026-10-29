import {emptySample} from './domain.js';
export function projectWorkSample(root,id,group=false){
 if(!id)return root;
 const row=(root.sessions||[]).find(s=>s.log_id===id)||(root.log_id===id?root:null);
 return {...(row||{...emptySample(),state:'unavailable',log_id:id,message:'该工作会话当前没有可用数据'}),music_idle_confirmed:root.music_idle_confirmed,overlay_log_id:root.overlay_log_id,sessions:group?(root.sessions||[]).filter(s=>s.log_id!==id):[],monitored_sessions:group?root.monitored_sessions:0,checked_at:root.checked_at,poll_sequence:root.poll_sequence,stream_epoch:root.stream_epoch,timestamp:root.timestamp,session_label:null};
}
