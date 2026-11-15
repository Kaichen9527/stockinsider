import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {parsePublicLaunchOutcome,readLaunchOutcomeProjection,type PublicLaunchOutcome} from './launch-outcome-public.ts';

const ref={rankingRunId:'00000000-0000-4000-8000-000000000003',symbol:'1234',signalSession:'2026-10-05'};
const first='00000000-0000-4000-8000-000000000001';
const base={...ref,schemaVersion:'vnext-launch-outcome-public-v1',policyVersion:'launch-outcomes-v1',firstRankingRunId:first,
  state:'ready',asOf:'2026-11-05T13:30:00+00:00',outcomeRevision:'a'.repeat(64)};
const unavailableBenchmark={benchmarkReturnPct:null,marketExcessPct:null,netMarketExcessPct:null};
const period={...unavailableBenchmark,horizon:20,state:'ready',terminalSession:'2026-11-02',grossReturnPct:0,netReturnPct:null};
const waiting={...unavailableBenchmark,horizon:60,state:'pending',terminalSession:null,grossReturnPct:null,netReturnPct:null};
const gap={...unavailableBenchmark,horizon:120,state:'calendar_gap',terminalSession:null,grossReturnPct:null,netReturnPct:null};
const barrier={state:'order_unknown',session:'2026-10-12'};
const completed={...base,research:{barrier20:barrier,horizons:[period,waiting,gap]},
  execution:{status:'modeled_fill',nextSession:'2026-10-06',reason:null,grossBarrier20:barrier,
    netBarrier20:{state:'down_first',session:'2026-10-09'},horizons:[{...period,grossReturnPct:20,netReturnPct:19.25,benchmarkReturnPct:10,marketExcessPct:10,netMarketExcessPct:9.25},waiting,gap]}};

test('performance projection binds the frozen run, stock, and session and rejects nested private keys',()=>{
  const projected=parsePublicLaunchOutcome(completed,ref);
  assert.equal(projected.state,'ready');
  if(projected.state==='ready'){
    assert.equal(projected.research.horizons[0].grossReturnPct,0);
    assert.equal(projected.execution.horizons[0].netReturnPct,19.25);
    assert.equal(projected.costs.sellTaxPpm,3000);
  }
  for(const payload of [{...completed,symbol:'5678'},{...completed,signalSession:'2026-10-06'},
    {...completed,research:{...completed.research,privateBody:'SYNTHETIC_PRIVATE_BLOCK'}},
    {...completed,research:{...completed.research,horizons:[{...period,netReturnPct:2},waiting,gap]}},
    {...completed,execution:{...completed.execution,horizons:[waiting,period,gap]}}]){
    assert.throws(()=>parsePublicLaunchOutcome(payload,ref),/launch_outcome_public_projection_unavailable/);
  }
});

test('performance reader calls only the readonly RPC, sanitizes errors, and skips invalid IDs',async()=>{
  const calls:unknown[]=[];
  const expect={state:'unavailable'};
  const reader={async rpc(name:string,args:unknown){calls.push([name,args]);return {data:{private:'SECRET'},error:'SECRET'};}};
  assert.deepEqual(await readLaunchOutcomeProjection(reader,{...ref,rankingRunId:'bad'}),expect);
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
