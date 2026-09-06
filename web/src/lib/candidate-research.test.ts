import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConservativeOfficialScenario, buildForwardEarningsScenario } from './candidate-valuation.ts';
import { candidatePriceRefreshDepth, collectBatchedAuthorityRows, collectPagedAuthorityRows, isCandidateHistoricalPriceAccessEnabled, isTransientResearchInfrastructureError, rotatingShard } from './candidate-research-policy.ts';

test('candidate research retries transient infrastructure errors only', () => {
  assert.equal(isTransientResearchInfrastructureError('supabase.co | 520: Web server is returning an unknown error'), true);
  assert.equal(isTransientResearchInfrastructureError('upstream request timed out'), true);
  assert.equal(isTransientResearchInfrastructureError('official_multiple_coverage_below_48_of_60'), false);
  assert.equal(isTransientResearchInfrastructureError('official_stock_master_missing'), false);
});

test('candidate authority readers continue past the PostgREST 1000-row response cap', async () => {
  const authority = Array.from({ length: 1320 }, (_, index) => index);
  const calls: Array<[number, number]> = [];
  const rows = await collectPagedAuthorityRows(async (from, to) => {
    calls.push([from, to]);
    return authority.slice(from, to + 1);
  }, { maxRows: 1320 });
  assert.equal(rows.length, 1320);
  assert.deepEqual(calls, [[0, 999], [1000, 1319]]);
});

test('bounded pagination also retains source rows after the first response page', async () => {
  const sourceRows = Array.from({ length: 1979 }, (_, index) => `mention-${index}`);
  const rows = await collectPagedAuthorityRows(
    async (from, to) => sourceRows.slice(from, to + 1),
    { maxRows: 20000 },
  );
  assert.equal(rows.length, 1979);
  assert.equal(rows.at(-1), 'mention-1978');
});

test('large UUID filters are split into bounded URL batches and each response is paginated', async () => {
  const ids = Array.from({ length: 45 }, (_, index) => `stock-${index}`);
  const calls: Array<{ batch: string[]; from: number; to: number }> = [];
  const rows = await collectBatchedAuthorityRows(ids, async (batch, from, to) => {
    calls.push({ batch: [...batch], from, to });
    const available = batch.flatMap((id) => Array.from({ length: 60 }, (_, month) => `${id}:${month}`));
    return available.slice(from, to + 1);
  }, { batchSize: 20, pageSize: 1000, maxRowsPerBatch: 5000 });
  assert.equal(rows.length, 2700);
  assert.deepEqual(calls.map((call) => [call.batch.length, call.from, call.to]), [
    [20, 0, 999], [20, 1000, 1999],
    [20, 0, 999], [20, 1000, 1999],
    [5, 0, 999],
  ]);
});

const historicalPeRatios = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
const historicalPbRatios = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7];

test('official PE scenario holds reported multiple and uses conservative revenue pass-through', () => {
  const scenario = buildConservativeOfficialScenario({
    price: 100,
    epsTtm: 5,
    peRatio: 20,
    pbRatio: 3,
    revenueYoyPct: 20,
    sector: 'semiconductor',
    historicalPeRatios,
    historicalPbRatios,
  });
  assert(scenario);
  assert.equal(scenario.primaryMethod, 'forward_pe');
  assert.equal(scenario.growthFactor, 1.1);
  assert.equal(scenario.baseTarget, 110);
  assert.equal(scenario.baseUpsidePct, 10);
  assert(scenario.bearTarget < scenario.baseTarget);
  assert(scenario.bullTarget > scenario.baseTarget);
});

test('missing or loss-making official earnings do not manufacture targets', () => {
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: null, peRatio: null, pbRatio: null, revenueYoyPct: 40, sector: null, historicalPeRatios, historicalPbRatios }), null);
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: -1, peRatio: null, pbRatio: null, revenueYoyPct: 40, sector: 'technology', historicalPeRatios, historicalPbRatios }), null);
});

test('official exchange PE can supply its formula-implied trailing earnings without inventing EPS', () => {
  const scenario = buildConservativeOfficialScenario({ price: 100, epsTtm: null, peRatio: 20, pbRatio: null, revenueYoyPct: null, sector: 'technology', historicalPeRatios, historicalPbRatios });
  assert(scenario);
  assert.equal(scenario.operatingDriver, 5);
  assert.equal(scenario.operatingDriverSource, 'exchange_implied_ttm_eps');
  assert.equal(scenario.baseTarget, 100);
});

test('revenue growth pass-through is capped and cannot create unlimited upside', () => {
  const scenario = buildConservativeOfficialScenario({ price: 100, epsTtm: 5, peRatio: 20, pbRatio: null, revenueYoyPct: 500, sector: 'technology', historicalPeRatios, historicalPbRatios });
  assert(scenario);
  assert.equal(scenario.growthFactor, 1.15);
  assert.equal(scenario.baseTarget, 115);
});

test('reported price and PE stay internally consistent when EPS dates differ', () => {
  const scenario = buildConservativeOfficialScenario({ price: 90, epsTtm: 9, peRatio: 15, pbRatio: null, revenueYoyPct: 0, sector: 'technology', historicalPeRatios, historicalPbRatios });
  assert(scenario);
  assert.equal(scenario.baseTarget, 120, 'the lower exchange-implied earnings driver must constrain a mismatched EPS figure');
  assert.equal(scenario.baseMultiple, 20);
});

test('insufficient historical multiple evidence does not create a target', () => {
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: 5, peRatio: 20, pbRatio: null, revenueYoyPct: 20, sector: 'technology', historicalPeRatios: [18, 20], historicalPbRatios: [] }), null);
});

test('forward valuation requires a complete 48-month multiple distribution', () => {
  const tooShort = buildForwardEarningsScenario({ price: 100, bearEps: 4, baseEps: 5, bullEps: 6, historicalPeRatios: Array(47).fill(20) });
  assert.equal(tooShort, null);
  const result = buildForwardEarningsScenario({ price: 100, bearEps: 4, baseEps: 5, bullEps: 6, historicalPeRatios: Array.from({ length: 60 }, (_, index) => 12 + index / 10) });
  assert.equal(result?.primaryMethod, 'forward_pe');
  assert.ok((result?.bearTarget || 0) < (result?.baseTarget || 0));
  assert.ok((result?.baseTarget || 0) < (result?.bullTarget || 0));
});

test('candidate historical research is enabled unless production explicitly blocks unavailable official history', () => {
  assert.equal(isCandidateHistoricalPriceAccessEnabled(undefined), true);
  assert.equal(isCandidateHistoricalPriceAccessEnabled('true'), true);
  assert.equal(isCandidateHistoricalPriceAccessEnabled('false'), false);
});

test('candidate price refresh reads durable coverage before selecting a bounded fetch depth', () => {
  const sessions = Array.from({ length: 240 }, (_, index) => `2025-${String(Math.floor(index / 20) + 1).padStart(2, '0')}-${String(index % 20 + 1).padStart(2, '0')}`);
  assert.equal(candidatePriceRefreshDepth(sessions.slice(0, 239), '2025-12-20'), 1320);
  assert.equal(candidatePriceRefreshDepth(sessions.slice(0, 240), '2025-12-21'), 5);
  assert.equal(candidatePriceRefreshDepth(sessions.slice(0, 240), '2025-12-20'), 0);
});

test('financial refresh shards rotate past permanently incomplete issuers', () => {
  const backlog = Array.from({ length: 65 }, (_, index) => `stock-${index + 1}`);
  const first = rotatingShard(backlog, 0, 30);
  const second = rotatingShard(backlog, first.nextCursor, 30);
  const third = rotatingShard(backlog, second.nextCursor, 30);
  assert.deepEqual(first.items, backlog.slice(0, 30));
  assert.deepEqual(second.items, backlog.slice(30, 60));
  assert.deepEqual(third.items, [...backlog.slice(60), ...backlog.slice(0, 25)]);
  assert.equal(third.nextCursor, 25);
});
