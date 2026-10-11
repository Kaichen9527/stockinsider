import assert from 'node:assert/strict';
import test from 'node:test';
import { validateResearchDeepClaimContext, type ResearchDeepClaimContext } from './research-deep-claim-context.ts';

const owner = 'deep-author-one';
const now = '2026-10-05T00:10:00.000Z';
function fixture(): ResearchDeepClaimContext {
  const jobId = '11111111-1111-4111-8111-111111111111';
  return { schemaVersion: 'research-deep-claim-context-v1', observedAt: now,
    job: { jobId, symbol: '2409', priorityRunId: '22222222-2222-4222-8222-222222222222',
      attempt: 1, owner, leaseExpiresAt: '2026-10-05T00:30:00.123457+00:00' },
    modelReservation: { reservationId: '33333333-3333-4333-8333-333333333333', role: 'company_research',
      owner, workKey: `deep:${jobId}:1`, startedAt: '2026-10-05T00:00:00.123456+00:00',
      leaseExpiresAt: '2026-10-05T00:30:00.123456+00:00' }, modelCompletion: null };
}
test('DCC-U1: exact context preserves original distinct microsecond deadlines and has no publication authority', () => {
  const context = fixture();
  assert.deepEqual(validateResearchDeepClaimContext(context, { owner, now, jobId: context.job.jobId, attempt: 1 }), context);
  assert.notEqual(context.job.leaseExpiresAt, context.modelReservation.leaseExpiresAt);
  assert.deepEqual(Object.keys(context).sort(), ['job', 'modelCompletion', 'modelReservation', 'observedAt', 'schemaVersion']);
});
test('DCC-U2: foreign owners, roles, identities, duplicate or extra shape fields cannot become a context', () => {
  const mutations: Array<(context: ResearchDeepClaimContext) => void> = [
    value => { value.job.owner = 'foreign-owner'; }, value => { value.modelReservation.owner = 'foreign-owner'; },
    value => { value.modelReservation.role = 'counter_review' as 'company_research'; },
    value => { value.modelReservation.workKey += ':retry'; }, value => { value.job.attempt = 4; },
    value => { value.job.symbol = 'not-a-symbol'; }, value => { value.job.priorityRunId = 'invalid'; },
    value => { value.modelReservation.reservationId = 'invalid'; },
    value => { Object.assign(value, { rawDatabase: { password: 'not-exportable' } }); },
    value => { Object.assign(value.job, { status: 'running' }); },
  ];
  for (const mutate of mutations) { const value = fixture(); mutate(value); assert.throws(() => validateResearchDeepClaimContext(value, { owner, now })); }
  assert.throws(() => validateResearchDeepClaimContext(fixture(), { owner, now, attempt: 1 }));
  assert.throws(() => validateResearchDeepClaimContext(fixture(), { owner, now, jobId: fixture().job.jobId, attempt: 2 }));
});
test('DCC-U3: future observations, expired leases, invalid dates, microsecond extension and Taipei midnight fail closed', () => {
  for (const mutate of [
    (value: ResearchDeepClaimContext) => { value.observedAt = '2026-10-05T00:10:01Z'; },
    (value: ResearchDeepClaimContext) => { value.modelReservation.startedAt = '2026-10-05T00:20:00Z'; },
    (value: ResearchDeepClaimContext) => { value.modelReservation.leaseExpiresAt = '2026-10-05T00:30:00.123457+00:00'; },
    (value: ResearchDeepClaimContext) => { value.modelReservation.startedAt = '2026-02-30T00:00:00Z'; },
    (value: ResearchDeepClaimContext) => { value.job.leaseExpiresAt = '2026-10-05T01:00:00Z'; },
  ]) { const value = fixture(); mutate(value); assert.throws(() => validateResearchDeepClaimContext(value, { owner, now })); }
  const value = fixture();
  assert.throws(() => validateResearchDeepClaimContext(value, { owner, now: value.modelReservation.leaseExpiresAt }));
  value.modelReservation.startedAt = '2026-10-05T15:40:00Z';
  value.modelReservation.leaseExpiresAt = value.job.leaseExpiresAt = '2026-10-05T16:10:00Z';
  value.observedAt = '2026-10-05T15:45:00Z';
  assert.throws(() => validateResearchDeepClaimContext(value, { owner, now: value.observedAt }));
});
test('DCC-U4: handoff accounting is visible only with the exact hash, outcome and original completion clock', () => {
  const value = fixture();
  value.modelCompletion = { outcome: 'completed', resultHash: 'a'.repeat(64), completedAt: '2026-10-05T00:05:00Z' };
  assert.equal(validateResearchDeepClaimContext(value, { owner, now }).modelCompletion?.resultHash, 'a'.repeat(64));
  for (const completion of [
    { ...value.modelCompletion, resultHash: 'bad' }, { ...value.modelCompletion, outcome: 'published' },
    { ...value.modelCompletion, completedAt: '2026-10-04T23:59:59Z' },
    { ...value.modelCompletion, completedAt: '2026-10-05T00:20:00Z' },
    { ...value.modelCompletion, completedAt: value.modelReservation.leaseExpiresAt },
    { ...value.modelCompletion, articleSaved: true },
  ]) assert.throws(() => validateResearchDeepClaimContext({ ...value, modelCompletion: completion }, { owner, now }));
});
