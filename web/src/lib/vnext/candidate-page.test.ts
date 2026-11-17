import assert from 'node:assert/strict';
import test from 'node:test';
import { POLICY } from './policy.ts';
import { readFileSync } from 'node:fs';
import { candidateDetailHref, candidatePage, candidateQuery, candidateRankingRunId } from './candidate-page.ts';
const rankingRunId = '00000000-0000-4000-8000-000000000001';
function fixture(count = 20) { const policy: { policyVersion: string } = { policyVersion: POLICY.version }; return { snapshot: { ...policy, schemaVersion: 'vnext-ranking-snapshot-v1', rankingRunId, cutoff: '2026-11-06T12:30:00.000Z', candidates: Array.from({ length: count }, (_, i) => ({ symbol: String(1000 + i), state: 'waiting', date: '2026-11-06', revisionId: null, entryEligible: false, source: null, industry: null, inputHash: 'private-input', reasons: ['private-reason'], private: { body: 'secret' } })) } }; }
test('zero/one/ten/twenty catalogs paginate at most twenty and preserve version', () => {
  for (const count of [0, 1, 10, 20]) { const result = candidatePage(fixture(count), candidateQuery({})); assert.equal(result.rows.length, Math.min(count, 10)); assert.equal(result.rankingRunId, rankingRunId); assert.equal(Boolean(result.nextCursor), count > 10); }
});
test('stable keyset uses the original snapshot and survives different catalog input order', () => {
  const input = fixture(); const first = candidatePage(input, candidateQuery({})); const query = candidateQuery({ cursor: first.nextCursor! });
  assert.equal(candidateRankingRunId(query), rankingRunId); input.snapshot.candidates.reverse();
  const second = candidatePage(input, query); assert.deepEqual(second.rows.map(row => row.symbol), Array.from({ length: 10 }, (_, i) => String(1010 + i))); assert.equal(second.nextCursor, null);
});
test('cursor refuses catalog/version/filter changes and malformed data', () => {
  const first = candidatePage(fixture(), candidateQuery({})); const query = candidateQuery({ cursor: first.nextCursor! });
  const changed = fixture(); changed.snapshot.candidates[0].entryEligible = true; assert.throws(() => candidatePage(changed, query), /invalid/u);
  const version = fixture(); version.snapshot.rankingRunId = '00000000-0000-4000-8000-000000000002'; assert.throws(() => candidatePage(version, query), /invalid/u);
  assert.throws(() => candidateRankingRunId(candidateQuery({ cursor: first.nextCursor!, status: 'waiting' })), /invalid/u);
  for (const cursor of ['!!!', Buffer.from('{}').toString('base64url'), 'x'.repeat(1001)]) assert.throws(() => candidateRankingRunId(candidateQuery({ cursor })), /invalid/u);
});
test('date/status filter is exact and unknown source/industry never invent matches', () => {
  assert.equal(candidatePage(fixture(), candidateQuery({ date: '2026-11-06', status: 'waiting' })).rows.length, 10);
  for (const params of [{ date: '2026-11-05' }, { status: 'exited' }, { source: 'ptt' }, { industry: '半導體' }]) assert.equal(candidatePage(fixture(), candidateQuery(params)).rows.length, 0);
});
test('bounded query rejects invalid dates, duplicates, status and limit', () => {
  for (const params of [{ date: '2026-02-30' }, { date: '2026-99-99' }, { limit: '21' }, { limit: '0' }, { source: ' raw ' }, { status: 'draft' }, { status: ['waiting', 'eligible'] }]) assert.throws(() => candidateQuery(params), /invalid/u);
});
test('public allowlist drops hashes/reasons/raw private fields and aliases no input object', () => {
  const input = fixture(1); const before = structuredClone(input); const result = candidatePage(input, candidateQuery({}));
  assert.deepEqual(Object.keys(result.rows[0]).sort(), ['date', 'entryEligible', 'industry', 'revisionId', 'source', 'state', 'symbol']);
  assert.equal(JSON.stringify(result).includes('private'), false); result.rows[0].state = 'eligible'; assert.deepEqual(input, before);
});
test('duplicate symbols, overfull catalogs and unexpected non-null source fail closed', () => {
  const duplicate = fixture(2); duplicate.snapshot.candidates[1].symbol = '1000'; assert.throws(() => candidatePage(duplicate, candidateQuery({})), /invalid/u);
  assert.throws(() => candidatePage(fixture(21), candidateQuery({})), /invalid/u);
  const unknown = fixture(1); Object.assign(unknown.snapshot.candidates[0], { source: 'ptt' }); assert.throws(() => candidatePage(unknown, candidateQuery({})), /invalid/u);
});

test('unknown snapshot schema and policy are never presented as a candidate catalog', () => {
  for (const key of ['schemaVersion', 'policyVersion'] as const) { const input = fixture(); input.snapshot[key] = 'other'; assert.throws(() => candidatePage(input, candidateQuery({})), /invalid/u); }
});
test('page remains feature-gated and delegates only to bounded history read without work calls', () => {
  const source = readFileSync(new URL('../../app/candidates/page.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('if (!rankingEnabled()) notFound()'));
  assert.equal([...source.matchAll(/\.rpc\(/gu)].length, 0);
  assert.ok(source.includes('data = await readCandidateHistory(query)'));
  assert.equal(/\b(?:enqueue|prepare|claim|publish|dispatch|record|runResearch)\s*\(/u.test(source), false);
  assert.equal(/export (?:async )?function POST/u.test(source), false);
});

test('all twenty catalog links use exact publication history rather than Top10 rank binding', () => {
  const input = fixture(); Object.assign(input.snapshot.candidates[19], { revisionId: '00000000-0000-4000-8000-000000000002' });
  const result = candidatePage(input, candidateQuery({ limit: '20' }));
  for (const candidate of result.rows) {
    const href = candidateDetailHref(candidate); assert.equal(href.includes('rankingRunId'), false);
    if (candidate.revisionId) assert.equal(href, `/stock/${candidate.symbol}?vnextRevision=${candidate.revisionId}`);
    else assert.equal(href, `/stock/${candidate.symbol}`);
  }
  const source = readFileSync(new URL('../../app/candidates/page.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('href={candidateDetailHref(row)}'));
  assert.ok(source.includes('尚無已發布研究'));
});
