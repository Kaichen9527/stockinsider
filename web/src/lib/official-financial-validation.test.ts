import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOfficialFinancialFact, officialFinancialValidationSubjects} from './official-financial-validation.ts';
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
test('a later conflicting peer revalidates and rejects the previously accepted subject', () => {
  const accepted = {...fact, validation_status:'validated', consistency_valid:true};
  const arrived = {...fact, fact_id:'b', value:2, validation_status:'pending'};
  const subjects = officialFinancialValidationSubjects([accepted, arrived, {...fact, fact_id:'c', validation_status:'rejected'}]);
  assert.deepEqual(subjects.map(row=>row.fact_id), ['a','b']);
  const original = validateOfficialFinancialFact(accepted,[accepted],source,cutoff);
  const rechecked = validateOfficialFinancialFact(accepted,[accepted,arrived],source,cutoff);
  assert.equal(original.status,'validated');
  assert.equal(rechecked.status,'rejected');
  assert.notEqual(original.inputHash,rechecked.inputHash);
});
test('validation output metadata and peer ordering do not mint new evidence hashes', () => {
  const pending = {...fact,validation_status:'pending'};
  const accepted = {...fact,validation_status:'validated',validation_recorded_at:cutoff,schema_valid:true,
    unit_valid:true,point_in_time_valid:true,consistency_valid:true};
  assert.equal(validateOfficialFinancialFact(pending,[pending],source,cutoff).inputHash,
    validateOfficialFinancialFact(accepted,[accepted],source,cutoff).inputHash);
  const peer = {...fact,fact_id:'b'};
  assert.equal(validateOfficialFinancialFact(fact,[fact,peer],source,cutoff).inputHash,
    validateOfficialFinancialFact(fact,[peer,fact],source,cutoff).inputHash);
});
test('conflicting accounting operands yield identical rejection and hash in either order', () => {
  const peers=[['quarterly_pretax_income',100000],['quarterly_pretax_income',200000],['quarterly_income_tax_expense',20000],['quarterly_net_income',80000]]
    .map(([fact_key,value],index)=>({...fact,fact_id:String(index),fact_key,value}));
  const a=validateOfficialFinancialFact(peers[3],peers,source,cutoff);
  const b=validateOfficialFinancialFact(peers[3],[...peers].reverse(),source,cutoff);
  assert.equal(a.status,'rejected');assert.equal(b.status,'rejected');
  assert.deepEqual(a,b);
});
