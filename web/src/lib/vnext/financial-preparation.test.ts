import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as contract from './financial-preparation-contract.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {candidateFinancialFactInput,candidateParsedExchangeFinancialFact,candidateMopsDownloadUrl} from '../candidate-official-financials.ts';
const nativeRequire=createRequire(import.meta.url),id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Row=Record<string,unknown>;
type Module=Record<string,(...args:unknown[])=>Promise<unknown>>;
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function fixture(options:{enabled?:boolean;operation?:'acquire'|'parse';failure?:string;partial?:boolean;dbMode?:'legacy_off'|'vnext_on';operatorMissing?:boolean;profile?:'mops'}={}){
 const operation=options.operation??'acquire',enabled=options.enabled!==false,failure=options.failure??'';
 const context={schemaVersion:'financial-preparation-context-v1',mode:options.dbMode??(enabled?'vnext_on':'legacy_off'),backendId:id(1),releaseId:'a'.repeat(40),runnerPrincipal:id(2)};
 const bytes=Buffer.from('synthetic financial bytes, no source authority'),hash=createHash('sha256').update(bytes).digest('hex');
 const attempt={attemptId:id(10),operation,mode:context.mode,backendId:id(1),releaseId:context.releaseId,runnerPrincipal:id(2),jobId:id(20),receiptId:operation==='parse'?id(21):null,stockId:id(30),symbol:'2330',exchange:'TWSE',statementKind:'general',periodEnd:'2026-09-30',
  sourceUrl:operation==='parse'||options.profile==='mops'?candidateMopsDownloadUrl('2330',2026,3):'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci',profile:operation==='parse'||options.profile==='mops'?'mops-attachment-v1':'twse-generalIncome-v1',memberInputHash:enabled?'b'.repeat(64):null,rightsBindingHash:'c'.repeat(64),deadline:new Date(Date.now()+90000).toISOString(),
  artifact:operation==='parse'?{hash,bytes:bytes.length,mediaType:'application/xhtml+xml',objectKey:`issuer/${id(30)}/2026-09-30/${hash}`}:null};
 const identity={factId:id(40),recordedAt:new Date().toISOString()};
 const terminalStatus=options.partial?'partial':options.profile==='mops'?'acquired_pending_parse':'validated';
 const committed={attemptId:id(10),receiptId:operation==='parse'||options.profile==='mops'?id(21):null,subjectIdentities:options.partial||options.profile==='mops'?[]:[identity]};
 let activeLease:string|null=null,leaseCalls=0,claimCount=0,provider=0,puts=0,parsers=0,commits=0,finish=false,witness=false,commitExists=false,uncertainUsed=false,deferred=false;
 const trace:string[]=[],commands:Array<{command:string;request:Row;lease:unknown}>=[];
 const client={async rpc(name:string,args:Row){
  assert.equal(name,contract.FINANCIAL_PREPARATION_RPC);const command=String(args.p_command),request=args.p_request as Row;trace.push(command);commands.push({command,request:clone(request),lease:args.p_lease_owner});
  if(command!=='context'&&command!=='inspect'){assert.ok(activeLease);assert.equal(args.p_lease_owner,activeLease);}
  else assert.equal(args.p_lease_owner,null);
  const okay=(data:unknown)=>({data:clone(data),error:null});
  if(failure==='bridge'&&command==='context')return {data:null,error:{code:'PGRST202'}};
  if(command==='context')return okay(context);
  if(command.startsWith('recover-'))return okay({context,pending:(commitExists||deferred)&&!witness?[{attempt,commit:commitExists?committed:null,state:finish?'finished':'committed'}]:[],known:witness?[{attemptId:id(10),status:deferred?'deferred':terminalStatus,availableAt:identity.recordedAt}]:[],blockedCount:failure==='drift'?1:0});
  if(command.startsWith('claim-')){
   if(failure==='legacy-pending')return {data:null,error:{code:'P0001',message:'financial_preparation_legacy_validation_bridge_missing'}};
   if(failure==='claim-db')return {data:null,error:{code:'08006'}};
   if(claimCount++||commitExists)return okay({context,attempts:[]});return okay({context,attempts:[attempt]});
  }
  if(command==='inspect'||command==='commit-check')return okay({context,attemptId:id(10),state:witness?'known':finish?'finished':commitExists?'committed':'claimed',commit:commitExists?committed:null});
  if(command==='commit-acquire'||command==='commit-parse'){
   commits++;commitExists=true;
   if(failure==='lost-commit'&&!uncertainUsed){uncertainUsed=true;return {data:null,error:{code:'08006'}};}return okay(committed);
  }
  if(command==='settle-failure'){deferred=true;finish=true;return okay({attemptId:id(10),status:'deferred'});}
  if(command==='validation-write')return okay({procedureResult:true});
  if(command==='finish'){finish=true;if(failure==='lost-finish'&&!uncertainUsed){uncertainUsed=true;return {data:null,error:{code:'08006'}};}return okay({attemptId:id(10),status:terminalStatus});}
  if(command==='witness'){if(failure==='deferred-witness'&&!uncertainUsed){uncertainUsed=true;return {data:null,error:{code:'08006'}};}witness=true;if(failure==='lost-witness'&&!uncertainUsed){uncertainUsed=true;return {data:null,error:{code:'08006'}};}return okay({attemptId:id(10),status:deferred?'deferred':terminalStatus,availableAt:identity.recordedAt});}
  throw Error('unexpected_synthetic_financial_command');
 }};
 const commonFact={stockId:id(30),symbol:'2330',factKey:'quarterly_revenue',periodStart:'2026-01-01',periodEnd:'2026-09-30',durationKind:'quarterly',value:1000,unit:'TWD',provider:'mops',authorityTier:'official_filing',estimateKind:'reported',estimateHorizon:'reported_period',filingPublishedAt:null,sourceTimestamp:'2026-11-01T00:00:00Z',collectedAt:'2026-11-01T00:00:00Z',filingRestatementId:null,sourceRef:`issuer-document:${hash}:synthetic`,locator:{xbrl_context:'synthetic',xbrl_concept:'synthetic'}};
 const env={INTERNAL_API_KEY:'synthetic-internal',STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL:enabled&&!options.operatorMissing?'synthetic-operator':undefined,STOCKINSIDER_PRIVATE_ARTIFACT_ROOT:'/synthetic/private/artifacts'};
 const modules:Record<string,unknown>={
  'node:crypto':nativeRequire('node:crypto'),'next/server':{NextResponse:{json:(body:unknown,init:ResponseInit)=>new Response(JSON.stringify(body),init)}},
  '../internal-auth.ts':null,'./auth.ts':null,'./policy.ts':{vnextEnabled:()=>enabled},
  '../taiwan-data-runtime.ts':{requireActiveVpsWriter:async()=>failure==='writer-inactive'
   ?{ok:false,error:'writer_release_not_active'}:{ok:true,releaseId:context.releaseId,supabase:client}},
  '../production-write-lease.ts':{acquireProductionWriteLease:async()=>{leaseCalls++;trace.push('acquire');if(failure==='busy-claim'&&leaseCalls===1||failure==='busy-final'&&leaseCalls===3)return null;if(failure==='acquire-error')throw Error('synthetic');assert.equal(activeLease,null);activeLease=id(100+leaseCalls);return activeLease;},
   releaseProductionWriteLease:async(owner:string)=>{trace.push('release');assert.equal(owner,activeLease);activeLease=null;if(failure==='release'&&leaseCalls===1||failure==='release-final'&&leaseCalls===3)throw Error('synthetic');}},
  '../private-artifact-store.ts':{privateArtifactStore:()=>({put:async(_hash:string,b:Buffer)=>{assert.ok(activeLease);assert.equal(createHash('sha256').update(b).digest('hex'),_hash);puts++;trace.push('put');return {created:true};}})},
  '../opportunity-v3/internal.ts':{fixedRunnerPrincipal:()=>id(2)},
  '../candidate-financial-artifact.ts':{readCandidateFinancialArtifact:async()=>{assert.equal(activeLease,null);return Buffer.from(bytes);}},
  '../candidate-financial-documents.ts':{validateCandidateFinancialDocument:()=>({format:'xbrl'}),candidateFinancialFactsFromValidatedManifest:(input:Row)=>options.partial?[]:[{...commonFact,collectedAt:input.collectedAt}]},
  '../candidate-official-financials.ts':{candidateFinancialFactInput,candidateParsedExchangeFinancialFact,fetchPreparedCandidateMopsFiling:async(capability:unknown)=>{assert.equal(activeLease,null);await main.verifyFinancialPreparation(capability,{operation:'acquire',symbol:'2330',sourceUrl:attempt.sourceUrl});provider++;trace.push('provider');return {document:{bytes:Buffer.from(bytes),contentType:'application/xhtml+xml',collectedAt:new Date().toISOString(),periodEnd:attempt.periodEnd}};},
   fetchPreparedOfficialFinancialPayload:async(capability:unknown,url:string)=>{assert.equal(activeLease,null);await main.verifyFinancialPreparation(capability,{operation:'acquire',sourceUrl:url});provider++;trace.push('provider');if(failure==='deferred-witness')throw Error('prepared_official_http_server_error');return {body:'[]',rawBytes:Buffer.from('[]'),responseBytes:2};}},
  '../candidate-financial-acquisition.ts':{parseExchangeFinancialEndpoint:()=>({terminalReason:'complete',facts:[{symbol:'2330',factKey:'quarterly_revenue',periodStart:'2026-01-01',periodEnd:failure==='period-missing'?'2026-06-30':'2026-09-30',durationKind:'quarterly',value:1,unit:'TWD_thousand',sourceRef:'twse-openapi:synthetic',sourceTimestamp:'2026-11-01T00:00:00Z',filingRestatementId:'synthetic'}]})},
  '../candidate-financial-local-parser.ts':{runPreparedFinancialLocalParser:async(capability:unknown,input:Row)=>{assert.equal(activeLease,null);await main.verifyFinancialPreparation(capability,{operation:'parse',artifactHash:input.documentSha256,symbol:'2330',periodEnd:'2026-09-30'});parsers++;trace.push('parser');if(failure==='parser-throws')throw Error('synthetic_parser_failure');return {status:options.partial?'partial':'complete',missingRequirements:[],locators:[],validatedFacts:[],parser:'arelle'};}},
  '../candidate-financial-document-worker.ts':{candidateFinancialParserEvidence:(_parse:unknown,digest:string)=>({schema:'candidate-financial-parser-evidence-v10',documentSha256:digest}),candidateFinancialDocumentFactInput:candidateFinancialFactInput},
  '../official-financial-validation-worker.ts':{validatePendingOfficialFinancials:async(_stocks:unknown,deps:Row)=>{assert.equal(activeLease,null);assert.deepEqual(clone(deps.subjectIdentities),[identity]);const scoped=deps.client as typeof client;
   await scoped.rpc('record_official_financial_validation',{p_fact_id:id(40),p_recorded_at:identity.recordedAt,p_source_sha256:operation==='parse'?hash:createHash('sha256').update('[]').digest('hex'),p_input_hash:'d'.repeat(64),p_validation:{status:'validated'},p_validator_principal:id(2)});return {status:'success'};}},
  './evidence-clock.ts':{evidenceInstant},
  // Cross-VM objects model actual JSON RPC transport, not caller object grants.
  './financial-preparation-contract.ts':{...contract,preparationData:(v:unknown)=>contract.preparationData(clone(v)),parsePreparationContext:(v:unknown)=>contract.parsePreparationContext(clone(v)),parsePreparationAttempt:(v:unknown,c:contract.PreparationContext,o:contract.PreparationOperation)=>contract.parsePreparationAttempt(clone(v),c,o)},
 };
 function load(relative:string){const file=new URL(relative,import.meta.url),source=fs.readFileSync(file,'utf8');const compiled=ts.transpileModule(source,{fileName:file.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const isolatedModule={exports:{} as Module};const run=vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})`,{Buffer,Response,Request,TextDecoder,AbortSignal,Date,process:{env}},{timeout:1000}) as (r:(name:string)=>unknown,m:typeof isolatedModule,e:Module)=>void;
  run(name=>{if(Object.hasOwn(modules,name))return modules[name];throw Error(`unexpected_test_import:${name}`);},isolatedModule,isolatedModule.exports);return isolatedModule.exports;}
 modules['../internal-auth.ts']=load('../internal-auth.ts');modules['./auth.ts']=load('./auth.ts');
 const main:Module=load('./financial-preparation.ts');modules['@/lib/vnext/financial-preparation']=main;
 const route=load(operation==='parse'?'../../app/api/internal/candidate-financial-documents/worker/route.ts':'../../app/api/internal/candidate-financial-queue-drain/route.ts');
 return {main,trace,commands,counts:()=>({provider,puts,parsers,commits,activeLease,leaseCalls}),async post(body:unknown={limit:1},headers:Record<string,string>={authorization:'Bearer synthetic-internal'}){return await route.POST(new Request('http://127.0.0.1/api/internal/synthetic',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})) as Response;}};
}
test('ACTUALtwo preparation routes ON/OFF reachprivateprep only; leasedclaim/commit andprovider/parser outsidegloballease',async()=>{
 for(const enabled of [true,false])for(const operation of ['acquire','parse'] as const){const f=fixture({enabled,operation}),response=await f.post();assert.equal(response.status,200);const body=await response.json();assert.equal(body.mode,enabled?'vnext_on':'legacy_off');assert.equal(body.claimed,1);assert.equal(body.qualificationAuthority,false);assert.equal(body.rankingAuthority,false);assert.equal(f.counts().activeLease,null);assert.equal(f.counts().commits,1);assert.equal(f.counts().provider,operation==='acquire'?1:0);assert.equal(f.counts().parsers,operation==='parse'?1:0);
  assert.ok(f.trace.indexOf('release')<f.trace.indexOf(operation==='acquire'?'provider':'parser'));assert.ok(f.trace.indexOf('put')>f.trace.indexOf('commit-check'));assert.equal(f.commands.some(c=>c.command==='enqueue'),false);}
});
test('ACTUALMOPS acquisition stagesbyteswithoutlease thenregistersreceiptonlyinsidefreshownedcommit',async()=>{
 const f=fixture({profile:'mops'}),response=await f.post();assert.equal(response.status,200);const body=await response.json();assert.equal(body.results[0].status,'acquired_pending_parse');assert.equal(f.counts().provider,1);assert.equal(f.counts().puts,1);const commit=f.commands.find(c=>c.command==='commit-acquire');assert.ok(commit);assert.equal(commit.request.facts,null);assert.equal(f.counts().activeLease,null);
});
test('ACTUALroutes exactbearer/closedlimit refusebeforeanyDB/lease/provider; wrongmode andmissingbridge blockbeforeIO',async()=>{
 const invalidHeaders:Array<Record<string,string>>=[{},{authorization:'synthetic-internal'},{authorization:'Bearer synthetic-internal','x-internal-key':'synthetic-internal'},{authorization:'Bearer author'}];
 for(const enabled of [true,false])for(const operation of ['acquire','parse'] as const){
  for(const headers of invalidHeaders){
   const f=fixture({enabled,operation});
   assert.equal((await f.post({limit:1},headers)).status,401);
   assert.deepEqual(f.trace,[]);
  }
  const upperLimit=operation==='acquire'?240:20;
  for(const body of [{limit:1,action:'enqueue'},{limit:'1'},{limit:0},{limit:upperLimit+1},{limit:1,url:'https://private.invalid'}]){
   const f=fixture({enabled,operation});
   assert.equal((await f.post(body)).status,422);
   assert.deepEqual(f.trace,[]);
  }
 }
 const missing=fixture({operatorMissing:true});assert.equal((await missing.post()).status,403);assert.deepEqual(missing.trace,[]);
 for(const options of [{failure:'bridge'},{dbMode:'legacy_off' as const}]){const f=fixture(options);assert.equal((await f.post()).status,503);assert.equal(f.counts().provider,0);assert.equal(f.counts().puts,0);}
});
test('acquisition and parser routes block an inactive writer before RPC, lease or I/O',async()=>{
 for(const enabled of [true,false])for(const operation of ['acquire','parse'] as const){
  const f=fixture({enabled,operation,failure:'writer-inactive'}),response=await f.post();
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'writer_release_not_active');
  assert.deepEqual(f.trace,[]);
 }
});
test('busy, failed claim, and failed lease release prevent staging in both operations and modes',async()=>{
 const failures=[['busy-claim',409],['acquire-error',503],['claim-db',503],['release',503]] as const;
 for(const enabled of [true,false])for(const operation of ['acquire','parse'] as const){
  for(const [failure,status] of failures){
   const f=fixture({enabled,operation,failure});
   const response=await f.post();
   assert.equal(response.status,status,`${operation}/${enabled}/${failure}`);
   const counts=f.counts();
   assert.deepEqual([counts.provider,counts.parsers,counts.puts,counts.commits,counts.activeLease],[0,0,0,0,null]);
  }
 }
});
test('contention after staging cannot write an artifact or settle another owner’s work',async()=>{
 for(const operation of ['acquire','parse'] as const){
  const f=fixture({operation,failure:'busy-final'}),response=await f.post();
  assert.equal(response.status,202);
  const counts=f.counts();
  assert.equal(counts.provider+counts.parsers,1);
  assert.deepEqual([counts.puts,counts.commits,counts.activeLease],[0,0,null]);
  assert.equal(f.commands.some(c=>c.command==='settle-failure'),false);
 }
});
test('FDL-06 a thrown parser failure settles only the owned attempt without publishing or persisting contents',async()=>{
 for(const enabled of [true,false]){
  const f=fixture({enabled,operation:'parse',failure:'parser-throws'}),response=await f.post();
  assert.equal(response.status,500);
  const body=await response.json();
  assert.equal(body.results[0].status,'deferred');
  assert.equal(body.results[0].reason,'parser_unavailable');
  const settle=f.commands.filter(c=>c.command==='settle-failure');
  assert.equal(settle.length,1);
  assert.equal(settle[0].request.attemptId,id(10));
  const counts=f.counts();
  assert.deepEqual([counts.parsers,counts.provider,counts.puts,counts.commits,counts.activeLease],[1,0,0,0,null]);
 }
});
test('unconfirmed release after a parser commit returns pending and recovers the same attempt',async()=>{
 for(const enabled of [true,false]){
  const f=fixture({enabled,operation:'parse',failure:'release-final'});
  const response=await f.post();
  assert.equal(response.status,202);
  assert.equal((await response.json()).results[0].status,'pending');
  assert.equal(f.counts().commits,1);
  assert.equal(f.counts().parsers,1);
  const recovered=await f.post();
  assert.equal(recovered.status,200);
  assert.equal((await recovered.json()).recovered,1);
  const counts=f.counts();
  assert.deepEqual([counts.parsers,counts.puts,counts.commits,counts.activeLease],[1,1,1,null]);
 }
});
test('lostcommit/finish/witness responses recoveracrosslimit-only requests WITHOUTrefetch/reparse/recommit ornewworkcharge',async()=>{
 for(const failure of ['lost-commit','lost-finish','lost-witness']){const f=fixture({failure});assert.equal((await f.post()).status,202);const before=f.counts();const response=await f.post();assert.equal(response.status,200);assert.equal(f.counts().provider,before.provider);assert.equal(f.counts().commits,1);assert.equal(f.counts().activeLease,null);const body=await response.json();assert.ok(body.recovered===1||body.known.length===1);assert.equal(f.commands.some(c=>c.command==='settle-failure'),false);}
});
test('failedprovider settlement withlostwitness recoversONLYdeferredledgerknowledge, notrawbytes orfinancialapproval',async()=>{
 const f=fixture({failure:'deferred-witness'});assert.equal((await f.post()).status,202);assert.equal(f.counts().provider,1);assert.equal(f.counts().commits,0);
 const response=await f.post();assert.equal(response.status,500);const body=await response.json();assert.equal(body.recovered,1);assert.equal(body.results[0].status,'deferred');assert.equal(f.counts().provider,1);assert.equal(f.counts().puts,0);assert.equal(f.counts().activeLease,null);
});
test('partialparser/subjectscope stayspartial andunrecoverablecontext explicitlyneedsoperatorreconciliation',async()=>{
 const legacy=fixture({operation:'parse',failure:'legacy-pending'}),legacyResponse=await legacy.post();assert.equal(legacyResponse.status,503);assert.equal((await legacyResponse.json()).error,'financial_preparation_legacy_validation_bridge_missing');assert.equal(legacy.counts().parsers,0);assert.equal(legacy.counts().puts,0);
 const f=fixture({operation:'parse',partial:true}),response=await f.post();assert.equal(response.status,500);assert.equal((await response.json()).results[0].status,'partial');assert.equal(f.counts().activeLease,null);
 const drift=fixture({failure:'drift'}),blocked=await drift.post();assert.equal(blocked.status,202);assert.ok((await blocked.json()).gaps.includes('financial_preparation_operator_reconciliation_required'));
});
test('no callercreatedcontext orcapability canauthorizepreparedIO, andbareprotocol rejectsprivate/futureprofile extras',async()=>{
 const f=fixture();await assert.rejects(f.main.verifyFinancialPreparation(Object.freeze({}),{operation:'acquire'}),/capability_required/u);assert.deepEqual(f.trace,[]);
 assert.throws(()=>contract.parsePreparationContext({schemaVersion:'financial-preparation-context-v1',mode:'legacy_off',backendId:id(1),releaseId:'a'.repeat(40),runnerPrincipal:id(2),grant:true}),/protocol_invalid/u);
 let hooks=0;const value={};Object.defineProperty(value,'grant',{enumerable:true,get(){hooks++;return true;}});assert.throws(()=>contract.preparationData(value),/protocol_invalid/u);assert.equal(hooks,0);
});

test('complete mapped official JSON missingthefrozenperiod deferssamejobwithouttransportfailurecharge orrawpersistence',async()=>{
 const f=fixture({failure:'period-missing'}),response=await f.post();assert.equal(response.status,500);const body=await response.json();assert.equal(body.results[0].status,'deferred');assert.equal(body.results[0].reason,'requested_period_missing');
 const settle=f.commands.filter(c=>c.command==='settle-failure');assert.equal(settle.length,1);assert.equal(settle[0].request.attemptId,id(10));assert.equal(settle[0].request.reason,'requested_period_missing');assert.equal(f.counts().provider,1);assert.equal(f.counts().puts,0);assert.equal(f.counts().commits,0);assert.equal(f.counts().activeLease,null);
});
