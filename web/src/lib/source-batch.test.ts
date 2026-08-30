import assert from 'node:assert/strict';
import test from 'node:test';
import { runIsolatedSourceBatch } from './source-batch.ts';

test('source batch attempts every active connector and conserves ordered terminal results', async () => {
  const attempted: string[] = [];
  const results = await runIsolatedSourceBatch(
    ['telegram', 'ptt', 'gdelt'],
    async (connector) => {
      attempted.push(connector);
      if (connector === 'ptt') throw new Error('ptt_parser_failed');
      return { connector, terminalReason: 'success' };
    },
    (connector) => ({ connector, terminalReason: 'failed' }),
  );
  assert.deepEqual(attempted, ['telegram', 'ptt', 'gdelt']);
  assert.deepEqual(results, [
    { connector: 'telegram', terminalReason: 'success' },
    { connector: 'ptt', terminalReason: 'failed' },
    { connector: 'gdelt', terminalReason: 'success' },
  ]);
});
