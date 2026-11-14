import assert from 'node:assert/strict';
import test from 'node:test';
import {LAUNCH_CANDIDATE_FIXTURE,launchCandidateQuery,launchCandidateFixturePage,readLaunchCandidateCatalog} from './launch-candidate-catalog.ts';
import {EPOCH_FIXTURE_SCHEMA,type CandidateEpochEvent} from './candidate-epoch-journal.ts';
import {POLICY} from './policy.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cutoff='2026-11-14T13:30:00Z',readAt='2026-11-14T13:31:00Z';
function fixture(){
 const clues=Array.from({length:21},(_,i)=>({id:id(100+i),symbol:String(2300+i),eventAt:`2026-11-${i===20?'12':'13'}T01:00:${String(30-i).padStart(2,'0')}Z`,availableAt:'2026-11-13T02:00:00Z',source:i%2?'synthetic_b':'synthetic_a',
  industrySnapshot:{revisionId:id(500+i),code:i%2?'synthetic_industry_b':'synthetic_industry_a',label:'Synthetic industry, not current taxonomy',knownAt:'2026-11-13T02:00:00Z'},
  publication:{kind:'synthetic_public_metadata_fixture',bindingId:id(700+i)}}));
 const events:CandidateEpochEvent[]=clues.slice(0,20).map((c,i)=>({eventId:id(i+1),symbol:c.symbol,sequence:'1',previousEventId:null,epochId:id(i+1),epochStartedAt:'2026-11-13T03:00:00Z',kind:'admitted',state:'researching',reasonCode:'admitted',causePath:'core.enqueue.admitted',occurredAt:'2026-11-13T03:00:00Z',recordedAt:'2026-11-13T03:00:00Z',publicationRevisionId:null}));
 return {schemaVersion:LAUNCH_CANDIDATE_FIXTURE,scope:'synthetic_only',catalogId:id(900),cutoff,
  coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},clues,
  membership:{schemaVersion:EPOCH_FIXTURE_SCHEMA,policyVersion:POLICY.version,cutoff,coverage:{complete:false,preActivationHistory:'unavailable'},activation:'disabled_not_connected',events}};
}
const query=(s='')=>launchCandidateQuery(new URLSearchParams(s));
const rights=(withdrawnClueIds:string[]=[])=>({catalogId:id(900),checkedAt:readAt,withdrawnClueIds});
const page=(packet:unknown,q=query(),current=rights())=>launchCandidateFixturePage(packet,q,current,readAt);
test('synthetic21 actualsource-mention clues remainvisible beyond20 recordedactive epochs; absence isunknown, never never-admitted',()=>{
 const p=fixture(),before=structuredClone(p),first=page(p,query('limit=20'));assert.equal(first.rows.length,20);assert.ok(first.nextCursor);
 assert.equal(first.rows.filter(row=>'admission' in row&&row.admission.kind==='ever_observed_admitted').length,20);
 const last=page(p,query(`limit=20&cursor=${first.nextCursor}`));assert.equal(last.rows.length,1);
 const row=last.rows[0];assert.ok('admission' in row);assert.equal(row.admission.kind,'admission_history_unknown');assert.equal(row.admission.recordedEpochId,null);
 assert.equal(row.symbol,'2320');assert.equal(last.sourceAuthority,false);assert.equal(last.publicationAuthority,false);assert.equal(last.coverage.membershipComplete,false);
 assert.equal(last.scope,'synthetic_projection_only');assert.deepEqual(p,before);assert.ok(!JSON.stringify(last).includes('never_admitted'));
});
test('historyfilters use pinned originalmentiondate/source/industryrevision and recorded membership intent only',()=>{
 const p=fixture();assert.equal(page(p,query('date=2026-11-12')).rows.length,1);assert.equal(page(p,query('status=admission_history_unknown')).rows.length,1);
 assert.equal(page(p,query('source=synthetic_b&industry=synthetic_industry_b&limit=20')).rows.length,10);
 const rows=page(p,query('status=recorded_active_epoch&limit=20')).rows;assert.equal(rows.length,20);assert.ok(rows.every(row=>'industrySnapshot' in row&&row.industrySnapshot?.knownAt==='2026-11-13T02:00:00Z'));
 assert.throws(()=>query('status=never_admitted'),/projection_invalid/u);
 assert.deepEqual(query('date=&source=&industry=&status=').filters,{date:null,source:null,industry:null,status:null});
});
test('opaque cursor pins originalcatalog acrossnewclue/industrysnapshot changes and containsno source-sortmetadata',()=>{
 const p=fixture(),first=page(p,query('limit=10'));assert.ok(first.nextCursor);
 const cursor=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString());assert.deepEqual(Object.keys(cursor).sort(),['after','catalogHash','catalogId','cutoff','filtersHash','version']);assert.equal(cursor.after,10);
 for(const privateValue of ['2309','synthetic_a','2026-11-13T01:00'])assert.ok(!JSON.stringify(cursor).includes(privateValue));
 const second=page(p,query(`limit=10&cursor=${first.nextCursor}`));assert.equal(second.rows[0].position,11);
 const changed=fixture();changed.clues.push({...changed.clues[0],id:id(999),symbol:'9999'});assert.throws(()=>page(changed,query(`limit=10&cursor=${first.nextCursor}`)),/projection_invalid/u);
 const taxonomy=fixture();taxonomy.clues[0].industrySnapshot.label='Changed current taxonomy';assert.throws(()=>page(taxonomy,query(`limit=10&cursor=${first.nextCursor}`)),/projection_invalid/u);
 const available=fixture();available.clues[0].availableAt='2026-11-13T02:01:00Z';assert.throws(()=>page(available,query(`limit=10&cursor=${first.nextCursor}`)),/projection_invalid/u);
 const binding=fixture();binding.clues[0].publication.bindingId=id(9999);assert.throws(()=>page(binding,query(`limit=10&cursor=${first.nextCursor}`)),/projection_invalid/u);
 const lineage=fixture();lineage.membership.events.push({...lineage.membership.events[0],eventId:id(9998),sequence:'2',previousEventId:id(1),kind:'deferred',causePath:'core.enqueue.deferred',reasonCode:'work_in_progress',occurredAt:'2026-11-13T03:01:00Z',recordedAt:'2026-11-13T03:01:00Z'});
 assert.throws(()=>page(lineage,query(`limit=10&cursor=${first.nextCursor}`)),/projection_invalid/u);
 assert.deepEqual(page(p,query(`limit=10&cursor=${first.nextCursor}`)),second);
 for(const invalid of [`limit=9&cursor=${first.nextCursor}`,`limit=10&source=synthetic_a&cursor=${first.nextCursor}`,`catalogId=${id(901)}`])assert.throws(()=>page(p,query(invalid)),/projection_invalid/u);
});
test('withdrawal preserves onlyposition/state andneverdrops/refills; ANYwithdrawal suppressesALLfiltered queries withoutoracle',()=>{
 const p=fixture(),first=page(p,query('limit=10')),withdrawn=rights([p.clues[9].id,p.clues[10].id]);assert.ok(first.nextCursor);
 const redactedFirst=page(p,query('limit=10'),withdrawn);assert.deepEqual(redactedFirst.rows[9],{position:10,state:'redacted'});assert.equal(redactedFirst.nextCursor,first.nextCursor);
 const second=page(p,query(`limit=10&cursor=${first.nextCursor}`),withdrawn);assert.deepEqual(second.rows[0],{position:11,state:'redacted'});assert.equal(second.rows.length,10);
 for(const filter of ['source=synthetic_a','source=does_not_match','industry=does_not_match','date=2020-01-01','status=admission_history_unknown']){
  const result=page(p,query(filter),withdrawn);assert.equal(result.availability,'filtered_projection_unavailable');assert.deepEqual(result.rows,[]);assert.equal(result.nextCursor,null);
 }
});
test('private/unknown scope is excluded BEFOREmaterialization; fixturebinding isnot a runtimepublicmetadata grant',()=>{
 const p=fixture();Object.assign(p.clues[0],{publication:null});const first=page(p,query('limit=20'));assert.equal(first.rows.length,20);
 assert.ok(first.rows.every(row=>!('symbol' in row)||row.symbol!=='2300'));
 assert.throws(()=>page(p,query(),rights([p.clues[0].id])),/projection_invalid/u);
 assert.equal(readLaunchCandidateCatalog(query()).availability,'producer_unavailable');assert.equal(readLaunchCandidateCatalog(query()).publicationAuthority,false);
 const visible=fixture(),before=page(visible,query('limit=20'));
 visible.clues.push({...visible.clues[0],id:id(999),symbol:'9999'});Object.assign(visible.clues.at(-1)!,{publication:null});
 visible.membership.events.push({...visible.membership.events[0],symbol:'9999',eventId:id(9997),epochId:id(9997)});
 assert.deepEqual(page(visible,query('limit=20')),before,'private-only clue and lineage cannot affect public hash, cursor or rows');
});
test('futures, forgedcoverage, duplicates, privateextras, malformedepochchain and hook/proxy inputs rejectbeforeprojection',()=>{
 const changes:Array<(p:ReturnType<typeof fixture>)=>void>=[p=>{p.clues[0].availableAt='2026-11-14T13:30:00.000001Z';},p=>{p.clues[0].industrySnapshot.knownAt='2026-11-15T00:00:00Z';},
  p=>{p.clues[1].id=p.clues[0].id;},p=>{Object.assign(p.coverage,{membershipComplete:true});},p=>{Object.assign(p.clues[0],{rawContent:'private sentinel'});},
  p=>{p.membership.events[0].sequence='2';},p=>{p.clues[0].publication.kind='caller_grant';}];
 for(const change of changes){const p=fixture();change(p);assert.throws(()=>page(p),/projection_invalid|epoch_fixture_invalid/u);}
 let hooks=0;const accessor=fixture();Object.defineProperty(accessor.clues[0],'symbol',{enumerable:true,get(){hooks++;return '2330';}});assert.throws(()=>page(accessor),/projection_invalid/u);assert.equal(hooks,0);
 assert.throws(()=>page(new Proxy(fixture(),{get(){hooks++;return undefined;}})),/projection_invalid/u);assert.equal(hooks,0);
 const sparse=fixture();sparse.clues=Array(201);assert.throws(()=>page(sparse),/projection_invalid/u);
 const extra=fixture();Object.assign(extra.clues,{privateValue:'sentinel'});assert.throws(()=>page(extra),/projection_invalid/u);
 for(const invalid of ['limit=21','limit=0','source=x&source=y','mode=fixture','date=2026-02-30'])assert.throws(()=>query(invalid),/projection_invalid/u);
});
