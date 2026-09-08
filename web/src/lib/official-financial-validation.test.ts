import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOfficialFinancialFact} from './official-financial-validation.ts';
const fact={fact_id:'a',stock_id:'11111111-1111-1111-1111-111111111111',fact_key:'quarterly_revenue',period_start:'2026-01-01',period_end:'2026-03-31',duration_kind:'quarterly',value:1000000,unit:'TWD',estimate_kind:'reported',provider:'tpex',authority_tier:'official_filing',source_ref:'tpex-openapi:test',filing_restatement_id:'v1',filing_published_at:'2026-05-15T00:00:00Z',source_timestamp:'2026-05-15T00:00:00Z',collected_at:'2026-09-08T00:00:00Z',recorded_at:'2026-09-08T00:00:01Z'};
const source={source_url:'https://www.tpex.org.tw/openapi/v1/test',source_sha256:'a'.repeat(64),locator:{table:'generalIncome'}};
const cutoff='2026-09-08T01:00:00Z';
test('valid official observations require provenance and explicit dimensional checks',()=>{
  const r=validateOfficialFinancialFact(fact,[fact],source,cutoff);
  assert.equal(r.status,'validated');assert.equal(r.schemaValid,true);assert.equal(r.unitValid,true);assert.equal(r.pointInTimeValid,true);assert.equal(r.consistencyValid,true);
  assert.equal(validateOfficialFinancialFact(fact,[fact],null,cutoff).status,'rejected');
  assert.equal(validateOfficialFinancialFact(fact,[fact],{...source,source_url:'https://tpex.org.tw.evil.test/x'},cutoff).status,'rejected');
});
test('unit errors, invalid dates and future availability cannot be promoted',()=>{
  assert.equal(validateOfficialFinancialFact({...fact,unit:'TWD_thousand'},[fact],source,cutoff).unitValid,false);
  assert.equal(validateOfficialFinancialFact({...fact,period_end:'2026-02-30'},[fact],source,cutoff).schemaValid,false);
  assert.equal(validateOfficialFinancialFact({...fact,recorded_at:'2026-09-09T00:00:00Z'},[fact],source,cutoff).pointInTimeValid,false);
});
test('duplicate conflicts and available accounting identities are checked',()=>{
  assert.equal(validateOfficialFinancialFact(fact,[fact,{...fact,value:2}],source,cutoff).consistencyValid,false);
  const peers=[['quarterly_pretax_income',100000],['quarterly_income_tax_expense',20000],['quarterly_net_income',999999]].map(([fact_key,value])=>({...fact,fact_key,value}));
  const result=validateOfficialFinancialFact(peers[0],peers,source,cutoff);
  assert.equal(result.consistencyValid,false);assert.ok(result.checks.some(x=>x.includes('quarterly_pretax_income-')));
});
