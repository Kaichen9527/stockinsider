import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateHistoricalCash} from '../web/src/lib/research-historical-cash-core.ts';
const vectors=JSON.parse(await readFile(new URL('./fixtures/research-historical-cash/operands-and-decimal-vectors.json',import.meta.url),'utf8'));
const copy=v=>structuredClone(v), auo=vectors.cases[0].input, emc=vectors.cases[1].input;
const throws=v=>assert.throws(()=>calculateHistoricalCash(v),/historical_cash_input_invalid/);

for(const vector of vectors.cases)test(`${vector.input.symbol} retained two-period cash and capital independently match Python Decimal`,()=>{
 const before=JSON.stringify(vector.input),result=calculateHistoricalCash(vector.input);
 assert.equal(JSON.stringify(vector.input),before);assert.equal(result.rows.length,2);
 assert.equal(result.workload.originalCashRows,vector.input.symbol==='2409'?52:33);
 assert.equal(result.workload.cashNumericCells,vector.input.symbol==='2409'?104:66);
 for(let i=0;i<2;i++){
  const row=result.rows[i],expected=vector.expectedDecimalRows[i];
  assert.equal(row.period,expected.period);assert.equal(row.operandUnit,'TWD_thousands');assert.equal(row.periodKind,'half_year_cumulative');
  for(const key of ['cfo','groupNetProfit','nonCashAdjustments','workingCapitalCashEffect','cfoLessPpeCashOutlay','cfoLessPpeAndIntangibleCashOutlay','afterLeasePrincipalSensitivity','netBorrowingCash','cashChange','closingCash'])assert.equal(row.calculated[key],expected[key],key);
  assert.equal(row.calculated.rouCashAcquisitionSeparate,expected.separateRouCashAcquisition);
  assert.ok(Math.abs(row.ratio.value-Number(expected.cfoDividedByGroupNetProfit))<=1e-9);
  assert.equal(row.ratio.unit,'dimensionless');assert.equal(row.ratio.denominator,expected.groupNetProfit);
  for(const [key,values]of Object.entries(vector.input.facts))assert.equal(row.operands[key],values[i]);
 }
 if(vector.expectedCapital){assert.ok(Math.abs(result.historicalCapital.ownersEquityPerIssuedCommonShare-Number(vector.expectedCapital.ownersEquityPerIssuedCommonShareTwd))<=1e-9);assert.equal(result.historicalCapital.treasurySharesThousands,null);assert.equal(result.historicalCapital.treasuryShareCountVerified,false);assert.equal(result.historicalCapital.octoberOutstandingShares,null);assert.equal(result.historicalCapital.currentPB,null);}
 else assert.equal(result.historicalCapital,null);
 for(const key of ['financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','historicalPITEligible','strategyApproved','entryEligible','published','valuationApproved','technicalAdmission'])assert.equal(result[key],false,key);
 assert.equal(result.sourceVerification,'not_performed');assert.equal(result.noFutureCash,true);assert.equal(result.forecastCash,null);
});

test('fixed company, period, unit, grain and exact operand inventory reject substituted scope',()=>{
 for(const change of [v=>v.symbol='5347',v=>v.symbol='2383',v=>v.unit='TWD_million',v=>v.grain='quarter',v=>v.consolidated=false,v=>v.periods.reverse(),v=>v.periods[0]='2026-04-01/2026-06-30',v=>delete v.facts.receivables,v=>v.facts.unlisted=[0,0],v=>v.extra='unknown',v=>v.financialVerified=true,v=>v.facts.receivables.push(0)]){const v=copy(auo);change(v);throws(v);}
});
test('every fixed operand refuses fractional, unsafe or nonfinite numeric values',()=>{
 for(const input of [auo,emc])for(const key of Object.keys(input.facts))for(const value of [NaN,Infinity,-0,1.5,Number.MAX_SAFE_INTEGER+1,'1',null]){
  const v=copy(input);v.facts[key][0]=value;throws(v);
 }
});
test('all actual AUO noncash and working-capital components are reconciled, not only totals',()=>{
 const keys=['depreciation','amortization','fvGain','interestExpenseAdjustment','interestIncomeAdjustment','dividendIncomeAdjustment','shareCompensation','equityMethodAdjustment','ppeDisposalGainAdjustment','rouDisposalLoss','heldForSaleGainAdjustment','investmentGainAdjustment','impairment','unrealizedFx','otherAdjustment','receivables','relatedReceivables','inventory','contractCosts','otherOperatingAssets','contractLiabilities','payables','relatedPayables','provisions','otherOperatingLiabilities'];
 for(const key of keys){const v=copy(auo);v.facts[key][0]++;throws(v);}
});
test('EMC reported asset/liability and adjustment subtotals reconcile without inventing component coverage',()=>{
 for(const key of ['nonCashAdjustments','operatingAssetChange','operatingLiabilityChange','workingCapital','adjustmentsTotal']){const v=copy(emc);v.facts[key][1]++;throws(v);}
 const v=copy(emc);v.facts.receivables[0]++;const r=calculateHistoricalCash(v);
 assert.match(r.rows[0].coverage,/partial_components/);assert.equal(r.rows[0].operands.receivables,v.facts.receivables[0]);
 // The selected packet has only named WC components plus reported totals. A
 // future byte-bound projector must verify the component values to the packet.
});
test('all applicable cash and group-profit bridges reject inconsistent reported operands',()=>{
 for(const input of [auo,emc])for(const key of ['pretax','generatedCash','interestReceived','interestPaid','taxPaid','operatingCash','investingCash','financingCash','fxCash','cashChange','openingCash','closingCash','netProfit','ownersNetProfit','nonControllingNetProfit']){
  const v=copy(input);v.facts[key][0]++;throws(v);
 }
});
test('cash acquisition and debt repayment signs reject rather than flipping expenses',()=>{
 for(const input of [auo,emc])for(const key of ['ppeCash','intangibleCash','leasePrincipal','longRepayments',...(input.symbol==='2409'?['shortRepayments']:['rouCash'])]){const v=copy(input);v.facts[key][0]=1;throws(v);}
});
test('disposal proceeds do not fund the cash-acquisition proxy and ROU stays separate',()=>{
 for(const input of [auo,emc]){
  const before=calculateHistoricalCash(input),v=copy(input);v.facts.ppeDisposalCash[0]+=1000;
  const after=calculateHistoricalCash(v);assert.equal(after.rows[0].calculated.cfoLessPpeAndIntangibleCashOutlay,before.rows[0].calculated.cfoLessPpeAndIntangibleCashOutlay);
 }
 const v=copy(emc),before=calculateHistoricalCash(v);v.facts.rouCash[0]-=1000;const after=calculateHistoricalCash(v);
 assert.equal(after.rows[0].calculated.cfoLessPpeAndIntangibleCashOutlay,before.rows[0].calculated.cfoLessPpeAndIntangibleCashOutlay);assert.notEqual(after.rows[0].calculated.rouCashAcquisitionSeparate,before.rows[0].calculated.rouCashAcquisitionSeparate);
});
test('signed negative NCI is retained, and a zero group-profit denominator is explicitly unavailable',()=>{
 const v=copy(emc);v.facts.nonControllingNetProfit[0]=-100;v.facts.ownersNetProfit[0]=100;v.facts.netProfit[0]=0;
 const r=calculateHistoricalCash(v);assert.equal(r.rows[0].operands.nonControllingNetProfit,-100);assert.equal(r.rows[0].ratio.value,null);assert.equal(r.rows[0].ratio.unavailableReason,'zero_group_net_profit');
});
test('June capital uses issued shares, exact capital/par, group equity and unknown treasury share count',()=>{
 for(const change of [v=>v.capital.instant='2026-10-08',v=>v.capital.parTwd=0,v=>v.capital.issuedSharesThousands++,v=>v.capital.groupEquityTwdThousands++,v=>v.capital.treasurySharesThousands=0,v=>v.capital.futureShares=1,v=>v.capital=null]){const v=copy(auo);change(v);throws(v);}
 const v=copy(emc);v.capital=copy(auo.capital);throws(v);
});
test('safe-integer sums cannot silently overflow even when each operand is safe',()=>{
 const v=copy(auo);v.facts.depreciation[0]=Number.MAX_SAFE_INTEGER;v.facts.amortization[0]=Number.MAX_SAFE_INTEGER;throws(v);
});
test('accessors, exotic objects, symbols and tuple extensions are refused without invoking getters',()=>{
 const v=copy(auo);let called=false;Object.defineProperty(v.facts,'pretax',{enumerable:true,get(){called=true;throw Error('not invoked');}});throws(v);assert.equal(called,false);
 const s=copy(auo);s.facts[Symbol('hidden')]=[0,0];throws(s);
 const p=copy(auo);Object.setPrototypeOf(p.facts,{extra:'not JSON'});throws(p);
 const a=copy(auo);a.facts.pretax.extra=1;throws(a);
});
test('result is deeply frozen; calculation does not mutate caller operands',()=>{
 const v=copy(auo),r=calculateHistoricalCash(v);assert.throws(()=>{r.rows[0].operands.pretax=0;},TypeError);assert.throws(()=>{r.rows.reverse();},TypeError);assert.throws(()=>{r.historicalCapital.currentPB=1;},TypeError);assert.equal(v.facts.pretax[0],2249593);
});
