// Never substitute a session total for a task total without changing its label.
export function reportedUsage(sample = {}) {
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const task = count(sample.output_tokens);
  const session = !task && count(sample.total_output_tokens);
  return {
    scope: task ? 'task' : session ? 'session' : 'unknown',
    label: session ? '会话累计输出' : '任务输出',
    shortLabel: session ? '会话累计' : '输出',
    output: task ? sample.output_tokens : session ? sample.total_output_tokens : null,
    reasoning: task ? (count(sample.reasoning_tokens) ? sample.reasoning_tokens : null)
      : session ? (count(sample.total_reasoning_tokens) ? sample.total_reasoning_tokens : null) : null,
    note: session ? '本轮起始用量未知；此处为日志报告的整个会话累计值' : '',
  };
}
