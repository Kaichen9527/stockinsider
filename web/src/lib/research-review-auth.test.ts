import assert from 'node:assert/strict';
import test from 'node:test';
import { requireIndependentResearchReviewer } from './internal-auth.ts';

test('research qualification requires a separate bearer identity', () => {
  const original = {
    writer: process.env.INTERNAL_API_KEY, cron: process.env.CRON_SECRET,
    reviewer: process.env.RESEARCH_REVIEW_KEY,
  };
  try {
    process.env.INTERNAL_API_KEY = 'writer-test-secret';
    process.env.CRON_SECRET = 'cron-test-secret';
    process.env.RESEARCH_REVIEW_KEY = 'reviewer-test-secret';
    const req = (token: string, extra?: Record<string, string>) =>
      new Request('https://example.test/api/internal/research-thesis-review', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, ...extra },
      });
    assert.equal(requireIndependentResearchReviewer(req('reviewer-test-secret')), true);
    assert.equal(requireIndependentResearchReviewer(req('writer-test-secret')), false);
    assert.equal(requireIndependentResearchReviewer(req('reviewer-test-secret', { 'x-internal-key': 'anything' })), false);
    process.env.RESEARCH_REVIEW_KEY = 'writer-test-secret';
    assert.equal(requireIndependentResearchReviewer(req('writer-test-secret')), false);
    delete process.env.RESEARCH_REVIEW_KEY;
    assert.equal(requireIndependentResearchReviewer(req('reviewer-test-secret')), false);
  } finally {
    for (const [key, value] of Object.entries({
      INTERNAL_API_KEY: original.writer, CRON_SECRET: original.cron, RESEARCH_REVIEW_KEY: original.reviewer,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
