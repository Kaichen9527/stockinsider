import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateFinancialRequirements,financialCoverageGaps,financialCoverageSummary} from './candidate-financial-coverage.ts';
import {classifyCandidateBusiness,latestDueFinancialQuarter,latestDueFinancialQuarters} from './candidate-financial-policy.ts';
import {discreteReportedQuarters} from './forward-earnings-bridge.ts';
import {officialFinancialValidationSubjects,validateOfficialFinancialFact} from './official-financial-validation.ts';
test('method requirements include actual denominators and cycle periods',()=>{
  assert.equal(candidateFinancialRequirements('半導體記憶體').quarters,20);
  assert.ok(candidateFinancialRequirements('general').keys.includes('diluted_weighted_average_shares'));
  assert.ok(candidateFinancialRequirements('金融').keys.includes('common_shares_outstanding'));
});

test('shared business classification gives all cyclical authority labels twenty financial quarters', () => {
  for (const sector of ['化工', '造紙', '原物料', '塑膠工業', '塑化', '鋼鐵', '水泥', '航運', '記憶體', '面板',
    'Chemical industry', 'Paper', 'Raw materials', 'Plastics']) {
    assert.equal(classifyCandidateBusiness(sector), 'cyclical', sector);
    assert.equal(candidateFinancialRequirements(sector).quarters, 20, sector);
    assert.equal(financialCoverageGaps([], sector, '2026-10-10T12:00:00+08:00').length, 120, sector);
  }
});

test('financial labels including holding companies and securities use the same eight-quarter route', () => {
  for (const sector of ['金控', '證券', '金融', '銀行', '保險', '期貨', 'Financial holding', 'Securities', 'Banking']) {
    assert.equal(classifyCandidateBusiness(sector), 'financial', sector);
    const requirement = candidateFinancialRequirements(sector);
    assert.equal(requirement.quarters, 8, sector);
    assert(requirement.keys.includes('common_equity_attributable_to_owners'), sector);
    assert(!requirement.keys.includes('quarterly_revenue'), sector);
  }
  assert.equal(classifyCandidateBusiness('電子零組件'), 'general');
  assert.equal(candidateFinancialRequirements('電子零組件').quarters, 8);
});

test('October acquisition and coverage select due Q2, not the recently closed but not-yet-due Q3', () => {
  const cutoff = '2026-10-10T12:00:00+08:00';
  assert.deepEqual(latestDueFinancialQuarter(cutoff), {
    year: 2026, quarter: 2, periodEnd: '2026-06-30', normalDeadlineAt: '2026-08-14T15:59:59.000Z',
  });
  const periods = latestDueFinancialQuarters(cutoff, 8);
  assert.equal(periods.length, 8);
  assert.equal(periods.at(-1)?.periodEnd, '2024-09-30');
  assert(financialCoverageGaps([], 'general', cutoff).every((gap) => gap.periodEnd <= '2026-06-30'));
  assert.equal(latestDueFinancialQuarter('2026-11-14T23:59:58+08:00').quarter, 2);
  assert.equal(latestDueFinancialQuarter('2026-11-15T00:00:00+08:00').quarter, 3);
});

test('due-quarter rollover is Taipei-aware and annual filings do not become due at year-end', () => {
  assert.equal(latestDueFinancialQuarter('2027-01-01T00:00:00+08:00').periodEnd, '2026-09-30');
  assert.equal(latestDueFinancialQuarter('2027-03-31T23:59:58+08:00').periodEnd, '2026-09-30');
  assert.equal(latestDueFinancialQuarter('2027-04-01T00:00:00+08:00').periodEnd, '2026-12-31');
  assert.equal(latestDueFinancialQuarter('2027-05-16T00:00:00+08:00').periodEnd, '2027-03-31');
  assert.throws(() => latestDueFinancialQuarter('not-a-date'), /invalid_financial_coverage_cutoff/u);
  for (const count of [0, -1, 1.5, Infinity, 121]) assert.throws(() => latestDueFinancialQuarters(cutoff, count), /invalid_financial_quarter_count/u);
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
test('coverage summary preserves method-specific denominator and opening common-equity balance', () => {
  const empty = financialCoverageSummary([], '造紙', cutoff);
  assert.equal(empty.requiredFieldPeriods, 120);
  assert.equal(empty.verifiedFieldPeriods, 0);
  assert.equal(empty.completenessPct, 0);
  const financial = financialCoverageSummary(coveredRows('金控'), '金控', cutoff);
  assert.equal(financial.requiredFieldPeriods, 25);
  assert.equal(financial.verifiedFieldPeriods, 25);
  assert.equal(financial.completenessPct, 100);
  assert.equal(financial.status, 'complete');
});
test('conflicting restatements remain gaps just as the valuation consumer rejects the quarter', () => {
  const rows = coveredRows();
  rows.push({...rows[0], fact_id: 'restated', value: 200});
  const points = discreteReportedQuarters(rows.map(r => ({factId:r.fact_id,factKey:r.fact_key,
    periodEnd:r.period_end,periodStart:r.period_start,value:r.value,unit:r.unit,sourceRef:'official'})), 'quarterly_revenue');
  assert.equal(points.length, 7);
  assert.deepEqual(financialCoverageGaps(rows, 'general', cutoff), [{factKey:'quarterly_revenue',periodEnd:'2026-06-30'}]);
});
test('a fully covered issuer still has validation work after a pending conflict arrives',()=>{
  const stockId='11111111-1111-4111-8111-111111111111';
  const rows=coveredRows().map(r=>({...r,stock_id:stockId,source_ref:'twse-openapi:fixture',
    schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true}));
  const all=[...rows,{...rows[0],fact_id:'late-conflict',value:200,validation_status:'pending'}];
  assert.deepEqual(financialCoverageGaps(all,'general',cutoff),[]);
  const selected=officialFinancialValidationSubjects(all);
  assert.equal(selected.length,49);
  const result=validateOfficialFinancialFact(selected[0],all,{source_url:'https://www.twse.com.tw/openapi/test',source_sha256:'a'.repeat(64),locator:{table:'income'}},cutoff);
  assert.equal(result.status,'rejected');assert.equal(result.consistencyValid,false);
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
