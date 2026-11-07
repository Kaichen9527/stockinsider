import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingRead, rankingMemberCurrent } from './ranking-read.ts';
import { rankingPublishRequest, cycleRankingRequest } from './ranking-command.ts';
import { POLICY } from './policy.ts';
const run = '11111111-1111-4111-8111-111111111111', revision = '22222222-2222-4222-8222-222222222222';
function packet(size = 1) {
  return { snapshot: { schemaVersion:'vnext-ranking-snapshot-v1',rankingRunId:run,previousRankingRunId:null,cutoff:'2026-11-06T12:30:00Z',policyVersion:POLICY.version,marketRevision:'a'.repeat(64),market:{},
    members:Array.from({length:size},(_,i)=>({rank:i+1,symbol:String(1000+i),revisionId:revision,inputHash:'b'.repeat(64),confirmedPoints:0,availableWeight:100,entryEligible:false,reasons:['market_wait'],revisions:{research:revision,score:'s1',financial:'f1',price:'p1',market:'a'.repeat(64)}})) },current:{home:null,detail:null}};
}
test('transport accepts explicit Top0/1/10 and known zero; rejects >10, null and incomplete weight',()=>{
  for(const size of [0,1,10]) assert.equal(parseRankingRead(packet(size),run).snapshot!.members.length,size);
  assert.throws(()=>parseRankingRead(packet(11)),/contract_invalid/);
  for(const changes of [{confirmedPoints:null},{availableWeight:99},{rank:0},{symbol:1000}]) {
    const p=packet();Object.assign(p.snapshot.members[0],changes);assert.throws(()=>parseRankingRead(p),/contract_invalid/);
  }
});
test('requested version, research/market revisions and cutoff must match, unknown fields are never copied',()=>{
  assert.throws(()=>parseRankingRead(packet(),''),/contract_invalid/);
  assert.throws(()=>parseRankingRead(packet(),revision),/contract_invalid/);
  const p=packet();p.snapshot.members[0].revisions.research='wrong';assert.throws(()=>parseRankingRead(p),/contract_invalid/);
  const future=packet();future.snapshot.cutoff='2100-01-01T00:00:00Z';assert.throws(()=>parseRankingRead(future),/contract_invalid/);
  const source=packet();Object.assign(source.snapshot.members[0],{raw:'private'});Object.assign(source.snapshot.members[0].revisions,{raw:{secret:'private'}});
  const output=parseRankingRead(source);assert.ok(!JSON.stringify(output.snapshot).includes('private'));
  output.snapshot!.members[0].reasons.push('changed');assert.deepEqual(source.snapshot.members[0].reasons,['market_wait']);
});
test('publication request is run and CAS only, no score/qualification/clock/source inputs',()=>{
  const request={rankingRunId:run,expectedPreviousRankingRunId:null};assert.deepEqual(rankingPublishRequest(request),request);
  for(const bad of [{...request,ranks:[]},{...request,qualified:true},{rankingRunId:run},{...request,expectedPreviousRankingRunId:'wrong'}])assert.throws(()=>rankingPublishRequest(bad),/closed_request/);
});

test('current invalidity downgrades display without mutating frozen ranks',()=>{
  const snap=parseRankingRead(packet()).snapshot!;const m=snap.members[0];
  const current={members:[{symbol:m.symbol,revisionId:m.revisionId,inputHash:m.inputHash,publishedInputHash:m.inputHash,sourceRights:{current:true},entryEligible:true,deepScore:{availableWeight:100,confirmedPoints:0}}]} as unknown as Parameters<typeof rankingMemberCurrent>[1];
  assert.equal(rankingMemberCurrent(m,current),true);
  current!.members[0].deepScore!.availableWeight=99;assert.equal(rankingMemberCurrent(m,current),false);
  current!.members[0].deepScore!.availableWeight=100;current!.members[0].revisionId='other';assert.equal(rankingMemberCurrent(m,current),false);
  assert.equal(snap.members[0].rank,1);assert.equal(snap.members[0].availableWeight,100);
});

test('same-session cycle rerun preserves original request/CAS, next session advances it',()=>{
  const initial=cycleRankingRequest('2026-11-06',null);const previous=parseRankingRead(packet()).snapshot!;
  previous.rankingRunId=initial.rankingRunId;previous.previousRankingRunId=null;
  assert.deepEqual(cycleRankingRequest('2026-11-06',previous),initial);
  assert.notEqual(cycleRankingRequest('2026-11-09',previous).rankingRunId,initial.rankingRunId);
  assert.equal(cycleRankingRequest('2026-11-09',previous).expectedPreviousRankingRunId,initial.rankingRunId);
  assert.throws(()=>cycleRankingRequest('2026-02-31',null),/session_required/);
});
