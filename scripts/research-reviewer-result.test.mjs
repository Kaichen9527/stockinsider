import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {runResearchReviewerResult,readResearchReviewerResultBody,handleResearchReviewerResult} from '../web/src/lib/research-reviewer-result.ts';
import {validateResearchEditorialReview} from '../web/src/lib/research-editorial-review.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {reviewerResultFixture,syntheticReviewCredentials,canonicalSizedEditorialReview} from './research-reviewer-result-fixture.mjs';
const keys=['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'];
function env(t){const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];Object.assign(process.env,syntheticReviewCredentials);t.after(()=>{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});}
const http=()=>new Request('http://localhost/synthetic',{headers:{authorization:'Bearer '+syntheticReviewCredentials.RESEARCH_REVIEW_KEY}});
const wire=(body,action='receiveReviewerResult',headers={})=>new Request('http://localhost/synthetic',{method:'POST',headers:{'content-type':'application/json','x-research-review-result-action':action,...headers},body});
for(const symbol of ['2409','2383'])test(symbol+' exact review result/read/replay with actual calculation and synthetic transport',async t=>{
 env(t);const f=await reviewerResultFixture(symbol),c=structuredClone(f.context);let writes=0;
 const db={rpc(name,args){assert.equal(args.p_author_principal,f.pair.authorPrincipalId);assert.equal(args.p_reviewer_principal,f.pair.reviewerPrincipalId);let data;
 if(name==='read_research_reviewer_result_context_v2')data=structuredClone(c);
 else if(name==='read_research_reviewer_result_sources_v2')data=f.sources;
 else if(name==='receive_research_reviewer_result_v2'){
 writes++;if(c.reviewResult)assert.equal(completeHash(c.reviewResult.payload),completeHash(args.p_result));else{c.reviewResult={result_id:'00000000-0000-4000-8000-000000000009',assignment_id:c.reviewerAssignment.assignment_id,result_hash:completeHash(args.p_result),logical_bytes:Buffer.byteLength(completeCanonical(args.p_result)),received_at:new Date().toISOString(),payload:args.p_result};c.reviewCompletion={reservation_id:c.reviewerAssignment.reservation_id,owner:c.reviewerAssignment.work_owner,outcome:'completed',result_hash:c.reviewResult.result_hash,finished_at:new Date().toISOString()};}data=structuredClone(c.reviewResult);
 }else throw new Error('unexpected '+name);const p=Promise.resolve({data,error:null});return Object.assign(p,{abortSignal:()=>p});}};
 const run=(r=f.request)=>runResearchReviewerResult(db,r,f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,http(),new FinancialDeadline());
 assert.equal((await run({...f.request,action:'readReviewerResult'})).result,null);assert.equal(writes,0);
 const received=await run();assert.equal(received.publishableResearch,false);assert.equal(received.controllerReportOnly,true);assert.deepEqual(received.result.payload,f.envelope);
 assert.deepEqual((await run({...f.request,action:'readReviewerResult'})).result,received.result);assert.equal(writes,1);assert.deepEqual((await run()).result,received.result);assert.equal(writes,2);
 for(const mutate of [r=>r.observation.threadId=c.authorContext.result.payload.observation.threadId,r=>r.observation.invocationId=c.authorContext.result.payload.observation.invocationId,r=>r.observation.controllerObservedStartAt='2026-01-01T00:00:00Z',r=>r.review.strongestCounterEvidence+='changed',r=>r.review.reviewPackHash='f'.repeat(64),r=>r.observation.outputHash='f'.repeat(64)]){const bad=structuredClone(f.request);mutate(bad);await assert.rejects(run(bad));assert.equal(writes,2);}
 for(const mutate of [x=>x.reviewCompletion=null,x=>x.reviewCompletion.result_hash='f'.repeat(64),x=>x.authorContext.assignment.controller_principal='f'.repeat(64),x=>x.authorContext.result.payload.validatedArticle.calculatorExecutionHash='f'.repeat(64),x=>x.reviewResult.payload.packet.articleHash='f'.repeat(64)]){
 const bad=structuredClone(c);mutate(bad);const mock={rpc(name){assert.notEqual(name,'receive_research_reviewer_result_v2');const p=Promise.resolve({data:name==='read_research_reviewer_result_context_v2'?bad:f.sources,error:null});return Object.assign(p,{abortSignal:()=>p});}};await assert.rejects(runResearchReviewerResult(mock,f.request,f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,http(),new FinancialDeadline()));}
});
test('closed review checks, exact article/packet, selected IDs and decision semantics',async()=>{
 const f=await reviewerResultFixture();assert.equal(validateResearchEditorialReview(f.packet,f.request.review,new Date().toISOString()).validationStatus,'contract_valid_only');
 for(const mutate of [r=>r.extra=true,r=>r.checks.push(r.checks[0]),r=>r.checks[1].category=r.checks[0].category,r=>r.checks[0].paragraphIds=['unknown'],r=>r.checks[0].rationale='short',r=>r.checks[0].status='concern',r=>r.decision='revision_required',r=>r.findings=[{severity:'major',paragraphId:null,issue:'足夠長度的合成審查問題說明，僅為測試不得當實際研究。',sourceIds:[]}],r=>r.strongestCounterEvidence='cookie=synthetic',r=>r.reviewedAt='2039-01-01T00:00:00Z']){const r=structuredClone(f.request.review);mutate(r);assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));}
 const r=structuredClone(f.request.review);r.decision='revision_required';r.checks[0].status='concern';assert.equal(validateResearchEditorialReview(f.packet,r,new Date().toISOString()).review.decision,'revision_required');
});
for(const action of ['receiveReviewerResult','readReviewerResult'])test(action+' exact wire limit/+1, strict closed JSON UTF8 mixedheaders/deadline',async()=>{
 const f=await reviewerResultFixture(),b=action==='readReviewerResult'?Object.fromEntries(Object.entries({...f.request,action}).filter(([k])=>!['review','observation'].includes(k))):f.request;
 const encoded=JSON.stringify(b),max=action==='readReviewerResult'?8192:1048576,raw=encoded+' '.repeat(max-Buffer.byteLength(encoded));assert.equal((await readResearchReviewerResultBody(wire(raw,action),new FinancialDeadline())).action,action);
 for(const bad of [raw+' ',encoded.replace('"action":','"\\u0061ction":"'+action+'","action":'),new Uint8Array([0xff])])await assert.rejects(readResearchReviewerResultBody(wire(bad,action),new FinancialDeadline()));
 for(const header of ['x-research-author-result-action','x-research-author-handoff-action','x-research-review-assignment-action'])await assert.rejects(readResearchReviewerResultBody(wire(encoded,action,{[header]:'mixed'}),new FinancialDeadline()));
 let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),r=new Request('http://localhost/synthetic',{method:'POST',headers:{'content-type':'application/json','x-research-review-result-action':action},body:stream,duplex:'half'}),d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+20});await assert.rejects(readResearchReviewerResultBody(r,d),/financial_deadline/);assert.equal(cancelled,true);
});
test('author/cron/test/unknown cannot enter reviewer body, expired result starts no I/O',async t=>{
 env(t);process.env.CRON_SECRET='synthetic-C';process.env.RESEARCH_TEST_KEY='synthetic-T';for(const credential of [syntheticReviewCredentials.INTERNAL_API_KEY,'synthetic-C','synthetic-T','synthetic-unknown',''])assert.equal((await handleResearchReviewerResult(wire('{}','receiveReviewerResult',{authorization:'Bearer '+credential}))).status,401);
 assert.equal((await handleResearchReviewerResult(wire('{}','receiveReviewerResult',{authorization:'Bearer '+syntheticReviewCredentials.RESEARCH_REVIEW_KEY}))).status,400);
 const f=await reviewerResultFixture(),d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()-1});let io=0;await assert.rejects(runResearchReviewerResult({rpc(){io++;throw Error();}},f.request,f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,http(),d),/financial_deadline/);assert.equal(io,0);
});

test('closed editorial enums and paragraphId reject array/object/null coercions before receive',async t=>{
 env(t);const f=await reviewerResultFixture();
 for(const field of ['decision','status','severity','paragraphId'])for(const value of [[],[field==='paragraphId'?'summary':field==='status'?'concern':field==='severity'?'major':'accepted'],{},null]){
   const r=structuredClone(f.request.review);r.findings=[{severity:'minor',paragraphId:'summary',issue:'這是足夠長度的合成測試檢查文字，不代表實際引用查證。',sourceIds:[]}];
   if(field==='decision')r.decision=value;else if(field==='status')r.checks[0].status=value;else r.findings[0][field]=value;
   if(field==='paragraphId'&&value===null){assert.doesNotThrow(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));continue;}
   assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));let receive=0;
   const db={rpc(name){if(name==='receive_research_reviewer_result_v2')receive++;const p=Promise.resolve({data:name==='read_research_reviewer_result_context_v2'?f.context:f.sources,error:null});return Object.assign(p,{abortSignal:()=>p});}};
   await assert.rejects(runResearchReviewerResult(db,{...f.request,review:r},f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,http(),new FinancialDeadline()));assert.equal(receive,0);
 }
});

test('shared canonical65536 UTF8 exact/+1 including Chinese/escaping, wire JSON basis separate',async()=>{
 const f=await reviewerResultFixture();const exact=canonicalSizedEditorialReview(f.request.review);assert.equal(Buffer.byteLength(completeCanonical(exact)),65536);assert.notEqual(Buffer.byteLength(JSON.stringify(exact)),65536);assert.equal(validateResearchEditorialReview(f.packet,exact,new Date().toISOString()).review.decision,'accepted');
 const over=structuredClone(exact);over.strongestCounterEvidence+='a';assert.equal(Buffer.byteLength(completeCanonical(over)),65537);assert.throws(()=>validateResearchEditorialReview(f.packet,over,new Date().toISOString()));
});

test('Unicode scalar text limits agree with PostgreSQL characters, astral min/max explicit',async()=>{
 const f=await reviewerResultFixture(),r=structuredClone(f.request.review);r.strongestCounterEvidence='😀'.repeat(20);assert.doesNotThrow(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));r.strongestCounterEvidence='😀'.repeat(19);assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));r.strongestCounterEvidence='😀'.repeat(4000);assert.doesNotThrow(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));r.strongestCounterEvidence+='😀';assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));
});

 test('review text rejects ECMAScript whitespace-only and untrimmed over-limit prose',async()=>{
 const f=await reviewerResultFixture();for(const n of [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]){const r=structuredClone(f.request.review);r.strongestCounterEvidence=String.fromCodePoint(n).repeat(20);assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));}
 const r=structuredClone(f.request.review);r.checks[0].rationale='a'.repeat(2000)+' ';assert.throws(()=>validateResearchEditorialReview(f.packet,r,new Date().toISOString()));
});
