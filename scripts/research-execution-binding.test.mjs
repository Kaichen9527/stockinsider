import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveResearchControllerIdentity, validateResearchExecutionObservation } from '../web/src/lib/research-execution-binding.ts';

// Isolated synthetic keys/observations only. None proves actual product model execution.
const credentials = { INTERNAL_API_KEY: 'fixture-writer-only', RESEARCH_REVIEW_KEY: 'fixture-reviewer-only', CRON_SECRET: 'fixture-cron-only' };
const request = (key, extra = {}) => new Request('http://localhost/api/internal/fixture', {
  headers: { authorization: `Bearer ${key}`, ...extra },
});
const authorRequest = () => request(credentials.INTERNAL_API_KEY);
const reviewerRequest = () => request(credentials.RESEARCH_REVIEW_KEY);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = n => String(n).repeat(64);
const at = seconds => new Date(Date.UTC(2026, 9, 9, 0, 0, seconds)).toISOString();

function fixture(role = 'author') {
  const req = role === 'author' ? authorRequest() : reviewerRequest();
  const principal = resolveResearchControllerIdentity(req, role, credentials);
  assert.equal(principal.ok, true);
  const authorPrincipal = resolveResearchControllerIdentity(authorRequest(), 'author', credentials);
  const expected = {
    assignmentId: id(1), jobId: id(2), attempt: 1, reservationId: id(3), inputRevisionId: id(4),
    inputHash: hash(1), articleHash: hash(2), reviewPackHash: role === 'reviewer' ? hash(3) : null, outputHash: hash(4),
    role, principalId: principal.principalId, workOwner: 'original-private-owner', originalLeaseOwner: 'original-private-owner',
    reservationRole: role === 'author' ? 'company_research' : 'counter_review',
    assignedAt: at(10), reservationStartedAt: at(5), reservationExpiresAt: at(60), originalJobDeadline: at(55),
    receivedAt: at(30), articleAuthoredAt: role === 'reviewer' ? at(15) : null,
    author: role === 'reviewer' ? { principalId: authorPrincipal.principalId, threadId: id(9), invocationId: 'actual-author-tool-return' } : null,
    usedInvocationIds: [],
  };
  const observation = {
    version: 'research_execution_observation_v2', assignmentId: id(1), jobId: id(2), attempt: 1,
    reservationId: id(3), inputRevisionId: id(4), inputHash: hash(1), articleHash: hash(2),
    reviewPackHash: expected.reviewPackHash, outputHash: hash(4), verificationLevel: 'trusted_controller_observation',
    providerSurface: 'codex_cross_chat', hostId: 'durable-fixture', threadId: id(5), turnId: id(6),
    invocationId: 'actual-tool-return-id', dispatchObservationHash: hash(5), completionObservationHash: hash(6),
    controllerObservedStartAt: at(20), controllerObservedEndAt: at(25), modelIdentity: null,
  };
  return { req, expected, observation };
}
const validate = ({ req, expected, observation }, keys = credentials) =>
  validateResearchExecutionObservation(req, expected, observation, keys);
const rejects = (f, error) => assert.deepEqual(validate(f), { ok: false, error });

test('REB01 actual matched credentials resolve private role-separated controller principals', () => {
  const author = resolveResearchControllerIdentity(authorRequest(), 'author', credentials);
  const reviewer = resolveResearchControllerIdentity(reviewerRequest(), 'reviewer', credentials);
  assert.equal(author.ok, true); assert.equal(reviewer.ok, true);
  assert.match(author.principalId, /^[a-f0-9]{64}$/u);
  assert.notEqual(author.principalId, reviewer.principalId);
  assert.deepEqual(resolveResearchControllerIdentity(authorRequest(), 'author', credentials), author);
  for (const value of Object.values(credentials)) assert.equal(JSON.stringify(author).includes(value), false);
});

test('REB02 absent/shared writer-reviewer or cron-reviewer authority fails closed before authentication', () => {
  for (const keys of [{}, { INTERNAL_API_KEY: 'fixture' }, { RESEARCH_REVIEW_KEY: 'fixture' },
    { ...credentials, RESEARCH_REVIEW_KEY: credentials.INTERNAL_API_KEY },
    { ...credentials, RESEARCH_REVIEW_KEY: credentials.CRON_SECRET }]) {
    for (const role of ['author', 'reviewer']) assert.equal(
      resolveResearchControllerIdentity(authorRequest(), role, keys).error, 'research_controller_authority_unavailable');
  }
  assert.equal(resolveResearchControllerIdentity(authorRequest(), 'publisher', credentials).ok, false);
});

test('REB03 role swap, alias header, raw/malformed token and cron do not authenticate', () => {
  const unauthorized = [reviewerRequest(), request(credentials.CRON_SECRET), request('wrong'),
    request(credentials.INTERNAL_API_KEY, { 'x-internal-key': credentials.INTERNAL_API_KEY }),
    new Request('http://localhost', { headers: { authorization: credentials.INTERNAL_API_KEY } }),
    new Request('http://localhost', { headers: { 'x-internal-key': credentials.INTERNAL_API_KEY } }),
    new Request('http://localhost', { headers: { authorization: `bearer ${credentials.INTERNAL_API_KEY}` } }),
    new Request('http://localhost')];
  for (const req of unauthorized) assert.equal(resolveResearchControllerIdentity(req, 'author', credentials).ok, false);
  assert.equal(resolveResearchControllerIdentity(authorRequest(), 'reviewer', credentials).ok, false);
});

test('REB04 author and independent reviewer fixtures bind hashes while unknown model identity stays null', () => {
  for (const role of ['author', 'reviewer']) {
    const f = fixture(role); const result = validate(f);
    assert.equal(result.ok, true); assert.deepEqual(result.observation, f.observation);
    assert.notEqual(result.observation, f.observation); assert.equal(result.observation.modelIdentity, null);
    assert.equal(result.principalId, f.expected.principalId);
  }
});

test('REB05 key rotation cannot adopt an existing assignment and does not log credential values', () => {
  const f = fixture(); const keys = { ...credentials, INTERNAL_API_KEY: 'new-fixture-writer' };
  f.req = request(keys.INTERNAL_API_KEY);
  const result = validate(f, keys);
  assert.deepEqual(result, { ok: false, error: 'research_execution_principal_mismatch' });
  assert.equal(JSON.stringify(result).includes(keys.INTERNAL_API_KEY), false);
});

test('REB06 original work owner and reservation role are separate from principal and cannot be swapped', () => {
  for (const role of ['author', 'reviewer']) for (const mutation of [
    { originalLeaseOwner: 'different-owner' }, { workOwner: '' },
    { reservationRole: role === 'author' ? 'counter_review' : 'company_research' },
  ]) {
    const f = fixture(role); Object.assign(f.expected, mutation); rejects(f, 'research_execution_owner_or_role_mismatch');
  }
});

test('REB07 closed observation rejects self-asserted authority, unknown/missing fields and fake platform attestation', () => {
  for (const mutation of [{ principalId: hash(9) }, { authorId: 'renamed-author' }, { role: 'reviewer' },
    { verificationLevel: 'platform_attestation' }, { providerSurface: 'manual_file' },
    { threadId: 'unknown' }, { invocationId: '' }, { attempt: 4 }, { attempt: 1.5 },
    { outputHash: 'not-a-hash' }, { modelIdentity: ' a model ' }, { hostId: '\n' }, { turnId: 1 }]) {
    const f = fixture(); Object.assign(f.observation, mutation); rejects(f, 'research_execution_observation_shape');
  }
  for (const key of Object.keys(fixture().observation)) {
    const f = fixture(); delete f.observation[key]; rejects(f, 'research_execution_observation_shape');
  }
  for (const value of [null, [], true, 'self reported']) {
    const f = fixture(); f.observation = value; rejects(f, 'research_execution_observation_shape');
  }
});

test('REB08 exact assignment/job/attempt/reservation/input/article/review/output binding rejects mixed revisions', () => {
  for (const role of ['author', 'reviewer']) for (const key of [
    'assignmentId', 'jobId', 'reservationId', 'inputRevisionId', 'attempt', 'inputHash', 'articleHash', 'outputHash',
  ]) {
    const f = fixture(role); f.observation[key] = key === 'attempt' ? 2 : key.endsWith('Id') ? id(99) : hash(9);
    rejects(f, 'research_execution_binding_mismatch');
  }
  for (const role of ['author', 'reviewer']) {
    const f = fixture(role); f.observation.reviewPackHash = role === 'author' ? hash(3) : null;
    rejects(f, 'research_execution_binding_mismatch');
  }
});

test('REB09 dispatch/completion must fit original assignment, reservation, job and real receive clocks', () => {
  const cases = [
    ['expected', 'assignedAt', at(4)], ['expected', 'assignedAt', at(60)],
    ['expected', 'receivedAt', at(55)], ['expected', 'receivedAt', at(60)],
    ['expected', 'receivedAt', at(24)], ['expected', 'originalJobDeadline', at(10)],
    ['observation', 'controllerObservedStartAt', at(9)], ['observation', 'controllerObservedEndAt', at(19)],
    ['observation', 'controllerObservedEndAt', at(31)], ['observation', 'controllerObservedEndAt', '2026-02-30T00:00:00.000Z'],
    ['observation', 'controllerObservedStartAt', '2026-10-09T00:00:20+00:00'],
    ['expected', 'reservationStartedAt', 'invalid'],
  ];
  for (const [target, key, value] of cases) {
    const f = fixture(); f[target][key] = value; rejects(f, 'research_execution_clock_invalid');
  }
  const boundary = fixture(); boundary.observation.controllerObservedStartAt = boundary.expected.assignedAt;
  boundary.observation.controllerObservedEndAt = boundary.expected.receivedAt; assert.equal(validate(boundary).ok, true);
});

test('REB10 reviewer cannot reuse author principal, thread, invocation or pre-author execution', () => {
  for (const mutation of [
    f => { f.expected.author.principalId = f.expected.principalId; },
    f => { f.observation.threadId = f.expected.author.threadId; },
    f => { f.observation.invocationId = f.expected.author.invocationId; },
    f => { f.expected.articleAuthoredAt = at(21); },
    f => { f.expected.author = null; }, f => { f.expected.articleAuthoredAt = null; },
  ]) {
    const f = fixture('reviewer'); mutation(f); rejects(f, 'research_execution_not_independent');
  }
  const f = fixture(); f.expected.author = fixture('reviewer').expected.author;
  rejects(f, 'research_execution_binding_mismatch');
});

test('REB11 used invocation is rejected rather than silently creating a new execution or budget charge', () => {
  for (const role of ['author', 'reviewer']) {
    const f = fixture(role); f.expected.usedInvocationIds = [f.observation.invocationId];
    rejects(f, 'research_execution_invocation_reused');
  }
});
