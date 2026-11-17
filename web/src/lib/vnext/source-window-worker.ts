import {extractContentBatch,type PermittedContent} from './permitted-content.ts';
import {projectCachedSourceAdmission,summarizeCachedSourceAdmissions,type CachedSourceAdmission} from './cached-source-admission.ts';
import {inputHash,vnextEnabled} from './policy.ts';
import {analysisCommand,analysisWriter} from './analysis-runtime.ts';
import type {VnextIdentity} from './auth.ts';
type Row=Record<string,unknown>;
const VERSION='vnext-cache-keyset-v1',PAGE=200,DAY=86400000;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v);
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v)&&Number.isFinite(Date.parse(v));
// Retain actual PostgreSQL microseconds across cursor ties; Date.parse alone
// truncates these to milliseconds and can reject a valid descending page.
const precise=(v:string)=>BigInt(Date.parse(v))*BigInt(1000000)+BigInt((/\.(\d+)/u.exec(v)?.[1]||'').padEnd(9,'0').slice(3));
const object=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Row,expected:string)=>Object.keys(v).sort().join('|')===expected.split(' ').sort().join('|');
type Source='official'|'ptt';
type Cursor={publishedAt:string;id:string};
type Progress={schemaVersion:typeof VERSION;source:Source;principal:string;rightsHash:string;cycleCutoff:string;cursor:Cursor|null;finished:boolean;enumerated:number;accounted:number;acquisitionAttempted:false;eventCoverage:'unknown';eventVolume:null};
function previousProgress(value:unknown,source:Source,principal:string,rightsHash:string,now:string):Progress|null{
 if(value===undefined)return null;
 if(!object(value)||!keys(value,'schemaVersion source principal rightsHash cycleCutoff cursor finished enumerated accounted acquisitionAttempted eventCoverage eventVolume')||value.schemaVersion!==VERSION||value.source!==source||value.principal!==principal||typeof value.rightsHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.rightsHash)||!instant(value.cycleCutoff)||Date.parse(value.cycleCutoff)>Date.parse(now)||typeof value.finished!=='boolean'||!Number.isSafeInteger(value.enumerated)||!Number.isSafeInteger(value.accounted)||Number(value.enumerated)<0||Number(value.enumerated)>PAGE||Number(value.accounted)<0||Number(value.accounted)>Number(value.enumerated)||value.acquisitionAttempted!==false||value.eventCoverage!=='unknown'||value.eventVolume!==null)throw Error('vnext_cache_progress_invalid');
 const cursor=value.cursor;
 if(cursor!==null&&(!object(cursor)||!keys(cursor,'publishedAt id')||!instant(cursor.publishedAt)||!uuid(cursor.id)||Date.parse(cursor.publishedAt)>Date.parse(value.cycleCutoff)||Date.parse(cursor.publishedAt)<Date.parse(value.cycleCutoff)-30*DAY))throw Error('vnext_cache_progress_invalid');
 if(value.finished&&cursor!==null)throw Error('vnext_cache_progress_invalid');
 // A changed current rights tuple or expired cache cycle starts a new cache
 // pass. Neither resets extraction receipts/budgets nor asserts source coverage.
 if(value.rightsHash!==rightsHash||value.finished||Date.parse(value.cycleCutoff)<Date.parse(now)-30*DAY)return null;
 return structuredClone(value) as Progress;
}
/** Current server composition only: fixed permitted cache feeds, durable progress
 * in the existing run ledger and the original shared extraction authority.
 * This enumerates a bounded cached window, never an exhaustive upstream feed. */
export async function runSourceWindowWorker(identity:VnextIdentity){
 if(identity.role!=='operator')throw Error('vnext_operator_required');
 if(!vnextEnabled())throw Error('vnext_source_window_disabled');
 return analysisWriter(async()=>{
  const {getSupabaseServerClient}=await import('../supabase-server.ts');const {sourceExecutionPolicy}=await import('../source-policy.ts');const client=getSupabaseServerClient();const now=new Date().toISOString();
  const policies=await analysisCommand(identity,'source-policies',{});if(!Array.isArray(policies.policies))throw Error('vnext_source_policies_shape');
  const pages:Array<{source:Source;rightsHash:string;cycleCutoff:string;prior:Progress|null;rows:Row[];connector:string;policy:ReturnType<typeof sourceExecutionPolicy>}>=[];const contents:PermittedContent[]=[],accounted=new Set<string>();const coverage:Row[]=[];const admissions:CachedSourceAdmission[]=[];
  for(const source of ['ptt','official'] as const){
   const scope=source==='ptt'?'metadata':'official_original',platform=source==='ptt'?'ptt':'twse_insider',policy=sourceExecutionPolicy(platform);
   const matches=(policies.policies as Row[]).filter(p=>p.source===source&&p.scope===scope);if(matches.length>1)throw Error('vnext_source_policy_conflict');
   const current=matches[0];if(!current||policy.disposition!=='active'){coverage.push({source,status:'blocked',reason:'current_rights_binding_missing',eventCoverage:'unknown',eventVolume:null,acquisitionAttempted:false});continue;}
   if(current.enabled!==true||typeof current.rights_subject!=='string'||!current.rights_subject||typeof current.license_basis!=='string'||!current.license_basis||!instant(current.valid_until)||Date.parse(current.valid_until)<=Date.parse(now))throw Error('vnext_source_policy_shape');
   const rightsHash=inputHash({source,scope,rightsSubject:current.rights_subject,licenseBasis:current.license_basis,validUntil:current.valid_until}),connector='vnext-cache-'+source;
   const read=await client.from('source_run_ledger').select('id,attempted_at,metadata').eq('connector',connector).eq('parser_version',VERSION).lte('attempted_at',now).order('attempted_at',{ascending:false}).order('id',{ascending:false}).limit(2);
   if(read.error||!Array.isArray(read.data))throw Error('vnext_cache_progress_unavailable');
   const history=read.data as Row[];if(history.length>2||history.some(r=>!uuid(r.id)||!instant(r.attempted_at)))throw Error('vnext_cache_progress_invalid');
   if(history.length===2&&history[0].attempted_at===history[1].attempted_at&&inputHash(history[0].metadata)!==inputHash(history[1].metadata))throw Error('vnext_cache_progress_conflict');
   const prior=previousProgress(history[0]?.metadata,source,identity.principal,rightsHash,now),cycleCutoff=prior?.cycleCutoff||now;
   const select=()=>source==='official'?client.from('source_raw_documents').select('id,document_url,title,published_at,collected_at,symbols,canonical_content_hash,metadata,content_text'):client.from('source_raw_documents').select('id,document_url,title,published_at,collected_at,symbols,canonical_content_hash,metadata');
   let query=select().eq('platform',platform).gte('published_at',new Date(Date.parse(cycleCutoff)-30*DAY).toISOString()).lte('published_at',cycleCutoff).lte('collected_at',cycleCutoff);
   if(prior?.cursor){const cursor=prior.cursor;query=query.or(`published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`);}
   const page=await query.order('published_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
   if(page.error||!Array.isArray(page.data))throw Error('vnext_cache_window_unavailable');const rows=page.data as unknown as Row[];
   if(rows.length>PAGE||Buffer.byteLength(JSON.stringify(rows))>4*1024*1024)throw Error('vnext_cache_window_bound');
   let last:Cursor|null=prior?.cursor||null;
   for(const row of rows){
    if(!uuid(row.id)||!instant(row.published_at)||!instant(row.collected_at)||precise(row.published_at)>precise(row.collected_at)||precise(row.collected_at)>precise(cycleCutoff)||Date.parse(row.published_at)<Date.parse(cycleCutoff)-30*DAY)throw Error('vnext_cache_window_row');
    if(last&&(precise(row.published_at)>precise(last.publishedAt)||precise(row.published_at)===precise(last.publishedAt)&&row.id>=last.id))throw Error('vnext_cache_window_order');last={publishedAt:row.published_at,id:row.id};
    const projection=projectCachedSourceAdmission(row,source,now,cycleCutoff);admissions.push(projection.evidence);
    if(projection.item)contents.push(projection.item);else accounted.add(row.id);
   }
   pages.push({source,rightsHash,cycleCutoff,prior,rows,connector,policy});
  }
  const hashes=new Map<string,string[]>(),sourcesByHash=new Map<string,Source>();const cacheLineage:Row[]=[];
  for(const evidence of admissions){
   const contentHash=evidence.contentHash;
   if(contentHash){hashes.set(contentHash,[...(hashes.get(contentHash)||[]),evidence.rawDocumentId]);sourcesByHash.set(contentHash,evidence.source);}
   // These are frozen cache input versions, not a current publisher revision.
   // The existing raw cache does not retain publisher revision authority and
   // acquisition time must never manufacture one, even after a complete pass.
   cacheLineage.push({rawDocumentId:evidence.rawDocumentId,source:evidence.source,cutoff:now,cacheCycleCutoff:evidence.cacheCycleCutoff,eventAt:evidence.eventAt,publishedAt:evidence.publishedAt,availableAt:evidence.availableAt,contentHash,sourceRevision:null,gaps:['publisher_revision_not_recorded_in_cache'],cacheAdmission:evidence});
  }
  const assertCurrentRights=async(source:Source)=>{
   const page=pages.find(page=>page.source===source);if(!page)throw Error('vnext_cache_source_binding_missing');
   const current=await analysisCommand(identity,'source-policies',{}),checkedAt=new Date().toISOString();
   if(!Array.isArray(current.policies))throw Error('vnext_source_policies_shape');
   const scope=source==='ptt'?'metadata':'official_original',matches=(current.policies as Row[]).filter(policy=>policy.source===source&&policy.scope===scope);
   if(matches.length>1)throw Error('vnext_source_policy_conflict');
   const binding=matches[0];
   if(!binding||binding.enabled!==true||!instant(binding.valid_until)||precise(binding.valid_until)<=precise(checkedAt)||inputHash({source,scope,rightsSubject:binding.rights_subject,licenseBasis:binding.license_basis,validUntil:binding.valid_until})!==page.rightsHash)throw Error('vnext_source_rights_changed_during_scan');
  };
  const extraction=await extractContentBatch(contents,now,async(action,body)=>{
   const source=action==='source-reserve'?(body.item as Row).source:sourcesByHash.get(String(body.contentHash));
   if(source!=='ptt'&&source!=='official')throw Error('vnext_cache_source_binding_missing');
   // Replays can precede policy checking in the existing reserve RPC. Re-read
   // rights before both replay/reservation and completion, without retrying an
   // uncertain command. The SQL remains the final atomic completion authority.
   await assertCurrentRights(source);
   const result=await analysisCommand(identity,action,body);
   // A completed replay may have been returned after the permission changed.
   // Such a read must not account the page or advance durable progress.
   await assertCurrentRights(source);
   if(action==='source-reserve'){
    const item=body.item as Row,hash=String(item.contentHash);
    // A replay proves idempotency, not extraction completion. Reserved/failed
    // receipts hold this page without another parse/completion attempt.
    if((result.replay===true||result.parse===true)&&result.contentHash!==hash)throw Error('vnext_cache_receipt_hash_mismatch');
    if((result.replay===true&&result.state==='completed')||result.deferred==='source_content_withdrawn')for(const id of hashes.get(hash)||[])accounted.add(id);
   }else if(action==='source-complete'&&result.parsed===true){
    if(result.contentHash!==body.contentHash)throw Error('vnext_cache_receipt_hash_mismatch');
    for(const id of hashes.get(String(body.contentHash))||[])accounted.add(id);
   }
   return result;
  });
  extraction.rejected.push(...admissions.filter(row=>row.reason!==null).map(row=>({id:row.rawDocumentId,reason:row.reason!})));
  for(const rejected of extraction.rejected)accounted.add(rejected.id);
  // Complete extraction before appending progress. An uncertain completion or
  // ledger append propagates once; no internal retry or new reservation loop.
  for(const page of pages){
   // Also cover empty pages and permission changes after the last receipt.
   // This is a conservative caller check; it is not an atomic withdrawal gate.
   await assertCurrentRights(page.source);
   const complete=page.rows.every(row=>accounted.has(String(row.id))),finished=complete&&page.rows.length<PAGE;
   const tail=page.rows.at(-1);const cursor=complete?(finished?null:{publishedAt:String(tail!.published_at),id:String(tail!.id)}):page.prior?.cursor||null;
   const progress:Progress={schemaVersion:VERSION,source:page.source,principal:identity.principal,rightsHash:page.rightsHash,cycleCutoff:page.cycleCutoff,cursor,finished,enumerated:page.rows.length,accounted:page.rows.filter(row=>accounted.has(String(row.id))).length,acquisitionAttempted:false,eventCoverage:'unknown',eventVolume:null};
   const row={connector:page.connector,expected_at:now,attempted_at:now,succeeded_at:null,fetched:page.rows.length,matched:0,new_count:0,duplicate:0,written:0,auth_status:'not_applicable',terminal_reason:'partial',terminal_detail:finished?'cached_window_enumerated_upstream_coverage_unknown':complete?'cached_page_accounted_next_page_pending':'cached_page_held_unaccounted_or_budget_limited',parser_version:VERSION,license_basis:page.policy.licenseBasis,source_disposition:page.policy.disposition,next_expected_at:null,metadata:progress,index_updated:false,content_analyzable:false,valid_matches:0};
   const saved=await client.from('source_run_ledger').insert(row);if(saved.error)throw Error('vnext_cache_progress_write_outcome_uncertain',{cause:saved.error});
   coverage.push({source:page.source,status:finished?'cached_window_enumerated':'cached_window_partial',enumerated:progress.enumerated,accounted:progress.accounted,pageAdvanced:complete&&!finished,cycleCutoff:page.cycleCutoff,progressHash:inputHash(progress),eventCoverage:'unknown',eventVolume:null,acquisitionAttempted:false,reason:row.terminal_detail});
  }
  const snapshotTransport=await(await import('./twse-snapshot-store.ts')).readTwseSnapshotCoverage(identity);
  return {...extraction,coverage,cacheLineage,sourceAdmissions:summarizeCachedSourceAdmissions(admissions),snapshotTransport,cacheScanVersion:VERSION,upstreamCoverage:'unknown',eventVolume:null};
 });
}
