import assert from 'node:assert/strict';
import test from 'node:test';
import {launchRankingPublishRequest,publishLaunchRanking,cycleLaunchRankingRequest,parseLaunchCycleAdmission,parseLaunchRankingWriteReceipt} from './launch-ranking-command.ts';
import {LAUNCH_RANKING_POLICY,LAUNCH_RANKING_RULES,LAUNCH_RANKING_ARITHMETIC} from './launch-ranking-read.ts';
import {launchRankingFixture} from './launch-ranking.test-fixture.ts';
import type {LaunchRankingSnapshot} from './launch-ranking-read.ts';
const run='00000000-0000-4000-8000-000000000001';
test('new writer accepts only closed run/CAS identity and rejects source/points/qualification bodies before configuration or IO',async()=>{
  assert.deepEqual(launchRankingPublishRequest({rankingRunId:run,expectedPreviousRankingRunId:null}),{rankingRunId:run,expectedPreviousRankingRunId:null});
  for(const extra of ['points','score','source','proof','qualified','cutoff','session','policyVersion'])
    await assert.rejects(()=>publishLaunchRanking({principal:'SYNTHETIC_OPERATOR',role:'operator'},{rankingRunId:run,expectedPreviousRankingRunId:null,[extra]:true}),/closed_request/u);
  for(const value of ['00000000-0000-0000-0000-000000000000','not-a-uuid',null])
    assert.throws(()=>launchRankingPublishRequest({rankingRunId:value,expectedPreviousRankingRunId:null}),/closed_request/u);
  let hooks=0;const accessor={expectedPreviousRankingRunId:null,get rankingRunId(){hooks++;return run;}};
  const proxy=new Proxy({rankingRunId:run,expectedPreviousRankingRunId:null},{get(){hooks++;throw Error('unexpected hook');}});
  assert.throws(()=>launchRankingPublishRequest(accessor),/closed_request/u);assert.throws(()=>launchRankingPublishRequest(proxy),/closed_request/u);assert.equal(hooks,0);
});
test('launch cycle identity is stable per policy/session and historical replay preserves the actual predecessor',()=>{
  const initial=cycleLaunchRankingRequest('2026-11-13',null),snapshot=launchRankingFixture().snapshot as unknown as LaunchRankingSnapshot;
  snapshot.rankingRunId=initial.rankingRunId;snapshot.previousRankingRunId=run;
  assert.deepEqual(cycleLaunchRankingRequest('2026-11-13',snapshot,snapshot),{rankingRunId:initial.rankingRunId,expectedPreviousRankingRunId:run});
  assert.notEqual(cycleLaunchRankingRequest('2026-11-12',null).rankingRunId,initial.rankingRunId);
  assert.throws(()=>cycleLaunchRankingRequest('2026-02-30',null),/session_required/u);
  assert.throws(()=>cycleLaunchRankingRequest('2026-11-13',null,{...snapshot,rankingRunId:run}),/existing_run_mismatch/u);
});
test('cycle admission accepts only the exact fixed21:30 input instant and session; local later clocks cannot widen it',()=>{
  const packet={ready:true,reason:null,session:'2026-11-13',cutoff:'2026-11-13T13:30:00Z',policyVersion:'stockinsider-launch-radar-v1'};
  assert.equal(parseLaunchCycleAdmission(packet).ready,true);
  assert.equal(parseLaunchCycleAdmission({...packet,cutoff:'2026-11-13T21:30:00+08:00'}).ready,true);
  for(const cutoff of ['2026-11-13T12:30:00Z','2026-11-13T13:30:00.000001Z','2026-11-13T14:30:00Z','2026-11-12T13:30:00Z'])
    assert.throws(()=>parseLaunchCycleAdmission({...packet,cutoff}),/cycle_context_unavailable/u);
  assert.throws(()=>parseLaunchCycleAdmission({...packet,session:'2026-02-30'}),/cycle_context_unavailable/u);
});
test('write receipts bind successful publication to the requested run and preserve distinct historical replay/retention states',()=>{
  const request=launchRankingPublishRequest({rankingRunId:run,expectedPreviousRankingRunId:null});
  const receipt={schemaVersion:'vnext-launch-ranking-write-v2',policyVersion:LAUNCH_RANKING_POLICY,rulesVersion:LAUNCH_RANKING_RULES,arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,
    published:true,retained:false,reason:null,rankingRunId:run,requestRunId:run,replay:false,historicalReceipt:false};
  assert.equal(parseLaunchRankingWriteReceipt(receipt,request).published,true);
  assert.equal(parseLaunchRankingWriteReceipt({...receipt,replay:true,historicalReceipt:true},request).historicalReceipt,true);
  assert.equal(parseLaunchRankingWriteReceipt({...receipt,published:false,retained:true,reason:'source_facts_missing',rankingRunId:null},request).published,false);
  for(const change of [{schemaVersion:'vnext-launch-ranking-write-v1'},{arithmeticVersion:'decimal-numeric-v1'},{retained:true},{rankingRunId:null},{rankingRunId:'00000000-0000-4000-8000-000000000002'},
    {requestRunId:'00000000-0000-4000-8000-000000000002'},{replay:true},{historicalReceipt:true},
    {published:false,retained:false},{published:false,retained:true},{published:false,retained:true,reason:'missing',replay:true,historicalReceipt:true}])
    assert.throws(()=>parseLaunchRankingWriteReceipt({...receipt,...change},request),/publication_uncertain/u);
});
