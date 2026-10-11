import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudArticleFixture } from '../../../scripts/fixtures/research-cloud-article.ts';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { createCloudWork, validateCloudWork, createCloudResult, recomputeCloudArticle, verifyCloudResult } from './research-cloud-work.ts';
const now = '2026-10-04T00:10:00Z';
function result() {
  const work = cloudArticleFixture();
  return { work, result: createCloudResult({ work, sourceCommit: work.sourceCommit,
    startedAt: '2026-10-04T00:01:00Z', completedAt: now, status: 'completed', output: recomputeCloudArticle(work, now) }) };
}
function reseal(work: ReturnType<typeof cloudArticleFixture>) {
  const { schemaVersion: _schema, workHash: _hash, ...input } = work;
  void _schema; void _hash;
  return createCloudWork(input);
}
function resealResult(value: ReturnType<typeof result>['result']) {
  const { resultHash: _hash, ...payload } = value;
  void _hash;
  return { ...payload, resultHash: researchCanonicalHash(payload) };
}
test('portable Cloud recomputation shares publication math but grants no publication or strategy authority', () => {
  const pair = result();
  const receipt = verifyCloudResult(pair.work, pair.result, now);
  assert.equal(receipt.status, 'verified_for_existing_submission');
  assert.equal(receipt.dataScope, 'synthetic_acceptance');
  assert.equal(receipt.authoritativePublication, false);
  assert.equal(receipt.strategyApproved, false);
  assert.equal(receipt.requiresLiveReservationCheck, true);
  const output = recomputeCloudArticle(pair.work, now);
  assert.equal(output.scenarios[0].totalEps, 0.6);
  assert.equal(output.scenarios[0].baselineReportedEps, 0.7);
  assert.equal(output.scenarios[1].incrementalEps, 0.128);
  assert.ok(Math.abs(output.scenarios[1].presentValue! - 14.56 / 1.1 ** 2) < 1e-12);
});
test('altered binding, role and input bytes cannot travel between jobs, versions or owners', () => {
  for (const key of ['workHash', 'sourceCommit', 'jobId', 'attempt', 'role', 'owner', 'reservationId'] as const) {
    const pair = result();
    (pair.result as unknown as Record<string, unknown>)[key] = key === 'attempt' ? 2 : 'changed';
    assert.throws(() => verifyCloudResult(pair.work, resealResult(pair.result), now), /identity_mismatch/);
  }
  const work = cloudArticleFixture(); work.role = 'company_research';
  assert.throws(() => reseal(work), /binding_invalid/);
  const modified = cloudArticleFixture(); modified.input.extra = 'unsealed';
  assert.throws(() => validateCloudWork(modified), /hash_mismatch/);
  assert.throws(() => createCloudResult({ work: cloudArticleFixture(), sourceCommit: 'b'.repeat(40), startedAt: now,
    completedAt: now, status: 'completed', output: {} }), /source_commit_mismatch/);
});
test('original expiry, Taipei midnight and future evidence are enforced without moving the cutoff', () => {
  const pair = result();
  assert.throws(() => verifyCloudResult(pair.work, pair.result, pair.work.deadlineAt), /deadline_invalid/);
  pair.result.startedAt = '2026-10-03T23:59:59Z';
  assert.throws(() => verifyCloudResult(pair.work, resealResult(pair.result), now), /deadline_invalid/);
  const midnight = cloudArticleFixture(); midnight.issuedAt = '2026-10-04T15:50:00Z'; midnight.deadlineAt = '2026-10-04T16:05:00Z';
  assert.throws(() => reseal(midnight), /binding_invalid/);
  const future = cloudArticleFixture(); future.evidence[0].observedAt = '2026-10-04T00:00:00Z';
  assert.throws(() => reseal(future), /evidence_invalid/);
});
test('secret-like fields, credential URLs, metadata substitution and excessive input are rejected', () => {
  for (const key of ['authorization', 'cookie', 'password', 'api_key', 'auth.json']) {
    const work = cloudArticleFixture(); work.input[key] = 'sensitive';
    assert.throws(() => reseal(work), /forbidden_field/);
  }
  const privateUrl = cloudArticleFixture(); privateUrl.evidence[0].sourceUrl = 'https://example.org/a?access_token=x';
  assert.throws(() => reseal(privateUrl), /evidence_invalid/);
  const hash = cloudArticleFixture(); hash.evidence[0].content += 'changed';
  assert.throws(() => reseal(hash), /evidence_invalid/);
  const huge = cloudArticleFixture(); huge.input.text = 'x'.repeat(200001);
  assert.throws(() => reseal(huge), /secret_or_text_bound/);
  const optional = cloudArticleFixture(); optional.input.undefinedValue = undefined;
  assert.throws(() => reseal(optional), /non_json_value/);
});
test('withdrawal, private citation and disguised source identifiers cannot pass accounting validation', () => {
  for (const change of [{ retracted: true }, { publicCitation: false }, { sourceUrl: 'https://example.org/another' }]) {
    const work = cloudArticleFixture(); Object.assign((work.input.documents as object[])[0], change);
    assert.throws(() => recomputeCloudArticle(reseal(work), now), /not_usable|not_bound/);
  }
});
test('recomputed EPS, discounting, negative earnings and fabricated commercialization stay consistent', () => {
  const pair = result();
  (pair.result.output.scenarios as Array<{ presentValue: number }>)[1].presentValue = 999;
  assert.throws(() => verifyCloudResult(pair.work, resealResult(pair.result), now), /recomputed_result_mismatch/);
  const work = cloudArticleFixture();
  const article = work.input.article as { scenarios: Array<{ baselineEps: number; baselineBridge: { otherOperatingIncomeMillions: number } }> };
  for (const row of article.scenarios) { row.baselineEps = -0.5; row.baselineBridge.otherOperatingIncomeMillions = -1250; }
  assert.equal(recomputeCloudArticle(reseal(work), now).scenarios[2].presentValue, null);
  const fake = cloudArticleFixture();
  (fake.input.article as { scenarios: Array<{ commercialization?: unknown }> }).scenarios[1].commercialization = null;
  assert.throws(() => recomputeCloudArticle(reseal(fake), now), /commercialization_inputs_missing/);
});
