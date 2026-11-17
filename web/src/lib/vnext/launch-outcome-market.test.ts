import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateLaunchOutcome,launchOutcomeBenchmarkDays,type LaunchOutcomeBenchmarkPoint,type LaunchOutcomeInput} from './launch-outcomes.ts';

const revision='e'.repeat(64);
const at=(day:string,clock:string)=>day+'T'+clock+'Z';
const near=(actual:number|null|undefined,expected:number)=>{
  assert.equal(typeof actual,'number');
  assert.ok(Math.abs(actual!-expected)<1e-9,[actual,expected].join(' vs '));
};
const observed=(session:string,open:string|null,close:string):LaunchOutcomeBenchmarkPoint=>({
  session,open,close,observedAt:at(session,'07:00:00'),availableAt:at(session,'08:00:00'),revision});
function setup(){
  const origin='2026-10-05',signals:LaunchOutcomeInput['sessions']=[];
  for(let i=1;signals.length<20;i++){
    const t=new Date(Date.parse(origin+'T00:00:00Z')+i*86_400_000);
    if([0,6].includes(t.getUTCDay()))continue;
    const session=t.toISOString().slice(0,10);
    signals.push({session,openAt:at(session,'01:00:00'),closeAt:at(session,'05:30:00'),
      knownAt:at(session,'06:00:00'),status:'completed'});
  }
  const first=signals[0].session,last=signals.at(-1)!.session;
  const run='00000000-0000-4000-8000-000000000003';
  const input:LaunchOutcomeInput={scope:'historical_price_replay',signal:{
    rankingRunId:run,firstRankingRunId:run,market:'TWSE',symbol:'1234',session:origin,cutoff:at(origin,'13:30:00'),
    inputHash:revision,priceRevision:revision,rawClose:'100',normalizedClose:'100'},
    asOf:at(last,'13:30:00'),calendarRevision:revision,basisRevision:revision,sessions:signals,
    bars:signals.map(({session})=>({session,availableAt:at(session,'07:00:00'),basisRevision:revision,
      priceRevision:revision,rawOpen:'100',open:'100',high:'120',low:'98',close:session===last?'120':'100'})),
    opening:{session:first,knownAt:at(first,'06:30:00'),revision,status:'modeled_fill',rawOpen:'100',priceRevision:revision,reason:null},
    benchmark:{market:'TWSE',frozenClose:observed(origin,'1000','1000'),points:[observed(first,'1050','1060'),observed(last,'1090','1100')]}};
  return { input,first,last };
}

test('same-market excess uses signal close for research and next session index open for modeled execution',()=>{
  const {input,first,last}=setup();
  assert.deepEqual(launchOutcomeBenchmarkDays(input),[first,last]);
  const result=evaluateLaunchOutcome(input);
  const research=result.research.horizons[0],execution=result.execution.horizons[0];
  near(research.grossPriceReturnPct,20);
  near(research.benchmarkReturnPct,10);
  near(research.marketExcessPct,10);
  assert.equal(research.netMarketExcessPct,null);
  const expectedMarket=(1100/1050-1)*100;
  near(execution.benchmarkReturnPct,expectedMarket);
  near(execution.marketExcessPct,20-expectedMarket);
  near(execution.netMarketExcessPct,execution.netSimulatedReturnPct!-expectedMarket);
  assert.equal(result.research.horizons[1].marketExcessPct,null);
  assert.equal(result.research.horizons[2].state,'pending');
});

test('missing index prices leave stock outcome intact without fabricating excess or open',()=>{
  const {input}=setup();
  input.benchmark!.points[0].open=null;
  const partial=evaluateLaunchOutcome(input);
  assert.equal(partial.research.horizons[0].marketExcessPct,10);
  assert.equal(partial.execution.horizons[0].marketExcessPct,null);
  assert.equal(partial.execution.horizons[0].grossPriceReturnPct,20);
  input.benchmark!.points.pop();
  const absent=evaluateLaunchOutcome(input);
  assert.equal(absent.research.horizons[0].marketExcessPct,null);
  assert.equal(absent.research.horizons[0].grossPriceReturnPct,20);
  delete input.benchmark;
  assert.equal(Object.hasOwn(evaluateLaunchOutcome(input).research.horizons[0],'marketExcessPct'),false);
});

test('benchmark cannot change venues or use late facts, duplicate days or missing authority',()=>{
  const {input}=setup();
  const original=structuredClone(input);
  input.benchmark!.market='TPEX';
  assert.throws(()=>evaluateLaunchOutcome(input),/launch_outcome_market_scope/);
  Object.assign(input,structuredClone(original));
  input.benchmark!.frozenClose!.availableAt='2026-10-06T10:00:00Z';
  assert.throws(()=>evaluateLaunchOutcome(input),/frozen_market_scope/);
  Object.assign(input,structuredClone(original));
  input.benchmark!.points[1].availableAt='2026-11-15T12:00:00Z';
  assert.throws(()=>evaluateLaunchOutcome(input),/market_clock_scope/);
  Object.assign(input,structuredClone(original));
  input.benchmark!.points.push({...input.benchmark!.points.at(-1)!});
  assert.throws(()=>evaluateLaunchOutcome(input),/market_clock_scope/);
});
