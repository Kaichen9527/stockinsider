import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateFinancialRequirements,financialCoverageGaps} from './candidate-financial-coverage.ts';
import {discreteReportedQuarters} from './forward-earnings-bridge.ts';
test('method requirements include actual denominators and cycle periods',()=>{
  assert.equal(candidateFinancialRequirements('半導體記憶體').quarters,20);
  assert.ok(candidateFinancialRequirements('general').keys.includes('diluted_weighted_average_shares'));
  assert.ok(candidateFinancialRequirements('金融').keys.includes('common_shares_outstanding'));
});

const cutoff = '2026-09-08T00:00:00Z';
function coveredRows(sector = 'general') {
  return financialCoverageGaps([], sector, cutoff).map((gap, i) => {
    const instant = ['common_equity_attributable_to_owners', 'common_shares_outstanding'].includes(gap.factKey);
    return { fact_id: String(i), fact_key: gap.factKey, period_end: gap.periodEnd,
      period_start: instant ? null : `${gap.periodEnd.slice(0,4)}-${String(Number(gap.periodEnd.slice(5,7))-2).padStart(2,'0')}-01`,
      duration_kind: instant ? 'instant' : 'quarterly', value: 100,
      unit: gap.factKey === 'quarterly_diluted_eps' ? 'TWD_per_share'
        : ['common_shares_outstanding', 'diluted_weighted_average_shares'].includes(gap.factKey) ? 'share' : 'TWD',
      estimate_kind: 'reported', provider: 'mops', authority_tier: 'official_filing', validation_status: 'validated',
      filing_published_at: '2026-08-20T00:00:00Z', source_timestamp: '2026-08-20T00:00:00Z',
      collected_at: '2026-08-20T00:00:00Z', recorded_at: '2026-08-20T00:00:00Z' };
  });
}
test('conflicting restatements remain gaps just as the valuation consumer rejects the quarter', () => {
  const rows = coveredRows();
  rows.push({...rows[0], fact_id: 'restated', value: 200});
  const points = discreteReportedQuarters(rows.map(r => ({factId:r.fact_id,factKey:r.fact_key,
    periodEnd:r.period_end,periodStart:r.period_start,value:r.value,unit:r.unit,sourceRef:'official'})), 'quarterly_revenue');
  assert.equal(points.length, 7);
  assert.deepEqual(financialCoverageGaps(rows, 'general', cutoff), [{factKey:'quarterly_revenue',periodEnd:'2026-06-30'}]);
});
test('nonfinite values, units and estimates never close reported coverage', () => {
  for (const change of [{value:NaN},{unit:'USD'},{estimate_kind:'forecast'}]) {
    const rows = coveredRows();
    rows[0] = {...rows[0],...change};
    assert.ok(financialCoverageGaps(rows, 'general', cutoff).some(g => g.factKey === rows[0].fact_key && g.periodEnd === rows[0].period_end));
  }
});
test('monetary YTD decumulation follows consumers while EPS stays discrete', () => {
  const rows = coveredRows();
  const q2 = rows.find(r => r.fact_key === 'quarterly_revenue' && r.period_end === '2026-06-30')!;
  q2.period_start = '2026-01-01'; q2.value = 200;
  assert.equal(financialCoverageGaps(rows, 'general', cutoff).length, 0);
});
test('conflicting instant balances remain missing and reported BVPS can supply shares', () => {
  const rows = coveredRows('金融');
  const equity = rows.find(r => r.fact_key === 'common_equity_attributable_to_owners')!;
  assert.ok(financialCoverageGaps([...rows,{...equity,value:200}], '金融', cutoff)
    .some(g => g.factKey === equity.fact_key && g.periodEnd === equity.period_end));
  const derived = rows.map(r => r.fact_key === 'common_shares_outstanding'
    ? {...r,fact_key:'book_value_per_share',unit:'TWD_per_share'} : r);
  assert.equal(financialCoverageGaps(derived, '金融', cutoff).length, 0);
});
test('pending rows never make a missing quarter complete',()=>{
  const cutoff='2026-09-08T00:00:00Z';
  const gaps=financialCoverageGaps([],'general',cutoff);
  assert.ok(gaps.some(g=>g.periodEnd==='2026-06-30'));
  const rows=gaps.map(g=>({fact_id:g.factKey+g.periodEnd,value:100,unit:g.factKey==='quarterly_diluted_eps'?'TWD_per_share':g.factKey==='diluted_weighted_average_shares'?'share':'TWD',estimate_kind:'reported',fact_key:g.factKey,period_start:`${g.periodEnd.slice(0,4)}-${String(Number(g.periodEnd.slice(5,7))-2).padStart(2,'0')}-01`,period_end:g.periodEnd,duration_kind:'quarterly',provider:'mops',authority_tier:'official_filing',validation_status:'pending',filing_published_at:'2026-08-20T00:00:00Z',source_timestamp:'2026-08-20T00:00:00Z',collected_at:'2026-08-20T00:00:00Z',recorded_at:'2026-08-20T00:00:00Z'}));
  assert.equal(financialCoverageGaps(rows,'general',cutoff).length,gaps.length);
  assert.equal(financialCoverageGaps(rows.map(r=>({...r,validation_status:'validated'})),'general',cutoff).length,0);
  assert.equal(financialCoverageGaps(rows.map(r=>({...r,validation_status:'validated',validation_recorded_at:'2026-09-09T00:00:00Z'})),'general',cutoff).length,gaps.length);
  const ytd=rows.map(r=>({...r,validation_status:'validated',period_start:`${r.period_end.slice(0,4)}-01-01`}));
  assert.ok(financialCoverageGaps(ytd,'general',cutoff).some(g=>g.factKey==='quarterly_diluted_eps' && g.periodEnd==='2026-06-30'));
});
