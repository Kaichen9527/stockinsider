import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkCandidateFactIds } from './candidate-detail-fact-batches.ts';

test('candidate detail fact IDs are deduplicated into URL-safe bounded batches', () => {
  const ids = Array.from({ length: 105 }, (_, index) => `fact-${index + 1}`);
  const batches = chunkCandidateFactIds([...ids, ids[0]], 40);

  assert.deepEqual(batches.map((batch) => batch.length), [40, 40, 25]);
  assert.equal(new Set(batches.flat()).size, 105);
  assert.ok(batches.every((batch) => batch.length <= 40));
});

test('candidate detail rejects a batch size that could rebuild an oversized query', () => {
  assert.throws(() => chunkCandidateFactIds(['fact-1'], 51), /candidate_detail_fact_batch_size_invalid/u);
});
