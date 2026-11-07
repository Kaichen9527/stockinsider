import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingRead, rankingMemberCurrent } from './ranking-read.ts';
import { rankingPublishRequest, cycleRankingRequest } from './ranking-command.ts';
import { publicHome, publicationQualificationCurrent } from './public-contract.ts';
import { REQUIRED_SECTIONS } from './research.ts';
import { POLICY, inputHash } from './policy.ts';
const run = '11111111-1111-4111-8111-111111111111', revision = '22222222-2222-4222-8222-222222222222';
function packet(size = 1) {
  return { snapshot: { schemaVersion:'vnext-ranking-snapshot-v1',rankingRunId:run,previousRankingRunId:null,cutoff:'2026-11-06T12:30:00Z',policyVersion:POLICY.version,marketRevision:'a'.repeat(64),market:{},
    members:Array.from({length:size},(_,i)=>({rank:i+1,symbol:String(1000+i),revisionId:revision,inputHash:'b'.repeat(64),confirmedPoints:0,availableWeight:100,entryEligible:false,reasons:['market_wait'],revisions:{research:revision,score:'s1',financial:'f1',price:'p1',market:'a'.repeat(64)}})) },current:{home:null,detail:null}};
}
const readAt = '2026-11-06T12:30:00.000Z';
/** Synthetic transport-only positive. This is not a producer or review receipt. */
function currentPacket() {
  const p = packet(); const m = p.snapshot.members[0];
  const claims = [80,140,180,100].map((value,i)=>({id:i===1?'valuation:normalized_pe':`synthetic-${i}`,kind:i===3?'fact':'assumption',text:'Synthetic read-boundary fixture only.',evidenceIds:[`synthetic-${i}`],numeric:{key:['valuation_bear','valuation_base','valuation_bull','current_price'][i],value,unit:'TWD_per_share',period:'2026-11-06'}}));
  const content = {schemaVersion:'stockinsider-vnext-research-v1',inputHash:m.inputHash,outputHash:'',modelVersion:'synthetic',quoteDate:'2026-11-06',valuationDate:'2026-11-06',claims,sections:Object.fromEntries(REQUIRED_SECTIONS.map(key=>[key,{text:'Synthetic only.',evidenceIds:['synthetic-0']}]))};
  content.outputHash=inputHash({...content,outputHash:undefined});
  const fields={schemaVersion:'stockinsider-vnext-authority-proof-v1',qualified:true,inputHash:m.inputHash,checkedAt:readAt,expiresAt:'2026-11-06T12:32:00.000Z',financialCoverage:{status:'complete'},priceBasis:{status:'verified'},valuation:{usable:true,gaps:[],claimIds:claims.map(c=>c.id),valuation:{current:100,bear:80,base:140,bull:180,method:'normalized_pe',quoteAt:'2026-11-06',valuationAt:'2026-11-06',provenance:['https://example.org/synthetic']},remainingUpside:0.4,downside:0.2,rewardRisk:2}};
  const member={symbol:m.symbol,state:'eligible',revisionId:m.revisionId,inputHash:m.inputHash,publishedInputHash:m.inputHash,sourceRights:{current:true,reason:null},content,qualification:{...fields,proofHash:inputHash(fields)},deepScore:{availableWeight:100,confirmedPoints:0}};
  const home={version:'synthetic-read',publishedAt:readAt,market:{risk:'risk_on',confidence:'complete',session:'2026-11-06',sourceAt:'2026-11-06T06:00:00Z',expiresAt:'2026-11-07T06:00:00Z',continuity:true,provenance:['https://www.twse.com.tw/synthetic'],gaps:[],overseas:[],sessions:[{id:'2026-11-06',closeAt:'2026-11-06T05:30:00Z',completed:true}]},members:[member]};
  return {...p,current:{home,detail:{symbol:m.symbol,membership:{state:'eligible',contraindication:false,inputHash:m.inputHash},history:[member]}}};
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

test('current proof is rechecked at each read cutoff while frozen ranks and old content remain unchanged',()=>{
  const p=currentPacket(), before=JSON.stringify(p), read=parseRankingRead(p,run,readAt), m=read.snapshot!.members[0];
  assert.equal(read.readAt,readAt);assert.equal(read.currentHome!.members[0].entryEligible,true);
  assert.equal(rankingMemberCurrent(m,read.currentHome,read.readAt),true);
  assert.equal(publicationQualificationCurrent((read.detail as typeof p.current.detail).history[0],read.readAt),true);
  assert.equal(rankingMemberCurrent(m,read.currentHome,'2026-11-06T12:31:59.999Z'),true);
  // A cached true entry flag never extends the original proof interval.
  for(const now of ['2026-11-06T12:32:00.000Z','2026-11-06T12:32:00.001Z','2026-11-06T12:29:59.999Z','invalid']) {
    assert.equal(rankingMemberCurrent(m,read.currentHome,now),false);
    assert.equal(publicationQualificationCurrent((read.detail as typeof p.current.detail).history[0],now),false);
  }
  const expired=parseRankingRead(p,run,'2026-11-06T12:32:00.000Z');
  assert.equal(expired.currentHome!.members[0].entryEligible,false);
  assert.deepEqual(expired.snapshot,read.snapshot);assert.deepEqual(expired.detail,read.detail);assert.equal(JSON.stringify(p),before);
});
test('proof schema, TTL, exact hash, current rights and revision/input bindings all fail closed',()=>{
  const mutations:Array<(value:ReturnType<typeof currentPacket>)=>void>=[
    p=>{p.current.home.members[0].qualification.schemaVersion='unknown';},
    p=>{p.current.home.members[0].qualification.checkedAt='2026-11-06T12:30:00.001Z';},
    p=>{p.current.home.members[0].qualification.expiresAt=readAt;},
    p=>{p.current.home.members[0].qualification.expiresAt='2026-11-06T12:32:00.001Z';},
    p=>{p.current.home.members[0].qualification.proofHash='c'.repeat(64);},
    p=>{p.current.home.members[0].qualification.inputHash='c'.repeat(64);},
    p=>{p.current.home.members[0].qualification.financialCoverage.status='missing';},
    p=>{p.current.home.members[0].qualification.priceBasis.status='unverified';},
    p=>{p.current.home.members[0].qualification.valuation.remainingUpside=999;},
    p=>{p.current.home.members[0].revisionId=run;},
    p=>{p.current.home.members[0].inputHash='c'.repeat(64);},
    p=>{p.current.home.members[0].publishedInputHash='c'.repeat(64);},
    p=>{p.current.home.members[0].sourceRights.current=false;},
    p=>{p.current.home.members[0].deepScore.availableWeight=99;},
  ];
  for(const mutate of mutations){
    const p=currentPacket();mutate(p);const live=p.current.home.members[0];
    if(live.qualification.proofHash!=='c'.repeat(64)){const {proofHash,...bound}=live.qualification;void proofHash;live.qualification.proofHash=inputHash(bound);}
    // Deliberately forge only a previously computed flag. It cannot grant proof authority.
    const current={...publicHome(p.current.home,readAt)!,members:[{...live,entryEligible:true}]} as unknown as Parameters<typeof rankingMemberCurrent>[1];
    assert.equal(rankingMemberCurrent(parseRankingRead(p,run,readAt).snapshot!.members[0],current,readAt),false);
  }
  for(const missing of [null,undefined,{},true])assert.equal(publicationQualificationCurrent(missing,readAt),false);
  const p=currentPacket();Object.assign(p.current.home.members[0],{qualification:null});
  assert.equal(parseRankingRead(p,run,readAt).currentHome!.members[0].entryEligible,false);
});
test('pure public read revalidation starts no network or background work and preserves missing authority',()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('unexpected external IO');};
  try{
    const p=currentPacket(), read=parseRankingRead(p,run,readAt);
    assert.equal(rankingMemberCurrent(read.snapshot!.members[0],read.currentHome,readAt),true);
    assert.equal(rankingMemberCurrent(read.snapshot!.members[0],null,readAt),false);
    assert.equal(parseRankingRead({...p,snapshot:null},undefined,readAt).readAt,readAt);
    assert.equal(calls,0);
  }finally{globalThis.fetch=previous;}
});

test('same-session cycle rerun preserves original request/CAS, next session advances it',()=>{
  const initial=cycleRankingRequest('2026-11-06',null);const previous=parseRankingRead(packet()).snapshot!;
  previous.rankingRunId=initial.rankingRunId;previous.previousRankingRunId=null;
  assert.deepEqual(cycleRankingRequest('2026-11-06',previous),initial);
  const successor={...previous,rankingRunId:revision,previousRankingRunId:initial.rankingRunId};
  assert.deepEqual(cycleRankingRequest('2026-11-06',successor,previous),initial);
  assert.throws(()=>cycleRankingRequest('2026-11-06',null,successor),/existing_run_mismatch/);
  assert.notEqual(cycleRankingRequest('2026-11-09',previous).rankingRunId,initial.rankingRunId);
  assert.equal(cycleRankingRequest('2026-11-09',previous).expectedPreviousRankingRunId,initial.rankingRunId);
  assert.throws(()=>cycleRankingRequest('2026-02-31',null),/session_required/);
});
