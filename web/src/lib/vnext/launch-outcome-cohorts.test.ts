import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {parseLaunchOutcomeCohorts,readLaunchOutcomeCohorts,type LaunchOutcomeCohorts} from './launch-outcome-cohorts.ts';

const barrier={upFirst:0,downFirst:0,orderUnknown:0,notHit:0,pending:0,waitingObservation:0,dataGap:0};
const opening={filled:0,unfillable:0,pending:0,evidenceGap:0,waitingObservation:0};
const horizons=[20,60,120].map(days=>({days,ready:0,pending:0,waitingObservation:0,dataGap:0,withBenchmark:0,meanReturnPct:null,meanExcessPct:null}));
const emptyTrack={barrier20:barrier,horizons};
const first={cohort:'first',signals:2,observed:1,opening:{...opening,unfillable:1,waitingObservation:1},
 research:{barrier20:{...barrier,waitingObservation:1,dataGap:1},horizons:horizons.map(row=>({...row,waitingObservation:1,dataGap:1}))},
 execution:emptyTrack};
const mature=(meanReturnPct:number,meanExcessPct:number)=>horizons.map(row=>row.days===20?{...row,ready:1,withBenchmark:1,meanReturnPct,meanExcessPct}:{...row,pending:1});
const repeat={cohort:'repeat',signals:1,observed:1,opening:{...opening,filled:1},
 research:{barrier20:{...barrier,upFirst:1},horizons:mature(20,10)},
 execution:{barrier20:{...barrier,orderUnknown:1},horizons:mature(0,-3)}};
const document={schemaVersion:'vnext-launch-outcome-cohorts-v1',fromSession:'2025-11-14',throughSession:'2026-11-13',
  observedThrough:'2026-11-13T13:30:00Z',cohorts:[first,repeat]};

test('public cohort parser preserves unknown, unfillable and true zero separately',()=>{
  const summary=parseLaunchOutcomeCohorts(document);
  assert.equal(summary.status,'ready');
  if(summary.status!=='ready')throw Error('not ready');
  assert.equal(summary.cohorts[0].signals,2);
  assert.equal(summary.cohorts[0].opening.unfillable,1);
  assert.equal(summary.cohorts[0].research.barrier20.waitingObservation,1);
  assert.equal(summary.cohorts[1].execution.horizons[0].meanReturnPct,0);
  assert.equal(summary.cohorts[1].execution.barrier20.orderUnknown,1);
});

test('public cohort parser rejects mixed cohorts, unsupported counts and leaked fields',()=>{
  for(const malformed of [
    {...document,cohorts:[repeat,first]},
    {...document,cohorts:[{...first,signals:5},repeat]},
    {...document,cohorts:[{...first,execution:{...emptyTrack,barrier20:{...barrier,upFirst:1}}},repeat]},
    {...document,cohorts:[{...first,privateDebug:'SYNTHETIC_TRACE'},repeat]},
    {...document,fromSession:'2025-11-13'},
  ])assert.throws(()=>parseLaunchOutcomeCohorts(malformed),/launch_outcome_cohorts_unavailable/u);
});

test('summary uses one readonly RPC and sanitizes database failures',async()=>{
  const calls:string[]=[];
  assert.deepEqual(await readLaunchOutcomeCohorts({rpc:async(name)=>{
    calls.push(name);return {data:'SYNTHETIC_TRACE',error:'SYNTHETIC_TRACE'};
  }}),{status:'unavailable'});
  assert.deepEqual(calls,['vnext_launch_outcome_cohorts_v1']);
});

const require=createRequire(import.meta.url);
const {createElement}=require('react') as typeof import('react');
const {renderToStaticMarkup}=require('react-dom/server') as typeof import('react-dom/server');
function load(relative:string,mocks:Record<string,unknown>={}){
  const file=new URL(relative,import.meta.url),source=fs.readFileSync(file,'utf8');
  const result=ts.transpileModule(source,{fileName:file.pathname,compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
  const isolated={exports:{} as Record<string,unknown>};
  vm.runInNewContext(result.outputText,{module:isolated,exports:isolated.exports,Intl,Date,require:(name:string)=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    return require(name);
  }});
  return isolated.exports.default;
}

test('report renders separate cohort columns, three horizons and denominators',()=>{
  const view=load('../../app/components/vnext/LaunchPerformance.tsx') as import('react').ComponentType<{summary:LaunchOutcomeCohorts}>;
  const markup=renderToStaticMarkup(createElement(view,{summary:parseLaunchOutcomeCohorts(document)}));
  for(const label of ['首次上榜','連續上榜','主要追蹤','無法成交','等待觀測','觸價先後不明','開盤證據不足','平均扣除成本報酬','平均同市場超額','0%','120'])
    assert.ok(markup.includes(label),label);
  assert.doesNotMatch(markup,/artifactHash|rankingRunId|SYNTHETIC_TRACE/u);
  const empty={...document,observedThrough:null,cohorts:[{...first,signals:0,observed:0,opening,research:emptyTrack},
    {...repeat,signals:0,observed:0,opening,research:emptyTrack,execution:emptyTrack}]};
  assert.match(renderToStaticMarkup(createElement(view,{summary:parseLaunchOutcomeCohorts(empty)})),/沒有已納入成效追蹤/u);
});

test('actual performance page does no database work when the launch feature is disabled',async()=>{
  const calls:string[]=[];
  const component=load('../../app/launch/performance/page.tsx',{
    'next/link':{__esModule:true,default:()=>null},'@/app/components/vnext/LaunchPerformance':{__esModule:true,default:()=>null},
    '@/lib/supabase-server':{getSupabaseServerClient:()=>{calls.push('db');return {};}},
    '@/lib/vnext/launch-outcome-cohorts':{readLaunchOutcomeCohorts:async()=>{calls.push('read');return {status:'unavailable'};}},
    '@/lib/vnext/launch-ranking-read':{launchRankingEnabled:()=>false},
  }) as ()=>Promise<import('react').ReactElement>;
  assert.match(renderToStaticMarkup(await component()),/尚未啟用/u);
  assert.deepEqual(calls,[]);
});
