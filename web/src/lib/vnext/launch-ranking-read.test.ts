import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLaunchRankingRead,readLaunchRankingTransport,launchRankingMemberCurrent,launchDetailQuery} from './launch-ranking-read.ts';
import {launchRankingFixture,LAUNCH_TEST_NOW,LAUNCH_TEST_RUN} from './launch-ranking.test-fixture.ts';

test('new launch read acceptsTop0/1/10 and nullablefinancials under its own exact policy, neverlegacy or partial80',()=>{
  for(const size of [0,1,10]){const packet=launchRankingFixture(size),read=parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW);assert.equal(read.snapshot!.members.length,size);if(size)assert.equal(read.snapshot!.members[0].financial,null);}
  assert.throws(()=>parseLaunchRankingRead(launchRankingFixture(11),{},LAUNCH_TEST_NOW),/contract_invalid/u);
  for(const mutation of [(p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot,{policyVersion:'stockinsider-vnext-20-v1'});},
    (p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot,{rulesVersion:'launch-radar-comparisons-v4'});},
    (p:ReturnType<typeof launchRankingFixture>)=>{p.snapshot.members[0].availableWeight=80;},
    (p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot.members[0],{totalScore:null});},
    (p:ReturnType<typeof launchRankingFixture>)=>{p.snapshot.members[0].revisions.institutionalVolume='';}]){
    const packet=launchRankingFixture();mutation(packet);assert.throws(()=>parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),/contract_invalid/u);
  }
});
test('score totals,technicaltie/RS63/symbol order and21:30 session context are checked without changing frozenversions',()=>{
  const packet=launchRankingFixture(2),before=structuredClone(packet);assert.deepEqual(parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW).snapshot!.members.map(m=>m.symbol),['5274','5275']);assert.deepEqual(packet,before);
  for(const mode of ['technical','total','fraction','rsorder','symbolorder','inputcutoff','time','revision'] as const){
    const p=launchRankingFixture(2);
    if(mode==='technical')p.snapshot.members[0].technicalScore=65;
    if(mode==='total')p.snapshot.members[0].totalScore=95;
    if(mode==='fraction')p.snapshot.members[0].components.chips=19.5;
    if(mode==='rsorder')p.snapshot.members[1].relativeStrength63=1;
    if(mode==='symbolorder'){p.snapshot.members.reverse();p.snapshot.members.forEach((m,i)=>{m.rank=i+1;});}
    if(mode==='inputcutoff')p.snapshot.inputCutoff='2026-11-13T13:29:00Z';
    if(mode==='time'){p.snapshot.cutoff='2026-11-13T13:29:59Z';p.snapshot.inputCutoff=p.snapshot.cutoff;}
    if(mode==='revision')p.snapshot.members[0].revisions.score='wrong-source-version';
    assert.throws(()=>parseLaunchRankingRead(p,{},LAUNCH_TEST_NOW),/contract_invalid/u,mode);
  }
  const zero=launchRankingFixture();Object.assign(zero.snapshot.members[0],{totalScore:0,technicalScore:0,components:{trendRelativeStrength:0,consolidation:0,breakoutHold:0,chips:0,market:0}});
  assert.equal(parseLaunchRankingRead(zero,{},LAUNCH_TEST_NOW).snapshot!.members[0].totalScore,0);
});
test('fixedslot cutoff is microexact21:30Taipei; equivalentZ/offset pass and publication mayoccur later',()=>{
  const now='2026-11-13T16:00:00Z';
  for(const cutoff of ['2026-11-13T13:30:00Z','2026-11-13T21:30:00+08:00']){
    const p=launchRankingFixture();Object.assign(p.snapshot,{cutoff,inputCutoff:cutoff,publishedAt:'2026-11-13T13:31:00Z'});
    assert.equal(parseLaunchRankingRead(p,{},now).snapshot!.cutoff,cutoff);
  }
  for(const cutoff of ['2026-11-13T13:29:59Z','2026-11-13T13:30:00.000001Z','2026-11-13T14:30:00Z']){
    const p=launchRankingFixture();Object.assign(p.snapshot,{cutoff,inputCutoff:cutoff,publishedAt:cutoff});
    assert.throws(()=>parseLaunchRankingRead(p,{},now),/contract_invalid/u,cutoff);
  }
});
test('current rights/review/venue/liquidity/source/fullweight and exactsourcebindings/120s neverrenew historicalentry flags',()=>{
  const packet=launchRankingFixture(),read=parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),m=read.snapshot!.members[0],before=structuredClone(read.snapshot);
  assert.equal(launchRankingMemberCurrent(m,read.current,LAUNCH_TEST_NOW),true);
  for(const key of ['rights','review','venue','liquidity','price','actions','source','completeWeight'] as const){const changed=structuredClone(read.current);changed[0].checks[key]=false;assert.equal(launchRankingMemberCurrent(m,changed,LAUNCH_TEST_NOW),false,key);}
  for(const mode of ['expired','future','longttl','mixedsource','wrongresearch','missing'] as const){
    const changed=structuredClone(read.current);
    if(mode==='expired')changed[0].expiresAt=LAUNCH_TEST_NOW;
    if(mode==='future')changed[0].checkedAt='2026-11-13T13:30:31Z';
    if(mode==='longttl')changed[0].expiresAt='2026-11-13T13:33:00Z';
    if(mode==='mixedsource')changed[0].revisions.flow='changed';
    if(mode==='wrongresearch')changed[0].revisionId='00000000-0000-4000-8000-000000000999';
    if(mode==='missing')changed.length=0;
    assert.equal(launchRankingMemberCurrent(m,changed,LAUNCH_TEST_NOW),false,mode);
  }
  assert.deepEqual(read.snapshot,before);assert.equal(launchRankingMemberCurrent(m,read.current,'2026-11-13T13:32:00Z'),false);
});
test('detail is exactrun/research/score16closedrules, including booleanhold and ISOendpoint, with safepubliccitations only',()=>{
  const packet=launchRankingFixture(1,true),q={rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'},read=parseLaunchRankingRead(packet,q,LAUNCH_TEST_NOW);
  assert.equal(read.detail!.scoreEvidence.length,16);assert.equal(read.detail!.scoreEvidence[9].operands.breakout,true);assert.equal(read.detail!.scoreEvidence[9].operands.closingHold,null);
  assert.equal(typeof read.detail!.scoreEvidence[2].operands.priorEndpoint,'string');assert.equal(read.detail!.chart,null);
  for(const mode of ['run','research','score','rule','weight','group','operand','unknown_operand','false_comparison','rs','url','private','chart'] as const){
    const p=launchRankingFixture(1,true),d=p.detail!;
    if(mode==='run')d.rankingRunId='00000000-0000-4000-8000-000000000999';
    if(mode==='research')d.revisionId='00000000-0000-4000-8000-000000000999';
    if(mode==='score')d.scoreRevision='00000000-0000-4000-8000-000000000999';
    if(mode==='rule')Object.assign(d.scoreEvidence[0],{id:'unapproved'});
    if(mode==='weight')Object.assign(d.scoreEvidence[0],{weight:6});
    if(mode==='group')Object.assign(d.scoreEvidence[0],{group:'chips'});
    if(mode==='operand')Object.assign(d.scoreEvidence[0].operands,{privateText:'never-expose'});
    if(mode==='unknown_operand')Object.assign(d.scoreEvidence[0].operands,{close:null});
    if(mode==='false_comparison')Object.assign(d.scoreEvidence[0].operands,{close:90});
    if(mode==='rs')Object.assign(d.scoreEvidence[4].operands,{excessReturn:1});
    if(mode==='url')d.citations[0].url='https://user:secret@www.tpex.org.tw/';
    if(mode==='private')Object.assign(d,{rawOriginal:'PRIVATE_MARKER'});
    if(mode==='chart')Object.assign(d,{chart:{rows:932,priceBasis:'raw'}});
    assert.throws(()=>parseLaunchRankingRead(p,q,LAUNCH_TEST_NOW),/contract_invalid/u,mode);
  }
});
test('onefixed newRPC preserves explicitmissing/versionerrors and sourceunavailability without legacyfetch or backgroundwork',async()=>{
  const calls:unknown[]=[];const client={rpc(name:string,args:unknown){calls.push({name,args});return Promise.resolve({data:launchRankingFixture(),error:null});}};
  const oldFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw Error('unexpected read IO');};
  try{
    assert.equal((await readLaunchRankingTransport(client,{rankingRunId:LAUNCH_TEST_RUN},LAUNCH_TEST_NOW)).availability,'ready');
    assert.deepEqual(calls,[{name:'vnext_launch_ranking_read_v1',args:{p_ranking_run_id:LAUNCH_TEST_RUN,p_symbol:null}}]);
    for(const code of ['42883','PGRST202'])assert.equal((await readLaunchRankingTransport({rpc:async()=>({data:null,error:{code}})}, {},LAUNCH_TEST_NOW)).availability,'schema_unavailable');
    const missing={schemaVersion:'vnext-launch-ranking-read-v2',arithmeticVersion:'binary64-v1',availability:'not_found',reason:'specified_run_not_found',snapshot:null,current:{schemaVersion:'vnext-launch-current-validity-v2',arithmeticVersion:'binary64-v1',members:[]},detail:null};
    assert.equal((await readLaunchRankingTransport({rpc:async()=>({data:missing,error:null})},{rankingRunId:LAUNCH_TEST_RUN},LAUNCH_TEST_NOW)).availability,'not_found');
    await assert.rejects(readLaunchRankingTransport(client,{rankingRunId:'00000000-0000-4000-8000-000000000999'},LAUNCH_TEST_NOW),/contract_invalid/u);
    assert.equal(fetches,0);
  }finally{globalThis.fetch=oldFetch;}
});
test('explicitlaunch detail selection rejects arrays,partialtuples andmixedlegacy selectors before anylatestread',()=>{
  const q={launchRunId:LAUNCH_TEST_RUN,launchResearchRevision:'00000000-0000-4000-8000-000000000010',launchScoreRevision:'00000000-0000-4000-8000-000000000100'};
  assert.equal(launchDetailQuery(q).status,'bound');assert.equal(launchDetailQuery({}).status,'latest');
  for(const bad of [{...q,launchRunId:[LAUNCH_TEST_RUN]}, {launchRunId:LAUNCH_TEST_RUN}, {...q,rankingRunId:LAUNCH_TEST_RUN},{...q,vnextRevision:q.launchResearchRevision}])assert.equal(launchDetailQuery(bad).status,'invalid');
});
test('nonplain/proxy/accessor RPC objects refuse without runninghooks or leakingraw/privatefields',()=>{
  const packet=launchRankingFixture();let hooks=0;
  assert.throws(()=>parseLaunchRankingRead(new Proxy(packet,{get(){hooks++;throw Error('hook');}}),{},LAUNCH_TEST_NOW),/contract_invalid/u);
  Object.defineProperty(packet.snapshot.members[0],'totalScore',{get(){hooks++;return 100;},enumerable:true});
  assert.throws(()=>parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),/contract_invalid/u);assert.equal(hooks,0);
});
