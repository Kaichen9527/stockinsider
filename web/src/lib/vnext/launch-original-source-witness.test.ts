import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLaunchOriginalSourceLinks,type LaunchOriginalSourceReadPort,type LaunchOriginalSourceRequest} from './launch-original-source-witness.ts';

/** Entirely invented metadata. These are neither actual source records nor a
 * formal review, permission, capture/manifest proof or fresh30 positive. */
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const h=(c:string)=>c.repeat(64),now=()=> '2026-11-14T12:00:00Z';
function fixture(){
 const request:LaunchOriginalSourceRequest={publicationRevision:id(1),inputHash:h('f'),cutoff:'2026-11-13T13:30:00Z',sourceVerificationId:id(11)};
 const evidence={id:`content:${h('a')}`,key:'reported_event',contentHash:h('a'),scope:'official_original',originSource:'official',originalContentHash:h('a'),
  sourceTier:'public',kind:'assumption',eventAt:'2026-11-10T01:00:00Z',availableAt:'2026-11-10T02:00:00Z'};
 const published={publication:{revision_id:id(1),job_id:id(2),symbol:'5274',input_hash:h('f'),published_at:'2026-11-10T13:00:00Z'},
  job:{job_id:id(2),symbol:'5274',input_hash:h('f'),state:'published',sources_read_at:'2026-11-10T10:30:00Z'},
  preparation:{job_id:id(2),input_hash:h('f'),frozen_at:'2026-11-10T10:00:00Z',source_evidence:[{...evidence}]},
  member:{symbol:'5274',input_hash:h('f'),state:'eligible',contraindication:false}};
 const extraction={receipt:{content_hash:h('a'),source:'official',scope:'official_original',state:'completed',rights_subject:'NONPRODUCTION-subject',license_basis:'NONPRODUCTION-existing-purpose',created_at:'2026-11-10T02:01:00Z',completed_at:'2026-11-10T02:02:00Z'},
  policy:{source:'official',scope:'official_original',rights_subject:'NONPRODUCTION-subject',license_basis:'NONPRODUCTION-existing-purpose',enabled:true,valid_until:'2026-11-18T00:00:00Z'},
  withdrawal:null as {content_hash:string;event_hash:string}|null,
  original:{eventAt:evidence.eventAt,publishedAt:evidence.eventAt,availableAt:evidence.availableAt,eventBasis:'source_publication',catalystUntil:null as string|null},evidence:{...evidence},clues:[{symbol:'5274',contentHash:h('a')}]};
 const v3={verification:{verification_id:id(11),revision_id:id(12),source_run_id:id(20),source_cutoff:'2026-11-10T09:00:00Z',recorded_at:'2026-11-10T03:00:00Z',canonical_content_hash:h('b'),published_at:evidence.eventAt,publisher_manifest_id:id(40),publisher_identity_id:id(30)},
  revision:{revision_id:id(12),source_key:'mops_material_event',revision_family_key:h('e'),approved_source_identity_id:id(30),source_identity_authority_id:id(31),stable_connector_document_id:'NONPRODUCTION-stable-document',acquisition_status:'complete',ingestion_canonical_content_hash_v3:h('b'),published_at:evidence.eventAt,collected_at:'2026-11-10T02:00:00Z',recorded_at:'2026-11-10T02:00:30Z'},
  family:{source_key:'mops_material_event',revision_family_key:h('e'),approved_source_identity_id:id(30),stable_connector_document_id:'NONPRODUCTION-stable-document',registered_at:'2026-11-01T00:00:00Z'},
  run:{run_id:id(20),status:'success',source_cutoff:'2026-11-10T09:00:00Z',terminal_at:'2026-11-10T09:30:00Z'},
  job:{job_id:id(21),run_id:id(20),status:'succeeded',output_kind:'source_parse_batch',output_hash:h('c'),terminal_at:'2026-11-10T09:00:30Z'},
  job_result:{job_id:id(21),run_id:id(20),output_kind:'source_parse_batch',output_hash:h('c'),recorded_at:'2026-11-10T09:00:20Z',document_revision_id:id(12)},
  claim:{claim_id:id(14),run_id:id(20),revision_id:id(12),claim_ordinal:0,canonical_prior_claim_id:null as string|null,effective_at:evidence.eventAt,recorded_at:'2026-11-10T09:00:00Z'},
  mention:{mention_id:id(15),run_id:id(20),revision_id:id(12),claim_ordinal:0,stock_id:id(50),symbol:'5274',outcome:'linked_new',recorded_at:'2026-11-10T09:00:00Z'},
  publisher_manifest:{manifest_id:id(40),manifest_kind:'publisher_verification_allowlist',contract_version:'source-publisher-allowlist-v3.0',status:'complete',manifest_hash:h('d'),source_cutoff:'2026-11-10T09:00:00Z',terminal_at:'2026-11-10T09:00:00Z'},
  revision_heads:[{id:id(12),recorded_at:'2026-11-10T02:00:30Z'}],
  source_authorities:[{id:id(31),source_identity_id:id(30),source_key:'mops_material_event',source_class:'official',status:'active',recorded_at:'2026-11-01T00:00:00Z',approved_at:'2026-11-01T00:00:00Z',valid_from:'2026-11-01T00:00:00Z',valid_to:null as string|null}],
  publisher_authorities:[{id:id(32),publisher_identity_id:id(30),source_class:'official',status:'active',recorded_at:'2026-11-01T00:00:00Z',approved_at:'2026-11-01T00:00:00Z',valid_from:'2026-11-01T00:00:00Z',valid_to:null as string|null}],earliest_known_publication:evidence.eventAt};
 const calls:string[]=[];
 const port:LaunchOriginalSourceReadPort={async readPublishedInput(value){calls.push(`publication:${value}`);return structuredClone(published);},
  async readExtraction(value){calls.push(`extraction:${value}`);return structuredClone(extraction);},
  async readV3Links(value,symbol,cutoff){calls.push(`v3:${value}:${symbol}:${cutoff}`);return structuredClone(v3);}};
 return {request,published,extraction,v3,port,calls};
}
test('unconfigured private adapter stays blocked; malformed/exotic requests make zero reads',async()=>{
 const f=fixture();const empty=await inspectLaunchOriginalSourceLinks(f.request,null,now);
 assert.equal(empty.status,'blocked');assert.equal(empty.authority,'none');assert.ok(empty.gaps.includes('private_database_reader_not_configured'));
 let hooks=0;const accessor={...f.request};Object.defineProperty(accessor,'inputHash',{enumerable:true,get(){hooks++;return h('f');}});
 for(const bad of [{...f.request,original:true},accessor,new Proxy(f.request,{get(){hooks++;return null;}}),{...f.request,cutoff:'2026-11-20T00:00:00Z'}]){
  await assert.rejects(inspectLaunchOriginalSourceLinks(bad,f.port,now),/source_inspection_request_invalid/u);
 }
 assert.equal(hooks,0);assert.equal(f.calls.length,0);
});
test('plausible synthetic links and fresh clocks NEVER mint original-source authority or grant',async()=>{
 const f=fixture();Object.assign(f.published,{privateUrl:'https://private.invalid/NONPRODUCTION-secret',body:'NONPRODUCTION-body-must-not-echo'});
 const result=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
 assert.equal(result.linkState,'consistent_observed_links');assert.equal(result.freshness,'within30days_observed');assert.equal(result.status,'blocked');assert.equal(result.authority,'none');
 assert.ok(result.gaps.includes('mechanical_extraction_revision_bridge_missing'));assert.ok(result.gaps.includes('independent_content_use_purpose_binding_missing'));
 assert.equal(f.calls.length,3);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.links)&&Object.isFrozen(result.gaps));
 const json=JSON.stringify(result);for(const privateValue of ['NONPRODUCTION-secret','NONPRODUCTION-body','NONPRODUCTION-subject',id(30),id(32)])assert.ok(!json.includes(privateValue));
});
test('exact formal publication/job/preparation/member bindings cannot be replaced by a candidate ID',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.published.preparation.input_hash=h('0');},(f:ReturnType<typeof fixture>)=>{f.published.member.contraindication=true;},
  (f:ReturnType<typeof fixture>)=>{f.published.publication.revision_id=id(99);}]){
  const f=fixture();mutate(f);const result=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
  assert.ok(result.gaps.includes('formal_published_input_binding_mismatch'));assert.equal(result.linkState,'inconsistent');assert.equal(f.calls.length,1);
 }
});
test('PTT metadata and operator rumor do not become original body evidence',async()=>{
 for(const scope of ['metadata','operator_claim']){
  const f=fixture();f.extraction.receipt.scope=scope;const result=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
  assert.ok(result.gaps.includes(scope==='metadata'?'metadata_only_not_original':'operator_claim_not_original'));assert.equal(f.calls.length,2);
 }
});
test('withdrawal, expired/current-policy mismatch and exact-microsecond expiry block inspection',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.extraction.withdrawal={content_hash:h('a'),event_hash:h('e')};},
  (f:ReturnType<typeof fixture>)=>{f.extraction.policy.enabled=false;},(f:ReturnType<typeof fixture>)=>{f.extraction.policy.valid_until='2026-11-14T20:00:00+08:00';},
  (f:ReturnType<typeof fixture>)=>{f.extraction.policy.license_basis='different-purpose';}]){
  const f=fixture();mutate(f);const result=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
  assert.ok(result.gaps.includes('source_withdrawn_observed')||result.gaps.includes('source_policy_tuple_not_current'));assert.equal(f.calls.length,2);
 }
});
test('acquisition and a repost cannot refresh an older original clock',async()=>{
 const f=fixture();f.v3.earliest_known_publication='2026-09-10T01:00:00Z';
 const result=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
 assert.ok(result.gaps.includes('original_root_clock_conflict'));assert.equal(result.freshness,'outside30days_observed');assert.equal(result.authority,'none');
 const old=fixture();old.extraction.original.eventAt='2026-09-10T01:00:00Z';old.extraction.original.publishedAt=old.extraction.original.eventAt;
 old.published.preparation.source_evidence[0].eventAt=old.extraction.original.eventAt;old.extraction.evidence.eventAt=old.extraction.original.eventAt;
 delete old.request.sourceVerificationId;
 assert.equal((await inspectLaunchOriginalSourceLinks(old.request,old.port,now)).freshness,'outside30days_observed');
});
test('optional catalyst absence is not a veto; asserted dates do not receive six-month approval',async()=>{
 const f=fixture();const none=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
 assert.equal(none.catalyst,'not_asserted_observed');assert.ok(!none.gaps.includes('asserted_catalyst_independent_review_missing'));
 f.extraction.original.catalystUntil='2027-04-01T00:00:00Z';const asserted=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
 assert.equal(asserted.catalyst,'asserted_unverified');assert.ok(asserted.gaps.includes('asserted_catalyst_independent_review_missing'));assert.equal(asserted.status,'blocked');
});
test('no verification candidate means no unrelated v3 scan; supplied candidate never substitutes source links',async()=>{
 const f=fixture();delete f.request.sourceVerificationId;const missing=await inspectLaunchOriginalSourceLinks(f.request,f.port,now);
 assert.ok(missing.gaps.includes('v3_publication_candidate_not_supplied'));assert.equal(f.calls.length,2);
 const other=fixture();other.v3.verification.verification_id=id(98);const result=await inspectLaunchOriginalSourceLinks(other.request,other.port,now);
 assert.ok(result.gaps.includes('v3_source_link_binding_mismatch'));assert.equal(result.links.sourceVerificationId,null);
});
test('wrong job/document/hash/mention identity and unsupported market-data profile cannot become source clues',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.v3.job_result.document_revision_id=id(99);},(f:ReturnType<typeof fixture>)=>{f.v3.verification.canonical_content_hash=h('9');},
  (f:ReturnType<typeof fixture>)=>{f.v3.mention.symbol='2330';},(f:ReturnType<typeof fixture>)=>{f.v3.job_result.output_hash=h('9');}]){
  const f=fixture();mutate(f);assert.ok((await inspectLaunchOriginalSourceLinks(f.request,f.port,now)).gaps.includes('v3_source_link_binding_mismatch'));
 }
 const f=fixture();f.v3.revision.source_key='market_csv_11370';assert.ok((await inspectLaunchOriginalSourceLinks(f.request,f.port,now)).gaps.includes('original_source_profile_not_supported'));
});
test('current heads precede status filters; revoked, superseded, conflicting and expired heads refuse',async()=>{
 const f=fixture();f.v3.source_authorities.push({...f.v3.source_authorities[0],id:id(81),status:'revoked',recorded_at:'2026-11-12T00:00:00Z'});
 assert.ok((await inspectLaunchOriginalSourceLinks(f.request,f.port,now)).gaps.includes('source_identity_not_current'));
 const superseded=fixture();superseded.v3.revision_heads.push({id:id(82),recorded_at:'2026-11-12T00:00:00Z'});
 assert.ok((await inspectLaunchOriginalSourceLinks(superseded.request,superseded.port,now)).gaps.includes('source_revision_superseded_or_missing'));
 const conflict=fixture();conflict.v3.publisher_authorities.push({...conflict.v3.publisher_authorities[0],id:id(83)});
 assert.ok((await inspectLaunchOriginalSourceLinks(conflict.request,conflict.port,now)).gaps.includes('source_authority_head_conflict'));
 const expired=fixture();expired.v3.publisher_authorities[0].valid_to='2026-11-14T20:00:00+08:00';
 assert.ok((await inspectLaunchOriginalSourceLinks(expired.request,expired.port,now)).gaps.includes('publisher_identity_not_current'));
});
test('private packets reject accessors/proxies/oversized heads and errors never expose thrown data',async()=>{
 let hooks=0;const f=fixture();Object.defineProperty(f.published.publication,'input_hash',{enumerable:true,get(){hooks++;return h('f');}});
 const port={...f.port,async readPublishedInput(){return f.published;}};
 assert.ok((await inspectLaunchOriginalSourceLinks(f.request,port,now)).gaps.includes('private_record_invalid'));assert.equal(hooks,0);
 const proxy=fixture();const proxied={...proxy.port,async readPublishedInput(){return {...proxy.published,publication:new Proxy(proxy.published.publication,{get(){hooks++;return null;}})};}};
 assert.ok((await inspectLaunchOriginalSourceLinks(proxy.request,proxied,now)).gaps.includes('private_record_invalid'));assert.equal(hooks,0);
 const sparse=fixture();const nonIndex:unknown[]=[];nonIndex.length=1;Object.defineProperty(nonIndex,'4294967295',{enumerable:true,value:{}});
 Object.defineProperty(sparse.published.preparation,'source_evidence',{enumerable:true,value:nonIndex});const sparsePort={...sparse.port,async readPublishedInput(){return sparse.published;}};
 assert.ok((await inspectLaunchOriginalSourceLinks(sparse.request,sparsePort,now)).gaps.includes('private_record_invalid'));
 const large=fixture();large.v3.source_authorities=Array.from({length:65},()=>({...large.v3.source_authorities[0]}));
 assert.ok((await inspectLaunchOriginalSourceLinks(large.request,large.port,now)).gaps.includes('private_record_invalid'));
 const thrown=fixture();const error={get message(){hooks++;return 'NONPRODUCTION-private-error';}};
 const failing={...thrown.port,async readPublishedInput(){throw error;}};const result=await inspectLaunchOriginalSourceLinks(thrown.request,failing,now);
 assert.ok(result.gaps.includes('private_read_unavailable'));assert.equal(hooks,0);assert.ok(!JSON.stringify(result).includes('NONPRODUCTION-private-error'));
});
