/** Fixture intent only; no SQL/native/writer/source-cause acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateEpochFixturePage,candidateEpochReadBoundary,EPOCH_FIXTURE_SCHEMA,type CandidateEpochEvent,type CandidateEpochFixtureQuery} from './candidate-epoch-journal.ts';
import {POLICY} from './policy.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at=(n:number)=>`2026-11-07T06:00:00.${String(n).padStart(6,'0')}Z`;
const query:CandidateEpochFixtureQuery={symbol:null,limit:20,cursor:null};
function fixture(){
 const event=(n:number,changes:Partial<CandidateEpochEvent>):CandidateEpochEvent=>({eventId:id(n),symbol:'2330',sequence:String(n),previousEventId:n===1?null:id(n-1),epochId:null,epochStartedAt:null,
  kind:'deferred',state:null,reasonCode:'daily_budget',causePath:'core.enqueue.deferred',occurredAt:at(n),recordedAt:at(n),publicationRevisionId:null,...changes});
 const events=[event(1,{}),event(2,{kind:'admitted',state:'researching',reasonCode:'admitted',causePath:'core.enqueue.admitted',epochId:id(2),epochStartedAt:at(2)}),
  event(3,{state:'researching',reasonCode:'work_in_progress',epochId:id(2),epochStartedAt:at(2)}),
  event(4,{kind:'exited',state:'exited',reasonCode:'target_hit',causePath:'core.exit.target_hit',epochId:id(2),epochStartedAt:at(2),publicationRevisionId:id(100)}),
  event(5,{state:'exited',epochId:id(2),epochStartedAt:at(2)}),
  event(6,{kind:'admitted',state:'researching',reasonCode:'admitted',causePath:'core.enqueue.admitted',epochId:id(6),epochStartedAt:at(6)})];
 return {schemaVersion:EPOCH_FIXTURE_SCHEMA,policyVersion:POLICY.version,cutoff:at(100),activation:'disabled_not_connected',coverage:{complete:false,preActivationHistory:'unavailable'},events};
}
const page=(packet:unknown,q=query,readAt=at(100))=>candidateEpochFixturePage(packet,q,readAt);
test('bounded immutable intent events derive separate admission epochs without entry or source-cause authority',()=>{
 const packet=fixture(),original=structuredClone(packet),result=page(packet);assert.equal(result.rows.length,6);assert.equal(result.epochs.length,2);
 assert.equal(result.policyVersion,POLICY.version);
 assert.equal(result.epochs[0].admissionEventId,id(2));assert.equal(result.epochs[0].exitEventId,id(4));assert.equal(result.epochs[0].endedAt,at(4));assert.equal(result.epochs[1].exitEventId,null);
 assert.equal(result.entryAuthority,false);assert.equal(result.sourceCauseVerified,false);assert.equal(result.coverage.complete,false);assert.ok(result.gaps.includes('pre_activation_history_unavailable'));assert.deepEqual(packet,original);
 assert.equal(result.rows[0].state,null,'one request deferral never means never admitted');
});
test('stable bounded keyset is bound to exact packet, cutoff, filters and selected immutable tail',()=>{
 const packet=fixture();const first=page(packet,{...query,limit:2});assert.ok(first.nextCursor);
 const second=page(packet,{...query,limit:2,cursor:first.nextCursor});assert.deepEqual(second.rows.map(row=>row.eventId),[id(3),id(4)]);
 assert.deepEqual(page({...packet,events:[...packet.events].reverse()},{...query,limit:2,cursor:first.nextCursor}),second);
 for(const q of [{...query,limit:1,cursor:first.nextCursor},{...query,limit:2,symbol:'2330',cursor:first.nextCursor}])assert.throws(()=>page(packet,q),/epoch_fixture_invalid/);
 const changed=fixture();changed.cutoff=at(101);assert.throws(()=>page(changed,{...query,limit:2,cursor:first.nextCursor},at(101)),/epoch_fixture_invalid/);
 const forged=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString('utf8'));forged.after.eventId=id(999);assert.throws(()=>page(packet,{...query,limit:2,cursor:Buffer.from(JSON.stringify(forged)).toString('base64url')}),/epoch_fixture_invalid/);
});
test('newly appended intent cannot silently alter an existing immutable cursor view',()=>{
 const packet=fixture(),first=page(packet,{...query,limit:1});assert.ok(first.nextCursor);
 packet.events.push({...packet.events[5],eventId:id(7),sequence:'7',previousEventId:id(6),kind:'deferred',causePath:'core.enqueue.deferred',reasonCode:'work_in_progress',occurredAt:at(7),recordedAt:at(7)});
 assert.throws(()=>page(packet,{...query,limit:1,cursor:first.nextCursor}),/epoch_fixture_invalid/);
});
test('pre-activation target exit has no invented epoch or genesis; empty retained fixture proves no population history',()=>{
 const packet=fixture();packet.events=[{...packet.events[3],eventId:id(1),sequence:'1',previousEventId:null,epochId:null,epochStartedAt:null}];
 const result=page(packet);assert.deepEqual(result.epochs,[]);assert.ok(result.gaps.includes('legacy_membership_epoch_unknown'));
 assert.equal(result.rows[0].epochId,null);assert.equal(result.coverage.preActivationHistory,'unavailable');
 assert.deepEqual(page({...packet,events:[]}).rows,[]);assert.equal(page({...packet,events:[]}).coverage.complete,false);
});
test('epoch resurrection, active readmission, cross-symbol links and missing immutable predecessors reject',()=>{
 const mutations:Array<(packet:ReturnType<typeof fixture>)=>void>=[
  packet=>{packet.events[5].epochId=id(2);packet.events[5].epochStartedAt=at(2);},
  packet=>{packet.events=packet.events.slice(0,3);packet.events[2]={...packet.events[1],eventId:id(3),sequence:'3',previousEventId:id(2),epochId:id(3),epochStartedAt:at(3),occurredAt:at(3),recordedAt:at(3)};},
  packet=>{packet.events[2].symbol='2317';},packet=>{packet.events[2].previousEventId=id(99);},
  packet=>{packet.events.splice(2,1);},packet=>{packet.events[4].state=null;},
  packet=>{packet.events[1].epochStartedAt=at(3);},
  packet=>{packet.events[4]={...packet.events[3],eventId:id(5),sequence:'5',previousEventId:id(4),occurredAt:at(5),recordedAt:at(5)};},
 ];
 for(const mutate of mutations){const packet=fixture();mutate(packet);assert.throws(()=>page(packet),/epoch_fixture_invalid/);}
});
test('exact microsecond clocks reject future cutoffs and inversions while equivalent explicit offsets remain valid',()=>{
 const valid=fixture();valid.events[2].occurredAt='2026-11-07T14:00:00.000003+08:00';assert.equal(page(valid).rows.length,6);
 for(const mutate of [
  (p:ReturnType<typeof fixture>)=>{p.events[2].occurredAt=at(1);},
  (p:ReturnType<typeof fixture>)=>{p.events[2].recordedAt=at(101);},
  (p:ReturnType<typeof fixture>)=>{p.events[1].recordedAt=at(1);},
  (p:ReturnType<typeof fixture>)=>{p.cutoff=at(101);},
  (p:ReturnType<typeof fixture>)=>{p.events[0].occurredAt='2026-02-30T06:00:00Z';},
 ]){const packet=fixture();mutate(packet);assert.throws(()=>page(packet),/epoch_fixture_invalid/);}
});
test('only the three prospective cause paths and exact public reason inventory are supported',()=>{
 for(const mutate of [
  (p:ReturnType<typeof fixture>)=>{Reflect.deleteProperty(p.events[0],'causePath');},
  (p:ReturnType<typeof fixture>)=>{Object.assign(p.events[2],{kind:'state_changed',causePath:'core.claim.started',reasonCode:'research_started'});},
  (p:ReturnType<typeof fixture>)=>{p.events[3].reasonCode='private freeform exit details';},
  (p:ReturnType<typeof fixture>)=>{p.events[0].reasonCode='unknown';},
  (p:ReturnType<typeof fixture>)=>{Object.assign(p.events[0],{reasonCode:null});},
  (p:ReturnType<typeof fixture>)=>{p.events[3].publicationRevisionId=null;},
 ]){const packet=fixture();mutate(packet);assert.throws(()=>page(packet),/epoch_fixture_invalid/);}
});
test('privacy, wrong versions and forged coverage fail closed instead of entering the public allowlist',()=>{
 for(const extra of ['actorPrincipal','causeId','inputHash','proofHash','bodyDigest','rawRights','exitReason']){
  const packet=fixture();Object.assign(packet.events[0],{[extra]:'private fixture sentinel'});assert.throws(()=>page(packet),/epoch_fixture_invalid/);
 }
 for(const extra of [{schemaVersion:'vnext-ranking-snapshot-v1'},{activation:'enabled'},{sourceCauseVerified:true},{coverage:{complete:true,preActivationHistory:'unavailable'}},{coverage:{complete:false,preActivationHistory:'complete'}}])assert.throws(()=>page({...fixture(),...extra}),/epoch_fixture_invalid/);
 assert.equal(JSON.stringify(page(fixture())).includes('actorPrincipal'),false);
});
test('duplicate IDs/sequences, unsupported suffixes, oversized populations and invalid page shapes reject',()=>{
 const packet=fixture();for(const events of [[...packet.events,packet.events[0]],packet.events.slice(1),Array.from({length:201},()=>packet.events[0]),[{...packet.events[0],sequence:'9223372036854775808'}]])assert.throws(()=>page({...packet,events}),/epoch_fixture_invalid/);
 for(const q of [{...query,limit:0},{...query,limit:21},{...query,symbol:'private'},{...query,adapter:()=>{throw Error('must not run');}}])assert.throws(()=>page(packet,q),/epoch_fixture_invalid/);
});
test('runtime read facade stays disabled and rejects every caller-created activation or adapter',()=>{
 assert.deepEqual(candidateEpochReadBoundary(),{state:'Disabled',activation:'disabled_not_connected',readable:false,entryAuthority:false,sourceCauseVerified:false});
 let calls=0;for(const value of [true,{enabled:true},{adapter:()=>{calls++;}},{verified:true},{metadata:{activation:'enabled'}}])assert.throws(()=>candidateEpochReadBoundary(value),/runtime_overrides_forbidden/);
 assert.equal(calls,0);
});
