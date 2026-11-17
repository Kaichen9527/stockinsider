/** Synthetic stored rows only; no acquisition, DB or current-rights proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalContentHash} from '../source-content-semantics.ts';
import {projectCachedSourceAdmission,summarizeCachedSourceAdmissions} from './cached-source-admission.ts';
import {extractPermittedContent} from './permitted-content.ts';
type Row=Record<string,unknown>;
const cutoff='2026-11-07T06:00:00.123456Z';
const original='Synthetic cached public original; no real-source claim.';
const row=(extra:Row={}):Row=>({id:'00000000-0000-4000-8000-000000000001',document_url:'https://www.twse.com.tw/synthetic-cache',title:'Synthetic',content_text:original,
 published_at:'2026-11-06T06:00:00.123451Z',collected_at:'2026-11-06T06:00:00.123452Z',symbols:['2330'],canonical_content_hash:canonicalContentHash(original),metadata:{},...extra});
test('cached source candidate binds existing original hash, exact clocks and a reusable version without body output',()=>{
 const raw=row(),frozen=structuredClone(raw),projection=projectCachedSourceAdmission(raw,'official',cutoff);
 assert.ok(projection.item);assert.equal(projection.evidence.status,'cached_extraction_candidate');assert.equal(projection.evidence.observedCanonicalHash,raw.canonical_content_hash);
 assert.ok(projection.evidence.cacheVersionHash);assert.match(projection.evidence.cacheVersionHash,/^[a-f0-9]{64}$/u);assert.equal(projection.evidence.publisherRevision,null);assert.equal(projection.evidence.verifiedIndependentOrigin,null);
 assert.equal(JSON.stringify(projection.evidence).includes(original),false);assert.deepEqual(raw,frozen);
});
test('acquisition-only recollection changes cache observation version but never content identity or event date',()=>{
 const first=projectCachedSourceAdmission(row(),'official',cutoff),later=projectCachedSourceAdmission(row({collected_at:'2026-11-06T06:00:00.123453Z'}),'official',cutoff);
 assert.equal(first.evidence.contentHash,later.evidence.contentHash);assert.notEqual(first.evidence.cacheVersionHash,later.evidence.cacheVersionHash);assert.equal(first.item!.eventAt,later.item!.eventAt);
});
test('an older declared event remains conservative and unverified despite forged metadata revision/origin/rights/coverage',()=>{
 const event='2026-10-01T01:00:00.000001Z';const projection=projectCachedSourceAdmission(row({metadata:{original_event_at:event,source_revision:'forged',publisher_verified:true,origin_group:'forged',rights:true,eventCoverage:'complete'}}),'official',cutoff);
 assert.equal(projection.item,null);assert.equal(projection.evidence.eventAt,event);assert.equal(projection.evidence.identityEventBasis,'original_event');assert.equal(projection.evidence.reason,'vnext_cached_original_event_authority_unavailable');assert.match(projection.evidence.contentHash!,/^[a-f0-9]{64}$/u);
 assert.ok(projection.evidence.gaps.includes('declared_original_event_not_authority'));assert.equal(projection.evidence.publisherRevision,null);assert.equal(projection.evidence.verifiedIndependentOrigin,null);
 const summary=summarizeCachedSourceAdmissions([projection.evidence]);assert.equal(summary.upstreamCoverage,'unknown');assert.equal(summary.recent7,null);assert.equal(summary.prior21,null);
});
test('truncation, changed canonical body, negative eligibility and invalid microsecond clocks reject before reservation',()=>{
 for(const [extra,reason] of [
  [{metadata:{content_truncated:true}},'vnext_cached_original_truncated'],[{content_text:original+' correction'},'vnext_cached_canonical_content_mismatch'],
  [{metadata:{invalidated:true}},'vnext_cached_source_not_discovery_eligible'],[{metadata:{candidate_discovery_eligible:false}},'vnext_cached_source_not_discovery_eligible'],
  [{metadata:{original_event_at:'2026-11-06T06:00:00.123452Z'}},'vnext_content_original_clocks_required'],
  [{collected_at:'2026-11-07T06:00:00.123457Z'},'vnext_content_original_clocks_required'],
  [{published_at:'2026-02-30T00:00:00Z'},'vnext_content_original_clocks_required'],
 ] as Array<[Row,string]>){const result=projectCachedSourceAdmission(row(extra),'official',cutoff);assert.equal(result.item,null);assert.equal(result.evidence.reason,reason);assert.equal(result.evidence.contentHash,null);}
});
test('same-citation cache corrections retain both observed versions without choosing a publisher head or extra origin',()=>{
 const first=projectCachedSourceAdmission(row(),'official',cutoff),second=projectCachedSourceAdmission(row({content_text:'Corrected synthetic original',canonical_content_hash:canonicalContentHash('Corrected synthetic original')}),'official',cutoff);
 const summary=summarizeCachedSourceAdmissions([second.evidence,first.evidence,first.evidence]);assert.equal(summary.observedSameCitationVersions.length,1);assert.equal(summary.observedSameCitationVersions[0].contentHashes.length,2);
 assert.equal(summary.observedSameCitationVersions[0].publisherRevision,null);assert.equal(first.evidence.conservativeOriginGroup,second.evidence.conservativeOriginGroup);assert.equal(summary.independentOriginVerified,false);
});
test('PTT metadata stays unresolved and cannot become a legal body or independent original',()=>{
 const result=projectCachedSourceAdmission(row({document_url:'https://www.ptt.cc/bbs/Stock/M.synthetic.html',metadata:{retention_mode:'metadata_link_only'}}),'ptt',cutoff);
 assert.ok(result.item);assert.equal('body' in result.item,false);assert.equal(extractPermittedContent(result.item,cutoff).evidence,null);assert.equal(result.evidence.conservativeOriginGroup,null);
 assert.equal(projectCachedSourceAdmission(row(),'ptt',cutoff).evidence.reason,'vnext_metadata_retention_required');
});
test('missing legacy cache fields remain gaps while malformed present fields and restriction flags never authorize extraction',()=>{
 for(const value of [undefined,null]){const result=projectCachedSourceAdmission(row({metadata:value,canonical_content_hash:value}),'official',cutoff);assert.ok(result.item);assert.ok(result.evidence.gaps.includes('stored_canonical_content_hash_missing'));}
 for(const metadata of [[],false,'invalid',{invalidated:'true'},{discovery_eligible:'false'},{candidate_discovery_eligible:0},{content_truncated:'true'}]){
  const result=projectCachedSourceAdmission(row({metadata}),'official',cutoff);assert.equal(result.item,null);assert.equal(result.evidence.reason,'vnext_cached_source_metadata_invalid');assert.equal(result.evidence.cacheVersionHash,null);
 }
 for(const value of [0,{},[],false]){const result=projectCachedSourceAdmission(row({canonical_content_hash:value}),'official',cutoff);assert.equal(result.item,null);assert.equal(result.evidence.reason,'vnext_cached_canonical_content_invalid');}
});
test('same event clock with a new unverified original-event assertion changes observation version and refuses extraction',()=>{
 const raw=row(),before=projectCachedSourceAdmission(raw,'official',cutoff),after=projectCachedSourceAdmission({...raw,metadata:{original_event_at:raw.published_at}},'official',cutoff);
 assert.ok(before.item);assert.equal(after.item,null);assert.equal(before.evidence.eventAt,after.evidence.eventAt);assert.notEqual(before.evidence.cacheVersionHash,after.evidence.cacheVersionHash);
 assert.equal(after.evidence.reason,'vnext_cached_original_event_authority_unavailable');
});
