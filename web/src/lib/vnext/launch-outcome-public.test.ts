import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {parsePublicLaunchOutcome,readLaunchOutcomeProjection,type PublicLaunchOutcome} from './launch-outcome-public.ts';

import {outcomeFixture} from './launch-outcome.test-fixture.ts';

const {ref,base,completed,period,waiting,gap}=outcomeFixture;

test('performance projection binds the frozen run, stock, and session and rejects nested private keys',()=>{
  const projected=parsePublicLaunchOutcome(completed,ref);
  assert.equal(projected.state,'ready');
  if(projected.state==='ready'){
    assert.equal(projected.research.horizons[0].grossReturnPct,0);
    assert.equal(projected.execution.horizons[0].netReturnPct,19.25);
    assert.equal(projected.costs.sellTaxPpm,3000);
    assert.equal(Object.hasOwn(projected,'signalCutoff'),false);
  }
  for(const payload of [{...completed,symbol:'5678'},{...completed,signalSession:'2026-10-06'},
    {...completed,research:{...completed.research,privateBody:'SYNTHETIC_PRIVATE_BLOCK'}},
    {...completed,research:{...completed.research,horizons:[{...period,netReturnPct:2},waiting,gap]}},
    {...completed,execution:{...completed.execution,horizons:[waiting,period,gap]}}]){
    assert.throws(()=>parsePublicLaunchOutcome(payload,ref),/launch_outcome_public_projection_unavailable/);
  }
});

test('public outcome rejects impossible time ordering and keeps unobserved scheduled dates',()=>{
  const signal=ref;
  const empty={...completed,research:{barrier20:{state:'pending',session:null},horizons:[{...period,state:'pending',grossReturnPct:null},waiting,gap]},
    execution:{status:'pending',nextSession:'2026-10-06',reason:null,grossBarrier20:null,netBarrier20:null,horizons:[]}};
  const after=Date.parse(signal.signalCutoff);
  const tooEarly={...empty,asOf:new Date(after-1).toISOString()};
  const futureBarrier={...completed,research:{...completed.research,barrier20:{state:'up_first',session:'2026-11-06'}}};
  const futureTerminal={...completed,research:{...completed.research,horizons:[{...period,terminalSession:'2026-11-06'},waiting,gap]}};
  const futureFill={...completed,execution:{...completed.execution,nextSession:'2026-11-06'}};
  const futureNoFill={...empty,execution:{...empty.execution,status:'unfillable',reason:'suspended',nextSession:'2026-11-06'}};
  const earlyThreshold={...completed,execution:{...completed.execution,grossBarrier20:{state:'down_first',session:'2026-10-06'},nextSession:'2026-10-07'}};
  for(const impossible of [tooEarly,futureBarrier,futureTerminal,futureFill,futureNoFill,earlyThreshold])
    assert.throws(()=>parsePublicLaunchOutcome(impossible,signal),/launch_outcome_public_projection_unavailable/u);
  const asOf='2026-10-05T13:30:00Z';
  const pending=parsePublicLaunchOutcome({...empty,asOf},signal);
  assert.ok(pending.state==='ready');
  assert.equal(pending.research.horizons[0].terminalSession,'2026-11-02');
  assert.equal(pending.execution.nextSession,'2026-10-06');
  const sameTaipeiDay={...completed,asOf:'2026-11-04T16:30:00Z',
    research:{...completed.research,barrier20:{state:'up_first',session:'2026-11-05'}}};
  assert.equal(parsePublicLaunchOutcome(sameTaipeiDay,signal).state,'ready');
});

test('frozen outcome horizons stay in date order and share the same maturity across both tracks',async()=>{
  const withResearch=(...horizons:unknown[])=>({...completed,research:{...completed.research,horizons},
    execution:{status:'unfillable',nextSession:completed.execution.nextSession,reason:'suspended',
      grossBarrier20:null,netBarrier20:null,horizons:[]}});
  const pendingDate={...waiting,terminalSession:'2026-12-29'};
  const scheduled={...completed,research:{...completed.research,horizons:[period,pendingDate,gap]},
    execution:{...completed.execution,horizons:[completed.execution.horizons[0],pendingDate,gap]}};
  assert.equal(parsePublicLaunchOutcome(scheduled,ref).state,'ready');

  const mismatchedSession={...completed,execution:{...completed.execution,horizons:[
    {...completed.execution.horizons[0],terminalSession:'2026-11-03'},waiting,gap]}};
  const mismatchedMaturity={...completed,execution:{...completed.execution,horizons:[
    completed.execution.horizons[0],{...waiting,state:'price_data_gap'},gap]}};
  const invalid=[
    ['different closing days',mismatchedSession],
    ['different maturity',mismatchedMaturity],
    ['duplicate terminal days',withResearch(period,{...waiting,terminalSession:period.terminalSession},gap)],
    ['missing earlier terminal day',withResearch(period,waiting,{...gap,terminalSession:'2027-03-19'})],
    ['longer window ready before shorter window',withResearch(
      {...period,state:'pending',grossReturnPct:null},
      {...waiting,state:'ready',terminalSession:'2026-11-04',grossReturnPct:12},gap)],
  ] as const;
  for(const [label,document] of invalid){
    assert.throws(()=>parsePublicLaunchOutcome(document,ref),/launch_outcome_public_projection_unavailable/u,label);
  }
  const reader={async rpc(){return {data:mismatchedSession,error:null};}};
  assert.deepEqual(await readLaunchOutcomeProjection(reader,ref),{state:'unavailable'});
});

test('performance reader calls only the readonly RPC, sanitizes errors, and skips invalid IDs',async()=>{
  const calls:unknown[]=[];
  const expect={state:'unavailable'};
  const reader={async rpc(name:string,args:unknown){calls.push([name,args]);return {data:{private:'SECRET'},error:'SECRET'};}};
  assert.deepEqual(await readLaunchOutcomeProjection(reader,{...ref,rankingRunId:'bad'}),expect);
  assert.deepEqual(await readLaunchOutcomeProjection(reader,{...ref,signalCutoff:'2026-10-06T00:01:00+08:00'}),expect);
  assert.deepEqual(calls,[]);
  assert.deepEqual(await readLaunchOutcomeProjection(reader,ref),expect);
  assert.deepEqual(calls,[['vnext_launch_outcome_public_v1',{p_ranking_run_id:ref.rankingRunId,p_symbol:ref.symbol}]]);
});

const require=createRequire(import.meta.url);
const {createElement}=require('react') as typeof import('react');
const {renderToStaticMarkup}=require('react-dom/server') as typeof import('react-dom/server');
function render(outcome:PublicLaunchOutcome){
  const file=new URL('../../app/components/vnext/LaunchOutcomeSummary.tsx',import.meta.url);
  const compiled=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file.pathname,compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const isolated={exports:{} as {default?:import('react').ComponentType<{outcome:PublicLaunchOutcome}>}};
  vm.runInNewContext(compiled,{require,module:isolated,exports:isolated.exports,Date,Intl});
  assert.ok(isolated.exports.default);
  return renderToStaticMarkup(createElement(isolated.exports.default,{outcome}));
}

test('actual outcome panel separates research from simulated returns and labels uncertainty and costs',()=>{
  const markup=render(parsePublicLaunchOutcome(completed,ref));
  for(const value of ['發榜日收盤追蹤','次一交易日開盤模擬','連續上榜','觀測至','0%','+19.25%','較同市場 +9.25 個百分點','大盤資料不足','尚未到期','交易日資料不足',
    '同日觸及上下界，先後不明','60 日','0.1425','0.3','0.1'])assert.ok(markup.includes(value),value);
  assert.match(markup,/<table/u);
  assert.doesNotMatch(markup,/snapshotHash|rankingRunId|SYNTHETIC_PRIVATE_BLOCK/u);
});

test('actual outcome panel renders unfillable, older rankings, and unavailable observations independently',()=>{
  const unfillable=parsePublicLaunchOutcome({...completed,execution:{status:'unfillable',nextSession:'2026-10-06',
    reason:'suspended',grossBarrier20:null,netBarrier20:null,horizons:[]}},ref);
  const markup=render(unfillable);
  assert.match(markup,/無法成交.*開盤時停牌/u);
  assert.doesNotMatch(markup,/<th[^>]*>扣除成本/u);
  const empty={...base,asOf:null,outcomeRevision:null,research:null,execution:null};
  assert.match(render(parsePublicLaunchOutcome({...empty,state:'not_started',firstRankingRunId:null},ref)),/尚未納入成效追蹤/u);
  assert.match(render(parsePublicLaunchOutcome({...empty,state:'awaiting_observation'},ref)),/等待下一個交易日/u);
  assert.match(render({state:'unavailable'}),/暫時無法讀取/u);
});
