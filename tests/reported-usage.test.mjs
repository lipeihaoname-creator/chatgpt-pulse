import test from 'node:test';
import assert from 'node:assert/strict';
import {reportedUsage} from '../src/lib/reported-usage.js';

test('first-turn usage keeps session provenance without inventing a task baseline', () => {
  const sample = {output_tokens:null,reasoning_tokens:null,total_output_tokens:3151,total_reasoning_tokens:467};
  const shown = reportedUsage(sample);
  assert.equal(shown.scope,'session');
  assert.equal(shown.label,'会话累计输出');
  assert.equal(shown.output,3151);
  assert.equal(shown.reasoning,467);
  assert.equal(sample.output_tokens,null);
});
test('an actual zero task count wins and never borrows session reasoning', () => {
  const shown = reportedUsage({output_tokens:0,reasoning_tokens:null,total_output_tokens:900,total_reasoning_tokens:80});
  assert.equal(shown.scope,'task');
  assert.equal(shown.output,0);
  assert.equal(shown.reasoning,null);
});
test('switching to an unreadable source clears usage instead of retaining earlier counts', () => {
  reportedUsage({total_output_tokens:100});
  for(const sample of [{},{output_tokens:-1,total_output_tokens:NaN},{total_output_tokens:'100'}]) {
    assert.equal(reportedUsage(sample).scope,'unknown');
    assert.equal(reportedUsage(sample).output,null);
  }
});
