import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConservativeOfficialScenario, buildEvEbitdaScenario, buildForwardBvpsPbScenario, buildForwardEarningsScenario, buildTurnaroundEvSalesScenario } from './candidate-valuation.ts';
import { normalizedCycleYearsObserved } from './candidate-financial-normalization.ts';
import { candidatePriceRefreshDepth, collectBatchedAuthorityRows, collectPagedAuthorityRows, financialFactAvailableAt, isCandidateHistoricalPriceAccessEnabled, isTransientResearchInfrastructureError, partitionCandidateMentionsByCutoff, rotatingShard } from './candidate-research-policy.ts';

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

test('complete authority reads reject truncation rather than reporting false coverage', async () => {
  const rows = Array.from({length:1001},(_,i)=>i);
  await assert.rejects(collectPagedAuthorityRows(async (from,to)=>rows.slice(from,to+1),
    {pageSize:500,maxRows:1000,requireComplete:true}),/authority_pagination_overflow/);
  assert.equal((await collectPagedAuthorityRows(async (from,to)=>rows.slice(0,1000).slice(from,to+1),
    {pageSize:500,maxRows:1000,requireComplete:true})).length,1000);
});

test('run freezes its authority cutoff after live acquisition, not the old global Shadow time', async () => {
  const {readFile} = await import('node:fs/promises');
  const source=await readFile(new URL('./candidate-research.ts',import.meta.url),'utf8');
  assert.ok(source.indexOf('const acquiredRows = await mapLimit') < source.indexOf('const authorityCutoff = evaluatedAt'));
  assert.match(source,/fetchTwStockRevenue\(stock\.symbol, 4\)/u);
  assert.doesNotMatch(source,/fetchTwStockRevenue\(stock\.symbol,\s*16\)/u);
  assert.equal((source.match(/rpc\('read_financial_facts_for_stocks_as_of'/gu) || []).length,2);
  assert.doesNotMatch(source,/rpc\('read_financial_facts_as_of'/u);
  const classifier=source.slice(source.indexOf('const researchStock = async'));
  assert.doesNotMatch(classifier,/await fetchTwStockDailyBars\(/);
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

test('forward BVPS x PB reconciles common equity and uses historical quartiles', () => {
  const scenario = buildForwardBvpsPbScenario({
    price: 20, startingCommonEquity: 1_000, endingCommonShares: 100,
    projectedCommonIncome: { bear: 0, base: 100, bull: 200 },
    projectedDividends: { bear: 10, base: 10, bull: 10 },
    projectedCapitalAndOci: { bear: -10, base: 0, bull: 10 },
    historicalPbRatios: Array(48).fill(1), targetPeriodEnd: '2027-06-30',
  });
  assert.ok(scenario);
  assert.deepEqual(scenario.forwardBvps, { bear: 9.8, base: 10.9, bull: 12 });
  assert.deepEqual(scenario.endingCommonEquity, { bear: 980, base: 1090, bull: 1200 });
  assert.equal(scenario.baseTarget, 10.9);
  assert.equal(scenario.primaryMethod, 'forward_bvps_pb');
  assert.equal(scenario.targetPeriodEnd, '2027-06-30');
});

test('forward BVPS x PB refuses insufficient history or invalid ending shares', () => {
  const input = {
    price: 20, startingCommonEquity: 1_000, endingCommonShares: 100,
    projectedCommonIncome: { bear: 0, base: 100, bull: 200 },
    projectedDividends: { bear: 0, base: 0, bull: 0 },
    projectedCapitalAndOci: { bear: 0, base: 0, bull: 0 },
    historicalPbRatios: Array(47).fill(1), targetPeriodEnd: '2027-06-30',
  };
  assert.equal(buildForwardBvpsPbScenario(input), null);
  assert.equal(buildForwardBvpsPbScenario({ ...input, endingCommonShares: 0, historicalPbRatios: Array(48).fill(1) }), null);
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
  assert.equal(candidatePriceRefreshDepth(sessions.slice(0, 240), '2025-12-21'), 1320);
  assert.equal(candidatePriceRefreshDepth(sessions.slice(0, 240), '2025-12-20'), 1320);
  const complete = Array.from({length:1320},(_,i) => new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  assert.equal(candidatePriceRefreshDepth(complete,complete.at(-1)!),0);
  assert.equal(candidatePriceRefreshDepth(complete,'2026-09-08'),5);
});

test('new validation does not backdate a historical research cutoff', () => {
  const fact = { filing_published_at:'2026-09-01T00:00:00Z',source_timestamp:'2026-09-01T00:00:00Z',collected_at:'2026-09-01T00:00:00Z',recorded_at:'2026-09-01T00:00:00Z',validation_recorded_at:'2026-09-08T10:00:00Z' };
  assert.equal(financialFactAvailableAt(fact,'2026-09-07T10:00:00Z'),false);
  assert.equal(financialFactAvailableAt(fact,'2026-09-08T11:00:00Z'),true);
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

test('weekend and post-close mentions enter production without mutating the frozen shadow cohort', () => {
  const mentions = [
    { stock_id: 'before-close', available_at: '2026-09-04T10:20:00Z' },
    { stock_id: 'weekend', available_at: '2026-09-05T03:00:00Z' },
    { stock_id: 'future', available_at: '2026-09-07T03:00:01Z' },
  ];
  const windows = partitionCandidateMentionsByCutoff(
    mentions,
    '2026-09-07T03:00:00Z',
    '2026-09-04T18:30:00+08:00',
  );
  assert.deepEqual(windows.production.map((row) => row.stock_id), ['before-close', 'weekend']);
  assert.deepEqual(windows.shadow.map((row) => row.stock_id), ['before-close']);
});

test('candidate research uses its own source and financial cutoffs without global Shadow', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /loadCandidateMentions\(supabase, historyCutoff, productionSourceCutoff\)/u);
  const production = source.slice(0,source.indexOf('export async function recordCandidateShadowObservation'));
  assert.doesNotMatch(production, /from\('candidate_shadow_manifests'\)/u);
  assert.match(production, /const authorityCutoff = evaluatedAt/u);
  assert.ok(production.indexOf('evaluatedAt = new Date().toISOString()') > production.indexOf('await refreshCandidateOfficialFinancials'));
  assert.match(source, /const universe = proposedUniverse/u);
});

test('missing official price history still publishes a source-specific fact detail without promotion inputs', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /reason === 'official_price_history_missing'[\s\S]{0,9000}candidate_detail_snapshots/u);
  assert.match(source, /valuation: \{ status: 'missing', currentPrice: null/u);
  assert.match(source, /research_readiness: result\.detailRevisionId \? 'data_gap' : 'unavailable'/u);
  assert.match(source, /failClosedWriteFailures = items\.filter\(\(item\) => item\.snapshotError \|\| item\.detailError\)/u);
});

test('candidate detail fact binding deduplicates historical rows but still requires every wanted identity', async () => {
  const {readFile} = await import('node:fs/promises');
  const source=await readFile(new URL('./candidate-research.ts',import.meta.url),'utf8');
  assert.match(source,/const revisionFactByIdentity = new Map/u);
  assert.match(source,/\[\.\.\.wantedIds\]\.some\(\(factIdentity\) => !revisionFactByIdentity\.has\(factIdentity\)\)/u);
  assert.doesNotMatch(source,/revisionFacts\.length !== wantedIds\.size/u);
  const factRead = source.slice(source.indexOf("const factRead = await pagedResearchResult"), source.indexOf("if (factRead.data.length === 10000)"));
  assert.doesNotMatch(factRead,/gte\('available_at'/u);
  assert.doesNotMatch(factRead,/lte\('available_at'/u);
  assert.match(factRead,/\.eq\('stock_id', stock\.id\)[\s\S]*\.order\('fact_id'\)/u);
});

test('candidate run summary stays bounded and leaves per-stock evidence in the item ledger', async () => {
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('./candidate-research.ts',import.meta.url),'utf8');
  const finalization=source.slice(source.indexOf('const items = await mapLimit'));
  assert.match(finalization,/summary: \{ itemCount: items\.length, statusCounts:/u);
  assert.match(finalization,/officialFinancialGapCounts: countFinancialGaps\(financialGapByStock\)/u);
  assert.doesNotMatch(finalization,/summary: \{ items[,}]/u);
  assert.doesNotMatch(finalization,/officialFinancialGaps: Object\.fromEntries\(financialGapByStock\)/u);
});

test('production reruns retain a fixed financial availability cutoff', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /lte\('filing_published_at', authorityCutoff\)[\s\S]{0,180}lte\('recorded_at', authorityCutoff\)/u);
});

test('price provenance is retained on persisted bars and blocks stage promotion when ineligible', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  const history = await readFile(new URL('./candidate-history-backfill.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../../migrations/20260911_candidate_history_backfill_v1.sql', import.meta.url), 'utf8');
  const dailyAppender = history.slice(history.indexOf('export async function persistCandidateDailyPriceEvidence'));
  // Approved PIT repair: only newly acquired daily bars enter the append RPC.
  // Cached history keeps its first availability and cannot be re-stamped by research.
  assert.match(source, /await persistCandidateDailyPriceEvidence\(\{client:supabase,stockId:stock\.id,[\s\S]{0,180}bars:dailyBars \|\| \[\],officialSessions:marketSessions,latestSession:latestMarketSession/u);
  assert.doesNotMatch(source, /from\('official_(?:price|multiple)_history'\)\s*\.(?:upsert|insert|update|delete)\(/u);
  assert.match(dailyAppender, /options\.bars\.length > 5/u);
  assert.match(dailyAppender, /bar\.provider !== 'official_primary' \|\| bar\.authorityTier !== 'official_primary'/u);
  assert.match(dailyAppender, /if \(!officialPriceEndpoint\) continue/u);
  assert.match(dailyAppender, /rpc\('complete_candidate_history_month_v1'/u);
  assert.match(dailyAppender, /p_source_url: group\.sourceUrl[\s\S]{0,160}p_prices: group\.bars, p_multiples: \[\]/u);
  assert.match(migration, /v_available_at TIMESTAMPTZ:=clock_timestamp\(\)/u);
  assert.match(migration, /v_row->>'authorityTier' IS DISTINCT FROM 'official_primary'/u);
  assert.match(migration, /v_row->>'provider' IS DISTINCT FROM 'official_primary'/u);
  assert.match(migration, /v_row->>'sourceUrl' IS DISTINCT FROM p_source_url/u);
  assert.match(migration, /ON CONFLICT\(stock_id,session_date\) DO NOTHING/u);
  assert.match(source, /authority\.data\.filter\(\(row\) => isOfficialCandidatePriceProvider\(row\.provider\)\)/u);
  assert.match(source, /return isOfficialCandidatePriceSource\(row\.source_url\)/u);
  assert.match(source, /dailyHistoryConflicts:dailyEvidence\.conflicts/u);
  assert.match(source, /const historyConflicts = \[\.\.\.officialHistoryBackfill\.conflicts,\.\.\.acquired\.dailyHistoryConflicts\]/u);
  assert.match(source, /valuationPolicy\.canPublishTarget && historyConflictBlockers\.length === 0 \? rawValuation : null/u);
  assert.match(source, /const usesFallbackEvidence = !priceEvidence\.promotionEligible/u);
  assert.match(source, /staleOrFallback: usesFallbackEvidence/u);
  assert.match(source, /publication_phase: baseInput\.staleOrFallback \? 'preliminary'/u);
  assert.doesNotMatch(source, /publication_phase: 'final' as const/u);
});

test('history authority reconciliation preserves displaced mirrors and never overwrites exchange-owner conflicts', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(new URL('../../../migrations/20260914_candidate_history_authority_reconciliation_v1.sql', import.meta.url), 'utf8');
  assert.match(migration, /candidate_history_authority_reconciliations_v1/u);
  assert.match(migration, /candidate_history_authority_reconciliations_recent_v1/u);
  assert.match(migration, /non_authoritative_cache_replaced_by_exchange/u);
  assert.match(migration, /v_price\.source_url!~'\^https:\/\/www\\\.\(twse/u);
  assert.match(migration, /ELSIF NOT v_values_equal THEN v_conflict:=true; END IF;/u);
  assert.match(migration, /old_values,old_source_url,old_provenance,new_values,new_source_url/u);
  assert.match(migration, /v_prior_conflict_reason<>'official_history_existing_row_conflict' OR p_status<>'complete'/u);
  assert.doesNotMatch(migration, /UPDATE public\.official_price_history[\s\S]{0,500}WHERE stock_id=p_stock_id AND session_date=v_session;[\s\S]{0,120}DELETE/u);
});
