import type { VnextIdentity } from './auth.ts';
import type { Artifact, Evidence, Review } from './research.ts';
import type { ResearchProvider, ProviderOutcome, ProviderRequest } from './provider.ts';
import { normalizeWorkerAuthor, normalizeWorkerReview } from './worker-output.ts';
export type WorkerRow = Record<string, unknown>;
export type WorkerBinding = { identity: VnextIdentity; provider: 'openai-responses'; model: string; modelVersion: string; credentialIdentity: string; instructions: string; promptVersion: string };
export type WorkerDependencies = {
 author: WorkerBinding; reviewer: WorkerBinding; provider: ResearchProvider;
 journal(identity: VnextIdentity, action: string, body: WorkerRow): Promise<WorkerRow>;
 command(identity: VnextIdentity, action: string, body: WorkerRow): Promise<WorkerRow>;
 prepare(identity: VnextIdentity, body: WorkerRow): Promise<WorkerRow>;
 authorReceipt(identity: VnextIdentity, body: WorkerRow): Promise<WorkerRow>;
 reviewReceipt(identity: VnextIdentity, body: WorkerRow): Promise<WorkerRow>;
 publish(identity: VnextIdentity, body: WorkerRow): Promise<WorkerRow>;
 withWriterLease<T>(work: () => Promise<T>): Promise<T>;
};
function uncertain(stage: string) { return { status: 'uncertain', stage, recovery: 'explicit_read_required', reinvoke: false }; }
function matchesBinding(row: WorkerRow, binding: WorkerBinding) {
 return row.provider===binding.provider && row.model===binding.model && row.model_version===binding.modelVersion && row.credential_identity===binding.credentialIdentity && row.prompt_version===binding.promptVersion && row.instructions===binding.instructions;
}
function journalMatches(row: WorkerRow, binding: WorkerBinding) {
 return row.provider===binding.provider && row.model===binding.model && row.model_version===binding.modelVersion && row.credential_identity===binding.credentialIdentity && row.prompt_version===binding.promptVersion;
}
/** Trusted composition seam for VM fixtures and the fixed production adapter.
 * Never takes a provider, principal, model, URL or raw result from an HTTP body. */
export async function runResearchWorker(jobId: string, deps: WorkerDependencies, recovery = false): Promise<WorkerRow> {
 if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(jobId)) throw new Error('vnext_worker_job_id_invalid');
 if(deps.author.identity.role!=='author' || deps.reviewer.identity.role!=='reviewer' || deps.author.identity.principal===deps.reviewer.identity.principal) throw new Error('vnext_worker_distinct_identities_required');
 for (const binding of [deps.author,deps.reviewer]) if (!matchesBinding(await deps.journal(binding.identity,'binding',{}),binding)) throw new Error('vnext_worker_server_binding_mismatch');
 let state=await deps.journal(deps.author.identity,'inspect',{jobId});
 if(state.state==='published') return { status:'published',revisionId:state.revisionId,replay:true };
 if(['failed','rejected'].includes(String(state.state))) {
  if(recovery) return deps.withWriterLease(async()=> {
   for(const binding of [deps.author,deps.reviewer]) { const execution=binding.identity.role==='author'?state.executionId:state.reviewerExecutionId; if(!execution)continue;
    const record=await deps.journal(binding.identity,'read',{jobId,executionId:execution});
    if(record.invocation_id && ['dispatching','uncertain','pending'].includes(String(record.state)))return phase(binding,execution,false);
   } return {status:state.state,attemptConsumed:true,reinvoke:false};
  });
  return { status:state.state,attemptConsumed:true,reinvoke:false };
 }
 if(state.state==='queued') {
  if(recovery) return { status:'not_started',reinvoke:false };
  try { await deps.prepare(deps.author.identity,{jobId}); } catch { return uncertain('preparation'); }
  state=await deps.journal(deps.author.identity,'inspect',{jobId});
 }
 return deps.withWriterLease(async () => {
  if(state.state==='running') {
   if(state.prepared!==true) return uncertain('preparation');
   const authored=await phase(deps.author,state.executionId);
   if(authored.status!=='received') return authored;
   state=await deps.journal(deps.author.identity,'inspect',{jobId});
  }
  if(state.state==='authored') {
   if(recovery) return {status:'recovered_author',next:'resume_automatic_worker',reinvoke:false};
   try { await deps.command(deps.reviewer.identity,'review-claim',{jobId}); } catch { return uncertain('review_claim'); }
   state=await deps.journal(deps.reviewer.identity,'inspect',{jobId});
  }
  if(state.state!=='reviewing') return { status:state.state,reinvoke:false };
  if(state.review == null) {
   try { await deps.command(deps.reviewer.identity,'review-sources',{jobId,executionId:state.reviewerExecutionId}); } catch { return uncertain('review_original_sources'); }
   const reviewed=await phase(deps.reviewer,state.reviewerExecutionId);
   if(reviewed.status!=='received') return reviewed;
   state=await deps.journal(deps.reviewer.identity,'inspect',{jobId});
  }
  if((state.review as Review | null)?.approved!==true) return {status:'review_rejected',attemptConsumed:true,reinvoke:false};
  try { return {status:'published',...await deps.publish(deps.reviewer.identity,{jobId,inputHash:state.inputHash,executionId:state.reviewerExecutionId})}; }
  catch { return uncertain('publication_receipt'); }
 });
 async function phase(binding: WorkerBinding, executionId: unknown, allowReceipt=true): Promise<WorkerRow> {
  const body={jobId,executionId}; let record: WorkerRow;
  try { record=await deps.journal(binding.identity,recovery?'read':'reserve',body); } catch { return uncertain('provider_reservation'); }
  if(!record.invocation_id) return {status:recovery?'no_provider_invocation':'deferred',reason:record.deferred,reinvoke:false};
  if(!journalMatches(record,binding)) throw new Error('vnext_worker_immutable_provider_binding_changed');
  if(record.state==='failed') return {status:'failed',attemptConsumed:true,reinvoke:false};
  if(record.state==='completed' && !recovery) return {status:'recovery_required',stage:'immutable_output_receipt',reinvoke:false};
  if(record.state!=='completed') {
   let outcome: ProviderOutcome;
   if(recovery) {
    if(!record.provider_response_id) return uncertain('provider_lookup_identity_unavailable');
    // Lookup is a bounded READ. It does not extend the original execution or
    // authorize a late artifact/publication; SQL retains that deadline.
    try { outcome=await deps.provider.lookup(String(record.provider_response_id),new Date(Date.now()+30000).toISOString()); } catch { return uncertain('provider_lookup'); }
   } else {
    if(record.dispatch!==true) return uncertain('provider_existing_invocation');
    try { outcome=await deps.provider.invoke(record.frozen_request as ProviderRequest,String(record.invocation_id),String(record.deadline_at)); }
    catch { try { await deps.journal(binding.identity,'uncertain',{...body,invocationId:record.invocation_id}); } catch { /* reservation remains unresolved, never dispatch again */ } return uncertain('provider_transport'); }
   }
   if(outcome.status==='completed') {
    // Exact finite interface and the existing validators run before receipt.
    // Invalid completed output is a settled, consumed failure, never resampling.
    try {
     const frozen=JSON.parse((record.frozen_request as ProviderRequest).input) as { inputHash:string; evidence:{ evidence:Evidence[] }; authorArtifact?:Artifact };
     const evidence=frozen.evidence.evidence;
     if(binding.identity.role==='author') normalizeWorkerAuthor(outcome.output,binding,frozen.inputHash,evidence);
     else normalizeWorkerReview(outcome.output,binding.modelVersion,frozen.authorArtifact!,evidence);
    } catch(error) { outcome={status:'failed',responseId:outcome.responseId,raw:outcome.raw,reason:error instanceof Error?error.message:'provider_output_validation_failed'}; }
   }
   try { record=await deps.journal(binding.identity,'settle',{...body,invocationId:record.invocation_id,...outcome}); }
   catch { return uncertain('provider_settlement_receipt'); }
   if(record.state==='failed') return {status:'failed',attemptConsumed:true,reinvoke:false};
   if(record.state!=='completed') return uncertain('provider_pending');
  }
  if(!allowReceipt || Date.parse(String(record.deadline_at))<=Date.now()) return {status:'settled_after_execution_window',published:false,reinvoke:false};
  if(record.normalized_output==null) throw new Error('vnext_worker_normalized_output_missing');
  try {
   if(binding.identity.role==='author') await deps.authorReceipt(binding.identity,{...body,inputHash:record.input_hash,artifact:record.normalized_output});
   else await deps.reviewReceipt(binding.identity,{...body,inputHash:record.input_hash,review:record.normalized_output});
   return {status:'received'};
  } catch { return uncertain(binding.identity.role==='author'?'author_receipt':'review_receipt'); }
 }
}
