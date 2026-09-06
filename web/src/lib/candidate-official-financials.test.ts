import assert from 'node:assert/strict';
import test from 'node:test';
import { financialBridgeAcquisitionQuarters, parseCandidateMopsFacts, selectCandidateFilingPeriodFacts } from './candidate-official-financials.ts';
import { fetchFinMindFinancialFallback, parseFinMindFinancialFacts } from './finmind-financial-fallback.ts';

test('candidate official MOPS history accepts only consolidated year-to-date facts with an auditable filing date', () => {
    const html = `
      <xbrli:context id="good"><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
      <xbrli:context id="segment"><xbrli:scenario><xbrldi:explicitMember>division</xbrldi:explicitMember></xbrli:scenario><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
      <ix:nonNumeric name="tifrs-notes:ReviewAuditDate">115/08/10</ix:nonNumeric>
      <ix:nonFraction name="ifrs-full:Revenue" contextRef="good" unitRef="TWD">1,200</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:GrossProfit" contextRef="good" unitRef="TWD">500</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:ProfitLossFromOperatingActivities" contextRef="good" unitRef="TWD">250</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:ProfitLossAttributableToOwnersOfParent" contextRef="good" unitRef="TWD">180</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:DilutedEarningsPerShare" contextRef="good" unitRef="EarningsPerShare">1.8</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:BasicEarningsPerShare" contextRef="good" unitRef="EarningsPerShare">1.9</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:WeightedAverageNumberOfDilutedSharesOutstanding" contextRef="good" unitRef="Shares">100</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:WeightedAverageNumberOfSharesOutstanding" contextRef="good" unitRef="Shares">99</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:Revenue" contextRef="segment" unitRef="TWD">9999</ix:nonFraction>
      ${' '.repeat(120)}
    `;
    const facts = parseCandidateMopsFacts(html, {
      stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE',
      sourceUrl: 'https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2330&SYEAR=115&SSEASON=2&REPORT_ID=C',
      collectedAt: '2026-08-11T00:00:00Z',
    });
    assert.deepEqual(facts.map((row) => row.factKey).sort(), [
      'basic_weighted_average_shares', 'diluted_weighted_average_shares', 'quarterly_basic_eps', 'quarterly_diluted_eps', 'quarterly_gross_profit',
      'quarterly_net_income_attributable_to_common', 'quarterly_operating_income', 'quarterly_revenue',
    ]);
    assert.equal(facts.find((row) => row.factKey === 'quarterly_revenue')?.value, 1200);
    assert.equal(facts.every((row) => row.periodStart === '2026-01-01' && row.filingPublishedAt === '2026-08-11T00:00:00.000Z' && row.sourceTimestamp === '2026-08-11T00:00:00.000Z'), true);
    assert.equal(facts.every((row) => row.provider === 'mops'), true);
});

test('official financial refresh completes durable MOPS and TPEx jobs atomically', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./candidate-official-financials.ts', import.meta.url), 'utf8');
  assert.match(source, /complete_candidate_financial_acquisition_job_v4/u);
  assert.match(source, /record_candidate_financial_fallback_v5/u);
  assert.match(source, /fetchFinMindFinancialFallback/u);
  assert.match(source, /TPEX_JOB_KEYS/u);
  assert.match(source, /claim_candidate_financial_acquisition_jobs_v4/u);
  assert.match(source, /FINANCIAL_JOB_LEASE_MS = 45 \* 60_000/u);
  assert.match(source, /remainingJobs/u);
  assert.match(source, /claimedJobs: claimedJobCount/u);
  assert.match(source, /enqueueMissing !== false/u);
  assert.doesNotMatch(source, /rpc\('append_financial_fact_v3'/u);
});

test('a MOPS acquisition job persists only its requested period and leaves comparative contexts to their own job', () => {
  const fact = (periodEnd: string) => ({
    stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', factKey: 'quarterly_revenue',
    periodStart: `${periodEnd.slice(0, 4)}-01-01`, periodEnd, durationKind: 'quarterly' as const,
    value: 1, unit: 'TWD' as const, provider: 'mops' as const, authorityTier: 'official_filing' as const,
    estimateKind: 'reported' as const, estimateHorizon: 'reported_period' as const,
    filingPublishedAt: '2026-09-06T12:00:00Z', sourceTimestamp: '2026-09-06T12:00:00Z',
    collectedAt: '2026-09-06T12:00:00Z', filingRestatementId: null, sourceRef: `twse-mops-inline:${periodEnd}:2330:test`,
  });
  assert.deepEqual(selectCandidateFilingPeriodFacts([fact('2025-06-30'), fact('2024-06-30')], '2025-06-30').map((row) => row.periodEnd), ['2025-06-30']);
});

test('financial acquisition includes the earliest fiscal-year prerequisites needed to decumulate eight quarters', () => {
  assert.deepEqual(financialBridgeAcquisitionQuarters('2026-09-06T13:30:00+08:00').slice(-2), [
    { year: 2024, quarter: 1 }, { year: 2024, quarter: 2 },
  ]);
  assert.equal(financialBridgeAcquisitionQuarters('2026-09-06T13:30:00+08:00').length, 10);
});

test('instant balance and outstanding-share facts retain null periodStart', () => {
  const html = `
    <xbrli:context id="instant"><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
    <ix:nonNumeric name="tifrs-notes:ReviewAuditDate">115/08/10</ix:nonNumeric>
    <ix:nonFraction name="ifrs-full:EquityAttributableToOwnersOfParent" contextRef="instant" unitRef="TWD">1,000</ix:nonFraction>
    <ix:nonFraction name="ifrs-full:CashAndCashEquivalents" contextRef="instant" unitRef="TWD">200</ix:nonFraction>
    <ix:nonFraction name="ifrs-full:NumberOfSharesOutstanding" contextRef="instant" unitRef="Shares">100</ix:nonFraction>
    ${' '.repeat(120)}
  `;
  const facts = parseCandidateMopsFacts(html, {
    stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE',
    sourceUrl: 'https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2330&SYEAR=115&SSEASON=2&REPORT_ID=C',
    collectedAt: '2026-08-11T00:00:00Z',
  });
  assert.deepEqual(facts.map((fact) => [fact.factKey, fact.periodStart, fact.durationKind]).sort(), [
    ['cash_and_equivalents', null, 'instant'], ['shares_outstanding', null, 'instant'], ['total_equity', null, 'instant'],
  ]);
});

test('FinMind fallback keeps quarterly income and instant balance facts distinct', () => {
  const candidate = { stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330' };
  const collectedAt = '2026-09-06T12:00:00.000Z';
  const income = parseFinMindFinancialFacts({
    dataset: 'TaiwanStockFinancialStatements', candidate, periodEnd: '2025-06-30', collectedAt,
    rows: [
      { date: '2025-06-30', stock_id: '2330', type: 'Revenue', value: 1000, origin_name: '營業收入' },
      { date: '2025-06-30', stock_id: '2330', type: 'IncomeAfterTaxes', value: 120, origin_name: '本期淨利' },
      { date: '2025-06-30', stock_id: '2330', type: 'EPS', value: 4.5, origin_name: '基本每股盈餘' },
      { date: '2025-03-31', stock_id: '2330', type: 'Revenue', value: 999, origin_name: 'wrong period' },
    ],
  });
  const balance = parseFinMindFinancialFacts({
    dataset: 'TaiwanStockBalanceSheet', candidate, periodEnd: '2025-06-30', collectedAt,
    rows: [
      { date: '2025-06-30', stock_id: '2330', type: 'Equity', value: 800, origin_name: '權益' },
      { date: '2025-06-30', stock_id: '2330', type: 'EquityAttributableToOwnersOfParent', value: 700, origin_name: '母公司權益' },
      { date: '2025-06-30', stock_id: '2330', type: 'CashAndCashEquivalents', value: 90, origin_name: '現金' },
    ],
  });
  assert.deepEqual(income.map((fact) => [fact.factKey, fact.periodStart, fact.durationKind, fact.authorityTier]), [
    ['quarterly_revenue', '2025-04-01', 'quarterly', 'finmind_mirror'],
    ['quarterly_net_income', '2025-04-01', 'quarterly', 'finmind_mirror'],
    ['quarterly_basic_eps', '2025-04-01', 'quarterly', 'finmind_mirror'],
  ]);
  assert.deepEqual(balance.map((fact) => [fact.factKey, fact.value, fact.periodStart, fact.durationKind]), [
    ['total_equity', 700, null, 'instant'], ['cash_and_equivalents', 90, null, 'instant'],
  ]);
  assert.equal([...income, ...balance].every((fact) => fact.filingPublishedAt === collectedAt && fact.provider === 'finmind'), true);
});

test('FinMind financial fallback is period-bounded and works anonymously without leaking a credential', async () => {
  const urls: string[] = [];
  const candidate = { stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330' };
  const result = await fetchFinMindFinancialFallback({
    candidate, periodEnd: '2025-12-31', collectedAt: '2026-09-06T12:00:00.000Z', token: '',
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      const dataset = new URL(String(url)).searchParams.get('dataset');
      return new Response(JSON.stringify({ status: 200, data: dataset === 'TaiwanStockFinancialStatements'
        ? [{ date: '2025-12-31', stock_id: '2330', type: 'Revenue', value: 123, origin_name: '營業收入' }]
        : [{ date: '2025-12-31', stock_id: '2330', type: 'TotalAssets', value: 456, origin_name: '資產總計' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(result.credentialMode, 'anonymous');
  assert.equal(result.facts.length, 2);
  assert.equal(urls.length, 2);
  assert.equal(urls.every((url) => new URL(url).origin === 'https://api.finmindtrade.com'
    && new URL(url).searchParams.get('start_date') === '2025-12-31'
    && new URL(url).searchParams.get('end_date') === '2025-12-31'), true);
});

test('FinMind fallback refuses to terminally complete when one required statement has no mapped facts', async () => {
  const candidate = { stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330' };
  await assert.rejects(fetchFinMindFinancialFallback({
    candidate, periodEnd: '2025-12-31', collectedAt: '2026-09-06T12:00:00.000Z', token: '',
    fetchImpl: async (url) => {
      const dataset = new URL(String(url)).searchParams.get('dataset');
      return new Response(JSON.stringify({ status: 200, data: dataset === 'TaiwanStockFinancialStatements'
        ? [{ date: '2025-12-31', stock_id: '2330', type: 'Revenue', value: 123, origin_name: '營業收入' }]
        : [{ date: '2025-12-31', stock_id: '2330', type: 'Unknown', value: 456, origin_name: '未知欄位' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }), /finmind_incomplete_period_response/u);
});
