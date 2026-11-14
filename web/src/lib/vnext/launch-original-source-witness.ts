import {types} from 'node:util';
import {evidenceInstant} from './evidence-clock.ts';

/** Private diagnostic only. The port is a trusted server dependency, never an
 * HTTP body/registration API. There is deliberately no production DB adapter,
 * public route, grant, write, provider call or original-source capability here.
 * Even plausible/fabricated rows cannot produce approval. A later genuine DB
 * bridge/use-purpose producer needs its own design and authority boundary. */
type Row=Record<string,unknown>;
export type LaunchOriginalSourceRequest={publicationRevision:string;inputHash:string;cutoff:string;sourceVerificationId?:string};
export type LaunchOriginalSourceReadPort={
 /** Metadata projection of publication/job/preparation/member; source_evidence
  * is at most4 frozen reported_event items with value's scope/originSource/
  * originalContentHash flattened. No statement/body/title/URL is selected. */
 readPublishedInput(publicationRevision:string):Promise<unknown>;
 /** Receipt/current policy/withdrawal plus original CLOCKS and the same frozen
  * evidence metadata projection. Raw original text is neither needed nor read. */
 readExtraction(contentHash:string):Promise<unknown>;
 /** Existing v3 IDs/clocks/hash metadata only. Head arrays alias their actual
  * PK to id; job_result.document_revision_id projects output_json[5][0][0][1].
  * This is a candidate graph, not a stored FK or a DB authorization receipt. */
 readV3Links(verificationId:string,symbol:string,cutoff:string):Promise<unknown>;
};
export type LaunchOriginalSourceInspection={
 schemaVersion:'launch-original-source-inspection-v1';status:'blocked';authority:'none';
 linkState:'missing'|'inconsistent'|'consistent_observed_links';
 freshness:'unresolved'|'outside30days_observed'|'within30days_observed';
 catalyst:'unresolved'|'not_asserted_observed'|'asserted_unverified';
 links:{publicationRevision:string;inputHash:string;contentHash:string|null;sourceVerificationId:string|null;sourceRevisionId:string|null;claimId:string|null;mentionId:string|null};
 gaps:string[];
};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,HASH=/^[a-f0-9]{64}$/u;
const uuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&HASH.test(v);
const row=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const faults=new WeakMap<object,string>();
function invalid(code:string):never{const error=Error(code);faults.set(error,code);throw error;}
/** Snapshot descriptors before any property access; never invoke accessors,
 * serialization hooks or Proxy traps. Every port packet is a bounded metadata
 * projection. An actual adapter must not SELECT bodies/titles/private URLs. */
function snapshot(value:unknown):unknown{
 let count=0,bytes=0;
 const visit=(v:unknown,depth:number):unknown=>{
  if(++count>12000||depth>12)invalid('private_record_bounds');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))invalid('private_record_invalid');return v;}
  if(typeof v==='string'){bytes+=Buffer.byteLength(v);if(v.length>4096||bytes>256*1024)invalid('private_record_bounds');return v;}
  if(!v||typeof v!=='object'||types.isProxy(v))invalid('private_record_invalid');
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v);
  if(!(array?prototype===Array.prototype:[Object.prototype,null].includes(prototype)))invalid('private_record_invalid');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  const length=array?descriptors.length.value as number:0;
  if(array&&(!Number.isSafeInteger(length)||length<0||length>256||keys.length!==length+1))invalid('private_record_bounds');
  const output:unknown[]|Row=array?[]:{};
  for(const key of keys){
   const d=descriptors[key as string];
   if(typeof key!=='string'||key.length>100||!d||!Object.hasOwn(d,'value')||!d.enumerable&&!(array&&key==='length')||['__proto__','constructor','prototype','toJSON'].includes(key))invalid('private_record_invalid');
   if(array&&key==='length')continue;
   if(array&&(!/^(0|[1-9][0-9]*)$/u.test(key)||!Number.isSafeInteger(Number(key))||Number(key)>=length))invalid('private_record_invalid');
   (output as Row)[key]=visit(d.value,depth+1);
  }
  return output;
 };
 return visit(value,0);
}
function request(value:unknown):LaunchOriginalSourceRequest{
 let copied:unknown;try{copied=snapshot(value);}catch{invalid('source_inspection_request_invalid');}
 if(!row(copied)||Object.keys(copied).some(k=>!['publicationRevision','inputHash','cutoff','sourceVerificationId'].includes(k))
  ||!uuid(copied.publicationRevision)||!hash(copied.inputHash)||typeof copied.cutoff!=='string'||evidenceInstant(copied.cutoff)===null
  ||copied.sourceVerificationId!==undefined&&!uuid(copied.sourceVerificationId))invalid('source_inspection_request_invalid');
 return copied as LaunchOriginalSourceRequest;
}
const known=(v:unknown,cutoff:string)=>typeof v==='string'&&evidenceInstant(v)!==null&&evidenceInstant(v)!<=evidenceInstant(cutoff)!;
const ordered=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&evidenceInstant(a)!==null&&evidenceInstant(b)!==null&&evidenceInstant(a)!<=evidenceInstant(b)!;
const activeThrough=(end:unknown,now:string)=>end===null||typeof end==='string'&&evidenceInstant(end)!==null&&evidenceInstant(end)!>evidenceInstant(now)!;
function currentHead(value:unknown,now:string):Row|null{
 if(!Array.isArray(value)||value.length>64||value.some(v=>!row(v)||!uuid(v.id)||!known(v.recorded_at,now)))invalid('private_record_invalid');
 const rows=(value as Row[]).slice().sort((a,b)=>evidenceInstant(a.recorded_at as string)!>evidenceInstant(b.recorded_at as string)!?-1:evidenceInstant(a.recorded_at as string)!<evidenceInstant(b.recorded_at as string)!?1:String(a.id).localeCompare(String(b.id)));
 if(rows.length>1&&evidenceInstant(rows[0].recorded_at as string)===evidenceInstant(rows[1].recorded_at as string))invalid('source_authority_head_conflict');
 return rows[0]??null;
}
/** Observations only, including the clock/window result. There is no true or
 * approved outcome, no unchecked registrar and no SQL qualification consumer.
 * Catalyst validation is needed only when asserted; pure momentum may have no
 * catalyst. Current old three-month fields never become six-month approval. */
export async function inspectLaunchOriginalSourceLinks(value:unknown,port:LaunchOriginalSourceReadPort|null=null,clock=()=>new Date().toISOString()):Promise<LaunchOriginalSourceInspection>{
 const input=request(value);let now:string;try{now=clock();}catch{invalid('source_inspection_clock_unavailable');}
 if(evidenceInstant(now)===null||!known(input.cutoff,now))invalid('source_inspection_request_invalid');
 const result:LaunchOriginalSourceInspection={schemaVersion:'launch-original-source-inspection-v1',status:'blocked',authority:'none',linkState:'missing',freshness:'unresolved',catalyst:'unresolved',
  links:{publicationRevision:input.publicationRevision,inputHash:input.inputHash,contentHash:null,sourceVerificationId:null,sourceRevisionId:null,claimId:null,mentionId:null},
  gaps:['mechanical_extraction_revision_bridge_missing','independent_content_use_purpose_binding_missing']};
 const finish=(gap?:string)=>{if(gap)result.gaps.push(gap);result.gaps=[...new Set(result.gaps)];Object.freeze(result.links);Object.freeze(result.gaps);return Object.freeze(result);};
 if(port===null)return finish('private_database_reader_not_configured');
 try{
  if(types.isProxy(port)||![Object.prototype,null].includes(Object.getPrototypeOf(port)))invalid('private_read_port_invalid');
  const descriptors=Object.getOwnPropertyDescriptors(port),keys=Reflect.ownKeys(descriptors);
  if(keys.length!==3||!['readPublishedInput','readExtraction','readV3Links'].every(k=>descriptors[k]?.enumerable&&Object.hasOwn(descriptors[k],'value')&&typeof descriptors[k].value==='function'))invalid('private_read_port_invalid');
  const readPublished=descriptors.readPublishedInput.value as LaunchOriginalSourceReadPort['readPublishedInput'],readExtraction=descriptors.readExtraction.value as LaunchOriginalSourceReadPort['readExtraction'],readV3=descriptors.readV3Links.value as LaunchOriginalSourceReadPort['readV3Links'];
  const published=snapshot(await readPublished.call(port,input.publicationRevision));
  if(!row(published)||!row(published.publication)||!row(published.job)||!row(published.preparation)||!row(published.member))return finish('formal_published_input_missing');
  const {publication:pub,job,preparation:prep,member}=published;
  if(pub.revision_id!==input.publicationRevision||!uuid(pub.job_id)||pub.job_id!==job.job_id||pub.job_id!==prep.job_id
   ||pub.input_hash!==input.inputHash||job.input_hash!==input.inputHash||prep.input_hash!==input.inputHash||member.input_hash!==input.inputHash
   ||typeof pub.symbol!=='string'||!/^\d{4}$/u.test(pub.symbol)||job.symbol!==pub.symbol||member.symbol!==pub.symbol
   ||job.state!=='published'||!['researching','waiting','eligible'].includes(String(member.state))||member.contraindication!==false||!known(pub.published_at,input.cutoff)||!ordered(prep.frozen_at,job.sources_read_at)||!ordered(job.sources_read_at,pub.published_at)){
   result.linkState='inconsistent';return finish('formal_published_input_binding_mismatch');
  }
  if(!Array.isArray(prep.source_evidence)||prep.source_evidence.length>4||prep.source_evidence.some(v=>!row(v)))return finish('formal_source_metadata_projection_invalid');
  if(prep.source_evidence.length!==1)return finish('exact_single_source_selection_required');
  const evidence=prep.source_evidence[0] as Row;
  if(!hash(evidence.contentHash)||evidence.id!==`content:${evidence.contentHash}`||evidence.key!=='reported_event')return finish('formal_source_item_identity_missing');
  result.links.contentHash=evidence.contentHash;
  const extraction=snapshot(await readExtraction.call(port,evidence.contentHash));
  if(!row(extraction)||!row(extraction.receipt)||!row(extraction.policy)||!row(extraction.original)||!row(extraction.evidence)||!Array.isArray(extraction.clues)||extraction.clues.length>12)return finish('completed_extraction_missing');
  const {receipt,policy,original}=extraction;const projectedEvidence=extraction.evidence;
  if(receipt.content_hash!==evidence.contentHash||receipt.state!=='completed'||!known(receipt.completed_at,input.cutoff)||!ordered(receipt.created_at,receipt.completed_at)
   ||!ordered(receipt.completed_at,prep.frozen_at)||extraction.evidence.id!==evidence.id||extraction.evidence.contentHash!==evidence.contentHash
   ||['key','scope','originSource','originalContentHash','sourceTier','kind','eventAt','availableAt'].some(k=>evidence[k]!==projectedEvidence[k])
   ||!extraction.clues.some(c=>row(c)&&c.symbol===pub.symbol&&c.contentHash===evidence.contentHash))return finish('completed_extraction_binding_mismatch');
  if(receipt.scope==='metadata')return finish('metadata_only_not_original');
  if(receipt.scope==='operator_claim')return finish('operator_claim_not_original');
  if(receipt.source!=='official'||receipt.scope!=='official_original')return finish('source_scope_unsupported');
  if(evidence.scope!==receipt.scope||evidence.originSource!==receipt.source||evidence.originalContentHash!==receipt.content_hash
   ||evidence.eventAt!==original.eventAt||evidence.availableAt!==original.availableAt)return finish('completed_extraction_binding_mismatch');
  if(extraction.withdrawal!==null)return finish('source_withdrawn_observed');
  if(policy.source!==receipt.source||policy.scope!==receipt.scope||policy.enabled!==true||policy.rights_subject!==receipt.rights_subject||policy.license_basis!==receipt.license_basis
   ||typeof receipt.rights_subject!=='string'||receipt.rights_subject.length<1||receipt.rights_subject.length>256||typeof receipt.license_basis!=='string'||receipt.license_basis.length<1||receipt.license_basis.length>256
   ||typeof policy.valid_until!=='string'||evidenceInstant(policy.valid_until)===null||evidenceInstant(policy.valid_until)!<=evidenceInstant(now)!)return finish('source_policy_tuple_not_current');
  if(!ordered(original.eventAt,original.publishedAt)||!ordered(original.publishedAt,original.availableAt)||!ordered(original.availableAt,receipt.created_at))return finish('source_original_clock_invalid');
  if(!['source_publication','original_event'].includes(String(original.eventBasis)))return finish('source_original_event_basis_unverified');
  result.gaps.push(original.eventBasis==='source_publication'?'underlying_event_clock_unresolved':'declared_original_event_clock_link_missing');
  result.catalyst=original.catalystUntil===null||original.catalystUntil===undefined?'not_asserted_observed':'asserted_unverified';
  if(result.catalyst==='asserted_unverified'&&(typeof original.catalystUntil!=='string'||evidenceInstant(original.catalystUntil)===null))return finish('asserted_catalyst_metadata_invalid');
  if(result.catalyst==='asserted_unverified')result.gaps.push('asserted_catalyst_independent_review_missing');
  const age=evidenceInstant(input.cutoff)!-evidenceInstant(original.eventAt as string)!;
  result.freshness=age>=BigInt(0)&&age<=BigInt(30*86400)*BigInt(1000000)?'within30days_observed':'outside30days_observed';
  if(result.freshness==='outside30days_observed')result.gaps.push('original_clock_outside_thirty_days');
  if(!input.sourceVerificationId)return finish('v3_publication_candidate_not_supplied');
  const v3=snapshot(await readV3.call(port,input.sourceVerificationId,pub.symbol,input.cutoff));
  if(!row(v3)||!row(v3.verification)||!row(v3.revision)||!row(v3.family)||!row(v3.run)||!row(v3.job)||!row(v3.job_result)||!row(v3.claim)||!row(v3.mention)||!row(v3.publisher_manifest))return finish('v3_source_links_missing');
  const {verification:verified,revision,family,run,claim,mention,publisher_manifest:manifest}=v3;
  // First diagnostic profile only: this already-existing original-text source,
  // never market CSVs, insider snapshot rows, metadata, audio or member content.
  if(revision.source_key!=='mops_material_event')return finish('original_source_profile_not_supported');
  if(verified.verification_id!==input.sourceVerificationId||!uuid(verified.revision_id)||verified.revision_id!==revision.revision_id||!uuid(run.run_id)||!uuid(v3.job.job_id)||!uuid(claim.claim_id)||!uuid(mention.mention_id)
   ||verified.source_run_id!==run.run_id||v3.job.run_id!==run.run_id||claim.run_id!==run.run_id||mention.run_id!==run.run_id
   ||claim.revision_id!==revision.revision_id||mention.revision_id!==revision.revision_id||mention.claim_ordinal!==claim.claim_ordinal
   ||mention.stock_id===null||mention.symbol!==pub.symbol||!['linked_new','linked_refresh','linked_duplicate_claim'].includes(String(mention.outcome))
   ||revision.source_key!==family.source_key||revision.revision_family_key!==family.revision_family_key
   ||revision.approved_source_identity_id!==family.approved_source_identity_id||revision.stable_connector_document_id!==family.stable_connector_document_id
   ||revision.acquisition_status!=='complete'||verified.canonical_content_hash!==revision.ingestion_canonical_content_hash_v3
   ||!hash(verified.canonical_content_hash)||verified.publisher_manifest_id!==manifest.manifest_id||manifest.status!=='complete'
   ||manifest.manifest_kind!=='publisher_verification_allowlist'||manifest.contract_version!=='source-publisher-allowlist-v3.0'
   ||!hash(manifest.manifest_hash)||run.status!=='success'||v3.job.status!=='succeeded'||v3.job.output_kind!=='source_parse_batch'
   ||v3.job_result.job_id!==v3.job.job_id||v3.job_result.run_id!==run.run_id||v3.job_result.output_kind!=='source_parse_batch'
   ||v3.job_result.document_revision_id!==revision.revision_id||!hash(v3.job.output_hash)||v3.job_result.output_hash!==v3.job.output_hash
   ||!known(v3.job_result.recorded_at,input.cutoff)||!known(run.source_cutoff,input.cutoff)||!known(verified.source_cutoff,input.cutoff)
   ||evidenceInstant(run.source_cutoff as string)!==evidenceInstant(verified.source_cutoff as string)
   ||!known(v3.job.terminal_at,input.cutoff)||!known(run.terminal_at,input.cutoff)||!known(verified.recorded_at,input.cutoff)||!known(revision.recorded_at,input.cutoff)
   ||!known(family.registered_at,input.cutoff)||!known(manifest.terminal_at,input.cutoff)||!ordered(revision.published_at,revision.collected_at)
   ||!known(manifest.source_cutoff,input.cutoff)||!known(claim.recorded_at,input.cutoff)||!known(mention.recorded_at,input.cutoff)||!known(claim.effective_at,input.cutoff)
   ||!ordered(revision.collected_at,revision.recorded_at)||verified.published_at!==revision.published_at){result.linkState='inconsistent';return finish('v3_source_link_binding_mismatch');}
  result.links.sourceVerificationId=verified.verification_id as string;result.links.sourceRevisionId=revision.revision_id as string;
  if(uuid(claim.claim_id))result.links.claimId=claim.claim_id;if(uuid(mention.mention_id))result.links.mentionId=mention.mention_id;
  const head=currentHead(v3.revision_heads,now),identity=currentHead(v3.source_authorities,now),publisher=currentHead(v3.publisher_authorities,now);
  if(!head||head.id!==revision.revision_id)return finish('source_revision_superseded_or_missing');
  if(!identity||identity.id!==revision.source_identity_authority_id||identity.source_identity_id!==revision.approved_source_identity_id||identity.source_key!==revision.source_key
   ||identity.status!=='active'||identity.source_class!=='official'||!known(identity.recorded_at,input.cutoff)||!known(identity.approved_at,input.cutoff)||!known(identity.valid_from,input.cutoff)||!activeThrough(identity.valid_to,now))return finish('source_identity_not_current');
  if(!publisher||publisher.publisher_identity_id!==verified.publisher_identity_id||verified.publisher_identity_id!==revision.approved_source_identity_id||publisher.status!=='active'||publisher.source_class!=='official'
   ||!known(publisher.recorded_at,input.cutoff)||!known(publisher.approved_at,input.cutoff)||!known(publisher.valid_from,input.cutoff)||!activeThrough(publisher.valid_to,now))return finish('publisher_identity_not_current');
  if(claim.canonical_prior_claim_id!==null)return finish('prior_canonical_claim_origin_unresolved');
  if(evidenceInstant(original.publishedAt as string)!==evidenceInstant(verified.published_at as string))return finish('original_publication_clock_mismatch');
  if(typeof v3.earliest_known_publication==='string'&&ordered(v3.earliest_known_publication,original.eventAt)&&evidenceInstant(v3.earliest_known_publication)!<evidenceInstant(original.eventAt as string)!){
   if(evidenceInstant(input.cutoff)!-evidenceInstant(v3.earliest_known_publication)!>BigInt(30*86400)*BigInt(1000000))result.freshness='outside30days_observed';
   return finish('original_root_clock_conflict');
  }
  result.linkState='consistent_observed_links';
  return finish('raw_content_and_manifest_membership_bridge_unverified');
 }catch(error){
  const code=error!==null&&typeof error==='object'?faults.get(error):undefined;
  return finish(code??'private_read_unavailable');
 }
}
