/** Synthetic temporal controls only; no actual quote, review or price authority. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {AUDIT_QUOTE_CLOCK_VERSION,quoteClock,civilDateKnownAt} from './audit-quote-clock.ts';
import {auditPublishedThesis,type ThesisAuditInput} from './thesis-audit.ts';
import {deepFactors,type DeepInputs} from './factors.ts';
import {inputHash} from './policy.ts';
import type {Evidence} from './research.ts';
const cutoff='2026-10-23T17:41:02.388065Z';
const quote={session:'2026-10-24',close:100,source:'https://www.twse.com.tw/synthetic-clock-only',adjusted:true,
 observedAt:'2026-10-23T17:35:00Z',availableAt:'2026-10-23T17:40:00Z',volume:1000,ma20:90,ma60:80,volumeRatio:1.1,institutionalFlow:0};
function audit(overrides:Partial<ThesisAuditInput>={}){
 return auditPublishedThesis({symbol:'2330',inputHash:inputHash('synthetic-clock'),publishedInputHash:null,revisionId:null,
  artifact:null,review:null,original:[],current:[],newContent:[],quote,cutoff,market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null,...overrides});
}
function deep(valuation:Partial<DeepInputs['valuation']>={}):DeepInputs{
 return {cutoff,clockVersion:AUDIT_QUOTE_CLOCK_VERSION,valuation:{current:100,bear:80,base:140,bull:180,method:'normalized_pe',
  quoteAt:quote.session,valuationAt:quote.session,quoteClockVersion:AUDIT_QUOTE_CLOCK_VERSION,
  quoteObservedAt:quote.observedAt,quoteKnownAt:quote.availableAt,provenance:['SYNTHETIC_EXPLICIT_NUMBERS'],...valuation},
  profitabilityChecklist:{checks:[]},technicalChipsChecklist:{checks:[]},catalystChecklist:{checks:[]},marketLiquidityChecklist:{checks:[]}};
}
test('zone-bearing clocks cross Taipei midnight without turning a session date into UTC midnight',()=>{
 assert.equal(civilDateKnownAt(quote.session,cutoff),true);
 assert.equal(Date.parse(quote.session)>Date.parse(cutoff),true); // demonstrates the old date-as-instant error only
 const result=audit();assert.equal(result.deepScore.availableWeight,20);assert.equal(result.deepScore.confirmedPoints,20);
 assert.equal(result.deepInputs.technicalChipsChecklist.checks[0].observedAt,'2026-10-23T17:40:00.000000Z');
 assert.equal(result.deepInputs.valuation.quoteAt,quote.session);assert.equal(result.clockVersion,AUDIT_QUOTE_CLOCK_VERSION);
 assert.equal(result.materialEvidence.quote.session,quote.session);
});
test('equivalent positive/negative offsets have identical canonical quote instants and score/material binding',()=>{
 const expected=quoteClock(quote,cutoff);
 const offset={...quote,observedAt:'2026-10-24T01:35:00+08:00',availableAt:'2026-10-23T13:40:00-04:00'};
 assert.deepEqual(quoteClock(offset,'2026-10-24T01:41:02.388065+08:00'),expected);
 const first=audit(),second=audit({quote:offset,cutoff:'2026-10-23T13:41:02.388065-04:00'});
 assert.equal(second.deepScore.confirmedPoints,first.deepScore.confirmedPoints);assert.equal(second.materialHash,first.materialHash);
});
test('missing/bare/reversed/future and microsecond-future instants refuse quote-backed observations',()=>{
 for(const patch of [{observedAt:undefined},{availableAt:undefined},{observedAt:'2026-10-24'},
  {availableAt:'2026-10-23T17:40:00'},{observedAt:'2026-02-30T17:35:00Z'},
  {observedAt:'2026-10-23T17:40:01Z'},{availableAt:'2026-10-23T17:41:02.388066Z'}]){
  const result=audit({quote:{...quote,...patch}});
  assert.equal(result.deepScore.factors.technicalChips.value,null);assert.equal(result.deepInputs.technicalChipsChecklist.checks[0].met,null);
  assert.ok(result.gaps.includes('audit_quote_clock_missing_or_future'));assert.equal(result.materialChanged,false);
 }
 assert.equal(quoteClock(quote,'2026-10-24'),null);
 assert.equal(quoteClock({...quote,availableAt:cutoff},cutoff)?.availableAt,cutoff);
});
test('financial source clocks survive a missing formal quote; market/roster data never borrow a quote clock',()=>{
 const fact=(id:string,key:string,value:number,period:string,availableAt:string):Evidence=>({id,key,value,period,unit:'TWD',kind:'fact',sourceTier:'official',
  source:'https://mops.twse.com.tw/synthetic-clock-only',contentHash:inputHash(id),eventAt:'2026-10-23T16:00:00Z',availableAt});
 const current=[fact('revenue','quarterly_revenue',100,'2026-06-30','2026-10-23T17:10:00Z'),fact('gross','quarterly_gross_profit',40,'2026-06-30','2026-10-23T17:20:00Z'),
  fact('prior-revenue','quarterly_revenue',100,'2026-03-31','2026-10-23T16:10:00Z'),fact('prior-gross','quarterly_gross_profit',30,'2026-03-31','2026-10-23T16:20:00Z')];
 const result=audit({current,quote:{...quote,adjusted:false,observedAt:undefined,availableAt:undefined},market:{risk:'selective',snapshotHash:inputHash('clock-unavailable')},tradingValid:true});
 const margin=result.deepInputs.profitabilityChecklist.checks[0];assert.equal(margin.met,true);assert.equal(margin.observedAt,'2026-10-23T17:20:00Z');
 assert.equal(result.deepInputs.marketLiquidityChecklist.checks[0].observedAt,'');assert.equal(result.deepInputs.marketLiquidityChecklist.checks[2].observedAt,'');
 assert.equal(result.deepScore.factors.technicalChips.value,null);
});
test('current valuation derivation uses explicit quote instants and civil metadata without changing weights',()=>{
 assert.equal(deepFactors(deep()).availableWeight,30);
 for(const patch of [{quoteKnownAt:undefined},{quoteObservedAt:undefined},{quoteKnownAt:'2026-10-23T17:41:02.388066Z'},
  {quoteObservedAt:'2026-10-24'},{quoteAt:'2026-02-30'},{valuationAt:'2026-10-25'},{quoteClockVersion:undefined}])
  assert.equal(deepFactors(deep(patch)).factors.valuation.value,null);
 const before='2026-10-26T15:59:59Z',after='2026-10-26T16:00:00Z';
 assert.equal(civilDateKnownAt('2026-10-27',before),false);assert.equal(civilDateKnownAt('2026-10-27',after),true);
});
