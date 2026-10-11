import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewerResultSqlStdin, MAX_SQL_INPUT_BYTES } from './research-reviewer-result-psql-transport.mjs';

const fixture = new URL('./research-reviewer-result-psql-child-fixture.py', import.meta.url).pathname;
const run = (mode, input = '', options) => reviewerResultSqlStdin('/usr/bin/python3', ['-I', '-S', fixture, mode], input, options);
const consume = 'consume';

test('SQL larger than Linux single-argv limit travels entirely through stdin', async () => {
  const input = 'SELECT ' + '字'.repeat(100000) + ';';
  const result = await run(consume, input);
  assert.deepEqual(JSON.parse(result.stdout), { bytes: Buffer.byteLength(input), args: [] });
  assert.equal(result.stderr, '');
});
test('exact four-MiB input accepted; +1 UTF-8 byte rejected before spawn', async () => {
  assert.equal(JSON.parse((await run(consume, 'x'.repeat(MAX_SQL_INPUT_BYTES))).stdout).bytes, MAX_SQL_INPUT_BYTES);
  await assert.rejects(reviewerResultSqlStdin('/nonexistent-not-spawned', [], 'x'.repeat(MAX_SQL_INPUT_BYTES + 1)), /sql_input_limit/);
  await assert.rejects(run(consume, '字'.repeat(Math.floor(MAX_SQL_INPUT_BYTES / 3) + 1)), /sql_input_limit/);
});
test('nonzero child exit preserves native code, stdout and stderr', async () => {
  await assert.rejects(run('fail', 'SELECT bad;'), error => {
    assert.equal(error.code, 7); assert.equal(error.stdout, 'out'); assert.equal(error.stderr, 'sql failed'); return true;
  });
});
test('failed spawn propagates ENOENT without unhandled stdin errors', async () => {
  await assert.rejects(reviewerResultSqlStdin('/nonexistent-reviewer-result-psql', [], 'SELECT 1;'), { code: 'ENOENT' });
});
test('closed stdin propagates pipe failure even when child exits successfully', async () => {
  await assert.rejects(run('pipe-closed', 'x'.repeat(MAX_SQL_INPUT_BYTES)), error => {
    assert.ok(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED'].includes(error.code)); return true;
  });
});
test('stdout buffer cap rejects rather than truncating success', async () => {
  await assert.rejects(run('stdout-cap'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
});
test('stderr buffer cap rejects rather than truncating success', async () => {
  await assert.rejects(run('stderr-cap'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
});
test('stalled child retains bounded timeout and killed exit', async () => {
  const start = performance.now();
  await assert.rejects(run('stall', '', { timeout: 50 }), error => {
    assert.equal(error.killed, true); assert.equal(error.signal, 'SIGTERM'); return true;
  });
  assert.ok(performance.now() - start < 2000);
});
test('blocked maximum stdin write is bounded and preserves timeout error', async () => {
  const start = performance.now();
  await assert.rejects(run('stall', 'x'.repeat(MAX_SQL_INPUT_BYTES), { timeout: 50 }), error => {
    assert.equal(error.killed, true); assert.equal(error.signal, 'SIGTERM'); return true;
  });
  assert.ok(performance.now() - start < 2000);
});
test('transport callers cannot widen original timeout or output cap', async () => {
  for (const options of [{ timeout: 6001 }, { maxBuffer: 1048577 }, { timeout: 0 }]) {
    await assert.rejects(run(consume, '', options), /transport_limits/);
  }
});
