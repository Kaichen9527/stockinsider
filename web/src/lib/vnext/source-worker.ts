import { extractContentBatch,operatorPublicCitation,type PermittedContent } from './permitted-content.ts';
import { analysisCommand,analysisWriter } from './analysis-runtime.ts';
import type { VnextIdentity } from './auth.ts';
type Row=Record<string,unknown>;
export async function runPermittedSourceWorker(identity:VnextIdentity){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');const {sourceExecutionPolicy}=await import('../source-policy.ts');
 const client=getSupabaseServerClient();const cutoff=new Date().toISOString();const policies=await analysisCommand(identity,'source-policies',{});const enabled=(policies.policies||[]) as Row[];
 const items:PermittedContent[]=[];const coverage:Row[]=[];
 // Separate projections: never even SELECT a Telegram/InvestAnchors raw body.
 for(const source of ['ptt','official'] as const){
  const scope=source==='ptt'?'metadata':'official_original';const current=sourceExecutionPolicy(source==='ptt'?'ptt':'twse_insider');
  if(!enabled.some((p)=>p.source===source && p.scope===scope) || current.disposition!=='active'){coverage.push({source,status:'blocked',reason:'current_rights_binding_missing',fetched:null});continue;}
  const query=source==='official'
   ?client.from('source_raw_documents').select('id,platform,document_url,title,published_at,collected_at,symbols,publisher_key,metadata,content_text')
   :client.from('source_raw_documents').select('id,platform,document_url,title,published_at,collected_at,symbols,publisher_key,metadata');
  const read=await query.eq('platform',source==='ptt'?'ptt':'twse_insider')
   .gte('published_at',new Date(Date.parse(cutoff)-30*86400000).toISOString()).lte('collected_at',cutoff).order('published_at',{ascending:false}).limit(200);
  const health=await client.from('source_run_ledger').select('terminal_reason,attempted_at,succeeded_at,content_analyzable,license_basis').eq('connector',source==='ptt'?'ptt':'twse_insider').lte('attempted_at',cutoff).order('attempted_at',{ascending:false}).limit(1);
  if(read.error){coverage.push({source,status:'unavailable',reason:'cache_read_failed',fetched:null});continue;}
  const terminal=(health.data||[])[0] as Row|undefined;coverage.push({source,status:terminal && ['success','successful_empty','duplicate_only'].includes(String(terminal.terminal_reason))?'observed_cache':'health_gap',terminal:terminal?.terminal_reason||'source_run_missing',fetched:(read.data||[]).length,acquisitionAttempted:false});
  for(const row of (read.data||[]) as Row[]){const metadata=row.metadata as Row||{};if(source==='ptt' && metadata.retention_mode!=='metadata_link_only')continue;
   items.push({id:String(row.id),source,scope,url:String(row.document_url),eventAt:String(metadata.original_event_at||row.published_at||''),publishedAt:String(row.published_at||''),eventBasis:metadata.original_event_at?'original_event':'source_publication',availableAt:String(row.collected_at),symbols:Array.isArray(row.symbols)?row.symbols as string[]:[],
    authorRoot:source==='official'?'official:twse-tpex':'',originalRoot:source==='official'?String(row.document_url):'',...(source==='ptt'?{title:String(row.title)}:{body:String(row.content_text||'')})});
  }
 }
 const snapshotTransport=await(await import('./twse-snapshot-store.ts')).readTwseSnapshotCoverage(identity);
 return analysisWriter(async()=>({...await extractContentBatch(items,cutoff,(action,body)=>analysisCommand(identity,action,body)),coverage,snapshotTransport}));
}
export async function recordOperatorClaim(identity:VnextIdentity,body:Row){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 if(Object.keys(body).some((key)=>!['action','claim'].includes(key)) || !body.claim || typeof body.claim!=='object' || Array.isArray(body.claim))throw new Error('vnext_operator_claim_closed_shape');
 const claim=body.claim as PermittedContent;
 if(claim.scope!=='operator_claim')throw new Error('vnext_operator_claim_scope_required');
 const url=operatorPublicCitation(claim.url);if(!url)throw new Error('vnext_operator_public_citation_required');
 const now=new Date().toISOString();const bound={...claim,url,eventBasis:'operator_attested' as const,originalRoot:url,authorRoot:`operator:${identity.principal}`,availableAt:now};
 return analysisWriter(()=>extractContentBatch([bound],now,(action,input)=>analysisCommand(identity,action,input)));
}
