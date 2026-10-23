import type { VnextIdentity } from './auth.ts';
import { thesisCommand } from './thesis-runtime.ts';
import { analysisWriter } from './analysis-runtime.ts';
type Row=Record<string,unknown>;
export async function dispatchAdmittedQueue(deps:{context():Promise<Row>;retry(jobId:string):Promise<Row>;run(jobId:string):Promise<Row>}){
 const context=await deps.context();const jobs=((context.queued||[]) as Row[]).map((j)=>String(j.job_id));const retries:Row[]=[];
 // SQL returns only definite settled 429 failures, attempt zero, no existing
 // retry and no unresolved invocation. The original retry RPC owns all charging.
 for(const failed of (context.transientFailures||[]) as Row[]){const receipt=await deps.retry(String(failed.job_id));retries.push(receipt);if(receipt.jobId)jobs.push(String(receipt.jobId));}
 const results=[];for(const jobId of [...new Set(jobs)].slice(0,4))results.push({jobId,result:await deps.run(jobId)});
 return {results,retries,scheduleEnabled:false};
}
export async function dispatchResearchQueue(identity:VnextIdentity){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {command}=await import('./store.ts');const {runAutomaticResearch}=await import('./automatic-worker.ts');
 return dispatchAdmittedQueue({context:()=>thesisCommand(identity,'dispatch-context',{}),retry:(jobId)=>analysisWriter(()=>command(identity,'retry',{jobId})),run:runAutomaticResearch});
}
