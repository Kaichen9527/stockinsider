import {extractContentBatch,permittedContentFingerprint,type PermittedContent} from './permitted-content.ts';
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
  const pages:Array<{source:Source;rightsHash:string;cycleCutoff:string;prior:Progress|null;rows:Row[];connector:string;policy:ReturnType<typeof sourceExecutionPolicy>}>=[];const contents:PermittedContent[]=[],accounted=new Set<string>();const coverage:Row[]=[];
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
   const select=()=>source==='official'?client.from('source_raw_documents').select('id,document_url,title,published_at,collected_at,symbols,metadata,content_text'):client.from('source_raw_documents').select('id,document_url,title,published_at,collected_at,symbols,metadata');
   let query=select().eq('platform',platform).gte('published_at',new Date(Date.parse(cycleCutoff)-30*DAY).toISOString()).lte('published_at',cycleCutoff).lte('collected_at',cycleCutoff);
   if(prior?.cursor){const cursor=prior.cursor;query=query.or(`published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`);}
   const page=await query.order('published_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
   if(page.error||!Array.isArray(page.data))throw Error('vnext_cache_window_unavailable');const rows=page.data as unknown as Row[];
   if(rows.length>PAGE||Buffer.byteLength(JSON.stringify(rows))>4*1024*1024)throw Error('vnext_cache_window_bound');
   let last:Cursor|null=prior?.cursor||null;
   for(const row of rows){
    if(!uuid(row.id)||!instant(row.published_at)||!instant(row.collected_at)||precise(row.published_at)>precise(row.collected_at)||precise(row.collected_at)>precise(cycleCutoff)||Date.parse(row.published_at)<Date.parse(cycleCutoff)-30*DAY)throw Error('vnext_cache_window_row');
    if(last&&(precise(row.published_at)>precise(last.publishedAt)||precise(row.published_at)===precise(last.publishedAt)&&row.id>=last.id))throw Error('vnext_cache_window_order');last={publishedAt:row.published_at,id:row.id};
    const metadata=object(row.metadata)?row.metadata:{};
    if(source==='ptt'&&metadata.retention_mode!=='metadata_link_only'){accounted.add(row.id);continue;}
    contents.push({id:row.id,source,scope,url:String(row.document_url),eventAt:String(metadata.original_event_at||row.published_at),publishedAt:row.published_at,eventBasis:metadata.original_event_at?'original_event':'source_publication',availableAt:row.collected_at,symbols:Array.isArray(row.symbols)?row.symbols as string[]:[],authorRoot:source==='official'?'official:twse-tpex':'',originalRoot:source==='official'?String(row.document_url):'',...(source==='ptt'?{title:String(row.title)}:{body:String(row.content_text||'')})});
   }
   pages.push({source,rightsHash,cycleCutoff,prior,rows,connector,policy});
  }
  const hashes=new Map<string,string[]>();
  for(const item of contents){try{const hash=permittedContentFingerprint(item,now);hashes.set(hash,[...(hashes.get(hash)||[]),item.id]);}catch{/* The original batch returns the exact validation rejection. */}}
  const extraction=await extractContentBatch(contents,now,async(action,body)=>{
   const result=await analysisCommand(identity,action,body);
   if(action==='source-reserve'){
    const item=body.item as Row,hash=String(item.contentHash);
    if(result.replay===true||result.deferred==='source_content_withdrawn')for(const id of hashes.get(hash)!)accounted.add(id);
   }else if(action==='source-complete'&&result.parsed===true)for(const id of hashes.get(String(body.contentHash))||[])accounted.add(id);
   return result;
  });
  for(const rejected of extraction.rejected)accounted.add(rejected.id);
  // Complete extraction before appending progress. An uncertain completion or
  // ledger append propagates once; no internal retry or new reservation loop.
  for(const page of pages){
   const complete=page.rows.every(row=>accounted.has(String(row.id))),finished=complete&&page.rows.length<PAGE;
   const tail=page.rows.at(-1);const cursor=complete?(finished?null:{publishedAt:String(tail!.published_at),id:String(tail!.id)}):page.prior?.cursor||null;
   const progress:Progress={schemaVersion:VERSION,source:page.source,principal:identity.principal,rightsHash:page.rightsHash,cycleCutoff:page.cycleCutoff,cursor,finished,enumerated:page.rows.length,accounted:page.rows.filter(row=>accounted.has(String(row.id))).length,acquisitionAttempted:false,eventCoverage:'unknown',eventVolume:null};
   const row={connector:page.connector,expected_at:now,attempted_at:now,succeeded_at:null,fetched:page.rows.length,matched:0,new_count:0,duplicate:0,written:0,auth_status:'not_applicable',terminal_reason:'partial',terminal_detail:finished?'cached_window_enumerated_upstream_coverage_unknown':complete?'cached_page_accounted_next_page_pending':'cached_page_held_unaccounted_or_budget_limited',parser_version:VERSION,license_basis:page.policy.licenseBasis,source_disposition:page.policy.disposition,next_expected_at:null,metadata:progress,index_updated:false,content_analyzable:false,valid_matches:0};
   const saved=await client.from('source_run_ledger').insert(row);if(saved.error)throw Error('vnext_cache_progress_write_outcome_uncertain',{cause:saved.error});
   coverage.push({source:page.source,status:finished?'cached_window_enumerated':'cached_window_partial',enumerated:progress.enumerated,accounted:progress.accounted,pageAdvanced:complete&&!finished,cycleCutoff:page.cycleCutoff,progressHash:inputHash(progress),eventCoverage:'unknown',eventVolume:null,acquisitionAttempted:false,reason:row.terminal_detail});
  }
  const snapshotTransport=await(await import('./twse-snapshot-store.ts')).readTwseSnapshotCoverage(identity);
  return {...extraction,coverage,snapshotTransport,cacheScanVersion:VERSION,upstreamCoverage:'unknown',eventVolume:null};
 });
}
