import assert from 'node:assert/strict';
import {evaluateDiscoveryPrice} from './stockinsider-full-review-abcd-oct11-price-repair49/web/src/lib/research-discovery-price-enrichment.ts';
import {discoveryClockOrder} from './stockinsider-full-review-abcd-oct11-price-repair49/web/src/lib/research-discovery-evidence.ts';
const cutoff='2026-10-08T05:30:00.000001Z';
const quote={session:'2026-10-08',close:15,volume:10000,sourceUrl:'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20261001&stockNo=2409',availableAt:'2026-10-08T05:30:00.000002Z',priceBasis:'raw_exchange_quote',symbol:'2409',exchange:'TWSE'};
const evaluate=q=>evaluateDiscoveryPrice({quote:q,window:null,latestCompletedSession:'2026-10-08',missing:[]},cutoff);
const future=evaluate(quote);assert.equal(future.quote,null);assert.equal(future.rankingInfluence,false);assert.equal(future.pricePhase,'unknown');
const equal=evaluate({...quote,availableAt:'2026-10-08T13:30:00.000001+08:00'});assert.equal(equal.quoteStatus,'official_raw_quote');
for(const bad of ['invalid','2026-10-08T05:30:00.0000001Z','2026-02-30T05:30:00Z','2026-10-08T05:30:00']){assert(Number.isNaN(discoveryClockOrder(bad,cutoff)));assert.equal(evaluate({...quote,availableAt:bad}).quote,null);}
assert.equal(discoveryClockOrder('1969-12-31T23:59:59.999999Z','1970-01-01T00:00:00Z'),-1);
assert.equal(discoveryClockOrder('2026-10-08T23:59:59.999999-02:00','2026-10-09T01:59:59.999999Z'),0);
console.log(JSON.stringify({subject:'49a1399a479f7ad0e069bc2ce18c1d554e18f0f3',futureQuote:future,equalOffsetAdmitted:equal.quoteStatus,invalidClocksRejected:4,negativeEpochAndCrossDayOffset:'passed'},null,2));
