import type {getSupabaseServerClient} from '../supabase-server.ts';
import type {Evidence} from './research.ts';
import {inputHash} from './policy.ts';
import {publicCitation} from './citations.ts';
import {assertWorkerJsonCodec} from './worker-output.ts';
type Row=Record<string,unknown>;
type SourceRows={provenance:Row[];jobs:Row[];links:Row[];receipts:Row[];documents:Row[];issuerDomains?:Row[];parserEvidence?:Row[]};
const hash=/^[a-f0-9]{64}$/u;
const known=(value:unknown,cutoff:string)=>typeof value==='string' && Number.isFinite(Date.parse(value)) && Date.parse(value)<=Date.parse(cutoff);
const factColumns='fact_id stock_id fact_key period_start period_end duration_kind value unit provider authority_tier estimate_kind estimate_horizon filing_published_at source_timestamp collected_at filing_restatement_id source_ref recorded_at validation_status schema_valid unit_valid point_in_time_valid consistency_valid upstream_provider validation_recorded_at'.split(' ').sort();
/** Reuse the worker's existing fixed-decimal JSON domain and the original
 * inputHash. Unsupported fact JSON is deferred, never rounded/re-encoded. */
function originalFactCodec(fact:Row){
 const keys=Object.keys(fact).sort();if(keys.join('|')!==factColumns.join('|') || keys.join('|')!==Object.keys(fact).sort((a,b)=>a.localeCompare(b)).join('|'))return false;
 try{for(const value of Object.values(fact)){if(value!==null && !['string','number','boolean'].includes(typeof value))return false;assertWorkerJsonCodec(value);}return true;}catch{return false;}
}
function approvedIssuerSource(value:unknown,stockId:unknown,domains:Row[],cutoff:string){
 if(typeof value!=='string' || !value.startsWith('https://') || !publicCitation(value))return null;
 try{const url=new URL(value);if(url.username || url.password || url.port || url.hash || url.pathname.length<2)return null;
  const matches=domains.filter(row=>row.stock_id===stockId && row.host===url.hostname && known(row.approved_at,cutoff));
  return matches.length===1?{url:value,approval:{stockId,host:url.hostname,approvedAt:matches[0].approved_at}}:null;
 }catch{return null;}
}
/** Exactly the existing provider's finite official URL domain. An approved
 * issuer IR document is not silently relabelled as an official-host document. */
export function financialProviderSourceUrl(value:unknown){
 if(typeof value!=='string' || !/^https:\/\/([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(\/|$)/u.test(value))return null;
 try{const url=new URL(value);return !url.username && !url.password && !url.port && publicCitation(value)?value:null;}catch{return null;}
}
/** Subjects must come from read_financial_facts_for_stocks_as_of. Its existing
 * immutable validation and structural as-of proof remain the fact authority;
 * this join resolves the original public citation, never a client URL. */
export function projectFinancialEvidenceSources(facts:Row[],rows:SourceRows,cutoff:string){
 if(!Number.isFinite(Date.parse(cutoff)) || facts.length>2000)throw Error('vnext_financial_source_scope_unbounded');
 const evidence:Evidence[]=[];const receipts:Row[]=[];const deferred:Row[]=[];
 for(const fact of facts){
  const reject=(reason:string)=>deferred.push({factId:String(fact.fact_id),sourceRef:fact.source_ref,originalFactHash:inputHash(fact),estimateKind:fact.estimate_kind,estimateHorizon:fact.estimate_horizon,key:fact.fact_key,value:fact.value,unit:fact.unit,period:fact.period_end,reason});
  if(fact.estimate_kind!=='reported' || fact.estimate_horizon!=='reported_period'){reject('reported_fact_authority_required_estimate_not_promoted');continue;}
  if(fact.validation_status!=='validated' || !['schema_valid','unit_valid','point_in_time_valid','consistency_valid'].every((key)=>fact[key]===true) || !['official_primary','official_filing'].includes(String(fact.authority_tier)) || typeof fact.value!=='number' || !Number.isFinite(fact.value) || !['source_timestamp','collected_at','recorded_at'].every((key)=>known(fact[key],cutoff))){reject('validated_original_fact_required');continue;}
  const sourceRef=String(fact.source_ref||'');const documentHash=/^issuer-document:([a-f0-9]{64}):[a-f0-9]+$/u.exec(sourceRef)?.[1];
  const candidates:Row[]=[];let codecUnsupported=false;
  for(const provenance of rows.provenance.filter((row)=>row.fact_id===fact.fact_id && known(row.extracted_at,cutoff) && known(row.recorded_at,cutoff) && hash.test(String(row.source_sha256)))){
   const locator=provenance.locator as Row|undefined;const officialUrl=financialProviderSourceUrl(provenance.source_url);
   const issuerSource=!officialUrl && documentHash?approvedIssuerSource(provenance.source_url,fact.stock_id,rows.issuerDomains||[],cutoff):null;
   const sourceUrl=officialUrl||issuerSource?.url;if(!sourceUrl)continue;
   if(issuerSource && !originalFactCodec(fact)){codecUnsupported=true;continue;}
   if(issuerSource && (fact.provider!=='mops' || fact.authority_tier!=='official_filing'))continue;
   if(documentHash){
    for(const link of rows.links.filter((row)=>row.fact_id===fact.fact_id && Date.parse(String(row.fact_recorded_at))===Date.parse(String(fact.recorded_at)) && known(row.created_at,cutoff))){
     const receipt=rows.receipts.find((row)=>row.receipt_id===link.receipt_id && row.stock_id===fact.stock_id && row.period_end===fact.period_end && row.document_sha256===documentHash && row.document_sha256===provenance.source_sha256 && row.source_url===sourceUrl && row.issuer_document_id===provenance.issuer_document_id && row.parser_status==='complete' && row.receipt_status==='accepted' && known(row.accepted_at,cutoff) && known(row.completed_at,cutoff) && (row.published_at===null || known(row.published_at,cutoff)));
     const document=receipt && rows.documents.find((row)=>row.document_id===receipt.issuer_document_id && row.stock_id===fact.stock_id && row.document_sha256===documentHash && row.document_url===sourceUrl && row.acquisition_status==='fetched' && known(row.collected_at,cutoff) && known(row.recorded_at,cutoff));
     if(!receipt || !document || !locator || locator.parser_evidence_id!==link.evidence_id || !hash.test(String(locator.manifest_sha256)) || locator.response_url!==sourceUrl)continue;
     const parser=issuerSource?rows.parserEvidence?.find(row=>row.evidence_id===link.evidence_id && row.receipt_id===receipt.receipt_id && row.document_sha256===documentHash && row.manifest_sha256===locator.manifest_sha256 && known(row.recorded_at,cutoff)):null;
     if(issuerSource && (!parser || receipt.parser_evidence_id!==link.evidence_id || receipt.financial_validation_status!=='validated' || !known(fact.filing_published_at,cutoff)))continue;
     candidates.push({factId:fact.fact_id,factRecordedAt:fact.recorded_at,sourceRef,sourceUrl,sourceSha256:documentHash,provenanceId:provenance.provenance_id,receiptId:receipt.receipt_id,issuerDocumentId:document.document_id,parserEvidenceId:link.evidence_id,manifestSha256:locator.manifest_sha256,...(issuerSource?{sourceKind:'approved_issuer_ir',issuerApproval:issuerSource.approval,originalFact:fact}:{}),knownAt:[provenance.recorded_at,link.created_at,receipt.completed_at,document.recorded_at,...(parser?[parser.recorded_at]:[]),...(issuerSource?[issuerSource.approval.approvedAt]:[])].map(String).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)});
    }
   }else if(/^(twse|tpex)-openapi:/u.test(sourceRef)){
    const job=rows.jobs.find((row)=>row.job_id===provenance.acquisition_job_id && row.stock_id===fact.stock_id && row.period_end===fact.period_end && row.status==='terminal' && row.terminal_reason==='complete' && row.response_sha256===provenance.source_sha256 && row.source_url===sourceUrl && ['created_at','updated_at','collected_at'].every((key)=>known(row[key],cutoff)));
    if(!job || !locator || locator.source_ref!==sourceRef || locator.period_end!==fact.period_end || locator.fact_key!==fact.fact_key)continue;
    candidates.push({factId:fact.fact_id,factRecordedAt:fact.recorded_at,sourceRef,sourceUrl,sourceSha256:provenance.source_sha256,provenanceId:provenance.provenance_id,acquisitionJobId:job.job_id,knownAt:[provenance.recorded_at,job.updated_at].map(String).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)});
   }
  }
  const sources=new Set(candidates.map((candidate)=>JSON.stringify([candidate.sourceUrl,candidate.sourceSha256])));
  if(sources.size!==1){reject(codecUnsupported?'approved_issuer_original_fact_codec_unsupported':rows.provenance.some((row)=>row.fact_id===fact.fact_id && !financialProviderSourceUrl(row.source_url))?'provider_official_host_source_unavailable':'immutable_source_receipt_missing_or_conflicting');continue;}
  const receipt:Row={...candidates.sort((a,b)=>inputHash(a).localeCompare(inputHash(b)))[0],classification:{estimateKind:fact.estimate_kind,estimateHorizon:fact.estimate_horizon,durationKind:fact.duration_kind,provider:fact.provider,authorityTier:fact.authority_tier}};receipts.push({...receipt,receiptHash:inputHash(receipt)});
  evidence.push({id:String(fact.fact_id),key:String(fact.fact_key),value:fact.value,unit:String(fact.unit),period:String(fact.period_end),source:String(receipt.sourceUrl),sourceTier:'official',kind:'fact',eventAt:String(fact.source_timestamp),availableAt:[String(fact.recorded_at),String(receipt.knownAt)].sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)!,contentHash:inputHash(fact)});
 }
 return {evidence,receipts,deferredCount:deferred.length,deferredDigest:inputHash(deferred),deferredDetails:deferred.slice(0,64),gaps:deferred.slice(0,64).map((row)=>`financial_source:${row.factId}:${row.reason}`),deferredDetailsTruncated:deferred.length>64};
}
/** Bounded cache reads only, called after the existing admitted attempt begins.
 * Original table grants/RLS and structural authority are unchanged. */
export async function resolveFinancialEvidenceSources(client:Pick<ReturnType<typeof getSupabaseServerClient>,'from'>,facts:Row[],cutoff:string){
 if(facts.length>2000)throw Error('vnext_financial_source_scope_unbounded');
 const read=async(table:string,columns:string,key:string,ids:unknown[],clocks:string[])=>{
  const selected=[...new Set(ids.filter((id):id is string=>typeof id==='string' && id.length>0))];const result:Row[]=[];
  for(let offset=0;offset<selected.length;offset+=200){let query=client.from(table).select(columns).in(key,selected.slice(offset,offset+200));for(const clock of clocks)query=query.lte(clock,cutoff);const response=await query.order(key).limit(1001);if(response.error || !response.data || response.data.length>1000)throw Error(`vnext_financial_source_read_failed:${table}`);result.push(...response.data as unknown as Row[]);}
  return result;
 };
 const ids=facts.map((fact)=>fact.fact_id);
 const provenance=await read('candidate_financial_fact_provenance_v4','provenance_id,fact_id,acquisition_job_id,issuer_document_id,source_url,source_sha256,locator,extracted_at,recorded_at','fact_id',ids,['extracted_at','recorded_at']);
 const links=await read('candidate_financial_document_fact_links_v8','receipt_id,fact_id,fact_recorded_at,evidence_id,created_at','fact_id',ids,['created_at']);
 const jobs=await read('candidate_financial_acquisition_jobs_v4','job_id,stock_id,period_end,status,terminal_reason,response_sha256,source_url,collected_at,created_at,updated_at','job_id',provenance.map((row)=>row.acquisition_job_id),['collected_at','created_at','updated_at']);
 const receipts=await read('candidate_financial_document_receipts_v6','receipt_id,stock_id,issuer_document_id,source_url,period_end,document_sha256,receipt_status,parser_status,published_at,accepted_at,completed_at,parser_evidence_id,financial_validation_status','receipt_id',links.map((row)=>row.receipt_id),['accepted_at','completed_at']);
 const documents=await read('candidate_issuer_ir_document_queue_v4','document_id,stock_id,document_url,document_sha256,acquisition_status,collected_at,recorded_at','document_id',receipts.map((row)=>row.issuer_document_id),['collected_at','recorded_at']);
 const irReceipts=receipts.filter(row=>!financialProviderSourceUrl(row.source_url));
 const issuerDomains=await read('candidate_issuer_document_domains_v6','stock_id,host,approved_at','stock_id',irReceipts.map(row=>row.stock_id),['approved_at']);
 const parserEvidence=await read('candidate_financial_parser_evidence_v8','evidence_id,receipt_id,document_sha256,manifest_sha256,recorded_at','evidence_id',irReceipts.map(row=>row.parser_evidence_id),['recorded_at']);
 return projectFinancialEvidenceSources(facts,{provenance,jobs,links,receipts,documents,issuerDomains,parserEvidence},cutoff);
}
