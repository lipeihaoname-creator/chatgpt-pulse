import test from 'node:test';
import assert from 'node:assert/strict';
import { bundleWithRetry } from '../scripts/windows-bundle.mjs';

test('NSIS sharing violation retries and preserves the first failure', async () => {
  const waits = [];
  const result = await bundleWithRetry(async number => ({
    exit_code: number === 1 ? 1 : 0,
    output: number === 1 ? 'failed to bundle project: (os error 32)' : 'Finished 1 bundle',
    log: `attempt-${number}.txt`,
  }), async ms => waits.push(ms));
  assert.equal(result.exit_code, 0);
  assert.deepEqual(result.attempts.map(item => item.sharing_violation), [true, false]);
  assert.deepEqual(result.attempts.map(item => item.log), ['attempt-1.txt', 'attempt-2.txt']);
  assert.deepEqual(waits, [2000]);
});

test('Persistent sharing violation stops after three failed attempts', async () => {
  let count = 0;
  const result = await bundleWithRetry(async () => {
    count += 1;
    return { exit_code: 1, output: '(os error 32)', log: `attempt-${count}.txt` };
  }, async () => {});
  assert.equal(count, 3);
  assert.equal(result.exit_code, 1);
});

test('Other errors and successful output mentioning error 32 do not retry', async () => {
  for (const [exit_code, output] of [[1, '(os error 623)'], [1, '(os error 10013)'], [1, '(os error 320)'], [0, 'previous: (os error 32)']]) {
    const result = await bundleWithRetry(async () => ({ exit_code, output }), async () => assert.fail('unexpected retry'));
    assert.equal(result.attempts.length, 1);
    assert.equal(result.exit_code, exit_code);
  }
});
