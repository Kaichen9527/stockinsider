import { createHash } from 'node:crypto';
import { vnextEnabled } from './policy.ts';
import { openAiResponsesProvider, providerCredentialIdentity } from './provider.ts';
import { AUTHOR_INSTRUCTIONS, REVIEWER_INSTRUCTIONS,serverWorkerPromptProfile } from './worker-prompts.ts';
import { runResearchWorker, type WorkerDependencies, type WorkerBinding, type WorkerRow } from './worker-core.ts';
function serverBindings() {
 const profile=serverWorkerPromptProfile();
 const key=process.env.OPENAI_API_KEY;
 if(!key) throw new Error('vnext_provider_credential_missing');
 const configured = (role: 'author'|'reviewer',instructions:string):WorkerBinding => {
  const prefix=`STOCKINSIDER_VNEXT_${role.toUpperCase()}`;
  const principal=process.env[`${prefix}_PRINCIPAL`]; const model=process.env[`${prefix}_MODEL`]; const version=process.env[`${prefix}_MODEL_VERSION`];
  if(!principal || !model || !version || !process.env[`${prefix}_KEY`] || !/^[A-Za-z0-9_.:/-]{1,160}$/u.test(model) || !/^[A-Za-z0-9_.:/-]{1,160}$/u.test(version)) throw new Error(`vnext_${role}_provider_binding_missing`);
  return {identity:{principal,role},provider:'openai-responses',model,modelVersion:version,credentialIdentity:providerCredentialIdentity(key),instructions,promptVersion:profile.version};
 };
 return {key,author:configured('author',profile.author),reviewer:configured('reviewer',profile.reviewer)};
}
/** Only jobId and an explicit recovery operation cross the HTTP seam. Provider,
 * model, instructions and principals are server config + enabled DB bindings. */
async function run(jobId:string,recovery:boolean) {
 if(!vnextEnabled()) throw new Error('vnext_worker_disabled');
 const config=serverBindings();
 const { getSupabaseServerClient }=await import('../supabase-server.ts');
 const store=await import('./store.ts');
 const journal:WorkerDependencies['journal']=async(identity,action,body) => {
  const result=await getSupabaseServerClient().rpc('vnext_provider_command_v1',{p_principal:identity.principal,p_command:action,p_request:body});
  if(result.error) throw new Error(`vnext_provider_authority_rejected:${result.error.message}`);
  if(!result.data || typeof result.data!=='object') throw new Error('vnext_provider_receipt_missing');
  return result.data as WorkerRow;
 };
 const withWriterLease:WorkerDependencies['withWriterLease']=async(work) => {
  const { requireActiveVpsWriter }=await import('../taiwan-data-runtime.ts');
  const { acquireProductionWriteLease,releaseProductionWriteLease }=await import('../production-write-lease.ts');
  const writer=await requireActiveVpsWriter(); if(!writer.ok) throw new Error(writer.error);
  const lease=await acquireProductionWriteLease(300); if(!lease) throw new Error('production_write_cycle_already_running');
  try { return await work(); } finally { await releaseProductionWriteLease(lease); }
 };
 return runResearchWorker(jobId,{author:config.author,reviewer:config.reviewer,provider:openAiResponsesProvider(config.key),journal,command:store.command,prepare:store.executeResearch,
  authorReceipt:store.submitAuthor,reviewReceipt:store.submitReview,publish:store.publishResearch,withWriterLease},recovery);
}
export async function runAutomaticResearch(jobId:string) { return run(jobId,false); }
export async function recoverAutomaticResearch(jobId:string) { return run(jobId,true); }
/** Source-derived, non-secret fixture/bootstrap metadata. No identity or key is
 * invented here; operators separately provision actual enabled binding rows. */
export const WORKER_PROMPT_HASHES={author:createHash('sha256').update(AUTHOR_INSTRUCTIONS).digest('hex'),reviewer:createHash('sha256').update(REVIEWER_INSTRUCTIONS).digest('hex')};
