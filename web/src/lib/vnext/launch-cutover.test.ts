import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

type Row=Record<string,unknown>;
const nativeRequire=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const run='00000000-0000-4000-8000-000000000001',identity={principal:'SYNTHETIC_OPERATOR',role:'operator'};
const token='SYNTHETIC_INTERNAL_TEST_TOKEN',policy='stockinsider-launch-radar-v1';
/** Actual HTTP/cycle/lowest writer functions; synthetic transports prove
 * dispatch and zero work, never a real DB lease/SQL/publication acceptance. */
function fixture(newMode=true,options:{ready?:boolean;admissionError?:boolean;failNew?:boolean}={}){
  const calls:string[]=[],cache=new Map<string,Row>(),mocks=new Map<string,unknown>();let active=false;
  const environment={STOCKINSIDER_VNEXT_ENABLED:'true',INTERNAL_API_KEY:token,CRON_SECRET:'SYNTHETIC_CRON_ONLY',STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL:identity.principal,
    STOCKINSIDER_VNEXT_AUTHOR_KEY:'SYNTHETIC_AUTHOR_ONLY',STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL:'SYNTHETIC_AUTHOR'};
  const context=vm.createContext({process:{env:environment},Buffer,URL,Date,Intl,Error,Request,Response,Headers,TextDecoder,TextEncoder,Uint8Array,setTimeout,clearTimeout});
  const filename=(relative:string)=>path.resolve(root,relative);
  const put=(relative:string,value:unknown)=>mocks.set(filename(relative),value);
  const payload={asOf:'2026-11-13T13:30:00Z',hotThemes:[],opportunities:[],reports:[]},stages={found:[],waiting:[],actionable:[]};
  const client={rpc:async(name:string)=>{calls.push(`rpc:${name}`);return {data:name==='publish_radar_public_snapshots'?{homeId:'SYNTHETIC_HOME',dailyId:'SYNTHETIC_DAILY'}:name==='read_taiwan_data_publication_metadata_v5'?{dataCutoffAt:payload.asOf,datasetCompletenessPct:100}:{published:true},error:null};}};
  put('lib/vnext/launch-ranking-read.ts',{launchRankingEnabled:()=>newMode,LAUNCH_RANKING_POLICY:policy,LAUNCH_RANKING_RULES:'launch-radar-comparisons-v5',readLaunchRankingSnapshot:async()=>{calls.push('unexpected-new-read');throw Error('unexpected');}});
  put('lib/vnext/ranking-read.ts',{rankingEnabled:()=>true,readRankingSnapshot:async()=>{calls.push('old-ranking-read');return {snapshot:null};}});
  put('lib/supabase-server.ts',{getSupabaseServerClient:()=>{calls.push('db-client');return client;}});
  put('lib/vnext/analysis-runtime.ts',{analysisWriter:async(work:()=>Promise<unknown>)=>{calls.push('legacy-writer');return work();}});
  put('lib/vnext/calendar-sync.ts',{synchronizeCachedCalendar:async()=>{calls.push('legacy-calendar');}});
  put('lib/vnext/store.ts',{command:async()=>{calls.push('legacy-context');return {completed:true,postclose:true,session:'2026-11-13'};}});
  put('lib/vnext/cached-admission.ts',{cachedAdmissionBody:()=>{calls.push('unexpected-admission');},currentReceiptBody:()=>[]});
  for(const [file,method] of [['source-window-worker.ts','runSourceWindowWorker'],['market-ai-worker.ts','runMarketInterpretation'],['weekly-worker.ts','runWeeklyThesisAudit'],['research-dispatcher.ts','dispatchResearchQueue']] as const)
    put(`lib/vnext/${file}`,{[method]:async()=>{calls.push(`legacy:${method}`);return {};}});
  put('lib/candidate-price-history.ts',{isHistoryDate:(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)});
  put('lib/stage-classifier.ts',{STAGE_RULESET_VERSION:'SYNTHETIC_RULE'});
  put('lib/candidate-research.ts',{CANDIDATE_RESEARCH_MODEL_VERSION:'SYNTHETIC_MODEL',loadCandidateStageCards:async()=>{calls.push('stage-read');return stages;}});
  put('lib/radar-stage-pagination.ts',{buildCanonicalStagePlane:()=>({stageCounts:{found:0,waiting:0,actionable:0},stages})});
  put('lib/domain.ts',{getDailyRadarData:async()=>{calls.push('payload-read');return payload;}});
  put('lib/taiwan-data-runtime.ts',{requireActiveVpsWriter:async()=>{calls.push('writer-metadata');return {ok:true,supabase:client,releaseId:'SYNTHETIC_RELEASE'};},resolveLatestCompletedTaiwanSession:async()=>{calls.push('session-read');return '2026-11-13';}});
  function load(relative:string):Row{
    const absolute=filename(relative),mock=mocks.get(absolute);if(mock)return mock as Row;
    const prior=cache.get(absolute);if(prior)return prior;
    const isolatedModule={exports:{} as Row};cache.set(absolute,isolatedModule.exports);
    const compiled=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{fileName:absolute,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    const wrapped=vm.runInContext(`(function(require,module,exports){${compiled}\n})`,context,{timeout:1000}) as (require:(name:string)=>unknown,isolated:typeof isolatedModule,exports:Row)=>void;
    wrapped(dependency=>{
      if(['node:crypto','crypto','node:util','node:async_hooks'].includes(dependency))return nativeRequire(dependency);
      if(dependency==='next/server')return {NextResponse:{json:(value:unknown,init?:{status?:number})=>new Response(JSON.stringify(value),{status:init?.status??200,headers:{'content-type':'application/json'}})}};
      const resolved=dependency.startsWith('@/lib/')?filename(`lib/${dependency.slice(6)}`):path.resolve(path.dirname(absolute),dependency);
      if(!dependency.startsWith('.')&&!dependency.startsWith('@/lib/'))throw Error(`unexpected_test_import:${dependency}`);
      return load(path.relative(root,resolved.endsWith('.ts')?resolved:`${resolved}.ts`));
    },isolatedModule,isolatedModule.exports);return isolatedModule.exports;
  }
  const actualNew=load('lib/vnext/launch-ranking-command.ts'),closed=actualNew.launchRankingPublishRequest as(value:unknown)=>Row;
  put('lib/vnext/launch-ranking-command.ts',{...actualNew,readLaunchCycleAdmission:async()=>{calls.push('launch-admission');if(options.admissionError)throw Error('launch_ranking_cycle_context_unavailable');return {ready:options.ready??false,reason:options.ready?null:'source_producer_not_ready',session:options.ready?'2026-11-13':null,cutoff:options.ready?'2026-11-13T21:30:00+08:00':null,policyVersion:policy};},
    publishCycleLaunchRanking:async()=>{calls.push('launch-cycle-publish');return {published:false,retained:true};},
    publishLaunchRanking:async(_actor:unknown,value:unknown)=>{calls.push('launch-entry');closed(value);if(options.failNew)throw Error('synthetic_new_writer_rejected');if(active)throw Error('launch_ranking_owned_lease_unavailable');active=true;try{await new Promise(resolve=>setTimeout(resolve,0));calls.push('launch-write');return {published:true,policyVersion:policy};}finally{active=false;}}});
  return {load,calls,payload,stages,context,request(body:unknown,bearer=token,extra:Record<string,string>={}){return new Request('http://localhost/api/internal/vnext-research',{method:'POST',headers:{authorization:`Bearer ${bearer}`,...extra},body:JSON.stringify(body)});}};
}
type Http=(request:Request,entrypoint:string)=>Promise<Response|null>;
test('actual HTTP manual/retry/overlap dispatches only launch writer/newpolicy; exactauth and closedfields retain zero legacywork',async()=>{
  const f=fixture(),http=f.load('lib/vnext/http.ts').vnextRoute as Http,body={action:'ranking-publish',rankingRunId:run,expectedPreviousRankingRunId:null};
  for(let i=0;i<2;i++){const response=await http(f.request(body),'vnext-research');assert.equal(response!.status,200);assert.equal((await response!.json()).policyVersion,policy);}
  const overlap=await Promise.all([http(f.request(body),'vnext-research'),http(f.request(body),'vnext-research')]);assert.deepEqual(overlap.map(r=>r!.status).sort(),[200,409]);
  assert.equal(f.calls.filter(call=>call==='launch-write').length,3);assert.ok(!f.calls.some(call=>call.startsWith('old-')||call==='legacy-writer'||call==='db-client'));
  for(const request of [f.request(body,'SYNTHETIC_CRON_ONLY'),f.request(body,'SYNTHETIC_AUTHOR_ONLY'),f.request(body,token,{'x-internal-key':token})])assert.notEqual((await http(request,'vnext-research'))!.status,200);
  const before=f.calls.filter(call=>call==='launch-write').length;
  for(const extra of [{score:100},{qualified:true},{symbols:[]}])assert.equal((await http(f.request({...body,...extra}),'vnext-research'))!.status,409);
  assert.equal(f.calls.filter(call=>call==='launch-write').length,before);
  const failure=fixture(true,{failNew:true});assert.equal((await(failure.load('lib/vnext/http.ts').vnextRoute as Http)(failure.request(body),'vnext-research'))!.status,409);assert.ok(!failure.calls.some(call=>call==='db-client'||call==='legacy-writer'));
});
test('actual HTTP OFF uses original oldpolicy writer and oldcycle body behavior',async()=>{
  const f=fixture(false),http=f.load('lib/vnext/http.ts').vnextRoute as Http;
  const response=await http(f.request({action:'ranking-publish',rankingRunId:run,expectedPreviousRankingRunId:null}),'vnext-research');
  assert.equal(response!.status,200);assert.equal((await response!.json()).policyVersion,'stockinsider-vnext-20-v1');assert.ok(f.calls.includes('rpc:vnext_ranking_command_v1'));assert.ok(!f.calls.includes('launch-entry'));
  const empty=await http(f.request({action:'cycle',symbols:[]}),'vnext-research');assert.equal(empty!.status,200);assert.equal((await empty!.json()).result.reason,'empty_scope');
});
test('actual newcycle notready or uncertain admission starts no oldwriter/calendar/source/model; ready reusesonlynewpublisher',async()=>{
  for(const mode of ['notready','error','ready'] as const){
    const f=fixture(true,{ready:mode==='ready',admissionError:mode==='error'}),cycle=f.load('lib/vnext/research-cycle.ts').runPostcloseResearchCycle as(actor:unknown)=>Promise<Row>;
    if(mode==='error')await assert.rejects(cycle(identity),/context_unavailable/u);
    else {const result=await cycle(identity);assert.equal(result.policyVersion,policy);assert.equal(result.expensiveCalls,0);if(mode==='ready')assert.deepEqual(Array.from(result.dependencies as string[]),['legacy_author_preparation_dependency']);else assert.equal(result.status,'deferred');}
    assert.deepEqual(f.calls,mode==='ready'?['launch-admission','launch-cycle-publish']:['launch-admission']);
  }
  const f=fixture(true,{ready:true}),http=f.load('lib/vnext/http.ts').vnextRoute as Http;
  assert.equal((await(await http(f.request({action:'cycle'}),'vnext-research'))!.json()).policyVersion,policy);
  const before=f.calls.length;assert.equal((await http(f.request({action:'cycle',symbols:[]}),'vnext-research'))!.status,409);assert.equal(f.calls.length,before);
});
test('actual oldcycle OFF preserves its original source/market/audit/dispatch/oldranking chain',async()=>{
  const f=fixture(false),cycle=f.load('lib/vnext/research-cycle.ts').runPostcloseResearchCycle as(actor:unknown)=>Promise<Row>;await cycle(identity);
  for(const call of ['legacy-writer','legacy-calendar','legacy-context','legacy:runSourceWindowWorker','legacy:runMarketInterpretation','legacy:runWeeklyThesisAudit','legacy:dispatchResearchQueue','rpc:vnext_ranking_command_v1'])assert.ok(f.calls.includes(call),call);
  assert.ok(!f.calls.includes('launch-admission')&&!f.calls.includes('launch-entry'));
});
test('lowestactual legacy snapshot/failuremarker anddirectoldranking exports reject beforepayload/client/reason access',async()=>{
  const f=fixture(),snap=f.load('lib/radar-public-snapshot.ts'),old=f.load('lib/vnext/ranking-command.ts');let touched=0;
  const poison=Object.defineProperty({},'payload',{get(){touched++;throw Error('payload_read');}}),reason={slice(){touched++;throw Error('reason_read');}};
  await assert.rejects((snap.publishRadarPublicSnapshots as(value:unknown)=>Promise<unknown>)(poison),/legacy_publication_forbidden/u);
  await assert.rejects((snap.markRadarPublicSnapshotsFailed as(value:unknown)=>Promise<unknown>)(reason),/legacy_publication_forbidden/u);
  const closedBody=vm.runInContext(`({rankingRunId:${JSON.stringify(run)},expectedPreviousRankingRunId:null})`,f.context) as Row;
  await assert.rejects((old.publishRanking as(a:unknown,b:unknown)=>Promise<unknown>)(identity,closedBody),/legacy_publication_forbidden/u);
  await assert.rejects((old.publishCycleRanking as(a:unknown,b:unknown)=>Promise<unknown>)(identity,'2026-11-13'),/legacy_publication_forbidden/u);
  await assert.rejects((old.publishRanking as(a:unknown,b:unknown)=>Promise<unknown>)(identity,{rankingRunId:run,expectedPreviousRankingRunId:null,score:100}),/closed_request/u);
  assert.equal(touched,0);assert.deepEqual(f.calls,[]);
});
test('actual preliminary route checks exactauth thenblockslaunch beforebody/writer/DB; OFF keepsactualsnapshot publication',async()=>{
  for(const enabled of [true,false]){
    const f=fixture(enabled),route=f.load('app/api/internal/radar-preliminary-publish/route.ts').POST as(request:Request)=>Promise<Response>;let reads=0;
    const request=f.request({});Object.defineProperty(request,'text',{value:async()=>{reads++;return '{}';}});
    const result=await route(request);assert.equal(result.status,enabled?409:200);assert.equal(reads,enabled?0:1);
    if(enabled)assert.deepEqual(f.calls,[]);else assert.ok(f.calls.includes('rpc:publish_radar_public_snapshots'));
    const bad=await route(f.request({},'SYNTHETIC_CRON_ONLY'));assert.equal(bad.status,401);
  }
});
test('existing actual19/21 domain entry bodies stillrejectvnext before any legacy DB/source work',async()=>{
  const f=fixture(),runtime=f.load('lib/vnext/runtime.ts'),domain=fs.readFileSync(filenameForDomain(),'utf8');
  const parsed=ts.createSourceFile('domain.ts',domain,ts.ScriptTarget.Latest,true),names=['runPipelineFlow','runPipelineResearchFlow'];
  for(const name of names){
    const declaration=parsed.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text===name);assert.ok(declaration,name);
    const source=declaration.getText(parsed),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const isolated={exports:{} as Row};
    const wrapper=vm.runInContext(`(function(exports,module,rejectLegacyResearchInVnext){${compiled}\n})`,f.context,{timeout:1000}) as(e:Row,m:typeof isolated,guard:unknown)=>void;
    wrapper(isolated.exports,isolated,runtime.rejectLegacyResearchInVnext);
    await assert.rejects((isolated.exports[name] as()=>Promise<unknown>)(),/vnext_shared_authority_required/u);
  }
  assert.deepEqual(f.calls,[]);
});
function filenameForDomain(){return path.resolve(root,'lib/domain.ts');}
