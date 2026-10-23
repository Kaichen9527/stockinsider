import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {inputHash} from './policy.ts';
import {cancellationAnnotation,cancellationContext,assertCancellationScope,type CancellationAnnotation,type CancellationContext} from './catalyst-cancellation.ts';
import {normalizeWorkerAuthor,normalizeWorkerReview} from './worker-output.ts';
import {REQUIRED_SECTIONS,type Artifact,type Claim,type Evidence} from './research.ts';
import {runResearchWorker,type WorkerBinding,type WorkerDependencies,type WorkerRow} from './worker-core.ts';
import {AUTHOR_INSTRUCTIONS,REVIEWER_INSTRUCTIONS,WORKER_PROMPT_VERSION,CATALYST_WORKER_PROFILE,CANCELLATION_WORKER_PROFILE,serverWorkerPromptProfile} from './worker-prompts.ts';
const cutoff='2026-10-23T04:00:00Z',hash=inputHash('synthetic cancellation input'),symbol='2330',anchor='Synthetic issuer November equipment launch',day='2026-11-15';
const revision='00000000-0000-4000-8000-000000000011',jobId='00000000-0000-4000-8000-000000000001';
function fixture(){
 const statements=[`🧪 ${anchor} on ${day} is planned in this synthetic official notice.`,`🧪 ${anchor} on ${day} is explicitly cancelled in this synthetic follow-up notice.`];
 const evidence:Evidence[]=statements.map((statement,i)=>({id:`content:${i}`,key:'reported_event',value:{scope:'official_original',originSource:'official',claimStatus:'reported',eventBasis:'source_publication',statement,publishedAt:`2026-10-${20+i*2}T01:00:00Z`,originalContentHash:inputHash(statement)},contentHash:inputHash(statement),source:'https://example.invalid/synthetic-official',sourceTier:'public',kind:'assumption',eventAt:`2026-10-${20+i*2}T01:00:00Z`,availableAt:`2026-10-${20+i*2}T02:00:00Z`}));
 const locator=(i:number)=>({evidenceId:evidence[i].id,contentHash:evidence[i].contentHash,field:'statement' as const,startCp:0,endCp:Array.from(statements[i]).length,quote:statements[i]});
 const annotation:CancellationAnnotation={schemaVersion:'vnext-catalyst-cancellation-v1',symbol,catalystAt:day,catalystIdentity:anchor,baselineRevisionId:null,baselineClaimId:null,planned:locator(0),cancelled:locator(1)};
 const claim:Claim={id:'cancellation',text:'Synthetic source reports cancellation of this precise catalyst; this is not formal semantic approval.',kind:'assumption',evidenceIds:evidence.map(e=>e.id),cancellation:annotation};
 const raw={sections:Object.fromEntries(REQUIRED_SECTIONS.map(name=>[name,{text:'Synthetic research protocol fixture; numeric valuation authority is missing.',evidenceIds:evidence.map(e=>e.id),claimIds:[claim.id]}])),claims:[claim],quoteDate:'2026-10-22',valuationDate:'2026-10-22',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing','quote_authority_missing','valuation_authority_missing']};
 const context:CancellationContext={schemaVersion:'vnext-cancellation-context-v1',symbol,inputHash:hash,baseline:null};
 const scope={symbol,inputHash:hash,cutoff,evidence};
 const review=(artifact:Artifact)=>({approved:true,findings:[] as string[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:artifact.claims.map(c=>({claimId:c.id,verdict:'supported',reason:'Synthetic independent execution read both exact originals; semantic accuracy remains unverified.',sources:c.evidenceIds.map(id=>({id,contentHash:evidence.find(e=>e.id===id)!.contentHash})),cancellationAssessment:{schemaVersion:'vnext-catalyst-cancellation-assessment-v1',annotation:c.cancellation,assessment:'supported_explicit_report',reason:'Synthetic explicit planned and cancelled original pair refers to the same unique launch and date.'}}))});
 return {evidence,annotation,claim,raw,context,scope,review};
}
const author:WorkerBinding={identity:{principal:'synthetic-author',role:'author'},provider:'openai-responses',model:'synthetic-author',modelVersion:'synthetic-only',credentialIdentity:'a'.repeat(64),promptVersion:CANCELLATION_WORKER_PROFILE.version,instructions:CANCELLATION_WORKER_PROFILE.author};
const reviewer:WorkerBinding={...author,identity:{principal:'synthetic-reviewer',role:'reviewer'},model:'synthetic-reviewer',instructions:CANCELLATION_WORKER_PROFILE.reviewer};
test('whole author/reviewer normalizers preserve exact synthetic original-pair annotation and echo',()=>{
 const f=fixture(),a=normalizeWorkerAuthor(f.raw,author,hash,f.evidence),r=normalizeWorkerReview(f.review(a),reviewer.modelVersion,a,f.evidence);
 assert.deepEqual(a.claims[0].cancellation,f.annotation);assert.equal(r.approved,true);assert.doesNotThrow(()=>assertCancellationScope(a,f.context,f.scope));
 assert.equal(Array.from(f.annotation.planned.quote)[0],'🧪');assert.equal(f.annotation.planned.endCp,f.annotation.planned.quote.length-1);
});
test('wrong offsets, date tokens, duplicate source and reversed publication cannot bind cancellation',()=>{
 for(const mutation of [(f:ReturnType<typeof fixture>)=>{f.annotation.planned.startCp=1;},(f:ReturnType<typeof fixture>)=>{f.annotation.catalystAt='2026-02-30';},(f:ReturnType<typeof fixture>)=>{f.annotation.cancelled={...f.annotation.planned};},(f:ReturnType<typeof fixture>)=>{(f.evidence[0].value as Record<string,unknown>).publishedAt='2026-10-23T01:00:00Z';},(f:ReturnType<typeof fixture>)=>{f.annotation.catalystAt='2026-11-16';}]){const f=fixture();mutation(f);assert.throws(()=>normalizeWorkerAuthor(f.raw,author,hash,f.evidence),/cancellation/);}
});
test('numeric, rumor, operator and future-available evidence cannot become cancellation authority',()=>{
 for(const mutation of [(f:ReturnType<typeof fixture>)=>{f.claim.numeric={value:1,unit:'ratio',period:'2026',key:'cancelled'};},(f:ReturnType<typeof fixture>)=>{(f.evidence[1].value as Record<string,unknown>).claimStatus='rumor';},(f:ReturnType<typeof fixture>)=>{f.evidence[1].sourceTier='operator';},(f:ReturnType<typeof fixture>)=>{(f.evidence[1].value as Record<string,unknown>).approved=true;},(f:ReturnType<typeof fixture>)=>{f.evidence[1].availableAt='2026-10-24T00:00:00Z';}]){const f=fixture();mutation(f);assert.throws(()=>assertCancellationScope({claims:[f.claim]},f.context,f.scope),/cancellation/);}
});
test('closed schema rejects numeric symbol, extra fields and cross-issuer packet',()=>{
 const f=fixture();assert.throws(()=>cancellationAnnotation({...f.claim,cancellation:{...f.annotation,symbol:2330} as unknown as CancellationAnnotation},f.evidence),/invalid/);
 assert.throws(()=>cancellationContext({...f.context,approved:true},f.scope),/invalid/);assert.throws(()=>cancellationContext({...f.context,symbol:'2408'},f.scope),/invalid/);
 assert.throws(()=>cancellationAnnotation({...f.claim,cancellation:{...f.annotation,planned:{...f.annotation.planned,approved:true}} as CancellationAnnotation},f.evidence),/invalid/);
});
function baselineFixture(){const f=fixture();f.annotation.baselineRevisionId=revision;f.annotation.baselineClaimId='prior-catalyst';const prior:Claim={id:'prior-catalyst',text:'Synthetic prior launch plan.',kind:'assumption',evidenceIds:[f.evidence[0].id],semantic:{schemaVersion:'vnext-catalyst-annotation-v1',criterion:'catalyst_dated',outcome:'met',symbol,evidenceId:f.evidence[0].id,contentHash:f.evidence[0].contentHash,field:'statement',startCp:0,endCp:f.annotation.planned.endCp,quote:f.annotation.planned.quote,catalystAt:day,catalystIdentity:anchor}};f.context.baseline={revisionId:revision,inputHash:inputHash('prior input'),outputHash:inputHash('prior artifact'),publishedAt:'2026-10-21T01:00:00Z',cutoff:'2026-10-20T04:00:00Z',claims:[prior],evidence:[structuredClone(f.evidence[0])]};return f;}
test('prior baseline binds actual retained met dated/verified claim and structurally identical current original',()=>{
 const f=baselineFixture();assert.doesNotThrow(()=>assertCancellationScope({claims:[f.claim]},f.context,f.scope));
 f.evidence[0].source='https://example.invalid/changed-source';assert.throws(()=>assertCancellationScope({claims:[f.claim]},f.context,f.scope),/baseline_mismatch/);
 for(const mutation of [(v:ReturnType<typeof baselineFixture>)=>{v.context.baseline!.claims[0].semantic!.outcome='not_met';},(v:ReturnType<typeof baselineFixture>)=>{v.annotation.baselineRevisionId=jobId;},(v:ReturnType<typeof baselineFixture>)=>{v.context.baseline!.claims=[];v.context.baseline!.evidence=[];}]){const g=baselineFixture();mutation(g);assert.throws(()=>assertCancellationScope({claims:[g.claim]},g.context,g.scope),/baseline/);}
});
test('unsupported/insufficient cancellation, altered echo, or assessment without annotation cannot approve',()=>{
 const f=fixture(),a=normalizeWorkerAuthor(f.raw,author,hash,f.evidence);
 for(const assessment of ['unsupported','insufficient']){const r=f.review(a);r.claimChecks[0].cancellationAssessment.assessment=assessment;assert.throws(()=>normalizeWorkerReview(r,reviewer.modelVersion,a,f.evidence),/cancellation/);r.approved=false;r.findings=['Synthetic unsupported relation.'];assert.doesNotThrow(()=>normalizeWorkerReview(r,reviewer.modelVersion,a,f.evidence));}
 const ordinary=structuredClone(f.raw);delete ordinary.claims[0].cancellation;const without=normalizeWorkerAuthor(ordinary,author,hash,f.evidence);assert.throws(()=>normalizeWorkerReview(f.review(a),reviewer.modelVersion,without,f.evidence),/cancellation_annotation_missing/);
 const r=f.review(a);r.claimChecks[0].cancellationAssessment.annotation={...f.annotation,catalystAt:'2026-11-16'};assert.throws(()=>normalizeWorkerReview(r,reviewer.modelVersion,a,f.evidence),/cancellation/);
});
test('synthetic review reason length counts Unicode codepoints rather than UTF16 units',()=>{
 const f=fixture(),artifact=normalizeWorkerAuthor(f.raw,author,hash,f.evidence),review=f.review(artifact);
 review.claimChecks[0].cancellationAssessment.reason='🧪'.repeat(10);assert.throws(()=>normalizeWorkerReview(review,reviewer.modelVersion,artifact,f.evidence),/cancellation/);
 review.claimChecks[0].cancellationAssessment.reason='🧪'.repeat(20);assert.doesNotThrow(()=>normalizeWorkerReview(review,reviewer.modelVersion,artifact,f.evidence));
});
function workerFixture(profile='vnext-research-worker-v4',changeReviewerContext=false){
 const f=fixture(),bindings={author:{...author,promptVersion:profile},reviewer:{...reviewer,promptVersion:profile}},records=new Map<string,WorkerRow>(),calls:string[]=[],receipts:string[]=[];const state:WorkerRow={state:'running',prepared:true,inputHash:hash,executionId:'00000000-0000-4000-8000-000000000002'};let seq=0;
 const deps:WorkerDependencies={...bindings,withWriterLease:async w=>w(),prepare:async()=>{throw Error('not expected');},
  journal:async(identity,action,body)=>{const b=bindings[identity.role as 'author'|'reviewer'];if(action==='binding')return {provider:b.provider,model:b.model,model_version:b.modelVersion,credential_identity:b.credentialIdentity,prompt_version:b.promptVersion,instructions:b.instructions};if(action==='inspect')return {...state};if(action==='read')return {...records.get(identity.role)};let r=records.get(identity.role);if(action==='reserve'){if(r)return {...r,dispatch:false};const ctx=structuredClone(f.context);if(changeReviewerContext&&identity.role==='reviewer')ctx.baseline={revisionId:revision,inputHash:inputHash('prior'),outputHash:inputHash('prior output'),publishedAt:'2026-10-21T01:00:00Z',cutoff:'2026-10-20T04:00:00Z',claims:[],evidence:[]};const frozen={symbol,inputHash:hash,jobId,executionId:body.executionId,task:identity.role,evidence:{cutoff,evidence:f.evidence},cancellationContext:ctx,...(identity.role==='reviewer'?{authorArtifact:state.authorArtifact}:{})};r={invocation_id:`synthetic-${++seq}`,job_id:jobId,execution_id:body.executionId,principal:identity.principal,task:identity.role,input_hash:hash,provider:b.provider,model:b.model,model_version:b.modelVersion,credential_identity:b.credentialIdentity,prompt_version:b.promptVersion,state:'dispatching',deadline_at:new Date(Date.now()+120000).toISOString(),frozen_request:{input:JSON.stringify(frozen),model:b.model,instructions:b.instructions}};records.set(identity.role,r);return {...r,dispatch:true};}assert.ok(r);if(action==='settle'){r.state=body.status;r.provider_response_id=body.responseId;if(body.status==='completed')r.normalized_output=identity.role==='author'?normalizeWorkerAuthor(body.output,b,hash,f.evidence):normalizeWorkerReview(body.output,b.modelVersion,state.authorArtifact as Artifact,f.evidence);return {...r};}throw Error('unexpected journal');},
  command:async(_i,action)=>{if(action==='review-claim'){state.state='reviewing';state.reviewerExecutionId='00000000-0000-4000-8000-000000000003';}else assert.equal(action,'review-sources');return {};},
  authorReceipt:async(_i,b)=>{receipts.push('author');state.authorArtifact=b.artifact;state.state='authored';return {};},reviewReceipt:async(_i,b)=>{receipts.push('reviewer');state.review=b.review;return {};},publish:async()=>{receipts.push('publish');state.state='published';return {revisionId:revision};},
  provider:{invoke:async request=>{calls.push(request.model);const packet=JSON.parse(request.input);return {status:'completed',responseId:`resp_synthetic_${calls.length}`,raw:{synthetic:true},output:request.model===author.model?f.raw:f.review(packet.authorArtifact)};},lookup:async()=>{throw Error('no lookup expected');}}};
 return {deps,calls,receipts,records};
}
test('actual worker calls distinct synthetic author/reviewer once with same context and stores both normalized receipts',async()=>{
 const f=workerFixture();assert.equal((await runResearchWorker(jobId,f.deps)).status,'published');assert.deepEqual(f.calls,[author.model,reviewer.model]);assert.deepEqual(f.receipts,['author','reviewer','publish']);assert.equal((await runResearchWorker(jobId,f.deps)).replay,true);assert.equal(f.calls.length,2);
});
test('changed reviewer baseline blocks before second provider call; legacy profiles cannot submit cancellation',async()=>{
 const f=workerFixture('vnext-research-worker-v4',true);assert.equal((await runResearchWorker(jobId,f.deps)).stage,'cancellation_server_context');assert.equal(f.calls.length,1);assert.deepEqual(f.receipts,['author']);
 for(const profile of ['vnext-research-worker-v2','vnext-research-worker-v3']){const g=workerFixture(profile);assert.equal((await runResearchWorker(jobId,g.deps)).status,'failed');assert.equal(g.calls.length,1);assert.equal(g.receipts.length,0);}
});
test('v4 committed settlement response loss recovers only by explicit read without another author invocation',async()=>{
 const f=workerFixture(),journal=f.deps.journal;let lost=false;f.deps.journal=async(identity,action,body)=>{const receipt=await journal(identity,action,body);if(action==='settle'&&identity.role==='author'&&!lost){lost=true;throw Error('Synthetic committed settlement HTTP response lost.');}return receipt;};
 assert.equal((await runResearchWorker(jobId,f.deps)).stage,'provider_settlement_receipt');assert.equal(f.calls.length,1);assert.equal((await runResearchWorker(jobId,f.deps)).status,'recovery_required');
 assert.equal((await runResearchWorker(jobId,f.deps,true)).status,'recovered_author');assert.equal(f.calls.length,1);assert.equal((await runResearchWorker(jobId,f.deps)).status,'published');assert.equal(f.calls.length,2);
});
test('reviewer cannot reuse the author external response identity for an independent execution',async()=>{
 const f=workerFixture(),invoke=f.deps.provider.invoke;f.deps.provider.invoke=async(...args)=>{const outcome=await invoke(...args);return outcome.status==='completed'?{...outcome,responseId:'resp_synthetic_reused'}:outcome;};
 await assert.rejects(runResearchWorker(jobId,f.deps),/response_identity_reused/);assert.deepEqual(f.receipts,['author']);assert.equal(f.calls.length,2);
});
test('calendar clamp, late report and current publication ordering remain explicit',()=>{
 const f=fixture();f.annotation.catalystAt='2027-02-28';
 for(let i=0;i<2;i++){const e=f.evidence[i],v=e.value as Record<string,unknown>;v.statement=(v.statement as string).replace(day,f.annotation.catalystAt);v.originalContentHash=inputHash(v.statement);e.contentHash=v.originalContentHash as string;e.eventAt=i===0?'2026-11-30T01:00:00Z':'2026-12-01T01:00:00Z';e.availableAt=i===0?'2026-11-30T02:00:00Z':'2026-12-01T02:00:00Z';v.publishedAt=e.eventAt;const l=i===0?f.annotation.planned:f.annotation.cancelled;l.contentHash=e.contentHash;l.quote=v.statement as string;l.endCp=Array.from(l.quote).length;}
 const scope={...f.scope,cutoff:'2027-03-02T04:00:00Z'};assert.doesNotThrow(()=>assertCancellationScope({claims:[f.claim]},f.context,scope));
 f.annotation.catalystAt='2027-03-01';for(let i=0;i<2;i++){const e=f.evidence[i],v=e.value as Record<string,unknown>;v.statement=(v.statement as string).replace('2027-02-28','2027-03-01');e.contentHash=inputHash(v.statement);v.originalContentHash=e.contentHash;const l=i===0?f.annotation.planned:f.annotation.cancelled;l.contentHash=e.contentHash;l.quote=v.statement as string;l.endCp=Array.from(l.quote).length;}assert.throws(()=>assertCancellationScope({claims:[f.claim]},f.context,scope),/cancellation/);
 const g=baselineFixture();g.context.baseline!.publishedAt='2026-10-23T03:00:00Z';assert.throws(()=>assertCancellationScope({claims:[g.claim]},g.context,g.scope),/baseline_order/);
 const h=fixture();assert.throws(()=>assertCancellationScope({claims:[h.claim,{...h.claim,id:'second-cancellation'}]},h.context,h.scope),/claims_missing/);
});
test('v2/v3 exact old prompt bytes/default retained; v4 only trusted server configuration',()=>{
 assert.deepEqual([AUTHOR_INSTRUCTIONS,REVIEWER_INSTRUCTIONS,CATALYST_WORKER_PROFILE.author,CATALYST_WORKER_PROFILE.reviewer].map(value=>createHash('sha256').update(value).digest('hex')),["c9702f13c8cfc12b7a87de06320b98c6a6e5a103a3eb5c8b046d7e895ad6b9fd", "b46cea03906e93147daf1bf5e5cf2892859a77ea04fc935aa603d83bacd0a4b8", "e9fd13b01b3d961cd612f1ef44136f07b7538ebcaae6142f2cedf21d96877803", "9c5d0ccd2ef984d9924bf92eb59a70a3ba1bccdefb3d1086b783570d67f96f69"]);
 assert.equal(WORKER_PROMPT_VERSION,'vnext-research-worker-v2');assert.ok(CANCELLATION_WORKER_PROFILE.author.startsWith(CATALYST_WORKER_PROFILE.author+'\n'));assert.ok(CANCELLATION_WORKER_PROFILE.reviewer.startsWith(CATALYST_WORKER_PROFILE.reviewer+'\n'));
 const old=process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION;try{delete process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION;assert.equal(serverWorkerPromptProfile().version,WORKER_PROMPT_VERSION);process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION='vnext-research-worker-v4';assert.equal(serverWorkerPromptProfile(),CANCELLATION_WORKER_PROFILE);process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION='caller-model';assert.throws(serverWorkerPromptProfile,/unsupported/);}finally{if(old===undefined)delete process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION;else process.env.STOCKINSIDER_VNEXT_WORKER_PROMPT_VERSION=old;}
});
