import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { drainLaunchSourceWithDependencies, classifyLaunchSourceJob, recoverLaunchSourceWithDependencies, parseLaunchSourcePlan, type LaunchSourceDependencies } from './launch-source-store.ts';
import { tpexInstitutionalVolumeCsvUrl } from './launch-institutional-volume.ts';

const id=(value:number)=>`00000000-0000-4000-8000-${String(value).padStart(12,'0')}`;
const now='2026-11-14T08:00:00Z',url=tpexInstitutionalVolumeCsvUrl('2026-11-13');
/** Synthetic transport bytes; this mock does NOT execute/approve SQL facts. */
function fixture(mode='success'){
  const events:string[]=[],owner=id(1),body=Buffer.from('SYNTHETIC CSV\r\n"quoted, cell","value"\r\n');
  const claimed={jobId:id(2),attemptId:id(3),datasetId:11370,requestKey:'2026-11-13',sourceUrl:url,deadlineAt:'2026-11-14T08:02:00Z'};
  const captured:Buffer[]=[];
  const deps:LaunchSourceDependencies={now:()=>now,
    acquireLease:async()=>{events.push('acquire');return mode==='no_lease'?null:owner;},
    releaseLease:async(value)=>{assert.equal(value,owner);events.push('release');},
    fetch:async(input,init)=>{events.push('fetch');assert.equal(input,url);assert.equal(init.redirect,'error');
      const response=new Response(body.toString('utf8'),{status:200,headers:{'content-type':'application/csv;charset=utf-8'}});
      Object.defineProperty(response,'url',{value:mode==='wrong_response_url'?'https://example.invalid/':url});return response;},
    putArtifact:async(hash,bytes)=>{events.push('put');assert.equal(hash,createHash('sha256').update(body).digest('hex'));
      assert.deepEqual(bytes,body);if(mode==='artifact_failure')throw Error('synthetic failure');},
    registerArtifact:async(value,hash,length)=>{events.push('register');assert.equal(value,owner);assert.equal(length,body.length);assert.match(hash,/^[a-f0-9]{64}$/u);},
    command:async(value,operation,request,bytes)=>{assert.equal(value,owner);events.push(operation);
      if(operation==='claim')return {schemaVersion:'licensed-launch-csv-claims-v1',jobs:[{...claimed,
        ...(mode==='forged_profile'?{sourceUrl:'https://example.invalid/'}:{}),...(mode==='expired'?{deadlineAt:now}:{})}]};
      if(operation==='lease-check')return {owned:true,owner:mode==='wrong_owner'?id(9):owner,backendId:id(4)};
      if(operation==='complete'){assert.equal(request.httpStatus,200);assert.equal(request.redirectCount,0);captured.push(Buffer.from(bytes!));
        if(mode==='uncertain_complete')throw Error('synthetic lost response');
        return {schema:'licensed-launch-csv-completion-v1',terminal:'complete',actionEligible:false,legacyCanonical:'not_applicable',captureId:id(5),facts:2};}
      if(operation==='ready'){if(mode==='uncertain_ready')throw Error('synthetic lost acknowledgment');return {schema:'licensed-launch-csv-ready-v1',captureId:id(5),readyAckId:id(8),availableAt:now};}
      if(operation==='fail')return {schema:'licensed-launch-csv-completion-v1',terminal:'failed',actionEligible:false,captureId:null};
      throw Error('unexpected synthetic operation');},
  };
  return {deps,events,body,captured};
}
test('one genuine lease encloses artifact bytes, registration and SQL derivation; no legacy canonical approval',async()=>{
  const f=fixture(), result=await drainLaunchSourceWithDependencies(f.deps);
  assert.deepEqual(f.events,['acquire','claim','lease-check','fetch','lease-check','put','lease-check','register','lease-check','complete','ready','release']);
  assert.equal(result.outcomes[0].status,'recorded');assert.equal(result.sourceAuthority,false);assert.equal(result.scoreAuthority,false);
  assert.deepEqual(f.captured,[f.body]);
});
test('missing/wrong owned lease, expired claim or forged endpoint performs zero source/artifact IO',async()=>{
  for(const mode of ['no_lease','wrong_owner','expired','forged_profile']){
    const f=fixture(mode);try{await drainLaunchSourceWithDependencies(f.deps);}catch{/* closed claim rejection */}
    assert.equal(f.events.includes('fetch'),false,mode);assert.equal(f.events.includes('put'),false,mode);
    assert.equal(f.events.includes('register'),false,mode);
    if(mode!=='no_lease')assert.equal(f.events.at(-1),'release',mode);
  }
});
test('artifact/transport failure settles once while a completion uncertainty never retries bytes or changes outcome',async()=>{
  for(const mode of ['artifact_failure','wrong_response_url','uncertain_complete','uncertain_ready']){
    const f=fixture(mode),result=await drainLaunchSourceWithDependencies(f.deps);
    const uncertain=mode.startsWith('uncertain_');assert.equal(result.outcomes[0].status,uncertain?'uncertain':'failed');
    assert.equal(f.events.filter(value=>value==='complete').length,uncertain?1:0);
    assert.equal(f.events.filter(value=>value==='fail').length,uncertain?0:1);
    assert.equal(f.events.at(-1),'release');
  }
});
test('classification distinguishes unbound, disabled bound and unavailable catalog without fallback',async()=>{
  for(const data of [{bound:false},{bound:true,configured:false},{bound:true,configured:true}]){
    assert.deepEqual(await classifyLaunchSourceJob({rpc:async()=>({data,error:null})},id(2)),data);
  }
  for(const response of [{data:null,error:{code:'missing'}},{data:{},error:null},{data:{bound:false,extra:true},error:null}])
    await assert.rejects(()=>classifyLaunchSourceJob({rpc:async()=>response},id(2)),/dispatch_unavailable/u);
});
test('explicit uncertainty recovery reads a persisted outcome then acknowledges readiness without raw acquisition or append',async()=>{
  const f=fixture();f.deps.command=async(owner,operation)=>{f.events.push(operation);assert.equal(owner,id(1));
    if(operation==='receipt')return {recorded:true,outcome:'complete',captureId:id(5),reason:'sql_derived_licensed_csv',historicalReceipt:true};
    if(operation==='ready')return {schema:'licensed-launch-csv-ready-v1',captureId:id(5),readyAckId:id(8),availableAt:now};
    throw Error('unexpected recovery mutation');};
  assert.equal((await recoverLaunchSourceWithDependencies(f.deps,id(3))).status,'recorded');
  assert.deepEqual(f.events,['acquire','receipt','ready','release']);
});

/** Execute the ACTUAL route after transpilation with every external edge
 * replaced. No actual environment, vault, DB, network or filesystem write. */
async function routeFixture(mode:'unbound'|'bound'|'disabled'|'lookup_failure'|'multiple_bound'|'mixed'|'busy'|'no_pool'|'partial'|'prepass_uncertain'|'dry'|'pre_open'|'holiday'|'calendar_missing'|'deferred_bound'|'unauthorized'|'database_failure'){
  const events:string[]=[],source=await readFile(new URL('../../app/api/internal/taiwan-data-queue-drain/route.ts',import.meta.url),'utf8');
  const parserSource=await readFile(new URL('../taiwan-candidate-refresh.ts',import.meta.url),'utf8');
  const parserAst=ts.createSourceFile('source-drain-options.ts',parserSource,ts.ScriptTarget.Latest,true);
  const parser=parserAst.statements.find(item=>ts.isFunctionDeclaration(item)&&item.name?.text==='parseTaiwanDrainOptions');assert.ok(parser);
  const parsedExports:{exports:Record<string,unknown>}={exports:{}};
  vm.runInNewContext(ts.transpileModule(parser.getText(parserAst),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module:parsedExports,exports:parsedExports.exports});
  let activeSource=0;
  const client={rpc:async(name:string)=>{
    if(name==='claim_taiwan_data_refresh_jobs_v6'){if(mode==='partial')return {data:null,error:{message:'synthetic legacy claim rejected'}};
      return {data:[id(2),...(mode==='multiple_bound'||mode==='mixed'?[id(12)]:[])].map(jobId=>({job_id:jobId,dataset:'daily_price',symbol:'5274',exchange:'TPEX',refresh_phase:'final',requested_session_date:'2026-11-13'})),error:null};}
    if(name==='persist_taiwan_data_canonical_result_v5'){events.push('legacy_persist');return {data:id(7),error:null};}
    if(name==='complete_taiwan_data_refresh_job_v5'){events.push('legacy_complete');return {data:'terminal',error:null};}
    if(name==='record_taiwan_data_publication_metadata_v5')return {data:{},error:null};
    throw Error('unexpected route RPC');}};
  const stubs:Record<string,unknown>={
    'node:crypto':{randomUUID:()=>id(6)},'next/server':{NextResponse:{json:(body:unknown,init?:{status:number})=>({body,status:init?.status??200})}},
    '@/lib/internal-auth':{requireExactInternalBearer:()=>mode!=='unauthorized'},
    '@/lib/taiwan-data-provider':{acquireTaiwanDataset:async()=>{assert.equal(activeSource,0);events.push('legacy_fetch');return {terminal:'complete',actionEligible:false,canonical:{},selectedProvider:'tpex',selectedAuthorityTier:'official_primary'};}},
    '@/lib/taiwan-data-runtime':{requireActiveVpsWriter:async()=>({ok:true,releaseId:'a'.repeat(40),supabase:client}),parseTaiwanQueueRequest:()=>({sessionDate:'2026-11-13'})},
    '@/lib/finmind-vault':{readFinMindVaultToken:async()=>{events.push('vault');return 'SYNTHETIC_ONLY';}},
    '@/lib/taiwan-candidate-refresh':{parseTaiwanDrainOptions:parsedExports.exports.parseTaiwanDrainOptions,isTaiwanRefreshComplete:()=>false,isTaiwanRefreshResearchReady:()=>true},
    '@/lib/bounded-official-curl-fetch':{boundedOfficialCurlFetch:()=>{throw Error('unexpected fetch');}},
    '@/lib/vnext/auth':{vnextIdentity:()=>({role:'operator',principal:'SYNTHETIC_OPERATOR'})},
    '@/lib/vnext/launch-source-store':{launchSourcesEnabled:()=>!['unbound','disabled','lookup_failure','dry'].includes(mode),
      prepareLaunchSources:async()=>{events.push('prepare');if(mode==='busy'||mode==='database_failure')throw Error('synthetic guarded preparation unavailable');
        const status=mode==='no_pool'?'no_active_pool':['pre_open','holiday','calendar_missing','deferred_bound'].includes(mode)?'deferred':'planned';
        return parseLaunchSourcePlan({schemaVersion:'licensed-launch-csv-plan-v2',status,jobs:status==='planned'?1:0,
          session:status==='planned'?'2026-11-13':null,reason:status==='deferred'?'awaiting_current_completed_session':null,sourceAuthority:false});},
      drainLaunchSources:async()=>{events.push('pre_drain');return {outcomes:mode==='partial'||mode==='prepass_uncertain'?[{jobId:id(22),attemptId:id(23),captureId:mode==='partial'?id(25):null,status:mode==='partial'?'recorded':'uncertain'}]:[],sourceAuthority:false,scoreAuthority:false};},
      classifyLaunchSourceJob:async(_client:unknown,jobId:string)=>{events.push('classify');if(mode==='lookup_failure')throw Error('synthetic lookup failure');return ['unbound','pre_open','holiday','calendar_missing'].includes(mode)||mode==='mixed'&&jobId===id(12)?{bound:false}:{bound:true,configured:mode!=='disabled'};},
      adoptClaimedLaunchSource:async(_identity:unknown,jobId:string)=>{activeSource++;assert.equal(activeSource,1);events.push('licensed');await Promise.resolve();activeSource--;return {jobId,attemptId:id(3),status:'recorded',captureId:id(5)};}},
  };
  const exported:{exports:Record<string,unknown>}={exports:{}};
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{module:exported,exports:exported.exports,require:(name:string)=>{
    if(!Object.hasOwn(stubs,name))throw Error('unexpected route dependency');return stubs[name];},Buffer,Date,Set,Map,Promise});
  type Reply={status:number;body:{ok:boolean;result?:{licensedSources:unknown[];completed?:number;sourcePrepass?:{status:string;reason?:string;sourceAuthority:false}}}};
  const post=exported.exports.POST as (request:Request)=>Promise<Reply>;
  const response=await post(new Request('https://fixture.invalid/',{method:'POST',body:JSON.stringify({limit:mode==='multiple_bound'||mode==='mixed'?2:1,...(mode==='dry'?{dryRun:true}:{})})}));
  return {events,response};
}
test('actual drain dispatch precedes legacy credential/fetch/persist, with unchanged unbound path and no bound/unknown fallback',async()=>{
  const unbound=await routeFixture('unbound');assert.deepEqual(unbound.events,['classify','vault','legacy_fetch','legacy_persist','legacy_complete']);
  assert.equal(unbound.response.body.ok,true);
  const bound=await routeFixture('bound');assert.deepEqual(bound.events,['prepare','pre_drain','classify','licensed']);assert.equal(bound.response.body.result!.licensedSources.length,1);
  for(const mode of ['disabled','lookup_failure'] as const){const result=await routeFixture(mode);assert.deepEqual(result.events,['classify']);
    assert.equal(result.response.body.ok,false);assert.equal(result.response.body.result!.completed,0);}
});
test('actual drain serializes multiple source leases and releases source work before unbound parallel provider IO',async()=>{
  const multiple=await routeFixture('multiple_bound');assert.deepEqual(multiple.events,['prepare','pre_drain','classify','classify','licensed','licensed']);
  assert.equal(multiple.response.body.result!.completed,2);
  const mixed=await routeFixture('mixed');assert.deepEqual(mixed.events,['prepare','pre_drain','classify','classify','licensed','vault','legacy_fetch','legacy_persist','legacy_complete']);
  assert.equal(mixed.response.body.result!.completed,2);
});
test('actual source prepass owns its path before legacy claim, skips no-pool/dry work and reports partial/uncertain work honestly',async()=>{
  const busy=await routeFixture('busy');assert.deepEqual(busy.events,['prepare']);assert.equal(busy.response.body.ok,false);
  const empty=await routeFixture('no_pool');assert.deepEqual(empty.events,['prepare','classify']);assert.equal(empty.response.body.result!.sourcePrepass!.status,'no_active_pool');
  const dry=await routeFixture('dry');assert.deepEqual(dry.events,[]);assert.equal(dry.response.body.ok,false);
  const partial=await routeFixture('partial');assert.deepEqual(partial.events,['prepare','pre_drain']);assert.equal(partial.response.body.ok,false);assert.equal(partial.response.body.result!.licensedSources.length,1);
  const uncertain=await routeFixture('prepass_uncertain');assert.deepEqual(uncertain.events,['prepare','pre_drain']);assert.equal(uncertain.response.body.ok,false);
});

test('closed SQL v2 plan keeps deferred, no-pool and planned states distinct without authority',()=>{
  const base={schemaVersion:'licensed-launch-csv-plan-v2',status:'deferred',reason:'awaiting_current_completed_session',jobs:0,session:null,sourceAuthority:false};
  assert.equal(parseLaunchSourcePlan(base).status,'deferred');
  assert.equal(parseLaunchSourcePlan({...base,status:'no_active_pool',reason:null}).status,'no_active_pool');
  assert.equal(parseLaunchSourcePlan({...base,status:'planned',reason:null,jobs:1,session:'2026-11-13'}).status,'planned');
  for(const invalid of [{...base,schemaVersion:'licensed-launch-csv-plan-v1'},{...base,jobs:1},{...base,session:'2026-11-12'},
    {...base,reason:null},{...base,status:'unknown'},{...base,sourceAuthority:true},{...base,status:'no_active_pool'},
    {...base,status:'planned',reason:null},{...base,status:'planned',reason:null,jobs:1,session:'2026-02-30'},
    {...base,cutoff:'2026-11-13T13:30:00Z'}])assert.throws(()=>parseLaunchSourcePlan(invalid),/launch_source_plan_unavailable/u);
});
test('actual enabled drain defers only fresh planning while ordinary jobs continue; old bound work keeps owned dispatch',async()=>{
  // Labels simulate the same DB result; this test does not establish an actual
  // holiday, market session, SQL clock or source-publication authority.
  for(const mode of ['pre_open','holiday','calendar_missing'] as const){
    const {events,response}=await routeFixture(mode);
    assert.deepEqual(events,['prepare','classify','vault','legacy_fetch','legacy_persist','legacy_complete']);
    assert.equal(response.status,200);assert.equal(response.body.ok,true);assert.equal(response.body.result!.sourcePrepass!.status,'deferred');
    assert.equal(response.body.result!.sourcePrepass!.reason,'awaiting_current_completed_session');assert.equal(response.body.result!.sourcePrepass!.sourceAuthority,false);
    assert.equal(response.body.result!.completed,1);
  }
  const bound=await routeFixture('deferred_bound');assert.deepEqual(bound.events,['prepare','classify','licensed']);
  assert.equal(bound.response.status,200);assert.equal(bound.response.body.ok,true);assert.equal(bound.response.body.result!.completed,1);
  assert.equal(bound.response.body.result!.sourcePrepass!.sourceAuthority,false);
  for(const mode of ['busy','database_failure','unauthorized'] as const){
    const {events,response}=await routeFixture(mode);assert.deepEqual(events,mode==='unauthorized'?[]:['prepare']);
    assert.equal(response.status,mode==='unauthorized'?401:503);assert.equal(response.body.ok,false);
  }
});
