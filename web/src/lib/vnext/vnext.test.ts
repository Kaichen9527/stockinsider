import assert from 'node:assert/strict';
import test from 'node:test';
import { explicitScope, INITIAL_WEIGHTS, inputHash, researchMaterialHash, latestCompletedSession, scoreFactors, taipeiDate, type Factors } from './policy.ts';
import { marketJudgment, type MarketInput } from './market.ts';
import { eligibleClue, independentClues, screenRoundRobin, volumeComparison, type Clue } from './screening.ts';
import { candidateOrder, confirmReplacement, exitReason, type Candidate } from './replacement.ts';
import { requireAdmittedResearch, requireCandidateCycleScope, runAdmittedResearch } from './runtime.ts';
import { vnextIdentity } from './auth.ts';
import { publicHome } from './public-contract.ts';
import { initialFactors, type ScreeningInputs } from './factors.ts';
import { validateArtifact, validateClaim, validateReview, REQUIRED_SECTIONS, type Artifact, type Evidence, type Review } from './research.ts';
import { boundedRequestBody } from './request.ts';
import { rotateCachedObservations } from './rotation.ts';
import { publicCitation } from './citations.ts';

const now = '2026-10-21T11:00:00Z';
const sessions = [{ id: '2026-10-19', closeAt: '2026-10-19T05:30:00Z', completed: true }, { id: '2026-10-20', closeAt: '2026-10-20T05:30:00Z', completed: true }, { id: '2026-10-21', closeAt: '2026-10-21T05:30:00Z', completed: true }];
const clue = (i = 0, source = 'ptt'): Clue => ({ symbol: '2330', source, root: `root${i}`, authorRoot: `author${i}`, contentHash: inputHash(i), eventAt: '2026-10-20T01:00:00Z', availableAt: '2026-10-20T02:00:00Z' });
const factors = (value: number): Factors => Object.fromEntries(Object.keys(INITIAL_WEIGHTS).map((key) => [key, { raw: value, value, provenance: ['official:fixture'], reason: 'synthetic_observation' }]));
const candidate = (symbol: string, value = 0.5): Candidate => ({ symbol, factors: factors(value), eventAt: '2026-10-20', priceEvidence: true, eventEvidence: true, rootEvidence: true, eligible: true, contraindication: false, catalystCancelled: false, tradingInvalid: false, targetHit: false, newThesis: false, overheated: false });

test('VN01 explicit empty scope cannot expand into research and unadmitted work has zero IO', async () => {
  const previous = process.env.STOCKINSIDER_VNEXT_ENABLED; process.env.STOCKINSIDER_VNEXT_ENABLED = 'true'; let io = 0;
  try {
    assert.deepEqual(explicitScope([]), []);
    assert.throws(() => explicitScope(undefined), /explicit_scope/);
    assert.throws(() => { requireCandidateCycleScope([]); io++; }, /scope/);
    assert.throws(() => { requireAdmittedResearch('2330'); io++; }, /not_admitted/);
    await runAdmittedResearch({ symbol: '2330', jobId: 'fixture', executionId: 'fixture' }, async () => {
      requireCandidateCycleScope(['2330']);
      assert.throws(() => { requireAdmittedResearch('2317'); io++; }, /not_admitted/);
    });
    assert.equal(io, 0);
  } finally { if (previous === undefined) delete process.env.STOCKINSIDER_VNEXT_ENABLED; else process.env.STOCKINSIDER_VNEXT_ENABLED = previous; }
});

test('VN05 null factors keep original available weights and source/volume halves remain independent', () => {
  const f = factors(0.5); f.chips.value = null; f.priceVolume.value = null;
  assert.equal(scoreFactors(f, INITIAL_WEIGHTS).availableWeight, 60);
  assert.equal(scoreFactors(f, INITIAL_WEIGHTS).confirmedPoints, 30);
  f.sourceVolume = { raw: null, value: null, provenance: [], reason: 'partial', components: { independent: { raw: 3, value: 1, provenance: ['ptt'], reason: 'roots' }, volume: { raw: null, value: null, provenance: [], reason: 'outage' } } };
  assert.equal(scoreFactors(f, INITIAL_WEIGHTS).availableWeight, 47.5);
  assert.equal(volumeComparison(7, 0, true).state, 'new');
  assert.equal(volumeComparison(7, null, true).ratio, null);
  assert.equal(volumeComparison(7, 21, false).ratio, null);
  assert.equal(volumeComparison(7, 21, true).ratio, 1);
});

test('VN05/VN09 original event and source rights, hash dedup, round robin and source limits', () => {
  assert.equal(eligibleClue({ ...clue(), eventAt: '2026-01-01', availableAt: now }, now), false);
  assert.equal(eligibleClue({ ...clue(), source: 'telegram', rightsAttested: true, operatorClaim: true, rawContent: 'forbidden' }, now), false);
  assert.equal(eligibleClue({ ...clue(), source: 'investanchors' }, now), false);
  assert.equal(eligibleClue({ ...clue(), source: 'telegram', rightsAttested: true, operatorClaim: true }, now), true);
  const items = ['ptt', 'official', 'broker', 'podcast', 'kol'].flatMap((source, index) => Array.from({ length: 70 }, (_, i) => clue(index * 100 + i, source)));
  const batch = screenRoundRobin(items.concat(items), now);
  assert.equal(batch.length, 200);
  for (const source of new Set(batch.map((item) => item.source))) assert.equal(batch.filter((item) => item.source === source).length, 40);
  assert.equal(screenRoundRobin([clue()], now, new Set([clue().contentHash])).length, 0);
});

test('VN06 pair/policy/session confirmation uses initial factors, holiday and same day cannot increment', () => {
  const a = candidate('2330', 0.7); const b = candidate('2317', 0.5); const days = sessions.map((s) => s.id);
  const first = confirmReplacement(a, b, days[0], days); assert.equal(first.replace, false);
  assert.equal(confirmReplacement(a, b, days[0], days, first.confirmation!).confirmation?.count, 1);
  assert.equal(confirmReplacement(a, b, '2026-10-18', days, first.confirmation!).replace, false);
  assert.equal(confirmReplacement(a, b, days[1], days, first.confirmation!).replace, true);
  assert.equal(confirmReplacement(a, b, days[2], days, first.confirmation!).replace, false);
  assert.equal(confirmReplacement({ ...a, priceEvidence: false }, b, days[1], days, first.confirmation!).confirmation, null);
  assert.equal(confirmReplacement(a, b, days[1], days, { ...first.confirmation!, policy: 'old' }).replace, false);
  assert.equal(candidateOrder(candidate('2330'), candidate('2317')) > 0, true);
});

test('VN07 verified exits are immediate and overheat retains a waiting candidate', () => {
  assert.equal(exitReason({ ...candidate('2330'), contraindication: true }), 'verified_contraindication');
  assert.equal(exitReason({ ...candidate('2330'), catalystCancelled: true }), 'catalyst_cancelled');
  assert.equal(exitReason({ ...candidate('2330'), tradingInvalid: true }), 'trading_invalid');
  assert.equal(exitReason({ ...candidate('2330'), targetHit: true }), 'target_hit');
  assert.equal(exitReason({ ...candidate('2330'), targetHit: true, newThesis: true }), null);
  assert.equal(exitReason({ ...candidate('2330'), overheated: true }), null);
});

const market: MarketInput = { risk: 'risk_on', confidence: 'complete', session: '2026-10-21', sourceAt: '2026-10-21T06:00:00Z', expiresAt: '2026-10-22T00:15:00Z', continuity: true, provenance: ['https://www.twse.com.tw/'], gaps: [], overseas: [] };
test('VN08/VN10 latest completed sessions, Taipei date, confidence and supported AI downgrade', () => {
  assert.equal(taipeiDate('2026-10-20T16:01:00Z'), '2026-10-21');
  assert.equal(latestCompletedSession(sessions, '2026-10-21T01:00:00Z'), '2026-10-20');
  assert.equal(marketJudgment(market, sessions, now).action, 'evaluate');
  assert.equal(marketJudgment({ ...market, session: '2026-10-20' }, sessions, now).action, 'cannot_determine');
  const missingForeign = marketJudgment({ ...market, overseas: [{ name: 'SOX', value: null, sourceAt: null, provenance: null }] }, sessions, now);
  assert.equal(missingForeign.risk, 'risk_on'); assert.equal(missingForeign.confidence, 'limited');
  assert.equal(marketJudgment({ ...market, risk: 'risk_off' }, sessions, now, { risk: 'risk_on', evidenceIds: ['fact'], modelVersion: 'test', inputHash: 'x', outputHash: 'y' }).action, 'wait');
  assert.equal(marketJudgment(market, sessions, now, { risk: 'risk_off', evidenceIds: [], modelVersion: 'test', inputHash: 'x', outputHash: 'y' }).action, 'evaluate');
  assert.equal(marketJudgment({ ...market, expiresAt: '2026-10-20' }, sessions, now).entryBlocked, true);
});

test('VN08 actual raw screening cannot convert unadjusted or missing observations into points', () => {
  const observation = { value: 0.1, source: 'https://www.twse.com.tw/', observedAt: '2026-10-20' };
  const raw: ScreeningInputs = { cutoff: now, clues: [clue()], sourceHealthy: false, recent7: 7, prior21: 21, priceReturn20: observation, volumeRatio20: observation, institutionalFlowRatio: observation, revenueGrowth: observation, catalystVerified: observation, corporateActionAdjusted: false };
  const scored = initialFactors(raw);
  assert.equal(scored.factors.priceVolume.value, null);
  assert.equal(scored.factors.sourceVolume.components?.volume.value, null);
  assert.equal(scored.availableWeight, 62.5);
});

test('VN11 canonical input clocks do not rewrite material content', () => {
  assert.equal(inputHash({ quote: 100, fetchedAt: 'old', nested: { collectedAt: 'old' } }), inputHash({ nested: { collectedAt: 'new' }, fetchedAt: 'new', quote: 100 }));
  assert.notEqual(inputHash({ quote: 100 }), inputHash({ quote: 101 }));
  const raw = { clues: [clue()], cutoff: now, screening: { cutoff: now, sourceHealthy: true, price: 100 }, evidence: [], initialScore: { recency: 0.9 } };
  assert.equal(researchMaterialHash(raw), researchMaterialHash({ ...raw, cutoff: '2026-10-22', screening: { ...raw.screening, cutoff: '2026-10-22' }, initialScore: { recency: 0.8 } }));
  assert.notEqual(researchMaterialHash(raw), researchMaterialHash({ ...raw, screening: { ...raw.screening, price: 101 } }));
});

test('VN12 facts, formulas, units, original evidence hashes and every claim require independent review', () => {
  const evidence: Evidence[] = [{ id: 'eps', key: 'annual_eps', kind: 'fact', sourceTier: 'official', contentHash: inputHash('original eps'), value: 10, unit: 'TWD/share', period: '2026', source: 'https://mops.twse.com.tw/', eventAt: now, availableAt: now }, { id: 'multiple', key: 'pe', kind: 'assumption', sourceTier: 'public', contentHash: inputHash('assumption'), value: 15, unit: 'multiple', period: '2026', source: 'https://example.org/', eventAt: now, availableAt: now }];
  const claim = { id: 'target', text: 'Scenario target derived from EPS and disclosed multiple.', kind: 'derived' as const, evidenceIds: ['eps', 'multiple'], numeric: { value: 150, unit: 'TWD/share', period: '2026', key: 'target', formula: { operation: 'multiply' as const, evidenceIds: ['eps', 'multiple'] } } };
  assert.deepEqual(validateClaim(claim, evidence), []);
  assert.match(validateClaim({ ...claim, numeric: { ...claim.numeric, value: 200 } }, evidence).join(','), /result_mismatch/);
  assert.match(validateClaim({ ...claim, kind: 'fact' }, evidence).join(','), /authority|kind|mismatch/);
  const a = { schemaVersion: 'stockinsider-vnext-research-v1', model: 'synthetic-test-model', modelVersion: 'fixture-1', inputHash: inputHash('input'), outputHash: '', sections: Object.fromEntries(REQUIRED_SECTIONS.map((key) => [key, { text: 'Synthetic evidence-backed test description.', evidenceIds: ['eps'], claimIds: ['target'] }])), claims: [claim], quoteDate: '2026-10-21', valuationDate: '2026-10-21', annualEps: 10, nextFourQuarterEps: null, gaps: ['next_four_quarter_eps_missing'] } as Artifact;
  a.outputHash = inputHash({ ...a, outputHash: undefined });
  assert.equal(validateArtifact(a, evidence, a.inputHash).valid, true);
  const review: Review = { approved: true, authorOutputHash: a.outputHash, modelVersion: 'synthetic-review-1', findings: [], factsChecked: true, valuationChecked: true, claimsChecked: true, claimChecks: [{ claimId: 'target', verdict: 'supported', reason: 'Recomputed 10*15 and checked original source identities.', sources: evidence.map((e) => ({ id: e.id, contentHash: e.contentHash })) }] };
  assert.deepEqual(validateReview(review, a, evidence), []);
  assert.match(validateReview({ ...review, claimChecks: [] }, a, evidence).join(','), /unchecked/);
  assert.match(validateReview({ ...review, authorOutputHash: inputHash('other') }, a, evidence).join(','), /binding/);
  assert.match(validateReview({ ...review, approved: undefined } as unknown as Review, a, evidence).join(','), /binding/);
  assert.match(validateClaim({ ...claim, kind: undefined } as unknown as typeof claim, evidence).join(','), /known_kind/);
  assert.match(validateArtifact({ ...a, annualEps: undefined }, evidence, a.inputHash).reasons.join(','), /annualEps_required/);
});

test('VN14 missing, stale and mismatched published snapshots cannot become entry eligible', () => {
  assert.equal(publicHome(null, now), null);
  const snapshot = { version: 'fixture-version', publishedAt: now, market: { ...market, sessions }, members: [{ symbol: '2330', state: 'eligible', revisionId: 'revision', content: {}, inputHash: 'new', publishedInputHash: 'old' }] };
  assert.equal(publicHome(snapshot, now)?.members[0].entryEligible, false);
  assert.equal(publicHome({ ...snapshot, members: [{ ...snapshot.members[0], inputHash: 'old' }] }, now)?.members[0].entryEligible, false);
  assert.equal(publicHome({ ...snapshot, market: { ...market, sessions, continuity: false } }, now)?.members[0].entryEligible, false);
});

test('VN02 configured role credentials reject spoofed body identity and ambiguous role keys', () => {
  const names = ['INTERNAL_API_KEY', 'STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL', 'STOCKINSIDER_VNEXT_AUTHOR_KEY', 'STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL'];
  const previous = names.map((name) => process.env[name]);
  try {
    process.env.INTERNAL_API_KEY = 'operator-test'; process.env.STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL = 'operator';
    process.env.STOCKINSIDER_VNEXT_AUTHOR_KEY = 'author-test'; process.env.STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL = 'author';
    assert.equal(vnextIdentity(new Request('http://localhost', { headers: { authorization: 'Bearer operator-test' } }))?.role, 'operator');
    assert.equal(vnextIdentity(new Request('http://localhost', { headers: { authorization: 'Bearer author-test' } }))?.role, 'author');
    process.env.STOCKINSIDER_VNEXT_AUTHOR_KEY = 'operator-test';
    assert.equal(vnextIdentity(new Request('http://localhost', { headers: { authorization: 'Bearer operator-test' } })), null);
  } finally { names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
});

test('VN05 chained syndication and crossplatform author roots count as one independent family', () => {
  const rows = [{ ...clue(1), root: 'A', authorRoot: 'one' }, { ...clue(2, 'podcast'), root: 'A', authorRoot: 'two' }, { ...clue(3, 'news'), root: 'B', authorRoot: 'two' }];
  assert.equal(independentClues(rows).length, 1);
  assert.equal(screenRoundRobin(rows, now).length, 3); // all unique contents parsed; one independent voice
  assert.equal(independentClues([...rows, { ...clue(4), root: 'C', authorRoot: 'three' }]).length, 2);
});

test('VN05 malformed or future event/availability clocks and absent root identity fail closed', () => {
  for (const field of ['eventAt', 'availableAt'] as const) {
    assert.equal(eligibleClue({ ...clue(), [field]: '' }, now), false);
    assert.equal(eligibleClue({ ...clue(), [field]: 'not-a-date' }, now), false);
    assert.equal(eligibleClue({ ...clue(), [field]: '2027-01-01' }, now), false);
  }
  assert.equal(eligibleClue({ ...clue(), root: '' }, now), false);
  assert.equal(eligibleClue({ ...clue(), contentHash: 'fake-hash' }, now), false);
  assert.equal(eligibleClue({ ...clue(), body: 'raw source forbidden' } as Clue, now), false);
});

test('VN10 persisted overseas gaps keep confidence limited on redisplay with the same risk snapshot', () => {
  const once = marketJudgment({ ...market, overseas: [{ name: 'SOX', value: null, sourceAt: null, provenance: null }] }, sessions, now);
  const twice = marketJudgment(once, sessions, now);
  assert.equal(twice.risk, once.risk); assert.equal(twice.confidence, 'limited');
  assert.equal(inputHash({ ...once, evaluatedAt: 'a' }), inputHash({ ...once, evaluatedAt: 'b' }));
});

test('VN02 bounded streaming rejects malformed, oversized and excessive depth before dispatch', async () => {
  const mixed = await boundedRequestBody(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ symbols: [], action: 'execute', jobId: 'ignored-job', artifact: { inputHash: 'ignored' } }) }));
  assert.deepEqual(mixed.symbols, []);
  await assert.rejects(boundedRequestBody(new Request('http://localhost', { method: 'POST', body: '{' })), /invalid_json/);
  await assert.rejects(boundedRequestBody(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ symbols: [], padding: 'x'.repeat(8192) }) })), /control_request_too_large/);
  await assert.rejects(boundedRequestBody(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(1048577) })), /request_too_large/);
  let nested: unknown = {}; for (let i = 0; i < 14; i++) nested = { nested };
  await assert.rejects(boundedRequestBody(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ action: 'review', nested }) })), /depth_exceeded/);
});

test('VN12 public citations reject private endpoints, credentials and paid member links', () => {
  for (const url of ['file:///tmp/a', 'https://127.0.0.1/a', 'https://localhost/a', 'https://example.internal/a', 'https://user:password@example.org/a', 'https://investanchors.com/premium/a']) assert.equal(publicCitation(url), null);
  assert.equal(publicCitation('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY'), 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY');
});

test('VN01 feature default off preserves the existing acquisition boundary behavior', () => {
  const previous = process.env.STOCKINSIDER_VNEXT_ENABLED; delete process.env.STOCKINSIDER_VNEXT_ENABLED;
  try { assert.doesNotThrow(() => requireAdmittedResearch('2330')); assert.doesNotThrow(() => requireCandidateCycleScope(undefined)); }
  finally { if (previous !== undefined) process.env.STOCKINSIDER_VNEXT_ENABLED = previous; }
});


test('VN06/VN07 cached orchestration retains active gaps, audits every member and rotates only postclose', async () => {
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  const send = async (action: string, body: Record<string, unknown>) => { calls.push({ action, body }); return { recorded: true }; };
  const rows = [{ symbol: '2330', input: { hash: inputHash('active') }, candidate: { ...candidate('2330'), priceEvidence: false }, active: true },
    { symbol: '2383', input: { hash: inputHash('candidate') }, candidate: candidate('2383', .9), active: false }];
  await rotateCachedObservations({ session: '2026-10-21', completed: true, postclose: false, weeklyDue: true }, rows, send);
  assert.equal(calls.some((c) => c.action === 'swap' || c.action === 'exit'), false);
  assert.deepEqual(calls.find((c) => c.action === 'weekly-audit')?.body.symbols, ['2330']);
  assert.deepEqual(calls.find((c) => c.action === 'weekly-audit')?.body.gaps, ['2330:current_comparison_evidence_missing']);
  assert.deepEqual(rows[0].input, { hash: inputHash('active') });
  calls.length = 0;
  await rotateCachedObservations({ session: '2026-10-21', completed: true, postclose: true, weeklyDue: false }, rows, send);
  assert.deepEqual(calls.filter((c) => c.action === 'swap').map((c) => c.body.challengerSymbol), ['2383']);
  assert.equal(calls.some((c) => c.action === 'exit'), false);
});

test('VN04 distinct events from one author are parsed once each without adding independent voices', () => {
 const rows = [clue(1), { ...clue(2), authorRoot: clue(1).authorRoot, root: clue(1).root }];
 assert.equal(screenRoundRobin([...rows, ...rows], now).length, 2);
 assert.equal(independentClues(rows).length, 1);
});
