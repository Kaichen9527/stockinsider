import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateFinancialRequirements,financialCoverageGaps} from './candidate-financial-coverage.ts';
test('method requirements include actual denominators and cycle periods',()=>{
  assert.equal(candidateFinancialRequirements('半導體記憶體').quarters,20);
  assert.ok(candidateFinancialRequirements('general').keys.includes('diluted_weighted_average_shares'));
  assert.ok(candidateFinancialRequirements('金融').keys.includes('common_shares_outstanding'));
});
test('pending rows never make a missing quarter complete',()=>{
  const cutoff='2026-09-08T00:00:00Z';
  const gaps=financialCoverageGaps([],'general',cutoff);
  assert.ok(gaps.some(g=>g.periodEnd==='2026-06-30'));
  const rows=gaps.map(g=>({fact_key:g.factKey,period_start:`${g.periodEnd.slice(0,4)}-${String(Number(g.periodEnd.slice(5,7))-2).padStart(2,'0')}-01`,period_end:g.periodEnd,duration_kind:'quarterly',provider:'mops',authority_tier:'official_filing',validation_status:'pending',filing_published_at:'2026-08-20T00:00:00Z',source_timestamp:'2026-08-20T00:00:00Z',collected_at:'2026-08-20T00:00:00Z',recorded_at:'2026-08-20T00:00:00Z'}));
  assert.equal(financialCoverageGaps(rows,'general',cutoff).length,gaps.length);
  assert.equal(financialCoverageGaps(rows.map(r=>({...r,validation_status:'validated'})),'general',cutoff).length,0);
  assert.equal(financialCoverageGaps(rows.map(r=>({...r,validation_status:'validated',validation_recorded_at:'2026-09-09T00:00:00Z'})),'general',cutoff).length,gaps.length);
  const ytd=rows.map(r=>({...r,validation_status:'validated',period_start:`${r.period_end.slice(0,4)}-01-01`}));
  assert.ok(financialCoverageGaps(ytd,'general',cutoff).some(g=>g.factKey==='quarterly_diluted_eps' && g.periodEnd==='2026-06-30'));
});
