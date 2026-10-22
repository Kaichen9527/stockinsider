import assert from 'node:assert/strict';
import test from 'node:test';
import { inputHash } from './policy.ts';
import { normalizeWorkerAuthor, normalizeWorkerReview, assertWorkerJsonCodec } from './worker-output.ts';
import { validateArtifact, validateReview, REQUIRED_SECTIONS, type Artifact, type Evidence } from './research.ts';
import { runResearchWorker, type WorkerDependencies, type WorkerBinding, type WorkerRow } from './worker-core.ts';
import { openAiResponsesProvider, ProviderOutcomeUncertain, type ProviderRequest } from './provider.ts';
import { AUTHOR_INSTRUCTIONS, REVIEWER_INSTRUCTIONS, WORKER_PROMPT_VERSION } from './worker-prompts.ts';
const author:WorkerBinding={identity:{role:'author',principal:'synthetic-author'},provider:'openai-responses',model:'synthetic-author-model',modelVersion:'synthetic-version',credentialIdentity:'a'.repeat(64),instructions:AUTHOR_INSTRUCTIONS,promptVersion:WORKER_PROMPT_VERSION};
const reviewer:WorkerBinding={...author,identity:{role:'reviewer',principal:'synthetic-reviewer'},model:'synthetic-reviewer-model',instructions:REVIEWER_INSTRUCTIONS};
const evidence:Evidence[]=[{id:'00000000-0000-4000-8000-000000000099',key:'annual_eps',value:4,unit:'TWD/share',period:'2025',contentHash:inputHash('synthetic original fact'),source:'https://mops.twse.com.tw/synthetic-protocol-fixture',sourceTier:'official',kind:'fact',eventAt:'2026-10-20T01:00:00Z',availableAt:'2026-10-20T02:00:00Z'}];
const rawAuthor=()=>({sections:Object.fromEntries(REQUIRED_SECTIONS.map((name)=>[name,{text:'Synthetic protocol fixture; no real substantive research is asserted.',evidenceIds:[evidence[0].id],claimIds:['synthetic-eps']} ])),claims:[{id:'synthetic-eps',text:'Synthetic EPS is four.',kind:'fact',evidenceIds:[evidence[0].id],numeric:{value:4,unit:'TWD/share',period:'2025',key:'annual_eps'}}],quoteDate:'2026-10-20',valuationDate:'2026-10-20',annualEps:4,nextFourQuarterEps:null,gaps:['next_four_quarter_eps_missing','synthetic_fixture_not_formal_research']});
function rawReview(artifact:Artifact) { return {approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:artifact.claims.map((claim)=>({claimId:claim.id,verdict:'supported',reason:'Synthetic transport response only; no formal semantic approval.',sources:claim.evidenceIds.map((id)=>({id,contentHash:evidence.find((e)=>e.id===id)!.contentHash}))}))}; }
function fixture() {
 const states=new Map<string,WorkerRow>(); const records=new Map<string,WorkerRow>(); const calls:Array<{id:string;request:ProviderRequest}>=[]; let sequence=0; let uncertainProvider=false; let unknownAuthorReceipt=false; let unknownSettlement=false; let pendingProvider=false; let lookups=0;
 const state=(id:string)=>{let row=states.get(id);if(!row){row={jobId:id,state:'queued',inputHash:inputHash(id),executionId:`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,prepared:false};states.set(id,row);}return row;};
 const deps:WorkerDependencies={author,reviewer,withWriterLease:async(work)=>work(),
  journal:async(identity,action,body)=>{
   const binding=identity.role==='author'?author:reviewer;
   if(action==='binding')return {provider:binding.provider,model:binding.model,model_version:binding.modelVersion,credential_identity:binding.credentialIdentity,prompt_version:binding.promptVersion,instructions:binding.instructions};
   const job=state(String(body.jobId));if(action==='inspect')return {...job};
   const key=`${body.jobId}:${identity.role}`;let record=records.get(key);
   if(action==='read')return record?{...record,dispatch:false}:{};
   if(action==='reserve'){
    if(record)return {...record,dispatch:false};
    const snapshot={inputHash:job.inputHash,evidence:{evidence},...(identity.role==='reviewer'?{authorArtifact:job.authorArtifact}:{})};
    record={invocation_id:`synthetic-invocation-${++sequence}`,job_id:body.jobId,state:'dispatching',execution_id:body.executionId,input_hash:job.inputHash,provider:binding.provider,model:binding.model,model_version:binding.modelVersion,credential_identity:binding.credentialIdentity,prompt_version:binding.promptVersion,deadline_at:new Date(Date.now()+120000).toISOString(),frozen_request:{model:binding.model,instructions:binding.instructions,input:JSON.stringify(snapshot),store:true,max_output_tokens:8000,text:{format:{type:'json_object'}}}};
    records.set(key,record);return {...record,dispatch:true};
   }
   assert.ok(record);if(action==='uncertain'){record.state='uncertain';return {...record};}
   assert.equal(action,'settle');record.state=body.status;record.provider_response_id=body.responseId;record.raw_response=body.raw;
   if(body.status==='completed') record.normalized_output=identity.role==='author'?normalizeWorkerAuthor(body.output,binding,String(job.inputHash),evidence):normalizeWorkerReview(body.output,binding.modelVersion,job.authorArtifact as Artifact,evidence);
   if(body.status==='failed')job.state='failed';
   if(unknownSettlement){unknownSettlement=false;throw Error('synthetic committed settlement response lost');}
   return {...record};
  },
  command:async(_identity,action,body)=>{const job=state(String(body.jobId));if(action==='review-claim'){job.state='reviewing';job.reviewerExecutionId=`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;assert.notEqual(job.executionId,job.reviewerExecutionId);}else assert.equal(action,'review-sources');return {...job};},
  prepare:async(_identity,body)=>{const job=state(String(body.jobId));job.state='running';job.prepared=true;return {...job};},
  authorReceipt:async(_identity,body)=>{const job=state(String(body.jobId));assert.equal(validateArtifact(body.artifact,evidence,String(job.inputHash)).valid,true);job.authorArtifact=body.artifact;job.state='authored';if(unknownAuthorReceipt){unknownAuthorReceipt=false;throw Error('synthetic committed author response lost');}return {authored:true};},
  reviewReceipt:async(_identity,body)=>{const job=state(String(body.jobId));assert.deepEqual(validateReview(body.review as Parameters<typeof validateReview>[0],job.authorArtifact as Artifact,evidence),[]);job.review=body.review;return {reviewRecorded:true};},
  publish:async(_identity,body)=>{const job=state(String(body.jobId));job.state='published';job.revisionId=`synthetic-revision-${body.jobId}`;return {revisionId:job.revisionId,published:true};},
  provider:{invoke:async(request,id)=>{calls.push({id,request});if(uncertainProvider)throw new ProviderOutcomeUncertain('synthetic network uncertainty');if(pendingProvider)return {status:'pending',responseId:`resp_synthetic${calls.length}`,raw:{synthetic:true}};const snapshot=JSON.parse(request.input);assert.deepEqual(snapshot.evidence.evidence,evidence);return {status:'completed',responseId:`resp_synthetic${calls.length}`,raw:{synthetic:true},output:request.model===author.model?rawAuthor():rawReview(snapshot.authorArtifact)};},lookup:async(id)=>{lookups++;if(!pendingProvider)throw new ProviderOutcomeUncertain('synthetic no lookup identity');return {status:'completed',responseId:id,raw:{synthetic:true,lookup:true},output:rawAuthor()};}},
 };
 return {deps,calls,states,records,setUncertain:()=>{uncertainProvider=true;},loseAuthorReceipt:()=>{unknownAuthorReceipt=true;},loseSettlement:()=>{unknownSettlement=true;},setPending:()=>{pendingProvider=true;},lookups:()=>lookups,expireInvocation:()=>{for(const record of records.values())record.deadline_at='2000-01-01T00:00:00Z';}};
}
const job=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
test('automatic two-issuer synthetic worker calls author/reviewer, original evidence, durable receipts, no replay resampling',async()=>{
 const f=fixture();for(const id of [job(1),job(2)])assert.equal((await runResearchWorker(id,f.deps)).status,'published');
 assert.equal(f.calls.length,4);assert.equal(new Set(f.calls.map((c)=>c.id)).size,4);assert.deepEqual(f.calls.map((c)=>c.request.model),[author.model,reviewer.model,author.model,reviewer.model]);
 assert.equal((await runResearchWorker(job(1),f.deps)).status,'published');assert.equal(f.calls.length,4);
});
test('unknown provider outcome is held and repeated worker/recovery never generates another output',async()=>{
 const f=fixture();f.setUncertain();assert.equal((await runResearchWorker(job(3),f.deps)).status,'uncertain');
 assert.equal((await runResearchWorker(job(3),f.deps)).status,'uncertain');assert.equal((await runResearchWorker(job(3),f.deps,true)).status,'uncertain');assert.equal(f.calls.length,1);
 assert.equal([...f.records.values()][0].state,'uncertain');
});
test('committed settlement response loss needs explicit read before receipt, never another provider call',async()=>{
 const f=fixture();f.loseSettlement();assert.equal((await runResearchWorker(job(4),f.deps)).status,'uncertain');
 assert.equal((await runResearchWorker(job(4),f.deps)).status,'recovery_required');assert.equal(f.calls.length,1);
 assert.equal((await runResearchWorker(job(4),f.deps,true)).status,'recovered_author');assert.equal(f.calls.length,1);
 assert.equal((await runResearchWorker(job(4),f.deps)).status,'published');assert.equal(f.calls.length,2);
});
test('committed author receipt loss resolves by actual job read with no author re-invocation',async()=>{
 const f=fixture();f.loseAuthorReceipt();assert.equal((await runResearchWorker(job(5),f.deps)).status,'uncertain');
 assert.equal((await runResearchWorker(job(5),f.deps,true)).status,'recovered_author');assert.equal(f.calls.length,1);
});
test('strict output codec rejects exponent domain and unknown/repeated reviewer claims',()=>{
 assert.throws(()=>assertWorkerJsonCodec({value:1e-7}),/codec_unsupported/);assert.throws(()=>assertWorkerJsonCodec({value:1e21}),/codec_unsupported/);assert.doesNotThrow(()=>assertWorkerJsonCodec({value:0.000001}));
 const artifact=normalizeWorkerAuthor(rawAuthor(),author,inputHash('input'),evidence);const review=rawReview(artifact);
 assert.throws(()=>normalizeWorkerReview({...review,claimChecks:[...review.claimChecks,...review.claimChecks]},reviewer.modelVersion,artifact,evidence),/closed_shape/);
 assert.throws(()=>normalizeWorkerReview({...review,claimChecks:[{...review.claimChecks[0],verdict:'arbitrary'}]},reviewer.modelVersion,artifact,evidence),/closed_shape/);
 assert.throws(()=>normalizeWorkerAuthor({...rawAuthor(),model:'caller-choice'},author,inputHash('input'),evidence),/closed_shape/);
});
test('fixed-origin provider performs one actual fetch transport call and never retries uncertain POST',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=(async(input,init)=>{calls++;assert.equal(String(input),'https://api.openai.com/v1/responses');assert.equal(init?.method,'POST');throw Error('synthetic transport interrupted');}) as typeof fetch;
 try {const provider=openAiResponsesProvider('synthetic-test-key');await assert.rejects(provider.invoke({model:'synthetic',instructions:'synthetic',input:'{}',store:true,max_output_tokens:100,text:{format:{type:'json_object'}}},'synthetic',new Date(Date.now()+10000).toISOString()),ProviderOutcomeUncertain);assert.equal(calls,1);}
 finally{globalThis.fetch=previous;}
});

test('explicit known-response lookup recovers immutable output without a second POST',async()=>{
 const f=fixture();f.setPending();assert.equal((await runResearchWorker(job(6),f.deps)).status,'uncertain');assert.equal(f.calls.length,1);
 assert.equal((await runResearchWorker(job(6),f.deps,true)).status,'recovered_author');assert.equal(f.calls.length,1);assert.equal(f.lookups(),1);
});
test('actual expired execution fixture may settle a known response but cannot publish or extend its deadline',async()=>{
 const f=fixture();f.setPending();await runResearchWorker(job(7),f.deps);f.expireInvocation();
 const result=await runResearchWorker(job(7),f.deps,true);assert.equal(result.status,'settled_after_execution_window');assert.equal(result.published,false);
 assert.equal(f.calls.length,1);assert.equal(f.lookups(),1);assert.equal(f.states.get(job(7))!.state,'running');assert.equal([...f.records.values()][0].deadline_at,'2000-01-01T00:00:00Z');
});
