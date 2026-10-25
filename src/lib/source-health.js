// File timestamps describe the source, never proof that GPT is idle.
export function sourceHealth(sample, logs = [], now = Date.now()) {
  const times = logs.map(row => row.modified).filter(at => Number.isFinite(at) && at > 0 && at <= now);
  const lastWrite = times.length ? Math.max(...times) : null;
  const common = { count: logs.length, lastWrite };
  if (sample.source === 'demo') return { ...common, state: 'demo', label: '合成演示', detail: '演示数据不代表真实 Work 状态。', warn: false };
  if (sample.state === 'paused') return { ...common, state: 'paused', label: '监测已暂停', detail: '', warn: false };
  if (sample.state === 'unavailable') return { ...common, state: 'unreadable', label: '日志读取失败', detail: '当前 Work 状态与 Token 用量未知。', warn: true };
  const recentActivity = sample.log_id && Number.isFinite(sample.activity_at) && sample.activity_at > 0 && now >= sample.activity_at && now - sample.activity_at < 120000;
  if (recentActivity) return { ...common, state: 'activity', label: '收到任务事件', detail: '状态来自兼容日志事件，不能据此识别所有 GPT 对话。', warn: false };
  if (sample.state === 'loading') return { ...common, state: 'loading', label: '正在核对日志', detail: '', warn: false };
  if (sample.log_id && sample.task_unfinished) return { ...common, state: 'uncertain', label: '任务状态未确认', detail: '没有近期任务事件，无法判断任务是否仍在运行。', warn: true };
  if (!logs.length) return { ...common, state: 'missing', label: '未接入当前 Work', detail: '尚未发现可读取的兼容日志，当前状态与 Token 用量未知。', warn: true };
  if (lastWrite === null || now - lastWrite >= 300000) return { ...common, state: 'stale', label: '未接入当前 Work', detail: '只发现较早的日志，没有当前任务信号；当前状态与 Token 用量未知。', warn: true };
  return { ...common, state: 'unverified', label: '尚未收到任务信号', detail: '发现近期日志文件，但尚无可确认当前 Work 状态的任务事件。', warn: true };
}
