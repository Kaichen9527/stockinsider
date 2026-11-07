import {canonicalContentHash} from '../source-content-semantics.ts';
import {evidenceInstant,evidenceKnownAt} from './evidence-clock.ts';
import {permittedContentFingerprint,type PermittedContent} from './permitted-content.ts';
import {inputHash} from './policy.ts';
type Row=Record<string,unknown>;
export type CachedSource='official'|'ptt';
export type CachedSourceAdmission={
 schemaVersion:'vnext-cached-source-admission-v1';rawDocumentId:string;source:CachedSource;
 cutoff:string;cacheCycleCutoff:string;cacheVersionHash:string|null;contentHash:string|null;
 eventAt:string;publishedAt:string;availableAt:string;identityEventBasis:PermittedContent['eventBasis'];eventAuthority:'cached_observation_only';
 citation:string;observedCanonicalHash:string|null;storedCanonicalHash:string|null;
 publisherRevision:null;verifiedIndependentOrigin:null;conservativeOriginGroup:string|null;
 rightsAuthority:'existing_source_policy_and_reservation_only';
 status:'cached_extraction_candidate'|'rejected';reason:string|null;gaps:string[];
};
const record=(value:unknown):value is Row=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const hash=/^[a-f0-9]{64}$/u;
/** Validate an existing cache row, never metadata assertions of publisher,
 * source rights, upstream completeness or an immutable revision bridge. */
export function projectCachedSourceAdmission(row:Row,source:CachedSource,cutoff:string,cacheCycleCutoff=cutoff){
 const metadataInvalid=row.metadata!==undefined&&row.metadata!==null&&!record(row.metadata);
 const metadata=record(row.metadata)?row.metadata:{};
 const restrictionInvalid=['invalidated','discovery_eligible','candidate_discovery_eligible','content_truncated'].some(key=>metadata[key]!==undefined&&typeof metadata[key]!=='boolean');
 const canonicalInvalid=row.canonical_content_hash!==undefined&&row.canonical_content_hash!==null&&typeof row.canonical_content_hash!=='string';
 const publishedAt=typeof row.published_at==='string'?row.published_at:'';
 const availableAt=typeof row.collected_at==='string'?row.collected_at:'';
 const declaredEvent=metadata.original_event_at;
 // Retain an older declared event conservatively. It cannot become a verified
 // original event, nor be refreshed to the later publication/acquisition clock.
 const eventAt=typeof declaredEvent==='string'?declaredEvent:publishedAt;
 const item:PermittedContent={id:typeof row.id==='string'?row.id:'',source,scope:source==='official'?'official_original':'metadata',
  url:typeof row.document_url==='string'?row.document_url:'',eventAt,publishedAt,eventBasis:declaredEvent!==undefined?'original_event':'source_publication',availableAt,
  symbols:Array.isArray(row.symbols)?row.symbols as string[]:[],authorRoot:source==='official'?'official:twse-tpex':'',originalRoot:source==='official'&&typeof row.document_url==='string'?row.document_url:'',
  ...(source==='official'?{body:typeof row.content_text==='string'?row.content_text:''}:{title:typeof row.title==='string'?row.title:''})};
 const storedCanonicalHash=typeof row.canonical_content_hash==='string'?row.canonical_content_hash:null;
 const boundedBody=typeof item.body==='string'&&item.body.length<=16384&&Buffer.byteLength(item.body)<=16384;
 const bounded=source==='official'?boundedBody:typeof item.title==='string'&&item.title.length<=512;
 const boundedIdentity=item.id.length<=128&&item.url.length<=2048&&[eventAt,publishedAt,availableAt,cutoff,cacheCycleCutoff].every(value=>value.length<=64)
  &&item.symbols.length<=12&&item.symbols.every(value=>typeof value==='string'&&/^\d{4}$/u.test(value));
 const observedCanonicalHash=source==='official'&&boundedBody?canonicalContentHash(item.body!):null;
 const gaps=['publisher_revision_not_recorded_in_cache','raw_document_revision_bridge_unavailable','upstream_event_coverage_unknown',
  ...(declaredEvent!==undefined?['declared_original_event_not_authority']:['underlying_event_time_unresolved_source_publication_only']),
  ...(storedCanonicalHash===null?['stored_canonical_content_hash_missing']:[]),
  ...(source==='official'?['cached_body_upstream_completeness_unproven']:['original_root_or_author_unresolved','metadata_only_no_body_or_semantic_confirmation'])];
 let contentHash:string|null=null,reason:string|null=null;
 try{
  if(metadataInvalid||restrictionInvalid)throw Error('vnext_cached_source_metadata_invalid');
  if(canonicalInvalid)throw Error('vnext_cached_canonical_content_invalid');
  if(!evidenceKnownAt(cacheCycleCutoff,cutoff)||!evidenceKnownAt(availableAt,cacheCycleCutoff)||evidenceInstant(eventAt)===null||!evidenceKnownAt(eventAt,publishedAt)||!evidenceKnownAt(publishedAt,availableAt)||declaredEvent!==undefined&&typeof declaredEvent!=='string')throw Error('vnext_content_original_clocks_required');
  if(source==='ptt'&&metadata.retention_mode!=='metadata_link_only')throw Error('vnext_metadata_retention_required');
  if(metadata.invalidated===true||metadata.discovery_eligible===false||metadata.candidate_discovery_eligible===false)throw Error('vnext_cached_source_not_discovery_eligible');
  if(source==='official'&&metadata.content_truncated===true)throw Error('vnext_cached_original_truncated');
  if(!bounded)throw Error(source==='official'?'vnext_official_bounded_original_required':'vnext_metadata_only_required');
  if(storedCanonicalHash!==null&&(!hash.test(storedCanonicalHash)||source==='official'&&storedCanonicalHash!==observedCanonicalHash))throw Error('vnext_cached_canonical_content_mismatch');
  contentHash=permittedContentFingerprint(item,cutoff);
  // Preserve the legacy identity as observation evidence, but do not submit a
  // relabelled identity or charge parsing when metadata cannot prove its event.
  if(declaredEvent!==undefined)throw Error('vnext_cached_original_event_authority_unavailable');
 }catch(error){reason=error instanceof Error&&/^vnext_[a-z_]+$/u.test(error.message)?error.message:'vnext_cached_source_invalid';}
 const evidence:CachedSourceAdmission={schemaVersion:'vnext-cached-source-admission-v1',rawDocumentId:item.id,source,cutoff,cacheCycleCutoff,
  cacheVersionHash:!metadataInvalid&&!restrictionInvalid&&!canonicalInvalid&&bounded&&boundedIdentity&&(storedCanonicalHash===null||hash.test(storedCanonicalHash))?inputHash({rawDocumentId:item.id,source,citation:item.url,eventAt,publishedAt,availableAt,identityEventBasis:item.eventBasis,body:source==='official'?item.body:null,title:source==='ptt'?item.title:null,symbols:item.symbols,storedCanonicalHash,
   cacheRestrictions:{truncated:metadata.content_truncated===true,invalidated:metadata.invalidated===true,discoveryEligible:metadata.discovery_eligible!==false,candidateDiscoveryEligible:metadata.candidate_discovery_eligible!==false}}):null,
  contentHash,eventAt,publishedAt,availableAt,identityEventBasis:item.eventBasis,eventAuthority:'cached_observation_only',citation:item.url,observedCanonicalHash,storedCanonicalHash,
  publisherRevision:null,verifiedIndependentOrigin:null,conservativeOriginGroup:source==='official'?inputHash({source,authorRoot:item.authorRoot}):null,
  rightsAuthority:'existing_source_policy_and_reservation_only',status:reason?'rejected':'cached_extraction_candidate',reason,gaps:[...gaps,...(reason?[reason]:[])]};
 return {item:reason?null:item,evidence};
}
/** Observed versions at one citation are unordered cache observations. No
 * latest/supersedes claim survives the legacy URL upsert's missing revisions. */
export function summarizeCachedSourceAdmissions(rows:CachedSourceAdmission[]){
 if(rows.length>400)throw Error('vnext_content_scan_bound');
 const citations=new Map<string,Set<string>>();
 for(const row of rows)if(row.contentHash!==null){const key=JSON.stringify([row.source,row.citation]);const values=citations.get(key)||new Set<string>();values.add(row.contentHash);citations.set(key,values);}
 return {schemaVersion:'vnext-cached-source-summary-v1' as const,evidence:rows,
  observedSameCitationVersions:[...citations].sort(([a],[b])=>a.localeCompare(b)).map(([key,values])=>({source:JSON.parse(key)[0] as CachedSource,citation:JSON.parse(key)[1] as string,contentHashes:[...values].sort(),publisherRevision:null})),
  upstreamCoverage:'unknown' as const,eventVolume:null,recent7:null,prior21:null,independentOriginVerified:false as const};
}
