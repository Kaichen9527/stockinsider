/** Actual-module integration with SYNTHETIC VM ports only. No PostgreSQL,
 * scheduler, measured contention, real environment, network or timer proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

type Row=Record<string,unknown>;
const root=fileURLToPath(new URL('./',import.meta.url)),nativeRequire=createRequire(import.meta.url);
const session='2026-11-13',priorRun='00000000-0000-4000-8000-000000000001';
function fixture(){
 const context=vm.createContext({process:{env:{}}});
 vm.runInContext(`
 const policy='stockinsider-launch-radar-v1',rules='launch-radar-comparisons-v5',arithmetic='binary64-v1';
 const identity={principal:'SYNTHETIC_OPERATOR',role:'operator'};
 const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
 const state={calls:[],holder:null,gateAcquire:null,acquireReached:false,holdStarted:false,hold:deferred(),
  ready:true,cutoff:'${session}T21:30:00+08:00',contextError:false,commandError:false,retainReason:null,published:null,charges:0,
  current:{rankingRunId:'${priorRun}',previousRankingRunId:null,session:'2026-11-12',publishedAt:'2026-11-12T13:31:00Z'}};
 const receipt=(request,published,replay=false)=>({schemaVersion:'vnext-launch-ranking-write-v2',policyVersion:policy,rulesVersion:rules,arithmeticVersion:arithmetic,
  published,retained:!published,reason:published?null:state.retainReason,rankingRunId:published?request.rankingRunId:state.current.rankingRunId,
  requestRunId:request.rankingRunId,replay,historicalReceipt:replay});
 const client={rpc:async(name,args)=>{
  state.calls.push({name,args:JSON.parse(JSON.stringify(args))});
  if(name==='acquire_production_write_lease'){
   state.acquireReached=true;if(state.gateAcquire)await state.gateAcquire.promise;
   if(state.holder)return {data:false,error:null};state.holder=args.p_owner_id;return {data:true,error:null};
  }
  if(name==='release_production_write_lease'){
   if(state.holder!==args.p_owner_id)throw Error('synthetic_wrong_lease_owner');state.holder=null;return {data:true,error:null};
  }
  if(name==='vnext_launch_cycle_context_v1')return state.contextError?{data:null,error:{message:'SYNTHETIC_CONTEXT_REJECTION'}}:
   {data:{ready:state.ready,reason:state.ready?null:'launch_slot_unready',session:'${session}',cutoff:state.cutoff,policyVersion:policy},error:null};
  if(name==='vnext_launch_ranking_command_v1'){
   if(state.holder!==args.p_lease_owner)throw Error('synthetic_missing_owned_lease');
   if(state.commandError)return {data:null,error:{message:'SYNTHETIC_POSTLEASE_CONTEXT_OR_DEADLINE_REJECTION'}};
   if(state.retainReason)return {data:receipt(args.p_request,false),error:null};
   if(state.published)return {data:receipt(args.p_request,true,true),error:null};
   state.charges++;state.published={rankingRunId:args.p_request.rankingRunId,previousRankingRunId:args.p_request.expectedPreviousRankingRunId,
    session:'${session}',publishedAt:'${session}T13:40:39Z'};state.current=state.published;
   return {data:receipt(args.p_request,true),error:null};
  }
  throw Error('unexpected_synthetic_rpc');
 }};
 const ports={
  'supabase-server':{getSupabaseServerClient:()=>client},
  'taiwan-data-runtime':{requireActiveVpsWriter:async()=>{state.calls.push({name:'writer-metadata'});return {ok:true,supabase:client}}},
  'launch-ranking-read':{LAUNCH_RANKING_POLICY:policy,LAUNCH_RANKING_RULES:rules,LAUNCH_RANKING_ARITHMETIC:arithmetic,launchRankingEnabled:()=>true,
   readLaunchRankingSnapshot:async(query)=>{state.calls.push({name:'read-launch',query:query??null});return query?
    {availability:state.published?'ready':'not_found',snapshot:state.published}:{availability:'ready',snapshot:state.current}}},
  'provider':{openAiResponsesProvider:()=>{throw Error('unexpected_provider')},providerCredentialIdentity:()=>{throw Error('unexpected_provider_identity')}},
  'market-interpretation':{MARKET_AI_INSTRUCTIONS:'SYNTHETIC_UNUSED',freezeMarketBaseline:value=>value,interpretFrozenMarket:()=>{throw Error('unexpected_market_provider')}},
  'market-producer':{cachedMarketSnapshot:async()=>{state.calls.push({name:'market-baseline-read'});return {risk:'unknown',gaps:['SYNTHETIC_NO_AUTHORITY']}}},
  'calendar-sync':{synchronizeCachedCalendar:async()=>{state.calls.push({name:'market-calendar-write'});throw Error('unexpected_market_write')}},
  'store':{command:async()=>{state.calls.push({name:'old-command'});throw Error('unexpected_old_command')}}
 };
 `,context);
 const cache=new Map<string,Row>();
 const actual=new Set(['launch-ranking-command.ts','evidence-clock.ts','analysis-runtime.ts','market-ai-worker.ts','../production-write-lease.ts']);
 function load(relative:string):Row{
  const filename=path.resolve(root,relative),previous=cache.get(filename);if(previous)return previous;
  let source:string;
  if(relative==='../candidate-price-history.ts'){
   const parsed=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
   const declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isHistoryDate');
   assert.ok(declaration,'actual date validator is required');source=declaration.getText(parsed);
  }else{assert.ok(actual.has(relative),`unexpected actual import: ${relative}`);source=fs.readFileSync(filename,'utf8');}
  const isolated={exports:{} as Row};cache.set(filename,isolated.exports);
  const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const wrapped=vm.runInContext(`(function(require,module,exports){${compiled}\n})`,context,{timeout:1000}) as(require:(name:string)=>unknown,moduleObject:typeof isolated,exports:Row)=>void;
  wrapped(dependency=>{
   if(['node:crypto','crypto','node:util'].includes(dependency))return nativeRequire(dependency);
   assert.ok(dependency.startsWith('.'),`unexpected external edge: ${dependency}`);
   const resolved=path.resolve(path.dirname(filename),dependency.endsWith('.ts')?dependency:`${dependency}.ts`);
   const basename=path.basename(resolved,'.ts');
   const mock=vm.runInContext(`ports[${JSON.stringify(basename)}]`,context);if(mock)return mock;
   return load(path.relative(root,resolved));
  },isolated,isolated.exports);return isolated.exports;
 }
 const command=load('launch-ranking-command.ts');
 const evaluate=(source:string)=>vm.runInContext(source,context) as Row;
 const actor=evaluate('identity');
 const publish=()=> (command.publishLaunchRanking as(actor:unknown,value:unknown)=>Promise<Row>)(actor,evaluate(`({rankingRunId:'00000000-0000-4000-8000-000000000002',expectedPreviousRankingRunId:'${priorRun}'})`));
 const cycle=()=> (command.publishCycleLaunchRanking as(actor:unknown,day:unknown)=>Promise<Row>)(actor,session);
 const snapshot=()=>JSON.parse(vm.runInContext('JSON.stringify({calls:state.calls,holder:state.holder,current:state.current,charges:state.charges})',context)) as {calls:Array<{name:string;args?:Row}>;holder:string|null;current:Row;charges:number};
 async function started(name:'acquireReached'|'holdStarted'){
  for(let i=0;i<40&&!vm.runInContext(`state.${name}`,context);i++)await Promise.resolve();
  assert.equal(vm.runInContext(`state.${name}`,context),true,`${name} reached without a timer`);
 }
 const holdWriter=()=> (load('analysis-runtime.ts').analysisWriter as(work:()=>Promise<unknown>)=>Promise<unknown>)(evaluate('(async()=>{state.holdStarted=true;await state.hold.promise})') as unknown as()=>Promise<unknown>);
 return {load,evaluate,publish,cycle,snapshot,started,holdWriter,actor};
}
const calls=(f:ReturnType<typeof fixture>,name:string)=>f.snapshot().calls.filter(call=>call.name===name);
function assertLeasePairs(f:ReturnType<typeof fixture>){
 const acquired=calls(f,'acquire_production_write_lease'),released=calls(f,'release_production_write_lease');
 assert.ok(acquired.length>0);for(const call of [...acquired,...released])assert.equal(call.args?.p_lease_key,'production-data-plane');
 for(const release of released)assert.ok(acquired.some(acquire=>acquire.args?.p_owner_id===release.args?.p_owner_id));
 assert.equal(f.snapshot().holder,null);
}

test('actual command busy global lease performs zero publication RPC or old/provider work',async()=>{
 const f=fixture(),holder=f.holdWriter();await f.started('holdStarted');
 try{await assert.rejects(f.publish,/owned_lease_unavailable/u);assert.equal(calls(f,'vnext_launch_ranking_command_v1').length,0);assert.equal(calls(f,'old-command').length,0);assert.equal(f.snapshot().charges,0);}
 finally{f.evaluate('state.hold.resolve()');await holder;}
 assert.equal(calls(f,'release_production_write_lease').length,1);assertLeasePairs(f);
});
test('delayed actual lease sends only stable run/CAS IDs after exact server21:30 admission',async()=>{
 const f=fixture();f.evaluate('state.gateAcquire=deferred()');const pending=f.cycle();await f.started('acquireReached');
 assert.equal(calls(f,'vnext_launch_ranking_command_v1').length,0);
 f.evaluate('state.gateAcquire.resolve()');const result=await pending;assert.equal(result.published,true);
 const packet=calls(f,'vnext_launch_ranking_command_v1')[0].args!;
 assert.deepEqual(Object.keys(packet).sort(),['p_lease_owner','p_principal','p_request']);
 assert.deepEqual(Object.keys(packet.p_request as Row).sort(),['expectedPreviousRankingRunId','rankingRunId']);
 assert.equal((packet.p_request as Row).expectedPreviousRankingRunId,priorRun);
 assert.equal(calls(f,'vnext_launch_cycle_context_v1').length,1);assertLeasePairs(f);
 const shifted=fixture();shifted.evaluate("state.cutoff='2026-11-13T13:40:39Z'");
 await assert.rejects(shifted.cycle,/cycle_context_unavailable/u);
 assert.equal(calls(shifted,'acquire_production_write_lease').length,0);assert.equal(calls(shifted,'vnext_launch_ranking_command_v1').length,0);
});
test('unready admission starts no lease/write and postlease missed-slot receipt retains prior session/date',async()=>{
 const unready=fixture();unready.evaluate('state.ready=false');assert.equal((await unready.cycle()).retained,true);
 assert.equal(calls(unready,'acquire_production_write_lease').length,0);assert.equal(calls(unready,'vnext_launch_ranking_command_v1').length,0);
 const delayed=fixture(),before=delayed.snapshot().current;delayed.evaluate("state.retainReason='launch_slot_missed'");
 const result=await delayed.cycle();assert.equal(result.retained,true);assert.equal(result.rankingRunId,priorRun);
 assert.deepEqual(delayed.snapshot().current,before);assert.equal(delayed.snapshot().charges,0);assertLeasePairs(delayed);
});
test('postlease SQL context/deadline rejection releases once with no automatic retry or charge',async()=>{
 const f=fixture();f.evaluate('state.commandError=true');await assert.rejects(f.cycle,/publication_uncertain/u);
 assert.equal(calls(f,'vnext_launch_ranking_command_v1').length,1);assert.equal(calls(f,'release_production_write_lease').length,1);
 assert.equal(calls(f,'old-command').length,0);assert.equal(f.snapshot().charges,0);assertLeasePairs(f);
});
test('same-policy/session actual cycle retry preserves original predecessor and immutable replay identity',async()=>{
 const f=fixture();const first=await f.cycle(),frozen=f.snapshot().current;const second=await f.cycle();
 assert.equal(first.replay,false);assert.equal(second.replay,true);assert.equal(second.historicalReceipt,true);
 const packets=calls(f,'vnext_launch_ranking_command_v1').map(call=>call.args?.p_request);
 assert.deepEqual(packets[0],packets[1]);assert.equal((packets[1] as Row).expectedPreviousRankingRunId,priorRun);
 assert.deepEqual(f.snapshot().current,frozen);assert.equal(f.snapshot().charges,1);assertLeasePairs(f);
});
test('invented08:10 holder blocks actual08:15 market write entry through the same actual lease module',async()=>{
 const f=fixture(),holder=f.holdWriter();await f.started('holdStarted');
 try{
  const market=f.load('market-ai-worker.ts').runMarketInterpretation as(actor:unknown)=>Promise<Row>;
  await assert.rejects(()=>market(f.actor),/production_write_cycle_already_running/u);
  assert.equal(calls(f,'market-baseline-read').length,1); // baseline is read BEFORE the lease in actual code
  assert.equal(calls(f,'market-calendar-write').length,0);assert.equal(calls(f,'old-command').length,0);
  assert.equal(calls(f,'vnext_launch_ranking_command_v1').length,0);assert.equal(f.snapshot().charges,0);
 }finally{f.evaluate('state.hold.resolve()');await holder;}
 assertLeasePairs(f);
});
