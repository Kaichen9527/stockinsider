import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpectedPttArticleMissing } from './ptt-policy.ts';

test('PTT article deletion races are skipped without masking provider failures', () => {
  assert.equal(isExpectedPttArticleMissing('http_404'), true);
  assert.equal(isExpectedPttArticleMissing('http_410'), true);
  assert.equal(isExpectedPttArticleMissing('http_429'), false);
  assert.equal(isExpectedPttArticleMissing('http_500'), false);
  assert.equal(isExpectedPttArticleMissing('timeout'), false);
  assert.equal(isExpectedPttArticleMissing('network'), false);
});
