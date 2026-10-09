import assert from 'node:assert/strict';
import test from 'node:test';
import { requireIndependentResearchReviewer, requireInternalAuth } from './internal-auth.ts';

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
    assert.equal(requireInternalAuth(req('reviewer-test-secret')).ok, false);
    assert.deepEqual(requireInternalAuth(req('reviewer-test-secret'), { allowResearchReviewer: true }),
      { ok: true, authSource: 'research_review_key' });
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

test('independent testing and human approval cannot share writer or each other identity', () => {
  const keys = ['INTERNAL_API_KEY', 'CRON_SECRET', 'RESEARCH_REVIEW_KEY', 'RESEARCH_TEST_KEY', 'STRATEGY_APPROVAL_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key, index) => { process.env[key] = `fixture-secret-${index}`; });
    const req = (token: string) => new Request('https://example.test', { headers: { authorization: `Bearer ${token}` } });
    const opts = { allowResearchReviewer: true, allowResearchTester: true, allowStrategyApprover: true };
    assert.deepEqual(requireInternalAuth(req(process.env.RESEARCH_TEST_KEY!), opts), { ok: true, authSource: 'research_test_key' });
    assert.deepEqual(requireInternalAuth(req(process.env.STRATEGY_APPROVAL_KEY!), opts), { ok: true, authSource: 'strategy_approval_key' });
    process.env.RESEARCH_TEST_KEY = process.env.STRATEGY_APPROVAL_KEY;
    assert.equal(requireInternalAuth(req(process.env.RESEARCH_TEST_KEY!), opts).ok, false);
    process.env.RESEARCH_TEST_KEY = process.env.INTERNAL_API_KEY;
    const writer = requireInternalAuth(req(process.env.RESEARCH_TEST_KEY!), opts);
    assert.deepEqual(writer, { ok: true, authSource: 'internal_api_key' });
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
