import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveConfiguredResearchControllerPrincipals,
  validateResearchExecutionObservation,
  validateSavedResearchExecutionObservation,
} from '../web/src/lib/research-execution-binding.ts';

// Isolated synthetic credentials and controller reports, never actual role proof.
const keys = { INTERNAL_API_KEY: 'saved-fixture-author', RESEARCH_REVIEW_KEY: 'saved-fixture-reviewer',
  CRON_SECRET: 'saved-fixture-cron', RESEARCH_TEST_KEY: 'saved-fixture-test', STRATEGY_APPROVAL_KEY: 'saved-fixture-strategy' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = n => String(n).repeat(64);
const at = n => `2026-10-09T00:00:${String(n).padStart(2, '0')}.000001Z`;
function fixture(role = 'author') {
  const pair = resolveConfiguredResearchControllerPrincipals(keys); assert.equal(pair.ok, true);
  const expected = { assignmentId: id(1), jobId: id(2), attempt: 1, reservationId: id(3), inputRevisionId: id(4),
    inputHash: hash(1), articleHash: hash(2), reviewPackHash: role === 'reviewer' ? hash(3) : null, outputHash: hash(4),
    role, principalId: role === 'author' ? pair.authorPrincipalId : pair.reviewerPrincipalId,
    workOwner: 'saved-original-owner', originalLeaseOwner: 'saved-original-owner',
    reservationRole: role === 'author' ? 'company_research' : 'counter_review',
    assignedAt: at(10), reservationStartedAt: at(5), reservationExpiresAt: at(50), originalJobDeadline: at(45),
    receivedAt: at(30), articleAuthoredAt: role === 'reviewer' ? at(15) : null,
    author: role === 'reviewer' ? { principalId: pair.authorPrincipalId, threadId: id(9), invocationId: 'saved-author-invocation' } : null,
    usedInvocationIds: [] };
  const observation = { version: 'research_execution_observation_v2', assignmentId: id(1), jobId: id(2), attempt: 1,
    reservationId: id(3), inputRevisionId: id(4), inputHash: hash(1), articleHash: hash(2), reviewPackHash: expected.reviewPackHash,
    outputHash: hash(4), verificationLevel: 'trusted_controller_observation', providerSurface: 'codex_cross_chat',
    hostId: 'synthetic-durable', threadId: id(5), turnId: id(6), invocationId: 'saved-current-invocation',
    dispatchObservationHash: hash(5), completionObservationHash: hash(6),
    controllerObservedStartAt: at(20), controllerObservedEndAt: at(25), modelIdentity: null };
  const request = new Request('http://localhost/fixture', { headers: { authorization:
    `Bearer ${role === 'author' ? keys.INTERNAL_API_KEY : keys.RESEARCH_REVIEW_KEY}` } });
  return { expected, observation, request };
}
const saved = (f, config = keys) => validateSavedResearchExecutionObservation(f.expected, f.observation, config);
const received = (f, config = keys) => validateResearchExecutionObservation(f.request, f.expected, f.observation, config);

test('RSO01 saved author and reviewer original reports equal authenticated structural results without a Request', () => {
  for (const role of ['author', 'reviewer']) {
    const f = fixture(role), before = structuredClone(f.observation), result = saved(f);
    assert.equal(result.ok, true); assert.deepEqual(result, received(f));
    assert.deepEqual(result.observation, before); assert.notEqual(result.observation, f.observation);
    assert.deepEqual(f.observation, before);
  }
});
test('RSO02 saved validation cannot substitute for actual receive authentication', () => {
  for (const role of ['author', 'reviewer']) for (const authorization of [null, 'Bearer wrong',
    `Bearer ${role === 'author' ? keys.RESEARCH_REVIEW_KEY : keys.INTERNAL_API_KEY}`]) {
    const f = fixture(role); f.request = new Request('http://localhost/fixture', { headers: authorization ? { authorization } : {} });
    assert.equal(saved(f).ok, true);
    assert.deepEqual(received(f), { ok: false, error: 'research_controller_unauthorized' });
  }
});
test('RSO03 absent or aliased current role configuration and unknown role fail closed', () => {
  const configs = [{}, { INTERNAL_API_KEY: keys.INTERNAL_API_KEY },
    { ...keys, RESEARCH_REVIEW_KEY: keys.INTERNAL_API_KEY }];
  for (const other of ['CRON_SECRET', 'RESEARCH_TEST_KEY', 'STRATEGY_APPROVAL_KEY']) {
    configs.push({ ...keys, [other]: keys.INTERNAL_API_KEY }, { ...keys, [other]: keys.RESEARCH_REVIEW_KEY });
  }
  for (const role of ['author', 'reviewer']) for (const config of configs) {
    assert.deepEqual(saved(fixture(role), config), { ok: false, error: 'research_controller_authority_unavailable' });
  }
  const f = fixture(); f.expected.role = 'publisher';
  assert.deepEqual(saved(f), { ok: false, error: 'research_controller_authority_unavailable' });
});
test('RSO04 key rotation cannot adopt an immutable role assignment', () => {
  for (const role of ['author', 'reviewer']) {
    const config = { ...keys, [role === 'author' ? 'INTERNAL_API_KEY' : 'RESEARCH_REVIEW_KEY']: 'synthetic-rotated-key' };
    assert.deepEqual(saved(fixture(role), config), { ok: false, error: 'research_execution_principal_mismatch' });
    const f = fixture(role); f.expected.principalId = hash(9);
    assert.deepEqual(saved(f), { ok: false, error: 'research_execution_principal_mismatch' });
  }
});
test('RSO05 shared validation preserves all hash, owner, clock, shape and invocation rejections', () => {
  const mutations = [
    f => { f.expected.originalLeaseOwner = 'other'; },
    f => { f.expected.reservationRole = 'technical_analysis'; },
    f => { f.observation.inputHash = hash(9); },
    f => { f.observation.jobId = id(99); },
    f => { f.observation.outputHash = hash(9); },
    f => { f.observation.assignmentId = id(99); },
    f => { f.observation.attempt = 2; },
    f => { f.observation.principalId = f.expected.principalId; },
    f => { f.observation.verificationLevel = 'platform_attestation'; },
    f => { delete f.observation.modelIdentity; },
    f => { f.observation = null; },
    f => { f.observation = []; },
    f => { f.expected.assignedAt = at(4); },
    f => { f.observation.controllerObservedStartAt = at(9); },
    f => { f.observation.controllerObservedEndAt = at(31); },
    f => { f.expected.receivedAt = at(45); },
    f => { f.expected.receivedAt = at(50); },
    f => { f.observation.controllerObservedEndAt = '2026-02-30T00:00:25Z'; },
    f => { f.observation.controllerObservedStartAt = '2026-10-09T00:00:10.000000Z'; },
    f => { f.expected.usedInvocationIds = [f.observation.invocationId]; },
  ];
  for (const role of ['author', 'reviewer']) for (const mutate of mutations) {
    const f = fixture(role); mutate(f); assert.equal(received(f).ok, false); assert.deepEqual(saved(f), received(f));
  }
});
test('RSO06 reviewer independence remains mandatory for saved observations', () => {
  for (const mutate of [
    f => { f.expected.author.principalId = f.expected.principalId; },
    f => { f.observation.threadId = f.expected.author.threadId; },
    f => { f.observation.invocationId = f.expected.author.invocationId; },
    f => { f.expected.articleAuthoredAt = at(21); },
    f => { f.expected.author = null; },
  ]) {
    const f = fixture('reviewer'); mutate(f);
    assert.deepEqual(saved(f), { ok: false, error: 'research_execution_not_independent' });
    assert.deepEqual(saved(f), received(f));
  }
});
test('RSO07 original microsecond receive boundary is preserved and current time cannot renew it', () => {
  const f = fixture('reviewer'); f.expected.originalJobDeadline = '2026-10-09T00:00:30.000002Z';
  assert.equal(saved(f).ok, true);
  f.expected.receivedAt = '2026-10-09T00:00:30.000002Z';
  assert.deepEqual(saved(f), { ok: false, error: 'research_execution_clock_invalid' });
  f.expected.receivedAt = '2026-10-10T00:00:00Z';
  assert.deepEqual(saved(f), { ok: false, error: 'research_execution_clock_invalid' });
});
test('RSO08 validation results contain no raw credential or authority flag', () => {
  const f = fixture(), result = saved(f); assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result).sort(), ['observation', 'ok', 'principalId']);
  for (const secret of Object.values(keys)) assert.equal(JSON.stringify(result).includes(secret), false);
});
