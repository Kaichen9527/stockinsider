import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShadowReplayInputs, shadowReplayConflicts } from './shadow-policy-v2.ts';

test('Shadow replay hashes only the frozen manifest universe', () => {
  assert.deepEqual(buildShadowReplayInputs(['2330'], [
    { symbol: '2454', stage: 'waiting', replayHash: 'late-source-change' },
    { symbol: '2330', stage: 'found', replayHash: 'stable' },
  ]), [{ symbol: '2330', stage: 'found', replayHash: 'stable' }]);
});

test('a changed publication payload is audit evidence, not a classification replay conflict', () => {
  assert.equal(shadowReplayConflicts({
    existingManifestId: 'manifest-1', existingReplayHash: 'same-classification', existingStatus: 'matched',
    manifestId: 'manifest-1', replayHash: 'same-classification',
  }), false);
  assert.equal(shadowReplayConflicts({
    existingManifestId: 'manifest-1', existingReplayHash: 'different-classification', existingStatus: 'matched',
    manifestId: 'manifest-1', replayHash: 'same-classification',
  }), true);
});
