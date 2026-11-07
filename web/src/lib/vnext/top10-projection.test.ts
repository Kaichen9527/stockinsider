import assert from 'node:assert/strict';
import test from 'node:test';
import { DEEP_WEIGHTS, POLICY, type Factors } from './policy.ts';
import { projectTop10Candidate, type FrozenRankingInput, type FrozenRankingMember } from './top10-projection.ts';

const cutoff = '2026-11-06T12:30:00.000Z';
function member(symbol = '2330', value: number | null = 1): FrozenRankingMember {
  const revisions = { research: 'research-1', score: 'score-1', financial: 'financial-1', price: 'price-1', market: 'market-1' };
  const factors: Factors = Object.fromEntries(Object.keys(DEEP_WEIGHTS).map(key => [key, { raw: value, value, provenance: [key + '-original'], reason: 'supported' }]));
  return { symbol, policyVersion: POLICY.version, cutoff, eventAt: '2026-11-05T00:00:00.000Z', revisions, scoreBinding: { ...revisions }, factors,
    publication: { status: 'independently_approved', researchRevision: revisions.research, authorExecutionId: 'author-1', reviewerExecutionId: 'reviewer-1' },
    validity: { rights: 'current', financial: 'current', price: 'current', validUntil: '2026-11-07T00:00:00.000Z' }, entryEligible: true, waitingReasons: [] };
}
function input(members: FrozenRankingMember[]): FrozenRankingInput {
  return { policyVersion: POLICY.version, cutoff, marketRevision: 'market-1', activePoolSymbols: members.map(m => m.symbol), members };
}
test('zero, one, ten and twenty active members project at most ten without filling', () => {
  for (const size of [0, 1, 10, 20]) {
    const result = projectTop10Candidate(input(Array.from({ length: size }, (_, i) => member(String(1000 + i)))));
    assert.equal(result.members.length, Math.min(size, 10));
    assert.deepEqual(result.members.map(m => m.rank), Array.from({ length: Math.min(size, 10) }, (_, i) => i + 1));
    assert.equal(result.qualifiedOutsideTop10.length, Math.max(size - 10, 0));
    assert.equal(result.authority, 'projection_only_requires_trusted_server_adapter');
  }
});
test('known zero remains a complete zero score; null does not renormalize or enter', () => {
  const zero = member('1000', 0), missing = member('1001'); missing.factors.valuation.value = null;
  const result = projectTop10Candidate(input([zero, missing]));
  assert.equal(result.members[0].confirmedPoints, 0); assert.equal(result.members[0].availableWeight, 100);
  assert.equal(result.members[0].probability, false);
  assert.deepEqual(result.excluded, [{ symbol: '1001', reasons: ['deep_factor_evidence_incomplete'] }]);
});
test('original deep weights group as fundamental70 technical20 market10', () => {
  const candidate = member(); candidate.factors.technicalChips.value = 0; candidate.factors.marketLiquidity.value = 0;
  assert.equal(projectTop10Candidate(input([candidate])).members[0].confirmedPoints, 70);
  candidate.factors.valuation.value = 0; candidate.factors.profitability.value = 0; candidate.factors.catalysts.value = 0;
  candidate.factors.technicalChips.value = 1; assert.equal(projectTop10Candidate(input([candidate])).members[0].confirmedPoints, 20);
  candidate.factors.technicalChips.value = 0; candidate.factors.marketLiquidity.value = 1;
  assert.equal(projectTop10Candidate(input([candidate])).members[0].confirmedPoints, 10);
});
test('deep score then event time then symbol tie-break is stable under input permutation', () => {
  const a = member('1000'), b = member('1001'), c = member('1002', .9), d = member('1003');
  d.eventAt = '2026-11-06T00:00:00.000Z';
  const first = projectTop10Candidate(input([c, b, a, d]));
  assert.deepEqual(first.members.map(m => m.symbol), ['1003', '1000', '1001', '1002']);
  assert.deepEqual(first, projectTop10Candidate(input([d, a, b, c])));
});
test('wrong policy/cutoff and every mismatching revision fail closed', () => {
  for (const key of ['research', 'score', 'financial', 'price', 'market'] as const) {
    const candidate = member(); candidate.scoreBinding[key] = 'other';
    assert.ok(projectTop10Candidate(input([candidate])).excluded[0].reasons.includes('revision_mismatch'));
  }
  for (const key of ['policyVersion', 'cutoff'] as const) {
    const candidate = member(); candidate[key] = 'other';
    assert.ok(projectTop10Candidate(input([candidate])).excluded[0].reasons.includes('context_mismatch'));
  }
  const packet = input([]); packet.policyVersion = 'other'; assert.throws(() => projectTop10Candidate(packet), /context_invalid/u);
});
test('nonactive, unreviewed, same execution and noncurrent evidence never enter', () => {
  const notActive = input([member()]); notActive.activePoolSymbols = [];
  assert.throws(() => projectTop10Candidate(notActive), /pool_invalid/u);
  for (const field of ['rights', 'financial', 'price'] as const) {
    const candidate = member(); candidate.validity[field] = 'missing';
    assert.equal(projectTop10Candidate(input([candidate])).members.length, 0);
  }
  const pending = member(); pending.publication.status = 'review_pending';
  assert.equal(projectTop10Candidate(input([pending])).members.length, 0);
  const same = member(); same.publication.reviewerExecutionId = same.publication.authorExecutionId;
  assert.equal(projectTop10Candidate(input([same])).members.length, 0);
  const stale = member(); stale.validity.validUntil = '2026-11-05T00:00:00Z';
  assert.equal(projectTop10Candidate(input([stale])).members.length, 0);
  const future = member(); future.eventAt = '2026-11-08T00:00:00Z';
  assert.equal(projectTop10Candidate(input([future])).members.length, 0);
});
test('entry waiting is retained independently of ranking and output references cannot mutate input', () => {
  const candidate = member(); candidate.entryEligible = false; candidate.waitingReasons = ['market_wait'];
  const packet = input([candidate]); const before = structuredClone(packet); const result = projectTop10Candidate(packet);
  assert.equal(result.members[0].entryEligible, false); assert.deepEqual(result.members[0].waitingReasons, ['market_wait']);
  result.members[0].waitingReasons.push('changed'); result.members[0].revisions.price = 'changed';
  assert.deepEqual(packet, before); assert.deepEqual(projectTop10Candidate(packet), projectTop10Candidate(before));
});
test('duplicate symbols and active pool beyond twenty are rejected', () => {
  assert.throws(() => projectTop10Candidate(input([member(), member()])), /pool_invalid/u);
  assert.throws(() => projectTop10Candidate(input(Array.from({ length: 21 }, (_, i) => member(String(1000 + i))))), /pool_invalid/u);
});

test('runtime extra private revision fields are not projected or retained by reference', () => {
  const candidate = member();
  const privateEvidence = { restricted: ['private-original'] };
  Object.assign(candidate.revisions, { privateEvidence });
  const result = projectTop10Candidate(input([candidate]));
  assert.deepEqual(Object.keys(result.members[0].revisions).sort(), ['financial', 'market', 'price', 'research', 'score']);
  assert.equal(JSON.stringify(result).includes('private-original'), false);
  privateEvidence.restricted.push('changed');
  assert.equal(JSON.stringify(result).includes('changed'), false);
});
test('invalid runtime member symbol, entry flag and waiting reason shape reject', () => {
  for (const patch of [{ symbol: '2330-private' }, { symbol: 2330 }, { entryEligible: 'true' }, { waitingReasons: [42] }, { waitingReasons: 'market_wait' }]) {
    const candidate = Object.assign(member(), patch) as FrozenRankingMember;
    const packet = input([member()]); packet.members = [candidate];
    assert.throws(() => projectTop10Candidate(packet), /(?:member|pool)_invalid/u);
  }
});

test('validity interval is half open and equality at cutoff is expired', () => {
  const candidate = member(); candidate.validity.validUntil = cutoff;
  const result = projectTop10Candidate(input([candidate]));
  assert.equal(result.members.length, 0);
  assert.deepEqual(result.excluded[0].reasons, ['validity_expired_or_unknown']);
});
test('full active pool must be supplied, including members that will be excluded', () => {
  const packet = input([member('1000'), member('1001')]);
  packet.members = packet.members.slice(0, 1);
  assert.throws(() => projectTop10Candidate(packet), /pool_invalid/u);
  const wrongMember = input([member('1000')]); wrongMember.members = [member('1001')];
  assert.throws(() => projectTop10Candidate(wrongMember), /pool_invalid/u);
  const runtimeNumeric = input([member()]); Object.assign(runtimeNumeric.activePoolSymbols, { 0: 2330 });
  assert.throws(() => projectTop10Candidate(runtimeNumeric), /pool_invalid/u);
  const complete = input([member('1000'), member('1001')]); complete.members[1].validity.rights = 'withdrawn';
  const result = projectTop10Candidate(complete);
  assert.equal(result.members.length, 1); assert.equal(result.excluded[0].symbol, '1001');
});
