import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConservativeOfficialScenario, buildEvEbitdaScenario, buildForwardEarningsScenario, buildTurnaroundEvSalesScenario } from './candidate-valuation.ts';
import { normalizedCycleYearsObserved } from './candidate-financial-normalization.ts';
import { candidatePriceRefreshDepth, collectBatchedAuthorityRows, collectPagedAuthorityRows, financialFactAvailableAt, isCandidateHistoricalPriceAccessEnabled, isTransientResearchInfrastructureError, rotatingShard } from './candidate-research-policy.ts';

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

test('EV/EBITDA only publishes with explicit debt, cash, shares, and its own multiple history', () => {
  const multiples = Array.from({ length: 48 }, (_, index) => 8 + index / 10);
  const result = buildEvEbitdaScenario({
    price: 100, bearEbitda: 80, baseEbitda: 100, bullEbitda: 120,
    historicalEvEbitdaMultiples: multiples, cashAndEquivalents: 50, totalDebt: 150, dilutedShares: 10,
  });
  assert.equal(result?.primaryMethod, 'ev_ebitda');
  assert.ok((result?.bearTarget || 0) < (result?.baseTarget || 0));
  assert.equal(buildEvEbitdaScenario({
    price: 100, bearEbitda: 80, baseEbitda: 100, bullEbitda: 120,
    historicalEvEbitdaMultiples: multiples, cashAndEquivalents: 50, totalDebt: -1, dilutedShares: 10,
  }), null);
});

test('turnaround EV/sales uses reported revenue and observed multiples without manufacturing earnings', () => {
  const multiples = Array.from({ length: 48 }, (_, index) => 1.5 + index / 100);
  const result = buildTurnaroundEvSalesScenario({
    price: 10, ttmRevenue: 100, historicalEvSalesMultiples: multiples,
    cashAndEquivalents: 40, totalDebt: 20, dilutedShares: 10,
  });
  assert.equal(result?.primaryMethod, 'ev_sales');
  assert.equal(result?.operatingDriver, 100);
  assert.ok((result?.bearTarget || 0) < (result?.baseTarget || 0));
  assert.equal(buildTurnaroundEvSalesScenario({
    price: 10, ttmRevenue: 0, historicalEvSalesMultiples: multiples,
    cashAndEquivalents: 40, totalDebt: 20, dilutedShares: 10,
  }), null);
});

test('twenty consecutive fiscal quarters satisfy a five-year normalized-cycle window', () => {
  const points = Array.from({ length: 20 }, (_, index) => {
    const quarter = index % 4;
    return { periodEnd: `${2021 + Math.floor(index / 4)}-${['03-31', '06-30', '09-30', '12-31'][quarter]}` };
  });
  assert.equal(normalizedCycleYearsObserved(points), 5);
  assert.equal(normalizedCycleYearsObserved(points.filter((_, index) => index !== 10)), 0);
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

test('financial facts obtained after evaluation cannot enter point-in-time valuation', () => {
  const fact = {
    filing_published_at: '2026-09-06T10:00:01Z',
    source_timestamp: '2026-09-06T10:00:01Z',
    collected_at: '2026-09-06T10:00:01Z',
    recorded_at: '2026-09-06T10:00:02Z',
  };
  assert.equal(financialFactAvailableAt(fact, '2026-09-06T10:00:00Z'), false);
  assert.equal(financialFactAvailableAt(fact, '2026-09-06T10:00:02Z'), true);
});

test('shadow reruns bind financial availability to the frozen manifest cutoff', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /lte\('filing_published_at', authorityCutoff\)[\s\S]{0,180}lte\('recorded_at', authorityCutoff\)/u);
});

test('price provenance is retained on persisted bars and blocks stage promotion when ineligible', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /provider: bar\.provider, authorityTier: bar\.authorityTier/u);
  assert.match(source, /staleOrFallback: usesFallbackEvidence/u);
  assert.match(source, /publication_phase: baseInput\.staleOrFallback \? 'preliminary'/u);
  assert.doesNotMatch(source, /publication_phase: 'final' as const/u);
});
